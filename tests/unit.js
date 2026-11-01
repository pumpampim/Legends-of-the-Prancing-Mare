// Юнит-тесты (tests.js через test.html) в настоящем браузере: node tests/unit.js
const H = require('./e2e/lib');
(async () => {
  await H.launch();
  const pg = await H.openPage('test.html', { uid: 't' }, { tag: 'test' });
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => ({ sum: document.getElementById('summary').innerText, fails: Array.from(document.querySelectorAll('.fail')).map(e => e.innerText).slice(0, 30) }));
  console.log(r.sum); r.fails.forEach(f => console.log('FAIL', f));
  if (r.fails.length || !/(^|\D)0 упало/.test(r.sum)) process.exitCode = 1;
  await H.close();
})();
