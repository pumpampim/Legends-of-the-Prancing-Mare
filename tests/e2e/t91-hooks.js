// Явные крючки (js/00-hooks.js): все обёртки на месте, тюрьма блокирует действие, экран «Бой» перерисовывается.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) ok = false; };
  const list = await pl.evaluate(() => stHook.list());
  console.log(JSON.stringify(list).slice(0, 300));
  check(Object.keys(list).length > 60, 'тюремных крючков ' + Object.keys(list).length);
  check(JSON.stringify(list.dockAttack) === JSON.stringify(['тюрьма', 'телефон: к экрану Бой']), 'dockAttack: тюрьма, потом телефон');
  check(list.updateCombatDock && list.renderAttackTargetSelect, 'экран Бой подписан на док и цели');
  const r = await pl.evaluate(() => { let called = 0; window.__t = () => { called++; return 7; }; stHook('__t', 'тест', { before: () => called > 0 ? stHook.STOP : undefined, after: () => { throw new Error('x'); } });
    const a = __t(), b = __t(); return [a, b, called]; });
  check(JSON.stringify(r) === '[7,null,1]', 'before/STOP/after с ошибкой: ' + JSON.stringify(r));
  for (let i = H.issues.length - 1; i >= 0; i--) if (/крючке __t/.test(H.issues[i].text)) H.issues.splice(i, 1);
  if (!ok) process.exitCode = 1;
  await H.close();
})();
