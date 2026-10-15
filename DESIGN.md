# NewTab — デザイン調査と実装

2026年9月7日。仕様書の参照リポジトリをデザインやコードの基礎として使わず、Apple公式の実画面を参照して設計した。

## 見た画面

- [Apple公式：iPadのホーム画面](https://support.apple.com/es-es/guide/ipad/ipad619935ea/ipados) — 公式画像を開き、ウィジェット、6列のアプリアイコン、ページドット、Dockの位置と間隔を確認。
- [Apple：2025年のソフトウェアデザイン紹介](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/) — Liquid Glassの透過面とレイヤーに関する説明。
- [Apple：ホーム画面のカスタマイズ](https://support.apple.com/guide/ipad/customize-apps-and-widgets-on-the-home-screen-ipad1b2665da/ipados) — アイコン・ウィジェットの外観とホーム画面の操作。

これらの画面や素材そのものは配布ファイルに含めない。

## 今回の解釈

正確なOS実装値の再現ではなく、実画面から読み取った比率をWeb用に調整した値を使う。

| 要素 | NewTabでの判断 |
| --- | --- |
| 全体の輪郭 | 横幅1120pxを上限とした中央のホーム。大きな製品タイトルやサイドバーを置かない |
| アイコン | 通常64px、同じ中心間隔で6個並ぶ。名前はアイコンの外側に置く |
| ウィジェット | 初期配置は横3枚。角丸28px、内側22pxの余白で情報をまとめる |
| ガラス | 背景色のアルファと背景ぼかしを分離。文字や数値へ親opacityを適用しない |
| 検索 | 3枚のウィジェットの下に幅を絞った検索欄を置く |
| Dock | アイコン名を省略し、ホームの下端に浮かせる。設定と追加をここから開ける |
| 背景 | 青・ティール・淡いラベンダーの大きな面。細かい装飾を増やさず、壁紙が見える場所を確保 |
| 編集 | 操作用のボタンとハンドルを通常画面から隠す |
| 設定 | 固定高さのシート内だけをスクロール。外側タップとEscで閉じる |
| 小画面 | 6列へ再配置。ウィジェットは幅・高さに応じて情報量を減らす |

純正UIのスクリーンショットではなく、学校の時間割や検索に合わせたオリジナルのホーム画面である。Dockは初期登録サイトのうち4つと「追加」「設定」の固定構成。登録サイトは設定から自由に変更できる。

## オリジナル壁紙

`assets/wallpaper.png` は組み込みの画像生成ツールで1点作成。生成後に目視で確認して採用した。Appleの既存壁紙を入力や編集対象として使用していない。

生成プロンプト：

```text
Use case: stylized-concept.
Asset type: original full-screen wallpaper background for a NewTab tablet home screen, high resolution landscape 1920x1200, 16:10 aspect ratio.
Primary request: a sophisticated original abstract macro of exactly two broad satin-glass translucent flowing surfaces or ribbons. Broad sweeping asymmetric planes of light: deep ink blue in the lower left, luminous ice blue and teal in the center, gently lavender in the upper right. Refined bright rims and smooth rich depth.
Style/medium: premium minimal three-dimensional abstract artwork, sleek tablet wallpaper polish without copying any existing Apple wallpaper.
Composition/framing: frame-filling abstract planes, spare restrained composition with a calm center and top region that will sit behind small translucent widgets. Curves feel monumental and soft, no busy detail.
Lighting/mood: quiet, rich, luminous soft studio light; elegant restrained color, no harsh neon.
Materials/textures: satin glass translucency, clean broad highlights, smooth gradients and gently shaded depth.
Constraints: wallpaper image only. No objects, no logos, no text, no interface, no icons, no device frame, no watermark. Avoid visual noise, particles, many little waves, overly intricate ripples, generic neon wallpaper. Generate exactly one image.
```

生成された画像は1586×992px。Web側ではcoverで表示し、縦横比の違いを吸収する。

## Landscape edition — 2026年10月16日

### 目的とスキル

検索・時間・授業・よく使うサイトへ、落ち着いて素早くアクセスできるホーム。Webのまま Apple HIG の階層、読みやすさ、余白、操作の一貫性を適用する。ネイティブ macOS のウィンドウ装飾やメニューバーを模倣するものではない。

[apple-design スキル](.design-rules/SKILL.md)を submodule として導入し、プロジェクトの `AGENTS.md` から参照する。参照ルーター、cross-platform と以下の HIG 資料を使用した。

- `layout.md › Visual hierarchy`：内容と操作のレイヤーを分け、情報を優先する。
- `liquid-glass.md › The two layers`：“Content layer … never Liquid Glass.” 情報カードから背景ぼかしを取り除き、Dock と検索という操作面に限定する。
- `typography.md › Best practices`、`accessibility.md › Text display`：システムフォント、役割のあるサイズ、実際の値によるコントラスト確認。本文と設定ラベルには rem を使う。
- `color.md › Best practices`：役割で名前を付けた CSS カスタムプロパティと、明暗ごとの色を使う。
- `dark-mode.md › Best practices`：“Ensure that your app looks good in both appearance modes.” 自動調整の標準動作は OS の外観に追従し、その場で切り替わる。既存の写真に基づく配色・手動テーマは互換性のため維持する。
- `settings.md › Best practices`：“Make settings available in ways people expect.” Command / Control + comma でも設定を開ける。
- `search-fields.md › Best practices`：“Use placeholder text to help people know what they can search for.” 新規の初期配置では検索を最初に置き、コンパクト幅では短いプレースホルダーにする。
- `widgets.md › Best practices`：情報をひと目で把握できる階層にし、取得できない状態で架空の天気や授業を表示しない。
- `designing-for-macos.md` と `references/cross-platform.md`：ポインタ、キーボード、可変ウィンドウ幅を Web の操作へ翻訳する。

### 見た目の設計

このアプリ固有のモチーフは、一日の入口にふさわしい穏やかな風景。新しく描いた SVG の丘と空を使い、外部画像・フォントの取得を必須にしない。目立つ要素は風景と時間に絞り、番号や装飾のための見出しは加えない。本文用の情報面にガラスを増やす案は、内容と操作の階層を曖昧にするため採用しなかった。

| 役割 | ライト | ダーク | 対応する面に対するコントラスト |
| --- | --- | --- | --- |
| 情報面 | `#f8faf9` | `#1f2f31` | — |
| 主文字 | `#1d2935` | `#edf3f0` | 14.10:1 / 12.38:1 |
| 補助文字 | `#5a6872` | `#b4c7bf` | 5.48:1 / 7.86:1 |
| 操作・選択 | `#235e55` | `#a8d5c0` | 7.15:1 / 8.58:1 |
| 時計の面 | `#faf5ed` | `#39352e` | ライト主文字 `#493a2b` は10.06:1 |
| 天気の面 | `#2f6861` → `#244d49` | 同じ | 明るい側に対し主文字6.15:1、補助5.13:1、アクセント4.74:1 |

比率は WCAG の sRGB 相対輝度で計算した不透明トークン間の値。写真の上のラベル、ユーザー指定の色、透過面の全ピクセルについての保証ではない。Increase Contrast / Reduce Transparency では操作面を不透明にする。

文字はシステム UI スタック。挨拶 32〜48px、時計40〜88px、標準本文14〜16px、補助12〜13pxを基本とし、表示面に応じて調整する。小さな文字を極細ウェイトにしない。操作は見えるフォーカスリングを持ち、主要ボタンは44px以上。タッチ幅のページコントロールも44px。チェックボックスはネイティブの意味を維持したスイッチ表現とし、関連ラベルからも切り替えられる。

```text
Regular                         Compact
NewTab          時刻  編集 設定  NewTab           編集 設定
        日付・挨拶                    日付・挨拶
        検索                         検索
 時計    時間割    天気               時計
        サイト                       時間割
                                    天気
       ページ / Dock                 サイト
                               ページ / Dock
```

幅760px未満は4列に再配置するため、標準幅4列のカードを小さな横幅へ押し込まない。保存された配置は上書きせず、元の配置・移行処理・グリッド設定を維持する。新規の初期配置のみ検索がカードの上になる。既存利用者の並び替え結果は保持する。

動きはページ移動、フォーカス、ボタン・Dock の軽い反応に限定する。`prefers-reduced-motion` で停止し、`prefers-reduced-transparency` と `prefers-contrast` でぼかしを外す。時計の毎秒更新では登場アニメーションを再生しない。

### 検証

`node tests/core.test.cjs` の15件と `node tests/ui.smoke.cjs` の10項目が成功。320 / 390 / 768 / 1024px、および320 / 1440pxでの文字サイズ200%を確認した。ブラウザ検証は Chromium / Playwright を使用し、天気・時間割の成功レスポンスはテスト用フィクスチャ、失敗時は通信の遮断で再現する。外部 API 自体の可用性をテスト結果に含めない。

新しい壁紙2種を Service Worker のシェルに追加し、キャッシュ名を更新した。HTTPS 上の実際のオフライン復帰、Chrome 拡張機能としての読み込み、Safari 実機とタッチジェスチャーは今回の自動検証対象外。
