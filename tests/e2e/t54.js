const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(() => {
    const o = { nullSheath: [], kinds: {} };
    (window.allItems || []).forEach(i => {
      const isW = i.slot === 'melee' || i.slot === 'ranged' || typeof i.weaponDmg === 'number' || typeof i.dmg === 'number' || /оруж|Лук|Арбалет|меч|топор/i.test(i.category || '');
      if (!isW || i.slot === 'shield') return;
      let k; try { k = weaponSheathKind(Object.assign({}, i)); } catch (e) { k = 'ERR'; }
      o.kinds[k] = (o.kinds[k] || 0) + 1;
      if (!k && !isKastetItem(i)) o.nullSheath.push(i.name + ' [' + (i.weaponType || '') + '|' + i.category + ']');
    });
    return o;
  });
  console.log(JSON.stringify(out.kinds)); console.log(out.nullSheath.length, out.nullSheath.slice(0, 60).join('\n'));
  await H.close();
})();
