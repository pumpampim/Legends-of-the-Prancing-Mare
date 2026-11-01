const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  console.log('code', code, gm.__dialogs, JSON.stringify(H.issues).slice(0,800));
  const S = () => H.store['sessions/' + code].doc;
  // GM: type list + stables in Вайтран, dog seller in Вайтран (should refuse), dog seller in Предел
  const types = await gm.evaluate(() => { const sel = document.getElementById('merchant-type-select'); return Array.from(sel.options).map(o => o.value + '=' + o.text); });
  console.log('types', types.filter(t => /stables|Breeder|petTrader/.test(t)));
  const mk = (t, h) => gm.evaluate(async ([t, h]) => { document.getElementById('merchant-type-select').value = t; document.getElementById('merchant-hold-select').value = h; window.refreshMerchantStock(); await new Promise(r => setTimeout(r, 700)); return document.getElementById('merchant-gen-result').innerText; }, [t, h]);
  console.log(await mk('stables', 'Вайтран'));
  console.log(await mk('dogBreeder', 'Вайтран'), 'dialogs', gm.__dialogs);
  console.log(await mk('dogBreeder', 'Предел'));
  console.log(await mk('skeeverBreeder', 'Хьялмарк'));
  console.log(await mk('spiderBreeder', 'Рифт'));
  console.log(await mk('blacksmith2', 'Вайтран'));
  console.log('stocks', JSON.stringify(Object.fromEntries(Object.entries(S().merchantStocks).map(([k, v]) => [k, v.pets ? v.items : v.items.length]))));
  await wait(1000);
  // player: gold, buy select options, sell select excludes pets
  const r = await pl.evaluate(() => {
    document.getElementById('char-gold').value = 3000; updateAll(); saveLocalStorage(true);
    renderBuyList(); renderSellList();
    return { buy: Array.from(document.getElementById('buy-merchant-type').options).map(o => o.value), sell: Array.from(document.getElementById('sell-merchant-type').options).map(o => o.value) };
  });
  console.log('player selects', JSON.stringify(r));
  // buy horse via trade tab
  pl.__answers = ['Плотва'];
  await pl.evaluate(() => { const sel = document.getElementById('buy-merchant-type'); sel.value = 'stables@Вайтран'; onBuyMerchantChanged(); });
  const row = await pl.evaluate(() => document.getElementById('buy-items-list').innerText);
  console.log('buy list', row);
  await pl.evaluate(() => window.buyFromMerchant('stables@Вайтран', 0));
  await wait(1500);
  console.log('after horse', JSON.stringify(await pl.evaluate(() => ({ gold: document.getElementById('char-gold').value, pets: playerPets.map(p => [p.name, p.kind, p.hp, p.rideable]), inv: playerInventory.filter(i => /Лошад/.test(i.name)).length }))));
  console.log('stable qty', JSON.stringify(S().merchantStocks['stables@Вайтран'].items.map(i => i.qty)), 'gold', S().merchantStocks['stables@Вайтран'].gold);
  // buy dog via pets panel
  pl.__answers = ['Шарик'];
  const panel = await pl.evaluate(() => { document.getElementById('pets-panel').open = true; renderPetsPanel(); return document.getElementById('pets-shop').innerText; });
  console.log('panel', panel);
  await pl.evaluate(() => { const b = Array.from(document.querySelectorAll('#pets-shop button')).find(b => /Предел/.test(b.parentElement.innerText) || b.getAttribute('onclick').includes('dogBreeder')); b.click(); });
  await wait(1500);
  console.log('after dog', JSON.stringify(await pl.evaluate(() => ({ gold: document.getElementById('char-gold').value, pets: playerPets.map(p => [p.name, p.kind]) }))));
  // buyPet in session refused
  await pl.evaluate(() => window.buyPet('horse'));
  console.log('dialogs', pl.__dialogs.slice(-4));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  await H.close();
})();
