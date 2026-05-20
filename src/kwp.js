// src/kwp.js — KWP-Importdatei je Firma (tenants/<id>/out). Keine Preise (KWP-Katalog).
const fs = require("fs");
const path = require("path");
const KLEINMAT_ART = { 1: "KLEINMAT-1", 2: "KLEINMAT-2", 3: "KLEINMAT-3" };
const KLEINMAT_TXT = { 1: "Kleinmaterialpauschale gering", 2: "Kleinmaterialpauschale mittel", 3: "Kleinmaterialpauschale hoch" };
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const dec = (v) => String(v).replace(".", ",");

function buildCsv(tenant, d) {
  const SEP = (tenant.kwp && tenant.kwp.sep) || ";";
  const LG = (tenant.kwp && tenant.kwp.lohngruppe) || {};
  const cell = (v) => { v = String(v == null ? "" : v); return new RegExp('["\n' + SEP + ']').test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const row = (c) => c.map(cell).join(SEP);
  const g = d.geo || {}, f = d.fahrt || {}, L = [];
  L.push(row(["SATZART", "Berichtsnr", "Kommission", "Bauvorhaben", "Auftraggeber", "Ort", "Datum", "Zeitstempel", "GeoLat", "GeoLng", "GeoAdresse", "BestaetigtVon"]));
  L.push(row(["KOPF", d.nr, d.projektNr, d.bauvorhaben, d.auftraggeber, d.ort, d.datum, d.zeitstempel || "", g.lat || "", g.lng || "", g.address || g.name || "", d.unterschrift]));
  L.push("");
  L.push(row(["SATZART", "Lohngruppe", "Monteur", "Taetigkeit", "Kategorie", "StundenGesamt", "StundenVerrechenbar", "Einheit", "Verrechnung"]));
  d.monteure.forEach(m => { const ges = num(m.stunden), ver = num(m.verrechenbar); const flag = ver <= 0 ? "NEIN" : (ver >= ges ? "JA" : "TEIL"); L.push(row(["LOHN", LG[m.lohngruppe] || "", m.name, m.taetigkeit || "", m.kategorie || "", dec(ges), dec(ver), "Std", flag])); });
  L.push("");
  L.push(row(["SATZART", "Artikelnummer", "Bezeichnung", "Menge", "Einheit", "Preisherkunft"]));
  d.material.forEach(m => L.push(row(["MATERIAL", m.artNr, m.bezeichnung, dec(m.menge), m.einheit, m.frei ? "FREI" : "KWP-Katalog"])));
  if (d.kleinmaterial && KLEINMAT_ART[d.kleinmaterial]) L.push(row(["MATERIAL", KLEINMAT_ART[d.kleinmaterial], KLEINMAT_TXT[d.kleinmaterial], "1", "Pauschal", "KWP-Katalog"]));
  L.push("");
  L.push(row(["SATZART", "Art", "km", "FahrzeitStd", "Pauschale"]));
  L.push(row(["FAHRT", f.art || "", f.km != null ? dec(f.km) : "", f.fahrzeitStd != null ? dec(f.fahrzeitStd) : "", f.pauschale ? "JA" : "NEIN"]));
  L.push("");
  L.push(row(["SATZART", "Text"]));
  L.push(row(["LEISTUNG", d.arbeiten || ""]));
  L.push(row(["FOTOS", String((d.fotos || []).length)]));
  return "\uFEFF" + L.join("\r\n");
}
function save(tenant, d) {
  const OUT = path.join(tenant.dir, "out"); fs.mkdirSync(OUT, { recursive: true });
  const base = d.nr.replace(/[^\w-]/g, "_");
  const csvPath = path.join(OUT, base + "_KWP-Import.csv"), jsonPath = path.join(OUT, base + ".json");
  fs.writeFileSync(csvPath, buildCsv(tenant, d), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify({ ...d, _ts: Date.now() }, null, 2), "utf8");
  const dir = tenant.kwp && tenant.kwp.importDir;
  if (dir) { try { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(csvPath, path.join(dir, path.basename(csvPath))); } catch (e) { console.error("importDir:", e.message); } }
  return { csvPath, jsonPath };
}
module.exports = { save, buildCsv };
