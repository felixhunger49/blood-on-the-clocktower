  // =====================================================================
  //  ROLLEN-INFO ZEIGEN (Totengräber, Rabenhüter, Waschfrau …)
  // =====================================================================
  // Rollen, die nachts eine Info vom Spielleiter bekommen (nur dort gibt es den Info-Knopf).
  const INFO_ROLES = [
    // Trouble Brewing
    "washerwoman", "librarian", "investigator", "chef", "empath", "fortuneteller", "undertaker", "ravenkeeper",
    // Bad Moon Rising
    "grandmother", "chambermaid", "godfather",
    // Sects & Violets
    "clockmaker", "dreamer", "mathematician", "flowergirl", "towncrier", "oracle", "seamstress", "juggler", "sage", "amnesiac",
    // Experimentelle Rollen
    "noble", "pixie", "highpriestess", "balloonist", "general", "villageidiot", "knight", "steward", "shugenja",
    "choirboy", "king", "bountyhunter", "nightwatchman", "preacher"
  ];
  // Nacht-Schritte, bei denen der Spielleiter eine oder mehrere Rollen zeigt.
  const SHOW_ROLE = ["undertaker", "ravenkeeper", "washerwoman", "librarian", "investigator", "grandmother",
    "dreamer", "king", "pixie", "godfather", "sage", "noble"];
  const INFO_HINT = {
    undertaker: "Rolle des heute Hingerichteten",
    ravenkeeper: "Rolle des Spielers, auf den der Rabenhüter zeigt",
    washerwoman: "Dorfbewohner-Rolle – dazu zwei Spieler nennen",
    librarian: "Außenseiter-Rolle – dazu zwei Spieler nennen",
    investigator: "Schergen-Rolle – dazu zwei Spieler nennen",
    grandmother: "Rolle des Enkelkinds – dazu den Spieler nennen",
    dreamer: "Eine gute und eine böse Rolle (eine stimmt)",
    king: "Eine lebende Rolle",
    pixie: "Eine Dorfbewohner-Rolle im Spiel",
    godfather: "Die Außenseiter im Spiel",
    sage: "Zwei Spieler nennen, einer ist der Dämon",
    noble: "Drei Spieler nennen, genau einer ist böse"
  };

