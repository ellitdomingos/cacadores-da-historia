# Caçadores da História

Protótipo jogável do projecto de exemplo de IHC (FEUAN 2026/27), baseado nos guiões
PL 3–8 (`IHC/pl/guioes`). HTML/CSS/JS sem build; three.js r160 guardado em `vendor/`.

## Estrutura
| Ficheiro | O que é |
|---|---|
| `index.html` | O jogo (ecrãs, regras, equipa, professora) |
| `ra3d.js` | Camada 3D (three.js): peças por cima da câmara, peça a rodar na curiosidade, monumento montado no fim, RA no chão (WebXR) |
| `ferramentas/gerar_pecas.py` | Blender: nível 1, Fortaleza de São Miguel |
| `ferramentas/gerar_niveis.py` | Blender: níveis 2–4 (Palácio de Ferro, Mbanza Kongo, Museu Nacional da Escravatura) |
| `modelos/<nível>/` | Peças e base (.glb), posições (`pecas.json`) e renderizações (`img/`) de cada nível |
| `modelos/tabuleiros.js` | O lugar de cada peça no tabuleiro de cada nível (gerado) |
| `sw.js`, `manifest.webmanifest` | Funcionar offline / instalar no ecrã inicial |
| `instalar/cacadores-da-historia.apk` | A app Android (Trusted Web Activity: abre o jogo no Chrome em ecrã inteiro) |
| `android/twa-manifest.json` | Configuração da app Android (Bubblewrap); o resto da pasta é gerado e não vai para o git |
| `vendor/fredoka.woff2` | Letra Fredoka (títulos e botões), SIL OFL 1.1 |

## Modelos 3D (Blender)
```bash
blender --background --python ferramentas/gerar_pecas.py    # nível 1 (fortaleza)
blender --background --python ferramentas/gerar_niveis.py   # níveis 2 a 4 (ou: -- pf mbk mne)
python3 ferramentas/recortar_tabuleiro.py                    # recorta as peças e escreve modelos/tabuleiros.js
```

## Níveis
| # | Monumento | Tabuleiro | Peças |
|---|---|---|---|
| 1 | Fortaleza de São Miguel (Luanda) | planta em estrela | baluartes, portão, canhão, casamata dos azulejos, estátua |
| 2 | Palácio de Ferro (Luanda) | vista de frente | colunas, andar de cima, varanda, telhado, porta, escadaria |
| 3 | Mbanza Kongo, ruínas da Kulumbimbi (Zaire) | planta | fachada, paredes, cabeceira, árvore Yala Nkuwu, túmulos dos reis |
| 4 | Museu Nacional da Escravatura, Capela da Casa Grande (Luanda) | vista de frente | fachada, telhado, porta, frontão, cruz, pia baptismal |

Ciclo de jogo: concluir um nível desbloqueia o seguinte ("Próximo nível"). O QR da professora leva
`?turma=…&nivel=…` e abre o monumento da visita, mesmo bloqueado. Os textos de cada nível estão em
`NIVEIS` no `index.html` e **devem ser revistos por um professor de História**; as formas 3D são aproximadas.
A fortaleza segue a planta real em **estrela de quatro pontas** (sistema abaluartado): baluartes com
guaritas e parapeitos com canhoneiras, cortinas, pátio, casa do governador, casamata dos azulejos e
estátuas no pátio. As proporções e as cores são aproximadas e devem ser afinadas com fotografias do local.
O tabuleiro 2D é a **planta vista de cima**, e as imagens das peças são renderizações dos próprios modelos.
Para mudar uma peça, editar a função dela no script (`baluarte_canto()`, `portao()`…) e voltar a correr os dois comandos.
Também se podem abrir os `.glb` no Blender, melhorá-los à mão e exportá-los de novo com o mesmo nome
(origem no centro da base, Y para cima). Se não houver WebGL, o jogo usa os desenhos 2D.

## Instalar no telemóvel
- **Android:** https://ellitdomingos.github.io/cacadores-da-historia/instalar/cacadores-da-historia.apk
  (ou, no jogo, Definições → Instalar a app). É preciso permitir "instalar apps desta origem".
  A app é só uma janela do Chrome para o site, por isso as actualizações do jogo chegam sem reinstalar.
- **iPhone:** Safari → Partilhar → Adicionar ao ecrã principal.
- `?instalar` no fim do link abre logo o painel de instalação.

Para gerar de novo o APK (Java 21 e SDK Android; a chave fica em `~/.android-chaves/`, **fora do repositório**):
```bash
cd android && bubblewrap update --skipVersionUpgrade
BUBBLEWRAP_KEYSTORE_PASSWORD=$(cat ~/.android-chaves/senha.txt) BUBBLEWRAP_KEY_PASSWORD=$(cat ~/.android-chaves/senha.txt) bubblewrap build --skipPwaValidation
cp app-release-signed.apk ../instalar/cacadores-da-historia.apk
```
Para a app abrir **sem barra de endereço**, o ficheiro `.well-known/assetlinks.json` (com a impressão digital
SHA-256 da chave) tem de estar na raiz do domínio: `https://ellitdomingos.github.io/.well-known/assetlinks.json`,
ou seja, num repositório `ellitdomingos.github.io` (com `.nojekyll`).

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
- No computador: abrir http://localhost:8080 (rodar com ◀ ▶ ou ← →, **andar com ↑** ou com o botão das pegadas).
- No telemóvel: a câmara e o giroscópio exigem **https**. Por exemplo,
  `npx localtunnel --port 8080` ou `cloudflared tunnel --url http://localhost:8080`.
  Abrir o endereço uma vez com rede: depois funciona sem internet (service worker).

## O que está implementado (ligação ao dossier)
| Dossier | No protótipo |
|---|---|
| Ecrã 1 Procurar: radar (A1), quente/frio (C1), "Mais perto!" (DC3) | RA por orientação: câmara traseira + giroscópio + **contador de passos** (acelerómetro). As peças estão a 4–14 m (sala: 2–7 m) e só aparecem a menos de 4 m; apanha-se a menos de 1,6 m. No modo família ficam à volta, a rodar no lugar (**modo sentado**, R14) |
| Duas versões de procurar (além de "sem câmara") | **Realidade aumentada** (câmara + passos, ou RA no chão com ARCore) e **Com personagem**: a Kiala anda pelo monumento em 3D, guiada por um joystick que aparece onde se toca (ou setas/WASD); seta por cima da cabeça, feixes de luz nas peças, radar e dicas faladas |
| Cronómetro | Tempo de jogo sempre visível (pára na pausa); tempo final no fim e melhor tempo por nível em cada conta |
| Ecrã 2 Peça encontrada: contorno escuro, vibração + som (M2), **Fixar** | ✓ |
| Ecrã 3 Pergunta: curiosidade em áudio + legenda (R8, R13), 3 respostas, certo/errado já com a resposta certa | Voz por `speechSynthesis`; a pergunta só abre depois da curiosidade (D1); só a resposta certa dá pontos |
| Ecrã 4 Montar: tabuleiro 2D (D2), íman (DC1), rodar com um toque (DC2) | ✓ |
| Modo de equipa, papéis Aponta/Responde/Monta, "Passa a…" (D3, R4) | 1 a 3 jogadores num telemóvel |
| Sem RA: fotografias dos locais (B2) | O "Estou aqui" serve para as salas fechadas (sem GPS) |
| Código da turma e resumo para a professora (R5, R10) | O resultado vai por WhatsApp como uma linha `CH1;…`, e a professora cola-a no resumo |
| R6 só alcunha · R7 contraste alto · alvos ≥ 48 px · R11 offline | ✓ |
| Modo família (D5): o avô ou a avó conta a história, e os netos procuram, respondem e montam | Opção "Família" ao configurar o jogo |
| Guardar o progresso sem repetir o que já se fez | Contas locais (alcunha, cor, PIN opcional): "Continuar", "Reiniciar o nível" e "Recomeçar tudo" |
| Orientação (IHC): para onde andar, como apanhar, como montar | Pegadas e setas para o lado da peça, mão animada, demonstração de apanhar e de montar, dica depois de 2 encaixes falhados |
| QR da turma (interacção 8) | O QR abre o jogo com `?turma=CÓDIGO` já preenchido (`vendor/qrcode.js`, MIT) |
| Metas da secção 5.3 / PL 14 | Registo automático (1.ª peça, montar, respostas, ajudas no jogo, encaixes falhados), questionário SUS no fim, tabela comparada com as metas e CSV (Área da professora → 3) |
| Instalar no Android | `icon-192.png`, `icon-512.png` (gerados a partir da planta da fortaleza) |

## Limitações (para discutir nas aulas)
- **RA no chão (WebXR)** só em Android com ARCore e Chrome, em **https**: aponta-se para o chão, toca-se
  no ecrã quando aparece o círculo amarelo e as peças ficam pousadas no chão real, entre 2,5 e 6 m, à volta
  do jogador (metade disso no espaço "sala pequena"). Só se apanha uma peça a menos de 1,8 m dela, por isso
  joga-se **de pé, a andar**. Cada vez que se volta a entrar na RA (depois de responder), as peças restantes
  são pousadas de novo.
  No iPhone (o Safari não tem WebXR) e nos outros aparelhos fica a RA por **orientação** (peças a 3 m, sem chão).
- Ainda não há reconhecimento por imagem nas salas fechadas.
- Os modelos são simplificados (blocos low-poly), não réplicas dos monumentos reais.
- Não há servidor: o resumo da turma junta os resultados guardados neste aparelho e os que a professora colar.
- As "fotografias" do modo sem RA são desenhos das peças. Para a visita real, substituir por fotos do local.
