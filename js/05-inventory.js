
    // ========================================================================
    // ИНВЕНТАРЬ ПРЕДМЕТОВ + КУХНЯ
    // ========================================================================

    // Строка для вставки в JS-аргумент inline-обработчика onclick="f('…')": экранирует \ и ' для JS, затем для HTML-атрибута.
    // Одного escHtml мало: браузер декодирует &#39; обратно в ' ДО разбора JS, и название с апострофом рвало кнопку.
    function jsq(str) { return escHtml(String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
    function escHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function getInventoryTotalWeight() {
        // подсумок несёт игрок — вес его содержимого тоже на нём (раньше при загрузке зелья вес пропадал)
        return playerInventory.reduce((sum, i) => sum + (i.weight || 0) * (i.count || 0), 0)
            + (typeof pouchContents !== 'undefined' && Array.isArray(pouchContents) ? pouchContents.reduce((n, e) => n + (parseFloat(e.weight) || (e.scroll ? 0.1 : 0.25)), 0) : 0);
    }

    // Вещи из базы предметов приходят к игроку разными путями (выдача мастером, покупка у торговца,
    // обмен) — и не везде вместе с «структурными» свойствами: зачарованием (оно считается в
    // макс. ХП/МП и сопротивления) и бонусом рюкзака к переносимому весу. Раньше ожерелье
    // «Повышение здоровья» приходило с текстом в описании, но без зачарования — и ХП не росло.
    // Достраиваем недостающее по базе (имя + категория) — и для новых, и для уже лежащих вещей.
    // Похлёбка (провал готовки): вес 0.5, цена 10. Старые сохранения хранят вес 1 / цену 0 —
    // чиним при каждой загрузке/добавлении, чтобы игрокам не пришлось ничего делать вручную.
    function fixFailedDish(it) {
        if (it && it.name === 'Похлёбка' && it.category === 'Провал готовки' && window.failedDish) {
            it.weight = window.failedDish.weight;
            if (!it.price) it.price = window.failedDish.price; // цена растёт с перками готовки — не затираем
        }
        return it;
    }
    // ---------- Нормализация оружия ----------
    // Оружие приходит из разных мест (кузница, лут, торговцы, данжи, база мастера, уникальная база) с разными полями:
    // урон в dmg/damage/weaponDmg, тип в weaponType (иногда onehand_sword/onehand_dagger) или вовсе без типа.
    // Без нормализации при экипировке «залипал» тип прошлого оружия (меч бил как молот, −4 к кубам), уникальные мечи
    // не получали «Мечника», Бритва Мерунеса не считалась кинжалом, а найденное двуручное надевалось со щитом.
    var WEAPON_TYPE_ALIASES = { onehand_sword: 'onehand', onehand_dagger: 'dagger', onehand_axe: 'onehand:топор', onehand_mace: 'onehand:булава',
        onehand_spear: 'onehand:копьё', twohand_greatsword: 'twohand_sword', twohand_battleaxe: 'twohand_axe', twohand_warhammer: 'twohand_hammer', bow: 'ranged', crossbow: 'ranged:арбалет' };
    var SHEATH_KIND_TO_WEAPON_TYPE = { dagger: 'dagger', sword: 'onehand', axe: 'onehand:топор', mace: 'onehand:булава', spear: 'onehand:копьё',
        greatsword: 'twohand_sword', battleaxe: 'twohand_axe', warhammer: 'twohand_hammer', pike: 'twohand:пика', staff: 'twohand:посох', bow: 'ranged', crossbow: 'ranged:арбалет' };
    function inferWeaponType(it) {
        if (it.slot !== 'melee' && it.slot !== 'ranged') return null;
        if (typeof isKastetItem === 'function' && isKastetItem(it)) return 'onehand:кастет';
        const kind = typeof weaponSheathKind === 'function' ? weaponSheathKind(Object.assign({}, it, { weaponType: undefined })) : null;
        if (kind && SHEATH_KIND_TO_WEAPON_TYPE[kind]) return SHEATH_KIND_TO_WEAPON_TYPE[kind];
        if (it.slot === 'ranged') return 'ranged';
        return String(it.category || '').indexOf('Двуруч') !== -1 ? 'twohand_sword' : 'onehand';
    }
    function normalizeWeaponFields(it) {
        if (!it || (it.slot !== 'melee' && it.slot !== 'ranged')) return it;
        if (typeof it.weaponDmg !== 'number') {
            const d = typeof it.dmg === 'number' ? it.dmg : typeof it.damage === 'number' ? it.damage : null;
            if (d !== null) it.weaponDmg = d;
        }
        if (it.weaponType && WEAPON_TYPE_ALIASES[it.weaponType]) it.weaponType = WEAPON_TYPE_ALIASES[it.weaponType];
        if (!it.weaponType) { const t = inferWeaponType(it); if (t) it.weaponType = t; }
        return it;
    }
    // Тип оружия → пункт списка «тип оружия» на листе (в списке нет отдельных пунктов под топор/булаву/копьё/кастет —
    // это «одноручное»; пика и боевой посох — свои двуручные пункты).
    function weaponTypeToSelectValue(wt) {
        const t = WEAPON_TYPE_ALIASES[wt] || wt || '';
        if (t === 'dagger' || t === 'twohand_sword' || t === 'twohand_axe' || t === 'twohand_hammer') return t;
        if (t === 'twohand:пика' || t === 'twohand_pike') return 'twohand_pike';
        if (t === 'twohand:посох' || t === 'twohand_staff') return 'twohand_staff';
        if (/^twohand/.test(t)) return 'twohand_sword';
        if (t === 'onehand:кастет') return 'unarmed'; // кастеты — безоружный бой («Стальные кулаки», перк «Безоружный бой»)
        if (/^onehand/.test(t)) return 'onehand';
        return null;
    }
    function enrichItemFromDb(it) {
        if (!it || !it.name) return it;
        // Уникальное оружие, выданное мастером раньше без урона (в базе у него поле damage, а не dmg).
        if ((it.slot === 'melee' || it.slot === 'ranged') && typeof it.weaponDmg !== 'number' && typeof it.dmg !== 'number' && typeof it.damage !== 'number' && window.uniqueWeaponsData) {
            const u = window.uniqueWeaponsData.find(p => p.name === it.name);
            if (u && typeof u.damage === 'number') it.weaponDmg = u.damage;
        }
        try { normalizeWeaponFields(it); } catch (e) { }
        if (!it.sheathKind && window.allItems) { const ps = window.allItems.find(p => p.name === it.name && p.sheathKind); if (ps) { it.sheathKind = ps.sheathKind; it.slot = 'sheath'; if (ps.sheathArmor) it.sheathArmor = ps.sheathArmor; } }
        fixFailedDish(it);
        if (it.alchemyEffects && typeof it.effect === 'string' && window.alchemyFixRoundsText) it.effect = window.alchemyFixRoundsText(it.effect);
        // Предметы с ограниченным числом применений (Мешочек Вазьмицы и т.п.): maxUses берём из базы, иначе кнопки «Использовать» не будет.
        if (!it.maxUses) {
            const pu = window.allItems && window.allItems.find(p => p.name === it.name && p.maxUses);
            if (pu) it.maxUses = pu.maxUses;
            else if (/^Мешочек Вазьмицы/i.test(it.name)) it.maxUses = 10;
            if (it.maxUses && typeof it.usesLeft !== 'number') it.usesLeft = it.maxUses;
        }
        if (!window.allItems) return it;
        if (it.enchantment !== undefined && it.carryBonus !== undefined) return it;
        const proto = window.allItems.find(p => p.name === it.name && p.category === it.category);
        if (!proto) return it;
        if (it.enchantment === undefined && proto.enchantment) it.enchantment = JSON.parse(JSON.stringify(proto.enchantment));
        if (it.carryBonus === undefined && typeof proto.carryBonus === 'number') it.carryBonus = proto.carryBonus;
        return it;
    }

    // Лечит инвентарь: предметы, выданные мастером раньше с id документа базы вместо названия
    // («Железный слиток» двоился: одна строка работала в кузнечном деле, другая нет, потому что
    // материалы ищутся по itemId = названию). Такие строки получают itemId = названию и сливаются.
    // Трогаем только id, не начинающиеся с названия (чтобы не задеть «имя#метка» у зачарованных вещей).
    const healedIdMap = {}; // старый itemId → название (нужно при загрузке: слоты экипировки восстанавливаются позже)
    // Устаревшие названия предметов → актуальные. category задана, когда старое название совпадает с названием ОБЫЧНОЙ вещи
    // (обычные «Ламеллярный шлем», «Стеклянная броня» и т.д. не трогаем — переименовываются только уникальные).
    // Палатка: кириллическая «х» в прошлой версии миграции мешала лагерю найти предмет. Уникальные наборы получили свои названия из таблицы.
    const LEGACY_ITEM_RENAMES = [
        { from: 'Палатка 15х15 футов', to: 'Палатка (15x15 футов)' },
        { from: 'Ламеллярный шлем', to: 'Шлем дезертира Стражи Рассвета', category: 'Уникальная броня' },
        { from: 'Ламеллярная броня', to: 'Броня дезертира Стражи Рассвета', category: 'Уникальная броня' },
        { from: 'Ламеллярные перчатки', to: 'Перчатки дезертира Стражи Рассвета', category: 'Уникальная броня' },
        { from: 'Ламеллярные сапоги', to: 'Сапоги дезертира Стражи Рассвета', category: 'Уникальная броня' },
        { from: 'Ламеллярный щит', to: 'Щит налетчика', category: 'Уникальные щиты' },
        { from: 'Прочный железный щит', to: 'Бастион', category: 'Уникальные щиты' },
        { from: 'Стеклянный шлем', to: 'Шлем инквизитора', category: 'Уникальная броня' },
        { from: 'Стеклянная броня', to: 'Броня инквизитора', category: 'Уникальная броня' },
        { from: 'Стеклянные перчатки', to: 'Перчатки инквизитора', category: 'Уникальная броня' },
        { from: 'Стеклянные сапоги', to: 'Сапоги инквизитора', category: 'Уникальная броня' }
    ];
    function healInventoryIds(inv) {
        if (!Array.isArray(inv)) return false;
        let changed = false;
        for (let k = inv.length - 1; k >= 0; k--) {
            const it0 = inv[k];
            if (!it0) continue;
            const rn = LEGACY_ITEM_RENAMES.find(r => r.from === it0.name && (!r.category || r.category === it0.category));
            if (!rn) continue;
            const oldId = it0.itemId;
            const twin0 = inv.find((o, j) => j !== k && o && o.itemId === rn.to);
            if (twin0) { twin0.count = (twin0.count || 0) + (it0.count || 0); inv.splice(k, 1); }
            else { if (it0.itemId === it0.name) it0.itemId = rn.to; it0.name = rn.to; }
            if (rn.category && window.allItems) {   // у переименованных уникальных вещей берём актуальный (объединённый) эффект из базы
                const dbIt = window.allItems.find(pp => pp.name === rn.to && pp.category === rn.category);
                const tgt = twin0 || it0;
                if (dbIt && dbIt.effect && !tgt.enchantment) tgt.effect = dbIt.effect;
            }
            if (oldId && oldId !== rn.to) {
                healedIdMap[oldId] = rn.to;   // слоты экипировки восстанавливаются позже — им нужна карта старый id → новый
                Object.keys(equippedSlots || {}).forEach(sl => { if (equippedSlots[sl] === oldId) equippedSlots[sl] = rn.to; });
            }
            changed = true;
        }
        for (let k = inv.length - 1; k >= 0; k--) {
            const it = inv[k];
            if (!it || !it.name || !it.itemId || it.itemId === it.name || String(it.itemId).indexOf(it.name) === 0) continue;
            if (!window.allItems || !window.allItems.some(p => p.name === it.name && p.category === it.category)) continue;
            const twin = inv.find((o, j) => j !== k && o.itemId === it.name);
            const oldId = it.itemId;
            if (twin) { twin.count = (twin.count || 0) + (it.count || 0); inv.splice(k, 1); }
            else it.itemId = it.name;
            healedIdMap[oldId] = it.name;
            Object.keys(equippedSlots || {}).forEach(s => { if (equippedSlots[s] === oldId) equippedSlots[s] = it.name; });
            changed = true;
        }
        return changed;
    }
    window.healInventoryIds = healInventoryIds;

    function addToInventory(itemId, name, qty, weight, category, effect, extra) {
        // Firestore отвергает ЛЮБОЕ поле undefined — а вызовы вида { armorValue: it.armor, weaponDmg: it.dmg, capacity: it.capacity }
        // кладут в предмет undefined-свойства у вещей без брони/урона. Выбрасываем их здесь.
        if (extra) Object.keys(extra).forEach(k => { if (extra[k] === undefined) delete extra[k]; });
        // Сваренное зелье из сундука/от другого игрока имеет свой itemId — кладём его на такую же стопку (alchemyStackKey).
        const existing = playerInventory.find(i => i.itemId === itemId) ||
            (extra && extra.alchemyEffects && typeof window.findSameStack === 'function'
                ? window.findSameStack(playerInventory, Object.assign({ itemId, name, category }, extra)) : null);
        if (existing) {
            existing.count += qty;
            if (effect) existing.effect = effect;
            if (extra) Object.assign(existing, extra);
            fixFailedDish(existing);
            normalizeWeaponFields(existing);
        } else {
            playerInventory.push(enrichItemFromDb(Object.assign({ itemId, name, count: qty, weight: weight || 0, category: category || '', effect: effect || '' }, extra || {})));
        }
        renderInventoryList();
        renderKitchenPot();
        if (typeof renderEquipPanel === 'function') renderEquipPanel();
        if (typeof renderAlchEatSelect === 'function') renderAlchEatSelect();
        if (typeof renderAlchIngredientSelects === 'function') renderAlchIngredientSelects();
        if (typeof renderSellList === 'function') renderSellList();
        if (typeof renderWeaponChargeSelect === 'function') renderWeaponChargeSelect();
        if (typeof renderTradeSelects === 'function') renderTradeSelects();
        if (typeof renderTemperSelect === 'function') renderTemperSelect();
        if (typeof renderMagicStaffList === 'function') renderMagicStaffList();
        if (typeof renderPouchPanel === 'function') renderPouchPanel();
        updateAll();
    }

    function removeFromInventoryByName(itemId, qty) {
        // Краденое лежит отдельной стопкой «<имя>#stolen». Материалы и ингредиенты из неё тоже идут в дело:
        // сначала тратим чистую стопку, недостающее добираем из краденой.
        let left = qty;
        for (const id of [itemId, itemId + '#stolen']) {
            if (left <= 0) break;
            const idx = playerInventory.findIndex(i => i.itemId === id);
            if (idx === -1) continue;
            const take = Math.min(left, playerInventory[idx].count);
            playerInventory[idx].count -= take;
            left -= take;
            if (playerInventory[idx].count <= 0) playerInventory.splice(idx, 1);
        }
        // И когда стопка просто уменьшилась: два одинаковых меча в обеих руках, продан один — второй слот освобождается.
        if (left < qty) unequipVanishedItems();
    }

    // Снимает с персонажа вещи, которых больше нет в инвентаре (проданы, переданы, выданы мастером в обмен, удалены).
    // Раньше слот оставался заполненным: проданный железный шлем продолжал давать броню.
    let _unequipBusy = false;
    function unequipVanishedItems() {
        if (_unequipBusy || typeof equippedSlots !== 'object' || !equippedSlots) return [];
        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const gone = [];
        _unequipBusy = true;
        try {
            // Одна стопка может быть надета в два слота (два одинаковых меча в обеих руках): слотов не больше, чем штук.
            const usedOf = {};
            const keysOrd = Object.keys(equippedSlots).sort((a, b) => (a === 'meleeWeaponOffhand') - (b === 'meleeWeaponOffhand')); // лишнее снимается с левой руки
            keysOrd.forEach(k => {
                const id = equippedSlots[k];
                if (!id || k === 'ammo') return; // боеприпасы чистит renderAmmoSelect
                const have = playerInventory.reduce((n, i) => n + (i.itemId === id ? (i.count || 0) : 0), 0);
                usedOf[id] = (usedOf[id] || 0) + 1;
                if (usedOf[id] <= have) return;
                equippedSlots[k] = null;
                gone.push(String(id).split('#')[0]);
                if (SLOT_FIELD_MAP[k]) { setV(SLOT_FIELD_MAP[k][0], ''); setV(SLOT_FIELD_MAP[k][1], 0); }
                else if (k === 'ring') setV('slot-ring-name', '');
                else if (k === 'neck') setV('slot-neck-name', '');
                else if (k === 'circlet') setV('slot-circlet-name', '');
                else if (k === 'backpack') setV('slot-backpack-name', '');
                else if (k === 'pouch') {
                    setV('slot-pouch-name', '');
                    const back = pouchContents; pouchContents = [];
                    back.forEach(entry => addToInventory(entry.itemId, entry.name, 1, entry.weight || (entry.scroll ? 0.1 : 0.25), pouchEntryCategory(entry), entry.effect, pouchExtra(entry)));
                    if (typeof renderPouchPanel === 'function') renderPouchPanel();
                }
                else if (k === 'meleeWeapon') { setV('wep-melee-name', 'Бой голыми руками'); setV('wep-melee-dmg', 2); }
                else if (k === 'meleeWeaponOffhand') { setV('wep-melee-offhand-name', ''); setV('wep-melee-offhand-dmg', 0); const d = document.getElementById('chk-dual-wield'); if (d) d.checked = false; }
                else if (k === 'rangedWeapon') { setV('wep-ranged-name', ''); setV('wep-ranged-dmg', 0); }
            });
        } finally { _unequipBusy = false; }
        if (gone.length) {
            if (typeof renderEquippedSummary === 'function') renderEquippedSummary();
            if (typeof renderAllSlotPickers === 'function') renderAllSlotPickers();
            if (typeof updateAll === 'function') { try { updateAll(); } catch (e) { /* не критично */ } }
            if (typeof alchToast === 'function') { try { alchToast('🎽 Снято (вещи больше нет в инвентаре): ' + gone.join(', ')); } catch (e) { /* подсказка */ } }
        }
        return gone;
    }
    window.unequipVanishedItems = unequipVanishedItems;

    // Окно «сколько штук?» — для покупки, передачи другому игроку и выбрасывания.
    // opts: { title, note, max, def, unitPrice, okText, onOk(n) }
    window.askQuantity = function (opts) {
        const old = document.getElementById('qty-modal'); if (old) old.remove();
        const max = Math.max(1, parseInt(opts.max) || 1);
        let val = Math.min(max, Math.max(1, parseInt(opts.def) || 1));
        const ov = document.createElement('div');
        ov.id = 'qty-modal';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        ov.innerHTML = '<div style="background:var(--panel-bg,#1d1a14);color:inherit;border:1px solid var(--accent-color,#c8a566);border-radius:8px;padding:14px 16px;max-width:360px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.7);">' +
            '<div style="font-weight:bold;font-size:16px;margin-bottom:4px;">' + escHtml(opts.title || 'Сколько?') + '</div>' +
            (opts.note ? '<div style="font-size:13px;opacity:.8;margin-bottom:8px;">' + escHtml(opts.note) + '</div>' : '') +
            '<div style="display:flex;gap:6px;align-items:center;margin:8px 0;">' +
            '<button type="button" id="qty-minus" style="width:40px;padding:6px 0;margin:0;">−</button>' +
            '<input type="number" id="qty-input" min="1" max="' + max + '" value="' + val + '" style="flex:1;min-width:0;text-align:center;margin:0;">' +
            '<button type="button" id="qty-plus" style="width:40px;padding:6px 0;margin:0;">+</button>' +
            '<button type="button" id="qty-max" style="width:auto;padding:6px 10px;margin:0;">Макс (' + max + ')</button></div>' +
            (opts.unitPrice ? '<div id="qty-total" style="font-size:14px;margin-bottom:8px;color:var(--accent-color,#c8a566);"></div>' : '') +
            '<div style="display:flex;gap:8px;"><button type="button" id="qty-ok" class="btn-success" style="flex:1;margin:0;">' + escHtml(opts.okText || 'OK') + '</button>' +
            '<button type="button" id="qty-cancel" style="flex:1;margin:0;">Отмена</button></div></div>';
        document.body.appendChild(ov);
        const input = ov.querySelector('#qty-input');
        const totalEl = ov.querySelector('#qty-total');
        const clamp = () => { let n = parseInt(input.value); if (!(n >= 1)) n = 1; if (n > max) n = max; return n; };
        const refresh = () => { if (totalEl) totalEl.textContent = 'Итого: ' + (clamp() * opts.unitPrice) + ' септ.'; };
        const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
        const ok = () => { const n = clamp(); close(); if (typeof opts.onOk === 'function') opts.onOk(n); };
        const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'Enter') ok(); };
        ov.querySelector('#qty-minus').onclick = () => { input.value = Math.max(1, clamp() - 1); refresh(); };
        ov.querySelector('#qty-plus').onclick = () => { input.value = Math.min(max, clamp() + 1); refresh(); };
        ov.querySelector('#qty-max').onclick = () => { input.value = max; refresh(); };
        input.addEventListener('input', refresh);
        ov.querySelector('#qty-ok').onclick = ok;
        ov.querySelector('#qty-cancel').onclick = close;
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        document.addEventListener('keydown', onKey);
        refresh();
        input.focus(); input.select();
    };

    // Выбросить предмет: одну штуку сразу, из стопки — с выбором количества.
    window.dropInventoryItem = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        if (item.count > 1) {
            askQuantity({ title: 'Выбросить: ' + item.name, note: 'У тебя: ' + item.count, max: item.count, def: 1, okText: 'Выбросить',
                onOk: n => adjustInventoryQty(itemId, -n) });
        } else {
            adjustInventoryQty(itemId, -1);
        }
    };

    function adjustInventoryQty(itemId, delta) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        item.count += delta;
        if (item.count <= 0) {
            playerInventory = playerInventory.filter(i => i.itemId !== itemId);
            delete potSelections[itemId];
        }
        if (delta < 0) unequipVanishedItems(); // и когда в стопке что-то осталось: два одинаковых меча в обеих руках, а штука одна
        renderInventoryList();
        renderKitchenPot();
        if (typeof renderAlchEatSelect === 'function') renderAlchEatSelect();
        if (typeof renderAlchIngredientSelects === 'function') renderAlchIngredientSelects();
        if (typeof renderSellList === 'function') renderSellList();
        if (typeof renderWeaponChargeSelect === 'function') renderWeaponChargeSelect();
        if (typeof renderTradeSelects === 'function') renderTradeSelects();
        if (typeof renderTemperSelect === 'function') renderTemperSelect();
        if (typeof renderMagicStaffList === 'function') renderMagicStaffList();
        if (typeof renderPouchPanel === 'function') renderPouchPanel();
        updateAll();
        saveLocalStorage();
    }

    // Цена предмета для игрока = базовая цена × (навык Красноречие × 0.01) × (1 + бонус перков + бонус расы/знака)
    function getRacialPriceBonus() {
        const race = (document.getElementById('char-race') || {}).value;
        // «Голос императора»: имперцы торгуют на 5% выгоднее (свод правил, раздел «Особенности имперцев»)
        return race === 'imperial' ? 0.05 : 0;
    }

    function getSpeechPriceMultiplier() {
        const perks = window.perkBonuses || {};
        // «Сила слова» (Коллегия бардов, 12+ песен): +1 к убеждению и +1 к попытке скидки — в броске Красноречия.
        const speech = getSkillRawValue('Красноречие') + gb('speech');
        // «Повышение искусства торговли» (зачарование/зелье): цены купли и продажи выгоднее на N% — как перк «Торговец».
        const tradeBoost = getSkillBoostPercent('Торговля') / 100;
        return (speech * 0.01) * (1 + Math.min(0.3, perks.merchantPriceBonus || 0) + getRacialPriceBonus() + Math.min(0.5, tradeBoost)); // потолки те же, что при покупке: перк «Торговец» 30%, «Повышение искусства торговли» 50%
    }

    function getDisplayPrice(basePrice) {
        if (!basePrice) return 0;
        return Math.max(0, Math.round(basePrice * getSpeechPriceMultiplier()));
    }

    // ========================================================================
    // ПРОДАЖА ПРЕДМЕТОВ ТОРГОВЦАМ
    // ========================================================================

    const MERCHANT_LABELS = {
        food: 'Продавец еды', blacksmith: 'Кузнец', alchemist: 'Алхимик',
        mage: 'Колдун', pawnbroker: 'Барахольщик', fence: 'Скупщик (Гильдия воров)'
    };

    // Определяет, к какому "профилю" торговца относится предмет.
    // Широкая категория для фильтра "Показать категорию" в купле-продаже (оружие/броня/зелья/
    // ингредиенты/еда/магия/украшения/прочее) — селекты sell-category-filter/buy-category-filter
    // уже стояли в HTML, но нигде не читались, фильтрация не работала вообще.
    function classifyItemBroad(item) {
        const cat = (item.category || '').toLowerCase();
        if (['ring', 'amulet', 'circlet'].includes(item.slot) || cat.includes('ювелир')) return 'jewelry';
        if (cat.includes('зелье') || cat.includes('яд')) return 'potion';
        if (cat.includes('ингредиент')) return 'ingredient';
        if (cat.includes('блюдо') || cat.includes('провал готовки') || cat.includes('продукт') || cat.includes('напит') || cat.includes('еда')) return 'food';
        if (cat.includes('посох') || cat.startsWith('свит') || cat.includes('камни душ') || cat.includes('камень душ') || cat.includes('книг')) return 'magic';
        if (cat.includes('броня') || cat.includes('доспех') || cat.includes('щит') || cat.includes('одеян') ||
            ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield'].includes(item.slot)) return 'armor';
        if (cat.includes('оружие') || cat.includes('лук') || cat.includes('стрел') || cat.includes('боеприпас') ||
            ['melee', 'ranged'].includes(item.slot)) return 'weapon';
        return 'other';
    }

    function classifyItemForMerchant(item) {
        const cat = (item.category || '').toLowerCase();
        const type = (item.type || '').toLowerCase();

        // Зачарованные вещи (любой слот) — профиль мага, независимо от того, что это в
        // остальном оружие/броня. Раньше не проверялось вообще, падало в кузнеца по категории.
        // Служебное описание выкованной вещи («Сопротивление 20 · Лёгкая броня», «Урон 11») — это не магия: раньше
        // любая броня/лук с таким текстом считалась «магической» и у кузнеца и торговца луками шла как «не профиль».
        const craftDesc = /^\s*(урон|сопротивление)\s+\d/i.test(item.effect || '');
        if (item.enchantment || (item.effect && !craftDesc && ['melee', 'ranged', 'helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'circlet'].includes(item.slot))) {
            return 'mage';
        }
        // "свиток" (ед.ч.) не матчит "свитки" (мн.ч., как хранятся выданные мастером и
        // прописанные свитки) — та же кириллическая ловушка подстрок, что чинил для кнопки
        // "Читать" раньше, только здесь отдельное место.
        if (item.isStaff || type === 'staff' || cat.includes('посох') || cat.startsWith('свит') ||
            cat.includes('камни душ') || cat.includes('камень душ') || cat.includes('одеян') || cat.includes('книг')) {
            return 'mage';
        }
        if (cat.includes('зелье') || cat.includes('яд') || cat.includes('алхим')) {
            return 'alchemist';
        }
        if (cat.includes('блюдо') || cat.includes('провал готовки') || cat.includes('еда') ||
            cat.includes('продукт') || cat.includes('напит')) {
            return 'food';
        }
        if (cat.includes('броня') || cat.includes('оружие') || cat.includes('доспех') || cat.includes('кузнеч') ||
            cat.includes('шкур') || cat.includes('щит') || cat.includes('боеприпас') || cat.includes('двемерск') ||
            cat.includes('стрел') || cat.includes('лук') ||
            ['helmet', 'chest', 'gloves', 'boots', 'shield', 'melee', 'ranged'].includes(item.slot)) {
            return 'blacksmith';
        }
        return 'other';
    }

    // Профиль продажи для живых торговцев (тип лавки → кого он «изображает» при покупке у игрока).
    const SELL_PROFILE_BY_STOCK_TYPE = {
        innkeeper: 'food', grocer: 'food', foodVendor: 'food', alchemist2: 'alchemist', blacksmith2: 'blacksmith',
        fletcher: 'blacksmith', jeweler: 'jeweler', courtWizard: 'mage', khajiitCaravan: 'pawnbroker', pawnbrokerLive: 'pawnbroker'
    };
    // Кому продаём сейчас: общий разбор значения селектора («food»… или «stock:тип@владение»).
    // Краденое берёт тайный скупщик, а с перком «Скупщик» — ещё и живой торговец, в чью лавку игрок вложил золото («Вкладчик»).
    function stolenSellAllowed(target) {
        if (!target) return false;
        if (target.profile === 'fence' && !target.stock) return true;
        const uid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        return !!(target.stock && uid && isPerkChecked('Скупщик') && Array.isArray(target.stock.investors) && target.stock.investors.indexOf(uid) !== -1);
    }
    window.investInMerchant = function () {
        const target = getSellTarget();
        if (!target.stock) { alert('Вложиться можно только в лавку живого торговца — выбери его в списке «Кому продаём».'); return; }
        if (!isPerkChecked('Вкладчик')) { alert('Нужен перк «Вкладчик» (Красноречие).'); return; }
        const goldEl = document.getElementById('char-gold'), gold = parseInt(goldEl.value) || 0;
        if (gold < 500) { alert('Для вклада нужно 500 золотых, у тебя ' + gold + '.'); return; }
        if (!confirm(`Вложить 500 золотых в лавку «${target.label}»? Запас золота торговца навсегда вырастет на 500.`)) return;
        const uid = window.CloudSync.getCurrentUid(), nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        window.CloudSync.investInMerchantStock(target.key, 500, uid, nm).then(() => {
            goldEl.value = (parseInt(goldEl.value) || 0) - 500;
            updateAll(); saveLocalStorage(true); renderSellList();
            alert(`Вложено 500 золотых в лавку «${target.label}».` + (isPerkChecked('Скупщик') ? ' Теперь этот торговец берёт у тебя краденое («Скупщик»).' : ''));
        }).catch(e => alert('Не удалось вложиться: ' + e.message));
    };
    function getSellTarget() {
        const sel = document.getElementById('sell-merchant-type');
        const raw = sel ? sel.value : 'pawnbroker';
        if (raw && raw.indexOf('stock:') === 0) {
            const key = raw.slice(6);
            const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
            const stock = session && session.merchantStocks ? session.merchantStocks[key] : null;
            if (stock) return { raw, key, stock, profile: SELL_PROFILE_BY_STOCK_TYPE[key.split('@')[0]] || 'pawnbroker', label: stock.label || 'Торговец', hold: stock.hold };
        }
        const profile = (raw && raw.indexOf('stock:') !== 0) ? raw : 'pawnbroker';
        return { raw: profile, profile, label: MERCHANT_LABELS[profile] || profile };
    }
    function isSellProfileMatch(item, profile) {
        if (profile === 'pawnbroker' || profile === 'fence') return true;
        if (profile === 'jeweler') return classifyItemBroad(item) === 'jewelry';
        if (classifyItemForMerchant(item) === profile) return true;
        // Кузнец и торговец луками берут и зачарованное оружие/броню (в их же ассортименте такие вещи есть) — только не посохи и не одеяния.
        if (profile === 'blacksmith' && ['helmet', 'chest', 'gloves', 'boots', 'shield', 'melee', 'ranged'].includes(item.slot) && !item.isStaff && !/посох/i.test(item.category || '')) return true;
        if ((window.perkBonuses || {}).sellAnything && !item.stolen && !item.isStolen) return true; // перк «Купец»
        return false;
    }
    // Список «Кому продаём»: только живые торговцы сессии (общий пул с покупкой). Единственное исключение —
    // тайный скупщик краденого: у него нет лавки и ассортимента, поэтому его нельзя «завезти» как торговца.
    const SELL_GENERIC_OPTIONS = [
        ['fence', '🗡️ Тайный скупщик (краденое; нужна Гильдия воров)']
    ];
    function renderSellMerchantSelect() {
        const sel = document.getElementById('sell-merchant-type');
        if (!sel) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const stocks = (session && session.merchantStocks) || {};
        const keys = Object.keys(stocks).filter(k => !stocks[k].pets); // конюшни и продавцы животных вещи не скупают
        const prev = sel.value;
        let html = '';
        if (keys.length) html += '<optgroup label="🏪 Торговцы (общий ассортимент: проданное можно выкупить)">' +
            keys.map(k => `<option value="stock:${escHtml(k)}">${escHtml(stocks[k].label)} — ${escHtml(stocks[k].hold)} (${stocks[k].gold} зол.)</option>`).join('') + '</optgroup>';
        html += '<optgroup label="Краденое">' + SELL_GENERIC_OPTIONS.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('') + '</optgroup>';
        if (sel.dataset.sig !== html) { sel.innerHTML = html; sel.dataset.sig = html; }
        const valid = Array.prototype.some.call(sel.options, o => o.value === prev);
        // Пока игрок сам ничего не выбирал, а живой торговец есть — по умолчанию он (общий пул с покупкой).
        const prefer = keys.length && !sel.dataset.userChosen;
        sel.value = (valid && !prefer) ? prev : (keys.length ? (keys.some(k => 'stock:' + k === prev) ? prev : 'stock:' + keys[0]) : (valid ? prev : 'fence'));
    }
    // Селекторы «купить у…» и «продать…» смотрят на одного торговца.
    // Продавать, как и покупать, можно только в городе и только когда мастер завёз торговцев в сессию.
    function getSellBlockReason() {
        if (!isPlayerInTown()) return '🏕 Ты вне города — торговцев здесь нет, продавать некому. Отметь «Я в городе», когда доберёшься до поселения (или попроси мастера).';
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const ms = (session && session.merchantStocks) || {};
        const keys = Object.keys(ms).filter(k => !ms[k].pets);
        if (!keys.length) return '🕓 Мастер ещё не завёз торговцев (ассортимент) — продавать пока некому.';
        return '';
    }
    window.onSellMerchantChanged = function () {
        const selU = document.getElementById('sell-merchant-type'); if (selU) selU.dataset.userChosen = '1';
        const t = getSellTarget();
        const buySel = document.getElementById('buy-merchant-type');
        if (t.key && buySel && Array.prototype.some.call(buySel.options, o => o.value === t.key)) { buySel.value = t.key; renderBuyList(); }
        renderSellList();
    };
    window.onBuyMerchantChanged = function () {
        const buySel = document.getElementById('buy-merchant-type');
        const sellSel = document.getElementById('sell-merchant-type');
        if (buySel && sellSel && buySel.value && Array.prototype.some.call(sellSel.options, o => o.value === 'stock:' + buySel.value)) sellSel.value = 'stock:' + buySel.value;
        renderBuyList(); renderSellList();
    };

    const DISPOSITION_PRICE_MULT = { '-1': 1.25, '0': 1, '1': 0.9, '2': 0.8 }; // множитель цены ПОКУПКИ по отношению торговца
    function computeSellPrice(item, merchantType, charmActive, holdOverride, disposition) {
        let rawPrice = item.price;
        if (item.craftCost > 0 && CRAFT_SELL_CAPS[item.craftKind]) rawPrice = Math.min(rawPrice, Math.max(1, Math.ceil(item.craftCost * CRAFT_SELL_CAPS[item.craftKind])));
        const base = getDisplayPrice(rawPrice);
        if (!base) return 0;
        let mult = 1;
        if (merchantType === 'pawnbroker') {
            mult *= 0.9; // барахольщик всегда на 10% дешевле
        } else if (merchantType === 'fence') {
            mult *= 0.85; // скупщик рискует, поэтому платит чуть меньше барахольщика
        } else if (merchantType === 'jeweler') {
            if (classifyItemBroad(item) !== 'jewelry') mult *= 0.8;
        } else {
            if (!isSellProfileMatch(item, merchantType)) mult *= 0.8; // не его профиль — минус 20%
        }
        if (charmActive) mult *= 1.1; // перк «Очарование»
        mult *= 2 - getGuildDiscountMult(); // капюшон Гильдии воров: скидка 10/15/20% при покупке — столько же сверху при продаже
        // «Сила слова» даёт +1 к броску на скидку (вид «Торг» в проверке Красноречия), а не процент к цене.
        // Задача C: репутация в текущем владении сессии ±5% (тут привязки к конкретному
        // экземпляру торговца нет, в отличие от покупки у живых торговцев — берём владение,
        // которое сейчас задано в сессии мастером).
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        // Множитель репутации задан для покупки (скидка < 1); при продаже уважаемому платят больше — обратная величина.
        mult /= getReputationPriceMult(holdOverride !== undefined ? holdOverride : ((session && session.currentHold) || null));
        // Отношение живого торговца (−1 … +2): как и при покупке, только наоборот — друг платит больше, недруг меньше.
        mult /= DISPOSITION_PRICE_MULT[String(disposition || 0)] || 1;
        return Math.max(0, Math.round(base * mult));
    }
