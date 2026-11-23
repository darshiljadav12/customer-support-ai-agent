/**
 * Smooths a bursty text stream into a steady, natural "typing" reveal.
 *
 * LLM streams (especially free models) arrive in uneven chunks: nothing for
 * 500ms, then 300 characters at once. Rendering chunks as they arrive looks
 * jerky. Instead we buffer incoming text and reveal it every animation frame
 * at an adaptive speed:
 *
 *   speed (chars/sec) = max(MIN_CPS, backlog / lag)
 *
 * A big backlog reveals fast, a small one slowly, so the display stays within
 * ~`lagMs` of the network while motion stays continuous between bursts. Once
 * the stream has finished, `finish()` drains the rest with a shorter lag.
 *
 * @param {(visibleText: string) => void} onUpdate  called at most once per frame
 */
export function createTypewriter(onUpdate, { lagMs = 600, finishLagMs = 220, minCps = 45 } = {}) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let target = '' // everything received so far
  let shown = 0 // characters currently displayed
  let position = 0 // fractional reveal position
  let frame = null
  let lastTime = 0
  let finishing = false
  let resolveDrained = null

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(tick)
  }

  const drained = () => {
    resolveDrained?.()
    resolveDrained = null
  }

  function flush() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    position = shown = target.length
    onUpdate(target)
    drained()
  }

  function tick(now) {
    frame = null
    // Clamp the frame delta so a backgrounded tab doesn't cause a giant jump.
    const dt = lastTime ? Math.min(now - lastTime, 100) / 1000 : 0
    lastTime = now

    const backlog = target.length - position
    if (backlog > 0) {
      const lag = (finishing ? finishLagMs : lagMs) / 1000
      const cps = Math.max(minCps, backlog / lag)
      position = Math.min(target.length, position + cps * dt)

      let next = Math.floor(position)
      // Never split an emoji / surrogate pair.
      const code = target.charCodeAt(next - 1)
      if (code >= 0xd800 && code <= 0xdbff) next += 1
      if (next > shown) {
        shown = next
        position = Math.max(position, shown)
        onUpdate(target.slice(0, shown))
      }
    }

    if (shown < target.length) schedule()
    else {
      lastTime = 0 // idle until the next chunk arrives
      if (finishing) drained()
    }
  }

  return {
    /** Add newly received text. */
    push(text) {
      target += text
      if (reducedMotion || document.hidden) flush()
      else schedule()
    },
    /** Stream ended: reveal the rest quickly. Resolves once everything is shown. */
    finish() {
      finishing = true
      return new Promise((resolve) => {
        resolveDrained = resolve
        if (shown >= target.length || reducedMotion || document.hidden) flush()
        else schedule()
      })
    },
    /** Show everything received immediately (e.g. user pressed Stop). */
    flush,
    /** Stop animating without showing more (e.g. on error). */
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      drained()
    },
  }
}
