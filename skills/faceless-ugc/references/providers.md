# Avatar providers (route D)

`tools/avatar/avatar.py` talks to three kinds of provider. Model presets live in `tools/avatar/providers.json`, rough prices in `tools/avatar/pricing.json`. Both are plain JSON the user can edit.

## Keys and setup
Keys are read **only from environment variables**. The CLI refuses a key on the command line, never prints one and never writes one to `job.json`. Put them in the shell session or an untracked `.env` (add `.env` and `.mf-cache/` to `.gitignore`):

```bash
export FAL_KEY=...                                  # fal.ai dashboard -> API keys
export WIRO_API_KEY=... WIRO_API_SECRET=...         # Wiro dashboard -> project keys
export MF_LIPSYNC_CMD='python /opt/lipsync/run.py --video {video} --audio {audio} --out {out}'   # your own model
python3 -m pip install fal-client                   # only for fal (MIT)
python3 tools/avatar/avatar.py check                # names of the keys found, tools present, provider it would pick
```

Auto-pick when `--provider` is omitted: `MF_LIPSYNC_CMD` (free) → `FAL_KEY` → Wiro keys → none. With none, use the free `templates/photo-avatar` route.

## The three providers

| Provider | What it does | Rough cost (check `pricing.json` and the provider's page) |
|---|---|---|
| **fal** | image-to-video `fal-ai/kling-video/v2.1/standard/image-to-video` (5 or 10 s clips), lip-sync `fal-ai/kling-video/lipsync/audio-to-video`; a second lip-sync slot `alt-lipsync` is left for a model of the user's choice | animate ~$0.25-0.30 per 5 s of clip; lip-sync ~$0.014 per 5 s (late 2026) |
| **wiro** | the same two steps through Wiro's run/poll API; model slugs come from the user's dashboard | unknown until filled in `pricing.json`; a paid run with an unknown price needs `--allow-unknown-cost` after telling the user |
| **local** | the user's own lip-sync model on their machine (an open-source model they installed and are licensed to use), called through `MF_LIPSYNC_CMD` | no API cost |

Worked example (fal, a 5 s intro and a 5 s outro, 5 s clips): 2 × animate $0.28 + 2 × lip-sync $0.014 ≈ $0.59. The whole 45 s voice-over through `talk` would be ≈ $0.56 + 5 × $0.028 ≈ $0.70 and puts the avatar on screen far longer than it should be.

Prices change. Before quoting, open the pricing page named in `pricing.json` ("verify"), update the number and `last_checked`, and say the estimate is approximate.

### fal details
- Calls go through the queue API (`fal_client.submit` then `.get()`), files are uploaded with `fal_client.upload_file`. The request id is printed and stored in `job.json` before the result arrives.
- Results are downloaded only over https from the hosts in `download_hosts`, with a size cap (`max_download_mb`). If fal answers with another host, the download is refused with the host name: add it only if it really is fal's.

### Wiro details (unverified)
The adapter is generic: base URL, run path (`/Run/{owner}/{project}`), poll path (`/Task/Detail`), header names (`x-api-key`, `x-nonce`, `x-signature`), the HMAC-SHA256 signature recipe, task-id and status fields, and the input field names are all in `providers.json`. They were written without access to Wiro's docs, so the entry says `"verified": false` and the CLI warns on every Wiro run. Before the first paid run: compare each field with Wiro's API docs, fill `owner`/`project` for both presets, add the price, run one 5 s test (after the user's yes), then set `"verified": true`.

### Local model details
- `MF_LIPSYNC_CMD` must contain `{video}`, `{audio}` and `{out}`. It is split into arguments first and the paths are filled in after, with no shell, so a file name cannot run commands. The CLI prints the exact command before running it.
- The local route does lip-sync only. `talk --provider local` uses `--base-video` if given (a photo-avatar render with `openGain: 0` gives head motion and blinks), otherwise a slow push-in on the still picture.
- The model's own license and its consent rules apply; some research models do not allow commercial use.

## Cache
Each paid call is keyed by sha256 of the input files' bytes + provider + model + parameters (prompt, duration, chunk window). A finished result in `.mf-cache/avatar/<key>/output.mp4` is reused, and the dry run shows `cache: hit` and leaves it out of the estimate. `--force` ignores the cache. Delete the folder to free space; it is never committed.

## Failure modes and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Face soft or smeared around the mouth | the lip-sync model regenerates the lower face at low resolution | try the 5 s test on another model first (after the user's yes); start from a sharper 1080p+ base; keep the face larger in frame |
| Teeth as a white bar, extra teeth, flicker inside the mouth | model artefact, often with an open-mouth source picture | source with the mouth closed; shorter chunks; another model |
| Face slowly changes, drifts or "melts" on long clips | long generations drift | chunks of ≤ 10 s with overlap (automatic); short clips per section instead of one long one |
| Visible jump between chunks | head pose differs across a cut | larger `--overlap` (0.5-1 s); a calmer base clip (prompt: small head movement) |
| Lip-sync late or early by a constant amount | encoder delay, audio padding | `sync_check.py` gives the offset; shift the clip in the edit |
| Animate step changes the person (age, hair, clothes) | image-to-video freedom | plainer prompt ("same person, same clothes, steady camera"); 5 s clip; or skip animate with `--base-video` |
| HTTP 401/403 | wrong or revoked key, no access to the model | check the key in the dashboard; `avatar.py check` |
| HTTP 402 or "balance/credit" | account empty | top up, rerun: cached chunks are not paid again |
| Timeout | slow queue | the job may still finish and be billed: look up the printed request id in the dashboard before retrying |

Quality differs a lot between lip-sync models, mostly in how sharp the mouth area stays. Test on 5 s first, with the user's yes, before running a whole section.
