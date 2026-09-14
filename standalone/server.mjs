import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readUsage, closeUsageClient, preserveLastSuccess, writeSnapshot } from './collector.mjs';

export function toCodex(snapshot) {
  const limits = snapshot?.rateLimitsByLimitId ? snapshot.rateLimitsByLimitId.codex : snapshot?.rateLimits;
  return { ok: !!limits, windows: { primary: limits?.primary ?? null, secondary: limits?.secondary ?? null, planType: limits?.planType ?? null },
    lifetimeTokens: snapshot?.summary?.lifetimeTokens ?? null, dailyUsageBuckets: snapshot?.dailyUsageBuckets ?? null,
    collectedAt: snapshot?.collectedAt ?? null, error: snapshot?.error ?? null, source: 'codex-app-server' };
}

// Reuses the upstream widget's complete HTTP handlers and browser implementation.
// The small context below replaces the DSH lifecycle and web server only.
export async function startServer({ port = 0, dataDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CodexWhaleWidget'), refreshIntervalMs = 60000, readUsageFn = readUsage,
  html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Codex Whale</title><style>html,body{margin:0;background:transparent;width:100%;height:100%;overflow:hidden}</style></head><body></body></html>' } = {}) {
  if (refreshIntervalMs < 5000) throw new Error('Refresh interval must be at least 5 seconds');
  await fs.mkdir(dataDir, { recursive: true });
  process.env.WHALE_HOME = dataDir;
  // Dynamic import ensures all upstream configuration paths resolve to our home.
  const { default: widget } = await import('../lib/index.js');
  html = html.replace('</head>', '<script>window.__CODEX_WHALE_STANDALONE__=true;</script></head>');
  const routes = new Map(), disposers = [], taps = [];
  const token = randomBytes(32).toString('hex');
  const cookieName = 'codex_whale_' + randomBytes(6).toString('hex');
  let origin, snapshot = null, inflight = null, closed = false;
  const snapshotFile = path.join(dataDir, 'usage.json');
  try { snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8')); } catch {}
  function refresh() {
    if (closed) return Promise.resolve(snapshot);
    if (inflight) return inflight;
    inflight = (async () => {
      let current;
      try { current = await readUsageFn(); }
      catch (error) { current = { collectedAt: null, lastAttemptAt: new Date().toISOString(), error: String(error.message) }; }
      if (!closed) { snapshot = preserveLastSuccess(snapshot, current); await writeSnapshot(snapshotFile, snapshot); }
      return snapshot;
    })().finally(() => { inflight = null; });
    return inflight;
  }
  const equalToken = value => typeof value === 'string' && value.length === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const authenticated = req => {
    const cookies = String(req.headers.cookie || '').split(';').map(item => item.trim());
    return cookies.some(item => item.startsWith(cookieName + '=') && equalToken(item.slice(cookieName.length + 1)));
  };
  function requestRejection(req) {
    if (req.headers.host !== new URL(origin).host) return 403;
    if (req.headers.origin && req.headers.origin !== origin) return 403;
    if (req.headers['sec-fetch-site'] === 'cross-site') return 403;
    return authenticated(req) ? null : 401;
  }
  const connection = { requestRejection };
  widget.apply({ standalone: true, connection, get: name => name === 'connection' ? connection : undefined,
    credentials: { resolve: async () => null, set: async () => { throw new Error('Codex authentication is managed by Codex; API keys are not stored by this adaptation'); }, unset: async () => {}, deleteRecord: async () => {} },
    on: () => () => {}, effect: fn => { disposers.push(fn()); },
    webServer: { register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path); }, tapIndex: fn => { taps.push(fn); return () => {}; } } });
  const send = (res, data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end(); return; }
      const url = new URL(req.url, origin);
      if (url.pathname === '/' && req.method === 'GET' && equalToken(url.searchParams.get('token'))) {
        res.writeHead(302, { 'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`, Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      const rejection = requestRejection(req);
      if (rejection) { res.writeHead(rejection); res.end(); return; }
      if (url.pathname === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(taps.reduce((page, tap) => tap(page), html)); return; }
      if (url.pathname === '/dsh-whale/codex-refresh.json' && req.method === 'POST') { await refresh(); send(res, { ok: !!snapshot?.collectedAt, codex: toCodex(snapshot) }); return; }
      if (url.pathname === '/dsh-whale/balance.json') { send(res, { ok: !!snapshot?.collectedAt, provider: 'codex', totalBalance: null, todayUsage: null, currency: '', codex: toCodex(snapshot), stale: !!snapshot?.error, error: snapshot?.error ?? null }); return; }
      if (url.pathname === '/dsh-whale/api-models.json' && req.method === 'GET') { send(res, { ok: true, builtinId: 'codex', templates: [], models: [{ id: 'codex', name: 'Codex', provider: 'codex', builtin: true, currency: '', hasKey: true, balance: null, todayUsage: null, balanceMode: 'codex', usageSource: 'codex-app-server', codex: toCodex(snapshot) }] }); return; }
      if (url.pathname === '/dsh-whale/api-models.json') { send(res, { ok: false, error: 'This adaptation uses your Codex subscription. Configure appearance and audio using the original widget settings.' }, 400); return; }
      if (url.pathname === '/dsh-whale/usage-records.json') { send(res, { ok: true, provider: 'codex', codex: toCodex(snapshot), today: null, days: [], events: [] }); return; }
      const handler = routes.get(url.pathname);
      if (!handler) { res.writeHead(404); res.end(); return; }
      await handler(req, res);
    } catch { if (!res.headersSent) send(res, { ok: false, error: 'Local widget request failed' }, 500); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  const timer = setInterval(() => { refresh().catch(() => {}); }, refreshIntervalMs);
  refresh().catch(() => {});
  return { url: `${origin}/?token=${token}`, origin, token, refresh, snapshot: () => snapshot,
    close: async () => { closed = true; clearInterval(timer); closeUsageClient(); for (const dispose of disposers.reverse()) dispose?.(); await new Promise(resolve => server.close(resolve)); } };
}
