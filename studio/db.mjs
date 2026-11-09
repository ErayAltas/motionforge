// SQLite store for studio state (jobs, events, channels). Uses node:sqlite (Node 22+), zero dependencies.
// Single file, rollback journal (no -wal/-shm side files) so the .db syncs cleanly through Dropbox/iCloud/Drive.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, created_at INTEGER, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (job_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (job_id, seq));
    CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
  const q = {
    putJob: db.prepare('INSERT INTO jobs (id, created_at, data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
    allJobs: db.prepare('SELECT data FROM jobs ORDER BY created_at'),
    delJob: db.prepare('DELETE FROM jobs WHERE id=?'),
    delEvents: db.prepare('DELETE FROM events WHERE job_id=?'),
    putEvent: db.prepare('INSERT OR REPLACE INTO events (job_id, seq, data) VALUES (?,?,?)'),
    events: db.prepare('SELECT data FROM events WHERE job_id=? ORDER BY seq'),
    putChannel: db.prepare('INSERT INTO channels (id, data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
    allChannels: db.prepare('SELECT data FROM channels'),
    delChannel: db.prepare('DELETE FROM channels WHERE id=?'),
  };
  const tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return {
    file,
    saveJob: (job) => q.putJob.run(job.id, job.createdAt || 0, JSON.stringify(job)),
    loadJobs: () => q.allJobs.all().map((r) => JSON.parse(r.data)),
    deleteJob: (id) => tx(() => { q.delEvents.run(id); q.delJob.run(id); }),
    addEvent: (id, ev) => q.putEvent.run(id, ev.i, JSON.stringify(ev)),
    events: (id) => q.events.all(id).map((r) => JSON.parse(r.data)),
    // channels are saved as a whole set, as before
    saveChannels: (list) => tx(() => {
      const keep = new Set(list.map((c) => c.id));
      for (const r of q.allChannels.all()) { const id = JSON.parse(r.data).id; if (!keep.has(id)) q.delChannel.run(id); }
      for (const c of list) q.putChannel.run(c.id, JSON.stringify(c));
    }),
    loadChannels: () => q.allChannels.all().map((r) => JSON.parse(r.data)),
    // one-time import of the old file layout (job.json, events.jsonl, channels.json); never overwrites existing rows
    importLegacy({ jobsDir, channelsFile }) {
      let n = 0;
      tx(() => {
        let ids = []; try { ids = fs.readdirSync(jobsDir); } catch {}
        for (const id of ids) {
          const jf = path.join(jobsDir, id, 'job.json'); if (!fs.existsSync(jf)) continue;
          try {
            const job = JSON.parse(fs.readFileSync(jf, 'utf8'));
            if (db.prepare('SELECT 1 FROM jobs WHERE id=?').get(job.id)) continue;
            q.putJob.run(job.id, job.createdAt || 0, JSON.stringify(job)); n++;
            const ef = path.join(jobsDir, id, 'events.jsonl');
            if (fs.existsSync(ef)) for (const l of fs.readFileSync(ef, 'utf8').split('\n').filter(Boolean)) { try { const ev = JSON.parse(l); q.putEvent.run(job.id, ev.i, l); } catch {} }
          } catch { /* skip broken job */ }
        }
        try { for (const c of JSON.parse(fs.readFileSync(channelsFile, 'utf8'))) { if (!db.prepare('SELECT 1 FROM channels WHERE id=?').get(c.id)) q.putChannel.run(c.id, JSON.stringify(c)); } } catch {}
      });
      return n;
    },
  };
}
