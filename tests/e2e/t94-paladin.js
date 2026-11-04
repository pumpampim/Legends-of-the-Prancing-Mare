// Ветка паладина: перки за очки, бонусы, клятва и круг, падение/покаяние, несовместимость с лично и вампиризмом.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {}; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  const info = () => pl.evaluate(() => ({ righteous: plRighteous(), b: plBonus(), pts: perkPointsAvailable, vow: (playerPaladin || {}).vow, fallen: !!(playerPaladin || {}).fallen, god: document.getElementById('faith-god').value }));
  // подготовка: аэдра, уровень 45, 6 очков, 40 квестов жителей
  await pl.evaluate(() => {
    window.confirm = () => true; window.alert = m => { (window.__alerts = window.__alerts || []).push(String(m)); };
    document.getElementById('faith-god').value = 'kynareth'; lastFaithGod = 'kynareth';
    characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 6;
    playerQuests = []; for (let i = 0; i < 40; i++) playerQuests.push({ id: 'q' + i, title: 'q' + i, status: 'done', kind: 'resident' });
    equippedSlots.neck = null; updateAll();
  });
  out.start = await info();
  // порядок: нельзя 2 перк без 1
  await pl.evaluate(() => plTakePerk('p2')); out.noP1 = await info(); chk(out.noP1.pts === 6, 'p2 без p1 взят');
  await pl.evaluate(() => plTakePerk('p1')); out.p1 = await info(); chk(out.p1.pts === 5 && out.p1.righteous, 'p1 не взят');
  chk(out.p1.b.restCostCut === 10 && out.p1.b.buyMult === 0.95, 'бонусы p1');
  await pl.evaluate(() => plChooseVow('justice')); out.vow = await info(); chk(out.vow.vow === 'justice', 'клятва не принята');
  await pl.evaluate(() => plTakePerk('p2')); await pl.evaluate(() => plTakePerk('p3b')); await pl.evaluate(() => plTakePerk('p3a'));
  out.p3 = await pl.evaluate(() => ({ a: plHas('p3a'), b: plHas('p3b'), pts: perkPointsAvailable, bonus: plBonus() }));
  chk(out.p3.b && !out.p3.a, 'развилка 3: можно только одно'); chk(out.p3.bonus.hp === 100 && out.p3.bonus.magicRes === 20 && out.p3.bonus.healPct === 15, 'бонусы p2+p3b');
  await pl.evaluate(() => plTakePerk('p4')); out.p4 = await pl.evaluate(() => ({ r: plCircleRadius(), b: plBonus() }));
  chk(out.p4.r === 15 && out.p4.b.weaponPct === 5 && out.p4.b.healPct === 25, 'бонусы p4');
  // круг правосудия: броня +150 на 5 кругов, раз в день
  out.circle = await pl.evaluate(() => { const a0 = getActiveEffectBonuses().armor; plUseCircle(); const a1 = getActiveEffectBonuses().armor; plUseCircle(); return { a0, a1, n: activeTimedEffects.filter(e => e.plCircle).length, used: !!powersUsedToday.pl_circle }; });
  chk(out.circle.a1 - out.circle.a0 === 150 && out.circle.n === 1 && out.circle.used, 'круг правосудия: +150 брони раз в день');
  // возложение рук: срыв и успех
  out.hands = await pl.evaluate(() => {
    const hp = document.getElementById('cur-hp'), mx = document.getElementById('max-hp'); hp.value = 5;
    plLayOnHands(); const started = activeTimedEffects.some(e => e.plHands);
    hp.value = 3; plHandsTick(); const brokenDayBack = !powersUsedToday.pl_hands;
    activeTimedEffects = activeTimedEffects.filter(e => !e.plHands);
    hp.value = 5; plLayOnHands(); const e = activeTimedEffects.find(x => x.plHands); e.turnsRemaining = 0; plHandsTick();
    return { started, brokenDayBack, healed: parseInt(hp.value) === parseInt(mx.value) };
  });
  chk(out.hands.started && out.hands.brokenDayBack && out.hands.healed, 'возложение рук: срыв не тратит день, успех лечит полностью');
  // приостановка: вампиризм
  out.sus = await pl.evaluate(() => { playerSupernaturalState = Object.assign({}, playerSupernaturalState || {}, { vampirism: true }); const a = plRighteous(); playerSupernaturalState.vampirism = false; return { a, b: plRighteous() }; });
  chk(out.sus.a === false && out.sus.b === true, 'вампиризм приостанавливает, излечение возвращает');
  // падение: вера в даэдра
  await pl.evaluate(() => { document.getElementById('faith-god').value = 'azura'; updateAll(); }); out.fall = await info();
  chk(out.fall.fallen && !out.fall.righteous && out.fall.b.hp === 0, 'вера в даэдра: паладин пал, бонусы выключены');
  // покаяние: 1000 золота, один раз
  out.pen = await pl.evaluate(() => { document.getElementById('faith-god').value = 'kynareth'; document.getElementById('char-gold').value = 1500; plPenance(); const a = { fallen: playerPaladin.fallen, gold: parseInt(document.getElementById('char-gold').value) }; document.getElementById('faith-god').value = 'azura'; updateAll(); const again = !!playerPaladin.fallen; document.getElementById('faith-god').value = 'kynareth'; document.getElementById('char-gold').value = 5000; plPenance(); return { a, again, still: playerPaladin.fallen }; });
  chk(out.pen.a.fallen === false && out.pen.a.gold === 500 && out.pen.again && out.pen.still, 'покаяние один раз за 1000');
  // отказ: очки возвращаются
  out.abandon = await pl.evaluate(() => { const before = perkPointsAvailable; plAbandon(); return { before, after: perkPointsAvailable, ab: playerPaladin.abandoned, perks: plPerksTaken().length }; });
  chk(out.abandon.after - out.abandon.before === 4 && out.abandon.ab && out.abandon.perks === 0, 'отказ возвращает 4 очка');
  // сохранение и загрузка
  out.save = await pl.evaluate(() => { const d = stBuildSheet ? stBuildSheet() : JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6')); return { has: !!d.paladin, ab: d.paladin && d.paladin.abandoned }; });
  chk(out.save.has && out.save.ab, 'паладин сохраняется в листе');
  console.log(JSON.stringify(out)); console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
  process.exit(fails.length ? 1 : 0);
})();
