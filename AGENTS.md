# Repository Guidelines

## プロジェクト構成とモジュール

このリポジトリは WXT + React + TypeScript で作られた Chrome 拡張です。拡張の entrypoint は `entrypoints/` にあります。`background.ts` は service worker と右クリックメニュー、自動削除処理を担当します。`popup/` はポップアップ UI、`options/` は設定画面、`shared/` は設定保存やクリーンアップ処理の共通ロジックです。静的アセットは `public/` に置き、拡張アイコンは `public/icon/` に配置します。`.output/` はビルド成果物なのでコミットしません。

## ビルド・テスト・開発コマンド

- `npm install`: 依存関係をインストールし、`wxt prepare` を実行します。
- `npm run dev`: Chrome 向けの WXT 開発モードを起動します。
- `npm run build`: Chrome MV3 拡張を `.output/chrome-mv3` にビルドします。
- `npm run compile`: `tsc --noEmit` で TypeScript の型チェックを行います。
- `npm run zip`: Chrome 拡張の zip を作成します。
- `npm run dev:firefox` / `build:firefox` / `zip:firefox`: Firefox 向けの同等コマンドです。

専用の自動テストはまだありません。変更前後の最低確認として `npm run compile` と `npm run build` を実行してください。

## コーディングスタイルと命名規則

TypeScript、React function component、ES modules を使います。インデントは 2 スペース、文字列は既存コードに合わせて single quote を優先します。関数・変数は `camelCase`、React コンポーネントと exported type は `PascalCase` を使います。ブラウザ API や削除処理の共通ロジックは `entrypoints/shared/` に置き、UI 側へ重複実装しないでください。

## テスト方針

クリーンアップ処理を変更した場合は、`.output/chrome-mv3` を Chrome に読み込み、popup、options、右クリックメニュー、自動削除、権限が必要な処理を手動確認してください。UI 変更では popup と options の両方を確認し、ライトモードとダークモードで表示崩れがないか見ます。将来テストフレームワークを追加する場合は、配置場所と実行コマンドをこのファイルに追記してください。

## コミットと Pull Request

最近のコミットは `Add dark mode styling` や `Remove unused starter assets` のような短い命令形です。同じ形式で、1 行目に変更内容を簡潔に書いてください。Pull Request には変更概要、実行した確認コマンド、Chrome での手動確認内容、UI 変更時のスクリーンショットを含めます。

## セキュリティと設定

この拡張は `<all_urls>`、cookies、browsing data、tabs、scripting、history など広い権限を要求します。権限追加は最小限にし、必要な理由を説明してください。ビルド成果物、ローカルのブラウザプロファイル、API キー、一時生成ファイルはコミットしないでください。
