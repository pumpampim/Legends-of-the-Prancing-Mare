const S = require('./setup');
(async () => {
  const { players, H } = await S.setupSession({});
  const [p1] = players;
  console.log(await p1.evaluate(() => {
    const out = [];
    const tick = (name, st) => skillNames.forEach((tree, sIdx) => (fullPerksManifest[tree] || []).forEach((p, pIdx) => { if (p.name === name) { const c = document.getElementById(`perk-${sIdx}-${pIdx}-${st}`); if (c) c.checked = true; } }));
    tick('Призыватель', 1); out.push(window.getSummonRangeFt('daedra') + '/' + window.getSummonRangeFt('skeleton'));
    tick('Призыватель', 2); out.push(window.getSummonRangeFt('atronach') + '/' + window.getSummonRangeFt('skeleton'));
    tick('Усиление связи', 1); out.push(window.getSummonRangeFt('corpse') + '/' + window.getSummonRangeFt('skeleton'));
    return out.join(' ');
  }));
  await H.close();
})();
