// ============================================================================
// tools/balance-weapons.js — сравнение оружия и боеприпасов по настоящим ударам (стенд, не CI).
// Запуск: node tools/balance-weapons.js   (PERKS=1 — с перками ветки оружия, K — ударов на замер, ONLY=melee|ranged)
// Герой 30 уровня, нужный навык 75, Сила/Ловкость 22, без зачарований и веры; манекен — Мамонт, 999999 ОЗ.
// Ближний бой: обычный удар и силовая атака. Дальний: выстрел. Стрелы меряются из эбонитового лука,
// болты из эбонитового арбалета, луки и арбалеты — со стальными стрелами/болтами.
// ============================================================================
const path = require('path');
const fs = require('fs');
process.env.SITE = process.env.SITE || path.resolve(__dirname, '..');
const S = require('../tests/e2e/setup');
const K = +(process.env.K || 2), PERKS = process.env.PERKS === '1', ONLY = process.env.ONLY || '';
const MATS = ['Железн', 'Стальн', 'Орочь', 'Двемерск', 'Эльфийск', 'Нордск', 'Стеклянн', 'Эбонитов'];
const MELEE = [
  ['Одноручное оружие', 'меч'], ['Одноручное оружие', 'боевой топор'], ['Одноручное оружие', 'булава'], ['Одноручное оружие', 'кинжал'], ['Одноручное оружие', 'копь'],
  ['Двуручное оружие', 'двуручный меч'], ['Двуручное оружие', 'секира'], ['Двуручное оружие', 'боевой молот'], ['Двуручное оружие', 'пика']
];
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code;
  const enemies = () => (H.store[sk].doc.enemies || []);
  let eid = null;
  async function freshTarget() {
    await S.gmAddEnemy(gm, 'Мамонт', { 'enemy-hp-input': '999999' }); await wait(1000);
    const list = enemies(); eid = list[list.length - 1].id;
  }
  await freshTarget();
  const allW = await pl.evaluate(() => window.allItems.map(i => i.name));
  const wrec = await pl.evaluate(() => [].concat(window.weaponRecipes, window.weaponsNonCraftable).map(w => ({ name: w.name, sub: w.subcat, cat: w.category, dmg: w.damage })));
  const setup = async (skill, ranged) => pl.evaluate(([skill, PERKS]) => {
    window.alert = m => { (window.__al = window.__al || []).push(String(m)); }; window.confirm = () => true; window.prompt = () => '1';
    try { combatActionAllowed = () => true; } catch (e) { } try { bonusActionAllowed = () => true; } catch (e) { } try { rangedAmmoReady = () => true; } catch (e) { }
    saveLocalStorage(true);
    const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
    d.characterLevel = 30; d.levelScheme = 2; d.levelUpProgress = 0; d.perkPointsAvailable = 0;
    d.stats = ['22', '22', '18', '10', '10', '10'];
    d.skills = skillNames.map(n => n === skill ? '75' : '30');
    d.perkStates = {};
    if (PERKS) { const si = skillNames.indexOf(skill); (fullPerksManifest[skill] || []).forEach((p, pi) => { if (p.req && p.req.thresholds && p.req.thresholds[0] > 75) return; const st = p.steps || 1; for (let k = 1; k <= st; k++) d.perkStates[`skill${si}-perk${pi}-step${k}`] = true; }); }
    d.inventory = []; d.equippedSlots = {}; d.faithGod = 'none'; d.faithRank = 1;
    applyCharacterData(d); updateAll(); saveLocalStorage(true);
  }, [skill, PERKS]);
  async function hit(action, power) {
    const e0 = enemies().find(e => e.id === eid); if (!e0 || e0.curHp < 500000) await freshTarget();
    const hp0 = enemies().find(e => e.id === eid).curHp;
    const r = await pl.evaluate(([eid, action, power]) => {
      window.__al = [];
      try { combatMarks.xbow = -99; } catch (e) { } // арбалет: перезарядка 1 ход — стенд сбрасывает её, цифра за выстрел
      window.renderAttackTargetSelect();
      document.getElementById('attack-target-select').value = eid;
      const sel = document.getElementById('attack-action-select'); sel.value = action;
      if (sel.value !== action) return { err: 'no action ' + action };
      document.getElementById('chk-power-attack').checked = !!power; document.getElementById('chk-sneak-attack').checked = false;
      for (let i = 0; i < 60; i++) {
        try { combatMarks.xbow = -99; } catch (e) { }
        pendingPlayerAttack = null; window.rollPlayerAttack(); const pa = pendingPlayerAttack;
        if (pa) { window.attackStepNext(); window.applyPlayerAttackDamage(); return { dmg: pa.dmg, log: (pa.logText || '').slice(0, 200) }; }
        const b = document.getElementById('attack-step-btn'); if (b && b.style.display !== 'none') window.attackStepNext();
      }
      return { err: 'never hit' };
    }, [eid, action, power]);
    if (r.err) return r;
    await wait(550);
    r.lost = hp0 - enemies().find(e => e.id === eid).curHp;
    return r;
  }
  async function measure(action, power) {
    const xs = []; let err = null, log = '';
    for (let i = 0; i < K; i++) { const r = await hit(action, power); if (r.err) { err = r.err; break; } xs.push(r.lost); log = r.log; }
    return { avg: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null, err, log };
  }
  // Оружие кладётся в рюкзак так же, как это делает ковка (craftSmithingItem): слот, weaponDmg, weaponType, вес.
  async function give(name, slot) {
    const ok = await pl.evaluate(([n, slot]) => {
      const r = [].concat(window.weaponRecipes, window.weaponsNonCraftable).find(w => w.name === n);
      if (!r) return false;
      const wt = (window.SMITH_SUBCAT_TO_WEAPON_TYPE || {})[r.subcat] || 'onehand';
      const extra = r.isAmmo ? { category: 'Боеприпасы', price: r.price, weaponDmg: r.damage } : { slot: wt.startsWith('ranged') ? 'ranged' : 'melee', weaponDmg: r.damage, weaponType: wt, price: r.price };
      addToInventory(n, n, r.isAmmo ? 100 : 1, r.weight || 1, extra.category || 'Скованное', 'Урон ' + r.damage, extra);
      return true;
    }, [name, slot]);
    if (!ok) return 'NORECIPE ' + name;
    if (slot === 'ammo') return pl.evaluate(n => { const it = playerInventory.find(i => i.name === n); if (!it) return 'нет'; equipAmmo(it.itemId); return 'ok'; }, name);
    return pl.evaluate(([n, slot]) => { const it = playerInventory.find(i => i.name === n); return it ? applyItemToSlot(it, slot) : 'NOITEM ' + n; }, [name, slot]);
  }
  const out = [];
  async function runWeapon(skill, w, slot, action, ammo) {
    await setup(skill); await wait(500);
    if (ammo) { const ra = await give(ammo, 'ammo'); if (ra === 'нет') { out.push({ name: w, err: 'нет ' + ammo }); return; } }
    const r = await give(w, slot);
    const eq = await pl.evaluate(([n]) => { const id = equippedSlots.meleeWeapon || equippedSlots.melee; const rid = equippedSlots.rangedWeapon || equippedSlots.ranged; const f = x => { const it = x && playerInventory.find(i => i.itemId === x); return it ? it.name : null; }; return [f(id), f(rid)]; }, [w]);
    if (eq.indexOf(w) === -1) { console.error('SKIP не надето', w, JSON.stringify(r), JSON.stringify(eq)); out.push({ skill, name: w, ammo: ammo || null, err: 'не надето: ' + JSON.stringify(r).slice(0, 80) }); return; }
    const base = wrec.find(x => x.name === w) || {};
    const row = { skill, name: w, sub: base.sub, tableDmg: base.dmg, ammo: ammo || null, equip: typeof r === 'string' ? r : 'ok' };
    row.normal = await measure(action, false);
    if (action === 'melee') row.power = await measure(action, true);
    console.error(skill, w, ammo || '', JSON.stringify(row.normal), row.power ? JSON.stringify(row.power) : '');
    out.push(row);
  }
  if (!ONLY || ONLY === 'melee') {
    for (const [skill, kind] of MELEE) {
      const names = wrec.filter(w => w.name.toLowerCase().indexOf(kind) !== -1 && w.cat === (skill === 'Одноручное оружие' ? 'Одноручное' : 'Двуручное') && !/посох/i.test(w.name))
        .filter(w => MATS.some(m => w.name.indexOf(m) === 0 || w.name.indexOf(m.replace(/ий$|ый$|ой$/, '')) === 0) || /Сталгрим/.test(w.name)).map(w => w.name);
      for (const n of names) await runWeapon(skill, n, 'melee', 'melee');
    }
  }
  if (!ONLY || ONLY === 'ranged') {
    const bows = wrec.filter(w => w.cat === 'Луки').map(w => w.name), xbows = wrec.filter(w => w.cat === 'Арбалеты').map(w => w.name);
    const arrows = wrec.filter(w => w.cat === 'Стрелы').map(w => w.name), bolts = wrec.filter(w => w.cat === 'Болты').map(w => w.name);
    for (const b of bows) await runWeapon('Стрельба', b, 'ranged', 'ranged', 'Стальная стрела');
    for (const b of xbows) await runWeapon('Стрельба', b, 'ranged', 'ranged', 'Стальной болт');
    for (const a of arrows) await runWeapon('Стрельба', 'Эбонитовый лук', 'ranged', 'ranged', a);
    for (const a of bolts) await runWeapon('Стрельба', 'Эбонитовый арбалет', 'ranged', 'ranged', a);
  }
  const file = path.join(process.env.OUT || __dirname, 'out-balance-weapons' + (PERKS ? '-perks' : '') + (ONLY ? '-' + ONLY : '') + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('written', file, out.length); console.log('issues', JSON.stringify(H.issues).slice(0, 800));
  await H.close();
})();
