// Shared setup: GM creates session, player creates character and joins.
const H = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function setupSession(opts = {}) {
  await H.launch();
  const gm = await H.openPage('gm.html', { uid: 'gm1', email: 'gm@x', displayName: 'Мастер' }, { tag: 'GM' });
  await gm.evaluate(() => window.createSession());
  await wait(1500);
  const code = await gm.evaluate(() => localStorage.getItem('ttrpg_gm_session_code'));
  const players = [];
  for (const p of (opts.players || [{ uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }])) {
    const pg = await H.openPage('index.html', { uid: p.uid, email: p.uid + '@x', displayName: p.name }, { tag: p.uid });
    await pg.evaluate((p) => {
      try { window.dismissOnboarding && window.dismissOnboarding(); } catch (e) {}
      document.getElementById('char-name').value = p.name;
      const r = document.getElementById('char-race'); r.value = p.race; window.onRaceChanged();
      const s = document.getElementById('char-sign'); s.value = p.sign; window.onSignChanged();
      for (const k in p.stats) { const el = document.getElementById('stat-' + k); el.setAttribute('data-raw-stat', p.stats[k]); }
      updateAll(); saveLocalStorage(true);
    }, p);
    await wait(300);
    await pg.evaluate((code) => { document.getElementById('session-code-input').value = code; window.joinSession(); }, code);
    await wait(1200);
    players.push(pg);
  }
  return { gm, players, code, H, wait };
}

// Snapshot of player sheet computed values
async function sheet(pg) {
  return pg.evaluate(() => {
    const v = id => { const e = document.getElementById(id); return e ? (e.value !== undefined && e.tagName !== 'SPAN' && e.tagName !== 'DIV' ? e.value : e.innerText) : null; };
    return {
      lvl: characterLevel, str: v('stat-str'), dex: v('stat-dex'), con: v('stat-con'), int: v('stat-int'), wis: v('stat-wis'), cha: v('stat-cha'),
      maxHp: v('max-hp'), curHp: v('cur-hp'), maxMp: v('max-mp'), curMp: v('cur-mp'), armor: v('armor-total'), speed: v('val-speed'),
      maxW: v('weight-max-display'), curW: v('weight-current'), dmg: v('main-panel-dmg'), res: v('resistances-display'),
      calc: window.lastWeaponCombatCalc
    };
  });
}

module.exports = { setupSession, sheet, wait };

async function gmAddEnemy(gm, name, overrides) {
  return gm.evaluate(async ([name, ov]) => {
    const idx = window.enemiesData.findIndex(e => e.name === name);
    const sel = document.getElementById('enemy-db-select');
    if (!sel.options.length || sel.options.length < 2) { try { populateEnemyDbSelect(); } catch (e) {} }
    sel.value = String(idx); window.onEnemyDbPicked();
    if (ov) for (const k in ov) { const el = document.getElementById(k); if (el) el.value = ov[k]; }
    window.addEnemy();
    await new Promise(r => setTimeout(r, 600));
    return idx;
  }, [name, overrides || null]);
}
async function gmGive(gm, itemName, count, opts = {}) {
  gm.__answers = ['1', String(count || 1)];
  gm.__confirms = [!!opts.stolen, !!opts.enchant];
  return gm.evaluate(async (n) => {
    if (!window.__itemsLoaded) { window.loadGmItems(); await new Promise(r => setTimeout(r, 800)); window.__itemsLoaded = true; }
    window.gmGiveItemFromTable(n);
    await new Promise(r => setTimeout(r, 700));
  }, itemName);
}
async function plEquip(pl, itemName, slot) {
  return pl.evaluate(([n, slot]) => { const it = playerInventory.find(i => i.name === n); if (!it) return 'NOITEM ' + n; return applyItemToSlot(it, slot); }, [itemName, slot]);
}
module.exports.gmAddEnemy = gmAddEnemy; module.exports.gmGive = gmGive; module.exports.plEquip = plEquip;
// Player attack helper: tries up to N turns until hit; applies damage. Returns log.
async function plAttack(pl, targetId, action, opts = {}) {
  const out = [];
  for (let i = 0; i < (opts.tries || 8); i++) {
    const r = await pl.evaluate(([eid, action, opts]) => {
      window.renderAttackTargetSelect();
      document.getElementById('attack-target-select').value = eid;
      const sel = document.getElementById('attack-action-select');
      sel.value = action;
      if (sel.value !== action) return { err: 'no action ' + action, opts: Array.from(sel.options).map(o => o.value + '=' + o.text) };
      if (opts.power !== undefined) document.getElementById('chk-power-attack').checked = !!opts.power;
      if (opts.sneak !== undefined) document.getElementById('chk-sneak-attack').checked = !!opts.sneak;
      if (opts.enhanced !== undefined) document.getElementById('chk-enhanced-cast').checked = !!opts.enhanced;
      const before = (window.__dlgCount || 0);
      window.rollPlayerAttack();
      const t = document.getElementById('attack-roll-text').innerText.replace(/\n/g, ' ');
      const pa = pendingPlayerAttack;
      if (pa) { window.attackStepNext(); const prev = document.getElementById('attack-preview-line').textContent; return { hit: true, t, dmg: pa.dmg, dmgType: pa.dmgType, pen: pa.penetrationPct, trueDmg: pa.trueDmg, prev, log: pa.logText }; }
      return { hit: false, t };
    }, [targetId, action, opts]);
    out.push(r);
    if (r.err) break;
    if (r.hit) {
      if (opts.apply !== false) { await pl.evaluate(() => window.applyPlayerAttackDamage()); await wait(700); }
      break;
    }
    await pl.evaluate(() => { const b = document.getElementById('attack-step-btn'); if (b && b.style.display !== 'none') window.attackStepNext(); });
    await pl.evaluate(() => window.nextTurn()); await wait(3300);
  }
  return out;
}
async function gmNextTurn(pl) { await pl.evaluate(() => window.nextTurn()); await wait(3300); }
module.exports.plAttack = plAttack; module.exports.gmNextTurn = gmNextTurn;
async function gmAttack(gm, enemyId, targetUid, action, opts = {}) {
  const out = [];
  for (let i = 0; i < (opts.tries || 10); i++) {
    const r = await gm.evaluate(async ([eid, uid, action, opts]) => {
      if (typeof populateGmAttackSelects === "function") populateGmAttackSelects();
      document.getElementById('gm-attack-attacker-select').value = eid; window.onGmAttackAttackerPicked();
      document.getElementById('gm-attack-target-select').value = uid;
      const as = document.getElementById('gm-attack-action-select'); as.value = action;
      if (as.value !== action) return { err: 'no action', opts: Array.from(as.options).map(o => o.value + '=' + o.text) };
      if (opts.status !== undefined) document.getElementById('gm-attack-status-select').value = opts.status;
      if (opts.shield !== undefined) { const c = document.getElementById('gm-attack-shield-block'); if (c) c.checked = !!opts.shield; }
      window.rollGmAttack();
      const t = document.getElementById('gm-attack-roll-text').innerText.replace(/\n/g, ' ');
      await new Promise(r => setTimeout(r, 300));
      const prev = (document.getElementById('gm-attack-preview') || {}).textContent;
      const hit = /Попадание/.test(t);
      if (hit || opts.applyMiss) { window.applyGmAttackDamage(); await new Promise(r => setTimeout(r, 700)); }
      return { hit, t, prev };
    }, [enemyId, targetUid, action, opts]);
    out.push(r);
    if (r.err || r.hit || opts.once) break;
  }
  return out;
}
module.exports.gmAttack = gmAttack;
