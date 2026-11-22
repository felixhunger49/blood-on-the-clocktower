  // =====================================================================
  //  NACHTAKTIONEN AM HANDY (nur online, vom Spielleiter an/aus)
  // =====================================================================
  // n = Anzahl Spieler, min = Mindestzahl, self = darf sich selbst wählen, dead = darf Tote wählen,
  // role = wählt (zusätzlich) eine Rolle ("good" | "all"), mark = Marker, der automatisch gesetzt wird
  // Amnesiker: erprobte geheime Fähigkeiten. like = verhält sich nachts wie diese Rolle (Aufgaben, Infos, Vorschläge).
  // pick = eigene Fähigkeit, bei der er nachts Spieler wählt.
  const AMNESIAC_IDEAS = [
    { k: "a_empath", cat: "Zahl", like: "empath", text: "Jede Nacht erfährst du, wie viele deiner beiden lebenden Nachbarn böse sind." },
    { k: "a_oracle", cat: "Zahl", like: "oracle", text: "Jede Nacht (außer der ersten) erfährst du, wie viele tote Spieler böse sind." },
    { k: "a_chef", cat: "Zahl", like: "chef", text: "Du beginnst mit dem Wissen, wie viele Paare böser Spieler nebeneinander sitzen." },
    { k: "a_clock", cat: "Zahl", like: "clockmaker", text: "Du beginnst mit dem Wissen, wie viele Plätze der Dämon von seinem nächsten Schergen entfernt sitzt." },
    { k: "a_town", cat: "Zahl", text: "Jede Nacht erfährst du, wie viele deiner lebenden Nachbarn Dorfbewohner sind." },
    { k: "a_votes", cat: "Zahl", text: "Jede Nacht erfährst du, wie viele böse Spieler heute abgestimmt haben." },
    { k: "a_flower", cat: "Ja/Nein", like: "flowergirl", text: "Jede Nacht (außer der ersten) erfährst du, ob der Dämon heute abgestimmt hat." },
    { k: "a_crier", cat: "Ja/Nein", like: "towncrier", text: "Jede Nacht (außer der ersten) erfährst du, ob heute ein Scherge nominiert hat." },
    { k: "a_ft", cat: "Ja/Nein", like: "fortuneteller", text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob einer davon der Dämon ist. (Ein Guter gilt als Dämon.)" },
    { k: "a_minion2", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob mindestens einer davon ein Scherge ist." },
    { k: "a_outsider", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du einen Spieler: Du erfährst, ob er ein Außenseiter ist." },
    { k: "a_nominated", cat: "Ja/Nein", pick: true, text: "Jede Nacht wählst du einen Spieler: Du erfährst, ob er heute nominiert hat." },
    { k: "a_exec", cat: "Ja/Nein", text: "Jede Nacht erfährst du, ob der heute Hingerichtete böse war." },
    { k: "a_idiot", cat: "Gesinnung", like: "villageidiot", text: "Jede Nacht wählst du einen Spieler: Du erfährst seine Gesinnung." },
    { k: "a_seam", cat: "Gesinnung", pick: true, text: "Jede Nacht wählst du 2 Spieler: Du erfährst, ob sie die gleiche Gesinnung haben." },
    { k: "a_side", cat: "Richtung", text: "Jede Nacht erfährst du, ob der nächste böse Spieler im oder gegen den Uhrzeigersinn sitzt." },
    { k: "a_under", cat: "Rolle", like: "undertaker", text: "Jede Nacht (außer der ersten) erfährst du die Rolle des heute Hingerichteten." },
    { k: "a_dreamer", cat: "Rolle", like: "dreamer", text: "Jede Nacht wählst du einen Spieler: Du erfährst eine gute und eine böse Rolle – eine davon hat er." },
    { k: "a_wash", cat: "Rolle", like: "washerwoman", text: "Du beginnst mit dem Wissen, dass einer von 2 Spielern eine bestimmte Dorfbewohner-Rolle hat." },
    { k: "a_inv", cat: "Rolle", like: "investigator", text: "Du beginnst mit dem Wissen, dass einer von 2 Spielern eine bestimmte Schergen-Rolle hat." },
    { k: "a_letter", cat: "Rolle", text: "Jede Nacht erfährst du einen Buchstaben aus dem Rollennamen des Dämons." },
    { k: "a_steward", cat: "Spieler", like: "steward", text: "Du beginnst mit dem Wissen, dass ein bestimmter Spieler gut ist." },
    { k: "a_noble", cat: "Spieler", like: "noble", text: "Du beginnst mit 3 Spielern, von denen genau einer böse ist." },
    { k: "a_balloon", cat: "Spieler", like: "balloonist", text: "Jede Nacht erfährst du einen Spieler eines anderen Rollentyps als in der Nacht davor." },
    { k: "a_chamber", cat: "Spieler", like: "chambermaid", text: "Jede Nacht wählst du 2 Spieler (nicht dich): Du erfährst, wie viele davon heute Nacht wegen ihrer Fähigkeit aufgewacht sind." },
    { k: "a_monk", cat: "Schutz", like: "monk", text: "Jede Nacht (außer der ersten) wählst du einen Spieler (nicht dich): Er ist heute Nacht vor dem Dämon geschützt." },
    { k: "a_soldier", cat: "Passiv", like: "soldier", text: "Du bist vor dem Dämon geschützt." },
    { k: "a_raven", cat: "Passiv", like: "ravenkeeper", text: "Stirbst du nachts, wirst du geweckt und erfährst die Rolle eines Spielers deiner Wahl." },
    { k: "a_mayor", cat: "Passiv", like: "mayor", text: "Leben nur noch 3 Spieler und gibt es keine Hinrichtung, gewinnt dein Team. Stirbst du nachts, stirbt vielleicht ein anderer." },
    { k: "a_drunkmin", cat: "Wirkung", pick: true, text: "Jede Nacht wählst du einen Spieler: Ist er ein Scherge, ist er bis zur Dämmerung betrunken." }
  ];
  const amnIdea = k => AMNESIAC_IDEAS.find(x => x.k === k);

  const ACTIONS = {
    fortuneteller: { n: 2, self: true, text: "Wähle zwei Spieler: Ist einer davon der Dämon?" },
    monk: { n: 1, mark: "protect", text: "Wähle einen Spieler, den du heute Nacht beschützt." },
    butler: { n: 1, mark: "master", text: "Wähle deinen Meister für morgen." },
    poisoner: { n: 1, self: true, mark: "poison", text: "Wähle einen Spieler, den du vergiftest." },
    imp: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt (dich selbst = Sternenwechsel)." },
    ravenkeeper: { n: 1, self: true, dead: true, text: "Du bist gestorben: Wähle einen Spieler und erfahre seine Rolle." },
    sailor: { n: 1, self: true, text: "Wähle einen Spieler: Er oder du ist betrunken." },
    chambermaid: { n: 2, text: "Wähle zwei Spieler: Wie viele davon sind heute aufgewacht?" },
    exorcist: { n: 1, mark: "chosen", text: "Wähle einen Spieler (nicht denselben wie letzte Nacht)." },
    innkeeper: { n: 2, self: true, mark: "protect", text: "Wähle zwei Spieler, die heute nicht sterben können." },
    gambler: { n: 1, role: "all", text: "Wähle einen Spieler und rate seine Rolle." },
    courtier: { n: 0, role: "all", optional: true, text: "Willst du eine Rolle betrunken machen? (einmal pro Spiel)" },
    professor: { n: 1, dead: true, onlyDead: true, optional: true, text: "Willst du einen toten Spieler wiederbeleben? (einmal pro Spiel)" },
    devilsadvocate: { n: 1, self: true, mark: "survives", text: "Wähle einen Spieler, der eine Hinrichtung morgen überlebt." },
    assassin: { n: 1, optional: true, text: "Willst du jemanden töten, egal wie geschützt? (einmal pro Spiel)" },
    godfather: { n: 1, optional: true, text: "Ist heute ein Außenseiter gestorben? Dann wähle ein Opfer." },
    zombuul: { n: 1, optional: true, mark: "target", text: "Ist heute niemand gestorben? Dann wähle ein Opfer." },
    pukka: { n: 1, mark: "poison", keep: true, text: "Wähle einen Spieler, den du vergiftest (er stirbt in der nächsten Nacht)." },
    shabaloth: { n: 2, self: true, text: "Wähle zwei Spieler, die sterben." },
    po: { n: 3, min: 0, self: true, text: "Wähle einen Spieler – oder niemanden, um nächste Nacht drei zu töten. (Wenn du letzte Nacht niemanden gewählt hast: bis zu drei.)" },
    lunatic: { n: 1, self: true, text: "Wähle einen Spieler, den du angreifst." },
    dreamer: { n: 1, text: "Wähle einen Spieler und erfahre zwei mögliche Rollen." },
    snakecharmer: { n: 1, text: "Wähle einen Spieler: Ist es der Dämon, tauscht ihr." },
    seamstress: { n: 2, optional: true, text: "Willst du zwei Spieler vergleichen? (einmal pro Spiel)" },
    philosopher: { n: 0, role: "good", optional: true, text: "Willst du eine gute Rolle übernehmen? (einmal pro Spiel)" },
    witch: { n: 1, self: true, mark: "cursed", text: "Wähle einen Spieler, den du verfluchst." },
    cerenovus: { n: 1, self: true, role: "good", text: "Wähle einen Spieler und die Rolle, die er morgen spielen muss." },
    pithag: { n: 1, self: true, role: "all", text: "Wähle einen Spieler und die Rolle, die er werden soll." },
    fanggu: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    vigormortis: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    nodashii: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    vortox: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler, der stirbt." },
    villageidiot: { n: 1, text: "Wähle einen Spieler und erfahre seine Gesinnung." },
    huntsman: { n: 1, optional: true, text: "Willst du jemanden als Jungfer prüfen? (einmal pro Spiel)" },
    nightwatchman: { n: 1, optional: true, text: "Willst du dich jemandem zeigen? (einmal pro Spiel)" },
    preacher: { n: 1, mark: "sermon", text: "Wähle einen Spieler für deine Predigt." },
    lleech: { n: 1, self: true, mark: "target", text: "Wähle einen Spieler (erste Nacht: deinen Wirt)." },
    ojo: { n: 0, role: "all", text: "Wähle eine Rolle: Ihr Besitzer stirbt." },
    alhadikhia: { n: 3, min: 0, self: true, text: "Wähle bis zu drei Spieler." },
    harpy: { n: 2, self: true, text: "Wähle zwei Spieler (der erste muss den zweiten beschuldigen)." },
    fearmonger: { n: 1, mark: "fear", text: "Wähle einen Spieler, den du fürchten lässt." },
    widow: { n: 1, self: true, mark: "poison", keep: true, text: "Wähle einen Spieler, den du vergiftest." },
    ogre: { n: 1, mark: "friend", text: "Wähle einen Spieler, dessen Gesinnung du übernimmst." },
    bureaucrat: { n: 1, mark: "bureau", text: "Wähle einen Spieler: Seine Stimme zählt morgen dreifach." },
    thief: { n: 1, mark: "stolen", text: "Wähle einen Spieler: Seine Stimme zählt morgen negativ." },
    harlot: { n: 1, text: "Wähle einen Spieler, den du besuchst." },
    bonecollector: { n: 1, dead: true, onlyDead: true, optional: true, text: "Willst du einem Toten seine Fähigkeit zurückgeben? (einmal pro Spiel)" },
    lycanthrope: { n: 1, text: "Wähle einen lebenden Spieler." },
    acrobat: { n: 1, text: "Wähle einen Spieler." },
    amnesiac: { n: 2, min: 1, self: true, text: "Deine unbekannte Fähigkeit verlangt eine Wahl: Wähle einen oder zwei Spieler." }
  };
  const nightOn = () => !!((game.online || game.test) && game.nightActions);
  // Kann dieser Platz Aufgaben am Handy bekommen? (verbundenes Handy oder Test-Bot)
  const isBot = x => !!(x && x.pid && String(x.pid).startsWith("bot-"));
  const reachable = x => !!(x && x.pid && (isBot(x) || lobby[x.pid]));
  // Als welche Rolle handelt dieser Spieler? (Säufer/Marionette glauben an ihre Rolle, Philosoph an die gewählte)
  const actingRole = x => gainer(x) && x.gained ? x.gained : x.role === "amnesiac" && x.amn && x.amn.like ? x.amn.like : shownRole(x.role);

  function nightActionsBar(steps) {
    if (!game.online && !game.test) return "";
    if (!game.nightActions) return `<p class="small">📲 Nachtaktionen am Handy sind aus – einschalten unter ⚙️ Einstellungen.</p>`;
    const seq = game.seq && game.seq.night === game.nightNo ? game.seq : null;
    const asks = Object.values(game.asks || {}).filter(a => a.night === game.nightNo);
    let body;
    if (seq && !seq.done) {
      const answered = asks.filter(a => a.done).length;
      const results = (game.acts || []).filter(x => x.night === game.nightNo && x.round === seq.round);
      body = `<div class="seqbox">
        <p><b>Schritt ${seq.count}: ${esc(roleName(seq.step))}</b> · ${answered} von ${asks.length} Handys haben geantwortet</p>
        ${results.length ? `<p class="okmsg">✅ ${results.map(x => `${esc(game.seats[x.i].name)}: ${x.skip ? "nichts" : esc(describePick(x))}`).join(" · ")}</p>` : `<p class="small wait">⏳ warte auf die Wahl …</p>`}
        <p class="small">Werte jetzt diesen Schritt aus und schick nötige Infos (Knopf „📱 Info“ in der Liste). Dann weiter.</p>
        <div class="row wrap"><button class="btn primary" id="seqnext">▶ Nächster Schritt</button><button class="btn" id="seqstop">⏹ Beenden</button></div>
      </div>`;
    } else {
      const real = asks.filter(a => !a.sleep);
      body = `${seq && seq.done ? `<p class="okmsg">✅ Alle Schritte dieser Nacht sind durch.</p>` : ""}
      <div class="row wrap">
        <button class="btn primary" id="naall">🌙 Alle auf einmal</button>
        <button class="btn" id="naseq">🪜 Schritt für Schritt</button>
        <button class="btn" id="natable">🪑 Wie am Tisch</button>
        ${asks.length && !seq ? `<span class="small">${real.filter(a => a.done).length} von ${real.length} Aktionen beantwortet</span>` : ""}
      </div>
      <details class="small nahelp"><summary>ⓘ Was bedeuten die drei Varianten?</summary><p><b>Alle auf einmal:</b> schnell – alle wählen gleichzeitig, du wertest danach in der Reihenfolge der Liste aus.<br>
      <b>Schritt für Schritt:</b> regelgenau – bei jedem Schritt der Nachtreihenfolge sind alle Handys dran; nur wer wirklich dran ist, bekommt die echte Aufgabe.<br>
      <b>Wie am Tisch:</b> alle Handys schlafen ein, du weckst jeden Spieler einzeln mit 👁️ und zeigst ihm seine Info groß auf seinem Handy.</p></details>`;
    }
    if (tableOn()) {
      const ps = game.seats.filter(x => reachable(x));
      body = `<div class="seqbox">
        <p><b>🪑 Wie am Tisch</b> · 😴 ${ps.length} Handy(s) schlafen</p>
        <p class="small">Geh die Liste von oben nach unten durch: <b>👁️ Wecken</b> bei Rollen mit Aktion, <b>👁️ Wecken &amp; zeigen</b> bei Rollen mit Info. Der Spieler sieht nur seine eigene Aufgabe und schläft danach wieder ein.</p>
        <div class="row wrap"><button class="btn primary" id="tabledawn">☀️ Morgen verkünden</button><button class="btn" id="tablestop">⏹ Abbrechen</button></div>
      </div>`;
    }
    return `<div class="box nabar">
      <label class="switch"><input type="checkbox" id="natoggle" checked><span><b>📲 Nachtaktionen am Handy</b> sind an. Spieler ohne Aufgabe bekommen eine Schein-Auswahl, damit niemand auffällt.</span></label>
      ${body}
    </div>`;
  }

  // „Wie am Tisch“ läuft in dieser Nacht
  const tableOn = () => !!((game.online || game.test) && game.nightActions && game.tableNight && game.tableNight === game.nightNo);

  function wakeStatusHtml(stepId) {
    const rows = stepHolders(stepId).filter(([x]) => ACTS_WHEN_DEAD.includes(stepId) ? deathTriggered(x, stepId) : x.alive && !killedBefore(x, stepId));
    return rows.length ? `<div class="actstat">${rows.map(([x, i]) => {
      const w = (game.wakes || {})[i];
      const st = !reachable(x) ? `<span class="small">nicht online – bitte wie gewohnt wecken</span>`
        : !w || w.night !== game.nightNo ? `<span class="small">schläft</span>`
        : w.done ? `<span class="okmsg">✅ hat die Info gesehen</span>` : `<span class="wait">👁️ ist wach …</span>`;
      return `<div class="actrow"><b>${esc(x.name)}:</b> ${st}</div>`;
    }).join("")}</div>` : "";
  }

  // Morgen: Nacht beenden, Tag beginnen, Tote der Nacht verkünden
  // ---------- Morgen: Wer stirbt durch den Dämon? ----------
  const KILL_STEPS = ["imp", "fanggu", "vigormortis", "nodashii", "vortox", "zombuul", "shabaloth", "po", "assassin", "godfather", "lleech", "yaggababble", "ojo"];
  // Philosoph und Kannibale können die Fähigkeit einer anderen Rolle haben (x.gained)
  const gainer = x => !!x && (x.role === "philosopher" || x.role === "cannibal");
  const impaired = x => { const m = x.marks || []; return m.includes("poison") || m.includes("drunk") || x.role === "drunk"; };
  // Rollen, die ihren eigenen Tod verhindern oder vortäuschen (für Nacht UND Hinrichtung).
  // Gibt null zurück, wenn nichts Besonderes passiert.
  // Lebende Nachbarn eines Platzes (Tote werden übersprungen)
  function teaNeighbours(i) {
    const S = game.seats, N = S.length, out = [];
    for (const d of [-1, 1]) for (let k = 1; k < N; k++) { const j = (i + d * k + N * N) % N; if (j !== i && (S[j].alive || S[j].zfake)) { out.push(j); break; } }
    return out;
  }
  // Teedame: Sind ihre beiden lebenden Nachbarn gut, können sie nicht sterben
  function teaProtects(x) {
    const S = game.seats, k = S.indexOf(x);
    return S.some((t, i) => t.role === "tealady" && t.alive && !impaired(t) && (() => { const nb = teaNeighbours(i); return nb.length === 2 && nb.includes(k) && nb.every(j => seatGood(S[j])); })());
  }
  function deathRule(x) {
    if (teaProtects(x)) return { dies: false, why: "🫖 Teedame – ihre beiden guten Nachbarn können nicht sterben" };
    if (impaired(x)) return null;
    if (x.role === "sailor") return { dies: false, why: "⚓ Seemann – kann nicht sterben, solange er nüchtern ist" };
    if (x.role === "vizier" && game.phase === "day") return { dies: false, why: "👳 Wesir – kann tagsüber nicht sterben" };
    if (hbHas(x.role, "unkillable")) return { dies: false, why: `🛡️ ${roleName(x.role)} – kann nicht sterben, solange nüchtern` };
    if (hbHas(x.role, "fool") && !x.used) return { dies: false, fool: true, why: `🃏 ${roleName(x.role)} – erster Tod wird verhindert` };
    if (x.role === "fool" && !x.used) return { dies: false, fool: true, why: "🃏 Narr – sein erster Tod wird verhindert (Fähigkeit danach verbraucht)" };
    if (x.role === "zombuul" && !x.zfake) return { dies: true, zombuul: true, why: "🧟 Zombuul – erster Tod: gilt als tot, lebt aber heimlich weiter" };
    return null;
  }
  // Scharlachrote Frau: Stirbt der Dämon bei 5+ Lebenden (vor dem Tod gezählt, ohne Reisende),
  // wird sie der Dämon – aber nicht, wenn sie vergiftet oder betrunken ist.
  // Tollpatsch: Stirbt er (und ist gesund), muss er öffentlich einen lebenden Spieler wählen.
  // Stirbt die Witwe, endet ihr Gift
  function widowCheck(x) {
    if (!x || x.alive || x.role !== "widow") return;
    game.seats.forEach(y => {
      if (!y.widowPoison) return;
      delete y.widowPoison;
      y.marks = (y.marks || []).filter(m => m !== "poison"); y.keep = (y.keep || []).filter(m => m !== "poison");
      hist(`💧 Die Witwe ist tot – ${y.name} ist nicht mehr vergiftet`);
    });
  }
  function klutzCheck(x) {
    if (!x || x.alive || x.zfake || x.role !== "klutz") return;
    game.klutzPending = game.seats.indexOf(x);
    game.klutzWeak = impaired(x);
  }
  function klutzPopup() {
    const i = game.klutzPending;
    if (i === undefined || i === null || !modal.classList.contains("hidden")) return false;
    const x = game.seats[i];
    if (!x || x.alive) { game.klutzPending = null; return false; }
    const alive = game.seats.map((y, k) => k).filter(k => game.seats[k].alive);
    if (!alive.length) { game.klutzPending = null; return false; }
    const botPick = isBot(x) ? alive[randInt(alive.length)] : null;
    openModal(`<h2>🍌 ${esc(x.name)} ist der Tollpatsch</h2>
      <p>Er ist gestorben und muss jetzt <b>öffentlich</b> einen lebenden Spieler wählen. Ist der Gewählte böse, verliert Gut sofort.</p>
      ${game.klutzWeak ? `<p class="warnmsg">⚠️ Nur für dich: Er ist vergiftet/betrunken – lass ihn trotzdem wählen, aber egal wen er wählt, es passiert nichts.</p>` : ""}
      ${botPick !== null ? `<p class="okmsg">🤖 ${esc(x.name)} wählt: <b>${esc(game.seats[botPick].name)}</b></p>` : `<p class="small">Tippe an, wen er wählt:</p>`}
      <div class="infopick">${alive.map(k => `<button class="btn pickbtn sm ${k === botPick ? "primary" : ""}" data-klutz="${k}">${esc(game.seats[k].name)}</button>`).join("")}</div>
      <div id="klutzres"></div>`);
    const choose = k => {
      const t = game.seats[k], evil = !seatGood(t) && !game.klutzWeak;
      const healthy = !impaired(t);
      const hint = t.role === "spy" && healthy ? "🕵️ Spion (gesund): du darfst ihn als gut werten."
        : t.role === "recluse" && healthy ? "🏚️ Einsiedler (gesund): du darfst ihn als böse werten." : "";
      $("#klutzres").innerHTML = `<div class="box">${esc(t.name)} ist <b>${seatGood(t) ? "gut" : "böse"}</b> (${esc(roleName(t.role))}).${game.klutzWeak ? " Wegen Gift/Trunkenheit ohne Wirkung." : ""}
        ${hint ? `<br><span class="mismsg">${esc(hint)}</span>` : ""}
        <div class="row wrap"><button class="btn ${evil ? "primary" : ""}" id="klutzevil">😈 Zählt als böse – Gut verliert</button>
        <button class="btn ${evil ? "" : "primary"}" id="klutzgood">😇 Zählt als gut – weiter</button></div></div>`;
      const done = lose => {
        game.klutzPending = null;
        hist(`🍌 ${x.name} (Tollpatsch) wählt ${t.name} – ${lose ? "böse, Gut verliert" : game.klutzWeak ? "ohne Wirkung (vergiftet/betrunken)" : "gut, das Spiel geht weiter"}`);
        if (game.klutzWeak && !seatGood(t)) abn(x, "Tollpatsch wählt Böse, ist aber vergiftet – keine Wirkung");
        if (lose) { game.klutzLoss = { by: x.name, pick: t.name }; game.ignoreEnd = null; game.endPopped = null; }
        save(); closeModal(); renderSL();
      };
      $("#klutzevil").addEventListener("click", () => done(true));
      $("#klutzgood").addEventListener("click", () => done(false));
    };
    $$("[data-klutz]").forEach(b => b.addEventListener("click", () => choose(+b.dataset.klutz)));
    if (botPick !== null) choose(botPick);
    return true;
  }

  let swMsg = null;
  function swCheck(x) {
    swMsg = null;
    klutzCheck(x);
    widowCheck(x);
    if (!x || x.alive || x.zfake || ROLE_BY_ID[x.role].t !== "demon") return;
    const S = game.seats;
    const sw = S.find(y => y.role === "scarletwoman" && y.alive);
    if (!sw) return;
    const before = S.filter(y => y.alive && !y.trav).length + (x.trav ? 0 : 1);
    if (before < 5) { hist(`💋 Nur ${before} Spieler lebten – die Scharlachrote Frau übernimmt nicht`); return; }
    if (impaired(sw)) {
      hist(`💋 ${sw.name} (Scharlachrote Frau) ist vergiftet/betrunken – übernimmt nicht`);
      toast(swMsg = `💋 ${sw.name} ist vergiftet/betrunken – sie wird NICHT zum Dämon`);
      return;
    }
    sw.swFrom = { seat: S.indexOf(x) };
    sw.role = x.role;
    sw.swPending = true;
    sw.marks = [...new Set([...(sw.marks || []), "isdemon"])];
    hist(`💋 ${sw.name} (Scharlachrote Frau) ist jetzt der Dämon: ${roleName(x.role)}`);
    toast(swMsg = `💋 ${sw.name} wird zum ${roleName(x.role)} – zeig es ihr heute Nacht`);
  }
  // Wird der Dämon wiederbelebt / Hinrichtung rückgängig: Übernahme zurücknehmen
  function swRevert(i) {
    game.seats.forEach(y => {
      if (!y.swFrom || y.swFrom.seat !== i) return;
      y.role = "scarletwoman"; y.swPending = false; delete y.swFrom;
      y.marks = (y.marks || []).filter(m => m !== "isdemon");
      hist(`↩︎ ${y.name} ist wieder die Scharlachrote Frau`);
    });
  }

  // Tod anwenden (inkl. Narr verbraucht / Zombuul scheintot)
  function applyDeath(x, rule) {
    if (rule && rule.fool) { x.used = true; hist(`🃏 ${x.name} (Narr) überlebt seinen ersten Tod`); return; }
    if (rule && rule.dies === false) { hist(`🛡️ ${x.name} überlebt (${rule.why})`); return; }
    if (rule && rule.zombuul) { x.zfake = true; x.alive = false; histDeath(x); hist(`🧟 ${x.name} (Zombuul) wirkt tot, lebt aber weiter`); return; }
    if (!x.alive && x.zfake) { x.zfake = false; hist(`🧟 ${x.name} (Zombuul) stirbt jetzt wirklich`); swCheck(x); return; }
    x.alive = false; histDeath(x);
    swCheck(x);
  }

  // Po: Hat er in der letzten Nacht (ab Nacht 2) niemanden gewählt, darf er heute 3 Spieler wählen
  function poCharged(n) {
    if (n <= 2) return false;
    const a = (game.acts || []).find(q => q.night === n - 1 && q.step === "po" && !q.undone);
    return !!a && (a.skip || !(a.picks || []).length);
  }
  function nightKills() {
    const S = game.seats, n = game.nightNo;
    const attacks = new Map(); // Ziel -> Angreifer
    (game.acts || []).filter(a => a.night === n && !a.skip && !a.undone && !a.fake && !(S[a.i] && S[a.i].role === "lunatic") && KILL_STEPS.includes(a.step) && !(a.step === "lleech" && n === 1))
      .forEach(a => (a.step === "po" && !poCharged(n) ? (a.picks || []).slice(0, 1)
        : a.step === "ojo" ? (S.some(y => y.role === a.role && y.alive) ? S.map((y, k) => k).filter(k => S[k].role === a.role && S[k].alive) : (a.picks || []))
        : (a.picks || [])).forEach(k => { if (!attacks.has(k)) attacks.set(k, { step: a.step, by: a.i }); }));
    S.forEach((x, k) => { if ((x.marks || []).includes("target") && !attacks.has(k)) attacks.set(k, { step: null, by: null }); });
    // Pukka: Wer seit einer früheren Nacht vergiftet ist, stirbt jetzt
    const pukka = S.findIndex(y => y.role === "pukka" && (y.alive || y.zfake));
    S.forEach((x, k) => { if (x.pukkaNight && x.pukkaNight < n && x.alive && !attacks.has(k)) attacks.set(k, { step: "pukka", by: pukka >= 0 ? pukka : null }); });
    // Lykanthrop: tötet einen Guten – dann tötet der Dämon heute nicht
    let lycHit = false;
    (game.acts || []).filter(a => a.night === n && a.step === "lycanthrope" && !a.skip && !a.undone && S[a.i] && S[a.i].role === "lycanthrope" && !impaired(S[a.i])).forEach(a => {
      const k = a.picks[0], t = S[k];
      if (t && t.alive && seatGood(t)) { lycHit = true; attacks.set(k, { step: "lycanthrope", by: a.i, hbkill: true, front: true }); }
    });
    // Akrobat: Ist sein gewählter Spieler heute betrunken/vergiftet, stirbt der Akrobat
    (game.acts || []).filter(a => a.night === n && a.step === "acrobat" && !a.skip && !a.undone && S[a.i] && S[a.i].role === "acrobat" && S[a.i].alive && !impaired(S[a.i])).forEach(a => {
      const t = S[a.picks[0]];
      if (t && impaired(t) && !attacks.has(a.i)) attacks.set(a.i, { step: "acrobat", by: a.i, hbkill: true, acro: t.name });
    });
    // Spieler: Rät er falsch, stirbt er (nicht in der ersten Nacht)
    if (n > 1) (game.acts || []).filter(a => a.night === n && a.step === "gambler" && !a.skip && !a.undone && S[a.i] && actingRole(S[a.i]) === "gambler" && !impaired(S[a.i])).forEach(a => {
      const t = S[(a.picks || [])[0]];
      if (t && a.role && t.role !== a.role && !attacks.has(a.i)) attacks.set(a.i, { step: "gambler", by: a.i, hbkill: true, gamble: `🎲 Spieler hat falsch geraten (${t.name} ist nicht ${roleName(a.role)}) – stirbt${["spy", "recluse"].includes(t.role) ? " (Spion/Einsiedler darf auch als richtig gelten)" : ""}` });
    });
    // Mondkind: Der gewählte Spieler stirbt heute Nacht, wenn er gut ist
    if (game.moonKill && game.moonKill.night === n && S[game.moonKill.k] && !attacks.has(game.moonKill.k)) attacks.set(game.moonKill.k, { step: "moonchild", by: null, hbkill: true, gamble: "🌙 Vom Mondkind gewählt und gut – stirbt" });
    // Klatschtante: War ihre Behauptung wahr, stirbt ein Spieler deiner Wahl
    (game.acts || []).filter(a => a.night === n && a.step === "gossip" && !a.skip && !a.undone).forEach(a => (a.picks || []).forEach(k => { if (!attacks.has(k)) attacks.set(k, { step: "gossip", by: null, hbkill: true, gamble: "🗣️ Die Behauptung der Klatschtante war wahr – stirbt" }); }));
    // Homebrew-Rollen mit dem Baustein „stirbt“
    (game.acts || []).filter(a => a.night === n && !a.skip && !a.undone && !a.fake && ROLE_BY_ID[a.step] && hbHas(a.step, "kill", "kill_evil", "kill_minion"))
      .forEach(a => (a.picks || []).forEach(k => {
        const fx = hbFind(a.step, ["kill", "kill_evil", "kill_minion"]), t = S[k];
        if (!t || (fx === "kill_evil" && seatGood(t)) || (fx === "kill_minion" && ROLE_BY_ID[t.role].t !== "minion")) return;
        if (!attacks.has(k)) attacks.set(k, { step: a.step, by: a.i, hbkill: true });
      }));
    const out = [];
    attacks.forEach((at, k) => {
      const x = S[k];
      if (!x || !x.alive) return;
      const attacker = at.by !== null ? S[at.by] : S.find(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
      const m = x.marks || [];
      const strong = at.step === "assassin" || !!at.hbkill;
      let jump = null;
      const demonAtt = !at.hbkill && at.step !== "assassin" && (!at.step || (ROLE_BY_ID[at.step] && ROLE_BY_ID[at.step].t === "demon"));
      let dies = true, why = at.step === "pukka" && x.pukkaNight && x.pukkaNight < n ? `stirbt durch die Pukka (vergiftet seit Nacht ${x.pukkaNight}) – danach wieder gesund` : `angegriffen${at.step ? ` (${roleName(at.step)})` : ""}`;
      if (at.acro) why = `🤸 Akrobat: Sein gewählter Spieler ${at.acro} ist betrunken/vergiftet – der Akrobat stirbt`;
      if (at.gamble) why = at.gamble;
      const exoAct = (game.acts || []).find(a => a.night === n && a.step === "exorcist" && !a.skip && !a.undone && S[a.i] && S[a.i].role === "exorcist" && !impaired(S[a.i]));
      if (demonAtt && game.princessBlock === n) { dies = false; why = "👸 Prinzessin: Der Dämon tötet heute Nacht nicht"; }
      else if (demonAtt && attacker && exoAct && S[(exoAct.picks || [])[0]] === attacker) { dies = false; why = `✝️ Der Exorzist hat den Dämon gewählt – ${roleName(attacker.role)} tötet heute Nacht nicht`; }
      else if (demonAtt && lycHit) { dies = false; why = "🐺 Der Lykanthrop hat einen Guten getötet – der Dämon tötet heute Nacht nicht"; }
      else if (at.acro || at.step === "gambler") { /* stirbt durch die eigene Fähigkeit, kein Schutz */ }
      else if (at.step === "assassin" && !(attacker && impaired(attacker))) { /* Attentäter: stirbt, auch wenn er eigentlich nicht könnte */ }
      else if (attacker && impaired(attacker)) { dies = false; why = `${attacker.name} ist vergiftet/betrunken – der Angriff wirkt nicht`; }
      else if (!strong && m.includes("protect")) { dies = false; why = "🛡️ geschützt – überlebt"; }
      else if (!strong && x.role === "soldier" && !impaired(x)) { dies = false; why = "🛡️ Soldat – der Dämon kann ihn nicht töten"; }
      else if (!strong && hbHas(x.role, "immune") && !impaired(x)) { dies = false; why = `🛡️ ${roleName(x.role)} – der Dämon kann ihn nicht töten`; }
      else if (!strong && m.includes("cantdie")) { dies = false; why = "🫖 Teedame – kann nicht sterben"; }
      else if (deathRule(x)) { const r = deathRule(x); dies = r.dies; why = r.why; }
      else if (at.by === k && x.role !== "imp") why = `${roleName(x.role)} hat sich selbst gewählt und stirbt (nur der Imp kann einen Sternenwechsel machen)`;
      else if (at.step === "fanggu" && at.by !== null && at.by !== k && !game.fgJumped && ROLE_BY_ID[x.role].t === "outsider") {
        why = `🦇 Fang Gu springt: ${x.name} (Außenseiter) wird der neue Fang Gu (böse) – der alte Fang Gu ${S[at.by].name} stirbt stattdessen`;
        dies = false; jump = at.by;
      }
      else if (at.by === k) {
        const sw = S.find(y => y.role === "scarletwoman" && y.alive && !impaired(y));
        why = sw && S.filter(y => y.alive && !y.trav).length >= 5
          ? `Dämon hat sich selbst gewählt – Sternenwechsel: ${sw.name} (Scharlachrote Frau) wird automatisch der neue Dämon`
          : "Dämon hat sich selbst gewählt – Sternenwechsel: Du wählst gleich, welcher Scherge der neue Dämon wird";
      }
      else if (x.role === "mayor" && !impaired(x)) why = "Bürgermeister: Du darfst den Tod auf einen anderen Spieler umlenken (dann hier abwählen und den anderen tot setzen)";
      out.push({ k, dies, why, step: at.step || (attacker ? attacker.role : null), self: at.by === k, jump });
    });
    return out;
  }
  // Hat der Dämon gerade einen Rabenhüter (oder Weisen) getötet? Dann sofort dessen Handy fragen.
  function wakeDeathTriggered() {
    if (!nightOn() || (game.seq && game.seq.night === game.nightNo && !game.seq.done)) return;
    ["ravenkeeper", "sage"].forEach(id => {
      stepHolders(id).forEach(([x, i]) => {
        if (!deathTriggered(x, id) || lastAct(i, id)) return;
        const a = (game.asks || {})[i];
        if (a && a.night === game.nightNo && a.step === id && !a.done) return;
        if (!ACTIONS[id] || !reachable(x)) { toast(`🪶 ${x.name} (${roleName(id)}) wurde getötet – jetzt wecken!`); return; }
        askSeat(i, false, id);
        toast(`🪶 ${x.name} (${roleName(id)}) wurde getötet – sein Handy fragt jetzt nach seiner Wahl`);
      });
    });
    save(); refreshHostView();
  }

  // Sternenwechsel: Der Dämon hat sich selbst getötet -> ein Scherge wird der neue Dämon
  function starpassDialog(dead) {
    const S = game.seats;
    if (S.some(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon")) return false; // z. B. Scharlachrote Frau hat übernommen
    const mins = S.map((y, i) => i).filter(i => S[i].alive && ROLE_BY_ID[S[i].role].t === "minion");
    if (!mins.length) return false;
    openModal(`<h2>⭐ Sternenwechsel</h2>
      <p>${esc(dead.name)} (${esc(roleName(dead.role))}) hat sich selbst getötet. Ein lebender Scherge wird jetzt der neue ${esc(roleName(dead.role))}.</p>
      <p class="small">Wecke ihn noch in dieser Nacht und zeige „Du bist“ + ${esc(roleName(dead.role))}. Im Online-Spiel sieht er die neue Rolle sofort auf seinem Handy.</p>
      <div class="infopick">${mins.map(i => `<button class="btn pickbtn" data-star="${i}">${esc(S[i].name)} <small>(${esc(roleName(S[i].role))})</small></button>`).join("")}</div>`);
    $$("[data-star]").forEach(b => b.addEventListener("click", () => {
      const m = S[+b.dataset.star];
      hist(`⭐ Sternenwechsel: ${m.name} (${roleName(m.role)}) ist jetzt ${roleName(dead.role)}`, "night");
      m.role = dead.role; delete m.align;
      m.marks = [...new Set([...(m.marks || []), "isdemon"])];
      game.ignoreEnd = null; game.endPopped = null;
      save(); closeModal(); startDay();
      toast(`⭐ ${m.name} ist jetzt ${roleName(dead.role)}${reachable(m) ? " – sieht es auf dem Handy" : " – zeig es ihm"}`);
    }));
    return true;
  }

  function gameTransfer() {
    const json = JSON.stringify({ app: "botc-grimoire", v: 1, at: new Date().toISOString(), game });
    openModal(`<h2>💾 Spielstand</h2>
      <p class="small">Sichern, um später weiterzumachen – oder auf ein anderes Handy übertragen (z. B. wenn dein Akku leer ist).</p>
      <div class="row wrap"><button class="btn primary" id="gsdl">💾 Als Datei sichern</button><button class="btn" id="gscopy">📋 Kopieren</button></div>
      <h4>📂 Spielstand laden</h4>
      <input type="file" id="gsfile" accept=".json,application/json,text/plain">
      <textarea id="gstext" rows="3" placeholder="…oder hier einfügen"></textarea>
      <div class="row end"><button class="btn" id="gsload">Laden</button></div>
      <p class="small">Online-Räume lassen sich nicht auf ein anderes Handy mitnehmen: Dort geht das Spiel offline weiter – starte einen neuen Raum, die Spieler treten bei und du ordnest sie unter „3 · Verteilen“ wieder ihren Plätzen zu.</p>`);
    $("#gsdl").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = `clocktower-spielstand-nacht${game.nightNo}.json`;
      document.body.appendChild(a); a.click(); a.remove();
    });
    $("#gscopy").addEventListener("click", () => { (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => toast("📋 Spielstand kopiert"), () => toast("Kopieren nicht möglich – nimm „Als Datei sichern“")); });
    $("#gsfile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("#gstext").value = rd.result; }; rd.readAsText(f); });
    $("#gsload").addEventListener("click", () => {
      let d; try { d = JSON.parse($("#gstext").value); } catch (e) { toast("Das ist kein gültiger Spielstand."); return; }
      const g = d && d.game;
      if (!g || !Array.isArray(g.seats)) { toast("Das ist kein gültiger Spielstand."); return; }
      if (!confirm("Aktuelles Spiel durch diesen Spielstand ersetzen? (Mit ↩️ Rückgängig kommst du zurück.)")) return;
      save();
      if (g.online && !(game.online && game.online.code === g.online.code)) { g.online = null; g.seats.forEach(x => { x.pid = null; }); g.pids = []; }
      game = g; registerHomebrew(game.homebrew);
      save(); closeModal(); renderSL();
      toast(`📂 Spielstand geladen – Nacht ${game.nightNo}, ${game.seats.length} Spieler`);
    });
  }
  function nightSummaryHtml() {
    const n = game.nightNo;
    const ev = (game.history || []).filter(h => h.n === n && h.ph === "night" && !/^🌙 Nacht \d+ beginnt/.test(h.t));
    const waiting = Object.entries(game.asks || {}).filter(([, a]) => a.night === n && !a.done && !a.sleep).map(([i, a]) => `${game.seats[i].name} (${roleName(a.step)})`);
    const marks = game.seats.filter(x => (x.marks || []).some(m => ["poison", "drunk", "protect", "target"].includes(m))).map(x => `${esc(x.name)} ${(x.marks || []).filter(m => ["poison", "drunk", "protect", "target"].includes(m)).map(m => (markerByKey(m) || {}).i).join("")}`);
    return `<div class="box nightsum">
      ${ev.length ? `<ul>${ev.map(h => `<li>${esc(h.t)}</li>`).join("")}</ul>` : `<p class="small">Noch nichts passiert.</p>`}
      ${marks.length ? `<p class="small"><b>Marker jetzt:</b> ${marks.join(" · ")}</p>` : ""}
      ${waiting.length ? `<p class="warnmsg">⏳ Wartet noch: ${waiting.map(esc).join(", ")}</p>` : ""}</div>`;
  }
  function dawnDialog() {
    const kills = nightKills();
    if (!kills.length) return startDay();
    const missed = kills.filter(x => x.dies && game.seats[x.k].role === "ravenkeeper" && !lastAct(x.k, "ravenkeeper") && !((game.done[game.nightNo] || []).includes("ravenkeeper")));
    openModal(`<h2>☀️ Wer stirbt heute Nacht?</h2>
      <details class="nightsumwrap"><summary>📋 Was heute Nacht passiert ist</summary>${nightSummaryHtml()}</details>
      ${missed.map(x => `<p class="warnmsg">🪶 ${esc(game.seats[x.k].name)} ist der Rabenhüter und stirbt – er wurde noch nicht geweckt! Tippe „Zurück“ und wecke ihn zuerst (Schritt Rabenhüter).</p>`).join("")}
      <p class="small">So sieht es nach den Regeln aus. Ändere den Haken nur, wenn die App etwas nicht weiß: ein fehlender Marker (z. B. Mönch-Schutz vergessen), eine Rolle wie Narr oder Seemann, die den Tod verhindert, oder wenn du beim Bürgermeister den Tod umlenkst.</p>
      <div class="dawnlist">${kills.map(x => `<label class="switch"><input type="checkbox" data-kill="${x.k}" ${x.dies ? "checked" : ""}>
        <span><b>${esc(game.seats[x.k].name)}</b> <span class="small">(${esc(roleName(game.seats[x.k].role))})</span><br><span class="small">${esc(x.why)}</span></span></label>`).join("")}</div>
      <div class="row end"><button class="btn" id="dawnback">Zurück</button><button class="btn primary" id="dawnok">☀️ Morgen verkünden</button></div>`);
    $("#dawnback").addEventListener("click", closeModal);
    $("#dawnok").addEventListener("click", () => {
      $$("[data-kill]").forEach(c => {
        const x = game.seats[+c.dataset.kill], rule = deathRule(x);
        if (rule && rule.fool) { if (!c.checked) applyDeath(x, rule); else { x.alive = false; histDeath(x); swCheck(x); } return; }
        if (c.checked && x.alive) {
          applyDeath(x, rule && rule.zombuul ? rule : null);
          const kk = kills.find(e => e.k === +c.dataset.kill);
          if (!x.alive && x.role === "banshee" && !impaired(x) && kk && kk.step && ROLE_BY_ID[kk.step] && ROLE_BY_ID[kk.step].t === "demon") {
            x.banshee = true;
            hist(`😱 ${x.name} war die Banshee und wurde vom Dämon getötet – verkünde es allen! Sie darf ab jetzt 2× nominieren und 2× abstimmen.`, "night");
            setTimeout(() => toast(`😱 Verkünde: ${x.name} war die Banshee und wurde vom Dämon getötet!`), 600);
          }
        }
      });
      // Pukka-Opfer sind danach wieder gesund (ob gestorben oder geschützt)
      kills.filter(x => x.step === "pukka").forEach(x => {
        const y = game.seats[x.k];
        if (!y.pukkaNight || y.pukkaNight >= game.nightNo) return;
        delete y.pukkaNight;
        y.marks = (y.marks || []).filter(m => m !== "poison"); y.keep = (y.keep || []).filter(m => m !== "poison");
        hist(`💧 ${y.name} ist nach der Pukka wieder gesund`, "night");
      });
      closeModal();
      // Fang Gu springt in einen Außenseiter
      kills.filter(x => x.jump !== null && x.jump !== undefined).forEach(x => {
        const t = game.seats[x.k], old = game.seats[x.jump];
        if (!t.alive || !old) return;
        game.fgJumped = true;
        hist(`🦇 Der Fang Gu springt: ${t.name} (${roleName(t.role)}) ist jetzt der Fang Gu`, "night");
        t.role = "fanggu"; delete t.align;
        t.marks = [...new Set([...(t.marks || []), "jumped"])];
        applyDeath(old, null);
        game.ignoreEnd = null; game.endPopped = null;
        toast(`🦇 ${t.name} ist jetzt der Fang Gu – wecke ihn und zeig es ihm${reachable(t) ? " (steht auf seinem Handy)" : ""}`);
      });
      const self = kills.find(x => x.self && !game.seats[x.k].alive && game.seats[x.k].role === "imp");
      if (!self || !starpassDialog(game.seats[self.k])) startDay();
    });
  }

  function startDay() {
    const n = game.nightNo;
    game.lastDawnAt = Date.now();
    const dead = [], back = [];
    (game.history || []).filter(h => h.n === n && h.ph === "night").forEach(h => {
      if (h.dead && !dead.includes(h.dead)) dead.push(h.dead);
      if (h.alive) { const k = dead.indexOf(h.alive); if (k >= 0) dead.splice(k, 1); }
    });
    const died = dead.filter(name => game.seats.some(x => x.name === name && !x.alive));
    game.phase = "day";
    game.tableNight = null;
    game.asks = {};
    game.wakes = {};
    game.dawn = { n, died };
    hist(`☀️ Tag ${n} beginnt – ${died.length ? "gestorben: " + died.join(", ") : "niemand ist gestorben"}`, "day");
    save(); renderSL();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(died.length ? `Morgen: ${died.join(", ")} ist gestorben` : "Morgen: Niemand ist gestorben");
  }

  // Letztes Ergebnis eines Spielers für einen Schritt in dieser Nacht
  const lastAct = (i, step) => (game.acts || []).filter(x => x.night === game.nightNo && x.i === i && x.step === step).pop();

