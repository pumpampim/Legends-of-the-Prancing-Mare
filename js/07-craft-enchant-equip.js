
    // ========================================================================
    // ЗАЧАРОВАНИЕ
    // ========================================================================

    // Несмотря на название (осталось для совместимости со старыми вызовами),
    // теперь возвращает ЭФФЕКТИВНОЕ значение навыка (базовое + расовый бонус) —
    // именно оно должно участвовать во всех игровых формулах и проверках.
    // Для расчёта прогресса прокачки (сколько успехов нужно до +1) по-прежнему
    // используется чистое базовое значение (data-raw-val) напрямую, отдельно.
    function getSkillRawValue(name) {
        return getEffectiveSkillValue(name);
    }

    // Дни заряда зачарованного оружия/посоха зависят от размера камня душ.
    const SOUL_GEM_CHARGE_DAYS = { 'Крохотный': 1, 'Маленький': 3, 'Обычный': 5, 'Большой': 7, 'Великий': 10 };

    function getChargeDays(soulGem) {
        const base = SOUL_GEM_CHARGE_DAYS[soulGem] || 0;
        const perks = window.perkBonuses || {};
        return base + (perks.enchantSoulEconomy || 0);
    }

    function getEnchantSkill() {
        // Ручной ввод навыка убран: можно было вписать 100 и зачаровывать на максимум с нулевым навыком.
        const v = getSkillRawValue('Зачарование');
        const o = document.getElementById('enchant-skill-override'); if (o) o.value = v;
        return v;
    }

    // Слоты экипировки (helmet/chest/gloves/boots/shield/...) используют другие коды,
    // чем таблица эффектов зачарования (helmet/armor/gauntlets/boots/shield/...).
    function equipSlotToEnchantSlot(s) {
        return { chest: 'armor', robe: 'armor', gloves: 'gauntlets', neck: 'amulet', circlet: 'helmet' }[s] || s; // одеяние — как нагрудник
    }

    function isWeaponSlot(slot) {
        return slot === 'melee' || slot === 'ranged';
    }

    // ---------- Зачарование существующего предмета из инвентаря ----------

    function getEnchantableInventoryItems() {
        // Уникальные вещи (артефакты, маски, именное оружие) не зачаровываются — у них свой встроенный эффект.
        const isUniq = i => !!i.unique || /^(Уникальн|Даэдрическ|Артефакты Азидала|Маски жрецов)/.test(String(i.category || '')) ||
            !!((window.uniqueWeaponsData || []).some(u => u.name === i.name) || (window.allItems || []).some(u => u.name === i.name && (u.unique || /^(Уникальн|Даэдрическ|Артефакты Азидала|Маски жрецов)/.test(String(u.category || '')))));
        // Только то, на что есть хоть одно зачарование: ножны, рюкзаки, подсумки и прочее в списке не нужны.
        const hasEffects = i => isWeaponSlot(i.slot) || (window.enchantArmorEffects || []).some(e => e.slots.includes(equipSlotToEnchantSlot(i.slot)));
        return playerInventory.filter(i => i.slot && !i.enchantment && !i.isStaff && !isUniq(i) && hasEffects(i));
    }

    // Блок «Изучение зачарований» во вкладке Зачарование: выбор зачарованной вещи, которую можно разрушить.
    function renderDisenchantSelect() {
        const select = document.getElementById('disenchant-item-select');
        if (!select) return;
        const prev = select.value;
        const items = playerInventory.filter(i => i.enchantment && i.enchantment.name);
        select.innerHTML = items.length
            ? items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} — ${escHtml(i.enchantment.name)}${knownEnchantments.includes(i.enchantment.name) ? ' (уже известно)' : ''}</option>`).join('')
            : '<option value="">Нет зачарованных вещей в инвентаре</option>';
        if (items.some(i => i.itemId === prev)) select.value = prev;
        renderDisenchantInfo();
    }
    window.renderDisenchantInfo = function () {
        const infoEl = document.getElementById('disenchant-item-info');
        const listEl = document.getElementById('known-enchants-list');
        const sel = document.getElementById('disenchant-item-select');
        if (infoEl && sel) {
            const it = playerInventory.find(i => i.itemId === sel.value);
            infoEl.textContent = it && it.enchantment
                ? (knownEnchantments.includes(it.enchantment.name) ? 'Это зачарование ты уже знаешь — разрушать вещь ради него незачем.' : `Узнаешь «${it.enchantment.name}»${it.enchantment.description ? ': ' + it.enchantment.description : ''}`)
                : '';
        }
        if (listEl) listEl.innerHTML = '<strong>Известные зачарования:</strong> ' + (knownEnchantments.length ? knownEnchantments.map(escHtml).join(', ') : '<span style="opacity:.6;">пока ни одного</span>');
    };
    window.disenchantSelected = function () {
        const sel = document.getElementById('disenchant-item-select');
        if (!sel || !sel.value) { alert('Нет зачарованной вещи для разрушения.'); return; }
        window.disenchantItem(sel.value);
    };

    function renderEnchantItemSelect() {
        renderDisenchantSelect();
        const select = document.getElementById('enchant-item-select');
        if (!select) return;
        const items = getEnchantableInventoryItems();
        select.innerHTML = items.length
            ? items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (${escHtml(slotLabel(i.slot))})</option>`).join('')
            : '<option value="">Нет незачарованных предметов с слотом экипировки в инвентаре</option>';
        onEnchantItemPicked();
    }

    // Разрушение зачарованного предмета — как в ваниле: вещь пропадает, а зачарование
    // становится узнанным навсегда (можно применять самому при зачаровании других вещей).
    // Улучшение предмета (наточить/поправить у точила-верстака) — раньше upgradeMaterial/
    // upgradeQty были только текстом в описании ("Улучшается: X ×N"), сама возможность улучшить
    // не существовала вообще. +10% к базовому значению за раз, максимум 5 улучшений (как тиры
    // перков кузнечного дела в ваниле — точило без перка тоже не даёт бесконечно улучшать).
    // Старые механики «Улучшить» (+10%×5) и «Наточить» (4 ранга) заменены ОДНОЙ заточкой по рангам
    // Skyrim в кузнице (см. temperItem). Заглушки оставлены, чтобы старые кнопки/кэш не падали.
    window.improveItem = function (itemId) { window.openTemperFor(itemId); };

    // Самовосстановление уже сохранённых вещей: countInInventory ищет материал по ТОЧНОМУ имени,
    // а в старых данных он мог быть записан иначе ("лунный камень", "Орихалковый  слиток" с двойным
    // пробелом, "Корундовый" без слова "слиток", "2 костные муки" с количеством в названии).
    // Приводим к точному имени предмета и вытаскиваем количество, если оно было в строке.
    function normalizeUpgradeMaterial(item) {
        if (!item || !item.upgradeMaterial) return;
        let raw = String(item.upgradeMaterial).trim().replace(/\s+/g, ' ');
        const m = raw.match(/^(\d+)\s+(.*)$/);
        if (m) { if (!item.upgradeQty) item.upgradeQty = parseInt(m[1]); raw = m[2]; }
        const lower = raw.toLowerCase();
        const names = (window.allItems || []).map(i => i.name);
        let found = names.find(n => n.toLowerCase() === lower) || names.find(n => n.toLowerCase() === lower + ' слиток');
        if (!found && /^костн[а-яё]+ мук[аи]$/.test(lower)) found = 'Костная мука';
        item.upgradeMaterial = found || raw;
    }

    window.sharpenWeapon = function (itemId) { window.openTemperFor(itemId); };

    window.disenchantItem = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || !item.enchantment) return;
        const name = item.enchantment.name;
        if (!confirm(`Разрушить «${item.name}»? Вещь пропадёт навсегда, но зачарование «${name}» станет известно.`)) return;
        if (!knownEnchantments.includes(name)) knownEnchantments.push(name);
        removeFromInventoryByName(itemId, 1);
        renderInventoryList();
        renderEnchantItemSelect(); // обновляет и список эффектов (теперь с новым зачарованием), и блок разрушения
        renderStaffEffectSelect(); updateStaffCalc();
        saveLocalStorage();
        alert(`Зачарование «${name}» узнано.`);
    };

    window.onEnchantItemPicked = function () {
        const itemId = document.getElementById('enchant-item-select').value;
        const item = playerInventory.find(i => i.itemId === itemId);
        const infoEl = document.getElementById('enchant-item-info');
        const effectSelect = document.getElementById('enchant-effect');
        if (!item) {
            infoEl.textContent = '';
            effectSelect.innerHTML = '';
            updateEnchantCalc();
            return;
        }
        infoEl.textContent = isWeaponSlot(item.slot)
            ? `Оружие: заряд держится столько дней, сколько даёт камень душ (${Object.keys(SOUL_GEM_CHARGE_DAYS).map(g => SOUL_GEM_CHARGE_DAYS[g]).join('/')} дн.${(window.perkBonuses || {}).enchantSoulEconomy ? ', +' + window.perkBonuses.enchantSoulEconomy + ' с «Экономией душ»' : ''}), затем нужна подзарядка.`
            : 'Броня/украшение: зачарование постоянное.';
        let effects;
        if (isWeaponSlot(item.slot)) {
            effects = window.enchantWeaponEffects || [];
        } else {
            const eSlot = equipSlotToEnchantSlot(item.slot);
            effects = (window.enchantArmorEffects || []).filter(e => e.slots.includes(eSlot));
        }
        // Как в ваниле — применить можно только УЖЕ УЗНАННОЕ зачарование (разрушив вещь с этим
        // эффектом). Раньше тут был весь список без разбора, знал игрок эффект или нет.
        const known = effects.filter(e => knownEnchantments.includes(e.name));
        effectSelect.innerHTML = known.length
            ? known.map((e) => `<option value="${effects.indexOf(e)}">${escHtml(e.name)}</option>`).join('')
            : '<option value="">Нет узнанных зачарований для этого слота — разрушь подходящий зачарованный предмет</option>';
        updateEnchantCalc();
    };

    function getPickedEnchantItemAndEffect() {
        const itemId = document.getElementById('enchant-item-select').value;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return { item: null, effect: null };
        const raw = document.getElementById('enchant-effect').value;
        const idx = parseInt(raw, 10);
        const effects = isWeaponSlot(item.slot)
            ? (window.enchantWeaponEffects || [])
            : (window.enchantArmorEffects || []).filter(e => e.slots.includes(equipSlotToEnchantSlot(item.slot)));
        // Пустое значение («нет узнанных») раньше давало индекс 0 — первый эффект таблицы без знания.
        const effect = (raw === '' || isNaN(idx)) ? null : effects[idx];
        return { item, effect: effect && knownEnchantments.includes(effect.name) ? effect : null };
    }

    // Азура: сила зачарования +N% — применяется после расчёта calcEnchantPower, единообразно
    // и для обычных вещей, и для посохов.
    function applyGodEnchantBonus(calc, effect) {
        if (!calc.boolean && gb('enchantingPower')) {
            // Бонус бога никогда не уменьшает уже посчитанное значение: потолок — максимум эффекта, но не ниже базового результата
            // (перки зачарования могут вывести его выше maxValue — раньше Азура в этом случае обрезала чары вниз).
            const boosted = Math.round(calc.value * (1 + gb('enchantingPower') / 100) * 100) / 100;
            calc.value = Math.min(boosted, Math.max(effect.maxValue, calc.value));
        }
        return calc;
    }

    // Переносная пентаграмма душ — чары на 50% слабее. НЕ трогаю саму calcEnchantPower (формула
    // защищена от правок) — применяю множитель отдельным шагом поверх уже готового результата.
    // На boolean-эффекты (вкл/выкл, без числа) ослабление не действует — там нечего делить пополам.
    function applyPortablePentagramPenalty(calc) {
        const checkbox = document.getElementById('chk-portable-pentagram');
        if (!checkbox || !checkbox.checked) return calc;
        if (countInInventory('Переносная пентаграмма душ') <= 0) return calc;
        if (calc.boolean) return calc;
        return Object.assign({}, calc, { value: Math.round(calc.value * 0.5 * 10) / 10 });
    }

    function updateEnchantCalc() {
        const resultEl = document.getElementById('enchant-calc-result');
        if (!resultEl) return;
        const { item, effect } = getPickedEnchantItemAndEffect();
        if (!item || !effect) { resultEl.innerHTML = ''; return; }
        const soulGem = document.getElementById('enchant-soulgem').value;
        const skill = getEnchantSkill();
        const gemCount = countInInventory(enchantGemKey(soulGem));
        const calc = applyPortablePentagramPenalty(applyGodEnchantBonus(window.calcEnchantPower(effect, soulGem, skill, window.perkBonuses), effect));

        let html = `<div><strong>${escHtml(effect.name)}</strong></div><div style="opacity:.8; font-size:14px;">${escHtml(effect.description)}</div>`;
        if (document.getElementById('chk-portable-pentagram').checked) html += `<div style="color:#e67e22; font-size:12px;">📐 Переносная пентаграмма — чары ослаблены на 50%.</div>`;
        if (calc.boolean) {
            html += `<div style="margin-top:6px;">Эффект без числовой величины (вкл/выкл).</div>`;
        } else {
            html += `<div style="margin-top:6px; font-size:18px; font-weight:bold; color:var(--accent-color);">${calc.value}${calc.unit ? ' ' + escHtml(calc.unit) : ''}</div>`;
            html += `<div style="font-size:13px; opacity:.6;">При навыке ${skill} и камне «${escHtml(soulGem)}» (макс. по таблице: ${effect.maxValue}${effect.unit})</div>`;
        }
        if (gemCount === 0) {
            html += `<div style="color:#e74c3c; margin-top:4px; font-size:14px;">⚠ В инвентаре нет камня душ «${escHtml(enchantGemKey(soulGem))}» — сначала попроси у мастера.</div>`;
        }
        resultEl.innerHTML = html;
    }
    window.updateEnchantCalc = updateEnchantCalc;

    // После зачарования (и любой замены предмета новым itemId): если ЗАЧАРОВАННАЯ вещь была надета и старой больше нет
    // в инвентаре — надеваем вместо неё новую. Раньше слот оставался со ссылкой на удалённый предмет, поэтому
    // формула урона (getActiveWeaponEnchantDmg) и бонусы брони (getEquipmentEnchantBonuses) не находили зачарование,
    // пока игрок сам не надевал новую вещь заново.
    function repointEquippedSlots(oldId, newItem) {
        if (!oldId || !newItem) return;
        if (playerInventory.some(i => i.itemId === oldId)) return; // старый ещё есть (был стек) — надетый остаётся как есть
        const KEY_TO_SLOT = { meleeWeapon: 'melee', meleeWeaponOffhand: 'melee_offhand', rangedWeapon: 'ranged', neck: 'amulet' };
        Object.keys(equippedSlots).forEach(k => {
            if (equippedSlots[k] === oldId) applyItemToSlot(newItem, KEY_TO_SLOT[k] || k);
        });
    }

    window.enchantItem = function () {
        const { item, effect } = getPickedEnchantItemAndEffect();
        const resultEl = document.getElementById('enchant-result');
        if (!item || !effect) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери предмет и эффект.</span>'; return; }
        const soulGem = document.getElementById('enchant-soulgem').value;
        const gemKey = enchantGemKey(soulGem);
        if (countInInventory(gemKey) <= 0) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">Нет камня душ «${escHtml(enchantGemKey(soulGem))}» в инвентаре.</span>`;
            return;
        }
        const skill = getEnchantSkill();
        const calc = applyPortablePentagramPenalty(applyGodEnchantBonus(window.calcEnchantPower(effect, soulGem, skill, window.perkBonuses), effect));
        const desc = calc.boolean ? effect.description : `${effect.name}: ${calc.value}${calc.unit ? ' ' + calc.unit : ''}`;

        removeFromInventoryByName(gemKey, 1);
        const oldItemId = item.itemId;
        // Слоты, где вещь была надета, — запоминаем ДО списания: списание снимает пропавшую вещь со слота,
        // и раньше зачарованные перчатки оказывались в рюкзаке, а слот пустел.
        const eqKeysBefore = Object.keys(equippedSlots).filter(k => equippedSlots[k] === oldItemId);
        removeFromInventoryByName(item.itemId, 1);

        const enchantedName = `${item.name} [${effect.name}]`;
        const newItemId = enchantedName + '#' + Date.now();
        const extra = Object.assign({}, item, {
            enchantment: { name: effect.name, value: calc.boolean ? null : calc.value, unit: effect.unit, description: desc },
            price: enchantedPrice(item.price || 0, effect, soulGem, calc) // база × 8 × сила зачарования
        });
        if (extra.craftCost > 0) extra.craftCost += materialPrice(gemKey); // потолок цены сделанной вещи учитывает и камень
        delete extra.itemId; delete extra.count;
        // имя/вес/категория/описание передаются аргументами ниже; раньше копия старого предмета затирала их, и зачарованная вещь
        // оставалась с прежним именем (без «[Эффект]») и прежним описанием
        delete extra.name; delete extra.weight; delete extra.category; delete extra.effect;
        extra.baseEffect = gearBaseEffect(item); // встроенное свойство вещи остаётся рядом с чарами (раньше стиралось)
        if (isWeaponSlot(item.slot)) extra.chargeDaysLeft = getChargeDays(soulGem);

        addToInventory(newItemId, enchantedName, 1, item.weight, item.category, desc, extra);
        // Надетую вещь заменяем новой зачарованной автоматически (см. repointEquippedSlots)
        const newItem = playerInventory.find(i => i.itemId === newItemId);
        const wasEquipped = eqKeysBefore.length > 0;
        if (newItem && !playerInventory.some(i => i.itemId === oldItemId)) {
            const KEY_TO_SLOT = { meleeWeapon: 'melee', meleeWeaponOffhand: 'melee_offhand', rangedWeapon: 'ranged', neck: 'amulet' };
            eqKeysBefore.forEach(k => { if (equippedSlots[k] !== oldItemId) applyItemToSlot(newItem, KEY_TO_SLOT[k] || k); });
        }
        repointEquippedSlots(oldItemId, newItem);
        if (wasEquipped) { renderAllSlotPickers(); updateAll(); }
        if (typeof logSkillSuccessByName === 'function') logSkillSuccessByName('Зачарование');
        resultEl.innerHTML = `<div style="color:#2ecc71; font-weight:bold;">✅ Готово: «${escHtml(enchantedName)}» — ${escHtml(desc)}</div>`;
        renderEnchantItemSelect();
        saveLocalStorage();
    };

    // ---------- Посохи ----------

    function renderStaffEffectSelect() {
        const select = document.getElementById('staff-effect');
        if (!select) return;
        const effects = window.enchantWeaponEffects || [];
        // Как и для обычных вещей — только узнанные зачарования.
        const known = effects.filter(e => knownEnchantments.includes(e.name));
        select.innerHTML = known.length
            ? known.map(e => `<option value="${effects.indexOf(e)}">${escHtml(e.name)}</option>`).join('')
            : '<option value="">Нет узнанных зачарований оружия — разрушь подходящий зачарованный предмет</option>';
    }

    // «Отшельник» (Двуручное) даёт бонус силы зачарования именно для посохов —
    // складываем его с общим бонусом зачарования только для расчёта посохов.
    function getStaffEnchantPerks() {
        const base = window.perkBonuses || {};
        return Object.assign({}, base, { enchantGeneralBonus: (base.enchantGeneralBonus || 0) + (base.staffEnchantPower || 0) });
    }

    function updateStaffCalc() {
        const resultEl = document.getElementById('staff-calc-result');
        if (!resultEl) return;
        const rawS = document.getElementById('staff-effect').value;
        const effect = rawS === '' ? null : (window.enchantWeaponEffects || [])[parseInt(rawS, 10)];
        if (!effect || !knownEnchantments.includes(effect.name)) { resultEl.innerHTML = ''; return; }
        const soulGem = document.getElementById('staff-soulgem').value;
        const skill = getEnchantSkill();
        const gemCount = countInInventory(enchantGemKey(soulGem));
        const calc = applyPortablePentagramPenalty(applyGodEnchantBonus(window.calcEnchantPower(effect, soulGem, skill, getStaffEnchantPerks()), effect));
        let html = `<div><strong>${escHtml(effect.name)}</strong></div><div style="opacity:.8; font-size:14px;">${escHtml(effect.description)}</div>`;
        html += calc.boolean
            ? `<div style="margin-top:6px;">Эффект без числовой величины.</div>`
            : `<div style="margin-top:6px; font-size:18px; font-weight:bold; color:var(--accent-color);">${calc.value}${calc.unit ? ' ' + escHtml(calc.unit) : ''}</div>`;
        if (gemCount === 0) html += `<div style="color:#e74c3c; margin-top:4px; font-size:14px;">⚠ Нет камня душ «${escHtml(enchantGemKey(soulGem))}» в инвентаре.</div>`;
        resultEl.innerHTML = html;
    }
    window.updateStaffCalc = updateStaffCalc;

    window.createStaff = function () {
        const rawS = document.getElementById('staff-effect').value;
        const effect = rawS === '' ? null : (window.enchantWeaponEffects || [])[parseInt(rawS, 10)];
        const soulGem = document.getElementById('staff-soulgem').value;
        const gemKey = enchantGemKey(soulGem);
        if (!effect || !knownEnchantments.includes(effect.name)) { alert('Сначала узнай зачарование оружия (разрушь вещь с ним).'); return; }
        if (countInInventory(gemKey) <= 0) {
            alert(`Нет камня душ «${enchantGemKey(soulGem)}» в инвентаре.`);
            return;
        }
        const skill = getEnchantSkill();
        const calc = applyPortablePentagramPenalty(applyGodEnchantBonus(window.calcEnchantPower(effect, soulGem, skill, getStaffEnchantPerks()), effect));
        const desc = calc.boolean ? effect.description : `${effect.name}: ${calc.value}${calc.unit ? ' ' + calc.unit : ''}`;
        removeFromInventoryByName(gemKey, 1);
        const name = `Посох: ${effect.name}`;
        const gemMult = (window.soulGemPower && window.soulGemPower[soulGem]) || 1;
        addToInventory(name + '#' + Date.now(), name, 1, 8, 'Посох', desc, {
            isStaff: true, chargeDaysLeft: getChargeDays(soulGem), slot: 'ranged', price: enchantedPrice(80, effect, soulGem, calc), // база посоха 80 × 8 × сила зачарования
            craftCost: craftCostOf([{ name: gemKey, qty: 1 }], 1), craftKind: 'ench', // сделанная вещь: потолок цены продажи, как у посоха-заклинателя
            enchantment: { name: effect.name, value: calc.boolean ? null : calc.value, unit: effect.unit, description: desc }
        });
        renderStaffList();
        saveLocalStorage();
    };

    function renderStaffList() {
        const el = document.getElementById('staff-list');
        if (!el) return;
        const staves = playerInventory.filter(i => i.isStaff);
        if (!staves.length) { el.innerHTML = '<p style="opacity:.6; font-size:14px;">Посохов пока нет.</p>'; return; }
        el.innerHTML = staves.map(s => `
            <div class="party-row">
                <div class="row-name"><strong>${escHtml(s.name)}</strong><span style="font-size:13px;${s.chargeDaysLeft === 0 ? ' color:#e74c3c;' : ''}">${typeof s.chargeDaysLeft !== 'number' ? 'Заряд без срока' : s.chargeDaysLeft <= 0 ? 'Разряжен — нужна перезарядка' : 'Заряд: ' + s.chargeDaysLeft + ' дн.'}</span></div>
                <div style="font-size:14px; opacity:.85; margin:2px 0;">${escHtml(s.effect || '')}</div>
                <div style="display:flex; gap:6px;">
                    <button style="flex:1;" onclick="advanceStaffDay('${jsq(s.itemId)}')" ${s.chargeDaysLeft <= 0 ? 'disabled' : ''}>−1 день</button>
                    <button class="btn-success" style="flex:1;" onclick="rechargeStaff('${jsq(s.itemId)}')">Перезарядить (камень душ)</button>
                </div>
            </div>
        `).join('');
    }

    window.advanceStaffDay = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        item.chargeDaysLeft = Math.max(0, (item.chargeDaysLeft || 0) - 1);
        renderStaffList();
        saveLocalStorage();
    };

    window.rechargeStaff = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        const soulGem = document.getElementById('staff-soulgem').value;
        const gemKey = enchantGemKey(soulGem);
        if (countInInventory(gemKey) <= 0) {
            alert(`Выбери камень душ выше и убедись, что он есть в инвентаре («${enchantGemKey(soulGem)}» отсутствует).`);
            return;
        }
        removeFromInventoryByName(gemKey, 1);
        item.chargeDaysLeft = Math.max(0, item.chargeDaysLeft || 0) + getChargeDays(soulGem); // подзарядка продлевает, а не заменяет срок
        renderStaffList();
        saveLocalStorage();
    };

    function renderWeaponChargeSelect() {
        const select = document.getElementById('weapon-charge-select');
        if (!select) return;
        const weapons = playerInventory.filter(i => !i.isStaff && i.enchantment && i.hasOwnProperty('chargeDaysLeft'));
        select.innerHTML = weapons.length
            ? weapons.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (заряд: ${i.chargeDaysLeft} дн.)</option>`).join('')
            : '<option value="">Нет зачарованного оружия с зарядом</option>';
    }

    window.chargeWeapon = function () {
        const itemId = document.getElementById('weapon-charge-select').value;
        const resultEl = document.getElementById('weapon-charge-result');
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери оружие.</span>'; return; }
        const soulGem = document.getElementById('weapon-charge-soulgem').value;
        const gemKey = enchantGemKey(soulGem);
        if (countInInventory(gemKey) <= 0) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">Нет камня душ «${escHtml(enchantGemKey(soulGem))}» в инвентаре.</span>`;
            return;
        }
        removeFromInventoryByName(gemKey, 1);
        const addDays = getChargeDays(soulGem);
        item.chargeDaysLeft = Math.max(0, item.chargeDaysLeft || 0) + addDays; // подзарядка продлевает, а не заменяет срок
        resultEl.innerHTML = `<span style="color:#2ecc71;">✅ «${escHtml(item.name)}» заряжено: +${addDays} дн., всего ${item.chargeDaysLeft} дн.</span>`;
        renderWeaponChargeSelect();
        renderInventoryList();
        saveLocalStorage();
    };

    // ---------- Экипировка из инвентаря ----------

    function slotLabel(slot) {
        return ({
            helmet: 'Шлем', chest: 'Броня (корпус)', gloves: 'Перчатки/наручи', boots: 'Сапоги', shield: 'Щит',
            ring: 'Кольцо', amulet: 'Амулет', circlet: 'Обруч', 'melee': 'Оружие ближнего боя', 'ranged': 'Дальнобойное/посох'
        })[slot] || slot;
    }

    const SLOT_FIELD_MAP = {
        helmet: ['slot-helm-name', 'slot-helm-armor'], chest: ['slot-chest-name', 'slot-chest-armor'],
        robe: ['slot-robe-name', 'slot-robe-armor'],
        gloves: ['slot-gloves-name', 'slot-gloves-armor'], boots: ['slot-boots-name', 'slot-boots-armor'],
        shield: ['slot-shield-name', 'slot-shield-armor']
    };

    function getEquippableInventoryItems() {
        return playerInventory.filter(i => i.slot);
    }

    function renderEquipPanel() {
        const select = document.getElementById('equip-item-select');
        if (!select) return;
        const items = getEquippableInventoryItems();
        select.innerHTML = items.length
            ? items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} — ${escHtml(slotLabel(i.slot))}${i.enchantment ? ' 🔮' : ''}${escHtml(compareLabel(i, i.slot))}</option>`).join('')
            : '<option value="">Нет подходящих предметов в инвентаре</option>';
        renderEquippedSummary();
        renderEquipmentSets();
        renderAllSlotPickers();
        renderAmmoSelect();
    }

    // Задача "стрелы расходуются при выстреле" — раньше слота боеприпасов не было вообще,
    // выстрелы ничего не тратили. Список — всё, что похоже на стрелы/болты в инвентаре.
    // Боеприпас — категория "Боеприпасы" либо стрела/болт по названию. Раньше проверялось ТОЛЬКО название
    // (/стрел|болт/), и «Свиток: Огненная стрела» (свиток заклинания) попадал в выбор боеприпасов для
    // лука. Свитки и заклинания/книги/посохи исключаются явно.
    function isAmmoItem(i) {
        if (!i) return false;
        if (i.category === 'Боеприпасы') return true;
        const notAmmo = /^Свиток/i.test(i.name || '') || /Свитк|Книг|Посох|заклинан/i.test(i.category || '') || i.scrollSpellName || i.isMagicStaff;
        return !notAmmo && /стрел|болт/i.test(i.name || '');
    }

    // Урон боеприпаса. Стрелы от мастера и торговца хранят урон в weaponDmg, старые — в dmg,
    // а у скованных урона в вещи раньше не было вовсе: тогда берём его из таблицы кузнеца по имени.
    function ammoDamageOf(am) {
        if (!am) return 0;
        if (typeof am.dmg === 'number') return am.dmg;
        if (typeof am.weaponDmg === 'number') return am.weaponDmg;
        const base = String(am.name || '').replace(/\s*\[.*\]\s*$/, '');
        const r = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).find(w => w.name === base);
        return r && typeof r.damage === 'number' ? r.damage : 0;
    }

    function renderAmmoSelect() {
        const select = document.getElementById('ammo-select');
        const countEl = document.getElementById('ammo-count-display');
        if (!select) return;
        const ammoItems = playerInventory.filter(i => i.count > 0 && isAmmoItem(i));
        const prev = select.value;
        select.innerHTML = '<option value="">— не заряжено —</option>' +
            ammoItems.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (есть: ${i.count})</option>`).join('');
        if (equippedSlots.ammo && ammoItems.some(i => i.itemId === equippedSlots.ammo)) {
            select.value = equippedSlots.ammo;
        } else if (ammoItems.some(i => i.itemId === prev)) {
            select.value = prev;
        } else {
            equippedSlots.ammo = null;
        }
        const equipped = ammoItems.find(i => i.itemId === equippedSlots.ammo);
        if (countEl) countEl.textContent = equipped ? `осталось: ${equipped.count}` : 'не выбрано';
    }

    window.equipAmmo = function (itemId) {
        equippedSlots.ammo = itemId || null;
        renderAmmoSelect();
        saveLocalStorage();
    };

    function getEffectDescriptionForItem(item) {
        if (!item) return '';
        if (item.enchantment && item.enchantment.description) return item.enchantment.description;
        return item.effect || '';
    }

    function isTwoHandedEquipped() {
        const t = (document.getElementById('wep-melee-type') || {}).value || '';
        const it = equippedSlots.meleeWeapon ? playerInventory.find(i => i.itemId === equippedSlots.meleeWeapon) : null;
        return /^twohand/.test(t) || !!(it && (String(it.category || '').indexOf('Двуруч') !== -1 || /^twohand/.test(String(it.weaponType || ''))));
    }
    // Галочка «Дерусь двумя оружиями» при щите в левой руке — нельзя.
    window.onMeleeTypeChanged = function (sel) {
        // Тип надетой вещи меняется только вместе с вещью: раньше секиру можно было «переключить» на меч и бить без −3, со щитом.
        const eqIt = equippedSlots.meleeWeapon ? playerInventory.find(i => i.itemId === equippedSlots.meleeWeapon) : null;
        if (eqIt) { normalizeWeaponFields(eqIt); const t = weaponTypeToSelectValue(eqIt.weaponType); if (t && sel.value !== t) { alert('Тип оружия задаётся надетой вещью («' + eqIt.name + '»). Чтобы бить другим типом — надень другое оружие.'); sel.value = t; return; } }
        if (/^twohand/.test(sel.value) && equippedSlots.shield) { alert('Двуручное оружие держат обеими руками — со щитом нельзя. Сначала сними щит.'); sel.value = sel.dataset.prev || 'onehand'; return; }
        sel.dataset.prev = sel.value;
        updateAll(); saveLocalStorage();
        try { refreshEnhancedButtons(); } catch (e) { }
        if (typeof window.renderWeaponSwapBox === 'function') window.renderWeaponSwapBox();
    };
    window.onDualWieldToggle = function (chk) {
        if (chk.checked && equippedSlots.shield) { chk.checked = false; alert('В левой руке щит — драться двумя оружиями нельзя.'); }
        updateAll(); saveLocalStorage();
    };
    function applyItemToSlot(item, slotOverride) {
        try { normalizeWeaponFields(item); } catch (e) { }
        const slot = slotOverride || item.slot;
        // В бою взять оружие/щит в руки — действие хода (через «Надеть…», инвентарь и блок «✋ В руках» одинаково).
        const handSlot = (WEAPON_HAND_SLOTS || []).indexOf(slot) !== -1;
        if (handSlot && !_handsBatch && !combatActionAllowed('swap')) return false;
        if (slot === 'pouch') {
            // Возвращаем содержимое старого подсумка обратно в инвентарь перед сменой
            pouchContents.forEach(entry => {
                addToInventory(entry.itemId, entry.name, 1, entry.weight || (entry.scroll ? 0.1 : 0.25), pouchEntryCategory(entry), entry.effect, pouchExtra(entry));
            });
            pouchContents = [];
            document.getElementById('slot-pouch-name').value = item.name;
            equippedSlots.pouch = item.itemId;
            renderPouchPanel();
        } else if (slot === 'melee_offhand' && isKastetItem(item) && equippedSlots.gloves) {
            alert('На руках перчатки — кастеты поверх них не надеть. Носятся либо перчатки, либо кастеты: сначала сними перчатки.'); return false;
        } else if (slot === 'melee_offhand') {
            if ((item.category || '').includes('Двуруч') || /^twohand/.test(String(item.weaponType || ''))) {
                alert('Двуручное оружие нельзя держать во второй руке.');
                return false;
            }
            if (isTwoHandedEquipped()) { alert('В руках двуручное оружие — второе оружие не взять.'); return false; }
            if (item.itemId === equippedSlots.meleeWeapon && (item.count || 1) < 2) { alert('Это то же самое оружие, что в правой руке, — второго такого нет.'); return false; }
            if (equippedSlots.shield) { alert('В левой руке щит — второе оружие взять нельзя. Сними щит, чтобы драться двумя оружиями.'); return false; }
            document.getElementById('wep-melee-offhand-name').value = item.name;
            document.getElementById('wep-melee-offhand-dmg').value = item.weaponDmg || 2;
            equippedSlots.meleeWeaponOffhand = item.itemId;
            const dualChk = document.getElementById('chk-dual-wield');
            if (dualChk) dualChk.checked = true;
        } else if (SLOT_FIELD_MAP[slot]) {
            // Диадема/обруч несовместима с бронёй на торс (не с одеянием — то можно) — см.
            // пояснение в ветке 'circlet' выше.
            if (slot === 'chest' && equippedSlots.circlet) {
                alert('Нельзя надеть броню на торс, пока надета диадема/обруч — сними его сначала (шлем/броня плотно прилегают к голове, диадема металлическая и мешает).');
                return false;
            }
            // Броню и одеяние нельзя носить одновременно — надевая одно, снимаем другое.
            if (slot === 'chest' && equippedSlots.robe) {
                document.getElementById('slot-robe-name').value = '';
                document.getElementById('slot-robe-armor').value = 0;
                equippedSlots.robe = null;
            } else if (slot === 'robe' && equippedSlots.chest) {
                document.getElementById('slot-chest-name').value = '';
                document.getElementById('slot-chest-armor').value = 0;
                equippedSlots.chest = null;
            }
            if (slot === 'helmet' && equippedSlots.circlet) { alert('На голове диадема/обруч — сначала сними её, потом надевай шлем.'); return false; }
            if (slot === 'gloves') {
                const kastet = [equippedSlots.meleeWeapon, equippedSlots.meleeWeaponOffhand].map(id => id && playerInventory.find(i => i.itemId === id)).find(isKastetItem);
                if (kastet) { alert('На руках кастеты «' + kastet.name + '» — перчатки поверх них не надеть. Носятся либо перчатки, либо кастеты.'); return false; }
            }
            if (slot === 'shield') {
                // Щит занимает левую руку: со вторым оружием или двуручным его не надеть.
                if (equippedSlots.meleeWeaponOffhand) { alert('В левой руке второе оружие — сначала сними его, потом надевай щит.'); return false; }
                if (isTwoHandedEquipped()) { alert('Двуручное оружие держат обеими руками — щит с ним не надеть.'); return false; }
            }
            document.getElementById(SLOT_FIELD_MAP[slot][0]).value = item.name;
            document.getElementById(SLOT_FIELD_MAP[slot][1]).value = item.armorValue || 0;
            equippedSlots[slot] = item.itemId;
            if (slot === 'shield') { const dc = document.getElementById('chk-dual-wield'); if (dc) dc.checked = false; }
        } else if (slot === 'ring') {
            const desc = getEffectDescriptionForItem(item);
            document.getElementById('slot-ring-name').value = item.name + (desc ? ' — ' + desc : '');
            equippedSlots.ring = item.itemId;
        } else if (slot === 'amulet') {
            const desc = getEffectDescriptionForItem(item);
            document.getElementById('slot-neck-name').value = item.name + (desc ? ' — ' + desc : '');
            equippedSlots.neck = item.itemId;
        } else if (slot === 'circlet') {
            // Диадема/обруч — металлический и облегающий голову, несовместим с бронёй на торс
            // (лёгкой/тяжёлой — шлем там уже плотно прилегает), можно носить только с одеянием
            // или вовсе без брони на торс. Логика по прямой просьбе.
            const chestItem = equippedSlots.chest ? playerInventory.find(i => i.itemId === equippedSlots.chest) : null;
            if (chestItem) {
                alert('Диадему/обруч нельзя носить вместе с бронёй на торс (лёгкой или тяжёлой) — только с одеянием или без брони на торс. Сними броню с торса или носи одеяние вместо неё.');
                return false;
            }
            if (equippedSlots.helmet) { alert('Диадема/обруч и шлем — оба на голове: сначала сними шлем.'); return false; }
            const desc = getEffectDescriptionForItem(item);
            document.getElementById('slot-circlet-name').value = item.name + (desc ? ' — ' + desc : '');
            equippedSlots.circlet = item.itemId;
        } else if (slot === 'backpack') {
            document.getElementById('slot-backpack-name').value = item.name + (typeof item.carryBonus === 'number' ? ` (+${item.carryBonus} к грузоподъёмности)` : '');
            equippedSlots.backpack = item.itemId;
        } else if (slot === 'melee' && isKastetItem(item) && equippedSlots.gloves) {
            alert('На руках перчатки — кастеты поверх них не надеть. Носятся либо перчатки, либо кастеты: сначала сними перчатки.'); return false;
        } else if (slot === 'melee' && (String(item.category || '').indexOf('Двуруч') !== -1 || /^twohand/.test(String(item.weaponType || ''))) && equippedSlots.meleeWeaponOffhand) {
            alert('Двуручное оружие держат обеими руками — сначала убери второе оружие из левой руки.'); return false;
        } else if (slot === 'melee' && item.itemId === equippedSlots.meleeWeaponOffhand && (item.count || 1) < 2) {
            alert('Это оружие уже в левой руке — второго такого нет.'); return false;
        } else if (slot === 'melee') {
            if (equippedSlots.shield && (String(item.category || '').indexOf('Двуруч') !== -1 || /^twohand/.test(String(item.weaponType || '')))) {
                alert('Двуручное оружие держат обеими руками — сначала сними щит.'); return false;
            }
            document.getElementById('wep-melee-name').value = item.name;
            document.getElementById('wep-melee-dmg').value = (typeof item.weaponDmg === 'number' ? item.weaponDmg : (item.dmg || item.damage || 2));
            equippedSlots.meleeWeapon = item.itemId;
            // У выкованного оружия тип известен (weaponType из рецепта) — выставляем его в «типе оружия», иначе
            // секира по умолчанию считалась одноручной (+Сил без штрафа −3), пока игрок не поменяет тип руками.
            // Типы без своего пункта в списке (пика, посох, кастет) не трогаем — там игрок выбирает сам.
            // Тип оружия выставляется ВСЕГДА по надетой вещи (раньше — только если совпадал с пунктом списка, иначе
            // оставался тип прошлого оружия). Нет типа у вещи — выводим по названию и категории.
            normalizeWeaponFields(item);
            const wtSel = document.getElementById('wep-melee-type');
            const wt = weaponTypeToSelectValue(item.weaponType) || 'onehand';
            if (wtSel && Array.from(wtSel.options).some(o => o.value === wt)) { wtSel.value = wt; wtSel.dataset.prev = wt; }
        } else if (slot === 'ranged') {
            document.getElementById('wep-ranged-name').value = item.name;
            document.getElementById('wep-ranged-dmg').value = (typeof item.weaponDmg === 'number' ? item.weaponDmg : (item.dmg || item.damage || 0));
            { const rt = document.getElementById('wep-ranged-type'); if (rt) rt.value = (item.weaponType === 'ranged:арбалет' || /арбалет/i.test(item.name || '')) ? 'crossbow' : 'bow'; } // лук/арбалет — по вещи
            equippedSlots.rangedWeapon = item.itemId;
        } else {
            return false;
        }
        renderEquippedSummary();
        renderAllSlotPickers();
        updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect(); // «Удар щитом» зависит от щита
        if (handSlot) {
            // взяли в руку оружие, которое числилось в ножнах (и второго такого нет) — ножны пустеют
            if (!_handsBatch && typeof sheathSlotOfWeapon === 'function') { const ks = sheathSlotOfWeapon(item.itemId); if (ks && itemUsedCount(item.itemId) > item.count) sheathSlots[ks].holds = null; }
            if (!_handsBatch) markCombatAction('swap'); try { refreshEnhancedButtons(); } catch (e) { } if (typeof window.renderWeaponSwapBox === 'function') window.renderWeaponSwapBox(); }
        saveLocalStorage();
        return true;
    }

    window.equipSelectedItem = function () {
        const itemId = document.getElementById('equip-item-select').value;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        applyItemToSlot(item);
    };

    window.equipToSlotDirect = function (targetSlot, itemId, pickerId) {
        if (!itemId) return;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        applyItemToSlot(item, targetSlot);
        const picker = document.getElementById(pickerId);
        if (picker) picker.value = '';
    };

    // Снять вещь со слота. Надетое и так числится в инвентаре (слот лишь ссылается на itemId), поэтому вещь просто
    // перестаёт быть надетой; броня, урон, скорость, вес и полные комплекты пересчитывает updateAll.
    // Раньше вещь можно было только сменить на другую — снять броню целиком было нельзя.
    // В бою убрать оружие/щит из рук — действие хода, как и взять (см. applyItemToSlot).
    const UNEQUIP_HAND_KEYS = ['meleeWeapon', 'meleeWeaponOffhand', 'rangedWeapon', 'shield'];
    window.unequipSlot = function (key) {
        if (!equippedSlots[key]) return;
        const handKey = UNEQUIP_HAND_KEYS.indexOf(key) !== -1;
        if (handKey && !combatActionAllowed('swap')) return;
        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const it = playerInventory.find(i => i.itemId === equippedSlots[key]);
        if (key === 'pouch') {
            pouchContents.forEach(entry => addToInventory(entry.itemId, entry.name, 1, entry.weight || (entry.scroll ? 0.1 : 0.25), pouchEntryCategory(entry), entry.effect, pouchExtra(entry)));
            pouchContents = [];
            setV('slot-pouch-name', '');
            equippedSlots.pouch = null;
            if (typeof renderPouchPanel === 'function') renderPouchPanel();
        } else if (key === 'meleeWeapon' || key === 'meleeWeaponOffhand' || key === 'shield') {
            unequipHand(key);
            if (key === 'meleeWeapon') { const t = document.getElementById('wep-melee-type'); if (t) t.dataset.prev = 'unarmed'; }
        } else if (key === 'rangedWeapon') {
            equippedSlots.rangedWeapon = null;
            setV('wep-ranged-name', ''); setV('wep-ranged-dmg', 0);
            const act = document.getElementById('active-combat-weapon'); if (act && act.value === 'ranged') act.value = 'melee';
        } else if (SLOT_FIELD_MAP[key]) {
            equippedSlots[key] = null;
            setV(SLOT_FIELD_MAP[key][0], ''); setV(SLOT_FIELD_MAP[key][1], 0);
        } else if (key === 'ring' || key === 'neck' || key === 'circlet' || key === 'backpack') {
            equippedSlots[key] = null;
            setV('slot-' + key + '-name', '');
        } else return;
        renderEquippedSummary();
        renderAllSlotPickers();
        updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        if (handKey) { markCombatAction('swap'); try { refreshEnhancedButtons(); } catch (e) { } if (typeof window.renderWeaponSwapBox === 'function') window.renderWeaponSwapBox(); }
        saveLocalStorage();
        if (it && typeof alchToast === 'function') { try { alchToast('🎽 Снято: ' + it.name + ' — лежит в инвентаре'); } catch (e) { } }
    };

    const SLOT_PICKER_MAP = {
        'slot-helmet-picker': 'helmet', 'slot-chest-picker': 'chest', 'slot-robe-picker': 'robe',
        'slot-gloves-picker': 'gloves', 'slot-boots-picker': 'boots', 'slot-shield-picker': 'shield',
        'slot-pouch-picker': 'pouch',
        'slot-ring-picker': 'ring', 'slot-neck-picker': 'amulet', 'slot-circlet-picker': 'circlet', 'slot-backpack-picker': 'backpack',
        'slot-melee-picker': 'melee', 'slot-melee-offhand-picker': 'melee_offhand', 'slot-ranged-picker': 'ranged'
    };

    // Эпик 2.2: подпись «чем лучше/хуже надетого» в выпадающем списке. Раньше игрок надевал вещь вслепую и смотрел цифры уже после;
    // теперь рядом с названием видно значение и разницу с тем, что надето в этом слоте. Только подпись — расчёты не затронуты.
    const SLOT_TO_EQUIP_KEY = { helmet: 'helmet', chest: 'chest', robe: 'robe', gloves: 'gloves', boots: 'boots', shield: 'shield', melee: 'meleeWeapon', melee_offhand: 'meleeWeaponOffhand', ranged: 'rangedWeapon' };
    function itemMainValue(it) {
        if (!it) return null;
        if (typeof it.weaponDmg === 'number') return { v: it.weaponDmg, label: 'урон' };
        if (typeof it.armorValue === 'number') return { v: it.armorValue, label: 'БР' };
        return null;
    }
    function compareLabel(item, slot) {
        const mine = itemMainValue(item);
        if (!mine) return '';
        const key = SLOT_TO_EQUIP_KEY[slot];
        const curId = key ? equippedSlots[key] : null;
        const cur = curId ? itemMainValue(playerInventory.find(i => i.itemId === curId)) : null;
        let s = ' [' + mine.label + ' ' + mine.v;
        if (curId === item.itemId) s += ', надето';
        else if (cur) { const d = mine.v - cur.v; s += ', ' + (d > 0 ? '▲+' + d : d < 0 ? '▼' + d : '=') + ' к надетому'; }
        else s += ', слот пуст';
        return s + ']';
    }

    // Кнопки «✖ Снять» видны только у занятых слотов (id кнопки — unequip-<ключ equippedSlots>)
    function syncUnequipButtons() {
        document.querySelectorAll('.slot-unequip-btn').forEach(b => { b.style.display = equippedSlots[b.id.slice(8)] ? '' : 'none'; });
    }
    function renderAllSlotPickers() {
        Object.keys(SLOT_PICKER_MAP).forEach(pickerId => {
            const select = document.getElementById(pickerId);
            if (!select) return;
            const wantedSlot = SLOT_PICKER_MAP[pickerId];
            const matchSlot = wantedSlot === 'melee_offhand' ? 'melee' : wantedSlot;
            const items = playerInventory.filter(i => i.slot === matchSlot);
            select.innerHTML = '<option value="">Надеть...</option>' +
                items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)}${i.enchantment ? ' 🔮' : ''}${escHtml(compareLabel(i, wantedSlot))}</option>`).join('');
        });
        syncUnequipButtons();
        renderSlotEnchantInfoLines();
    }

    function renderSlotEnchantInfoLines() {
        const map = {
            helmet: 'slot-helmet-enchant-info', chest: 'slot-chest-enchant-info', robe: 'slot-robe-enchant-info',
            gloves: 'slot-gloves-enchant-info', boots: 'slot-boots-enchant-info', shield: 'slot-shield-enchant-info',
            meleeWeapon: 'slot-melee-enchant-info', meleeWeaponOffhand: 'slot-melee-offhand-enchant-info', rangedWeapon: 'slot-ranged-enchant-info'
        };
        Object.keys(map).forEach(slotKey => {
            const el = document.getElementById(map[slotKey]);
            if (!el) return;
            const itemId = equippedSlots[slotKey];
            const item = itemId ? playerInventory.find(i => i.itemId === itemId) : null;
            const desc = getEffectDescriptionForItem(item);
            // Слот ссылается на предмет, которого уже нет в инвентаре (например, надетую вещь зачаровали/продали/передали
            // в старой версии) — бонусы и зачарование от неё не считаются, пока не надеть вещь заново.
            if (itemId && !item) { el.textContent = '⚠ Этой вещи больше нет в инвентаре — зачарование и бонусы не считаются. Надень нужную вещь заново.'; return; }
            el.textContent = desc ? '🔮 ' + desc : '';
        });
    }

    function renderEquippedSummary() {
        const el = document.getElementById('equipped-enchants-summary');
        if (!el) return;
        const lines = [];
        Object.keys(equippedSlots).forEach(slotKey => {
            const itemId = equippedSlots[slotKey];
            if (!itemId) return;
            const item = playerInventory.find(i => i.itemId === itemId);
            const desc = getEffectDescriptionForItem(item);
            if (item && desc) {
                lines.push(`<div>🔮 <strong>${escHtml(item.name)}</strong>: ${escHtml(desc)}</div>`);
            }
        });
        el.innerHTML = lines.length ? lines.join('') : '<p style="opacity:.6; font-size:14px;">Зачарованных/особых предметов не надето.</p>';
    }
