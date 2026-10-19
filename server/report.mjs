// sends a bug report or feature idea from the /report page to the maintainer's inbox, through resend.
// runs on the server only, the resend key never reaches the browser

const KINDS = { bug: 'Bug report', feature: 'Feature idea' };
const LIMITS = { tool: 60, title: 120, details: 3000, steps: 2000, email: 200 };
const MAX_BODY = 16 * 1024;
const MIN_FILL_MS = 2500; // a person takes longer than this to fill the form in
const PER_ADDRESS = 5; // reports per address every 10 minutes
const PER_HOUR = 60; // all reports per hour, a ceiling if someone floods it

const reply = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// reads the body, a too-long one is read to the end but not kept, so the 413 still reaches the browser
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () =>
      size > MAX_BODY ? reject(Object.assign(new Error('too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8')),
    );
    req.on('error', reject);
  });
}

// trims a field and checks it fits, returns null when it doesn't
function text(value, max, required) {
  if (value === undefined || value === null) return required ? null : '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > max) return null;
  return trimmed;
}

export function readReport(input) {
  if (!input || typeof input !== 'object' || !(input.kind in KINDS)) return null;
  const report = {
    kind: input.kind,
    tool: text(input.tool, LIMITS.tool, false),
    title: text(input.title, LIMITS.title, true),
    details: text(input.details, LIMITS.details, true),
    steps: text(input.steps, LIMITS.steps, false),
    email: text(input.email, LIMITS.email, false),
  };
  if (Object.values(report).some((v) => v === null)) return null;
  if (report.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(report.email)) return null;
  report.title = report.title.replace(/\s+/g, ' ');
  return report;
}

export function composeEmail(report) {
  const kind = KINDS[report.kind];
  const sections = [
    [report.kind === 'bug' ? 'What happened' : 'The idea', report.details],
    ...(report.steps ? [['Steps to make it happen again', report.steps]] : []),
  ];
  const facts = [
    ['Tool', report.tool || 'Not sure'],
    ['Reply to', report.email || 'No email given'],
  ];
  const text = [
    `${kind}: ${report.title}`,
    '',
    ...facts.map(([k, v]) => `${k}: ${v}`),
    '',
    ...sections.flatMap(([heading, body]) => [heading, body, '']),
    'Sent from the report form on snappdf.',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0b0b0c;max-width:600px">
<p style="margin:0 0 4px;color:#71717a;font-size:13px">${kind}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escapeHtml(report.title)}</h1>
<table style="border-collapse:collapse;margin:0 0 20px;font-size:14px">${facts
    .map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#71717a">${k}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>
${sections
  .map(([heading, body]) => `<h2 style="margin:0 0 6px;font-size:15px">${heading}</h2><p style="margin:0 0 20px;white-space:pre-wrap">${escapeHtml(body)}</p>`)
  .join('\n')}
<p style="margin:24px 0 0;color:#a1a1aa;font-size:12px">Sent from the report form on snappdf.</p>
</div>`;
  return { subject: `[snappdf] ${kind}: ${report.title}`, text, html, replyTo: report.email || undefined };
}

/**
 * Handles POST /api/report. Works with any node-style request and response, so the production
 * server and the vite dev server share it.
 */
export function createReportHandler({
  apiKey,
  to,
  from = 'snappdf <onboarding@resend.dev>',
  allowedOrigins = [],
  resendUrl = 'https://api.resend.com/emails',
  now = () => Date.now(),
}) {
  const recent = new Map(); // address -> times it sent a report
  let hour = { start: 0, count: 0 };

  const limited = (address) => {
    const t = now();
    if (t - hour.start > 3600_000) hour = { start: t, count: 0 };
    const times = (recent.get(address) ?? []).filter((at) => t - at < 600_000);
    if (times.length >= PER_ADDRESS || hour.count >= PER_HOUR) return true;
    times.push(t);
    recent.set(address, times);
    hour.count++;
    // keep the map small
    if (recent.size > 5000) recent.clear();
    return false;
  };

  return async function handleReport(req, res) {
    if (req.method !== 'POST') return reply(res, 405, { error: 'Use POST.' });
    if (!apiKey || !to) return reply(res, 503, { error: 'Reports aren’t set up on this server.' });
    if (allowedOrigins.length && !allowedOrigins.includes(req.headers.origin)) return reply(res, 403, { error: 'Not allowed.' });
    if (!String(req.headers['content-type']).includes('application/json')) return reply(res, 415, { error: 'Send JSON.' });

    let input;
    try {
      input = JSON.parse(await readBody(req));
    } catch (err) {
      return reply(res, err.status ?? 400, { error: err.status === 413 ? 'That report is too long.' : 'That didn’t look like a report.' });
    }

    // a bot that fills the hidden field, or sends the form instantly, gets told it worked and nothing is sent
    if (input?.website || !(Number(input?.elapsed) >= MIN_FILL_MS)) return reply(res, 200, { ok: true });

    const report = readReport(input);
    if (!report) return reply(res, 400, { error: 'Please check the form and try again.' });

    // cloud run's front end adds the real address last, anything before it came from the client
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const address = forwarded.at(-1) || req.socket?.remoteAddress || 'unknown';
    if (limited(address)) return reply(res, 429, { error: 'That’s a lot of reports at once. Please try again in a few minutes.' });

    const email = composeEmail(report);
    try {
      const sent = await fetch(resendUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: email.subject, text: email.text, html: email.html, reply_to: email.replyTo }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!sent.ok) {
        // the status only, never the report or the key
        console.error(`report: resend answered ${sent.status}`);
        return reply(res, 502, { error: 'We couldn’t send that right now.' });
      }
    } catch (err) {
      console.error(`report: resend unreachable (${err.name})`);
      return reply(res, 502, { error: 'We couldn’t send that right now.' });
    }
    return reply(res, 200, { ok: true });
  };
}
