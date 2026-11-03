/*
 * mf-three.js — small helpers for three.js layers inside HyperFrames scenes (motionforge)
 * © 2026 motionforge contributors, MIT
 *
 * ES module. Needs an import map in the scene's <head> (new-scene.sh --three writes it):
 *   <script type="importmap">{"imports":{
 *     "three": "./assets/vendor/three.module.min.js",
 *     "three/addons/": "./assets/vendor/three-addons/"}}</script>
 *   <script type="module">
 *     import * as THREE from "three";
 *     import { createStage, lights, onSeek, orbit, ease, seg } from "./assets/vendor/mf-three.js";
 *   </script>
 *
 * Exports:
 *   createStage(opts)            -> { renderer, scene, camera, render() }
 *   environment(renderer, scene, intensity)  soft studio reflections (PMREM of RoomEnvironment)
 *   lights.studio / .daylight / .night (scene, opts) -> the lights it added
 *   shadowCatcher(scene, opts)   -> a floor that shows only shadows (keeps the CSS backdrop visible)
 *   onSeek(draw, ready?)         -> calls draw(t) on every HyperFrames seek (and once at load)
 *   orbit(camera, opts)          -> places the camera on a circle around a target
 *   ease.*, clamp01, seg, lerp   -> easing and timing helpers for frame = f(t)
 *   rng(seed)                    -> deterministic random numbers (same generator as MF.rng)
 *   project(point, camera)       -> { x, y, visible } in CSS pixels, for HTML labels
 *   loadGLB(url), fitToSize(obj, size) -> load and normalise a user model
 *
 * Determinism: no requestAnimationFrame, no clock, no Math.random(). Every frame is
 * draw(t): set every moving property from t, then render once.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const TONE = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  none: THREE.NoToneMapping,
};

/**
 * Renderer + scene + perspective camera sized for a 1080x1920 frame.
 * background: null (transparent: the CSS backdrop and grain show through) or a CSS colour.
 */
export function createStage({
  canvas = document.getElementById("gl"),
  width = 1080,
  height = 1920,
  background = null,
  fov = 35,
  near = 0.1,
  far = 200,
  toneMapping = "aces",
  exposure = 1,
  shadows = true,
} = {}) {
  if (!canvas) throw new Error("mf-three: no <canvas id=\"gl\"> (or pass { canvas })");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: background === null,
    preserveDrawingBuffer: true, // the frame is captured after render(); keep the buffer
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE[toneMapping] ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  if (background === null) renderer.setClearColor(0x000000, 0);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const scene = new THREE.Scene();
  if (background !== null) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(fov, width / height, near, far);
  const render = () => renderer.render(scene, camera);
  return { renderer, scene, camera, render };
}

/** Image-based light from a neutral room: makes metal, glass and glossy paint read as real. */
export function environment(renderer, scene, intensity = 1) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = intensity;
  return env;
}

// One shadow-casting key light; `size` is the half-width (scene units) the shadow must cover.
function keyLight(color, intensity, position, { shadow = true, size = 6, mapSize = 2048, target = [0, 0, 0] } = {}) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  light.target.position.set(...target);
  if (shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(Math.min(mapSize, 2048), Math.min(mapSize, 2048));
    const c = light.shadow.camera;
    c.left = -size; c.right = size; c.top = size; c.bottom = -size;
    c.near = 0.5; c.far = Math.max(50, position[1] * 4);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 4;
  }
  return light;
}

function addAll(scene, list) {
  for (const l of list) {
    scene.add(l);
    if (l.target) scene.add(l.target);
  }
}

/** Lighting presets. Each adds at most 3 lights; only the key light casts shadows. */
export const lights = {
  /** Product shot: warm key from front-left, cool fill from the right, rim from behind. */
  studio(scene, { intensity = 1, shadow = true, size = 4, target = [0, 0, 0] } = {}) {
    const key = keyLight(0xfff4e6, 2.6 * intensity, [-4, 7, 5], { shadow, size, target });
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7 * intensity);
    fill.position.set(6, 3, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 1.8 * intensity);
    rim.position.set(1, 5, -7);
    addAll(scene, [key, fill, rim]);
    return { key, fill, rim };
  },
  /** Outdoor: low warm sun with long soft shadows, sky/ground bounce. */
  daylight(scene, { intensity = 1, shadow = true, size = 12, target = [0, 0, 0] } = {}) {
    const sun = keyLight(0xffe8cc, 3.0 * intensity, [-10, 14, 8], { shadow, size, target });
    const sky = new THREE.HemisphereLight(0xcfe3ff, 0x3a3631, 0.9 * intensity);
    addAll(scene, [sun, sky]);
    return { sun, sky };
  },
  /** Night: cool moonlight key, dim blue ambient, one warm practical light (no shadow). */
  night(scene, { intensity = 1, shadow = true, size = 12, target = [0, 0, 0], warm = [2, 3, 2] } = {}) {
    const moon = keyLight(0xb8ccff, 1.4 * intensity, [8, 12, -6], { shadow, size, target });
    const ambient = new THREE.HemisphereLight(0x2a3a5c, 0x0b0c10, 0.6 * intensity);
    const lamp = new THREE.PointLight(0xffb066, 20 * intensity, 12, 2);
    lamp.position.set(...warm);
    addAll(scene, [moon, ambient, lamp]);
    return { moon, ambient, lamp };
  },
};

/** A large floor that is invisible except for the shadows falling on it. */
export function shadowCatcher(scene, { size = 30, opacity = 0.45, y = 0 } = {}) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShadowMaterial({ opacity, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  scene.add(floor);
  return floor;
}

/**
 * Calls draw(t) for every frame HyperFrames seeks to, and once at load (t = 0).
 * `ready` (optional Promise): models, textures or data that must be loaded first.
 * Until it resolves, each seek asks HyperFrames to wait (event.detail.waitUntil).
 */
export function onSeek(draw, ready) {
  let loaded = !ready;
  let last = 0;
  window.addEventListener("hf-seek", (e) => {
    const t = Number(e.detail?.time) || 0;
    last = t;
    if (loaded) return draw(t);
    const job = ready.then(() => draw(t));
    if (e.detail && typeof e.detail.waitUntil === "function") e.detail.waitUntil(job);
  });
  if (ready) {
    ready.then(() => { loaded = true; draw(last); });
  } else {
    draw(0);
  }
}

/** Camera on a circle around `target`. angle in degrees (0 = on +Z looking at -Z), height above target. */
export function orbit(camera, { radius = 8, height = 3, angle = 0, target = [0, 0, 0] } = {}) {
  const a = (angle * Math.PI) / 180;
  camera.position.set(target[0] + Math.sin(a) * radius, target[1] + height, target[2] + Math.cos(a) * radius);
  camera.lookAt(target[0], target[1], target[2]);
  return camera;
}

// ---- timing ---------------------------------------------------------------------------
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Progress 0..1 of a segment that starts at `start` and lasts `dur` seconds. */
export const seg = (t, start, dur) => clamp01((t - start) / Math.max(1e-6, dur));
export const lerp = (a, b, k) => a + (b - a) * k;

export const ease = {
  linear: (x) => x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  /** Overshoots then settles; s = 1.70158 gives about 10 % overshoot. */
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  /** A drop that bounces twice; good for pins and roof slabs. */
  outBounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
};

/** Deterministic random numbers. Same seed -> same sequence (xorshift32 over an FNV-1a hash). */
export function rng(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let x = h || 0x9e3779b9;
  const next = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

// ---- 3D -> HTML -----------------------------------------------------------------------
const _v = new THREE.Vector3();
/**
 * Screen position (CSS px of a full-frame canvas) of a 3D point: an Object3D (its world
 * position), a Vector3 or an [x, y, z] array. visible is false behind the camera or off-frame.
 * Call it after the camera has been placed for this frame.
 */
export function project(point, camera, width = 1080, height = 1920) {
  if (point && point.isObject3D) point.getWorldPosition(_v);
  else if (Array.isArray(point)) _v.set(point[0], point[1], point[2]);
  else _v.copy(point);
  camera.updateMatrixWorld();
  _v.project(camera);
  return {
    x: (_v.x * 0.5 + 0.5) * width,
    y: (-_v.y * 0.5 + 0.5) * height,
    visible: _v.z > -1 && _v.z < 1 && Math.abs(_v.x) <= 1.05 && Math.abs(_v.y) <= 1.05,
  };
}

// ---- user models ------------------------------------------------------------------------
/** Loads a local .glb/.gltf (path relative to the scene). Resolves with the glTF scene graph. */
export async function loadGLB(url) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return gltf.scene;
}

/** Scales an object so its largest side equals `size`, centres it on x/z and stands it on y = 0. */
export function fitToSize(object, size = 2) {
  const box = new THREE.Box3().setFromObject(object);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
  object.scale.multiplyScalar(k);
  box.setFromObject(object);
  const c = box.getCenter(new THREE.Vector3());
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= box.min.y;
  return object;
}
