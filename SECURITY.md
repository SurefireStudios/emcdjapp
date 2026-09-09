# Security Policy

Automated DJ Mix accepts file uploads, shells out to FFmpeg and Python, and serves rendered
files back over HTTP. If you deploy it publicly, the notes below matter.

## Supported versions

Fixes land on `main` and the latest release. There is no long-term support branch.

## Reporting a vulnerability

**Please do not open a public issue for an unpatched vulnerability.**

Use either channel:

1. **GitHub Security Advisories** — the
   [Report a vulnerability](https://github.com/SurefireStudios/emcdjapp/security/advisories/new)
   form on this repository. This is the preferred route.
2. **Email** — contact [Surefire Studios](https://www.surefirestudios.io) via the details on
   our site, with `emcdjapp security` in the subject line.

Please include, where you can:

- The affected endpoint or script, and the commit you tested
- Steps to reproduce, ideally with a minimal proof of concept
- Your Node, Python and FFmpeg versions
- Your assessment of the impact

### What to expect

- We aim to acknowledge a report within **7 days**.
- We will confirm the issue and share a rough remediation timeline.
- Once a fix ships, we will credit you in the release notes unless you prefer otherwise.

## Scope

**In scope** — everything in this repository: the API routes, the mixing utilities, the
Python scripts, and the setup tooling.

Areas we are particularly interested in:

- **Path traversal** in `/api/download`. It resolves with `path.basename()` and reads only
  from the temp output directory; a bypass would be a real finding.
- **Command injection** through file names or user-supplied values that reach FFmpeg or a
  Python subprocess.
- **Resource exhaustion** — uploads are analysed and re-encoded, so unbounded input size or
  concurrency is a denial-of-service surface.
- **Anything letting an uploaded file escape the temp directory** it is written to.

**Out of scope:**

- Vulnerabilities in FFmpeg, librosa, demucs, Node or Next.js themselves — report those
  upstream (we will happily bump a dependency once a fix exists)
- Issues that require local access to the machine running the server

## Deployment notes

This project ships as a development-grade application. Before exposing it publicly:

- **There is no authentication.** Every endpoint is open, including the ones that spend CPU
  transcoding audio. Put it behind auth or a private network.
- **There is no upload size or rate limit** in the application. Enforce both at your proxy.
- **Rendered mixes are readable by anyone who knows the filename**, which is a timestamp —
  guessable. Do not use it for material that must stay private.
- **Uploads and outputs go to the OS temp directory** and are not cleaned on a schedule; on a
  long-lived instance, disk use grows.
- **Analysis job files are written to temp too**, keyed by job id, and are similarly guessable.

## Handling of uploaded audio

Audio you upload is written to a temp directory, passed to FFmpeg and Python by path, and
deleted after the request where the route does so. Nothing is sent to a third-party service —
all analysis and mixing happens on the machine running the app.
