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
  const rolesOf = (ed, team) => ROLES.filter(r => r.ed === ed && r.t === team);
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
      if (x.b && x.b.length) evil += `<p>Deine Bluffs (gute Rollen, die nicht im Spiel sind):</p><ul>${x.b.map(id => `<li><b>${esc(roleName(id))}</b> – ${esc(ROLE_BY_ID[id].a)}</li>`).join("")}</ul>`;
      evil += `</div>`;
    }
    return `
      <div class="rolecard ${teamClass(role, info.a)}">
        <div class="rc-head">
          ${info.n ? `<div class="rc-for">Für: ${esc(info.n)}</div>` : ""}
          <div class="rc-name">${esc(role.de)}</div>
          <div class="rc-en">${esc(role.en)}</div>
          <div class="rc-team">${team.name} · ${good ? "Gut 😇" : "Böse 😈"}</div>
        </div>
        <div class="rc-body">
          <div class="box ability"><h4>Deine Fähigkeit</h4><p>${esc(role.a)}</p></div>
          <div class="box"><h4>So funktioniert's</h4><p>${esc(role.e)}</p></div>
          ${role.tip ? `<div class="box"><h4>💡 Tipp</h4><p>${esc(role.tip)}</p></div>` : ""}
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
    pithag: { title: "Neue Rolle wählen", hint: "Zeige auf einen Spieler und wähle die Rolle, die er werden soll.", pool: "all" }
  };

  function pickerHtml(mine) {
    const cfg = PICKERS[mine.r];
    if (!cfg) return "";
    const ed = ROLE_BY_ID[mine.r].ed;
    const pool = ROLES.filter(r => r.ed === ed && r.t !== "traveller" && r.id !== mine.r && (cfg.pool === "all" || r.t === "townsfolk" || r.t === "outsider"));
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
          <div class="ns-bluff t-${r.t}"><b>${esc(r.de)}</b><small>${esc(r.a)}</small></div>
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
    if (!mine && on) {
      view.innerHTML = netbarHtml() + `
        <section class="panel center">
          <div class="cover-icon">⏳</div>
          <h2>Du bist im Spiel!</h2>
          <p>Raum <b>${esc(on.code)}</b> als <b>${esc(on.name)}</b>.</p>
          <p class="small">Warte, bis der Spielleiter die Rollen verteilt – deine Rolle erscheint dann automatisch hier.</p>
          <button class="btn danger" id="leaveroom">Raum verlassen</button>
        </section>`;
      $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
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
          <div class="cover-icon">🕰️</div>
          <div class="cover-title">${mine.n ? esc(mine.n) + ", deine" : "Deine"} Rolle ist verdeckt</div>
          <div class="cover-sub">Achte darauf, dass niemand mitschaut.<br>Dann tippe hier, um sie anzuzeigen.</div>
        </div>
        <div id="card" class="hidden">${cardHtml(mine)}
          ${pickerHtml(mine)}
          <div class="row center"><button id="hide" class="btn">🙈 Wieder verdecken</button></div>
        </div>
      </section>
      <section class="panel muted">
        <div class="row center wrap">
          <a class="btn" href="#/rollen">📖 Alle Rollen ansehen</a>
          ${on ? `<button id="leaveroom" class="btn danger">Raum verlassen</button>` : `<button id="forget" class="btn danger">Andere Rolle laden</button>`}
        </div>
      </section>`;
    const show = () => { $("#cover").classList.add("hidden"); $("#card").classList.remove("hidden"); };
    $("#cover").addEventListener("click", show);
    $("#cover").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") show(); });
    bindPicker(mine);
    $("#hide").addEventListener("click", () => { $("#card").classList.add("hidden"); $("#cover").classList.remove("hidden"); window.scrollTo(0, 0); });
    $("#forget") && $("#forget").addEventListener("click", () => {
      if (confirm("Deine gespeicherte Rolle wirklich entfernen?")) { store.del("botc.myrole"); renderPlayer(); }
    });
    $("#leaveroom") && $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
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
    const aliveDemons = demons.filter(s => s.alive);
    if (demons.length && !aliveDemons.length) {
      const warn = [];
      if (ps.some(s => s.role === "scarletwoman" && s.alive) && alive.length + 1 >= 5)
        warn.push("Die Scharlachrote Frau lebt – sie wird zum Dämon, wenn beim Tod des Dämons noch 5+ Spieler lebten. Dann ändere ihre Rolle (🔁) statt den Sieg zu verkünden.");
      if (ps.some(s => s.role === "mastermind" && s.alive))
        warn.push("Der Drahtzieher lebt – wurde der Dämon hingerichtet, wird noch ein Tag gespielt.");
      if (demons.some(s => s.role === "zombuul"))
        warn.push("Der Zombuul überlebt seinen ersten Tod (er wirkt nur tot).");
      if (demons.some(s => s.role === "imp") && ps.some(s => s.alive && ROLE_BY_ID[s.role].t === "minion"))
        warn.push("Hat sich der Imp selbst getötet, wird ein Scherge zum Imp – dann dessen Rolle ändern (🔁).");
      return { winner: "good", reason: "Der Dämon ist tot.", warn };
    }
    if (aliveDemons.length && alive.length <= 2)
      return { winner: "evil", reason: "Nur noch 2 Spieler leben – der Dämon hat überlebt.", warn: [] };
    return null;
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
    const demon = pick(rolesOf(ed, "demon"), 1);
    const minions = pick(rolesOf(ed, "minion"), base[2]);
    let outs = base[1];
    [...demon, ...minions].forEach(r => { const m = OUTSIDER_MODS[r.id]; if (m) outs += m[randInt(m.length)]; });
    const outsiderPool = rolesOf(ed, "outsider");
    outs = Math.max(0, Math.min(outs, outsiderPool.length));
    const tf = game.count - outs - base[2] - base[3];
    const sel = [...demon, ...minions, ...pick(outsiderPool, outs), ...pick(rolesOf(ed, "townsfolk"), tf)];
    game.selected = sel.map(r => r.id);
    refreshHidden();
  }

  // Säufer / Wahnsinniger: welche Rolle sie angezeigt bekommen. Außerdem Bluffs.
  function refreshHidden() {
    const ed = game.edition;
    const inPlay = new Set(game.selected);
    if (inPlay.has("drunk")) {
      const free = rolesOf(ed, "townsfolk").filter(r => !inPlay.has(r.id)).map(r => r.id);
      if (!game.drunkShown || inPlay.has(game.drunkShown) || !free.includes(game.drunkShown)) game.drunkShown = pick(free, 1)[0] || null;
    } else game.drunkShown = null;
    if (inPlay.has("lunatic")) {
      const demons = rolesOf(ed, "demon").map(r => r.id);
      if (!game.lunaticShown || !demons.includes(game.lunaticShown)) game.lunaticShown = game.selected.find(id => ROLE_BY_ID[id].t === "demon") || demons[0];
    } else game.lunaticShown = null;
    // Säufer und Wahnsinniger sind keine sinnvollen Bluffs: Niemand kann behaupten, sie zu sein.
    const blocked = id => inPlay.has(id) || id === game.drunkShown || id === "drunk" || id === "lunatic";
    if (game.bluffs.length !== 3 || game.bluffs.some(blocked)) {
      const pool = ROLES.filter(r => r.ed === ed && (r.t === "townsfolk" || r.t === "outsider") && !blocked(r.id)).map(r => r.id);
      game.bluffs = pick(pool, 3);
    }
  }

  function shownRole(roleId) {
    if (roleId === "drunk" && game.drunkShown) return game.drunkShown;
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
  }

  function evilInfoFor(seat) {
    if (!game.evilInfo || playerSeats().length < 7 || seat.trav) return undefined;
    const ps = playerSeats();
    const t = ROLE_BY_ID[seat.role].t;
    const demon = ps.find(s => ROLE_BY_ID[s.role].t === "demon");
    const minions = ps.filter(s => ROLE_BY_ID[s.role].t === "minion");
    const lunatic = ps.find(s => s.role === "lunatic");
    if (t === "minion") return { d: demon && demon.name, m: minions.filter(s => s !== seat).map(s => s.name) };
    if (t === "demon") return { m: minions.map(s => s.name), b: game.bluffs, l: lunatic && lunatic.name };
    if (seat.role === "lunatic") {
      // Der Wahnsinnige bekommt plausible, aber falsche Schergen.
      const fake = pick(ps.filter(s => s !== seat), minions.length).map(s => s.name);
      if (!seat.fake || seat.fake.length !== fake.length) { seat.fake = fake; save(); }
      return { m: seat.fake, b: game.bluffs };
    }
    return undefined;
  }

  function seatInfo(seat, i) {
    const shown = shownRole(seat.role);
    const info = { r: shown, n: seat.name, s: i };
    if (seat.trav) info.a = seat.align;
    const x = evilInfoFor(seat);
    if (x) info.x = x;
    return info;
  }
  function seatCode(seat, i) {
    const align = seat.trav ? (seat.align === "e" ? 2 : 1) : 0;
    return makeCode(ROLE_BY_ID[shownRole(seat.role)].idx, align, i, seat.salt);
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
        <div class="chips">${Object.entries(EDITIONS).map(([k, e]) =>
          `<button class="chip ${game.edition === k ? "on" : ""}" data-ed="${k}">${e.name}</button>`).join("")}</div>
        <p class="small">${esc(EDITIONS[game.edition].desc)}</p>
        <h3>Anzahl Spieler (ohne Spielleiter)</h3>
        <div class="counter">
          <button class="btn round" id="minus">−</button>
          <span class="count">${game.count}</span>
          <button class="btn round" id="plus">+</button>
        </div>
        <p class="small center">${setupLine(game.count)}</p>
        <h3>Namen in Sitzreihenfolge (im Uhrzeigersinn)</h3>
        <div class="names">${nm.join("")}</div>
        <div class="row wrap">
          <button class="btn" id="appqr2">📲 App-QR für Mitspieler</button>
        </div>
        <div class="row end"><button class="btn primary" id="next1">Weiter: Rollen wählen →</button></div>
      </section>
      ${onlineHostPanel()}
      <section class="panel muted">
        <div class="row wrap">
          <button class="btn danger" id="reset">🗑️ Komplett neues Spiel</button>
        </div>
      </section>`;
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
          <b>${esc(r.de)}</b><small>${esc(r.a)}</small>${r.setup ? `<em>${esc(r.setup)}</em>` : ""}</button>`).join("")}</div>`;
    };
    const total = game.selected.length;
    let extra = "";
    if (game.selected.includes("drunk")) {
      const free = rolesOf(game.edition, "townsfolk").filter(r => !game.selected.includes(r.id));
      extra += `<label class="field">Der <b>Säufer</b> glaubt, er sei:
        <select id="drunkShown">${free.map(r => `<option value="${r.id}" ${r.id === game.drunkShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>`;
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
        <div class="row wrap"><button class="btn primary" id="auto">🎲 Zufällig auswählen</button><button class="btn" id="clear">Auswahl leeren</button></div>
        ${warn}
        ${extra}
        ${["townsfolk", "outsider", "minion", "demon"].map(teamBlock).join("")}
        <div class="row end"><button class="btn primary" id="next2" ${total === game.count ? "" : "disabled"}>Weiter: Verteilen →</button></div>
      </section>`;
  }

  function roleChip(id, extra = "") {
    const r = ROLE_BY_ID[id];
    return `<span class="rchip t-${r.t}">${esc(r.de)}${extra}</span>`;
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
        <div class="seat-bot"><code class="code">${seatCode(s, i)}</code>
          <button class="btn sm" data-qr="${i}">📱 QR / Link</button>
          ${s.trav ? `<button class="btn sm danger" data-deltrav="${i}">✕</button>` : ""}</div>
      </div>`;
    }).join("");
    const travOpts = ROLES.filter(r => r.t === "traveller").map(r => `<option value="${r.id}">${esc(r.de)} (${esc(EDITIONS[r.ed].name)})</option>`).join("");
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
        </div>
        <div class="g-ctl">
          <button class="btn sm" data-alive="${i}">${s.alive ? "❤️ lebt" : "💀 tot"}</button>
          ${s.alive ? "" : `<button class="btn sm" data-ghost="${i}">${s.ghost ? "👻 Stimme frei" : "🚫 Stimme verbraucht"}</button>`}
          <button class="btn sm" data-info="${s.role}">ℹ️</button>
          <button class="btn sm" data-change="${i}" title="Rolle oder Gesinnung ändern">🔁</button>
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
      const holders = ps.filter(s => s.role === id);
      const drunks = ps.filter(s => s.role === "drunk" && shownRole("drunk") === id);
      const philos = ps.filter(s => s.role === "philosopher" && s.gained === id);
      if (!holders.length && !drunks.length && !philos.length) return;
      const who = [...holders.map(s => esc(s.name) + (s.alive ? "" : " †") + (philos.length ? " (betrunken durch Philosoph)" : "")),
        ...drunks.map(s => esc(s.name) + (s.alive ? "" : " †") + " (Säufer – Info darf falsch sein)"),
        ...philos.map(s => esc(s.name) + (s.alive ? "" : " †") + " (Philosoph)")].join(", ");
      // Tote Spieler haben keine Fähigkeit mehr – außer Rollen, die gerade durch ihren Tod ausgelöst werden.
      const all = [...holders, ...drunks, ...philos];
      const allDead = !ACTS_WHEN_DEAD.includes(id) && all.every(s => !s.alive);
      const allUsed = ONCE_PER_GAME.includes(id) && all.every(s => (s.role === "philosopher" && id !== "philosopher" ? s.gainedUsed : s.used) || !s.alive);
      // Der Jongleur erfährt sein Ergebnis nur in der Nacht nach dem ersten Tag.
      const over = id === "juggler" && game.nightNo > 2;
      const inactive = allDead || allUsed || over;
      const why = allDead ? "Tot – keine Fähigkeit mehr, nicht wecken." : over ? "Nur in der zweiten Nacht – entfällt." : "Fähigkeit schon benutzt – nicht mehr wecken.";
      steps.push({ id, name: role.de, text: role[key], who, t: role.t, inactive, why, mark: allDead ? "💀" : "✔", once: ONCE_PER_GAME.includes(id) });
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
        <div class="gseats">${seats}</div>
        <div class="box"><h4>Bluffs</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p></div>
      </section>
      <section class="panel">
        <h2>${first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`}</h2>
        <p class="small">${steps.filter(st => !st.inactive && done.includes(st.id)).length} von ${steps.filter(st => !st.inactive).length} Schritten erledigt${steps.some(st => st.inactive) ? " · grau = tot oder benutzt, entfällt" : ""}</p>
        <ol class="nightlist">${steps.map(s => `
          <li class="${s.inactive ? "inactive" : done.includes(s.id) ? "done" : ""} ${s.t ? "t-" + s.t + "-border" : ""}" data-step-id="${s.id}">
            <div class="ns-head">${s.inactive ? `<span class="dead-mark">${s.mark}</span>` : `<input type="checkbox" ${done.includes(s.id) ? "checked" : ""}>`}<b>${esc(s.name)}</b>${s.who ? `<span class="who">${s.who}</span>` : ""}</div>
            <p>${s.inactive ? s.why : esc(s.text)}</p>
            ${s.id === "philosopher" && !s.inactive ? game.seats.map((x, i) => x.role === "philosopher" && x.alive && !x.used ? philoSelect(i) : "").join("") : ""}
            ${s.once && !s.inactive && s.id !== "philosopher" ? `<button class="btn sm useonce" data-useonce="${s.id}">✔ Fähigkeit wurde benutzt</button>` : ""}
            ${s.show ? `<button class="btn sm primary showevil" data-show="${s.id}">📱 ${s.id === "demoninfo" ? "Dem Dämon zeigen" : "Den Schergen zeigen"}</button>` : ""}
          </li>`).join("")}</ol>
        <div class="row wrap">
          <button class="btn primary" id="nextnight">☀️ Tag ${game.nightNo} vorbei → Nacht ${game.nightNo + 1} beginnen</button>
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
      save(); renderSL();
    }));
    const setCount = n => {
      game.count = Math.max(5, Math.min(15, n));
      if (game.selected.length && game.selected.length !== game.count) game.selected = [];
      save(); renderSL();
    };
    $("#appqr2") && $("#appqr2").addEventListener("click", showAppQR);
    $("#minus") && $("#minus").addEventListener("click", () => setCount(game.count - 1));
    $("#plus") && $("#plus").addEventListener("click", () => setCount(game.count + 1));
    bindOnlineHost();
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
    $$(".tile").forEach(t => t.addEventListener("click", () => {
      const id = t.dataset.role;
      game.selected = game.selected.includes(id) ? game.selected.filter(x => x !== id) : [...game.selected, id];
      refreshHidden(); save(); renderSL();
    }));
    $("#drunkShown") && $("#drunkShown").addEventListener("change", e => { game.drunkShown = e.target.value; game.bluffs = game.bluffs.filter(b => b !== game.drunkShown); refreshHidden(); save(); });
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
    $$("[data-alive]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.alive]; s.alive = !s.alive; if (s.alive) s.ghost = true; save(); renderSL(); }));
    $$("[data-ghost]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.ghost]; s.ghost = !s.ghost; save(); renderSL(); }));
    $$("[data-note]").forEach(inp => inp.addEventListener("input", () => { game.seats[+inp.dataset.note].note = inp.value; save(); }));
    $$("[data-info]").forEach(b => b.addEventListener("click", () => openModal(roleDetail(ROLE_BY_ID[b.dataset.info], true))));
    $$(".showevil").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); showEvilInfo(b.dataset.show); }));
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
    $("#nextnight") && $("#nextnight").addEventListener("click", () => {
      game.vote = null;
      game.nightNo++;
      game.done[game.nightNo] = [];
      save(); renderSL();
      const nl = $(".nightlist");
      if (nl) nl.closest(".panel").scrollIntoView({ behavior: "smooth" });
      toast(`Nacht ${game.nightNo} beginnt`);
    });
    $("#prevnight") && $("#prevnight").addEventListener("click", () => { game.nightNo--; save(); renderSL(); });
    bindDay();
    $$("[data-change]").forEach(b => b.addEventListener("click", () => changeRole(+b.dataset.change)));
    $$("[data-win]").forEach(b => b.addEventListener("click", () => {
      const team = b.dataset.win;
      const reason = b.dataset.reason || ($("#winreason") && $("#winreason").value.trim()) ||
        (team === "good" ? "Die guten Spieler haben das Dorf gerettet." : "Das Böse hat das Dorf übernommen.");
      game.winner = { team, reason };
      save(); renderSL(); showEnd();
    }));
    $("#ignoreend") && $("#ignoreend").addEventListener("click", () => { game.ignoreEnd = aliveKey(); save(); renderSL(); });
    $("#showend") && $("#showend").addEventListener("click", showEnd);
    $("#undoend") && $("#undoend").addEventListener("click", () => { game.winner = null; game.ignoreEnd = aliveKey(); save(); renderSL(); });
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
      const count = order.filter(i => v.hands.includes(i)).length;
      body += `<div class="vote">
        <p><b>${esc(ps[v.by].name)}</b> nominiert <b>${esc(ps[v.on].name)}</b></p>
        <p class="small">Gehe im Uhrzeigersinn herum und tippe alle an, die die Hand heben. Tote haben nur ihre eine Geisterstimme.</p>
        <div class="votelist">${order.map(i => {
          const s = ps[i];
          const canVote = s.alive || s.ghost;
          const up = v.hands.includes(i);
          return `<button class="voter ${up ? "up" : ""}" data-hand="${i}" ${canVote ? "" : "disabled"}>
            <span>${up ? "✋" : "·"}</span><b>${esc(s.name)}</b>${s.alive ? "" : `<small>${s.ghost ? "👻 Geisterstimme" : "keine Stimme mehr"}</small>`}${s.role === "butler" ? `<small>Butler – nur wenn sein Meister stimmt</small>` : ""}</button>`;
        }).join("")}</div>
        <div class="votecount ${count >= votesNeeded() ? "ok" : ""}">${count} Stimmen · nötig ${votesNeeded()}${b && !b.tie ? ` · auf dem Block mit ${b.count}` : ""}</div>
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
    $("#cancelvote") && $("#cancelvote").addEventListener("click", () => { game.vote = null; save(); renderSL(); });
    $("#savevote") && $("#savevote").addEventListener("click", () => {
      const v = game.vote;
      // Tote, die abgestimmt haben, verbrauchen ihre Geisterstimme.
      v.hands.forEach(i => { const s = game.seats[i]; if (!s.alive) s.ghost = false; });
      day.noms.push({ by: v.by, on: v.on, count: v.hands.length, needed: votesNeeded(), hands: v.hands });
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
      if (["fool", "pacifist", "tealady", "devilsadvocate", "sailor", "zombuul"].some(id => game.seats.some(x => x.role === id)))
        msg += "\n\nHinweis: Eine Rolle im Spiel kann die Hinrichtung verhindern (z. B. Narr, Pazifist, Teedame, Advocatus Diaboli, Seemann). Prüfe das, bevor du bestätigst.";
      if (!confirm(msg)) return;
      s.alive = false;
      day.exec = { seat: b.on, name: s.name };
      save(); renderSL();
      if (s.role === "saint") toast("Der Heilige wurde hingerichtet – Böse gewinnt!");
      else toast(`${s.name} wurde hingerichtet (${role.de})`);
    });
    $("#noexec") && $("#noexec").addEventListener("click", () => {
      day.exec = "none";
      save(); renderSL();
      if (game.seats.some(s => s.role === "vortox" && s.alive)) toast("Achtung: Vortox im Spiel – ohne Hinrichtung gewinnt Böse!");
    });
    $("#undoexec") && $("#undoexec").addEventListener("click", () => {
      if (day.exec && day.exec !== "none" && game.seats[day.exec.seat]) game.seats[day.exec.seat].alive = true;
      day.exec = null;
      save(); renderSL();
    });
  }

  // Rolle oder Gesinnung eines Spielers während des Spiels ändern (Imp-Wechsel, Scharlachrote Frau, Grubenhexe …).
  function changeRole(i) {
    const s = game.seats[i];
    const pool = ROLES.filter(r => s.trav ? r.t === "traveller" : (r.ed === game.edition && r.t !== "traveller"));
    openModal(`<h2>${esc(s.name)}</h2>
      <label class="field">Neue Rolle:
        <select id="newrole">${pool.map(r => `<option value="${r.id}" ${r.id === s.role ? "selected" : ""}>${esc(r.de)} (${TEAMS[r.t].name})</option>`).join("")}</select></label>
      <label class="field">Gesinnung:
        <select id="newalign">
          <option value="" ${s.align ? "" : "selected"}>Automatisch (nach Rolle)</option>
          <option value="g" ${s.align === "g" ? "selected" : ""}>Gut</option>
          <option value="e" ${s.align === "e" ? "selected" : ""}>Böse</option>
        </select></label>
      <p class="small">Danach bekommt der Spieler einen neuen Code/QR-Code unter „3 · Verteilen“, falls er seine neue Rolle nachlesen soll.</p>
      <div class="row end"><button class="btn primary" id="saverole">Speichern</button></div>`);
    $("#saverole").addEventListener("click", () => {
      s.role = $("#newrole").value;
      s.align = $("#newalign").value || (s.trav ? "g" : undefined);
      game.ignoreEnd = null;
      save(); closeModal(); renderSL();
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
      <div class="row wrap center">
        <button class="btn primary" id="again">🔄 Neue Runde, gleiche Spieler</button>
        <button class="btn" id="endclose">Zurück zum Grimoire</button>
      </div>`, "full");
    $("#endclose").addEventListener("click", closeModal);
    $("#again").addEventListener("click", () => {
      game.names = playerSeats().map(s => s.name);
      Object.assign(game, { selected: [], seats: [], bluffs: [], drunkShown: null, lunaticShown: null,
        assignedKey: "", nightNo: 1, done: {}, days: {}, vote: null, winner: null, ignoreEnd: null, step: "roles" });
      save(); closeModal(); renderSL();
    });
  }

  // Rollen, deren Nacht-Schritt gerade durch den Tod ausgelöst wird.
  const ACTS_WHEN_DEAD = ["ravenkeeper", "sage", "moonchild", "sweetheart", "barber"];
  // Fähigkeiten, die nur einmal pro Spiel wirken.
  const ONCE_PER_GAME = ["courtier", "professor", "seamstress", "philosopher", "assassin", "bonecollector",
    "slayer", "artist", "virgin", "fool", "judge"];

  // Philosoph: Der Spielleiter wählt aus, welche gute Rolle er sich genommen hat.
  function philoSelect(i) {
    const s = game.seats[i];
    const opts = ROLES.filter(r => r.ed === game.edition && (r.t === "townsfolk" || r.t === "outsider") && r.id !== "philosopher");
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
        <div class="ns-bluffs">${game.bluffs.map(id => { const r = ROLE_BY_ID[id]; return `<div class="ns-bluff t-${r.t}"><b>${esc(r.de)}</b><small>${esc(r.a)}</small></div>`; }).join("")}</div>
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
  let lexFilter = { ed: "all", team: "all", q: "" };

  function roleDetail(r, forST) {
    return `<div class="lex-detail">
      <div class="lex-title t-${r.t}-text"><b>${esc(r.de)}</b> <span class="small">${esc(r.en)} · ${TEAMS[r.t].name} · ${esc(EDITIONS[r.ed].name)}</span></div>
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
    view.innerHTML = `
      <section class="panel">
        <h2>Alle Rollen</h2>
        <input id="lexq" class="search" placeholder="🔍 Rolle suchen …" value="${esc(lexFilter.q)}">
        <div class="chips">
          <button class="chip ${lexFilter.ed === "all" ? "on" : ""}" data-led="all">Alle</button>
          ${Object.entries(EDITIONS).map(([k, e]) => `<button class="chip ${lexFilter.ed === k ? "on" : ""}" data-led="${k}">${e.name}</button>`).join("")}
        </div>
        <div class="chips">
          <button class="chip ${lexFilter.team === "all" ? "on" : ""}" data-lteam="all">Alle Typen</button>
          ${Object.entries(TEAMS).map(([k, t]) => `<button class="chip t-${k}-chip ${lexFilter.team === k ? "on" : ""}" data-lteam="${k}">${t.plural}</button>`).join("")}
        </div>
      </section>
      <div id="lexlist"></div>`;
    const draw = () => {
      const q = lexFilter.q.toLowerCase();
      const list = ROLES.filter(r => (lexFilter.ed === "all" || r.ed === lexFilter.ed)
        && (lexFilter.team === "all" || r.t === lexFilter.team)
        && (!q || (r.de + " " + r.en + " " + r.a).toLowerCase().includes(q)));
      let html = "";
      Object.keys(EDITIONS).forEach(ed => {
        const part = list.filter(r => r.ed === ed);
        if (!part.length) return;
        html += `<section class="panel"><h2>${esc(EDITIONS[ed].name)} <span class="small">(${esc(EDITIONS[ed].de)})</span></h2>`;
        Object.keys(TEAMS).forEach(team => {
          const tp = part.filter(r => r.t === team);
          if (!tp.length) return;
          html += `<h3 class="team-h t-${team}-text">${TEAMS[team].plural}</h3>`;
          html += tp.map(r => `<details class="lex t-${team}-border"><summary><b>${esc(r.de)}</b> <span class="small">${esc(r.en)}</span><span class="lex-a">${esc(r.a)}</span></summary>${roleDetail(r, false)}</details>`).join("");
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
        Object.entries(SETUP_COUNTS).map(([n, c]) => `<tr><td>${n}</td>${c.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
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
      if (order.length < 5) { toast("Es braucht mindestens 5 Spieler."); return; }
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
    const tab = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (tab !== "sl" || !modal.classList.contains("hidden")) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "SELECT")) return;
    if (game.step === "setup" || game.step === "assign") renderSL();
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
      started: game.seats.length > 0 && game.step !== "setup",
      seats: game.seats.map(s => ({ n: s.name, a: !!s.alive, g: !!s.ghost, t: !!s.trav })),
      winner: w ? {
        team: w.team, reason: w.reason, nights: game.nightNo,
        reveal: game.seats.map(s => ({ n: s.name, r: s.role, s: shownRole(s.role), good: seatGood(s), a: !!s.alive })),
        bluffs: game.bluffs
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
    if (msg.type !== "pick" || !ROLE_BY_ID[msg.pick]) return;
    const i = game.seats.findIndex(s => s.pid === uid);
    const name = i >= 0 ? game.seats[i].name : (lobby[uid] && lobby[uid].name) || "?";
    const text = `${name} (${roleName(msg.role)}) wählt: ${roleName(msg.pick)}`;
    game.log = [...(game.log || []), { t: Date.now(), text }].slice(-20);
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
  let pendingJoin = "";

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
      const changed = !old || old.r !== info.r || old.a !== info.a || JSON.stringify(old.x) !== JSON.stringify(info.x);
      if (changed) {
        if (old && old.online) notice("Der Spielleiter hat deine Rolle geändert – schau sie dir an.");
        refreshPlayerView(true);
      }
    }));
    playerSubs.push(api.listen(`${base}/public`, v => {
      const before = pubState;
      pubState = v;
      store.set("botc.public", v);
      updateNetBar();
      if (v && v.winner && !(before && before.winner)) showPublicEnd(v);
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
      <div class="nb-top">${netDot()}<b>Raum ${esc(on.code)}</b><span>· ${esc(on.name)}</span>${p && p.started ? `<span>· 🌙 Nacht ${p.nightNo}</span>` : ""}</div>
      ${seats.length ? `<details class="nb-players" ${netbarOpen ? "open" : ""}><summary>Mitspieler (${seats.filter(s => s.a).length} von ${seats.length} leben)</summary>
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

  // Für Tests im Browser
  window.__botc = { makeCode, readCode, encodeLink, decodeLink };
})();
