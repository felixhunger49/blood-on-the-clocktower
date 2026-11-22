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
        history: (game.history || []).slice(-120).map(h => ({ n: h.n, ph: h.ph, t: h.t })),
        days: recapDays()
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

