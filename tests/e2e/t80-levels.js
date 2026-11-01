// Шкала уровней 2: потолок 65, пересчёт старых листов (levelScheme), выдача уровня мастером.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0];
  const out = {};
  out.unit = await pl.evaluate(() => {
    const need = [1, 2, 5, 6, 10, 20, 40, 64].map(l => getSkillUpsNeededForLevel(l));
    let sum = 0; for (let l = 1; l < 65; l++) sum += getSkillUpsNeededForLevel(l);
    return { need, sum, oldMaxFrom1665: (() => { let L = 1; while ((L) * (L + 3) <= 1665) L++; return L; })() };
  });
  const cnt = async () => pl.evaluate(() => Object.values(JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6')).perkStates).filter(Boolean).length);
  // 1) рост: старый лист 20 ур. + 5 прогресса
  out.up = await pl.evaluate(() => {
    saveLocalStorage(true);
    const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
    delete d.levelScheme; d.characterLevel = 20; d.levelUpProgress = 5; d.perkPointsAvailable = 2;
    window.__old20 = JSON.stringify(d);
    applyCharacterData(d);
    return { lvl: characterLevel, prog: levelUpProgress, pts: perkPointsAvailable, summary: document.getElementById('level-summary').innerText, ready: document.getElementById('levelup-ready-block').style.display };
  });
  await wait(800);
  out.upDialogs = pl.__dialogs.splice(0);
  out.applied = await pl.evaluate(() => {
    let n = 0; while (document.getElementById('levelup-ready-block').style.display === 'block' && n < 100) { applyLevelUp(); n++; }
    saveLocalStorage(true);
    const saved = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
    return { n, lvl: characterLevel, prog: levelUpProgress, pts: perkPointsAvailable, savedScheme: saved.levelScheme, savedLvl: saved.characterLevel };
  });
  pl.__dialogs.splice(0);
  // 2) повторная загрузка того же (уже пересчитанного) сейва — ничего не меняется
  out.again = await pl.evaluate(() => { const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6')); applyCharacterData(d); return { lvl: characterLevel, prog: levelUpProgress, pts: perkPointsAvailable }; });
  await wait(600); out.againDialogs = pl.__dialogs.splice(0);
  // 3) низкий уровень (4, прогресс 3) — без изменений и без сообщения
  out.low = await pl.evaluate(() => { const d = JSON.parse(window.__old20); d.characterLevel = 4; d.levelUpProgress = 3; applyCharacterData(d); return { lvl: characterLevel, prog: levelUpProgress, ready: document.getElementById('levelup-ready-block').style.display }; });
  await wait(600); out.lowDialogs = pl.__dialogs.splice(0);
  // 4) падение: 80 ур. от мастера, 1 свободное очко, 3 взятые ступени перков → 65, снимаются 14 перков-очков
  out.down = await pl.evaluate(() => {
    const d = JSON.parse(window.__old20); d.characterLevel = 80; d.levelUpProgress = 0; d.perkPointsAvailable = 1;
    d.perkStates = Object.assign({}, d.perkStates, { 'skill0-perk0-step1': true, 'skill0-perk0-step2': true, 'skill0-perk3-step3': true });
    applyCharacterData(d);
    const chk = id => document.getElementById(id).checked;
    return { lvl: characterLevel, prog: levelUpProgress, pts: perkPointsAvailable, perks: [chk('perk-0-0-1'), chk('perk-0-0-2'), chk('perk-0-3-3')], ready: document.getElementById('levelup-ready-block').style.display, summary: document.getElementById('level-summary').innerText };
  });
  await wait(600); out.downDialogs = pl.__dialogs.splice(0);
  // 5) мастер: готовый уровень после пересчёта не сгорает при выдаче уровня мастером
  await pl.evaluate(() => { const d = JSON.parse(window.__old20); applyCharacterData(d); });
  await wait(1500); pl.__dialogs.splice(0);
  const before = await pl.evaluate(() => ({ lvl: characterLevel, prog: levelUpProgress }));
  await gm.evaluate(() => { const sel = document.getElementById('inv-player-select'); sel.value = 'p1'; window.loadPlayerInventoryForGm(); });
  await wait(1200);
  out.gmText = await gm.evaluate(() => document.getElementById('inv-level-progress').textContent);
  await gm.evaluate(() => { document.getElementById('inv-level-stat-choice').value = 'str'; window.grantLevelUp(); });
  await wait(2000);
  out.gm = { before, after: await pl.evaluate(() => ({ lvl: characterLevel, prog: levelUpProgress, pts: perkPointsAvailable })) };
  console.log(JSON.stringify(out, null, 1));
  console.log('issues', JSON.stringify(H.issues).slice(0, 2000));
  await H.close();
})();
