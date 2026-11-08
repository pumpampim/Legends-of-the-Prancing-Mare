// Поместье, этап 1: мастер создаёт участок и рисует стену, игрок заходит и ходит по нему (стену не пройти).
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await gm.evaluate(() => { document.getElementById('gm-estate-name').value = 'Озёрный дом'; gmEstateCreate(); });
  await wait(1200);
  const info = await gm.evaluate(() => document.getElementById('gm-estate-list').textContent);
  chk(/Озёрный дом/.test(info), 'участок не появился у мастера: ' + info);
  await pl.evaluate(() => { document.getElementById('tab17-btn').click(); });
  await wait(1200);
  const seen = await pl.evaluate(() => (document.getElementById('estate-box').textContent || ''));
  chk(/Войти в поместье/.test(seen), 'игрок не видит участок: ' + seen.slice(0, 120));
  await pl.evaluate(() => Estate.enter());
  await wait(1200);
  const t0 = await pl.evaluate(() => document.getElementById('estate-info').textContent);
  chk(/Ты на клетке/.test(t0), 'жителя не поставило: ' + t0);
  // ход: кликаем эмуляцией через Estate.click с координатами канваса
  const moved = await pl.evaluate(async () => {
    const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + 10 * 14 + 7, clientY: r.top + 12 * 14 + 7, bubbles: true }));
    await new Promise(res => setTimeout(res, 1200));
    return document.getElementById('estate-info').textContent;
  });
  chk(/10:12/.test(moved), 'ход не выполнен: ' + moved);
  // сплошная стена на x=12: за неё не пройти
  const blocked = await pl.evaluate(async () => {
    const id = Estate.__sel ? Estate.__sel() : Object.keys(CloudSync.getSessionData().estates)[0];
    const patch = {}; for (let y = 0; y < 50; y++) patch['estates.' + id + '.cells.12_' + y] = 'wall';
    await CloudSync.estateWrite(patch);
    await new Promise(res => setTimeout(res, 1200));
    const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + 20 * 14 + 7, clientY: r.top + 12 * 14 + 7, bubbles: true }));
    await new Promise(res => setTimeout(res, 800));
    return document.getElementById('estate-info').textContent;
  });
  chk(/не пройти/.test(blocked), 'через стену прошёл: ' + blocked);
  console.log(JSON.stringify({ info, moved, blocked }));
  fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
})();
