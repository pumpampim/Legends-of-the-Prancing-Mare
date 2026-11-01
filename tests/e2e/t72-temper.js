const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    const all = getAllSmithingRecipes();
    const w = all.find(r => r.name === 'Железный кинжал') || all.find(r => r.hasOwnProperty('damage') && !r.isAmmo && !r.perkHint);
    const a = all.find(r => r.slot === 'Шлема' && !r.perkHint) || all.find(r => r.resistance && !r.perkHint);
    const out = {};
    [w, a].forEach(rec => {
      if (!knownSmithingRecipes.includes(rec.name)) knownSmithingRecipes.push(rec.name);
      rec.ingredients.forEach(g => addToInventory(g.name, g.name, g.qty * 3, 1, 'Кузнечные ингредиенты', '', { price: 5 }));
      const known = getAllSmithingRecipes().filter(isSmithingRecipeKnown);
      craftSmithingItem(known.indexOf(rec));
      const it = playerInventory.find(i => i.name === rec.name);
      out[rec.name] = { effect: it && it.effect, magical: isMagicalGear(it) };
      // навык поднимем до 100, чтобы мешал только «магический» запрет
      const idx = skillNames.indexOf('Кузнечное дело'); document.getElementById('skill-' + idx).setAttribute('data-raw-val', 100); updateAll();
      renderTemperSelect(); document.getElementById('temper-item-select').value = it.itemId; temperItem();
      out[rec.name].temper = document.getElementById('temper-result').innerText;
    });
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await H.close();
})();
