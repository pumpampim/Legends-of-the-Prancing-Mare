// Сбор ошибок: падение JS и неудачное сохранение у игрока попадают в errors/*, мастер видит их в панели.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  await pl.evaluate(() => { setTimeout(() => { throw new Error('проверка-сбора-ошибок'); }, 0); console.error('Ошибка сохранения в облако:', new Error('permission-denied')); console.error('просто текст'); });
  await pl.evaluate(() => { setTimeout(() => { throw new Error('проверка-сбора-ошибок'); }, 0); }); // повтор не дублируется
  await wait(3500);
  const errs = Object.keys(H.store).filter(k => k.startsWith('errors/')).map(k => H.store[k].doc);
  console.log(JSON.stringify(errs.map(e => [e.kind, e.msg, e.page, e.uid, e.session])));
  check(errs.filter(e => /проверка-сбора-ошибок/.test(e.msg)).length === 1, 'падение JS записано один раз');
  check(errs.some(e => e.kind === 'console' && /permission-denied/.test(e.msg)), 'неудачное сохранение записано');
  check(!errs.some(e => /просто текст/.test(e.msg)), 'обычный console.error не пишется');
  check(errs.every(e => e.uid === 'p1' && e.page === 'index.html'), 'uid и страница заполнены');
  await gm.evaluate(() => gmLoadErrors()); await wait(800);
  const txt = await gm.evaluate(() => document.getElementById('gm-errors-list').textContent + ' | ' + document.getElementById('gm-errors-count').textContent);
  check(/проверка-сбора-ошибок/.test(txt) && /\(2\)/.test(txt), 'мастер видит ошибки: ' + txt.slice(-40));
  await gm.evaluate(() => { window.confirm = () => true; gmClearErrors(); }); await wait(800);
  check(!Object.keys(H.store).some(k => k.startsWith('errors/') && H.store[k].doc), 'очистка удаляет записи');
  // намеренные ошибки — не провал стенда
  for (let i = H.issues.length - 1; i >= 0; i--) if (/проверка-сбора-ошибок|permission-denied|просто текст/.test(H.issues[i].text)) H.issues.splice(i, 1);
  console.log('issues', JSON.stringify(H.issues).slice(0, 500));
  if (!ok) process.exitCode = 1;
  await H.close();
})();
