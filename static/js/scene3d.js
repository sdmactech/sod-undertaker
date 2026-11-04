/* ═══════════════════════════════════════════════════════
   THE UNDERTAKER'S LEDGER — v4 full 3D stage
   A wide, low strip behind the masthead title: the parlour table at night.
   Left: a brass candelabra and a skull. Right: the casket on its plinth,
   lid hinged on the back edge and opened by the scroll. Far right: an
   oil lantern and the bell. Three candle flames are textured billboards
   with their own flickering lights. Models: models/build_models.py
   (Blender; CC0 sources listed in models/sources/LICENSES.md).
   Loaded only when the Full 3D mode is on.
   ═══════════════════════════════════════════════════════ */
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const MODELS = '/static/models/';
const LID_OPEN = 1.13;                 // 65 degrees, up and away from the viewer
// candle tips on the candelabra, in its own glTF space (measured in Blender)
const CANDLE_TIPS = [[0, 0.385, 0], [-0.106, 0.367, 0], [0.106, 0.367, 0]];

export function createScene(host, { onCreak, onReady, onError } = {}) {
  const canvas = host.querySelector('canvas');
  const lite = matchMedia('(pointer: coarse)').matches || host.clientWidth < 640;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(lite ? 1 : Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060606, 0.11);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;

  const camera = new THREE.PerspectiveCamera(16, 2, 0.1, 40);
  const camHome = new THREE.Vector3(0.0, 0.62, 3.8);
  const look = new THREE.Vector3(0, 0.24, 0);
  camera.position.copy(camHome); camera.lookAt(look);

  /* ── lights ── */
  scene.add(new THREE.AmbientLight(0x33403f, 1.1));
  const moon = new THREE.DirectionalLight(0x3fb3cc, 1.3);          // cold teal from the window
  moon.position.set(-3, 5, -3); moon.castShadow = !lite;
  moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.02;
  Object.assign(moon.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 1, far: 14 });
  scene.add(moon);
  const lantern = new THREE.PointLight(0xffb366, 0, 6, 1.7);       // the roaming lantern (pointer)
  lantern.position.set(0, 1.2, 1.4); scene.add(lantern);
  const candleKey = new THREE.PointLight(0xffa64d, 0, 5.5, 1.8);   // one shadow-casting candle light for all three flames
  candleKey.castShadow = !lite; candleKey.shadow.mapSize.set(512, 512); candleKey.shadow.bias = -0.002;
  scene.add(candleKey);

  /* ── table top ── */
  const tl = new THREE.TextureLoader();
  const tex = (n, srgb) => { const t = tl.load(`/static/textures/${n}?v=${V}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2.5); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tableMat = new THREE.MeshStandardMaterial({ map: tex('table_diff.jpg', true), normalMap: tex('table_nor.jpg'), roughnessMap: tex('table_arm.jpg'), roughness: 1, metalness: 0, color: 0x6a5a4a });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), tableMat);
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

  /* ── dust ── */
  const N = lite ? 70 : 220;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 9; pos[i * 3 + 1] = Math.random() * 2.2; pos[i * 3 + 2] = (Math.random() - .5) * 4; vel[i] = .03 + Math.random() * .06; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe3b0, size: 0.018, transparent: true, opacity: 0.5, depthWrite: false })));

  /* ── flames: textured billboards, additive, plus a halo ── */
  const flameTex = tl.load(`/static/textures/flame.jpg?v=${V}`); flameTex.colorSpace = THREE.SRGBColorSpace;
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,225,170,1)'); r.addColorStop(.3, 'rgba(255,170,80,.45)'); r.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const flames = [];
  function addFlame(x, y, z, scale = 1) {
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 1 }));
    flame.center.set(0.5, 0.05); flame.scale.set(0.085 * scale, 0.19 * scale, 1); flame.position.set(x, y, z); scene.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .32 }));
    halo.scale.set(.3 * scale, .3 * scale, 1); halo.position.set(x, y + 0.05 * scale, z); scene.add(halo);
    flames.push({ flame, halo, seed: Math.random() * 10, base: scale });
    return flame;
  }

  /* ── models ── */
  const loader = new GLTFLoader();
  const group = new THREE.Group(); scene.add(group);
  let lid = null, casket = null;
  const wide = () => host.clientWidth / Math.max(1, host.clientHeight);
  const tune = (o, cast = true) => o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; if (m.material && m.material.map) m.material.map.anisotropy = 4; } });
  const load = n => new Promise((res, rej) => loader.load(`${MODELS}${n}.glb?v=${V}`, g => res(g.scene), undefined, rej));

  const props = {};
  Promise.all([load('casket'), load('candle'), load('skull'), load('lantern'), load('bell'), load('spade')]).then(([ck, candle, skull, lamp, bell, spade]) => {
    tune(ck); casket = ck; lid = ck.getObjectByName('CasketLid'); props.casket = ck; group.add(ck);
    tune(candle); props.candle = candle; group.add(candle);
    tune(skull); props.skull = skull; group.add(skull);
    tune(lamp); props.lamp = lamp; group.add(lamp);
    tune(bell); props.bell = bell; group.add(bell);
    tune(spade); props.spade = spade; group.add(spade);
    const lampLight = new THREE.PointLight(0xffb24a, 4.0, 4.5, 1.6); props.lampLight = lampLight; group.add(lampLight);
    const casketLight = new THREE.PointLight(0xffc48a, 5.5, 5, 1.5); casketLight.position.set(1.3, 1.2, 1.6); group.add(casketLight);
    layout(); onReady && onReady();
  }).catch(err => { console.error(err); onError ? onError(err) : onReady && onReady(); });

  /* composition depends on how wide the strip is */
  function layout() {
    if (!props.casket) return;
    const w = wide();                       // ~7 on a desktop strip, ~2.5 on a phone
    const narrow = w < 4;
    const sp = narrow ? 0.62 : 1;           // squeeze the spread on phones
    props.casket.position.set(2.05 * sp, 0.0, 0.15); props.casket.rotation.y = -1.15; props.casket.scale.setScalar(0.8);
    props.candle.position.set(-2.05 * sp, 0, 0.3); props.candle.rotation.y = 0.18; props.candle.scale.setScalar(0.72);   // arms across the strip; native height 0.70 -> 0.50
    props.skull.position.set(-1.4 * sp, 0, 0.9); props.skull.rotation.set(0.08, 0.75, 0); props.skull.scale.setScalar(0.6);
    props.lamp.position.set(2.85 * sp, 0, 0.7); props.lamp.rotation.y = -0.4; props.lamp.visible = !narrow;
    props.lampLight.position.set(2.75 * sp, 0.32, 0.75); props.lampLight.visible = !narrow;
    props.bell.position.set(2.45 * sp, 0, 1.0); props.bell.scale.setScalar(0.3); props.bell.visible = !narrow;
    props.spade.position.set(0.95 * sp, 0.0, 0.8); props.spade.rotation.set(-Math.PI / 2 + 0.18, 0, 0.9); props.spade.scale.setScalar(0.7); props.spade.visible = !narrow;
    for (const f of flames) { scene.remove(f.flame); scene.remove(f.halo); }
    flames.length = 0;
    const m = new THREE.Matrix4().compose(props.candle.position, new THREE.Quaternion().setFromEuler(props.candle.rotation), props.candle.scale);
    const tips = CANDLE_TIPS.map(t => new THREE.Vector3(...t).applyMatrix4(m));
    for (const p of tips) addFlame(p.x, p.y, p.z, 0.75);
    const c = tips.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / tips.length);
    candleKey.position.set(c.x, c.y + 0.1, c.z + 0.1);
    camera.fov = narrow ? 24 : 16; camera.updateProjectionMatrix();
  }

  /* ── interaction ── */
  let open = 0, openShown = 0, px = 0.5, py = 0.4, hover = false, hoverT = 0, creakT = -9;
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  host.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = casket ? ray.intersectObject(casket, true).length > 0 : false;
    if (hit && !hover && performance.now() - creakT > 1400) { creakT = performance.now(); hoverT = performance.now(); onCreak && onCreak(); }
    hover = hit;
  });
  host.addEventListener('pointerleave', () => { hover = false; });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); layout();
  }
  new ResizeObserver(resize).observe(host); resize();

  /* ── loop ── */
  let running = true, raf = 0, last = performance.now(), t = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;

    openShown += (open - openShown) * Math.min(1, dt * 4);
    const tremble = hover ? Math.sin((now - hoverT) / 1000 * 20) * Math.exp(-(now - hoverT) / 550) * 0.02 : 0;
    if (lid) lid.rotation.z = openShown * LID_OPEN + tremble;

    const tx = camHome.x + (px - .5) * 0.35, ty = camHome.y - (py - .5) * 0.15;
    camera.position.x += (tx - camera.position.x) * dt * 2; camera.position.y += (ty - camera.position.y) * dt * 2;
    camera.lookAt(look);

    lantern.intensity += ((hover ? 5.5 : 4.0) - lantern.intensity) * dt * 3;
    lantern.position.x += (((px - .5) * 6) - lantern.position.x) * dt * 4;
    lantern.position.z += ((1.0 + (py - .5) * 1.6) - lantern.position.z) * dt * 4;

    let sum = 0;
    for (const f of flames) {
      const n = Math.sin(t * 9 + f.seed) * .5 + Math.sin(t * 23.7 + f.seed * 2) * .3 + Math.sin(t * 41 + f.seed) * .2;
      f.flame.scale.set(0.085 * f.base * (1 + n * .12), 0.19 * f.base * (1 + n * .28), 1);
      f.flame.material.rotation = n * .09;
      f.halo.material.opacity = .22 + n * .08; f.halo.scale.setScalar(.3 * f.base * (1 + n * .18));
      sum += n;
    }
    candleKey.intensity = flames.length ? 2.6 + (sum / flames.length) * .7 : 0;

    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += vel[i] * dt; p[i * 3] += Math.sin(t * .6 + i) * .0006; if (p[i * 3 + 1] > 2.4) p[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  let visible = true, paused = false;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; sync(); }, { threshold: 0.02 }); io.observe(host);
  document.addEventListener('visibilitychange', sync);
  function sync() {
    const should = visible && !paused && !document.hidden;
    if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }

  return {
    setOpen(v) { open = v; },
    setPointer(x, y) { px = x; py = y; },
    pause() { paused = true; sync(); },
    resume() { paused = false; sync(); },
    dispose() { running = false; cancelAnimationFrame(raf); io.disconnect(); renderer.dispose(); pmrem.dispose(); },
  };
}
