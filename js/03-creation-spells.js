
    // ===== Создание персонажа по правилам (Sistema 2.2) =====
    // Характеристики: база 8 + 15 свободных очков. Навыки: база 10 (+раса) + 30 свободных очков,
    // предыстория: +10 к основному и +5 к второстепенному навыку. Пока создание не завершено (1-й уровень),
    // ХП и мана держатся полными. Старые листы (без creationState) считаются уже созданными.
    const CREATION_STAT_BASE = 8, CREATION_STAT_POINTS = 15, CREATION_SKILL_BASE = 10, CREATION_SKILL_POINTS = 30;
    const CREATION_BG_MAIN = 10, CREATION_BG_SECOND = 5;
    const CREATION_STATS = [['str', 'Сила'], ['dex', 'Ловкость'], ['con', 'Телосложение'], ['int', 'Интеллект'], ['wis', 'Мудрость'], ['cha', 'Харизма']];
    var creationState = { done: false, skills: {}, bgMain: -1, bgSecond: -1 }; // var: сохранение может вызваться раньше этой строки
    function creationActive() { return !!creationState && !creationState.done && (characterLevel || 1) <= 1; }
    function creationRawStat(k) { const el = document.getElementById('stat-' + k); return el ? (parseInt(el.getAttribute('data-raw-stat')) || CREATION_STAT_BASE) : CREATION_STAT_BASE; }
    function creationStatSpent() { return CREATION_STATS.reduce((n, [k]) => n + Math.max(0, creationRawStat(k) - CREATION_STAT_BASE), 0); }
    function creationSkillSpent() { return Object.keys(creationState.skills || {}).reduce((n, i) => n + Math.max(0, creationState.skills[i] || 0), 0); }
    function applyCreationSkills() {
        skillNames.forEach((n, i) => {
            const el = document.getElementById('skill-' + i); if (!el) return;
            const v = CREATION_SKILL_BASE + ((creationState.skills || {})[i] || 0) + (i === creationState.bgMain ? CREATION_BG_MAIN : 0) + (i === creationState.bgSecond ? CREATION_BG_SECOND : 0);
            el.setAttribute('data-raw-val', Math.min(100, v));
        });
    }
    window.creationStat = function (k, d) {
        if (!creationActive()) return;
        const el = document.getElementById('stat-' + k); if (!el) return;
        const raw = creationRawStat(k);
        if (d > 0 && creationStatSpent() >= CREATION_STAT_POINTS) { alert('Все 15 свободных очков характеристик уже распределены.'); return; }
        if (d < 0 && raw <= CREATION_STAT_BASE) return;
        el.setAttribute('data-raw-stat', raw + d);
        updateAll(); saveLocalStorage();
    };
    window.creationSkill = function (i, d) {
        if (!creationActive()) return;
        const cur = (creationState.skills || {})[i] || 0;
        if (d > 0 && creationSkillSpent() >= CREATION_SKILL_POINTS) { alert('Все 30 свободных очков навыков уже распределены.'); return; }
        if (d < 0 && cur <= 0) return;
        creationState.skills = Object.assign({}, creationState.skills, { [i]: cur + d });
        applyCreationSkills(); updateAll(); saveLocalStorage();
    };
    window.creationBackground = function () {
        if (!creationActive()) return;
        const m = parseInt((document.getElementById('creation-bg-main') || {}).value), sec = parseInt((document.getElementById('creation-bg-second') || {}).value);
        creationState.bgMain = isNaN(m) ? -1 : m;
        creationState.bgSecond = (isNaN(sec) || sec === creationState.bgMain) ? -1 : sec;
        applyCreationSkills(); updateAll(); saveLocalStorage();
    };
    window.finishCreation = function () {
        if (!creationActive()) return;
        const leftS = CREATION_STAT_POINTS - creationStatSpent(), leftK = CREATION_SKILL_POINTS - creationSkillSpent();
        const warn = [];
        if (leftS > 0) warn.push(`не распределено ${leftS} очк. характеристик`);
        if (leftK > 0) warn.push(`не распределено ${leftK} очк. навыков`);
        if (creationState.bgMain < 0 || creationState.bgSecond < 0) warn.push('не выбраны навыки предыстории');
        if (!confirm('Завершить создание персонажа?' + (warn.length ? '\n\nВнимание: ' + warn.join(', ') + '. Потом это сделать будет нельзя.' : '\nДальше характеристики меняет только мастер, а навыки растут от успехов.'))) return;
        creationState.done = true;
        updateAll(); saveLocalStorage(true);
    };
    // Чистый лист старого образца (все характеристики 10, все навыки 10, 1-й уровень): переводим на правила создания.
    function restoreCreationState(data) {
        if (data && data.creationState && typeof data.creationState === 'object') {
            creationState = Object.assign({ done: false, skills: {}, bgMain: -1, bgSecond: -1 }, data.creationState);
            return;
        }
        const lvl = parseInt(data && data.characterLevel) || 1;
        const st = (data && Array.isArray(data.stats)) ? data.stats.map(x => parseInt(x)) : [];
        const sk = (data && Array.isArray(data.skills)) ? data.skills.map(x => parseInt(typeof x === 'object' && x ? x.raw : x)) : [];
        const pristine = lvl <= 1 && st.length === 6 && st.every(v => v === 10) && (!sk.length || sk.every(v => v === 10));
        if (pristine) {
            creationState = { done: false, skills: {}, bgMain: -1, bgSecond: -1 };
            CREATION_STATS.forEach(([k]) => { const el = document.getElementById('stat-' + k); if (el) el.setAttribute('data-raw-stat', CREATION_STAT_BASE); });
        } else creationState = { done: true, skills: {}, bgMain: -1, bgSecond: -1 };
    }
    function renderCreationPanel() {
        const box = document.getElementById('creation-panel'); if (!box) return;
        if (!creationActive()) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        const leftS = CREATION_STAT_POINTS - creationStatSpent(), leftK = CREATION_SKILL_POINTS - creationSkillSpent();
        const btn = (on, label) => `<button type="button" class="btn-secondary" style="width:auto; padding:2px 10px; margin:0;" onclick="${on}">${label}</button>`;
        const statsHtml = CREATION_STATS.map(([k, nm]) => `<div style="display:flex; align-items:center; gap:6px;"><span style="flex:1;">${nm}: <strong>${creationRawStat(k)}</strong></span>${btn(`creationStat('${k}', -1)`, '−')}${btn(`creationStat('${k}', 1)`, '+')}</div>`).join('');
        const skillsHtml = skillNames.map((n, i) => `<div style="display:flex; align-items:center; gap:6px;"><span style="flex:1; min-width:0;">${escHtml(n)}: <strong>${getEffectiveSkillValue(n)}</strong>${(creationState.skills || {})[i] ? ` <span style="opacity:.7;">(+${creationState.skills[i]})</span>` : ''}</span>${btn(`creationSkill(${i}, -1)`, '−')}${btn(`creationSkill(${i}, 1)`, '+')}</div>`).join('');
        const opt = (sel) => '<option value="">— выбери —</option>' + skillNames.map((n, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${escHtml(n)}</option>`).join('');
        box.innerHTML = `<div style="margin-top:10px; padding:10px; border:1px solid var(--accent-color, #c9a227); border-radius:6px; display:flex; flex-direction:column; gap:8px;">
            <strong>🧭 Создание персонажа</strong>
            <div style="font-size:14px; opacity:.85;">Характеристики: база 8 + 15 свободных очков (осталось <strong>${leftS}</strong>). Расовые бонусы и знак добавятся сверху.</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:4px 12px;">${statsHtml}</div>
            <div style="font-size:14px; opacity:.85;">Навыки: база 10 (+раса) + 30 свободных очков (осталось <strong>${leftK}</strong>).</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:4px 12px; font-size:14px;">${skillsHtml}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:14px;">
                <label for="creation-bg-main" style="margin:0;">Предыстория: основной навык (+10)</label><select id="creation-bg-main" style="width:auto;" onchange="creationBackground()">${opt(creationState.bgMain)}</select>
                <label for="creation-bg-second" style="margin:0;">второстепенный (+5)</label><select id="creation-bg-second" style="width:auto;" onchange="creationBackground()">${opt(creationState.bgSecond)}</select>
            </div>
            <button type="button" class="btn-success" onclick="finishCreation()">Завершить создание персонажа</button>
        </div>`;
    }

    function handleSkillChange(input, idx) {
        // Значение навыка игрок больше не вводит вручную (поле только для чтения): навык растёт от успехов
        // или меняется мастером. Если поле всё же изменили (старый браузер, правка через DOM) — откатываем.
        if (input && input.readOnly) { input.value = getEffectiveSkillValue(skillNames[idx]); return; }
        // Поле показывает ЭФФЕКТИВНОЕ значение (базовое + расовый бонус) — раньше тут читалось
        // то, что игрок видит в поле, и сохранялось КАК БУДТО это базовое значение, из-за чего
        // расовый бонус накапливался заново при каждой правке. Теперь вычитаем бонус обратно.
        const skillName = skillNames[idx];
        const race = document.getElementById('char-race').value;
        const bonus = (raceSkillBonuses[race] && raceSkillBonuses[race][skillName]) || 0;
        let typedValue = parseInt(input.value) || 10;
        let raw = typedValue - bonus;
        if (raw < 10) raw = 10;
        if (raw > 100) raw = 100; // лимит навыка — 100 (Задача A)
        input.setAttribute('data-raw-val', raw);
        updateAll();
        saveLocalStorage();
    }

    // Обработчик ручного изменения характеристики
    function handleStatChange(input) {
        if (input.readOnly || (characterLevel || 1) >= 2) { updateAll(); return; } // после 1-го уровня характеристики — только через мастера
        // Поле показывает эффективное значение (база + расовый бонус + бонус знака судьбы) —
        // как и с навыками, при ручном вводе нужно вычесть эти бонусы обратно, а не
        // сохранять введённое число как новую базу (иначе бонус накапливается заново).
        const statKey = input.id.replace('stat-', '');
        const race = document.getElementById('char-race').value;
        const sign = document.getElementById('char-sign').value;
        let bonus = getRaceStatBonuses(race)[statKey] || 0;
        bonus += getSignStatBonuses(sign)[statKey] || 0;
        // Вампиризм — как в updateAll: бонус минус штраф голода (голод бьёт по всем шести характеристикам).
        if (snVampire()) bonus += (VAMPIRE_STAT_BONUS[statKey] || 0) - vampHungerStatPenalty();
        bonus -= lichWeakenedPenalty();
        let typedValue = parseInt(input.value) || 10;
        let raw = typedValue - bonus;
        if (raw < 1) raw = 1;
        if (creationActive()) { // при создании: не ниже 8 и не больше 15 свободных очков в сумме
            const prevRaw = parseInt(input.getAttribute('data-raw-stat')) || CREATION_STAT_BASE;
            raw = Math.max(CREATION_STAT_BASE, raw);
            const room = CREATION_STAT_POINTS - (creationStatSpent() - Math.max(0, prevRaw - CREATION_STAT_BASE));
            if (raw - CREATION_STAT_BASE > room) { raw = CREATION_STAT_BASE + Math.max(0, room); alert('Свободных очков характеристик больше нет: всего 15 сверх базы 8.'); }
        }
        input.setAttribute('data-raw-stat', raw);
        updateAll();
        saveLocalStorage();
    }

    // Логика навигации по вкладкам
    // Коалесцирует повторные updateAll() через requestAnimationFrame — если пользователь быстро
    // кликает по нескольким вкладкам подряд (или программно переключает их в цикле), несколько
    // вызовов в пределах одного кадра схлопываются в один пересчёт вместо одного на каждый клик.
    // НЕ убирает сам updateAll() из openTab целиком (это была моя же защита от рассинхрона между
    // "Ветки перков" и "Проверка"/прокачкой) — просто откладывает его на 1 кадр и не дублирует.
    // Универсальная версия той же идеи, что и _updateAllScheduled ниже — по ключу, чтобы
    // несколько РАЗНЫХ отложенных функций (список инвентаря/продажи/замок/уровень) не мешали
    // друг другу, но повторные вызовы с ОДНИМ И ТЕМ ЖЕ ключом в пределах кадра схлопывались.
    const _coalescedScheduled = {};
    function scheduleCoalesced(key, fn) {
        if (_coalescedScheduled[key]) return;
        _coalescedScheduled[key] = true;
        requestAnimationFrame(() => {
            _coalescedScheduled[key] = false;
            fn();
        });
    }

    let _updateAllScheduled = false;
    function scheduleUpdateAll() {
        if (_updateAllScheduled) return;
        _updateAllScheduled = true;
        requestAnimationFrame(() => {
            _updateAllScheduled = false;
            if (typeof updateAll === 'function') updateAll();
        });
    }

    // Ленивая инициализация вкладки "Профессии" — 13 из ~27 render-вызовов при загрузке страницы
    // относились именно к ней (кухня/кузница/посохи/зачарование/алхимия), а игрок может вообще
    // не открыть эту вкладку в сессии. Остальные вкладки НЕ трогаю — риск случайно вычеркнуть
    // что-то, от чего зависит другая часть листа, выше пользы для менее тяжёлых разделов.
    const _tabInitDone = {};
    function initTab7IfNeeded() {
        if (_tabInitDone.tab7) return;
        _tabInitDone.tab7 = true;
        renderKitchenPot();
        renderSmithingList();
        renderEnchantItemSelect();
        renderStaffEffectSelect();
        updateStaffCalc();
        renderStaffList();
        renderWeaponChargeSelect();
        renderTemperSelect();
        renderMagicStaffSpellSelect();
        renderMagicStaffList();
        renderAlchEatSelect();
        renderAlchIngredientSelects();
        renderKnownIngredients();
        renderKnownRecipes();
        renderForageBars();
    }

    function openTab(ev, tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        ev.currentTarget.classList.add('active');
        // на телефоне полоса вкладок прокручивается — подвигаем её, чтобы выбранная вкладка была на виду
        try { ev.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (e) { }
        if (tabId === 'tab7') { initTab7IfNeeded(); renderForageBars(); }
        if (tabId === 'tab13' && typeof window.renderPlayerMap === 'function') { if (typeof window.markPlacesSeen === 'function') window.markPlacesSeen(); window.renderPlayerMap(true); }
        if (tabId === 'tab5' && typeof renderTradePanel === 'function') renderTradePanel();
        if (tabId === 'tab10' && typeof window.renderTheftVictims === 'function') window.renderTheftVictims();
        if (tabId === 'tab14') { if (typeof window.markJournalSeen === 'function') window.markJournalSeen(); renderDiary(); }
        // Пересчитываем всё заново при каждом переключении вкладки — защита от любых
        // рассинхронов между панелями (например «Ветки перков» и «Проверка»/прокачка). Через
        // scheduleUpdateAll(), не напрямую — см. пояснение выше.
        scheduleUpdateAll();
    }

    // Аккордеон вкладки «Профессии» — раскрывает одну профессию за раз, остальные сворачивает.
    // Универсальный аккордеон: groupId разделяет независимые группы разделов (профессии/школы магии),
    // чтобы открытие одной группы не сворачивало другую на другой вкладке.
    window.toggleAccordion = function (groupId, itemId) {
        const body = document.getElementById(groupId + '-body-' + itemId);
        const chevron = document.getElementById(groupId + '-chevron-' + itemId);
        if (!body) return;
        const willOpen = !body.classList.contains('open');
        document.querySelectorAll('.profession-body[id^="' + groupId + '-body-"]').forEach(el => {
            el.classList.remove('open');
            el.style.display = 'none';
        });
        document.querySelectorAll('[id^="' + groupId + '-chevron-"]').forEach(el => el.textContent = '▸');
        if (willOpen) {
            body.classList.add('open');
            body.style.display = 'block';
            if (chevron) chevron.textContent = '▾';
        }
    };

    // Гарантирует, что разделы аккордеона скрыты при самой первой отрисовке —
    // не полагаясь только на внешний CSS (на случай устаревшего кэша style.css).
    function initProfessionAccordion() {
        document.querySelectorAll('.profession-body').forEach(el => {
            el.classList.remove('open');
            el.style.display = 'none';
        });
    }

    window.toggleProfession = function (id) {
        window.toggleAccordion('prof', id);
        // Инвентарь мог измениться с прошлого открытия — перерисовываем, чтобы фильтр
        // "можно сковать сейчас" и счётчики материалов 0/N были актуальны.
        if (id === 'smithing' && typeof renderSmithingList === 'function') renderSmithingList();
    };

    // Проверка перка "Боевой маг" в ветке Тяжелой брони (индекс 7)
    // Раньше это была отдельная ручная проверка по жёстким координатам (skillIdx=4, perkIdx=7
    // — "Боевой маг" в дереве Тяжёлой брони). Если порядок перков в fullPerksManifest когда-
    // нибудь поменяется, тот вариант сломался бы молча. Теперь использует уже существующую
    // isPerkChecked() по ИМЕНИ перка — единый источник правды для "отмечен ли этот перк где-то".
    function hasBattleMagePerk() {
        return isPerkChecked('Боевой маг');
    }

    // Динамическое добавление заклинаний в кастомную книгу мага
    function isKnownSpellName(school, name) {
        const data = (window.spellsData && window.spellsData[school]) || {};
        for (const tier of [1, 2, 3, 4]) {
            if ((data[tier] || []).some(s => s.name === name)) return true;
        }
        return false;
    }

    function buildSpellOptions(school, selectedName) {
        const tierLabels = { 1: 'Новичок', 2: 'Ученик', 3: 'Адепт', 4: 'Эксперт' };
        const data = (window.spellsData && window.spellsData[school]) || {};
        // Раньше тут было `${!selectedName ? '' : ''}` — тернарка всегда давала пустую строку
        // независимо от условия, "своё название" не подсвечивалось при загрузке кастомного
        // заклинания из сейва (визуально маскировалось тем, что это первый <option> в списке,
        // и браузер по умолчанию показывает первый без selected — но полагаться на это нельзя).
        const isCustom = selectedName && !isKnownSpellName(school, selectedName);
        let html = `<option value="__custom__" ${isCustom ? 'selected' : ''}>✏️ Своё название (ввести вручную)</option>`;
        [1, 2, 3, 4].forEach(tier => {
            const list = data[tier] || [];
            if (!list.length) return;
            html += `<optgroup label="${tierLabels[tier]}">`;
            list.forEach(s => {
                const sel = s.name === selectedName ? 'selected' : '';
                html += `<option value="${escHtml(s.name)}" ${sel}>${escHtml(s.name)}</option>`;
            });
            html += `</optgroup>`;
        });
        return html;
    }

    function getSpellTier(school, name) {
        const data = (window.spellsData && window.spellsData[school]) || {};
        for (const tier of [1, 2, 3, 4]) {
            if ((data[tier] || []).some(s => s.name === name)) return tier;
        }
        return null;
    }

    const SCHOOL_DISCOUNT_PREFIX = { destr: 'Destr', restor: 'Restor', conj: 'Conj', illus: 'Illus', alter: 'Alter' };
    // Полный расчёт стоимости каста (штраф брони + скидка школы + зачарование/зелья на навык +
    // активные баффы + бог) живёт в updateAll() — там же теперь строится и разбивка в .title.
    // Раньше здесь была вторая, неполная версия (applySpellDiscounts, считала только скидку
    // школы) — мёртвый код, нигде не вызывалась, но могла запутать при будущей правке.

    function addCustomSpell(school, loadedData = null) {
        const id = loadedData ? loadedData.id : 'spell-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
        const seq = (loadedData && Number.isFinite(+loadedData.seq)) ? +loadedData.seq : ++_spellSeq;
        if (seq > _spellSeq) _spellSeq = seq;
        const name = loadedData ? loadedData.name : '';
        const baseCost = loadedData ? loadedData.baseCost : 30;
        const desc = loadedData ? loadedData.desc : 'Описание эффекта заклинания...';
        // Название, которого нет в списке школы (переименовано/удалено в данных), — это «своё название»: раньше выпадающий список
        // тогда сваливался на первый пункт и при следующем сохранении заклинание подменялось.
        const isCustomName = loadedData ? (loadedData.isCustom === true || !isKnownSpellName(school, name)) : false;

        const html = `
            <div class="spell-card" id="card-${id}" data-seq="${seq}" data-fav="${loadedData && loadedData.favorite ? 1 : 0}">
                <div style="font-size:11px; opacity:.65; margin-bottom:2px;">Школа: ${escHtml(SCHOOL_CODE_TO_SKILL[school] || school)}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px; margin-bottom:4px;">
                    <button type="button" class="st-fav-btn" id="fav-${id}" onclick="toggleSpellFavorite('${id}')" title="Избранное: попадает наверх списка заклинаний в боевой панели" style="width:auto; flex:0 0 auto; margin:0; padding:0 6px; background:transparent; border:none; font-size:20px; cursor:pointer; color:#e6b800;">${loadedData && loadedData.favorite ? '★' : '☆'}</button>
                    <select class="spell-name-select" style="width:55%; font-weight:bold; padding:2px;" disabled title="Заклинание выбирается при изучении (том или Коллегия) и не меняется" onchange="onSpellPicked('${id}', '${school}')">
                        ${buildSpellOptions(school, isCustomName ? null : name)}
                    </select>
                    <div style="width:40%; text-align:right; font-size:13px;">
                        База MP: <input type="number" value="${baseCost}" class="spell-base" style="width:46px; padding:1px; display:inline;" min="0" onchange="saveSpellsAndRefresh()">
                    </div>
                </div>
                <input type="text" value="${escHtml(name)}" class="spell-name-custom" placeholder="Название заклинания..." style="width:100%; font-weight:bold; padding:2px; margin-bottom:4px; display:${isCustomName || !name ? 'block' : 'none'};" onchange="saveSpellsAndRefresh()">
                <textarea class="spell-desc" rows="2" style="font-size:13px; margin-bottom:4px; padding:2px;" onchange="saveSpellsAndRefresh()">${desc}</textarea>
                <select class="spell-target-select" style="width:100%; font-size:13px; margin-bottom:4px; padding:2px;" onfocus="populateSpellTargetSelect(this)">
                    <option value="self">Цель: на себя</option>
                </select>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#cfc5b6; background:#111; padding:2px; border-radius:3px;">
                    <span>Каст: <input type="number" class="spell-final-cost" data-base="${baseCost}" value="${baseCost}" style="width:46px; padding:1px; display:inline;" readonly title="Цена считается автоматически (база, перки, броня)"> MP</span>
                    ${name === 'Равновесие' ? `<button class="btn" style="width:auto; margin:0; padding:2px 6px; font-size:12px; background:#7a2c2c; color:white;" onclick="castEquilibrium()" title="Конвертирует ХП в ману (100 ХП → 75 МП — не 1:1), не тратит обычную ману на каст">⚖️ Конвертировать ХП→МП</button>` :
                    `<button class="btn" style="width:auto; margin:0; padding:2px 6px; font-size:12px; background:#4e4537; color:white;" onclick="castCustomSpell('${id}', false)">Каст</button>
                    <button class="btn" style="width:auto; margin:0; padding:2px 6px; font-size:12px; background:#7a4e2c; color:white;" onclick="castCustomSpell('${id}', true)" title="х2 маны, использует 'Усиленный эффект' из описания">Усилен. каст</button>`}
                    ${name ? '' : `<button class="btn btn-danger" style="width:auto; margin:0; padding:2px 4px; font-size:12px;" onclick="deleteSpell('${school}', '${id}')" title="Пустая карточка (заклинание не выбрано) — можно убрать">Х</button>`}
                </div>
            </div>
        `;

        document.getElementById(`spells-${school}-list`).insertAdjacentHTML('beforeend', html);
        if (loadedData && isCustomName) {
            document.getElementById(`card-${id}`).querySelector('.spell-name-select').value = '__custom__';
        }
        if (name) lockSpellCard(document.getElementById(`card-${id}`));
        if (!loadedData) saveSpellsAndRefresh();
    }
    // Выученное заклинание — навсегда, как взятый перк: название, базовая цена и описание (из него считаются урон и
    // длительность) больше не правятся, кнопки удаления нет. Избранное (☆), цель и каст работают как раньше.
    function lockSpellCard(card) {
        if (!card) return;
        card.classList.add('st-spell-locked');
        const sel = card.querySelector('.spell-name-select'); if (sel) sel.disabled = true;
        ['.spell-name-custom', '.spell-base', '.spell-desc'].forEach(q => { const x = card.querySelector(q); if (x) { x.readOnly = true; x.title = 'Выученное заклинание не меняется'; } });
        const del = card.querySelector('.btn-danger[onclick^="deleteSpell"]'); if (del) del.remove();
    }

    window.onSpellPicked = function(id, school) {
        const card = document.getElementById(`card-${id}`);
        const select = card.querySelector('.spell-name-select');
        const customInput = card.querySelector('.spell-name-custom');
        if (select.value === '__custom__') {
            customInput.style.display = 'block';
            customInput.value = '';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = select.value;
            const data = (window.spellsData && window.spellsData[school]) || {};
            let found = null;
            [1, 2, 3, 4].forEach(tier => {
                (data[tier] || []).forEach(s => { if (s.name === select.value) found = s; });
            });
            if (found) {
                card.querySelector('.spell-base').value = found.baseCost;
                card.querySelector('.spell-final-cost').value = found.baseCost;
                card.querySelector('.spell-final-cost').setAttribute('data-base', found.baseCost);
                card.querySelector('.spell-desc').value = found.desc;
            }
        }
        saveSpellsAndRefresh();
    };

    // Перерисовывает книгу заклинаний из списка (облако/сейв/файл). Каждое заклинание — в try/catch: одно «битое» не обрывает остальные.
    function restoreCustomSpells(list) {
        if (!Array.isArray(list)) return;
        ['destr', 'restor', 'alter', 'illus', 'conj'].forEach(school => { const c = document.getElementById(`spells-${school}-list`); if (c) c.innerHTML = ''; });
        const sorted = list.filter(s => s && s.id && s.school).map((s, i) => Object.assign({}, s, { seq: Number.isFinite(+s.seq) ? +s.seq : i + 1 })).sort((a, b) => a.seq - b.seq);
        customSpells = []; _unrenderedSpells = []; _spellSeq = sorted.reduce((m, s) => Math.max(m, s.seq), 0);
        sorted.forEach(s => {
            try { addCustomSpell(s.school, s); customSpells.push(s); }
            catch (e) { console.warn('Не удалось показать заклинание «' + s.name + '» — оставлено в сейве:', e); _unrenderedSpells.push(s); customSpells.push(s); }
        });
        try { renderScrollSpellSelect(); if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect(); if (typeof renderMagicStaffSpellSelect === 'function') renderMagicStaffSpellSelect(); } catch (e) { /* селекты обновятся при updateAll */ }
    }

    function saveSpellsAndRefresh() {
        try { refreshEnhancedButtons(); } catch (e) { }
        // Кэш урона заклинаний (ключ — текст описания) корректен и без этого, т.к. функция чистая,
        // но при долгой правке описаний старые ключи копились бы бесконечно — чистим при каждом
        // сохранении книги (пересчёт дешёвый, ~2 вызова на заклинание).
        try { _spellDmgCache.clear(); } catch (e) { /* кэш ещё не объявлен (TDZ) на раннем этапе загрузки — ничего страшного */ }
        customSpells = [];
        const schools = ['destr', 'restor', 'alter', 'illus', 'conj'];
        schools.forEach(school => {
            const container = document.getElementById(`spells-${school}-list`);
            if (!container) return;
            const cards = container.querySelectorAll('.spell-card');
            cards.forEach(card => {
                const id = card.id.replace('card-', '');
                const select = card.querySelector('.spell-name-select');
                const isCustom = select.value === '__custom__';
                const name = isCustom ? card.querySelector('.spell-name-custom').value : select.value;
                customSpells.push({
                    id: id,
                    seq: parseInt(card.getAttribute('data-seq')) || 0,
                    favorite: card.getAttribute('data-fav') === '1',
                    school: school,
                    name: name,
                    isCustom: isCustom,
                    baseCost: parseInt(card.querySelector('.spell-base').value) || 0,
                    desc: card.querySelector('.spell-desc').value
                });
            });
        });
        // не нарисованные при загрузке заклинания не теряем
        _unrenderedSpells.forEach(s => { if (!customSpells.some(c => c.id === s.id)) customSpells.push(s); });
        customSpells.sort((a, b) => (a.seq || 0) - (b.seq || 0));
        localStorage.setItem('skyrim_custom_spells_v3_5', JSON.stringify(customSpells));
        saveLocalStorage(true);   // и в общий сейв персонажа (а значит в облако) — иначе заклинания жили только в этом браузере
        renderScrollSpellSelect();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        if (typeof renderMagicStaffSpellSelect === 'function') renderMagicStaffSpellSelect();
        updateAll();
    }

    // ☆/★ у заклинания: избранные идут первыми в боевой панели. Флаг хранится вместе с книгой заклинаний (customSpells[i].favorite) → сейв и облако.
    window.toggleSpellFavorite = function (id) {
        const card = document.getElementById('card-' + id); if (!card) return;
        const on = card.getAttribute('data-fav') !== '1';
        card.setAttribute('data-fav', on ? '1' : '0');
        const b = document.getElementById('fav-' + id); if (b) b.textContent = on ? '★' : '☆';
        saveSpellsAndRefresh();
        if (typeof updateCombatDock === 'function') updateCombatDock();
    };

    function deleteSpell(school, id) {
        const card = document.getElementById(`card-${id}`);
        if (!card) return;
        // Убрать можно только пустую карточку (из старых сейвов, где заклинание так и не выбрали) — выученное навсегда.
        if (card.classList.contains('st-spell-locked')) { alert('Выученное заклинание нельзя убрать из книги.'); return; }
        card.remove(); saveSpellsAndRefresh();
    }

    const SCHOOL_CODE_TO_SKILL = { destr: 'Разрушение', restor: 'Восстановление', conj: 'Колдовство', illus: 'Иллюзия', alter: 'Изменение' };

    // ========================================================================
    // УСИЛЕНИЕ НАВЫКОВ («Повышение навыка: X») — зачарования и зелья, таблица автора алхимии, колонка G.
    // Значение навыка НЕ растёт: N% превращается в конкретный бонус (урон оружия, куб скрытности, блок и т.д.).
    // ========================================================================
    function canonSkillKey(s) {
        return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();
    }
    // Из названия эффекта/зачарования получаем ключ навыка: «Повышение навыка:«Тяжёлая броня»» → «тяжелая броня»;
    // «Повышение искусства лучника» → «стрельба»; «Повышение искусства торговли» → «торговля».
    function skillOfBoostName(name) {
        if (!name) return null;
        const n = canonSkillKey(name);
        const m = n.match(/^повышение навыка:\s*(.+)$/);
        if (m) return m[1].trim();
        if (/^повышение искусства лучника/.test(n)) return 'стрельба';
        if (/^повышение искусства торговли/.test(n)) return 'торговля';
        return null;
    }
    function matchesSkillBoostEnchant(enchantName, skillName) {
        const k = skillOfBoostName(enchantName);
        return !!k && k === canonSkillKey(skillName);
    }

    function getGearSkillBonusPercent(skillName) {
        let total = 0;
        Object.keys(equippedSlots).forEach(slotKey => {
            const itemId = equippedSlots[slotKey];
            if (!itemId) return;
            const item = playerInventory.find(i => i.itemId === itemId);
            if (item && item.enchantment && matchesSkillBoostEnchant(item.enchantment.name, skillName) && typeof item.enchantment.value === 'number') {
                total += item.enchantment.value;
            }
        });
        return total;
    }

    function getPotionSkillBonusPercent(skillName) {
        let total = 0;
        activeTimedEffects.forEach(e => {
            if (e.turnsRemaining !== Infinity && !(e.turnsRemaining > 0)) return;
            if (matchesSkillBoostEnchant(e.effectName, skillName) && typeof e.value === 'number') total += e.value;
        });
        return total;
    }

    // Суммарное усиление навыка в процентах (экипировка + активные зелья).
    function getSkillBoostPercent(skillName) {
        return getGearSkillBonusPercent(skillName) + getPotionSkillBonusPercent(skillName);
    }
    const BOOSTABLE_SKILLS = ['одноручное оружие', 'двуручное оружие', 'скрытность', 'взлом', 'карманные кражи', 'блокирование',
        'кузнечное дело', 'торговля', 'тяжелая броня', 'легкая броня', 'стрельба', 'колдовство', 'разрушение', 'иллюзия',
        'восстановление', 'изменение', 'алхимия'];
    function getAllSkillBoosts() {
        const out = {};
        const armorType = (document.getElementById('eq-armor') || {}).value;
        BOOSTABLE_SKILLS.forEach(k => {
            // Бонусы тяжёлой/лёгкой брони действуют, только пока на тебе соответствующая броня.
            if (k === 'тяжелая броня' && armorType !== 'heavy') return;
            if (k === 'легкая броня' && armorType !== 'light') return;
            const v = getSkillBoostPercent(k);
            if (v) out[k] = Math.round(v * 100) / 100;
        });
        return out;
    }

    // ========================================================================
    // УСИЛЕНИЕ ШКОЛ МАГИИ (зачарование/зелье «Повышение навыка: Колдовство/Иллюзия/Восстановление/Изменение», колонка G таблицы автора).
    // Действует на заклинания, СКАСТОВАННЫЕ, пока усиление активно (уже идущие эффекты не меняются).
    //  Колдовство: призыв (атронахи, зомби, питомцы) держится на N% дольше; скелеты +N% ХП; призванное оружие +N% урона;
    //              ауры, барьеры и проклятия сильнее на N%; остальные заклинания дольше на N%.
    //  Иллюзия:    пороговый уровень заклинаний воздействия (страх, бешенство, спокойствие) +N%; остальные — дольше на N%.
    //  Восстановление: лечение +N%, урон +N% (считается в атаке), ауры и обереги сильнее на N%.
    //  Изменение:  «плоть» сильнее на N%, урон +N%, цены (см. карточку), остальные заклинания дольше на N%.
    // ========================================================================
    const SPELL_BOOST_STRENGTH = { conj: ['aura', 'barrier', 'curse'], restor: ['aura', 'ward'], alter: ['skin', 'barrier', 'absorb'] };
    const SPELL_BOOST_DURATION_SCHOOLS = ['conj', 'illus', 'alter'];
    function findSpellSchoolByName(name) {
        const data = window.spellsData || {};
        for (const sc of Object.keys(data)) {
            for (const t of Object.keys(data[sc] || {})) {
                if ((data[sc][t] || []).some(s => s.name === name)) return sc;
            }
        }
        return null;
    }
    function getSchoolBoost(school) {
        const sk = SCHOOL_CODE_TO_SKILL[school] || null;
        const pct = sk ? getSkillBoostPercent(sk) : 0;
        return { pct: pct > 0 ? pct : 0, mult: pct > 0 ? 1 + pct / 100 : 1, skill: sk };
    }
    function classifySpellForBoost(name, school) {
        const n = String(name || '');
        if (school === 'conj') {
            if (/аура/i.test(n)) return 'aura';
            if (/барьер/i.test(n)) return 'barrier';
            if (/Проклят|Хрупкость/.test(n)) return 'curse';
            return 'other';
        }
        if (school === 'restor') {
            if (/^Аура|^Дар силы/i.test(n)) return 'aura';
            if (/оберег/i.test(n)) return 'ward';
            return 'other';
        }
        if (school === 'alter') {
            if (/плоть/i.test(n)) return 'skin';
            if (/^Барьер$/i.test(n)) return 'barrier';
            if (/^Поглощение магии/i.test(n)) return 'absorb';
            return 'other';
        }
        return 'other';
    }
    function scaleSpellEffectNumbers(plain, percentEffects, mult) {
        return {
            plain: plain ? { key: plain.key, value: Math.round(plain.value * mult) } : null,
            percentEffects: (percentEffects || []).map(p => ({ type: p.type, value: Math.round(p.value * mult) }))
        };
    }
    // Управляющие заклинания: Иллюзия поднимает порог уровня цели, Колдовство усиливает проклятие.
    function scaleControlForBoost(spell, ctrl) {
        const out = Object.assign({}, ctrl);
        const sb = getSchoolBoost(spell.school);
        if (!sb.pct) return out;
        if (spell.school === 'illus') {
            out.desc = ctrl.desc.replace(/до (\d+) ур\./, (m, n) => `до ${Math.round(parseInt(n, 10) * sb.mult)} ур.`) + ` · Иллюзия +${sb.pct}%`;
        } else if (spell.school === 'conj' && ctrl.extra && typeof ctrl.extra.dmgPct === 'number') {
            const v = Math.round(ctrl.extra.dmgPct * sb.mult);
            out.extra = Object.assign({}, ctrl.extra, { dmgPct: v });
            out.desc = `Наносимый физ.урон врага ${v}% · Колдовство +${sb.pct}%`;
        } else if (spell.school === 'conj' && ctrl.extra && ctrl.extra.res) {
            const r2 = {}; Object.keys(ctrl.extra.res).forEach(k => { r2[k] = Math.round(ctrl.extra.res[k] * sb.mult); });
            out.extra = Object.assign({}, ctrl.extra, { res: r2 });
            out.desc = `${ctrl.desc.replace(/\(.*\)/, '').trim()} (физ. сопротивление ${r2.physical}%) · Колдовство +${sb.pct}%`;
        } else if (spell.school === 'alter' && ctrl.absorbMp) {
            out.absorbMp = Math.round(ctrl.absorbMp * sb.mult);
            out.desc = `Поглощает ${out.absorbMp} маны врага · Изменение +${sb.pct}%`;
        }
        return out;
    }


    // ===== Штраф к броскам и «положительные/отрицательные» эффекты =====
    function getActiveSkillRollBonus(skillLabel) {
        const k = canonSkillKey(skillLabel);
        if (!k) return 0;
        return diseaseSkillMod(k) + gearSkillRoll(k) + (k === 'скрытность' ? weatherMods().stealth : 0) + (activeTimedEffects || []).reduce((s, e) => s + (((e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && e.skillRollBonus && canonSkillKey(e.skillRollBonus.skill) === k) ? (e.skillRollBonus.value || 0) : 0), 0);
    }
    // Болезни работают механически: −2 к броскам своих навыков (у последователей Периайта — бафф +1/+2/+3 вместо штрафа);
    // Кровавая лихорадка — −10 к макс. здоровью (у Периайта +10/+20/+30).
    const DISEASE_SKILLS = {
        'Атаксия': ['одноручное оружие', 'взлом'],
        'Каменная подагра': ['тяжелая броня', 'легкая броня'],
        'Заумь': ['разрушение', 'восстановление', 'колдовство', 'иллюзия', 'изменение'],
        'Насморк Пелиниала': ['скрытность', 'карманные кражи']
    };
    function gearSkillRoll(k) { try { const t = getGearTextBonuses().skill; return t[k] || 0; } catch (e) { return 0; } }
    function activeDiseaseNames() {
        return (activeTimedEffects || []).filter(e => e && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && /^Болезнь:/.test(e.effectName || '')).map(e => e.effectName.replace(/^Болезнь:\s*/, '').trim());
    }
    // Периайт (таблица богов, ранги 1/2/3): болезни из таблицы дают свои баффы вместо штрафа.
    const PERIYTE_BUFFS = {
        'Заумь': { mp: [25, 50, 75] },
        'Разжижение мозга': { hp: [25, 50, 75] },
        'Костоломная лихорадка': { speed: [5, 10, 15] },
        'Хрипунец': { elemRes: [5, 10, 20] },
        'Атаксия': { roll: [0, 1, 2], skills: ['карманные кражи', 'взлом'] },
        'Каменная подагра': { weaponPct: [0, 10, 20], armor: [0, 50, 100] }
    };
    function periyteBuffs() {
        const out = { hp: 0, mp: 0, speed: 0, elemRes: 0, armor: 0, weaponPct: 0 };
        const mag = (typeof peryiteMagnitude === 'function') ? peryiteMagnitude() : 0;
        if (!mag) return out;
        [...new Set(activeDiseaseNames())].forEach(d => { const b = PERIYTE_BUFFS[d]; if (b) Object.keys(out).forEach(k => { if (b[k]) out[k] += b[k][mag - 1] || 0; }); });
        return out;
    }
    function diseaseSkillMod(k) {
        const mag = (typeof peryiteMagnitude === 'function') ? peryiteMagnitude() : 0;
        let t = 0;
        [...new Set(activeDiseaseNames())].forEach(d => {
            const pb = mag ? PERIYTE_BUFFS[d] : null;
            if (pb) { if (pb.roll && pb.skills.indexOf(k) !== -1) t += pb.roll[mag - 1] || 0; return; } // по таблице Периайта
            if ((DISEASE_SKILLS[d] || []).indexOf(k) !== -1) t += mag ? mag : -2;
        });
        return t;
    }
    function diseaseMaxHpMod() {
        const mag = (typeof peryiteMagnitude === 'function') ? peryiteMagnitude() : 0;
        return (activeDiseaseNames().filter(d => d === 'Кровавая лихорадка').length ? (mag ? mag * 10 : -10) : 0) + periyteBuffs().hp + diseasePenalties().hp;
    }
    // Вред трёх «новых» болезней (у последователя Периайта вместо него — бафф, см. PERIYTE_BUFFS).
    function diseasePenalties() {
        const out = { hp: 0, speed: 0, elemRes: 0 };
        if ((typeof peryiteMagnitude === 'function') && peryiteMagnitude()) return out;
        const ds = new Set(activeDiseaseNames());
        if (ds.has('Разжижение мозга')) out.hp -= 25;
        if (ds.has('Костоломная лихорадка')) out.speed -= 5;
        if (ds.has('Хрипунец')) out.elemRes -= 10;
        return out;
    }
    // Сопротивление ядам самого игрока (для выпитых ядов): потолок 85%, иммунитет — 100%.
    function selfPoisonResist() {
        try { return Math.max(0, window.StCombat.playerIncomingResist(computeTotalResistances(), 'poison')); } catch (e) { return 0; }
    }
    function getActiveRollPenalty(forAttack) {
        // «Полноценный отдых» (+1) — только к проверкам навыков, не к броску атаки.
        return (activeTimedEffects || []).reduce((s, e) => s + (((e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && !(forAttack && e.rollPenalty > 0 && (e.skillOnly || e.effectName === 'Полноценный отдых')) && e.rollPenalty) || 0), 0);
    }
    // Голод: −2 к кубам за каждый день без еды — к любому броску, а не только к атаке оружием
    // (атака оружием получает его через combat-bonuses.js, starve).
    function hungerRollPenalty() {
        const d = hungerPenaltyDays();
        return d > 0 ? -2 * d : 0;
    }
    function wearsItemNamed(name) {
        return !!(equippedSlots && Object.keys(equippedSlots).some(k => { const id = equippedSlots[k]; const it = id ? playerInventory.find(i => i.itemId === id && i.count > 0) : null; return it && String(it.name).replace(/\s*\[[^\]]+\]$/, '') === name; })); // зачарованная вещь («Колпак повара [Эффект]») — всё та же вещь
    }
    // Дни голода, которые идут в штраф: «Одение повара» — минус к кубам только со 2-го дня без еды.
    function hungerPenaltyDays() {
        const d = typeof daysWithoutFood === 'number' ? daysWithoutFood : (parseInt((document.getElementById('food-starve') || {}).value) || 0);
        return Math.max(0, d - (wearsItemNamed('Одение повара') ? 1 : 0));
    }
    function isNegativeTimedEffect(e) {
        if (!e) return false;
        if (e.fromGm || e.isPoisonEffect || e.polarity === 'negative' || e.dotHp || e.dotMp) return true;
        if (/^Болезнь:/.test(e.effectName || '')) return !peryiteMagnitude();
        if (e.rollPenalty < 0 || e.speed < 0 || e.dmgFlat < 0) return true;
        if (['paralysis', 'disarm', 'fear', 'frenzy', 'mute'].indexOf(e.statusFlag) !== -1) return true;
        if (e.res && typeof e.res === 'object' && Object.keys(e.res).some(k => e.res[k] < 0)) return true;
        return false;
    }
    // Снимает все положительные эффекты (Барьер разрушен); возвращает, сколько снято.
    function clearPositiveTimedEffects() {
        const before = activeTimedEffects.length;
        activeTimedEffects = activeTimedEffects.filter(isNegativeTimedEffect);
        return before - activeTimedEffects.length;
    }
    // Ауры призыва («Некроаура урона/защиты», «Аура защиты призыва») — сумма по активным эффектам.
    function getSummonAuras() {
        const t = { dmg: 0, armor: 0, resMagic: 0, resElem: 0, dmgPct: 0, resPct: 0 };
        (activeTimedEffects || []).forEach(e => {
            if (!e.summonAura || !(e.turnsRemaining > 0 || e.turnsRemaining === Infinity)) return;
            t.dmgPct += e.summonAura.dmgPct || 0; t.resPct += e.summonAura.resPct || 0;
            t.dmg += e.summonAura.dmg || 0; t.armor += e.summonAura.armor || 0;
            t.resMagic += e.summonAura.resMagic || 0; t.resElem += e.summonAura.resElem || 0;
        });
        return t;
    }
    // Защита призванного существа от вражеских атак: своей брони у призывов нет, только ауры призыва
    // (броня: 10 ед. = 1% физ. резиста, как у игрока). Синхронизируется в сессию — мастер считает урон по существу.
    function summonDefense() {
        const au = getSummonAuras();
        const cap = v => Math.max(0, Math.min(85, Math.round(v || 0)));
        const elem = au.resElem + au.resPct + au.resMagic;
        return { armor: au.armor, res: { physical: cap(au.armor / 10 + au.resPct), fire: cap(elem), frost: cap(elem), shock: cap(elem), magic: cap(au.resMagic), poison: 0 } };
    }
    window.getSummonDefense = summonDefense;


    // ===== «Дух огня/мороза/молнии» (Разрушение): наделяют ОРУЖИЕ дополнительным стихийным уроном =====
    // В описании «25/50» = обычный/усиленный каст; цена «30/50 маны ход» — маны каждый ход, пока дух держится.
    // Целью каста выбирается своё оружие (ближнее/дальнее). Это не зачарование и не требует камня душ.
    const WEAPON_SPIRITS = { 'Дух огня': { type: 'fire', icon: '🔥', word: 'огнём' }, 'Дух мороза': { type: 'frost', icon: '❄️', word: 'холодом' }, 'Дух молнии': { type: 'shock', icon: '⚡', word: 'электричеством' } };
    let lastSpellCastCost = 0;
    function findSpellDescByName(name) {
        const data = window.spellsData || {};
        for (const sc of Object.keys(data)) for (const t of Object.keys(data[sc] || {})) {
            const f = (data[sc][t] || []).find(s => s.name === name);
            if (f) return f.desc || '';
        }
        return '';
    }
    function parseSpiritNumbers(fullDesc) {
        const pair = (re) => { const m = (fullDesc || '').match(re); return m ? [parseInt(m[1]), parseInt(m[2])] : null; };
        return { dmg: pair(/(\d+)\/(\d+)\s*урона/i), drain: pair(/(\d+)\/(\d+)\s*по\s*мп/i), cost: pair(/стоимость\s+(\d+)\/(\d+)\s*маны/i) };
    }
    // Дух привязан к конкретному оружию: если надето другое — эффект снимаем (иначе он «висел» без пользы, а мана списывалась каждый ход).
    function dropOrphanedSpirits() {
        const orphan = (activeTimedEffects || []).filter(e => {
            if (!e.weaponSpirit || !e.weaponSpirit.weaponName) return false;
            const nameEl = document.getElementById('wep-' + e.weaponSpirit.slot + '-name');
            const cur = nameEl ? nameEl.value : '';
            return !!cur && cur !== e.weaponSpirit.weaponName;
        });
        if (!orphan.length) return 0;
        activeTimedEffects = activeTimedEffects.filter(e => orphan.indexOf(e) === -1);
        if (typeof alchToast === 'function') alchToast('🔮 Дух на оружии «' + escHtml(orphan[0].weaponSpirit.weaponName) + '» развеялся — ты сменил оружие. Перекасты заклинание на новое.');
        return orphan.length;
    }
    function getActiveWeaponSpirit(slot) {
        const e = (activeTimedEffects || []).find(x => x.weaponSpirit && x.weaponSpirit.slot === slot && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
        if (!e) return null;
        const nameEl = document.getElementById('wep-' + slot + '-name');
        const cur = nameEl ? nameEl.value : '';
        if (e.weaponSpirit.weaponName && cur && e.weaponSpirit.weaponName !== cur) return null; // оружие сменено — дух остался на прежнем
        return e;
    }
    // Накладывает удар духа: стихийный урон (с резистом цели) + мана/замедление/горение.
    // Возвращает {finalDmg (сумма по всем рукам), resist, hits, killed, newHp, enemy} — чтобы игрок видел урон духа в итоговом окне.
    function applySpiritHit(x, targetId, playerName) {
        const hits = Math.max(1, x.count || 1);
        const sum = { finalDmg: 0, resist: 0, hits: hits, killed: false, newHp: null, enemy: null, enemyName: '' };
        let p = Promise.resolve();
        for (let i = 0; i < hits; i++) {
            p = p.then(() => window.CloudSync.applyDamageToEnemy(targetId, x.dmg, playerName, x.logText + (hits > 1 ? ` (рука ${i + 1})` : ''), x.type, 0))
                .then(r => { if (r) { sum.finalDmg += r.finalDmg || 0; sum.resist = r.resist || 0; sum.newHp = r.newHp; sum.enemy = r.enemy; sum.enemyName = r.enemyName; if (r.killed) sum.killed = true; } });
            if (x.mpDrain) p = p.then(() => window.CloudSync.modifyEnemyVitals(targetId, 0, -x.mpDrain, playerName, `⚡ «${x.name}»: цель теряет ${x.mpDrain} маны`));
        }
        if (x.slow) p = p.then(() => window.CloudSync.applyStatusToEnemy(targetId, 'Замедление (Дух мороза)', `−${x.slow} фт скорости`, 2, playerName, { unique: true }));
        if (x.ignite) p = p.then(() => window.CloudSync.applyStatusToEnemy(targetId, 'Горение (Дух огня)', 'Цель подожжена — подожжённые несут дополнительный урон (решает мастер)', 3, playerName, { unique: true }));
        return p.then(() => sum);
    }

    // Плоская добавка к урону оружия от эффектов («Повреждение наносимого физ.урона» — отрицательная).
    // Зачарование «Усиление рукопашного боя» (перчатки, кольца, амулеты): + к урону удара без оружия.
    function gearUnarmedEnchant() {
        let sum = 0;
        ['gloves', 'ring', 'neck', 'helmet', 'chest', 'boots', 'shield', 'circlet'].forEach(sl => {
            const it = equippedSlots[sl] ? playerInventory.find(i => i.itemId === equippedSlots[sl]) : null;
            if (it && it.enchantment && it.enchantment.name === 'Усиление рукопашного боя') sum += Math.round(Number(it.enchantment.value) || 0);
        });
        return sum;
    }
    function getActiveUnarmedBonus() {
        return activeTimedEffects.reduce((s, e) => s + (((e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && e.unarmedDmg) || 0), 0);
    }
    function alertSafe(m) { try { alert(m); } catch (e) { } }
    // «Повышение навыка» Взлом/Карманные кражи/Скрытность: каждые 10% — +1 к кубам, сверх модификатора характеристики.
    function boostDiceFlat(pct) { return Math.max(0, Math.floor((parseFloat(pct) || 0) / 10)); }
    function getActiveDmgFlat() {
        return activeTimedEffects.reduce((s, e) => s + (((e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && e.dmgFlat) || 0), 0);
    }
    // Какой навык усиливает атаку данным оружием.
    function weaponBoostSkill(mode, wepType, isTwoHanded) {
        if (mode !== 'melee') return 'стрельба';
        if (wepType === 'unarmed') return null;
        return isTwoHanded ? 'двуручное оружие' : 'одноручное оружие';
    }
