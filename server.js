// server.js — Regiebericht-Bot für Fischer Energietechnik über TELEGRAM.
// Bot läuft per Long-Polling (kein öffentlicher Server nötig).
// Express dient nur dem Büro-Dashboard /admin.
require("dotenv").config();
const express = require("express");
const store = require("./src/store");
const tenants = require("./src/tenants");
const telegram = require("./src/telegram");
const admin = require("./src/admin");
const { handleIncoming } = require("./src/flow");

const TENANT_ID = "fischer";

function bootstrapTenant() {
  return tenants.upsert(TENANT_ID, {
    firma: process.env.FIRMA || "Fischer Energietechnik",
    email: process.env.FIRMA_EMAIL || "",
    botToken: process.env.BOT_TOKEN || "",
    botUsername: process.env.BOT_USERNAME || "",
    openaiKey: process.env.OPENAI_API_KEY || "",
    admin: { user: process.env.ADMIN_USER || "buero", pass: process.env.ADMIN_PASS || "bitte-aendern" },
    kwp: {
      sep: process.env.CSV_SEPARATOR || ";",
      importDir: process.env.KWP_IMPORT_DIR || "",
      lohngruppe: { Meister: "1", Geselle: "2", Azubi: "4", Helfer: "5" },
    },
    subscription: { status: "active", plan: "intern", trialEnds: null },
  });
}

// ---- Büro-Dashboard ----
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
admin.mount(app);
app.get("/", (_req, res) => res.redirect("/admin"));
app.get("/health", (_req, res) => res.send("ok"));

// ---- Eingehende Telegram-Updates ----
async function onUpdate(parsed, wa) {
  if (!parsed) return;
  const tenant = tenants.get(TENANT_ID);
  if (parsed.callbackId) wa.answerCallback(parsed.callbackId);
  await handleIncoming(tenant, parsed.from, parsed.input, { ts: parsed.ts });
}

const PORT = process.env.PORT || 3000;
store.init().then(() => {
  const t = bootstrapTenant();
  app.listen(PORT, () => console.log(`${t.firma} · Büro-Admin: http://localhost:${PORT}/admin`));
  if (!t.botToken) { console.error("⚠️  BOT_TOKEN fehlt – Telegram-Bot startet nicht. Token von @BotFather in .env eintragen."); return; }
  telegram.startPolling(t, onUpdate);   // läuft dauerhaft
});
