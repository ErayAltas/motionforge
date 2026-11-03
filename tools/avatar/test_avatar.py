#!/usr/bin/env python3
"""
Offline tests for tools/avatar (no network, no keys, no paid calls).
© 2026 motionforge contributors, MIT

    python3 -m unittest tools/avatar/test_avatar.py -v

Needs ffmpeg/ffprobe and numpy. Real providers are replaced by a fake one that copies its input.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import avatar  # noqa: E402
import sync_check  # noqa: E402

FAKE_SECRET = "test-secret-value-0123456789"


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def run_cli(argv, env=None):
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.dict(os.environ, env or {}, clear=False), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = avatar.main(argv)
    return code, out.getvalue(), err.getvalue()


class FakeProvider(avatar.Provider):
    """Stands in for fal/wiro: 'animates' to a test pattern, 'lip-syncs' by muxing the chunk audio onto the chunk video."""
    name = "fake"
    calls = []

    def run(self, kind, name, preset, values, dest):
        FakeProvider.calls.append(kind)
        if kind == "image-to-video":
            ff("-f", "lavfi", "-i", f"testsrc=size=320x400:rate=30", "-t", values["duration"], "-pix_fmt", "yuv420p", dest)
        else:
            ff("-i", values["video"], "-i", values["audio"], "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", "-shortest", dest)
        return {"request_id": f"req-{len(FakeProvider.calls)}", "result_url_host": "v3.fal.media"}


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg not installed")
class AvatarCLITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media = tempfile.mkdtemp(prefix="mf-avatar-media-")
        cls.image = os.path.join(cls.media, "face.png")
        cls.video = os.path.join(cls.media, "clip.mp4")
        cls.audio = os.path.join(cls.media, "voice.wav")
        cls.short_audio = os.path.join(cls.media, "short.wav")
        ff("-f", "lavfi", "-i", "color=c=gray:s=320x400", "-frames:v", "1", cls.image)
        ff("-f", "lavfi", "-i", "testsrc=size=320x400:rate=30", "-t", "23", "-pix_fmt", "yuv420p", cls.video)
        ff("-f", "lavfi", "-i", "sine=frequency=220:duration=23", cls.audio)
        ff("-f", "lavfi", "-i", "sine=frequency=330:duration=4", cls.short_audio)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.media, ignore_errors=True)

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mf-avatar-test-")
        self.out = os.path.join(self.tmp, "out")
        self.cache = os.path.join(self.tmp, "cache")
        FakeProvider.calls = []
        # no test may reach a real provider
        self.guard = mock.patch.dict(avatar.PROVIDERS, {"fal": FakeProvider, "wiro": FakeProvider})
        self.guard.start()
        self.env = mock.patch.dict(os.environ, {k: "" for k in ("FAL_KEY", "WIRO_API_KEY", "WIRO_API_SECRET", "MF_LIPSYNC_CMD")})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.guard.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def job(self):
        with open(os.path.join(self.out, "job.json"), encoding="utf-8") as fh:
            return json.load(fh)

    # ---- chunking -------------------------------------------------------------------
    def test_plan_chunks(self):
        self.assertEqual(avatar.plan_chunks(8.0), [(0.0, 8.0)])
        chunks = avatar.plan_chunks(23.0, 10.0, 0.5)
        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0][0], 0.0)
        self.assertAlmostEqual(chunks[-1][1], 23.0, places=3)
        for (s, e) in chunks:
            self.assertLessEqual(e - s, 10.0 + 1e-6)
        for (a, b) in zip(chunks, chunks[1:]):
            self.assertAlmostEqual(a[1] - b[0], 0.5, places=2)
        keep = avatar.keep_windows(chunks)
        for (a, b) in zip(keep, keep[1:]):
            self.assertAlmostEqual(a[1], b[0], places=3)  # no gap, no double frames
        self.assertAlmostEqual(keep[-1][1], 23.0, places=3)

    # ---- dry run --------------------------------------------------------------------
    def test_dry_run_talk_estimates_and_sends_nothing(self):
        code, out, err = run_cli(["talk", "--provider", "fal", "--image", self.image, "--audio", self.audio,
                                  "--out", self.out, "--cache-dir", self.cache], {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0, err)
        self.assertEqual(FakeProvider.calls, [])
        job = self.job()
        self.assertTrue(job["dry_run"])
        kinds = [s["step"] for s in job["steps"]]
        self.assertEqual(kinds, ["image-to-video", "lipsync", "lipsync", "lipsync"])
        # 10 s clip = 2 x 5 s units at 0.28; each ~8.2 s chunk = 2 units at 0.014
        self.assertAlmostEqual(job["estimate"]["usd"], 2 * 0.28 + 3 * 2 * 0.014, places=4)
        self.assertEqual(job["estimate"]["pricing_last_checked"], "2026-11")
        self.assertIn("dry run: nothing sent", out)
        self.assertTrue(all(s["cache"] == "miss" for s in job["steps"]))
        with open(os.path.join(self.out, "job.json"), encoding="utf-8") as fh:
            blob = fh.read()
        self.assertNotIn(FAKE_SECRET, blob)
        self.assertNotIn(FAKE_SECRET, out + err)

    def test_estimate_subcommand(self):
        code, out, err = run_cli(["estimate", "lipsync", "--provider", "fal", "--video", self.video, "--audio", self.short_audio,
                                  "--out", self.out, "--cache-dir", self.cache, "--yes"])
        self.assertEqual(code, 0, err)
        self.assertIn("estimated cost now: $0.014", out)
        self.assertEqual(FakeProvider.calls, [])  # --yes is ignored by estimate

    # ---- key safety -------------------------------------------------------------------
    def test_key_on_command_line_is_refused(self):
        for argv in (["lipsync", "--fal-key", "abc", "--video", self.video, "--audio", self.audio],
                     ["lipsync", "--api-key=abc", "--video", self.video, "--audio", self.audio],
                     ["lipsync", "--video", self.video, "--audio", self.audio, "--model", FAKE_SECRET]):
            code, out, err = run_cli(argv, {"FAL_KEY": FAKE_SECRET})
            self.assertEqual(code, 2)
            self.assertIn("environment variables only", err)
            self.assertNotIn(FAKE_SECRET, out + err)

    def test_yes_without_key_stops_before_any_call(self):
        code, out, err = run_cli(["lipsync", "--provider", "fal", "--video", self.video, "--audio", self.short_audio,
                                  "--out", self.out, "--cache-dir", self.cache, "--yes"])
        self.assertEqual(code, 2)
        self.assertIn("FAL_KEY not set", err)
        self.assertEqual(FakeProvider.calls, [])

    def test_no_provider_points_to_free_route(self):
        code, out, err = run_cli(["lipsync", "--video", self.video, "--audio", self.short_audio, "--out", self.out])
        self.assertEqual(code, 2)
        self.assertIn("templates/photo-avatar", err)

    # ---- paid path with a fake provider: chunk, stitch, cache ---------------------------
    def test_lipsync_chunks_stitch_and_cache(self):
        argv = ["lipsync", "--provider", "fal", "--video", self.video, "--audio", self.audio,
                "--out", self.out, "--cache-dir", self.cache, "--yes"]
        code, out, err = run_cli(argv, {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0, err)
        self.assertEqual(FakeProvider.calls, ["lipsync"] * 3)
        final = os.path.join(self.out, "lipsync.mp4")
        self.assertAlmostEqual(avatar.media_seconds(final), 23.0, delta=0.15)
        frames = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                                 "stream=nb_read_frames", "-of", "csv=p=0", final], stdout=subprocess.PIPE, text=True).stdout
        self.assertAlmostEqual(int(frames.strip()), 23 * 30, delta=3)
        job = self.job()
        self.assertFalse(job["dry_run"])
        self.assertEqual([s["request_id"] for s in job["steps"]], ["req-1", "req-2", "req-3"])
        self.assertNotIn(FAKE_SECRET, json.dumps(job))
        # second run: everything comes from the cache, nothing is paid again
        FakeProvider.calls = []
        code, out, err = run_cli(argv, {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0, err)
        self.assertEqual(FakeProvider.calls, [])
        self.assertTrue(all(s["cache"] == "hit" for s in self.job()["steps"]))
        self.assertIn("estimated cost now: $0.000", out)
        # --force pays again
        code, out, err = run_cli(argv + ["--force"], {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0, err)
        self.assertEqual(len(FakeProvider.calls), 3)

    def test_talk_animate_then_lipsync(self):
        code, out, err = run_cli(["talk", "--provider", "fal", "--image", self.image, "--audio", self.short_audio,
                                  "--out", self.out, "--cache-dir", self.cache, "--yes"], {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0, err)
        self.assertEqual(FakeProvider.calls, ["image-to-video", "lipsync"])
        self.assertAlmostEqual(avatar.media_seconds(os.path.join(self.out, "talk.mp4")), 4.0, delta=0.15)
        self.assertEqual(self.job()["steps"][0]["params"]["duration"], "5")

    # ---- local provider ----------------------------------------------------------------
    def test_local_command_is_not_a_shell(self):
        evil = os.path.join(self.tmp, "a b;touch PWNED $(touch PWNED2).mp4")
        argv = avatar.local_command("prog --video {video} --audio={audio} --out {out}", evil, "x.wav", "o.mp4")
        self.assertEqual(argv, ["prog", "--video", evil, "--audio=x.wav", "--out", "o.mp4"])
        with self.assertRaises(avatar.AvatarError):
            avatar.local_command("prog --video {video}", "v", "a", "o")  # placeholders missing

    def test_local_provider_runs_user_command(self):
        model = os.path.join(self.tmp, "fake_model.py")
        with open(model, "w") as fh:
            fh.write("import argparse, shutil\np = argparse.ArgumentParser()\nfor a in ('--video', '--audio', '--out'): p.add_argument(a)\n"
                     "a = p.parse_args()\nshutil.copyfile(a.video, a.out)\n")
        odd_dir = os.path.join(self.tmp, "my clips; $(touch PWNED)")
        os.makedirs(odd_dir)
        base = os.path.join(odd_dir, "base video.mp4")
        shutil.copyfile(self.video, base)
        cmd = f"{sys.executable} {model} --video {{video}} --audio {{audio}} --out {{out}}"
        code, out, err = run_cli(["talk", "--image", self.image, "--audio", self.short_audio, "--base-video", base,
                                  "--out", self.out, "--cache-dir", self.cache, "--yes"], {"MF_LIPSYNC_CMD": cmd})
        self.assertEqual(code, 0, err)
        self.assertIn("provider (auto): local", out)
        self.assertIn("free", out)
        self.assertIn("run: ", out)
        self.assertTrue(os.path.isfile(os.path.join(self.out, "talk.mp4")))
        for d in (self.tmp, odd_dir, os.getcwd()):
            self.assertFalse({"PWNED", "PWNED2"} & set(os.listdir(d)), d)

    def test_auto_pick_order(self):
        cmd = f"{sys.executable} x.py {{video}} {{audio}} {{out}}"
        with mock.patch.dict(os.environ, {"MF_LIPSYNC_CMD": cmd, "FAL_KEY": "k", "WIRO_API_KEY": "k", "WIRO_API_SECRET": "s"}):
            self.assertEqual(avatar.auto_provider(), "local")
        with mock.patch.dict(os.environ, {"FAL_KEY": "k", "WIRO_API_KEY": "k", "WIRO_API_SECRET": "s"}):
            self.assertEqual(avatar.auto_provider(), "fal")
        with mock.patch.dict(os.environ, {"WIRO_API_KEY": "k", "WIRO_API_SECRET": "s"}):
            self.assertEqual(avatar.auto_provider(), "wiro")
        with mock.patch.dict(os.environ, {"WIRO_API_KEY": "k"}):
            self.assertIsNone(avatar.auto_provider())

    def test_check_prints_names_not_values(self):
        code, out, err = run_cli(["check"], {"FAL_KEY": FAKE_SECRET})
        self.assertEqual(code, 0)
        self.assertIn("FAL_KEY          set", out)
        self.assertIn("WIRO_API_KEY     not set", out)
        self.assertIn("auto-picked provider: fal", out)
        self.assertNotIn(FAKE_SECRET, out + err)

    # ---- wiro ------------------------------------------------------------------------------
    def test_wiro_warning_and_unknown_price_gate(self):
        env = {"WIRO_API_KEY": FAKE_SECRET, "WIRO_API_SECRET": FAKE_SECRET + "x"}
        code, out, err = run_cli(["lipsync", "--provider", "wiro", "--video", self.video, "--audio", self.short_audio,
                                  "--out", self.out, "--cache-dir", self.cache], env)
        self.assertEqual(code, 0, err)
        self.assertIn("Wiro adapter is unverified", out)
        self.assertIn("price unknown", out)
        code, out, err = run_cli(["lipsync", "--provider", "wiro", "--video", self.video, "--audio", self.short_audio,
                                  "--out", self.out, "--cache-dir", self.cache, "--yes"], env)
        self.assertEqual(code, 2)
        self.assertIn("no price", err)
        self.assertEqual(FakeProvider.calls, [])
        self.assertNotIn(FAKE_SECRET, out + err)

    def test_wiro_signature(self):
        import hashlib
        import hmac
        cfg = avatar.load_json(os.path.join(HERE, "providers.json"))["wiro"]
        h = avatar.wiro_headers(cfg, "KEY", "SECRET", "n1")
        self.assertEqual(h["x-api-key"], "KEY")
        self.assertEqual(h["x-nonce"], "n1")
        self.assertEqual(h["x-signature"], hmac.new(b"KEY", b"SECRETn1", hashlib.sha256).hexdigest())


class DownloadSafetyTest(unittest.TestCase):
    def test_hosts(self):
        allowed = ["fal.media", "*.fal.media"]
        avatar.check_url("https://v3.fal.media/files/x.mp4", allowed)
        avatar.check_url("https://fal.media/files/x.mp4", allowed)
        for bad in ("http://v3.fal.media/x.mp4", "https://evilfal.media/x.mp4", "https://fal.media.evil.com/x.mp4",
                    "https://example.com/x.mp4", "file:///etc/passwd"):
            with self.assertRaises(avatar.AvatarError, msg=bad):
                avatar.check_url(bad, allowed)

    def test_error_hints(self):
        self.assertIn("credentials", avatar.explain_http(401, "", "r1"))
        self.assertIn("r1", avatar.explain_http(401, "", "r1"))
        self.assertIn("Top up", avatar.explain_http(402))
        self.assertIn("Top up", avatar.explain_http(400, "Insufficient balance on account"))
        self.assertIn("rate limited", avatar.explain_http(429))


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
class SyncCheckTest(unittest.TestCase):
    """A synthetic 'mouth' (a box that darkens with a syllable envelope) against audio with the same envelope."""

    def make(self, tmp, shift_s):
        import numpy as np
        fps, sr, dur = 30, 16000, 6.0
        rng = np.random.default_rng(3)
        env = np.zeros(int(dur * sr))
        t = 0.4
        while t < dur - 0.4:
            n = int(rng.uniform(0.12, 0.25) * sr)
            i = int(t * sr)
            env[i:i + n] = np.sin(np.pi * np.linspace(0, 1, n)) * rng.uniform(0.4, 1)
            t += n / sr + rng.uniform(0.03, 0.3)
        audio = (env * np.sin(2 * np.pi * 180 * np.arange(env.size) / sr) * 0.6).astype(np.float32)
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-", wav],
                       input=audio.tobytes(), check=True)
        frames = []
        for f in range(int(dur * fps)):
            k = int(max(0, (f / fps - shift_s)) * sr)
            o = env[min(k, env.size - 1)]
            img = np.full((120, 160), 170, np.uint8)
            img[50:80, 50:110] = int(170 - 140 * o)   # the "mouth" darkens as it opens
            frames.append(img)
        vid = os.path.join(tmp, "v.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "160x120", "-r", str(fps),
                        "-i", "-", "-pix_fmt", "yuv420p", vid], input=np.stack(frames).tobytes(), check=True)
        return vid, wav

    def test_detects_offset(self):
        with tempfile.TemporaryDirectory() as tmp:
            for shift in (0.0, 0.2):
                vid, wav = self.make(tmp, shift)
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = sync_check.main([vid, wav, "--mouth", "0.25,0.35,0.5,0.4", "--json", os.path.join(tmp, "r.json")])
                with open(os.path.join(tmp, "r.json"), encoding="utf-8") as fh:
                    res = json.load(fh)
                self.assertAlmostEqual(res["offset_ms"], shift * 1000, delta=25, msg=out.getvalue())
                self.assertGreater(res["corr"], 0.5)
                self.assertEqual(code, 0 if shift == 0 else 1)


if __name__ == "__main__":
    unittest.main()
