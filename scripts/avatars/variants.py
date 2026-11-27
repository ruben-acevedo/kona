"""Os 10 grupos de avatares do Kona (principal + 3 variações), no traço do abacaxi do logo."""
import math
from gen import lg, bg, shine, svg, LEAF, FRUIT

# ───────────── Abacaxis ─────────────
def pine(p, bgc, over='', extra=(), under='', face=True):
    bd, br = bg(p, *bgc)
    d = [bd, lg(f'{p}leaf', LEAF, 0, 0, 0, 1), lg(f'{p}fruit', FRUIT),
         f'<clipPath id="{p}body"><ellipse cx="50" cy="64" rx="21" ry="25"/></clipPath>', *extra]
    leaves = f'''<g fill="url(#{p}leaf)" transform="translate(0 2)">
      <path d="M50 41 C45.5 31 45.5 20 50 8 C54.5 20 54.5 31 50 41Z"/>
      <path d="M48.5 42 C41 36 35 27 31 16 C39 21 45 28 51 39Z"/>
      <path d="M51.5 42 C59 36 65 27 69 16 C61 21 55 28 49 39Z"/>
      <path d="M47 44 C39 43 30 38 23 30 C32 31 40 34 49 40Z"/>
      <path d="M53 44 C61 43 70 38 77 30 C68 31 60 34 51 40Z"/></g>'''
    hatch = f'''<g clip-path="url(#{p}body)" fill="none" stroke="#a8530d" stroke-opacity=".5" stroke-width="1.8" stroke-linecap="round">
      <path d="M14 46 L70 102 M14 34 L82 102 M22 30 L90 98 M34 30 L94 90 M46 30 L98 82 M58 30 L100 72 M8 56 L58 106"/>
      <path d="M86 46 L30 102 M86 34 L18 102 M78 30 L10 98 M66 30 L6 90 M54 30 L2 82 M42 30 L0 72 M92 56 L42 106"/></g>'''
    return svg(p, d, br + under + leaves + f'<ellipse cx="50" cy="64" rx="21" ry="25" fill="url(#{p}fruit)"/>' + hatch + shine(43, 55, 5, 9) + over)

SMILE = '<path d="M44 72 Q50 77 56 72" fill="none" stroke="#7a3a08" stroke-opacity=".85" stroke-width="2.2" stroke-linecap="round"/>'
EYES = ('<circle cx="43" cy="61" r="2.6" fill="#3b1d06"/><circle cx="57" cy="61" r="2.6" fill="#3b1d06"/>'
        '<circle cx="43.9" cy="60.1" r=".9" fill="#fff"/><circle cx="57.9" cy="60.1" r=".9" fill="#fff"/>')

def pine_glasses():
    p = 'pg'
    lens = lg(f'{p}lens', [(0, '#4a4f72'), (1, '#0e0f1a')])
    over = f'''<g transform="translate(0 2)">
      <path d="M27 54 H73" stroke="#0e0f1a" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="29" y="52" width="18" height="12" rx="5" fill="url(#{p}lens)"/><rect x="53" y="52" width="18" height="12" rx="5" fill="url(#{p}lens)"/>
      <path d="M32 55.5 L37 54.5 M56 55.5 L61 54.5" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/></g>''' + SMILE
    return pine(p, ('#14203f', '#26194a'), over, [lens])

def pine_headphones():
    p = 'ph'
    cup = lg(f'{p}cup', [(0, '#9b7bff'), (1, '#4a2fb8')])
    over = f'''<path d="M26 62 C26 33 74 33 74 62" fill="none" stroke="#1d1b2e" stroke-width="3.4" stroke-linecap="round"/>
      <rect x="22" y="55" width="9" height="16" rx="4" fill="url(#{p}cup)"/><rect x="69" y="55" width="9" height="16" rx="4" fill="url(#{p}cup)"/>
      <path d="M41 61 Q43 59 45 61 M55 61 Q57 59 59 61" fill="none" stroke="#3b1d06" stroke-width="2" stroke-linecap="round"/>
      <path d="M44 70 Q50 76 56 70" fill="#7a3a08" fill-opacity=".85"/>
      <g fill="#fff" fill-opacity=".6"><ellipse cx="82" cy="34" rx="2.6" ry="2" transform="rotate(-20 82 34)"/>
      <path d="M84.2 33.6 V25 L88 26.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round"/></g>'''
    return pine(p, ('#1a1440', '#3a2370'), over, [cup])

def pine_hat():
    p = 'pt'
    straw = lg(f'{p}straw', [(0, '#ffe6a8'), (1, '#d9a64e')])
    over = f'''<ellipse cx="50" cy="43" rx="27" ry="6.5" fill="url(#{p}straw)"/>
      <path d="M35 43 C35 30 65 30 65 43 Z" fill="url(#{p}straw)"/>
      <path d="M35.4 39.5 C42 41.5 58 41.5 64.6 39.5 L65 43 C58 45 42 45 35 43 Z" fill="#ff5a6a"/>
      <path d="M30 44 C40 47.5 60 47.5 70 44" fill="none" stroke="#b8863a" stroke-opacity=".45" stroke-width="1"/>''' + EYES + SMILE
    return pine(p, ('#0b3a4a', '#16708a'), over, [straw])

def pine_sleep():
    p = 'pz'
    over = '''<path d="M40 61 Q43 63.5 46 61 M54 61 Q57 63.5 60 61" fill="none" stroke="#3b1d06" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="50" cy="72" rx="2.4" ry="2.8" fill="#7a3a08" fill-opacity=".8"/>
      <g fill="#fff" font-family="system-ui, sans-serif" font-weight="700" fill-opacity=".85">
      <text x="70" y="40" font-size="11">z</text><text x="78" y="30" font-size="8">z</text><text x="84" y="22" font-size="6">z</text></g>'''
    stars = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" fill-opacity=".5"/>' for x, y, r in [(18, 24, .9), (26, 14, .6), (84, 56, .7), (14, 60, .6)])
    return pine(p, ('#0d1030', '#1f1f52'), over, under=stars)

# ───────────── Cachorros ─────────────
def dog(p, bgc, fur, ear, light, eye, blaze=True, mask='', tongue=True, chest=None):
    bd, br = bg(p, *bgc)
    d = [bd, lg(f'{p}fur', fur), lg(f'{p}wht', light), lg(f'{p}ear', ear), lg(f'{p}chest', chest or light)]
    b = br + f'''
      <path d="M22 100 C25 80 75 80 78 100 Z" fill="url(#{p}chest)"/>
      <path d="M27 50 C24 37 25 27 31 21 C37 24 42 31 44 38 Z" fill="url(#{p}ear)"/>
      <path d="M73 50 C76 37 75 27 69 21 C63 24 58 31 56 38 Z" fill="url(#{p}ear)"/>
      <ellipse cx="50" cy="56" rx="24" ry="23" fill="url(#{p}fur)"/>{mask}'''
    if blaze: b += f'<path d="M46.5 33 C47 30 53 30 53.5 33 L57 57 L43 57 Z" fill="url(#{p}wht)"/>'
    b += f'''<ellipse cx="50" cy="67" rx="15" ry="11.5" fill="url(#{p}wht)"/>
      <circle cx="40" cy="50" r="3.6" fill="{eye}"/><circle cx="60" cy="50" r="3.6" fill="{eye}"/>
      <circle cx="40" cy="50" r="1.9" fill="#0d0b10"/><circle cx="60" cy="50" r="1.9" fill="#0d0b10"/>
      <circle cx="41.1" cy="48.9" r=".9" fill="#fff"/><circle cx="61.1" cy="48.9" r=".9" fill="#fff"/>
      <ellipse cx="50" cy="62" rx="4.6" ry="3.4" fill="#1a1720"/><ellipse cx="48.6" cy="61" rx="1.4" ry=".8" fill="#fff" fill-opacity=".6"/>
      <path d="M50 65.4 V68 M45.5 68.5 Q50 72 54.5 68.5" fill="none" stroke="#2a2530" stroke-width="1.6" stroke-linecap="round"/>'''
    if tongue: b += '<path d="M47.4 70.6 Q50 77.5 52.6 70.6 Z" fill="#ff7c9c"/>'
    return svg(p, d, b + shine(39, 42, 5, 8, -25, .12))

WHITE = [(0, '#ffffff'), (1, '#d4d8e6')]
def collie():
    return dog('bc', ('#2a2350', '#46337a'), [(0, '#45414f'), (1, '#16141b')], [(0, '#3a3644'), (1, '#121016')], WHITE, '#7a4a24')

def caramelo():
    return dog('dc', ('#3a1f12', '#7a3f1c'), [(0, '#f0b264'), (1, '#c0702c')], [(0, '#d98f45'), (1, '#9a5420')],
               [(0, '#fff1dc'), (1, '#f2cfa0')], '#4a2a12', blaze=False)

def husky():
    p = 'dh'
    mask = f'''<path d="M30 50 C30 42 36 39 41 42 C44 44 46 47 50 47 C54 47 56 44 59 42 C64 39 70 42 70 50 C70 62 60 72 50 72 C40 72 30 62 30 50 Z" fill="url(#{p}wht)"/>'''
    return dog(p, ('#0f2440', '#25507c'), [(0, '#8e98ad'), (1, '#454e62')], [(0, '#7c869c'), (1, '#3a4254')], WHITE, '#5fb8ff', blaze=True, mask=mask)

def pug():
    p = 'dp'
    bd, br = bg(p, '#3b2a14', '#6e4f22')
    d = [bd, lg(f'{p}fur', [(0, '#f0d2a6'), (1, '#c99b66')]), lg(f'{p}blk', [(0, '#4a4350'), (1, '#16131a')])]
    b = br + f'''
      <path d="M22 100 C25 80 75 80 78 100 Z" fill="url(#{p}fur)"/>
      <ellipse cx="50" cy="55" rx="26" ry="24" fill="url(#{p}fur)"/>
      <path d="M26 44 C22 36 28 28 36 31 C38 35 36 41 31 46 Z" fill="url(#{p}blk)"/>
      <path d="M74 44 C78 36 72 28 64 31 C62 35 64 41 69 46 Z" fill="url(#{p}blk)"/>
      <path d="M41 38 Q50 34 59 38 M43 42 Q50 39 57 42" fill="none" stroke="#a87a48" stroke-width="1.6" stroke-linecap="round"/>
      <ellipse cx="50" cy="64" rx="14" ry="11" fill="url(#{p}blk)"/>
      <circle cx="38.5" cy="51" r="5" fill="#2a1f18"/><circle cx="61.5" cy="51" r="5" fill="#2a1f18"/>
      <circle cx="40" cy="49.5" r="1.6" fill="#fff"/><circle cx="63" cy="49.5" r="1.6" fill="#fff"/>
      <ellipse cx="50" cy="59" rx="4.8" ry="3.2" fill="#0d0b10"/><ellipse cx="48.6" cy="58.2" rx="1.4" ry=".7" fill="#fff" fill-opacity=".5"/>
      <path d="M50 62 V65 M45 66 Q50 69.5 55 66" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M47.6 67.6 Q50 74 52.4 67.6 Z" fill="#ff7c9c"/>'''
    return svg(p, d, b + shine(40, 40, 5, 7, -25, .18))

# ───────────── Gatos ─────────────
def cat(p, bgc, fur, stripes, inner, eye, muzzle, chest, mask=''):
    bd, br = bg(p, *bgc)
    d = [bd, lg(f'{p}fur', fur), lg(f'{p}mz', muzzle), lg(f'{p}eye', eye), lg(f'{p}ch', chest)]
    st = ''
    if stripes:
        st = f'''<g stroke="{stripes}" stroke-width="2.2" stroke-linecap="round" fill="none" stroke-opacity=".8">
        <path d="M50 32 V38.5 M44.5 33 L46 38.5 M55.5 33 L54 38.5"/>
        <path d="M26 51 H32 M26.5 56.5 L32 55.5 M74 51 H68 M73.5 56.5 L68 55.5"/></g>'''
    b = br + f'''
      <path d="M24 100 C26 82 74 82 76 100 Z" fill="url(#{p}ch)"/>
      <path d="M27 46 L29 17 L47 32 Z" fill="url(#{p}fur)"/><path d="M73 46 L71 17 L53 32 Z" fill="url(#{p}fur)"/>
      <path d="M31 39 L32.3 24 L42 32 Z" fill="{inner}"/><path d="M69 39 L67.7 24 L58 32 Z" fill="{inner}"/>
      <ellipse cx="50" cy="53" rx="25" ry="22" fill="url(#{p}fur)"/>{st}{mask}
      <ellipse cx="44.5" cy="63" rx="6.8" ry="5.2" fill="url(#{p}mz)"/><ellipse cx="55.5" cy="63" rx="6.8" ry="5.2" fill="url(#{p}mz)"/>
      <ellipse cx="40" cy="50.5" rx="4.4" ry="5" fill="url(#{p}eye)"/><ellipse cx="60" cy="50.5" rx="4.4" ry="5" fill="url(#{p}eye)"/>
      <ellipse cx="40" cy="50.8" rx="1.4" ry="3.8" fill="#10140f"/><ellipse cx="60" cy="50.8" rx="1.4" ry="3.8" fill="#10140f"/>
      <circle cx="41.4" cy="48.6" r="1" fill="#fff"/><circle cx="61.4" cy="48.6" r="1" fill="#fff"/>
      <path d="M47.3 58.2 H52.7 L50 61.2 Z" fill="#ff7c9c"/>
      <path d="M50 61.2 V63 M47 64.6 Q50 66.8 53 64.6" fill="none" stroke="#5a2a1a" stroke-width="1.3" stroke-linecap="round"/>
      <g stroke="#fff" stroke-opacity=".85" stroke-width=".9" stroke-linecap="round">
        <path d="M38 62 L23 59.5 M38 64.5 L23 65.5 M62 62 L77 59.5 M62 64.5 L77 65.5"/></g>'''
    return svg(p, d, b + shine(40, 40, 5, 8, -30, .16))

CW = [(0, '#ffffff'), (1, '#e4e6ee')]
def cat_orange():
    return cat('kt', ('#0f2f3a', '#1f5b66'), [(0, '#ffb35c'), (1, '#e3701c')], '#b9541a', '#ff9db3', [(0, '#c4f57a'), (1, '#3fae4f')], CW, CW)
def cat_black():
    return cat('kb', ('#2a1238', '#5a2a6e'), [(0, '#4a4558'), (1, '#141219')], None, '#ff9db3', [(0, '#fff0a0'), (1, '#f0a500')],
               [(0, '#4a4558'), (1, '#26222f')], [(0, '#3a3546'), (1, '#141219')])
def cat_siamese():
    p = 'ks'
    mask = f'<ellipse cx="50" cy="60" rx="15" ry="12" fill="#5a3f30" fill-opacity=".85"/>'
    return cat(p, ('#10284a', '#2a4f86'), [(0, '#f8eedf'), (1, '#d9c3a3')], None, '#6b4a38', [(0, '#bfe6ff'), (1, '#2f7fd6')],
               [(0, '#7a5a48'), (1, '#4a3226')], [(0, '#fbf4ea'), (1, '#e2d2bb')], mask)
def cat_grey():
    return cat('kg', ('#1d2a33', '#3d5566'), [(0, '#c3cad6'), (1, '#7a8494')], '#5a6270', '#ff9db3', [(0, '#e8f57a'), (1, '#8ab83f')], CW, CW)

# ───────────── Futebol ─────────────
def footballer(p, bgc, shirt, collar, shorts, socks, hair='#2b1d14', skin=((0, '#f6c99f'), (1, '#d99a6c'))):
    bd, br = bg(p, *bgc)
    d = [bd, lg(f'{p}skin', list(skin)), lg(f'{p}shirt', shirt), lg(f'{p}ball', [(0, '#ffffff'), (1, '#cfd5e2')])]
    b = br + f'''<g transform="translate(50 54) scale(1.12) translate(-50 -54)">
      <circle cx="50" cy="118" r="44" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
      <path d="M41 47 L30 58" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M56 46 L66 52" stroke="url(#{p}skin)" stroke-width="6" stroke-linecap="round"/>
      <path d="M43 70 L39 86" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M39 80 L38.4 86" stroke="{socks}" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="36.5" cy="89" rx="5.5" ry="2.8" fill="#1c1c26"/>
      <path d="M52 69 L60 76" stroke="url(#{p}skin)" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M59 75 L64.5 79.5" stroke="{socks}" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="67" cy="81.5" rx="5.5" ry="2.8" fill="#1c1c26" transform="rotate(35 67 81.5)"/>
      <path d="M40 41 C40 37 57 37 57 41 L59 63 C54 65.5 43 65.5 38 63 Z" fill="url(#{p}shirt)"/>
      <path d="M44.5 38.6 L48.5 43 L52.5 38.6" fill="none" stroke="{collar}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M38 62 L59 62 L60 71 L50.5 71 L49 67 L47 71 L37.5 71 Z" fill="{shorts}"/>
      <circle cx="48" cy="29" r="8.5" fill="url(#{p}skin)"/>
      <path d="M39.6 28 C39.5 21 45 19 49 19.6 C54 20 57 23.5 56.4 27.5 C53 25 47 24.5 39.6 28 Z" fill="{hair}"/>
      <circle cx="76" cy="81" r="7.5" fill="url(#{p}ball)"/>
      <path d="M76 77.4 L79.2 79.7 L78 83.5 L74 83.5 L72.8 79.7 Z" fill="#1c1c26"/>
      <path d="M76 73.5 V77.4 M79.2 79.7 L83.2 78.2 M78 83.5 L80.4 87.3 M74 83.5 L71.6 87.3 M72.8 79.7 L68.8 78.2" stroke="#1c1c26" stroke-width="1.2"/>''' + shine(45, 50, 3.5, 7, -10, .18) + '</g>'
    return svg(p, d, b)

PITCH = ('#0c3a2b', '#176a45')
def fb_brazil(): return footballer('fb', PITCH, [(0, '#ffd85c'), (1, '#f39a1f')], '#0f7a4e', '#2457d6', '#fff')
def fb_white(): return footballer('fw', PITCH, [(0, '#ffffff'), (1, '#d3d8e6')], '#c3c8d8', '#f2f3f8', '#fff')
def fb_black(): return footballer('fk', PITCH, [(0, '#4a4a58'), (1, '#16161e')], '#6a6a7a', '#1a1a22', '#22222c', hair='#3d2a1c')
def fb_green(): return footballer('fg', ('#0f1f3d', '#1d3f6b'), [(0, '#4ade80'), (1, '#0f9f6e')], '#e9fff4', '#0f7a4e', '#2fbf7a')

# ───────────── Flores ─────────────
def sunflower():
    p = 'sf'
    bd, br = bg(p, '#0f2645', '#1c4473')
    d = [bd, lg(f'{p}pet', [(0, '#ffe27a'), (1, '#f5a623')]), lg(f'{p}ctr', [(0, '#8a5526'), (1, '#3b2210')]),
         lg(f'{p}leaf', LEAF, 1, 0, 0, 1), f'<clipPath id="{p}cc"><circle cx="50" cy="42" r="11.5"/></clipPath>']
    petals = ''.join(f'<ellipse cx="50" cy="23" rx="5.2" ry="10.5" fill="url(#{p}pet)" transform="rotate({i * 360 / 14:.1f} 50 42)"/>' for i in range(14))
    petals2 = ''.join(f'<ellipse cx="50" cy="26" rx="4.2" ry="8" fill="#f7b733" fill-opacity=".85" transform="rotate({i * 360 / 14 + 360 / 28:.1f} 50 42)"/>' for i in range(14))
    seeds = ''.join(f'<circle cx="{50 + r * math.cos(a):.2f}" cy="{42 + r * math.sin(a):.2f}" r="1" fill="#e8b25a" fill-opacity=".55"/>'
                    for k in range(1, 70) for r, a in [(math.sqrt(k) * 1.35, k * 2.39996)] if r < 10.5)
    b = br + STEM(p) + petals2 + petals + f'<circle cx="50" cy="42" r="11.5" fill="url(#{p}ctr)"/><g clip-path="url(#{p}cc)">{seeds}</g>' + shine(45.5, 37.5, 3, 4.5, -30, .18)
    return svg(p, d, b)

STEM = lambda p: f'''<path d="M50 54 C51 70 48 84 50 100" fill="none" stroke="#1f9a62" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M50 80 C57 70 68 69 76 73 C70 82 59 85 50 80 Z" fill="url(#{p}leaf)"/>
      <path d="M50 88 C44 80 34 79 27 82 C33 90 43 92 50 88 Z" fill="url(#{p}leaf)"/>'''

def tulip():
    p = 'tu'
    bd, br = bg(p, '#2a1038', '#5a2266')
    d = [bd, lg(f'{p}leaf', LEAF, 1, 0, 0, 1), lg(f'{p}a', [(0, '#ff8aa8'), (1, '#d6245a')]), lg(f'{p}b', [(0, '#ffb3c6'), (1, '#ee4a78')])]
    b = br + f'''<path d="M50 52 C50 68 49 84 50 100" fill="none" stroke="#1f9a62" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M50 96 C40 88 33 74 34 60 C42 68 48 80 50 96 Z" fill="url(#{p}leaf)"/>
      <path d="M50 92 C58 84 66 76 68 64 C60 70 53 78 50 92 Z" fill="url(#{p}leaf)"/>
      <path d="M35 36 C34 26 40 20 44 24 C46 18 54 18 56 24 C60 20 66 26 65 36 C64 50 56 56 50 56 C44 56 36 50 35 36 Z" fill="url(#{p}a)"/>
      <path d="M42 54 C38 44 40 30 50 22 C60 30 62 44 58 54 C55 56.5 45 56.5 42 54 Z" fill="url(#{p}b)"/>''' + shine(46, 36, 2.5, 8, -10, .25)
    return svg(p, d, b)

def rose():
    p = 'ro'
    bd, br = bg(p, '#2a0d18', '#5e1a30')
    d = [bd, lg(f'{p}leaf', LEAF, 1, 0, 0, 1), lg(f'{p}a', [(0, '#ff6b7a'), (1, '#b3122e')]), lg(f'{p}b', [(0, '#ff8a96'), (1, '#d1203f')])]
    b = br + STEM(p) + f'''
      <path d="M33 40 C30 28 40 22 50 26 C60 22 70 28 67 40 C65 52 57 58 50 58 C43 58 35 52 33 40 Z" fill="url(#{p}a)"/>
      <path d="M38 42 C38 33 44 29 50 31 C56 29 62 33 62 42 C60 50 55 53 50 53 C45 53 40 50 38 42 Z" fill="url(#{p}b)"/>
      <path d="M44 40 C44 35 48 33 51 34 C55 35 56 39 54 42 C52 45 47 45 46 42 C45 39 48 38 50 39" fill="none" stroke="#8a0d24" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M40 54 C44 58 56 58 60 54 L56 60 C52 62 48 62 44 60 Z" fill="#1f9a62"/>''' + shine(42, 36, 2.5, 6, -25, .22)
    return svg(p, d, b)

def sakura():
    p = 'sk'
    bd, br = bg(p, '#14183a', '#2e3570')
    d = [bd, lg(f'{p}pet', [(0, '#ffe3ee'), (1, '#ff8fb8')])]
    petal = 'M0 0 C-7 -9 -8 -19 -3 -23 C-1.5 -24 -0.5 -22 0 -20.5 C0.5 -22 1.5 -24 3 -23 C8 -19 7 -9 0 0 Z'
    def bloom(cx, cy, s):
        ps = ''.join(f'<path d="{petal}" fill="url(#{p}pet)" transform="translate({cx} {cy}) rotate({i * 72}) scale({s})"/>' for i in range(5))
        st = ''.join(f'<path d="M{cx} {cy} L{cx + 7 * s * math.cos(a):.2f} {cy + 7 * s * math.sin(a):.2f}" stroke="#ff5d8f" stroke-width="{.8 * s:.2f}"/><circle cx="{cx + 7.5 * s * math.cos(a):.2f}" cy="{cy + 7.5 * s * math.sin(a):.2f}" r="{.9 * s:.2f}" fill="#ffd85c"/>'
                     for a in [k * 2 * math.pi / 8 for k in range(8)])
        return ps + f'<circle cx="{cx}" cy="{cy}" r="{3 * s:.2f}" fill="#ff5d8f"/>' + st
    b = br + '''<path d="M4 78 C24 70 40 66 58 50 C66 43 74 40 92 38" fill="none" stroke="#6b4226" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M40 64 C44 72 46 78 44 86" fill="none" stroke="#6b4226" stroke-width="2.2" stroke-linecap="round"/>''' + bloom(54, 46, 1.25) + bloom(26, 72, .75) + bloom(80, 30, .6) + '<ellipse cx="44" cy="86" rx="2.6" ry="3.4" fill="#ffb3cf"/>'
    return svg(p, d, b)

# ───────────── Pessoas (tons de pele) ─────────────
TONES = {  # pele, cabelo da mulher, cabelo do homem, sorriso
    'claro': ([(0, '#fde3cf'), (1, '#ecbc9a')], [(0, '#f2cd73'), (1, '#b8862e')], [(0, '#b0703a'), (1, '#6b3d1c')], '#a5473a'),
    'medio': ([(0, '#f2c49c'), (1, '#d5976a')], [(0, '#6b3b22'), (1, '#2b160c')], [(0, '#3d2a1c'), (1, '#1d130c')], '#a5473a'),
    'moreno': ([(0, '#c98a5c'), (1, '#9a5f36')], [(0, '#3a2418'), (1, '#140c08')], [(0, '#2a1d14'), (1, '#0d0906')], '#5a2418'),
    'escuro': ([(0, '#8a5a3c'), (1, '#5a3622')], [(0, '#2a1a12'), (1, '#0a0605')], [(0, '#1d140e'), (1, '#060403')], '#2a0f08'),
}

def woman(tone):
    p = 'w' + tone[:2]
    skin, hair, _, smile = TONES[tone]
    bd, br = bg(p, '#3a1530', '#6e2a5a')
    d = [bd, lg(f'{p}hair', hair), lg(f'{p}skin', skin), lg(f'{p}top', [(0, '#ff9a86'), (1, '#e0506d')])]
    b = br + f'''
      <path d="M28 60 C23 34 34 18 50 18 C66 18 77 34 72 60 C74 72 70 80 65 85 L35 85 C30 80 26 72 28 60 Z" fill="url(#{p}hair)"/>
      <path d="M19 100 C19 81 33 74 50 74 C67 74 81 81 81 100 Z" fill="url(#{p}top)"/>
      <rect x="45" y="58" width="10" height="18" rx="4" fill="url(#{p}skin)"/>
      <path d="M43.5 74.2 L50 82 L56.5 74.2 Z" fill="url(#{p}skin)"/>
      <ellipse cx="50" cy="46" rx="13" ry="15" fill="url(#{p}skin)"/>
      <path d="M36.5 46 C35 32 43 26.5 51 26.5 C59.5 26.5 66 32.5 63.6 43 C59 36 51 33.5 45 37.5 C41.5 40 38.5 42.5 36.5 46 Z" fill="url(#{p}hair)"/>
      <path d="M42.6 47.5 Q44.8 45.2 47 47.5 M53 47.5 Q55.2 45.2 57.4 47.5" fill="none" stroke="#2a1810" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="42" cy="52.5" r="2.6" fill="#ff7a7a" fill-opacity=".35"/><circle cx="58" cy="52.5" r="2.6" fill="#ff7a7a" fill-opacity=".35"/>
      <path d="M46.8 54.6 Q50 57.4 53.2 54.6" fill="none" stroke="{smile}" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="37.2" cy="52.5" r="1.9" fill="#ffd85c"/><circle cx="62.8" cy="52.5" r="1.9" fill="#ffd85c"/>''' + shine(42, 31, 2.5, 5, -35, .08)
    return svg(p, d, b)

def man(tone):
    p = 'm' + tone[:2]
    skin, _, hair, _ = TONES[tone]
    bd, br = bg(p, '#122a4a', '#25507c')
    d = [bd, lg(f'{p}skin', skin), lg(f'{p}shirt', [(0, '#4fd6c2'), (1, '#1f7f8f')]), lg(f'{p}hair', hair)]
    b = br + f'''
      <path d="M18 100 C18 80 33 73 50 73 C67 73 82 80 82 100 Z" fill="url(#{p}shirt)"/>
      <rect x="45" y="57" width="10" height="18" rx="4" fill="url(#{p}skin)"/>
      <path d="M43.5 73.2 L50 81 L56.5 73.2 Z" fill="url(#{p}skin)"/>
      <path d="M42 73 L50 81 M58 73 L50 81" stroke="#e9fffb" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="36.8" cy="47" rx="2.6" ry="3.6" fill="url(#{p}skin)"/><ellipse cx="63.2" cy="47" rx="2.6" ry="3.6" fill="url(#{p}skin)"/>
      <ellipse cx="50" cy="45" rx="13" ry="15" fill="url(#{p}skin)"/>
      <path d="M37 43 C35.5 30 43 24.5 50.5 24.5 C58.5 24.5 65.5 30 63 43 C61 36.5 56 33 50 33.5 C44 33.5 39.5 37 37 43 Z" fill="url(#{p}hair)"/>
      <path d="M37.4 48 C38 58.5 44 62.5 50 62.5 C56 62.5 62 58.5 62.6 48 C60.5 54 56 56.2 50 56.2 C44 56.2 39.5 54 37.4 48 Z" fill="url(#{p}hair)" fill-opacity=".92"/>
      <path d="M43.2 41.6 H47 M53 41.6 H56.8" stroke="#1d130c" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="45" cy="46" r="1.5" fill="#1d130c"/><circle cx="55" cy="46" r="1.5" fill="#1d130c"/>
      <path d="M46.8 58.4 Q50 60.6 53.2 58.4" fill="none" stroke="#f0c4a2" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>''' + shine(44, 39, 2.5, 4.5, -25, .08)
    return svg(p, d, b)

# ───────────── Halloween ─────────────
from more import bat

def pumpkin():
    p = 'hp'
    bd, br = bg(p, '#1a0d2e', '#3d1a52')
    d = [bd, lg(f'{p}o', [(0, '#ffb35c'), (1, '#d9530f')]), lg(f'{p}g', [(0, '#fff3a0'), (1, '#ffb800')])]
    b = br + f'''<path d="M50 30 C50 24 53 20 57 19" fill="none" stroke="#3f7a2a" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M52 27 C58 22 64 24 66 28 C60 30 56 30 52 27 Z" fill="#4ade80"/>
      <ellipse cx="36" cy="58" rx="16" ry="24" fill="url(#{p}o)"/><ellipse cx="64" cy="58" rx="16" ry="24" fill="url(#{p}o)"/>
      <ellipse cx="50" cy="58" rx="17" ry="26" fill="url(#{p}o)"/>
      <path d="M50 33 C44 45 44 71 50 83 M50 33 C56 45 56 71 50 83" fill="none" stroke="#a8400a" stroke-opacity=".5" stroke-width="1.4"/>
      <path d="M36 52 L42 45 L46 53 Z M64 52 L58 45 L54 53 Z" fill="url(#{p}g)"/>
      <path d="M47 58 L50 54 L53 58 Z" fill="url(#{p}g)"/>
      <path d="M33 64 C40 74 60 74 67 64 L63 66 L60 63 L56 67 L53 64 L50 68 L47 64 L44 67 L40 63 L37 66 Z" fill="url(#{p}g)"/>''' + shine(30, 48, 3, 8, -15, .2)
    return svg(p, d, b)

def ghost():
    p = 'hg'
    bd, br = bg(p, '#0f1d33', '#243f66')
    d = [bd, lg(f'{p}s', [(0, '#ffffff'), (1, '#c9cfe4')])]
    stars = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" fill-opacity=".45"/>' for x, y, r in [(18, 26, .9), (82, 22, .7), (86, 60, .8), (14, 66, .6)])
    b = br + stars + f'''<path d="M30 52 C30 30 70 30 70 52 L70 84 C66 80 62 80 58 85 C55 80 51 80 48 85 C45 80 41 80 38 85 C35 80 32 80 30 84 Z" fill="url(#{p}s)"/>
      <path d="M31 60 C25 60 22 56 21 52 C25 54 28 54 31 54 Z M69 60 C75 60 78 56 79 52 C75 54 72 54 69 54 Z" fill="url(#{p}s)"/>
      <ellipse cx="43" cy="52" rx="3.2" ry="4.4" fill="#1d1a2b"/><ellipse cx="57" cy="52" rx="3.2" ry="4.4" fill="#1d1a2b"/>
      <circle cx="44" cy="50.6" r="1" fill="#fff"/><circle cx="58" cy="50.6" r="1" fill="#fff"/>
      <ellipse cx="50" cy="60" rx="2.4" ry="3" fill="#1d1a2b"/>
      <circle cx="39" cy="58" r="2.4" fill="#ff8ab3" fill-opacity=".5"/><circle cx="61" cy="58" r="2.4" fill="#ff8ab3" fill-opacity=".5"/>''' + shine(41, 40, 3.5, 6, -30, .5)
    return svg(p, d, b)

def skull():
    p = 'hs'
    bd, br = bg(p, '#2a0f3a', '#5a1f6e')
    d = [bd, lg(f'{p}b', [(0, '#ffffff'), (1, '#d8d4e6')])]
    b = br + f'''<path d="M28 46 C28 28 38 20 50 20 C62 20 72 28 72 46 C72 56 68 62 64 64 L64 72 C64 76 60 78 56 78 H44 C40 78 36 76 36 72 L36 64 C32 62 28 56 28 46 Z" fill="url(#{p}b)"/>
      <ellipse cx="40.5" cy="47" rx="6.5" ry="7.2" fill="#2a1638"/><ellipse cx="59.5" cy="47" rx="6.5" ry="7.2" fill="#2a1638"/>
      <circle cx="42.5" cy="45" r="2" fill="#fff"/><circle cx="61.5" cy="45" r="2" fill="#fff"/>
      <path d="M50 54 L47.5 59 H52.5 Z" fill="#2a1638"/>
      <path d="M42 70 V77 M46 70.5 V78 M50 70.5 V78 M54 70.5 V78 M58 70 V77" stroke="#9a8fb0" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M40 69 C46 71 54 71 60 69" fill="none" stroke="#9a8fb0" stroke-width="1.3" stroke-linecap="round"/>
      <g transform="translate(66 26) rotate(20)"><path d="M0 0 C-6 -5 -9 2 -4 4 Z M0 0 C6 -5 9 2 4 4 Z" fill="#ff6ba6"/><circle r="1.8" fill="#ff8ab3"/></g>''' + shine(38, 32, 4, 7, -30, .35)
    return svg(p, d, b)

# ───────────── Música ─────────────
from more import guitar

def note(x, y, s):
    return f'<g transform="translate({x} {y}) scale({s})" fill="#fff" fill-opacity=".55"><ellipse cx="0" cy="8" rx="3" ry="2.3" transform="rotate(-20 0 8)"/><path d="M2.6 7.5 V-3 L7 -1.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>'

def microphone():
    p = 'mi'
    bd, br = bg(p, '#0f1a3a', '#2a2f72')
    d = [bd, lg(f'{p}head', [(0, '#f3f4fa'), (1, '#9aa2b8')], 1, 1), lg(f'{p}body', [(0, '#4a4f6a'), (1, '#14162a')]),
         f'<clipPath id="{p}hc"><circle cx="50" cy="34" r="14"/></clipPath>']
    mesh = ''.join(f'<path d="M{x} 18 V50" stroke="#6b7390" stroke-opacity=".55" stroke-width=".8"/>' for x in range(38, 64, 4)) + \
           ''.join(f'<path d="M34 {y} H66" stroke="#6b7390" stroke-opacity=".55" stroke-width=".8"/>' for y in range(22, 50, 4))
    b = br + note(20, 30, 1) + note(76, 62, .85) + f'''<g transform="rotate(-18 50 50)">
      <path d="M43 46 H57 L54 86 C54 89 46 89 46 86 Z" fill="url(#{p}body)"/>
      <rect x="41" y="45" width="18" height="5" rx="2" fill="#c8ccd8"/>
      <circle cx="50" cy="34" r="14" fill="url(#{p}head)"/><g clip-path="url(#{p}hc)">{mesh}</g>
      <path d="M36 34 H64" stroke="#9aa2b8" stroke-width="2.2"/>
      <circle cx="50" cy="66" r="2" fill="#ff5a6a"/></g>''' + shine(44, 27, 3, 5, -40, .45)
    return svg(p, d, b)

def piano():
    p = 'pn'
    bd, br = bg(p, '#1a1230', '#3e2a66')
    d = [bd, lg(f'{p}body', [(0, '#4a3f6b'), (1, '#1a1428')]), lg(f'{p}key', [(0, '#ffffff'), (1, '#d9dce8')])]
    whites = ''.join(f'<rect x="{19 + i * 9}" y="50" width="8.2" height="22" rx="1.6" fill="url(#{p}key)"/>' for i in range(7))
    blacks = ''.join(f'<rect x="{19 + i * 9 + 5.6}" y="50" width="5" height="13" rx="1.2" fill="#14111e"/>' for i in (0, 1, 3, 4, 5))
    b = br + note(26, 18, 1) + note(70, 16, .8) + f'''<g transform="rotate(-8 50 60)">
      <rect x="14" y="40" width="72" height="36" rx="6" fill="url(#{p}body)"/>
      <rect x="18" y="43" width="64" height="5" rx="2.5" fill="#000" fill-opacity=".25"/>
      <circle cx="74" cy="45.5" r="1.4" fill="#ff5a6a"/><circle cx="69" cy="45.5" r="1.4" fill="#4ade80"/>{whites}{blacks}</g>''' + shine(24, 44, 2, 6, -60, .3)
    return svg(p, d, b)

def drum():
    p = 'dr'
    bd, br = bg(p, '#2a0c0c', '#6b1f1f')
    d = [bd, lg(f'{p}shell', [(0, '#ff6b6b'), (1, '#b3122e')], 1, 0), lg(f'{p}head', [(0, '#fffaf0'), (1, '#e6dcc8')]),
         lg(f'{p}wood', [(0, '#f2c784'), (1, '#c98a3c')])]
    rods = ''.join(f'<path d="M{x} 52 V78" stroke="#e8e8ef" stroke-width="1.6"/>' for x in (28, 39, 50, 61, 72))
    b = br + f'''<path d="M22 52 V76 C22 84 78 84 78 76 V52 Z" fill="url(#{p}shell)"/>{rods}
      <path d="M22 76 C22 84 78 84 78 76" fill="none" stroke="#c8ccd8" stroke-width="2.4"/>
      <ellipse cx="50" cy="52" rx="28" ry="9" fill="url(#{p}head)"/>
      <ellipse cx="50" cy="52" rx="28" ry="9" fill="none" stroke="#c8ccd8" stroke-width="2.4"/>
      <path d="M30 18 L56 50" stroke="url(#{p}wood)" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M72 16 L46 49" stroke="url(#{p}wood)" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="30" cy="18" r="2.4" fill="#f2c784"/><circle cx="72" cy="16" r="2.4" fill="#f2c784"/>''' + shine(30, 64, 2.5, 7, 0, .25)
    return svg(p, d, b)

# ───────────── Games ─────────────
from more import gamepad

def arcade():
    p = 'ga'
    bd, br = bg(p, '#101a3a', '#3a1f72')
    d = [bd, lg(f'{p}base', [(0, '#5a4a9a'), (1, '#211a44')]), lg(f'{p}top', [(0, '#7c6cd0'), (1, '#4a3a8a')]),
         lg(f'{p}ball', [(0, '#ff8a8a'), (1, '#d6243a')], 1, 1)]
    b = br + f'''<path d="M18 62 L26 52 H74 L82 62 V80 C82 84 78 86 74 86 H26 C22 86 18 84 18 80 Z" fill="url(#{p}base)"/>
      <path d="M18 62 L26 52 H74 L82 62 Z" fill="url(#{p}top)"/>
      <path d="M38 57 V30" stroke="#c8ccd8" stroke-width="3.4" stroke-linecap="round"/>
      <ellipse cx="38" cy="58" rx="6" ry="2.2" fill="#1a1428"/>
      <circle cx="38" cy="27" r="8" fill="url(#{p}ball)"/><circle cx="35.5" cy="24.5" r="2.2" fill="#fff" fill-opacity=".5"/>
      <ellipse cx="58" cy="58" rx="3.6" ry="1.8" fill="#4ade80"/><ellipse cx="67" cy="58" rx="3.6" ry="1.8" fill="#ffc83d"/>
      <ellipse cx="62" cy="54.5" rx="3.6" ry="1.8" fill="#4c8dff"/><ellipse cx="71" cy="54.5" rx="3.6" ry="1.8" fill="#ff5a6a"/>
      <rect x="40" y="70" width="20" height="4" rx="2" fill="#000" fill-opacity=".3"/>'''
    return svg(p, d, b)

def headset():
    p = 'gh'
    bd, br = bg(p, '#0f2a44', '#1f5f82')
    d = [bd, lg(f'{p}cup', [(0, '#7a80a8'), (1, '#2e3352')]), lg(f'{p}rgb', [(0, '#5ee7ff'), (.5, '#9b5cff'), (1, '#ff5a9a')], 0, 1)]
    b = br + f'''<path d="M24 58 C24 26 76 26 76 58" fill="none" stroke="#4a5078" stroke-width="7" stroke-linecap="round"/>
      <path d="M28 52 C28 32 72 32 72 52" fill="none" stroke="#9aa0c8" stroke-width="2" stroke-linecap="round" stroke-opacity=".6"/>
      <rect x="16" y="50" width="18" height="26" rx="8" fill="url(#{p}cup)"/><rect x="66" y="50" width="18" height="26" rx="8" fill="url(#{p}cup)"/>
      <rect x="18.5" y="54" width="3" height="18" rx="1.5" fill="url(#{p}rgb)"/><rect x="78.5" y="54" width="3" height="18" rx="1.5" fill="url(#{p}rgb)"/>
      <path d="M28 72 C30 82 38 86 46 86" fill="none" stroke="#4a5078" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="44" y="83" width="8" height="6" rx="3" fill="#4a5078"/><circle cx="50.5" cy="86" r="1" fill="#5ee7ff"/>'''
    return svg(p, d, b)

def handheld():
    p = 'gb'
    bd, br = bg(p, '#1f1033', '#4a1f66')
    d = [bd, lg(f'{p}shell', [(0, '#ff9ad0'), (1, '#c94a9a')]), lg(f'{p}scr', [(0, '#5ee7ff'), (1, '#2457d6')])]
    heart = [(1, 0), (2, 0), (4, 0), (5, 0), (0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (0, 2), (1, 2), (2, 2), (3, 2), (4, 2), (5, 2), (6, 2),
             (1, 3), (2, 3), (3, 3), (4, 3), (5, 3), (2, 4), (3, 4), (4, 4), (3, 5)]
    px = ''.join(f'<rect x="{43 + x * 2:.1f}" y="{40 + y * 2:.1f}" width="2" height="2" fill="#ff5a7a"/>' for x, y in heart)
    b = br + f'''<g transform="rotate(-6 50 50)">
      <rect x="12" y="30" width="76" height="40" rx="14" fill="url(#{p}shell)"/>
      <rect x="32" y="34" width="36" height="28" rx="4" fill="#1a1428"/>
      <rect x="35" y="37" width="30" height="22" rx="2" fill="url(#{p}scr)"/>{px}
      <rect x="17" y="47" width="10" height="3.6" rx="1.2" fill="#2a1638"/><rect x="20.2" y="43.8" width="3.6" height="10" rx="1.2" fill="#2a1638"/>
      <circle cx="78" cy="45" r="3" fill="#2a1638"/><circle cx="73" cy="52" r="3" fill="#2a1638"/>
      <rect x="44" y="64" width="5" height="2" rx="1" fill="#2a1638" fill-opacity=".6"/><rect x="51" y="64" width="5" height="2" rx="1" fill="#2a1638" fill-opacity=".6"/>
      <ellipse cx="22" cy="35" rx="6" ry="2" fill="#fff" fill-opacity=".4" transform="rotate(-10 22 35)"/></g>'''
    return svg(p, d, b)

GROUPS = [
    ('Abacaxi', [('Abacaxi de óculos', pine_glasses), ('Abacaxi com fone', pine_headphones), ('Abacaxi de chapéu', pine_hat), ('Abacaxi dormindo', pine_sleep)]),
    ('Cachorro', [('Border collie', collie), ('Vira-lata caramelo', caramelo), ('Pug', pug), ('Husky', husky)]),
    ('Gato', [('Gato laranja', cat_orange), ('Gato preto', cat_black), ('Siamês', cat_siamese), ('Gato cinza', cat_grey)]),
    ('Futebol', [('Brasil', fb_brazil), ('Branco', fb_white), ('Preto', fb_black), ('Verde', fb_green)]),
    ('Flores', [('Girassol', sunflower), ('Tulipa', tulip), ('Rosa', rose), ('Cerejeira', sakura)]),
    ('Mulher', [(t, (lambda t=t: woman(t))) for t in ('medio', 'claro', 'moreno', 'escuro')]),
    ('Homem', [(t, (lambda t=t: man(t))) for t in ('medio', 'claro', 'moreno', 'escuro')]),
    ('Halloween', [('Morcego', bat), ('Abóbora', pumpkin), ('Fantasma', ghost), ('Caveira', skull)]),
    ('Música', [('Guitarra', guitar), ('Microfone', microphone), ('Piano', piano), ('Bateria', drum)]),
    ('Games', [('Controle', gamepad), ('Fliperama', arcade), ('Headset', headset), ('Portátil', handheld)]),
]

def raven():
    """Corvo à la Edgar Allan Poe: pousado num livro antigo, lua crescente ao fundo."""
    p = 'hr'
    bd, br = bg(p, '#24163c', '#4a2c6e')
    d = [bd, lg(f'{p}body', [(0, '#3d3756'), (1, '#0c0a14')], 1, 1), lg(f'{p}wing', [(0, '#2a2540'), (1, '#07060c')]),
         lg(f'{p}moon', [(0, '#fff6d6'), (1, '#f0d48a')]), lg(f'{p}book', [(0, '#8a2232'), (1, '#4a0f18')]),
         lg(f'{p}beak', [(0, '#4a4a58'), (1, '#16161e')]),
         f'<mask id="{p}cres"><rect width="100" height="100" fill="#fff"/><circle cx="79" cy="20" r="10.5" fill="#000"/></mask>']
    b = br + f'''<circle cx="73" cy="24" r="11" fill="url(#{p}moon)" mask="url(#{p}cres)"/>
      <circle cx="16" cy="18" r=".8" fill="#fff" fill-opacity=".5"/><circle cx="88" cy="48" r=".7" fill="#fff" fill-opacity=".4"/>
      <rect x="26" y="80" width="50" height="10" rx="2.5" fill="url(#{p}book)"/>
      <rect x="29" y="86.4" width="44" height="2.2" rx="1" fill="#efe0bd"/>
      <path d="M29 82.6 H73" stroke="#e9c46a" stroke-width=".9" stroke-opacity=".8"/>
      <path d="M64 70 L86 82 L82 86.5 L60 76 Z" fill="url(#{p}wing)"/>
      <path d="M48 74 V81 M47 81 H51.5 M56 73.5 V81 M55 81 H59.5" stroke="#3a3a44" stroke-width="1.8" stroke-linecap="round"/>
      <g fill="none" stroke="#b6a8ff" stroke-opacity=".45" stroke-width="1.6"><path d="M33 45 C31 57 37 70 51 74.5 C61 77.5 70 73 72 64 C74 54 67 44 55 40 C46 37.5 37 38.5 33 45 Z"/><circle cx="40" cy="35" r="11.5"/></g>
      <path d="M33 45 C31 57 37 70 51 74.5 C61 77.5 70 73 72 64 C74 54 67 44 55 40 C46 37.5 37 38.5 33 45 Z" fill="url(#{p}body)"/>
      <path d="M43 50 C52 45.5 65 50 71 61 C73 67 70.5 73 66.5 74.5 C62 66 54 59 43 50 Z" fill="url(#{p}wing)"/>
      <path d="M50 54 C56 56 62 61 66 67 M54 52.5 C60 55 65 59 68.5 64" fill="none" stroke="#5a5480" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>
      <ellipse cx="44" cy="55" rx="5" ry="10" fill="#7c8cff" fill-opacity=".16" transform="rotate(-30 44 55)"/>
      <circle cx="40" cy="35" r="11.5" fill="url(#{p}body)"/>
      <path d="M48 27 C52 25 55 27 55 30 C52 29.5 50 30 48.5 31.5 Z" fill="#0c0a14"/>
      <path d="M30 32.5 L13 39.5 L30.5 41 Z" fill="url(#{p}beak)"/>
      <path d="M30 32.5 L13 39.5 L22 37 Z" fill="#6a6a7a" fill-opacity=".55"/>
      <circle cx="36.6" cy="33.4" r="2.9" fill="#f5c04a"/><circle cx="36.3" cy="33.6" r="1.4" fill="#0c0a14"/>
      <circle cx="37.4" cy="32.5" r=".7" fill="#fff"/>
      <ellipse cx="44" cy="30" rx="3" ry="5" fill="#9aa4ff" fill-opacity=".18" transform="rotate(-40 44 30)"/>'''
    return svg(p, d, b)
