import { createServer } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeEmail, createReportHandler } from './report.mjs';

// a stand-in for resend that records what it was asked to send
let resend;
let resendUrl;
let resendStatus = 200;
const sent = [];

beforeAll(async () => {
  resend = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      sent.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.statusCode = resendStatus;
      res.end('{}');
    });
  });
  await new Promise((r) => resend.listen(0, '127.0.0.1', r));
  resendUrl = `http://127.0.0.1:${resend.address().port}/emails`;
});

afterAll(() => resend.close());

beforeEach(() => {
  sent.length = 0;
  resendStatus = 200;
});

// runs the handler behind a real http server, the way nginx reaches it
async function serve(options = {}) {
  const handle = createReportHandler({ apiKey: 're_test', to: 'owner@example.com', resendUrl, allowedOrigins: ['https://snappdf.test'], ...options });
  const server = createServer(handle);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/report`;
  const post = (body, headers = {}) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://snappdf.test', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { url, post, close: () => server.close() };
}

const report = {
  kind: 'bug',
  tool: 'Merge PDF',
  title: 'Merge gets stuck',
  details: 'Two big PDFs and it spins forever.',
  steps: '1. Add two PDFs',
  email: 'reader@example.com',
  elapsed: 9000,
};

describe('report sender', () => {
  it('emails a report to the owner through resend', async () => {
    const api = await serve();
    const res = await api.post(report);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].auth).toBe('Bearer re_test');
    expect(sent[0].body).toMatchObject({ to: ['owner@example.com'], subject: '[snappdf] Bug report: Merge gets stuck', reply_to: 'reader@example.com' });
    expect(sent[0].body.text).toContain('Two big PDFs and it spins forever.');
    api.close();
  });

  it('turns away requests that are not a report', async () => {
    const api = await serve();
    expect((await fetch(api.url)).status).toBe(405);
    expect((await api.post(report, { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await api.post('not json')).status).toBe(400);
    expect((await api.post({ ...report, kind: 'rant' })).status).toBe(400);
    expect((await api.post({ ...report, title: '   ' })).status).toBe(400);
    expect((await api.post({ ...report, details: 'x'.repeat(3001) })).status).toBe(400);
    expect((await api.post({ ...report, email: 'not an email' })).status).toBe(400);
    expect((await api.post({ ...report, details: 'x'.repeat(20_000) })).status).toBe(413);
    expect(sent).toHaveLength(0);
    api.close();
  });

  it('refuses to work without a key or a recipient', async () => {
    const api = await serve({ apiKey: '' });
    expect((await api.post(report)).status).toBe(503);
    api.close();
  });

  it('pretends to accept bot submissions but sends nothing', async () => {
    const api = await serve();
    expect((await api.post({ ...report, website: 'https://spam.test' })).status).toBe(200);
    expect((await api.post({ ...report, elapsed: 400 })).status).toBe(200);
    expect(sent).toHaveLength(0);
    api.close();
  });

  it('limits how many reports one address can send', async () => {
    const api = await serve();
    const from = (ip) => ({ 'X-Forwarded-For': `1.2.3.4, ${ip}` });
    for (let i = 0; i < 5; i++) expect((await api.post(report, from('9.9.9.9'))).status).toBe(200);
    expect((await api.post(report, from('9.9.9.9'))).status).toBe(429);
    // the client can't dodge it by faking the first address, the last one is what counts
    expect((await api.post(report, { 'X-Forwarded-For': '5.5.5.5, 9.9.9.9' })).status).toBe(429);
    expect((await api.post(report, from('8.8.8.8'))).status).toBe(200);
    expect(sent).toHaveLength(6);
    api.close();
  });

  it('says so when resend fails, without logging the report', async () => {
    resendStatus = 500;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = await serve();

    expect((await api.post(report)).status).toBe(502);
    expect(log.mock.calls.flat().join(' ')).not.toContain('spins forever');
    log.mockRestore();
    api.close();
  });
});

describe('composeEmail', () => {
  it('escapes anything that looks like html', () => {
    const { html, subject } = composeEmail({ kind: 'feature', tool: '', title: '<b>hi</b>', details: '<script>alert(1)</script>', steps: '', email: '' });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&#60;script&#62;');
    expect(subject).toBe('[snappdf] Feature idea: <b>hi</b>');
  });
});
