const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  const out = await pl.evaluate(async () => {
    const o = {}; window.alert = () => {}; window.confirm = () => true;
    playerInventory.push({ itemId: 'Хлеб', name: 'Хлеб', count: 3, weight: 0.5, category: 'Готовые продукты', effect: '', price: 2 });
    daysWithoutFood = 2; updateDateDisplay();
    window.eatAnyFood('Хлеб');
    o.afterEat = daysWithoutFood;
    window.nextDay(); await new Promise(r => setTimeout(r, 300));
    o.afterNextDay = daysWithoutFood; o.pen = hungerRollPenalty();
    return o;
  });
  console.log(JSON.stringify(out));
  await H.close();
})();
