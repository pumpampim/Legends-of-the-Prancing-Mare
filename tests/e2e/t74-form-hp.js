const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(async () => {
    const out = {};
    const v = id => parseInt(document.getElementById(id).value);
    playerSupernaturalState = { lycanthropy: true, vampirism: false, werewolf: { heartsEaten: 0, totem: '— нет —', transformsToday: 0, isTransformed: false }, vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {} } };
    updateAll();
    out.human = v('max-hp');
    playerTransformWerewolf(); updateAll();
    out.beastMax = v('max-hp');
    document.getElementById('cur-hp').value = v('max-hp'); updateAll();
    playerRevertWerewolf(); updateAll();
    out.afterRevert = { cur: v('cur-hp'), max: v('max-hp') };
    return out;
  });
  console.log(JSON.stringify(r));
  await H.close();
})();
