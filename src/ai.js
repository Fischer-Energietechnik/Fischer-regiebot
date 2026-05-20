// src/ai.js — Sprachnachricht -> Text (Whisper) + Text -> Felder (LLM).
// API-Key: pro Firma (tenant.openaiKey) ODER global (OPENAI_API_KEY).
const STT_MODEL = process.env.OPENAI_STT_MODEL || "whisper-1";
const LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4o-mini";
const keyOf = (k) => k || process.env.OPENAI_API_KEY;
const configured = (k) => !!keyOf(k);

async function transcribe(buffer, mime, key) {
  const KEY = keyOf(key); if (!KEY) throw new Error("Kein OpenAI-Key");
  const form = new FormData();
  const type = mime || "audio/ogg";
  const ext = type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : type.includes("mp4") ? "m4a" : "ogg";
  form.append("file", new Blob([buffer], { type }), "audio." + ext);
  form.append("model", STT_MODEL); form.append("language", "de"); form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
  if (!res.ok) throw new Error("Whisper " + res.status + ": " + (await res.text().catch(() => "")));
  return (await res.text()).trim();
}

async function extractReport(transcript, current, opts = {}) {
  const KEY = keyOf(opts.key); if (!KEY) throw new Error("Kein OpenAI-Key");
  const cats = (opts.cats && opts.cats.length ? opts.cats : ["Sonstiges"]);
  const system = [
    "Du bist Erfassungs-Assistent für VOB-Regieberichte eines Elektrobetriebs.",
    "Extrahiere die Felder aus dem Transkript und gib NUR gültiges JSON zurück.",
    "- Erfinde KEINE Stunden/Mengen/Tätigkeiten. Nur was gesagt wurde. Unklar -> null + in 'missing'.",
    "- 'lohngruppe' nur aus {Meister, Geselle, Azubi, Helfer} oder null.",
    "- 'kategorie' je Tätigkeit aus dieser Liste (sonst 'Sonstiges'): " + cats.join(", ") + ".",
    "- 'verrechenbar' = abrechenbare Stunden; 'intern/nicht verrechenbar' -> 0; sonst null.",
    "- 'kleinmaterial': 0 keine,1 gering,2 mittel,3 viel oder null. 'fahrt': km,fahrzeitStd,pauschale.",
    "- Material per gesprochener Bezeichnung+Menge+Einheit. 'missing': kurze deutsche Liste.",
    "- Bestehende Werte beibehalten, außer das Transkript korrigiert sie.",
    `Schema: {"projektNr":string|null,"bauvorhaben":string|null,"datum":string|null,"monteure":[{"name":string,"lohngruppe":string|null,"taetigkeit":string,"kategorie":string,"stunden":number|null,"verrechenbar":number|null}],"material":[{"bezeichnung":string,"menge":number,"einheit":string}],"kleinmaterial":number|null,"fahrt":{"km":number|null,"fahrzeitStd":number|null,"pauschale":boolean},"arbeiten":string|null,"missing":string[]}`,
  ].join("\n");
  const user = "Aktuelles JSON:\n" + JSON.stringify(current || {}) + "\n\nTranskript:\n\"\"\"\n" + transcript + "\n\"\"\"";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error("LLM " + res.status + ": " + (await res.text().catch(() => "")));
  return JSON.parse((await res.json()).choices[0].message.content);
}
module.exports = { configured, transcribe, extractReport };
