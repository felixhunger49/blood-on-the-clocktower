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
    // Aufstellungen mit verbotenen Paaren (Jinx „nur 1 darf im Spiel sein“) neu würfeln
    for (let k = 0; k < 30; k++) { const sel = randomSetupOnce(); if (!onlyOneClash(sel).length || k === 29) return sel; }
  }
  function randomSetupOnce() {
    const ed = game.edition, base = SETUP_COUNTS[game.count];
    const rolesOf = (e, t) => ROLES.filter(r => inEd(r, e) && r.t === t && !smallExcluded(r.id, game.count));
    const demon = pick(rolesOf(ed, "demon"), 1);
    const minions = pick(rolesOf(ed, "minion"), base[2]);
    let outs = base[1];
    [...demon, ...minions].forEach(r => { const m = OUTSIDER_MODS[r.id]; if (m) outs += m[randInt(m.length)]; });
    const outsiderPool = rolesOf(ed, "outsider");
    outs = Math.max(0, Math.min(outs, outsiderPool.length));
    let tf = game.count - outs - base[2] - base[3];
    // Zu wenige Dorfbewohner in der Rollenliste: mit zusätzlichen Außenseitern auffüllen
    const tfPool = rolesOf(ed, "townsfolk");
    if (tf > tfPool.length) { const extra = Math.min(tf - tfPool.length, outsiderPool.length - outs); outs += extra; tf -= extra; }
    let sel = [...demon, ...minions, ...pick(outsiderPool, outs), ...pick(tfPool, tf)];
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
    onlyOneClash(game.selected).forEach(([a, b]) => w.push(`🔗 Jinx: ${roleName(a)} und ${roleName(b)} dürfen nicht zusammen`));
    return w.length ? `<p class="warnmsg">⚠️ ${w.join(" · ")} im Spiel.</p>` : "";
  }
  let scriptFilter = "all";
