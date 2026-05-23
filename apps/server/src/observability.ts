// Claudio FM — Observability
// Process-level safety nets, periodic metrics, and log rotation.
// Zero external dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', '..', '..', '..', '.codex-logs');
const LOG_FILE = path.join(LOG_DIR, 'observability.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 5;

// ── auto log rotate ──────────────────────────────────────────

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLog() {
  if (!fs.existsSync(LOG_FILE)) return;
  const stat = fs.statSync(LOG_FILE);
  if (stat.size < MAX_LOG_SIZE) return;

  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const old = path.join(LOG_DIR, `observability.${i}.log`);
    const next = path.join(LOG_DIR, `observability.${i + 1}.log`);
    if (fs.existsSync(old)) {
      if (i === MAX_LOG_FILES - 1) fs.unlinkSync(next);
      else if (fs.existsSync(next)) fs.unlinkSync(next);
      fs.renameSync(old, next);
    }
  }
  const first = path.join(LOG_DIR, 'observability.1.log');
  if (fs.existsSync(first)) fs.unlinkSync(first);
  fs.renameSync(LOG_FILE, first);
}

function logLine(level: string, message: string, extra?: Record<string, unknown>) {
  ensureLogDir();
  rotateLog();
  const ts = new Date().toISOString();
  const extraStr = extra ? ' ' + JSON.stringify(extra) : '';
  const line = `[${ts}] ${level} ${message}${extraStr}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
  // Also echo to console so devs see it
  if (level === 'ERROR' || level === 'FATAL') {
    console.error(`[obs] ${message}`, extra || '');
  } else {
    console.log(`[obs] ${message}`, extra || '');
  }
}

// ── process-level safety nets ─────────────────────────────────

let fatalCount = 0;

export function installProcessHandlers() {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logLine('ERROR', `unhandledRejection: ${msg}`, { stack: stack?.slice(0, 500) });
    // Don't crash — the process may still be healthy. Unhandled rejections
    // in Node ≥15 with default --unhandled-rejections=throw would kill the
    // process; logging them here lets us notice without a restart loop.
  });

  process.on('uncaughtException', (err: Error) => {
    fatalCount++;
    logLine('FATAL', `uncaughtException (#${fatalCount}): ${err.message}`, {
      stack: err.stack?.slice(0, 800),
    });
    // After an uncaught exception the process is in an undefined state.
    // Give the log a moment to flush, then exit so a process manager can restart.
    if (fatalCount >= 3) {
      console.error('[obs] Too many uncaught exceptions — forcing exit');
      process.exit(1);
    }
    // Let the event loop drain so the log write is likely flushed before exit.
    setTimeout(() => process.exit(1), 500).unref();
  });
}

// ── memory monitoring ─────────────────────────────────────────

export function logMemory() {
  const mem = process.memoryUsage();
  logLine('INFO', 'memory', {
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024),
  });
}

// ── metric providers (injected via setters so this module stays decoupled) ──

type MetricGetters = {
  getWsClients: () => number;
  getQueueSize: () => Promise<number>;
  getActiveStreams: () => number;
};

let metrics: MetricGetters = {
  getWsClients: () => 0,
  getQueueSize: async () => 0,
  getActiveStreams: () => 0,
};

export function setMetricGetters(g: MetricGetters) {
  metrics = g;
}

// ── health report ─────────────────────────────────────────────

export async function logHealthReport() {
  const queueSize = await metrics.getQueueSize();
  logLine('INFO', 'health', {
    wsClients: metrics.getWsClients(),
    queueSize,
    activeStreams: metrics.getActiveStreams(),
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
  });
}

// ── periodic timer ────────────────────────────────────────────

let memoryTimer: ReturnType<typeof setInterval> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicLogs() {
  // Memory every 5 minutes
  memoryTimer = setInterval(logMemory, 5 * 60 * 1000);
  memoryTimer.unref();

  // Full health report every hour
  healthTimer = setInterval(logHealthReport, 60 * 60 * 1000);
  healthTimer.unref();

  // Log memory once at startup
  logMemory();
}

export function stopPeriodicLogs() {
  if (memoryTimer) { clearInterval(memoryTimer); memoryTimer = null; }
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}
