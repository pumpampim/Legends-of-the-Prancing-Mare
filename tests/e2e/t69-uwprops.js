const S = require('./setup');
(async () => {
  const { players, H } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    const all = (window.allItems || []).concat(window.uniqueWeaponsData || []);
    return all.filter(i => (i.slot === 'melee' || i.slot === 'ranged' || i.damage || i.dmg) && i.effect).map(i => {
      const o = uniqueWeaponHitProps({ name: i.name, effect: i.effect });
      return [i.name, i.effect, JSON.stringify(o)];
    });
  });
  r.forEach(x => console.log(x.join(' || ')));
  await H.close();
})();
