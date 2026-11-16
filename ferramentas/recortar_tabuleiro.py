"""
Recorta a vista do tabuleiro de cada peça e escreve modelos/tabuleiros.js com o lugar
de cada peça (unidades de 600 × 600, iguais às da imagem renderizada).

Correr depois do Blender:
    python3 ferramentas/recortar_tabuleiro.py
"""
import json
import os
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NIVEIS = {
    "fsm": ["muralha", "portao", "canhao", "azulejos", "baluarte", "estatua"],
    "pf": ["colunas", "andar", "varanda", "telhado", "porta", "escadaria"],
    "mbk": ["fachada", "parede_esq", "parede_dir", "cabeceira", "arvore", "tumulos"],
    "mne": ["fachada", "porta", "frontao", "cruz", "telhado", "pia"],
}

tab = {}
for nivel, pecas in NIVEIS.items():
    img = os.path.join(RAIZ, "modelos", nivel, "img")
    slots = {}
    for p in pecas:
        im = Image.open(os.path.join(img, f"{p}_cima.png")).convert("RGBA")
        caixa = im.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
        im.crop(caixa).save(os.path.join(img, f"{p}_peca.png"), optimize=True)
        x0, y0, x1, y1 = caixa
        slots[p] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
    tab[nivel] = {"w": 600, "h": 600, "slots": slots}
    # miniatura: o monumento montado (base + peças), para a lista de níveis
    mont = Image.open(os.path.join(img, "base_cima.png")).convert("RGBA")
    for p in pecas:
        mont.alpha_composite(Image.open(os.path.join(img, f"{p}_cima.png")).convert("RGBA"))
    mont = mont.crop(mont.getchannel("A").getbbox())
    mont.thumbnail((240, 240), Image.LANCZOS)
    mont.save(os.path.join(img, "miniatura.png"), optimize=True)
    print(nivel, slots)

with open(os.path.join(RAIZ, "modelos", "tabuleiros.js"), "w", encoding="utf-8") as f:
    f.write("// Gerado por ferramentas/recortar_tabuleiro.py — não editar à mão.\n")
    f.write("window.TABULEIROS = " + json.dumps(tab) + ";\n")
print("[ok] modelos/tabuleiros.js")
