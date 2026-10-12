# Telemark

A ski jumping game for the browser. Its jump physics is a faithful port of Deluxe Ski Jump 2 (v2.10P, DOS, 2001),
reconstructed from an analysis of the original executable and checked against the original game frame by frame.
Graphics, interface and sound are new, made in the style of the original.

Working title. Status: playable training mode, in development.

## Features

- Jump physics, wind, landing and judges' notes identical to DSJ2 v2.10P (deterministic on every device).
- One built-in hill; the 37 hills of the original become available when you load `Dsj.exe` from your own copy
  of the game. The file is read in the browser and kept only there; nothing from the original is distributed.
- Mouse, keyboard and touch controls; optional tilt steering on phones; haptics where supported.
- Pixel graphics with a responsive width, time of day (day, dusk, night) and weather (snow, fog).
- Synthesised sound (Web Audio, no recordings).
- Hill records, outfit colours and settings saved locally.

## Development

Requirements: Node 24, pnpm 12.

```sh
pnpm install
pnpm dev            # development server
pnpm typecheck
pnpm lint
pnpm test
pnpm build          # production build in dist/
pnpm build:single   # the build packed into one HTML file
```

Tests that compare the port with the original game need its files and recorded traces; without them they are
skipped. See `docs/testing.md`.

## Repository layout

| Path | Contents |
|---|---|
| `src/sim` | the port of the original physics and jump logic |
| `src/original` | readers for the player's original files |
| `src/game`, `src/render`, `src/audio`, `src/ui` | game session, pixel renderer, sound, React screens |
| `src/storage` | local saves |
| `tools/re` | reverse-engineering tools (disassembler, headless DOS emulator, trace capture) |
| `docs` | physics specification, file formats, testing guide (mostly in Polish) |

## Legal

This is an independent project, not affiliated with or endorsed by the authors or publishers of Deluxe Ski Jump.
Deluxe Ski Jump is a name of its respective owner and is used here only to describe compatibility. The repository
contains no files from the original game; the game reads them from the player's own copy, locally.

## License

Not decided yet. Until a license is added, all rights are reserved.
