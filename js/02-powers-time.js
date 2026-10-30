
    // ==================== ОСОБЫЕ СПОСОБНОСТИ (раса / знак / оборотень / вампир) ====================
    // Данные — window.powersData (powers-data.js): расы и знаки строго по «Sistema 2.2.docx», оборотень и
    // вампир-лорд — по «Фракции.xlsx». Здесь: что доступно сейчас, лимит «раз в сброс», применение.
    // «Длительный отдых» и «рассвет» в приложении = кнопка «Следующий день» (nextDay).
    let powersUsedToday = {}; // { группа: true } — сбрасывается в nextDay()
    // «Перчатки Хранителя»: в защитной стойке барьер на 350 урона; запас восстанавливается на следующий игровой день.
    const KEEPER_BARRIER_MAX = 350;
    let keeperBarrierLeft = KEEPER_BARRIER_MAX;
    function keeperBarrierActive() {
        return keeperBarrierLeft > 0 && !!(document.getElementById('chk-defensive-stance') || {}).checked && wearsItemNamed('Перчатки Хранителя');
    }

    function playerLevelNow() { return parseInt((document.getElementById('char-level') || {}).value) || 1; }
    function playerStatMod(key) {
        const v = parseInt((document.getElementById('stat-' + key) || {}).value);
        return Math.floor(((isNaN(v) ? 10 : v) - 10) / 2);
    }
    function rollNd(n, sides) {
        const rolls = []; let sum = 0;
        for (let i = 0; i < n; i++) { const r = 1 + Math.floor(Math.random() * sides); rolls.push(r); sum += r; }
        return { sum, rolls };
    }
    function levelBracket(table, level) { // [[мин.уровень, значение], …] → значение для уровня
        let v = table[0][1];
        table.forEach(([minLvl, val]) => { if (level >= minLvl) v = val; });
        return v;
    }

    function getAvailablePowers() {
        const list = window.powersData || [];
        const race = (document.getElementById('char-race') || {}).value;
        const sign = (document.getElementById('char-sign') || {}).value;
        const s = playerSupernaturalState || {};
        return list.filter(p => {
            if (p.source === 'race') return p.race === race;
            if (p.source === 'sign') return p.sign === sign;
            if (p.source === 'werewolf') return !!s.lycanthropy && (!p.requiresTotem || (s.werewolf && s.werewolf.totem === p.requiresTotem));
            if (p.source === 'vampire') return !!s.vampirism && (!!p.base || (!!(s.vampire && s.vampire.isLord) && (p.lordBase || snLordPerk(p.perk))));
            return false;
        });
    }

    function isPowerFlagActive(flag) {
        return activeTimedEffects.some(e => e.powerFlag === flag && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity));
    }
    // Берсерк: преимущество на одну атаку на каждый ВТОРОЙ ход — второй, четвёртый… с момента применения.
    function isBerserkAdvantageNow() {
        const e = activeTimedEffects.find(x => x.powerFlag === 'berserk' && x.turnsRemaining > 0);
        if (!e || !e.totalTurns) return false;
        return (e.totalTurns - e.turnsRemaining) % 2 === 1;
    }

    // «Временные ХП» = ХП выше максимума (наше поле ХП ничем не ограничено сверху). Пока действует эффект с tempHp,
    // потолок = максимум + сумма временных; по окончании лишнее сгорает. Получаемый урон естественно съедает их первыми.
    function clampTempHp() {
        const curEl = document.getElementById('cur-hp'), maxEl = document.getElementById('max-hp');
        if (!curEl || !maxEl) return;
        const temp = activeTimedEffects.reduce((s, e) => s + ((e.tempHp && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity)) ? e.tempHp : 0), 0);
        const limit = (parseInt(maxEl.value) || 0) + temp;
        if ((parseInt(curEl.value) || 0) > limit) { curEl.value = limit; updateVitalBars(); }
    }

    function renderPowersPanel() {
        const box = document.getElementById('powers-panel');
        if (!box) return;
        const powers = getAvailablePowers();
        const sign = (document.getElementById('char-sign') || {}).value;
        const race = (document.getElementById('char-race') || {}).value;
        const s = playerSupernaturalState || {};
        const prevTargets = {};
        box.querySelectorAll('select[id^="pow-tgt-"]').forEach(x => { prevTargets[x.id] = x.value; });
        let html = '';
        // Автоматические (без кнопки): бесплатные касты — знак «Маг» и «Призыв духа» бретона
        if (sign === 'mage') {
            html += `<div class="party-row" style="padding:5px 8px;"><strong>Маг: заклинание без маны</strong> <span style="font-size:13px; opacity:.85;">— ${mageSignFreeUsed ? 'бесплатный каст заклинания 1 ур. сегодня уже использован' : 'раз до рассвета заклинание 1 ур. без затрат магии (спишется автоматически при касте)'}</span></div>`;
        }
        if (race === 'breton') {
            html += `<div class="party-row" style="padding:5px 8px;"><strong>Призыв духа</strong> <span style="font-size:13px; opacity:.85;">— ${powersUsedToday['breton_spirit'] ? 'бесплатный «Вызов питомца» уже использован, вернётся после длительного отдыха' : 'раз за длительный отдых заклинание «Вызов питомца» без затрат магии (спишется автоматически при касте)'}</span></div>`;
        }
        if (s.lycanthropy && (!s.werewolf || !s.werewolf.totem || s.werewolf.totem === '— нет —')) {
            html += '<div class="party-row" style="padding:5px 8px; font-size:13px; opacity:.8;">🐺 Активное умение оборотня появится, когда мастер выберет тотем Хирсина (Охоты, Братства или Страха).</div>';
        }
        html += bardPowersHtml();
        if (!powers.length && !html) {
            box.innerHTML = '<p style="opacity:.6; font-size:13px;">У выбранной расы и знака нет активных способностей. Пассивные особенности (бонусы к характеристикам, сопротивления и т.п.) действуют сами и описаны в списках расы и знака.</p>';
            return;
        }
        const titles = { race: '🧬 Расовая', sign: '⭐ Знак рождения', werewolf: '🐺 Оборотень', vampire: '🧛 Вампир' };
        if (s.vampirism && s.vampire && s.vampire.isLord && s.vampire.lordForm && s.vampire.reflexLeft > 0) html += `<div class="party-row" style="padding:5px 8px;"><strong>🦇 Рефлексы активны</strong> — осталось атак с +4: ${s.vampire.reflexLeft}</div>`;
        html += powers.map(p => {
            const group = p.group || p.id;
            const used = p.perDay && powersUsedToday[group];
            const needForm = p.requiresTransformed && !(s.werewolf && s.werewolf.isTransformed);
            const needLord = (!!p.perk || !!p.lordBase) && !snLordForm();
            const lordL = p.lordLimit ? lordLeft(p.id) : null;
            const noCharges = !!lordL && (lordL.own + lordL.bonus) <= 0;
            const curHp = parseInt((document.getElementById('cur-hp') || {}).value) || 0;
            const maxHp = parseInt((document.getElementById('max-hp') || {}).value) || 0;
            const needLow = p.requiresBelowHalf && !(curHp * 2 < maxHp);
            const active = activeTimedEffects.find(e => e.effectName === p.name && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity));
            let status = '<span style="color:#2ecc71;">доступна</span>';
            if (used) status = '<span style="opacity:.7;">использована — вернётся после отдыха</span>';
            else if (needForm) status = '<span style="color:#e67e22;">нужен облик зверя</span>';
            else if (needLord) status = '<span style="color:#e67e22;">нужна форма вампира-лорда</span>';
            else if (noCharges) status = '<span style="opacity:.7;">заряды на сегодня закончились</span>';
            else if (lordL) status = `<span style="color:#2ecc71;">запас очков: ${lordL.own}/${LORD_POOL_MAX}${lordL.bonus ? ' + ' + lordL.bonus + ' бонус.' : ''}</span>`;
            else if (needLow) status = '<span style="color:#e67e22;">только когда ХП ниже половины</span>';
            if (active) status = `<span style="color:var(--accent-color);">действует: ещё ${active.turnsRemaining === Infinity ? '∞' : active.turnsRemaining} ход.</span>`;
            return `<div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:5px 8px;">
                <span style="flex:1 1 260px; min-width:0;"><strong>${escHtml(p.name)}</strong> <span style="font-size:12px; opacity:.6;">${titles[p.source] || ''}${p.perDay ? ' · раз за отдых' : ''}</span><br><span style="font-size:13px; opacity:.85;">${escHtml(p.desc)}</span></span>
                <span style="font-size:13px; min-width:110px;">${status}</span>
                ${p.needsTarget ? `<select id="pow-tgt-${p.id}" style="width:auto; min-width:130px; margin:0;">${snAliveEnemies().map(e => `<option value="${escHtml(e.id)}" ${prevTargets['pow-tgt-' + p.id] === e.id ? 'selected' : ''}>${escHtml(e.name)} (${e.curHp}/${e.maxHp})</option>`).join('') || '<option value="">— нет целей —</option>'}</select>` : ''}
                ${p.needsCorpse ? `<select id="pow-tgt-${p.id}" style="width:auto; min-width:130px; margin:0;">${(p.id === 'vamp_lord_raise' ? snLordCorpses() : snRaisableCorpses()).map(e => `<option value="${escHtml(e.id)}" ${prevTargets['pow-tgt-' + p.id] === e.id ? 'selected' : ''}>${escHtml(e.name)}</option>`).join('') || '<option value="">— нет трупов —</option>'}</select>` : ''}
                <button class="btn-success" style="width:auto; padding:3px 14px; margin:0;" ${(used || needForm || needLow || needLord || noCharges) ? 'disabled' : ''} onclick="usePower('${jsq(p.id)}')">Применить</button>
            </div>`;
        }).join('');
        box.innerHTML = html;
    }

    window.renderPowersPanel = renderPowersPanel;
    // Способности расы, знака, оборотня и вампира в бою — по тем же правилам хода, что атака и заклинание:
    // «действием» — одно основное действие за ход (не после удара/смены оружия) и не под Параличом;
    // голосом (Боевой клич) и Магией крови вампира — ещё и не под Немотой. «Бонусным действием» и реакцией
    // (Агрессия, Выброс адреналина) — бонусное действие хода.
    function powerActionKind(p) {
        if (/^Бонусным действием|реакци/i.test(p.desc || '')) return 'bonus';
        if ((p.effect || {}).taunt || (p.source === 'vampire' && (p.perk || p.lordBase))) return 'voice';
        return 'main';
    }
    function powerActionAllowed(p) {
        if (!inCombatNow()) return true;
        const kind = powerActionKind(p);
        const par = blockingStatusFor('swap'); // только Паралич
        if (par) { alert(`Сейчас на тебе «${par.effectName || par.name}» — способности в этом ходу недоступны.`); return false; }
        if (kind === 'bonus') return bonusActionAllowed('«' + p.name + '»');
        if (kind === 'voice') { const mute = (activeTimedEffects || []).find(e => e && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && (e.statusFlag === 'mute' || e.effectName === 'Немота')); if (mute) { alert(`Сейчас на тебе «${mute.effectName || mute.name}» — «${p.name}» в этом ходу недоступна.`); return false; } }
        const k = turnKeyNow();
        if (combatMarks.swap === k) { alert('В этом ходу ты уже сменил оружие — способность можно со следующего хода.'); return false; }
        if (combatMarks.attack === k) { alert('В этом ходу ты уже атаковал или колдовал — способность можно в следующем ходу.'); return false; }
        return true;
    }
    function markPowerAction(p) { if (powerActionKind(p) === 'bonus') markBonusAction(); else markCombatAction('attack'); }
    window.usePower = function (id) {
        const p = (window.powersData || []).find(x => x.id === id);
        if (!p) return;
        const group = p.group || p.id;
        const s = playerSupernaturalState || {};
        if (p.perDay && powersUsedToday[group]) { alert('Эта способность уже использована — вернётся после длительного отдыха (кнопка «Следующий день»).'); return; }
        if (p.requiresTransformed && !(s.werewolf && s.werewolf.isTransformed)) { alert('Только в облике зверя.'); return; }
        if ((p.perk || p.lordBase) && !snLordForm()) { alert('Только в форме вампира-лорда.'); return; }
        if (p.lordLimit) { const l = lordLeft(p.id); if (l.own + l.bonus <= 0) { alert('Запас очков Магии крови и Сил ночи пуст — он восстанавливается, когда утолишь голод (кровь), или частично на следующий день.'); return; } }
        if (!powerActionAllowed(p)) return;
        if (p.special) {
            if (runSpecialPower(p)) {
                markPowerAction(p);
                if (p.perDay) powersUsedToday[group] = true;
                if (p.lordLimit) lordSpend(p.id);
                renderPowersPanel(); if (typeof renderActiveEffects === 'function') renderActiveEffects(); updateAll(); saveLocalStorage();
            }
            return;
        }
        if (p.lordLimit) lordSpend(p.id);
        const curEl = document.getElementById('cur-hp'), maxEl = document.getElementById('max-hp');
        const curHp = parseInt(curEl.value) || 0, maxHp = parseInt(maxEl.value) || 0;
        if (p.requiresBelowHalf && !(curHp * 2 < maxHp)) { alert('Кора хиста действует, только когда текущие ХП ниже половины максимума.'); return; }
        // «Кровь Севера» и подобные: лечение = N × уровень × мод. характеристики. При модификаторе 0 и ниже лечения нет —
        // не тратим дневное использование впустую, а предупреждаем.
        if ((p.effect || {}).healLevelMod && playerStatMod((p.effect || {}).healMod) <= 0) {
            alert(`«${p.name}» сейчас ничего не вылечит: модификатор ${({ con: 'Телосложения', wis: 'Мудрости' })[(p.effect || {}).healMod] || 'характеристики'} ${playerStatMod((p.effect || {}).healMod)} (нужно Тел 12+). Использование не потрачено.`);
            return;
        }

        const eff = p.effect || {};
        const lvl = playerLevelNow();
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const notes = []; // что реально произошло — идёт в общий журнал
        let tempHp = 0;

        if (eff.healLevelMult) {
            const heal = eff.healLevelMult * lvl;
            curEl.value = Math.max(curHp, Math.min(maxHp, curHp + heal));
            notes.push(`восстановлено ${Math.min(heal, Math.max(0, maxHp - curHp))} ХП (${eff.healLevelMult} × ур. ${lvl})`);
        }
        if (eff.healDiceByLevel) {
            const dice = levelBracket(eff.healDiceByLevel, lvl), mod = playerStatMod(eff.healMod);
            const r = rollNd(dice, 10), heal = Math.max(0, r.sum + mod);
            curEl.value = Math.max(curHp, Math.min(maxHp, curHp + heal));
            notes.push(`${dice}d10 [${r.rolls.join('+')}] ${mod >= 0 ? '+' : ''}${mod} = ${heal} ХП`);
        }
        if (eff.healLevelMod) {
            const mod = playerStatMod(eff.healMod), heal = Math.max(0, eff.healLevelMod * lvl * mod);
            const room = Math.max(0, maxHp - curHp), real = Math.min(heal, room);
            tempHp = heal - real;
            curEl.value = curHp + heal; // излишек сразу сверх максимума = временные ХП
            notes.push(`${eff.healLevelMod} × ур. ${lvl} × мод. ${mod} = ${heal}: восстановлено ${real} ХП${tempHp ? `, временных ХП ${tempHp} на 6 ходов` : ''}`);
        }
        if (eff.tempHpLevelMult) {
            tempHp = eff.tempHpLevelMult * lvl;
            curEl.value = (parseInt(curEl.value) || 0) + tempHp;
            notes.push(`временные ХП: ${tempHp} (${eff.tempHpLevelMult} × ур. ${lvl}), преимущество на одну атаку каждый второй ход`);
        }
        if (eff.poison) {
            const n = levelBracket(eff.poison.diceByLevel, lvl), inst = rollNd(n, 6);
            notes.push(`яд: мгновенно ${n}d6 [${inst.rolls.join('+')}] = ${inst.sum}, затем ${n}d10 в начале каждого вашего хода, 15 ходов (игнорирует сопротивление)`);
        }
        if (eff.saveDc) {
            const best = Math.max.apply(null, eff.saveDc.map(playerStatMod));
            notes.push(`Сл. спасброска ${8 + best}`);
        }

        if (p.perDay) powersUsedToday[group] = true;
        markPowerAction(p);

        // Активный эффект на листе (если есть длительность или временные ХП)
        const hasTimed = p.turns > 0 || tempHp > 0 || eff.taunt;
        if (hasTimed && !eff.taunt) {
            const turns = p.turns > 0 ? p.turns : 6; // временные ХП от Крови Севера — 6 ходов
            pushOrRefreshTimedEffect({
                id: 'pow-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: p.name, effectName: p.name, description: p.desc, turnsRemaining: turns, totalTurns: turns,
                hp: 0, mp: 0, value: 0, speed: eff.speed || 0, tempHp: tempHp, powerFlag: eff.flag || '', invisible: !!eff.invisible
            });
        }
        if (eff.taunt) {
            // Боевой клич: враги, которые вас видят, атакуют только вас; голос хрипнет до конца дня.
            const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
            const alive = ((sess && sess.enemies) || []).filter(e => (e.curHp === undefined || e.curHp > 0));
            alive.forEach(e => {
                try { window.CloudSync.applyStatusToEnemy(e.id, 'Боевой клич', `Атакует только «${myName}» (${eff.taunt} ходов)`, eff.taunt, myName); } catch (err) { /* нет сессии */ }
            });
            pushOrRefreshTimedEffect({
                id: 'pow-hoarse-' + Date.now(), name: 'Хриплый голос', effectName: 'Хриплый голос',
                description: 'После боевого клича: −1 к убеждению, +1 к угрозе до конца дня.',
                turnsRemaining: Infinity, totalTurns: 0, hp: 0, mp: 0, value: 0, untilDayEnd: true
            });
            notes.push(alive.length ? `враги (${alive.length}) атакуют только вас ${eff.taunt} ходов` : `враги атакуют только вас ${eff.taunt} ходов (врагов в сессии нет — мастер решает)`);
        }

        if (window.CloudSync && window.CloudSync.postCombatLog) {
            window.CloudSync.postCombatLog(`✨ ${myName} применяет «${p.name}»${notes.length ? ': ' + notes.join('; ') : ''}${eff.gmDecides ? ' — результат определяет мастер' : ''}.`, myName);
        }
        updateVitalBars();
        renderPowersPanel();
        if (typeof renderActiveEffects === 'function') renderActiveEffects();
        updateAll();
        saveLocalStorage();
    };

    // ==================== ВРЕМЯ СУТОК / ПОГОДА / СБОР ИНГРЕДИЕНТОВ ====================
    const TIME_PERIODS = ['Утро', 'День', 'Вечер', 'Ночь'];
    let timePeriodIdx = 1; // 0=Утро,1=День,2=Вечер,3=Ночь

    const WEATHER_TYPES = {
        clear: { name: '☀️ Ясно', effect: '' },
        cloudy: { name: '☁️ Облачно', effect: '' },
        rain: { name: '🌧️ Дождь', effect: '−2 к дальнему бою (Стрельба), +2 к Скрытности — дождь маскирует шаги' },
        storm: { name: '⛈️ Гроза', effect: '−4 к дальнему бою, вспышки молний иногда выдают позицию (−2 к Скрытности при ударе)' },
        snow: { name: '🌨️ Снегопад', effect: '−5 фт. скорости, +2 к Скрытности — снег глушит шаги' },
        blizzard: { name: '🌬️ Метель', effect: '−10 фт. скорости, −4 к дальнему бою, видимость почти нулевая' },
        fog: { name: '🌫️ Туман', effect: '+4 к Скрытности, −4 к дальнему бою — плохая видимость' }
    };
    // Погода → числа (раньше это была только подпись). Гроза: штраф к скрытности от молний — условный, оставлен текстом.
    const WEATHER_MODS = {
        rain: { ranged: -2, stealth: 2, speed: 0 }, storm: { ranged: -4, stealth: 0, speed: 0 },
        snow: { ranged: 0, stealth: 2, speed: -5 }, blizzard: { ranged: -4, stealth: 0, speed: -10 },
        fog: { ranged: -4, stealth: 4, speed: 0 }
    };
    function weatherMods() {
        try {
            const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
            return WEATHER_MODS[(sess && sess.currentWeather) || 'clear'] || { ranged: 0, stealth: 0, speed: 0 };
        } catch (e) { return { ranged: 0, stealth: 0, speed: 0 }; }
    }
    const GAME_REGIONS = ['Лес', 'Болото', 'Горы', 'Побережье', 'Равнина', 'Подземелье'];
    const GAME_HOLDS = ['Вайтран', 'Винтерхолд', 'Рифт', 'Фолкрит', 'Солитьюд (Хаафингар)', 'Хьялмарк (Морфал)',
        'Истмарк (Виндхельм)', 'Белый берег (Данстар)', 'Маркарт (Предел)', 'Схолстейм'];
    const REGION_WEATHER_POOL = {
        'Лес': ['clear', 'cloudy', 'rain', 'fog'],
        'Болото': ['cloudy', 'rain', 'fog', 'storm'],
        'Горы': ['snow', 'blizzard', 'clear', 'cloudy'],
        'Побережье': ['clear', 'cloudy', 'rain', 'storm', 'fog'],
        'Равнина': ['clear', 'cloudy', 'rain'],
        'Подземелье': ['clear']
    };

    // Ингредиенты, которых нет в дикой природе — только с трупов/добычи существ.
    const INGREDIENT_CORPSE_ONLY = new Set([
        'Глаз саблезуба', 'Жир тролля', 'Зубы ледяного привидения', 'Икра рыбы-убийцы',
        'Клешня грязевого краба', 'Клык саблезуба', 'Коготь ворожеи', 'Кровавый венец',
        'Медвежьи когти', 'Паучье яйцо', 'Перья ворожеи', 'Прах вампира', 'Сердце даэдра',
        'Ухо фалмера', 'Хвост злокрыса', 'Человеческое сердце', 'Человечье мясо',
        'Эльфийское ухо', 'Язык дракона', 'Чешуя рыбы-убийцы', 'Толчёный бивень мамонта',
        'Эктоплазма', 'Прах Берита', 'Жареная злокрысья кожа',
        // Дополнено: эти ингредиенты падают с существ (в луте врагов они уже прописаны: Великан, атронахи,
        // Корус, двемерские механизмы, Горелый сприган, Изгои-«вересковые сердца», скелеты/драугры) и
        // продаются алхимиками, но раньше ещё и «находились» кнопкой сбора — в том числе, например,
        // древесина горелого сприггана в Вайтране.
        'Палец великана', 'Огненная соль', 'Морозная соль', 'Соль пустоты', 'Яйцо коруса', 'Двемерское масло',
        'Древесина горелого сприггана', 'Живица сприггана', 'Костная мука', 'Вересковое сердце',
        'Клюв ястреба', 'Перья ястреба', 'Большие рога', 'Маленькие рога',
        // Новые по таблице алхимии: добыча с существ (рыба-икра, корус, пепельные твари, кабан).
        'Лососевая икра', 'Усик коруса-охотника', 'Желе пепельного прыгуна', 'Кабаний клык', 'Пепел порождения'
    ]);
    // Ингредиенты, которые логично находить чаще в определённом регионе (доп. вес при сборе).
    const INGREDIENT_REGION_TAGS = {
        'Лес': ['Лаванда', 'Пчела', 'Медовые соты', 'Пчелиное гнездо', 'Ягоды можжевельника', 'Чеснок',
                 'Голубой горноцвет', 'Красный горноцвет', 'Лиловый горноцвет', 'Большие рога', 'Маленькие рога',
                 'Клюв ястреба', 'Перья ястреба', 'Древесина горелого сприггана', 'Живица сприггана'],
        'Болото': ['Болотный стручок', 'Бесовский гриб', 'Мора тапинелла', 'Гниль Намиры', 'Ядовитый колокольчик',
                    'Паслён', 'Бородатый мох', 'Стержневой корень', 'Собачий корень', 'Ползучая лоза', 'Травяной стручок'],
        'Горы': ['Морозная мириам', 'Морозная соль', 'Снежные ягоды', 'Огненная соль', 'Соль пустоты'],
        'Побережье': ['Морской жёлудь', 'Сиродильский лопатохвост', 'Хисткарп', 'Абесинский окунь',
                       'Серебристый окунь', 'Бойцовая рыбка', 'Жемчужина', 'Маленькая жемчужина'],
        'Равнина': ['Пшеница', 'Соль', 'Куриное яйцо', 'Вересковое сердце']
    };
    // Доп. вес по конкретному владению (поверх регионального) — реальные данные с вики
    // (распределение ингредиентов у алхимиков по владениям в ванильном Skyrim: взяты только
    // ингредиенты уровня "Guaranteed"/"Common" для каждого конкретного владения — раньше список
    // был выдуман на глаз, часть названий даже не совпадала с реальными именами в базе).
    const INGREDIENT_HOLD_TAGS = {
        'Вайтран': ['Большие рога', 'Маленькие рога', 'Лаванда', 'Голубой горноцвет', 'Лиловый горноцвет',
                     'Пушица', 'Торакс светлячка', 'Крыло синей бабочки', 'Крыло монарха', 'Пшеница'],
        'Винтерхолд': ['Снежные ягоды', 'Травяной стручок'],
        'Белый берег (Данстар)': ['Травяной стручок', 'Снежные ягоды'],
        'Рифт': ['Пчелиное гнездо', 'Медовые соты', 'Яйцо соснового дрозда', 'Собачий корень', 'Пчела',
                  'Хисткарп', 'Сиродильский лопатохвост', 'Серебристый окунь', 'Абесинский окунь', 'Бойцовая рыбка',
                  'Голубой горноцвет', 'Лиловый горноцвет', 'Красный горноцвет', 'Чешуйчатка', 'Пшеница'],
        'Фолкрит': ['Яйцо соснового дрозда', 'Голубой горноцвет', 'Лиловый горноцвет', 'Красный горноцвет',
                     'Паслён', 'Ветка чертополоха', 'Торакс светлячка', 'Крыло синей бабочки'],
        'Истмарк (Виндхельм)': ['Виноград джазби', 'Голубой горноцвет', 'Лиловый горноцвет', 'Красный горноцвет',
                                  'Снежные ягоды', 'Ветка чертополоха', 'Пшеница'],
        'Солитьюд (Хаафингар)': ['Клюв ястреба', 'Перья ястреба', 'Собачий корень', 'Ядовитый колокольчик',
                                   'Лаванда', 'Травяной стручок', 'Ветка чертополоха', 'Пшеница'],
        'Хьялмарк (Морфал)': ['Собачий корень', 'Ядовитый колокольчик', 'Оранжевая стрекоза', 'Синяя стрекоза',
                                'Гигантский лишайник', 'Лаванда', 'Крыло синей бабочки', 'Торакс светлячка', 'Травяной стручок'],
        'Маркарт (Предел)': ['Бородатый мох', 'Ягоды можжевельника', 'Лаванда', 'Двемерское масло'],
        'Схолстейм': ['Древесина горелого сприггана']
    };
    // Собираются только ночью.
    const NIGHT_ONLY_INGREDIENTS = new Set([
        'Мухомор', 'Светящийся гриб', 'Лунный сахар', 'Крыло лунного мотылька', 'Паслён', 'Светящаяся пыль'
    ]);

    let characterLevel = 1;
    let levelUpProgress = 0; // очков навыков накоплено к следующему уровню
    let perkPointsAvailable = 0; // свободные очки перков от левел-апов (справочно, не блокирует существующие перки)
    let skillProgress = {}; // { skillIdx: успехов накоплено к следующей ступени навыка }
    const MONTH_NAMES = [
    "Утренней звезды", "Восхода солнца", "Первого зерна", "Руки дождя",
    "Второго зерна", "Середины года", "Высокого солнца", "Последнего зерна",
    "Огня очага", "Начала морозов", "Заката солнца", "Вечерней звезды"
];
let gameYear = 201;
let gameMonth = 6;      // 0-based; 6 = Высокое солнце
let gameDayNum = 10;    // 10-е число
let daysWithoutFood = 0;

    // Задача H: сезоны как у настоящих месяцев (Утренняя звезда = январь … Вечерняя звезда = декабрь, порядок как на вики):
    // зима — Вечерняя звезда, Утренняя звезда, Восход солнца (11, 0, 1); весна 2-4, лето 5-7, осень 8-10.
    const SEASONS = [
        { name: 'Зима', icon: '❄️', months: [11, 0, 1] },
        { name: 'Весна', icon: '🌸', months: [2, 3, 4] },
        { name: 'Лето', icon: '☀️', months: [5, 6, 7] },
        { name: 'Осень', icon: '🍂', months: [8, 9, 10] }
    ];
    function getCurrentSeason() {
        return SEASONS.find(s => s.months.includes(gameMonth)) || SEASONS[0];
    }
    // Ингредиенты недоступны для сбора зимой (травы вымерзли) — часть того, что раньше
    // считалось доступным круглый год.
    const WINTER_UNAVAILABLE_INGREDIENTS = new Set([
        'Голубой горноцвет', 'Красный горноцвет', 'Лиловый горноцвет', 'Ягоды можжевельника',
        'Лаванда', 'Пчела', 'Медовые соты', 'Пчелиное гнездо', 'Крыло синей бабочки',
        'Крыло монарха', 'Оранжевая стрекоза', 'Синяя стрекоза', 'Виноград джазби',
        'Ветка чертополоха', 'Паслён', 'Ядовитый колокольчик'
    ]);

    // Динамический рендеринг 19 навыков и генерация многоступенчатых чекбоксов перков
   function initSkills() {
    const container = document.getElementById('skills-container');
    if (!container) return;
    // Сбрасываем грид-3 в контейнере, шторки лучше смотрятся в один столбец
    container.classList.remove('grid-3');
    container.innerHTML = "";

    skillNames.forEach((name, idx) => {
        let pList = fullPerksManifest[name] || [];

        let perksHtml = pList.map((p, pItemIdx) => {
            let stepsHtml = "";
            for (let s = 1; s <= p.steps; s++) {
                let checkboxId = `perk-${idx}-${pItemIdx}-${s}`;
                stepsHtml += `
                    <input type="checkbox" 
                           id="${checkboxId}" 
                           class="perk-checkbox" 
                           data-skillidx="${idx}" 
                           data-perkidx="${pItemIdx}" 
                           data-step="${s}" 
                           onchange="validatePerkCheck(this);">
                `;
            }
            return `
                <div class="perk-item" data-perk-key="${idx}-${pItemIdx}">
                    <div class="perk-row">
                        <div class="perk-left">
                            <span style="color:#cfc5b6; font-size:14px;">${p.name}</span>
                        </div>
                        <div class="perk-steps">
                            ${stepsHtml} ${p.steps > 1 ? `<span style="font-size:12px; opacity:0.6;">(1-${p.steps})</span>` : ''}
                        </div>
                    </div>
                    ${p.desc ? `<div class="perk-desc">${p.desc}</div>` : ''}
                </div>
            `;
        }).join('');

        let hint = "";
        if (name === "Взлом") hint = `<div class="shw-hint">Замки: Новичок 9 (-2), Ученик 12 (-3), Адепт 15 (-4), Эксперт 17 (-5)</div>`;
        if (name === "Блокирование") hint = `<div class="shw-hint">Не щитом: -3 к проверке атак. Щит эффективнее. Удар плашмя: дает врагу -1.</div>`;

        container.innerHTML += `
            <div class="panel skill-panel" id="skill-panel-${idx}">
                <div class="skill-header" onclick="toggleSkillPanel(${idx})">
                    <span class="skill-title">${name}</span>
                    <input type="number" 
                           id="skill-${idx}" 
                           value="10" min="10" 
                           class="skill-value-input"
                           data-raw-val="10" 
                           readonly tabindex="-1" title="Навык растёт от успехов («Проверка» → «Прокачка персонажа») или по решению мастера"
                           onclick="event.stopPropagation()"
                           onchange="handleSkillChange(this, ${idx})">
                    <span class="skill-chevron" id="skill-chevron-${idx}">▸</span>
                </div>
                <div class="skill-body" id="skill-body-${idx}" style="display:none;">
                    ${hint}
                    ${pList.length > 0 ? `<div class="perks-list"><strong>Ветка талантов:</strong>${perksHtml}</div>` : '<p style="font-size:14px;opacity:.6;">У этого навыка нет ветки перков.</p>'}
                </div>
            </div>
        `;
    });
    // Кэш чекбоксов перков — строится один раз здесь, не на каждое сохранение/восстановление.
    // Чекбоксы НЕ пересоздаются после инициализации (только отмечаются/снимаются), так что кэш
    // не протухает в течение всей сессии страницы.
    _allPerkCheckboxes = Array.from(document.querySelectorAll('.perk-checkbox'));
}

// Открывает/закрывает один навык в ветках перков
window.toggleSkillPanel = function (idx) {
    const body = document.getElementById('skill-body-' + idx);
    const chev = document.getElementById('skill-chevron-' + idx);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
};

    // ---------- Раскладка «Главной» на компьютере ----------
    // На широком экране голод и вера переезжают под характеристики (там было пусто), а «Боевой урон и защита» —
    // на их место в «Панели состояния». Переносим сами узлы (id и обработчики остаются те же), а на узком экране
    // возвращаем их домой — порядок блоков на телефоне не меняется.
    (function () {
        const mq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
        const move = (id, toId) => { const n = document.getElementById(id), t = document.getElementById(toId); if (n && t && n.parentElement !== t) t.appendChild(n); };
        function placeDesktopBlocks() {
            const desk = !!(mq && mq.matches);
            move('st-survival-faith', desk ? 'st-desk-faith-slot' : 'st-survival-home');
            move('st-dmg-block', desk ? 'st-desk-dmg-slot' : 'st-dmg-home');
            document.body.classList.toggle('st-desk-layout', desk);
        }
        if (mq) { if (mq.addEventListener) mq.addEventListener('change', placeDesktopBlocks); else if (mq.addListener) mq.addListener(placeDesktopBlocks); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeDesktopBlocks); else placeDesktopBlocks();
        window.placeDesktopBlocks = placeDesktopBlocks;
    })();

    // ---------- Готовые билды (builds-data.js) ----------
    function buildPerkLocate(tree, name) {
        const sIdx = skillNames.indexOf(tree);
        const list = fullPerksManifest[tree] || [];
        const pIdx = list.findIndex(p => p.name === name);
        return { sIdx, pIdx, perk: pIdx === -1 ? null : list[pIdx] };
    }
    function buildPerkTaken(sIdx, pIdx, steps) {
        let n = 0;
        for (let st = 1; st <= steps; st++) { const c = document.getElementById(`perk-${sIdx}-${pIdx}-${st}`); if (c && c.checked) n++; }
        return n;
    }
    // Что мешает взять следующую ступень прямо сейчас (те же правила, что validatePerkCheck, но без побочных эффектов)
    function buildPerkBlocker(perk, nextStep) {
        const r = perk.req;
        if (!r) return '';
        if (r.skill) {
            const need = (r.thresholds || [])[nextStep - 1] || 0, have = getEffectiveSkillValue(r.skill);
            if (have < need) return `навык «${r.skill}» ${have}/${need}`;
        }
        for (const g of (r.prereq || [])) if (!g.some(n => isPerkChecked(n))) return 'нужен перк ' + g.map(n => '«' + n + '»').join(' или ');
        return '';
    }
    let _buildsHighlighted = null;
    window.renderBuildsPanel = function () {
        const box = document.getElementById('builds-list');
        if (!box) return;
        const builds = window.buildsData || [];
        const openIds = new Set(Array.from(box.querySelectorAll('details.st-build[open]')).map(d => d.dataset.build));
        box.innerHTML = builds.map(b => {
            let done = 0, total = 0; const seenAlt = {};
            const rows = b.perks.map(e => {
                const loc = buildPerkLocate(e.tree, e.perk);
                if (!loc.perk) return `<li style="color:#e74c3c;">«${escHtml(e.perk)}» — нет в ветке «${escHtml(e.tree)}»</li>`;
                const want = Math.min(e.steps || loc.perk.steps, loc.perk.steps);
                const taken = buildPerkTaken(loc.sIdx, loc.pIdx, loc.perk.steps);
                const ok = taken >= want;
                // «на выбор» (alt): группа считается одним пунктом и выполненной, если взят любой её перк
                if (e.alt) { if (!seenAlt[e.alt]) { seenAlt[e.alt] = { done: false }; total++; } if (ok && !seenAlt[e.alt].done) { seenAlt[e.alt].done = true; done++; } }
                else { total++; if (ok) done++; }
                let st;
                if (ok) st = '<span class="st-bp-ok">✔ взят</span>';
                else {
                    const block = buildPerkBlocker(loc.perk, taken + 1);
                    st = block ? `<span class="st-bp-lock">🔒 ${escHtml(block)}</span>` : '<span class="st-bp-now">🟢 можно взять сейчас</span>';
                    if (taken) st = `<span class="st-bp-part">◐ ${taken}/${want}</span> ` + st;
                }
                const steps = want > 1 ? ` (${want} ступ.)` : '';
                const note = [e.alt ? 'на выбор' : '', e.note || ''].filter(Boolean).join(': ');
                return `<li><span class="st-bp-tree">${escHtml(e.tree)}</span> — <strong>${escHtml(e.perk)}</strong>${steps}${note ? ` <span style="opacity:.65;">(${escHtml(note)})</span>` : ''} · ${st}</li>`;
            }).join('');
            const isHl = _buildsHighlighted === b.id;
            return `<details class="st-build" data-build="${escHtml(b.id)}" ${openIds.has(b.id) ? 'open' : ''}>
                <summary>${b.icon || ''} <strong>${escHtml(b.name)}</strong> <span style="opacity:.7; font-size:13px;">— взято ${done} из ${total}</span></summary>
                <div class="st-build-body">
                    <div>${escHtml(b.role || '')}</div>
                    <div class="st-build-meta">Навыки: ${escHtml((b.skills || []).join(', '))}<br>Раса: ${escHtml(b.race || '—')} · Знак: ${escHtml(b.sign || '—')} · Боги: ${escHtml(b.gods || '—')}${b.stats ? '<br>Характеристики: ' + escHtml(b.stats) : ''}</div>
                    <button type="button" style="width:auto; margin:6px 0;" onclick="highlightBuildPerks('${escHtml(b.id)}')">${isHl ? '✖ Снять подсветку' : '🔦 Подсветить в ветках'}</button>
                    <ol class="st-build-perks">${rows}</ol>
                    ${b.tips ? `<div class="st-build-tips">💡 ${escHtml(b.tips)}</div>` : ''}
                </div></details>`;
        }).join('') || '<p style="opacity:.7;">Билды не загружены (builds-data.js).</p>';
    };
    window.highlightBuildPerks = function (id) {
        document.querySelectorAll('.perk-item.st-build-hl').forEach(x => x.classList.remove('st-build-hl'));
        if (_buildsHighlighted === id) { _buildsHighlighted = null; window.renderBuildsPanel(); return; }
        const b = (window.buildsData || []).find(x => x.id === id); if (!b) return;
        _buildsHighlighted = id;
        let first = null;
        b.perks.forEach(e => {
            const loc = buildPerkLocate(e.tree, e.perk); if (!loc.perk) return;
            const item = document.querySelector(`.perk-item[data-perk-key="${loc.sIdx}-${loc.pIdx}"]`); if (!item) return;
            item.classList.add('st-build-hl');
            const body = document.getElementById('skill-body-' + loc.sIdx);
            if (body && body.style.display === 'none') window.toggleSkillPanel(loc.sIdx); // раскрываем ветку, чтобы подсветку было видно
            if (!first) first = item;
        });
        window.renderBuildsPanel();
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Обработчик ручного изменения навыка
    // Проверяет, отмечена ли хоть одна ступень перка с данным именем (в любом навыке)
    function isPerkChecked(perkName) {
        for (let sIdx = 0; sIdx < skillNames.length; sIdx++) {
            const pList = fullPerksManifest[skillNames[sIdx]] || [];
            for (let pIdx = 0; pIdx < pList.length; pIdx++) {
                if (pList[pIdx].name === perkName) {
                    for (let s = 1; s <= pList[pIdx].steps; s++) {
                        const chk = document.getElementById(`perk-${sIdx}-${pIdx}-${s}`);
                        if (chk && chk.checked) return true;
                    }
                }
            }
        }
        return false;
    }

    // Сколько ступеней перка отмечено (0 — не взят).
    function perkStepsTaken(perkName) {
        let n = 0;
        skillNames.forEach((tree, sIdx) => (fullPerksManifest[tree] || []).forEach((p, pIdx) => {
            if (p.name !== perkName) return;
            for (let st = 1; st <= p.steps; st++) { const c = document.getElementById(`perk-${sIdx}-${pIdx}-${st}`); if (c && c.checked) n = Math.max(n, st); }
        }));
        return n;
    }
    // Дальность призыва от хозяина (футы) — для боевой сетки мастера. Обычно 15 фт.
    // «Призыватель»: 30/45 фт для существ и поднятой нежити, но не для скелетов; скелетов — «Усиление связи» (30 фт).
    window.getSummonRangeFt = function (category) {
        if (category === 'skeleton') return isPerkChecked('Усиление связи') ? 30 : 15;
        const st = perkStepsTaken('Призыватель');
        return st >= 2 ? 45 : st === 1 ? 30 : 15;
    };

    // Разрешает отметить перк только если выполнены требования (навык + перк-предок + предыдущая ступень)
    // Эффективное значение навыка = базовое (вложенное игроком) + расовый бонус.
    // Именно оно должно использоваться во всех проверках/формулах — это то, что
    // реально видит и ожидает игрок, глядя на цифру в поле навыка.
    // Имя навыка сравниваем без учёта регистра и «ё/е»: в данных перков встречалось «Тяжёлая броня» и «взлом»,
    // indexOf не находил навык, проверка считала его равным 0 — и почти вся ветка брони не бралась вообще.
    const _skillNameNorm = n => String(n || '').toLowerCase().replace(/ё/g, 'е').trim();
    const SKILL_MAX = 100;
    function getEffectiveSkillValue(skillName) {
        let idx = skillNames.indexOf(skillName);
        if (idx === -1) { const k = _skillNameNorm(skillName); idx = skillNames.findIndex(n => _skillNameNorm(n) === k); }
        if (idx === -1) return 0;
        skillName = skillNames[idx]; // ниже расовый бонус ищется по точному имени
        const input = document.getElementById(`skill-${idx}`);
        if (!input) return 0;
        const raw = parseInt(input.getAttribute('data-raw-val')) || 10;
        const race = document.getElementById('char-race').value;
        const bonus = (raceSkillBonuses[race] && raceSkillBonuses[race][skillName]) || 0;
        return Math.min(SKILL_MAX, raw + bonus + godSkillPoints(skillName) + gearSkillPoints(skillName) - ((skillName === 'Красноречие' && lichPerk('visage')) ? 5 : 0)); // «Лик смерти»: −5 к красноречию; потолок навыка — 100 вместе с расовым бонусом
    }
    // Пункты навыка от снаряжения: «+5 навыка Разрушения» (вещи Брурида).
    function gearSkillPoints(skillName) {
        if (typeof getGearTextBonuses !== 'function' || typeof equippedSlots === 'undefined') return 0;
        try {
            const pts = getGearTextBonuses().skillPts, k = canonSkillKey(skillName);
            return Object.keys(pts).reduce((n, w) => n + (canonSkillKey(w).slice(0, 6) === k.slice(0, 6) ? pts[w] : 0), 0);
        } catch (e) { return 0; }
    }
    // Пункты навыка от бога: Хермеус Мора 3 — всем школам магии, Мерунес Дагон — Разрушению.
    const MAGIC_SCHOOL_SKILLS = ['Иллюзия', 'Колдовство', 'Разрушение', 'Изменение', 'Восстановление'];
    function godSkillPoints(skillName) {
        if (typeof gb !== 'function') return 0;
        let p = 0;
        if (MAGIC_SCHOOL_SKILLS.includes(skillName)) p += gb('allSchoolsBonus');
        if (skillName === 'Разрушение') p += gb('destructionSkill');
        return p;
    }

    function validatePerkCheck(checkbox) {
        if (!checkbox.checked) {
            // Взятый перк — навсегда: отказаться от него и переложить очко в другой нельзя (решение автора правил).
            // Раньше снятие галочки возвращало очко, и билд можно было перекраивать перед каждым боем.
            checkbox.checked = true;
            alert('Перк уже взят — отказаться от него нельзя. Очки перков вкладываются один раз.');
            return;
        }

        const skillIdx = parseInt(checkbox.dataset.skillidx);
        const perkIdx = parseInt(checkbox.dataset.perkidx);
        const step = parseInt(checkbox.dataset.step);
        const skillName = skillNames[skillIdx];
        const perk = (fullPerksManifest[skillName] || [])[perkIdx];
        if (!perk) { updateAll(); saveLocalStorage(); return; }

        if (step > 1) {
            const prevChk = document.getElementById(`perk-${skillIdx}-${perkIdx}-${step - 1}`);
            if (prevChk && !prevChk.checked) {
                checkbox.checked = false;
                alert(`Сначала возьми предыдущую ступень перка «${perk.name}».`);
                return;
            }
        }

        const req = perk.req;
        if (req) {
            if (req.skill) {
                const skillVal = getEffectiveSkillValue(req.skill);
                const needed = req.thresholds[step - 1] || 0;
                if (skillVal < needed) {
                    checkbox.checked = false;
                    alert(`Нужен навык «${req.skill}» не ниже ${needed} (сейчас ${skillVal}).`);
                    return;
                }
            }
            if (req.prereq && req.prereq.length) {
                for (const group of req.prereq) {
                    const satisfied = group.some(name => isPerkChecked(name));
                    if (!satisfied) {
                        checkbox.checked = false;
                        alert(`Сначала нужен перк: ${group.join(' или ')}.`);
                        return;
                    }
                }
            }
        }

        // Раньше здесь не было проверки на очки перков вообще — можно было взять любое
        // количество перков независимо от уровня. Каждая ступень стоит 1 очко.
        if (perkPointsAvailable <= 0) {
            checkbox.checked = false;
            alert('Нет свободных очков перков. Получи уровень (вкладка «Проверка»), чтобы открыть ещё одно.');
            return;
        }
        perkPointsAvailable -= 1;
        renderLevelPanel();
        updateAll();
        saveLocalStorage();
    }
    window.validatePerkCheck = validatePerkCheck;
