# motionforge studio – publishing

The studio uploads finished videos directly to YouTube Shorts and Instagram Reels (code: `publish.mjs`). TikTok is not built yet.

Run: `node studio/server.mjs`, then open http://localhost:4173. Keys go in `studio/.env` (gitignored, keep it `chmod 600`):

```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...
# META_CONFIG_ID=...   (only for Facebook Login for Business)
```

Restart the server after editing `.env`. Accounts are connected per studio channel from the "Yayınla" card of a finished video; tokens are stored in `.data/accounts.json`.

## YouTube
1. Google Cloud project, enable **YouTube Data API v3**.
2. OAuth consent screen (External, Testing); add your Google account as a test user.
3. Create an OAuth client of type *Desktop app*; allow redirect `http://127.0.0.1:4173/oauth/youtube/callback`.
4. Put the id/secret in `.env`.

Limits: unaudited projects upload as private only; Testing-mode refresh tokens expire after 7 days.

## Instagram (Reels) – Facebook Login
Every studio channel has its own Instagram account. Per account you need: an Instagram **Business or Creator** account, connected to its own **Facebook Page**. One Facebook profile can manage all those Pages, so a single login serves every channel.
1. Meta app (developers.facebook.com) with the *Instagram API* use case; the "API setup with Facebook login" permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management` added.
2. In the app's Facebook Login settings, add the valid OAuth redirect `http://127.0.0.1:4173/oauth/instagram/callback`.
3. Put *App settings → Basic* App ID / App secret into `.env` as `META_APP_ID` / `META_APP_SECRET`. If the app uses Facebook Login for Business, also set `META_CONFIG_ID` (the configuration id).
4. Keep the app in Development mode; the Facebook profile that logs in must have a role (admin/developer/tester) in the app.
5. In the card of a channel's video click "Instagram hesabını bağla", log in with Facebook and tick the Pages. If several Instagram accounts are found you pick one for this channel (accounts already used by another channel are hidden).
6. Fallback without redirect: paste a user token from the Graph API Explorer via "Instagram anahtarını elle gir".

Notes: Reels are always public. Page tokens derived from a long-lived user token do not expire. About 25 API posts per 24 h per account. Meta calls the Facebook-login API "legacy", but it still works.

## How an upload works
- YouTube: resumable upload; `#Shorts` is added for vertical videos up to 180 s.
- Instagram: create a REELS container with `upload_type=resumable`, send the file to `rupload.facebook.com`, poll `status_code` until `FINISHED`, then `media_publish`.
