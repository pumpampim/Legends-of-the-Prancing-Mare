const { setupSession, sheet, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  console.log('code', code);
  console.log(JSON.stringify(await sheet(pl)));
  const sess = H.store['sessions/' + code];
  console.log('participants', JSON.stringify(sess && sess.doc.participants));
  console.log('char doc keys', Object.keys((H.store['characters/p1'] || {}).doc || {}).length);
  await gm.screenshot({ path: require('path').join(__dirname, 'out', 'gm2.png'), fullPage: false });
  console.log(JSON.stringify(H.issues, null, 1).slice(0, 2000));
  await H.close();
})();
