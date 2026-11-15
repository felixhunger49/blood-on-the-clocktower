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
  const isGood = (role, align) => role.t === "traveller" ? align !== "e" : TEAMS[role.t].good;
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
  const rolesOf = (ed, team) => ROLES.filter(r => inEd(r, ed) && r.t === team);
  const roleName = id => ROLE_BY_ID[id] ? ROLE_BY_ID[id].de : "?";

  // ---------- Rollenkarte ----------
  function cardHtml(info) {
    const role = ROLE_BY_ID[info.r];
    const good = isGood(role, info.a);
    const team = TEAMS[role.t];
    let evil = "";
    if (info.x) {
      const x = info.x;
      evil = `<div class="box evilinfo"><h4>🤫 Geheime Info deines Teams</h4>`;
      if (x.d) evil += `<p>Dein Dämon ist: <b>${esc(x.d)}</b></p>`;
      if (x.m && x.m.length) evil += `<p>${x.d ? "Weitere Schergen" : "Deine Schergen"}: <b>${x.m.map(esc).join(", ")}</b></p>`;
      if (x.m && !x.m.length && !x.d) evil += `<p>Du hast keine Schergen.</p>`;
      if (x.l) evil += `<p>Der Wahnsinnige (glaubt, Dämon zu sein): <b>${esc(x.l)}</b></p>`;
      if (x.mo) evil += `<p>Deine Marionette (glaubt, gut zu sein): <b>${esc(x.mo)}</b></p>`;
      if (x.b && x.b.length) evil += `<p>Deine Bluffs (gute Rollen, die nicht im Spiel sind):</p><ul>${x.b.map(id => `<li><b>${esc(roleName(id))}</b> – ${esc(ROLE_BY_ID[id].a)}</li>`).join("")}</ul>`;
      evil += `</div>`;
    }
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
          ${(info.i || []).length ? `<div class="box infos"><h4>🌙 Deine Infos vom Spielleiter</h4><ul>${info.i.map(x =>
            `<li><b>Nacht ${x.n}:</b> ${[(x.r || []).map(id => esc(roleName(id))).join(" / "), x.t ? esc(x.t) : ""].filter(Boolean).join(" – ")}</li>`).join("")}</ul></div>` : ""}
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
  function renderPlayer() {
    const mine = store.get("botc.myrole", null);
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
      ${notesHtml()}
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
  const save = () => { store.set("botc.game", game); if (game.online) scheduleSync(); };

  const playerSeats = () => game.seats.filter(s => !s.trav);
  // Gesinnung: Reisende und umgedrehte Spieler (z. B. Schlangenbeschwörer) haben s.align, sonst gilt der Rollentyp.
  const seatGood = s => s.align ? s.align !== "e" : TEAMS[ROLE_BY_ID[s.role].t].good;

  // Prüft die automatisch erkennbaren Siegbedingungen. Gibt null zurück, solange das Spiel läuft.
  function detectEnd() {
    const ps = playerSeats();
    if (!ps.length) return null;
    const alive = ps.filter(s => s.alive);
    const demons = ps.filter(s => ROLE_BY_ID[s.role].t === "demon");
    const aliveDemons = demons.filter(s => s.alive || s.zfake);
    if (demons.length && !aliveDemons.length) {
      const warn = [];
      if (ps.some(s => s.role === "mastermind" && s.alive))
        warn.push("Der Drahtzieher lebt – wurde der Dämon hingerichtet, wird noch ein Tag gespielt.");
      if (demons.some(s => s.role === "imp") && ps.some(s => s.alive && ROLE_BY_ID[s.role].t === "minion"))
        warn.push("Hat sich der Imp selbst getötet, wird ein Scherge zum Imp – dann dessen Rolle ändern (🔁).");
      return { winner: "good", reason: "Der Dämon ist tot.", warn };
    }
    if (aliveDemons.length && alive.length <= 2)
      return { winner: "evil", reason: "Nur noch 2 Spieler leben – der Dämon hat überlebt.", warn: [] };
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
    game.winner = null;
    game.ignoreEnd = null;
    game.evilSent = {};
    game.phase = "night";
    game.history = [{ n: 1, ph: "night", t: `🎬 Spiel beginnt – ${EDITIONS[game.edition].name}, ${playerSeats().length} Spieler` }];
    game.statsId = null;
  }

  function evilInfoFor(seat) {
    // Böse-Infos stehen auf der Karte, wenn der Schalter an ist oder der Spielleiter sie in der Nacht gesendet hat.
    const sent = game.evilSent || {};
    if (seat.trav) return undefined;
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
    if (seat.trav) info.a = seat.align;
    if (game.edition === "custom" && (game.script || []).length) info.sc = game.script.map(id => ROLE_BY_ID[id].idx);
    const x = evilInfoFor(seat);
    if (x) info.x = x;
    if (seat.madness && seat.madness.night === game.nightNo && seat.alive) info.m = seat.madness.role;
    if ((seat.infos || []).length) info.i = seat.infos.slice(-10);
    const ask = (game.asks || {})[i];
    if (nightOn() && ask && ask.night === game.nightNo && !ask.done) info.q = { id: ask.id, step: ask.step, sleep: !!ask.sleep };
    const wk = (game.wakes || {})[i];
    if (tableOn() && wk && wk.night === game.nightNo && !wk.done) info.wk = { id: wk.id, step: wk.step, r: wk.r, t: wk.t };
    return info;
  }
  function seatCode(seat, i) {
    const align = seat.trav ? (seat.align === "e" ? 2 : 1) : 0;
    return makeCode(ROLE_BY_ID[seat.swPending ? "scarletwoman" : shownRole(seat.role)].idx, align, i, seat.salt);
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
    endPopup();
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
        <div class="row wrap"><button class="btn primary" id="auto">🎲 Zufällig auswählen</button><button class="btn" id="clear">Auswahl leeren</button></div>
        ${warn}
        ${extra}
        ${["townsfolk", "outsider", "minion", "demon"].map(teamBlock).join("")}
        <details class="fabledpick" ${(game.fabled || []).length ? "open" : ""}><summary><h3 class="team-h t-fabled-text">Fabelwesen <span class="small">(optional – Sonderregeln, alle wissen davon)</span></h3></summary>
          <div class="tiles">${ROLES.filter(r => r.t === "fabled").map(r => `<button class="tile t-fabled ${(game.fabled || []).includes(r.id) ? "on" : ""}" data-fabled="${r.id}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></button>`).join("")}</div>
        </details>
        <div class="row end"><button class="btn primary" id="next2" ${total === game.count ? "" : "disabled"}>Weiter: Verteilen →</button></div>
      </section>`;
  }

  function roleChip(id, extra = "") {
    const r = ROLE_BY_ID[id];
    return `<span class="rchip t-${r.t}">${r.ic} ${esc(r.de)}${extra}</span>`;
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
    const travOpts = ROLES.filter(r => r.t === "traveller" && (game.edition !== "custom" || !(game.script || []).some(id => ROLE_BY_ID[id].t === "traveller") || game.script.includes(r.id))).map(r => `<option value="${r.id}">${esc(r.de)} (${esc(EDITIONS[r.ed].name)})</option>`).join("");
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
        <div class="travform">
          <input id="travname" placeholder="Name">
          <select id="travrole">${travOpts}</select>
          <select id="travalign"><option value="g">Gut</option><option value="e">Böse</option></select>
          ${game.online ? `<select id="travpid"><option value="">– kein Online-Spieler –</option>${Object.entries(lobby).filter(([uid]) => !game.seats.some(x => x.pid === uid)).map(([uid, p]) => `<option value="${uid}">🌐 ${esc(p.name)}</option>`).join("")}</select>` : ""}
          <button class="btn" id="addtrav">+ Hinzufügen</button>
        </div>
      </section>
      <div class="row end"><button class="btn primary" id="next3">Weiter: Grimoire →</button></div>`;
  }

  function slGrim() {
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
        const ev = evilTeam();
        let who = "";
        if (id === "minioninfo") who = `Dämon: ${esc(ev.demon ? ev.demon.name : "–")}`;
        if (id === "demoninfo") who = `Schergen: ${ev.minions.map(m => esc(m.name)).join(", ") || "–"} · Bluffs: ${game.bluffs.map(b => esc(roleName(b))).join(", ")}`;
        steps.push({ id, name: NIGHT_STEPS[id].de, text: NIGHT_STEPS[id][key], who, show: id === "minioninfo" || id === "demoninfo" });
        return;
      }
      const role = ROLE_BY_ID[id];
      if (!role || !role[key]) return;
      const holders = ps.filter(s => s.role === id || (id === "scarletwoman" && s.swPending));
      const drunks = ps.filter(s => (s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id);
      const philos = ps.filter(s => s.role === "philosopher" && s.gained === id);
      if (!holders.length && !drunks.length && !philos.length) return;
      const who = [...holders.map(s => esc(s.name) + (s.alive ? "" : " †") + (philos.length ? " (betrunken durch Philosoph)" : "")),
        ...drunks.map(s => esc(s.name) + (s.alive ? "" : " †") + (s.role === "drunk" ? " (Säufer – Info darf falsch sein)" : " (Marionette – Info darf falsch sein)")),
        ...philos.map(s => esc(s.name) + (s.alive ? "" : " †") + " (Philosoph)")].join(", ");
      // Tote Spieler haben keine Fähigkeit mehr – außer Rollen, die gerade durch ihren Tod ausgelöst werden.
      const all = [...holders, ...drunks, ...philos];
      const notTriggered = ACTS_WHEN_DEAD.includes(id) && !all.some(s => deathTriggered(s, id));
      const allDead = !ACTS_WHEN_DEAD.includes(id) && all.every(s => !s.alive && !s.zfake);
      const allKilled = !allDead && !ACTS_WHEN_DEAD.includes(id) && all.every(s => (!s.alive && !s.zfake) || killedBefore(s, id));
      const allUsed = ONCE_PER_GAME.includes(id) && all.every(s => (s.role === "philosopher" && id !== "philosopher" ? s.gainedUsed : s.used) || !s.alive);
      // Der Jongleur erfährt sein Ergebnis nur in der Nacht nach dem ersten Tag.
      const over = id === "juggler" && game.nightNo > 2;
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
    return banner + `
      <section class="panel">
        <h2>Grimoire</h2>
        ${game.online ? `<p class="small">${netDot()} Online-Spiel ${esc(game.online.code)}</p>` : ""}
        ${(game.log || []).length ? `<div class="box msglog"><h4>📨 Meldungen von Spielern</h4><ul>${game.log.slice(-5).reverse().map(l => `<li>${esc(l.text)}</li>`).join("")}</ul></div>` : ""}
        <div class="daycount">🌙 Nacht ${game.nightNo} <span>·</span> ☀️ ${game.nightNo > 1 ? `Tag ${game.nightNo - 1} vorbei` : "noch kein Tag"}</div>
        <p class="small">${alive} von ${playerSeats().length} Spielern leben · Für eine Hinrichtung nötig: <b>${needed}</b> Stimmen</p>
        ${timerBox()}
        <label class="switch"><input type="checkbox" id="musictoggle" ${Mood.on ? "checked" : ""}>
          <span><b>🎵 Stimmungsmusik</b> – leise Klänge für Nacht und Tag, nur auf diesem Handy.</span></label>
        <div class="chips viewtoggle">
          <button class="chip ${game.circle ? "" : "on"}" data-gview="list">☰ Liste</button>
          <button class="chip ${game.circle ? "on" : ""}" data-gview="circle">◯ Sitzkreis</button>
        </div>
        ${game.circle ? circleHtml() : `<div class="gseats">${seats}</div>`}
        <div class="box"><h4>Bluffs</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p></div>
        ${(game.fabled || []).length ? `<div class="box"><h4>Fabelwesen (öffentlich ansagen)</h4>${game.fabled.map(id => `<p>${roleChip(id)} ${esc(ROLE_BY_ID[id].a)}</p>`).join("")}</div>` : ""}
      </section>
      <section class="panel">
        <h2>${first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`}</h2>
        <p class="small">${steps.filter(st => !st.inactive && done.includes(st.id)).length} von ${steps.filter(st => !st.inactive).length} Schritten erledigt${steps.some(st => st.inactive) ? " · grau = tot oder benutzt, entfällt" : ""}</p>
        <label class="switch sugswitch"><input type="checkbox" id="sugtoggle" ${game.suggest === false ? "" : "checked"}>
          <span><b>💡 Info-Vorschläge</b> – beim Info-Fenster trägt die App die <i>wahre</i> Info schon ein (du kannst sie ändern).</span></label>
        ${nightActionsBar(steps)}
        <ol class="nightlist">${steps.map(s => `
          <li class="${s.inactive ? "inactive" : done.includes(s.id) ? "done" : ""} ${s.t ? "t-" + s.t + "-border" : ""}" data-step-id="${s.id}">
            <div class="ns-head">${s.inactive ? `<span class="dead-mark">${s.mark}</span>` : `<input type="checkbox" ${done.includes(s.id) ? "checked" : ""}>`}<b>${esc(s.name)}</b>${s.who ? `<span class="who">${s.who}</span>` : ""}</div>
            <p>${s.inactive ? s.why : esc(s.text)}</p>
            ${s.id === "scarletwoman" && !s.inactive ? game.seats.map((x, i) => x.swPending ? `<button class="btn sm primary" data-swshow="${i}">👑 ${esc(x.name)} zeigen: Du bist ${esc(roleName(x.role))}${game.online || game.test ? " (aufs Handy)" : ""}</button>` : "").join("") : ""}
            ${s.id === "philosopher" && !s.inactive ? game.seats.map((x, i) => x.role === "philosopher" && x.alive && !x.used ? philoSelect(i) : "").join("") : ""}
            ${s.once && !s.inactive && s.id !== "philosopher" ? `<button class="btn sm useonce" data-useonce="${s.id}">✔ Fähigkeit wurde benutzt</button>` : ""}
            ${!s.inactive && nightOn() ? actionStatusHtml(s.id) : ""}
            ${tableOn() && INFO_ROLES.includes(s.id) && !s.inactive ? wakeStatusHtml(s.id) : ""}
            ${INFO_ROLES.includes(s.id) && !s.inactive ? `<button class="btn sm primary showinfo" data-info-step="${s.id}">📱 ${SHOW_ROLE.includes(s.id) ? "Rolle zeigen" : "Info"}${game.online || game.test ? " / senden" : ""}</button>` : ""}
            ${s.show ? `<button class="btn sm primary showevil" data-show="${s.id}">📱 ${s.id === "demoninfo" ? "Dem Dämon zeigen" : "Den Schergen zeigen"} <small>(hier)</small></button>` : ""}
            ${s.show && (game.online || game.test) ? `<button class="btn sm ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "used" : "primary"} sendevil" data-sendevil="${s.id}">🌐 ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "✔ Gesendet" : "Aufs Handy senden"}</button>` : ""}
          </li>`).join("")}</ol>
        <div class="row wrap">
          ${game.phase === "day" ? "" : `<button class="btn primary" id="daystart">☀️ Morgen – Tag ${game.nightNo} beginnt</button>`}
          <button class="btn ${game.phase === "day" ? "primary" : ""}" id="nextnight">🌙 Tag ${game.nightNo} vorbei → Nacht ${game.nightNo + 1} beginnen</button>
          ${game.nightNo > 1 ? `<button class="btn sm" id="prevnight">↩︎ Zurück zu Nacht ${game.nightNo - 1}</button>` : ""}
        </div>
      </section>
      ${dayPanel()}
      <section class="panel">
        <h2>Spiel beenden</h2>
        <p class="small">Für Siege, die die App nicht selbst erkennt – z. B. Heiliger hingerichtet, Bürgermeister-Sieg, Vortox ohne Hinrichtung, Tollpatsch, Böser Zwilling.</p>
        <label class="field">Grund (optional): <input id="winreason" placeholder="z. B. Der Heilige wurde hingerichtet"></label>
        <div class="row wrap">
          <button class="btn wingood" data-win="good">😇 Gut hat gewonnen</button>
          <button class="btn winevil" data-win="evil">😈 Böse hat gewonnen</button>
        </div>
      </section>`;
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
      save(); renderSL();
    });
    $("#next3") && $("#next3").addEventListener("click", () => goStep("grim"));

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
      game.asks = {};
      game.seq = null;
      game.tableNight = null;
      game.wakes = {};
      // Schutz-/Ziel-Marker gelten nur eine Nacht; Gift & Betrunken bis zur nächsten Nacht (außer 📌)
      const healed = [];
      game.seats.forEach(x => {
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
      const nl = $(".nightlist");
      if (nl) nl.closest(".panel").scrollIntoView({ behavior: "smooth" });
      toast(`Nacht ${game.nightNo} beginnt`);
    });
    $("#prevnight") && $("#prevnight").addEventListener("click", () => { game.nightNo--; save(); renderSL(); });
    bindDay();
    $$("[data-change]").forEach(b => b.addEventListener("click", () => changeRole(+b.dataset.change)));
    $$("[data-seatmodal]").forEach(b => b.addEventListener("click", () => seatModal(+b.dataset.seatmodal)));
    $$("[data-gview]").forEach(b => b.addEventListener("click", () => { game.circle = b.dataset.gview === "circle"; save(); renderSL(); }));
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
      const count = validHands(order.filter(i => v.hands.includes(i))).length;
      body += `<div class="vote">
        <p><b>${esc(ps[v.by].name)}</b> nominiert <b>${esc(ps[v.on].name)}</b></p>
        <p class="small">Gehe im Uhrzeigersinn herum und tippe alle an, die die Hand heben. Tote haben nur ihre eine Geisterstimme.</p>
        <div class="votelist">${order.map(i => {
          const s = ps[i];
          const canVote = s.alive || s.ghost;
          const up = v.hands.includes(i);
          const bc = butlerCheck(i, v.hands);
          const isMaster = (s.marks || []).includes("master") && ps.some(y => y.role === "butler");
          return `<button class="voter ${up ? "up" : ""} ${bc && bc.warn ? "warn" : ""} ${v.clock === i ? "clock" : ""}" data-hand="${i}" ${canVote ? "" : "disabled"}>
            <span>${up ? "✋" : "·"}</span><b>${esc(s.name)}</b>${s.alive ? "" : `<small>${s.ghost ? "👻 Geisterstimme" : "keine Stimme mehr"}</small>`}${bc ? `<small>${esc(bc.note)}</small>` : ""}${isMaster ? `<small>🎩 Meister des Butlers</small>` : ""}</button>`;
        }).join("")}</div>
        <div class="votecount ${count >= votesNeeded() ? "ok" : ""}">${count} Stimmen · nötig ${votesNeeded()}${b && !b.tie ? ` · auf dem Block mit ${b.count}` : ""}</div>
        ${game.test && !v.botDone ? `<div class="row wrap"><button class="btn" id="botvote">🤖 Bots stimmen ab</button></div>` : ""}
        <div class="row wrap"><button class="btn primary" id="savevote">Abstimmung beenden</button><button class="btn" id="cancelvote">Abbrechen</button></div>
      </div>`;
    } else {
      const opt = (list, sel) => list.map(i => `<option value="${i}">${esc(ps[i].name)}${sel(i)}</option>`).join("");
      const all = ps.map((_, i) => i);
      body += `<div class="nomform">
        <label>Wer nominiert?<select id="nomby">${opt(all.filter(i => ps[i].alive), i => nominatedBy.has(i) ? " (hat schon nominiert)" : "")}</select></label>
        <label>Wer wird nominiert?<select id="nomon">${opt(all, i => nominated.has(i) ? " (war schon nominiert)" : "")}</select></label>
        <button class="btn primary" id="startvote">🗳️ Abstimmung starten</button>
      </div>
      ${game.test ? `<div class="row wrap"><button class="btn" id="botnom">🤖 Ein Bot nominiert</button></div>
        <p class="small">Ein zufälliger Bot nominiert jemanden und alle Bots stimmen ab – Böse halten zusammen, Gute raten. Du zählst wie am Tisch mit und entscheidest am Ende.</p>` : ""}
      <p class="small">Regeln: Jeder <b>lebende</b> Spieler darf einmal pro Tag nominieren, jeder Spieler einmal pro Tag nominiert werden. Tote nominieren nicht.</p>`;
    }

    const noms = day.noms.map((n, k) => `<li class="${b && !b.tie && b === n ? "onblock" : ""}">
        <span>${esc(ps[n.by] ? ps[n.by].name : "?")} → <b>${esc(ps[n.on] ? ps[n.on].name : "?")}</b></span>
        <span class="nomcount">${n.count} / ${n.needed}${b && !b.tie && b === n ? " · auf dem Block" : ""}</span>
        ${day.exec ? "" : `<button class="btn sm" data-delnom="${k}" title="Nominierung löschen">✕</button>`}</li>`).join("");

    let blockLine = "Noch niemand auf dem Block.";
    if (b && b.tie) blockLine = `Gleichstand mit ${b.count} Stimmen – niemand ist auf dem Block.`;
    else if (b) blockLine = `Auf dem Block: <b>${esc(ps[b.on].name)}</b> mit ${b.count} Stimmen.`;

    const execBtns = day.exec || v ? "" : `<div class="row wrap">
        ${b && !b.tie ? `<button class="btn danger" id="execute">⚔️ ${esc(ps[b.on].name)} hinrichten</button>` : ""}
        <button class="btn" id="noexec">Niemand wird hingerichtet</button>
      </div>`;

    return `<section class="panel">
      <details class="daypanel" ${game.voteOpen ? "open" : ""}>
        <summary><h2>☀️ Tag ${game.nightNo} – Abstimmung <span class="small">(optional)</span></h2></summary>
        <p class="small">Nötig für die Hinrichtung: <b>${votesNeeded()}</b> Stimmen (Hälfte der Lebenden). ${blockLine}</p>
        ${body}
        ${noms ? `<h3>Nominierungen heute</h3><ul class="nomlist">${noms}</ul>` : ""}
        ${execBtns}
      </details>
    </section>`;
  }

  function bindDay() {
    const dp = $(".daypanel");
    if (!dp) return;
    dp.addEventListener("toggle", () => { game.voteOpen = dp.open; save(); });
    const day = today();
    $("#startvote") && $("#startvote").addEventListener("click", () => {
      const by = +$("#nomby").value, on = +$("#nomon").value;
      if (Number.isNaN(by) || Number.isNaN(on)) return;
      const warn = [];
      if (day.noms.some(n => n.by === by)) warn.push(`${game.seats[by].name} hat heute schon nominiert.`);
      if (day.noms.some(n => n.on === on)) warn.push(`${game.seats[on].name} war heute schon nominiert.`);
      if (warn.length && !confirm(warn.join("\n") + "\n\nTrotzdem abstimmen?")) return;
      game.vote = { by, on, hands: [] };
      save(); renderSL();
    });
    $$("[data-hand]").forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.hand, h = game.vote.hands;
      game.vote.hands = h.includes(i) ? h.filter(x => x !== i) : [...h, i];
      save(); renderSL();
    }));
    $("#cancelvote") && $("#cancelvote").addEventListener("click", () => { botVoteRun++; game.vote = null; save(); renderSL(); });
    $("#botnom") && $("#botnom").addEventListener("click", botNominate);
    $("#botvote") && $("#botvote").addEventListener("click", () => { $("#botvote").disabled = true; botVote(); });
    $("#savevote") && $("#savevote").addEventListener("click", () => {
      const v = game.vote;
      botVoteRun++;
      const hands = validHands(v.hands);
      // Tote, die abgestimmt haben, verbrauchen ihre Geisterstimme.
      hands.forEach(i => { const s = game.seats[i]; if (!s.alive) s.ghost = false; });
      day.noms.push({ by: v.by, on: v.on, count: hands.length, needed: votesNeeded(), hands });
      hist(`🗳️ ${game.seats[v.by].name} nominiert ${game.seats[v.on].name}: ${hands.length} Stimme(n)`, "day");
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
      const rule = s.alive ? deathRule(s) : null;
      if (rule) msg += `\n\n${rule.why}.`;
      else if (["pacifist", "tealady", "devilsadvocate"].some(id => game.seats.some(x => x.role === id)) || (s.marks || []).includes("survives"))
        msg += "\n\nHinweis: Eine Rolle im Spiel kann die Hinrichtung verhindern (z. B. Pazifist, Teedame, Advocatus Diaboli). Prüfe das, bevor du bestätigst.";
      if (!confirm(msg)) return;
      day.exec = { seat: b.on, name: s.name };
      hist(`⚔️ ${s.name} wurde hingerichtet (${role.ic} ${role.de})`, "day");
      swMsg = null;
      applyDeath(s, rule);
      if (game.seats[b.on].alive) day.exec.survived = true;
      save(); renderSL();
      if (s.role === "saint") toast("Der Heilige wurde hingerichtet – Böse gewinnt!");
      else if (swMsg) toast(swMsg);
      else if (rule && !rule.dies) toast(`${s.name} wurde hingerichtet, stirbt aber nicht (${role.de})`);
      else toast(`${s.name} wurde hingerichtet (${role.de})`);
    });
    $("#noexec") && $("#noexec").addEventListener("click", () => {
      day.exec = "none";
      hist("🕊️ Heute wurde niemand hingerichtet", "day");
      save(); renderSL();
      if (game.seats.some(s => s.role === "vortox" && s.alive)) toast("Achtung: Vortox im Spiel – ohne Hinrichtung gewinnt Böse!");
      else { const mc = mayorWinCheck(); if (mc && !mc.ok) toast(mc.why); }
    });
    $("#undoexec") && $("#undoexec").addEventListener("click", () => {
      if (day.exec && day.exec !== "none" && game.seats[day.exec.seat]) { const x = game.seats[day.exec.seat]; x.alive = true; x.zfake = false; swRevert(day.exec.seat); }
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
        ${isBot(s) ? `<button class="btn" data-m="phone">🤖 Handy ansehen</button>` : ""}
        <button class="btn" data-m="change">🔁 Rolle ändern</button>
        ${cer ? `<span class="hint-pair"><button class="btn" data-m="mad">😵 Wahnsinn</button>${helpBtn("s:mad")}</span>` : ""}
        ${ONCE_PER_GAME.includes(s.role) && s.role !== "philosopher" ? `<span class="hint-pair"><button class="btn ${s.used ? "used" : ""}" data-m="used">${s.used ? "✔ Fähigkeit benutzt" : "○ Fähigkeit frei"}</button>${helpBtn("s:used")}</span>` : ""}
      </div>
      ${s.role === "philosopher" ? philoSelect(i) : ""}
      <div class="row end"><button class="btn primary" data-m="close">Fertig</button></div>`);
    const root = $("#modal-content");
    const again = () => { save(); renderSL(); seatModal(i); };
    root.querySelectorAll("[data-mk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.mk, m = s.marks || [];
      s.marks = m.includes(k) ? m.filter(x => x !== k) : [...m, k];
      if (!s.marks.includes(k)) s.keep = (s.keep || []).filter(x => x !== k);
      again();
    }));
    root.querySelectorAll("[data-keep]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.keep, kp = s.keep || [];
      s.keep = kp.includes(k) ? kp.filter(x => x !== k) : [...kp, k];
      toast(s.keep.includes(k) ? "📌 Bleibt dauerhaft, bis du es entfernst" : "🌙 Verschwindet in der nächsten Nacht");
      again();
    }));
    root.querySelector("#m-note").addEventListener("input", e => { s.note = e.target.value; save(); });
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
      else if (a === "used") { s.used = !s.used; again(); }
      else if (a === "info") openModal(roleDetail(ROLE_BY_ID[s.role], true));
      else if (a === "phone") showBotPhone(i);
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
      <div class="tb-row"><h4>⏱️ Timer</h4><span class="timerval big ${left !== null && left <= 0 ? "over" : ""}">${left === null ? "0:00" : fmtTime(left)}</span></div>
      <div class="chips">${[2, 3, 5, 8, 10].map(m => `<button class="chip" data-tmin="${m}">${m} min</button>`).join("")}</div>
      <div class="row wrap">
        ${t && t.running ? `<button class="btn" id="tpause">⏸️ Pause</button>` : t && t.left > 0 ? `<button class="btn primary" id="tstart">▶️ Weiter</button>` : ""}
        ${t && (t.running || t.left > 0) ? `<button class="btn" id="tplus">+1 min</button>` : ""}
        ${t ? `<button class="btn" id="treset">⏹️ Stopp</button>` : ""}
      </div>
      ${game.online ? `<p class="small">🌐 Die Spieler sehen den Timer auf ihrem Handy.</p>` : ""}
    </div>`;
  }
  function bindTimer() {
    $$("[data-tmin]").forEach(b => b.addEventListener("click", () => {
      game.timer = { running: true, end: Date.now() + +b.dataset.tmin * 60000, left: 0, rang: false };
      unlockAudio(); save(); renderSL();
    }));
    $("#tpause") && $("#tpause").addEventListener("click", () => { game.timer = { running: false, left: timerLeft(game.timer), rang: false }; save(); renderSL(); });
    $("#tstart") && $("#tstart").addEventListener("click", () => { game.timer = { running: true, end: Date.now() + game.timer.left, left: 0, rang: false }; unlockAudio(); save(); renderSL(); });
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
      chip.textContent = (t.running ? "⏱️ " : "⏸️ ") + fmtTime(left);
      chip.classList.toggle("over", left <= 0);
    } else if (chip) chip.remove();
    // Alarm genau einmal pro Ablauf
    if (t && t.running && left <= 0 && left > -10000) {
      const key = String(t.end);
      if (lastRangKey !== key) {
        lastRangKey = key;
        beep();
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
        notice("⏰ Die Zeit ist um!");
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
    const claimSel = name => `<select data-pclaim="${esc(name)}"><option value="">behauptet …</option>${groups.map(([t, l]) =>
      `<optgroup label="${TEAMS[t].plural}">${l.map(r => `<option value="${r.id}" ${notes["c:" + name] === r.id ? "selected" : ""}>${r.ic} ${esc(r.de)}</option>`).join("")}</optgroup>`).join("")}</select>`;
    const counts = { good: 0, unsure: 0, evil: 0 };
    seats.forEach(x => { const t = notes["t:" + x.n]; if (counts[t] !== undefined) counts[t]++; });
    return `<details class="panel notes" ${notesOpen ? "open" : ""}>
      <summary><h3>📝 Meine Notizen</h3>${seats.length ? `<span class="small"> 😇${counts.good} ❓${counts.unsure} 😈${counts.evil}</span>` : ""}</summary>
      <p class="small">Nur auf deinem Handy gespeichert – niemand sonst sieht sie.</p>
      ${seats.length ? `<div class="notelist">${seats.map(x => {
        const t = notes["t:" + x.n], c = ROLE_BY_ID[notes["c:" + x.n]];
        return `<div class="notecard ${x.a ? "" : "dead"} ${t ? "tr-" + t : ""}">
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
    $$("[data-pclaim]").forEach(sel => sel.addEventListener("change", () => { put("c:" + sel.dataset.pclaim, sel.value); rerenderNotes(); }));
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
    let ctx = null, master = null, voices = [], phase = null;
    const CHORDS = { night: [110, 164.81, 220, 261.63], day: [130.81, 196, 261.63, 329.63] };
    const api = { on: false };
    function start() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        master = ctx.createGain(); master.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
        master.connect(lp); lp.connect(ctx.destination);
        master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 3);
        play(phase || currentPhase());
      } catch (e) { api.on = false; }
    }
    function play(ph) {
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      voices.forEach(v => { v.g.gain.linearRampToValueAtTime(0, now + 4); v.o.stop(now + 4.2); v.l.stop(now + 4.2); });
      voices = CHORDS[ph].map((f, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
        o.type = k % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (k - 1.5) * 4;
        g.gain.value = 0; g.gain.linearRampToValueAtTime(0.25 / (k + 1), now + 5);
        l.frequency.value = 0.05 + k * 0.03; lg.gain.value = 0.08 / (k + 1);
        l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(master);
        o.start(); l.start();
        return { o, g, l };
      });
    }
    function stop() {
      if (!ctx || !master) return;
      const now = ctx.currentTime;
      master.gain.linearRampToValueAtTime(0, now + 1.5);
      const vs = voices; voices = [];
      setTimeout(() => vs.forEach(v => { try { v.o.stop(); v.l.stop(); } catch (e) { /* schon aus */ } }), 1700);
      master = null;
    }
    api.toggle = on => { api.on = on; store.set("botc.music", on); on ? start() : stop(); };
    api.setPhase = ph => { if (ph === phase) return; phase = ph; if (api.on && master) play(ph); };
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
    openModal(`<p class="small center">🤖 So sieht das Handy von ${esc(s.name)} aus</p>
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
  function scriptSummary() {
    const sc = game.script || [];
    const c = scriptCounts(sc);
    const max = SETUP_COUNTS[15];
    const warn = [];
    if (!c.demon) warn.push("mindestens 1 Dämon");
    if (c.townsfolk < SETUP_COUNTS[game.count][0] + 2) warn.push(`mehr Dorfbewohner (mind. ${SETUP_COUNTS[game.count][0] + 2} empfohlen)`);
    if (c.minion < SETUP_COUNTS[game.count][2]) warn.push(`mind. ${SETUP_COUNTS[game.count][2]} Schergen`);
    return `<div class="box script">
      <h4>📜 Deine Rollenliste (${sc.length} Rollen)</h4>
      <p class="small">${c.townsfolk} Dorfbewohner · ${c.outsider} Außenseiter · ${c.minion} Schergen · ${c.demon} Dämonen${c.traveller ? ` · ${c.traveller} Reisende` : ""}</p>
      ${warn.length ? `<p class="warnmsg">Für ${game.count} Spieler fehlt noch: ${warn.join(", ")}.</p>` : ""}
      <button class="btn primary" id="editscript">✏️ Rollenliste bearbeiten</button>
    </div>`;
  }
  function requireWarnings() {
    const w = Object.entries(REQUIRES).filter(([a, b]) => game.selected.includes(a) && !game.selected.includes(b))
      .map(([a, b]) => `${roleName(a)} braucht ${roleName(b)}`);
    return w.length ? `<p class="warnmsg">⚠️ ${w.join(" · ")} im Spiel.</p>` : "";
  }
  let scriptFilter = "all";
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
        </div>
        <div class="chips">${["all", "tb", "bmr", "snv", "exp"].map(k => `<button class="chip ${scriptFilter === k ? "on" : ""}" data-sfilter="${k}">${k === "all" ? "Alle zeigen" : EDITIONS[k].name}</button>`).join("")}</div>
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
      $("#savescript").addEventListener("click", () => {
        game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id);
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
    pukka: { n: 1, mark: "poison", text: "Wähle einen Spieler, den du vergiftest (er stirbt in der nächsten Nacht)." },
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
    bonecollector: { n: 1, dead: true, onlyDead: true, optional: true, text: "Willst du einem Toten seine Fähigkeit zurückgeben? (einmal pro Spiel)" }
  };
  const nightOn = () => !!((game.online || game.test) && game.nightActions);
  // Kann dieser Platz Aufgaben am Handy bekommen? (verbundenes Handy oder Test-Bot)
  const isBot = x => !!(x && x.pid && String(x.pid).startsWith("bot-"));
  const reachable = x => !!(x && x.pid && (isBot(x) || lobby[x.pid]));
  // Als welche Rolle handelt dieser Spieler? (Säufer/Marionette glauben an ihre Rolle, Philosoph an die gewählte)
  const actingRole = x => x.role === "philosopher" && x.gained ? x.gained : shownRole(x.role);

  function nightActionsBar(steps) {
    if (!game.online && !game.test) return "";
    if (!game.nightActions) return `<div class="box nabar"><label class="switch"><input type="checkbox" id="natoggle">
      <span><b>📲 Nachtaktionen am Handy</b> – Spieler wählen ihre Ziele auf dem eigenen Handy, statt zu zeigen.</span></label></div>`;
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
      <p class="small"><b>Alle auf einmal:</b> schnell – alle wählen gleichzeitig, du wertest danach in der Reihenfolge der Liste aus.<br>
      <b>Schritt für Schritt:</b> regelgenau – bei jedem Schritt der Nachtreihenfolge sind alle Handys dran; nur wer wirklich dran ist, bekommt die echte Aufgabe.<br>
      <b>Wie am Tisch:</b> alle Handys schlafen ein, du weckst jeden Spieler einzeln mit 👁️ und zeigst ihm seine Info groß auf seinem Handy.</p>`;
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
    if (x.role === "fool" && !x.used) return { dies: false, fool: true, why: "🃏 Narr – sein erster Tod wird verhindert (Fähigkeit danach verbraucht)" };
    if (x.role === "zombuul" && !x.zfake) return { dies: true, zombuul: true, why: "🧟 Zombuul – erster Tod: gilt als tot, lebt aber heimlich weiter" };
    return null;
  }
  // Scharlachrote Frau: Stirbt der Dämon bei 5+ Lebenden (vor dem Tod gezählt, ohne Reisende),
  // wird sie der Dämon – aber nicht, wenn sie vergiftet oder betrunken ist.
  let swMsg = null;
  function swCheck(x) {
    swMsg = null;
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
    if (rule && rule.zombuul) { x.zfake = true; x.alive = false; histDeath(x); hist(`🧟 ${x.name} (Zombuul) wirkt tot, lebt aber weiter`); return; }
    if (!x.alive && x.zfake) { x.zfake = false; hist(`🧟 ${x.name} (Zombuul) stirbt jetzt wirklich`); swCheck(x); return; }
    x.alive = false; histDeath(x);
    swCheck(x);
  }

  function nightKills() {
    const S = game.seats, n = game.nightNo;
    const attacks = new Map(); // Ziel -> Angreifer
    (game.acts || []).filter(a => a.night === n && !a.skip && KILL_STEPS.includes(a.step) && !(a.step === "lleech" && n === 1))
      .forEach(a => (a.picks || []).forEach(k => { if (!attacks.has(k)) attacks.set(k, { step: a.step, by: a.i }); }));
    S.forEach((x, k) => { if ((x.marks || []).includes("target") && !attacks.has(k)) attacks.set(k, { step: null, by: null }); });
    const out = [];
    attacks.forEach((at, k) => {
      const x = S[k];
      if (!x || !x.alive) return;
      const attacker = at.by !== null ? S[at.by] : S.find(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
      const m = x.marks || [];
      const strong = at.step === "assassin";
      let dies = true, why = `angegriffen${at.step ? ` (${roleName(at.step)})` : ""}`;
      if (attacker && impaired(attacker)) { dies = false; why = `${attacker.name} ist vergiftet/betrunken – der Angriff wirkt nicht`; }
      else if (!strong && m.includes("protect")) { dies = false; why = "🛡️ geschützt – überlebt"; }
      else if (!strong && x.role === "soldier" && !impaired(x)) { dies = false; why = "🛡️ Soldat – der Dämon kann ihn nicht töten"; }
      else if (!strong && m.includes("cantdie")) { dies = false; why = "🫖 Teedame – kann nicht sterben"; }
      else if (deathRule(x)) { const r = deathRule(x); dies = r.dies; why = r.why; }
      else if (at.by === k) {
        const sw = S.find(y => y.role === "scarletwoman" && y.alive && !impaired(y));
        why = sw && S.filter(y => y.alive && !y.trav).length >= 5
          ? `Dämon hat sich selbst gewählt – Sternenwechsel: ${sw.name} (Scharlachrote Frau) wird automatisch der neue Dämon`
          : "Dämon hat sich selbst gewählt – Sternenwechsel: mach einen Schergen zum Dämon (🔁 Rolle ändern)";
      }
      else if (x.role === "mayor" && !impaired(x)) why = "Bürgermeister: Du darfst den Tod auf einen anderen Spieler umlenken (dann hier abwählen und den anderen tot setzen)";
      out.push({ k, dies, why, step: at.step || (attacker ? attacker.role : null) });
    });
    return out;
  }
  function dawnDialog() {
    const kills = nightKills();
    if (!kills.length) return startDay();
    openModal(`<h2>☀️ Wer stirbt heute Nacht?</h2>
      <p class="small">So sieht es nach den Regeln aus. Ändere den Haken nur, wenn die App etwas nicht weiß: ein fehlender Marker (z. B. Mönch-Schutz vergessen), eine Rolle wie Narr oder Seemann, die den Tod verhindert, oder wenn du beim Bürgermeister den Tod umlenkst.</p>
      <div class="dawnlist">${kills.map(x => `<label class="switch"><input type="checkbox" data-kill="${x.k}" ${x.dies ? "checked" : ""}>
        <span><b>${esc(game.seats[x.k].name)}</b> <span class="small">(${esc(roleName(game.seats[x.k].role))})</span><br><span class="small">${esc(x.why)}</span></span></label>`).join("")}</div>
      <div class="row end"><button class="btn" id="dawnback">Zurück</button><button class="btn primary" id="dawnok">☀️ Morgen verkünden</button></div>`);
    $("#dawnback").addEventListener("click", closeModal);
    $("#dawnok").addEventListener("click", () => {
      $$("[data-kill]").forEach(c => {
        const x = game.seats[+c.dataset.kill], rule = deathRule(x);
        if (rule && rule.fool) { if (!c.checked) applyDeath(x, rule); else { x.alive = false; histDeath(x); swCheck(x); } return; }
        if (c.checked && x.alive) applyDeath(x, rule && rule.zombuul ? rule : null);
      });
      closeModal(); startDay();
    });
  }

  function startDay() {
    const n = game.nightNo;
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
    save(); renderSL();
    toast(`🤖 ${S[by].name} nominiert ${S[on].name}`);
    setTimeout(botVote, 900);
  }
  // Entscheidung eines Bots: Böse schützen ihr Team, Gute sind unsicher
  function botWantsVote(k, on) {
    const S = game.seats, x = S[k];
    if (k === on) return false;
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
      if (!a.sleep) {
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
    if (!r.skip && def.mark) r.picks.forEach(k => { const t = game.seats[k]; t.marks = [...new Set([...(t.marks || []), def.mark])]; if (def.keep) t.keep = [...new Set([...(t.keep || []), def.mark])]; });
    if (!r.skip && r.role) game.lastPicks = Object.assign(game.lastPicks || {}, { [r.step]: r.role });
    const text = `🌙 ${x.name} (${roleName(r.step)}): ${r.skip ? "nichts" : describePick(r)}`;
    game.log = [...(game.log || []), { t: Date.now(), text }].slice(-20);
    hist(text, "night");
    if (!r.skip && r.role && r.picks.length && ["cerenovus", "pithag"].includes(r.step)) applyRolePick(x, r);
    if (!r.skip && r.step === "philosopher" && r.role && x.role === "philosopher") setPhilo(i, r.role);
    else { save(); refreshHostView(); }
    notice(text);
  }

  // Cerenovus (Wahnsinn) und Grubenhexe (Rollenwechsel) direkt übernehmen – nicht, wenn sie vergiftet/betrunken sind.
  function applyRolePick(x, r) {
    const t = game.seats[r.picks[0]];
    if (!t) return;
    if (impaired(x)) {
      hist(`⚠️ ${x.name} (${roleName(r.step)}) ist vergiftet/betrunken – die Wahl hat keine Wirkung`, "night");
      toast(`${roleName(r.step)} ist vergiftet/betrunken – keine Wirkung (du kannst trotzdem so tun als ob)`);
      return;
    }
    if (r.step === "cerenovus") {
      t.madness = { role: r.role, night: game.nightNo };
      hist(`😵 ${t.name} muss morgen ${roleName(r.role)} behaupten`, "night");
      toast(`😵 ${t.name}: Wahnsinn „${roleName(r.role)}“ gesetzt${reachable(t) ? " – steht auf dem Handy" : " – zeig es ihm (😵-Knopf)"}`);
    } else if (r.step === "pithag") {
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
    const def = q.sleep ? FAKE_ACTION : (ACTIONS[q.step] || { n: 1 });
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
        <h2>${q.sleep ? "Schein-Auswahl" : esc(roleName(q.step))}</h2>
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
    "clockmaker", "dreamer", "mathematician", "flowergirl", "towncrier", "oracle", "seamstress", "juggler", "sage",
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
      case "undertaker": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.exec || day.exec === "none" || !S[day.exec.seat]) return { text: "Heute wurde (laut Abstimmungs-Helfer) niemand hingerichtet – keine Info." };
        return { r: [S[day.exec.seat].role], text: `${S[day.exec.seat].name} war ${roleName(S[day.exec.seat].role)}` };
      }
      default: return null;
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
    s.role === id || ((s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id) || (s.role === "philosopher" && s.gained === id));

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
      box.innerHTML = `💡 <b>Vorschlag (wahre Info):</b> ${esc(sg.text)}${warn ? `<br><span class="warnmsg">⚠️ ${esc(warn)}</span>` : ""}${mis.map(t => `<br><span class="mismsg">${esc(t)}</span>`).join("")}`;
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
  const ACTS_WHEN_DEAD = ["ravenkeeper", "sage", "moonchild", "sweetheart", "barber"];
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
    return `<div class="lex-detail">
      <div class="lex-title t-${r.t}-text"><b>${r.ic} ${esc(r.de)}</b> <span class="small">${esc(r.en)} · ${TEAMS[r.t].name} · ${esc(EDITIONS[r.ed].name)}</span></div>
      <p class="ability-line">${esc(r.a)}</p>
      <p>${esc(r.e)}</p>
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
    if (!lexFilter.ed || (lexFilter.ed === "game" && !sc)) lexFilter.ed = sc ? "game" : "all";
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
      script: game.edition === "custom" && (game.script || []).length ? game.script.map(id => ROLE_BY_ID[id].idx) : null,
      fabled: game.fabled || [],
      timer: game.timer ? { running: !!game.timer.running, end: game.timer.end || 0, left: game.timer.left || 0 } : null,
      started: game.seats.length > 0 && game.step !== "setup",
      seats: game.seats.map(s => ({ n: s.name, a: !!s.alive, g: !!s.ghost, t: !!s.trav })),
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

  function onPlayerMessage(uid, msg) {
    if (!game.online && !game.test) return;
    if (msg.type === "action") return onPlayerAction(uid, msg);
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
      const changed = !old || newInfo || old.r !== info.r || old.a !== info.a || old.m !== info.m || JSON.stringify(old.x) !== JSON.stringify(info.x);
      if (changed) {
        if (info.x && JSON.stringify((old && old.x) || null) !== JSON.stringify(info.x) && old) notice("🤫 Geheime Info deines Teams – schau auf deine Rollenkarte.");
        else if (newInfo && old && !info.wk) notice("🌙 Neue Info vom Spielleiter – schau auf deine Rollenkarte.");
        else if (info.m && (!old || old.m !== info.m)) notice("😵 Du bist verrückt! Schau auf deine Rollenkarte, welche Rolle du am Tag behaupten musst.");
        else if (old && old.online && old.r !== info.r) notice("Der Spielleiter hat deine Rolle geändert – schau sie dir an.");
        refreshPlayerView(true);
      }
    }));
    playerSubs.push(api.listen(`${base}/public`, v => {
      const before = pubState;
      pubState = v;
      store.set("botc.public", v);
      updateNetBar();
      const seatSig = x => JSON.stringify(((x && x.seats) || []).map(s => [s.n, s.a]));
      const a = document.activeElement;
      if (seatSig(before) !== seatSig(v) && $(".notes") && !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) {
        const tmp = document.createElement("div"); tmp.innerHTML = notesHtml(); $(".notes").replaceWith(tmp.firstElementChild); bindNotes();
      }
      if (v && v.winner && !(before && before.winner)) showPublicEnd(v);
      else {
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
