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
    const shooters = S.map((x, i) => i).filter(i => S[i].alive && actingRole(S[i]) === "slayer" && !(gainer(S[i]) ? S[i].gainedUsed : S[i].used));
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
      if (gainer(x)) x.gainedUsed = true; else x.used = true;
      const real = (x.role === "slayer" || (gainer(x) && x.gained === "slayer")) && !impaired(x);
      let hit = real && ROLE_BY_ID[t.role].t === "demon";
      // Jinx Lleech + Dämonenjäger: Trifft er den Wirt, stirbt der Wirt
      if (real && !hit && (t.marks || []).includes("host") && game.seats.some(y => y.role === "lleech")) { hit = true; hist(`🔗 Jinx: ${t.name} ist der Wirt des Lleech – der Wirt stirbt`, "day"); }
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

  // Kannibale: bekommt die Fähigkeit des zuletzt durch Hinrichtung Gestorbenen.
  // War der böse, ist er vergiftet, bis ein Guter durch Hinrichtung stirbt – und glaubt, eine gute Fähigkeit zu haben.
