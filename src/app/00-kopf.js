// Blood on the Clocktower – Rollen-App (ohne Server, alles im Browser).
// Diese Datei wird aus src/app/ zusammengesetzt (node tools/build.cjs) – bitte dort ändern, nicht hier.

(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const view = $("#view");

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Speicher ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privater Modus */ }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    }
  };

  // ---------- Zufall ----------
  function randInt(n) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, k) => shuffle(arr).slice(0, k);

  // ---------- Spieler-Codes (5 Zeichen) ----------
  // 25 Bit: Rolle (7) | Gesinnung (2) | Platz (5) | Salz (5) | Prüfsumme (6), verwürfelt per Multiplikation.
  const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const MOD = 2 ** 25;
  const MUL = 0x1A3B5C9; // ungerade -> umkehrbar modulo 2^25
  const mulmod = (a, b) => (a * b) % MOD;
  const MUL_INV = (() => {
    let x = MUL;
    for (let i = 0; i < 6; i++) x = mulmod(x, (2 - mulmod(MUL, x) + MOD) % MOD);
    return x;
  })();
  const check6 = p => { const h = Math.imul(p ^ 0x5bd1e995, 0x01000193) >>> 0; return (h ^ (h >>> 13)) & 63; };

  function makeCode(roleIdx, align, seat, salt) {
    const p = roleIdx | (align << 7) | (seat << 9) | (salt << 14);
    let v = mulmod(p * 64 + check6(p), MUL);
    let s = "";
    for (let i = 0; i < 5; i++) { s = ALPHABET[v & 31] + s; v = Math.floor(v / 32); }
    return s;
  }
  function readCode(code) {
    code = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (code.length !== 5) return null;
    let v = 0;
    for (const ch of code) {
      const d = ALPHABET.indexOf(ch);
      if (d < 0) return null;
      v = v * 32 + d;
    }
    v = mulmod(v, MUL_INV);
    const p = Math.floor(v / 64);
    if ((v & 63) !== check6(p)) return null;
    const role = ROLES[p & 127];
    if (!role) return null;
    const align = (p >> 7) & 3;
    return { r: role.id, s: (p >> 9) & 31, a: align === 1 ? "g" : align === 2 ? "e" : undefined };
  }

  // ---------- Links (verschleiert, damit man die Rolle nicht in der URL liest) ----------
  const KEY = new TextEncoder().encode("clocktower-grimoire");
  function encodeLink(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b, i) => { bin += String.fromCharCode(b ^ KEY[i % KEY.length]); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeLink(str) {
    try {
      const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY[i % KEY.length]);
      const obj = JSON.parse(new TextDecoder().decode(bytes));
      return ROLE_BY_ID[obj.r] ? obj : null;
    } catch (e) { return null; }
  }
  const baseUrl = () => location.href.split("#")[0];

  // ---------- Hilfen zu Rollen ----------
  const isGood = (role, align) => role.t === "traveller" || align ? align !== "e" : TEAMS[role.t].good;
  const teamClass = (role, align) => role.t === "traveller" ? (align === "e" ? "t-evil-trav" : "t-traveller") : "t-" + role.t;
  // Gehört eine Rolle zur Edition? Bei „Eigene Liste“ entscheidet die Rollenliste des Spielleiters.
  const scIds = sc => (sc || []).map(x => typeof x === "number" ? (ROLES[x] || {}).id : x).filter(Boolean);
  const inEd = (r, ed, script) => ed === "custom" ? scIds(script || game.script).includes(r.id) : r.ed === ed;
  // Rollenliste des aktuellen Spiels (Spielleiter: eigene Liste; Spieler: von der Karte oder aus dem Online-Spiel)
  function gameScript() {
    const mine = store.get("botc.myrole", null);
    if (mine && mine.sc) return scIds(mine.sc);
    if (typeof pubState !== "undefined" && pubState && pubState.script) return scIds(pubState.script);
    if (game.edition === "custom" && (game.script || []).length && game.seats.length) return game.script.slice();
    return null;
  }
  function scriptInfo() {
    const sc = gameScript();
    if (sc) return { ids: sc, name: "Euer Skript" };
    const mine = store.get("botc.myrole", null), role = mine && ROLE_BY_ID[mine.r];
    let ed = typeof pubState !== "undefined" && pubState && pubState.ed && pubState.ed !== "custom" ? pubState.ed : null;
    if (!ed && role && EDITIONS[role.ed] && !EDITIONS[role.ed].extra && role.t !== "traveller") ed = role.ed;
    if (!ed && game.seats.length && game.edition !== "custom" && EDITIONS[game.edition]) ed = game.edition;
    return ed ? { ids: ROLES.filter(r => r.ed === ed).map(r => r.id), name: EDITIONS[ed].name } : null;
  }
  // Nachtreihenfolge für eine Rollenliste (erste Nacht / andere Nächte)
  function nightOrderHtml(ids, title) {
    const col = (order, key, head) => {
      let k = 0;
      const items = order.map(id => {
        if (id === "dusk" || id === "dawn") return "";
        if (NIGHT_STEPS[id]) return key === "n1" ? `<li class="no-step"><span class="no-n">${++k}</span> 🤫 ${esc(NIGHT_STEPS[id].de)} <small>(ab 7 Spielern)</small></li>` : "";
        const r = ROLE_BY_ID[id];
        if (!r || !ids.includes(id) || !r[key]) return "";
        return `<li><details><summary><span class="no-n">${++k}</span> <span class="lex-ic">${r.ic}</span><b class="t-${r.t}-text">${esc(r.de)}</b>${r.t === "traveller" ? ` <small class="small">(Reisender)</small>` : ""}</summary><p class="small">${esc(r.a)}</p></details></li>`;
      }).join("");
      return `<div class="no-col"><h3>${head}</h3><ol class="no-list">${items || "<li class='small'>–</li>"}</ol></div>`;
    };
    return `<details class="panel nightorder"><summary><h2>🌙 Nachtreihenfolge <span class="small">(${esc(title)})</span></h2></summary>
      <p class="small">In dieser Reihenfolge weckt der Spielleiter die Rollen – aber nur die, die wirklich im Spiel sind. Antippen zeigt die Fähigkeit.</p>
      <div class="no-cols">${col(NIGHT_FIRST, "n1", "Erste Nacht")}${col(NIGHT_OTHER, "n", "Andere Nächte")}</div></details>`;
  }
  const rolesOf = (ed, team) => ROLES.filter(r => inEd(r, ed) && r.t === team);
  const roleName = id => ROLE_BY_ID[id] ? ROLE_BY_ID[id].de : "?";

  // ---------- Rollenkarte ----------
  // Spion: Kopie des Grimoires, wie der Spielleiter es geschickt hat
  function grimBox(g) {
    return `<details class="box grimbox" open><summary><h4>📖 Das Grimoire (Nacht ${g.n})</h4></summary>
      <ol class="grimlist">${g.s.map(([name, rid, alive, marks, extra]) => { const r = ROLE_BY_ID[rid] || {}; return `<li class="${alive ? "" : "dead"} t-${r.t || ""}-border">
        <b>${esc(name)}</b> <span>${r.ic || ""} ${esc(r.de || "?")}${extra ? ` <small>(${esc(extra)})</small>` : ""}</span>${alive ? "" : " 💀"}${marks ? ` <span class="gl-marks">${esc(marks)}</span>` : ""}</li>`; }).join("")}</ol>
      ${(g.b || []).length ? `<p class="small">Bluffs des Dämons: ${g.b.map(id => esc(roleName(id))).join(", ")}</p>` : ""}</details>`;
  }

  function cardHtml(info) {
    const role = ROLE_BY_ID[info.r];
    const good = isGood(role, info.a);
    const team = TEAMS[role.t];
    let evil = "";
    if (info.x) {
      const x = info.x;
      evil = `<div class="box evilinfo"><h4>🤫 Geheime Info deines Teams</h4>`;
      if (x.d) evil += `<p>${x.tr ? "Du bist ein böser Reisender. Der Dämon ist" : "Dein Dämon ist"}: <b>${esc(x.d)}</b></p>`;
      if (x.m && x.m.length) evil += `<p>${x.d ? "Weitere Schergen" : "Deine Schergen"}: <b>${x.m.map(esc).join(", ")}</b></p>`;
      if (x.m && !x.m.length && !x.d) evil += `<p>Du hast keine Schergen.</p>`;
      if (x.l) evil += `<p>Der Wahnsinnige (glaubt, Dämon zu sein): <b>${esc(x.l)}</b></p>`;
      if (x.mo) evil += `<p>Deine Marionette (glaubt, gut zu sein): <b>${esc(x.mo)}</b></p>`;
      if (x.b && x.b.length) evil += `<p>Deine Bluffs (gute Rollen, die nicht im Spiel sind):</p><ul>${x.b.map(id => `<li><b>${esc(roleName(id))}</b> – ${esc(ROLE_BY_ID[id].a)}</li>`).join("")}</ul>`;
      evil += `</div>`;
    }
    const grim = (info.g ? grimBox(info.g) : "") + (info.amk ? `<div class="box ability"><h4>❓ Deine Fähigkeit (erraten!)</h4><p>${esc(info.amk)}</p></div>` : "");
    return `
      <div class="rolecard ${teamClass(role, info.a)}">
        <div class="rc-head">
          ${info.n ? `<div class="rc-for">Für: ${esc(info.n)}</div>` : ""}
          <div class="rc-icon">${role.ic}</div>
          <div class="rc-name">${esc(role.de)}</div>
          <div class="rc-en">${esc(role.en)}</div>
          <div class="rc-team">${team.name} · ${good ? "Gut 😇" : "Böse 😈"}</div>
        </div>
        <div class="rc-body">
          <div class="box ability"><h4>Deine Fähigkeit</h4><p>${esc(role.a)}</p></div>
          <div class="box"><h4>So funktioniert's</h4><p>${esc(role.e)}</p></div>
          ${role.tip ? `<div class="box"><h4>💡 Tipp</h4><p>${esc(role.tip)}</p></div>` : ""}
          ${grim}
          ${(info.i || []).length ? `<div class="box infos"><h4>🌙 Deine Infos vom Spielleiter</h4><ul>${info.i.map(x =>
            `<li>${String(x.t || "").startsWith("☀️") ? "" : `<b>Nacht ${x.n}:</b> `}${[(x.r || []).map(id => esc(roleName(id))).join(" / "), x.t ? esc(x.t) : ""].filter(Boolean).join(" – ")}</li>`).join("")}</ul></div>` : ""}
          ${info.m && ROLE_BY_ID[info.m] ? `<div class="box madness"><h4>😵 Wahnsinn</h4>
            <p>Du musst am Tag <b>überzeugend behaupten, ${esc(ROLE_BY_ID[info.m].de)} zu sein</b>. Tust du es nicht, kann der Spielleiter dich hinrichten lassen.</p>
            <p class="small">${esc(ROLE_BY_ID[info.m].de)}: ${esc(ROLE_BY_ID[info.m].a)}</p></div>` : ""}
          ${evil}
          <div class="box win"><h4>🏆 Dein Ziel</h4><p>${good
            ? "Du bist <b>gut</b>. Finde den Dämon und lass ihn hinrichten. Gut gewinnt, wenn der Dämon stirbt."
            : "Du bist <b>böse</b>. Lüge, täusche und schütze den Dämon. Böse gewinnt, wenn nur noch 2 Spieler leben."}</p></div>
          <p class="small">Edition: ${esc(EDITIONS[role.ed].name)}</p>
        </div>
      </div>`;
  }

  // ---------- Modal ----------
  const modal = $("#modal");
  function openModal(html, cls = "") {
    $("#modal-content").innerHTML = html;
    modal.className = "modal " + cls;
    document.body.classList.add("noscroll");
  }
  function closeModal() {
    modal.className = "modal hidden";
    $("#modal-content").innerHTML = "";
    document.body.classList.remove("noscroll");
  }
  $(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

