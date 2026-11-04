// Паладин: запреты клятв (кражи, штрафы, даэдрическое надетое), святой урон дозорного, круг как зона.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {}; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await pl.evaluate(() => {
    window.confirm = () => true; window.alert = () => {};
    document.getElementById('faith-god').value = 'kynareth'; lastFaithGod = 'kynareth';
    characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 6;
    playerPaladin = null; plTakePerk('p1'); updateAll();
  });
  // кражи при клятве правосудия
  out.theft = await pl.evaluate(() => { plChooseVow('justice'); plCountTheft(10); const a = !!playerPaladin.fallen; plCountTheft(1); return { a, b: !!playerPaladin.fallen }; });
  chk(out.theft.a === false && out.theft.b === true, '10 краж терпимо, 11-я роняет');
  // штрафы
  out.fine = await pl.evaluate(() => {
    playerPaladin = { perks: { p1: true }, vow: null, fallen: false, penanceUsed: false, abandoned: false };
    playerCrimeState = { bounties: {} }; plChooseVow('justice');
    playerCrimeState = { bounties: { 'Вайтран': { amount: 600 } } }; plSync(); const a = !!playerPaladin.fallen;
    playerCrimeState = { bounties: { 'Вайтран': { amount: 0 } } }; plSync();
    playerCrimeState = { bounties: { 'Вайтран': { amount: 500 } } }; plSync(); const b = !!playerPaladin.fallen;
    return { a, b, total: playerPaladin.finesTotal };
  });
  chk(out.fine.a === false && out.fine.b === true, 'штрафы суммируются за всё время (600+500>1000)');
  // даэдрическое надетое
  out.daedric = await pl.evaluate(() => {
    playerPaladin = { perks: { p1: true }, vow: 'vengeance', fallen: false, penanceUsed: false, abandoned: false };
    playerInventory.push({ itemId: 'dae1', name: 'Даэдрический амулет', category: 'Артефакты', count: 1 });
    const bag = plRighteous(); equippedSlots.neck = 'dae1'; const worn = plRighteous(); equippedSlots.neck = null; const off = plRighteous();
    return { bag, worn, off };
  });
  chk(out.daedric.bag && !out.daedric.worn && out.daedric.off, 'приостановка только пока даэдрическое надето');
  // святой урон и круг-зона
  out.holy = await pl.evaluate(() => {
    playerPaladin = { perks: { p1: true }, vow: 'watch', fallen: false, penanceUsed: false, abandoned: false };
    powersUsedToday = {}; plUseCircle();
    const e = activeTimedEffects.find(x => x.plCircle === 'watch');
    return { has: !!e, zoneId: e && e.gridZoneId === e.id, holy: plHolyActive(), pctEmpty: !(e && e.percentEffects.length) };
  });
  chk(out.holy.has && out.holy.zoneId && out.holy.holy && out.holy.pctEmpty, 'круг дозорного: эффект, зона, святой урон');
  // карточка появляется сама при смене веры на аэдра (без других событий)
  out.card = await pl.evaluate(() => { playerPaladin = null; document.getElementById('faith-god').value = 'none'; updateAll(); const a = document.getElementById('supernatural-status-player').innerHTML.indexOf('Путь паладина') !== -1; document.getElementById('faith-god').value = 'stendarr'; updateAll(); const b = document.getElementById('supernatural-status-player').innerHTML.indexOf('Путь паладина') !== -1; return { a, b }; });
  chk(out.card.a === false && out.card.b === true, 'карточка паладина появляется при вере в аэдра');
  // сворачивание веток: details, состояние переживает перерисовку
  out.fold = await pl.evaluate(() => { const d = () => document.querySelector('#supernatural-status-player details.fate-box'); const a = !!d(); fateToggle('paladin', false); renderSupernaturalStatusPlayer(); const closed = d() && !d().open; fateToggle('paladin', true); renderSupernaturalStatusPlayer(); return { a, closed, open: d() && d().open }; });
  chk(out.fold.a && out.fold.closed && out.fold.open, 'ветки судьбы сворачиваются и помнят состояние');
  console.log(JSON.stringify(out)); console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
  process.exit(fails.length ? 1 : 0);
})();
