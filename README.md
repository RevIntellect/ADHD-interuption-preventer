# SpeakAware — ADHD Speaking Coach

A Progressive Web App (PWA) that helps people with ADHD manage speaking and interruptions during meetings. Place your phone near your screen and get real-time visual alerts when you've been talking too long.

## Features

- **Microphone-based speech detection** — Uses Web Audio API to detect when you're speaking
- **Bold red visual alerts** — Full-screen red overlay tells you to pause when you've spoken too long
- **Haptic feedback** — Phone vibrates along with visual alerts (on supported devices)
- **Live stats** — See your speaking %, listening %, and alert count in real-time
- **Session history** — Track your progress across meetings
- **Session summaries** — Get a grade and actionable tips after each meeting
- **Configurable thresholds** — Adjust speaking time limit, cooldown, mic sensitivity, and goals
- **Works offline** — Service worker caches the app for offline use
- **iPhone-optimized** — Add to Home Screen for a native app experience

## Quick Start

1. Serve the files with any static server:
   ```bash
   npx serve .
   ```
2. Open on your iPhone and tap **Share > Add to Home Screen**
3. Open the app from your Home Screen
4. Tap **Start Meeting** and allow microphone access
5. Place your phone where you can see it during the meeting

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Alert threshold | 15s | Seconds of continuous speaking before alert |
| Cooldown | 10s | Seconds between alerts |
| Sensitivity | 5 | Mic sensitivity (1-10) |
| Vibrate | On | Haptic feedback on alerts |
| Speaking goal | 25% | Target speaking percentage |

## Tech Stack

- Vanilla HTML/CSS/JavaScript (no dependencies)
- Web Audio API for microphone analysis
- PWA with Service Worker for offline support
- LocalStorage for session history and settings

## Roadmap

- [ ] Native iOS app (Swift)
- [ ] Calendar integration
- [ ] Meeting type presets
- [ ] Trend charts across sessions
- [ ] Apple Watch companion app
