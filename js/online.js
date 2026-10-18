// Online-Modus: Verbindung über Firebase Realtime Database + Ende-zu-Ende-Verschlüsselung.
//
// Datenmodell unter rooms/<CODE>:
//   meta     { host: uid, hostPub: JWK, created, edition }      – schreibt nur der Spielleiter
//   players  { <uid>: { name, pub: JWK, joined } }               – jeder Spieler nur seinen Eintrag
//   roles    { <uid>: { iv, ct } }                               – verschlüsselte Rollenkarte je Spieler
//   public   { nightNo, seats: [...], winner }                   – für alle sichtbar (keine Rollen!)
//   inbox    { <uid>: { <push>: { iv, ct } } }                   – verschlüsselte Nachrichten an den Spielleiter
//
// Rollen und Nachrichten werden mit einem ECDH-Schlüssel zwischen Spielleiter und Spieler
// verschlüsselt (AES-GCM). Wer nur den Raum-Code kennt, kann keine fremden Rollen lesen.

const Net = (() => {
  "use strict";

  const configured = () => !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  let ready = null;
  let api = null;

  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Konnte " + src + " nicht laden"));
      document.head.appendChild(s);
    });
  }

  // Verbindet sich mit Firebase und meldet sich anonym an. Liefert die eigene uid.
  function init() {
    if (ready) return ready;
    ready = (async () => {
      if (!configured()) throw new Error("Online-Modus ist nicht eingerichtet.");
      if (!window.firebase) {
        await load("vendor/firebase/firebase-app-compat.js");
        await load("vendor/firebase/firebase-auth-compat.js");
        await load("vendor/firebase/firebase-database-compat.js");
      }
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
      const auth = app.auth();
      const db = app.database();
      if (window.FIREBASE_EMULATOR) {
        auth.useEmulator("http://127.0.0.1:9099");
        db.useEmulator("127.0.0.1", 9000);
      }
      const user = auth.currentUser || (await auth.signInAnonymously()).user;
      api = {
        uid: user.uid,
        get: async path => (await db.ref(path).get()).val(),
        set: (path, v) => db.ref(path).set(v),
        update: (path, v) => db.ref(path).update(v),
        remove: path => db.ref(path).remove(),
        push: (path, v) => db.ref(path).push(v),
        listen(path, cb) {
          const ref = db.ref(path);
          const h = ref.on("value", snap => cb(snap.val()));
          return () => ref.off("value", h);
        },
        onDisconnectRemove: path => db.ref(path).onDisconnect().cancel()
      };
      // Verbindungsstatus für die Anzeige
      db.ref(".info/connected").on("value", snap => {
        Net.connected = !!snap.val();
        document.dispatchEvent(new CustomEvent("net-status"));
      });
      return api;
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }

  // ---------- Verschlüsselung ----------
  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const EC = { name: "ECDH", namedCurve: "P-256" };

  async function genKeys() {
    const k = await crypto.subtle.generateKey(EC, true, ["deriveKey"]);
    return {
      pub: await crypto.subtle.exportKey("jwk", k.publicKey),
      priv: await crypto.subtle.exportKey("jwk", k.privateKey)
    };
  }

  const keyCache = new Map();
  async function shared(privJwk, pubJwk) {
    const id = privJwk.d + "|" + pubJwk.x + pubJwk.y;
    if (!keyCache.has(id)) {
      keyCache.set(id, (async () => {
        const priv = await crypto.subtle.importKey("jwk", privJwk, EC, false, ["deriveKey"]);
        const pub = await crypto.subtle.importKey("jwk", { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y }, EC, false, []);
        return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      })());
    }
    return keyCache.get(id);
  }

  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }
  async function open(key, box) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // Raum-Code: 5 gut lesbare Zeichen
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function newCode() {
    const a = new Uint32Array(5);
    crypto.getRandomValues(a);
    return Array.from(a, n => CODE_CHARS[n % CODE_CHARS.length]).join("");
  }

  return { configured, init, genKeys, shared, seal, open, newCode, connected: false };
})();
