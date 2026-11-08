// ---- Первый экран с глубиной (как «3D-фото» в Facebook / обои на iPhone) ----
// Основной режим — WebGL: шейдер сдвигает пиксели фото по карте глубины img/hero-depth.webp
// (белое — близко: торцы труб и бирка, серое — кран, чёрное — небо). Мышь (на телефоне — наклон)
// и прокрутка меняют угол обзора, ближние слои сдвигаются сильнее дальних — получается настоящий объём.
// Запасной режим (нет WebGL, не загрузилась карта, текстура запрещена браузером) — CSS-эффект:
// фото целиком сдвигается и чуть поворачивается. Если в системе «уменьшить движение» — всё выключено.
{
  const hero = document.querySelector('.hero');
  const ph = document.getElementById('heroPh');
  const copy = document.querySelector('.hero .copy');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hero && ph && !reduce) {
    // ---- настройки силы эффекта ----
    const AMP = 0.014;       // сила 3D-сдвига, доля ширины фото (WebGL). Больше — объёмнее, но сильнее тянет края труб
    const FOCUS = 0.45;         // какая глубина остаётся на месте (0 — небо, 1 — бирка)
    const SCROLL_AMP = 0.7;     // как сильно прокрутка меняет угол обзора (в долях AMP)
    const MOVE = 22, TILT = 2.2, TEXT = 8; // запасной CSS-режим: px сдвига фото, градусы, px сдвига текста
    const IMG = ph.querySelector('img');
    const clamp = (v) => Math.max(-1, Math.min(1, v));

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    let render = null;

    // высоту первого экрана запоминаем: чтение offsetHeight на каждом кадре прокрутки заставляло браузер пересчитывать раскладку (рывки)
    let heroH = hero.offsetHeight || 1;
    const measure = () => { heroH = hero.offsetHeight || 1; };
    addEventListener('resize', measure); addEventListener('load', measure);
    // на телефоне фото лежит под текстом: сдвиг и затухание при прокрутке там дают тёмную «дыру» и резкий край — выключены
    const mobile = matchMedia('(max-width:980px)');
    const scrollInfo = () => {
      if (mobile.matches) return { s: 0, k: 0 };
      const s = Math.min(window.scrollY, heroH);
      return { s, k: s / heroH };
    };
    const textLayer = (s, k) => {
      copy.style.transform = `translate3d(${(cx * TEXT).toFixed(2)}px, ${(cy * TEXT * 0.6 - s * 0.12).toFixed(2)}px, 0)`;
      copy.style.opacity = (1 - Math.max(0, k - 0.25) * 1.3).toFixed(3);
    };

    // ---------- запасной режим: CSS ----------
    const renderCss = () => {
      const { s, k } = scrollInfo();
      ph.style.transform =
        `translate3d(${(-cx * MOVE).toFixed(2)}px, ${(-cy * MOVE * 0.6 + s * 0.35).toFixed(2)}px, 0) ` +
        `rotateY(${(cx * TILT).toFixed(3)}deg) rotateX(${(-cy * TILT * 0.7).toFixed(3)}deg) scale(${(1 + k * 0.08).toFixed(4)})`;
      textLayer(s, k);
    };

    // ---------- основной режим: WebGL ----------
    const initGl = () => {
      const canvas = document.createElement('canvas');
      canvas.className = 'gl';
      canvas.setAttribute('aria-hidden', 'true');
      const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
      if (!gl) return null;

      const VS = 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
      const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uImg, uDepth;
uniform vec2 uView;     // доля картинки, видимая в кадре (аналог object-fit: cover)
uniform vec2 uOff;      // смещение видимой области (аналог object-position)
uniform vec2 uShift;    // сдвиг для самого близкого слоя
uniform float uFocus;
uniform float uAspect;  // ширина / высота фото: переводит сдвиг по Y в те же единицы, что по X
float depthAt(vec2 p){ return texture2D(uDepth, clamp(p, 0., 1.)).r; }
void main(){
  vec2 uv = uOff + v * uView;
  // Плавное смещение по сглаженной карте глубины: ближнее смещается сильнее дальнего.
  // Три прохода (неподвижная точка) убирают «двойные» контуры, сглаженная карта не даёт полос на кромках.
  vec2 p = uv;
  p = uv + uShift * (depthAt(p) - uFocus);
  p = uv + uShift * (depthAt(p) - uFocus);
  p = uv + uShift * (depthAt(p) - uFocus);
  gl_FragColor = vec4(texture2D(uImg, clamp(p, 0., 1.)).rgb, 1.0);
}`;
      const sh = (type, src) => {
        const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const U = (n) => gl.getUniformLocation(prog, n);
      const u = { view: U('uView'), off: U('uOff'), shift: U('uShift') };
      gl.uniform1i(U('uImg'), 0); gl.uniform1i(U('uDepth'), 1);
      gl.uniform1f(U('uFocus'), FOCUS);
      gl.uniform1f(U('uAspect'), 1672 / 941);

      const tex = (unit, image) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); // при file:// браузер бросит SecurityError
      };
      return { canvas, gl, u, tex };
    };

    const loadImage = (src) => new Promise((ok, fail) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => ok(im); im.onerror = fail; im.src = src;
    });

    const startGl = async () => {
      let g;
      try { g = initGl(); } catch (e) { g = null; }
      if (!g) return;
      const { canvas, gl, u, tex } = g;
      let photo;
      try {
        const [p, d] = await Promise.all([
          IMG.complete && IMG.naturalWidth ? IMG : loadImage(IMG.src),
          loadImage('img/hero-depth.webp'),
        ]);
        photo = p; tex(0, p);
        // Карту глубины размываем: так кромки смещаются плавно, без полос и двойных контуров при сильном повороте
        let dsrc = d;
        try {
          const c = document.createElement('canvas'); c.width = d.naturalWidth; c.height = d.naturalHeight;
          const cc = c.getContext('2d'); cc.filter = 'blur(6px)'; cc.drawImage(d, 0, 0);
          if (cc.filter === 'blur(6px)') dsrc = c;   // Safari фильтр не поддерживает — берём карту как есть
        } catch (e) {}
        tex(1, dsrc);
      } catch (e) { return; }                   // остаёмся на CSS-режиме

      const IA = photo.naturalWidth / photo.naturalHeight;
      const mq = matchMedia('(max-width:980px)');
      const pos = () => (mq.matches ? [0.78, 0.45] : [0.7, 0.4]);   // как object-position в CSS-версии
      const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
      const resize = () => {
        const w = Math.max(2, Math.round(ph.clientWidth * DPR)), h = Math.max(2, Math.round(ph.clientHeight * DPR));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        const ca = w / h;
        const view = ca > IA ? [1, IA / ca] : [ca / IA, 1];
        gl.uniform2f(u.view, view[0], view[1]);
        const POS = pos();
        gl.uniform2f(u.off, (1 - view[0]) * POS[0], (1 - view[1]) * POS[1]);
      };
      resize();
      addEventListener('resize', () => { resize(); kick(); });

      const draw = () => {
        const { s, k } = scrollInfo();
        // ближний слой уходит против движения мыши; прокрутка добавляет вертикальный наклон
        const sx = -cx * AMP;
        const sy = (-cy * 0.6 + k * SCROLL_AMP) * AMP * (canvas.width / canvas.height);
        gl.uniform2f(u.shift, sx, sy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // фото в целом уходит медленнее страницы, как и раньше
        ph.style.transform = `translate3d(0, ${(s * 0.35).toFixed(2)}px, 0) scale(${(1 + k * 0.05).toFixed(4)})`;
        textLayer(s, k);
      };

      canvas.addEventListener('webglcontextlost', (e) => {   // видеокарта сбросила контекст — возвращаем CSS
        e.preventDefault(); canvas.remove(); IMG.style.visibility = ''; ph.dataset.mode = 'css'; render = renderCss; kick();
      });
      ph.appendChild(canvas);
      draw();
      canvas.classList.add('on');               // плавное появление поверх обычного фото
      setTimeout(() => { IMG.style.visibility = 'hidden'; }, 400);
      ph.dataset.mode = 'gl'; render = draw;
      kick();
    };

    // ---------- общий цикл ввода ----------
    render = renderCss;
    const tick = () => {
      raf = 0;
      cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;    // плавное догоняние, как инерция
      render();
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) kick();
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    // компьютер: мышь над первым экраном
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      kick();
    });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });

    // телефон: наклон устройства (на iPhone браузер спросит разрешение при первом касании первого экрана)
    let tilted = false;                     // пришли ли реальные данные наклона (в iPhone нужно разрешение, во встроенных окнах датчики часто закрыты)
    const onTilt = (e) => {
      if (e.gamma == null) return;
      tilted = true;
      tx = clamp(e.gamma / 18); ty = clamp((e.beta - 40) / 18); kick();
    };
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      hero.addEventListener('touchend', () => {
        DOE.requestPermission().then((st) => { if (st === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
      }, { once: true });
    } else if (DOE && matchMedia('(pointer: coarse)').matches) {
      addEventListener('deviceorientation', onTilt);
    }

    addEventListener('scroll', () => { if (window.scrollY < heroH + 50) kick(); }, { passive: true });

    // телефон без датчика наклона: фото плавно «дышит» само, чтобы объём был виден и без мыши
    if (matchMedia('(pointer: coarse)').matches) {
      let visible = true, running = false;
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) idle(); }, { threshold: 0.05 }).observe(hero);
      const idle = () => {
        if (running) return; running = true;
        const loop = (now) => {
          if (!visible || tilted) { running = false; return; }
          const t = now / 1000;
          tx = Math.sin(t * 0.7) * 0.75; ty = Math.cos(t * 0.5) * 0.35;
          kick();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      };
      idle();
    }
    kick();
    startGl();
  }
}
