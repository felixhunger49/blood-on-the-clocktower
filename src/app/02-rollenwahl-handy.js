  // =====================================================================
  //  ROLLE WÄHLEN UND DEM SPIELLEITER ZEIGEN (Philosoph & Co.)
  // =====================================================================
  // Rollen, die nachts eine Rolle auswählen. Der Spieler wählt auf seinem Handy und hält es dem Spielleiter hin.
  const PICKERS = {
    philosopher: { title: "Deine Wahl als Philosoph", hint: "Wähle einmal im Spiel nachts eine gute Rolle, deren Fähigkeit du bekommst.", pool: "good", keep: true },
    courtier: { title: "Rolle betrunken machen", hint: "Einmal im Spiel: Wähle nachts eine Rolle, die 3 Tage und Nächte betrunken ist.", pool: "all" },
    gambler: { title: "Rolle raten", hint: "Zeige auf einen Spieler und wähle hier die Rolle, die du für seine hältst.", pool: "all" },
    cerenovus: { title: "Wahnsinns-Rolle wählen", hint: "Zeige auf einen Spieler und wähle die gute Rolle, die er morgen spielen muss.", pool: "good" },
    pithag: { title: "Neue Rolle wählen", hint: "Zeige auf einen Spieler und wähle die Rolle, die er werden soll.", pool: "all" },
    ojo: { title: "Rolle töten", hint: "Wähle die Rolle, deren Besitzer heute Nacht stirbt.", pool: "all" }
  };

  function pickerHtml(mine) {
    const cfg = PICKERS[mine.r];
    if (!cfg) return "";
    const ed = mine.sc ? "custom" : ROLE_BY_ID[mine.r].ed;
    const pool = ROLES.filter(r => inEd(r, ed, mine.sc) && r.t !== "traveller" && r.t !== "fabled" && r.id !== mine.r && (cfg.pool === "all" || r.t === "townsfolk" || r.t === "outsider"));
    const chosen = cfg.keep && mine.pick ? ROLE_BY_ID[mine.pick] : null;
    return `<section class="panel picker">
      <h3>🧠 ${esc(cfg.title)}</h3>
      <p class="small">${esc(cfg.hint)} Wenn der Spielleiter dich weckt: Rolle auswählen und ihm das Handy hinhalten.</p>
      ${chosen ? `<div class="box"><h4>Du hast gewählt: ${esc(chosen.de)}</h4><p>${esc(chosen.a)}</p></div>` : ""}
      <select id="pickrole">
        <option value="">– Rolle auswählen –</option>
        ${["townsfolk", "outsider", "minion", "demon"].map(t => {
          const list = pool.filter(r => r.t === t);
          return list.length ? `<optgroup label="${TEAMS[t].plural}">${list.map(r => `<option value="${r.id}" ${chosen && chosen.id === r.id ? "selected" : ""}>${esc(r.de)}</option>`).join("")}</optgroup>` : "";
        }).join("")}
      </select>
      <button class="btn primary" id="showpick">📱 Dem Spielleiter zeigen</button>
      ${chosen ? `<button class="btn sm" id="clearpick">Wahl zurücksetzen</button>` : ""}
    </section>`;
  }

  function bindPicker(mine) {
    const cfg = PICKERS[mine.r];
    if (!cfg) return;
    const show = () => {
      const id = $("#pickrole").value;
      if (!id) { toast("Bitte zuerst eine Rolle auswählen."); return; }
      const r = ROLE_BY_ID[id];
      if (cfg.keep) { mine.pick = id; store.set("botc.myrole", mine); }
      if (mine.online) sendToHost({ type: "pick", role: mine.r, pick: id }).then(ok => {
        const el = $("#picksent");
        if (el) el.textContent = ok ? "✓ Automatisch an den Spielleiter gesendet" : "Konnte nicht gesendet werden – zeig dem Spielleiter das Handy.";
      });
      openModal(`<div class="nightshow pickshow">
          <p class="ns-label">${esc(ROLE_BY_ID[mine.r].de)}${mine.n ? " · " + esc(mine.n) : ""}</p>
          <h2>Ich wähle</h2>
          <div class="ns-bluff t-${r.t}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small></div>
          ${mine.online ? `<p id="picksent" class="small">Wird an den Spielleiter gesendet …</p>` : ""}
        </div>
        <div class="row center"><button class="btn big" id="pickdone">✓ Fertig – verdecken</button></div>`, "full night");
      $("#pickdone").addEventListener("click", () => { closeModal(); renderPlayer(); });
    };
    $("#showpick").addEventListener("click", show);
    $("#clearpick") && $("#clearpick").addEventListener("click", () => {
      delete mine.pick; store.set("botc.myrole", mine); renderPlayer();
    });
  }

