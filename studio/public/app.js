const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { 'content-type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

const STATUS = { queued: 'Sırada', running: 'Çalışıyor', waiting: 'Yanıtını bekliyor', done: 'Tamamlandı', failed: 'Hata', stopped: 'Durduruldu' };
const VOICE = { local: 'yerel ses', none: 'sessiz', paid: 'ücretli TTS' };
const EXAMPLES = ['Sonbaharda yapraklar neden sararır?', 'Pomodoro tekniği 30 saniyede', 'Kara delikler nasıl oluşur?', 'Evde kahve demlemenin 5 püf noktası', 'Bileşik faiz nedir?'];
const ZOOM_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>';

const TEMPLATES = [
  { emoji: '🔬', name: 'Bilim Merak', niche: 'Günlük hayattaki olayların ardındaki bilimi kısa ve net anlatan kanal: yapraklar neden sararır, kara delikler nasıl oluşur…', audience: 'Meraklı genel izleyici, 15–45 yaş', tone: 'Sakin, öğretici, meraklı', rules: 'Her video bir soruyla başlasın. Tek ana fikir anlat. Kesin olmayan rakam verme; iddiaları kaynak listesine yaz.', styles: ['science-lab', 'marker-whiteboard', 'cosmos-scale'] },
  { emoji: '🗺️', name: 'Tarihin Haritası', niche: 'Savaşlar, ticaret yolları ve imparatorlukları harita ve zaman çizelgesi üzerinde anlatan tarih kanalı.', audience: 'Tarih meraklıları, öğrenciler', tone: 'Ciddi ama akıcı, hikâye anlatıcı', rules: 'Tarihleri ve yer adlarını doğrula. Tek bir olaya odaklan. Taraf tutan dil kullanma.', styles: ['history-map-campaign', 'timeline-chronicle', 'archival-newsreel'] },
  { emoji: '💸', name: 'Para Okur-Yazarlığı', niche: 'Bileşik faiz, enflasyon, bütçe gibi kişisel finans kavramlarını sade anlatan kanal.', audience: '20–40 yaş, finansa yeni başlayanlar', tone: 'Net, sakin, abartısız', rules: 'Yatırım tavsiyesi verme. Rakamlı örnekleri “örnek” diye belirt. Her videoda tek kavram.', styles: ['budget-infographic', 'data-story', 'receipt-roll'] },
  { emoji: '➗', name: 'Matematik Cebi', niche: 'Sonsuzluk, asal sayılar, Pi gibi matematik fikirlerini görsel olarak anlatan kanal.', audience: 'Lise ve üniversite öğrencileri, meraklılar', tone: 'Zarif, merak uyandıran', rules: 'Önce görsel sezgi, sonra formül. Formülleri ekranda okunur tut.', styles: ['math-explainer', 'chalkboard-lesson'] },
  { emoji: '🌿', name: 'Doğa Defteri', niche: 'Kuşlar, mantarlar, mevsimler ve ekosistemler üzerine saha defteri tadında kısa belgeseller.', audience: 'Doğa severler', tone: 'Dingin, gözleme dayalı', rules: 'Tür adlarını doğrula. Nadir türlerin tam konumunu verme.', styles: ['nature-field-notes', 'watercolor-wash', 'sketchbook-pencil'] },
  { emoji: '🗣️', name: 'Dil Kartları', niche: 'Her videoda tek bir yabancı dil kelimesi veya kalıbı: anlam, örnek cümle, telaffuz ipucu.', audience: 'Dil öğrenenler', tone: 'Neşeli, tekrarı seven', rules: 'Her video aynı yapıda: kelime, anlam, 2 örnek, mini quiz.', styles: ['language-flashcards', 'quiz-countdown'] },
  { emoji: '❓', name: 'Mini Quiz', niche: '“Bilir misin?” formatında hızlı bilgi yarışması videoları.', audience: 'Herkes', tone: 'Hızlı, eğlenceli', rules: '3 soru, geri sayım, cevap sonda. Sorular kesin doğru olmalı.', styles: ['quiz-countdown', 'kinetic-captions'] },
  { emoji: '🤖', name: 'Yapay Zekâ Sözlüğü', niche: 'Yapay zekâ terimlerini (token, embedding, ajan…) 30 saniyede açıklayan kanal.', audience: 'Teknolojiye ilgili genel izleyici', tone: 'Sade, jargonsuz', rules: 'Jargonu ilk kullanımda tanımla. Güncelliğini yitirebilecek iddialardan kaçın.', styles: ['ai-agent-flow', 'terminal-crt', 'keynote-dark'] },
];

const state = {
  cfg: null, jobs: [], channels: [], ch: null, route: { v: 'home' },
  es: null, current: null, running: false, feedCount: 0,
  style: 'auto', format: '9:16', mode: 'auto', doc: 'script', picked: null,
  chOv: { style: null, dur: false }, chIdea: null, sel: new Set(), genBusy: false, chTab: 'ideas',
};

// ---------- helpers ----------
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'şimdi'; if (s < 3600) return `${Math.floor(s / 60)} dk önce`; if (s < 86400) return `${Math.floor(s / 3600)} sa önce`; return new Date(t).toLocaleDateString('tr-TR'); };
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const chById = (id) => state.channels.find((c) => c.id === id);
const styleText = (l) => (!l || !l.length ? 'Otomatik' : l.length === 1 ? l[0] : `${l.length} stil · sırayla`);
let toastT = 0;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200);
}
function avatar(ch, big) {
  const h = hue(ch.name);
  return el('div', { className: 'av' + (big ? ' lg' : ''), style: `background:hsl(${h} 45% 18%);border-color:hsl(${h} 55% 38%)`, textContent: ch.emoji || '🎬' });
}

// ---------- boot / routing ----------
async function boot() {
  const [cfg, health] = await Promise.all([api('/api/config'), api('/api/health')]);
  state.cfg = cfg;
  for (const sel of [$('#language'), $('#cLang')]) for (const [k, v] of Object.entries(cfg.languages)) sel.append(el('option', { value: k, textContent: v }));
  $('#language').value = 'tr';
  renderHealth(health);
  for (const ex of EXAMPLES) $('#examples').append(el('button', { type: 'button', className: 'chip', textContent: ex, onclick: () => { $('#topic').value = ex; $('#topic').focus(); } }));
  wireComposer(); wireStylePicker(); wireJobView(); wireChannel(); wireChannelDialog(); wirePublish();
  const q = new URLSearchParams(location.search);
  if (q.has('connected') || q.has('connect_error')) {
    q.has('connected') ? toast(`YouTube bağlandı: ${q.get('connected')}`) : toast(`Bağlantı başarısız: ${q.get('connect_error')}`, true);
    history.replaceState(null, '', location.pathname + location.hash);
  }
  await refreshAll();
  window.addEventListener('hashchange', render);
  render();
  setInterval(async () => { await refreshAll(); if (state.route.v === 'home') renderHome(); if (state.route.v === 'channel') await loadChannel(true); }, 5000);
}
function renderHealth(h) {
  const box = $('#health'); box.textContent = '';
  const pill = (ok, t) => box.append(el('span', { className: 'pill' + (ok ? '' : ' bad'), title: ok ? '' : 'Eksik' }, el('i'), t));
  pill(h.claude, 'Claude Code'); pill(h.ffmpeg, 'ffmpeg'); pill(h.python, 'Python'); pill(h.tts.local, 'Yerel ses');
  if (!h.claude) { $('#formErr').textContent = '“claude” komutu bulunamadı. Claude Code kurulu ve PATH’te olmalı.'; $('#formErr').hidden = false; }
}
function parseRoute() {
  const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/');
  if (!a) return { v: 'home' };
  if (a === 'new') return { v: 'new' };
  if (a === 'c' && b) return { v: 'channel', id: b, tab: c || 'ideas' };
  if (a === 'j' && b) return { v: 'job', id: b };
  return { v: 'home' };
}
async function render() {
  state.route = parseRoute();
  const r = state.route;
  for (const v of ['Home', 'New', 'Channel', 'Job']) $('#view' + v).hidden = r.v !== v.toLowerCase();
  if (r.v !== 'job') closeStream();
  if (r.v !== 'job') state.current = null;
  renderSide();
  if (r.v === 'home') renderHome();
  else if (r.v === 'new') $('#topic').focus();
  else if (r.v === 'channel') await openChannel(r.id, r.tab);
  else if (r.v === 'job') await openJob(r.id);
  $('.main').scrollTop = 0;
}
async function refreshAll() {
  try { [state.jobs, state.channels] = await Promise.all([api('/api/jobs'), api('/api/channels')]); } catch { return; }
  renderSide();
}

// ---------- sidebar ----------
function renderSide() {
  const cl = $('#chList'); cl.textContent = '';
  if (!state.channels.length) cl.append(el('div', { className: 'hint pad', textContent: 'Henüz kanal yok.' }));
  for (const c of state.channels) {
    const on = state.route.v === 'channel' && state.route.id === c.id;
    cl.append(el('a', { className: 'ch' + (on ? ' on' : ''), href: `#/c/${c.id}` }, avatar(c),
      el('span', { className: 'cn' }, el('b', { textContent: c.name }), el('small', { textContent: `${c.videos} video${c.ideaCount ? ` · ${c.ideaCount} fikir` : ''}` })),
      c.running ? el('span', { className: 'dot running' }) : null));
  }
  const jl = $('#jobList'); jl.textContent = '';
  if (!state.jobs.length) jl.append(el('div', { className: 'hint pad', textContent: 'Henüz video yok.' }));
  for (const j of state.jobs.slice(0, 12)) {
    const ch = chById(j.channelId);
    jl.append(el('a', { className: 'job' + (state.route.v === 'job' && state.route.id === j.id ? ' on' : ''), href: `#/j/${j.id}` },
      el('span', { className: 'dot ' + j.status }),
      el('span', {}, el('span', { className: 't', textContent: j.topic }),
        el('span', { className: 's', textContent: `${ch ? ch.emoji + ' ' : ''}${STATUS[j.status] || j.status}${j.status === 'queued' && j.queuePos ? ` #${j.queuePos}` : ''} · ${ago(j.createdAt)}` }))));
  }
}

// ---------- home ----------
function jobCard(j) {
  const ch = chById(j.channelId);
  const thumb = el('div', { className: 'thumb' });
  if (j.video) thumb.append(el('video', { src: j.video + '#t=0.6', muted: true, preload: 'metadata', playsInline: true }));
  else thumb.append(el('div', { className: 'ph' }, el('span', { textContent: j.status === 'running' ? '⚙' : j.status === 'queued' ? '⏳' : '🎬' })));
  if (j.status === 'running' || j.status === 'queued') thumb.append(el('div', { className: 'bar' }, el('i', { style: `width:${Math.max(4, Math.round(j.progress * 100))}%` })));
  return el('a', { className: 'vcard', href: `#/j/${j.id}` }, thumb,
    el('div', { className: 'vinfo' }, el('b', { textContent: j.topic }),
      el('small', {}, el('span', { className: 'dot ' + j.status }), ` ${STATUS[j.status] || j.status}${j.status === 'queued' && j.queuePos ? ` #${j.queuePos}` : ''} · ${ago(j.createdAt)}`, ch ? ` · ${ch.emoji} ${ch.name}` : '')));
}
function renderHome() {
  const st = $('#stats'); st.textContent = '';
  const stat = (n, l) => st.append(el('div', { className: 'stat' }, el('b', { textContent: n }), el('span', { textContent: l })));
  stat(state.channels.length, 'kanal'); stat(state.jobs.filter((j) => j.hasVideo).length, 'video hazır');
  stat(state.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length, 'çalışan / sırada');
  stat(state.channels.reduce((a, c) => a + c.ideaCount, 0), 'bekleyen fikir');
  const g = $('#chGrid'); g.textContent = '';
  for (const c of state.channels) {
    g.append(el('a', { className: 'chcard', href: `#/c/${c.id}` },
      el('div', { className: 'top' }, avatar(c), el('div', {}, el('b', { textContent: c.name }), el('small', { textContent: `${c.format} · ~${c.duration} sn · ${state.cfg.languages[c.language]}` })),
        c.running ? el('span', { className: 'badge running', textContent: `${c.running} çalışıyor` }) : null),
      el('p', { textContent: c.niche || 'Konu tanımı yok.' }),
      el('div', { className: 'foot' }, el('span', { textContent: `${c.videos} video` }), el('span', { textContent: `${c.ideaCount} fikir` }), el('span', { textContent: c.lastAt ? `son: ${ago(c.lastAt)}` : 'henüz video yok' }))));
  }
  g.append(el('button', { className: 'chcard add', onclick: () => openChannelDialog(null) }, el('span', { textContent: '＋' }), 'Yeni kanal'));
  if (state.channels.length < 4) {
    g.append(el('div', { className: 'tplwrap' }, el('small', { textContent: 'Şablondan başla' }), el('div', { className: 'tplrow' },
      TEMPLATES.map((t) => el('button', { className: 'chip', type: 'button', textContent: `${t.emoji} ${t.name}`, onclick: () => openChannelDialog(null, t) })))));
  }
  const rg = $('#recentGrid'); rg.textContent = '';
  const recent = state.jobs.slice(0, 8);
  $('#recentTitle').hidden = !recent.length;
  for (const j of recent) rg.append(jobCard(j));
}

// ---------- quick composer ----------
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
  $('#styleBtn').addEventListener('click', () => openStylePicker({ allowAuto: true, selected: state.style === 'auto' ? [] : [state.style],
    onDone: (l) => { state.style = l[0] || 'auto'; $('#styleLabel').textContent = l[0] ? l[0] : 'Otomatik · konuya göre seç'; } }));
  $('#topic').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#form').requestSubmit(); });
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#goBtn'); btn.disabled = true; $('#formErr').hidden = true;
    try {
      const job = await api('/api/jobs', { method: 'POST', body: {
        topic: $('#topic').value,
        settings: { language: $('#language').value, duration: +$('#duration').value, format: state.format, style: state.style, voice: $('#voice').value, mode: state.mode, notes: $('#notes').value },
      } });
      $('#topic').value = ''; await refreshAll(); location.hash = '#/j/' + job.id;
    } catch (err) { $('#formErr').textContent = err.message; $('#formErr').hidden = false; }
    btn.disabled = false;
  });
}

// ---------- style picker (single or multi) ----------
const sp = { multi: false, sel: new Set(), onDone: null, allowAuto: true, cat: 'Tümü' };
function openStylePicker({ multi = false, selected = [], allowAuto = true, onDone }) {
  Object.assign(sp, { multi, sel: new Set(selected), allowAuto, onDone, cat: 'Tümü' });
  $('#styleTitle').textContent = multi ? 'Stil havuzu seç' : 'Stil seç';
  $('#styleDone').hidden = !multi; $('#styleQ').value = '';
  renderStyles(); $('#styleDlg').showModal();
}
function pickStyle(id) {
  if (sp.multi) { sp.sel.has(id) ? sp.sel.delete(id) : sp.sel.add(id); renderStyles(true); return; }
  $('#styleDlg').close(); sp.onDone?.(id === 'auto' ? [] : [id]);
}
function wireStylePicker() {
  const dlg = $('#styleDlg');
  $('#styleClose').addEventListener('click', () => dlg.close());
  $('#styleDone').addEventListener('click', () => { dlg.close(); sp.onDone?.([...sp.sel]); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('#styleQ').addEventListener('input', () => renderStyles());
  $('#zoomDlg').addEventListener('click', (e) => { if (e.target.id === 'zoomDlg') e.target.close(); });
}
function renderStyles(keepScroll) {
  const { styles } = state.cfg, q = $('#styleQ').value.trim().toLowerCase();
  const grid = $('#styleGrid'); const top = grid.scrollTop;
  const cats = ['Tümü', ...new Set(styles.map((s) => s.category))];
  const cbox = $('#styleCats'); cbox.textContent = '';
  for (const c of cats) cbox.append(el('button', { type: 'button', className: 'chip' + (c === sp.cat ? ' on' : ''), textContent: c, onclick: () => { sp.cat = c; renderStyles(); } }));
  grid.textContent = '';
  if (sp.allowAuto && !sp.multi && !q && sp.cat === 'Tümü') {
    grid.append(el('button', { type: 'button', className: 'sty' + (!sp.sel.size ? ' on' : ''), onclick: () => pickStyle('auto') },
      el('div', { className: 'pv', style: 'font-size:34px;color:var(--accent)', textContent: '✦' }),
      el('div', { className: 'tx' }, el('b', { textContent: 'Otomatik' }), el('span', { textContent: 'Ajan konuya ve formata en uygun stili seçer ve nedenini yazar.' }))));
  }
  for (const s of styles) {
    if (sp.cat !== 'Tümü' && s.category !== sp.cat) continue;
    if (q && !(`${s.id} ${s.category} ${s.look} ${s.bestFor}`.toLowerCase().includes(q))) continue;
    const on = sp.sel.has(s.id);
    grid.append(el('button', { type: 'button', className: 'sty' + (on ? ' on' : ''), onclick: () => pickStyle(s.id) },
      el('div', { className: 'pv' }, s.preview ? el('img', { src: `/styles/${s.id}/preview.gif`, loading: 'lazy', alt: s.id }) : '',
        on && sp.multi ? el('span', { className: 'check', textContent: '✓' }) : '',
        s.preview ? el('span', { className: 'zoom', role: 'button', title: 'Büyüt', innerHTML: ZOOM_SVG, onclick: (e) => { e.stopPropagation(); openZoom(s); } }) : ''),
      el('div', { className: 'tx' }, el('b', { textContent: s.id }), el('span', { textContent: s.bestFor }))));
  }
  $('#styleDone').textContent = `Tamam (${sp.sel.size})`;
  if (keepScroll) grid.scrollTop = top;
}
function openZoom(s) {
  const d = $('#zoomDlg'), body = $('#zoomBody'); body.textContent = '';
  const i = state.cfg.styles.filter((x) => x.preview);
  const k = i.findIndex((x) => x.id === s.id);
  const go = (n) => openZoom(i[(k + n + i.length) % i.length]);
  body.append(
    el('div', { className: 'zimg' }, el('img', { src: `/styles/${s.id}/preview.gif`, alt: s.id })),
    el('div', { className: 'zside' },
      el('small', { textContent: s.category }), el('h3', { textContent: s.id }), el('p', { textContent: s.look }),
      el('div', { className: 'zrow' }, el('b', { textContent: 'Uygun: ' }), s.bestFor),
      el('div', { className: 'zrow' }, el('b', { textContent: 'Motor: ' }), s.engine),
      el('div', { className: 'zbtns' },
        el('button', { type: 'button', className: 'btn primary', textContent: sp.multi ? (sp.sel.has(s.id) ? 'Havuzdan çıkar' : 'Havuza ekle') : 'Bu stili seç', onclick: () => { d.close(); pickStyle(s.id); } }),
        el('button', { type: 'button', className: 'btn ghost', textContent: '‹ Önceki', onclick: () => go(-1) }),
        el('button', { type: 'button', className: 'btn ghost', textContent: 'Sonraki ›', onclick: () => go(1) }),
        el('button', { type: 'button', className: 'btn ghost', textContent: 'Kapat', onclick: () => d.close() }))));
  d.onkeydown = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  if (!d.open) d.showModal();
}

// ---------- channel page ----------
function wireChannel() {
  $('#addChannel').addEventListener('click', () => openChannelDialog(null));
  $('#homeNewCh').addEventListener('click', () => openChannelDialog(null));
  $('#chEdit').addEventListener('click', () => state.ch && openChannelDialog(state.ch));
  $('#chDel').addEventListener('click', async () => {
    if (!state.ch || !confirm(`“${state.ch.name}” kanalı silinsin mi? Videolar ve fikirler listeden kalkar, dosyalar diskte kalır.`)) return;
    await api(`/api/channels/${state.ch.id}`, { method: 'DELETE' }); await refreshAll(); location.hash = '#/';
  });
  $$('#viewChannel .tabs.big button').forEach((b) => b.addEventListener('click', () => { location.hash = `#/c/${state.route.id}/${b.dataset.t}`; }));
  $('#chDur').addEventListener('input', (e) => { state.chOv.dur = true; $('#chDurOut').textContent = e.target.value + ' sn'; });
  $('#chStyleBtn').addEventListener('click', () => openStylePicker({ allowAuto: true, selected: state.chOv.style ? [state.chOv.style] : [],
    onDone: (l) => { state.chOv.style = l[0] || null; $('#chStyleLabel').textContent = l[0] || 'Kanal stili'; } }));
  $('#chGo').addEventListener('click', () => produce($('#chTopic').value, state.chIdea));
  $('#chTopic').addEventListener('input', () => { state.chIdea = null; });
  $('#chTopic').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#chGo').click(); });
  $('#ideaGen').addEventListener('click', genIdeas);
  $('#ideaAngle').addEventListener('keydown', (e) => { if (e.key === 'Enter') genIdeas(); });
  $('#batchClear').addEventListener('click', () => { state.sel.clear(); renderIdeas(); });
  $('#batchGo').addEventListener('click', async () => {
    const ideas = state.ch.ideas.filter((i) => state.sel.has(i.id)); if (!ideas.length) return;
    $('#batchGo').disabled = true;
    let n = 0;
    for (const i of ideas) { try { await createJob(i.title, i.id); n++; } catch (e) { toast(e.message, true); break; } }
    state.sel.clear(); $('#batchGo').disabled = false;
    toast(`${n} video sıraya alındı.`); await refreshAll(); await loadChannel(true);
    if (n) location.hash = `#/c/${state.route.id}/videos`;
  });
}
function jobOverrides() {
  const o = {}, ch = state.ch;
  if (state.chOv.dur) o.duration = +$('#chDur').value;
  if ($('#chMode').value) o.mode = $('#chMode').value;
  if (state.chOv.style) o.style = state.chOv.style;
  if ($('#chNotes').value.trim()) o.notes = $('#chNotes').value.trim();
  return o;
}
async function createJob(topic, ideaId) {
  return api('/api/jobs', { method: 'POST', body: { topic, channelId: state.ch.id, ideaId: ideaId || undefined, settings: jobOverrides() } });
}
async function produce(topic, ideaId) {
  $('#chErr').hidden = true;
  if (!topic.trim()) { $('#chErr').textContent = 'Bir konu yaz veya fikir seç.'; $('#chErr').hidden = false; return; }
  $('#chGo').disabled = true;
  try { const j = await createJob(topic, ideaId); $('#chTopic').value = ''; state.chIdea = null; await refreshAll(); location.hash = '#/j/' + j.id; }
  catch (e) { $('#chErr').textContent = e.message; $('#chErr').hidden = false; }
  $('#chGo').disabled = false;
}
async function loadChannel(quiet) {
  const id = state.route.id; if (!id) return;
  try { const c = await api(`/api/channels/${id}`); if (state.route.id !== id) return; state.ch = c; renderChannel(); }
  catch (e) { if (!quiet) { toast(e.message, true); location.hash = '#/'; } }
}
async function openChannel(id, tab) {
  state.chTab = tab === 'videos' ? 'videos' : 'ideas';
  if (!state.ch || state.ch.id !== id) {
    state.ch = null; state.sel.clear(); state.chIdea = null; state.chOv = { style: null, dur: false };
    $('#chTopic').value = ''; $('#chNotes').value = ''; $('#chMode').value = ''; $('#chStyleLabel').textContent = 'Kanal stili'; $('#ideaAngle').value = '';
  }
  await loadChannel();
  if (state.ch && !state.chOv.dur) { $('#chDur').value = state.ch.duration; $('#chDurOut').textContent = state.ch.duration + ' sn'; }
}
function renderChannel() {
  const c = state.ch; if (!c) return;
  const av = $('#chAv'); av.replaceWith(Object.assign(avatar(c, true), { id: 'chAv' }));
  $('#chName').textContent = c.name; $('#chNiche').textContent = c.niche || '';
  const tags = $('#chTags'); tags.textContent = '';
  for (const t of [c.format, `~${c.duration} sn`, state.cfg.languages[c.language], VOICE[c.voice], c.mode === 'auto' ? 'otopilot' : 'adım adım', `stil: ${styleText(c.styles)}`, c.tone && `ton: ${c.tone}`].filter(Boolean)) tags.append(el('span', { className: 'tag', textContent: t }));
  if (!state.chOv.dur) { $('#chDur').value = c.duration; $('#chDurOut').textContent = c.duration + ' sn'; }
  const jobs = state.jobs.filter((j) => j.channelId === c.id);
  const fresh = c.ideas.filter((i) => i.status === 'new');
  $('#cntIdeas').textContent = fresh.length || ''; $('#cntVideos').textContent = jobs.length || '';
  $$('#viewChannel .tabs.big button').forEach((b) => b.classList.toggle('on', b.dataset.t === state.chTab));
  $('#paneIdeas').hidden = state.chTab !== 'ideas'; $('#paneVideos').hidden = state.chTab !== 'videos';
  renderIdeas();
  const vg = $('#chVideos'); vg.textContent = '';
  if (!jobs.length) vg.append(el('div', { className: 'emptybox', textContent: 'Bu kanalda henüz video yok. Bir konu yaz veya fikir bankasından üret.' }));
  for (const j of jobs) vg.append(jobCard(j));
  const gen = $('#ideaGen'); gen.disabled = state.genBusy || c.generating; gen.textContent = state.genBusy || c.generating ? 'Üretiliyor…' : '✦ Fikir üret';
}
function renderIdeas() {
  const c = state.ch; const box = $('#ideaList'); box.textContent = '';
  if (!c) return;
  if (state.genBusy) for (let i = 0; i < 3; i++) box.append(el('div', { className: 'idea skel' }, el('i'), el('i'), el('i')));
  const fresh = c.ideas.filter((i) => i.status === 'new'), used = c.ideas.filter((i) => i.status === 'used');
  state.sel = new Set([...state.sel].filter((id) => fresh.some((i) => i.id === id)));
  if (!fresh.length && !state.genBusy) box.append(el('div', { className: 'emptybox' }, el('b', { textContent: 'Fikir bankası boş' }), el('span', { textContent: 'Yukarıdaki “Fikir üret” ile kanalın nişine uygun, önceki konuları tekrarlamayan fikirler al.' })));
  for (const i of fresh) {
    const cb = el('input', { type: 'checkbox', checked: state.sel.has(i.id), onchange: (e) => { e.target.checked ? state.sel.add(i.id) : state.sel.delete(i.id); updateBatch(); } });
    box.append(el('div', { className: 'idea' + (state.sel.has(i.id) ? ' sel' : '') }, el('label', { className: 'ck' }, cb),
      el('div', { className: 'ib' }, el('b', { textContent: i.title }), i.hook ? el('p', { className: 'hk', textContent: `“${i.hook}”` }) : null, i.angle ? el('small', { textContent: i.angle }) : null),
      el('div', { className: 'ia' },
        el('button', { className: 'btn primary sm', textContent: 'Üret', onclick: () => produce(i.title, i.id) }),
        el('button', { className: 'btn ghost sm', textContent: 'Düzenle', onclick: () => { $('#chTopic').value = i.title; state.chIdea = i.id; $('#chTopic').focus(); $('.main').scrollTop = 0; } }),
        el('button', { className: 'btn ghost sm danger', title: 'Fikri sil', textContent: '✕', onclick: async () => { state.ch = await api(`/api/channels/${c.id}/ideas/${i.id}`, { method: 'DELETE' }); renderChannel(); } }))));
  }
  if (used.length) {
    const d = el('details', { className: 'usedideas' }, el('summary', { textContent: `Üretilenler (${used.length})` }));
    for (const i of used) d.append(el('div', { className: 'idea used' }, el('div', { className: 'ib' }, el('b', { textContent: i.title })), i.jobId ? el('a', { className: 'btn ghost sm', href: `#/j/${i.jobId}`, textContent: 'Videoyu aç' }) : null));
    box.append(d);
  }
  updateBatch();
}
function updateBatch() {
  const n = state.sel.size; $('#batchBar').hidden = !n; $('#batchTxt').textContent = `${n} fikir seçili`;
  $$('.idea').forEach((d) => d.classList.toggle('sel', !!d.querySelector('input:checked')));
}
async function genIdeas() {
  const c = state.ch; if (!c || state.genBusy) return;
  state.genBusy = true; renderChannel();
  try {
    const r = await api(`/api/channels/${c.id}/ideas`, { method: 'POST', body: { count: +$('#ideaCount').value, angle: $('#ideaAngle').value } });
    if (state.ch?.id === c.id) state.ch = r.channel;
    toast(`${r.added.length} yeni fikir eklendi.`);
  } catch (e) { toast(e.message, true); }
  state.genBusy = false; if (state.route.v === 'channel') { await loadChannel(true); }
}

// ---------- channel dialog ----------
const cd = { id: null, styles: [] };
function wireChannelDialog() {
  const dlg = $('#chDlg');
  $('#chDlgClose').addEventListener('click', () => dlg.close());
  $('#cDur').addEventListener('input', (e) => { $('#cDurOut').textContent = e.target.value + ' sn'; });
  $('#cStyleBtn').addEventListener('click', () => openStylePicker({ multi: true, selected: cd.styles, onDone: (l) => { cd.styles = l; $('#cStyleLabel').textContent = styleText(l); } }));
  $('#chForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#cErr').hidden = true;
    const body = { name: $('#cName').value, emoji: $('#cEmoji').value, niche: $('#cNiche').value, audience: $('#cAudience').value, tone: $('#cTone').value, rules: $('#cRules').value,
      styles: cd.styles, language: $('#cLang').value, format: $('#cFormat').value, duration: +$('#cDur').value, voice: $('#cVoice').value, mode: $('#cMode').value };
    try {
      const c = cd.id ? await api(`/api/channels/${cd.id}`, { method: 'PUT', body }) : await api('/api/channels', { method: 'POST', body });
      dlg.close(); await refreshAll(); if (cd.id) { state.ch = c; renderChannel(); } else location.hash = `#/c/${c.id}`;
    } catch (err) { $('#cErr').textContent = err.message; $('#cErr').hidden = false; }
  });
}
function fillChannelForm(c) {
  cd.styles = [...(c.styles || [])];
  $('#cName').value = c.name || ''; $('#cEmoji').value = c.emoji || ''; $('#cNiche').value = c.niche || ''; $('#cAudience').value = c.audience || ''; $('#cTone').value = c.tone || ''; $('#cRules').value = c.rules || '';
  $('#cLang').value = c.language || 'tr'; $('#cFormat').value = c.format || '9:16'; $('#cDur').value = c.duration || 35; $('#cDurOut').textContent = (c.duration || 35) + ' sn';
  $('#cVoice').value = c.voice || 'local'; $('#cMode').value = c.mode || 'auto'; $('#cStyleLabel').textContent = styleText(cd.styles);
}
function openChannelDialog(ch, tpl) {
  cd.id = ch ? ch.id : null;
  $('#chDlgTitle').textContent = ch ? 'Kanalı düzenle' : 'Yeni kanal';
  fillChannelForm(ch || tpl || {});
  const row = $('#tplRow'); row.textContent = ''; row.hidden = !!ch;
  if (!ch) { row.append(el('small', { textContent: 'Şablondan başla:' }), ...TEMPLATES.map((t) => el('button', { type: 'button', className: 'chip', textContent: `${t.emoji} ${t.name}`, onclick: () => fillChannelForm(t) }))); }
  $('#cErr').hidden = true; $('#chDlg').showModal(); $('#cName').focus();
}

// ---------- job view ----------
function wireJobView() {
  $('#showTools').addEventListener('change', (e) => $('#feed').classList.toggle('hide-tools', !e.target.checked));
  $('#stopBtn').addEventListener('click', () => api(`/api/jobs/${state.current}/stop`, { method: 'POST' }).catch((e) => toast(e.message, true)));
  $('#delBtn').addEventListener('click', async () => {
    if (!confirm('Bu iş kaydı silinsin mi? (Üretilen video dosyaları diskte kalır.)')) return;
    const back = $('#jCrumb').getAttribute('href');
    await api(`/api/jobs/${state.current}`, { method: 'DELETE' }); await refreshAll(); location.hash = back || '#/';
  });
  $('#reply').addEventListener('submit', async (e) => { e.preventDefault(); const t = $('#replyText').value.trim(); if (t) await sendReply(t); });
  $('#replyText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#reply').requestSubmit(); } });
  $('#replyText').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; });
  for (const b of $$('.doc .tabs button')) b.addEventListener('click', () => { state.doc = b.dataset.t; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); loadDoc(); });
}
async function sendReply(text) {
  try { await api(`/api/jobs/${state.current}/reply`, { method: 'POST', body: { text } }); $('#replyText').value = ''; $('#replyText').style.height = 'auto'; }
  catch (err) { toast(err.message, true); }
}
function closeStream() { if (state.es) { state.es.close(); state.es = null; } }

async function openJob(id) {
  closeStream(); state.current = id; state.picked = null; state.feedCount = 0; state.running = false; lastOutsKey = ''; docKey = '';
  $('#feed').textContent = ''; $('#docBody').textContent = 'Henüz yok.';
  let hist;
  try { hist = await api(`/api/jobs/${id}/history`); } catch { toast('Video bulunamadı.', true); location.hash = '#/'; return; }
  for (const ev of hist) addEvent(ev);
  if (state.current !== id) return;
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
  const ch = chById(j.channelId), crumb = $('#jCrumb');
  crumb.hidden = false; crumb.href = ch ? `#/c/${ch.id}/videos` : '#/'; crumb.textContent = ch ? `‹ ${ch.emoji} ${ch.name}` : '‹ Ana sayfa';
  const s = j.settings;
  const meta = $('#jMeta'); meta.textContent = '';
  const parts = [s.format, `~${s.duration} sn`, state.cfg.languages[s.language], s.style === 'auto' ? 'stil: otomatik' : s.style, s.mode === 'auto' ? 'otopilot' : 'adım adım'];
  if (j.cost) parts.push(`$${j.cost.toFixed(2)} (Claude kullanımı)`);
  if (j.running) parts.push('süre ' + fmtTime(Date.now() - j.startedTurnAt));
  if (j.status === 'queued') parts.push(`sırada${j.queuePos ? ' #' + j.queuePos : ''}`);
  for (const p of parts) meta.append(el('span', { textContent: p }));
  const b = $('#jBadge'); b.textContent = STATUS[j.status] || j.status; b.className = 'badge ' + j.status;
  $('#stopBtn').hidden = !(j.running || j.status === 'queued');
  $('#reply').hidden = j.running || j.status === 'queued' || !j.sessionId;
  const quick = $('#quick'); quick.textContent = '';
  if (!j.running && j.status !== 'queued' && j.sessionId) {
    const opts = j.status === 'waiting' ? ['Onaylıyorum, devam et', 'Sen karar ver'] : j.status === 'done' ? ['v2 yap: ritmi biraz hızlandır', 'Yatay (16:9) versiyonunu da çıkar'] : j.status === 'failed' ? ['Kaldığın yerden devam et'] : [];
    for (const o of opts) quick.append(el('button', { className: 'chip', textContent: o, onclick: () => sendReply(o) }));
  }
  quick.hidden = !quick.children.length;
  const feed = $('#feed'); const th = $('.thinking', feed);
  if (j.running && !th) feed.append(thinking()); else if (!j.running && th) th.remove();
  const ol = $('#stages'); ol.textContent = '';
  for (const st of j.stages) ol.append(el('li', { className: (st.done ? 'done ' : '') + (st.current ? 'current' : '') }, el('i'), st.label));
  renderOutputs(j); loadDoc(); renderPublish(j);
  const row = state.jobs.find((x) => x.id === j.id);
  if (!row || row.status !== j.status) refreshAll();
}
function renderOutputs(j) {
  const vids = j.outputs.filter((o) => o.kind !== 'file');
  const key = JSON.stringify(vids.map((o) => [o.name, o.mtime])) + state.picked + j.running;
  if (key === lastOutsKey) return; lastOutsKey = key;
  const stage = $('#stage'), outs = $('#outs'); outs.textContent = '';
  const best = vids.find((o) => o.kind === 'video') || vids.find((o) => o.kind === 'draft');
  const pick = vids.find((o) => o.name === state.picked) || best;
  if (!pick) {
    stage.textContent = '';
    stage.append(el('div', { className: 'empty' + (j.running ? '' : ' idle') }, el('div', { className: 'spin' }), el('p', { textContent: j.running ? 'Video hazırlanıyor…' : j.status === 'queued' ? 'Sırada bekliyor…' : 'Henüz çıktı yok.' })));
    return;
  }
  if (stage.firstChild?.dataset?.src !== pick.url) {
    stage.textContent = '';
    const node = pick.kind === 'image' ? el('img', { src: pick.url + '?t=' + pick.mtime }) : el('video', { src: pick.url + '?t=' + pick.mtime, controls: true, playsInline: true, loop: true });
    node.dataset.src = pick.url; stage.append(node);
  }
  for (const o of vids) {
    const label = o.kind === 'video' ? 'final' : o.kind === 'draft' ? 'ara çıktı' : 'görsel';
    outs.append(el('div', { className: 'out' },
      el('span', { className: 'n' + (o === pick ? ' on' : ''), onclick: () => { state.picked = o.name; lastOutsKey = ''; renderOutputs(j); } }, o.name, el('span', { className: 'k', textContent: `${label} · ${mb(o.size)}` })),
      el('a', { href: o.url + '?download', textContent: 'İndir' })));
  }
}
// ---------- publish ----------
const pub = { job: null, prov: null, provKey: null, touched: false };
const pubKey = (j) => j.channelId || '_';
async function loadProviders(j) {
  const k = pubKey(j);
  try { pub.prov = await api(`/api/publish/providers?channel=${j.channelId || ''}`); pub.provKey = k; } catch { pub.prov = null; }
}
function wirePublish() {
  $('#pubGen').addEventListener('click', async () => {
    const b = $('#pubGen'); b.disabled = true; b.textContent = 'Hazırlanıyor…';
    try {
      const m = await api(`/api/jobs/${state.current}/publish-meta`, { method: 'POST', body: {} });
      $('#pubTitle').value = m.title; $('#pubDesc').value = m.description; $('#pubTags').value = m.tags.join(', '); pub.touched = true;
    } catch (e) { toast(e.message, true); }
    b.disabled = false; b.textContent = '✦ Metni oluştur';
  });
  for (const id of ['#pubTitle', '#pubDesc', '#pubTags']) $(id).addEventListener('input', () => { pub.touched = true; });
  $('#pubDisc').addEventListener('click', async () => {
    if (!confirm('YouTube hesabının bağlantısı bu kanal için kaldırılsın mı?')) return;
    await api(`/api/publish/youtube?channel=${pub.job.channelId || ''}`, { method: 'DELETE' }); await loadProviders(pub.job); renderPublish(pub.job);
  });
  $('#pubGo').addEventListener('click', async () => {
    const j = pub.job, yt = pub.prov?.youtube;
    if (!yt?.configured) { toast('YouTube istemci bilgileri eksik: studio/.env içine YOUTUBE_CLIENT_ID ve YOUTUBE_CLIENT_SECRET ekle.', true); return; }
    if (!yt.connected) {
      try { const r = await api('/api/publish/youtube/connect', { method: 'POST', body: { channel: j.channelId || null, ret: `#/j/${j.id}` } }); location.href = r.url; } catch (e) { toast(e.message, true); }
      return;
    }
    if (!$('#pubYT').checked) { toast('Bir platform seç.', true); return; }
    const title = $('#pubTitle').value.trim(), priv = $('#pubPriv').value;
    if (title.length < 3) { toast('Başlık gerekli.', true); return; }
    const label = { private: 'ÖZEL', unlisted: 'LİSTE DIŞI', public: 'HERKESE AÇIK' }[priv];
    if (!confirm(`YouTube kanalına (${yt.title}) ${label} olarak yüklenecek:\n\n${title}\n\n${priv === 'public' ? 'Bu video herkese açık yayınlanır.\n\n' : ''}Devam edilsin mi?`)) return;
    try {
      await api(`/api/jobs/${j.id}/publish`, { method: 'POST', body: { platforms: ['youtube'], title, description: $('#pubDesc').value, tags: $('#pubTags').value.split(',').map((t) => t.trim()).filter(Boolean), privacy: priv } });
    } catch (e) { toast(e.message, true); }
  });
}
async function renderPublish(j) {
  const card = $('#pubCard'), has = j.outputs.some((o) => o.kind === 'video');
  card.hidden = !has; if (!has) return;
  if (pub.job?.id !== j.id) { pub.touched = false; $('#pubTitle').value = j.topic; $('#pubDesc').value = ''; $('#pubTags').value = ''; pub.prov = null; }
  pub.job = j;
  if (!pub.prov || pub.provKey !== pubKey(j)) await loadProviders(j);
  const yt = pub.prov?.youtube, p = j.publications?.youtube;
  $('#ytState').textContent = !yt ? '' : !yt.configured ? 'kurulum gerekli' : yt.connected ? `bağlı: ${yt.title}` : 'bağlı değil';
  $('#platYT').classList.toggle('on', $('#pubYT').checked);
  if (yt?.connected && !$('#pubYT').dataset.init) { $('#pubYT').checked = true; $('#pubYT').dataset.init = '1'; $('#platYT').classList.add('on'); }
  $('#pubDisc').hidden = !yt?.connected;
  $('#pubGo').textContent = !yt?.connected ? 'YouTube hesabını bağla' : p?.status === 'uploading' ? 'Yükleniyor…' : 'Yayınla…';
  $('#pubGo').disabled = p?.status === 'uploading';
  const st = $('#pubStatus'); st.textContent = '';
  if (p) {
    const priv = { private: 'özel', unlisted: 'liste dışı', public: 'herkese açık' }[p.privacy] || '';
    if (p.status === 'uploading') st.append(el('span', {}, 'YouTube’a yükleniyor…'), el('div', { className: 'pbar' }, el('i', { style: `width:${Math.round((p.progress || 0.05) * 100)}%` })));
    else if (p.status === 'done') st.append(el('span', { className: 'ok' }, `YouTube’a yüklendi (${priv}).`), el('a', { href: p.url, target: '_blank', rel: 'noopener', textContent: p.url }));
    else if (p.status === 'failed') st.append(el('span', { className: 'bad', textContent: p.error || 'Yükleme başarısız.' }));
  }
}
let docTimer = 0, docKey = '';
function loadDoc() {
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
