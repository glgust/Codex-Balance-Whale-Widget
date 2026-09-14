import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AppServer, readUsage, preserveLastSuccess } from './collector.mjs';

function mockServer(respond, timeoutMs = 100) {
  const calls = [];
  let spawned = 0;
  const client = new AppServer({ binary: 'mock-codex', timeoutMs, spawnProcess() {
    spawned++;
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('exit', 0)); };
    child.stdin.on('data', buffer => {
      const request = JSON.parse(buffer.toString()); calls.push(request.method);
      if (request.id === undefined) return;
      const answer = request.method === 'initialize' ? { result: {} } : respond(request, spawned);
      if (answer) queueMicrotask(() => child.stdout.write(JSON.stringify({ id: request.id, ...answer }) + '\n'));
    });
    return child;
  } });
  return { client, calls, count: () => spawned };
}

test('whitelists account fields and preserves week-only primary plus null secondary', async () => {
  const {client, calls} = mockServer(request => ({ result: request.method === 'account/rateLimits/read' ? {
    accountId: 'secret-account', resetCredits: [{id:'secret-reset'}],
    rateLimits: { primary: { usedPercent: 42, windowDurationMins: 10080, resetsAt: 123 }, secondary: null, accountId: 'secret-account' },
    rateLimitsByLimitId: { codex: { primary: null, secondary: null } },
  } : { summary: { lifetimeTokens: 1234, accountId: 'secret-account' }, dailyUsageBuckets: [{startDate:'2026-09-14', tokens: 80, secret:'x'}] } }));
  const snapshot = await readUsage({client}); client.close();
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.rateLimits.primary.windowDurationMins, 10080);
  assert.equal(snapshot.rateLimits.secondary, null);
  assert.equal(snapshot.summary.lifetimeTokens, 1234);
  assert.deepEqual(snapshot.dailyUsageBuckets, [{startDate:'2026-09-14',tokens:80}]);
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
  assert.deepEqual(calls, ['initialize','initialized','account/rateLimits/read','account/usage/read']);
});

test('concurrent reads initialize one server and correlate replies', async () => {
  const {client, count, calls} = mockServer(request => ({result: request.method === 'account/rateLimits/read' ? {rateLimits:{primary:null,secondary:null}} : {summary:{lifetimeTokens:10}}}));
  const results = await Promise.all([readUsage({client}), readUsage({client})]);
  assert.equal(count(), 1); assert.equal(calls.filter(x=>x==='initialize').length,1);
  assert.ok(results.every(result=>result.summary.lifetimeTokens===10)); client.close();
});

test('timeout disconnects, next refresh reconnects, and old data remains visibly stale', async () => {
  const {client,count} = mockServer((request, attempt) => attempt === 1 ? null : {result: request.method === 'account/rateLimits/read' ? {rateLimits:{primary:{usedPercent:12}}} : {}}, 15);
  const failure = await readUsage({client});
  assert.match(failure.error,/timed out/); assert.equal(failure.collectedAt,null);
  const previous = {collectedAt:'2026-09-01T00:00:00.000Z',rateLimits:{primary:{usedPercent:88}},error:null};
  const retained = preserveLastSuccess(previous,failure);
  assert.equal(retained.rateLimits.primary.usedPercent,88); assert.equal(retained.collectedAt,previous.collectedAt);
  assert.ok(retained.lastAttemptAt); assert.ok(retained.error);
  const success = await readUsage({client}); assert.equal(count(),2); assert.equal(success.rateLimits.primary.usedPercent,12); client.close();
});

test('older official clients can return quota with unavailable token summary', async () => {
  const {client} = mockServer(request => request.method==='account/rateLimits/read' ? {result:{rateLimits:{primary:{usedPercent:3}}}} : {error:{code:-32601,message:'sensitive server diagnostics'}});
  const snapshot = await readUsage({client}); client.close();
  assert.equal(snapshot.rateLimits.primary.usedPercent,3);
  assert.equal(snapshot.summary,null); assert.match(snapshot.error,/token summary unavailable/);
  assert.ok(!snapshot.error.includes('sensitive'));
});
