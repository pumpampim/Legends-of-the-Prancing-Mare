const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {};
  out.unit = await pl.evaluate(() => {
    const d1 = improvisedDish({ 'Морковь': 2, 'Картофель': 1 });         // сырое: 1+1+1 → 3 → 4
    const d2 = improvisedDish({ 'Лаванда': 2, 'Лунный сахар': 1 });      // алхимия: ceil .6*2=1 ×2 + 30 → cap
    const d3 = improvisedDish({ 'Капуста': 1, 'Картофель': 1 });
    return { d1, d2, d3, caps: [COOK_IMPROV.hpCap, COOK_IMPROV.mpCap], fail: COOKING_FAIL_PROGRESS, alchLav: (window.alchemyIngredients || {})['Лаванда'] && window.alchemyIngredients['Лаванда'].effects };
  });
  // готовка по рецепту и провал
  out.cook = await pl.evaluate(async () => {
    window.alert = () => {}; window.confirm = () => true;
    const give = (n, q) => { const ing = cookingIngredients[n]; addToInventory(n, n, q, ing.weight || 0.1, ing.category, '', { price: ing.price || 1 }); };
    ['Соль', 'Картофель', 'Лук-порей', 'Капуста', 'Морковь', 'Тыква'].forEach(n => give(n, 12));
    const idx = skillNames.indexOf('Кулинария');
    document.getElementById('skill-' + idx).setAttribute('data-raw-val', 30);
    const read = () => skillProgress[idx] || 0;
    const before = read();
    // рецепт «Капустный суп с картошкой»: Соль 2, Картофель 3, Лук-порей 2, Капуста 2
    potSelections = { 'Соль': 2, 'Картофель': 3, 'Лук-порей': 2, 'Капуста': 2 };
    cookFood();
    const dish = playerInventory.find(i => /Капустный суп/.test(i.name));
    const afterOk = read();
    // провал: нераспознанный состав
    potSelections = { 'Морковь': 1, 'Тыква': 1 };
    cookFood();
    const afterFail = read();
    return { dishEffect: dish && dish.effect, okGain: Math.round((afterOk - before) * 100) / 100, failGain: Math.round((afterFail - afterOk) * 100) / 100, res: document.getElementById('kitchen-result').innerText.slice(0, 160) };
  });
  console.log(JSON.stringify(out, null, 1)); console.log('issues', JSON.stringify(H.issues).slice(0, 600));
  await H.close();
})();
