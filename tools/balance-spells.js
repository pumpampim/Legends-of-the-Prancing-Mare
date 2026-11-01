// ============================================================================
// tools/balance-spells.js — сравнение атакующих заклинаний адепта и эксперта (стенд, не CI).
// Запуск из корня: node tools/balance-spells.js   (TIERS=3,4 по умолчанию, K — кастов на замер)
// Герой 30 уровня, все пять школ 75, перков нет (чистое сравнение заклинаний), мана с запасом.
// Каждое заклинание, которое появляется в списке атаки, кастуется по манекену (Мамонт, 999999 ОЗ,
// без резистов) обычным и усиленным кастом; скрипт пишет снятые ОЗ, цену и статус на цели.
// ============================================================================
const path = require('path');
const fs = require('fs');
process.env.SITE = process.env.SITE || path.resolve(__dirname, '..');
const S = require('../tests/e2e/setup');
const K = +(process.env.K || 3);
const TIERS = (process.env.TIERS || '2,3,4').split(',').map(Number);
const LVL = +(process.env.LVL || 30), SKILL = +(process.env.SKILL || 75);

(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code;
  const enemies = () => (H.store[sk].doc.enemies || []);
  let eid = null;
  async function freshTarget() {
    await S.gmAddEnemy(gm, 'Мамонт', { 'enemy-hp-input': '999999' }); await wait(1200);
    const list = enemies(); eid = list[list.length - 1].id;
  }
  await freshTarget();
  const spells = await pl.evaluate(([LVL, SKILL, TIERS]) => {
    window.alert = m => { (window.__al = window.__al || []).push(String(m)); }; window.confirm = () => true; window.prompt = () => '1';
    try { combatActionAllowed = () => true; } catch (e) { } try { bonusActionAllowed = () => true; } catch (e) { }
    saveLocalStorage(true);
    const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
    d.characterLevel = LVL; d.levelScheme = 2; d.levelUpProgress = 0; d.perkPointsAvailable = 0;
    d.stats = ['10', '12', '16', '20', '18', '10'];
    d.skills = skillNames.map(n => ['Разрушение', 'Восстановление', 'Колдовство', 'Иллюзия', 'Изменение'].includes(n) ? String(SKILL) : '30');
    d.perkStates = {};
    // только перки «Двойное …» (усиленный каст), без перков на урон и цену
    ['Разрушение', 'Восстановление', 'Колдовство', 'Иллюзия', 'Изменение'].forEach(tree => {
      const si = skillNames.indexOf(tree); const pi = (fullPerksManifest[tree] || []).findIndex(x => /^Двойн/.test(x.name));
      if (si >= 0 && pi >= 0) d.perkStates[`skill${si}-perk${pi}-step1`] = true;
    });
    d.inventory = []; d.equippedSlots = {}; d.faithGod = 'none';
    applyCharacterData(d); updateAll(); saveLocalStorage(true);
    const list = [];
    Object.entries(spellsData).forEach(([school, tiers]) => TIERS.forEach(t => (tiers[t] || []).forEach(s => {
      try { learnSpellIntoBook(school, s.name); list.push({ school, tier: t, name: s.name, baseCost: s.baseCost }); } catch (e) { }
    })));
    updateAll();
    return list;
  }, [LVL, SKILL, TIERS]);
  await wait(500);
  const acts = await pl.evaluate(() => { window.renderAttackTargetSelect(); return Array.from(document.getElementById('attack-action-select').options).map(o => [o.value, o.text]); });
  const out = [];
  async function cast(act, enhanced) {
    const e0 = enemies().find(e => e.id === eid); if (!e0 || e0.curHp < 500000) await freshTarget();
    const before = enemies().find(e => e.id === eid);
    const hp0 = before.curHp, st0 = JSON.stringify(before.statuses || before.status || '');
    const r = await pl.evaluate(([eid, act, enhanced]) => {
      window.__al = [];
      document.getElementById('cur-mp').value = 99999; document.getElementById('max-mp').value = 99999;
      window.renderAttackTargetSelect();
      document.getElementById('attack-target-select').value = eid;
      const sel = document.getElementById('attack-action-select'); sel.value = act;
      if (sel.value !== act) return { err: 'no action' };
      document.getElementById('chk-enhanced-cast').checked = !!enhanced;
      for (let i = 0; i < 60; i++) {
        const mp0 = parseInt(document.getElementById('cur-mp').value) || 0;
        pendingPlayerAttack = null;
        window.rollPlayerAttack();
        const pa = pendingPlayerAttack;
        const cost = mp0 - (parseInt(document.getElementById('cur-mp').value) || 0);
        if (pa) { window.attackStepNext(); window.applyPlayerAttackDamage(); return { cost, dmg: pa.dmg, type: pa.dmgType, log: (pa.logText || '').slice(0, 260) }; }
        const b = document.getElementById('attack-step-btn'); if (b && b.style.display !== 'none') window.attackStepNext();
        document.getElementById('cur-mp').value = 99999;
        const al = (window.__al || []).filter(a => !/Урон применён/.test(a));
        if (al.length) return { err: al.slice(-1)[0].slice(0, 160) };
      }
      return { err: 'never hit' };
    }, [eid, act, enhanced]);
    if (r.err) return r;
    await wait(650);
    const e1 = enemies().find(e => e.id === eid);
    r.lost = hp0 - (e1 ? e1.curHp : 0);
    const st1 = JSON.stringify((e1 && (e1.statuses || e1.status)) || '');
    if (st1 !== st0) r.status = st1.slice(0, 160);
    return r;
  }
  for (const s of spells) {
    const a = acts.find(x => x[0].indexOf('spell:') === 0 && x[1].indexOf(s.name) !== -1) || acts.find(x => /^control:/.test(x[0]) && x[1].indexOf(s.name) !== -1);
    if (!a) { out.push(Object.assign({}, s, { attack: false })); continue; }
    await freshTarget(); // проклятия прошлых заклинаний (Хрупкость −15% физ. резиста) не должны влиять на следующие
    const row = Object.assign({}, s, { attack: true, act: a[0] });
    for (const enh of [false, true]) {
      const xs = []; let last = null;
      for (let i = 0; i < K; i++) { const r = await cast(a[0], enh); last = r; if (r.err) break; xs.push(r.lost); }
      row[enh ? 'enh' : 'base'] = { avg: xs.length ? Math.round(xs.reduce((p, c) => p + c, 0) / xs.length) : null, cost: last && last.cost, err: last && last.err, status: last && last.status, log: last && last.log };
    }
    console.error(s.school, s.tier, s.name, JSON.stringify(row.base), '|', JSON.stringify(row.enh).slice(0, 200));
    out.push(row);
  }
  const file = path.join(process.env.OUT || __dirname, 'out-balance-spells-l' + LVL + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('written', file, out.length);
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  await H.close();
})();
