# Caçadores da História: Fortaleza de São Miguel

Protótipo jogável do projecto de exemplo de IHC (FEUAN 2026/27), baseado nos guiões
PL 3–8 (`IHC/pl/guioes`). HTML/CSS/JS sem build; three.js r160 guardado em `vendor/`.

## Estrutura
| Ficheiro | O que é |
|---|---|
| `index.html` | O jogo (ecrãs, regras, equipa, professora) |
| `ra3d.js` | Camada 3D (three.js): peças por cima da câmara, peça a rodar na curiosidade, fortaleza montada no fim |
| `ferramentas/gerar_pecas.py` | Script do Blender que cria as 6 peças low-poly |
| `modelos/*.glb`, `modelos/pecas.json` | Peças e base exportadas, e a posição de cada uma na fortaleza montada |
| `modelos/img/`, `modelos/tabuleiro.js` | Renderizações (planta e três quartos) e o lugar de cada peça no tabuleiro |
| `sw.js`, `manifest.webmanifest` | Funcionar offline / instalar no ecrã inicial |

## Modelos 3D (Blender)
```bash
blender --background --python ferramentas/gerar_pecas.py   # modelos .glb + renderizações
python3 ferramentas/recortar_tabuleiro.py                   # recorta as peças e escreve modelos/tabuleiro.js
```
A fortaleza segue a planta real em **estrela de quatro pontas** (sistema abaluartado): baluartes com
guaritas e parapeitos com canhoneiras, cortinas, pátio, casa do governador, casamata dos azulejos e
estátuas no pátio. As proporções e as cores são aproximadas e devem ser afinadas com fotografias do local.
O tabuleiro 2D é a **planta vista de cima**, e as imagens das peças são renderizações dos próprios modelos.
Para mudar uma peça, editar a função dela no script (`baluarte_canto()`, `portao()`…) e voltar a correr os dois comandos.
Também se podem abrir os `.glb` no Blender, melhorá-los à mão e exportá-los de novo com o mesmo nome
(origem no centro da base, Y para cima). Se não houver WebGL, o jogo usa os desenhos 2D.

## Publicar no GitHub Pages
1. Em https://github.com/new criar um repositório **público** chamado `cacadores-da-historia` (sem README).
2. Nesta pasta:
   ```bash
   git remote add origin https://github.com/<utilizador>/cacadores-da-historia.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Ao fim de 1–2 minutos o jogo fica em `https://<utilizador>.github.io/cacadores-da-historia/` (https, por isso
   a câmara, o giroscópio, a RA no chão e o QR da turma funcionam no telemóvel).

Para actualizar: `git add -A && git commit -m "…" && git push`. O jogo vai primeiro à rede, por isso
os telemóveis apanham a versão nova da próxima vez que o abrirem com internet.

## Como correr
```bash
python3 -m http.server 8080      # ou: npx http-server
```
- No computador: abrir http://localhost:8080 (rodar com ◀ ▶, arrastar ou com as setas do teclado).
- No telemóvel: a câmara e o giroscópio exigem **https**. Por exemplo,
  `npx localtunnel --port 8080` ou `cloudflared tunnel --url http://localhost:8080`.
  Abrir o endereço uma vez com rede: depois funciona sem internet (service worker).

## O que está implementado (ligação ao dossier)
| Dossier | No protótipo |
|---|---|
| Ecrã 1 Procurar: radar (A1), quente/frio (C1), "Mais perto!" (DC3) | RA por orientação: câmara traseira + giroscópio; as peças estão à volta do jogador (serve também de **modo sentado**, R14) |
| Ecrã 2 Peça encontrada: contorno escuro, vibração + som (M2), **Fixar** | ✓ |
| Ecrã 3 Pergunta: curiosidade em áudio + legenda (R8, R13), 3 respostas, certo/errado já com a resposta certa | Voz por `speechSynthesis`; a pergunta só abre depois da curiosidade (D1); só a resposta certa dá pontos |
| Ecrã 4 Montar: tabuleiro 2D (D2), íman (DC1), rodar com um toque (DC2) | ✓ |
| Modo de equipa, papéis Aponta/Responde/Monta, "Passa a…" (D3, R4) | 1 a 3 jogadores num telemóvel |
| Sem RA: fotografias dos locais (B2) | O "Estou aqui" serve para as salas fechadas (sem GPS) |
| Código da turma e resumo para a professora (R5, R10) | O resultado vai por WhatsApp como uma linha `CH1;…`, e a professora cola-a no resumo |
| R6 só alcunha · R7 contraste alto · alvos ≥ 48 px · R11 offline | ✓ |
| Modo família (D5): o avô ou a avó conta a história, e os netos procuram, respondem e montam | Botão "👴🏾 Família" no novo jogo |
| QR da turma (interacção 8) | O QR abre o jogo com `?turma=CÓDIGO` já preenchido (`vendor/qrcode.js`, MIT) |
| Metas da secção 5.3 / PL 14 | Registo automático (1.ª peça, montar, respostas, ajudas no jogo, encaixes falhados), questionário SUS no fim, tabela comparada com as metas e CSV (Área da professora → 3) |
| Instalar no Android | `icon-192.png`, `icon-512.png` (gerados a partir da planta da fortaleza) |

## Limitações (para discutir nas aulas)
- **RA no chão (WebXR)** só em Android com ARCore e Chrome, em **https**: aponta-se para o chão, toca-se
  no ecrã quando aparece o círculo amarelo e as peças ficam pousadas no chão real, a 2 m, à volta do jogador.
  Cada vez que se volta a entrar na RA (depois de responder), as peças restantes são pousadas de novo.
  No iPhone (o Safari não tem WebXR) e nos outros aparelhos fica a RA por **orientação** (peças a 3 m, sem chão).
- Ainda não há reconhecimento por imagem nas salas fechadas.
- Os modelos são simplificados (blocos low-poly), não uma réplica da fortaleza real.
- Não há servidor: o resumo da turma junta os resultados guardados neste aparelho e os que a professora colar.
- As "fotografias" do modo sem RA são desenhos das peças. Para a visita real, substituir por fotos do local.
