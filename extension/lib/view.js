(() => {
  "use strict";
  const ns = globalThis.DominionLens ||= {};
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const percent = value => value === null ? "—" : `${(100 * value).toFixed(1)}%`;
  const symbol = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7 12 3l8 4v10l-8 4-8-4V7Z" stroke="currentColor" stroke-width="1.7"/><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4" stroke="currentColor" stroke-width="1.7"/></svg>`;
  const css = `
    :host{all:initial;position:fixed;right:16px;top:18px;z-index:2147483600;display:block;color:#233345;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit}button,select{cursor:pointer}button{color:inherit}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #447abf;outline-offset:2px}
    button{border:0;background:none}svg{display:block}.panel{width:370px;max-width:calc(100vw - 24px);height:min(790px,calc(100dvh - 36px));display:flex;flex-direction:column;background:#f7f8f5;border:1px solid #cad2cc;border-radius:18px;box-shadow:0 18px 65px #091c3240;overflow:hidden}
    header{padding:18px 20px 12px;display:flex;align-items:center;gap:11px;background:#fff}.logo{width:35px;height:35px;padding:7px;border-radius:10px;background:#143d37;color:#dceba7}.brand{flex:1}.brand b{font-size:18px;letter-spacing:-.4px;color:#183c35}.brand small{display:block;color:#6d7e75;font-size:10px;letter-spacing:.7px}.icon{font-size:21px;width:30px;height:30px;border-radius:7px}.icon:hover{background:#edf0eb}
    .status{padding:0 20px 14px;background:#fff;color:#667c70;font-size:11px;display:flex;align-items:center;gap:7px}.dot{width:6px;height:6px;border-radius:50%;background:#5c8f60}.status.demo .dot{background:#ca8f3c}
    .tabs{display:flex;padding:0 16px;background:#fff;border-bottom:1px solid #dce2db;gap:7px}.tabs button{padding:10px 13px;border-bottom:3px solid transparent;font-weight:600;color:#6d7b76}.tabs button[aria-selected=true]{border-color:#204f43;color:#204f43}
    main{overflow:auto;padding:18px 18px 24px;flex:1;scrollbar-width:thin}.toolbar{display:flex;gap:9px;align-items:center;margin-bottom:17px}.toolbar select{flex:1;min-width:0}select,input{border:1px solid #cbd5cb;border-radius:8px;background:#fff;color:#314c40;padding:7px 10px}input[type=number]{width:65px}label{color:#607466;font-size:11px}.eyebrow{color:#74877b;font-size:10px;letter-spacing:1px;margin:0 0 9px;font-weight:600}
    .summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.stat{border:1px solid #dde4da;background:#fff;border-radius:12px;padding:12px 14px}.stat.primary{background:#203f37;color:#f1f7e4;border-color:#203f37}.stat p{font-size:11px;margin:0 0 4px;color:#738575}.stat.primary p{color:#d2dfc9}.number{font-size:27px;line-height:1.25;letter-spacing:-.8px;font-weight:650}.unit{font-size:11px;margin-left:5px;letter-spacing:0;font-weight:400}.stat small{font-size:10px;display:block;margin-top:6px;color:#81917e}.stat.primary small{color:#cbd8c4}
    .mix{display:flex;gap:3px;margin:16px 0 7px;height:7px;border-radius:5px;overflow:hidden}.mix span{min-width:0}.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:10px;color:#71816f}.legend i{display:inline-block;width:6px;height:6px;border-radius:2px;margin-right:4px}.action-stat{padding:10px 12px}.action-stat .number{font-size:24px}.action-stat .copies{float:right;font-size:11px;font-weight:500}.money-chart{display:flex;gap:4px;align-items:flex-end;height:72px;margin-top:14px}.money-chart .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:9px;color:#8b967e}.money-chart i{display:block;background:#b8caad;width:100%;max-width:25px;border-radius:3px 3px 0 0;min-height:2px}.money-chart .strong i{background:#66835a}
    .thresholds{display:flex;gap:15px;margin:11px 0;font-size:11px;color:#71836f}.thresholds b{color:#324d3c;margin-left:4px}.note{font-size:10px;line-height:1.7;color:#7c8b7a;margin:8px 0 15px}.notice{padding:10px 12px;background:#fff2df;border:1px solid #ebd6ac;border-radius:9px;color:#876332;font-size:11px;margin:12px 0;line-height:1.7}
    .section-heading{display:flex;align-items:center;justify-content:space-between;margin:23px 0 11px}.section-heading h2{font-size:13px;font-weight:600;margin:0}.section-heading span{font-size:10px;color:#7c8d7b}.segmented{display:flex;background:#e9eee5;padding:3px;border-radius:9px;margin:10px 0 12px;gap:2px}.segmented button{flex:1;padding:5px 3px;border-radius:6px;font-size:11px;color:#768470}.segmented button[aria-pressed=true]{background:#fff;color:#294a3a;box-shadow:0 1px 4px #25362114}.draw-controls{display:flex;gap:7px;align-items:center;margin-bottom:9px}.draw-controls input{padding:4px 6px;width:48px}.draw-controls label{flex:1;font-size:10px}
    .card-row{display:grid;grid-template-columns:5px 1fr 28px 58px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #e3e8dd}.card-row .stripe{height:27px;border-radius:3px}.card-name{font-size:12px;font-weight:550}.card-name small{display:block;font-size:9px;font-weight:400;color:#899482}.copies{text-align:center;font-weight:650;font-size:13px;color:#4d634b}.chance{font-variant-numeric:tabular-nums;font-size:11px;text-align:right;color:#627b58}.chance .track{height:3px;margin-top:4px;background:#e0e9d8;border-radius:5px;overflow:hidden}.chance i{display:block;height:100%;background:#8baa72}
    .empty{padding:28px 4px;text-align:center;color:#83927e;font-size:12px}.welcome{padding:25px 4px}.welcome h1{font-size:22px;font-weight:650;color:#29483b;line-height:1.6;margin:0 0 10px}.welcome p{font-size:12px;color:#768a79;line-height:1.9}.feature{margin-top:20px;border-top:1px solid #e0e6db;padding-top:15px;font-size:12px;color:#587156}.feature strong{display:block;margin-bottom:5px;color:#29483b}
    .filters{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}.filters label{display:flex;align-items:center;gap:5px}.filters input[type=checkbox]{accent-color:#244f3c}.recommend{background:#fff;border:1px solid #dce4d6;border-radius:11px;margin:10px 0;padding:13px 13px 11px}.recommend-top{display:flex;align-items:center;gap:9px}.rank{font-size:16px;color:#8ba17b;width:18px}.recommend-title{flex:1;min-width:0;font-weight:600;font-size:13px}.recommend-title small{display:block;font-size:9px;font-weight:400;color:#81917c}.score{color:#2c5f45;background:#eaf2e1;border-radius:7px;padding:5px 8px;font-size:12px;font-weight:650}.score.unknown{color:#8d9486;background:#f0f2ec;font-size:10px}.cost{font-size:10px;color:#6e8663;margin:7px 0}.recommend p{font-size:11px;color:#687f61;line-height:1.8;margin:8px 0 0}.recommend details{font-size:10px;color:#79916e;margin-top:8px}.recommend details p{font-size:10px}.subheading{font-size:12px;color:#3c614c;margin:22px 0 8px}.guide p,.guide li{font-size:12px;line-height:1.9;color:#6f836b}.guide ul{padding-left:18px}.guide code{font-size:11px;background:#e7eddf;padding:2px 4px;border-radius:3px}.footer{border-top:1px solid #dce3d7;background:#f1f5ec;padding:9px 18px;display:flex;justify-content:space-between;font-size:9px;color:#8a967f}.pill{border-radius:30px;background:#203f37;color:#eaf1da;box-shadow:0 5px 25px #1732224a;padding:10px 16px;display:flex;align-items:center;gap:9px;font-weight:600;font-size:12px}.pill svg{width:19px;height:19px}
    @media(max-width:480px){:host{right:8px;top:8px}.panel{width:350px;height:calc(100dvh - 16px)}}
  `;
  const colors = { action: "#7eab9c", treasure: "#d8b864", victory: "#acc77c", curse: "#a795bb", other: "#aab6ae" };
  const typeColor = c => c.types.includes("ACTION") ? colors.action : c.types.includes("TREASURE") ? colors.treasure : c.types.includes("VICTORY") ? colors.victory : c.types.includes("CURSE") ? colors.curse : colors.other;
  class Panel {
    constructor(host, { onChange, settings = {} } = {}) {
      this.root = host.attachShadow({ mode: "open" });
      this.settings = { tab: "deck", zone: "owned", draws: 5, minimized: false, basic: false, budget: "", ...settings };
      this.snapshot = { status: "waiting" }; this.onChange = onChange || (() => {});
      this.root.addEventListener("click", event => {
        const button = event.target.closest("button[data-action]"); if (!button) return;
        const { action, value } = button.dataset;
        if (action === "tab") this.settings.tab = value;
        if (action === "zone") this.settings.zone = value;
        if (action === "minimize") this.settings.minimized = !this.settings.minimized;
        this.render(); this.onChange(this.settings);
      });
      this.root.addEventListener("change", event => {
        const { key } = event.target.dataset; if (!key) return;
        if (key === "draws") this.settings.draws = Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 5)));
        else if (key === "basic") this.settings.basic = event.target.checked;
        else if (key === "player") { this.settings.player = Number(event.target.value); this.settings.zone = "owned"; }
        else if (key === "budget") this.settings.budget = event.target.value === "" ? "" : Math.min(100, Math.max(0, Number(event.target.value) || 0));
        this.render(); this.onChange(this.settings);
      });
      this.root.addEventListener("keydown", event => {
        if (event.target.getAttribute("role") !== "tab") return;
        const tabs = ["deck", "kingdom", "guide"], current = tabs.indexOf(this.settings.tab);
        const next = event.key === "ArrowRight" ? (current + 1) % 3 : event.key === "ArrowLeft" ? (current + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
        if (next < 0) return;
        event.preventDefault(); this.settings.tab = tabs[next]; this.render();
        this.root.querySelector(`#tab-${tabs[next]}`).focus();
      });
      this.render();
    }
    update(snapshot) {
      this.snapshot = snapshot;
      // Let a user finish editing a number while automatic game updates arrive.
      if (this.root.activeElement?.matches('input[type="number"]') && snapshot.status === "ready") return;
      this.render();
    }
    render() {
      const scroll = this.root.querySelector("main")?.scrollTop || 0;
      const focus = this.root.activeElement?.dataset?.key;
      const expanded = [...this.root.querySelectorAll("details[open][data-card]")].map(d => d.dataset.card);
      const { settings: s, snapshot: data } = this;
      if (s.minimized) { this.root.innerHTML = `<style>${css}</style><button class="pill" data-action="minimize" aria-label="Dominion Lensを開く">${symbol}Dominion Lens</button>`; return; }
      const players = data.status === "ready" ? ns.analysis.replay(data.players, data.logs) : [];
      const player = players.find(p => p.index === s.player) || players.find(p => p.isMe) || players[0];
      if (player) s.player = player.index;
      const own = data.ownZones?.find(z => z.index === player?.index);
      const status = data.demo ? "デモ · サンプル対戦" : data.status === "ready" ? `友達・CPU戦 · 第${data.turn || 1}ターン` : data.status === "rated" ? "レート戦 · 表示停止" : "対戦の開始を待っています";
      let body;
      if (s.tab === "guide") body = this.guide();
      else if (!player) body = `<div class="welcome"><p class="eyebrow">YOUR DECK, IN FOCUS</p><h1>デッキの今を、<br>ひと目で。</h1><p>${escape(data.message || "dominion.gamesでログインし、友達またはCPUとの対戦を開始してください。")}</p><div class="feature"><strong>所有カードとドロー確率</strong>獲得・廃棄のログからデッキを追跡します。</div><div class="feature"><strong>平均金量と王国評価</strong>財宝の期待値と、購入候補の理由を表示します。</div></div>`;
      else {
        const select = `<div class="toolbar"><label for="player">プレイヤー</label><select id="player" data-key="player">${players.map(p => `<option value="${p.index}" ${p.index === player.index ? "selected" : ""}>${escape(p.name)}${p.isMe ? "（自分）" : ""}</option>`).join("")}</select></div>`;
        const warnings = player.issues.map(i => `<div class="notice">${escape(i)}</div>`).join("");
        body = select + warnings + (s.tab === "kingdom" ? this.kingdom(player) : this.deck(player, own));
      }
      this.root.innerHTML = `<style>${css}</style><section class="panel" aria-label="Dominion Lens デッキ分析"><header><div class="logo">${symbol}</div><div class="brand"><b>Dominion Lens</b><small>デッキを知る。次の一手を考える。</small></div><button class="icon" data-action="minimize" aria-label="パネルを折りたたむ">−</button></header><div class="status ${data.demo ? "demo" : ""}"><span class="dot"></span>${escape(status)}</div><nav class="tabs" role="tablist" aria-label="分析メニュー">${[["deck", "デッキ"], ["kingdom", "王国"], ["guide", "使い方"]].map(([key, label]) => `<button id="tab-${key}" role="tab" aria-controls="lens-main" aria-selected="${s.tab === key}" data-action="tab" data-value="${key}">${label}</button>`).join("")}</nav><main id="lens-main" role="tabpanel" aria-labelledby="tab-${s.tab}">${body}</main><div class="footer"><span>ローカルで分析 · データ送信なし</span><span>v0.1.1</span></div></section>`;
      this.root.querySelector("main").scrollTop = scroll;
      for (const details of this.root.querySelectorAll("details[data-card]")) if (expanded.includes(details.dataset.card)) details.open = true;
      if (focus) this.root.querySelector(`[data-key="${focus}"]`)?.focus({ preventScroll: true });
    }
    deck(player, own) {
      const { snapshot: data, settings: s } = this;
      const m = ns.analysis.metrics(player.counts, data.metadata);
      const money = m.money, exact = player.complete;
      const stats = `<p class="eyebrow">DECK OVERVIEW</p><div class="summary"><div class="stat primary"><p>所有カード</p><div class="number">${exact ? m.total : "—"}<span class="unit">枚</span></div><small>手札・山札・捨て札・場を含む</small></div><div class="stat"><p>5枚の期待金量${money.unknown ? "（下限）" : ""}</p><div class="number">${exact ? money.expected.toFixed(2) : "—"}<span class="unit">金</span></div><small>財宝のみ・全体シャッフル想定</small></div></div>`;
      const mixes = Object.entries(m.types).filter(([, value]) => value > 0);
      const labels = { action: "アクション", treasure: "財宝", victory: "勝利点", curse: "呪い", other: "その他" };
      const mix = `<div class="mix" aria-label="カードの構成">${mixes.map(([type, value]) => `<span style="flex:${value};background:${colors[type]}"></span>`).join("")}</div><div class="legend">${mixes.map(([type, value]) => `<span><i style="background:${colors[type]}"></i>${labels[type]} ${value}</span>`).join("")}</div>`;
      const composition = m.actionComposition;
      const actionMix = `<section aria-label="アクションの構成"><div class="section-heading"><h2>アクションの構成</h2><span>所有全体に対する割合</span></div>${exact ? `<div class="summary">${[["terminal", "アクションエンド"], ["combo", "コンボ"]].map(([role, label]) => {
        const part = composition[role];
        return `<div class="stat action-stat" data-role="${role}"><p>${label}<span class="copies">${part.count}枚</span></p><div class="number">${percent(part.deckRatio)}</div><small>アクション内 ${percent(part.actionRatio)}</small></div>`;
      }).join("")}</div>${composition.unknown.count ? `<p class="notice">未分類のアクション ${composition.unknown.count}枚（所有全体 ${percent(composition.unknown.deckRatio)}／アクション内 ${percent(composition.unknown.actionRatio)}）。対応しているカードだけを分類しています。</p>` : ""}` : `<p class="notice">所有カードを確定できないため、割合は未確定です。</p>`}<p class="note">エンド：＋アクションなし／コンボ：＋1アクション以上。カード自体の効果で分類し、条件付きの連続使用は含みません。詳しくは「使い方」。</p></section>`;
      const max = Math.max(...money.distribution.map(d => d.probability), .01);
      const chart = `<div class="section-heading"><h2>5枚の財宝金量</h2><span>全体シャッフル想定</span></div><div class="money-chart" aria-label="5枚の財宝金量の分布">${money.distribution.map(d => `<div class="bar ${d.money >= 5 ? "strong" : ""}" title="${d.money}金: ${percent(d.probability)}"><i style="height:${Math.max(2, d.probability / max * 50)}px"></i><span>${d.money}</span></div>`).join("")}</div><div class="thresholds"><span>5金以上<b>${percent(money.p5)}</b></span><span>8金以上<b>${percent(money.p8)}</b></span></div>`;
      const modelNote = `<p class="note">${money.unknown ? "未対応の財宝は0金で計算した下限です。" : "アクションの金量・追加ドロー・コイントークンは含みません。"} 全所有カードから無作為に5枚選ぶモデルです。</p>`;
      let counts = player.counts, available = exact, explanation = "全所有カードをシャッフルし、無作為に引く想定";
      if (s.zone === "draw") { counts = ns.analysis.deriveDraw(player, own); available = !!counts; explanation = "現在の山札を無作為に引く想定。既知の順番は考慮しません。山札より多い指定は残り枚数までで計算します"; }
      if (s.zone === "discard") { counts = own?.discard?.counts; available = !!own?.discard?.complete; explanation = "追跡できた捨て札の内訳"; }
      const zones = `<div class="section-heading"><h2>カード内訳</h2><span>${available ? `${ns.analysis.size(counts)}枚` : "未確定"}</span></div><div class="segmented">${[["owned", "所有全体"], ["draw", "山札"], ["discard", "捨て札"]].map(([key, label]) => `<button data-action="zone" data-value="${key}" aria-pressed="${s.zone === key}">${label}</button>`).join("")}</div>`;
      const control = s.zone !== "discard" ? `<div class="draw-controls"><label for="draws">次の<input id="draws" type="number" min="1" max="20" data-key="draws" value="${s.draws}">枚に1枚以上含まれる確率</label></div>` : "";
      let rows;
      if (!available) rows = `<div class="notice">${s.zone === "owned" ? "開始時のログを含む対戦で確認してください。" : !player.isMe ? "相手の山札・捨て札の内訳は表示しません。所有全体の集計を確認できます。" : "内訳を確定できません。途中参加・巻き戻し後は、捨て札が空になるまで追跡を待ちます。"}</div>`;
      else rows = Object.entries(counts || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => {
        const c = ns.card(name, data.metadata[name]);
        const probability = ns.analysis.drawProbability(ns.analysis.size(counts), count, s.draws);
        return `<div class="card-row"><span class="stripe" style="background:${typeColor(c)}"></span><div class="card-name">${escape(c.ja)}<small>${escape(name)}</small></div><span class="copies">${count}</span><div class="chance">${s.zone === "discard" ? "枚" : `${percent(probability)}<div class="track"><i style="width:${probability * 100}%"></i></div>`}</div></div>`;
      }).join("") || `<div class="empty">この領域にカードはありません。</div>`;
      return stats + mix + actionMix + (exact ? chart + modelNote : "") + zones + control + `<p class="note">${explanation}</p>` + rows;
    }
    kingdom(player) {
      const { snapshot: data, settings: s } = this;
      let recs = ns.analysis.recommendations(data.supply, player.counts, data.metadata, data.turn);
      if (!s.basic) recs = recs.filter(r => !r.base);
      if (s.budget !== "") recs = recs.filter(r => r.cost !== null && r.cost <= Number(s.budget) && !r.potion && !r.debt);
      const filters = `<p class="eyebrow">KINGDOM INSIGHTS</p><div class="filters"><label><input type="checkbox" data-key="basic" ${s.basic ? "checked" : ""}>基本カードも含める</label><label for="budget">購入可能額<input id="budget" type="number" min="0" max="100" placeholder="全て" value="${s.budget}" data-key="budget"></label></div><p class="note">基本セット第2版の独自評価です。点数は勝率ではなく、今のデッキでの優先度の目安です。${s.budget !== "" ? " ポーション・負債コストのカードは金額フィルターの対象外です。" : ""}</p>`;
      if (!player.complete) return filters + `<div class="notice">所有カードを確定できないため、状況に応じた評価を停止しています。</div>`;
      if (!recs.length) return filters + `<div class="empty">条件に合うカードがありません。</div>`;
      return filters + recs.map((r, i) => `<article class="recommend"><div class="recommend-top"><span class="rank">${r.score === null ? "·" : String(i + 1).padStart(2, "0")}</span><div class="recommend-title">${escape(r.card.ja)}<small>${escape(r.name)}</small></div><span class="score ${r.score === null ? "unknown" : ""}">${r.score === null ? "未評価" : `${r.score.toFixed(1)} / 10`}</span></div><div class="cost">${r.cost ?? "?"}金${r.potion ? ` + ${r.potion}ポーション` : ""}${r.debt ? ` + ${r.debt}負債` : ""} · 残り${r.remaining}枚 · 所有${player.counts[r.name] || 0}枚</div><p>${escape(r.reasons[r.reasons.length - 1])}</p>${r.reasons.length > 1 ? `<details data-card="${escape(r.name)}"><summary>評価の理由をすべて見る</summary>${r.reasons.slice(0, -1).map(reason => `<p>${escape(reason)}</p>`).join("")}</details>` : ""}</article>`).join("");
    }
    guide() {
      return `<div class="guide"><p class="eyebrow">HOW IT WORKS</p><h2 class="subheading">対戦中の使い方</h2><p>プレイヤーを切り替えると、自分や相手の所有カードを確認できます。「所有全体」は手札・山札・捨て札・場のカードを含みます。</p><p>「山札」「捨て札」は自分のカードだけを追跡します。途中参加や巻き戻しで情報が不足したときは、捨て札が空になるまで未確定と表示します。</p><h2 class="subheading">アクションエンドとコンボ</h2><p>アクションエンドは、カード自体に＋アクションがないカード（鍛冶屋・礼拝堂など）。コンボは、＋1アクション以上のカード（村・研究所・市場など）です。ここでのコンボは相性のよいカードすべてを指しません。</p><p>玉座の間や家臣は他のカードによって連続使用できますが、自身に＋アクションがないためエンドに分類します。実際に使える回数や村で使い切れるかを計算する指標ではありません。</p><p>大きい割合は所有全体に対する割合です。「アクション内」は全アクションを分母に計算します。山札・捨て札へ切り替えても、この集計は所有全体を対象にします。</p><p>分類は基本セット第2版に対応しています。未対応のアクションは未分類として分母に含めます。アクションが0枚ならアクション内は「—」、所有カードが未確定なら割合も未確定です。</p><h2 class="subheading">平均金量と確率</h2><p>期待金量と5金・8金に届く確率は、全所有カードから無作為に5枚選んだ財宝だけで計算します。アクションの効果や手札を使う順番は含みません。</p><p>ドロー確率は指定した枚数にそのカードが1枚以上含まれる確率です。山札を選んだ場合も、上に戻したカードなど既知の順番は考慮しません。山札を超えるドローで捨て札を混ぜる計算は行いません。</p><h2 class="subheading">王国の評価</h2><p>基本セット第2版26枚と主要な財宝・勝利点に対応しています。廃棄の需要、アクション回数、呪いの残数などで優先度を調整します。拡張セットのカードは内訳に表示できても、評価は「未評価」です。</p><h2 class="subheading">接続とデータ</h2><p>友達・CPU戦向けです。レート戦では表示を停止します。分析はブラウザ内で実行し、対戦ログやプレイヤー名を保存・外部送信しません。表示設定のみChromeに保存します。</p><p>パネルが接続できない場合は、拡張を読み込み直してからdominion.gamesのページを再読み込みしてください。</p></div>`;
    }
  }
  ns.Panel = Panel;
})();
