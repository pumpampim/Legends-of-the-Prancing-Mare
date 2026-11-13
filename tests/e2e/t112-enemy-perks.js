// 2026-11-13: перки врагов по уровню (enemy-perks.js, полная сила) и броня драугров без «Древней брони теней».
const S = require('./setup');
(async () => {
  const { gm, code, H, wait } = await S.setupSession();
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const sk = 'sessions/' + code;
  const r = await gm.evaluate(async () => {
    if (!window.__itemsLoaded) { loadGmItems(); await new Promise(r => setTimeout(r, 800)); window.__itemsLoaded = true; }
    const out = { shadow: [], draugrPerks: 0, forsworn: [], bandits: [], mage: '' };
    enemiesData.filter(e => EnemyGear.familyOf(e.name) === 'draugr').forEach(e => { for (let i = 0; i < 60; i++) { const x = gmEnemyExtraFromDb(e); (x.equip.worn || []).forEach(n => { if (/теней/i.test(n)) out.shadow.push(n); }); if ((x.perks || []).length) out.draugrPerks++; } });
    const iz = enemiesData.find(e => e.name === 'Изгой вересковое сердце');
    for (let i = 0; i < 20; i++) out.forsworn.push((gmEnemyExtraFromDb(iz).perks || []).map(g => g.name + ' ' + g.rank).join(', '));
    document.getElementById('bandit-avg-level').value = 30;
    for (let i = 0; i < 120; i++) { generateBandit(); const b = gmLastBanditEnemy(); out.bandits.push({ n: (b.perks || []).reduce((a, g) => a + g.rank, 0), pts: EnemyPerks.pointsOf(b.level), atk: b.perkAtk || 0, ranged: b.isRanged, html: /🎖 Перки: /.test(document.getElementById('bandit-gen-result').innerHTML), auto: (b.perks || []).some(g => g.auto) }); }
    document.getElementById('bandit-mage-avg-level').value = 40; generateMageBandit(); out.mage = document.getElementById('bandit-mage-gen-result').textContent;
    return out;
  });
  check(r.shadow.length === 0, 'драугры не носят броню теней (' + (r.shadow[0] || 'ни разу') + ')');
  check(r.draugrPerks === 0, 'у драугров перков нет (не просили)');
  check(r.forsworn.every(x => /Сильная рука|Варвар|Избыточное натяжение/.test(x)) && r.forsworn.some(x => /Усиленный мороз/.test(x)), 'изгой вересковое сердце (ур. 15): перк оружия и «Усиленный мороз» — ' + r.forsworn[0]);
  check(r.bandits.every(b => b.n >= 4 && b.n <= b.pts && b.html && b.auto), 'бандиты 30 ур.: потрачено 4+ очков перков (не больше 1 + ур./5), видны в генераторе, числовые учтены — пример ' + JSON.stringify(r.bandits[0]));
  check(r.bandits.filter(b => b.ranged).every(b => b.atk >= 1), 'лучники 30+ ур. с «Твёрдой рукой» (+1 к броску)');
  check(/Перки: .*Усиленн/.test(r.mage) && !/Сильная рука/.test(r.mage), 'маг-бандит 40 ур. с перками разрушения: ' + (r.mage.match(/Перки:.*?(?=Заклинания)/) || [''])[0].slice(0, 160));
  // вампир из базы: перки, урон холода +50%, карточка
  await S.gmAddEnemy(gm, 'Вампир хозяин ночи'); await wait(800);
  const v = H.store[sk].doc.enemies[0];
  const base = await gm.evaluate(() => enemiesData.find(e => e.name === 'Вампир хозяин ночи').spells.find(s => s.name === 'Ледяной шип').dmg);
  const ice = v.spells.find(s => s.name === 'Ледяной шип');
  check(v.perks.some(g => g.name === 'Трупное проклятье') && v.perks.some(g => g.name === 'Усиленный мороз' && g.rank === 2), 'вампир хозяин ночи: ' + v.perks.map(g => g.name).join(', '));
  check(ice.dmg === Math.round(base * 1.5), 'Ледяной шип вампира с «Усиленным морозом 2/2»: ' + base + ' → ' + ice.dmg);
  const card = await gm.evaluate(id => document.querySelector('[data-enemy-id="' + id + '"]').innerText, v.id);
  check(/Перки:[\s\S]*Трупное проклятье/.test(card), 'перки видны на карточке врага');
  if (!ok) process.exitCode = 1;
  await H.close();
})();
