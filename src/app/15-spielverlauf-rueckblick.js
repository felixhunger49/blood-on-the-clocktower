  // =====================================================================
  //  SPIELVERLAUF
  // =====================================================================
  function hist(text, ph) {
    game.history = [...(game.history || []), { n: game.nightNo || 1, ph: ph || game.phase || "night", t: text, at: Date.now() }].slice(-200);
  }
  // Wichtige Zustände im Spielverlauf festhalten (Gift, Trunkenheit, Schutz)
  const MARK_HIST = { poison: ["🧪", "ist vergiftet", "ist nicht mehr vergiftet"], drunk: ["🍺", "ist betrunken", "ist nicht mehr betrunken"], protect: ["🛡️", "ist geschützt", null] };
  function markHist(x, k, on, by) {
    const h = MARK_HIST[k];
    if (!h || (!on && !h[2])) return;
    hist(`${h[0]} ${x.name} ${on ? h[1] : h[2]}${on && by ? ` (${by})` : ""}`);
  }
  // Für den Mathematiker: Fähigkeiten, die wegen einer anderen Rolle nicht normal gewirkt haben
  function abn(x, text) {
    if (!x) return;
    game.abnLog = [...(game.abnLog || []), { at: Date.now(), name: x.name, text }].slice(-60);
  }
  function histDeath(x) {
    const r = ROLE_BY_ID[x.role];
    hist(x.alive ? `✨ ${x.name} lebt wieder` : `💀 ${x.name} ist gestorben (${r.ic} ${r.de})`);
    const last = game.history[game.history.length - 1];
    if (last) last[x.alive ? "alive" : "dead"] = x.name;
    if (!x.alive) setTimeout(() => deathTriggers(x), 0);
  }
  // Abstimmungen aller Tage in kompakter Form (für den Rückblick, auch an die Handys)
  function recapDays() {
    return Object.entries(game.days || {}).map(([d, v]) => ({
      d: +d,
      noms: (v.noms || []).map(n => ({ by: n.by, on: n.on, c: n.count || 0, h: n.hands || [], vg: !!n.virgin })),
      ex: v.exec && v.exec !== "none" && !v.exec.survived ? v.exec.seat : null
    })).filter(x => x.noms.length || x.ex !== null).sort((a, b) => a.d - b.d);
  }
  // Rückblick: Wer hat wann wofür gestimmt + kleine Auszeichnungen
  function recapHtml(days, people, history) {
    if (!people || !people.length) return "";
    const N = k => people[k] ? esc(String(people[k].n).replace(/^🤖\s*/, "")) : "?";
    const G = k => people[k] && people[k].good;
    const badge = k => `<span class="rc-al ${G(k) ? "g" : "e"}">${G(k) ? "😇" : "😈"}</span>`;
    const voteHtml = (days || []).map(d => `<div class="hgroup day"><div class="hhead">☀️ Tag ${d.d}</div><ul class="rc-noms">${d.noms.map(n => {
      const exec = d.ex === n.on && !n.vg;
      return `<li class="${exec ? "rc-exec" : ""}"><b>${N(n.by)}</b> → <b>${N(n.on)}</b> ${badge(n.on)}
        ${n.vg ? `<span class="small">👰 Jungfrau – ${N(n.by)} wurde sofort hingerichtet</span>` : `<span class="small">${n.c} Stimme(n)${exec ? " · ⚔️ hingerichtet" : ""}</span>
        ${n.h.length ? `<div class="rc-hands">✋ ${n.h.map(k => `<span class="${G(k) ? "g" : "e"}">${N(k)}</span>`).join(" ")}</div>` : ""}`}</li>`;
    }).join("")}</ul></div>`).join("");
    // Auszeichnungen
    const st = people.map(() => ({ onEvil: 0, onGood: 0, nom: 0, nomEvil: 0, imp: 0 }));
    (days || []).forEach(d => d.noms.forEach(n => {
      if (st[n.on]) st[n.on].nom++;
      if (st[n.by] && !G(n.on)) st[n.by].nomEvil++;
      n.h.forEach(k => { if (st[k]) st[k][G(n.on) ? "onGood" : "onEvil"]++; });
    }));
    (history || []).forEach(h => {
      const m = String(h.t || "").match(/^(?:🧪|🍺) (.+) ist (?:vergiftet|betrunken)/);
      if (m) { const k = people.findIndex(p => p.n === m[1]); if (k >= 0) st[k].imp++; }
    });
    const best = (f, filter) => { let bk = -1, bv = 0; st.forEach((x, k) => { if (filter(k) && f(x) > bv) { bv = f(x); bk = k; } }); return bk >= 0 ? [bk, bv] : null; };
    const aw = [];
    const sniff = best(x => x.onEvil * 2 + x.nomEvil * 3 - x.onGood, k => G(k));
    if (sniff) aw.push(["🎯", "Bester Riecher", `${N(sniff[0])} – hat am häufigsten gegen das Böse gestimmt oder es nominiert`]);
    const fooled = best(x => x.onGood, k => G(k));
    if (fooled && fooled[1] >= 2) aw.push(["🙈", "Auf der falschen Spur", `${N(fooled[0])} – ${fooled[1]}× für einen Guten gestimmt`]);
    const target = best(x => x.nom, () => true);
    if (target && target[1] >= 2) aw.push(["🎯", "Meistnominiert", `${N(target[0])} – ${target[1]}× nominiert`]);
    const sly = best(x => x.onGood * 2 - x.onEvil, k => !G(k));
    if (sly && sly[1] >= 2) aw.push(["🦊", "Geschickter Lenker (böse)", `${N(sly[0])} – hat Gute aufs Schafott gestimmt`]);
    const imp = best(x => x.imp, () => true);
    if (imp && imp[1] >= 1) aw.push(["🧪", "Am meisten getäuscht", `${N(imp[0])} – ${imp[1]}× vergiftet oder betrunken`]);
    if (!voteHtml && !aw.length) return "";
    return `<details class="history recap" open><summary><h3>🎬 Rückblick</h3></summary>
      ${aw.length ? `<div class="rc-awards">${aw.map(([i, t, d]) => `<div class="rc-aw"><span class="rc-ic">${i}</span><div><b>${esc(t)}</b><br><span class="small">${d}</span></div></div>`).join("")}</div>` : ""}
      ${voteHtml ? `<h4>🗳️ Wer hat wofür gestimmt?</h4><p class="small">😇 = gut, 😈 = böse · rot markierte Namen haben böse gespielt</p>${voteHtml}` : ""}
    </details>`;
  }
  function historyHtml(h) {
    if (!h || !h.length) return "";
    const groups = [];
    h.forEach(e => {
      const key = `${e.n}-${e.ph}`;
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { g = { key, n: e.n, ph: e.ph, items: [] }; groups.push(g); }
      g.items.push(e.t);
    });
    return `<details class="history" open><summary><h3>📜 Spielverlauf</h3></summary>
      ${groups.map(g => `<div class="hgroup ${g.ph}"><div class="hhead">${g.ph === "day" ? `☀️ Tag ${g.n}` : `🌙 Nacht ${g.n}`}</div>
        <ul>${g.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
    </details>`;
  }

