const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  await pl.evaluate(() => {
    skillNames.forEach((n, i) => document.getElementById('skill-' + i).setAttribute('data-raw-val', 100));
    characterLevel = 80; perkPointsAvailable = 200; updateAll();
    window.__take = (perkName) => { for (let si = 0; si < skillNames.length; si++) { const L = fullPerksManifest[skillNames[si]] || []; const pi = L.findIndex(p => p.name === perkName);
        if (pi >= 0) { for (let s = 1; s <= L[pi].steps; s++) { const c = document.getElementById(`perk-${si}-${pi}-${s}`); if (!c.checked) { c.checked = true; validatePerkCheck(c); } } return true; } } return false; };
    ['Джаггернаут','Хорошая экипировка','Рыцарь','Вооружение'].forEach(n => __take(n));
    updateAll();
  });
  for (const n of ['Стальная броня', 'Стальной меч', 'Стальной щит']) await S.gmGive(gm, n, 1);
  await wait(800);
  await S.plEquip(pl, 'Стальная броня', 'chest'); await S.plEquip(pl, 'Стальной меч', 'main'); await S.plEquip(pl, 'Стальной щит', 'shield');
  await pl.evaluate(() => { document.getElementById('cur-hp').value = 37; document.getElementById('char-gold').value = 1234; updateAll(); saveLocalStorage(true); });
  await wait(1500);
  const snap = async () => pl.evaluate(() => ({ lvl: characterLevel, pp: perkPointsAvailable, perks: document.querySelectorAll('input[id^="perk-"]:checked').length,
    skills: skillNames.map((n,i)=>document.getElementById('skill-'+i).getAttribute('data-raw-val')).join(','),
    hp: document.getElementById('cur-hp').value + '/' + document.getElementById('max-hp').value, mp: document.getElementById('cur-mp').value + '/' + document.getElementById('max-mp').value,
    gold: document.getElementById('char-gold').value, armor: document.getElementById('armor-total').innerText, dmg: (document.getElementById('main-panel-dmg')||{}).innerText,
    inv: playerInventory.map(i => i.name + 'x' + i.count).join('|'), slots: ['main','shield','chest'].map(s => (document.getElementById('slot-'+s+'-name')||document.getElementById('slot-'+s)||{}).value).join('|'),
    race: document.getElementById('char-race').value, str: document.getElementById('stat-str').value, prog: JSON.stringify(window.levelUpProgress||null) }));
  const a = await snap(); console.log('BEFORE', JSON.stringify(a));
  await pl.reload({ waitUntil: 'load' }); await wait(3500);
  const b = await snap(); console.log('AFTER ', JSON.stringify(b));
  for (const k in a) if (a[k] !== b[k]) console.log('DIFF', k, a[k], '=>', b[k]);
  // GM give race: player autosaves while GM gives
  await pl.evaluate(() => { document.getElementById('char-gold').value = 2000; });
  const p1 = S.gmGive(gm, 'Железный кинжал', 1);
  await pl.evaluate(() => { updateAll(); saveLocalStorage(true); });
  await p1; await wait(1500);
  console.log('after race inv', await pl.evaluate(() => playerInventory.map(i => i.name + 'x' + i.count).join('|')));
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
