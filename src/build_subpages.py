#!/usr/bin/env python3 -I
"""Подстраницы фото-версии: 4 страницы услуг и «Ателье» (ru/<slug>/index.html).

Тексты, структура и разметка берутся из основного генератора сайта
(Сайт MZ/design/tools/build_subpages.py) без изменений; здесь подменяются только
шапка, верхняя полоса, подвал и стили — их берём из собранной главной фото-версии (index.html),
чтобы страницы совпадали с ней по дизайну. 3D-конструктор не переносится.
Запускается из src/build.py после сборки главной."""
import re, pathlib, html as H

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIG = pathlib.Path.home() / 'Documents/Claude/Projects/Сайт MZ/design/tools/build_subpages.py'
orig = ORIG.read_text(encoding='utf8')
home = (ROOT / 'index.html').read_text(encoding='utf8')

# ---- пути: страницы лежат в ru/<slug>/, главная и картинки — на два уровня выше ----
HOME, IMG, OUT = '../../index.html', '../../img/', ROOT / 'ru'
SUB = lambda slug: f'../{slug}/index.html'
PHONE_MOB = '+373 68 47-15-30'

css = re.search(r'<style>(.*?)</style>', home, re.S).group(1)
topbar = re.search(r'<div class="top">.*?</div>\n', home, re.S).group(0)
header = re.search(r'<header class="nav">.*?</header>', home, re.S).group(0)
footer = re.search(r'<footer>.*?</footer>', home, re.S).group(0)

def fix(block):
    block = block.replace('src="img/', f'src="{IMG}')
    block = re.sub(r'href="#([a-z]+)"', lambda m: f'href="{HOME}#{m.group(1)}"', block)
    block = block.replace('<a href="#">', f'<a href="{HOME}">')
    block = block.replace('ru/atelier/index.html', SUB('atelier'))
    for slug in ('rezka-metalla-gilotinoj', 'rezka-metalla-pod-razmery', 'valcovka-trub', 'gazovaya-rezka-metalloprokata'):
        block = block.replace(f'ru/{slug}/index.html', SUB(slug))
    return block

header, footer, topbar = fix(header), fix(footer), fix(topbar)

# ---- стили подстраниц из исходного генератора + привязка к палитре фото-версии ----
EXTRA = re.search(r'EXTRA = """(.*?)"""', orig, re.S).group(1)
EXTRA += """
/* привязка переменных исходных стилей к палитре фото-версии */
:root{--s100:#E8E3D6;--s500:#4B525C;--s700:#1B1E24;--s900:#16181C;--sh1:0 1px 2px rgba(20,22,26,.06);--sh2:0 10px 28px rgba(20,22,26,.12);--green-600:#0E6B47;--green-700:#051F15}
.sec.alt{--bg:#E8E3D6}
.g2 .sec.alt{--bg:#E6E0D2}
.sp-hero{background:var(--bg);color:var(--ink)}
.sp-hero h1{color:var(--ink)}
.band2 .btn.primary,.c3d .btn.primary{background:var(--orange);color:var(--orange-ink)}
.at-hero .kick{color:#FFB48A}
.crumbs{padding:18px var(--gutter) 14px;background:var(--d1)}
.crumbs a:hover{color:var(--orange)}
.sp-hero .lead{color:var(--ink-2)}
.at-hero .lead{color:rgba(255,255,255,.86)}
"""

def fmt_phones(txt):
    txt = txt.replace('+373 235 80 008', '+373 23 580 008')
    # номера в одном формате: +373 68 47-15-30 -> +373 68 471 530
    return re.sub(r'\+373 (\d{2}) (\d{2})-(\d{2})-(\d{2})', lambda m: f'+373 {m[1]} {m[2]}{m[3][0]} {m[3][1]}{m[4]}', txt)

# ---- тексты и шаблоны страниц из исходного генератора (без конструктора) ----
rest = orig[orig.index('PHONE = '):]
rest = rest[:rest.index('CONSTRUCTOR_CSS')] + rest[rest.index('pages = {'):]
rest = rest[:rest.index('CON_OUT.mkdir')]
rest = rest.replace('PHONE = ', 'PHONE = ', 1)

# светлые блоки: тёмная палитра по умолчанию, поэтому секциям явно задаём светлую
src_page_fix = r'''
def _light(s):
    s = s.replace('<section class="sec alt"', '<section class="sec light alt"').replace('<section class="sec"', '<section class="sec light"')
    return s.replace('<section class="sp-hero"', '<section class="sp-hero light"')
_service_page, _atelier_page = service_page, atelier_page
service_page = lambda p: _light(_service_page(p))
atelier_page = lambda: _light(_atelier_page())
'''
rest = rest.replace('pages = {', src_page_fix + '\npages = {', 1)

# в шаблонах подмешиваем классы g1/g2 для зелёных вариантов и тот же переключатель ?g=
rest = rest.replace("<style>{css}{extra}</style></head><body>",
                    "<style>{css}{extra}</style><script>document.documentElement.className='g'+(new URLSearchParams(location.search).get('g')||'2');try{{history.scrollRestoration='manual'}}catch(e){{}}function _top(){{scrollTo({{top:0,left:0,behavior:'instant'}})}}_top();addEventListener('DOMContentLoaded',_top);addEventListener('load',_top);addEventListener('pageshow',_top)</script></head><body>")
rest = rest.replace("(d/'index.html').write_text(s, encoding='utf8')", "(d/'index.html').write_text(fmt_phones(s), encoding='utf8')")
exec(compile(rest, 'build_subpages_rest', 'exec'), globals())
