// Поместье, этапы 2–3: закупка материалов, разметка и рабочие дни, мебель, крылья, огород, хранилище, персонал, налёт.
const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession();
  const pl = players[0]; const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  await gm.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('gm-estate-preset').value = 'lakeview'; gmEstateCreate(); });
  await wait(1500);
  await pl.evaluate(() => { window.alert = () => {}; window.confirm = () => true; document.getElementById('char-gold').value = 20000; document.getElementById('tab17-btn').click(); });
  await wait(800);
  await pl.evaluate(() => Estate.enter()); await wait(1000);
  const id = await pl.evaluate(() => Object.keys(CloudSync.getSessionData().estates)[0]);
  const T = async (f, ...a) => pl.evaluate(async (f, a) => { try { return { ok: await eval(f)(...a) }; } catch (e) { return { err: e.message }; } }, f, a);
  // 1. без материалов фундамент не поставить
  let r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.place(e, 'found', [[20, 20]])); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/Не хватает/.test(r), 'без материалов разметка прошла: ' + r);
  // 2. покупка через интерфейс: доски/камень/гвозди/железо/стекло
  await pl.evaluate(() => { Estate.render(); });
  const gold0 = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  for (const m of [['plank', 'sawmill'], ['nails', 'sawmill'], ['stone', 'quarry'], ['iron', 'general'], ['glass', 'general']]) {
    await pl.evaluate(([mat, shop]) => { const i = document.getElementById('estbuy-' + shop + '-' + mat); i.value = 60; Estate.buyMat(mat, i.id); }, m); await wait(500);
  }
  const gold1 = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  chk(gold0 - gold1 === 60 * (8 + 2 + 6 + 25 + 15), 'золото списалось неверно: ' + (gold0 - gold1));
  // 3. разметка фундамента перетаскиванием
  await pl.evaluate(() => {
    Estate.setMode('found'); const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect();
    const at = (x, y, t) => cv.dispatchEvent(new PointerEvent(t, { clientX: r.left + x * 14 + 7, clientY: r.top + y * 14 + 7, bubbles: true }));
    at(20, 20, 'pointerdown'); for (let x = 21; x <= 25; x++) at(x, 20, 'pointermove'); window.dispatchEvent(new PointerEvent('pointerup'));
  });
  await wait(1200);
  let st = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return { plan: Object.keys(e.plan || {}).length, stone: e.stock.stone, found: Object.keys(e.found || {}).length }; }, id);
  chk(st.plan === 6, 'разметка перетаскиванием: ' + JSON.stringify(st));
  chk(st.stone === 60 - Math.ceil(6 * 2 * 1.4), 'камень на фундамент (+40%): ' + JSON.stringify(st));
  // 4. рабочий день мастера достраивает
  await gm.evaluate(() => { gmEstateAdvance(1); }); await wait(1200);
  st = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return { plan: Object.keys(e.plan || {}).length, found: Object.keys(e.found || {}).length, day: e.day }; }, id);
  chk(st.found === 6 && st.plan === 0 && st.day === 1, 'рабочий день не построил: ' + JSON.stringify(st));
  // 5. пол, стена, дверь, окно, крыша + проходимость
  r = await pl.evaluate(async id => {
    const out = [];
    const go = async (op, cells) => { try { await Estate.mutate(id, e => { Estate.R.place(e, op, cells); return ['stock', 'plan', 'planSeq']; }); out.push(op + ':ok'); } catch (e) { out.push(op + ':' + e.message); } };
    await go('floor', [[20, 20], [21, 20], [22, 20]]); await go('wall', [[23, 20]]); await go('door', [[24, 20]]); await go('window', [[25, 20]]); await go('roof', [[20, 20], [21, 20]]);
    return out.join(' | ');
  }, id);
  await gm.evaluate(() => gmEstateAdvance(1)); await wait(1200);
  st = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return { b: e.build, roof: Object.keys(e.roof || {}).length, pass: [Estate.passable(e, 22, 20), Estate.passable(e, 23, 20), Estate.passable(e, 24, 20), Estate.passable(e, 25, 20)] }; }, id);
  chk(st.b['20_20'] === 'floor' && st.b['23_20'] === 'wall' && st.b['24_20'] === 'door' && st.b['25_20'] === 'window' && st.roof === 2, 'постройка: ' + JSON.stringify(st));
  chk(JSON.stringify(st.pass) === '[true,false,true,false]', 'проходимость пол/стена/дверь/окно: ' + JSON.stringify(st.pass));
  // 6. мебель: кровать нужно крыло; выбрать крылья (6 — ошибка, 5 — ок)
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.furn(e, 'bed', 21, 20)); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/крыло/.test(r), 'кровать без крыла: ' + r);
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.wings(e, ['armory', 'library', 'kitchen', 'alchemy', 'enchant', 'greenhouse'])); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/не больше 5/.test(r), '6 крыльев: ' + r);
  await pl.evaluate(async id => { await Estate.mutate(id, e => Estate.R.wings(e, ['bedroom', 'kitchen', 'greenhouse', 'library', 'armory']), ['wings', 'wingsLocked']); }, id);
  // кровать, очаг, сундук (золото платит интерфейс; здесь проверяем правила)
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => { Estate.R.furn(e, 'bed', 21, 20); }, ['stock', 'furn']); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(r === 'ok', 'кровать: ' + r);
  // интерфейсная расстановка: стул на пол за золото
  const g2 = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  await pl.evaluate(() => { document.getElementById('est-furn').value = 'chair'; Estate.setFurnMode(); const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 22 * 14 + 7, clientY: r.top + 20 * 14 + 7, bubbles: true })); });
  await wait(1200);
  const g2b = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  chk(g2 - g2b === 10, 'стул за 10 золотых: ' + (g2 - g2b));
  chk(await pl.evaluate(id => (CloudSync.getSessionData().estates[id].furn['22_20'] || {}).t === 'chair', id), 'стул не появился');
  // 7. огород: грядка на траве, посадка, рост 7 дней, сбор
  r = await pl.evaluate(async id => { await Estate.mutate(id, e => { Estate.R.furn(e, 'planter', 30, 30); Estate.R.plant(e, 30, 30, 'Лаванда'); }, ['stock', 'furn']); return 'ok'; }, id);
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.harvest(e, 30, 30)); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/Ещё не созрело/.test(r), 'сбор до срока: ' + r);
  await gm.evaluate(() => gmEstateAdvance(7)); await wait(1500);
  const inv0 = await pl.evaluate(() => (playerInventory.find(i => i.itemId === 'Лаванда') || { count: 0 }).count);
  await pl.evaluate(() => { Estate.setMode('harvest'); const cv = document.getElementById('estate-canvas'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 30 * 14 + 7, clientY: r.top + 30 * 14 + 7, bubbles: true })); });
  await wait(1500);
  const inv1 = await pl.evaluate(() => (playerInventory.find(i => i.itemId === 'Лаванда') || { count: 0 }).count);
  chk(inv1 - inv0 === 6, 'урожай лаванды в сумку: ' + (inv1 - inv0));
  // 8. хранилище: положить/взять, недельная выработка улья
  r = await pl.evaluate(async id => { await Estate.mutate(id, e => { Estate.R.furn(e, 'hive', 32, 30); }, ['stock', 'furn']); return 'ok'; }, id);
  await gm.evaluate(() => gmEstateAdvance(7)); await wait(1500);
  st = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return { honey: (e.store['Мёд'] || {}).count, lav: (e.store['Лаванда'] || {}).count }; }, id);
  chk(st.honey === 3, 'мёд с улья: ' + JSON.stringify(st)); chk(st.lav === 4, 'лаванда теплицы: ' + JSON.stringify(st));
  // медовуха требует очаг и 2 мёда
  r = await pl.evaluate(async id => { try { await Estate.mutate(id, e => Estate.R.brew(e), ['store']); return 'ok'; } catch (e) { return e.message; } }, id);
  chk(/очаг/.test(r), 'медовуха без очага: ' + r);
  // 9. персонал и налёт
  const g3 = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  await pl.evaluate(() => Estate.hireStaff('steward')); await wait(1000);
  const g4 = await pl.evaluate(() => parseInt(document.getElementById('char-gold').value));
  chk(g3 - g4 === 750, 'жалование управляющего: ' + (g3 - g4));
  await gm.evaluate(() => gmEstateRaid()); await wait(1000);
  st = await pl.evaluate(id => { const e = CloudSync.getSessionData().estates[id]; return { honey: (e.store['Мёд'] || {}).count, log: (e.log || []).slice(-1)[0] }; }, id);
  chk(st.honey === 3, 'налёт при управляющем унёс добро: ' + JSON.stringify(st));
  // месяц без оплаты — работник уходит
  await gm.evaluate(() => gmEstateAdvance(31)); await wait(1500);
  st = await pl.evaluate(id => Object.keys(CloudSync.getSessionData().estates[id].staff || {}), id);
  chk(st.length === 0, 'неоплаченный работник не ушёл: ' + JSON.stringify(st));
  console.log(JSON.stringify({ gold0, gold1 })); fails.forEach(f => console.log('FAIL ' + f));
  console.log('issues', JSON.stringify(H.issues).slice(0, 600));
  await H.close();
})();
