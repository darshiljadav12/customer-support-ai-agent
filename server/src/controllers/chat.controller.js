import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { HttpError } from '../utils/HttpError.js';
import { generateReply, streamReply } from '../services/ai.service.js';
import { config } from '../config/index.js';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid conversation id');

export const sendSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000, 'Message is too long (max 4000 characters)'),
  conversationId: objectId.optional(),
});

// Loads a conversation only if it belongs to the current user. Someone else's
// id gives the same 404 as a non-existent one, so ids can't be probed.
async function findOwnedConversation(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Conversation not found');
  const conversation = await Conversation.findOne({ _id: id, user: userId });
  if (!conversation) throw new HttpError(404, 'Conversation not found');
  return conversation;
}

function makeTitle(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

/** Existing conversation (ownership-checked) + recent messages as AI context. */
async function loadContext(conversationId, userId) {
  if (!conversationId) return { conversation: null, history: [] };
  const conversation = await findOwnedConversation(conversationId, userId);
  const recent = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(config.ai.historyLimit)
    .lean();
  return { conversation, history: recent.reverse().map(({ role, content }) => ({ role, content })) };
}

/** Persists one user message + assistant reply and bumps the conversation. */
async function saveExchange({ conversation, userId, message, reply, model, stopped }) {
  const now = Date.now();
  const [userMessage, assistantMessage] = await Message.insertMany([
    { conversation: conversation._id, user: userId, role: 'user', content: message, createdAt: new Date(now) },
    {
      conversation: conversation._id,
      user: userId,
      role: 'assistant',
      content: reply,
      model,
      ...(stopped && { stopped: true }),
      createdAt: new Date(now + 1), // guarantees ordering
    },
  ]);
  conversation.lastMessageAt = assistantMessage.createdAt;
  await conversation.save();
  return { userMessage, assistantMessage };
}

// POST /chat/send  { message, conversationId? }  → full reply as JSON
export async function sendMessage(req, res) {
  const { message, conversationId } = req.body;
  const userId = req.user._id;

  let { conversation, history } = await loadContext(conversationId, userId);

  // Ask the AI first. If it fails nothing is saved, so the stored history
  // never contains unanswered messages and the client can simply retry.
  const reply = await generateReply([...history, { role: 'user', content: message }]);

  conversation ??= await Conversation.create({ user: userId, title: makeTitle(message) });
  const { userMessage, assistantMessage } = await saveExchange({
    conversation,
    userId,
    message,
    reply: reply.content,
    model: reply.model,
  });

  res.status(201).json({ conversation, userMessage, reply: assistantMessage });
}

/**
 * POST /chat/send/stream  { message, conversationId? }  → Server-Sent Events
 *
 *   event: meta     data: { conversation, streamId }           (once, first)
 *   event: delta    data: { text }                             (many)
 *   event: done     data: { conversation, userMessage, reply } (completed, or
 *                   stopped by the user → reply.stopped = true)
 *   event: stopped  data: {}                                   (stopped before any text; nothing saved)
 *   event: error    data: { message }                          (failure mid-stream)
 *
 * Errors before the stream starts (validation, 404, AI busy) are normal JSON
 * responses with a proper status code.
 *
 * Stopping: the client calls POST /chat/stop/:streamId and keeps reading.
 * The server aborts the AI request, saves exactly the text it has already
 * sent, and confirms with `done` — so what the user saw is what gets saved.
 *
 * Persistence rules:
 *   - completed                 → save user message + reply
 *   - stopped (user or dropped) → save user message + partial reply
 *                                 (stopped: true), only if some text was sent
 *   - AI error mid-stream       → save nothing
 */

// Streams in progress on this server instance: streamId → { userId, stop }.
// In-memory is fine for a single instance (Render free tier); several
// instances would need a shared store (e.g. Redis) for /chat/stop.
const activeStreams = new Map();

// POST /chat/stop/:streamId → ask a running stream (of this user) to stop.
export function stopStream(req, res) {
  const entry = activeStreams.get(req.params.streamId);
  // Same 404 for unknown/finished streams and other users' streams.
  if (!entry || entry.userId !== req.user._id.toString()) throw new HttpError(404, 'Stream not found');
  entry.stop();
  res.status(202).json({ stopping: true });
}

export async function streamMessage(req, res) {
  const { message, conversationId } = req.body;
  const userId = req.user._id;

  const { conversation: existing, history } = await loadContext(conversationId, userId);

  // Aborts the upstream AI request: when the client goes away, or when the
  // user presses Stop (POST /chat/stop/:streamId).
  const clientAbort = new AbortController();
  let stoppedByUser = false;
  res.on('close', () => {
    if (!res.writableFinished) clientAbort.abort();
  });

  const aiMessages = [...history, { role: 'user', content: message }];
  // Throws an HttpError (→ JSON response) if OpenRouter rejects the request.
  let chunks = await streamReply(aiMessages, clientAbort.signal);

  // ---- From here on we're streaming SSE ----
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell hosting proxies (Render, Railway, nginx…) not to buffer
  });
  res.flushHeaders();

  const writable = () => !res.writableEnded && !res.destroyed;
  const send = (event, data) => {
    if (writable()) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Comment line every 15s keeps proxies / load balancers from closing an idle stream.
  const heartbeat = setInterval(() => writable() && res.write(': ping\n\n'), 15_000);

  const streamId = randomUUID();
  activeStreams.set(streamId, {
    userId: userId.toString(),
    stop: () => {
      stoppedByUser = true;
      clientAbort.abort();
    },
  });

  let createdConversation = null;
  try {
    const conversation =
      existing ?? (createdConversation = await Conversation.create({ user: userId, title: makeTitle(message) }));
    send('meta', { conversation, streamId });

    let reply = '';
    let model;
    let failure = null;
    // Free models occasionally finish without any text. Nothing has been shown
    // to the user yet in that case, so retry once transparently.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt > 1) chunks = await streamReply(aiMessages, clientAbort.signal);
        for await (const chunk of chunks) {
          model ??= chunk.model;
          reply += chunk.delta;
          send('delta', { text: chunk.delta });
        }
      } catch (err) {
        if (!clientAbort.signal.aborted) failure = err;
      }
      if (reply.trim() || failure || clientAbort.signal.aborted) break;
      console.warn(`[chat] empty stream (attempt ${attempt})`);
    }

    const stopped = clientAbort.signal.aborted;
    reply = reply.trim();

    if (failure || !reply) {
      // Nothing worth keeping → don't leave an empty conversation behind.
      if (createdConversation) await createdConversation.deleteOne();
      if (stoppedByUser) {
        send('stopped', {}); // user stopped before any text arrived
      } else if (!stopped) {
        const error = failure instanceof HttpError ? failure : new HttpError(502, 'The AI returned an empty response. Please try again.');
        if (!(failure instanceof HttpError) && failure) console.error('[chat] stream failed', failure);
        send('error', { message: error.message });
      }
      return;
    }

    const { userMessage, assistantMessage } = await saveExchange({ conversation, userId, message, reply, model, stopped });
    send('done', { conversation, userMessage, reply: assistantMessage });
  } catch (err) {
    // Unexpected (e.g. DB) error after headers were sent → report via SSE.
    console.error('[chat] stream handler error', err);
    if (createdConversation) await createdConversation.deleteOne().catch(() => {});
    send('error', { message: 'Something went wrong. Please try again.' });
  } finally {
    activeStreams.delete(streamId);
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

// GET /chat/history → list of the user's conversations (most recent first)
export async function listConversations(req, res) {
  const conversations = await Conversation.find({ user: req.user._id }).sort({ lastMessageAt: -1 }).limit(100);
  res.json({ conversations });
}

// GET /chat/history/:id → one conversation with all its messages
export async function getConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  res.json({ conversation, messages });
}

// DELETE /chat/history/:id
export async function deleteConversation(req, res) {
  const conversation = await findOwnedConversation(req.params.id, req.user._id);
  await Message.deleteMany({ conversation: conversation._id });
  await conversation.deleteOne();
  res.status(204).end();
}
