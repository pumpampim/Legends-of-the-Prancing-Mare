// ============================================================================
// SHEET-PRINT.JS — бумажный лист героя (A4, 5 страниц + продолжения) для игроков без компьютера.
// StSheetPrint.html(data)  — HTML листа: data = сейв героя (как в облаке, characters/{uid}) или null — пустой бланк.
// StSheetPrint.open(data)  — открыть лист в новой вкладке и вызвать печать (игрок: stBuildSheet(); мастер: doc.data()).
// Вёрстка — sheet-print.css. Тот же модуль собирает пустой PDF-бланк в общей папке проекта (sheets/src/build.js).
// ============================================================================
(function (root) {
    'use strict';

    const SK = [
        ['Одноручное оружие', 'Сил'], ['Двуручное оружие', 'Сил'], ['Стрельба', 'Лов'], ['Блокирование', 'Сил'],
        ['Тяжелая броня', '—'], ['Легкая броня', '—'], ['Скрытность', 'Лов'], ['Взлом', 'Лов'], ['Карманные кражи', 'Лов'],
        ['Красноречие', 'Хар'], ['Изменение', 'Инт'], ['Разрушение', 'Инт'], ['Восстановление', 'Муд'], ['Колдовство', 'Муд'],
        ['Иллюзия', 'Инт'], ['Алхимия', 'Инт'], ['Кузнечное дело', 'Сил'], ['Зачарование', 'Муд'], ['Кулинария', 'Муд'],
    ];
    const STATS = [
        ['Сила', 'str', '+1 к урону ближнего боя · груз = Сила × 5 фунтов'],
        ['Ловкость', 'dex', '+1 к урону стрельбы и скрытному урону'],
        ['Телосложение', 'con', '+10 к максимуму здоровья'],
        ['Интеллект', 'int', '+10 к максимуму маны'],
        ['Мудрость', 'wis', 'очки на свитки за длительный отдых'],
        ['Харизма', 'cha', 'цены и убеждение'],
    ];
    const RES = [['Огонь', 'fire'], ['Холод', 'frost'], ['Электричество', 'shock'], ['Яд', 'poison'], ['Болезни', 'disease'], ['Магия', 'magic'], ['Крики', 'shout']];
    const RACES = {
        nord: ['Норд', '+10 ХП и +5 ХП за уровень, сопротивление холоду 10 %'], altmer: ['Альтмер', '+20 маны'],
        breton: ['Бретон', 'сопротивление магии 10 %'], orc: ['Орк', 'Берсерк'], khajiit: ['Каджит', 'когти, ночное зрение'],
        redguard: ['Редгард', 'Адреналин'], argonian: ['Аргонианин', 'Кора Хиста, Укус, иммунитет к болезням'],
        bosmer: ['Босмер', 'сопротивление яду 10 %'], dunmer: ['Данмер', 'сопротивление огню 10 %'], imperial: ['Имперец', 'Голос императора'],
    };
    const SIGNS = {
        warrior: ['Воин', '+2 Силы, +2 Телосложения'], mage: ['Маг', '+2 Инт или Муд; раз до рассвета заклинание 1 круга без маны'],
        thief: ['Вор', '+2 Ловкости, скорость +5 фт'], atronach: ['Атронах', 'мана +20 и +12 за уровень, медленное восстановление'],
        apprentice: ['Ученик', 'мана +10 и +10 за уровень, уязвимость к одной стихии'], steed: ['Конь', '+2 Телосложения, скорость +10 фт'],
        lady: ['Леди', '+2 Мудрости, +2 Телосложения'], lord: ['Лорд', 'Кровь Севера: лечение раз в день'],
        zmey: ['Змей', 'раз в день: исцелить болезнь и снять магический эффект'], ritual: ['Ритуал', 'Дар Мары: лечение действием'],
        lover: ['Любовник', 'Поцелуй любовника: паралич касанием'], shadow: ['Тень', 'Лунная тень: невидимость раз в день'],
        tower: ['Башня', '«Открывание» без маны раз в день'],
    };
    const GODS = {
        zenithar: 'Зенитар', stendarr: 'Стендарр', julianos: 'Джулианос', mara: 'Мара', dibella: 'Дибелла', kynareth: 'Кинарет', arkay: 'Аркей',
        talos: 'Талос', akatosh: 'Акатош', boethiah: 'Боэтия', mephala: 'Мефала', peryite: 'Периайт', hermaeus: 'Хермеус Мора', nocturnal: 'Ноктюрнал',
        malacath: 'Малакат', azura: 'Азура', meridia: 'Меридия', mehrunes: 'Мерунес Дагон', sanguine: 'Сангвин', namira: 'Намира', vaermina: 'Вермина',
        sheogorath: 'Шеогорат', clavicus: 'Клавикус Вайл', molag: 'Молаг Бал', hircine: 'Хирсин',
    };
    const AEDRA = ['zenithar', 'stendarr', 'julianos', 'mara', 'dibella', 'kynareth', 'arkay', 'talos', 'akatosh'];
    const SCHOOLS = { destr: 'Разрушение', restor: 'Восстановление', alter: 'Изменение', illus: 'Иллюзия', conj: 'Колдовство' };
    const CIRCLES = { 1: 'Новичок', 2: 'Ученик', 3: 'Адепт', 4: 'Эксперт', 5: 'Мастер' };
    const SOULS = [['Крохотный', 'крохотный'], ['Маленький', 'маленький'], ['Обычный', 'обычный'], ['Большой', 'большой'], ['Великий', 'великий'], ['Чёрный', 'чёрный']];
    const VOWS = { watch: 'дозорного', justice: 'правосудия', vengeance: 'возмездия' };

    // Версия этого скрипта (?v= из index.html/gm.html) — ею помечаем ссылку на sheet-print.html, чтобы не брать старую из кэша.
    const SCRIPT_V = (function () { try { const m = /[?&]v=([^&]+)/.exec((document.currentScript || {}).src || ''); return m ? m[1] : ''; } catch (e) { return ''; } })();

    // ---------- мелочи ----------
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rep = (n, f) => Array.from({ length: Math.max(0, n) }, (_, i) => f(i)).join('');
    const num = x => { const n = parseFloat(x); return isFinite(n) ? n : null; };
    const show = x => (x === null || x === undefined || x === '' ? '' : esc(x));
    const signed = n => (n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0');
    const modOf = v => Math.floor((v - 10) / 2);
    const levelCost = L => Math.min(L * 2 + 2, 9 + Math.ceil(L / 2));
    const val = x => (x === '' || x === null || x === undefined ? '' : `<span class="val">${esc(x)}</span>`);
    const field = (label, v, cls) => `<div class="f ${cls || ''}"><div class="line">${val(v)}</div><div class="lab">${label}</div></div>`;
    const box = (label, v, cls) => `<div class="bx ${cls || ''}"><div class="bxv">${val(v)}</div><div class="lab">${label}</div></div>`;
    const sec = (t, inner, cls) => `<section class="sec ${cls || ''}"><h3><span>${t}</span></h3>${inner}</section>`;
    const pips = (n, filled) => `<span class="pips">${rep(n, i => `<i${i < (filled || 0) ? ' class="on"' : ''}></i>`)}</span>`;
    const ck = on => `<span class="ck${on ? ' on' : ''}"></span>`;
    const lines = (n, texts) => `<div class="lines">${rep(n, i => `<div class="ln">${val((texts || [])[i])}</div>`)}</div>`;
    // Таблица: rows — массив массивов ячеек (уже HTML) или число пустых строк; min — сколько строк минимум.
    function grid(heads, rows, widths, cls, min) {
        const body = (rows || []).map(r => `<tr>${r.map(c => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('') +
            rep((min || 0) - (rows || []).length, () => `<tr>${heads.map(() => '<td></td>').join('')}</tr>`);
        return `<table class="grid ${cls || ''}"><colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    }
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

    // ---------- данные героя → что печатать ----------
    function extract(d) {
        if (!d) return null;
        const es = d.effectiveStats;
        const statArr = (es && !Array.isArray(es) && typeof es === 'object') ? ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => es[k]) : (es || d.stats || []);
        const stats = {}; ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach((k, i) => { stats[k] = num(statArr[i]); });
        const vit = d.vitals || [];
        const inv = Array.isArray(d.inventory) ? d.inventory.filter(i => i && i.name && (i.count || 0) > 0) : [];
        const eqIds = Object.values(d.equippedSlots || {}).filter(x => typeof x === 'string');
        const invWeight = inv.reduce((s, i) => s + (num(i.weight) || 0) * (num(i.count) || 0), 0);
        const lvl = parseInt(d.characterLevel || d.lvl) || 1;
        const armorParts = ['sHelmA', 'sChestA', 'sRobeA', 'sGlovesA', 'sBootsA', 'sShieldA'].map(k => num(d[k]) || 0);
        const res = d.resistances || {};
        const countBy = re => inv.filter(i => re.test(i.name)).reduce((s, i) => s + (num(i.count) || 0), 0);
        const ss = d.supernaturalState || {};
        const god = d.faithGod && d.faithGod !== 'none' ? d.faithGod : '';
        // заклинание → круг по справочнику spell-data.js (если загружен)
        const SD = root.spellsData || {};
        const circleOf = (school, name) => { const s = SD[school] || {}; for (const k of Object.keys(s)) if ((s[k] || []).some(x => x.name === name)) return CIRCLES[k] || ''; return ''; };
        // fullPerksManifest — const во встроенном скрипте index.html (на window его нет); у мастера его нет вовсе — описания перков пустые
        const manifest = (typeof fullPerksManifest !== 'undefined' ? fullPerksManifest : root.fullPerksManifest) || {}; // eslint-disable-line no-undef
        const perkDesc = p => { const t = (manifest[p.tree] || [])[p.p]; return t && t.name === p.name ? t.desc || '' : ''; };
        const firstLine = s => String(s || '').split('\n')[0];
        const pal = d.paladin || null; const palPerks = pal && pal.perks ? Object.keys(pal.perks).filter(k => pal.perks[k]) : [];
        const palNames = palPerks.map(id => ((root.PALADIN_PERKS || []).find(p => p.id === id) || { name: id }).name);
        const lich = ss.lich || null; const lichPerks = lich && lich.perks ? Object.keys(lich.perks).filter(k => lich.perks[k]) : [];
        const lichNames = lichPerks.map(id => ((root.LICH_PERKS || []).find(p => p.id === id) || { name: id }).name);
        const cult = ss.cult || null; const cultGod = cult && cult.god ? ((root.CULT_GODS || {})[cult.god] || {}).name || GODS[cult.god] || cult.god : '';
        const cultPerks = cult && cult.perks ? Object.keys(cult.perks).filter(k => cult.perks[k]) : [];
        const offerDays = root.CULT_OFFER_DAYS || 14;
        const dayStr = n => { n = num(n); if (n === null) return ''; return 'день ' + n; };
        const meleeName = d.wepMName || '', rangedName = d.wepRName || '';
        const isBolt = /арбалет/i.test(rangedName);
        const mStr = stats.str !== null ? modOf(stats.str) : null, mDex = stats.dex !== null ? modOf(stats.dex) : null;
        const weapons = [];
        if (meleeName) weapons.push([meleeName, mStr !== null ? 'Сил ' + signed(mStr) : '', (d.coopDmg && d.coopDmg.melee) || d.wepMDmg || '', /молот|посох|пика|копь/i.test(meleeName) ? '10 фт' : '5 фт', /[а-яё]/i.test(d.wepMType || '') ? d.wepMType : '']);
        if (d.wepMOffhandName && d.wepMOffhandName !== meleeName) weapons.push([d.wepMOffhandName + ' (2-я рука)', mStr !== null ? 'Сил ' + signed(mStr) : '', d.wepMOffhandDmg || '', '5 фт', d.chkDualWield ? 'два оружия' : '']);
        if (rangedName) weapons.push([rangedName, 'Лов ' + (mDex !== null ? signed(mDex) : '') + ' + Стрельба', (d.coopDmg && d.coopDmg.ranged) || d.wepRDmg || '', isBolt ? 'до 80 фт' : '30 фт (предел 80)', (d.amName ? d.amName + (d.amDmg ? ' +' + d.amDmg : '') : '')]);
        return {
            name: d.name || '', race: (RACES[d.race] || [d.race || ''])[0], raceTxt: (RACES[d.race] || [, ''])[1],
            sign: (SIGNS[d.sign] || [''])[0], signTxt: (SIGNS[d.sign] || [, ''])[1],
            level: lvl, prog: num(d.levelUpProgress) || 0, need: lvl >= 65 ? '—' : levelCost(lvl), perkPts: num(d.perkPointsAvailable) || 0,
            lives: d.lives === undefined || d.lives === null ? '' : d.lives,
            stats, curHp: vit[0], curMp: vit[1], maxHp: vit[2], maxMp: vit[3],
            speed: d.speed || '', armor: armorParts.reduce((a, b) => a + b, 0) || '', phys: res.physical !== undefined ? res.physical : '',
            weight: Math.round(invWeight * 10) / 10, wLimit: num(d.maxWeightInput) || (stats.str !== null ? stats.str * 5 : ''),
            res: RES.map(([, k]) => { const v = num(res[k]); return v ? v : (v === 0 ? '' : ''); }),
            skills: SK.map((s, i) => ({ v: num((d.effectiveSkills || d.skills || [])[i]), prog: Math.floor(num((d.skillProgress || [])[i]) || 0) })),
            weapons,
            perks: (Array.isArray(d.takenPerks) ? d.takenPerks : []).map(p => ({ tree: p.tree || '', name: p.name || '', taken: p.taken || 0, steps: p.steps || 1, desc: perkDesc(p) })),
            spells: (Array.isArray(d.customSpells) ? d.customSpells : []).filter(s => s && s.name).map(s => ({ name: s.name, school: SCHOOLS[s.school] || '', circle: circleOf(s.school, s.name), cost: s.baseCost || '', desc: firstLine(s.desc) })),
            god: GODS[god] || '', aedra: god && AEDRA.includes(god), daedra: god && !AEDRA.includes(god), rank: parseInt(d.faithRank) || 0,
            amulet: !!(d.sNeck && /амулет/i.test(d.sNeck) && god && new RegExp((GODS[god] || '#').slice(0, 4), 'i').test(d.sNeck)),
            faithNotes: d.faithNotes || '',
            vamp: !!ss.vampirism, hunger: (ss.vampire && ss.vampire.hungerStage) || 0, vampLord: !!(ss.vampire && ss.vampire.isLord),
            wolf: !!ss.lycanthropy, wolfTr: ss.werewolf ? (ss.werewolf.transformsToday || 0) : '', wolfTotem: ss.werewolf && ss.werewolf.totem && ss.werewolf.totem !== '— нет —' ? ss.werewolf.totem : '',
            pal: !!(pal && palPerks.length && !pal.abandoned), palVow: pal ? pal.vow : '', palOk: !!(pal && palPerks.length && !pal.fallen), palNames,
            lich: !!(lich && (lich.stage || lichPerks.length)), lichStage: lich ? lich.stage || 0 : 0, lichNames,
            cult: !!cultGod, cultGod, cultLast: cult && cult.lastOffer !== null && cult.lastOffer !== undefined ? dayStr(cult.lastOffer) : '',
            cultNext: cult && num(cult.lastOffer) !== null ? dayStr(num(cult.lastOffer) + offerDays) : '', cultPerks: cultPerks.length ? cultPerks.length + ' шт.' : '',
            slots: [
                [meleeName, d.wepMDmg], [d.wepMOffhandName && d.wepMOffhandName !== meleeName ? d.wepMOffhandName : '', d.wepMOffhandDmg], [d.sShield, d.sShieldA],
                [rangedName, d.wepRDmg], [d.amName, d.amDmg], [d.sHelm, d.sHelmA], [[d.sChest, d.sRobe].filter(Boolean).join(' / '), (num(d.sChestA) || 0) + (num(d.sRobeA) || 0) || ''],
                [d.sGloves, d.sGlovesA], [d.sBoots, d.sBootsA], [d.sNeck, ''], [d.sRing, ''], [d.sCirclet, ''],
            ],
            gold: d.gold === undefined ? '' : d.gold,
            souls: SOULS.map(([, w]) => [countBy(new RegExp('^' + w + ' камень душ$', 'i')), countBy(new RegExp('^заполненный ' + w + ' камень душ$', 'i'))]),
            backpack: (inv.find(i => (d.equippedSlots || {}).backpack === i.itemId) || {}).name || '',
            picks: countBy(/^отмычк/i), torches: countBy(/^факел/i),
            pouch: (Array.isArray(d.pouchContents) ? d.pouchContents : []).map(p => p && (p.name || p.itemName || p.itemId) ? (p.name || p.itemName || p.itemId) + ((p.count || 1) > 1 ? ' ×' + p.count : '') : '').filter(Boolean),
            inv: inv.map(i => [i.name + (eqIds.includes(i.itemId) ? ' (надето)' : ''), i.count, Math.round((num(i.weight) || 0) * (num(i.count) || 0) * 10) / 10 || '']),
            pets: (Array.isArray(d.pets) ? d.pets : []).map(p => [p.name || '', p.kind || '', (p.dead ? '† ' : '') + (p.hp || 0) + '/' + (p.maxHp || 0), (p.rideable ? 'ездовое' : '') + (d.riding && p.rideable ? ', верхом' : '')]),
            quests: (Array.isArray(d.playerQuests) ? d.playerQuests : []).filter(q => q && !q.done && !q.completed).map(q => q.title || q.name || ''),
            notes: d.notes || '', backstory: d.backstory || '',
        };
    }

    // ---------- страницы ----------
    function header(H, sub, page) {
        return `<header class="top"><div class="brand"><div class="t1">Легенды Гарцующей Кобылы</div><div class="t2">${sub}</div></div>
<div class="nm">${field('Имя героя', H && H.name)}</div><div class="pg">${page}</div></header>`;
    }
    const pair = (a, b, label) => `<div class="f"><div class="line">${a !== '' && a !== undefined ? `<span class="val l">${esc(a)}</span>` : ''}<span class="slash">из</span>${b !== '' && b !== undefined ? `<span class="val r">${esc(b)}</span>` : ''}</div><div class="lab">${label}</div></div>`;
    // длинный текст — по строкам примерно по n символов
    function wrap(text, n, max) {
        const out = []; String(text || '').split('\n').forEach(par => {
            let cur = ''; par.split(/\s+/).forEach(w => { if ((cur + ' ' + w).trim().length > n) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
            if (cur) out.push(cur);
        });
        if (max && out.length > max) { out.length = max; out[max - 1] += ' …'; }
        return out;
    }

    function page1(H) {
        const s = H ? H.stats : {};
        const statRow = ([n, k, h]) => { const v = H ? s[k] : null; return `<div class="stat"><div class="sn">${n}</div><div class="sv">${v !== null && v !== undefined ? val(v) : ''}</div><div class="sm"><div class="smv">${v !== null && v !== undefined ? val(signed(modOf(v))) : ''}</div><div class="lab">мод.</div></div><div class="sh">${h}</div></div>`; };
        const skillRow = ([sn, st], i) => {
            const sk = H ? H.skills[i] : null; const v = sk && sk.v !== null ? sk.v : null;
            const need = v !== null ? Math.max(1, Math.ceil(v / 5)) : 0;
            const tally = v !== null && v < 100 ? `<span class="tl">${rep(need, j => `<i${j < sk.prog ? ' class="on"' : ''}></i>`)}</span>` : (v !== null ? '<span class="tl max">максимум</span>' : '');
            return `<tr><td>${ck(false)}</td><td>${sn}</td><td class="c">${st}</td><td class="c">${v !== null ? val(v) : ''}</td><td class="${H ? 'tf' : 'tally'}">${tally}</td></tr>`;
        };
        return `<div class="page">${header(H, 'Лист героя', 'I')}
<div class="row r-id">${field('Раса', H && H.race)}${field('Знак рождения', H && H.sign)}${field('Предыстория')}${field('Игрок')}${box('Уровень', H && H.level, 'big')}</div>
<div class="row r-id2">${pair(H ? H.prog : '', H ? H.need : '', 'Копилка уровня: набрано / нужно (табл. на обороте)')}${box('Очки перков', H && H.perkPts ? H.perkPts : '')}${box('Очки хар-к')}${pair(H ? H.lives : '', '', 'Жизни: осталось / d100 на старте')}</div>
<div class="cols c1"><div class="colL">
${sec('Характеристики', STATS.map(statRow).join('') + '<div class="hint">Мод. = (значение − 10) ÷ 2, вниз. Старт: всё по 8 + 15 очков + раса и знак.</div>')}
</div><div class="colR">
${sec('Здоровье · мана · скорость', `<div class="vit">
  <div class="vb hp"><div class="vt">Здоровье</div><div class="vcur">${H ? val(H.curHp) : ''}</div><div class="vmax"><span>макс.</span><div>${H ? val(H.maxHp) : ''}</div></div><div class="vtemp"><span>временные</span><div></div></div></div>
  <div class="vb mp"><div class="vt">Мана</div><div class="vcur">${H ? val(H.curMp) : ''}</div><div class="vmax"><span>макс.</span><div>${H ? val(H.maxMp) : ''}</div></div><div class="vtemp"><span>призыв, слоты</span><div></div></div></div>
</div>
<div class="row r-sm">${box('Скорость, фт', H && H.speed)}${box('Броня', H && H.armor)}${box('Физ. защита %', H && H.phys !== '' ? H.phys : '')}${box('Груз, фунт', H && H.weight)}${box('Предел (Сил×5)', H && H.wLimit)}</div>
<div class="hint">ХП = Тел × 10 + бонусы · мана = Инт × 10 + бонусы · скорость 35 фт (тяж. броня −10, лёгкая −5) · 10 брони = 1 %</div>`)}
${sec('Сопротивления, %', `<div class="res">${RES.map(([r], i) => `<div class="rc"><div class="rv">${H ? val(H.res[i]) : ''}</div><div class="lab">${r}</div></div>`).join('')}</div>
<div class="f wk"><div class="line"></div><div class="lab">Уязвимости (−%)</div></div>`)}
</div></div>
${sec('Навыки', `<table class="skills"><colgroup><col style="width:4%"><col style="width:33%"><col style="width:9%"><col style="width:12%"><col style="width:42%"></colgroup>
<thead><tr><th>★</th><th>Навык</th><th>Хар.</th><th>Значение</th><th>Успехи до +1 (нужно ⌈навык ÷ 5⌉)</th></tr></thead>
<tbody>${SK.map(skillRow).join('')}</tbody></table>
<div class="hint">Проверка: d20 + мод. характеристики + навык. Старт: все по 10 + раса, 30 свободных очков, основной +10, второстепенный +5 (★). Потолок навыка 100.</div>`, 'skillsec')}
${sec('Оружие и атаки', grid(['Оружие / атака', 'Куб (мод.)', 'Урон', 'Дальность', 'Особое (перки, чары, яд)'], H ? H.weapons.slice(0, 3).map(r => r.map(c => val(c))) : [], ['30%', '14%', '10%', '14%', '32%'], 'weap', 3))}
</div>`;
    }

    const perkRow = p => [val(p.tree), val(p.name), `<span class="c">${pips(Math.min(5, p.steps), p.taken)}</span>`, `<span class="small">${esc(p.desc)}</span>`];
    const PERK_HEAD = ['Навык (дерево)', 'Перк', 'Ступени', 'Что даёт'], PERK_W = ['20%', '24%', '13%', '43%'];

    function page2(H) {
        const lv = []; let cum = 0;
        for (let L = 1; L <= 64; L++) { const n = levelCost(L); cum += n; lv.push([L, n, cum]); }
        const cur = H ? H.level : 0;
        const lvCols = [0, 1, 2, 3].map(c => `<table class="lvt"><thead><tr><th>☐</th><th>Ур.</th><th>→</th><th>Очков</th><th>Всего</th></tr></thead><tbody>${lv.slice(c * 16, c * 16 + 16).map(([L, n, s]) => `<tr${L === cur ? ' class="cur"' : ''}><td>${ck(L < cur)}</td><td>${L}</td><td>${L + 1}</td><td><b>${n}</b></td><td>${s}</td></tr>`).join('')}</tbody></table>`).join('');
        const perks = H ? H.perks.slice(0, 16) : [];
        return `<div class="page">${header(H, 'Перки и рост', 'II')}
${sec('Перки', grid(PERK_HEAD, perks.map(perkRow), PERK_W, 'perks', 16).replace(/<tr><td><\/td><td><\/td><td><\/td><td><\/td><\/tr>/g, `<tr><td></td><td></td><td class="c">${pips(5)}</td><td></td></tr>`) +
            `<div class="hint">1 очко перка за уровень. Перк нельзя снять. Для ступени нужен порог навыка (и иногда предыдущий перк). Закрашивайте взятые ступени.${H && H.perks.length > 16 ? ' <b>Остальные перки — на странице «Перки (продолжение)».</b>' : ''}</div>`)}
<div class="cols c2">${sec('Расовые способности', lines(3, H ? wrap(H.raceTxt, 52, 3) : []))}${sec('Знак рождения', lines(3, H ? wrap(H.signTxt, 52, 3) : []))}</div>
${sec('Подъём уровня: сколько повышений навыков нужно', `<div class="lvwrap">${lvCols}</div>
<div class="hint">Каждое +1 к любому навыку идёт в копилку. Набрали нужное — новый уровень: +1 к характеристике и +1 очко перка; копилка начинается заново. Максимум — 65 уровень (сумма 1618).</div>`)}
${sec('История и приметы', lines(4, H ? wrap(H.backstory, 105, 4) : []))}
</div>`;
    }

    const spellRow = s => [val(s.name), val(s.school), val(s.circle), val(s.cost), `<span class="small">${esc(s.desc)}</span>`];
    const SPELL_HEAD = ['Заклинание', 'Школа', 'Круг', 'Мана', 'Эффект · усиленный эффект'], SPELL_W = ['24%', '14%', '10%', '8%', '44%'];

    function page3(H) {
        const acc = (school, st, k) => { const v = H ? H.stats[k] : null; return `<tr><td>${school}</td><td>${st}</td><td class="w">${v !== null && v !== undefined ? val(signed(modOf(v))) : ''}</td></tr>`; };
        const sp = H ? H.spells.slice(0, 14) : [];
        const u = (t, cls) => `<span class="u${cls ? ' ' + cls : ''}">${t ? `<span class="val">${esc(t)}</span>` : ''}</span>`;
        return `<div class="page">${header(H, 'Магия и вера', 'III')}
<div class="cols c3">
${sec('Меткость заклинаний', `<table class="mini"><tbody>${acc('Разрушение', 'Инт', 'int')}${acc('Иллюзия', 'Инт', 'int')}${acc('Изменение', 'Инт', 'int')}${acc('Восстановление', 'Муд', 'wis')}${acc('Колдовство', 'Муд', 'wis')}</tbody></table>
<div class="hint">d20 + мод. хар-ки (+ бонусы). В правой клетке — ваш итог.</div>`)}
${sec('Цена маны', `<div class="row r-sm">${box('Скидка, %')}${box('Множ. брони')}</div>
<div class="hint">Без навыка брони: тяжёлая ×1,75, лёгкая ×1,25. Двумя руками: на цель ×2,5, на себя — вдвое дольше. Свиток: 2 × круг очков Мудрости + пергамент и чернила.</div>`)}
</div>
${sec('Заклинания', grid(SPELL_HEAD, sp.map(spellRow), SPELL_W, 'spells', 14) +
            `<div class="hint">Круги: Новичок · Ученик · Адепт · Эксперт · Мастер. Старт колдуна: до 3 заклинаний новичка и 1 ученика.${H && H.spells.length > 14 ? ' <b>Остальные — на странице «Заклинания (продолжение)».</b>' : ''}</div>`)}
${sec('Вера', `<div class="row r-faith">${field('Божество', H && H.god)}
<div class="opt">${ck(H && H.aedra)} аэдра ${ck(H && H.daedra)} даэдра</div><div class="opt">Ранг ${pips(3, H ? H.rank : 0)}</div>
<div class="opt">${ck(H && H.amulet)} амулет надет (+50 %)</div><div class="opt">${ck(false)} покаяние пройдено</div></div>
${lines(2, H ? wrap(H.faithNotes, 105, 2) : [])}
<div class="hint">Благословение аэдра действует, пока надет амулет бога. Почитателя даэдра стража и храмы отмечают, у торговцев хуже цены.</div>`)}
${sec('Ветви судьбы', `<div class="branches">
<div class="br"><div class="bt">${ck(H && H.vamp)} Вампир${H && H.vampLord ? ' (лорд)' : ''}</div><div class="bl">Голод ${rep(5, i => ck(H && H.vamp && i < H.hunger))} <small>0–4</small></div><div class="bl">Укушен: ${u('')}</div></div>
<div class="br"><div class="bt">${ck(H && H.wolf)} Оборотень</div><div class="bl">Превращений сегодня: ${u(H && H.wolf ? String(H.wolfTr) : '')}</div><div class="bl">Тотем, перки: ${u(H && H.wolfTotem)}</div></div>
<div class="br"><div class="bt">${ck(H && H.pal)} Паладин</div><div class="bl">Клятва: ${['watch', 'justice', 'vengeance'].map(k => ck(H && H.palVow === k) + ' ' + VOWS[k]).join(' ')}</div><div class="bl">${ck(H && H.palOk)} праведен · кругов сегодня ${rep(5, () => ck(false))}</div></div>
<div class="br"><div class="bt">${ck(H && H.lich)} Лич</div><div class="bl">Стадия: ${ck(H && H.lichStage >= 1)} низший ${ck(H && H.lichStage >= 2)} высший · душ: ${u('')}</div><div class="bl">Филактерия: ${u('')}</div></div>
<div class="br wide"><div class="bt">${ck(H && H.cult)} Культист</div><div class="bl">Принц: ${u(H && H.cultGod)} · подношение было: ${u(H && H.cultLast, 's')} следующее до: ${u(H && H.cultNext, 's')} · пропуски ${ck(false)}${ck(false)}</div>
<div class="bl">Перки 5 / 15 / 25 / 40 ур.: ${u(H && H.cultPerks)}</div></div>
</div>
${lines(3, H ? wrap([H.palNames.length ? 'Перки паладина: ' + H.palNames.join(', ') : '', H.lichNames.length ? 'Перки лича: ' + H.lichNames.join(', ') : ''].filter(Boolean).join('\n'), 110, 3) : [])}
<div class="hint">Вампир, оборотень и лич — либо-либо. Паладин — только аэдра, культист — только даэдра. Ветви выдаёт и подтверждает мастер.</div>`)}
</div>`;
    }

    const SLOT_NAMES = ['Оружие (осн. рука)', 'Вторая рука', 'Щит', 'Дальнобойное', 'Боеприпасы', 'Шлем / капюшон', 'Нагрудник / одеяние', 'Перчатки', 'Сапоги', 'Амулет', 'Кольцо', 'Диадема'];
    const INV_HEAD = ['Предмет', 'Шт.', 'Вес'], INV_W = ['66%', '14%', '20%'];
    const invRow = r => [val(r[0]), val(r[1]), val(r[2])];

    function page4(H) {
        const inv = H ? H.inv.slice(0, 26) : [];
        return `<div class="page">${header(H, 'Снаряжение', 'IV')}
<div class="cols c4"><div>
${sec('Надето', `<table class="grid eq"><colgroup><col style="width:30%"><col style="width:42%"><col style="width:12%"><col style="width:16%"></colgroup>
<thead><tr><th>Слот</th><th>Предмет</th><th>Бр./ур.</th><th>Чары · дней</th></tr></thead>
<tbody>${SLOT_NAMES.map((s, i) => { const r = H ? H.slots[i] : null; return `<tr><td class="sl">${s}</td><td>${r ? val(r[0]) : ''}</td><td>${r && r[0] && r[1] && String(r[1]) !== '0' ? val(r[1]) : ''}</td><td></td></tr>`; }).join('')}</tbody></table>
<div class="hint">Чары на оружии держатся 5 дней, потом нужна подзарядка камнем душ. Снять/надеть оружие или щит в бою — действие хода.</div>`)}
</div><div>
${sec('Кошель и мелочи', `<div class="gold"><div class="gv">${H ? val(H.gold) : ''}</div><div class="lab">Септимы</div></div><div class="row r-sm">${box('Рюкзак', H && H.backpack ? '✓' : '')}${box('Отмычки', H && H.picks ? H.picks : '')}${box('Факелы', H && H.torches ? H.torches : '')}</div>`)}
${sec('Камни душ', `<table class="mini souls"><thead><tr><th>Камень</th><th>пуст.</th><th>полн.</th></tr></thead><tbody>${SOULS.map(([n], i) => `<tr><td>${n}</td><td>${H && H.souls[i][0] ? val(H.souls[i][0]) : ''}</td><td>${H && H.souls[i][1] ? val(H.souls[i][1]) : ''}</td></tr>`).join('')}</tbody></table>`)}
${sec('Подсумок и пояс (пить без действия)', lines(2, H ? wrap(H.pouch.join(', '), 46, 2) : []))}
</div></div>
${sec('Инвентарь', `<div class="inv">${[0, 1].map(c => grid(INV_HEAD, inv.slice(c * 13, c * 13 + 13).map(invRow), INV_W, '', 13)).join('')}</div>${H && H.inv.length > 26 ? '<div class="hint"><b>Остальные вещи — на странице «Инвентарь (продолжение)».</b></div>' : ''}`)}
<div class="cols c2">
${sec('Питомцы и спутники', grid(['Имя', 'Кто', 'ХП', 'Заметки'], H ? H.pets.slice(0, 3).map(r => r.map(c => val(c))) : [], ['26%', '24%', '16%', '34%'], '', 3))}
${sec('Дом', `<div class="opt">${ck(false)} Озёрный дом (Фолкрит) &nbsp; ${ck(false)} Гордость шпиля (Солитьюд)</div>
<div class="f"><div class="line"></div><div class="lab">Крылья (до 5)</div></div><div class="f"><div class="line"></div><div class="lab">Персонал · огород · хранилище</div></div>`)}
</div>
${sec('Задания и заметки', lines(3, H ? wrap([H.quests.length ? 'Задания: ' + H.quests.join('; ') : '', H.notes].filter(Boolean).join('\n'), 110, 3) : []))}
</div>`;
    }

    function page5() {
        return `<div class="page cheat">${header(null, 'Шпаргалка боя', 'V')}
<div class="cols c2"><div>
${sec('Ход', `<table class="ref"><tbody>
<tr><th>Движение</th><td>до скорости (35 фт); 1 клетка = 5 фт</td></tr>
<tr><th>Основное</th><td>атака, заклинание, предмет, рывок, подготовка к блоку</td></tr>
<tr><th>Бонусное</th><td>метательное (раз за ход), удар щитом после блока, быстрые перки</td></tr>
<tr><th>Смена оружия</th><td>снять/надеть оружие или щит — действие хода</td></tr>
<tr><th>Подсумок</th><td>зелье или яд из пояса — без действия</td></tr></tbody></table>`)}
${sec('Атака', `<p><b>Бросок против мастера:</b> вы — d20 + мод., мастер — d20 за врага. Выше — тот и прав.</p>
<table class="ref"><tbody>
<tr><th>Ближний бой</th><td>d20 + мод. Силы (кинжал тоже). Достаёт на 5 фт; молот, посох — 10 фт; пика — только 10 фт</td></tr>
<tr><th>Силовая</th><td>урон ×1,5, −1 к кубу; не чаще раза в 2 хода</td></tr>
<tr><th>Стрельба</th><td>Стрельба + Ловкость. Стрелы: без помехи до 30 фт, дальше −1 за клетку, предел 80. Болты: без помехи до 80. Натянутая тетива: +1, скорость −15. Арбалет: перезарядка ход</td></tr>
<tr><th>Метательное</th><td>бонусное действие; урон (оружие + Лов) ÷ 2; из скрытности ×2, нож ×3. Нож/топорик/дротик 30 фт (предел 50), копьё 20 (40); дальше −1 за 5 фт</td></tr>
<tr><th>Заклинание</th><td>Инт или Муд по школе; −1 за каждые 2 клетки дальше 60 фт</td></tr>
<tr><th>Скрытная</th><td>вас не заметили — урон намного выше (кинжал с перками до ×6)</td></tr></tbody></table>`)}
${sec('Штрафы оружия к кубу', `<div class="chips"><span>Кинжал <b>+1</b></span><span>Двуруч. меч <b>−2</b></span><span>Секира <b>−3</b></span><span>Молот <b>−4</b></span><span>Посох <b>−3</b></span><span>Пика <b>0</b></span><span>Блок не щитом <b>−3</b></span></div>`)}
${sec('Защита', `<ul><li>Физ. урон режет броня: <b>10 брони = 1 %</b>.</li><li>Стихии и яд режут сопротивления; к магическому урону добавляется сопр. магии.</li>
<li>Пробитие снижает сопротивление цели на этот удар.</li><li><b>Щит</b> даёт броню только в защитной стойке. Удар щитом после блока: ½ брони щита, цель шатается.</li></ul>`)}
${sec('Таймеры эффектов', `<table class="grid timers"><colgroup><col style="width:46%"><col style="width:16%"><col style="width:38%"></colgroup><thead><tr><th>Эффект (зелье, чары, состояние)</th><th>На ком</th><th>Осталось ходов</th></tr></thead><tbody>${rep(12, () => `<tr><td></td><td></td><td class="tick">${rep(10, () => ck(false))}</td></tr>`)}</tbody></table><div class="hint">Зачёркивайте клетку в конце каждого своего хода.</div>`)}
</div><div>
${sec('Состояния', `<table class="ref"><tbody>
<tr><th>Страх</th><td>не атакует, бежит</td></tr><tr><th>Паралич</th><td>беспомощен, любая атака попадает</td></tr>
<tr><th>Оглушение</th><td>не может атаковать</td></tr><tr><th>Потеря равн.</th><td>−2 к броскам; удар по нему с преимуществом</td></tr>
<tr><th>Ошеломление</th><td>−3 к атаке и защите</td></tr><tr><th>Ослабление</th><td>−2 к броскам</td></tr>
<tr><th>Бешенство</th><td>бьёт любого рядом, и своих</td></tr><tr><th>Замедление</th><td>скорость − указанные футы</td></tr>
<tr><th>Заморожен</th><td>не действует</td></tr><tr><th>Яд, болезнь</th><td>урон за ход или штрафы; снимают зелья, припарки, еда, чары</td></tr></tbody></table>`)}
${sec('Модификатор характеристики', `<table class="modt"><tbody><tr>${['6–7', '8–9', '10–11', '12–13', '14–15', '16–17', '18–19', '20–21', '22–23', '24–25', '26–27', '28–29', '30–31'].map(v => `<td>${v}</td>`).join('')}</tr>
<tr>${[-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<td><b>${signed(v)}</b></td>`).join('')}</tr></tbody></table>`)}
${sec('Вне боя', `<table class="ref"><tbody>
<tr><th>Замки</th><td>d20 + Взлом против СЛ: новичок 9, ученик 12, адепт 15, эксперт 17. Провал ломает отмычку</td></tr>
<tr><th>Магия в броне</th><td>без навыка: тяжёлая ×1,75, лёгкая ×1,25 к цене</td></tr>
<tr><th>Еда</th><td>день без еды — −2 ко всем броскам</td></tr>
<tr><th>Отдых</th><td>длительный — новый день: способности «раз в день» возвращаются</td></tr>
<tr><th>Смерть</th><td>тратится свободная жизнь (d100 на старте); дальше — квест божества</td></tr></tbody></table>`)}
${sec('Броски', `<table class="ref"><tbody>
<tr><th>Преимущество</th><td>бросьте 2d20, возьмите лучший</td></tr><tr><th>Помеха</th><td>бросьте 2d20, возьмите худший</td></tr>
<tr><th>Навык растёт</th><td>от успешного дела: ⌈навык ÷ 5⌉ успехов = +1 к навыку</td></tr></tbody></table>`)}
${sec('Счёт кругов боя', `<div class="rounds">${rep(30, i => `<span>${i + 1}</span>`)}</div>`)}
${sec('Заметки мастера', lines(9))}
</div></div></div>`;
    }

    // Продолжения: перки, заклинания, инвентарь, которые не влезли на основные страницы.
    function extraPages(H) {
        if (!H) return '';
        const out = [];
        chunk(H.perks.slice(16), 34).forEach((part, i) => out.push(`<div class="page">${header(H, 'Перки (продолжение)', 'II' + (i ? '·' + (i + 1) : '+'))}${sec('Перки', grid(PERK_HEAD, part.map(perkRow), PERK_W, 'perks'))}</div>`));
        chunk(H.spells.slice(14), 32).forEach((part, i) => out.push(`<div class="page">${header(H, 'Заклинания (продолжение)', 'III' + (i ? '·' + (i + 1) : '+'))}${sec('Заклинания', grid(SPELL_HEAD, part.map(spellRow), SPELL_W, 'spells'))}</div>`));
        chunk(H.inv.slice(26), 80).forEach((part, i) => out.push(`<div class="page">${header(H, 'Инвентарь (продолжение)', 'IV' + (i ? '·' + (i + 1) : '+'))}${sec('Инвентарь', `<div class="inv">${[0, 1].map(c => grid(INV_HEAD, part.slice(c * 40, c * 40 + 40).map(invRow), INV_W, 'tight')).join('')}</div>`)}</div>`));
        return out.join('');
    }

    // Только «тело» листа (страницы). Можно передать уже готовый extract(...) — так делает sheet-print.html.
    function bodyOf(H) { return page1(H) + page2(H) + page3(H) + page4(H) + extraPages(H) + page5(); }
    function body(data) { return bodyOf(extract(data)); }
    function titleOf(H) { return H && H.name ? 'Лист героя — ' + H.name : 'Лист героя — Легенды Гарцующей Кобылы'; }
    function html(data, head) {
        const H = extract(data);
        return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titleOf(H))}</title>${head || ''}</head><body>${bodyOf(H)}</body></html>`;
    }

    // Открыть лист в новой вкладке (sheet-print.html) и предложить печать (или «Сохранить как PDF»).
    // Данные разбираем здесь, в окне сайта: тут есть справочник перков и заклинаний; вкладка забирает готовое через opener.
    // w — заранее открытая вкладка (мастер открывает её до чтения листа из облака, иначе браузер блокирует всплывающее окно).
    function open(data, w) {
        root.__stSheetPrintH = extract(data);
        if (w) { try { if (w.stSheetRender) { w.stSheetRender(root.__stSheetPrintH); return true; } } catch (e) { } return true; } // вкладка ещё грузится — заберёт сама
        w = root.open('sheet-print.html?v=' + encodeURIComponent(SCRIPT_V), '_blank');
        if (!w) { alert('Браузер не дал открыть новую вкладку. Разрешите всплывающие окна для этого сайта и нажмите ещё раз.'); return false; }
        return true;
    }
    // Мастер: открыть вкладку сразу по клику (данные придут позже через open(data, w)).
    function openPending() {
        root.__stSheetPrintH = null;
        const w = root.open('sheet-print.html?v=' + encodeURIComponent(SCRIPT_V), '_blank');
        if (!w) alert('Браузер не дал открыть новую вкладку. Разрешите всплывающие окна для этого сайта и нажмите ещё раз.');
        return w;
    }
    // Вызывается со страницы sheet-print.html
    function renderPage(H) {
        document.title = titleOf(H);
        document.getElementById('sp-root').innerHTML = bodyOf(H);
        try { sessionStorage.setItem('st_sheet_print', JSON.stringify(H)); } catch (e) { }
        const go = () => { try { root.focus(); root.print(); } catch (e) { } };
        try { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 300)); } catch (e) { setTimeout(go, 800); }
    }

    root.StSheetPrint = { html, body, bodyOf, open, openPending, extract, renderPage };
    // Кнопка на листе игрока («Настройки» → сохранения; на компьютере — рядом со «Скачать в файл»).
    root.stPrintSheet = function () {
        let data = null;
        try { data = root.stBuildSheet ? root.stBuildSheet() : null; } catch (e) { console.warn('stPrintSheet:', e); }
        if (!data) { alert('Лист ещё не загрузился — попробуйте через пару секунд.'); return; }
        open(data);
    };
})(typeof window !== 'undefined' ? window : globalThis);
