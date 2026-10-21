# Planning Migration Record

2026-10-22に合意した計画管理の移行対応表。
この文書は移行内容の監査記録であり、日々の進捗を更新するバックログではない。
要件はIssue、状態/優先度はProject、達成目標はMilestoneを正本とする。

## GitHubの移行先

- [ScratchLab Development](https://github.com/users/im-backgrounds/projects/3)
- [Practice Reliability](https://github.com/im-backgrounds/scratchlab/milestone/1)
- [Test Quality Improvement](https://github.com/im-backgrounds/scratchlab/milestone/2)
- [Learning Feedback](https://github.com/im-backgrounds/scratchlab/milestone/3)
- [Ghost Comparison](https://github.com/im-backgrounds/scratchlab/milestone/4)
- [Replay Visualization](https://github.com/im-backgrounds/scratchlab/milestone/5)

5目標は期限なし。旧バージョン番号や新たなリリース確約ではない。
GitHub操作はスクリプトで行い、同名の曖昧な一致/既存割当の置換は停止する。

## 元記述ごとの対応

元記述の完全な固定リンクと完了項目の履歴は
[Planning Baseline](releases/planning-baseline-2026-10.md)に保存した。

| 元文書・見出し/項目                                                      | 移行先・判断                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roadmap: Vision                                                          | [Product Vision](vision.md)。製品原則を変更しない                                                                                                                                                               |
| Roadmap: Current Status / Event Model v2 / 確認済み / 既存の提供機能     | Baselineと既存v2リリースノート。過去記録であり現在のテスト成功を意味しない                                                                                                                                      |
| Roadmap: データ方針 / Completion Criteria                                | 既存[Event Model v2](event-model-v2.md)と[設計判断](architecture-decisions.md)、Baseline。移行/初期化を復活させない                                                                                             |
| Roadmap/Tasks: 実機MIDI検証                                              | [#41](https://github.com/im-backgrounds/scratchlab/issues/41)。Simulator確認と実機を区別                                                                                                                        |
| Roadmap/Tasks: E2E確認 / 全譜面・主要ブラウザー                          | [#42](https://github.com/im-backgrounds/scratchlab/issues/42)、親[#19](https://github.com/im-backgrounds/scratchlab/issues/19)                                                                                  |
| Roadmap/Tasks: 主要フロー / 中断・再挑戦 / Missing・Extra・初期状態      | 既存[#20](https://github.com/im-backgrounds/scratchlab/issues/20)、[#21](https://github.com/im-backgrounds/scratchlab/issues/21)、[#22](https://github.com/im-backgrounds/scratchlab/issues/22)。二重起票しない |
| Roadmap/Tasks: Previous Result・Timing・Overlay整合 / 記録上限           | #42の検証マトリクスと#20〜#22の回帰条件                                                                                                                                                                         |
| Roadmap/Tasks: MIDI E2E Phase 1の既完了項目                              | Baselineと[実行手順](../tests/e2e/midi/README.md)。全E2E成功や全環境対応とはしない                                                                                                                              |
| Roadmap/Tasks: Ghostの既完了Phase 1/2/3/5/6/7                            | [Ghost Foundation](ghost-foundation.md)とBaseline。Storage、限定描画、メモリー状態の完了範囲を維持                                                                                                              |
| Roadmap/Tasks: 再読込後Ghostの元コンテキスト供給                         | [#43](https://github.com/im-backgrounds/scratchlab/issues/43)。設計判断であり未承認の保存移行は行わない                                                                                                         |
| Roadmap/Tasks: Ghost ON/OFF UI未接続                                     | [#44](https://github.com/im-backgrounds/scratchlab/issues/44)。既存状態をUI/描画へ接続                                                                                                                          |
| Roadmap/Tasks: 比較用記録・対応ペア / Best Run・Previous Run / Ghost再生 | [#45](https://github.com/im-backgrounds/scratchlab/issues/45)。契約と後続実装単位を設計。設計だけで機能完成としない                                                                                             |
| Roadmap/Tasks: Replayの既完了Phase 1〜7 / seek・再生操作                 | [Replay Foundation](replay-foundation.md)とBaseline                                                                                                                                                             |
| Roadmap/Tasks: Replayイベント描画・Ghost/Overlay接続                     | [#46](https://github.com/im-backgrounds/scratchlab/issues/46)。イベント表示を実装単位にし、Ghost相互接続は#43/#45の設計依存                                                                                     |
| Roadmap: Post v2 Backlog / Tasks: その他Backlog                          | Project概要の未確約候補。Timing分析、Ranking/Season、Share/4ランク、全体Multi-tab/Storage version、スクリーンショット/仕様再点検、課金案を保持                                                                  |
| 上記のうち具体化済みの技術負債                                           | [#34](https://github.com/im-backgrounds/scratchlab/issues/34)はコース進捗のみ、[#39](https://github.com/im-backgrounds/scratchlab/issues/39)は時刻整合。汎用候補全部を包含したことにしない                      |
| Tasks: Status Legend / Current Implementation / Completed全項目          | StatusはProjectへ。GitHub運用、Design Freeze、Expected、Boundary、Stop、Matching、Timing、Overlay、App Integration、MIDI Setupの完了記録はBaseline/既存リリースノート                                           |
| Tasks: Deprecated API・利用箇所 / 将来の削除候補 / テスト分類A〜C        | [Testing and Legacy APIs](testing-and-legacy-apis.md)。削除禁止条件・v1特性値・混在ファイルの注意を保持                                                                                                         |
| Tasks: Completion Decision                                               | v2リリースノートとBaseline。Ghost/Replayやデータ移行をv2完了条件へ追加しない                                                                                                                                    |
| Milestones: v0.2/v0.3/v0.4/v0.5/v1.0のOutcome/Scope/Exit criteria        | 完全な原文はBaselineの固定リンク。既提供/未提供の混在を区別し、未提供候補はProject概要、合意した現在の5目標だけMilestoneへ                                                                                      |
| Milestones: Cross-milestone gates                                        | 製品原則はVision、制約は設計判断、Prototype ModeはCopilot指示/運用文書                                                                                                                                          |
| Vision: Purpose / Users / learning loop / principles / boundaries        | Visionに残す。製品方針は変更しない                                                                                                                                                                              |
| Vision: Current foundation / Near-term direction                         | 現行提供機能と将来作業を区別し、現在の順序/進捗はGitHubへ案内                                                                                                                                                   |

## 登録結果の境界

新規Issueは#41〜#46の6件。#42だけ既存#19のSub-Issueへ追加し、
他は独立した末端Issueとして登録した。既存Issue本文や状態は書き換えていない。
既存20件と新規6件の計26件に合意したMilestoneを設定した。
Open末端24件のProject所属・Priorityを確認し、既存Status/項目を維持した。
新規Project項目はTodo。過去の完了項目を大量にIssue化/Closeしていない。

Milestoneの割当は、従来Epic本文の「手動設定が必要」という記録に対しても
実際のGitHubフィールドを正とする。移行しただけで実装完了やCI成功にはしない。

## 二重管理を終了するための変更

Roadmap/Tasks/Milestonesはリンク案内だけを残す。技術情報は仕様/技術参照へ、
履歴はBaselineへ移し、同じ未完了チェックリストを残さない。
Copilot指示、PR/Issueテンプレート、README方針、関連リンクも同じ正本構成を参照する。
この記録の件数は移行時点のスナップショットであり、将来の追加に合わせて更新しない。
