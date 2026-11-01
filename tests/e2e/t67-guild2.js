const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  await gm.evaluate(() => firebase.firestore().collection('characters').doc('p1').update({ guildsData: { 'Гильдия воров': { member: true, orders: 4 } } }));
  await wait(1500);
  const r = await p1.evaluate(async () => {
    playerQuests.push({ id: 'qa', title: 'A', guild: 'Гильдия воров', status: 'review' }, { id: 'qb', title: 'B', guild: 'Гильдия воров', status: 'review' });
    const g0 = parseInt(document.getElementById('char-gold').value) || 0;
    const me = window.CloudSync.getCurrentUid();
    window.processQuestDecisions([{ uid: me, questId: 'qa', ok: true }, { uid: me, questId: 'qb', ok: true }]);
    await new Promise(r => setTimeout(r, 2500));
    return { goldGain: (parseInt(document.getElementById('char-gold').value) || 0) - g0, hoods: playerInventory.filter(i => /Умелого вора/.test(i.name)).map(i => i.name + '×' + i.count) };
  });
  console.log(JSON.stringify(r), 'cloud orders', JSON.stringify(H.store['characters/p1'].doc.guildsData));
  await H.close();
})();
