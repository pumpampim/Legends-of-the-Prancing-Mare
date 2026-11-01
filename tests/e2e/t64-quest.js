const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({ players: [{ uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [p1] = players;
  await gm.evaluate(() => { document.getElementById('quest-title-input').value = 'Тест-квест'; const s = document.getElementById('quest-target-player'); window.grantQuest && 0; });
  await gm.evaluate(() => { const s = document.getElementById('quest-target-player'); if (![...s.options].some(o=>o.value==='all')) s.innerHTML='<option value="all">all</option>'; s.value = 'all'; window.grantQuest(); });
  await wait(2000);
  console.log('cloud after grant:', JSON.stringify((H.store['characters/p1'].doc.playerQuests || []).map(q => q.title)));
  console.log('player local:', await p1.evaluate(() => JSON.stringify(playerQuests.map(q => q.title))));
  // игрок что-то меняет — автосохранение
  await p1.evaluate(() => { const g = document.getElementById('char-gold'); g.value = (parseInt(g.value) || 0) + 1; g.dispatchEvent(new Event('input', { bubbles: true })); g.dispatchEvent(new Event('change', { bubbles: true })); saveLocalStorage(); });
  await wait(2500);
  console.log('cloud after player save:', JSON.stringify((H.store['characters/p1'].doc.playerQuests || []).map(q => q.title)));
  await H.close();
})();
