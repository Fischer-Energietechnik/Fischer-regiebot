// src/registry.js — Monteur-Register je Firma (tenants/<id>/monteure.json).
const fs = require("fs");
const path = require("path");
const fileOf = (t) => path.join(t.dir, "monteure.json");
function load(t) { try { return JSON.parse(fs.readFileSync(fileOf(t), "utf8")); } catch (e) { return {}; } }
function save(t, o) { fs.mkdirSync(t.dir, { recursive: true }); fs.writeFileSync(fileOf(t), JSON.stringify(o, null, 2)); }

function get(t, number) { return load(t)[number] || null; }
function list(t) { return Object.values(load(t)).sort((a, b) => (a.name || "").localeCompare(b.name || "")); }
function upsert(t, number, fields) {
  const o = load(t);
  o[number] = { number, status: "registering", ...(o[number] || {}), ...fields };
  if (!o[number].createdAt) o[number].createdAt = new Date().toISOString();
  o[number].updatedAt = new Date().toISOString();
  save(t, o); return o[number];
}
function setStatus(t, number, status) { return upsert(t, number, { status }); }
module.exports = { get, list, upsert, setStatus };
