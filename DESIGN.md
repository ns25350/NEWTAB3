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
