# Tachyon — Beyond Space 

A dark, cinematic House Points Calculator for the Tachyon House Cup. It has a real-time WebGL black-hole scene, liquid-glass surfaces, 3D house cards, animated rankings, and persistent local scoring.

## Features
- Four houses: ALPHA (violet), INFER (green), MATRIX (cyan), and LAYER (amber).
- Whole-number scoring only. Empty, negative, decimal, and overflowing entries are rejected with a clear message.
- Live animated score totals and a descending leaderboard with competition ranking (1, 1, 3, 4).
- Tied leaders are shown together. Zero scores never declare a winner; the panel reads "NO WINNER YET".
- Winner celebration (card pulse, toast, confetti, optional sound) fires only when a new sole leader appears, not on every re-render.
- Activity log with house accent, time, and points. Clearing it never changes scores.
- Reset and clear-history actions both use a confirmation dialog. The dialog traps focus, closes with Escape, and returns focus to the trigger.
- Click or keyboard-activate a house card (Enter/Space) to select it for score entry.
- Optional Web Audio sound, off by default, remembered between visits.
- Ray-traced WebGL black hole: light is bent by Schwarzschild-style gravity, a tilted accretion disk spins with Keplerian differential rotation, approaching gas is brighter (Doppler beaming), and the photon ring and lensed starfield are visible. The camera slowly orbits and follows the pointer. Falls back to a CSS scene if WebGL is unavailable or the context is lost.
- Respects `prefers-reduced-motion` (no looping animation, scores update instantly).
- No backend, build step, framework, or paid API.

## Project structure
```text
Tachyon_Beyond_Space/
├── index.html
├── style.css
├── script.js
├── README.md
└── screenshots/
    └── README.txt
```

## Run locally
1. Extract the ZIP.
2. Open `index.html` in a recent Chrome, Edge, or Brave.
3. If your browser restricts localStorage on `file://` URLs, serve the folder with a local server (for example, VS Code Live Server).

## Deploy to GitHub Pages
1. Create or open a GitHub repository.
2. Upload `index.html`, `style.css`, `script.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**, select your main branch and `/ (root)`, then save.
5. Wait for the deployment to finish and open the published URL.

## Data and saving
- Scores and activity are stored in this browser's localStorage under the same keys as v1 (`tachyon-house-points-v1`, `tachyon-house-points-sound-v1`), so existing data carries over.
- Stored data is validated on load. Invalid house scores become 0, and invalid history entries are dropped. Nothing is written until you next change a score or history.
- Scores are per browser and per device. They are not synchronized.

## Browser compatibility
- Written for recent Chrome, Edge, Brave, Firefox, and Safari. This build has not been run in a browser yet, so treat compatibility as unverified. WebGL is used when available.
- `backdrop-filter` glass effects need a modern browser; older browsers show the same layout with more opaque surfaces.
- Google Fonts need an internet connection; system fonts are the fallback.
