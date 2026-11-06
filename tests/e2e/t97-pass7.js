// Седьмой обход (2026-11-06): культист/паладин при оборотне, «Бездна», отказ от пути, подношения, метательное (силовая, подбор, мастер), опечатки.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code; const fails = []; const out = {};
  const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails.push(m); };
  await S.gmAddEnemy(gm, 'Бандит'); await wait(1500);
  const eid = H.store[sk].doc.enemies[0].id;
  await pl.evaluate(() => {
    window.confirm = () => true; window.__pr = []; window.prompt = () => (window.__pr.length ? window.__pr.shift() : '1'); window.alert = m => { (window.__al = window.__al || []).push(String(m)); };
    characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 20;
    playerQuests = []; for (let i = 0; i < 40; i++) playerQuests.push({ id: 'q' + i, title: 'q' + i, status: 'done', kind: 'resident' });
    document.getElementById('char-gold').value = 50000; updateAll();
  });
  // «Бездна»: +50% силы доходит до урона
  out.abyss = await pl.evaluate((eid) => {
    const sel = document.getElementById('faith-god'); sel.value = 'hermaeus'; onFaithGodChange(sel); updateAll();
    [0, 1, 2, 3].forEach(i => cuGrantPerk(i));
    learnSpellIntoBook('destr', 'Огненная стрела'); updateAll(); document.getElementById('cur-mp').value = 900;
    renderAttackTargetSelect(); renderAttackActionSelect();
    const act = Array.from(document.getElementById('attack-action-select').options).find(o => /Огненная стрела/.test(o.text)).value;
    for (let k = 0; k < 15; k++) {
      playerSupernaturalState.cult.weekUsed[3] = null; cuUse(3); updateAll(); combatMarks = {};
      document.getElementById('attack-target-select').value = eid; document.getElementById('attack-action-select').value = act; window.rollPlayerAttack();
      if (pendingPlayerAttack) return pendingPlayerAttack.logText;
    }
    return 'nohit';
  }, eid);
  chk(/\+55% от актив/.test(out.abyss) && /−0 маны/.test(out.abyss), '«Бездна»: бесплатно и +50% силы (' + String(out.abyss).slice(0, 90) + ')');
  // отказ от пути: на одно очко меньше и не чаще раза в 14 дней
  out.ab = await pl.evaluate(() => { const c = playerSupernaturalState.cult; c.swapDay = null; const p0 = perkPointsAvailable; cuAbandon(); const p1 = perkPointsAvailable;
    const sel = document.getElementById('faith-god'); sel.value = 'boethiah'; onFaithGodChange(sel); cuGrantPerk(0); const p2 = perkPointsAvailable; cuAbandon(); return { back: p1 - p0, again: perkPointsAvailable === p2, god: c.god }; });
  chk(out.ab.back === 3 && out.ab.again && out.ab.god === 'boethiah', 'отказ от пути: вернулось 3 из 4, второй отказ в тот же день не прошёл');
  // «Козни» до конца боя
  out.kozni = await pl.evaluate(async () => { powersUsedToday.cu2 = false; const c = playerSupernaturalState.cult; c.perks[1] = true; c.perks[2] = true; cuUse(2); const a = activeTimedEffects.some(e => e.cuCombatEnd); return a; });
  chk(out.kozni, '«Козни» висят, пока идёт бой');
  // подношение: виноград не вино; краденое — с дешёвого; выбор вещи
  out.offer = await pl.evaluate(() => {
    const c = playerSupernaturalState.cult; c.swapDay = null; c.perks = { 0: false, 1: false, 2: false, 3: false }; c.god = null; c.weekUsed = {};
    const sel = document.getElementById('faith-god'); sel.value = 'sanguine'; onFaithGodChange(sel); cuGrantPerk(0);
    addToInventory('Виноград джазби', 'Виноград джазби', 3, 0.1, 'Ингредиенты', '', {});
    c.lastOffer -= 5; const l0 = c.lastOffer; cuOffer(0); const grapes = c.lastOffer === l0;
    cuAdminOp({ op: 'reset' }); c.swapDay = null;
    sel.value = 'nocturnal'; onFaithGodChange(sel); cuGrantPerk(0);
    addToInventory('Золотое кольцо#stolen', 'Золотое кольцо', 1, 0.1, 'Украшения', '', { stolen: true, price: 2000 });
    addToInventory('Оловянная кружка#stolen', 'Оловянная кружка', 50, 0.1, 'Бытовые предметы', '', { stolen: true, price: 20 });
    c.lastOffer -= 5; cuOffer(0);
    const ring = playerInventory.some(i => i.name === 'Золотое кольцо'), cups = (playerInventory.find(i => i.name === 'Оловянная кружка') || {}).count || 0;
    cuAdminOp({ op: 'reset' }); c.swapDay = null;
    sel.value = 'malacath'; onFaithGodChange(sel); cuGrantPerk(0);
    addToInventory('Даэдрический меч', 'Даэдрический меч', 1, 16, 'Оружие', '', { weaponDmg: 20, price: 2500, slot: 'melee' });
    addToInventory('Железный кинжал', 'Железный кинжал', 1, 2, 'Оружие', '', { weaponDmg: 5, price: 10, slot: 'melee' });
    window.__pr = ['2']; c.lastOffer -= 5; cuOffer(0);
    return { grapes, ring, cups, sword: playerInventory.some(i => i.name === 'Даэдрический меч'), dagger: playerInventory.some(i => i.name === 'Железный кинжал') };
  });
  chk(out.offer.grapes, 'Сангвин: виноград не принимается за вино');
  chk(out.offer.ring && out.offer.cups < 50, 'Ноктюрнал: краденое списывается с дешёвого, кольцо осталось');
  chk(!out.offer.sword && out.offer.dagger, 'Малакат: игрок сам выбрал, что отдать (меч, №2)');
  // искупление от мастера непавшему — отказ
  out.pen = await pl.evaluate(() => { const c = playerSupernaturalState.cult; const g0 = document.getElementById('char-gold').value; cuAdminOp({ op: 'penance' }); return { used: c.penanceUsed, same: g0 === document.getElementById('char-gold').value }; });
  chk(!out.pen.used && out.pen.same, 'искупление непавшему не проходит и золото не списывается');
  // культист другого Принца становится оборотнем — падает, вера Хирсин
  out.wolf = await pl.evaluate(async () => {
    if (!playerSupernaturalState.werewolf) playerSupernaturalState.werewolf = { heartsEaten: 0, totem: '— нет —', hasTransformedToday: false, transformsToday: 0, isTransformed: false };
    if (!playerSupernaturalState.vampire) playerSupernaturalState.vampire = { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 };
    playerSupernaturalState.lycanthropy = true; lichAfterStateChange(); updateAll(); await new Promise(r => setTimeout(r, 200)); updateAll();
    const r = { faith: document.getElementById('faith-god').value, fallen: playerSupernaturalState.cult.fallen };
    playerSupernaturalState.lycanthropy = false; lichAfterStateChange(); updateAll(); return r;
  });
  chk(out.wolf.faith === 'hircine' && out.wolf.fallen, 'культист Малаката стал оборотнем: вера Хирсин, путь пал');
  // метательное: силовая не ставится, подбор после боя
  out.thr = await pl.evaluate((eid) => {
    const pouch = allItems.find(i => i.name === 'Подсумок на 4 зелья');
    addToInventory(pouch.name, pouch.name, 1, 2, pouch.category, pouch.effect, { slot: 'pouch', capacity: 4, type: 'pouch' }); equippedSlots.pouch = pouch.name;
    addToInventory('Стальный метательный нож', 'Стальный метательный нож', 6, 0.3, 'Метательное', '', { thrown: true, throwKind: 'knife', weaponDmg: 11, price: 6 });
    const renamed = playerInventory.some(i => i.name === 'Стальной метательный нож' && i.itemId === 'Стальной метательный нож');
    renderPouchPanel(); document.getElementById('pouch-load-select').value = 'Стальной метательный нож'; loadPouch();
    combatMarks = {}; renderAttackTargetSelect(); renderAttackActionSelect();
    document.getElementById('attack-target-select').value = eid; document.getElementById('attack-action-select').value = 'throw:0';
    document.getElementById('chk-power-attack').checked = true; window.rollPlayerAttack(); document.getElementById('chk-power-attack').checked = false;
    const power = combatMarks.power;
    const loose = thrownLoose.reduce((t, x) => t + x.qty, 0);
    window.__al = []; pickUpThrown(); const inFight = (window.__al || []).join(' ');
    return { renamed, bundle: (pouchContents[0] || {}).qty, power, loose, inFight };
  }, eid);
  chk(out.thr.renamed, 'старое имя «Стальный …» переводится в «Стальной …»');
  chk(out.thr.bundle === 5 && out.thr.power === undefined, 'бросок с галочкой «Силовая» не считается силовой');
  chk(out.thr.loose === 1 && /после боя/.test(out.thr.inFight), 'брошенный нож лежит на поле, в бою не подобрать');
  H.store[sk].doc.enemies.forEach(e => e.curHp = 0); // бой окончен
  await pl.evaluate(() => { const s = window.CloudSync.getSessionData(); (s.enemies || []).forEach(e => e.curHp = 0); });
  out.pick = await pl.evaluate(() => { pickUpThrown(); return { inv: (playerInventory.find(i => i.name === 'Стальной метательный нож') || {}).count || 0, loose: thrownLoose.length }; });
  chk(out.pick.inv === 1 && out.pick.loose === 0, 'после боя нож подобран в рюкзак');
  // мастер выдаёт метательное из базы
  await wait(2500); await S.gmGive(gm, 'Стальное метательное копьё', 2); await wait(4000);
  out.give = await pl.evaluate(() => { const it = playerInventory.find(i => i.name === 'Стальное метательное копьё'); return it ? { c: it.count, th: it.thrown, k: it.throwKind, d: it.weaponDmg } : null; });
  chk(out.give && out.give.c === 2 && out.give.th && out.give.k === 'spear' && out.give.d === 21, 'мастер выдал метательные копья из базы предметов');
  // «Помощь жителю» уходит мастеру на подтверждение
  out.q = await pl.evaluate(() => { playerQuests.push({ id: 'qr1', title: 'Помочь мельнику', status: 'active', kind: 'resident' }); markQuestDone('qr1'); return playerQuests.find(q => q.id === 'qr1').status; });
  chk(out.q === 'review', '«Помощь жителю» ждёт подтверждения мастера');
  console.log(fails.length ? 'HAS FAILS' : 'ALL OK');
  await H.close();
})();
