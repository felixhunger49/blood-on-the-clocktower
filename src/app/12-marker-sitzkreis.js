  // =====================================================================
  //  MARKER, SITZKREIS, SPIELER-FENSTER
  // =====================================================================
  // Marker-Daten stehen in roles.js (GENERIC_MARKERS, ROLE_MARKERS).
  // Rollen-Marker, die zu den Rollen im Spiel passen (inkl. Philosophen-Wahl und Säufer-Rolle)
  function markersInPlay() {
    const ids = new Set();
    game.seats.forEach(x => { ids.add(x.role); ids.add(shownRole(x.role)); if (x.gained) ids.add(x.gained); });
    return Object.entries(ROLE_MARKERS).filter(([r]) => ids.has(r)).flatMap(([r, list]) => list.map(m => ({ ...m, role: r })));
  }
  // Erklärungen für die anderen Zustände im Spieler-Fenster
  const STATUS_HELP = {
    alive: "Tote Spieler bleiben im Spiel: Sie reden mit, dürfen aber nicht nominieren und haben ihre Fähigkeit verloren (Ausnahmen: z. B. Rabenhüter, Mondkind).",
    ghost: "Jeder Tote hat genau eine Stimme für den Rest des Spiels. Hat er sie benutzt, ist sie weg. Der Abstimmungs-Helfer verbraucht sie automatisch.",
    mad: "„Verrückt“ (Cerenovus): Der Spieler muss morgen überzeugend behaupten, die gezeigte Rolle zu sein. Tut er es nicht, darfst du ihn hinrichten lassen.",
    used: "Fähigkeiten „einmal pro Spiel“: Ist sie benutzt, wird der Nacht-Schritt grau und der Spieler nicht mehr geweckt.",
    note: "Freie Notiz nur für dich, z. B. „Meister des Butlers“ oder „hat Jungfrau behauptet“."
  };
  const marksHtml = s => (s.marks || []).length
    ? `<span class="marks">${s.marks.map(m => { const k = markerByKey(m); return k ? `<span title="${esc(k.l)}">${k.i}</span>` : ""; }).join("")}</span>` : "";

  function circleHtml() {
    const ps = game.seats;
    const n = ps.length;
    const size = n <= 8 ? "lg" : n <= 15 ? "md" : "sm";
    // Plättchen so groß wie der Platz zwischen zwei Nachbarn erlaubt (in % der Kreisbreite)
    const d = Math.min(25, 0.92 * 2 * 41 * Math.sin(Math.PI / n)).toFixed(1);
    const tokens = ps.map((s, i) => {
      const a = (i / n) * 2 * Math.PI;
      const x = 50 + 41 * Math.sin(a), y = 50 - 41 * Math.cos(a);
      const r = ROLE_BY_ID[s.role];
      return `<button class="token t-${r.t} ${s.alive ? "" : "dead"}" style="left:${x}%;top:${y}%" data-seatmodal="${i}">
        <span class="tk-no">${i + 1}</span>
        <span class="tk-name">${esc(String(s.name).replace(/^🤖\s*/, ""))}</span>
        <span class="tk-ic">${r.ic}</span>
        <span class="tk-role">${esc(r.de)}</span>
        <span class="tk-marks">${s.zfake ? "🧟" : ""}${s.alive ? "" : s.ghost ? "💀👻" : "💀"}${(s.marks || []).map(m => (markerByKey(m) || {}).i || "").join("")}${s.madness && s.madness.night === game.nightNo ? "😵" : ""}${s.used ? "✔" : ""}</span>
      </button>`;
    }).join("");
    const alive = ps.filter(s => s.alive && !s.trav).length;
    return `<div class="circle size-${size}" style="--d:${d}">
      <div class="circle-mid"><b>🌙 Nacht ${game.nightNo}</b><span>${alive} leben</span><span>${votesNeeded()} Stimmen nötig</span><small>Spieler antippen</small></div>
      ${tokens}
    </div>`;
  }

  // Alles zu einem Spieler in einem Fenster (aus Kreis oder Liste)
  const helpBtn = key => `<button class="helpbtn" data-help="${key}" aria-label="Erklärung">ⓘ</button>`;
  const markerChip = (s, m) => {
    const on = (s.marks || []).includes(m.k), kept = (s.keep || []).includes(m.k);
    return `<span class="mkchip"><button class="chip ${on ? "on" : ""}" data-mk="${m.k}">${m.i} ${esc(m.l)}${m.n || (m.t && !kept) ? " 🌙" : ""}</button>${m.t && on ? `<button class="chip pin ${kept ? "on" : ""}" data-keep="${m.k}" title="${kept ? "bleibt dauerhaft" : "verschwindet nächste Nacht – antippen zum Festheften"}">📌</button>` : ""}${helpBtn(m.k)}</span>`;
  };

  function amnSelect(i) {
    const s = game.seats[i], cur = s.amn || {};
    const cats = [...new Set(AMNESIAC_IDEAS.map(x => x.cat))];
    return `<div class="box amnbox"><h4>❓ Geheime Fähigkeit des Amnesikers</h4>
      <select id="amnsel"><option value="">– Idee wählen –</option>${cats.map(c => `<optgroup label="${esc(c)}">${AMNESIAC_IDEAS.filter(x => x.cat === c).map(x => `<option value="${x.k}" ${cur.k === x.k ? "selected" : ""}>${esc(x.text)}${x.like ? ` (wie ${esc(roleName(x.like))})` : ""}</option>`).join("")}</optgroup>`).join("")}<option value="_own" ${cur.k === "_own" ? "selected" : ""}>✏️ Eigene Fähigkeit …</option></select>
      <textarea id="amntext" rows="2" placeholder="Eigene Fähigkeit beschreiben" ${cur.k === "_own" ? "" : "hidden"}>${cur.k === "_own" ? esc(cur.text) : ""}</textarea>
      <div class="row wrap"><button class="btn sm" id="amnrand">🎲 Würfeln</button><button class="btn sm primary" id="amnsave">Speichern</button>${cur.known ? `<span class="small okmsg">✅ erraten</span>` : ""}</div>
      <p class="small">${cur.like ? `Nachts wird er wie <b>${esc(roleName(cur.like))}</b> geweckt – mit Aufgabe und Info-Vorschlag. Sein Handy verrät die Rolle nicht.` : "Bei eigener Fähigkeit weckst du ihn im Schritt „Amnesiker“."}</p></div>`;
  }
  function setAmn(s, k, text) {
    const idea = amnIdea(k);
    s.amn = idea ? { k, text: idea.text, like: idea.like || null, pick: !!idea.pick, known: s.amn && s.amn.k === k ? s.amn.known : false } : { k: "_own", text: text || "", like: null, pick: true, known: false };
  }

  function seatModal(i) {
    const s = game.seats[i];
    if (!s) return;
    const shown = shownRole(s.role);
    const cer = s.alive && game.seats.some(x => x.role === "cerenovus");
    openModal(`<h2>${i + 1}. ${esc(s.name)}</h2>
      <p>${roleChip(s.role, s.trav || s.align ? (seatGood(s) ? " · gut" : " · böse") : "")}
        ${shown !== s.role ? `<span class="small">(glaubt: ${esc(roleName(shown))})</span>` : ""}</p>
      <div class="row wrap">
        <span class="hint-pair"><button class="btn" data-m="alive">${s.alive ? "❤️ lebt → tot setzen" : "💀 tot → wiederbeleben"}</button>${helpBtn("s:alive")}</span>
        ${s.alive ? "" : `<span class="hint-pair"><button class="btn" data-m="ghost">${s.ghost ? "👻 Geisterstimme frei" : "🚫 Stimme verbraucht"}</button>${helpBtn("s:ghost")}</span>`}
      </div>
      <div class="mkhelp hidden" id="mkhelp"></div>
      <h3>Marker</h3>
      <p class="small">Tippe ⓘ für eine Erklärung. Marker mit 🌙 verschwinden in der nächsten Nacht von selbst.</p>
      <div class="mkgrid">${GENERIC_MARKERS.map(m => markerChip(s, m)).join("")}</div>
      ${markersInPlay().length ? `<h4 class="mk-sub">Marker der Rollen im Spiel</h4><div class="mkgrid">${markersInPlay().map(m => markerChip(s, m)).join("")}</div>` : ""}
      ${pidSelect(i)}
      <label class="field">Notiz ${helpBtn("s:note")}: <input id="m-note" value="${esc(s.note || "")}" placeholder="z. B. Meister des Butlers"></label>
      <div class="row wrap">
        <button class="btn" data-m="info">ℹ️ Rolle</button>
        ${isBot(s) || s.pid ? `<button class="btn" data-m="phone">${isBot(s) ? "🤖" : "📱"} Handy ansehen</button>` : ""}
        ${s.grim ? `<button class="btn" data-m="spyhide">🙈 Grimoire vom Handy entfernen</button>` : ""}
        <button class="btn" data-m="change">🔁 Rolle ändern</button>
        ${cer ? `<span class="hint-pair"><button class="btn" data-m="mad">😵 Wahnsinn</button>${helpBtn("s:mad")}</span>` : ""}
        ${ONCE_PER_GAME.includes(s.role) && s.role !== "philosopher" ? `<span class="hint-pair"><button class="btn ${s.used ? "used" : ""}" data-m="used">${s.used ? "✔ Fähigkeit benutzt" : "○ Fähigkeit frei"}</button>${helpBtn("s:used")}</span>` : ""}
      </div>
      ${s.role === "philosopher" ? philoSelect(i) : ""}
      ${s.role === "amnesiac" ? amnSelect(i) : ""}
      <div class="row end"><button class="btn primary" data-m="close">Fertig</button></div>`);
    const root = $("#modal-content");
    const again = () => { save(); renderSL(); seatModal(i); };
    root.querySelectorAll("[data-mk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.mk, m = s.marks || [];
      s.marks = m.includes(k) ? m.filter(x => x !== k) : [...m, k];
      if (!s.marks.includes(k)) s.keep = (s.keep || []).filter(x => x !== k);
      markHist(s, k, s.marks.includes(k));
      again();
    }));
    root.querySelectorAll("[data-keep]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.keep, kp = s.keep || [];
      s.keep = kp.includes(k) ? kp.filter(x => x !== k) : [...kp, k];
      toast(s.keep.includes(k) ? "📌 Bleibt dauerhaft, bis du es entfernst" : "🌙 Verschwindet in der nächsten Nacht");
      again();
    }));
    root.querySelector("#m-note").addEventListener("input", e => { s.note = e.target.value; save(); });
    if (root.querySelector("#amnsel")) {
      root.querySelector("#amnsel").addEventListener("change", e => { root.querySelector("#amntext").hidden = e.target.value !== "_own"; });
      root.querySelector("#amnrand").addEventListener("click", () => { const inPlay = new Set(game.seats.map(x => x.role)); const pool = AMNESIAC_IDEAS.filter(x => !x.like || !inPlay.has(x.like)); setAmn(s, pool[randInt(pool.length)].k); hist(`❓ ${s.name} (Amnesiker) hat eine neue geheime Fähigkeit`); again(); });
      root.querySelector("#amnsave").addEventListener("click", () => { const v = root.querySelector("#amnsel").value; if (!v) return; setAmn(s, v, root.querySelector("#amntext").value.trim()); hist(`❓ Geheime Fähigkeit von ${s.name}: ${s.amn.text}`); again(); toast("❓ Fähigkeit gespeichert"); });
    }
    // ⓘ-Erklärungen
    root.querySelectorAll("[data-help]").forEach(b => b.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const key = b.dataset.help, box = root.querySelector("#mkhelp");
      let title, text;
      if (key.startsWith("s:")) { title = { alive: "Lebt / tot", ghost: "Geisterstimme", mad: "Wahnsinn", used: "Fähigkeit benutzt", note: "Notiz" }[key.slice(2)]; text = STATUS_HELP[key.slice(2)]; }
      else { const m = markerByKey(key); title = `${m.i} ${m.l}${m.role ? ` (${roleName(m.role)})` : ""}`; text = m.d + (m.n ? " 🌙 Verschwindet in der nächsten Nacht." : ""); }
      const same = !box.classList.contains("hidden") && box.dataset.key === key;
      box.dataset.key = key;
      box.innerHTML = `<b>${esc(title)}</b><p>${esc(text)}</p>`;
      box.classList.toggle("hidden", same);
      if (!same) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
    root.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.m;
      if (a === "alive") { s.alive = !s.alive; if (s.alive) { s.ghost = true; s.zfake = false; } histDeath(s); if (s.alive) swRevert(i); else swCheck(s); again(); }
      else if (a === "ghost") { s.ghost = !s.ghost; again(); }
      else if (a === "used") { s.used = !s.used; delete s.usedNight; again(); }
      else if (a === "info") openModal(roleDetail(ROLE_BY_ID[s.role], true));
      else if (a === "phone") showBotPhone(i);
      else if (a === "spyhide") { closeModal(); spyGrimHide(); }
      else if (a === "change") changeRole(i);
      else if (a === "mad") madnessDialog(i);
      else { closeModal(); renderSL(); }
    }));
    root.querySelectorAll("[data-philo]").forEach(sel => sel.addEventListener("change", () => { setPhilo(i, sel.value); seatModal(i); }));
    root.querySelectorAll("[data-pid]").forEach(sel => sel.addEventListener("change", () => { setSeatPid(i, sel.value); renderSL(); seatModal(i); }));
  }

