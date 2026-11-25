# Desenvolvimento do Kona

Notas técnicas para quem trabalha no código. O README principal é para quem usa o Kona.

## Rodar

```bash
npm install
npm start          # tema escuro por padrão (muda em Personalizar)
```

No WSL, o Chromium precisa de: `sudo apt-get install -y libnss3 libnspr4 libasound2t64`.

No WSL, o `npm start` liga a aceleração pela placa de vídeo (driver D3D12 do Mesa). Sem isso o Chromium desenha tudo pelo processador e a interface fica lenta. Por isso, abra sempre com `npm start` e não com `npx electron .`.

### Nativo no Windows (recomendado)

```bash
npm run windows
```

Esse comando baixa o Electron para Windows (só na primeira vez), copia o app para `%LOCALAPPDATA%\Kona-dev\app` e abre o app lá. Não precisa de Node no Windows.
No WSLg a janela é transmitida para o Windows, como numa área de trabalho remota, e redimensionar fica travado. Rodando nativo, o Windows cuida da janela: redimensionar fica liso e maximizar, encaixar e minimizar usam as animações do sistema.
Depois de mudar o código, rode `npm run windows` de novo para copiar a versão nova.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba (na última aba, fecha o navegador) |
| Ctrl+L | Focar o endereço |
| Ctrl+R | Recarregar |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / anterior aba |
| Alt+Z ou Ctrl+Shift+L | Barra lateral |
| Alt+V | Visão geral das abas |
| Ctrl+, | Personalizar (tema, fundo da nova aba, seções) |
| Ctrl+Shift+I | DevTools da interface |

## Estrutura

- `main.js`: janela sem moldura, popups viram abas, atalhos dentro das páginas
- `preload.js`: ponte segura entre a interface e o processo principal
- `renderer/`: interface (HTML, CSS e JS sem framework)

Para gerar uma captura de tela: `KONA_SCREENSHOT=tela.png KONA_STATE=overview npm start`
(estados: `sidebar`, `overview`, `web`, `customize`; também `KONA_THEME` e `KONA_WALLPAPER`).

## Janela

O Kona sempre abre maximizado. Restaurar volta para 1360×860. Com uma única aba, a caixa do endereço fica centralizada na janela.

## Menu lateral (Alt+Z)

- **Abas:** lista as abas do conjunto atual (clicar ativa, "×" fecha).
- **Privado** (Ctrl+Shift+N): usa uma sessão só em memória. Não grava histórico nem buscas e apaga cookies e dados ao sair do modo.
- **Grupos de abas:** cada grupo guarda as próprias abas. Dá para criar, trocar, renomear e apagar.
- **Favoritos** (Ctrl+D ou a estrela na barra): também aparecem na nova aba.
- **Lista de Leitura** (Ctrl+Shift+D).
- **Histórico** (Ctrl+H): agrupado por dia, com busca e limpar por período.

## Configurações (Ctrl+, ou a engrenagem do menu)

- **Geral:** ao abrir (nova aba ou restaurar abas), buscador (Google, DuckDuckGo, Bing, Ecosia, Brave), sugestões, guardar histórico.
- **Aparência:** tema, fundo, zoom padrão.
- **Privacidade:**
  - Cookies: permitir, bloquear de terceiros (padrão) ou bloquear todos. Vale para os cookies enviados e recebidos pela rede.
  - Apagar dados ao fechar.
  - Global Privacy Control.
  - Dados de sites (ver e remover).
  - Limpar dados de navegação.
- **Permissões de sites:** câmera, microfone, localização, notificações, área de transferência e apps externos. O padrão é perguntar, e a resposta fica guardada por site. Compartilhar a tela fica bloqueado.
- **Downloads:** pasta ou perguntar sempre, com "Mostrar na pasta".
- **Perfis, Extensões, Sobre:** versões e atalhos.

## Barra de endereço

Ao focar, a barra mostra as buscas recentes. Ao digitar, aparecem, nesta ordem: a ação para o texto digitado ("Pesquisa Google" ou "Ir para o site"), os sites visitados e as buscas anteriores que combinam, e as sugestões do Google. Use ↑/↓ para escolher, Enter para abrir e Esc para voltar ao texto digitado (um segundo Esc fecha a lista). Para remover um item do histórico, clique no "×" da linha ou use Shift+Delete.

As sugestões vêm de `suggestqueries.google.com`, buscadas pelo processo principal com a sessão do perfil, como faz o Chrome. O histórico fica no armazenamento local e é separado por perfil.

## Perfis

Clique no seu avatar, no rodapé da barra lateral, para trocar de perfil, editar o atual ou criar um novo. Há 12 avatares desenhados, a opção "Inicial" (a primeira letra do nome) e "Foto" (enviar uma imagem, recortada em quadrado no centro e salva em 256×256).

Cada perfil é isolado de verdade: tem a própria sessão do Chromium (cookies, logins, cache), as próprias extensões, histórico e ajustes (tema, fundo, seções). Trocar de perfil fecha as abas do perfil anterior e abre uma nova aba. Apagar um perfil pede confirmação e apaga os dados dele deste computador. O último perfil não pode ser apagado.

## Extensões

Barra lateral → **Extensões**. O botão **Chrome Web Store** abre a loja numa aba. Lá, o botão "Adicionar ao Kona" instala a extensão, depois de você confirmar.
Isso usa a biblioteca `electron-chrome-web-store`. As extensões ficam em `~/.config/Kona/Extensions`.

O Electron não implementa todas as APIs de extensão do Chrome. Bloqueadores de anúncio e extensões como o Dark Reader funcionam, mas botões de extensão na barra e popups ainda não aparecem.

## Desempenho

- No WSL, o `npm start` usa a placa de vídeo (veja acima).
- As abas de fundo são carregadas logo depois da abertura e ficam desenhadas, empilhadas. Trocar de aba é só um fade entre camadas prontas, ao custo de mais memória.
- A nova aba fica numa camada própria na GPU e não é redesenhada quando você volta para ela.
- Logo depois de abrir, cada painel é desenhado uma vez com 1% de opacidade, imperceptível ("aquecimento"). A GPU compila os shaders antes, e a primeira abertura real não engasga.
- As animações usam só `transform` e `opacity`. A barra lateral flutua sobre o conteúdo, sem redimensionar a página.
- A barra superior é acrílica: uma única camada de desfoque com tom e grão sutil. Na nova aba ela segue o tom do fundo. Nas abas de site ela fica sólida e o desfoque desliga, porque não há nada atrás para desfocar e a página começa abaixo da barra, sem quebrar o layout dos sites.
- Só as 3 abas usadas mais recentemente e as vizinhas da aba ativa ficam desenhadas. As outras ficam "estacionadas", para não sobrecarregar a GPU.

## Testes

Os testes rodam direto no Windows nativo:

```bash
npm run test:windows                       # suíte completa → tests/output-windows/report.md
npm run test:windows -- --only=configuracoes   # só uma feature (suítes: abertura, primeiras, paginas, abas, janela,
                                           #   bugs, endereco, menu, biblioteca, configuracoes, sugestoes, perfis, visual)
npm test               # (alternativa no WSL/Linux) → tests/output/report.md
npm run test:windows   # mesma suíte nativa no Windows → tests/output-windows/report.md
npm test -- --net      # inclui sites reais (Wikipedia, GitHub)
npm test -- --update-baseline   # regrava as capturas de referência
```

A suíte (`tests/harness.js`) abre o app de verdade e usa cliques e teclas reais. Ela roda duas vezes: com perfil novo, sem cache ("cold"), e com o mesmo perfil reaberto ("warm"). As páginas de teste vêm de um servidor local (`tests/fixtures/server.js`), então os resultados não dependem da internet. O app aparece na tela durante os testes. Não use o mouse enquanto eles rodam.

O que é verificado:

- **Desempenho**, quadro a quadro: abertura do app; primeira e segunda abertura de cada painel; troca de tema e de fundo; rolagem de um artigo longo e de uma página pesada; troca de abas; abrir e fechar muitas abas; redimensionar e maximizar; rolagem por baixo da barra acrílica. Quando um quadro se perde, o relatório diz se o custo foi no código da interface ou na GPU.
- **Bugs**: cliques chegando aos controles; atalhos; endereço digitado; `window.open` virando aba; voltar e avançar; cabeçalhos fixos de sites visíveis e clicáveis; abrir e fechar em sequência rápida; vazamento de páginas e memória; ajustes que persistem; erros no console; processos que travam.
- **Visual**: capturas de cada estado nos dois temas; contraste real do texto contra o fundo capturado, em todos os fundos; barra com 1 a 30 abas na largura máxima e na mínima; comparação com capturas de referência (`tests/baseline/<sistema>/`).

No WSL, a GPU passa por uma camada de tradução (Mesa D3D12). Estresse de abas, redimensionar e maximizar perdem quadros lá, mas passam no Windows nativo. Para avaliar desempenho de verdade, use `npm run test:windows`.

`tests/debug/diag.js` é um diagnóstico avulso: linha do tempo da abertura, custo de criar um webview, rolagem e faixa de abas.

## Gerar o instalador

```bash
npm run dist                      # dist/Kona-Setup-<versão>.exe (janela de instalação) + dist/Kona-<versão>-update.exe (motor NSIS)
npm run dist -- --installer-only  # só recompila a janela de instalação
npm run dist -- --publish         # também publica um Release no GitHub (atualizações automáticas)
```

Detalhes em `scripts/dist.js`. Ícones: `npm run icons` (a partir de `assets/icon.svg` e `assets/icon-windows-tile.svg`).
