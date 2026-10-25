# `src/app.js` Responsibility Inventory

## Snapshot and module boundary

This inventory was checked against [`src/app.js`](../../src/app.js) at 2,084
lines and 66,859 bytes. It has 41 static imports, no exports, 92 named function
declarations, and one named arrow-function binding (`isPracticeModeToggle`).
The module executes during import: chart compilation,
repository and service construction, DOM binding, initial rendering, first-visit
guidance, and session restoration all run at module scope. Its functions close
over the same module-level state; there is no exported bootstrap or application
API.

The imports comprise:

- Data: `data/chart-catalog.js`.
- Domain: `score-compiler.js`, `chart-storage.js`, `midi-mapping.js`,
  `performance.js`, `playback-controller.js`, `playback.js`,
  `challenge-session.js`, `bpm-challenge.js`, `keyboard-input.js`,
  `beginner-course.js`, and `achievement-system.js`.
- Audio and state: `audio/scratch-audio.js`, `state/actions.js`, and
  `state/store.js`.
- UI: `controls.js`, `transport.js`, `editor.js`, `midi-mapping.js`,
  `challenge.js`, `beginner-course.js`, `audio-monitoring.js`, `performance.js`,
  `achievements.js`, `saved-charts.js`, `visualizer.js`, and `replay.js`.
- Features: `practice-view.js`, `builder-view.js`, `bpm-challenge-view.js`,
  `challenge-input-readiness.js`, `challenge-navigation.js`,
  `beginner-course-view.js`, `achievement-view.js`, `performance-view.js`,
  `input-event-log.js`, `midi-diagnostic-log.js`, `replay-view.js`,
  `replay-integration.js`, and `ghost-integration.js`.
- Services: `services/midi/input-manager.js`.

The paths above are relative to `src/`. The modules provide domain rules,
repositories, device access, and view adapters; `app.js` still owns their
construction and much of the sequencing between them.

## State and side-effect touchpoints

| Concern | Current module-scope ownership in `app.js` | Source touchpoints |
| --- | --- | --- |
| Catalog and app state | Compiled `chartCatalog`; `store`, `actions`, and shared `state`; `currentView`, chart rename state | `src/app.js:104-125, 250-398` |
| Persistence | Chart repository and first-visit storage; MIDI mapping, performance, Challenge, achievement, and course repositories and loaded values | `src/app.js:122-163, 535-794`; repository schemas remain in their domain modules |
| Input and MIDI | Mapping, learn action, input manager, diagnostic/event logs, MIDI monitor values, raw/compressed/recorded counts, stop observers, keyboard binding, mouse direction and timestamp | `src/app.js:126-153, 863-1271` |
| Playback and audio | Playback controller; loop start/stop, cursor, loop number, boundary state and events; scratch/audio monitor settings and activity timer | `src/app.js:168-173, 276-295, 400-534, 930-1092` |
| Performance and Event Model | Latest record, Challenge summary, timing and analysis chart keys; `performanceView`; shared input recording and analysis calls | `src/app.js:149-158, 910-969, 1272-1279, 1442-1601, 1802-1868` |
| Challenge and course | Active chart key, challenge session/run, selected course stage, course and interruption messages, loop/recording boundaries | `src/app.js:159-185, 1282-1867` |
| DOM and view composition | View adapters plus direct document lookups, event listeners, visibility/blur handling, and initial binding/render sequence | `src/app.js:187-245, 297-398, 984-1092, 1320-1378, 1870-2084` |

The concrete module-scope state and constructed instances are:

| Source range | Identifiers |
| --- | --- |
| `104-125` | `chartCatalog`, `FIRST_VISIT_GUIDANCE_KEY`, `store`, `actions`, `state`, `ghostSelection`, `replaySelection`, `replayView`, `repository`, `firstVisitGuidanceStorage`, `currentView`, `renamingChartId` |
| `126-153, 863-1024` | `midiMappingRepository`, `MIDI_EVENT_LOG_LIMIT`, `midiMapping`, `midiLearnAction`, `midiDiagnosticLog`, `midiMonitorState`, `inputEventLog`, `midiInputManager`, `rawEventCount`, `performanceEventCount`, `recordedRawCount`, `eventCompressor`, `stopDetector`, `keyboardInput`, `lastMouseDirection`, `lastMouseInputAt`, `mouseStopDetector` |
| `153-167, 174-185, 1328` | `performanceRepository`, `latestPerformance`, `latestChallengeSummary`, `latestChallengeTimingAnalysis`, `latestChallengeTimingChartKey`, `latestChallengeAnalysisChartKey`, `challengeRepository`, `achievementRepository`, `achievementMessage`, `beginnerCourseRepository`, `beginnerCourseLoad`, `activeChallengeKey`, `challengeSession`, `selectedCourseStageId`, `beginnerCourseMessage`, `challengeRun`, `ANALYZE_DELAY_MS`, `challengeInterruptionNotice` |
| `168-173, 276-295` | `playbackLoopStartedAt`, `playbackLoopNumber`, `playbackLoopEvents`, `playbackLoopCurrentStep`, `playbackLoopState`, `playbackLoopStoppedAt`, audio functions returned by `createScratchAudio` (`initializeAudio`, `playClickSound`, `playScratch`, `silenceActiveScratch`, `playInputScratch`, `setInputFaderState`, `silenceInput`, `setMonitorSettings`), `audioMonitorSettings`, `youActivityTimer`, `practiceModeEnabled`, `playbackController` |
| `187-245, 535, 1870-1873, 2023` | `performanceView`, `builderView`, `practiceView`, `beginnerCourseView`, `bpmChallengeView`, `storageErrorMessages`, `challengeAbortDialog`, `challengeNavigation`, `editorUi` |

LocalStorage is reached through `getBrowserStorage()` and feature repositories,
with first-visit guidance using the captured storage object. The browser storage
event listener reloads Beginner Course progress and updates its status in
`src/app.js:1294-1303`; `restoreLastSession` separately reads the chart session
in `src/app.js:749-794`. MIDI access is requested by `midiInputManager` through
`navigator.requestMIDIAccess` and coordinated by `connectMIDI` /
`selectMidiInput` in `src/app.js:143-148, 1232-1271`.

## Named function responsibility and current ownership

The table maps every named function declaration in this snapshot. “App
coordination” means the function itself remains in `app.js`, even where the
listed module already owns part of its behavior.

| Source range | Named functions | Responsibility and current ownership |
| --- | --- | --- |
| `250-398` | `getSelectedChart`, `getBuilderChart`, `getPlaybackChart`, `renderSelectedChart`, `renderControllerOverlay`, `showPracticeView`, `showBuilderPage`, `stopInputMonitoring`, `resetPageState`, `updateTransportValues`, `getBuilderBarCount`, `setBuilderMode`, `renderBuilder`, `renderBuilderScore`, `createBuilderScoreDocument`, `selectChart`, `render` | App coordination: select the active catalog/builder chart, reset shared state, and compose views. `features/practice-view.js`, `features/builder-view.js`, `state/actions.js`, `ui/controls.js`, `ui/transport.js`, and `ui/visualizer.js` own delegated pieces. |
| `400-534` | `playCurrentStep`, `renderPlaybackProgress`, `advancePlayback`, `runtimeLoopState`, `stopPlayback`, `startPlayback` | App playback orchestration: schedule ticks, route chart steps to audio, update loop context, and synchronize playback with Challenge. Step/cursor and timer primitives are in `domain/playback.js` and `domain/playback-controller.js`; sound generation is in `audio/scratch-audio.js`. |
| `547-794` | `reportStorageError`, `renderSavedChartList`, `persistSession`, `initializeFirstVisitGuidance`, `saveFirstVisitGuidance`, `autosaveBuilder`, `afterBuilderEdit`, `saveCurrentChart`, `loadSavedChart`, `renameSavedChart`, `deleteSavedChart`, `prepareViewSwitch`, `restoreLastSession` | App coordination: translate repository results into UI, coordinate builder/session persistence, and restore navigation state. Data validation and storage contracts belong to `domain/chart-storage.js`; builder mutations use `state/actions.js`. |
| `795-862` | `syncChartJson`, `exportChartJson`, `loadChartJson`, `importChartJson`, `markJsonEdited` | App coordination: move JSON between editor UI, builder state, score compilation, and saved-chart linkage. Existing seams are `features/builder-view.js`, `state/actions.js`, and `domain/score-compiler.js`. |
| `863-1271` | `renderMidiMappingPanel`, `renderMidiInputSnapshot`, `updateMidiInputMonitor`, `saveMidiMapping`, `recordInputActionEvent`, `renderAudioMonitoring`, `handleInputAudioEvent`, `handleStopObservation`, `stopMouseScratch`, `syncPracticeModeButton`, `setPracticeModeEnabled`, `isPracticeModeToggle`, `setFaderRange`, `conflictMessage`, `swapFader`, `toggleMidiLearn`, `clearMidiMapping`, `handleMidiMessage`, `connectMIDI`, `selectMidiInput` | App coordination: join device/mouse/keyboard events to semantic actions, audio, logging, and performance recording; coordinate mapping UI and MIDI setup. Mapping rules are in `domain/midi-mapping.js`, keyboard normalization in `domain/keyboard-input.js`, device access in `services/midi/input-manager.js`, and logs in their feature/UI modules. |
| `1272-1382` | `analyzeForChart`, `renderPerformanceAnalysis`, `getChallengeChartKey`, `getBeginnerCourseStage`, `renderBeginnerCourse`, `renderAchievementsPage`, `renderChallengePanel`, `renderChallengeInputReadiness`, `returnToPractice`, `showMidiSetup`, `selectBeginnerCourseStage`, `setChallengeStatus` | App coordination: connect selected chart and feature state to analysis/view adapters, navigation, and status feedback. Rendering is partly owned by `features/performance-view.js`, `features/beginner-course-view.js`, `features/bpm-challenge-view.js`, `features/achievement-view.js`, and `features/challenge-navigation.js`. |
| `1383-1847` | `createChallengeSessionId`, `describeAttemptResult`, `recordPracticeAchievement`, `isChallengeLooping`, `evaluateChallengeAttempt`, `applyChallengeEvent`, `completeChallenge`, `startChallenge`, `hasChallengeInputs`, `startBeginnerCourseAttempt`, `resetChallengeProgress`, `abortChallenge`, `cancelChallenge`, `beginChallengeRecording`, `recordingBoundary`, `closeRecordingLoop`, `finishChallengeRecording`, `abortPerformanceRecording` | App Challenge/course orchestration: apply pure session transitions and their effects, manage playback/recording boundaries, persist outcomes, and coordinate analysis. Rules/repositories are in `domain/bpm-challenge.js` and `domain/beginner-course.js`; transitions are in `domain/challenge-session.js`; view/navigation adapters are in `features/`. |
| `1849-1868` | `exportPerformance`, `exportPerformanceSummary` | App coordination: serialize/download current performance and summary; record representation and filename helpers are in `domain/performance.js`. |

## Candidate extractions and existing test surfaces

These are seams for investigation, not approved moves. Each candidate should
preserve the current app's ordering and closure-owned state unless a separate
design explicitly changes those contracts.

| Candidate seam in `app.js` | Existing module ownership to build on | Relevant existing tests |
| --- | --- | --- |
| Startup and view composition (`104-398`, `1870-2084`) | `features/practice-view.js`, `features/builder-view.js`, `features/bpm-challenge-view.js`, `features/beginner-course-view.js`, `features/challenge-navigation.js`, plus `state/` and `ui/` adapters | `tests/features/practice-view_test.js`, `tests/features/performance-view_test.js`, `tests/features/challenge-navigation_test.js`; there is no dedicated `app.js` composition test in the current test tree. |
| Builder editing, chart JSON, and saved-chart/session workflow (`547-862`) | `state/actions.js`, `features/builder-view.js`, `domain/score-compiler.js`, `domain/chart-storage.js` | `tests/domain/builder-score_test.js`, `tests/state/builder-persistence_test.js`, `tests/domain/chart-storage_test.js`. |
| Playback loop and audio effects (`400-534`, `930-969`) | `domain/playback.js`, `domain/playback-controller.js`, `audio/scratch-audio.js` | `tests/domain/playback_test.js`, `tests/domain/playback-controller_test.js`, `tests/state/performance-recording_test.js`. |
| Input normalization, MIDI setup, mapping, and event logs (`863-1271`) | `domain/midi-mapping.js`, `domain/keyboard-input.js`, `services/midi/input-manager.js`, `features/input-event-log.js`, `features/midi-diagnostic-log.js` | `tests/domain/midi-mapping_test.js`, `tests/services/midi-input-manager_test.js`, `tests/state/midi-recording_test.js`, `tests/ui/input-event-log_test.js`, `tests/features/midi-diagnostic-log_test.js`, and MIDI E2E tests under `tests/e2e/`. |
| Event Model performance recording, analysis, and display (`910-969`, `1272-1279`, `1442-1601`, `1766-1868`) | `domain/performance.js`, `domain/performance-analysis.js` (timeline matching and timing analysis), `domain/performance-overlay.js`, and `features/performance-view.js` | `tests/domain/performance_test.js`, `tests/domain/performance-analysis_test.js`, `tests/domain/performance-matching_test.js`, `tests/domain/timing-analysis-v2_test.js`, `tests/domain/performance-overlay_test.js`, `tests/features/performance-view_test.js`, `tests/state/performance-recording_test.js`. |
| Challenge and Beginner Course orchestration (`1282-1847`) | `domain/challenge-session.js`, `domain/bpm-challenge.js`, `domain/beginner-course.js`, `features/bpm-challenge-view.js`, `features/beginner-course-view.js`, `features/challenge-input-readiness.js`, `features/challenge-navigation.js` | `tests/domain/challenge-session_test.js`, `tests/domain/bpm-challenge_test.js`, `tests/features/challenge-input-readiness_test.js`, `tests/features/challenge-navigation_test.js`, `tests/e2e/bpm-challenge_test.js`. |
| Feature-specific persisted data and Ghost/Replay integration (`116-184`, `547-794`, `1282-1867`, `2073-2084`) | `domain/chart-storage.js`, `domain/performance.js`, `domain/bpm-challenge.js`, `domain/beginner-course.js`, `domain/achievement-system.js`, `features/ghost-integration.js`, `features/replay-integration.js`, and their storage/view modules | `tests/domain/chart-storage_test.js`, `tests/domain/repository-storage_test.js`, `tests/domain/ghost-storage_test.js`, `tests/domain/ghost-overlay_test.js`, `tests/domain/replay-storage_test.js`, `tests/domain/replay-controller_test.js`, `tests/domain/replay-playback_test.js`, `tests/features/ghost-integration_test.js`, `tests/features/ghost-retrieval_test.js`, `tests/features/replay-integration_test.js`, `tests/features/replay-view_test.js`, `tests/ui/ghost-overlay_test.js`, `tests/ui/replay_test.js`. |

The test surfaces exercise the existing modules and workflows, not every direct
DOM interaction in `app.js`; an extraction that changes those interactions needs
focused integration coverage. This inventory does not propose a second
composition API, new module, or behavior change.

## Maintenance

Refresh the snapshot counts, source ranges, function index, module ownership,
and test links when `src/app.js` or the corresponding module/test boundaries
change. The [architecture baseline](refactoring-baseline.md) links this analysis.
The legacy [roadmap](../roadmap.md) is a planning link guide, not a technical
inventory; no roadmap update is needed for this source-neutral documentation
change.
