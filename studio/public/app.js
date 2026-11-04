const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { 'content-type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

const STATUS = { queued: 'Sırada', running: 'Çalışıyor', waiting: 'Yanıtını bekliyor', done: 'Tamamlandı', failed: 'Hata', stopped: 'Durduruldu' };
const EXAMPLES = [
  'Sonbaharda yapraklar neden sararır?',
  'Pomodoro tekniği 30 saniyede',
  'Kara delikler nasıl oluşur?',
  'Evde kahve demlemenin 5 püf noktası',
  'Bileşik faiz nedir?',
];
const ZOOM_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>';

const state = { cfg: null, jobs: [], current: null, es: null, style: 'auto', format: '9:16', mode: 'auto', cat: 'Tümü', doc: 'script', picked: null, feedCount: 0 };

// ---------- helpers ----------
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'şimdi'; if (s < 3600) return `${Math.floor(s / 60)} dk önce`; if (s < 86400) return `${Math.floor(s / 3600)} sa önce`; return new Date(t).toLocaleDateString('tr-TR'); };
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

// ---------- boot ----------
async function boot() {
  const [cfg, health] = await Promise.all([api('/api/config'), api('/api/health')]);
  state.cfg = cfg;
  const sel = $('#language');
  for (const [k, v] of Object.entries(cfg.languages)) sel.append(el('option', { value: k, textContent: v }));
  sel.value = 'tr';
  renderHealth(health);
  for (const ex of EXAMPLES) $('#examples').append(el('button', { type: 'button', className: 'chip', textContent: ex, onclick: () => { $('#topic').value = ex; $('#topic').focus(); } }));
  wireComposer(); wireStylePicker(); wireJobView();
  await refreshJobs();
  const id = location.hash.slice(1);
  if (id && state.jobs.some((j) => j.id === id)) openJob(id); else showNew();
  setInterval(refreshJobs, 5000);
}
function renderHealth(h) {
  const box = $('#health'); box.textContent = '';
  const pill = (ok, t) => box.append(el('span', { className: 'pill' + (ok ? '' : ' bad'), title: ok ? '' : 'Eksik' }, el('i'), t));
  pill(h.claude, 'Claude Code'); pill(h.ffmpeg, 'ffmpeg'); pill(h.python, 'Python'); pill(h.tts.local, 'Yerel ses');
  if (!h.claude) $('#formErr').textContent = '“claude” komutu bulunamadı. Claude Code kurulu ve PATH’te olmalı.', $('#formErr').hidden = false;
}

// ---------- composer ----------
function seg(id, key) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state[key] = b.dataset.v;
    for (const x of $(id).children) x.classList.toggle('on', x === b);
    costHint();
  });
}
function costHint() {
  const v = $('#voice').value;
  $('#costHint').textContent = v === 'paid'
    ? 'Ücretli TTS için maliyet gösterilir ve onayın beklenir; bu nedenle adım adım mod kullanılır.'
    : state.mode === 'auto' ? 'Ücretli çağrı yapılmaz; yerel ses ve yerel render kullanılır.' : 'Senaryo ve stil onayında sana soracak; ücretli çağrı yapılmaz.';
}
function wireComposer() {
  seg('#formatSeg', 'format'); seg('#modeSeg', 'mode');
  $('#voice').addEventListener('change', costHint);
  $('#duration').addEventListener('input', (e) => { $('#durOut').textContent = e.target.value + ' sn'; });
  $('#newBtn').addEventListener('click', showNew);
  $('#topic').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#form').requestSubmit(); });
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#goBtn'); btn.disabled = true; $('#formErr').hidden = true;
    try {
      const job = await api('/api/jobs', { method: 'POST', body: {
        topic: $('#topic').value,
        settings: { language: $('#language').value, duration: +$('#duration').value, format: state.format, style: state.style, voice: $('#voice').value, mode: state.mode, notes: $('#notes').value },
      } });
      $('#topic').value = ''; await refreshJobs(); openJob(job.id);
    } catch (err) { $('#formErr').textContent = err.message; $('#formErr').hidden = false; }
    btn.disabled = false;
  });
}
function showNew() {
  closeStream(); state.current = null; location.hash = '';
  $('#viewNew').hidden = false; $('#viewJob').hidden = true; renderJobList(); $('#topic').focus();
}

// ---------- style picker ----------
function wireStylePicker() {
  const dlg = $('#styleDlg');
  $('#styleBtn').addEventListener('click', () => { renderStyles(); dlg.showModal(); });
  $('#styleClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('#styleQ').addEventListener('input', renderStyles);
  $('#zoomDlg').addEventListener('click', (e) => { if (e.target.id === 'zoomDlg') e.target.close(); });
}
function renderStyles() {
  const { styles } = state.cfg, q = $('#styleQ').value.trim().toLowerCase();
  const cats = ['Tümü', ...new Set(styles.map((s) => s.category))];
  const cbox = $('#styleCats'); cbox.textContent = '';
  for (const c of cats) cbox.append(el('button', { type: 'button', className: 'chip' + (c === state.cat ? ' on' : ''), textContent: c, onclick: () => { state.cat = c; renderStyles(); },
    style: c === state.cat ? 'color:var(--accent);border-color:var(--accent)' : '' }));
  const grid = $('#styleGrid'); grid.textContent = '';
  const pick = (id, label) => { state.style = id; $('#styleLabel').textContent = label; $('#styleDlg').close(); };
  const auto = el('button', { type: 'button', className: 'sty' + (state.style === 'auto' ? ' on' : ''), onclick: () => pick('auto', 'Otomatik · konuya göre seç') },
    el('div', { className: 'pv', style: 'font-size:34px;color:var(--accent)', textContent: '✦' }), el('div', { className: 'tx' }, el('b', { textContent: 'Otomatik' }), el('span', { textContent: 'Ajan konuya ve formata en uygun stili seçer ve nedenini yazar.' })));
  if (!q && state.cat === 'Tümü') grid.append(auto);
  for (const s of styles) {
    if (state.cat !== 'Tümü' && s.category !== state.cat) continue;
    if (q && !(`${s.id} ${s.category} ${s.look} ${s.bestFor}`.toLowerCase().includes(q))) continue;
    grid.append(el('button', { type: 'button', className: 'sty' + (state.style === s.id ? ' on' : ''), onclick: () => pick(s.id, `${s.id} · ${s.category}`) },
      el('div', { className: 'pv' }, s.preview ? el('img', { src: `/styles/${s.id}/preview.gif`, loading: 'lazy', alt: s.id }) : '',
        s.preview ? el('span', { className: 'zoom', role: 'button', title: 'Büyüt', innerHTML: ZOOM_SVG, onclick: (e) => { e.stopPropagation(); openZoom(s, pick); } }) : ''),
      el('div', { className: 'tx' }, el('b', { textContent: s.id }), el('span', { textContent: s.bestFor }))));
  }
}

function openZoom(s, pick) {
  const d = $('#zoomDlg'), body = $('#zoomBody'); body.textContent = '';
  const i = state.cfg.styles.filter((x) => x.preview);
  const k = i.findIndex((x) => x.id === s.id);
  const go = (n) => openZoom(i[(k + n + i.length) % i.length], pick);
  body.append(
    el('div', { className: 'zimg' }, el('img', { src: `/styles/${s.id}/preview.gif`, alt: s.id })),
    el('div', { className: 'zside' },
      el('small', { textContent: s.category }), el('h3', { textContent: s.id }),
      el('p', { textContent: s.look }),
      el('div', { className: 'zrow' }, el('b', { textContent: 'Uygun: ' }), s.bestFor),
      el('div', { className: 'zrow' }, el('b', { textContent: 'Motor: ' }), s.engine),
      el('div', { className: 'zbtns' },
        el('button', { type: 'button', className: 'btn primary', textContent: 'Bu stili seç', onclick: () => { d.close(); pick(s.id, `${s.id} · ${s.category}`); } }),
        el('button', { type: 'button', className: 'btn ghost', textContent: '‹ Önceki', onclick: () => go(-1) }),
        el('button', { type: 'button', className: 'btn ghost', textContent: 'Sonraki ›', onclick: () => go(1) }),
        el('button', { type: 'button', className: 'btn ghost', textContent: 'Kapat', onclick: () => d.close() }))));
  d.onkeydown = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  if (!d.open) d.showModal();
}

// ---------- jobs list ----------
async function refreshJobs() {
  try { state.jobs = await api('/api/jobs'); } catch { return; }
  renderJobList();
}
function renderJobList() {
  const box = $('#jobList'); box.textContent = '';
  if (!state.jobs.length) box.append(el('div', { className: 'hint', style: 'padding:8px 10px', textContent: 'Henüz video yok.' }));
  for (const j of state.jobs) {
    box.append(el('button', { className: 'job' + (state.current === j.id ? ' on' : ''), onclick: () => openJob(j.id) },
      el('span', { className: 'dot ' + j.status }),
      el('span', {}, el('span', { className: 't', textContent: j.topic }), el('span', { className: 's', textContent: `${STATUS[j.status] || j.status} · ${ago(j.createdAt)}` }))));
  }
}

// ---------- job view ----------
function wireJobView() {
  $('#showTools').addEventListener('change', (e) => $('#feed').classList.toggle('hide-tools', !e.target.checked));
  $('#stopBtn').addEventListener('click', () => api(`/api/jobs/${state.current}/stop`, { method: 'POST' }).catch((e) => alert(e.message)));
  $('#delBtn').addEventListener('click', async () => {
    if (!confirm('Bu iş kaydı silinsin mi? (Üretilen video dosyaları diskte kalır.)')) return;
    await api(`/api/jobs/${state.current}`, { method: 'DELETE' }); await refreshJobs(); showNew();
  });
  $('#reply').addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = $('#replyText').value.trim(); if (!t) return;
    await sendReply(t);
  });
  $('#replyText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#reply').requestSubmit(); } });
  $('#replyText').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; });
  for (const b of document.querySelectorAll('.doc .tabs button')) b.addEventListener('click', () => {
    state.doc = b.dataset.t; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); loadDoc();
  });
}
async function sendReply(text) {
  try { await api(`/api/jobs/${state.current}/reply`, { method: 'POST', body: { text } }); $('#replyText').value = ''; $('#replyText').style.height = 'auto'; }
  catch (err) { alert(err.message); }
}
function closeStream() { if (state.es) { state.es.close(); state.es = null; } }

async function openJob(id) {
  closeStream(); state.current = id; state.picked = null; state.feedCount = 0; location.hash = id;
  $('#viewNew').hidden = true; $('#viewJob').hidden = false;
  $('#feed').textContent = ''; $('#docBody').textContent = 'Henüz yok.';
  renderJobList();
  const hist = await api(`/api/jobs/${id}/history`);
  for (const ev of hist) addEvent(ev);
  const es = state.es = new EventSource(`/api/jobs/${id}/events`);
  es.addEventListener('job', (e) => { if (state.current === id) renderJob(JSON.parse(e.data)); });
  es.addEventListener('event', (e) => { if (state.current === id) { const ev = JSON.parse(e.data); if (ev.i > state.feedCount) addEvent(ev); } });
}

function addEvent(ev) {
  state.feedCount = Math.max(state.feedCount, ev.i || 0);
  const feed = $('#feed'); const th = $('.thinking', feed); if (th) th.remove();
  let n;
  if (ev.kind === 'say') n = el('div', { className: 'msg say' }, el('div', { className: 'bub', textContent: ev.text }));
  else if (ev.kind === 'user') n = el('div', { className: 'msg user' }, el('div', { className: 'bub', textContent: ev.text }));
  else if (ev.kind === 'tool') n = el('div', { className: 'msg tool' }, el('code', { textContent: ev.tool }), el('span', { textContent: ev.text, title: ev.text }));
  else n = el('div', { className: 'msg ' + ev.kind }, el('div', { className: 'bub', textContent: ev.text }));
  const stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  feed.append(n);
  if (state.running) feed.append(thinking());
  if (stick) feed.scrollTop = feed.scrollHeight;
}
const thinking = () => el('div', { className: 'thinking' }, el('i'), el('i'), el('i'));

let lastOutsKey = '';
function renderJob(j) {
  state.running = j.running;
  $('#jTitle').textContent = j.topic;
  const s = j.settings;
  const meta = $('#jMeta'); meta.textContent = '';
  const parts = [`${s.format}`, `~${s.duration} sn`, state.cfg.languages[s.language], s.style === 'auto' ? 'stil: otomatik' : s.style, s.mode === 'auto' ? 'otopilot' : 'adım adım'];
  if (j.cost) parts.push(`$${j.cost.toFixed(2)} (Claude kullanımı)`);
  if (j.running) parts.push('süre ' + fmtTime(Date.now() - j.startedTurnAt));
  for (const p of parts) meta.append(el('span', { textContent: p }));
  const b = $('#jBadge'); b.textContent = STATUS[j.status] || j.status; b.className = 'badge ' + j.status;
  $('#stopBtn').hidden = !j.running;
  // reply box: any time the agent is not running (answers, approvals, revisions)
  $('#reply').hidden = j.running || !j.sessionId;
  const quick = $('#quick'); quick.textContent = '';
  if (!j.running && j.sessionId) {
    const opts = j.status === 'waiting' ? ['Onaylıyorum, devam et', 'Sen karar ver'] : j.status === 'done' ? ['v2 yap: ritmi biraz hızlandır', 'Yatay (16:9) versiyonunu da çıkar'] : j.status === 'failed' ? ['Kaldığın yerden devam et'] : [];
    for (const o of opts) quick.append(el('button', { className: 'chip', textContent: o, onclick: () => sendReply(o) }));
  }
  quick.hidden = !quick.children.length;
  const feed = $('#feed'); const th = $('.thinking', feed);
  if (j.running && !th) feed.append(thinking()); else if (!j.running && th) th.remove();

  const ol = $('#stages'); ol.textContent = '';
  for (const st of j.stages) ol.append(el('li', { className: (st.done ? 'done ' : '') + (st.current ? 'current' : '') }, el('i'), st.label));

  renderOutputs(j);
  loadDoc();
  const idx = state.jobs.findIndex((x) => x.id === j.id);
  if (idx >= 0 && state.jobs[idx].status !== j.status) refreshJobs();
}

function renderOutputs(j) {
  const vids = j.outputs.filter((o) => o.kind !== 'file');
  const key = JSON.stringify(vids.map((o) => [o.name, o.mtime])) + state.picked;
  if (key === lastOutsKey) return; lastOutsKey = key;
  const stage = $('#stage'), outs = $('#outs'); outs.textContent = '';
  const best = vids.find((o) => o.kind === 'video') || vids.find((o) => o.kind === 'draft');
  const pick = vids.find((o) => o.name === state.picked) || best;
  if (!pick) {
    stage.textContent = '';
    stage.append(el('div', { className: 'empty' + (j.running ? '' : ' idle') }, el('div', { className: 'spin' }), el('p', { textContent: j.running ? 'Video hazırlanıyor…' : 'Henüz çıktı yok.' })));
    return;
  }
  const same = stage.firstChild?.dataset?.src === pick.url;
  if (!same) {
    stage.textContent = '';
    const node = pick.kind === 'image' ? el('img', { src: pick.url + '?t=' + pick.mtime }) : el('video', { src: pick.url + '?t=' + pick.mtime, controls: true, playsInline: true, loop: true });
    node.dataset.src = pick.url; stage.append(node);
  }
  for (const o of vids) {
    const label = o.kind === 'video' ? 'final' : o.kind === 'draft' ? 'ara çıktı' : 'görsel';
    outs.append(el('div', { className: 'out' },
      el('span', { className: 'n' + (o === pick ? ' on' : ''), onclick: () => { state.picked = o.name; renderOutputs(j); } }, o.name, el('span', { className: 'k', textContent: `${label} · ${mb(o.size)}` })),
      el('a', { href: o.url + '?download', textContent: 'İndir' })));
  }
}

let docTimer = 0, docKey = '';
async function loadDoc() {
  clearTimeout(docTimer);
  docTimer = setTimeout(async () => {
    const id = state.current; if (!id) return;
    const t = await fetch(`/api/jobs/${id}/${state.doc}`).then((r) => r.text()).catch(() => '');
    if (id !== state.current) return;
    const k = id + state.doc + t.length; if (k === docKey) return; docKey = k;
    $('#docBody').textContent = t.trim() || 'Henüz yok.';
  }, 400);
}

boot();
