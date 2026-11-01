const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    const rec = (window.recipes || []).find(r => r.ingredients.length === 2);
    const ci = window.cookingIngredients || {};
    rec.ingredients.forEach(i => addToInventory(i.name, i.name, i.qty, 0.5, 'Сырые продукты', '', { price: 2 }));
    rec.ingredients.forEach(i => setPotQty(i.name, i.qty, i.qty));
    const sel = JSON.stringify(potSelections);
    // продаём / теряем по одному из первого ингредиента (стопка не исчезает целиком если qty>1)
    const first = rec.ingredients.find(i => i.qty > 1) || rec.ingredients[0];
    removeFromInventoryByName(first.name, first.qty > 1 ? first.qty - 1 : 1);
    renderKitchenPot();
    const before = rec.ingredients.map(i => i.name + ':' + countInInventory(i.name)).join(', ');
    cookFood();
    return { recipe: rec.name, need: JSON.stringify(rec.ingredients), sel, before, after: rec.ingredients.map(i => i.name + ':' + countInInventory(i.name)).join(', '),
      res: document.getElementById('kitchen-result').innerText, dishes: playerInventory.filter(i => i.category === 'Блюдо').map(i => i.name + ' x' + i.count) };
  });
  console.log(r);
  await H.close();
})();
