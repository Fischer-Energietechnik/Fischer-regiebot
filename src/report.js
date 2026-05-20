// src/report.js — Soll-Ist Auswertung je Firma (tenants/<id>).
const fs = require("fs");
const path = require("path");
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const h1 = (n) => (Math.round(n * 100) / 100).toLocaleString("de-DE");

function loadSoll(t) {
  const projekt = {}, projMonteur = {};
  try {
    const lines = fs.readFileSync(path.join(t.dir, "soll.csv"), "utf8").split(/\r?\n/).filter(Boolean); lines.shift();
    for (const ln of lines) { const [p, m, s] = ln.split(";"); if (!p) continue; if (!m || m.trim() === "*") projekt[p.trim()] = num(s); else (projMonteur[p.trim()] = projMonteur[p.trim()] || {})[m.trim()] = num(s); }
  } catch (e) {}
  return { projekt, projMonteur };
}
function aggregate(t) {
  const proj = {}, mont = {}; const OUT = path.join(t.dir, "out"); let files = [];
  try { files = fs.readdirSync(OUT).filter(f => f.endsWith(".json")); } catch (e) {}
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch (e) { continue; }
    if (!d.monteure) continue;
    const P = d.projektNr || "(ohne)";
    proj[P] = proj[P] || { gesamt: 0, verr: 0, intern: 0, berichte: 0, monteure: new Set() }; proj[P].berichte++;
    for (const m of d.monteure) { const g = num(m.stunden), v = num(m.verrechenbar), i = Math.max(0, g - v); proj[P].gesamt += g; proj[P].verr += v; proj[P].intern += i; proj[P].monteure.add(m.name); mont[m.name] = mont[m.name] || { gesamt: 0, verr: 0, intern: 0, projekte: new Set() }; mont[m.name].gesamt += g; mont[m.name].verr += v; mont[m.name].intern += i; mont[m.name].projekte.add(P); }
  }
  return { proj, mont, count: files.length };
}
function buildData(t) {
  const soll = loadSoll(t), agg = aggregate(t);
  const projektRows = Object.entries(agg.proj).map(([p, x]) => { const s = soll.projekt[p] || 0; return { projekt: p, soll: s, ist: x.gesamt, verr: x.verr, intern: x.intern, diff: x.gesamt - s, ausl: s ? (x.gesamt / s) * 100 : null, quote: x.gesamt ? (x.verr / x.gesamt) * 100 : 0, berichte: x.berichte }; }).sort((a, b) => a.projekt.localeCompare(b.projekt));
  const monteurRows = Object.entries(agg.mont).map(([m, x]) => ({ monteur: m, ist: x.gesamt, verr: x.verr, intern: x.intern, quote: x.gesamt ? (x.verr / x.gesamt) * 100 : 0, projekte: x.projekte.size })).sort((a, b) => b.ist - a.ist);
  return { projektRows, monteurRows, count: agg.count };
}
function buildCsv(t) {
  const { projektRows, monteurRows } = buildData(t); const SEP = (t.kwp && t.kwp.sep) || ";"; const n = (x) => String(x).replace(".", ","); const L = [];
  L.push(["PROJEKT", "Soll_h", "Ist_h", "Verrechenbar_h", "Intern_h", "Diff_h", "Auslastung_%", "Verrechenbar_%", "Berichte"].join(SEP));
  projektRows.forEach(r => L.push([r.projekt, n(r.soll), n(r.ist), n(r.verr), n(r.intern), n(r.diff), r.ausl == null ? "" : Math.round(r.ausl), Math.round(r.quote), r.berichte].join(SEP)));
  L.push(""); L.push(["MONTEUR", "Ist_h", "Verrechenbar_h", "Intern_h", "Verrechenbar_%", "Projekte"].join(SEP));
  monteurRows.forEach(r => L.push([r.monteur, n(r.ist), n(r.verr), n(r.intern), Math.round(r.quote), r.projekte].join(SEP)));
  return "\uFEFF" + L.join("\r\n");
}
function buildHtml(t) {
  const { projektRows, monteurRows, count } = buildData(t);
  const bar = (p, c) => `<span style="display:inline-block;height:8px;width:${Math.min(100, p || 0)}%;background:${c};border-radius:4px"></span>`;
  const pRows = projektRows.map(r => `<tr><td><b>${r.projekt}</b></td><td class=r>${h1(r.soll)}</td><td class=r>${h1(r.ist)}</td><td class=r style="color:#3f7a2a">${h1(r.verr)}</td><td class=r style="color:#888">${h1(r.intern)}</td><td class=r style="color:${r.diff > 0 ? "#c0392b" : "#3f7a2a"}">${r.diff > 0 ? "+" : ""}${h1(r.diff)}</td><td class=r>${r.ausl == null ? "–" : Math.round(r.ausl) + "%"} ${bar(r.ausl, r.ausl > 100 ? "#c0392b" : "#3f7a2a")}</td><td class=r>${Math.round(r.quote)}%</td><td class=r>${r.berichte}</td></tr>`).join("");
  const mRows = monteurRows.map(r => `<tr><td><b>${r.monteur}</b></td><td class=r>${h1(r.ist)}</td><td class=r style="color:#3f7a2a">${h1(r.verr)}</td><td class=r style="color:#888">${h1(r.intern)}</td><td class=r>${Math.round(r.quote)}% ${bar(r.quote, "#5fa23a")}</td><td class=r>${r.projekte}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang=de><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Soll-Ist · ${t.firma}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f3f4f1;color:#23262a}.wrap{max-width:1000px;margin:0 auto;padding:28px 18px 60px}h1{font-size:1.5rem;color:#3f7a2a;margin:0 0 2px}.sub{color:#888;font-size:.85rem;margin-bottom:22px}.card{background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(20,40,15,.08);padding:18px 20px;margin-bottom:20px;border:1px solid #e4e6e3}h2{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:#3f7a2a;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:.86rem}th{text-align:left;font-size:.66rem;text-transform:uppercase;color:#999;padding:6px 8px;border-bottom:1px solid #eee}td{padding:7px 8px;border-bottom:1px solid #f3f4f1}.r{text-align:right}.legend{font-size:.74rem;color:#888;margin-top:8px}</style></head><body><div class=wrap>
<h1>Soll-Ist Auswertung</h1><div class=sub>${t.firma} · ${count} Bericht(e) · Stand ${new Date().toLocaleString("de-DE")}</div>
<div class=card><h2>Je Projekt</h2><table><tr><th>Projekt</th><th class=r>Soll h</th><th class=r>Ist h</th><th class=r>verrechenb.</th><th class=r>intern</th><th class=r>Diff</th><th class=r>Auslastung</th><th class=r>Verr.-Quote</th><th class=r>Ber.</th></tr>${pRows || '<tr><td colspan=9 style="color:#aaa">Noch keine Berichte.</td></tr>'}</table></div>
<div class=card><h2>Je Monteur</h2><table><tr><th>Monteur</th><th class=r>Ist h</th><th class=r>verrechenb.</th><th class=r>intern</th><th class=r>Verrechenbar-Quote</th><th class=r>Projekte</th></tr>${mRows || '<tr><td colspan=6 style="color:#aaa">Noch keine Berichte.</td></tr>'}</table></div>
</div></body></html>`;
}
function saveFiles(t) { const OUT = path.join(t.dir, "out"); fs.mkdirSync(OUT, { recursive: true }); const html = path.join(OUT, "Soll-Ist-Report.html"), csv = path.join(OUT, "Soll-Ist-Report.csv"); fs.writeFileSync(html, buildHtml(t), "utf8"); fs.writeFileSync(csv, buildCsv(t), "utf8"); return { html, csv }; }
module.exports = { buildHtml, buildCsv, buildData, saveFiles };
