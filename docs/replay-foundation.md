# Replay Foundation

Status: Design Draft

## 実装状況: Phase 1 Replay Storage

`src/domain/replay-storage.js`に保存基盤を実装済み。 Ghost
Storageとは独立し、`scratchlab.replay`だけを使用する。 Phase 2でBPM
Challengeクリア時の保存だけを接続した。 Phase
6で最小Viewerに接続した。Ghost・Overlayへの接続は行わない。
本文の再起動後のGhost復元・座標生成・Migrationは将来設計であり、
保存接続の完了範囲には含めない。既存Ghostデータの移行・互換読込は追加しない。

### API

| API                       | 戻り値                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `loadReplayStorage()`     | `{ version: 1, replays: {} }`形式の保存データ                       |
| `saveReplayStorage(data)` | ドキュメント全体の置換。`{ ok: true }`または`{ ok: false, reason }` |
| `getReplay(chartId)`      | 独立したReplayRecord、未登録／読込不能なら`null`                    |
| `saveReplay(record)`      | 譜面1件を置換。他譜面を保持。成功／失敗形式は上記と同じ             |
| `clearReplayStorage()`    | Replayキーだけを明示削除。成功／失敗形式は上記と同じ                |

各APIの最後の省略可能な引数にLocalStorage互換backendを渡せる。
省略時は既存`getBrowserStorage()`を使用する。APIを呼ばない限りStorageへアクセスしない。
`saveReplay`はBest判定・スコア比較・時刻比較をせず、明示された記録を保存する。
譜面ごとに1件保持し、BPM別や履歴の管理は行わない。

### 検証・保存ルール

- Storage・ReplayRecordの`version`は1、`eventModelVersion`は正式定数の2のみ。
- chartIdは空でない文字列、bpmは有限の正数、recordedAtは非負の有限ms。
- replayContextは必須。recordingStartedAtは非負の有限ms、
  recordingLoopCountは正整数、loopStatesは空でない配列。
- 各ループはloopIndex（非負整数）・startTime・endTime・phaseが必須。
  endTimeはstartTimeより後、phaseはdemoまたはrecording。
  配列はloopIndex昇順・時刻非重複とし、自動整列しない。
  recordingループ数はrecordingLoopCountと一致し、
  最初のrecordingループの開始時刻はrecordingStartedAtと一致する。
- Event Model v2のsessionId・startDirection・startFaderStateは、
  元のloopStateに存在すれば検証して保持する。
  設計例の最小4項目だけのloopStateも許可する。
- recordedTimelineは必須配列（空配列は許可）。時刻は非負の有限ms、
  昇順（同時刻可）で保持し、並べ替え・圧縮・相対時刻化しない。
- Meaning Event4種類と、既存v2 APIが生成する完全なStop Observation・ Loop
  Boundaryを保存する。旧scratch/stop・未知イベントは拒否する。
- 定義済みフィールドだけを保存する。 Matching／Timing／Overlay
  Result・Accuracy・Timing Accuracy・座標は保存しない。
  入力は変更せず、取得値の編集も保存データに影響しない。

### 失敗・復旧

欠損は空Storage。破損JSON・不正スキーマ・読込拒否・未対応バージョンも
空Storageを返し、欠損以外は`console.warn`で通知する。
不正な保存済みレコードが1件でもあればStorage全体を不正扱いとする。
読込で元データを上書き・削除しない。

書込失敗は`invalid`／`unavailable`／`future-version`／`write-failed`を返す。
不正chartIdでの取得は既存Ghost Storageと同じく`TypeError`。
破損データは有効なsaveの明示実行で置換可能。
将来バージョンのStorageはsave・clearによる上書き／削除から保護する。
容量超過・書込拒否を成功扱いにしない。ほかのStorageキーには触れない。

## 実装状況: Phase 2 Replay Challenge Integration

`src/features/replay-integration.js`の`saveChallengeReplay`を、 `app.js`のBPM
Challenge結果確定処理へ接続した。
既存のChallenge結果保存・Achievement通知の後に、`counted`・`valid`・`cleared`が
成立し、結果保存も成功した場合だけReplay保存を試みる。 Beginner
Course・未クリア・中断・無効記録は対象外。

ReplayRecordの`version: 1`と正式なEvent Model番号を設定し、
結果確定時の`recordedAt`、実行した`run.bpm`、録音開始時刻`run.startedAt`、
完了済み`run.loopStates`、共通v2分析の`recordedTimeline`を保存する。
録音ループ数はChallengeの共通定数`RECORDING_LOOPS`を使用する。
2録音ループが完了していない、初期状態不正、v1、分析欠損、BPM不一致、
Timeline欠損／Meaning Event無しの場合は拒否する。
残りのスキーマ・ループ整合はReplay Storageの検証に委ねる。
時刻の相対化・並べ替え・圧縮や採点結果の保存は行わない。

同一譜面は成功した記録で置換し、Best判定は行わない。
Ghostの保存・更新・表示ロジックには変更を加えない。
Replay書込失敗は理由付き結果と`console.warn`で通知し、
Challenge結果・Progress・Achievement・画面文言を変更しない。
保存失敗をChallenge失敗として扱わず、再生／Viewerへの接続も行わない。

テストは実際のv2分析とChallenge判定から保存→`getReplay`取得の一致、
Stop・Boundaryを含むTimeline・loopStatesの保持、保存拒否条件、
容量超過等での結果・Progress非変更を確認する。

## 実装状況: Phase 3 Replay Retrieval

既存Replay統合モジュールの`createReplaySelection()`が、
`selectedReplay`をメモリー内だけで保持する。
`selectChart(chartId)`のたびに既存の`getReplay(chartId)`を呼び、
chartId・bpm・replayContext・recordedTimelineの4項目を取得する。
初期値、Replay無し、破損、非対応形式、読込拒否では`null`とし、
前の譜面のReplayを残さない。破損等の警告は既存Storage APIに任せる。

`app.js`の共通譜面選択入口へ接続し、譜面一覧・Beginner Course選択・
初回ガイドからの選択・前回セッション復元に対応する。
起動時もセッション復元後の選択譜面を取得する。
同じ譜面を再選択した場合も再取得する。取得値の編集は保存データに影響しない。
Phase 3時点では次の譜面選択で最新Replayを読む。 Phase
6では保存成功直後にも再取得し、Viewerを新しい記録の初期状態へ戻す。

選択状態は保存せず、UI・再生・Replay
Viewer・Ghost・Overlay・Timingには渡さない。 Beginner
Courseは選択時の読込だけであり、Replay保存の対象には追加しない。

## 実装状況: Phase 4 Replay Playback Model

`src/domain/replay-playback.js`の`createReplayPlayback(replayRecord)`は
`seek(timeMs)`・`reset()`・`getState()`を公開する独立ドメインAPI。
Storageの完全なReplayRecordと、Phase 3の4項目のselectedReplayの両方を受け取る。
UI・タイマー・時計・Storage・音声には依存せず、アプリからはまだ呼び出さない。

各APIは以下の状態を返す（`getState`は現在位置を変更しない）。

```js
{
  currentTime, // 録音開始からの相対ms
    currentLoop, // loopStatesのloopIndex、空白区間はnull
    progress, // Replay全体の0〜1
    visibleEvents; // 現在位置までの元イベント、絶対時刻を維持
}
```

- 初期状態とresetはcurrentTime=0、progress=0。
  録音開始時刻ちょうどのイベントは初期状態にも含める。
- seek入力は有限numberのみ。NaN・±Infinity・非numberは`TypeError`、
  不正seekで現在状態を変更しない。
- 負数は0、録音終了を超えた値は終了へ丸める。後方seekも可能。
- 終了は最後のloopState.endTime。durationは終了−recordingStartedAt。
  progressはcurrentTime/durationで求め、BPMから終了を推測しない。
- currentLoopは半開区間`[startTime, endTime)`で判定する。
  境界は次ループに所属、空白区間はnull。
  終了時刻へのseekは許可し、そのときだけ最終ループを返す。
- visibleEventsは録音開始以上、現在の絶対時刻以下のイベント。
  録音前・録音終了後のイベントは返さない。 Forward／Backward／Fader Open／Fader
  Close／Stop／Loop Boundaryを 元の時刻・順序・同時刻順序のまま保持する。
- 入力の録音コンテキストとTimelineは検証後にコピーする。
  元データ・返却した状態を編集しても内部再生データには影響しない。
  同じ入力とseek位置は同じ状態を返す。
- 再生に必要な項目の欠損・不正時刻・不整合ループ・不正イベント種別は
  `TypeError`。完全な保存スキーマ検証は従来どおりStorageの責務。

自動再生・Animation・再生ボタン・Viewer・Ghost・Overlay・Timingへの接続は含まない。

## 実装状況: Phase 5 Replay Runtime Controller

`src/domain/replay-controller.js`の`createReplayController(playback)`は Phase
4のPlayback Modelを受け取る独立API。構築時は一時停止状態で、
渡されたPlaybackの現在位置を変更しない。

| API             | 動作                                                         |
| --------------- | ------------------------------------------------------------ |
| `play()`        | 現在位置を維持して再生状態へ。終端では停止を維持             |
| `pause()`       | 現在位置を維持して一時停止                                   |
| `stop()`        | 停止し、Playbackのresetで0ms・初期ループへ戻す               |
| `seek(timeMs)`  | Playbackへ委譲。再生／一時停止状態を維持するが、終端では停止 |
| `tick(deltaMs)` | 再生中だけ指定ms進める。一時停止中は進めない                 |
| `getState()`    | Playbackの状態に`isPlaying`を加えて取得。位置を変更しない    |

各操作は`{ isPlaying, currentTime, currentLoop, progress, visibleEvents }`を返す。
tickは有限の非負numberのみ許可し、不正値は一時停止中でも`TypeError`。
seekの入力検証・範囲制限はPlaybackに任せる。 不正tick／seekで状態を変更しない。

終端到達時は`isPlaying=false`にし、終了位置・最終ループを維持する。
自動巻戻しせず、終端でplayしても進まない。
再開にはstopまたは終端より前へのseek後にplayする。
現在時刻とdeltaの加算が数値上限を超えても、終了位置へ安全に丸める。
Playbackの状態オブジェクトは直接変更せず、seek／resetだけで位置を操作する。

時間源は明示的なtickだけ。Date.now・タイマー・requestAnimationFrameは使わない。
同じ初期Playback状態と操作列から同じ結果を返す。
アプリ・UI・Viewer・Ghost・Overlay・Storageへの接続は追加しない。

## 実装状況: Phase 6 Replay Viewer v1

Practice画面にReplay Panelを追加し、Current Time（整数ms）・Current Loop
（Loop番号、空白区間は「—」）・Progress（整数%）だけを表示する。
Play・Pause・Stopボタンは既存Replay Controllerに委譲する。
visibleEvents・イベント一覧・Timeline・音声は表示／再生しない。

`src/features/replay-view.js`が選択ReplayからPlayback
ModelとControllerを構築する。
`src/ui/replay.js`はボタンのバインドと状態表示だけを担当する。
表示へ渡すのはisPlaying・currentTime・currentLoop・progressの4項目のみ。

- Replay無しでは全操作を無効化し、記録がないことを表示する。
- 有効なReplayを読み込むと0ms・初期ループ・0%で停止する。
- Play中はViewer側のrequestAnimationFrameから経過msをController.tickへ渡す。
  時間基準はperformance.nowとフレーム時刻。ドメインの時計非依存は維持する。
- Pause・Stop・終端到達時はフレーム予約を解除する。
  Pause中の経過時間は再開後のtickに加えない。Play連打で予約を重複しない。
- 終端は100%・最終ループで停止し、再開にはStopで初期化する。
- 譜面切替・再選択・起動復元で選択ReplayをViewerへ渡す。
  古いフレームは解除し、遅れて届いた旧コールバックも無視する。
- Replay保存成功時はselectedReplayを再取得し、Viewerへ反映する。
  保存失敗時は既存Viewerを変更しない。
- 不正ReplayでPlayback構築が失敗した場合は警告とPanel内のエラーを表示し、
  操作を無効化する。

Ghost・Controller Overlay・採点・Timing・Progress・Achievementは変更しない。
Phase 6時点では速度変更・Seek UI・イベント描画・Ghost Replay・Timing
Replayは未実装。
単体テストで操作・フレーム進行・終端・選択切替・Panel表示を検証する。

## 実装状況: Phase 7 Seek UI

Replay Panelに0%〜100%のSeek Bar（ネイティブrange入力）を追加した。
クリック・ドラッグ・キーボードによるinputイベントから、 `onSeek(progress)` →
Viewer → `controller.seek(progress * replayDuration)`へ委譲する。
replayDurationは選択Replayの最終loopState.endTime−recordingStartedAt。
BPMやイベントの末尾から推測せず、ループ間の空白も含める。

- rangeは0〜1、step=0.001。表示時にControllerのprogressと同期する。
- Current Time・Current Loop・Progressはseek直後に更新する。
- Pause中も操作可能で、seek後も停止状態を維持する。
- Play中のseekは再生を維持する。旧フレームを解除して時間基準を更新し、
  seek前の経過時間を移動先へ加算しない。遅延した旧コールバックも無視する。
- 100%へのseekはControllerの既存終端停止に従い、バーも100%になる。
  終端から前方以外の位置へ戻した後はPlayで再開できる。
- Stopは0%、譜面選択・保存成功後の再読込も初期位置へ同期する。
- Replay無し・読込不正時はバーを0%で無効化する。
- Viewerへの不正progress（非number・非有限・範囲外）はTypeErrorで拒否する。

Timeline・イベント一覧・描画・速度変更は追加しない。
Ghost・Overlay・採点・Storage・Playback Model・Controllerは変更しない。
テストでrange入力の受渡し、バーの同期、Pause／Play中の移動、ループ・時刻更新、
空白区間・終端停止・フレーム基準更新を検証する。

---

# Overview

Replay Foundation は ScratchLab の演奏再生基盤である。

Ghost Foundation の上位概念として定義する。

Replay Foundation が完成すると、

- Ghost Overlay
- Ghost Replay
- Previous Run Replay
- Timing Replay
- Community Ghost

を同じ再生モデル上で実装できる。

---

# Goals

演奏記録を正確に再現できるようにする。

以下を保証する。

- 演奏位置の再現
- ループ境界の再現
- BPMの再現
- Overlay座標の再現
- Recorded Timelineの再生

---

# Non Goals

Phase 1では実装しない。

- 動画保存
- 音声録音
- オンライン共有
- ランキング
- 他人のゴーストダウンロード

---

# Design Principles

## Principle 1

Recorded Timeline が唯一の真実。

```text
Replay
Ghost
Overlay
Timing
```

すべて同じ Timeline を利用する。

---

## Principle 2

Overlay情報は保存しない。

保存するのは

```text
イベント
境界
録音条件
```

のみ。

描画座標は実行時に生成する。

---

## Principle 3

Replay Dataだけで再現可能にする。

再起動後でも

```text
Ghost表示
Replay再生
```

が可能であること。

---

# Architecture

```text
Recording
        ↓
ReplayRecord
        ↓
Ghost
Replay
Overlay
Timing
```

---

# Replay Record

Replayの正式保存形式。

```js
{
  version: 1,

  chartId: "chirp-scratch",

  eventModelVersion: 2,

  bpm: 80,

  recordedAt: 1760000000000,

  replayContext: {
    recordingStartedAt: 1760000000000,

    recordingLoopCount: 2,

    loopStates: []
  },

  recordedTimeline: []
}
```

---

# Replay Context

## recordingStartedAt

録音開始時刻

```js
recordingStartedAt;
```

---

## recordingLoopCount

録音対象ループ数

```js
recordingLoopCount;
```

通常は

```text
2
```

---

## loopStates

Replayの重要情報。

```js
[
  {
    loopIndex: 1,

    startTime: 1000,

    endTime: 5000,

    phase: "recording",
  },

  {
    loopIndex: 2,

    startTime: 5000,

    endTime: 9000,

    phase: "recording",
  },
];
```

---

# Recorded Timeline

保存対象

```text
Forward Stroke
Backward Stroke
Fader Open
Fader Close
```

---

保存しない

```text
Overlay Data
Matching Result
Timing Result
```

---

保存する

```text
Stop Observation
Loop Boundary
```

Replay再現で利用するため。

---

# Ghost Relationship

Ghost は Replay の部分利用。

```text
Replay Record
↓
Ghost View
```

---

Ghost Foundation は

Replay Foundation のサブセットである。

---

# Overlay Generation

Replay Record から

```text
loopStates
bpm
recordedTimeline
```

を利用し、

```js
createGhostOverlayData();
```

を生成する。

---

# Replay Playback

将来追加。

```js
createReplayPlayback();
```

---

入力

```js
ReplayRecord;
```

---

出力

```js
currentTime;
currentLoop;
visibleEvents;
```

---

# Storage

新規キー

```text
scratchlab.replay
```

---

保存形式

```js
{
  version: 1,

  replays: {
    "baby-scratch": ReplayRecord,
    "chirp-scratch": ReplayRecord
  }
}
```

---

# Best Run

Ghost Best Runは

```text
ReplayRecord
```

を参照する。

Ghost専用保存形式は将来的に廃止可能。

---

# Previous Run

Phase 2

```text
Latest Replay
```

を保持。

---

# Ghost Replay

Phase 3

```text
Ghost
VS
Current Run
```

比較再生。

---

# Timing Replay

Phase 4

イベントごとに

```text
Early
Late
Perfect
```

を可視化。

---

# Community Ghost

Phase 5

ReplayRecordを共有。

---

# Migration Strategy

Ghost Storage v1 は維持。

Replay Foundation導入後、

```text
Ghost Storage
↓
Replay Storage
```

へ移行可能。

互換読み込みを提供する。

---

# Acceptance Criteria

Replay Foundation Phase 1

```text
✅ Replay Record定義

✅ BPM保存

✅ loopStates保存

✅ recordedTimeline保存

✅ 再起動後にGhost復元可能

✅ Overlay座標再生成可能

✅ Storage設計完了
```

---

# Roadmap

Phase 1

- Replay Data Model
- Replay Storage

Phase 2

- Latest Replay

Phase 3

- Ghost Replay

Phase 4

- Timing Replay

Phase 5

- Community Ghost

---

# Final Decision

Ghost Foundation は Replay Foundation の一部として扱う。

Replay Record を唯一の再生データ形式とし、

Ghost・Overlay・Timing・Replay はすべて Replay Record から生成する。
