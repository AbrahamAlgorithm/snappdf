// the report sender, a tiny server that runs next to nginx in the same cloud run service.
// nginx passes /api/report to it, everything else on the site stays static
import { createServer } from 'node:http';
import { createReportHandler } from './report.mjs';

const port = Number(process.env.API_PORT ?? 8081);

const handleReport = createReportHandler({
  apiKey: process.env.RESEND_API_KEY,
  to: process.env.REPORT_TO,
  from: process.env.REPORT_FROM || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'https://snappdf.abrahamalgorithm.tech,https://snappdf-179103012566.us-west1.run.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

if (!process.env.RESEND_API_KEY || !process.env.REPORT_TO) console.warn('report: RESEND_API_KEY or REPORT_TO is missing, reports will be refused');

const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  if (path === '/api/report') return void handleReport(req, res);
  if (path === '/api/health') return void res.end('ok');
  res.statusCode = 404;
  res.end();
});

// localhost only: nginx in the same cloud run instance can reach it, nothing outside can
server.listen(port, '127.0.0.1', () => console.log(`report: listening on ${port}`));
