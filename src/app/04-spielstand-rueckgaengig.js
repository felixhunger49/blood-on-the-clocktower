  // =====================================================================
  //  SPIELLEITER
  // =====================================================================
  function newGame() {
    return { step: "setup", edition: "tb", count: 7, names: [], selected: [], seats: [], bluffs: [],
      drunkShown: null, lunaticShown: null, evilInfo: false, assignedKey: "", nightNo: 1, done: {} };
  }
  let game = store.get("botc.game", null) || newGame();
  if (!game.nightNo) { game.nightNo = 1; game.done = {}; delete game.night; } // ältere Spielstände
  // Rückgängig: frühere Spielstände – bleiben auch nach Neustart der App erhalten (die letzten 20 Schritte)
  const UNDO_MAX = 20;
  const undoStack = (() => { try { const u = JSON.parse(localStorage.getItem("botc.undo") || "[]"); return Array.isArray(u) ? u.filter(x => typeof x === "string").slice(-UNDO_MAX) : []; } catch (e) { return []; } })();
  const persistUndo = () => {
    // Bei vollem Speicher ältere Schritte weglassen
    for (let n = undoStack.length; n >= 0; n -= 5) {
      try { localStorage.setItem("botc.undo", JSON.stringify(undoStack.slice(-n))); return; } catch (e) { /* zu groß */ }
    }
  };
  let lastSavedJson = JSON.stringify(game), lastUndoPush = 0;
  const save = () => {
    const cur = JSON.stringify(game);
    if (cur !== lastSavedJson) {
      // alle Speicherungen einer einzelnen Aktion (gleicher Klick) zählen als ein Schritt
      if (!lastUndoPush) { undoStack.push(lastSavedJson); if (undoStack.length > UNDO_MAX) undoStack.shift(); persistUndo(); lastUndoPush = 1; setTimeout(() => { lastUndoPush = 0; }, 0); }
      lastSavedJson = cur;
    }
    store.set("botc.game", game); if (game.online) scheduleSync();
  };
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    persistUndo();
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
    const e = detectEndRaw();
    if (!e) return e;
    const ps = playerSeats(), warn = [...(e.warn || [])];
    let winner = e.winner, reason = e.reason;
    // Ketzer: Wer gewinnt, verliert – und umgekehrt (auch wenn er tot ist)
    const her = ps.find(x => x.role === "heretic");
    if (her && !impaired(her)) { winner = winner === "good" ? "evil" : "good"; reason += " 🔄 Ketzer im Spiel: Sieg und Niederlage sind getauscht!"; }
    else if (her) warn.push("Der Ketzer ist vergiftet/betrunken – Sieg und Niederlage werden nicht getauscht.");
    // Politiker: entscheidet der Spielleiter
    const pol = ps.find(x => x.role === "politician");
    if (pol && !impaired(pol)) warn.push(`${ROLE_BY_ID.politician.ic} Politiker ${pol.name}: War er am meisten schuld, dass sein Team verliert, wechselt er die Seite und gewinnt mit (dann bei der Auflösung erwähnen).`);
    return { ...e, winner, reason, warn };
  }
  function detectEndRaw() {
    const ps = playerSeats();
    if (!ps.length) return null;
    if (game.saintLoss) return { winner: "evil", reason: `${game.saintLossRole && game.saintLossRole !== "Heiliger" ? `${game.saintLossRole}` : "Der Heilige"} ${game.saintLoss} wurde hingerichtet.`, warn: [] };
    if (game.jinxWin) return { winner: game.jinxWin.winner, reason: game.jinxWin.reason, warn: [] };
    if (game.klutzLoss) return { winner: "evil", reason: `Der Tollpatsch ${game.klutzLoss.by} hat ${game.klutzLoss.pick} gewählt – einen bösen Spieler.`, warn: [] };
    const alive = ps.filter(s => s.alive);
    const demons = ps.filter(s => ROLE_BY_ID[s.role].t === "demon");
    const aliveDemons = demons.filter(s => s.alive || s.zfake);
    if (game.mmResult) return { winner: game.mmResult, reason: game.mmResult === "good" ? "Drahtzieher-Tag: Gut hat ihn überstanden." : "Drahtzieher-Tag: Ein Guter wurde hingerichtet – Böse gewinnt.", warn: [] };
    const lev = ps.find(s => s.role === "leviathan" && (s.alive || s.zfake));
    if (lev) {
      const goodExec = Object.values(game.days || {}).filter(d => d.exec && d.exec !== "none" && game.seats[d.exec.seat] && !d.exec.survived && seatGood(game.seats[d.exec.seat])).length;
      if (goodExec > 1) return { winner: "evil", reason: "Leviathan: Mehr als ein guter Spieler wurde hingerichtet.", warn: [] };
      // Jinx Leviathan + Bürgermeister: Beide leben an Tag 5 und es gibt keine Hinrichtung -> Gut gewinnt
      const d5 = (game.days || {})[5];
      if (d5 && d5.exec === "none" && ps.some(s => s.role === "mayor" && s.alive && !impaired(s))) return { winner: "good", reason: "🔗 Jinx Leviathan + Bürgermeister: Beide leben an Tag 5 und niemand wurde hingerichtet.", warn: [] };
      if (game.nightNo >= 6) return { winner: "evil", reason: "Leviathan: Tag 5 ist vorbei.", warn: [] };
    }
    // Böser Zwilling: Solange beide Zwillinge leben, kann Gut nicht gewinnen
    const etw = ps.find(s => s.role === "eviltwin" && s.alive && !impaired(s));
    const gtw = etw && ps.find(s => (s.marks || []).includes("twin") && s.alive);
    if (demons.length && !aliveDemons.length && gtw) return null;
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
    game.selected = randomSetup();
    refreshHidden();
    if (game.selected.length < game.count) toast(`⚠️ Nur ${game.selected.length} von ${game.count} Rollen möglich – die Rollenliste ist für so viele Spieler zu klein.`);
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
    // Die Marionette sitzt immer neben dem Dämon
    const di = game.seats.findIndex(x => ROLE_BY_ID[x.role].t === "demon"), mi = game.seats.findIndex(x => x.role === "marionette");
    const N = game.seats.length;
    if (di >= 0 && mi >= 0 && (mi + 1) % N !== di && (di + 1) % N !== mi) {
      const to = (di + 1) % N; const t = game.seats[to].role; game.seats[to].role = "marionette"; game.seats[mi].role = t;
    }
    game.seats.push(...travellers);
    // Jinx Jungfer + Spion/Witwe: Die Jungfer ist vergiftet
    game.seats.filter(x => x.role === "damsel").forEach(x => {
      if (game.seats.some(y => y.role === "spy" || y.role === "widow")) { x.marks = [...new Set([...(x.marks || []), "poison"])]; x.keep = [...new Set([...(x.keep || []), "poison"])]; }
    });
    // Böser Zwilling: ein zufälliger guter Spieler wird der gute Zwilling (Marker 👯, kannst du verschieben)
    if (game.seats.some(x => x.role === "eviltwin")) {
      const good = game.seats.filter(x => !x.trav && seatGood(x));
      const t = good[randInt(good.length)]; if (t) t.marks = [...new Set([...(t.marks || []), "twin"])];
    }
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
    game.jinxWin = null;
    // Xaan: X = Anzahl der Außenseiter beim Spielstart
    game.xaanX = game.seats.some(x => x.role === "xaan") ? game.seats.filter(x => !x.trav && ROLE_BY_ID[x.role].t === "outsider").length : null;
    game.mez = null;
    nightStartEffects();
    game.seats.filter(x => x.role === "damsel" && (x.marks || []).includes("poison")).forEach(x => hist(`🔗 Jinx: ${x.name} (Jungfer) ist vergiftet, weil ${game.seats.some(y => y.role === "spy") ? "der Spion" : "die Witwe"} im Spiel ist`, "night"));
    game.statsId = null;
  }

  // Rollen, die gerade im Spiel sind (inkl. „glaubt zu sein“ und übernommener Fähigkeiten)
  function rolesInPlay() {
    const set = new Set();
    game.seats.forEach(x => { set.add(x.role); set.add(shownRole(x.role)); if (x.gained) set.add(x.gained); });
    return set;
  }
  const inPlayRole = id => game.seats.some(x => x.role === id);
  // Jinxes, die eine Rolle im aktuellen Spiel betreffen
  function jinxesInPlayFor(id) {
    const ip = rolesInPlay();
    return JINXES.filter(j => (j[0] === id && ip.has(j[1])) || (j[1] === id && ip.has(j[0])));
  }
  function jinxNotesHtml(id) {
    const l = jinxesInPlayFor(id);
    return l.length ? l.map(j => `<p class="jinxnote">🔗 <b>Jinx ${esc(roleName(j[0] === id ? j[1] : j[0]))}:</b> ${esc(j[2])}</p>`).join("") : "";
  }
  function jinxPlayHtml() {
    const ip = rolesInPlay();
    const l = JINXES.filter(j => ip.has(j[0]) && ip.has(j[1]));
    return l.length ? `<details class="box jinxplay"><summary>🔗 ${l.length} Jinx${l.length === 1 ? "" : "es"} in diesem Spiel</summary>
      ${l.map(j => `<p class="small"><b>${esc(roleName(j[0]))} + ${esc(roleName(j[1]))}:</b> ${esc(j[2])}</p>`).join("")}</details>` : "";
  }
  // „Nur 1 der beiden Rollen darf im Spiel sein“
  const ONLY_ONE = JINXES.filter(j => /^Only 1 jinxed/.test(j[3])).map(j => [j[0], j[1]]);
  const onlyOneClash = sel => ONLY_ONE.filter(([a, b]) => sel.includes(a) && sel.includes(b));
  // Petze: Jeder Scherge bekommt 3 Bluffs (wir geben allen dieselben drei, möglichst andere als der Dämon)
  function snitchBluffs() {
    const sn = game.seats.find(x => x.role === "snitch");
    if (!sn || impaired(sn)) return null;
    const inPlay = new Set(game.seats.map(x => x.role));
    const bad = id => inPlay.has(id) || id === "drunk" || id === "lunatic" || id === game.drunkShown || id === game.marionetteShown;
    if (!(game.snitchBluffs || []).length || game.snitchBluffs.some(bad)) {
      const pool = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider") && !bad(r.id));
      const fresh = pool.filter(r => !(game.bluffs || []).includes(r.id));
      game.snitchBluffs = pick(fresh.length >= 3 ? fresh : pool, 3).map(r => r.id);
    }
    return game.snitchBluffs;
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
    if (t === "minion") { const sb = snitchBluffs(); return { d: demon && demon.name, m: minions.filter(s => s !== seat).map(s => s.name), ...(sb ? { b: sb } : {}) }; }
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

