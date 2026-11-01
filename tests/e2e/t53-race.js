const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, H, code } = await setupSession();
  const pl = players[0];
  await pl.evaluate((code) => {
    window.__lives0 = parseInt(document.getElementById('char-lives').value) || 0;
    const orig = window.applyIncomingStatusEffects; let first = true;
    window.applyIncomingStatusEffects = function (list) {
      if (first) { first = false; // мастер в этот же момент шлёт вторую команду
        firebase.firestore().collection('sessions').doc(code).update({ ['participants.p1.pendingStatusEffects']: firebase.firestore.FieldValue.arrayUnion({ id: 'death-2', cmd: 'death', action: 'addLives', n: 5, fromGm: true }) });
      }
      return orig.apply(this, arguments);
    };
  }, code);
  await gm.evaluate(() => window.gmDeathCmd('p1', 'addLives', 1));
  await wait(4000);
  const r = await pl.evaluate(() => ({ lives0: window.__lives0, lives: document.getElementById('char-lives').value }));
  const pend = H.store['sessions/' + code].doc.participants.p1.pendingStatusEffects;
  console.log(JSON.stringify(r), 'pending now', JSON.stringify(pend));
  await H.close();
})();
