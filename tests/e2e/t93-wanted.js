// Розыск по владениям: штрафы копятся раздельно, оплата/тюрьма закрывают одно владение,
// старый лист с одним штрафом переносится, у мастера плашка «стража узнаёт», у игрока — список.
const S = require('./setup');
(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0];
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const ck = 'characters/p1', sk = 'sessions/' + code;
  // старый лист: один штраф
  await gm.evaluate(() => firebase.firestore().collection('characters').doc('p1').update({ gold: 500, crimeState: { fineAmount: 120, fineHold: 'Рифт', fineReason: 'драка', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 } }));
  await wait(800);
  await gm.evaluate(() => { const sel = document.getElementById('inv-player-select'); sel.value = 'p1'; window.loadPlayerInventoryForGm(); });
  await wait(1500);
  const fine = async (hold, amount, reason) => { await gm.evaluate(([h, a, r]) => { document.getElementById('fine-amount-input').value = a; document.getElementById('fine-hold-select').value = h; document.getElementById('fine-reason-input').value = r; issueFine(); }, [hold, amount, reason]); await wait(900); };
  await fine('Вайтран', 300, 'кража');
  await fine('Вайтран', 200, 'нападение');
  await fine('Хаафингар', 1100, 'убийство');
  let cs = H.store[ck].doc.crimeState;
  console.log(JSON.stringify(cs.bounties));
  check(cs.bounties['Рифт'].amount === 120, 'старый штраф перенесён в Рифт');
  check(cs.bounties['Вайтран'].amount === 500 && /кража; нападение/.test(cs.bounties['Вайтран'].reason), 'Вайтран копится отдельно: 500');
  check(cs.bounties['Хаафингар'].amount === 1100 && cs.fineAmount === 1720, 'сводка fineAmount = 1720');
  const panel = await gm.evaluate(() => document.getElementById('crime-panel-body').textContent);
  check(/награда за голову/.test(panel), 'мастер видит награду за голову');
  // оплата Вайтрана
  await gm.evaluate(() => clearFine('Вайтран')); await wait(1000);
  cs = H.store[ck].doc.crimeState;
  check(!cs.bounties['Вайтран'] && H.store[ck].doc.gold === 0 && cs.bounties['Рифт'], 'оплата закрыла только Вайтран, золото 500 → 0');
  // тюрьма за Рифт
  await gm.evaluate(() => sendToJail('Рифт')); await wait(1000);
  cs = H.store[ck].doc.crimeState;
  check(cs.inJail && cs.jailHold === 'Рифт' && !cs.bounties['Рифт'] && cs.bounties['Хаафингар'], 'тюрьма в Рифте, Хаафингар остался');
  // сессия видит розыск, отряд входит в Солитьюд
  const w = (H.store[sk].doc.participants.p1 || {}).wanted;
  check(Array.isArray(w) && w.length === 1 && w[0].hold === 'Хаафингар', 'розыск в сессии: ' + JSON.stringify(w));
  await gm.evaluate(c => firebase.firestore().collection('sessions').doc(c).update({ currentHold: 'Солитьюд (Хаафингар)' }), code);
  await wait(1200);
  const banner = await gm.evaluate(() => document.getElementById('gm-wanted-banner').textContent);
  check(/Солитьюд/.test(banner) && /1100/.test(banner), 'плашка «стража узнаёт»: ' + banner.slice(0, 80));
  const log = JSON.stringify(H.store[sk].doc.combatLog || H.store[sk].doc.log || '').match(/разыскивается в Солитьюд/g) || [];
  check(log.length === 1, 'одна запись в журнал');
  const pw = await pl.evaluate(() => document.getElementById('crime-status-widget').textContent);
  check(/Розыск: Хаафингар 1100/.test(pw) && /тюрьме/.test(pw), 'игрок видит тюрьму и розыск: ' + pw.slice(0, 120));
  // юнит crime-core
  const u = await gm.evaluate(() => [StCrime.sameHold('Белый Берег', 'Белый берег (Данстар)'), StCrime.sameHold('Вайтран', 'Рифт'), StCrime.sameHold('Предел', 'Маркарт (Предел)'), StCrime.normalize(null).fineAmount]);
  check(JSON.stringify(u) === '[true,false,true,0]', 'сравнение владений: ' + JSON.stringify(u));
  if (!ok) process.exitCode = 1;
  await H.close();
})();
