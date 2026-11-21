// Development server: serves app/ and relays Kick requests through a small proxy so a desktop
// browser can run the app despite CORS. Not used on the TV: Tizen apps connect directly thanks to
// the <access> rule in config.xml.
// Usage: node dev/server.js  ->  http://localhost:8099
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'app');
const PORT = Number(process.env.PORT) || 8099;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(kick\.com|live-video\.net|kickcdn\.com)\//i;
const UA = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36';

// Make playlist URLs absolute so hls.js can route them back through the proxy.
function absolutizePlaylist(text, base) {
  return text.split(/\r?\n/).map((line) => {
    if (!line) return line;
    if (line[0] !== '#') return new URL(line, base).href;
    return line.replace(/URI="([^"]+)"/g, (m, u) => 'URI="' + new URL(u, base).href + '"');
  }).join('\n');
}

async function proxy(req, res, target) {
  if (!ALLOWED.test(target)) { res.writeHead(403); res.end('blocked'); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const init = { method: req.method, headers: { 'User-Agent': UA, Accept: req.headers.accept || '*/*' }, redirect: 'follow' };
  if (req.method === 'POST') { init.body = Buffer.concat(chunks); init.headers['Content-Type'] = req.headers['content-type'] || 'application/json'; }
  try {
    const up = await fetch(target, init);
    const type = up.headers.get('content-type') || 'application/octet-stream';
    let body = Buffer.from(await up.arrayBuffer());
    if (/mpegurl/i.test(type) || /\.m3u8?(\?|$)/.test(new URL(up.url).pathname)) body = Buffer.from(absolutizePlaylist(body.toString('utf8'), up.url));
    res.writeHead(up.status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
    res.end(String(e));
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/proxy') { proxy(req, res, url.searchParams.get('u') || ''); return; }
  const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Light Kick TV dev server: http://localhost:' + PORT));
