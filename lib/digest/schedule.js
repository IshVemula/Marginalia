'use strict';

/* Vercel cron runs on UTC, but the email should go out at a New York hour all year. New York is UTC-4 in
   summer and UTC-5 in winter, so we register a cron for every UTC hour that could be a send-window hour
   in either season. The function itself checks the real New York hour and does nothing outside the window.

   On the free (Hobby) plan each cron fires somewhere inside its hour, and runs after the first are
   automatic retries: once today's digest is sent, the later ones do nothing. */

const CRON_PATH = '/api/morning-digest';
const DEFAULT_SEND_HOUR = 7;      // earliest New York hour a digest may go out (the target)
const DEFAULT_LATEST_HOUR = 11;   // last New York hour it may go out: nothing is sent after 11:59 AM

/** UTC hours that fall inside [sendHour, latestHour] New York time, in summer (UTC-4) or winter (UTC-5). */
function utcHoursFor(sendHour, latestHour) {
  const hours = new Set();
  for (let hour = sendHour; hour <= latestHour; hour += 1) {
    hours.add((hour + 4) % 24);
    hours.add((hour + 5) % 24);
  }
  return [...hours].sort((a, b) => a - b);
}

function cronEntries(sendHour = DEFAULT_SEND_HOUR, latestHour = DEFAULT_LATEST_HOUR) {
  return utcHoursFor(sendHour, latestHour).map((hour) => ({ path: CRON_PATH, schedule: `0 ${hour} * * *` }));
}

module.exports = { CRON_PATH, DEFAULT_SEND_HOUR, DEFAULT_LATEST_HOUR, utcHoursFor, cronEntries };
