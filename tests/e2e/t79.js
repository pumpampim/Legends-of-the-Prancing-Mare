const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  await S.gmAddEnemy(gm, 'Бандит'); await wait(800);
  const t0 = Date.now();
  const r = await Promise.race([gm.evaluate(async () => {
    gmEnemySelectAll(true);
    document.getElementById('gm-bulk-n').value = 5;
    window.gmBulkDamage();
    await new Promise(r => setTimeout(r, 1500));
    return 'called';
  }), wait(15000).then(() => 'TIMEOUT')]);
  const sk=Object.keys(H.store).find(k=>k.startsWith('sessions/')); console.log('enemies', JSON.stringify((H.store[sk].doc.enemies||[]).map(e=>e.curHp+'/'+e.maxHp)));
  console.log('after damage', r, Date.now() - t0, JSON.stringify(H.issues.slice(0,5)));
  const r2 = await Promise.race([gm.evaluate(() => { window.gmBulkStatus(); return 'ok'; }), wait(15000).then(() => 'TIMEOUT2')]);
  console.log('status', r2);
  await H.close(); process.exit(0);
})();
