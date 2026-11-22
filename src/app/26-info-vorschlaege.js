  // =====================================================================
  //  INFO-VORSCHLÄGE: die wahre Info ausrechnen
  // =====================================================================
  const PICK_DEPENDENT = ["fortuneteller", "villageidiot", "seamstress", "dreamer", "ravenkeeper"];
  const isEvil = x => !seatGood(x);
  const isDemonFor = x => ROLE_BY_ID[x.role].t === "demon" || (x.marks || []).includes("herring");
  const rnd = arr => arr.length ? arr[randInt(arr.length)] : null;

  // Wer stirbt heute Nacht durch den Dämon (Zielscheibe, nicht geschützt)? Der Dämon handelt
  // vor den Info-Rollen – für deren Infos ist dieser Spieler also schon tot.
  function pendingDeaths() {
    if (game.phase === "day" || game.nightNo < 2) return [];
    return nightKills().filter(x => x.dies).map(x => x.k);
  }
  const aliveNow = j => game.seats[j].alive && !pendingDeaths().includes(j);
  function killedBefore(x, id) {
    if (game.phase === "day" || game.nightNo < 2 || ACTS_WHEN_DEAD.includes(id)) return false;
    const i = game.seats.indexOf(x);
    const k = nightKills().find(e => e.k === i && e.dies);
    if (!k || !k.step) return false;
    const a = NIGHT_OTHER.indexOf(k.step), b = NIGHT_OTHER.indexOf(id);
    return a >= 0 && b >= 0 && a < b;
  }

  // Lebende Nachbarn (übersprungen werden Tote und heute Nacht Getötete), im Kreis
  function aliveNeighbours(i) {
    const n = game.seats.length, out = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const j = (i + dir * k + n * n) % n;
        if (j === i) break;
        if (aliveNow(j)) { out.push(j); break; }
      }
    }
    return [...new Set(out)];
  }

  function drunkWarning(i) {
    const x = game.seats[i];
    if (!x) return "";
    if (x.role === "drunk") return "Dieser Spieler ist der Säufer – du darfst (und solltest meist) eine falsche Info geben.";
    if (x.role === "marionette") return "Dieser Spieler ist die Marionette – die Info darf falsch sein.";
    const m = x.marks || [];
    if (m.includes("poison") || m.includes("drunk")) return "Dieser Spieler ist vergiftet bzw. betrunken – die Info darf falsch sein.";
    if (game.seats.some(y => y.role === "vortox" && y.alive) && ROLE_BY_ID[actingRole(x)].t === "townsfolk") return "Vortox im Spiel: Dorfbewohner-Infos müssen falsch sein!";
    return "";
  }

  // Liefert { r: [Rollen], p: [Spieler], t: "Zusatz", text: "Beschreibung" } oder null
  function suggestInfo(stepId, me, picks) {
    const S = game.seats, others = S.map((x, k) => k).filter(k => k !== me && !S[k].trav);
    const name = k => S[k].name;
    const pair = (cands) => {
      const a = rnd(cands);
      if (a === null || a === undefined) return null;
      const b = rnd(others.filter(k => k !== a));
      return shuffle([a, b].filter(v => v !== null && v !== undefined));
    };
    const withType = t => others.filter(k => ROLE_BY_ID[S[k].role].t === t);
    switch (stepId) {
      case "washerwoman": case "librarian": case "investigator": {
        const t = { washerwoman: "townsfolk", librarian: "outsider", investigator: "minion" }[stepId];
        const cands = withType(t);
        if (!cands.length) return { r: [], p: [], t: "0", text: "Keine passende Rolle im Spiel – zeige 0." };
        const p = pair(cands), right = p.find(k => cands.includes(k));
        return { r: [S[right].role], p, t: "", text: `${roleName(S[right].role)} – einer von ${p.map(name).join(", ")} (richtig: ${name(right)})` };
      }
      case "chef": {
        const ps = S.filter(x => !x.trav), n = ps.length;
        let c = 0;
        for (let k = 0; k < n; k++) if (isEvil(ps[k]) && isEvil(ps[(k + 1) % n])) c++;
        return { t: String(c), text: `${c} Paar(e) böser Nachbarn` };
      }
      case "empath": {
        const nb = aliveNeighbours(me), c = nb.filter(k => isEvil(S[k])).length;
        return { t: String(c), text: `${c} – Nachbarn: ${nb.map(name).join(", ")}` };
      }
      case "oracle": {
        const c = S.filter((x, j) => !aliveNow(j) && isEvil(x)).length;
        return { t: String(c), text: `${c} tote(r) böse(r) Spieler` };
      }
      case "clockmaker": {
        const n = S.length, d = S.findIndex(x => ROLE_BY_ID[x.role].t === "demon");
        const mins = S.map((x, k) => k).filter(k => ROLE_BY_ID[S[k].role].t === "minion");
        if (d < 0 || !mins.length) return { t: "0", text: "Kein Scherge – zeige 0." };
        const dist = Math.min(...mins.map(k => Math.min((k - d + n) % n, (d - k + n) % n)));
        return { t: String(dist), text: `${dist} Schritt(e) vom Dämon zum nächsten Schergen` };
      }
      case "fortuneteller": {
        if (!picks || picks.length < 2) return { text: "Tippe die zwei Spieler an, die der Wahrsager gewählt hat." };
        const yes = picks.some(k => isDemonFor(S[k]));
        return { t: yes ? "Ja" : "Nein", text: `${yes ? "Ja" : "Nein"} (Dämon oder 🐟 Ablenker dabei: ${yes ? "ja" : "nein"})` };
      }
      case "villageidiot": {
        if (!picks || !picks.length) return { text: "Tippe den gewählten Spieler an." };
        const g = seatGood(S[picks[0]]);
        return { t: g ? "gut" : "böse", text: `${name(picks[0])} ist ${g ? "gut" : "böse"}` };
      }
      case "seamstress": {
        if (!picks || picks.length < 2) return { text: "Tippe die zwei gewählten Spieler an." };
        const same = seatGood(S[picks[0]]) === seatGood(S[picks[1]]);
        return { t: same ? "gleiche Gesinnung" : "verschiedene Gesinnung", text: same ? "Gleiche Gesinnung" : "Verschiedene Gesinnung" };
      }
      case "dreamer": {
        if (!picks || !picks.length) return { text: "Tippe den gewählten Spieler an." };
        const x = S[picks[0]], good = seatGood(x);
        const other = rnd(ROLES.filter(r => inEd(r, game.edition) && r.id !== x.role && (good ? ["minion", "demon"] : ["townsfolk", "outsider"]).includes(r.t)));
        const r = shuffle([x.role, other && other.id].filter(Boolean));
        return { r, p: [picks[0]], text: `${name(picks[0])}: ${r.map(roleName).join(" oder ")} (richtig: ${roleName(x.role)})` };
      }
      case "ravenkeeper": {
        if (!picks || !picks.length) return { text: "Tippe den Spieler an, auf den der Rabenhüter zeigt." };
        return { r: [S[picks[0]].role], p: [], text: `${name(picks[0])} ist ${roleName(S[picks[0]].role)}` };
      }
      case "choirboy": {
        const kk = game.phase === "day" ? null : nightKills().find(x => x.dies && S[x.k] && S[x.k].role === "king" && ROLE_BY_ID[x.step] && ROLE_BY_ID[x.step].t === "demon");
        if (!kk) return { text: "Der Dämon hat heute Nacht nicht den König getötet – den Chorknaben nicht wecken." };
        const d = S.findIndex(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
        return d < 0 ? null : { p: [d], text: `Der König wurde vom Dämon getötet – zeige auf den Dämon: ${name(d)}` };
      }
      case "grandmother": {
        const k = rnd(others.filter(j => seatGood(S[j])));
        return k === null ? null : { r: [S[k].role], p: [k], text: `Enkelkind: ${name(k)} (${roleName(S[k].role)})` };
      }
      case "steward": {
        const k = rnd(others.filter(j => seatGood(S[j])));
        return k === null ? null : { p: [k], text: `Guter Spieler: ${name(k)}` };
      }
      case "bountyhunter": {
        const k = rnd(others.filter(j => isEvil(S[j])));
        return k === null ? null : { p: [k], text: `Böser Spieler: ${name(k)}` };
      }
      case "knight": {
        const p = shuffle(others.filter(j => ROLE_BY_ID[S[j].role].t !== "demon")).slice(0, 2);
        return { p, text: `Nicht der Dämon: ${p.map(name).join(", ")}` };
      }
      case "noble": {
        const e = rnd(others.filter(j => isEvil(S[j])));
        const g = shuffle(others.filter(j => seatGood(S[j]))).slice(0, 2);
        const p = shuffle([e, ...g].filter(v => v !== null));
        return { p, text: `Genau einer ist böse: ${p.map(name).join(", ")} (böse: ${e !== null ? name(e) : "–"})` };
      }
      case "sage": {
        const d = S.findIndex(x => ROLE_BY_ID[x.role].t === "demon");
        if (d < 0) return null;
        const p = shuffle([d, rnd(others.filter(j => j !== d))].filter(v => v !== null));
        return { p, text: `Einer davon ist der Dämon: ${p.map(name).join(", ")}` };
      }
      case "shugenja": {
        const n = S.length;
        let cw = n, ccw = n;
        for (let k = 1; k < n; k++) { if (isEvil(S[(me + k) % n])) { cw = k; break; } }
        for (let k = 1; k < n; k++) { if (isEvil(S[(me - k + n) % n])) { ccw = k; break; } }
        const t = cw === ccw ? "beliebig (gleicher Abstand)" : cw < ccw ? "im Uhrzeigersinn" : "gegen den Uhrzeigersinn";
        return { t, text: `Nächster Böser: ${t}` };
      }
      case "king": {
        const alive = S.filter(x => x.alive).length, dead = S.length - alive;
        const bigD = inPlayRole("leviathan") || inPlayRole("riot");
        if (bigD ? dead < 1 : dead < alive) return { text: bigD ? "Noch nicht: Noch niemand ist tot (Jinx Leviathan/Riot: ab dem ersten Toten jede Nacht)." : "Noch nicht: Die Toten sind weniger als die Lebenden – keine Info." };
        const k = rnd(S.map((x, j) => j).filter(j => S[j].alive && j !== me));
        return k === null ? null : { r: [S[k].role], text: `Lebende Rolle: ${roleName(S[k].role)} (${name(k)})` };
      }
      case "juggler": {
        const j = game.juggle;
        if (!j || !j.guesses.length) return { t: "0", text: "Keine Vermutungen eingetragen (Knopf „🤹 Jongleur rät Rollen“ am ersten Tag) – zeige 0." };
        const res = j.guesses.map(g => { const y = S[g.k]; const ok = y && y.role === g.role; const mis = y && !ok && ((y.role === "spy" && ROLE_BY_ID[g.role].t !== "minion") || (y.role === "recluse" && ["minion", "demon"].includes(ROLE_BY_ID[g.role].t))) && !impaired(y); return { g, ok, mis }; });
        const c = res.filter(r => r.ok).length;
        return { t: String(c), text: `${c} richtig – ${res.map(r => `${S[r.g.k].name} = ${roleName(r.g.role)} ${r.ok ? "✅" : r.mis ? "❌ (darf als ✅ zählen: " + roleName(S[r.g.k].role) + " registriert falsch)" : "❌ (" + roleName(S[r.g.k].role) + ")"}`).join("; ")}` };
      }
      case "mathematician": {
        const since = game.lastDawnAt || 0, seen = new Map();
        (game.abnLog || []).filter(e => e.at > since).forEach(e => { if (!seen.has(e.name)) seen.set(e.name, e.text); });
        // Angriffe dieser Nacht, die nicht gewirkt haben (Soldat, Schutz, vergifteter Dämon …)
        if (game.phase !== "day") nightKills().filter(x => !x.dies).forEach(x => {
          const att = (game.acts || []).find(a => a.night === game.nightNo && a.picks && a.picks.includes(x.k) && KILL_STEPS.includes(a.step) && !a.undone);
          const who = att ? S[att.i] : S.find(y => (y.alive || y.zfake) && ROLE_BY_ID[y.role].t === "demon");
          if (who && !seen.has(who.name)) seen.set(who.name, `Angriff auf ${S[x.k].name} wirkte nicht: ${x.why}`);
        });
        S.forEach(y => { if ((y.marks || []).includes("abnormal") && !seen.has(y.name)) seen.set(y.name, "❗-Marker gesetzt"); });
        // Jinx Wahnsinniger: zählt, wenn er jemand anderen „angegriffen“ hat als der echte Dämon
        const lun = S.find(y => y.role === "lunatic");
        if (lun) {
          const n0 = game.phase === "day" ? game.nightNo : game.nightNo;
          const la = (game.acts || []).find(a => a.night === n0 && S[a.i] === lun && (a.picks || []).length && !a.undone);
          const da = (game.acts || []).find(a => a.night === n0 && S[a.i] !== lun && S[a.i] && ROLE_BY_ID[S[a.i].role].t === "demon" && (a.picks || []).length && !a.undone);
          if (la && da && la.picks.slice().sort().join() !== da.picks.slice().sort().join() && !seen.has(lun.name)) seen.set(lun.name, "🔗 Jinx: Der Wahnsinnige hat jemand anderen gewählt als der Dämon");
        }
        const list = [...seen.entries()];
        const mj = ["drunk", "marionette"].filter(inPlayRole).map(roleName);
        if (mj.length) list.push(["🔗 Jinx", `Hat ${mj.join("/")} heute falsche Info bekommen, zähle das mit`]);
        return { t: String(list.length - (mj.length ? 1 : 0)), text: `${list.length}${list.length ? " – " + list.map(([n, w]) => `${n}: ${w}`).join("; ") : " – seit der letzten Dämmerung hat alles normal funktioniert"}. Prüfe, ob etwas fehlt (z. B. Spion/Einsiedler falsch registriert).` };
      }
      case "towncrier": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.noms.length) return { t: "Nein", text: "Nein – heute wurden (laut Abstimmungs-Helfer) keine Nominierungen eingetragen." };
        const mins = day.noms.filter(n => S[n.by] && ROLE_BY_ID[S[n.by].role].t === "minion");
        const list = day.noms.map(n => `${name(n.by)} → ${S[n.on] ? name(n.on) : "?"}`).join(", ");
        return mins.length
          ? { t: "Ja", text: `Ja – Scherge ${[...new Set(mins.map(n => `${name(n.by)} (${roleName(S[n.by].role)})`))].join(", ")} hat nominiert. Alle Nominierungen: ${list}` }
          : { t: "Nein", text: `Nein – kein Scherge hat nominiert. Nominierungen: ${list}` };
      }
      case "flowergirl": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.noms.length) return { t: "Nein", text: "Nein – heute gab es (laut Abstimmungs-Helfer) keine Abstimmung." };
        const demons = S.map((x, k) => k).filter(k => ROLE_BY_ID[S[k].role].t === "demon");
        const votes = day.noms.filter(n => (n.hands || []).some(h => demons.includes(h)));
        return votes.length
          ? { t: "Ja", text: `Ja – ${demons.filter(d => votes.some(n => n.hands.includes(d))).map(name).join(", ")} (Dämon) hat abgestimmt bei: ${votes.map(n => `${name(n.by)} → ${S[n.on] ? name(n.on) : "?"}`).join(", ")}` }
          : { t: "Nein", text: `Nein – der Dämon hat bei keiner der ${day.noms.length} Abstimmung(en) die Hand gehoben.` };
      }
      case "undertaker": {
        const day = (game.days || {})[game.nightNo - 1];
        if (!day || !day.exec || day.exec === "none" || !S[day.exec.seat]) return { text: "Heute wurde (laut Abstimmungs-Helfer) niemand hingerichtet – keine Info." };
        return { r: [S[day.exec.seat].role], text: `${S[day.exec.seat].name} war ${roleName(S[day.exec.seat].role)}` };
      }
      default: {
        const hr = ROLE_BY_ID[stepId];
        const fx = hr && hbFind(stepId, Object.keys(HB_EFFECTS).filter(k => HB_EFFECTS[k].info));
        if (!fx) return null;
        const T = k => ROLE_BY_ID[S[k].role].t;
        const need = (HB_EFFECTS[fx] || {}).pick;
        if (need && (!picks || !picks.length)) return { text: `Tippe ${need === 1 ? "den gewählten Spieler" : "die gewählten Spieler"} an.` };
        if (fx === "align") { const g = seatGood(S[picks[0]]); return { t: g ? "gut" : "böse", text: `${name(picks[0])} ist ${g ? "gut" : "böse"}` }; }
        if (fx === "demon") { const y = picks.some(k => T(k) === "demon"); return { t: y ? "Ja" : "Nein", text: `${y ? "Ja" : "Nein"} – Dämon unter ${picks.map(name).join(", ")}: ${y ? "ja" : "nein"}` }; }
        if (fx === "minion") { const y = picks.some(k => T(k) === "minion"); return { t: y ? "Ja" : "Nein", text: `${y ? "Ja" : "Nein"} – Scherge unter ${picks.map(name).join(", ")}: ${y ? "ja" : "nein"}` }; }
        if (fx === "outsider") { const y = T(picks[0]) === "outsider"; return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} ist ${y ? "" : "kein "}Außenseiter` }; }
        if (fx === "role") return { r: [S[picks[0]].role], p: [], text: `${name(picks[0])} ist ${roleName(S[picks[0]].role)}` };
        if (fx === "neighbours") { const nb = aliveNeighbours(me), c = nb.filter(k => isEvil(S[k])).length; return { t: String(c), text: `${c} – Nachbarn: ${nb.map(name).join(", ")}` }; }
        if (fx === "same") { const y = seatGood(S[picks[0]]) === seatGood(S[picks[1]]); return { t: y ? "gleich" : "verschieden", text: `${picks.map(name).join(" & ")}: ${y ? "gleiche" : "verschiedene"} Gesinnung` }; }
        if (fx === "townsfolk") { const y = T(picks[0]) === "townsfolk"; return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} ist ${y ? "" : "kein "}Dorfbewohner` }; }
        if (fx === "evil3") { const c = picks.filter(k => isEvil(S[k])).length; return { t: String(c), text: `${c} böse unter ${picks.map(name).join(", ")}` }; }
        if (fx === "nominated" || fx === "voted") {
          const day = (game.days || {})[game.nightNo - 1] || { noms: [] };
          const y = fx === "nominated" ? day.noms.some(nm => nm.by === picks[0]) : day.noms.some(nm => (nm.hands || []).includes(picks[0]));
          return { t: y ? "Ja" : "Nein", text: `${name(picks[0])} hat heute ${y ? "" : "nicht "}${fx === "nominated" ? "nominiert" : "abgestimmt"} (laut Abstimmungs-Helfer)` };
        }
        if (fx === "executee") { const day = (game.days || {})[game.nightNo - 1]; if (!day || !day.exec || day.exec === "none" || !S[day.exec.seat]) return { text: "Heute wurde niemand hingerichtet – keine Info." }; return { r: [S[day.exec.seat].role], text: `${S[day.exec.seat].name} war ${roleName(S[day.exec.seat].role)}` }; }
        if (fx === "deadevil") { const c = S.filter((x, k) => !aliveNow(k) && isEvil(x)).length; return { t: String(c), text: `${c} tote(r) böse(r) Spieler` }; }
        if (fx === "demondist") { const n = S.length, ds = S.map((x, k) => k).filter(k => T(k) === "demon"); if (!ds.length) return null; const d = Math.min(...ds.map(k => Math.min((k - me + n) % n, (me - k + n) % n))); return { t: String(d), text: `${d} Platz/Plätze bis zum Dämon` }; }
        if (fx === "evilcount") { const c = S.filter((x, k) => aliveNow(k) && isEvil(x)).length; return { t: String(c), text: `${c} böse Spieler leben noch` }; }
        return null;
      }
    }
  }

  // Spion und Einsiedler dürfen falsch „registrieren“ – solange sie gesund sind.
  const ALIGN_STEPS = ["empath", "chef", "oracle", "shugenja", "villageidiot", "seamstress", "noble", "steward", "bountyhunter", "grandmother", "clockmaker"];
  const ROLE_STEPS = ["ravenkeeper", "undertaker", "dreamer"];
  function misregHints(stepId, me, picks) {
    const S = game.seats;
    let rel;
    if (stepId === "empath") rel = aliveNeighbours(me);
    else if (stepId === "oracle") rel = S.map((x, k) => k).filter(k => !S[k].alive);
    else if (["fortuneteller", "villageidiot", "seamstress", "dreamer", "ravenkeeper"].includes(stepId)) rel = picks || [];
    else if (stepId === "undertaker") { const d = (game.days || {})[game.nightNo - 1]; rel = d && d.exec && d.exec !== "none" ? [d.exec.seat] : []; }
    else if ([...ALIGN_STEPS, "washerwoman", "librarian", "investigator"].includes(stepId)) rel = S.map((x, k) => k).filter(k => k !== me);
    else return [];
    const out = [];
    rel.forEach(k => {
      const x = S[k];
      if (!x || !["spy", "recluse"].includes(x.role)) return;
      const nm = x.name;
      if (impaired(x)) {
        out.push(x.role === "spy" ? `🕵️ ${nm} ist Spion, aber vergiftet/betrunken – zählt sicher als böser Scherge.` : `🏚️ ${nm} ist Einsiedler, aber vergiftet/betrunken – zählt sicher als guter Außenseiter.`);
        return;
      }
      let what = null;
      if (x.role === "spy") {
        if (stepId === "washerwoman") what = "als Dorfbewohner zeigen";
        else if (stepId === "librarian") what = "als Außenseiter zeigen";
        else if (ROLE_STEPS.includes(stepId)) what = "eine gute Rolle zeigen";
        else if (ALIGN_STEPS.includes(stepId) || ["seamstress", "villageidiot"].includes(stepId)) what = "als gut zählen";
        if (stepId === "empath" && what) {
          const c = aliveNeighbours(me).filter(j => isEvil(S[j])).length;
          what += ` (dann: ${c - 1})`;
        }
        if (what) out.push(`🕵️ ${nm} ist der Spion – du darfst ihn ${what}.`);
      } else {
        if (stepId === "investigator") what = "als Scherge zeigen";
        else if (stepId === "fortuneteller") what = "als Dämon gelten lassen (dann: Ja)";
        else if (ROLE_STEPS.includes(stepId)) what = "eine böse Rolle zeigen";
        else if (ALIGN_STEPS.includes(stepId) || ["seamstress", "villageidiot"].includes(stepId)) what = "als böse zählen";
        if (stepId === "empath" && what) {
          const c = aliveNeighbours(me).filter(j => isEvil(S[j])).length;
          what += ` (dann: ${c + 1})`;
        }
        if (what) out.push(`🏚️ ${nm} ist der Einsiedler – du darfst ihn ${what}.`);
      }
    });
    return out;
  }

  // Wer wacht bei diesem Nacht-Schritt auf? (inkl. Säufer, Marionette, Philosoph)
  const stepHolders = id => game.seats.map((s, i) => [s, i]).filter(([s]) =>
    (s.role === id && !(id === "amnesiac" && s.amn && s.amn.like)) || (s.role === "amnesiac" && s.amn && s.amn.like === id) || ((s.role === "drunk" || s.role === "marionette") && shownRole(s.role) === id) || (gainer(s) && s.gained === id));

