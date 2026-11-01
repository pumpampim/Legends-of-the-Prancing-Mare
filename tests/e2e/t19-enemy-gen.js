// Единое окно «Генератор врагов»: переключение типа, все 4 генератора работают и добавляют врага в бой.
const S = require('./setup');
const H = require('./lib');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { gm } = await S.setupSession();
  const r = await gm.evaluate(async () => {
    const out = {};
    out.panels = Array.from(document.querySelectorAll('.panel h2')).map(h => h.textContent).filter(t => /Генератор (бандита|мага|драугра|изгоя|врагов)/.test(t));
    const vis = () => Array.from(document.querySelectorAll('.enemy-gen-pane')).filter(p => p.style.display !== 'none').map(p => p.dataset.enemyGen);
    out.initial = vis();
    const n0 = (window.__lastEnemies = null, 0);
    const steps = [['bandit', 'generateBandit', 'addGeneratedBanditToCombat', 'bandit-gen-result'],
      ['mage', 'generateMageBandit', 'addGeneratedMageBanditToCombat', 'bandit-mage-gen-result'],
      ['draugr', 'generateDraugr', 'addGeneratedDraugrToCombat', 'draugr-gen-result'],
      ['forsworn', 'generateForsworn', 'addGeneratedForswornToCombat', 'forsworn-gen-result']];
    out.steps = [];
    for (const [k, g, a, res] of steps) {
      const sel = document.getElementById('enemy-gen-kind'); sel.value = k; sel.dispatchEvent(new Event('change'));
      const v = vis();
      window[g]();
      const txt = document.getElementById(res).innerText.slice(0, 60);
      await window[a]();
      await new Promise(r => setTimeout(r, 400));
      out.steps.push({ k, visible: v, result: txt, saved: localStorage.getItem('gm_enemy_gen_kind') });
    }
    out.draugrOpts = document.getElementById('draugr-gen-type').options.length;
    out.forswornOpts = document.getElementById('forsworn-gen-type').options.length;
    return out;
  });
  await wait(800);
  const sess = Object.entries(H.store).find(([k]) => k.startsWith('sessions/'));
  const enemies = (sess && sess[1].doc.enemies) || [];
  console.log(JSON.stringify(r, null, 1));
  console.log('enemies in session:', enemies.map(e => e.name));
  // перезагрузка помнит выбор
  await gm.reload(); await wait(2000);
  console.log('after reload:', await gm.evaluate(() => [document.getElementById('enemy-gen-kind').value, Array.from(document.querySelectorAll('.enemy-gen-pane')).filter(p => p.style.display !== 'none').map(p => p.dataset.enemyGen)]));
  console.log('issues:', JSON.stringify(H.issues.filter(i => !/confirm|alert/.test(i.kind || ''))).slice(0, 800));
  await H.close();
})();
