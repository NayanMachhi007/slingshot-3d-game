# SkySling 3D — Physics Slingshot Shooting Game

A complete, browser-based 3D physics slingshot game inspired by Angry Birds, built with **HTML5, CSS3, ES6 JavaScript, Three.js, and Cannon-es** (loaded via CDN ES modules — no npm install or build step required).

## How to Run Locally

Because the game uses modern ES Modules (`import ... from './js/...'`), browsers require serving the folder over `http://localhost` instead of double-clicking `index.html` directly.

Choose any one option below after extracting the ZIP:

### Option 1: VS Code Live Server (Easiest)
1. Open the extracted `slingshot-3d-game` folder in **VS Code**.
2. Right-click `index.html` → **Open with Live Server**.

### Option 2: Python (Windows / Mac / Linux)
Open a terminal inside the extracted `slingshot-3d-game` folder and run:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in Chrome or Edge.

### Option 3: Node.js
```bash
npx serve .
```

## Controls
- **Aim & Shoot:** Click/touch directly on the projectile in the slingshot and drag backward/sideways. Release to launch.
- **Special Abilities (Mid-Air):** Click anywhere or press `Space` while a **Tri-Splitter** (blue) or **Blast Bomb** (black) is flying.
- **Inspect 3D Fortress:** Drag anywhere outside the slingshot to orbit, scroll to zoom, or press `V` / click **Inspect** to toggle fortress camera.
- **Skip Wait:** Click **Next Shot** or press `Space` after impact.
- **Restart Level:** Press `R` or click **Restart**.
- **Mute Audio:** Press `M` or click the speaker icon.

## Project Structure
```text
slingshot-3d-game/
├── index.html        # App shell, HUD, modals, and CDN import map
├── css/
│   └── style.css     # Glassmorphic HUD, responsive layout & animations
├── js/
│   ├── main.js       # UI state wiring & event handlers
│   ├── game.js       # Three.js renderer, Cannon-es physics, slingshot & camera
│   ├── levels.js     # 3 handcrafted 3D fortresses (Outpost, Twin Forts, Pyramid)
│   ├── textures.js   # Procedural Canvas textures (grass, wood, stone, glass, targets)
│   ├── particles.js  # 3D shatter particles, shockwaves & floating score popups
│   └── audio.js      # Procedural Web Audio API sound effects
└── README.md
```
