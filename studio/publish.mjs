// Publishing: upload finished videos straight to the platforms' own APIs (no third-party service).
// Implemented: YouTube (OAuth + resumable upload) and Instagram Reels (Instagram API with Facebook Login + resumable upload). TikTok plugs into the same shape later.
// Credentials come from the environment or studio/.env (gitignored): YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET (optional META_CONFIG_ID when the app uses Facebook Login for Business).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const YT_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const YT_OAUTH = process.env.YT_OAUTH_BASE || 'https://oauth2.googleapis.com';
const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com';
const YT_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

const FB_DIALOG = 'https://www.facebook.com';
const IG_GRAPH = process.env.IG_GRAPH_BASE || 'https://graph.facebook.com';
const IG_UPLOAD = process.env.IG_UPLOAD_BASE || 'https://rupload.facebook.com';
const IG_VER = 'v21.0';
const IG_SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'];

export function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* no .env */ }
}

export function createPublisher(ctx) {
  const { dataDir, origin, jobs, channels, saveJob, broadcast, publicJob, pushEvent, videosDir, readBody, json, runOneShot } = ctx;
  const ACC = path.join(dataDir, 'accounts.json');
  const pending = new Map(); // oauth state -> { channel, t }

  const readAcc = () => { try { return JSON.parse(fs.readFileSync(ACC, 'utf8')); } catch { return {}; } };
  const writeAcc = (a) => { fs.writeFileSync(ACC, JSON.stringify(a, null, 2), { mode: 0o600 }); try { fs.chmodSync(ACC, 0o600); } catch {} };
  const keyOf = (channelId) => channelId || '_';
  const ytConfigured = () => !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  const redirectUri = () => `${origin}/oauth/youtube/callback`;
  const igConfigured = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
  const picks = new Map(); // pick id -> { channel, cands, t }
  const igRedirectUri = () => `${origin}/oauth/instagram/callback`;

  // ---------- YouTube ----------
  async function tokenCall(params) {
    const r = await fetch(`${YT_OAUTH}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, ...params }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || `Google token hatası (${r.status})`);
    return j;
  }
  async function ytAccess(acct) {
    const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: acct.refresh_token });
    return t.access_token;
  }
  async function ytUpload(job, acct, o, progress) {
    const file = path.join(videosDir, job.slug, 'renders', o.file);
    const buf = fs.readFileSync(file);
    const token = await ytAccess(acct);
    const isShort = job.settings.format === '9:16' && job.settings.duration <= 180;
    let desc = o.description;
    if (isShort && !/#shorts/i.test(`${o.title} ${desc}`)) desc = `${desc}\n\n#Shorts`.trim();
    const meta = { snippet: { title: o.title.slice(0, 100), description: desc.slice(0, 4900), tags: o.tags.slice(0, 15), categoryId: '27', defaultLanguage: job.settings.language.split('-')[0] },
      status: { privacyStatus: o.privacy, selfDeclaredMadeForKids: false, embeddable: true } };
    const init = await fetch(`${YT_API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(buf.length), 'x-upload-content-type': 'video/mp4' },
      body: JSON.stringify(meta) });
    if (!init.ok) throw new Error(await ytError(init));
    const loc = init.headers.get('location'); if (!loc) throw new Error('YouTube yükleme adresi vermedi.');
    progress(0.1);
    const up = await fetch(loc, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(buf.length) }, body: buf });
    if (!up.ok) throw new Error(await ytError(up));
    const v = await up.json();
    progress(1);
    return { id: v.id, url: isShort ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`, privacy: o.privacy };
  }
  async function ytError(r) {
    const j = await r.json().catch(() => ({}));
    const m = j?.error?.message || `HTTP ${r.status}`;
    const reason = j?.error?.errors?.[0]?.reason || '';
    if (/quotaExceeded|uploadLimitExceeded/i.test(reason)) return `YouTube günlük kota/yükleme sınırı doldu (${reason}).`;
    if (r.status === 401) return 'YouTube yetkisi geçersiz; hesabı yeniden bağla.';
    return `YouTube: ${m}`.slice(0, 300);
  }

  // ---------- Instagram (Reels) via Facebook Login ----------
  // One Facebook profile manages many Pages; each Page can have its own Instagram professional account,
  // and each studio channel is connected to exactly one of them.
  const igJson = async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = j.error || {}; const m = e.error_user_msg || e.message || j.error_message || `HTTP ${r.status}`;
      if (e.code === 190 || r.status === 401) throw new Error('Instagram yetkisi geçersiz veya süresi dolmuş; hesabı yeniden bağla.');
      if (e.code === 4 || e.code === 17 || e.code === 9) throw new Error('Instagram istek/yayın sınırına takıldı; biraz sonra tekrar dene.');
      throw new Error(`Instagram: ${m}`.slice(0, 300));
    }
    return j;
  };
  const gget = async (p, params) => igJson(await fetch(`${IG_GRAPH}/${IG_VER}/${p}?${new URLSearchParams(params)}`));
  // user token -> long-lived user token -> Pages that have an Instagram professional account
  async function igCandidates(userToken, exchange = true) {
    let tok = userToken;
    if (exchange && igConfigured()) {
      try { tok = (await gget('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: userToken })).access_token; } catch { /* keep as is */ }
    }
    const r = await gget('me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100', access_token: tok });
    const taken = new Set(Object.values(readAcc()).map((a) => a.instagram?.user_id).filter(Boolean));
    return (r.data || []).filter((x) => x.instagram_business_account?.id).map((x) => ({
      page_id: x.id, page_name: x.name, token: x.access_token, ig_id: String(x.instagram_business_account.id),
      username: x.instagram_business_account.username || null, used: taken.has(String(x.instagram_business_account.id)),
    }));
  }
  function saveIg(channel, c) {
    const acc = readAcc(); const k = keyOf(channel);
    acc[k] = { ...(acc[k] || {}), instagram: { access_token: c.token, user_id: c.ig_id, page_id: c.page_id, username: c.username, connectedAt: Date.now() } };
    writeAcc(acc); return c.username ? '@' + c.username : c.page_name;
  }
  // 0 usable accounts -> error, 1 -> connect, several -> ask the user to choose
  function afterCandidates(channel, cands) {
    const free = cands.filter((c) => !c.used);
    if (!cands.length) throw new Error('Bu Facebook profiline bağlı bir Instagram profesyonel hesabı bulunamadı. Hesabı profesyonele çevirip bir Facebook Sayfası\'na bağla.');
    if (!free.length) throw new Error('Bulunan Instagram hesaplarının hepsi başka bir kanala bağlı.');
    if (free.length === 1) return { title: saveIg(channel, free[0]) };
    const id = crypto.randomBytes(8).toString('hex'); picks.set(id, { channel, cands: free, t: Date.now() });
    for (const [k, v] of picks) if (Date.now() - v.t > 900000) picks.delete(k);
    return { pick: id };
  }
  async function igUpload(job, acct, o, progress) {
    const file = path.join(videosDir, job.slug, 'renders', o.file);
    const buf = fs.readFileSync(file);
    const token = acct.access_token, uid = acct.user_id;
    const tags = o.tags.map((t) => '#' + t.replace(/[^\p{L}\p{N}_]/gu, '')).filter((t) => t.length > 1).slice(0, 10);
    const caption = [o.title, o.description, tags.join(' ')].map((x) => x.trim()).filter(Boolean).join('\n\n').slice(0, 2200);
    const c = await igJson(await fetch(`${IG_GRAPH}/${IG_VER}/${uid}/media`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: 'true', access_token: token }) }));
    progress(0.1);
    await igJson(await fetch(`${IG_UPLOAD}/ig-api-upload/${IG_VER}/${c.id}`, { method: 'POST',
      headers: { authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length), 'content-type': 'application/octet-stream' }, body: buf }));
    progress(0.5);
    // Instagram transcodes the video; wait until the container is ready
    const t0 = Date.now();
    for (;;) {
      const s = await gget(c.id, { fields: 'status_code,status', access_token: token });
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram videoyu işleyemedi (${String(s.status || s.status_code).slice(0, 160)}). Reels için dikey (9:16), H.264/AAC mp4 gerekir.`);
      if (Date.now() - t0 > 300000) throw new Error('Instagram videoyu zamanında işleyemedi; birazdan tekrar dene.');
      progress(Math.min(0.9, 0.5 + (Date.now() - t0) / 300000 * 0.4));
      await new Promise((r) => setTimeout(r, 4000));
    }
    const pub = await igJson(await fetch(`${IG_GRAPH}/${IG_VER}/${uid}/media_publish`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: c.id, access_token: token }) }));
    let url = acct.username ? `https://www.instagram.com/${acct.username}/reels/` : 'https://www.instagram.com/';
    try { const m = await gget(pub.id, { fields: 'permalink', access_token: token }); if (m.permalink) url = m.permalink; } catch {}
    progress(1);
    return { id: pub.id, url, privacy: 'public' };
  }

  // ---------- helpers ----------
  function publishable(job) {
    const dir = path.join(videosDir, job.slug, 'renders');
    let files = []; try { files = fs.readdirSync(dir); } catch {}
    return files.filter((f) => /\.mp4$/i.test(f) && !/^tmp|silent|draft/i.test(f))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs })).filter((x) => x.m >= job.createdAt - 1000).sort((a, b) => b.m - a.m).map((x) => x.f);
  }
  const clean = (s, n) => String(s ?? '').trim().slice(0, n);

  async function suggestMeta(job) {
    const ch = job.channelId && channels.get(job.channelId);
    let script = ''; try { script = fs.readFileSync(path.join(videosDir, job.slug, 'script.md'), 'utf8').slice(0, 6000); } catch {}
    const lang = { tr: 'Türkçe', en: 'English' }[job.settings.language] || job.settings.language;
    const prompt = [
      'Write publishing metadata for a short video. Reply with ONLY a JSON object, no prose, no code fence.',
      `Fields (strings in ${lang}): "title" (max 90 chars, honest, curiosity-led, no clickbait lies, no emojis spam), "description" (2-4 short lines: what the viewer learns, then one line asking a question to start comments; do NOT add hashtags here), "tags" (array of 6-10 short lowercase keywords).`,
      'Never invent facts that are not in the script. Do not mention that it is AI-made unless the script says so.',
      ch && `Channel: ${ch.name}. ${ch.niche || ''} Tone: ${ch.tone || ''}`,
      `Topic: ${job.topic}`,
      script && `Script and notes:\n${script}`,
    ].filter(Boolean).join('\n');
    const text = await runOneShot(prompt, 120000);
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    let o; try { o = JSON.parse(text.slice(a, b + 1)); } catch { throw new Error('Metin okunamadı; tekrar dene.'); }
    return { title: clean(o.title, 100) || job.topic.slice(0, 100), description: clean(o.description, 4000), tags: (Array.isArray(o.tags) ? o.tags : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 12) };
  }

  function setPub(job, platform, patch) {
    job.publications = { ...(job.publications || {}), [platform]: { ...(job.publications?.[platform] || {}), ...patch, updatedAt: Date.now() } };
    saveJob(job); broadcast(job.id, 'job', publicJob(job));
  }

  // ---------- routes ----------
  async function handle(req, res, url, p) {
    let m;
    if (p === '/api/publish/providers' && req.method === 'GET') {
      const key = keyOf(url.searchParams.get('channel')); const acc = readAcc()[key] || {};
      return json(res, 200, {
        youtube: { configured: ytConfigured(), connected: !!acc.youtube, title: acc.youtube?.title || null, redirectUri: redirectUri() },
        instagram: { configured: igConfigured(), connected: !!acc.instagram, title: acc.instagram?.username ? '@' + acc.instagram.username : acc.instagram ? 'Instagram' : null, redirectUri: igRedirectUri() },
        tiktok: { configured: false, soon: true },
      }), true;
    }
    if (p === '/api/publish/youtube/connect' && req.method === 'POST') {
      if (!ytConfigured()) return json(res, 409, { error: 'YouTube istemci bilgileri eksik (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET).' }), true;
      const body = await readBody(req); const state = crypto.randomBytes(16).toString('hex');
      pending.set(state, { platform: 'youtube', channel: body.channel || null, ret: typeof body.ret === 'string' && /^#\/[a-zA-Z0-9\/_-]*$/.test(body.ret) ? body.ret : '#/', t: Date.now() });
      for (const [k, v] of pending) if (Date.now() - v.t > 600000) pending.delete(k);
      const q = new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: YT_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state });
      return json(res, 200, { url: `${YT_AUTH}?${q}` }), true;
    }
    if (p === '/oauth/youtube/callback' && req.method === 'GET') {
      const st = pending.get(url.searchParams.get('state')); pending.delete(url.searchParams.get('state'));
      const back = (msg, ok) => { res.writeHead(302, { location: `/?${ok ? 'connected' : 'connect_error'}=${encodeURIComponent(msg)}${st?.ret || '#/'}` }); res.end(); };
      if (!st || st.platform !== 'youtube') return back('Oturum süresi doldu; tekrar dene.', false), true;
      if (url.searchParams.get('error')) return back(url.searchParams.get('error'), false), true;
      try {
        const t = await tokenCall({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri() });
        if (!t.refresh_token) throw new Error('Google yenileme anahtarı vermedi; erişimi kaldırıp tekrar bağla.');
        let title = 'YouTube kanalı', id = null;
        try { const r = await fetch(`${YT_API}/youtube/v3/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${t.access_token}` } }); const j = await r.json(); title = j.items?.[0]?.snippet?.title || title; id = j.items?.[0]?.id || null; } catch {}
        const acc = readAcc(); const k = keyOf(st.channel); acc[k] = { ...(acc[k] || {}), youtube: { refresh_token: t.refresh_token, title, id, connectedAt: Date.now() } }; writeAcc(acc);
        return back(title, true), true;
      } catch (e) { return back(e.message, false), true; }
    }
    if (p === '/api/publish/youtube' && req.method === 'DELETE') {
      const k = keyOf(url.searchParams.get('channel')); const acc = readAcc(); const rt = acc[k]?.youtube?.refresh_token;
      if (rt) { try { await fetch(`${YT_OAUTH}/revoke?token=${encodeURIComponent(rt)}`, { method: 'POST' }); } catch {} delete acc[k].youtube; writeAcc(acc); }
      return json(res, 200, { ok: true }), true;
    }
    if (p === '/api/publish/instagram/connect' && req.method === 'POST') {
      if (!igConfigured()) return json(res, 409, { error: 'Instagram için Meta uygulama bilgileri eksik (META_APP_ID / META_APP_SECRET).' }), true;
      const body = await readBody(req); const state = crypto.randomBytes(16).toString('hex');
      pending.set(state, { platform: 'instagram', channel: body.channel || null, ret: typeof body.ret === 'string' && /^#\/[a-zA-Z0-9\/_-]*$/.test(body.ret) ? body.ret : '#/', t: Date.now() });
      for (const [k, v] of pending) if (Date.now() - v.t > 600000) pending.delete(k);
      const q = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: igRedirectUri(), response_type: 'code', state });
      if (process.env.META_CONFIG_ID) { q.set('config_id', process.env.META_CONFIG_ID); q.set('override_default_response_type', 'true'); } else q.set('scope', IG_SCOPES.join(','));
      return json(res, 200, { url: `${FB_DIALOG}/${IG_VER}/dialog/oauth?${q}` }), true;
    }
    if (p === '/oauth/instagram/callback' && req.method === 'GET') {
      const st = pending.get(url.searchParams.get('state')); pending.delete(url.searchParams.get('state'));
      const back = (kv, ok) => { const qs = new URLSearchParams(ok ? kv : { connect_error: kv }); qs.set('platform', 'instagram'); res.writeHead(302, { location: `/?${qs}${st?.ret || '#/'}` }); res.end(); };
      if (!st || st.platform !== 'instagram') return back('Oturum süresi doldu; tekrar dene.', false), true;
      if (url.searchParams.get('error')) return back(url.searchParams.get('error_description') || url.searchParams.get('error'), false), true;
      try {
        const t = await gget('oauth/access_token', { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: igRedirectUri(), code: url.searchParams.get('code') || '' });
        const r = afterCandidates(st.channel, await igCandidates(t.access_token));
        return r.pick ? back({ pick: r.pick }, true) : back({ connected: r.title }, true), true;
      } catch (e) { return back(e.message, false), true; }
    }
    // fallback: paste a user token (e.g. from the Graph API Explorer)
    if (p === '/api/publish/instagram/token' && req.method === 'POST') {
      const b = await readBody(req); const token = clean(b.token, 800);
      if (!token) return json(res, 400, { error: 'Anahtar boş.' }), true;
      try { return json(res, 200, afterCandidates(b.channel || null, await igCandidates(token))), true; } catch (e) { return json(res, 400, { error: e.message }), true; }
    }
    if (p === '/api/publish/instagram/candidates' && req.method === 'GET') {
      const pk = picks.get(url.searchParams.get('pick')); if (!pk) return json(res, 404, { error: 'Seçim süresi doldu; tekrar bağlan.' }), true;
      return json(res, 200, pk.cands.map((c, i) => ({ i, label: `${c.username ? '@' + c.username : '(adsız)'} — Sayfa: ${c.page_name}` }))), true;
    }
    if (p === '/api/publish/instagram/pick' && req.method === 'POST') {
      const b = await readBody(req); const pk = picks.get(b.pick); const c = pk?.cands[Number(b.index)];
      if (!c) return json(res, 400, { error: 'Geçersiz seçim.' }), true;
      picks.delete(b.pick); return json(res, 200, { ok: true, title: saveIg(pk.channel, c) }), true;
    }
    if (p === '/api/publish/instagram' && req.method === 'DELETE') {
      const k = keyOf(url.searchParams.get('channel')); const acc = readAcc();
      if (acc[k]?.instagram) { delete acc[k].instagram; writeAcc(acc); }
      return json(res, 200, { ok: true }), true;
    }
    if ((m = /^\/api\/jobs\/([a-z0-9]+)\/(publish-meta|publish)$/.exec(p)) && req.method === 'POST') {
      const job = jobs.get(m[1]); if (!job) return json(res, 404, { error: 'not found' }), true;
      if (m[2] === 'publish-meta') {
        try { return json(res, 200, await suggestMeta(job)), true; } catch (e) { return json(res, 502, { error: e.message }), true; }
      }
      const b = await readBody(req);
      const files = publishable(job); const file = files.includes(b.file) ? b.file : files[0];
      if (!file) return json(res, 409, { error: 'Yayınlanacak final video yok.' }), true;
      const platforms = [...new Set((Array.isArray(b.platforms) ? b.platforms : []).filter((x) => x === 'youtube' || x === 'instagram'))];
      if (!platforms.length) return json(res, 400, { error: 'Platform seç.' }), true;
      const title = clean(b.title, 100); if (title.length < 3) return json(res, 400, { error: 'Başlık gerekli.' }), true;
      const o = { file, title, description: clean(b.description, 4000), tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => clean(t, 40)).filter(Boolean),
        privacy: ['private', 'unlisted', 'public'].includes(b.privacy) ? b.privacy : 'private' };
      const accts = readAcc()[keyOf(job.channelId)] || {};
      for (const pl of platforms) {
        if (!accts[pl]) return json(res, 409, { error: `${pl === 'youtube' ? 'YouTube' : 'Instagram'} hesabı bağlı değil.` }), true;
        if (job.publications?.[pl]?.status === 'uploading') return json(res, 409, { error: 'Yükleme zaten sürüyor.' }), true;
      }
      const names = { youtube: 'YouTube', instagram: 'Instagram' };
      for (const pl of platforms) {
        const priv = pl === 'instagram' ? 'public' : o.privacy;
        setPub(job, pl, { status: 'uploading', progress: 0, error: null, title, privacy: priv, file, url: null });
        pushEvent(job, { kind: 'status', text: `${names[pl]}'a yükleniyor (${priv}): ${title}` });
        const run = pl === 'youtube' ? ytUpload(job, accts.youtube, o, (pr) => setPub(job, pl, { progress: pr }))
          : igUpload(job, accts.instagram, o, (pr) => setPub(job, pl, { progress: pr }));
        run.then((r) => { setPub(job, pl, { status: 'done', progress: 1, url: r.url, videoId: r.id }); pushEvent(job, { kind: 'status', text: `${names[pl]}'a yüklendi (${r.privacy}): ${r.url}` }); })
          .catch((e) => { setPub(job, pl, { status: 'failed', error: e.message }); pushEvent(job, { kind: 'error', text: e.message }); });
      }
      return json(res, 202, publicJob(job)), true;
    }
    return false;
  }

  // an upload cannot survive a server restart
  function recover() {
    for (const job of jobs.values()) for (const [k, v] of Object.entries(job.publications || {})) if (v.status === 'uploading') { v.status = 'failed'; v.error = 'Sunucu yeniden başlatıldı; yükleme yarıda kaldı.'; saveJob(job); }
  }
  return { handle, recover };
}
