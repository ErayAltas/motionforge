#!/usr/bin/env python3
"""
avatar.py — talking-avatar video through AI providers (fal.ai, Wiro AI) or your own local lip-sync model
© 2026 motionforge contributors, MIT

Every command is a DRY RUN unless you add --yes. A dry run prints what would be sent, how many
seconds, and the estimated cost (from pricing.json), writes job.json, and sends nothing.

    python3 tools/avatar/avatar.py check                                   # setup check, sends nothing
    python3 tools/avatar/avatar.py estimate talk --image face.png --audio voice.wav
    python3 tools/avatar/avatar.py animate --image face.png --prompt "..." --duration 5 [--yes]
    python3 tools/avatar/avatar.py lipsync --video clip.mp4 --audio voice.wav [--yes]
    python3 tools/avatar/avatar.py talk --image face.png --audio voice.wav [--base-video puppet.mp4] [--yes]

Common flags: --provider fal|wiro|local (default: auto), --model <preset or model id>, --out DIR,
--overlap 0.5, --force (ignore the cache), --allow-unknown-cost, --cache-dir, --providers, --pricing.

Keys come ONLY from the environment: FAL_KEY; WIRO_API_KEY + WIRO_API_SECRET; MF_LIPSYNC_CMD for the
local route. A key given on the command line is refused. Keys are never printed or written to job.json.

Auto-pick (no --provider): MF_LIPSYNC_CMD -> FAL_KEY -> Wiro keys -> none (use the free
templates/photo-avatar route).

Long audio is split into chunks of at most the model's max_seconds (10 s for lip-sync) that overlap by
--overlap seconds; each chunk is lip-synced on its own and the results are joined in the middle of each
overlap, then the original audio is laid under the whole video.

Paid results are cached in .mf-cache/avatar/<sha256>/ (key: input file bytes + provider + model +
parameters + chunk window). A rerun reuses them instead of paying again; --force bypasses the cache.

Needs: Python 3.10+, ffmpeg + ffprobe on PATH; fal-client for fal (pip install fal-client).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import hmac
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET_ENV = ("FAL_KEY", "FAL_KEY_ID", "FAL_KEY_SECRET", "WIRO_API_KEY", "WIRO_API_SECRET")
TALK_PROMPT = ("The person speaks naturally to the camera with small head movements and natural blinks; "
               "mouth closed at the start; steady camera, same framing and light as the image.")
FREE_ROUTE = ("no AI provider is set up. Free route: animate the picture locally with templates/photo-avatar "
              "(skills/faceless-ugc, route C). To use a provider, set FAL_KEY, or WIRO_API_KEY + WIRO_API_SECRET, "
              "or MF_LIPSYNC_CMD for your own model, then run `avatar.py check`.")


class AvatarError(Exception):
    """A problem the user can fix; printed without a traceback."""


def say(msg: str = "") -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- key safety
KEY_FLAG = re.compile(r"^--?(api[-_]?key|key|keys|token|secret|password|fal[-_]?key|wiro[-_][a-z_-]*|auth[a-z_-]*)(=.*)?$", re.I)
KEY_SHAPE = re.compile(r"^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}|(?:sk|key)[-_][A-Za-z0-9]{20,})$", re.I)


def refuse_keys_in_args(argv: list[str]) -> None:
    """Keys belong in environment variables. Refuse (without echoing the value) if one shows up in argv."""
    secrets = {os.environ[k] for k in SECRET_ENV if os.environ.get(k) and len(os.environ[k]) >= 6}
    for tok in argv:
        value = tok.split("=", 1)[1] if tok.startswith("-") and "=" in tok else tok
        if KEY_FLAG.match(tok) or tok in secrets or value in secrets or KEY_SHAPE.match(value):
            raise AvatarError("refused: API keys are read from environment variables only (FAL_KEY, "
                              "WIRO_API_KEY, WIRO_API_SECRET). Remove the key from the command line, "
                              "set it with `export FAL_KEY=...` in your shell or an untracked .env, and "
                              "consider rotating it if it was saved in your shell history.")


def scrub(text: str) -> str:
    for k in SECRET_ENV:
        v = os.environ.get(k)
        if v and len(v) >= 6:
            text = text.replace(v, "***")
    return text


# --------------------------------------------------------------------------- config
def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dig(obj, path: str):
    """Dotted path lookup: 'tasklist.0.outputs.0.url'."""
    cur = obj
    for part in path.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    return cur


def resolve_model(cfg: dict, provider: str, kind: str, wanted: str | None) -> tuple[str, dict]:
    """Returns (preset name, preset dict) for a kind ('image-to-video' or 'lipsync')."""
    pcfg = cfg[provider]
    models = pcfg.get("models", {})
    if wanted:
        if wanted in models:
            name, preset = wanted, models[wanted]
        else:  # a raw model id: borrow the input mapping of the default preset of this kind
            base = models.get(pcfg.get("defaults", {}).get(kind, ""), {})
            name, preset = wanted, dict(base, id=wanted)
    else:
        name = pcfg.get("defaults", {}).get(kind)
        if not name or name not in models:
            raise AvatarError(f"{provider} has no default {kind} model in providers.json")
        preset = models[name]
    if preset.get("kind", kind) != kind:
        raise AvatarError(f"model '{name}' is a {preset.get('kind')} model, this step needs {kind}")
    return name, preset


def price_for(pricing: dict, provider: str, name: str, preset: dict) -> dict | None:
    table = pricing.get(provider, {}).get("models", {})
    return table.get(preset.get("id", "")) or table.get(name)


def estimate_call(price: dict | None, seconds: float) -> tuple[float | None, float | None, float | None]:
    if not price or price.get("usd_per_unit") is None:
        return None, None, None
    units = max(1, math.ceil(seconds / float(price.get("unit_seconds", 1)) - 1e-9))
    usd = units * float(price["usd_per_unit"])
    lo, hi = price.get("range_usd_per_unit", [price["usd_per_unit"]] * 2)
    return usd, units * float(lo), units * float(hi)


# --------------------------------------------------------------------------- media helpers
def need_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise AvatarError(f"{tool} not found on PATH (install ffmpeg)")


def ff(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise AvatarError("ffmpeg failed: " + proc.stderr.decode("utf-8", "replace").strip()[-400:])


def media_seconds(path: str) -> float:
    proc = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        return float(proc.stdout.strip())
    except ValueError:
        raise AvatarError(f"cannot read the duration of {path}") from None


def video_size(path: str) -> tuple[int, int]:
    proc = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                           "-of", "csv=p=0", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    w, h = proc.stdout.strip().split(",")[:2]
    return int(w), int(h)


def plan_chunks(total: float, max_len: float = 10.0, overlap: float = 0.5, min_len: float = 2.0) -> list[tuple[float, float]]:
    """Windows of at most max_len seconds covering [0, total], neighbours overlapping by `overlap`.
    All windows have the same length, so the last one is never a tiny leftover."""
    if total <= 0:
        raise AvatarError("audio has no duration")
    if total <= max_len + 1e-6:
        return [(0.0, round(total, 3))]
    overlap = max(0.0, min(overlap, max_len / 3))
    n = math.ceil((total - overlap) / (max_len - overlap) - 1e-9)
    length = (total + (n - 1) * overlap) / n
    if length < min_len:
        raise AvatarError("chunks would be shorter than the model's minimum; lower --overlap")
    step = length - overlap
    return [(round(i * step, 3), round(min(total, i * step + length), 3)) for i in range(n)]


def keep_windows(chunks: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """The part of each chunk that ends up in the final video: cut in the middle of every overlap."""
    keep = []
    for i, (s, e) in enumerate(chunks):
        a = s if i == 0 else (s + chunks[i - 1][1]) / 2
        b = e if i == len(chunks) - 1 else (chunks[i + 1][0] + e) / 2
        keep.append((round(a, 3), round(b, 3)))
    return keep


def make_base_video(src: str, seconds: float, out: str) -> str:
    """A video at least `seconds` long: the source as is, or played forward-backward-forward (no jump)."""
    if media_seconds(src) >= seconds - 0.02:
        return src
    loops = math.ceil(seconds / max(media_seconds(src), 0.1)) + 1
    ff(["-i", src, "-filter_complex", f"[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,loop={loops}:32767:0,"
        f"trim=duration={seconds + 0.2:.3f},setpts=PTS-STARTPTS,fps=30,format=yuv420p[v]", "-map", "[v]", "-an",
        "-c:v", "libx264", "-crf", "16", out])
    return out


def still_video(image: str, seconds: float, out: str) -> str:
    """A slow push-in on a still picture: the base video for a local lip-sync model when nothing else is given."""
    frames = int(math.ceil(seconds * 30)) + 6
    ff(["-loop", "1", "-i", image, "-vf",
        f"scale=1080:-2,zoompan=z='1+0.03*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1080x1350:fps=30,format=yuv420p",
        "-frames:v", str(frames), "-c:v", "libx264", "-crf", "16", out])
    return out


def cut(src: str, start: float, end: float, out: str, kind: str) -> str:
    if kind == "video":
        ff(["-ss", f"{start:.3f}", "-i", src, "-t", f"{end - start:.3f}", "-an", "-r", "30", "-c:v", "libx264",
            "-crf", "16", "-pix_fmt", "yuv420p", out])
    else:
        codec = ["-c:a", "libmp3lame", "-b:a", "192k"] if out.endswith(".mp3") else ["-c:a", "pcm_s16le"]
        ff(["-ss", f"{start:.3f}", "-i", src, "-t", f"{end - start:.3f}", "-vn", "-ac", "1", "-ar", "44100", *codec, out])
    return out


def stitch(parts: list[str], chunks: list[tuple[float, float]], audio: str, out: str) -> str:
    """Join lip-synced chunks (cut in the middle of each overlap) and lay the original audio under them."""
    keep = keep_windows(chunks)
    w, h = video_size(parts[0])
    inputs, filters = [], []
    for i, (p, (s, _), (a, b)) in enumerate(zip(parts, chunks, keep)):
        inputs += ["-i", p]
        filters.append(f"[{i}:v]trim=start={a - s:.3f}:end={b - s:.3f},setpts=PTS-STARTPTS,fps=30,"
                       f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v{i}]")
    filters.append("".join(f"[v{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=0[v]")
    total = keep[-1][1]
    ff([*inputs, "-i", audio, "-filter_complex", ";".join(filters), "-map", "[v]", "-map", f"{len(parts)}:a:0",
        "-t", f"{total:.3f}", "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out])
    return out


# --------------------------------------------------------------------------- cache
def file_sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def cache_key(files: list[str], provider: str, model: str, params: dict) -> str:
    h = hashlib.sha256()
    for f in files:
        h.update(file_sha(f).encode())
    h.update(json.dumps({"provider": provider, "model": model, "params": params}, sort_keys=True).encode())
    return h.hexdigest()


def cache_get(cache_dir: str, key: str) -> str | None:
    p = os.path.join(cache_dir, key, "output.mp4")
    return p if os.path.isfile(p) and os.path.getsize(p) > 0 else None


def cache_put(cache_dir: str, key: str, src: str, meta: dict) -> str:
    d = os.path.join(cache_dir, key)
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, "output.mp4")
    shutil.copyfile(src, dst)
    with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    return dst


# --------------------------------------------------------------------------- network safety
def host_allowed(host: str, allowed: list[str]) -> bool:
    host = (host or "").lower().rstrip(".")
    for pat in allowed:
        pat = pat.lower()
        if pat.startswith("*.") and (host.endswith(pat[1:]) and host != pat[2:]):
            return True
        if host == pat:
            return True
    return False


def check_url(url: str, allowed: list[str]) -> None:
    u = urllib.parse.urlparse(url)
    if u.scheme != "https":
        raise AvatarError(f"refused: result URL is not https ({u.scheme}://{u.hostname})")
    if not host_allowed(u.hostname or "", allowed):
        raise AvatarError(f"refused: {u.hostname} is not in this provider's download_hosts (providers.json). "
                          "Add it only if it really belongs to the provider.")


def explain_http(code: int | None, body: str = "", request_id: str | None = None, env_names: str = "the key") -> str:
    low = (body or "").lower()
    rid = f" Request id: {request_id}." if request_id else ""
    if code in (401, 403):
        return f"HTTP {code}: the provider refused the credentials. Check {env_names} (value, account, access to this model).{rid}"
    if code == 402 or any(w in low for w in ("balance", "credit", "insufficient", "payment required", "quota")):
        return f"HTTP {code}: not enough balance or credit. Top up on the provider's dashboard, then rerun (finished chunks are cached).{rid}"
    if code == 404:
        return f"HTTP 404: model id or endpoint path not found. Check providers.json against the provider's docs.{rid}"
    if code in (400, 413, 422):
        return (f"HTTP {code}: inputs rejected. Check input field names and limits (clip length, resolution, file size, "
                f"audio format) on the model's page.{rid} {body[:200]}")
    if code == 429:
        return f"HTTP 429: rate limited. Wait a minute and rerun; cached chunks are not paid again.{rid}"
    if code and code >= 500:
        return f"HTTP {code}: provider-side error. Try again later.{rid}"
    return f"HTTP {code}: {body[:200]}{rid}"


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, self.allowed)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url: str, dest: str, allowed: list[str], max_mb: float, request_id: str | None = None) -> str:
    check_url(url, allowed)
    opener = urllib.request.build_opener(_SafeRedirect(allowed))
    cap = int(max_mb * 1024 * 1024)
    try:
        with opener.open(urllib.request.Request(url, headers={"User-Agent": "motionforge-avatar"}), timeout=120) as resp:
            size = int(resp.headers.get("Content-Length") or 0)
            if size > cap:
                raise AvatarError(f"refused: result is {size / 1e6:.0f} MB, above max_download_mb ({max_mb:g})")
            got = 0
            with open(dest, "wb") as fh:
                while True:
                    block = resp.read(1 << 16)
                    if not block:
                        break
                    got += len(block)
                    if got > cap:
                        fh.close()
                        os.remove(dest)
                        raise AvatarError(f"refused: download passed max_download_mb ({max_mb:g})")
                    fh.write(block)
    except urllib.error.HTTPError as err:
        raise AvatarError(explain_http(err.code, err.read().decode("utf-8", "replace"), request_id)) from None
    except (TimeoutError, urllib.error.URLError) as err:
        raise AvatarError(f"download failed ({err}). The job itself finished and was billed; request id {request_id}. "
                          "Download the result from the provider's dashboard.") from None
    return dest


# --------------------------------------------------------------------------- providers
class Provider:
    name = ""

    def __init__(self, cfg: dict, global_cfg: dict, workdir: str):
        self.cfg, self.global_cfg, self.workdir = cfg, global_cfg, workdir

    def run(self, kind: str, name: str, preset: dict, values: dict, dest: str) -> dict:
        raise NotImplementedError


class FalProvider(Provider):
    name = "fal"

    def run(self, kind, name, preset, values, dest):
        try:
            import fal_client  # type: ignore
        except ImportError:
            raise AvatarError("fal-client is not installed: python3 -m pip install fal-client") from None
        if not preset.get("id"):
            raise AvatarError(f"model '{name}' has no id in providers.json; fill it in first")
        args = {}
        for field, tmpl in preset.get("inputs", {}).items():
            key = tmpl.strip("{}") if tmpl.startswith("{") and tmpl.endswith("}") else None
            if key in ("image", "video", "audio"):
                args[field] = fal_client.upload_file(values[key])
            elif key:
                args[field] = values.get(key)
            else:
                args[field] = tmpl
        rid = None
        try:
            handle = fal_client.submit(preset["id"], arguments=args)
            rid = getattr(handle, "request_id", None)
            say(f"  fal request id: {rid}")
            result = handle.get()
        except KeyboardInterrupt:
            raise AvatarError(f"interrupted. The job may still run and be billed; request id {rid}.") from None
        except Exception as err:  # fal_client raises its own error types; map what we can
            code = getattr(err, "status_code", None) or getattr(getattr(err, "response", None), "status_code", None)
            text = scrub(str(err))
            if "timeout" in text.lower() or "timed out" in text.lower():
                raise AvatarError(f"timed out waiting for fal. The job may still finish and be billed; request id {rid}.") from None
            raise AvatarError(explain_http(code, text, rid, "FAL_KEY")) from None
        url = dig(result, preset.get("output", "video.url"))
        if not url:
            raise AvatarError(f"no video URL at '{preset.get('output')}' in the fal result; request id {rid}")
        download(url, dest, self.cfg.get("download_hosts", []), self.global_cfg.get("max_download_mb", 500), rid)
        return {"request_id": rid, "result_url_host": urllib.parse.urlparse(url).hostname}


class WiroProvider(Provider):
    name = "wiro"

    def headers(self) -> dict:
        key, secret = os.environ.get("WIRO_API_KEY", ""), os.environ.get("WIRO_API_SECRET", "")
        return wiro_headers(self.cfg, key, secret, uuid.uuid4().hex)

    def _post(self, url: str, data: bytes, ctype: str, rid: str | None = None) -> dict:
        check_url(url, [urllib.parse.urlparse(self.cfg["base"]).hostname or ""])
        req = urllib.request.Request(url, data=data, method="POST", headers={**self.headers(), "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            raise AvatarError(explain_http(err.code, err.read().decode("utf-8", "replace"), rid, "WIRO_API_KEY / WIRO_API_SECRET")) from None
        except (TimeoutError, urllib.error.URLError) as err:
            raise AvatarError(f"no answer from Wiro ({err}). If a task was created it may still be billed; task id {rid}.") from None

    def run(self, kind, name, preset, values, dest):
        for f in ("owner", "project"):
            if str(preset.get(f, "")).startswith("<"):
                raise AvatarError(f"providers.json: fill in wiro.models.{name}.{f} from your Wiro dashboard first")
        fields, files = {}, {}
        for field, tmpl in preset.get("inputs", {}).items():
            if tmpl.startswith("@{"):
                files[field] = values[tmpl[2:-1]]
            elif tmpl.startswith("{") and tmpl.endswith("}"):
                fields[field] = str(values.get(tmpl[1:-1], ""))
            else:
                fields[field] = tmpl
        body, ctype = multipart(fields, files)
        url = self.cfg["base"].rstrip("/") + self.cfg["run_path"].format(owner=preset["owner"], project=preset["project"])
        res = self._post(url, body, ctype)
        task = dig(res, self.cfg.get("task_id_path", "taskid"))
        if not task:
            raise AvatarError("Wiro did not return a task id: " + scrub(json.dumps(res)[:300]))
        say(f"  wiro task id: {task}")
        detail_url = self.cfg["base"].rstrip("/") + self.cfg["detail_path"]
        detail = {k: (str(task) if v == "{task_id}" else v) for k, v in self.cfg.get("detail_body", {"taskid": "{task_id}"}).items()}
        deadline = time.monotonic() + float(self.cfg.get("timeout_seconds", 1800))
        while True:
            info = self._post(detail_url, json.dumps(detail).encode(), "application/json", str(task))
            status = dig(info, self.cfg.get("status_path", "status"))
            if status in self.cfg.get("done_values", []):
                break
            if status in self.cfg.get("failed_values", []):
                raise AvatarError(f"Wiro task {task} ended with status {status}")
            if time.monotonic() > deadline:
                raise AvatarError(f"timed out polling Wiro. The task may still finish and be billed; task id {task}.")
            time.sleep(float(self.cfg.get("poll_seconds", 5)))
        url = dig(info, self.cfg.get("output", "output"))
        if not url:
            raise AvatarError(f"no output URL at '{self.cfg.get('output')}' in the Wiro task detail; task id {task}")
        download(url, dest, self.cfg.get("download_hosts", []), self.global_cfg.get("max_download_mb", 500), str(task))
        return {"request_id": str(task), "result_url_host": urllib.parse.urlparse(url).hostname}


def wiro_headers(cfg: dict, key: str, secret: str, nonce: str) -> dict:
    names = cfg.get("headers", {})
    out = {names.get("key", "x-api-key"): key}
    sig = cfg.get("signature", {})
    if sig.get("signed", True):
        fill = lambda s: s.replace("{api_key}", key).replace("{api_secret}", secret).replace("{nonce}", nonce)
        digest = hmac.new(fill(sig.get("key", "{api_key}")).encode(), fill(sig.get("message", "{api_secret}{nonce}")).encode(),
                          hashlib.sha256).hexdigest()
        out[names.get("nonce", "x-nonce")] = nonce
        out[names.get("signature", "x-signature")] = digest
    return out


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = "mf" + uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, path in files.items():
        with open(path, "rb") as fh:
            data = fh.read()
        out += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{os.path.basename(path)}\"\r\n"
                "Content-Type: application/octet-stream\r\n\r\n").encode() + data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def local_command(template: str, video: str, audio: str, out: str) -> list[str]:
    """MF_LIPSYNC_CMD -> argv. Split first, substitute after: a path can never become extra arguments or shell code."""
    try:
        argv = shlex.split(template)
    except ValueError as err:
        raise AvatarError(f"MF_LIPSYNC_CMD cannot be parsed ({err})") from None
    if not argv:
        raise AvatarError("MF_LIPSYNC_CMD is empty")
    joined = " ".join(argv)
    for ph in ("{video}", "{audio}", "{out}"):
        if ph not in joined:
            raise AvatarError(f"MF_LIPSYNC_CMD must contain {ph}")
    values = {"{video}": video, "{audio}": audio, "{out}": out}
    return [re.sub(r"\{video\}|\{audio\}|\{out\}", lambda m: values[m.group(0)], a) for a in argv]


def local_executable(template: str) -> str | None:
    try:
        first = shlex.split(template)[0]
    except (ValueError, IndexError):
        return None
    if os.sep in first:
        return first if os.path.isfile(first) and os.access(first, os.X_OK) else None
    return shutil.which(first)


class LocalProvider(Provider):
    name = "local"

    def run(self, kind, name, preset, values, dest):
        if kind != "lipsync":
            raise AvatarError("the local provider only does lip-sync; give talk a --base-video or let it use a still")
        argv = local_command(os.environ.get("MF_LIPSYNC_CMD", ""), values["video"], values["audio"], dest)
        say("  run: " + shlex.join(argv))
        try:
            proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=float(self.cfg.get("timeout_seconds", 3600)))
        except FileNotFoundError:
            raise AvatarError(f"MF_LIPSYNC_CMD: program not found: {argv[0]}") from None
        except subprocess.TimeoutExpired:
            raise AvatarError("local lip-sync timed out (providers.json local.timeout_seconds)") from None
        if proc.returncode != 0:
            raise AvatarError("local lip-sync failed: " + proc.stderr.decode("utf-8", "replace").strip()[-400:])
        if not os.path.isfile(dest) or os.path.getsize(dest) == 0:
            raise AvatarError(f"local lip-sync did not write {{out}} ({dest})")
        return {"request_id": None}


PROVIDERS = {"fal": FalProvider, "wiro": WiroProvider, "local": LocalProvider}


def provider_ready(name: str) -> bool:
    if name == "fal":
        return bool(os.environ.get("FAL_KEY"))
    if name == "wiro":
        return bool(os.environ.get("WIRO_API_KEY") and os.environ.get("WIRO_API_SECRET"))
    if name == "local":
        cmd = os.environ.get("MF_LIPSYNC_CMD", "")
        return bool(cmd) and local_executable(cmd) is not None
    return False


def auto_provider() -> str | None:
    for name in ("local", "fal", "wiro"):
        if provider_ready(name):
            return name
    return None


# --------------------------------------------------------------------------- planning
def build_plan(args, cfg: dict, pricing: dict, provider: str, tmp: str) -> dict:
    """Steps, chunks and cost. Touches only local files (ffprobe/ffmpeg); never the network."""
    steps, inputs = [], {}

    def add_input(label, path):
        if not path:
            return
        if not os.path.isfile(path):
            raise AvatarError(f"{label} not found: {path}")
        info = {"file": os.path.basename(path), "sha256": file_sha(path)}
        if label in ("audio", "video", "base_video"):
            info["seconds"] = round(media_seconds(path), 3)
        inputs[label] = info

    cmd = args.command
    add_input("image", getattr(args, "image", None))
    add_input("audio", getattr(args, "audio", None))
    add_input("video", getattr(args, "video", None))
    add_input("base_video", getattr(args, "base_video", None))

    def step(kind, model, seconds, params, files, chunk=None):
        name, preset = resolve_model(cfg, provider, kind, model)
        price = price_for(pricing, provider, name, preset)
        usd, lo, hi = estimate_call(price, seconds)
        key = cache_key(files, provider, preset.get("id", name), params)
        hit = cache_get(args.cache_dir, key) if not args.force else None
        steps.append({"step": kind, "model": preset.get("id") or name, "preset": name, "seconds": round(seconds, 3),
                      "params": params, "chunk": chunk, "estimate_usd": usd, "estimate_range": [lo, hi],
                      "price_known": usd is not None, "cache_key": key,
                      "cache": "bypass" if args.force else ("hit" if hit else "miss"), "_preset": preset})

    chunks = []
    if cmd == "animate":
        name, preset = resolve_model(cfg, provider, "image-to-video", args.model)
        dur = str(args.duration)
        if preset.get("durations") and dur not in preset["durations"]:
            raise AvatarError(f"--duration must be one of {preset['durations']} for {name}")
        step("image-to-video", args.model, float(dur), {"prompt": args.prompt, "duration": dur}, [args.image])
    else:
        audio_s = inputs["audio"]["seconds"]
        kind_model = args.model
        if cmd == "talk" and not args.base_video and provider != "local":
            dur = args.clip or ("5" if audio_s <= 5.5 else "10")
            prompt = TALK_PROMPT + (" " + args.prompt if args.prompt else "")
            step("image-to-video", args.i2v_model, float(dur), {"prompt": prompt, "duration": dur}, [args.image])
        _, lp = resolve_model(cfg, provider, "lipsync", kind_model)
        chunks = plan_chunks(audio_s, float(lp.get("max_seconds", 10)), args.overlap, float(lp.get("min_seconds", 1)))
        source = args.video if cmd == "lipsync" else (args.base_video or args.image)
        for i, (s, e) in enumerate(chunks):
            step("lipsync", kind_model, e - s, {"start": s, "end": e, "base": "animate" if (cmd == "talk" and not args.base_video and provider != "local") else "given"},
                 [source, args.audio], chunk=i)

    known = [s for s in steps if s["price_known"]]
    unknown = [s["preset"] for s in steps if not s["price_known"] and s["cache"] != "hit"]
    to_pay = [s for s in known if s["cache"] != "hit"]
    est = {
        "usd": round(sum(s["estimate_usd"] for s in to_pay), 4),
        "low": round(sum(s["estimate_range"][0] for s in to_pay), 4),
        "high": round(sum(s["estimate_range"][1] for s in to_pay), 4),
        "unknown_price": sorted(set(unknown)),
        "cached_steps": sum(1 for s in steps if s["cache"] == "hit"),
        "pricing_last_checked": pricing.get("last_checked"),
        "verify": pricing.get(provider, {}).get("verify"),
    }
    return {"steps": steps, "chunks": chunks, "inputs": inputs, "estimate": est}


def print_plan(job: dict, provider: str, cfg: dict) -> None:
    say(f"provider: {cfg[provider].get('label', provider)}" + ("" if cfg[provider].get("verified", True) else "  (UNVERIFIED adapter)"))
    for s in job["steps"]:
        cost = "free" if s["estimate_usd"] == 0 else (f"~${s['estimate_usd']:.3f}" if s["price_known"] else "price unknown")
        where = f" chunk {s['chunk'] + 1}/{len(job['chunks'])} [{s['params']['start']:.2f}-{s['params']['end']:.2f} s]" if s["chunk"] is not None else ""
        say(f"  {s['step']:<15} {s['model']}{where}  {s['seconds']:.2f} s  {cost}  cache: {s['cache']}")
    e = job["estimate"]
    line = f"estimated cost now: ${e['usd']:.3f}"
    if e["high"] > e["low"]:
        line += f" (range ${e['low']:.3f}-${e['high']:.3f})"
    if e["cached_steps"]:
        line += f", {e['cached_steps']} step(s) from cache"
    say(line + f"  [prices last checked {e['pricing_last_checked']}; verify: {e['verify']}]")
    if e["unknown_price"]:
        say(f"price unknown for: {', '.join(e['unknown_price'])} (fill pricing.json)")


def write_job(out_dir: str, job: dict) -> str:
    os.makedirs(out_dir, exist_ok=True)
    clean = json.loads(json.dumps(job, default=str))
    for s in clean.get("steps", []):
        s.pop("_preset", None)
    text = scrub(json.dumps(clean, indent=1, ensure_ascii=False))
    path = os.path.join(out_dir, "job.json")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


# --------------------------------------------------------------------------- execution
def execute(args, job: dict, cfg: dict, provider: str, tmp: str) -> str:
    adapter = PROVIDERS[provider](cfg[provider], cfg, tmp)
    out_dir = args.out
    results = {}

    def run_step(s, values):
        if s["cache"] == "hit":
            say(f"  {s['step']}: reused from cache {s['cache_key'][:12]}")
            return cache_get(args.cache_dir, s["cache_key"])
        dest = os.path.join(tmp, f"{s['step']}-{s['chunk'] if s['chunk'] is not None else 0}.mp4")
        say(f"  {s['step']}: sending {s['seconds']:.2f} s to {provider} ({s['model']})")
        info = adapter.run(s["step"], s["preset"], s["_preset"], values, dest)
        s.update({"request_id": info.get("request_id"), "result_host": info.get("result_url_host"), "status": "done"})
        write_job(out_dir, job)  # keep request ids even if a later step fails
        return cache_put(args.cache_dir, s["cache_key"], dest, {"provider": provider, "model": s["model"],
                         "request_id": info.get("request_id"), "created": _dt.datetime.now().isoformat(timespec="seconds")})

    animate = [s for s in job["steps"] if s["step"] == "image-to-video"]
    if animate:
        s = animate[0]
        results["animate"] = run_step(s, {"image": args.image, "prompt": s["params"]["prompt"], "duration": s["params"]["duration"]})
        if args.command == "animate":
            final = os.path.join(out_dir, "animate.mp4")
            shutil.copyfile(results["animate"], final)
            return final

    audio_s = job["inputs"]["audio"]["seconds"]
    if args.command == "lipsync":
        source = args.video
    elif args.base_video:
        source = args.base_video
    elif "animate" in results:
        source = results["animate"]
    else:  # local provider, no base video: a slow push-in on the still
        source = still_video(args.image, audio_s + 0.5, os.path.join(tmp, "still.mp4"))
    base = make_base_video(source, audio_s + 0.1, os.path.join(tmp, "base.mp4"))

    parts = []
    for s in [x for x in job["steps"] if x["step"] == "lipsync"]:
        a, b = s["params"]["start"], s["params"]["end"]
        ext = s["_preset"].get("audio_ext", "mp3")
        v = cut(base, a, b, os.path.join(tmp, f"chunk{s['chunk']:02d}.mp4"), "video")
        au = cut(args.audio, a, b, os.path.join(tmp, f"chunk{s['chunk']:02d}.{ext}"), "audio")
        parts.append(run_step(s, {"video": v, "audio": au}))
    final = os.path.join(out_dir, f"{args.command}.mp4")
    stitch(parts, job["chunks"], args.audio, final)
    return final


# --------------------------------------------------------------------------- check
def cmd_check(cfg: dict, pricing: dict) -> int:
    say("avatar.py check — nothing is sent, nothing is spent")
    for k in ("FAL_KEY", "WIRO_API_KEY", "WIRO_API_SECRET", "MF_LIPSYNC_CMD"):
        say(f"  {k:<16} {'set' if os.environ.get(k) else 'not set'}")
    try:
        import importlib.util
        fal_ok = importlib.util.find_spec("fal_client") is not None
    except Exception:
        fal_ok = False
    say(f"  fal-client       {'importable' if fal_ok else 'missing (pip install fal-client)'}")
    for tool in ("ffmpeg", "ffprobe"):
        say(f"  {tool:<16} {'found' if shutil.which(tool) else 'MISSING'}")
    cmd = os.environ.get("MF_LIPSYNC_CMD")
    if cmd:
        exe = local_executable(cmd)
        say(f"  local command    {'program found: ' + exe if exe else 'program NOT found or not executable'}")
        try:
            local_command(cmd, "v.mp4", "a.wav", "o.mp4")
            say("  local command    placeholders {video} {audio} {out} present")
        except AvatarError as err:
            say(f"  local command    {err}")
    if not cfg["wiro"].get("verified", False):
        say("  wiro adapter     unverified: check endpoints, headers and field names in providers.json against Wiro's API docs")
    say(f"  pricing          last checked {pricing.get('last_checked')} (approximate; verify on the provider pages)")
    pick = auto_provider()
    if pick == "fal" and not fal_ok:
        say("  note: FAL_KEY is set but fal-client is missing")
    say(f"auto-picked provider: {pick}" if pick else "auto-picked provider: none — " + FREE_ROUTE)
    return 0


# --------------------------------------------------------------------------- CLI
def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="avatar.py", description="Talking-avatar video via fal.ai, Wiro AI or a local lip-sync model. Dry run unless --yes.")
    sub = ap.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="verify setup; sends nothing")

    def common(p):
        p.add_argument("--provider", choices=sorted(PROVIDERS), help="default: auto (MF_LIPSYNC_CMD -> FAL_KEY -> Wiro keys)")
        p.add_argument("--model", help="preset name from providers.json or a raw model id (lip-sync model for talk)")
        p.add_argument("--out", default="avatar-out", help="output folder (job.json + video)")
        p.add_argument("--overlap", type=float, default=0.5, help="seconds of overlap between chunks (default 0.5)")
        p.add_argument("--dry-run", action="store_true", default=True, help="the default: plan and estimate only")
        p.add_argument("--yes", action="store_true", help="really send the job (paid for fal/wiro)")
        p.add_argument("--force", action="store_true", help="ignore cached results (pay again)")
        p.add_argument("--allow-unknown-cost", action="store_true", help="allow a paid run when pricing.json has no price")
        p.add_argument("--cache-dir", default=os.path.join(".mf-cache", "avatar"))
        p.add_argument("--providers", default=os.path.join(HERE, "providers.json"))
        p.add_argument("--pricing", default=os.path.join(HERE, "pricing.json"))

    p = sub.add_parser("animate", help="image -> video")
    common(p)
    p.add_argument("--image", required=True)
    p.add_argument("--prompt", required=True)
    p.add_argument("--duration", default="5")
    p = sub.add_parser("lipsync", help="video + audio -> lip-synced video")
    common(p)
    p.add_argument("--video", required=True)
    p.add_argument("--audio", required=True)
    p = sub.add_parser("talk", help="image + audio -> talking video (animate, then lip-sync)")
    common(p)
    p.add_argument("--image", required=True)
    p.add_argument("--audio", required=True)
    p.add_argument("--prompt", default="", help="extra words for the animate prompt")
    p.add_argument("--i2v-model", help="image-to-video preset or id for the animate step")
    p.add_argument("--clip", choices=["5", "10"], help="length of the animated clip (default: 5 for audio up to 5.5 s, else 10); it is played forward-backward to cover the audio")
    p.add_argument("--base-video", help="use this video instead of the animate step (e.g. a photo-avatar render with openGain 0)")
    p = sub.add_parser("estimate", help="cost only: estimate <animate|lipsync|talk> <its flags>")
    p.add_argument("rest", nargs=argparse.REMAINDER)
    return ap


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        refuse_keys_in_args(argv)
        parser = build_parser()
        args = parser.parse_args(argv)
        cfg, pricing = None, None
        if args.command == "estimate":
            if not args.rest or args.rest[0] not in ("animate", "lipsync", "talk"):
                raise AvatarError("usage: avatar.py estimate <animate|lipsync|talk> <flags>")
            args = parser.parse_args([a for a in args.rest if a != "--yes"])
            args.yes = False
        cfg = load_json(getattr(args, "providers", os.path.join(HERE, "providers.json")))
        pricing = load_json(getattr(args, "pricing", os.path.join(HERE, "pricing.json")))
        if args.command == "check":
            return cmd_check(cfg, pricing)
        need_ffmpeg()

        provider = args.provider or auto_provider()
        if not provider:
            raise AvatarError(FREE_ROUTE)
        if args.command == "animate" and provider == "local":
            raise AvatarError("the local provider does lip-sync only; for animate pick --provider fal or wiro")
        if not args.provider:
            say(f"provider (auto): {provider}")
        if provider == "wiro" and not cfg["wiro"].get("verified", False):
            say("warning: the Wiro adapter is unverified — check endpoint paths, header names, the signature and input field names in providers.json against Wiro's API docs before the first paid run.")

        with tempfile.TemporaryDirectory(prefix="mf-avatar-") as tmp:
            job = build_plan(args, cfg, pricing, provider, tmp)
            job.update({"tool": "tools/avatar/avatar.py", "job_version": 1, "command": args.command, "provider": provider,
                        "provider_verified": cfg[provider].get("verified", True), "dry_run": not args.yes,
                        "created": _dt.datetime.now().isoformat(timespec="seconds"),
                        "cache_dir": args.cache_dir, "overlap": args.overlap,
                        "notes": ["AI-generated presenter: disclose it where the platform asks (AI-content label)."]})
            print_plan(job, provider, cfg)
            if not args.yes:
                path = write_job(args.out, job)
                say(f"dry run: nothing sent. Plan written to {path}. Add --yes only after the user approved this cost.")
                return 0
            if not provider_ready(provider):
                need = " + ".join(cfg[provider].get("env", []))
                raise AvatarError(f"{need} not set (or the local program was not found). Set it in the environment; run `avatar.py check`.")
            if job["estimate"]["unknown_price"] and not args.allow_unknown_cost:
                raise AvatarError("pricing.json has no price for " + ", ".join(job["estimate"]["unknown_price"]) +
                                  ". Fill it in (or pass --allow-unknown-cost after telling the user the cost is unknown).")
            final = execute(args, job, cfg, provider, tmp)
            job["output"] = os.path.abspath(final)
            job["dry_run"] = False
            path = write_job(args.out, job)
            say(f"done: {final}\njob: {path}\nnext: python3 tools/avatar/sync_check.py {final} {final} --mouth x,y,w,h")
            return 0
    except AvatarError as err:
        print(f"avatar: {scrub(str(err))}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
