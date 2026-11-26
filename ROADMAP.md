# Roadmap

Status: `[ ]` pendente · `[~]` em andamento · `[x]` feito · `[?]` aguardando decisão

Ordem sugerida: **A → B → C → D → E**. Os números entre parênteses são os da lista original.

---

## A. Nome novo

- [x] **A1. Renomear para Kona (1).** Todas as referências trocadas para Kona: pasta do projeto, `package.json` (`name`, `productName`), títulos, textos, chaves de armazenamento, sessões (`persist:kona`), pasta de dados (`%APPDATA%\Kona`), pasta de desenvolvimento no Windows (`Kona-dev`), README e testes. Na Chrome Web Store aparece "Add to Kona" (vem do `productName`).
  - Decidido: sem migração dos dados atuais (ainda não estão em uso real).
  - Repositório: https://github.com/ruben-acevedo/kona (privado; git local em `main`, ainda sem commits).

## B. Segurança, privacidade e login

- [x] **B1. Login do Google bloqueado (2).** "This browser or app may not be secure" ao entrar no Gmail. O Google bloqueia login em navegadores embutidos (Electron/webviews) com uma detecção própria. Investigar a causa exata, aplicar o que for possível e, se o bloqueio for intrínseco, apresentar as opções.
  - Causa: o Google checa `window.chrome.app` / `.csi` / `.loadTimes`, que todo Chrome expõe nas páginas e o Electron não. UA e client hints já estavam corretos (UA do Firefox e marca "Google Chrome" não mudam nada).
  - Correção: `page-preload.js` (preload de sessão em todas as abas, inclusive no modo privado) recria esses objetos como no Chrome. Diagnóstico em `tests/debug/google-login.js`.
  - Confirmado pelo usuário no Windows: login completo no Gmail funciona.

- [x] **B2. Auditoria de segurança e anonimato (3).** Comparar com Chrome/Safari: isolamento de processos e sandbox, atualizações de segurança do Chromium, Safe Browsing (proteção contra phishing e malware), HTTPS, fingerprinting, WebRTC (vazamento de IP), DNS seguro (DoH), permissões, extensões e configuração do Electron (contextIsolation, sandbox, webviews). Relatar o que é intrínseco do Chromium/Electron e o que depende do Kona, com opções para os próximos passos.
  - Corrigido no Kona: sandbox do Chromium em todos os processos (`app.enableSandbox`); webviews sempre isoladas (sem Node e sem preload próprio; só a interface cria abas); a interface não navega nem abre janelas; IPC aceito só da interface (`ipc.js`); páginas não abrem `file:` nem esquemas estranhos por popup; WebRTC sem IPs da rede local; **HTTPS primeiro** (volta para HTTP se o site não tiver HTTPS: erro, redirecionamento de volta ou 4 s sem resposta); **DNS seguro** com Quad9 (DoH, bloqueia domínios de malware e phishing). As duas últimas têm opção em Privacidade e segurança.
  - Já estava ok: Electron 45.5 / Chromium 156 (o mais recente); erros de certificado são recusados; conteúdo misto é bloqueado; permissões passam pela interface; a pasta de downloads recebe a "Mark of the Web" (SmartScreen/Defender analisam); cookies de terceiros bloqueados; GPC; UA e client hints iguais aos do Chrome (anti-fingerprinting por "se misturar").
  - Intrínseco (não dá para igualar ao Chrome): **Safe Browsing** do Google não existe no Electron (o DNS do Quad9 cobre parte); atualizações dependem de sair uma versão nova do Kona (ver E1); fingerprinting avançado (canvas, fontes) é o mesmo do Chromium.
  - Fica para o E1: ligar os *fuses* do Electron no executável final (criptografia de cookies com DPAPI, desligar RunAsNode e NODE_OPTIONS, validar o asar).

## C. Interação e polimento

- [x] **C1. Visão geral das abas por teclado (4).** Alt+V abre e fecha. Setas navegam entre as abas, Enter abre a selecionada, Esc fecha. Transição de abertura e efeito de foco/hover durante a navegação.
  - Feito: Alt+V abre e fecha, inclusive com o foco dentro de uma página; setas (↑↓ por linha), Home/End, Enter ou Espaço abrem, Esc fecha e devolve o foco à página. Mouse e teclado usam a mesma seleção. Cartões entram subindo em cascata; o selecionado sobe, cresce e brilha; navegando pelo teclado, os outros recuam. Teste: `tests/debug/overview-keys.js`.
  - Corrigido junto: a visão geral quebrava com abas sem domínio (`data:`, `about:blank`).
  - Corrigido depois: uma aba nova (Ctrl+T, ou aberta por uma página) não aparecia na visão geral já aberta; agora aparece na hora e fica selecionada.

- [x] **C2. Sons da interface (5).** Sons curtos e discretos, no estilo de PS5 e iPhone, para: abrir o menu lateral e navegar pelas opções, abrir a visão geral das abas e navegar nela, passar o mouse sobre os favoritos, passar o mouse no botão de personalizar e alterar opções, abrir o menu de perfis. Opção de desligar em Personalizar. Sem custo de desempenho: sons sintetizados ou pré-carregados com Web Audio, nunca bloqueando a interface.
  - Feito em `renderer/sounds.js`: quatro sons sintetizados com Web Audio (sem arquivos). *Tique* ao passar por itens (menu lateral, favoritos, botão Personalizar e opções dele, perfis, cartões da visão geral, inclusive pelas setas); *seleção* ao escolher ou alterar; *abrir* e *fechar* para menu lateral, visão geral, Personalizar e menu de perfis. Também (pedido depois): tique nos botões da barra (barra lateral, setas, nova aba, todas as abas), na barra de pesquisa e nas sugestões; *seleção* ao entrar na pesquisa, ao dar Enter, ao escolher uma sugestão e nas setas Voltar/Avançar; *tecla* ("toc" de ruído filtrado, estilo iPhone) ao digitar e apagar na pesquisa. Abrir e fechar aba têm som próprio ("bolha" suave subindo/descendo). Custo ≈0,04 ms por som; tiques limitados a 1 a cada 40 ms. Interruptor em Personalizar → Sons e em Configurações → Aparência. Teste: `tests/debug/sounds.js`.

- [x] **C3. Favoritos padrão melhores (6).** Trocar a lista padrão pelos sites mais comuns nas barras de outros navegadores (YouTube, Amazon, …). Adicionar um botão discreto e translúcido "+" depois do último favorito, que se confunde com o fundo.
  - Feito: padrão novo com YouTube, Gmail, Amazon, Mercado Livre, Netflix, Instagram, WhatsApp, Wikipédia, ChatGPT e Spotify (versões do Brasil). Perfis com a lista antiga intocada recebem a nova; listas editadas ficam como estão. Ícones desses sites vêm com o app (`renderer/sites/`), sem depender da rede. Botão "+" quase invisível depois do último favorito (aparece ao passar o mouse) abre a folha "Adicionar favorito" (endereço + nome opcional; valida o endereço e avisa se já existe). Teste: `tests/debug/favorites.js`.

- [x] **C4. Uma imagem enviada por vez (7).** No fundo da nova aba e na foto de perfil, só pode existir uma imagem enviada. Enviar outra substitui a anterior. Os fundos e avatares padrão continuam sempre disponíveis.
  - Feito: no fundo da nova aba isso já valia (`settings.customImage`). Na foto de perfil, escolher um avatar pronto apagava a foto enviada; agora o perfil guarda uma foto (`photo`), que continua disponível ao lado dos avatares prontos e é substituída pelo próximo envio. Teste: `tests/debug/single-upload.js`.

## D. Identidade visual

- [x] **D1. Logo e ícone (8).** Propor opções de logo (para o topo do README) e de ícone do app (Windows `.ico`). Depois da escolha, aplicar em tudo: janela, barra de tarefas, instalador e README.
  - Escolhido: **abacaxi dourado** (Kona é uma variedade de abacaxi) sobre o azul-noite do fundo Aurora. Mestre em `assets/icon.svg`; `npx electron scripts/icons.js` gera `assets/icon.ico` (16–256 px) e os PNGs. No Windows (`.ico`, barra de tarefas) usa `assets/icon-windows-tile.svg`: abacaxi compacto ocupando quase todo o quadrado, fundo um pouco mais claro e borda sutil (o primeiro parecia pequeno na barra escura; o usuário preferiu com fundo à versão sem fundo `icon-windows.svg`). Aplicado na janela e na barra de tarefas (com AppUserModelId próprio), em Configurações → Sobre o Kona e no topo do README. O instalador recebe o ícone no E1.

## E. Distribuição

- [x] **E1. Instalação sem npm (9).** Discutir e implementar o processo de instalação: instalador para Windows (`.exe`/MSIX), atalhos, desinstalação, atualizações automáticas e assinatura de código (sem ela, o Windows SmartScreen exibe um aviso). Ligar os fuses de segurança do Electron (ver B2).
  - Feito: `npm run dist` gera em `dist/`:
    - **`Kona-Setup-<versão>.exe`**: o arquivo que as pessoas baixam. É uma janela própria do Kona (`installer/KonaSetup.cs`, WPF compilado com o `csc.exe` do Windows): sem moldura, cantos arredondados, fundo Aurora, abacaxi, barra de progresso em degradê com brilho, animação de entrada e botão "Abrir o Kona" (abre sozinho em 2 s). Instala sem pedir administrador. `/S` instala em silêncio.
    - **`Kona-<versão>-update.exe`** + `latest.yml`: o instalador NSIS (motor, embutido no Setup e rodado em silêncio). Instala por usuário em `%LOCALAPPDATA%\Programs\Kona`, cria atalhos (Iniciar e área de trabalho), registra em "Adicionar ou remover programas" e é o que as atualizações automáticas baixam.
  - Atualização automática (`updater.js`, electron-updater): verifica os Releases do GitHub ao abrir e a cada 4 h, baixa em segundo plano, instala ao fechar; aviso "Kona x pronto para instalar · Reiniciar agora".
  - Fuses do Electron ligados no executável: cookies criptografados (DPAPI), sem RunAsNode / NODE_OPTIONS / inspect, app só do asar e com integridade validada.
  - Build no WSL sem Wine: `scripts/wine-shim/wine` extrai o desinstalador com o leitor do próprio electron-builder.
  - Desenvolvimento (`npm run windows`) agora usa `%APPDATA%\Kona-dev`; o Kona instalado usa `%APPDATA%\Kona`.
  - Pendências que dependem do usuário:
    - **Assinatura de código** (opcional; ver opções na conversa de 2026-11-25: SignPath Foundation grátis para código aberto, Certum Open Source barato, Azure Artifact Signing mensal, certificado OV anual); `CSC_LINK`/`CSC_KEY_PASSWORD` assinam Kona.exe e o motor; falta assinar também o Kona-Setup (signtool) antes de publicar.
  - Desinstalação com a mesma cara (`Desinstalar Kona.exe`, o mesmo `KonaSetup.cs` com `/define:UNINSTALL`): instalada junto com o app e registrada como o "Desinstalar" do Windows (`installer/uninstall.nsh`). Pergunta antes, tem a opção "Apagar também meus dados", mostra o progresso e se apaga ao fechar. Chamada com /S (atualizações, scripts) só repassa ao desinstalador NSIS.
  - Testado pelo usuário no Windows: instalação, atalhos, abrir e desinstalação pelas Configurações (sem sobras: pasta, registro, atalhos e o desinstalador temporário somem).
  - Repositório tornado público (2026-11-25), então os Releases servem as atualizações para qualquer pessoa.

- [x] **E2. README para o GitHub (9).** README "perfeito" e bonito, com o logo no título e o subtítulo "design inteligente, alta performance". Deve explicar o que é, recursos, como instalar, autoria e licença. Sem passos de desenvolvimento ou testes e sem menção à ajuda de IA.
  - Decidido: autor Rubén Acevedo, licença MIT, repositório criado pelo GitHub CLI na conta ruben-acevedo.
  - Feito: README com ícone, título, subtítulo, selos (versão, Windows, licença), botão de download, capturas reais (`assets/screenshots/`, perfil limpo), o que é, recursos, instalar (com o aviso do SmartScreen), atalhos, seus dados, autoria e licença. `LICENSE` (MIT) criado. O conteúdo técnico do README antigo foi para `docs/DESENVOLVIMENTO.md` (hoje `docs/DEVELOPMENT.md`, ver F1).
  - Primeiro commit e push feitos em 2026-11-25. Falta publicar o primeiro Release (`npm run dist -- --publish`) para o download funcionar.

## F. Internacionalização

- [x] **F1. Tradução para o inglês (10).** Tudo o que a pessoa vê passa para o inglês: o Kona, o instalador, o desinstalador, o README e a documentação. Só inglês (decidido: sem português nem seletor de idioma).
  - Feito: textos da interface (`renderer/*.js`, `index.html`, `lang="en"`), datas do histórico em `en-US`, nomes de fundos e avatares, perfil padrão "Personal". Endereços internos agora são `kona://start` e `kona://settings` (sessões salvas com `kona://inicio` / `kona://configuracoes` são convertidas ao abrir; digitar `kona://configuracoes` ainda funciona).
  - Favoritos padrão nas versões internacionais: amazon.com, Reddit (no lugar do Mercado Livre, ícone em `renderer/sites/reddit.png`) e en.wikipedia.org. Perfis com qualquer uma das listas padrão antigas intocada recebem a nova.
  - README em inglês com capturas novas (`assets/screenshots/new-tab.png`, `overview.png`, `sidebar.png`, `new-tab-light.png`); `docs/DESENVOLVIMENTO.md` virou `docs/DEVELOPMENT.md`. Os comentários do código continuam em português.
  - Rótulos do relatório de testes continuam em português (só para desenvolvimento); as checagens de texto da suíte foram atualizadas.

- [x] **F2. Instalador com escolha de pasta (10).** O instalador não começa sozinho: mostra a pasta de instalação (padrão `C:\Program Files\Kona`), o botão "Change…" (seletor de pastas moderno do Windows; se a pasta escolhida não se chama Kona, instala numa `Kona` dentro dela), o tamanho, e os botões Cancel / Install.
  - Instala para todos os usuários (`nsis.perMachine: true`). A janela roda sem elevação; ao clicar em Install, o motor NSIS roda como administrador (pedido do Windows) com `/S /D=<pasta>`. Recusar o pedido mostra "Kona needs administrator permission…" e "Try again". O "Open Kona" do fim abre o navegador como usuário comum.
  - Desinstalador renomeado para `Kona Uninstaller.exe` (o NSIS já usa "Uninstall Kona.exe"). Ao confirmar, roda uma cópia elevada de si mesmo (`--remove <pasta>`) que chama o NSIS e apaga a pasta; os dados pessoais (opção "Also delete my data") são apagados pela janela, como o usuário.
  - As atualizações automáticas de uma instalação em Program Files pedem permissão de administrador (o electron-updater cuida disso).
  - Testado: compilação e as duas janelas em modo de simulação. Falta o teste real do usuário (instalar, trocar a pasta, desinstalar).

## G. Vindo de outro navegador

Alinhado com o usuário em 2026-11-25: ordem G1 → G2 → G3; sem abas abertas, sem buscador (ele escolhe nas configurações) e sem a opção de navegador padrão no instalador.

- [x] **G1. Pastas nos favoritos (11).** Favoritos viram uma árvore (`renderer/library.js`: favorito `{ id, title, url }` ou pasta `{ id, title, folder: true, children }`; listas antigas continuam valendo).
  - Menu lateral: pastas com setinha, fechadas por padrão, pastas dentro de pastas, contador; "New folder", renomear e apagar (pede confirmação se tiver conteúdo); arrastar para reordenar, para dentro de uma pasta (segurar sobre uma pasta fechada abre) e para o fim da lista; não deixa mover uma pasta para dentro dela mesma.
  - Nova aba: a pasta aparece com 4 miniaturas (estilo iPhone; espaços vazios apagados) e abre um painel com os itens; subpastas abrem no mesmo painel com "voltar"; Esc ou clicar fora fecha.
  - Teste: `tests/debug/folders.js`.

- [x] **G2. Importar do Chrome, Edge e Brave (11).** Favoritos (com pastas), histórico e extensões. Settings → General → "Import from another browser", e oferecido no primeiro uso ("Welcome to Kona", só com o perfil ainda vazio e se houver navegador para importar).
  - `importer.js` (processo principal) lê o perfil do navegador: `Bookmarks` (a barra vira o nível principal; "Outros" e "Celular" viram pastas), `History` (SQLite copiado antes de abrir, funciona com o navegador aberto; os 600 sites mais recentes/visitados e 300 buscas, os limites do Kona) e as extensões da Chrome Web Store (sem as internas do navegador e sem temas; desligadas vêm desmarcadas; as que saíram da loja aparecem como "No longer in the Web Store").
  - Favoritos importados substituem os padrão do Kona; numa lista personalizada entram no fim, sem repetir endereços. Histórico é somado ao atual. Extensões são reinstaladas da loja no perfil em uso (as configurações internas delas não vêm).
  - Senhas e logins não dá: o Chrome os criptografa de um jeito que só ele lê (avisado na janela).
  - Testes automáticos (`KONA_USER_DATA`) não recebem a oferta do primeiro uso, a não ser com `KONA_WELCOME=1`. Teste: `tests/debug/import.js` (e `import-read.js`, só leitura).

- [~] **G3. Navegador padrão (11).** O instalador registra o Kona como navegador (`installer/uninstall.nsh`: `KonaHTML` para http/https e .html/.htm/.xhtml/.svg/.pdf, `StartMenuInternet\Kona`, `RegisteredApplications`; a desinstalação remove). Uma instância só: links vindos de outros programas (e abrir o Kona de novo) viram abas na janela aberta.
  - Barra abaixo da barra de ferramentas, enquanto o Kona instalado não for o padrão: "Kona isn’t your default browser · Make default · ×". O botão abre Configurações do Windows na página do Kona (o Windows não deixa app nenhum se tornar padrão sozinho); ao voltar para o Kona, confere de novo e a barra some com "Kona is now your default browser". O × vale até o Kona ser aberto de novo.
  - No Kona de desenvolvimento (`npm run windows`, sem instalador) a barra não aparece.
  - Testado: segunda instância com link vira aba; a barra empurra a página sem cobrir (`tests/debug/default-browser.js`).
  - Corrigido (1º teste do usuário): no Windows 11 recente a escolha fica em `UserChoiceLatest\ProgId` e o `UserChoice` antigo fica desatualizado; a barra não sumia. Agora lê o novo primeiro e confirma com `app.getApplicationNameForProtocol` (`tests/debug/default-status.js`). Falta o reteste do usuário.

## H. Downloads

- [x] **H1. Downloads no menu lateral (12).** Alinhado em 2026-11-25: botão na barra como no Safari/Chrome, manter os dois avisos (início e fim), arrastar para fora, 100 mais recentes por perfil (sem custo de desempenho: a lista só é desenhada com o menu aberto).
  - `downloads.js` (processo principal): progresso (até 5 avisos/s), pausar, continuar, cancelar, tentar de novo, abrir, mostrar na pasta, ícone do Windows por tipo de arquivo e arrastar (`startDrag`). Abrir/mostrar/arrastar só valem para arquivos que o Kona baixou (`downloads-known.json`).
  - Menu lateral → Downloads (Ctrl+J, também com o foco numa página): ícone, nome, "12 MB of 80 MB" / "3.2 MB/s · 20 s left", barra de progresso, pausar/continuar e cancelar; concluído abre com um clique, "Show in folder", × tira da lista; cancelado/falhou tem Retry; apagado do disco aparece "Deleted"; "Clear list" (os arquivos ficam). Contador de downloads em andamento.
  - Barra de ferramentas: botão com anel de progresso, aparece no primeiro download da sessão; quica ao terminar; clicar abre a lista.
  - Lista por perfil (`downloadsList` em `renderer/library.js`); os do modo privado só na memória. Teste: `tests/debug/downloads.js`.

## I. Menu de contexto

- [x] **I1. Botão direito (13).** Alinhado em 2026-11-25: menu desenhado pelo Kona (não o nativo do Windows) com os itens do Chrome, em tudo (páginas, barra de endereço, abas, favoritos da nova aba e campos da interface); corretor nos idiomas do Windows; sem "Translate"; Inspect e View page source para todos.
  - Páginas (`context-menu.js` no processo principal avisa e executa; `renderer/context-menu.js` desenha): página (Back, Forward, Reload, Save page as…, Print…, View page source), link (Open in new tab — em segundo plano —, Copy address, Save link as…, Add to Favorites), imagem (Open, Save as…, Copy image, Copy address, Search with Google), texto selecionado (Copy, Search <buscador> for “…”), campos (Undo, Redo, Cut, Copy, Paste, Paste as plain text, Select all + sugestões do corretor e Add to dictionary), vídeo/áudio (Play/Pause, Mute, Loop, Show controls, Picture in picture, Open/Save/Copy address) e Inspect sempre.
  - Interface: aba (New tab, Reload, Duplicate, Add/Remove Favorites, Close tab, Close other tabs; botão direito não troca de aba), aba ativa (+ Copy address, Paste and go), barra de endereço editando (Undo, Cut, Copy, Paste, Paste and go, Select all), favoritos da nova aba e do painel de pasta (Open, Open in new tab, Copy address, Rename…, Remove; pastas: Open, Open all, Rename…, Delete), campos de texto da interface.
  - Teclado no menu: ↑/↓, Home/End, Enter, Esc. Fecha ao clicar fora (também dentro da página), rolar, redimensionar ou a janela perder o foco.
  - Atalhos novos para combinar com o menu: Alt+←/→ e os botões laterais do mouse (voltar/avançar), Ctrl+S (salvar página), Ctrl+P (imprimir), Ctrl+U (código-fonte, aba `view-source:`), Ctrl+Shift+I numa página (ferramentas de desenvolvedor dela).
  - Corretor ortográfico: idiomas preferidos do Windows (aqui en-US e pt-BR), em todos os perfis e no modo privado.
  - "Save … as" pede a pasta mesmo com o salvamento automático ligado. Teste: `tests/debug/context-menu.js`.
