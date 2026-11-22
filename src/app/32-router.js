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

