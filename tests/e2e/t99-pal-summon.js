// Паладин: призванное заклинанием оружие считается даэдрическим — праведность приостанавливается, пока оно в руке.
const S = require('./setup');
(async () => {
  const { players, H } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await pl.evaluate(() => {
    window.confirm = () => true; window.alert = () => {};
    document.getElementById('faith-god').value = 'kynareth'; lastFaithGod = 'kynareth';
    characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 6;
    playerQuests = []; equippedSlots.neck = null; updateAll(); plTakePerk('p1');
  });
  const r0 = await pl.evaluate(() => plRighteous());
  await pl.evaluate(() => { activeSummons.push({ id: 's1', category: 'weapon', name: 'Призванный меч', dmg: 13, turnsRemaining: 10 }); });
  const r1 = await pl.evaluate(() => plRighteous());
  await pl.evaluate(() => { activeSummons = activeSummons.filter(x => x.id !== 's1'); });
  const r2 = await pl.evaluate(() => plRighteous());
  chk(r0 === true, 'без призыва паладин должен быть праведен');
  chk(r1 === false, 'с призванным мечом праведность должна приостанавливаться');
  chk(r2 === true, 'после исчезновения меча праведность возвращается');
  console.log(JSON.stringify({ r0, r1, r2 }));
  fails.forEach(f => console.log('FAIL ' + f));
  await H.close();
})();
