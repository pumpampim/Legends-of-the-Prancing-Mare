const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code; const out = {};
  await S.gmAddEnemy(gm, 'Бандит'); await wait(1500);
  await pl.evaluate(() => { window.__sess = null; });
  out.r = await pl.evaluate(() => {
    const base = window.CloudSync.getSessionData;
    const run = (taken) => { window.CloudSync.getSessionData = () => ({ sessionTurnCounter: 1, enemies: [{ id: 'x1', name: 'Бандит', isRaisable: true, curHp: 0, maxHp: 50, diedAtTurn: 0, soulTaken: taken }] }); return [snRaisableCorpses().length, snLordCorpses().length]; };
    const r = { free: run(false), taken: run(true) };
    window.CloudSync.getSessionData = base; return r;
  });
  console.log(JSON.stringify(out)); await H.close();
})();
