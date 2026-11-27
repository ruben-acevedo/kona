from gen import lg, bg, shine, svg, LEAF

def kitten():
    p = 'kt'
    bd, br = bg(p, '#0f2f3a', '#1f5b66')
    d = [bd, lg(f'{p}fur', [(0, '#ffb35c'), (1, '#e3701c')]), lg(f'{p}wht', [(0, '#ffffff'), (1, '#e4e6ee')]),
         lg(f'{p}eye', [(0, '#c4f57a'), (1, '#3fae4f')])]
    body = br + f'''
      <path d="M24 100 C26 82 74 82 76 100 Z" fill="url(#{p}wht)"/>
      <path d="M27 46 L29 17 L47 32 Z" fill="url(#{p}fur)"/><path d="M73 46 L71 17 L53 32 Z" fill="url(#{p}fur)"/>
      <path d="M31 39 L32.3 24 L42 32 Z" fill="#ff9db3"/><path d="M69 39 L67.7 24 L58 32 Z" fill="#ff9db3"/>
      <ellipse cx="50" cy="53" rx="25" ry="22" fill="url(#{p}fur)"/>
      <g stroke="#b9541a" stroke-width="2.2" stroke-linecap="round" fill="none" stroke-opacity=".8">
        <path d="M50 32 V38.5 M44.5 33 L46 38.5 M55.5 33 L54 38.5"/>
        <path d="M26 51 H32 M26.5 56.5 L32 55.5 M74 51 H68 M73.5 56.5 L68 55.5"/></g>
      <ellipse cx="44.5" cy="63" rx="6.8" ry="5.2" fill="url(#{p}wht)"/><ellipse cx="55.5" cy="63" rx="6.8" ry="5.2" fill="url(#{p}wht)"/>
      <ellipse cx="40" cy="50.5" rx="4.4" ry="5" fill="url(#{p}eye)"/><ellipse cx="60" cy="50.5" rx="4.4" ry="5" fill="url(#{p}eye)"/>
      <ellipse cx="40" cy="50.8" rx="1.4" ry="3.8" fill="#10140f"/><ellipse cx="60" cy="50.8" rx="1.4" ry="3.8" fill="#10140f"/>
      <circle cx="41.4" cy="48.6" r="1" fill="#fff"/><circle cx="61.4" cy="48.6" r="1" fill="#fff"/>
      <path d="M47.3 58.2 H52.7 L50 61.2 Z" fill="#ff7c9c"/>
      <path d="M50 61.2 V63 M47 64.6 Q50 66.8 53 64.6" fill="none" stroke="#7a3a1a" stroke-width="1.3" stroke-linecap="round"/>
      <g stroke="#fff" stroke-opacity=".85" stroke-width=".9" stroke-linecap="round">
        <path d="M38 62 L23 59.5 M38 64.5 L23 65.5 M62 62 L77 59.5 M62 64.5 L77 65.5"/></g>''' + shine(40, 40, 5, 8, -30, .16)
    return svg(p, d, body)

def woman():
    p = 'wm'
    bd, br = bg(p, '#3a1530', '#6e2a5a')
    d = [bd, lg(f'{p}hair', [(0, '#6b3b22'), (1, '#2b160c')]), lg(f'{p}skin', [(0, '#f8d3b2'), (1, '#e3a77f')]),
         lg(f'{p}top', [(0, '#ff9a86'), (1, '#e0506d')])]
    body = br + f'''
      <path d="M28 60 C23 34 34 18 50 18 C66 18 77 34 72 60 C74 72 70 80 65 85 L35 85 C30 80 26 72 28 60 Z" fill="url(#{p}hair)"/>
      <path d="M19 100 C19 81 33 74 50 74 C67 74 81 81 81 100 Z" fill="url(#{p}top)"/>
      <rect x="45" y="58" width="10" height="18" rx="4" fill="url(#{p}skin)"/>
      <path d="M43.5 74.2 L50 82 L56.5 74.2 Z" fill="url(#{p}skin)"/>
      <ellipse cx="50" cy="46" rx="13" ry="15" fill="url(#{p}skin)"/>
      <path d="M36.5 46 C35 32 43 26.5 51 26.5 C59.5 26.5 66 32.5 63.6 43 C59 36 51 33.5 45 37.5 C41.5 40 38.5 42.5 36.5 46 Z" fill="url(#{p}hair)"/>
      <path d="M42.6 47.5 Q44.8 45.2 47 47.5 M53 47.5 Q55.2 45.2 57.4 47.5" fill="none" stroke="#3b2416" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="42" cy="52.5" r="2.6" fill="#ff7a7a" fill-opacity=".4"/><circle cx="58" cy="52.5" r="2.6" fill="#ff7a7a" fill-opacity=".4"/>
      <path d="M46.8 54.6 Q50 57.4 53.2 54.6" fill="none" stroke="#a5473a" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="37.2" cy="52.5" r="1.9" fill="#ffd85c"/><circle cx="62.8" cy="52.5" r="1.9" fill="#ffd85c"/>''' + shine(41, 30, 3.5, 7, -35, .2)
    return svg(p, d, body)

def man():
    p = 'mn'
    bd, br = bg(p, '#122a4a', '#25507c')
    d = [bd, lg(f'{p}skin', [(0, '#ecb98f'), (1, '#c98a5c')]), lg(f'{p}shirt', [(0, '#4fd6c2'), (1, '#1f7f8f')]),
         lg(f'{p}hair', [(0, '#3d2a1c'), (1, '#1d130c')])]
    body = br + f'''
      <path d="M18 100 C18 80 33 73 50 73 C67 73 82 80 82 100 Z" fill="url(#{p}shirt)"/>
      <rect x="45" y="57" width="10" height="18" rx="4" fill="url(#{p}skin)"/>
      <path d="M43.5 73.2 L50 81 L56.5 73.2 Z" fill="url(#{p}skin)"/>
      <path d="M42 73 L50 81 M58 73 L50 81" stroke="#e9fffb" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="36.8" cy="47" rx="2.6" ry="3.6" fill="url(#{p}skin)"/><ellipse cx="63.2" cy="47" rx="2.6" ry="3.6" fill="url(#{p}skin)"/>
      <ellipse cx="50" cy="45" rx="13" ry="15" fill="url(#{p}skin)"/>
      <path d="M37 43 C35.5 30 43 24.5 50.5 24.5 C58.5 24.5 65.5 30 63 43 C61 36.5 56 33 50 33.5 C44 33.5 39.5 37 37 43 Z" fill="url(#{p}hair)"/>
      <path d="M37.4 48 C38 58.5 44 62.5 50 62.5 C56 62.5 62 58.5 62.6 48 C60.5 54 56 56.2 50 56.2 C44 56.2 39.5 54 37.4 48 Z" fill="url(#{p}hair)" fill-opacity=".92"/>
      <path d="M43.2 41.6 H47 M53 41.6 H56.8" stroke="#2b1d14" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="45" cy="46" r="1.5" fill="#2b1d14"/><circle cx="55" cy="46" r="1.5" fill="#2b1d14"/>
      <path d="M46.8 58.4 Q50 60.6 53.2 58.4" fill="none" stroke="#f0c4a2" stroke-width="1.5" stroke-linecap="round"/>''' + shine(44, 38, 3, 5.5, -25, .16)
    return svg(p, d, body)

def bat():
    p = 'bt'
    bd, br = bg(p, '#140b25', '#351a50')
    d = [bd, lg(f'{p}moon', [(0, '#fff7d6'), (1, '#ffd27a')]), lg(f'{p}wing', [(0, '#5d4888'), (1, '#231a38')]),
         lg(f'{p}body', [(0, '#6a5794'), (1, '#211830')])]
    wing = 'M50 53 C40 41 26 37 11 43 C15 47 17 51 16 56 C20.5 54 24.5 55 26.5 59 C29.5 56 34.5 56 37.5 60 C40.5 57 45.5 57 50 59 Z'
    body = br + f'''
      <circle cx="68" cy="29" r="14" fill="url(#{p}moon)" fill-opacity=".92"/>
      <circle cx="63" cy="25" r="2.2" fill="#e9c46a" fill-opacity=".35"/><circle cx="72" cy="34" r="3" fill="#e9c46a" fill-opacity=".3"/>
      <path d="{wing}" fill="url(#{p}wing)"/>
      <path d="{wing}" fill="url(#{p}wing)" transform="translate(100 0) scale(-1 1)"/>
      <path d="M41 49 L39.5 34 L47.5 44 Z" fill="url(#{p}body)"/><path d="M59 49 L60.5 34 L52.5 44 Z" fill="url(#{p}body)"/>
      <ellipse cx="50" cy="56" rx="11.5" ry="13" fill="url(#{p}body)"/>
      <circle cx="45.4" cy="53" r="3.4" fill="#fff"/><circle cx="54.6" cy="53" r="3.4" fill="#fff"/>
      <circle cx="46" cy="53.6" r="1.8" fill="#1a1028"/><circle cx="55.2" cy="53.6" r="1.8" fill="#1a1028"/>
      <circle cx="46.6" cy="52.7" r=".7" fill="#fff"/><circle cx="55.8" cy="52.7" r=".7" fill="#fff"/>
      <path d="M46.2 59.6 Q50 61.4 53.8 59.6" fill="none" stroke="#120a1c" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M47.4 60.2 L48.4 63.4 L49.4 60.6 Z M50.6 60.6 L51.6 63.4 L52.6 60.2 Z" fill="#fff"/>
      <circle cx="42.6" cy="58.5" r="1.8" fill="#ff7aa8" fill-opacity=".45"/><circle cx="57.4" cy="58.5" r="1.8" fill="#ff7aa8" fill-opacity=".45"/>''' + shine(46, 47, 2.5, 4, -25, .18)
    return svg(p, d, body)

def guitar():
    p = 'gt'
    bd, br = bg(p, '#2a0c1e', '#5e1a3c')
    d = [bd, lg(f'{p}body', [(0, '#ff7070'), (1, '#c2183f')]), lg(f'{p}wood', [(0, '#f2c784'), (1, '#c98a3c')])]
    frets = ''.join(f'<path d="M47.5 {y} H52.5" stroke="#8a5a24" stroke-width=".6"/>' for y in range(14, 52, 5))
    strings = ''.join(f'<path d="M{x} 7 V81" stroke="#f3f4fa" stroke-width=".45" stroke-opacity=".9"/>' for x in (48.7, 49.6, 50.4, 51.3))
    note = lambda x, y, s: f'<g transform="translate({x} {y}) scale({s})" fill="#fff" fill-opacity=".55"><ellipse cx="0" cy="8" rx="3" ry="2.3" transform="rotate(-20 0 8)"/><path d="M2.6 7.5 V-3 L7 -1.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>'
    body = br + note(20, 26, 1) + note(76, 66, .85) + note(28, 70, .7) + f'''
      <g transform="translate(50 50) rotate(-38) scale(.86) translate(-50 -52)">
        <path d="M45.5 1 L54.5 1 L55.5 10 L44.5 10 Z" fill="#2b1a12"/>
        <circle cx="43.6" cy="3.5" r="1.3" fill="#e8e8ef"/><circle cx="43.6" cy="7.5" r="1.3" fill="#e8e8ef"/>
        <circle cx="56.4" cy="3.5" r="1.3" fill="#e8e8ef"/><circle cx="56.4" cy="7.5" r="1.3" fill="#e8e8ef"/>
        <rect x="47.5" y="9" width="5" height="46" rx="1.5" fill="url(#{p}wood)"/>{frets}
        <path d="M50 50 C40 48 32 52 33 62 C34 68 30 72 31 79 C33 90 45 93 50 91 C55 93 67 90 69 79 C70 72 66 68 67 62 C68 52 60 48 50 50 Z" fill="url(#{p}body)"/>
        <path d="M50 56 C44 56 40 60 41 66 C42 72 40 76 42 82 L52 82 C54 76 52 70 54 64 C55 60 54 57 50 56 Z" fill="#fff4ee" fill-opacity=".95"/>
        <rect x="46" y="62" width="8" height="3" rx="1" fill="#1d1d24"/><rect x="46" y="71" width="8" height="3" rx="1" fill="#1d1d24"/>
        <rect x="45" y="79.5" width="10" height="3" rx="1" fill="#c9ccd6"/>{strings}
        <circle cx="60" cy="78" r="1.9" fill="#ececf3"/><circle cx="63" cy="84" r="1.9" fill="#ececf3"/>
        <ellipse cx="38" cy="62" rx="2.6" ry="6" fill="#fff" fill-opacity=".25" transform="rotate(-15 38 62)"/></g>'''
    return svg(p, d, body)

def gamepad():
    p = 'gp'
    bd, br = bg(p, '#101a3a', '#2b2d70')
    d = [bd, lg(f'{p}shell', [(0, '#f6f7fc'), (1, '#c3c8db')]), lg(f'{p}stick', [(0, '#4a4f6a'), (1, '#16182a')])]
    body = br + f'''<g transform="rotate(-8 50 56)">
      <path d="M22 47 C22 38.5 30 35.5 38 36.5 H62 C70 35.5 78 38.5 78 47 L82.5 66 C84.5 75 77.5 81 71.5 76 L63.5 68.5 H36.5 L28.5 76 C22.5 81 15.5 75 17.5 66 Z" fill="url(#{p}shell)"/>
      <rect x="29.5" y="48" width="11" height="4.2" rx="1.2" fill="#2a2d40"/><rect x="32.9" y="44.6" width="4.2" height="11" rx="1.2" fill="#2a2d40"/>
      <circle cx="63" cy="45.5" r="2.7" fill="#34c77b"/><circle cx="68.3" cy="50.5" r="2.7" fill="#ff5a6a"/>
      <circle cx="57.7" cy="50.5" r="2.7" fill="#4c8dff"/><circle cx="63" cy="55.5" r="2.7" fill="#ffc83d"/>
      <circle cx="42.5" cy="61" r="4.6" fill="url(#{p}stick)"/><circle cx="57.5" cy="61" r="4.6" fill="url(#{p}stick)"/>
      <circle cx="41.6" cy="60" r="1.3" fill="#fff" fill-opacity=".35"/><circle cx="56.6" cy="60" r="1.3" fill="#fff" fill-opacity=".35"/>
      <rect x="46" y="44" width="8" height="2.4" rx="1.2" fill="#7c5cff"/>
      <ellipse cx="30" cy="42" rx="5" ry="2.2" fill="#fff" fill-opacity=".6" transform="rotate(-12 30 42)"/></g>'''
    return svg(p, d, body)
