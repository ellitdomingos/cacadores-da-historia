"""
Recorta as vistas de cima das peças e escreve modelos/tabuleiro.js com o lugar de cada peça
no tabuleiro (unidades de 600 × 600, iguais às da imagem renderizada).

Correr depois do Blender:
    python3 ferramentas/recortar_tabuleiro.py
"""
import json
import os
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(RAIZ, "modelos", "img")
PECAS = ["muralha", "portao", "canhao", "azulejos", "baluarte", "estatua"]

slots = {}
for p in PECAS:
    im = Image.open(os.path.join(IMG, f"{p}_cima.png")).convert("RGBA")
    caixa = im.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    x0, y0, x1, y1 = caixa
    im.crop(caixa).save(os.path.join(IMG, f"{p}_peca.png"), optimize=True)
    slots[p] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
    print(p, slots[p])

with open(os.path.join(RAIZ, "modelos", "tabuleiro.js"), "w", encoding="utf-8") as f:
    f.write("// Gerado por ferramentas/recortar_tabuleiro.py — não editar à mão.\n")
    f.write("window.TABULEIRO = " + json.dumps({"w": 600, "h": 600, "slots": slots}, indent=1) + ";\n")
print("[ok] modelos/tabuleiro.js")
