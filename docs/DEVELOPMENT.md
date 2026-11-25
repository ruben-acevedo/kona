# Developing Kona

Technical notes for working on the code. The main README is for people who use Kona.

## Run

```bash
npm install
npm start          # dark theme by default (change it in Customize)
```

On WSL, Chromium needs: `sudo apt-get install -y libnss3 libnspr4 libasound2t64`.

On WSL, `npm start` turns on GPU acceleration (Mesa's D3D12 driver). Without it, Chromium draws everything on the CPU and the interface gets slow. So always launch with `npm start`, not `npx electron .`.

### Native on Windows (recommended)

```bash
npm run windows
```

This downloads Electron for Windows (first time only), copies the app to `%LOCALAPPDATA%\Kona-dev\app` and runs it from there. Node isn’t needed on Windows.
On WSLg the window is streamed to Windows, like a remote desktop, and resizing stutters. Running natively, Windows handles the window: resizing is smooth, and maximize, snap and minimize use the system animations.
After changing the code, run `npm run windows` again to copy the new version.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+T | New tab |
| Ctrl+W | Close tab (on the last tab, closes the browser) |
| Ctrl+L | Focus the address bar |
| Ctrl+R | Reload |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Alt+Z or Ctrl+Shift+L | Sidebar |
| Alt+V | Tab overview |
| Ctrl+, | Customize (theme, new tab background, sections) |
| Ctrl+Shift+I | DevTools for the interface |

## Structure

- `main.js`: frameless window, popups become tabs, shortcuts inside pages
- `preload.js`: safe bridge between the interface and the main process
- `renderer/`: the interface (HTML, CSS and JS, no framework)
- `installer/`: the install and uninstall windows (C#/WPF) and the NSIS hook

Code comments are in Portuguese.

To take a screenshot: `KONA_SCREENSHOT=screen.png KONA_STATE=overview npm start`
(states: `sidebar`, `overview`, `web`, `customize`; also `KONA_THEME` and `KONA_WALLPAPER`).

## Window

Kona always opens maximized. Restoring goes back to 1360×860. With a single tab, the address box is centered in the window.

## Sidebar (Alt+Z)

- **Tabs:** lists the tabs in the current set (click to switch, “×” to close).
- **Private** (Ctrl+Shift+N): uses an in-memory session. Saves no history or searches, and deletes cookies and data when you leave.
- **Tab groups:** each group keeps its own tabs. You can create, switch, rename and delete them.
- **Favorites** (Ctrl+D or the star in the bar): also shown on the new tab.
- **Reading List** (Ctrl+Shift+D).
- **History** (Ctrl+H): grouped by day, with search and clearing by period.

## Settings (Ctrl+, or the gear in the sidebar)

- **General:** on startup (new tab or restore tabs), search engine (Google, DuckDuckGo, Bing, Ecosia, Brave), suggestions, save history.
- **Appearance:** theme, background, default zoom.
- **Privacy:**
  - Cookies: allow, block third-party (default) or block all. Applies to cookies sent and received over the network.
  - Delete data on close.
  - Global Privacy Control.
  - Site data (view and remove).
  - Clear browsing data.
- **Site permissions:** camera, microphone, location, notifications, clipboard and external apps. The default is to ask, and the answer is remembered per site. Screen sharing is blocked.
- **Downloads:** a folder or always ask, with “Show in folder”.
- **Profiles, Extensions, About:** versions and shortcuts.

## Address bar

When focused, the bar shows recent searches. As you type, it shows, in this order: the action for the typed text (“Google Search” or “Go to site”), matching visited sites and past searches, and search engine suggestions. Use ↑/↓ to choose, Enter to open and Esc to go back to what you typed (a second Esc closes the list). To remove an item from history, click the “×” on its row or press Shift+Delete.

Suggestions are fetched by the main process with the profile’s session, like Chrome does. History is kept in local storage, separately for each profile.

## Profiles

Click your avatar at the bottom of the sidebar to switch profiles, edit the current one or create a new one. There are 12 drawn avatars, the “Initial” option (the first letter of the name) and “Photo” (upload a picture, cropped to a centered square and saved at 256×256).

Each profile is truly isolated: it has its own Chromium session (cookies, sign-ins, cache), its own extensions, history and settings (theme, background, sections). Switching profiles closes the previous profile’s tabs and opens a new tab. Deleting a profile asks for confirmation and deletes its data from this computer. The last profile can’t be deleted.

## Extensions

Sidebar → **Extensions**. The **Chrome Web Store** button opens the store in a tab. There, the “Add to Kona” button installs the extension after you confirm.
This uses the `electron-chrome-web-store` library. Extensions are stored in `~/.config/Kona/Extensions`.

Electron doesn’t implement every Chrome extension API. Ad blockers and extensions like Dark Reader work, but extension buttons in the toolbar and popups don’t show up yet.

## Performance

- On WSL, `npm start` uses the GPU (see above).
- Background tabs load right after startup and stay rendered, stacked. Switching tabs is just a fade between ready layers, at the cost of more memory.
- The new tab sits on its own GPU layer and isn’t repainted when you come back to it.
- Right after startup, each panel is drawn once at 1% opacity, which is invisible (“warm-up”). The GPU compiles the shaders ahead of time, so the first real opening doesn’t stutter.
- Animations only use `transform` and `opacity`. The sidebar floats over the content, without resizing the page.
- The top bar is acrylic: a single blur layer with a tint and subtle grain. On the new tab it follows the background’s tone. On website tabs it turns solid and the blur turns off, because there is nothing behind it to blur and the page starts below the bar, without breaking site layouts.
- Only the 3 most recently used tabs and the neighbors of the active tab stay rendered. The rest are “parked” so the GPU isn’t overloaded.

## Tests

Tests run natively on Windows:

```bash
npm run test:windows                         # full suite → tests/output-windows/report.md
npm run test:windows -- --only=configuracoes # a single feature (suites: abertura, primeiras, paginas, abas, janela,
                                             #   bugs, endereco, menu, biblioteca, configuracoes, sugestoes, perfis, visual)
npm test               # (alternative on WSL/Linux) → tests/output/report.md
npm test -- --net      # includes real sites (Wikipedia, GitHub)
npm test -- --update-baseline   # rewrites the reference screenshots
```

The suite (`tests/harness.js`) launches the real app and uses real clicks and keystrokes. It runs twice: with a new profile and no cache (“cold”), and with the same profile reopened (“warm”). Test pages come from a local server (`tests/fixtures/server.js`), so results don’t depend on the internet. The app is visible during the tests. Don’t use the mouse while they run.

What gets checked:

- **Performance**, frame by frame: app startup; first and second opening of each panel; switching theme and background; scrolling a long article and a heavy page; switching tabs; opening and closing many tabs; resizing and maximizing; scrolling under the acrylic bar. When a frame drops, the report says whether the cost was in the interface code or on the GPU.
- **Bugs**: clicks reaching the controls; shortcuts; typed addresses; `window.open` becoming a tab; back and forward; sites’ sticky headers visible and clickable; opening and closing in quick succession; leaking pages and memory; settings that persist; console errors; hung processes.
- **Visual**: screenshots of each state in both themes; actual text contrast against the captured background, on every background; the bar with 1 to 30 tabs at maximum and minimum width; comparison with reference screenshots (`tests/baseline/<platform>/`).

On WSL, the GPU goes through a translation layer (Mesa D3D12). Tab stress, resizing and maximizing drop frames there but pass on native Windows. To judge real performance, use `npm run test:windows`.

`tests/debug/diag.js` is a standalone diagnostic: startup timeline, the cost of creating a webview, scrolling and the tab strip.

## Build the installer

```bash
npm run dist                      # dist/Kona-Setup-<version>.exe (install window) + dist/Kona-<version>-update.exe (NSIS engine)
npm run dist -- --installer-only  # only rebuilds the install window
npm run dist -- --publish         # also publishes a GitHub Release (automatic updates)
```

Kona installs for all users, by default in `C:\Program Files\Kona` (the install window lets you pick another folder). Clicking **Install** asks for administrator permission; the window itself runs without elevation, so Kona opens as a normal user at the end. Details in `scripts/dist.js` and `installer/KonaSetup.cs`. Icons: `npm run icons` (from `assets/icon.svg` and `assets/icon-windows-tile.svg`).
