
    // ========================================================================
    // АЛХИМИЯ
    // ========================================================================

    function getAlchemyPerkState() {
        const perks = window.perkBonuses || {};
        let gearBonus = 0;
        Object.keys(equippedSlots).forEach(slotKey => {
            const itemId = equippedSlots[slotKey];
            if (!itemId) return;
            const item = playerInventory.find(i => i.itemId === itemId);
            if (item && item.enchantment && item.enchantment.name === 'Повышение навыка: «Алхимия»' && typeof item.enchantment.value === 'number') {
                gearBonus += item.enchantment.value;
            }
        });
        return {
            alchemistRank: perks.alchemistRank || 0,
            hasHealer: !!perks.alchemyHealer,
            hasProvisor: !!perks.alchemyProvisor,
            hasPoisoner: !!perks.alchemyPoisoner,
            experimentatorRank: perks.alchemyExperimentatorRank || 0,
            gearBonus: gearBonus
        };
    }

    function getAlchemySkillValue() {
        return getSkillRawValue('Алхимия');
    }

    // Поиск по СВОЙСТВУ: учитываются только уже известные игроку свойства (неизвестные не выдаём).
    function alchNorm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
    function getKnownPropNames(name) {
        const data = (window.alchemyIngredients || {})[name];
        const known = knownIngredientProps[name] || [];
        return data ? data.effects.filter((e, i) => known[i]) : [];
    }
    // Значок эффекта: ✚ полезный, ☠ вредный (по polarity из alchemy-data.js).
    function alchEffectMark(name) {
        const eff = window.alchemyBaseEffects || {};
        const e = eff[name] || eff[String(name).split(':')[0].trim()];
        return e ? (e.polarity === 'negative' ? '☠ ' : (e.polarity === 'positive' ? '✚ ' : '')) : '';
    }
    function alchPropFilterMatch(name) {
        const q = alchNorm((document.getElementById('alch-prop-filter') || {}).value);
        if (!q) return true;
        return getKnownPropNames(name).some(p => alchNorm(p) === q);
    }
    function getAlchemyIngredientsInInventory() {
        return invStacksByBase(n => !!(window.alchemyIngredients && window.alchemyIngredients.hasOwnProperty(n)) && alchPropFilterMatch(n));
    }
    window.onAlchPropFilter = function () {
        renderAlchEatSelect();
        renderAlchIngredientSelects();
        renderKnownIngredients();
        const info = document.getElementById('alch-prop-filter-info');
        const q = (document.getElementById('alch-prop-filter') || {}).value;
        if (info) info.textContent = q ? `Показаны только ингредиенты с известным свойством «${q}» (в списках «Съесть», «Варка» и «Известные свойства»).` : '';
    };
    // Выпадающий список ИЗВЕСТНЫХ игроку свойств (неизвестные не выдаём) с числом подходящих ингредиентов в инвентаре.
    function renderAlchPropDatalist() {
        const sel = document.getElementById('alch-prop-filter');
        if (!sel) return;
        const prev = sel.value;
        const have = {};
        const all = new Set();
        Object.keys(knownIngredientProps || {}).forEach(n => {
            const inInv = countInInventory(n) > 0;
            getKnownPropNames(n).forEach(p => { all.add(p); if (inInv) have[p] = (have[p] || 0) + 1; });
        });
        if (prev) all.add(prev);
        sel.innerHTML = '<option value="">Любое свойство (показать всё)</option>' +
            Array.from(all).sort((x, y) => x.localeCompare(y, 'ru')).map(p =>
                `<option value="${escHtml(p)}">${alchEffectMark(p)}${escHtml(p)} — в инвентаре: ${have[p] || 0}</option>`).join('');
        sel.value = prev;
    }

    function renderAlchEatSelect() {
        const select = document.getElementById('alch-eat-select');
        if (!select) return;
        const items = getAlchemyIngredientsInInventory();
        select.innerHTML = items.length
            ? items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (есть: ${i.count})</option>`).join('')
            : '<option value="">Нет ингредиентов в инвентаре</option>';
        updateAlchEatInfo();
    }

    window.updateAlchEatInfo = function () {
        const select = document.getElementById('alch-eat-select');
        const infoEl = document.getElementById('alch-eat-info');
        if (!select || !infoEl) return;
        const name = select.value;
        const data = window.alchemyIngredients[name];
        if (!data) { infoEl.innerHTML = ''; return; }
        const known = knownIngredientProps[name] || [false, false, false, false];
        const knownCount = known.filter(Boolean).length;
        const perkState = getAlchemyPerkState();
        const eatN = Math.min(4, 1 + perkState.experimentatorRank);
        const eatNew = known.slice(0, eatN).filter(k => !k).length;
        infoEl.innerHTML = `Известно свойств: ${knownCount}/4. Поедание открывает первые ${eatN} (по порядку; сейчас новых: ${eatNew}) — остальные открываются при варке${eatN < 4 ? ' или с рангами «Экспериментатора»' : ''}.`;
    };
    document.getElementById('alch-eat-select') && document.getElementById('alch-eat-select').addEventListener('change', window.updateAlchEatInfo);

    // Эпик 4.6. Календарь: сейчас доступно/недоступно. Логика gatherIngredients не менялась — там уже есть фильтр зимы.
    window.renderSeasonNote = function () {
        const el = document.getElementById('gather-season-note'); if (!el) return;
        const s = getCurrentSeason();
        el.innerHTML = s.name === 'Зима'
            ? '❄️ Сейчас зима — не растёт: ' + Array.from(WINTER_UNAVAILABLE_INGREDIENTS).map(escHtml).join(', ') + '.'
            : s.icon + ' Сейчас ' + escHtml(s.name.toLowerCase()) + ' — все травы доступны. Зимой не растут: ' + Array.from(WINTER_UNAVAILABLE_INGREDIENTS).slice(0, 6).map(escHtml).join(', ') + ' и др.';
    };
    function seasonLockedTitle(name) { return (getCurrentSeason().name === 'Зима' && WINTER_UNAVAILABLE_INGREDIENTS.has(name)) ? 'Зимой не растёт' : ''; }

    // Собирает 1-3 ингредиента с учётом региона/погоды/времени суток, заданных мастером.
    // Ингредиенты-трофеи (части монстров) в дикой природе не попадаются — только с трупов.
    // ---------- Рыбалка (fish-data.js: положение каждой рыбы AE) ----------
    // Вода по региону/владению сессии: 'Подземелье' — подземные водоёмы; 'Горы' и север — ледяные воды;
    // остальное — тёплые озёра/реки (регион задаёт, что вероятнее). Погода: дождь/гроза = rain, иначе clear.
    // Удочки (аликрская/аргонианская) в системе пока нет — рыбалка идёт «голыми руками» без бонусов к размеру рыбы.
    const FISHING_COLD_HOLDS = ['Винтерхолд', 'Белый берег (Данстар)', 'Истмарк (Виндхельм)', 'Хьялмарк (Морфал)'];
    function resolveFishingWater(region, hold) {
        if (region === 'Подземелье') return 'underground';
        if (region === 'Горы') return 'freezing';
        if (region === 'Побережье' && FISHING_COLD_HOLDS.indexOf(hold) !== -1) return 'freezing';
        if (hold === 'Винтерхолд' || hold === 'Белый берег (Данстар)') return 'freezing';
        if (region === 'Болото') return 'lake';
        if (region === 'Равнина') return Math.random() < 0.6 ? 'stream' : 'lake';
        return Math.random() < 0.5 ? 'lake' : 'stream';
    }

    // Список (рыба, вес) для данной воды и погоды: редкость 6/3/1.
    function getFishingPool(water, weatherBucket) {
        const RW = { common: 6, uncommon: 3, rare: 1 };
        const pool = [];
        (window.fishData || []).forEach(f => {
            let w = 0;
            f.habitats.forEach(([hw, hweather, rarity]) => {
                if (hw === water && (hweather === 'any' || hweather === weatherBucket)) w = Math.max(w, RW[rarity] || 1);
            });
            if (w) pool.push({ fish: f, weight: w });
        });
        return pool;
    }

    window.goFishing = function () {
        const resultEl = document.getElementById('fishing-result');
        if (!useDailyAction('fish', resultEl)) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const region = (session && session.currentRegion) || null;
        const hold = (session && session.currentHold) || null;
        const weatherKey = (session && session.currentWeather) || 'clear';
        const rain = weatherKey === 'rain' || weatherKey === 'storm';
        const water = region ? resolveFishingWater(region, hold) : 'lake';
        const waterLabel = (window.FISH_WATER_LABELS || {})[water] || water;
        const where = `${waterLabel}, ${rain ? 'дождь' : 'без дождя'}${region ? '' : ' (регион мастер ещё не задал — считаем тёплым озером)'}`;
        const pool = getFishingPool(water, rain ? 'rain' : 'clear');
        if (!pool.length || Math.random() < 0.2) {
            resultEl.innerHTML = `<span style="opacity:.8;">🎣 Ничего не клюнуло. (${escHtml(where)})</span>`;
            return;
        }
        const total = pool.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total, pick = pool[0];
        for (const p of pool) { r -= p.weight; if (r <= 0) { pick = p; break; } }
        const info = (window.allItems || []).find(i => i.name === pick.fish.name) || {};
        addToInventory(pick.fish.name, pick.fish.name, 1, info.weight || pick.fish.weight || 0.25, info.category || 'Сырые продукты', '', { price: info.price || pick.fish.price || 1 });
        resultEl.innerHTML = `<strong>🎣 Поймано: ${escHtml(pick.fish.name)}</strong> <span style="opacity:.75;">(${escHtml(where)})</span>`;
        renderInventoryList();
        saveLocalStorage();
    };

    // ---------- Охота (hunt-data.js: небоевая дичь владения) ----------
    window.goHunting = function () {
        const resultEl = document.getElementById('hunting-result');
        if (!useDailyAction('hunt', resultEl)) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const region = (session && session.currentRegion) || null;
        const hold = (session && session.currentHold) || null;
        const where = `${hold || 'владение не задано — считаем обычным лесом и полями'}${region ? ', ' + region : ''}`;
        const res = window.rollHunt(hold, region);
        if (res.nothing) {
            resultEl.innerHTML = res.noGame
                ? `<span style="opacity:.8;">🏹 Под землёй дичи нет. (${escHtml(where)})</span>`
                : `<span style="opacity:.8;">🏹 Зверь ушёл — добычи нет. (${escHtml(where)})</span>`;
            return;
        }
        const got = [];
        res.drops.forEach(d => {
            const info = (window.allItems || []).find(i => i.name === d.name) || {};
            addToInventory(d.name, d.name, d.qty, info.weight || 0.5, info.category || 'Шкуры', '', { price: info.price || 1 });
            got.push(`${d.name} ×${d.qty}`);
        });
        resultEl.innerHTML = `<strong>🏹 Добыт зверь: ${escHtml(res.animal)}</strong><div>Добыча: ${got.map(escHtml).join(', ')}</div><span style="opacity:.75;">(${escHtml(where)})</span>`;
        renderInventoryList();
        saveLocalStorage();
    };

    window.gatherIngredients = function () {
        const resultEl = document.getElementById('gather-result');
        if (!useDailyAction('gather', resultEl)) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const region = (session && session.currentRegion) || null;
        const hold = (session && session.currentHold) || null;
        const period = (session && session.timePeriod) || 'День';
        const regionTags = region ? (INGREDIENT_REGION_TAGS[region] || []) : [];
        const holdTags = hold ? (INGREDIENT_HOLD_TAGS[hold] || []) : [];

        // Рыба — отдельным занятием (🎣 Рыбалка, с учётом воды/погоды); в сборе трав и грибов её быть не должно.
        const allNames = Object.keys(window.alchemyIngredients || {}).filter(n => !INGREDIENT_CORPSE_ONLY.has(n) && !(window.fishNames && window.fishNames.has(n)));
        const isWinter = getCurrentSeason().name === 'Зима';
        const weighted = [];
        allNames.forEach(n => {
            if (NIGHT_ONLY_INGREDIENTS.has(n) && period !== 'Ночь') return; // ночные не попадаются днём
            if (isWinter && WINTER_UNAVAILABLE_INGREDIENTS.has(n)) return; // Задача H: трава вымерзла
            // Вес от региона и владения складывается — "фирменный" ингредиент своего владения
            // в подходящем регионе попадается ещё чаще.
            let weight = 1;
            if (regionTags.includes(n)) weight += 2;
            if (holdTags.includes(n)) weight += 2;
            for (let i = 0; i < weight; i++) weighted.push(n);
        });
        if (!weighted.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет доступных ингредиентов для сбора сейчас.</span>'; return; }

        const count = Math.floor(Math.random() * 3) + 1; // 1-3
        const found = [];
        for (let i = 0; i < count; i++) {
            const name = weighted[Math.floor(Math.random() * weighted.length)];
            const info = window.alchemyIngredients[name];
            const qtyG = (window.perkBonuses || {}).alchemyHerbalistDouble ? 2 : 1; // перк «Травник»: по два ингредиента
            addToInventory(name, name, qtyG, info.weight || 0.1, 'Ингредиенты для алхимии', '', { price: info.price || 1 });
            found.push(qtyG > 1 ? name + ' ×' + qtyG : name);
        }
        const locLabel = region ? `${period}, ${region}${hold ? ', ' + hold : ''}` : `${period} (регион мастер ещё не задал — сбор общий)`;
        resultEl.innerHTML = `<strong>Найдено (${escHtml(locLabel)}):</strong> ${found.map(escHtml).join(', ')}`;
        renderInventoryList();
        saveLocalStorage();
    };

    window.eatIngredient = function () {
        const select = document.getElementById('alch-eat-select');
        const name = select.value;
        const resultEl = document.getElementById('alch-eat-result');
        const data = window.alchemyIngredients[name];
        if (!data) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери ингредиент.</span>'; return; }
        if (countInInventory(name) <= 0) { resultEl.innerHTML = '<span style="color:#e74c3c;">Ингредиента больше нет в инвентаре.</span>'; return; }

        const perkState = getAlchemyPerkState();
        // Съев ингредиент, игрок узнаёт ИМЕННО его первое свойство (а не «следующее неизвестное»), и по одному дополнительному
        // свойству (2-е, 3-е, 4-е) за каждый ранг «Экспериментатора». Остальные свойства открываются только при варке.
        const revealCount = Math.min(4, 1 + perkState.experimentatorRank);
        if (!knownIngredientProps[name]) knownIngredientProps[name] = [false, false, false, false];
        const known = knownIngredientProps[name];
        let revealed = [];
        for (let i = 0; i < revealCount; i++) {
            if (!known[i]) { known[i] = true; revealed.push(data.effects[i]); }
        }
        removeFromInventoryByName(name, 1);

        // Помимо изучения свойства, само первое (основное) свойство ингредиента срабатывает на съевшем —
        // на БАЗОВОЙ силе таблицы (навык 5, без перков и снаряжения: растут только сваренные зелья).
        const firstEffectName = data.effects[0];
        let effectNote = '';
        const raw = window.calcAlchemyEffect ? window.calcAlchemyEffect(firstEffectName, { skill: 5, mode: 'potion' }) : null;
        if (raw) {
            const notes = applyAlchemyEffectsToSelf([{ name: raw.name, magnitude: raw.magnitude, duration: raw.duration, unit: raw.unit, kind: raw.kind }], `${name} (сырой)`);
            effectNote = `<div style="opacity:.8; margin-top:2px;">⚡ Сработало основное свойство: ${escHtml(window.describeAlchemyEffect(raw))}${notes.length ? ' → ' + escHtml(notes.join('; ')) : ''}.</div>`;
        }

        if (revealed.length) {
            resultEl.innerHTML = `<div style="color:#2ecc71;">Съел «${escHtml(name)}». Узнал: ${revealed.map(escHtml).join(', ')}</div>${effectNote}`;
        } else {
            resultEl.innerHTML = `<div style="opacity:.8;">Съел «${escHtml(name)}». Все свойства этого ингредиента уже были известны.</div>${effectNote}`;
        }
        renderAlchEatSelect();
        renderKnownIngredients();
        updateAll();
        saveLocalStorage();
    };

    function renderAlchIngredientSelects() {
        renderAlchPropDatalist(); // счётчики «в инвентаре» в фильтре свойств
        const items = getAlchemyIngredientsInInventory();
        ['alch-ing-0', 'alch-ing-1', 'alch-ing-2'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const prev = select.value;
            select.innerHTML = '<option value="">—</option>' + items.map(i => {
                const kp = getKnownPropNames(i.itemId);
                return `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (есть: ${i.count})${kp.length ? ' — ' + escHtml(kp.join(', ')) : ''}</option>`;
            }).join('');
            if (items.some(i => i.itemId === prev)) select.value = prev;
        });
        updateBrewPreview();
    }

    // Контекст расчёта силы эффекта для текущего персонажа (навык, перки, зачарование на алхимию).
    function alchemyCtx(mode) {
        const ps = getAlchemyPerkState();
        return {
            skill: getAlchemySkillValue(), alchemistRank: ps.alchemistRank,
            hasProvisor: ps.hasProvisor, hasHealer: ps.hasHealer, hasPoisoner: ps.hasPoisoner,
            gear: ps.gearBonus, mode: mode || 'potion'
        };
    }

    // Правило автора: у ПЕРВЫХ ДВУХ ингредиентов должно быть хотя бы одно общее свойство (иначе варево не получится).
    // Все совпавшие у них свойства попадают в варево; третий добавляет только свои свойства, совпавшие с чьим-то из первых двух.
    function getSharedAlchemyEffects(name1, name2, name3) {
        return (typeof window.getSharedAlchemyEffectsFor === 'function') ? window.getSharedAlchemyEffectsFor(name1, name2, name3) : [];
    }

    function getBrewMode() {
        const el = document.getElementById('alch-brew-mode');
        return (el && el.value === 'poison') ? 'poison' : 'potion';
    }

    function computeBrewEffects(modeOverride) {
        const name1 = document.getElementById('alch-ing-0').value;
        const name2 = document.getElementById('alch-ing-1').value;
        const name3 = document.getElementById('alch-ing-2').value;
        // Каждый ингредиент в вареве — только один раз, без повторов.
        const picked = [name1, name2, name3].filter(Boolean);
        const hasDuplicate = new Set(picked).size !== picked.length;
        if (!name1 || !name2 || hasDuplicate) return { effects: [], name1, name2, name3, mode: modeOverride || getBrewMode() };
        const names = getSharedAlchemyEffects(name1, name2, name3);
        // Зелье или яд — решает игрок (если среди свойств есть и хорошие, и плохие); только хорошие → зелье, только плохие → яд.
        const pols = names.map(n => (window.alchemyBaseEffects[n] || {}).polarity);
        let mode = modeOverride || getBrewMode();
        if (pols.length && pols.every(p => p === 'positive')) mode = 'potion';
        else if (pols.length && pols.every(p => p === 'negative')) mode = 'poison';
        const ctx = alchemyCtx(mode);
        const effects = names.map(n => {
            const e = window.calcAlchemyEffect(n, ctx);
            if (e && e.magnitude !== null && gb('potionPower')) e.magnitude = Math.round(e.magnitude * (1 + gb('potionPower') / 100));
            return e;
        }).filter(Boolean);
        return { effects, name1, name2, name3, mode, mixed: pols.includes('positive') && pols.includes('negative') };
    }

    window.updateBrewPreview = function () {
        renderAlchGearInfo();
        const previewEl = document.getElementById('alch-brew-preview');
        const modeEl = document.getElementById('alch-brew-mode');
        const name1 = document.getElementById('alch-ing-0').value;
        const name2 = document.getElementById('alch-ing-1').value;
        const name3 = document.getElementById('alch-ing-2').value;
        const picked = [name1, name2, name3].filter(Boolean);
        if (!name1 || !name2) { previewEl.innerHTML = '<span style="opacity:.7;">Выбери минимум 2 ингредиента.</span>'; return; }
        if (new Set(picked).size !== picked.length) { previewEl.innerHTML = '<span style="color:#e74c3c;">⚠ Один и тот же ингредиент выбран дважды — так нельзя, выбери разные.</span>'; return; }
        const { effects, mode, mixed } = computeBrewEffects();
        if (!effects.length) { previewEl.innerHTML = '<span style="color:#e74c3c;">⚠ У первых двух ингредиентов нет общих свойств — варево не получится.</span>' + brewThirdHint(name1, name2, name3, effects); return; }
        if (modeEl) {
            modeEl.value = mode;
            modeEl.disabled = !mixed; // выбор есть, только когда в вареве и хорошие, и плохие свойства
        }
        const head = `<div style="margin-bottom:4px; opacity:.85;">${mode === 'poison' ? '☠ Яд (наносится на оружие)' : '🧪 Зелье (пьётся)'}${mixed ? ' — в вареве есть и хорошие, и плохие свойства, выбери тип выше' : ''}</div>`;
        previewEl.innerHTML = head + effects.map(e => {
            const bad = e.polarity === 'negative';
            return `<div>${bad ? '☠' : '🧪'} <strong>${escHtml(e.name)}</strong>: ${escHtml(window.describeAlchemyEffect(e).slice(e.name.length + 2) || '—')} <span style="opacity:.6;">(${formatNumber(e.price)} септ.)</span></div>`;
        }).join('') + brewThirdHint(name1, name2, name3, effects);
    };

    // Подсказка про третий ингредиент: что он добавил в варево — или почему не добавил ничего (и как поменять порядок).
    function brewThirdHint(name1, name2, name3, effects) {
        if (!name1 || !name2) return '';
        const sh = window.getSharedAlchemyEffectsFor;
        if (typeof sh !== 'function') return '';
        const note = (txt, color) => `<div style="margin-top:6px; font-size:13px; color:${color || 'inherit'}; opacity:${color ? 1 : .85};">${txt}</div>`;
        const pairOnly = sh(name1, name2, null);
        if (!pairOnly.length) {
            // у первых двух нет общего — смотрим, не совпадает ли третий с одним из них (тогда достаточно поменять порядок)
            if (!name3) return '';
            const alt = [[name1, name3, name2], [name2, name3, name1]].map(([x, y, z]) => ({ x, y, z, s: sh(x, y, null) })).filter(o => o.s.length)[0];
            return alt
                ? note(`💡 У «${escHtml(alt.x)}» и «${escHtml(alt.y)}» есть общее свойство («${escHtml(alt.s.join('», «'))}»). Правило: общее свойство должно быть у <strong>первых двух</strong> ингредиентов — поставь их первым и вторым, а «${escHtml(alt.z)}» третьим.`, '#e67e22')
                : note('Третий ингредиент тоже ни с кем не совпал.');
        }
        if (!name3) return '';
        const added = effects.map(e => e.name).filter(n => !pairOnly.includes(n));
        return added.length
            ? note(`➕ Третий ингредиент («${escHtml(name3)}») добавил свойства: ${added.map(escHtml).join(', ')}.`)
            : note(`ℹ Третий ингредиент («${escHtml(name3)}») ничего не добавил: ни одно его свойство не совпало со свойствами первых двух. Он не усиливает варево — лишь добавляет совпавшие свойства.`, '#e67e22');
    }

    function renderAlchGearInfo() {
        const el = document.getElementById('alch-gear-info');
        if (!el) return;
        const perkState = getAlchemyPerkState();
        el.textContent = `Навык: ${getAlchemySkillValue()} · Алхимик: ранг ${perkState.alchemistRank} · Провизор: ${perkState.hasProvisor ? 'да' : 'нет'} · Целитель: ${perkState.hasHealer ? 'да' : 'нет'} · Отравитель: ${perkState.hasPoisoner ? 'да' : 'нет'} · Зачарование на алхимию: +${perkState.gearBonus}%`;
    }

    window.brewPotion = function () {
        const resultEl = document.getElementById('alch-brew-result');
        const { effects, name1, name2, name3, mode, mixed } = computeBrewEffects();
        if (!name1 || !name2) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери минимум 2 ингредиента.</span>'; return; }
        const picked = [name1, name2, name3].filter(Boolean);
        if (new Set(picked).size !== picked.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Один и тот же ингредиент выбран дважды — выбери разные.</span>'; return; }
        const names = picked;
        if (names.some(n => countInInventory(n) <= 0)) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Каких-то из выбранных ингредиентов уже не хватает в инвентаре.</span>';
            return;
        }

        // Ингредиенты расходуются в любом случае — попытка есть попытка
        names.forEach(n => removeFromInventoryByName(n, 1));

        // Новые совпавшие свойства становятся известны сразу
        const effectNames = effects.map(e => e.name);
        names.forEach(n => {
            const data = window.alchemyIngredients[n];
            if (!data) return;
            if (!knownIngredientProps[n]) knownIngredientProps[n] = [false, false, false, false];
            data.effects.forEach((eff, idx) => {
                if (effectNames.includes(eff)) knownIngredientProps[n][idx] = true;
            });
        });
        renderKnownIngredients();

        if (!effects.length) {
            resultEl.innerHTML = '<div style="color:#e74c3c; font-weight:bold;">Варево провалилось — у первых двух ингредиентов не нашлось общих свойств. Ингредиенты потрачены впустую.</div>';
            renderAlchIngredientSelects();
            saveLocalStorage();
            return;
        }

        const totalPrice = effects.reduce((s, e) => s + e.price, 0);
        const desc = effects.map(e => window.describeAlchemyEffect(e)).join('; ');
        const isPoison = mode === 'poison';
        const itemName = (isPoison ? 'Яд' : 'Зелье') + ': ' + effects.map(e => e.name).join(' + ');
        const stored = effects.map(e => ({ name: e.name, magnitude: e.magnitude, duration: e.duration, unit: e.unit, kind: e.kind }));

        // Одинаковые зелья (то же название, эффекты и цена) складываются в одну стопку — раньше у каждого был уникальный id по времени.
        const potKey = i => [i.name, i.category, i.effect, i.price, JSON.stringify(i.alchemyEffects || null)].join('¦');
        const newKey = [itemName, isPoison ? 'Яд' : 'Зелье', desc, totalPrice, JSON.stringify(stored)].join('¦');
        const sameStack = playerInventory.find(i => potKey(i) === newKey);
        const brewId = sameStack ? sameStack.itemId : itemName + '#' + Date.now();
        addToInventory(brewId, itemName, 1, 0.25, isPoison ? 'Яд' : 'Зелье', desc, {
            alchemyEffects: stored, price: totalPrice,
            craftCost: craftCostOf(picked.map(n => ({ name: n, qty: 1 })), 1), craftKind: 'alch'
        });
        // Прежние разрозненные стопки одинаковых зелий (по 1 шт.) сливаем в одну.
        (function () {
            const seen = {};
            playerInventory = playerInventory.filter(i => {
                if (!i.alchemyEffects || !/^(Зелье|Яд)/.test(i.category || '') || i.craftKind !== 'alch') return true;
                const k = potKey(i), f = seen[k];
                if (f && !i.equipped && !f.equipped) { f.count += i.count; return false; }
                seen[k] = i; return true;
            });
            renderInventoryList();
        })();
        if (typeof logSkillSuccessByName === 'function') logSkillSuccessByName('Алхимия');
        // Запоминаем удачное сочетание (ключ — ингредиенты по алфавиту, чтобы порядок выбора не плодил дубли).
        knownBrewRecipes[picked.slice().sort().join('|')] = { ingredients: picked.slice(), effects: effects.map(e => e.name), itemName };
        renderKnownRecipes();
        { const hk = picked.slice().sort().join('|'); if (trackHabit('brewRecipe', hk) === 5) { if (confirm('Часто варишь это зелье. Добавить в избранное?')) { knownBrewRecipes[hk].favorite = true; alchToast('★ Рецепт в избранном'); } else habitDecline('brewRecipe', hk); } }

        let html = `<div style="color:#2ecc71; font-weight:bold;">✅ Получилось: «${escHtml(itemName)}» (${formatNumber(totalPrice)} септ.)</div>`;
        html += `<div style="opacity:.85; margin-top:4px;">${escHtml(desc)}</div>`;
        if (mixed) html += `<div style="opacity:.75; margin-top:4px; font-size:14px;">Все свойства остались в вареве — ты выбрал(а) «${isPoison ? 'яд' : 'зелье'}»: ${isPoison ? 'мажется на оружие, перк Отравителя усилил плохие свойства' : 'пьётся, перки Провизора/Целителя усилили хорошие свойства'}.</div>`;
        resultEl.innerHTML = html;

        renderAlchIngredientSelects();
        saveLocalStorage();
    };

    function renderKnownIngredients() {
        const listEl = document.getElementById('alch-known-list');
        if (!listEl) return;
        const search = (document.getElementById('alch-known-search').value || '').toLowerCase();
        renderAlchPropDatalist();
        const propQ = alchNorm((document.getElementById('alch-prop-filter') || {}).value);
        const names = Object.keys(window.alchemyIngredients || {}).filter(n => (n.toLowerCase().includes(search) || getKnownPropNames(n).some(p => alchNorm(p).indexOf(alchNorm(search)) !== -1 && alchNorm(search))) && (!propQ || alchPropFilterMatch(n))).sort();
        const groupMode = (document.getElementById('alch-known-group') || {}).value || 'prop';
        if (groupMode === 'prop') {
            // По свойствам: «Восстановление здоровья» → все ингредиенты, у которых оно уже известно игроку.
            const sq = alchNorm(search);
            const groups = {};
            names.forEach(n => getKnownPropNames(n).forEach(p => {
                if (propQ && alchNorm(p) !== propQ) return;
                if (sq && alchNorm(p).indexOf(sq) === -1 && alchNorm(n).indexOf(sq) === -1) return;
                (groups[p] = groups[p] || []).push(n);
            }));
            const props = Object.keys(groups).sort((x, y) => x.localeCompare(y, 'ru'));
            listEl.innerHTML = props.length ? props.map(p => {
                const rows = groups[p].map(n => {
                    const inv = playerInventory.find(i => i.itemId === n && i.count > 0);
                    const others = getKnownPropNames(n).filter(x => x !== p);
                    const lock = seasonLockedTitle(n);
                    return `<div class="party-row"${lock ? ' title="' + lock + '" style="opacity:.45;"' : ''}><div class="row-name"><strong>${escHtml(n)}</strong>${lock ? ' <span style="font-size:12px;">❄</span>' : ''}${inv ? ` <span style="color:#2ecc71; font-size:13px;">(есть: ${inv.count})</span>` : ''}</div><div style="font-size:13px; opacity:.8;">${others.length ? 'ещё: ' + others.map(escHtml).join(', ') : ''}</div></div>`;
                }).join('');
                const haveCnt = groups[p].filter(n => playerInventory.some(i => i.itemId === n && i.count > 0)).length;
                return `<details ${(propQ || sq) ? 'open' : ''} style="margin-bottom:4px;"><summary style="cursor:pointer;">${alchEffectMark(p)}<strong>${escHtml(p)}</strong> <span style="opacity:.6;">— ингредиентов: ${groups[p].length}${haveCnt ? `, в инвентаре: ${haveCnt}` : ''}</span></summary>${rows}</details>`;
            }).join('') : '<p style="opacity:.6; font-size:13px;">Пока нет известных свойств — съешь или свари ингредиенты, чтобы их узнать.</p>';
            return;
        }
        listEl.innerHTML = names.map(name => {
            const known = knownIngredientProps[name] || [false, false, false, false];
            const data = window.alchemyIngredients[name];
            const propsHtml = data.effects.map((e, i) => known[i]
                ? `<span style="color:#2ecc71;">${escHtml(e)}</span>`
                : `<span style="opacity:.4;">???</span>`
            ).join(', ');
            const lock2 = seasonLockedTitle(name);
            return `<div class="party-row"${lock2 ? ' title="' + lock2 + '" style="opacity:.45;"' : ''}><div class="row-name"><strong>${escHtml(name)}</strong>${lock2 ? ' <span style="font-size:12px;">❄</span>' : ''}</div><div style="font-size:14px;">${propsHtml}</div></div>`;
        }).join('');
    }
    window.renderKnownIngredients = renderKnownIngredients;

    // ========================================================================
    // ПРОВЕРКА КУБОВ
    // ========================================================================

    let diceHistory = [];

    // Какая характеристика отвечает за какой навык (правила явно называют лишь
    // Харизму→Красноречие и Мудрость→Колдовство/Восстановление/Зачарование;
    // остальное распределено по смыслу: Сила — силовые бои и тяжёлая экипировка,
    // Ловкость — меткость и ловкость рук, Интеллект — прикладные/боевые школы магии
    // и ремёсла, Мудрость — интуитивные школы магии и стряпня, Телосложение
    // навыков не даёт (по правилам оно пассивно).
    const SKILL_TO_STAT = {
        'Одноручное оружие': 'str', 'Двуручное оружие': 'str', 'Тяжелая броня': 'str', 'Блокирование': 'str',
        'Стрельба': 'dex', 'Легкая броня': 'dex', 'Скрытность': 'dex', 'Взлом': 'dex', 'Карманные кражи': 'dex',
        'Разрушение': 'int', 'Иллюзия': 'int', 'Изменение': 'int', 'Кузнечное дело': 'int', 'Алхимия': 'int',
        'Восстановление': 'wis', 'Колдовство': 'wis', 'Зачарование': 'wis', 'Кулинария': 'wis',
        'Красноречие': 'cha'
    };
    const STAT_LABELS = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };

    // В боевых проверках ничья (бросок игрока = сложность/бросок мастера) — кубы перекидываются.
    const COMBAT_SKILLS_TIE_REROLL = ['Одноручное оружие', 'Двуручное оружие', 'Стрельба', 'Разрушение', 'Блокирование'];

    function renderDiceSkillSelect() {
        const select = document.getElementById('dice-skill');
        if (!select) return;
        select.innerHTML = '<option value="">— без навыка (просто характеристика или голый кубик) —</option>' +
            skillNames.map((n, i) => `<option value="${i}">${escHtml(n)} (${STAT_LABELS[SKILL_TO_STAT[n]] || '—'})</option>`).join('');
        renderDiceQuickPresets();
    }

    // Быстрые пресеты для самых частых НЕбоевых проверок (боевые навыки проверяются через
    // отдельный инструмент атаки, не через этот бросок) — одним кликом выбирает навык (стата
    // подставляется сама через onDiceSkillPicked) и переводит фокус сразу на поле DC, вместо
    // "выбери навык → дождись подстановки статы → кликни DC → введи число".
    const DICE_QUICK_PRESETS = ['Скрытность', 'Взлом', 'Карманные кражи', 'Красноречие'];
    function renderDiceQuickPresets() {
        const box = document.getElementById('dice-quick-presets');
        if (!box) return;
        box.innerHTML = DICE_QUICK_PRESETS.map(name => {
            const idx = skillNames.indexOf(name);
            if (idx === -1) return '';
            return `<button style="width:auto; padding:4px 10px; font-size:13px;" onclick="pickDiceQuickPreset(${idx})">${escHtml(name)}</button>`;
        }).join('') + [['persuade', 'Убеждение'], ['threat', 'Угроза'], ['intimidate', 'Запугивание']].map(k =>
            `<button style="width:auto; padding:4px 10px; font-size:13px;" onclick="pickDiceSpeechKind('${k[0]}')">${k[1]}</button>`).join('');
    }
    window.pickDiceSpeechKind = function (kind) {
        const idx = skillNames.indexOf('Красноречие');
        if (idx === -1) return;
        window.pickDiceQuickPreset(idx);
        const k = document.getElementById('dice-speech-kind'); if (k) k.value = kind;
    };

    window.pickDiceQuickPreset = function (skillIdx) {
        const select = document.getElementById('dice-skill');
        if (!select) return;
        select.value = String(skillIdx);
        window.onDiceSkillPicked();
        const dcInput = document.getElementById('dice-dc');
        if (dcInput) dcInput.focus();
    };

    window.onDiceSkillPicked = function () {
        const skillIdx = document.getElementById('dice-skill').value;
        const statSelect = document.getElementById('dice-stat');
        if (skillIdx === '') return;
        const skillName = skillNames[parseInt(skillIdx)];
        const stat = SKILL_TO_STAT[skillName];
        if (stat) statSelect.value = stat;
        const thw = document.getElementById('dice-thief-wrap');
        if (thw) thw.style.display = skillName === 'Карманные кражи' ? '' : 'none';
        const kw = document.getElementById('dice-speech-kind-wrap');
        if (kw) { kw.style.display = skillName === 'Красноречие' ? '' : 'none'; if (skillName !== 'Красноречие') document.getElementById('dice-speech-kind').value = ''; }
        updateDiceStatInfo();
    };

    window.updateDiceStatInfo = function () {
        const statKey = document.getElementById('dice-stat').value;
        const infoEl = document.getElementById('dice-stat-info');
        if (!infoEl) return;
        if (!statKey) { infoEl.textContent = ''; return; }
        const statInput = document.getElementById('stat-' + statKey);
        const rawStat = statInput ? (parseInt(statInput.value) || 10) : 10;
        const mod = calcAbilityMod(rawStat);
        infoEl.textContent = `${STAT_LABELS[statKey]}: ${rawStat} → модификатор ${mod >= 0 ? '+' : ''}${mod}`;
    };

    function calcAbilityMod(val) {
        return Math.floor((val - 10) / 2);
    }

    window.rollDiceCheck = function () {
        const dieSize = parseInt(document.getElementById('dice-type').value) || 20;
        const statKey = document.getElementById('dice-stat').value;
        const skillIdx = document.getElementById('dice-skill').value;
        const dc = document.getElementById('dice-dc').value === '' ? null : parseInt(document.getElementById('dice-dc').value);
        const skillLabel = skillIdx !== '' ? skillNames[parseInt(skillIdx)] : '';

        let statMod = 0, statLabel = '';
        if (statKey) {
            const statInput = document.getElementById('stat-' + statKey);
            const rawStat = statInput ? (parseInt(statInput.value) || 10) : 10;
            statMod = calcAbilityMod(rawStat);
            statLabel = STAT_LABELS[statKey];
        }

        // Ошеломление/ослабление (Барьер разрушен и т.п.): штраф к кубам.
        let penaltyNote = '';
        let keyThiefAutoWin = false;
        const rollPen = getActiveRollPenalty();
        if (rollPen) { statMod += rollPen; penaltyNote = ` (${rollPen} ошеломление/ослабление)`; }
        { const hp = hungerRollPenalty(); if (hp) { statMod += hp; penaltyNote += ` (${hp} голод)`; } }
        const skillRollBonus = getActiveSkillRollBonus(skillLabel);
        if (skillRollBonus) { statMod += skillRollBonus; penaltyNote += ` (+${skillRollBonus} к кубам «${skillLabel}» от заклинания)`; }

        // Задача I.3: неиспользованная помощь союзника учитывается в ЛЮБОЙ следующий бросок
        // (не только в ответ на групповую проверку) и снимается сразу после использования.
        let helpNote = '';
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const myUid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const helpBuff = myUid && session && session.buffs ? session.buffs[myUid] : null;
        if (helpBuff && helpBuff.value) {
            statMod += helpBuff.value;
            helpNote = ` (+${helpBuff.value} помощь от ${helpBuff.fromName || 'союзника'})`;
            window.CloudSync.clearHelpBuff(myUid);
        }

        // Коллегия бардов: «Сила слова» (12+ песен) — +1 к убеждению и +1 к попытке скидки (Фракции.xlsx); Баллада союзника и Воодушевление — к любому броску.
        const speechKind = (skillLabel === 'Красноречие' && document.getElementById('dice-speech-kind')) ? document.getElementById('dice-speech-kind').value : '';
        const SPEECH_KIND_LABELS = { persuade: 'убеждение', threat: 'угроза', intimidate: 'запугивание', haggle: 'торг' };
        if ((speechKind === 'persuade' || speechKind === 'haggle') && bardIsMember() && bardRankOrders() >= 12) { statMod += 1; helpNote += ' (+1 «Сила слова»)'; }
        // «Хриплый голос» после Боевого клича: −1 к убеждению, +1 к угрозе (до конца дня).
        if ((speechKind === 'persuade' || speechKind === 'threat' || speechKind === 'intimidate') && activeTimedEffects.some(e => e.effectName === 'Хриплый голос' && (e.turnsRemaining === Infinity || e.turnsRemaining > 0))) {
            if (speechKind === 'persuade') { statMod -= 1; helpNote += ' (−1 «Хриплый голос»)'; }
            else { statMod += 1; helpNote += ' (+1 «Хриплый голос»)'; }
        }
        // Каджит, «Око страха»: преимущество на угрозы (бросаются два куба, берётся лучший).
        const speechAdvantage = (speechKind === 'threat' || speechKind === 'intimidate') && (document.getElementById('char-race') || {}).value === 'khajiit';
        { const sb = getSessionRollBonus(true); if (sb.value) { statMod += sb.value; helpNote += ' (' + sb.notes.join(', ') + ')'; } }
        // Перки: «Скрытность» (+1 за ступень), «Ловкие пальчики»/«Щипач»/«Ночной вор», «Запугивание».
        { const pbD = window.perkBonuses || {};
          if (skillLabel === 'Скрытность' && pbD.sneakDetectBonus) { statMod += pbD.sneakDetectBonus; helpNote += ` (+${pbD.sneakDetectBonus} перк «Скрытность»)`; }
          if (skillLabel === 'Карманные кражи') {
              const asleepD = document.getElementById('dice-thief-asleep'), keyD = document.getElementById('dice-thief-key');
              let thB = pbD.pickpocketBonus || 0;
              if (thB) helpNote += ` (+${thB} «Ловкие пальчики»/«Щипач»)`;
              if (asleepD && asleepD.checked && pbD.sleepTheftBonus) { thB += pbD.sleepTheftBonus; helpNote += ` (+${pbD.sleepTheftBonus} «Ночной вор»)`; }
              statMod += thB;
              if (keyD && keyD.checked && pbD.keyThiefAuto) { keyThiefAutoWin = true; helpNote += ' (🔑 «Ключник»: ключ достаётся всегда, кроме натуральной 1)'; }
          }
          if ((speechKind === 'intimidate' || speechKind === 'threat') && pbD.intimidateBonus) { statMod += pbD.intimidateBonus; helpNote += ` (+${pbD.intimidateBonus} «Запугивание»)`; }
        }

        // Гроза: вспышка молнии иногда выдаёт прячущегося (шанс 1 из 4 на бросок Скрытности) — −2.
        if (skillLabel && canonSkillKey(skillLabel) === 'скрытность') {
            const sessW = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
            if (sessW && sessW.currentWeather === 'storm' && Math.random() < 0.25) { statMod -= 2; helpNote += ' (⚡ вспышка молнии выдала тебя: −2)'; }
        }
        const isCombatSkill = skillLabel && COMBAT_SKILLS_TIE_REROLL.includes(skillLabel);
        const hasDc = dc !== null && !isNaN(dc);
        // «Повышение навыка» Скрытность / Взлом / Карманные кражи: каждые 10% — +1 к кубам (40% → +4 при любом выпавшем значении).
        const diceBoostPct = (skillLabel && ['скрытность', 'взлом', 'карманные кражи'].includes(canonSkillKey(skillLabel))) ? getSkillBoostPercent(skillLabel) : 0;

        // Ничья у боевых навыков — кубы перекидываются (не провал). Ограничение в 20 попыток
        // просто страхует от бесконечного цикла, на практике повторных ничьих почти не бывает.
        let roll, total, rerolls = 0, advRolls = null;
        do {
            roll = Math.floor(Math.random() * dieSize) + 1;
            if (speechAdvantage) { const r2 = Math.floor(Math.random() * dieSize) + 1; advRolls = [roll, r2]; roll = Math.max(roll, r2); }
            total = roll + statMod + boostDiceFlat(diceBoostPct);
            if (!(isCombatSkill && hasDc && total === dc)) break;
            rerolls++;
        } while (rerolls < 20);

        // Значение самого навыка в бросок НЕ идёт — только кубик + модификатор характеристики.
        let formulaParts = [advRolls ? `к${dieSize} с преимуществом («Око страха»): ${advRolls.join(' / ')} → ${roll}` : `к${dieSize}: ${roll}`];
        if (diceBoostPct) formulaParts.push(`усиление навыка ${diceBoostPct}% +${boostDiceFlat(diceBoostPct)}`);
        if (statKey) formulaParts.push(`${statLabel} ${statMod >= 0 ? '+' : ''}${statMod}`);
        let formulaText = (skillLabel ? skillLabel + (SPEECH_KIND_LABELS[speechKind] ? ' (' + SPEECH_KIND_LABELS[speechKind] + ')' : '') + ' — ' : '') + formulaParts.join(' + ') + helpNote + penaltyNote;
        if (rerolls > 0) formulaText += ` (перекинуто из-за ничьей: ${rerolls} раз)`;

        stAnimateDice(document.getElementById('dice-result-total'), total); // 6.3: итог показывается сразу в формуле/вердикте, крутятся только цифры крупного числа
        document.getElementById('dice-result-formula').textContent = formulaText;

        const verdictEl = document.getElementById('dice-result-verdict');
        let verdict = null;
        if (hasDc) {
            verdict = total >= dc || (keyThiefAutoWin && roll !== 1); // «Ключник»: почти всегда — кроме натуральной 1
            verdictEl.textContent = verdict ? (total >= dc ? `✅ Успех (нужно было ${dc})` : `✅ Успех — «Ключник» (нужно было ${dc})`) : `❌ Провал (нужно было ${dc})`;
            verdictEl.style.color = verdict ? '#2ecc71' : '#e74c3c';
        } else {
            verdictEl.textContent = '';
        }

        // Небоевые навыки качаются «за каждое успешное действие» — если это была проверка
        // конкретного небоевого навыка и она удалась, фиксируем это в прогресс.
        if (verdict === true && skillLabel && !isCombatSkill) {
            // сложность задаёт сам игрок → опыт только за серьёзные проверки и не больше лимита мастера (по умолчанию 5) раз в игровой день
            if (dc >= PRACTICE_MIN_DC && practiceXpAllowed(skillLabel)) logSkillSuccessByName(skillLabel);
        }

        diceHistory.unshift({ roll, dieSize, statLabel, statMod, skillLabel, total, dc, verdict, rerolls });
        diceHistory = diceHistory.slice(0, 20);
        renderDiceHistory();
    };

    function renderDiceHistory() {
        const el = document.getElementById('dice-history');
        if (!el) return;
        if (!diceHistory.length) { el.innerHTML = '<p style="opacity:.6;">Пока пусто.</p>'; return; }
        el.innerHTML = diceHistory.map(h => {
            let parts = [`к${h.dieSize}=${h.roll}`];
            if (h.statLabel) parts.push(`${h.statLabel} ${h.statMod >= 0 ? '+' : ''}${h.statMod}`);
            const skillPrefix = h.skillLabel ? `<span style="opacity:.7;">${escHtml(h.skillLabel)}: </span>` : '';
            const dcSuffix = (h.dc !== null && h.dc !== undefined && !isNaN(h.dc))
                ? ` <span style="color:${h.verdict ? '#2ecc71' : '#e74c3c'};">(Слож. ${h.dc} — ${h.verdict ? 'успех' : 'провал'})</span>` : '';
            const rerollSuffix = h.rerolls ? ` <span style="opacity:.6;">[перекид ×${h.rerolls}]</span>` : '';
            return `<div style="padding:3px 0; border-bottom:1px solid var(--border-color);">${skillPrefix}${parts.join(' + ')} = <strong style="color:var(--accent-color);">${h.total}</strong>${dcSuffix}${rerollSuffix}</div>`;
        }).join('');
    }

    // ========================================================================
    // ВЗЛОМ ЗАМКОВ
    // ========================================================================

    // Сложность и штраф по ступеням — нашлись прямо в подсказке навыка «Взлом» на листе
    // персонажа (использую эти цифры вместо своей прежней оценки 10/15/20/25 и флэт -5);
    // пороги навыка (0/25/50/75) взяты из реальных требований перков «Взломщик-...».
    const LOCK_TIERS = [
        { name: 'Новичок', dc: 9, penalty: -2, threshold: 0, perkKey: 'lockpickNoviceUnlocked' },
        { name: 'Ученик', dc: 12, penalty: -3, threshold: 25, perkKey: 'lockpickApprenticeUnlocked' },
        { name: 'Адепт', dc: 15, penalty: -4, threshold: 50, perkKey: 'lockpickAdeptUnlocked' },
        { name: 'Эксперт', dc: 17, penalty: -5, threshold: 75, perkKey: 'lockpickExpertUnlocked' }
    ];

    // «Золотоискатель» (Взлом): +30% золота из сундуков.
    window.takeChestGold = function () {
        const base = Math.max(0, parseInt((document.getElementById('chest-gold-base') || {}).value) || 0);
        const note = document.getElementById('chest-gold-note');
        if (!base) { if (note) note.textContent = 'Укажи, сколько золота в сундуке.'; return; }
        const bonus = (window.perkBonuses && window.perkBonuses.lockpickGoldBonus) ? Math.floor(base * 0.3) : 0;
        const goldEl = document.getElementById('char-gold');
        goldEl.value = (parseInt(goldEl.value) || 0) + base + bonus;
        document.getElementById('chest-gold-base').value = 0;
        if (note) note.textContent = `+${base + bonus} золота${bonus ? ` (из них +${bonus} от «Золотоискателя»)` : ''}.`;
        if (typeof updateAll === 'function') updateAll();
        saveLocalStorage();
    };

    window.updateLockInfo = function () {
        const tier = LOCK_TIERS[parseInt(document.getElementById('lock-tier').value)];
        const infoEl = document.getElementById('lock-info');
        if (!tier || !infoEl) return;
        const perks = window.perkBonuses || {};
        const lockpickSkill = getSkillRawValue('Взлом');
        const dexMod = calcAbilityMod(parseInt((document.getElementById('stat-dex') || {}).value) || 10);
        const hasPerk = !!perks[tier.perkKey];
        const belowThreshold = lockpickSkill < tier.threshold;
        const penalty = (belowThreshold && !hasPerk) ? tier.penalty : 0;
        const lockpickCount = countInInventory('Отмычка');

        let html = `Сложность: <strong>${tier.dc}</strong> · Ловкость мод: ${dexMod >= 0 ? '+' : ''}${dexMod}`;
        if (penalty) html += ` · <span style="color:#e74c3c;">Штраф без навыка: ${penalty}</span>`;
        else if (belowThreshold && hasPerk) html += ` · <span style="color:#2ecc71;">Штраф снят перком «Взломщик-${tier.name.toLowerCase()}»</span>`;
        html += `<br>Отмычек в инвентаре: <strong>${lockpickCount}</strong>`;
        if (hasPerk && (tier.perkKey === 'lockpickAdeptUnlocked' || tier.perkKey === 'lockpickExpertUnlocked') && perks.lockpickGoldBonus) {
            html += `<br><span style="opacity:.7;">🪙 «Золотоискатель»: +30% золота из сундуков (кнопка «Забрать» ниже)</span>`;
        }
        if (perks.lockpickTreasureBonus) {
            html += `<br><span style="opacity:.7;">💎 «Охотник за сокровищами»: +50% шанс особого лута (на усмотрение мастера)</span>`;
        }
        if (perks.lockpickSilent) {
            html += `<br><span style="opacity:.7;">🤫 «Умелые ручки»: взлом бесшумный</span>`;
        }
        if (perks.lockpickWaxKey) {
            html += `<br><span style="opacity:.7;">🗝 «Восковой слепок»: если у замка есть ключ — после взлома автоматически получаешь его дубликат</span>`;
        }
        infoEl.innerHTML = html;
    };

    // "Стук N" открывает без броска замки сложности N и ниже (N-1 в индексах LOCK_TIERS, см.
    // выше): Стук 1→только Новичок(0), Стук 2→Новичок+Ученик(0-1), и т.д. Берём САМЫЙ СИЛЬНЫЙ
    // "Стук", который знает игрок — нет смысла нарочно кастовать более слабый вариант.
    window.castKnockSpell = function () {
        const lockTierIdx = parseInt(document.getElementById('lock-tier').value);
        const resultEl = document.getElementById('knock-result');
        const knownKnocks = (customSpells || []).filter(s => /^Стук \d$/.test(s.name));
        if (!knownKnocks.length) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Не знаешь ни одного «Стука».</span>';
            return;
        }
        // те же проверки, что у каста с карточки: руки, Немота/Паралич, действие хода в бою
        { const hb = castBlockReason(); if (hb) { alert(hb); return; } }
        if (!castMuteCheck() || !combatActionAllowed('cast')) return;
        knownKnocks.sort((a, b) => parseInt(b.name.slice(-1)) - parseInt(a.name.slice(-1)));
        const spell = knownKnocks[0];
        const spellRank = parseInt(spell.name.slice(-1));
        const costInput = document.querySelector(`#card-${spell.id} .spell-final-cost`);
        const finalCost = costInput ? (parseInt(costInput.value) || 0) : (spell.baseCost || 0);
        const curMpEl = document.getElementById('cur-mp');
        const curMp = parseInt(curMpEl.value) || 0;
        if (finalCost > curMp) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">Не хватает маны: нужно ${finalCost}, есть ${curMp}.</span>`;
            return;
        }
        consumeMageSignFreeCast(costInput);
        curMpEl.value = curMp - finalCost;
        markCombatAction('attack');
        updateVitalBars();
        saveLocalStorage();
        const success = spellRank >= lockTierIdx + 1;
        const lockName = LOCK_TIERS[lockTierIdx].name;
        if (success) {
            resultEl.innerHTML = `<span style="color:#2ecc71;">✅ «${spell.name}» легко открывает замок уровня «${lockName}»! (−${finalCost} маны)</span>`;
        } else {
            resultEl.innerHTML = `<span style="color:#e74c3c;">❌ Магия скользит по замку — «${spell.name}» слишком слаб для «${lockName}». Мана потрачена впустую. (−${finalCost} маны)</span>`;
        }
    };

    window.attemptLockpick = function () {
        const tier = LOCK_TIERS[parseInt(document.getElementById('lock-tier').value)];
        const resultEl = document.getElementById('lock-result');
        const lockpickCount = countInInventory('Отмычка');
        if (lockpickCount <= 0) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Нет отмычек в инвентаре.</span>';
            return;
        }
        const perks = window.perkBonuses || {};
        const lockpickSkill = getSkillRawValue('Взлом');
        const dexInput = document.getElementById('stat-dex');
        const dexMod = calcAbilityMod(dexInput ? (parseInt(dexInput.value) || 10) : 10);
        const hasPerk = !!perks[tier.perkKey];
        const belowThreshold = lockpickSkill < tier.threshold;
        const penalty = (belowThreshold && !hasPerk) ? tier.penalty : 0;

        const roll = Math.floor(Math.random() * 20) + 1;
        // «Повышение навыка: Взлом»: каждые 10% — +1 к кубам.
        const lockBoostPct = getSkillBoostPercent('Взлом');
        const lockBoost = boostDiceFlat(lockBoostPct);
        // Как у кражи и обычной проверки: снаряжение/зелья/болезни к кубам «Взлома», ошеломление, голод, баллада/воодушевление.
        const sgn = v => (v >= 0 ? ' + ' : ' − ') + Math.abs(v);
        const lockParts = [];
        let lockMods = 0;
        const addL = (v, label) => { if (v) { lockMods += v; lockParts.push(sgn(v) + ' (' + label + ')'); } };
        addL(getActiveSkillRollBonus('Взлом'), 'снаряжение/зелья/болезни');
        addL(getActiveRollPenalty(), 'ошеломление/ослабление');
        addL(hungerRollPenalty(), 'голод');
        { const sbL = getSessionRollBonus(true); addL(sbL.value, sbL.notes.join(', ')); }
        const total = roll + lockBoost + dexMod + penalty + lockMods;
        const success = total >= tier.dc;

        let html = `к20: ${roll}${lockBoost ? ` (+${lockBoost} усиление «Взлом» ${lockBoostPct}%)` : ''} + Ловкость ${dexMod >= 0 ? '+' : ''}${dexMod}${penalty ? ' − ' + Math.abs(penalty) + ' (штраф)' : ''}${lockParts.join('')} = ${total} против Сложности ${tier.dc}<br>`;
        if (success) {
            html += `<span style="color:#2ecc71;">✅ Замок взломан! Отмычка цела.</span>`;
            if (practiceXpAllowed('Взлом')) logSkillSuccessByName('Взлом');
            else html += ` <span style="opacity:.7;font-size:12px;">(опыт навыка за сегодня уже получен)</span>`;
        } else {
            removeFromInventoryByName('Отмычка', 1);
            html += `<span style="color:#e74c3c;">❌ Провал. Отмычка сломалась.</span>`;
            renderInventoryList();
        }
        resultEl.innerHTML = html;

        diceHistory.unshift({ roll, dieSize: 20, statLabel: 'Ловкость', statMod: dexMod + penalty + lockMods, skillLabel: `Взлом (${tier.name})`, total, dc: tier.dc, verdict: success });
        diceHistory = diceHistory.slice(0, 20);
        renderDiceHistory();
        saveLocalStorage();
    };
