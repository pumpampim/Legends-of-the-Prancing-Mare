const { setupSession, wait, gmAddEnemy } = require('./setup');
const SKIP = /close|reset|delete|leave|logout|signOut|end|remove|clear|wipe|drop|kill|import|restore|drive|download|export|print|newSession|createSession|joinSession|archive|transfer|Death|wakeUp|revive|rollFreeLives|stash|dismiss|copy|share/i;
(async () => {
  const { gm, players, H } = await setupSession();
  const pl = players[0];
  await gmAddEnemy(gm, 'Бандит');
  await wait(800);
  for (const [pg, tag] of [[gm, 'GM'], [pl, 'PL']]) {
    pg.__promptAnswer = '1';
    const list = await pg.evaluate((skip) => {
      const re = new RegExp(skip, 'i');
      const els = Array.from(document.querySelectorAll('[onclick]'));
      const seen = new Set(), out = [];
      els.forEach((e, i) => { const c = e.getAttribute('onclick'); if (!c || seen.has(c) || re.test(c)) return; seen.add(c); e.setAttribute('data-fz', i); out.push([i, c.slice(0, 100)]); });
      return out;
    }, SKIP.source);
    console.log(tag, 'handlers', list.length);
    for (const [i, c] of list) {
      const before = H.issues.length;
      try {
        await pg.evaluate((i) => { const e = document.querySelector('[data-fz="' + i + '"]'); if (!e) return; try { (new Function('event', e.getAttribute('onclick'))).call(e, { target: e, currentTarget: e, stopPropagation() {}, preventDefault() {} }); } catch (er) { console.error('THROW ' + er.message + ' @ ' + (er.stack || '').split('\n')[1]); } }, i);
      } catch (e) { console.log('EVALFAIL', c, e.message.slice(0, 100)); }
      await wait(150);
      if (H.issues.length > before) H.issues.slice(before).forEach(x => console.log('!!', tag, c, '=>', x.text.slice(0, 260).replace(/\n/g, ' ')));
    }
  }
  await H.close();
})();
