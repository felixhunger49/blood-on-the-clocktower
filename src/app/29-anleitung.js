  // =====================================================================
  //  ANLEITUNG
  // =====================================================================
  function renderGuide() {
    view.innerHTML = installPanel() + `<section class="panel"><h2>Anleitung</h2>
      ${GUIDE.filter(g => g.id !== "online" || Net.configured()).map((g, i) => `<details class="guide" ${i < 2 ? "open" : ""}><summary>${esc(g.title)}</summary><div class="guide-body">${g.html}</div></details>`).join("")}
      </section>`;
    const tbl = $("#setup-table");
    if (tbl) {
      tbl.innerHTML = `<table class="setup"><thead><tr><th>Spieler</th><th class="t-townsfolk-text">Dorfb.</th><th class="t-outsider-text">Außens.</th><th class="t-minion-text">Schergen</th><th class="t-demon-text">Dämon</th></tr></thead><tbody>${
        Object.entries(SETUP_COUNTS).map(([n, c]) => `<tr><td>${n === "4" ? "4*" : n}</td>${c.map(x => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="small">* 4 Spieler ist eine inoffizielle Notvariante ohne Schergen.</p>`;
    }
    bindInstall();
  }

