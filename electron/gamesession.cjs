// One running Minecraft process: keeps a ring buffer of log lines for the log window,
// batches new lines to listeners and samples RAM/CPU of the Java process.
const { spawn } = require('node:child_process');
const os = require('node:os');
const { redact } = require('./logger.cjs');

const MAX_LINES = 8000;
const LEVEL = /\[(?:[^\]]*\/)?(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\]|^\s*(?:Exception|Caused by:|\tat )/;

function parseLevel(text) {
  const match = LEVEL.exec(text);
  if (!match) return 'INFO';
  if (!match[1]) return 'ERROR';
  return match[1] === 'FATAL' ? 'ERROR' : match[1];
}

function createSession({ profile, account, onLines, onStats }) {
  let id = 0, partial = '', pending = [], timer = null, monitor = null, stopped = false;
  const lines = [];
  const startedAt = Date.now();
  let stats = { memory: 0, cpu: 0 };
  let lastLevel = 'INFO';

  const flush = () => { timer = null; if (pending.length) { onLines(pending); pending = []; } };
  function push(chunk) {
    const text = partial + String(chunk);
    const parts = text.split(/\r?\n/);
    partial = parts.pop() || '';
    for (const raw of parts) {
      if (!raw.trim()) continue;
      const line = redact(raw).slice(0, 4000);
      // Stack trace lines inherit the level of the message they belong to.
      const level = /^\s+at |^\s*\.\.\. \d+ more|^Caused by:/.test(line) ? lastLevel : parseLevel(line);
      lastLevel = level;
      const entry = { id: ++id, time: Date.now(), level, text: line };
      lines.push(entry); if (lines.length > MAX_LINES) lines.shift();
      pending.push(entry);
    }
    if (pending.length && !timer) timer = setTimeout(flush, 100);
  }

  // One long-lived PowerShell loop is far cheaper than spawning a sampler every two seconds.
  function startMonitor(pid) {
    if (process.platform !== 'win32' || !pid || monitor) return;
    const script = `while($true){$p=Get-Process -Id ${Number(pid)} -EA SilentlyContinue;if(!$p){break};"$($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)";Start-Sleep -Milliseconds 2000}`;
    monitor = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let last = null;
    monitor.stdout.on('data', data => {
      for (const row of String(data).trim().split(/\r?\n/)) {
        const [memory, cpuMs] = row.trim().split(' ').map(Number);
        if (!Number.isFinite(memory)) continue;
        const now = Date.now();
        const cpu = last ? Math.max(0, Math.min(100, (cpuMs - last.cpuMs) / (now - last.at) / os.cpus().length * 100)) : 0;
        last = { cpuMs, at: now };
        stats = { memory, cpu: Math.round(cpu) };
        onStats(stats);
      }
    });
  }
  return {
    push,
    // The Java pid is only known after MCLC has spawned it; lines are buffered before that.
    attach: pid => startMonitor(pid),
    snapshot: () => ({ lines, profile, account, startedAt, stats, running: !stopped }),
    clear: () => { lines.length = 0; },
    end: () => { stopped = true; if (partial) push('\n'); flush(); monitor?.kill(); }
  };
}

module.exports = { createSession, parseLevel };
