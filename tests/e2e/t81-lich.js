const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const out = {};
  await pl.evaluate(() => { characterLevel = 40; perkPointsAvailable = 6; updateAll(); saveLocalStorage(true); });
  await wait(800);
  await gm.evaluate(() => { const sel = document.getElementById('inv-player-select'); sel.value = 'p1'; window.loadPlayerInventoryForGm(); });
  await wait(1500);
  gm.__confirms = [true, true, true, true, true, true, true, true];
  out.panel = await gm.evaluate(() => /Ветка лича/.test(document.getElementById('supernatural-panel-body').innerText));
  // порядок: нельзя bearer без pact
  await gm.evaluate(() => window.gmLichGrantPerk('bearer'));
  await wait(300); out.gmAlerts1 = gm.__dialogs.splice(0);
  for (const id of ['pact', 'bearer', 'herald', 'visage']) { await gm.evaluate((i) => window.gmLichGrantPerk(i), id); await wait(1500); }
  out.after = await pl.evaluate(() => ({ perks: snLich() && snLich().perks, pts: perkPointsAvailable, faith: (document.getElementById('char-faith') || {}).value,
    spells: ['Плащ морозного огня', 'Огненный шар ледяного огня', 'Ледяное испепеление'].map(n => JSON.stringify(window.spellsData).includes(n)),
    resMagic: (window.computeTotalResistances ? computeTotalResistances().magic : null) }));
  out.gmView = await gm.evaluate(() => (document.getElementById('supernatural-panel-body').innerText.match(/✅/g)||[]).length);
  // становление
  await gm.evaluate(() => window.gmLichSetStage('1')); await wait(1500);
  out.stage = await pl.evaluate(() => ({ stage: lichStage(), mana: lichManaBonus() }));
  // слабость/воскрешение
  await gm.evaluate(() => window.gmLichSet({ weakened: true, resReady: false })); await wait(1200);
  out.weak = await pl.evaluate(() => ({ w: snLich().weakened, r: snLich().resReady, pen: lichWeakenedPenalty() }));
  // снятие
  await gm.evaluate(() => window.gmLichRevokePerk('bearer')); await wait(1500);
  out.revoke = await pl.evaluate(() => ({ perks: snLich().perks, stage: snLich().stage, pts: perkPointsAvailable }));
  await gm.evaluate(() => window.gmLichReset()); await wait(1500);
  out.reset = await pl.evaluate(() => ({ perks: snLich().perks, pts: perkPointsAvailable }));
  console.log(JSON.stringify(out, null, 1));
  console.log('issues', JSON.stringify(H.issues).slice(0, 3000));
  
  await H.close();
})();
