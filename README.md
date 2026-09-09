<div align="center">

# Automated DJ Mix

**Drop in a folder of tracks and get back a single continuous DJ mix — beat-matched, key-aware and cut on the downbeat.**

[![License: MIT](https://img.shields.io/github/license/SurefireStudios/emcdjapp?color=blue)](LICENSE)
[![CI](https://github.com/SurefireStudios/emcdjapp/actions/workflows/ci.yml/badge.svg)](https://github.com/SurefireStudios/emcdjapp/actions/workflows/ci.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab?logo=python&logoColor=white)](https://www.python.org)
[![Stars](https://img.shields.io/github/stars/SurefireStudios/emcdjapp?style=flat)](https://github.com/SurefireStudios/emcdjapp/stargazers)

Built by **[Surefire Studios](https://www.surefirestudios.io)**

</div>

---

## What it does

Upload some tracks in the browser. A Python engine analyses each one — tempo, musical key,
beat and downbeat grid, and where the energy rises and falls. FFmpeg then stitches them into
one mix, tempo-matching neighbours, snapping every cut to a downbeat, and crossfading over a
window derived from the tempo rather than a fixed number of seconds.

The result is a single MP3 you can preview on a waveform and download.

Four mixing modes, each with its own tab:

| Mode | What it's for |
| --- | --- |
| **Basic** | Trim and crossfade tracks into a continuous mix. No analysis needed |
| **Pro** | Structure-aware. Orders tracks by energy, matches tempo and cuts on downbeats |
| **Mashup** | Lays several vocal tracks over one instrumental, aligned to the instrumental's downbeats |
| **Virtual DJ** | Structure-based arrangement that can isolate the outgoing vocal so transitions don't clash |

---

## ✨ Features

- **Real audio analysis, not guesswork** — tempo, Krumhansl-Schmuckler key detection, beat and downbeat tracking, and MFCC-based section segmentation via [librosa](https://librosa.org)
- **Downbeat-aligned cuts** — entry and exit points snap to the nearest downbeat, so transitions land on the one
- **Tempo-aware crossfades** — crossfade length is derived from BPM, and neighbouring tracks are tempo-matched with a chained `atempo` filter
- **Energy-ordered sets** — Pro mode groups tracks by energy and sorts by tempo inside each group, so a set builds instead of lurching
- **Optional vocal separation** — Virtual DJ mode can run [demucs](https://github.com/adefossez/demucs) over the outgoing section to drop the vocal under an incoming track
- **Waveform preview** — every generated mix is playable in-page via [wavesurfer.js](https://wavesurfer.xyz)
- **Async analysis with polling** — long analyses run as background jobs, so they survive proxy timeouts on hosts like Render
- **Runs anywhere** — a Dockerfile provisions FFmpeg, Python and the whole stack

---

## 🖥 Requirements

| | |
| --- | --- |
| **Node.js** | 20.19+ (Next.js 16 needs ≥ 20.9; the lint toolchain needs ≥ 20.19) |
| **Python** | 3.10+, on your `PATH` |
| **FFmpeg** | On your `PATH` — the mixing engine shells out to it |

Everything else is installed for you.

---

## 🚀 Getting started

```bash
git clone https://github.com/SurefireStudios/emcdjapp.git
cd emcdjapp
npm install
npm run dev
```

Then open **<http://localhost:4000>**.

`npm install` runs [`scripts/setup.js`](scripts/setup.js), which checks for Python and FFmpeg,
creates a `.venv`, and installs [`requirements.txt`](requirements.txt) into it. If Python or
FFmpeg is missing it stops with instructions rather than failing later at runtime.

### Optional: vocal separation

Virtual DJ mode can isolate the outgoing vocal, which needs demucs and PyTorch — a
multi-gigabyte download, so it is **not** installed by default:

```bash
# macOS / Linux
.venv/bin/pip install -r requirements-vocals.txt
```

```bash
# Windows
.venv\Scripts\pip install -r requirements-vocals.txt
```

Without it, Virtual DJ mode still works — it just mixes without isolating vocals.

### Docker

```bash
docker build -t emcdjapp .
docker run -p 3000:3000 emcdjapp
```

The image installs FFmpeg, Python and `requirements.txt`, then builds and serves the app on
port 3000. Vocal separation is not included in the image, for the size reason above.

---

## 📖 Usage

1. Pick a mode — **Basic**, **Pro**, **Mashup** or **Virtual DJ**.
2. Add your tracks. Everything except Basic analyses each file first; the detected BPM and key
   appear per track as it finishes.
3. Adjust that mode's controls — crossfade length, how much of each track to play, volumes for
   mashups, whether to let the last track run to the end.
4. Generate. The mix renders server-side and appears in a waveform player.
5. Play it back and download the MP3.

Generated mixes are written to the system temp directory and served through `/api/download`,
so they are not permanent — download anything you want to keep.

---

## 🧠 How it works

```
 Browser                    Next.js API                 Engines
 ───────                    ───────────                 ───────
 upload track  ─────────▶   /api/analyze     ─────────▶ scripts/analyze.py
                            (async job +                 librosa: BPM, key,
                             polling)        ◀────────── beats, downbeats,
                                                         sections, energy
 choose mode   ─────────▶   /api/mix
 + settings                 /api/mix-smart   ─────────▶ src/utils/ffmpeg.ts
                            /api/mix-mashup              fluent-ffmpeg filter
                            /api/mix-virtual ─────────▶  graphs → FFmpeg
                                    │
                                    │         (Virtual DJ only)
                                    └───────▶ scripts/split.py
                                              demucs two-stem split

 preview + download ◀────   /api/download
```

**Analysis** ([`scripts/analyze.py`](scripts/analyze.py)) returns tempo, key, the beat and
downbeat grid, energy-labelled sections, and suggested entry/exit points. Key detection uses
Krumhansl-Schmuckler profiles over a chromagram; sections come from agglomerative clustering
of beat-synchronised MFCCs.

**Mixing** ([`src/utils/ffmpeg.ts`](src/utils/ffmpeg.ts)) builds an FFmpeg filter graph per
mode — trimming at downbeats, chaining `atempo` filters to bridge tempo differences, and
crossfading over a window scaled to the tempo.

Analysis runs as a **background job**: `/api/analyze` returns a job id immediately and the
client polls for the result, which is what lets long tracks survive platform request timeouts.

---

## 📁 Project structure

```
emcdjapp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Tabbed shell for the four mixers
│   │   └── api/
│   │       ├── analyze/          # Starts analysis, polled for the result
│   │       ├── mix/              # Basic mix
│   │       ├── mix-smart/        # Pro mix
│   │       ├── mix-mashup/       # Mashup mix
│   │       ├── mix-virtual/      # Virtual DJ mix
│   │       └── download/         # Serves a rendered mix
│   ├── components/               # BasicMixer, ProMixer, MashupMixer,
│   │                             # VirtualDJMixer, FileUploader, AudioPlayer
│   ├── types/audio.ts            # Shared analysis types
│   └── utils/
│       ├── ffmpeg.ts             # Filter-graph construction for every mode
│       └── errors.ts             # Error message narrowing
├── scripts/
│   ├── analyze.py                # librosa analysis engine
│   ├── split.py                  # demucs vocal separation (optional)
│   └── setup.js                  # postinstall environment check + venv
├── requirements.txt              # Python deps for analysis
├── requirements-vocals.txt       # Optional demucs / PyTorch deps
└── Dockerfile
```

---

## 🧰 Tech stack

| Layer | Used |
| --- | --- |
| Framework | Next.js 16 (App Router) with React 19 |
| Language | TypeScript 5, Python 3.10+ |
| Styling | Tailwind CSS 4 |
| Audio analysis | librosa, NumPy, SciPy, scikit-learn |
| Audio processing | FFmpeg via fluent-ffmpeg |
| Vocal separation | demucs + torchaudio *(optional)* |
| Waveforms | wavesurfer.js |
| Icons | lucide-react |

---

## 🛠 Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port **4000** |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

---

## ⚠️ Known limitations

- **Mixes are temporary.** Output goes to the OS temp directory, so it disappears on restart
  and isn't shared between instances. Download what you want to keep.
- **Analysis is CPU-heavy.** A long track can take minutes on a small instance; sample rate and
  hop length are already tuned down for this.
- **Vocal separation needs demucs**, a large optional install that isn't in the Docker image.
- **`/api/mix-pro` is unused.** The Pro tab posts to `/api/mix-smart`; the older route is still
  present but nothing calls it.
- Four `react-hooks/exhaustive-deps` warnings remain in the mixer components. They're left
  alone deliberately — adding the missing dependencies changes when those callbacks re-run and
  needs testing against real uploads.

---

## 🤝 Contributing

Issues and pull requests are welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for local
setup, the conventions this codebase follows, and how to run the same checks CI does.

> [!CAUTION]
> Found a security vulnerability? **Don't open a public issue** — follow [SECURITY.md](SECURITY.md) to report it privately.

---

## 📄 License

Released under the **MIT License** — see [LICENSE](LICENSE).

FFmpeg, librosa and demucs are separate projects under their own licenses; if you redistribute
a build that bundles them, check their terms.

---

## 🔗 Links

- 🌐 **Surefire Studios** — <https://www.surefirestudios.io>
- 🐛 **Issues** — <https://github.com/SurefireStudios/emcdjapp/issues>

<div align="center">
<sub>Built by <a href="https://www.surefirestudios.io">Surefire Studios</a>.</sub>
</div>
