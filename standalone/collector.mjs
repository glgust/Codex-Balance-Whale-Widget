import { spawn } from 'node:child_process';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

// Only the official client handles authentication. This module never reads credentials.
export async function findCodexBinary(env = process.env) {
  if (env.CODEX_BINARY) return env.CODEX_BINARY;
  const windows = process.platform === 'win32';
  for (const directory of (env.PATH || env.Path || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory.replace(/^"|"$/g, ''), windows ? 'codex.exe' : 'codex');
    try { await fs.access(candidate, windows ? constants.F_OK : constants.X_OK); return candidate; } catch {}
  }
  if (windows && env.LOCALAPPDATA) {
    const root = path.join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const candidates = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name, 'codex.exe');
      try { candidates.push({ candidate, time: (await fs.stat(candidate)).mtimeMs }); } catch {}
    }
    candidates.sort((a, b) => b.time - a.time);
    if (candidates.length) return candidates[0].candidate;
  }
  throw new Error('Codex executable not found. Install Codex or set CODEX_BINARY to its executable.');
}

export class AppServer {
  constructor({ binary, timeoutMs = 40000, spawnProcess = spawn } = {}) {
    this.binary = binary; this.timeoutMs = timeoutMs; this.spawnProcess = spawnProcess;
    this.pending = new Map(); this.sequence = 0; this.child = null; this.starting = null;
  }
  async connect() {
    if (this.starting) return this.starting;
    if (this.child) return;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = null; }
  }
  async start() {
    const binary = this.binary || await findCodexBinary();
    const child = this.spawnProcess(binary, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    // Drain stderr, but never copy potentially sensitive diagnostics into snapshots.
    child.stderr.on('data', () => {});
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`${request.method} failed (JSON-RPC ${message.error.code ?? 'error'})`));
      else request.resolve(message.result);
    });
    child.once('error', () => this.disconnect(new Error('Unable to start Codex app-server.'), child));
    child.once('exit', () => { lines.close(); this.disconnect(new Error('Codex app-server exited.'), child); });
    child.stdin.on('error', () => this.disconnect(new Error('Codex app-server input closed.'), child));
    try {
      await this.request('initialize', { clientInfo: { name: 'codex_whale', title: 'Codex Whale', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    } catch (error) { this.disconnect(error, child); throw error; }
  }
  request(method, params = {}) {
    if (!this.child) return Promise.reject(new Error('Codex app-server is disconnected.'));
    const child = this.child;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.disconnect(new Error(`${method} timed out; will reconnect on next refresh.`), child), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  disconnect(error = new Error('Codex app-server closed.'), child = this.child) {
    if (child !== this.child) return;
    this.child = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    if (child && !child.killed) child.kill();
  }
  close() { this.disconnect(); }
}

function select(object, names) {
  if (object == null) return null;
  return Object.fromEntries(names.filter(name => object[name] !== undefined).map(name => [name, object[name]]));
}
function cleanLimit(limit) {
  if (!limit) return null;
  return {
    ...select(limit, ['limitId', 'limitName', 'planType']),
    primary: select(limit.primary, ['usedPercent', 'windowDurationMins', 'resetsAt']),
    secondary: select(limit.secondary, ['usedPercent', 'windowDurationMins', 'resetsAt']),
  };
}
const defaultClient = new AppServer();
export function closeUsageClient() { defaultClient.close(); }
export async function readUsage({ client = defaultClient } = {}) {
  const snapshot = { schemaVersion: 1, collectedAt: null, lastAttemptAt: new Date().toISOString(), source: 'codex-app-server', rateLimits: null, rateLimitsByLimitId: null, summary: null, dailyUsageBuckets: null, error: null };
  try {
    await client.connect();
    const rates = await client.request('account/rateLimits/read');
    snapshot.rateLimits = cleanLimit(rates?.rateLimits);
    snapshot.rateLimitsByLimitId = rates?.rateLimitsByLimitId == null ? null : Object.fromEntries(Object.entries(rates.rateLimitsByLimitId).map(([key, value]) => [key, cleanLimit(value)]));
    snapshot.collectedAt = new Date().toISOString();
    try {
      const usage = await client.request('account/usage/read');
      snapshot.summary = select(usage?.summary, ['lifetimeTokens', 'peakDailyTokens', 'longestRunningTurnSec', 'currentStreakDays', 'longestStreakDays']);
      snapshot.dailyUsageBuckets = Array.isArray(usage?.dailyUsageBuckets) ? usage.dailyUsageBuckets.map(bucket => select(bucket, ['startDate', 'tokens'])) : null;
    } catch (error) { snapshot.error = `Quota available; token summary unavailable: ${error.message}`; }
  } catch (error) { snapshot.error = error.message; }
  return snapshot;
}

export function preserveLastSuccess(previous, current) {
  if (!current.collectedAt && previous?.collectedAt) return { ...previous, lastAttemptAt: current.lastAttemptAt, error: current.error };
  return current;
}
export async function writeSnapshot(filename, snapshot) {
  await fs.mkdir(path.dirname(path.resolve(filename)), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 });
  try { await fs.rename(temporary, filename); } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; };
  const output = value('--output');
  const watch = args.includes('--watch');
  const refreshFile = value('--refresh-file');
  const interval = Number(value('--interval') || 60);
  if (!Number.isFinite(interval) || interval < 5) throw new Error('--interval must be at least 5 seconds.');
  if (watch && !output) throw new Error('--watch requires --output.');
  let stopping = false, tick, busy = false, last = null, refreshMtime = 0, nextRefresh = 0;
  if (output) try { last = JSON.parse(await fs.readFile(output, 'utf8')); } catch {}
  const stop = () => { stopping = true; clearInterval(tick); closeUsageClient(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  // A stop marker supports graceful shutdown on Windows, where TerminateProcess
  // does not deliver SIGTERM to a Node process.
  const stopFile = value('--stop-file');
  const refresh = async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      const current = await readUsage();
      if (stopping) return;
      last = preserveLastSuccess(last, current);
      if (output) await writeSnapshot(output, last);
      else process.stdout.write(JSON.stringify(last, null, 2) + '\n');
      nextRefresh = Date.now() + interval * 1000;
    } finally { busy = false; }
  };
  if (refreshFile) refreshMtime = (await fs.stat(refreshFile).catch(() => null))?.mtimeMs || 0;
  await refresh();
  if (!watch || stopping) { stop(); return; }
  tick = setInterval(async () => {
    try {
      if (stopFile && await fs.stat(stopFile).catch(() => null)) { stop(); return; }
      let requested = false;
      if (refreshFile) {
        const mtime = (await fs.stat(refreshFile).catch(() => null))?.mtimeMs || 0;
        if (mtime !== refreshMtime && !busy) { refreshMtime = mtime; requested = true; }
      }
      if (requested || Date.now() >= nextRefresh) await refresh();
    } catch (error) { process.stderr.write(`Collector: ${error.message}\n`); nextRefresh = Date.now() + interval * 1000; }
  }, 1000);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { closeUsageClient(); process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
