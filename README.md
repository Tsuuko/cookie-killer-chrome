# Cookie Killer

Cookie Killer は、ホワイトリストに登録したサイトだけを残し、それ以外の Cookie やブラウザストレージを削除する Chrome 拡張です。WXT + React + TypeScript で実装しています。

## 主な機能

- ホワイトリスト外の Cookie を削除
- localStorage / sessionStorage の削除対象を選択
- 履歴の全削除
- popup からの即時クリーンアップ
- 拡張アイコンの右クリックメニューから自動削除の ON/OFF と設定画面を開く
- 最後の通常ウィンドウ終了時と次回起動時の自動クリーンアップ
- ライトモード / ダークモード対応

## 使い方

1. `npm install` を実行します。
2. `npm run build` で Chrome 拡張をビルドします。
3. Chrome の拡張機能ページで「デベロッパー モード」を有効にします。
4. 「パッケージ化されていない拡張機能を読み込む」から `.output/chrome-mv3` を選択します。
5. 拡張アイコンをクリックし、ホワイトリストや削除ターゲットを設定します。

## 開発コマンド

```bash
npm run dev       # WXT の開発モードを起動
npm run compile   # TypeScript の型チェック
npm run build     # Chrome MV3 拡張をビルド
npm run zip       # 配布用 zip を作成
```

Firefox 向けには `npm run dev:firefox`、`npm run build:firefox`、`npm run zip:firefox` を使います。

## プロジェクト構成

- `entrypoints/background.ts`: service worker、右クリックメニュー、自動削除
- `entrypoints/popup/`: popup UI
- `entrypoints/options/`: 設定画面
- `entrypoints/shared/`: 設定保存とクリーンアップ共通ロジック
- `public/icon/`: 拡張アイコン
- `.output/`: ビルド成果物。コミット対象外

## 注意点

sessionStorage は Chrome API で全サイト分を一括列挙できないため、開いている通常ページのタブのみ削除対象になります。履歴削除はホワイトリストとは関係なく全削除です。
