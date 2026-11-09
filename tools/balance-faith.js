// ============================================================================
// tools/balance-faith.js — сила героев 50 уровня с учётом веры, зачарований, мантий,
// лича, вампира-лорда и оборотня (стенд, не CI). Запуск из корня: node tools/balance-faith.js
//
// В отличие от balance-highlevel.js урон не читается с листа, а меряется настоящими атаками:
// герой бьёт манекен (Мамонт «элита», 999999 ОЗ, физ. резист 10%), мастер применяет урон,
// скрипт смотрит, сколько ОЗ ушло. Так в цифру попадают все добавки, которые считаются только
// при ударе: огонь Мерунеса, стихия Акатоша, пробитие Кинарет/Кловиса, чистый урон Намиры и т.п.
// Промахи не считаются (бросок повторяется), шанс попадания выводится отдельно из модификатора.
//
// Сценарии зачарований (уровень «друг-зачарователь»: навык 60, Великий камень, 2 ранга общего перка
// и перк стихии): оружие «Урон огнем» 30; «полный набор» = оружие + 4 вещи «Повышение навыка» по 50%
// (воины: перчатки, сапоги, кольцо, ожерелье; лучник: шлем, перчатки, кольцо, ожерелье);
// маг: обруч, кольцо, ожерелье «Повышение навыка: Разрушение» по 31%.
// У аэдра ожерелье занято амулетом бога — его зачарование пропадает.
// ============================================================================
const path = require('path');
const fs = require('fs');
process.env.SITE = process.env.SITE || path.resolve(__dirname, '..');
const S = require('../tests/e2e/setup');
const K = +(process.env.K || 4); // ударов на замер

const WEP_FIRE = 30, BOOST_W = 50, BOOST_D = 31;
const AEDRA = { zenithar: 'Амулет Зенитара', stendarr: 'Амулет Стендарра', julianos: 'Амулет Джулианоса', mara: 'Амулет Мары', dibella: 'Амулет Дибеллы', kynareth: 'Амулет Кинарет', arkay: 'Амулет Аркея', talos: 'Амулет Талоса', akatosh: 'Амулет Акатоша' };
const WAR_GODS = ['none', 'zenithar', 'stendarr', 'kynareth', 'mara', 'akatosh', 'arkay', 'boethiah', 'malacath', 'azura', 'mehrunes', 'namira', 'clavicus', 'molag', 'hircine'];
const ARCH_GODS = ['none', 'kynareth', 'akatosh', 'boethiah', 'nocturnal', 'azura', 'mehrunes', 'namira', 'clavicus', 'molag', 'hircine'];
const MAGE_GODS = ['none', 'julianos', 'mara', 'akatosh', 'hermaeus', 'mehrunes', 'nocturnal', 'molag', 'azura'];

const BUILDS = [
  { id: 'two-handed', kind: 'melee', boost: 'Повышение навыка: «Двуручное оружие»', boostSlots: ['gloves', 'boots', 'ring', 'neck'],
    stats: { str: 26, dex: 14, con: 22, int: 10, wis: 10, cha: 10 }, skills: { 'Двуручное оружие': 100, 'Тяжелая броня': 100, 'Кузнечное дело': 100, 'Восстановление': 50 },
    gear: [['Эбонитовый боевой молот', 'melee'], ['Эбонитовая броня', 'chest'], ['Эбонитовый шлем', 'helmet'], ['Эбонитовые перчатки', 'gloves'], ['Эбонитовые сапоги', 'boots']], gods: WAR_GODS },
  { id: 'knight', kind: 'melee', boost: 'Повышение навыка:«Одноручное оружие»', boostSlots: ['gloves', 'boots', 'ring', 'neck'],
    stats: { str: 24, dex: 14, con: 24, int: 10, wis: 10, cha: 10 }, skills: { 'Одноручное оружие': 100, 'Блокирование': 100, 'Тяжелая броня': 100, 'Кузнечное дело': 80 },
    gear: [['Эбонитовый меч', 'melee'], ['Эбонитовый щит', 'shield'], ['Эбонитовая броня', 'chest'], ['Эбонитовый шлем', 'helmet'], ['Эбонитовые перчатки', 'gloves'], ['Эбонитовые сапоги', 'boots']], gods: WAR_GODS },
  { id: 'archer', kind: 'ranged', boost: 'Повышение навыка:«Стрельба»', boostSlots: ['helmet', 'gloves', 'ring', 'neck'],
    stats: { str: 12, dex: 26, con: 18, int: 10, wis: 14, cha: 10 }, skills: { 'Стрельба': 100, 'Легкая броня': 100, 'Скрытность': 100, 'Кузнечное дело': 60 },
    gear: [['Эбонитовый лук', 'ranged'], ['Эбонитовая стрела', 'ammo'], ['Стеклянная броня', 'chest'], ['Стеклянный шлем', 'helmet'], ['Стеклянные перчатки', 'gloves'], ['Стеклянные сапоги', 'boots']], gods: ARCH_GODS },
  { id: 'assassin', kind: 'melee', sneak: true, boost: 'Повышение навыка:«Одноручное оружие»', boostSlots: ['gloves', 'boots', 'ring', 'neck'],
    stats: { str: 18, dex: 26, con: 18, int: 10, wis: 10, cha: 10 }, skills: { 'Одноручное оружие': 100, 'Скрытность': 100, 'Легкая броня': 100, 'Алхимия': 100, 'Кузнечное дело': 60 },
    gear: [['Эбонитовый меч', 'melee'], ['Стеклянная броня', 'chest'], ['Стеклянный шлем', 'helmet'], ['Стеклянные перчатки', 'gloves'], ['Стеклянные сапоги', 'boots']], gods: WAR_GODS },
  { id: 'dual', kind: 'melee', boost: 'Повышение навыка:«Одноручное оружие»', boostSlots: ['gloves', 'boots', 'ring', 'neck'],
    stats: { str: 22, dex: 22, con: 20, int: 10, wis: 10, cha: 10 }, skills: { 'Одноручное оружие': 100, 'Легкая броня': 100, 'Кузнечное дело': 80, 'Алхимия': 60 },
    gear: [['Эбонитовый меч', 'melee'], ['Эбонитовый меч', 'melee_offhand'], ['Стеклянная броня', 'chest'], ['Стеклянный шлем', 'helmet'], ['Стеклянные перчатки', 'gloves'], ['Стеклянные сапоги', 'boots']], gods: WAR_GODS },
  { id: 'destruction', kind: 'spell', boost: 'Повышение навыка:«Разрушение»', boostSlots: ['circlet', 'ring', 'neck'],
    stats: { str: 10, dex: 12, con: 18, int: 26, wis: 20, cha: 10 }, skills: { 'Разрушение': 100, 'Восстановление': 80, 'Изменение': 80, 'Зачарование': 60 },
    gear: [['Роба разрушения', 'robe'], ['Медный обруч с рубином', 'circlet']], gods: MAGE_GODS }
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

(async () => {
  const { gm, players, code, H, wait } = await S.setupSession();
  const pl = players[0]; const sk = 'sessions/' + code;
  const enemies = () => (H.store[sk].doc.enemies || []);
  let eid = null;
  async function freshTarget() {
    await S.gmAddEnemy(gm, 'Мамонт', { 'enemy-hp-input': '999999', 'enemy-rank-select': 'elite' }); await wait(1200);
    const list = enemies(); eid = list[list.length - 1].id;
  }
  await freshTarget();
  await pl.evaluate(() => { window.alert = m => { (window.__al = window.__al || []).push(String(m)); }; window.confirm = () => true; try { combatActionAllowed = () => true; } catch (e) { } try { bonusActionAllowed = () => true; } catch (e) { } try { rangedAmmoReady = () => true; } catch (e) { } });

  // Один удар до попадания: возвращает { lost, mod, dmg, log }
  async function hitOnce(action, opts) {
    const e0 = enemies().find(e => e.id === eid); if (!e0 || e0.curHp < 500000) { await freshTarget(); }
    const hp0 = enemies().find(e => e.id === eid).curHp;
    const r = await pl.evaluate(([eid, action, opts]) => {
      window.__al = [];
      if (opts.mp) { document.getElementById('cur-mp').value = 99999; }
      window.renderAttackTargetSelect();
      document.getElementById('attack-target-select').value = eid;
      const sel = document.getElementById('attack-action-select'); sel.value = action;
      if (sel.value !== action) return { err: 'no action ' + action };
      document.getElementById('chk-power-attack').checked = !!opts.power;
      document.getElementById('chk-sneak-attack').checked = !!opts.sneak;
      document.getElementById('chk-enhanced-cast').checked = !!opts.enhanced;
      for (let i = 0; i < 60; i++) {
        const mp0 = parseInt(document.getElementById('cur-mp').value) || 0;
        pendingPlayerAttack = null;
        window.rollPlayerAttack();
        const pa = pendingPlayerAttack;
        const txt = (document.getElementById('attack-roll-text') || {}).innerText || '';
        const m = txt.match(/1d20 \((\d+)\)\s*([+-−]\s*\d+)/);
        const mod = m ? parseInt(m[2].replace(/[−\s]/g, s => s === '−' ? '-' : '')) : null;
        const cost = mp0 - (parseInt(document.getElementById('cur-mp').value) || 0);
        if (pa) { window.attackStepNext(); window.applyPlayerAttackDamage(); return { mod, cost, dmg: pa.dmg, log: (pa.logText || '').slice(0, 300) }; }
        const b = document.getElementById('attack-step-btn'); if (b && b.style.display !== 'none') window.attackStepNext();
        if (opts.mp) document.getElementById('cur-mp').value = 99999;
        if ((window.__al || []).filter(a => !/Урон применён/.test(a)).length > 5) return { err: 'alerts ' + window.__al.slice(-2).join(' | ') };
      }
      return { err: 'never hit', al: (window.__al || []).slice(-2) };
    }, [eid, action, opts || {}]);
    if (r.err) return r;
    await wait(650);
    const e1 = enemies().find(e => e.id === eid);
    r.lost = hp0 - (e1 ? e1.curHp : 0);
    if (r.lost > 100000) { r.instakill = true; await freshTarget(); }
    return r;
  }
  async function measure(action, opts) {
    const xs = [], mods = [], costs = []; let ik = 0, err = null, log = '', skip = 0; const action2 = a => a;
    for (let i = 0; i < K; i++) {
      const r = await hitOnce(action, opts);
      if (r.err) { err = r.err + (r.al ? ' ' + r.al.join('|') : ''); break; }
      if (r.instakill) { ik++; continue; }
      if (r.lost < 20 && action2(action) === 'ranged') { i--; skip++; if (skip > 40) { err = 'no ammo'; break; } continue; } // кончились стрелы стенда: удар «луком в ближнем бою» не считаем
      xs.push(r.lost); if (r.mod !== null) mods.push(r.mod); costs.push(r.cost); log = r.log;
      if (process.env.DEBUGLOW && r.lost < 20) console.error('LOW', r.lost, r.log);
    }
    const avg = xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    return { avg, min: Math.min(...xs), max: Math.max(...xs), mod: mods[0], cost: costs[0], ik, err, log };
  }
  async function sheetNow() {
    return pl.evaluate(() => {
      const v = id => (document.getElementById(id) || {}).value;
      let res = {}; try { res = computeTotalResistances(); } catch (e) { }
      return { hp: +v('max-hp'), mp: +v('max-mp'), armor: +(document.getElementById('armor-total') || {}).value || +(document.getElementById('armor-total') || {}).innerText || 0, phys: res.physical || res.phys || 0, magic: res.magic || 0, god: v('faith-god'), rank: v('faith-rank') };
    });
  }

  const out = [];
  for (const b of BUILDS) {
    if (ONLY && !ONLY.includes(b.id)) continue;
    console.error('== build', b.id);
    await pl.evaluate((b) => {
      saveLocalStorage(true);
      const d = JSON.parse(localStorage.getItem('skyrim_ttrpg_save_v3_6'));
      const build = buildsData.find(x => x.id === b.id);
      d.characterLevel = 50; d.levelScheme = 2; d.levelUpProgress = 0; d.perkPointsAvailable = 0;
      d.stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => String(b.stats[k]));
      d.skills = skillNames.map(n => String(b.skills[n] || 30));
      d.perkStates = {};
      build.perks.forEach(p => {
        const si = skillNames.indexOf(p.tree), pi = (fullPerksManifest[p.tree] || []).findIndex(x => x.name === p.perk);
        if (si < 0 || pi < 0) return;
        const steps = p.steps || fullPerksManifest[p.tree][pi].steps || 1;
        for (let k = 1; k <= steps; k++) d.perkStates[`skill${si}-perk${pi}-step${k}`] = true;
      });
      d.inventory = []; d.equippedSlots = {}; d.faithGod = 'none'; d.faithRank = 1;
      d.supernaturalState = { lycanthropy: false, vampirism: false, werewolf: { heartsEaten: 0, totem: '— нет —', transformsToday: 0, isTransformed: false }, vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 }, lich: null };
      applyCharacterData(d); updateAll(); saveLocalStorage(true);
    }, b);
    await wait(800);
    const extra = [['Золотое кольцо', 'ring'], ['Золотое ожерелье', 'amulet']];
    const aedraNeeded = b.gods.filter(g => AEDRA[g]).map(g => [AEDRA[g], 'amulet']);
    const all = b.gear.concat(extra).concat(aedraNeeded);
    for (const [n, slot] of all) { await S.gmGive(gm, n, slot === 'ammo' ? 400 : 1); await wait(250); }
    await wait(800);
    for (const [n, slot] of b.gear.concat(extra)) { if (slot === 'ammo') { await pl.evaluate(n => { const it = playerInventory.find(i => i.name === n); if (it) equipAmmo(it.itemId); }, n); continue; } const r = await S.plEquip(pl, n, slot); if (typeof r === 'string' && /NOITEM/.test(r)) console.error(b.id, r); }
    // learn destruction spells for mage
    let spellActs = [];
    if (b.kind === 'spell') {
      spellActs = await pl.evaluate(() => {
        Object.values(spellsData.destr || {}).flat().forEach(s => { if (s && s.name) { try { learnSpellIntoBook('destr', s.name); } catch (e) { } } });
        updateAll();
        // кандидаты: 3 лучших по урону с листа
        const c = [];
        customSpells.filter(s => s.school === 'destr').forEach(s => {
          const desc = liveSpellDesc(s); const base = parseSpellDamageFromDesc(desc, false) || 0; if (!base) return;
          const r = computeSpellDamage(s.name, 'destr', base);
          if (/радиус|всех враг|в течение/i.test(desc.split(/Усил/i)[0])) return; // одиночные удары
          c.push({ act: 'spell:' + s.id, name: s.name, dmg: r.dmg, cost: s.baseCost || 0 });
        });
        c.sort((a, b) => b.dmg - a.dmg);
        return c.slice(0, 3);
      });
      console.error('mage candidates', JSON.stringify(spellActs));
    }
    const action = b.kind === 'melee' ? 'melee' : b.kind === 'ranged' ? 'ranged' : null;

    // Сценарий: god, ench (0 нет, 1 оружие, 2 полный набор), sn (none|lord|lordform|wolf|lich1|lich2|vampire)
    async function scenario(god, ench, sn) {
      await pl.evaluate(([b, god, ench, sn, AEDRA, WEP_FIRE, BOOST_W, BOOST_D]) => {
        const inv = n => playerInventory.find(i => i.name === n);
        const bySlot = s => equippedSlots[s] ? playerInventory.find(i => i.itemId === equippedSlots[s]) : null;
        // сверхъестественное
        const s = { lycanthropy: false, vampirism: false, werewolf: { heartsEaten: 0, totem: '— нет —', transformsToday: 0, isTransformed: false }, vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 }, lich: null, faithShift: null };
        if (sn === 'vampire' || sn === 'lord' || sn === 'lordform') { s.vampirism = true; s.vampire.hungerStage = 1; }
        if (sn === 'lord' || sn === 'lordform') {
          s.vampire.isLord = true; s.vampire.lordKills = 156; s.vampire.lordForm = sn === 'lordform';
          ['Сила Могилы', 'Хватка вампира', 'Вызов гаргульи', 'Трупное проклятье', 'Обнаружение существ', 'Туманная форма', 'Сверхъестественные рефлексы', 'Лечение кровью', 'Неземные желания', 'Ядовитые когти', 'Плащ ночи'].forEach(n => { s.vampire.lordPerks[n] = true; });
        }
        if (sn === 'wolf') { s.lycanthropy = true; s.werewolf.heartsEaten = 25; s.werewolf.isTransformed = true; }
        if (sn === 'lich1' || sn === 'lich2') s.lich = Object.assign(window.lichDefault(), { perks: { pact: true, bearer: true, herald: true, visage: true }, stage: sn === 'lich1' ? 1 : 2 });
        playerSupernaturalState = s;
        try { _lichSig = ''; } catch (e) { }
        // вера
        const fg = document.getElementById('faith-god'), fr = document.getElementById('faith-rank');
        fg.disabled = false;
        fg.value = god; fr.value = 3;
        // зачарования: снять всё
        playerInventory.forEach(i => { if (i.__benchEnch) { delete i.enchantment; delete i.__benchEnch; } });
        const setE = (it, name, value, unit) => { if (!it) return; it.enchantment = { name, value, unit: unit || '%', description: '' }; it.__benchEnch = true; };
        // ожерелье: амулет бога (аэдра) или золотое ожерелье
        const neckItem = AEDRA[god] ? inv(AEDRA[god]) : inv('Золотое ожерелье');
        if (neckItem && (!bySlot('neck') || bySlot('neck').itemId !== neckItem.itemId)) applyItemToSlot(neckItem, 'amulet');
        if (ench >= 1) {
          const w = b.kind === 'melee' ? bySlot('meleeWeapon') : b.kind === 'ranged' ? bySlot('rangedWeapon') : null;
          setE(w, 'Урон огнем', WEP_FIRE, 'урона');
        }
        if (ench >= 2) {
          b.boostSlots.forEach(sl => { const it = bySlot(sl); if (!it) return; if (sl === 'neck' && AEDRA[god]) return; setE(it, b.boost, b.kind === 'spell' ? BOOST_D : BOOST_W); });
        }
        try { if (typeof lichAfterStateChange === 'function') lichAfterStateChange(); } catch (e) { }
        if (sn === 'lich1' || sn === 'lich2') { fg.value = 'ideal'; }
        if (sn === 'lord' || sn === 'lordform') { fg.value = 'molag'; fr.value = 3; }
        if (sn === 'wolf') { fg.value = 'hircine'; fr.value = 3; }
        if (sn === 'paladin' || sn === 'paladinC') { // ветка паладина: перки 1, 2, 3а (избавитель), 4; клятва возмездия; C = круг активен
          lastFaithGod = god; characterLevel = 45; document.getElementById('char-level').value = 45; perkPointsAvailable = 6;
          playerQuests = []; for (let i = 0; i < 40; i++) playerQuests.push({ id: 'q' + i, title: 'q' + i, status: 'done', kind: 'resident' });
          plTakePerk('p1'); plChooseVow('vengeance'); plTakePerk('p2'); plTakePerk('p3a'); plTakePerk('p4');
          if (sn === 'paladinC') { powersUsedToday.pl_circle = false; plUseCircle(); }
        }
        updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        document.getElementById('cur-hp').value = document.getElementById('max-hp').value;
        document.getElementById('cur-mp').value = document.getElementById('max-mp').value;
      }, [b, god, ench, sn, AEDRA, WEP_FIRE, BOOST_W, BOOST_D]);
      await wait(150);
      const sh = await sheetNow();
      const row = { build: b.id, god, ench, sn, sheet: sh };
      if (sn === 'lordform') { row.bite = await measure('bite', {}); return row; }
      if (sn === 'wolf') { row.claw = await measure('claw', {}); row.clawPower = await measure('claw', { power: true }); return row; }
      if (action) {
        row.hit = await measure(action, { sneak: !!b.sneak });
        if (b.kind === 'melee') row.power = await measure(action, { power: true });
      } else {
        // маг: лучшие кандидаты, обычный и усиленный каст
        let acts = spellActs.slice();
        if (sn === 'lich1' || sn === 'lich2') {
          const la = await pl.evaluate(() => { window.renderAttackTargetSelect(); return Array.from(document.getElementById('attack-action-select').options).map(o => [o.value, o.text]).filter(o => /Ледяное испепеление/.test(o[1])).map(o => ({ act: o[0], name: 'Ледяное испепеление' })); });
          acts = la.concat(acts.slice(0, 1));
        }
        row.spells = [];
        for (const a of acts) {
          const n = await measure(a.act, { mp: true });
          const e = await measure(a.act, { mp: true, enhanced: true });
          row.spells.push({ name: a.name, n, e });
        }
      }
      return row;
    }

    const plan = [];
    // зачарования без бога
    for (const ench of [0, 1, 2]) plan.push(['none', ench, 'none']);
    // все боги при зачарованном оружии (и полный набор для мага — у него оружия нет)
    const baseEnch = b.kind === 'spell' ? 2 : 1;
    for (const g of b.gods) if (g !== 'none') plan.push([g, baseEnch, 'none']);
    // сверхъестественное
    plan.push(['none', baseEnch, 'vampire']);
    plan.push(['molag', baseEnch, 'lord']);
    if (b.kind !== 'spell') plan.push(['molag', baseEnch, 'lordform']);
    if (b.kind !== 'spell') plan.push(['hircine', baseEnch, 'wolf']);
    if (b.kind !== 'spell') { plan.push(['kynareth', 1, 'paladin']); plan.push(['kynareth', 1, 'paladinC']); }
    plan.push(['none', baseEnch, 'lich1']);
    plan.push(['none', baseEnch, 'lich2']);
    const PLAN = process.env.PLAN ? process.env.PLAN.split(',') : null; // например PLAN=none:1:none,none:1:vampire
    for (const [g, e, sn] of plan) {
      if (PLAN && !PLAN.includes(g + ':' + e + ':' + sn)) continue;
      const row = await scenario(g, e, sn);
      console.error(b.id, g, e, sn, JSON.stringify(row).slice(0, 400));
      out.push(row);
    }
  }
  const file = path.join(__dirname, 'out-balance-faith' + (ONLY ? '-' + ONLY.join('_') : '') + (process.env.TAG ? '-' + process.env.TAG : '') + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('written', file, out.length);
  console.log('issues', JSON.stringify(H.issues).slice(0, 1500));
  await H.close();
})();
