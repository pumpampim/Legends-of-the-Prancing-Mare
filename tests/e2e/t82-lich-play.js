const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code; const out = {};
  await S.gmAddEnemy(gm, 'Бандит'); await wait(1500);
  const en = () => H.store[sk].doc.enemies;
  const eid = en()[0].id;
  await pl.evaluate(() => {
    characterLevel = 60; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100));
    playerSupernaturalState = { lycanthropy: false, vampirism: false, werewolf: {}, vampire: {}, lich: Object.assign(window.lichDefault(), { perks: { pact: true, bearer: true, herald: true, visage: true }, stage: 1 }) };
    _lichSig = ''; lichAfterStateChange(); updateAll();
    window.__al = []; window.alert = m => window.__al.push(String(m)); window.confirm = () => true;
    document.getElementById('cur-mp').value = 999; document.getElementById('max-mp').value = 999;
  });
  const acts = await pl.evaluate(() => { window.renderAttackTargetSelect(); return Array.from(document.getElementById('attack-action-select').options).map(o => o.value + '=' + o.text); });
  out.acts = acts.filter(a => /морозн|ледян|Некро/i.test(a));
  const act = (acts.find(x => /Огненный шар ледяного/.test(x)) || '').split('=')[0];
  const hp0 = en()[0].curHp;
  const rr = await S.plAttack(pl, eid, act, { tries: 12 }); const last = rr[rr.length - 1];
  await wait(1200);
  out.fireball = { hit: last.hit, dmg: last.dmg, type: last.dmgType, prev: last.prev, hpLost: hp0 - en()[0].curHp, resist: en()[0].resist };
  const act2 = (acts.find(x => /Ледяное испепеление/.test(x)) || '').split('=')[0];
  const hp1 = en()[0].curHp;
  const r2 = await S.plAttack(pl, eid, act2, { tries: 12 }); const l2 = r2[r2.length - 1]; await wait(1200);
  out.incin = { dmg: l2.dmg, type: l2.dmgType, prev: l2.prev, hpLost: hp1 - en()[0].curHp };
  // состояние
  out.state = await pl.evaluate(() => {
    const r = computeTotalResistances();
    return { stage: lichStage(), manaBonus: lichManaBonus(), res: r, maxMp: document.getElementById('max-mp').value };
  });
  // окаменение: тик хода не снимает, тик круга снимает
  out.petrify = await pl.evaluate(() => {
    powersUsedToday = powersUsedToday || {}; try { combatActionAllowed = () => true; } catch (e) {}
    lichPetrify();
    const e = () => (activeTimedEffects || []).find(x => x && x.powerFlag === 'petrify');
    const a = e() && e().turnsRemaining;
    localTurnTick(false); const b = e() && e().turnsRemaining;
    localTurnTick(true); const c = e() && e().turnsRemaining;
    return { a, afterTurn: b, afterRound: c, al: window.__al.slice(-2) };
  });
  // воскрешение, ослабление, день
  out.res = await pl.evaluate(() => {
    document.getElementById('cur-hp').value = 0; const ok = lichTryResurrect();
    const l = snLich(); const s1 = { ok, w: l.weakened, r: l.resReady, hp: document.getElementById('cur-hp').value, pen: lichWeakenedPenalty() };
    lichDayTick(); const s2 = { w: l.weakened, d: l.daysSinceRes };
    for (let i = 0; i < 6; i++) lichDayTick();
    return { s1, s2, ready: l.resReady };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('issues', JSON.stringify(H.issues).slice(0, 3000));
  await H.close();
})();
