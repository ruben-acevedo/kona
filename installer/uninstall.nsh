; Incluído no instalador NSIS (package.json → build.nsis.include).
;
; 1. O "Desinstalar" do Windows passa a abrir a janela do Kona ("Kona Uninstaller.exe", instalada junto
;    com o app). Ela roda o desinstalador NSIS em silêncio; chamada com /S (atualizações, scripts) só
;    repassa ao NSIS. A desinstalação silenciosa direta continua no QuietUninstallString.
;
; 2. Registro do Kona como navegador (como o Chrome faz): aparece em Configurações → Aplicativos →
;    Aplicativos padrão e pode ser escolhido como navegador padrão. O Windows não deixa nenhum app se
;    tornar padrão sozinho; o Kona só abre essa tela (ms-settings:defaultapps?registeredAppMachine=Kona).
;    KonaHTML é o tipo usado para links (http/https) e páginas salvas (.html, .htm, .xhtml, .svg, .pdf).
!define KONA_CAPS "Software\Clients\StartMenuInternet\Kona\Capabilities"

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\Kona Uninstaller.exe"'

  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML" "" "Kona HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML" "FriendlyTypeName" "Kona HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML\Application" "ApplicationName" "Kona"
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML\Application" "ApplicationIcon" '"$INSTDIR\Kona.exe",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML\Application" "AppUserModelId" "com.ruben-acevedo.kona"
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML\DefaultIcon" "" '"$INSTDIR\Kona.exe",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\KonaHTML\shell\open\command" "" '"$INSTDIR\Kona.exe" -- "%1"'

  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\Kona" "" "Kona"
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\Kona\DefaultIcon" "" '"$INSTDIR\Kona.exe",0'
  WriteRegStr SHELL_CONTEXT "Software\Clients\StartMenuInternet\Kona\shell\open\command" "" '"$INSTDIR\Kona.exe"'
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}" "ApplicationName" "Kona"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}" "ApplicationDescription" "A web browser with smart design and high performance."
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}" "ApplicationIcon" '"$INSTDIR\Kona.exe",0'
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\StartMenu" "StartMenuInternet" "Kona"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\URLAssociations" "http" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\URLAssociations" "https" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\FileAssociations" ".htm" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\FileAssociations" ".html" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\FileAssociations" ".xhtml" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\FileAssociations" ".svg" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "${KONA_CAPS}\FileAssociations" ".pdf" "KonaHTML"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Kona" "${KONA_CAPS}"
  ; avisa o Explorer que as associações mudaram
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Kona"
  DeleteRegKey SHELL_CONTEXT "Software\Clients\StartMenuInternet\Kona"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\KonaHTML"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
