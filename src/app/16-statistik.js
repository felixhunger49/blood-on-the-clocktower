  // =====================================================================
  //  STATISTIK (auf dem Handy des Spielleiters)
  // =====================================================================
  function recordStats() {
    if (game.statsId || !game.winner) return;
    const id = Date.now();
    const entry = { id, d: new Date().toISOString().slice(0, 10), ed: game.edition, w: game.winner.team,
      ps: game.seats.map(x => ({ n: x.name, r: x.role, g: seatGood(x) })) };
    store.set("botc.stats", [...(store.get("botc.stats", []) || []), entry].slice(-500));
    game.statsId = id;
  }
  function unrecordStats() {
    if (!game.statsId) return;
    store.set("botc.stats", (store.get("botc.stats", []) || []).filter(e => e.id !== game.statsId));
    game.statsId = null;
  }
  function statsHtml() {
    const all = store.get("botc.stats", []) || [];
    if (!all.length) return `<section class="panel muted"><h3>📊 Statistik</h3><p class="small">Noch keine beendeten Spiele. Nach jedem Spiel („Sieg verkünden“) wird hier mitgezählt.</p></section>`;
    const good = all.filter(e => e.w === "good").length;
    const pl = {};
    all.forEach(e => e.ps.forEach(x => {
      const k = x.n.trim();
      const o = pl[k] = pl[k] || { n: k, games: 0, wins: 0, good: 0, roles: {} };
      o.games++;
      if (x.g === (e.w === "good")) o.wins++;
      if (x.g) o.good++;
      o.roles[x.r] = (o.roles[x.r] || 0) + 1;
    }));
    const rows = Object.values(pl).sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games);
    const top = o => Object.entries(o.roles).sort((a, b) => b[1] - a[1])[0];
    const pct = (a, b) => b ? Math.round(a / b * 100) + " %" : "–";
    return `<section class="panel stats"><details><summary><h3>📊 Statistik (${all.length} Spiel${all.length === 1 ? "" : "e"})</h3></summary>
      <div class="statbar"><span class="sg" style="flex:${good || 0.001}">😇 Gut ${good}</span><span class="se" style="flex:${all.length - good || 0.001}">😈 Böse ${all.length - good}</span></div>
      <table class="stattable"><thead><tr><th>Spieler</th><th>Spiele</th><th>Siege</th><th>Quote</th><th>Böse</th><th>oft</th></tr></thead>
      <tbody>${rows.map(o => { const t = top(o); return `<tr><td>${esc(o.n)}</td><td>${o.games}</td><td>${o.wins}</td><td>${pct(o.wins, o.games)}</td><td>${o.games - o.good}×</td><td title="${esc(roleName(t[0]))}">${ROLE_BY_ID[t[0]] ? ROLE_BY_ID[t[0]].ic : ""}</td></tr>`; }).join("")}</tbody></table>
      <p class="small">Gespeichert nur auf diesem Handy. Gleiche Namen werden zusammengezählt.</p>
      <div class="row end"><button class="btn sm danger" id="statsreset">Statistik löschen</button></div>
    </details></section>`;
  }

