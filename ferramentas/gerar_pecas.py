"""
Gera a Fortaleza de São Miguel (low-poly) em Blender: a base fixa e as 6 peças do jogo.

Correr (sem abrir a interface):
    blender --background --python ferramentas/gerar_pecas.py
    python3 ferramentas/recortar_tabuleiro.py

Saída (pasta modelos/):
    <id>.glb            uma peça por ficheiro (origem no centro da base, Y para cima)
    base.glb            o resto da fortaleza (baluartes de trás, cortinas, pátio, casa do governador)
    pecas.json          posição de cada peça na fortaleza montada (coordenadas glTF)
    img/<id>_cima.png   vista de cima (planta), todas com a mesma câmara -> tabuleiro 2D
    img/<id>_3q.png     vista a três quartos -> "fotografia" da peça
    img/base_cima.png   fundo do tabuleiro

Forma (fontes: Wikipédia PT "Fortaleza de São Miguel de Luanda"): planta em estrela de quatro
pontas (sistema abaluartado), muros de pedra e cal, casa do governador entre os baluartes,
casamata com painéis de azulejos, estátuas no pátio, muitas canhoneiras.
As proporções e as cores são aproximadas: afinar com fotografias do local.

Convenções: metros; Z para cima; a frente (portão) está virada para -Y.
"""
import bpy
import bmesh
import json
import math
import os
from mathutils import Matrix, Vector

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "modelos")
IMG = os.path.join(SAIDA, "img")
os.makedirs(IMG, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

# ---------------------------------------------------------------- materiais (cores sRGB)
def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def material(nome, hexa, rug=0.9, metal=0.0):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(hexa), 1.0)
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    return m

M = {
    "pedra":   material("pedra",   "#D9C4A0"),   # reboco de pedra e cal
    "pedra2":  material("pedra2",  "#A58A63"),   # cantaria / rodapé
    "chao":    material("chao",    "#B8A07A"),   # pátio
    "escuro":  material("escuro",  "#1A1A1A"),
    "branco":  material("branco",  "#F2F0EA"),
    "azul":    material("azul",    "#1F4FA8", 0.35),
    "telha":   material("telha",   "#A0482A"),
    "metal":   material("metal",   "#2B2B2B", 0.45, 0.8),
    "madeira": material("madeira", "#5A3A1E"),
    "bronze":  material("bronze",  "#3E5B4A", 0.5, 0.6),
}

partes = []

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

def prisma_xy(pontos, z0, z1, mat):
    """Polígono na planta (XY), extrudido em altura."""
    me = bpy.data.meshes.new("p")
    bm = bmesh.new()
    baixo = [bm.verts.new((x, y, z0)) for x, y in pontos]
    cima = [bm.verts.new((x, y, z1)) for x, y in pontos]
    bm.faces.new(list(reversed(baixo)))
    bm.faces.new(cima)
    n = len(pontos)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((baixo[i], baixo[j], cima[j], cima[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("p", me)
    cena.collection.objects.link(o)
    return _fim(o, mat)

def cilindro(r1, r2, alt, loc, lados=12, mat="pedra", rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=lados, radius1=r1, radius2=r2, depth=alt, location=loc, rotation=rot)
    return _fim(bpy.context.active_object, mat)

def esfera(r, loc, mat, seg=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2 + 1, radius=r, location=loc)
    return _fim(bpy.context.active_object, mat)

def muro(a, b, esp, z0, z1, mat="pedra"):
    """Muro recto de a=(x,y) até b=(x,y)."""
    a, b = Vector((*a, 0)), Vector((*b, 0))
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=((a + b) / 2).to_tuple()[:2] + ((z0 + z1) / 2,))
    o = bpy.context.active_object
    o.scale = (d.length, esp, z1 - z0)
    o.rotation_euler = (0, 0, math.atan2(d.y, d.x))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _fim(o, mat)

def parapeito(a, b, z, alt=0.16, esp=0.12, merlao=0.34, vao=0.14, recuo=0.0):
    """Parapeito com canhoneiras (vãos) ao longo do segmento a-b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    u = d.normalized()
    n = Vector((-u.y, u.x)) * recuo
    t = 0.0
    while t < L - 1e-3:
        t1 = min(L, t + merlao)
        p, q = a + u * t + n, a + u * t1 + n
        muro(p.to_tuple(), q.to_tuple(), esp, z, z + alt)
        t = t1 + vao

def guarita(x, y, z):
    cilindro(0.15, 0.15, 0.42, (x, y, z + 0.21), lados=10, mat="pedra")
    cilindro(0.18, 0.18, 0.04, (x, y, z + 0.44), lados=10, mat="pedra2")
    esfera(0.15, (x, y, z + 0.46), "pedra", seg=10)
    caixa(x - 0.05, x + 0.05, y - 0.16, y + 0.16, z + 0.18, z + 0.32, "escuro")

ALT_CORTINA = 1.0
ALT_BALUARTE = 1.1

def baluarte_canto(sx, sy):
    """Baluarte em forma de ponta de lança no canto (sx, sy) = (±1, ±1)."""
    P = [(sx * 1.2, sy * 1.5), (sx * 1.2, sy * 2.7), (sx * 3.3, sy * 3.3), (sx * 2.7, sy * 1.2), (sx * 1.5, sy * 1.2)]
    prisma_xy(P, 0.0, ALT_BALUARTE, "pedra")
    # rodapé em talude (mais largo em baixo)
    Q = [(sx * 1.15, sy * 1.5), (sx * 1.15, sy * 2.78), (sx * 3.42, sy * 3.42), (sx * 2.78, sy * 1.15), (sx * 1.5, sy * 1.15)]
    prisma_xy(Q, 0.0, 0.22, "pedra2")
    z = ALT_BALUARTE
    for a, b in [((sx * 1.2, sy * 2.0), (sx * 1.2, sy * 2.7)), ((sx * 1.2, sy * 2.7), (sx * 3.3, sy * 3.3)),
                 ((sx * 3.3, sy * 3.3), (sx * 2.7, sy * 1.2)), ((sx * 2.7, sy * 1.2), (sx * 2.0, sy * 1.2))]:
        parapeito(a, b, z)
    guarita(sx * 3.08, sy * 3.08, z)

def cortina(eixo, sinal, x0, x1, base=True):
    """Cortina (muro entre baluartes). eixo 'y': muro da frente/trás; 'x': muro lateral."""
    if eixo == "y":
        y0, y1 = sorted((sinal * 1.5, sinal * 2.0))
        caixa(x0, x1, y0, y1, 0, ALT_CORTINA, "pedra")
        caixa(x0, x1, min(y0, y1) - (0.04 if sinal < 0 else 0), max(y0, y1) + (0.04 if sinal > 0 else 0), 0, 0.2, "pedra2")
        yp = sinal * 1.94
        parapeito((x0, yp), (x1, yp), ALT_CORTINA)
    else:
        xa, xb = sorted((sinal * 1.5, sinal * 2.0))
        caixa(xa, xb, x0, x1, 0, ALT_CORTINA, "pedra")
        caixa(xa - (0.04 if sinal < 0 else 0), xb + (0.04 if sinal > 0 else 0), x0, x1, 0, 0.2, "pedra2")
        xp = sinal * 1.94
        parapeito((xp, x0), (xp, x1), ALT_CORTINA)

# ---------------------------------------------------------------- base fixa
def base():
    caixa(-1.5, 1.5, -1.5, 1.5, 0, 0.05, "chao")              # pátio
    cortina("y", +1, -1.2, 1.2)                                  # muro de trás
    cortina("x", -1, -1.2, 1.2)                                  # muro esquerdo
    cortina("x", +1, -1.2, 1.2)                                  # muro direito
    baluarte_canto(-1, +1)
    baluarte_canto(+1, +1)
    # casa do governador (entre os baluartes de trás)
    caixa(-1.0, 1.0, 0.75, 1.5, 0, 1.25, "branco")
    caixa(-1.02, 1.02, 0.73, 1.52, 0, 0.12, "pedra2")
    for x in (-0.7, -0.35, 0.0, 0.35, 0.7):
        caixa(x - 0.08, x + 0.08, 0.72, 0.75, 0.75, 1.0, "escuro")
        caixa(x - 0.08, x + 0.08, 0.72, 0.75, 0.25, 0.5, "escuro")
    cilindro(1.0, 0.0, 0.45, (0, 1.125, 1.475), lados=4, mat="telha", rot=(0, 0, math.pi / 4))
    t = partes[-1]
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)  # primeiro rodar…
    t.scale = (2.15 / math.sqrt(2), 0.9 / math.sqrt(2), 1.0)                  # …depois esticar (2,15 × 0,9 m)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# ---------------------------------------------------------------- peças
def muralha():   # baluarte da frente, à esquerda
    baluarte_canto(-1, -1)

def baluarte():  # baluarte da frente, à direita (virado à baía)
    baluarte_canto(+1, -1)

def portao():    # cortina da frente com o portão
    cortina("y", -1, -1.2, 1.2)
    caixa(-0.42, 0.42, -2.06, -1.98, 0.0, 0.82, "pedra2")       # moldura em cantaria
    caixa(-0.26, 0.26, -2.08, -1.99, 0.0, 0.5, "escuro")        # porta
    cilindro(0.26, 0.26, 0.09, (0, -2.035, 0.5), lados=16, mat="escuro", rot=(math.pi / 2, 0, 0))
    caixa(-0.16, 0.16, -2.09, -2.05, 0.62, 0.78, "branco")      # pedra de armas
    # frontão triangular
    me = bpy.data.meshes.new("frontao"); bm = bmesh.new()
    v = [bm.verts.new(p) for p in [(-0.5, -2.07, 0.82), (0.5, -2.07, 0.82), (0, -2.07, 1.08),
                                   (-0.5, -1.97, 0.82), (0.5, -1.97, 0.82), (0, -1.97, 1.08)]]
    bm.faces.new((v[0], v[1], v[2])); bm.faces.new((v[5], v[4], v[3]))
    bm.faces.new((v[0], v[3], v[4], v[1])); bm.faces.new((v[1], v[4], v[5], v[2])); bm.faces.new((v[2], v[5], v[3], v[0]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("frontao", me); cena.collection.objects.link(o); _fim(o, "pedra2")

def canhao():    # construído na origem a apontar para -Y; depois rodado e levado para o baluarte
    caixa(-0.17, 0.17, -0.22, 0.22, 0.0, 0.14, "madeira")
    for x in (-0.19, 0.19):
        for y in (-0.13, 0.13):
            cilindro(0.09, 0.09, 0.05, (x, y, 0.08), lados=10, mat="madeira", rot=(0, math.pi / 2, 0))
    cilindro(0.085, 0.06, 0.75, (0, -0.2, 0.22), lados=12, mat="metal", rot=(math.radians(84), 0, 0))
    esfera(0.08, (0, 0.17, 0.205), "metal", seg=8)

def azulejos():  # casamata encostada ao muro esquerdo, painel de azulejos virado ao pátio
    caixa(-1.5, -0.85, -0.95, 0.55, 0, 0.72, "branco")
    caixa(-1.5, -0.83, -0.95, 0.55, 0.72, 0.8, "pedra2")        # cornija / terraço
    for j in range(3):
        for i in range(10):
            if (i + j) % 2 == 0:
                y = -0.88 + i * 0.14; z = 0.14 + j * 0.13
                caixa(-0.86, -0.83, y, y + 0.11, z, z + 0.11, "azul")
    # porta em arco
    caixa(-0.86, -0.82, -0.12, 0.12, 0.0, 0.5, "pedra2")
    caixa(-0.85, -0.81, -0.08, 0.08, 0.0, 0.42, "escuro")

def estatua():   # estátua no pátio (pedestal + figura em bronze)
    x, y = 0.35, -0.55
    caixa(x - 0.2, x + 0.2, y - 0.2, y + 0.2, 0.05, 0.13, "pedra2")
    caixa(x - 0.14, x + 0.14, y - 0.14, y + 0.14, 0.13, 0.48, "pedra")
    caixa(x - 0.17, x + 0.17, y - 0.17, y + 0.17, 0.48, 0.53, "pedra2")
    cilindro(0.11, 0.07, 0.5, (x, y, 0.78), lados=10, mat="bronze")
    esfera(0.075, (x, y, 1.1), "bronze", seg=10)
    muro((x + 0.06, y), (x + 0.3, y - 0.05), 0.05, 0.92, 0.97, "bronze")   # braço estendido

PECAS = {"muralha": muralha, "portao": portao, "canhao": canhao,
         "azulejos": azulejos, "baluarte": baluarte, "estatua": estatua}
# transformação depois de construir (o canhão vai para cima do baluarte da frente-direita, a apontar à baía)
DEPOIS = {"canhao": Matrix.Translation((2.45, -2.45, ALT_BALUARTE)) @ Matrix.Rotation(math.radians(45), 4, "Z")}

# ---------------------------------------------------------------- construir
objs = {}
def construir(nome, fazer):
    partes.clear()
    fazer()
    bpy.ops.object.select_all(action="DESELECT")
    for o in partes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = o.data.name = nome
    if nome in DEPOIS:
        o.data.transform(DEPOIS[nome])
    for f in o.data.polygons:
        f.use_smooth = False
    objs[nome] = o

construir("base", base)
for n, f in PECAS.items():
    construir(n, f)

def centro_base(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2,
                   (min(c.y for c in cs) + max(c.y for c in cs)) / 2,
                   min(c.z for c in cs))), cs

# ---------------------------------------------------------------- renderizações
cena.render.engine = "CYCLES"
cena.cycles.device = "CPU"
cena.cycles.samples = 24
cena.cycles.use_denoising = False
cena.render.film_transparent = True
cena.view_settings.view_transform = "Standard"
cena.render.image_settings.file_format = "PNG"
cena.render.image_settings.color_mode = "RGBA"

mundo = bpy.data.worlds.new("mundo")
mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
mundo.node_tree.nodes["Background"].inputs[1].default_value = 0.9
cena.world = mundo
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(40), math.radians(10), math.radians(35)))
bpy.context.active_object.data.energy = 3.2

bpy.ops.object.camera_add()
cam = bpy.context.active_object
cena.camera = cam
alvo = bpy.data.objects.new("alvo", None)
cena.collection.objects.link(alvo)

def so(nome):
    for n, o in objs.items():
        o.hide_render = n != nome

def render(caminho, w, h):
    cena.render.resolution_x, cena.render.resolution_y = w, h
    cena.render.filepath = caminho
    bpy.ops.render.render(write_still=True)

# vista de cima: a mesma câmara para todas -> as peças encaixam no tabuleiro
cam.data.type = "ORTHO"
cam.data.ortho_scale = 7.4
cam.location = (0, 0, 10)
cam.rotation_euler = (0, 0, 0)
for n in objs:
    so(n)
    render(os.path.join(IMG, f"{n}_cima.png"), 600, 600)

# três quartos: cada peça enquadrada sozinha
cam.data.type = "PERSP"
cam.data.lens = 50
c = cam.constraints.new("TRACK_TO")
c.target = alvo
c.track_axis = "TRACK_NEGATIVE_Z"
c.up_axis = "UP_Y"
for n in PECAS:
    so(n)
    cb, cs = centro_base(objs[n])
    dim = max(max(v.x for v in cs) - min(v.x for v in cs), max(v.y for v in cs) - min(v.y for v in cs), max(v.z for v in cs) - min(v.z for v in cs))
    meio = cb + Vector((0, 0, (max(v.z for v in cs) - cb.z) / 2))
    alvo.location = meio
    cam.location = meio + Vector((0.55, -1.0, 0.75)).normalized() * dim * 2.6
    render(os.path.join(IMG, f"{n}_3q.png"), 400, 400)

# ---------------------------------------------------------------- exportar .glb
posicoes = {}
for n, o in objs.items():
    cb, _ = centro_base(o)
    o.data.transform(Matrix.Translation(-cb))
    posicoes[n] = [round(cb.x, 4), round(cb.z, 4), round(-cb.y, 4)]   # Blender -> glTF (x, z, -y)
    for x in objs.values():
        x.select_set(False)
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(SAIDA, n + ".glb"), export_format="GLB",
                              use_selection=True, export_apply=True, export_yup=True)
    o.data.transform(Matrix.Translation(cb))
    print(f"[ok] {n}: {len(o.data.polygons)} faces, posição {posicoes[n]}")

with open(os.path.join(SAIDA, "pecas.json"), "w", encoding="utf-8") as f:
    json.dump(posicoes, f, indent=2)
print("[ok] modelos/pecas.json")
