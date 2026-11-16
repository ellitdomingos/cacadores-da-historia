"""
Gera os níveis 2 a 4 (low-poly) em Blender: a base fixa e as 6 peças de cada nível.

Correr (sem abrir a interface):
    blender --background --python ferramentas/gerar_niveis.py              # todos
    blender --background --python ferramentas/gerar_niveis.py -- pf mbk    # só alguns
    python3 ferramentas/recortar_tabuleiro.py

Níveis:
    pf   Palácio de Ferro (Luanda)          tabuleiro: vista de frente
    mbk  Mbanza Kongo, ruínas da Kulumbimbi  tabuleiro: planta (vista de cima)
    mne  Museu Nacional da Escravatura,      tabuleiro: frente, ligeiramente de cima
         Capela da Casa Grande (Luanda)

Saída por nível (modelos/<nível>/): <peça>.glb, base.glb, pecas.json, img/<peça>_cima.png
(vista do tabuleiro), img/<peça>_3q.png (três quartos), img/base_cima.png.

As formas, as proporções e as cores são APROXIMADAS (sem levantamento no local):
afinar com fotografias. Convenções: metros; Z para cima; a frente está virada para -Y.
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
from mathutils import Matrix, Vector

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEDIDOS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["pf", "mbk", "mne"]

# ---------------------------------------------------------------- utilitários comuns
def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

M = {}
partes = []

def materiais(cores):
    M.clear()
    for nome, (hexa, rug, met) in cores.items():
        m = bpy.data.materials.new(nome)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*lin(hexa), 1.0)
        b.inputs["Roughness"].default_value = rug
        b.inputs["Metallic"].default_value = met
        M[nome] = m

def _fim(o, mat):
    o.data.materials.clear()
    o.data.materials.append(M[mat])
    partes.append(o)
    return o

def caixa(x0, x1, y0, y1, z0, z1, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fim(o, mat)

def cilindro(r1, r2, alt, loc, lados=12, mat="ferro", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=lados, radius1=r1, radius2=r2, depth=alt, location=loc, rotation=rot)
    return _fim(bpy.context.active_object, mat)

def esfera(r, loc, mat, seg=10, escala=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(4, seg // 2), radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = escala
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _fim(o, mat)

def prisma_xz(pontos, y0, y1, mat):
    """Polígono na vista de frente (XZ) extrudido ao longo de Y."""
    me = bpy.data.meshes.new("p")
    bm = bmesh.new()
    f = [bm.verts.new((x, y0, z)) for x, z in pontos]
    t = [bm.verts.new((x, y1, z)) for x, z in pontos]
    bm.faces.new(list(reversed(f)))
    bm.faces.new(t)
    n = len(pontos)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((f[i], f[j], t[j], t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("p", me)
    bpy.context.scene.collection.objects.link(o)
    return _fim(o, mat)

def telhado4(cx, cy, z, larg, prof, alt, mat):
    """Telhado de quatro águas."""
    cilindro(1.0, 0.0, alt, (cx, cy, z + alt / 2), lados=4, mat=mat, rot=(0, 0, math.pi / 4))
    t = partes[-1]
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    t.scale = (larg / math.sqrt(2), prof / math.sqrt(2), 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def muro_ruina(a, b, esp, hmin, hmax, mat, passo=0.45, semente=1):
    """Muro em ruína: blocos com alturas irregulares ao longo do segmento a-b (planta)."""
    rnd = random.Random(semente)
    a, b = Vector((*a, 0)), Vector((*b, 0))
    d = b - a
    L = d.length
    u = d.normalized()
    n = int(max(1, round(L / passo)))
    for i in range(n):
        p = a + u * (L * i / n)
        q = a + u * (L * (i + 1) / n)
        h = rnd.uniform(hmin, hmax)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(((p + q) / 2).x, ((p + q) / 2).y, h / 2))
        o = bpy.context.active_object
        o.scale = ((q - p).length + 0.01, esp, h)
        o.rotation_euler = (0, 0, math.atan2(u.y, u.x))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        _fim(o, mat)

# ---------------------------------------------------------------- NÍVEL 2: Palácio de Ferro
def pf_materiais():
    materiais({"pedra": ("#B9B2A6", .9, 0), "parede": ("#E3C36E", .85, 0), "ferro": ("#2F5E55", .45, .6),
               "escuro": ("#16201F", .8, 0), "zinco": ("#7E8A93", .5, .5), "vidro": ("#3A5B6E", .2, .2), "branco": ("#EFEDE6", .8, 0)})

def pf_base():
    caixa(-4.3, 4.3, -2.3, 2.3, 0, 0.6, "pedra")           # embasamento de pedra
    caixa(-4.4, 4.4, -2.4, 2.4, 0, 0.12, "escuro")

def pf_colunas():   # rés-do-chão: paredes e colunata de ferro
    caixa(-3.8, 3.8, -1.6, 1.8, 0.6, 3.0, "parede")
    for x in [-3.0, -2.0, 2.0, 3.0]:
        caixa(x - .3, x + .3, -1.63, -1.6, 1.0, 2.5, "vidro")
        caixa(x - .36, x + .36, -1.65, -1.62, 2.5, 2.62, "ferro")
    for i in range(11):
        x = -3.9 + i * 0.78
        cilindro(0.07, 0.07, 2.4, (x, -2.0, 1.8), lados=8, mat="ferro")
    caixa(-4.0, 4.0, -2.1, -1.6, 2.85, 3.0, "ferro")       # viga

def pf_andar():     # primeiro andar: paredes recuadas, janelas altas e colunas
    caixa(-3.6, 3.6, -1.4, 1.6, 3.15, 5.4, "parede")
    for x in [-2.8, -1.4, 1.4, 2.8]:
        caixa(x - .28, x + .28, -1.43, -1.4, 3.6, 4.9, "vidro")
        caixa(x - .34, x + .34, -1.45, -1.42, 4.9, 5.05, "ferro")
    for i in range(11):
        cilindro(0.06, 0.06, 2.25, (-3.9 + i * 0.78, -2.0, 4.27), lados=8, mat="ferro")

def pf_varanda():   # varanda de ferro que dá a volta ao edifício
    caixa(-4.1, 4.1, -2.2, 1.9, 3.0, 3.15, "ferro")
    caixa(-4.1, 4.1, -2.22, -2.15, 3.85, 3.95, "ferro")
    for i in range(41):
        x = -4.05 + i * 0.2025
        caixa(x - .02, x + .02, -2.2, -2.17, 3.15, 3.85, "ferro")
    for i in range(20):                                     # filigrana: argolas
        x = -3.9 + i * 0.41
        cilindro(0.09, 0.09, 0.03, (x, -2.19, 3.5), lados=10, mat="ferro", rot=(math.pi / 2, 0, 0))
    for s in (-1, 1):
        caixa(s * 4.05 - .05, s * 4.05 + .05, -2.2, 1.9, 3.85, 3.95, "ferro")

def pf_telhado():
    caixa(-4.35, 4.35, -2.45, 2.25, 5.35, 5.5, "ferro")    # beiral
    telhado4(0, -0.1, 5.5, 8.9, 4.9, 1.3, "zinco")
    caixa(-0.5, 0.5, -0.6, 0.4, 6.5, 7.0, "branco")        # lanternim
    telhado4(0, -0.1, 7.0, 1.3, 1.3, 0.45, "zinco")

def pf_porta():
    caixa(-0.8, 0.8, -2.12, -2.02, 0.6, 2.75, "ferro")
    caixa(-0.6, 0.6, -2.15, -2.1, 0.6, 2.35, "escuro")
    cilindro(0.6, 0.6, 0.05, (0, -2.13, 2.35), lados=18, mat="escuro", rot=(math.pi / 2, 0, 0))
    prisma_xz([(-0.95, 2.75), (0.95, 2.75), (0, 3.25)], -2.16, -2.04, "ferro")   # frontão

def pf_escadaria():
    for k in range(4):
        caixa(-1.1, 1.1, -2.3 - (k + 1) * 0.28, -2.3, 0, 0.6 - k * 0.15, "pedra")
    for s in (-1, 1):
        caixa(s * 1.15 - .04, s * 1.15 + .04, -3.42, -2.3, 0.6, 1.4, "ferro")

PF = dict(cores=pf_materiais, base=pf_base,
          pecas={"colunas": pf_colunas, "andar": pf_andar, "varanda": pf_varanda,
                 "telhado": pf_telhado, "porta": pf_porta, "escadaria": pf_escadaria},
          vista=("frente", 10.4, 0), dir3q=(0.5, -1.0, 0.45))

# ---------------------------------------------------------------- NÍVEL 3: Mbanza Kongo (Kulumbimbi)
def mbk_materiais():
    materiais({"pedra": ("#9C6A48", .95, 0), "pedra2": ("#7A4E33", .95, 0), "chao": ("#C2A27C", .95, 0),
               "terra": ("#8C6B45", 1, 0), "folha": ("#3E7A3A", .9, 0), "folha2": ("#5A9A45", .9, 0),
               "tronco": ("#6B4A2E", .9, 0), "branco": ("#EDEBE4", .8, 0), "escuro": ("#1E1A16", .9, 0)})

def mbk_base():
    caixa(-2.0, 2.0, -4.0, 3.0, 0, 0.08, "chao")
    for i in range(8):
        caixa(-2.0, 2.0, -4.0 + i * 0.9, -3.98 + i * 0.9, 0.08, 0.1, "pedra2")

def mbk_fachada():  # fachada com o vão da porta em arco
    muro_ruina((-2.5, -4.25), (-0.6, -4.25), 0.5, 2.2, 3.2, "pedra", semente=3)
    muro_ruina((0.6, -4.25), (2.5, -4.25), 0.5, 2.0, 3.0, "pedra", semente=4)
    caixa(-0.6, 0.6, -4.5, -4.0, 2.2, 2.7, "pedra2")       # lintel do arco

def mbk_parede_esq():  # parede esquerda, com contrafortes
    muro_ruina((-2.25, -4.0), (-2.25, 3.0), 0.5, 1.0, 2.6, "pedra", semente=7)
    for y in (-3.0, -0.8, 1.4):
        caixa(-2.9, -2.5, y - .3, y + .3, 0, 1.6, "pedra2")

def mbk_parede_dir():  # parede direita, com uma porta lateral
    muro_ruina((2.25, -4.0), (2.25, -0.6), 0.5, 1.2, 2.4, "pedra", semente=9)
    muro_ruina((2.25, 0.6), (2.25, 3.0), 0.5, 0.8, 2.0, "pedra", semente=10)

def mbk_cabeceira():  # cabeceira (abside) semicircular
    pts = [(math.cos(a) * 2.25, 3.0 + math.sin(a) * 2.25) for a in [i * math.pi / 8 for i in range(9)]]
    for i in range(8):
        muro_ruina(pts[i], pts[i + 1], 0.5, 1.4, 2.8, "pedra", passo=0.9, semente=20 + i)

def mbk_arvore():  # árvore Yala Nkuwu, onde o rei fazia julgamentos
    x, y = -5.2, -1.0
    cilindro(0.45, 0.3, 2.6, (x, y, 1.3), lados=10, mat="tronco")
    for dx, dy, dz, r, m in [(0, 0, 3.1, 1.5, "folha"), (0.9, 0.4, 2.8, 1.0, "folha2"), (-0.8, -0.5, 2.9, 1.1, "folha2"), (0.2, -0.9, 3.4, 0.9, "folha")]:
        esfera(r, (x + dx, y + dy, dz), m, seg=10, escala=(1, 1, .7))

def mbk_tumulos():  # cemitério dos reis do Kongo
    caixa(3.6, 6.8, -0.4, 3.2, 0, 0.3, "pedra2")
    for i, (x, y) in enumerate([(4.4, 0.4), (5.9, 0.4), (4.4, 2.2), (5.9, 2.2)]):
        caixa(x - .4, x + .4, y - .65, y + .65, 0.3, 0.75, "branco")
        caixa(x - .05, x + .05, y + .35, y + .45, 0.75, 1.35, "escuro")
        caixa(x - .25, x + .25, y + .35, y + .45, 1.1, 1.18, "escuro")

MBK = dict(cores=mbk_materiais, base=mbk_base,
           pecas={"fachada": mbk_fachada, "parede_esq": mbk_parede_esq, "parede_dir": mbk_parede_dir,
                  "cabeceira": mbk_cabeceira, "arvore": mbk_arvore, "tumulos": mbk_tumulos},
           vista=("cima", 14.6, 0), dir3q=(0.6, -1.0, 0.9))

# ---------------------------------------------------------------- NÍVEL 4: Museu Nacional da Escravatura
def mne_materiais():
    materiais({"cal": ("#F1EEE6", .9, 0), "pedra": ("#B8A98F", .9, 0), "telha": ("#A8522F", .85, 0),
               "escuro": ("#2A211B", .9, 0), "madeira": ("#6B4226", .8, 0), "terra": ("#A88660", 1, 0)})

def mne_base():
    caixa(-3.6, 3.6, -3.4, 4.2, -0.3, 0, "terra")          # adro no Morro da Cruz
    caixa(-2.3, 2.3, -2.0, 4.0, 0, 0.25, "pedra")

def mne_fachada():
    caixa(-2.1, 2.1, -1.8, 3.8, 0.25, 3.2, "cal")
    for x in (-1.3, 1.3):
        caixa(x - .25, x + .25, -1.83, -1.8, 1.7, 2.6, "escuro")
        caixa(x - .32, x + .32, -1.85, -1.82, 1.6, 1.7, "pedra")
    for s in (-1, 1):
        caixa(s * 2.1 - .18, s * 2.1 + .18, -1.9, -1.6, 0.25, 3.25, "pedra")   # cunhais

def mne_porta():
    caixa(-0.65, 0.65, -1.9, -1.8, 0.25, 2.45, "pedra")
    caixa(-0.48, 0.48, -1.93, -1.88, 0.25, 2.2, "madeira")
    cilindro(0.48, 0.48, 0.05, (0, -1.9, 2.2), lados=16, mat="madeira", rot=(math.pi / 2, 0, 0))

def mne_frontao():
    prisma_xz([(-2.3, 3.2), (2.3, 3.2), (0, 4.5)], -1.88, -1.6, "cal")
    prisma_xz([(-2.45, 3.12), (2.45, 3.12), (2.45, 3.27), (-2.45, 3.27)], -1.95, -1.55, "pedra")
    cilindro(0.28, 0.28, 0.06, (0, -1.9, 3.75), lados=16, mat="escuro", rot=(math.pi / 2, 0, 0))   # óculo

def mne_cruz():
    caixa(-0.08, 0.08, -1.82, -1.66, 4.4, 5.4, "pedra")
    caixa(-0.35, 0.35, -1.82, -1.66, 4.95, 5.1, "pedra")

def mne_telhado():
    caixa(-2.25, 2.25, -1.6, 4.0, 3.15, 3.25, "pedra")
    # duas águas: prisma triangular ao longo de Y
    me = bpy.data.meshes.new("t"); bm = bmesh.new()
    v = [bm.verts.new(p) for p in [(-2.35, -1.6, 3.25), (2.35, -1.6, 3.25), (0, -1.6, 4.4), (-2.35, 4.05, 3.25), (2.35, 4.05, 3.25), (0, 4.05, 4.4)]]
    bm.faces.new((v[0], v[1], v[2])); bm.faces.new((v[5], v[4], v[3]))
    bm.faces.new((v[0], v[3], v[4], v[1])); bm.faces.new((v[1], v[4], v[5], v[2])); bm.faces.new((v[2], v[5], v[3], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("t", me); bpy.context.scene.collection.objects.link(o); _fim(o, "telha")

def mne_pia():  # pia baptismal no adro
    x, y = -2.9, -2.7
    caixa(x - .3, x + .3, y - .3, y + .3, 0, 0.12, "pedra")
    cilindro(0.14, 0.18, 0.7, (x, y, 0.47), lados=10, mat="pedra")
    cilindro(0.42, 0.3, 0.32, (x, y, 0.98), lados=14, mat="pedra")
    cilindro(0.34, 0.34, 0.04, (x, y, 1.13), lados=14, mat="escuro")

MNE = dict(cores=mne_materiais, base=mne_base,
           pecas={"fachada": mne_fachada, "porta": mne_porta, "frontao": mne_frontao,
                  "cruz": mne_cruz, "telhado": mne_telhado, "pia": mne_pia},
           vista=("frente", 8.6, 18), dir3q=(0.55, -1.0, 0.5))

NIVEIS = {"pf": PF, "mbk": MBK, "mne": MNE}

# ---------------------------------------------------------------- construir, renderizar, exportar
def construir(nome, fazer, objs):
    partes.clear()
    fazer()
    bpy.ops.object.select_all(action="DESELECT")
    for o in partes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = o.data.name = nome
    for f in o.data.polygons:
        f.use_smooth = False
    objs[nome] = o

def caixa_mundo(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    mx = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    return mn, mx

def gerar(nivel, cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cena = bpy.context.scene
    saida = os.path.join(RAIZ, "modelos", nivel)
    img = os.path.join(saida, "img")
    os.makedirs(img, exist_ok=True)
    cfg["cores"]()
    objs = {}
    construir("base", cfg["base"], objs)
    for n, f in cfg["pecas"].items():
        construir(n, f, objs)

    cena.render.engine = "CYCLES"
    cena.cycles.device = "CPU"
    cena.cycles.samples = 24
    cena.cycles.use_denoising = False
    cena.render.film_transparent = True
    cena.view_settings.view_transform = "Standard"
    cena.render.image_settings.file_format = "PNG"
    cena.render.image_settings.color_mode = "RGBA"
    mundo = bpy.data.worlds.new("mundo"); mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
    mundo.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    cena.world = mundo
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(40), math.radians(10), math.radians(35)))
    bpy.context.active_object.data.energy = 3.2
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cena.camera = cam

    def so(nome):
        for n, o in objs.items():
            o.hide_render = n != nome

    def render(caminho, w, h):
        cena.render.resolution_x, cena.render.resolution_y = w, h
        cena.render.filepath = caminho
        bpy.ops.render.render(write_still=True)

    # vista do tabuleiro: a mesma câmara ortográfica para todas as peças
    tipo, escala, elev = cfg["vista"]
    tudo_mn = Vector((1e9, 1e9, 1e9)); tudo_mx = Vector((-1e9, -1e9, -1e9))
    for o in objs.values():
        mn, mx = caixa_mundo(o)
        tudo_mn = Vector(map(min, tudo_mn, mn)); tudo_mx = Vector(map(max, tudo_mx, mx))
    centro = (tudo_mn + tudo_mx) / 2
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = escala
    if tipo == "cima":
        cam.location = (centro.x, centro.y, 30)
        cam.rotation_euler = (0, 0, 0)
    else:
        a = math.radians(elev)
        cam.location = (centro.x, centro.y - 30 * math.cos(a), centro.z + 30 * math.sin(a))
        cam.rotation_euler = (math.radians(90) - a, 0, 0)
    for n in objs:
        so(n)
        render(os.path.join(img, f"{n}_cima.png"), 600, 600)

    # três quartos: cada peça sozinha
    cam.data.type = "PERSP"; cam.data.lens = 50; cam.rotation_euler = (0, 0, 0)
    alvo = bpy.data.objects.new("alvo", None); cena.collection.objects.link(alvo)
    c = cam.constraints.new("TRACK_TO"); c.target = alvo; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    for n in cfg["pecas"]:
        so(n)
        mn, mx = caixa_mundo(objs[n])
        dim = max(mx - mn)
        alvo.location = (mn + mx) / 2
        cam.location = alvo.location + Vector(cfg["dir3q"]).normalized() * dim * 2.6
        render(os.path.join(img, f"{n}_3q.png"), 400, 400)

    # exportar .glb (origem no centro da base) e posições na construção montada
    posicoes = {}
    for n, o in objs.items():
        mn, mx = caixa_mundo(o)
        cb = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        o.data.transform(Matrix.Translation(-cb))
        posicoes[n] = [round(cb.x, 4), round(cb.z, 4), round(-cb.y, 4)]
        for x in objs.values():
            x.select_set(False)
        o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(saida, n + ".glb"), export_format="GLB",
                                  use_selection=True, export_apply=True, export_yup=True)
        o.data.transform(Matrix.Translation(cb))
        print(f"[ok] {nivel}/{n}: {len(o.data.polygons)} faces")
    with open(os.path.join(saida, "pecas.json"), "w", encoding="utf-8") as f:
        json.dump(posicoes, f, indent=2)

for nv in PEDIDOS:
    gerar(nv, NIVEIS[nv])
print("[ok] níveis:", ", ".join(PEDIDOS))
