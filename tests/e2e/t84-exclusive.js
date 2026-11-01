const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {};
  const st = () => pl.evaluate(() => ({ v: playerSupernaturalState.vampirism, lord: playerSupernaturalState.vampire.isLord, w: playerSupernaturalState.lycanthropy, god: document.getElementById('faith-god').value, rank: document.getElementById('faith-rank').value }));
  await gm.evaluate(() => { const sel = document.getElementById('inv-player-select'); sel.value = 'p1'; window.loadPlayerInventoryForGm(); });
  await wait(1500); gm.__confirms = [true, true, true];
  await gm.evaluate(() => { toggleSupernaturalFlag('vampirism', true); }); await wait(900);
  await gm.evaluate(() => { toggleVampireLord(true); }); await wait(1400);
  out.lord = await st();
  await gm.evaluate(() => { toggleSupernaturalFlag('lycanthropy', true); }); await wait(1500);
  out.toWolf = await st();
  await gm.evaluate(() => { toggleSupernaturalFlag('vampirism', true); }); await wait(1500);
  out.toVamp = await st();
  console.log(JSON.stringify(out)); console.log('issues', JSON.stringify(H.issues).slice(0,800));
  await H.close();
})();
