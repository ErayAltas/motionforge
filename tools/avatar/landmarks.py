#!/usr/bin/env python3
"""
landmarks.py — face points for templates/photo-avatar (mouth, eyes, chin, head ellipse)
© 2026 motionforge contributors, MIT

    # automatic (optional: needs `pip install mediapipe pillow`)
    python3 tools/avatar/landmarks.py detect assets/face.png -o values.json
    python3 tools/avatar/landmarks.py detect assets/face.png -o values.json --model face_landmarker.task

    # manual path (Pillow only): draw the points you typed into values.json over the image and look at it
    python3 tools/avatar/landmarks.py overlay assets/face.png values.json -o qa/landmarks.png

    # mouth region for sync_check.py (fractions of the 1080x1920 frame), from the same placement maths
    # as the template (layout, avatarScale, avatarOffset are read from values.json when present)
    python3 tools/avatar/landmarks.py syncbox assets/face.png values.json

values.json is a params file for new-scene.sh: {"image": ..., "landmarks": {...}, ...}. All points are in
IMAGE pixels:
    mouth  {x, y, w, curve}  centre of the line where the lips meet, corner-to-corner width,
                             curve = px the corners sit above the centre (negative: below)
    eyes   [{x, y, w, h}, …] centre, width and opening height of each eye
    chin   {x, y}            lowest point of the chin
    head   {x, y, rx, ry}    ellipse around head and hair (optional)

detect tries MediaPipe's bundled face mesh first (no download); newer MediaPipe releases without it need
the face landmarker model file (--model, downloaded by you from MediaPipe's model page). Always run
`overlay` afterwards and look: automatic points on illustrations, profiles or covered mouths can be wrong.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

# indices in the 468/478-point face mesh
MOUTH_L, MOUTH_R, LIP_UP_IN, LIP_LO_IN = 61, 291, 13, 14
EYE_A = {"outer": 33, "inner": 133, "top": 159, "bottom": 145}
EYE_B = {"outer": 263, "inner": 362, "top": 386, "bottom": 374}
CHIN, FOREHEAD = 152, 10
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
        149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


def from_points(pts: list[tuple[float, float]]) -> dict:
    """Mesh points in image px -> the template's landmarks block."""
    p = lambda i: pts[i]
    ml, mr = p(MOUTH_L), p(MOUTH_R)
    seam_y = (p(LIP_UP_IN)[1] + p(LIP_LO_IN)[1]) / 2
    mouth = {"x": round((ml[0] + mr[0]) / 2, 1), "y": round(seam_y, 1), "w": round(math.dist(ml, mr), 1),
             "curve": round(seam_y - (ml[1] + mr[1]) / 2, 1)}
    eyes = []
    for e in (EYE_A, EYE_B):
        o, i, t, b = p(e["outer"]), p(e["inner"]), p(e["top"]), p(e["bottom"])
        eyes.append({"x": round((o[0] + i[0]) / 2, 1), "y": round((t[1] + b[1]) / 2, 1),
                     "w": round(abs(o[0] - i[0]) * 1.08, 1), "h": round(max(abs(b[1] - t[1]) * 1.25, 6), 1)})
    eyes.sort(key=lambda e: e["x"])
    xs = [pts[i][0] for i in OVAL]
    ys = [pts[i][1] for i in OVAL]
    chin = p(CHIN)
    cx, top, bottom = (min(xs) + max(xs)) / 2, min(ys), max(ys)
    top -= 0.45 * (bottom - top)  # the mesh stops at the hairline; leave room for hair
    head = {"x": round(cx, 1), "y": round((top + bottom) / 2, 1),
            "rx": round((max(xs) - min(xs)) / 2 * 1.2, 1), "ry": round((bottom - top) / 2 * 1.08, 1)}
    return {"mouth": mouth, "eyes": eyes, "chin": {"x": round(chin[0], 1), "y": round(chin[1], 1)}, "head": head}


def detect(image: str, model: str | None) -> dict:
    try:
        import numpy as np
        from PIL import Image
        import mediapipe as mp  # optional dependency (Apache-2.0)
    except ImportError:
        sys.exit("landmarks: detect needs mediapipe, pillow and numpy (pip install mediapipe pillow numpy).\n"
                 "Without them, fill the landmarks by hand and check them with `landmarks.py overlay`.")
    im = Image.open(image).convert("RGBA")
    w, h = im.size
    # flatten transparency onto mid grey: detectors dislike black cut-out backgrounds
    flat = Image.new("RGB", im.size, (128, 128, 128))
    flat.paste(im, mask=im.split()[3])
    rgb = np.asarray(flat)
    landmarks = None
    solutions = getattr(mp, "solutions", None)
    if model is None and solutions is not None and hasattr(solutions, "face_mesh"):
        with solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, refine_landmarks=True) as fm:
            res = fm.process(rgb)
            if res.multi_face_landmarks:
                landmarks = res.multi_face_landmarks[0].landmark
    else:
        if not model or not os.path.isfile(model):
            sys.exit("landmarks: this mediapipe has no bundled face mesh; pass --model <face_landmarker.task> "
                     "(download it yourself from MediaPipe's model page).")
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision
        opts = vision.FaceLandmarkerOptions(base_options=mp_tasks.BaseOptions(model_asset_path=model), num_faces=1)
        with vision.FaceLandmarker.create_from_options(opts) as det:
            res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if res.face_landmarks:
                landmarks = res.face_landmarks[0]
    if not landmarks:
        sys.exit("landmarks: no face found. Fill the landmarks by hand (see the docstring).")
    return from_points([(lm.x * w, lm.y * h) for lm in landmarks])


def overlay(image: str, values: dict, out: str) -> None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        sys.exit("landmarks: overlay needs pillow (pip install pillow)")
    lm = values.get("landmarks", values)
    im = Image.open(image).convert("RGBA")
    base = Image.new("RGBA", im.size, (90, 90, 90, 255))
    base.alpha_composite(im)
    d = ImageDraw.Draw(base)
    s = max(2, round(im.size[0] / 400))
    green, red, blue = (200, 245, 58, 255), (255, 80, 90, 255), (80, 170, 255, 255)
    m = lm.get("mouth")
    if m:
        half = m["w"] / 2
        pts = [(m["x"] + half * u / 10, m["y"] - m.get("curve", 0) * (u / 10) ** 2) for u in range(-10, 11)]
        d.line(pts, fill=red, width=s)
        d.ellipse([m["x"] - 2 * s, m["y"] - 2 * s, m["x"] + 2 * s, m["y"] + 2 * s], outline=red, width=s)
    for e in lm.get("eyes", []):
        d.ellipse([e["x"] - e["w"] / 2, e["y"] - e["h"] / 2, e["x"] + e["w"] / 2, e["y"] + e["h"] / 2], outline=green, width=s)
    c = lm.get("chin")
    if c:
        d.line([(c["x"] - 12 * s, c["y"]), (c["x"] + 12 * s, c["y"])], fill=blue, width=s)
    hd = lm.get("head")
    if hd:
        d.ellipse([hd["x"] - hd["rx"], hd["y"] - hd["ry"], hd["x"] + hd["rx"], hd["y"] + hd["ry"]], outline=blue, width=s)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    base.convert("RGB").save(out)
    print(f"landmarks: overlay written to {out} — red: lip line, green: eyes, blue: chin and head ellipse")


def syncbox(image: str, values: dict) -> str:
    """Mouth region in frame fractions, using the same placement as templates/photo-avatar."""
    try:
        from PIL import Image
        W, H = Image.open(image).size
    except ImportError:
        sys.exit("landmarks: syncbox needs pillow (pip install pillow)")
    lm = values.get("landmarks", values)
    m = lm["mouth"]
    s = values.get("avatarScale", 1)
    off = values.get("avatarOffset", [0, 0])
    if values.get("layout") == "full":
        k = 1080 * s / W
        x0, y0 = (1080 - W * k) / 2, 1920 - H * k + H * k * 0.04
    else:
        k = 960 * s / W
        x0, y0 = 540 - W * k / 2, 1860 + H * k * 0.07 - H * k
    jaw = values.get("jaw") or 0.3 * m["w"]
    cx, cy = x0 + off[0] + m["x"] * k, y0 + off[1] + m["y"] * k
    bw, top, bot = m["w"] * k * 1.7, (jaw * 0.6 + 10) * k, (jaw * 1.3 + 10) * k
    x, y = max(0, cx - bw / 2) / 1080, max(0, cy - top) / 1920
    return f"{x:.3f},{y:.3f},{min(bw / 1080, 1 - x):.3f},{min((top + bot) / 1920, 1 - y):.3f}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Face landmarks for templates/photo-avatar.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("detect", help="fill landmarks with MediaPipe (optional dependency)")
    p.add_argument("image")
    p.add_argument("-o", "--out", default="values.json", help="params file to create or update")
    p.add_argument("--model", help="face_landmarker.task for MediaPipe releases without the bundled face mesh")
    p = sub.add_parser("overlay", help="draw the landmarks over the image to check them")
    p.add_argument("image")
    p.add_argument("values")
    p.add_argument("-o", "--out", default="landmarks-check.png")
    p = sub.add_parser("syncbox", help="print the --mouth region for sync_check.py")
    p.add_argument("image")
    p.add_argument("values")
    args = ap.parse_args(argv)

    if args.cmd == "detect":
        lm = detect(args.image, args.model)
        values = {}
        if os.path.isfile(args.out):
            with open(args.out, encoding="utf-8") as fh:
                values = json.load(fh)
        values["landmarks"] = lm
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(values, fh, indent=2)
        print(json.dumps(lm))
        print(f"landmarks: written to {args.out}; now check them: landmarks.py overlay {args.image} {args.out}")
        return 0
    with open(args.values, encoding="utf-8") as fh:
        values = json.load(fh)
    if args.cmd == "overlay":
        overlay(args.image, values, args.out)
    else:
        print(syncbox(args.image, values))
    return 0


if __name__ == "__main__":
    sys.exit(main())
