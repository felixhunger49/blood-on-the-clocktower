  // ---------- Spieler-Seite ----------
  // Schein-Aufgabe für alle, die gerade nicht dran sind – sieht genauso aus wie eine echte.
  const FAKE_ACTION = { n: 1, self: true, text: "Du hast gerade nichts zu tun. Tippe trotzdem einen beliebigen Spieler an und bestätige – damit niemand merkt, wer wirklich wach ist." };

  // Nacht-Bildschirme im Online-Spiel: Aufgabe > Geweckt > Schlafen
  function nightOverlay() {
    if (!store.get("botc.online", null)) return;
    const mine = store.get("botc.myrole", null);
    const answered = store.get("botc.answered", []) || [];
    if (mine && mine.q && !answered.includes(mine.q.id)) { if (!$(".nightact")) showNightPrompt(mine); return; }
    if (mine && mine.wk && !answered.includes(mine.wk.id)) {
      const open = $(".wakeshow");
      if (!open || open.dataset.id !== mine.wk.id) showWake(mine);
      return;
    }
    if ($(".nightact") || $(".wakeshow")) return;
    if (pubState && pubState.sleep) { if (!$(".sleepshow")) showSleep(); }
    else if ($(".sleepshow")) { closeModal(); refreshPlayerView(true); }
  }

  function showSleep() {
    openModal(`<div class="nightshow sleepshow"><div class="cover-icon">😴</div><h2>Nacht</h2>
      <p class="ns-hint">Augen zu. Lass das Handy liegen – es vibriert, wenn du geweckt wirst.</p></div>`, "full night sleep");
  }

  function showWake(mine) {
    const wk = mine.wk;
    const role = ROLE_BY_ID[wk.step];
    openModal(`<div class="nightshow wakeshow" data-id="${esc(wk.id)}">
        <p class="ns-label">👁️ Du bist wach</p>
        <h2>${role ? role.ic + " " + esc(role.de) : ""}</h2>
        ${(wk.r || []).map(id => { const r = ROLE_BY_ID[id]; return r ? `<div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>` : ""; }).join("")}
        ${wk.t ? `<p class="ns-text">${esc(wk.t)}</p>` : ""}
        ${["spy", "widow"].includes(wk.step) && mine.g ? grimBox(mine.g) : ""}
        <p class="ns-hint">Merk dir die Info – sie steht auch auf deiner Rollenkarte.</p>
        <div class="row center"><button class="btn big" id="wkdone">😴 Augen wieder zu</button></div>
      </div>`, "full night sleep");
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    $("#wkdone").addEventListener("click", () => {
      const ans = store.get("botc.answered", []) || [];
      store.set("botc.answered", [...ans, wk.id].slice(-50));
      sendToHost({ type: "action", id: wk.id, ack: true });
      closeModal();
      nightOverlay();
    });
  }

  function showNightPrompt(mine) {
    const q = mine.q;
    if (!q || (store.get("botc.answered", []) || []).includes(q.id)) return;
    const seats = (pubState && pubState.seats) || [];
    const done = (payload) => {
      const ans = store.get("botc.answered", []) || [];
      store.set("botc.answered", [...ans, q.id].slice(-50));
      sendToHost(Object.assign({ type: "action", id: q.id }, payload)).then(ok => {
        if (!$(".nightact")) return; // schon die nächste Aufgabe offen
        if (pubState && pubState.sleep && ok) { closeModal(); nightOverlay(); return; }
        $("#modal-content").innerHTML = `<div class="nightshow nightsent"><div class="cover-icon">${ok ? "🌙" : "⚠️"}</div>
          <h2>${ok ? "Augen zu" : "Nicht gesendet"}</h2><p class="ns-hint">${ok ? "Deine Wahl ist angekommen. Lass das Handy liegen – es vibriert, wenn du wieder etwas tun sollst." : "Keine Verbindung – zeig dem Spielleiter deine Wahl."}</p>
          <div class="row center"><button class="btn big" id="ndone">OK</button></div></div>`;
        $("#ndone").addEventListener("click", () => { closeModal(); refreshPlayerView(true); });
      });
    };
    let def = q.sleep ? FAKE_ACTION : (ACTIONS[q.step] || { n: 1 });
    if (q.amn && !q.sleep) def = { ...def, text: `Deine unbekannte Fähigkeit verlangt eine Wahl${def.n ? `: Wähle ${def.n === 1 ? "einen Spieler" : def.n + " Spieler"}` : ""}${def.role ? " und eine Rolle" : ""}.` };
    const min = def.min !== undefined ? def.min : (def.optional ? 0 : def.n);
    const close = $(".nightsent"); if (close) closeModal();
    const list = seats.map((x, k) => ({ ...x, k })).filter(x => (def.self || x.k !== mine.s) && (def.onlyDead ? !x.a : (x.a || def.dead)));
    let pool = [];
    if (def.role) {
      const ed = mine.sc ? "custom" : (ROLE_BY_ID[mine.r] || {}).ed;
      pool = ROLES.filter(r => inEd(r, ed, mine.sc) && !["traveller", "fabled"].includes(r.t) && (def.role === "all" || r.t === "townsfolk" || r.t === "outsider" || (q.step === "cerenovus" && r.id === "goblin")));
    }
    openModal(`<div class="nightshow nightact">
        <p class="ns-label">🌙 Nacht</p>
        <h2>${q.sleep ? "Schein-Auswahl" : q.amn ? "❓ Deine Fähigkeit" : esc(roleName(q.step))}</h2>
        <p class="ns-hint">${esc(def.text || "")}</p>
        ${def.n ? `<div class="pickgrid">${list.map(x => `<button class="pickbtn ${x.a ? "" : "dead"}" data-pk="${x.k}">${esc(x.n)}${x.a ? "" : " 💀"}</button>`).join("")}</div>
          <p class="small" id="pkcount">0 von ${def.n} gewählt</p>` : ""}
        ${def.role ? `<select id="pkrole"><option value="">– Rolle wählen –</option>${pool.map(r => `<option value="${r.id}">${esc(r.de)}</option>`).join("")}</select>` : ""}
        <div class="row center wrap">
          ${min === 0 ? `<button class="btn" id="pkskip">Nichts tun</button>` : ""}
          <button class="btn primary big" id="pkok">Bestätigen</button>
        </div>
      </div>`, "full night");
    const chosen = [];
    $$("[data-pk]").forEach(b => b.addEventListener("click", () => {
      const k = +b.dataset.pk, at = chosen.indexOf(k);
      if (at >= 0) chosen.splice(at, 1);
      else { if (chosen.length >= def.n) chosen.shift(); chosen.push(k); }
      $$("[data-pk]").forEach(x => x.classList.toggle("on", chosen.includes(+x.dataset.pk)));
      $("#pkcount").textContent = `${chosen.length} von ${def.n} gewählt`;
    }));
    $("#pkskip") && $("#pkskip").addEventListener("click", () => done({ skip: true }));
    $("#pkok").addEventListener("click", () => {
      const role = $("#pkrole") ? $("#pkrole").value : "";
      if (def.n && chosen.length < Math.max(min, 1) && !(min === 0 && role)) { toast(`Bitte ${def.n === 1 ? "einen Spieler" : `${min || 1}–${def.n} Spieler`} wählen.`); return; }
      if (def.role && !role && !def.optional) { toast("Bitte eine Rolle wählen."); return; }
      done({ picks: chosen, role: role || null });
    });
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }

