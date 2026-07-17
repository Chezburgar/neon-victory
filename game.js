// NEON VICTORY — a zero-g disc arena (WebXR). Original homage to zero-gravity disc sports.
import * as THREE from 'three';

// ---------------------------------------------------------------- constants
const BLUE = 0x25c8ff, ORANGE = 0xff7a1c, WHITE = 0xeaf6ff;
const BLUE_C = new THREE.Color(BLUE), ORANGE_C = new THREE.Color(ORANGE);
const UP = new THREE.Vector3(0, 1, 0);
const ARENA_HW = 13, ARENA_HH = 8, ARENA_HZ = 40, CHAM = 17;   // octagonal prism
const GOAL_Z = 38.6, GOAL_R = 1.5;                              // ring plane / radius
const SCORE_LIMIT = 5, MATCH_TIME = 300;
const LOBBY_Y = -80;
const ST = { LOBBY: 0, COUNT: 1, PLAY: 2, GOAL: 3, END: 4 };

// temps
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), v6 = new THREE.Vector3();
const hTmp = new THREE.Vector3(), hDir = new THREE.Vector3(), headPos = new THREE.Vector3();
const aimObj = new THREE.Object3D();

let state = ST.LOBBY, stateT = 0, mode = 'match';
let score = { blue: 0, orange: 0 }, matchClock = MATCH_TIME, sudden = false;
let time = 0, countLast = 4;

// ---------------------------------------------------------------- renderer / rig
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 30, 150);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 700);
camera.position.set(0, 1.6, 0);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- audio
let AC = null, master, sfxGain, musicGain, noise, anthemBuf = null;
let anthemSrc = null, anthemGain = null, boostGainNode = null, boostFilter = null;

function unlockAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  sfxGain = AC.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  musicGain = AC.createGain(); musicGain.gain.value = 1; musicGain.connect(master);
  const b = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = b;
  // boost thruster loop
  const src = AC.createBufferSource(); src.buffer = noise; src.loop = true;
  boostFilter = AC.createBiquadFilter(); boostFilter.type = 'bandpass'; boostFilter.frequency.value = 500; boostFilter.Q.value = 0.8;
  boostGainNode = AC.createGain(); boostGainNode.gain.value = 0;
  src.connect(boostFilter); boostFilter.connect(boostGainNode); boostGainNode.connect(sfxGain);
  src.start();
  // ambient pad
  const padG = AC.createGain(); padG.gain.value = 0.028;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  padG.connect(lp); lp.connect(master);
  for (const [f, g] of [[55, 1], [82.41, 0.6], [110, 0.4]]) {
    const o = AC.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const og = AC.createGain(); og.gain.value = g;
    o.connect(og); og.connect(padG); o.start();
  }
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = AC.createGain(); lfoG.gain.value = 70;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  // anthem
  fetch('./neon-victory.mp3').then(r => r.arrayBuffer())
    .then(ab => AC.decodeAudioData(ab))
    .then(buf => { anthemBuf = buf; })
    .catch(() => {});
}

function beep(f = 880, dur = 0.12, vol = 0.25, type = 'square') {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = type; o.frequency.value = f;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function zap(vol = 0.35) {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.16);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.25);
}
function whoosh(vol = 0.3) {
  if (!AC) return;
  const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noise;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(350, t);
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.3);
}
function thud(vol = 0.3, freq = 300) {
  if (!AC) return;
  const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noise;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.12);
}
function horn() {
  if (!AC) return;
  const t = AC.currentTime;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  const g = AC.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.03);
  g.gain.setValueAtTime(0.5, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
  lp.connect(g); g.connect(sfxGain);
  for (const f of [110, 164.8, 220.5]) {
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(lp); o.start(t); o.stop(t + 1.6);
  }
}
function playAnthem(dur = 9) {
  if (!AC) return;
  stopAnthem(0.05);
  if (!anthemBuf) return;
  const t = AC.currentTime;
  anthemSrc = AC.createBufferSource(); anthemSrc.buffer = anthemBuf;
  anthemGain = AC.createGain();
  anthemGain.gain.setValueAtTime(0.001, t);
  anthemGain.gain.linearRampToValueAtTime(0.95, t + 0.25);
  anthemGain.gain.setTargetAtTime(0, t + dur, 0.4);
  anthemSrc.connect(anthemGain); anthemGain.connect(musicGain);
  anthemSrc.start(t);
  anthemSrc.stop(t + dur + 2.5);
}
function stopAnthem(fade = 0.5) {
  if (!AC || !anthemSrc) return;
  try {
    const t = AC.currentTime;
    anthemGain.gain.cancelScheduledValues(t);
    anthemGain.gain.setValueAtTime(anthemGain.gain.value, t);
    anthemGain.gain.setTargetAtTime(0, t, fade / 3);
    anthemSrc.stop(t + fade + 0.2);
  } catch {}
  anthemSrc = null;
}
function volAt(p, base) { return base / (1 + 0.07 * headPos.distanceTo(p)); }

// ---------------------------------------------------------------- textures
function makePanelTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#0c1424'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#131f38'; x.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  x.strokeStyle = '#1a2c4e'; x.lineWidth = 3; x.strokeRect(2, 2, 252, 252);
  x.fillStyle = '#1d3a66';
  for (const [px, py] of [[16, 16], [240, 16], [16, 240], [240, 240]]) {
    x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const panelTex = makePanelTex();
function wallMat(repX, repY, color = 0xffffff) {
  const t = panelTex.clone(); t.needsUpdate = true; t.repeat.set(repX, repY);
  return new THREE.MeshBasicMaterial({ map: t, color });
}
function makeGridFloorTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#070b16'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#103055'; x.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }
  x.strokeStyle = '#1b5c8f'; x.lineWidth = 4;
  x.beginPath(); x.arc(256, 256, 140, 0, 7); x.stroke();
  x.beginPath(); x.arc(256, 256, 90, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- collision world
const planes = [], boxes = [], cyls = [], toruses = [];
{
  const SQ = Math.SQRT1_2;
  const addPlane = (nx, ny, nz, d) => planes.push({ n: new THREE.Vector3(nx, ny, nz), d });
  addPlane(-1, 0, 0, -ARENA_HW); addPlane(1, 0, 0, -ARENA_HW);
  addPlane(0, -1, 0, -ARENA_HH); addPlane(0, 1, 0, -ARENA_HH);
  addPlane(0, 0, -1, -ARENA_HZ); addPlane(0, 0, 1, -ARENA_HZ);
  addPlane(-SQ, -SQ, 0, -CHAM * SQ); addPlane(SQ, -SQ, 0, -CHAM * SQ);
  addPlane(-SQ, SQ, 0, -CHAM * SQ); addPlane(SQ, SQ, 0, -CHAM * SQ);
}
const colRes = { hit: false, impact: 0 };
function resolveSphere(p, r, vel, rest) {
  colRes.hit = false; colRes.impact = 0;
  // only inside the arena volume
  if (p.y > -40) {
    for (const pl of planes) {
      const d = pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z - pl.d;
      const pen = r - d;
      if (pen > 0) {
        p.x += pl.n.x * pen; p.y += pl.n.y * pen; p.z += pl.n.z * pen;
        colRes.hit = true;
        if (vel) {
          const vn = vel.dot(pl.n);
          if (vn < 0) { colRes.impact = Math.max(colRes.impact, -vn); vel.addScaledVector(pl.n, -(1 + rest) * vn); }
        }
      }
    }
    for (const b of boxes) {
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      colRes.hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), pen = r - d;
        dx /= d; dy /= d; dz /= d;
        p.x += dx * pen; p.y += dy * pen; p.z += dz * pen;
        if (vel) {
          const vn = vel.x * dx + vel.y * dy + vel.z * dz;
          if (vn < 0) { colRes.impact = Math.max(colRes.impact, -vn); vel.x -= (1 + rest) * vn * dx; vel.y -= (1 + rest) * vn * dy; vel.z -= (1 + rest) * vn * dz; }
        }
      } else {
        // center inside box: push along smallest axis
        const exs = [
          [p.x - b.min.x + r, -1, 0, 0], [b.max.x - p.x + r, 1, 0, 0],
          [p.y - b.min.y + r, 0, -1, 0], [b.max.y - p.y + r, 0, 1, 0],
          [p.z - b.min.z + r, 0, 0, -1], [b.max.z - p.z + r, 0, 0, 1]
        ];
        exs.sort((a, bb) => a[0] - bb[0]);
        const [pen, nx, ny, nz] = exs[0];
        p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
        if (vel) {
          const vn = vel.x * nx + vel.y * ny + vel.z * nz;
          if (vn < 0) { vel.x -= (1 + rest) * vn * nx; vel.y -= (1 + rest) * vn * ny; vel.z -= (1 + rest) * vn * nz; }
        }
      }
    }
    for (const c of cyls) {
      const az = Math.max(c.z0, Math.min(p.z, c.z1));
      let dx = p.x - c.x, dy = p.y - c.y, dz = p.z - az;
      const d2 = dx * dx + dy * dy + dz * dz, R = c.r + r;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(Math.max(d2, 1e-9));
      dx /= d; dy /= d; dz /= d;
      const pen = R - d;
      p.x += dx * pen; p.y += dy * pen; p.z += dz * pen;
      colRes.hit = true;
      if (vel) {
        const vn = vel.x * dx + vel.y * dy + vel.z * dz;
        if (vn < 0) { colRes.impact = Math.max(colRes.impact, -vn); vel.x -= (1 + rest) * vn * dx; vel.y -= (1 + rest) * vn * dy; vel.z -= (1 + rest) * vn * dz; }
      }
    }
    for (const tc of toruses) {
      const px = p.x - tc.cx, py = p.y - tc.cy, pz = p.z - tc.cz;
      const cxy = Math.hypot(px, py);
      if (cxy < 0.001) continue;
      const qx = cxy - tc.R, qz = pz;
      const qd = Math.hypot(qx, qz), Rr = tc.tube + r;
      if (qd >= Rr || qd < 1e-6) continue;
      const nx = (qx / qd) * (px / cxy), ny = (qx / qd) * (py / cxy), nz = qz / qd;
      const pen = Rr - qd;
      p.x += nx * pen; p.y += ny * pen; p.z += nz * pen;
      colRes.hit = true;
      if (vel) {
        const vn = vel.x * nx + vel.y * ny + vel.z * nz;
        if (vn < 0) { colRes.impact = Math.max(colRes.impact, -vn); vel.x -= (1 + rest) * vn * nx; vel.y -= (1 + rest) * vn * ny; vel.z -= (1 + rest) * vn * nz; }
      }
    }
  }
  return colRes;
}
const probeP = new THREE.Vector3();
function surfaceInReach(p, reach) {
  probeP.copy(p);
  resolveSphere(probeP, reach, null, 0);
  return colRes.hit;
}

// ---------------------------------------------------------------- arena build
const arena = new THREE.Group();
scene.add(arena);
const OCT = [[9, -8], [13, -4], [13, 4], [9, 8], [-9, 8], [-13, 4], [-13, -4], [-9, -8]];
const edgeGeoms = [];
const matDark = new THREE.MeshBasicMaterial({ color: 0x121c30 });

function addEdgesOf(geo, px, py, pz) {
  edgeGeoms.push({ geo, m: new THREE.Matrix4().makeTranslation(px, py, pz) });
}
function addBoxObs(cx, cy, cz, sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const m = new THREE.Mesh(g, matDark);
  m.position.set(cx, cy, cz);
  arena.add(m);
  boxes.push({
    min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
  });
  addEdgesOf(g, cx, cy, cz);
}

{
  // shell walls
  for (let i = 0; i < 8; i++) {
    const a = OCT[i], b = OCT[(i + 1) % 8];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    const dx = ex / len, dy = ey / len;
    const nx = dy, ny = -dx; // outward for CCW
    const mx = (a[0] + b[0]) / 2 + nx * 0.15, my = (a[1] + b[1]) / 2 + ny * 0.15;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.3, 80.8), wallMat(len / 4, 20));
    mesh.position.set(mx, my, 0);
    mesh.rotation.z = Math.atan2(dy, dx);
    arena.add(mesh);
  }
  // end caps
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(27.2, 17.2, 0.3), wallMat(6.8, 4.3, 0xb8c8e8));
    cap.position.set(0, 0, s * (ARENA_HZ + 0.15));
    arena.add(cap);
  }
  // ribs: octagon rings every 10m + longitudinal corner lines
  const pos = [];
  for (let z = -ARENA_HZ; z <= ARENA_HZ; z += 10) {
    for (let i = 0; i < 8; i++) {
      const a = OCT[i], b = OCT[(i + 1) % 8];
      pos.push(a[0], a[1], z, b[0], b[1], z);
    }
  }
  for (const [vx, vy] of OCT) pos.push(vx, vy, -ARENA_HZ, vx, vy, ARENA_HZ);
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const ribs = new THREE.LineSegments(ribGeo, new THREE.LineBasicMaterial({ color: 0x24406e, transparent: true, opacity: 0.75 }));
  arena.add(ribs);
  window.__ribGeo = ribGeo; // reused for the lobby hologram
  // glow strips along all 8 octagon corners + 4 bright chamfer centers
  const stripGeo = new THREE.BoxGeometry(0.14, 0.14, 80);
  const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 12);
  const sm = new THREE.Matrix4();
  let si = 0;
  for (const [vx, vy] of OCT) {
    sm.makeTranslation(vx * 0.985, vy * 0.985, 0);
    strips.setMatrixAt(si, sm);
    strips.setColorAt(si, new THREE.Color(0x16406e));
    si++;
  }
  for (const [vx, vy] of [[11, 6], [-11, 6], [-11, -6], [11, -6]]) {
    sm.makeTranslation(vx, vy, 0);
    strips.setMatrixAt(si, sm);
    strips.setColorAt(si, new THREE.Color(0x9fd8ff));
    si++;
  }
  strips.instanceMatrix.needsUpdate = true;
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
  arena.add(strips);
  // team tint rings near each end (blue defends +z, orange defends -z)
  const tintGeo = new THREE.BoxGeometry(1, 1, 1);
  const tints = new THREE.InstancedMesh(tintGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 16);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), tp = new THREE.Vector3();
  let ti = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const a = OCT[i], b = OCT[(i + 1) % 8];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const len = Math.hypot(ex, ey);
      const dx = ex / len, dy = ey / len;
      const nx = dy, ny = -dx;
      tp.set((a[0] + b[0]) / 2 - nx * 0.1, (a[1] + b[1]) / 2 - ny * 0.1, s * 34);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dx));
      sc.set(len, 0.22, 0.22);
      sm.compose(tp, q, sc);
      tints.setMatrixAt(ti, sm);
      tints.setColorAt(ti, s > 0 ? BLUE_C : ORANGE_C);
      ti++;
    }
  }
  tints.instanceMatrix.needsUpdate = true;
  if (tints.instanceColor) tints.instanceColor.needsUpdate = true;
  arena.add(tints);

  // ---- center ring structure (disc spawns in its hole)
  toruses.push({ cx: 0, cy: 0, cz: 0, R: 4, tube: 0.42 });
  const centerT = new THREE.Mesh(new THREE.TorusGeometry(4, 0.42, 10, 48), matDark);
  arena.add(centerT);
  const centerRim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.07, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0x35b6ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false }));
  centerRim.position.z = 0.36;
  arena.add(centerRim);
  const centerRim2 = centerRim.clone(); centerRim2.position.z = -0.36; arena.add(centerRim2);
  for (const [ax, ay] of [[5.7, 0], [-5.7, 0], [0, 5.7], [0, -5.7]]) addBoxObs(ax, ay, 0, 1.2, 1.2, 1.2);

  // ---- gate frames
  for (const gz of [-16, 16]) {
    addBoxObs(-6, 0, gz, 0.8, 12, 0.8);
    addBoxObs(6, 0, gz, 0.8, 12, 0.8);
    addBoxObs(0, 5.6, gz, 12.8, 0.8, 0.8);
    addBoxObs(0, -5.6, gz, 12.8, 0.8, 0.8);
  }
  // ---- floating blocks
  for (const [bx, by, bz] of [[5.5, 3, -25], [-5.5, -3, -25], [5.5, -3, 25], [-5.5, 3, 25], [-4, 4, 8], [4, -4, -8]]) {
    addBoxObs(bx, by, bz, 1.7, 1.7, 1.7);
  }
  // ---- grab rails
  const railGeo = new THREE.CylinderGeometry(0.22, 0.22, 60, 10);
  railGeo.rotateX(Math.PI / 2);
  for (const [rx, ry] of [[8.6, 4.9], [-8.6, 4.9], [8.6, -4.9], [-8.6, -4.9]]) {
    cyls.push({ x: rx, y: ry, z0: -30, z1: 30, r: 0.22 });
    const rm = new THREE.Mesh(railGeo, new THREE.MeshBasicMaterial({ color: 0x1b2c4a }));
    rm.position.set(rx, ry, 0);
    arena.add(rm);
  }
  // merged edge lines for obstacles
  const epos = [];
  for (const { geo, m } of edgeGeoms) {
    const e = new THREE.EdgesGeometry(geo, 30);
    const arr = e.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      v1.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(m);
      epos.push(v1.x, v1.y, v1.z);
    }
    e.dispose();
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3));
  arena.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x3f7fd0, transparent: true, opacity: 0.9 })));
}

// ---------------------------------------------------------------- goals
const goals = []; // {end:-1|1, ring, film, flash}
function makeGoal(end) {
  const team = end < 0 ? 'orange' : 'blue'; // defender
  const col = end < 0 ? ORANGE : BLUE;
  const g = new THREE.Group();
  g.position.set(0, 0, end * GOAL_Z);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, fog: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(GOAL_R, 0.12, 10, 48), ringMat);
  g.add(ring);
  toruses.push({ cx: 0, cy: 0, cz: end * GOAL_Z, R: GOAL_R, tube: 0.14 });
  const film = new THREE.Mesh(new THREE.CircleGeometry(GOAL_R - 0.06, 32),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  g.add(film);
  // struts to wall
  const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, ARENA_HZ - GOAL_Z, 6);
  strutGeo.rotateX(Math.PI / 2);
  for (const a of [0.25 * Math.PI, 0.75 * Math.PI, 1.25 * Math.PI, 1.75 * Math.PI]) {
    const s = new THREE.Mesh(strutGeo, new THREE.MeshBasicMaterial({ color: 0x2a4a80 }));
    s.position.set(Math.cos(a) * GOAL_R, Math.sin(a) * GOAL_R, end * (ARENA_HZ - GOAL_Z) / 2);
    g.add(s);
  }
  arena.add(g);
  const goal = { end, team, ring, ringMat, film, baseCol: new THREE.Color(col), flash: 0, flashCol: new THREE.Color(col) };
  goals.push(goal);
  return goal;
}
makeGoal(-1); makeGoal(1);

// stars
{
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(260 + Math.random() * 90);
    pos[i * 3] = v1.x; pos[i * 3 + 1] = v1.y - 40; pos[i * 3 + 2] = v1.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  stars.frustumCulled = false;
  scene.add(stars);
}

// ---------------------------------------------------------------- lobby
const lobby = new THREE.Group();
lobby.position.set(0, LOBBY_Y, 0);
scene.add(lobby);
let panelMesh, panelCtx, panelTexture, panelHover = null;
let holo, holoDisc, titleMesh;
const PANEL_BTNS = [
  { id: 'match', rect: [72, 300, 880, 150], label: 'MATCH  ·  3v3 VS BOTS' },
  { id: 'practice', rect: [72, 478, 880, 122], label: 'PRACTICE  ·  FREE FLIGHT' }
];
function drawPanel() {
  const x = panelCtx, W = 1024, H = 768;
  x.clearRect(0, 0, W, H);
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(10,17,32,0.96)'); bg.addColorStop(1, 'rgba(13,24,48,0.96)');
  x.fillStyle = bg;
  x.beginPath(); x.roundRect(0, 0, W, H, 28); x.fill();
  x.strokeStyle = '#2f5f9f'; x.lineWidth = 4; x.stroke();
  x.textAlign = 'center';
  x.shadowColor = '#35b6ff'; x.shadowBlur = 26;
  const tg = x.createLinearGradient(0, 40, 0, 130);
  tg.addColorStop(0, '#eaf8ff'); tg.addColorStop(1, '#35b6ff');
  x.fillStyle = tg;
  x.font = 'italic 900 92px "Arial Black", Arial';
  x.fillText('NEON VICTORY', W / 2, 128);
  x.shadowBlur = 0;
  x.fillStyle = '#7fa8d8';
  x.font = '600 30px Arial';
  x.fillText('Z E R O - G   D I S C   A R E N A', W / 2, 180);
  x.strokeStyle = '#1d3a66'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(90, 215); x.lineTo(W - 90, 215); x.stroke();
  for (const b of PANEL_BTNS) {
    const [bx, by, bw, bh] = b.rect;
    const hov = panelHover === b.id;
    x.fillStyle = hov ? '#1d3a66' : '#12233f';
    x.beginPath(); x.roundRect(bx, by, bw, bh, 18); x.fill();
    x.strokeStyle = hov ? '#8fe0ff' : '#35b6ff'; x.lineWidth = hov ? 5 : 3; x.stroke();
    x.fillStyle = hov ? '#eaf8ff' : '#bfe4ff';
    x.font = '800 52px Arial';
    x.fillText(b.label, bx + bw / 2, by + bh / 2 + 18);
  }
  x.fillStyle = '#89aed6'; x.font = '600 25px Arial'; x.textAlign = 'center';
  const lines = [
    'GRIP grab & fling  ·  TRIGGER wrist boost  ·  A/X brake  ·  stick-L thrust  ·  stick-R turn',
    'PUNCH fast to STUN  ·  throw the disc through the far ring to SCORE  ·  hold B/Y: lobby',
    'Desktop: drag look · WASD + Space/C fly · Shift brake · E grab/throw · F punch · Enter start'
  ];
  lines.forEach((l, i) => x.fillText(l, W / 2, 650 + i * 36));
  panelTexture.needsUpdate = true;
}
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 768;
  panelCtx = c.getContext('2d');
  panelTexture = new THREE.CanvasTexture(c);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.anisotropy = 4;
  panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 2.04),
    new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true, fog: false }));
  panelMesh.position.set(0, 1.62, 3.35);
  panelMesh.rotation.y = Math.PI;
  lobby.add(panelMesh);
  drawPanel();

  const floorT = makeGridFloorTex();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 11), new THREE.MeshBasicMaterial({ map: floorT }));
  floor.position.set(0, -0.15, 0.5);
  lobby.add(floor);
  const wallM = wallMat(3.5, 1.2);
  const mkWall = (w, h, px, py, pz, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallM.clone());
    m.position.set(px, py, pz); m.rotation.y = ry;
    lobby.add(m);
  };
  // +z wall with window hole (window y 1.3..3.5, width 8)
  mkWall(14, 1.3, 0, 0.65, 5.5);
  mkWall(14, 1.3, 0, 4.15, 5.5);
  mkWall(3, 2.2, -5.5, 2.4, 5.5);
  mkWall(3, 2.2, 5.5, 2.4, 5.5);
  mkWall(14, 4.8, 0, 2.4, -4.5);            // back
  mkWall(11.3, 4.8, -7, 2.4, 0.5, Math.PI / 2); // left
  mkWall(11.3, 4.8, 7, 2.4, 0.5, Math.PI / 2);  // right
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 11), wallM.clone());
  ceil.position.set(0, 4.95, 0.5);
  lobby.add(ceil);
  // ceiling light strips
  for (const lx of [-3, 0, 3]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 9),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff }));
    strip.position.set(lx, 4.78, 0.5);
    lobby.add(strip);
  }
  // window frame glow
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x35b6ff }));
  frame.position.set(0, 1.32, 5.34); lobby.add(frame);
  const frame2 = frame.clone(); frame2.position.y = 3.48; lobby.add(frame2);
  // title above window
  const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 192;
  const tx = tc.getContext('2d');
  tx.textAlign = 'center';
  tx.shadowColor = '#35b6ff'; tx.shadowBlur = 30;
  const tg2 = tx.createLinearGradient(0, 20, 0, 150);
  tg2.addColorStop(0, '#ffffff'); tg2.addColorStop(1, '#25c8ff');
  tx.fillStyle = tg2;
  tx.font = 'italic 900 120px "Arial Black", Arial';
  tx.fillText('NEON VICTORY', 512, 140);
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
  titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.24),
    new THREE.MeshBasicMaterial({ map: tt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  titleMesh.position.set(0, 4.2, 5.3);
  titleMesh.rotation.y = Math.PI;
  lobby.add(titleMesh);
  // banners
  const mkBanner = (col, px, name) => {
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 512;
    const bx = bc.getContext('2d');
    bx.fillStyle = '#0b1322'; bx.fillRect(0, 0, 256, 512);
    bx.strokeStyle = col; bx.lineWidth = 10; bx.strokeRect(10, 10, 236, 492);
    bx.fillStyle = col; bx.font = '900 110px Arial'; bx.textAlign = 'center';
    bx.fillText(name, 128, 300);
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3), new THREE.MeshBasicMaterial({ map: bt }));
    bm.position.set(px, 2.3, 0.5);
    bm.rotation.y = px < 0 ? Math.PI / 2 : -Math.PI / 2;
    lobby.add(bm);
  };
  mkBanner('#25c8ff', -6.8, 'BLU');
  mkBanner('#ff7a1c', 6.8, 'ORG');
  // pedestal + hologram of the arena
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 20), matDark);
  ped.position.set(-3.6, 0.45, 2.4); lobby.add(ped);
  const pedRim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 28), new THREE.MeshBasicMaterial({ color: 0x35b6ff }));
  pedRim.position.set(-3.6, 0.91, 2.4); pedRim.rotation.x = Math.PI / 2; lobby.add(pedRim);
  holo = new THREE.LineSegments(window.__ribGeo,
    new THREE.LineBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  holo.scale.setScalar(0.022);
  holo.position.set(-3.6, 1.55, 2.4);
  lobby.add(holo);
  // pedestal 2 + spinning disc replica
  const ped2 = ped.clone(); ped2.position.x = 3.6; lobby.add(ped2);
  const pedRim2 = pedRim.clone(); pedRim2.position.x = 3.6; lobby.add(pedRim2);
  holoDisc = new THREE.Group();
  const hdBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x0d1526 }));
  holoDisc.add(hdBody);
  const hdRim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x8fe8ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  hdRim.rotation.x = Math.PI / 2;
  holoDisc.add(hdRim);
  holoDisc.position.set(3.6, 1.5, 2.4);
  lobby.add(holoDisc);
  // planet outside window
  const pc = document.createElement('canvas'); pc.width = pc.height = 256;
  const px2 = pc.getContext('2d');
  const grad = px2.createRadialGradient(108, 100, 10, 128, 128, 126);
  grad.addColorStop(0, '#8fe8ff'); grad.addColorStop(0.55, '#1c6ea8'); grad.addColorStop(0.9, '#0a2038'); grad.addColorStop(1, 'rgba(6,16,30,0)');
  px2.fillStyle = grad;
  px2.beginPath(); px2.arc(128, 128, 126, 0, 7); px2.fill();
  const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
  const planet = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false, fog: false }));
  planet.scale.setScalar(30);
  planet.position.set(6, 8, 70);
  lobby.add(planet);
}

// ---------------------------------------------------------------- scoreboard / messages / HUD
let sbCtx, sbTexture, sbDirty = true, sbTimerShown = -1;
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  sbCtx = c.getContext('2d');
  sbTexture = new THREE.CanvasTexture(c);
  sbTexture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: sbTexture, transparent: true, fog: false });
  const mk = (px, py, pz, ry, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(px, py, pz); m.rotation.y = ry;
    arena.add(m);
  };
  mk(-12.8, 5, 0, Math.PI / 2, 10, 2.5);
  mk(12.8, 5, 0, -Math.PI / 2, 10, 2.5);
  mk(0, 6.6, -39.6, 0, 8, 2);
  mk(0, 6.6, 39.6, Math.PI, 8, 2);
}
let sbMessage = '';
function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function drawScoreboard() {
  const x = sbCtx, W = 1024, H = 256;
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(8,14,26,0.92)';
  x.beginPath(); x.roundRect(0, 0, W, H, 26); x.fill();
  x.strokeStyle = '#2f5f9f'; x.lineWidth = 5; x.stroke();
  x.textAlign = 'center';
  x.fillStyle = '#25c8ff'; x.font = '900 64px "Arial Black", Arial';
  x.fillText('BLU', 150, 90);
  x.font = '900 120px "Arial Black", Arial';
  x.fillText(String(score.blue), 150, 218);
  x.fillStyle = '#ff7a1c'; x.font = '900 64px "Arial Black", Arial';
  x.fillText('ORG', W - 150, 90);
  x.font = '900 120px "Arial Black", Arial';
  x.fillText(String(score.orange), W - 150, 218);
  x.fillStyle = '#eaf6ff'; x.font = '900 96px "Arial Black", Arial';
  const t = mode === 'practice' ? fmtClock(matchClock) : fmtClock(matchClock);
  x.fillText(t, W / 2, 140);
  x.fillStyle = '#89aed6'; x.font = '700 40px Arial';
  x.fillText(sbMessage || (mode === 'practice' ? 'PRACTICE' : `FIRST TO ${SCORE_LIMIT}`), W / 2, 216);
  sbTexture.needsUpdate = true;
}
// big floating message sprite
let msgCtx, msgTexture, msgSprite, msgT = 0;
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
  msgCtx = c.getContext('2d');
  msgTexture = new THREE.CanvasTexture(c);
  msgTexture.colorSpace = THREE.SRGBColorSpace;
  msgSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: msgTexture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  msgSprite.scale.set(17, 6.4, 1);
  msgSprite.position.set(0, 4.6, 0);
  msgSprite.renderOrder = 500;
  msgSprite.visible = false;
  scene.add(msgSprite);
}
function showMsg(text, sub, colorCss, dur = 2.5, big = false) {
  const x = msgCtx, W = 1024, H = 384;
  x.clearRect(0, 0, W, H);
  x.textAlign = 'center';
  x.shadowColor = colorCss; x.shadowBlur = 40;
  x.fillStyle = colorCss;
  x.font = `italic 900 ${big ? 250 : 150}px "Arial Black", Arial`;
  x.fillText(text, W / 2, big ? 270 : 190);
  if (sub) {
    x.shadowBlur = 14;
    x.fillStyle = '#eaf6ff';
    x.font = '800 58px Arial';
    x.fillText(sub, W / 2, big ? 368 : 300);
  }
  msgTexture.needsUpdate = true;
  msgSprite.visible = true;
  msgSprite.position.set(0, 4.6, 0);
  msgT = dur;
}
// wrist HUD
let wristCtx, wristTexture, wristMeshes = [];
{
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  wristCtx = c.getContext('2d');
  wristTexture = new THREE.CanvasTexture(c);
  wristTexture.colorSpace = THREE.SRGBColorSpace;
}
function drawWrist() {
  const x = wristCtx;
  x.clearRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(8,14,26,0.85)';
  x.beginPath(); x.roundRect(0, 0, 256, 128, 18); x.fill();
  x.strokeStyle = '#2f5f9f'; x.lineWidth = 4; x.stroke();
  x.textAlign = 'center';
  x.fillStyle = '#25c8ff'; x.font = '900 54px Arial';
  x.fillText(String(score.blue), 52, 60);
  x.fillStyle = '#ff7a1c';
  x.fillText(String(score.orange), 204, 60);
  x.fillStyle = '#eaf6ff'; x.font = '800 40px Arial';
  x.fillText(fmtClock(matchClock), 128, 108);
  x.fillStyle = '#89aed6'; x.font = '700 30px Arial';
  x.fillText(':', 128, 56);
  wristTexture.needsUpdate = true;
}

// fade + stun overlay quads
const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, fog: false }));
fadeQuad.position.z = -0.6;
fadeQuad.renderOrder = 1000;
fadeQuad.frustumCulled = false;
camera.add(fadeQuad);
const stunQuad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
stunQuad.position.z = -0.61;
stunQuad.renderOrder = 999;
stunQuad.frustumCulled = false;
camera.add(stunQuad);
let fadeVal = 0, fadeTarget = 0, fadeSpeed = 3, fadeCb = null;
function fadeTo(target, speed, cb) { fadeTarget = target; fadeSpeed = speed; fadeCb = cb || null; }

// ---------------------------------------------------------------- particles
const PART_N = 600;
const particles = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PART_N * 3), col = new Float32Array(PART_N * 3);
  pos.fill(-9999);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  const vel = new Float32Array(PART_N * 3), life = new Float32Array(PART_N);
  let head = 0;
  const tmpC = new THREE.Color();
  return {
    spawn(p, colorHex, n, speed, spread = 1) {
      tmpC.setHex(colorHex);
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % PART_N;
        life[i] = 0.6 + Math.random() * 0.7;
        v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
          .multiplyScalar(speed * (0.25 + Math.random()));
        vel[i * 3] = v1.x; vel[i * 3 + 1] = v1.y; vel[i * 3 + 2] = v1.z;
        pos[i * 3] = p.x + (Math.random() - 0.5) * spread * 0.3;
        pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread * 0.3;
        pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread * 0.3;
        const s = 0.6 + Math.random() * 0.6;
        col[i * 3] = tmpC.r * s; col[i * 3 + 1] = tmpC.g * s; col[i * 3 + 2] = tmpC.b * s;
      }
    },
    update(dt) {
      for (let i = 0; i < PART_N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= 0.985; vel[i * 3 + 1] *= 0.985; vel[i * 3 + 2] *= 0.985;
        if (life[i] < 0.35) {
          col[i * 3] *= 0.92; col[i * 3 + 1] *= 0.92; col[i * 3 + 2] *= 0.92;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  };
})();

// ---------------------------------------------------------------- disc
const disc = {
  state: 'free', holder: null, noCatchT: 0,
  pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), prevZ: 0,
  spin: 4, mesh: null, glow: null
};
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.045, 24), new THREE.MeshBasicMaterial({ color: 0x0d1526 }));
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x8fe8ff, fog: false }));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.052, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  g.add(core);
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128;
  const gx = glowC.getContext('2d');
  const gr = gx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(160,235,255,0.9)'); gr.addColorStop(0.4, 'rgba(60,180,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
  const glowT = new THREE.CanvasTexture(glowC);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(1.1);
  g.add(glow);
  disc.mesh = g; disc.glow = glow;
  disc.glowTex = glowT;
  scene.add(g);
  // trail
  const TN = 22;
  const tPos = new Float32Array(TN * 3);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: 0x54d8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  disc.trail = { geo: tGeo, pos: tPos, n: TN };
}
function trailReset() {
  const { pos: tp, n, geo } = disc.trail;
  for (let i = 0; i < n; i++) { tp[i * 3] = disc.pos.x; tp[i * 3 + 1] = disc.pos.y; tp[i * 3 + 2] = disc.pos.z; }
  geo.attributes.position.needsUpdate = true;
}
function trailPush() {
  const { pos: tp, n, geo } = disc.trail;
  tp.copyWithin(0, 3);
  tp[(n - 1) * 3] = disc.pos.x; tp[(n - 1) * 3 + 1] = disc.pos.y; tp[(n - 1) * 3 + 2] = disc.pos.z;
  geo.attributes.position.needsUpdate = true;
}
function holderIsHand(h) { return disc.holder === 'h0' || disc.holder === 'h1'; }
function pickupDisc(holder) {
  disc.state = 'held'; disc.holder = holder;
  disc.vel.set(0, 0, 0);
  beep(1760, 0.05, 0.15, 'square');
  if (typeof holder === 'string') {
    const hi = holder === 'h0' ? 0 : 1;
    hapticPulse(hi, 0.7, 60);
  }
}
function dropDisc(vel) {
  disc.state = 'free'; disc.holder = null;
  disc.vel.copy(vel);
  disc.noCatchT = 0.35;
}
function throwDiscFromHand(h) {
  v1.copy(h.vel).multiplyScalar(1.25);
  if (v1.length() > 21) v1.setLength(21);
  dropDisc(v1);
  disc.spin = 6 + v1.length();
  whoosh(Math.min(0.45, 0.1 + v1.length() * 0.02));
  hapticPulse(h.i, 0.4, 40);
}

// ---------------------------------------------------------------- bots
const bots = [];
function makeBot(team, idx) {
  const col = team === 'blue' ? BLUE : ORANGE;
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.34, 4, 10), new THREE.MeshBasicMaterial({ color: 0x131a2c }));
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.03), new THREE.MeshBasicMaterial({ color: col, fog: false }));
  chest.position.set(0, 0.08, 0.24);
  g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0e1526 }));
  head.position.y = 0.46;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: col, fog: false }));
  visor.position.set(0, 0.48, 0.12);
  g.add(visor);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.16), new THREE.MeshBasicMaterial({ color: 0x1b2c4a }));
    fin.position.set(s * 0.3, 0.18, -0.05);
    g.add(fin);
  }
  const thr = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc.glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  thr.position.set(0, -0.42, -0.12);
  thr.scale.setScalar(0.01);
  g.add(thr);
  scene.add(g);
  const bot = {
    team, idx, group: g, thr,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    stunT: 0, punchT: 0, catchCd: 0, holdsDisc: false, holdT: 0, aimT: 0,
    role: 'mid', lane: idx === 0 ? 0 : (idx === 1 ? -1 : 1), phase: Math.random() * 9,
    target: new THREE.Vector3(), steer: 0
  };
  bots.push(bot);
  return bot;
}
makeBot('blue', 1); makeBot('blue', 2);
makeBot('orange', 0); makeBot('orange', 1); makeBot('orange', 2);
const BOT_SPAWNS = {
  blue: [[-4, 2, 31], [4, -2, 31]],
  orange: [[0, 0, -30], [-4, 2, -31], [4, -2, -31]]
};
function resetBots() {
  let bi = 0, oi = 0;
  for (const b of bots) {
    const s = b.team === 'blue' ? BOT_SPAWNS.blue[bi++] : BOT_SPAWNS.orange[oi++];
    b.pos.set(s[0], s[1], s[2]);
    b.vel.set(0, 0, 0);
    b.stunT = 0; b.holdsDisc = false; b.holdT = 0; b.catchCd = 0;
    b.group.position.copy(b.pos);
    b.group.quaternion.identity();
    if (b.team === 'blue') b.group.rotation.y = Math.PI; // face -z? blue attacks -z: +Z local faces target via lookAt later
  }
}
function attackGoalCenter(team, out) { return out.set(0, 0, team === 'blue' ? -GOAL_Z : GOAL_Z); }
function defendGoalCenter(team, out) { return out.set(0, 0, team === 'blue' ? GOAL_Z : -GOAL_Z); }
function holderTeam() {
  if (disc.state !== 'held') return null;
  if (typeof disc.holder === 'string') return 'blue';
  return disc.holder.team;
}
function holderPos(out) {
  if (typeof disc.holder === 'string') return out.copy(headPos);
  return out.copy(disc.holder.pos);
}
let thinkT = 0;
function botThink() {
  for (const team of ['blue', 'orange']) {
    const units = bots.filter(b => b.team === team && b.stunT <= 0);
    units.sort((a, b) => a.pos.distanceToSquared(disc.pos) - b.pos.distanceToSquared(disc.pos));
    let shift = 0;
    if (team === 'blue' && state !== ST.LOBBY) {
      const pd = headPos.distanceToSquared(disc.pos);
      if (!units.length || pd < units[0].pos.distanceToSquared(disc.pos)) shift = 1;
    }
    units.forEach((b, i) => {
      const ri = i + shift;
      b.role = ri === 0 ? 'chase' : (ri === 1 ? 'mid' : 'goal');
    });
  }
}
function botTargetFor(b, out) {
  attackGoalCenter(b.team, v4);
  defendGoalCenter(b.team, v5);
  if (b.holdsDisc) {
    out.copy(v4);
    out.x += Math.sin(time * 1.6 + b.phase) * 3.4;
    out.y += Math.sin(time * 1.2 + b.phase * 2) * 2.2;
  } else if (state === ST.GOAL || disc.state === 'scored') {
    out.set(b.lane * 4, 0, b.team === 'blue' ? 26 : -26);
  } else if (disc.state === 'held') {
    if (holderTeam() === b.team) {
      if (b.role === 'goal') {
        out.copy(v5); out.z += (v5.z > 0 ? -5 : 5);
        out.x = THREE.MathUtils.clamp(disc.pos.x * 0.4, -2.5, 2.5);
        out.y = THREE.MathUtils.clamp(disc.pos.y * 0.4, -2.5, 2.5);
      } else {
        out.set(b.lane * 5, Math.sin(b.phase) * 2, v4.z * 0.5);
      }
    } else {
      if (b.role === 'chase') holderPos(out);
      else if (b.role === 'mid') { holderPos(out); out.lerp(v5, 0.45); }
      else {
        out.copy(v5); out.z += (v5.z > 0 ? -5 : 5);
        out.x = THREE.MathUtils.clamp(disc.pos.x * 0.4, -2.5, 2.5);
        out.y = THREE.MathUtils.clamp(disc.pos.y * 0.4, -2.5, 2.5);
      }
    }
  } else {
    if (b.role === 'chase') out.copy(disc.pos).addScaledVector(disc.vel, 0.2);
    else if (b.role === 'mid') {
      out.copy(disc.pos).lerp(v4, 0.5);
      out.x = THREE.MathUtils.clamp(out.x + b.lane * 4, -10, 10);
    } else {
      out.copy(v5); out.z += (v5.z > 0 ? -4.5 : 4.5);
      out.x = THREE.MathUtils.clamp(disc.pos.x * 0.4, -2.5, 2.5);
      out.y = THREE.MathUtils.clamp(disc.pos.y * 0.4, -2.5, 2.5);
    }
  }
  out.x = THREE.MathUtils.clamp(out.x, -11, 11);
  out.y = THREE.MathUtils.clamp(out.y, -6.5, 6.5);
  out.z = THREE.MathUtils.clamp(out.z, -37, 37);
  return out;
}
function nearestEnemyDist(b) {
  let d = 1e9;
  if (b.team === 'orange') d = Math.min(d, b.pos.distanceTo(headPos));
  for (const o of bots) {
    if (o.team === b.team || o.stunT > 0) continue;
    d = Math.min(d, b.pos.distanceTo(o.pos));
  }
  return d;
}
function botThrowAtGoal(b) {
  attackGoalCenter(b.team, v4);
  const d = disc.pos.distanceTo(v4);
  const err = 0.35 + d * 0.028;
  v4.x += (Math.random() - 0.5) * 2 * err;
  v4.y += (Math.random() - 0.5) * 2 * err;
  v1.copy(v4).sub(disc.pos).normalize().multiplyScalar(15);
  b.holdsDisc = false;
  dropDisc(v1);
  disc.spin = 16;
  b.catchCd = 1.0;
  whoosh(volAt(b.pos, 0.6));
}
function botPassTo(b, mate) {
  v1.copy(mate.pos).addScaledVector(mate.vel, 0.4).sub(disc.pos).normalize().multiplyScalar(12.5);
  b.holdsDisc = false;
  dropDisc(v1);
  b.catchCd = 1.0;
  whoosh(volAt(b.pos, 0.45));
}
function stunBot(b, impulse) {
  b.stunT = 3;
  b.vel.addScaledVector(impulse, 0.7);
  if (b.holdsDisc) {
    b.holdsDisc = false;
    v1.copy(b.vel).multiplyScalar(0.5);
    dropDisc(v1);
  }
  particles.spawn(b.pos, 0xfff37a, 30, 3.5);
  zap(volAt(b.pos, 0.4));
}
function stunPlayer(byBot) {
  if (pv.stunT > 0) return;
  pv.stunT = 2.6;
  if (holderIsHand(disc.holder) && disc.state === 'held') {
    v1.copy(pv.vel).multiplyScalar(0.6);
    v2.copy(headPos).sub(byBot.pos).normalize();
    v1.addScaledVector(v2, 1.5);
    dropDisc(v1);
  }
  if (pv.grabHand >= 0) pv.grabHand = -1;
  stunQuad.material.opacity = 0.4;
  zap(0.5);
  hapticPulse(0, 1, 300); hapticPulse(1, 1, 300);
  particles.spawn(headPos, 0xfff37a, 24, 3);
}
function updateBots(dt) {
  if (mode !== 'match' || state === ST.LOBBY) return;
  thinkT -= dt;
  if (thinkT <= 0) { thinkT = 0.25; botThink(); }
  const frozen = state === ST.COUNT;
  for (const b of bots) {
    b.punchT -= dt; b.catchCd -= dt;
    if (b.stunT > 0) {
      b.stunT -= dt;
      b.vel.multiplyScalar(Math.exp(-0.8 * dt));
      b.pos.addScaledVector(b.vel, dt);
      resolveSphere(b.pos, 0.42, b.vel, 0.3);
      b.group.position.copy(b.pos);
      b.group.rotation.z += 3 * dt;
      if (Math.random() < dt * 8) particles.spawn(b.pos, 0xfff37a, 2, 1.5);
      b.thr.scale.setScalar(0.01);
      continue;
    }
    if (frozen) { b.group.position.copy(b.pos); continue; }
    botTargetFor(b, b.target);
    v1.copy(b.target).sub(b.pos);
    const dist = v1.length();
    const maxS = b.holdsDisc ? 7 : 7.8;
    v1.normalize().multiplyScalar(Math.min(maxS, dist * 1.4));
    v2.copy(v1).sub(b.vel);
    const steer = Math.min(v2.length(), 13 * dt);
    b.steer = steer / Math.max(dt, 1e-4);
    v2.normalize().multiplyScalar(steer);
    b.vel.add(v2);
    b.pos.addScaledVector(b.vel, dt);
    resolveSphere(b.pos, 0.42, b.vel, 0.25);
    // carry / throw
    if (b.holdsDisc) {
      b.holdT += dt;
      attackGoalCenter(b.team, v4);
      const gd = b.pos.distanceTo(v4);
      const pressured = nearestEnemyDist(b) < 2.0;
      if ((gd < 19 && b.holdT > 0.5) || (pressured && b.holdT > 0.35) || b.holdT > 6) {
        const mate = bots.find(o => o.team === b.team && o !== b && o.stunT <= 0 && o.role === 'mid');
        if (pressured && mate && Math.random() < 0.4) botPassTo(b, mate);
        else botThrowAtGoal(b);
      }
    } else if (disc.state === 'free' && disc.noCatchT <= 0 && b.catchCd <= 0 && state === ST.PLAY) {
      if (b.pos.distanceTo(disc.pos) < 0.8) {
        pickupDisc(b);
        b.holdsDisc = true; b.holdT = 0;
      }
    }
    // orange bots punch the player when they hold the disc
    if (b.team === 'orange' && disc.state === 'held' && holderIsHand(disc.holder)) {
      if (b.punchT <= 0 && b.pos.distanceTo(headPos) < 1.15) {
        b.punchT = 1.6;
        if (Math.random() < 0.7) stunPlayer(b);
      }
    }
    // soft separation
    for (const o of bots) {
      if (o === b) continue;
      const d = b.pos.distanceTo(o.pos);
      if (d < 0.8 && d > 1e-4) {
        v1.copy(b.pos).sub(o.pos).multiplyScalar((0.8 - d) * 0.5 / d);
        b.pos.add(v1);
      }
    }
    b.group.position.copy(b.pos);
    // orient
    if (b.vel.lengthSq() > 0.2) {
      aimObj.position.copy(b.pos);
      v1.copy(b.pos).add(b.vel);
      aimObj.lookAt(v1);
      b.group.quaternion.slerp(aimObj.quaternion, 0.08);
    }
    b.thr.scale.setScalar(0.05 + Math.min(0.5, b.steer * 0.04));
  }
}

// ---------------------------------------------------------------- player
const pv = {
  vel: new THREE.Vector3(), stunT: 0,
  grabHand: -1, anchor: new THREE.Vector3(), grabVel: new THREE.Vector3()
};
const boostAccel = new THREE.Vector3();
let brakeHeld = false, totThrottle = 0, toLobbyRequested = false;
const hands = [];
const HIST_N = 10;
function hapticPulse(i, val, ms) {
  try { hands[i]?.gamepad?.hapticActuators?.[0]?.pulse(val, ms); } catch {}
}
for (let i = 0; i < 2; i++) {
  const ray = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  ray.visible = false; grip.visible = false;
  rig.add(ray); rig.add(grip);
  const h = {
    i, ray, grip, gamepad: null, handed: '',
    histP: Array.from({ length: HIST_N }, () => new THREE.Vector3()),
    histT: new Float64Array(HIST_N), histI: 0, histFill: 0,
    vel: new THREE.Vector3(), gripDown: false, selectDown: false,
    punchCd: 0, byT: 0, throttle: 0
  };
  hands.push(h);
  ray.addEventListener('connected', e => { h.handed = e.data.handedness || ''; h.gamepad = e.data.gamepad || null; });
  ray.addEventListener('disconnected', () => { h.gamepad = null; });
  ray.addEventListener('selectstart', () => { unlockAudio(); h.selectDown = true; onSelect(h); });
  ray.addEventListener('selectend', () => { h.selectDown = false; });
  ray.addEventListener('squeezestart', () => { unlockAudio(); h.gripDown = true; tryGrab(h); });
  ray.addEventListener('squeezeend', () => { h.gripDown = false; releaseGrab(h); });
  // gauntlet
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8ecff }));
  grip.add(knuckle);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 18), new THREE.MeshBasicMaterial({ color: BLUE, fog: false }));
  band.rotation.x = Math.PI / 2;
  grip.add(band);
  const boostSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: 0x9fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  boostSpr.scale.setScalar(0.01);
  grip.add(boostSpr);
  h.boostSpr = boostSpr;
  // pointer ray (lobby UI)
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]);
  const rayLine = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x54d8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ray.add(rayLine);
  h.rayLine = rayLine;
  // wrist hud
  const wh = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshBasicMaterial({ map: wristTexture, transparent: true, fog: false }));
  wh.position.set(0, 0.03, 0.1);
  wh.rotation.x = -1.1;
  grip.add(wh);
  h.wristMesh = wh;
  wristMeshes.push(wh);
}
// attach boost sprite texture after disc glow texture exists
for (const h of hands) h.boostSpr.material.map = disc.glowTex;

function handWorld(h, out) { return h.grip.getWorldPosition(out); }
function updateHandHist(h, dt) {
  handWorld(h, hTmp);
  const i = h.histI;
  h.histP[i].copy(hTmp);
  h.histT[i] = time;
  h.histI = (i + 1) % HIST_N;
  h.histFill = Math.min(h.histFill + 1, HIST_N);
  // velocity over ~90ms
  let best = -1, bestDt = 0;
  for (let k = 1; k < h.histFill; k++) {
    const j = (i - k + HIST_N) % HIST_N;
    const dtk = time - h.histT[j];
    if (dtk > 0.02) { best = j; bestDt = dtk; }
    if (dtk > 0.1) break;
  }
  if (best >= 0) h.vel.copy(hTmp).sub(h.histP[best]).divideScalar(bestDt);
}
function tryGrab(h) {
  if (state === ST.LOBBY || state === ST.COUNT || pv.stunT > 0) return;
  handWorld(h, hTmp);
  if (disc.state === 'free' && disc.noCatchT <= 0 && hTmp.distanceTo(disc.pos) < 0.45) {
    pickupDisc('h' + h.i);
    return;
  }
  if (surfaceInReach(hTmp, 0.38)) {
    pv.grabHand = h.i;
    pv.anchor.copy(hTmp);
    pv.grabVel.set(0, 0, 0);
    hapticPulse(h.i, 0.5, 40);
    thud(0.15, 500);
  }
}
function releaseGrab(h) {
  if (disc.state === 'held' && disc.holder === 'h' + h.i) {
    throwDiscFromHand(h);
    return;
  }
  if (pv.grabHand === h.i) {
    pv.grabHand = -1;
    pv.vel.copy(pv.grabVel);
    if (pv.vel.length() > 15) pv.vel.setLength(15);
  }
}
function onSelect(h) {
  if (state === ST.LOBBY) {
    const hit = raycastPanelFrom(h.ray);
    if (hit) clickPanel(hit);
  }
}
let snapReady = true;
function updateVRInput(dt) {
  for (const h of hands) {
    updateHandHist(h, dt);
    h.punchCd -= dt;
    const g = h.gamepad;
    h.wristMesh.visible = h.handed === 'left' && state !== ST.LOBBY;
    h.rayLine.visible = state === ST.LOBBY;
    if (!g || !g.buttons) { h.throttle = 0; h.boostSpr.scale.setScalar(0.01); continue; }
    const trig = g.buttons[0] ? g.buttons[0].value : 0;
    h.throttle = (pv.stunT > 0 || state === ST.COUNT || state === ST.LOBBY) ? 0 : trig;
    if (h.throttle > 0.04 && pv.grabHand < 0) {
      h.ray.getWorldDirection(hDir).negate();
      boostAccel.addScaledVector(hDir, 8.5 * h.throttle);
      totThrottle += h.throttle;
      if (h.throttle > 0.35 && Math.random() < 0.6) {
        handWorld(h, hTmp);
        particles.spawn(hTmp, 0x9fd8ff, 1, 2);
      }
    }
    h.boostSpr.scale.setScalar(0.01 + h.throttle * 0.3);
    if (g.buttons[4] && g.buttons[4].pressed) brakeHeld = true;
    if (g.buttons[5] && g.buttons[5].pressed) {
      h.byT += dt;
      if (h.byT > 1.2 && state !== ST.LOBBY) { h.byT = -99; toLobbyRequested = true; }
    } else h.byT = 0;
    const ax = g.axes[2] || 0, ay = g.axes[3] || 0;
    if (h.handed === 'right') {
      if (Math.abs(ax) > 0.6 && snapReady) { snapTurn(Math.sign(ax) * -Math.PI / 4); snapReady = false; }
      if (Math.abs(ax) < 0.3) snapReady = true;
    } else if (state !== ST.LOBBY && state !== ST.COUNT && pv.stunT <= 0) {
      if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) {
        camera.getWorldDirection(v1);
        v2.crossVectors(v1, UP).normalize();
        boostAccel.addScaledVector(v2, ax * 6.5);
        boostAccel.addScaledVector(v1, -ay * 6.5);
      }
    }
    // grip-held catch assist
    if (h.gripDown && disc.state === 'free' && disc.noCatchT <= 0 && state === ST.PLAY && pv.stunT <= 0) {
      handWorld(h, hTmp);
      if (hTmp.distanceTo(disc.pos) < 0.42) pickupDisc('h' + h.i);
    }
  }
}
function snapTurn(ang) {
  camera.getWorldPosition(v3);
  rig.position.sub(v3);
  rig.position.applyAxisAngle(UP, ang);
  rig.position.add(v3);
  rig.rotation.y += ang;
  beep(300, 0.04, 0.08, 'sine');
}
function teleportRig(targetHead, faceDir, feetY = null) {
  camera.getWorldDirection(v1);
  v1.y = 0;
  if (v1.lengthSq() < 1e-6) v1.set(0, 0, -1);
  v1.normalize();
  const curYaw = Math.atan2(v1.x, v1.z);
  const tgtYaw = Math.atan2(faceDir.x, faceDir.z);
  const dy = tgtYaw - curYaw;
  camera.getWorldPosition(v2);
  rig.position.sub(v2);
  rig.position.applyAxisAngle(UP, dy);
  rig.position.add(v2);
  rig.rotation.y += dy;
  camera.getWorldPosition(v2);
  if (feetY !== null) {
    rig.position.x += targetHead.x - v2.x;
    rig.position.z += targetHead.z - v2.z;
    rig.position.y = feetY;
  } else {
    rig.position.add(v3.copy(targetHead).sub(v2));
  }
  pv.vel.set(0, 0, 0);
  pv.grabHand = -1;
  deskYaw = rig.rotation.y;
}

// desktop controls
const keys = {};
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
let deskYaw = 0, deskPitch = 0;
const deskHand = { pos: new THREE.Vector3(), vel: new THREE.Vector3() };
let mouseNDC = new THREE.Vector2(-2, -2);
const raycaster = new THREE.Raycaster();
addEventListener('keydown', e => {
  if (e.repeat) return;
  unlockAudio();
  keys[e.code] = true;
  if (e.code === 'Enter' && state === ST.LOBBY) startMatch('match');
  if (e.code === 'Escape' && state !== ST.LOBBY) toLobbyRequested = true;
  if (e.code === 'KeyE') deskGrabThrow();
  if (e.code === 'KeyF') deskPunch();
});
addEventListener('keyup', e => { keys[e.code] = false; });
renderer.domElement.addEventListener('pointerdown', e => {
  unlockAudio();
  dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY;
});
addEventListener('pointermove', e => {
  mouseNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!dragging || renderer.xr.isPresenting) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  lastMX = e.clientX; lastMY = e.clientY;
  deskYaw -= dx * 0.0045;
  deskPitch = THREE.MathUtils.clamp(deskPitch - dy * 0.0045, -1.5, 1.5);
  rig.rotation.y = deskYaw;
  camera.rotation.x = deskPitch;
});
addEventListener('pointerup', e => {
  const wasClick = dragMoved < 6;
  dragging = false;
  if (!wasClick || renderer.xr.isPresenting) return;
  mouseNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (state === ST.LOBBY) {
    raycaster.setFromCamera(mouseNDC, camera);
    const hit = raycaster.intersectObject(panelMesh, false)[0];
    if (hit && hit.uv) clickPanel(uvToButton(hit.uv));
  } else {
    deskGrabThrow();
  }
});
function deskGrabThrow() {
  if (renderer.xr.isPresenting || state === ST.LOBBY || state === ST.COUNT || pv.stunT > 0) return;
  if (disc.state === 'held' && holderIsHand(disc.holder)) {
    camera.getWorldDirection(v1);
    v1.multiplyScalar(16).addScaledVector(pv.vel, 0.5);
    dropDisc(v1);
    disc.spin = 18;
    whoosh(0.4);
  } else if (disc.state === 'free' && disc.noCatchT <= 0 && headPos.distanceTo(disc.pos) < 2.2) {
    pickupDisc('h0');
  }
}
let deskPunchCd = 0;
function deskPunch() {
  if (renderer.xr.isPresenting || state !== ST.PLAY || deskPunchCd > 0) return;
  deskPunchCd = 0.6;
  camera.getWorldDirection(v1);
  for (const b of bots) {
    v2.copy(b.pos).sub(headPos);
    const d = v2.length();
    if (d < 2.4 && v2.normalize().dot(v1) > 0.6 && b.stunT <= 0) {
      v3.copy(v1).multiplyScalar(5);
      stunBot(b, v3);
      hapticPulse(0, 1, 80);
      break;
    }
  }
}
function updateDesktopInput(dt) {
  deskPunchCd -= dt;
  if (state === ST.LOBBY) {
    raycaster.setFromCamera(mouseNDC, camera);
    const hit = raycaster.intersectObject(panelMesh, false)[0];
    setPanelHover(hit && hit.uv ? uvToButton(hit.uv) : null);
    return;
  }
  if (state === ST.COUNT || pv.stunT > 0) return;
  camera.getWorldDirection(v1);
  v2.crossVectors(v1, UP).normalize();
  const A = 8.5;
  if (keys.KeyW) boostAccel.addScaledVector(v1, A);
  if (keys.KeyS) boostAccel.addScaledVector(v1, -A);
  if (keys.KeyA) boostAccel.addScaledVector(v2, -A);
  if (keys.KeyD) boostAccel.addScaledVector(v2, A);
  if (keys.Space) boostAccel.y += A;
  if (keys.KeyC) boostAccel.y -= A;
  if (keys.ShiftLeft || keys.ShiftRight) brakeHeld = true;
  totThrottle += Math.min(1, boostAccel.length() / A);
  // virtual hand for catches
  camera.getWorldPosition(deskHand.pos).addScaledVector(v1, 0.6);
  deskHand.vel.copy(pv.vel);
  const h0 = hands[0];
  h0.vel.copy(v1).multiplyScalar(12).add(pv.vel); // used if punch code reads it
}

function updatePlayerPhysics(dt) {
  if (pv.stunT > 0) {
    pv.stunT -= dt;
    stunQuad.material.opacity = Math.max(stunQuad.material.opacity - dt * 0.3, pv.stunT > 0 ? 0.12 : 0);
  } else if (stunQuad.material.opacity > 0) {
    stunQuad.material.opacity = Math.max(0, stunQuad.material.opacity - dt * 0.8);
  }
  const frozen = state === ST.COUNT;
  if (pv.grabHand >= 0 && !frozen && renderer.xr.isPresenting) {
    const h = hands[pv.grabHand];
    handWorld(h, v1);
    v2.copy(pv.anchor).sub(v1);
    rig.position.add(v2);
    v3.copy(v2).divideScalar(Math.max(dt, 1e-4));
    if (v3.length() > 18) v3.setLength(18);
    pv.grabVel.lerp(v3, 0.35);
  } else {
    if (!frozen) pv.vel.addScaledVector(boostAccel, dt);
    if (brakeHeld) pv.vel.multiplyScalar(Math.exp(-5 * dt));
    pv.vel.multiplyScalar(Math.exp(-0.035 * dt));
    if (pv.vel.length() > 16) pv.vel.setLength(16);
    if (!frozen) rig.position.addScaledVector(pv.vel, dt);
  }
  camera.getWorldPosition(headPos);
  v5.copy(headPos);
  resolveSphere(v5, 0.32, pv.grabHand >= 0 ? null : pv.vel, 0.1);
  if (colRes.hit) {
    rig.position.add(v6.copy(v5).sub(headPos));
    if (colRes.impact > 3.5) { thud(Math.min(0.4, colRes.impact * 0.05), 260); hapticPulse(0, 0.3, 50); hapticPulse(1, 0.3, 50); }
    camera.getWorldPosition(headPos);
  }
}
// punches (VR): fast hand into a bot
function updatePunches(dt) {
  if (!renderer.xr.isPresenting || state !== ST.PLAY || pv.stunT > 0) return;
  for (const h of hands) {
    if (h.punchCd > 0) continue;
    const speed = h.vel.length();
    if (speed < 3.2) continue;
    handWorld(h, hTmp);
    for (const b of bots) {
      if (b.stunT > 0) continue;
      if (hTmp.distanceTo(b.pos) < 0.55) {
        h.punchCd = 0.5;
        v1.copy(h.vel);
        stunBot(b, v1);
        hapticPulse(h.i, 1, 90);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- panel UI
function uvToButton(uv) {
  const px = uv.x * 1024, py = (1 - uv.y) * 768;
  for (const b of PANEL_BTNS) {
    const [bx, by, bw, bh] = b.rect;
    if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) return b.id;
  }
  return null;
}
function setPanelHover(id) {
  if (id !== panelHover) { panelHover = id; drawPanel(); }
}
function raycastPanelFrom(rayObj) {
  rayObj.getWorldPosition(v1);
  rayObj.getWorldDirection(v2).negate();
  raycaster.set(v1, v2);
  const hit = raycaster.intersectObject(panelMesh, false)[0];
  return hit && hit.uv ? uvToButton(hit.uv) : null;
}
function clickPanel(id) {
  if (!id) return;
  beep(1200, 0.07, 0.2);
  if (id === 'match') startMatch('match');
  else if (id === 'practice') startMatch('practice');
}

// ---------------------------------------------------------------- match flow
function resetDisc() {
  disc.state = 'free'; disc.holder = null;
  disc.pos.set(0, 0, 0);
  disc.vel.set(0, 0, 0);
  disc.noCatchT = 0;
  disc.spin = 3;
  for (const b of bots) { b.holdsDisc = false; }
  trailReset();
}
function resetPositions() {
  resetDisc();
  resetBots();
  teleportRig(v1.set(0, 0, 30), v2.set(0, 0, -1));
}
function startMatch(m) {
  mode = m;
  score.blue = 0; score.orange = 0;
  sudden = false;
  matchClock = m === 'match' ? MATCH_TIME : 0;
  sbMessage = '';
  sbDirty = true;
  stopAnthem(0.4);
  fadeTo(1, 4, () => {
    for (const b of bots) b.group.visible = (m === 'match');
    resetPositions();
    state = ST.COUNT; stateT = 3.99; countLast = 4;
    fadeTo(0, 2.2);
  });
}
function toLobby() {
  stopAnthem(0.6);
  fadeTo(1, 4, () => {
    state = ST.LOBBY;
    msgSprite.visible = false;
    resetDisc();
    for (const b of bots) b.group.visible = false;
    teleportRig(v1.set(0, LOBBY_Y, -1.4), v2.set(0, 0, 1), LOBBY_Y);
    fadeTo(0, 2.2);
  });
}
function teamCss(t) { return t === 'blue' ? '#25c8ff' : '#ff7a1c'; }
function teamName(t) { return t === 'blue' ? 'BLUE' : 'ORANGE'; }
function onGoal(team, end) {
  if (disc.state === 'held') {
    if (typeof disc.holder !== 'string') disc.holder.holdsDisc = false;
  }
  disc.state = 'scored'; disc.holder = null;
  disc.pos.set(0, 0, end * (GOAL_Z + 0.6));
  disc.vel.set(0, 0, 0);
  score[team]++;
  sbMessage = `${teamName(team)} SCORES`;
  sbDirty = true;
  const goal = goals.find(g => g.end === end);
  if (goal) { goal.flash = 1; goal.flashCol.setHex(team === 'blue' ? BLUE : ORANGE); }
  v1.set(0, 0, end * GOAL_Z);
  particles.spawn(v1, team === 'blue' ? BLUE : ORANGE, 220, 8, 3);
  particles.spawn(v1, 0xffffff, 60, 10, 3);
  horn();
  playAnthem(8.5);
  showMsg('GOAL', `${teamName(team)}  ·  ${score.blue} — ${score.orange}`, teamCss(team), 5);
  hapticPulse(0, 0.8, 200); hapticPulse(1, 0.8, 200);
  state = ST.GOAL; stateT = 6;
}
function endMatch(winner) {
  state = ST.END; stateT = 10;
  stopAnthem(0.2);
  playAnthem(16);
  const playerWon = winner === 'blue';
  showMsg(playerWon ? 'VICTORY' : 'DEFEAT',
    `${teamName(winner)} WINS  ·  ${score.blue} — ${score.orange}`,
    teamCss(winner), 10, true);
  sbMessage = 'FINAL';
  sbDirty = true;
}
function checkGoalCrossing() {
  if (state !== ST.PLAY) { disc.prevZ = disc.pos.z; return; }
  const z = disc.pos.z, pz = disc.prevZ;
  for (const end of [-1, 1]) {
    const plane = end * GOAL_Z;
    if ((pz - plane) * (z - plane) < 0) {
      const t = (plane - pz) / (z - pz);
      // approximate x/y at crossing using current pos (positions close between frames)
      const cx = disc.pos.x, cy = disc.pos.y;
      if (cx * cx + cy * cy < (GOAL_R - 0.08) * (GOAL_R - 0.08)) {
        onGoal(end < 0 ? 'blue' : 'orange', end);
        return;
      }
    }
  }
  disc.prevZ = z;
}
function updateDisc(dt) {
  disc.noCatchT -= dt;
  const frozen = state === ST.COUNT;
  if (disc.state === 'held') {
    if (holderIsHand(disc.holder)) {
      const h = hands[disc.holder === 'h0' ? 0 : 1];
      if (renderer.xr.isPresenting) {
        handWorld(h, disc.pos);
        disc.mesh.quaternion.setFromRotationMatrix(h.grip.matrixWorld);
      } else {
        camera.getWorldPosition(disc.pos);
        camera.getWorldDirection(v1);
        disc.pos.addScaledVector(v1, 0.7);
        disc.pos.y -= 0.15;
      }
    } else {
      const b = disc.holder;
      v1.set(0, 0, 1).applyQuaternion(b.group.quaternion);
      disc.pos.copy(b.pos).addScaledVector(v1, 0.55);
      disc.pos.y += 0.1;
    }
    disc.mesh.position.copy(disc.pos);
    checkGoalCrossing(); // carried dunks count
    trailPush();
  } else if (disc.state === 'free') {
    if (!frozen) {
      disc.pos.addScaledVector(disc.vel, dt);
      resolveSphere(disc.pos, 0.16, disc.vel, 0.72);
      if (colRes.impact > 2) {
        thud(volAt(disc.pos, Math.min(0.5, colRes.impact * 0.05)), 400 + colRes.impact * 30);
        if (colRes.impact > 4) particles.spawn(disc.pos, 0x54d8ff, 8, 2);
      }
      disc.vel.multiplyScalar(Math.exp(-0.004 * dt));
      if (disc.vel.length() > 24) disc.vel.setLength(24);
      checkGoalCrossing();
    }
    disc.mesh.position.copy(disc.pos);
    disc.mesh.rotation.y += disc.spin * dt;
    disc.spin *= Math.exp(-0.2 * dt);
    trailPush();
  } else { // scored
    disc.mesh.position.copy(disc.pos);
    disc.mesh.rotation.y += 4 * dt;
    disc.prevZ = disc.pos.z;
  }
  const pulse = 1 + Math.sin(time * 5) * 0.12;
  disc.glow.scale.setScalar(1.1 * pulse);
}
function updateStateMachine(dt) {
  stateT -= dt;
  if (state === ST.COUNT) {
    const c = Math.ceil(stateT);
    if (c !== countLast && c > 0) {
      countLast = c;
      showMsg(String(c), mode === 'match' ? 'GET READY' : 'PRACTICE', '#eaf6ff', 1.1, true);
      beep(660, 0.12, 0.3);
    }
    if (stateT <= 0) {
      state = ST.PLAY;
      showMsg('GO!', null, '#8fe8ff', 0.7, true);
      beep(1320, 0.3, 0.35);
      sbDirty = true;
    }
  } else if (state === ST.PLAY) {
    if (mode === 'match') {
      if (!sudden) {
        matchClock -= dt;
        if (matchClock <= 0) {
          matchClock = 0;
          if (score.blue === score.orange) {
            sudden = true;
            sbMessage = 'SUDDEN DEATH';
            sbDirty = true;
            showMsg('SUDDEN DEATH', 'NEXT GOAL WINS', '#ffd54a', 3);
            horn();
          } else {
            endMatch(score.blue > score.orange ? 'blue' : 'orange');
          }
        }
      }
    } else {
      matchClock += dt;
    }
  } else if (state === ST.GOAL) {
    if (stateT <= 0) {
      if (score.blue >= SCORE_LIMIT || score.orange >= SCORE_LIMIT || sudden) {
        endMatch(score.blue > score.orange ? 'blue' : 'orange');
      } else {
        resetPositions();
        state = ST.COUNT; stateT = 3.99; countLast = 4;
        sbMessage = sudden ? 'SUDDEN DEATH' : '';
        sbDirty = true;
      }
    }
  } else if (state === ST.END) {
    if (stateT > 2 && Math.random() < dt * 1.4) {
      v1.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 50);
      particles.spawn(v1, Math.random() < 0.5 ? BLUE : (Math.random() < 0.5 ? ORANGE : 0xffffff), 60, 6, 2);
    }
    if (stateT <= 0) toLobby();
  }
  if (toLobbyRequested) { toLobbyRequested = false; toLobby(); }
}

// ---------------------------------------------------------------- HUD / ambience updates
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.45;
    const shown = Math.ceil(matchClock);
    if (sbDirty || shown !== sbTimerShown) {
      sbTimerShown = shown;
      sbDirty = false;
      drawScoreboard();
      drawWrist();
    }
  }
  if (msgSprite.visible) {
    msgT -= dt;
    if (msgT <= 0) msgSprite.visible = false;
    else if (msgT < 0.5) msgSprite.material.opacity = msgT * 2;
    else msgSprite.material.opacity = 1;
  }
  // goal flashes + film pulse
  for (const g of goals) {
    if (g.flash > 0) {
      g.flash = Math.max(0, g.flash - dt * 0.7);
      g.ringMat.color.copy(g.baseCol).lerp(g.flashCol, 0).lerpColors(g.baseCol, g.flashCol, g.flash > 0.5 ? 1 : g.flash * 2);
      g.film.material.opacity = 0.25 + g.flash * 0.5;
      g.film.scale.setScalar(1 + Math.sin(time * 20) * 0.03 * g.flash);
    } else {
      g.ringMat.color.copy(g.baseCol);
      g.film.material.opacity = 0.18 + Math.sin(time * 2.4 + g.end) * 0.07;
    }
  }
  // lobby ambience
  if (holo) { holo.rotation.y += dt * 0.3; }
  if (holoDisc) { holoDisc.rotation.y += dt * 1.2; holoDisc.position.y = LOBBY_Y + 1.5 + Math.sin(time * 1.3) * 0.06; }
  if (titleMesh) titleMesh.material.opacity = 0.85 + Math.sin(time * 2.2) * 0.15;
  // fade
  if (fadeVal !== fadeTarget) {
    const dir = Math.sign(fadeTarget - fadeVal);
    fadeVal += dir * fadeSpeed * dt;
    if ((dir > 0 && fadeVal >= fadeTarget) || (dir < 0 && fadeVal <= fadeTarget)) {
      fadeVal = fadeTarget;
      if (fadeCb) { const cb = fadeCb; fadeCb = null; cb(); }
    }
    fadeQuad.material.opacity = fadeVal;
  }
}
function updateAudioFrame() {
  if (!AC || !boostGainNode) return;
  const speed = pv.vel.length();
  const target = Math.min(0.32, totThrottle * 0.2 + speed * 0.003);
  boostGainNode.gain.setTargetAtTime(target, AC.currentTime, 0.06);
  boostFilter.frequency.setTargetAtTime(400 + speed * 25 + totThrottle * 250, AC.currentTime, 0.08);
}

// ---------------------------------------------------------------- VR hover for panel
function updateVRPanelHover() {
  if (state !== ST.LOBBY) return;
  let id = null;
  for (const h of hands) {
    const hit = raycastPanelFrom(h.ray);
    if (hit) { id = hit; break; }
  }
  setPanelHover(id);
}

// ---------------------------------------------------------------- boot / loop
const vrBtn = document.getElementById('vrbtn');
const hint = document.getElementById('hint');
hint.textContent = 'NEON VICTORY — desktop preview\ndrag: look · WASD: fly · Space/C: up/down · Shift: brake\nE: grab/throw · F: punch · Enter: start match · Esc: lobby';
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (ok) vrBtn.style.display = 'block';
  }).catch(() => {});
}
vrBtn.addEventListener('click', async () => {
  unlockAudio();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (e) {
    console.warn('VR session failed', e);
  }
});
renderer.xr.addEventListener('sessionstart', () => {
  if (renderer.xr.setFoveation) renderer.xr.setFoveation(1);
  hint.style.display = 'none';
  vrBtn.style.display = 'none';
  for (const h of hands) { h.ray.visible = true; h.grip.visible = true; }
  // re-teleport so the local-floor origin lines up with wherever we are
  if (state === ST.LOBBY) teleportRig(v1.set(0, LOBBY_Y, -1.4), v2.set(0, 0, 1), LOBBY_Y);
});
renderer.xr.addEventListener('sessionend', () => {
  hint.style.display = 'block';
  vrBtn.style.display = 'block';
  for (const h of hands) { h.ray.visible = false; h.grip.visible = false; }
  camera.position.set(0, 1.6, 0);
  camera.rotation.set(deskPitch, 0, 0);
});

// initial placement
teleportRig(v1.set(0, LOBBY_Y, -1.4), v2.set(0, 0, 1), LOBBY_Y);
for (const b of bots) b.group.visible = false;
resetDisc();
drawScoreboard();
drawWrist();

const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  boostAccel.set(0, 0, 0);
  brakeHeld = false;
  totThrottle = 0;
  if (renderer.xr.isPresenting) {
    updateVRInput(dt);
    updateVRPanelHover();
  } else {
    updateDesktopInput(dt);
  }
  if (state !== ST.LOBBY) {
    updatePlayerPhysics(dt);
    updateDisc(dt);
    updateBots(dt);
    updatePunches(dt);
  } else {
    camera.getWorldPosition(headPos);
  }
  updateStateMachine(dt);
  particles.update(dt);
  updateHUD(dt);
  updateAudioFrame();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    const l = document.getElementById('load');
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 700);
  }
}
renderer.setAnimationLoop(loop);

// test hooks
window.__nv = {
  get state() { return state; },
  score, disc, bots, pv,
  startMatch,
  forceGoal: t => onGoal(t, t === 'blue' ? -1 : 1),
  drawCalls: () => renderer.info.render.calls
};
