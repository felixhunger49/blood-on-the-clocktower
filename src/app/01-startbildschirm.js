  // =====================================================================
  //  ZUM STARTBILDSCHIRM HINZUFÜGEN
  // =====================================================================
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installEvent = e;
    $$(".install-btn").forEach(b => b.classList.remove("hidden"));
  });
  window.addEventListener("appinstalled", () => $$(".install").forEach(el => el.remove()));

  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function installPanel() {
    if (isStandalone()) return "";
    const how = isIOS()
      ? `In <b>Safari</b> unten auf <b>Teilen</b> <span class="kbd">⬆︎</span> tippen, dann <b>„Zum Home-Bildschirm“</b> wählen.`
      : `Im Browser-Menü <span class="kbd">⋮</span> auf <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> tippen.`;
    return `<section class="panel install">
      <div class="install-row"><img src="icon-192.png" alt="" class="install-icon">
        <div><b>Als App aufs Handy</b><p class="small">Ein Icon auf dem Startbildschirm – kein Link mehr eintippen, funktioniert auch offline.</p></div></div>
      <button class="btn primary install-btn ${installEvent ? "" : "hidden"}">📲 Jetzt installieren</button>
      <p class="install-how">${how}</p>
    </section>`;
  }
  function bindInstall() {
    $$(".install-btn").forEach(b => b.addEventListener("click", async () => {
      if (!installEvent) return;
      installEvent.prompt();
      await installEvent.userChoice.catch(() => {});
      installEvent = null;
      b.classList.add("hidden");
    }));
  }

