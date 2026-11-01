const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  await gm.evaluate(async () => { const idx = window.enemiesData.findIndex(e => e.name === 'Бандит'); const sel = document.getElementById('enemy-db-select'); if (sel.options.length < 2) populateEnemyDbSelect(); sel.value = String(idx); window.onEnemyDbPicked(); window.addEnemy(); });
  await wait(1500);
  for (const w of [360, 414]) {
    await pl.setViewportSize({ width: w, height: 700 }); await wait(800);
    const r = await pl.evaluate(() => { const b = document.querySelector('.nav-tabs .tab-link[onclick*="\'tab1\'"]'); b && b.click();
      const d = document.getElementById('combat-dock'); const c = document.querySelector('.container');
      window.scrollTo(0, 1e6);
      const btn = [...document.querySelectorAll('button')].find(x => /Следующий день/.test(x.textContent) && x.offsetParent);
      return { dockH: d.offsetHeight, var: document.body.style.getPropertyValue('--st-dock-h'), pad: getComputedStyle(c).paddingBottom, scrollH: document.documentElement.scrollHeight, inner: innerHeight, btnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null, dockTop: Math.round(d.getBoundingClientRect().top) }; });
    console.log(w, JSON.stringify(r));
  }
  await H.close();
})();
