// ---- Первый экран «Разрез здания» (?hero=building): сцена three.js r128 из файла «building structure.html» ----
// Грузится только когда выбран этот вариант: сам three.js подключается с CDN и только по запросу (mzBuildingStart).
// Мышь двигает камеру и «рентген» — рядом с курсором бетон отъезжает и открывается арматурный каркас.
// Без мыши (телефон) «рентген» ходит по зданию сам. Рендер стоит на паузе, когда экран вне вида; «уменьшить движение» — один кадр.
window.mzBuildingStart = function (host) {
  return new Promise((resolve, reject) => {
    const run = () => { const t0 = performance.now(); init(host).then(() => { performance.measure('building-init', { start: t0 }); resolve(); }, reject); };
    if (window.THREE) return run();
    // На странице уже есть своя копия three.js 0.169 (3D-модель в окне размеров). Сначала ждём её (метка __THREE__),
    // потом грузим r128 для этой сцены и временно прячем метку, чтобы две копии не ругались друг на друга в консоли.
    const t0 = performance.now();
    const load = () => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      const prev = window.__THREE__; delete window.__THREE__;
      s.onload = () => { if (prev) window.__THREE__ = prev; run(); };
      s.onerror = () => reject(new Error('three.js не загрузился'));
      document.head.appendChild(s);
    };
    const go = () => { if (!window.__THREE__ && performance.now() - t0 < 4000) setTimeout(go, 60); else load(); };
    go();
  });
};

async function init(host) {
      'use strict';
      const pause = () => new Promise((r) => setTimeout(r, 0)); // отдаём браузеру кадр между тяжёлыми шагами: страница не замирает
      await pause();


      // ============================================================================
      // 1. STATE & INTERACTION CONFIGURATION
      // ============================================================================
      const state = {
        progress: 0.34,
        targetProgress: 0.34,
        mouseX: 0,
        mouseY: 0,
        smoothMouseX: 0,
        smoothMouseY: 0,
        rayWorldPos: new THREE.Vector3(999, 999, 999),
        smoothRayPos: new THREE.Vector3(999, 999, 999),
        sliceMode: true,
        autoPlay: false,
        mouseLensEnabled: true,
        uiVisible: true,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        orbitYawOffset: 0,
        orbitPitchOffset: 0,
        targetYawOffset: 0,
        targetPitchOffset: 0,
        clock: new THREE.Clock()
      };

      

      // ============================================================================
      // 2. THREE.JS SCENE, CAMERA & RENDERER
      // ============================================================================
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);
      const W0 = Math.max(1, host.clientWidth), H0 = Math.max(1, host.clientHeight);
      const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(W0, H0, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.localClippingEnabled = true;

      const scene = new THREE.Scene();

      // High-resolution atmospheric sky dome matching the golden-hour sky
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 1024;
      skyCanvas.height = 512;
      const sCtx = skyCanvas.getContext('2d');
      const skyGrad = sCtx.createLinearGradient(0, 0, 0, 512);
      skyGrad.addColorStop(0.0, '#0e1218');
      skyGrad.addColorStop(0.40, '#161d26');
      skyGrad.addColorStop(0.72, '#27303b');
      skyGrad.addColorStop(0.90, '#4a443f');
      skyGrad.addColorStop(1.0, '#5e5348');
      sCtx.fillStyle = skyGrad;
      sCtx.fillRect(0, 0, 1024, 512);

      const sunGlow = sCtx.createRadialGradient(220, 410, 10, 220, 410, 380);
      sunGlow.addColorStop(0, 'rgba(255, 214, 160, 0.34)');
      sunGlow.addColorStop(0.5, 'rgba(240, 170, 110, 0.12)');
      sunGlow.addColorStop(1, 'rgba(255, 205, 140, 0)');
      sCtx.fillStyle = sunGlow;
      sCtx.fillRect(0, 0, 1024, 512);

      const skyTexture = new THREE.CanvasTexture(skyCanvas);
      scene.background = skyTexture;
      scene.fog = new THREE.FogExp2(0x1b2027, 0.0042);

      const camera = new THREE.PerspectiveCamera(
        36,
        W0 / H0,
        0.5,
        400
      );

      // ============================================================================
      // 3. HIGH-REALISM PBR TEXTURES (NATURAL CONCRETE, ARCHITECTURAL GLASS, REBAR)
      // ============================================================================
      //Deterministic 2D value noise helper for realistic organic concrete & glass maps
      function hash2D(x, y) {
        const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
        return h - Math.floor(h);
      }

      function smoothNoise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uy = fy * fy * (3.0 - 2.0 * fy);
        const a = hash2D(ix, iy);
        const b = hash2D(ix + 1, iy);
        const c = hash2D(ix, iy + 1);
        const d = hash2D(ix + 1, iy + 1);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
      }

      function fbm(x, y) {
        let v = 0.0;
        let amp = 0.5;
        let freq = 1.0;
        for (let i = 0; i < 4; i++) {
          v += amp * smoothNoise(x * freq, y * freq);
          freq *= 2.02;
          amp *= 0.5;
        }
        return v;
      }

      // 3A. High-Detail Environment CubeMap with Clouds, Golden Horizon & City Silhouette
      // (Crucial for realistic window glass reflections!)
      function createProceduralEnvMap() {
        const size = 512;
        const faces = [];
        for (let i = 0; i < 6; i++) {
          const c = document.createElement('canvas');
          c.width = size;
          c.height = size;
          const ctx = c.getContext('2d');
          const grad = ctx.createLinearGradient(0, 0, 0, size);
          if (i === 2) {
            grad.addColorStop(0, '#202c3a');
            grad.addColorStop(1, '#4c607a');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
          } else if (i === 3) {
            grad.addColorStop(0, '#3a342f');
            grad.addColorStop(1, '#14120f');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
          } else {
            grad.addColorStop(0, '#1d2938');
            grad.addColorStop(0.38, '#3b4e66');
            grad.addColorStop(0.58, '#6b7c8f');
            grad.addColorStop(0.66, '#c79a68');
            grad.addColorStop(0.71, '#9a6a44');
            grad.addColorStop(0.73, '#2c2a28');
            grad.addColorStop(1, '#161513');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);

            // Soft atmospheric clouds reflected in the windows
            for (let cl = 0; cl < 18; cl++) {
              const cx = ((cl * 97 + i * 53) % 460) + 25;
              const cy = 90 + ((cl * 41) % 165);
              const rx = 45 + (cl % 4) * 28;
              const ry = 12 + (cl % 3) * 8;
              const cGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
              cGrad.addColorStop(0, 'rgba(210, 220, 232, 0.26)');
              cGrad.addColorStop(0.5, 'rgba(190, 200, 214, 0.12)');
              cGrad.addColorStop(1, 'rgba(190, 200, 214, 0)');
              ctx.fillStyle = cGrad;
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              ctx.fill();
            }

            // Distant city skyline silhouette on the horizon for authentic window reflection
            ctx.fillStyle = '#1a1d21';
            for (let b = 0; b < 24; b++) {
              const bw = 14 + (b * 13) % 24;
              const bh = 8 + (b * 29) % 36;
              const bx = (b * 23) % size;
              ctx.fillRect(bx, size * 0.72 - bh, bw, bh + 6);
            }
          }

          // Bright golden-hour sun reflection disk on front/left faces
          if (i === 1 || i === 4) {
            const rad = ctx.createRadialGradient(size * 0.42, size * 0.62, 4, size * 0.42, size * 0.62, size * 0.46);
            rad.addColorStop(0, 'rgba(255, 240, 205, 0.95)');
            rad.addColorStop(0.18, 'rgba(255, 205, 135, 0.6)');
            rad.addColorStop(0.45, 'rgba(255, 165, 85, 0.22)');
            rad.addColorStop(1, 'rgba(255, 180, 95, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(0, 0, size, size);
          }
          faces.push(c);
        }
        const cubeTex = new THREE.CubeTexture(faces);
        cubeTex.needsUpdate = true;
        return cubeTex;
      }

      // 3B. Натуральный монолитный бетон: бесшовная текстура (облачность цемента, песок и щебень,
      //     раковины-поры, следы досок опалубки, подтёки, волосяные трещины)
      // бесшовный шум по таблице случайных значений (на порядок быстрее, чем хеш через sin на каждый пиксель)
      const NT = new Float32Array(65536);
      for (let k = 0; k < 65536; k++) NT[k] = hash2D(k % 256 * 1.31 + 0.5, Math.floor(k / 256) * 1.77 + 0.5);
      function tnoise(x, y, px, py) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px;
        const y0 = (((iy % py) + py) % py) * 256, y1 = ((((iy + 1) % py) + py) % py) * 256;
        const a = NT[(x0 + y0) & 65535], b = NT[(x1 + y0) & 65535];
        const c = NT[(x0 + y1) & 65535], d = NT[(x1 + y1) & 65535];
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
      }
      // бесшовный fbm: u, v в [0,1), cx, cy — число ячеек на плитку по осям
      function tfbm(u, v, cx, cy, oct) {
        let s = 0, amp = 0.5, tot = 0;
        for (let o = 0; o < oct; o++) {
          const k = 1 << o;
          s += amp * tnoise(u * cx * k, v * cy * k, cx * k, cy * k);
          tot += amp; amp *= 0.5;
        }
        return s / tot;
      }
      function createNaturalConcreteTextures() {
        const size = 512;
        const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
        const diffCanvas = mk(), bumpCanvas = mk(), roughCanvas = mk();
        const dCtx = diffCanvas.getContext('2d');
        const bCtx = bumpCanvas.getContext('2d');
        const rCtx = roughCanvas.getContext('2d');
        const imD = dCtx.createImageData(size, size);
        const imB = bCtx.createImageData(size, size);
        const imR = rCtx.createImageData(size, size);
        const d = imD.data, b = imB.data, r = imR.data;
        const BOARD = 32; // высота доски опалубки, px

        // плавные поля (облака, подтёки, сырость) считаем вдвое реже и растягиваем — так быстрее и без видимой разницы
        const HS = size / 2;
        const fLum = new Float32Array((HS + 1) * (HS + 1));
        const fRough = new Float32Array((HS + 1) * (HS + 1));
        const fMid = new Float32Array((HS + 1) * (HS + 1));
        for (let y = 0; y <= HS; y++) {
          const v = (y % HS) / HS;
          for (let x = 0; x <= HS; x++) {
            const u = (x % HS) / HS;
            const cloud = (tfbm(u, v, 3, 3, 5) - 0.5) * 46;            // цементное молоко, облака
            const mid = (tfbm(u + 0.31, v + 0.17, 12, 12, 3) - 0.5) * 20;
            const streak = (tfbm(u, v, 26, 2, 3) - 0.5) * 30;          // вертикальные подтёки от дождя
            const damp = tfbm(u + 0.6, v + 0.4, 4, 4, 3);
            const dampDark = damp > 0.58 ? -Math.min(22, (damp - 0.58) * 150) : 0;
            const k = y * (HS + 1) + x;
            fLum[k] = cloud + mid + streak + dampDark;
            fRough[k] = -cloud * 0.7 - dampDark * 1.2;
            fMid[k] = mid;
          }
        }
        const samp = (f, x, y) => {
          const gx = x / 2, gy = y / 2, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
          const k = iy * (HS + 1) + ix;
          return (f[k] * (1 - fx) + f[k + 1] * fx) * (1 - fy) + (f[k + HS + 1] * (1 - fx) + f[k + HS + 2] * fx) * fy;
        };
        for (let y = 0; y < size; y++) {
          // каждая доска чуть светлее/темнее и с собственным «зерном» по длине
          const board = Math.floor(y / BOARD);
          const boardTone = (hash2D(board * 3.1, 5.3) - 0.5) * 5;
          const grainRow = (hash2D(y * 0.7, 1.9) - 0.5) * 2.5;
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const g1 = NT[(x + (y << 8)) & 65535];
            const g2 = NT[(y + (x << 8) + 4099) & 65535];
            const sand = (g1 - 0.5) * 16;
            const grain = g2 > 0.972 ? 22 : (g2 < 0.03 ? -24 : 0);     // щебень и тёмные зёрна
            const lum = Math.min(215, Math.max(40, 118 + samp(fLum, x, y) + sand + grain + boardTone + grainRow));
            d[i] = Math.min(255, lum * 1.0);
            d[i + 1] = Math.min(255, lum * 0.985);
            d[i + 2] = Math.min(255, lum * 0.955);
            d[i + 3] = 255;

            const bump = Math.min(255, Math.max(0, 128 + samp(fMid, x, y) * 1.6 + sand * 2.4 + grain * 1.2 + grainRow * 3.0));
            b[i] = b[i + 1] = b[i + 2] = bump; b[i + 3] = 255;

            const rough = Math.min(255, Math.max(150, 226 + samp(fRough, x, y) + (g1 - 0.5) * 18));
            r[i] = r[i + 1] = r[i + 2] = rough; r[i + 3] = 255;
          }
        }
        dCtx.putImageData(imD, 0, 0);
        bCtx.putImageData(imB, 0, 0);
        rCtx.putImageData(imR, 0, 0);

        // стыки досок: еле заметные, неровные
        for (let row = 0; row < size / BOARD; row++) {
          const y = row * BOARD;
          dCtx.strokeStyle = 'rgba(20,20,20,0.16)'; dCtx.lineWidth = 1;
          bCtx.strokeStyle = 'rgba(30,30,30,0.55)'; bCtx.lineWidth = 1.5;
          dCtx.beginPath(); bCtx.beginPath();
          for (let x = 0; x <= size; x += 16) {
            const yy = y + (hash2D(x * 0.3, row * 7.7) - 0.5) * 1.6;
            if (x) { dCtx.lineTo(x, yy); bCtx.lineTo(x, yy); } else { dCtx.moveTo(x, yy); bCtx.moveTo(x, yy); }
          }
          dCtx.stroke(); bCtx.stroke();
        }
        // раковины и поры: тёмные ямки со светлой кромкой
        for (let n = 0; n < 150; n++) {
          const px = hash2D(n * 1.7, 3.3) * size, py = hash2D(n * 2.9, 8.1) * size;
          const rad = 0.8 + hash2D(n * 5.1, 2.2) * hash2D(n * 5.1, 2.2) * 3.6;
          dCtx.fillStyle = 'rgba(14,14,14,0.55)';
          dCtx.beginPath(); dCtx.arc(px, py, rad, 0, Math.PI * 2); dCtx.fill();
          dCtx.fillStyle = 'rgba(190,190,186,0.14)';
          dCtx.beginPath(); dCtx.arc(px - rad * 0.4, py - rad * 0.5, rad * 0.55, 0, Math.PI * 2); dCtx.fill();
          bCtx.fillStyle = '#1a1a1a';
          bCtx.beginPath(); bCtx.arc(px, py, rad * 1.1, 0, Math.PI * 2); bCtx.fill();
        }
        // волосяные трещины
        for (let n = 0; n < 4; n++) {
          let cx = hash2D(n * 9.1, 1.1) * size, cy = hash2D(n * 4.3, 7.7) * size;
          let ang = hash2D(n * 2.2, 3.9) * Math.PI * 2;
          dCtx.strokeStyle = 'rgba(18,18,18,0.42)'; dCtx.lineWidth = 0.9;
          bCtx.strokeStyle = 'rgba(10,10,10,0.8)'; bCtx.lineWidth = 1.2;
          dCtx.beginPath(); bCtx.beginPath(); dCtx.moveTo(cx, cy); bCtx.moveTo(cx, cy);
          for (let k = 0; k < 26; k++) {
            ang += (hash2D(n * 31 + k, 6.6) - 0.5) * 0.9;
            cx += Math.cos(ang) * 6; cy += Math.sin(ang) * 6;
            dCtx.lineTo(cx, cy); bCtx.lineTo(cx, cy);
          }
          dCtx.stroke(); bCtx.stroke();
        }

        const diffTex = new THREE.CanvasTexture(diffCanvas);
        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        const roughTex = new THREE.CanvasTexture(roughCanvas);
        const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        for (const t of [diffTex, bumpTex, roughTex]) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = aniso;
          t.repeat.set(2, 2);
        }
        return { diffTex, bumpTex, roughTex };
      }

      // 3C. Realistic Architectural Glass Texture + Tempered Roller-Wave Bump Map + Interior Room Depth Texture
      function createArchitecturalGlassTextures() {
        const w = 256, h = 256;
        const glassCanvas = document.createElement('canvas');
        const glassBumpCanvas = document.createElement('canvas');
        const interiorCanvas = document.createElement('canvas');
        glassCanvas.width = glassBumpCanvas.width = interiorCanvas.width = w;
        glassCanvas.height = glassBumpCanvas.height = interiorCanvas.height = h;

        const gCtx = glassCanvas.getContext('2d');
        const bCtx = glassBumpCanvas.getContext('2d');
        const iCtx = interiorCanvas.getContext('2d');

        // 1) Glass Tint & Sky Reflection Gradient with edge ambient occlusion (spacer seal shadow around perimeter)
        const gGrad = gCtx.createLinearGradient(0, 0, w * 0.35, h);
        gGrad.addColorStop(0.0, '#25384b');
        gGrad.addColorStop(0.45, '#35506a');
        gGrad.addColorStop(0.78, '#587792');
        gGrad.addColorStop(1.0, '#7a7466');
        gCtx.fillStyle = gGrad;
        gCtx.fillRect(0, 0, w, h);

        // Diagonal specular sheen across the double-glazed unit
        const sheen = gCtx.createLinearGradient(0, 0, w, h * 0.8);
        sheen.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
        sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.07)');
        sheen.addColorStop(0.48, 'rgba(255, 244, 225, 0.14)');
        sheen.addColorStop(0.56, 'rgba(255, 255, 255, 0.04)');
        sheen.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        gCtx.fillStyle = sheen;
        gCtx.fillRect(0, 0, w, h);

        // Double-glazing perimeter spacer shadow (черная дистанционная рамка стеклопакета по контуру)
        gCtx.strokeStyle = 'rgba(18, 24, 30, 0.78)';
        gCtx.lineWidth = 14;
        gCtx.strokeRect(7, 7, w - 14, h - 14);
        gCtx.strokeStyle = 'rgba(180, 205, 225, 0.35)';
        gCtx.lineWidth = 2;
        gCtx.strokeRect(15, 15, w - 30, h - 30);

        // 2) Subtle optical roller-wave distortion bump map of tempered architectural glass
        const bImg = bCtx.createImageData(w, h);
        const bd = bImg.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const wave = Math.sin(y * 0.045 + fbm(x * 0.012, y * 0.012) * 3.5) * 18;
            const cushion = Math.sin((x / w) * Math.PI) * Math.sin((y / h) * Math.PI) * 24;
            const val = Math.min(255, Math.max(0, 128 + wave + cushion));
            bd[idx] = bd[idx + 1] = bd[idx + 2] = val;
            bd[idx + 3] = 255;
          }
        }
        bCtx.putImageData(bImg, 0, 0);

        // 3) Faux Interior Ceiling/Columns/Blinds Texture placed behind the glass so windows look deep & real
        const iGrad = iCtx.createLinearGradient(0, 0, 0, h);
        iGrad.addColorStop(0.0, '#383e45'); // Illuminated ceiling soffit
        iGrad.addColorStop(0.18, '#282d33');
        iGrad.addColorStop(0.22, '#1a1e22'); // Deep room shadow
        iGrad.addColorStop(0.85, '#14171a');
        iGrad.addColorStop(1.0, '#2c2a28'); // Floor reflection
        iCtx.fillStyle = iGrad;
        iCtx.fillRect(0, 0, w, h);

        // Warm recessed linear ceiling light glow inside some rooms
        const lightGrad = iCtx.createRadialGradient(w * 0.5, h * 0.12, 5, w * 0.5, h * 0.12, w * 0.45);
        lightGrad.addColorStop(0, 'rgba(255, 230, 185, 0.38)');
        lightGrad.addColorStop(0.5, 'rgba(220, 195, 155, 0.12)');
        lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        iCtx.fillStyle = lightGrad;
        iCtx.fillRect(0, 0, w, h);

        // Subtle interior vertical partition / column silhouette
        iCtx.fillStyle = 'rgba(15, 18, 22, 0.65)';
        iCtx.fillRect(w * 0.68, h * 0.15, w * 0.12, h * 0.85);

        const glassTex = new THREE.CanvasTexture(glassCanvas);
        const glassBumpTex = new THREE.CanvasTexture(glassBumpCanvas);
        const interiorTex = new THREE.CanvasTexture(interiorCanvas);
        return { glassTex, glassBumpTex, interiorTex };
      }

      // 3D. Ribbed Steel Rebar Texture (Арматура периодического профиля А500С)
      function createRibbedRebarTextures() {
        const w = 128, h = 256;
        const bumpCanvas = document.createElement('canvas');
        const diffCanvas = document.createElement('canvas');
        bumpCanvas.width = diffCanvas.width = w;
        bumpCanvas.height = diffCanvas.height = h;
        const bCtx = bumpCanvas.getContext('2d');
        const dCtx = diffCanvas.getContext('2d');

        bCtx.fillStyle = '#4a4a4a';
        bCtx.fillRect(0, 0, w, h);
        dCtx.fillStyle = '#4a443e';
        dCtx.fillRect(0, 0, w, h);

        for (let y = -32; y < h + 32; y += 12) {
          bCtx.strokeStyle = '#ffffff';
          bCtx.lineWidth = 5;
          bCtx.beginPath();
          bCtx.moveTo(0, y);
          bCtx.lineTo(w, y + 16);
          bCtx.stroke();

          dCtx.strokeStyle = '#6c6258';
          dCtx.lineWidth = 4;
          dCtx.beginPath();
          dCtx.moveTo(0, y);
          dCtx.lineTo(w, y + 16);
          dCtx.stroke();
        }

        bCtx.fillStyle = '#e8e8e8';
        bCtx.fillRect(8, 0, 7, h);
        bCtx.fillRect(w / 2 - 4, 0, 7, h);

        // окалина (сине-серая) и пятна поверхностной ржавчины, бесшовно по обеим осям
        const img = dCtx.getImageData(0, 0, w, h);
        const px = img.data;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const u = x / w, v = y / h;
            const scale = tfbm(u, v, 4, 6, 3);
            const rust = Math.min(1, Math.max(0, (tfbm(u + 0.2, v + 0.5, 3, 5, 4) - 0.52) * 4.2));
            const fleck = NT[(x + (y << 8)) & 65535] > 0.93 ? 0.35 : 0;
            const m = Math.min(1, rust * 0.6 + fleck * 0.35);
            const tone = 0.82 + (scale - 0.5) * 0.7;
            // база: тёмная окалина, ржавчина — тёплый оранжево-коричневый
            px[i] = (px[i] * tone) * (1 - m) + (132 + (scale - 0.5) * 50) * m;
            px[i + 1] = (px[i + 1] * tone) * (1 - m) + (76 + (scale - 0.5) * 30) * m;
            px[i + 2] = (px[i + 2] * tone + 4) * (1 - m) + (42 + (scale - 0.5) * 20) * m;
          }
        }
        dCtx.putImageData(img, 0, 0);

        const bumpTex = new THREE.CanvasTexture(bumpCanvas);
        const diffTex = new THREE.CanvasTexture(diffCanvas);
        bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
        diffTex.wrapS = diffTex.wrapT = THREE.RepeatWrapping;
        bumpTex.anisotropy = diffTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        bumpTex.repeat.set(1, 16);
        diffTex.repeat.set(1, 16);
        return { diffTex, bumpTex };
      }

      const envMap = createProceduralEnvMap();
      scene.environment = envMap;
      await pause();
      const concreteMaps = createNaturalConcreteTextures();
      await pause();
      const glassMaps = createArchitecturalGlassTextures();
      await pause();
      const rebarMaps = createRibbedRebarTextures();

      // Also create a larger-scale concrete texture repeat for wide floor slabs & facade pilasters
      const slabConcreteDiff = concreteMaps.diffTex.clone();
      const slabConcreteBump = concreteMaps.bumpTex.clone();
      const slabConcreteRough = concreteMaps.roughTex.clone();
      slabConcreteDiff.needsUpdate = slabConcreteBump.needsUpdate = slabConcreteRough.needsUpdate = true;
      slabConcreteDiff.repeat.set(1.5, 1.5);
      slabConcreteBump.repeat.set(1.5, 1.5);
      slabConcreteRough.repeat.set(1.5, 1.5);

      // ============================================================================
      // 4. LIGHTING (GOLDEN HOUR ARCHITECTURAL SUNLIGHT + SOFT SKY FILL)
      // ============================================================================
      const ambientLight = new THREE.AmbientLight(0xaebccc, 0.42);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0x9fb2c8, 0x2c2a28, 0.5);
      hemiLight.position.set(0, 80, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xffd4a6, 2.1);
      sunLight.position.set(-55, 26, 42);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 1536;
      sunLight.shadow.mapSize.height = 1536;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 180;
      const dCam = 48;
      sunLight.shadow.camera.left = -dCam;
      sunLight.shadow.camera.right = dCam;
      sunLight.shadow.camera.top = dCam;
      sunLight.shadow.camera.bottom = -dCam;
      sunLight.shadow.bias = -0.0004;
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0x6f93c2, 0.85);
      rimLight.position.set(50, 40, -35);
      scene.add(rimLight);

      // ============================================================================
      // 5. DYNAMIC 3D CLIPPING PLANES & PBR MATERIALS
      // ============================================================================
      const concreteClipPlane = new THREE.Plane(new THREE.Vector3(0.82, -0.38, -0.15).normalize(), 6.0);
      const glassClipPlane = new THREE.Plane(new THREE.Vector3(0.82, -0.38, -0.15).normalize(), 2.5);

      const rebarMaterial = new THREE.MeshStandardMaterial({
        map: rebarMaps.diffTex,
        bumpMap: rebarMaps.bumpTex,
        bumpScale: 0.085,
        color: 0xb09c8a,
        metalness: 0.62,
        roughness: 0.52,
        envMap: envMap,
        envMapIntensity: 1.0
      });

      const tieSteelMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a443d,
        metalness: 0.7,
        roughness: 0.42,
        envMap: envMap,
        envMapIntensity: 1.0
      });

      // Natural Board-Formed Poured Concrete Material
      const concreteMaterial = new THREE.MeshStandardMaterial({
        map: concreteMaps.diffTex,
        bumpMap: concreteMaps.bumpTex,
        bumpScale: 0.042,
        roughnessMap: concreteMaps.roughTex,
        color: 0x7c8084,
        metalness: 0.03,
        roughness: 0.92,
        envMap: envMap,
        envMapIntensity: 0.42,
        clippingPlanes: [concreteClipPlane],
        clipShadows: true
      });

      // Architectural Precast Facade Concrete Cladding (Светлый архитектурный бетон фасада)
      const facadeConcreteMaterial = new THREE.MeshStandardMaterial({
        map: slabConcreteDiff,
        bumpMap: slabConcreteBump,
        bumpScale: 0.032,
        roughnessMap: slabConcreteRough,
        color: 0x8d9094,
        metalness: 0.04,
        roughness: 0.86,
        envMap: envMap,
        envMapIntensity: 0.55,
        clippingPlanes: [concreteClipPlane],
        clipShadows: true
      });

      const darkConcreteMaterial = new THREE.MeshStandardMaterial({
        map: concreteMaps.diffTex,
        bumpMap: concreteMaps.bumpTex,
        bumpScale: 0.048,
        roughnessMap: concreteMaps.roughTex,
        color: 0x5d6064,
        metalness: 0.05,
        roughness: 0.92,
        envMap: envMap,
        envMapIntensity: 0.3,
        clippingPlanes: [concreteClipPlane],
        clipShadows: true
      });

      // Перегородки и стены жёсткости в собранном каркасе: тёмный антрацит (почти графит)
      const anthraciteMaterial = new THREE.MeshStandardMaterial({
        map: concreteMaps.diffTex,
        bumpMap: concreteMaps.bumpTex,
        bumpScale: 0.05,
        roughnessMap: concreteMaps.roughTex,
        color: 0x34373c,
        metalness: 0.08,
        roughness: 0.82,
        envMap: envMap,
        envMapIntensity: 0.34,
        clippingPlanes: [concreteClipPlane],
        clipShadows: true
      });

      // Realistic Double-Glazed Architectural Window Glass (Панорамный стеклопакет с отражениями и микро-волной закалки)
      const visionGlassMaterial = new THREE.MeshPhysicalMaterial({
        map: glassMaps.glassTex,
        bumpMap: glassMaps.glassBumpTex,
        bumpScale: 0.008,
        color: 0x9db3c6,
        metalness: 0.18,
        roughness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        reflectivity: 1.0,
        transparent: true,
        opacity: 0.86,
        envMap: envMap,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        clippingPlanes: [glassClipPlane],
        clipShadows: true
      });

      // Dark Spandrel Glass Band at Slab Edge (Межэтажный стемалит / тонированный пояс окна)
      const spandrelGlassMaterial = new THREE.MeshPhysicalMaterial({
        bumpMap: glassMaps.glassBumpTex,
        bumpScale: 0.005,
        color: 0x161e27,
        metalness: 0.35,
        roughness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        reflectivity: 0.95,
        envMap: envMap,
        envMapIntensity: 2.1,
        clippingPlanes: [glassClipPlane],
        clipShadows: true
      });

      // Interior Room Depth Plane Behind Each Window (Глубина интерьера за стеклом)
      const interiorRoomMaterial = new THREE.MeshStandardMaterial({
        map: glassMaps.interiorTex,
        roughness: 0.9,
        metalness: 0.05,
        clippingPlanes: [glassClipPlane]
      });

      // Anodized Dark Graphite Aluminum Mullions & Window Frames (Алюминиевый профиль стоек и ригелей)
      const mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0x22262b,
        metalness: 0.86,
        roughness: 0.24,
        envMap: envMap,
        envMapIntensity: 1.6,
        clippingPlanes: [glassClipPlane],
        clipShadows: true
      });

      // Brushed Warm Bronze/Silver Sub-Frame Trim (Внутренний штапик / прижимная планка стеклопакета)
      const sashTrimMaterial = new THREE.MeshStandardMaterial({
        color: 0x565c63,
        metalness: 0.88,
        roughness: 0.28,
        envMap: envMap,
        envMapIntensity: 1.5,
        clippingPlanes: [glassClipPlane]
      });

      // Balcony Glass Railing Material (Стеклянный триплекс ограждений балконов)
      const balconyGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x6c869e,
        metalness: 0.1,
        roughness: 0.05,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.65,
        envMap: envMap,
        envMapIntensity: 2.0,
        side: THREE.DoubleSide,
        clippingPlanes: [concreteClipPlane]
      });

      const safetyNetMaterial = new THREE.MeshBasicMaterial({
        color: 0x3b4d5e,
        wireframe: true,
        transparent: true,
        opacity: 0.32
      });

      // ============================================================================
      // 6. HIGH-PRECISION 3D HIGH-RISE STRUCTURE (REBAR + CONCRETE + DETAILED WINDOWS)
      // ============================================================================
      await pause();
      const buildingGroup = new THREE.Group();
      buildingGroup.position.set(7.5, -18.5, -2.0);
      buildingGroup.rotation.y = -0.58;
      scene.add(buildingGroup);

      const NX = 7;
      const NZ = 3;
      const NY = 11;
      const BAY_X = 4.6;
      const BAY_Z = 4.4;
      const FLOOR_H = 3.5;

      function getMaxFloorAtColumn(ix) {
        const profile = [2, 3, 5, 7, 9, 11, 11];
        return profile[Math.min(ix, profile.length - 1)];
      }

      const vertBarTransforms = [];
      const stirrupTransforms = [];
      const wireNodeTransforms = [];
      const slabBarXTransforms = [];
      const slabBarZTransforms = [];
      const dummy = new THREE.Object3D();

      // 6A. BUILD DENSE TIED REBAR COLUMNS
      for (let ix = 0; ix < NX; ix++) {
        const maxFloor = getMaxFloorAtColumn(ix);
        for (let iz = 0; iz < NZ; iz++) {
          const cx = (ix - 3.0) * BAY_X;
          const cz = (iz - 1.0) * BAY_Z;

          for (let iy = 0; iy < maxFloor; iy++) {
            const yBase = iy * FLOOR_H;
            const isTopOfCol = (iy === maxFloor - 1);
            const barLen = isTopOfCol ? FLOOR_H * 1.52 : FLOOR_H * 1.05;

            const colHalfW = 0.42;
            const gridSteps = [-colHalfW, -colHalfW * 0.5, 0, colHalfW * 0.5, colHalfW];
            for (let oxIdx = 0; oxIdx < gridSteps.length; oxIdx++) {
              for (let ozIdx = 0; ozIdx < gridSteps.length; ozIdx++) {
                if (oxIdx > 0 && oxIdx < gridSteps.length - 1 && ozIdx > 0 && ozIdx < gridSteps.length - 1) continue;
                const bx = cx + gridSteps[oxIdx];
                const bz = cz + gridSteps[ozIdx];
                const topExtra = isTopOfCol ? ((oxIdx * 5 + ozIdx * 3) % 6) * 0.11 : 0;

                dummy.position.set(bx, yBase + (barLen + topExtra) * 0.5, bz);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, barLen + topExtra, 1);
                dummy.updateMatrix();
                vertBarTransforms.push(dummy.matrix.clone());
              }
            }

            const stirrupCount = isTopOfCol ? 13 : 10;
            for (let s = 0; s < stirrupCount; s++) {
              const sy = yBase + 0.15 + s * (FLOOR_H / 9.2);
              dummy.position.set(cx, sy, cz);
              dummy.rotation.set(Math.PI * 0.5, 0, 0);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              stirrupTransforms.push(dummy.matrix.clone());

              if (s % 2 === 0) {
                const corners = [
                  [-colHalfW, -colHalfW],
                  [colHalfW, -colHalfW],
                  [colHalfW, colHalfW],
                  [-colHalfW, colHalfW]
                ];
                for (let c = 0; c < corners.length; c++) {
                  dummy.position.set(cx + corners[c][0], sy, cz + corners[c][1]);
                  dummy.rotation.set(c * 0.6, c * 1.2, 0.35);
                  dummy.scale.set(1, 1, 1);
                  dummy.updateMatrix();
                  wireNodeTransforms.push(dummy.matrix.clone());
                }
              }
            }
          }
        }
      }

      // 6B. BUILD MULTI-LAYER TIED REBAR FLOOR SLABS
      for (let ix = 0; ix < NX - 1; ix++) {
        const bayMaxFloor = Math.min(getMaxFloorAtColumn(ix), getMaxFloorAtColumn(ix + 1));
        for (let iz = 0; iz < NZ - 1; iz++) {
          const leftCantilever = (ix === 0) ? 1.8 : 0.65;
          const rightCantilever = 0.65;
          const xStart = (ix - 3.0) * BAY_X - leftCantilever;
          const xEnd = (ix + 1 - 3.0) * BAY_X + rightCantilever;
          const zStart = (iz - 1.0) * BAY_Z - 0.65;
          const zEnd = (iz + 1 - 1.0) * BAY_Z + 0.75;
          const spanX = xEnd - xStart;
          const spanZ = zEnd - zStart;
          const centerX = (xStart + xEnd) * 0.5;
          const centerZ = (zStart + zEnd) * 0.5;

          for (let iy = 0; iy < bayMaxFloor; iy++) {
            const slabY = (iy + 1) * FLOOR_H;
            const layers = [-0.14, 0.0, 0.14];
            for (let l = 0; l < layers.length; l++) {
              const ly = slabY + layers[l];

              const numZBars = (l === 1) ? 6 : 14;
              for (let bzIdx = 0; bzIdx <= numZBars; bzIdx++) {
                const zPos = zStart + (bzIdx / numZBars) * spanZ;
                dummy.position.set(centerX, ly, zPos);
                dummy.rotation.set(0, 0, Math.PI * 0.5);
                dummy.scale.set(1, spanX, 1);
                dummy.updateMatrix();
                slabBarXTransforms.push(dummy.matrix.clone());
              }

              const numXBars = (l === 1) ? 6 : 14;
              for (let bxIdx = 0; bxIdx <= numXBars; bxIdx++) {
                const xPos = xStart + (bxIdx / numXBars) * spanX;
                dummy.position.set(xPos, ly + 0.02, centerZ);
                dummy.rotation.set(Math.PI * 0.5, 0, 0);
                dummy.scale.set(1, spanZ, 1);
                dummy.updateMatrix();
                slabBarZTransforms.push(dummy.matrix.clone());
              }
            }
          }
        }
      }

      const vertBarGeo = new THREE.CylinderGeometry(0.038, 0.038, 1.0, 7);
      const vertBarInst = new THREE.InstancedMesh(vertBarGeo, rebarMaterial, vertBarTransforms.length);
      vertBarInst.castShadow = true;
      vertBarInst.receiveShadow = true;
      for (let i = 0; i < vertBarTransforms.length; i++) {
        vertBarInst.setMatrixAt(i, vertBarTransforms[i]);
      }
      buildingGroup.add(vertBarInst);

      const stirrupGeo = new THREE.TorusGeometry(0.58, 0.02, 6, 4);
      stirrupGeo.rotateZ(Math.PI * 0.25);
      const stirrupInst = new THREE.InstancedMesh(stirrupGeo, tieSteelMaterial, stirrupTransforms.length);
      for (let i = 0; i < stirrupTransforms.length; i++) {
        stirrupInst.setMatrixAt(i, stirrupTransforms[i]);
      }
      buildingGroup.add(stirrupInst);

      const wireNodeGeo = new THREE.OctahedronGeometry(0.052, 0);
      const wireNodeInst = new THREE.InstancedMesh(wireNodeGeo, tieSteelMaterial, wireNodeTransforms.length);
      for (let i = 0; i < wireNodeTransforms.length; i++) {
        wireNodeInst.setMatrixAt(i, wireNodeTransforms[i]);
      }
      buildingGroup.add(wireNodeInst);

      const slabBarGeo = new THREE.CylinderGeometry(0.026, 0.026, 1.0, 6);
      const slabBarXInst = new THREE.InstancedMesh(slabBarGeo, rebarMaterial, slabBarXTransforms.length);
      slabBarXInst.castShadow = true;
      slabBarXInst.receiveShadow = true;
      for (let i = 0; i < slabBarXTransforms.length; i++) {
        slabBarXInst.setMatrixAt(i, slabBarXTransforms[i]);
      }
      buildingGroup.add(slabBarXInst);

      const slabBarZInst = new THREE.InstancedMesh(slabBarGeo, rebarMaterial, slabBarZTransforms.length);
      slabBarZInst.castShadow = true;
      slabBarZInst.receiveShadow = true;
      for (let i = 0; i < slabBarZTransforms.length; i++) {
        slabBarZInst.setMatrixAt(i, slabBarZTransforms[i]);
      }
      buildingGroup.add(slabBarZInst);

      // ============================================================================
      // 7. NATURAL CONCRETE MONOLITH & ARTICULATED 3D GLASS CURTAIN WALL WINDOWS
      // ============================================================================
      const animatedConcreteParts = [];
      const animatedGlassParts = [];

      const colShellGeo = new THREE.BoxGeometry(0.96, FLOOR_H - 0.36, 0.96);
      const facadePilasterGeo = new THREE.BoxGeometry(0.68, FLOOR_H, 0.58);
      const shearWallGeo = new THREE.BoxGeometry(0.55, FLOOR_H, BAY_Z * 1.95);
      const finGeo = new THREE.BoxGeometry(0.28, FLOOR_H * 1.9, 0.65);

      for (let ix = 0; ix < NX; ix++) {
        const maxFloor = getMaxFloorAtColumn(ix);
        for (let iz = 0; iz < NZ; iz++) {
          const cx = (ix - 3.0) * BAY_X;
          const cz = (iz - 1.0) * BAY_Z;

          for (let iy = 0; iy < maxFloor; iy++) {
            const cy = iy * FLOOR_H + FLOOR_H * 0.5;
            const normX = ix / (NX - 1);
            const normY = iy / (NY - 1);
            const peelOrder = (1.0 - normX) * 0.78 + normY * 0.18;

            const isFacadeCol = (iz === NZ - 1 && ix >= 3);
            const colMesh = new THREE.Mesh(
              isFacadeCol ? facadePilasterGeo : colShellGeo,
              isFacadeCol ? facadeConcreteMaterial : concreteMaterial
            );
            colMesh.castShadow = true;
            colMesh.receiveShadow = true;
            const basePos = new THREE.Vector3(cx, cy, isFacadeCol ? cz + 0.32 : cz);
            colMesh.position.copy(basePos);
            buildingGroup.add(colMesh);

            animatedConcreteParts.push({
              mesh: colMesh,
              basePos: basePos,
              slideDir: new THREE.Vector3(1.0, 0.15, 0.0).normalize(),
              peelOrder: peelOrder,
              type: 'column'
            });

            // Central vertical poured concrete shear wall (монолитное ядро жесткости)
            if (ix === 3 && iz === 1 && iy < 7) {
              const wallMesh = new THREE.Mesh(shearWallGeo, anthraciteMaterial);
              wallMesh.castShadow = true;
              wallMesh.receiveShadow = true;
              const wPos = new THREE.Vector3(cx - BAY_X * 0.18, cy, 0);
              wallMesh.position.copy(wPos);
              buildingGroup.add(wallMesh);

              animatedConcreteParts.push({
                mesh: wallMesh,
                basePos: wPos,
                slideDir: new THREE.Vector3(1.0, 0.1, 0.0),
                peelOrder: peelOrder + 0.06,
                type: 'wall'
              });

              if (iy === 1) {
                for (let f = 0; f < 4; f++) {
                  const finMesh = new THREE.Mesh(finGeo, anthraciteMaterial);
                  finMesh.castShadow = true;
                  finMesh.receiveShadow = true;
                  const fPos = new THREE.Vector3(cx - BAY_X * 0.26, cy, -1.8 + f * 1.1);
                  finMesh.position.copy(fPos);
                  buildingGroup.add(finMesh);

                  animatedConcreteParts.push({
                    mesh: finMesh,
                    basePos: fPos,
                    slideDir: new THREE.Vector3(1.0, 0.0, 0.0),
                    peelOrder: peelOrder + 0.04,
                    type: 'wall'
                  });
                }
              }
            }
          }
        }
      }

      // Stepped Cantilevered Concrete Floor Slabs + Balcony Glass/Metal Guardrails
      const railingPostGeo = new THREE.BoxGeometry(0.05, 1.05, 0.05);
      const handrailGeo = new THREE.BoxGeometry(BAY_X + 0.6, 0.06, 0.07);
      const balconyGlassPaneGeo = new THREE.BoxGeometry(BAY_X + 0.5, 0.96, 0.03);

      for (let ix = 0; ix < NX - 1; ix++) {
        const bayMaxFloor = Math.min(getMaxFloorAtColumn(ix), getMaxFloorAtColumn(ix + 1));
        for (let iz = 0; iz < NZ - 1; iz++) {
          const sx = (ix - 2.5) * BAY_X;
          const sz = (iz - 0.5) * BAY_Z;

          for (let iy = 0; iy < bayMaxFloor; iy++) {
            const sy = (iy + 1) * FLOOR_H;
            const normX = ix / (NX - 2);
            const normY = iy / (NY - 1);
            const peelOrder = (1.0 - normX) * 0.76 + normY * 0.20;

            const slabW = BAY_X + ((ix >= 3) ? 1.48 : 0.82);
            const slabD = BAY_Z + ((iz === 1) ? 1.38 : 0.72);
            const slabGroup = new THREE.Group();

            // Main structural concrete slab
            const slabGeo = new THREE.BoxGeometry(slabW, 0.40, slabD);
            const slabMesh = new THREE.Mesh(
              slabGeo,
              (iy < 2 && ix < 3) ? darkConcreteMaterial : (ix >= 4 ? facadeConcreteMaterial : concreteMaterial)
            );
            slabMesh.castShadow = true;
            slabMesh.receiveShadow = true;
            slabGroup.add(slabMesh);

            // Add architectural slab edge drip-reveal molding & terrace railing on stepped front/left overhangs (like in the illustration!)
            if (iz === 1 && ix === 3 && iy >= 2 && iy <= 6) {
              const railZ = slabD * 0.5 - 0.08;
              const bGlass = new THREE.Mesh(balconyGlassPaneGeo, balconyGlassMaterial);
              bGlass.position.set(0, 0.68, railZ);
              slabGroup.add(bGlass);

              const topRail = new THREE.Mesh(handrailGeo, mullionMaterial);
              topRail.position.set(0, 1.18, railZ);
              slabGroup.add(topRail);

              for (let p = -1; p <= 1; p++) {
                const post = new THREE.Mesh(railingPostGeo, mullionMaterial);
                post.position.set(p * (BAY_X * 0.45), 0.68, railZ);
                slabGroup.add(post);
              }
            }

            const basePos = new THREE.Vector3(sx, sy, sz);
            slabGroup.position.copy(basePos);
            buildingGroup.add(slabGroup);

            animatedConcreteParts.push({
              mesh: slabGroup,
              basePos: basePos,
              slideDir: new THREE.Vector3(1.0, 0.08, 0.2).normalize(),
              peelOrder: peelOrder,
              type: 'slab'
            });
          }
        }
      }

      // ============================================================================
      // 7B. DETAILED MULTI-ELEMENT GLASS CURTAIN WALL WINDOWS (Прорисованные окна)
      // ============================================================================
      // Helper that builds an authentic architectural Curtain-Wall Window Assembly:
      // - Deep dark anodized outer vertical mullions (стойки) & horizontal transoms (ригели)
      // - Dark reflective spandrel glass panel at the slab zone (межэтажный пояс стемалита)
      // - Recessed inner metallic sash trim (прижимная планка и створка)
      // - Main double-glazed vision window with sky/cloud reflection & subtle roller-wave normal map
      // - Interior room depth plane behind the glass so windows look genuinely 3D and transparent
      function createDetailedWindowUnit(unitWidth, unitHeight, isSideReturn) {
        const group = new THREE.Group();

        const spandrelH = 0.52; // Dark spandrel band at bottom of floor
        const transomH = 0.68;  // Upper transom / vent zone
        const mainVisionH = unitHeight - spandrelH - transomH;

        // 1. Interior room backing plane recessed 0.28m behind glass
        const backGeo = new THREE.PlaneGeometry(unitWidth - 0.12, unitHeight - 0.12);
        const backMesh = new THREE.Mesh(backGeo, interiorRoomMaterial);
        backMesh.position.z = -0.26;
        group.add(backMesh);

        // 2. Main Vision Glass Pane (Основное панорамное стекло с отражением неба и облаков)
        const visionGeo = new THREE.BoxGeometry(unitWidth - 0.10, mainVisionH - 0.06, 0.045);
        const visionMesh = new THREE.Mesh(visionGeo, visionGlassMaterial);
        visionMesh.position.set(0, (spandrelH - transomH) * 0.5, 0.0);
        group.add(visionMesh);

        // 3. Upper Transom Glass Pane (Верхняя фрамуга окна, под легким микро-углом для живого блика!)
        const upperGlassGeo = new THREE.BoxGeometry(unitWidth - 0.10, transomH - 0.06, 0.045);
        const upperGlassMesh = new THREE.Mesh(upperGlassGeo, visionGlassMaterial);
        upperGlassMesh.position.set(0, unitHeight * 0.5 - transomH * 0.5, 0.01);
        // 1.2 degree micro-tilt in glazing reflection (как у настоящих стеклопакетов на небоскребах!)
        upperGlassMesh.rotation.x = 0.018;
        group.add(upperGlassMesh);

        // 4. Lower Spandrel Glass Band (Темный межэтажный стемалит)
        const spandrelGeo = new THREE.BoxGeometry(unitWidth - 0.08, spandrelH, 0.05);
        const spandrelMesh = new THREE.Mesh(spandrelGeo, spandrelGlassMaterial);
        spandrelMesh.position.set(0, -unitHeight * 0.5 + spandrelH * 0.5, -0.01);
        group.add(spandrelMesh);

        // 5. Deep Vertical Aluminum Mullions (Левая, правая и центральная стойки витража)
        const vMullionGeo = new THREE.BoxGeometry(0.085, unitHeight + 0.04, 0.18);
        const leftM = new THREE.Mesh(vMullionGeo, mullionMaterial);
        leftM.position.set(-unitWidth * 0.5 + 0.04, 0, 0.04);
        group.add(leftM);

        const rightM = new THREE.Mesh(vMullionGeo, mullionMaterial);
        rightM.position.set(unitWidth * 0.5 - 0.04, 0, 0.04);
        group.add(rightM);

        // Intermediate slim vertical glazing bar (импост) dividing the module into 2 tall panes
        const centerBarGeo = new THREE.BoxGeometry(0.048, unitHeight - spandrelH, 0.13);
        const centerBar = new THREE.Mesh(centerBarGeo, sashTrimMaterial);
        centerBar.position.set(0, spandrelH * 0.5, 0.03);
        group.add(centerBar);

        // 6. Horizontal Aluminum Transoms (Горизонтальные ригели: верхний, фрамужный, подоконный и нижний)
        const hTransomGeo = new THREE.BoxGeometry(unitWidth, 0.075, 0.16);
        const yPositions = [
          unitHeight * 0.5 - 0.035,
          unitHeight * 0.5 - transomH,
          -unitHeight * 0.5 + spandrelH,
          -unitHeight * 0.5 + 0.035
        ];
        for (let i = 0; i < yPositions.length; i++) {
          const tMesh = new THREE.Mesh(hTransomGeo, i === 1 ? sashTrimMaterial : mullionMaterial);
          tMesh.position.set(0, yPositions[i], 0.04);
          group.add(tMesh);
        }

        if (isSideReturn) {
          group.rotation.y = Math.PI * 0.5;
        }
        return group;
      }

      // Populate Front Curtain-Wall Facade Modules (3 window subdivisions per structural bay for realistic proportions)
      const SUB_X = 2;
      const unitW = (BAY_X - 0.35) / SUB_X;
      const unitH = FLOOR_H - 0.34;

      for (let ix = 2; ix < NX - 1; ix++) {
        const bayMaxFloor = Math.min(getMaxFloorAtColumn(ix), getMaxFloorAtColumn(ix + 1));
        for (let iy = 0; iy < bayMaxFloor; iy++) {
          const isGlassZone = (ix >= 4) || (ix >= 3 && iy >= 5) || (ix === 3 && iy < 2);
          if (!isGlassZone) continue;

          for (let sub = 0; sub < SUB_X; sub++) {
            const gx = (ix - 3.0) * BAY_X + 0.18 + (sub + 0.5) * unitW;
            const gy = iy * FLOOR_H + FLOOR_H * 0.5;
            const gz = (NZ - 1 - 1.0) * BAY_Z + 0.52;

            const normX = (ix + sub / SUB_X) / (NX - 1);
            const normY = iy / (NY - 1);
            const peelOrder = (1.0 - normX) * 0.75 + normY * 0.20 + 0.14;

            const winUnit = createDetailedWindowUnit(unitW, unitH, false);
            const basePos = new THREE.Vector3(gx, gy, gz);
            winUnit.position.copy(basePos);
            buildingGroup.add(winUnit);

            animatedGlassParts.push({
              mesh: winUnit,
              basePos: basePos,
              slideDir: new THREE.Vector3(0.35, 0.12, 1.0).normalize(),
              peelOrder: peelOrder
            });
          }
        }
      }

      // Populate Right-Side Return Glass Curtain Wall
      const sideUnitW = (BAY_Z - 0.25) / 2;
      for (let iz = 0; iz < NZ - 1; iz++) {
        for (let iy = 0; iy < NY; iy++) {
          for (let sub = 0; sub < 2; sub++) {
            const gx = (NX - 1 - 3.0) * BAY_X + 0.52;
            const gy = iy * FLOOR_H + FLOOR_H * 0.5;
            const gz = (iz - 1.0) * BAY_Z + 0.12 + (sub + 0.5) * sideUnitW;

            const normY = iy / (NY - 1);
            const peelOrder = 0.12 + normY * 0.22 + (1 - iz) * 0.06;

            const sideWinUnit = createDetailedWindowUnit(sideUnitW, unitH, true);
            const basePos = new THREE.Vector3(gx, gy, gz);
            sideWinUnit.position.copy(basePos);
            buildingGroup.add(sideWinUnit);

            animatedGlassParts.push({
              mesh: sideWinUnit,
              basePos: basePos,
              slideDir: new THREE.Vector3(1.0, 0.1, 0.25).normalize(),
              peelOrder: peelOrder
            });
          }
        }
      }

      // Safety net fences on exposed lower rebar slabs
      const fenceGeo = new THREE.PlaneGeometry(BAY_X * 0.9, 1.1, 10, 3);
      for (let ix = 0; ix < 3; ix++) {
        const topF = getMaxFloorAtColumn(ix);
        const fx = (ix - 2.5) * BAY_X;
        const fy = topF * FLOOR_H + 0.55;
        const fz = (NZ - 1 - 1.0) * BAY_Z + 0.4;
        const fenceMesh = new THREE.Mesh(fenceGeo, safetyNetMaterial);
        fenceMesh.position.set(fx, fy, fz);
        buildingGroup.add(fenceMesh);
      }

      // ============================================================================
      // 8. BACKGROUND LATTICE TOWER CRANE
      // ============================================================================
      const craneGroup = new THREE.Group();
      craneGroup.position.set(-2.8, -18.5, -12.5);
      scene.add(craneGroup);

      const craneWireMat = new THREE.MeshStandardMaterial({
        color: 0x9b7938,
        metalness: 0.7,
        roughness: 0.4,
        wireframe: true
      });

      const mastH = 32;
      const mastCage = new THREE.Mesh(new THREE.BoxGeometry(1.15, mastH, 1.15, 1, 16, 1), craneWireMat);
      mastCage.position.y = mastH * 0.5;
      craneGroup.add(mastCage);

      const craneJibGroup = new THREE.Group();
      craneJibGroup.position.y = mastH;
      craneGroup.add(craneJibGroup);

      const jibMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 0.75, 0.85, 14, 1, 1), craneWireMat);
      jibMesh.position.x = 5;
      craneJibGroup.add(jibMesh);

      const particleCount = 120;
      const particleGeo = new THREE.BufferGeometry();
      const pPositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        pPositions[i * 3] = (Math.random() - 0.35) * 48;
        pPositions[i * 3 + 1] = (Math.random() - 0.4) * 36;
        pPositions[i * 3 + 2] = (Math.random() - 0.5) * 28;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      const particles = new THREE.Points(
        particleGeo,
        new THREE.PointsMaterial({ color: 0xffe6ba, size: 0.13, transparent: true, opacity: 0.48 })
      );
      scene.add(particles);

      // ============================================================================
      // 9. INTERACTION & UI LISTENERS
      // ============================================================================
      const raycaster = new THREE.Raycaster();
      const pointerNDC = new THREE.Vector2();
      const intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.0);
      const planeHitPoint = new THREE.Vector3();

      
      // ---- управление: мышь (на телефоне — плавный «автопроход» и касание), без перехвата прокрутки страницы ----
      const hero = host.closest('.hero') || host;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let lastMove = -1e9;
      const LENS_R = 11.5, LENS_K = 1.45; // «рентген»: радиус вокруг курсора и сила — окна и стены рядом с мышью отлетают в стороны, открывая каркас
      // прокрутка страницы разбирает здание: монолит -> стеклянный фасад уезжает -> голый арматурный каркас (саму прокрутку не трогаем)
      let scrollQ = 0;
      function onScroll() {
        const r = host.getBoundingClientRect(), vh = window.innerHeight || 1;
        scrollQ = Math.min(1, Math.max(0, window.scrollY / (shiftK > 0.5 ? r.height * 0.7 : 320))); // 0 при открытии страницы
      }
      // кадр: k — отдаление камеры (здание почти целиком в экране), dx/dy — сдвиг (место под текст слева), p — стадия «разрезa» (0 — монолит, 1 — один каркас)
      const FRAME = { k: 1.12, dx: -11, dy: -3.5, p: 0.1, ky: 0.55 }; // ky — высота камеры: меньше — вертикали здания меньше «заваливаются»
      const FRAME_M = { k: 1.85, dx: -2, dy: -1.8, ky: 0.55 }; // телефон: здание целиком, по центру
      let shiftK = 1; // на узком экране (телефон) здание по центру, без сдвига под текст

      function aim(nx, ny) {
        state.mouseX = nx;
        state.mouseY = ny;
        pointerNDC.set(nx, ny);
        raycaster.setFromCamera(pointerNDC, camera);
        if (raycaster.ray.intersectPlane(intersectPlane, planeHitPoint)) {
          buildingGroup.worldToLocal(planeHitPoint);
          state.rayWorldPos.copy(planeHitPoint);
        }
      }
      function onPointer(e) {
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        lastMove = performance.now();
        inside = true;
        aim(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
            Math.max(-1, Math.min(1, -((e.clientY - r.top) / r.height) * 2 + 1)));
      }
      // С мышью: пока курсор не в hero — здание спокойно стоит ровно, ничего не отлетает.
      // Без мыши (телефон, касание): «рентген» медленно сам ходит по зданию.
      const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
      let inside = false; // курсор над первым экраном
      function idleAim(t) {
        if (canHover ? inside : performance.now() - lastMove < 2600) return;
        if (canHover) {
          state.mouseX = 0; state.mouseY = 0;
          state.rayWorldPos.set(999, 999, 999); // линза далеко за зданием
          return;
        }
        aim(0.55 * Math.sin(t * 0.32) + 0.1, 0.32 * Math.sin(t * 0.23 + 1.0));
      }

      function fit() {
        const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
        const a = w / h;
        // высота кадра постоянна (здание целиком), на очень узком экране — шире по вертикали
        camera.fov = a >= 1 ? 36 : Math.min(64, 2 * Math.atan(Math.tan(18 * Math.PI / 180) / a) * 180 / Math.PI);
        shiftK = Math.max(0, Math.min(1, (a - 1.0) / 0.7));
        camera.aspect = a;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        if (!running) renderer.render(scene, camera);
      }

      // ---- цикл: только пока первый экран виден и вкладка открыта ----
      let running = false, raf = 0, inView = true;
      function tick() {
        if (!running) return;
        frame();
        raf = requestAnimationFrame(tick);
      }
      function sync() {
        const want = !reduce && inView && !document.hidden;
        if (want && !running) { running = true; raf = requestAnimationFrame(tick); }
        else if (!want && running) { running = false; cancelAnimationFrame(raf); }
      }


      // ============================================================================
      // 10. ANIMATION LOOP
      // ============================================================================
      function smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }

      function frame() {
        const elapsed = state.clock.getElapsedTime();
        idleAim(elapsed);
        state.targetProgress = FRAME.p + 0.85 * scrollQ;

        state.progress += (state.targetProgress - state.progress) * 0.085;
        state.smoothMouseX += (state.mouseX - state.smoothMouseX) * 0.075;
        state.smoothMouseY += (state.mouseY - state.smoothMouseY) * 0.075;
        state.smoothRayPos.lerp(state.rayWorldPos, 0.12);


        // положение камеры: исходное движение сцены + отдаление и сдвиг, чтобы здание почти целиком помещалось в кадр
        const scrollZoom = state.progress * 6.0;
        const F = shiftK > 0.5 ? FRAME : FRAME_M;
        const lookX = 3.2 + state.smoothMouseX * 0.9 - state.progress * 0.6 + F.dx * (shiftK > 0.5 ? shiftK : 1);
        const lookY = 1.8 + state.smoothMouseY * 0.8 + state.progress * 1.0 + F.dy;
        const camX0 = -7.8 + state.smoothMouseX * 3.2 - state.progress * 1.4;
        const camY0 = -9.5 + state.smoothMouseY * 2.2 + state.progress * 3.2;
        const camZ0 = 34.0 - scrollZoom;
        camera.position.set(
          lookX + (camX0 - 3.2) * F.k,
          lookY + (camY0 - 1.8) * F.k * F.ky,
          camZ0 * F.k
        );
        camera.lookAt(lookX, lookY, 0);

        const currentYaw = -0.58 + state.smoothMouseX * 0.11 + state.targetYawOffset + state.progress * 0.14;
        const currentPitch = -state.smoothMouseY * 0.05 + state.targetPitchOffset;
        buildingGroup.rotation.y += (currentYaw - buildingGroup.rotation.y) * 0.1;
        buildingGroup.rotation.x += (currentPitch - buildingGroup.rotation.x) * 0.1;

        sunLight.position.x = -55 + state.smoothMouseX * 14;
        sunLight.position.y = 26 + state.smoothMouseY * 10;

        if (state.sliceMode) {
          const mouseShift = state.mouseLensEnabled ? (state.smoothMouseX * 2.8 - state.smoothMouseY * 1.6) : 0;
          // в начале (прокрутка 0) здание собрано целиком: плоскость среза далеко за ним и подходит только по мере прокрутки
          const away = 24.0 * (1 - Math.min(1, Math.max(0, (state.progress - FRAME.p) / 0.25)));
          concreteClipPlane.constant = 16.5 - state.progress * 38.0 - mouseShift + away;
          glassClipPlane.constant = 11.5 - state.progress * 38.0 - mouseShift + away;
        } else {
          concreteClipPlane.constant = 999;
          glassClipPlane.constant = 999;
        }

        const globalPeel = (state.progress - FRAME.p) * 1.75 - 0.3; // в начале ничего не сдвинуто, дальше — по прокрутке
        for (let i = 0; i < animatedConcreteParts.length; i++) {
          const item = animatedConcreteParts[i];
          let mouseBoost = 0;
          if (state.mouseLensEnabled) {
            const distToMouse = item.basePos.distanceTo(state.smoothRayPos);
            mouseBoost = Math.pow(Math.max(0, 1.0 - distToMouse / LENS_R), 0.8) * LENS_K;
          }

          const localPeel = smoothstep(item.peelOrder - 0.14, item.peelOrder + 0.14, globalPeel + mouseBoost);

          if (localPeel >= 0.995) {
            item.mesh.visible = false;
          } else {
            item.mesh.visible = true;
            const shift = Math.pow(localPeel, 1.5) * (state.sliceMode ? 9.0 : 9.5);
            item.mesh.position.set(
              item.basePos.x + item.slideDir.x * shift,
              item.basePos.y + item.slideDir.y * shift,
              item.basePos.z + item.slideDir.z * shift
            );

            const endFade = smoothstep(0.65, 1.0, localPeel);
            if (item.type === 'slab') {
              item.mesh.scale.set(1.0 - endFade * 0.7, 1.0 - endFade * 0.95, 1.0 - endFade * 0.7);
            } else {
              item.mesh.scale.set(1.0 - endFade * 0.85, 1.0, 1.0 - endFade * 0.85);
            }
          }
        }

        for (let i = 0; i < animatedGlassParts.length; i++) {
          const item = animatedGlassParts[i];
          let mouseBoost = 0;
          if (state.mouseLensEnabled) {
            const distToMouse = item.basePos.distanceTo(state.smoothRayPos);
            mouseBoost = Math.pow(Math.max(0, 1.0 - distToMouse / (LENS_R + 1.5)), 0.8) * (LENS_K + 0.05);
          }

          const localPeel = smoothstep(item.peelOrder - 0.14, item.peelOrder + 0.12, globalPeel + mouseBoost);

          if (localPeel >= 0.995) {
            item.mesh.visible = false;
          } else {
            item.mesh.visible = true;
            const shift = Math.pow(localPeel, 1.4) * (state.sliceMode ? 11.0 : 11.0);
            item.mesh.position.set(
              item.basePos.x + item.slideDir.x * shift,
              item.basePos.y + item.slideDir.y * shift,
              item.basePos.z + item.slideDir.z * shift
            );
            const endFade = smoothstep(0.6, 1.0, localPeel);
            item.mesh.scale.set(1.0 - endFade * 0.8, 1.0 - endFade * 0.8, 1.0);
          }
        }

        craneJibGroup.rotation.y = Math.sin(elapsed * 0.18) * 0.22 - state.smoothMouseX * 0.08;
        particles.rotation.y = elapsed * 0.015 + state.smoothMouseX * 0.04;

        renderer.render(scene, camera);
      }

      
      state.progress = state.targetProgress = FRAME.p;
      new ResizeObserver(fit).observe(host);
      fit();
      if (reduce) {
        // «уменьшить движение»: один спокойный кадр без анимации
        aim(0.3, 0.05);
        for (let i = 0; i < 60; i++) frame();
        renderer.render(scene, camera);
      } else {
        hero.addEventListener('pointermove', onPointer, { passive: true });
        hero.addEventListener('pointerleave', () => { inside = false; lastMove = -1e9; });
        addEventListener('scroll', onScroll, { passive: true }); onScroll();
        new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0 }).observe(hero);
        document.addEventListener('visibilitychange', sync);
        sync();
      }
      canvas.classList.add('on');

}
