  // =====================================================================
  //  EIGENE ROLLENLISTE
  // =====================================================================
  function scriptCounts(list) {
    const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
    list.forEach(id => { const r = ROLE_BY_ID[id]; if (r && c[r.t] !== undefined) c[r.t]++; });
    return c;
  }
  // Jinxes, die für eine Rollenliste gelten (beide Rollen auf der Liste)
  function jinxesFor(ids) {
    const set = new Set(ids);
    return JINXES.filter(([a, b]) => set.has(a) && set.has(b));
  }
  function jinxHtml(ids, title) {
    const js = jinxesFor(ids);
    if (!js.length) return "";
    return `<div class="box jinx"><h4>🧞 ${esc(title || "Djinn-Sonderregeln")} (${js.length})</h4>
      <p class="small">Diese Rollen-Paare beißen sich. Verkünde die Regeln zu Spielbeginn allen – auch wenn die Rollen gar nicht im Spiel sind.</p>
      <ul>${js.map(([a, b, de, en]) => `<li><b>${ROLE_BY_ID[a].ic} ${esc(roleName(a))} + ${ROLE_BY_ID[b].ic} ${esc(roleName(b))}:</b> ${esc(de)} <details class="jinx-en"><summary class="small">Original</summary><span class="small">${esc(en)}</span></details></li>`).join("")}</ul></div>`;
  }

  // Für wie viele Spieler reicht eine Rollenliste? (fehlende Dorfbewohner dürfen durch Außenseiter ersetzt werden)
  function scriptFit(n) {
    if (game.edition !== "custom") return null;
    const pool = t => ROLES.filter(r => inEd(r, "custom") && r.t === t && !smallExcluded(r.id, n)).length;
    const fits = k => {
      const b = SETUP_COUNTS[k]; if (!b) return false;
      const tf = pool("townsfolk"), os = pool("outsider");
      return pool("demon") >= b[3] && pool("minion") >= b[2] && tf + Math.max(0, os - b[1]) >= b[0] && os + tf >= b[0] + b[1];
    };
    let max = 0; for (let k = 5; k <= 15; k++) if (fits(k)) max = k;
    const b = SETUP_COUNTS[n] || [0, 0, 0, 0], tf = pool("townsfolk");
    return { ok: fits(n), max, tf, needTf: b[0], fill: fits(n) && tf < b[0] ? b[0] - tf : 0 };
  }
  function scriptFitHtml() {
    const f = scriptFit(game.count);
    if (!f) return "";
    if (!f.ok) return `<p class="error">⚠️ Diese Rollenliste reicht nur für <b>bis zu ${f.max || "?"} Spieler</b> – für ${game.count} Spieler fehlen Rollen${f.tf < f.needTf ? ` (sie hat nur ${f.tf} Dorfbewohner, nötig wären ${f.needTf})` : ""}. ${f.max <= 7 ? "Das ist ein Skript für kleine Runden (Teensyville)." : ""} Ergänze Rollen über „✏️ Rollenliste bearbeiten“ oder spielt mit weniger Spielern.</p>`;
    if (f.fill) return `<p class="warnmsg">ℹ️ Diese Rollenliste hat nur ${f.tf} Dorfbewohner – für ${game.count} Spieler sind ${f.needTf} vorgesehen. Beim automatischen Auswählen ersetzt die App ${f.fill === 1 ? "den fehlenden" : `die ${f.fill} fehlenden`} durch Außenseiter. ${f.max <= 7 ? "(Skript für kleine Runden – gedacht für bis zu " + f.max + " Spieler ohne Ersatz.)" : ""}</p>`;
    return "";
  }
  function scriptSummary() {
    const sc = game.script || [];
    const c = scriptCounts(sc);
    const max = SETUP_COUNTS[15];
    const warn = [];
    if (!c.demon) warn.push("mindestens 1 Dämon");
    if (c.townsfolk < SETUP_COUNTS[game.count][0] + 2) warn.push(`mehr Dorfbewohner (mind. ${SETUP_COUNTS[game.count][0] + 2} empfohlen)`);
    if (c.minion < SETUP_COUNTS[game.count][2]) warn.push(`mind. ${SETUP_COUNTS[game.count][2]} Schergen`);
    return `<div class="box script">
      <h4>📜 ${esc(game.scriptName || "Deine Rollenliste")} (${sc.length} Rollen)</h4>
      <p class="small">${c.townsfolk} Dorfbewohner · ${c.outsider} Außenseiter · ${c.minion} Schergen · ${c.demon} Dämonen${c.traveller ? ` · ${c.traveller} Reisende` : ""}</p>
      ${scriptFitHtml() || (warn.length ? `<p class="warnmsg">Tipp für ${game.count} Spieler: ${warn.join(", ")}.</p>` : "")}
      <div class="row wrap"><button class="btn primary" id="editscript">✏️ Rollenliste bearbeiten</button><button class="btn" id="importscript">📥 Skript importieren</button><button class="btn" id="exportscript">📤 Exportieren</button></div>
    </div>${jinxHtml(sc)}`;
  }
  // Tipps zur Ausgewogenheit der gewählten Rollen
