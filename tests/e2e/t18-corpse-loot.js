// Обыск трупа мастером: добыча убийце (живому), выбор мастера, павшим — никогда.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({ players: [
    { uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    { uid: 'p2', name: 'Лидия', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [p1, p2] = players; const sk = 'sessions/' + code;
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  for (const p of players) await p.evaluate(() => { window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true; creationState.done = true; characterLevel = 30; updateAll(); saveLocalStorage(true); });
  gm.on('dialog', () => {});
  await gm.evaluate(() => { window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true; });
  for (let i = 0; i < 4; i++) await S.gmAddEnemy(gm, 'Бандит');
  await wait(1500);
  const doc = () => H.store[sk].doc;
  const ids = doc().enemies.map(e => e.id);
  const setEn = async (fn) => { const en = doc().enemies.map(fn); await gm.evaluate(([c, en]) => firebase.firestore().collection('sessions').doc(c).update({ enemies: en }), [code, en]); await wait(1200); };
  const gold = uid => parseInt(H.store['characters/' + uid].doc.gold) || 0;
  const corpseLoot = id => doc().enemies.find(e => e.id === id).corpseLoot;
  // у всех бандитов гарантированное золото
  await setEn(e => Object.assign({}, e, { curHp: 1, corpseLoot: { gold: 50, items: [{ name: 'Хлеб', qty: 1, weight: 0.5, category: 'Еда' }] } }));
  const card = (id) => gm.evaluate((id) => { const c = Array.from(document.querySelectorAll('#gm-enemies-list select')).find(s => (s.getAttribute('onchange') || '').indexOf('gmSetCorpseLootTo(\'' + id) !== -1); return c ? Array.from(c.options).map(o => (o.selected ? '*' : '') + o.text) : null; }, id);
  const loot = (id) => gm.evaluate(async (id) => { window.__al = []; lootCorpse(id); await new Promise(r => setTimeout(r, 1500)); return window.__al.slice(); }, id);

  // 1. p2 добивает бандита 0 — добыча p2, хотя p1 первый
  await S.plAttack(p2, ids[0], 'melee', { tries: 12 }); await wait(1500);
  check(doc().enemies[0].curHp <= 0 && doc().enemies[0].killedBy === 'p2', 'killedBy=p2: ' + doc().enemies[0].killedBy);
  console.log('  селектор', JSON.stringify(await card(ids[0])));
  let g1 = gold('p1'), g2 = gold('p2');
  console.log('  ', JSON.stringify(await loot(ids[0])));
  check(gold('p2') === g2 + 50 && gold('p1') === g1, 'добыча убийце p2: p1 ' + g1 + '→' + gold('p1') + ', p2 ' + g2 + '→' + gold('p2'));

  // 2. мастер выбирает p1 для бандита 1 (добил p2)
  await S.plAttack(p2, ids[1], 'melee', { tries: 12 }); await wait(1500);
  await gm.evaluate((id) => gmSetCorpseLootTo(id, 'p1'), ids[1]);
  g1 = gold('p1'); g2 = gold('p2');
  await loot(ids[1]);
  check(gold('p1') === g1 + 50 && gold('p2') === g2, 'выбор мастера p1: p1 ' + g1 + '→' + gold('p1'));

  // 3. p2 ранил, добил мастер массовым уроном → p2 (последний ранивший)
  await setEn(e => e.id === ids[2] ? Object.assign({}, e, { curHp: 500 }) : e);
  await S.plAttack(p2, ids[2], 'melee', { tries: 12 }); await wait(1500);
  check(doc().enemies[2].lastHitBy === 'p2' && doc().enemies[2].curHp > 0, 'lastHitBy=p2, жив');
  await setEn(e => e.id === ids[2] ? Object.assign({}, e, { curHp: 0 }) : e);
  // 4. p2 пал — добыча живому p1
  await p2.evaluate(() => { document.getElementById('cur-hp').value = 0; checkDeath(); updateAll(); saveLocalStorage(true); }); await wait(3000);
  check(doc().participants.p2.fallen === true, 'p2 пал в сессии');
  console.log('  селектор', JSON.stringify(await card(ids[2])));
  check(!(await card(ids[2])).some(t => /Лидия/.test(t)), 'павшей нет в списке');
  g1 = gold('p1'); g2 = gold('p2');
  await loot(ids[2]);
  check(gold('p1') === g1 + 50 && gold('p2') === g2, 'убийца пал → живому p1');
  // павший сам обыскать не может
  const selfLoot = await p2.evaluate(async (id) => { try { await window.CloudSync.lootCorpseForSelf(id); return 'взял'; } catch (e) { return e.message; } }, ids[3]);
  await setEn(e => e.id === ids[3] ? Object.assign({}, e, { curHp: 0 }) : e);
  const selfLoot2 = await p2.evaluate(async (id) => { try { await window.CloudSync.lootCorpseForSelf(id); return 'взял'; } catch (e) { return e.message; } }, ids[3]);
  check(/Павший/.test(selfLoot2), 'павший игрок не обыскивает сам: ' + selfLoot2);
  // 5. пали все — отдать некому
  await p1.evaluate(() => { document.getElementById('cur-hp').value = 0; checkDeath(); updateAll(); saveLocalStorage(true); }); await wait(3000);
  g1 = gold('p1'); g2 = gold('p2');
  const al = await loot(ids[3]);
  check(gold('p1') === g1 && gold('p2') === g2 && corpseLoot(ids[3]), 'все пали — никому: ' + JSON.stringify(al));
  const gen = await gm.evaluate(() => { return Array.from(document.getElementById('loot-gen-target-player').options).map(o => o.value + '=' + o.text); });
  check(gen.length === 1 && gen[0] === '=Все игроки пали', 'генератор лута без павших: ' + JSON.stringify(gen));
  console.log('log', JSON.stringify(doc().combatLog.filter(x => /труп/.test(x.text)).map(x => x.text)));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
