; Incluído no instalador NSIS (package.json → build.nsis.include).
; O "Desinstalar" do Windows passa a abrir a janela do Kona ("Kona Uninstaller.exe", instalada junto
; com o app). Ela roda o desinstalador NSIS em silêncio; chamada com /S (atualizações, scripts) só
; repassa ao NSIS. A desinstalação silenciosa direta continua no QuietUninstallString.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\Kona Uninstaller.exe"'
!macroend
