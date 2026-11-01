const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({ players: [{ uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [p1] = players; const sk = 'sessions/' + code;
  await S.gmAddEnemy(gm, 'Медведь'); await S.gmAddEnemy(gm, 'Драугр'); await wait(1500);
  const doc = () => H.store[sk].doc;
  const en = doc().enemies.map(e => Object.assign({}, e, { curHp: 0 }));
  await gm.evaluate(([c, en]) => firebase.firestore().collection('sessions').doc(c).update({ enemies: en }), [code, en]); await wait(2000);
  console.log(JSON.stringify(doc().enemies.map(e => ({ n: e.name, raisable: !!e.isRaisable, loot: (e.loot || '').slice(0, 60), cl: !!e.corpseLoot }))));
  const pl = await p1.evaluate(() => document.getElementById('enemies-list').innerText);
  console.log('PLAYER LIST:', pl.replace(/\n+/g, ' | '));
  const gmt = await gm.evaluate(() => document.getElementById('gm-enemies-list').innerText.match(/Труп[^\n]*/g));
  console.log('GM:', JSON.stringify(gmt));
  await H.close();
})();
