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

  // Leise, selbst erzeugte Klänge (keine Audiodateien nötig)
  const Mood = (() => {
    // Erzeugte Hintergrundmusik: Akkordfolge als weicher Klangteppich + zufällige Harfen-Melodie + Echo.
    // Nacht: Moll, langsam und düster. Tag: Dur, heller und etwas schneller. Alles im Bereich von Handy-Lautsprechern.
    const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI-Note -> Hz
    const STYLE = {
      night: { bpm: 54, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], // Am F Dm E
        scale: [69, 72, 74, 76, 79, 81, 84], prob: 0.45, wave: "sine" },
      day: { bpm: 76, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
        scale: [72, 74, 76, 79, 81, 84, 86, 88], prob: 0.7, wave: "triangle" }
    };
    let ctx = null, master = null, echo = null, timer = null, phase = null;
    let nextBeat = 0, beat = 0, pad = [], last = 3;
    const api = { on: false };

    function pluck(f, t, vol, wave) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 2.4);
      o.connect(g); g.connect(master); g.connect(echo);
      o.start(t); o.stop(t + 2.5);
    }
    function padChord(notes, t, dur) {
      pad.forEach(v => { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value || 0.0001, t); v.g.gain.linearRampToValueAtTime(0, t + 2); v.o.stop(t + 2.1); });
      pad = notes.map((n, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = N(n); o.detune.value = (k - 1) * 6;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 2);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 2.2);
        return { o, g };
      });
    }
    function schedule() {
      if (!ctx || !master) return;
      const st = STYLE[phase] || STYLE.night, spb = 60 / st.bpm;
      while (nextBeat < ctx.currentTime + 0.6) {
        const t = Math.max(nextBeat, ctx.currentTime + 0.02);
        const bar = Math.floor(beat / 8) % st.chords.length, chord = st.chords[bar];
        if (beat % 8 === 0) padChord(chord, t, spb * 8);
        if (beat % 4 === 0) chord.forEach((n, k) => pluck(N(n), t + k * spb / 3, 0.14, "triangle")); // gebrochener Akkord
        if (Math.random() < st.prob) {
          // Melodie bewegt sich in kleinen Schritten durch die Tonleiter
          last = Math.max(0, Math.min(st.scale.length - 1, last + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
          pluck(N(st.scale[last]), t + (Math.random() < 0.3 ? spb / 2 : 0), 0.26 + Math.random() * 0.08, st.wave);
        }
        nextBeat += spb; beat++;
      }
    }
    function start() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state !== "running") ctx.resume();
        const now = ctx.currentTime;
        master = ctx.createGain();
        master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(0.9, now + 2);
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
        echo = ctx.createDelay(1.5); echo.delayTime.value = 0.42;
        const fb = ctx.createGain(); fb.gain.value = 0.35;
        const wet = ctx.createGain(); wet.gain.value = 0.5;
        echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(lp);
        master.connect(lp); lp.connect(ctx.destination);
        phase = phase || currentPhase();
        nextBeat = now + 0.1; beat = 0;
        clearInterval(timer); timer = setInterval(schedule, 200); schedule();
      } catch (e) { api.on = false; toast("Musik kann auf diesem Gerät nicht abgespielt werden"); }
    }
    function stop() {
      clearInterval(timer); timer = null;
      if (!ctx || !master) return;
      const now = ctx.currentTime, m = master;
      m.gain.cancelScheduledValues(now); m.gain.setValueAtTime(m.gain.value, now); m.gain.linearRampToValueAtTime(0, now + 1);
      pad.forEach(v => { try { v.o.stop(now + 1.1); } catch (e) { /* schon aus */ } }); pad = [];
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* egal */ } }, 1300);
      master = null;
    }
    api.toggle = on => {
      api.on = on; store.set("botc.music", on);
      if (on) { start(); if (api.on) toast("🎵 Musik an – Medien-Lautstärke aufdrehen, falls du nichts hörst"); } else stop();
    };
    // Beim Wechsel Nacht/Tag: neue Stimmung ab dem nächsten Takt
    api.setPhase = ph => { if (ph === phase) return; phase = ph; if (api.on && master) { beat = 0; last = 3; } };
    return api;
  })();
  setInterval(applyPhase, 1000);

