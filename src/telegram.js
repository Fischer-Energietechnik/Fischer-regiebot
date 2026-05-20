// src/telegram.js — Telegram Bot API, pro Firma gebunden.
// Stellt dieselbe Schnittstelle wie früher der WhatsApp-Client bereit
// (sendText/sendButtons/sendList/markRead/downloadMedia), damit der
// restliche Code unverändert bleibt. Zusätzlich: Long-Polling.
const API = (token) => `https://api.telegram.org/bot${token}`;
const FILEAPI = (token) => `https://api.telegram.org/file/bot${token}`;

function forTenant(t) {
  const TOKEN = t.botToken;
  async function call(method, body) {
    const res = await fetch(`${API(TOKEN)}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error("Telegram-Fehler:", method, data.description || res.status);
    return data;
  }
  // Inline-Tastatur aus {id,title}-Buttons (eine Reihe pro Button).
  const keyboard = (rows) => ({ reply_markup: { inline_keyboard: rows.map(b => [{ text: b.title, callback_data: String(b.id).slice(0, 64) }]) } });

  return {
    sendText: (to, body) => call("sendMessage", { chat_id: to, text: body }),
    sendButtons: (to, body, buttons) => call("sendMessage", { chat_id: to, text: body, ...keyboard(buttons) }),
    sendList: (to, body, _label, rows) => call("sendMessage", { chat_id: to, text: body,
      ...keyboard(rows.map(r => ({ id: r.id, title: r.description ? `${r.title} — ${r.description}` : r.title }))) }),
    markRead: () => Promise.resolve(),                       // Telegram braucht keine Lesebestätigung
    answerCallback: (id) => call("answerCallbackQuery", { callback_query_id: id }).catch(() => {}),
    async downloadMedia(fileId) {
      const meta = await (await fetch(`${API(TOKEN)}/getFile?file_id=${fileId}`)).json();
      const fp = meta.result.file_path;
      const bin = await fetch(`${FILEAPI(TOKEN)}/${fp}`);
      const ext = (fp.split(".").pop() || "").toLowerCase();
      const mime = ext === "oga" || ext === "ogg" ? "audio/ogg" : ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : ext === "wav" ? "audio/wav" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : "application/octet-stream";
      return { buffer: Buffer.from(await bin.arrayBuffer()), mime };
    },
  };
}

// Telegram-Update -> einheitliches input-Objekt für flow.js
function parseUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    return { from: String(cq.message.chat.id), input: { type: "reply", replyId: cq.data, text: cq.data }, ts: cq.message?.date, callbackId: cq.id };
  }
  const m = update.message || update.edited_message;
  if (!m) return null;
  const from = String(m.chat.id), ts = m.date;
  let input;
  if (m.text) input = { type: "text", text: m.text };
  else if (m.voice) input = { type: "audio", mediaId: m.voice.file_id };
  else if (m.audio) input = { type: "audio", mediaId: m.audio.file_id };
  else if (m.photo) input = { type: "image", mediaId: m.photo[m.photo.length - 1].file_id };
  else if (m.document) input = { type: "image", mediaId: m.document.file_id };
  else if (m.location || m.venue) { const loc = m.location || m.venue.location; input = { type: "location", lat: loc.latitude, lng: loc.longitude, name: m.venue?.title || "", address: m.venue?.address || "" }; }
  else input = { type: "other" };
  return { from, input, ts };
}

// Long-Polling: holt Updates und ruft onUpdate(parsed) auf. Kein öffentlicher Server nötig.
async function startPolling(tenant, onUpdate) {
  const TOKEN = tenant.botToken;
  let offset = 0;
  const me = await (await fetch(`${API(TOKEN)}/getMe`)).json().catch(() => null);
  if (me && me.ok) console.log(`Telegram verbunden: @${me.result.username}`);
  else console.error("Telegram: getMe fehlgeschlagen – BOT_TOKEN prüfen.");
  for (;;) {
    try {
      const res = await fetch(`${API(TOKEN)}/getUpdates?timeout=50&offset=${offset}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`);
      const data = await res.json();
      if (data.ok) for (const u of data.result) { offset = u.update_id + 1; try { await onUpdate(parseUpdate(u), forTenant(tenant)); } catch (e) { console.error("Update-Fehler:", e.message); } }
      else { await new Promise(r => setTimeout(r, 2000)); }
    } catch (e) { console.error("Polling:", e.message); await new Promise(r => setTimeout(r, 3000)); }
  }
}

module.exports = { forTenant, parseUpdate, startPolling };
