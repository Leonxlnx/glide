# Contributing to Glide

Thanks for helping. Glide is a small Windows app, so the process is light.

## Getting set up

```powershell
npm install
npm run dev        # build the renderer and start Glide from source
```

Quit any installed copy of Glide first (tray icon → Quit Glide): it holds the same global shortcuts
and a single-instance lock. Settings and data for a source build also live in `%APPDATA%\Glide`.

The renderer falls back to a mock bridge (`src/lib/bridge.js`) when it isn't running inside
Electron, which is handy for UI work in a browser.

For automated poking at a running source build, start it with `GLIDE_DEV=1` and send commands with
`scripts\dev.ps1` (see the `devChannel` function in `electron/main.js` for what it understands).

## Pull requests

- Keep changes focused: one fix or feature per pull request.
- Match the existing style: plain JavaScript, small modules, comments that explain why.
- Run `npm run build` before you push; CI runs the same build on Windows.
- Describe what you changed and how you tested it. A short screen recording helps for UI changes.
- Don't commit build output (`dist/`, `out/`), the compiled helper (`electron/helper/*.exe`) or
  anything from your own `%APPDATA%\Glide` (clipboard history, screenshots, settings).

## Reporting bugs

Open an issue with your Windows version, display setup (number of monitors, scaling) and steps to
reproduce. Glide writes a log to `%APPDATA%\Glide\glide.log`; check it for anything personal before
attaching it.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
