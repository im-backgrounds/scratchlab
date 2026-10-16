---
name: Scratch Chart Authoring
description: "Use when adding or editing DJ scratch chart data, notation rendering, or chart playback. Covers chartCatalog tokens and keeping the score synchronized with sound."
applyTo: "**/*.js"
---

# Scratch Chart Rules

- Store shareable chart definitions as `{ name, difficulty, beat, score }`. `score` is an array of bars; nested arrays divide their parent's time equally.
- Parse each token positionally: standalone `K` (keep) with an optional repeat count from 1 to 128; or first character `F` (forward) or `B` (backward), optional second modifier `O`, `M`, `C`, or `F`, then an optional repeat count from 1 to 128. Thus `FF` means forward-flare and `BC3` means three backward chops. `K` is not a modifier; reject tokens such as `FK` and `BK`.
- The fader starts open. `O` marks OFF→ON and `M` marks ON→OFF. An omitted modifier preserves the current fader state; `-` continues the last direction with the fader open.
- `M` occupies time but has no audible stroke or diagonal line. `C` plays one audible burst then stays muted for the rest of that event; `F` has a brief initial mute, then plays one sustained reopened tail through the event end and any contiguous same-direction modifier-free F/B or `-` events with a normal stroke fade. Both leave the compiled fader open for the next token; numeric suffixes repeat the token evenly within its allocated duration. K terminates audio-run extension; preceding sound must not be extended through a K event.
- `K` occupies time and draws a horizontal line that connects adjacent strokes. It cuts off any remaining scratch-audio tail at its start, but click sounds continue normally and the fader state is unchanged. Apply the same line logic whether same-direction strokes have one or multiple K events between them: calculate diagonal slope using only non-K durations, excluding K durations from the moving span. Set each K line at the endpoint height of the nearest preceding non-K token, regardless of preceding or following directions; within a continuous same-direction diagonal, use that token's interpolated endpoint on the full non-K-only slope.
- Keep imported metadata and `beat` when editing and exporting. Reject malformed beat strings, empty subdivisions, unsupported tokens, and a compiled bar grid over 768 ticks with a useful error.
- Derive the score drawing, fader marks, timeline, and audio events from the same compiled events. Do not maintain separate hand-authored timing for playback.
- Read scores left to right: horizontal position is time; upward diagonals are forward and downward diagonals are backward.
- Do not add external links to chart UI or guides unless the user explicitly requests them.
- After adding a chart, verify its subdivisions, direction, muted spans, fader marks, import/export round-trip, and playback in the browser; check for runtime errors.
