// src/ctx.js — trägt den aktuellen Mandanten (Firma) sicher durch die async-Aufrufkette.
// So können Helfer den richtigen WhatsApp-Client/Katalog nutzen, auch bei vielen
// gleichzeitigen Firmen – ohne globale Variablen (concurrency-safe).
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

function run(storeObj, fn) { return als.run(storeObj, fn); }
function current() { return als.getStore() || {}; }
function tenant() { return current().tenant; }
function wa() { return current().wa; }
function cat() { return current().cat; }

module.exports = { run, current, tenant, wa, cat };
