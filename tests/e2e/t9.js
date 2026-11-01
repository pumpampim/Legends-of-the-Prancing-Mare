const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  await S.gmGive(gm, 'Железный кинжал', 2, { stolen: true });
  await S.gmGive(gm, 'Железный кинжал', 3);
  await S.gmGive(gm, 'Стальной слиток', 3);
  await S.gmGive(gm, 'Стальной слиток', 2, { stolen: true });
  await wait(800);
  console.log(await pl.evaluate(() => JSON.stringify(playerInventory.map(i => [i.itemId, i.name, i.count, i.stolen]))));
  const st = H.store; for (const p in st) if (/players\//.test(p)) console.log(p, JSON.stringify((st[p].doc.inventory||st[p].doc.playerInventory||[]).map(i=>[i.name,i.count,i.stolen])));
  await H.close();
})();
