// src/tenants.js — Firmen-Verwaltung (Mandanten) für den SaaS-Betrieb.
// Eine Datei data/tenants.json hält alle Firmen; je Firma ein Datenordner tenants/<id>/.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "data", "tenants.json");
const TPL = path.join(ROOT, "templates");

function loadAll() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { return {}; } }
function saveAll(o) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(o, null, 2)); }

function dirOf(id) { return path.join(ROOT, "tenants", id); }

// Standard-Config einer Firma; cfg aus tenants.json wird darübergelegt.
function defaults(id) {
  return {
    id, firma: id, botToken: "", botUsername: "", phoneNumberId: "", waToken: "", openaiKey: "",
    kwp: { sep: ";", importDir: "", lohngruppe: { Meister: "1", Geselle: "2", Azubi: "4", Helfer: "5" } },
    admin: { user: "buero", pass: "bitte-aendern" },
    subscription: { status: "trialing", plan: "profi", trialEnds: null, stripeCustomerId: "", stripeSubId: "" },
    createdAt: new Date().toISOString(),
  };
}

function hydrate(id, cfg) {
  const t = { ...defaults(id), ...cfg, id };
  t.dir = dirOf(id);
  return t;
}

function get(id) { const all = loadAll(); return all[id] ? hydrate(id, all[id]) : null; }
function list() { const all = loadAll(); return Object.keys(all).map(id => hydrate(id, all[id])); }
function getByPhoneNumberId(pnid) {
  const all = loadAll();
  const id = Object.keys(all).find(k => all[k].phoneNumberId === pnid);
  return id ? hydrate(id, all[id]) : null;
}
function getByAdmin(user, pass) {
  return list().find(t => t.admin.user === user && t.admin.pass === pass) || null;
}

function ensureDir(id) {
  const dir = dirOf(id);
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  for (const f of ["artikel.csv", "soll.csv", "richtwerte.csv", "projekte.csv", "logo.jpg"]) {
    const dest = path.join(dir, f);
    if (!fs.existsSync(dest) && fs.existsSync(path.join(TPL, f))) fs.copyFileSync(path.join(TPL, f), dest);
  }
  if (!fs.existsSync(path.join(dir, "monteure.json"))) fs.writeFileSync(path.join(dir, "monteure.json"), "{}");
}

function upsert(id, cfg) {
  const all = loadAll();
  all[id] = { ...defaults(id), ...(all[id] || {}), ...cfg };
  saveAll(all);
  ensureDir(id);
  return hydrate(id, all[id]);
}
function setSubscription(id, sub) {
  const all = loadAll();
  if (!all[id]) return null;
  all[id].subscription = { ...all[id].subscription, ...sub };
  saveAll(all);
  return hydrate(id, all[id]);
}

// Abo aktiv? (zahlend ODER in der Testphase)
function isActive(t) {
  if (!t || !t.subscription) return false;
  const s = t.subscription.status;
  if (s === "active" || s === "trialing") {
    if (s === "trialing" && t.subscription.trialEnds && Date.now() > Date.parse(t.subscription.trialEnds)) return false;
    return true;
  }
  return false;
}

module.exports = { get, list, getByPhoneNumberId, getByAdmin, upsert, setSubscription, isActive, ensureDir, dirOf };
