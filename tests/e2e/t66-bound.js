const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  await S.gmGive(gm, 'Стальной меч', 1); await wait(2500);
  console.log(await S.plEquip(p1, 'Стальной меч'));
  const r = await p1.evaluate(() => {
    const f = () => ({ name: document.getElementById('wep-melee-name').value, dmg: document.getElementById('wep-melee-dmg').value, slot: equippedSlots.meleeWeapon });
    const out = { start: f() };
    const t = summonTemplates.find(x => x.name === 'Призванный меч');
    performSummon(t, false); out.after1 = f();
    performSummon(t, false); out.after2 = f();
    for (let i = 0; i < 20; i++) tickActiveSummons();
    out.afterExpire = f(); out.summons = activeSummons.length;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await H.close();
})();
