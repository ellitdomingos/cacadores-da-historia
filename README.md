# Caçadores da História

Protótipo jogável do projecto de exemplo de IHC (FEUAN 2026/27), baseado nos guiões
PL 3–8 (`IHC/pl/guioes`). HTML/CSS/JS sem build; three.js r160 guardado em `vendor/`.

## Estrutura
| Ficheiro | O que é |
|---|---|
| `index.html` | O jogo (ecrãs, regras, modos, equipa, recordes) |
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

Ciclo de jogo: concluir um nível desbloqueia o seguinte ("Próximo nível"). Em "Níveis" há os **Recordes**
(5 melhores tempos de cada monumento neste aparelho). Os textos de cada nível estão em
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

## Jogar no navegador do telemóvel (o que é preciso permitir)
Não é preciso activar nenhuma opção escondida do navegador. Basta abrir o jogo pelo link **https**
(o do GitHub Pages) e aceitar as autorizações que o jogo pede.

**O que o jogo pede quando se começa o modo de Realidade Aumentada (RA):**
- **Câmara:** o navegador pergunta se o jogo pode usar a câmara. Escolher "Permitir". Se for recusada,
  o jogo continua com um fundo desenhado.
- **Sensores de movimento (giroscópio/bússola):**
  - **Android/Chrome:** já vêm ligados. Só se foram desligados antes é preciso verificar em
    Definições do site → Sensores de movimento.
  - **iPhone/Safari:** aparece "Permitir acesso ao movimento". Tocar em "Permitir". Sem sensores,
    o jogo mostra setas no ecrã.

**Coisas que podem falhar:**
- **Link sem https** (por exemplo, `http://192.168…` a partir do PC): a câmara e os sensores ficam
  bloqueados. Usar sempre o link https.
- **Câmara bloqueada por engano:** tocar no cadeado ao lado do endereço → Permissões → Câmara →
  Permitir, e recarregar a página.
- **Navegação privada/anónima:** o progresso e os recordes não ficam guardados.
- **RA no chão (WebXR):** só em Android com Chrome e "Google Play Services para RA" (ARCore)
  instalado. No iPhone não existe, e o jogo usa a RA por orientação.
- **Voz em português:** se não se ouvir, instalar uma voz portuguesa em Definições → Texto para voz.
- **Jogar sem internet:** abrir o jogo uma vez com internet. No Chrome também se pode usar o menu →
  "Instalar aplicação".

**Para testar um telemóvel:** abrir o link com `?ferramentas` no fim
(`https://ellitdomingos.github.io/cacadores-da-historia/?ferramentas`) e usar "Verificar este telemóvel".
Mostra se a câmara, o giroscópio, a RA, a voz, o guardar do progresso e o jogo sem internet funcionam
nesse aparelho.

## Publicar no GitHub Pages
1. Em https://github.com/new criar um repositório **público** chamado `cacadores-da-historia` (sem README).
2. Nesta pasta:
   ```bash
   git remote add origin https://github.com/<utilizador>/cacadores-da-historia.git
   git push -u origin main
   ```
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. Ao fim de 1–2 minutos o jogo fica em `https://<utilizador>.github.io/cacadores-da-historia/` (https, por isso
   a câmara, o giroscópio e a RA no chão funcionam no telemóvel).

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
| VR com óculos ligados ao PC | No modo da Kiala, se o Chrome/Edge do PC detectar óculos (Meta Quest com Link, SteamVR…), aparece "Jogar em VR": o jogador fica dentro do monumento, anda com o manípulo esquerdo, roda com o direito e responde num painel (aponta e gatilho). Monta-se depois no ecrã. |
| Dificuldade | Fácil (peças perto, com pegadas e setas, 50 pontos), Normal (100) e Difícil (peças mais longe, só radar, 150) |
| Jogo, não aula | O jogo não mostra nada de professores nem de turmas. As ferramentas de teste (verificar o telemóvel, dados e SUS) ficam escondidas: abrir o link com `?ferramentas` |
| Direcção e curvas | O rumo vem dos três ângulos do sensor (câmara apontada, de pé ou deitado) e, no Android, da bússola absoluta; cada passo vai para onde se aponta |
| Cronómetro | Tempo de jogo sempre visível (pára na pausa); tempo final no fim e melhor tempo por nível em cada conta |
| Ecrã 2 Peça encontrada: contorno escuro, vibração + som (M2), **Fixar** | ✓ |
| Ecrã 3 Pergunta: curiosidade em áudio + legenda (R8, R13), 3 respostas, certo/errado já com a resposta certa | Voz por `speechSynthesis`; a pergunta só abre depois da curiosidade (D1); só a resposta certa dá pontos |
| Ecrã 4 Montar: tabuleiro 2D (D2), íman (DC1), rodar com um toque (DC2) | ✓ |
| Modo de equipa, papéis Aponta/Responde/Monta, "Passa a…" (D3, R4) | 1 a 3 jogadores num telemóvel |
| Sem RA: fotografias dos locais (B2) | O "Estou aqui" serve para as salas fechadas (sem GPS) |
| R6 só alcunha · R7 contraste alto · alvos ≥ 48 px · R11 offline | ✓ |
| Modo família (D5): o avô ou a avó conta a história, e os netos procuram, respondem e montam | Opção "Família" ao configurar o jogo |
| Guardar o progresso sem repetir o que já se fez | Contas locais (alcunha, cor, PIN opcional): "Continuar", "Reiniciar o nível" e "Recomeçar tudo" |
| Orientação (IHC): para onde andar, como apanhar, como montar | Pegadas e setas para o lado da peça, mão animada, demonstração de apanhar e de montar, dica depois de 2 encaixes falhados |
| QR (interacção 8) | QR do jogo e da instalação no painel ao lado, no computador (`vendor/qrcode.js`, MIT) |
| Metas da secção 5.3 / PL 14 | Registo automático (1.ª peça, montar, respostas, ajudas no jogo, encaixes falhados), questionário SUS no fim, tabela comparada com as metas e CSV (só com `?ferramentas`) |
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
- Não há servidor: os progressos e os recordes ficam só neste aparelho.
- As "fotografias" do modo sem RA são desenhos das peças. Para a visita real, substituir por fotos do local.
