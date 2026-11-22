  // Nominierung beginnen – mit allen Prüfungen (doppelt, Jungfrau, Hexe)
  let voteEndedAt = 0;
  // Wie viel zählt eine Stimme? (Banshee ×2, Bürokrat ×3, Dieb negativ)
  function voteWeight(i) {
    const x = game.seats[i], m = x.marks || [];
    let w = x.banshee ? 2 : 1;
    if (m.includes("bureau")) w *= 3;
    if (m.includes("stolen")) w = -w;
    return w;
  }
  function beginVote(by, on, quiet) {
    const day = today();
    const warn = [];
    if (day.noms.filter(n => n.by === by).length >= (game.seats[by].banshee ? 2 : 1)) warn.push(`${game.seats[by].name} hat heute schon ${game.seats[by].banshee ? "2×" : ""} nominiert.`);
    if (day.noms.some(n => n.on === on)) warn.push(`${game.seats[on].name} war heute schon nominiert.`);
    if (!quiet && warn.length && !confirm(warn.join("\n") + "\n\nTrotzdem abstimmen?")) return;
    game.vote = { by, on, hands: [] };
    game.voteOpen = true;
    const virgin = virginCheck(by, on);
    const cursed = virgin && virgin.stop ? null : witchCurse(by);
    const golem = golemCheck(by, on);
    save(); renderSL();
    if (virgin) toast(virgin.msg); else if (cursed) toast(cursed); else if (golem) toast(golem);
  }
  // Golem: darf nur einmal nominieren – ist der Nominierte nicht der Dämon, stirbt er
  function golemCheck(by, on) {
    const g = game.seats[by], t = game.seats[on];
    if (!g || g.role !== "golem" || g.used || !t) return null;
    g.used = true;
    if (impaired(g)) { hist(`🗿 ${g.name} (Golem) nominiert ${t.name} – vergiftet/betrunken, nichts passiert`, "day"); return "🗿 Golem vergiftet/betrunken – nichts passiert"; }
    if (ROLE_BY_ID[t.role].t === "demon") { hist(`🗿 ${g.name} (Golem) nominiert ${t.name} – das ist der Dämon, nichts passiert`, "day"); return "🗿 Golem hat den Dämon nominiert – nichts passiert"; }
    applyDeath(t, deathRule(t));
    hist(`🗿 ${g.name} (Golem) nominiert ${t.name} – kein Dämon, ${t.alive ? "überlebt aber" : "stirbt sofort"}`, "day");
    return t.alive ? `🗿 ${t.name} überlebt den Golem` : `🗿 ${t.name} ist nicht der Dämon und stirbt sofort!${t.role === "recluse" ? " (Einsiedler dürfte auch als Dämon gelten)" : ""}`;
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
      const count = validHands(order.filter(i => v.hands.includes(i))).reduce((c, i) => c + voteWeight(i), 0);
      body += `<div class="vote">
        <p><b>${esc(ps[v.by].name)}</b> nominiert <b>${esc(ps[v.on].name)}</b></p>
        <p class="small">${game.phoneVote && (game.online || game.test) ? "📱 Die Spieler heben die Hand auf dem Handy – du siehst es hier live und kannst trotzdem selbst antippen." : "Gehe im Uhrzeigersinn herum und tippe alle an, die die Hand heben."} Tote haben nur ihre eine Geisterstimme.</p>
        <div class="votelist">${order.map(i => {
          const s = ps[i];
          const canVote = s.alive || s.ghost;
          const up = v.hands.includes(i);
          const bc = butlerCheck(i, v.hands);
          const isMaster = (s.marks || []).includes("master") && ps.some(y => actingRole(y) === "butler");
          return `<button class="voter ${up ? "up" : ""} ${bc && bc.warn ? "warn" : ""} ${v.clock === i ? "clock" : ""}" data-hand="${i}" ${canVote ? "" : "disabled"}>
            <span>${up ? "✋" : "·"}</span><b>${esc(s.name)}</b>${s.alive ? "" : `<small>${s.ghost ? "👻 Geisterstimme" : "keine Stimme mehr"}</small>`}${bc ? `<small>${esc(bc.note)}</small>` : ""}${s.role === "zealot" && s.alive && ps.filter(y => y.alive).length >= 5 ? `<small>📢 Zelot – muss abstimmen</small>` : ""}${s.banshee ? `<small>😱 Banshee – zählt doppelt</small>` : ""}${isMaster ? `<small>👔 Meister des Butlers</small>` : ""}</button>`;
        }).join("")}</div>
        <div class="votecount ${count >= votesNeeded() ? "ok" : ""}">${count} Stimmen · nötig ${votesNeeded()}${b && !b.tie ? ` · auf dem Block mit ${b.count}` : ""}</div>
        ${game.test && !v.botDone ? `<div class="row wrap"><button class="btn" id="botvote">🤖 Bots stimmen ab</button></div>` : ""}
        <div class="row wrap"><button class="btn primary" id="savevote">Abstimmung beenden</button><button class="btn" id="cancelvote">Abbrechen</button></div>
      </div>`;
    } else {
      const opt = (list, sel) => list.map(i => `<option value="${i}">${esc(ps[i].name)}${sel(i)}</option>`).join("");
      const all = ps.map((_, i) => i);
      body += `<div class="nomform">
        <label>Wer nominiert?<select id="nomby">${opt(all.filter(i => ps[i].alive || ps[i].banshee), i => nominatedBy.has(i) ? " (hat schon nominiert)" : "")}</select></label>
        <label>Wer wird nominiert?<select id="nomon">${opt(all, i => nominated.has(i) ? " (war schon nominiert)" : "")}</select></label>
        <button class="btn primary" id="startvote">🗳️ Abstimmung starten</button>
      </div>
      ${game.test ? `<div class="row wrap"><button class="btn" id="botnom">🤖 Ein Bot nominiert</button></div>
        <p class="small">Ein zufälliger Bot nominiert jemanden und alle Bots stimmen ab – Böse halten zusammen, Gute raten. Du zählst wie am Tisch mit und entscheidest am Ende.</p>` : ""}
      <p class="small">Regeln: Jeder <b>lebende</b> Spieler darf einmal pro Tag nominieren, jeder Spieler einmal pro Tag nominiert werden. Tote nominieren nicht.</p>`;
    }

    const noms = day.noms.map((n, k) => `<li class="${b && !b.tie && b === n ? "onblock" : ""}">
        <span>${esc(ps[n.by] ? ps[n.by].name : "?")} → <b>${esc(ps[n.on] ? ps[n.on].name : "?")}</b></span>
        ${(n.hands || []).length ? `<small class="nomhands">✋ ${n.hands.map(h => esc(ps[h] ? ps[h].name : "?")).join(", ")}</small>` : ""}
        <span class="nomcount">${n.count} / ${n.needed}${b && !b.tie && b === n ? " · auf dem Block" : ""}</span>
        ${day.exec ? "" : `<button class="btn sm" data-delnom="${k}" title="Nominierung löschen">✕</button>`}</li>`).join("");

    let blockLine = "Noch niemand auf dem Block.";
    if (b && b.tie) blockLine = `Gleichstand mit ${b.count} Stimmen – niemand ist auf dem Block.`;
    else if (b) blockLine = `Auf dem Block: <b>${esc(ps[b.on].name)}</b> mit ${b.count} Stimmen.`;

    const slayers = ps.map((x, i) => i).filter(i => ps[i].alive && (actingRole(ps[i]) === "slayer") && !(gainer(ps[i]) ? ps[i].gainedUsed : ps[i].used));
    const amn = ps.map((x, i) => i).filter(i => ps[i].alive && ps[i].role === "amnesiac");
    const amnBtn = amn.length && !v ? `<div class="row wrap"><button class="btn" id="amngo">❓ Amnesiker rät${day.amn ? " <small>(heute schon ✔)</small>" : ""}</button></div>` : "";
    const jug = ps.map((x, i) => i).filter(i => ps[i].alive && actingRole(ps[i]) === "juggler");
    const jugBtn = jug.length && !v && game.nightNo === 1 ? `<div class="row wrap"><button class="btn" id="juggo">🤹 Jongleur rät Rollen${game.juggle ? ` <small>(${game.juggle.guesses.length} Tipps ✔)</small>` : ""}</button></div>` : "";
    const sav = ps.map((x, i) => i).filter(i => ps[i].alive && actingRole(ps[i]) === "savant");
    const savBtn = sav.length && !v ? `<div class="row wrap"><button class="btn" id="savantgo">🎓 Gelehrter besucht dich${day.savant ? " <small>(heute schon ✔)</small>" : ""}</button></div>` : "";
    const psy = ps.map((x, i) => i).filter(i => ps[i].alive && ps[i].role === "psychopath");
    const psyBtn = psy.length && !v && !day.exec && !day.psycho && !day.noms.length ? `<div class="row wrap"><button class="btn" id="psygo">🪓 Psychopath tötet …</button></div>` : "";
    const dam = ps.some(x => x.role === "damsel") && !v;
    const damBtn = dam ? `<div class="row wrap"><button class="btn" id="damgo">🎯 Scherge rät die Jungfer …</button></div>` : "";
    const gos = ps.some(x => x.alive && x.role === "gossip");
    const gosBtn = gos && !v ? `<div class="row wrap"><button class="btn ${day.gossipTrue ? "used" : ""}" id="gosgo">🗣️ Klatschtante: ${day.gossipTrue ? "Behauptung war wahr ✔" : "Behauptung war wahr?"}</button></div>` : "";
    const slayerBtn = psyBtn + gosBtn + damBtn + amnBtn + jugBtn + savBtn + (slayers.length && !v ? `<div class="row wrap"><button class="btn" id="slayshot">🏹 Dämonenjäger schießt …</button></div>` : "");
    const execBtns = day.exec || v ? slayerBtn : slayerBtn + `<div class="row wrap">
        ${b && !b.tie ? `<button class="btn danger" id="execute">⚔️ ${esc(ps[b.on].name)} hinrichten</button>` : ""}
        <button class="btn" id="noexec">Niemand wird hingerichtet</button>
      </div>`;

    return `<section class="panel">
      <details class="daypanel" ${game.voteOpen !== false ? "open" : ""}>
        <summary><h2>⚖️ Nominieren &amp; Abstimmen</h2></summary>
        <p class="small">Nötig für die Hinrichtung: <b>${votesNeeded()}</b> Stimmen (Hälfte der Lebenden). ${blockLine}</p>
        ${ps.some(y => y.role === "vizier") ? (ps.some(y => ["investigator", "alsaahir"].includes(y.role)) ? `<p class="small">👳 🔗 Jinx: Den Wesir <b>nicht</b> ansagen (${ps.some(y => y.role === "investigator") ? "Ermittler" : "Al-Saahir"} im Spiel).</p>` : `<p class="small">👳 Alle wissen: <b>${esc(ps.find(y => y.role === "vizier").name)}</b> ist der Wesir (kann tagsüber nicht sterben).</p>`) : ""}
        ${game.online || game.test ? `<p class="small">📱 Abstimmen am Handy: <b>${game.phoneVote ? "an" : "aus"}</b> (⚙️ Einstellungen)</p>` : ""}
        ${game.nomReq && !game.vote ? `<div class="box nomreq">📨 <b>${esc(game.seats[game.nomReq.by].name)}</b> möchte <b>${esc(game.seats[game.nomReq.on].name)}</b> nominieren.
          <div class="row wrap"><button class="btn primary" id="nomok">✅ Zulassen</button><button class="btn" id="nomno">Ablehnen</button></div></div>` : ""}
        ${yaggaDayHtml()}
        ${mezDayHtml()}
        ${body}
        ${noms ? `<h3>Nominierungen heute</h3><ul class="nomlist">${noms}</ul>` : ""}
        ${exileHtml(day)}
        ${execBtns}
      </details>
    </section>`;
  }

  function bindDay() {
    const dp = $(".daypanel");
    if (!dp) return;
    dp.addEventListener("toggle", () => { if ((game.voteOpen !== false) === dp.open) return; game.voteOpen = dp.open; save(); });
    const day = today();
    $("#startvote") && $("#startvote").addEventListener("click", () => {
      const by = +$("#nomby").value, on = +$("#nomon").value;
      if (Number.isNaN(by) || Number.isNaN(on)) return;
      beginVote(by, on);
    });
    $("#nomok") && $("#nomok").addEventListener("click", () => { const r = game.nomReq; game.nomReq = null; if (r) beginVote(r.by, r.on); });
    $("#nomno") && $("#nomno").addEventListener("click", () => { const r = game.nomReq; game.nomReq = null; if (r) hist(`🚫 Nominierung ${game.seats[r.by].name} → ${game.seats[r.on].name} abgelehnt`, "day"); save(); renderSL(); });
    $("#pvtoggle") && $("#pvtoggle").addEventListener("change", e => { game.phoneVote = e.target.checked; save(); renderSL(); toast(game.phoneVote ? "📱 Spieler nominieren und stimmen jetzt am Handy ab" : "Abstimmen am Handy ist aus"); });
    $$("[data-hand]").forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.hand, h = game.vote.hands;
      game.vote.hands = h.includes(i) ? h.filter(x => x !== i) : [...h, i];
      save(); renderSL();
    }));
    $("#cancelvote") && $("#cancelvote").addEventListener("click", () => { botVoteRun++; game.vote = null; save(); renderSL(); });
    $("#botnom") && $("#botnom").addEventListener("click", botNominate);
    $("#slayshot") && $("#slayshot").addEventListener("click", slayerDialog);
    $("#savantgo") && $("#savantgo").addEventListener("click", savantDialog);
    $("#juggo") && $("#juggo").addEventListener("click", jugglerDialog);
    $("#damgo") && $("#damgo").addEventListener("click", () => {
      const S = game.seats, mins = S.map((y, k) => k).filter(k => S[k].alive && ROLE_BY_ID[S[k].role].t === "minion" && !S[k].damGuess);
      if (!mins.length) { toast("Kein lebender Scherge hat noch einen Rateversuch"); return; }
      openModal(`<h2>🎯 Jungfer raten</h2><p class="small">Jeder Scherge darf einmal im Spiel öffentlich raten, wer die Jungfer ist. Trifft er, gewinnt Böse.</p>
        <label class="field">Scherge: <select id="dgby">${mins.map(k => `<option value="${k}">${esc(S[k].name)} (${esc(roleName(S[k].role))})</option>`).join("")}</select></label>
        <label class="field">Rät: ${pickList("dgon", [])}</label>
        <div class="row end"><button class="btn" id="dgno">Abbrechen</button><button class="btn primary" id="dgok">Raten</button></div>`);
      $("#dgno").addEventListener("click", closeModal);
      $("#dgok").addEventListener("click", () => {
        const by = S[+$("#dgby").value], t = S[+$("#dgon").value];
        by.damGuess = true;
        const damsel = S.find(y => y.role === "damsel");
        if (t.role === "damsel" && !(damsel && impaired(damsel))) { game.jinxWin = { winner: "evil", reason: `🎯 ${by.name} hat die Jungfer ${t.name} richtig geraten – Böse gewinnt.` }; game.ignoreEnd = null; game.endPopped = null; hist(game.jinxWin.reason, "day"); }
        else hist(`🎯 ${by.name} rät ${t.name} als Jungfer – ${t.role === "damsel" ? "richtig, aber die Jungfer ist vergiftet/betrunken" : "falsch"}`, "day");
        save(); closeModal(); renderSL();
      });
    });
    $("#gosgo") && $("#gosgo").addEventListener("click", () => { day.gossipTrue = !day.gossipTrue; if (day.gossipTrue) hist("🗣️ Die Behauptung der Klatschtante war wahr – heute Nacht stirbt ein Spieler deiner Wahl", "day"); save(); renderSL(); });
    $("#psygo") && $("#psygo").addEventListener("click", () => {
      const pi = game.seats.findIndex(y => y.alive && y.role === "psychopath"), x = game.seats[pi];
      openModal(`<h2>🪓 Psychopath</h2><p>Vor den Nominierungen darf ${esc(x.name)} öffentlich einen Spieler wählen: Er stirbt.</p>
        <label class="field">Opfer: ${pickList("psypick", [pi])}</label>
        <div class="row end"><button class="btn" id="psyno">Abbrechen</button><button class="btn danger" id="psyok">🪓 Töten</button></div>`);
      $("#psyno").addEventListener("click", closeModal);
      $("#psyok").addEventListener("click", () => {
        const t = game.seats[+$("#psypick").value]; day.psycho = true;
        if (impaired(x)) { hist(`🪓 ${x.name} (Psychopath) wählt ${t.name} – vergiftet/betrunken, nichts passiert`, "day"); abn(x, "Psychopath: Tötung wirkt nicht"); }
        else { applyDeath(t, deathRule(t)); hist(`🪓 ${x.name} (Psychopath) tötet ${t.name}${t.alive ? " – überlebt aber" : ""}`, "day"); }
        game.ignoreEnd = null; save(); closeModal(); renderSL();
      });
    });
    $("#amngo") && $("#amngo").addEventListener("click", amnesiacDialog);
    bindExile(day);
    $("#botvote") && $("#botvote").addEventListener("click", () => { $("#botvote").disabled = true; botVote(); });
    $("#savevote") && $("#savevote").addEventListener("click", () => {
      const v = game.vote;
      botVoteRun++;
      const hands = validHands(v.hands);
      const cnt = hands.reduce((c, i) => c + voteWeight(i), 0);
      // Tote, die abgestimmt haben, verbrauchen ihre Geisterstimme (die Banshee nicht).
      hands.forEach(i => { const s = game.seats[i]; if (!s.alive && !s.banshee) s.ghost = false; });
      day.noms.push({ by: v.by, on: v.on, count: cnt, needed: votesNeeded(), hands });
      hist(`🗳️ ${game.seats[v.by].name} nominiert ${game.seats[v.on].name}: ${cnt} Stimme(n)`, "day");
      game.vote = null;
      voteEndedAt = Date.now();
      save(); renderSL();
      // Doppeltipp-Schutz: alle Knöpfe, die jetzt unter dem Finger liegen, kurz sperren
      $$('.daypanel button:not([disabled])').forEach(x => { x.disabled = true; setTimeout(() => { x.disabled = false; }, 1000); });
    });
    $$("[data-delnom]").forEach(btn => btn.addEventListener("click", () => {
      if (!confirm("Diese Nominierung löschen? (Verbrauchte Geisterstimmen bitte selbst zurücksetzen.)")) return;
      day.noms.splice(+btn.dataset.delnom, 1);
      save(); renderSL();
    }));
    $("#execute") && $("#execute").addEventListener("click", () => {
      // Schutz vor Doppeltipp: Direkt nach „Abstimmung beenden“ liegt dieser Knopf unter dem Finger
      if (Date.now() - voteEndedAt < 1200) return;
      const b = block(day);
      const s = game.seats[b.on];
      const role = ROLE_BY_ID[s.role];
      let msg = `${s.name} hinrichten?`;
      if (s.role === "saint") msg += "\n\n⚠️ Das ist der HEILIGE – wird er hingerichtet, gewinnt Böse!";
      const da = game.seats.find(y => y.role === "devilsadvocate" && y.alive);
      const rule = !s.alive ? null : (s.marks || []).includes("survives") && da && !impaired(da)
        ? { dies: false, why: "⚖️ Advokat des Teufels – überlebt diese Hinrichtung" } : deathRule(s);
      if (rule) msg += `\n\n${rule.why}.`;
      if (s.role === "psychopath" && !impaired(s)) msg += "\n\n🪓 Psychopath: Er stirbt nur, wenn er Schere-Stein-Papier gegen den Nominierenden verliert.";
      else if (["pacifist", "tealady", "devilsadvocate"].some(id => game.seats.some(x => x.role === id)) || (s.marks || []).includes("survives"))
        msg += "\n\nHinweis: Eine Rolle im Spiel kann die Hinrichtung verhindern (z. B. Pazifist, Teedame, Advocatus Diaboli). Prüfe das, bevor du bestätigst.";
      // Eigenes Bestätigungsfenster (die Handy-Rückfrage wird in installierten Apps manchmal übersprungen)
      openModal(`<h2>⚔️ Hinrichten?</h2><p>${esc(msg).replace(/\n/g, "<br>")}</p>
        <div class="row end"><button class="btn" id="exno">Abbrechen</button><button class="btn danger" id="exyes">⚔️ Ja, ${esc(s.name)} hinrichten</button></div>`);
      $("#exno").addEventListener("click", closeModal);
      $("#exyes").addEventListener("click", () => { closeModal(); doExecute(b, s, role, rule); });
      if (s.role === "psychopath" && !impaired(s)) {
        $("#exyes").textContent = "🪨 Psychopath verliert Schere-Stein-Papier → stirbt";
        $("#exyes").insertAdjacentHTML("beforebegin", `<button class="btn" id="expsy">✂️ Psychopath gewinnt → überlebt</button>`);
        $("#expsy").addEventListener("click", () => { closeModal(); doExecute(b, s, role, { dies: false, why: "🪓 Psychopath hat Schere-Stein-Papier gewonnen" }); });
      }
    });
    const doExecute = (b, s, role, rule) => {
      day.exec = { seat: b.on, name: s.name };
      hist(`⚔️ ${s.name} wurde hingerichtet (${role.ic} ${role.de})`, "day");
      swMsg = null;
      applyDeath(s, rule);
      if (game.seats[b.on].alive) day.exec.survived = true;
      saintCheck(s);
      canniEat(s);
      jinxExecCheck(game.seats[b.by], s);
      execRoleEffects(game.seats[b.by], s);
      // Prinzessin: hat sie am 1. Tag nominiert und wurde hingerichtet -> heute Nacht kein Dämonen-Tod
      const pr = game.seats[b.by];
      if (pr && pr.role === "princess" && pr.alive && !impaired(pr) && game.nightNo === 1 && !game.princessUsed) {
        game.princessUsed = true; game.princessBlock = game.nightNo + 1;
        hist(`👸 ${pr.name} (Prinzessin) hat nominiert und hinrichten lassen – der Dämon tötet heute Nacht nicht`, "day");
      }
      // Jinx Kannibale + Prinzessin: Hat der Kannibale die Prinzessin nominiert und ist sie durch die Hinrichtung gestorben
      if (pr && pr.role === "cannibal" && pr.alive && !impaired(pr) && s.role === "princess" && !s.alive) {
        game.princessBlock = game.nightNo + 1;
        hist(`🔗 Jinx: ${pr.name} (Kannibale) hat die Prinzessin nominiert, hingerichtet und getötet – der Dämon tötet heute Nacht nicht`, "day");
      }
      // Drahtzieher: Dämon hingerichtet -> noch ein Tag; danach verliert das Team des Hingerichteten
      if (game.mastermind && !game.mmResult && game.mastermind.day < game.nightNo) {
        game.mmResult = seatGood(s) ? "evil" : "good";
        hist(`🎭 Drahtzieher-Tag: ${s.name} wurde hingerichtet – ${seatGood(s) ? "Gut" : "Böse"} verliert`, "day");
      } else if (ROLE_BY_ID[s.role].t === "demon" && !s.alive && !game.seats.some(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon")) {
        const mm = game.seats.find(y => y.role === "mastermind" && y.alive && !impaired(y));
        if (mm) { game.mastermind = { day: game.nightNo }; hist(`🎭 Der Dämon wurde hingerichtet, aber der Drahtzieher lebt – es wird noch ein Tag gespielt`, "day"); swMsg = "🎭 Drahtzieher! Das Spiel geht noch einen Tag weiter – verrate es nicht."; }
      }
      save(); renderSL();
      if (s.role === "saint") toast(game.saintLoss ? "Der Heilige wurde hingerichtet – Böse gewinnt!" : "Der Heilige ist vergiftet/betrunken – nichts passiert");
      else if (swMsg) toast(swMsg);
      else if (rule && !rule.dies) toast(`${s.name} wurde hingerichtet, stirbt aber nicht (${role.de})`);
      else toast(`${s.name} wurde hingerichtet (${role.de})`);
    };
    $("#noexec") && $("#noexec").addEventListener("click", () => {
      day.exec = "none";
      hist("🕊️ Heute wurde niemand hingerichtet", "day");
      if (game.mastermind && !game.mmResult && game.mastermind.day < game.nightNo) { game.mmResult = "good"; hist("🎭 Drahtzieher-Tag ohne Hinrichtung – Gut gewinnt", "day"); }
      save(); renderSL();
      if (game.seats.some(s => s.role === "vortox" && s.alive)) toast("Achtung: Vortox im Spiel – ohne Hinrichtung gewinnt Böse!");
      else { const mc = mayorWinCheck(); if (mc && !mc.ok) toast(mc.why); }
    });
    $("#undoexec") && $("#undoexec").addEventListener("click", () => {
      if (day.exec && day.exec !== "none" && game.seats[day.exec.seat]) { const x = game.seats[day.exec.seat]; x.alive = true; x.zfake = false; swRevert(day.exec.seat); if (game.saintLoss === x.name) game.saintLoss = null; }
      day.exec = null;
      game.jinxWin = null;
      save(); renderSL();
    });
  }

  // Rolle oder Gesinnung eines Spielers während des Spiels ändern (Imp-Wechsel, Scharlachrote Frau, Grubenhexe …).
  function changeRole(i) {
    const s = game.seats[i];
    const pool = ROLES.filter(r => s.trav ? r.t === "traveller" : (inEd(r, game.edition) && r.t !== "traveller" && r.t !== "fabled"));
    openModal(`<h2>${esc(s.name)}</h2>
      <label class="field">Neue Rolle:
        <select id="newrole">${pool.map(r => `<option value="${r.id}" ${r.id === s.role ? "selected" : ""}>${esc(r.de)} (${TEAMS[r.t].name})</option>`).join("")}</select></label>
      <label class="field">Gesinnung:
        <select id="newalign">
          <option value="" ${s.align ? "" : "selected"}>Automatisch (nach Rolle)</option>
          <option value="g" ${s.align === "g" ? "selected" : ""}>Gut</option>
          <option value="e" ${s.align === "e" ? "selected" : ""}>Böse</option>
        </select></label>
      <p class="small">${game.online && s.pid ? "🌐 Der Spieler sieht seine neue Rolle automatisch auf seinem Handy." : "Zeig dem Spieler seine neue Rolle (Knopf unten) oder gib ihm unter „3 · Verteilen“ einen neuen QR-Code."}</p>
      <div class="row end"><button class="btn" id="showrole">📱 Dem Spieler zeigen</button><button class="btn primary" id="saverole">Speichern</button></div>`);
    $("#showrole").addEventListener("click", () => {
      const r = ROLE_BY_ID[$("#newrole").value];
      openModal(`<div class="nightshow pickshow"><p class="ns-label">${esc(s.name)}</p><h2>Du bist jetzt</h2>
        <div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div></div>
        <div class="row center"><button class="btn big" id="showdone">✓ Fertig</button></div>`, "full night");
      $("#showdone").addEventListener("click", () => { closeModal(); changeRole(i); });
    });
    $("#saverole").addEventListener("click", () => {
      if (s.role !== $("#newrole").value) hist(`🔁 ${s.name}: ${roleName(s.role)} → ${roleName($("#newrole").value)}`);
      s.role = $("#newrole").value;
      s.align = $("#newalign").value || (s.trav ? "g" : undefined);
      game.ignoreEnd = null;
      save(); closeModal(); renderSL();
    });
  }

