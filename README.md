# Glide

A fluid, Liquid-Glass-style sidebar for Windows. It sits at the edge of your screen as a small pill
and slides out when you want it: clipboard history, one-click capture tools, your recent captures, a
file shelf, todo lists and what's playing, in one panel.

**[Watch the demo (media/glide-demo.mp4)](media/glide-demo.mp4)**

Runs on Windows 10 (2004 or later) and Windows 11, x64. Built with Electron, React and a little
Win32 via [koffi](https://koffi.dev).

## Features

- **Clipboard history.** Text, links, colours, code, images and files, each tagged with the app it
  came from. Click an item to paste it back into the app you were in; Shift-click just copies it.
  Pin the things you reuse, search everything, save images to Downloads with one click.
- **Tools row.** Buttons that slide the panel out of the way and then press a shortcut, open an app
  or file, or open a website. Rename them, change icons and colours, add your own.
- **Captures.** Your latest screenshots and recordings, live. Click to copy, double-click to open,
  drag the real file into Discord, a browser or anywhere else. Hover a video to preview it.
- **Shelf.** Drop files on Glide to park them while you switch apps, then drag them back out.
  Dragging a file onto the pill opens Glide straight onto the Shelf.
- **Todo.** Mirrors [QuickTodo](#companion-apps) lists, synced both ways (optional).
- **Now playing.** Title, artist, artwork and controls for anything that uses the Windows media
  controls (Spotify, browsers, most players).
- **Glass that stays out of the way.** Live, frozen or solid material; light, dark or auto theme;
  accents; adjustable width; reduced motion. Glide is hidden from screenshots and screen
  recordings, pauses while a full-screen app or game is in front, and leaves the rest of the screen
  edge free for scrollbars.

## Keyboard and mouse

| Action | Default |
|---|---|
| Open / close | Click the pill on the screen edge, or hover (see below) |
| Show / hide Glide | <kbd>Win</kbd> + <kbd>Shift</kbd> + <kbd>X</kbd> |
| Open straight into clipboard search | <kbd>Win</kbd> + <kbd>Alt</kbd> + <kbd>V</kbd> |
| Move through clipboard results | <kbd>↑</kbd> / <kbd>↓</kbd>, then <kbd>Enter</kbd> to paste or <kbd>Shift</kbd> + <kbd>Enter</kbd> to copy only |
| Close, or go back from Settings | <kbd>Esc</kbd> |
| Keep the panel open while you work | Pin button |

Both global shortcuts can be changed under Settings.

### Screen edge and opening

Out of the box Glide lives on the **right** edge and opens on **click**: the pill wakes up as your
cursor gets close, and only the pill itself takes clicks, so the scrollbars of maximised windows
keep working along the rest of the edge.

If you'd rather have it on the **left** and open on **hover**, set Settings → Screen edge → Left and
Settings → Open with → Hover. In hover mode, resting the cursor at the edge opens the panel (the
delay, and whether the whole edge or only its middle counts, are adjustable) and dragging a file to
the edge opens the Shelf. The tray menu can pause hover reveal temporarily.

### Several screens

With more than one screen, Settings → Screen picks where Glide lives. **Auto** (the default) follows
your cursor to the chosen edge of any screen whose edge is free; picking a screen pins the pill and
the panel to that screen, even when its edge touches another screen (click works best there).
Settings → Pause on decides what a full-screen app does: **That screen** hides Glide only on the
screen showing the game or video, **All screens** hides it everywhere while one is up.

## Companion apps

Glide works on its own. Two small companion apps plug into it if you have them:

- **SharpShot**, the screenshot and screen-recording tool Glide is built around. It ships with this
  repo in [`sharpshot/`](sharpshot) (a submodule of
  [Leonxlnx/SharpShot](https://github.com/Leonxlnx/SharpShot), MIT). It comes in two flavours:
  [SharpShot Studio](https://github.com/Leonxlnx/SharpShot/tree/main/desktop) (capture, library
  and editor) and SharpShot Quick (a tiny native tray app). With Studio installed, the tools row has
  Screenshot, Record and Studio buttons (<kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> / <kbd>A</kbd> /
  <kbd>E</kbd>), and Captures follows its library live (`%APPDATA%\sharpshot-studio\library.json`).
  See [Build SharpShot](#build-sharpshot) below.
- **QuickTodo**, a tiny <kbd>Alt</kbd>+<kbd>Q</kbd> todo app. The Todo section mirrors its lists
  (`%APPDATA%\QuickTodo\todos.json`) both ways. QuickTodo only reads that file at startup, so to
  apply edits made in Glide, Glide asks it to save, applies the edits and restarts it hidden. It
  never does this while QuickTodo's window is in use.

On first run Glide checks which of these are present. Without SharpShot Studio, Screenshot and
Record press the Windows Snipping Tool shortcuts (<kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, and
<kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> on Windows 11), and Captures watches
`Pictures\Screenshots` if that folder exists, or any folder you pick. Without QuickTodo, its tool
and the Todo section start hidden. All of this can be changed later in Settings.

## Install from source

You need:

- Windows 10 (2004 or later) or Windows 11, x64
- [Node.js](https://nodejs.org) 20.11 or newer (22 LTS recommended), with npm
- Git

```powershell
git clone --recursive https://github.com/Leonxlnx/glide.git
cd glide
npm install
npm run build      # renderer -> dist/
npm start          # run from source
```

Already cloned without `--recursive`? Run `git submodule update --init` to fetch `sharpshot/`.

### Build SharpShot

SharpShot lives in `sharpshot/` and builds on its own (Glide doesn't need it to run):

```powershell
cd sharpshot
.\build.ps1                    # SharpShot Quick: native tray app, needs only .NET Framework 4.8
cd desktop
npm ci; npm run build          # SharpShot Studio: Electron app, Node.js 22.12+
```

Full instructions are in [`sharpshot/README.md`](https://github.com/Leonxlnx/SharpShot#readme) and
[`sharpshot/desktop/README.md`](https://github.com/Leonxlnx/SharpShot/blob/main/desktop/README.md).
Run either Studio or Quick, not both: they share the same global shortcuts.

Glide registers global shortcuts and allows a single instance, so quit any installed copy first
(tray icon → Quit Glide).

### Install for everyday use

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

This packages Glide into `out\Glide-win32-x64`, copies it to `%LOCALAPPDATA%\Programs\Glide`, adds a
Start menu shortcut, registers it to start at login and launches it. To remove it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1            # app and data
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1 -KeepData  # keep settings and history
```

The install steps run in a separate process started through WMI. That's deliberate: when a script
runs inside a packaged (MSIX / Store) app, Windows can redirect its registry and AppData writes into
that app's private copy, and the login entry would silently never fire.

Pre-built downloads may appear under [Releases](https://github.com/Leonxlnx/glide/releases) later.

### Optional: the now-playing helper

Now playing works out of the box through Windows PowerShell. A small compiled helper
(`electron/helper/GlideMedia.cs`) does the same with less memory and also keeps the live glass
smooth. It isn't checked in. Building it needs the .NET Framework 4.x compiler that ships with
Windows (`csc.exe`) and the [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/)
(for `Windows.winmd`):

```powershell
node scripts/build-helper.js   # writes electron/helper/glide-media.exe
```

`npm run package` and `scripts\install.ps1` include the helper when it exists.

### Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build the renderer and start Glide |
| `npm run package` | Build and package into `out\Glide-win32-x64` |
| `npm run icons` | Re-render the icons in `assets/` |
| `scripts\export-clipboard-images.ps1` | Copy every image in the clipboard history to a folder (`-List`, `-Since`, `-Dest`). Never changes the history |

## Configuration

Everything is under Settings (the sliders icon in the panel, or the tray menu): screen edge, width,
click or hover to open, hover delay and trigger zone, theme, accent, glass material and tint, which
sections show and in what order, the tools row, global shortcuts, clipboard retention, the capture
source, hiding from screen capture, pausing in full screen (on that screen or all of them), which
screen to use and launch at login.

Settings are plain JSON in `%APPDATA%\Glide\settings.json`.

## Privacy

- **Everything stays on your machine.** Glide makes no network requests of its own. Clipboard
  history, copied images, the shelf and settings live in `%APPDATA%\Glide` and nowhere else.
- **Clipboard history is bounded.** By default it keeps up to 300 items from the last 3 days; pinned
  items stay until you unpin them. Both limits are adjustable, and history can be switched off.
- **Private copies are skipped.** Anything a password manager (or any other app) marks as excluded
  from clipboard history (`ExcludeClipboardContentFromMonitorProcessing`,
  `CanIncludeInClipboardHistory`) is never recorded.
- **Invisible to screen capture.** By default the panel is excluded from screenshots, recordings and
  screen sharing, so it never ends up in a shot or a call. Turn this off in Settings if you want to
  record Glide itself.

## Project layout

```
electron/
  main.js         windows, edge detection, live glass, global shortcuts, tray, IPC
  native.js       Win32 via koffi: input, focus, clipboard formats, capture exclusion
  clipboard.js    clipboard history
  captures.js     SharpShot Studio library or folder watcher
  media.js        now playing (compiled helper, or media.ps1 as a fallback)
  quicktodo.js    optional QuickTodo sync
  store.js        settings defaults and JSON persistence
  preload.js      the bridge the renderer talks to
  helper/         GlideMedia.cs, the optional now-playing helper
src/
  sidebar/        the React panel (Motion springs), its sections and Settings
  handle/         the edge pill
  styles/         design tokens and glass materials
  lib/            renderer helpers; bridge.js falls back to a mock so the UI also runs in a browser
scripts/          install, uninstall, package, helper build, icons, clipboard export
assets/           app and tray icons
sharpshot/        SharpShot Quick + Studio, the capture tools (git submodule)
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Leon Lin
