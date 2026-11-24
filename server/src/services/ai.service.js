import { config } from '../config/index.js';
import { HttpError } from '../utils/HttpError.js';

export const SYSTEM_PROMPT = `You are a friendly, professional customer support assistant for ${config.ai.appName}.
Guidelines:
- Be concise, warm and solution-oriented. Prefer short paragraphs or bullet steps.
- Ask for relevant details (order number, email, device, error message) when you need them.
- Never invent order details, policies, prices or tracking information. If you don't know, say so and suggest how the customer can find out or contact a human agent.
- Never ask for passwords or full payment card numbers.
- If the request is unrelated to customer support, help briefly and politely.`;

// While streaming: abort if the model goes silent for this long between chunks.
const STREAM_IDLE_TIMEOUT_MS = 30_000;

/** POSTs a chat completion request to OpenRouter. Throws HttpError on failure. */
async function requestCompletion(messages, { stream, signal }) {
  const { apiKey, models, baseUrl, maxTokens, appUrl, appName } = config.ai;
  if (!apiKey) throw new HttpError(503, 'AI service is not configured (missing OPENROUTER_API_KEY)');

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution headers.
        'HTTP-Referer': appUrl,
        'X-Title': appName,
      },
      body: JSON.stringify({
        // A single model → `model`; several → `models` (OpenRouter fallback routing).
        ...(models.length === 1 ? { model: models[0] } : { models }),
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: maxTokens,
        temperature: 0.4,
        // Reasoning models: keep thinking short and don't return it.
        reasoning: { effort: 'low', exclude: true },
        stream,
      }),
    });
  } catch (err) {
    throw toHttpError(err, signal);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw mapProviderError(data?.error?.code ?? res.status, data?.error?.message ?? res.statusText);
  }
  return res;
}

export function mapProviderError(status, message) {
  console.error('[ai] OpenRouter error', status, message);
  if (status === 401 || status === 403) return new HttpError(503, 'AI service authentication failed. Check the API key.');
  if (status === 402) return new HttpError(503, 'AI service credits exhausted.');
  if (status === 429) {
    // The account's daily free quota ("free-models-per-day") is not a
    // momentary hiccup — retrying in a moment won't help, so say so.
    if (/per[-_ ]?day|daily/i.test(String(message ?? ''))) {
      return new HttpError(
        503,
        "The AI assistant has reached today's free usage limit. Please try again tomorrow (the limit resets at 00:00 UTC).",
      );
    }
    return new HttpError(503, 'The AI service is busy right now. Please try again in a moment.');
  }
  return new HttpError(502, 'The AI service returned an error. Please try again.');
}

/** Normalises fetch/abort errors. An HttpError passed as abort reason wins. */
function toHttpError(err, signal) {
  if (signal?.reason instanceof HttpError) return signal.reason;
  if (err instanceof HttpError) return err;
  if (err?.name === 'TimeoutError') return new HttpError(504, 'The AI service took too long to respond. Please try again.');
  if (err?.name === 'AbortError') return new HttpError(499, 'Request aborted');
  return new HttpError(502, 'Could not reach the AI service. Please try again.');
}

/**
 * Non-streaming: sends the conversation and returns the full reply.
 * @param {{role: 'user'|'assistant', content: string}[]} messages  chronological history incl. the new user message
 * @returns {Promise<{content: string, model: string}>}
 */
export async function generateReply(messages) {
  // Free models occasionally return an empty completion → one automatic retry.
  for (let attempt = 1; ; attempt++) {
    const signal = AbortSignal.timeout(config.ai.timeoutMs);
    const res = await requestCompletion(messages, { stream: false, signal });
    const data = await res.json().catch(() => null);

    if (data?.error) throw mapProviderError(data.error.code, data.error.message);

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (content) return { content, model: data.model };

    console.warn(`[ai] Empty completion (attempt ${attempt})`, JSON.stringify(data).slice(0, 300));
    if (attempt >= 2) throw new HttpError(502, 'The AI returned an empty response. Please try again.');
  }
}

/**
 * Streaming: resolves once OpenRouter has accepted the request (so HTTP errors
 * like "rate-limited" can still be returned as a normal JSON error), then
 * yields text chunks as they arrive.
 *
 * @param messages  same as generateReply
 * @param {AbortSignal} signal  aborted when the client disconnects
 * @returns {Promise<AsyncGenerator<{delta: string, model?: string}>>}
 */
export async function streamReply(messages, signal) {
  // Our own controller combines: client disconnect, first-byte timeout, idle timeout.
  const controller = new AbortController();
  const abortWith = (reason) => !controller.signal.aborted && controller.abort(reason);
  const onClientAbort = () => abortWith(new HttpError(499, 'Client disconnected'));
  signal.addEventListener('abort', onClientAbort, { once: true });

  let timer = setTimeout(
    () => abortWith(new HttpError(504, 'The AI service took too long to respond. Please try again.')),
    config.ai.timeoutMs,
  );
  const resetIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => abortWith(new HttpError(504, 'The AI service stopped responding. Please try again.')),
      STREAM_IDLE_TIMEOUT_MS,
    );
  };
  const cleanup = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onClientAbort);
  };

  let res;
  try {
    res = await requestCompletion(messages, { stream: true, signal: controller.signal });
  } catch (err) {
    cleanup();
    throw err;
  }
  resetIdleTimer();

  async function* chunks() {
    try {
      for await (const event of parseSSE(res.body)) {
        resetIdleTimer();
        if (event.error) throw mapProviderError(event.error.code, event.error.message);
        const choice = event.choices?.[0];
        if (choice?.finish_reason === 'error') throw new HttpError(502, 'The AI service returned an error. Please try again.');
        const delta = choice?.delta?.content;
        if (delta) yield { delta, model: event.model };
      }
    } catch (err) {
      throw toHttpError(err, controller.signal);
    } finally {
      cleanup();
      if (!controller.signal.aborted) controller.abort(); // release the upstream connection
    }
  }
  return chunks();
}

/** Parses an SSE byte stream into JSON `data:` payloads (stops at [DONE]). */
async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      // Skip blank lines and comments (OpenRouter sends ": OPENROUTER PROCESSING" keep-alives).
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
        // ignore malformed lines
      }
    }
  }
}
