  // =====================================================================
  //  MEINE ROLLE (Spieler)
  // =====================================================================
  // Abstimmen & Nominieren am Handy (wenn der Spielleiter es eingeschaltet hat)
  function phoneVoteHtml(mine) {
    const ps = pubState;
    if (!ps || !ps.pv || !mine || mine.s === undefined || !(ps.seats || [])[mine.s]) return "";
    const me = ps.seats[mine.s], S = ps.seats;
    if (ps.vote) {
      const up = (ps.vote.hands || []).includes(mine.s);
      const can = me.a || me.g;
      const zealot = mine.r === "zealot" && me.a && S.filter(x => x.a).length >= 5;
      return `<section class="panel pvote"><h2>🗳️ Abstimmung</h2>
        <p><b>${esc(S[ps.vote.by].n)}</b> nominiert <b>${esc(S[ps.vote.on].n)}</b>.</p>
        <p class="small">${(ps.vote.hands || []).length} Hand/Hände oben${me.a ? "" : me.g ? " · du bist tot: das ist deine eine Geisterstimme" : " · du hast keine Stimme mehr"}</p>
        ${zealot ? `<p class="warnmsg">📢 Zelot: Du musst für jede Nominierung stimmen.</p>` : ""}
        ${can ? `<div class="row center wrap"><button class="btn big ${up ? "primary" : ""}" data-pv="1">✋ Hand heben${up ? " ✔" : ""}</button>${zealot ? "" : `<button class="btn big ${up ? "" : "primary"}" data-pv="0">✊ Hand unten${up ? "" : " ✔"}</button>`}</div>` : ""}
      </section>`;
    }
    if ((!me.a && !me.bs) || (ps.nomd || []).filter(k => k === mine.s).length >= (me.bs ? 2 : 1)) return `<section class="panel pvote muted"><p class="small center">🗳️ ${me.a || me.bs ? "Du hast heute schon nominiert." : "Tote dürfen nicht nominieren."}</p></section>`;
    return `<section class="panel pvote"><h2>🗳️ Nominieren</h2>
      <div class="row wrap"><select id="pvon">${S.map((x, k) => k === mine.s ? "" : `<option value="${k}">${esc(x.n)}${x.a ? "" : " 💀"}</option>`).join("")}</select>
      <button class="btn primary" id="pvnom">Nominieren</button></div>
      <p class="small">Sag es laut und tippe dann hier – der Spielleiter bestätigt die Nominierung.</p></section>`;
  }
  function bindPhoneVote(mine) {
    $$("[data-pv]").forEach(b => b.addEventListener("click", async () => {
      const up = b.dataset.pv === "1";
      const ok = await sendToHost({ type: "vote", on: pubState.vote.on, up });
      toast(ok ? (up ? "✋ Hand ist oben" : "✊ Hand ist unten") : "Keine Verbindung – heb die Hand am Tisch.");
    }));
    $("#pvnom") && $("#pvnom").addEventListener("click", async () => {
      const on = +$("#pvon").value;
      const ok = await sendToHost({ type: "nominate", on });
      toast(ok ? "📨 Nominierung gesendet – der Spielleiter bestätigt" : "Keine Verbindung – sag es am Tisch.");
    });
  }
  function updateVoteBox() {
    const box = $("#pvbox");
    if (!box) return;
    const mine = store.get("botc.myrole", null);
    box.innerHTML = phoneVoteHtml(mine);
    bindPhoneVote(mine);
  }

  function renderPlayer() {
    const mine = store.get("botc.myrole", null);
    if (mine && mine.hbd) registerHomebrew(mine.hbd);
    if (pubState && pubState.hb) registerHomebrew(pubState.hb);
    const on = store.get("botc.online", null);
    // Beitritts-Link gescannt oder „Online-Spiel beitreten“ gewählt: Formular zeigen, auch wenn noch eine alte Rolle gespeichert ist.
    if (!on && Net.configured() && (pendingJoin || showJoin)) {
      view.innerHTML = joinPanel() + `
        ${mine ? `<p class="small center">Deine bisher gespeicherte Rolle wird beim Beitreten ersetzt.</p>` : ""}
        <div class="row center"><button class="btn" id="canceljoin">Abbrechen</button></div>`;
      bindJoin();
      $("#canceljoin").addEventListener("click", () => { pendingJoin = ""; store.del("botc.pendingJoin"); showJoin = false; renderPlayer(); });
      return;
    }
    if (!mine && on) {
      view.innerHTML = netbarHtml() + `
        <section class="panel center">
          <div class="cover-icon">⏳</div>
          <h2>Du bist im Spiel!</h2>
          <p>Raum <b>${esc(on.code)}</b> als <b>${esc(on.name)}</b>.</p>
          <p class="small">Warte, bis der Spielleiter die Rollen verteilt – deine Rolle erscheint dann automatisch hier.</p>
          <button class="btn danger" id="leaveroom">Raum verlassen</button>
        </section>` + notesHtml();
      $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
      bindNotes();
      return;
    }
    if (!mine) {
      view.innerHTML = installPanel() + joinPanel() + `
        <section class="panel">
          <h2>Deine Rolle</h2>
          <p>Scanne den <b>QR-Code</b> beim Spielleiter, öffne den Link, den er dir geschickt hat, oder gib hier deinen <b>Code</b> ein.</p>
          <form id="codeform" class="codeform" autocomplete="off">
            <input id="codein" maxlength="7" placeholder="z. B. K7QX2" autocapitalize="characters" spellcheck="false" inputmode="text">
            <button class="btn primary" type="submit">Rolle anzeigen</button>
          </form>
          <p id="codeerr" class="error hidden">Dieser Code ist ungültig. Bitte prüfe die Eingabe.</p>
        </section>
        <section class="panel muted">
          <h3>Du bist der Spielleiter?</h3>
          <p>Wechsle unten zu <a href="#/sl">Spielleiter</a>, um ein Spiel aufzusetzen und die Rollen zu verteilen.</p>
        </section>`;
      $("#codeform").addEventListener("submit", e => {
        e.preventDefault();
        const info = readCode($("#codein").value);
        if (!info) { $("#codeerr").classList.remove("hidden"); return; }
        store.set("botc.myrole", info);
        renderPlayer();
      });
      bindInstall();
      bindJoin();
      return;
    }
    view.innerHTML = netbarHtml() + `
      <section class="reveal-wrap">
        <div id="cover" class="cover" role="button" tabindex="0">
          <img class="cover-img" src="icon-192.png" alt="">
          <div class="cover-title">${mine.n ? esc(mine.n) + ", deine" : "Deine"} Rolle ist verdeckt</div>
          <div class="cover-sub">Achte darauf, dass niemand mitschaut.<br>Dann tippe hier, um sie anzuzeigen.</div>
        </div>
        <div id="card" class="hidden">${cardHtml(mine)}
          ${pickerHtml(mine)}
          <div class="row center"><button id="hide" class="btn">🙈 Wieder verdecken</button></div>
        </div>
      </section>
      <div id="pvbox">${phoneVoteHtml(mine)}</div>
      ${notesHtml()}
      ${(() => { const si = scriptInfo(); return si ? nightOrderHtml(si.ids, si.name) : ""; })()}
      <div class="row center"><button class="btn sm" id="bugrep">🐞 Problem melden</button></div>
      <section class="panel muted">
        <div class="row center wrap">
          <a class="btn" href="#/rollen" onclick="this.dataset.go=1">${mine.sc ? "📜 Rollen in eurem Spiel" : "📖 Alle Rollen ansehen"}</a>
          ${on ? `<button id="leaveroom" class="btn danger">Raum verlassen</button>` : `${Net.configured() ? `<button id="openjoin" class="btn">🌐 Online-Spiel beitreten</button>` : ""}<button id="forget" class="btn danger">Andere Rolle laden</button>`}
        </div>
      </section>`;
    const show = () => { $("#cover").classList.add("hidden"); $("#card").classList.remove("hidden"); };
    $("#cover").addEventListener("click", show);
    $("#cover").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") show(); });
    bindPicker(mine);
    bindNotes();
    bindPhoneVote(mine);
    $("#bugrep") && $("#bugrep").addEventListener("click", bugReport);
    if (modal.classList.contains("hidden")) nightOverlay();
    $("#hide").addEventListener("click", () => { $("#card").classList.add("hidden"); $("#cover").classList.remove("hidden"); window.scrollTo(0, 0); });
    $("#forget") && $("#forget").addEventListener("click", () => {
      if (confirm("Deine gespeicherte Rolle wirklich entfernen?")) { store.del("botc.myrole"); renderPlayer(); }
    });
    $("#leaveroom") && $("#leaveroom").addEventListener("click", () => { if (confirm("Online-Spiel wirklich verlassen?")) leaveRoom(false); });
    $("#openjoin") && $("#openjoin").addEventListener("click", () => { showJoin = true; renderPlayer(); window.scrollTo(0, 0); });
  }

