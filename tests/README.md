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

`history.test.js`は保存処理を検証します。公開データの許可項目、再接続・巻き戻し、保存の有効・無効、個別・全削除と遅延更新の競合、30件・2 MiBの上限、読み書き失敗、破損した履歴を確認します。

`history-browser.test.js`はCDPの`Extensions.loadUnpacked`で実拡張をテスト専用プロファイルに読み込み、実際の`chrome.storage.local`とcontent scriptを操作します。ページの通信はCDPの`Fetch.fulfillRequest`で匿名のHTMLに置き換え、dominion.gamesには接続しません。CPU・友達の匿名fixtureを使い、ページ再読込・Chrome再起動後の保存と削除、保存失敗の表示、長いログ、破損データの扱いを検証します。現在のChrome/Chromiumと拡張デバッグ用のCDPが必要です。テスト用プロファイルのみを再利用し、最後に削除します。

`HISTORY_QA_IMAGE=/tmp/history.png node --test tests/history-browser.test.js`で、匿名fixtureの待機中の履歴画面をPNGに保存できます。
