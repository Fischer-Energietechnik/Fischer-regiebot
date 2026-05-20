# Regiebericht-Bot – Fischer Energietechnik (Telegram)

Telegram-Assistent für VOB-Regieberichte. Monteure erfassen per **Sprachnachricht**
oder **geführten Buttons**: Baustelle, Stunden (verrechenbar/intern), Material, Arbeiten.
Ergebnis: **Importdatei für KWP bnWin.net** (freie Excel-Schnittstelle) + **PDF**.
**Preise kommen aus dem KWP-Katalog (DATANORM/Eldanorm)** – der Monteur gibt nur
Artikelnummer + Menge an, nie den Preis.

> Schlanke Version **nur für Fischer Energietechnik**. Läuft über Telegram per
> **Long-Polling** – **kein öffentlicher Server / keine Domain nötig**.

---

## Warum Telegram?
- Bot-Token in 2 Minuten bei **@BotFather** – keine Meta-Verifizierung, keine Nummer kaufen.
- Kann ohne öffentliche HTTPS-Adresse laufen (auch auf einem Büro-PC/Server).
- Sprachnachrichten, Fotos, Standort, Buttons – alles wie gehabt.

## In 5 Minuten startklar
1. In Telegram **@BotFather** öffnen → `/newbot` → Namen + Benutzernamen vergeben.
2. BotFather schickt einen **Token** → in `.env` als `BOT_TOKEN` eintragen,
   den Benutzernamen als `BOT_USERNAME`.
3. Starten:

       npm install
       cp .env.example .env      # BOT_TOKEN + BOT_USERNAME eintragen
       npm start

4. Büro-Dashboard: http://localhost:3000/admin (Login aus `.env`).
5. Im Admin „Einladungslink/QR" öffnen, Bot-Benutzernamen eintragen → QR/Link an
   die Monteure geben. Monteur tippt Link → „Starten" → sagt seinen Namen → fertig.

Ohne `OPENAI_API_KEY` funktioniert der geführte Button-Modus. Ohne `REDIS_URL`
liegen Sitzungen im Speicher (für Dauerbetrieb Redis setzen).

---

## Wichtige .env-Werte
- `BOT_TOKEN`, `BOT_USERNAME` – von @BotFather
- `ADMIN_USER`, `ADMIN_PASS` – Login fürs Büro-Dashboard (bitte ändern!)
- `OPENAI_API_KEY` – für Sprachnachrichten (optional)
- `KWP_IMPORT_DIR` – optionaler Ordner, in den die Importdatei zusätzlich kopiert wird
- `AUTO_APPROVE` – `true`: Monteure sofort aktiv; `false`: im Admin freischalten

## Dauerbetrieb
Auf einem kleinen Server (z. B. Render/Railway/eigener Mini-PC) als Dienst laufen
lassen (`npm start`). Polling braucht nur ausgehendes Internet. `REDIS_URL` setzen,
damit Gespräche einen Neustart überstehen.

> Die exakten Spalten der KWP-Importdatei einmal mit eurem KWP-Partner abstimmen
> (in `src/kwp.js`). Eigene Artikel/Projekte/Richt-/Sollwerte liegen in
> `tenants/fischer/` (werden beim ersten Start aus `templates/` angelegt).

---

## Struktur
    server.js            Server + Telegram-Long-Polling (eine Firma)
    src/telegram.js      Telegram Bot API + Update-Parser + Polling
    src/flow.js          Gesprächsführung (Voice + geführt)
    src/ai.js            Whisper + Felderkennung
    src/catalog.js       Artikelstamm (keine Preise)
    src/registry.js      Monteur-Register
    src/plausibility.js  Stunden-Bewertung
    src/kwp.js           KWP-Importdatei + JSON
    src/pdf.js           PDF-Regiebericht
    src/report.js        Soll-Ist-Auswertung
    src/admin.js         Büro-Dashboard
    src/store.js         Sitzungen (Redis/In-Memory)
    src/tenants.js       Firmen-Config (hier nur "fischer")
    src/ctx.js           interner Kontext
    templates/           Start-Daten (artikel/projekte/soll/richtwerte/logo)
    tools/               Einladungslink/QR-Generator (Telegram)
