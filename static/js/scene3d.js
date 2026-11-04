/* ═══════════════════════════════════════════════════════
   THE UNDERTAKER'S LEDGER — v4 full 3D stage
   One Three.js scene in the hero: the casket (lid hinged, opened by
   scroll), two candles with flickering lights, a skull, shovel and bell
   on a dark table, dust motes, and a lantern light that follows the
   pointer. Models come from models/build_models.py (Blender, procedural).
   Loaded only when the Full 3D mode is on.
   ═══════════════════════════════════════════════════════ */
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const MODELS = '/static/models/';

export function createScene(host, { onCreak, onReady, onError } = {}) {
  const canvas = host.querySelector('canvas');
  // phones and small screens get a lighter tier: no shadows, no antialias, 1x pixels, fewer motes
  const lite = matchMedia('(pointer: coarse)').matches || host.clientWidth < 640;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(lite ? 1 : Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070808, 0.16);

  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 40);
  camera.position.set(0.3, 1.55, 4.6);
  const look = new THREE.Vector3(0, 0.35, 0);
  camera.lookAt(look);

  /* ── lights: cold teal rim from above, warm candles, roaming lantern ── */
  scene.add(new THREE.AmbientLight(0x1a2a30, 0.9));
  const moon = new THREE.DirectionalLight(0x2aa3bd, 1.2);
  moon.position.set(-3, 5, -2); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0005;
  scene.add(moon);
  const lantern = new THREE.PointLight(0xffb366, 0, 7, 1.6);
  lantern.position.set(0, 1.4, 1.5); scene.add(lantern);
  const candleLights = [];

  /* ── table ── */
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.85, metalness: 0.05 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), tableMat);
  table.rotation.x = -Math.PI / 2; table.position.y = 0; table.receiveShadow = true;
  scene.add(table);
  // faint planks
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.9 });
  for (let i = -6; i <= 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 10), plankMat); p.position.set(i * 0.9, 0.002, 0); scene.add(p); }

  /* ── dust ── */
  const N = lite ? 90 : 260;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 7; pos[i * 3 + 1] = Math.random() * 2.6; pos[i * 3 + 2] = (Math.random() - .5) * 5; vel[i] = .04 + Math.random() * .08; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffe3b0, size: 0.022, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true });
  scene.add(new THREE.Points(dustGeo, dustMat));

  /* ── models ── */
  const loader = new GLTFLoader();
  const group = new THREE.Group(); scene.add(group);
  let lid = null, bell = null, skull = null;
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloMat = new THREE.SpriteMaterial({ color: 0xff9a3c, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, map: haloTexture() });

  function haloTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,220,160,1)'); r.addColorStop(.35, 'rgba(255,170,80,.5)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function tune(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material) { m.material.envMapIntensity = .6; } } }); }
  const load = (name) => new Promise((res, rej) => loader.load(`${MODELS}${name}.glb`, g => res(g.scene), undefined, rej));

  Promise.all([load('casket'), load('candle'), load('skull'), load('shovel'), load('bell')]).then(([casket, candle, sk, shovel, bl]) => {
    tune(casket); casket.position.set(0, 0.06, 0); casket.rotation.y = -0.42; casket.scale.setScalar(0.95);
    lid = casket.getObjectByName('CasketLid');
    group.add(casket);

    for (const [x, z, s] of [[-1.65, 0.55, 1], [1.5, -0.3, 0.82]]) {
      const c = candle.clone(true); tune(c); c.position.set(x, 0, z); c.scale.setScalar(s); group.add(c);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 10), flameMat); flame.position.set(x, 0.66 * s + 0.08, z); group.add(flame);
      const halo = new THREE.Sprite(haloMat.clone()); halo.scale.set(.9, .9, 1); halo.position.copy(flame.position); group.add(halo);
      const light = new THREE.PointLight(0xffa64d, 1.6, 4.5, 1.8); light.position.set(x, 0.66 * s + 0.12, z); light.castShadow = false; group.add(light);
      candleLights.push(light); flames.push({ flame, halo, light, seed: Math.random() * 10 });
    }
    tune(sk); sk.position.set(-1.05, 0, 1.15); sk.rotation.y = Math.PI + 0.55; sk.scale.setScalar(0.42); skull = sk; group.add(sk);
    tune(shovel); shovel.position.set(1.35, 0.03, 0.9); shovel.rotation.set(-Math.PI / 2 + 0.02, 0, 1.25); shovel.scale.setScalar(0.9); group.add(shovel);
    tune(bl); bl.position.set(1.95, 0, 0.75); bl.scale.setScalar(0.5); bell = bl; group.add(bl);
    onReady && onReady();
  }).catch(err => { console.error(err); onError ? onError(err) : onReady && onReady(); });

  /* ── interaction state ── */
  let open = 0, openShown = 0;           // target, displayed
  let px = 0.5, py = 0.3;                // pointer in 0..1
  let hover = false, hoverT = 0, creakT = -9;
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function setPointer(x, y) { px = x; py = y; }

  host.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = lid ? ray.intersectObject(lid.parent, true).length > 0 : false;
    if (hit && !hover && performance.now() - creakT > 1200) { creakT = performance.now(); hoverT = performance.now(); onCreak && onCreak(); }
    hover = hit;
  });
  host.addEventListener('pointerleave', () => { hover = false; });

  /* ── resize ── */
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.fov = w < 640 ? 44 : 32; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  /* ── loop ── */
  let running = true, raf = 0, last = performance.now();
  const clock = { t: 0 };
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock.t += dt;
    const t = clock.t;

    // lid: ease toward the scroll target; a hovered lid trembles a touch
    openShown += (open - openShown) * Math.min(1, dt * 4.5);
    const tremble = hover ? Math.sin((now - hoverT) / 1000 * 22) * Math.exp(-(now - hoverT) / 600) * 0.03 : 0;
    if (lid) lid.rotation.z = -(openShown * 1.95 + tremble);

    // camera drifts with the pointer, like leaning over the table
    const tx = 0.3 + (px - .5) * 0.9, ty = 1.55 - (py - .5) * 0.35;
    camera.position.x += (tx - camera.position.x) * dt * 2.2;
    camera.position.y += (ty - camera.position.y) * dt * 2.2;
    camera.lookAt(look);

    // lantern follows the pointer across the table
    lantern.intensity += ((hover ? 7 : 5.5) - lantern.intensity) * dt * 3;
    lantern.position.x += (((px - .5) * 5.2) - lantern.position.x) * dt * 4;
    lantern.position.z += ((1.2 + (py - .5) * 2.4) - lantern.position.z) * dt * 4;

    // candle flames flicker: noise on scale, position and light
    for (const f of flames) {
      const n = Math.sin(t * 9 + f.seed) * .5 + Math.sin(t * 23.7 + f.seed * 2) * .3 + Math.sin(t * 41 + f.seed) * .2;
      f.flame.scale.set(1 + n * .15, 1 + n * .35, 1 + n * .15);
      f.flame.position.x += Math.sin(t * 13 + f.seed) * .0006; f.flame.rotation.z = n * .18;
      f.halo.material.opacity = .28 + n * .1; f.halo.scale.setScalar(.85 + n * .2);
      f.light.intensity = 1.5 + n * .55;
    }
    // dust rises and drifts
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += vel[i] * dt; p[i * 3] += Math.sin(t * .6 + i) * .0008; if (p[i * 3 + 1] > 2.8) p[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;


    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // stop drawing when the hero is off screen or the tab is hidden
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; sync(); }, { threshold: 0.02 });
  let visible = true, paused = false; io.observe(host);
  document.addEventListener('visibilitychange', sync);
  function sync() {
    const should = visible && !paused && !document.hidden;
    if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  return {
    setOpen(v) { open = v; },
    setPointer,
    pause() { paused = true; sync(); },
    resume() { paused = false; sync(); },
    dispose() { running = false; cancelAnimationFrame(raf); io.disconnect(); renderer.dispose(); },
  };
}
