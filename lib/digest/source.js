'use strict';

/* Reads the planner's saved data from Supabase with the service-role key. READ ONLY: this file only ever
   issues a GET, so it cannot change the record or collide with the site's version (rev) and merge logic.
   The service-role key bypasses row-level security, so it must only ever live in server-side environment
   variables, never in the browser or in the repo. */

async function readWorkspace({ url, key, userId, fetchImpl = fetch }) {
  const filter = userId ? `&user_id=eq.${encodeURIComponent(userId)}` : '';
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/app_state?select=data&limit=2${filter}`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Couldn't read your planner data (Supabase ${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No planner record found. Open the site once and sign in to create it.');
  if (rows.length > 1) throw new Error('Found more than one planner record. Set DIGEST_USER_ID to the one to use.');
  const data = rows[0].data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The saved planner data looks unreadable, so no digest was built.');
  return data;
}

module.exports = { readWorkspace };
