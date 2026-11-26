// Menu de contexto (botão direito). O menu é desenhado pela interface, no estilo do Kona
// (renderer/context-menu.js); aqui ficam o aviso de "botão direito numa página" e as ações que
// precisam do webContents da página ou da interface: editar, copiar imagem, salvar, imprimir,
// inspecionar, controlar vídeo/áudio e o corretor ortográfico (que usa os idiomas do Windows).
const { clipboard, dialog, webContents } = require('electron');
const { onUi, handleUi } = require('./ipc');
const { tl } = require('./i18n');
const { contextItems } = require('./extensions');

let askNext = () => {};

/** Campos de params do Chromium que a interface usa para montar o menu. */
function pick(p) {
  return {
    x: p.x, y: p.y,
    linkURL: p.linkURL, linkText: p.linkText,
    srcURL: p.srcURL, mediaType: p.mediaType, hasImageContents: p.hasImageContents,
    mediaFlags: p.mediaFlags,
    pageURL: p.pageURL, frameURL: p.frameURL,
    selectionText: (p.selectionText || '').slice(0, 2000),
    isEditable: p.isEditable, editFlags: p.editFlags,
    misspelledWord: p.misspelledWord, dictionarySuggestions: (p.dictionarySuggestions || []).slice(0, 5),
    inputFieldType: p.inputFieldType,
  };
}

/** Liga o aviso de botão direito numa página (chamado para cada webview). */
function watchPage(contents) {
  contents.on('context-menu', (_e, params) => {
    contents.hostWebContents?.send('ctx:page', { id: contents.id, params: { ...pick(params), extItems: contextItems(contents, params) } });
  });
}

// Vídeo/áudio no ponto clicado (só o documento principal da página)
const MEDIA_JS = (x, y, act) => `(() => {
  const el = document.elementFromPoint(${x}, ${y});
  const m = el && (el.closest('video, audio') || (el.querySelector && el.querySelector('video, audio')));
  if (!m) return false;
  switch (${JSON.stringify(act)}) {
    case 'play': m.paused ? m.play() : m.pause(); break;
    case 'mute': m.muted = !m.muted; break;
    case 'loop': m.loop = !m.loop; break;
    case 'controls': m.controls = !m.controls; break;
    case 'pip': if (document.pictureInPictureElement === m) document.exitPictureInPicture(); else m.requestPictureInPicture(); break;
  }
  return true;
})()`;

function registerContextMenu(opts) {
  askNext = opts.askNextDownload;
  const page = (id) => {
    const wc = webContents.fromId(Number(id));
    return wc && wc.getType() === 'webview' ? wc : null;
  };
  handleUi('ctx:do', async (e, id, act, data = {}) => {
    const wc = page(id);
    if (!wc) return false;
    const x = Math.round(data.x || 0), y = Math.round(data.y || 0);
    switch (act) {
      case 'undo': case 'redo': case 'cut': case 'copy': case 'paste': case 'selectAll':
        wc[act](); break;
      case 'pastePlain': wc.pasteAndMatchStyle(); break;
      case 'replace': if (typeof data.word === 'string') wc.replaceMisspelling(data.word); break;
      case 'learn': if (typeof data.word === 'string') wc.session.addWordToSpellCheckerDictionary(data.word); break;
      case 'copyImage': wc.copyImageAt(x, y); break;
      case 'save': // "Save … as": pergunta onde salvar, mesmo com a pasta automática ligada
        if (typeof data.url === 'string' && /^(https?|data|blob):/i.test(data.url)) { askNext(data.url); wc.downloadURL(data.url); }
        break;
      case 'savePage': {
        const r = await dialog.showSaveDialog(opts.win(), {
          defaultPath: `${(wc.getTitle() || 'page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'page'}.html`,
          filters: [{ name: tl('Webpage, complete'), extensions: ['html', 'htm'] }],
        });
        if (!r.canceled && r.filePath) await wc.savePage(r.filePath, 'HTMLComplete').catch(() => {});
        break;
      }
      case 'print': wc.print({}, () => {}); break;
      case 'inspect': wc.inspectElement(x, y); if (wc.isDevToolsOpened()) wc.devToolsWebContents?.focus(); break;
      case 'media': {
        const zoom = wc.getZoomFactor() || 1;
        await wc.executeJavaScript(MEDIA_JS(Math.round(x / zoom), Math.round(y / zoom), data.what), true).catch(() => {});
        break;
      }
      default: return false;
    }
    return true;
  });
  // Edição nos campos da própria interface (barra de endereço, buscas, configurações)
  handleUi('ctx:ui', (e, act) => {
    const wc = e.sender;
    if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(act)) wc[act]();
    else if (act === 'pastePlain') wc.pasteAndMatchStyle();
    return true;
  });
  handleUi('clipboard:read', async () => String((await clipboard.readText()) || '').slice(0, 8192));
  onUi('clipboard:write', (_e, text) => { if (typeof text === 'string') clipboard.writeText(text.slice(0, 65536)); });
}

module.exports = { registerContextMenu, watchPage };
