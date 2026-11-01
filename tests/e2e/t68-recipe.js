const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const name = await p1.evaluate(() => { const r = getAllSmithingRecipes().find(x => !x.alwaysKnown); return r.name; });
  await gm.evaluate(([n]) => { window.currentRecipePlayerUid_ = 1; }, [name]);
  await gm.evaluate((n) => firebase.firestore().collection('characters').doc('p1').set({ knownSmithingRecipes: firebase.firestore.FieldValue.arrayUnion(n) }, { merge: true }), name);
  await wait(2000);
  console.log('cloud', JSON.stringify(H.store['characters/p1'].doc.knownSmithingRecipes));
  console.log('player knows', await p1.evaluate((n) => knownSmithingRecipes.includes(n), name));
  await H.close();
})();
