#!/usr/bin/env bash
# new-scene.sh — create a HyperFrames scene folder from the starter or from a template
# © 2026 motionforge contributors, MIT
#
# usage:
#   engines/hyperframes/scripts/new-scene.sh <name> [--dest DIR] [--template SLUG] [--params values.json] [--three]
#
#   <name>              folder name of the new scene (letters, digits, - and _)
#   --dest DIR          parent folder (default: ./scenes)
#   --template SLUG     start from templates/<SLUG>/ instead of engines/hyperframes/starter/
#   --params FILE       JSON object merged into the scene's <script id="params"> block
#                       (templates only; keys are checked against the template's params.json)
#   --three             add the three.js layer (automatic for templates that use it, e.g. *-3d)
#
# What it does:
#   1. copies the starter/template into DIR/<name>/
#   2. copies base.css and mf-runtime.js into DIR/<name>/assets/
#   3. copies GSAP from npm (node_modules/gsap/dist/gsap.min.js) into assets/vendor/
#      -> run `npm i gsap` once in your project if it is missing; never load GSAP from a CDN
#   4. copies the Fontsource .woff2 files that base.css references into assets/fonts/, from
#      $MF_FONTS_DIR (a folder of .woff2 files) or from node_modules/@fontsource/{inter,
#      instrument-serif,jetbrains-mono}/files/ (npm i @fontsource/inter ...)
#   5. with --three: copies three.js from npm (build/three.module.min.js + the addons
#      RoundedBoxGeometry, RoomEnvironment, GLTFLoader, BufferGeometryUtils) and mf-three.js into
#      assets/vendor/, and writes an import map into index.html if it has none
#      -> run `npm i three@0.170.0` once; world-atlas + topojson-client are copied too when the
#         scene uses them (globe-arcs-3d: npm i world-atlas@2.0.2 topojson-client@3.1.0)
#
# Then:  cd DIR/<name> && npx hyperframes lint && npx hyperframes render -o renders/<name>.mp4
set -euo pipefail

die() { echo "new-scene: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
MF_ROOT="$(cd "$ENGINE_DIR/../.." && pwd)"

NAME=""
DEST="./scenes"
TEMPLATE=""
PARAMS=""
THREE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST="${2:?--dest needs a folder}"; shift 2 ;;
    --template) TEMPLATE="${2:?--template needs a slug}"; shift 2 ;;
    --params) PARAMS="${2:?--params needs a JSON file}"; shift 2 ;;
    --three) THREE=1; shift ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    -*) die "unknown option $1" ;;
    *) [ -z "$NAME" ] || die "only one scene name, got '$NAME' and '$1'"; NAME="$1"; shift ;;
  esac
done

[ -n "$NAME" ] || die "usage: new-scene.sh <name> [--dest DIR] [--template SLUG] [--params values.json] [--three]"
case "$NAME" in *[!A-Za-z0-9_-]*) die "scene name may only use letters, digits, - and _" ;; esac

if [ -n "$TEMPLATE" ]; then
  SRC="$MF_ROOT/templates/$TEMPLATE"
  [ -f "$SRC/index.html" ] || die "no template '$TEMPLATE' (looked in $MF_ROOT/templates/)"
else
  SRC="$ENGINE_DIR/starter"
fi
[ -z "$PARAMS" ] || [ -n "$TEMPLATE" ] || die "--params only works with --template"
[ -z "$PARAMS" ] || [ -f "$PARAMS" ] || die "params file not found: $PARAMS"

OUT="$DEST/$NAME"
[ ! -e "$OUT" ] || die "$OUT already exists; pick another name or delete it first"
mkdir -p "$DEST"
cp -R "$SRC" "$OUT"

# starter config files that templates do not carry
for f in hyperframes.json .gitignore; do
  [ -f "$OUT/$f" ] || cp "$ENGINE_DIR/starter/$f" "$OUT/$f"
done
printf '{ "id": "%s", "name": "%s" }\n' "$NAME" "$NAME" > "$OUT/meta.json"

mkdir -p "$OUT/assets/vendor" "$OUT/assets/fonts"
cp "$ENGINE_DIR/base.css" "$ENGINE_DIR/mf-runtime.js" "$OUT/assets/"

# --- GSAP from npm -------------------------------------------------------------
GSAP_FILE="${GSAP_PATH:-}"
if [ -z "$GSAP_FILE" ] && command -v node >/dev/null 2>&1; then
  GSAP_FILE="$(node -e 'try{console.log(require.resolve("gsap/dist/gsap.min.js",{paths:[process.cwd(),process.argv[1]]}))}catch(e){}' "$MF_ROOT" || true)"
fi
if [ -n "$GSAP_FILE" ] && [ -f "$GSAP_FILE" ]; then
  cp "$GSAP_FILE" "$OUT/assets/vendor/gsap.min.js"
  echo "gsap: copied from $GSAP_FILE"
else
  echo "gsap: NOT FOUND. Run 'npm i gsap' in your project, then:" >&2
  echo "      cp node_modules/gsap/dist/gsap.min.js $OUT/assets/vendor/" >&2
fi

# --- fonts from Fontsource -------------------------------------------------------
missing=0
for rel in $(grep -o 'fonts/[^")]*\.woff2' "$ENGINE_DIR/base.css" | sort -u); do
  file="$(basename "$rel")"
  found=""
  if [ -n "${MF_FONTS_DIR:-}" ] && [ -f "$MF_FONTS_DIR/$file" ]; then found="$MF_FONTS_DIR/$file"; fi
  [ -n "$found" ] || for pkg in inter instrument-serif jetbrains-mono; do
    for base in "$PWD/node_modules" "$MF_ROOT/node_modules"; do
      cand="$base/@fontsource/$pkg/files/$file"
      if [ -f "$cand" ]; then found="$cand"; break 2; fi
    done
  done
  if [ -n "$found" ]; then cp "$found" "$OUT/assets/fonts/"; else missing=$((missing + 1)); fi
done
if [ "$missing" -gt 0 ]; then
  echo "fonts: $missing .woff2 file(s) missing. Install them with:" >&2
  echo "       npm i @fontsource/inter @fontsource/instrument-serif @fontsource/jetbrains-mono" >&2
  echo "       and run this script again (or copy the files into $OUT/assets/fonts/)." >&2
fi

# --- three.js layer (optional) ----------------------------------------------------
# 3D templates reference three.module.min.js in their import map: turn the layer on for them.
if grep -q 'three.module.min.js' "$OUT/index.html"; then THREE=1; fi
if [ "$THREE" = 1 ]; then
  # resolve an npm file from the current project or from the motionforge checkout
  npm_file() {
    command -v node >/dev/null 2>&1 || return 0
    node -e 'const [spec, file, root] = process.argv.slice(1);
      try { const p = require("path"); let d = p.dirname(require.resolve(spec, { paths: [process.cwd(), root] }));
        while (!require("fs").existsSync(p.join(d, "package.json"))) d = p.dirname(d);
        const f = p.join(d, file); if (require("fs").existsSync(f)) console.log(f); } catch (e) {}' "$1" "$2" "$MF_ROOT" || true
  }
  VENDOR="$OUT/assets/vendor"
  THREE_MIN="$(npm_file three build/three.module.min.js)"
  if [ -n "$THREE_MIN" ]; then
    THREE_PKG="$(dirname "$(dirname "$THREE_MIN")")"
    cp "$THREE_MIN" "$VENDOR/three.module.min.js"
    for rel in geometries/RoundedBoxGeometry.js environments/RoomEnvironment.js loaders/GLTFLoader.js utils/BufferGeometryUtils.js; do
      mkdir -p "$VENDOR/three-addons/$(dirname "$rel")"
      cp "$THREE_PKG/examples/jsm/$rel" "$VENDOR/three-addons/$rel"
    done
    echo "three: copied from $THREE_PKG"
  else
    echo "three: NOT FOUND. Run 'npm i three@0.170.0' in your project and create the scene again." >&2
  fi
  cp "$ENGINE_DIR/three/mf-three.js" "$VENDOR/mf-three.js"
  # map data for globe scenes: world-atlas (ISC, Natural Earth data) + topojson-client (ISC)
  if grep -q 'land-50m.json' "$OUT/index.html"; then
    f="$(npm_file world-atlas/land-50m.json land-50m.json)"
    if [ -n "$f" ]; then cp "$f" "$VENDOR/land-50m.json"; else echo "world-atlas: NOT FOUND. Run 'npm i world-atlas@2.0.2'" >&2; fi
  fi
  if grep -q 'topojson-client' "$OUT/index.html"; then
    f="$(npm_file topojson-client dist/topojson-client.min.js)"
    if [ -n "$f" ]; then cp "$f" "$VENDOR/topojson-client.min.js"; else echo "topojson-client: NOT FOUND. Run 'npm i topojson-client@3.1.0'" >&2; fi
  fi
  # import map: "three" and "three/addons/" resolve to the local copies (must come before any module script)
  if ! grep -q 'type="importmap"' "$OUT/index.html"; then
    MAP='    <script type="importmap">{ "imports": { "three": "./assets/vendor/three.module.min.js", "three/addons/": "./assets/vendor/three-addons/" } }</script>'
    awk -v map="$MAP" '!done && (/<script/ || /<\/head>/) { print map; done = 1 } { print }' "$OUT/index.html" > "$OUT/index.html.tmp"
    mv "$OUT/index.html.tmp" "$OUT/index.html"
    echo "three: import map written into index.html (add a <canvas id=\"gl\" class=\"clip\"> and a module script; see engines/hyperframes/three/README.md)"
  fi
fi

# --- template parameters ------------------------------------------------------------
if [ -n "$PARAMS" ]; then
  command -v python3 >/dev/null 2>&1 || die "--params needs python3"
  python3 - "$OUT/index.html" "$OUT/params.json" "$PARAMS" <<'PY' || { rm -rf "$OUT"; die "parameters rejected; $OUT was not created"; }
import json, re, sys

html_path, schema_path, values_path = sys.argv[1:4]
schema = json.load(open(schema_path, encoding="utf-8"))["parameters"]
values = json.load(open(values_path, encoding="utf-8"))
if not isinstance(values, dict):
    sys.exit("params: the values file must hold a JSON object")

kinds = {"string": str, "number": (int, float), "integer": int, "boolean": bool, "array": list, "object": dict}
errors = []
for key, val in values.items():
    if key not in schema:
        errors.append(f"unknown parameter '{key}' (allowed: {', '.join(schema)})")
        continue
    want = schema[key].get("type")
    if val is not None and want in kinds and (not isinstance(val, kinds[want]) or (want != "boolean" and isinstance(val, bool))):
        errors.append(f"'{key}' must be {want}, got {type(val).__name__}")
    if "enum" in schema[key] and val not in schema[key]["enum"]:
        errors.append(f"'{key}' must be one of {schema[key]['enum']}")
if errors:
    sys.exit("params:\n  " + "\n  ".join(errors))

html = open(html_path, encoding="utf-8").read()
pattern = re.compile(r'(<script id="params" type="application/json">)(.*?)(</script>)', re.S)
match = pattern.search(html)
if not match:
    sys.exit("params: no <script id=\"params\"> block in index.html")
current = json.loads(match.group(2))
old_duration = current.get("duration")
current.update(values)
block = "\n" + json.dumps(current, ensure_ascii=False, indent=2) + "\n    "
html = html[: match.start(2)] + block + html[match.end(2):]
# keep the composition length in the markup in sync with a changed "duration" parameter
if "duration" in values and old_duration is not None and values["duration"] != old_duration:
    html = html.replace(f'data-duration="{old_duration}"', f'data-duration="{values["duration"]}"')
open(html_path, "w", encoding="utf-8").write(html)
print(f"params: {len(values)} value(s) written into index.html")
PY
fi

echo "scene ready: $OUT"
echo "next: cd $OUT && npx hyperframes lint && npx hyperframes render -o renders/$NAME.mp4"
