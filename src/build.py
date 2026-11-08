# Сборка фото-версии (первый экран — фото с эффектом глубины) из исходного прототипа.
# Тексты, данные каталога (d-content, d-nom) и логика берутся из ../mz-prototype-src/index.html без изменений;
# меняются только стили, первый экран (3D) и вид номенклатуры (картинки с подписями).
import re, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'mz-prototype-src' / 'index.html'
s = SRC.read_text()

css = (ROOT / 'src' / 'style.css').read_text()
data = ''.join(re.findall(r'<script type="application/json" id="d-(?:content|nom)">.*?</script>', s, re.S))
script = re.search(r'</dialog>.*?<script>(.*?)</script>', s, re.S).group(1)
body = re.search(r'<body>(.*?)<script type="application/json"', s, re.S).group(1)  # svg-спрайт
body += re.search(r'</script>\s*(<div class="top">.*?)<script>\s*\(async', s, re.S).group(1)

def sub1(pat, rep, text, flags=0):
    new, n = re.subn(pat, rep, text, count=1, flags=flags)
    assert n == 1, pat
    return new

# --- разметка ---
body = sub1(r'img/logo-green\.png', 'img/logo-white.png', body)
body = sub1(r'<div class="photo"[^>]*></div>',
            '<div class="stage" id="stage" aria-hidden="true"><div class="ph" id="heroPh"><img src="img/hero-photo.webp" alt="" width="1672" height="941" fetchpriority="high" decoding="async"></div><div class="bld" id="bld"></div></div>', body)
body = sub1(r'<section class="hero">', '<section class="hero dark">', body)
# окно размеров: сверху вращающаяся 3D-модель позиции (src/metal3d.js)
body = sub1(r'(<dialog id="dsz"><div class="dlg-h">.*?</button></div>)', r'\1\n  <div class="dlg-3d" id="dsz3d" hidden></div>', body, re.S)
# раздел «Справочник весов» не нужен: убираем разметку, пункт меню, ссылки на него и скрипт
body = sub1(r'<section class="sec(?: alt)?" id="hand">.*?</section>\s*', '', body, re.S)
body = body.replace('<li><a href="#hand">Справочник весов</a></li>', '')
body = re.sub(r'\s*Весь сортамент с массой единицы — в <a href="#hand">справочнике ниже</a>\.', '', body)
script = sub1(r'/\* справочник \*/.*?renderHb\(\);\n', '', script, re.S)
# --- меню как на основном сайте: «Ателье», два телефона, бургер и мобильное меню ---
body = sub1(r'<li><a href="#order">Контакты</a></li>', '<li><a href="ru/atelier/index.html">Ателье</a></li><li><a href="#order">Контакты</a></li>', body)
PH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>'
body = sub1(r'<a class="tel" href="tel:\+37368471530">.*?</a>',
            '<div class="telbox">' + PH_ICON + '<div class="tl"><a href="tel:+37368471530">+373 68 47-15-30</a><a href="tel:+37322471530">+373 22 47-15-30</a></div></div>', body, re.S)
MNAV = ('<button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav" aria-label="Меню"><i></i><i></i><i></i></button>'
        '<nav class="mnav" id="mnav" aria-label="Мобильное меню"><a href="#catalog">Сортамент</a><a href="#calc">Калькулятор</a><a href="#service">Сервис и резка</a>'
        '<a href="#bases">Металлобазы</a><a href="ru/atelier/index.html">Ателье</a><a href="#order">Контакты</a>'
        '<div class="mtel"><a class="btn primary sm" href="tel:+37368471530">+373 68 47-15-30</a><a class="btn outline sm" href="tel:+37322471530">+373 22 47-15-30</a><a class="btn outline sm" href="viber://chat?number=%2B37368471530">Viber</a></div></nav>')
body = sub1(r'</header>', MNAV + '</header>', body)
# --- услуги по обработке металла: карточки со ссылками на страницы услуг ---
SVP = ('<h3 class="svph">Услуги по обработке металла</h3><div class="svp">'
  '<a href="ru/rezka-metalla-gilotinoj/index.html"><img src="img/svc-gilotina.webp" alt="Гильотинные ножницы режут стальной лист" loading="lazy"><span>Резка металла гильотиной</span></a>'
  '<a href="ru/rezka-metalla-pod-razmery/index.html"><img src="img/svc-razmery.webp" alt="Раскрой металла с искрами на производстве" loading="lazy"><span>Резка металла под размеры</span></a>'
  '<a href="ru/valcovka-trub/index.html"><img src="img/svc-valcovka.webp" alt="Вальцы трубогибочного станка с профильной трубой" loading="lazy"><span>Вальцовка труб</span></a>'
  '<a href="ru/gazovaya-rezka-metalloprokata/index.html"><img src="img/svc-gaz.webp" alt="Газовый резак режет металлопрокат" loading="lazy"><span>Газовая резка</span></a>'
  '<a href="ru/atelier/index.html"><img src="img/at-laser.webp" alt="Лазерная резка листового металла в Ателье" loading="lazy"><span>Ателье: изделия на заказ</span></a></div>')
body = sub1(r'(<section class="sec(?: alt)?" id="service">.*?)(</div>\s*</section>)', lambda m: m.group(1) + SVP + m.group(2), body, re.S)
for sid, theme in [('catalog', 'light'), ('calc', 'dark'), ('service', 'dark'),
                   ('about', 'light'), ('bases', 'dark'), ('order', 'light')]:
    body = sub1(r'<section class="sec(?: alt)?" id="%s">' % sid, '<section class="sec %s" id="%s">' % (theme, sid), body)
body = sub1(r'(<button class="fab" id="fab"[^>]*>.*?</button>)', r'\1\n<button class="totop" id="totop" type="button" aria-label="Наверх"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>', body, re.S)
body = sub1(r'<div class="grid" id="cards"></div>', '<div class="tiles" id="cards"></div>', body)

# --- логика: каталог картинками вместо карточек ---
script = sub1(r"\$\('#cards'\)\.innerHTML=C\.products\.map\(.*?\}\)\.join\(''\);",
"""$('#cards').innerHTML=C.products.map(p=>`<div class="tile" role="button" tabindex="0" data-id="${p.id}">
  <div class="pic"><img alt="${esc(p.title)}" src="img/products/${p.id}.webp" width="640" height="480" decoding="async"></div>
  <button class="add" type="button" data-act="order" title="Выбрать размер" aria-label="Выбрать размер: ${esc(p.title)}">+</button>
  <div class="cap"><div class="no">${p.code}</div><h3>${esc(p.title)}</h3><div class="sub">${esc(cleanSub(p))}</div><span class="more">Размеры →</span></div></div>`).join('');""",
script, re.S)
script = sub1(r"\$\('#cards'\)\.onclick=e=>\{.*?\n\};",
"""function openSizes(p){cur=p;$('#dszt').textContent=p.title;$('#dszs').value='';renderList();$('#dsz').showModal();if(window.mz3d)mz3d.open(p.id);}
const byId=id=>C.products.find(x=>x.id===id);
window.mzOpenSizes=id=>openSizes(byId(id));
window.mzOrder=id=>{add(byId(id).title);document.getElementById('order').scrollIntoView();};
$('#cards').onclick=e=>{const t=e.target.closest('.tile');if(!t)return;
  openSizes(byId(t.dataset.id));};  // и «+», и клик по картинке — список размеров
$('#cards').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('tile')){e.preventDefault();openSizes(byId(e.target.dataset.id));}};""",
script, re.S)

# --- карты: начинают грузиться заранее (при подлёте к блоку), каждая база — один раз, без пересоздания ---
script = sub1(r"let bi=0;\n", """let bi=0;
let mapsOn=false;
new IntersectionObserver(([e],o)=>{if(e.isIntersecting){mapsOn=true;o.disconnect();renderBase();}},{rootMargin:'1200px 0px'}).observe(document.getElementById('bases'));
""", script)
MAP_HEAD = r"\$\('#bd'\)\.innerHTML=`<iframe class=\"map\"[^`]*?</iframe>\n  <div class=\"info\">"
MAP_NEW = """if(!$('#bd .maps'))$('#bd').innerHTML='<div class="maps"></div><div class="infoWrap"></div>';
  const mw=$('#bd .maps');
  if(mapsOn){let f=mw.querySelector(`iframe[data-i="${bi}"]`);
    if(!f){f=document.createElement('iframe');f.className='map';f.dataset.i=bi;f.title='Карта: '+b.title;
      f.src=`https://maps.google.com/maps?q=${q}&z=15&output=embed`;f.onload=()=>f.classList.add('ready');mw.appendChild(f);}
    mw.querySelectorAll('iframe').forEach(x=>x.hidden=x!==f);}
  $('#bd .infoWrap').innerHTML=`<div class="info">"""
script = sub1(MAP_HEAD, lambda m: MAP_NEW, script)

module = r"""
const C = JSON.parse(document.getElementById('d-content').textContent);
PARALLAX

// кнопка «наверх»
const toTop = document.getElementById('totop');
const onTop = () => toTop.classList.toggle('show', window.scrollY > window.innerHeight * 0.8);
window.addEventListener('scroll', onTop, { passive: true }); onTop();
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
"""

# вариант первого экрана: ?hero=building — «разрез здания» (src/building.js); без параметра или ?hero=photo — фото с глубиной
HERO_SWITCH = "<script>if(new URLSearchParams(location.search).get('hero')==='building'){window.__hb=1;document.documentElement.classList.add('hb')}</script>\n"

head = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metalica Zuev — металлопрокат в Молдове (фото-версия)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://maps.google.com"><link rel="preconnect" href="https://maps.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="img/hero-photo.webp" fetchpriority="high">
<style>
""" + css + "\n</style><script>document.documentElement.className='g'+(new URLSearchParams(location.search).get('g')||'2')</script>\n" + HERO_SWITCH + "</head><body>\n"

BURGER = r'''
// мобильное меню
{ const bg = document.getElementById('burger'), mn = document.getElementById('mnav');
  if (bg && mn) {
    bg.onclick = () => { const o = !mn.classList.contains('open'); mn.classList.toggle('open', o); bg.setAttribute('aria-expanded', o); };
    mn.onclick = (e) => { if (e.target.closest('a')) { mn.classList.remove('open'); bg.setAttribute('aria-expanded', false); } };
  } }
'''
# вариант «разрез здания»: фото-параллакс не запускается, building.js (и three.js r128) грузятся только при ?hero=building
HERO_B = r'''
// первый экран «разрез здания»
if (window.__hb) {
  const fail = () => document.documentElement.classList.add('hb-fail');
  const host = document.getElementById('bld');
  const sc = document.createElement('script');
  sc.src = 'building.js?v=BVER';
  sc.onload = () => window.mzBuildingStart(host).catch((e) => { console.warn('building:', e); fail(); });
  sc.onerror = fail;
  document.head.appendChild(sc);
}
'''
BVER = hashlib.md5((ROOT / 'src' / 'building.js').read_bytes()).hexdigest()[:8]
module = module + BURGER + HERO_B.replace('BVER', BVER)
_par = (ROOT / 'src' / 'parallax.js').read_text()
assert _par.count('if (hero && ph && !reduce) {') == 1
_par = _par.replace('if (hero && ph && !reduce) {', 'if (hero && ph && !reduce && !window.__hb) {')  # в варианте «здание» фото-эффект не запускается
module = module.replace('PARALLAX', _par)
(ROOT / 'building.js').write_text((ROOT / 'src' / 'building.js').read_text())
metal3d = (ROOT / 'src' / 'metal3d.js').read_text()
# --- телефоны в одном формате: +373, код, группы цифр через пробел ---
# --- телефоны в одном формате: +373 код ААА ААА (+373 68 47-15-30 → +373 68 471 530) ---
def phones(txt):
    return re.sub(r'\+373 (\d{2}) (\d{2})-(\d{2})-(\d{2})', lambda m: f'+373 {m[1]} {m[2]}{m[3][0]} {m[3][1]}{m[4]}', txt)
PHONES = {'0235 80 008': '+373 23 580 008', '+373 235 80 008': '+373 23 580 008', '+373 ___ __ ___': '+373 __ ___ ___'}
for old, new in PHONES.items():
    body = body.replace(old, new); data = data.replace(old, new); script = script.replace(old, new)
body, data, script = phones(body), phones(data), phones(script)
IMPORTMAP = '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>\n'
out = (head + body + data + "\n" + IMPORTMAP + "<script>" + script + "</script>\n<script type=\"module\">" + module + "</script>\n"
       + "<script type=\"module\">" + metal3d + "</script>\n</body></html>\n")
(ROOT / 'index.html').write_text(out)
_bad = set(re.findall(r'\+373 \d[\d ]*\d', out)) - {m for m in re.findall(r'\+373 \d\d \d\d\d \d\d\d', out)}
_bad = {x for x in _bad if len(re.sub(r'\D','',x))>=11}
assert not _bad, ('телефоны не в формате +373 XX XXX XXX', _bad)
print('ok', len(out))

# --- проверка: синтаксис модулей (ошибка в одном скрипте молча убирает функцию со страницы) ---
import shutil, subprocess
if shutil.which('node'):
    for name in ('metal3d.js', 'parallax.js', 'building.js'):
        r = subprocess.run(['node', '--check', '--input-type=module'], input=(ROOT / 'src' / name).read_text(), text=True, capture_output=True)
        assert r.returncode == 0, f'Ошибка синтаксиса в src/{name}:\n{r.stderr}'
    print('синтаксис модулей: ок')

# --- подстраницы (4 услуги и «Ателье») ---
r = subprocess.run(['python3', '-I', str(ROOT / 'src' / 'build_subpages.py')], text=True, capture_output=True)
assert r.returncode == 0, r.stderr
print(r.stdout.strip())
