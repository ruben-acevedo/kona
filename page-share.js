// Preload das páginas (mundo isolado) para o compartilhamento de tela: leva o "Stop sharing" do Kona
// até a página (page-preload.js encerra as faixas da captura) e avisa quando o site parou sozinho.
const { ipcRenderer } = require('electron');

if (/^https?:$/.test(location.protocol)) {
  ipcRenderer.on('share:stop', () => window.dispatchEvent(new CustomEvent('__kona_share_stop')));
  window.addEventListener('__kona_share_ended', () => ipcRenderer.send('share:ended-page'));
}
