  // =====================================================================
  //  STIMMUNG: Tag/Nacht-Farben und leise Musik
  // =====================================================================
  // Phase für das Aussehen: Spielleiter nimmt sein Spiel, Spieler den Stand aus dem Online-Spiel
  function currentPhase() {
    if (game.seats.length && game.step === "grim") return game.phase || "night";
    if (store.get("botc.online", null) && pubState && pubState.started) return pubState.phase || "night";
    return "night";
  }
  function applyPhase() {
    const ph = currentPhase();
    if (document.body.dataset.phase !== ph) document.body.dataset.phase = ph;
    Mood.setPhase(ph);
  }

  // Stimmungsmusik: zwei Stücke (Nacht mit Rhythmus, Tag ruhig), in Schleife, weich übergeblendet.
  // Beide laufen gleichzeitig (der leise Teil auf Lautstärke 0) – so klappt der Wechsel auch auf dem iPhone ohne neuen Tipp.
  const Mood = (() => {
    const TRACKS = { night: "audio/nacht.mp3?2", day: "audio/tag.mp3?2" }; // ?2 – nach Änderungen an der Musik erhöhen
    const LEVEL = 0.55; // Hintergrund – nicht zu laut
    let ctx = null, phase = null;
    const ch = {}; // phase -> { el, gain }
    const api = { on: false };

    // Ein Stück als Audio-Element mit eigener Lautstärke (über Web Audio – auf dem iPhone geht .volume nicht)
    function channel(ph) {
      if (ch[ph]) return ch[ph];
      const el = new Audio(TRACKS[ph]);
      el.loop = true; el.preload = "auto";
      const gain = ctx.createGain(); gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain); gain.connect(ctx.destination);
      ch[ph] = { el, gain };
      return ch[ph];
    }
    function fade(c, to, sec) {
      if (!c || !ctx) return;
      const g = c.gain.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + sec);
    }
    function start() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume();
        phase = phase || currentPhase();
        // Alles noch im selben Tipp starten – sonst bleibt es auf dem iPhone stumm
        Object.keys(TRACKS).forEach(ph => {
          const c = channel(ph);
          c.el.play().then(() => fade(c, ph === phase && api.on ? LEVEL : 0, ph === phase ? 3 : 0.1)).catch(() => {
            if (!api.on) return;
            api.on = false; store.set("botc.music", false);
            toast(navigator.onLine === false ? "Musik braucht eine Internetverbindung" : "Musik kann auf diesem Gerät nicht abgespielt werden");
          });
        });
      } catch (e) {
        api.on = false; store.set("botc.music", false);
        toast("Musik kann auf diesem Gerät nicht abgespielt werden");
      }
    }
    function stop() {
      Object.values(ch).forEach(c => fade(c, 0, 1.2));
      setTimeout(() => { if (!api.on) Object.values(ch).forEach(c => c.el.pause()); }, 1400);
    }
    api.toggle = on => {
      api.on = on; store.set("botc.music", on);
      if (on) { start(); toast("🎵 Musik an – Medien-Lautstärke aufdrehen, falls du nichts hörst"); } else stop();
    };
    // Beim Wechsel Nacht/Tag: in 4 Sekunden überblenden
    api.setPhase = ph => {
      if (ph === phase) return;
      phase = ph;
      if (!api.on) return;
      Object.entries(ch).forEach(([k, c]) => fade(c, k === ph ? LEVEL : 0, 4));
    };
    return api;
  })();
  setInterval(applyPhase, 1000);

