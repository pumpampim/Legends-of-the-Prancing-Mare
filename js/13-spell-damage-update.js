
    // ===== Кубики в уроне заклинаний, огненный бонус ранга, Болид =====
    function getSpellDice(desc, enhanced) {
        const text = splitEnhancedDesc(desc, enhanced);
        const m = text.match(/нанос[а-яёА-ЯЁ]*\s+(\d+)\s*[дd]\s*(\d+)/i);
        return m ? { n: parseInt(m[1]), sides: parseInt(m[2]) } : null;
    }
    // Огненные заклинания Разрушения: +1д6 урона за каждый ранг (новичок 1д6, ученик 2д6, адепт 3д6, эксперт 4д6).
    function fireRankDice(spellName, school, dmgType) {
        if (school !== 'destr' || dmgType !== 'fire') return null;
        const tier = getSpellTierByName('destr', spellName);
        if (!tier) return null;
        const r = rollNd(tier, 6);
        return { n: tier, sum: r.sum, rolls: r.rolls };
    }
    // Весь расчёт урона заклинания: бонус огня, баффы силы заклинаний, боги, усиление навыка, Шеогорат.
    function computeSpellDamage(spellName, school, baseDmg, forceType) {
        const spellPowerPct = (typeof getActivePercentBonuses === 'function') ? getActivePercentBonuses().spellPower : 0;
        const dmgType = forceType || detectDmgTypeFromName(spellName);
        const fire = fireRankDice(spellName, school, dmgType);
        const gsp = getGearSpecialBonuses();
        // Роба разрушения: «добавляет 1д6 к горению» — к огненным заклинаниям Разрушения.
        const robeBurn = (gsp.burnDice && school === 'destr' && dmgType === 'fire') ? rollNd(gsp.burnDice, 6) : null;
        if (robeBurn && fire) { fire.sum += robeBurn.sum; fire.rolls = fire.rolls.concat(robeBurn.rolls); fire.n += gsp.burnDice; }
        // «Все заклинания на N% сильнее» (Выпускник Коллегии) — к урону любого заклинания.
        let dmg = Math.round((baseDmg + (fire ? fire.sum : robeBurn ? robeBurn.sum : 0)) * (1 + (spellPowerPct + gsp.spellPowerPct) / 100));
        const skillName = SCHOOL_CODE_TO_SKILL[school] || null;
        // Хермеус Мора / Мерунес Дагон дают пункты навыка (getEffectiveSkillValue), Мерунес «огнём» и Акатош — атакам, не здесь.
        let godSpellPct = gb('spellPower');
        if (dmgType === 'poison') godSpellPct += gb('poisonDmg');
        if (godSpellPct) dmg = Math.round(dmg * (1 + godSpellPct / 100));
        // Маски жрецов: «урон огнём/холодом/электричеством +25%» — к заклинаниям этой стихии.
        { const gE = (typeof getGearTextBonuses === 'function') ? (getGearTextBonuses().elemDmg[dmgType] || 0) : 0; if (gE) dmg = Math.round(dmg * (1 + gE / 100)); var gearElemPct = gE; }
        // Перки «Усиленное пламя / Усиленный мороз / Усиленные молнии»: +25/50% урона заклинаний Разрушения нужной стихии.
        let elemPerkPct = 0;
        if (skillName === 'Разрушение') {
            const pbE = window.perkBonuses || {};
            elemPerkPct = dmgType === 'fire' ? (pbE.fireSpellBonus || 0) : dmgType === 'frost' ? (pbE.frostSpellBonus || 0) : dmgType === 'shock' ? (pbE.shockSpellBonus || 0) : 0;
            if (elemPerkPct) dmg = Math.round(dmg * (1 + elemPerkPct / 100));
        }
        const schoolBoostPct = (skillName && (['Разрушение', 'Восстановление', 'Изменение'].includes(skillName) || (skillName === 'Колдовство' && /Проклят|Хрупкость/.test(spellName)))) ? getSkillBoostPercent(skillName) : 0;
        if (schoolBoostPct) dmg = Math.round(dmg * (1 + schoolBoostPct / 100));
        if (typeof sheogorathRoll !== 'undefined' && sheogorathRoll.dmgMult !== 1) dmg = Math.round(dmg * sheogorathRoll.dmgMult);
        return { dmg, dmgType, spellPowerPct: spellPowerPct + gsp.spellPowerPct, godSpellPct, schoolBoostPct, skillName, fire: fire || (robeBurn ? { n: gsp.burnDice, sum: robeBurn.sum, rolls: robeBurn.rolls } : null), elemPerkPct, gearElemPct };
    }
    function fireNote(fire) {
        return fire ? ` (🔥 +${fire.sum} к базе: ${fire.n}д6 за ранг заклинания [${fire.rolls.join('+')}])` : '';
    }
    // Болид: урон растёт с расстоянием до цели. Спрашиваем игрока. null — отмена/ошибка.
    function askBolideDistance(desc, enhanced) {
        const text = splitEnhancedDesc(desc, enhanced);
        const base = parseInt((text.match(/нанос[а-яё]*\s+(\d+)/i) || [])[1]) || 35;
        const pm = text.match(/за\s+каждые\s+(\d+)\s*фут[а-яё]*[^+]*\+\s*(\d+)/i);
        const step = pm ? parseInt(pm[1]) : 10, bonus = pm ? parseInt(pm[2]) : 10;
        const maxFt = parseInt((text.match(/максимум\s+(\d+)\s*фут/i) || [])[1]) || 40;
        const ans = window.prompt(`Болид: сколько футов до цели? (от 0 до ${maxFt}; +${bonus} урона за каждые ${step} фт)`, '10');
        if (ans === null) return null;
        const dist = parseInt(String(ans).replace(',', '.'), 10);
        if (isNaN(dist) || dist < 0) { alert('Нужно целое число футов (0 или больше).'); return null; }
        if (dist > maxFt) { alert(`Болид летит максимум на ${maxFt} фт — цель слишком далеко.`); return null; }
        const dmg = base + Math.floor(dist / step) * bonus;
        return { dist, dmg, base, step, bonus };
    }

    // ===== Стены огня/мороза/молнии: держатся, пока хватает маны; игрок отмечает, кого задела =====
    const WALL_SPELLS = {
        'Стена пламени': { icon: '🔥', word: 'огненная стена' },
        'Стена мороза': { icon: '❄️', word: 'морозная стена' },
        'Грозовая стена': { icon: '⚡', word: 'грозовая стена' }
    };
    // Окно выбора нескольких живых врагов из сессии мастера → onDone([id, …]).
    function pickEnemyTargets(title, onDone) {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const alive = session ? (session.enemies || []).filter(e => (e.curHp || 0) > 0) : [];
        if (!alive.length) { alert('В сессии нет живых врагов (зайди в сессию мастера на вкладке «Сессия»).'); return; }
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        ov.innerHTML = '<div style="background:var(--panel-bg);color:var(--text-color);border:1px solid var(--border-bright);border-radius:8px;max-width:420px;width:100%;max-height:80vh;overflow:auto;padding:14px;">' +
            '<h3 style="margin:0 0 8px;">' + escHtml(title) + '</h3>' +
            alive.map(e => '<label style="display:flex;gap:6px;align-items:center;margin:4px 0;"><input type="checkbox" style="width:auto;" data-id="' + escHtml(e.id) + '"> ' + escHtml(e.name) + ' (HP ' + (e.curHp || 0) + '/' + (e.maxHp || 0) + ')</label>').join('') +
            '<div style="display:flex;gap:8px;margin-top:10px;"><button type="button" class="pick-ok">Применить</button><button type="button" class="btn-danger pick-cancel">Отмена</button></div></div>';
        document.body.appendChild(ov);
        ov.querySelector('.pick-cancel').onclick = () => ov.remove();
        ov.querySelector('.pick-ok').onclick = () => {
            const ids = Array.prototype.slice.call(ov.querySelectorAll('input[type=checkbox]:checked')).map(c => c.getAttribute('data-id'));
            ov.remove();
            if (ids.length) onDone(ids);
        };
    }
    window.openWallStrike = function (effId) {
        const e = (activeTimedEffects || []).find(x => x.id === effId);
        if (!e || !e.wall || !window.CloudSync) return;
        const w = e.wall;
        // Стена бьёт раз за ход: отметка хода на самом эффекте (сохраняется с листом).
        if (inCombatNow() && w.lastTurn === turnKeyNow()) { alert(w.icon + ' «' + e.effectName + '» в этом ходу уже ударила — следующий удар в следующем ходу.'); return; }
        pickEnemyTargets(w.icon + ' «' + e.effectName + '»: кого задела стена в этот ход?', ids => {
            if (inCombatNow() && w.lastTurn === turnKeyNow()) return;
            if (inCombatNow()) { w.lastTurn = turnKeyNow(); saveLocalStorage(); }
            const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
            const outs = [];
            let chain = Promise.resolve();
            ids.forEach(id => {
                chain = chain.then(() => {
                    const cd = computeSpellDamage(e.effectName, 'destr', w.base);
                    return window.CloudSync.applyDamageToEnemy(id, cd.dmg, myName, w.icon + ' «' + e.effectName + '» (' + myName + '): урон ' + cd.dmg, cd.dmgType, 0)
                        .then(r => outs.push(r.enemyName + ': ' + r.finalDmg + (r.resist ? ' (резист ' + r.resist + '%)' : '') + (r.newHp <= 0 ? ' — повержен(а)' : '') + fireNote(cd.fire)));
                });
            });
            chain.then(() => alert(w.icon + ' «' + e.effectName + '» задела:\n' + outs.join('\n'))).catch(err => alert('Ошибка: ' + err.message));
        });
    };

    // ===== Обнаружение жизни / смерти, Тревога: показывает, кто есть в бою =====
    window.showDetection = function (kind) {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const enemies = session ? (session.enemies || []) : [];
        const group = arr => { const c = {}; arr.forEach(e => { c[e.name] = (c[e.name] || 0) + 1; }); return Object.keys(c).map(n => c[n] > 1 ? n + ' ×' + c[n] : n); };
        const alive = enemies.filter(e => (e.curHp || 0) > 0);
        let title, list, range;
        if (kind === 'life') {
            title = '👁 Обнаружение жизни';
            list = group(alive.filter(e => ['undead', 'automaton'].indexOf(getEnemyMeta(e).kind) === -1));
            range = 'до 100 фт в помещении / 200 фт вне его';
        } else if (kind === 'death') {
            title = '💀 Обнаружение смерти';
            list = group(enemies.filter(e => (e.curHp || 0) <= 0).concat(alive.filter(e => getEnemyMeta(e).kind === 'undead')));
            range = 'до 100 фт в помещении / 200 фт вне его';
        } else {
            title = '🔔 Тревога';
            list = group(alive);
            range = 'до 70 фт';
        }
        if (!session) { alert(title + ': нет сессии мастера — враги неизвестны, спроси мастера.'); return; }
        alert(title + '\n' + (list.length ? list.join('\n') : 'Никого не обнаружено.') + '\n\nДальность: ' + range + '. Список — всех в бою; кто из них в радиусе, решает мастер.');
    };

    // Обычный удар щитом (без перка): половина брони щита, минимум 1. Даёт цели −1 к кубам на ход
    // (подсказка ветки Блокирования: «Удар плашмя: даёт врагу −1»). Силовой удар плашмя с перком — как раньше.
    function shieldBashBasicDmg(shieldArmor) { return Math.max(1, Math.round((parseInt(shieldArmor) || 0) / 2)); } // правила: ½ брони щита
    function renderAttackActionSelect() {
        const select = document.getElementById('attack-action-select');
        if (!select) return;
        let opts = '<option value="melee">Оружие ближнего боя</option><option value="ranged">Оружие дальнего боя</option>';
        if (isPerkChecked('Быстрая стрельба') && (document.getElementById('wep-ranged-type') || {}).value === 'bow') opts += '<option value="quickshot">⚡ Быстрый выстрел из лука (доп. действие, ⅓ урона)</option>';
        if (playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.isTransformed) {
            opts += `<option value="claw">🐺 Когти зверя (${getWerewolfClawDamage()} урона)</option>`;
        }
        if (snLordForm()) opts += `<option value="bite">🦇 Укус вампира-лорда (${lordBiteDamage()} урона)</option>`;
        if ((document.getElementById('char-race') || {}).value === 'argonian') opts += `<option value="argbite">🦎 Укус аргонианина (1к6 + мод. Силы, колющий)</option>`;
        { const pbBO = window.perkBonuses || {}; const shO = parseInt((document.getElementById('slot-shield-armor') || {}).value) || 0;
          // Удар щитом есть у всех, у кого щит в левой руке; «Силовой удар плашмя» — только с перком.
          if (shO > 0) opts += `<option value="bash_basic">🛡 Удар щитом (${shieldBashBasicDmg(shO)} урона, цель −1 к кубам)</option>`;
          if (pbBO.shieldBash && shO > 0) opts += `<option value="bash">🛡 Силовой удар плашмя (${shO * (pbBO.shieldBashX5 ? 5 : 1)} урона${pbBO.shieldBashDisarm ? ', шанс обезоружить' : ''})</option>`; }
        (customSpells || []).forEach(s => {
            // Заклинания призыва/подъёма (плоть, оружие, зомби, атронахи) НЕ прямые атаки — их числа
            // в описании описывают призываемое существо/предмет, а не урон по цели. Кастуются через
            // обычную кнопку "Каст" на карточке заклинания, не через этот инструмент.
            if (findSummonTemplateBySpellName(s.name)) return;
            if (GRID_RUNE_SPELLS[s.name]) return; // руны не бьют напрямую — ставятся на боевую сетку (кнопка «Каст» на карточке)
            if (PLAYER_CONTROL_SPELLS[s.name] || /^Аура Стендарра/.test(s.name) || WEAPON_SPIRITS[s.name] || WALL_SPELLS[s.name]) return; // управляющие заклинания, аура и «духи оружия» идут отдельно
            // Обереги, барьеры и «Священное оружие» — бафы на себя, а не атаки: числа в их описании («поглощает 40», «1 урона = 5 маны»)
            // раньше читались как урон. Плащи и прочие зоны на боевой сетке ставятся кнопкой «Каст»; без сетки остаются здесь как удар по одной цели.
            if (/оберег|барьер/i.test(s.name) || s.name === 'Священное оружие') return;
            if (GRID_ZONE_SPELLS[s.name] && typeof gridZoneAvailable === 'function' && gridZoneAvailable()) return;
            const dmg = parseSpellDamageFromDesc(s.desc);
            const enhDmg = parseSpellDamageFromDesc(s.desc, true);
            if (dmg) {
                const schoolLabel = SCHOOL_CODE_TO_SKILL[s.school] || '';
                const enhSuffix = (enhDmg && enhDmg !== dmg) ? `, усиленно ~${enhDmg}` : '';
                opts += `<option value="spell:${escHtml(s.id)}">${escHtml(s.name)}${schoolLabel ? ' [' + escHtml(schoolLabel) + ']' : ''} (заклинание, ~${dmg} урона${enhSuffix})</option>`;
            }
        });
        // Свитки с уроном — раньше их вообще не было в списке, "Читать" всегда бил по себе,
        // из-за чего боевые свитки на деле ничего не делали.
        (playerInventory || []).filter(i => (i.category || '').indexOf('Свит') === 0).forEach(i => {
            if (findSummonTemplateBySpellName(i.scrollSpellName || i.name.replace(/^Свиток:\s*/, ''))) return;
            if (/оберег|барьер|Священное оружие/i.test(i.scrollSpellName || i.name)) return; // бафы на себя, не атака
            const dmg = parseSpellDamageFromDesc(i.effect || '');
            if (dmg) opts += `<option value="scroll:${escHtml(i.itemId)}">📜 ${escHtml(i.name)} (свиток, ~${dmg} урона, есть: ${i.count})</option>`;
        });
        (playerInventory || []).filter(i => i.isMagicStaff && i.usesLeft > 0).forEach(i => { // посохи-заклинатели с уроном
            const dmg = parseSpellDamageFromDesc(i.effect || '');
            if (dmg) opts += `<option value="mstaff:${escHtml(i.itemId)}">🪄 ${escHtml(i.name)} (~${dmg} урона, зарядов: ${i.usesLeft})</option>`;
        });
        (activeSummons || []).forEach(s => {
            // "кроме оружий" — призванное оружие (category:'weapon', Клинок Азуры и т.п.) не
            // атакует САМО — его экипируют и бьют обычным ближним/дальним боем, оно не "существо".
            if (s.category === 'weapon') return;
            if (s.dmg) opts += `<option value="summon:${escHtml(s.id)}">${escHtml(s.name)} (существо, ${s.dmg} урона)</option>`;
        });
        // Управляющие заклинания (Страх/Успокоение/Ярость/Полиморф и т.п.) — раньше были только
        // текстом, теперь применяют реальный статус к цели вместо урона.
        (customSpells || []).forEach(s => {
            const ctrl = PLAYER_CONTROL_SPELLS[s.name];
            if (ctrl) opts += `<option value="control:${escHtml(s.id)}">🌀 ${escHtml(s.name)} (${escHtml(ctrl.desc)})</option>`;
        });
        select.innerHTML = opts;
        updateAttackActionInfo();
        initSectionAccordions();
    }

    function initSectionAccordions() {
    const tabs = ['tab1', 'tab3', 'tab5', 'tab6'];
    tabs.forEach(tabId => {
        const tab = document.getElementById(tabId);
        if (!tab) return;
        // Собираем все «верхние» панели: прямые дети вкладки и дети .grid-2/.grid-3 внутри вкладки
        const panels = new Set();
        tab.querySelectorAll(':scope > .panel').forEach(p => panels.add(p));
        tab.querySelectorAll(':scope > .grid-2 > .panel').forEach(p => panels.add(p));
        tab.querySelectorAll(':scope > .grid-2 > .grid-col > .panel').forEach(p => panels.add(p));
        tab.querySelectorAll(':scope > .grid-3 > .panel').forEach(p => panels.add(p));

        let counter = 0;
        panels.forEach(panel => {
            if (panel.dataset.secId) return; // уже обработана — не оборачиваем повторно
            const h2 = panel.querySelector(':scope > h2');
            if (!h2) return;
            const panelId = tabId + '-sec-' + (counter++);
            panel.dataset.secId = panelId;

            const body = document.createElement('div');
            body.className = 'section-body';
            body.id = panelId + '-body';

            // Переносим всё, что идёт после h2 (сам h2 остаётся в панели)
            const kids = Array.from(panel.children);
            let afterH2 = false;
            kids.forEach(ch => {
                if (ch === h2) { afterH2 = true; return; }
                if (afterH2) body.appendChild(ch);
            });
            panel.appendChild(body);

            // Навешиваем клик на h2
            h2.classList.add('section-header');
            h2.innerHTML = `<span class="section-title">${h2.innerHTML}</span><span class="section-chevron">▾</span>`;
            h2.addEventListener('click', () => toggleSectionById(panelId));
        });
    });
}

window.toggleSectionById = function (panelId) {
    const panel = document.querySelector(`[data-sec-id="${panelId}"]`);
    if (!panel) return;
    const body = document.getElementById(panelId + '-body');
    const chev = panel.querySelector('.section-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
};
// Задача F: календарь праздников — ищет праздник(и) на сегодняшнюю дату (gameMonth/gameDayNum
// уже 0-11, тот же индекс что в holidaysData).
function findTodayHolidays() {
    if (!window.holidaysData) return [];
    return window.holidaysData.filter(h => h.month === gameMonth && h.day === gameDayNum);
}

function renderTodayHolidayWidget() {
    const el = document.getElementById('today-holiday-widget');
    if (!el) return;
    const today = findTodayHolidays();
    if (!today.length) { el.innerHTML = ''; return; }
    el.innerHTML = today.map(h => `<div style="color:var(--accent-color);">🎉 Сегодня: <strong>${escHtml(h.title)}</strong> (${escHtml(h.group)})${h.discount ? ` — скидка у торговцев до ${h.discount}%!` : ''}</div>`).join('');
}

// Штрафы/тюрьма — в отличие от репутации, это должно быть видно игроку.
function renderCrimeStatusPlayer() {
    const el = document.getElementById('crime-status-widget');
    if (!el) return;
    const c = playerCrimeState;
    if (!c) { el.innerHTML = ''; return; }
    if (c.inJail) {
        el.innerHTML = `<div style="color:#e67e22;">🔒 Ты в тюрьме (${escHtml(c.jailHold || '?')}), осталось ${c.jailDaysRemaining || 0} дн. Доступен только отдых; кормят бесплатно — голод не растёт.</div>`;
    } else if (c.fineAmount > 0) {
        el.innerHTML = `<div style="color:#e74c3c;">⚖️ Штраф: ${c.fineAmount} септимов (${escHtml(c.fineHold || '?')})${c.fineReason ? ' — ' + escHtml(c.fineReason) : ''}</div>`;
    } else {
        el.innerHTML = '';
    }
}

function renderCalendarTab() {
    const el = document.getElementById('calendar-list');
    const widgetEl = document.getElementById('calendar-today-widget');
    if (!el || !window.holidaysData) return;
    const today = findTodayHolidays();
    widgetEl.innerHTML = today.length
        ? `🎉 Сегодня (${gameDayNum} ${MONTH_NAMES[gameMonth]}): ${today.map(h => `<strong>${escHtml(h.title)}</strong>`).join(', ')}`
        : `Сегодня (${gameDayNum} ${MONTH_NAMES[gameMonth]}) праздников нет.`;

    // Группируем по "part" (6 частей календаря), сохраняя исходный порядок.
    const parts = [];
    const byPart = {};
    window.holidaysData.forEach(h => {
        if (!byPart[h.part]) { byPart[h.part] = []; parts.push(h.part); }
        byPart[h.part].push(h);
    });
    el.innerHTML = parts.map(partTitle => `
        <h3 style="margin-top:14px;">${escHtml(partTitle)}</h3>
        ${byPart[partTitle].map(h => {
            const isToday = h.month === gameMonth && h.day === gameDayNum;
            return `<div class="party-row" style="${isToday ? 'border-color:var(--accent-color); box-shadow:0 0 6px var(--accent-color);' : ''}">
                <div class="row-name"><strong>${isToday ? '🎉 ' : ''}${escHtml(h.title)}</strong><span>${h.day} ${escHtml(MONTH_NAMES[h.month])}</span></div>
                <div style="font-size:12px; opacity:.75;">${escHtml(h.group)}${h.discount ? ` · скидка до ${h.discount}%` : ''}</div>
                <div style="font-size:13px; margin-top:2px;">${escHtml(h.desc)}</div>
            </div>`;
        }).join('')}
    `).join('');
}

function updateDateDisplay() {
    const el = document.getElementById('date-display');
    if (el) {
        const season = getCurrentSeason();
        el.textContent = `📅 ${gameDayNum} ${MONTH_NAMES[gameMonth]}, 4Э ${gameYear} · ${season.icon} ${season.name}`;
    }
    renderTodayHolidayWidget();
    if (typeof window.renderSeasonNote === 'function') { window.renderSeasonNote(); if (typeof renderKnownIngredients === 'function') { try { renderKnownIngredients(); } catch (e) { } } }
    if (typeof renderCalendarTab === 'function') renderCalendarTab();
    const hungerEl = document.getElementById('hunger-status');
    if (hungerEl) {
        if (daysWithoutFood === 0) {
            hungerEl.style.display = 'none';
        } else {
            hungerEl.style.display = 'block';
            hungerEl.innerHTML = `🍖 Голод: <strong>${daysWithoutFood} дн.</strong> без еды · <strong>−${hungerPenaltyDays() * 2} к кубам</strong>${hungerPenaltyDays() < daysWithoutFood ? ' (Одение повара: первый день без штрафа)' : ''} (поешь, чтобы сбросить)`;
        }
    }
    const starveInput = document.getElementById('food-starve');
    if (starveInput) starveInput.value = daysWithoutFood;
}

window.toggleCampPanelPlayer = function () {
    const body = document.getElementById('camp-panel-body');
    const chev = document.getElementById('camp-panel-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
};

// Разбить лагерь — физически (Палатка+Набор для костра+Полено, ничего не тратится при разбивке,
// расходники списываются при сворачивании) или магией (знание заклинания "Создание предмета";
// усиленный каст даёт магически безопасный лагерь — замена несуществующего в моём дереве перков
// "Великого созидателя" из исходного ТЗ, см. заметки).
window.deployCampSite = function (useMagic) {
    const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
    if (!session) { alert('Нет соединения с сессией.'); return; }
    if (session.campState && session.campState.active) { alert('Лагерь уже разбит.'); return; }
    let isMagicallySafe = false;
    if (useMagic) {
        const spell = (customSpells || []).find(s => s.name === 'Создание предмета');
        if (!spell) { alert('Не знаешь заклинание «Создание предмета».'); return; }
        { const hb = castBlockReason(); if (hb) { alert(hb); return; } }
        if (!castMuteCheck() || !combatActionAllowed('cast')) return;
        const enhancedCast = !enhancedBlockReason('alter', spell.desc, spell.name) && confirm('Скастовать усиленно (х2 маны)? Усиленный каст делает лагерь магически безопасным от засад (замена «Великого созидателя» — такого перка в этой системе нет). Отмена = обычный каст.');
        const costInput = document.querySelector(`#card-${spell.id} .spell-final-cost`);
        // Бесплатный каст («Маг») — только обычный: усиленный считается от полной цены и бесплатный каст не тратит (как у карточки).
        const freeNow = !!(costInput && costInput.dataset && costInput.dataset.freeReason);
        const baseCost = (enhancedCast && freeNow) ? (parseInt(costInput.dataset.paidCost) || spell.baseCost || 0) : (costInput ? (parseInt(costInput.value) || 0) : (spell.baseCost || 0));
        const finalCost = enhancedCast ? Math.round(baseCost * getEnhancedCostFactor(spell.school, spell.name)) : baseCost;
        const curMpEl = document.getElementById('cur-mp');
        const curMp = parseInt(curMpEl.value) || 0;
        if (finalCost > curMp) { alert(`Не хватает маны: нужно ${finalCost}, есть ${curMp}.`); return; }
        if (!enhancedCast) consumeMageSignFreeCast(costInput);
        curMpEl.value = curMp - finalCost;
        markCombatAction('attack');
        updateVitalBars();
        saveLocalStorage();
        isMagicallySafe = enhancedCast;
    } else {
        if (countInInventory('Палатка (15x15 футов)') < 1 || countInInventory('Набор для костра') < 1 || countInInventory('Полено') < 1) {
            alert('Нужны Палатка, Набор для костра и Полено (хотя бы по 1 шт.) — чего-то не хватает в инвентаре.');
            return;
        }
    }
    const myName = document.getElementById('char-name').value || 'Игрок';
    window.CloudSync.setCampState({
        active: true, hasTent: !useMagic, isMagicallySafe: isMagicallySafe, deployedBy: myName, deployedByUid: myUidG() || null, ambushResolved: false
    }).then(() => {
        // Набор для костра и полено тратит тот, кто разбил лагерь (раньше списывались у того, кто сворачивал).
        if (!useMagic) { removeFromInventoryByName('Набор для костра', 1); removeFromInventoryByName('Полено', 1); renderInventoryList(); saveLocalStorage(); }
        if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`⛺ ${myName} разбил(а) лагерь${useMagic ? ' силой магии' : ''}.`, myName);
    }).catch(e => alert('Ошибка: ' + e.message));
};

window.teardownCampSite = function () {
    const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
    if (!session || !session.campState || !session.campState.active) return;
    // Расходники уже списаны у разбившего лагерь (deployCampSite).
    window.CloudSync.setCampState({ active: false }).catch(e => alert('Ошибка: ' + e.message));
};

window.nextDay = function () {
    // Защита от «прокрутки» дней: каждое «Следующий день» сбрасывает ману, дневные способности, бесплатные касты и лимиты занятий.
    // В сессии — не больше лимита мастера (по умолчанию 20) переходов в реальный час (путешествие на неделю укладывается), и мастер видит это в журнале.
    if (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession()) {
        const now = Date.now();
        let hist = []; try { hist = JSON.parse(localStorage.getItem('skyrim_nextday_hist') || '[]'); } catch (e) { }
        hist = (Array.isArray(hist) ? hist : []).filter(t => now - t < 3600000);
        const capD = gmLimit('nextDay', 20);
        if (capD > 0 && hist.length >= capD) { alert('Слишком много смен дня за последний час (' + capD + '). Если мастер объявил долгий промежуток времени — попроси его, он может поднять лимит или снять его.'); return; }
        hist.push(now); try { localStorage.setItem('skyrim_nextday_hist', JSON.stringify(hist)); } catch (e) { }
        if (window.CloudSync.postCombatLog) { const nm = (document.getElementById('char-name') || {}).value || 'Игрок'; window.CloudSync.postCombatLog('📅 ' + nm + ': следующий день', nm); }
    }
    // Прокатываем дату
    godDay = { light: 0, heavy: 0 }; // новый день — счётчик алкоголя Сангвина обнуляется
    mageSignFreeUsed = false; // новый день — снова доступен бесплатный каст знака «Маг»
    powersUsedToday = {};     // новый день — «раз в день» способности снова доступны
    keeperBarrierLeft = KEEPER_BARRIER_MAX; // барьер Перчаток Хранителя восстанавливается
    try { stopBalladIfMine(); } catch (e) { } // ночью бард перестаёт играть
    activeTimedEffects = activeTimedEffects.filter(e => !e.untilDayEnd); // «до конца дня» (хриплый голос после боевого клича)
    clampTempHp();
    const longRestNotes = applyLongRest();
    const craftReport = (typeof window.processCraftQueue === 'function') ? window.processCraftQueue() : null;
    gameDayNum++;
    if (gameDayNum > 30) {
        gameDayNum = 1;
        gameMonth++;
        if (gameMonth > 11) { gameMonth = 0; gameYear++; }
    }

    // Задача C: счётчик игровых дней сессии — нужен мастеру для "ассортимент устарел".
    if (window.CloudSync && typeof window.CloudSync.bumpGameDayCounter === 'function') {
        window.CloudSync.bumpGameDayCounter();
    }

    // Тик дней заряда оружия и посохов. Раньше счётчик просто тикал до 0 и застревал — магия
    // не снималась сама, вещь навсегда оставалась "заряжена на 0 дней", но всё ещё зачарована.
    // Теперь при достижении 0 зачарование реально стирается — убираем суффикс "[Эффект]" из
    // имени и сам enchantment/chargeDaysLeft. Эффект описания не восстанавливаем к оригиналу
    // (он был перезаписан при накладывании чар и нигде больше не хранится) — просто помечаем
    // текстом, что магия иссякла; мастер/игрок могут поправить вручную при желании.
    const decayedItems = [];
    playerInventory.forEach(i => {
        if (!Object.prototype.hasOwnProperty.call(i, 'chargeDaysLeft')) return;
        if (i.chargeDaysLeft > 0) {
            i.chargeDaysLeft--;
            // Посох при нуле заряда не теряет заклинание — он просто разряжен до перезарядки камнем душ.
            // Оружие при нуле заряда тоже не теряет чары: они не действуют, пока не подзарядишь
            // (Зачарование → «Подзарядка оружия»). Раньше зачарование стиралось навсегда.
            if (i.chargeDaysLeft === 0 && i.enchantment && !i.isStaff) decayedItems.push(i.name);
        }
    });
    if (decayedItems.length) {
        alert(`⚠ Заряд кончился: ${decayedItems.join(', ')} — чары не действуют, пока не подзарядишь камнем душ (Зачарование → «Подзарядка оружия»).`);
    }

    // Тик длительности по ходам НЕ происходит — ходы и дни раздельны.
    // Но если хочешь, чтобы «раз в день» способности обнулялись, здесь это место.

    // Задача L: дневной тик сверхъестественного — вампиру растёт голод, оборотню
    // возвращается возможность превратиться.
    if (playerSupernaturalState) {
        let changed = false;
        if (playerSupernaturalState.vampirism) {
            const vN = playerSupernaturalState.vampire;
            vN.hungerStage = Math.min(4, (vN.hungerStage || 0) + 1);
            if (vN.isLord && !vN.lordPoolFedToday) vN.lordPool = Math.max(lordPool(), vN.hungerStage <= 2 ? 5 : 2); // голодным: первый голодный день (после сытого дня стадия уже выросла до 1, к утру — 2) половина, дальше четверть
            vN.lordPoolFedToday = false;
            changed = true;
        }
        if (playerSupernaturalState.lycanthropy) {
            playerSupernaturalState.werewolf.hasTransformedToday = false;
            playerSupernaturalState.werewolf.transformsToday = 0;
            if (playerSupernaturalState.werewolf.isTransformed) { playerSupernaturalState.werewolf.isTransformed = false; playerSupernaturalState.werewolf.hoursLeft = 0; snClearBoundSummons('werewolf'); } // длительный отдых — облик спадает
            changed = true;
        }
        if (lichDayTick()) changed = true;
        if (changed) {
            saveSupernaturalStatePlayer();
            renderSupernaturalStatusPlayer();
        }
    }

    // Голод: если сегодня не ели — счётчик растёт. В тюрьме кормят — голод не растёт.
    if (!inJailNow() && lichStage() < 1) daysWithoutFood += 1; // лич не ест и не голодает
    try { if (typeof renderTrainSection === 'function') renderTrainSection(); } catch (e) { }

    renderStaffList();
    renderWeaponChargeSelect();
    renderInventoryList();
    updateDateDisplay();
    updateAll();
    saveLocalStorage();

    // Лёгкое уведомление
    const nowFood = daysWithoutFood;
    if (nowFood > 0) {
        setTimeout(() => alert(`Прошёл день: ${gameDayNum} ${MONTH_NAMES[gameMonth]} 4Э ${gameYear}.\nДлительный отдых: ${longRestNotes.join('; ')}.\nДней без еды: ${nowFood} (−${hungerPenaltyDays()*2} к кубам).${craftReport ? '\n' + craftReport : ''}`), 50);
    } else {
        setTimeout(() => alert(`Прошёл день: ${gameDayNum} ${MONTH_NAMES[gameMonth]} 4Э ${gameYear}.\nДлительный отдых: ${longRestNotes.join('; ')}.${craftReport ? '\n' + craftReport : ''}`), 50);
    }
};

// Съесть что угодно из инвентаря, сбросить голод и применить бафф (если есть)
window.eatAnyFood = function (itemId) {
    const item = playerInventory.find(i => i.itemId === itemId);
    if (!item || item.count <= 0) return;
    // «Зелье крови» заменяет кровь: вампир утоляет СВОЙ голод по крови (обычный голод не трогает).
    if (item.name === 'Зелье крови' && playerSupernaturalState && playerSupernaturalState.vampirism) {
        window.playerVampireDrink('potion', itemId);
        return;
    }

    // Раньше тут была узкая проверка по категории (без "Сырые продукты"), из-за которой
    // сырую еду нельзя было съесть — теперь используем ту же полную проверку isFoodItem(),
    // что уже была написана ниже, но не подключена сюда.
    if (!isFoodItem(item)) {
        alert('Это не еда.');
        return;
    }
    if (snWerewolfForm()) { alert('В облике зверя нельзя есть обычную еду — оборотень лечится только пожиранием трупов.'); return; }
    if (lichBlocksUse(item, true)) return;
    if (!combatActionAllowed('item')) return; // в бою поесть — основное действие хода (Немота не мешает)
    markCombatAction('attack');

    // Если у блюда/еды есть эффект — активируем как обычный длящийся активный эффект
    // (тикает по ходам, как у зелий) через ту же функцию, что уже это умеет правильно —
    // раньше здесь был свой код, который понимал только "хп" и трактовал его как мгновенный
    // хил, из-за чего "+N хп на M ходов" терял и M (длительность), и любые мана/другие бонусы.
    if ((item.alchemyEffects && item.alchemyEffects.length) || item.effect) {
        activateTimedEffectFromItem(item, { fromFood: true });
    } else if (typeof window.isRawMeat === 'function' && window.isRawMeat(item.itemId)) {
        // Сырое мясо/рыба, съеденное без котла, вредит: −10 хп сразу (в котле то же самое даёт плюс).
        const hpEl = document.getElementById('cur-hp');
        const cur = parseInt(hpEl.value) || 0, loss = window.COOK_IMPROV.eatRawLoss;
        hpEl.value = Math.max(Math.min(1, cur), cur - loss);
        if (typeof window.alchToast === 'function') window.alchToast(`🥩 Сырое: <strong>${escHtml(item.name)}</strong> — −${cur - parseInt(hpEl.value)} хп`);
    }

    const dk = drinkStrength(item.name);
    if (dk) window.addDrink(dk, 1); // счётчик алкоголя за день (Сангвин) и «Хмель Сангвина», как у ручной кнопки
    removeFromInventoryByName(itemId, 1);
    daysWithoutFood = 0; // еда сбрасывает голод ВСЕГДА, даже алкоголь
    renderInventoryList();
    updateDateDisplay();
    updateAll();
    saveLocalStorage();
};

function updateHungerPenalty() {
    // Сейчас штраф применяется в updateCombat через starve. Оставим это там.
    // Здесь просто обновляем интерфейс.
    updateDateDisplay();
}    
    window.updateAttackActionInfo = function () {
        try { refreshEnhancedButtons(); } catch (e) { }
        try { gridAnnotateTargets(); } catch (e) { }
        const val = document.getElementById('attack-action-select').value;
        const infoEl = document.getElementById('attack-action-info');
        if (!infoEl) return;
        if (val === 'melee' || val === 'ranged') {
            infoEl.textContent = 'Считается по текущей экипировке (как в блоке «Расчёт боевой готовности» выше).';
        } else if (val && val.indexOf('spell:') === 0) {
            const spell = customSpells.find(s => s.id === val.slice(6));
            const dmg = spell ? parseSpellDamageFromDesc(liveSpellDesc(spell)) : null;
            infoEl.textContent = spell ? `Базовый урон из описания заклинания: ${dmg}. Бросок — 1d20 + модификатор характеристики школы.` : '';
        } else {
            infoEl.textContent = '';
        }
    };

    window.rollPlayerAttack = function () {
        if (isPowerFlagActive('mist')) { alert('В туманной форме нельзя ни наносить, ни получать урон — атаковать нельзя.'); return; }
        if (isPowerFlagActive('petrify')) { alert('Ты окаменел: этот круг нельзя ни атаковать, ни колдовать.'); return; }
        if (iAmPlayingBallad()) { alert('Ты играешь «Бардовскую балладу» и не можешь атаковать. Закончи песню во вкладке «Заклинания» → «Особые способности».'); return; }
        const targetId = document.getElementById('attack-target-select').value;
        let actionVal = document.getElementById('attack-action-select').value;
        // «Быстрая стрельба»: выстрел из лука доп. действием на треть урона.
        let quickShot = false;
        if (actionVal === 'quickshot') {
            if (!isPerkChecked('Быстрая стрельба') || (document.getElementById('wep-ranged-type') || {}).value !== 'bow') { alert('«Быстрая стрельба»: нужен перк и лук.'); return; }
            if (!bonusActionAllowed('быстрый выстрел')) return;
            quickShot = true; actionVal = 'ranged';
        }
        // Призванное существо бьёт само (раз в ход) и не тратит действие хозяина.
        const isSummonAct = (actionVal || '').indexOf('summon:') === 0;
        if (isSummonAct && inCombatNow() && combatMarks[actionVal] === turnKeyNow()) { alert('Это существо уже атаковало в этом ходу.'); return; }
        if (!isSummonAct && !quickShot && !combatActionAllowed('attack')) return;
        if (actionVal === 'ranged' && !rangedAmmoReady()) return;
        // Арбалет: «1 ход на КД» — после выстрела следующий только через ход (перезарядка).
        if (actionVal === 'ranged' && inCombatNow() && (document.getElementById('wep-ranged-type') || {}).value === 'crossbow') {
            const lastX = combatMarks.xbow;
            if (typeof lastX === 'number' && (gameTurn || 0) - lastX < 2) { alert('Арбалет перезаряжается — выстрелить можно через ход после прошлого выстрела.'); return; }
        }
        if (/^(spell|control|scroll|mstaff):/.test(actionVal || '')) { // посох-заклинатель тоже держат в руке
            const hb = castBlockReason(); if (hb) { alert(/^mstaff:/.test(actionVal) ? hb.replace('колдовать', 'пользоваться посохом') : hb); return; }
            const ec = document.getElementById('chk-enhanced-cast');
            if (/^(spell|control):/.test(actionVal) && ec && ec.checked) { const he = enhancedHandsReason(); if (he) { alert(he + ' Сними галочку «Усиленный каст» или освободи руки.'); return; } }
        }
        const resultBox = document.getElementById('attack-roll-result');
        const textEl = document.getElementById('attack-roll-text');
        if (!targetId) { alert('Выбери цель.'); return; }
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const target = session && (session.enemies || []).find(e => e.id === targetId);
        if (!target) { alert('Цель не найдена — обнови список.'); return; }
        // Боевая сетка: досягаемость и видимость проверяем ДО траты маны/стрел; штраф за дальность — к броску ниже.
        const gridChk = gridCheckFor(actionVal, targetId);
        if (gridChk && gridChk.onGrid && !gridChk.ok) { alert('Не достать «' + target.name + '»: ' + gridChk.reason + '.'); return; }

        let dmg = 0, mod = 0, actionLabel = '', skillNameForProgress = null, dmgType = 'physical';
        let aoeArea = null; // площадное заклинание: { radiusFt, center, spell }

        let adrenalineDmg = 0;
        let controlStatus = null; // {name, turns, desc} — для заклинаний Страх/Полиморф и т.п., см. ниже
        let lifestealPct = gb('physMagicVamp'); // Молаг Бал — универсальный вампиризм, добавляется всегда
        let penetrationPct = 0;
        let extraElem = null; // дополнительный стихийный удар «духа» на оружии
        let trueDmgNow = 0;   // урон «через сопротивление» от перков оружия (отдельным ударом без резиста)
        let onHit = null;     // эффекты луча при попадании (замедление / вытягивание маны)
        let spellPerkInfo = null, bashInfo = null, powerShotNow = false; // данные для перков после попадания
        let sneakNote = '';
        let healFlat = 0, devourSummonId = null; // «Жизнеотвод» / «Пожирающая сила» (атака существом)
        const shadowEff = (activeTimedEffects || []).find(x => x.shadowStrike && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity)); // «Шаг сквозь тень» / «Ночной клинок»


        if (actionVal === 'melee' || actionVal === 'ranged') {
            // Стрелы теперь реально расходуются — раньше выстрелы были бесконечными, слота
            // боеприпасов не существовало вообще.
            if (actionVal === 'ranged') {
                const ammoItem = playerInventory.find(i => i.itemId === equippedSlots.ammo);
                if (!ammoItem || ammoItem.count <= 0) {
                    alert('Нет заряженных боеприпасов — выбери стрелы/болты в разделе экипировки (вкладка Инвентарь).');
                    return;
                }
                removeFromInventoryByName(ammoItem.itemId, 1);
                renderAmmoSelect();
                renderInventoryList();
                // «Мощный выстрел»: каждый 3-й выстрел сбивает цель (−1 к её кубам на следующее действие).
                window.__rangedShots = (window.__rangedShots || 0) + 1;
                if ((window.perkBonuses || {}).powerShotEvery3 && window.__rangedShots % 3 === 0 && !(/дракон|великан|мамонт|центурион/i.test(String(target.name || '')) && !/жрец-дракон/i.test(String(target.name || '')))) powerShotNow = true; // кроме самых крупных
            }
            document.getElementById('active-combat-weapon').value = actionVal;
            updateCombat();
            const calc = window.lastWeaponCombatCalc || { totalDmg: 0, hitModifier: 0 };
            mod = calc.hitModifier;
            dmg = calc.totalDmg;
            // Скрытная атака (галочка «из тени» или заклинание «Шаг сквозь тень»/«Ночной клинок»): урон оружия × множитель скрытности.
            const uwSn = uniqueWeaponHitProps(playerInventory.find(i => i.itemId === (actionVal === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon)));
            const snMult = Math.max(calc.sneakMult || 1, uwSn.sneakX || 0); // Рубиновый Тронный Кинжал: по неожидающей цели ×4.5
            if ((document.getElementById('chk-sneak-attack').checked || shadowEff) && snMult > 1) {
                dmg = Math.round(calc.totalDmg * snMult);
                sneakNote = ` (🗡 скрытная атака ×${snMult})`;
            }
            if (shadowEff && shadowEff.shadowStrike.bonusDmg) { dmg += shadowEff.shadowStrike.bonusDmg; sneakNote += ` (🌑 +${shadowEff.shadowStrike.bonusDmg} урона от «${shadowEff.effectName}»)`; }
            // Урон экипированных стрел (если у конкретной стрелы прописан свой урон) прибавляется
            // поверх урона лука — раньше вообще не учитывался.
            // (урон надетой стрелы уже внутри расчёта оружия — ammoDmg; второй раз не прибавляем)
            lifestealPct += gb('weaponVamp');
            penetrationPct = gb('armorPenetration') + (actionVal === 'melee' ? gb('meleeArmorPenetration') : 0); // Мара — только ближний бой
            { const gP = getGearTextBonuses(); penetrationPct += gP.pen + (actionVal === 'ranged' ? gP.penRanged : 0); } // пробитие от снаряжения (наручи, перчатки)
            // Игнор брони перков (Костолом/Крушитель черепов/Отшельник): доля физического резиста цели.
            // Раньше «Отшельник» прибавлялся к любому двуручному, а Костолом и Крушитель были только подсказкой.
            if (calc.armorIgnore) {
                const physR = (target.resist && parseInt(target.resist.physical)) || 0;
                const ign = Math.round(physR * calc.armorIgnore);
                if (ign) { penetrationPct += ign; }
            }
            trueDmgNow = calc.trueDmg || 0;
            if (lichAuraId() === 'rage') penetrationPct += 5; // «Багровая ярость»: +5% игнорирования брони
            actionLabel = (actionVal === 'melee' ? 'ближним оружием' : 'дальним оружием') + sneakNote;
            const spiritE = getActiveWeaponSpirit(actionVal);
            if (spiritE) {
                const w = spiritE.weaponSpirit;
                const boostD = getSkillBoostPercent('Разрушение') + ((typeof getActivePercentBonuses === 'function') ? getActivePercentBonuses().spellPower : 0);
                const sd = window.StBonuses.weaponSpiritDamage(w.dmg, boostD, 0); // TASK-001: формула духа — в combat-bonuses.js
                // Дух лежит на обоих одноручных оружиях, если при касте были «двойные» руки и сейчас они всё ещё в деле
                const offNow = (document.getElementById('wep-melee-offhand-name') || {}).value || '';
                const bothHands = actionVal === 'melee' && !!w.offName && document.getElementById('chk-dual-wield').checked && (offNow || '(второе оружие)') === w.offName;
                const cnt = bothHands ? 2 : 1;
                extraElem = { name: spiritE.effectName, type: w.type, dmg: sd, count: cnt, mpDrain: w.mpDrain || 0, slow: w.slow || 0, ignite: !!w.ignite, icon: w.icon,
                    logText: `${w.icon} «${spiritE.effectName}» (оружие): урон ${sd}` };
            }
            // Выброс адреналина (редгард): к броску атаки И к урону добавляется d10 (только оружие, не заклинания).
            if (isPowerFlagActive('adrenaline')) { adrenalineDmg = rollNd(1, 10).sum; dmg += adrenalineDmg; }
            skillNameForProgress = actionVal === 'melee'
                ? (/^twohand/.test(calc.wepType || '') ? 'Двуручное оружие' : 'Одноручное оружие')
                : 'Стрельба';
        } else if (actionVal === 'bash_basic') {
            const shArm0 = parseInt((document.getElementById('slot-shield-armor') || {}).value) || 0;
            if (shArm0 <= 0) { alert('Удар щитом: нужен щит в левой руке.'); return; }
            dmg = shieldBashBasicDmg(shArm0);
            const strB0 = document.getElementById('stat-str');
            mod = calcAbilityMod(strB0 ? (parseInt(strB0.value) || 10) : 10);
            dmgType = 'physical';
            bashInfo = { basic: true };
            actionLabel = `ударом щита (урон = ½ брони щита ${shArm0})`;
            skillNameForProgress = 'Блокирование';
        } else if (actionVal === 'bash') {
            const pbB = window.perkBonuses || {};
            const shArm = parseInt((document.getElementById('slot-shield-armor') || {}).value) || 0;
            if (!pbB.shieldBash || shArm <= 0) { alert('Силовой удар плашмя: нужен перк и щит в левой руке.'); return; }
            dmg = shArm * (pbB.shieldBashX5 ? 5 : 1);
            const strB = document.getElementById('stat-str');
            mod = calcAbilityMod(strB ? (parseInt(strB.value) || 10) : 10);
            dmgType = 'physical';
            bashInfo = { disarm: !!pbB.shieldBashDisarm };
            actionLabel = `силовым ударом щита (урон = броня щита ${shArm}${pbB.shieldBashX5 ? ' ×5 «Смертельный удар плашмя»' : ''})`;
            skillNameForProgress = 'Блокирование';
        } else if (actionVal === 'argbite') {
            // Расовая черта: удар без оружия зубами — 1к6 + модификатор Силы, колющий (физический) урон.
            const strA = document.getElementById('stat-str');
            mod = calcAbilityMod(strA ? (parseInt(strA.value) || 10) : 10);
            const d6 = Math.floor(Math.random() * 6) + 1;
            dmg = Math.max(1, d6 + mod);
            dmgType = 'physical';
            actionLabel = `укусом аргонианина (🎲 1к6: ${d6} ${mod >= 0 ? '+' : '−'} ${Math.abs(mod)})`;
        } else if (actionVal === 'bite') {
            dmg = lordBiteDamage();
            const strInputB = document.getElementById('stat-str');
            mod = calcAbilityMod(strInputB ? (parseInt(strInputB.value) || 10) : 10);
            dmgType = 'physical';
            lifestealPct += gb('weaponVamp');
            penetrationPct = gb('armorPenetration');
            actionLabel = 'укусом вампира-лорда';
        } else if (actionVal === 'claw') {
            dmg = getWerewolfClawDamage();
            const strInput = document.getElementById('stat-str');
            const rawStr = strInput ? (parseInt(strInput.value) || 10) : 10;
            mod = calcAbilityMod(rawStr);
            dmgType = 'physical';
            lifestealPct += gb('weaponVamp');
            penetrationPct = gb('armorPenetration');
            actionLabel = 'когтями зверя';
        } else if (actionVal.indexOf('spell:') === 0) {
            const spell = customSpells.find(s => s.id === actionVal.slice(6));
            if (!spell) { alert('Заклинание не найдено.'); return; }
            const enhancedCast = document.getElementById('chk-enhanced-cast').checked && !enhancedBlockReason(spell.school, liveSpellDesc(spell), spell.name);
            { const ar = window.GridCore ? window.GridCore.spellArea(splitSpellDescByEnhancement(liveSpellDesc(spell))[enhancedCast ? 'enhanced' : 'base'] || liveSpellDesc(spell), spell.name) : null; if (ar) aoeArea = Object.assign({ spell: spell.name }, ar);
              // «Новы» вокруг заклинателя (center: self): и основная цель должна быть в радиусе, иначе её не задеть
              if (ar && ar.center === 'self' && typeof sessGrid === 'function') {
                  const grid = sessGrid(), G = window.GridCore;
                  const myT = grid ? G.tokenOf(grid, 'p', myUidG()) : null, tgT = grid ? G.tokenOf(grid, 'e', targetId) : null;
                  if (myT && tgT) { const dist = G.feet(myT, tgT); if (dist > ar.radiusFt) { alert(`«${spell.name}» бьёт вокруг тебя на ${ar.radiusFt} фт, а «${target.name}» в ${dist} фт — не достанет. Мана не потрачена.`); return; } }
              } }
            // Солнечная магия («наносит урон нежити») по живым не действует — проверяем до траты маны.
            let maraLivingPct = 0; // Мара 2–3: атакующие заклинания Восстановления ранят и живых (25/50% урона)
            if (/урон[а-яё]*\s+нежит|нежит[а-яё]*\s+\d+\s*урон|ищ[а-яё]+\s+нежит/i.test(liveSpellDesc(spell)) && !(isUndeadTargetForSpell(target))
                && SCHOOL_CODE_TO_SKILL[spell.school] === 'Восстановление' && gb('restorationLivingDmg') && getEnemyMeta(target).kind !== 'automaton') maraLivingPct = gb('restorationLivingDmg');
            else if (/урон[а-яё]*\s+нежит|нежит[а-яё]*\s+\d+\s*урон|ищ[а-яё]+\s+нежит/i.test(liveSpellDesc(spell)) && !(isUndeadTargetForSpell(target))) {
                alert(`«${spell.name}» ранит только нежить, а «${target.name}» — не нежить. Мана не потрачена.`); return;
            }
            let baseDmg = parseSpellDamageFromDesc(liveSpellDesc(spell), enhancedCast) || 0; // урон — из актуального описания, как и кубики
            let rangeNote = '';
            const diceS = getSpellDice(liveSpellDesc(spell), enhancedCast);
            if (diceS) { const rdS = rollNd(diceS.n, diceS.sides); baseDmg = rdS.sum; rangeNote = ` (🎲 ${diceS.n}д${diceS.sides}: ${rdS.rolls.join('+')} = ${rdS.sum})`; }
            if (spell.name === 'Болид') {
                const bl = askBolideDistance(liveSpellDesc(spell), enhancedCast);
                if (!bl) return; // отмена / слишком далеко — мана не тратится
                baseDmg = bl.dmg;
                rangeNote = ` (📏 ${bl.dist} фт до цели: ${bl.base} + ${Math.floor(bl.dist / bl.step)}×${bl.bonus} = ${bl.dmg})`;
            }
            // Стоимость каста — та же цепочка скидок, что и на карточке заклинания в книге
            // (броня/школа-перк/навык-от-снаряжения/актив.баффы/бог), просто читаем уже готовое
            // посчитанное значение из самой карточки, х2 при усиленном касте. Раньше атака
            // заклинанием вообще не тратила ману — это было первым проблемным местом.
            const costInput = document.querySelector(`#card-${spell.id} .spell-final-cost`);
            const baseCost = costInput ? ((enhancedCast && costInput.dataset.freeReason) ? (parseInt(costInput.dataset.paidCost) || 0) : (parseInt(costInput.value) || 0)) : (spell.baseCost || 0);
            const finalCost = enhancedCast ? Math.round(baseCost * getEnhancedCostFactor(spell.school, spell.name)) : baseCost;
            const curMpEl = document.getElementById('cur-mp');
            const curMp = parseInt(curMpEl.value) || 0;
            if (finalCost > curMp) { alert(`Не хватает маны: нужно ${finalCost}, есть ${curMp}.`); return; }
            if (!enhancedCast) consumeMageSignFreeCast(costInput);
            curMpEl.value = curMp - finalCost;
            updateVitalBars();
            saveLocalStorage();
            let lichHalf2 = null;
            const lichDual = window.LICH_DUAL && window.LICH_DUAL[spell.name];
            if (lichDual) { // заклинание лича: две половины урона (огонь + холод), у каждой своя стихия и свой перк стихии
                const segL = splitSpellDescByEnhancement(liveSpellDesc(spell))[enhancedCast ? 'enhanced' : 'base'] || liveSpellDesc(spell);
                const h1 = parseInt((segL.match(/(\d+)\s*урона\s+огн/i) || [])[1]) || baseDmg, h2 = parseInt((segL.match(/(\d+)\s*урона\s+холод/i) || [])[1]) || h1;
                baseDmg = h1;
                lichHalf2 = computeSpellDamage(spell.name, spell.school, h2, lichDual[1]);
            }
            const cd = computeSpellDamage(spell.name, spell.school, baseDmg, lichDual ? lichDual[0] : undefined);
            const spellPowerPct = cd.spellPowerPct;
            dmg = cd.dmg;
            dmgType = cd.dmgType;
            if (lichHalf2) extraElem = { name: spell.name + ' (холод)', type: lichDual[1], dmg: lichHalf2.dmg, count: 1, icon: '❄️', logText: `❄️ «${spell.name}» (холод): урон ${lichHalf2.dmg}` };
            if (spell.school !== 'illus' && lichMaskKind() === 'illusion') { activeTimedEffects = activeTimedEffects.filter(e => !(e && e.lichMask === 'illusion')); renderActiveEffects(); alertSafe('🎭 Иллюзорная маска спала: ты колдуешь заклинание другой школы.'); }
            spellPerkInfo = { school: spell.school, dmgType: cd.dmgType, dual: !!enhancedCast };
            // «Некромаг»: ВСЕ заклинания вдвое эффективнее против нежити (раньше — только Восстановление).
            if ((window.perkBonuses || {}).necromage && getEnemyMeta(target).kind === 'undead') { dmg *= 2; rangeNote += ' (☠ «Некромаг»: ×2 против нежити)'; }
            if (cd.elemPerkPct) rangeNote += ` (🔥 перк стихии +${cd.elemPerkPct}%)`;
            { // «Скелеты получают двойной урон» (Импульс, Телекинетический столп), «Механизмы получают половину урона» (Увядание)
              const dsc = liveSpellDesc(spell);
              if (/скелет[а-яё]*\s+получа[а-яё]*\s+двойн/i.test(dsc) && /скелет/i.test(target.name || '')) { dmg *= 2; rangeNote += ' (💀 скелет: ×2)'; }
              if (/механизм[а-яё]*\s+получа[а-яё]*\s+половин/i.test(dsc) && getEnemyMeta(target).kind === 'automaton') { dmg = Math.round(dmg / 2); rangeNote += ' (⚙ механизм: ½ урона)'; } }
            if (maraLivingPct) { dmg = Math.round(dmg * maraLivingPct / 100); rangeNote += ` (Мара: по живым ${maraLivingPct}% урона)`; }
            const skillName = cd.skillName;
            const statKey = skillName ? SKILL_TO_STAT[skillName] : null;
            const statInput = statKey ? document.getElementById('stat-' + statKey) : null;
            const rawStat = statInput ? (parseInt(statInput.value) || 10) : 10;
            mod = calcAbilityMod(rawStat) + (['Разрушение', 'Колдовство'].includes(skillName) ? gb('spellHitBonus') : 0); // Джулианос: только Разрушение и Колдовство
            // Бонусы бога, усиление навыка, Шеогорат и огненный бонус ранга — всё внутри computeSpellDamage().
            const godSpellPct = cd.godSpellPct;
            const schoolBoostPct = cd.schoolBoostPct;
            { // Холод: «подмороженные на 5 футов медленнее», «замедляя на 10 футов» — замедление; «замораживает на N ход» — заморозка.
              const segF = splitSpellDescByEnhancement(liveSpellDesc(spell))[enhancedCast ? 'enhanced' : 'base'] || liveSpellDesc(spell);
              const slM = segF.match(/на\s+(\d+)\s*фут[а-яё]*\s+медлен/i) || segF.match(/замедля[а-яё]*\s+на\s+(\d+)\s*фут/i);
              const frM = segF.match(/заморажива[а-яё]*(?:\s+[а-яё]+)?\s+на\s+(\d+)\s*ход/i);
              if (slM) onHit = Object.assign(onHit || { name: spell.name }, { slow: parseInt(slM[1]) });
              if (frM) onHit = Object.assign(onHit || { name: spell.name }, { freeze: parseInt(frM[1]) }); }
            { const mpD = parseSpellMpDamage(splitSpellDescByEnhancement(liveSpellDesc(spell))[enhancedCast ? 'enhanced' : 'base'] || liveSpellDesc(spell), dmg);
              if (mpD > 0) onHit = Object.assign(onHit || { name: spell.name }, { mpDrain: mpD }); }
            { const gspA = getGearSpecialBonuses(); // Роба разрушения: «+20% урона по мане», «−5 к скорости при замедлении»
              if (onHit && onHit.mpDrain && gspA.mpDmgPct) onHit.mpDrain = Math.round(onHit.mpDrain * (1 + gspA.mpDmgPct / 100));
              if (onHit && onHit.slow && gspA.slowExtraFt) onHit.slow += gspA.slowExtraFt; }
            if (spell.name === 'Увядание') { const wa = parseInt(((splitSpellDescByEnhancement(liveSpellDesc(spell))[enhancedCast ? 'enhanced' : 'base'] || '').match(/Разрушает\s+(\d+)\s+брони/i) || [])[1]) || 50;
              onHit = Object.assign(onHit || { name: spell.name }, { armorBreak: wa }); }
            lifestealPct += gb('spellVampire');
            actionLabel = `заклинанием «${spell.name}»${enhancedCast ? ' (усиленно)' : ''} (−${finalCost} маны)${spellPowerPct ? ` (+${spellPowerPct}% от актив. баффа)` : ''}${godSpellPct ? ` (+${godSpellPct}% от бога)` : ''}${cd.gearElemPct ? ` (+${cd.gearElemPct}% от маски)` : ''}${schoolBoostPct ? ` (+${schoolBoostPct}% усиление навыка)` : ''}${(typeof sheogorathRoll !== 'undefined' && sheogorathRoll.dmgMult !== 1) ? ` (Шеогорат ×${sheogorathRoll.dmgMult})` : ''}${rangeNote}${fireNote(cd.fire)}${onHit && onHit.slow ? ` (замедление −${onHit.slow} фт)` : ''}${onHit && onHit.freeze ? ` (заморозка на ${onHit.freeze} х.)` : ''}${onHit && onHit.mpDrain ? ` (+${onHit.mpDrain} урона по мане цели)` : ''}${onHit && onHit.armorBreak ? ` (броня цели −${onHit.armorBreak})` : ''}`;
            skillNameForProgress = skillName;
        } else if (actionVal.indexOf('scroll:') === 0) {
            const itemId = actionVal.slice(7);
            const item = playerInventory.find(i => i.itemId === itemId);
            if (!item || item.count <= 0) { alert('Свиток не найден.'); return; }
            dmg = parseSpellDamageFromDesc(item.effect || '') || 0;
            dmgType = detectDmgTypeFromName(item.scrollSpellName || item.name);
            const scrollSpName = item.scrollSpellName || String(item.name || '').replace(/^Свиток:\s*/, '');
            let scrollNote = '';
            if (/урон[а-яё]*\s+нежит|ищ[а-яё]+\s+нежит/i.test(findSpellDescByName(scrollSpName) || item.effect || '') && !isUndeadTargetForSpell(target)) {
                alert(`«${scrollSpName}» ранит только нежить, а «${target.name}» — не нежить. Свиток не потрачен.`); return;
            }
            if (scrollSpName === 'Болид') {
                const blS = askBolideDistance(findSpellDescByName('Болид') || item.effect || '', false);
                if (!blS) return; // отмена — свиток не тратится
                dmg = blS.dmg;
                scrollNote = ` (📏 ${blS.dist} фт до цели → ${blS.dmg})`;
            }
            { const fireSc = fireRankDice(scrollSpName, findSpellSchoolByName(scrollSpName), dmgType); if (fireSc) { dmg += fireSc.sum; scrollNote += fireNote(fireSc); } }
            mod = 0; // свиток срабатывает одинаково у кого угодно, без бонуса от навыка/статы
            actionLabel = `свитком «${item.name}»${scrollNote}`;
            removeFromInventoryByName(itemId, 1);
            renderInventoryList();
            renderAttackActionSelect();
        } else if (actionVal.indexOf('mstaff:') === 0) {
            const item = playerInventory.find(i => i.itemId === actionVal.slice(7));
            if (!item || !item.isMagicStaff || item.usesLeft <= 0) { alert('Посох не найден или разряжен.'); return; }
            const stSp = item.spellName || String(item.name || '').replace(/^Посох-заклинатель:\s*/, '');
            if (/урон[а-яё]*\s+нежит|ищ[а-яё]+\s+нежит/i.test(findSpellDescByName(stSp) || item.effect || '') && !isUndeadTargetForSpell(target)) {
                alert(`«${stSp}» ранит только нежить, а «${target.name}» — не нежить. Заряд не потрачен.`); return;
            }
            dmg = parseSpellDamageFromDesc(item.effect || '') || 0;
            dmgType = detectDmgTypeFromName(stSp);
            mod = 0; // посох срабатывает без бонуса навыка, как свиток
            item.usesLeft -= 1;
            actionLabel = `посохом «${item.name}» (осталось зарядов ${item.usesLeft}/${item.maxUses})`;
            renderMagicStaffList(); renderAttackActionSelect(); saveLocalStorage();
        } else if (actionVal.indexOf('summon:') === 0) {
            const summon = activeSummons.find(s => s.id === actionVal.slice(7));
            if (!summon) { alert('Существо не найдено.'); return; }
            dmg = summon.dmg || 0;
            { const au = getSummonAuras(); if (summon.category !== 'weapon') { if (au.dmgPct) dmg += Math.round((summon.dmg || 0) * au.dmgPct / 100); if (au.dmg) dmg += au.dmg; } }
            dmgType = detectDmgTypeFromName(summon.dmgType || summon.name);
            mod = 0; // у существ нет характеристик игрока — бьют "как есть"
            actionLabel = `существом «${summon.name}»`;
            if (summon.category !== 'weapon') {
                if (summon.devour && dmg) { const exD = Math.round(dmg * 1.5); dmg += exD; actionLabel += ` (💀 Пожирающая сила +${exD})`; devourSummonId = summon.id; }
                const ldE = (activeTimedEffects || []).find(x => x.lifeDivert && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
                if (ldE) { dmg += ldE.lifeDivert; healFlat = ldE.lifeDivert; actionLabel += ` (🩸 Жизнеотвод +${ldE.lifeDivert})`; }
            }
        } else if (actionVal.indexOf('control:') === 0) {
            const spell = customSpells.find(s => s.id === actionVal.slice(8));
            const ctrl = spell ? PLAYER_CONTROL_SPELLS[spell.name] : null;
            if (!spell || !ctrl) { alert('Заклинание не найдено.'); return; }
            const costInput = document.querySelector(`#card-${spell.id} .spell-final-cost`);
            const enhCtl = !!(document.getElementById('chk-enhanced-cast') && document.getElementById('chk-enhanced-cast').checked && !enhancedBlockReason(spell.school, liveSpellDesc(spell), spell.name));
            const ctrlUse0 = (enhCtl && ctrl.enh) ? Object.assign({}, ctrl, ctrl.enh) : Object.assign({}, ctrl);
            // Проверка уровня и типа цели («до N уровня», «только нежить», «только даэдра») — до траты маны.
            const chk = checkControlTarget(spell, target, enhCtl);
            if (chk.kindFail || (chk.levelFail && !ctrl.banish)) { alert(`«${spell.name}» не подействует: ${chk.reason}. Мана не потрачена.`); return; }
            if (ctrl.command && !chk.meta.summoned) { alert(`«${spell.name}» берёт под контроль только ЧУЖИХ ПРИЗВАННЫХ даэдра, а «${target.name}» не призван(а). Мана не потрачена.`); return; }
            let ctrlUse = ctrlUse0;
            if (chk.maxLevel !== null || ctrl.parseTurns) {
                const lvP = parseControlTextParams(liveSpellDesc(spell), enhCtl);
                ctrlUse = Object.assign({}, ctrlUse0);
                if (lvP.maxLevel !== null) ctrlUse.desc = ctrlUse0.desc.replace(/до \d+ ур\./, 'до ' + lvP.maxLevel + ' ур.');
                if (lvP.turns && ctrlUse.turns) ctrlUse.turns = lvP.turns;
            }
            const ctlBaseTurns = (parseControlTextParams(liveSpellDesc(spell), false) || {}).turns || 0;
            if (spell.school === 'illus' && enhCtl && (window.perkBonuses || {}).dualIllus && ctrlUse.turns && !(ctlBaseTurns && ctrlUse.turns > ctlBaseTurns)) { // «Двойная иллюзия»: ×2, если в усиленном описании нет своей длительности
                ctrlUse = Object.assign({}, ctrlUse, { turns: ctrlUse.turns * 2 });
            }
            const baseCostCtl = costInput ? ((enhCtl && costInput.dataset.freeReason) ? (parseInt(costInput.dataset.paidCost) || 0) : (parseInt(costInput.value) || 0)) : (spell.baseCost || 0);
            const finalCost = enhCtl ? Math.round(baseCostCtl * getEnhancedCostFactor(spell.school, spell.name)) : baseCostCtl;
            const curMpEl = document.getElementById('cur-mp');
            const curMp = parseInt(curMpEl.value) || 0;
            if (finalCost > curMp) { alert(`Не хватает маны: нужно ${finalCost}, есть ${curMp}.`); return; }
            if (!enhCtl) consumeMageSignFreeCast(costInput);
            curMpEl.value = curMp - finalCost;
            updateVitalBars();
            saveLocalStorage();
            const statKey = SKILL_TO_STAT[SCHOOL_CODE_TO_SKILL[spell.school]] || 'int';
            const statInput = document.getElementById('stat-' + statKey);
            const rawStat = statInput ? (parseInt(statInput.value) || 10) : 10;
            mod = calcAbilityMod(rawStat) + (['Разрушение', 'Колдовство'].includes(SCHOOL_CODE_TO_SKILL[spell.school]) ? gb('spellHitBonus') : 0);
            dmg = 0; // управляющие заклинания не наносят урон — только статус при попадании
            controlStatus = scaleControlForBoost(spell, ctrlUse);
            if (chk.maxLevel !== null) controlStatus.desc = controlStatus.desc.replace(/до \d+ ур\./, 'до ' + chk.maxLevel + ' ур.') + (chk.bonusNote ? ' · ' + chk.bonusNote : '');
            if (ctrl.banish) {
                // Изгнание срабатывает на ПРИЗВАННОГО даэдра не выше предела; иначе — урон и потеря равновесия.
                if (!chk.levelFail && chk.meta.summoned) controlStatus = { status: 'Изгнан', turns: null, desc: 'Изгнан в Обливион', banish: true };
                else controlStatus = { status: 'Потеря равновесия', turns: 1, damage: 20, damageType: 'magic', desc: 'Не изгнан (' + (chk.levelFail ? 'уровень выше предела' : 'цель не призвана') + '): получает 20 урона и теряет равновесие (−2 к кубам на следующее действие)' };
            }
            actionLabel = `заклинанием «${spell.name}»${enhCtl ? ' (усиленно)' : ''} (−${finalCost} маны, ${controlStatus.desc})${chk.notes.length ? ' ⚠ ' + chk.notes.join('; ') : ''}`;
            skillNameForProgress = SCHOOL_CODE_TO_SKILL[spell.school] || null;
        } else {
            alert('Выбери способ атаки.');
            return;
        }
        // Бонусы богов к атаке (по таблице богов: плоские прибавки, условия по цели).
        const isWeaponAtk = actionVal === 'melee' || actionVal === 'ranged';
        const isPowerAtkNow = isWeaponAtk && document.getElementById('chk-power-attack').checked;
        const tgtMeta = getEnemyMeta(target);
        const tgtSt = Array.isArray(target.statusEffects) ? target.statusEffects : [];
        const tgtPoisoned = tgtSt.some(x => /^яд/i.test(String(x.source || '')) || /яд|отравл/i.test(String(x.name || '')));
        const godExtra = []; // доп. удары своей стихией после основного: {type, dmg, label, pen, heal}
        if (dmg && (actionVal === 'melee' || actionVal === 'ranged')) actionLabel += lichBladeExtras(godExtra); // «Клинок морозного огня»
        let uniqueKillMp = 0; // «убийство +N маны» (Рубиновый Тронный Кинжал)
        if (dmg && isWeaponAtk) {
            if (gb('fireWeaponDmg')) godExtra.push({ type: 'fire', dmg: gb('fireWeaponDmg'), label: '🔥 Мерунес Дагон: огонь' });
            if (gb('poisonFlatDmg')) godExtra.push({ type: 'poison', dmg: gb('poisonFlatDmg'), label: '☠ Намира: яд' });
            if (gb('pureDmg')) godExtra.push({ type: 'physical', dmg: gb('pureDmg'), pen: 100, label: '🩸 Намира: чистый урон' });
            if (tgtPoisoned && gb('poisonLifeSteal')) godExtra.push({ type: 'physical', dmg: gb('poisonLifeSteal'), pen: 100, heal: true, label: '🕷 Мефала: поглощение (цель отравлена)' });
            { // уникальное оружие: поглощение здоровья и доп. стихийный урон из описания
                const uwI = playerInventory.find(i => i.itemId === (actionVal === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon));
                const uw = uniqueWeaponHitProps(uwI);
                const uwN = uwI ? uwI.name : 'оружие';
                uw.elem.forEach(e => godExtra.push({ type: e.type, dmg: e.dmg, label: `${e.label.split(' ')[0]} «${uwN}»: ${e.label.split(' ')[1]}` }));
                if (uw.hpSteal) godExtra.push({ type: 'magic', dmg: uw.hpSteal, heal: true, label: `🩸 «${uwN}»: поглощение здоровья` });
                if (uw.mpSteal) onHit = Object.assign({ name: uwN }, onHit || {}, { mpDrain: ((onHit && onHit.mpDrain) || 0) + uw.mpSteal, mpGain: uw.mpSteal });
                if (uw.killMp) uniqueKillMp = uw.killMp;
            }
            if (tgtPoisoned && gb('poisonVulnerability')) { const add = Math.round(dmg * gb('poisonVulnerability') / 100); if (add) { dmg += add; actionLabel += ` (🕷 Мефала: отравленная цель +${add})`; } }
        }
        if (dmg && gb('elementalExtraDmg') && (isWeaponAtk || actionVal.indexOf('spell:') === 0 || actionVal.indexOf('scroll:') === 0)) { // Акатош 3
            const stTxt = tgtSt.map(x => String(x.name || '') + ' ' + String(x.desc || '')).join(' | ').toLowerCase();
            const elT = /горени|горит|подожж/.test(stTxt) ? 'fire' : /заморож|обморож|оледен/.test(stTxt) ? 'frost' : /электриз|под током|шок/.test(stTxt) ? 'shock' : null;
            if (elT) godExtra.push({ type: elT, dmg: gb('elementalExtraDmg'), label: '☀ Акатош: стихия по ' + ({ fire: 'горящей', frost: 'замёрзшей', shock: 'электризованной' })[elT] + ' цели' });
        }

        // Урон по нежити/даэдра (Стендарр/Меридия): тип цели — getEnemyMeta (база врагов, затем имя),
        // так вампиры и гончие смерти тоже считаются нежитью.
        const isUndeadTarget = tgtMeta.kind === 'undead';
        const isDaedraTarget = tgtMeta.kind === 'daedra';
        if (dmg && (actionVal === 'melee' || actionVal === 'ranged')) { // чары «Урон по нежити» (награда Соратников)
            const wIdU = actionVal === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon;
            const wItU = wIdU ? playerInventory.find(i => i.itemId === wIdU) : null;
            if (weaponEnchantLive(wItU) && wItU.enchantment.name === 'Урон по нежити' && typeof wItU.enchantment.value === 'number' && isUndeadTarget) {
                dmg += wItU.enchantment.value; actionLabel += ` (💀 +${wItU.enchantment.value} по нежити)`;
            }
            // «Изгнание в Обливион» (Колдовство): призванное оружие изгоняет призванных даэдра и обращает поднятую нежить в бегство.
            const wNameO = String((document.getElementById(actionVal === 'ranged' ? 'wep-ranged-name' : 'wep-melee-name') || {}).value || '').toLowerCase();
            if (wNameO.indexOf('призван') === 0 && isPerkChecked('Изгнание в Обливион')) {
                const mO = getEnemyMeta(target);
                if (mO.summoned && (mO.kind === 'daedra' || mO.kind === 'undead')) {
                    onHit = Object.assign({}, onHit || {}, { name: onHit && onHit.name ? onHit.name : 'Изгнание в Обливион', oblivion: mO.kind === 'daedra' ? 'banish' : 'flee' });
                    actionLabel += mO.kind === 'daedra' ? ' (🌀 «Изгнание в Обливион»: при попадании даэдра изгоняется)' : ' (🌀 «Изгнание в Обливион»: при попадании нежить бежит)';
                }
            }
            const holyE = (activeTimedEffects || []).find(e => e.holyWeapon && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity));
            if (holyE && isUndeadTarget) { dmg += holyE.holyWeapon; actionLabel += ` (☀ «Священное оружие» +${holyE.holyWeapon} по нежити)`; }
        }
        if (dmg && isUndeadTarget && gb('undeadDmg')) { const pU = Math.round(dmg * gb('undeadDmg') / 100); dmg += pU; actionLabel += ` (Меридия: по нежити +${pU})`; }
        if (dmg && isWeaponAtk && (isUndeadTarget || isDaedraTarget) && gb('daedraUndeadDmg')) { // Стендарр: плоско, силовой — вдвое
            const sU = gb('daedraUndeadDmg') * (isPowerAtkNow ? 2 : 1);
            godExtra.push({ type: 'physical', dmg: sU, pen: 100, label: '⚔ Стендарр: чистый урон по ' + (isUndeadTarget ? 'нежити' : 'даэдра') });
        }
        if (dmg && gb('undeadAuraBonus') && (isWeaponAtk || actionVal.indexOf('spell:') === 0)) { // Меридия 3: +5% за каждую нежить в 50 фт
            let nU = 0;
            const grid = (typeof sessGrid === 'function') ? sessGrid() : null, G = window.GridCore;
            const myT = (grid && G) ? G.tokenOf(grid, 'p', myUidG()) : null;
            const sdU = (window.CloudSync && window.CloudSync.getSessionData) ? window.CloudSync.getSessionData() : null;
            const ens = ((sdU && sdU.enemies) || []).filter(e => (e.curHp === undefined || e.curHp > 0) && getEnemyMeta(e).kind === 'undead');
            if (myT) nU = ens.filter(e => { const t = G.tokenOf(grid, 'e', e.id); return t && G.feet(myT, t) <= 50; }).length;
            else nU = ens.length;
            if (nU) { const aU = Math.round(dmg * gb('undeadAuraBonus') * nU / 100); dmg += aU; actionLabel += ` (Меридия: ${nU} нежити рядом, +${aU})`; }
        }
        if (gridChk && gridChk.onGrid) { if (gridChk.penalty) { mod += gridChk.penalty; actionLabel += ` (дальность ${gridChk.feet} фт: ${gridChk.penalty})`; } else actionLabel += ` (${gridChk.feet} фт)`; }
        if (actionVal === 'ranged') { const wr = weatherMods().ranged; if (wr) { mod += wr; actionLabel += ` (погода ${wr})`; } }
        if ((window.perkBonuses || {}).counterAttackBonus && actionVal === 'melee' && counterHits[targetId] >= 2) {
            const cb = Math.floor(counterHits[targetId] / 2); mod += cb; actionLabel += ` (🛡 Контрудар +${cb}: по тебе попали ${counterHits[targetId]} р.)`;
        }
        if (actionVal === 'ranged' && document.getElementById('chk-bow-drawn').checked && (document.getElementById('wep-ranged-type') || {}).value === 'bow') { mod += 1; actionLabel += ' (🏹 натянутая тетива +1)'; }
        if (actionVal === 'melee' || actionVal === 'ranged') { const gta = getGearTextBonuses().atk; if (gta) { mod += gta; actionLabel += ` (экипировка +${gta} к кубам атаки)`; } }
        { const dsm = skillNameForProgress ? diseaseSkillMod(canonSkillKey(skillNameForProgress)) : 0; if (dsm) { mod += dsm; actionLabel += ` (🦠 болезнь ${dsm > 0 ? '+' : ''}${dsm})`; } }
        { const atkPen = getActiveRollPenalty(true); if (atkPen) { mod += atkPen; actionLabel += ` (${atkPen} ошеломление/ослабление)`; } }
        { const modeNow = actionVal === 'ranged' ? 'ranged' : (/^(spell|scroll|mstaff):/.test(actionVal) ? 'spell' : actionVal);
          const mp = (activeTimedEffects || []).filter(e => e && e.atkModePenalty && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && e.atkModePenalty.modes.indexOf(modeNow) !== -1);
          mp.forEach(e => { mod += e.atkModePenalty.value; actionLabel += ` (${e.atkModePenalty.value} «${e.effectName}»)`; }); }
        // Голод для оружия уже в модификаторе атаки (combat-bonuses.js); существа хозяйский голод не чувствуют.
        if (!/^(melee|ranged|quickshot)$/.test(actionVal || '') && (actionVal || '').indexOf('summon:') !== 0) { const hgP = hungerRollPenalty(); if (hgP) { mod += hgP; actionLabel += ` (${hgP} голод)`; } }
        { const sb = getSessionRollBonus(true); if (sb.value) { mod += sb.value; actionLabel += ` (${sb.notes.join(', ')})`; } }
        if (snLordForm() && playerSupernaturalState.vampire.reflexLeft > 0) {
            mod += 4; playerSupernaturalState.vampire.reflexLeft -= 1; actionLabel += ` (🦇 рефлексы +4, осталось ${playerSupernaturalState.vampire.reflexLeft})`;
            saveSupernaturalStatePlayer(); renderPowersPanel();
        }
        // Опозный бросок: игрок 1к20+модификатор против мастера "голым" 1к20 (без модификаторов).
        // Ничья = перекид обеих костей (не провал и не успех — просто бросаем заново),
        // и такой перекинутый результат не идёт в прокачку навыка.
        let playerRoll, playerTotal, gmRoll, rerolls = 0;
        const stFl = (window.StCombat && window.StCombat.statusFlags) ? window.StCombat.statusFlags(target) : {};
        // Берсерк (орк): преимущество на атаку в каждый второй ход. Выброс адреналина (редгард): +d10 к броску.
        const berserkAdv = (actionVal === 'melee' || actionVal === 'ranged') && isBerserkAdvantageNow();
        const adrenalineOn = (actionVal === 'melee' || actionVal === 'ranged') && isPowerFlagActive('adrenaline');
        let adrenalineAtk = 0;
        do {
            playerRoll = Math.floor(Math.random() * 20) + 1;
            if (berserkAdv || stFl.advantage) { const second = Math.floor(Math.random() * 20) + 1; if (second > playerRoll) playerRoll = second; }
            adrenalineAtk = adrenalineOn ? rollNd(1, 10).sum : 0;
            playerTotal = playerRoll + mod + adrenalineAtk;
            gmRoll = Math.floor(Math.random() * 20) + 1 + (stFl.rollPenalty || 0);
            if (playerTotal !== gmRoll) break;
            rerolls++;
        } while (rerolls < 20);

        if (berserkAdv) actionLabel += ' (🪓 Берсерк: преимущество)';
        if (stFl.advantage) { actionLabel += ' (⚖ цель потеряла равновесие: преимущество)'; if (window.CloudSync && window.CloudSync.clearEnemyStatusFlag) window.CloudSync.clearEnemyStatusFlag(targetId, 'advantage').catch(function () { }); }
        if (stFl.rollPenalty) actionLabel += ` (цель: ${stFl.rollPenalty} к кубам от статуса)`;
        if (adrenalineOn) actionLabel += ` (⚡ Адреналин: +${adrenalineAtk} к броску${adrenalineDmg ? `, +${adrenalineDmg} к урону` : ''})`;
        let hit = playerTotal > gmRoll;
        // Невидимость: первая атака из невидимости — гарантированное попадание; потом невидимость спадает.
        const invisEff = (activeTimedEffects || []).find(x => x.invisible && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
        let shadowNote = '';
        if (shadowEff) {
            hit = true;
            shadowNote = '🌑 Удар из-за спины: гарантированное попадание' + (document.getElementById('chk-sneak-attack').checked || actionVal === 'melee' || actionVal === 'ranged' ? ' и скрытная атака' : '') + '.';
            activeTimedEffects = activeTimedEffects.filter(x => x !== shadowEff);
            renderActiveEffects(); updateAll(); saveLocalStorage();
        }
        let autoNote = '';
        if (!hit && stFl.helpless && !controlStatus) { hit = true; autoNote = `🧊 Цель беспомощна («${stFl.helplessName}») — попадание автоматическое.`; }
        if (!hit && controlStatus && controlStatus.autoHit) { hit = true; autoNote = '✨ Сопротивления нет — заклинание действует всегда.'; }
        let invisNote = '';
        if (invisEff) {
            hit = true;
            invisNote = '🫥 Невидимость: первый удар — гарантированное попадание, невидимость спала.';
            activeTimedEffects = activeTimedEffects.filter(x => x !== invisEff);
            renderActiveEffects(); updateAll(); saveLocalStorage();
            actionLabel += ' (🫥 из невидимости)';
        }
        if (skillNameForProgress && typeof logSkillSuccessByName === 'function') {
            logSkillSuccessByName(skillNameForProgress, hit ? 1 : MISS_SKILL_PROGRESS); // промах — четверть успеха (как неудачная готовка)
        }

        // Малакат лечит % ХП только при УБИЙСТВЕ силовой атакой — см. godProcs.killHeal.
        const healPct = lifestealPct;

        // Яд на оружии сработает на ближайшем попадании обычной атакой оружием (расходуется на один удар).
        const attackPoison = (hit && weaponPoison && (actionVal === 'melee' || actionVal === 'ranged')) ? weaponPoison : null;
        if (quickShot) { dmg = Math.max(1, Math.round(dmg / 3)); actionLabel += ' (⚡ «Быстрая стрельба»: доп. действие, ⅓ урона)'; }
        if (isSummonAct) markCombatAction(actionVal); else if (quickShot) markBonusAction(); else markCombatAction('attack'); // бросок атаки/каста — действие хода
        if (actionVal === 'ranged' && inCombatNow() && (document.getElementById('wep-ranged-type') || {}).value === 'crossbow') combatMarks.xbow = gameTurn || 0;
        pendingPlayerAttack = hit ? {
            weaponSlot: (actionVal === 'melee' || actionVal === 'ranged') ? actionVal : null,
            targetId, dmg, dmgType, healPct, penetrationPct, controlStatus, poison: attackPoison, extraElem, onHit, healFlat, devourSummonId, area: aoeArea, trueDmg: trueDmgNow,
            spellPerk: spellPerkInfo, bash: bashInfo, powerShot: powerShotNow, killMp: uniqueKillMp,
            godProcs: (actionVal === 'melee' || actionVal === 'ranged') ? {
                kill: gb('instantKillChance'), // Мерунес Дагон: любая атака оружием
                killHeal: isPowerAtkNow ? gb('powerAttackHeal') : 0, // Малакат: % ХП при убийстве силовой атакой
                decap: (actionVal === 'melee' && isPowerAtkNow && (window.lastWeaponCombatCalc || {}).mode === 'melee') ? ((window.lastWeaponCombatCalc || {}).decapChance || 0) : 0
            } : null,
            godExtra: godExtra.length ? godExtra : null,
            lordX: snLordForm() ? {
                poison: (snLordPerk('Ядовитые когти') && (actionVal === 'bite' || actionVal === 'claw' || (actionVal === 'melee' && (document.getElementById('wep-melee-type') || {}).value === 'unarmed'))) ? 20 : 0,
                healKill: snLordPerk('Лечение кровью') && (actionVal === 'bite' || (document.getElementById('chk-power-attack').checked && (actionVal === 'melee' || actionVal === 'ranged')))
            } : null,
            logText: controlStatus
                ? `🌀 ${actionLabel} по «${target.name}»: игрок ${playerTotal} (к20 ${playerRoll}${mod >= 0 ? '+' : ''}${mod}) vs мастер ${gmRoll} — ПОПАДАНИЕ${rerolls ? ` (перекид ×${rerolls})` : ''}.`
                : `⚔️ Атака ${actionLabel} по «${target.name}»: игрок ${playerTotal} (к20 ${playerRoll}${mod >= 0 ? '+' : ''}${mod}) vs мастер ${gmRoll} — ПОПАДАНИЕ, урон ${dmg}${penetrationPct ? ` (пробитие защиты цели: ${penetrationPct}%)` : ''}${rerolls ? ` (перекид ×${rerolls})` : ''}.`
        } : null;

        // Два шага: сначала бросок попадания (✅ Попал / ❌ Промах), урон и «Применить» — только после «Попал».
        // Раньше бросок, урон и «Применить» показывались одним блоком сразу.
        let rollHtml = `<strong>Игрок:</strong> 1d20 (${playerRoll}) ${mod >= 0 ? '+' : ''}${mod} = <strong style="color:var(--accent-color);">${playerTotal}</strong><br>` +
            `<strong>Мастер:</strong> 1d20 = <strong style="color:var(--accent-color);">${gmRoll}</strong>${rerolls ? `<br><span style="opacity:.7;">Перекид из-за ничьей: ×${rerolls}</span>` : ''}<br>` +
            (hit ? '<strong style="color:#2ecc71;">✅ Попадание!</strong>' : '<strong style="color:#e74c3c;">❌ Промах.</strong>');
        if (invisNote) rollHtml += `<br><span style="font-size:13px;">${invisNote}</span>`;
        if (shadowNote) rollHtml += `<br><span style="font-size:13px;">${shadowNote}</span>`;
        if (autoNote) rollHtml += `<br><span style="font-size:13px;">${autoNote}</span>`;
        let dmgHtml = '';
        if (hit) {
            dmgHtml = `Урон: <span style="color:#e74c3c; font-size:17px; font-weight:bold;">${dmg}</span> ед. по «${escHtml(target.name)}»`;
            if (penetrationPct) dmgHtml += `<br><span style="font-size:12px; opacity:.75;">🗡️ Пробитие защиты цели: ${penetrationPct}% (снижает её резист на этот удар)</span>`;
            godExtra.forEach(g => { dmgHtml += `<br><span style="font-size:13px;">${escHtml(g.label)}: ещё <strong>${g.dmg}</strong> урона</span>`; });
            if (extraElem) dmgHtml += `<br><span style="font-size:13px;">${extraElem.icon} «${escHtml(extraElem.name)}»: ещё <strong>${extraElem.dmg * (extraElem.count || 1)}</strong> урона${extraElem.count > 1 ? ` (${extraElem.count} руки)` : ''}</span>`;
            if (trueDmgNow) dmgHtml += `<br><span style="font-size:13px;">🩸 Сквозь сопротивление: ещё <strong>${trueDmgNow}</strong> урона (резист цели не режет)</span>`;
        }
        textEl.innerHTML = rollHtml;
        document.getElementById('attack-dmg-text').innerHTML = dmgHtml;
        document.getElementById('attack-preview-line').textContent = '';
        document.getElementById('attack-dmg-block').style.display = 'none';
        const stepBtn = document.getElementById('attack-step-btn');
        stepBtn.style.display = 'block';
        stepBtn.textContent = hit ? '✅ Попал! — показать урон' : '❌ Промах — закрыть';
        resultBox.style.display = 'block';
        if (!hit && window.CloudSync) {
            const myName = document.getElementById('char-name').value;
            window.CloudSync.postCombatLog(`⚔️ ${myName} атакует «${target.name}» ${actionLabel}: ${playerTotal} vs ${gmRoll} — промах.`, myName);
        }
    };

    // Шаг 2 атаки: после «Попал» показываем урон и кнопку «Применить»; после «Промах» — просто закрываем результат (мана за каст уже потрачена при касте).
    window.attackStepNext = function () {
        const stepBtn = document.getElementById('attack-step-btn');
        if (stepBtn) stepBtn.style.display = 'none';
        if (!pendingPlayerAttack) { document.getElementById('attack-roll-result').style.display = 'none'; return; }
        document.getElementById('attack-dmg-block').style.display = 'block';
        window.previewPlayerAttack();
    };
    // Предпросмотр: сколько реально снимется у цели с учётом её резистов. Только считает и показывает — ничего не пишет и не сохраняет.
    window.previewPlayerAttack = function () {
        const out = document.getElementById('attack-preview-line');
        if (!out) return;
        const pa = pendingPlayerAttack;
        if (!pa || !window.StCombat) { out.textContent = ''; return; }
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const target = session && (session.enemies || []).find(e => e.id === pa.targetId);
        if (!target) { out.textContent = 'Цель не найдена — обнови список.'; return; }
        if (!pa.dmg) { out.textContent = 'Урона нет — это эффект заклинания (см. выше).'; return; }
        const pv = window.StCombat.previewDamage(target, pa.dmg, pa.dmgType, pa.penetrationPct);
        let t = `Ожидаемый урон: ~${pv.finalDmg} (базовый ${pv.base}${pv.notes.length ? ', ' + pv.notes.join(', ') : ''})`;
        if (pa.extraElem && pa.extraElem.dmg) {
            const pe = window.StCombat.previewDamage(target, pa.extraElem.dmg * (pa.extraElem.count || 1), pa.extraElem.type, 0);
            t += `; дух: ~${pe.finalDmg}`;
        }
        // Сколько останется у цели — главное, ради чего жмут «Предпросмотр»; и короткая подсветка строки, чтобы
        // было видно, что кнопка сработала (раньше та же строка уже стояла после «Попал», и клик выглядел пустым).
        if (typeof target.curHp === 'number') {
            const total = pv.finalDmg + (pa.trueDmg || 0) + (pa.extraElem && pa.extraElem.dmg ? window.StCombat.previewDamage(target, pa.extraElem.dmg * (pa.extraElem.count || 1), pa.extraElem.type, 0).finalDmg : 0);
            if (pa.trueDmg) t += `; сквозь сопротивление: +${pa.trueDmg}`;
            const left = Math.max(0, target.curHp - total);
            t += left <= 0 ? ` → «${target.name}» падает (HP ${target.curHp}/${target.maxHp || '?'})` : ` → у «${target.name}» останется ~${left}/${target.maxHp || '?'} HP`;
        }
        out.textContent = t;
        out.classList.remove('st-preview-flash'); void out.offsetWidth; out.classList.add('st-preview-flash');
    };

    window.applyPlayerAttackDamage = function () {
        if (!pendingPlayerAttack || !window.CloudSync) return;
        const playerName = document.getElementById('char-name') ? document.getElementById('char-name').value : 'Игрок';
        if (pendingPlayerAttack.controlStatus) {
            const cs = pendingPlayerAttack.controlStatus;
            if (cs.absorbMp) {
                window.CloudSync.modifyEnemyVitals(pendingPlayerAttack.targetId, 0, -cs.absorbMp, playerName, `🌀 ${playerName} поглощает магию у цели (до ${cs.absorbMp} маны)`)
                    .then(res => {
                        const got = Math.max(0, -res.appliedMp);
                        const mpEl = document.getElementById('cur-mp'), maxMp = parseInt(document.getElementById('max-mp').value) || 0;
                        mpEl.value = Math.max(parseInt(mpEl.value) || 0, Math.min(maxMp, (parseInt(mpEl.value) || 0) + got));
                        updateVitalBars(); saveLocalStorage();
                        alert(got ? `Поглощено ${got} маны у «${res.enemyName}» — она твоя.` : `У «${res.enemyName}» нет маны — поглощать нечего.`);
                        pendingPlayerAttack = null;
                        document.getElementById('attack-roll-result').style.display = 'none';
                        window.renderAttackTargetSelect();
                    })
                    .catch(e => alert('Ошибка: ' + e.message));
                return;
            }
            if (cs.banish) {
                window.CloudSync.banishEnemy(pendingPlayerAttack.targetId, playerName)
                    .then(res => {
                        alert(`«${res.enemyName}» изгнан(а) в Обливион.`);
                        pendingPlayerAttack = null;
                        document.getElementById('attack-roll-result').style.display = 'none';
                        window.renderAttackTargetSelect();
                    })
                    .catch(e => alert('Ошибка: ' + e.message));
                return;
            }
            const csTarget = pendingPlayerAttack.targetId;
            const preDmg = cs.damage
                ? window.CloudSync.applyDamageToEnemy(csTarget, cs.damage, playerName, `🌀 ${playerName}: заклинание не изгоняет цель, но наносит урон ${cs.damage}`, cs.damageType || 'magic', 0)
                : Promise.resolve();
            preDmg.then(() => window.CloudSync.applyStatusToEnemy(csTarget, cs.status, cs.desc, cs.turns, playerName, cs.extra))
                .then(res => {
                    alert(`Статус применён! «${res.enemyName}»: ${cs.status} (${cs.turns} х.) — ${cs.desc}`);
                    pendingPlayerAttack = null;
                    document.getElementById('attack-roll-result').style.display = 'none';
                    window.renderAttackTargetSelect();
                })
                .catch(e => alert('Ошибка: ' + e.message));
            return;
        }
        const healFlatNow = pendingPlayerAttack.healFlat || 0, devourIdNow = pendingPlayerAttack.devourSummonId || null;
        const attackPoisonNow = pendingPlayerAttack.poison || null;
        const attackWeaponSlot = pendingPlayerAttack.weaponSlot || null;
        const attackTargetId = pendingPlayerAttack.targetId;
        const elemNow = pendingPlayerAttack.extraElem || null;
        let mainHit = window.CloudSync.applyDamageToEnemy(pendingPlayerAttack.targetId, pendingPlayerAttack.dmg, playerName || 'Игрок', pendingPlayerAttack.logText, pendingPlayerAttack.dmgType, pendingPlayerAttack.penetrationPct);
        if (pendingPlayerAttack.area && pendingPlayerAttack.dmg) { const paA = Object.assign({}, pendingPlayerAttack); mainHit = mainHit.then(r0 => { try { gridApplyAoe(paA, playerName || 'Игрок'); } catch (x) { console.error(x); } return r0; }); }
        if (elemNow) mainHit = mainHit.then(r0 => {
            if (!r0 || r0.killed) return r0; // добитую цель дух уже не бьёт
            return applySpiritHit(elemNow, attackTargetId, playerName || 'Игрок').then(sp => {
                const out = Object.assign({}, r0, { spirit: { name: elemNow.name, icon: elemNow.icon, dmg: sp.finalDmg, resist: sp.resist, hits: sp.hits } });
                if (sp.newHp !== null) out.newHp = sp.newHp;
                if (sp.killed) { out.killed = true; if (sp.enemy) out.enemy = sp.enemy; }
                return out;
            });
        });
        const lordXNow = pendingPlayerAttack.lordX || null;
        if (lordXNow && lordXNow.poison) mainHit = mainHit.then(r0 => {
            if (!r0 || r0.killed) return r0;
            return window.CloudSync.applyDamageToEnemy(attackTargetId, lordXNow.poison, playerName || 'Игрок', `☠ «Ядовитые когти» (${playerName || 'Игрок'}): урон ${lordXNow.poison}`, 'poison', 0).then(pr => {
                const out = Object.assign({}, r0, { newHp: pr.newHp, poisonDmg: pr.finalDmg });
                if (pr.killed) { out.killed = true; if (pr.enemy) out.enemy = pr.enemy; }
                return out;
            });
        });
        (pendingPlayerAttack.godExtra || []).forEach(g => {
            mainHit = mainHit.then(r0 => {
                if (!r0 || r0.killed) return r0;
                return window.CloudSync.applyDamageToEnemy(attackTargetId, g.dmg, playerName || 'Игрок', `${g.label} (${playerName || 'Игрок'}): урон ${g.dmg}`, g.type, g.pen || 0).then(pr => {
                    const out = Object.assign({}, r0, { newHp: pr.newHp });
                    if (pr.killed) { out.killed = true; if (pr.enemy) out.enemy = pr.enemy; }
                    if (g.heal && pr.finalDmg > 0) {
                        const hpG = document.getElementById('cur-hp'), mxG = parseInt(document.getElementById('max-hp').value) || 0, cG = parseInt(hpG.value) || 0;
                        const nG = Math.max(cG, Math.min(mxG, cG + pr.finalDmg));
                        if (nG > cG) { hpG.value = nG; updateVitalBars(); saveLocalStorage(); out.godHealMsg = (out.godHealMsg || '') + ` ${g.label.split(':')[0]}: +${nG - cG} ХП.`; }
                    }
                    return out;
                });
            });
        });
        const trueNow = pendingPlayerAttack.trueDmg || 0;
        if (trueNow) mainHit = mainHit.then(r0 => { // Копейщик/Пикосажатель/Боевые искусства: урон «через сопротивление» — без резиста цели
            if (!r0 || r0.killed) return r0;
            return window.CloudSync.applyDamageToEnemy(attackTargetId, trueNow, playerName || 'Игрок', `🩸 Сквозь сопротивление (${playerName || 'Игрок'}): урон ${trueNow}`, 'physical', 100).then(pr => {
                const out = Object.assign({}, r0, { newHp: pr.newHp, trueDmg: pr.finalDmg });
                if (pr.killed) { out.killed = true; if (pr.enemy) out.enemy = pr.enemy; }
                return out;
            });
        });
        const killMpNow = pendingPlayerAttack.killMp || 0;
        if (killMpNow) mainHit = mainHit.then(r0 => { if (r0 && r0.killed) { gainOwnMp(killMpNow); alertSafe(`🗡 Убийство: +${killMpNow} маны.`); } return r0; });
        const onHitNow = pendingPlayerAttack.onHit || null;
        if (onHitNow) mainHit = mainHit.then(r0 => {
            let pp = Promise.resolve();
            if (onHitNow.mpDrain) pp = pp.then(() => window.CloudSync.modifyEnemyVitals(attackTargetId, 0, -onHitNow.mpDrain, playerName || 'Игрок', `⚡ «${onHitNow.name}»: цель теряет ${onHitNow.mpDrain} маны`));
            if (onHitNow.mpGain) pp = pp.then(() => gainOwnMp(onHitNow.mpGain)); // оружие «крадёт МП»: мана владельцу
            if (onHitNow.oblivion === 'banish' && !(r0 && r0.killed)) pp = pp.then(r => window.CloudSync.banishEnemy(attackTargetId, playerName || 'Игрок', `🌀 ${playerName || 'Игрок'}: призванное оружие изгоняет врага в Обливион («Изгнание в Обливион»)`).catch(() => null));
            if (onHitNow.oblivion === 'flee' && !(r0 && r0.killed)) pp = pp.then(() => window.CloudSync.applyStatusToEnemy(attackTargetId, 'Страх', 'Бежит с поля боя («Изгнание в Обливион»)', 3, playerName || 'Игрок', { unique: true }));
            if (onHitNow.armorBreak) pp = pp.then(() => window.CloudSync.applyStatusToEnemy(attackTargetId, 'Увядание', `Броня −${onHitNow.armorBreak} (физ. сопротивление −${Math.round(onHitNow.armorBreak / 10)}%)`, 99, playerName || 'Игрок', { unique: true, res: { physical: -Math.round(onHitNow.armorBreak / 10) } }));
            if (onHitNow.slow) pp = pp.then(() => window.CloudSync.applyStatusToEnemy(attackTargetId, 'Замедление (' + onHitNow.name + ')', `−${onHitNow.slow} фт скорости`, 2, playerName || 'Игрок', { unique: true }));
            if (onHitNow.freeze && !(r0 && r0.killed)) pp = pp.then(() => window.CloudSync.applyStatusToEnemy(attackTargetId, 'Заморожен', `Скован льдом («${onHitNow.name}»): не ходит и не атакует`, onHitNow.freeze, playerName || 'Игрок', { unique: true }));
            return pp.then(() => r0);
        });
        // Зачарование оружия «Паралич» / «Страх»: на попадании цель до 17 ур. (неизвестный уровень — подходит) делает спасбросок:
        // d20 + ⌊уровень/4⌋ (уровень неизвестен — +2) против СЛ 10 + ⌊Зачарование владельца / 20⌋ (10…15). Не прошла — статус.
        if (attackWeaponSlot) {
            const wIdE = attackWeaponSlot === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon;
            const wItE = wIdE ? playerInventory.find(i => i.itemId === wIdE) : null;
            const wEnN = weaponEnchantLive(wItE) ? wItE.enchantment.name : '';
            if (wEnN === 'Паралич' || wEnN === 'Страх') {
                const turnsE = Math.max(1, Math.round(Number(wItE.enchantment.value)) || 1);
                mainHit = mainHit.then(r0 => {
                    if (!r0 || r0.killed) return r0;
                    const lvE = r0.enemy && Number(r0.enemy.level);
                    if (lvE && lvE > 17) { alert('Зачарование «' + wEnN + '» не действует: «' + r0.enemyName + '» выше 17 уровня.'); return r0; }
                    const dcE = 10 + Math.floor(Math.min(SKILL_MAX, getSkillRawValue('Зачарование')) / 20);
                    const rollE = 1 + Math.floor(Math.random() * 20), bonE = lvE ? Math.floor(lvE / 4) : 2, totE = rollE + bonE;
                    const saveTxt = `спасбросок ${wEnN === 'Паралич' ? 'Телосложения' : 'Мудрости'} ${rollE}+${bonE}=${totE} против СЛ ${dcE}`;
                    if (totE >= dcE) {
                        if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🛡 «${r0.enemyName}» устоял(а) перед зачарованием «${wEnN}»: ${saveTxt}.`, playerName || 'Игрок');
                        return r0;
                    }
                    const stE = wEnN === 'Паралич' ? ['Паралич', 'Парализован — не действует (зачарование оружия)'] : ['Страх', 'Бежит с поля боя (зачарование оружия)'];
                    if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`✨ Зачарование «${wEnN}» сработало на «${r0.enemyName}» (${turnsE} х.): ${saveTxt}.`, playerName || 'Игрок');
                    return window.CloudSync.applyStatusToEnemy(attackTargetId, stE[0], stE[1], turnsE, playerName || 'Игрок').then(() => r0);
                });
            }
        }
        // Перки после попадания: Ударная волна, Жаркое пламя / Глубокая заморозка / Дезинтеграция, удар щитом, Мощный выстрел.
        { const ppk = pendingPlayerAttack.spellPerk || null, bashNow = pendingPlayerAttack.bash || null, pshotNow = !!pendingPlayerAttack.powerShot;
          const godP = (pendingPlayerAttack.godProcs && (pendingPlayerAttack.godProcs.kill || pendingPlayerAttack.godProcs.decap)) ? pendingPlayerAttack.godProcs : null;
          if (ppk || bashNow || pshotNow || godP) mainHit = mainHit.then(r0 => {
            if (!r0 || r0.killed) return r0;
            const pbP = window.perkBonuses || {}, CS = window.CloudSync, pName = playerName || 'Игрок';
            r0.perkMsgs = r0.perkMsgs || [];
            let chain = Promise.resolve(r0);
            const addSt = (n, d, t, msg, extra) => { chain = chain.then(x => CS.applyStatusToEnemy(attackTargetId, n, d, t, pName, extra).then(() => { x.perkMsgs.push(msg); return x; })); };
            if (ppk && ppk.school === 'destr' && ppk.dual && pbP.staggerWave) addSt('Шатается', 'Ударная волна: преимущество на следующую атаку по цели', 1, '🌊 «Ударная волна»: цель потеряла равновесие.');
            const mxP = r0.enemy && r0.enemy.maxHp ? r0.enemy.maxHp : 0;
            const lowP = ppk && ppk.school === 'destr' && mxP > 0 && r0.newHp > 0 && r0.newHp / mxP < 0.05;
            if (lowP && ppk.dmgType === 'fire' && pbP.fireLowHpFlee) addSt('Бегство', '«Жаркое пламя»: обращён в бегство огнём', 5, '🔥 «Жаркое пламя»: цель в бегстве (5 х.).');
            if (lowP && ppk.dmgType === 'frost' && pbP.frostLowHpParalyze) addSt('Паралич', '«Глубокая заморозка»: парализован холодом', 4, '❄️ «Глубокая заморозка»: цель парализована (4 х.).');
            if (lowP && ppk.dmgType === 'shock' && pbP.shockLowHpDisintegrate) {
                chain = chain.then(x => CS.applyDamageToEnemy(attackTargetId, 99999, pName, `⚡ «Дезинтеграция» (${pName}): цель обращена в прах`, 'magic', 100).then(pr => {
                    x.killed = true; x.newHp = 0; if (pr.enemy) x.enemy = pr.enemy;
                    x.perkMsgs.push('⚡ «Дезинтеграция»: цель обращена в прах!');
                    return (CS.turnCorpseToAsh ? CS.turnCorpseToAsh(attackTargetId) : Promise.resolve()).then(() => x);
                }));
            }
            if (bashNow && bashNow.basic) {
                addSt('Оглушён щитом', 'Удар щитом: −1 к кубам на следующий ход', 1, '🛡 Удар щитом: цель оглушена (−1 к кубам).', { rollPenalty: -1 });
            } else if (bashNow) {
                addSt('Шатается', 'Удар щитом: преимущество на следующую атаку по цели', 1, '🛡 Удар щитом: цель потеряла равновесие.');
                if (bashNow.disarm && Math.random() < 0.25) addSt('Обезоружен', 'Обезоружен ударом щита: урон оружием −80%', 3, '🗡 «Обезоруживание» (25%): враг потерял оружие (−80% урона, 3 х.)!', { dmgPct: -80 });
            }
            if (godP) { // Мерунес Дагон: 1–2% мгновенно убить любой атакой оружием
                if (godP.decap && Math.random() < godP.decap) { // «Безжалостный удар» / «Сокрушительный удар»
                    chain = chain.then(x => x.killed ? x : CS.applyDamageToEnemy(attackTargetId, 99999, pName, `💀 ${pName} обезглавливает цель силовой атакой`, 'physical', 100).then(pr => {
                        x.killed = true; x.newHp = 0; if (pr.enemy) x.enemy = pr.enemy; x.perkMsgs.push('💀 Обезглавливание!'); return x;
                    }));
                } else if (godP.kill && Math.random() * 100 < godP.kill) {
                    chain = chain.then(x => CS.applyDamageToEnemy(attackTargetId, 99999, pName, `💀 Мерунес Дагон (${pName}): мгновенное убийство`, 'magic', 100).then(pr => {
                        x.killed = true; x.newHp = 0; if (pr.enemy) x.enemy = pr.enemy; x.perkMsgs.push('💀 Мерунес Дагон: мгновенное убийство!'); return x;
                    }));
                }
            }
            if (pshotNow) addSt('Мощный выстрел', '−1 к кубам на следующее действие', 2, '🏹 «Мощный выстрел» (каждый 3-й): цель сбита, −1 к кубам.', { rollPenalty: -1, unique: true });
            return chain;
          });
        }
        mainHit
            .then(res => {
                let healMsg = '', soulMsg = '';
                if (res && res.perkMsgs && res.perkMsgs.length) healMsg += ' ' + res.perkMsgs.join(' ');
                if (pendingPlayerAttack.godProcs && pendingPlayerAttack.godProcs.msg) healMsg += ' ' + pendingPlayerAttack.godProcs.msg;
                if (res && res.godHealMsg) healMsg += res.godHealMsg;
                if (res && res.killed && pendingPlayerAttack.godProcs && pendingPlayerAttack.godProcs.killHeal) { // Малакат
                    const hpK = document.getElementById('cur-hp'), mxK = parseInt(document.getElementById('max-hp').value) || 0, cK = parseInt(hpK.value) || 0;
                    const nK = Math.max(cK, Math.min(mxK, cK + Math.round(mxK * pendingPlayerAttack.godProcs.killHeal / 100)));
                    if (nK > cK) { hpK.value = nK; updateVitalBars(); saveLocalStorage(); healMsg += ` ⚔ Малакат: убийство силовой атакой, +${nK - cK} ХП.`; }
                }
                if (res.killed && res.enemy) healMsg += soulEaterKill(res.enemy);
                if (res.killed && res.enemy) healMsg += lordCountKill(res.enemy);
                if (res.killed && res.enemy) healMsg += lichOnKill(res.enemy, !!attackWeaponSlot, attackWeaponSlot);
                if (res.killed && counterHits[attackTargetId]) { delete counterHits[attackTargetId]; saveLocalStorage(); }
                if (res.killed && lordXNow && lordXNow.healKill) { snLordKillHeal('убийство'); healMsg += ' 🩸 Лечение кровью: +50% ХП.'; }
                // Зачарование «Захват души» / «Похититель душ»: добивающий удар оружием забирает душу бесплатно.
                if (res.killed && attackWeaponSlot && (weaponHasSoulTrap(attackWeaponSlot) || lichPerk('bearer')) && !res.enemy.soulTaken && !soulTakenLocal[res.enemy.id]) {
                    const sz = resolveSoulSize(res.enemy);
                    const rW = (sz && sz !== 'none') ? trapSoul(res.enemy, 'weapon', { size: sz }) : { message: sz === 'none' ? `У «${res.enemy.name}» нет души.` : 'Размер души не указан — душа ускользнула.' };
                    soulMsg = '\n' + rW.message;
                }
                // Яд с оружия: накладываем эффекты на цель и смываем яд (один удар).
                if (attackPoisonNow && typeof window.CloudSync.applyAlchemyToEnemy === 'function') {
                    weaponPoison = null; renderWeaponPoisonStatus(); saveLocalStorage();
                    const effsP = (window.perkBonuses || {}).alchemyConcentratedPoison // «Концентрированный яд»: +20%
                        ? attackPoisonNow.effects.map(e => Object.assign({}, e, { magnitude: typeof e.magnitude === 'number' ? Math.round(e.magnitude * 1.2 * 100) / 100 : e.magnitude }))
                        : attackPoisonNow.effects;
                    window.CloudSync.applyAlchemyToEnemy(attackTargetId, effsP, attackPoisonNow.name, playerName || 'Игрок')
                        .then(pr => alchToast(`☠ Яд «${escHtml(attackPoisonNow.name)}» подействовал на «${escHtml(pr.enemyName)}»: ${escHtml(pr.notes.join('; ') || '—')}`))
                        .catch(e => alert('Яд не удалось нанести: ' + e.message));
                }
                // Вампиризм/лечение силовой атаки — считается от РЕАЛЬНОГО (пост-резист) урона.
                if (pendingPlayerAttack.healPct && res.finalDmg) {
                    const healAmt = Math.round(res.finalDmg * pendingPlayerAttack.healPct / 100);
                    if (healAmt > 0) {
                        const hpEl = document.getElementById('cur-hp');
                        const maxHp = parseInt(document.getElementById('max-hp').value) || 999999;
                        const hpWas = parseInt(hpEl.value) || 0;
                        const newHp = Math.max(hpWas, Math.min(maxHp, hpWas + healAmt)); // временное HP выше максимума вампиризм не срезает
                        hpEl.value = newHp;
                        saveLocalStorage();
                        const gotHp = newHp - hpWas;
                        if (gotHp > 0) healMsg += ` Похищено здоровья: +${gotHp} ХП.`;
                    }
                }
                if (healFlatNow && res.finalDmg > 0) { // «Жизнеотвод»: существо отводит жизнь заклинателю
                    const hpElF = document.getElementById('cur-hp'), maxHpF = parseInt(document.getElementById('max-hp').value) || 999999;
                    const curF = parseInt(hpElF.value) || 0, newF = Math.max(curF, Math.min(maxHpF, curF + healFlatNow));
                    hpElF.value = newF; saveLocalStorage();
                    healMsg += ` 🩸 Жизнеотвод: +${newF - curF} ХП тебе.`;
                }
                if (healMsg) updateVitalBars(); // полоска ХП — сразу после вампиризма/Жизнеотвода
                const spiritMsg = res.spirit ? ` + ${res.spirit.icon} «${res.spirit.name}»: ${res.spirit.dmg} ед.${res.spirit.resist ? ` (резист ${res.spirit.resist}%)` : ''}${res.spirit.hits > 1 ? ` (${res.spirit.hits} руки)` : ''}` : '';
                alert(`Урон применён! «${res.enemyName}»: ${res.resist ? `${res.finalDmg} ед. (резист ${res.resist}%)` : res.finalDmg + ' ед.'}${spiritMsg}, осталось ${res.newHp} HP.${healMsg}${soulMsg}`);
                if (devourIdNow && activeSummons.some(s => s.id === devourIdNow)) { // «Пожирающая сила»: закончил ход — умирает
                    const smD = activeSummons.find(s => s.id === devourIdNow);
                    window.dismissSummon(devourIdNow);
                    alert('💀 «' + smD.name + '» погибает от «Пожирающей силы».');
                }
                pendingPlayerAttack = null;
                document.getElementById('attack-roll-result').style.display = 'none';
                window.renderAttackTargetSelect();
            })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    // ТЗ-2, эпик 2.4: добыча из контейнера данжа — и при обыске самим игроком, и когда мастер отдал контейнер
    // (команда dungeonLoot). Кладём так же, как лут с трупа: те же поля предмета, сразу немедленное сохранение.
    function applyDungeonLoot(loot) {
        (loot.items || []).forEach(it => {
            const extra = { slot: it.slot, armorValue: it.armor, weaponDmg: it.dmg, price: it.price, alchemyEffects: it.alchemyEffects };
            if (it.enchantment) extra.enchantment = it.enchantment;
            if (typeof it.chargeDaysLeft === 'number') extra.chargeDaysLeft = it.chargeDaysLeft;
            addToInventory(it.name, it.name, Math.max(1, Math.min(999, parseInt(it.qty) || 1)), it.weight || 0,
                /^Зель/i.test(it.category || '') ? 'Зелье' : (it.category || ''), it.effect || '', extra);
        });
        if (loot.gold) {
            const goldInput = document.getElementById('char-gold');
            goldInput.value = (parseInt(goldInput.value) || 0) + (parseInt(loot.gold) || 0);
        }
        renderInventoryList();
        updateAll();
        saveLocalStorage(true); // немедленно — без окна гонки с мастером
        const parts = [];
        if (loot.gold) parts.push(loot.gold + ' зол.');
        (loot.items || []).forEach(it => parts.push('«' + it.name + '»' + ((parseInt(it.qty) || 1) > 1 ? ' ×' + it.qty : '')));
        return parts;
    }
    window.playerSearchContainer = function (containerId) {
        if (!window.CloudSync || !window.CloudSync.takeFromDungeon) return;
        if (!confirm('Обыскать?')) return;
        window.CloudSync.takeFromDungeon(containerId).then(result => {
            const parts = applyDungeonLoot(result);
            const name = (document.getElementById('char-name') || {}).value || 'Игрок';
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog('🔍 ' + name + ' обыскал(а) «' + ((result.container && result.container.label) || 'контейнер') + '»: ' + (parts.join(', ') || 'пусто'), name);
            alert('Найдено: ' + (parts.join(', ') || 'ничего'));
        }).catch(e => alert(e.message));
    };
    // Команда мастера «отдать контейнер игроку». id команды запоминаем: очередь чистится отдельной записью, и
    // повторный снимок сессии до очистки иначе положил бы ту же добычу второй раз.
    function handleDungeonLootCmd(e) {
        let seen = [];
        try { seen = JSON.parse(localStorage.getItem('skyrim_dungeon_loot_applied') || '[]'); } catch (er) { seen = []; }
        if (e.id && seen.indexOf(e.id) !== -1) return;
        const parts = applyDungeonLoot(e);
        if (e.id) { seen.push(e.id); try { localStorage.setItem('skyrim_dungeon_loot_applied', JSON.stringify(seen.slice(-100))); } catch (er) { } }
        if (typeof window.alchToast === 'function') window.alchToast('🔍 Мастер отдал тебе «' + escHtml(e.label || 'контейнер') + '»: ' + escHtml(parts.join(', ') || 'пусто'));
    }

    // Обыск трупа самим игроком — раньше это умел делать только мастер, что было неудобно.
    window.playerLootCorpse = function (enemyId) {
        if (!window.CloudSync) return;
        window.CloudSync.lootCorpseForSelf(enemyId).then(corpseLoot => {
            (corpseLoot.items || []).forEach((it, idxL) => {
                const qtyL = Math.max(1, Math.min(999, (parseInt(it.qty) || 1) * (((window.perkBonuses || {}).arrowRecoverDouble && /стрел|болт/i.test(it.name || '')) ? 2 : 1)));
                const catL = /^Яд/i.test(it.category || '') ? 'Яд' : /^Зель/i.test(it.category || '') ? 'Зелье' : (it.category || '');
                const extraL = { slot: it.slot, armorValue: it.armor, weaponDmg: it.dmg, price: it.price, alchemyEffects: it.alchemyEffects };
                // Зачарованное оружие драугра и т.п. — со своими чарами и зарядом, отдельной записью (как у мастера), не в стопку обычных.
                if (it.enchantment) {
                    extraL.enchantment = JSON.parse(JSON.stringify(it.enchantment));
                    if (typeof it.chargeDaysLeft === 'number') extraL.chargeDaysLeft = it.chargeDaysLeft;
                    addToInventory(it.name + '#' + Date.now() + idxL, it.name, 1, it.weight || 0, catL, it.effect || '', extraL);
                    return;
                }
                addToInventory(it.name, it.name, qtyL, it.weight || 0, catL, it.effect || '', extraL);
            });
            if (corpseLoot.gold) {
                const goldInput = document.getElementById('char-gold');
                goldInput.value = (parseInt(goldInput.value) || 0) + corpseLoot.gold;
            }
            const myName = document.getElementById('char-name').value;
            if (window.CloudSync.postCombatLog) {
                window.CloudSync.postCombatLog(`💀 ${myName} обыскал(а) труп и забрал(а) добычу.`, myName);
            }
            alert(`Найдено: 💰${corpseLoot.gold || 0} золота` + (corpseLoot.items || []).map(i => ', ' + i.name).join(''));
            renderInventoryList();
            updateAll();
            saveLocalStorage(true); // немедленно — без окна гонки с мастером сразу после лута
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Восстановление маны при отдыхе. Знак Атронаха («Медленное восстановление магии», Sistema 2.2):
    // восстанавливается только ПОЛОВИНА израсходованной маны, округляя вверх (минимум 1).
    function restoreManaForRest() {
        const maxMp = parseInt(document.getElementById('max-mp').value) || 0;
        const curMp = parseInt(document.getElementById('cur-mp').value) || 0;
        const spent = Math.max(0, maxMp - curMp);
        const atronach = document.getElementById('char-sign').value === 'atronach';
        const gain = atronach ? (spent > 0 ? Math.max(1, Math.ceil(spent / 2)) : 0) : spent;
        document.getElementById('cur-mp').value = Math.max(curMp, Math.min(maxMp, curMp + gain));
        return { gain, spent, atronach, maxMp };
    }

    // Короткий отдых: восстанавливается только мана (для Атронаха — половина израсходованной).
    // Здоровье не лечится, Мудрость на свитки не возвращается — это даёт длительный отдых («Следующий день»).
    window.shortRest = function () {
        // Раньше отдых был бесплатным и бесконечным: кастуй → отдохни → мана полная, в бою и без счёта.
        const sess = window.CloudSync ? window.CloudSync.getSessionData() : null;
        if (sess && Array.isArray(sess.enemies) && sess.enemies.some(e => e && (e.curHp || 0) > 0)) { alert('Идёт бой — короткий отдых сейчас невозможен.'); return; }
        // Не больше двух коротких отдыхов до длительного (раньше 3–4 раза подряд — и мана полная, штраф Атронаха терялся).
        if ((shortRestsUsed || 0) >= SHORT_RESTS_PER_DAY) { alert(`Короткий отдых уже был ${SHORT_RESTS_PER_DAY} раза — дальше нужен длительный отдых («Следующий день»).`); return; }
        try { stopBalladIfMine(); } catch (e) { }
        const r = restoreManaForRest();
        if (r.spent > 0) shortRestsUsed = (shortRestsUsed || 0) + 1;
        let msg;
        if (r.spent === 0) msg = 'Короткий отдых: мана и так полная.';
        else if (r.atronach) msg = `Короткий отдых: знак Атронаха — восстановлена только половина израсходованной маны: +${r.gain} из ${r.spent}. Здоровье не изменилось.`;
        else msg = `Короткий отдых: мана восстановлена полностью (+${r.gain}). Здоровье не изменилось.`;
        alert(msg);
        updateAll();
        saveLocalStorage();
    };
    var SHORT_RESTS_PER_DAY = 2, shortRestsUsed = 0, readSkillBooks = []; // var: сохранение может вызваться раньше этой строки
    // Старое имя оставлено для совместимости (раньше была одна кнопка «Отдых» с полным восстановлением).
    function restoreAll() { window.shortRest(); }

    // Длительный отдых (часть «Следующего дня»): мана (Атронах — половина), Мудрость на свитки — полностью;
    // здоровье — на полное ТОЛЬКО если использована «Лечебная припарка» (тратится 1 шт.), иначе не восстанавливается.
    function applyLongRest() {
        const notes = [];
        shortRestsUsed = 0; // длительный отдых снова разрешает короткие
        const r = restoreManaForRest();
        if (r.spent > 0) notes.push(r.atronach ? `мана: знак Атронаха — +${r.gain} (половина израсходованной)` : `мана восстановлена полностью (+${r.gain})`);
        scrollWisdomSpent = 0;
        const wis = parseInt(document.getElementById('stat-wis').value) || 10;
        document.getElementById('val-scrolls').innerText = wis;
        const maxHp = parseInt(document.getElementById('max-hp').value) || 0;
        const curHp = parseInt(document.getElementById('cur-hp').value) || 0;
        const poultice = playerInventory.find(i => /^Лечебная припарка/.test(i.itemId || '') || /^Лечебная припарка/.test(i.name || ''));
        if (curHp >= maxHp) {
            notes.push('здоровье и так полное — припарка не нужна');
        } else if (poultice && poultice.count > 0) {
            if (confirm(`Длительный отдых: использовать «Лечебную припарку» (осталось ${poultice.count})?\nОК — здоровье восстановится полностью (HP ${curHp} → ${maxHp}).\nОтмена — здоровье не восстановится.`)) {
                removeFromInventoryByName(poultice.itemId, 1);
                document.getElementById('cur-hp').value = maxHp;
                notes.push(`использована лечебная припарка — HP ${curHp} → ${maxHp}`);
                renderInventoryList();
            } else {
                notes.push('припарка не использована — здоровье не восстановилось');
            }
        } else {
            notes.push('нет «Лечебной припарки» — здоровье не восстановилось');
        }
        return notes;
    }

    // Получение бонусов от бога
    // ---- Суточные счётчики богов: Сангвин (алкоголь за день) и Намира (съеденные трупы) ----
    // Лёгкий / тяжёлый алкоголь из базы «Напитки». Остальные напитки (молоко, зелье крови) — не алкоголь.
    const HEAVY_DRINKS = ['Коловианский бренди', 'Огненное вино', "Строс М'Кайский ром", 'Черновересковый мёд отборный', 'Флин', 'Шейн', 'Красноводная скума', 'Суджамма', 'Зольный мед (алко)'];
    const LIGHT_DRINKS = ['Черновересковый мёд', 'Мёд Хоннинга', 'Вино «Алто»', 'Нордский мёд', 'Вино', 'Пряное вино', 'Мед с можжевеловыми ягодами', 'Аргонианский эль', 'Вино Джесики', 'Мацт', 'Угольное вино'];
    function drinkStrength(name) { return HEAVY_DRINKS.indexOf(name) !== -1 ? 'heavy' : (LIGHT_DRINKS.indexOf(name) !== -1 ? 'light' : null); }
    // Пороги за день по ступени веры: [лёгкого от, тяжёлого от]
    const SANGUINE_THRESHOLDS = { 1: { light: 6, heavy: 1, lightMax: 8, heavyMax: 2 }, 2: { light: 12, heavy: 2, lightMax: 14, heavyMax: 3 }, 3: { light: 16, heavy: 3, lightMax: 17, heavyMax: 5 } };
    let godDay = { light: 0, heavy: 0 };
    function sanguineActive(rank) {
        const t = SANGUINE_THRESHOLDS[rank]; if (!t) return false;
        return godDay.light >= t.light || godDay.heavy >= t.heavy;
    }
    window.addDrink = function (kind, n) {
        godDay[kind] = Math.max(0, (godDay[kind] || 0) + (n || 1));
        // Сангвин: после выпивки физ. урон выше на 20 ходов (магия.xlsx).
        if ((n || 1) > 0 && (document.getElementById('faith-god') || {}).value === 'sanguine') {
            pushOrRefreshTimedEffect({ id: 'eff-sanguine-drunk', name: 'Сангвин', effectName: 'Хмель Сангвина', description: 'Физический урон выше (Сангвин), 20 ходов', turnsRemaining: 20, sanguineDrunk: true, hp: 0, mp: 0, value: 0 });
            renderActiveEffects();
        }
        updateAll(); saveLocalStorage();
    };
    window.resetGodDay = function () { godDay = { light: 0, heavy: 0 }; updateAll(); saveLocalStorage(); };

    // Аэдра дают силу, только пока надет амулет именно этого бога (таблица богов). Даэдра амулет не нужен.
    const AEDRA_AMULETS = { zenithar: 'Амулет Зенитара', stendarr: 'Амулет Стендарра', julianos: 'Амулет Джулианоса', mara: 'Амулет Мары', dibella: 'Амулет Дибеллы', kynareth: 'Амулет Кинарет', arkay: 'Амулет Аркея', talos: 'Амулет Талоса', akatosh: 'Амулет Акатоша' };
    function wearsGodAmulet(god) {
        const need = AEDRA_AMULETS[god]; if (!need) return true;
        const it = equippedSlots.neck ? playerInventory.find(i => i.itemId === equippedSlots.neck) : null;
        return !!(it && String(it.name || '').indexOf(need) === 0);
    }
    var penanceAllowed = false; // мастер провёл «покаяние»: один переход от даэдра к аэдра
    var lastFaithGod = null;
    window.onFaithGodChange = function (sel) {
        const prev = lastFaithGod || 'none', next = sel.value;
        if (!AEDRA_AMULETS[prev] && prev !== 'none' && godBonuses[prev] && AEDRA_AMULETS[next]) {
            if (!penanceAllowed) { sel.value = prev; alert('Чтобы снова поклоняться аэдра, нужно пройти «покаяние» — его проводит мастер.'); return; }
            penanceAllowed = false;
        }
        lastFaithGod = next;
        updateAll(); saveLocalStorage();
    };
    function getGodBonuses(god, rank) {
        if (!god || god === 'none' || !godBonuses[god]) return {};
        if (!wearsGodAmulet(god)) return {};
        let bonuses = godBonuses[god][rank] || {};
        // «Сапоги Хранителя»: при полном комплекте Хранителя бонусы 3-го ранга веры аэдра сильнее на 50% (+100 маны → +150).
        if (rank >= 3 && AEDRA_AMULETS[god] && ['Шлем Хранителя', 'Броня Хранителя', 'Перчатки Хранителя', 'Сапоги Хранителя'].every(wearsItemNamed)) {
            const b2 = {};
            Object.keys(bonuses).forEach(k => { const v = bonuses[k]; b2[k] = typeof v === 'number' ? (/resist/i.test(k) ? Math.min(100, Math.round(v * 1.5)) : Math.round(v * 1.5)) : v; });
            bonuses = b2;
        }
        if (god === 'sanguine') {
            // Вампиризм и сопротивление ядам — всегда; прибавка к урону — 20 ходов после выпивки в «пьяный» день.
            const drunk = sanguineActive(rank) && activeTimedEffects.some(e => e.sanguineDrunk && e.turnsRemaining > 0);
            return Object.assign({}, bonuses, { weaponDmg: drunk ? (bonuses.drunkBuff || 0) : 0 });
        }
        return bonuses;
    }

    // Пожирание трупов: Намира (люди и меры; бафф с 2-й ступени, магия.xlsx) и оборотень в облике зверя
    // (Фракции.xlsx: лечится только так, +50 ХП, с «Жадностью в еде» (20 сердец) — вдвое).
    function namiraCanEat(e) {
        const god = (document.getElementById('faith-god') || {}).value;
        return god === 'namira' && getEnemyMeta(e).kind === 'people';
    }
    function werewolfCanEat(e) {
        return snWerewolfForm() && ['undead', 'daedra', 'automaton'].indexOf(getEnemyMeta(e).kind) === -1;
    }
    window.playerCanEatCorpse = function (e) { return namiraCanEat(e) || werewolfCanEat(e); };
    window.playerEatCorpse = function (enemyId) {
        if (!window.CloudSync || !window.CloudSync.eatCorpseForSelf) return;
        const sess = window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const corpse = ((sess && sess.enemies) || []).find(e => e.id === enemyId);
        if (!corpse) return;
        const asWolf = werewolfCanEat(corpse), asNamira = namiraCanEat(corpse);
        const rank = parseInt(document.getElementById('faith-rank').value) || 1;
        window.CloudSync.eatCorpseForSelf(enemyId).then(() => {
            const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
            const msgs = [];
            if (asWolf) {
                const hearts = (playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.heartsEaten) || 0;
                const heal = hearts >= 20 ? 100 : 50;
                const hpEl = document.getElementById('cur-hp'), maxHp = parseInt(document.getElementById('max-hp').value) || 0;
                const cur = parseInt(hpEl.value) || 0, real = Math.max(0, Math.min(heal, maxHp - cur));
                hpEl.value = cur + real;
                msgs.push(`🐺 Пожирание трупа: +${real} ХП${hearts >= 20 ? ' («Жадность в еде»)' : ''}`);
                if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🐺 ${nm} пожирает труп «${corpse.name}» и восстанавливает ${real} ХП.`, nm);
            }
            if (asNamira && rank >= 2) {
                const cb = (godBonuses.namira[rank] || {}).cannibalBuff || 20;
                const eff = {
                    id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Намира', effectName: 'Трапеза Намиры',
                    description: `Каннибализм: +${cb} ХП и +${cb} маны (до конца дня)`,
                    turnsRemaining: Infinity, untilDayEnd: true, hp: cb, mp: cb
                };
                pushOrRefreshTimedEffect(eff);
                msgs.push('🍖 ' + eff.description);
                if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🍖 ${nm} пожирает труп во славу Намиры (ступень ${rank}).`, nm);
            } else if (asNamira && !asWolf) {
                msgs.push('🍖 Труп съеден. Сила каннибализма Намиры приходит со 2-й ступени веры.');
            }
            renderActiveEffects(); updateAll(); updateVitalBars(); saveLocalStorage(true);
            alert(msgs.join('\n'));
        }).catch(err => alert('Ошибка: ' + err.message));
    };

    // ===== ИСПРАВЛЕННАЯ updateAll =====
    function updateAll() {
        // Единый источник правды для уровня — characterLevel (растёт через «Проверку»).
        // Раньше поле #char-level на главной было отдельным, свободно редактируемым числом,
        // никак не связанным с characterLevel — отсюда рассинхрон между вкладками.
        const levelDisplayEl = document.getElementById('char-level');
        if (levelDisplayEl && levelDisplayEl.value != characterLevel) levelDisplayEl.value = characterLevel;

        const calcMod = (val) => Math.floor((val - 10) / 2);
        
        let strBase = parseInt(document.getElementById('stat-str').getAttribute('data-raw-stat')) || 10;
        let dexBase = parseInt(document.getElementById('stat-dex').getAttribute('data-raw-stat')) || 10;
        let conBase = parseInt(document.getElementById('stat-con').getAttribute('data-raw-stat')) || 10;
        let intBase = parseInt(document.getElementById('stat-int').getAttribute('data-raw-stat')) || 10;
        let wisBase = parseInt(document.getElementById('stat-wis').getAttribute('data-raw-stat')) || 10;
        let chaBase = parseInt(document.getElementById('stat-cha').getAttribute('data-raw-stat')) || 10;

        const race = document.getElementById('char-race').value;
        const sign = document.getElementById('char-sign').value;
        const lvl = parseInt(document.getElementById('char-level').value) || 1;
        const god = document.getElementById('faith-god').value;
        const rnk = parseInt(document.getElementById('faith-rank').value) || 1;

        const raceStats = getRaceStatBonuses(race);
        { const ovr = document.getElementById('orc-variant-row'); if (ovr) ovr.style.display = race === 'orc' ? '' : 'none'; }
        let str = strBase + (raceStats.str || 0);
        let dex = dexBase + (raceStats.dex || 0);
        let con = conBase + (raceStats.con || 0);
        let intel = intBase + (raceStats.int || 0);
        let wis = wisBase + (raceStats.wis || 0);
        let cha = chaBase + (raceStats.cha || 0);

        syncSignStatSelect();
        { const sb = getSignStatBonuses(sign); str += sb.str || 0; dex += sb.dex || 0; con += sb.con || 0; intel += sb.int || 0; wis += sb.wis || 0; cha += sb.cha || 0; } // «Маг»/«Тень» — одна характеристика на выбор
        (activeTimedEffects || []).forEach(e => { const b = e && e.statBonus; if (!b || !(e.turnsRemaining > 0 || e.turnsRemaining === Infinity)) return; str += b.str || 0; dex += b.dex || 0; con += b.con || 0; intel += b.int || 0; wis += b.wis || 0; cha += b.cha || 0; }); // временные бонусы к характеристикам (Кубок Хмеля)
        { const gS = getGearTextBonuses().stat; str += gS.str || 0; dex += gS.dex || 0; con += gS.con || 0; intel += gS.int || 0; wis += gS.wis || 0; cha += gS.cha || 0; } // «+3 Интеллекта» от снаряжения
        if (snVampire()) { const vb = VAMPIRE_STAT_BONUS, vhp = vampHungerStatPenalty(); str += vb.str - vhp; dex += vb.dex - vhp; con += vb.con - vhp; cha += vb.cha - vhp; intel -= vhp; wis -= vhp; }
        { const lwp = lichWeakenedPenalty(); if (lwp) { str -= lwp; dex -= lwp; con -= lwp; intel -= lwp; wis -= lwp; cha -= lwp; } } // «ослабленный лич»: −2 ко всем характеристикам // Вампиризм (Фракции.xlsx): +2 Хар, +1 Лов, +1 Сил

        const godB = mergeGearIntoGod(getGodBonuses(god, rnk));
        window.activeGodBonuses = godB;
        const godDescEl = document.getElementById('god-bonus-description');
        if (godDescEl) {
            const items = describeGodBonuses(god, rnk);
            godDescEl.innerHTML = items.length
                ? items.map(i => `<div>${i.auto ? '✅' : '📝'} ${escHtml(i.text)}</div>`).join('') +
                  '<div style="opacity:.6; margin-top:4px;">✅ — уже учтено в расчёте автоматически · 📝 — применяй сам/через мастера</div>'
                : '';
            if (AEDRA_AMULETS[god] && !wearsGodAmulet(god)) godDescEl.innerHTML = `<div style="color:#e67e22; margin-bottom:4px;">⚠ Благословение не действует: надень «${AEDRA_AMULETS[god]}» (слот ожерелья).</div>` + godDescEl.innerHTML;
            if (god === 'sanguine') {
                const t = SANGUINE_THRESHOLDS[rnk] || SANGUINE_THRESHOLDS[1];
                godDescEl.innerHTML += `<div style="margin-top:6px; padding:6px; border:1px solid var(--border-color); border-radius:4px;">
                    🍷 Выпито сегодня: лёгкого <strong>${godDay.light}</strong>, тяжёлого <strong>${godDay.heavy}</strong><br>
                    Для ступени ${rnk}: ${t.light}–${t.lightMax} лёгкого ИЛИ ${t.heavy}–${t.heavyMax} тяжёлого → ${sanguineActive(rnk) ? '<strong style="color:#2ecc71;">бонусы Сангвина активны</strong>' : '<span style="opacity:.7;">бонусы пока не активны</span>'}<br>
                    <button style="width:auto; padding:2px 8px; font-size:12px;" onclick="addDrink('light')">+ лёгкий</button>
                    <button style="width:auto; padding:2px 8px; font-size:12px;" onclick="addDrink('heavy')">+ тяжёлый</button>
                    <button style="width:auto; padding:2px 8px; font-size:12px;" onclick="addDrink('light',-1)">− лёгкий</button>
                    <button style="width:auto; padding:2px 8px; font-size:12px;" onclick="addDrink('heavy',-1)">− тяжёлый</button>
                    <button style="width:auto; padding:2px 8px; font-size:12px;" onclick="resetGodDay()">сброс</button></div>`;
            }
        }

        document.getElementById('stat-str').value = str;
        document.getElementById('stat-dex').value = dex;
        document.getElementById('stat-con').value = con;
        document.getElementById('stat-int').value = intel;
        document.getElementById('stat-wis').value = wis;
        document.getElementById('stat-cha').value = cha;

        document.getElementById('mod-str').innerText = `Мод: ${(calcMod(str) >= 0 ? '+' : '') + calcMod(str)}`;
        document.getElementById('mod-dex').innerText = `Мод: ${(calcMod(dex) >= 0 ? '+' : '') + calcMod(dex)}`;
        document.getElementById('mod-con').innerText = `Мод: ${(calcMod(con) >= 0 ? '+' : '') + calcMod(con)}`;
        document.getElementById('mod-int').innerText = `Мод: ${(calcMod(intel) >= 0 ? '+' : '') + calcMod(intel)}`;
        document.getElementById('mod-wis').innerText = `Мод: ${(calcMod(wis) >= 0 ? '+' : '') + calcMod(wis)}`;
        document.getElementById('mod-cha').innerText = `Мод: ${(calcMod(cha) >= 0 ? '+' : '') + calcMod(cha)}`;

        const raceSkillBonus = raceSkillBonuses[race] || {};
        skillNames.forEach((name, idx) => {
            const input = document.getElementById(`skill-${idx}`);
            if (input) {
                let raw = parseInt(input.getAttribute('data-raw-val')) || 10;
                let bonus = raceSkillBonus[name] || 0;
                input.value = Math.min(SKILL_MAX, raw + bonus + godSkillPoints(name)); // как в расчётах (getEffectiveSkillValue): потолок 100
            }
        });

        // === ПРИМЕНЯЕМ ПЕРКИ (пока закомментировано, чтобы не мешало) ===
        if (typeof window.applyPerks === 'function') {
             window.applyPerks();
             try { refreshEnhancedButtons(); } catch (e) { }
         }
         const perks = window.perkBonuses || {};

        // Кухня: показываем поле алхимического ингредиента только если открыт «Утончённый вкус»
        const kitchenAlchemyBlock = document.getElementById('kitchen-alchemy-block');
        if (kitchenAlchemyBlock) {
            kitchenAlchemyBlock.style.display = perks.cookingAddAlchemyIngredient ? 'block' : 'none';
        }
        // Раньше эти 4 рендера вызывались здесь БЕЗУСЛОВНО при каждом updateAll() — а многие
        // вызывающие места (например, обыск трупа) и так зовут renderInventoryList() явно ПЕРЕД
        // updateAll(), получая двойную перерисовку списка за одно логическое действие. Через
        // scheduleCoalesced() — несколько вызовов в пределах одного кадра схлопываются в один.
        if (typeof renderInventoryList === 'function' && document.getElementById('player-inventory-list')) {
            scheduleCoalesced('inv', renderInventoryList);
        }
        if (typeof renderSellList === 'function' && document.getElementById('sell-items-list')) {
            scheduleCoalesced('sell', renderSellList);
        }
        if (typeof updateLockInfo === 'function' && document.getElementById('lock-info')) {
            scheduleCoalesced('lock', updateLockInfo);
        }
        if (typeof renderLevelPanel === 'function' && document.getElementById('level-summary')) {
            scheduleCoalesced('level', renderLevelPanel);
        }
        if (typeof window.updateCombatDock === 'function') scheduleCoalesced('dock', window.updateCombatDock);

        const equipBonuses = (typeof getEquipmentEnchantBonuses === 'function') ? getEquipmentEnchantBonuses() : { hp: 0, mp: 0, weight: 0, armor: 0 };
        const activeEffectBonuses = (typeof getActiveEffectBonuses === 'function') ? getActiveEffectBonuses() : { hp: 0, mp: 0 };

        if (!document.getElementById('manual-hp-lock').checked) {
            let baseHp = con * 10;
            if (race === 'nord') { baseHp += 10 + (5 * (lvl - 1)); }
            if (godB.hp) baseHp += godB.hp;
            baseHp += diseaseMaxHpMod();
            baseHp += equipBonuses.hp;
            baseHp += activeEffectBonuses.hp;
            // Форма зверя даёт +50 хп; «Животная энергия» (27 сердец) — ещё +100 сверху.
            if (playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.isTransformed) {
                const hearts = playerSupernaturalState.werewolf.heartsEaten || 0;
                baseHp += 50 + (hearts >= 27 ? 100 : 0);
            }
            if (snLordForm()) baseHp += 120; // форма вампира-лорда: +120 ХП
            if (snLordForm() && snLordPerk('Сила Могилы')) baseHp += 50;
            document.getElementById('max-hp').value = Math.round(baseHp);
            // бафф здоровья спал или снята вещь с +ХП — текущие хп не могут остаться выше нового максимума (временное ХП сохраняется)
            if (activeEffectBonuses.hp < (window._stLastHpBonus || 0) || (typeof window._stLastEquipHp === 'number' && equipBonuses.hp < window._stLastEquipHp)) clampTempHp();
            window._stLastHpBonus = activeEffectBonuses.hp;
            window._stLastEquipHp = equipBonuses.hp;
        }

        if (!document.getElementById('manual-mp-lock').checked) {
            let baseMp = intel * 10;
            if (race === 'altmer') { baseMp += 20; }
            if (sign === 'atronach') { baseMp += 20 + Math.round(12 * (lvl - 1)); } // рост за уровень снижен на 40% (было 20/ур.): знак стал слишком сильным выше 20-го уровня
            if (sign === 'apprentice') { baseMp += 10 + (10 * (lvl - 1)); }
            // «Восполнение»: +25/50% от БАЗОВОГО манапула (Интеллект, раса, знак) — как в описании перка.
            // Раньше множился весь итог вместе с экипировкой, зельями, богом и «Силой Могилы».
            const ownMpPool = baseMp;
            if (godB.mp) baseMp += godB.mp;
            baseMp += periyteBuffs().mp; // Периайт: «Заумь»
            baseMp += equipBonuses.mp;
            baseMp += activeEffectBonuses.mp;
            if (perks.restorationManaBonus) baseMp += Math.round(ownMpPool * perks.restorationManaBonus);
            if (snLordForm()) baseMp += 100; // форма вампира-лорда: +100 маны
            baseMp += lichManaBonus(); // лич: +50 маны (низший) / +100 (высший)
            if (snLordForm() && snLordPerk('Сила Могилы')) baseMp += 50;
            document.getElementById('max-mp').value = Math.round(baseMp);
        }
        if (creationActive()) { // персонаж ещё создаётся — стартует с полными ХП и маной (раньше 100 из 170)
            document.getElementById('cur-hp').value = document.getElementById('max-hp').value;
            document.getElementById('cur-mp').value = document.getElementById('max-mp').value;
        }
        scheduleCoalesced('creation', renderCreationPanel);

        const helmArmorVal = parseInt(document.getElementById('slot-helm-armor').value) || 0;
        const chestArmorVal = parseInt(document.getElementById('slot-chest-armor').value) || 0;
        const glovesArmorVal = parseInt(document.getElementById('slot-gloves-armor').value) || 0;
        const bootsArmorVal = parseInt(document.getElementById('slot-boots-armor').value) || 0;
        const shieldArmorVal = parseInt(document.getElementById('slot-shield-armor').value) || 0;
        try { syncArmorClassSelect(); } catch (e) { }
        try { syncUnequipButtons(); } catch (e) { }
        const armorType = document.getElementById('eq-armor').value;

        // Джаггернаут (тяжёлая) / Ловкость в обороне (лёгкая): % к броне ТЯЖЁЛЫХ / ЛЁГКИХ частей —
        // каждая надетая часть получает бонус своего класса (в смешанном комплекте лёгкие части не берут тяжёлый перк).
        const bodySlotPieces = [['helmet', helmArmorVal], ['chest', chestArmorVal], ['gloves', glovesArmorVal], ['boots', bootsArmorVal]].map(([k, v]) => {
            const id = equippedSlots[k];
            const it = id ? playerInventory.find(i => i.itemId === id && i.count > 0) : null;
            return { item: it, armor: v, cls: it ? armorPieceClass(it) : null };
        });
        let heavyPct = perks.heavyArmorBonus || 0;
        let lightPct = perks.lightArmorBonus || 0;

        // Полный комплект — НАДЕТЫЕ вещи (из инвентаря) во всех четырёх слотах, одного класса с комплектом доспехов.
        // Перк «Полный комплект» (100) требует ещё и ОДИН материал («однотипная броня» по таблице талантов).
        // Тип брони: материал из базы, иначе — основа названия без слова слота («Железный шлем»/«Железные сапоги» → «желез»).
        const pieceMaterial = (x) => {
            const proto = x.material ? x : ((window.allItems || []).find(y => y.name === x.name) || {});
            if (proto.material) return String(proto.material).replace(/\s*\(.*$/, '').trim().toLowerCase().slice(0, 5);
            const words = String(x.name || '').toLowerCase().replace(/#stolen$/, '').split(/[\s\-]+/)
                .filter(w => w && !/^(шлем|капюшон|броня|кираса|перчатки|наручи|рукавицы|сапоги|ботинки|маска|корона|боевые|боевая|боевой|тяжелые|тяжёлые|легкие|лёгкие)$/.test(w));
            return (words[0] || '').slice(0, 5);
        };
        const hasFullBodySet = (() => {
            const its = bodySlotPieces.map(p => p.item);
            if (its.some(x => !x)) return false;
            return its.every(x => armorPieceClass(x) === armorType);
        })();
        const hasUniformBodySet = hasFullBodySet && (() => {
            const mats = bodySlotPieces.map(p => pieceMaterial(p.item));
            return !!mats[0] && mats.every(m => m === mats[0]);
        })();
        if (hasFullBodySet) {
            if (armorType === 'heavy') heavyPct += (perks.heavyFullSetBonus1 || 0) + (hasUniformBodySet ? (perks.heavyFullSetBonus2 || 0) : 0);
            if (armorType === 'light') lightPct += (perks.lightFullSetBonus1 || 0) + (hasUniformBodySet ? (perks.lightFullSetBonus2 || 0) : 0);
        }

        let bodyArmorTotal = 0;
        bodySlotPieces.forEach(p => {
            const pct = p.cls === 'heavy' ? heavyPct : p.cls === 'light' ? lightPct : 0;
            bodyArmorTotal += p.armor * (1 + pct);
        });
        bodyArmorTotal = Math.round(bodyArmorTotal);
        // «Повышение навыка: Тяжёлая/Лёгкая броня» (зачарование): +N единиц брони, пока надет комплект этого класса.
        if (armorType === 'heavy') bodyArmorTotal += Math.round(getSkillBoostPercent('Тяжелая броня'));
        if (armorType === 'light') bodyArmorTotal += Math.round(getSkillBoostPercent('Легкая броня'));
        // Без активной защитной стойки щит даёт только голую броню — бонусы перков
        // блокирования (Щитоносец и т.п.) применяются, только когда реально блокируешь им.
        const inDefensiveStance = document.getElementById('chk-defensive-stance').checked;
        const shieldArmorBonused = inDefensiveStance // «+15% эффективности блока» (Шлем Дозорного-дезертира) — вместе с перками блока
            ? Math.round(shieldArmorVal * (1 + (perks.shieldArmorBonus || 0) + getGearSpecialBonuses().blockEffPct / 100))
            : shieldArmorVal;

        let totalArmor = bodyArmorTotal + shieldArmorBonused +
                         (parseInt(document.getElementById('armor-buff').value) || 0);
        if (godB.armor) totalArmor += godB.armor;
        totalArmor += periyteBuffs().armor; // Периайт: «Каменная подагра»
        totalArmor += equipBonuses.armor;
        totalArmor += activeEffectBonuses.armor || 0;
        totalArmor += snWerewolfArmor(lvl); // форма вервольфа: 0 на 1 ур., +50 каждые 5 уровней
        totalArmor += sheathArmorBonus(); // утяжелённые ножны: +5 каждые (не лёгкая и не тяжёлая броня)
        document.getElementById('armor-total').innerText = totalArmor;

        // Сопротивления рядом с бронёй — то же самое, что реально вычитается из входящего урона
        // (computeTotalResistances уже читает armor-total, поэтому вызываем сразу после него).
        const resEl = document.getElementById('resistances-display');
        if (resEl && typeof computeTotalResistances === 'function') {
            const res = computeTotalResistances();
            const parts = [];
            if (res.physical) parts.push(`🛡️ Физ. ${res.physical}%`);
            if (res.fire) parts.push(`🔥 Огонь ${res.fire}%`);
            if (res.frost) parts.push(`❄️ Холод ${res.frost}%`);
            if (res.shock) parts.push(`⚡ Электр. ${res.shock}%`);
            if (res.poison) parts.push(`☠️ Яд ${res.poison}%`);
            if (res.disease) parts.push(`🤢 Болезни ${res.disease}%`);
            if (res.shout) parts.push(`📢 Крики ${res.shout}%`);
            if (res.arrow) parts.push(`🏹 Стрелы/болты ${res.arrow}%`);
            if (res.magic) parts.push(`✨ Магия ${res.magic}%`);
            resEl.textContent = parts.length ? parts.join(' · ') : 'Сопротивлений нет';
        }

        // Вес
        let weightFromItems = 0;
        weightFromItems += getInventoryTotalWeight();
        // «Упорная тренировка» / «Вторая кожа»: надетая тяжёлая/лёгкая броня ничего не весит и не замедляет.
        if ((armorType === 'heavy' && perks.heavyArmorWeightless) || (armorType === 'light' && perks.lightArmorWeightless)) {
            // одеяние — не броня: «Вторая кожа» его вес не убирает
            ['helmet', 'chest', 'gloves', 'boots'].forEach(function (sl) {
                const itW = equippedSlots[sl] ? playerInventory.find(i => i.itemId === equippedSlots[sl]) : null;
                if (itW) weightFromItems -= (itW.weight || 0);
            });
            weightFromItems = Math.max(0, weightFromItems);
        }

        let extraWeight = Math.max(0, parseInt(document.getElementById('extra-weight').value) || 0); // отрицательный «доп. вес» не уменьшает нагрузку
        if ((parseInt(document.getElementById('extra-weight').value) || 0) < 0) document.getElementById('extra-weight').value = 0;
        let currentWeight = weightFromItems + extraWeight;
        document.getElementById('weight-current').innerText = formatNumber(currentWeight);

        let manualWeightLock = document.getElementById('manual-weight-lock').checked;
        let maxWeight;
        if (manualWeightLock) {
            maxWeight = parseInt(document.getElementById('max-weight-input').value) || 50;
        } else {
            maxWeight = str * 5;
            maxWeight += equipBonuses.weight;
            maxWeight += activeEffectBonuses.weight || 0;
            maxWeight += (perks.extraCarryWeight || 0);
            if (snWerewolfForm()) maxWeight += 100; // форма вервольфа: +100 к переносимому весу
            if (snLordForm()) maxWeight += 50; // форма вампира-лорда: +50
            if (lichStage() >= 1) maxWeight += 50; // лич: +50 к переносимому весу
            if (ridingHorse()) maxWeight += (window.PET_RIDING || {}).carry || 100; // верхом: поклажа на лошади
            // Экипированный рюкзак (слот backpack) — фиксированный бонус к грузоподъёмности,
            // не зависит от зачарования (это свойство самого предмета, не чары на нём).
            if (equippedSlots.backpack) {
                const backpackItem = playerInventory.find(i => i.itemId === equippedSlots.backpack);
                if (backpackItem && typeof backpackItem.carryBonus === 'number') maxWeight += backpackItem.carryBonus;
            }
            document.getElementById('max-weight-input').value = maxWeight;
        }
        document.getElementById('weight-max-display').innerText = formatNumber(maxWeight);

        if (!document.getElementById('manual-speed-lock').checked) {
            let isOverweight = currentWeight > maxWeight;
            let speed = (sign === 'thief') ? 40 : 35;
            if (sign === 'steed') speed += 10;
            if (armorType === 'light' && !perks.lightArmorWeightless) speed -= 5;
            if (armorType === 'heavy' && !perks.heavyArmorWeightless) speed -= 10;
            if (armorType === 'light' && hasFullBodySet && perks.lightFullSetSpeedBonus) speed += perks.lightFullSetSpeedBonus;
            if (document.getElementById('chk-frost-region').checked) {
                speed -= (armorType === 'heavy') ? 15 : 10;
            }
            speed += activeEffectBonuses.speed || 0;
            if (snWerewolfForm()) speed += 20; // форма вервольфа: +20 к скорости
            if (snLordForm()) speed += 10; // форма вампира-лорда: +10 фт (и полёт на 10 фт)
            if (godB.speed) speed += godB.speed;
            speed += periyteBuffs().speed + diseasePenalties().speed; // «Костоломная лихорадка»: −5 фт (у Периайта — бафф)
            // Sistema: натянутая тетива — скорость −15 (перк «Егерь» снимает штраф).
            if (document.getElementById('chk-bow-drawn').checked && (document.getElementById('wep-ranged-type') || {}).value === 'bow' && !isPerkChecked('Егерь')) speed -= 15;
            speed += weatherMods().speed;
            speed += equipBonuses.speed || 0; // скорость от экипировки (текстовые эффекты)
            if (isPowerFlagActive('petrify')) speed = lichStage() >= 1 ? Math.floor(Math.max(0, speed) / 2) : 0; // «Окаменение»: скорость 0 (у лича — вдвое меньше)
            // Скорость в скрытности (Ноктюрнал) — условно, пока нет отдельного тумблера "крадусь
            // прямо сейчас", используем чекбокс скрытной атаки как показатель этого состояния.
            // Ноктюрнал: +10/15/20 фт, пока вас не видят (крадётесь — галочка скрытной атаки — или невидимы).
            if (gb('sneakSpeed') && (document.getElementById('chk-sneak-attack').checked || (activeTimedEffects || []).some(x => x.invisible && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity)))) {
                speed += gb('sneakSpeed');
            }
            speed += (typeof getActivePercentBonuses === 'function') ? getActivePercentBonuses().speed : 0;
            if (ridingHorse()) speed += (window.PET_RIDING || {}).speed || 15; // верхом
            if (isOverweight) {
                document.getElementById('overweight-alert').style.display = 'block';
                speed = 5;
            } else {
                document.getElementById('overweight-alert').style.display = 'none';
            }
            document.getElementById('val-speed').value = speed;
        }

        let wisForScrolls = wis;
        document.getElementById('val-scrolls-max').innerText = wisForScrolls;
        document.getElementById('val-scrolls').innerText = Math.max(0, wisForScrolls - scrollWisdomSpent);

        // Индикатор знака «Маг»: один бесплатный каст заклинания 1-го уровня в день.
        scheduleCoalesced('powers', renderPowersPanel);
        const mageStatusEl = document.getElementById('mage-sign-status');
        if (mageStatusEl) {
            mageStatusEl.innerHTML = sign === 'mage'
                ? (mageSignFreeUsed ? '<span style="opacity:.7;">🌟 Бесплатный каст 1 ур. на сегодня уже использован — вернётся в новый день.</span>' : '<span style="color:var(--accent-color);">🌟 Доступен 1 бесплатный каст заклинания 1 ур. сегодня.</span>')
                : (sign === 'apprentice'
                    ? `<span style="color:#e67e22;">⚠ Уязвимость к магии «${escHtml(APPRENTICE_VULN_TYPES[apprenticeVuln] || '—')}»: входящий урон этого типа +10%.</span> <a href="#" onclick="rerollApprenticeVuln(); return false;" style="font-size:12px; opacity:.7;">перебросить (по решению мастера)</a>`
                    : '');
        }

        // Скидка на стоимость заклинаний от надетых вещей: «Заклинания школы Разрушения на 10% дешевле» /
        // «Заклинания всех школ на 20% дешевле» (одеяния, капюшоны, робы Коллегии). «Усиленные заклинания … дешевле»
        // (перчатки магистра) — отдельная механика и сюда не входит. Складывается по всем надетым вещам.
        const gearCostCut = getGearSpellCostCut();
        document.querySelectorAll('.spell-card').forEach(card => {
            const finalCostInput = card.querySelector('.spell-final-cost');
            if (!finalCostInput) return;
            const container = card.closest('[id^="spells-"]');
            const school = container ? container.id.replace('spells-', '').replace('-list', '') : null;
            const select = card.querySelector('.spell-name-select');
            const isCustom = select && select.value === '__custom__';
            const name = isCustom ? (card.querySelector('.spell-name-custom') || {}).value : (select ? select.value : '');
            const baseInput = card.querySelector('.spell-base');
            const base = parseInt((baseInput || {}).value) || 0;
            finalCostInput.setAttribute('data-base', base);

            // Штраф брони на стоимость заклинаний (снимается перками «Боевой маг»/«Чувство маны»)
            let armorMult = 1.0;
            if (armorType === 'light' && !perks.lightArmorMageRobe) armorMult = 1.25;
            if (armorType === 'heavy' && !hasBattleMagePerk()) armorMult = lichPerk('bearer') ? 1.375 : 1.75; // «Тьма в доспехе»: штраф вдвое меньше

            // Скидка школы («Новичок/Ученик/Адепт/Эксперт школы Х» — -50% для заклинаний этого ранга)
            let schoolMult = 1.0;
            const tier = (school && !isCustom) ? getSpellTier(school, name) : null;
            if (tier) {
                const key = 'discount' + SCHOOL_DISCOUNT_PREFIX[school] + tier;
                if (perks[key]) schoolMult = 0.5;
            }

            // «Повышение навыка: Изменение» (таблица автора): ТОЛЬКО заклинания «Стук» стоят на (N/2)% дешевле,
            // «Трансформация Арктуса», «Телекинез» и ауры обнаружения — на N% дешевле. Остальные школы стоимость не меняют
            // (усиление силы/длительности заклинаний применяется при касте: см. getSchoolBoost / resolveSpellEffect / performSummon).
            let skillBoostMult = 1.0;
            if (school === 'alter') {
                const altBoost = getSkillBoostPercent('Изменение');
                if (altBoost > 0) {
                    const nm = String(name || '');
                    let cut = 0;
                    if (/^Стук(?![а-яё])/i.test(nm)) cut = altBoost / 2; // \b после кириллицы не работает — раньше Стук скидку не получал
                    else if (/^(Телекинез|Трансформация Арктуса|Обнаружение)/i.test(nm)) cut = altBoost;
                    if (cut > 0) skillBoostMult = Math.max(0.1, 1 - cut / 100);
                }
            }

            // Активные заклинания-баффы типа «Аура - Лёгкость» снижают стоимость каста напрямую.
            const percentBonuses = (typeof getActivePercentBonuses === 'function') ? getActivePercentBonuses() : { spellCostReduction: 0 };
            const activeBuffCostMult = Math.max(0.1, 1 - (percentBonuses.spellCostReduction || 0) / 100);

            // Бонусы бога на стоимость каста — общая скидка (spellCost/Джулианос,Хермеус,Мерунес)
            // + по конкретной школе (alterationCost/restorationCost/illusionCost).
            let godCostPct = gb('spellCost');
            if (school === 'alter') godCostPct += gb('alterationCost');
            if (school === 'restor') godCostPct += gb('restorationCost');
            if (school === 'illus') godCostPct += gb('illusionCost');
            const godCostMult = Math.max(0.1, 1 - godCostPct / 100);
            // Одеяния/капюшоны на стоимость заклинаний своей школы (и «всех школ»)
            const gearCutPct = (gearCostCut.all || 0) + ((school && gearCostCut[school]) || 0);
            const gearCostMult = Math.max(0.1, 1 - gearCutPct / 100);

            // Знак «Маг» — бесплатный каст заклинаний 1 уровня (было только текстом в описании,
            // нигде не применялось).
            const signFreeTier1 = (sign === 'mage' && tier === 1 && !mageSignFreeUsed);
            // Бретон, «Призыв духа»: «Вызов питомца» один раз за длительный отдых без затрат магии.
            const raceNow = (document.getElementById('char-race') || {}).value;
            const spiritFree = (raceNow === 'breton' && name === 'Вызов питомца' && !powersUsedToday['breton_spirit']);
            finalCostInput.dataset.freeReason = spiritFree ? 'spirit' : (signFreeTier1 ? 'mage' : '');

            const paidCost = Math.round(base * armorMult * schoolMult * skillBoostMult * activeBuffCostMult * godCostMult * gearCostMult);
            finalCostInput.dataset.paidCost = paidCost; // цена без бесплатного каста — для усиленного каста (он бесплатным не бывает)
            finalCostInput.value = (spiritFree || signFreeTier1) ? 0 : paidCost;

            // Полная разбивка в подсказке — раньше игрок видел только голую итоговую цифру,
            // без единого объяснения, откуда она взялась (штраф брони/скидка школы/зачарование
            // и зелья/активные баффы/бог — всё считалось молча).
            const breakdown = [];
            if (spiritFree) breakdown.push('«Призыв духа» бретона: бесплатно раз за отдых');
            else if (signFreeTier1) breakdown.push('знак «Маг»: одно заклинание 1 уровня в день бесплатно');
            if (armorMult !== 1) breakdown.push(`броня: ${armorMult > 1 ? '+' : ''}${Math.round((armorMult - 1) * 100)}%`);
            if (schoolMult !== 1) breakdown.push(`скидка школы (ранг ${tier}): −${Math.round((1 - schoolMult) * 100)}%`);
            if (skillBoostMult !== 1) breakdown.push(`зачарование/зелья на навык: −${Math.round((1 - skillBoostMult) * 100)}%`);
            if (activeBuffCostMult !== 1) breakdown.push(`активный бафф: −${Math.round((1 - activeBuffCostMult) * 100)}%`);
            if (godCostMult !== 1) breakdown.push(`бог: −${Math.round((1 - godCostMult) * 100)}%`);
            if (gearCostMult !== 1) breakdown.push(`одеяние/капюшон школы: −${Math.round((1 - gearCostMult) * 100)}%`);
            finalCostInput.title = breakdown.length ? `База ${base} → ${breakdown.join(', ')}` : `База ${base}, без модификаторов`;
        });

        const daedraList = ['boethiah','mephala','peryite','hermaeus','nocturnal','malacath','azura','meridia','mehrunes','sanguine','namira','vaermina','sheogorath','clavicus','molag','hircine'];
        if (daedraList.includes(god)) {
            document.getElementById('daedra-alert').style.display = 'block';
        } else {
            document.getElementById('daedra-alert').style.display = 'none';
        }

        // === ВЫЗЫВАЕМ БОЕВОЙ КАЛЬКУЛЯТОР (теперь он определён снаружи) ===
        updateCombat(str, dex);
        updateVitalBars();
        // панель билдов пересчитываем, только когда она открыта (она зависит от навыков и взятых перков)
        { const bp = document.getElementById('builds-panel'); if (bp && bp.open && typeof window.renderBuildsPanel === 'function') window.renderBuildsPanel(); }
        if (typeof window.renderWeaponSwapBox === 'function') { try { window.renderWeaponSwapBox(); } catch (e) { } } // подпись «✋ В руках»
        if (typeof window.renderSheathSlots === 'function') { try { window.renderSheathSlots(); } catch (e) { } }
        { const pp = document.getElementById('pets-summary'); if (pp && typeof window.renderPetsPanel === 'function') { try { window.renderPetsPanel(); } catch (e) { } } }
        // saveLocalStorage(); // если нужно сохранять, раскомментируй
    } // ← ЭТА СКОБКА ЗАКРЫВАЕТ updateAll()

    // Визуальные полоски ХП/МП — CSS для них (.bar-track/.bar-fill-hp/.bar-fill-mp) существовал
    // давно, но HTML-элементы, которые их используют, где-то потерялись при одном из редизайнов
    // панели — оставались только цифровые поля.
    function updateVitalBars() {
        const curHp = parseInt(document.getElementById('cur-hp').value) || 0;
        const maxHp = parseInt(document.getElementById('max-hp').value) || 1;
        const hpFill = document.getElementById('hp-bar-fill');
        if (hpFill) hpFill.style.width = Math.max(0, Math.min(100, (curHp / maxHp) * 100)) + '%';

        const curMp = parseInt(document.getElementById('cur-mp').value) || 0;
        const maxMp = parseInt(document.getElementById('max-mp').value) || 1;
        const mpFill = document.getElementById('mp-bar-fill');
        if (mpFill) mpFill.style.width = Math.max(0, Math.min(100, (curMp / maxMp) * 100)) + '%';
        try { checkDeath(); } catch (e) { /* deathState ещё не инициализирован при самой ранней отрисовке */ }
    }
