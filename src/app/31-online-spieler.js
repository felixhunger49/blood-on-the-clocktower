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
      ${recapHtml(w.days, (w.reveal || []).map(x => ({ n: x.n, good: x.good })), w.history)}
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

