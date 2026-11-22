  // Jinxes bei Hinrichtungen (Leviathan/Riot)
  function jinxExecCheck(nom, s) {
    if (!s) return;
    const bigDemon = game.seats.some(y => ["leviathan", "riot"].includes(y.role) && (y.alive || y.zfake));
    // Leviathan/Riot nominiert und lässt einen geschützten Spieler hinrichten -> Gut gewinnt
    if (nom && ["leviathan", "riot"].includes(nom.role)) {
      const m = s.marks || [];
      const why = s.role === "soldier" && !impaired(s) ? "den Soldaten" : m.includes("protect") ? "einen vom Mönch/Gastwirt geschützten Spieler" : m.includes("chosen") ? "den vom Exorzisten gewählten Spieler" : null;
      if (why) { game.jinxWin = { winner: "good", reason: `🔗 Jinx: ${roleName(nom.role)} hat ${why} nominiert und hinrichten lassen.` }; game.ignoreEnd = null; game.endPopped = null; hist(`🔗 ${game.jinxWin.reason} Gut gewinnt.`, "day"); }
    }
    // Großmutter: Stirbt das Enkelkind durch Hinrichtung, während Leviathan/Riot im Spiel ist -> Böse gewinnt
    if (bigDemon && !s.alive && (s.marks || []).includes("grandchild")) {
      game.jinxWin = { winner: "evil", reason: `🔗 Jinx: Das Enkelkind ${s.name} ist durch Hinrichtung gestorben, während ${inPlayRole("leviathan") ? "der Leviathan" : "Riot"} im Spiel ist.` };
      game.ignoreEnd = null; game.endPopped = null; hist(`🔗 ${game.jinxWin.reason} Böse gewinnt.`, "day");
    }
  }
  function execRoleEffects(nom, s) {
    // Spielmann: Stirbt ein Scherge durch Hinrichtung, sind alle anderen bis morgen Abend betrunken
    const mi = game.seats.find(y => y.role === "minstrel" && y.alive && !impaired(y));
    if (mi && !s.alive && ROLE_BY_ID[s.role].t === "minion") {
      game.seats.forEach((y, k) => { if (y.trav || y === mi || (y.marks || []).includes("drunk")) return; setDrunk(k, "Spielmann"); y.keep = [...new Set([...(y.keep || []), "drunk"])]; y.drunkUntil = game.nightNo + 2; });
      hist(`🎵 Ein Scherge wurde hingerichtet – ${mi.name} (Spielmann): Alle anderen sind bis morgen Abend betrunken`, "day");
    }
    // Angstmacher: Nominiert er den gefürchteten Spieler und der wird hingerichtet, verliert dessen Team
    if (nom && nom.role === "fearmonger" && nom.alive && !impaired(nom) && (s.marks || []).includes("fear")) {
      game.jinxWin = { winner: seatGood(s) ? "evil" : "good", reason: `😨 Der Angstmacher hat den gefürchteten Spieler ${s.name} nominiert und hinrichten lassen – ${seatGood(s) ? "Gut" : "Böse"} verliert.` };
      game.ignoreEnd = null; game.endPopped = null; hist(game.jinxWin.reason, "day");
    }
    // Boomdandy
    if (s.role === "boomdandy" && !s.alive && !impaired(s)) whenFree(boomdandyModal);
    // Böser Zwilling: Wird der gute Zwilling hingerichtet, gewinnt Böse
    if ((s.marks || []).includes("twin") && game.seats.some(y => y.role === "eviltwin" && y.alive && !impaired(y))) {
      game.jinxWin = { winner: "evil", reason: `👯 Der gute Zwilling ${s.name} wurde hingerichtet – Böse gewinnt.` };
      game.ignoreEnd = null; game.endPopped = null; hist(game.jinxWin.reason, "day");
    }
  }
  function canniEat(x) {
    if (!x || x.alive) return;
    game.seats.filter(c => c.role === "cannibal" && c.alive && c !== x).forEach(c => {
      const good = seatGood(x);
      if (good) {
        if (c.canniPoison) {
          c.marks = (c.marks || []).filter(m => m !== "poison"); c.keep = (c.keep || []).filter(m => m !== "poison");
          markHist(c, "poison", false); c.canniPoison = false;
        }
        c.gained = x.role; c.gainedUsed = false; c.canniFake = false;
        hist(`🍖 ${c.name} (Kannibale) hat jetzt die Fähigkeit von ${x.name}: ${roleName(x.role)}`, "day");
        // Jinx Butler / Zelot: Der Kannibale erfährt, dass er diese Fähigkeit hat
        if (["butler", "zealot"].includes(x.role)) {
          const rule = x.role === "butler" ? "Wähle jede Nacht einen Spieler (nicht dich) als Meister. Morgen darfst du nur abstimmen, wenn dein Meister auch abstimmt."
            : "Solange 5 oder mehr Spieler leben, musst du für jede Nominierung stimmen.";
          c.infos = [...(c.infos || []), { n: game.nightNo, t: `🍖 Du hast jetzt die Fähigkeit des ${roleName(x.role)}s: ${rule}` }].slice(-10);
          hist(`🔗 Jinx: ${c.name} (Kannibale) erfährt, dass er die Fähigkeit des ${roleName(x.role)}s hat`, "day");
          setTimeout(() => toast(game.online || game.test ? `🔗 Jinx: ${c.name} sieht auf dem Handy, dass er die ${roleName(x.role)}-Fähigkeit hat` : `🔗 Jinx: Sag ${c.name}, dass er jetzt die Fähigkeit des ${roleName(x.role)}s hat`), 900);
        }
        // Jinx Jongleur: Hat der Jongleur am ersten Tag geraten, erfährt der Kannibale heute Nacht die Anzahl richtiger Vermutungen
        if (x.role === "juggler" && game.juggle && game.juggle.day === 1 && game.nightNo === 1)
          hist(`🔗 Jinx: ${c.name} (Kannibale) erfährt heute Nacht beim Jongleur-Schritt, wie viele Vermutungen des Jongleurs richtig waren`, "day");
      } else {
        // Schein-Fähigkeit: eine gute Rolle aus dem Skript, die nicht im Spiel ist (der Spielleiter kann sie ändern)
        const inPlay = new Set(game.seats.map(y => y.role));
        const pool = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider") && !inPlay.has(r.id) && r.id !== "cannibal");
        const night = pool.filter(r => r.n), list = night.length ? night : pool;
        const fake = list[randInt(list.length)] || ROLE_BY_ID.monk;
        c.gained = fake.id; c.gainedUsed = false; c.canniFake = true;
        if (!(c.marks || []).includes("poison")) { c.marks = [...(c.marks || []), "poison"]; markHist(c, "poison", true, "Kannibale hat einen Bösen gegessen"); }
        c.keep = [...new Set([...(c.keep || []), "poison"])];
        c.canniPoison = true;
        hist(`🍖 ${c.name} (Kannibale) hat einen Bösen gegessen – vergiftet, bis ein Guter durch Hinrichtung stirbt. Schein-Fähigkeit: ${roleName(fake.id)}`, "day");
        setTimeout(() => canniFakeModal(game.seats.indexOf(c)), 400);
      }
    });
  }
  function canniFakeModal(i) {
    const c = game.seats[i];
    if (!c || !c.canniFake) return;
    const opts = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider") && r.id !== "cannibal");
    openModal(`<h2>🍖 Kannibale hat einen Bösen gegessen</h2>
      <p><b>${esc(c.name)}</b> ist jetzt <b>vergiftet</b> (🧪 📌), bis ein guter Spieler durch Hinrichtung stirbt.</p>
      <p>Damit er es nicht merkt, behandelst du ihn so, als hätte er eine <b>gute Fähigkeit</b> – seine Infos sind falsch. Welche soll er glauben zu haben?</p>
      <select id="canfake">${opts.map(r => `<option value="${r.id}" ${r.id === c.gained ? "selected" : ""}>${r.ic} ${esc(r.de)}${game.seats.some(y => y.role === r.id) ? " (im Spiel)" : ""}</option>`).join("")}</select>
      <p class="small">Tipp: Eine Rolle, die nicht im Spiel ist, verrät am wenigsten.</p>
      <div class="row end"><button class="btn primary" id="canok">OK</button></div>`);
    $("#canok").addEventListener("click", () => { c.gained = $("#canfake").value; c.gainedUsed = false; save(); closeModal(); renderSL(); });
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
    canniEat(n);
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
    if (!s || actingRole(s) !== "butler") return null;
    const m = s.marks || [];
    if (m.includes("poison") || m.includes("drunk")) return { ok: true, note: "Butler – betrunken/vergiftet: darf frei stimmen" };
    const master = game.seats.findIndex(y => (y.marks || []).includes("master"));
    if (master < 0) return { ok: true, warn: !!hands.includes(i), note: "Butler – kein Meister markiert (Marker 👔 setzen)" };
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

