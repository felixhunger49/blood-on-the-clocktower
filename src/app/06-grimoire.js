  function slGrim() {
    ensureAmnesiac();
    const ps = game.seats;
    const seats = ps.map((s, i) => {
      const shown = shownRole(s.role);
      return `<div class="gseat ${s.alive ? "" : "dead"}">
        <div class="g-top">
          <span class="seatno">${i + 1}</span>
          <b>${esc(s.name)}</b>
          ${roleChip(s.role, s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : "")}
          ${shown !== s.role ? `<span class="small">(glaubt: ${esc(roleName(shown))})</span>` : ""}
          ${s.zfake ? `<span class="small">🧟 scheintot – lebt heimlich weiter</span>` : ""}
          ${marksHtml(s)}
        </div>
        <div class="g-ctl">
          <button class="btn sm" data-alive="${i}">${s.alive ? "❤️ lebt" : "💀 tot"}</button>
          ${s.alive ? "" : `<button class="btn sm" data-ghost="${i}">${s.ghost ? "👻 Stimme frei" : "🚫 Stimme verbraucht"}</button>`}
          <button class="btn sm" data-info="${s.role}">ℹ️</button>
          <button class="btn sm" data-change="${i}" title="Rolle oder Gesinnung ändern">🔁</button>
          <button class="btn sm" data-seatmodal="${i}" title="Marker setzen">🏷️</button>
          ${s.alive && game.seats.some(x => x.role === "cerenovus") ? `<button class="btn sm ${s.madness && s.madness.night === game.nightNo ? "used" : ""}" data-mad="${i}" title="Wahnsinn (Cerenovus)">😵${s.madness && s.madness.night === game.nightNo ? " " + esc(roleName(s.madness.role)) : ""}</button>` : ""}
          ${s.role === "philosopher" ? philoSelect(i) : ""}
          ${ONCE_PER_GAME.includes(s.role) && s.role !== "philosopher" ? `<button class="btn sm ${s.used ? "used" : ""}" data-used="${i}">${s.used ? "✔ Fähigkeit benutzt" : "○ Fähigkeit frei"}</button>` : ""}
        </div>
        <input class="note" data-note="${i}" placeholder="Notiz (z. B. vergiftet, geschützt, Ablenker …)" value="${esc(s.note)}">
      </div>`;
    }).join("");
    const alive = ps.filter(s => s.alive && !s.trav).length;
    const needed = votesNeeded();
    const first = game.nightNo === 1;
    const night = first ? NIGHT_FIRST : NIGHT_OTHER;
    const key = first ? "n1" : "n";
    const steps = [];
    night.forEach(id => {
      if (NIGHT_STEPS[id]) {
        if ((id === "minioninfo" || id === "demoninfo") && playerSeats().length < 7) return;
        if (!NIGHT_STEPS[id][key]) return;
        if ((id === "minioninfo" || id === "demoninfo") && poppyBlocks()) { steps.push({ id, name: NIGHT_STEPS[id].de, text: "", who: "", inactive: true, mark: "🌺", why: "🌺 Der Mohnbauer lebt – Schergen und Dämon erfahren nichts voneinander (auch keine Bluffs)." }); return; }
        const ev = evilTeam();
        let who = "";
        if (id === "minioninfo") who = `Dämon: ${esc(ev.demon ? ev.demon.name : "–")}${snitchBluffs() ? ` · 🤫 Petze – Bluffs der Schergen: ${snitchBluffs().map(b => esc(roleName(b))).join(", ")}` : ""}`;
        if (id === "demoninfo") who = `Schergen: ${ev.minions.map(m => esc(m.name)).join(", ") || "–"} · Bluffs: ${game.bluffs.map(b => esc(roleName(b))).join(", ")}`;
        steps.push({ id, name: NIGHT_STEPS[id].de, text: NIGHT_STEPS[id][key], who, show: id === "minioninfo" || id === "demoninfo" });
        return;
      }
      const role = ROLE_BY_ID[id];
      if (!role || !role[key]) return;
      const holders = ps.filter(s => (s.role === id && !(id === "amnesiac" && s.amn && s.amn.like)) || (id === "scarletwoman" && s.swPending) || (s.role === "amnesiac" && s.amn && s.amn.like === id));
      const drunks = ps.filter(s => (s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id);
      const philos = ps.filter(s => gainer(s) && s.gained === id);
      if (!holders.length && !drunks.length && !philos.length) return;
      const who = [...holders.map(s => esc(s.name) + (s.role === "amnesiac" && id !== "amnesiac" ? " (Amnesiker ❓)" : "") + (s.alive ? "" : " †") + (philos.some(q => q.role === "philosopher") && s.alive ? " (betrunken durch Philosoph)" : "")),
        ...drunks.map(s => esc(s.name) + (s.alive ? "" : " †") + (s.role === "drunk" ? " (Säufer – Info darf falsch sein)" : " (Marionette – Info darf falsch sein)")),
        ...philos.map(s => esc(s.name) + (s.alive ? "" : " †") + (s.role === "cannibal" ? (s.canniFake ? " (🍖 Kannibale – vergiftet, Schein-Fähigkeit: Info falsch geben)" : " (🍖 Kannibale)") : " (Philosoph)"))].join(", ");
      // Tote Spieler haben keine Fähigkeit mehr – außer Rollen, die gerade durch ihren Tod ausgelöst werden.
      const all = [...holders, ...drunks, ...philos];
      const notTriggered = ACTS_WHEN_DEAD.includes(id) && !all.some(s => deathTriggered(s, id));
      const allDead = !ACTS_WHEN_DEAD.includes(id) && all.every(s => !s.alive && !s.zfake);
      const allKilled = !allDead && !ACTS_WHEN_DEAD.includes(id) && all.every(s => (!s.alive && !s.zfake) || killedBefore(s, id));
      const allUsed = ONCE_PER_GAME.includes(id) && all.every(s => ((gainer(s) && id !== s.role ? s.gainedUsed : s.used) && s.usedNight !== game.nightNo) || !s.alive);
      // Der Jongleur erfährt sein Ergebnis nur in der Nacht nach dem ersten Tag.
      const over = (id === "juggler" && game.nightNo > 2) || (ROLE_BY_ID[id] && ROLE_BY_ID[id].hbCond === "n2" && game.nightNo !== 2);
      const swIdle = (id === "scarletwoman" && !holders.some(s => s.swPending)) || (id === "choirboy" && !nightKills().some(x => x.dies && ps[x.k] && ps[x.k].role === "king" && ROLE_BY_ID[x.step] && ROLE_BY_ID[x.step].t === "demon"));
      const canni = id === "cannibal" ? holders.find(s => s.role === "cannibal" && s.alive) : null;
      const canniIdle = id === "cannibal" && !allDead;
      const inactive = allDead || allKilled || allUsed || over || notTriggered || swIdle || canniIdle;
      const why = allDead ? "Tot – keine Fähigkeit mehr, nicht wecken."
        : allKilled ? "🎯 Wurde heute Nacht schon vom Dämon getötet (der Dämon ist vorher dran) – nicht mehr wecken, keine Info."
        : over ? "Nur in der zweiten Nacht – entfällt."
        : swIdle ? (id === "choirboy" ? "Der Dämon hat heute Nacht nicht den König getötet – nicht wecken." : "Der Dämon ist nicht gestorben (oder sie hat nicht übernommen) – nicht wecken.")
        : canniIdle ? (canni && canni.gained ? `🍖 Hat gerade die Fähigkeit: ${roleName(canni.gained)}${canni.canniFake ? " (Schein-Fähigkeit – vergiftet)" : ""}. ${(ROLE_BY_ID[canni.gained] || {})[key] ? "Wird bei diesem Schritt geweckt." : "Diese Fähigkeit hat heute Nacht keine Aktion."}` : "🍖 Noch keine Fähigkeit – die bekommt er erst, wenn jemand durch Hinrichtung stirbt.")
        : notTriggered ? (["ravenkeeper", "sage"].includes(id) ? "Nur wenn er heute Nacht stirbt (z. B. durch den Dämon) – nicht wecken." : "Nur wenn er gerade gestorben ist – nicht wecken.")
        : "Fähigkeit schon benutzt – nicht mehr wecken.";
      steps.push({ id, name: `${role.ic} ${role.de}`, text: role[key], who, t: role.t, inactive, why, mark: allDead || allKilled ? "💀" : "✔", once: ONCE_PER_GAME.includes(id) });
    });
    const done = game.done[game.nightNo] || [];
    let banner = "";
    if (game.winner) {
      banner = `<section class="panel endbanner ${game.winner.team}">
        <h2>${game.winner.team === "good" ? "😇 Gut hat gewonnen" : "😈 Böse hat gewonnen"}</h2>
        <p>${esc(game.winner.reason)}</p>
        <div class="row wrap"><button class="btn primary" id="showend">🏆 Ergebnis anzeigen</button><button class="btn" id="undoend">Spiel fortsetzen</button></div>
      </section>`;
    } else {
      const end = detectEnd();
      if (end && game.ignoreEnd !== aliveKey()) {
        banner = `<section class="panel endbanner ${end.winner}">
          <h2>🏁 Spielende erkannt</h2>
          <p><b>${end.winner === "good" ? "Gut gewinnt" : "Böse gewinnt"}:</b> ${esc(end.reason)}</p>
          ${end.warn.map(w => `<p class="warnmsg">⚠️ ${esc(w)}</p>`).join("")}
          <div class="row wrap"><button class="btn primary" data-win="${end.winner}" data-reason="${esc(end.reason)}">Sieg verkünden</button><button class="btn" id="ignoreend">Spiel geht weiter</button></div>
        </section>`;
      }
    }
    const pro = proMode();
    const isDay = game.phase === "day";
    const view = game.circle ? "circle" : pro && game.fullList ? "full" : "compact";
    // Kompakte Zeilen: nur das Wichtigste – Antippen öffnet das Spieler-Fenster mit allen Knöpfen
    const lines = ps.map((s, i) => {
      const r = ROLE_BY_ID[s.role], shown = shownRole(s.role);
      return `<button class="gline ${s.alive ? "" : "dead"} t-${r.t}-border" data-seatmodal="${i}">
        <span class="seatno">${i + 1}</span>
        <span class="gl-main"><b>${esc(s.name)}</b>
          <span class="gl-role t-${r.t}-text">${r.ic} ${esc(r.de)}${s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : ""}${shown !== s.role ? ` <small>(glaubt: ${esc(roleName(shown))})</small>` : ""}</span>
          ${s.role === "cannibal" && s.gained ? `<small class="gl-note">🍖 hat: ${esc(roleName(s.gained))}${s.canniFake ? " (Schein, vergiftet)" : ""}</small>` : ""}
          ${s.note ? `<small class="gl-note">📝 ${esc(s.note)}</small>` : ""}</span>
        <span class="gl-st">${s.zfake ? "🧟" : ""}${(s.marks || []).map(m => (markerByKey(m) || {}).i || "").join("")}${ONCE_PER_GAME.includes(s.role) && s.used ? "✔️" : ""}${s.alive ? "" : s.ghost ? "💀👻" : "💀"}</span>
      </button>`;
    }).join("");
    const head = `<section class="panel ghead">
        <div class="ghead-row"><h2>${isDay ? `☀️ Tag ${game.nightNo}` : first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`}</h2>
          <div class="row wrap"><button class="btn sm" id="undobtn" ${undoStack.length ? "" : `disabled title="Noch nichts zum Zurücknehmen"`}>↩️ Rückgängig${undoStack.length ? ` <small>(${undoStack.length})</small>` : ""}</button><button class="btn sm" id="savegame">💾 Spielstand</button><button class="btn sm" id="settingsbtn">⚙️ Einstellungen</button></div></div>
        <p class="small">${game.online ? `${netDot()} Online-Spiel ${esc(game.online.code)} · ` : ""}${alive} von ${playerSeats().length} Spielern leben · Für eine Hinrichtung nötig: <b>${needed}</b> Stimmen</p>
        ${pro ? "" : `<p class="beginner">👉 ${isDay
          ? "Tag: Lass die Spieler reden (Timer unten). Danach nominieren und abstimmen – zum Schluss „Nacht beginnen“."
          : "Nacht: Alle schließen die Augen. Gehe die Liste von oben nach unten durch und hake ab. Am Ende „Morgen – Tag beginnt“."}</p>`}
        ${(game.log || []).length ? `<div class="box msglog"><h4>📨 Meldungen von Spielern</h4><ul>${game.log.slice(-5).reverse().map(l => `<li>${esc(l.text)}</li>`).join("")}</ul></div>` : ""}
      </section>`;
    const grimSec = `<section class="panel">
        <h2>📖 Grimoire</h2>
        <div class="chips viewtoggle">
          <button class="chip ${view === "compact" ? "on" : ""}" data-gview="list">☰ Liste</button>
          <button class="chip ${view === "circle" ? "on" : ""}" data-gview="circle">◯ Sitzkreis</button>
          ${pro ? `<button class="chip ${view === "full" ? "on" : ""}" data-gview="full">▤ Ausführlich</button>` : ""}
        </div>
        ${view === "circle" ? circleHtml() : view === "full" ? `<div class="gseats">${seats}</div>` : `<div class="glines">${lines}</div>`}
        ${view === "full" ? "" : `<p class="small center">Spieler antippen: lebt/tot, Marker, Notiz, Rolle ändern …</p>`}
        <div class="box"><h4>Bluffs</h4><p>${game.bluffs.map(id => roleChip(id)).join(" ")}</p></div>
        ${(game.fabled || []).length ? `<div class="box"><h4>Fabelwesen (öffentlich ansagen)</h4>${game.fabled.map(id => `<p>${roleChip(id)} ${esc(ROLE_BY_ID[id].a)}</p>`).join("")}</div>` : ""}
        ${jinxPlayHtml()}
        ${pro ? balanceNowHtml() : ""}
      </section>`;
    const nightBody = `<p class="small">${steps.filter(st => !st.inactive && done.includes(st.id)).length} von ${steps.filter(st => !st.inactive).length} Schritten erledigt${steps.some(st => st.inactive) ? " · grau = tot oder benutzt, entfällt" : ""}</p>
        ${nightActionsBar(steps)}
        <ol class="nightlist">${steps.map(s => `
          <li class="${s.inactive ? "inactive" : done.includes(s.id) ? "done" : ""} ${s.t ? "t-" + s.t + "-border" : ""}" data-step-id="${s.id}">
            <div class="ns-head">${s.inactive ? `<span class="dead-mark">${s.mark}</span>` : `<input type="checkbox" ${done.includes(s.id) ? "checked" : ""}>`}<b>${esc(s.name)}</b>${s.who ? `<span class="who">${s.who}</span>` : ""}</div>
            <p>${s.inactive ? s.why : esc(s.text)}</p>
            ${s.inactive || !ROLE_BY_ID[s.id] ? "" : jinxNotesHtml(s.id)}
            ${s.id === "yaggababble" && !s.inactive ? yaggaStepHtml() : ""}
            ${s.id === "gossip" && !s.inactive ? gossipStepHtml() : ""}
            ${s.id === "mezepheles" && !s.inactive ? mezStepHtml() : ""}
            ${s.id === "ojo" && !s.inactive && game.nightNo > 1 ? ojoStepHtml() : ""}
            ${s.id === "xaan" && game.xaanX !== null && game.xaanX !== undefined ? `<p class="small">🌘 X = ${game.xaanX} (Außenseiter beim Start)${game.xaanX === game.nightNo ? " – <b>heute Nacht sind alle Dorfbewohner vergiftet</b> (automatisch markiert)" : game.xaanX > game.nightNo ? ` – das passiert in Nacht ${game.xaanX}` : game.xaanX === 0 ? " – passiert nie" : " – schon vorbei"}.</p>` : ""}
            ${s.id === "shabaloth" && !s.inactive ? game.seats.map((x, k) => !x.alive && x.shabNight === game.nightNo - 1 ? `<button class="btn sm" data-shabre="${k}">♻️ ${esc(x.name)} ausspucken (wiederbeleben)</button>` : "").join("") : ""}
            ${s.id === "po" && !s.inactive && game.nightNo > 1 ? `<p class="small">${poCharged(game.nightNo) ? "💥 Der Po hat letzte Nacht niemanden gewählt – heute darf er <b>3 Spieler</b> töten." : "Der Po darf heute <b>1 Spieler</b> töten (oder niemanden – dann nächste Nacht 3)."}</p>` : ""}
            ${s.id === "eviltwin" && !s.inactive ? (() => { const t = game.seats.find(x => (x.marks || []).includes("twin")); return `<p class="small">👯 Guter Zwilling: <b>${t ? esc(t.name) + " (" + esc(roleName(t.role)) + ")" : "– setze den Marker 👯"}</b></p>`; })() : ""}
            ${s.id === "amnesiac" ? game.seats.filter(x => x.role === "amnesiac").map(x => `<p class="small">❓ ${esc(x.name)}: <b>${x.amn ? esc(x.amn.text) : "noch keine Fähigkeit festgelegt"}</b></p>`).join("") : ""}
            ${["sailor", "innkeeper"].includes(s.id) && game.drunkPick && game.drunkPick.night === game.nightNo && game.drunkPick.step === s.id ? (() => {
              const d = game.drunkPick, other = d.opts.find(k => k !== d.on);
              return `<div class="actrow">🍺 Betrunken ist: <b>${esc(game.seats[d.on].name)}</b>${other !== undefined ? ` <button class="btn sm" data-swapdrunk="1">⇄ Stattdessen ${esc(game.seats[other].name)}</button>` : ""}</div>`;
            })() : ""}
            ${["spy", "widow"].includes(s.id) && !s.inactive && (game.online || game.test) ? `<button class="btn sm primary" data-spygrim="${s.id}">📖 Grimoire aufs Handy${tableOn() ? " (wecken)" : ""}</button>` : ""}
            ${s.id === "widow" && !s.inactive ? `<button class="btn sm" data-widowknow="1">🕸️ Guten Spieler einweihen${game.seats.some(x => (x.marks || []).includes("knows")) ? " ✔" : ""}</button>` : ""}
            ${s.id === "spy" && game.seats.some(x => x.grim) ? `<button class="btn sm" data-spyhide="1">🙈 Grimoire vom Handy entfernen</button>` : ""}
            ${s.id === "scarletwoman" && !s.inactive ? game.seats.map((x, i) => x.swPending ? `<button class="btn sm primary" data-swshow="${i}">💋 ${esc(x.name)} zeigen: Du bist ${esc(roleName(x.role))}${game.online || game.test ? " (aufs Handy)" : ""}</button>` : "").join("") : ""}
            ${s.id === "philosopher" && !s.inactive ? game.seats.map((x, i) => x.role === "philosopher" && x.alive && !x.used ? philoSelect(i) : "").join("") : ""}
            ${s.once && !s.inactive && s.id !== "philosopher" ? `<button class="btn sm useonce" data-useonce="${s.id}">✔ Fähigkeit wurde benutzt</button>` : ""}
            ${!s.inactive && nightOn() ? actionStatusHtml(s.id) : ""}
            ${tableOn() && INFO_ROLES.includes(s.id) && !s.inactive ? wakeStatusHtml(s.id) : ""}
            ${INFO_ROLES.includes(s.id) && !s.inactive ? `<button class="btn sm primary showinfo" data-info-step="${s.id}">📱 ${SHOW_ROLE.includes(s.id) ? "Rolle zeigen" : "Info"}${game.online || game.test ? " / senden" : ""}</button>` : ""}
            ${s.show ? `<button class="btn sm primary showevil" data-show="${s.id}">📱 ${s.id === "demoninfo" ? "Dem Dämon zeigen" : "Den Schergen zeigen"} <small>(hier)</small></button>` : ""}
            ${s.show && (game.online || game.test) ? `<button class="btn sm ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "used" : "primary"} sendevil" data-sendevil="${s.id}">🌐 ${(game.evilSent || {})[s.id === "demoninfo" ? "demon" : "minion"] ? "✔ Gesendet" : "Aufs Handy senden"}</button>` : ""}
          </li>`).join("")}</ol>`;
    const nightSec = isDay
      ? `<section class="panel">
        <details class="nightwrap"><summary><h2>${first ? "🌙 Erste Nacht" : `🌑 Nacht ${game.nightNo}`} – Rückblick</h2></summary>${nightBody}</details>
        <div class="row wrap"><button class="btn primary" id="nextnight">🌙 Tag ${game.nightNo} vorbei → Nacht ${game.nightNo + 1} beginnen</button></div>
      </section>`
      : `<section class="panel">
        <h2>📋 Ablauf der Nacht</h2>
        ${nightBody}
        <div class="row wrap">
          <button class="btn" id="nightsum">📋 Nachtübersicht</button><button class="btn primary" id="daystart">☀️ Morgen – Tag ${game.nightNo} beginnt</button>
          ${pro ? `<button class="btn" id="nextnight">⏭️ Tag überspringen → Nacht ${game.nightNo + 1}</button>` : ""}
          ${game.nightNo > 1 ? `<button class="btn sm" id="prevnight">↩︎ Zurück zu Nacht ${game.nightNo - 1}</button>` : ""}
        </div>
      </section>`;
    const endSec = `<section class="panel"><details class="endwrap"><summary><h2>🏁 Spiel von Hand beenden</h2></summary>
        <p class="small">Für Siege, die die App nicht selbst erkennt – z. B. Heiliger hingerichtet, Bürgermeister-Sieg, Vortox ohne Hinrichtung, Tollpatsch, Böser Zwilling.</p>
        <label class="field">Grund (optional): <input id="winreason" placeholder="z. B. Der Heilige wurde hingerichtet"></label>
        <div class="row wrap">
          <button class="btn wingood" data-win="good">😇 Gut hat gewonnen</button>
          <button class="btn winevil" data-win="evil">😈 Böse hat gewonnen</button>
        </div></details>
      </section>`;
    return banner + head + (isDay
      ? `<section class="panel">${timerBox()}</section>${dayPanel()}${grimSec}${nightSec}`
      : `${nightSec}${grimSec}`) + travLatePanel() + endSec;
  }

  // ---------- Problem melden: alles Nötige in eine Datei ----------
  const clickLog = [];
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button, a, input, select, label");
    if (!b) return;
    clickLog.push({ at: Date.now(), id: b.id || "", txt: (b.textContent || b.value || "").replace(/\s+/g, " ").trim().slice(0, 40), cls: String(b.className || "").slice(0, 40), hash: location.hash });
    if (clickLog.length > 40) clickLog.shift();
  }, true);
  const logError = (msg, stack) => {
    try {
      const l = JSON.parse(localStorage.getItem("botc.errlog") || "[]");
      l.push({ at: Date.now(), msg: String(msg).slice(0, 300), stack: String(stack || "").slice(0, 800) });
      localStorage.setItem("botc.errlog", JSON.stringify(l.slice(-20)));
    } catch (e) { /* egal */ }
  };
  window.addEventListener("error", e => logError(e.message, e.error && e.error.stack));
  window.addEventListener("unhandledrejection", e => logError("Promise: " + (e.reason && e.reason.message || e.reason), e.reason && e.reason.stack));
  function bugReport() {
    openModal(`<h2>🐞 Problem melden</h2>
      <p class="small">Beschreibe kurz, was passiert ist. Die App packt dazu den Spielstand, die letzten Schritte und Fehlermeldungen in eine Datei – die schickst du dann an den Entwickler (z. B. per WhatsApp oder E-Mail).</p>
      <textarea id="bugtext" rows="4" placeholder="z. B. Nach der Abstimmung wurde Anna hingerichtet, obwohl ich nichts gedrückt habe."></textarea>
      <p class="small">🔒 Enthält Namen und Rollen dieses Spiels – sonst nichts Persönliches.</p>
      <div class="row end wrap"><button class="btn" id="bugcancel">Abbrechen</button><button class="btn" id="bugsave">💾 Als Datei sichern</button><button class="btn primary" id="bugshare">📤 Teilen</button></div>`);
    const build = () => {
      const src = (document.querySelector('script[src*="app.js"]') || {}).src || "";
      let errs = []; try { errs = JSON.parse(localStorage.getItem("botc.errlog") || "[]"); } catch (e) { /* egal */ }
      const rep = { app: "botc-report", version: (src.match(/v=(\d+)/) || [])[1] || "?", at: new Date().toISOString(), desc: $("#bugtext").value.trim(),
        ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, standalone: matchMedia("(display-mode: standalone)").matches, hash: location.hash,
        clicks: clickLog.slice(), errors: errs, game, undo: undoStack.slice(-10).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }),
        myrole: store.get("botc.myrole", null), pub: typeof pubState !== "undefined" ? pubState : null };
      const name = `clocktower-problem-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
      return new File([JSON.stringify(rep, null, 1)], name, { type: "application/json" });
    };
    const download = f => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); };
    $("#bugcancel").addEventListener("click", closeModal);
    $("#bugsave").addEventListener("click", () => { download(build()); toast("💾 Datei gesichert – schick sie dem Entwickler"); });
    $("#bugshare").addEventListener("click", async () => {
      const f = build();
      try {
        if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "Clocktower – Problem" }); closeModal(); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }
      download(f); toast("Teilen geht hier nicht – die Datei wurde gesichert");
    });
  }

  // Einsteiger- oder Profi-Ansicht (gilt für dieses Handy)
  const proMode = () => !!store.get("botc.pro", false);
  function settingsModal() {
    const on = game.online || game.test;
    const sw = (id, chk, title, text) => `<label class="switch"><input type="checkbox" id="${id}" ${chk ? "checked" : ""}><span><b>${title}</b> – ${text}</span></label>`;
    openModal(`<h2>⚙️ Einstellungen</h2>
      <h4>Ansicht</h4>
      <div class="chips modepick">
        <button class="chip ${proMode() ? "" : "on"}" data-pro="0">🌱 Einsteiger</button>
        <button class="chip ${proMode() ? "on" : ""}" data-pro="1">⭐ Profi</button>
      </div>
      <p class="small">${proMode() ? "Profi: alles sichtbar – ausführliche Spielerliste, „Wer liegt vorne?“, Tag überspringen." : "Einsteiger: nur das Nötigste, mit kurzen Hinweisen, was gerade zu tun ist."}</p>
      <h4>Spiel</h4>
      ${sw("st-sug", game.suggest !== false, "💡 Info-Vorschläge", "beim Info-Fenster trägt die App die wahre Info schon ein (du kannst sie ändern).")}
      ${on ? sw("st-na", !!game.nightActions, "📲 Nachtaktionen am Handy", "Spieler wählen ihre Ziele auf dem eigenen Handy, statt zu zeigen.") : ""}
      ${on ? sw("st-pv", !!game.phoneVote, "📱 Nominieren &amp; Abstimmen am Handy", "Spieler nominieren und heben die Hand per Knopf, du bestätigst nur.") : ""}
      ${on ? "" : `<p class="small">Handy-Funktionen (Nachtaktionen, Abstimmen) gibt es im Online-Spiel oder in der Testrunde.</p>`}
      <h4>Dieses Handy</h4>
      ${sw("st-music", Mood.on, "🎵 Stimmungsmusik", "ruhige Musik in der Nacht, rhythmische am Tag (braucht Internet).")}
      <h4>Hilfe</h4>
      <button class="btn" id="st-bug">🐞 Problem melden</button>
      <div class="row end"><button class="btn primary" id="st-close">Fertig</button></div>`);
    $("#st-bug").addEventListener("click", bugReport);
    $$("[data-pro]").forEach(b => b.addEventListener("click", () => { store.set("botc.pro", b.dataset.pro === "1"); renderSL(); settingsModal(); }));
    $("#st-sug").addEventListener("change", e => { game.suggest = e.target.checked; save(); });
    $("#st-na") && $("#st-na").addEventListener("change", e => { game.nightActions = e.target.checked; game.asks = {}; game.seq = null; save(); renderSL(); });
    $("#st-pv") && $("#st-pv").addEventListener("change", e => { game.phoneVote = e.target.checked; save(); renderSL(); });
    $("#st-music").addEventListener("change", e => Mood.toggle(e.target.checked));
    $("#st-close").addEventListener("click", closeModal);
  }

