// Harness: Node-side fake Firestore + helpers to open player/GM pages.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = path.resolve(process.env.SITE || path.join(__dirname, '..', '..'));
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-firebase.js'), 'utf8');

const store = {}; // path -> {doc, ver}
const listeners = {}; // id -> {path, page}
const issues = []; // {kind, page, text}
const offline = new Set(); // страницы «без сети/во сне»: снапшоты им не приходят, пока не вызовут wake(page)

function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function clone(v) { return v === undefined ? undefined : structuredClone(v); }
function isFV(v) { return v && typeof v === 'object' && typeof v.__fv === 'string'; }
function applyFV(cur, fv) {
  switch (fv.__fv) {
    case 'arrayUnion': { const arr = Array.isArray(cur) ? cur.slice() : []; for (const x of fv.vals) if (!arr.some(y => deepEq(x, y))) arr.push(x); return arr; }
    case 'arrayRemove': { const arr = Array.isArray(cur) ? cur : []; return arr.filter(y => !fv.vals.some(x => deepEq(x, y))); }
    case 'increment': return (typeof cur === 'number' ? cur : 0) + fv.n;
    case 'serverTimestamp': return { __ts: Date.now() };
    case 'delete': return undefined;
  }
}
function resolveDeep(v, cur) { // for set(): FVs nested inside objects
  if (isFV(v)) return applyFV(cur, v);
  if (Array.isArray(v)) return v.map(x => resolveDeep(x));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) { const r = resolveDeep(v[k], cur && cur[k]); if (r !== undefined) o[k] = r; } return o; }
  return v;
}
function mergeDeep(target, src) {
  for (const k in src) {
    const v = src[k];
    if (isFV(v)) { const r = applyFV(target[k], v); if (r === undefined) delete target[k]; else target[k] = r; }
    else if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) target[k] = {}; // как Firestore: пустой словарь при merge заменяет поле целиком
    else if (v && typeof v === 'object' && !Array.isArray(v)) { if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {}; mergeDeep(target[k], v); }
    else target[k] = clone(v);
  }
}
function setPath(obj, dotted, v) {
  const parts = dotted.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
  const last = parts[parts.length - 1];
  const r = isFV(v) ? applyFV(o[last], v) : resolveDeep(v, o[last]);
  if (r === undefined) delete o[last]; else o[last] = r;
}
function sizeCheck(p, doc) {
  const n = Buffer.byteLength(JSON.stringify(doc));
  if (n > 1048000) { issues.push({ kind: 'firestore-1MB', text: p + ' size ' + n }); throw new Error('Document exceeds 1MB: ' + p + ' ' + n); }
}
function applyOp(op, a) {
  const e = store[a.path];
  if (op === 'set') {
    let doc;
    if (a.merge && e) { doc = clone(e.doc); mergeDeep(doc, a.data); } else doc = resolveDeep(a.data, {});
    sizeCheck(a.path, doc);
    store[a.path] = { doc, ver: (e ? e.ver : 0) + 1 };
  } else if (op === 'update') {
    if (!e) { const err = new Error('NOT_FOUND: No document to update: ' + a.path); err.code = 'not-found'; throw err; }
    const doc = clone(e.doc);
    for (const k in a.data) setPath(doc, k, a.data[k]);
    sizeCheck(a.path, doc);
    store[a.path] = { doc, ver: e.ver + 1 };
  } else if (op === 'delete') { delete store[a.path]; }
}
async function notify(paths) {
  for (const [id, l] of Object.entries(listeners)) {
    if (!paths.has(l.path) || offline.has(l.page)) continue;
    const e = store[l.path];
    l.page.evaluate(([id, d]) => window.__fsNotify && window.__fsNotify(id, d), [id, e ? e.doc : null]).catch(() => {});
  }
}
async function handle(page, op, a) {
  if (op === 'get') { const e = store[a.path]; if (a.withVer) return e ? { doc: clone(e.doc), ver: e.ver } : null; return e ? clone(e.doc) : null; }
  if (op === 'query') {
    const pref = a.path + '/';
    return Object.entries(store).filter(([p, e]) => p.startsWith(pref) && !p.slice(pref.length).includes('/') && a.filters.every(([f, o, v]) => o === '==' ? e.doc[f] === v : true)).map(([p, e]) => [p, clone(e.doc)]);
  }
  if (op === 'listen') { listeners[a.id] = { path: a.path, page }; const e = store[a.path]; setTimeout(() => page.evaluate(([id, d]) => window.__fsNotify(id, d), [a.id, e ? e.doc : null]).catch(() => {}), 0); return true; }
  if (op === 'unlisten') { delete listeners[a.id]; return true; }
  if (op === 'commit') {
    for (const p in a.reads) { const e = store[p]; if ((e ? e.ver : 0) !== a.reads[p]) return false; }
    const backup = {}; for (const [o, x] of a.ops) backup[x.path] = store[x.path];
    try { for (const [o, x] of a.ops) applyOp(o, x); } catch (err) { for (const p in backup) { if (backup[p]) store[p] = backup[p]; else delete store[p]; } throw err; }
    notify(new Set(a.ops.map(x => x[1].path)));
    return true;
  }
  applyOp(op, a);
  notify(new Set([a.path]));
  return true;
}

let server;
function serve(port) {
  return new Promise(res => {
    server = http.createServer((req, resp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      // С c382132 сайт берёт Firebase SDK из vendor/firebase/ — подменяем его фейком, как раньше gstatic.
      if (/^\/vendor\/firebase\//.test(p)) { resp.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' }); resp.end(/firebase-app-compat\.js$/.test(p) ? FAKE : ''); return; }
      const f = path.join(SITE, p);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); resp.end(); return; }
      const ext = path.extname(f);
      const ct = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' }[ext] || 'application/octet-stream';
      resp.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(resp);
    }).listen(port, () => res());
  });
}

let browser;
async function launch() { await serve(+(process.env.PORT || 8765)); browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] })); return browser; }

// host: use 'localhost' or '127.0.0.1' etc. to separate localStorage; each call = new context.
async function openPage(file, user, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.exposeBinding('__fsCall', async ({ page }, op, a) => handle(page, op, a));
  await ctx.addInitScript(`window.__FAKE_USER = ${JSON.stringify(user)};`);
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 204, body: '' }));
  await ctx.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await ctx.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
  const page = await ctx.newPage();
  const tag = opts.tag || user.uid;
  page.on('pageerror', e => issues.push({ kind: 'pageerror', page: tag, text: String(e && e.stack || e).slice(0, 600) }));
  page.on('console', m => { if (m.type() === 'error') issues.push({ kind: 'console.error', page: tag, text: m.text().slice(0, 600) }); });
  page.on('dialog', d => { (page.__dialogs = page.__dialogs || []).push(d.type() + ': ' + d.message()); if (opts.onDialog) opts.onDialog(d); else if (d.type() === 'prompt') { const q = page.__answers || []; d.accept(q.length ? String(q.shift()) : (page.__promptAnswer || '')); } else if (d.type() === 'confirm') { const q = page.__confirms || []; if (q.length && q.shift() === false) d.dismiss(); else d.accept(); } else d.accept(); });
  await page.goto('http://localhost:' + (process.env.PORT || 8765) + '/' + file, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return page;
}

function sleep(page) { offline.add(page); }
function wake(page) { offline.delete(page); for (const [id, l] of Object.entries(listeners)) { if (l.page !== page) continue; const e = store[l.path]; page.evaluate(([id, d]) => window.__fsNotify && window.__fsNotify(id, d), [id, e ? e.doc : null]).catch(() => {}); } }
module.exports = { launch, openPage, store, issues, sleep, wake, get browser() { return browser; }, close: async () => {
  await browser.close(); server.close();
  // Для CI: падение JS на странице = тест не прошёл.
  const errs = issues.filter(i => i.kind === 'pageerror');
  if (errs.length) { console.log('FAIL pageerror x' + errs.length + ': ' + errs[0].text.split('\n')[0]); process.exitCode = 1; }
} };
