// Святой круг паладина: чужая магическая стена в круге рассеивается; игрок в круге не задет ловушкой.
const S = require('./setup');
(async () => {
  const { gm, H } = await S.setupSession();
  const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  const r = await gm.evaluate(() => {
    const G = window.GridCore;
    const mk = () => {
      const grid = { w: 20, h: 20, cells: {}, tokens: {}, zones: {} };
      grid.tokens[G.tokenKey('p', 'p1')] = { x: 5, y: 5 };
      grid.zones.c = { spell: 'Круг дозорного', kind: 'area', follow: G.tokenKey('p', 'p1'), radiusFt: 10, who: 'none', holyBan: true, uid: 'p1' };
      grid.zones.w = { spell: 'Стена пламени', kind: 'wall', cells: [[6, 5], [7, 5], [12, 12]], uid: '', who: 'all', dmg: 50, dmgType: 'fire' };
      return grid;
    };
    const out = {};
    const t = window.GmGrid.zoneTick({ grid: mk(), participants: {}, enemies: [] }, []);
    out.wall = (t.grid.zones.w || {}).cells; out.logs = t.logs;
    out.inCircle = window.GmGrid.inHolyCircle(mk(), 'p1');
    const g2 = mk(); g2.tokens[G.tokenKey('p', 'p1')] = { x: 5, y: 5 }; g2.zones.c.radiusFt = 5; g2.tokens[G.tokenKey('p', 'p2')] = { x: 15, y: 15 };
    out.outside = window.GmGrid.inHolyCircle(g2, 'p2');
    return out;
  });
  chk(r.wall && r.wall.length === 1 && r.wall[0][0] === 12, 'клетки стены в круге должны сняться, дальняя остаться: ' + JSON.stringify(r.wall));
  chk(r.inCircle === true, 'игрок в круге'); chk(r.outside === false, 'игрок вне круга');
  console.log(JSON.stringify(r)); fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
})();
