// src/pdf.js — Erzeugt einen sauberen Regiebericht als PDF (pdfkit).
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const GREEN = "#3f7a2a";
const GREY = "#6e6e6e";

function create(tenant, d) {
  return new Promise((resolve, reject) => {
    const OUTDIR = path.join(tenant.dir, "out"); fs.mkdirSync(OUTDIR,{recursive:true});
    const file = path.join(OUTDIR, d.nr.replace(/[^\w-]/g, "_") + "_Regiebericht.pdf");
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    // Logo (optional) + Titel
    const logo = path.join(tenant.dir, "logo.jpg");
    if (fs.existsSync(logo)) { try { doc.image(logo, 48, 40, { height: 34 }); } catch (e) {} }
    doc.font("Helvetica-Bold").fontSize(18).fillColor(GREEN).text("Regiebericht", 48, 84);
    doc.font("Helvetica").fontSize(9).fillColor(GREY)
      .text(`${tenant.firma}   ·   Bericht-Nr. ${d.nr}   ·   ${d.datum || ""}`);
    doc.moveTo(48, 112).lineTo(547, 112).lineWidth(2).strokeColor(GREEN).stroke();
    doc.moveDown(1.5);

    const H = (t) => doc.moveDown(0.6).font("Helvetica-Bold").fontSize(9).fillColor(GREEN).text(t.toUpperCase(), { characterSpacing: 0.5 }).moveDown(0.2).fillColor("#222");
    const kv = (k, v) => doc.font("Helvetica").fontSize(10).fillColor(GREY).text(k + ":  ", { continued: true }).fillColor("#222").text(v || "—");

    H("Auftrag");
    kv("Kommission", d.projektNr);
    kv("Bauvorhaben", d.bauvorhaben);
    kv("Auftraggeber", d.auftraggeber);
    kv("Ort", d.ort);

    H("Stundenlohnarbeiten (VOB)");
    if (d.monteure.length) {
      d.monteure.forEach(m => doc.font("Helvetica").fontSize(10).fillColor("#222")
        .text(`• ${m.name} (${m.lohngruppe || "-"}) — ${m.taetigkeit || ""}: ${String(m.stunden).replace(".", ",")} h`));
      const sum = d.monteure.reduce((s, m) => s + (Number(m.stunden) || 0), 0);
      doc.moveDown(0.2).font("Helvetica-Bold").text(`Summe: ${String(sum).replace(".", ",")} h`);
    } else doc.font("Helvetica-Oblique").fillColor(GREY).text("—");

    H("Material");
    if (d.material.length) {
      d.material.forEach(m => doc.font("Helvetica").fontSize(10).fillColor("#222")
        .text(`• ${String(m.menge).replace(".", ",")} ${m.einheit}  ·  [${m.artNr}]  ${m.bezeichnung}`));
      doc.moveDown(0.2).font("Helvetica-Oblique").fontSize(8).fillColor(GREY)
        .text("Preise werden in KWP aus dem hinterlegten Katalog (DATANORM/Eldanorm) ermittelt.");
    } else doc.font("Helvetica-Oblique").fillColor(GREY).text("—");

    H("Ausgeführte Arbeiten");
    doc.font("Helvetica").fontSize(10).fillColor("#222").text(d.arbeiten || "—", { width: 499 });

    H("Sonstiges");
    const f = d.fahrt || {};
    const fp = [];
    if (f.pauschale) fp.push("Pauschale");
    if (f.km) fp.push(String(f.km).replace(".", ",") + " km");
    if (f.fahrzeitStd) fp.push("Fahrzeit " + String(f.fahrzeitStd).replace(".", ",") + " h");
    const KMT = { 1: "gering", 2: "mittel", 3: "hoch" };
    kv("An-/Abfahrt", fp.length ? fp.join(", ") : "—");
    kv("Kleinmaterial", d.kleinmaterial ? KMT[d.kleinmaterial] : "—");
    if (d.geo) kv("Standort", (d.geo.address || (d.geo.lat + ", " + d.geo.lng)));
    kv("Erfasst", d.zeitstempel ? new Date(d.zeitstempel).toLocaleString("de-DE") : "—");
    kv("Fotos / Belege", d.fotos.length ? String(d.fotos.length) : "—");

    // Unterschriftenblock
    doc.moveDown(3);
    const y = doc.y;
    doc.moveTo(48, y).lineTo(248, y).strokeColor("#999").lineWidth(0.7).stroke();
    doc.moveTo(320, y).lineTo(547, y).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(GREY)
      .text("Datum / Unterschrift Monteur", 48, y + 4)
      .text(`${d.unterschrift || ""}`, 320, y + 4)
      .text("Bestätigung Kunde / Bauleiter", 320, y + 16);

    doc.end();
    stream.on("finish", () => resolve(file));
    stream.on("error", reject);
  });
}

module.exports = { create };
