  // ================= HOMEBREW-ROLLEN =================
  const hbFx = rid => (ROLE_BY_ID[rid] || {}).hbEffects || [];
  const hbHas = (rid, ...fxs) => hbFx(rid).some(f => fxs.includes(f));
  const hbFind = (rid, list) => hbFx(rid).find(f => list.includes(f));
  // Bausteine: damit wirkt eine eigene Rolle automatisch (pick = wie viele Spieler sie nachts wählt)
  const HB_EFFECTS = {
    "": { l: "– keine (Wirkung wertest du selbst aus) –" },
    protect: { l: "🛡️ Gewählter Spieler ist heute Nacht vor dem Dämon geschützt", pick: 1, mark: "protect" },
    poison: { l: "🧪 Gewählter Spieler ist vergiftet (bis zur nächsten Nacht)", pick: 1, mark: "poison" },
    drunk: { l: "🍺 Gewählter Spieler ist betrunken (bis zur nächsten Nacht)", pick: 1, mark: "drunk" },
    kill: { l: "💀 Gewählter Spieler stirbt (kein Dämonen-Tod – Mönch/Soldat schützen nicht)", pick: 1 },
    align: { l: "ℹ️ Info: Ist der gewählte Spieler gut oder böse?", pick: 1, info: true },
    demon: { l: "ℹ️ Info: Ist einer der Gewählten der Dämon? (Ja/Nein)", pick: 2, info: true },
    minion: { l: "ℹ️ Info: Ist einer der Gewählten ein Scherge? (Ja/Nein)", pick: 2, info: true },
    outsider: { l: "ℹ️ Info: Ist der gewählte Spieler ein Außenseiter? (Ja/Nein)", pick: 1, info: true },
    role: { l: "ℹ️ Info: Rolle des gewählten Spielers", pick: 1, info: true },
    neighbours: { l: "ℹ️ Info: Wie viele lebende Nachbarn sind böse? (Zahl, ohne Wahl)", pick: 0, info: true },
    evilcount: { l: "ℹ️ Info: Wie viele böse Spieler leben noch? (Zahl, ohne Wahl)", pick: 0, info: true },
    // weitere Tode
    kill_evil: { l: "💀 Gewählter Spieler stirbt – nur wenn er böse ist", pick: 1 },
    kill_minion: { l: "💀 Gewählter Spieler stirbt – nur wenn er ein Scherge ist", pick: 1 },
    // passiv (ohne Wahl)
    immune: { l: "🛡️ Passiv: Der Dämon kann dich nicht töten (wie Soldat)", pick: 0, passive: true },
    unkillable: { l: "🛡️ Passiv: Du kannst nicht sterben, solange du nüchtern bist (wie Seemann)", pick: 0, passive: true },
    fool: { l: "🃏 Passiv: Dein erster Tod wird verhindert (wie Narr)", pick: 0, passive: true },
    saint: { l: "😇 Passiv: Wirst du hingerichtet, gewinnt Böse (wie Heiliger)", pick: 0, passive: true },
    // weitere Infos
    same: { l: "ℹ️ Info: Haben die 2 Gewählten die gleiche Gesinnung?", pick: 2, info: true },
    townsfolk: { l: "ℹ️ Info: Ist der gewählte Spieler ein Dorfbewohner? (Ja/Nein)", pick: 1, info: true },
    evil3: { l: "ℹ️ Info: Wie viele der 3 Gewählten sind böse? (Zahl)", pick: 3, info: true },
    nominated: { l: "ℹ️ Info: Hat der gewählte Spieler heute nominiert? (Ja/Nein)", pick: 1, info: true },
    voted: { l: "ℹ️ Info: Hat der gewählte Spieler heute abgestimmt? (Ja/Nein)", pick: 1, info: true },
    executee: { l: "ℹ️ Info: Rolle des heute Hingerichteten (ohne Wahl, wie Totengräber)", pick: 0, info: true },
    deadevil: { l: "ℹ️ Info: Wie viele Tote sind böse? (Zahl, ohne Wahl, wie Orakel)", pick: 0, info: true },
    demondist: { l: "ℹ️ Info: Wie viele Plätze sitzt du vom Dämon entfernt? (Zahl, ohne Wahl)", pick: 0, info: true },
    // Rollen verändern
    mad: { l: "😵 Gewählter Spieler muss morgen eine Rolle deiner Wahl behaupten (wie Cerenovus)", pick: 1, rolePick: true },
    change: { l: "🧙 Gewählter Spieler wird zu einer Rolle deiner Wahl (wie Grubenhexe)", pick: 1, rolePick: true }
  };
  const HB_GROUPS = [["", "Ohne"], ["Wirkung auf Gewählte", ["protect", "poison", "drunk", "mad", "change"]], ["Tod", ["kill", "kill_evil", "kill_minion"]],
    ["Passiv (eigene Rolle)", ["immune", "unkillable", "fool", "saint"]],
    ["Info", ["align", "demon", "minion", "outsider", "townsfolk", "same", "evil3", "role", "nominated", "voted", "executee", "neighbours", "evilcount", "deadevil", "demondist"]]];
  // Definition: { id: "hb_…", de, t, a, e, ic, n1, pos1, n, pos, pick, rolePick, info, act, marks: [{i,l}], setup }
  function registerHomebrew(defs) {
    (defs || []).forEach(d => {
      if (!d || !d.id || !String(d.id).startsWith("hb_") || !TEAMS[d.t]) return;
      let r = ROLE_BY_ID[d.id];
      if (!r) { r = { id: d.id }; ROLES.push(r); r.idx = ROLES.length - 1; ROLE_BY_ID[d.id] = r; }
      Object.assign(r, { de: d.de || "Eigene Rolle", en: d.de || "Homebrew", t: d.t, ed: "homebrew", a: d.a || "", e: d.e || "Homebrew-Rolle – vom Spielleiter erfunden.", tip: d.tip || "", st: d.st || "", n1: d.n1 || "", n: d.n || "", setup: d.setup || "", ic: d.ic || "✳️", hb: true });
      [[NIGHT_FIRST, d.n1, d.pos1], [NIGHT_OTHER, d.n, d.pos]].forEach(([arr, txt, after]) => {
        const at = arr.indexOf(d.id); if (at >= 0) arr.splice(at, 1);
        if (!txt) return;
        // Ohne gewählte Position: Schutz/Gift/Trunkenheit vor dem Dämon, alles andere am Ende
        if (!after && ["protect", "poison", "drunk"].includes(d.effect)) after = arr.includes("monk") ? "monk" : "poisoner";
        let k = after ? arr.indexOf(after) : -1;
        if (k < 0) k = arr.indexOf("dawn") - 1;
        arr.splice(k + 1, 0, d.id);
      });
      const fx = HB_EFFECTS[d.effect || ""] || {}, fx2 = HB_EFFECTS[d.effect2 || ""] || {};
      r.hbEffect = d.effect || "";
      r.hbEffects = [d.effect, d.effect2].filter(Boolean);
      r.hbCond = d.cond || "";
      if (fx.info || fx2.info) d.info = true;
      const pd = PICK_DEPENDENT.indexOf(d.id);
      const pickInfo = (fx.info && fx.pick) || (fx2.info && fx2.pick);
      if (pickInfo && pd < 0) PICK_DEPENDENT.push(d.id);
      if (!pickInfo && pd >= 0) PICK_DEPENDENT.splice(pd, 1);
      const oi = ONCE_PER_GAME.indexOf(d.id);
      if (d.cond === "once" && oi < 0) ONCE_PER_GAME.push(d.id);
      if (d.cond !== "once" && oi >= 0) ONCE_PER_GAME.splice(oi, 1);
      if (d.pick || d.rolePick) ACTIONS[d.id] = { mark: fx.mark || fx2.mark, mark2: fx.mark && fx2.mark && fx2.mark !== fx.mark ? fx2.mark : undefined, n: +d.pick || 0, self: true, role: d.rolePick ? "all" : undefined, text: d.act || `Wähle ${d.pick ? (+d.pick === 1 ? "einen Spieler" : d.pick + " Spieler") : ""}${d.pick && d.rolePick ? " und " : ""}${d.rolePick ? "eine Rolle" : ""}.` };
      else delete ACTIONS[d.id];
      const ii = INFO_ROLES.indexOf(d.id);
      if (d.info && ii < 0) INFO_ROLES.push(d.id);
      if (!d.info && ii >= 0) INFO_ROLES.splice(ii, 1);
      ROLE_MARKERS[d.id] = (d.marks || []).filter(m => m && m.l).map((m, j) => ({ k: `${d.id}_m${j}`, i: m.i || "🏷️", l: m.l, d: `Marker der Homebrew-Rolle ${d.de}.` }));
    });
  }
  function unregisterHomebrew(id) {
    const at = ROLES.findIndex(r => r.id === id);
    if (at >= 0) ROLES.splice(at, 1);
    ROLES.forEach((r, i) => { r.idx = i; });
    delete ROLE_BY_ID[id]; delete ACTIONS[id]; delete ROLE_MARKERS[id];
    [NIGHT_FIRST, NIGHT_OTHER, INFO_ROLES].forEach(arr => { const k = arr.indexOf(id); if (k >= 0) arr.splice(k, 1); });
  }
  const hbDef = id => (game.homebrew || []).find(d => d.id === id);
  const hbSlug = x => normId(String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss"));
  function saveHomebrew(d) {
    game.homebrew = [...(game.homebrew || []).filter(x => x.id !== d.id), d];
    registerHomebrew([d]);
    game.edition = "custom";
    game.script = [...new Set([...(game.script || []), d.id])];
    if (!(game.fabled || []).includes("f_bootlegger")) game.fabled = [...(game.fabled || []), "f_bootlegger"];
    save();
  }
  // Aus dem offiziellen Skript-Format (eigene Rolle als Objekt) eine Homebrew-Definition machen
  function hbFromScript(x) {
    const TEAM = { townsfolk: "townsfolk", outsider: "outsider", minion: "minion", demon: "demon", traveler: "traveller", traveller: "traveller" };
    const t = TEAM[String(x.team || "").toLowerCase()];
    if (!t || !x.ability) return null;
    const id = "hb_" + hbSlug(x.id || x.name);
    const n1 = x.firstNight > 0 ? (x.firstNightReminder || "Wecke die Rolle.") : "";
    const n = x.otherNight > 0 ? (x.otherNightReminder || "Wecke die Rolle.") : "";
    const txt = `${x.firstNightReminder || ""} ${x.otherNightReminder || ""}`;
    const pick = /choose[s]? (2|two)|wählt (2|zwei)/i.test(txt) ? 2 : /choose|wählt|wähle/i.test(txt) ? 1 : 0;
    const posAt = (arr, num) => { if (!(num > 0)) return null; const k = Math.max(0, Math.min(arr.length - 2, Math.round(num / 100 * (arr.length - 1)))); return arr[k]; };
    return { id, de: x.name || x.id, t, a: x.ability, e: "Homebrew-Rolle aus einem importierten Skript.", ic: "✳️", n1, pos1: posAt(NIGHT_FIRST, x.firstNight), n, pos: posAt(NIGHT_OTHER, x.otherNight),
      pick, rolePick: /character/i.test(txt) && /choose/i.test(txt), info: /learn|shows?|point|nod|erfährt|zeig/i.test(txt), marks: (x.reminders || []).map(l => ({ i: "🏷️", l })), setup: x.setup ? "Ändert den Aufbau (siehe Fähigkeit)." : "",
      ...(x.app && typeof x.app === "object" ? { effect: String(x.app.effect || ""), effect2: String(x.app.effect2 || ""), cond: String(x.app.cond || ""), pick: +x.app.pick || pick, rolePick: !!x.app.rolePick, info: !!x.app.info } : {}) };
  }
  const fxOpts = cur => HB_GROUPS.map(([g, ks]) => g === "" ? `<option value="">${esc(HB_EFFECTS[""].l)}</option>` : `<optgroup label="${esc(g)}">${ks.map(k => `<option value="${k}" ${(cur || "") === k ? "selected" : ""}>${esc(HB_EFFECTS[k].l)}</option>`).join("")}</optgroup>`).join("");
  // preset: Vorbelegung für eine neue Rolle (z. B. aus einem Import); done: wohin es danach geht
  function homebrewEditor(id, preset, done) {
    const d = hbDef(id) || { id: "", de: "", t: "townsfolk", a: "", e: "", ic: "✳️", n1: "", pos1: "", n: "", pos: "", pick: 0, rolePick: false, info: false, marks: [], setup: "", ...(preset || {}) };
    const back = nd => { closeModal(); if (done) done(nd); else scriptEditor(); };
    const stepName = x => NIGHT_STEPS[x] ? NIGHT_STEPS[x].de : roleName(x);
    const posOpts = (arr, cur) => {
      const ids = arr.filter(x => x !== d.id && (NIGHT_STEPS[x] || (game.script || []).includes(x)));
      return `<option value="">– ganz am Ende –</option>${ids.map(x => `<option value="${x}" ${x === cur ? "selected" : ""}>nach: ${esc(stepName(x))}</option>`).join("")}`;
    };
    openModal(`<h2>✳️ ${d.id ? "Homebrew-Rolle bearbeiten" : "Eigene Rolle erstellen"}</h2>
      <div class="hbform">
        <div class="row wrap"><input id="hbic" value="${esc(d.ic)}" maxlength="4" style="width:3.5rem"><input id="hbname" placeholder="Name der Rolle" value="${esc(d.de)}" style="flex:1"></div>
        <label class="field">Typ: <select id="hbteam">${["townsfolk", "outsider", "minion", "demon", "traveller"].map(t => `<option value="${t}" ${d.t === t ? "selected" : ""}>${TEAMS[t].name}</option>`).join("")}</select></label>
        <label class="field">Fähigkeit (wie auf dem Skript):<textarea id="hba" rows="2">${esc(d.a)}</textarea></label>
        <label class="field">Erklärung für Spieler (optional):<textarea id="hbe" rows="2">${esc(d.e === "Homebrew-Rolle – vom Spielleiter erfunden." ? "" : d.e)}</textarea></label>
        <label class="switch"><input type="checkbox" id="hbw1" ${d.n1 ? "checked" : ""}><span>Wacht in der <b>ersten Nacht</b></span></label>
        <div id="hbw1box" ${d.n1 ? "" : "hidden"}><textarea id="hbn1" rows="2" placeholder="Was machst du als Spielleiter?">${esc(d.n1)}</textarea><select id="hbpos1">${posOpts(NIGHT_FIRST, d.pos1)}</select></div>
        <label class="switch"><input type="checkbox" id="hbw" ${d.n ? "checked" : ""}><span>Wacht in den <b>anderen Nächten</b></span></label>
        <div id="hbwbox" ${d.n ? "" : "hidden"}><textarea id="hbn" rows="2" placeholder="Was machst du als Spielleiter?">${esc(d.n)}</textarea><select id="hbpos">${posOpts(NIGHT_OTHER, d.pos)}</select></div>
        <label class="field">⚙️ Automatische Wirkung (Baustein): <select id="hbfx">${fxOpts(d.effect)}</select></label>
        <label class="field">➕ Zweiter Baustein (optional): <select id="hbfx2">${fxOpts(d.effect2)}</select></label>
        <label class="field">⏱️ Wann: <select id="hbcond"><option value="">immer</option><option value="once" ${d.cond === "once" ? "selected" : ""}>nur einmal pro Spiel</option><option value="n2" ${d.cond === "n2" ? "selected" : ""}>nur in Nacht 2</option></select></label>
        <label class="field">Wählt nachts am Handy: <select id="hbpick"><option value="0" ${!+d.pick ? "selected" : ""}>keine Spieler</option><option value="1" ${+d.pick === 1 ? "selected" : ""}>1 Spieler</option><option value="2" ${+d.pick === 2 ? "selected" : ""}>2 Spieler</option></select></label>
        <label class="switch"><input type="checkbox" id="hbrole" ${d.rolePick ? "checked" : ""}><span>… und eine <b>Rolle</b></span></label>
        <label class="switch"><input type="checkbox" id="hbinfo" ${d.info ? "checked" : ""}><span>Bekommt <b>Infos</b> vom Spielleiter (📱-Info-Knopf)</span></label>
        <label class="field">Eigene Marker (mit Komma, z. B. „🎯 Gejagt, 🔥 Brennt“):<input id="hbmarks" value="${esc((d.marks || []).map(m => `${m.i} ${m.l}`).join(", "))}"></label>
        <label class="field">Setup-Änderung (optional, z. B. „+1 Außenseiter“):<input id="hbsetup" value="${esc(d.setup)}"></label>
      </div>
      <p class="small">Mit einem Baustein wirkt die Rolle automatisch (inkl. Gift/Trunkenheit: vergiftet wirkt sie nicht). Ohne Baustein wertest du die Wirkung selbst aus – Nachtschritt, Handy-Aufgaben, Infos und Marker funktionieren trotzdem.</p>
      <div class="row end wrap">${d.id ? `<button class="btn danger" id="hbdel">🗑️ Löschen</button>` : ""}<button class="btn" id="hbcancel">Abbrechen</button><button class="btn primary" id="hbsave">Speichern</button></div>`, "full");
    $("#hbw1").addEventListener("change", e => { $("#hbw1box").hidden = !e.target.checked; });
    $("#hbw").addEventListener("change", e => { $("#hbwbox").hidden = !e.target.checked; });
    $("#hbfx2").addEventListener("change", e => {
      const fx = HB_EFFECTS[e.target.value] || {};
      if ((fx.pick || 0) > +$("#hbpick").value) $("#hbpick").value = String(fx.pick);
      if (fx.info) $("#hbinfo").checked = true;
      if (fx.rolePick) $("#hbrole").checked = true;
    });
    $("#hbfx").addEventListener("change", e => {
      const fx = HB_EFFECTS[e.target.value] || {};
      if (fx.pick !== undefined) $("#hbpick").value = String(fx.pick);
      if (fx.info) $("#hbinfo").checked = true;
      $("#hbrole").checked = !!fx.rolePick;
      if (fx.passive) { $("#hbw").checked = false; $("#hbwbox").hidden = true; $("#hbw1").checked = false; $("#hbw1box").hidden = true; return; }
      if (e.target.value && !$("#hbw").checked && !$("#hbw1").checked) { $("#hbw").checked = true; $("#hbwbox").hidden = false; }
      if (e.target.value && !$("#hbn").value.trim()) $("#hbn").value = `Wecke ${$("#hbname").value.trim() || "die Rolle"}. ${fx.pick ? `Sie wählt ${fx.pick === 1 ? "einen Spieler" : fx.pick + " Spieler"}${fx.rolePick ? " und eine Rolle" : ""}.` : ""}${fx.info ? " Gib ihr die Info." : ""}`.trim();
    });
    $("#hbcancel").addEventListener("click", () => back(null));
    $("#hbdel") && $("#hbdel").addEventListener("click", () => {
      if (!confirm(`„${d.de}“ wirklich löschen?`)) return;
      game.homebrew = (game.homebrew || []).filter(x => x.id !== d.id);
      game.script = (game.script || []).filter(x => x !== d.id);
      game.selected = game.selected.filter(x => x !== d.id);
      unregisterHomebrew(d.id); save(); closeModal(); scriptEditor();
    });
    $("#hbsave").addEventListener("click", () => {
      const name = $("#hbname").value.trim(), ab = $("#hba").value.trim();
      if (!name || !ab) { toast("Bitte Name und Fähigkeit eintragen."); return; }
      const marks = $("#hbmarks").value.split(",").map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u); return m ? { i: m[1], l: m[2] || m[1] } : { i: "🏷️", l: x }; });
      const nd = { id: d.id || "hb_" + (hbSlug(name) || "rolle") + (hbDef("hb_" + hbSlug(name)) ? randInt(999) : ""), de: name, t: $("#hbteam").value, a: ab, e: $("#hbe").value.trim(), ic: $("#hbic").value.trim() || "✳️",
        n1: $("#hbw1").checked ? ($("#hbn1").value.trim() || "Wecke die Rolle.") : "", pos1: $("#hbpos1").value, n: $("#hbw").checked ? ($("#hbn").value.trim() || "Wecke die Rolle.") : "", pos: $("#hbpos").value,
        pick: +$("#hbpick").value, rolePick: $("#hbrole").checked, info: $("#hbinfo").checked, marks, setup: $("#hbsetup").value.trim(), effect: $("#hbfx").value, effect2: $("#hbfx2").value, cond: $("#hbcond").value };
      saveHomebrew(nd);
      hist(`✳️ Homebrew-Rolle „${nd.de}“ ${d.id ? "geändert" : "erstellt"}`);
      back(nd);
      toast(`✳️ „${nd.de}“ gespeichert und zur Rollenliste hinzugefügt`);
    });
  }
  // Skript exportieren (offizielles Format, inkl. Homebrew)
  function exportScript() {
    const out = [{ id: "_meta", name: game.scriptName ? game.scriptName.replace(/ \(von .*\)$/, "") : "Mein Skript", author: "" }];
    (game.script || []).forEach(id => {
      const r = ROLE_BY_ID[id];
      if (!r) return;
      if (r.hb) out.push({ id: id.replace(/^hb_/, ""), name: r.de, team: r.t, ability: r.a, firstNight: r.n1 ? NIGHT_FIRST.indexOf(id) + 1 : 0, otherNight: r.n ? NIGHT_OTHER.indexOf(id) + 1 : 0,
        firstNightReminder: r.n1 || "", otherNightReminder: r.n || "", reminders: (ROLE_MARKERS[id] || []).map(m => m.l), setup: !!r.setup,
        app: (() => { const d = hbDef(id) || {}; return { effect: d.effect || "", effect2: d.effect2 || "", cond: d.cond || "", pick: d.pick || 0, rolePick: !!d.rolePick, info: !!d.info }; })() });
      else out.push(id.replace(/^[fl]_/, ""));
    });
    (game.fabled || []).forEach(id => out.push(id.replace(/^[fl]_/, "")));
    const json = JSON.stringify(out, null, 1);
    openModal(`<h2>📤 Skript exportieren</h2>
      <p class="small">Im offiziellen Format – zum Teilen, für die offizielle App oder botcscripts.com. Homebrew-Rollen sind mit drin.</p>
      <textarea id="expjson" rows="8" readonly>${esc(json)}</textarea>
      <div class="row end wrap"><button class="btn" id="expcopy">📋 Kopieren</button><button class="btn primary" id="expdl">💾 Herunterladen</button></div>`);
    $("#expcopy").addEventListener("click", () => { (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => toast("📋 Kopiert"), () => { $("#expjson").select(); document.execCommand("copy"); toast("📋 Kopiert"); }); });
    $("#expdl").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = (out[0].name || "skript").replace(/[^\wäöüÄÖÜß-]+/g, "_") + ".json";
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // Skript aus dem offiziellen Script-Tool (JSON) übernehmen
  const normId = x => String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z]/g, "");
  function scriptImport() {
    openModal(`<h2>📥 Skript importieren</h2>
      ${scriptSearchHtml()}
      <h4>📄 Oder aus Datei / Text</h4>
      <p class="small">Skript-Datei (JSON, z. B. vom offiziellen Script-Tool) auswählen oder ihren Inhalt einfügen.</p>
      <input type="file" id="impfile" accept=".json,application/json,text/plain">
      <textarea id="imptext" rows="6" placeholder='[{"id":"_meta","name":"Mein Skript"},"washerwoman","empath", …]'></textarea>
      <div id="impmsg"></div>
      <div class="row end"><button class="btn" id="impcancel">Abbrechen</button><button class="btn primary" id="impgo">Übernehmen</button></div>`, "full");
    $("#impcancel").addEventListener("click", closeModal);
    $("#impfile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $("#imptext").value = rd.result; }; rd.readAsText(f); });
    $("#impgo").addEventListener("click", () => {
      let data;
      try { data = JSON.parse($("#imptext").value); } catch (e) { $("#impmsg").innerHTML = `<p class="error">Das ist kein gültiges Skript (JSON). Bitte den kompletten Inhalt einfügen.</p>`; return; }
      const err = applyScript(data);
      if (err) $("#impmsg").innerHTML = `<p class="error">${esc(err)}</p>`;
    });
    bindScriptSearch();
  }
  // Rollen eines Skripts (Liste aus Strings/Objekten) in die App übernehmen. Gibt eine Fehlermeldung zurück oder null.
  const prettyId = id => String(id).replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
  function scriptRoles(data) {
    if (!Array.isArray(data)) data = data && Array.isArray(data.roles) ? data.roles : [];
    const lookup = new Map();
    // Englische ID, englischer und deutscher Name – die deutschen nur, wenn sie nicht schon belegt sind
    ROLES.forEach(r => { lookup.set(normId(r.id.replace(/^[fl]_/, "")), r.id); lookup.set(normId(r.en), r.id); });
    ROLES.forEach(r => { if (!r.hb && r.de && !lookup.has(normId(r.de))) lookup.set(normId(r.de), r.id); });
    let name = "", author = "";
    const ids = [], unknown = [], hb = [];
    data.forEach(x => {
      const id = typeof x === "string" ? x : x && x.id;
      if (!id) return;
      if (id === "_meta") { name = x.name || ""; author = x.author || ""; return; }
      const hb1 = typeof x === "object" && x.ability ? hbFromScript(x) : null;
      const hit = !hb1 && (lookup.get(normId(id)) || (x && x.name && lookup.get(normId(x.name))));
      if (hit) ids.push(hit);
      else if (hb1) { hb.push(hb1); ids.push(hb1.id); }
      else unknown.push({ name: (x && x.name) || prettyId(id), team: x && typeof x === "object" ? x.team : "" });
    });
    return { ids: [...new Set(ids)], unknown, name, author, hb };
  }
  // Nicht erkannte Rollen: direkt als eigene Rolle anlegen
  function unknownRolesModal(list) {
    const TEAM = { townsfolk: "townsfolk", outsider: "outsider", minion: "minion", demon: "demon", traveler: "traveller", traveller: "traveller" };
    const c = t => (game.script || []).filter(id => ROLE_BY_ID[id] && ROLE_BY_ID[id].t === t).length;
    const open = list.filter(u => !u.done).length;
    openModal(`<h2>${open ? `⚠️ ${open} Rolle(n) fehlen noch` : "✅ Alle Rollen angelegt"}</h2>
      <p>${open ? "Diese Rollen aus dem Skript kennt die App nicht. Tippe auf „✳️ Anlegen“, gib die Fähigkeit ein – dann ist die Rolle in deiner Rollenliste." : "Alle fehlenden Rollen sind jetzt in deiner Rollenliste."}</p>
      <ul class="unklist">${list.map((u, k) => `<li><b>${esc(String(u.name))}</b>${u.team && TEAM[String(u.team).toLowerCase()] ? ` <span class="small">(${TEAMS[TEAM[String(u.team).toLowerCase()]].name})</span>` : ""}
        ${u.done ? `<span class="okmsg">✔ als ${esc(u.done)} angelegt</span>` : `<button class="btn sm primary" data-unk="${k}">✳️ Anlegen</button>`}</li>`).join("")}</ul>
      <p class="small">Jetzt in der Liste: ${c("townsfolk")} Dorfbewohner · ${c("outsider")} Außenseiter · ${c("minion")} Schergen · ${c("demon")} Dämonen${c("traveller") ? ` · ${c("traveller")} Reisende` : ""}</p>
      <p class="small">Die Fähigkeit findest du auf der Skript-Seite oder im Wiki. Oder schick mir den Namen, dann baue ich die Rolle fest ein.</p>
      <div class="row end"><button class="btn primary" id="unkok">${open ? "Später" : "Fertig"}</button></div>`);
    $("#unkok").addEventListener("click", () => { closeModal(); renderSL(); });
    $$("[data-unk]").forEach(b => b.addEventListener("click", () => {
      const u = list[+b.dataset.unk];
      const t = TEAM[String(u.team || "").toLowerCase()] || "townsfolk";
      homebrewEditor(null, { de: String(u.name), t }, nd => { if (nd) u.done = nd.de; renderSL(); unknownRolesModal(list); });
    }));
  }
  function applyScript(data) {
    const { ids, unknown, name, author, hb } = scriptRoles(data);
    if (!ids.length) return "Keine bekannte Rolle gefunden.";
    if (hb.length) {
      game.homebrew = [...(game.homebrew || []).filter(d => !hb.some(h => h.id === d.id)), ...hb];
      registerHomebrew(hb);
      if (!(game.fabled || []).includes("f_bootlegger")) game.fabled = [...(game.fabled || []), "f_bootlegger"];
    }
    game.edition = "custom";
    game.script = ROLES.filter(r => ids.includes(r.id) && r.t !== "fabled").map(r => r.id);
    const fab = ids.filter(id => ROLE_BY_ID[id].t === "fabled");
    if (fab.length) game.fabled = [...new Set([...(game.fabled || []), ...fab])];
    game.scriptName = name ? name + (author ? ` (von ${author})` : "") : "";
    game.selected = []; game.bluffs = [];
    save(); closeModal(); renderSL();
    if (unknown.length) unknownRolesModal(unknown.map(u => ({ ...u, done: null })));
    if (!unknown.length) toast(`📥 ${game.script.length} Rollen übernommen${hb.length ? ` (davon ${hb.length} Homebrew ✳️)` : ""}${fab.length ? ` + ${fab.length} Fabelwesen/Lorics` : ""}${unknown.length ? ` – unbekannt: ${unknown.slice(0, 5).map(u => u.name).join(", ")}${unknown.length > 5 ? " …" : ""}` : ""}`);
    return null;
  }

  // ---------- Online-Suche auf botcscripts.com ----------
  const BOTC_API = "https://www.botcscripts.com/api/scripts/";
  let scriptSearchState = { q: "", type: "", next: null, results: [] };
  function scriptSearchHtml() {
    return `<details class="box scriptsearch" open><summary><h4>🌐 Skripte online suchen <span class="small">(botcscripts.com)</span></h4></summary>
      <div class="row wrap">
        <input id="ssq" placeholder="Name, z. B. Teensyville" value="${esc(scriptSearchState.q)}">
        <select id="sstype"><option value="">Alle Größen</option><option value="Teensyville" ${scriptSearchState.type === "Teensyville" ? "selected" : ""}>Teensyville (5–6 Spieler)</option><option value="Full" ${scriptSearchState.type === "Full" ? "selected" : ""}>Volle Skripte</option></select>
        <button class="btn primary" id="ssgo">🔍 Suchen</button>
      </div>
      <p class="small">Sortiert nach Beliebtheit. Antippen übernimmt das Skript als deine Rollenliste.</p>
      <div id="ssres"></div>
      <p class="small">Mehr stöbern: <a href="https://www.botcscripts.com/" target="_blank" rel="noopener">botcscripts.com</a> · eigenes Skript bauen: <a href="https://script.bloodontheclocktower.com/" target="_blank" rel="noopener">offizielles Script-Tool</a></p>
    </details>`;
  }
  function drawScriptResults(append) {
    const box = $("#ssres");
    if (!box) return;
    const rows = scriptSearchState.results.map((r, k) => {
      const info = scriptRoles(r.content || []);
      return `<button class="ssitem" data-ss="${k}"><b>${esc(r.name)}</b> <span class="small">von ${esc(r.author || "?")}</span><br>
        <span class="small">${esc(r.script_type || "")} · ⭐ ${r.score || 0} · ${info.ids.length} Rollen${info.hb.length ? ` · ✳️ ${info.hb.length} Homebrew` : ""}${info.unknown.length ? ` · ⚠️ ${info.unknown.length} unbekannt` : ""}</span></button>`;
    }).join("");
    box.innerHTML = (rows || `<p class="small">Nichts gefunden.</p>`) + (scriptSearchState.next ? `<div class="row center"><button class="btn" id="ssmore">Mehr laden</button></div>` : "");
    $$("[data-ss]").forEach(b => b.addEventListener("click", () => {
      const r = scriptSearchState.results[+b.dataset.ss];
      const err = applyScript(r.content || []);
      if (err) toast(err);
    }));
    $("#ssmore") && $("#ssmore").addEventListener("click", () => loadScripts(scriptSearchState.next, true));
  }
  async function loadScripts(url, append) {
    const box = $("#ssres");
    if (box && !append) box.innerHTML = `<p class="small">⏳ Suche …</p>`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      scriptSearchState.results = append ? [...scriptSearchState.results, ...(j.results || [])] : (j.results || []);
      scriptSearchState.next = j.next ? j.next.replace(/^http:/, "https:") : null;
      drawScriptResults(append);
    } catch (e) {
      if (box) box.innerHTML = `<p class="error">Keine Verbindung zu botcscripts.com. Bist du online? Du kannst ein Skript auch auf der Seite herunterladen und oben als Datei auswählen.</p>`;
    }
  }
  function bindScriptSearch() {
    const go = () => {
      scriptSearchState.q = $("#ssq").value.trim(); scriptSearchState.type = $("#sstype").value;
      const u = new URL(BOTC_API);
      u.searchParams.set("format", "json"); u.searchParams.set("ordering", "-score");
      if (scriptSearchState.q) u.searchParams.set("search", scriptSearchState.q);
      if (scriptSearchState.type) u.searchParams.set("script_type", scriptSearchState.type);
      loadScripts(u.toString(), false);
    };
    $("#ssgo") && $("#ssgo").addEventListener("click", go);
    $("#ssq") && $("#ssq").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    if ($("#ssres")) { if (scriptSearchState.results.length) drawScriptResults(); else go(); }
  }

  function scriptEditor() {
    const sc = new Set(game.script || []);
    const draw = () => {
      const c = scriptCounts([...sc]);
      const list = ROLES.filter(r => r.t !== "fabled" && (scriptFilter === "all" || r.ed === scriptFilter));
      openModal(`<h2>📜 Eigene Rollenliste</h2>
        <p class="small">Tippe Rollen an, die in deinem Spiel vorkommen dürfen. Die Zufallswahl nimmt dann nur Rollen aus dieser Liste.</p>
        <div class="chips">
          <button class="chip" data-preset="tb">+ Trouble Brewing</button>
          <button class="chip" data-preset="bmr">+ Bad Moon Rising</button>
          <button class="chip" data-preset="snv">+ Sects &amp; Violets</button>
          <button class="chip" data-preset="exp">+ Experimentelle</button>
          <button class="chip" data-preset="none">Liste leeren</button>
          <button class="chip" id="importscript2">📥 Skript importieren</button>
          <button class="chip" id="hbnew">✳️ Eigene Rolle erstellen</button>
        </div>
        ${(game.homebrew || []).length ? `<div class="box"><h4>✳️ Deine Homebrew-Rollen</h4><div class="chips">${game.homebrew.map(d => `<button class="chip" data-hbedit="${d.id}">${esc(d.ic || "✳️")} ${esc(d.de)} ✏️</button>`).join("")}</div></div>` : ""}
        <div class="chips">${["all", "tb", "bmr", "snv", "exp", ...((game.homebrew || []).length ? ["homebrew"] : [])].map(k => `<button class="chip ${scriptFilter === k ? "on" : ""}" data-sfilter="${k}">${k === "all" ? "Alle zeigen" : EDITIONS[k].name}</button>`).join("")}</div>
        <p class="scriptcount">${sc.size} gewählt: ${c.townsfolk} Dorfb. · ${c.outsider} Außens. · ${c.minion} Schergen · ${c.demon} Dämonen · ${c.traveller} Reisende</p>
        ${["townsfolk", "outsider", "minion", "demon", "traveller"].map(t => {
          const rs = list.filter(r => r.t === t);
          return rs.length ? `<h3 class="team-h t-${t}-text">${TEAMS[t].plural}</h3><div class="tiles">${rs.map(r =>
            `<button class="tile t-${t} ${sc.has(r.id) ? "on" : ""}" data-sid="${r.id}"><b>${r.ic} ${esc(r.de)}</b><small>${esc(r.a)}</small><em class="ed">${esc(EDITIONS[r.ed].name)}</em></button>`).join("")}</div>` : "";
        }).join("")}
        <div class="row end sticky-save"><button class="btn primary" id="savescript">Übernehmen</button></div>`, "full");
      $$("[data-sid]").forEach(b => b.addEventListener("click", () => {
        const id = b.dataset.sid;
        sc.has(id) ? sc.delete(id) : sc.add(id);
        b.classList.toggle("on");
        const c2 = scriptCounts([...sc]);
        $(".scriptcount").textContent = `${sc.size} gewählt: ${c2.townsfolk} Dorfb. · ${c2.outsider} Außens. · ${c2.minion} Schergen · ${c2.demon} Dämonen · ${c2.traveller} Reisende`;
      }));
      $$("[data-preset]").forEach(b => b.addEventListener("click", () => {
        const k = b.dataset.preset;
        if (k === "none") sc.clear();
        else ROLES.filter(r => r.ed === k && r.t !== "fabled").forEach(r => sc.add(r.id));
        draw();
      }));
      $$("[data-sfilter]").forEach(b => b.addEventListener("click", () => { scriptFilter = b.dataset.sfilter; draw(); }));
      $("#importscript2").addEventListener("click", () => { closeModal(); scriptImport(); });
      $("#hbnew").addEventListener("click", () => { game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id); save(); closeModal(); homebrewEditor(null); });
      $$("[data-hbedit]").forEach(b => b.addEventListener("click", () => { game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id); save(); closeModal(); homebrewEditor(b.dataset.hbedit); }));
      $("#savescript").addEventListener("click", () => {
        game.script = ROLES.filter(r => sc.has(r.id)).map(r => r.id);
        game.scriptName = "";
        game.selected = game.selected.filter(id => sc.has(id));
        game.bluffs = [];
        save(); closeModal(); renderSL();
      });
    };
    draw();
  }

