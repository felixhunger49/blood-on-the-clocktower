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
      box.innerHTML = `💡 <b>Vorschlag (wahre Info)</b> <span class="small">· nur für dich, wird nicht gesendet</span><br> ${esc(sg.text)}${warn ? `<br><span class="warnmsg">⚠️ ${esc(warn)}</span>` : ""}${mis.map(t => `<br><span class="mismsg">${esc(t)}</span>`).join("")}`;
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
      // Weicht die gesendete Info von der wahren ab, hat die Fähigkeit nicht normal funktioniert
      try {
        const truth = suggestInfo(stepId, i, picked.slice());
        const sent = ($("#infotext") ? $("#infotext").value : "").trim();
        if (truth && truth.t && !truth.p && sent && sent.toLowerCase() !== String(truth.t).toLowerCase()) abn(s, `${roleName(stepId)} bekam eine falsche Info`);
      } catch (e) { /* kein Vorschlag möglich */ }
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

  // Spion: Grimoire als Kopie aufs Handy. Vergiftet/betrunken darf es falsch sein (zwei Rollen vertauscht).
  function grimSnapshot(fake) {
    const S = game.seats;
    const rows = S.map(x => [x.name, x.role, x.alive || x.zfake ? 1 : 0,
      (x.marks || []).map(m => (markerByKey(m) || {}).i || "").join(""),
      x.role === "drunk" || x.role === "marionette" ? `glaubt: ${roleName(shownRole(x.role))}` : x.trav ? (x.align === "e" ? "Reisender, böse" : "Reisender, gut") : ""]);
    if (inPlayRole("magician")) rows.forEach((r, k) => { if (S[k].role === "magician" || ROLE_BY_ID[S[k].role].t === "demon") { r[1] = ""; r[4] = "🔗 Jinx Magier: verdeckt"; } });
    if (fake) {
      const idx = rows.map((r, k) => k).filter(k => !S[k].trav && S[k].role !== "spy");
      const a = idx[randInt(idx.length)], c = shuffle(idx.filter(k => k !== a && ROLE_BY_ID[S[k].role].t !== ROLE_BY_ID[S[a].role].t))[0];
      if (c !== undefined) { const t = rows[a][1]; rows[a][1] = rows[c][1]; rows[c][1] = t; }
    }
    return { n: game.nightNo, s: rows, b: game.bluffs || [] };
  }
  function spyGrimHide() {
    game.seats.forEach(x => { if (x.grim) { delete x.grim; hist(`🙈 Grimoire vom Handy von ${x.name} entfernt`, "night"); } });
    save(); renderSL();
    toast("🙈 Das Grimoire ist vom Handy verschwunden");
  }
  function widowKnowDialog() {
    const S = game.seats;
    const good = S.map((y, i) => i).filter(i => S[i].alive && seatGood(S[i]) && S[i].role !== "widow");
    if (!good.length) return;
    openModal(`<h2>🕸️ Wer erfährt von der Witwe?</h2>
      <p class="small">Ein guter Spieler erfährt, dass eine Witwe im Spiel ist (aber nicht, wer). Er bekommt es aufs Handy bzw. du zeigst ihm das Witwe-Token.</p>
      <div class="infopick">${good.map(i => `<button class="btn pickbtn" data-wk="${i}">${esc(S[i].name)}</button>`).join("")}</div>
      <div class="row"><button class="btn sm" id="wkrand">🎲 Zufällig</button></div>`);
    const pick = i => {
      const t = S[i];
      t.marks = [...new Set([...(t.marks || []), "knows"])];
      t.infos = [...(t.infos || []), { n: game.nightNo, r: ["widow"], t: "Eine Witwe ist im Spiel." }].slice(-10);
      if (tableOn()) {
        game.wakes = game.wakes || {};
        game.wakes[i] = { id: `w${game.nightNo}-${i}-${randInt(1e6)}`, night: game.nightNo, step: "widow", r: ["widow"], t: "Eine Witwe ist im Spiel." };
        const wk = game.wakes[i];
        if (isBot(t)) setTimeout(() => { if (!wk.done) { wk.done = true; save(); refreshHostView(); } }, 1500 + randInt(1500));
      }
      hist(`🕸️ ${t.name} erfährt, dass eine Witwe im Spiel ist`, "night");
      save(); closeModal(); renderSL();
      toast(reachable(t) ? `🕸️ ${t.name} erfährt es${tableOn() ? " – wird geweckt" : " auf dem Handy"}` : `🕸️ Zeig ${t.name} das Witwe-Token`);
    };
    $$("[data-wk]").forEach(b => b.addEventListener("click", () => pick(+b.dataset.wk)));
    $("#wkrand").addEventListener("click", () => pick(good[randInt(good.length)]));
  }
  function spyGrimDialog(rid) {
    rid = rid === "widow" ? "widow" : "spy";
    const holders = stepHolders(rid).filter(([x]) => x.alive);
    if (!holders.length) return;
    const [x, i] = holders[0];
    const rname = roleName(rid);
    // Jinx: Hat der Mohnbauer seine Fähigkeit, sieht der Spion/die Witwe das Grimoire nicht
    const poppy = game.seats.find(y => y.role === "poppygrower" && y.alive && !impaired(y));
    if (poppy) { toast(`🌺 Der Mohnbauer lebt – ${rname} sieht das Grimoire nicht (Jinx)`); return; }
    const send = fake => {
      x.grim = grimSnapshot(fake);
      if (tableOn()) {
        game.wakes = game.wakes || {};
        game.wakes[i] = { id: `w${game.nightNo}-${i}-${randInt(1e6)}`, night: game.nightNo, step: rid, r: [], t: rid === "widow" ? "Das Grimoire – wähle danach, wen du vergiftest:" : "Das Grimoire:" };
        const wk = game.wakes[i];
        if (isBot(x)) setTimeout(() => { if (!wk.done) { wk.done = true; save(); refreshHostView(); } }, 2500 + randInt(2000));
      }
      const d = game.done[game.nightNo] || [];
      if (rid === "spy" && !d.includes("spy")) game.done[game.nightNo] = [...d, "spy"];
      hist(`📖 ${x.name} (${rname}) sieht das Grimoire${fake ? " (verfälscht)" : ""}`, "night");
      save(); closeModal(); renderSL();
      toast(reachable(x) ? `📖 Grimoire an ${x.name} gesendet${tableOn() ? " – wird geweckt" : ""}` : `${x.name} ist nicht online – zeig ihm dein Grimoire`);
    };
    if (!impaired(x)) return send(false);
    openModal(`<h2>📖 Grimoire für ${esc(x.name)}</h2>
      <p class="warnmsg">⚠️ ${esc(rname)} ist vergiftet/betrunken – du darfst ein falsches Grimoire zeigen.</p>
      <div class="row wrap"><button class="btn" id="spyreal">Echtes Grimoire senden</button><button class="btn primary" id="spyfake">🔀 Verfälscht senden (2 Rollen vertauscht)</button></div>`);
    $("#spyreal").addEventListener("click", () => send(false));
    $("#spyfake").addEventListener("click", () => send(true));
  }

  // Cerenovus: Spieler muss morgen „verrückt“ danach sein, eine gute Rolle zu sein.
  function madnessDialog(i) {
    const s = game.seats[i];
    const cur = s.madness && s.madness.night === game.nightNo ? s.madness.role : (game.lastPicks || {}).cerenovus;
    const pool = ROLES.filter(r => inEd(r, game.edition) && (r.t === "townsfolk" || r.t === "outsider" || (r.id === "goblin" && game.seats.some(y => y.role === "cerenovus"))));
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
      ${recapHtml(recapDays(), game.seats.map(x => ({ n: x.name, good: seatGood(x) })), game.history)}
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
  const ACTS_WHEN_DEAD = ["ravenkeeper", "sage", "moonchild", "sweetheart", "barber", "poppygrower"];
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

