// src/plausibility.js — Stunden-Bewertung je Firma (Richtwerte + Kollegen-Schnitt).
const fs = require("fs");
const path = require("path");
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const h = (n) => (Math.round(n * 100) / 100).toLocaleString("de-DE");

function loadRichtwerte(t) {
  const map = {};
  try {
    const lines = fs.readFileSync(path.join(t.dir, "richtwerte.csv"), "utf8").split(/\r?\n/).filter(Boolean);
    lines.shift();
    for (const ln of lines) { const [k, mn, ty, mx] = ln.split(";"); if (k) map[k.trim().toLowerCase()] = { kategorie: k.trim(), min: num(mn), typ: num(ty), max: num(mx) }; }
  } catch (e) {}
  return map;
}
function loadHistory(t, exceptNr) {
  const hist = {}; const OUT = path.join(t.dir, "out"); let files = [];
  try { files = fs.readdirSync(OUT).filter(f => f.endsWith(".json")); } catch (e) {}
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch (e) { continue; }
    if (!d.monteure || d.nr === exceptNr) continue;
    for (const m of d.monteure) { const k = (m.kategorie || "Sonstiges").toLowerCase(); const s = num(m.stunden); if (!s) continue; hist[k] = hist[k] || { sum: 0, count: 0 }; hist[k].sum += s; hist[k].count++; }
  }
  return hist;
}
function assess(t, data) {
  const rw = loadRichtwerte(t), hist = loadHistory(t, data.nr), notes = [];
  for (const m of (data.monteure || [])) {
    const std = num(m.stunden); if (!std) continue;
    const key = (m.kategorie || "Sonstiges").toLowerCase(), r = rw[key], ph = hist[key];
    const peerAvg = ph && ph.count >= 1 ? ph.sum / ph.count : null;
    let status = "unbekannt", parts = [];
    if (r) {
      if (std > r.max) { status = "hoch"; parts.push(`über Richtwert (${h(r.min)}–${h(r.max)} h)`); }
      else if (std < r.min) { status = "niedrig"; parts.push(`unter Richtwert (${h(r.min)}–${h(r.max)} h)`); }
      else { status = "ok"; parts.push(`im Richtwert (${h(r.min)}–${h(r.max)} h)`); }
    }
    if (peerAvg != null && ph.count >= 2) { parts.push(`Kollegen-Schnitt ${h(peerAvg)} h (n=${ph.count})`); if (peerAvg > 0 && std > peerAvg * 1.5 && status !== "hoch") status = "hoch"; }
    if (parts.length) { const icon = status === "hoch" ? "⚠️" : status === "niedrig" ? "ℹ️" : "✅"; notes.push(`${icon} ${m.name} · ${m.kategorie || "Sonstiges"}: ${h(std)} h — ${parts.join(", ")}`); }
  }
  return notes;
}
module.exports = { assess, loadRichtwerte, loadHistory };
