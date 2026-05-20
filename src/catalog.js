// src/catalog.js — Artikelstamm je Firma (tenants/<id>/artikel.csv). Keine Preise.
const fs = require("fs");
const path = require("path");
const cache = new Map(); // tenantId -> {list, byKey, byEan}
const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

function build(tenant) {
  const byKey = new Map(), byEan = new Map(); let list = [];
  try {
    const raw = fs.readFileSync(path.join(tenant.dir, "artikel.csv"), "utf8").split(/\r?\n/).filter(Boolean);
    raw.shift();
    list = raw.map(line => { const [artNr, bez, einh, ean] = line.split(";"); return { artNr: artNr?.trim(), bezeichnung: bez?.trim(), einheit: (einh || "Stk").trim(), ean: (ean || "").trim() }; }).filter(a => a.artNr);
    list.forEach(a => { byKey.set(norm(a.artNr), a); if (a.ean) byEan.set(norm(a.ean), a); });
  } catch (e) {}
  function lookup(query) {
    const q = String(query).trim(), k = norm(q);
    if (byKey.has(k)) return { ...byKey.get(k), found: true };
    if (byEan.has(k)) return { ...byEan.get(k), found: true };
    let hit = list.find(a => a.bezeichnung.toLowerCase().includes(q.toLowerCase()));
    if (hit) return { ...hit, found: true };
    const qt = q.toLowerCase().split(/[^a-z0-9,.]+/).filter(t => t.length >= 2);
    if (qt.length) {
      let best = null, bestScore = 0;
      for (const a of list) {
        const bt = a.bezeichnung.toLowerCase().split(/[^a-z0-9,.]+/).filter(w => w.length >= 2);
        const score = qt.filter(t => bt.some(w => w.includes(t) || t.includes(w))).length / qt.length;
        if (score > bestScore) { bestScore = score; best = a; }
      }
      if (best && bestScore >= 0.6) return { ...best, found: true };
    }
    return { artNr: "FREI", bezeichnung: q, einheit: "Stk", found: false };
  }
  return { list, lookup, count: list.length };
}

function get(tenant) { if (!cache.has(tenant.id)) cache.set(tenant.id, build(tenant)); return cache.get(tenant.id); }
function invalidate(tenantId) { cache.delete(tenantId); }
module.exports = { get, invalidate };
