# Feature Wishlist

Upcoming features and ideas to explore. Not prioritized — just a collection of things to consider.

## Recent Milestones (since Desktop App — 2026-03-24)

### 2026-03-26

- [x] Window drag to move — title bar drag region for Electron (`-webkit-app-region: drag`), sidebar set to `no-drag`
- [x] Unload Label / Show Label toggle — switch to bare can (no label) state
- [x] Unload Image button — clears uploaded image and hides label simultaneously
- [x] Hydration error fix — `isElectron` managed via `useState` + `useEffect` to resolve SSR/CSR mismatch
- [x] UI Design Base — standalone `ui-design-base/` folder with pure HTML/CSS/JS skeleton for design reference in other projects

### 2026-03-24

- [x] Electron desktop app — native macOS `.dmg` packaging (arm64 + x64), runs as standalone desktop application
- [x] Native file dialogs — PNG save (with Finder reveal), image/sticker open via OS dialog
- [x] Batch export — open multiple images and save multiple PNGs at once via IPC
- [x] Persistent history — recent images/stickers survive app restart (stored in Electron `userData` as JSON)
- [x] Image/sticker rotation slider
- [x] Invert Colors toggle for image/sticker
- [x] Remove Background button — corner flood-fill algorithm
- [x] Sticker recent history (up to 6 thumbnails)
- [x] Editable slider values — click value to type number directly
- [x] Drag inertia — smooth deceleration spin on release
- [x] Level toggle (bottom HUD) — auto-returns can to upright after vertical tilt (~1s spring)
- [x] Drag speed cap (horizontal 1.8 rad/s, vertical 1.2 rad/s)
- [x] Fixed lighting — drag rotates the can itself, not the camera (light position stays)
- [x] PNG export 1920×1920 square, zoom-independent (canonical camera)
- [x] Undo / Redo — ⌘Z / ⌘⇧Z with 400ms debounce history (max 50 steps)

## High Priority

- [ ]
- [ ]

## Nice to Have

- [ ]
- [ ]

## Experimental / Long-term

- [ ]
- [ ]

---

*Last updated: 2026-03-26*
