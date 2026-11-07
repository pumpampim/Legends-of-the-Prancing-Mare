// Ветка культиста: перки от мастера, дары (самоусиления и по врагам), подношения, падение/искупление, Метка, сохранение.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code; const out = {}; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  for (let i = 0; i < 3; i++) await S.gmAddEnemy(gm, 'Волк');
  await wait(1500);
  await pl.evaluate(() => {
    window.confirm = () => true; window.prompt = () => '1'; window.alert = m => { (window.__alerts = window.__alerts || []).push(String(m)); };
    document.getElementById('faith-god').value = 'boethiah'; lastFaithGod = 'boethiah';
    characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 12;
    playerQuests = []; for (let i = 0; i < 40; i++) playerQuests.push({ id: 'q' + i, title: 'q' + i, status: 'done', kind: 'resident' });
    document.getElementById('char-gold').value = 5000;
    document.getElementById('cur-hp').value = document.getElementById('max-hp').value;
    updateAll();
  });
  // данные: 16 Принцев × 4 перка
  out.data = await pl.evaluate(() => ({ n: Object.keys(CULT_GODS).length, perks: Object.values(CULT_GODS).every(g => g.perks.length === 4), offer: Object.values(CULT_GODS).every(g => g.offer && g.offer.opts.length) }));
  chk(out.data.n === 16 && out.data.perks && out.data.offer, '16 Принцев по 4 перка и подношением');
  // перки: порядок и очки
  out.noOrder = await pl.evaluate(() => { cuGrantPerk(1); return { has: cuBonus() && has1(), pts: perkPointsAvailable }; function has1() { return !!(playerSupernaturalState && playerSupernaturalState.cult && playerSupernaturalState.cult.perks[1]); } });
  chk(out.noOrder.pts === 12 && !out.noOrder.has, 'перк 2 без перка 1 не выдан');
  out.grant = await pl.evaluate(() => { cuGrantPerk(0); cuGrantPerk(1); cuGrantPerk(2); cuGrantPerk(3); const c = playerSupernaturalState.cult; return { god: c.god, perks: Object.keys(c.perks).length, pts: perkPointsAvailable, running: cuRunning(), buy: cuBuyMult() }; });
  chk(out.grant.god === 'boethiah' && out.grant.perks === 4 && out.grant.pts === 8 && out.grant.running, 'четыре перка Боэтии выданы, 4 очка списаны');
  chk(Math.abs(out.grant.buy - 1.1) < 1e-9, 'Метка: покупки +10%');
  chk(await pl.evaluate(() => Math.abs(cuSellBonus() - 0.9) < 1e-9), 'Метка: торговцы покупают у культиста на 10% дешевле');
  out.veil = await pl.evaluate(() => { cuAdminOp({ op: 'veil', on: true }); const a = [cuBuyMult(), cuSellBonus()]; cuAdminOp({ op: 'veil', on: false }); return a; });
  chk(out.veil[0] === 1 && out.veil[1] === 1, 'Покров скрывает Метку (цены обычные)');
  // самоусиление Боэтии: «Козни» +2 к кубам; «Предательский удар»
  out.kozni = await pl.evaluate(() => { const b0 = getSessionRollBonus(false).value; cuUse(2); const b1 = getSessionRollBonus(false).value; cuUse(2); return { b0, b1, used: !!powersUsedToday.cu2, effs: activeTimedEffects.filter(e => e.cuD20).length }; });
  chk(out.kozni.b1 - out.kozni.b0 === 2 && out.kozni.used && out.kozni.effs === 1, '«Козни»: +2 к кубам раз в день');
  out.betray = await pl.evaluate(() => { combatMarks = {}; cuUse(0); const e = activeTimedEffects.find(x => x.cuHitPct); const x = cuAttackExtras({ actionVal: 'melee', target: { curHp: 10, maxHp: 10 }, dmg: 100, sneak: false, invisUsed: false }); return { has: !!e, extra: x.extra.map(q => q.dmg), left: activeTimedEffects.some(x => x.cuHitPct), al: (window.__alerts || []).slice(-2) }; });
  chk(out.betray.has && out.betray.extra[0] === 50 && !out.betray.left, '«Предательский удар»: +50% урона один раз');
  out.sneak = await pl.evaluate(() => cuAttackExtras({ actionVal: 'melee', target: { curHp: 10, maxHp: 10 }, dmg: 100, sneak: true }).extra.map(q => q.dmg));
  chk(out.sneak[0] === 25, '«Клинок в спину»: скрытая атака +25%');
  // «Танец клинков» (неделя) и сброс действия при убийстве
  out.dance = await pl.evaluate(() => { combatMarks = {}; cuUse(3); function weekWord() { return JSON.stringify(playerSupernaturalState.cult.weekUsed); } const w = weekWord(); combatMarks.attack = 12345; cuOnKill(); return { w, mark: combatMarks.attack, al: (window.__alerts || []).slice(-2) }; });
  chk(out.dance.mark === null, '«Танец клинков»: после убийства действие возвращается');
  // подношение и просрочка
  out.offer = await pl.evaluate(() => { const g0 = parseInt(document.getElementById('char-gold').value); cuOffer(-1); return { g0, g1: parseInt(document.getElementById('char-gold').value), last: playerSupernaturalState.cult.lastOffer, abs: (parseInt(gameYear) || 0) * 360 + (parseInt(gameMonth) || 0) * 30 + (parseInt(gameDayNum) || 0) }; });
  chk(out.offer.g0 - out.offer.g1 === 900 && out.offer.last === out.offer.abs, 'подношение золотом L×20 принято');
  out.overdue = await pl.evaluate(() => { const c = playerSupernaturalState.cult; c.lastOffer -= 15; updateAll(); const a = cuRunning(); c.lastOffer -= 20; cuSync(); return { a, fallen: c.fallen }; });
  chk(out.overdue.a === false && out.overdue.fallen === true, 'просрочка отключает дары, два срока подряд — падение');
  out.fallBonus = await pl.evaluate(() => ({ b: cuBonus().sneakW, r: cuRunning() }));
  chk(out.fallBonus.b === 0 && !out.fallBonus.r, 'после падения пассивы не работают');
  out.penance = await pl.evaluate(() => { const g0 = parseInt(document.getElementById('char-gold').value); cuPenance(-1); const c = playerSupernaturalState.cult; return { g0, g1: parseInt(document.getElementById('char-gold').value), fallen: c.fallen, used: c.penanceUsed }; });
  chk(out.penance.fallen === false && out.penance.used && out.penance.g0 - out.penance.g1 === 1000 + 45 * 20 * 3, 'искупление: 1000 + подношение ×3');
  // нарушение запрета — ban / unban
  out.ban = await pl.evaluate(() => { document.getElementById('char-gold').value = 5000; cuAdminOp({ op: 'ban' }); const a = cuRunning(); cuOffer(-1); return { a, b: cuRunning() }; });
  chk(out.ban.a === false && out.ban.b === true, 'нарушение запрета отключает дары до подношения');
  await wait(1500);
  // подношение предметами (Мефала: паучьи яйца) и смена Принца
  out.swap = await pl.evaluate(() => {
    const c = playerSupernaturalState.cult; c.swapDay = null;
    const pts0 = perkPointsAvailable; const sel = document.getElementById('faith-god'); sel.value = 'mephala'; onFaithGodChange(sel);
    return { god: c.god, perks: Object.keys(c.perks).filter(k => c.perks[k]).length, back: perkPointsAvailable - pts0, faith: sel.value };
  });
  await wait(1800);
  chk(out.swap.perks === 0 && out.swap.back === 3, 'смена Принца: перки сгорели, вернулось на одно меньше (3 из 4)');
  out.reflow = await pl.evaluate(() => { const c = playerSupernaturalState.cult; cuGrantPerk(0); return { god: c.god, has0: !!c.perks[0] }; });
  chk(out.reflow.god === 'mephala' && out.reflow.has0, 'после смены мастер выдаёт перки нового Принца');
  out.swapCd = await pl.evaluate(() => { const sel = document.getElementById('faith-god'); sel.value = 'azura'; onFaithGodChange(sel); return sel.value; });
  chk(out.swapCd === 'mephala', 'вторая смена раньше срока запрещена');
  out.items = await pl.evaluate(() => { addToInventory('Паучье яйцо', 'Паучье яйцо', 3, 0.1, 'Ингредиенты для алхимии', '', {}); const before = playerInventory.filter(i => i.name === 'Паучье яйцо').reduce((t, i) => t + i.count, 0); playerSupernaturalState.cult.lastOffer -= 10; cuOffer(0); const after = playerInventory.filter(i => i.name === 'Паучье яйцо').reduce((t, i) => t + i.count, 0); return { before, after, last: playerSupernaturalState.cult.lastOffer }; });
  chk(out.items.before === 3 && out.items.after === 0, 'подношение предметами списывает яйца');
  // дары по врагам: Мефала — Паутина на выбранного врага
  const ids = H.store[sk].doc.enemies.map(e => e.id);
  out.web = await pl.evaluate(async (id) => {
    document.getElementById('char-gold').value = 5000; combatMarks = {}; const c = playerSupernaturalState.cult; cuGrantPerk(1); cuGrantPerk(2); cuGrantPerk(3);
    const sel = document.getElementById('attack-target-select'); if (!sel.querySelector('option[value="' + id + '"]')) { const o = document.createElement('option'); o.value = id; o.textContent = 'w'; sel.appendChild(o); }
    sel.value = id; powersUsedToday = {};
    for (let i = 0; i < 6; i++) { cuUse(0); if (powersUsedToday.cu0) break; }
    await new Promise(r => setTimeout(r, 1500));
    return { used: !!powersUsedToday.cu0, alerts: (window.__alerts || []).slice(-3) };
  }, ids[0]);
  await wait(800);
  const en0 = H.store[sk].doc.enemies[0];
  out.web.st = (en0.statusEffects || []).map(s => s.name);
  chk(out.web.used, '«Паутина» использована');

  // дары по врагу: Периайт — яд за круг, Молаг Бал — вытягивание, Мерунес — взрыв по цели (без сетки — по выбранной)
  const hpOf = i => H.store[sk].doc.enemies[i].curHp;
  const useOn = (god, idx, id) => pl.evaluate(async ([god, idx, id]) => {
    const c = playerSupernaturalState.cult; c.god = god; document.getElementById('faith-god').value = god; lastFaithGod = god;
    clearAll_(c); c.perks = { 0: true, 1: true, 2: true, 3: true }; c.fallen = false; c.banned = false; powersUsedToday = {}; activeTimedEffects = []; combatMarks = {};
    c.lastOffer = (parseInt(gameYear) || 0) * 360 + (parseInt(gameMonth) || 0) * 30 + (parseInt(gameDayNum) || 0);
    document.getElementById('cur-hp').value = 10; document.getElementById('char-gold').value = 99999;
    const sel = document.getElementById('attack-target-select'); if (!sel.querySelector('option[value="' + id + '"]')) { const o = document.createElement('option'); o.value = id; o.textContent = 'w'; sel.appendChild(o); }
    sel.value = id; cuUse(idx); await new Promise(r => setTimeout(r, 1500));
    return { hp: parseInt(document.getElementById('cur-hp').value), used: !!powersUsedToday['cu' + idx] || (c.weekUsed && c.weekUsed[idx] != null && c.weekUsed[idx] !== undefined), al: (window.__alerts || []).slice(-2) };
    function clearAll_(c) { c.weekUsed = {}; }
  }, [god, idx, id]);
  const hp0 = hpOf(1);
  out.mor = await useOn('peryite', 0, ids[1]); await wait(1000);
  const st1 = (H.store[sk].doc.enemies[1].statusEffects || []).map(x => x.name + ':' + (x.dotHp || ''));
  chk(out.mor.used && st1.some(x => /^Мор Периайт:\d+/.test(x)) && st1.some(x => /^Замедление/.test(x)), '«Мор»: яд-DoT и замедление на враге ' + JSON.stringify(st1));
  const hp1 = hpOf(2);
  out.drain = await useOn('molag', 0, ids[2]); await wait(1000);
  chk(out.drain.used && hpOf(2) < hp1 && out.drain.hp > 10, '«Господство»: враг теряет HP, игрок лечится ' + JSON.stringify([hp1, hpOf(2), out.drain.hp]));
  const hp2 = hpOf(0);
  out.boom = await useOn('mehrunes', 3, ids[0]); await wait(1000);
  chk(out.boom.used && hpOf(0) < hp2, '«Рассвет»: взрыв наносит урон цели ' + JSON.stringify([hp2, hpOf(0)]));
  // перегрузка панелей: все 16 Принцев рисуются без ошибок, все кнопки дара — без исключений
  out.panels = await pl.evaluate(() => {
    const errs = []; const c = playerSupernaturalState.cult;
    Object.keys(CULT_GODS).forEach(g => {
      try { c.god = g; document.getElementById('faith-god').value = g; c.perks = { 0: true, 1: true, 2: true, 3: true }; c.fallen = false; c.banned = false; c.lastOffer = (parseInt(gameYear) || 0) * 360 + (parseInt(gameMonth) || 0) * 30 + (parseInt(gameDayNum) || 0); const h = cuStatusHtml(); if (!h || h.indexOf(CULT_GODS[g].name) < 0) errs.push('panel ' + g); } catch (e) { errs.push(g + ': ' + e.message); }
    });
    return errs;
  });
  chk(out.panels.length === 0, 'панель культиста рисуется для всех Принцев: ' + JSON.stringify(out.panels));
  // самоусиления всех Принцев без цели: не падают
  out.selfAll = await pl.evaluate(() => {
    const errs = [], tried = []; const c = playerSupernaturalState.cult;
    Object.keys(CULT_GODS).forEach(g => {
      CULT_GODS[g].perks.forEach((p, i) => {
        if (!p.a || (!p.a.self && !p.a.sp && !p.a.cleanse && !p.a.ally && !p.a.heal) || p.a.t || p.a.ar) return;
        try {
          c.god = g; document.getElementById('faith-god').value = g; c.perks = { 0: true, 1: true, 2: true, 3: true }; c.fallen = false; c.banned = false; c.weekUsed = {}; powersUsedToday = {}; activeTimedEffects = [];
          c.lastOffer = (parseInt(gameYear) || 0) * 360 + (parseInt(gameMonth) || 0) * 30 + (parseInt(gameDayNum) || 0);
          document.getElementById('cur-hp').value = Math.floor(parseInt(document.getElementById('max-hp').value) / 5); document.getElementById('char-gold').value = 99999;
          combatMarks = {}; cuUse(i); tried.push(g + ':' + p.name + (p.type === 'passive' ? '' : (powersUsedToday['cu' + i] || (c.weekUsed && c.weekUsed[i] != null) ? ' ✔' : ' ✘')));
        } catch (e) { errs.push(g + ' ' + p.name + ': ' + e.message); }
      });
    });
    return { errs, tried };
  });
  chk(out.selfAll.errs.length === 0, 'самоусиления Принцев без исключений: ' + JSON.stringify(out.selfAll.errs));
  // сохранение: состояние культиста в листе
  out.save = await pl.evaluate(() => { const c = playerSupernaturalState.cult; const raw = JSON.stringify(playerSupernaturalState); return { has: raw.indexOf('"cult"') > 0, god: c.god }; });
  chk(out.save.has, 'cult лежит в supernaturalState');
  // мастер: панель культиста рисуется и команда выдачи доходит
  await gm.evaluate(async (uid) => { try { await window.selectInvPlayer && selectInvPlayer(uid); } catch (e) {} }, 'p1');
  await wait(800);
  out.gm = await gm.evaluate(() => { try { currentSupernaturalState = Object.assign({ lycanthropy: false, vampirism: false, lich: null }, { cult: { god: 'azura', perks: { 0: true }, fallen: false, banned: false, veil: false } }); const b = window.gmCultPanelHtml(currentSupernaturalState); return b.indexOf('Путь культиста') > 0 && b.indexOf('Азура') > 0 && typeof window.gmCultGrant === 'function'; } catch (e) { return 'ERR ' + e.message; } });
  chk(out.gm === true, 'панель мастера рисует культиста: ' + out.gm);
  console.log(JSON.stringify(out)); console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
  process.exit(fails.length ? 1 : 0);
})();
