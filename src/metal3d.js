// MZ · 3D-модель позиции для карточки заказа (Three.js).
// Геометрия, материал и свет — те же, что в ~/Sites/mz-site/mz-metal-3d.html (источник истины, см. 3D-ASSETS.md);
// сюда вынесено только то, что нужно одной вращающейся модели. Внешних текстур нет.
// Использование: window.mz3d.open(id) — показать модель в #dsz3d, window.mz3d.close() — убрать и освободить WebGL-контекст.

import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const FINISHES = {
  profile: { base: [0.32, 0.325, 0.335], rough: 0.4, streak: 0.1, scale: 0.5, rust: 0.03, spangle: 0, bump: 0.5, seed: 1.3 },
  round:   { base: [0.12, 0.125, 0.135], rough: 0.42, streak: 0.08, scale: 0.55, rust: 0.04, spangle: 0, bump: 0.5, seed: 7.1 },
  channel: { base: [0.15, 0.155, 0.165], rough: 0.46, streak: 0.07, scale: 0.6, rust: 0.07, spangle: 0, bump: 0.7, seed: 3.7 },
  angle:   { base: [0.29, 0.295, 0.305], rough: 0.45, streak: 0.07, scale: 0.55, rust: 0.1, spangle: 0, bump: 0.7, seed: 5.9 },
  rebar:   { base: [0.105, 0.102, 0.1], rough: 0.55, streak: 0.04, scale: 0.6, rust: 0.38, spangle: 0, bump: 1.1, seed: 9.2 },
};

const GLSL_NOISE = /* glsl */ `
varying vec3 vLPos;
varying vec3 vLNormal;
uniform vec3 uBase;
uniform float uRough, uStreak, uRust, uSpangle, uBump, uSeed, uMetal;

vec3 mzMod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mzMod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mzPermute(vec4 x){return mzMod289(((x*34.0)+1.0)*x);}
vec4 mzTaylor(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float mzNoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mzMod289(i);
  vec4 p=mzPermute(mzPermute(mzPermute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  vec3 ns=0.142857142857*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 nr=mzTaylor(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nr.x; p1*=nr.y; p2*=nr.z; p3*=nr.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float mzFbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*mzNoise(p); p=p*2.03+17.1; a*=0.5; } return s; }
float mzHash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
vec3 mzHash3(vec3 p){ return vec3(mzHash(p), mzHash(p+19.19), mzHash(p+47.3)); }
// ячейки Вороного — кристаллы цинка на оцинковке
float mzCell(vec3 p){
  vec3 i=floor(p), f=fract(p); float md=8.0; vec3 id=i;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z)); vec3 r=g+mzHash3(i+g)-f; float d=dot(r,r);
    if(d<md){ md=d; id=i+g; }
  }
  return mzHash(id);
}
vec3 mzBumpN(vec3 pos, vec3 n, float h, float k){
  vec3 sx=dFdx(pos), sy=dFdy(pos); vec3 r1=cross(sy,n), r2=cross(n,sx);
  float det=dot(sx,r1); vec2 dh=vec2(dFdx(h),dFdy(h))*k;
  vec3 grad=sign(det)*(dh.x*r1+dh.y*r2);
  return normalize(abs(det)*n-grad);
}
`;

// Тело расчёта поверхности + растворение (вставляется в начало main)
const GLSL_SURFACE = /* glsl */ `
  vec3 q = vLPos * 10.0 + uSeed * 13.0;              // ~1 ед. = 1 см
  // ровный графит: лёгкая неоднородность вдоль проката + продольные полосы от валков
  float cloud = mzNoise(vec3(q.xy * 0.09, q.z * 0.016));
  float streak = mzNoise(vec3(q.xy * 2.2, q.z * 0.05)) * 0.6 + mzNoise(vec3(q.xy * 7.0, q.z * 0.12)) * 0.4;
  float micro = mzNoise(q * 3.0);

  vec3 mzCol = uBase * (0.97 + 0.04 * cloud) * (1.0 + uStreak * streak);
  float mzRough = uRough + 0.02 * cloud + 0.02 * micro;
  float mzMetal = uMetal;
  float mzH = streak * uStreak * 0.4 + micro * 0.02;

  // цинк: крупные кристаллы, низкий контраст
  if (uSpangle > 0.0) {
    float c = mzCell(q * 0.45 + vec3(0.0, 0.0, cloud * 0.6));
    mzCol *= 0.93 + 0.1 * c;
    mzRough += (c - 0.5) * 0.12;
    mzH += c * 0.06;
  }

  // ржавчина: искажённые пятна + точечные очаги
  if (uRust > 0.0) {
    vec3 w = vec3(mzFbm(q * 0.12), mzFbm(q * 0.12 + 9.0), mzFbm(q * 0.12 + 21.0));
    float rn = 0.5 + 0.5 * mzFbm(q * vec3(0.32, 0.32, 0.16) + w * 2.2);
    float rustMask = smoothstep(0.98 - uRust * 0.62, 1.08 - uRust * 0.62, rn);
    float pits = smoothstep(0.62, 0.8, mzNoise(q * 2.4 + 4.0)) * smoothstep(0.0, 0.3, uRust);
    rustMask = clamp(max(rustMask, pits * 0.8), 0.0, 1.0);
    float rv = 0.5 + 0.5 * mzNoise(q * 1.6 + 2.0);
    vec3 rustCol = mix(vec3(0.085, 0.032, 0.012), vec3(0.32, 0.12, 0.035), rv);
    rustCol = mix(rustCol, vec3(0.42, 0.2, 0.06), smoothstep(0.75, 1.0, rn) * 0.6);
    mzCol = mix(mzCol, rustCol, rustMask);
    mzRough = mix(mzRough, 0.88, rustMask);
    mzMetal = mix(mzMetal, 0.12, rustMask);
    mzH += rustMask * (0.35 + 0.4 * mzNoise(q * 4.5));
  }
  mzRough = clamp(mzRough, 0.08, 1.0);

  // свежий рез: светлее и матовее боковины, без продольных рисок проката
  float mzCut = smoothstep(0.88, 0.92, abs(normalize(vLNormal).z));
  float cutAngle = atan(vLPos.y, vLPos.x);
  float cutNoise = mzNoise(vec3(vLPos.xy * 24.0, uSeed));
  float saw = sin(cutAngle * 112.0 + cutNoise * 2.4 + length(vLPos.xy) * 5.0);
  vec3 cutCol = uBase * 2.25 * (0.99 + 0.035 * saw + 0.02 * cutNoise);
  mzCol = mix(mzCol, cutCol, mzCut);
  mzRough = mix(mzRough, clamp(0.6 + 0.02 * cutNoise, 0.55, 0.65), mzCut);
  mzMetal = mix(mzMetal, 1.0, mzCut);
  mzH = mix(mzH, saw * 0.018 + cutNoise * 0.01, mzCut);

`;

function makeMaterial(fin, shared) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, roughness: 0.4, envMapIntensity: 1.0,
    clearcoat: fin.clearcoat || 0, clearcoatRoughness: 0.35,
  });
  const uniforms = {
    uBase: { value: new THREE.Vector3(...fin.base) },
    uRough: { value: fin.rough }, uStreak: { value: fin.streak },
    uRust: { value: fin.rust }, uSpangle: { value: fin.spangle }, uBump: { value: fin.bump },
    uSeed: { value: fin.seed }, uMetal: { value: fin.metal ?? 0.9 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLPos;\nvarying vec3 vLNormal;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvLNormal = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_NOISE)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + GLSL_SURFACE)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mzCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mzRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mzMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = mzBumpN(-vViewPosition, normal, mzH, uBump * 0.012);');
  };
  mat.customProgramCacheKey = () => 'mz-metal';
  mat.userData.uniforms = uniforms;
  return mat;
}

// ---------- Окружение «цех/склад»: тёмное помещение, мягкий свет сверху, полоса сбоку ----------
function makeWarehouseEnv() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vD; void main(){ float t = smoothstep(-0.4, 0.7, vD.y); gl_FragColor = vec4(mix(vec3(0.02,0.021,0.024), vec3(0.16,0.165,0.17), t), 1.0); }',
    })
  );
  env.add(room);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  panel(14, 9, 0xfff6ec, 2.6, [0, 9, 1], [0, 0, 0]);        // большой софтбокс сверху
  panel(2.2, 12, 0xdfe8ff, 1.6, [-9, 3, -2], [0, 0, 0]);    // холодная полоса слева-сзади
  panel(1.4, 10, 0xffffff, 1.2, [8, 2, 5], [0, 0, 0]);      // узкий блик справа-спереди
  panel(16, 6, 0xf4f6f8, 0.4, [0, 1.5, 12], [0, 0, 0]);    // слабая заливка спереди — боковины остаются графитовыми
  return env;
}

// ---------- Геометрия профилей (поперечник в XY, длина вдоль Z) ----------
const LEN = 7.5;

function roundedRectPath(p, x, y, w, h, r) {
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x + w, y + h - r);
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x + r, y + h);
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x, y + r);
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
}

const EXTRUDE = { depth: LEN, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 2, curveSegments: 32, steps: 1 };

function extrude(shape, len = LEN) {
  let geo = new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth: len });
  geo.center();
  return toCreasedNormals(geo, THREE.MathUtils.degToRad(35));
}

function geoProfileTube(len = LEN) {
  const a = 0.6, t = 0.04;
  const s = roundedRectPath(new THREE.Shape(), -a / 2, -a / 2, a, a, 0.07);
  s.holes.push(roundedRectPath(new THREE.Path(), -a / 2 + t, -a / 2 + t, a - 2 * t, a - 2 * t, 0.035));
  return extrude(s, len);
}

function geoRoundPipe(len = LEN) {
  const R = 0.285, t = 0.035;
  const s = new THREE.Shape(); s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, R - t, 0, Math.PI * 2, true);
  s.holes.push(h);
  return extrude(s, len);
}

function geoChannel(len = LEN) {
  // 16П: h=160, b=64, s=5, t=8.4, r=8.5; 0.01 юнита = 1 мм
  const k = 0.01, h = 160 * k, b = 64 * k, tw = 5 * k, tf = 8.4 * k, rr = 8.5 * k;
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(b, 0); s.lineTo(b, tf); s.lineTo(tw + rr, tf);
  s.quadraticCurveTo(tw, tf, tw, tf + rr);
  s.lineTo(tw, h - tf - rr);
  s.quadraticCurveTo(tw, h - tf, tw + rr, h - tf);
  s.lineTo(b, h - tf); s.lineTo(b, h); s.lineTo(0, h); s.lineTo(0, 0);
  return extrude(s, len);
}

function geoAngle(len = LEN) {
  const a = 0.63, t = 0.05, rr = 0.05;
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(a, 0); s.lineTo(a, t); s.lineTo(t + rr, t);
  s.quadraticCurveTo(t, t, t, t + rr);
  s.lineTo(t, a); s.lineTo(0, a); s.lineTo(0, 0);
  return extrude(s, len);
}

function geoRebar(LEN_ = LEN) {
  const LEN = LEN_, r = 0.08, parts = [];
  const core = new THREE.CylinderGeometry(r, r, LEN, 40, 1, false);
  core.rotateX(Math.PI / 2);
  parts.push(core);
  for (const side of [-1, 1]) {           // продольные рёбра — пропорционально Ø16
    const rib = new THREE.BoxGeometry(0.022, 0.026, LEN);
    rib.translate(side * (r + 0.004), 0, 0);
    parts.push(rib);
  }
  const pitch = 0.11, lead = pitch * 2;    // винтовой шаг серповидных поперечных рёбер
  const n = Math.floor(LEN / pitch);
  for (let i = 0; i < n; i++) {
    for (const side of [0, 1]) {
      const z = -LEN / 2 + pitch / 2 + i * pitch + (side ? pitch / 2 : 0);
      if (z > LEN / 2 - 0.03) continue;
      const arc = new THREE.TorusGeometry(r, 0.018, 4, 8, Math.PI * 0.82);
      const pos = arc.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const a = Math.atan2(pos.getY(k), pos.getX(k));
        pos.setZ(k, pos.getZ(k) + (a - Math.PI * 0.41) * lead / (Math.PI * 2));
      }
      arc.computeVertexNormals();
      // фаза нарастает по длине: противоположные серпы образуют винтовые линии
      arc.rotateZ((z + LEN / 2) * Math.PI * 2 / lead + Math.PI * 0.09);
      arc.translate(0, 0, z);
      parts.push(arc);
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}


// --- дополнительные профили для картинок каталога ---
function iBeamShape(h, b, tw, tf, r) {
  const s = new THREE.Shape(), H = h / 2, B = b / 2, T = tw / 2;
  s.moveTo(-B, -H); s.lineTo(B, -H); s.lineTo(B, -H + tf); s.lineTo(T + r, -H + tf);
  s.quadraticCurveTo(T, -H + tf, T, -H + tf + r); s.lineTo(T, H - tf - r);
  s.quadraticCurveTo(T, H - tf, T + r, H - tf); s.lineTo(B, H - tf); s.lineTo(B, H);
  s.lineTo(-B, H); s.lineTo(-B, H - tf); s.lineTo(-T - r, H - tf);
  s.quadraticCurveTo(-T, H - tf, -T, H - tf - r); s.lineTo(-T, -H + tf + r);
  s.quadraticCurveTo(-T, -H + tf, -T - r, -H + tf); s.lineTo(-B, -H + tf); s.lineTo(-B, -H);
  return s;
}
const geoBeam = (len = LEN) => extrude(iBeamShape(0.62, 0.32, 0.04, 0.055, 0.05), len);
const geoEuroBeam = (len = LEN) => extrude(iBeamShape(0.52, 0.52, 0.045, 0.07, 0.06), len);
function geoRoundBar(len = LEN) { const g = new THREE.CylinderGeometry(0.16, 0.16, len, 48); g.rotateX(Math.PI / 2); return g; }
const geoSquare = (len = LEN) => extrude(roundedRectPath(new THREE.Shape(), -0.16, -0.16, 0.32, 0.32, 0.018), len);
const geoStrip = (len = LEN) => extrude(roundedRectPath(new THREE.Shape(), -0.32, -0.045, 0.64, 0.09, 0.012), len);
function geoSheets(len = LEN) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.BoxGeometry(1.6, 0.045, len);
    g.translate((i % 2 ? 0.02 : -0.015) + i * 0.006, i * 0.052, (i % 3) * 0.012);
    parts.push(g.toNonIndexed());
  }
  const m = mergeGeometries(parts); m.center(); return m;
}
function geoCoil() {
  const s = new THREE.Shape(); s.absarc(0, 0, 0.8, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, 0.34, 0, Math.PI * 2, true); s.holes.push(h);
  return extrude(s, 0.95);
}
function geoWireCoil(R, tube, turns, pitch) {
  const parts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < turns; i++) {
    const t = new THREE.TorusGeometry(R + rnd() * 0.05, tube, 8, 120);
    t.rotateX(rnd() * 0.08); t.rotateY(rnd() * 0.08);
    t.translate(rnd() * 0.04, rnd() * 0.04, i * pitch);
    parts.push(t.toNonIndexed());
  }
  const m = mergeGeometries(parts); m.center(); return m;
}
const geoWireRod = () => geoWireCoil(0.72, 0.034, 12, 0.07);
const geoWire = () => geoWireCoil(0.6, 0.016, 22, 0.034);


const THUMB = {
  armatura:    { geo: () => geoRebar(2.6), fin: 'rebar' },
  pipes_prof:  { geo: () => geoProfileTube(2.4), fin: 'profile' },
  pipes_round: { geo: () => geoRoundPipe(2.4), fin: 'round' },
  sheets:      { geo: () => geoSheets(2.2), fin: 'sheet', view: 'flat' },
  sheets_coil: { geo: geoCoil, fin: 'galv', view: 'coil' },
  beams:       { geo: () => geoBeam(2.4), fin: 'channel' },
  channels:    { geo: () => geoChannel(2.4), fin: 'channel' },
  round_bar:   { geo: () => geoRoundBar(2.6), fin: 'angle' },
  euro_beam:   { geo: () => geoEuroBeam(2.2), fin: 'channel' },
  angles:      { geo: () => geoAngle(2.4), fin: 'angle' },
  square:      { geo: () => geoSquare(2.6), fin: 'profile' },
  strip:       { geo: () => geoStrip(2.4), fin: 'angle', view: 'flat' },
  wire_rod:    { geo: geoWireRod, fin: 'rebar', view: 'coil' },
  wire:        { geo: geoWire, fin: 'profile', view: 'coil' },
};
FINISHES.galv = { base: [0.5, 0.51, 0.52], rough: 0.34, streak: 0.05, scale: 0.25, rust: 0, spangle: 1, bump: 0.3, seed: 4.4 };
// холоднокатаный лист: светлее и глаже проката, блик по плоскости — иначе стопка читается как фанера
FINISHES.sheet = { base: [0.62, 0.625, 0.635], rough: 0.16, streak: 0.03, scale: 0.3, rust: 0.01, spangle: 0, bump: 0.05, seed: 6.2, clearcoat: 1.0, metal: 0.55 };

// ---------- Вращающаяся модель в карточке заказа ----------
{
  const host = document.getElementById('dsz3d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = null;     // { renderer, raf, ro, mesh, envRT, pmrem, canvas, off }

  const dispose = () => {
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    cur.ro.disconnect();
    cur.off();
    cur.mesh.geometry.dispose(); cur.mesh.material.dispose();
    cur.envRT.dispose(); cur.pmrem.dispose();
    cur.renderer.dispose(); cur.renderer.forceContextLoss?.();   // иначе упрёмся в лимит WebGL-контекстов
    cur.canvas.remove();
    cur = null;
  };

  const open = (id) => {
    dispose();
    const t = THUMB[id];
    if (!host || !t) { host && (host.hidden = true); return; }
    host.hidden = false;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' }); }   // холст непрозрачный: без просвечивания слоёв под ним
    catch (e) { canvas.remove(); host.hidden = true; return; }      // нет WebGL — карточка просто без модели
    renderer.setClearColor(0x1c1f25, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = makeWarehouseEnv();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6ea).multiplyScalar(5.5), side: THREE.DoubleSide }));
    strip.position.set(1.5, 8, 4); strip.lookAt(0, 0, 0); envScene.add(strip);   // яркая полоса: без неё лист читается как фанера
    const envRT = pmrem.fromScene(envScene, 0.035);
    scene.environment = envRT.texture;
    const key = new THREE.DirectionalLight(0xfff4e8, 1.8); key.position.set(3, 6, 5);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8); rim.position.set(-5, 2, -4);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.12));

    const mesh = new THREE.Mesh(t.geo(), makeMaterial(FINISHES[t.fin], {}));
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.getCenter(mesh.position).negate();     // вращаем вокруг центра детали
    const spin = new THREE.Group(); spin.add(mesh);
    const holder = new THREE.Group(); holder.add(spin); scene.add(holder);
    holder.rotation.x = t.view === 'coil' ? -0.35 : 0.12;
    spin.rotation.y = 0.7;

    const sph = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(14)) * 0.95;
    camera.position.set(0, 0.42, 1).normalize().multiplyScalar(dist);
    camera.lookAt(0, 0, 0);

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (reduce) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    // ручное вращение: тянем мышью или пальцем, после отпускания модель продолжает крутиться сама
    let drag = null, vel = 0;
    const down = (e) => { drag = { x: e.clientX }; host.setPointerCapture?.(e.pointerId); host.classList.add('grab'); };
    const move = (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; spin.rotation.y += dx * 0.012; vel = dx * 0.012; if (reduce) renderer.render(scene, camera); };
    const up = () => { drag = null; host.classList.remove('grab'); };
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
    const off = () => {
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
    };

    let t0 = performance.now(), raf = 0;
    const tick = (now) => {
      const dt = Math.min((now - t0) / 1000, 0.05); t0 = now;
      if (!drag) { spin.rotation.y += dt * 0.5 + vel; vel *= 0.92; }
      renderer.render(scene, camera);
      cur.raf = requestAnimationFrame(tick);
    };
    cur = { renderer, raf, ro, mesh, envRT, pmrem, canvas, off };
    if (!reduce) cur.raf = requestAnimationFrame(tick);
  };

  window.mz3d = { open, close: dispose };
  document.getElementById('dsz')?.addEventListener('close', dispose);
}
