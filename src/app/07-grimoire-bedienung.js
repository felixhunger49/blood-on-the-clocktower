  function bindSL() {
    // Schritt 1
    $$("[data-ed]").forEach(b => b.addEventListener("click", () => {
      if (game.edition !== b.dataset.ed) { game.edition = b.dataset.ed; game.selected = []; game.bluffs = []; }
      if (game.edition === "custom" && !(game.script || []).length) { save(); scriptEditor(); return; }
      save(); renderSL();
    }));
    const setCount = n => {
      game.count = Math.max(4, Math.min(15, n));
      if (game.selected.length && game.selected.length !== game.count) game.selected = [];
      save(); renderSL();
    };
    $("#appqr2") && $("#appqr2").addEventListener("click", showAppQR);
    $("#minus") && $("#minus").addEventListener("click", () => setCount(game.count - 1));
    $("#plus") && $("#plus").addEventListener("click", () => setCount(game.count + 1));
    bindOnlineHost();
    $("#teststart") && $("#teststart").addEventListener("click", startTest);
    $("#teststop") && $("#teststop").addEventListener("click", () => { if (confirm("Testrunde beenden? Das Spiel wird zurückgesetzt.")) { game = newGame(); save(); renderSL(); } });
    $("#statsreset") && $("#statsreset").addEventListener("click", () => { if (confirm("Statistik wirklich löschen?")) { store.del("botc.stats"); renderSL(); } });
    $$(".name").forEach(inp => inp.addEventListener("input", () => {
      game.names[+inp.dataset.i] = inp.value;
      save();
    }));
    $("#next1") && $("#next1").addEventListener("click", () => {
      // Namen in bestehende Plätze übernehmen
      const nm = names();
      playerSeats().forEach((s, i) => { s.name = nm[i] || s.name; s.pid = (game.pids || [])[i] || s.pid || null; });
      goStep("roles");
    });
    $("#reset") && $("#reset").addEventListener("click", () => {
      if (confirm("Alles zurücksetzen? Namen, Rollen und Grimoire gehen verloren.")) { game = newGame(); save(); renderSL(); }
    });

    // Schritt 2
    $("#auto") && $("#auto").addEventListener("click", () => { autoPick(); save(); renderSL(); });
    $("#autobal") && $("#autobal").addEventListener("click", () => { suggestBalanced(); save(); renderSL(); toast("⚖️ Ausgewogene Aufstellung gewählt"); });
    $("#clear") && $("#clear").addEventListener("click", () => { game.selected = []; save(); renderSL(); });
    $$(".tile[data-role]").forEach(t => t.addEventListener("click", () => {
      const id = t.dataset.role;
      game.selected = game.selected.includes(id) ? game.selected.filter(x => x !== id) : [...game.selected, id];
      refreshHidden(); save(); renderSL();
    }));
    $$("[data-fabled]").forEach(t => t.addEventListener("click", () => {
      const id = t.dataset.fabled, f = game.fabled || [];
      game.fabled = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
      save(); renderSL();
    }));
    $("#editscript") && $("#editscript").addEventListener("click", scriptEditor);
    $("#importscript") && $("#importscript").addEventListener("click", scriptImport);
    $("#exportscript") && $("#exportscript").addEventListener("click", exportScript);
    $("#drunkShown") && $("#drunkShown").addEventListener("change", e => { game.drunkShown = e.target.value; game.bluffs = game.bluffs.filter(b => b !== game.drunkShown); refreshHidden(); save(); });
    $("#marionetteShown") && $("#marionetteShown").addEventListener("change", e => { game.marionetteShown = e.target.value; game.bluffs = game.bluffs.filter(b => b !== game.marionetteShown); refreshHidden(); save(); });
    $("#lunaticShown") && $("#lunaticShown").addEventListener("change", e => { game.lunaticShown = e.target.value; save(); });
    $("#next2") && $("#next2").addEventListener("click", () => goStep("assign"));

    // Schritt 3
    $$(".seatrole").forEach(sel => sel.addEventListener("change", () => {
      const i = +sel.dataset.i, id = sel.value;
      const other = game.seats.findIndex((s, j) => j !== i && !s.trav && s.role === id);
      if (other >= 0) game.seats[other].role = game.seats[i].role;
      game.seats[i].role = id;
      save(); renderSL();
    }));
    $$("[data-qr]").forEach(b => b.addEventListener("click", () => showQR(+b.dataset.qr)));
    $$("[data-pid]").forEach(sel => sel.addEventListener("change", () => { setSeatPid(+sel.dataset.pid, sel.value); renderSL(); }));
    $$("[data-deltrav]").forEach(b => b.addEventListener("click", () => { game.seats.splice(+b.dataset.deltrav, 1); save(); renderSL(); }));
    $("#pass") && $("#pass").addEventListener("click", () => passMode(0));
    $("#reshuffle") && $("#reshuffle").addEventListener("click", () => {
      if (confirm("Rollen neu auf die Plätze verteilen? Bereits verteilte Codes werden ungültig.")) { assignSeats(); save(); renderSL(); }
    });
    $("#rebluff") && $("#rebluff").addEventListener("click", () => { game.bluffs = []; refreshHidden(); save(); renderSL(); });
    $("#evilinfo") && $("#evilinfo").addEventListener("change", e => { game.evilInfo = e.target.checked; save(); });
    $("#addtrav") && $("#addtrav").addEventListener("click", () => {
      const pid = $("#travpid") ? $("#travpid").value || null : null;
      const name = $("#travname").value.trim() || (pid && lobby[pid] ? lobby[pid].name : "") || `Reisender ${game.seats.filter(s => s.trav).length + 1}`;
      game.seats.push({ name, pid, role: $("#travrole").value, align: $("#travalign").value, trav: true, alive: true, ghost: true, note: "", salt: randInt(32) });
      if (game.step === "grim") {
        const evilT = $("#travalign").value === "e";
        hist(`🧳 ${name} kommt als ${roleName($("#travrole").value)} dazu (${evilT ? "böse" : "gut"})`);
        toast(`🧳 ${name} ist jetzt ${roleName($("#travrole").value)}${pid ? ` – sieht es auf dem Handy${evilT ? " (inkl. wer der Dämon ist)" : ""}` : evilT ? " – zeig ihm noch, wer der Dämon ist" : ""}`);
      }
      save(); renderSL();
    });
    $("#next3") && $("#next3").addEventListener("click", () => goStep("grim"));
    $(".travlate") && $(".travlate").addEventListener("toggle", e => { if (!!game.travOpen === e.target.open) return; game.travOpen = e.target.open; save(); });

    // Schritt 4
    $$("[data-alive]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.alive]; s.alive = !s.alive; if (s.alive) s.ghost = true; histDeath(s); save(); renderSL(); }));
    $$("[data-ghost]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.ghost]; s.ghost = !s.ghost; save(); renderSL(); }));
    $$("[data-note]").forEach(inp => inp.addEventListener("input", () => { game.seats[+inp.dataset.note].note = inp.value; save(); }));
    $$("[data-info]").forEach(b => b.addEventListener("click", () => openModal(roleDetail(ROLE_BY_ID[b.dataset.info], true))));
    $$(".showevil").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); showEvilInfo(b.dataset.show); }));
    $$(".sendevil").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const which = b.dataset.sendevil, key = which === "demoninfo" ? "demon" : "minion";
      game.evilSent = Object.assign({}, game.evilSent, { [key]: true });
      // Empfänger: Schergen (ohne Marionette) bzw. Dämon und Wahnsinniger
      const rc = playerSeats().filter(x => key === "minion" ? (ROLE_BY_ID[x.role].t === "minion" && x.role !== "marionette") : (ROLE_BY_ID[x.role].t === "demon" || x.role === "lunatic"));
      const off = rc.filter(x => !reachable(x));
      const d = game.done[game.nightNo] || [];
      if (!d.includes(which)) game.done[game.nightNo] = [...d, which];
      save(); renderSL();
      if (off.length) notice(`Nicht online: ${off.map(x => x.name).join(", ")} – bitte mit „zeigen (hier)“ das Handy hinhalten.`);
      else toast(`Gesendet an ${rc.map(x => x.name).join(", ")}`);
    }));
    $$(".showinfo").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); infoDialog(b.dataset.infoStep); }));
    bindNightActions();
    $("#sugtoggle") && $("#sugtoggle").addEventListener("change", e => { game.suggest = e.target.checked; save(); });
    $$("[data-useonce]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const id = b.dataset.useonce;
      game.seats.forEach(s => {
        if (!s.alive) return;
        if (s.role === id || (s.role === "drunk" && shownRole("drunk") === id)) s.used = true;
        if (gainer(s) && s.gained === id) s.gainedUsed = true;
      });
      const d = game.done[game.nightNo] || [];
      if (!d.includes(id)) game.done[game.nightNo] = [...d, id];
      save(); renderSL();
    }));
    $$("[data-philo]").forEach(sel => {
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", () => setPhilo(+sel.dataset.philo, sel.value));
    });
    $$("[data-used]").forEach(b => b.addEventListener("click", () => { const s = game.seats[+b.dataset.used]; s.used = !s.used; save(); renderSL(); }));
    $$(".nightlist li:not(.inactive)").forEach(li => li.addEventListener("click", () => {
      const id = li.dataset.stepId;
      const d = game.done[game.nightNo] || [];
      game.done[game.nightNo] = d.includes(id) ? d.filter(x => x !== id) : [...d, id];
      save(); renderSL();
    }));
    $("#daystart") && $("#daystart").addEventListener("click", dawnDialog);
    $("#undobtn") && $("#undobtn").addEventListener("click", undo);
    $("#savegame") && $("#savegame").addEventListener("click", gameTransfer);
    $("#nightsum") && $("#nightsum").addEventListener("click", () => openModal(`<h2>📋 Nachtübersicht</h2>${nightSummaryHtml()}<div class="row end"><button class="btn primary" id="nsclose">OK</button></div>`) || $("#nsclose").addEventListener("click", closeModal));
    $$("[data-swapdrunk]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); swapDrunk(); }));
    $$("[data-spygrim]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); spyGrimDialog(b.dataset.spygrim); }));
    $$("[data-widowknow]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); widowKnowDialog(); }));
    $$("[data-spyhide]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); spyGrimHide(); }));
    $$("[data-swshow]").forEach(b => b.addEventListener("click", () => {
      const x = game.seats[+b.dataset.swshow];
      x.swPending = false;
      hist(`💋 ${x.name} hat erfahren: Du bist ${roleName(x.role)}`, "night");
      const d = game.done[game.nightNo] || [];
      if (!d.includes("scarletwoman")) game.done[game.nightNo] = [...d, "scarletwoman"];
      save(); renderSL();
      toast(game.online || game.test ? `${x.name} sieht jetzt ihre neue Rolle auf dem Handy` : `Zeig ${x.name} jetzt „Du bist“ + ${roleName(x.role)}`);
    }));
    bindYagga();
    $("#nextnight") && $("#nextnight").addEventListener("click", () => {
      const end = !game.winner && detectEnd();
      if (end && game.ignoreEnd !== aliveKey() && !confirm(`Das Spiel ist eigentlich vorbei: ${end.winner === "good" ? "Gut" : "Böse"} gewinnt.\n${end.reason}\n\nTrotzdem weiterspielen?`)) return;
      if (end) game.ignoreEnd = aliveKey();
      game.vote = null;
      game.exile = null;
      game.asks = {};
      game.seq = null;
      game.tableNight = null;
      game.wakes = {};
      // Schutz-/Ziel-Marker gelten nur eine Nacht; Gift & Betrunken bis zur nächsten Nacht (außer 📌)
      const healed = [];
      game.seats.forEach(x => {
        if (x.drunkUntil && game.nightNo + 1 >= x.drunkUntil) { x.keep = (x.keep || []).filter(m => m !== "drunk"); delete x.drunkUntil; }
        const keep = x.keep || [];
        const before = x.marks || [];
        x.marks = before.filter(m => { const d = markerByKey(m) || {}; return !d.n && !(d.t && !keep.includes(m)); });
        if (before.some(m => ["poison", "drunk"].includes(m) && !x.marks.includes(m))) healed.push(x.name);
        x.keep = keep.filter(m => x.marks.includes(m));
      });
      game.nightNo++;
      game.phase = "night";
      hist(`🌙 Nacht ${game.nightNo} beginnt`, "night");
      nightStartEffects();
      if (healed.length) hist(`💧 Gift/Trunkenheit vorbei: ${healed.join(", ")}`, "night");
      game.done[game.nightNo] = [];
      save(); renderSL();
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast(`Nacht ${game.nightNo} beginnt`);
    });
    $("#prevnight") && $("#prevnight").addEventListener("click", () => { game.nightNo--; save(); renderSL(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    bindDay();
    $$("[data-change]").forEach(b => b.addEventListener("click", () => changeRole(+b.dataset.change)));
    $$("[data-seatmodal]").forEach(b => b.addEventListener("click", () => seatModal(+b.dataset.seatmodal)));
    $$("[data-gview]").forEach(b => b.addEventListener("click", () => { game.circle = b.dataset.gview === "circle"; game.fullList = b.dataset.gview === "full"; save(); renderSL(); }));
    $("#settingsbtn") && $("#settingsbtn").addEventListener("click", settingsModal);
    bindTimer();
    $("#musictoggle") && $("#musictoggle").addEventListener("change", e => { Mood.toggle(e.target.checked); });
    $$("[data-mad]").forEach(b => b.addEventListener("click", () => madnessDialog(+b.dataset.mad)));
    $$("[data-win]").forEach(b => b.addEventListener("click", () => {
      const team = b.dataset.win;
      const reason = b.dataset.reason || ($("#winreason") && $("#winreason").value.trim()) ||
        (team === "good" ? "Die guten Spieler haben das Dorf gerettet." : "Das Böse hat das Dorf übernommen.");
      game.winner = { team, reason };
      hist(`🏆 ${team === "good" ? "Gut" : "Böse"} gewinnt – ${reason}`);
      recordStats();
      save(); renderSL(); showEnd();
    }));
    $("#ignoreend") && $("#ignoreend").addEventListener("click", () => { game.ignoreEnd = aliveKey(); save(); renderSL(); });
    $("#showend") && $("#showend").addEventListener("click", showEnd);
    $("#undoend") && $("#undoend").addEventListener("click", () => { game.winner = null; game.ignoreEnd = aliveKey(); unrecordStats(); hist("↩︎ Spiel wird fortgesetzt"); save(); renderSL(); });
  }

