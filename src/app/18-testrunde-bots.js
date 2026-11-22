  // =====================================================================
  //  TESTRUNDE MIT BOTS
  // =====================================================================
  const BOT_NAMES = ["Anna", "Ben", "Clara", "David", "Eva", "Finn", "Greta", "Hugo", "Ida", "Jonas", "Klara", "Leo", "Mia", "Noah", "Olga"];
  function testPanel() {
    if (game.online) return "";
    if (game.test) return `<section class="panel testpanel"><h2>🤖 Testrunde läuft</h2>
      <p class="small">Die Plätze sind mit Bots besetzt. Sie wählen nachts selbst, „sehen“ ihre Infos und antworten wie echte Handys. Tippe im Grimoire einen Spieler an → <b>🤖 Handy ansehen</b>, um zu sehen, was er auf seinem Handy hätte. Abstimmungen trägst du wie gewohnt ein.</p>
      <button class="btn danger" id="teststop">Testrunde beenden</button></section>`;
    return `<section class="panel muted testpanel"><h3>🤖 Testrunde zum Üben</h3>
      <p class="small">Du bist der Spielleiter, alle anderen Plätze sind Bots. So kannst du ein ganzes Spiel mit Nachtaktionen, „Wie am Tisch“, Infos und Abstimmungen ausprobieren – ganz ohne Mitspieler und ohne Internet.</p>
      <button class="btn" id="teststart">🤖 Testrunde mit ${game.count} Bots starten</button></section>`;
  }
  function startTest() {
    const n = game.count;
    game.test = true;
    game.names = BOT_NAMES.slice(0, n).map(x => "🤖 " + x);
    game.pids = game.names.map((_, i) => "bot-" + i);
    game.nightActions = true;
    game.selected = [];
    save(); goStep("roles");
    toast(`${n} Bots sitzen am Tisch – wähle die Rollen`);
  }
  // Was der Bot auf seinem Handy sehen würde
  function showBotPhone(i) {
    const s = game.seats[i];
    const info = seatInfo(s, i);
    const live = !isBot(s) && s.pid;
    openModal(`<p class="small center">${isBot(s) ? "🤖" : "📱"} So sieht das Handy von ${esc(s.name)} aus${live ? (lobby[s.pid] ? " <span class='okmsg'>· 🟢 verbunden</span>" : " <span class='warnmsg'>· ⚪ gerade nicht verbunden</span>") : ""}</p>
      <div class="botphone">${cardHtml(info)}</div>
      <div class="row center"><button class="btn primary" id="botclose">Zurück</button></div>`, "full");
    $("#botclose").addEventListener("click", () => { closeModal(); seatModal(i); });
  }

