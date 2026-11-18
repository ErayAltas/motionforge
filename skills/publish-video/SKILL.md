---
name: publish-video
description: Publish a finished motionforge video straight to YouTube (Shorts) and Instagram (Reels) through the platforms' own APIs from the studio, and set up or debug those connections (Google Cloud project, Meta app, .env keys, tokens). Use when the user wants to upload, post or publish a finished video, connect or reconnect a social account, or when an upload fails.
license: MIT
---

# Publish video

The studio (`studio/`) uploads finished MP4s directly to each platform. No third-party aggregator. Code: `studio/publish.mjs`; UI: the "Yayınla" card on a finished job. Full setup steps: `studio/README.md`.

## Before any upload
1. Run `qa-review` first; never publish an unchecked video.
2. Title, description, tags: use the "Metni oluştur" button or `script-and-hooks`. Only claims that are in the script.
3. **Confirm with the user before every publish**, and say plainly which platform and whether it will be public. Instagram Reels are always public; YouTube defaults to private.

## Platform facts
| | YouTube | Instagram |
|---|---|---|
| API | YouTube Data API v3, resumable upload | Instagram API with Facebook Login, resumable upload to `rupload.facebook.com` |
| Keys in `studio/.env` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `META_APP_ID`, `META_APP_SECRET` (+ `META_CONFIG_ID` for Facebook Login for Business) |
| Redirect URI to register | `http://127.0.0.1:4173/oauth/youtube/callback` | `http://127.0.0.1:4173/oauth/instagram/callback` (add under Facebook Login settings; if refused use the pasted-token fallback) |
| Account needed | any channel | Instagram **Business or Creator** account linked to a Facebook Page; one account per studio channel |
| Token life | Testing-mode refresh token expires in 7 days | Page token from a long-lived user token does not expire |
| Limits | unaudited API project uploads **private only**; daily quota | Reels 9:16, H.264/AAC mp4; about 25 API posts per 24 h; Development-mode app: the logging-in Facebook profile needs an app role |

Tokens live per studio channel in `studio/.data/accounts.json` (chmod 600). Never print keys or tokens.

## Setting up a connection
Use the Chrome tools to do the console clicks for the user, but **stop and ask** before billing, terms of service, app review or OAuth consent screens. Follow `studio/README.md`. After any change to `studio/`, restart the server (`pkill -f server.mjs`, then `nohup node studio/server.mjs &`, port 4173) and check it answers.

## Troubleshooting
- "kurulum gerekli" in the card: keys missing in `.env`; restart after editing.
- Instagram "yetkisi geçersiz": token expired or revoked; reconnect.
- Instagram processing error: check the file is 9:16 H.264/AAC; re-render if not.
- YouTube video stays private: API project not audited; change privacy by hand in YouTube Studio.
