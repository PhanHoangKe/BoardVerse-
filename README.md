<div align="center">

# BOARDVERSE AI PLATFORM
### High-Performance Hybrid Chess & Xiangqi Intelligence Arena

[![Version](https://img.shields.io/badge/Version-3.5.0-black?style=flat-square&logo=git&logoColor=white)](https://github.com/PhanHoangKe/BoardVerse-)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js_18+-22c55e?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Chess Engine](https://img.shields.io/badge/Chess_Engine-Stockfish_18_%2F_19_AVX2-3b82f6?style=flat-square&logo=cpu&logoColor=white)](https://stockfishchess.org/)
[![Xiangqi Engine](https://img.shields.io/badge/Xiangqi_Engine-Fairy--Stockfish_14.0.1_XQ-e11d48?style=flat-square)](https://fairy-stockfish.github.io/)
[![Architecture](https://img.shields.io/badge/Architecture-Hybrid_WASM_+_Native-f59e0b?style=flat-square)](https://github.com/PhanHoangKe/BoardVerse-)
[![Platform](https://img.shields.io/badge/PWA-Cross--Platform_Ready-6366f1?style=flat-square&logo=pwa&logoColor=white)](https://github.com/PhanHoangKe/BoardVerse-)
[![License](https://img.shields.io/badge/License-GPLv3-10b981?style=flat-square)](LICENSE)

<p align="center">
  <b>A unified, production-grade intelligence platform for International Chess and Chinese Chess (Xiangqi).</b><br>
  Powered by native multi-core C++ engines, client-side WebAssembly SIMD, independent AI coaching, non-linear win-rate analysis, and progressive web app capabilities.
</p>

[Quick Start](#-quick-start) • [Core Capabilities](#-core-capabilities) • [System Architecture](#-system-architecture) • [PWA Mobile Installation](#-mobile-pwa-installation) • [Deployment](#-cloud-deployment)

---

</div>

## 1. Executive Summary

**BoardVerse AI Platform** represents a modern, decoupled chess computation architecture engineered for Grandmaster-level evaluation speed and accuracy. The platform employs a **Hybrid Compute Model**:

* **Client Layer:** Standalone execution via WebAssembly (WASM SIMD + SharedArrayBuffer) enabling offline-capable tactical analysis directly on browser threads.
* **Server Layer:** Persistent multi-threaded native C++ daemons (Stockfish 18/19 AVX2 & Fairy-Stockfish 14.0.1 XQ NNUE) with server-side LRU caching and sliding-window concurrency control.
* **Data Layer:** Strict separation between Chess cloud services (Lichess Opening Explorer, Cloud Eval, Syzygy 7-Piece Tablebase) and Xiangqi canonical master opening trees.

---

## 2. Core Capabilities

### [A] International Chess Arena
* **Stockfish 18 / 19 Dual Stack:** Seamless routing between native 64-bit AVX2 binaries (backend) and WASM SIMD (client) achieving CCRL 3600+ Elo ratings.
* **Independent AI Coach:** Isolated search worker delivering maximum depth analysis (Depth 38+) without leaking computation parameters to the bot opponent.
* **Non-Linear Game Review:** Precision loss classification based on standard sigmoid winning chance modeling:
  $$W(cp) = 50 + 50 \times \left( \frac{2}{1 + \exp(-0.00368208 \times cp)} - 1 \right)$$
* **Grandmaster Telemetry:** Real-time MultiPV candidate evaluation (1–5 lines), live Centipawn Eval Bar, and directional SVG tactical vectors.

### [B] Xiangqi (Chinese Chess) Arena
* **Fairy-Stockfish 14.0.1 XQ NNUE:** Dedicated largeboard neural network evaluation engine optimized for Xiangqi piece dynamics.
* **Master Opening Book (`XiangqiOpeningBook`):** Built-in weighted opening tree supporting canonical formations (*Central Cannon, Screen Horse, Same/Opposite Direction Cannons, Elephant Opening, Pawn Opening*).
* **Decoupled Data Pipeline:** 100% independent from Chess-specific APIs, ensuring zero failed requests or invalid tablebase probes.

### [C] Production Hardening & Security
* **In-Memory LRU FEN Cache:** Sub-millisecond ($<1\text{ ms}$) response times for repeated positions and theoretical book lines.
* **Sliding-Window Rate Limiter:** Hard cap of 60 requests/minute per client IP to safeguard computational resources.
* **Concurrency Semaphore:** Dynamic thread ceiling bounded by $\max(2, N_{\text{CPU}} - 1)$ to prevent host CPU starvation.
* **Strict Input Sanitization:** Regex-based validation for 8-rank Chess and 10-rank Xiangqi FEN structures to eliminate injection risks.

---

## 3. System Architecture

```
[ Tier 1: Client Browser / PWA ]
  ├── UI Layer (Vanilla JS + Tailwind Dark Theme + SVG Glow Vectors)
  ├── Stockfish 18 WASM SIMD Worker (Client Offline Fallback)
  └── Fairy-Stockfish WASM NNUE Worker (Client Xiangqi Fallback)
          │
          ▼  HTTP POST /api/chess/analyze & /api/xiangqi-engine/analyze
[ Tier 2: Backend BoardVerse Core (:3001) ]
  ├── API Gateway (CORS + COOP/COEP Headers + Sliding-Window Rate Limiter)
  ├── FEN/PGN Regex Security Sanitizer
  ├── In-Memory LRU Cache (1,000 Entries / 15m TTL)
  ├── Concurrency Semaphore Guard
  └── Native Worker Pools (Stockfish AVX2 + Fairy-Stockfish NNUE Daemon)
          │
          ▼  HTTPS Remote REST (Chess Only)
[ Tier 3: External Datasets ]
  ├── Lichess Masters Opening Explorer (Chess Only)
  ├── Lichess Cloud Evaluation API (Chess Only)
  └── Syzygy 7-Piece Tablebase API (Chess Only)
```

---

## 4. Quick Start

### Prerequisites
* **Node.js:** v18.0.0 or higher
* **Browser:** Modern Chromium, Safari, or Firefox with WebAssembly support

### Installation & Execution
```bash
# 1. Clone the repository
git clone https://github.com/PhanHoangKe/BoardVerse-.git
cd BoardVerse-

# 2. Install dependencies
npm install

# 3. Start the production-hardened server
node server.js
```

The application will be accessible at:  
`http://localhost:3001`

---

## 5. Mobile PWA Installation

BoardVerse is fully compliant with modern **Progressive Web App (PWA)** specifications for native-like performance:

| Platform | Installation Procedure |
| :--- | :--- |
| **iOS / iPadOS (Safari)** | Open web URL $\to$ Tap **Share** $\to$ Select **Add to Home Screen**. |
| **Android (Chrome / Edge)** | Open web URL $\to$ Tap menu ($\vdots$) $\to$ Select **Install App**. |
| **Desktop (macOS / Windows)** | Click the **Install App** icon in the browser address bar. |

---

## 6. Cloud Deployment

### 1-Click Deployment via Vercel (100% Free)
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: complete BoardVerse AI release"
   git push -u origin main
   ```
2. Navigate to [vercel.com](https://vercel.com) and import the `BoardVerse-` repository.
3. Deploy with default settings. The included `vercel.json` automatically provisions required `COOP / COEP` headers for maximum WebAssembly SIMD performance.

---

## 7. Repository Structure

```
BoardVerse/
├── index.html                   # Unified Arena Portal (Chess & Xiangqi)
├── chess-battle.html            # Dedicated International Chess Workbench
├── xiangqi.html                 # Dedicated Xiangqi AI Workbench
├── server.js                    # Production Backend Server (:3001)
├── manifest.json                # PWA Web App Manifest
├── sw.js                        # PWA Offline Service Worker
├── vercel.json                  # Vercel Deployment & Security Headers
├── icons/                       # High-resolution Vector & PWA Icons
├── css/
│   └── chess-battle.css        # Core Dark Mode & Visual Styling
├── js/
│   ├── chess-battle/           # Chess Module Stack (Engine, Review, ATM, UI)
│   └── xiangqi/                # Xiangqi Module Stack (Fairy-Stockfish, Book, UI)
├── backend/
│   ├── native-stockfish-service.js   # Stockfish 18/19 Native Controller
│   ├── xiangqi-engine-service.js     # Fairy-Stockfish Worker Pool Controller
│   └── adaptive-time-manager.js      # Heuristic Adaptive Time Management (ATM)
└── PROJECT_SPECIFICATION.md     # Detailed Architectural Specification
```

---

## 8. License & Compliance

* Distributed under the **GNU General Public License v3 (GPLv3)**.
* **Stockfish** and **Fairy-Stockfish** are copyrighted by their respective developer communities under GPLv3.
* UI components, Adaptive Time Management heuristics, and PWA integration developed by **Phan Hoang Ke**.

---

<div align="center">
  <sub>Engineered for the Global Chess & Xiangqi Community.</sub>
</div>

