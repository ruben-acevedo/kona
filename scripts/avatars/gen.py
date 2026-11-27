"""Gera as amostras de avatares no estilo do abacaxi do Kona (SVG 100x100) e uma página de prévia."""
import math, os, sys

OUT = os.path.dirname(os.path.abspath(__file__))

def lg(id_, stops, x2=0, y2=1, x1=0, y1=0):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{id_}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'

def bg(p, a, b):
    return lg(f'{p}bg', [(0, a), (1, b)], 1, 1), f'<rect width="100" height="100" fill="url(#{p}bg)"/>'

def shine(cx, cy, rx, ry, rot=-18, op=.22):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#fff" fill-opacity="{op}" transform="rotate({rot} {cx} {cy})"/>'

def svg(p, defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>{"".join(defs)}</defs>{body}</svg>'

LEAF = [('0', '#0f9f6e'), ('1', '#4ade80')]
FRUIT = [('0', '#ffd85c'), ('.6', '#f7a823'), ('1', '#e2771a')]

def pineapple(p, cy=64, extra_defs=(), over='', bgc=('#14203f', '#26194a')):
    bd, br = bg(p, *bgc)
    d = [bd, lg(f'{p}leaf', LEAF, 0, 0, 0, 1), lg(f'{p}fruit', FRUIT),
         f'<clipPath id="{p}body"><ellipse cx="50" cy="{cy}" rx="21" ry="25"/></clipPath>', *extra_defs]
    dy = cy - 64 + 2
    leaves = f'''<g fill="url(#{p}leaf)" transform="translate(0 {dy})">
      <path d="M50 41 C45.5 31 45.5 20 50 8 C54.5 20 54.5 31 50 41Z"/>
      <path d="M48.5 42 C41 36 35 27 31 16 C39 21 45 28 51 39Z"/>
      <path d="M51.5 42 C59 36 65 27 69 16 C61 21 55 28 49 39Z"/>
      <path d="M47 44 C39 43 30 38 23 30 C32 31 40 34 49 40Z"/>
      <path d="M53 44 C61 43 70 38 77 30 C68 31 60 34 51 40Z"/></g>'''
    hatch = f'''<g clip-path="url(#{p}body)" fill="none" stroke="#a8530d" stroke-opacity=".5" stroke-width="1.8" stroke-linecap="round" transform="translate(0 {cy - 64})">
      <path d="M14 46 L70 102 M14 34 L82 102 M22 30 L90 98 M34 30 L94 90 M46 30 L98 82 M58 30 L100 72 M8 56 L58 106"/>
      <path d="M86 46 L30 102 M86 34 L18 102 M78 30 L10 98 M66 30 L6 90 M54 30 L2 82 M42 30 L0 72 M92 56 L42 106"/></g>'''
    body = (br + leaves + f'<ellipse cx="50" cy="{cy}" rx="21" ry="25" fill="url(#{p}fruit)"/>' + hatch
            + shine(43, cy - 9, 5, 9) + over)
    return svg(p, d, body)

# 1) abacaxi de óculos escuros
def pine_glasses():
    p = 'pg'
    lens = lg(f'{p}lens', [(0, '#4a4f72'), (1, '#0e0f1a')])
    over = f'''<g transform="translate(0 2)">
      <path d="M27 54 H73" stroke="#0e0f1a" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="29" y="52" width="18" height="12" rx="5" fill="url(#{p}lens)"/>
      <rect x="53" y="52" width="18" height="12" rx="5" fill="url(#{p}lens)"/>
      <path d="M32 55.5 L37 54.5" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M56 55.5 L61 54.5" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M44 72 Q50 77 56 72" fill="none" stroke="#7a3a08" stroke-opacity=".85" stroke-width="2.2" stroke-linecap="round"/></g>'''
    return pineapple(p, extra_defs=[lens], over=over)

# 2) border collie
def collie():
    p = 'bc'
    bd, br = bg(p, '#2a2350', '#46337a')
    d = [bd, lg(f'{p}blk', [(0, '#45414f'), (1, '#16141b')]), lg(f'{p}wht', [(0, '#ffffff'), (1, '#d4d8e6')]),
         lg(f'{p}ear', [(0, '#3a3644'), (1, '#121016')])]
    body = br + f'''
      <path d="M22 100 C25 80 75 80 78 100 Z" fill="url(#{p}wht)"/>
      <path d="M27 50 C24 37 25 27 31 21 C37 24 42 31 44 38 Z" fill="url(#{p}ear)"/>
      <path d="M73 50 C76 37 75 27 69 21 C63 24 58 31 56 38 Z" fill="url(#{p}ear)"/>
      <path d="M31 21 C27 25 26 30 27 35 C30 31 33 29 37 28 Z" fill="#d4d8e6" fill-opacity=".9"/>
      <path d="M69 21 C73 25 74 30 73 35 C70 31 67 29 63 28 Z" fill="#d4d8e6" fill-opacity=".9"/>
      <ellipse cx="50" cy="56" rx="24" ry="23" fill="url(#{p}blk)"/>
      <path d="M46.5 33 C47 30 53 30 53.5 33 L57 57 L43 57 Z" fill="url(#{p}wht)"/>
      <ellipse cx="50" cy="67" rx="15" ry="11.5" fill="url(#{p}wht)"/>
      <circle cx="40" cy="50" r="3.6" fill="#7a4a24"/><circle cx="60" cy="50" r="3.6" fill="#7a4a24"/>
      <circle cx="40" cy="50" r="1.9" fill="#0d0b10"/><circle cx="60" cy="50" r="1.9" fill="#0d0b10"/>
      <circle cx="41.1" cy="48.9" r=".9" fill="#fff"/><circle cx="61.1" cy="48.9" r=".9" fill="#fff"/>
      <ellipse cx="50" cy="62" rx="4.6" ry="3.4" fill="#1a1720"/>
      <ellipse cx="48.6" cy="61" rx="1.4" ry=".8" fill="#fff" fill-opacity=".6"/>
      <path d="M50 65.4 V68 M45.5 68.5 Q50 72 54.5 68.5" fill="none" stroke="#2a2530" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M47.4 70.6 Q50 77.5 52.6 70.6 Z" fill="#ff7c9c"/>''' + shine(39, 42, 5, 8, -25, .12)
    return svg(p, d, body)

# 3) jogador de futebol
def footballer():
    p = 'fb'
    bd, br = bg(p, '#0c3a2b', '#176a45')
    skin = lg(f'{p}skin', [(0, '#f6c99f'), (1, '#d99a6c')])
    shirt = lg(f'{p}shirt', [(0, '#ffd85c'), (1, '#f39a1f')])
    ball = lg(f'{p}ball', [(0, '#ffffff'), (1, '#cfd5e2')])
    d = [bd, skin, shirt, ball]
    body = br + f'''<g transform="translate(50 54) scale(1.12) translate(-50 -54)">
      <circle cx="50" cy="118" r="44" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
      <path d="M41 47 L30 58" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M56 46 L66 52" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M43 70 L39 86" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M39 80 L38.4 86" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="36.5" cy="89" rx="5.5" ry="2.8" fill="#1c1c26"/>
      <path d="M52 69 L60 76" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M59 75 L64.5 79.5" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="67" cy="81.5" rx="5.5" ry="2.8" fill="#1c1c26" transform="rotate(35 67 81.5)"/>
      <path d="M40 41 C40 37 57 37 57 41 L59 63 C54 65.5 43 65.5 38 63 Z" fill="url(#{p}shirt)"/>
      <path d="M44.5 38.6 L48.5 43 L52.5 38.6" fill="none" stroke="#0f7a4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M38 62 L59 62 L60 71 L50.5 71 L49 67 L47 71 L37.5 71 Z" fill="#2457d6"/>
      <circle cx="48" cy="29" r="8.5" fill="url(#{p}skin)"/>
      <path d="M39.6 28 C39.5 21 45 19 49 19.6 C54 20 57 23.5 56.4 27.5 C53 25 47 24.5 39.6 28 Z" fill="#2b1d14"/>
      <circle cx="76" cy="81" r="7.5" fill="url(#{p}ball)"/>
      <path d="M76 77.4 L79.2 79.7 L78 83.5 L74 83.5 L72.8 79.7 Z" fill="#1c1c26"/>
      <path d="M76 73.5 V77.4 M79.2 79.7 L83.2 78.2 M78 83.5 L80.4 87.3 M74 83.5 L71.6 87.3 M72.8 79.7 L68.8 78.2" stroke="#1c1c26" stroke-width="1.2"/>''' + shine(45, 50, 3.5, 7, -10, .18) + '</g>'
    return svg(p, d, body)

# 4) jogador de basquete
def baller():
    p = 'bb'
    bd, br = bg(p, '#3a1a10', '#713214')
    skin = lg(f'{p}skin', [(0, '#c98a5c'), (1, '#8a5230')])
    shirt = lg(f'{p}shirt', [(0, '#8f73ff'), (1, '#5233c9')])
    ball = lg(f'{p}ball', [(0, '#ffab52'), (1, '#e2611a')])
    d = [bd, skin, shirt, ball, f'<clipPath id="{p}bc"><circle cx="70" cy="19" r="8.5"/></clipPath>']
    body = br + f'''<g transform="translate(50 55) scale(1.1) translate(-50 -55)">
      <path d="M14 96 H86" stroke="#ffb36b" stroke-opacity=".18" stroke-width="2"/>
      <path d="M56 44 L66 27" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M42 45 L34 58" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M45 72 L38 82 L42 90" fill="none" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M54 72 L61 81 L57 89" fill="none" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="44" cy="91.5" rx="5.5" ry="2.8" fill="#f3f1fb"/><ellipse cx="59" cy="90.5" rx="5.5" ry="2.8" fill="#f3f1fb"/>
      <path d="M41.5 42 C42 39 56 39 56.5 42 L58 64 C53 66.5 45 66.5 40 64 Z" fill="url(#{p}shirt)"/>
      <path d="M45 41 C46 45 52 45 53 41" fill="none" stroke="#c9bcff" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M39.5 63 L58.5 63 L59.5 74 L50.5 74 L49 69.5 L47.5 74 L38.5 74 Z" fill="#efeefa"/>
      <path d="M39 70 H59.5" stroke="#5233c9" stroke-width="1.6"/>
      <circle cx="49" cy="31" r="8.5" fill="url(#{p}skin)"/>
      <path d="M40.7 29.5 C40.5 23 45 21 49 21 C53 21 57.6 23 57.3 29.5 C54 27 45 27 40.7 29.5 Z" fill="#1d130d"/>
      <circle cx="70" cy="19" r="8.5" fill="url(#{p}ball)"/>
      <g clip-path="url(#{p}bc)" fill="none" stroke="#5a2408" stroke-width="1.2">
        <path d="M61.5 19 H78.5 M70 10.5 V27.5"/><path d="M64 12 C68 16 68 22 64 26"/><path d="M76 12 C72 16 72 22 76 26"/></g>''' + shine(66.5, 15.5, 2.4, 3.5, -30, .3) + '</g>'
    return svg(p, d, body)

# 5) girassol
def sunflower():
    p = 'sf'
    bd, br = bg(p, '#0f2645', '#1c4473')
    d = [bd, lg(f'{p}pet', [(0, '#ffe27a'), (1, '#f5a623')]), lg(f'{p}ctr', [(0, '#8a5526'), (1, '#3b2210')]),
         lg(f'{p}leaf', LEAF, 1, 0, 0, 1), f'<clipPath id="{p}cc"><circle cx="50" cy="42" r="11.5"/></clipPath>']
    petals = ''.join(f'<ellipse cx="50" cy="23" rx="5.2" ry="10.5" fill="url(#{p}pet)" transform="rotate({i * 360 / 14:.1f} 50 42)"/>' for i in range(14))
    petals2 = ''.join(f'<ellipse cx="50" cy="26" rx="4.2" ry="8" fill="#f7b733" fill-opacity=".85" transform="rotate({i * 360 / 14 + 360 / 28:.1f} 50 42)"/>' for i in range(14))
    seeds = ''.join(f'<circle cx="{50 + r * math.cos(a):.2f}" cy="{42 + r * math.sin(a):.2f}" r="1" fill="#e8b25a" fill-opacity=".55"/>'
                    for k in range(1, 70) for r, a in [(math.sqrt(k) * 1.35, k * 2.39996)] if r < 10.5)
    body = br + f'''
      <path d="M50 54 C51 70 48 84 50 100" fill="none" stroke="#1f9a62" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M50 80 C57 70 68 69 76 73 C70 82 59 85 50 80 Z" fill="url(#{p}leaf)"/>
      <path d="M50 88 C44 80 34 79 27 82 C33 90 43 92 50 88 Z" fill="url(#{p}leaf)"/>
      {petals2}{petals}
      <circle cx="50" cy="42" r="11.5" fill="url(#{p}ctr)"/>
      <g clip-path="url(#{p}cc)">{seeds}</g>''' + shine(45.5, 37.5, 3, 4.5, -30, .18)
    return svg(p, d, body)

# 6) pessoa simples
def person():
    p = 'ps'
    bd, br = bg(p, '#1b3550', '#2c6378')
    g = lg(f'{p}g', [(0, '#f1f5ff'), (1, '#a9b8de')])
    body = br + f'''
      <path d="M20 100 C20 62 80 62 80 100 Z" fill="url(#{p}g)"/>
      <circle cx="50" cy="44" r="16" fill="url(#{p}g)"/>''' + shine(43.5, 38, 4, 7, -25, .45)
    return svg(p, [bd, g], body)

# 7) formas: órbita (três círculos que se misturam)
def orbit():
    p = 'ob'
    bd, br = bg(p, '#12142b', '#262052')
    d = [bd, lg(f'{p}a', [(0, '#ff8ab3'), (1, '#9b5cff')], 1, 1), lg(f'{p}b', [(0, '#5ee7ff'), (1, '#3a6bff')], 1, 1),
         lg(f'{p}c', [(0, '#ffe27a'), (1, '#ff7a3d')], 1, 1)]
    body = br + f'''<g style="mix-blend-mode:screen">
      <circle cx="39" cy="42" r="19" fill="url(#{p}a)" fill-opacity=".9"/>
      <circle cx="61" cy="42" r="19" fill="url(#{p}b)" fill-opacity=".9" style="mix-blend-mode:screen"/>
      <circle cx="50" cy="61" r="19" fill="url(#{p}c)" fill-opacity=".9" style="mix-blend-mode:screen"/></g>'''
    return svg(p, d, body)

# 8) formas: ondas ao pôr do sol
def waves():
    p = 'wv'
    bd, br = bg(p, '#160f2e', '#3a1d4f')
    d = [bd, lg(f'{p}sun', [(0, '#ffe27a'), (1, '#ff6f61')]), lg(f'{p}w1', [(0, '#5ee7ff'), (1, '#2457d6')]),
         lg(f'{p}w2', [(0, '#7c5cff'), (1, '#3b2a9e')]), lg(f'{p}w3', [(0, '#2a1b6e'), (1, '#140d3a')])]
    body = br + f'''
      <circle cx="50" cy="46" r="17" fill="url(#{p}sun)"/>
      <path d="M0 58 C15 50 30 50 50 58 S85 66 100 58 V100 H0 Z" fill="url(#{p}w1)"/>
      <path d="M0 70 C18 62 34 63 52 70 S86 77 100 69 V100 H0 Z" fill="url(#{p}w2)"/>
      <path d="M0 82 C20 75 36 76 54 82 S86 88 100 81 V100 H0 Z" fill="url(#{p}w3)"/>''' + shine(44, 40, 4, 6.5, -30, .3)
    return svg(p, d, body)

# 9) formas: prisma (gema facetada)
def prism():
    p = 'pr'
    bd, br = bg(p, '#151229', '#2b2148')
    d = [bd, lg(f'{p}a', [(0, '#ffd6e8'), (1, '#ff8ab3')]), lg(f'{p}b', [(0, '#ffb3d1'), (1, '#d9488a')]),
         lg(f'{p}c', [(0, '#c3a6ff'), (1, '#7c5cff')]), lg(f'{p}d', [(0, '#9b7bff'), (1, '#4a2fb8')]),
         lg(f'{p}e', [(0, '#fff3c4'), (1, '#ffd85c')])]
    body = br + f'''
      <path d="M33 38 L41 27 H59 L67 38 Z" fill="url(#{p}e)"/>
      <path d="M41 27 L50 38 L59 27 Z" fill="#fff" fill-opacity=".55"/>
      <path d="M33 38 H50 L50 78 Z" fill="url(#{p}a)"/>
      <path d="M50 38 H67 L50 78 Z" fill="url(#{p}c)"/>
      <path d="M33 38 L41 27 L50 38 Z" fill="url(#{p}b)" fill-opacity=".7"/>
      <path d="M67 38 L59 27 L50 38 Z" fill="url(#{p}d)" fill-opacity=".7"/>
      <path d="M50 38 L41.5 38 L50 78 Z" fill="#fff" fill-opacity=".22"/>'''
    return svg(p, d, body)

ITEMS = [('Abacaxi de óculos', pine_glasses()), ('Border collie', collie()), ('Jogador de futebol', footballer()),
         ('Jogador de basquete', baller()), ('Girassol', sunflower()), ('Pessoa', person()),
         ('Órbita', orbit()), ('Ondas', waves()), ('Prisma', prism())]

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'svg'), exist_ok=True)
    for i, (n, s) in enumerate(ITEMS):
        open(os.path.join(OUT, 'svg', f'{i}.svg'), 'w').write(s)
    cards = ''.join(f'''<figure><div class="big">{s}</div>
      <div class="sizes"><span class="s40">{s}</span><span class="s24">{s}</span><span class="s24 light">{s}</span></div>
      <figcaption>{n}</figcaption></figure>''' for n, s in ITEMS)
    open(os.path.join(OUT, 'preview.html'), 'w').write(f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>body{{margin:0;padding:28px;background:#1c1c1e;color:#f5f5f7;font:14px system-ui,sans-serif}}
.grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:22px}} figure{{margin:0;text-align:center}}
.big svg{{width:128px;height:128px;border-radius:50%;display:block;margin:0 auto}}
.sizes{{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:10px}}
.s40 svg{{width:40px;height:40px;border-radius:50%;display:block}} .s24 svg{{width:24px;height:24px;border-radius:50%;display:block}}
.light{{background:#f2f2f7;padding:6px;border-radius:8px}} figcaption{{margin-top:8px;color:#c7c7cc}}</style></head>
<body><div class="grid">{cards}</div></body></html>''')
    print('ok', len(ITEMS))
