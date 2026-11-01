const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const r = await pl.evaluate(() => {
    const out = {};
    (window.allItems || []).forEach(it => {
      if (!it.slot || !it.effect || !/^(melee|ranged)$/.test(it.slot)) return;
      String(it.effect).split(/\s*[,;]\s*|\.\s+(?=[А-ЯЁ«])/).forEach(raw => {
        const c = raw.trim(); if (!c) return;
        const lc = c.toLowerCase().replace(/ё/g, 'е');
        if (/(^|[^а-я])при([^а-я]|$)|в бою с|если|без полного|раз в|за кажд|шанс|на \d+ ход|уровн/.test(lc)) return;
        const g = parseGearEffects(c);
        if (g.any) return;
        const p = parsePlainEffectBonus(c); if (p) return;
        const pe = parsePercentEffects(c); if (pe.length) return;
        if (!/\d/.test(c)) return;
        (out[c] = out[c] || []).push(it.name);
      });
    });
    return out;
  });
  Object.keys(r).forEach(k => console.log(k, ' <= ', r[k].slice(0, 3).join(' | '), r[k].length > 3 ? '+' + (r[k].length - 3) : ''));
  await H.close();
})();
