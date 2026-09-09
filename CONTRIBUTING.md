# Contributing

Thanks for your interest in Automated DJ Mix. Issues and pull requests are welcome.

Found a **security vulnerability**? Do not open a public issue — follow
[SECURITY.md](SECURITY.md) instead.

## Good first contributions

- **Persistent mix storage.** Output currently goes to the OS temp directory, so mixes vanish
  on restart and don't work across instances. Object storage would fix both.
- **Clear the `exhaustive-deps` warnings** in the mixer components. Four remain; fixing them
  properly means checking the callbacks don't re-run on every render.
- **Remove or finish `/api/mix-pro`** — the Pro tab posts to `/api/mix-smart`, so that route
  is dead code that's still deployed.
- **Progress reporting** for long analyses, beyond the current spinner.
- **Tests.** There are none yet; the analysis output shape and the filter-graph builders in
  `src/utils/ffmpeg.ts` are the obvious places to start.

## Setting up

You need **Node 20.19+**, **Python 3.10+** and **FFmpeg** on your `PATH`.

```bash
git clone https://github.com/SurefireStudios/emcdjapp.git
cd emcdjapp
npm install     # also creates .venv and installs requirements.txt
npm run dev     # http://localhost:4000
```

`npm install` runs `scripts/setup.js`, which verifies Python and FFmpeg are present, creates
`.venv`, and installs the Python dependencies into it. If you need to skip that — in CI, say —
use `npm ci --ignore-scripts`.

For vocal separation in Virtual DJ mode, additionally install the optional extras
(`requirements-vocals.txt`); see the README.

## How it fits together

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Tab shell that mounts one of the four mixers |
| `src/components/*Mixer.tsx` | Per-mode UI: uploads, per-track analysis, settings, submit |
| `src/app/api/analyze/` | Starts a background analysis job; polled by the client |
| `src/app/api/mix*/` | One route per mode; parses the request and calls into `utils/ffmpeg` |
| `src/utils/ffmpeg.ts` | Builds the FFmpeg filter graph for each mode |
| `src/types/audio.ts` | Shared analysis types used by both client and server |
| `scripts/analyze.py` | librosa analysis: BPM, key, beats, downbeats, sections |
| `scripts/split.py` | Optional demucs two-stem vocal separation |

Two things worth knowing before you change the pipeline:

- **`scripts/analyze.py` prints JSON on its last stdout line.** The API parses that line, so
  anything else you print must go to stderr or come before it.
- **Types are shared through `src/types/audio.ts`**, not `src/utils/ffmpeg.ts`. Client
  components must not import from `utils/ffmpeg`, or `fluent-ffmpeg` ends up in the browser
  bundle. `utils/ffmpeg.ts` re-exports the types for server-side callers.

## Conventions

- **TypeScript, no `any`.** `@typescript-eslint/no-explicit-any` is an error. Catch clauses
  bind `unknown` — use `getErrorMessage()` from `src/utils/errors.ts` to report them.
- **Resolve Python per platform.** The venv interpreter is `.venv/Scripts/python.exe` on
  Windows and `.venv/bin/python3` elsewhere. Hard-coding either one breaks the other; this was
  a real bug in `mix-virtual`.
- **Optional dependencies must degrade.** demucs may not be installed — Virtual DJ mode
  catches the failure and mixes without vocal isolation. Keep that behaviour.
- **Clean up temp files.** The mix routes create temp directories; remove them in a `finally`.
- **No debug logging in shipped code.** Gate diagnostics behind an explicit check.

## Before opening a pull request

Run what CI runs:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

CI additionally installs `requirements.txt` on a clean machine and runs the analyzer against
`test.mp3`, asserting the JSON contains a plausible BPM, duration, beat grid and sections — so
a change that breaks the Python contract fails the build.

If you touched the mixing engine, generate a mix locally and actually listen to it. Filter
graphs can be syntactically valid and still sound wrong, and nothing in CI catches that.

Then describe what you changed, and which Node, Python and FFmpeg versions you tested with.

## Reporting a bug

[Open an issue](https://github.com/SurefireStudios/emcdjapp/issues) with your Node, Python and
FFmpeg versions, the mode you used, what you uploaded (format, length), and the error — plus
anything relevant from the server console.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE), the
same terms as the rest of this project.
