const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {};
  await pl.evaluate(() => { playerSupernaturalState = { lycanthropy: false, vampirism: false, werewolf: {}, vampire: {}, lich: Object.assign(window.lichDefault(), { perks: { pact: true, bearer: true, herald: true, visage: true }, stage: 2 }) }; _lichSig=''; lichAfterStateChange(); renderSupernaturalStatusPlayer(); });
  await wait(500);
  out.has = await pl.evaluate(() => ({ eff: (activeTimedEffects||[]).some(e => e && e.lichDeath), txt: document.body.innerText.includes('Аура смерти') }));
  await pl.evaluate(() => { window.combatActionAllowed = () => true; document.getElementById('cur-mp').value = 500; lichMask('illusion'); });
  out.mask = await pl.evaluate(() => ({ eff: (activeTimedEffects||[]).some(e => e && e.lichDeath) }));
  await pl.evaluate(() => { lichMask(''); renderSupernaturalStatusPlayer(); });
  out.unmask = await pl.evaluate(() => ({ eff: (activeTimedEffects||[]).some(e => e && e.lichDeath) }));
  out.tick = await gm.evaluate(() => {
    const G = window.GridCore || window.GG;
    const e = { id: 'e1', name: 'Бандит', curHp: 100, maxHp: 100, resist: {} };
    const grid = { w: 20, h: 20, cells: {}, tokens: {}, zones: {} };
    grid.tokens[G.tokenKey('e', 'e1')] = { x: 8, y: 5 };
    grid.tokens[G.tokenKey('p', 'p1')] = { x: 5, y: 5 };
    grid.zones.z1 = { spell: 'Аура смерти', kind: 'aura', follow: G.tokenKey('p', 'p1'), radiusFt: 20, who: 'enemies', vuln: 5, dmg: 0, uid: 'p1', effId: 'x' };
    const r = window.GmGrid.zoneTick({ grid, participants: { p1: { name: 'Б' } }, enemies: [e] }, [e]);
    const pv = window.StCombat.previewDamage(r.enemies[0], 100, 'fire', 0);
    return { st: r.enemies[0].statusEffects, fire: pv.finalDmg, logs: r.logs };
  });
  console.log(JSON.stringify(out)); console.log('issues', JSON.stringify(H.issues).slice(0,800)); await H.close();
})();
