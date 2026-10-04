# Panel操作テスト

`panel-interactions.test.js`は実際のChrome/ChromiumのDOM、フォーカス、キー入力、クリックを使ってPanelを検証します。匿名の開始デッキと獲得データだけを渡し、dominion.gamesには接続しません。

Node.js 22以降とChrome/Chromiumが必要です。npmパッケージのインストールは不要です。

```sh
node --test --test-concurrency=2 tests/*.test.js
```

macOSの標準ChromeまたはPATH上のChrome/Chromiumを自動検出します。別の場所にある場合は実行ファイルのパスを`CHROME_BIN`に指定してください。

```sh
CHROME_BIN=/path/to/chromium node --test tests/panel-interactions.test.js
```

ブラウザがない環境ではPanel操作テストを理由付きでskipします。指定した`CHROME_BIN`が存在しない場合、起動に失敗した場合、操作結果が異なる場合はテストを失敗させます。CIでPanel操作テストも必須にする場合はChrome/Chromiumを用意し、`CHROME_BIN`を指定してください。

テストは独立したheadlessプロセス、一時プロファイル、動的なローカルデバッグポートを使用し、終了時にプロセスとプロファイルを削除します。既存のChrome、拡張機能、対局タブには接続しません。Panelの各ケースは同じ専用ブラウザ内で順番に実行します。
