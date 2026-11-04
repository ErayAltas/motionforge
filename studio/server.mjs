// motionforge studio: a local web UI that runs the motion-director workflow through Claude Code.
// Zero dependencies. Usage: node studio/server.mjs   (PORT, HOST, CLAUDE_BIN, STUDIO_MODEL are optional)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPublisher, loadDotEnv } from './publish.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');
const DATA_ROOT = process.env.STUDIO_DATA || path.join(__dirname, '.data');
const DATA = path.join(DATA_ROOT, 'jobs');
const VIDEOS = path.join(ROOT, 'videos');
const STYLES_DIR = path.join(ROOT, 'skills', 'style-library', 'styles');
loadDotEnv(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MODEL = process.env.STUDIO_MODEL || '';

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });

const LANGS = {
  tr: 'Türkçe', en: 'English', es: 'Español', 'pt-BR': 'Português (BR)', fr: 'Français',
  de: 'Deutsch', 'zh-CN': '简体中文', ja: '日本語', ko: '한국어', hi: 'हिन्दी',
};
const FORMATS = { '9:16': '1080x1920', '1:1': '1080x1080', '16:9': '1920x1080' };

// ---------- small helpers ----------
const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
};
const readBody = (req, limit = 1e6) => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const slugify = (s) => {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  const t = s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return t || 'video';
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const inside = (base, p) => { const r = path.relative(base, p); return r && !r.startsWith('..') && !path.isAbsolute(r); };

function serveFile(req, res, file, { download = false } = {}) {
  let st;
  try { st = fs.statSync(file); if (!st.isFile()) throw 0; } catch { res.writeHead(404); return res.end('not found'); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
  if (download) headers['content-disposition'] = `attachment; filename="${path.basename(file)}"`;
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    let start = range[1] ? parseInt(range[1], 10) : 0;
    let end = range[2] ? parseInt(range[2], 10) : st.size - 1;
    if (!range[1] && range[2]) { start = Math.max(0, st.size - parseInt(range[2], 10)); end = st.size - 1; }
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  fs.createReadStream(file).pipe(res);
}

// ---------- style catalogue ----------
let styleCache = null;
function loadStyles() {
  if (styleCache) return styleCache;
  const out = [];
  try {
    const md = fs.readFileSync(path.join(STYLES_DIR, 'README.md'), 'utf8');
    let cat = '';
    for (const line of md.split('\n')) {
      const h = /^## (.+)$/.exec(line);
      if (h) { cat = h[1].trim(); continue; }
      const m = /^\| \[([a-z0-9-]+)\]\([^)]+\) \| (.*?) \| (.*?) \| (.*?) \|$/.exec(line);
      if (m && cat) out.push({ id: m[1], category: cat, look: m[2], bestFor: m[3], engine: m[4],
        preview: fs.existsSync(path.join(STYLES_DIR, m[1], 'preview.gif')) });
    }
  } catch { /* catalogue is optional */ }
  return (styleCache = out);
}

// ---------- environment check ----------
function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null;
}
function health() {
  const claude = which(CLAUDE_BIN);
  const venvPy = path.join(ROOT, '.venv', 'bin', 'python3');
  const env = process.env;
  return {
    claude: !!claude, node: process.version, ffmpeg: !!which('ffmpeg'),
    python: fs.existsSync(venvPy) || !!which('python3'),
    tts: { local: process.platform === 'darwin' ? !!which('say') : !!which('piper'),
      elevenlabs: !!env.ELEVENLABS_API_KEY, openai: !!env.OPENAI_API_KEY },
    keys: { fal: !!env.FAL_KEY, wiro: !!env.WIRO_API_KEY },
    platform: process.platform,
  };
}

// ---------- jobs ----------
const jobs = new Map();           // id -> job
const procs = new Map();          // id -> ChildProcess
const listeners = new Map();      // id -> Set<res>
const channels = new Map();       // id -> channel
const queue = [];                 // job ids waiting for a free slot
const LIMIT = Math.max(1, Number(process.env.STUDIO_CONCURRENCY || 1));
const CH_FILE = path.join(DATA_ROOT, 'channels.json');
const IDEA_CWD = path.join(DATA_ROOT, 'ideas-cwd');
fs.mkdirSync(IDEA_CWD, { recursive: true });

const jobDir = (id) => path.join(DATA, id);
const saveJob = (job) => fs.writeFileSync(path.join(jobDir(job.id), 'job.json'), JSON.stringify(job, null, 2));
function loadChannels() {
  try { for (const c of JSON.parse(fs.readFileSync(CH_FILE, 'utf8'))) channels.set(c.id, c); } catch { /* none yet */ }
}
const saveChannels = () => fs.writeFileSync(CH_FILE, JSON.stringify([...channels.values()], null, 2));
function loadJobs() {
  for (const id of fs.readdirSync(DATA)) {
    if (id === 'ideas-cwd' || !exists(path.join(DATA, id, 'job.json'))) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(DATA, id, 'job.json'), 'utf8'));
      if (job.status === 'queued' && job.pending) queue.push(job.id);
      else if (job.status === 'running' || job.status === 'queued') { job.status = 'stopped'; job.note = 'Sunucu yeniden başlatıldı; çalışma yarıda kaldı.'; saveJob(job); }
      jobs.set(id, job);
    } catch { /* ignore broken job */ }
  }
}
function pushEvent(job, ev) {
  ev.t = Date.now();
  ev.i = job.events = (job.events || 0) + 1;
  fs.appendFileSync(path.join(jobDir(job.id), 'events.jsonl'), JSON.stringify(ev) + '\n');
  broadcast(job.id, 'event', ev);
}
function broadcast(id, name, data) {
  const set = listeners.get(id); if (!set) return;
  const msg = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(msg);
}
const publicJob = (job) => ({ ...job, pending: undefined, stages: stagesOf(job), outputs: outputsOf(job), running: procs.has(job.id),
  queuePos: queue.indexOf(job.id) + 1 });

function enqueue(job, prompt) {
  job.status = 'queued'; job.pending = prompt; saveJob(job);
  if (!queue.includes(job.id)) queue.push(job.id);
  broadcast(job.id, 'job', publicJob(job));
  pump();
}
function pump() {
  while (procs.size < LIMIT && queue.length) {
    const job = jobs.get(queue.shift());
    if (!job || job.status !== 'queued') continue;
    const prompt = job.pending; delete job.pending;
    runClaude(job, prompt);
  }
  for (const id of queue) { const j = jobs.get(id); if (j) broadcast(id, 'job', publicJob(j)); }
}

// Stage detection comes from the files the agent leaves behind, not from parsing its prose.
const STAGES = [
  ['brief', 'Brief'], ['script', 'Senaryo'], ['voice', 'Ses'], ['look', 'Stil'],
  ['scenes', 'Sahneler'], ['qa', 'Kalite'], ['render', 'Render'],
];
function exists(p) { try { return fs.statSync(p); } catch { return null; } }
function listDir(p) { try { return fs.readdirSync(p); } catch { return []; } }
function finalVideos(job) {
  const dir = path.join(VIDEOS, job.slug, 'renders');
  return listDir(dir).filter((f) => /\.mp4$/i.test(f) && !/^tmp|silent|draft/i.test(f))
    .map((f) => ({ f, s: fs.statSync(path.join(dir, f)) }))
    .filter((x) => x.s.mtimeMs >= job.createdAt - 1000);
}
function stagesOf(job) {
  const d = path.join(VIDEOS, job.slug);
  const scenes = listDir(path.join(d, 'scenes')).filter((s) => exists(path.join(d, 'scenes', s, 'index.html')));
  const done = {
    brief: !!exists(path.join(d, 'brief.md')),
    script: !!exists(path.join(d, 'script.md')),
    voice: listDir(path.join(d, 'audio')).some((f) => /^words\.json$|^voice\./.test(f)) || job.settings.voice === 'none' && !!exists(path.join(d, 'script.md')),
    look: !!exists(path.join(d, 'direction.json')),
    scenes: scenes.length > 0,
    qa: listDir(path.join(d, 'qa')).length > 0,
    render: finalVideos(job).length > 0,
  };
  let current = null;
  for (const [k] of STAGES) if (!done[k]) { current = k; break; }
  return STAGES.map(([k, label]) => ({ key: k, label, done: done[k], current: k === current && job.status === 'running' }));
}
function outputsOf(job) {
  const d = path.join(VIDEOS, job.slug, 'renders');
  const files = listDir(d).map((f) => ({ f, s: exists(path.join(d, f)) })).filter((x) => x.s && x.s.isFile() && x.s.mtimeMs >= job.createdAt - 1000);
  const finals = new Set(finalVideos(job).map((x) => x.f));
  return files.map(({ f, s }) => ({
    name: f, size: s.size, mtime: s.mtimeMs, url: `/files/${encodeURIComponent(job.slug)}/renders/${encodeURIComponent(f)}`,
    kind: /\.mp4$|\.mov$|\.webm$/i.test(f) ? (finals.has(f) ? 'video' : 'draft') : /\.(png|jpe?g)$/i.test(f) ? 'image' : 'file',
  })).sort((a, b) => b.mtime - a.mtime);
}

function buildPrompt(job, firstTurn) {
  const s = job.settings;
  const lang = LANGS[s.language] || s.language;
  const lines = [];
  lines.push(`Make a video with the motionforge toolkit in this repository. Read and follow skills/motion-director/SKILL.md.`);
  lines.push('');
  lines.push(`TOPIC: ${job.topic}`);
  const ch = job.channelId && channels.get(job.channelId);
  if (ch) {
    lines.push('');
    lines.push('CHANNEL CONTEXT (this video belongs to a recurring channel; keep one consistent series identity, voice and look across its videos):');
    lines.push(`- Channel: ${ch.name}`);
    if (ch.niche) lines.push(`- Niche and promise: ${ch.niche}`);
    if (ch.audience) lines.push(`- Audience: ${ch.audience}`);
    if (ch.tone) lines.push(`- Tone: ${ch.tone}`);
    if (ch.rules) lines.push(`- Channel rules (always follow): ${ch.rules}`);
    const prev = [...jobs.values()].filter((j) => j.channelId === ch.id && j.id !== job.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map((j) => j.topic);
    if (prev.length) lines.push(`- Recent videos on this channel (do not repeat them; vary the hook type): ${prev.join(' | ')}`);
  }
  lines.push('');
  lines.push('Brief decided in the studio UI (treat as the confirmed brief, do not ask for these again):');
  lines.push(`- Video language: ${lang} (${s.language}). Write script, on-screen text and captions in it.`);
  lines.push(`- Format: ${s.format} (${FORMATS[s.format]}), 30 fps. Main format only.`);
  lines.push(`- Length: about ${s.duration} seconds.`);
  lines.push(`- Style: ${s.style && s.style !== 'auto' ? `use the style-library style "${s.style}"` : 'choose the best fitting style from the style library yourself and say which one and why'}.`);
  const voice = {
    local: 'free local voice only (no paid TTS). Use macOS `say` or another local TTS, then tools/word_timings.py for word timings.',
    none: 'no voice-over. Music-free silent video with burned-in captions and on-screen text only.',
    paid: 'a paid TTS voice is allowed ONLY after you state the characters and the estimated cost and the user says yes (G3). Until then use a free local scratch voice.',
  }[s.voice] || 'free local voice only';
  lines.push(`- Voice: ${voice}`);
  if (s.notes && s.notes.trim()) lines.push(`- Extra notes from the user: ${s.notes.trim()}`);
  lines.push('');
  lines.push(`Project folder: videos/${job.slug}/ (create it; use exactly this slug). The final MP4 must end up in videos/${job.slug}/renders/ and must not have "tmp", "silent" or "draft" in its name.`);
  lines.push('');
  if (s.mode === 'auto') {
    lines.push('AUTOPILOT MODE: the user is not available to answer. Take every default and record each decision in brief.md. G1, G2, G4 and G5 count as approved by the studio ("approved_by": "agent"). Do not stop to ask questions. Never make a paid call (G3 stays closed). You must still run the full QA (G6) and the independent critic (G7) when a subagent is available. Finish by delivering the MP4, then summarise in a short final message: what you chose, what is mock, what stayed WARN, and the claim list to verify.');
  } else {
    lines.push('STEP-BY-STEP MODE: honour the gates. Stop and wait for the user at G1 (brief read-back), G2 (hooks, script, claim list) and G4 (style choice) — present each concisely and end your message with the exact question. After approval, continue to the end without extra questions. Keep messages short and in the user\'s UI language (Turkish unless the video language differs and the user wrote otherwise).');
  }
  lines.push('');
  lines.push('Reply to the user in Turkish. Keep intermediate messages to one or two lines; the UI shows them as a live activity feed.');
  return firstTurn ? lines.join('\n') : '';
}

function runClaude(job, prompt) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Skill,Agent,WebSearch,WebFetch'];
  if (MODEL) args.push('--model', MODEL);
  if (job.sessionId) args.push('--resume', job.sessionId);
  const child = spawn(CLAUDE_BIN, args, { cwd: ROOT, env: process.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  procs.set(job.id, child);
  job.status = 'running'; job.startedTurnAt = Date.now(); delete job.note;
  saveJob(job); broadcast(job.id, 'job', publicJob(job));
  child.stdin.end(prompt);

  let buf = '', errBuf = '', gotResult = false;
  const handle = (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.session_id && !job.sessionId) { job.sessionId = m.session_id; saveJob(job); }
    if (m.type === 'assistant' && m.message?.content) {
      for (const c of m.message.content) {
        if (c.type === 'text' && c.text.trim()) pushEvent(job, { kind: 'say', text: c.text.trim() });
        else if (c.type === 'tool_use') pushEvent(job, { kind: 'tool', tool: c.name, text: describeTool(c) });
      }
    } else if (m.type === 'result') {
      gotResult = true;
      job.cost = (job.cost || 0) + (m.total_cost_usd || 0);
      job.turns = (job.turns || 0) + 1;
      if (m.is_error) pushEvent(job, { kind: 'error', text: String(m.result || m.subtype || 'error') });
      job.lastResultError = !!m.is_error;
    }
  };
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i; while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  child.stderr.on('data', (d) => { errBuf = (errBuf + d.toString('utf8')).slice(-4000); });
  child.on('error', (e) => { pushEvent(job, { kind: 'error', text: `claude başlatılamadı: ${e.message}` }); });
  child.on('close', (code, sig) => {
    procs.delete(job.id);
    if (buf.trim()) handle(buf);
    if (job.stopRequested) { job.status = 'stopped'; delete job.stopRequested; }
    else if (code !== 0 && !gotResult) { job.status = 'failed'; pushEvent(job, { kind: 'error', text: (errBuf.trim() || `claude çıkış kodu ${code} ${sig || ''}`).slice(-800) }); }
    else if (job.lastResultError) job.status = 'failed';
    else job.status = finalVideos(job).length ? 'done' : 'waiting';
    job.finishedAt = Date.now();
    saveJob(job); broadcast(job.id, 'job', publicJob(job));
    pump();
  });
}
function describeTool(c) {
  const i = c.input || {};
  const rel = (p) => (typeof p === 'string' ? p.replace(ROOT + path.sep, '') : '');
  switch (c.name) {
    case 'Bash': return (i.description || i.command || '').toString().slice(0, 160);
    case 'Read': case 'Write': case 'Edit': return rel(i.file_path);
    case 'Glob': case 'Grep': return String(i.pattern || '');
    case 'Skill': return String(i.skill || '');
    case 'Agent': return String(i.description || i.subagent_type || '');
    default: return c.name;
  }
}

function pickChannelStyle(ch) {
  const list = (ch.styles || []).filter((x) => /^[a-z0-9-]+$/.test(x));
  if (!list.length) return 'auto';
  if (list.length === 1) return list[0];
  const used = [...jobs.values()].filter((j) => j.channelId === ch.id).sort((a, b) => b.createdAt - a.createdAt);
  const last = new Map(); used.forEach((j, i) => { if (!last.has(j.settings.style)) last.set(j.settings.style, i); });
  // rotate: the style used longest ago (never used = first)
  return list.slice().sort((a, b) => (last.has(b) ? last.get(b) : 1e9) - (last.has(a) ? last.get(a) : 1e9))[0];
}
function createJob(body) {
  const topic = String(body.topic || '').trim();
  if (topic.length < 3) throw new Error('Konu çok kısa.');
  if (topic.length > 2000) throw new Error('Konu çok uzun.');
  const ch = body.channelId ? channels.get(String(body.channelId)) : null;
  if (body.channelId && !ch) throw new Error('Kanal bulunamadı.');
  const st = { ...(ch ? { language: ch.language, duration: ch.duration, format: ch.format, voice: ch.voice, mode: ch.mode, style: pickChannelStyle(ch), notes: '' } : {}), ...(body.settings || {}) };
  const settings = {
    language: LANGS[st.language] ? st.language : 'tr',
    duration: Math.min(120, Math.max(10, Number(st.duration) || 35)),
    format: FORMATS[st.format] ? st.format : '9:16',
    style: typeof st.style === 'string' && /^[a-z0-9-]+$/.test(st.style) ? st.style : 'auto',
    voice: ['local', 'none', 'paid'].includes(st.voice) ? st.voice : 'local',
    mode: st.mode === 'steps' ? 'steps' : 'auto',
    notes: String(st.notes || '').slice(0, 1500),
  };
  if (settings.voice === 'paid') settings.mode = 'steps'; // the cost gate needs a human
  const id = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  let slug = slugify(topic), n = 2;
  while (exists(path.join(VIDEOS, slug))) slug = `${slugify(topic)}-${n++}`;
  const job = { id, topic, slug, settings, status: 'queued', createdAt: Date.now(), events: 0, cost: 0, turns: 0 };
  if (ch) job.channelId = ch.id;
  fs.mkdirSync(jobDir(id), { recursive: true });
  jobs.set(id, job); saveJob(job);
  pushEvent(job, { kind: 'status', text: 'İş kuyruğa alındı.' });
  if (ch && body.ideaId) {
    const idea = ch.ideas.find((i) => i.id === body.ideaId);
    if (idea) { idea.status = 'used'; idea.jobId = job.id; saveChannels(); }
  }
  enqueue(job, buildPrompt(job, true));
  return job;
}

// ---------- channels ----------
const str = (v, n) => String(v ?? '').trim().slice(0, n);
function sanitizeChannel(b) {
  const name = str(b.name, 60);
  if (name.length < 2) throw new Error('Kanal adı gerekli.');
  return {
    name, emoji: [...str(b.emoji, 8)][0] || '🎬', niche: str(b.niche, 800), audience: str(b.audience, 300), tone: str(b.tone, 300), rules: str(b.rules, 1200),
    styles: (Array.isArray(b.styles) ? b.styles : []).filter((x) => typeof x === 'string' && /^[a-z0-9-]+$/.test(x)).slice(0, 12),
    language: LANGS[b.language] ? b.language : 'tr',
    duration: Math.min(120, Math.max(10, Number(b.duration) || 35)),
    format: FORMATS[b.format] ? b.format : '9:16',
    voice: ['local', 'none', 'paid'].includes(b.voice) ? b.voice : 'local',
    mode: b.mode === 'steps' ? 'steps' : 'auto',
  };
}
function channelSummary(c) {
  const js = [...jobs.values()].filter((j) => j.channelId === c.id);
  return { ...c, ideas: undefined, ideaCount: c.ideas.filter((i) => i.status === 'new').length,
    videos: js.filter((j) => finalVideos(j).length).length, jobs: js.length, running: js.filter((j) => j.status === 'running' || j.status === 'queued').length,
    lastAt: js.reduce((a, j) => Math.max(a, j.createdAt), 0), generating: !!c.generating };
}
function runOneShot(prompt, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--tools', ''];
    if (process.env.STUDIO_IDEA_MODEL || MODEL) args.push('--model', process.env.STUDIO_IDEA_MODEL || MODEL);
    const child = spawn(CLAUDE_BIN, args, { cwd: IDEA_CWD, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Zaman aşımı: fikir üretimi çok uzun sürdü.')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`claude başlatılamadı: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try { const j = JSON.parse(out); if (j.is_error) return reject(new Error(String(j.result || 'claude hatası').slice(0, 300))); return resolve(String(j.result || '')); }
      catch { return reject(new Error((err.trim() || `claude çıkış kodu ${code}`).slice(-300))); }
    });
    child.stdin.end(prompt);
  });
}
async function generateIdeas(ch, { count, angle }) {
  count = Math.min(15, Math.max(3, count));
  const used = [...jobs.values()].filter((j) => j.channelId === ch.id).map((j) => j.topic);
  const banked = ch.ideas.map((i) => i.title);
  const avoid = [...new Set([...used, ...banked])].slice(-80);
  const lang = LANGS[ch.language] || ch.language;
  const prompt = [
    `You generate video topic ideas for a short-video channel. Reply with ONLY a JSON array, no prose, no code fence.`,
    ``,
    `Channel: ${ch.name}`,
    ch.niche && `Niche and promise: ${ch.niche}`,
    ch.audience && `Audience: ${ch.audience}`,
    ch.tone && `Tone: ${ch.tone}`,
    ch.rules && `Channel rules: ${ch.rules}`,
    `Format: ${ch.format}, about ${ch.duration} seconds, language of the videos: ${lang}.`,
    angle && `Focus of this batch (from the owner): ${angle}`,
    ``,
    `Give exactly ${count} ideas. Each is an object with these string fields, written in ${lang}:`,
    `- "title": the topic exactly as the owner would type it into the video tool (a question or a clear promise, max 90 characters, no quotes, no clickbait lies)`,
    `- "hook": a suggested first spoken sentence (max 140 characters) that stops the scroll`,
    `- "angle": one short sentence on why a viewer would watch to the end`,
    ``,
    `Rules: topics must be answerable accurately in ${ch.duration} seconds; evergreen over news; mix easy and surprising topics; never invent facts, statistics or quotes; vary the structure of the titles; no two ideas about the same thing.`,
    avoid.length && `Do NOT repeat or closely paraphrase any of these existing topics: ${avoid.join(' | ')}`,
  ].filter(Boolean).join('\n');
  const text = await runOneShot(prompt);
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  let arr; try { arr = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('Fikirler okunamadı; tekrar dene.'); }
  const seen = new Set(avoid.map((x) => x.toLowerCase()));
  const added = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    const title = str(it?.title, 140); if (title.length < 6 || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const idea = { id: crypto.randomBytes(4).toString('hex'), title, hook: str(it.hook, 220), angle: str(it.angle, 260), status: 'new', createdAt: Date.now() };
    ch.ideas.unshift(idea); added.push(idea.id);
  }
  if (!added.length) throw new Error('Yeni fikir çıkmadı; yöne bir not ekleyip tekrar dene.');
  saveChannels();
  return added;
}

const publisher = createPublisher({ dataDir: DATA_ROOT, origin: `http://127.0.0.1:${PORT}`, jobs, channels, saveJob, broadcast, publicJob, pushEvent,
  videosDir: VIDEOS, readBody, json, runOneShot });

// ---------- HTTP ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);
  try {
    // DNS-rebinding / cross-site guard: only talk to our own origin.
    const host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && HOST === '127.0.0.1') { res.writeHead(403); return res.end('forbidden'); }
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { res.writeHead(403); return res.end('forbidden'); }

    if ((p.startsWith('/api/publish') || p.startsWith('/oauth/') || /^\/api\/jobs\/[a-z0-9]+\/publish(-meta)?$/.test(p)) && await publisher.handle(req, res, url, p)) return;
    if (p === '/api/health') return json(res, 200, health());
    if (p === '/api/config') return json(res, 200, { languages: LANGS, formats: Object.keys(FORMATS), styles: loadStyles() });
    if (p === '/api/jobs' && req.method === 'GET') {
      return json(res, 200, [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map((j) => ({
        id: j.id, topic: j.topic, status: j.status, createdAt: j.createdAt, settings: j.settings, cost: j.cost,
        channelId: j.channelId || null, hasVideo: finalVideos(j).length > 0, running: procs.has(j.id), queuePos: queue.indexOf(j.id) + 1,
        video: (outputsOf(j).find((o) => o.kind === 'video') || {}).url || null,
        progress: stagesOf(j).filter((x) => x.done).length / STAGES.length,
      })));
    }
    if (p === '/api/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      try { return json(res, 201, publicJob(createJob(body))); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (p === '/api/channels' && req.method === 'GET') return json(res, 200, [...channels.values()].map(channelSummary));
    if (p === '/api/channels' && req.method === 'POST') {
      try { const c = sanitizeChannel(await readBody(req)); c.id = 'c' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'); c.createdAt = Date.now(); c.ideas = [];
        channels.set(c.id, c); saveChannels(); return json(res, 201, c); } catch (e) { return json(res, 400, { error: e.message }); }
    }
    let cm = /^\/api\/channels\/(c[a-z0-9]+)(?:\/ideas(?:\/([a-z0-9]+))?)?$/.exec(p);
    if (cm) {
      const ch = channels.get(cm[1]); if (!ch) return json(res, 404, { error: 'Kanal bulunamadı.' });
      const isIdeas = p.includes('/ideas');
      if (!isIdeas && req.method === 'GET') return json(res, 200, ch);
      if (!isIdeas && req.method === 'PUT') {
        try { Object.assign(ch, sanitizeChannel(await readBody(req))); saveChannels(); return json(res, 200, ch); } catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (!isIdeas && req.method === 'DELETE') { channels.delete(ch.id); saveChannels(); return json(res, 200, { ok: true }); }
      if (isIdeas && !cm[2] && req.method === 'POST') {
        if (ch.generating) return json(res, 409, { error: 'Fikirler zaten üretiliyor.' });
        const body = await readBody(req);
        ch.generating = true;
        try { const added = await generateIdeas(ch, { count: Number(body.count) || 8, angle: String(body.angle || '').slice(0, 300) }); return json(res, 200, { added, channel: ch }); }
        catch (e) { return json(res, 502, { error: e.message }); }
        finally { delete ch.generating; }
      }
      if (isIdeas && cm[2]) {
        const idea = ch.ideas.find((i) => i.id === cm[2]); if (!idea) return json(res, 404, { error: 'Fikir bulunamadı.' });
        if (req.method === 'DELETE') { ch.ideas = ch.ideas.filter((i) => i !== idea); saveChannels(); return json(res, 200, ch); }
        if (req.method === 'PATCH') { const b = await readBody(req); if (['new', 'dismissed'].includes(b.status)) idea.status = b.status; saveChannels(); return json(res, 200, ch); }
      }
      return json(res, 405, { error: 'method not allowed' });
    }
    let m = /^\/api\/jobs\/([a-z0-9]+)(?:\/(events|reply|stop|script|brief|history))?$/.exec(p);
    if (m) {
      const job = jobs.get(m[1]); if (!job) return json(res, 404, { error: 'not found' });
      const sub = m[2];
      if (!sub && req.method === 'GET') return json(res, 200, publicJob(job));
      if (!sub && req.method === 'DELETE') {
        if (procs.has(job.id)) { job.stopRequested = true; try { process.kill(-procs.get(job.id).pid, 'SIGTERM'); } catch {} }
        const qi = queue.indexOf(job.id); if (qi >= 0) queue.splice(qi, 1);
        jobs.delete(job.id); fs.rmSync(jobDir(job.id), { recursive: true, force: true });
        return json(res, 200, { ok: true });
      }
      if (sub === 'history') {
        let evs = []; try { evs = fs.readFileSync(path.join(jobDir(job.id), 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch {}
        return json(res, 200, evs);
      }
      if (sub === 'script' || sub === 'brief') {
        const f = path.join(VIDEOS, job.slug, `${sub}.md`);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(exists(f) ? fs.readFileSync(f, 'utf8') : '');
      }
      if (sub === 'events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`event: job\ndata: ${JSON.stringify(publicJob(job))}\n\n`);
        if (!listeners.has(job.id)) listeners.set(job.id, new Set());
        listeners.get(job.id).add(res);
        const tick = setInterval(() => { res.write(`event: job\ndata: ${JSON.stringify(publicJob(job))}\n\n`); }, 4000);
        req.on('close', () => { clearInterval(tick); listeners.get(job.id)?.delete(res); });
        return;
      }
      if (sub === 'reply' && req.method === 'POST') {
        if (procs.has(job.id) || job.status === 'queued') return json(res, 409, { error: 'Ajan şu an çalışıyor veya sırada.' });
        if (!job.sessionId) return json(res, 409, { error: 'Oturum bulunamadı; yeni bir video başlatın.' });
        const body = await readBody(req);
        const text = String(body.text || '').trim().slice(0, 4000);
        if (!text) return json(res, 400, { error: 'Mesaj boş.' });
        pushEvent(job, { kind: 'user', text });
        enqueue(job, text);
        return json(res, 200, publicJob(job));
      }
      if (sub === 'stop' && req.method === 'POST') {
        const child = procs.get(job.id);
        if (!child && job.status === 'queued') {
          const qi = queue.indexOf(job.id); if (qi >= 0) queue.splice(qi, 1);
          job.status = 'stopped'; delete job.pending; saveJob(job); pushEvent(job, { kind: 'status', text: 'Sıradan çıkarıldı.' });
          broadcast(job.id, 'job', publicJob(job)); return json(res, 200, { ok: true });
        }
        if (!child) return json(res, 409, { error: 'Çalışan iş yok.' });
        job.stopRequested = true;
        try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
        pushEvent(job, { kind: 'status', text: 'Durdurma istendi.' });
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'method not allowed' });
    }
    // media: /files/<slug>/renders/<file>   (only inside videos/<slug>/{renders,qa})
    m = /^\/files\/([a-z0-9-]+)\/(renders|qa)\/(.+)$/.exec(p);
    if (m) {
      const file = path.join(VIDEOS, m[1], m[2], m[3]);
      if (!inside(path.join(VIDEOS, m[1], m[2]), file)) { res.writeHead(403); return res.end(); }
      return serveFile(req, res, file, { download: url.searchParams.has('download') });
    }
    m = /^\/styles\/([a-z0-9-]+)\/preview\.gif$/.exec(p);
    if (m) return serveFile(req, res, path.join(STYLES_DIR, m[1], 'preview.gif'));

    // static UI
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.join(PUBLIC, rel);
    if (!inside(PUBLIC, file)) { res.writeHead(403); return res.end(); }
    return serveFile(req, res, file);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: String(e.message || e) }); else res.end();
  }
});

loadChannels(); loadJobs(); publisher.recover();
server.listen(PORT, HOST, () => {
  pump();
  const h = health();
  console.log(`\n  motionforge studio  →  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
  console.log(`  claude: ${h.claude ? 'ok' : 'NOT FOUND'}   ffmpeg: ${h.ffmpeg ? 'ok' : 'NOT FOUND'}   node: ${h.node}\n`);
});
const shutdown = () => { for (const c of procs.values()) { try { process.kill(-c.pid, 'SIGTERM'); } catch {} } process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
