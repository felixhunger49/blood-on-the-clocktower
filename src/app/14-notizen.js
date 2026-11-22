  // =====================================================================
  //  NOTIZEN DER SPIELER (bleiben nur auf dem eigenen Handy)
  // =====================================================================
  // Vertrauen je Mitspieler (zum Antippen)
  const TRUST = [["good", "😇", "vertraue ich"], ["unsure", "❓", "unsicher"], ["evil", "😈", "verdächtig"]];

  // Rollen, die ein Mitspieler behaupten kann: die des eigenen Spiels (bzw. der eigenen Rollenliste)
  function claimPool() {
    const mine = store.get("botc.myrole", null);
    const role = mine && ROLE_BY_ID[mine.r];
    const sc = gameScript();
    const ed = sc ? "custom" : role && EDITIONS[role.ed] && !EDITIONS[role.ed].extra ? role.ed : null;
    return ROLES.filter(r => !["fabled", "traveller"].includes(r.t) && (ed ? inEd(r, ed, sc) : true));
  }

  function notesHtml() {
    const notes = store.get("botc.notes", {});
    // Online: Mitspieler aus dem Raum; offline: selbst eingetragene Namen
    const online = (pubState && pubState.seats) || [];
    const me = (store.get("botc.myrole", null) || {}).s;
    const seats = online.length ? online.map((x, k) => ({ n: x.n, a: x.a, k })).filter(x => x.k !== me) : (notes.names || []).map(n => ({ n, a: true, own: true }));
    const pool = claimPool();
    const groups = ["townsfolk", "outsider", "minion", "demon"].map(t => [t, pool.filter(r => r.t === t)]).filter(([, l]) => l.length);
    const roleSel = (name, key, ph) => `<select data-pclaim="${esc(name)}" data-pkey="${key}"><option value="">${ph}</option>${groups.map(([t, l]) =>
      `<optgroup label="${TEAMS[t].plural}">${l.map(r => `<option value="${r.id}" ${notes[key + ":" + name] === r.id ? "selected" : ""}>${r.ic} ${esc(r.de)}</option>`).join("")}</optgroup>`).join("")}</select>`;
    const claimSel = name => `<div class="nc-sels">${roleSel(name, "c", "🗨️ behauptet …")}${roleSel(name, "s", "🤔 ist wirklich …?")}</div>`;
    // Tischansicht: alle Plätze im Kreis mit Vertrauen, Behauptung und Vermutung
    const tableSeats = online.length ? online.map((x, k) => ({ n: x.n, a: x.a, me: k === me })) : (notes.names || []).map(n => ({ n, a: true }));
    const circle = () => {
      const n = tableSeats.length;
      if (n < 3) return `<p class="small">Für die Tischansicht braucht es mindestens 3 Spieler.</p>`;
      const d = Math.min(25, 0.92 * 2 * 41 * Math.sin(Math.PI / n)).toFixed(1);
      return `<div class="circle ncircle size-${n <= 8 ? "lg" : n <= 15 ? "md" : "sm"}" style="--d:${d}">
        <div class="circle-mid"><b>🧩 Mein Tisch</b><small>Antippen: zur Notiz</small></div>
        ${tableSeats.map((x, i) => {
          const a = (i / n) * 2 * Math.PI, t = notes["t:" + x.n], c = ROLE_BY_ID[notes["c:" + x.n]], g = ROLE_BY_ID[notes["s:" + x.n]];
          return `<button class="token ${g ? "t-" + g.t : c ? "t-" + c.t : ""} ${x.a ? "" : "dead"} ${t ? "tr-" + t : ""} ${x.me ? "me" : ""}" style="left:${50 + 41 * Math.sin(a)}%;top:${50 - 41 * Math.cos(a)}%" ${x.me ? "" : `data-ncard="${esc(x.n)}"`}>
            <span class="tk-name">${esc(String(x.n).replace(/^🤖\s*/, ""))}</span>
            <span class="tk-ic">${x.me ? "⭐" : g ? g.ic : c ? c.ic : t === "evil" ? "😈" : t === "good" ? "😇" : "❔"}</span>
            <span class="tk-role">${x.me ? "Du" : g ? "≈ " + esc(g.de) : c ? "„" + esc(c.de) + "“" : ""}</span>
            <span class="tk-marks">${x.a ? "" : "💀"}${!x.me && t ? (TRUST.find(z => z[0] === t) || [])[1] : ""}</span></button>`;
        }).join("")}</div>`;
    };
    const tview = store.get("botc.notesview", "list");
    const counts = { good: 0, unsure: 0, evil: 0 };
    seats.forEach(x => { const t = notes["t:" + x.n]; if (counts[t] !== undefined) counts[t]++; });
    return `<details class="panel notes" ${notesOpen ? "open" : ""}>
      <summary><h3>📝 Meine Notizen</h3>${seats.length ? `<span class="small"> 😇${counts.good} ❓${counts.unsure} 😈${counts.evil}</span>` : ""}</summary>
      <p class="small">Nur auf deinem Handy gespeichert – niemand sonst sieht sie.</p>
      ${seats.length ? `<div class="chips viewtoggle"><button class="chip ${tview === "circle" ? "" : "on"}" data-nview="list">☰ Liste</button><button class="chip ${tview === "circle" ? "on" : ""}" data-nview="circle">◯ Tischansicht</button></div>` : ""}
      ${seats.length && tview === "circle" ? circle() : ""}
      ${seats.length ? `<div class="notelist">${seats.map(x => {
        const t = notes["t:" + x.n], c = ROLE_BY_ID[notes["c:" + x.n]];
        return `<div class="notecard ${x.a ? "" : "dead"} ${t ? "tr-" + t : ""}" data-card="${esc(x.n)}">
          <div class="nc-top"><b class="nc-name">${c ? c.ic + " " : ""}${esc(x.n)}${x.a ? "" : " 💀"}</b>
            <span class="trust">${TRUST.map(([k, ic, label]) => `<button class="trustbtn ${t === k ? "on" : ""}" data-ptrust="${esc(x.n)}" data-v="${k}" title="${label}" aria-label="${label}">${ic}</button>`).join("")}</span>
            ${x.own ? `<button class="trustbtn del" data-pdel="${esc(x.n)}" aria-label="entfernen">✕</button>` : ""}</div>
          ${claimSel(x.n)}
          <input data-pnote="${esc(x.n)}" value="${esc(notes["p:" + x.n] || "")}" placeholder="Notiz zu ${esc(x.n)} …">
        </div>`;
      }).join("")}</div>` : ""}
      ${online.length ? "" : `<div class="addname"><input id="newname" placeholder="Mitspieler hinzufügen (Name)"><button class="btn sm" id="addname">+</button></div>`}
      <textarea id="gnote" rows="4" placeholder="Allgemeine Notizen: Was hast du erfahren? Wer passt nicht zusammen?">${esc(notes.general || "")}</textarea>
      <div class="row end"><button class="btn sm danger" id="clearnotes">Notizen löschen</button></div>
    </details>`;
  }
  let notesOpen = false;
  function rerenderNotes() {
    const el = $(".notes");
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = notesHtml();
    el.replaceWith(tmp.firstElementChild);
    bindNotes();
  }
  function bindNotes() {
    const d = $(".notes");
    if (!d) return;
    d.addEventListener("toggle", () => { notesOpen = d.open; });
    const get = () => store.get("botc.notes", {});
    const put = (k, v) => { const n = get(); if (v === null || v === "") delete n[k]; else n[k] = v; store.set("botc.notes", n); };
    $("#gnote").addEventListener("input", e => put("general", e.target.value));
    $$("[data-pnote]").forEach(inp => inp.addEventListener("input", () => put("p:" + inp.dataset.pnote, inp.value)));
    $$("[data-pclaim]").forEach(sel => sel.addEventListener("change", () => { put((sel.dataset.pkey || "c") + ":" + sel.dataset.pclaim, sel.value); rerenderNotes(); }));
    $$("[data-nview]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); store.set("botc.notesview", b.dataset.nview); rerenderNotes(); }));
    $$("[data-ncard]").forEach(b => b.addEventListener("click", e => {
      e.preventDefault();
      const card = $$("[data-card]").find(c => c.dataset.card === b.dataset.ncard);
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1200); }
    }));
    $$("[data-ptrust]").forEach(btn => btn.addEventListener("click", e => {
      e.preventDefault();
      const k = "t:" + btn.dataset.ptrust;
      put(k, get()[k] === btn.dataset.v ? null : btn.dataset.v);
      rerenderNotes();
    }));
    const add = () => {
      const v = $("#newname").value.trim();
      if (!v) return;
      const n = get();
      n.names = [...new Set([...(n.names || []), v])];
      store.set("botc.notes", n);
      rerenderNotes();
      const inp = $("#newname"); if (inp) inp.focus();
    };
    $("#addname") && $("#addname").addEventListener("click", add);
    $("#newname") && $("#newname").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    $$("[data-pdel]").forEach(btn => btn.addEventListener("click", () => {
      const n = get(), name = btn.dataset.pdel;
      n.names = (n.names || []).filter(x => x !== name);
      ["t:", "c:", "p:"].forEach(pre => delete n[pre + name]);
      store.set("botc.notes", n);
      rerenderNotes();
    }));
    $("#clearnotes").addEventListener("click", () => { if (confirm("Alle Notizen löschen?")) { store.del("botc.notes"); renderPlayer(); } });
  }

