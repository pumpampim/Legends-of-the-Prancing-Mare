const { setupSession, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession({ players: [
    { uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    { uid: 'p2', name: 'Лидия', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  const [pc, p2] = players;
  const date = pg => pg.evaluate(() => gameDayNum + '/' + gameMonth + '/' + gameYear);
  const cday = () => H.store['characters/p1'].doc.gameDayNum;
  let loads = { pc: 0, phone: 0 }; pc.on('load', () => loads.pc++);
  await wait(1500);
  const phone = await H.openPage('index.html', { uid: 'p1', email: 'p1@x', displayName: 'Бьорн' }, { tag: 'p1-phone' });
  phone.on('load', () => loads.phone++);
  const pcWarn = [], phWarn = []; pc.on('console', m => { if (m.type() === 'warning') pcWarn.push(m.text()); }); phone.on('console', m => { if (m.type() === 'warning') phWarn.push(m.text()); });
  await wait(3000); // возможная одна перезагрузка ПК из-за пересохранения при открытии
  console.log('1) phone opened, loads', JSON.stringify(loads));
  // A. телефон живой, ПК двигает дни
  for (let i = 0; i < 3; i++) { await pc.evaluate(() => nextDay()); await wait(300); }
  await wait(2500);
  console.log('A) PC', await date(pc), 'phone', await date(phone), 'cloud', cday(), 'loads', JSON.stringify(loads));
  await phone.evaluate(() => { document.getElementById('char-notes').value = 'с телефона'; saveLocalStorage(); }); await wait(2000);
  console.log('A) after phone edit cloud', cday(), 'notes', H.store['characters/p1'].doc.notes || H.store['characters/p1'].doc.charNotes);
  // B. телефон уходит в фон, ПК двигает дни, телефон правит в фоне и возвращается
  const setHidden = (pg, v) => pg.evaluate(v => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await setHidden(phone, true); await wait(500);
  for (let i = 0; i < 2; i++) { await pc.evaluate(() => nextDay()); await wait(300); }
  await wait(1500);
  console.log('B) PC', await date(pc), 'cloud', cday(), 'phone(hidden)', await date(phone));
  await phone.evaluate(() => { document.getElementById('char-notes').value = 'из фона'; saveLocalStorage(true); }); await wait(1500);
  console.log('B) after hidden phone save cloud', cday());
  await setHidden(phone, false); await wait(3000);
  console.log('B) phone back', await date(phone), 'cloud', cday(), 'loads', JSON.stringify(loads));
  // C. мастер выдаёт золото — ПК не должен перезагружаться
  const before = loads.pc;
  await gm.evaluate(() => gmAddGold('p1', 50)); await wait(2000);
  console.log('C) gold', H.store['characters/p1'].doc.gold, 'pc reloaded?', loads.pc !== before, 'PC day', await date(pc));
  // D. второй игрок и счётчик партии
  await p2.evaluate(() => nextDay()); await wait(1500);
  const s = H.store['sessions/' + code].doc; console.log('D) session counter', s.gameDayCounter, s.gameDayPlayerMax, JSON.stringify(s.gameDayByUid), 'p2', await date(p2));
  let prev = structuredClone(H.store['characters/p1'].doc);
  const iv = setInterval(() => { const d = H.store['characters/p1'].doc; if (d.saveSeq !== prev.saveSeq || d.gameDayNum !== prev.gameDayNum) { console.log('  write', d.saveSeq, d.saveBy, 'base', d.saveBase, 'day', d.gameDayNum); prev = structuredClone(d); } }, 5);
  // E. «старый клиент»: вкладка без защиты пишет старый лист прямо в облако (как было до правки)
  await phone.evaluate(() => { const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6')); d.gameDayNum = 10; d.saveSeq = 1; d.saveBy = 'tOLD'; d.saveHash = 'old'; return firebase.firestore().collection('characters').doc('p1').set(d, { merge: true }); });
  await wait(2500);
  console.log('E) after stale overwrite cloud', cday(), 'PC', await date(pc), 'phone', await date(phone));
  console.log('PC warnings', pcWarn.slice(-3)); console.log('phone warnings', phWarn.slice(-3));
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  clearInterval(iv); await H.close(); process.exit(0);
})();
