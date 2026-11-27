"""Gera renderer/avatars.js: os avatares dos perfis (10 grupos × 4), no traço do abacaxi do Kona.
   python3 scripts/avatars/build.py   (os desenhos ficam em variants.py / more.py / gen.py)"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import variants as v

T = lambda tone: {'medio': 'medium skin', 'claro': 'light skin', 'moreno': 'medium-dark skin', 'escuro': 'dark skin'}[tone]
GROUPS = [  # id, nome (inglês = chave de tradução), [(id, nome, função)]
    ('pine', 'Pineapples', [('pine-glasses', 'Pineapple with sunglasses', v.pine_glasses), ('pine-headphones', 'Pineapple with headphones', v.pine_headphones),
                            ('pine-hat', 'Pineapple with a sun hat', v.pine_hat), ('pine-sleep', 'Sleeping pineapple', v.pine_sleep)]),
    ('dog', 'Dogs', [('dog-collie', 'Border collie', v.collie), ('dog-caramel', 'Caramel mutt', v.caramelo), ('dog-pug', 'Pug', v.pug), ('dog-husky', 'Husky', v.husky)]),
    ('cat', 'Cats', [('cat-orange', 'Orange cat', v.cat_orange), ('cat-black', 'Black cat', v.cat_black), ('cat-siamese', 'Siamese cat', v.cat_siamese), ('cat-grey', 'Grey cat', v.cat_grey)]),
    ('soccer', 'Soccer', [('soccer-brazil', 'Brazil kit', v.fb_brazil), ('soccer-white', 'White kit', v.fb_white), ('soccer-black', 'Black kit', v.fb_black), ('soccer-green', 'Green kit', v.fb_green)]),
    ('flower', 'Flowers', [('flower-sunflower', 'Sunflower', v.sunflower), ('flower-tulip', 'Tulip', v.tulip), ('flower-rose', 'Rose', v.rose), ('flower-cherry', 'Cherry blossom', v.sakura)]),
    ('woman', 'Women', [(f'woman-{t}', f'Woman, {T(t)}', (lambda t=t: v.woman(t))) for t in ('medio', 'claro', 'moreno', 'escuro')]),
    ('man', 'Men', [(f'man-{t}', f'Man, {T(t)}', (lambda t=t: v.man(t))) for t in ('medio', 'claro', 'moreno', 'escuro')]),
    ('halloween', 'Halloween', [('halloween-bat', 'Bat', v.bat), ('halloween-pumpkin', 'Pumpkin', v.pumpkin), ('halloween-ghost', 'Ghost', v.ghost), ('halloween-raven', 'Raven', v.raven)]),
    ('music', 'Music', [('music-guitar', 'Guitar', v.guitar), ('music-mic', 'Microphone', v.microphone), ('music-keys', 'Keyboard', v.piano), ('music-drum', 'Drum', v.drum)]),
    ('games', 'Games', [('games-controller', 'Controller', v.gamepad), ('games-arcade', 'Arcade stick', v.arcade), ('games-headset', 'Gaming headset', v.headset), ('games-handheld', 'Handheld console', v.handheld)]),
]
TONE_ID = {'medio': 'medium', 'claro': 'light', 'moreno': 'tan', 'escuro': 'dark'}

def mini(s):
    s = re.sub(r'\s+', ' ', s)
    return re.sub(r'>\s+<', '><', s).strip()

out = ['// Gerado por scripts/avatars/build.py: não editar à mão.',
       '// Avatares dos perfis: 10 grupos, cada um com a imagem principal e 3 variações (SVG 100×100).',
       "'use strict';", 'const AVATAR_GROUPS = [']
for gid, gname, items in GROUPS:
    out.append(f"  {{ id: '{gid}', name: /*i18n*/'{gname}', items: [")
    for iid, iname, fn in items:
        for k, t in TONE_ID.items(): iid = iid.replace(k, t)
        out.append(f"    {{ id: '{iid}', name: /*i18n*/{json.dumps(iname)}, svg: {json.dumps(mini(fn()))} }},")
    out.append('  ] },')
out.append('];')
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
open(os.path.join(root, 'renderer', 'avatars.js'), 'w').write('\n'.join(out) + '\n')
print('renderer/avatars.js:', sum(len(g[2]) for g in GROUPS), 'avatares')
