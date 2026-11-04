'use strict';

/* The once-a-day guard. One row per New York date in `digest_log` (see supabase/003_digest_log.sql).
   It is a separate table: the digest never writes to the planner data (`app_state`), so it can't collide
   with the site's version and merge logic.

   A run must CLAIM today's row before it sends:
     - no row yet            -> insert it as 'sending' (the run that inserts it owns the send)
     - 'sent'                -> already done today: stop
     - 'sending', recent     -> another run is on it: stop
     - 'sending', old        -> that run died mid-way: take over (the Resend idempotency key keeps a second
                                send from going out if the first one actually got through)
     - 'failed'              -> an earlier attempt failed: take over and retry
   Taking over is a compare-and-swap on `attempts`, so two runs can never both win. */

const STALE_AFTER_MS = 10 * 60 * 1000;

function createGuard({ url, key, fetchImpl = fetch, now = () => Date.now() }) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/digest_log`;

  async function call(method, query, body, prefer) {
    const response = await fetchImpl(`${endpoint}?${query}`, {
      method,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch (e) { /* not JSON */ }
      const error = new Error(`digest_log ${method} failed (${response.status})${detail ? `: ${detail}` : ''}`);
      error.status = response.status;
      throw error;
    }
    const raw = await response.text();
    return raw ? JSON.parse(raw) : [];
  }

  const stamp = () => new Date(now()).toISOString();
  const trim = (value) => String(value ?? '').slice(0, 300);

  return {
    /** -> { ok: true, attempt } when this run may send, otherwise { ok: false, reason }. */
    async claim(day) {
      const inserted = await call('POST', 'on_conflict=sent_on',
        { sent_on: day, status: 'sending', attempts: 1, claimed_at: stamp(), updated_at: stamp() },
        'resolution=ignore-duplicates,return=representation');
      if (inserted.length === 1) return { ok: true, attempt: 1 };

      const [row] = await call('GET', `sent_on=eq.${day}&select=*`);
      if (!row) return { ok: false, reason: 'lost-race' };
      if (row.status === 'sent') return { ok: false, reason: 'already-sent', row };
      const stale = now() - Date.parse(row.claimed_at) >= STALE_AFTER_MS;
      if (row.status === 'sending' && !stale) return { ok: false, reason: 'in-progress', row };

      const attempt = Number(row.attempts) + 1;
      const taken = await call('PATCH', `sent_on=eq.${day}&status=eq.${row.status}&attempts=eq.${row.attempts}`,
        { status: 'sending', attempts: attempt, claimed_at: stamp(), updated_at: stamp(), detail: null },
        'return=representation');
      return taken.length === 1 ? { ok: true, attempt } : { ok: false, reason: 'lost-race' };
    },

    async markSent(day, detail) {
      await call('PATCH', `sent_on=eq.${day}`, { status: 'sent', detail: trim(detail), updated_at: stamp() });
    },

    async markFailed(day, detail) {
      await call('PATCH', `sent_on=eq.${day}`, { status: 'failed', detail: trim(detail), updated_at: stamp() });
    },

    /** Written by a run after the send window closes when nothing went out, so a missed day leaves a trace. */
    async recordMissed(day, detail) {
      await call('POST', 'on_conflict=sent_on',
        { sent_on: day, status: 'failed', attempts: 0, claimed_at: stamp(), updated_at: stamp(), detail: trim(detail) },
        'resolution=ignore-duplicates,return=representation');
    },
  };
}

module.exports = { createGuard, STALE_AFTER_MS };
