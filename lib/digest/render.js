'use strict';

const { longDate, shortDate } = require('./time');

/* Draws a digest ({ sections, empty }) as an email: HTML (inline styles only, for email clients) plus a plain-text
   fallback. Everything that comes from your data is escaped before it goes into the HTML. */

const INK = '#2a2620';
const MUTED = '#787063';
const FAINT = '#a39a8b';
const LINE = '#e7e0d2';
const BAD = '#a64c34';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const subjectFor = (today) => `Your day: ${shortDate(today)}`;

/* If any row in a group has a time or date, every row gets a lead cell (empty when it has none), so the columns line up.
   width:1% + nowrap makes that column only as wide as its longest entry. */
function htmlRow(row, hasLead) {
  const lead = hasLead
    ? `<td style="width:1%;padding:3px 12px 3px 0;font:12px ${MONO};color:${MUTED};vertical-align:top;white-space:nowrap">${row.lead ? escapeHtml(row.lead) : '&nbsp;'}</td>` : '';
  const tag = row.tag
    ? `<span style="font:12px ${MONO};color:${row.tone === 'bad' ? BAD : FAINT};margin-left:8px">${escapeHtml(row.tag)}</span>` : '';
  return `<tr>${lead}<td style="padding:3px 0;font:15px/1.4 ${SANS};color:${INK};vertical-align:top">${escapeHtml(row.text)}${tag}</td></tr>`;
}

function htmlSection(section) {
  const groups = section.groups.map((group) => {
    const label = group.label
      ? `<div style="font:600 11px ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${FAINT};margin:8px 0 2px">${escapeHtml(group.label)}</div>` : '';
    return `${label}<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${group.rows.map((row) => htmlRow(row, group.rows.some((r) => r.lead))).join('')}</table>`;
  }).join('');
  const more = section.more > 0
    ? `<div style="font:12px ${MONO};color:${FAINT};margin-top:4px">+ ${section.more} more on the site</div>` : '';
  return `<div style="margin:0 0 20px"><div style="font:600 11px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${MUTED};border-bottom:1px solid ${LINE};padding-bottom:5px;margin-bottom:6px">${escapeHtml(section.title)}</div>${groups}${more}</div>`;
}

function renderHtml(digest, { siteUrl }) {
  const body = digest.empty
    ? `<p style="font:16px/1.5 ${SANS};color:${INK};margin:8px 0 4px"><strong>Clear day.</strong></p><p style="font:15px/1.5 ${SANS};color:${MUTED};margin:0">No classes, nothing due, nothing overdue.</p>`
    : digest.sections.map(htmlSection).join('');
  const link = siteUrl
    ? `<p style="margin:22px 0 0;font:13px ${SANS}"><a href="${escapeHtml(siteUrl)}" style="color:${MUTED}">Open Marginalia</a></p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subjectFor(digest.today))}</title></head><body style="margin:0;background:#f7f4ed"><div style="max-width:520px;margin:0 auto;padding:22px 18px 28px;background:#f7f4ed">`
    + `<div style="font:600 21px ${SERIF};color:${INK}">Your day</div>`
    + `<div style="font:13px ${MONO};color:${MUTED};margin:2px 0 18px">${escapeHtml(longDate(digest.today))}</div>`
    + `${body}${link}</div></body></html>`;
}

function renderText(digest, { siteUrl }) {
  const lines = [`YOUR DAY: ${longDate(digest.today)}`, ''];
  if (digest.empty) {
    lines.push('Clear day. No classes, nothing due, nothing overdue.');
  } else {
    for (const section of digest.sections) {
      lines.push(section.title.toUpperCase());
      for (const group of section.groups) {
        if (group.label) lines.push(`  ${group.label}`);
        for (const row of group.rows) {
          const indent = group.label ? '    ' : '  ';
          lines.push(`${indent}${[row.lead, row.text, row.tag && `(${row.tag})`].filter(Boolean).join('  ')}`);
        }
      }
      if (section.more > 0) lines.push(`  + ${section.more} more on the site`);
      lines.push('');
    }
  }
  if (siteUrl) lines.push(siteUrl);
  return lines.join('\n').trim() + '\n';
}

function renderDigest(digest, { siteUrl = '' } = {}) {
  return { subject: subjectFor(digest.today), html: renderHtml(digest, { siteUrl }), text: renderText(digest, { siteUrl }) };
}

module.exports = { renderDigest, escapeHtml, subjectFor };
