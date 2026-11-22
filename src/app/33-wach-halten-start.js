  // =====================================================================
  //  BILDSCHIRM WACH HALTEN (im Online-Spiel)
  // =====================================================================
  // Bei ausgeschaltetem Bildschirm kommen keine Aufgaben, Infos oder Timer an.
  // Deshalb bleibt der Bildschirm an, solange dieses Handy in einem Online-Spiel ist.
  let wakeLock = null;
  async function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    const want = !!(store.get("botc.online", null) || game.online);
    if (want && !wakeLock && document.visibilityState === "visible") {
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLock = lock;
        lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
      } catch (e) { /* z. B. Energiesparmodus – später erneut versuchen */ }
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      lock.release().catch(() => {});
    }
  }
  // Das System gibt die Sperre frei, sobald die App in den Hintergrund geht – beim Zurückkommen neu anfordern.
  document.addEventListener("visibilitychange", keepAwake);
  document.addEventListener("click", keepAwake);
  setInterval(keepAwake, 10000);
  keepAwake();

  // Für Tests im Browser
  window.__botc = { makeCode, readCode, encodeLink, decodeLink, awake: () => !!wakeLock };
})();
