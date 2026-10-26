# App Startup and Composition Analysis

## Confirmed current behavior

- [`index.html`](../../index.html) loads `src/app.js` directly as a
  `type="module"` script; there is no build-generated entry point.
- [`src/app.js`](../../src/app.js) compiles the chart catalog, creates the store
  and action facade, constructs feature repositories and services, then creates
  view adapters and event handlers. Startup work is performed by the module
  itself rather than through one exported bootstrap function.
- The app module composes the application playback controller with the timer,
  playback rules, audio, views, and Challenge hooks. It also connects input,
  Challenge and course workflows, persistence, and UI. The app remains the
  composition root and owns cross-feature sequencing outside playback ticks.
- [`src/services/midi/input-manager.js`](../../src/services/midi/input-manager.js)
  manages Web MIDI access, device selection, and message delivery.
  [`src/domain/midi-mapping.js`](../../src/domain/midi-mapping.js) maps messages
  into semantic events; `src/app.js` sends MIDI, keyboard, and mouse events
  through shared input handling, compression, and recording.
- Initial controls and views are rendered from the module body, then first-visit
  guidance and the saved session are restored. The app does not depend on a
  server-side runtime or build step.

Evidence: [`README.md` architecture overview](../../README.md),
[`src/app.js`](../../src/app.js), [`index.html`](../../index.html).

## Proposed future design (not current behavior)

A future extraction could introduce a small explicit bootstrap/composition
function that receives browser capabilities and constructs workflows. This is
only a candidate seam; the current app module performs immediate setup, and no
new bootstrap API or dependency-injection design has been approved.

## Compatibility constraints

- Keep startup compatible with static GitHub Pages hosting and native ES
  modules.
- Preserve initialization order, event-handler registration, initial rendering,
  session restoration, and feature side-effect ordering.
- Preserve graceful behavior when optional browser capabilities such as Local
  Storage or Web MIDI are unavailable.
- Do not change DOM ownership or move user-visible behavior as a side effect of
  extracting composition.
