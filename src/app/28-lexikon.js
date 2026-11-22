  // =====================================================================
  //  ROLLEN-LEXIKON
  // =====================================================================
  let lexFilter = { ed: null, team: "all", q: "" };

  function roleDetail(r, forST) {
    const jx = JINXES.filter(([a, b]) => a === r.id || b === r.id);
    return `<div class="lex-detail">
      <div class="lex-title t-${r.t}-text"><b>${r.ic} ${esc(r.de)}</b> <span class="small">${esc(r.en)} · ${TEAMS[r.t].name} · ${esc(EDITIONS[r.ed].name)}</span></div>
      <p class="ability-line">${esc(r.a)}</p>
      <p>${esc(r.e)}</p>
      ${jx.length ? `<details class="jinx-role"><summary class="small">🧞 ${jx.length} Jinx${jx.length > 1 ? "es" : ""} mit anderen Rollen</summary><ul class="small">${jx.map(([a, b, de]) => { const o = a === r.id ? b : a; return `<li><b>${ROLE_BY_ID[o].ic} ${esc(roleName(o))}:</b> ${esc(de)}</li>`; }).join("")}</ul></details>` : ""}
      ${r.tip ? `<p><b>💡 Tipp:</b> ${esc(r.tip)}</p>` : ""}
      ${r.setup ? `<p><b>⚙️ Aufbau:</b> ${esc(r.setup)}</p>` : ""}
      ${forST || r.st || r.n1 || r.n ? `<div class="st-notes">
        ${r.st ? `<p><b>📜 Spielleiter:</b> ${esc(r.st)}</p>` : ""}
        ${r.n1 ? `<p><b>🌙 Erste Nacht:</b> ${esc(r.n1)}</p>` : ""}
        ${r.n ? `<p><b>🌑 Andere Nächte:</b> ${esc(r.n)}</p>` : ""}
      </div>` : ""}
    </div>`;
  }

  function renderLex() {
    const sc = gameScript();
    if (!lexFilter.ed || (lexFilter.ed === "game" && !sc)) {
      const si = scriptInfo(), ed = si && !sc ? Object.keys(EDITIONS).find(k => EDITIONS[k].name === si.name) : null;
      lexFilter.ed = sc ? "game" : ed || "all";
    }
    view.innerHTML = `
      <section class="panel">
        <h2>Alle Rollen</h2>
        <input id="lexq" class="search" placeholder="🔍 Rolle suchen …" value="${esc(lexFilter.q)}">
        <div class="chips">
          ${sc ? `<button class="chip ${lexFilter.ed === "game" ? "on" : ""}" data-led="game">📜 Euer Spiel</button>` : ""}
          <button class="chip ${lexFilter.ed === "all" ? "on" : ""}" data-led="all">Alle</button>
          ${Object.entries(EDITIONS).filter(([k]) => k !== "custom").map(([k, e]) => `<button class="chip ${lexFilter.ed === k ? "on" : ""}" data-led="${k}">${e.name}</button>`).join("")}
        </div>
        <div class="chips">
          <button class="chip ${lexFilter.team === "all" ? "on" : ""}" data-lteam="all">Alle Typen</button>
          ${Object.entries(TEAMS).map(([k, t]) => `<button class="chip t-${k}-chip ${lexFilter.team === k ? "on" : ""}" data-lteam="${k}">${t.plural}</button>`).join("")}
        </div>
      </section>
      ${lexFilter.ed === "game" && sc ? jinxHtml(sc, "Sonderregeln eures Skripts") : ""}
      ${(() => {
        if (lexFilter.ed === "game" && sc) return nightOrderHtml(sc, "Euer Spiel");
        if (EDITIONS[lexFilter.ed] && lexFilter.ed !== "custom") return nightOrderHtml(ROLES.filter(r => r.ed === lexFilter.ed).map(r => r.id), EDITIONS[lexFilter.ed].name);
        return "";
      })()}
      <div id="lexlist"></div>`;
    const draw = () => {
      const q = lexFilter.q.toLowerCase();
      const list = ROLES.filter(r => (lexFilter.ed === "all" || (lexFilter.ed === "game" ? sc.includes(r.id) : r.ed === lexFilter.ed))
        && (lexFilter.team === "all" || r.t === lexFilter.team)
        && (!q || (r.de + " " + r.en + " " + r.a).toLowerCase().includes(q)));
      let html = "";
      const sections = lexFilter.ed === "game"
        ? [["game", "📜 Rollen in eurem Spiel", `${list.length} Rollen`, list]]
        : Object.keys(EDITIONS).filter(k => k !== "custom").map(ed => [ed, EDITIONS[ed].name, EDITIONS[ed].de, list.filter(r => r.ed === ed)]);
      sections.forEach(([ed, title, sub, part]) => {
        if (!part.length) return;
        html += `<section class="panel"><h2>${esc(title)} <span class="small">(${esc(sub)})</span></h2>`;
        Object.keys(TEAMS).forEach(team => {
          const tp = part.filter(r => r.t === team);
          if (!tp.length) return;
          html += `<h3 class="team-h t-${team}-text">${TEAMS[team].plural}</h3>`;
          html += tp.map(r => `<details class="lex t-${team}-border"><summary><span class="lex-ic">${r.ic}</span><b>${esc(r.de)}</b> <span class="small">${esc(r.en)}</span><span class="lex-a">${esc(r.a)}</span></summary>${roleDetail(r, false)}</details>`).join("");
        });
        html += `</section>`;
      });
      $("#lexlist").innerHTML = html || `<p class="panel">Keine Rolle gefunden.</p>`;
    };
    draw();
    $("#lexq").addEventListener("input", e => { lexFilter.q = e.target.value; draw(); });
    $$("[data-led]").forEach(b => b.addEventListener("click", () => { lexFilter.ed = b.dataset.led; renderLex(); }));
    $$("[data-lteam]").forEach(b => b.addEventListener("click", () => { lexFilter.team = b.dataset.lteam; renderLex(); }));
  }

