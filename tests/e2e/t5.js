const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  await pl.evaluate(() => { characterLevel = 80; document.querySelectorAll('[data-raw-val]').forEach(e => e.setAttribute('data-raw-val', 100)); updateAll(); });
  const r = await pl.evaluate(() => {
    const out = { learned: 0, fail: [] };
    for (const sc in window.spellsData) for (const t in window.spellsData[sc]) for (const sp of window.spellsData[sc][t]) {
      try { const x = learnSpellIntoBook(sc, sp.name); if (x === true) out.learned++; else out.fail.push(sp.name + ':' + x); } catch (e) { out.fail.push(sp.name + ' ERR ' + e.message); }
    }
    updateAll(); renderAttackActionSelect();
    out.opts = Array.from(document.getElementById('attack-action-select').options).map(o => o.text);
    out.n = customSpells.length;
    return out;
  });
  console.log('learned', r.learned, 'customSpells', r.n, 'fail', r.fail.slice(0, 20));
  r.opts.forEach(o => console.log('  OPT', o));
  require('fs').writeFileSync(require('path').join(__dirname, 'out', 'attack_opts.txt'), r.opts.join('\n'));
  console.log(H.issues.slice(0, 10));
  await H.close();
})();
