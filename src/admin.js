// src/admin.js — Büro-Dashboard je Firma (Basic Auth -> Mandant aus Login ermittelt).
const fs = require("fs");
const path = require("path");
const tenants = require("./tenants");
const registry = require("./registry");
const report = require("./report");
const whatsapp = require("./telegram");
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;

// Login -> Firma. Jede Firma hat eigene admin.user/admin.pass.
function authTenant(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Basic ")) return null;
  const [u, p] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  return tenants.getByAdmin(u, p);
}
function auth(req, res, next) {
  const t = authTenant(req);
  if (!t) return res.set("WWW-Authenticate", 'Basic realm="Fischer Admin"').status(401).send("Login erforderlich");
  req.tenant = t; next();
}

function listBerichte(t) {
  const OUT = path.join(t.dir, "out"); let files = [];
  try { files = fs.readdirSync(OUT).filter(f => /^RB-.*\.json$/.test(f)); } catch (e) {}
  return files.map(f => {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch (e) { return null; }
    if (!d || !d.nr) return null;
    const ges = (d.monteure || []).reduce((a, m) => a + num(m.stunden), 0);
    const ver = (d.monteure || []).reduce((a, m) => a + num(m.verrechenbar), 0);
    const base = d.nr.replace(/[^\w-]/g, "_");
    return { nr: d.nr, datum: d.datum || "", projektNr: d.projektNr || "", bauvorhaben: d.bauvorhaben || "", erfasstVon: d.erfasstVonName || d.erfasstVon || "", stundenGesamt: ges, stundenVerr: ver, material: (d.material || []).length, csv: base + "_KWP-Import.csv", pdf: base + "_Regiebericht.pdf", ts: d._ts || 0 };
  }).filter(Boolean).sort((a, b) => b.ts - a.ts);
}

function mount(app) {
  app.get("/admin", auth, (req, res) => res.set("Content-Type", "text/html; charset=utf-8").send(dashboardHtml(req.tenant)));
  app.get("/admin/api/monteure", auth, (req, res) => res.json(registry.list(req.tenant)));
  app.post("/admin/api/monteure/:number", auth, async (req, res) => {
    const number = req.params.number, status = (req.body && req.body.status) || "active";
    const before = registry.get(req.tenant, number);
    const r = registry.setStatus(req.tenant, number, status);
    if (status === "active" && before && before.status !== "active") {
      try { await whatsapp.forTenant(req.tenant).sendText(number, `✅ Du bist freigeschaltet${r.name ? ", " + r.name : ""}! Schreib „Start".`); } catch (e) {}
    }
    res.json(r);
  });
  app.get("/admin/api/berichte", auth, (req, res) => res.json(listBerichte(req.tenant)));
  app.get("/admin/file", auth, (req, res) => { const name = path.basename(req.query.name || ""); const fp = path.join(req.tenant.dir, "out", name); if (!fp.startsWith(path.join(req.tenant.dir, "out")) || !fs.existsSync(fp)) return res.status(404).send("nicht gefunden"); res.download(fp); });
  app.get("/admin/einladung", auth, (_req, res) => res.sendFile(path.join(__dirname, "..", "tools", "monteur-einladung.html")));
  app.get("/report", auth, (req, res) => res.set("Content-Type", "text/html; charset=utf-8").send(report.buildHtml(req.tenant)));
  app.get("/report.csv", auth, (req, res) => res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", "attachment; filename=Soll-Ist-Report.csv").send(report.buildCsv(req.tenant)));
}

function dashboardHtml(t) {
  return `<!DOCTYPE html><html lang=de><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${t.firma} · Büro-Admin</title>
<style>:root{--green:#5fa23a;--green-d:#3f7a2a;--grey:#6e6e6e;--ink:#23262a;--line:#e6e8e4}*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}body{background:#f3f4f1;color:var(--ink)}
.bar{background:#fff;border-bottom:2px solid var(--green);padding:14px 22px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:5}.bar svg{width:26px;height:26px}.bar h1{font-size:1.05rem;color:var(--green-d)}.bar .sub{margin-left:auto;font-size:.74rem;font-weight:700;color:var(--grey)}.bar .sub b{color:var(--green-d)}
.wrap{max-width:1060px;margin:0 auto;padding:20px 16px 60px}.tabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}.tabs a,.tabs button{border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 16px;font-weight:700;font-size:.86rem;color:var(--grey);cursor:pointer;text-decoration:none}.tabs button.on{background:var(--green);color:#fff;border-color:var(--green)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 22px rgba(20,40,15,.06);padding:18px;margin-bottom:18px}.stat{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px}.stat .b{flex:1;min-width:120px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.stat .b .n{font-size:1.6rem;font-weight:800;color:var(--green-d)}.stat .b .l{font-size:.74rem;color:var(--grey)}
table{width:100%;border-collapse:collapse;font-size:.86rem}th{text-align:left;font-size:.66rem;text-transform:uppercase;color:#999;padding:8px;border-bottom:1px solid var(--line)}td{padding:9px 8px;border-bottom:1px solid #f3f4f1}.r{text-align:right}.pill{font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:99px}.s-active{background:#e3f2d8;color:#3f7a2a}.s-pending{background:#fff3d6;color:#9a6b00}.s-blocked{background:#fde2e0;color:#b3261e}.s-registering{background:#eef0ec;color:#6e6e6e}.btn{border:none;border-radius:8px;padding:6px 11px;font-weight:700;font-size:.76rem;cursor:pointer;margin-left:5px}.btn-ok{background:var(--green);color:#fff}.btn-block{background:#fde2e0;color:#b3261e}a.dl{color:var(--green-d);font-weight:700;text-decoration:none;font-size:.8rem;margin-right:10px}.empty{color:#aaa;padding:14px}</style></head><body>
<div class=bar><svg viewBox="0 0 24 24" fill=none><path d="M9 2v6M15 2v6" stroke="#3f7a2a" stroke-width=2.2 stroke-linecap=round/><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" fill="#5fa23a"/><path d="M12 17v5" stroke="#6e6e6e" stroke-width=2.2 stroke-linecap=round/></svg>
<h1>${t.firma} · Büro-Admin</h1><div class=sub>Regiebericht-Assistent</div></div>
<div class=wrap><div class=tabs><button id=t1 class=on onclick="tab('mon')">👷 Monteure</button><button id=t2 onclick="tab('ber')">📋 Berichte</button><a href="/report" target=_blank>📊 Soll-Ist</a><a href="/admin/einladung" target=_blank>🔗 Einladungslink/QR</a></div>
<div id=mon><div class=stat id=monStat></div><div class=card><table id=monTbl></table></div></div>
<div id=ber style="display:none"><div class=stat id=berStat></div><div class=card><table id=berTbl></table></div></div></div>
<script>
const $=s=>document.querySelector(s);
function tab(w){$('#mon').style.display=w==='mon'?'block':'none';$('#ber').style.display=w==='ber'?'block':'none';$('#t1').classList.toggle('on',w==='mon');$('#t2').classList.toggle('on',w==='ber');if(w==='ber')loadBer();else loadMon();}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
async function loadMon(){const m=await(await fetch('/admin/api/monteure')).json();const c={active:0,pending:0,blocked:0,registering:0};m.forEach(x=>c[x.status]=(c[x.status]||0)+1);
$('#monStat').innerHTML=[['Aktiv',c.active],['Wartet',c.pending],['Gesperrt',c.blocked],['Gesamt',m.length]].map(([l,n])=>'<div class=b><div class=n>'+n+'</div><div class=l>'+l+'</div></div>').join('');
const rows=m.map(x=>{const a=[];if(x.status!=='active')a.push('<button class="btn btn-ok" onclick="setS(\\''+x.number+'\\',\\'active\\')">Freischalten</button>');if(x.status!=='blocked')a.push('<button class="btn btn-block" onclick="setS(\\''+x.number+'\\',\\'blocked\\')">Sperren</button>');return '<tr><td><b>'+esc(x.name||'(ohne Name)')+'</b></td><td>'+esc(x.number)+'</td><td><span class="pill s-'+x.status+'">'+x.status+'</span></td><td>'+(x.createdAt?new Date(x.createdAt).toLocaleDateString('de-DE'):'')+'</td><td class=r>'+a.join('')+'</td></tr>';}).join('');
$('#monTbl').innerHTML='<tr><th>Name</th><th>Nummer</th><th>Status</th><th>Seit</th><th class=r>Aktion</th></tr>'+(rows||'<tr><td colspan=5 class=empty>Noch keine Monteure – Einladungslink teilen.</td></tr>');}
async function setS(n,s){await fetch('/admin/api/monteure/'+encodeURIComponent(n),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s})});loadMon();}
async function loadBer(){const b=await(await fetch('/admin/api/berichte')).json();const std=b.reduce((a,x)=>a+x.stundenGesamt,0),ver=b.reduce((a,x)=>a+x.stundenVerr,0);
$('#berStat').innerHTML=[['Berichte',b.length],['Stunden',std.toLocaleString('de-DE')],['verrechenbar',ver.toLocaleString('de-DE')]].map(([l,n])=>'<div class=b><div class=n>'+n+'</div><div class=l>'+l+'</div></div>').join('');
const rows=b.map(x=>'<tr><td><b>'+esc(x.nr)+'</b></td><td>'+esc(x.datum)+'</td><td>'+esc(x.projektNr)+(x.bauvorhaben?' · '+esc(x.bauvorhaben):'')+'</td><td>'+esc(x.erfasstVon)+'</td><td class=r>'+x.stundenGesamt.toLocaleString('de-DE')+' ('+x.stundenVerr.toLocaleString('de-DE')+')</td><td class=r>'+x.material+'</td><td><a class=dl href="/admin/file?name='+encodeURIComponent(x.csv)+'">KWP-CSV</a><a class=dl href="/admin/file?name='+encodeURIComponent(x.pdf)+'">PDF</a></td></tr>').join('');
$('#berTbl').innerHTML='<tr><th>Nr</th><th>Datum</th><th>Baustelle</th><th>Erfasst von</th><th class=r>Std (verr.)</th><th class=r>Mat.</th><th>Dateien</th></tr>'+(rows||'<tr><td colspan=7 class=empty>Noch keine Berichte.</td></tr>');}
loadMon();
</script></body></html>`;
}
module.exports = { mount, authTenant, listBerichte, dashboardHtml };
