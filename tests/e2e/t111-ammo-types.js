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
  // Много прогонов генераторов: оружие и боеприпас всегда парой (лук+стрелы, арбалет+болты), с запасом, и в добыче оба.
  const pairs = await gm.evaluate(async () => {
    if (!window.__itemsLoaded) { loadGmItems(); await new Promise(r => setTimeout(r, 800)); window.__itemsLoaded = true; }
    const bad = []; let ranged = 0, xbow = 0, n = 0;
    const checkOne = (en, src) => {
      n++;
      const w = String(en.weaponNote || '');
      const isX = /арбалет|балист/i.test(w), isBow = /(^|[^а-яё])лук([^а-яё]|$)/i.test(w);
      const loot = gmWithQuiverLoot(en.corpseLoot || { items: [] }, en).items || [];
      const ammoInLoot = loot.filter(i => /(^|\s)(стрела|болт)(\s|$)/i.test(i.name) && !/^Свиток|\[|метательн/i.test(i.name));
      if (en.isRanged) {
        ranged++; if (isX) xbow++;
        if (!en.ammo || en.ammo.qty < 8) bad.push(src + ': стрелок без колчана — ' + w);
        else if (en.ammo.bolt !== isX || (!isX && !isBow)) bad.push(src + ': не та пара — ' + w + ' + ' + en.ammo.name);
        else if (!loot.some(i => i.name === w.split(' · ')[0].split(' (')[0].split(' + ')[0])) bad.push(src + ': в добыче нет оружия ' + w);
        else if (ammoInLoot.length !== 1 || ammoInLoot[0].name !== en.ammo.name) bad.push(src + ': в добыче не тот боеприпас ' + JSON.stringify(ammoInLoot));
      } else {
        if (en.ammo) bad.push(src + ': колчан у бойца ближнего боя');
        if (ammoInLoot.length) bad.push(src + ': стрелы без лука — ' + ammoInLoot.map(i => i.name).join(', '));
      }
    };
    for (const lvl of [1, 9, 20, 30, 45, 50]) {
      document.getElementById('bandit-avg-level').value = lvl;
      for (let i = 0; i < 150; i++) { generateBandit(); checkOne(gmLastBanditEnemy(), 'бандит ур.' + lvl); }
    }
    enemiesData.filter(e => EnemyGear.familyOf(e.name)).forEach(pick => {
      for (let i = 0; i < 40; i++) { const x = gmEnemyExtraFromDb(pick); checkOne(Object.assign({ name: pick.name }, x), pick.name); }
    });
    return { n, ranged, xbow, bad: bad.slice(0, 5), badN: bad.length };
  });
  check(pairs.badN === 0 && pairs.ranged > 100 && pairs.xbow > 5, `генераторы ${pairs.n} раз: стрелков ${pairs.ranged} (арбалетчиков ${pairs.xbow}), нарушений пары ${pairs.badN}` + (pairs.bad.length ? ': ' + pairs.bad.join(' | ') : ''));
  if (!ok) process.exitCode = 1;
  await H.close();
})();
