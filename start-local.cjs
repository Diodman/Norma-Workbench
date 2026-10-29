#!/usr/bin/env node
'use strict';
// No npm packages or internet connection are needed to serve the included app.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, 'app');
const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const portText = portAt < 0 ? '4267' : args[portAt + 1];
if (!/^\d+$/.test(portText || '') || Number(portText) < 1 || Number(portText) > 65535) {
  console.error('Port must be an integer between 1 and 65535.'); process.exit(1);
}
const PORT = Number(portText);
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('The app folder is missing. Extract the entire ZIP before starting.'); process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jsonld': 'application/ld+json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};
const server = http.createServer(async (req, res) => {
  const send = (status, body, type = 'text/plain; charset=utf-8') => {
    const bytes = Buffer.from(body);
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': bytes.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
  if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed');
  let decoded;
  try { decoded = decodeURIComponent(req.url.split('?')[0]).replace(/\\/g, '/'); }
  catch { return send(400, 'Bad path'); }
  if (decoded.includes('\0')) return send(400, 'Bad path');
  if (decoded === '/__norma_status') return send(200, JSON.stringify({ app: 'norma-workbench-local', version: '1.0.0' }), 'application/json; charset=utf-8');
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) return send(403, 'Forbidden');
  try {
    const stat = await fs.promises.stat(target);
    if (!stat.isFile()) return send(404, 'Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy()); stream.pipe(res);
  } catch { send(404, 'Not found'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Port 4267 is busy. Close the previous Norma window, or use: node start-local.cjs --port 4268'
    : error.message);
  process.exitCode = 1;
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('\nNorma Workbench\n' + url + '\nKeep this window open. Press Ctrl+C to stop.\n');
  if (args.includes('--no-browser')) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const values = process.platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url];
  try { const child = spawn(command, values, { detached: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref(); } catch {}
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
