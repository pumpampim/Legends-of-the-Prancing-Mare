// Кик игрока мастером: подтверждение, выход у игрока, повторный вход запрещён, «вернуть» снова пускает.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession({ players: [
    { uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    { uid: 'p2', name: 'Лидия', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [p1, p2] = players; const sk = 'sessions/' + code;
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  for (const p of players) await p.evaluate(() => { window.__al = []; window.alert = m => window.__al.push(String(m)); });
  await gm.evaluate(() => { window.__conf = []; });
  check(Object.keys(H.store[sk].doc.participants).sort().join() === 'p1,p2', 'оба в сессии');
  await gm.evaluate(() => { const g = document.getElementById('turn-order-name-input'); g.value = 'Бьорн'; addTurnOrderCustom(); });
  await wait(800);
  // отказ в подтверждении — ничего не происходит
  await gm.evaluate(() => { window.confirm = m => { window.__conf.push(m); return false; }; Array.from(document.querySelectorAll('#gm-party-list button')).find(b => /Выгнать/.test(b.textContent)).click(); });
  await wait(1000);
  check(!!H.store[sk].doc.participants.p1 && !H.store[sk].doc.kicked, 'отмена подтверждения ничего не меняет');
  await gm.evaluate(() => { window.confirm = m => { window.__conf.push(m); return true; }; gmKickPlayer('p1'); });
  await wait(2500);
  const d = H.store[sk].doc;
  check(!d.participants.p1 && !!d.participants.p2, 'p1 удалён из участников, p2 остался');
  check(d.kicked && d.kicked.p1 && d.kicked.p1.name === 'Бьорн', 'kicked: ' + JSON.stringify(d.kicked));
  check(!(d.turnOrder || []).some(i => i.name === 'Бьорн'), 'убран из очереди ходов');
  check(d.combatLog.some(x => /покидает сессию/.test(x.text)), 'запись в журнале');
  const s1 = await p1.evaluate(() => ({ code: localStorage.getItem('skyrim_session_code') || null, act: document.getElementById('session-active-block').style.display, err: document.getElementById('session-join-error').textContent, al: window.__al }));
  check(s1.act === 'none' && /исключил/.test(s1.err) && s1.al.length === 1, 'игрок вышел и видит сообщение: ' + JSON.stringify(s1));
  check(!!H.store['characters/p1'], 'персонаж p1 не удалён');
  const gmList = await gm.evaluate(() => ({ party: document.getElementById('gm-party-list').innerText, kicked: document.getElementById('gm-kicked-list').innerText }));
  check(!/Бьорн/.test(gmList.party) && /Бьорн/.test(gmList.kicked), 'у мастера: ' + JSON.stringify(gmList));
  const p2party = await p2.evaluate(() => Object.keys((CloudSync.getSessionData && CloudSync.getSessionData() || {}).participants || {}).join());
  console.log('p2 видит участников:', p2party);
  // запоздавшая запись старой вкладки p1 (в настоящей базе её отвергнут правила) — мастер её не показывает
  H.store[sk].doc.participants.p1 = { curHp: 5 };
  await gm.evaluate(() => setParticipantTown('p2', true)); await wait(1200);
  check(!/Бьорн|\?/.test(await gm.evaluate(() => document.getElementById('gm-party-list').innerText.split('\n')[0])), 'призрачная запись скрыта');
  delete H.store[sk].doc.participants.p1;
  // повторный вход по коду
  await p1.evaluate((c) => { document.getElementById('session-code-input').value = c; joinSession(); }, code); await wait(1500);
  const s2 = await p1.evaluate(() => ({ act: document.getElementById('session-active-block').style.display, err: document.getElementById('session-join-error').textContent }));
  check(s2.act === 'none' && /исключил/.test(s2.err) && !H.store[sk].doc.participants.p1, 'вход по коду запрещён: ' + JSON.stringify(s2));
  // мастер возвращает
  await gm.evaluate(() => Array.from(document.querySelectorAll('#gm-kicked-list button'))[0].click()); await wait(1200);
  check(!H.store[sk].doc.kicked || !H.store[sk].doc.kicked.p1, 'вернули: ' + JSON.stringify(H.store[sk].doc.kicked));
  await p1.evaluate((c) => { document.getElementById('session-code-input').value = c; joinSession(); }, code); await wait(1800);
  check(!!H.store[sk].doc.participants.p1 && (await p1.evaluate(() => document.getElementById('session-active-block').style.display)) === 'block', 'снова в сессии');
  console.log('confirms', JSON.stringify(await gm.evaluate(() => window.__conf)));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  console.log(ok ? 'ALL OK' : 'HAS FAILS');
  await H.close();
})();
