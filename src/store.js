// src/store.js — Sitzungsspeicher pro Telefonnummer.
// Nutzt Redis (REDIS_URL gesetzt) für stabilen Dauerbetrieb mit mehreren Instanzen,
// sonst In-Memory-Fallback (gut für Tests/Einzelinstanz).
const SESS_TTL = 60 * 60 * 24; // 24 h
let useRedis = false;
let client = null;
const mem = new Map();

function freshData() {
  const d = new Date();
  const nr = "RB-" + d.getFullYear() + "-" + String(Date.now()).slice(-5);
  return {
    nr, projektNr: "", bauvorhaben: "", auftraggeber: "", ort: "",
    datum: "", zeitstempel: "", geo: null,
    monteure: [], material: [], kleinmaterial: null,
    fahrt: { art: "", km: null, fahrzeitStd: null, pauschale: false },
    arbeiten: "", fotos: [], unterschrift: "",
  };
}
function newSession() { return { step: "START", mode: "", data: freshData(), temp: {}, transcript: "" }; }

async function init() {
  if (process.env.REDIS_URL) {
    const { createClient } = require("redis");
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (e) => console.error("Redis-Fehler:", e.message));
    await client.connect();
    useRedis = true;
    console.log("Sitzungen: Redis");
  } else {
    console.log("Sitzungen: In-Memory (für Dauerbetrieb REDIS_URL setzen)");
  }
}

async function get(from) {
  if (useRedis) {
    try { const raw = await client.get("sess:" + from); return raw ? JSON.parse(raw) : newSession(); }
    catch (e) { console.error("Redis get:", e.message); return newSession(); }
  }
  if (!mem.has(from)) mem.set(from, newSession());
  return mem.get(from);
}
async function save(from, s) {
  if (useRedis) {
    try { await client.set("sess:" + from, JSON.stringify(s), { EX: SESS_TTL }); }
    catch (e) { console.error("Redis save:", e.message); }
  } else { mem.set(from, s); }
}
// Setzt eine bestehende Sitzung in-place zurück (behält die Referenz).
function resetInto(s) { Object.assign(s, newSession()); return s; }

async function clear(from) {
  if (useRedis) { try { await client.del("sess:" + from); } catch (e) {} }
  else mem.delete(from);
}

module.exports = { init, get, save, resetInto, clear, freshData, newSession };
