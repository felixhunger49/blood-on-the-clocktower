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
    if (actingRole(x) === "zealot" && x.alive && !impaired(x) && S.filter(y => y.alive).length >= 5) return true;
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
      if (actingRole(S[k]) !== "butler" || !want[k]) return;
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
      if (ONCE_PER_GAME.includes(stepId) && (gainer(x) && x.gained === stepId ? x.gainedUsed : x.used)) return false;
      if ((stepId === "philosopher" || stepId === "cannibal") && x.gained) return false;
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
        const acts = ACTIONS[r] && role && role[key] && !ACTS_WHEN_DEAD.includes(r) && !(ONCE_PER_GAME.includes(r) && x.used) && !((r === "philosopher" || r === "cannibal") && x.gained);
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
        hist(`🤪 ${x.name} (Wahnsinniger) „greift“ ${r.picks.map(k => game.seats[k].name).join(", ")} an – stirbt nicht, aber der echte Dämon erfährt es`, "night");
        toast(`🤪 Wahnsinniger hat ${r.picks.map(k => game.seats[k].name).join(", ")} gewählt – kein echter Angriff`);
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
      if (gainer(x) && x.gained === r.step) x.gainedUsed = true; else x.used = true;
      x.usedNight = game.nightNo;
    }
    const text = `🌙 ${x.name} (${roleName(r.step)}): ${r.skip ? "nichts" : describePick(r)}`;
    game.log = [...(game.log || []), { t: Date.now(), text }].slice(-20);
    hist(text, "night");
    if (!r.skip && !r.fake && r.role && r.picks.length && (["cerenovus", "pithag"].includes(r.step) || hbHas(r.step, "mad", "change"))) applyRolePick(x, r);
    if (!r.skip && !r.fake && ["sailor", "innkeeper", "courtier"].includes(r.step)) applyDrunkMaker(i, r);
    if (!r.skip && !r.fake && r.step === "snakecharmer" && r.picks.length) snakeCharm(i, r.picks[0]);
    if (!r.skip && !r.fake && r.step === "professor" && r.picks.length) professorRevive(i, r.picks[0]);
    if (!r.skip && !r.fake && r.step === "huntsman" && r.picks.length) huntsmanCheck(i, r.picks[0]);
    if (!r.skip && r.step === "ogre" && x.role === "ogre" && r.picks.length) ogreBond(i, r.picks[0]);
    if (!r.skip && !r.fake && r.step === "shabaloth" && x.role === "shabaloth" && !impaired(x)) r.picks.forEach(k => { const t = game.seats[k]; if (t) t.shabNight = game.nightNo; });
    if (!r.skip && !r.fake && r.step === "fearmonger" && r.picks.length && !impaired(x)) {
      const k = r.picks[0], was = game.seats.findIndex((y, j) => j !== k && (y.marks || []).includes("fear"));
      game.seats.forEach((y, j) => { if (j !== k) y.marks = (y.marks || []).filter(m => m !== "fear"); });
      if (was >= 0 || !game.fearAnnounced) { game.fearAnnounced = true; toast("😨 Der Angstmacher hat einen neuen Spieler gewählt – verkünde das morgen allen (ohne Namen)"); hist("😨 Angstmacher hat einen neuen Spieler gewählt – alle erfahren das", "night"); }
    }
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
    if (g.stayEvil && newAlign === "g") { hist(`🔗 Jinx: ${g.name} (Schläger) bleibt böse – von der Grubenhexe erschaffen`, "night"); setDrunk(i, "Schläger"); return; }
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
      if (k < 0) { hist(`🍷 Höfling wählt ${roleName(r.role)} – die Rolle ist nicht im Spiel, nichts passiert`, "night"); toast(`${roleName(r.role)} ist nicht im Spiel – nichts passiert`); return; }
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
      // Jinx Leviathan: kann nach Tag 5 nicht mehr ins Spiel kommen
      if (r.role === "leviathan" && game.nightNo > 5) { hist(`🔗 Jinx: Der Leviathan kann nach Tag 5 nicht mehr ins Spiel kommen – nichts passiert`, "night"); toast("🔗 Jinx: Leviathan nach Tag 5 nicht möglich – nichts passiert"); return; }
      hist(`🧙 ${t.name}: ${roleName(t.role)} → ${roleName(r.role)} (Grubenhexe)`, "night");
      const wasGood = seatGood(t);
      t.role = r.role;
      // Die Grubenhexe ändert nur die Rolle, nicht die Gesinnung
      delete t.align;
      if (seatGood(t) !== wasGood) t.align = wasGood ? "g" : "e";
      // Jinx: Ein böser Spieler, der zu Schläger/Sektenführer/Oger/Politiker wird, kann durch die eigene Fähigkeit nicht gut werden
      if (!wasGood && ["goon", "cultleader", "ogre", "politician"].includes(r.role)) { t.stayEvil = true; hist(`🔗 Jinx: ${t.name} bleibt böse – die eigene Fähigkeit (${roleName(r.role)}) kann ihn nicht gut machen`, "night"); }
      game.ignoreEnd = null;
      toast(ROLE_BY_ID[r.role].t === "demon" ? `🧙 ${t.name} ist jetzt ${roleName(r.role)} – neuer Dämon: du darfst heute Nacht beliebig viele sterben lassen`
        : `🧙 ${t.name} ist jetzt ${roleName(r.role)}${reachable(t) ? " – sieht es auf dem Handy" : " – zeig es ihm (🔁)"}`);
    }
  }

