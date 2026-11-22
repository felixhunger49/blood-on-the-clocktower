// Blood on the Clocktower – Rollen-App (ohne Server, alles im Browser).

(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const view = $("#view");

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Speicher ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privater Modus */ }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    }
  };

  // ---------- Zufall ----------
  function randInt(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, k) => shuffle(arr).slice(0, k);

  // ---------- Spieler-Codes (5 Zeichen) ----------
  // 25 Bit: Rolle (7) | Gesinnung (2) | Platz (5) | Salz (5) | Prüfsumme (6), verwürfelt per Multiplikation.
  const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const MOD = 2 ** 25;
  const MUL = 0x1A3B5C9; // ungerade -> umkehrbar modulo 2^25
  const mulmod = (a, b) => (a * b) % MOD;
  const MUL_INV = (() => {
    let x = MUL;
    for (let i = 0; i < 6; i++) x = mulmod(x, (2 - mulmod(MUL, x) + MOD) % MOD);
    return x;
  })();
  const check6 = p => { const h = Math.imul(p ^ 0x5bd1e995, 0x01000193) >>> 0; return (h ^ (h >>> 13)) & 63; };

  function makeCode(roleIdx, align, seat, salt) {
    const p = roleIdx | (align << 7) | (seat << 9) | (salt << 14);
    let v = mulmod(p * 64 + check6(p), MUL);
    let s = "";
    for (let i = 0; i < 5; i++) { s = ALPHABET[v & 31] + s; v = Math.floor(v / 32); }
    return s;
  }
  function readCode(code) {
    code = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (code.length !== 5) return null;
    let v = 0;
    for (const ch of code) {
      const d = ALPHABET.indexOf(ch);
      if (d < 0) return null;
      v = v * 32 + d;
    }
    v = mulmod(v, MUL_INV);
    const p = Math.floor(v / 64);
    if ((v & 63) !== check6(p)) return null;
    const role = ROLES[p & 127];
    if (!role) return null;
    const align = (p >> 7) & 3;
    return { r: role.id, s: (p >> 9) & 31, a: align === 1 ? "g" : align === 2 ? "e" : undefined };
  }

  // ---------- Links (verschleiert, damit man die Rolle nicht in der URL liest) ----------
  const KEY = new TextEncoder().encode("clocktower-grimoire");
  function encodeLink(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b, i) => { bin += String.fromCharCode(b ^ KEY[i % KEY.length]); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeLink(str) {
    try {
      const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY[i % KEY.length]);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      return ROLE_BY_ID[obj.r] ? obj : null;
    } catch (e) { return null; }
  }
  const baseUrl = () => location.href.split("#")[0];

  // ---------- Hilfen zu Rollen ----------
  const isGood = (role, align) => role.t === "traveller" || align ? align !== "e" : TEAMS[role.t].good;
  const teamClass = (role, align) => role.t === "traveller" ? (align === "e" ? "t-evil-trav" : "t-traveller") : "t-" + role.t;
  // Gehört eine Rolle zur Edition? Bei „Eigene Liste“ entscheidet die Rollenliste des Spielleiters.
  const scIds = sc => (sc || []).map(x => typeof x === "number" ? (ROLES[x] || {}).id : x).filter(Boolean);
  const inEd = (r, ed, script) => ed === "custom" ? scIds(script || game.script).includes(r.id) : r.ed === ed;
  // Rollenliste des aktuellen Spiels (Spielleiter: eigene Liste; Spieler: von der Karte oder aus dem Online-Spiel)
  function gameScript() {
    const mine = store.get("botc.myrole", null);
    if (mine && mine.sc) return scIds(mine.sc);
    if (typeof pubState !== "undefined" && pubState && pubState.script) return scIds(pubState.script);
    if (game.edition === "custom" && (game.script || []).length && game.seats.length) return game.script.slice();
    return null;
  }
  function scriptInfo() {
    const sc = gameScript();
    if (sc) return { ids: sc, name: "Euer Skript" };
    const mine = store.get("botc.myrole", null), role = mine && ROLE_BY_ID[mine.r];
    let ed = typeof pubState !== "undefined" && pubState && pubState.ed && pubState.ed !== "custom" ? pubState.ed : null;
    if (!ed && role && EDITIONS[role.ed] && !EDITIONS[role.ed].extra && role.t !== "traveller") ed = role.ed;
    if (!ed && game.seats.length && game.edition !== "custom" && EDITIONS[game.edition]) ed = game.edition;
    return ed ? { ids: ROLES.filter(r => r.ed === ed).map(r => r.id), name: EDITIONS[ed].name } : null;
  }
  // Nachtreihenfolge für eine Rollenliste (erste Nacht / andere Nächte)
  function nightOrderHtml(ids, title) {
    const col = (order, key, head) => {
      let k = 0;
      const items = order.map(id => {
        if (id === "dusk" || id === "dawn") return "";
        if (NIGHT_STEPS[id]) return key === "n1" ? `<li class="no-step"><span class="no-n">${++k}</span> 🤫 ${esc(NIGHT_STEPS[id].de)} <small>(ab 7 Spielern)</small></li>` : "";
        const r = ROLE_BY_ID[id];
        if (!r || !ids.includes(id) || !r[key]) return "";
        return `<li><details><summary><span class="no-n">${++k}</span> <span class="lex-ic">${r.ic}</span><b class="t-${r.t}-text">${esc(r.de)}</b>${r.t === "traveller" ? ` <small class="small">(Reisender)</small>` : ""}</summary><p class="small">${esc(r.a)}</p></details></li>`;
      }).join("");
      return `<div class="no-col"><h3>${head}</h3><ol class="no-list">${items || "<li class='small'>–</li>"}</ol></div>`;
    };
    return `<details class="panel nightorder"><summary><h2>🌙 Nachtreihenfolge <span class="small">(${esc(title)})</span></h2></summary>
      <p class="small">In dieser Reihenfolge weckt der Spielleiter die Rollen – aber nur die, die wirklich im Spiel sind. Antippen zeigt die Fähigkeit.</p>
      <div class="no-cols">${col(NIGHT_FIRST, "n1", "Erste Nacht")}${col(NIGHT_OTHER, "n", "Andere Nächte")}</div></details>`;
  }
  const rolesOf = (ed, team) => ROLES.filter(r => inEd(r, ed) && r.t === team);
  const roleName = id => ROLE_BY_ID[id] ? ROLE_BY_ID[id].de : "?";

  // ---------- Rollenkarte ----------
  // Spion: Kopie des Grimoires, wie der Spielleiter es geschickt hat
  function grimBox(g) {
    return `<details class="box grimbox" open><summary><h4>📖 Das Grimoire (Nacht ${g.n})</h4></summary>
      <ol class="grimlist">${g.s.map(([name, rid, alive, marks, extra]) => { const r = ROLE_BY_ID[rid] || {}; return `<li class="${alive ? "" : "dead"} t-${r.t || ""}-border">
        <b>${esc(name)}</b> <span>${r.ic || ""} ${esc(r.de || "?")}${extra ? ` <small>(${esc(extra)})</small>` : ""}</span>${alive ? "" : " 💀"}${marks ? ` <span class="gl-marks">${esc(marks)}</span>` : ""}</li>`; }).join("")}</ol>
      ${(g.b || []).length ? `<p class="small">Bluffs des Dämons: ${g.b.map(id => esc(roleName(id))).join(", ")}</p>` : ""}</details>`;
  }

  function cardHtml(info) {
    const role = ROLE_BY_ID[info.r];
    const good = isGood(role, info.a);
    const team = TEAMS[role.t];
    let evil = "";
    if (info.x) {
      const x = info.x;
      evil = `<div class="box evilinfo"><h4>🤫 Geheime Info deines Teams</h4>`;
      if (x.d) evil += `<p>${x.tr ? "Du bist ein böser Reisender. Der Dämon ist" : "Dein Dämon ist"}: <b>${esc(x.d)}</b></p>`;
      if (x.m && x.m.length) evil += `<p>${x.d ? "Weitere Schergen" : "Deine Schergen"}: <b>${x.m.map(esc).join(", ")}</b></p>`;
      if (x.m && !x.m.length && !x.d) evil += `<p>Du hast keine Schergen.</p>`;
      if (x.l) evil += `<p>Der Wahnsinnige (glaubt, Dämon zu sein): <b>${esc(x.l)}</b></p>`;
      if (x.mo) evil += `<p>Deine Marionette (glaubt, gut zu sein): <b>${esc(x.mo)}</b></p>`;
      if (x.b && x.b.length) evil += `<p>Deine Bluffs (gute Rollen, die nicht im Spiel sind):</p><ul>${x.b.map(id => `<li><b>${esc(roleName(id))}</b> – ${esc(ROLE_BY_ID[id].a)}</li>`).join("")}</ul>`;
      evil += `</div>`;
    }
    const grim = (info.g ? grimBox(info.g) : "") + (info.amk ? `<div class="box ability"><h4>❓ Deine Fähigkeit (erraten!)</h4><p>${esc(info.amk)}</p></div>` : "");
    return `
      <div class="rolecard ${teamClass(role, info.a)}">
        <div class="rc-head">
          ${info.n ? `<div class="rc-for">Für: ${esc(info.n)}</div>` : ""}
          <div class="rc-icon">${role.ic}</div>
          <div class="rc-name">${esc(role.de)}</div>
          <div class="rc-en">${esc(role.en)}</div>
          <div class="rc-team">${team.name} · ${good ? "Gut 😇" : "Böse 😈"}</div>
        </div>
        <div class="rc-body">
          <div class="box ability"><h4>Deine Fähigkeit</h4><p>${esc(role.a)}</p></div>
          <div class="box"><h4>So funktioniert's</h4><p>${esc(role.e)}</p></div>
          ${role.tip ? `<div class="box"><h4>💡 Tipp</h4><p>${esc(role.tip)}</p></div>` : ""}
          ${grim}
          ${(info.i || []).length ? `<div class="box infos"><h4>🌙 Deine Infos vom Spielleiter</h4><ul>${info.i.map(x =>
            `<li>${String(x.t || "").startsWith("☀️") ? "" : `<b>Nacht ${x.n}:</b> `}${[(x.r || []).map(id => esc(roleName(id))).join(" / "), x.t ? esc(x.t) : ""].filter(Boolean).join(" – ")}</li>`).join("")}</ul></div>` : ""}
          ${info.m && ROLE_BY_ID[info.m] ? `<div class="box madness"><h4>😵 Wahnsinn</h4>
            <p>Du musst am Tag <b>überzeugend behaupten, ${esc(ROLE_BY_ID[info.m].de)} zu sein</b>. Tust du es nicht, kann der Spielleiter dich hinrichten lassen.</p>
            <p class="small">${esc(ROLE_BY_ID[info.m].de)}: ${esc(ROLE_BY_ID[info.m].a)}</p></div>` : ""}
          ${evil}
          <div class="box win"><h4>🏆 Dein Ziel</h4><p>${good
            ? "Du bist <b>gut</b>. Finde den Dämon und lass ihn hinrichten. Gut gewinnt, wenn der Dämon stirbt."
            : "Du bist <b>böse</b>. Lüge, täusche und schütze den Dämon. Böse gewinnt, wenn nur noch 2 Spieler leben."}</p></div>
          <p class="small">Edition: ${esc(EDITIONS[role.ed].name)}</p>
        </div>
      </div>`;
  }

  // ---------- Modal ----------
  const modal = $("#modal");
  function openModal(html, cls = "") {
    $("#modal-content").innerHTML = html;
    modal.className = "modal " + cls;
    document.body.classList.add("noscroll");
  }
  function closeModal() {
    modal.className = "modal hidden";
    $("#modal-content").innerHTML = "";
    document.body.classList.remove("noscroll");
  }
  $(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // =====================================================================
  //  ZUM STARTBILDSCHIRM HINZUFÜGEN
  // =====================================================================
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installEvent = e;
    $$(".install-btn").forEach(b => b.classList.remove("hidden"));
  });
  window.addEventListener("appinstalled", () => $$(".install").forEach(el => el.remove()));

  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function installPanel() {
    if (isStandalone()) return "";
    const how = isIOS()
      ? `In <b>Safari</b> unten auf <b>Teilen</b> <span class="kbd">⬆︎</span> tippen, dann <b>„Zum Home-Bildschirm“</b> wählen.`
      : `Im Browser-Menü <span class="kbd">⋮</span> auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> tippen.`;
    return `<section class="panel install">
      <div class="install-row"><img src="icon-192.png" alt="" class="install-icon">
        <div><b>Als App aufs Handy</b><p class="small">Ein Icon auf dem Startbildschirm – kein Link mehr eintippen, funktioniert auch offline.</p></div></div>
      <button class="btn primary install-btn ${installEvent ? "" : "hidden"}">📲 Jetzt installieren</button>
      <p class="install-how">${how}</p>
    </section>`;
  }
  function bindInstall() {
    $$(".install-btn").forEach(b => b.addEventListener("click", async () => {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice.catch(() => {});
      installEvent = null;
      b.classList.add("hidden");
    }));
  }

  // =====================================================================
  //  ROLLE WÄHLEN UND DEM SPIELLEITER ZEIGEN (Philosoph & Co.)
  // =====================================================================
  // Rollen, die nachts eine Rolle auswählen. Der Spieler wählt auf seinem Handy und hält es dem Spielleiter hin.
  const PICKERS = {
    philosopher: { title: "Deine Wahl als Philosoph", hint: "Wähle einmal im Spiel nachts eine gute Rolle, deren Fähigkeit du bekommst.", pool: "good", keep: true },
    courtier: { title: "Rolle betrunken machen", hint: "Einmal im Spiel: Wähle nachts eine Rolle, die 3 Tage und Nächte betrunken ist.", pool: "all" },
    gambler: { title: "Rolle raten", hint: "Zeige auf einen Spieler und wähle hier die Rolle, die du für seine hältst.", pool: "all" },
    cerenovus: { title: "Wahnsinns-Rolle wählen", hint: "Zeige auf einen Spieler und wähle die gute Rolle, die er morgen spielen muss.", pool: "good" },
    pithag: { title: "Neue Rolle wählen", hint: "Zeige auf einen Spieler und wähle die Rolle, die er werden soll.", pool: "all" },
    ojo: { title: "Rolle töten", hint: "Wähle die Rolle, deren Besitzer heute Nacht stirbt.", pool: "all" }
  };

  function pickerHtml(mine) {
    const cfg = PICKERS[mine.r];
    if (!cfg) return "";
    const ed = mine.sc ? "custom" : ROLE_BY_ID[mine.r].ed;
    const pool = ROLES.filter(r => inEd(r, ed, mine.sc) && r.t !== "traveller" && r.t !== "fabled" && r.id !== mine.r && (cfg.pool === "all" || r.t === "townsfolk" || r.t === "outsider"));
    const chosen = cfg.keep && mine.pick ? ROLE_BY_ID[mine.pick] : null;
    return `<section class="panel picker">
      <h3>🧠 ${esc(cfg.title)}</h3>
      <p class="small">${esc(cfg.hint)} Wenn der Spielleiter dich weckt: Rolle auswählen und ihm das Handy hinhalten.</p>
      ${chosen ? `<div class="box"><h4>Du hast gewählt: ${esc(chosen.de)}</h4><p>${esc(chosen.a)}</p></div>` : ""}
      <select id="pickrole">
        <option value="">– Rolle auswählen –</option>
        ${["townsfolk", "outsider", "minion", "demon"].map(t => {
          const list = pool.filter(r => r.t === t);
          return list.length ? `<optgroup label="${TEAMS[t].plural}">${list.map(r => `<option value="${r.id}" ${chosen && chosen.id === r.id ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</optgroup>` : "";
        }).join("")}
      </select>
      <button class="btn primary" id="showpick">📱 Dem Spielleiter zeigen</button>
      ${chosen ? `<button class="btn sm" id="clearpick">Wahl zurücksetzen</button>` : ""}
    </section>`;
  }

  function bindPicker(mine) {
    const cfg = PICKERS[mine.r];
    if (!cfg) return;
    const show = () => {
      const id = $("#pickrole").value;
      if (!id) { toast("Bitte zuerst eine Rolle auswählen."); return; }
      const r = ROLE_BY_ID[id];
      if (cfg.keep) { mine.pick = id; store.set("botc.myrole", mine); }
      if (mine.online) sendToHost({ type: "pick", role: mine.r, pick: id }).then(ok => {
        const el = $("#picksent");
        if (el) el.textContent = ok ? "✓ Automatisch an den Spielleiter gesendet" : "Konnte nicht gesendet werden – zeig dem Spielleiter das Handy.";
      });
      openModal(`<div class="nightshow pickshow">
          <p class="ns-label">${esc(ROLE_BY_ID[mine.r].de)}${mine.n ? " · " + esc(mine.n) : ""}</p>
          <h2>Ich wähle</h2>
          <div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>
          ${mine.online ? `<p id="picksent" class="small">Wird an den Spielleiter gesendet …</p>` : ""}
        </div>
        <div class="row center"><button class="btn big" id="pickdone">✓ Fertig – verdecken</button></div>`, "full night");
      $("#pickdone").addEventListener("click", () => { closeModal(); renderPlayer(); });
    };
    $("#showpick").addEventListener("click", show);
    $("#clearpick") && $("#clearpick").addEventListener("click", () => {
      delete mine.pick; store.set("botc.myrole", mine); renderPlayer();
    });
  }

  // =====================================================================
  //  MEINE ROLLE (Spieler)
  // =====================================================================
  // Abstimmen & Nominieren am Handy (wenn der Spielleiter es eingeschaltet hat)
  function phoneVoteHtml(mine) {
    const ps = pubState;
    if (!ps || !ps.pv || !mine || mine.s === undefined || !(ps.seats || [])[mine.s]) return "";
    const me = ps.seats[mine.s], S = ps.seats;
    if (ps.vote) {
      const up = (ps.vote.hands || []).includes(mine.s);
      const can = me.a || me.g;
      const zealot = mine.r === "zealot" && me.a && S.filter(x => x.a).length >= 5;
      return `<section class="panel pvote"><h2>🗳️ Abstimmung</h2>
        <p><b>${esc(S[ps.vote.by].n)}</b> nominiert <b>${esc(S[ps.vote.on].n)}</b>.</p>
        <p class="small">${(ps.vote.hands || []).length} Hand/Hände oben${me.a ? "" : me.g ? " · du bist tot: das ist deine eine Geisterstimme" : " · du hast keine Stimme mehr"}</p>
        ${zealot ? `<p class="warnmsg">📢 Zelot: Du musst für jede Nominierung stimmen.</p>` : ""}
        ${can ? `<div class="row center wrap"><button class="btn big ${up ? "primary" : ""}" data-pv="1">✋ Hand heben${up ? " ✔" : ""}</button>${zealot ? "" : `<button class="btn big ${up ? "" : "primary"}" data-pv="0">✊ Hand unten${up ? "" : " ✔"}</button>`}</div>` : ""}
      </section>`;
    }
    if ((!me.a && !me.bs) || (ps.nomd || []).filter(k => k === mine.s).length >= (me.bs ? 2 : 1)) return `<section class="panel pvote muted"><p class="small center">🗳️ ${me.a || me.bs ? "Du hast heute schon nominiert." : "Tote dürfen nicht nominieren."}</p></section>`;
    return `<section class="panel pvote"><h2>🗳️ Nominieren</h2>
      <div class="row wrap"><select id="pvon">${S.map((x, k) => k === mine.s ? "" : `<option value="${k}">${esc(x.n)}${x.a ? "" : " 💀"}</option>`).join("")}</select>
      <button class="btn primary" id="pvnom">Nominieren</button></div>
      <p class="small">Sag es laut und tippe dann hier – der Spielleiter bestätigt die Nominierung.</p></section>`;
  }
  function bindPhoneVote(mine) {
    $$("[data-pv]").forEach(b => b.addEventListener("click", async () => {
      const up = b.dataset.pv === "1";
      const ok = await sendToHost({ type: "vote", on: pubState.vote.on, up });
      toast(ok ? (up ? "✋ Hand ist oben" : "✊ Hand ist unten") : "Keine Verbindung – heb die Hand am Tisch.");
    }));
    $("#pvnom") && $("#pvnom").addEventListener("click", async () => {
      const on = +$("#pvon").value;
      const ok = await sendToHost({ type: "nominate", on });
      toast(ok ? "📨 Nominierung gesendet – der Spielleiter bestätigt" : "Keine Verbindung – sag es am Tisch.");
    });
  }
  function updateVoteBox() {
    const box = $("#pvbox");
    if (!box) return;
    const mine = store.get("botc.myrole", null);
    box.innerHTML = phoneVoteHtml(mine);
    bindPhoneVote(mine);
  }

  function renderPlayer() {
    const mine = store.get("botc.myrole", null);
    if (mine && mine.hbd) registerHomebrew(mine.hbd);
    if (pubState && pubState.hb) registerHomebrew(pubState.hb);
    const on = store.get("botc.online", null);
    // Beitritts-Link gescannt oder „Online-Spiel beitreten“ gewählt: Formular zeigen, auch wenn noch eine alte Rolle gespeichert ist.
    if (!on && Net.configured() && (pendingJoin || showJoin)) {
      view.innerHTML = joinPanel() + `
        ${mine ? `<p class="small center">Deine bisher gespeicherte Rolle wird beim Beitreten ersetzt.</p>` : ""}
        <div class="row center"><button class="btn" id="canceljoin">Abbrechen</button></div>`;
      bindJoin();
      $("#canceljoin").addEventListener("click", () => { pendingJoin = ""; store.del("botc.pendingJoin"); showJoin = false; renderPlayer(); });
      return;
    }
    if (!mine && on) {
      view.innerHTML = netbarHtml() + `
        <section class="panel center">
          <div class="cover-icon">⏳</div>
          <h2>Du bist im Spiel!</h2>
          <p>Raum <b>${esc(on.code)}</b> als <b>${esc(on.name)}</b>.</p>
          <p class="small">Warte, bis der Spielleiter die Rollen verteilt – deine Rolle erscheint dann automatisch hier.</p>
          <button class="btn danger" id="leaveroom">Raum verlassen</button>
        </section>` + notesHtml();
      $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
      bindNotes();
      return;
    }
    if (!mine) {
      view.innerHTML = installPanel() + joinPanel() + `
        <section class="panel">
          <h2>Deine Rolle</h2>
          <p>Scanne den <b>QR-Code</b> beim Spielleiter, öffne den Link, den er dir geschickt hat, oder gib hier deinen <b>Code</b> ein.</p>
          <form id="codeform" class="codeform" autocomplete="off">
            <input id="codein" maxlength="7" placeholder="z. B. K7QX2" autocapitalize="characters" spellcheck="false" inputmode="text">
            <button class="btn primary" type="submit">Rolle anzeigen</button>
          </form>
          <p id="codeerr" class="error hidden">Dieser Code ist ungültig. Bitte prüfe die Eingabe.</p>
        </section>
        <section class="panel muted">
          <h3>Du bist der Spielleiter?</h3>
          <p>Wechsle unten zu <a href="#/sl">Spielleiter</a>, um ein Spiel aufzusetzen und die Rollen zu verteilen.</p>
        </section>`;
      $("#codeform").addEventListener("submit", e => {
        e.preventDefault();
        const info = readCode($("#codein").value);
        if (!info) { $("#codeerr").classList.remove("hidden"); return; }
        store.set("botc.myrole", info);
        renderPlayer();
      });
      bindInstall();
      bindJoin();
      return;
    }
    view.innerHTML = netbarHtml() + `
      <section class="reveal-wrap">
        <div id="cover" class="cover" role="button" tabindex="0">
          <img class="cover-img" src="icon-192.png" alt="">
          <div class="cover-title">${mine.n ? esc(mine.n) + ", deine" : "Deine"} Rolle ist verdeckt</div>
          <div class="cover-sub">Achte darauf, dass niemand mitschaut.<br>Dann tippe hier, um sie anzuzeigen.</div>
        </div>
        <div id="card" class="hidden">${cardHtml(mine)}
          ${pickerHtml(mine)}
          <div class="row center"><button id="hide" class="btn">🙈 Wieder verdecken</button></div>
        </div>
      </section>
      <div id="pvbox">${phoneVoteHtml(mine)}</div>
      ${notesHtml()}
      ${(() => { const si = scriptInfo(); return si ? nightOrderHtml(si.ids, si.name) : ""; })()}
      <section class="panel muted">
        <div class="row center wrap">
          <a class="btn" href="#/rollen" onclick="this.dataset.go=1">${mine.sc ? "📜 Rollen in eurem Spiel" : "📖 Alle Rollen ansehen"}</a>
          ${on ? `<button id="leaveroom" class="btn danger">Raum verlassen</button>` : `${Net.configured() ? `<button id="openjoin" class="btn">🌐 Online-Spiel beitreten</button>` : ""}<button id="forget" class="btn danger">Andere Rolle laden</button>`}
        </div>
      </section>`;
    const show = () => { $("#cover").classList.add("hidden"); $("#card").classList.remove("hidden"); };
    $("#cover").addEventListener("click", show);
    $("#cover").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") show(); });
    bindPicker(mine);
    bindNotes();
    bindPhoneVote(mine);
    if (modal.classList.contains("hidden")) nightOverlay();
    $("#hide").addEventListener("click", () => { $("#card").classList.add("hidden"); $("#cover").classList.remove("hidden"); window.scrollTo(0, 0); });
    $("#forget") && $("#forget").addEventListener("click", () => {
      if (confirm("Deine gespeicherte Rolle wirklich entfernen?")) { store.del("botc.myrole"); renderPlayer(); }
    });
    $("#leaveroom") && $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
    $("#openjoin") && $("#openjoin").addEventListener("click", () => { showJoin = true; renderPlayer(); window.scrollTo(0, 0); });
  }

  // =====================================================================
  //  SPIELLEITER
  // =====================================================================
  function newGame() {
    return { step: "setup", edition: "tb", count: 7, names: [], selected: [], seats: [], bluffs: [],
      drunkShown: null, lunaticShown: null, evilInfo: false, assignedKey: "", nightNo: 1, done: {} };
  }
  let game = store.get("botc.game", null) || newGame();
  if (!game.nightNo) { game.nightNo = 1; game.done = {}; delete game.night; } // ältere Spielstände
  // Rückgängig: frühere Spielstände (nur im Speicher, schnell hintereinander gespeicherte Änderungen zählen als ein Schritt)
  const undoStack = [];
  let lastSavedJson = JSON.stringify(game), lastUndoPush = 0;
  const save = () => {
    const cur = JSON.stringify(game);
    if (cur !== lastSavedJson) {
      // alle Speicherungen einer einzelnen Aktion (gleicher Klick) zählen als ein Schritt
      if (!lastUndoPush) { undoStack.push(lastSavedJson); if (undoStack.length > 30) undoStack.shift(); lastUndoPush = 1; setTimeout(() => { lastUndoPush = 0; }, 0); }
      lastSavedJson = cur;
    }
    store.set("botc.game", game); if (game.online) scheduleSync();
  };
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    game = JSON.parse(prev);
    lastSavedJson = prev; lastUndoPush = 0;
    store.set("botc.game", game);
    if (game.online) scheduleSync();
    closeModal(); renderSL();
    toast(`↩️ Rückgängig gemacht${undoStack.length ? ` (noch ${undoStack.length} Schritte möglich)` : ""}`);
  }

  const playerSeats = () => game.seats.filter(s => !s.trav);
  // Gesinnung: Reisende und umgedrehte Spieler (z. B. Schlangenbeschwörer) haben s.align, sonst gilt der Rollentyp.
  const seatGood = s => s.align ? s.align !== "e" : TEAMS[ROLE_BY_ID[s.role].t].good;

  // Prüft die automatisch erkennbaren Siegbedingungen. Gibt null zurück, solange das Spiel läuft.
  function detectEnd() {
    const ps = playerSeats();
    if (!ps.length) return null;
    if (game.saintLoss) return { winner: "evil", reason: `${game.saintLossRole && game.saintLossRole !== "Heiliger" ? `${game.saintLossRole}` : "Der Heilige"} ${game.saintLoss} wurde hingerichtet.`, warn: [] };
    if (game.klutzLoss) return { winner: "evil", reason: `Der Tollpatsch ${game.klutzLoss.by} hat ${game.klutzLoss.pick} gewählt – einen bösen Spieler.`, warn: [] };
    const alive = ps.filter(s => s.alive);
    const demons = ps.filter(s => ROLE_BY_ID[s.role].t === "demon");
    const aliveDemons = demons.filter(s => s.alive || s.zfake);
    if (game.mmResult) return { winner: game.mmResult, reason: game.mmResult === "good" ? "Drahtzieher-Tag: Gut hat ihn überstanden." : "Drahtzieher-Tag: Ein Guter wurde hingerichtet – Böse gewinnt.", warn: [] };
    const lev = ps.find(s => s.role === "leviathan" && (s.alive || s.zfake));
    if (lev) {
      const goodExec = Object.values(game.days || {}).filter(d => d.exec && d.exec !== "none" && game.seats[d.exec.seat] && !d.exec.survived && seatGood(game.seats[d.exec.seat])).length;
      if (goodExec > 1) return { winner: "evil", reason: "Leviathan: Mehr als ein guter Spieler wurde hingerichtet.", warn: [] };
      if (game.nightNo >= 6) return { winner: "evil", reason: "Leviathan: Tag 5 ist vorbei.", warn: [] };
    }
    if (demons.length && !aliveDemons.length) {
      const warn = [];
      if (game.mastermind && !game.mmResult) return null;
      if (demons.some(s => s.role === "imp") && ps.some(s => s.alive && ROLE_BY_ID[s.role].t === "minion"))
        warn.push("Hat sich der Imp selbst getötet, wird ein Scherge zum Imp – dann dessen Rolle ändern (🔁).");
      return { winner: "good", reason: "Der Dämon ist tot.", warn };
    }
    if (aliveDemons.length && alive.length <= 2)
      return { winner: "evil", reason: "Nur noch 2 Spieler leben – der Dämon hat überlebt.", warn: [] };
    if (aliveDemons.length && alive.length && alive.every(s => !seatGood(s)))
      return { winner: "evil", reason: "Es leben nur noch böse Spieler – Gut kann niemanden mehr nominieren und nicht mehr gewinnen.",
        warn: ["Streng nach Regeln endet das Spiel erst, wenn nur noch 2 leben. Wollt ihr es ausspielen, tippe „Spiel geht weiter“."] };
    // Bürgermeister: 3 Lebende und heute keine Hinrichtung -> Gut gewinnt (nur wenn er gesund ist)
    const d = (game.days || {})[game.nightNo];
    const mayor = mayorWinCheck();
    if (game.phase === "day" && d && d.exec === "none" && mayor && mayor.ok)
      return { winner: "good", reason: "Nur noch 3 Spieler leben und es gab keine Hinrichtung – der Bürgermeister gewinnt für Gut.",
        warn: ["Prüfe noch Sonderfälle: Vortox im Spiel? Dann hätte Böse gewonnen."] };
    return null;
  }
  // Ist ein Bürgermeister-Sieg gerade möglich? null = kein Thema
  function mayorWinCheck() {
    const alive = game.seats.filter(s => s.alive);
    if (alive.length !== 3) return null;
    const m = game.seats.find(s => s.role === "mayor");
    if (!m) return null;
    if (!m.alive) return { ok: false, why: "Der Bürgermeister ist tot – kein Bürgermeister-Sieg, das Spiel geht weiter." };
    const mk = m.marks || [];
    if (mk.includes("poison") || mk.includes("drunk")) return { ok: false, why: "Der Bürgermeister ist vergiftet/betrunken – keine Fähigkeit, das Spiel geht weiter." };
    return { ok: true };
  }
  const aliveKey = () => game.seats.map(s => (s.alive ? 1 : 0) + s.role).join(",");
  function names() {
    const out = [];
    for (let i = 0; i < game.count; i++) out.push((game.names[i] || "").trim() || `Spieler ${i + 1}`);
    return out;
  }

  // Erlaubte Außenseiter-Anzahlen für die aktuell gewählten bösen Rollen.
  function expected() {
    const base = SETUP_COUNTS[game.count];
    let outs = [base[1]];
    game.selected.forEach(id => {
      const m = OUTSIDER_MODS[id];
      if (m) outs = [...new Set(outs.flatMap(o => m.map(d => o + d)))];
    });
    outs = outs.map(o => Math.max(0, o)).sort((a, b) => a - b);
    return { townsfolk: outs.map(o => game.count - base[2] - base[3] - o), outsider: outs, minion: base[2], demon: base[3] };
  }
  function counts() {
    const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
    game.selected.forEach(id => c[ROLE_BY_ID[id].t]++);
    return c;
  }

  function autoPick() {
    const ed = game.edition, base = SETUP_COUNTS[game.count];
    // In kleinen Runden ungeeignete Rollen weglassen
    const rolesOf = (e, t) => ROLES.filter(r => inEd(r, e) && r.t === t && !smallExcluded(r.id, game.count));
    const demon = pick(rolesOf(ed, "demon"), 1);
    const minions = pick(rolesOf(ed, "minion"), base[2]);
    let outs = base[1];
    [...demon, ...minions].forEach(r => { const m = OUTSIDER_MODS[r.id]; if (m) outs += m[randInt(m.length)]; });
    const outsiderPool = rolesOf(ed, "outsider");
    outs = Math.max(0, Math.min(outs, outsiderPool.length));
    const tf = game.count - outs - base[2] - base[3];
    let sel = [...demon, ...minions, ...pick(outsiderPool, outs), ...pick(rolesOf(ed, "townsfolk"), tf)];
    // Benötigte Partner-Rollen (z. B. Jäger → Jungfer) einwechseln
    Object.entries(REQUIRES).forEach(([a, bId]) => {
      if (!sel.some(r => r.id === a) || sel.some(r => r.id === bId)) return;
      const need = ROLE_BY_ID[bId];
      const k = sel.findIndex(r => r.t === need.t && r.id !== a);
      if (k >= 0) sel[k] = need; else sel = sel.filter(r => r.id !== a);
    });
    game.selected = sel.map(r => r.id);
    refreshHidden();
  }

  // Säufer / Wahnsinniger: welche Rolle sie angezeigt bekommen. Außerdem Bluffs.
  function refreshHidden() {
    const ed = game.edition;
    const inPlay = new Set(game.selected);
    if (inPlay.has("marionette")) {
      const free = rolesOf(ed, "townsfolk").filter(r => !inPlay.has(r.id) && r.id !== game.drunkShown).map(r => r.id);
      if (!game.marionetteShown || inPlay.has(game.marionetteShown) || !free.includes(game.marionetteShown)) game.marionetteShown = pick(free, 1)[0] || null;
    } else game.marionetteShown = null;
    if (inPlay.has("drunk")) {
      const free = rolesOf(ed, "townsfolk").filter(r => !inPlay.has(r.id)).map(r => r.id);
      if (!game.drunkShown || inPlay.has(game.drunkShown) || !free.includes(game.drunkShown)) game.drunkShown = pick(free, 1)[0] || null;
    } else game.drunkShown = null;
    if (inPlay.has("lunatic")) {
      const demons = rolesOf(ed, "demon").map(r => r.id);
      if (!game.lunaticShown || !demons.includes(game.lunaticShown)) game.lunaticShown = game.selected.find(id => ROLE_BY_ID[id].t === "demon") || demons[0];
    } else game.lunaticShown = null;
    // Säufer und Wahnsinniger sind keine sinnvollen Bluffs: Niemand kann behaupten, sie zu sein.
    const blocked = id => inPlay.has(id) || id === game.drunkShown || id === game.marionetteShown || id === "drunk" || id === "lunatic";
    if (game.bluffs.length !== 3 || game.bluffs.some(blocked)) {
      const pool = ROLES.filter(r => inEd(r, ed) && (r.t === "townsfolk" || r.t === "outsider") && !blocked(r.id)).map(r => r.id);
      game.bluffs = pick(pool, 3);
    }
  }

  function shownRole(roleId) {
    if (roleId === "drunk" && game.drunkShown) return game.drunkShown;
    if (roleId === "marionette" && game.marionetteShown) return game.marionetteShown;
    if (roleId === "lunatic" && game.lunaticShown) return game.lunaticShown;
    return roleId;
  }

  function assignSeats() {
    const roles = shuffle(game.selected);
    const nm = names();
    const travellers = game.seats.filter(s => s.trav);
    const pids = game.pids || [];
    game.seats = roles.map((r, i) => ({ name: nm[i], pid: pids[i] || null, role: r, alive: true, ghost: true, note: "", salt: randInt(32) }));
    game.seats.push(...travellers);
    game.assignedKey = game.selected.slice().sort().join(",") + "|" + game.count;
    game.done = {};
    game.nightNo = 1;
    game.days = {};
    game.vote = null;
    game.winner = null; game.klutzLoss = null; game.klutzPending = null; game.saintLoss = null; game.juggle = null; game.fgJumped = false; game.princessBlock = null; game.princessUsed = false; game.mastermind = null; game.mmResult = null; game.nomReq = null; game.exile = null;
    game.ignoreEnd = null;
    game.evilSent = {};
    game.phase = "night";
    game.history = [{ n: 1, ph: "night", t: `🎬 Spiel beginnt – ${EDITIONS[game.edition].name}, ${playerSeats().length} Spieler` }];
    game.statsId = null;
  }

  const poppyBlocks = () => game.seats.some(y => y.role === "poppygrower" && y.alive && !impaired(y));
  function evilInfoFor(seat) {
    // Böse-Infos stehen auf der Karte, wenn der Schalter an ist oder der Spielleiter sie in der Nacht gesendet hat.
    const sent = game.evilSent || {};
    // Böse Reisende erfahren, wer der Dämon ist (sofort beim Beitreten)
    if (seat.trav) {
      if (seat.align !== "e") return undefined;
      const ds = playerSeats().filter(s => ROLE_BY_ID[s.role].t === "demon" && (s.alive || s.zfake));
      return ds.length ? { d: ds.map(s => s.name).join(", "), tr: true } : undefined;
    }
    if (poppyBlocks()) return undefined;
    const tt = ROLE_BY_ID[seat.role].t;
    const allowed = (game.evilInfo && playerSeats().length >= 7) || (tt === "minion" ? sent.minion : sent.demon);
    if (!allowed) return undefined;
    const ps = playerSeats();
    const t = ROLE_BY_ID[seat.role].t;
    const demon = ps.find(s => ROLE_BY_ID[s.role].t === "demon");
    const minions = ps.filter(s => ROLE_BY_ID[s.role].t === "minion" && s.role !== "marionette");
    const lunatic = ps.find(s => s.role === "lunatic");
    const mario = ps.find(s => s.role === "marionette");
    if (seat.role === "marionette") return undefined;
    if (t === "minion") return { d: demon && demon.name, m: minions.filter(s => s !== seat).map(s => s.name) };
    if (t === "demon") return { m: minions.map(s => s.name), b: game.bluffs, l: lunatic && lunatic.name, mo: mario && mario.name };
    if (seat.role === "lunatic") {
      // Der Wahnsinnige bekommt plausible, aber falsche Schergen.
      const fake = pick(ps.filter(s => s !== seat), minions.length).map(s => s.name);
      if (!seat.fake || seat.fake.length !== fake.length) { seat.fake = fake; save(); }
      return { m: seat.fake, b: game.bluffs };
    }
    return undefined;
  }

  function seatInfo(seat, i) {
    const shown = seat.swPending ? "scarletwoman" : shownRole(seat.role);
    const info = { r: shown, n: seat.name, s: i };
    if (seat.trav || seat.align) info.a = seat.align;
    if (game.edition === "custom" && (game.script || []).length) info.sc = game.script.map(id => ROLE_BY_ID[id].hb ? id : ROLE_BY_ID[id].idx);
    if (ROLE_BY_ID[shown] && ROLE_BY_ID[shown].hb) info.hbd = [hbDef(shown)].filter(Boolean);
    const x = evilInfoFor(seat);
    if (x) info.x = x;
    if (seat.madness && seat.madness.night === game.nightNo && seat.alive) info.m = seat.madness.role;
    if ((seat.infos || []).length) info.i = seat.infos.slice(-10);
    if (seat.grim && ["spy", "widow"].includes(seat.role)) info.g = seat.grim;
    const ask = (game.asks || {})[i];
    if (nightOn() && ask && ask.night === game.nightNo && !ask.done) info.q = { id: ask.id, step: ask.step, sleep: !!ask.sleep, amn: seat.role === "amnesiac" && !(seat.amn && seat.amn.known) };
    const wk = (game.wakes || {})[i];
    if (tableOn() && wk && wk.night === game.nightNo && !wk.done) info.wk = { id: wk.id, step: seat.role === "amnesiac" ? "amnesiac" : wk.step, r: wk.r, t: wk.t };
    if (seat.role === "amnesiac" && seat.amn && seat.amn.known) info.amk = seat.amn.text;
    return info;
  }
  function seatCode(seat, i) {
    const align = seat.trav ? (seat.align === "e" ? 2 : 1) : 0;
    const idx = ROLE_BY_ID[seat.swPending ? "scarletwoman" : shownRole(seat.role)].idx;
    // Der 5-stellige Code hat nur Platz für die ersten 128 Rollen – neuere Rollen nur per QR/Link
    if (idx >= 128) return "nur QR/Link";
    return makeCode(idx, align, i, seat.salt);
  }
  const seatLink = (seat, i) => baseUrl() + "#k=" + encodeLink(seatInfo(seat, i));

  // ----- Darstellung -----
  const STEPS = [["setup", "1 · Spiel"], ["roles", "2 · Rollen"], ["assign", "3 · Verteilen"], ["grim", "4 · Grimoire"]];

  function renderSL() {
    const stepper = `<div class="stepper">${STEPS.map(([k, l]) =>
      `<button class="step ${game.step === k ? "active" : ""}" data-step="${k}">${l}</button>`).join("")}</div>`;
    let body = "";
    if (game.step === "setup") body = slSetup();
    else if (game.step === "roles") body = slRoles();
    else if (game.step === "assign") body = slAssign();
    else body = slGrim();
    view.innerHTML = stepper + body;
    $$(".step").forEach(b => b.addEventListener("click", () => goStep(b.dataset.step)));
    bindSL();
    if (typeof applyPhase === "function") applyPhase();
    if (game.step !== "grim" || !klutzPopup()) endPopup();
  }

  // Spielende sofort als Fenster melden (das Banner oben sieht man beim Scrollen leicht nicht)
  function endPopup() {
    if (game.step !== "grim" || game.winner || !modal.classList.contains("hidden")) return;
    const end = detectEnd(), key = aliveKey();
    if (!end || game.ignoreEnd === key || game.endPopped === key) return;
    game.endPopped = key; save();
    openModal(`<div class="center"><div style="font-size:3rem">${end.winner === "good" ? "😇" : "😈"}</div>
      <h2>🏁 ${end.winner === "good" ? "Gut gewinnt!" : "Böse gewinnt!"}</h2>
      <p>${esc(end.reason)}</p>
      ${end.warn.map(w => `<p class="warnmsg">⚠️ ${esc(w)}</p>`).join("")}
      <div class="row center wrap"><button class="btn primary" id="popwin">🏆 Sieg verkünden</button><button class="btn" id="popgo">Spiel geht weiter</button></div></div>`);
    $("#popwin").addEventListener("click", () => { closeModal(); const b = $(".endbanner [data-win]"); if (b) b.click(); });
    $("#popgo").addEventListener("click", () => { closeModal(); const b = $("#ignoreend"); if (b) b.click(); });
  }

  function goStep(step) {
    if ((step === "assign" || step === "grim") && game.selected.length !== game.count) {
      if (!game.selected.length) autoPick();
      else { toast(`Bitte genau ${game.count} Rollen wählen.`); step = "roles"; }
    }
    if ((step === "assign" || step === "grim") && game.selected.length === game.count) {
      const key = game.selected.slice().sort().join(",") + "|" + game.count;
      if (game.assignedKey !== key) { refreshHidden(); assignSeats(); }
    }
    game.step = step;
    save();
    renderSL();
    window.scrollTo(0, 0);
  }

  function slSetup() {
    const nm = [];
    for (let i = 0; i < game.count; i++) nm.push(`<input class="name" data-i="${i}" placeholder="Spieler ${i + 1}" value="${esc(game.names[i] || "")}">`);
    return `
      <section class="panel">
        <h2>Neues Spiel</h2>
        <h3>Edition</h3>
        <div class="chips">${PLAYABLE.map(k =>
          `<button class="chip ${game.edition === k ? "on" : ""}" data-ed="${k}">${EDITIONS[k].name}</button>`).join("")}</div>
        <p class="small">${esc(EDITIONS[game.edition].desc)}</p>
        ${game.edition === "custom" ? scriptSummary() : ""}
        <h3>Anzahl Spieler (ohne Spielleiter)</h3>
        <div class="counter">
          <button class="btn round" id="minus">−</button>
          <span class="count">${game.count}</span>
          <button class="btn round" id="plus">+</button>
        </div>
        <p class="small center">${setupLine(game.count)}</p>
        ${smallGameHint(game.count)}
        <h3>Namen in Sitzreihenfolge (im Uhrzeigersinn)</h3>
        <div class="names">${nm.join("")}</div>
        <div class="row wrap">
          <button class="btn" id="appqr2">📲 App-QR für Mitspieler</button>
        </div>
        <div class="row end"><button class="btn primary" id="next1">Weiter: Rollen wählen →</button></div>
      </section>
      ${game.test ? "" : onlineHostPanel()}
      ${testPanel()}
      ${statsHtml()}
      <section class="panel muted">
        <div class="row wrap">
          <button class="btn danger" id="reset">🗑️ Komplett neues Spiel</button>
        </div>
      </section>`;
  }
  function smallGameHint(n) {
    if (n === 4) return `<div class="box smallhint"><h4>⚠️ 4 Spieler – inoffizielle Notvariante</h4>
      <p>Offiziell braucht das Spiel mindestens 5 Spieler. Mit 4 gibt es <b>keinen Schergen</b>: 3 Dorfbewohner gegen 1 Dämon.</p>
      <ul>
        <li>Das Spiel ist sehr kurz: Gut hat meist nur <b>1–2 Hinrichtungen</b>, um den Dämon zu finden.</li>
        <li>Die Zufallswahl lässt Rollen weg, die ohne Schergen nichts tun (z. B. Ermittler, Koch) oder sofort entscheiden (z. B. Shabaloth, Vortox).</li>
        <li>Tipp: <b>Trouble Brewing</b> spielen und am ersten Tag ruhig niemanden hinrichten, wenn die Infos unklar sind.</li>
        <li>Als Spielleiter darfst du Gut ruhig etwas mehr helfen (klare Infos), damit es spannend bleibt.</li>
      </ul></div>`;
    if (n <= 6) return `<div class="box smallhint"><h4>💡 Kleine Runde</h4>
      <ul>
        <li>Bei 5–6 Spielern lernen sich die Bösen nicht kennen, und der Dämon bekommt keine Bluffs.</li>
        <li>Das Spiel dauert nur 2–3 Tage – jede Hinrichtung zählt.</li>
        <li>Die Zufallswahl lässt Baron, Heiliger, Pate und Fang Gu weg, weil sie kleine Runden kaputt machen.</li>
      </ul></div>`;
    return "";
  }
  const setupLine = n => { const c = SETUP_COUNTS[n]; return `${c[0]} Dorfbewohner · ${c[1]} Außenseiter · ${c[2]} Schergen · ${c[3]} Dämon`; };

  function slRoles() {
    const exp = expected(), c = counts();
    const fmt = arr => Array.isArray(arr) ? arr.join(" oder ") : arr;
    const ok = (team) => Array.isArray(exp[team]) ? exp[team].includes(c[team]) : exp[team] === c[team];
    const teamBlock = team => {
      const rs = rolesOf(game.edition, team);
      return `<h3 class="team-h t-${team}-text">${TEAMS[team].plural} <span class="cnt ${ok(team) ? "ok" : "bad"}">${c[team]} / ${fmt(exp[team])}</span></h3>
        <div class="tiles">${rs.map(r => `<button class="tile t-${team} ${game.selected.includes(r.id) ? "on" : ""}" data-role="${r.id}">
          <b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small>${r.setup ? `<em>${esc(r.setup)}</em>` : ""}${smallExcluded(r.id, game.count) ? `<em>⚠️ ungeeignet bei ${game.count} Spielern</em>` : ""}</button>`).join("")}</div>`;
    };
    const total = game.selected.length;
    let extra = "";
    if (game.selected.includes("drunk")) {
      const free = rolesOf(game.edition, "townsfolk").filter(r => !game.selected.includes(r.id));
      extra += `<label class="field">Der <b>Säufer</b> glaubt, er sei:
        <select id="drunkShown">${free.map(r => `<option value="${r.id}" ${r.id === game.drunkShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>`;
    }
    if (game.selected.includes("marionette")) {
      const free = rolesOf(game.edition, "townsfolk").filter(r => !game.selected.includes(r.id));
      extra += `<label class="field">Die <b>Marionette</b> glaubt, sie sei:
        <select id="marionetteShown">${free.map(r => `<option value="${r.id}" ${r.id === game.marionetteShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>
        <p class="small">⚠️ Setze die Marionette beim Verteilen neben den Dämon.</p>`;
    }
    if (game.selected.includes("lunatic")) {
      extra += `<label class="field">Der <b>Wahnsinnige</b> glaubt, er sei:
        <select id="lunaticShown">${rolesOf(game.edition, "demon").map(r => `<option value="${r.id}" ${r.id === game.lunaticShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>`;
    }
    const warn = total !== game.count ? `<p class="error">Du hast ${total} von ${game.count} Rollen gewählt.</p>`
      : (["townsfolk", "outsider", "minion", "demon"].every(ok) ? `<p class="okmsg">✓ Die Verteilung passt.</p>` : `<p class="warnmsg">Die Anzahl stimmt, weicht aber von der Standard-Verteilung ab. Das ist erlaubt, wenn du es so willst.</p>`);
    return `
      <section class="panel">
        <h2>Rollen für ${game.count} Spieler</h2>
        <p class="small">${esc(EDITIONS[game.edition].name)} · Tippe Rollen an, um sie hinzuzufügen oder zu entfernen.</p>
        ${requireWarnings()}
        ${setupMeterHtml()}
        ${balanceHints()}
        ${game.edition === "custom" ? "" : jinxHtml(ROLES.filter(r => inEd(r, game.edition)).map(r => r.id))}
        <div class="row wrap"><button class="btn primary" id="auto">🎲 Zufällig auswählen</button><button class="btn" id="autobal">⚖️ Ausgewogen vorschlagen</button><button class="btn" id="clear">Auswahl leeren</button></div>
        ${warn}
        ${extra}
        ${["townsfolk", "outsider", "minion", "demon"].map(teamBlock).join("")}
        <details class="fabledpick" ${(game.fabled || []).length ? "open" : ""}><summary><h3 class="team-h t-fabled-text">Fabelwesen <span class="small">(optional – Sonderregeln, alle wissen davon)</span></h3></summary>
          <div class="tiles">${ROLES.filter(r => r.t === "fabled").map(r => `<button class="tile t-fabled ${(game.fabled || []).includes(r.id) ? "on" : ""}" data-fabled="${r.id}"><b>${r.ic} ${esc(r.de)}${r.ed === "loric" ? " <small>(Loric)</small>" : ""}</b><small>${esc(r.a)}</small></button>`).join("")}</div>
        </details>
        <div class="row end"><button class="btn primary" id="next2" ${total === game.count ? "" : "disabled"}>Weiter: Verteilen →</button></div>
      </section>`;
  }

  function roleChip(id, extra = "") {
    const r = ROLE_BY_ID[id];
    return `<span class="rchip t-${r.t}">${r.ic} ${esc(r.de)}${extra}</span>`;
  }

  // Formular „Reisenden hinzufügen“ (in Schritt 3 und im Grimoire während des Spiels)
  function travFormHtml() {
    const travOpts = ROLES.filter(r => r.t === "traveller" && (game.edition !== "custom" || !(game.script || []).some(id => ROLE_BY_ID[id].t === "traveller") || game.script.includes(r.id)))
      .filter(r => !game.seats.some(x => x.role === r.id))
      .map(r => `<option value="${r.id}">${esc(r.de)} (${esc(EDITIONS[r.ed].name)})</option>`).join("");
    const free = Object.entries(lobby).filter(([uid]) => !game.seats.some(x => x.pid === uid));
    return `<div class="travform">
      ${game.online ? `<select id="travpid"><option value="">– kein Online-Handy –</option>${free.map(([uid, p]) => `<option value="${uid}" ${free.length === 1 ? "selected" : ""}>🌐 ${esc(p.name)}</option>`).join("")}</select>` : ""}
      <input id="travname" placeholder="Name${game.online ? " (leer = Name vom Handy)" : ""}">
      <select id="travrole">${travOpts}</select>
      <select id="travalign"><option value="g">Gut</option><option value="e">Böse</option></select>
      <button class="btn" id="addtrav">+ Hinzufügen</button>
    </div>`;
  }
  // Im laufenden Spiel: Reisender scannt den QR-Code des Raums, dann hier zuordnen
  function travLatePanel() {
    const free = game.online ? Object.entries(lobby).filter(([uid]) => !game.seats.some(x => x.pid === uid)) : [];
    return `<section class="panel"><details class="travlate" ${free.length || game.travOpen ? "open" : ""}>
      <summary><h2>🧳 Reisender kommt dazu</h2></summary>
      ${game.online ? `<p class="small">1. Der Neue scannt diesen QR-Code (oder öffnet die App → „Meine Rolle“ → „Online-Spiel beitreten“ mit Code <b>${esc(game.online.code)}</b>).<br>
        2. Sein Name erscheint unten im ersten Feld. Rolle und Gesinnung wählen → „+ Hinzufügen“. Er sieht seine Reisenden-Rolle sofort auf dem Handy.</p>
        <div class="qr small-qr">${qrSvg(joinUrl(game.online.code))}</div>
        ${free.length ? `<p class="okmsg">🌐 Neu im Raum: ${free.map(([, p]) => esc(p.name)).join(", ")}</p>` : `<p class="small">Noch niemand Neues im Raum …</p>`}`
        : `<p class="small">Ohne Online-Spiel: Name, Rolle und Gesinnung eintragen und ihm danach seine Karte über „3 · Verteilen“ (QR/Link) geben.</p>`}
      ${travFormHtml()}
      <p class="small">Die Reisenden-Rolle ist öffentlich – sag sie laut an. Die Gesinnung bleibt geheim.</p>
    </details></section>`;
  }

  function slAssign() {
    const ps = game.seats;
    const allowEvil = playerSeats().length >= 7;
    const rows = ps.map((s, i) => {
      const r = ROLE_BY_ID[s.role];
      const shown = shownRole(s.role);
      const sel = s.trav
        ? roleChip(s.role, s.align === "e" ? " (böse)" : " (gut)")
        : `<select class="seatrole" data-i="${i}">${game.selected.map(id => `<option value="${id}" ${id === s.role ? "selected" : ""}>${esc(roleName(id))}</option>`).join("")}</select>`;
      return `<div class="seat t-${r.t}-border">
        <div class="seat-top"><span class="seatno">${i + 1}</span><b class="seatname">${esc(s.name)}</b>${onlineBadge(s)}
          ${shown !== s.role ? `<span class="small">sieht: ${esc(roleName(shown))}</span>` : ""}</div>
        <div class="seat-mid">${sel}</div>
        ${pidSelect(i)}
        <div class="seat-bot"><code class="code">${seatCode(s, i)}</code>
          <button class="btn sm" data-qr="${i}">📱 QR / Link</button>
          ${s.trav ? `<button class="btn sm danger" data-deltrav="${i}">✕</button>` : ""}</div>
      </div>`;
    }).join("");
    return `
      <section class="panel">
        <h2>Rollen verteilen</h2>
        ${game.online ? `<p class="okmsg">🌐 Online-Spiel <b>${esc(game.online.code)}</b>: Rollen werden automatisch an alle verbundenen Handys gesendet. Für alle anderen gibt es weiterhin QR-Code und Code.</p>` : ""}
        <p>Jeder Spieler holt sich seine Rolle: <b>QR-Code scannen</b>, <b>Link</b> öffnen oder in der App unter „Meine Rolle“ den <b>Code</b> eingeben. Oder gib dein Handy reihum.</p>
        <div class="row wrap">
          <button class="btn primary" id="pass">🔄 Handy weitergeben</button>
          <button class="btn" id="reshuffle">🎲 Neu mischen</button>
        </div>
        ${location.protocol === "file:" ? `<p class="warnmsg">Die App läuft gerade als lokale Datei. QR-Codes und Links funktionieren auf anderen Handys nur, wenn die App im Internet liegt (z. B. GitHub Pages). Die Codes funktionieren trotzdem.</p>` : ""}
        <label class="switch ${allowEvil ? "" : "disabled"}"><input type="checkbox" id="evilinfo" ${game.evilInfo && allowEvil ? "checked" : ""} ${allowEvil ? "" : "disabled"}>
          <span>Böse-Infos auf die Karten schreiben (Schergen sehen den Dämon, der Dämon sieht Schergen &amp; Bluffs). ${allowEvil ? "Ersetzt das Aufwecken in der ersten Nacht. Funktioniert nur über QR/Link/Handy weitergeben, nicht über Codes." : "Erst ab 7 Spielern."}</span></label>
        <div class="seats">${rows}</div>
        <div class="box"><h4>Bluffs für den Dämon</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p>
          <button class="btn sm" id="rebluff">🎲 Andere Bluffs</button></div>
      </section>
      <section class="panel">
        <h3>Reisenden hinzufügen</h3>
        <p class="small">Reisende kommen später dazu oder gehen früher. Du legst fest, ob sie gut oder böse sind.</p>
        ${travFormHtml()}
      </section>
      <div class="row end"><button class="btn primary" id="next3">Weiter: Grimoire →</button></div>`;
  }

  function ensureAmnesiac() {
    game.seats.forEach(x => {
      if (x.role !== "amnesiac" || x.amn) return;
      const pool = AMNESIAC_IDEAS.filter(a => !a.like || !game.seats.some(y => y.role === a.like));
      setAmn(x, pool[randInt(pool.length)].k);
      hist(`❓ Geheime Fähigkeit von ${x.name} (Amnesiker, gewürfelt): ${x.amn.text}`);
      save();
    });
  }
  function slGrim() {
    ensureAmnesiac();
    const ps = game.seats;
    const seats = ps.map((s, i) => {
      const shown = shownRole(s.role);
      return `<div class="gseat ${s.alive ? "" : "dead"}">
        <div class="g-top">
          <span class="seatno">${i + 1}</span>
          <b>${esc(s.name)}</b>
          ${roleChip(s.role, s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : "")}
          ${shown !== s.role ? `<span class="small">(glaubt: ${esc(roleName(shown))})</span>` : ""}
          ${s.zfake ? `<span class="small">🧟 scheintot – lebt heimlich weiter</span>` : ""}
          ${marksHtml(s)}
        </div>
        <div class="g-ctl">
          <button class="btn sm" data-alive="${i}">${s.alive ? "❤️ lebt" : "💀 tot"}</button>
          ${s.alive ? "" : `<button class="btn sm" data-ghost="${i}">${s.ghost ? "👻 Stimme frei" : "🚫 Stimme verbraucht"}</button>`}
          <button class="btn sm" data-info="${s.role}">ℹ️</button>
          <button class="btn sm" data-change="${i}" title="Rolle oder Gesinnung ändern">🔁</button>
          <button class="btn sm" data-seatmodal="${i}" title="Marker setzen">🏷️</button>
          ${s.alive && game.seats.some(x => x.role === "cerenovus") ? `<button class="btn sm ${s.madness && s.madness.night === game.nightNo ? "used" : ""}" data-mad="${i}" title="Wahnsinn (Cerenovus)">😵${s.madness && s.madness.night === game.nightNo ? " " + esc(roleName(s.madness.role)) : ""}</button>` : ""}
          ${s.role === "philosopher" ? philoSelect(i) : ""}
          ${ONCE_PER_GAME.includes(s.role) && s.role !== "philosopher" ? `<button class="btn sm ${s.used ? "used" : ""}" data-used="${i}">${s.used ? "✔ Fähigkeit benutzt" : "○ Fähigkeit frei"}</button>` : ""}
        </div>
        <input class="note" data-note="${i}" placeholder="Notiz (z. B. vergiftet, geschützt, Ablenker …)" value="${esc(s.note)}">
      </div>`;
    }).join("");
    const alive = ps.filter(s => s.alive && !s.trav).length;
    const needed = votesNeeded();
    const first = game.nightNo === 1;
    const night = first ? NIGHT_FIRST : NIGHT_OTHER;
    const key = first ? "n1" : "n";
    const steps = [];
    night.forEach(id => {
      if (NIGHT_STEPS[id]) {
        if ((id === "minioninfo" || id === "demoninfo") && playerSeats().length < 7) return;
        if (!NIGHT_STEPS[id][key]) return;
        if ((id === "minioninfo" || id === "demoninfo") && poppyBlocks()) { steps.push({ id, name: NIGHT_STEPS[id].de, text: "", who: "", inactive: true, mark: "🌺", why: "🌺 Der Mohnbauer lebt – Schergen und Dämon erfahren nichts voneinander (auch keine Bluffs)." }); return; }
        const ev = evilTeam();
        let who = "";
        if (id === "minioninfo") who = `Dämon: ${esc(ev.demon ? ev.demon.name : "–")}`;
        if (id === "demoninfo") who = `Schergen: ${ev.minions.map(m => esc(m.name)).join(", ") || "–"} · Bluffs: ${game.bluffs.map(b => esc(roleName(b))).join(", ")}`;
        steps.push({ id, name: NIGHT_STEPS[id].de, text: NIGHT_STEPS[id][key], who, show: id === "minioninfo" || id === "demoninfo" });
        return;
      }
      const role = ROLE_BY_ID[id];
      if (!role || !role[key]) return;
      const holders = ps.filter(s => (s.role === id && !(id === "amnesiac" && s.amn && s.amn.like)) || (id === "scarletwoman" && s.swPending) || (s.role === "amnesiac" && s.amn && s.amn.like === id));
      const drunks = ps.filter(s => (s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id);
      const philos = ps.filter(s => s.role === "philosopher" && s.gained === id);
      if (!holders.length && !drunks.length && !philos.length) return;
      const who = [...holders.map(s => esc(s.name) + (s.role === "amnesiac" && id !== "amnesiac" ? " (Amnesiker ❓)" : "") + (s.alive ? "" : " †") + (philos.length ? " (betrunken durch Philosoph)" : "")),
        ...drunks.map(s => esc(s.name) + (s.alive ? "" : " †") + (s.role === "drunk" ? " (Säufer – Info darf falsch sein)" : " (Marionette – Info darf falsch sein)")),
        ...philos.map(s => esc(s.name) + (s.alive ? "" : " †") + " (Philosoph)")].join(", ");
      // Tote Spieler haben keine Fähigkeit mehr – außer Rollen, die gerade durch ihren Tod ausgelöst werden.
      const all = [...holders, ...drunks, ...philos];
      const notTriggered = ACTS_WHEN_DEAD.includes(id) && !all.some(s => deathTriggered(s, id));
      const allDead = !ACTS_WHEN_DEAD.includes(id) && all.every(s => !s.alive && !s.zfake);
      const allKilled = !allDead && !ACTS_WHEN_DEAD.includes(id) && all.every(s => (!s.alive && !s.zfake) || killedBefore(s, id));
      const allUsed = ONCE_PER_GAME.includes(id) && all.every(s => ((s.role === "philosopher" && id !== "philosopher" ? s.gainedUsed : s.used) && s.usedNight !== game.nightNo) || !s.alive);
      // Der Jongleur erfährt sein Ergebnis nur in der Nacht nach dem ersten Tag.
      const over = (id === "juggler" && game.nightNo > 2) || (ROLE_BY_ID[id] && ROLE_BY_ID[id].hbCond === "n2" && game.nightNo !== 2);
      const swIdle = id === "scarletwoman" && !holders.some(s => s.swPending);
      const inactive = allDead || allKilled || allUsed || over || notTriggered || swIdle;
      const why = allDead ? "Tot – keine Fähigkeit mehr, nicht wecken."
        : allKilled ? "🎯 Wurde heute Nacht schon vom Dämon getötet (der Dämon ist vorher dran) – nicht mehr wecken, keine Info."
        : over ? "Nur in der zweiten Nacht – entfällt."
        : swIdle ? "Der Dämon ist nicht gestorben (oder sie hat nicht übernommen) – nicht wecken."
        : notTriggered ? (["ravenkeeper", "sage"].includes(id) ? "Nur wenn er heute Nacht stirbt (z. B. durch den Dämon) – nicht wecken." : "Nur wenn er gerade gestorben ist – nicht wecken.")
        : "Fähigkeit schon benutzt – nicht mehr wecken.";
      steps.push({ id, name: `${role.ic} ${role.de}`, text: role[key], who, t: role.t, inactive, why, mark: allDead || allKilled ? "💀" : "✔", once: ONCE_PER_GAME.includes(id) });
    });
    const done = game.done[game.nightNo] || [];
    let banner = "";
    if (game.winner) {
      banner = `<section class="panel endbanner ${game.winner.team}">
        <h2>${game.winner.team === "good" ? "😇 Gut hat gewonnen" : "😈 Böse hat gewonnen"}</h2>
        <p>${esc(game.winner.reason)}</p>
        <div class="row wrap"><button class="btn primary" id="showend">🏆 Ergebnis anzeigen</button><button class="btn" id="undoend">Spiel fortsetzen</button></div>
      </section>`;
    } else {
      const end = detectEnd();
      if (end && game.ignoreEnd !== aliveKey()) {
        banner = `<section class="panel endbanner ${end.winner}">
          <h2>🏁 Spielende erkannt</h2>
          <p><b>${end.winner === "good" ? "Gut gewinnt" : "Böse gewinnt"}:</b> ${esc(end.reason)}</p>
          ${end.warn.map(w => `<p class="warnmsg">⚠️ ${esc(w)}</p>`).join("")}
          <div class="row wrap"><button class="btn primary" data-win="${end.winner}" data-reason="${esc(end.reason)}">Sieg verkünden</button><button class="btn" id="ignoreend">Spiel geht weiter</button></div>
        </section>`;
      }
    }
    const pro = proMode();
    const isDay = game.phase === "day";
    const view = game.circle ? "circle" : pro && game.fullList ? "full" : "compact";
    // Kompakte Zeilen: nur das Wichtigste – Antippen öffnet das Spieler-Fenster mit allen Knöpfen
    const lines = ps.map((s, i) => {
      const r = ROLE_BY_ID[s.role], shown = shownRole(s.role);
      return `<button class="gline ${s.alive ? "" : "dead"} t-${r.t}-border" data-seatmodal="${i}">
        <span class="seatno">${i + 1}</span>
        <span class="gl-main"><b>${esc(s.name)}</b>
          <span class="gl-role t-${r.t}-text">${r.ic} ${esc(r.de)}${s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : ""}${shown !== s.role ? ` <small>(glaubt: ${esc(roleName(shown))})</small>` : ""}</span>
          ${s.note ? `<small class="gl-note">📝 ${esc(s.note)}</small>` : ""}</span>
        <span class="gl-st">${s.zfake ? "🧟" : ""}${(s.marks || []).map(m => (markerByKey(m) || {}).i || "").join("")}${ONCE_PER_GAME.includes(s.role) && s.used ? "✔️" : ""}${s.alive ? "" : s.ghost ? "💀👻" : "💀"}</span>
      </button>`;
    }).join("");
    const head = `<section class="panel ghead">
        <div class="ghead-row"><h2>${isDay ? `☀️ Tag ${game.nightNo}` : first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`}</h2>
          <div class="row wrap">${undoStack.length ? `<button class="btn sm" id="undobtn">↩️ Rückgängig</button>` : ""}<button class="btn sm" id="savegame">💾 Spielstand</button><button class="btn sm" id="settingsbtn">⚙️ Einstellungen</button></div></div>
        <p class="small">${game.online ? `${netDot()} Online-Spiel ${esc(game.online.code)} · ` : ""}${alive} von ${playerSeats().length} Spielern leben · Für eine Hinrichtung nötig: <b>${needed}</b> Stimmen</p>
        ${pro ? "" : `<p class="beginner">👉 ${isDay
          ? "Tag: Lass die Spieler reden (Timer unten). Danach nominieren und abstimmen – zum Schluss „Nacht beginnen“."
          : "Nacht: Alle schließen die Augen. Gehe die Liste von oben nach unten durch und hake ab. Am Ende „Morgen – Tag beginnt“."}</p>`}
        ${(game.log || []).length ? `<div class="box msglog"><h4>📨 Meldungen von Spielern</h4><ul>${game.log.slice(-5).reverse().map(l => `<li>${esc(l.text)}</li>`).join("")}</ul></div>` : ""}
      </section>`;
    const grimSec = `<section class="panel">
        <h2>📖 Grimoire</h2>
        <div class="chips viewtoggle">
          <button class="chip ${view === "compact" ? "on" : ""}" data-gview="list">☰ Liste</button>
          <button class="chip ${view === "circle" ? "on" : ""}" data-gview="circle">◯ Sitzkreis</button>
          ${pro ? `<button class="chip ${view === "full" ? "on" : ""}" data-gview="full">▤ Ausführlich</button>` : ""}
        </div>
        ${view === "circle" ? circleHtml() : view === "full" ? `<div class="gseats">${seats}</div>` : `<div class="glines">${lines}</div>`}
        ${view === "full" ? "" : `<p class="small center">Spieler antippen: lebt/tot, Marker, Notiz, Rolle ändern …</p>`}
        <div class="box"><h4>Bluffs</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p></div>
        ${(game.fabled || []).length ? `<div class="box"><h4>Fabelwesen (öffentlich ansagen)</h4>${game.fabled.map(id => `<p>${roleChip(id)} ${esc(ROLE_BY_ID[id].a)}</p>`).join("")}</div>` : ""}
        ${pro ? balanceNowHtml() : ""}
      </section>`;
    const nightBody = `<p class="small">${steps.filter(st => !st.inactive && done.includes(st.id)).length} von ${steps.filter(st => !st.inactive).length} Schritten erledigt${steps.some(st => st.inactive) ? " · grau = tot oder benutzt, entfällt" : ""}</p>
        ${nightActionsBar(steps)}
        <ol class="nightlist">${steps.map(s => `
          <li class="${s.inactive ? "inactive" : done.includes(s.id) ? "done" : ""} ${s.t ? "t-" + s.t + "-border" : ""}" data-step-id="${s.id}">
            <div class="ns-head">${s.inactive ? `<span class="dead-mark">${s.mark}</span>` : `<input type="checkbox" ${done.includes(s.id) ? "checked" : ""}>`}<b>${esc(s.name)}</b>${s.who ? `<span class="who">${s.who}</span>` : ""}</div>
            <p>${s.inactive ? s.why : esc(s.text)}</p>
            ${s.id === "amnesiac" ? game.seats.filter(x => x.role === "amnesiac").map(x => `<p class="small">❓ ${esc(x.name)}: <b>${x.amn ? esc(x.amn.text) : "noch keine Fähigkeit festgelegt"}</b></p>`).join("") : ""}
            ${["sailor", "innkeeper"].includes(s.id) && game.drunkPick && game.drunkPick.night === game.nightNo && game.drunkPick.step === s.id ? (() => {
              const d = game.drunkPick, other = d.opts.find(k => k !== d.on);
              return `<div class="actrow">🍺 Betrunken ist: <b>${esc(game.seats[d.on].name)}</b>${other !== undefined ? ` <button class="btn sm" data-swapdrunk="1">⇄ Stattdessen ${esc(game.seats[other].name)}</button>` : ""}</div>`;
            })() : ""}
            ${["spy", "widow"].includes(s.id) && !s.inactive && (game.online || game.test) ? `<button class="btn sm primary" data-spygrim="${s.id}">📖 Grimoire aufs Handy${tableOn() ? " (wecken)" : ""}</button>` : ""}
            ${s.id === "widow" && !s.inactive ? `<button class="btn sm" data-widowknow="1">🕸️ Guten Spieler einweihen${game.seats.some(x => (x.marks || []).includes("knows")) ? " ✔" : ""}</button>` : ""}
            ${s.id === "spy" && game.seats.some(x => x.grim) ? `<button class="btn sm" data-spyhide="1">🙈 Grimoire vom Handy entfernen</button>` : ""}
            ${s.id === "scarletwoman" && !s.inactive ? game.seats.map((x, i) => x.swPending ? `<button class="btn sm primary" data-swshow="${i}">👑 ${esc(x.name)} zeigen: Du bist ${esc(roleName(x.role))}${game.online || game.test ? " (aufs Handy)" : ""}</button>` : "").join("") : ""}
            ${s.id === "philosopher" && !s.inactive ? game.seats.map((x, i) => x.role === "philosopher" && x.alive && !x.used ? philoSelect(i) : "").join("") : ""}
            ${s.once && !s.inactive && s.id !== "philosopher" ? `<button class="btn sm useonce" data-useonce="${s.id}">✔ Fähigkeit wurde benutzt</button>` : ""}
            ${!s.inactive && nightOn() ? actionStatusHtml(s.id) : ""}
            ${tableOn() && INFO_ROLES.includes(s.id) && !s.inactive ? wakeStatusHtml(s.id) : ""}
            ${INFO_ROLES.includes(s.id) && !s.inactive ? `<button class="btn sm primary showinfo" data-info-step="${s.id}">📱 ${SHOW_ROLE.includes(s.id) ? "Rolle zeigen" : "Info"}${game.online || game.test ? " / senden" : ""}</button>` : ""}
            ${s.show ? `<button class="btn sm primary showevil" data-show="${s.id}">📱 ${s.id === "demoninfo" ? "Dem Dämon zeigen" : "Den Schergen zeigen"} <small>(hier)</small></button>` : ""}
            ${s.show && (game.online || game.test) ? `<button class="btn sm ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "used" : "primary"} sendevil" data-sendevil="${s.id}">🌐 ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "✔ Gesendet" : "Aufs Handy senden"}</button>` : ""}
          </li>`).join("")}</ol>`;
    const nightSec = isDay
      ? `<section class="panel">
        <details class="nightwrap"><summary><h2>${first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`} – Rückblick</h2></summary>${nightBody}</details>
        <div class="row wrap"><button class="btn primary" id="nextnight">🌙 Tag ${game.nightNo} vorbei → Nacht ${game.nightNo + 1} beginnen</button></div>
      </section>`
      : `<section class="panel">
        <h2>📋 Ablauf der Nacht</h2>
        ${nightBody}
        <div class="row wrap">
          <button class="btn" id="nightsum">📋 Nachtübersicht</button><button class="btn primary" id="daystart">☀️ Morgen – Tag ${game.nightNo} beginnt</button>
          ${pro ? `<button class="btn" id="nextnight">⏭️ Tag überspringen → Nacht ${game.nightNo + 1}</button>` : ""}
          ${game.nightNo > 1 ? `<button class="btn sm" id="prevnight">↩︎ Zurück zu Nacht ${game.nightNo - 1}</button>` : ""}
        </div>
      </section>`;
    const endSec = `<section class="panel"><details class="endwrap"><summary><h2>🏁 Spiel von Hand beenden</h2></summary>
        <p class="small">Für Siege, die die App nicht selbst erkennt – z. B. Heiliger hingerichtet, Bürgermeister-Sieg, Vortox ohne Hinrichtung, Tollpatsch, Böser Zwilling.</p>
        <label class="field">Grund (optional): <input id="winreason" placeholder="z. B. Der Heilige wurde hingerichtet"></label>
        <div class="row wrap">
          <button class="btn wingood" data-win="good">😇 Gut hat gewonnen</button>
          <button class="btn winevil" data-win="evil">😈 Böse hat gewonnen</button>
        </div></details>
      </section>`;
    return banner + head + (isDay
      ? `<section class="panel">${timerBox()}</section>${dayPanel()}${grimSec}${nightSec}`
      : `${nightSec}${grimSec}`) + travLatePanel() + endSec;
  }

  // Einsteiger- oder Profi-Ansicht (gilt für dieses Handy)
  const proMode = () => !!store.get("botc.pro", false);
  function settingsModal() {
    const on = game.online || game.test;
    const sw = (id, chk, title, text) => `<label class="switch"><input type="checkbox" id="${id}" ${chk ? "checked" : ""}><span><b>${title}</b> – ${text}</span></label>`;
    openModal(`<h2>⚙️ Einstellungen</h2>
      <h4>Ansicht</h4>
      <div class="chips modepick">
        <button class="chip ${proMode() ? "" : "on"}" data-pro="0">🌱 Einsteiger</button>
        <button class="chip ${proMode() ? "on" : ""}" data-pro="1">🎩 Profi</button>
      </div>
      <p class="small">${proMode() ? "Profi: alles sichtbar – ausführliche Spielerliste, „Wer liegt vorne?“, Tag überspringen." : "Einsteiger: nur das Nötigste, mit kurzen Hinweisen, was gerade zu tun ist."}</p>
      <h4>Spiel</h4>
      ${sw("st-sug", game.suggest !== false, "💡 Info-Vorschläge", "beim Info-Fenster trägt die App die wahre Info schon ein (du kannst sie ändern).")}
      ${on ? sw("st-na", !!game.nightActions, "📲 Nachtaktionen am Handy", "Spieler wählen ihre Ziele auf dem eigenen Handy, statt zu zeigen.") : ""}
      ${on ? sw("st-pv", !!game.phoneVote, "📱 Nominieren &amp; Abstimmen am Handy", "Spieler nominieren und heben die Hand per Knopf, du bestätigst nur.") : ""}
      ${on ? "" : `<p class="small">Handy-Funktionen (Nachtaktionen, Abstimmen) gibt es im Online-Spiel oder in der Testrunde.</p>`}
      <h4>Dieses Handy</h4>
      ${sw("st-music", Mood.on, "🎵 Stimmungsmusik", "leise Klänge für Nacht und Tag.")}
      <div class="row end"><button class="btn primary" id="st-close">Fertig</button></div>`);
    $$("[data-pro]").forEach(b => b.addEventListener("click", () => { store.set("botc.pro", b.dataset.pro === "1"); renderSL(); settingsModal(); }));
    $("#st-sug").addEventListener("change", e => { game.suggest = e.target.checked; save(); });
    $("#st-na") && $("#st-na").addEventListener("change", e => { game.nightActions = e.target.checked; game.asks = {}; game.seq = null; save(); renderSL(); });
    $("#st-pv") && $("#st-pv").addEventListener("change", e => { game.phoneVote = e.target.checked; save(); renderSL(); });
    $("#st-music").addEventListener("change", e => Mood.toggle(e.target.checked));
    $("#st-close").addEventListener("click", closeModal);
  }

  function bindSL() {
    // Schritt 1
    $$("[data-ed]").forEach(b => b.addEventListener("click", () => {
      if (game.edition !== b.dataset.ed) { game.edition = b.dataset.ed; game.selected = []; game.bluffs = []; }
      if (game.edition === "custom" && !(game.script || []).length) { save(); scriptEditor(); return; }
      save(); renderSL();
    }));
    const setCount = n => {
      game.count = Math.max(4, Math.min(15, n));
      if (game.selected.length && game.selected.length !== game.count) game.selected = [];
      save(); renderSL();
    };
    $("#appqr2") && $("#appqr2").addEventListener("click", showAppQR);
    $("#minus") && $("#minus").addEventListener("click", () => setCount(game.count - 1));
    $("#plus") && $("#plus").addEventListener("click", () => setCount(game.count + 1));
    bindOnlineHost();
    $("#teststart") && $("#teststart").addEventListener("click", startTest);
    $("#teststop") && $("#teststop").addEventListener("click", () => { if (confirm("Testrunde beenden? Das Spiel wird zurückgesetzt.")) { game = newGame(); save(); renderSL(); } });
    $("#statsreset") && $("#statsreset").addEventListener("click", () => { if (confirm("Statistik wirklich löschen?")) { store.del("botc.stats"); renderSL(); } });
    $$(".name").forEach(inp => inp.addEventListener("input", () => {
      game.names[+inp.dataset.i] = inp.value;
      save();
    }));
    $("#next1") && $("#next1").addEventListener("click", () => {
      // Namen in bestehende Plätze übernehmen
      const nm = names();
      playerSeats().forEach((s, i) => { s.name = nm[i] || s.name; s.pid = (game.pids || [])[i] || s.pid || null; });
      goStep("roles");
    });
    $("#reset") && $("#reset").addEventListener("click", () => {
      if (confirm("Alles zurücksetzen? Namen, Rollen und Grimoire gehen verloren.")) { game = newGame(); save(); renderSL(); }
    });

    // Schritt 2
    $("#auto") && $("#auto").addEventListener("click", () => { autoPick(); save(); renderSL(); });
    $("#autobal") && $("#autobal").addEventListener("click", () => { suggestBalanced(); save(); renderSL(); toast("⚖️ Ausgewogene Aufstellung gewählt"); });
    $("#clear") && $("#clear").addEventListener("click", () => { game.selected = []; save(); renderSL(); });
    $$(".tile[data-role]").forEach(t => t.addEventListener("click", () => {
      const id = t.dataset.role;
      game.selected = game.selected.includes(id) ? game.selected.filter(x => x !== id) : [...game.selected, id];
      refreshHidden(); save(); renderSL();
    }));
    $$("[data-fabled]").forEach(t => t.addEventListener("click", () => {
      const id = t.dataset.fabled, f = game.fabled || [];
      game.fabled = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
      save(); renderSL();
    }));
    $("#editscript") && $("#editscript").addEventListener("click", scriptEditor);
    $("#importscript") && $("#importscript").addEventListener("click", scriptImport);
    $("#exportscript") && $("#exportscript").addEventListener("click", exportScript);
    $("#drunkShown") && $("#drunkShown").addEventListener("change", e => { game.drunkShown = e.target.value; game.bluffs = game.bluffs.filter(b => b !== game.drunkShown); refreshHidden(); save(); });
    $("#marionetteShown") && $("#marionetteShown").addEventListener("change", e => { game.marionetteShown = e.target.value; game.bluffs = game.bluffs.filter(b => b !== game.marionetteShown); refreshHidden(); save(); });
    $("#lunaticShown") && $("#lunaticShown").addEventListener("change", e => { game.lunaticShown = e.target.value; save(); });
    $("#next2") && $("#next2").addEventListener("click", () => goStep("assign"));

    // Schritt 3
    $$(".seatrole").forEach(sel => sel.addEventListener("change", () => {
      const i = +sel.dataset.i, id = sel.value;
      const other = game.seats.findIndex((s, j) => j !== i && !s.trav && s.role === id);
      if (other >= 0) game.seats[other].role = game.seats[i].role;
      game.seats[i].role = id;
      save(); renderSL();
    }));
    $$("[data-qr]").forEach(b => b.addEventListener("click", () => showQR(+b.dataset.qr)));
    $$("[data-pid]").forEach(sel => sel.addEventListener("change", () => { setSeatPid(+sel.dataset.pid, sel.value); renderSL(); }));
    $$("[data-deltrav]").forEach(b => b.addEventListener("click", () => { game.seats.splice(+b.dataset.deltrav, 1); save(); renderSL(); }));
    $("#pass") && $("#pass").addEventListener("click", () => passMode(0));
    $("#reshuffle") && $("#reshuffle").addEventListener("click", () => {
      if (confirm("Rollen neu auf die Plätze verteilen? Bereits verteilte Codes werden ungültig.")) { assignSeats(); save(); renderSL(); }
    });
    $("#rebluff") && $("#rebluff").addEventListener("click", () => { game.bluffs = []; refreshHidden(); save(); renderSL(); });
    $("#evilinfo") && $("#evilinfo").addEventListener("change", e => { game.evilInfo = e.target.checked; save(); });
    $("#addtrav") && $("#addtrav").addEventListener("click", () => {
      const pid = $("#travpid") ? $("#travpid").value || null : null;
      const name = $("#travname").value.trim() || (pid && lobby[pid] ? lobby[pid].name : "") || `Reisender ${game.seats.filter(s => s.trav).length + 1}`;
      game.seats.push({ name, pid, role: $("#travrole").value, align: $("#travalign").value, trav: true, alive: true, ghost: true, note: "", salt: randInt(32) });
      if (game.step === "grim") {
        const evilT = $("#travalign").value === "e";
        hist(`🧳 ${name} kommt als ${roleName($("#travrole").value)} dazu (${evilT ? "böse" : "gut"})`);
        toast(`🧳 ${name} ist jetzt ${roleName($("#travrole").value)}${pid ? ` – sieht es auf dem Handy${evilT ? " (inkl. wer der Dämon ist)" : ""}` : evilT ? " – zeig ihm noch, wer der Dämon ist" : ""}`);
      }
      save(); renderSL();
    });
    $("#next3") && $("#next3").addEventListener("click", () => goStep("grim"));
    $(".travlate") && $(".travlate").addEventListener("toggle", e => { if (!!game.travOpen === e.target.open) return; game.travOpen = e.target.open; save(); });

    // Schritt 4
    $$("[data-alive]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.alive]; s.alive = !s.alive; if (s.alive) s.ghost = true; histDeath(s); save(); renderSL(); }));
    $$("[data-ghost]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.ghost]; s.ghost = !s.ghost; save(); renderSL(); }));
    $$("[data-note]").forEach(inp => inp.addEventListener("input", () => { game.seats[+inp.dataset.note].note = inp.value; save(); }));
    $$("[data-info]").forEach(b => b.addEventListener("click", () => openModal(roleDetail(ROLE_BY_ID[b.dataset.info], true))));
    $$(".showevil").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); showEvilInfo(b.dataset.show); }));
    $$(".sendevil").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const which = b.dataset.sendevil, key = which === "demoninfo" ? "demon" : "minion";
      game.evilSent = Object.assign({}, game.evilSent, { [key]: true });
      // Empfänger: Schergen (ohne Marionette) bzw. Dämon und Wahnsinniger
      const rc = playerSeats().filter(x => key === "minion" ? (ROLE_BY_ID[x.role].t === "minion" && x.role !== "marionette") : (ROLE_BY_ID[x.role].t === "demon" || x.role === "lunatic"));
      const off = rc.filter(x => !reachable(x));
      const d = game.done[game.nightNo] || [];
      if (!d.includes(which)) game.done[game.nightNo] = [...d, which];
      save(); renderSL();
      if (off.length) notice(`Nicht online: ${off.map(x => x.name).join(", ")} – bitte mit „zeigen (hier)“ das Handy hinhalten.`);
      else toast(`Gesendet an ${rc.map(x => x.name).join(", ")}`);
    }));
    $$(".showinfo").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); infoDialog(b.dataset.infoStep); }));
    bindNightActions();
    $("#sugtoggle") && $("#sugtoggle").addEventListener("change", e => { game.suggest = e.target.checked; save(); });
    $$("[data-useonce]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const id = b.dataset.useonce;
      game.seats.forEach(s => {
        if (!s.alive) return;
        if (s.role === id || (s.role === "drunk" && shownRole("drunk") === id)) s.used = true;
        if (s.role === "philosopher" && s.gained === id) s.gainedUsed = true;
      });
      const d = game.done[game.nightNo] || [];
      if (!d.includes(id)) game.done[game.nightNo] = [...d, id];
      save(); renderSL();
    }));
    $$("[data-philo]").forEach(sel => {
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", () => setPhilo(+sel.dataset.philo, sel.value));
    });
    $$("[data-used]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.used]; s.used = !s.used; save(); renderSL(); }));
    $$(".nightlist li:not(.inactive)").forEach(li => li.addEventListener("click", () => {
      const id = li.dataset.stepId;
      const d = game.done[game.nightNo] || [];
      game.done[game.nightNo] = d.includes(id) ? d.filter(x => x !== id) : [...d, id];
      save(); renderSL();
    }));
    $("#daystart") && $("#daystart").addEventListener("click", dawnDialog);
    $("#undobtn") && $("#undobtn").addEventListener("click", undo);
    $("#savegame") && $("#savegame").addEventListener("click", gameTransfer);
    $("#nightsum") && $("#nightsum").addEventListener("click", () => openModal(`<h2>📋 Nachtübersicht</h2>${nightSummaryHtml()}<div class="row end"><button class="btn primary" id="nsclose">OK</button></div>`) || $("#nsclose").addEventListener("click", closeModal));
    $$("[data-swapdrunk]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); swapDrunk(); }));
    $$("[data-spygrim]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); spyGrimDialog(b.dataset.spygrim); }));
    $$("[data-widowknow]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); widowKnowDialog(); }));
    $$("[data-spyhide]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); spyGrimHide(); }));
    $$("[data-swshow]").forEach(b => b.addEventListener("click", () => {
      const x = game.seats[+b.dataset.swshow];
      x.swPending = false;
      hist(`👑 ${x.name} hat erfahren: Du bist ${roleName(x.role)}`, "night");
      const d = game.done[game.nightNo] || [];
      if (!d.includes("scarletwoman")) game.done[game.nightNo] = [...d, "scarletwoman"];
      save(); renderSL();
      toast(game.online || game.test ? `${x.name} sieht jetzt ihre neue Rolle auf dem Handy` : `Zeig ${x.name} jetzt „Du bist“ + ${roleName(x.role)}`);
    }));
    $("#nextnight") && $("#nextnight").addEventListener("click", () => {
      const end = !game.winner && detectEnd();
      if (end && game.ignoreEnd !== aliveKey() && !confirm(`Das Spiel ist eigentlich vorbei: ${end.winner === "good" ? "Gut" : "Böse"} gewinnt.\n${end.reason}\n\nTrotzdem weiterspielen?`)) return;
      if (end) game.ignoreEnd = aliveKey();
      game.vote = null;
      game.exile = null;
      game.asks = {};
      game.seq = null;
      game.tableNight = null;
      game.wakes = {};
      // Schutz-/Ziel-Marker gelten nur eine Nacht; Gift & Betrunken bis zur nächsten Nacht (außer 📌)
      const healed = [];
      game.seats.forEach(x => {
        if (x.drunkUntil && game.nightNo + 1 >= x.drunkUntil) { x.keep = (x.keep || []).filter(m => m !== "drunk"); delete x.drunkUntil; }
        const keep = x.keep || [];
        const before = x.marks || [];
        x.marks = before.filter(m => { const d = markerByKey(m) || {}; return !d.n && !(d.t && !keep.includes(m)); });
        if (before.some(m => ["poison", "drunk"].includes(m) && !x.marks.includes(m))) healed.push(x.name);
        x.keep = keep.filter(m => x.marks.includes(m));
      });
      game.nightNo++;
      game.phase = "night";
      hist(`🌙 Nacht ${game.nightNo} beginnt`, "night");
      if (healed.length) hist(`💧 Gift/Trunkenheit vorbei: ${healed.join(", ")}`, "night");
      game.done[game.nightNo] = [];
      save(); renderSL();
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast(`Nacht ${game.nightNo} beginnt`);
    });
    $("#prevnight") && $("#prevnight").addEventListener("click", () => { game.nightNo--; save(); renderSL(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    bindDay();
    $$("[data-change]").forEach(b => b.addEventListener("click", () => changeRole(+b.dataset.change)));
    $$("[data-seatmodal]").forEach(b => b.addEventListener("click", () => seatModal(+b.dataset.seatmodal)));
    $$("[data-gview]").forEach(b => b.addEventListener("click", () => { game.circle = b.dataset.gview === "circle"; game.fullList = b.dataset.gview === "full"; save(); renderSL(); }));
    $("#settingsbtn") && $("#settingsbtn").addEventListener("click", settingsModal);
    bindTimer();
    $("#musictoggle") && $("#musictoggle").addEventListener("change", e => { Mood.toggle(e.target.checked); });
    $$("[data-mad]").forEach(b => b.addEventListener("click", () => madnessDialog(+b.dataset.mad)));
    $$("[data-win]").forEach(b => b.addEventListener("click", () => {
      const team = b.dataset.win;
      const reason = b.dataset.reason || ($("#winreason") && $("#winreason").value.trim()) ||
        (team === "good" ? "Die guten Spieler haben das Dorf gerettet." : "Das Böse hat das Dorf übernommen.");
      game.winner = { team, reason };
      hist(`🏆 ${team === "good" ? "Gut" : "Böse"} gewinnt – ${reason}`);
      recordStats();
      save(); renderSL(); showEnd();
    }));
    $("#ignoreend") && $("#ignoreend").addEventListener("click", () => { game.ignoreEnd = aliveKey(); save(); renderSL(); });
    $("#showend") && $("#showend").addEventListener("click", showEnd);
    $("#undoend") && $("#undoend").addEventListener("click", () => { game.winner = null; game.ignoreEnd = aliveKey(); unrecordStats(); hist("↩︎ Spiel wird fortgesetzt"); save(); renderSL(); });
  }

  // =====================================================================
  //  ABSTIMMUNGS-HELFER (optional, eingeklappt)
  // =====================================================================
  // Mehrheit: mindestens die Hälfte der lebenden Spieler (Reisende zählen mit).
  const votesNeeded = () => Math.ceil(game.seats.filter(s => s.alive).length / 2);
  function today() {
    game.days = game.days || {};
    return game.days[game.nightNo] = game.days[game.nightNo] || { noms: [], exec: null };
  }
  // Wer liegt auf dem Block? Höchste Stimmenzahl, mindestens die Mehrheit, kein Gleichstand.
  function block(day) {
    let best = null, tie = false;
    day.noms.forEach(n => {
      if (n.count < n.needed) return;
      if (!best || n.count > best.count) { best = n; tie = false; }
      else if (n.count === best.count) tie = true;
    });
    return tie ? { tie: true, count: best.count } : best;
  }

  // ---------- Amnesiker: tagsüber privat raten, Antwort kalt/warm/heiß/Bingo ----------
  function amnesiacDialog() {
    const S = game.seats;
    const i = S.findIndex(y => y.alive && y.role === "amnesiac");
    if (i < 0) return;
    const x = S[i];
    if (!x.amn) { const pool = AMNESIAC_IDEAS.filter(a => !a.like || !S.some(y => y.role === a.like)); setAmn(x, pool[randInt(pool.length)].k); }
    const ANS = [["kalt", "🥶 Kalt", "hat nichts mit der Fähigkeit zu tun"], ["warm", "🙂 Warm", "auf der richtigen Spur"], ["heiß", "🔥 Heiß", "fast richtig"], ["Bingo", "🎯 Bingo", "erraten – auch wenn anders formuliert"]];
    openModal(`<h2>❓ ${esc(x.name)} rät seine Fähigkeit</h2>
      <p class="small">Nur für dich – seine geheime Fähigkeit:</p><div class="box">${esc(x.amn.text)}</div>
      ${impaired(x) ? `<p class="warnmsg">⚠️ Er ist vergiftet/betrunken – die Antwort darf falsch sein.</p>` : ""}
      <label class="field">Seine Vermutung (optional):<input id="amnguess" placeholder="z. B. „Ich erfahre etwas über Schergen?“"></label>
      <div class="row wrap">${ANS.map(([k, l, d]) => `<button class="btn ${k === "Bingo" ? "primary" : ""}" data-amn="${k}" title="${esc(d)}">${l}</button>`).join("")}</div>
      <p class="small">Kalt = hat nichts damit zu tun · Warm = richtige Spur · Heiß = fast · Bingo = erraten</p>`);
    $$("[data-amn]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.amn, g = $("#amnguess").value.trim();
      today().amn = true;
      x.infos = [...(x.infos || []), { n: game.nightNo, t: `☀️ Tag ${game.nightNo}: ${g ? `„${g}“ → ` : ""}${a}` }].slice(-10);
      if (a === "Bingo") x.amn.known = true;
      hist(`❓ ${x.name} (Amnesiker) rät${g ? ` „${g}“` : ""}: ${a}`, "day");
      save(); closeModal(); renderSL();
      toast(a === "Bingo" ? `🎯 ${x.name} hat seine Fähigkeit erraten – steht jetzt auf seiner Karte` : `❓ Antwort „${a}“${reachable(x) ? " steht auf seinem Handy" : " – sag es ihm"}`);
    }));
  }

  // ---------- Jongleur: am ersten Tag bis zu 5 Rollen raten, nachts die Anzahl der Treffer ----------
  function jugglerDialog() {
    const S = game.seats;
    const ji = S.findIndex(y => y.alive && actingRole(y) === "juggler");
    if (ji < 0) return;
    const x = S[ji];
    const script = (scriptInfo() || { ids: ROLES.filter(r => r.ed === game.edition).map(r => r.id) }).ids.filter(id => ROLE_BY_ID[id] && !["fabled"].includes(ROLE_BY_ID[id].t));
    const cur = (game.juggle && game.juggle.guesses) || [];
    const others = S.map((y, i) => i).filter(i => i !== ji);
    const row = (k, g) => `<div class="row wrap jugrow">
      <select data-jp="${k}"><option value="">– Spieler –</option>${others.map(i => `<option value="${i}" ${g && g.k === i ? "selected" : ""}>${esc(S[i].name)}</option>`).join("")}</select>
      <select data-jr="${k}"><option value="">– Rolle –</option>${script.map(id => `<option value="${id}" ${g && g.role === id ? "selected" : ""}>${esc(roleName(id))}</option>`).join("")}</select></div>`;
    openModal(`<h2>🤹 ${esc(x.name)} jongliert</h2>
      <p class="small">Er sagt laut bis zu 5 Vermutungen, z. B. „Anna ist Uhrmacher“. Trag sie hier ein – heute Nacht schlägt die App die Anzahl der Treffer vor.</p>
      ${[0, 1, 2, 3, 4].map(k => row(k, cur[k])).join("")}
      ${isBot(x) ? `<div class="row wrap"><button class="btn" id="jugbot">🤖 Bot raten lassen</button></div>` : ""}
      <div class="row end"><button class="btn" id="jugcancel">Abbrechen</button><button class="btn primary" id="jugsave">Speichern</button></div>`);
    $("#jugcancel").addEventListener("click", closeModal);
    $("#jugbot") && $("#jugbot").addEventListener("click", () => {
      shuffle(others).slice(0, 3 + randInt(3)).forEach((i, k) => {
        const role = Math.random() < 0.45 ? S[i].role : script[randInt(script.length)];
        $(`[data-jp="${k}"]`).value = String(i); $(`[data-jr="${k}"]`).value = role;
      });
    });
    $("#jugsave").addEventListener("click", () => {
      const guesses = [0, 1, 2, 3, 4].map(k => ({ k: $(`[data-jp="${k}"]`).value, role: $(`[data-jr="${k}"]`).value }))
        .filter(g => g.k !== "" && g.role).map(g => ({ k: +g.k, role: g.role }));
      game.juggle = { by: ji, day: game.nightNo, guesses };
      hist(`🤹 ${x.name} (Jongleur) rät: ${guesses.map(g => `${S[g.k].name} = ${roleName(g.role)}`).join(", ") || "nichts"}`, "day");
      save(); closeModal(); renderSL();
      toast(`🤹 ${guesses.length} Vermutung(en) gespeichert`);
    });
  }

  // ---------- Gelehrter: zwei Aussagen, eine wahr, eine falsch ----------
  // Jede Vorlage liefert für wahr=true eine wahre, für wahr=false eine falsche Aussage (oder null, wenn nicht möglich).
  function savantFacts(me) {
    const S = game.seats, P = S.map((x, i) => i).filter(i => !S[i].trav), n = S.length;
    const T = i => ROLE_BY_ID[S[i].role].t, nm = i => S[i].name;
    const others = P.filter(i => i !== me);
    const rnd1 = a => a.length ? a[randInt(a.length)] : null;
    const script = (scriptInfo() || { ids: ROLES.filter(r => r.ed === game.edition).map(r => r.id) }).ids.filter(id => ROLE_BY_ID[id] && !["traveller", "fabled"].includes(ROLE_BY_ID[id].t));
    const inPlay = new Set(P.map(i => S[i].role));
    const demon = P.find(i => T(i) === "demon");
    const dist = (a, b) => Math.min((a - b + n) % n, (b - a + n) % n) - 1;
    const tName = { townsfolk: "Dorfbewohner", outsider: "Außenseiter", minion: "Scherge", demon: "Dämon" };
    const shift = v => Math.max(0, v + (v === 0 || Math.random() < 0.5 ? 1 : -1));
    const tpl = [
      w => { // Rolle im Spiel
        const pool = w ? [...inPlay].filter(id => id !== "savant" && S[me].role !== id && ROLE_BY_ID[id].t !== "demon") : script.filter(id => !inPlay.has(id) && id !== "savant");
        const id = rnd1(pool); return id ? `${roleName(id)} ist im Spiel.` : null;
      },
      w => { // Anzahl Außenseiter
        const c = P.filter(i => T(i) === "outsider").length; return `Es sind genau ${w ? c : shift(c)} Außenseiter im Spiel.`;
      },
      w => { // zwei Spieler im selben Team
        const a = rnd1(others), b = rnd1(others.filter(i => i !== a)); if (a === null || b === null) return null;
        const same = seatGood(S[a]) === seatGood(S[b]);
        return (same === w) ? `${nm(a)} und ${nm(b)} sind im selben Team.` : `${nm(a)} und ${nm(b)} sind in verschiedenen Teams.`;
      },
      w => { // Dämon neben Scherge
        if (demon === undefined) return null;
        const nb = [(demon + 1) % n, (demon - 1 + n) % n].filter(k => !S[k].trav);
        const yes = nb.some(k => T(k) === "minion");
        return (yes === w) ? "Der Dämon sitzt direkt neben einem Schergen." : "Der Dämon sitzt neben keinem Schergen.";
      },
      w => { // Abstand zum Dämon
        if (demon === undefined || demon === me) return null;
        const d = dist(me, demon); return `Zwischen dir und dem Dämon sitzen (auf dem kürzeren Weg) ${w ? d : shift(d)} Spieler.`;
      },
      w => { // Typ eines Spielers
        const a = rnd1(others); if (a === null) return null;
        const real = T(a); if (w && real === "demon") return null; // „X ist der Dämon“ wäre zu stark
        const fake = rnd1(["townsfolk", "outsider", "minion"].filter(t => t !== real));
        return `${nm(a)} ist ${real === "demon" && w ? "der Dämon" : "ein " + tName[w ? real : fake]}.`;
      },
      w => { // Böse links von dir
        const k = Math.min(4, P.length - 1), left = []; for (let j = 1; left.length < k && j < n; j++) { const q = (me - j + n) % n; if (!S[q].trav) left.push(q); }
        const c = left.filter(q => !seatGood(S[q])).length;
        return `Von den ${k} Spielern links von dir sind genau ${w ? c : shift(c)} böse.`;
      },
      w => { // lebende Schergen
        const c = P.filter(i => S[i].alive && T(i) === "minion").length, v = w ? c : shift(c); return v === 1 ? "Es lebt noch genau 1 Scherge." : `Es leben noch genau ${v} Schergen.`;
      },
      w => { // Paar: einer ist böse
        const a = rnd1(others), b = rnd1(others.filter(i => i !== a)); if (a === null || b === null) return null;
        const any = !seatGood(S[a]) || !seatGood(S[b]);
        return (any === w) ? `Mindestens einer von ${nm(a)} und ${nm(b)} ist böse.` : `${nm(a)} und ${nm(b)} sind beide gut.`;
      },
    ];
    return tpl;
  }
  function savantPair(me, mode) {
    const tpl = shuffle(savantFacts(me).map((f, k) => k)), F = savantFacts(me);
    const truths = mode === "false" ? [false, false] : mode === "true" ? [true, true] : shuffle([true, false]);
    const out = [];
    for (const k of tpl) { if (out.length === 2) break; const txt = F[k](truths[out.length]); if (txt) out.push({ t: txt, w: truths[out.length] }); }
    return out;
  }
  function savantDialog() {
    const S = game.seats;
    const sav = S.map((x, i) => i).filter(i => S[i].alive && actingRole(S[i]) === "savant");
    if (!sav.length) return;
    const i = sav[0], x = S[i];
    const vortox = S.some(y => y.role === "vortox" && y.alive);
    const weak = impaired(x);
    let mode = vortox ? "false" : "mix";
    let pair = savantPair(i, mode);
    const draw = () => {
      openModal(`<h2>🎓 ${esc(x.name)} besucht dich</h2>
        ${vortox ? `<p class="warnmsg">⚠️ Vortox im Spiel: Beide Aussagen müssen falsch sein.</p>` : weak ? `<p class="warnmsg">⚠️ ${x.role === "drunk" ? "Er ist der Säufer" : "Der Gelehrte ist vergiftet/betrunken"} – du darfst beide falsch (oder beide wahr) sagen.</p>` : `<p class="small">Eine Aussage ist wahr, eine falsch. Die Markierung siehst nur du.</p>`}
        <div class="chips">
          <button class="chip ${mode === "mix" ? "on" : ""}" data-svmode="mix" ${vortox ? "disabled" : ""}>1 wahr + 1 falsch</button>
          <button class="chip ${mode === "false" ? "on" : ""}" data-svmode="false" ${!(weak || vortox) ? "disabled" : ""}>beide falsch</button>
          <button class="chip ${mode === "true" ? "on" : ""}" data-svmode="true" ${!weak || vortox ? "disabled" : ""}>beide wahr</button>
        </div>
        ${pair.map((f, k) => `<label class="field">${f.w ? "✅ wahr" : "❌ falsch"} – Aussage ${k + 1}:<textarea id="sv${k}" rows="2">${esc(f.t)}</textarea></label>`).join("")}
        <div class="row wrap"><button class="btn" id="svnew">🎲 Andere Aussagen</button></div>
        <div class="row end wrap"><button class="btn" id="svshow">👁️ Hier zeigen</button>${reachable(x) ? `<button class="btn primary" id="svsend">📱 Aufs Handy</button>` : ""}</div>`);
      $$("[data-svmode]").forEach(b => b.addEventListener("click", () => { mode = b.dataset.svmode; pair = savantPair(i, mode); draw(); }));
      $("#svnew").addEventListener("click", () => { pair = savantPair(i, mode); draw(); });
      const store_ = () => {
        const a = $("#sv0").value.trim(), b2 = $("#sv1") ? $("#sv1").value.trim() : "";
        const day = today();
        day.savant = true;
        x.infos = [...(x.infos || []), { n: game.nightNo, t: `☀️ Tag ${game.nightNo}: ① ${a} ② ${b2}` }].slice(-10);
        hist(`🎓 ${x.name} (Gelehrter): ① ${a} [${pair[0].w ? "wahr" : "falsch"}] ② ${b2} [${pair[1] && pair[1].w ? "wahr" : "falsch"}]`, "day");
        const truthMix = pair.length === 2 && pair[0].w !== pair[1].w;
        if (!truthMix && !weak && !vortox) abn(x, "Gelehrter bekam keine Mischung aus wahr und falsch");
        save();
        return [a, b2];
      };
      $("#svsend") && $("#svsend").addEventListener("click", () => { store_(); closeModal(); renderSL(); toast(`🎓 Aussagen an ${x.name} gesendet`); });
      $("#svshow").addEventListener("click", () => {
        const [a, b2] = store_();
        openModal(`<div class="nightshow pickshow"><p class="ns-label">${esc(x.name)} · 🎓 Gelehrter</p>
          <h2>Eine Aussage ist wahr, eine ist falsch:</h2>
          <p class="ns-text">① ${esc(a)}</p><p class="ns-text">② ${esc(b2)}</p></div>
          <div class="row center"><button class="btn big" id="svdone">✓ Fertig</button></div>`, "full night");
        $("#svdone").addEventListener("click", () => { closeModal(); renderSL(); });
      });
    };
    draw();
  }

  // Dämonenjäger: einmal pro Spiel öffentlich auf einen Spieler schießen – ist es der Dämon, stirbt er.
  function slayerDialog() {
    const S = game.seats;
    const shooters = S.map((x, i) => i).filter(i => S[i].alive && actingRole(S[i]) === "slayer" && !(S[i].role === "philosopher" ? S[i].gainedUsed : S[i].used));
    if (!shooters.length) return;
    const opt = list => list.map(i => `<option value="${i}">${esc(S[i].name)}</option>`).join("");
    openModal(`<h2>🏹 Dämonenjäger schießt</h2>
      <p class="small">Der Spieler sagt öffentlich „Ich bin der Dämonenjäger und schieße auf …“. Das geht einmal pro Spiel – auch wenn er es nur behauptet.</p>
      ${shooters.length > 1 ? `<label class="field">Wer schießt?<select id="slayby">${opt(shooters)}</select></label>` : ""}
      <label class="field">Auf wen?<select id="slayon">${opt(S.map((x, i) => i).filter(i => S[i].alive && i !== shooters[0]))}</select></label>
      <div class="row end"><button class="btn" id="slaycancel">Abbrechen</button><button class="btn danger" id="slaygo">🏹 Schießen</button></div>`);
    $("#slaycancel").addEventListener("click", closeModal);
    $("#slaygo").addEventListener("click", () => {
      const by = $("#slayby") ? +$("#slayby").value : shooters[0], on = +$("#slayon").value;
      const x = S[by], t = S[on];
      if (x.role === "philosopher") x.gainedUsed = true; else x.used = true;
      const real = (x.role === "slayer" || (x.role === "philosopher" && x.gained === "slayer")) && !impaired(x);
      let hit = real && ROLE_BY_ID[t.role].t === "demon";
      if (real && !hit && t.role === "recluse" && !impaired(t)) hit = confirm(`${t.name} ist der Einsiedler und darf als Dämon gelten.\n\nSoll er sterben?`);
      closeModal();
      if (hit) {
        hist(`🏹 ${x.name} (Dämonenjäger) schießt auf ${t.name} – Treffer! ${t.name} stirbt`, "day");
        applyDeath(t, deathRule(t));
        toast(t.alive ? `🏹 Treffer – aber ${t.name} überlebt (${roleName(t.role)})` : swMsg || `🏹 Treffer! ${t.name} war der Dämon und stirbt`);
      } else {
        hist(`🏹 ${x.name} schießt auf ${t.name} – nichts passiert${!real ? (x.role === "slayer" ? " (vergiftet/betrunken)" : " (kein echter Dämonenjäger)") : ""}`, "day");
        if (!real && x.role === "slayer" && ROLE_BY_ID[t.role].t === "demon") abn(x, "Dämonenjäger trifft den Dämon, ist aber vergiftet/betrunken");
        toast(`🏹 Nichts passiert${!real && x.role !== "slayer" ? ` – ${x.name} ist kein echter Dämonenjäger` : !real ? " – Dämonenjäger ist vergiftet/betrunken" : ""}`);
      }
      save(); renderSL();
    });
  }

  // Heiliger: Wird er (gesund) hingerichtet, verliert Gut.
  function saintCheck(x) {
    if (!x || (x.role !== "saint" && !hbHas(x.role, "saint")) || x.alive) return;
    if (impaired(x)) { hist(`😇 ${x.name} (Heiliger) wurde hingerichtet, war aber vergiftet/betrunken – nichts passiert`, "day"); abn(x, "Heiliger hingerichtet, aber vergiftet – keine Folgen"); return; }
    game.saintLoss = x.name; game.saintLossRole = roleName(x.role); game.ignoreEnd = null; game.endPopped = null;
  }

  // Jungfrau: Wird sie das erste Mal nominiert und ist der Nominierende ein Dorfbewohner,
  // wird dieser sofort hingerichtet. Danach (oder vergiftet) ist ihre Fähigkeit verbraucht.
  function virginCheck(by, on) {
    const v = game.seats[on], n = game.seats[by];
    if (!v || v.role !== "virgin" || v.used || !n) return null;
    v.used = true;
    if (impaired(v)) { hist(`👰 ${v.name} (Jungfrau) wurde nominiert – sie ist vergiftet/betrunken, nichts passiert`, "day"); if (ROLE_BY_ID[n.role].t === "townsfolk") abn(v, "Jungfrau vergiftet – Nominierung durch Dorfbewohner ohne Folgen"); return { msg: "👰 Jungfrau vergiftet/betrunken – nichts passiert (Fähigkeit trotzdem verbraucht)" }; }
    let towns = ROLE_BY_ID[n.role].t === "townsfolk";
    if (n.role === "spy" && !impaired(n)) towns = confirm(`${n.name} ist der Spion und darf als Dorfbewohner gelten.\n\nSoll die Jungfrau auslösen (Spion wird hingerichtet)?`);
    if (!towns) { hist(`👰 ${v.name} (Jungfrau) wurde zum ersten Mal nominiert – von keinem Dorfbewohner, nichts passiert`, "day"); return { msg: `👰 ${n.name} ist kein Dorfbewohner – nichts passiert (Jungfrau verbraucht)` }; }
    const day = today();
    game.vote = null;
    day.noms.push({ by, on, count: 0, needed: votesNeeded(), hands: [], virgin: true });
    day.exec = { seat: by, name: n.name };
    hist(`👰 ${n.name} hat die Jungfrau ${v.name} nominiert und wird sofort hingerichtet!`, "day");
    const rule = deathRule(n);
    applyDeath(n, rule);
    if (n.alive) day.exec.survived = true;
    saintCheck(n);
    return { stop: true, msg: `👰 ${n.name} ist ein Dorfbewohner und wird sofort hingerichtet! Die Abstimmung entfällt.` };
  }

  // Hexe: Nominiert der verfluchte Spieler, stirbt er sofort (Hexe lebt, ist gesund, und es leben mehr als 3).
  // Die Nominierung selbst bleibt gültig, es wird trotzdem abgestimmt.
  function witchCurse(by) {
    const x = game.seats[by];
    if (!x || !x.alive || !(x.marks || []).includes("cursed")) return null;
    const witch = game.seats.find(y => y.role === "witch" && y.alive);
    if (!witch) return null;
    if (impaired(witch)) { hist(`🧹 ${x.name} war verflucht, aber die Hexe ist vergiftet/betrunken – nichts passiert`, "day"); abn(witch, "Hexenfluch ohne Wirkung (vergiftet/betrunken)"); return `🧹 Fluch wirkt nicht – die Hexe ist vergiftet/betrunken`; }
    if (game.seats.filter(y => y.alive && !y.trav).length <= 3) return null;
    hist(`🧹 ${x.name} war verflucht und hat nominiert – stirbt sofort`, "day");
    applyDeath(x, deathRule(x));
    return x.alive ? `🧹 ${x.name} war verflucht, überlebt aber (${roleName(x.role)})` : `🧹 ${x.name} war verflucht und stirbt sofort! Die Abstimmung läuft trotzdem.`;
  }

  // Butler-Regel: darf nur stimmen, wenn der Meister auch die Hand hebt (außer betrunken/vergiftet).
  // Der Butler achtet selbst darauf. Verstößt er, zählt die Stimme trotzdem – sonst würden
  // alle am Tisch merken, wer der Butler ist. Der Spielleiter sieht nur einen Hinweis.
  function butlerCheck(i, hands) {
    const s = game.seats[i];
    if (!s || s.role !== "butler") return null;
    const m = s.marks || [];
    if (m.includes("poison") || m.includes("drunk")) return { ok: true, note: "Butler – betrunken/vergiftet: darf frei stimmen" };
    const master = game.seats.findIndex(y => (y.marks || []).includes("master"));
    if (master < 0) return { ok: true, warn: !!hands.includes(i), note: "Butler – kein Meister markiert (Marker 🎩 setzen)" };
    const mname = game.seats[master].name;
    if (!hands.includes(i)) return { ok: true, note: `Butler – darf nur stimmen, wenn ${mname} stimmt` };
    if (hands.includes(master)) return { ok: true, note: `Butler – ✅ Meister ${mname} stimmt mit` };
    return { ok: true, warn: true, note: `⚠️ Meister ${mname} stimmt nicht mit – zählt trotzdem (unauffällig), Butler später leise erinnern` };
  }
  const validHands = hands => hands.filter(i => { const c = butlerCheck(i, hands); return !c || c.ok; });

  // ---------- Reisende verbannen ----------
  // Jeder (auch Tote, ohne ihre Geisterstimme zu verbrauchen) darf die Verbannung unterstützen.
  // Keine Fähigkeit kann sie beeinflussen, sie ist keine Hinrichtung und zählt nicht als Nominierung.
  function exileHtml(day) {
    const ps = game.seats;
    const travs = ps.map((x, i) => i).filter(i => ps[i].trav && ps[i].alive);
    const done = (day.exiles || []).map(e => `<li>🧳 ${esc(e.name)}: ${e.count} / ${e.needed} – ${e.ok ? "<b>verbannt</b>" : "nicht verbannt"}</li>`).join("");
    if (!travs.length && !done) return "";
    const ex = game.exile;
    let body;
    if (ex) {
      const count = ex.hands.length, needed = votesNeeded();
      body = `<div class="vote">
        <p>🧳 Verbannung von <b>${esc(ps[ex.on].name)}</b> (${esc(roleName(ps[ex.on].role))})</p>
        <p class="small">Alle dürfen die Hand heben – auch Tote, ohne ihre Geisterstimme zu verbrauchen. Keine Fähigkeit wirkt darauf.</p>
        <div class="votelist">${ps.map((x, i) => `<button class="voter ${ex.hands.includes(i) ? "up" : ""}" data-exhand="${i}">
          <span>${ex.hands.includes(i) ? "✋" : "·"}</span><b>${esc(x.name)}</b>${x.alive ? "" : "<small>tot – darf trotzdem</small>"}</button>`).join("")}</div>
        <div class="votecount ${count >= needed ? "ok" : ""}">${count} Unterstützer · nötig ${needed} (Hälfte der Lebenden)</div>
        <div class="row wrap">
          ${game.test ? `<button class="btn" id="botexile">🤖 Bots entscheiden</button>` : ""}
          <button class="btn ${count >= needed ? "danger" : "primary"}" id="exiledo">${count >= needed ? `🧳 ${esc(ps[ex.on].name)} verbannen` : "Nicht verbannt – beenden"}</button>
          <button class="btn" id="exilecancel">Abbrechen</button></div></div>`;
    } else {
      body = travs.length ? `<div class="nomform"><label>Reisenden verbannen?<select id="exileon">${travs.map(i => `<option value="${i}">${esc(ps[i].name)} (${esc(roleName(ps[i].role))})</option>`).join("")}</select></label>
        <button class="btn" id="exilestart">🧳 Verbannung ausrufen</button></div>` : "";
    }
    return `<h3>🧳 Reisende</h3>
      <p class="small">Reisende werden nicht hingerichtet, sondern verbannt. Jeder darf das ausrufen – beliebig oft am Tag. Die Verbannung ist keine Hinrichtung (der Tag kann trotzdem noch eine haben). Dass die Hälfte der Lebenden nötig ist, ist eine verbreitete Faustregel – eure Runde kann es anders handhaben.</p>
      ${body}${done ? `<ul class="nomlist">${done}</ul>` : ""}`;
  }
  function bindExile(day) {
    $("#exilestart") && $("#exilestart").addEventListener("click", () => { game.exile = { on: +$("#exileon").value, hands: [] }; save(); renderSL(); });
    $$("[data-exhand]").forEach(b => b.addEventListener("click", () => {
      const i = +b.dataset.exhand, h = game.exile.hands;
      game.exile.hands = h.includes(i) ? h.filter(x => x !== i) : [...h, i];
      save(); renderSL();
    }));
    $("#exilecancel") && $("#exilecancel").addEventListener("click", () => { game.exile = null; save(); renderSL(); });
    $("#botexile") && $("#botexile").addEventListener("click", () => {
      const ex = game.exile, t = game.seats[ex.on];
      game.seats.forEach((x, i) => {
        if (!isBot(x) || i === ex.on) return;
        // Böse schützen böse Reisende, Gute sind misstrauisch
        const sameSide = seatGood(x) === seatGood(t);
        const p = seatGood(x) ? (sameSide ? 0.35 : 0.6) : (sameSide ? 0.05 : 0.85);
        if (Math.random() < p && !ex.hands.includes(i)) ex.hands.push(i);
      });
      save(); renderSL();
    });
    $("#exiledo") && $("#exiledo").addEventListener("click", () => {
      const ex = game.exile, t = game.seats[ex.on], needed = votesNeeded(), ok = ex.hands.length >= needed;
      day.exiles = [...(day.exiles || []), { name: t.name, count: ex.hands.length, needed, ok }];
      if (ok) {
        t.alive = false; t.ghost = true;
        hist(`🧳 ${t.name} (${roleName(t.role)}) wurde verbannt (${ex.hands.length} / ${needed})`, "day");
        histDeath(t);
      } else hist(`🧳 Verbannung von ${t.name} gescheitert (${ex.hands.length} / ${needed})`, "day");
      game.exile = null;
      save(); renderSL();
      toast(ok ? `🧳 ${t.name} wurde verbannt und stirbt` : `${t.name} bleibt im Spiel`);
    });
  }

  // Nominierung beginnen – mit allen Prüfungen (doppelt, Jungfrau, Hexe)
  function beginVote(by, on, quiet) {
    const day = today();
    const warn = [];
    if (day.noms.filter(n => n.by === by).length >= (game.seats[by].banshee ? 2 : 1)) warn.push(`${game.seats[by].name} hat heute schon ${game.seats[by].banshee ? "2×" : ""} nominiert.`);
    if (day.noms.some(n => n.on === on)) warn.push(`${game.seats[on].name} war heute schon nominiert.`);
    if (!quiet && warn.length && !confirm(warn.join("\n") + "\n\nTrotzdem abstimmen?")) return;
    game.vote = { by, on, hands: [] };
    game.voteOpen = true;
    const virgin = virginCheck(by, on);
    const cursed = virgin && virgin.stop ? null : witchCurse(by);
    save(); renderSL();
    if (virgin) toast(virgin.msg); else if (cursed) toast(cursed);
  }

  function dayPanel() {
    const day = today();
    const ps = game.seats;
    const nominatedBy = new Set(day.noms.map(n => n.by));
    const nominated = new Set(day.noms.map(n => n.on));
    const b = block(day);
    const v = game.vote;
    let body = "";

    if (day.exec) {
      body += `<div class="box exec">${day.exec === "none" ? "Heute wurde <b>niemand</b> hingerichtet." : `⚔️ <b>${esc(ps[day.exec.seat] ? ps[day.exec.seat].name : day.exec.name)}</b> wurde heute hingerichtet.`}
        <button class="btn sm" id="undoexec">rückgängig</button></div>`;
    } else if (v) {
      // Laufende Abstimmung: im Uhrzeigersinn ab dem Platz nach dem Nominierten.
      const order = [];
      for (let k = 1; k <= ps.length; k++) order.push((v.on + k) % ps.length);
      const count = validHands(order.filter(i => v.hands.includes(i))).reduce((c, i) => c + (ps[i].banshee ? 2 : 1), 0);
      body += `<div class="vote">
        <p><b>${esc(ps[v.by].name)}</b> nominiert <b>${esc(ps[v.on].name)}</b></p>
        <p class="small">${game.phoneVote && (game.online || game.test) ? "📱 Die Spieler heben die Hand auf dem Handy – du siehst es hier live und kannst trotzdem selbst antippen." : "Gehe im Uhrzeigersinn herum und tippe alle an, die die Hand heben."} Tote haben nur ihre eine Geisterstimme.</p>
        <div class="votelist">${order.map(i => {
          const s = ps[i];
          const canVote = s.alive || s.ghost;
          const up = v.hands.includes(i);
          const bc = butlerCheck(i, v.hands);
          const isMaster = (s.marks || []).includes("master") && ps.some(y => y.role === "butler");
          return `<button class="voter ${up ? "up" : ""} ${bc && bc.warn ? "warn" : ""} ${v.clock === i ? "clock" : ""}" data-hand="${i}" ${canVote ? "" : "disabled"}>
            <span>${up ? "✋" : "·"}</span><b>${esc(s.name)}</b>${s.alive ? "" : `<small>${s.ghost ? "👻 Geisterstimme" : "keine Stimme mehr"}</small>`}${bc ? `<small>${esc(bc.note)}</small>` : ""}${s.role === "zealot" && s.alive && ps.filter(y => y.alive).length >= 5 ? `<small>📢 Zelot – muss abstimmen</small>` : ""}${s.banshee ? `<small>😱 Banshee – zählt doppelt</small>` : ""}${isMaster ? `<small>🎩 Meister des Butlers</small>` : ""}</button>`;
        }).join("")}</div>
        <div class="votecount ${count >= votesNeeded() ? "ok" : ""}">${count} Stimmen · nötig ${votesNeeded()}${b && !b.tie ? ` · auf dem Block mit ${b.count}` : ""}</div>
        ${game.test && !v.botDone ? `<div class="row wrap"><button class="btn" id="botvote">🤖 Bots stimmen ab</button></div>` : ""}
        <div class="row wrap"><button class="btn primary" id="savevote">Abstimmung beenden</button><button class="btn" id="cancelvote">Abbrechen</button></div>
      </div>`;
    } else {
      const opt = (list, sel) => list.map(i => `<option value="${i}">${esc(ps[i].name)}${sel(i)}</option>`).join("");
      const all = ps.map((_, i) => i);
      body += `<div class="nomform">
        <label>Wer nominiert?<select id="nomby">${opt(all.filter(i => ps[i].alive || ps[i].banshee), i => nominatedBy.has(i) ? " (hat schon nominiert)" : "")}</select></label>
        <label>Wer wird nominiert?<select id="nomon">${opt(all, i => nominated.has(i) ? " (war schon nominiert)" : "")}</select></label>
        <button class="btn primary" id="startvote">🗳️ Abstimmung starten</button>
      </div>
      ${game.test ? `<div class="row wrap"><button class="btn" id="botnom">🤖 Ein Bot nominiert</button></div>
        <p class="small">Ein zufälliger Bot nominiert jemanden und alle Bots stimmen ab – Böse halten zusammen, Gute raten. Du zählst wie am Tisch mit und entscheidest am Ende.</p>` : ""}
      <p class="small">Regeln: Jeder <b>lebende</b> Spieler darf einmal pro Tag nominieren, jeder Spieler einmal pro Tag nominiert werden. Tote nominieren nicht.</p>`;
    }

    const noms = day.noms.map((n, k) => `<li class="${b && !b.tie && b === n ? "onblock" : ""}">
        <span>${esc(ps[n.by] ? ps[n.by].name : "?")} → <b>${esc(ps[n.on] ? ps[n.on].name : "?")}</b></span>
        ${(n.hands || []).length ? `<small class="nomhands">✋ ${n.hands.map(h => esc(ps[h] ? ps[h].name : "?")).join(", ")}</small>` : ""}
        <span class="nomcount">${n.count} / ${n.needed}${b && !b.tie && b === n ? " · auf dem Block" : ""}</span>
        ${day.exec ? "" : `<button class="btn sm" data-delnom="${k}" title="Nominierung löschen">✕</button>`}</li>`).join("");

    let blockLine = "Noch niemand auf dem Block.";
    if (b && b.tie) blockLine = `Gleichstand mit ${b.count} Stimmen – niemand ist auf dem Block.`;
    else if (b) blockLine = `Auf dem Block: <b>${esc(ps[b.on].name)}</b> mit ${b.count} Stimmen.`;

    const slayers = ps.map((x, i) => i).filter(i => ps[i].alive && (actingRole(ps[i]) === "slayer") && !(ps[i].role === "philosopher" ? ps[i].gainedUsed : ps[i].used));
    const amn = ps.map((x, i) => i).filter(i => ps[i].alive && ps[i].role === "amnesiac");
    const amnBtn = amn.length && !v ? `<div class="row wrap"><button class="btn" id="amngo">❓ Amnesiker rät${day.amn ? " <small>(heute schon ✔)</small>" : ""}</button></div>` : "";
    const jug = ps.map((x, i) => i).filter(i => ps[i].alive && actingRole(ps[i]) === "juggler");
    const jugBtn = jug.length && !v && game.nightNo === 1 ? `<div class="row wrap"><button class="btn" id="juggo">🤹 Jongleur rät Rollen${game.juggle ? ` <small>(${game.juggle.guesses.length} Tipps ✔)</small>` : ""}</button></div>` : "";
    const sav = ps.map((x, i) => i).filter(i => ps[i].alive && actingRole(ps[i]) === "savant");
    const savBtn = sav.length && !v ? `<div class="row wrap"><button class="btn" id="savantgo">🎓 Gelehrter besucht dich${day.savant ? " <small>(heute schon ✔)</small>" : ""}</button></div>` : "";
    const slayerBtn = amnBtn + jugBtn + savBtn + (slayers.length && !v ? `<div class="row wrap"><button class="btn" id="slayshot">🏹 Dämonenjäger schießt …</button></div>` : "");
    const execBtns = day.exec || v ? slayerBtn : slayerBtn + `<div class="row wrap">
        ${b && !b.tie ? `<button class="btn danger" id="execute">⚔️ ${esc(ps[b.on].name)} hinrichten</button>` : ""}
        <button class="btn" id="noexec">Niemand wird hingerichtet</button>
      </div>`;

    return `<section class="panel">
      <details class="daypanel" ${game.voteOpen !== false ? "open" : ""}>
        <summary><h2>⚖️ Nominieren &amp; Abstimmen</h2></summary>
        <p class="small">Nötig für die Hinrichtung: <b>${votesNeeded()}</b> Stimmen (Hälfte der Lebenden). ${blockLine}</p>
        ${ps.some(y => y.role === "vizier") ? `<p class="small">👳 Alle wissen: <b>${esc(ps.find(y => y.role === "vizier").name)}</b> ist der Wesir (kann tagsüber nicht sterben).</p>` : ""}
        ${game.online || game.test ? `<p class="small">📱 Abstimmen am Handy: <b>${game.phoneVote ? "an" : "aus"}</b> (⚙️ Einstellungen)</p>` : ""}
        ${game.nomReq && !game.vote ? `<div class="box nomreq">📨 <b>${esc(game.seats[game.nomReq.by].name)}</b> möchte <b>${esc(game.seats[game.nomReq.on].name)}</b> nominieren.
          <div class="row wrap"><button class="btn primary" id="nomok">✅ Zulassen</button><button class="btn" id="nomno">Ablehnen</button></div></div>` : ""}
        ${body}
        ${noms ? `<h3>Nominierungen heute</h3><ul class="nomlist">${noms}</ul>` : ""}
        ${exileHtml(day)}
        ${execBtns}
      </details>
    </section>`;
  }

  function bindDay() {
    const dp = $(".daypanel");
    if (!dp) return;
    dp.addEventListener("toggle", () => { if ((game.voteOpen !== false) === dp.open) return; game.voteOpen = dp.open; save(); });
    const day = today();
    $("#startvote") && $("#startvote").addEventListener("click", () => {
      const by = +$("#nomby").value, on = +$("#nomon").value;
      if (Number.isNaN(by) || Number.isNaN(on)) return;
      beginVote(by, on);
    });
    $("#nomok") && $("#nomok").addEventListener("click", () => { const r = game.nomReq; game.nomReq = null; if (r) beginVote(r.by, r.on); });
    $("#nomno") && $("#nomno").addEventListener("click", () => { const r = game.nomReq; game.nomReq = null; if (r) hist(`🚫 Nominierung ${game.seats[r.by].name} → ${game.seats[r.on].name} abgelehnt`, "day"); save(); renderSL(); });
    $("#pvtoggle") && $("#pvtoggle").addEventListener("change", e => { game.phoneVote = e.target.checked; save(); renderSL(); toast(game.phoneVote ? "📱 Spieler nominieren und stimmen jetzt am Handy ab" : "Abstimmen am Handy ist aus"); });
    $$("[data-hand]").forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.hand, h = game.vote.hands;
      game.vote.hands = h.includes(i) ? h.filter(x => x !== i) : [...h, i];
      save(); renderSL();
    }));
    $("#cancelvote") && $("#cancelvote").addEventListener("click", () => { botVoteRun++; game.vote = null; save(); renderSL(); });
    $("#botnom") && $("#botnom").addEventListener("click", botNominate);
    $("#slayshot") && $("#slayshot").addEventListener("click", slayerDialog);
    $("#savantgo") && $("#savantgo").addEventListener("click", savantDialog);
    $("#juggo") && $("#juggo").addEventListener("click", jugglerDialog);
    $("#amngo") && $("#amngo").addEventListener("click", amnesiacDialog);
    bindExile(day);
    $("#botvote") && $("#botvote").addEventListener("click", () => { $("#botvote").disabled = true; botVote(); });
    $("#savevote") && $("#savevote").addEventListener("click", () => {
      const v = game.vote;
      botVoteRun++;
      const hands = validHands(v.hands);
      const cnt = hands.reduce((c, i) => c + (game.seats[i].banshee ? 2 : 1), 0);
      // Tote, die abgestimmt haben, verbrauchen ihre Geisterstimme (die Banshee nicht).
      hands.forEach(i => { const s = game.seats[i]; if (!s.alive && !s.banshee) s.ghost = false; });
      day.noms.push({ by: v.by, on: v.on, count: cnt, needed: votesNeeded(), hands });
      hist(`🗳️ ${game.seats[v.by].name} nominiert ${game.seats[v.on].name}: ${cnt} Stimme(n)`, "day");
      game.vote = null;
      save(); renderSL();
    });
    $$("[data-delnom]").forEach(btn => btn.addEventListener("click", () => {
      if (!confirm("Diese Nominierung löschen? (Verbrauchte Geisterstimmen bitte selbst zurücksetzen.)")) return;
      day.noms.splice(+btn.dataset.delnom, 1);
      save(); renderSL();
    }));
    $("#execute") && $("#execute").addEventListener("click", () => {
      const b = block(day);
      const s = game.seats[b.on];
      const role = ROLE_BY_ID[s.role];
      let msg = `${s.name} hinrichten?`;
      if (s.role === "saint") msg += "\n\n⚠️ Das ist der HEILIGE – wird er hingerichtet, gewinnt Böse!";
      const da = game.seats.find(y => y.role === "devilsadvocate" && y.alive);
      const rule = !s.alive ? null : (s.marks || []).includes("survives") && da && !impaired(da)
        ? { dies: false, why: "⚖️ Advokat des Teufels – überlebt diese Hinrichtung" } : deathRule(s);
      if (rule) msg += `\n\n${rule.why}.`;
      else if (["pacifist", "tealady", "devilsadvocate"].some(id => game.seats.some(x => x.role === id)) || (s.marks || []).includes("survives"))
        msg += "\n\nHinweis: Eine Rolle im Spiel kann die Hinrichtung verhindern (z. B. Pazifist, Teedame, Advocatus Diaboli). Prüfe das, bevor du bestätigst.";
      if (!confirm(msg)) return;
      day.exec = { seat: b.on, name: s.name };
      hist(`⚔️ ${s.name} wurde hingerichtet (${role.ic} ${role.de})`, "day");
      swMsg = null;
      applyDeath(s, rule);
      if (game.seats[b.on].alive) day.exec.survived = true;
      saintCheck(s);
      // Prinzessin: hat sie am 1. Tag nominiert und wurde hingerichtet -> heute Nacht kein Dämonen-Tod
      const pr = game.seats[b.by];
      if (pr && pr.role === "princess" && pr.alive && !impaired(pr) && game.nightNo === 1 && !game.princessUsed) {
        game.princessUsed = true; game.princessBlock = game.nightNo + 1;
        hist(`👸 ${pr.name} (Prinzessin) hat nominiert und hinrichten lassen – der Dämon tötet heute Nacht nicht`, "day");
      }
      // Drahtzieher: Dämon hingerichtet -> noch ein Tag; danach verliert das Team des Hingerichteten
      if (game.mastermind && !game.mmResult && game.mastermind.day < game.nightNo) {
        game.mmResult = seatGood(s) ? "evil" : "good";
        hist(`🎭 Drahtzieher-Tag: ${s.name} wurde hingerichtet – ${seatGood(s) ? "Gut" : "Böse"} verliert`, "day");
      } else if (ROLE_BY_ID[s.role].t === "demon" && !s.alive && !game.seats.some(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon")) {
        const mm = game.seats.find(y => y.role === "mastermind" && y.alive && !impaired(y));
        if (mm) { game.mastermind = { day: game.nightNo }; hist(`🎭 Der Dämon wurde hingerichtet, aber der Drahtzieher lebt – es wird noch ein Tag gespielt`, "day"); swMsg = "🎭 Drahtzieher! Das Spiel geht noch einen Tag weiter – verrate es nicht."; }
      }
      save(); renderSL();
      if (s.role === "saint") toast(game.saintLoss ? "Der Heilige wurde hingerichtet – Böse gewinnt!" : "Der Heilige ist vergiftet/betrunken – nichts passiert");
      else if (swMsg) toast(swMsg);
      else if (rule && !rule.dies) toast(`${s.name} wurde hingerichtet, stirbt aber nicht (${role.de})`);
      else toast(`${s.name} wurde hingerichtet (${role.de})`);
    });
    $("#noexec") && $("#noexec").addEventListener("click", () => {
      day.exec = "none";
      hist("🕊️ Heute wurde niemand hingerichtet", "day");
      if (game.mastermind && !game.mmResult && game.mastermind.day < game.nightNo) { game.mmResult = "good"; hist("🎭 Drahtzieher-Tag ohne Hinrichtung – Gut gewinnt", "day"); }
      save(); renderSL();
      if (game.seats.some(s => s.role === "vortox" && s.alive)) toast("Achtung: Vortox im Spiel – ohne Hinrichtung gewinnt Böse!");
      else { const mc = mayorWinCheck(); if (mc && !mc.ok) toast(mc.why); }
    });
    $("#undoexec") && $("#undoexec").addEventListener("click", () => {
      if (day.exec && day.exec !== "none" && game.seats[day.exec.seat]) { const x = game.seats[day.exec.seat]; x.alive = true; x.zfake = false; swRevert(day.exec.seat); if (game.saintLoss === x.name) game.saintLoss = null; }
      day.exec = null;
      save(); renderSL();
    });
  }

  // Rolle oder Gesinnung eines Spielers während des Spiels ändern (Imp-Wechsel, Scharlachrote Frau, Grubenhexe …).
  function changeRole(i) {
    const s = game.seats[i];
    const pool = ROLES.filter(r => s.trav ? r.t === "traveller" : (inEd(r, game.edition) && r.t !== "traveller" && r.t !== "fabled"));
    openModal(`<h2>${esc(s.name)}</h2>
      <label class="field">Neue Rolle:
        <select id="newrole">${pool.map(r => `<option value="${r.id}" ${r.id === s.role ? "selected" : ""}>${esc(r.de)} (${TEAMS[r.t].name})</option>`).join("")}</select></label>
      <label class="field">Gesinnung:
        <select id="newalign">
          <option value="" ${s.align ? "" : "selected"}>Automatisch (nach Rolle)</option>
          <option value="g" ${s.align === "g" ? "selected" : ""}>Gut</option>
          <option value="e" ${s.align === "e" ? "selected" : ""}>Böse</option>
        </select></label>
      <p class="small">${game.online && s.pid ? "🌐 Der Spieler sieht seine neue Rolle automatisch auf seinem Handy." : "Zeig dem Spieler seine neue Rolle (Knopf unten) oder gib ihm unter „3 · Verteilen“ einen neuen QR-Code."}</p>
      <div class="row end"><button class="btn" id="showrole">📱 Dem Spieler zeigen</button><button class="btn primary" id="saverole">Speichern</button></div>`);
    $("#showrole").addEventListener("click", () => {
      const r = ROLE_BY_ID[$("#newrole").value];
      openModal(`<div class="nightshow pickshow"><p class="ns-label">${esc(s.name)}</p><h2>Du bist jetzt</h2>
        <div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div></div>
        <div class="row center"><button class="btn big" id="showdone">✓ Fertig</button></div>`, "full night");
      $("#showdone").addEventListener("click", () => { closeModal(); changeRole(i); });
    });
    $("#saverole").addEventListener("click", () => {
      if (s.role !== $("#newrole").value) hist(`🔁 ${s.name}: ${roleName(s.role)} → ${roleName($("#newrole").value)}`);
      s.role = $("#newrole").value;
      s.align = $("#newalign").value || (s.trav ? "g" : undefined);
      game.ignoreEnd = null;
      save(); closeModal(); renderSL();
    });
  }

  // =====================================================================
  //  MARKER, SITZKREIS, SPIELER-FENSTER
  // =====================================================================
  // Marker-Daten stehen in roles.js (GENERIC_MARKERS, ROLE_MARKERS).
  // Rollen-Marker, die zu den Rollen im Spiel passen (inkl. Philosophen-Wahl und Säufer-Rolle)
  function markersInPlay() {
    const ids = new Set();
    game.seats.forEach(x => { ids.add(x.role); ids.add(shownRole(x.role)); if (x.gained) ids.add(x.gained); });
    return Object.entries(ROLE_MARKERS).filter(([r]) => ids.has(r)).flatMap(([r, list]) => list.map(m => ({ ...m, role: r })));
  }
  // Erklärungen für die anderen Zustände im Spieler-Fenster
  const STATUS_HELP = {
    alive: "Tote Spieler bleiben im Spiel: Sie reden mit, dürfen aber nicht nominieren und haben ihre Fähigkeit verloren (Ausnahmen: z. B. Rabenhüter, Mondkind).",
    ghost: "Jeder Tote hat genau eine Stimme für den Rest des Spiels. Hat er sie benutzt, ist sie weg. Der Abstimmungs-Helfer verbraucht sie automatisch.",
    mad: "„Verrückt“ (Cerenovus): Der Spieler muss morgen überzeugend behaupten, die gezeigte Rolle zu sein. Tut er es nicht, darfst du ihn hinrichten lassen.",
    used: "Fähigkeiten „einmal pro Spiel“: Ist sie benutzt, wird der Nacht-Schritt grau und der Spieler nicht mehr geweckt.",
    note: "Freie Notiz nur für dich, z. B. „Meister des Butlers“ oder „hat Jungfrau behauptet“."
  };
  const marksHtml = s => (s.marks || []).length
    ? `<span class="marks">${s.marks.map(m => { const k = markerByKey(m); return k ? `<span title="${esc(k.l)}">${k.i}</span>` : ""; }).join("")}</span>` : "";

  function circleHtml() {
    const ps = game.seats;
    const n = ps.length;
    const size = n <= 8 ? "lg" : n <= 15 ? "md" : "sm";
    // Plättchen so groß wie der Platz zwischen zwei Nachbarn erlaubt (in % der Kreisbreite)
    const d = Math.min(25, 0.92 * 2 * 41 * Math.sin(Math.PI / n)).toFixed(1);
    const tokens = ps.map((s, i) => {
      const a = (i / n) * 2 * Math.PI;
      const x = 50 + 41 * Math.sin(a), y = 50 - 41 * Math.cos(a);
      const r = ROLE_BY_ID[s.role];
      return `<button class="token t-${r.t} ${s.alive ? "" : "dead"}" style="left:${x}%;top:${y}%" data-seatmodal="${i}">
        <span class="tk-no">${i + 1}</span>
        <span class="tk-name">${esc(String(s.name).replace(/^🤖\s*/, ""))}</span>
        <span class="tk-ic">${r.ic}</span>
        <span class="tk-role">${esc(r.de)}</span>
        <span class="tk-marks">${s.zfake ? "🧟" : ""}${s.alive ? "" : s.ghost ? "💀👻" : "💀"}${(s.marks || []).map(m => (markerByKey(m) || {}).i || "").join("")}${s.madness && s.madness.night === game.nightNo ? "😵" : ""}${s.used ? "✔" : ""}</span>
      </button>`;
    }).join("");
    const alive = ps.filter(s => s.alive && !s.trav).length;
    return `<div class="circle size-${size}" style="--d:${d}">
      <div class="circle-mid"><b>🌙 Nacht ${game.nightNo}</b><span>${alive} leben</span><span>${votesNeeded()} Stimmen nötig</span><small>Spieler antippen</small></div>
      ${tokens}
    </div>`;
  }

  // Alles zu einem Spieler in einem Fenster (aus Kreis oder Liste)
  const helpBtn = key => `<button class="helpbtn" data-help="${key}" aria-label="Erklärung">ⓘ</button>`;
  const markerChip = (s, m) => {
    const on = (s.marks || []).includes(m.k), kept = (s.keep || []).includes(m.k);
    return `<span class="mkchip"><button class="chip ${on ? "on" : ""}" data-mk="${m.k}">${m.i} ${esc(m.l)}${m.n || (m.t && !kept) ? " 🌙" : ""}</button>${m.t && on ? `<button class="chip pin ${kept ? "on" : ""}" data-keep="${m.k}" title="${kept ? "bleibt dauerhaft" : "verschwindet nächste Nacht – antippen zum Festheften"}">📌</button>` : ""}${helpBtn(m.k)}</span>`;
  };

  function amnSelect(i) {
    const s = game.seats[i], cur = s.amn || {};
    const cats = [...new Set(AMNESIAC_IDEAS.map(x => x.cat))];
    return `<div class="box amnbox"><h4>❓ Geheime Fähigkeit des Amnesikers</h4>
      <select id="amnsel"><option value="">– Idee wählen –</option>${cats.map(c => `<optgroup label="${esc(c)}">${AMNESIAC_IDEAS.filter(x => x.cat === c).map(x => `<option value="${x.k}" ${cur.k === x.k ? "selected" : ""}>${esc(x.text)}${x.like ? ` (wie ${esc(roleName(x.like))})` : ""}</option>`).join("")}</optgroup>`).join("")}<option value="_own" ${cur.k === "_own" ? "selected" : ""}>✏️ Eigene Fähigkeit …</option></select>
      <textarea id="amntext" rows="2" placeholder="Eigene Fähigkeit beschreiben" ${cur.k === "_own" ? "" : "hidden"}>${cur.k === "_own" ? esc(cur.text) : ""}</textarea>
      <div class="row wrap"><button class="btn sm" id="amnrand">🎲 Würfeln</button><button class="btn sm primary" id="amnsave">Speichern</button>${cur.known ? `<span class="small okmsg">✅ erraten</span>` : ""}</div>
      <p class="small">${cur.like ? `Nachts wird er wie <b>${esc(roleName(cur.like))}</b> geweckt – mit Aufgabe und Info-Vorschlag. Sein Handy verrät die Rolle nicht.` : "Bei eigener Fähigkeit weckst du ihn im Schritt „Amnesiker“."}</p></div>`;
  }
  function setAmn(s, k, text) {
    const idea = amnIdea(k);
    s.amn = idea ? { k, text: idea.text, like: idea.like || null, pick: !!idea.pick, known: s.amn && s.amn.k === k ? s.amn.known : false } : { k: "_own", text: text || "", like: null, pick: true, known: false };
  }

  function seatModal(i) {
    const s = game.seats[i];
    if (!s) return;
    const shown = shownRole(s.role);
    const cer = s.alive && game.seats.some(x => x.role === "cerenovus");
    openModal(`<h2>${i + 1}. ${esc(s.name)}</h2>
      <p>${roleChip(s.role, s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : "")}
        ${shown !== s.role ? `<span class="small">(glaubt: ${esc(roleName(shown))})</span>` : ""}</p>
      <div class="row wrap">
        <span class="hint-pair"><button class="btn" data-m="alive">${s.alive ? "❤️ lebt → tot setzen" : "💀 tot → wiederbeleben"}</button>${helpBtn("s:alive")}</span>
        ${s.alive ? "" : `<span class="hint-pair"><button class="btn" data-m="ghost">${s.ghost ? "👻 Geisterstimme frei" : "🚫 Stimme verbraucht"}</button>${helpBtn("s:ghost")}</span>`}
      </div>
      <div class="mkhelp hidden" id="mkhelp"></div>
      <h3>Marker</h3>
      <p class="small">Tippe ⓘ für eine Erklärung. Marker mit 🌙 verschwinden in der nächsten Nacht von selbst.</p>
      <div class="mkgrid">${GENERIC_MARKERS.map(m => markerChip(s, m)).join("")}</div>
      ${markersInPlay().length ? `<h4 class="mk-sub">Marker der Rollen im Spiel</h4><div class="mkgrid">${markersInPlay().map(m => markerChip(s, m)).join("")}</div>` : ""}
      ${pidSelect(i)}
      <label class="field">Notiz ${helpBtn("s:note")}: <input id="m-note" value="${esc(s.note || "")}" placeholder="z. B. Meister des Butlers"></label>
      <div class="row wrap">
        <button class="btn" data-m="info">ℹ️ Rolle</button>
        ${isBot(s) || s.pid ? `<button class="btn" data-m="phone">${isBot(s) ? "🤖" : "📱"} Handy ansehen</button>` : ""}
        ${s.grim ? `<button class="btn" data-m="spyhide">🙈 Grimoire vom Handy entfernen</button>` : ""}
        <button class="btn" data-m="change">🔁 Rolle ändern</button>
        ${cer ? `<span class="hint-pair"><button class="btn" data-m="mad">😵 Wahnsinn</button>${helpBtn("s:mad")}</span>` : ""}
        ${ONCE_PER_GAME.includes(s.role) && s.role !== "philosopher" ? `<span class="hint-pair"><button class="btn ${s.used ? "used" : ""}" data-m="used">${s.used ? "✔ Fähigkeit benutzt" : "○ Fähigkeit frei"}</button>${helpBtn("s:used")}</span>` : ""}
      </div>
      ${s.role === "philosopher" ? philoSelect(i) : ""}
      ${s.role === "amnesiac" ? amnSelect(i) : ""}
      <div class="row end"><button class="btn primary" data-m="close">Fertig</button></div>`);
    const root = $("#modal-content");
    const again = () => { save(); renderSL(); seatModal(i); };
    root.querySelectorAll("[data-mk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.mk, m = s.marks || [];
      s.marks = m.includes(k) ? m.filter(x => x !== k) : [...m, k];
      if (!s.marks.includes(k)) s.keep = (s.keep || []).filter(x => x !== k);
      markHist(s, k, s.marks.includes(k));
      again();
    }));
    root.querySelectorAll("[data-keep]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.keep, kp = s.keep || [];
      s.keep = kp.includes(k) ? kp.filter(x => x !== k) : [...kp, k];
      toast(s.keep.includes(k) ? "📌 Bleibt dauerhaft, bis du es entfernst" : "🌙 Verschwindet in der nächsten Nacht");
      again();
    }));
    root.querySelector("#m-note").addEventListener("input", e => { s.note = e.target.value; save(); });
    if (root.querySelector("#amnsel")) {
      root.querySelector("#amnsel").addEventListener("change", e => { root.querySelector("#amntext").hidden = e.target.value !== "_own"; });
      root.querySelector("#amnrand").addEventListener("click", () => { const inPlay = new Set(game.seats.map(x => x.role)); const pool = AMNESIAC_IDEAS.filter(x => !x.like || !inPlay.has(x.like)); setAmn(s, pool[randInt(pool.length)].k); hist(`❓ ${s.name} (Amnesiker) hat eine neue geheime Fähigkeit`); again(); });
      root.querySelector("#amnsave").addEventListener("click", () => { const v = root.querySelector("#amnsel").value; if (!v) return; setAmn(s, v, root.querySelector("#amntext").value.trim()); hist(`❓ Geheime Fähigkeit von ${s.name}: ${s.amn.text}`); again(); toast("❓ Fähigkeit gespeichert"); });
    }
    // ⓘ-Erklärungen
    root.querySelectorAll("[data-help]").forEach(b => b.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const key = b.dataset.help, box = root.querySelector("#mkhelp");
      let title, text;
      if (key.startsWith("s:")) { title = { alive: "Lebt / tot", ghost: "Geisterstimme", mad: "Wahnsinn", used: "Fähigkeit benutzt", note: "Notiz" }[key.slice(2)]; text = STATUS_HELP[key.slice(2)]; }
      else { const m = markerByKey(key); title = `${m.i} ${m.l}${m.role ? ` (${roleName(m.role)})` : ""}`; text = m.d + (m.n ? " 🌙 Verschwindet in der nächsten Nacht." : ""); }
      const same = !box.classList.contains("hidden") && box.dataset.key === key;
      box.dataset.key = key;
      box.innerHTML = `<b>${esc(title)}</b><p>${esc(text)}</p>`;
      box.classList.toggle("hidden", same);
      if (!same) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    root.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.m;
      if (a === "alive") { s.alive = !s.alive; if (s.alive) { s.ghost = true; s.zfake = false; } histDeath(s); if (s.alive) swRevert(i); else swCheck(s); again(); }
      else if (a === "ghost") { s.ghost = !s.ghost; again(); }
      else if (a === "used") { s.used = !s.used; delete s.usedNight; again(); }
      else if (a === "info") openModal(roleDetail(ROLE_BY_ID[s.role], true));
      else if (a === "phone") showBotPhone(i);
      else if (a === "spyhide") { closeModal(); spyGrimHide(); }
      else if (a === "change") changeRole(i);
      else if (a === "mad") madnessDialog(i);
      else { closeModal(); renderSL(); }
    }));
    root.querySelectorAll("[data-philo]").forEach(sel => sel.addEventListener("change", () => { setPhilo(i, sel.value); seatModal(i); }));
    root.querySelectorAll("[data-pid]").forEach(sel => sel.addEventListener("change", () => { setSeatPid(i, sel.value); renderSL(); seatModal(i); }));
  }

  // =====================================================================
  //  TIMER FÜR DIE TAGESPHASE
  // =====================================================================
  const fmtTime = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  // Restzeit eines Timer-Zustands { end, left, running } in Millisekunden (null = kein Timer)
  const timerLeft = t => !t ? null : t.running ? t.end - Date.now() : (t.left || 0);

  function timerBox() {
    const t = game.timer;
    const left = timerLeft(t);
    return `<div class="box timerbox">
      <div class="tb-row"><h4>${t && t.label ? esc(t.label) : "⏱️ Timer"}</h4><span class="timerval big ${left !== null && left <= 0 ? "over" : ""}">${left === null ? "0:00" : fmtTime(left)}</span></div>
      ${game.phase === "day" ? `<div class="chips tphases">${Object.entries(dayPhases()).map(([k, ph]) => `<button class="chip ${t && t.phase === k ? "on" : ""}" data-tphase="${k}">${ph.ic} ${esc(ph.l)} · ${ph.min} min</button>`).join("")}</div>
      <p class="small">Empfohlene Zeiten für ${alivePlayers()} Lebende an Tag ${game.nightNo} – sie werden jeden Tag etwas kürzer.</p>` : ""}
      <div class="chips">${[2, 3, 5, 8, 10].map(m => `<button class="chip" data-tmin="${m}">${m} min</button>`).join("")}</div>
      <div class="row wrap">
        ${t && t.running ? `<button class="btn" id="tpause">⏸️ Pause</button>` : t && t.left > 0 ? `<button class="btn primary" id="tstart">▶️ Weiter</button>` : ""}
        ${t && (t.running || t.left > 0) ? `<button class="btn" id="tplus">+1 min</button>` : ""}
        ${t ? `<button class="btn" id="treset">⏹️ Stopp</button>` : ""}
      </div>
      ${game.online ? `<p class="small">🌐 Die Spieler sehen den Timer auf ihrem Handy.</p>` : ""}
    </div>`;
  }
  // Tagesphasen mit empfohlener Dauer (je mehr Lebende, desto länger; jeden Tag etwas kürzer)
  const alivePlayers = () => game.seats.filter(x => x.alive && !x.trav).length;
  function dayPhases() {
    const a = alivePlayers(), d = Math.max(0, game.nightNo - 1);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
    return {
      private: { ic: "🤫", l: "Private Gespräche", min: cl(a * 0.6 - d * 0.5, 2, 8), end: "Private Gespräche vorbei – alle zurück an den Tisch!" },
      public: { ic: "🗣️", l: "Offene Runde", min: cl(a * 0.35, 2, 5), end: "Offene Runde vorbei – jetzt wird nominiert!" },
      noms: { ic: "⚖️", l: "Nominierungen", min: cl(a * 0.5, 3, 8), end: "Zeit für Nominierungen ist um – die Sonne geht unter!" }
    };
  }
  function bindTimer() {
    $$("[data-tmin]").forEach(b => b.addEventListener("click", () => {
      game.timer = { running: true, end: Date.now() + +b.dataset.tmin * 60000, left: 0, rang: false };
      unlockAudio(); save(); renderSL();
    }));
    $$("[data-tphase]").forEach(b => b.addEventListener("click", () => {
      const ph = dayPhases()[b.dataset.tphase];
      game.timer = { running: true, end: Date.now() + ph.min * 60000, left: 0, rang: false, phase: b.dataset.tphase, label: `${ph.ic} ${ph.l}`, endMsg: ph.end };
      unlockAudio(); save(); renderSL();
    }));
    $("#tpause") && $("#tpause").addEventListener("click", () => { game.timer = { ...game.timer, running: false, left: timerLeft(game.timer), rang: false }; save(); renderSL(); });
    $("#tstart") && $("#tstart").addEventListener("click", () => { game.timer = { ...game.timer, running: true, end: Date.now() + game.timer.left, left: 0, rang: false }; unlockAudio(); save(); renderSL(); });
    $("#tplus") && $("#tplus").addEventListener("click", () => {
      const t = game.timer;
      if (t.running) t.end = Math.max(t.end, Date.now()) + 60000; else t.left = (t.left || 0) + 60000;
      t.rang = false; save(); renderSL();
    });
    $("#treset") && $("#treset").addEventListener("click", () => { game.timer = null; save(); renderSL(); });
  }

  // Ton am Ende (Browser erlauben Ton erst nach einer Berührung)
  let audioCtx = null;
  function unlockAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { /* kein Ton */ }
  }
  function beep() {
    if (!audioCtx) return;
    try {
      [0, 0.35, 0.7].forEach(off => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.25, audioCtx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + off + 0.3);
        o.start(audioCtx.currentTime + off); o.stop(audioCtx.currentTime + off + 0.3);
      });
    } catch (e) { /* kein Ton */ }
  }
  document.addEventListener("click", unlockAudio, { once: true });

  // Läuft jede Sekunde: Anzeigen aktualisieren, kleine Uhr oben einblenden, am Ende Alarm.
  let lastRangKey = "";
  function tickTimer() {
    const host = game.timer && (game.timer.running || game.timer.left > 0) ? game.timer : null;
    const pub = !host && pubState && pubState.timer && (pubState.timer.running || pubState.timer.left > 0) ? pubState.timer : null;
    const t = host || pub;
    const left = timerLeft(t);
    $$(".timerval").forEach(el => { el.textContent = left === null ? "0:00" : fmtTime(left); el.classList.toggle("over", left !== null && left <= 0); });
    let chip = $("#timerchip");
    if (t) {
      if (!chip) {
        chip = document.createElement("button");
        chip.id = "timerchip";
        chip.addEventListener("click", () => { if (host) location.hash = "#/sl"; });
        document.body.appendChild(chip);
      }
      chip.textContent = (t.running ? "" : "⏸️ ") + (t.label ? t.label + " " : t.running ? "⏱️ " : "") + fmtTime(left);
      chip.classList.toggle("over", left <= 0);
    } else if (chip) chip.remove();
    // Alarm genau einmal pro Ablauf
    if (t && t.running && left <= 0 && left > -10000) {
      const key = String(t.end);
      if (lastRangKey !== key) {
        lastRangKey = key;
        beep();
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
        notice(`⏰ ${t.endMsg || "Die Zeit ist um!"}`);
      }
    }
  }
  setInterval(tickTimer, 1000);

  // =====================================================================
  //  NOTIZEN DER SPIELER (bleiben nur auf dem eigenen Handy)
  // =====================================================================
  // Vertrauen je Mitspieler (zum Antippen)
  const TRUST = [["good", "😇", "vertraue ich"], ["unsure", "❓", "unsicher"], ["evil", "😈", "verdächtig"]];

  // Rollen, die ein Mitspieler behaupten kann: die des eigenen Spiels (bzw. der eigenen Rollenliste)
  function claimPool() {
    const mine = store.get("botc.myrole", null);
    const role = mine && ROLE_BY_ID[mine.r];
    const sc = gameScript();
    const ed = sc ? "custom" : role && EDITIONS[role.ed] && !EDITIONS[role.ed].extra ? role.ed : null;
    return ROLES.filter(r => !["fabled", "traveller"].includes(r.t) && (ed ? inEd(r, ed, sc) : true));
  }

  function notesHtml() {
    const notes = store.get("botc.notes", {});
    // Online: Mitspieler aus dem Raum; offline: selbst eingetragene Namen
    const online = (pubState && pubState.seats) || [];
    const me = (store.get("botc.myrole", null) || {}).s;
    const seats = online.length ? online.map((x, k) => ({ n: x.n, a: x.a, k })).filter(x => x.k !== me) : (notes.names || []).map(n => ({ n, a: true, own: true }));
    const pool = claimPool();
    const groups = ["townsfolk", "outsider", "minion", "demon"].map(t => [t, pool.filter(r => r.t === t)]).filter(([, l]) => l.length);
    const roleSel = (name, key, ph) => `<select data-pclaim="${esc(name)}" data-pkey="${key}"><option value="">${ph}</option>${groups.map(([t, l]) =>
      `<optgroup label="${TEAMS[t].plural}">${l.map(r => `<option value="${r.id}" ${notes[key + ":" + name] === r.id ? "selected" : ""}>${r.ic} ${esc(r.de)}</option>`).join("")}</optgroup>`).join("")}</select>`;
    const claimSel = name => `<div class="nc-sels">${roleSel(name, "c", "🗨️ behauptet …")}${roleSel(name, "s", "🤔 ist wirklich …?")}</div>`;
    // Tischansicht: alle Plätze im Kreis mit Vertrauen, Behauptung und Vermutung
    const tableSeats = online.length ? online.map((x, k) => ({ n: x.n, a: x.a, me: k === me })) : (notes.names || []).map(n => ({ n, a: true }));
    const circle = () => {
      const n = tableSeats.length;
      if (n < 3) return `<p class="small">Für die Tischansicht braucht es mindestens 3 Spieler.</p>`;
      const d = Math.min(25, 0.92 * 2 * 41 * Math.sin(Math.PI / n)).toFixed(1);
      return `<div class="circle ncircle size-${n <= 8 ? "lg" : n <= 15 ? "md" : "sm"}" style="--d:${d}">
        <div class="circle-mid"><b>🧩 Mein Tisch</b><small>Antippen: zur Notiz</small></div>
        ${tableSeats.map((x, i) => {
          const a = (i / n) * 2 * Math.PI, t = notes["t:" + x.n], c = ROLE_BY_ID[notes["c:" + x.n]], g = ROLE_BY_ID[notes["s:" + x.n]];
          return `<button class="token ${g ? "t-" + g.t : c ? "t-" + c.t : ""} ${x.a ? "" : "dead"} ${t ? "tr-" + t : ""} ${x.me ? "me" : ""}" style="left:${50 + 41 * Math.sin(a)}%;top:${50 - 41 * Math.cos(a)}%" ${x.me ? "" : `data-ncard="${esc(x.n)}"`}>
            <span class="tk-name">${esc(String(x.n).replace(/^🤖\s*/, ""))}</span>
            <span class="tk-ic">${x.me ? "⭐" : g ? g.ic : c ? c.ic : t === "evil" ? "😈" : t === "good" ? "😇" : "❔"}</span>
            <span class="tk-role">${x.me ? "Du" : g ? "≈ " + esc(g.de) : c ? "„" + esc(c.de) + "“" : ""}</span>
            <span class="tk-marks">${x.a ? "" : "💀"}${!x.me && t ? (TRUST.find(z => z[0] === t) || [])[1] : ""}</span></button>`;
        }).join("")}</div>`;
    };
    const tview = store.get("botc.notesview", "list");
    const counts = { good: 0, unsure: 0, evil: 0 };
    seats.forEach(x => { const t = notes["t:" + x.n]; if (counts[t] !== undefined) counts[t]++; });
    return `<details class="panel notes" ${notesOpen ? "open" : ""}>
      <summary><h3>📝 Meine Notizen</h3>${seats.length ? `<span class="small"> 😇${counts.good} ❓${counts.unsure} 😈${counts.evil}</span>` : ""}</summary>
      <p class="small">Nur auf deinem Handy gespeichert – niemand sonst sieht sie.</p>
      ${seats.length ? `<div class="chips viewtoggle"><button class="chip ${tview === "circle" ? "" : "on"}" data-nview="list">☰ Liste</button><button class="chip ${tview === "circle" ? "on" : ""}" data-nview="circle">◯ Tischansicht</button></div>` : ""}
      ${seats.length && tview === "circle" ? circle() : ""}
      ${seats.length ? `<div class="notelist">${seats.map(x => {
        const t = notes["t:" + x.n], c = ROLE_BY_ID[notes["c:" + x.n]];
        return `<div class="notecard ${x.a ? "" : "dead"} ${t ? "tr-" + t : ""}" data-card="${esc(x.n)}">
          <div class="nc-top"><b class="nc-name">${c ? c.ic + " " : ""}${esc(x.n)}${x.a ? "" : " 💀"}</b>
            <span class="trust">${TRUST.map(([k, ic, label]) => `<button class="trustbtn ${t === k ? "on" : ""}" data-ptrust="${esc(x.n)}" data-v="${k}" title="${label}" aria-label="${label}">${ic}</button>`).join("")}</span>
            ${x.own ? `<button class="trustbtn del" data-pdel="${esc(x.n)}" aria-label="entfernen">✕</button>` : ""}</div>
          ${claimSel(x.n)}
          <input data-pnote="${esc(x.n)}" value="${esc(notes["p:" + x.n] || "")}" placeholder="Notiz zu ${esc(x.n)} …">
        </div>`;
      }).join("")}</div>` : ""}
      ${online.length ? "" : `<div class="addname"><input id="newname" placeholder="Mitspieler hinzufügen (Name)"><button class="btn sm" id="addname">+</button></div>`}
      <textarea id="gnote" rows="4" placeholder="Allgemeine Notizen: Was hast du erfahren? Wer passt nicht zusammen?">${esc(notes.general || "")}</textarea>
      <div class="row end"><button class="btn sm danger" id="clearnotes">Notizen löschen</button></div>
    </details>`;
  }
  let notesOpen = false;
  function rerenderNotes() {
    const el = $(".notes");
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = notesHtml();
    el.replaceWith(tmp.firstElementChild);
    bindNotes();
  }
  function bindNotes() {
    const d = $(".notes");
    if (!d) return;
    d.addEventListener("toggle", () => { notesOpen = d.open; });
    const get = () => store.get("botc.notes", {});
    const put = (k, v) => { const n = get(); if (v === null || v === "") delete n[k]; else n[k] = v; store.set("botc.notes", n); };
    $("#gnote").addEventListener("input", e => put("general", e.target.value));
    $$("[data-pnote]").forEach(inp => inp.addEventListener("input", () => put("p:" + inp.dataset.pnote, inp.value)));
    $$("[data-pclaim]").forEach(sel => sel.addEventListener("change", () => { put((sel.dataset.pkey || "c") + ":" + sel.dataset.pclaim, sel.value); rerenderNotes(); }));
    $$("[data-nview]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); store.set("botc.notesview", b.dataset.nview); rerenderNotes(); }));
    $$("[data-ncard]").forEach(b => b.addEventListener("click", e => {
      e.preventDefault();
      const card = $$("[data-card]").find(c => c.dataset.card === b.dataset.ncard);
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1200); }
    }));
    $$("[data-ptrust]").forEach(btn => btn.addEventListener("click", e => {
      e.preventDefault();
      const k = "t:" + btn.dataset.ptrust;
      put(k, get()[k] === btn.dataset.v ? null : btn.dataset.v);
      rerenderNotes();
    }));
    const add = () => {
      const v = $("#newname").value.trim();
      if (!v) return;
      const n = get();
      n.names = [...new Set([...(n.names || []), v])];
      store.set("botc.notes", n);
      rerenderNotes();
      const inp = $("#newname"); if (inp) inp.focus();
    };
    $("#addname") && $("#addname").addEventListener("click", add);
    $("#newname") && $("#newname").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    $$("[data-pdel]").forEach(btn => btn.addEventListener("click", () => {
      const n = get(), name = btn.dataset.pdel;
      n.names = (n.names || []).filter(x => x !== name);
      ["t:", "c:", "p:"].forEach(pre => delete n[pre + name]);
      store.set("botc.notes", n);
      rerenderNotes();
    }));
    $("#clearnotes").addEventListener("click", () => { if (confirm("Alle Notizen löschen?")) { store.del("botc.notes"); renderPlayer(); } });
  }

  // =====================================================================
  //  SPIELVERLAUF
  // =====================================================================
  function hist(text, ph) {
    game.history = [...(game.history || []), { n: game.nightNo || 1, ph: ph || game.phase || "night", t: text, at: Date.now() }].slice(-200);
  }
  // Wichtige Zustände im Spielverlauf festhalten (Gift, Trunkenheit, Schutz)
  const MARK_HIST = { poison: ["🧪", "ist vergiftet", "ist nicht mehr vergiftet"], drunk: ["🍺", "ist betrunken", "ist nicht mehr betrunken"], protect: ["🛡️", "ist geschützt", null] };
  function markHist(x, k, on, by) {
    const h = MARK_HIST[k];
    if (!h || (!on && !h[2])) return;
    hist(`${h[0]} ${x.name} ${on ? h[1] : h[2]}${on && by ? ` (${by})` : ""}`);
  }
  // Für den Mathematiker: Fähigkeiten, die wegen einer anderen Rolle nicht normal gewirkt haben
  function abn(x, text) {
    if (!x) return;
    game.abnLog = [...(game.abnLog || []), { at: Date.now(), name: x.name, text }].slice(-60);
  }
  function histDeath(x) {
    const r = ROLE_BY_ID[x.role];
    hist(x.alive ? `✨ ${x.name} lebt wieder` : `💀 ${x.name} ist gestorben (${r.ic} ${r.de})`);
    const last = game.history[game.history.length - 1];
    if (last) last[x.alive ? "alive" : "dead"] = x.name;
  }
  function historyHtml(h) {
    if (!h || !h.length) return "";
    const groups = [];
    h.forEach(e => {
      const key = `${e.n}-${e.ph}`;
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { g = { key, n: e.n, ph: e.ph, items: [] }; groups.push(g); }
      g.items.push(e.t);
    });
    return `<details class="history" open><summary><h3>📜 Spielverlauf</h3></summary>
      ${groups.map(g => `<div class="hgroup ${g.ph}"><div class="hhead">${g.ph === "day" ? `☀️ Tag ${g.n}` : `🌙 Nacht ${g.n}`}</div>
        <ul>${g.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
    </details>`;
  }

  // =====================================================================
  //  STATISTIK (auf dem Handy des Spielleiters)
  // =====================================================================
  function recordStats() {
    if (game.statsId || !game.winner) return;
    const id = Date.now();
    const entry = { id, d: new Date().toISOString().slice(0, 10), ed: game.edition, w: game.winner.team,
      ps: game.seats.map(x => ({ n: x.name, r: x.role, g: seatGood(x) })) };
    store.set("botc.stats", [...(store.get("botc.stats", []) || []), entry].slice(-500));
    game.statsId = id;
  }
  function unrecordStats() {
    if (!game.statsId) return;
    store.set("botc.stats", (store.get("botc.stats", []) || []).filter(e => e.id !== game.statsId));
    game.statsId = null;
  }
  function statsHtml() {
    const all = store.get("botc.stats", []) || [];
    if (!all.length) return `<section class="panel muted"><h3>📊 Statistik</h3><p class="small">Noch keine beendeten Spiele. Nach jedem Spiel („Sieg verkünden“) wird hier mitgezählt.</p></section>`;
    const good = all.filter(e => e.w === "good").length;
    const pl = {};
    all.forEach(e => e.ps.forEach(x => {
      const k = x.n.trim();
      const o = pl[k] = pl[k] || { n: k, games: 0, wins: 0, good: 0, roles: {} };
      o.games++;
      if (x.g === (e.w === "good")) o.wins++;
      if (x.g) o.good++;
      o.roles[x.r] = (o.roles[x.r] || 0) + 1;
    }));
    const rows = Object.values(pl).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
    const top = o => Object.entries(o.roles).sort((a, b) => b[1] - a[1])[0];
    const pct = (a, b) => b ? Math.round(a / b * 100) + " %" : "–";
    return `<section class="panel stats"><details><summary><h3>📊 Statistik (${all.length} Spiel${all.length === 1 ? "" : "e"})</h3></summary>
      <div class="statbar"><span class="sg" style="flex:${good || 0.001}">😇 Gut ${good}</span><span class="se" style="flex:${all.length - good || 0.001}">😈 Böse ${all.length - good}</span></div>
      <table class="stattable"><thead><tr><th>Spieler</th><th>Spiele</th><th>Siege</th><th>Quote</th><th>Böse</th><th>oft</th></tr></thead>
      <tbody>${rows.map(o => { const t = top(o); return `<tr><td>${esc(o.n)}</td><td>${o.games}</td><td>${o.wins}</td><td>${pct(o.wins, o.games)}</td><td>${o.games - o.good}×</td><td title="${esc(roleName(t[0]))}">${ROLE_BY_ID[t[0]] ? ROLE_BY_ID[t[0]].ic : ""}</td></tr>`; }).join("")}</tbody></table>
      <p class="small">Gespeichert nur auf diesem Handy. Gleiche Namen werden zusammengezählt.</p>
      <div class="row end"><button class="btn sm danger" id="statsreset">Statistik löschen</button></div>
    </details></section>`;
  }

  // =====================================================================
  //  STIMMUNG: Tag/Nacht-Farben und leise Musik
  // =====================================================================
  // Phase für das Aussehen: Spielleiter nimmt sein Spiel, Spieler den Stand aus dem Online-Spiel
  function currentPhase() {
    if (game.seats.length && game.step === "grim") return game.phase || "night";
    if (store.get("botc.online", null) && pubState && pubState.started) return pubState.phase || "night";
    return "night";
  }
  function applyPhase() {
    const ph = currentPhase();
    if (document.body.dataset.phase !== ph) document.body.dataset.phase = ph;
    Mood.setPhase(ph);
  }

  // Leise, selbst erzeugte Klänge (keine Audiodateien nötig)
  const Mood = (() => {
    // Erzeugte Hintergrundmusik: Akkordfolge als weicher Klangteppich + zufällige Harfen-Melodie + Echo.
    // Nacht: Moll, langsam und düster. Tag: Dur, heller und etwas schneller. Alles im Bereich von Handy-Lautsprechern.
    const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI-Note -> Hz
    const STYLE = {
      night: { bpm: 54, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], // Am F Dm E
        scale: [69, 72, 74, 76, 79, 81, 84], prob: 0.45, wave: "sine" },
      day: { bpm: 76, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
        scale: [72, 74, 76, 79, 81, 84, 86, 88], prob: 0.7, wave: "triangle" }
    };
    let ctx = null, master = null, echo = null, timer = null, phase = null;
    let nextBeat = 0, beat = 0, pad = [], last = 3;
    const api = { on: false };

    function pluck(f, t, vol, wave) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 2.4);
      o.connect(g); g.connect(master); g.connect(echo);
      o.start(t); o.stop(t + 2.5);
    }
    function padChord(notes, t, dur) {
      pad.forEach(v => { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value || 0.0001, t); v.g.gain.linearRampToValueAtTime(0, t + 2); v.o.stop(t + 2.1); });
      pad = notes.map((n, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = N(n); o.detune.value = (k - 1) * 6;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 2);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 2.2);
        return { o, g };
      });
    }
    function schedule() {
      if (!ctx || !master) return;
      const st = STYLE[phase] || STYLE.night, spb = 60 / st.bpm;
      while (nextBeat < ctx.currentTime + 0.6) {
        const t = Math.max(nextBeat, ctx.currentTime + 0.02);
        const bar = Math.floor(beat / 8) % st.chords.length, chord = st.chords[bar];
        if (beat % 8 === 0) padChord(chord, t, spb * 8);
        if (beat % 4 === 0) chord.forEach((n, k) => pluck(N(n), t + k * spb / 3, 0.14, "triangle")); // gebrochener Akkord
        if (Math.random() < st.prob) {
          // Melodie bewegt sich in kleinen Schritten durch die Tonleiter
          last = Math.max(0, Math.min(st.scale.length - 1, last + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
          pluck(N(st.scale[last]), t + (Math.random() < 0.3 ? spb / 2 : 0), 0.26 + Math.random() * 0.08, st.wave);
        }
        nextBeat += spb; beat++;
      }
    }
    function start() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state !== "running") ctx.resume();
        const now = ctx.currentTime;
        master = ctx.createGain();
        master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(0.9, now + 2);
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
        echo = ctx.createDelay(1.5); echo.delayTime.value = 0.42;
        const fb = ctx.createGain(); fb.gain.value = 0.35;
        const wet = ctx.createGain(); wet.gain.value = 0.5;
        echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(lp);
        master.connect(lp); lp.connect(ctx.destination);
        phase = phase || currentPhase();
        nextBeat = now + 0.1; beat = 0;
        clearInterval(timer); timer = setInterval(schedule, 200); schedule();
      } catch (e) { api.on = false; toast("Musik kann auf diesem Gerät nicht abgespielt werden"); }
    }
    function stop() {
      clearInterval(timer); timer = null;
      if (!ctx || !master) return;
      const now = ctx.currentTime, m = master;
      m.gain.cancelScheduledValues(now); m.gain.setValueAtTime(m.gain.value, now); m.gain.linearRampToValueAtTime(0, now + 1);
      pad.forEach(v => { try { v.o.stop(now + 1.1); } catch (e) { /* schon aus */ } }); pad = [];
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* egal */ } }, 1300);
      master = null;
    }
    api.toggle = on => {
      api.on = on; store.set("botc.music", on);
      if (on) { start(); if (api.on) toast("🎵 Musik an – Medien-Lautstärke aufdrehen, falls du nichts hörst"); } else stop();
    };
    // Beim Wechsel Nacht/Tag: neue Stimmung ab dem nächsten Takt
    api.setPhase = ph => { if (ph === phase) return; phase = ph; if (api.on && master) { beat = 0; last = 3; } };
    return api;
  })();
  setInterval(applyPhase, 1000);

  // =====================================================================
  //  TESTRUNDE MIT BOTS
  // =====================================================================
  const BOT_NAMES = ["Anna", "Ben", "Clara", "David", "Eva", "Finn", "Greta", "Hugo", "Ida", "Jonas", "Klara", "Leo", "Mia", "Noah", "Olga"];
  function testPanel() {
    if (game.online) return "";
    if (game.test) return `<section class="panel testpanel"><h2>🤖 Testrunde läuft</h2>
      <p class="small">Die Plätze sind mit Bots besetzt. Sie wählen nachts selbst, „sehen“ ihre Infos und antworten wie echte Handys. Tippe im Grimoire einen Spieler an → <b>🤖 Handy ansehen</b>, um zu sehen, was er auf seinem Handy hätte. Abstimmungen trägst du wie gewohnt ein.</p>
      <button class="btn danger" id="teststop">Testrunde beenden</button></section>`;
    return `<section class="panel muted testpanel"><h3>🤖 Testrunde zum Üben</h3>
      <p class="small">Du bist der Spielleiter, alle anderen Plätze sind Bots. So kannst du ein ganzes Spiel mit Nachtaktionen, „Wie am Tisch“, Infos und Abstimmungen ausprobieren – ganz ohne Mitspieler und ohne Internet.</p>
      <button class="btn" id="teststart">🤖 Testrunde mit ${game.count} Bots starten</button></section>`;
  }
  function startTest() {
    const n = game.count;
    game.test = true;
    game.names = BOT_NAMES.slice(0, n).map(x => "🤖 " + x);
    game.pids = game.names.map((_, i) => "bot-" + i);
    game.nightActions = true;
    game.selected = [];
    save(); goStep("roles");
    toast(`${n} Bots sitzen am Tisch – wähle die Rollen`);
  }
  // Was der Bot auf seinem Handy sehen würde
  function showBotPhone(i) {
    const s = game.seats[i];
    const info = seatInfo(s, i);
    const live = !isBot(s) && s.pid;
    openModal(`<p class="small center">${isBot(s) ? "🤖" : "📱"} So sieht das Handy von ${esc(s.name)} aus${live ? (lobby[s.pid] ? " <span class='okmsg'>· 🟢 verbunden</span>" : " <span class='warnmsg'>· ⚪ gerade nicht verbunden</span>") : ""}</p>
      <div class="botphone">${cardHtml(info)}</div>
      <div class="row center"><button class="btn primary" id="botclose">Zurück</button></div>`, "full");
    $("#botclose").addEventListener("click", () => { closeModal(); seatModal(i); });
  }

  // =====================================================================
  //  EIGENE ROLLENLISTE
  // =====================================================================
  function scriptCounts(list) {
    const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
    list.forEach(id => { const r = ROLE_BY_ID[id]; if (r && c[r.t] !== undefined) c[r.t]++; });
    return c;
  }
  // Jinxes, die für eine Rollenliste gelten (beide Rollen auf der Liste)
  function jinxesFor(ids) {
    const set = new Set(ids);
    return JINXES.filter(([a, b]) => set.has(a) && set.has(b));
  }
  function jinxHtml(ids, title) {
    const js = jinxesFor(ids);
    if (!js.length) return "";
    return `<div class="box jinx"><h4>🧞 ${esc(title || "Djinn-Sonderregeln")} (${js.length})</h4>
      <p class="small">Diese Rollen-Paare beißen sich. Verkünde die Regeln zu Spielbeginn allen – auch wenn die Rollen gar nicht im Spiel sind.</p>
      <ul>${js.map(([a, b, de, en]) => `<li><b>${ROLE_BY_ID[a].ic} ${esc(roleName(a))} + ${ROLE_BY_ID[b].ic} ${esc(roleName(b))}:</b> ${esc(de)} <details class="jinx-en"><summary class="small">Original</summary><span class="small">${esc(en)}</span></details></li>`).join("")}</ul></div>`;
  }

  function scriptSummary() {
    const sc = game.script || [];
    const c = scriptCounts(sc);
    const max = SETUP_COUNTS[15];
    const warn = [];
    if (!c.demon) warn.push("mindestens 1 Dämon");
    if (c.townsfolk < SETUP_COUNTS[game.count][0] + 2) warn.push(`mehr Dorfbewohner (mind. ${SETUP_COUNTS[game.count][0] + 2} empfohlen)`);
    if (c.minion < SETUP_COUNTS[game.count][2]) warn.push(`mind. ${SETUP_COUNTS[game.count][2]} Schergen`);
    return `<div class="box script">
      <h4>📜 ${esc(game.scriptName || "Deine Rollenliste")} (${sc.length} Rollen)</h4>
      <p class="small">${c.townsfolk} Dorfbewohner · ${c.outsider} Außenseiter · ${c.minion} Schergen · ${c.demon} Dämonen${c.traveller ? ` · ${c.traveller} Reisende` : ""}</p>
      ${warn.length ? `<p class="warnmsg">Für ${game.count} Spieler fehlt noch: ${warn.join(", ")}.</p>` : ""}
      <div class="row wrap"><button class="btn primary" id="editscript">✏️ Rollenliste bearbeiten</button><button class="btn" id="importscript">📥 Skript importieren</button><button class="btn" id="exportscript">📤 Exportieren</button></div>
    </div>${jinxHtml(sc)}`;
  }
  // Tipps zur Ausgewogenheit der gewählten Rollen
  // Wer liegt gerade vorne? Grobe Einschätzung für den Spielleiter (kein Muss – nur ein Gefühl)
  const PROTECT_ROLES = ["monk", "soldier", "tealady", "innkeeper", "mayor", "fool", "pacifist", "exorcist", "sailor", "courtier", "minstrel", "princess", "bountyhunter", "farmer"];
  const MISREG_ROLES = ["spy", "recluse"];
  function balanceNow() {
    const ps = game.seats.filter(x => !x.trav && x.role);
    const live = ps.filter(x => x.alive);
    if (!live.length || game.winner || !live.some(x => ROLE_BY_ID[x.role].t === "demon")) return null;
    const evil = live.filter(x => !seatGood(x)).length, good = live.length - evil;
    const evil0 = ps.filter(x => !seatGood(x)).length / ps.length;
    const goodInfo = live.filter(x => seatGood(x) && INFO_ROLES.includes(actingRole(x) || x.role));
    const sober = goodInfo.filter(x => !impaired(x)), bad = goodInfo.filter(x => impaired(x));
    const execLeft = Math.max(1, Math.floor((live.length - 3) / 2) + 1);
    // Erwartung: etwa jeder zweite Gute hat eine Info-Rolle – mehr echte Infos helfen Gut, gestörte helfen Böse
    let sc = 50 + (sober.length - 0.45 * good) * 7 - bad.length * 4 + (evil0 - evil / live.length) * 120;
    if (live.some(x => PROTECT_ROLES.includes(x.role) && seatGood(x) && !impaired(x))) sc += 3;
    if (live.some(x => MISREG_ROLES.includes(x.role))) sc -= 3;
    sc = Math.max(5, Math.min(95, Math.round(sc)));
    const tips = [];
    if (sc >= 65) tips.push("Gut liegt vorne. Du kannst gestörten Spielern (betrunken/vergiftet) glaubwürdige Falschinfos geben und Spion/Einsiedler ruhig falsch registrieren lassen.");
    else if (sc <= 35) tips.push("Böse liegt vorne. Gib klare, richtige Infos, registriere Spion/Einsiedler eher ehrlich und erinnere die Guten an ihre Fähigkeiten.");
    else tips.push("Ausgeglichen – so soll es sein. Einfach weiterspielen.");
    return { sc, good, evil, execLeft, sober, bad, tips };
  }
  function balanceNowHtml() {
    const b = balanceNow();
    if (!b) return "";
    const nm = l => l.map(x => esc(String(x.name).replace(/^🤖\s*/, ""))).join(", ");
    return `<details class="box balnow"><summary>⚖️ Wer liegt vorne? <span class="small">${b.sc >= 65 ? "Gut" : b.sc <= 35 ? "Böse" : "ausgeglichen"}</span></summary>
      <div class="balbar"><span class="bb-g">😇 Gut</span><div class="bb-track"><i style="left:${100 - b.sc}%"></i></div><span class="bb-e">Böse 😈</span></div>
      <ul class="small">
        <li>${b.good} Gute und ${b.evil} Böse leben · noch etwa <b>${b.execLeft}</b> Hinrichtung(en) bis zum Finale mit 3 Lebenden.</li>
        <li>Info-Rollen mit echten Infos: ${b.sober.length ? nm(b.sober) : "keine"}${b.bad.length ? ` · gestört: ${nm(b.bad)}` : ""}</li>
        ${b.tips.map(t => `<li>💡 ${esc(t)}</li>`).join("")}
      </ul><p class="small">Nur eine grobe Schätzung aus Lebenden, Infos und Gift – dein Gefühl am Tisch zählt mehr.</p></details>`;
  }

  // ================= SETUP-BEWERTUNG =================
  const STRONG_DEMONS = ["vortox", "nodashii", "fanggu", "pukka", "vigormortis", "lleech", "alhadikhia", "legion", "leviathan", "riot", "kazali", "ojo", "yaggababble", "lordoftyphon", "zombuul", "shabaloth", "po"];
  const DISRUPT_ROLES = ["poisoner", "drunk", "spy", "recluse", "widow", "pukka", "nodashii", "vortox", "sweetheart", "philosopher", "innkeeper", "sailor", "courtier", "minstrel", "goon", "lunatic", "marionette", "lleech", "vigormortis", "harpy", "mezepheles"];
  function setupPower(sel) {
    let g = 0, e = 0;
    sel.forEach(id => {
      const r = ROLE_BY_ID[id]; if (!r) return;
      if (r.t === "townsfolk") g += INFO_ROLES.includes(id) ? 2 : PROTECT_ROLES.includes(id) ? 1.5 : 1.2;
      else if (r.t === "outsider") g -= 0.6;
      else if (r.t === "minion") e += 2.2;
      else if (r.t === "demon") e += STRONG_DEMONS.includes(id) ? 4.5 : 3;
      if (DISRUPT_ROLES.includes(id)) { if (r.t === "minion" || r.t === "demon") e += 1; else g -= 0.8; }
    });
    return g / Math.max(1, g + e);
  }
  // Zufällige Aufstellung (ohne etwas zu speichern)
  function randomSetup() {
    const ed = game.edition, base = SETUP_COUNTS[game.count];
    const rolesOf = (e, t) => ROLES.filter(r => inEd(r, e) && r.t === t && !smallExcluded(r.id, game.count));
    const demon = pick(rolesOf(ed, "demon"), 1);
    const minions = pick(rolesOf(ed, "minion"), base[2]);
    let outs = base[1];
    [...demon, ...minions].forEach(r => { const m = OUTSIDER_MODS[r.id]; if (m) outs += m[randInt(m.length)]; });
    const outsiderPool = rolesOf(ed, "outsider");
    outs = Math.max(0, Math.min(outs, outsiderPool.length));
    const tf = game.count - outs - base[2] - base[3];
    let sel = [...demon, ...minions, ...pick(outsiderPool, outs), ...pick(rolesOf(ed, "townsfolk"), tf)];
    Object.entries(REQUIRES).forEach(([a, bId]) => {
      if (!sel.some(r => r.id === a) || sel.some(r => r.id === bId)) return;
      const need = ROLE_BY_ID[bId];
      const k = sel.findIndex(r => r.t === need.t && r.id !== a);
      if (k >= 0) sel[k] = need; else sel = sel.filter(r => r.id !== a);
    });
    return sel.map(r => r.id);
  }
  // Vergleich mit vielen zufälligen Aufstellungen derselben Edition und Spielerzahl
  const setupRef = {};
  function setupStats() {
    const key = game.edition + "|" + game.count + "|" + (game.script || []).join(",");
    if (!setupRef[key]) {
      const v = [];
      for (let k = 0; k < 250; k++) { const sel = randomSetup(); if (sel.length === game.count) v.push(setupPower(sel)); }
      v.sort((a, b) => a - b);
      const mid = v.length ? v[Math.floor(v.length / 2)] : 0.5;
      const sd = v.length ? Math.sqrt(v.reduce((a, x) => a + (x - mid) ** 2, 0) / v.length) || 0.05 : 0.05;
      setupRef[key] = { mid, sd };
    }
    return setupRef[key];
  }
  function setupZ(sel) { const st = setupStats(); return (setupPower(sel) - st.mid) / st.sd; }
  function setupMeterHtml() {
    if (game.selected.length !== game.count) return "";
    const z = setupZ(game.selected);
    const lbl = z > 1.5 ? "sehr leicht für Gut" : z > 0.6 ? "eher leicht für Gut" : z < -1.5 ? "sehr schwer für Gut" : z < -0.6 ? "eher schwer für Gut" : "ausgeglichen";
    const pos = Math.max(3, Math.min(97, 50 - z * 20));
    return `<div class="box setupmeter"><h4>⚖️ Bewertung dieser Aufstellung: <span class="${Math.abs(z) <= 0.6 ? "okmsg" : "warnmsg"}">${lbl}</span></h4>
      <div class="balbar"><span class="bb-g">😇 Gut</span><div class="bb-track"><i style="left:${pos}%"></i></div><span class="bb-e">Böse 😈</span></div>
      <p class="small">Verglichen mit vielen zufälligen Aufstellungen dieser Edition bei ${game.count} Spielern. Zählt Info-, Schutz- und Störrollen sowie starke Dämonen.</p></div>`;
  }
  function suggestBalanced() {
    const c = [];
    for (let k = 0; k < 300; k++) {
      const sel = randomSetup();
      if (sel.length !== game.count || !sel.some(id => INFO_ROLES.includes(id))) continue;
      c.push([Math.abs(setupZ(sel)), sel]);
    }
    if (!c.length) { autoPick(); return; }
    c.sort((a, b) => a[0] - b[0]);
    game.selected = c[randInt(Math.min(15, c.length))][1];
    refreshHidden();
  }

  function balanceHints() {
    const sel = game.selected, R = id => ROLE_BY_ID[id];
    if (sel.length !== game.count) return "";
    const tips = [];
    const towns = sel.filter(id => R(id).t === "townsfolk");
    const info = towns.filter(id => INFO_ROLES.includes(id));
    const disrupt = sel.filter(id => DISRUPT_ROLES.includes(id));
    if (!info.length) tips.push("Kein Info-Dorfbewohner im Spiel – Gut erfährt fast nichts und hat es sehr schwer.");
    else if (info.length >= Math.max(3, towns.length - 1) && !disrupt.length) tips.push("Viele Info-Rollen, aber nichts stört sie (kein Giftmischer, Säufer, Spion, Einsiedler …) – Gut hat es sehr leicht.");
    if (sel.includes("drunk") && game.drunkShown && !INFO_ROLES.includes(game.drunkShown)) tips.push(`Der Säufer glaubt, ${roleName(game.drunkShown)} zu sein – mit einer Info-Rolle kannst du ihm falsche Infos geben, das macht ihn spannender.`);
    if (sel.includes("fortuneteller")) tips.push("Wahrsager im Spiel: Lege im Grimoire bei einem guten Spieler den Ablenker 🐟 fest.");
    if (sel.includes("saint") && !info.length) tips.push("Heiliger ohne Info-Rollen: Gut kann ihn kaum erkennen und verliert leicht durch seine Hinrichtung.");
    if (sel.includes("mayor") && sel.includes("soldier") && !disrupt.length) tips.push("Bürgermeister und Soldat ohne Störrollen: Der Dämon hat es nachts schwer.");
    if (sel.includes("scarletwoman") && game.count < 7) tips.push("Scharlachrote Frau bei so wenigen Spielern: Sie übernimmt nur, wenn beim Tod des Dämons noch 5+ leben – das passiert selten.");
    if (sel.includes("spy") && game.count < 7) tips.push("Spion bei wenigen Spielern: Ohne Schergen-Info (erst ab 7) ist er sehr stark, weil er alles sieht.");
    if (sel.includes("virgin") && sel.includes("spy")) tips.push("Jungfrau + Spion: Nominiert der Spion die Jungfrau, darfst du entscheiden, ob er als Dorfbewohner gilt.");
    return tips.length ? `<div class="box hints"><h4>💡 Tipps zur Zusammenstellung</h4><ul>${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  }

  function requireWarnings() {
    const w = Object.entries(REQUIRES).filter(([a, b]) => game.selected.includes(a) && !game.selected.includes(b))
      .map(([a, b]) => `${roleName(a)} braucht ${roleName(b)}`);
    return w.length ? `<p class="warnmsg">⚠️ ${w.join(" · ")} im Spiel.</p>` : "";
  }
  let scriptFilter = "all";
  // ================= HOMEBREW-ROLLEN =================
  const hbFx = rid => (ROLE_BY_ID[rid] || {}).hbEffects || [];
  const hbHas = (rid, ...fxs) => hbFx(rid).some(f => fxs.includes(f));
  const hbFind = (rid, list) => hbFx(rid).find(f => list.includes(f));
  // Bausteine: damit wirkt eine eigene Rolle automatisch (pick = wie viele Spieler sie nachts wählt)
  const HB_EFFECTS = {
    "": { l: "– keine (Wirkung wertest du selbst aus) –" },
    protect: { l: "🛡️ Gewählter Spieler ist heute Nacht vor dem Dämon geschützt", pick: 1, mark: "protect" },
    poison: { l: "🧪 Gewählter Spieler ist vergiftet (bis zur nächsten Nacht)", pick: 1, mark: "poison" },
    drunk: { l: "🍺 Gewählter Spieler ist betrunken (bis zur nächsten Nacht)", pick: 1, mark: "drunk" },
    kill: { l: "💀 Gewählter Spieler stirbt (kein Dämonen-Tod – Mönch/Soldat schützen nicht)", pick: 1 },
    align: { l: "ℹ️ Info: Ist der gewählte Spieler gut oder böse?", pick: 1, info: true },
    demon: { l: "ℹ️ Info: Ist einer der Gewählten der Dämon? (Ja/Nein)", pick: 2, info: true },
    minion: { l: "ℹ️ Info: Ist einer der Gewählten ein Scherge? (Ja/Nein)", pick: 2, info: true },
    outsider: { l: "ℹ️ Info: Ist der gewählte Spieler ein Außenseiter? (Ja/Nein)", pick: 1, info: true },
    role: { l: "ℹ️ Info: Rolle des gewählten Spielers", pick: 1, info: true },
    neighbours: { l: "ℹ️ Info: Wie viele lebende Nachbarn sind böse? (Zahl, ohne Wahl)", pick: 0, info: true },
    evilcount: { l: "ℹ️ Info: Wie viele böse Spieler leben noch? (Zahl, ohne Wahl)", pick: 0, info: true },
    // weitere Tode
    kill_evil: { l: "💀 Gewählter Spieler stirbt – nur wenn er böse ist", pick: 1 },
    kill_minion: { l: "💀 Gewählter Spieler stirbt – nur wenn er ein Scherge ist", pick: 1 },
    // passiv (ohne Wahl)
    immune: { l: "🛡️ Passiv: Der Dämon kann dich nicht töten (wie Soldat)", pick: 0, passive: true },
    unkillable: { l: "🛡️ Passiv: Du kannst nicht sterben, solange du nüchtern bist (wie Seemann)", pick: 0, passive: true },
    fool: { l: "🃏 Passiv: Dein erster Tod wird verhindert (wie Narr)", pick: 0, passive: true },
    saint: { l: "😇 Passiv: Wirst du hingerichtet, gewinnt Böse (wie Heiliger)", pick: 0, passive: true },
    // weitere Infos
    same: { l: "ℹ️ Info: Haben die 2 Gewählten die gleiche Gesinnung?", pick: 2, info: true },
    townsfolk: { l: "ℹ️ Info: Ist der gewählte Spieler ein Dorfbewohner? (Ja/Nein)", pick: 1, info: true },
    evil3: { l: "ℹ️ Info: Wie viele der 3 Gewählten sind böse? (Zahl)", pick: 3, info: true },
    nominated: { l: "ℹ️ Info: Hat der gewählte Spieler heute nominiert? (Ja/Nein)", pick: 1, info: true },
    voted: { l: "ℹ️ Info: Hat der gewählte Spieler heute abgestimmt? (Ja/Nein)", pick: 1, info: true },
    executee: { l: "ℹ️ Info: Rolle des heute Hingerichteten (ohne Wahl, wie Totengräber)", pick: 0, info: true },
    deadevil: { l: "ℹ️ Info: Wie viele Tote sind böse? (Zahl, ohne Wahl, wie Orakel)", pick: 0, info: true },
    demondist: { l: "ℹ️ Info: Wie viele Plätze sitzt du vom Dämon entfernt? (Zahl, ohne Wahl)", pick: 0, info: true },
    // Rollen verändern
    mad: { l: "😵 Gewählter Spieler muss morgen eine Rolle deiner Wahl behaupten (wie Cerenovus)", pick: 1, rolePick: true },
    change: { l: "🧙 Gewählter Spieler wird zu einer Rolle deiner Wahl (wie Grubenhexe)", pick: 1, rolePick: true }
  };
  const HB_GROUPS = [["", "Ohne"], ["Wirkung auf Gewählte", ["protect", "poison", "drunk", "mad", "change"]], ["Tod", ["kill", "kill_evil", "kill_minion"]],
    ["Passiv (eigene Rolle)", ["immune", "unkillable", "fool", "saint"]],
    ["Info", ["align", "demon", "minion", "outsider", "townsfolk", "same", "evil3", "role", "nominated", "voted", "executee", "neighbours", "evilcount", "deadevil", "demondist"]]];
  // Definition: { id: "hb_…", de, t, a, e, ic, n1, pos1, n, pos, pick, rolePick, info, act, marks: [{i,l}], setup }
  function registerHomebrew(defs) {
    (defs || []).forEach(d => {
      if (!d || !d.id || !String(d.id).startsWith("hb_") || !TEAMS[d.t]) return;
      let r = ROLE_BY_ID[d.id];
      if (!r) { r = { id: d.id }; ROLES.push(r); r.idx = ROLES.length - 1; ROLE_BY_ID[d.id] = r; }
      Object.assign(r, { de: d.de || "Eigene Rolle", en: d.de || "Homebrew", t: d.t, ed: "homebrew", a: d.a || "", e: d.e || "Homebrew-Rolle – vom Spielleiter erfunden.", tip: d.tip || "", st: d.st || "", n1: d.n1 || "", n: d.n || "", setup: d.setup || "", ic: d.ic || "✳️", hb: true });
      [[NIGHT_FIRST, d.n1, d.pos1], [NIGHT_OTHER, d.n, d.pos]].forEach(([arr, txt, after]) => {
        const at = arr.indexOf(d.id); if (at >= 0) arr.splice(at, 1);
        if (!txt) return;
        // Ohne gewählte Position: Schutz/Gift/Trunkenheit vor dem Dämon, alles andere am Ende
        if (!after && ["protect", "poison", "drunk"].includes(d.effect)) after = arr.includes("monk") ? "monk" : "poisoner";
        let k = after ? arr.indexOf(after) : -1;
        if (k < 0) k = arr.indexOf("dawn") - 1;
        arr.splice(k + 1, 0, d.id);
      });
      const fx = HB_EFFECTS[d.effect || ""] || {}, fx2 = HB_EFFECTS[d.effect2 || ""] || {};
      r.hbEffect = d.effect || "";
      r.hbEffects = [d.effect, d.effect2].filter(Boolean);
      r.hbCond = d.cond || "";
      if (fx.info || fx2.info) d.info = true;
      const pd = PICK_DEPENDENT.indexOf(d.id);
      const pickInfo = (fx.info && fx.pick) || (fx2.info && fx2.pick);
      if (pickInfo && pd < 0) PICK_DEPENDENT.push(d.id);
      if (!pickInfo && pd >= 0) PICK_DEPENDENT.splice(pd, 1);
      const oi = ONCE_PER_GAME.indexOf(d.id);
      if (d.cond === "once" && oi < 0) ONCE_PER_GAME.push(d.id);
      if (d.cond !== "once" && oi >= 0) ONCE_PER_GAME.splice(oi, 1);
      if (d.pick || d.rolePick) ACTIONS[d.id] = { mark: fx.mark || fx2.mark, mark2: fx.mark && fx2.mark && fx2.mark !== fx.mark ? fx2.mark : undefined, n: +d.pick || 0, self: true, role: d.rolePick ? "all" : undefined, text: d.act || `Wähle ${d.pick ? (+d.pick === 1 ? "einen Spieler" : d.pick + " Spieler") : ""}${d.pick && d.rolePick ? " und " : ""}${d.rolePick ? "eine Rolle" : ""}.` };
      else delete ACTIONS[d.id];
      const ii = INFO_ROLES.indexOf(d.id);
      if (d.info && ii < 0) INFO_ROLES.push(d.id);
      if (!d.info && ii >= 0) INFO_ROLES.splice(ii, 1);
      ROLE_MARKERS[d.id] = (d.marks || []).filter(m => m && m.l).map((m, j) => ({ k: `${d.id}_m${j}`, i: m.i || "🏷️", l: m.l, d: `Marker der Homebrew-Rolle ${d.de}.` }));
    });
  }
  function unregisterHomebrew(id) {
    const at = ROLES.findIndex(r => r.id === id);
    if (at >= 0) ROLES.splice(at, 1);
    ROLES.forEach((r, i) => { r.idx = i; });
    delete ROLE_BY_ID[id]; delete ACTIONS[id]; delete ROLE_MARKERS[id];
    [NIGHT_FIRST, NIGHT_OTHER, INFO_ROLES].forEach(arr => { const k = arr.indexOf(id); if (k >= 0) arr.splice(k, 1); });
  }
  const hbDef = id => (game.homebrew || []).find(d => d.id === id);
  const hbSlug = x => normId(String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss"));
  function saveHomebrew(d) {
    game.homebrew = [...(game.homebrew || []).filter(x => x.id !== d.id), d];
    registerHomebrew([d]);
    game.edition = "custom";
    game.script = [...new Set([...(game.script || []), d.id])];
    if (!(game.fabled || []).includes("f_bootlegger")) game.fabled = [...(game.fabled || []), "f_bootlegger"];
    save();
  }
  // Aus dem offiziellen Skript-Format (eigene Rolle als Objekt) eine Homebrew-Definition machen
  function hbFromScript(x) {
    const TEAM = { townsfolk: "townsfolk", outsider: "outsider", minion: "minion", demon: "demon", traveler: "traveller", traveller: "traveller" };
    const t = TEAM[String(x.team || "").toLowerCase()];
    if (!t || !x.ability) return null;
    const id = "hb_" + hbSlug(x.id || x.name);
    const n1 = x.firstNight > 0 ? (x.firstNightReminder || "Wecke die Rolle.") : "";
    const n = x.otherNight > 0 ? (x.otherNightReminder || "Wecke die Rolle.") : "";
    const txt = `${x.firstNightReminder || ""} ${x.otherNightReminder || ""}`;
    const pick = /choose[s]? (2|two)|wählt (2|zwei)/i.test(txt) ? 2 : /choose|wählt|wähle/i.test(txt) ? 1 : 0;
    const posAt = (arr, num) => { if (!(num > 0)) return null; const k = Math.max(0, Math.min(arr.length - 2, Math.round(num / 100 * (arr.length - 1)))); return arr[k]; };
    return { id, de: x.name || x.id, t, a: x.ability, e: "Homebrew-Rolle aus einem importierten Skript.", ic: "✳️", n1, pos1: posAt(NIGHT_FIRST, x.firstNight), n, pos: posAt(NIGHT_OTHER, x.otherNight),
      pick, rolePick: /character/i.test(txt) && /choose/i.test(txt), info: /learn|shows?|point|nod|erfährt|zeig/i.test(txt), marks: (x.reminders || []).map(l => ({ i: "🏷️", l })), setup: x.setup ? "Ändert den Aufbau (siehe Fähigkeit)." : "",
      ...(x.app && typeof x.app === "object" ? { effect: String(x.app.effect || ""), effect2: String(x.app.effect2 || ""), cond: String(x.app.cond || ""), pick: +x.app.pick || pick, rolePick: !!x.app.rolePick, info: !!x.app.info } : {}) };
  }
  const fxOpts = cur => HB_GROUPS.map(([g, ks]) => g === "" ? `<option value="">${esc(HB_EFFECTS[""].l)}</option>` : `<optgroup label="${esc(g)}">${ks.map(k => `<option value="${k}" ${(cur || "") === k ? "selected" : ""}>${esc(HB_EFFECTS[k].l)}</option>`).join("")}</optgroup>`).join("");
  function homebrewEditor(id) {
    const d = hbDef(id) || { id: "", de: "", t: "townsfolk", a: "", e: "", ic: "✳️", n1: "", pos1: "", n: "", pos: "", pick: 0, rolePick: false, info: false, marks: [], setup: "" };
    const stepName = x => NIGHT_STEPS[x] ? NIGHT_STEPS[x].de : roleName(x);
    const posOpts = (arr, cur) => {
      const ids = arr.filter(x => x !== d.id && (NIGHT_STEPS[x] || (game.script || []).includes(x)));
      return `<option value="">– ganz am Ende –</option>${ids.map(x => `<option value="${x}" ${x === cur ? "selected" : ""}>nach: ${esc(stepName(x))}</option>`).join("")}`;
    };
    openModal(`<h2>✳️ ${d.id ? "Homebrew-Rolle bearbeiten" : "Eigene Rolle erstellen"}</h2>
      <div class="hbform">
        <div class="row wrap"><input id="hbic" value="${esc(d.ic)}" maxlength="4" style="width:3.5rem"><input id="hbname" placeholder="Name der Rolle" value="${esc(d.de)}" style="flex:1"></div>
        <label class="field">Typ: <select id="hbteam">${["townsfolk", "outsider", "minion", "demon", "traveller"].map(t => `<option value="${t}" ${d.t === t ? "selected" : ""}>${TEAMS[t].name}</option>`).join("")}</select></label>
        <label class="field">Fähigkeit (wie auf dem Skript):<textarea id="hba" rows="2">${esc(d.a)}</textarea></label>
        <label class="field">Erklärung für Spieler (optional):<textarea id="hbe" rows="2">${esc(d.e === "Homebrew-Rolle – vom Spielleiter erfunden." ? "" : d.e)}</textarea></label>
        <label class="switch"><input type="checkbox" id="hbw1" ${d.n1 ? "checked" : ""}><span>Wacht in der <b>ersten Nacht</b></span></label>
        <div id="hbw1box" ${d.n1 ? "" : "hidden"}><textarea id="hbn1" rows="2" placeholder="Was machst du als Spielleiter?">${esc(d.n1)}</textarea><select id="hbpos1">${posOpts(NIGHT_FIRST, d.pos1)}</select></div>
        <label class="switch"><input type="checkbox" id="hbw" ${d.n ? "checked" : ""}><span>Wacht in den <b>anderen Nächten</b></span></label>
        <div id="hbwbox" ${d.n ? "" : "hidden"}><textarea id="hbn" rows="2" placeholder="Was machst du als Spielleiter?">${esc(d.n)}</textarea><select id="hbpos">${posOpts(NIGHT_OTHER, d.pos)}</select></div>
        <label class="field">⚙️ Automatische Wirkung (Baustein): <select id="hbfx">${fxOpts(d.effect)}</select></label>
        <label class="field">➕ Zweiter Baustein (optional): <select id="hbfx2">${fxOpts(d.effect2)}</select></label>
        <label class="field">⏱️ Wann: <select id="hbcond"><option value="">immer</option><option value="once" ${d.cond === "once" ? "selected" : ""}>nur einmal pro Spiel</option><option value="n2" ${d.cond === "n2" ? "selected" : ""}>nur in Nacht 2</option></select></label>
        <label class="field">Wählt nachts am Handy: <select id="hbpick"><option value="0" ${!+d.pick ? "selected" : ""}>keine Spieler</option><option value="1" ${+d.pick === 1 ? "selected" : ""}>1 Spieler</option><option value="2" ${+d.pick === 2 ? "selected" : ""}>2 Spieler</option></select></label>
        <label class="switch"><input type="checkbox" id="hbrole" ${d.rolePick ? "checked" : ""}><span>… und eine <b>Rolle</b></span></label>
        <label class="switch"><input type="checkbox" id="hbinfo" ${d.info ? "checked" : ""}><span>Bekommt <b>Infos</b> vom Spielleiter (📱-Info-Knopf)</span></label>
        <label class="field">Eigene Marker (mit Komma, z. B. „🎯 Gejagt, 🔥 Brennt“):<input id="hbmarks" value="${esc((d.marks || []).map(m => `${m.i} ${m.l}`).join(", "))}"></label>
        <label class="field">Setup-Änderung (optional, z. B. „+1 Außenseiter“):<input id="hbsetup" value="${esc(d.setup)}"></label>
      </div>
      <p class="small">Mit einem Baustein wirkt die Rolle automatisch (inkl. Gift/Trunkenheit: vergiftet wirkt sie nicht). Ohne Baustein wertest du die Wirkung selbst aus – Nachtschritt, Handy-Aufgaben, Infos und Marker funktionieren trotzdem.</p>
      <div class="row end wrap">${d.id ? `<button class="btn danger" id="hbdel">🗑️ Löschen</button>` : ""}<button class="btn" id="hbcancel">Abbrechen</button><button class="btn primary" id="hbsave">Speichern</button></div>`, "full");
    $("#hbw1").addEventListener("change", e => { $("#hbw1box").hidden = !e.target.checked; });
    $("#hbw").addEventListener("change", e => { $("#hbwbox").hidden = !e.target.checked; });
    $("#hbfx2").addEventListener("change", e => {
      const fx = HB_EFFECTS[e.target.value] || {};
      if ((fx.pick || 0) > +$("#hbpick").value) $("#hbpick").value = String(fx.pick);
      if (fx.info) $("#hbinfo").checked = true;
      if (fx.rolePick) $("#hbrole").checked = true;
    });
    $("#hbfx").addEventListener("change", e => {
      const fx = HB_EFFECTS[e.target.value] || {};
      if (fx.pick !== undefined) $("#hbpick").value = String(fx.pick);
      if (fx.info) $("#hbinfo").checked = true;
      $("#hbrole").checked = !!fx.rolePick;
      if (fx.passive) { $("#hbw").checked = false; $("#hbwbox").hidden = true; $("#hbw1").checked = false; $("#hbw1box").hidden = true; return; }
      if (e.target.value && !$("#hbw").checked && !$("#hbw1").checked) { $("#hbw").checked = true; $("#hbwbox").hidden = false; }
      if (e.target.value && !$("#hbn").value.trim()) $("#hbn").value = `Wecke ${$("#hbname").value.trim() || "die Rolle"}. ${fx.pick ? `Sie wählt ${fx.pick === 1 ? "einen Spieler" : fx.pick + " Spieler"}${fx.rolePick ? " und eine Rolle" : ""}.` : ""}${fx.info ? " Gib ihr die Info." : ""}`.trim();
    });
    $("#hbcancel").addEventListener("click", () => { closeModal(); scriptEditor(); });
    $("#hbdel") && $("#hbdel").addEventListener("click", () => {
      if (!confirm(`„${d.de}“ wirklich löschen?`)) return;
      game.homebrew = (game.homebrew || []).filter(x => x.id !== d.id);
      game.script = (game.script || []).filter(x => x !== d.id);
      game.selected = game.selected.filter(x => x !== d.id);
      unregisterHomebrew(d.id); save(); closeModal(); scriptEditor();
    });
    $("#hbsave").addEventListener("click", () => {
      const name = $("#hbname").value.trim(), ab = $("#hba").value.trim();
      if (!name || !ab) { toast("Bitte Name und Fähigkeit eintragen."); return; }
      const marks = $("#hbmarks").value.split(",").map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u); return m ? { i: m[1], l: m[2] || m[1] } : { i: "🏷️", l: x }; });
      const nd = { id: d.id || "hb_" + (hbSlug(name) || "rolle") + (hbDef("hb_" + hbSlug(name)) ? randInt(999) : ""), de: name, t: $("#hbteam").value, a: ab, e: $("#hbe").value.trim(), ic: $("#hbic").value.trim() || "✳️",
        n1: $("#hbw1").checked ? ($("#hbn1").value.trim() || "Wecke die Rolle.") : "", pos1: $("#hbpos1").value, n: $("#hbw").checked ? ($("#hbn").value.trim() || "Wecke die Rolle.") : "", pos: $("#hbpos").value,
        pick: +$("#hbpick").value, rolePick: $("#hbrole").checked, info: $("#hbinfo").checked, marks, setup: $("#hbsetup").value.trim(), effect: $("#hbfx").value, effect2: $("#hbfx2").value, cond: $("#hbcond").value };
      saveHomebrew(nd);
      hist(`✳️ Homebrew-Rolle „${nd.de}“ ${d.id ? "geändert" : "erstellt"}`);
      closeModal(); scriptEditor();
      toast(`✳️ „${nd.de}“ gespeichert und zur Rollenliste hinzugefügt`);
    });
  }
  // Skript exportieren (offizielles Format, inkl. Homebrew)
  function exportScript() {
    const out = [{ id: "_meta", name: game.scriptName ? game.scriptName.replace(/ \(von .*\)$/, "") : "Mein Skript", author: "" }];
    (game.script || []).forEach(id => {
      const r = ROLE_BY_ID[id];
      if (!r) return;
      if (r.hb) out.push({ id: id.replace(/^hb_/, ""), name: r.de, team: r.t, ability: r.a, firstNight: r.n1 ? NIGHT_FIRST.indexOf(id) + 1 : 0, otherNight: r.n ? NIGHT_OTHER.indexOf(id) + 1 : 0,
        firstNightReminder: r.n1 || "", otherNightReminder: r.n || "", reminders: (ROLE_MARKERS[id] || []).map(m => m.l), setup: !!r.setup,
        app: (() => { const d = hbDef(id) || {}; return { effect: d.effect || "", effect2: d.effect2 || "", cond: d.cond || "", pick: d.pick || 0, rolePick: !!d.rolePick, info: !!d.info }; })() });
      else out.push(id.replace(/^[fl]_/, ""));
    });
    (game.fabled || []).forEach(id => out.push(id.replace(/^[fl]_/, "")));
    const json = JSON.stringify(out, null, 1);
    openModal(`<h2>📤 Skript exportieren</h2>
      <p class="small">Im offiziellen Format – zum Teilen, für die offizielle App oder botcscripts.com. Homebrew-Rollen sind mit drin.</p>
      <textarea id="expjson" rows="8" readonly>${esc(json)}</textarea>
      <div class="row end wrap"><button class="btn" id="expcopy">📋 Kopieren</button><button class="btn primary" id="expdl">💾 Herunterladen</button></div>`);
    $("#expcopy").addEventListener("click", () => { (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => toast("📋 Kopiert"), () => { $("#expjson").select(); document.execCommand("copy"); toast("📋 Kopiert"); }); });
    $("#expdl").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = (out[0].name || "skript").replace(/[^\wäöüÄÖÜß-]+/g, "_") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // Skript aus dem offiziellen Script-Tool (JSON) übernehmen
  const normId = x => String(x || "").toLowerCase().replace(/[^a-z]/g, "");
  function scriptImport() {
    openModal(`<h2>📥 Skript importieren</h2>
      ${scriptSearchHtml()}
      <h4>📄 Oder aus Datei / Text</h4>
      <p class="small">Skript-Datei (JSON, z. B. vom offiziellen Script-Tool) auswählen oder ihren Inhalt einfügen.</p>
      <input type="file" id="impfile" accept=".json,application/json,text/plain">
      <textarea id="imptext" rows="6" placeholder='[{"id":"_meta","name":"Mein Skript"},"washerwoman","empath", …]'></textarea>
      <div id="impmsg"></div>
      <div class="row end"><button class="btn" id="impcancel">Abbrechen</button><button class="btn primary" id="impgo">Übernehmen</button></div>`, "full");
    $("#impcancel").addEventListener("click", closeModal);
    $("#impfile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("#imptext").value = rd.result; }; rd.readAsText(f); });
    $("#impgo").addEventListener("click", () => {
      let data;
      try { data = JSON.parse($("#imptext").value); } catch (e) { $("#impmsg").innerHTML = `<p class="error">Das ist kein gültiges Skript (JSON). Bitte den kompletten Inhalt einfügen.</p>`; return; }
      const err = applyScript(data);
      if (err) $("#impmsg").innerHTML = `<p class="error">${esc(err)}</p>`;
    });
    bindScriptSearch();
  }
  // Rollen eines Skripts (Liste aus Strings/Objekten) in die App übernehmen. Gibt eine Fehlermeldung zurück oder null.
  function scriptRoles(data) {
    if (!Array.isArray(data)) data = data && Array.isArray(data.roles) ? data.roles : [];
    const lookup = new Map();
    ROLES.forEach(r => { lookup.set(normId(r.id.replace(/^[fl]_/, "")), r.id); lookup.set(normId(r.en), r.id); });
    let name = "", author = "";
    const ids = [], unknown = [], hb = [];
    data.forEach(x => {
      const id = typeof x === "string" ? x : x && x.id;
      if (!id) return;
      if (id === "_meta") { name = x.name || ""; author = x.author || ""; return; }
      const hb1 = typeof x === "object" && x.ability ? hbFromScript(x) : null;
      const hit = !hb1 && (lookup.get(normId(id)) || (x && x.name && lookup.get(normId(x.name))));
      if (hit) ids.push(hit);
      else if (hb1) { hb.push(hb1); ids.push(hb1.id); }
      else unknown.push((x && x.name) || id);
    });
    return { ids: [...new Set(ids)], unknown, name, author, hb };
  }
  function applyScript(data) {
    const { ids, unknown, name, author, hb } = scriptRoles(data);
    if (!ids.length) return "Keine bekannte Rolle gefunden.";
    if (hb.length) {
      game.homebrew = [...(game.homebrew || []).filter(d => !hb.some(h => h.id === d.id)), ...hb];
      registerHomebrew(hb);
      if (!(game.fabled || []).includes("f_bootlegger")) game.fabled = [...(game.fabled || []), "f_bootlegger"];
    }
    game.edition = "custom";
    game.script = ROLES.filter(r => ids.includes(r.id) && r.t !== "fabled").map(r => r.id);
    const fab = ids.filter(id => ROLE_BY_ID[id].t === "fabled");
    if (fab.length) game.fabled = [...new Set([...(game.fabled || []), ...fab])];
    game.scriptName = name ? name + (author ? ` (von ${author})` : "") : "";
    game.selected = []; game.bluffs = [];
    save(); closeModal(); renderSL();
    toast(`📥 ${game.script.length} Rollen übernommen${hb.length ? ` (davon ${hb.length} Homebrew ✳️)` : ""}${fab.length ? ` + ${fab.length} Fabelwesen/Lorics` : ""}${unknown.length ? ` – unbekannt: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? " …" : ""}` : ""}`);
    return null;
  }

  // ---------- Online-Suche auf botcscripts.com ----------
  const BOTC_API = "https://www.botcscripts.com/api/scripts/";
  let scriptSearchState = { q: "", type: "", next: null, results: [] };
  function scriptSearchHtml() {
    return `<details class="box scriptsearch" open><summary><h4>🌐 Skripte online suchen <span class="small">(botcscripts.com)</span></h4></summary>
      <div class="row wrap">
        <input id="ssq" placeholder="Name, z. B. Teensyville" value="${esc(scriptSearchState.q)}">
        <select id="sstype"><option value="">Alle Größen</option><option value="Teensyville" ${scriptSearchState.type === "Teensyville" ? "selected" : ""}>Teensyville (5–6 Spieler)</option><option value="Full" ${scriptSearchState.type === "Full" ? "selected" : ""}>Volle Skripte</option></select>
        <button class="btn primary" id="ssgo">🔍 Suchen</button>
      </div>
      <p class="small">Sortiert nach Beliebtheit. Antippen übernimmt das Skript als deine Rollenliste.</p>
      <div id="ssres"></div>
      <p class="small">Mehr stöbern: <a href="https://www.botcscripts.com/" target="_blank" rel="noopener">botcscripts.com</a> · eigenes Skript bauen: <a href="https://script.bloodontheclocktower.com/" target="_blank" rel="noopener">offizielles Script-Tool</a></p>
    </details>`;
  }
  function drawScriptResults(append) {
    const box = $("#ssres");
    if (!box) return;
    const rows = scriptSearchState.results.map((r, k) => {
      const info = scriptRoles(r.content || []);
      return `<button class="ssitem" data-ss="${k}"><b>${esc(r.name)}</b> <span class="small">von ${esc(r.author || "?")}</span><br>
        <span class="small">${esc(r.script_type || "")} · ⭐ ${r.score || 0} · ${info.ids.length} Rollen${info.hb.length ? ` · ✳️ ${info.hb.length} Homebrew` : ""}${info.unknown.length ? ` · ⚠️ ${info.unknown.length} unbekannt` : ""}</span></button>`;
    }).join("");
    box.innerHTML = (rows || `<p class="small">Nichts gefunden.</p>`) + (scriptSearchState.next ? `<div class="row center"><button class="btn" id="ssmore">Mehr laden</button></div>` : "");
    $$("[data-ss]").forEach(b => b.addEventListener("click", () => {
      const r = scriptSearchState.results[+b.dataset.ss];
      const err = applyScript(r.content || []);
      if (err) toast(err);
    }));
    $("#ssmore") && $("#ssmore").addEventListener("click", () => loadScripts(scriptSearchState.next, true));
  }
  async function loadScripts(url, append) {
    const box = $("#ssres");
    if (box && !append) box.innerHTML = `<p class="small">⏳ Suche …</p>`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      scriptSearchState.results = append ? [...scriptSearchState.results, ...(j.results || [])] : (j.results || []);
      scriptSearchState.next = j.next ? j.next.replace(/^http:/, "https:") : null;
      drawScriptResults(append);
    } catch (e) {
      if (box) box.innerHTML = `<p class="error">Keine Verbindung zu botcscripts.com. Bist du online? Du kannst ein Skript auch auf der Seite herunterladen und oben als Datei auswählen.</p>`;
    }
  }
  function bindScriptSearch() {
    const go = () => {
      scriptSearchState.q = $("#ssq").value.trim(); scriptSearchState.type = $("#sstype").value;
      const u = new URL(BOTC_API);
      u.searchParams.set("format", "json"); u.searchParams.set("ordering", "-score");
      if (scriptSearchState.q) u.searchParams.set("search", scriptSearchState.q);
      if (scriptSearchState.type) u.searchParams.set("script_type", scriptSearchState.type);
      loadScripts(u.toString(), false);
    };
    $("#ssgo") && $("#ssgo").addEventListener("click", go);
    $("#ssq") && $("#ssq").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    if ($("#ssres")) { if (scriptSearchState.results.length) drawScriptResults(); else go(); }
  }

  function scriptEditor() {
    const sc = new Set(game.script || []);
    const draw = () => {
      const c = scriptCounts([...sc]);
      const list = ROLES.filter(r => r.t !== "fabled" && (scriptFilter === "all" || r.ed === scriptFilter));
      openModal(`<h2>📜 Eigene Rollenliste</h2>
        <p class="small">Tippe Rollen an, die in deinem Spiel vorkommen dürfen. Die Zufallswahl nimmt dann nur Rollen aus dieser Liste.</p>
        <div class="chips">
          <button class="chip" data-preset="tb">+ Trouble Brewing</button>
          <button class="chip" data-preset="bmr">+ Bad Moon Rising</button>
          <button class="chip" data-preset="snv">+ Sects &amp; Violets</button>
          <button class="chip" data-preset="exp">+ Experimentelle</button>
          <button class="chip" data-preset="none">Liste leeren</button>
          <button class="chip" id="importscript2">📥 Skript importieren</button>
          <button class="chip" id="hbnew">✳️ Eigene Rolle erstellen</button>
        </div>
        ${(game.homebrew || []).length ? `<div class="box"><h4>✳️ Deine Homebrew-Rollen</h4><div class="chips">${game.homebrew.map(d => `<button class="chip" data-hbedit="${d.id}">${esc(d.ic || "✳️")} ${esc(d.de)} ✏️</button>`).join("")}</div></div>` : ""}
        <div class="chips">${["all", "tb", "bmr", "snv", "exp", ...((game.homebrew || []).length ? ["homebrew"] : [])].map(k => `<button class="chip ${scriptFilter === k ? "on" : ""}" data-sfilter="${k}">${k === "all" ? "Alle zeigen" : EDITIONS[k].name}</button>`).join("")}</div>
        <p class="scriptcount">${sc.size} gewählt: ${c.townsfolk} Dorfb. · ${c.outsider} Außens. · ${c.minion} Schergen · ${c.demon} Dämonen · ${c.traveller} Reisende</p>
        ${["townsfolk", "outsider", "minion", "demon", "traveller"].map(t => {
          const rs = list.filter(r => r.t === t);
          return rs.length ? `<h3 class="team-h t-${t}-text">${TEAMS[t].plural}</h3><div class="tiles">${rs.map(r =>
            `<button class="tile t-${t} ${sc.has(r.id) ? "on" : ""}" data-sid="${r.id}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small><em class="ed">${esc(EDITIONS[r.ed].name)}</em></button>`).join("")}</div>` : "";
        }).join("")}
        <div class="row end sticky-save"><button class="btn primary" id="savescript">Übernehmen</button></div>`, "full");
      $$("[data-sid]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.sid;
        sc.has(id) ? sc.delete(id) : sc.add(id);
        b.classList.toggle("on");
        const c2 = scriptCounts([...sc]);
        $(".scriptcount").textContent = `${sc.size} gewählt: ${c2.townsfolk} Dorfb. · ${c2.outsider} Außens. · ${c2.minion} Schergen · ${c2.demon} Dämonen · ${c2.traveller} Reisende`;
      }));
      $$("[data-preset]").forEach(b => b.addEventListener("click", () => {
        const k = b.dataset.preset;
        if (k === "none") sc.clear();
        else ROLES.filter(r => r.ed === k && r.t !== "fabled").forEach(r => sc.add(r.id));
        draw();
      }));
      $$("[data-sfilter]").forEach(b => b.addEventListener("click", () => { scriptFilter = b.dataset.sfilter; draw(); }));
      $("#importscript2").addEventListener("click", () => { closeModal(); scriptImport(); });
      $("#hbnew").addEventListener("click", () => { game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id); save(); closeModal(); homebrewEditor(null); });
      $$("[data-hbedit]").forEach(b => b.addEventListener("click", () => { game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id); save(); closeModal(); homebrewEditor(b.dataset.hbedit); }));
      $("#savescript").addEventListener("click", () => {
        game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id);
        game.scriptName = "";
        game.selected = game.selected.filter(id => sc.has(id));
        game.bluffs = [];
        save(); closeModal(); renderSL();
      });
    };
    draw();
  }

  // =====================================================================
  //  NACHTAKTIONEN AM HANDY (nur online, vom Spielleiter an/aus)
  // =====================================================================
  // n = Anzahl Spieler, min = Mindestzahl, self = darf sich selbst wählen, dead = darf Tote wählen,
  // role = wählt (zusätzlich) eine Rolle ("good" | "all"), mark = Marker, der automatisch gesetzt wird
  // Amnesiker: erprobte geheime Fähigkeiten. like = verhält sich nachts wie diese Rolle (Aufgaben, Infos, Vorschläge).
  // pick = eigene Fähigkeit, bei der er nachts Spieler wählt.
  const AMNESIAC_IDEAS = [
    { k: "a_empath", cat: "Zahl", like: "empath", text: "Jede Nacht erfährst du, wie viele deiner beiden lebenden Nachbarn böse sind." },
    { k: "a_oracle", cat: "Zahl", like: "oracle", text: "Jede Nacht (außer der ersten) erfährst du, wie viele tote Spieler böse sind." },
    { k: "a_chef", cat: "Zahl", like: "chef", text: "Du beginnst mit dem Wissen, wie viele Paare böser Spieler nebeneinander sitzen." },
    { k: "a_clock", cat: "Zahl", like: "clockmaker", text: "Du beginnst mit dem Wissen, wie viele Plätze der Dämon von seinem nächsten Schergen entfernt sitzt." },
    { k: "a_town", cat: "Zahl", text: "Jede Nacht erfährst du, wie viele deiner lebenden Nachbarn Dorfbewohner sind." },
    { k: "a_votes", cat: "Zahl", text: "Jede Nacht erfährst du, wie viele böse Spieler heute abgestimmt haben." },
    { k: "a_flower", cat: "Ja/Nein", like: "flowergirl", text: "Jede Nacht (außer der ersten) erfährst du, ob der Dämon heute abgestimmt hat." },
    { k: "a_crier", cat: "Ja/Nein", like: "towncrier", text: "Jede Nacht (außer der ersten) erfährst du, ob heute ein Scherge nominiert hat." },
    { k: "a_ft", cat: "Ja/Nein", like: "fortuneteller", text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob einer davon der Dämon ist. (Ein Guter gilt als Dämon.)" },
    { k: "a_minion2", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob mindestens einer davon ein Scherge ist." },
    { k: "a_outsider", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du einen Spieler: Du erfährst, ob er ein Außenseiter ist." },
    { k: "a_nominated", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du einen Spieler: Du erfährst, ob er heute nominiert hat." },
    { k: "a_exec", cat: "Ja/Nein", text: "Jede Nacht erfährst du, ob der heute Hingerichtete böse war." },
    { k: "a_idiot", cat: "Gesinnung", like: "villageidiot", text: "Jede Nacht wählst du einen Spieler: Du erfährst seine Gesinnung." },
    { k: "a_seam", cat: "Gesinnung", pick: true, text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob sie die gleiche Gesinnung haben." },
    { k: "a_side", cat: "Richtung", text: "Jede Nacht erfährst du, ob der nächste böse Spieler im oder gegen den Uhrzeigersinn sitzt." },
    { k: "a_under", cat: "Rolle", like: "undertaker", text: "Jede Nacht (außer der ersten) erfährst du die Rolle des heute Hingerichteten." },
    { k: "a_dreamer", cat: "Rolle", like: "dreamer", text: "Jede Nacht wählst du einen Spieler: Du erfährst eine gute und eine böse Rolle – eine davon hat er." },
    { k: "a_wash", cat: "Rolle", like: "washerwoman", text: "Du beginnst mit dem Wissen, dass einer von 2 Spielern eine bestimmte Dorfbewohner-Rolle hat." },
    { k: "a_inv", cat: "Rolle", like: "investigator", text: "Du beginnst mit dem Wissen, dass einer von 2 Spielern eine bestimmte Schergen-Rolle hat." },
    { k: "a_letter", cat: "Rolle", text: "Jede Nacht erfährst du einen Buchstaben aus dem Rollennamen des Dämons." },
    { k: "a_steward", cat: "Spieler", like: "steward", text: "Du beginnst mit dem Wissen, dass ein bestimmter Spieler gut ist." },
    { k: "a_noble", cat: "Spieler", like: "noble", text: "Du beginnst mit 3 Spielern, von denen genau einer böse ist." },
    { k: "a_balloon", cat: "Spieler", like: "balloonist", text: "Jede Nacht erfährst du einen Spieler eines anderen Rollentyps als in der Nacht davor." },
    { k: "a_chamber", cat: "Spieler", like: "chambermaid", text: "Jede Nacht wählst du 2 Spieler (nicht dich): Du erfährst, wie viele davon heute Nacht wegen ihrer Fähigkeit aufgewacht sind." },
    { k: "a_monk", cat: "Schutz", like: "monk", text: "Jede Nacht (außer der ersten) wählst du einen Spieler (nicht dich): Er ist heute Nacht vor dem Dämon geschützt." },
    { k: "a_soldier", cat: "Passiv", like: "soldier", text: "Du bist vor dem Dämon geschützt." },
    { k: "a_raven", cat: "Passiv", like: "ravenkeeper", text: "Stirbst du nachts, wirst du geweckt und erfährst die Rolle eines Spielers deiner Wahl." },
    { k: "a_mayor", cat: "Passiv", like: "mayor", text: "Leben nur noch 3 Spieler und gibt es keine Hinrichtung, gewinnt dein Team. Stirbst du nachts, stirbt vielleicht ein anderer." },
    { k: "a_drunkmin", cat: "Wirkung", pick: true, text: "Jede Nacht wählst du einen Spieler: Ist er ein Scherge, ist er bis zur Dämmerung betrunken." }
  ];
  const amnIdea = k => AMNESIAC_IDEAS.find(x => x.k === k);

  const ACTIONS = {
    fortuneteller: { n: 2, self: true, text: "Wähle zwei Spieler: Ist einer davon der Dämon?" },
    monk: { n: 1, mark: "protect", text: "Wähle einen Spieler, den du heute Nacht beschützt." },
    butler: { n: 1, mark: "master", text: "Wähle deinen Meister für morgen." },
    poisoner: { n: 1, self: true, mark: "poison", text: "Wähle einen Spieler, den du vergiftest." },
    imp: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt (dich selbst = Sternenwechsel)." },
    ravenkeeper: { n: 1, self: true, dead: true, text: "Du bist gestorben: Wähle einen Spieler und erfahre seine Rolle." },
    sailor: { n: 1, self: true, text: "Wähle einen Spieler: Er oder du ist betrunken." },
    chambermaid: { n: 2, text: "Wähle zwei Spieler: Wie viele davon sind heute aufgewacht?" },
    exorcist: { n: 1, mark: "chosen", text: "Wähle einen Spieler (nicht denselben wie letzte Nacht)." },
    innkeeper: { n: 2, self: true, mark: "protect", text: "Wähle zwei Spieler, die heute nicht sterben können." },
    gambler: { n: 1, role: "all", text: "Wähle einen Spieler und rate seine Rolle." },
    courtier: { n: 0, role: "all", optional: true, text: "Willst du eine Rolle betrunken machen? (einmal pro Spiel)" },
    professor: { n: 1, dead: true, onlyDead: true, optional: true, text: "Willst du einen toten Spieler wiederbeleben? (einmal pro Spiel)" },
    devilsadvocate: { n: 1, self: true, mark: "survives", text: "Wähle einen Spieler, der eine Hinrichtung morgen überlebt." },
    assassin: { n: 1, optional: true, text: "Willst du jemanden töten, egal wie geschützt? (einmal pro Spiel)" },
    godfather: { n: 1, optional: true, text: "Ist heute ein Außenseiter gestorben? Dann wähle ein Opfer." },
    zombuul: { n: 1, optional: true, mark: "target", text: "Ist heute niemand gestorben? Dann wähle ein Opfer." },
    pukka: { n: 1, mark: "poison", keep: true, text: "Wähle einen Spieler, den du vergiftest (er stirbt in der nächsten Nacht)." },
    shabaloth: { n: 2, self: true, text: "Wähle zwei Spieler, die sterben." },
    po: { n: 3, min: 0, self: true, text: "Wähle einen Spieler – oder niemanden, um nächste Nacht drei zu töten. (Wenn du letzte Nacht niemanden gewählt hast: bis zu drei.)" },
    lunatic: { n: 1, self: true, text: "Wähle einen Spieler, den du angreifst." },
    dreamer: { n: 1, text: "Wähle einen Spieler und erfahre zwei mögliche Rollen." },
    snakecharmer: { n: 1, text: "Wähle einen Spieler: Ist es der Dämon, tauscht ihr." },
    seamstress: { n: 2, optional: true, text: "Willst du zwei Spieler vergleichen? (einmal pro Spiel)" },
    philosopher: { n: 0, role: "good", optional: true, text: "Willst du eine gute Rolle übernehmen? (einmal pro Spiel)" },
    witch: { n: 1, self: true, mark: "cursed", text: "Wähle einen Spieler, den du verfluchst." },
    cerenovus: { n: 1, self: true, role: "good", text: "Wähle einen Spieler und die Rolle, die er morgen spielen muss." },
    pithag: { n: 1, self: true, role: "all", text: "Wähle einen Spieler und die Rolle, die er werden soll." },
    fanggu: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    vigormortis: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    nodashii: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    vortox: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    villageidiot: { n: 1, text: "Wähle einen Spieler und erfahre seine Gesinnung." },
    huntsman: { n: 1, optional: true, text: "Willst du jemanden als Jungfer prüfen? (einmal pro Spiel)" },
    nightwatchman: { n: 1, optional: true, text: "Willst du dich jemandem zeigen? (einmal pro Spiel)" },
    preacher: { n: 1, mark: "sermon", text: "Wähle einen Spieler für deine Predigt." },
    lleech: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler (erste Nacht: deinen Wirt)." },
    ojo: { n: 0, role: "all", text: "Wähle eine Rolle: Ihr Besitzer stirbt." },
    alhadikhia: { n: 3, min: 0, self: true, text: "Wähle bis zu drei Spieler." },
    harpy: { n: 2, self: true, text: "Wähle zwei Spieler (der erste muss den zweiten beschuldigen)." },
    fearmonger: { n: 1, mark: "fear", text: "Wähle einen Spieler, den du fürchten lässt." },
    widow: { n: 1, self: true, mark: "poison", keep: true, text: "Wähle einen Spieler, den du vergiftest." },
    ogre: { n: 1, mark: "friend", text: "Wähle einen Spieler, dessen Gesinnung du übernimmst." },
    bureaucrat: { n: 1, text: "Wähle einen Spieler: Seine Stimme zählt morgen dreifach." },
    thief: { n: 1, text: "Wähle einen Spieler: Seine Stimme zählt morgen negativ." },
    harlot: { n: 1, text: "Wähle einen Spieler, den du besuchst." },
    bonecollector: { n: 1, dead: true, onlyDead: true, optional: true, text: "Willst du einem Toten seine Fähigkeit zurückgeben? (einmal pro Spiel)" },
    lycanthrope: { n: 1, text: "Wähle einen lebenden Spieler." },
    acrobat: { n: 1, text: "Wähle einen Spieler." },
    amnesiac: { n: 2, min: 1, self: true, text: "Deine unbekannte Fähigkeit verlangt eine Wahl: Wähle einen oder zwei Spieler." }
  };
  const nightOn = () => !!((game.online || game.test) && game.nightActions);
  // Kann dieser Platz Aufgaben am Handy bekommen? (verbundenes Handy oder Test-Bot)
  const isBot = x => !!(x && x.pid && String(x.pid).startsWith("bot-"));
  const reachable = x => !!(x && x.pid && (isBot(x) || lobby[x.pid]));
  // Als welche Rolle handelt dieser Spieler? (Säufer/Marionette glauben an ihre Rolle, Philosoph an die gewählte)
  const actingRole = x => x.role === "philosopher" && x.gained ? x.gained : x.role === "amnesiac" && x.amn && x.amn.like ? x.amn.like : shownRole(x.role);

  function nightActionsBar(steps) {
    if (!game.online && !game.test) return "";
    if (!game.nightActions) return `<p class="small">📲 Nachtaktionen am Handy sind aus – einschalten unter ⚙️ Einstellungen.</p>`;
    const seq = game.seq && game.seq.night === game.nightNo ? game.seq : null;
    const asks = Object.values(game.asks || {}).filter(a => a.night === game.nightNo);
    let body;
    if (seq && !seq.done) {
      const answered = asks.filter(a => a.done).length;
      const results = (game.acts || []).filter(x => x.night === game.nightNo && x.round === seq.round);
      body = `<div class="seqbox">
        <p><b>Schritt ${seq.count}: ${esc(roleName(seq.step))}</b> · ${answered} von ${asks.length} Handys haben geantwortet</p>
        ${results.length ? `<p class="okmsg">✅ ${results.map(x => `${esc(game.seats[x.i].name)}: ${x.skip ? "nichts" : esc(describePick(x))}`).join(" · ")}</p>` : `<p class="small wait">⏳ warte auf die Wahl …</p>`}
        <p class="small">Werte jetzt diesen Schritt aus und schick nötige Infos (Knopf „📱 Info“ in der Liste). Dann weiter.</p>
        <div class="row wrap"><button class="btn primary" id="seqnext">▶ Nächster Schritt</button><button class="btn" id="seqstop">⏹ Beenden</button></div>
      </div>`;
    } else {
      const real = asks.filter(a => !a.sleep);
      body = `${seq && seq.done ? `<p class="okmsg">✅ Alle Schritte dieser Nacht sind durch.</p>` : ""}
      <div class="row wrap">
        <button class="btn primary" id="naall">🌙 Alle auf einmal</button>
        <button class="btn" id="naseq">🪜 Schritt für Schritt</button>
        <button class="btn" id="natable">🪑 Wie am Tisch</button>
        ${asks.length && !seq ? `<span class="small">${real.filter(a => a.done).length} von ${real.length} Aktionen beantwortet</span>` : ""}
      </div>
      <details class="small nahelp"><summary>ⓘ Was bedeuten die drei Varianten?</summary><p><b>Alle auf einmal:</b> schnell – alle wählen gleichzeitig, du wertest danach in der Reihenfolge der Liste aus.<br>
      <b>Schritt für Schritt:</b> regelgenau – bei jedem Schritt der Nachtreihenfolge sind alle Handys dran; nur wer wirklich dran ist, bekommt die echte Aufgabe.<br>
      <b>Wie am Tisch:</b> alle Handys schlafen ein, du weckst jeden Spieler einzeln mit 👁️ und zeigst ihm seine Info groß auf seinem Handy.</p></details>`;
    }
    if (tableOn()) {
      const ps = game.seats.filter(x => reachable(x));
      body = `<div class="seqbox">
        <p><b>🪑 Wie am Tisch</b> · 😴 ${ps.length} Handy(s) schlafen</p>
        <p class="small">Geh die Liste von oben nach unten durch: <b>👁️ Wecken</b> bei Rollen mit Aktion, <b>👁️ Wecken &amp; zeigen</b> bei Rollen mit Info. Der Spieler sieht nur seine eigene Aufgabe und schläft danach wieder ein.</p>
        <div class="row wrap"><button class="btn primary" id="tabledawn">☀️ Morgen verkünden</button><button class="btn" id="tablestop">⏹ Abbrechen</button></div>
      </div>`;
    }
    return `<div class="box nabar">
      <label class="switch"><input type="checkbox" id="natoggle" checked><span><b>📲 Nachtaktionen am Handy</b> sind an. Spieler ohne Aufgabe bekommen eine Schein-Auswahl, damit niemand auffällt.</span></label>
      ${body}
    </div>`;
  }

  // „Wie am Tisch“ läuft in dieser Nacht
  const tableOn = () => !!((game.online || game.test) && game.nightActions && game.tableNight && game.tableNight === game.nightNo);

  function wakeStatusHtml(stepId) {
    const rows = stepHolders(stepId).filter(([x]) => ACTS_WHEN_DEAD.includes(stepId) ? deathTriggered(x, stepId) : x.alive && !killedBefore(x, stepId));
    return rows.length ? `<div class="actstat">${rows.map(([x, i]) => {
      const w = (game.wakes || {})[i];
      const st = !reachable(x) ? `<span class="small">nicht online – bitte wie gewohnt wecken</span>`
        : !w || w.night !== game.nightNo ? `<span class="small">schläft</span>`
        : w.done ? `<span class="okmsg">✅ hat die Info gesehen</span>` : `<span class="wait">👁️ ist wach …</span>`;
      return `<div class="actrow"><b>${esc(x.name)}:</b> ${st}</div>`;
    }).join("")}</div>` : "";
  }

  // Morgen: Nacht beenden, Tag beginnen, Tote der Nacht verkünden
  // ---------- Morgen: Wer stirbt durch den Dämon? ----------
  const KILL_STEPS = ["imp", "fanggu", "vigormortis", "nodashii", "vortox", "zombuul", "shabaloth", "po", "assassin", "godfather", "lleech"];
  const impaired = x => { const m = x.marks || []; return m.includes("poison") || m.includes("drunk") || x.role === "drunk"; };
  // Rollen, die ihren eigenen Tod verhindern oder vortäuschen (für Nacht UND Hinrichtung).
  // Gibt null zurück, wenn nichts Besonderes passiert.
  function deathRule(x) {
    if (impaired(x)) return null;
    if (x.role === "sailor") return { dies: false, why: "⚓ Seemann – kann nicht sterben, solange er nüchtern ist" };
    if (x.role === "vizier" && game.phase === "day") return { dies: false, why: "👳 Wesir – kann tagsüber nicht sterben" };
    if (hbHas(x.role, "unkillable")) return { dies: false, why: `🛡️ ${roleName(x.role)} – kann nicht sterben, solange nüchtern` };
    if (hbHas(x.role, "fool") && !x.used) return { dies: false, fool: true, why: `🃏 ${roleName(x.role)} – erster Tod wird verhindert` };
    if (x.role === "fool" && !x.used) return { dies: false, fool: true, why: "🃏 Narr – sein erster Tod wird verhindert (Fähigkeit danach verbraucht)" };
    if (x.role === "zombuul" && !x.zfake) return { dies: true, zombuul: true, why: "🧟 Zombuul – erster Tod: gilt als tot, lebt aber heimlich weiter" };
    return null;
  }
  // Scharlachrote Frau: Stirbt der Dämon bei 5+ Lebenden (vor dem Tod gezählt, ohne Reisende),
  // wird sie der Dämon – aber nicht, wenn sie vergiftet oder betrunken ist.
  // Tollpatsch: Stirbt er (und ist gesund), muss er öffentlich einen lebenden Spieler wählen.
  // Stirbt die Witwe, endet ihr Gift
  function widowCheck(x) {
    if (!x || x.alive || x.role !== "widow") return;
    game.seats.forEach(y => {
      if (!y.widowPoison) return;
      delete y.widowPoison;
      y.marks = (y.marks || []).filter(m => m !== "poison"); y.keep = (y.keep || []).filter(m => m !== "poison");
      hist(`💧 Die Witwe ist tot – ${y.name} ist nicht mehr vergiftet`);
    });
  }
  function klutzCheck(x) {
    if (!x || x.alive || x.zfake || x.role !== "klutz") return;
    game.klutzPending = game.seats.indexOf(x);
    game.klutzWeak = impaired(x);
  }
  function klutzPopup() {
    const i = game.klutzPending;
    if (i === undefined || i === null || !modal.classList.contains("hidden")) return false;
    const x = game.seats[i];
    if (!x || x.alive) { game.klutzPending = null; return false; }
    const alive = game.seats.map((y, k) => k).filter(k => game.seats[k].alive);
    if (!alive.length) { game.klutzPending = null; return false; }
    const botPick = isBot(x) ? alive[randInt(alive.length)] : null;
    openModal(`<h2>🍌 ${esc(x.name)} ist der Tollpatsch</h2>
      <p>Er ist gestorben und muss jetzt <b>öffentlich</b> einen lebenden Spieler wählen. Ist der Gewählte böse, verliert Gut sofort.</p>
      ${game.klutzWeak ? `<p class="warnmsg">⚠️ Nur für dich: Er ist vergiftet/betrunken – lass ihn trotzdem wählen, aber egal wen er wählt, es passiert nichts.</p>` : ""}
      ${botPick !== null ? `<p class="okmsg">🤖 ${esc(x.name)} wählt: <b>${esc(game.seats[botPick].name)}</b></p>` : `<p class="small">Tippe an, wen er wählt:</p>`}
      <div class="infopick">${alive.map(k => `<button class="btn pickbtn sm ${k === botPick ? "primary" : ""}" data-klutz="${k}">${esc(game.seats[k].name)}</button>`).join("")}</div>
      <div id="klutzres"></div>`);
    const choose = k => {
      const t = game.seats[k], evil = !seatGood(t) && !game.klutzWeak;
      const healthy = !impaired(t);
      const hint = t.role === "spy" && healthy ? "🕵️ Spion (gesund): du darfst ihn als gut werten."
        : t.role === "recluse" && healthy ? "🏚️ Einsiedler (gesund): du darfst ihn als böse werten." : "";
      $("#klutzres").innerHTML = `<div class="box">${esc(t.name)} ist <b>${seatGood(t) ? "gut" : "böse"}</b> (${esc(roleName(t.role))}).${game.klutzWeak ? " Wegen Gift/Trunkenheit ohne Wirkung." : ""}
        ${hint ? `<br><span class="mismsg">${esc(hint)}</span>` : ""}
        <div class="row wrap"><button class="btn ${evil ? "primary" : ""}" id="klutzevil">😈 Zählt als böse – Gut verliert</button>
        <button class="btn ${evil ? "" : "primary"}" id="klutzgood">😇 Zählt als gut – weiter</button></div></div>`;
      const done = lose => {
        game.klutzPending = null;
        hist(`🍌 ${x.name} (Tollpatsch) wählt ${t.name} – ${lose ? "böse, Gut verliert" : game.klutzWeak ? "ohne Wirkung (vergiftet/betrunken)" : "gut, das Spiel geht weiter"}`);
        if (game.klutzWeak && !seatGood(t)) abn(x, "Tollpatsch wählt Böse, ist aber vergiftet – keine Wirkung");
        if (lose) { game.klutzLoss = { by: x.name, pick: t.name }; game.ignoreEnd = null; game.endPopped = null; }
        save(); closeModal(); renderSL();
      };
      $("#klutzevil").addEventListener("click", () => done(true));
      $("#klutzgood").addEventListener("click", () => done(false));
    };
    $$("[data-klutz]").forEach(b => b.addEventListener("click", () => choose(+b.dataset.klutz)));
    if (botPick !== null) choose(botPick);
    return true;
  }

  let swMsg = null;
  function swCheck(x) {
    swMsg = null;
    klutzCheck(x);
    widowCheck(x);
    if (!x || x.alive || x.zfake || ROLE_BY_ID[x.role].t !== "demon") return;
    const S = game.seats;
    const sw = S.find(y => y.role === "scarletwoman" && y.alive);
    if (!sw) return;
    const before = S.filter(y => y.alive && !y.trav).length + (x.trav ? 0 : 1);
    if (before < 5) { hist(`💋 Nur ${before} Spieler lebten – die Scharlachrote Frau übernimmt nicht`); return; }
    if (impaired(sw)) {
      hist(`💋 ${sw.name} (Scharlachrote Frau) ist vergiftet/betrunken – übernimmt nicht`);
      toast(swMsg = `💋 ${sw.name} ist vergiftet/betrunken – sie wird NICHT zum Dämon`);
      return;
    }
    sw.swFrom = { seat: S.indexOf(x) };
    sw.role = x.role;
    sw.swPending = true;
    sw.marks = [...new Set([...(sw.marks || []), "isdemon"])];
    hist(`👑 ${sw.name} (Scharlachrote Frau) ist jetzt der Dämon: ${roleName(x.role)}`);
    toast(swMsg = `👑 ${sw.name} wird zum ${roleName(x.role)} – zeig es ihr heute Nacht`);
  }
  // Wird der Dämon wiederbelebt / Hinrichtung rückgängig: Übernahme zurücknehmen
  function swRevert(i) {
    game.seats.forEach(y => {
      if (!y.swFrom || y.swFrom.seat !== i) return;
      y.role = "scarletwoman"; y.swPending = false; delete y.swFrom;
      y.marks = (y.marks || []).filter(m => m !== "isdemon");
      hist(`↩︎ ${y.name} ist wieder die Scharlachrote Frau`);
    });
  }

  // Tod anwenden (inkl. Narr verbraucht / Zombuul scheintot)
  function applyDeath(x, rule) {
    if (rule && rule.fool) { x.used = true; hist(`🃏 ${x.name} (Narr) überlebt seinen ersten Tod`); return; }
    if (rule && rule.dies === false) { hist(`🛡️ ${x.name} überlebt (${rule.why})`); return; }
    if (rule && rule.zombuul) { x.zfake = true; x.alive = false; histDeath(x); hist(`🧟 ${x.name} (Zombuul) wirkt tot, lebt aber weiter`); return; }
    if (!x.alive && x.zfake) { x.zfake = false; hist(`🧟 ${x.name} (Zombuul) stirbt jetzt wirklich`); swCheck(x); return; }
    x.alive = false; histDeath(x);
    swCheck(x);
  }

  function nightKills() {
    const S = game.seats, n = game.nightNo;
    const attacks = new Map(); // Ziel -> Angreifer
    (game.acts || []).filter(a => a.night === n && !a.skip && !a.undone && !a.fake && !(S[a.i] && S[a.i].role === "lunatic") && KILL_STEPS.includes(a.step) && !(a.step === "lleech" && n === 1))
      .forEach(a => (a.picks || []).forEach(k => { if (!attacks.has(k)) attacks.set(k, { step: a.step, by: a.i }); }));
    S.forEach((x, k) => { if ((x.marks || []).includes("target") && !attacks.has(k)) attacks.set(k, { step: null, by: null }); });
    // Pukka: Wer seit einer früheren Nacht vergiftet ist, stirbt jetzt
    const pukka = S.findIndex(y => y.role === "pukka" && (y.alive || y.zfake));
    S.forEach((x, k) => { if (x.pukkaNight && x.pukkaNight < n && x.alive && !attacks.has(k)) attacks.set(k, { step: "pukka", by: pukka >= 0 ? pukka : null }); });
    // Lykanthrop: tötet einen Guten – dann tötet der Dämon heute nicht
    let lycHit = false;
    (game.acts || []).filter(a => a.night === n && a.step === "lycanthrope" && !a.skip && !a.undone && S[a.i] && S[a.i].role === "lycanthrope" && !impaired(S[a.i])).forEach(a => {
      const k = a.picks[0], t = S[k];
      if (t && t.alive && seatGood(t)) { lycHit = true; attacks.set(k, { step: "lycanthrope", by: a.i, hbkill: true, front: true }); }
    });
    // Akrobat: Ist sein gewählter Spieler heute betrunken/vergiftet, stirbt der Akrobat
    (game.acts || []).filter(a => a.night === n && a.step === "acrobat" && !a.skip && !a.undone && S[a.i] && S[a.i].role === "acrobat" && S[a.i].alive && !impaired(S[a.i])).forEach(a => {
      const t = S[a.picks[0]];
      if (t && impaired(t) && !attacks.has(a.i)) attacks.set(a.i, { step: "acrobat", by: a.i, hbkill: true, acro: t.name });
    });
    // Homebrew-Rollen mit dem Baustein „stirbt“
    (game.acts || []).filter(a => a.night === n && !a.skip && !a.undone && !a.fake && ROLE_BY_ID[a.step] && hbHas(a.step, "kill", "kill_evil", "kill_minion"))
      .forEach(a => (a.picks || []).forEach(k => {
        const fx = hbFind(a.step, ["kill", "kill_evil", "kill_minion"]), t = S[k];
        if (!t || (fx === "kill_evil" && seatGood(t)) || (fx === "kill_minion" && ROLE_BY_ID[t.role].t !== "minion")) return;
        if (!attacks.has(k)) attacks.set(k, { step: a.step, by: a.i, hbkill: true });
      }));
    const out = [];
    attacks.forEach((at, k) => {
      const x = S[k];
      if (!x || !x.alive) return;
      const attacker = at.by !== null ? S[at.by] : S.find(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
      const m = x.marks || [];
      const strong = at.step === "assassin" || !!at.hbkill;
      let jump = null;
      const demonAtt = !at.hbkill && at.step !== "assassin" && (!at.step || (ROLE_BY_ID[at.step] && ROLE_BY_ID[at.step].t === "demon"));
      let dies = true, why = at.step === "pukka" && x.pukkaNight && x.pukkaNight < n ? `stirbt durch die Pukka (vergiftet seit Nacht ${x.pukkaNight}) – danach wieder gesund` : `angegriffen${at.step ? ` (${roleName(at.step)})` : ""}`;
      if (at.acro) why = `🤸 Akrobat: Sein gewählter Spieler ${at.acro} ist betrunken/vergiftet – der Akrobat stirbt`;
      if (demonAtt && game.princessBlock === n) { dies = false; why = "👸 Prinzessin: Der Dämon tötet heute Nacht nicht"; }
      else if (demonAtt && lycHit) { dies = false; why = "🐺 Der Lykanthrop hat einen Guten getötet – der Dämon tötet heute Nacht nicht"; }
      else if (at.acro) { /* Akrobat stirbt, kein Schutz */ }
      else if (attacker && impaired(attacker)) { dies = false; why = `${attacker.name} ist vergiftet/betrunken – der Angriff wirkt nicht`; }
      else if (!strong && m.includes("protect")) { dies = false; why = "🛡️ geschützt – überlebt"; }
      else if (!strong && x.role === "soldier" && !impaired(x)) { dies = false; why = "🛡️ Soldat – der Dämon kann ihn nicht töten"; }
      else if (!strong && hbHas(x.role, "immune") && !impaired(x)) { dies = false; why = `🛡️ ${roleName(x.role)} – der Dämon kann ihn nicht töten`; }
      else if (!strong && m.includes("cantdie")) { dies = false; why = "🫖 Teedame – kann nicht sterben"; }
      else if (deathRule(x)) { const r = deathRule(x); dies = r.dies; why = r.why; }
      else if (at.by === k && x.role !== "imp") why = `${roleName(x.role)} hat sich selbst gewählt und stirbt (nur der Imp kann einen Sternenwechsel machen)`;
      else if (at.step === "fanggu" && at.by !== null && at.by !== k && !game.fgJumped && ROLE_BY_ID[x.role].t === "outsider") {
        why = `🦇 Fang Gu springt: ${x.name} (Außenseiter) wird der neue Fang Gu (böse) – der alte Fang Gu ${S[at.by].name} stirbt stattdessen`;
        dies = false; jump = at.by;
      }
      else if (at.by === k) {
        const sw = S.find(y => y.role === "scarletwoman" && y.alive && !impaired(y));
        why = sw && S.filter(y => y.alive && !y.trav).length >= 5
          ? `Dämon hat sich selbst gewählt – Sternenwechsel: ${sw.name} (Scharlachrote Frau) wird automatisch der neue Dämon`
          : "Dämon hat sich selbst gewählt – Sternenwechsel: Du wählst gleich, welcher Scherge der neue Dämon wird";
      }
      else if (x.role === "mayor" && !impaired(x)) why = "Bürgermeister: Du darfst den Tod auf einen anderen Spieler umlenken (dann hier abwählen und den anderen tot setzen)";
      out.push({ k, dies, why, step: at.step || (attacker ? attacker.role : null), self: at.by === k, jump });
    });
    return out;
  }
  // Hat der Dämon gerade einen Rabenhüter (oder Weisen) getötet? Dann sofort dessen Handy fragen.
  function wakeDeathTriggered() {
    if (!nightOn() || (game.seq && game.seq.night === game.nightNo && !game.seq.done)) return;
    ["ravenkeeper", "sage"].forEach(id => {
      stepHolders(id).forEach(([x, i]) => {
        if (!deathTriggered(x, id) || lastAct(i, id)) return;
        const a = (game.asks || {})[i];
        if (a && a.night === game.nightNo && a.step === id && !a.done) return;
        if (!ACTIONS[id] || !reachable(x)) { toast(`🪶 ${x.name} (${roleName(id)}) wurde getötet – jetzt wecken!`); return; }
        askSeat(i, false, id);
        toast(`🪶 ${x.name} (${roleName(id)}) wurde getötet – sein Handy fragt jetzt nach seiner Wahl`);
      });
    });
    save(); refreshHostView();
  }

  // Sternenwechsel: Der Dämon hat sich selbst getötet -> ein Scherge wird der neue Dämon
  function starpassDialog(dead) {
    const S = game.seats;
    if (S.some(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon")) return false; // z. B. Scharlachrote Frau hat übernommen
    const mins = S.map((y, i) => i).filter(i => S[i].alive && ROLE_BY_ID[S[i].role].t === "minion");
    if (!mins.length) return false;
    openModal(`<h2>⭐ Sternenwechsel</h2>
      <p>${esc(dead.name)} (${esc(roleName(dead.role))}) hat sich selbst getötet. Ein lebender Scherge wird jetzt der neue ${esc(roleName(dead.role))}.</p>
      <p class="small">Wecke ihn noch in dieser Nacht und zeige „Du bist“ + ${esc(roleName(dead.role))}. Im Online-Spiel sieht er die neue Rolle sofort auf seinem Handy.</p>
      <div class="infopick">${mins.map(i => `<button class="btn pickbtn" data-star="${i}">${esc(S[i].name)} <small>(${esc(roleName(S[i].role))})</small></button>`).join("")}</div>`);
    $$("[data-star]").forEach(b => b.addEventListener("click", () => {
      const m = S[+b.dataset.star];
      hist(`⭐ Sternenwechsel: ${m.name} (${roleName(m.role)}) ist jetzt ${roleName(dead.role)}`, "night");
      m.role = dead.role; delete m.align;
      m.marks = [...new Set([...(m.marks || []), "isdemon"])];
      game.ignoreEnd = null; game.endPopped = null;
      save(); closeModal(); startDay();
      toast(`⭐ ${m.name} ist jetzt ${roleName(dead.role)}${reachable(m) ? " – sieht es auf dem Handy" : " – zeig es ihm"}`);
    }));
    return true;
  }

  function gameTransfer() {
    const json = JSON.stringify({ app: "botc-grimoire", v: 1, at: new Date().toISOString(), game });
    openModal(`<h2>💾 Spielstand</h2>
      <p class="small">Sichern, um später weiterzumachen – oder auf ein anderes Handy übertragen (z. B. wenn dein Akku leer ist).</p>
      <div class="row wrap"><button class="btn primary" id="gsdl">💾 Als Datei sichern</button><button class="btn" id="gscopy">📋 Kopieren</button></div>
      <h4>📂 Spielstand laden</h4>
      <input type="file" id="gsfile" accept=".json,application/json,text/plain">
      <textarea id="gstext" rows="3" placeholder="…oder hier einfügen"></textarea>
      <div class="row end"><button class="btn" id="gsload">Laden</button></div>
      <p class="small">Online-Räume lassen sich nicht auf ein anderes Handy mitnehmen: Dort geht das Spiel offline weiter – starte einen neuen Raum, die Spieler treten bei und du ordnest sie unter „3 · Verteilen“ wieder ihren Plätzen zu.</p>`);
    $("#gsdl").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = `clocktower-spielstand-nacht${game.nightNo}.json`;
      document.body.appendChild(a); a.click(); a.remove();
    });
    $("#gscopy").addEventListener("click", () => { (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => toast("📋 Spielstand kopiert"), () => toast("Kopieren nicht möglich – nimm „Als Datei sichern“")); });
    $("#gsfile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("#gstext").value = rd.result; }; rd.readAsText(f); });
    $("#gsload").addEventListener("click", () => {
      let d; try { d = JSON.parse($("#gstext").value); } catch (e) { toast("Das ist kein gültiger Spielstand."); return; }
      const g = d && d.game;
      if (!g || !Array.isArray(g.seats)) { toast("Das ist kein gültiger Spielstand."); return; }
      if (!confirm("Aktuelles Spiel durch diesen Spielstand ersetzen? (Mit ↩️ Rückgängig kommst du zurück.)")) return;
      save();
      if (g.online && !(game.online && game.online.code === g.online.code)) { g.online = null; g.seats.forEach(x => { x.pid = null; }); g.pids = []; }
      game = g; registerHomebrew(game.homebrew);
      save(); closeModal(); renderSL();
      toast(`📂 Spielstand geladen – Nacht ${game.nightNo}, ${game.seats.length} Spieler`);
    });
  }
  function nightSummaryHtml() {
    const n = game.nightNo;
    const ev = (game.history || []).filter(h => h.n === n && h.ph === "night" && !/^🌙 Nacht \d+ beginnt/.test(h.t));
    const waiting = Object.entries(game.asks || {}).filter(([, a]) => a.night === n && !a.done && !a.sleep).map(([i, a]) => `${game.seats[i].name} (${roleName(a.step)})`);
    const marks = game.seats.filter(x => (x.marks || []).some(m => ["poison", "drunk", "protect", "target"].includes(m))).map(x => `${esc(x.name)} ${(x.marks || []).filter(m => ["poison", "drunk", "protect", "target"].includes(m)).map(m => (markerByKey(m) || {}).i).join("")}`);
    return `<div class="box nightsum">
      ${ev.length ? `<ul>${ev.map(h => `<li>${esc(h.t)}</li>`).join("")}</ul>` : `<p class="small">Noch nichts passiert.</p>`}
      ${marks.length ? `<p class="small"><b>Marker jetzt:</b> ${marks.join(" · ")}</p>` : ""}
      ${waiting.length ? `<p class="warnmsg">⏳ Wartet noch: ${waiting.map(esc).join(", ")}</p>` : ""}</div>`;
  }
  function dawnDialog() {
    const kills = nightKills();
    if (!kills.length) return startDay();
    const missed = kills.filter(x => x.dies && game.seats[x.k].role === "ravenkeeper" && !lastAct(x.k, "ravenkeeper") && !((game.done[game.nightNo] || []).includes("ravenkeeper")));
    openModal(`<h2>☀️ Wer stirbt heute Nacht?</h2>
      <details class="nightsumwrap"><summary>📋 Was heute Nacht passiert ist</summary>${nightSummaryHtml()}</details>
      ${missed.map(x => `<p class="warnmsg">🪶 ${esc(game.seats[x.k].name)} ist der Rabenhüter und stirbt – er wurde noch nicht geweckt! Tippe „Zurück“ und wecke ihn zuerst (Schritt Rabenhüter).</p>`).join("")}
      <p class="small">So sieht es nach den Regeln aus. Ändere den Haken nur, wenn die App etwas nicht weiß: ein fehlender Marker (z. B. Mönch-Schutz vergessen), eine Rolle wie Narr oder Seemann, die den Tod verhindert, oder wenn du beim Bürgermeister den Tod umlenkst.</p>
      <div class="dawnlist">${kills.map(x => `<label class="switch"><input type="checkbox" data-kill="${x.k}" ${x.dies ? "checked" : ""}>
        <span><b>${esc(game.seats[x.k].name)}</b> <span class="small">(${esc(roleName(game.seats[x.k].role))})</span><br><span class="small">${esc(x.why)}</span></span></label>`).join("")}</div>
      <div class="row end"><button class="btn" id="dawnback">Zurück</button><button class="btn primary" id="dawnok">☀️ Morgen verkünden</button></div>`);
    $("#dawnback").addEventListener("click", closeModal);
    $("#dawnok").addEventListener("click", () => {
      $$("[data-kill]").forEach(c => {
        const x = game.seats[+c.dataset.kill], rule = deathRule(x);
        if (rule && rule.fool) { if (!c.checked) applyDeath(x, rule); else { x.alive = false; histDeath(x); swCheck(x); } return; }
        if (c.checked && x.alive) {
          applyDeath(x, rule && rule.zombuul ? rule : null);
          const kk = kills.find(e => e.k === +c.dataset.kill);
          if (!x.alive && x.role === "banshee" && !impaired(x) && kk && kk.step && ROLE_BY_ID[kk.step] && ROLE_BY_ID[kk.step].t === "demon") {
            x.banshee = true;
            hist(`😱 ${x.name} war die Banshee und wurde vom Dämon getötet – verkünde es allen! Sie darf ab jetzt 2× nominieren und 2× abstimmen.`, "night");
            setTimeout(() => toast(`😱 Verkünde: ${x.name} war die Banshee und wurde vom Dämon getötet!`), 600);
          }
        }
      });
      // Pukka-Opfer sind danach wieder gesund (ob gestorben oder geschützt)
      kills.filter(x => x.step === "pukka").forEach(x => {
        const y = game.seats[x.k];
        if (!y.pukkaNight || y.pukkaNight >= game.nightNo) return;
        delete y.pukkaNight;
        y.marks = (y.marks || []).filter(m => m !== "poison"); y.keep = (y.keep || []).filter(m => m !== "poison");
        hist(`💧 ${y.name} ist nach der Pukka wieder gesund`, "night");
      });
      closeModal();
      // Fang Gu springt in einen Außenseiter
      kills.filter(x => x.jump !== null && x.jump !== undefined).forEach(x => {
        const t = game.seats[x.k], old = game.seats[x.jump];
        if (!t.alive || !old) return;
        game.fgJumped = true;
        hist(`🦇 Der Fang Gu springt: ${t.name} (${roleName(t.role)}) ist jetzt der Fang Gu`, "night");
        t.role = "fanggu"; delete t.align;
        t.marks = [...new Set([...(t.marks || []), "jumped"])];
        applyDeath(old, null);
        game.ignoreEnd = null; game.endPopped = null;
        toast(`🦇 ${t.name} ist jetzt der Fang Gu – wecke ihn und zeig es ihm${reachable(t) ? " (steht auf seinem Handy)" : ""}`);
      });
      const self = kills.find(x => x.self && !game.seats[x.k].alive && game.seats[x.k].role === "imp");
      if (!self || !starpassDialog(game.seats[self.k])) startDay();
    });
  }

  function startDay() {
    const n = game.nightNo;
    game.lastDawnAt = Date.now();
    const dead = [], back = [];
    (game.history || []).filter(h => h.n === n && h.ph === "night").forEach(h => {
      if (h.dead && !dead.includes(h.dead)) dead.push(h.dead);
      if (h.alive) { const k = dead.indexOf(h.alive); if (k >= 0) dead.splice(k, 1); }
    });
    const died = dead.filter(name => game.seats.some(x => x.name === name && !x.alive));
    game.phase = "day";
    game.tableNight = null;
    game.asks = {};
    game.wakes = {};
    game.dawn = { n, died };
    hist(`☀️ Tag ${n} beginnt – ${died.length ? "gestorben: " + died.join(", ") : "niemand ist gestorben"}`, "day");
    save(); renderSL();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(died.length ? `Morgen: ${died.join(", ")} ist gestorben` : "Morgen: Niemand ist gestorben");
  }

  // Letztes Ergebnis eines Spielers für einen Schritt in dieser Nacht
  const lastAct = (i, step) => (game.acts || []).filter(x => x.night === game.nightNo && x.i === i && x.step === step).pop();

  function actionStatusHtml(stepId) {
    if (!ACTIONS[stepId]) return "";
    const rows = game.seats.map((x, i) => [x, i]).filter(([x]) => actingRole(x) === stepId && (ACTS_WHEN_DEAD.includes(stepId) ? deathTriggered(x, stepId) : (x.alive || x.zfake) && !killedBefore(x, stepId)));
    if (!rows.length) return "";
    return `<div class="actstat">${rows.map(([x, i]) => {
      const a = (game.asks || {})[i];
      const r = lastAct(i, stepId);
      const online = reachable(x);
      const pending = a && a.night === game.nightNo && !a.done && a.step === stepId;
      let st;
      if (pending) st = `<span class="wait">⏳ wartet …</span>`;
      else if (r) st = `<span class="okmsg">✅ ${r.skip ? "nichts gewählt" : esc(describePick(r))}</span>${online && !game.seq ? ` <button class="btn sm" data-ask="${i}">neu fragen</button>` : ""}`;
      else if (!online) st = `<span class="small">nicht online – bitte wie gewohnt wecken</span>`;
      else st = game.seq && game.seq.night === game.nightNo && !game.seq.done ? `<span class="small">kommt in der Reihenfolge dran</span>` : `<button class="btn sm ${tableOn() ? "primary" : ""}" data-ask="${i}">${tableOn() ? "👁️ Wecken" : "📲 Aufs Handy schicken"}</button>`;
      return `<div class="actrow"><b>${esc(x.name)}:</b> ${st}</div>`;
    }).join("")}</div>`;
  }
  const describePick = a => [(a.picks || []).map(k => game.seats[k] ? game.seats[k].name : "?").join(", "), a.role ? roleName(a.role) : ""].filter(Boolean).join(" · ");

  // Anfrage an ein Handy. sleep = Schein-Auswahl (keine echte Aktion)
  function askSeat(i, sleep, step, round) {
    const x = game.seats[i];
    game.asks = game.asks || {};
    game.asks[i] = { id: `${game.nightNo}-${i}-${randInt(1e6)}`, night: game.nightNo, step: sleep ? null : (step || actingRole(x)), sleep: !!sleep, round: round || null };
    if (isBot(x)) botAnswer(i, game.asks[i].id);
  }

  // Böse Bots kennen ihr Team: Schaden geht an Gute, Hilfe an Böse. Gute Bots wählen nicht sich selbst.
  const EVIL_HELPS = ["devilsadvocate"];
  function botTargets(i, step, all, n) {
    const me = game.seats[i];
    let pref = all;
    if (!seatGood(me)) {
      pref = EVIL_HELPS.includes(step) ? all.filter(k => !seatGood(game.seats[k])) : all.filter(k => seatGood(game.seats[k]));
    } else if (!["butler"].includes(step)) {
      pref = all.filter(k => k !== i);
    }
    const picked = shuffle(pref).slice(0, n);
    if (picked.length < n) picked.push(...shuffle(all.filter(k => !picked.includes(k))).slice(0, n - picked.length));
    return picked;
  }

  // ---------- Tag: Bots nominieren und stimmen ab ----------
  let botVoteRun = 0;
  function botNominate() {
    const day = today(), S = game.seats;
    const nominators = S.map((x, k) => k).filter(k => S[k].alive && isBot(S[k]) && !day.noms.some(n => n.by === k));
    if (!nominators.length) { toast("Alle lebenden Bots haben heute schon nominiert"); return; }
    const by = nominators[randInt(nominators.length)];
    let cands = S.map((x, k) => k).filter(k => k !== by && S[k].alive && !S[k].trav && !day.noms.some(n => n.on === k));
    if (!cands.length) { toast("Niemand mehr übrig, der nominiert werden kann"); return; }
    // Böse nominieren Gute, Gute raten (sie wissen ja nichts Sicheres)
    if (!seatGood(S[by])) { const good = cands.filter(k => seatGood(S[k])); if (good.length) cands = good; }
    const on = cands[randInt(cands.length)];
    game.vote = { by, on, hands: [] };
    game.voteOpen = true;
    const virgin = virginCheck(by, on);
    const cursed = virgin && virgin.stop ? null : witchCurse(by);
    save(); renderSL();
    toast((virgin && virgin.msg) || cursed || `🤖 ${S[by].name} nominiert ${S[on].name}`);
    if (!(virgin && virgin.stop)) setTimeout(botVote, 900);
  }
  // Entscheidung eines Bots: Böse schützen ihr Team, Gute sind unsicher
  function botWantsVote(k, on) {
    const S = game.seats, x = S[k];
    if (k === on) return false;
    if (x.role === "zealot" && x.alive && !impaired(x) && S.filter(y => y.alive).length >= 5) return true;
    const r = Math.random();
    if (!seatGood(x)) return seatGood(S[on]) ? r < 0.85 : r < 0.1;
    return x.alive ? r < 0.5 : r < 0.25;
  }
  function botVote() {
    const v = game.vote;
    if (!v) return;
    const run = ++botVoteRun, S = game.seats;
    const order = [];
    for (let k = 1; k <= S.length; k++) order.push((v.on + k) % S.length);
    const want = {};
    order.forEach(k => { if (isBot(S[k]) && (S[k].alive || S[k].ghost)) want[k] = botWantsVote(k, v.on); });
    // Der Butler hält sich an seine Regel
    order.forEach(k => {
      if (S[k].role !== "butler" || !want[k]) return;
      const m = S[k].marks || [];
      if (m.includes("poison") || m.includes("drunk")) return;
      const master = S.findIndex(y => (y.marks || []).includes("master"));
      if (master >= 0 && !(want[master] || v.hands.includes(master))) want[k] = false;
    });
    let step = 0;
    const tick = () => {
      if (run !== botVoteRun || game.vote !== v) return;
      if (step >= order.length) { v.botDone = true; save(); renderSL(); return; }
      const k = order[step++];
      if (k in want) v.hands = want[k] ? [...new Set([...v.hands, k])] : v.hands.filter(x => x !== k);
      v.clock = k;
      save(); renderSL();
      setTimeout(tick, k in want ? 350 : 120);
    };
    tick();
  }

  // Ein Test-Bot „überlegt“ kurz und wählt dann zufällig, aber regelgerecht.
  function botAnswer(i, id) {
    setTimeout(() => {
      const a = (game.asks || {})[i];
      if (!a || a.id !== id || a.done) return;
      const x = game.seats[i];
      const msg = { type: "action", id };
      if (!a.sleep && (ACTIONS[a.step] || {}).optional && Math.random() < 0.5) msg.skip = true;
      else if (!a.sleep) {
        const def = ACTIONS[a.step] || { n: 1 };
        const all = game.seats.map((y, k) => k).filter(k => (def.self || k !== i) && (def.onlyDead ? !game.seats[k].alive : (game.seats[k].alive || def.dead)));
        const n = def.n ? Math.max(def.min !== undefined ? def.min : 1, Math.min(def.n, all.length)) : 0;
        msg.picks = botTargets(i, a.step, all, n);
        if (def.role) {
          const pool = ROLES.filter(r => inEd(r, game.edition) && !["traveller", "fabled"].includes(r.t) && (def.role === "all" || r.t === "townsfolk" || r.t === "outsider"));
          msg.role = (pool[randInt(pool.length)] || {}).id || null;
          // Böse treffen mit Rollen-Wahlen lieber gute Rollen, die wirklich im Spiel sind
          const goodInPlay = game.seats.filter(y => y.alive && seatGood(y)).map(y => y.role);
          if (!seatGood(game.seats[i]) && a.step === "ojo" && goodInPlay.length) msg.role = goodInPlay[randInt(goodInPlay.length)];
        }
      }
      onPlayerMessage(x.pid, msg);
    }, 900 + randInt(1600));
  }

  // Wer handelt in diesem Schritt? (online, lebt – oder tot, wenn der Tod die Aktion auslöst)
  function actorsFor(stepId) {
    const role = ROLE_BY_ID[stepId], key = game.nightNo === 1 ? "n1" : "n";
    if (!ACTIONS[stepId] || !role || !role[key]) return [];
    return game.seats.map((x, i) => i).filter(i => {
      const x = game.seats[i];
      if (actingRole(x) !== stepId || !x.pid) return false;
      if (ONCE_PER_GAME.includes(stepId) && x.used) return false;
      if (stepId === "philosopher" && x.gained) return false;
      if (stepId === "amnesiac" && !(x.amn && x.amn.pick)) return false;
      return ACTS_WHEN_DEAD.includes(stepId) ? deathTriggered(x, stepId) : (x.alive || x.zfake) && !killedBefore(x, stepId);
    });
  }

  // Schritt für Schritt: nächsten Schritt mit Aktion suchen und alle Handys wecken
  function seqAdvance() {
    const order = game.nightNo === 1 ? NIGHT_FIRST : NIGHT_OTHER;
    const seq = game.seq;
    let pos = seq.pos + 1;
    while (pos < order.length && !actorsFor(order[pos]).length) pos++;
    if (pos >= order.length) { seq.done = true; game.asks = {}; save(); renderSL(); toast("Alle Schritte dieser Nacht sind durch"); return; }
    const step = order[pos], actors = actorsFor(step);
    seq.pos = pos; seq.step = step; seq.round = (seq.round || 0) + 1; seq.count = (seq.count || 0) + 1;
    game.asks = {};
    game.seats.forEach((x, i) => {
      if (!reachable(x)) return;
      if (actors.includes(i)) askSeat(i, false, step, seq.round);
      else if (x.alive) askSeat(i, true, null, seq.round);
    });
    save(); renderSL();
  }

  function bindNightActions() {
    $("#natoggle") && $("#natoggle").addEventListener("change", e => { game.nightActions = e.target.checked; game.asks = {}; game.seq = null; save(); renderSL(); });
    $("#naall") && $("#naall").addEventListener("click", () => {
      game.seq = null;
      const first = game.nightNo === 1, key = first ? "n1" : "n";
      let n = 0;
      game.seats.forEach((x, i) => {
        if (!x.alive || !reachable(x)) return;
        const r = actingRole(x), role = ROLE_BY_ID[r];
        const acts = ACTIONS[r] && role && role[key] && !ACTS_WHEN_DEAD.includes(r) && !(ONCE_PER_GAME.includes(r) && x.used) && !(r === "philosopher" && x.gained);
        askSeat(i, !acts);
        if (acts) n++;
      });
      save(); renderSL();
      toast(`Alle geweckt – ${n} mit Aktion`);
    });
    $("#naseq") && $("#naseq").addEventListener("click", () => { game.seq = { night: game.nightNo, pos: -1, round: 0, count: 0 }; seqAdvance(); });
    $("#seqnext") && $("#seqnext").addEventListener("click", () => {
      const open = Object.values(game.asks || {}).filter(a => !a.done).length;
      if (open && !confirm(`${open} Handy(s) haben noch nicht geantwortet. Trotzdem weiter?`)) return;
      seqAdvance();
    });
    $("#seqstop") && $("#seqstop").addEventListener("click", () => { game.seq = null; game.asks = {}; save(); renderSL(); });
    $("#natable") && $("#natable").addEventListener("click", () => {
      game.seq = null; game.asks = {}; game.wakes = {};
      game.tableNight = game.nightNo; game.phase = "night";
      hist("😴 Alle schlafen ein (Wie am Tisch)", "night");
      save(); renderSL();
      toast("Alle Handys schlafen jetzt");
    });
    $("#tablestop") && $("#tablestop").addEventListener("click", () => { game.tableNight = null; game.asks = {}; game.wakes = {}; save(); renderSL(); });
    $("#tabledawn") && $("#tabledawn").addEventListener("click", dawnDialog);
    $$("[data-ask]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); askSeat(+b.dataset.ask, false); save(); renderSL(); }));
  }

  function onPlayerAction(uid, msg) {
    const i = game.seats.findIndex(x => x.pid === uid);
    const w = (game.wakes || {})[i];
    if (w && w.id === msg.id) { w.done = true; save(); refreshHostView(); return; }
    const a = (game.asks || {})[i];
    if (i < 0 || !a || a.id !== msg.id) return;
    a.done = true;
    if (a.sleep) { save(); refreshHostView(); return; }
    const r = { night: game.nightNo, i, step: a.step, round: a.round, skip: !!msg.skip,
      picks: (msg.picks || []).filter(k => game.seats[k]), role: msg.role && ROLE_BY_ID[msg.role] ? msg.role : null };
    game.acts = [...(game.acts || []).filter(x => x.night >= game.nightNo - 1), r];
    const x = game.seats[i];
    const def = ACTIONS[r.step] || {};
    // Marker automatisch setzen
    // Vergiftete/betrunkene Spieler wählen trotzdem (sie wissen es nicht) – ihre Fähigkeit wirkt aber nicht.
    // Ausnahmen: Ziel des Dämons (wird am Morgen geprüft) und Meister des Butlers (nur eine Wahl, keine Wirkung).
    // Wahnsinniger (glaubt Dämon zu sein) und Marionette (glaubt gut zu sein) haben die Fähigkeit gar nicht:
    // ihre Wahl bewirkt nichts. Beim Wahnsinnigen merkt sich die App das Ziel (der echte Dämon erfährt es).
    if (["lunatic", "marionette"].includes(x.role) && r.step !== x.role) {
      r.fake = true;
      if (!r.skip && x.role === "lunatic" && ROLE_BY_ID[r.step] && ROLE_BY_ID[r.step].t === "demon") {
        r.picks.forEach(k => { const t = game.seats[k]; t.marks = [...new Set([...(t.marks || []), "lun_attack"])]; });
        hist(`🗡️ ${x.name} (Wahnsinniger) „greift“ ${r.picks.map(k => game.seats[k].name).join(", ")} an – stirbt nicht, aber der echte Dämon erfährt es`, "night");
        toast(`🗡️ Wahnsinniger hat ${r.picks.map(k => game.seats[k].name).join(", ")} gewählt – kein echter Angriff`);
      }
    }
    if (!r.skip && !r.fake) goonCheck(i, r);
    const noEffect = !r.skip && !r.fake && def.mark && impaired(x) && !["target", "master"].includes(def.mark);
    if (noEffect) {
      hist(`⚠️ ${x.name} (${roleName(r.step)}) ist vergiftet/betrunken – die Wahl (${r.picks.map(k => game.seats[k].name).join(", ")}) wirkt nicht`, "night");
      abn(x, `${roleName(r.step)}: Wahl ohne Wirkung`);
      toast(`⚠️ ${roleName(r.step)} ist vergiftet/betrunken – keine Wirkung`);
    }
    if (!r.skip && !r.fake && def.mark && !noEffect) r.picks.forEach(k => {
      const t = game.seats[k], had = (t.marks || []).includes(def.mark);
      t.marks = [...new Set([...(t.marks || []), def.mark])];
      if (def.keep) t.keep = [...new Set([...(t.keep || []), def.mark])];
      if (!had) markHist(t, def.mark, true, roleName(r.step));
      if (r.step === "pukka") t.pukkaNight = game.nightNo;
      if (r.step === "widow") t.widowPoison = true;
      // Hat das Opfer heute Nacht schon gewählt (z. B. Mönch antwortet vor dem Giftmischer)? Dann wirkt das nachträglich nicht.
      if (["poison", "drunk"].includes(def.mark)) undoPoisonedActs(k);
      if (def.mark2 && !(t.marks || []).includes(def.mark2)) { t.marks = [...t.marks, def.mark2]; markHist(t, def.mark2, true, roleName(r.step)); if (["poison", "drunk"].includes(def.mark2)) undoPoisonedActs(k); }
    });
    if (!r.skip && r.role) game.lastPicks = Object.assign(game.lastPicks || {}, { [r.step]: r.role });
    // Einmal-Fähigkeit benutzt -> ab der nächsten Nacht grau
    if (!r.skip && ONCE_PER_GAME.includes(r.step) && r.step !== "philosopher" && (r.picks.length || r.role)) {
      if (x.role === "philosopher" && x.gained === r.step) x.gainedUsed = true; else x.used = true;
      x.usedNight = game.nightNo;
    }
    const text = `🌙 ${x.name} (${roleName(r.step)}): ${r.skip ? "nichts" : describePick(r)}`;
    game.log = [...(game.log || []), { t: Date.now(), text }].slice(-20);
    hist(text, "night");
    if (!r.skip && !r.fake && r.role && r.picks.length && (["cerenovus", "pithag"].includes(r.step) || hbHas(r.step, "mad", "change"))) applyRolePick(x, r);
    if (!r.skip && !r.fake && ["sailor", "innkeeper", "courtier"].includes(r.step)) applyDrunkMaker(i, r);
    if (!r.skip && !r.fake && r.step === "snakecharmer" && r.picks.length) snakeCharm(i, r.picks[0]);
    if (!r.skip && KILL_STEPS.includes(r.step)) setTimeout(wakeDeathTriggered, 50);
    if (!r.skip && r.step === "philosopher" && r.role && x.role === "philosopher") setPhilo(i, r.role);
    else { save(); refreshHostView(); }
    notice(text);
  }

  // Schläger: Der erste Spieler, der ihn nachts mit seiner Fähigkeit wählt, ist bis zur Dämmerung betrunken,
  // und der Schläger nimmt dessen Gesinnung an.
  function goonCheck(i, r) {
    const x = game.seats[i];
    const k = (r.picks || []).find(j => j !== i && game.seats[j] && game.seats[j].role === "goon");
    if (k === undefined) return;
    const g = game.seats[k];
    if (g.goonNight === game.nightNo) return; // heute schon ausgelöst
    g.goonNight = game.nightNo;
    if (impaired(g)) { hist(`🥊 ${x.name} wählt ${g.name} (Schläger) – der ist vergiftet/betrunken, nichts passiert`, "night"); return; }
    const oldGood = seatGood(g), newAlign = seatGood(x) ? "g" : "e";
    g.align = newAlign;
    hist(`🥊 ${x.name} (${roleName(r.step)}) hat den Schläger ${g.name} gewählt – ${x.name} ist betrunken, ${g.name} ist jetzt ${newAlign === "e" ? "böse" : "gut"}`, "night");
    setDrunk(i, "Schläger");
    abn(x, `${roleName(r.step)} hat den Schläger gewählt – betrunken`);
    game.ignoreEnd = null;
    toast(`🥊 Schläger! ${x.name} ist betrunken, ${g.name} ist jetzt ${newAlign === "e" ? "BÖSE" : "gut"}${oldGood === (newAlign === "g") ? " (bleibt gleich)" : ""}${reachable(g) && oldGood !== (newAlign === "g") ? " – sieht es auf dem Handy" : ""}`);
  }

  // Schlangenbeschwörer: Trifft er den Dämon, tauschen beide Rolle und Gesinnung.
  // Der alte Dämon ist danach dauerhaft vergiftet – darum kann er nicht zurücktauschen.
  function snakeCharm(i, k) {
    const x = game.seats[i], t = game.seats[k];
    if (!t || !t.alive || ROLE_BY_ID[t.role].t !== "demon") return;
    if (impaired(x)) { hist(`🐍 ${x.name} (Schlangenbeschwörer) trifft den Dämon, ist aber vergiftet/betrunken – kein Tausch`, "night"); abn(x, "Schlangenbeschwörer trifft den Dämon, aber kein Tausch"); toast("🐍 Treffer, aber der Schlangenbeschwörer ist vergiftet/betrunken – kein Tausch"); return; }
    const demonRole = t.role, myRole = x.role, a1 = x.align, a2 = t.align;
    x.role = demonRole; t.role = myRole;
    if (a2) x.align = a2; else delete x.align;
    if (a1) t.align = a1; else delete t.align;
    t.marks = [...new Set([...(t.marks || []), "poison"])];
    t.keep = [...new Set([...(t.keep || []), "poison"])];
    // Der Schlangenbeschwörer ist vor dem Dämon dran: Eine schon abgegebene Wahl des alten Dämons zählt nicht,
    // stattdessen wählt jetzt der neue Dämon.
    (game.acts || []).filter(a => a.night === game.nightNo && a.i === k && a.step === demonRole && !a.undone).forEach(a => {
      a.undone = true;
      a.picks.forEach(j => { const y = game.seats[j]; y.marks = (y.marks || []).filter(m => m !== "target"); });
      hist(`↩︎ Die Wahl des alten Dämons ${t.name} (${a.picks.map(j => game.seats[j].name).join(", ")}) zählt nicht – der neue Dämon wählt`, "night");
    });
    const pend = (game.asks || {})[k];
    if (pend && pend.night === game.nightNo && !pend.done && pend.step === demonRole) askSeat(k, true);
    if (nightOn() && reachable(x) && !tableOn() && !(game.seq && game.seq.night === game.nightNo && !game.seq.done)) setTimeout(() => { askSeat(i, false, demonRole); save(); refreshHostView(); }, 50);
    hist(`🐍 ${x.name} (Schlangenbeschwörer) hat den Dämon gefunden! ${x.name} ist jetzt ${roleName(demonRole)} (böse), ${t.name} ist jetzt ${roleName(myRole)} (gut) und dauerhaft vergiftet`, "night");
    game.ignoreEnd = null;
    toast(`🐍 Tausch! ${x.name} ist jetzt ${roleName(demonRole)}, ${t.name} ist vergifteter Schlangenbeschwörer${reachable(x) || reachable(t) ? " – beide sehen es auf dem Handy" : " – zeig es beiden"}`);
  }

  // Seemann / Wirt / Höfling machen jemanden betrunken
  function setDrunk(k, by) {
    const t = game.seats[k];
    if ((t.marks || []).includes("drunk")) return;
    t.marks = [...(t.marks || []), "drunk"];
    markHist(t, "drunk", true, by);
    undoPoisonedActs(k);
  }
  function applyDrunkMaker(i, r) {
    const x = game.seats[i];
    if (impaired(x)) {
      if (r.step !== "innkeeper") { hist(`⚠️ ${x.name} (${roleName(r.step)}) ist vergiftet/betrunken – niemand wird betrunken`, "night"); abn(x, `${roleName(r.step)}: niemand wird betrunken`); toast(`⚠️ ${roleName(r.step)} ist vergiftet/betrunken – keine Wirkung`); }
      return;
    }
    if (r.step === "courtier") {
      const k = game.seats.findIndex(y => y.role === r.role);
      if (k < 0) { hist(`👑 Höfling wählt ${roleName(r.role)} – die Rolle ist nicht im Spiel, nichts passiert`, "night"); toast(`${roleName(r.role)} ist nicht im Spiel – nichts passiert`); return; }
      const t = game.seats[k];
      setDrunk(k, "Höfling, 3 Tage und Nächte");
      t.keep = [...new Set([...(t.keep || []), "drunk"])];
      t.drunkUntil = game.nightNo + 3;
      toast(`🍺 ${t.name} (${roleName(r.role)}) ist jetzt 3 Tage und Nächte betrunken`);
      return;
    }
    // Seemann: er ODER der Gewählte; Wirt: einer der beiden Geschützten. Standard = der Gewählte, der Spielleiter kann tauschen.
    const opts = r.step === "sailor" ? [r.picks[0], i] : r.picks.slice(0, 2);
    if (!opts.length || opts[0] === undefined) return;
    game.drunkPick = { night: game.nightNo, step: r.step, opts: [...new Set(opts)], on: opts[0] };
    setDrunk(opts[0], roleName(r.step));
    toast(`🍺 ${game.seats[opts[0]].name} ist betrunken (${roleName(r.step)}) – in der Nachtliste kannst du das tauschen`);
  }
  function swapDrunk() {
    const d = game.drunkPick;
    if (!d || d.night !== game.nightNo) return;
    const old = d.on, nu = d.opts.find(k => k !== old);
    if (nu === undefined) return;
    const o = game.seats[old];
    o.marks = (o.marks || []).filter(m => m !== "drunk");
    markHist(o, "drunk", false);
    d.on = nu;
    setDrunk(nu, roleName(d.step));
    save(); renderSL();
    toast(`🍺 Jetzt ist ${game.seats[nu].name} betrunken`);
  }

  function undoPoisonedActs(k) {
    const t = game.seats[k];
    (game.acts || []).filter(a => a.night === game.nightNo && a.i === k && !a.skip && !a.undone).forEach(a => {
      const d = ACTIONS[a.step] || {};
      if (!d.mark || ["target", "master"].includes(d.mark)) return;
      a.picks.forEach(j => { const y = game.seats[j]; y.marks = (y.marks || []).filter(m => m !== d.mark); });
      a.undone = true;
      hist(`⚠️ ${t.name} (${roleName(a.step)}) ist jetzt vergiftet/betrunken – die Wahl von vorhin (${a.picks.map(j => game.seats[j].name).join(", ")}) wirkt nicht`, "night");
      abn(t, `${roleName(a.step)}: Wahl ohne Wirkung`);
    });
  }

  // Cerenovus (Wahnsinn) und Grubenhexe (Rollenwechsel) direkt übernehmen – nicht, wenn sie vergiftet/betrunken sind.
  function applyRolePick(x, r) {
    const t = game.seats[r.picks[0]];
    if (!t) return;
    if (impaired(x)) {
      hist(`⚠️ ${x.name} (${roleName(r.step)}) ist vergiftet/betrunken – die Wahl hat keine Wirkung`, "night");
      abn(x, `${roleName(r.step)}: Wahl ohne Wirkung`);
      toast(`${roleName(r.step)} ist vergiftet/betrunken – keine Wirkung (du kannst trotzdem so tun als ob)`);
      return;
    }
    const hbE = hbFind(r.step, ["mad", "change"]);
    if (r.step === "cerenovus" || hbE === "mad") {
      t.madness = { role: r.role, night: game.nightNo };
      hist(`😵 ${t.name} muss morgen ${roleName(r.role)} behaupten`, "night");
      toast(`😵 ${t.name}: Wahnsinn „${roleName(r.role)}“ gesetzt${reachable(t) ? " – steht auf dem Handy" : " – zeig es ihm (😵-Knopf)"}`);
    } else if (r.step === "pithag" || hbE === "change") {
      if (game.seats.some(y => y.role === r.role)) {
        hist(`🧙 ${roleName(r.role)} ist schon im Spiel – die Grubenhexe bewirkt nichts`, "night");
        toast(`${roleName(r.role)} ist schon im Spiel – nichts passiert`);
        return;
      }
      hist(`🧙 ${t.name}: ${roleName(t.role)} → ${roleName(r.role)} (Grubenhexe)`, "night");
      t.role = r.role;
      delete t.align;
      game.ignoreEnd = null;
      toast(ROLE_BY_ID[r.role].t === "demon" ? `🧙 ${t.name} ist jetzt ${roleName(r.role)} – neuer Dämon: du darfst heute Nacht beliebig viele sterben lassen`
        : `🧙 ${t.name} ist jetzt ${roleName(r.role)}${reachable(t) ? " – sieht es auf dem Handy" : " – zeig es ihm (🔁)"}`);
    }
  }

  // ---------- Spieler-Seite ----------
  // Schein-Aufgabe für alle, die gerade nicht dran sind – sieht genauso aus wie eine echte.
  const FAKE_ACTION = { n: 1, self: true, text: "Du hast gerade nichts zu tun. Tippe trotzdem einen beliebigen Spieler an und bestätige – damit niemand merkt, wer wirklich wach ist." };

  // Nacht-Bildschirme im Online-Spiel: Aufgabe > Geweckt > Schlafen
  function nightOverlay() {
    if (!store.get("botc.online", null)) return;
    const mine = store.get("botc.myrole", null);
    const answered = store.get("botc.answered", []) || [];
    if (mine && mine.q && !answered.includes(mine.q.id)) { if (!$(".nightact")) showNightPrompt(mine); return; }
    if (mine && mine.wk && !answered.includes(mine.wk.id)) {
      const open = $(".wakeshow");
      if (!open || open.dataset.id !== mine.wk.id) showWake(mine);
      return;
    }
    if ($(".nightact") || $(".wakeshow")) return;
    if (pubState && pubState.sleep) { if (!$(".sleepshow")) showSleep(); }
    else if ($(".sleepshow")) { closeModal(); refreshPlayerView(true); }
  }

  function showSleep() {
    openModal(`<div class="nightshow sleepshow"><div class="cover-icon">😴</div><h2>Nacht</h2>
      <p class="ns-hint">Augen zu. Lass das Handy liegen – es vibriert, wenn du geweckt wirst.</p></div>`, "full night sleep");
  }

  function showWake(mine) {
    const wk = mine.wk;
    const role = ROLE_BY_ID[wk.step];
    openModal(`<div class="nightshow wakeshow" data-id="${esc(wk.id)}">
        <p class="ns-label">👁️ Du bist wach</p>
        <h2>${role ? role.ic + " " + esc(role.de) : ""}</h2>
        ${(wk.r || []).map(id => { const r = ROLE_BY_ID[id]; return r ? `<div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>` : ""; }).join("")}
        ${wk.t ? `<p class="ns-text">${esc(wk.t)}</p>` : ""}
        ${["spy", "widow"].includes(wk.step) && mine.g ? grimBox(mine.g) : ""}
        <p class="ns-hint">Merk dir die Info – sie steht auch auf deiner Rollenkarte.</p>
        <div class="row center"><button class="btn big" id="wkdone">😴 Augen wieder zu</button></div>
      </div>`, "full night sleep");
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    $("#wkdone").addEventListener("click", () => {
      const ans = store.get("botc.answered", []) || [];
      store.set("botc.answered", [...ans, wk.id].slice(-50));
      sendToHost({ type: "action", id: wk.id, ack: true });
      closeModal();
      nightOverlay();
    });
  }

  function showNightPrompt(mine) {
    const q = mine.q;
    if (!q || (store.get("botc.answered", []) || []).includes(q.id)) return;
    const seats = (pubState && pubState.seats) || [];
    const done = (payload) => {
      const ans = store.get("botc.answered", []) || [];
      store.set("botc.answered", [...ans, q.id].slice(-50));
      sendToHost(Object.assign({ type: "action", id: q.id }, payload)).then(ok => {
        if (!$(".nightact")) return; // schon die nächste Aufgabe offen
        if (pubState && pubState.sleep && ok) { closeModal(); nightOverlay(); return; }
        $("#modal-content").innerHTML = `<div class="nightshow nightsent"><div class="cover-icon">${ok ? "🌙" : "⚠️"}</div>
          <h2>${ok ? "Augen zu" : "Nicht gesendet"}</h2><p class="ns-hint">${ok ? "Deine Wahl ist angekommen. Lass das Handy liegen – es vibriert, wenn du wieder etwas tun sollst." : "Keine Verbindung – zeig dem Spielleiter deine Wahl."}</p>
          <div class="row center"><button class="btn big" id="ndone">OK</button></div></div>`;
        $("#ndone").addEventListener("click", () => { closeModal(); refreshPlayerView(true); });
      });
    };
    let def = q.sleep ? FAKE_ACTION : (ACTIONS[q.step] || { n: 1 });
    if (q.amn && !q.sleep) def = { ...def, text: `Deine unbekannte Fähigkeit verlangt eine Wahl${def.n ? `: Wähle ${def.n === 1 ? "einen Spieler" : def.n + " Spieler"}` : ""}${def.role ? " und eine Rolle" : ""}.` };
    const min = def.min !== undefined ? def.min : (def.optional ? 0 : def.n);
    const close = $(".nightsent"); if (close) closeModal();
    const list = seats.map((x, k) => ({ ...x, k })).filter(x => (def.self || x.k !== mine.s) && (def.onlyDead ? !x.a : (x.a || def.dead)));
    let pool = [];
    if (def.role) {
      const ed = mine.sc ? "custom" : (ROLE_BY_ID[mine.r] || {}).ed;
      pool = ROLES.filter(r => inEd(r, ed, mine.sc) && !["traveller", "fabled"].includes(r.t) && (def.role === "all" || r.t === "townsfolk" || r.t === "outsider"));
    }
    openModal(`<div class="nightshow nightact">
        <p class="ns-label">🌙 Nacht</p>
        <h2>${q.sleep ? "Schein-Auswahl" : q.amn ? "❓ Deine Fähigkeit" : esc(roleName(q.step))}</h2>
        <p class="ns-hint">${esc(def.text || "")}</p>
        ${def.n ? `<div class="pickgrid">${list.map(x => `<button class="pickbtn ${x.a ? "" : "dead"}" data-pk="${x.k}">${esc(x.n)}${x.a ? "" : " 💀"}</button>`).join("")}</div>
          <p class="small" id="pkcount">0 von ${def.n} gewählt</p>` : ""}
        ${def.role ? `<select id="pkrole"><option value="">– Rolle wählen –</option>${pool.map(r => `<option value="${r.id}">${esc(r.de)}</option>`).join("")}</select>` : ""}
        <div class="row center wrap">
          ${min === 0 ? `<button class="btn" id="pkskip">Nichts tun</button>` : ""}
          <button class="btn primary big" id="pkok">Bestätigen</button>
        </div>
      </div>`, "full night");
    const chosen = [];
    $$("[data-pk]").forEach(b => b.addEventListener("click", () => {
      const k = +b.dataset.pk, at = chosen.indexOf(k);
      if (at >= 0) chosen.splice(at, 1);
      else { if (chosen.length >= def.n) chosen.shift(); chosen.push(k); }
      $$("[data-pk]").forEach(x => x.classList.toggle("on", chosen.includes(+x.dataset.pk)));
      $("#pkcount").textContent = `${chosen.length} von ${def.n} gewählt`;
    }));
    $("#pkskip") && $("#pkskip").addEventListener("click", () => done({ skip: true }));
    $("#pkok").addEventListener("click", () => {
      const role = $("#pkrole") ? $("#pkrole").value : "";
      if (def.n && chosen.length < Math.max(min, 1) && !(min === 0 && role)) { toast(`Bitte ${def.n === 1 ? "einen Spieler" : `${min || 1}–${def.n} Spieler`} wählen.`); return; }
      if (def.role && !role && !def.optional) { toast("Bitte eine Rolle wählen."); return; }
      done({ picks: chosen, role: role || null });
    });
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }

  // =====================================================================
  //  ROLLEN-INFO ZEIGEN (Totengräber, Rabenhüter, Waschfrau …)
  // =====================================================================
  // Rollen, die nachts eine Info vom Spielleiter bekommen (nur dort gibt es den Info-Knopf).
  const INFO_ROLES = [
    // Trouble Brewing
    "washerwoman", "librarian", "investigator", "chef", "empath", "fortuneteller", "undertaker", "ravenkeeper",
    // Bad Moon Rising
    "grandmother", "chambermaid", "godfather",
    // Sects & Violets
    "clockmaker", "dreamer", "mathematician", "flowergirl", "towncrier", "oracle", "seamstress", "juggler", "sage", "amnesiac",
    // Experimentelle Rollen
    "noble", "pixie", "highpriestess", "balloonist", "general", "villageidiot", "knight", "steward", "shugenja",
    "choirboy", "king", "bountyhunter", "nightwatchman", "preacher"
  ];
  // Nacht-Schritte, bei denen der Spielleiter eine oder mehrere Rollen zeigt.
  const SHOW_ROLE = ["undertaker", "ravenkeeper", "washerwoman", "librarian", "investigator", "grandmother",
    "dreamer", "king", "pixie", "godfather", "sage", "noble"];
  const INFO_HINT = {
    undertaker: "Rolle des heute Hingerichteten",
    ravenkeeper: "Rolle des Spielers, auf den der Rabenhüter zeigt",
    washerwoman: "Dorfbewohner-Rolle – dazu zwei Spieler nennen",
    librarian: "Außenseiter-Rolle – dazu zwei Spieler nennen",
    investigator: "Schergen-Rolle – dazu zwei Spieler nennen",
    grandmother: "Rolle des Enkelkinds – dazu den Spieler nennen",
    dreamer: "Eine gute und eine böse Rolle (eine stimmt)",
    king: "Eine lebende Rolle",
    pixie: "Eine Dorfbewohner-Rolle im Spiel",
    godfather: "Die Außenseiter im Spiel",
    sage: "Zwei Spieler nennen, einer ist der Dämon",
    noble: "Drei Spieler nennen, genau einer ist böse"
  };

  // =====================================================================
  //  INFO-VORSCHLÄGE: die wahre Info ausrechnen
  // =====================================================================
  const PICK_DEPENDENT = ["fortuneteller", "villageidiot", "seamstress", "dreamer", "ravenkeeper"];
  const isEvil = x => !seatGood(x);
  const isDemonFor = x => ROLE_BY_ID[x.role].t === "demon" || (x.marks || []).includes("herring");
  const rnd = arr => arr.length ? arr[randInt(arr.length)] : null;

  // Wer stirbt heute Nacht durch den Dämon (Zielscheibe, nicht geschützt)? Der Dämon handelt
  // vor den Info-Rollen – für deren Infos ist dieser Spieler also schon tot.
  function pendingDeaths() {
    if (game.phase === "day" || game.nightNo < 2) return [];
    return nightKills().filter(x => x.dies).map(x => x.k);
  }
  const aliveNow = j => game.seats[j].alive && !pendingDeaths().includes(j);
  function killedBefore(x, id) {
    if (game.phase === "day" || game.nightNo < 2 || ACTS_WHEN_DEAD.includes(id)) return false;
    const i = game.seats.indexOf(x);
    const k = nightKills().find(e => e.k === i && e.dies);
    if (!k || !k.step) return false;
    const a = NIGHT_OTHER.indexOf(k.step), b = NIGHT_OTHER.indexOf(id);
    return a >= 0 && b >= 0 && a < b;
  }

  // Lebende Nachbarn (übersprungen werden Tote und heute Nacht Getötete), im Kreis
  function aliveNeighbours(i) {
    const n = game.seats.length, out = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const j = (i + dir * k + n * n) % n;
        if (j === i) break;
        if (aliveNow(j)) { out.push(j); break; }
      }
    }
    return [...new Set(out)];
  }

  function drunkWarning(i) {
    const x = game.seats[i];
    if (!x) return "";
    if (x.role === "drunk") return "Dieser Spieler ist der Säufer – du darfst (und solltest meist) eine falsche Info geben.";
    if (x.role === "marionette") return "Dieser Spieler ist die Marionette – die Info darf falsch sein.";
    const m = x.marks || [];
    if (m.includes("poison") || m.includes("drunk")) return "Dieser Spieler ist vergiftet bzw. betrunken – die Info darf falsch sein.";
    if (game.seats.some(y => y.role === "vortox" && y.alive) && ROLE_BY_ID[actingRole(x)].t === "townsfolk") return "Vortox im Spiel: Dorfbewohner-Infos müssen falsch sein!";
    return "";
  }

  // Liefert { r: [Rollen], p: [Spieler], t: "Zusatz", text: "Beschreibung" } oder null
  function suggestInfo(stepId, me, picks) {
    const S = game.seats, others = S.map((x, k) => k).filter(k => k !== me && !S[k].trav);
    const name = k => S[k].name;
    const pair = (cands) => {
      const a = rnd(cands);
      if (a === null || a === undefined) return null;
      const b = rnd(others.filter(k => k !== a));
      return shuffle([a, b].filter(v => v !== null && v !== undefined));
    };
    const withType = t => others.filter(k => ROLE_BY_ID[S[k].role].t === t);
    switch (stepId) {
      case "washerwoman": case "librarian": case "investigator": {
        const t = { washerwoman: "townsfolk", librarian: "outsider", investigator: "minion" }[stepId];
        const cands = withType(t);
        if (!cands.length) return { r: [], p: [], t: "0", text: "Keine passende Rolle im Spiel – zeige 0." };
        const p = pair(cands), right = p.find(k => cands.includes(k));
        return { r: [S[right].role], p, t: "", text: `${roleName(S[right].role)} – einer von ${p.map(name).join(", ")} (richtig: ${name(right)})` };
      }
      case "chef": {
        const ps = S.filter(x => !x.trav), n = ps.length;
        let c = 0;
        for (let k = 0; k < n; k++) if (isEvil(ps[k]) && isEvil(ps[(k + 1) % n])) c++;
        return { t: String(c), text: `${c} Paar(e) böser Nachbarn` };
      }
      case "empath": {
        const nb = aliveNeighbours(me), c = nb.filter(k => isEvil(S[k])).length;
        return { t: String(c), text: `${c} – Nachbarn: ${nb.map(name).join(", ")}` };
      }
      case "oracle": {
        const c = S.filter((x, j) => !aliveNow(j) && isEvil(x)).length;
        return { t: String(c), text: `${c} tote(r) böse(r) Spieler` };
      }
      case "clockmaker": {
        const n = S.length, d = S.findIndex(x => ROLE_BY_ID[x.role].t === "demon");
        const mins = S.map((x, k) => k).filter(k => ROLE_BY_ID[S[k].role].t === "minion");
        if (d < 0 || !mins.length) return { t: "0", text: "Kein Scherge – zeige 0." };
        const dist = Math.min(...mins.map(k => Math.min((k - d + n) % n, (d - k + n) % n)));
        return { t: String(dist), text: `${dist} Schritt(e) vom Dämon zum nächsten Schergen` };
      }
      case "fortuneteller": {
        if (!picks || picks.length < 2) return { text: "Tippe die zwei Spieler an, die der Wahrsager gewählt hat." };
        const yes = picks.some(k => isDemonFor(S[k]));
        return { t: yes ? "Ja" : "Nein", text: `${yes ? "Ja" : "Nein"} (Dämon oder 🐟 Ablenker dabei: ${yes ? "ja" : "nein"})` };
      }
      case "villageidiot": {
        if (!picks || !picks.length) return { text: "Tippe den gewählten Spieler an." };
        const g = seatGood(S[picks[0]]);
        return { t: g ? "gut" : "böse", text: `${name(picks[0])} ist ${g ? "gut" : "böse"}` };
      }
      case "seamstress": {
        if (!picks || picks.length < 2) return { text: "Tippe die zwei gewählten Spieler an." };
        const same = seatGood(S[picks[0]]) === seatGood(S[picks[1]]);
        return { t: same ? "gleiche Gesinnung" : "verschiedene Gesinnung", text: same ? "Gleiche Gesinnung" : "Verschiedene Gesinnung" };
      }
      case "dreamer": {
        if (!picks || !picks.length) return { text: "Tippe den gewählten Spieler an." };
        const x = S[picks[0]], good = seatGood(x);
        const other = rnd(ROLES.filter(r => inEd(r, game.edition) && r.id !== x.role && (good ? ["minion", "demon"] : ["townsfolk", "outsider"]).includes(r.t)));
        const r = shuffle([x.role, other && other.id].filter(Boolean));
        return { r, p: [picks[0]], text: `${name(picks[0])}: ${r.map(roleName).join(" oder ")} (richtig: ${roleName(x.role)})` };
      }
      case "ravenkeeper": {
        if (!picks || !picks.length) return { text: "Tippe den Spieler an, auf den der Rabenhüter zeigt." };
        return { r: [S[picks[0]].role], p: [], text: `${name(picks[0])} ist ${roleName(S[picks[0]].role)}` };
      }
      case "grandmother": {
        const k = rnd(others.filter(j => seatGood(S[j])));
        return k === null ? null : { r: [S[k].role], p: [k], text: `Enkelkind: ${name(k)} (${roleName(S[k].role)})` };
      }
      case "steward": {
        const k = rnd(others.filter(j => seatGood(S[j])));
        return k === null ? null : { p: [k], text: `Guter Spieler: ${name(k)}` };
      }
      case "bountyhunter": {
        const k = rnd(others.filter(j => isEvil(S[j])));
        return k === null ? null : { p: [k], text: `Böser Spieler: ${name(k)}` };
      }
      case "knight": {
        const p = shuffle(others.filter(j => ROLE_BY_ID[S[j].role].t !== "demon")).slice(0, 2);
        return { p, text: `Nicht der Dämon: ${p.map(name).join(", ")}` };
      }
      case "noble": {
        const e = rnd(others.filter(j => isEvil(S[j])));
        const g = shuffle(others.filter(j => seatGood(S[j]))).slice(0, 2);
        const p = shuffle([e, ...g].filter(v => v !== null));
        return { p, text: `Genau einer ist böse: ${p.map(name).join(", ")} (böse: ${e !== null ? name(e) : "–"})` };
      }
      case "sage": {
        const d = S.findIndex(x => ROLE_BY_ID[x.role].t === "demon");
        if (d < 0) return null;
        const p = shuffle([d, rnd(others.filter(j => j !== d))].filter(v => v !== null));
        return { p, text: `Einer davon ist der Dämon: ${p.map(name).join(", ")}` };
      }
      case "shugenja": {
        const n = S.length;
        let cw = n, ccw = n;
        for (let k = 1; k < n; k++) { if (isEvil(S[(me + k) % n])) { cw = k; break; } }
        for (let k = 1; k < n; k++) { if (isEvil(S[(me - k + n) % n])) { ccw = k; break; } }
        const t = cw === ccw ? "beliebig (gleicher Abstand)" : cw < ccw ? "im Uhrzeigersinn" : "gegen den Uhrzeigersinn";
        return { t, text: `Nächster Böser: ${t}` };
      }
      case "king": {
        const alive = S.filter(x => x.alive).length, dead = S.length - alive;
        if (dead < alive) return { text: "Noch nicht: Die Toten sind weniger als die Lebenden – keine Info." };
        const k = rnd(S.map((x, j) => j).filter(j => S[j].alive && j !== me));
        return k === null ? null : { r: [S[k].role], text: `Lebende Rolle: ${roleName(S[k].role)} (${name(k)})` };
      }
      case "juggler": {
        const j = game.juggle;
        if (!j || !j.guesses.length) return { t: "0", text: "Keine Vermutungen eingetragen (Knopf „🤹 Jongleur rät Rollen“ am ersten Tag) – zeige 0." };
        const res = j.guesses.map(g => { const y = S[g.k]; const ok = y && y.role === g.role; const mis = y && !ok && ((y.role === "spy" && ROLE_BY_ID[g.role].t !== "minion") || (y.role === "recluse" && ["minion", "demon"].includes(ROLE_BY_ID[g.role].t))) && !impaired(y); return { g, ok, mis }; });
        const c = res.filter(r => r.ok).length;
        return { t: String(c), text: `${c} richtig – ${res.map(r => `${S[r.g.k].name} = ${roleName(r.g.role)} ${r.ok ? "✅" : r.mis ? "❌ (darf als ✅ zählen: " + roleName(S[r.g.k].role) + " registriert falsch)" : "❌ (" + roleName(S[r.g.k].role) + ")"}`).join("; ")}` };
      }
      case "mathematician": {
        const since = game.lastDawnAt || 0, seen = new Map();
        (game.abnLog || []).filter(e => e.at > since).forEach(e => { if (!seen.has(e.name)) seen.set(e.name, e.text); });
        // Angriffe dieser Nacht, die nicht gewirkt haben (Soldat, Schutz, vergifteter Dämon …)
        if (game.phase !== "day") nightKills().filter(x => !x.dies).forEach(x => {
          const att = (game.acts || []).find(a => a.night === game.nightNo && a.picks && a.picks.includes(x.k) && KILL_STEPS.includes(a.step) && !a.undone);
          const who = att ? S[att.i] : S.find(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
          if (who && !seen.has(who.name)) seen.set(who.name, `Angriff auf ${S[x.k].name} wirkte nicht: ${x.why}`);
        });
        S.forEach(y => { if ((y.marks || []).includes("abnormal") && !seen.has(y.name)) seen.set(y.name, "❗-Marker gesetzt"); });
        const list = [...seen.entries()];
        return { t: String(list.length), text: `${list.length}${list.length ? " – " + list.map(([n, w]) => `${n}: ${w}`).join("; ") : " – seit der letzten Dämmerung hat alles normal funktioniert"}. Prüfe, ob etwas fehlt (z. B. Spion/Einsiedler falsch registriert).` };
      }
      case "towncrier": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.noms.length) return { t: "Nein", text: "Nein – heute wurden (laut Abstimmungs-Helfer) keine Nominierungen eingetragen." };
        const mins = day.noms.filter(n => S[n.by] && ROLE_BY_ID[S[n.by].role].t === "minion");
        const list = day.noms.map(n => `${name(n.by)} → ${S[n.on] ? name(n.on) : "?"}`).join(", ");
        return mins.length
          ? { t: "Ja", text: `Ja – Scherge ${[...new Set(mins.map(n => `${name(n.by)} (${roleName(S[n.by].role)})`))].join(", ")} hat nominiert. Alle Nominierungen: ${list}` }
          : { t: "Nein", text: `Nein – kein Scherge hat nominiert. Nominierungen: ${list}` };
      }
      case "flowergirl": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.noms.length) return { t: "Nein", text: "Nein – heute gab es (laut Abstimmungs-Helfer) keine Abstimmung." };
        const demons = S.map((x, k) => k).filter(k => ROLE_BY_ID[S[k].role].t === "demon");
        const votes = day.noms.filter(n => (n.hands || []).some(h => demons.includes(h)));
        return votes.length
          ? { t: "Ja", text: `Ja – ${demons.filter(d => votes.some(n => n.hands.includes(d))).map(name).join(", ")} (Dämon) hat abgestimmt bei: ${votes.map(n => `${name(n.by)} → ${S[n.on] ? name(n.on) : "?"}`).join(", ")}` }
          : { t: "Nein", text: `Nein – der Dämon hat bei keiner der ${day.noms.length} Abstimmung(en) die Hand gehoben.` };
      }
      case "undertaker": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.exec || day.exec === "none" || !S[day.exec.seat]) return { text: "Heute wurde (laut Abstimmungs-Helfer) niemand hingerichtet – keine Info." };
        return { r: [S[day.exec.seat].role], text: `${S[day.exec.seat].name} war ${roleName(S[day.exec.seat].role)}` };
      }
      default: {
        const hr = ROLE_BY_ID[stepId];
        const fx = hr && hbFind(stepId, Object.keys(HB_EFFECTS).filter(k => HB_EFFECTS[k].info));
        if (!fx) return null;
        const T = k => ROLE_BY_ID[S[k].role].t;
        const need = (HB_EFFECTS[fx] || {}).pick;
        if (need && (!picks || !picks.length)) return { text: `Tippe ${need === 1 ? "den gewählten Spieler" : "die gewählten Spieler"} an.` };
        if (fx === "align") { const g = seatGood(S[picks[0]]); return { t: g ? "gut" : "böse", text: `${name(picks[0])} ist ${g ? "gut" : "böse"}` }; }
        if (fx === "demon") { const y = picks.some(k => T(k) === "demon"); return { t: y ? "Ja" : "Nein", text: `${y ? "Ja" : "Nein"} – Dämon unter ${picks.map(name).join(", ")}: ${y ? "ja" : "nein"}` }; }
        if (fx === "minion") { const y = picks.some(k => T(k) === "minion"); return { t: y ? "Ja" : "Nein", text: `${y ? "Ja" : "Nein"} – Scherge unter ${picks.map(name).join(", ")}: ${y ? "ja" : "nein"}` }; }
        if (fx === "outsider") { const y = T(picks[0]) === "outsider"; return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} ist ${y ? "" : "kein "}Außenseiter` }; }
        if (fx === "role") return { r: [S[picks[0]].role], p: [], text: `${name(picks[0])} ist ${roleName(S[picks[0]].role)}` };
        if (fx === "neighbours") { const nb = aliveNeighbours(me), c = nb.filter(k => isEvil(S[k])).length; return { t: String(c), text: `${c} – Nachbarn: ${nb.map(name).join(", ")}` }; }
        if (fx === "same") { const y = seatGood(S[picks[0]]) === seatGood(S[picks[1]]); return { t: y ? "gleich" : "verschieden", text: `${picks.map(name).join(" & ")}: ${y ? "gleiche" : "verschiedene"} Gesinnung` }; }
        if (fx === "townsfolk") { const y = T(picks[0]) === "townsfolk"; return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} ist ${y ? "" : "kein "}Dorfbewohner` }; }
        if (fx === "evil3") { const c = picks.filter(k => isEvil(S[k])).length; return { t: String(c), text: `${c} böse unter ${picks.map(name).join(", ")}` }; }
        if (fx === "nominated" || fx === "voted") {
          const day = (game.days || {})[game.nightNo - 1] || { noms: [] };
          const y = fx === "nominated" ? day.noms.some(nm => nm.by === picks[0]) : day.noms.some(nm => (nm.hands || []).includes(picks[0]));
          return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} hat heute ${y ? "" : "nicht "}${fx === "nominated" ? "nominiert" : "abgestimmt"} (laut Abstimmungs-Helfer)` };
        }
        if (fx === "executee") { const day = (game.days || {})[game.nightNo - 1]; if (!day || !day.exec || day.exec === "none" || !S[day.exec.seat]) return { text: "Heute wurde niemand hingerichtet – keine Info." }; return { r: [S[day.exec.seat].role], text: `${S[day.exec.seat].name} war ${roleName(S[day.exec.seat].role)}` }; }
        if (fx === "deadevil") { const c = S.filter((x, k) => !aliveNow(k) && isEvil(x)).length; return { t: String(c), text: `${c} tote(r) böse(r) Spieler` }; }
        if (fx === "demondist") { const n = S.length, ds = S.map((x, k) => k).filter(k => T(k) === "demon"); if (!ds.length) return null; const d = Math.min(...ds.map(k => Math.min((k - me + n) % n, (me - k + n) % n))); return { t: String(d), text: `${d} Platz/Plätze bis zum Dämon` }; }
        if (fx === "evilcount") { const c = S.filter((x, k) => aliveNow(k) && isEvil(x)).length; return { t: String(c), text: `${c} böse Spieler leben noch` }; }
        return null;
      }
    }
  }

  // Spion und Einsiedler dürfen falsch „registrieren“ – solange sie gesund sind.
  const ALIGN_STEPS = ["empath", "chef", "oracle", "shugenja", "villageidiot", "seamstress", "noble", "steward", "bountyhunter", "grandmother", "clockmaker"];
  const ROLE_STEPS = ["ravenkeeper", "undertaker", "dreamer"];
  function misregHints(stepId, me, picks) {
    const S = game.seats;
    let rel;
    if (stepId === "empath") rel = aliveNeighbours(me);
    else if (stepId === "oracle") rel = S.map((x, k) => k).filter(k => !S[k].alive);
    else if (["fortuneteller", "villageidiot", "seamstress", "dreamer", "ravenkeeper"].includes(stepId)) rel = picks || [];
    else if (stepId === "undertaker") { const d = (game.days || {})[game.nightNo - 1]; rel = d && d.exec && d.exec !== "none" ? [d.exec.seat] : []; }
    else if ([...ALIGN_STEPS, "washerwoman", "librarian", "investigator"].includes(stepId)) rel = S.map((x, k) => k).filter(k => k !== me);
    else return [];
    const out = [];
    rel.forEach(k => {
      const x = S[k];
      if (!x || !["spy", "recluse"].includes(x.role)) return;
      const nm = x.name;
      if (impaired(x)) {
        out.push(x.role === "spy" ? `🕵️ ${nm} ist Spion, aber vergiftet/betrunken – zählt sicher als böser Scherge.` : `🏚️ ${nm} ist Einsiedler, aber vergiftet/betrunken – zählt sicher als guter Außenseiter.`);
        return;
      }
      let what = null;
      if (x.role === "spy") {
        if (stepId === "washerwoman") what = "als Dorfbewohner zeigen";
        else if (stepId === "librarian") what = "als Außenseiter zeigen";
        else if (ROLE_STEPS.includes(stepId)) what = "eine gute Rolle zeigen";
        else if (ALIGN_STEPS.includes(stepId) || ["seamstress", "villageidiot"].includes(stepId)) what = "als gut zählen";
        if (stepId === "empath" && what) {
          const c = aliveNeighbours(me).filter(j => isEvil(S[j])).length;
          what += ` (dann: ${c - 1})`;
        }
        if (what) out.push(`🕵️ ${nm} ist der Spion – du darfst ihn ${what}.`);
      } else {
        if (stepId === "investigator") what = "als Scherge zeigen";
        else if (stepId === "fortuneteller") what = "als Dämon gelten lassen (dann: Ja)";
        else if (ROLE_STEPS.includes(stepId)) what = "eine böse Rolle zeigen";
        else if (ALIGN_STEPS.includes(stepId) || ["seamstress", "villageidiot"].includes(stepId)) what = "als böse zählen";
        if (stepId === "empath" && what) {
          const c = aliveNeighbours(me).filter(j => isEvil(S[j])).length;
          what += ` (dann: ${c + 1})`;
        }
        if (what) out.push(`🏚️ ${nm} ist der Einsiedler – du darfst ihn ${what}.`);
      }
    });
    return out;
  }

  // Wer wacht bei diesem Nacht-Schritt auf? (inkl. Säufer, Marionette, Philosoph)
  const stepHolders = id => game.seats.map((s, i) => [s, i]).filter(([s]) =>
    (s.role === id && !(id === "amnesiac" && s.amn && s.amn.like)) || (s.role === "amnesiac" && s.amn && s.amn.like === id) || ((s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id) || (s.role === "philosopher" && s.gained === id));

  function infoDialog(stepId) {
    const holders = stepHolders(stepId);
    if (!holders.length) return;
    // Vorschlag: beim Totengräber die Rolle des heute Hingerichteten
    let pre = [];
    if (stepId === "undertaker") {
      const day = (game.days || {})[game.nightNo - 1];
      if (day && day.exec && day.exec !== "none" && game.seats[day.exec.seat]) pre = [game.seats[day.exec.seat].role];
    }
    if (stepId === "godfather") pre = playerSeats().filter(s => ROLE_BY_ID[s.role].t === "outsider").map(s => s.role).slice(0, 2);
    const pool = ROLES.filter(r => r.t !== "fabled" && (inEd(r, game.edition) || game.selected.includes(r.id)));
    const opts = sel => `<option value="">–</option>${["townsfolk", "outsider", "minion", "demon", "traveller"].map(t => {
      const l = pool.filter(r => r.t === t);
      return l.length ? `<optgroup label="${TEAMS[t].plural}">${l.map(r => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</optgroup>` : "";
    }).join("")}`;
    const noRole = ["sage", "noble"].includes(stepId) || !SHOW_ROLE.includes(stepId);
    // Wie die angetippten Spieler in der Info erscheinen
    const PICK_FMT = {
      washerwoman: { max: 2, label: "einer von" }, librarian: { max: 2, label: "einer von" }, investigator: { max: 2, label: "einer von" },
      sage: { max: 2, label: "einer davon ist der Dämon" }, noble: { max: 3, label: "genau einer ist böse" },
      grandmother: { max: 1, label: "dein Enkelkind" }, steward: { max: 1, label: "guter Spieler" },
      knight: { max: 2, label: "keiner davon ist der Dämon" }, bountyhunter: { max: 1, label: "böser Spieler" },
      highpriestess: { max: 1, label: "rede mit" }, balloonist: { max: 1, label: "Spieler" }
    };
    const pickCfg = Object.assign({ max: 3, label: "Spieler", ph: "z. B. 1 · Ja · Nein" }, PICK_FMT[stepId] || {});
    if (PICK_FMT[stepId]) pickCfg.ph = "weitere Angabe (optional)";
    const picked = [];
    const pickText = () => picked.length ? `${pickCfg.label}: ${picked.map(k => game.seats[k].name).join(", ")}` : "";
    openModal(`<h2>📱 ${esc(roleName(stepId))}: Info zeigen</h2>
      <p class="small">${esc(INFO_HINT[stepId] || "")}${stepId === "undertaker" && !pre.length ? " – heute wurde niemand über den Abstimmungs-Helfer hingerichtet, bitte selbst wählen." : ""}</p>
      <div class="box sugbox hidden" id="sugbox"></div>
      ${holders.length > 1 ? `<label class="field">Für: <select id="inforcpt">${holders.map(([s, i]) => `<option value="${i}">${esc(s.name)}${s.role !== stepId ? ` (${esc(roleName(s.role))})` : ""}</option>`).join("")}</select></label>`
        : `<p>Für: <b>${esc(holders[0][0].name)}</b>${holders[0][0].role !== stepId ? ` <span class="small">(${esc(roleName(holders[0][0].role))} – Info darf falsch sein)</span>` : ""}</p>`}
      ${noRole ? "" : `<label class="field">Rolle: <select id="inforole1">${opts(pre[0])}</select></label>
      <label class="field">2. Rolle (optional): <select id="inforole2">${opts(pre[1])}</select></label>`}
      <div class="field"><span>Spieler antippen${pickCfg.max ? ` (bis zu ${pickCfg.max})` : ""}:</span>
        <div class="infopick">${game.seats.map((x, k) => `<button class="pickbtn sm ${x.alive ? "" : "dead"}" data-ip="${k}">${esc(x.name)}${x.alive ? "" : " 💀"}</button>`).join("")}</div>
        <p class="small" id="ippreview">${esc(pickCfg.label)}: –</p></div>
      <label class="field">Zusatz (optional): <input id="infotext" placeholder="${pickCfg.ph}"></label>
      <div class="row wrap end">
        <button class="btn" id="infoshow">📱 Zeigen</button>
        ${game.online || game.test ? `<button class="btn primary" id="infosend">${tableOn() ? "👁️ Wecken &amp; zeigen" : "🌐 Aufs Handy senden"}</button>` : ""}
      </div>`);
    const showPicked = () => {
      $$("[data-ip]").forEach(x => x.classList.toggle("on", picked.includes(+x.dataset.ip)));
      $("#ippreview").textContent = `${pickCfg.label}: ${picked.map(k2 => game.seats[k2].name).join(", ") || "–"}`;
    };
    // Vorschlag anwenden (nur wenn eingeschaltet)
    const recipient = () => holders.length > 1 ? +$("#inforcpt").value : holders[0][1];
    const applySuggestion = (fromPicks) => {
      if (game.suggest === false) return;
      const sg = suggestInfo(stepId, recipient(), fromPicks ? picked.slice() : null);
      const box = $("#sugbox");
      if (!sg) { box.classList.add("hidden"); return; }
      if (!fromPicks && sg.p) { picked.length = 0; picked.push(...sg.p.slice(0, pickCfg.max || 3)); showPicked(); }
      if (sg.r && $("#inforole1")) { $("#inforole1").value = sg.r[0] || ""; $("#inforole2").value = sg.r[1] || ""; }
      if (sg.t !== undefined) $("#infotext").value = sg.t;
      const warn = drunkWarning(recipient());
      const mis = misregHints(stepId, recipient(), fromPicks ? picked.slice() : (sg.p || null));
      const pend = ["empath", "oracle"].includes(stepId) ? pendingDeaths() : [];
      if (pend.length) mis.unshift(`🎯 ${pend.map(k => game.seats[k].name).join(", ")} stirbt heute Nacht durch den Dämon – zählt hier schon als tot.`);
      box.innerHTML = `💡 <b>Vorschlag (wahre Info)</b> <span class="small">· nur für dich, wird nicht gesendet</span><br> ${esc(sg.text)}${warn ? `<br><span class="warnmsg">⚠️ ${esc(warn)}</span>` : ""}${mis.map(t => `<br><span class="mismsg">${esc(t)}</span>`).join("")}`;
      box.classList.remove("hidden");
    };
    $$("[data-ip]").forEach(b => b.addEventListener("click", () => {
      const k = +b.dataset.ip, at = picked.indexOf(k);
      if (at >= 0) picked.splice(at, 1);
      else { if (pickCfg.max && picked.length >= pickCfg.max) picked.shift(); picked.push(k); }
      showPicked();
      if (PICK_DEPENDENT.includes(stepId)) applySuggestion(true);
    }));
    $("#inforcpt") && $("#inforcpt").addEventListener("change", () => applySuggestion(false));
    // Bei Rollen, die selbst Spieler gewählt haben, die Wahl aus der Nachtaktion übernehmen
    const act = lastAct(recipient(), stepId);
    if (PICK_DEPENDENT.includes(stepId) && act && act.picks && act.picks.length) {
      picked.length = 0; picked.push(...act.picks.slice(0, pickCfg.max || 3)); showPicked(); applySuggestion(true);
    } else applySuggestion(false);
    const collect = () => {
      const i = holders.length > 1 ? +$("#inforcpt").value : holders[0][1];
      const r = noRole ? [] : [$("#inforole1").value, $("#inforole2").value].filter(Boolean);
      const t = [pickText(), $("#infotext").value.trim()].filter(Boolean).join(" · ");
      return { i, r, t };
    };
    const store_ = ({ i, r, t }) => {
      const s = game.seats[i];
      // Weicht die gesendete Info von der wahren ab, hat die Fähigkeit nicht normal funktioniert
      try {
        const truth = suggestInfo(stepId, i, picked.slice());
        const sent = ($("#infotext") ? $("#infotext").value : "").trim();
        if (truth && truth.t && !truth.p && sent && sent.toLowerCase() !== String(truth.t).toLowerCase()) abn(s, `${roleName(stepId)} bekam eine falsche Info`);
      } catch (e) { /* kein Vorschlag möglich */ }
      s.infos = [...(s.infos || []), { n: game.nightNo, r, t }].slice(-10);
      hist(`📨 Info an ${s.name} (${roleName(stepId)}): ${[r.map(roleName).join(" / "), t].filter(Boolean).join(" – ")}`);
      const d = game.done[game.nightNo] || [];
      if (!d.includes(stepId)) game.done[game.nightNo] = [...d, stepId];
      save();
    };
    $("#infoshow").addEventListener("click", () => {
      const c = collect();
      if (!c.r.length && !c.t) { toast("Bitte eine Rolle oder einen Zusatz angeben."); return; }
      store_(c);
      openModal(`<div class="nightshow pickshow">
          <p class="ns-label">${esc(game.seats[c.i].name)} · ${esc(roleName(stepId))}</p>
          ${c.r.map(id => { const r = ROLE_BY_ID[id]; return `<div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>`; }).join("")}
          ${c.t ? `<p class="ns-text">${esc(c.t)}</p>` : ""}
        </div>
        <div class="row center"><button class="btn big" id="infodone">✓ Fertig – verdecken</button></div>`, "full night");
      $("#infodone").addEventListener("click", () => { closeModal(); renderSL(); });
    });
    $("#infosend") && $("#infosend").addEventListener("click", () => {
      const c = collect();
      if (!c.r.length && !c.t) { toast("Bitte eine Rolle oder einen Zusatz angeben."); return; }
      if (tableOn()) {
        game.wakes = game.wakes || {};
        game.wakes[c.i] = { id: `w${game.nightNo}-${c.i}-${randInt(1e6)}`, night: game.nightNo, step: stepId, r: c.r, t: c.t };
      }
      store_(c);
      closeModal(); renderSL();
      const wk = (game.wakes || {})[c.i];
      if (tableOn() && wk && isBot(game.seats[c.i])) setTimeout(() => { if (!wk.done) { wk.done = true; save(); refreshHostView(); } }, 1500 + randInt(1500));
      toast(game.seats[c.i].pid ? (tableOn() ? `${game.seats[c.i].name} wird geweckt` : `An ${game.seats[c.i].name} gesendet`) : `${game.seats[c.i].name} ist nicht online – bitte zeigen`);
    });
  }

  // Spion: Grimoire als Kopie aufs Handy. Vergiftet/betrunken darf es falsch sein (zwei Rollen vertauscht).
  function grimSnapshot(fake) {
    const S = game.seats;
    const rows = S.map(x => [x.name, x.role, x.alive || x.zfake ? 1 : 0,
      (x.marks || []).map(m => (markerByKey(m) || {}).i || "").join(""),
      x.role === "drunk" || x.role === "marionette" ? `glaubt: ${roleName(shownRole(x.role))}` : x.trav ? (x.align === "e" ? "Reisender, böse" : "Reisender, gut") : ""]);
    if (fake) {
      const idx = rows.map((r, k) => k).filter(k => !S[k].trav && S[k].role !== "spy");
      const a = idx[randInt(idx.length)], c = shuffle(idx.filter(k => k !== a && ROLE_BY_ID[S[k].role].t !== ROLE_BY_ID[S[a].role].t))[0];
      if (c !== undefined) { const t = rows[a][1]; rows[a][1] = rows[c][1]; rows[c][1] = t; }
    }
    return { n: game.nightNo, s: rows, b: game.bluffs || [] };
  }
  function spyGrimHide() {
    game.seats.forEach(x => { if (x.grim) { delete x.grim; hist(`🙈 Grimoire vom Handy von ${x.name} entfernt`, "night"); } });
    save(); renderSL();
    toast("🙈 Das Grimoire ist vom Handy verschwunden");
  }
  function widowKnowDialog() {
    const S = game.seats;
    const good = S.map((y, i) => i).filter(i => S[i].alive && seatGood(S[i]) && S[i].role !== "widow");
    if (!good.length) return;
    openModal(`<h2>🕸️ Wer erfährt von der Witwe?</h2>
      <p class="small">Ein guter Spieler erfährt, dass eine Witwe im Spiel ist (aber nicht, wer). Er bekommt es aufs Handy bzw. du zeigst ihm das Witwe-Token.</p>
      <div class="infopick">${good.map(i => `<button class="btn pickbtn" data-wk="${i}">${esc(S[i].name)}</button>`).join("")}</div>
      <div class="row"><button class="btn sm" id="wkrand">🎲 Zufällig</button></div>`);
    const pick = i => {
      const t = S[i];
      t.marks = [...new Set([...(t.marks || []), "knows"])];
      t.infos = [...(t.infos || []), { n: game.nightNo, r: ["widow"], t: "Eine Witwe ist im Spiel." }].slice(-10);
      if (tableOn()) {
        game.wakes = game.wakes || {};
        game.wakes[i] = { id: `w${game.nightNo}-${i}-${randInt(1e6)}`, night: game.nightNo, step: "widow", r: ["widow"], t: "Eine Witwe ist im Spiel." };
        const wk = game.wakes[i];
        if (isBot(t)) setTimeout(() => { if (!wk.done) { wk.done = true; save(); refreshHostView(); } }, 1500 + randInt(1500));
      }
      hist(`🕸️ ${t.name} erfährt, dass eine Witwe im Spiel ist`, "night");
      save(); closeModal(); renderSL();
      toast(reachable(t) ? `🕸️ ${t.name} erfährt es${tableOn() ? " – wird geweckt" : " auf dem Handy"}` : `🕸️ Zeig ${t.name} das Witwe-Token`);
    };
    $$("[data-wk]").forEach(b => b.addEventListener("click", () => pick(+b.dataset.wk)));
    $("#wkrand").addEventListener("click", () => pick(good[randInt(good.length)]));
  }
  function spyGrimDialog(rid) {
    rid = rid === "widow" ? "widow" : "spy";
    const holders = stepHolders(rid).filter(([x]) => x.alive);
    if (!holders.length) return;
    const [x, i] = holders[0];
    const rname = roleName(rid);
    // Jinx: Hat der Mohnbauer seine Fähigkeit, sieht der Spion/die Witwe das Grimoire nicht
    const poppy = game.seats.find(y => y.role === "poppygrower" && y.alive && !impaired(y));
    if (poppy) { toast(`🌺 Der Mohnbauer lebt – ${rname} sieht das Grimoire nicht (Jinx)`); return; }
    const send = fake => {
      x.grim = grimSnapshot(fake);
      if (tableOn()) {
        game.wakes = game.wakes || {};
        game.wakes[i] = { id: `w${game.nightNo}-${i}-${randInt(1e6)}`, night: game.nightNo, step: rid, r: [], t: rid === "widow" ? "Das Grimoire – wähle danach, wen du vergiftest:" : "Das Grimoire:" };
        const wk = game.wakes[i];
        if (isBot(x)) setTimeout(() => { if (!wk.done) { wk.done = true; save(); refreshHostView(); } }, 2500 + randInt(2000));
      }
      const d = game.done[game.nightNo] || [];
      if (rid === "spy" && !d.includes("spy")) game.done[game.nightNo] = [...d, "spy"];
      hist(`📖 ${x.name} (${rname}) sieht das Grimoire${fake ? " (verfälscht)" : ""}`, "night");
      save(); closeModal(); renderSL();
      toast(reachable(x) ? `📖 Grimoire an ${x.name} gesendet${tableOn() ? " – wird geweckt" : ""}` : `${x.name} ist nicht online – zeig ihm dein Grimoire`);
    };
    if (!impaired(x)) return send(false);
    openModal(`<h2>📖 Grimoire für ${esc(x.name)}</h2>
      <p class="warnmsg">⚠️ ${esc(rname)} ist vergiftet/betrunken – du darfst ein falsches Grimoire zeigen.</p>
      <div class="row wrap"><button class="btn" id="spyreal">Echtes Grimoire senden</button><button class="btn primary" id="spyfake">🔀 Verfälscht senden (2 Rollen vertauscht)</button></div>`);
    $("#spyreal").addEventListener("click", () => send(false));
    $("#spyfake").addEventListener("click", () => send(true));
  }

  // Cerenovus: Spieler muss morgen „verrückt“ danach sein, eine gute Rolle zu sein.
  function madnessDialog(i) {
    const s = game.seats[i];
    const cur = s.madness && s.madness.night === game.nightNo ? s.madness.role : (game.lastPicks || {}).cerenovus;
    const pool = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider"));
    openModal(`<h2>😵 Wahnsinn für ${esc(s.name)}</h2>
      <p class="small">Der Cerenovus hat diesen Spieler gewählt. Er muss morgen überzeugend behaupten, diese Rolle zu sein – sonst darfst du ihn hinrichten lassen.</p>
      <label class="field">Rolle:
        <select id="madrole">${pool.map(r => `<option value="${r.id}" ${r.id === cur ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>
      <p class="small">${game.online && s.pid ? "🌐 Der Spieler sieht den Wahnsinn automatisch auf seiner Rollenkarte – bis zur nächsten Nacht." : "Zeig es dem Spieler mit dem Knopf „Dem Spieler zeigen“."}</p>
      <div class="row wrap end">
        ${s.madness ? `<button class="btn danger" id="madclear">Entfernen</button>` : ""}
        <button class="btn" id="madshow">📱 Dem Spieler zeigen</button>
        <button class="btn primary" id="madsave">Speichern</button>
      </div>`);
    const store_ = () => {
      if (!s.madness || s.madness.role !== $("#madrole").value || s.madness.night !== game.nightNo) hist(`😵 ${s.name} muss ${roleName($("#madrole").value)} behaupten`);
      s.madness = { role: $("#madrole").value, night: game.nightNo }; save();
    };
    $("#madsave").addEventListener("click", () => { store_(); closeModal(); renderSL(); });
    $("#madclear") && $("#madclear").addEventListener("click", () => { delete s.madness; save(); closeModal(); renderSL(); });
    $("#madshow").addEventListener("click", () => {
      store_();
      const r = ROLE_BY_ID[s.madness.role];
      openModal(`<div class="nightshow pickshow"><p class="ns-label">${esc(s.name)} · 😵 Wahnsinn</p>
        <h2>Morgen musst du überzeugend behaupten, das zu sein:</h2>
        <div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>
        <p class="ns-hint">Sonst kann der Spielleiter dich hinrichten lassen.</p></div>
        <div class="row center"><button class="btn big" id="maddone">✓ Fertig</button></div>`, "full night");
      $("#maddone").addEventListener("click", () => { closeModal(); renderSL(); });
    });
  }

  // Großer Ergebnis-Bildschirm mit Auflösung aller Rollen.
  function showEnd() {
    const w = game.winner;
    if (!w) return;
    const good = w.team === "good";
    const list = game.seats.map(s => {
      const shown = shownRole(s.role);
      return `<li class="${seatGood(s) ? "al-good" : "al-evil"} ${s.alive ? "" : "dead"}">
        <span class="er-name">${esc(s.name)}${s.alive ? "" : " 💀"}</span>
        ${roleChip(s.role)}
        ${shown !== s.role ? `<span class="small">(glaubte: ${esc(roleName(shown))})</span>` : ""}
        <span class="er-al">${seatGood(s) ? "gut" : "böse"}</span>
      </li>`;
    }).join("");
    openModal(`<div class="endscreen ${w.team}">
        <div class="end-icon">${good ? "😇" : "😈"}</div>
        <h1>${good ? "Gut gewinnt!" : "Böse gewinnt!"}</h1>
        <p class="end-reason">${esc(w.reason)}</p>
        <p class="end-sub">Nach ${game.nightNo} ${game.nightNo === 1 ? "Nacht" : "Nächten"}. ${good ? "Das Dorf ist gerettet – der Dämon wurde besiegt." : "Die Dunkelheit hat gesiegt – das Dorf ist verloren."}</p>
      </div>
      <h3>Auflösung</h3>
      <ul class="endlist">${list}</ul>
      ${game.bluffs.length ? `<p class="small">Bluffs des Dämons: ${game.bluffs.map(id => esc(roleName(id))).join(", ")}</p>` : ""}
      ${historyHtml(game.history)}
      <div class="row wrap center">
        <button class="btn primary" id="again">🔄 Neue Runde, gleiche Spieler</button>
        <button class="btn" id="endclose">Zurück zum Grimoire</button>
      </div>`, "full");
    $("#endclose").addEventListener("click", closeModal);
    $("#again").addEventListener("click", () => {
      game.names = playerSeats().map(s => s.name);
      Object.assign(game, { selected: [], seats: [], bluffs: [], drunkShown: null, lunaticShown: null,
        assignedKey: "", nightNo: 1, done: {}, days: {}, vote: null, winner: null, ignoreEnd: null, step: "roles", history: [], phase: "night", statsId: null });
      save(); closeModal(); renderSL();
    });
  }

  // Rollen, deren Nacht-Schritt gerade durch den Tod ausgelöst wird.
  const ACTS_WHEN_DEAD = ["ravenkeeper", "sage", "moonchild", "sweetheart", "barber", "poppygrower"];
  // Wird die Fähigkeit durch den Tod gerade ausgelöst? Rabenhüter/Weiser: nur bei Tod in DIESER Nacht.
  // Mondkind/Liebling/Barbier: auch, wenn er heute tagsüber gestorben ist (z. B. hingerichtet).
  function deathTriggered(x, id) {
    const i = game.seats.indexOf(x), n = game.nightNo;
    if (pendingDeaths().includes(i)) return true;
    if (x.alive) return false;
    const h = game.history || [];
    const tonight = h.some(e => e.n === n && e.ph === "night" && e.dead === x.name);
    const today = h.some(e => e.n === n - 1 && e.ph === "day" && e.dead === x.name);
    return tonight || (!["ravenkeeper", "sage"].includes(id) && today);
  }
  // Fähigkeiten, die nur einmal pro Spiel wirken.
  const ONCE_PER_GAME = ["courtier", "professor", "seamstress", "philosopher", "assassin", "bonecollector",
    "slayer", "artist", "virgin", "fool", "judge", "huntsman", "nightwatchman", "golem"];

  // Philosoph: Der Spielleiter wählt aus, welche gute Rolle er sich genommen hat.
  function philoSelect(i) {
    const s = game.seats[i];
    const opts = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider") && r.id !== "philosopher");
    return `<label class="philo">🧠 Gewählte Rolle:
      <select data-philo="${i}">
        <option value="">– noch nicht gewählt –</option>
        ${opts.map(r => `<option value="${r.id}" ${s.gained === r.id ? "selected" : ""}>${esc(r.de)}${game.seats.some(x => x.role === r.id) ? " (im Spiel)" : ""}</option>`).join("")}
      </select></label>`;
  }
  function setPhilo(i, id) {
    const s = game.seats[i];
    const tag = "betrunken (Philosoph)";
    // Alte Wahl zurücknehmen
    if (s.gained) game.seats.forEach(x => { if (x.role === s.gained && x.note) x.note = x.note.replace(tag, "").replace(/^[,\s]+|[,\s]+$/g, ""); });
    s.gained = id || null;
    s.gainedUsed = false;
    s.used = !!id;
    if (id) {
      const d = game.done[game.nightNo] || [];
      if (!d.includes("philosopher")) game.done[game.nightNo] = [...d, "philosopher"];
      const victims = game.seats.filter(x => x.role === id);
      victims.forEach(x => { if (!(x.note || "").includes(tag)) x.note = x.note ? x.note + ", " + tag : tag; });
      toast(victims.length
        ? `${s.name} hat jetzt die Fähigkeit „${roleName(id)}“. ${victims.map(x => x.name).join(", ")} ist betrunken.`
        : `${s.name} hat jetzt die Fähigkeit „${roleName(id)}“.`);
    }
    save(); renderSL();
  }

  function evilTeam() {
    const ps = playerSeats();
    return {
      demon: ps.find(s => ROLE_BY_ID[s.role].t === "demon"),
      minions: ps.filter(s => ROLE_BY_ID[s.role].t === "minion")
    };
  }

  // Bildschirm, den der Spielleiter nachts dem Dämon bzw. den Schergen zeigt.
  function showEvilInfo(which) {
    const ev = evilTeam();
    let html;
    if (which === "demoninfo") {
      html = `<div class="nightshow">
        <p class="ns-label">Du bist der Dämon</p>
        <h2>Das sind deine Schergen</h2>
        <div class="ns-names">${ev.minions.map(m => `<span>${esc(m.name)}</span>`).join("") || "<span>keine</span>"}</div>
        <h2>Deine Bluffs</h2>
        <p class="ns-hint">Diese guten Rollen sind <b>nicht im Spiel</b> – du kannst gefahrlos behaupten, eine davon zu sein.</p>
        <div class="ns-bluffs">${game.bluffs.map(id => { const r = ROLE_BY_ID[id]; return `<div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>`; }).join("")}</div>
      </div>`;
    } else {
      html = `<div class="nightshow">
        <p class="ns-label">Ihr seid die Schergen</p>
        <h2>Das ist euer Dämon</h2>
        <div class="ns-names demon"><span>${esc(ev.demon ? ev.demon.name : "–")}</span></div>
        ${ev.minions.length > 1 ? `<h2>Alle Schergen</h2><div class="ns-names">${ev.minions.map(m => `<span>${esc(m.name)}</span>`).join("")}</div>` : ""}
      </div>`;
    }
    openModal(html + `<div class="row center"><button class="btn big" id="nsdone">✓ Fertig – verdecken</button></div>`, "full night");
    $("#nsdone").addEventListener("click", () => {
      const d = game.done[game.nightNo] || [];
      if (!d.includes(which)) game.done[game.nightNo] = [...d, which];
      save(); closeModal(); renderSL();
    });
  }

  // QR-Code zur App selbst, damit Mitspieler sie schnell aufs Handy holen können.
  const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
  function qrSvg(text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }
  function showAppQR() {
    const url = appUrl();
    openModal(`
      <h2 class="center">📲 App aufs Handy holen</h2>
      <p class="center small">Mit der Handy-Kamera scannen – dann öffnet sich die App.</p>
      <div class="qr">${qrSvg(url)}</div>
      <p class="center"><code class="urltext">${esc(url)}</code></p>
      <div class="row center wrap">
        <button class="btn" id="copyapp">🔗 Link kopieren</button>
        ${navigator.share ? `<button class="btn primary" id="shareapp">📤 Teilen</button>` : ""}
      </div>
      <div class="box"><h4>Danach als App speichern</h4>
        <p><b>iPhone:</b> In Safari auf Teilen ⬆︎ → „Zum Home-Bildschirm“.</p>
        <p><b>Android:</b> Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
      </div>`);
    $("#copyapp").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("Link kopiert"); }
      catch (e) { prompt("Link kopieren:", url); }
    });
    $("#shareapp") && $("#shareapp").addEventListener("click", () => {
      navigator.share({ title: "Blood on the Clocktower – Rollen-App", url }).catch(() => {});
    });
  }
  $("#appqr").addEventListener("click", showAppQR);

  function showQR(i) {
    const seat = game.seats[i];
    const link = seatLink(seat, i);
    let qrSvg = "";
    try {
      const qr = qrcode(0, "L");
      qr.addData(link);
      qr.make();
      qrSvg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (e) { qrSvg = `<p class="error">QR-Code konnte nicht erzeugt werden.</p>`; }
    openModal(`
      <h2 class="center">${esc(seat.name)}</h2>
      <p class="center small">Mit der Handy-Kamera scannen – die Rolle öffnet sich verdeckt.</p>
      <div class="qr">${qrSvg}</div>
      <p class="center">Code: <code class="code big">${seatCode(seat, i)}</code></p>
      <div class="row center wrap">
        <button class="btn" id="copylink">🔗 Link kopieren</button>
        ${navigator.share ? `<button class="btn primary" id="sharelink">📤 Link teilen</button>` : ""}
      </div>`);
    $("#copylink").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); toast("Link kopiert"); }
      catch (e) { prompt("Link kopieren:", link); }
    });
    $("#sharelink") && $("#sharelink").addEventListener("click", () => {
      navigator.share({ title: "Deine Clocktower-Rolle", text: `${seat.name}, hier ist deine geheime Rolle:`, url: link }).catch(() => {});
    });
  }

  // Handy reihum weitergeben
  function passMode(i) {
    const ps = game.seats;
    if (i >= ps.length) {
      openModal(`<div class="pass center"><div class="cover-icon">✅</div><h2>Alle Rollen verteilt</h2>
        <p>Gib das Handy zurück an den Spielleiter.</p><button class="btn primary" id="passend">Fertig</button></div>`, "full");
      $("#passend").addEventListener("click", closeModal);
      return;
    }
    const seat = ps[i];
    openModal(`<div class="pass center">
        <div class="cover-icon">📱</div>
        <p>Gib das Handy an</p>
        <h2 class="bigname">${esc(seat.name)}</h2>
        <p class="small">Platz ${i + 1} von ${ps.length}</p>
        <button class="btn primary big" id="iam">Ich bin ${esc(seat.name)} – Rolle zeigen</button>
      </div>`, "full");
    $("#iam").addEventListener("click", () => {
      openModal(`${cardHtml(seatInfo(seat, i))}
        <div class="row center"><button class="btn primary big" id="seen">Gesehen – Karte verdecken</button></div>
        <p class="center small">Dein Code, falls du die Rolle später auf deinem Handy öffnen willst: <code class="code">${seatCode(seat, i)}</code></p>`, "full");
      $("#seen").addEventListener("click", () => passMode(i + 1));
    });
  }

  // =====================================================================
  //  ROLLEN-LEXIKON
  // =====================================================================
  let lexFilter = { ed: null, team: "all", q: "" };

  function roleDetail(r, forST) {
    const jx = JINXES.filter(([a, b]) => a === r.id || b === r.id);
    return `<div class="lex-detail">
      <div class="lex-title t-${r.t}-text"><b>${r.ic} ${esc(r.de)}</b> <span class="small">${esc(r.en)} · ${TEAMS[r.t].name} · ${esc(EDITIONS[r.ed].name)}</span></div>
      <p class="ability-line">${esc(r.a)}</p>
      <p>${esc(r.e)}</p>
      ${jx.length ? `<details class="jinx-role"><summary class="small">🧞 ${jx.length} Jinx${jx.length > 1 ? "es" : ""} mit anderen Rollen</summary><ul class="small">${jx.map(([a, b, de]) => { const o = a === r.id ? b : a; return `<li><b>${ROLE_BY_ID[o].ic} ${esc(roleName(o))}:</b> ${esc(de)}</li>`; }).join("")}</ul></details>` : ""}
      ${r.tip ? `<p><b>💡 Tipp:</b> ${esc(r.tip)}</p>` : ""}
      ${r.setup ? `<p><b>⚙️ Aufbau:</b> ${esc(r.setup)}</p>` : ""}
      ${forST || r.st || r.n1 || r.n ? `<div class="st-notes">
        ${r.st ? `<p><b>📜 Spielleiter:</b> ${esc(r.st)}</p>` : ""}
        ${r.n1 ? `<p><b>🌙 Erste Nacht:</b> ${esc(r.n1)}</p>` : ""}
        ${r.n ? `<p><b>🌑 Andere Nächte:</b> ${esc(r.n)}</p>` : ""}
      </div>` : ""}
    </div>`;
  }

  function renderLex() {
    const sc = gameScript();
    if (!lexFilter.ed || (lexFilter.ed === "game" && !sc)) {
      const si = scriptInfo(), ed = si && !sc ? Object.keys(EDITIONS).find(k => EDITIONS[k].name === si.name) : null;
      lexFilter.ed = sc ? "game" : ed || "all";
    }
    view.innerHTML = `
      <section class="panel">
        <h2>Alle Rollen</h2>
        <input id="lexq" class="search" placeholder="🔍 Rolle suchen …" value="${esc(lexFilter.q)}">
        <div class="chips">
          ${sc ? `<button class="chip ${lexFilter.ed === "game" ? "on" : ""}" data-led="game">📜 Euer Spiel</button>` : ""}
          <button class="chip ${lexFilter.ed === "all" ? "on" : ""}" data-led="all">Alle</button>
          ${Object.entries(EDITIONS).filter(([k]) => k !== "custom").map(([k, e]) => `<button class="chip ${lexFilter.ed === k ? "on" : ""}" data-led="${k}">${e.name}</button>`).join("")}
        </div>
        <div class="chips">
          <button class="chip ${lexFilter.team === "all" ? "on" : ""}" data-lteam="all">Alle Typen</button>
          ${Object.entries(TEAMS).map(([k, t]) => `<button class="chip t-${k}-chip ${lexFilter.team === k ? "on" : ""}" data-lteam="${k}">${t.plural}</button>`).join("")}
        </div>
      </section>
      ${lexFilter.ed === "game" && sc ? jinxHtml(sc, "Sonderregeln eures Skripts") : ""}
      ${(() => {
        if (lexFilter.ed === "game" && sc) return nightOrderHtml(sc, "Euer Spiel");
        if (EDITIONS[lexFilter.ed] && lexFilter.ed !== "custom") return nightOrderHtml(ROLES.filter(r => r.ed === lexFilter.ed).map(r => r.id), EDITIONS[lexFilter.ed].name);
        return "";
      })()}
      <div id="lexlist"></div>`;
    const draw = () => {
      const q = lexFilter.q.toLowerCase();
      const list = ROLES.filter(r => (lexFilter.ed === "all" || (lexFilter.ed === "game" ? sc.includes(r.id) : r.ed === lexFilter.ed))
        && (lexFilter.team === "all" || r.t === lexFilter.team)
        && (!q || (r.de + " " + r.en + " " + r.a).toLowerCase().includes(q)));
      let html = "";
      const sections = lexFilter.ed === "game"
        ? [["game", "📜 Rollen in eurem Spiel", `${list.length} Rollen`, list]]
        : Object.keys(EDITIONS).filter(k => k !== "custom").map(ed => [ed, EDITIONS[ed].name, EDITIONS[ed].de, list.filter(r => r.ed === ed)]);
      sections.forEach(([ed, title, sub, part]) => {
        if (!part.length) return;
        html += `<section class="panel"><h2>${esc(title)} <span class="small">(${esc(sub)})</span></h2>`;
        Object.keys(TEAMS).forEach(team => {
          const tp = part.filter(r => r.t === team);
          if (!tp.length) return;
          html += `<h3 class="team-h t-${team}-text">${TEAMS[team].plural}</h3>`;
          html += tp.map(r => `<details class="lex t-${team}-border"><summary><span class="lex-ic">${r.ic}</span><b>${esc(r.de)}</b> <span class="small">${esc(r.en)}</span><span class="lex-a">${esc(r.a)}</span></summary>${roleDetail(r, false)}</details>`).join("");
        });
        html += `</section>`;
      });
      $("#lexlist").innerHTML = html || `<p class="panel">Keine Rolle gefunden.</p>`;
    };
    draw();
    $("#lexq").addEventListener("input", e => { lexFilter.q = e.target.value; draw(); });
    $$("[data-led]").forEach(b => b.addEventListener("click", () => { lexFilter.ed = b.dataset.led; renderLex(); }));
    $$("[data-lteam]").forEach(b => b.addEventListener("click", () => { lexFilter.team = b.dataset.lteam; renderLex(); }));
  }

  // =====================================================================
  //  ANLEITUNG
  // =====================================================================
  function renderGuide() {
    view.innerHTML = installPanel() + `<section class="panel"><h2>Anleitung</h2>
      ${GUIDE.filter(g => g.id !== "online" || Net.configured()).map((g, i) => `<details class="guide" ${i < 2 ? "open" : ""}><summary>${esc(g.title)}</summary><div class="guide-body">${g.html}</div></details>`).join("")}
      </section>`;
    const tbl = $("#setup-table");
    if (tbl) {
      tbl.innerHTML = `<table class="setup"><thead><tr><th>Spieler</th><th class="t-townsfolk-text">Dorfb.</th><th class="t-outsider-text">Außens.</th><th class="t-minion-text">Schergen</th><th class="t-demon-text">Dämon</th></tr></thead><tbody>${
        Object.entries(SETUP_COUNTS).map(([n, c]) => `<tr><td>${n === "4" ? "4*" : n}</td>${c.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="small">* 4 Spieler ist eine inoffizielle Notvariante ohne Schergen.</p>`;
    }
    bindInstall();
  }

  // =====================================================================
  //  ONLINE-MODUS – Spielleiter
  // =====================================================================
  let lobby = {};            // uid -> { name, pub, joined }
  let lastInbox = {};
  let hostSubs = [];
  const sent = {};           // was zuletzt gesendet wurde (um nur Änderungen zu schicken)
  const handled = new Set();
  let syncTimer = null;
  const roomPath = p => `rooms/${game.online.code}${p ? "/" + p : ""}`;
  const netDot = () => `<span class="netdot ${Net.connected ? "on" : ""}"></span>`;
  const joinUrl = code => appUrl() + "#join=" + code;

  // Online-Spieler nachträglich einem Platz zuordnen (ohne neu zu verteilen)
  function pidSelect(i) {
    if (!game.online) return "";
    const s = game.seats[i];
    const ids = lobbyOrder();
    const gone = s.pid && !lobby[s.pid];
    return `<label class="pidsel">🌐 Handy:
      <select data-pid="${i}">
        <option value="">– kein Online-Spieler –</option>
        ${gone ? `<option value="${esc(s.pid)}" selected>(nicht mehr im Raum)</option>` : ""}
        ${ids.map(id => {
          const other = game.seats.findIndex((x, k) => k !== i && x.pid === id);
          return `<option value="${esc(id)}" ${s.pid === id ? "selected" : ""}>${esc(lobby[id].name)}${other >= 0 ? ` (bisher Platz ${other + 1})` : ""}</option>`;
        }).join("")}
      </select></label>`;
  }
  function setSeatPid(i, pid) {
    const s = game.seats[i];
    // Ein Handy gehört immer nur zu einem Platz
    if (pid) game.seats.forEach((x, k) => { if (k !== i && x.pid === pid) x.pid = null; });
    s.pid = pid || null;
    game.pids = playerSeats().map(x => x.pid || null);
    save();
    if (pid && lobby[pid]) toast(`${lobby[pid].name} ist jetzt mit Platz ${i + 1} (${s.name}) verbunden`);
  }

  function onlineBadge(s) {
    if (!game.online || !s.pid) return "";
    return lobby[s.pid] ? `<span class="badge on">🌐 online</span>` : `<span class="badge">🌐 nicht im Raum</span>`;
  }

  // Reihenfolge der Spieler im Raum (= Sitzreihenfolge), vom Spielleiter sortierbar.
  function lobbyOrder() {
    const ids = Object.keys(lobby).sort((a, b) => (lobby[a].joined || 0) - (lobby[b].joined || 0));
    const order = (game.lobbyOrder || []).filter(id => lobby[id]);
    ids.forEach(id => { if (!order.includes(id)) order.push(id); });
    return order;
  }

  function onlineHostPanel() {
    if (!Net.configured()) return "";
    if (!game.online) {
      return `<section class="panel online">
        <h2>🌐 Online-Spiel <span class="small">(optional)</span></h2>
        <p class="small">Alle treten mit ihrem eigenen Handy bei. Rollen, Spielende und die Wahl von Philosoph &amp; Co. werden dann automatisch übertragen – verschlüsselt, nur das richtige Handy kann seine Rolle lesen. Ohne Internet einfach wie bisher mit QR-Codes spielen.</p>
        <button class="btn primary" id="startonline">🌐 Online-Spiel starten</button>
      </section>`;
    }
    const order = lobbyOrder();
    return `<section class="panel online">
      <h2>🌐 Online-Spiel ${netDot()}</h2>
      <p>Raum-Code: <code class="code big">${esc(game.online.code)}</code></p>
      <p class="small">Mitspieler scannen diesen QR-Code oder öffnen die App → „Meine Rolle“ → „Online-Spiel beitreten“ und geben den Code ein.</p>
      <div class="qr small-qr">${qrSvg(joinUrl(game.online.code))}</div>
      <h3>Im Raum (${order.length})</h3>
      <p class="small">Sortiere die Spieler in Sitzreihenfolge (im Uhrzeigersinn).</p>
      <ol class="lobby">${order.map((id, k) => `<li><span>${esc(lobby[id].name)}</span>
        <button class="btn sm" data-lmove="${k}" data-dir="-1" ${k ? "" : "disabled"}>↑</button>
        <button class="btn sm" data-lmove="${k}" data-dir="1" ${k < order.length - 1 ? "" : "disabled"}>↓</button>
        <button class="btn sm danger" data-lkick="${id}">✕</button></li>`).join("") || "<li class='small'>Noch niemand beigetreten …</li>"}</ol>
      <div class="row wrap">
        <button class="btn primary" id="takelobby" ${order.length ? "" : "disabled"}>👥 Als Mitspieler übernehmen</button>
        <button class="btn danger" id="stoponline">Online-Spiel beenden</button>
      </div>
    </section>`;
  }

  function bindOnlineHost() {
    $("#startonline") && $("#startonline").addEventListener("click", startOnline);
    $("#stoponline") && $("#stoponline").addEventListener("click", () => {
      if (confirm("Online-Spiel beenden? Alle Spieler werden getrennt. Das Grimoire bleibt erhalten.")) stopOnline();
    });
    $$("[data-lmove]").forEach(b => b.addEventListener("click", () => {
      const order = lobbyOrder(), k = +b.dataset.lmove, j = k + +b.dataset.dir;
      [order[k], order[j]] = [order[j], order[k]];
      game.lobbyOrder = order;
      save(); renderSL();
    }));
    $$("[data-lkick]").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.lkick;
      if (!confirm(`${lobby[id].name} aus dem Raum entfernen?`)) return;
      const api = await Net.init();
      await api.remove(roomPath("players/" + id));
    }));
    $("#takelobby") && $("#takelobby").addEventListener("click", () => {
      const order = lobbyOrder();
      if (order.length < 4) { toast("Es braucht mindestens 4 Spieler."); return; }
      const ids = order.slice(0, 15);
      if (order.length > 15) toast("Mehr als 15 Spieler – die übrigen kannst du als Reisende hinzufügen.");
      if (game.count !== ids.length) game.selected = [];
      game.count = ids.length;
      game.names = ids.map(id => lobby[id].name);
      game.pids = ids;
      save(); renderSL();
      toast(`${ids.length} Spieler übernommen`);
    });
  }

  async function startOnline() {
    try {
      const api = await Net.init();
      const keys = await Net.genKeys();
      let code;
      for (let k = 0; k < 5; k++) {
        code = Net.newCode();
        if (!(await api.get(`rooms/${code}/meta`))) break;
      }
      await api.set(`rooms/${code}/meta`, { host: api.uid, hostPub: keys.pub, created: Date.now(), edition: game.edition });
      game.online = { code, pub: keys.pub, priv: keys.priv };
      game.lobbyOrder = [];
      game.pids = [];
      save();
      await hostConnect();
      renderSL();
    } catch (e) {
      toast("Online-Spiel konnte nicht gestartet werden – bist du mit dem Internet verbunden?");
    }
  }

  async function hostConnect() {
    if (!game.online || hostSubs.length) return;
    try {
      const api = await Net.init();
      if (!(await api.get(roomPath("meta")))) { game.online = null; save(); renderSL(); toast("Das Online-Spiel existiert nicht mehr."); return; }
      hostSubs.push(api.listen(roomPath("players"), v => {
        lobby = v || {};
        handleInbox(lastInbox);
        scheduleSync();
        refreshHostView();
      }));
      hostSubs.push(api.listen(roomPath("inbox"), v => { lastInbox = v || {}; handleInbox(lastInbox); }));
    } catch (e) {
      toast("Keine Verbindung zum Online-Spiel – du kannst offline weiterspielen.");
    }
  }

  async function stopOnline() {
    try { const api = await Net.init(); await api.remove(roomPath()); } catch (e) { /* offline */ }
    hostSubs.forEach(u => u());
    hostSubs = [];
    lobby = {};
    Object.keys(sent).forEach(k => delete sent[k]);
    game.online = null;
    game.pids = [];
    save(); renderSL();
  }

  // Lobby-Änderungen anzeigen, ohne dem Spielleiter beim Tippen dazwischenzufunken.
  function refreshHostView() {
    if (game.test && !game.online) { const tab = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (tab === "sl" && modal.classList.contains("hidden") && game.step === "grim") { const a = document.activeElement; if (!(a && ["INPUT", "SELECT", "TEXTAREA"].includes(a.tagName))) renderSL(); } return; }
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (tab !== "sl" || !modal.classList.contains("hidden")) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "SELECT")) return;
    if (game.step === "setup" || game.step === "assign" || game.step === "grim") renderSL();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncOnline, 300);
  }

  // Was alle sehen dürfen: Namen, lebt/tot, Nacht und am Ende die Auflösung. Keine Rollen während des Spiels.
  function publicState() {
    const w = game.winner;
    return {
      nightNo: game.nightNo || 1,
      phase: game.phase || "night",
      sleep: tableOn(),
      dawn: game.dawn || null,
      script: game.edition === "custom" && (game.script || []).length ? game.script.map(id => ROLE_BY_ID[id].hb ? id : ROLE_BY_ID[id].idx) : null,
      hb: (game.homebrew || []).filter(d => (game.script || []).includes(d.id)),
      ed: game.edition,
      scn: game.edition === "custom" ? game.scriptName || "" : "",
      fabled: game.fabled || [],
      timer: game.timer ? { running: !!game.timer.running, end: game.timer.end || 0, left: game.timer.left || 0, label: game.timer.label || "", endMsg: game.timer.endMsg || "" } : null,
      started: game.seats.length > 0 && game.step !== "setup",
      seats: game.seats.map(s => ({ n: s.name, a: !!s.alive, g: !!s.ghost || !!s.banshee, t: !!s.trav, bs: !!s.banshee })),
      pv: !!game.phoneVote && game.phase === "day",
      vote: game.phoneVote && game.vote ? { by: game.vote.by, on: game.vote.on, hands: game.vote.hands } : null,
      nomd: game.phoneVote ? (today().noms || []).map(n => n.by) : [],
      winner: w ? {
        team: w.team, reason: w.reason, nights: game.nightNo,
        reveal: game.seats.map(s => ({ n: s.name, r: s.role, s: shownRole(s.role), good: seatGood(s), a: !!s.alive })),
        bluffs: game.bluffs,
        history: (game.history || []).slice(-120).map(h => ({ n: h.n, ph: h.ph, t: h.t }))
      } : null
    };
  }

  async function syncOnline() {
    if (!game.online) return;
    let api;
    try { api = await Net.init(); } catch (e) { return; }
    const tasks = [];
    game.seats.forEach((s, i) => {
      const p = s.pid && lobby[s.pid];
      if (!p || !p.pub) return;
      const info = seatInfo(s, i);
      const sig = JSON.stringify(info) + p.pub.x;
      if (sent[s.pid] === sig) return;
      sent[s.pid] = sig;
      tasks.push(Net.shared(game.online.priv, p.pub)
        .then(k => Net.seal(k, info))
        .then(box => api.set(roomPath("roles/" + s.pid), box))
        .catch(e => { delete sent[s.pid]; throw e; }));
    });
    // Wer keinen Platz (mehr) hat, bekommt seine alte Rolle entzogen.
    Object.keys(lobby).forEach(uid => {
      if (!game.seats.some(s => s.pid === uid) && sent[uid] !== "none") {
        sent[uid] = "none";
        tasks.push(api.remove(roomPath("roles/" + uid)));
      }
    });
    const pub = publicState();
    const pj = JSON.stringify(pub);
    if (sent.__public !== pj) {
      sent.__public = pj;
      tasks.push(api.set(roomPath("public"), pub).catch(e => { delete sent.__public; throw e; }));
    }
    try { await Promise.all(tasks); } catch (e) { toast("Online: Senden fehlgeschlagen – wird erneut versucht."); setTimeout(scheduleSync, 3000); }
  }

  async function handleInbox(all) {
    if (!game.online) return;
    let api;
    try { api = await Net.init(); } catch (e) { return; }
    for (const [uid, msgs] of Object.entries(all || {})) {
      const p = lobby[uid];
      if (!p) continue;
      for (const [id, box] of Object.entries(msgs || {})) {
        if (handled.has(id)) continue;
        handled.add(id);
        try {
          const msg = await Net.open(await Net.shared(game.online.priv, p.pub), box);
          onPlayerMessage(uid, msg);
        } catch (e) { /* unlesbare Nachricht ignorieren */ }
        api.remove(roomPath(`inbox/${uid}/${id}`)).catch(() => {});
      }
    }
  }

  function onPhoneVote(uid, msg) {
    if (!game.phoneVote || game.phase !== "day") return;
    const i = game.seats.findIndex(s => s.pid === uid);
    if (i < 0) return;
    const x = game.seats[i];
    if (msg.type === "nominate") {
      if ((!x.alive && !x.banshee) || game.vote || !game.seats[msg.on]) return;
      game.nomReq = { by: i, on: +msg.on };
      save(); refreshHostView();
      notice(`📨 ${x.name} möchte ${game.seats[msg.on].name} nominieren`);
      return;
    }
    const v = game.vote;
    if (!v || v.on !== +msg.on || !(x.alive || x.ghost)) return;
    v.hands = msg.up ? [...new Set([...v.hands, i])] : v.hands.filter(k => k !== i);
    save(); refreshHostView();
  }
  function onPlayerMessage(uid, msg) {
    if (!game.online && !game.test) return;
    if (msg.type === "action") return onPlayerAction(uid, msg);
    if (msg.type === "nominate" || msg.type === "vote") return onPhoneVote(uid, msg);
    if (msg.type !== "pick" || !ROLE_BY_ID[msg.pick]) return;
    const i = game.seats.findIndex(s => s.pid === uid);
    const name = i >= 0 ? game.seats[i].name : (lobby[uid] && lobby[uid].name) || "?";
    const text = `${name} (${roleName(msg.role)}) wählt: ${roleName(msg.pick)}`;
    hist("🧠 " + text);
    game.log = [...(game.log || []), { t: Date.now(), text }].slice(-20);
    game.lastPicks = Object.assign(game.lastPicks || {}, { [msg.role]: msg.pick });
    if (i >= 0 && game.seats[i].role === "philosopher") setPhilo(i, msg.pick);
    else { save(); refreshHostView(); }
    notice("📨 " + text);
  }

  // Auffälliger Hinweis oben, bleibt bis zum Antippen (nachts übersieht man Toasts leicht).
  function notice(text) {
    const n = document.createElement("div");
    n.className = "notice";
    n.innerHTML = `<span>${esc(text)}</span><small>Tippen zum Schließen</small>`;
    n.addEventListener("click", () => n.remove());
    document.body.appendChild(n);
    if (navigator.vibrate) navigator.vibrate(200);
  }

  // =====================================================================
  //  ONLINE-MODUS – Spieler
  // =====================================================================
  let playerSubs = [];
  let pubState = store.get("botc.public", null);
  let pendingJoin = store.get("botc.pendingJoin", "");
  let showJoin = false;

  function joinPanel() {
    if (!Net.configured()) return "";
    return `<section class="panel online">
      <h2>🌐 Online-Spiel beitreten</h2>
      <p class="small">Hat der Spielleiter ein Online-Spiel gestartet? Dann Raum-Code und deinen Namen eingeben – deine Rolle kommt automatisch.</p>
      <form id="joinform" class="joinform" autocomplete="off">
        <input id="joincode" maxlength="6" placeholder="Raum-Code" autocapitalize="characters" spellcheck="false" value="${esc(pendingJoin)}">
        <input id="joinname" maxlength="20" placeholder="Dein Name" value="${esc(store.get("botc.myname", ""))}">
        <button class="btn primary" type="submit">Beitreten</button>
      </form>
      <p id="joinerr" class="error hidden"></p>
    </section>`;
  }

  function bindJoin() {
    const f = $("#joinform");
    if (!f) return;
    if (pendingJoin) setTimeout(() => $("#joinname") && $("#joinname").focus(), 50);
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const code = $("#joincode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const name = $("#joinname").value.trim();
      const err = $("#joinerr");
      if (!code || !name) { err.textContent = "Bitte Raum-Code und Namen eingeben."; err.classList.remove("hidden"); return; }
      const btn = f.querySelector("button");
      btn.disabled = true; btn.textContent = "Verbinde …";
      try {
        await joinRoom(code, name);
        pendingJoin = "";
        store.del("botc.pendingJoin");
        showJoin = false;
        renderPlayer();
      } catch (ex) {
        err.textContent = ex.message === "Raum nicht gefunden"
          ? "Diesen Raum gibt es nicht. Bitte den Code prüfen."
          : "Keine Verbindung – bist du mit dem Internet verbunden?";
        err.classList.remove("hidden");
        btn.disabled = false; btn.textContent = "Beitreten";
      }
    });
  }

  async function joinRoom(code, name) {
    const api = await Net.init();
    const meta = await api.get(`rooms/${code}/meta`);
    if (!meta) throw new Error("Raum nicht gefunden");
    let keys = store.get("botc.netkeys", null);
    if (!keys) { keys = await Net.genKeys(); store.set("botc.netkeys", keys); }
    await api.set(`rooms/${code}/players/${api.uid}`, { name, pub: keys.pub, joined: Date.now() });
    store.set("botc.myname", name);
    if ((store.get("botc.online", null) || {}).code !== code) store.del("botc.notes");
    store.set("botc.online", { code, name });
    store.del("botc.myrole");
    store.del("botc.public");
    pubState = null;
    await playerConnect();
  }

  async function playerConnect() {
    const on = store.get("botc.online", null);
    if (!on || playerSubs.length) return;
    let api;
    try { api = await Net.init(); } catch (e) { return; }
    const base = `rooms/${on.code}`;
    let meta, me;
    try { [meta, me] = await Promise.all([api.get(base + "/meta"), api.get(`${base}/players/${api.uid}`)]); } catch (e) { return; }
    if (!meta || !me) { leaveRoom(true); notice("Das Online-Spiel ist beendet oder du wurdest entfernt."); return; }
    const keys = store.get("botc.netkeys", null);
    const key = await Net.shared(keys.priv, meta.hostPub);
    playerSubs.push(api.listen(`${base}/players/${api.uid}`, v => {
      if (!v) { leaveRoom(true); notice("Das Online-Spiel ist beendet oder du wurdest entfernt."); }
    }));
    playerSubs.push(api.listen(`${base}/roles/${api.uid}`, async box => {
      const old = store.get("botc.myrole", null);
      if (!box) {
        if (old && old.online) { store.del("botc.myrole"); refreshPlayerView(true); }
        return;
      }
      let info;
      try { info = await Net.open(key, box); } catch (e) { return; }
      info.online = on.code;
      if (old && old.r === info.r && old.pick) info.pick = old.pick;
      store.set("botc.myrole", info);
      if ((info.q || info.wk) && $(".nightsent")) closeModal();
      if ($(".sleepshow") && (info.q || info.wk)) closeModal();
      nightOverlay();
      const newInfo = JSON.stringify((old && old.i) || []) !== JSON.stringify(info.i || []) && (info.i || []).length > ((old && old.i) || []).length;
      const changed = !old || newInfo || old.r !== info.r || old.a !== info.a || old.m !== info.m || JSON.stringify(old.x) !== JSON.stringify(info.x) || JSON.stringify(old.g || null) !== JSON.stringify(info.g || null);
      if (changed) {
        if (info.x && JSON.stringify((old && old.x) || null) !== JSON.stringify(info.x) && old) notice("🤫 Geheime Info deines Teams – schau auf deine Rollenkarte.");
        else if (newInfo && old && !info.wk) notice("🌙 Neue Info vom Spielleiter – schau auf deine Rollenkarte.");
        else if (info.g && old && !info.wk && JSON.stringify(old.g || null) !== JSON.stringify(info.g)) notice("📖 Das Grimoire ist da – schau auf deine Rollenkarte.");
        else if (info.m && (!old || old.m !== info.m)) notice("😵 Du bist verrückt! Schau auf deine Rollenkarte, welche Rolle du am Tag behaupten musst.");
        else if (old && old.online && old.r !== info.r) notice("Der Spielleiter hat deine Rolle geändert – schau sie dir an.");
        else if (old && old.online && (old.a || "") !== (info.a || "")) notice(`Deine Gesinnung hat sich geändert – du bist jetzt ${info.a === "e" ? "BÖSE 😈" : "GUT 😇"}.`);
        refreshPlayerView(true);
      }
    }));
    playerSubs.push(api.listen(`${base}/public`, v => {
      const before = pubState;
      pubState = v;
      if (v && v.hb) registerHomebrew(v.hb);
      store.set("botc.public", v);
      updateNetBar();
      const seatSig = x => JSON.stringify(((x && x.seats) || []).map(s => [s.n, s.a]));
      const a = document.activeElement;
      if (seatSig(before) !== seatSig(v) && $(".notes") && !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) {
        const tmp = document.createElement("div"); tmp.innerHTML = notesHtml(); $(".notes").replaceWith(tmp.firstElementChild); bindNotes();
      }
      if (v && v.winner && !(before && before.winner)) showPublicEnd(v);
      else {
        updateVoteBox();
        if (v && v.vote && !(before && before.vote && before.vote.on === v.vote.on) && navigator.vibrate) navigator.vibrate([120, 60, 120]);
        nightOverlay();
        if (v && v.dawn && before && (!before.dawn || before.dawn.n !== v.dawn.n)) {
          if ($(".sleepshow")) closeModal();
          const died = v.dawn.died || []; // Firebase speichert leere Listen nicht
          notice(`☀️ Morgen! ${died.length ? "Gestorben: " + died.join(", ") : "Niemand ist in der Nacht gestorben."}`);
        }
      }
    }));
  }

  function leaveRoom(silent) {
    const on = store.get("botc.online", null);
    playerSubs.forEach(u => u());
    playerSubs = [];
    if (on && !silent) Net.init().then(api => api.remove(`rooms/${on.code}/players/${api.uid}`)).catch(() => {});
    const mine = store.get("botc.myrole", null);
    if (mine && mine.online) store.del("botc.myrole");
    store.del("botc.online");
    store.del("botc.public");
    pubState = null;
    refreshPlayerView(true);
  }

  function refreshPlayerView(full) {
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1] || "rolle";
    if (tab !== "rolle" || !modal.classList.contains("hidden")) return;
    if (full) renderPlayer(); else updateNetBar();
  }

  function netbarHtml() {
    const on = store.get("botc.online", null);
    if (!on) return "";
    const p = pubState;
    const seats = (p && p.seats) || [];
    return `<section class="panel netbar">
      ${p && (p.fabled || []).length ? `<p class="small">✨ Fabelwesen: ${p.fabled.map(id => `<b>${esc(roleName(id))}</b> – ${esc(ROLE_BY_ID[id] ? ROLE_BY_ID[id].a : "")}`).join("<br>")}</p>` : ""}
      <div class="nb-top">${netDot()}<b>Raum ${esc(on.code)}</b><span>· ${esc(on.name)}</span>${p && p.started ? `<span>· 🌙 Nacht ${p.nightNo}</span>` : ""}</div>
      ${seats.length ? `<details class="nb-players" ${netbarOpen ? "open" : ""}><summary>Mitspieler (${seats.filter(s => s.a).length} von ${seats.length} leben)</summary>
        <p class="small">${"wakeLock" in navigator ? "🔆 Der Bildschirm bleibt an, solange du im Spiel bist – so verpasst du nachts nichts." : "⚠️ Dieses Handy kann den Bildschirm nicht selbst wach halten. Stell die automatische Sperre für das Spiel aus."}</p>
        <ul>${seats.map(s => `<li class="${s.a ? "" : "dead"}"><span>${esc(s.n)}</span><span>${s.a ? "❤️" : s.g ? "💀 👻 Stimme frei" : "💀"}</span></li>`).join("")}</ul></details>` : ""}
    </section>`;
  }
  let netbarOpen = false;
  function updateNetBar() {
    const el = $(".netbar");
    if (!el) return;
    const d = el.querySelector("details");
    if (d) netbarOpen = d.open;
    const tmp = document.createElement("div");
    tmp.innerHTML = netbarHtml();
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  }

  // Spielende auf den Handys der Spieler
  function showPublicEnd(p) {
    const w = p.winner;
    const mine = store.get("botc.myrole", null);
    const me = mine && w.reveal[mine.s];
    const good = w.team === "good";
    const won = me ? me.good === good : null;
    const list = w.reveal.map(s => `<li class="${s.good ? "al-good" : "al-evil"} ${s.a ? "" : "dead"}">
        <span class="er-name">${esc(s.n)}${s.a ? "" : " 💀"}</span>${roleChip(s.r)}
        ${s.s !== s.r ? `<span class="small">(glaubte: ${esc(roleName(s.s))})</span>` : ""}
        <span class="er-al">${s.good ? "gut" : "böse"}</span></li>`).join("");
    openModal(`<div class="endscreen ${w.team}">
        <div class="end-icon">${good ? "😇" : "😈"}</div>
        <h1>${good ? "Gut gewinnt!" : "Böse gewinnt!"}</h1>
        <p class="end-reason">${esc(w.reason)}</p>
        ${won === null ? "" : `<p class="end-me">${won ? "🎉 Du hast gewonnen!" : "Du hast verloren."}</p>`}
        <p class="end-sub">Nach ${w.nights} ${w.nights === 1 ? "Nacht" : "Nächten"}.</p>
      </div>
      <h3>Auflösung</h3>
      <ul class="endlist">${list}</ul>
      ${(w.bluffs || []).length ? `<p class="small">Bluffs des Dämons: ${w.bluffs.map(id => esc(roleName(id))).join(", ")}</p>` : ""}
      ${historyHtml(w.history)}
      <div class="row center"><button class="btn primary" id="pubendclose">Schließen</button></div>`, "full");
    $("#pubendclose").addEventListener("click", () => { closeModal(); refreshPlayerView(true); });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // Nachricht an den Spielleiter (verschlüsselt)
  async function sendToHost(msg) {
    const on = store.get("botc.online", null);
    if (!on) return false;
    try {
      const api = await Net.init();
      const meta = await api.get(`rooms/${on.code}/meta`);
      const keys = store.get("botc.netkeys", null);
      const key = await Net.shared(keys.priv, meta.hostPub);
      await api.push(`rooms/${on.code}/inbox/${api.uid}`, await Net.seal(key, msg));
      return true;
    } catch (e) { return false; }
  }

  // =====================================================================
  //  ROUTER
  // =====================================================================
  function route() {
    const h = location.hash;
    if (h.startsWith("#join=")) {
      pendingJoin = h.slice(6).toUpperCase().replace(/[^A-Z0-9]/g, "");
      store.set("botc.pendingJoin", pendingJoin);
      history.replaceState(null, "", "#/rolle");
    }
    if (h.startsWith("#k=")) {
      const info = decodeLink(h.slice(3));
      if (info) store.set("botc.myrole", info);
      history.replaceState(null, "", "#/rolle");
      if (!info) toast("Der Link ist ungültig.");
    }
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1] || (store.get("botc.myrole", null) ? "rolle" : "anleitung");
    $$(".tabbar a").forEach(a => a.classList.toggle("active", a.dataset.tab === tab));
    closeModal();
    if (tab === "sl") renderSL();
    else if (tab === "rollen") renderLex();
    else if (tab === "anleitung") renderGuide();
    else renderPlayer();
  }
  // Homebrew-Rollen (Spielleiter: aus dem Spiel; Spieler: von der Karte bzw. aus dem Online-Raum) bekannt machen
  registerHomebrew(game.homebrew);
  { const mine = store.get("botc.myrole", null); if (mine && mine.hbd) registerHomebrew(mine.hbd); }
  if (pubState && pubState.hb) registerHomebrew(pubState.hb);
  window.addEventListener("hashchange", route);
  route();
  setTimeout(applyPhase, 0);
  if (Net.configured()) {
    if (game.online) hostConnect();
    if (store.get("botc.online", null)) playerConnect();
  }
  document.addEventListener("net-status", () => { updateNetBar(); $$(".netdot").forEach(d => d.classList.toggle("on", Net.connected)); });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // Neue Version gefunden: einmal neu laden, damit nicht alte und neue Dateien gemischt laufen.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => {});
  }

  // =====================================================================
  //  BILDSCHIRM WACH HALTEN (im Online-Spiel)
  // =====================================================================
  // Bei ausgeschaltetem Bildschirm kommen keine Aufgaben, Infos oder Timer an.
  // Deshalb bleibt der Bildschirm an, solange dieses Handy in einem Online-Spiel ist.
  let wakeLock = null;
  async function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    const want = !!(store.get("botc.online", null) || game.online);
    if (want && !wakeLock && document.visibilityState === "visible") {
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLock = lock;
        lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
      } catch (e) { /* z. B. Energiesparmodus – später erneut versuchen */ }
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      lock.release().catch(() => {});
    }
  }
  // Das System gibt die Sperre frei, sobald die App in den Hintergrund geht – beim Zurückkommen neu anfordern.
  document.addEventListener("visibilitychange", keepAwake);
  document.addEventListener("click", keepAwake);
  setInterval(keepAwake, 10000);
  keepAwake();

  // Für Tests im Browser
  window.__botc = { makeCode, readCode, encodeLink, decodeLink, awake: () => !!wakeLock };
})();
