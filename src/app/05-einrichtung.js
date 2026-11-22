  function renderSL() {
    const stepper = `<div class="stepper">${STEPS.map(([k, l]) =>
      `<button class="step ${game.step === k ? "active" : ""}" data-step="${k}">${l}</button>`).join("")}</div>`;
    let body = "";
    if (game.step === "setup") body = slSetup();
    else if (game.step === "roles") body = slRoles();
    else if (game.step === "assign") body = slAssign();
    else body = slGrim();
    view.innerHTML = stepper + body;
    $$(".step").forEach(b => b.addEventListener("click", () => goStep(b.dataset.step)));
    bindSL();
    if (typeof applyPhase === "function") applyPhase();
    if (game.step !== "grim" || !klutzPopup()) endPopup();
  }

  // Spielende sofort als Fenster melden (das Banner oben sieht man beim Scrollen leicht nicht)
  function endPopup() {
    if (game.step !== "grim" || game.winner || !modal.classList.contains("hidden")) return;
    const end = detectEnd(), key = aliveKey();
    if (!end || game.ignoreEnd === key || game.endPopped === key) return;
    game.endPopped = key; save();
    openModal(`<div class="center"><div style="font-size:3rem">${end.winner === "good" ? "😇" : "😈"}</div>
      <h2>🏁 ${end.winner === "good" ? "Gut gewinnt!" : "Böse gewinnt!"}</h2>
      <p>${esc(end.reason)}</p>
      ${end.warn.map(w => `<p class="warnmsg">⚠️ ${esc(w)}</p>`).join("")}
      <div class="row center wrap"><button class="btn primary" id="popwin">🏆 Sieg verkünden</button><button class="btn" id="popgo">Spiel geht weiter</button></div></div>`);
    $("#popwin").addEventListener("click", () => { closeModal(); const b = $(".endbanner [data-win]"); if (b) b.click(); });
    $("#popgo").addEventListener("click", () => { closeModal(); const b = $("#ignoreend"); if (b) b.click(); });
  }

  function goStep(step) {
    if ((step === "assign" || step === "grim") && game.selected.length !== game.count) {
      if (!game.selected.length) autoPick();
      else { toast(`Bitte genau ${game.count} Rollen wählen.`); step = "roles"; }
    }
    if ((step === "assign" || step === "grim") && game.selected.length === game.count) {
      const key = game.selected.slice().sort().join(",") + "|" + game.count;
      if (game.assignedKey !== key) { refreshHidden(); assignSeats(); }
    }
    game.step = step;
    save();
    renderSL();
    window.scrollTo(0, 0);
  }

  function slSetup() {
    const nm = [];
    for (let i = 0; i < game.count; i++) nm.push(`<input class="name" data-i="${i}" placeholder="Spieler ${i + 1}" value="${esc(game.names[i] || "")}">`);
    return `
      <section class="panel">
        <h2>Neues Spiel</h2>
        <h3>Edition</h3>
        <div class="chips">${PLAYABLE.map(k =>
          `<button class="chip ${game.edition === k ? "on" : ""}" data-ed="${k}">${EDITIONS[k].name}</button>`).join("")}</div>
        <p class="small">${esc(EDITIONS[game.edition].desc)}</p>
        ${game.edition === "custom" ? scriptSummary() : ""}
        <h3>Anzahl Spieler (ohne Spielleiter)</h3>
        <div class="counter">
          <button class="btn round" id="minus">−</button>
          <span class="count">${game.count}</span>
          <button class="btn round" id="plus">+</button>
        </div>
        <p class="small center">${setupLine(game.count)}</p>
        ${smallGameHint(game.count)}
        <h3>Namen in Sitzreihenfolge (im Uhrzeigersinn)</h3>
        <div class="names">${nm.join("")}</div>
        <div class="row wrap">
          <button class="btn" id="appqr2">📲 App-QR für Mitspieler</button>
        </div>
        <div class="row end"><button class="btn primary" id="next1">Weiter: Rollen wählen →</button></div>
      </section>
      ${game.test ? "" : onlineHostPanel()}
      ${testPanel()}
      ${statsHtml()}
      <section class="panel muted">
        <div class="row wrap">
          <button class="btn danger" id="reset">🗑️ Komplett neues Spiel</button>
        </div>
      </section>`;
  }
  function smallGameHint(n) {
    if (n === 4) return `<div class="box smallhint"><h4>⚠️ 4 Spieler – inoffizielle Notvariante</h4>
      <p>Offiziell braucht das Spiel mindestens 5 Spieler. Mit 4 gibt es <b>keinen Schergen</b>: 3 Dorfbewohner gegen 1 Dämon.</p>
      <ul>
        <li>Das Spiel ist sehr kurz: Gut hat meist nur <b>1–2 Hinrichtungen</b>, um den Dämon zu finden.</li>
        <li>Die Zufallswahl lässt Rollen weg, die ohne Schergen nichts tun (z. B. Ermittler, Koch) oder sofort entscheiden (z. B. Shabaloth, Vortox).</li>
        <li>Tipp: <b>Trouble Brewing</b> spielen und am ersten Tag ruhig niemanden hinrichten, wenn die Infos unklar sind.</li>
        <li>Als Spielleiter darfst du Gut ruhig etwas mehr helfen (klare Infos), damit es spannend bleibt.</li>
      </ul></div>`;
    if (n <= 6) return `<div class="box smallhint"><h4>💡 Kleine Runde</h4>
      <ul>
        <li>Bei 5–6 Spielern lernen sich die Bösen nicht kennen, und der Dämon bekommt keine Bluffs.</li>
        <li>Das Spiel dauert nur 2–3 Tage – jede Hinrichtung zählt.</li>
        <li>Die Zufallswahl lässt Baron, Heiliger, Pate und Fang Gu weg, weil sie kleine Runden kaputt machen.</li>
      </ul></div>`;
    return "";
  }
  const setupLine = n => { const c = SETUP_COUNTS[n]; return `${c[0]} Dorfbewohner · ${c[1]} Außenseiter · ${c[2]} Schergen · ${c[3]} Dämon`; };

  function slRoles() {
    const exp = expected(), c = counts();
    const fmt = arr => Array.isArray(arr) ? arr.join(" oder ") : arr;
    const ok = (team) => Array.isArray(exp[team]) ? exp[team].includes(c[team]) : exp[team] === c[team];
    const teamBlock = team => {
      const rs = rolesOf(game.edition, team);
      return `<h3 class="team-h t-${team}-text">${TEAMS[team].plural} <span class="cnt ${ok(team) ? "ok" : "bad"}">${c[team]} / ${fmt(exp[team])}</span></h3>
        <div class="tiles">${rs.map(r => `<button class="tile t-${team} ${game.selected.includes(r.id) ? "on" : ""}" data-role="${r.id}">
          <b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small>${r.setup ? `<em>${esc(r.setup)}</em>` : ""}${smallExcluded(r.id, game.count) ? `<em>⚠️ ungeeignet bei ${game.count} Spielern</em>` : ""}</button>`).join("")}</div>`;
    };
    const total = game.selected.length;
    let extra = "";
    if (game.selected.includes("drunk")) {
      const free = rolesOf(game.edition, "townsfolk").filter(r => !game.selected.includes(r.id));
      extra += `<label class="field">Der <b>Säufer</b> glaubt, er sei:
        <select id="drunkShown">${free.map(r => `<option value="${r.id}" ${r.id === game.drunkShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>`;
    }
    if (game.selected.includes("marionette")) {
      const free = rolesOf(game.edition, "townsfolk").filter(r => !game.selected.includes(r.id));
      extra += `<label class="field">Die <b>Marionette</b> glaubt, sie sei:
        <select id="marionetteShown">${free.map(r => `<option value="${r.id}" ${r.id === game.marionetteShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>
        <p class="small">⚠️ Setze die Marionette beim Verteilen neben den Dämon.</p>`;
    }
    if (game.selected.includes("lunatic")) {
      extra += `<label class="field">Der <b>Wahnsinnige</b> glaubt, er sei:
        <select id="lunaticShown">${rolesOf(game.edition, "demon").map(r => `<option value="${r.id}" ${r.id === game.lunaticShown ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</select></label>`;
    }
    const warn = total !== game.count ? `<p class="error">Du hast ${total} von ${game.count} Rollen gewählt.</p>`
      : (["townsfolk", "outsider", "minion", "demon"].every(ok) ? `<p class="okmsg">✓ Die Verteilung passt.</p>` : `<p class="warnmsg">Die Anzahl stimmt, weicht aber von der Standard-Verteilung ab. Das ist erlaubt, wenn du es so willst.</p>`);
    return `
      <section class="panel">
        <h2>Rollen für ${game.count} Spieler</h2>
        <p class="small">${esc(EDITIONS[game.edition].name)} · Tippe Rollen an, um sie hinzuzufügen oder zu entfernen.</p>
        ${requireWarnings()}
        ${scriptFitHtml()}
        ${setupMeterHtml()}
        ${balanceHints()}
        ${game.edition === "custom" ? "" : jinxHtml(ROLES.filter(r => inEd(r, game.edition)).map(r => r.id))}
        <div class="row wrap"><button class="btn primary" id="auto">🎲 Zufällig auswählen</button><button class="btn" id="autobal">⚖️ Ausgewogen vorschlagen</button><button class="btn" id="clear">Auswahl leeren</button></div>
        ${warn}
        ${extra}
        ${["townsfolk", "outsider", "minion", "demon"].map(teamBlock).join("")}
        <details class="fabledpick" ${(game.fabled || []).length ? "open" : ""}><summary><h3 class="team-h t-fabled-text">Fabelwesen <span class="small">(optional – Sonderregeln, alle wissen davon)</span></h3></summary>
          <div class="tiles">${ROLES.filter(r => r.t === "fabled").map(r => `<button class="tile t-fabled ${(game.fabled || []).includes(r.id) ? "on" : ""}" data-fabled="${r.id}"><b>${r.ic} ${esc(r.de)}${r.ed === "loric" ? " <small>(Loric)</small>" : ""}</b><small>${esc(r.a)}</small></button>`).join("")}</div>
        </details>
        <div class="row end"><button class="btn primary" id="next2" ${total === game.count ? "" : "disabled"}>Weiter: Verteilen →</button></div>
      </section>`;
  }

  function roleChip(id, extra = "") {
    const r = ROLE_BY_ID[id];
    return `<span class="rchip t-${r.t}">${r.ic} ${esc(r.de)}${extra}</span>`;
  }

  // Formular „Reisenden hinzufügen“ (in Schritt 3 und im Grimoire während des Spiels)
  function travFormHtml() {
    const travOpts = ROLES.filter(r => r.t === "traveller" && (game.edition !== "custom" || !(game.script || []).some(id => ROLE_BY_ID[id].t === "traveller") || game.script.includes(r.id)))
      .filter(r => !game.seats.some(x => x.role === r.id))
      .map(r => `<option value="${r.id}">${esc(r.de)} (${esc(EDITIONS[r.ed].name)})</option>`).join("");
    const free = Object.entries(lobby).filter(([uid]) => !game.seats.some(x => x.pid === uid));
    return `<div class="travform">
      ${game.online ? `<select id="travpid"><option value="">– kein Online-Handy –</option>${free.map(([uid, p]) => `<option value="${uid}" ${free.length === 1 ? "selected" : ""}>🌐 ${esc(p.name)}</option>`).join("")}</select>` : ""}
      <input id="travname" placeholder="Name${game.online ? " (leer = Name vom Handy)" : ""}">
      <select id="travrole">${travOpts}</select>
      <select id="travalign"><option value="g">Gut</option><option value="e">Böse</option></select>
      <button class="btn" id="addtrav">+ Hinzufügen</button>
    </div>`;
  }
  // Im laufenden Spiel: Reisender scannt den QR-Code des Raums, dann hier zuordnen
  function travLatePanel() {
    const free = game.online ? Object.entries(lobby).filter(([uid]) => !game.seats.some(x => x.pid === uid)) : [];
    return `<section class="panel"><details class="travlate" ${free.length || game.travOpen ? "open" : ""}>
      <summary><h2>🧳 Reisender kommt dazu</h2></summary>
      ${game.online ? `<p class="small">1. Der Neue scannt diesen QR-Code (oder öffnet die App → „Meine Rolle“ → „Online-Spiel beitreten“ mit Code <b>${esc(game.online.code)}</b>).<br>
        2. Sein Name erscheint unten im ersten Feld. Rolle und Gesinnung wählen → „+ Hinzufügen“. Er sieht seine Reisenden-Rolle sofort auf dem Handy.</p>
        <div class="qr small-qr">${qrSvg(joinUrl(game.online.code))}</div>
        ${free.length ? `<p class="okmsg">🌐 Neu im Raum: ${free.map(([, p]) => esc(p.name)).join(", ")}</p>` : `<p class="small">Noch niemand Neues im Raum …</p>`}`
        : `<p class="small">Ohne Online-Spiel: Name, Rolle und Gesinnung eintragen und ihm danach seine Karte über „3 · Verteilen“ (QR/Link) geben.</p>`}
      ${travFormHtml()}
      <p class="small">Die Reisenden-Rolle ist öffentlich – sag sie laut an. Die Gesinnung bleibt geheim.</p>
    </details></section>`;
  }

  function slAssign() {
    const ps = game.seats;
    const allowEvil = playerSeats().length >= 7;
    const rows = ps.map((s, i) => {
      const r = ROLE_BY_ID[s.role];
      const shown = shownRole(s.role);
      const sel = s.trav
        ? roleChip(s.role, s.align === "e" ? " (böse)" : " (gut)")
        : `<select class="seatrole" data-i="${i}">${game.selected.map(id => `<option value="${id}" ${id === s.role ? "selected" : ""}>${esc(roleName(id))}</option>`).join("")}</select>`;
      return `<div class="seat t-${r.t}-border">
        <div class="seat-top"><span class="seatno">${i + 1}</span><b class="seatname">${esc(s.name)}</b>${onlineBadge(s)}
          ${shown !== s.role ? `<span class="small">sieht: ${esc(roleName(shown))}</span>` : ""}</div>
        <div class="seat-mid">${sel}</div>
        ${pidSelect(i)}
        <div class="seat-bot"><code class="code">${seatCode(s, i)}</code>
          <button class="btn sm" data-qr="${i}">📱 QR / Link</button>
          ${s.trav ? `<button class="btn sm danger" data-deltrav="${i}">✕</button>` : ""}</div>
      </div>`;
    }).join("");
    return `
      <section class="panel">
        <h2>Rollen verteilen</h2>
        ${game.online ? `<p class="okmsg">🌐 Online-Spiel <b>${esc(game.online.code)}</b>: Rollen werden automatisch an alle verbundenen Handys gesendet. Für alle anderen gibt es weiterhin QR-Code und Code.</p>` : ""}
        <p>Jeder Spieler holt sich seine Rolle: <b>QR-Code scannen</b>, <b>Link</b> öffnen oder in der App unter „Meine Rolle“ den <b>Code</b> eingeben. Oder gib dein Handy reihum.</p>
        <div class="row wrap">
          <button class="btn primary" id="pass">🔄 Handy weitergeben</button>
          <button class="btn" id="reshuffle">🎲 Neu mischen</button>
        </div>
        ${location.protocol === "file:" ? `<p class="warnmsg">Die App läuft gerade als lokale Datei. QR-Codes und Links funktionieren auf anderen Handys nur, wenn die App im Internet liegt (z. B. GitHub Pages). Die Codes funktionieren trotzdem.</p>` : ""}
        <label class="switch ${allowEvil ? "" : "disabled"}"><input type="checkbox" id="evilinfo" ${game.evilInfo && allowEvil ? "checked" : ""} ${allowEvil ? "" : "disabled"}>
          <span>Böse-Infos auf die Karten schreiben (Schergen sehen den Dämon, der Dämon sieht Schergen &amp; Bluffs). ${allowEvil ? "Ersetzt das Aufwecken in der ersten Nacht. Funktioniert nur über QR/Link/Handy weitergeben, nicht über Codes." : "Erst ab 7 Spielern."}</span></label>
        <div class="seats">${rows}</div>
        <div class="box"><h4>Bluffs für den Dämon</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p>
          <button class="btn sm" id="rebluff">🎲 Andere Bluffs</button></div>
      </section>
      <section class="panel">
        <h3>Reisenden hinzufügen</h3>
        <p class="small">Reisende kommen später dazu oder gehen früher. Du legst fest, ob sie gut oder böse sind.</p>
        ${travFormHtml()}
      </section>
      <div class="row end"><button class="btn primary" id="next3">Weiter: Grimoire →</button></div>`;
  }

  function ensureAmnesiac() {
    game.seats.forEach(x => {
      if (x.role !== "amnesiac" || x.amn) return;
      const pool = AMNESIAC_IDEAS.filter(a => !a.like || !game.seats.some(y => y.role === a.like));
      setAmn(x, pool[randInt(pool.length)].k);
      hist(`❓ Geheime Fähigkeit von ${x.name} (Amnesiker, gewürfelt): ${x.amn.text}`);
      save();
    });
  }
