// Игрок играл с телефона, ноутбук всё это время спал со старым листом. Ноутбук просыпается / перезагружается / успевает
// что-то записать до того, как увидел облако — облако должно остаться с телефонными правками.
const { setupSession, wait } = require('./setup');
(async () => {
  const { players, H } = await setupSession({ players: [{ uid: 'p1', name: 'Бьорн', race: 'nord', sign: 'warrior', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }] });
  let pc = players[0];
  const fails = []; const check = (name, ok, info) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name + (info ? ' — ' + info : '')); if (!ok) fails.push(name); };
  const date = pg => pg.evaluate(() => gameDayNum);
  const notes = pg => pg.evaluate(() => document.getElementById('char-notes').value);
  const cloud = () => H.store['characters/p1'].doc;
  await wait(1500);
  await pc.evaluate(() => nextDay()); await wait(1500); // последняя запись в облаке — ноутбука
  const day0 = cloud().gameDayNum;
  // 1. Ноутбук засыпает, игрок играет с телефона: несколько записей подряд
  H.sleep(pc);
  const phone = await H.openPage('index.html', { uid: 'p1', email: 'p1@x', displayName: 'Бьорн' }, { tag: 'p1-phone' });
  await wait(1500);
  for (let i = 0; i < 3; i++) { await phone.evaluate(() => nextDay()); await wait(1200); } // отдельные записи: ноутбук увидит только последнюю
  await phone.evaluate(() => { document.getElementById('char-notes').value = 'с телефона'; saveLocalStorage(true); }); await wait(800);
  const dayPhone = cloud().gameDayNum;
  check('телефон записал свои правки', dayPhone === day0 + 3 && cloud().notes === 'с телефона', 'day ' + dayPhone);
  // телефон убрали в карман (его листенер молчит), ноутбук просыпается и видит только последнюю запись телефона
  H.sleep(phone); H.wake(pc); await wait(2500);
  check('проснувшийся ноутбук не затёр облако', cloud().gameDayNum === dayPhone && cloud().notes === 'с телефона', 'cloud day ' + cloud().gameDayNum + ' notes ' + cloud().notes);
  check('ноутбук подтянул лист телефона', await date(pc) === dayPhone && await notes(pc) === 'с телефона', 'pc day ' + await date(pc));
  // перезагрузка ноутбука
  await pc.reload({ waitUntil: 'load' }); await wait(2500); H.wake(phone); await wait(500);
  check('после перезагрузки ноутбука облако цело', cloud().gameDayNum === dayPhone && cloud().notes === 'с телефона', 'cloud day ' + cloud().gameDayNum);
  check('после перезагрузки ноутбук показывает лист телефона', await date(pc) === dayPhone, 'pc day ' + await date(pc));
  // 2. Ноутбук снова спит, телефон играет; ноутбук успевает записать правку ДО того, как увидел облако
  H.sleep(pc);
  for (let i = 0; i < 2; i++) { await phone.evaluate(() => nextDay()); await wait(400); }
  await wait(1200);
  const day2 = cloud().gameDayNum; check('телефон дописал дни', day2 === dayPhone + 2, 'day ' + day2);
  await pc.evaluate(() => { document.getElementById('char-notes').value = 'старый ноутбук'; saveLocalStorage(true); }); await wait(1500);
  check('запись спящего ноутбука не откатила телефон', cloud().gameDayNum === day2, 'cloud day ' + cloud().gameDayNum + ' ждали ' + day2);
  H.wake(pc); await wait(2500);
  check('после пробуждения облако с телефона', cloud().gameDayNum === day2, 'cloud day ' + cloud().gameDayNum);
  check('ноутбук догнал телефон', await date(pc) === day2, 'pc day ' + await date(pc));
  check('правка ноутбука в другом поле дописана к листу телефона', cloud().notes === 'старый ноутбук' && await notes(phone) === 'старый ноутбук', 'notes ' + cloud().notes);
  // 3. Перезагрузка ноутбука с незаписанной правкой (pagehide досохраняет её) — пока спал
  H.sleep(pc);
  await phone.evaluate(() => nextDay()); await wait(1500);
  const day3 = cloud().gameDayNum; check('телефон дописал день', day3 === day2 + 1, 'day ' + day3);
  await pc.evaluate(() => { document.getElementById('char-notes').value = 'перед перезагрузкой'; saveLocalStorage(); });
  H.wake(pc); await pc.reload({ waitUntil: 'load' }); await wait(2500);
  check('перезагрузка с отложенной правкой не откатила облако', cloud().gameDayNum === day3, 'cloud day ' + cloud().gameDayNum + ' ждали ' + day3);
  // 4. Обычная игра после всего: правки с ноутбука и телефона по очереди доходят до облака
  await pc.evaluate(() => nextDay()); await wait(1500);
  check('ноутбук снова пишет', cloud().gameDayNum === day3 + 1 && await date(phone) === day3 + 1, 'cloud ' + cloud().gameDayNum + ' phone ' + await date(phone));
  await phone.evaluate(() => nextDay()); await wait(1500);
  check('телефон снова пишет', cloud().gameDayNum === day3 + 2 && await date(pc) === day3 + 2, 'cloud ' + cloud().gameDayNum + ' pc ' + await date(pc));
  // 5. Оба устройства в сети: телефон пересохраняет лист (служебное поле) ровно перед записью ноутбука — правка ноутбука не теряется
  const dBefore = cloud().gameDayNum;
  H.sleep(pc);
  await phone.evaluate(() => { document.getElementById('char-notes').value = 'шум с телефона'; saveLocalStorage(true); }); await wait(400);
  await pc.evaluate(() => nextDay()); H.wake(pc); await wait(2500);
  check('одновременные правки разных полей обе сохранились', cloud().gameDayNum === dBefore + 1 && cloud().notes === 'шум с телефона', 'day ' + cloud().gameDayNum + ' notes ' + cloud().notes);
  check('оба устройства видят одно и то же', await date(pc) === dBefore + 1 && await date(phone) === dBefore + 1 && await notes(pc) === 'шум с телефона', 'pc ' + await date(pc) + ' phone ' + await date(phone));
  check('без ошибок на страницах', !H.issues.length, JSON.stringify(H.issues).slice(0, 600));
  console.log(fails.length ? 'FAILED ' + fails.length : 'ALL OK');
  await H.close(); process.exit(fails.length ? 1 : 0);
})();
