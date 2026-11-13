// 2026-11-13: (1) список типов врагов пустой — в кэше браузера старый gm.html без #enemy-type-select:
// populateEnemyDbSelect создаёт список сам. (2) Колчан стрелков: выстрел тратит стрелу/болт, пустой колчан —
// удар вблизи, остаток — в добычу с трупа; у лучников-бандитов стрелы под материал лука, есть арбалетчики.
const S = require('./setup');
(async () => {
  const { gm, code, H, wait } = await S.setupSession();
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const sk = 'sessions/' + code;
  // (1) старый gm.html: списка типов нет
  const t = await gm.evaluate(() => {
    const ts = document.getElementById('enemy-type-select'); ts.remove();
    populateEnemyDbSelect();
    const n = document.getElementById('enemy-type-select');
    if (!n) return { none: true };
    n.value = n.options[1].value; n.dispatchEvent(new Event('change'));
    return { types: n.options.length, list: document.getElementById('enemy-db-select').options.length };
  });
  check(!t.none && t.types > 5, 'список типов создан заново: ' + t.types + ' вариантов');
  check(t.list > 1, 'после выбора типа список врагов заполнен: ' + t.list);
  // (2) колчан фалмера-лучника
  await S.gmAddEnemy(gm, 'Фалмер (лучник)');
  await wait(800);
  let f = H.store[sk].doc.enemies[0];
  check(f.ammo && f.ammo.name === 'Фалмерская стрела' && f.ammo.qty === 12, 'у фалмера-лучника колчан: ' + JSON.stringify(f.ammo));
  await S.gmAttack(gm, f.id, 'p1', 'weapon', { once: true, applyMiss: true });
  await wait(800);
  f = H.store[sk].doc.enemies[0];
  check(f.ammo.qty === 11, 'выстрел потратил стрелу: осталось ' + f.ammo.qty);
  await gm.evaluate(id => setEnemyAmmo(id, 0), f.id); await wait(800);
  const r = await S.gmAttack(gm, f.id, 'p1', 'weapon', { once: true, applyMiss: true });
  check(/кончились/.test(r[0].t) && /СИЛ/.test(r[0].t + (r[0].hit ? '' : ' СИЛ')), 'пустой колчан — удар вблизи: ' + r[0].t.slice(0, 120));
  await gm.evaluate(id => setEnemyAmmo(id, 5), f.id); await wait(800);
  const loot = await gm.evaluate(e => gmWithQuiverLoot({ gold: 3, items: [{ name: 'Фалмерская стрела', qty: 7 }, { name: 'Ухо фалмера' }] }, e), H.store[sk].doc.enemies[0]);
  const arr = loot.items.filter(i => i.name === 'Фалмерская стрела');
  check(arr.length === 1 && arr[0].qty === 5 && /Стрел/.test(arr[0].category), 'в добыче остаток колчана (5), без второго колчана: ' + JSON.stringify(loot.items));
  // бандиты-стрелки
  const bs = await gm.evaluate(() => {
    const out = []; document.getElementById('bandit-avg-level').value = 50;
    for (let i = 0; i < 400; i++) { generateBandit(); const t = document.getElementById('bandit-gen-result').innerText; if (/· (Лук|Арбалет): /.test(t)) out.push(t); }
    return out;
  });
  const noQuiver = bs.filter(t => !/Колчан: \S/.test(t));
  check(bs.length > 20 && noQuiver.length === 0, 'у каждого бандита-стрелка есть колчан (' + bs.length + ' стрелков)' + (noQuiver[0] ? ': ' + noQuiver[0].slice(0, 200) : ''));
  check(bs.some(t => /Арбалет/.test(t) && /болт/.test(t)), 'бывают арбалетчики с болтами');
  check(!bs.some(t => /, Стрела(,|$)/.test(t)), 'безымянной «Стрелы» в добыче больше нет');
  if (!ok) process.exitCode = 1;
  await H.close();
})();
