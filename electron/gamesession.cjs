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

// Launchers start Minecraft with Mojang's log config, which prints log4j XML events to stdout:
// <log4j:Event logger=".." timestamp=".." level="INFO" thread=".."><log4j:Message><![CDATA[..]]>...
const XML_ATTR = /(\w+)="([^"]*)"/g;
const XML_MESSAGE = /<log4j:Message><!\[CDATA\[([\s\S]*?)\]\]><\/log4j:Message>/;
const XML_THROWABLE = /<log4j:Throwable><!\[CDATA\[([\s\S]*?)\]\]><\/log4j:Throwable>/;
const LEVELS = new Set(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']);

function parseXmlEvent(xml) {
  const head = /<log4j:Event\b([^>]*)>/.exec(xml);
  if (!head) return null;
  const attrs = {};
  for (const [, key, value] of head[1].matchAll(XML_ATTR)) attrs[key] = value;
  const level = attrs.level === 'FATAL' ? 'ERROR' : LEVELS.has(attrs.level) ? attrs.level : 'INFO';
  const unwrap = text => text.replace(/\]\]\]\]><!\[CDATA\[>/g, ']]>');
  const message = unwrap(XML_MESSAGE.exec(xml)?.[1] ?? '');
  const throwable = unwrap(XML_THROWABLE.exec(xml)?.[1] ?? '');
  const time = Number(attrs.timestamp) || Date.now();
  const thread = attrs.thread || 'main';
  return { level, time, message: `[${thread}/${level}]: ${message}`, throwable };
}

function createSession({ profile, account, onLines, onStats }) {
  let id = 0, partial = '', pending = [], timer = null, monitor = null, stopped = false;
  let xml = null;   // collects one multi-line log4j event
  const lines = [];
  // Reset when the Java process actually starts; downloads before that do not count as play time.
  let startedAt = Date.now();
  let stats = { memory: 0, cpu: 0 };
  let lastLevel = 'INFO';

  const flush = () => { timer = null; if (pending.length) { onLines(pending); pending = []; } };
  function add(text, level, time = Date.now()) {
    if (!text.trim()) return;
    const entry = { id: ++id, time, level, text: redact(text).slice(0, 4000) };
    lines.push(entry); if (lines.length > MAX_LINES) lines.shift();
    pending.push(entry);
  }
  function addXml(event) {
    const parsed = parseXmlEvent(event);
    if (!parsed) { add(event.replace(/\s+/g, ' '), 'INFO'); return; }
    parsed.message.split(/\r?\n/).forEach(line => add(line, parsed.level, parsed.time));
    // Stack traces belong to the event; show them as errors so they stand out.
    parsed.throwable.split(/\r?\n/).forEach(line => add(line, parsed.level === 'WARN' ? 'WARN' : 'ERROR', parsed.time));
    lastLevel = parsed.level;
  }
  function push(chunk) {
    const text = partial + String(chunk);
    const parts = text.split(/\r?\n/);
    partial = parts.pop() || '';
    for (const raw of parts) {
      if (xml !== null || raw.trimStart().startsWith('<log4j:Event')) {
        xml = (xml ?? '') + raw + '\n';
        if (raw.includes('</log4j:Event>') || xml.length > 256 * 1024) { addXml(xml); xml = null; }
        continue;
      }
      if (!raw.trim()) continue;
      // Stack trace lines inherit the level of the message they belong to.
      const level = /^\s+at |^\s*\.\.\. \d+ more|^Caused by:/.test(raw) ? lastLevel : parseLevel(raw);
      lastLevel = level;
      add(raw, level);
    }
    if (pending.length && !timer) timer = setTimeout(flush, 100);
  }

  // One long-lived PowerShell loop is far cheaper than spawning a sampler every two seconds.
  // "java" often resolves to Oracle's javapath launcher, a 2 MB stub that starts the real JVM as a
  // child. The loop therefore looks for a java child and measures that once it exists.
  function startMonitor(pid) {
    if (process.platform !== 'win32' || !pid || monitor) return;
    const root = Number(pid);
    const script = [
      `$root=${root};$t=$null`,
      'while($true){',
      ' if(-not (Get-Process -Id $root -EA SilentlyContinue)){break}',
      ' if(-not $t){$c=Get-CimInstance Win32_Process -Filter "ParentProcessId=$root" -EA SilentlyContinue | Where-Object { $_.Name -match "^javaw?\\.exe$" } | Select-Object -First 1; if($c){$t=$c.ProcessId}}',
      ' $id=if($t){$t}else{$root}',
      ' $p=Get-Process -Id $id -EA SilentlyContinue',
      ' if($p){"$id $($p.WorkingSet64) $($p.TotalProcessorTime.TotalMilliseconds)"}',
      ' Start-Sleep -Milliseconds 2000',
      '}'
    ].join(';').replace(/\{;/g, '{').replace(/;\}/g, '}');
    monitor = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let last = null;
    monitor.stdout.on('data', data => {
      for (const row of String(data).trim().split(/\r?\n/)) {
        const [id, memory, cpuMs] = row.trim().split(' ').map(Number);
        if (!Number.isFinite(memory)) continue;
        const now = Date.now();
        // Switching from the stub to the JVM restarts the CPU baseline.
        const cpu = last && last.id === id ? Math.max(0, Math.min(100, (cpuMs - last.cpuMs) / (now - last.at) / os.cpus().length * 100)) : 0;
        last = { id, cpuMs, at: now };
        stats = { memory, cpu: Math.round(cpu) };
        onStats(stats);
      }
    });
  }
  return {
    push,
    // The Java pid is only known after MCLC has spawned it; lines are buffered before that.
    attach: pid => { startedAt = Date.now(); startMonitor(pid); },
    snapshot: () => ({ lines, profile, account, startedAt, stats, running: !stopped }),
    clear: () => { lines.length = 0; },
    end: () => { stopped = true; if (partial) push('\n'); if (xml) { addXml(xml); xml = null; } flush(); monitor?.kill(); }
  };
}

module.exports = { createSession, parseLevel, parseXmlEvent };
