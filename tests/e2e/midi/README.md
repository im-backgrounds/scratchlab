# MIDI E2E Suite

実機を使わず、Baby Scratch・Chirp Scratch・Transformer Scratch・ 1 Click Flare
OrbitのMIDI入力からChallenge結果までをChromiumで検証する。
本番コード・本番設定・採点ロジックは変更しない。

## 実行

リポジトリーのルートから:

```sh
deno task --config tests/e2e/deno.json install-browser
deno task --config tests/e2e/deno.json check
deno task --config tests/e2e/deno.json test
```

必要環境はDeno 2とPlaywright専用Chromium。実機MIDI・外部サーバーは不要。
ブラウザー導入にはNode.js 22／npmも必要。テスト自体はDenoで実行する。
初回はnpm依存とブラウザーのダウンロードが必要。 Linux
CIではPlaywrightの`install --with-deps chromium`でOS依存も導入する。 Playwright
1.56.1の対応環境を維持するため、MIDI E2Eジョブは
`ubuntu-24.04`に固定する。`ubuntu-latest`の更新で未対応OSへ切り替えない。
[Deno CI](../../../.github/workflows/deno-ci.yml)の独立ジョブで同じテストを実行する。
既存の単体テストは`deno test --allow-read=tests/ui/snapshots --ignore=tests/e2e`で実行する。

Issue #20のBPM Challenge回帰だけを実行する場合:

```sh
cd tests/e2e
deno test --allow-read --allow-write --allow-net=127.0.0.1 --allow-env --allow-run --allow-sys bpm-challenge_test.js
```

ブラウザー起動にはファイル読み書き・環境変数・サブプロセス・システム情報の権限が必要。
テストサーバーは`127.0.0.1`の空きポートだけを使用し、終了／失敗時にブラウザーと共に閉じる。
毎回新しいブラウザーコンテキストを使うため、ユーザーのLocalStorageには触れない。

## Simulator

[createMidiSimulator](../midi-simulator.js)は、接続済みの仮想入力ポート1個、
`MIDIAccess.inputs`相当のMap、空のoutputsを生成する。 実機のWeb MIDI
APIにはアクセスしない。
`onmidimessage`と`addEventListener("midimessage", ...)`に対応する。

```js
const midi = createMidiSimulator();
const access = await midi.requestMIDIAccess();
const input = [...access.inputs.values()][0];
input.onmidimessage = (event) => console.log(event.data);

midi.send({
  timestamp: 1000,
  data: [144, 60, 127],
});
midi.sendMany([
  { timestamp: 1100, data: [128, 60, 0] },
  { timestamp: 1200, data: [144, 61, 127] },
]);
```

`timestamp`は`performance.now()`と同じ単調増加時計の絶対ミリ秒。
上記の固定時刻例は、その時刻以前に呼び出すこと。
未来のメッセージは指定時刻に配送する。現在時刻なら即時配送する。
過去／非有限時刻、不正な3バイトメッセージ、逆順のbatchは例外で拒否する。
batch全体を検証してから送信し、渡されたバイト列はコピーする。
SysEx、hot-plug、複数デバイス、実機ドライバーの再現はPhase 1の対象外。

## E2E構成

[environment.js](environment.js)がローカルHTTPサーバーとChromiumを起動する。
アプリ起動前のinit
scriptで`navigator.requestMIDIAccess()`をSimulatorへ差し替える。 Playwright
Clockで`Date.now()`、`performance.now()`、タイマーを同期して進める。
アプリは受信時の`Date.now()`を使用するため、MIDIイベントの時刻属性だけでなく、
実際の配送時刻も制御する。実時間sleepやアプリ内部関数の直接呼出しは使わない。

UIからMIDI接続とLearn割当を行う:

| 操作     | メッセージ                          |
| -------- | ----------------------------------- |
| Forward  | Note On 60、velocity 127、channel 1 |
| Backward | Note On 61、velocity 127、channel 1 |
| Fader    | CC 7、value 0（開）、channel 1      |

Baby ScratchをUIで選択し、開始前にFader Openを送る。 80
BPM、2小節、1デモ＋2録音ループでForward→Backwardを8回／ループ送信する。
この演奏fixtureはExpected
TimelineやReplayから生成せず、独立した固定操作列とする。
デモ入力と150msの物理Stop観測は採点件数に混ぜない。

```text
Virtual MIDI → production MIDI Mapping → Recording → Matching
             → Timing → Overlay → Challenge Result
```

### Ghost／Replayの隔離

E2EサーバーだけがGhost／Replay統合モジュールのレスポンスをNullアダプターへ差し替える。
選択・取得はnull、Ghost Overlayデータもnull、
保存は`{ ok: false, reason: "e2e-disabled" }`を返す。
保存成功を偽装せず、既存アプリの2件の警告を明示的に検証する。
ReplayRecord／GhostRecordは生成せず、両Storageキーにも書き込まない。
入力・採点・分析・Overlayは本番モジュールをそのまま配信する。 通常の起動やGitHub
Pagesにはこのアダプターを適用しない。

## テスト一覧

### BPM Challengeの主要回帰フロー（Issue #20）

[BPM Challenge E2E](../bpm-challenge_test.js)は、既存の仮想MIDI環境で Baby
Scratchを80 BPM、続けて85 BPMで最後まで演奏する。
試行AのMatching・Timing・Overlay・進捗・結果・次アクションをすべて確認してから、
同じ開始ボタンで試行Bへ進む。内部状態の書換えや採点関数の直接呼出しは行わない。

- Warm-up／Recording Lap 2／Recording Lap 3の各境界直前と直後の進行状態、
  記録表示、開始／リセット／BPM操作のロック、再生の自動停止。
- ウォームアップで逆方向・フェーダー閉を入力しても、保存・採点はLap 2/3の
  16ストロークだけになる。記録時間、ループ境界、方向・時刻・件数を検証する。
- Lap 3の終了後に入力しても保存結果は変わらず、399ms後は判定中、
  400ms後に結果が確定する。記録イベントは半開区間`[0, durationMs)`に収まる。
- 一致率100%、Matched 16、Missing／Extra 0、Timing測定16件、
  SAMPLE／YOU各16件とERRORなし、成功表示、挑戦／成功回数、次BPMへの更新。
- Performance詳細への遷移・フォーカス、スコアの可視性、成績画像出力の有効化、
  次の挑戦が可能になること。
- 次の試行で前回Timing／成績画像状態を消し、別の開始時刻・入力として保存する。
  85 BPMでは入力を20ms遅らせ、前回の0ms Timingを流用していないことも確認する。

80 BPMの時刻・時間は完全一致を要求する。85 BPMでは拍長が小数msになるため、
保存時の整数ms化に限り1ms以内の誤差を許容する。Playwright Clockの`runFor`は
切り上げられるため、周回ごとの丸め誤差を累積させず絶対時刻へ進める。
実時間sleepや要素順への依存は追加せず、操作には既存ID、進行ステップには
`data-id`、分析結果には既存の意味的なクラスを使用する。
本番UIへの`data-testid`追加は不要。

中断・再挑戦の詳細はIssue #21、低スコア等の不合格系はIssue #22の対象。
このテストはGhost／Replayの保存や実機MIDI・聴感を検証しない。

### MIDI入力の既存回帰

[Simulator単体](../midi-simulator_test.js):

- 仮想デバイス接続、同じAccessの取得、outputなし。
- 指定時刻の配送、同時刻の順序、バイト列のコピー。
- `onmidimessage`の付替え／解除とEventTargetリスナー。
- 不正時刻・不正バイト・逆順batchの拒否と部分送信防止。

[Baby Scratch E2E](../midi-baby-scratch_test.js):

1. MIDI Access: 仮想デバイス接続、Learnによる3操作の割当。
2. MIDI Input: 本番ハンドラーの受信ログと圧縮イベントへの到達。
3. Recording: Warm-up (Lap 1)→Recording Lap 2/3→Lap 3/3→Analyzing→Result、 lap
   1除外、Lap 2/3の方向・時刻・件数、Challenge Startでの再挑戦。
4. Matching: Accuracy 100%、Matched 16、Missing 0、Extra 0。
5. Timing: Measured Count 16（>0）、Average／Max Error 0ms、 Timing Accuracy
   100%。
6. Overlay: SAMPLE／YOU各16件、ERROR 0件、方向・位置、 Missing／Extra／Initial
   State Error 0、Timing 16。
7. Challenge／Result: 80 BPMクリア、Accuracy 100%、挑戦／成功各1、 次のBPM
   85、結果画面の成功表示。
8. 隔離: Ghost／Replayキーなし、ブラウザーエラーなし、想定外の警告なし。

### Fader／複合入力の追加シナリオ

- [Chirp Scratch](midi-chirp-scratch_test.js):
  同方向に続く半拍セルと3カットの開閉を入力する。
- [Transformer Scratch](midi-transformer-scratch_test.js):
  各ストローク中の3カットでFader Open／Closeの両方を検証する。
- [1 Click Flare Orbit](midi-1click-flare_test.js):
  継続ストロークの後半で1カットを行い、Scratch／Faderの複合入力を検証する。

[共通シナリオランナー](challenge-scenario.js)は既存の接続・Learn・Nullアダプターを
再利用する。演奏時刻と方向・カット位置はテスト独自の固定fixtureで定義し、
本番のExpected Timeline生成器・譜面コンパイラー・Replayは呼び出さない。
100msごとの同方向MIDI入力で継続移動を再現し、
本番の150ms停止検出が継続ストロークを分割しないようにする。
繰り返し入力の圧縮も本番処理に任せ、保存Timelineとの完全一致で検証する。
小数msのカットは整数msへ丸めるため、Timing誤差は最大1ms以内、 Timing
Accuracyは99%以上を要求する。Accuracyとは独立して検証する。

各追加テストでは以下を確認する:

1. MIDI接続・Learn割当とScratch／Fader開閉の本番受信ログ。
2. 1デモ＋2録音ループの遷移、Recorded Timelineの全Meaning Event・時刻・
   種別別件数、受信件数。
3. Accuracy 100%、Missing 0、Extra 0と、全Meaning EventのTiming測定。
4. SAMPLE／YOUの全マーカーの種類・位置、ERRORなし、共通集計との一致。
5. Challengeクリア・結果画面100%成功・次BPM 85。
6. Ghost／Replayキーなし、ブラウザーエラー・想定外警告なし。

### Event種別カバー率

下表はデモを除く2録音ループの実際のMeaning Event件数。
Recording・Matching・Timing・Overlay・結果画面を通す、4種中4種（100%）の
種別カバー率であり、コード行／分岐カバレッジではない。

| 譜面                | Forward | Backward | Fader Open | Fader Close | Timing測定件数 |
| ------------------- | ------- | -------- | ---------- | ----------- | -------------- |
| Baby Scratch        | 8       | 8        | 0          | 0           | 16             |
| Chirp Scratch       | 10      | 10       | 36         | 36          | 92             |
| Transformer Scratch | 8       | 8        | 48         | 48          | 112            |
| 1 Click Flare Orbit | 8       | 8        | 16         | 16          | 48             |

Stopは物理観測であり、Loop Boundaryは制御情報なので4種の分母には含めない。
これらの専用境界条件テストは今回の追加範囲外。
Suite全体はSimulator単体4件＋ブラウザーE2E 4件、計8件・26ステップ。
`deno task test`は追加3ファイルも含めて実行し、既存CIジョブから同じSuiteを実行する。

## 次の候補

- Baby ScratchのMissing／Extra、不正な初期Fader、接続拒否。
- 同方向連続入力・Note Off・停止閾値・ループ境界跨ぎ。
- 中断・再挑戦・デバイス再接続。
- Forward Scratch／Backward Scratchの持続ミュートとFader初期状態。
- Chromium以外の主要ブラウザー。

この基盤はアプリ内MIDI入力経路の実機確認を代替するもので、
実機固有のメッセージ形式・USB／OSドライバー・権限・遅延の検証は別途必要。
