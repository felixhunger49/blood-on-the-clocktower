  // =====================================================================
  //  YAGGABABBLE: geheimer Satz, Zähler am Tag, Opfer in der Nacht
  // =====================================================================
  const YAGGA_PHRASES = ["ehrlich gesagt", "Hand aufs Herz", "ich schwöre", "das ist verdächtig", "glaubt mir", "um ehrlich zu sein",
    "ganz ehrlich", "auf jeden Fall", "wie gesagt", "Moment mal", "unter uns", "meiner Meinung nach", "das passt nicht zusammen",
    "ich bin mir sicher", "das ergibt keinen Sinn", "ich frage mich", "interessant", "ganz klar", "ich vertraue dir", "Augen auf",
    "lasst uns mal", "ich hab ein gutes Gefühl", "das ist logisch", "Zufall?", "das sagt alles", "na gut", "mal ehrlich", "ich wette"];
  const yaggaSeat = () => game.seats.findIndex(y => y.role === "yaggababble");
  function yagga() {
    game.yagga = game.yagga || { phrase: "", days: {} };
    if (!game.yagga.phrase) game.yagga.phrase = YAGGA_PHRASES[randInt(YAGGA_PHRASES.length)];
    return game.yagga;
  }
  // Wie oft wurde der Satz an Tag d gesagt?
  const yaggaCount = d => ((game.yagga || {}).days || {})[d] || 0;
  function yaggaStepHtml() {
    const y = yagga(), i = yaggaSeat(), x = game.seats[i];
    if (!x) return "";
    if (game.nightNo === 1) {
      const sent = (x.infos || []).some(f => f.yg === y.phrase);
      return `<div class="yagga"><p>🗣️ Geheimer Satz: <b>„${esc(y.phrase)}“</b></p>
        <div class="row wrap"><button class="btn sm" data-ygnew="1">🎲 Anderer Satz</button><button class="btn sm" data-ygown="1">✏️ Eigener</button>
        <button class="btn sm ${sent ? "used" : "primary"}" data-ygsend="1">${sent ? "✔ Gesendet" : game.online || game.test ? "📱 Aufs Handy senden" : "✔ Gezeigt"}</button></div>
        <p class="small">Gut: natürlich klingend, aber nicht so alltäglich, dass er aus Versehen fällt. Am Tag zählst du im Abstimmungsbereich mit.</p></div>`;
    }
    const n = yaggaCount(game.nightNo - 1);
    const a = (game.acts || []).find(q => q.night === game.nightNo && q.step === "yaggababble" && !q.undone);
    return `<div class="yagga"><p>🗣️ Satz „${esc(y.phrase)}“ wurde an Tag ${game.nightNo - 1} <b>${n}×</b> gesagt → bis zu <b>${n}</b> Spieler dürfen sterben (du entscheidest, wie viele).</p>
      ${a ? `<p class="okmsg">💀 Gewählt: ${a.picks.length ? a.picks.map(k => esc(game.seats[k].name)).join(", ") : "niemand"}</p>` : ""}
      ${n ? `<button class="btn sm primary" data-ygkill="1">💀 ${a ? "Opfer ändern" : "Opfer wählen"}</button>` : `<p class="small">Heute stirbt durch den Yaggababble niemand.</p>`}
      <p class="small">Schutz (Mönch, Soldat …), Vergiftung und der Exorzist werden beim Morgen automatisch beachtet.</p></div>`;
  }
  function gossipStepHtml() {
    const d = (game.days || {})[game.nightNo - 1];
    const a = (game.acts || []).find(q => q.night === game.nightNo && q.step === "gossip" && !q.undone);
    if (!d || !d.gossipTrue) return `<p class="small">🗣️ Die Behauptung war laut Tagesbereich nicht wahr (oder nicht eingetragen) – niemand stirbt.</p>`;
    return `<div class="yagga"><p>🗣️ Die Behauptung war wahr – <b>ein Spieler deiner Wahl stirbt</b>.</p>
      ${a ? `<p class="okmsg">💀 Gewählt: ${a.picks.map(k => esc(game.seats[k].name)).join(", ") || "niemand"}</p>` : ""}
      <label class="field">Opfer: ${pickList("gospick", [])}</label><button class="btn sm primary" data-gosk="1">💀 Festlegen</button></div>`;
  }
  function yaggaDayHtml() {
    const i = yaggaSeat();
    if (i < 0 || !(game.seats[i].alive || game.seats[i].zfake)) return "";
    const y = yagga(), n = yaggaCount(game.nightNo);
    return `<div class="box yagga">🗣️ <b>Yaggababble</b> – Satz „${esc(y.phrase)}“ heute öffentlich gesagt:
      <div class="row center"><button class="btn" data-ygc="-1">−</button><b class="yg-count">${n}×</b><button class="btn primary" data-ygc="1">+1</button></div>
      <p class="small">Nur zählen, was laut in der Runde gesagt wird (nicht beim Flüstern). Nur du siehst das.</p></div>`;
  }
  function bindYagga() {
    $$("[data-ygnew]").forEach(b => b.addEventListener("click", () => { const y = yagga(); let p; do { p = YAGGA_PHRASES[randInt(YAGGA_PHRASES.length)]; } while (p === y.phrase); y.phrase = p; save(); renderSL(); }));
    $$("[data-ygown]").forEach(b => b.addEventListener("click", () => { const v = prompt("Eigener geheimer Satz:", yagga().phrase); if (v && v.trim()) { yagga().phrase = v.trim(); save(); renderSL(); } }));
    $$("[data-ygsend]").forEach(b => b.addEventListener("click", () => {
      const y = yagga(), x = game.seats[yaggaSeat()];
      if (!x) return;
      x.infos = [...(x.infos || []), { n: game.nightNo, t: `🗣️ Dein geheimer Satz: „${y.phrase}“ – jedes Mal, wenn du ihn tagsüber öffentlich sagst, kann nachts ein Spieler sterben.`, yg: y.phrase }].slice(-10);
      hist(`🗣️ ${x.name} (Yaggababble) kennt seinen Satz: „${y.phrase}“`, "night");
      const d = game.done[game.nightNo] || []; if (!d.includes("yaggababble")) game.done[game.nightNo] = [...d, "yaggababble"];
      save(); renderSL(); toast(game.online || game.test ? `📱 ${x.name} sieht den Satz auf dem Handy` : `Zeig ${x.name} den Satz „${y.phrase}“`);
    }));
    $$("[data-ygc]").forEach(b => b.addEventListener("click", () => {
      const y = yagga(); y.days = y.days || {};
      y.days[game.nightNo] = Math.max(0, (y.days[game.nightNo] || 0) + +b.dataset.ygc);
      save(); const el = $(".yg-count"); if (el) el.textContent = y.days[game.nightNo] + "×";
    }));
    $$("[data-ygkill]").forEach(b => b.addEventListener("click", yaggaKillDialog));
    $$("[data-shabre]").forEach(b => b.addEventListener("click", () => {
      const t = game.seats[+b.dataset.shabre];
      t.alive = true; t.ghost = true; delete t.shabNight; histDeath(t);
      hist(`♻️ Der Shabaloth spuckt ${t.name} wieder aus – lebt wieder`, "night");
      save(); renderSL(); toast(`♻️ ${t.name} lebt wieder – verkünde es am Morgen`);
    }));
    $$("[data-mznew]").forEach(b => b.addEventListener("click", () => { const m = mez(); let w; do { w = MEZ_WORDS[randInt(MEZ_WORDS.length)]; } while (w === m.word); m.word = w; save(); renderSL(); }));
    $$("[data-mzown]").forEach(b => b.addEventListener("click", () => { const v = prompt("Eigenes geheimes Wort:", mez().word); if (v && v.trim()) { mez().word = v.trim(); save(); renderSL(); } }));
    $$("[data-mzsend]").forEach(b => b.addEventListener("click", () => {
      const m = mez(), x = game.seats.find(y => y.role === "mezepheles"); if (!x) return;
      x.infos = [...(x.infos || []), { n: game.nightNo, t: `🔤 Dein geheimes Wort: „${m.word}“ – der erste gute Spieler, der es sagt, wird in dieser Nacht böse.`, mz: m.word }].slice(-10);
      hist(`🔤 ${x.name} (Mezepheles) kennt sein Wort: „${m.word}“`, "night");
      const d = game.done[game.nightNo] || []; if (!d.includes("mezepheles")) game.done[game.nightNo] = [...d, "mezepheles"];
      save(); renderSL(); toast(game.online || game.test ? `📱 ${x.name} sieht das Wort auf dem Handy` : `Zeig ${x.name} das Wort „${m.word}“`);
    }));
    $("#mzsaid") && $("#mzsaid").addEventListener("click", () => {
      const k = +$("#mzpick").value, t = game.seats[k], m = mez();
      if (!seatGood(t)) { toast(`${t.name} ist böse – das zählt nicht`); return; }
      m.turn = { k, night: game.nightNo + 1 };
      hist(`🔤 ${t.name} hat das Wort des Mezepheles gesagt – wird heute Nacht böse`, "day");
      save(); renderSL();
    });
    $$("[data-ojok], [data-ojonone]").forEach(b => b.addEventListener("click", () => {
      const a = (game.acts || []).find(q => q.night === game.nightNo && q.step === "ojo" && !q.undone && !q.skip);
      if (!a) return;
      a.picks = b.dataset.ojonone ? [] : [+$("#ojopick").value];
      hist(`👁️ Ojo (Rolle nicht im Spiel): ${a.picks.length ? game.seats[a.picks[0]].name + " soll sterben" : "niemand stirbt"}`, "night");
      save(); renderSL();
    }));
    $$("[data-gosk]").forEach(b => b.addEventListener("click", () => {
      const k = +$("#gospick").value;
      game.acts = (game.acts || []).filter(q => !(q.night === game.nightNo && q.step === "gossip"));
      game.acts.push({ night: game.nightNo, i: game.seats.findIndex(y => y.role === "gossip"), step: "gossip", picks: [k], skip: false });
      const d = game.done[game.nightNo] || []; if (!d.includes("gossip")) game.done[game.nightNo] = [...d, "gossip"];
      hist(`🗣️ Klatschtante: ${game.seats[k].name} soll sterben`, "night"); save(); renderSL();
    }));
  }
  function yaggaKillDialog() {
    const i = yaggaSeat(), max = yaggaCount(game.nightNo - 1);
    const a = (game.acts || []).find(q => q.night === game.nightNo && q.step === "yaggababble" && !q.undone);
    const cur = new Set(a ? a.picks : []);
    openModal(`<h2>🗣️ Yaggababble: Opfer wählen</h2>
      <p>Der Satz wurde gestern <b>${max}×</b> gesagt – wähle <b>bis zu ${max}</b> Spieler (oder niemanden).</p>
      <div class="yglist">${game.seats.map((x, k) => x.alive && !x.trav && k !== i ? `<label class="switch"><input type="checkbox" data-ygk="${k}" ${cur.has(k) ? "checked" : ""}><span>${esc(x.name)} <small>(${esc(roleName(x.role))})</small></span></label>` : "").join("")}</div>
      <p class="small" id="yginfo"></p>
      <div class="row end"><button class="btn" id="ygcancel">Abbrechen</button><button class="btn primary" id="ygok">Speichern</button></div>`);
    const upd = () => { const c = $$("[data-ygk]:checked").length; $("#yginfo").textContent = `${c} von höchstens ${max} gewählt`; $$("[data-ygk]").forEach(e => { e.disabled = !e.checked && c >= max; }); };
    $$("[data-ygk]").forEach(e => e.addEventListener("change", upd)); upd();
    $("#ygcancel").addEventListener("click", closeModal);
    $("#ygok").addEventListener("click", () => {
      const picks = $$("[data-ygk]:checked").map(e => +e.dataset.ygk);
      game.acts = (game.acts || []).filter(q => !(q.night === game.nightNo && q.step === "yaggababble"));
      game.acts.push({ night: game.nightNo, i, step: "yaggababble", picks, skip: !picks.length });
      const d = game.done[game.nightNo] || []; if (!d.includes("yaggababble")) game.done[game.nightNo] = [...d, "yaggababble"];
      hist(`🗣️ Yaggababble: ${picks.length ? picks.map(k => game.seats[k].name).join(", ") + " sollen sterben" : "heute niemand"}`, "night");
      save(); closeModal(); renderSL();
    });
  }

  // Oger: wird die Gesinnung des gewählten Spielers (wirkt auch betrunken/vergiftet, er erfährt es nicht)
  function ogreBond(i, k) {
    const x = game.seats[i], t = game.seats[k];
    if (!t) return;
    let evil = !seatGood(t);
    if (t.role === "spy") evil = true; // Jinx: Der Spion gilt für den Oger als böse
    if (t.role === "recluse") toast("🛖 Einsiedler gewählt: Er darf für den Oger auch als böse gelten – ändere die Gesinnung des Ogers bei Bedarf (🔁)");
    if (x.stayEvil && !evil) evil = true;
    const before = seatGood(x);
    x.align = evil ? "e" : "g";
    hist(`🤝 ${x.name} (Oger) hat ${t.name} gewählt – der Oger ist jetzt ${evil ? "böse" : "gut"} (er erfährt es nicht)`, "night");
    if (before !== !evil) { game.ignoreEnd = null; toast(`🤝 Der Oger ist jetzt ${evil ? "böse" : "gut"} – er erfährt es nicht${evil && t.role !== "spy" ? "" : ""}`); }
  }
  function huntsmanCheck(i, k) {
    const x = game.seats[i], t = game.seats[k];
    if (!t || t.role !== "damsel") { hist(`🏹 ${x.name} (Jäger) wählt ${t ? t.name : "?"} – nicht die Jungfer`, "night"); return; }
    if (impaired(x)) { hist(`🏹 ${x.name} (Jäger) findet die Jungfer, ist aber vergiftet/betrunken – nichts passiert`, "night"); abn(x, "Jäger: Fähigkeit wirkt nicht"); return; }
    const inPlay = new Set(game.seats.map(y => y.role));
    const pool = ROLES.filter(r => inEd(r, game.edition) && r.t === "townsfolk" && !inPlay.has(r.id));
    const nr = pool[randInt(pool.length)];
    if (!nr) { toast("Kein freier Dorfbewohner im Skript – wähle die neue Rolle selbst (🔁)"); return; }
    hist(`🏹 ${x.name} (Jäger) hat die Jungfer ${t.name} gefunden – sie wird ${roleName(nr.id)}`, "night");
    t.role = nr.id; t.marks = (t.marks || []).filter(m => m !== "poison"); t.keep = (t.keep || []).filter(m => m !== "poison");
    toast(`🏹 Die Jungfer ${t.name} ist jetzt ${roleName(nr.id)}${reachable(t) ? " – sieht es auf dem Handy" : " – zeig es ihr"} (ändern über 🔁)`);
  }
  function professorRevive(i, k) {
    const x = game.seats[i], t = game.seats[k];
    if (!t) return;
    if (impaired(x)) { hist(`⚠️ ${x.name} (Professor) ist vergiftet/betrunken – ${t.name} bleibt tot`, "night"); abn(x, "Professor: Wiederbelebung wirkt nicht"); return; }
    if (t.alive) return;
    if (ROLE_BY_ID[t.role].t !== "townsfolk") { hist(`🎓 Professor wählt ${t.name} – kein Dorfbewohner, nichts passiert`, "night"); return; }
    t.alive = true; t.ghost = true; t.zfake = false; histDeath(t);
    toast(`🎓 ${t.name} (${roleName(t.role)}) wird wiederbelebt – verkünde es am Morgen`);
  }

  // ---------- Fähigkeiten, die beim eigenen Tod auslösen (Mondkind, Liebling) ----------
  function deathTriggers(x) {
    const i = game.seats.indexOf(x);
    if (i < 0 || x.alive) return;
    if (x.role === "moonchild" && !x.mcUsed && !impaired(x)) { x.mcUsed = true; whenFree(() => moonchildModal(i)); }
    if (x.role === "sweetheart" && !x.shUsed && !impaired(x)) { x.shUsed = true; whenFree(() => sweetheartModal(i)); }
  }
  // Fenster erst öffnen, wenn gerade keins offen ist
  function whenFree(fn, tries = 0) {
    if (modal.classList.contains("hidden") || tries > 40) fn(); else setTimeout(() => whenFree(fn, tries + 1), 500);
  }
  const pickList = (id, skip) => `<select id="${id}">${game.seats.map((y, k) => y.alive && !skip.includes(k) ? `<option value="${k}">${esc(y.name)} (${esc(roleName(y.role))})</option>` : "").join("")}</select>`;
  function moonchildModal(i) {
    const x = game.seats[i];
    openModal(`<h2>🌙 Das Mondkind ist gestorben</h2>
      <p><b>${esc(x.name)}</b> wählt jetzt öffentlich einen lebenden Spieler. Ist der gut, stirbt er heute Nacht.</p>
      <label class="field">Gewählt: ${pickList("mcpick", [i])}</label>
      <div class="row end"><button class="btn" id="mcno">Hat niemanden gewählt</button><button class="btn primary" id="mcok">Speichern</button></div>`);
    $("#mcno").addEventListener("click", closeModal);
    $("#mcok").addEventListener("click", () => {
      const k = +$("#mcpick").value, t = game.seats[k];
      t.marks = [...new Set([...(t.marks || []), "mc_chosen"])];
      if (seatGood(t)) { game.moonKill = { night: game.nightNo + 1, k }; hist(`🌙 ${x.name} (Mondkind) wählt ${t.name} – gut, stirbt heute Nacht`); }
      else hist(`🌙 ${x.name} (Mondkind) wählt ${t.name} – böse, nichts passiert`);
      save(); closeModal(); renderSL();
    });
  }
  function sweetheartModal(i) {
    const x = game.seats[i], alive = game.seats.map((y, k) => k).filter(k => game.seats[k].alive && k !== i);
    openModal(`<h2>💕 Der Liebling ist gestorben</h2>
      <p>Ein Spieler deiner Wahl ist ab jetzt <b>dauerhaft betrunken</b>.</p>
      <label class="field">Betrunken: ${pickList("shpick", [i])}</label>
      <div class="row end"><button class="btn primary" id="shok">Speichern</button></div>`);
    if (alive.length) $("#shpick").value = String(alive[randInt(alive.length)]);
    $("#shok").addEventListener("click", () => {
      const k = +$("#shpick").value, t = game.seats[k];
      setDrunk(k, "Liebling"); t.keep = [...new Set([...(t.keep || []), "drunk"])];
      hist(`💕 ${x.name} (Liebling) ist gestorben – ${t.name} ist ab jetzt betrunken`);
      save(); closeModal(); renderSL();
    });
  }

  // ---------- Boomdandy: wird er hingerichtet, sterben alle bis auf 3 ----------
  function boomdandyModal() {
    const alive = game.seats.map((y, k) => k).filter(k => game.seats[k].alive);
    openModal(`<h2>💣 Boomdandy wurde hingerichtet!</h2>
      <p>Alle außer <b>3 Spielern</b> sterben. Wähle die 3, die überleben:</p>
      <div class="yglist">${alive.map(k => `<label class="switch"><input type="checkbox" data-bd="${k}"><span>${esc(game.seats[k].name)}</span></label>`).join("")}</div>
      <p class="small" id="bdinfo"></p>
      <div class="row end"><button class="btn primary" id="bdok" disabled>Weiter</button></div>`);
    const upd = () => { const c = $$("[data-bd]:checked").length; $("#bdinfo").textContent = `${c} von 3 gewählt`; $("#bdok").disabled = c !== Math.min(3, alive.length); $$("[data-bd]").forEach(e => { e.disabled = !e.checked && c >= 3; }); };
    $$("[data-bd]").forEach(e => e.addEventListener("change", upd)); upd();
    $("#bdok").addEventListener("click", () => {
      const keep = $$("[data-bd]:checked").map(e => +e.dataset.bd);
      alive.filter(k => !keep.includes(k)).forEach(k => applyDeath(game.seats[k], deathRule(game.seats[k])));
      hist(`💣 Boomdandy: Alle außer ${keep.map(k => game.seats[k].name).join(", ")} sterben`, "day");
      openModal(`<h2>💣 Countdown 10 … 1</h2><p>Die drei zeigen gleichzeitig auf einen Spieler. Wer die meisten Finger hat, stirbt.</p>
        <label class="field">Meiste Finger: <select id="bdlast"><option value="">Gleichstand – niemand stirbt</option>${keep.map(k => `<option value="${k}">${esc(game.seats[k].name)}</option>`).join("")}</select></label>
        <div class="row end"><button class="btn primary" id="bdfin">Fertig</button></div>`);
      $("#bdfin").addEventListener("click", () => {
        const v = $("#bdlast").value;
        if (v !== "") { const t = game.seats[+v]; applyDeath(t, deathRule(t)); hist(`💣 ${t.name} hatte die meisten Finger und stirbt`, "day"); }
        game.ignoreEnd = null; game.endPopped = null;
        save(); closeModal(); renderSL();
      });
    });
  }

  // Wirkungen zu Beginn einer Nacht
  function nightStartEffects() {
    const n = game.nightNo, S = game.seats;
    // Xaan: In Nacht X sind alle Dorfbewohner bis zur Dämmerung vergiftet
    const xa = S.find(x => x.role === "xaan" && x.alive && !impaired(x));
    if (xa && game.xaanX && game.xaanX === n) {
      S.forEach((x, k) => { if (ROLE_BY_ID[x.role].t === "townsfolk" && !(x.marks || []).includes("poison")) { x.marks = [...(x.marks || []), "poison"]; } });
      hist(`🌘 Xaan: Nacht ${n} – alle Dorfbewohner sind bis zur Dämmerung vergiftet`, "night");
      setTimeout(() => toast(`🌘 Xaan: Heute Nacht (Nacht ${n}) sind alle Dorfbewohner vergiftet`), 600);
    }
    // Mezepheles: Wer das Wort gesagt hat, wird jetzt böse
    const mz = game.mez;
    if (mz && mz.turn && mz.turn.night === n && !mz.done) {
      const t = S[mz.turn.k], me = S.find(x => x.role === "mezepheles");
      mz.done = true;
      if (t && me && me.alive && !impaired(me) && seatGood(t)) {
        t.align = "e";
        t.infos = [...(t.infos || []), { n, t: "🔤 Du hast das geheime Wort des Mezepheles gesagt – du bist jetzt BÖSE." }].slice(-10);
        hist(`🔤 ${t.name} hat das Wort gesagt und ist jetzt böse (Mezepheles)`, "night");
        game.ignoreEnd = null;
      } else if (t) hist(`🔤 ${t.name} hat das Wort gesagt – der Mezepheles ist tot oder vergiftet, nichts passiert`, "night");
    }
  }

  // ---------- Mezepheles: geheimes Wort ----------
  const MEZ_WORDS = ["Mond", "Kerze", "Nebel", "Rabe", "Glocke", "Schatten", "Laterne", "Spiegel", "Feder", "Schlüssel", "Asche", "Brunnen",
    "Turm", "Rose", "Krone", "Sturm", "Wolke", "Fluss", "Apfel", "eigentlich", "komisch", "logisch", "sicher", "Beweis", "Zufall", "Bauchgefühl"];
  function mez() {
    game.mez = game.mez || {};
    if (!game.mez.word) game.mez.word = MEZ_WORDS[randInt(MEZ_WORDS.length)];
    return game.mez;
  }
  function mezStepHtml() {
    const m = mez(), x = game.seats.find(y => y.role === "mezepheles");
    if (!x) return "";
    if (game.nightNo === 1) {
      const sent = (x.infos || []).some(f => f.mz === m.word);
      return `<div class="yagga"><p>🔤 Geheimes Wort: <b>„${esc(m.word)}“</b></p>
        <div class="row wrap"><button class="btn sm" data-mznew="1">🎲 Anderes Wort</button><button class="btn sm" data-mzown="1">✏️ Eigenes</button>
        <button class="btn sm ${sent ? "used" : "primary"}" data-mzsend="1">${sent ? "✔ Gesendet" : game.online || game.test ? "📱 Aufs Handy senden" : "✔ Gezeigt"}</button></div></div>`;
    }
    return m.done ? `<p class="small">🔤 Das Wort wurde schon von einem Guten gesagt – die Fähigkeit ist verbraucht.</p>`
      : `<p class="small">🔤 Wort „${esc(m.word)}“ – noch kein guter Spieler hat es gesagt.</p>`;
  }
  function mezDayHtml() {
    const x = game.seats.find(y => y.role === "mezepheles" && y.alive);
    if (!x) return "";
    const m = mez();
    if (m.done || m.turn) return `<p class="small">🔤 Mezepheles: ${m.turn ? `${esc(game.seats[m.turn.k].name)} hat das Wort gesagt – wird heute Nacht böse.` : "Fähigkeit verbraucht."}</p>`;
    return `<div class="box yagga">🔤 <b>Mezepheles</b> – Wort „${esc(m.word)}“. Hat ein <b>guter</b> Spieler es gesagt?
      <div class="row wrap">${pickListAll("mzpick")}<button class="btn primary" id="mzsaid">Hat es gesagt</button></div>
      <p class="small">Nur der erste gute Spieler zählt – er wird heute Nacht böse. Nur du siehst das.</p></div>`;
  }
  const pickListAll = id => `<select id="${id}">${game.seats.map((y, k) => y.alive ? `<option value="${k}">${esc(y.name)}</option>` : "").join("")}</select>`;

  // ---------- Ojo: wählt eine Rolle ----------
  function ojoStepHtml() {
    const a = (game.acts || []).find(q => q.night === game.nightNo && q.step === "ojo" && !q.undone && !q.skip);
    if (!a || !a.role) return `<p class="small">👁️ Wartet auf die Wahl des Ojo (eine Rolle). Ohne Handy: über „🏷️“ beim Spieler oder hier, sobald die Wahl gespeichert ist.</p>`;
    const hit = game.seats.filter(y => y.role === a.role && y.alive);
    if (hit.length) return `<p class="small">👁️ Ojo wählt ${esc(roleName(a.role))} → <b>${hit.map(y => esc(y.name)).join(", ")}</b> wird angegriffen.</p>`;
    return `<div class="yagga"><p>👁️ Ojo wählt <b>${esc(roleName(a.role))}</b> – die Rolle ist <b>nicht im Spiel</b>. Du wählst, wer stirbt:</p>
      ${(a.picks || []).length ? `<p class="okmsg">💀 Gewählt: ${a.picks.map(k => esc(game.seats[k].name)).join(", ")}</p>` : ""}
      <div class="row wrap">${pickListAll("ojopick")}<button class="btn sm primary" data-ojok="1">💀 Festlegen</button><button class="btn sm" data-ojonone="1">Niemand</button></div></div>`;
  }

