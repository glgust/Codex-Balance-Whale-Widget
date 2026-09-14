import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { startServer, toCodex } from './server.mjs';

test('independent upstream routes require authentication and preserve widget assets/config', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'whale-server-test-'));
  let reads = 0;
  const app = await startServer({ dataDir: home, readUsageFn: async () => ({ collectedAt: new Date().toISOString(), error: null,
    rateLimitsByLimitId: { codex: { primary: { usedPercent: ++reads, windowDurationMins: 10080, resetsAt: 1900000000 }, secondary: null, planType: 'pro' } }, summary: { lifetimeTokens: 99 }, dailyUsageBuckets: [] }) });
  try {
    assert.equal((await fetch(app.origin + '/dsh-whale/roles.json')).status, 401);
    const login = await fetch(app.url, { redirect: 'manual' });
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { cookie };
    assert.equal((await fetch(app.origin + '/', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const wrongHost = await new Promise((resolve, reject) => {
      http.get(app.origin + '/', { headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(wrongHost, 403);
    assert.match(await (await fetch(app.origin, { headers })).text(), /dsh-whale\/widget.js/);
    for (const route of ['image.png', 'rua.gif', 'roles.json', 'audio.json', 'audio-fragment.wav?id=exp_orb', 'sound/press.mp3', 'bubble.json', 'size.json', 'widget.js']) {
      assert.equal((await fetch(app.origin + '/dsh-whale/' + route, { headers })).status, 200, route);
    }
    const originalImage = await fs.readFile(new URL('../assets/DSniang1.png', import.meta.url));
    const uploaded = await (await fetch(app.origin + '/dsh-whale/roles.json', { method: 'POST', headers, body: JSON.stringify({ name: 'Test', image: 'data:image/png;base64,' + originalImage.toString('base64') }) })).json();
    const role = uploaded.roles.find(role => role.name === 'Test');
    assert.ok(role);
    const fetchedImage = await (await fetch(app.origin + '/dsh-whale/role-image.png?id=' + encodeURIComponent(role.id), { headers })).arrayBuffer();
    assert.deepEqual(Buffer.from(fetchedImage), originalImage);
    const cfg = { v: 1, items: [], lib: [], tapAdvance: true };
    assert.equal((await fetch(app.origin + '/dsh-whale/bubble.json', { method: 'POST', headers, body: JSON.stringify(cfg) })).status, 200);
    assert.deepEqual((await (await fetch(app.origin + '/dsh-whale/bubble.json', { headers })).json()).config, cfg);
    await app.refresh();
    const usage = await (await fetch(app.origin + '/dsh-whale/balance.json', { headers })).json();
    assert.equal(usage.provider, 'codex');
    assert.equal(usage.totalBalance, null);
    assert.equal(usage.codex.windows.primary.windowDurationMins, 10080);
    assert.equal(usage.codex.windows.secondary, null);
    const first = reads;
    await fetch(app.origin + '/dsh-whale/codex-refresh.json', { method: 'POST', headers });
    assert.ok(reads > first);
    assert.equal(toCodex({ rateLimitsByLimitId: { spark: {} }, rateLimits: { primary: {} } }).ok, false);
  } finally { await app.close(); await fs.rm(home, { recursive: true, force: true }); }
});
