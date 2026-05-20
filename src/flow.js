// src/flow.js — Gesprächsführung, mandantenfähig (pro Firma via ctx).
const fs = require("fs");
const path = require("path");
const ctx = require("./ctx");
const whatsapp = require("./telegram");
const catalog = require("./catalog");
const store = require("./store");
const registry = require("./registry");
const kwp = require("./kwp");
const pdf = require("./pdf");
const ai = require("./ai");
const plaus = require("./plausibility");

const W = () => ctx.wa();         // WhatsApp-Client der aktuellen Firma
const C = () => ctx.cat();        // Artikelkatalog der aktuellen Firma
const T = () => ctx.tenant();     // aktuelle Firma

const LOHNGRUPPEN = ["Meister", "Geselle", "Azubi", "Helfer"];
const KLEINMAT = { 0: "keine", 1: "gering", 2: "mittel", 3: "hoch" };
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const heute = () => new Date().toLocaleDateString("de-DE");
const hh = (n) => String(n).replace(".", ",");
const kmText = (k) => (k == null ? "—" : (KLEINMAT[k] || "—"));
function fahrtText(f) { if (!f) return "—"; const p = []; if (f.pauschale) p.push("Pauschale"); if (f.km) p.push(hh(f.km) + " km"); if (f.fahrzeitStd) p.push("Fahrzeit " + hh(f.fahrzeitStd) + " h"); return p.length ? p.join(", ") : "—"; }
const catsFor = (t) => Object.values(plaus.loadRichtwerte(t)).map(r => r.kategorie);
function loadProjekte(t) {
  try { const lines = fs.readFileSync(path.join(t.dir, "projekte.csv"), "utf8").split(/\r?\n/).filter(Boolean); lines.shift();
    return lines.map(l => { const [nr, bv, ag, o] = l.split(";"); return { nr: (nr || "").trim(), bv: (bv || "").trim(), ag: (ag || "").trim(), o: (o || "").trim() }; }).filter(p => p.nr); }
  catch (e) { return []; }
}

/* =================== START / MODUSWAHL =================== */
async function askStart(to, s) {
  s.step = "MENU";
  await W().sendButtons(to, `Hallo! 👋 Regiebericht-Assistent von ${T().firma}. Wie möchtest du erfassen?`,
    [{ id: "mode_voice", title: "🎤 Reinsprechen" }, { id: "mode_guided", title: "⌨️ Schritt für Schritt" }]);
}
async function startVoice(to, s) {
  s.mode = "voice"; s.step = "VOICE"; s.transcript = "";
  await W().sendText(to, "🎤 Sprich einfach alles in einer (oder mehreren) Sprachnachricht(en) ein:\n• Baustelle / Kommission\n• wer war da + Stunden\n• Material\n• was gemacht wurde\n\nTipp: Teile auch kurz deinen 📍 Standort (📎 → Standort). Ich melde mich, wenn etwas fehlt.");
}

/* =================== GEFÜHRT =================== */
async function askLocation(to, s) { s.step = "LOC"; await W().sendButtons(to, "Standort fürs Geo-Stempel teilen? (📎 → Standort) – oder überspringen.", [{ id: "loc_skip", title: "Überspringen" }]); }
async function askProjekt(to, s) {
  s.step = "PROJEKT";
  const rows = loadProjekte(T()).map((p, i) => ({ id: "proj_" + i, title: p.nr + " " + p.bv, description: p.ag }));
  rows.push({ id: "proj_andere", title: "Andere eingeben", description: "Kommission manuell" });
  await W().sendList(to, "Für welche Baustelle / Kommission?", "Projekt wählen", rows, "Projekte");
}
async function askDatum(to, s) { s.step = "DATUM"; await W().sendButtons(to, "Datum der Leistung?", [{ id: "datum_heute", title: "📅 Heute" }, { id: "datum_other", title: "Anderes Datum" }]); }
async function askMonteurName(to, s) { s.step = "MON_NAME"; await W().sendText(to, "Stundenlohn (VOB). Wie heißt der Monteur?"); }
async function askLohn(to, s) { s.step = "MON_LOHN"; await W().sendList(to, `Lohngruppe von ${s.temp.m.name}?`, "Lohngruppe", LOHNGRUPPEN.map(l => ({ id: "lg_" + l, title: l })), "Lohngruppen"); }
async function askTaet(to, s) { s.step = "MON_TAET"; const cats = catsFor(T()); await W().sendList(to, "Welche Tätigkeit?", "Tätigkeit", cats.map((c, i) => ({ id: "kat_" + i, title: c })), "Kategorien"); }
async function askStd(to, s) { s.step = "MON_STD"; await W().sendButtons(to, "Wie viele Stunden?", [{ id: "std_4", title: "4 Std" }, { id: "std_8", title: "8 Std" }, { id: "std_x", title: "Andere…" }]); }
async function askVerrechenbar(to, s) { s.step = "MON_BILL"; await W().sendButtons(to, `${hh(s.temp.m.stunden)} h. Davon an Kunden verrechenbar?`, [{ id: "bill_full", title: "Voll" }, { id: "bill_part", title: "Teilweise" }, { id: "bill_none", title: "Intern (0)" }]); }
async function askMonMore(to, s) { s.step = "MON_MORE"; await W().sendButtons(to, "Weiterer Monteur?", [{ id: "mon_add", title: "➕ Monteur" }, { id: "mon_next", title: "Weiter ➡️" }]); }
async function askMaterial(to, s) { s.step = "MAT_INPUT"; await W().sendButtons(to, "Material: Artikelnummer / Suchbegriff senden (📷 Barcode-Foto geht auch).", [{ id: "mat_done", title: "Kein Material" }]); }
async function askMatUnit(to, s) { s.step = "MAT_UNIT"; await W().sendButtons(to, `„${s.temp.art.bezeichnung}“ nicht im Katalog – freie Position. Einheit?`, [{ id: "u_Stk", title: "Stk" }, { id: "u_m", title: "m" }, { id: "u_Pauschal", title: "Pauschal" }]); }
async function askMenge(to, s) { s.step = "MAT_MENGE"; await W().sendText(to, `Menge (${s.temp.art.einheit})?`); }
async function askMatMore(to, s) { s.step = "MAT_MORE"; await W().sendButtons(to, "Weiteres Material?", [{ id: "mat_add", title: "➕ Artikel" }, { id: "mat_next", title: "Weiter ➡️" }]); }
async function askArbeiten(to, s) { s.step = "ARB"; await W().sendText(to, "Kurz: ausgeführte Arbeiten?"); }
async function askFahrt(to, s) { s.step = "FAHRT"; await W().sendList(to, "An- & Abfahrt?", "Auswahl", [{ id: "f_paus", title: "Pauschale" }, { id: "f_km", title: "km eingeben" }, { id: "f_zeit", title: "Fahrzeit (h)" }, { id: "f_none", title: "Keine" }], "Fahrt"); }
async function askKleinmat(to, s) { s.step = "KLEINMAT"; await W().sendButtons(to, "Kleinmaterialpauschale?", [{ id: "km_1", title: "Gering" }, { id: "km_2", title: "Mittel" }, { id: "km_3", title: "Viel" }]); }
async function askFoto(to, s) { s.step = "FOTO"; await W().sendButtons(to, "Fotos zur Doku? Anhängen, dann „Fertig“.", [{ id: "foto_done", title: "✅ Fertig" }]); }
async function askSign(to, s) { s.step = "SIGN"; await W().sendText(to, "Name Kunde / Bauleiter für die Bestätigung?"); }

/* =================== VOICE =================== */
function currentView(d) {
  return { projektNr: d.projektNr || null, bauvorhaben: d.bauvorhaben || null, datum: d.datum || null,
    monteure: d.monteure.map(m => ({ name: m.name, lohngruppe: m.lohngruppe || null, taetigkeit: m.taetigkeit, kategorie: m.kategorie, stunden: m.stunden, verrechenbar: m.verrechenbar })),
    material: d.material.map(m => ({ bezeichnung: m.bezeichnung, menge: m.menge, einheit: m.einheit })),
    kleinmaterial: d.kleinmaterial, fahrt: d.fahrt, arbeiten: d.arbeiten || null };
}
function applyExtraction(s, ext) {
  const d = s.data;
  if (ext.projektNr) d.projektNr = ext.projektNr;
  if (ext.bauvorhaben) d.bauvorhaben = ext.bauvorhaben;
  if (ext.datum) d.datum = ext.datum;
  if (ext.arbeiten) d.arbeiten = ext.arbeiten;
  if (typeof ext.kleinmaterial === "number") d.kleinmaterial = ext.kleinmaterial;
  if (ext.fahrt) d.fahrt = { art: ext.fahrt.pauschale ? "pauschale" : (ext.fahrt.km ? "km" : (ext.fahrt.fahrzeitStd ? "zeit" : "")), km: ext.fahrt.km ?? null, fahrzeitStd: ext.fahrt.fahrzeitStd ?? null, pauschale: !!ext.fahrt.pauschale };
  if (Array.isArray(ext.monteure) && ext.monteure.length) {
    d.monteure = ext.monteure.filter(m => m && m.name).map(m => { const stunden = m.stunden == null ? null : num(m.stunden); let verr = m.verrechenbar; verr = verr == null ? stunden : num(verr); return { name: m.name, lohngruppe: m.lohngruppe || "", taetigkeit: m.taetigkeit || "", kategorie: m.kategorie || "Sonstiges", stunden, verrechenbar: verr }; });
  }
  if (Array.isArray(ext.material)) {
    d.material = ext.material.filter(m => m && m.bezeichnung).map(m => { const r = C().lookup(m.bezeichnung); return { artNr: r.artNr, bezeichnung: r.found ? r.bezeichnung : m.bezeichnung, einheit: m.einheit || r.einheit || "Stk", menge: num(m.menge) || 1, frei: !r.found }; });
  }
}
function hardMissing(d) { const m = []; if (!d.projektNr) m.push("Baustelle/Kommission"); if (!d.monteure.some(x => num(x.stunden) > 0)) m.push("Stunden"); if (!d.arbeiten) m.push("Arbeitsbeschreibung"); return m; }
function buildSummary(d) {
  const stunden = d.monteure.reduce((a, m) => a + num(m.stunden), 0), verr = d.monteure.reduce((a, m) => a + num(m.verrechenbar), 0);
  return [`📋 *Regiebericht ${d.nr}*`, `Baustelle: ${d.projektNr || "—"}${d.bauvorhaben ? " · " + d.bauvorhaben : ""}`,
    `Datum: ${d.datum || heute()}${d.geo ? "  📍 " + (d.geo.address || (d.geo.lat + "," + d.geo.lng)) : ""}`,
    `Monteure: ${d.monteure.map(m => `${m.name} ${hh(m.stunden)}h`).join(", ") || "—"}`,
    `Stunden: ${hh(stunden)} h (verrechenbar ${hh(verr)} h)`,
    `Material: ${d.material.map(m => `${hh(m.menge)} ${m.einheit} ${m.bezeichnung}`).join("; ") || "—"}`,
    `Kleinmaterial: ${kmText(d.kleinmaterial)} · Fahrt: ${fahrtText(d.fahrt)}`, `Arbeiten: ${d.arbeiten || "—"}`].join("\n");
}
async function processVoice(to, s) {
  let ext;
  try { ext = await ai.extractReport(s.transcript, currentView(s.data), { key: T().openaiKey, cats: catsFor(T()) }); }
  catch (e) { console.error("Extraktion:", e.message); await W().sendText(to, "Hmm, das konnte ich nicht auswerten. Sag es bitte nochmal – oder tippe *neu* und wähle „Schritt für Schritt“."); return; }
  applyExtraction(s, ext);
  const miss = hardMissing(s.data);
  if (miss.length) { await W().sendText(to, "Verstanden ✅\nMir fehlt noch: *" + miss.join(", ") + "*.\nSag's einfach per Sprachnachricht oder tippe es."); return; }
  s.step = "VOICE_CONFIRM";
  let msg = buildSummary(s.data);
  const notes = plaus.assess(T(), s.data);
  if (notes.length) msg += "\n\n*Plausibilität:*\n" + notes.join("\n");
  await W().sendText(to, msg);
  await W().sendButtons(to, "Passt das so?", [{ id: "vc_ok", title: "✅ Passt" }, { id: "vc_edit", title: "🎤 Ändern" }]);
}

/* =================== ABSCHLUSS =================== */
function validate(d) {
  const stundenGesamt = d.monteure.reduce((a, m) => a + num(m.stunden), 0); const blockers = [], warnings = [];
  if (stundenGesamt <= 0) blockers.push("zeiten");
  if (!d.projektNr) blockers.push("projekt");
  if (!d.arbeiten) warnings.push("Keine Arbeitsbeschreibung.");
  if (d.fotos.length === 0) warnings.push("Keine Fotos angehängt.");
  if (!d.unterschrift) warnings.push("Keine Kundenbestätigung erfasst.");
  if (!d.geo) warnings.push("Kein Standort geteilt (Geo-Stempel fehlt).");
  return { stundenGesamt, blockers, warnings };
}
async function finalize(to, s) {
  const d = s.data; if (!d.datum) d.datum = heute();
  const who = registry.get(T(), to); d.erfasstVon = to; d.erfasstVonName = (who && who.name) || "";
  const v = validate(d);
  if (v.blockers.includes("zeiten")) { await W().sendText(to, "⏱️ Es sind noch *keine Stunden* erfasst. Ohne gebuchte Zeiten gibt's keine Vergütung 🙂 – kurz nachholen."); if (s.mode === "voice") { s.step = "VOICE"; return; } return askMonteurName(to, s); }
  const stundenVerr = d.monteure.reduce((a, m) => a + num(m.verrechenbar), 0), stundenIntern = v.stundenGesamt - stundenVerr;
  const { csvPath } = kwp.save(T(), d);
  let pdfPath = ""; try { pdfPath = await pdf.create(T(), d); } catch (e) { console.error("PDF:", e.message); }
  let msg = `✅ Regiebericht ${d.nr} erstellt!\n\n• Kommission: ${d.projektNr}\n• Stunden: ${hh(v.stundenGesamt)} h (verrechenbar ${hh(stundenVerr)} h, intern ${hh(stundenIntern)} h)\n• Material: ${d.material.length} Pos. · Kleinmaterial: ${kmText(d.kleinmaterial)}\n• Fahrt: ${fahrtText(d.fahrt)} · Fotos: ${d.fotos.length}\n\nImportdatei für KWP abgelegt – Preise ergänzt KWP automatisch.`;
  if (v.warnings.length) msg += `\n\nℹ️ Hinweise:\n• ${v.warnings.join("\n• ")}`;
  await W().sendText(to, msg);
  console.log(`[${T().id}] Erzeugt:`, csvPath, pdfPath || "(kein PDF)");
  s.step = "MENU"; s.mode = "";
  await W().sendButtons(to, "Fertig. Noch einen Bericht?", [{ id: "mode_voice", title: "🎤 Reinsprechen" }, { id: "mode_guided", title: "⌨️ Geführt" }]);
}

/* =================== CORE =================== */
async function handleCore(from, input, meta, s) {
  if (meta && meta.ts && !s.data.zeitstempel) { s.data.zeitstempel = new Date(Number(meta.ts) * 1000).toISOString(); if (!s.data.datum) s.data.datum = new Date(Number(meta.ts) * 1000).toLocaleDateString("de-DE"); }

  // Selbst-Registrierung (je Firma)
  const AUTO = (process.env.AUTO_APPROVE || "true").toLowerCase() !== "false";
  const reg = registry.get(T(), from);
  if (!reg) { registry.upsert(T(), from, { status: "registering" }); s.step = "REGISTER"; await W().sendText(from, `👋 Willkommen bei ${T().firma}!\nWie heißt du? (Vor- und Nachname)`); return; }
  if (reg.status === "registering") {
    if (input.type === "text" && input.text.trim().length >= 2) { const status = AUTO ? "active" : "pending"; registry.upsert(T(), from, { name: input.text.trim(), status }); if (status === "active") { await W().sendText(from, `Super, ${input.text.trim()} – du bist startklar! 🎉`); return askStart(from, s); } await W().sendText(from, `Danke, ${input.text.trim()}! Das Büro schaltet dich gleich frei.`); return; }
    await W().sendText(from, "Bitte schreib mir kurz deinen Namen (Vor- und Nachname)."); return;
  }
  if (reg.status === "pending") { await W().sendText(from, "⏳ Dein Zugang wird gerade vom Büro freigeschaltet."); return; }
  if (reg.status === "blocked") { await W().sendText(from, "🔒 Dein Zugang ist gesperrt. Bitte beim Büro melden."); return; }

  if (input.type === "location") { s.data.geo = { lat: input.lat, lng: input.lng, name: input.name || "", address: input.address || "" }; await W().sendText(from, "📍 Standort gespeichert."); return; }
  if (input.type === "text" && /^(neu|start|reset|menü|menu)$/i.test(input.text.trim())) { store.resetInto(s); return askStart(from, s); }
  const reply = input.type === "reply" ? input.replyId : null;
  if (reply === "mode_voice") { store.resetInto(s); return startVoice(from, s); }
  if (reply === "mode_guided") { store.resetInto(s); return askLocation(from, s); }

  if (s.mode === "voice") {
    if (input.type === "audio") {
      try { const { buffer, mime } = await W().downloadMedia(input.mediaId); const text = await ai.transcribe(buffer, mime, T().openaiKey); s.transcript += (s.transcript ? "\n" : "") + text; await W().sendText(from, "🗣️ „" + text + "“"); }
      catch (e) { console.error("STT:", e.message); await W().sendText(from, ai.configured(T().openaiKey) ? "Sprachnachricht konnte nicht verarbeitet werden." : "Spracherkennung ist nicht konfiguriert. Tippe *neu* und wähle „Schritt für Schritt“."); return; }
      if (s.step === "VOICE_CONFIRM") s.step = "VOICE";
      return processVoice(from, s);
    }
    if (s.step === "VOICE_CONFIRM") { if (reply === "vc_ok") return finalize(from, s); if (reply === "vc_edit") { s.step = "VOICE"; return W().sendText(from, "Okay – sprich die Korrektur ein 🎤."); } }
    if (input.type === "image") return saveFoto(from, s, input);
    if (input.type === "text") { s.transcript += (s.transcript ? "\n" : "") + input.text; return processVoice(from, s); }
    return;
  }

  switch (s.step) {
    case "START": case "MENU": return askStart(from, s);
    case "LOC": return askProjekt(from, s);
    case "PROJEKT":
      if (reply && reply.startsWith("proj_")) {
        if (reply === "proj_andere") { s.step = "PROJEKT_NR"; return W().sendText(from, "Kommissions-/Projektnr?"); }
        const p = loadProjekte(T())[+reply.split("_")[1]];
        if (p) { Object.assign(s.data, { projektNr: p.nr, bauvorhaben: p.bv, auftraggeber: p.ag, ort: p.o }); return askDatum(from, s); }
      }
      return askProjekt(from, s);
    case "PROJEKT_NR": s.data.projektNr = input.text; s.step = "PROJEKT_BV"; return W().sendText(from, "Bauvorhaben / Adresse?");
    case "PROJEKT_BV": s.data.bauvorhaben = input.text; return askDatum(from, s);
    case "DATUM":
      if (reply === "datum_heute") { s.data.datum = heute(); return askMonteurName(from, s); }
      if (reply === "datum_other") { s.step = "DATUM_INPUT"; return W().sendText(from, "Datum (TT.MM.JJJJ)?"); }
      return askDatum(from, s);
    case "DATUM_INPUT": s.data.datum = input.text; return askMonteurName(from, s);
    case "MON_NAME": s.temp.m = { name: input.text }; return askLohn(from, s);
    case "MON_LOHN": if (reply && reply.startsWith("lg_")) { s.temp.m.lohngruppe = reply.slice(3); return askTaet(from, s); } return askLohn(from, s);
    case "MON_TAET":
      if (reply && reply.startsWith("kat_")) { const cats = catsFor(T()); s.temp.m.kategorie = cats[+reply.split("_")[1]] || "Sonstiges"; s.temp.m.taetigkeit = s.temp.m.kategorie; return askStd(from, s); }
      s.temp.m.taetigkeit = input.text; s.temp.m.kategorie = "Sonstiges"; return askStd(from, s);
    case "MON_STD": {
      let h = null; if (reply === "std_4") h = 4; else if (reply === "std_8") h = 8; else if (reply === "std_x") { s.step = "MON_STD_X"; return W().sendText(from, "Stunden (z. B. 5,5)?"); } else h = num(input.text);
      if (!h || h <= 0) { await W().sendText(from, "⏱️ Bitte Stundenzahl > 0 – sonst keine Vergütung 🙂"); return askStd(from, s); }
      s.temp.m.stunden = h; return askVerrechenbar(from, s);
    }
    case "MON_STD_X": { const h = num(input.text); if (!h || h <= 0) { await W().sendText(from, "⏱️ Bitte Stundenzahl > 0."); return; } s.temp.m.stunden = h; return askVerrechenbar(from, s); }
    case "MON_BILL":
      if (reply === "bill_full") s.temp.m.verrechenbar = s.temp.m.stunden;
      else if (reply === "bill_none") s.temp.m.verrechenbar = 0;
      else if (reply === "bill_part") { s.step = "MON_BILL_X"; return W().sendText(from, `Wie viele der ${hh(s.temp.m.stunden)} h verrechenbar?`); }
      else return askVerrechenbar(from, s);
      { const note = plaus.assess(T(), { nr: s.data.nr, monteure: [s.temp.m] }); if (note.length) await W().sendText(from, note[0]); }
      s.data.monteure.push(s.temp.m); s.temp.m = null; return askMonMore(from, s);
    case "MON_BILL_X": { const b = Math.min(num(input.text), s.temp.m.stunden); s.temp.m.verrechenbar = b < 0 ? 0 : b; const note = plaus.assess(T(), { nr: s.data.nr, monteure: [s.temp.m] }); if (note.length) await W().sendText(from, note[0]); s.data.monteure.push(s.temp.m); s.temp.m = null; return askMonMore(from, s); }
    case "MON_MORE": if (reply === "mon_add") return askMonteurName(from, s); if (reply === "mon_next") return askMaterial(from, s); return askMonMore(from, s);
    case "MAT_INPUT": {
      if (reply === "mat_done") return askArbeiten(from, s);
      if (input.type === "image") return saveFoto(from, s, input);
      const art = C().lookup(input.text); s.temp.art = art;
      if (art.found) { await W().sendText(from, `Gefunden: ${art.bezeichnung}\nArt.-Nr. ${art.artNr} · ${art.einheit}`); return askMenge(from, s); }
      s.temp.art.frei = true; return askMatUnit(from, s);
    }
    case "MAT_UNIT": if (reply && reply.startsWith("u_")) { s.temp.art.einheit = reply.slice(2); return askMenge(from, s); } return askMatUnit(from, s);
    case "MAT_MENGE": { const menge = num(input.text) || 1, a = s.temp.art; s.data.material.push({ artNr: a.artNr, bezeichnung: a.bezeichnung, einheit: a.einheit, menge, frei: !!a.frei }); s.temp.art = null; return askMatMore(from, s); }
    case "MAT_MORE": if (reply === "mat_add") return askMaterial(from, s); if (reply === "mat_next") return askArbeiten(from, s); return askMatMore(from, s);
    case "ARB": s.data.arbeiten = input.text; return askFahrt(from, s);
    case "FAHRT":
      if (reply === "f_paus") { s.data.fahrt = { art: "pauschale", km: null, fahrzeitStd: null, pauschale: true }; return askKleinmat(from, s); }
      if (reply === "f_km") { s.step = "FAHRT_KM"; return W().sendText(from, "Gefahrene km?"); }
      if (reply === "f_zeit") { s.step = "FAHRT_ZEIT"; return W().sendText(from, "Fahrzeit in Stunden?"); }
      if (reply === "f_none") { s.data.fahrt = { art: "keine", km: null, fahrzeitStd: null, pauschale: false }; return askKleinmat(from, s); }
      return askFahrt(from, s);
    case "FAHRT_KM": s.data.fahrt = { art: "km", km: num(input.text), fahrzeitStd: null, pauschale: false }; return askKleinmat(from, s);
    case "FAHRT_ZEIT": s.data.fahrt = { art: "zeit", km: null, fahrzeitStd: num(input.text), pauschale: false }; return askKleinmat(from, s);
    case "KLEINMAT": if (reply === "km_1") s.data.kleinmaterial = 1; else if (reply === "km_2") s.data.kleinmaterial = 2; else if (reply === "km_3") s.data.kleinmaterial = 3; else return askKleinmat(from, s); return askFoto(from, s);
    case "FOTO": if (input.type === "image") return saveFoto(from, s, input); if (reply === "foto_done") return askSign(from, s); return askFoto(from, s);
    case "SIGN": s.data.unterschrift = input.text; return finalize(from, s);
    default: return askStart(from, s);
  }
}

async function saveFoto(from, s, input) {
  try { const { buffer, mime } = await W().downloadMedia(input.mediaId); const ext = (mime && mime.split("/")[1]) || "jpg"; const dir = path.join(T().dir, "out"); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${s.data.nr}_foto${s.data.fotos.length + 1}.${ext}`); fs.writeFileSync(file, buffer); s.data.fotos.push(file); await W().sendText(from, `📷 Foto ${s.data.fotos.length} gespeichert.`); }
  catch (e) { console.error("Foto:", e.message); await W().sendText(from, "Foto konnte nicht gespeichert werden."); }
}

// Mandantenfähiger Einstieg: Firma -> ctx -> Sitzung laden/speichern.
async function handleIncoming(tenant, from, input, meta) {
  const wa = whatsapp.forTenant(tenant);
  const cat = catalog.get(tenant);
  return ctx.run({ tenant, wa, cat }, async () => {
    const key = tenant.id + ":" + from;
    const s = await store.get(key);
    try { await handleCore(from, input, meta, s); }
    finally { await store.save(key, s); }
  });
}

module.exports = { handleIncoming, validate };
