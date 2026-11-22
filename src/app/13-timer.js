  // =====================================================================
  //  TIMER FÜR DIE TAGESPHASE
  // =====================================================================
  const fmtTime = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  // Restzeit eines Timer-Zustands { end, left, running } in Millisekunden (null = kein Timer)
  const timerLeft = t => !t ? null : t.running ? t.end - Date.now() : (t.left || 0);

  function timerBox() {
    const t = game.timer;
    const left = timerLeft(t);
    return `<div class="box timerbox">
      <div class="tb-row"><h4>${t && t.label ? esc(t.label) : "⏱️ Timer"}</h4><span class="timerval big ${left !== null && left <= 0 ? "over" : ""}">${left === null ? "0:00" : fmtTime(left)}</span></div>
      ${game.phase === "day" ? `<div class="chips tphases">${Object.entries(dayPhases()).map(([k, ph]) => `<button class="chip ${t && t.phase === k ? "on" : ""}" data-tphase="${k}">${ph.ic} ${esc(ph.l)} · ${ph.min} min</button>`).join("")}</div>
      <p class="small">Empfohlene Zeiten für ${alivePlayers()} Lebende an Tag ${game.nightNo} – sie werden jeden Tag etwas kürzer.</p>` : ""}
      <div class="chips">${[2, 3, 5, 8, 10].map(m => `<button class="chip" data-tmin="${m}">${m} min</button>`).join("")}</div>
      <div class="row wrap">
        ${t && t.running ? `<button class="btn" id="tpause">⏸️ Pause</button>` : t && t.left > 0 ? `<button class="btn primary" id="tstart">▶️ Weiter</button>` : ""}
        ${t && (t.running || t.left > 0) ? `<button class="btn" id="tplus">+1 min</button>` : ""}
        ${t ? `<button class="btn" id="treset">⏹️ Stopp</button>` : ""}
      </div>
      ${game.online ? `<p class="small">🌐 Die Spieler sehen den Timer auf ihrem Handy.</p>` : ""}
    </div>`;
  }
  // Tagesphasen mit empfohlener Dauer (je mehr Lebende, desto länger; jeden Tag etwas kürzer)
  const alivePlayers = () => game.seats.filter(x => x.alive && !x.trav).length;
  function dayPhases() {
    const a = alivePlayers(), d = Math.max(0, game.nightNo - 1);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
    return {
      private: { ic: "🤫", l: "Private Gespräche", min: cl(a * 0.6 - d * 0.5, 2, 8), end: "Private Gespräche vorbei – alle zurück an den Tisch!" },
      public: { ic: "💬", l: "Offene Runde", min: cl(a * 0.35, 2, 5), end: "Offene Runde vorbei – jetzt wird nominiert!" },
      noms: { ic: "⚖️", l: "Nominierungen", min: cl(a * 0.5, 3, 8), end: "Zeit für Nominierungen ist um – die Sonne geht unter!" }
    };
  }
  function bindTimer() {
    $$("[data-tmin]").forEach(b => b.addEventListener("click", () => {
      game.timer = { running: true, end: Date.now() + +b.dataset.tmin * 60000, left: 0, rang: false };
      unlockAudio(); save(); renderSL();
    }));
    $$("[data-tphase]").forEach(b => b.addEventListener("click", () => {
      const ph = dayPhases()[b.dataset.tphase];
      game.timer = { running: true, end: Date.now() + ph.min * 60000, left: 0, rang: false, phase: b.dataset.tphase, label: `${ph.ic} ${ph.l}`, endMsg: ph.end };
      unlockAudio(); save(); renderSL();
    }));
    $("#tpause") && $("#tpause").addEventListener("click", () => { game.timer = { ...game.timer, running: false, left: timerLeft(game.timer), rang: false }; save(); renderSL(); });
    $("#tstart") && $("#tstart").addEventListener("click", () => { game.timer = { ...game.timer, running: true, end: Date.now() + game.timer.left, left: 0, rang: false }; unlockAudio(); save(); renderSL(); });
    $("#tplus") && $("#tplus").addEventListener("click", () => {
      const t = game.timer;
      if (t.running) t.end = Math.max(t.end, Date.now()) + 60000; else t.left = (t.left || 0) + 60000;
      t.rang = false; save(); renderSL();
    });
    $("#treset") && $("#treset").addEventListener("click", () => { game.timer = null; save(); renderSL(); });
  }

  // Ton am Ende (Browser erlauben Ton erst nach einer Berührung)
  let audioCtx = null;
  function unlockAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { /* kein Ton */ }
  }
  function beep() {
    if (!audioCtx) return;
    try {
      [0, 0.35, 0.7].forEach(off => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.25, audioCtx.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + off + 0.3);
        o.start(audioCtx.currentTime + off); o.stop(audioCtx.currentTime + off + 0.3);
      });
    } catch (e) { /* kein Ton */ }
  }
  document.addEventListener("click", unlockAudio, { once: true });

  // Läuft jede Sekunde: Anzeigen aktualisieren, kleine Uhr oben einblenden, am Ende Alarm.
  let lastRangKey = "";
  function tickTimer() {
    const host = game.timer && (game.timer.running || game.timer.left > 0) ? game.timer : null;
    const pub = !host && pubState && pubState.timer && (pubState.timer.running || pubState.timer.left > 0) ? pubState.timer : null;
    const t = host || pub;
    const left = timerLeft(t);
    $$(".timerval").forEach(el => { el.textContent = left === null ? "0:00" : fmtTime(left); el.classList.toggle("over", left !== null && left <= 0); });
    let chip = $("#timerchip");
    if (t) {
      if (!chip) {
        chip = document.createElement("button");
        chip.id = "timerchip";
        chip.addEventListener("click", () => { if (host) location.hash = "#/sl"; });
        document.body.appendChild(chip);
      }
      chip.textContent = (t.running ? "" : "⏸️ ") + (t.label ? t.label + " " : t.running ? "⏱️ " : "") + fmtTime(left);
      chip.classList.toggle("over", left <= 0);
    } else if (chip) chip.remove();
    // Alarm genau einmal pro Ablauf
    if (t && t.running && left <= 0 && left > -10000) {
      const key = String(t.end);
      if (lastRangKey !== key) {
        lastRangKey = key;
        beep();
        if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
        notice(`⏰ ${t.endMsg || "Die Zeit ist um!"}`);
      }
    }
  }
  setInterval(tickTimer, 1000);

