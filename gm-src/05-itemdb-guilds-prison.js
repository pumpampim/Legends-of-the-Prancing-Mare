    // ---------- База предметов для мастера (глобально доступные) ----------
    const GM_SMITHING_SLOT_MAP = {
        'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves',
        'Сапоги и ботинки': 'boots', 'Щиты': 'shield'
    };

    // Собирает броню/украшения/оружие/боеприпасы из smithing-data.js в том же формате,
    // что и обычные предметы из items-data.js — чтобы мастер мог выдать готовую вещь
    // напрямую, без крафта игроком.
    // Свиток заклинания «на поддержании» (тратит ману каждый ход) — таких свитков в игре нет: убираем из базы
    // мастера, добычи и торговцев (window.isSustainSpell — spell-data.js).
    function gmSpellDescByName(name) {
        const S = window.spellsData || {};
        for (const sc in S) for (const t in S[sc]) { const sp = (S[sc][t] || []).find(x => x.name === name); if (sp) return sp.desc; }
        return '';
    }
    function gmIsSustainScroll(item) {
        if (!item || !/^Свиток:\s*/.test(item.name || '') || !window.isSustainSpell) return false;
        return window.isSustainSpell(item.effect || '') || window.isSustainSpell(gmSpellDescByName(item.name.replace(/^Свиток:\s*/, '')));
    }
    window.gmIsSustainScroll = gmIsSustainScroll;
    function getSmithingGiveableItems() { return window.EnemyLoot && window.EnemyLoot.extraItems ? window.EnemyLoot.extraItems() : []; }

    // Одни и те же вещи приходят из двух источников (магазинная база + кузница/свитки) и показывались в списке мастера дважды.
    // Схлопываем ТОЛЬКО заведомо одинаковые пары категорий; вещи, у которых одно имя, но разные характеристики
    // (уникальная и обычная броня, два вида рюкзака), не трогаем — там нужно решение автора.
    function dedupeGmItems(list) {
        const PAIRS = [['Ювелирные изделия', 'Ювелирное изделие'], ['Свитки (прописанные)', 'Свитки (крафтящиеся)'], ['Бытовые предметы', 'Ингредиенты для алхимии']];
        const byName = new Map();
        list.forEach(i => { const g = byName.get(i.name); if (g) g.push(i); else byName.set(i.name, [i]); });
        const drop = new Set();
        byName.forEach(group => {
            if (group.length < 2) return;
            const pair = PAIRS.find(p => group.every(i => p.includes(i.category)));
            if (!pair) return;
            const keep = group.slice().sort((a, b) => pair.indexOf(a.category) - pair.indexOf(b.category))[0];
            group.forEach(i => { if (i !== keep) { if (!keep.effect && i.effect) keep.effect = i.effect; drop.add(i); } });
        });
        return drop.size ? list.filter(i => !drop.has(i)) : list;
    }

    window.loadGmItems = function() {
        if (!db) return;
        db.collection('items').get().then(snapshot => {
            gmAllItems = [];
            snapshot.forEach(doc => {
                gmAllItems.push({ id: doc.id, ...doc.data() });
            });
            // Если коллекция пуста, пробуем загрузить из локальной базы (если есть)
            if (gmAllItems.length === 0) {
                console.warn('Коллекция items пуста, используем локальную базу из items-data.js (если подключена).');
                // Пробуем получить allItems из глобального объекта (задаётся в items-data.js)
                if (typeof window.allItems !== 'undefined') {
                    gmAllItems = window.allItems.map(item => ({ ...item, id: item.name }));
                } else {
                    document.getElementById('gm-items-table-body').innerHTML = '<tr><td colspan="5">Нет данных. Убедись, что items-data.js подключён и нажми «Импорт».</td></tr>';
                    return;
                }
            }
            // Броня/оружие/украшения из кузницы — всегда добавляем поверх (не хранятся в Firestore).
            gmAllItems = gmAllItems.concat(getSmithingGiveableItems());
            gmAllItems = gmAllItems.concat((window.thrownRecipes || []).map(w => ({ name: w.name, id: w.name, category: 'Метательное', price: w.price, weight: w.weight, dmg: w.damage, thrown: true, throwKind: w.throwKind, effect: 'Урон ' + w.damage + ' (метательное, бросок)' }))); // раньше ножей и дротиков в базе мастера не было
            gmAllItems = gmAllItems.concat(window.skillBooksData || []);
            gmAllItems = gmAllItems.concat(window.uniqueWeaponsData || []);
            gmAllItems = gmAllItems.concat(window.spellTomesData || []);
            gmAllItems = dedupeGmItems(gmAllItems).filter(i => !gmIsSustainScroll(i));
            // O(1) поиск по id/имени вместо O(n) .find() на каждый клик "Передать" — gmAllItems
            // уже перевалил за 400+ записей. gmAllItems как массив оставлен как есть (нужен для
            // рендера таблицы и .filter()-поисков, которым Map не поможет — там всё равно нужен
            // полный перебор).
            gmAllItemsByKey = new Map(gmAllItems.map(i => [i.id || i.name, i]));
            // Заполняем фильтр категорий
            const catSelect = document.getElementById('gm-item-category');
            const cats = [...new Set(gmAllItems.map(i => i.category || 'Разное'))];
            catSelect.innerHTML = '<option value="all">Все категории</option>';
            cats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                catSelect.appendChild(opt);
            });
            gmFilteredItems = gmAllItems;
            if (typeof window.populateEnemyGearDatalist === 'function') window.populateEnemyGearDatalist();
            window.renderGmItemsTable();
        }).catch(e => console.error('Ошибка загрузки предметов для мастера:', e));
    };

    window.filterGmItems = function() {
        const search = document.getElementById('gm-item-search').value.toLowerCase().trim();
        const category = document.getElementById('gm-item-category').value;
        gmFilteredItems = gmAllItems.filter(item => {
            const matchName = item.name.toLowerCase().includes(search);
            const matchCat = category === 'all' || item.category === category;
            return matchName && matchCat;
        });
        window.renderGmItemsTable();
    };

    window.renderGmItemsTable = function() {
        const tbody = document.getElementById('gm-items-table-body');
        const countSpan = document.getElementById('gm-items-count');
        if (!tbody) return;
        if (!gmFilteredItems || gmFilteredItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Ничего не найдено</td></tr>';
            if (countSpan) countSpan.textContent = '0';
            return;
        }
        let html = '';
        gmFilteredItems.forEach(item => {
            const itemId = item.id || item.name;
            html += `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.category || '-')}</td>
                    <td>${item.weight || 0}</td>
                    <td>${item.price || 0}</td>
                    <td>
                        <button class="btn btn-sm" onclick="window.gmGiveItemFromTable('${jsq(itemId)}')">Передать</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        if (countSpan) countSpan.textContent = gmFilteredItems.length;
    };

    // Положить вещь в инвентарь игрока (массив из его документа). Сливаем только с такой же «чистой» вещью:
    // не заточенной и без своего зачарования. Раньше Object.assign перетирал стопку — заточенный меч терял урон
    // (weaponDmg из базы), а в названии оставалось «(Отличное)».
    function gmMergeInvItem(inv, base, qty, extra) {
        const ex = extra || {};
        let id = base.itemId;
        const potKey = ex.alchemyEffects && typeof window.alchemyStackKey === 'function' ? window.alchemyStackKey(Object.assign({}, base, ex, { itemId: id })) : null;
        const existing = inv.find(i => i.itemId === id && !i.temperTier && (!i.enchantment || !!ex.enchantment)) ||
            (potKey ? inv.find(i => window.alchemyStackKey(i) === potKey) : null); // одинаковые сваренные зелья с разными itemId
        if (existing) {
            existing.count = (existing.count || 0) + qty;
            Object.keys(ex).forEach(k => { if (existing[k] === undefined) existing[k] = ex[k]; });
            return existing;
        }
        if (inv.some(i => i.itemId === id)) id = id + '#' + Date.now() + Math.floor(Math.random() * 1000);
        const it = Object.assign({ weight: 0, category: '', effect: '' }, base, { itemId: id, count: qty }, ex);
        inv.push(it);
        return it;
    }

    // Поля предмета базы, которые нужны игроку, чтобы вещь работала (надеть, урон, броня, чары, зелья).
    // Общая для «Передать» и «Награды группе» — раньше награда теряла чары, эффекты зелий, посох и бонус веса,
    // а урон брался только из dmg (у уникального оружия он в damage → приходило с уроном 0).
    function gmItemExtraFromSource(sourceItem) {
        const extra = {};
        if (sourceItem.slot) extra.slot = sourceItem.slot;
        if (typeof sourceItem.armor === 'number') extra.armorValue = sourceItem.armor;
        const dmg = typeof sourceItem.dmg === 'number' ? sourceItem.dmg : typeof sourceItem.damage === 'number' ? sourceItem.damage : null;
        if (dmg !== null) extra.weaponDmg = dmg;
        if (typeof sourceItem.price === 'number') extra.price = sourceItem.price;
        if (typeof sourceItem.capacity === 'number') extra.capacity = sourceItem.capacity;
        if (typeof sourceItem.carryBonus === 'number') extra.carryBonus = sourceItem.carryBonus;
        if (sourceItem.unique) extra.unique = true;
        if (sourceItem.thrown) { extra.thrown = true; if (sourceItem.throwKind) extra.throwKind = sourceItem.throwKind; delete extra.slot; } // метательное: в подсумок связками
        // уже зачарованная вещь из базы (ожерелье «Повышение здоровья» и т.п.) должна нести зачарование,
        // иначе игрок получает только текст в описании, а бонус не работает
        if (sourceItem.enchantment) extra.enchantment = JSON.parse(JSON.stringify(sourceItem.enchantment));
        if (typeof sourceItem.maxUses === 'number') { extra.maxUses = sourceItem.maxUses; extra.usesLeft = sourceItem.maxUses; }
        if (sourceItem.type === 'staff') { extra.isStaff = true; extra.slot = 'ranged'; }
        // Зелья/яды: игрок получает реальные эффекты (применяются автоматически при использовании) и единую категорию.
        if (Array.isArray(sourceItem.alchemyEffects)) extra.alchemyEffects = sourceItem.alchemyEffects;
        if (/^Яд/i.test(sourceItem.category || '')) extra.category = 'Яд';
        else if (/^Зель/i.test(sourceItem.category || '')) extra.category = 'Зелье';
        return extra;
    }
    // Зачарованное оружие и посохи разряжаются; срок заряда выдаваемой вещи решает мастер.
    // Возвращает false, если мастер нажал «Отмена».
    function gmAskChargeDays(extra, itemName) {
        if (!extra.enchantment && !extra.isStaff) return true;
        if (!extra.isStaff && extra.slot !== 'melee' && extra.slot !== 'ranged') return true;
        const v = prompt(`Сколько дней держится заряд «${itemName}»? (камни душ дают 1/3/5/7/10)`, '5');
        if (v === null) return false;
        extra.chargeDaysLeft = Math.max(0, parseInt(v) || 0);
        return true;
    }
    window.gmGiveItemFromTable = function(itemId) {
        const sourceItem = gmAllItemsByKey.get(itemId); // O(1) вместо O(n) — см. loadGmItems
        if (!sourceItem) { alert('Предмет не найден.'); return; }
        const uids = Object.keys(lastData.participants || {});
        if (uids.length === 0) {
            alert('Нет игроков в сессии. Сначала дождись, пока кто-то присоединится.');
            return;
        }
        let playerList = uids.map(uid => {
            const p = lastData.participants[uid];
            return { uid, name: p.name || uid };
        });
        let choices = playerList.map((p, idx) => `${idx+1}: ${p.name}`).join('\n');
        let choice = prompt(`Выберите игрока для передачи:\n${choices}\n\nВведите номер (1-${playerList.length}):`);
        if (choice === null) return;
        let idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= playerList.length) {
            alert('Неверный номер.');
            return;
        }
        const targetUid = playerList[idx].uid;
        const count = prompt('Введите количество:', '1');
        if (count === null) return;
        const numCount = parseInt(count) || 1;
        if (numCount < 1) return;
        // Задача C: краденое можно продать только скупщику Гильдии воров.
        const isStolen = confirm('Это краденый предмет? (ОК — да, краденое; Отмена — обычный предмет)');

        const extra = gmItemExtraFromSource(sourceItem);
        if (isStolen) extra.stolen = true;

        // Мастер видит и может применить ЛЮБОЕ зачарование (не только то, что игрок уже узнал
        // разрушив вещь — у мастера, в отличие от игрока, ограничения "только узнанное" нет).
        // Только для вещей с экипировочным слотом — обычные расходники зачаровать нельзя.
        const enchantableSlots = ['melee', 'ranged', 'helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'circlet'];
        if (sourceItem.slot && enchantableSlots.includes(sourceItem.slot) && !sourceItem.enchantment &&
            confirm(`Зачаровать «${sourceItem.name}» перед выдачей?`)) {
            const isWeapon = sourceItem.slot === 'melee' || sourceItem.slot === 'ranged';
            const armorSlotMap = { chest: 'armor', robe: 'armor', gloves: 'gauntlets', neck: 'amulet', circlet: 'helmet' };
            const wantedSlot = armorSlotMap[sourceItem.slot] || sourceItem.slot;
            const pool = isWeapon ? (window.enchantWeaponEffects || []) : (window.enchantArmorEffects || []).filter(e => e.slots.includes(wantedSlot));
            if (!pool.length) {
                alert('Нет подходящих эффектов зачарования для этого слота.');
            } else {
                const listText = pool.map((e, i) => `${i + 1}: ${e.name} (до ${e.maxValue}${e.unit})`).join('\n');
                const pick = prompt(`Выбери эффект зачарования:\n${listText}\n\nВведи номер:`);
                const pickIdx = parseInt(pick) - 1;
                if (pick !== null && pickIdx >= 0 && pickIdx < pool.length) {
                    const chosen = pool[pickIdx];
                    const valStr = prompt(`Величина эффекта (макс. ${chosen.maxValue}${chosen.unit}):`, String(chosen.maxValue));
                    const val = parseFloat(valStr) || chosen.maxValue;
                    extra.enchantment = { name: chosen.name, value: val, unit: chosen.unit || '', description: `${chosen.name}: ${val}${chosen.unit || ''}` };
                    extra.effect = extra.enchantment.description;
                }
            }
        }

        if (!gmAskChargeDays(extra, sourceItem.name)) return;

        // Краденое, зачарованное мастером и обычное — разные стопки. Раньше всё ложилось в одну стопку по названию,
        // и Object.assign перетирал её: чистые слитки становились краденными, заточенный меч терял урон.
        const gmEnchanted = !!extra.enchantment && !sourceItem.enchantment;
        const giveName = gmEnchanted ? `${sourceItem.name} [${extra.enchantment.name}]` : sourceItem.name;
        // itemId в инвентаре игрока = название предмета (по нему считаются ингредиенты, продажа, ковка).
        let invId = sourceItem.name + (isStolen ? '#stolen' : '');
        if (gmEnchanted) invId = giveName + '#' + Date.now();
        const charRef = db.collection('characters').doc(targetUid);
        // Транзакция: игрок в это время может автосохранить инвентарь — без неё вещь могла потеряться.
        db.runTransaction(tx => tx.get(charRef).then(doc => {
            const data = doc.data() || {};
            let inv = data.inventory || [];
            if (gmEnchanted) inv.push(Object.assign({ itemId: invId, name: giveName, count: numCount, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, extra));
            else gmMergeInvItem(inv, { itemId: invId, name: giveName, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, numCount, extra);
            tx.update(charRef, { inventory: inv });
        })).then(() => {
            alert(`Предмет "${sourceItem.name}" передан игроку ${playerList[idx].name}!`);
            gmPostLogEntryText(`📦 Мастер выдал «${sourceItem.name}» (×${numCount}) игроку ${playerList[idx].name}.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };
        // ---------- Импорт всех предметов в Firestore ----------
    window.importAllItems = function() {
        if (!db) {
            alert('Firebase не подключён.');
            return;
        }
        const items = window.allItems;
        if (!items || items.length === 0) {
            alert('Нет данных для импорта. Проверь, что items-data.js подключён на странице.');
            return;
        }
        if (!confirm(`Импортировать ${items.length} предметов в Firestore? Повторный импорт просто обновит те же записи (без дублей).`)) return;

        const batch = db.batch();
        items.forEach(item => {
            // ID делаем из названия предмета (без запрещённых в Firestore символов),
            // чтобы повторный импорт обновлял те же документы, а не плодил дубли.
            const safeId = item.name.replace(/[\/\.\#\$\[\]]/g, '_').slice(0, 300);
            const docRef = db.collection('items').doc(safeId);
            batch.set(docRef, {
                name: item.name,
                category: item.category || 'Разное',
                type: item.type || 'misc',
                weight: item.weight || 0,
                price: item.price || 0,
                armor: item.armor || null,
                dmg: item.dmg || null,
                effect: item.effect || null,
                material: item.material || null,
                recipe: item.recipe || null,
                slot: item.slot || null,
                charges: item.charges || null
            });
        });
        batch.commit().then(() => {
            alert(`✅ Импортировано ${items.length} предметов!`);
            window.loadGmItems(); // обновляем таблицу
        }).catch(e => {
            console.error('Ошибка импорта:', e);
            alert('Ошибка импорта: ' + e.message);
        });
    };

    // ---------- Открытие рецептов кузницы ----------

    function getAllSmithingRecipeNames() {
        const armor = window.armorRecipes || [];
        const jewelry = window.jewelryRecipes || [];
        const weapons = (window.weaponRecipes || []).concat(window.thrownRecipes || []);
        return [...armor, ...jewelry, ...weapons];
    }

    function populateRecipePlayerSelect() {
        // Убрано — отдельного select для рецептов больше нет, используется тот же игрок, что
        // выбран в панели "Инвентарь" (currentInvPlayerUid). Функция оставлена пустой заглушкой,
        // чтобы не искать и не чистить все места, где она вызывается.
    }

    window.loadPlayerKnownRecipes = function () {
        const uid = currentInvPlayerUid;
        if (!uid) {
            currentRecipePlayerUid = null;
            currentPlayerKnownRecipes = [];
            el('recipe-checklist').innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока в панели «Инвентарь» ниже.</p>';
            return;
        }
        currentRecipePlayerUid = uid;
        el('recipe-checklist').innerHTML = '<p style="opacity:.6; font-size:13px;">Загрузка...</p>';
        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            currentPlayerKnownRecipes = Array.isArray(data.knownSmithingRecipes) ? data.knownSmithingRecipes : [];
            renderRecipeChecklist();
        }).catch(e => {
            el('recipe-checklist').innerHTML = '<p style="color:#e74c3c; font-size:13px;">Ошибка загрузки: ' + escapeHtml(e.message) + '</p>';
        });
    };

    window.renderRecipeChecklist = function () {
        const container = el('recipe-checklist');
        if (!currentRecipePlayerUid) return;
        const search = (el('recipe-search').value || '').toLowerCase();
        const all = getAllSmithingRecipeNames().filter(r => r.name.toLowerCase().includes(search));
        if (!all.length) {
            container.innerHTML = '<p style="opacity:.6; font-size:13px;">Ничего не найдено.</p>';
            return;
        }
        container.innerHTML = all.map(r => {
            const checked = currentPlayerKnownRecipes.includes(r.name) ? 'checked' : '';
            const sub = r.hasOwnProperty('damage')
                ? `${r.category || ''} · ${r.subcat || ''}`
                : (r.slot === 'jewelry' ? 'Ювелирное' : `${r.armorType || ''} · ${r.slot || ''}`);
            return `<label style="display:flex; align-items:center; gap:8px; padding:4px 2px; border-bottom:1px solid var(--border-color); font-size:14px;">
                <input type="checkbox" ${checked} onchange="toggleRecipeKnown('${jsq(r.name)}', this.checked)">
                <span style="flex:1;">${escapeHtml(r.name)} <span style="opacity:.6; font-size:12px;">(${escapeHtml(sub)})</span></span>
            </label>`;
        }).join('');
    };

    window.toggleRecipeKnown = function (name, isChecked) {
        if (!currentRecipePlayerUid) return;
        const ref = db.collection('characters').doc(currentRecipePlayerUid);
        const op = isChecked
            ? firebase.firestore.FieldValue.arrayUnion(name)
            : firebase.firestore.FieldValue.arrayRemove(name);
        ref.set({ knownSmithingRecipes: op }, { merge: true }).then(() => {
            if (isChecked) {
                if (!currentPlayerKnownRecipes.includes(name)) currentPlayerKnownRecipes.push(name);
            } else {
                currentPlayerKnownRecipes = currentPlayerKnownRecipes.filter(n => n !== name);
            }
        }).catch(e => alert('Ошибка сохранения: ' + e.message));
    };

    // ---------- Инвентарь и деньги игроков ----------

    let currentInvPlayerUid = null;
    let currentPlayerInvData = { inventory: [], gold: 0 };

    function populateInvPlayerSelect() {
        const select = el('inv-player-select');
        if (!select) return;
        const uids = Object.keys(lastData.participants || {});
        const prevValue = select.value;
        select.innerHTML = '<option value="">— выбери игрока —</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        if (uids.includes(prevValue)) {
            select.value = prevValue;
        } else {
            currentInvPlayerUid = null;
            el('inv-gold-block').style.display = 'none';
            el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>';
        }
    }

    // ---------- Гильдии и Сверхъестественное ----------
    const GUILD_NAMES = ['Гильдия воров', 'Соратники', 'Коллегия магов', 'Тёмное братство', 'Стража Рассвета', 'Бойцовский клуб', 'Коллегия бардов'];
    const REPUTATION_HOLDS = ['Вайтран', 'Рифт', 'Хаафингар', 'Хьялмарк', 'Истмарк', 'Фолкрит', 'Предел', 'Белый Берег', 'Винтерхолд', 'Схолстейм'];
    const HIRCINE_TOTEMS = ['— нет —', 'Тотем Охоты', 'Тотем Братства', 'Тотем Страха'];
    // Из Фракции.xlsx, лист "Соратники" — настоящие пороги по количеству съеденных сердец,
    // раньше был примитивный ручной счётчик "ранг" без всякой связи со способностями.
    const WEREWOLF_BASE_INFO = 'До 2 раз в сутки: +50 хп, +100 переносимого веса, +20 скорости, когти 20 урона (+5 каждые 4 ур. персонажа), броня 0 на 1 ур. и +50 каждые 5 уровней (всё — пока игрок в форме зверя)';
    const WEREWOLF_ABILITIES = [
        { name: 'Звериная сила I', threshold: 5, desc: '+25% урона в форме зверя' },
        { name: 'Звериная сила II', threshold: 7, desc: '+50% урона в форме зверя' },
        { name: 'Звериная сила III', threshold: 11, desc: '+75% урона в форме зверя' },
        { name: 'Звериная сила IV', threshold: 21, desc: '+100% урона в форме зверя' },
        { name: 'Тотем ледяных братьев', threshold: 15, desc: 'Тотем Братства воем созывает снежных волков' },
        { name: 'Тотем ужаса', threshold: 15, desc: 'Жуткий вой действует даже на существ выше уровнем (до 18 lvl)' },
        { name: 'Вечный голод', threshold: 15, desc: 'Время превращения увеличено вдвое (8 часов)' },
        { name: 'Тотем хищника', threshold: 20, desc: 'Тотем Охоты охватывает весь данж/200 футов, показывает состояние врагов' },
        { name: 'Жадность в еде', threshold: 20, desc: 'Пожирание трупа восстанавливает вдвое больше здоровья' },
        { name: 'Тотем луны', threshold: 25, desc: 'Тотем Братства воем созывает вервольфов' },
        { name: 'Животная энергия', threshold: 27, desc: '+100 хп в форме зверя' }
    ];
    // Из Фракции.xlsx, лист "Cтража рассвета и Вампиры" — реальный список, раньше был выдуман
    // мной с нуля. E19 "Обычный вампиризм" — базовые бонусы САМОГО заражения (даются автоматом,
    // не чекбоксом): +2 харизма, +1 ловкость, +1 сила, бесплатное заклинание высасывания
    // (5хп/ход) и бесплатное "Подъём сильного трупа" (160хп, 30 урона). Ниже — уже отдельная,
    // куда более редкая ступень "Вампир-лорд" (F20-F30), которая открывается не всем — только
    // с помощью Харкона/Караны/Валерики при высоких значениях определённых навыков.
    const VAMPIRE_BASE_INFO = '+3 харизма, +3 телосложение, +2 ловкость, +2 сила · бесплатное заклинание высасывания здоровья (5 хп/ход) · бесплатное "Подъём сильного трупа" (160 хп, 30 урона)';
    const VAMPIRE_ABILITIES = [
        { name: 'Сила Могилы', desc: '+50 к здоровью и магии в форме вампира-лорда', prereq: null },
        { name: 'Хватка вампира', desc: 'Магия крови — притянуть и придушить живое существо с < 10% здоровья', prereq: 'Сила Могилы' },
        { name: 'Вызов гаргульи', desc: 'Магия крови — призвать гаргулью-союзника', prereq: 'Сила Могилы, Хватка вампира' },
        { name: 'Трупное проклятье', desc: 'Магия крови — парализовать противника на 4 его хода (Сл. спасброска 17+мудрость)', prereq: 'Сила Могилы, Вызов гаргульи' },
        { name: 'Обнаружение существ', desc: 'Сила ночи — обнаружение всех существ, включая двемерских автоматонов', prereq: 'Сила Могилы' },
        { name: 'Туманная форма', desc: 'Сила ночи — неуязвимое туманное облако на 3 ваших хода (нельзя наносить/получать урон)', prereq: 'Сила Могилы, Обнаружение существ' },
        { name: 'Сверхъестественные рефлексы', desc: 'Сила ночи — следующие 4 атаки получают +4 к кубам', prereq: 'Сила Могилы, Туманная форма' },
        { name: 'Лечение кровью', desc: 'Убийство укусом/силовой атакой восстанавливает 50% ХП', prereq: 'Сила Могилы' },
        { name: 'Неземные желания', desc: '+4 ячейки заклинаний Сил ночи и Магии крови', prereq: 'Сила Могилы' },
        { name: 'Ядовитые когти', desc: 'Рукопашные атаки наносят +20 урона ядом', prereq: 'Сила Могилы' },
        { name: 'Плащ ночи', desc: 'Перманентная стая летучих мышей наносит 10 урона врагам в ход', prereq: 'Сила Могилы, Неземные желания или Ядовитые когти' }
    ];

    // Ранги гильдий — своя разработка (детальных порогов по рангам в Фракции.xlsx нет почти
    // нигде, кроме отдельных упоминаний вроде "40 заказов → Соловей" у воров и "15 поручений →
    // небесное оружие" у Соратников — они и легли в основу верхних порогов, остальное — разумная
    // прогрессия по аналогии).
    // Подробная база по гильдиям — GM-only справочник (Задача "гильдии подробнее"), из
    // Фракции.xlsx. Показывается по ОДНОЙ гильдии за раз через выпадающий список, не общим
    // списком. armorRewards — реальные пороги+комплекты, где они явно прописаны в файле
    // (Воры и Тёмное братство — чётко; у остальных гильдий награды либо не бронёй, либо
    // завязаны на другой счётчик — сердца оборотня/легендарные песни/турнирный уровень — эти
    // отмечены note, авто-выдачи для них пока нет, будет отдельным заходом).
    const GUILD_DATA = {
        'Гильдия воров': {
            givers: [{ name: 'Делвин Меллори / Векс', note: 'Обычные заказы. За каждые 5 заказов — «особое задание» (500 септимов + новые плюшки гильдии).' }],
            perks: 'При вступлении: откуп у стражи в половину штрафа; скупщики краденого покупают у вас; раз в неделю тренировка +3 к скрытности/карманным кражам/взлому (по выбору). После 5 заказов: откуп стражи — уже четверть штрафа; новые торговцы в Буйной Фляге; "ученик" приносит 250 септимов/неделю.',
            armorRewards: [
                { at: 0, items: ['Капюшон Гильдии Воров', 'Броня Гильдии Воров', 'Перчатки Гильдии Воров', 'Сапоги Гильдии Воров'], note: 'Выдаётся сразу при вступлении.' },
                { at: 5, items: ['Капюшон Умелого вора', 'Броня Умелого вора', 'Перчатки Умелого вора', 'Сапоги Умелого вора'] },
                { at: 10, items: ['Капюшон мастера вора', 'Броня мастера вора', 'перчатки мастера вора', 'Сапоги мастера вора'] },
                { at: 40, items: ['Капюшон соловья', 'Броня соловья', 'Перчатки соловья', 'Сапоги соловьи', 'Соловьиный клинок', 'Соловьиный лук'], note: 'Путь Соловья — если игрок верил в Ноктюрнал, стадия веры +1.' }
            ]
        },
        'Соратники': {
            givers: [
                { name: 'Эйла Охотница', note: 'Квесты на Тотемы Хирсина + поручения (вредители, сопровождение). 200 септимов/поручение.' },
                { name: 'Вилкас / Скьор', note: 'Поручения: фамильные ценности, беглый преступник, спасение похищенных. 200 септимов/поручение.' }
            ],
            perks: 'Может сбить цену у кузнецов на 10% вне зависимости от Красноречия. При вступлении в Круг можно стать вервольфом (излечиться можно только 1 раз).',
            armorRewards: [],
            note: 'Награды здесь НЕ по числу заказов гильдии — 15 поручений → небесное зачарованное оружие (стихия на выбор), 20 → зачарованная волчья броня. Отдельно ещё целый комплект Волчьей/Лунной брони по числу СЪЕДЕННЫХ СЕРДЕЦ оборотня (5/7/11/21/27... сердец) — уже частично реализовано в Сверхъестественном, но не как награда именно гильдии. Авто-выдача этих двух веток — отдельная задача.'
        },
        'Коллегия магов': {
            givers: [
                { name: 'Толфдир', note: 'Найти перегонный куб в Зале поддержки. Награда: +2 Иллюзия, пустой камень душ.' },
                { name: 'Древис Нелорен', note: 'Квест «Балансировка» — очистить фокусные точки. Награда: 3-5 камней душ, +100 к пулу маны, атакующие заклинания восстанавливают 20 маны на 2 реальных часа.' },
                { name: 'Сергий Турриан', note: 'Платит 12/30/60/120/240 септимов за пустые камни душ (по размеру). Может попросить забрать предмет за 400 септимов.' },
                { name: 'Энтир', note: 'Забрать посох в таверне Винтерхолда, 150 септимов.' },
                { name: 'Ураг гро-Шуб', note: 'Принести определённую книгу из случайного подземелья, 100 септимов/книга.' },
                { name: 'Брелина Марион', note: 'Побыть подопытным для её экспериментальных заклинаний (5 часов) → ожерелье сопротивления магии 15%.' },
                { name: "Дж'зарго", note: '«Эксперимент Джзарго» — опробовать новое огненное заклинание → 10 свитков.' },
                { name: 'Онмунд', note: '«Просьба Онмунда» — забрать у Энтира его фамильный артефакт, 150 септимов.' }
            ],
            perks: 'Раз в неделю любой учитель школы обучает заклинанию Адепта за 100 септимов или Эксперта за 200. 3 предупреждения за плохое поведение → изгнание из Коллегии. Даэдрические призывы вне зала с мишенями строго запрещены.',
            armorRewards: [],
            note: 'Мантии школ (Роба разрушения и т.п.) выдаются отдельно за полное изучение ВСЕХ заклинаний школы — не за число заказов гильдии, уже исключены из продажи торговцами.'
        },
        'Тёмное братство': {
            givers: [{ name: 'Астрид / Назир', note: 'Контракты по 250 септимов (+150 за учёт особых пожеланий). Назир также даёт именной список целей: Нарфи, Эннодий Папий, Бейтильд, Херн, Лурбук, Дикус, Ма\'рандра-джо, Анориат, Агнис, Мейлурил, Хелвард, Сафия.' }],
            perks: 'После 10 заказов — появляется торговец. После 15 — ещё торговец (по совместительству скупщик краденого).',
            armorRewards: [
                { at: 0, items: ['Броня теней', 'Сапоги теней', 'Перчатки теней', 'Капюшон теней с маской'], note: 'Выдаётся сразу при вступлении.' },
                { at: 5, items: ['Древняя броня теней', 'Древние сапоги теней', 'Древние перчатки теней', 'Древний капюшон теней с маской'], note: '+20% сильнее изначального.' },
                { at: 25, items: ['Кожа Ситиса', 'Когти Ситиса', 'Хвост Ситиса', 'Лицо Ситиса'], note: 'Финальный комплект, +40% сильнее изначального. Требует Сердце даэдра на улучшение.' }
            ]
        },
        'Стража Рассвета': {
            givers: [{ name: 'Гунмар', note: 'Квесты охоты на вампиров, 200-500 септимов. Именные квесты у других членов: Агмейр «Игра в прятки», Белевал «Охота на чудовище», Ваник «Очищающий свет», Вори «Правосудие ярла», Дорак «Упреждающий удар», Ингьярд «Спасение».' }],
            perks: 'Броня и оружие Стражи Рассвета (лёгкая/тяжёлая, у обеих веток есть анти-вампирские эффекты — доп. урон вампирам, снижение урона ОТ вампиров при полном комплекте) продаются в Форте Стражи Рассвета. Кольца/амулеты охотника на вампиров (Гаргульи, Зверя, Эрудита, Летучих мышей и т.д.) — в Замке Волкихар.',
            armorRewards: [],
            note: 'Порогов "после N заказов" для этой гильдии в файле не нашёл — снаряжение просто продаётся/находится, не выдаётся по числу заказов.'
        },
        'Бойцовский клуб': {
            givers: [{ name: 'Феридар (судья/комментатор)', note: 'Запись на турнир — 200 септимов залог, жетон для входа. Может подсказать про будущих противников за деньги.' }],
            perks: 'Турниры по группам ПО УРОВНЮ ПЕРСОНАЖА (не по заказам гильдии): Новички 1-5, Ученики 5-10, Адепты 10-15, Эксперты 15-20. Сетки 1на1 и 3на3, 5 боёв. Запрещены крики/артефакты даэдра/больше 4 зелий. Победитель забирает всё имущество проигравшего. Награды младших групп — золото/самоцветы/ювелирка/зачарованное оружие и броня. Главный приз (только в группе Эксперты) — "Выбитые зубы" (эбонитовые перчатки с уникальным зачарованием).',
            armorRewards: [],
            note: 'Эта гильдия не подходит под общую систему "ранг по заказам" — награды привязаны к победе в конкретном турнире, а не к счётчику orders. Реализовано отдельной панелью "🥊 Турниры Бойцовского клуба" (запись+залог+выдача награды).'
        },
        'Коллегия бардов': {
            givers: [{ name: 'Музей коллегии', note: 'Сдать историческое/мифическое оружие или броню = 1 легендарная песня + 800 септимов. За 25 сданных предметов — 5000 септимов + титул тана Солитьюда + возможность купить дом.' }],
            perks: 'Кнопка «Выступить» в профессиях (для членов): 10 × 2к10 × (0.1 + 0.005 × репутация во владении) × Красноречие, округление вверх, минимум 30 септимов; лимит выступлений в день задаётся в «Лимитах игроков» (по умолч. 3). За 4 легендарные песни — «Бардовская баллада» (Особые способности: пока бард играет, остальные игроки +1 к кубам — атака, защита, проверки; бард не атакует). За 12 — «Сила слова» (+1 к убеждению и +1 к попытке скидки). За 18 — «Воодушевление» (нужны ещё 2 исторических артефакта; Особые способности: 2 раза в день, +3 ко всем навыкам союзников).',
            armorRewards: [],
            note: 'Прогресс этой гильдии считается ЛЕГЕНДАРНЫМИ ПЕСНЯМИ, не заказами — использует то же поле orders (не отдельный счётчик, но пороги рангов пересчитаны на реальные 4/12/18). Сдача в музей — кнопка на листе игрока (donateToBardMuseum, +1 orders +1 artifacts +800 золота атомарно через CloudSync.donateBardArtifact). Баллада, Сила слова и Воодушевление подключены механически.'
        }
    };


    const GUILD_RANK_TIERS = {
        'Гильдия воров': [{ at: 0, name: 'Новичок' }, { at: 5, name: 'Умелый вор' }, { at: 10, name: 'Мастер вора' }, { at: 40, name: 'Соловей' }],
        'Соратники': [{ at: 0, name: 'Новичок' }, { at: 5, name: 'Щенок' }, { at: 10, name: 'Соратник' }, { at: 15, name: 'Хозяин небесного оружия' }],
        'Коллегия магов': [{ at: 0, name: 'Ученик' }, { at: 5, name: 'Студент' }, { at: 15, name: 'Мастер школы' }, { at: 30, name: 'Архимаг' }],
        'Тёмное братство': [{ at: 0, name: 'Новичок' }, { at: 5, name: 'Проверенный член' }, { at: 25, name: 'Тёмный брат/сестра' }],
        'Стража Рассвета': [{ at: 0, name: 'Новичок' }, { at: 5, name: 'Страж' }, { at: 15, name: 'Охотник на вампиров' }, { at: 25, name: 'Ветеран Стражи' }],
        'Бойцовский клуб': [{ at: 0, name: 'Новичок' }, { at: 5, name: 'Боец' }, { at: 15, name: 'Чемпион группы' }, { at: 25, name: 'Легенда арены' }],
        'Коллегия бардов': [{ at: 0, name: 'Ученик' }, { at: 4, name: 'Бардовская баллада' }, { at: 12, name: 'Сила слова' }, { at: 18, name: 'Воодушевление' }]
    };

    function getGuildRank(guildName, orders) {
        const tiers = GUILD_RANK_TIERS[guildName] || [{ at: 0, name: 'Новичок' }];
        let current = tiers[0], next = null;
        for (let i = 0; i < tiers.length; i++) {
            if (tiers[i].at <= orders) current = tiers[i];
            else { next = tiers[i]; break; }
        }
        return { rankName: current.name, next };
    }

    function defaultGuildsData() {
        const d = {};
        // Новая структура: {member, orders} вместо голого числа — раньше игрок видел ВСЕ 7 гильдий
        // всегда, независимо от того, вступил он в них или нет. Членство теперь назначает мастер.
        GUILD_NAMES.forEach(g => { d[g] = { member: false, orders: 0 }; });
        return d;
    }

    // Старые сохранённые данные (голое число вместо {member,orders}) — трактуем как "member: true,
    // orders: N" (раз счётчик не нулевой, игрок явно уже в гильдии играл), чтобы никто не потерял
    // накопленный прогресс при переходе на новую структуру.
    function normalizeGuildsData(raw) {
        const out = defaultGuildsData();
        GUILD_NAMES.forEach(g => {
            const v = raw ? raw[g] : undefined;
            if (typeof v === 'number') out[g] = { member: v > 0, orders: v };
            else if (v && typeof v === 'object') out[g] = { member: !!v.member, orders: parseInt(v.orders) || 0 };
        });
        return out;
    }

    function defaultReputationData() {
        const d = {};
        REPUTATION_HOLDS.forEach(h => { d[h] = 0; });
        return d;
    }

    let currentReputationData = defaultReputationData();

    function renderReputationPanel() {
        const listEl = el('reputation-list');
        if (!listEl) return;
        renderRepWarn();
        if (!currentInvPlayerUid) { listEl.innerHTML = '<p style="opacity:.6; font-size:13px;">Игрок не выбран — выбери его в панели «Инвентарь и деньги» выше, этот же выбор используется здесь.</p>'; return; }
        const pname = (lastData.participants && lastData.participants[currentInvPlayerUid] && lastData.participants[currentInvPlayerUid].name) || currentInvPlayerUid;
        listEl.innerHTML = `<p style="font-size:13px; opacity:.8; margin-bottom:6px;">Игрок: <strong>${escapeHtml(pname)}</strong></p>` + REPUTATION_HOLDS.map(h => `
            <div class="party-row" style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                <span>${escapeHtml(h)}</span>
                <span style="display:flex; align-items:center; gap:4px;">
                    <button style="width:auto; padding:2px 8px;" onclick="adjustReputation('${jsq(h)}', -1)">−1</button>
                    <input type="number" value="${currentReputationData[h] || 0}" style="width:60px; text-align:center;" onchange="setReputation('${jsq(h)}', this.value)">
                    <button style="width:auto; padding:2px 8px;" onclick="adjustReputation('${jsq(h)}', 1)">+1</button>
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resetReputation('${jsq(h)}')">Сброс</button>
                </span>
            </div>`).join('');
    }

    // Эпик 5.4. Уровни последствий и уведомление мастера при пересечении порога (при сохранении).
    function repLevel(v) { return v >= 5 ? 2 : v <= -10 ? -3 : v <= -3 ? -2 : 0; }
    const REP_LEVEL_TEXT = { 2: 'уважают (скидка ×0.9)', '-2': 'подозревают (наценка ×1.25, возможен отказ в дорогих товарах)', '-3': 'стража пытается арестовать', 0: 'нейтрально' };
    let repBaseline = null;
    function renderRepWarn() {
        const w = el('reputation-warn'); if (!w) return;
        const bad = REPUTATION_HOLDS.filter(h => (currentReputationData[h] || 0) <= -3);
        w.innerHTML = bad.length ? bad.map(h => `<div style="color:#e6a23c;">⚠ ${escapeHtml(h)}: ${currentReputationData[h]} — ${REP_LEVEL_TEXT[repLevel(currentReputationData[h])]}.</div>`).join('') : '';
    }
    window.adjustReputation = function (holdName, delta) {
        if (!currentInvPlayerUid) return;
        currentReputationData[holdName] = (currentReputationData[holdName] || 0) + delta;
        renderReputationPanel();
    };

    window.setReputation = function (holdName, val) {
        if (!currentInvPlayerUid) return;
        currentReputationData[holdName] = parseInt(val) || 0;
        renderReputationPanel();
    };

    window.resetReputation = function (holdName) {
        if (!currentInvPlayerUid) return;
        if (!confirm(`Сбросить репутацию в «${holdName}» до 0?`)) return;
        currentReputationData[holdName] = 0;
        renderReputationPanel();
    };

    // Репутация копится локально по всем регионам и пишется в облако одной кнопкой "Сохранить" —
    // так мастер может выставить сразу несколько значений и сохранить разом, а не дёргать
    // Firestore при каждом +1/-1 (в отличие от гильдий, где это не так критично по частоте).
    window.saveReputation = function () {
        if (!currentInvPlayerUid) { alert('Выбери игрока выше.'); return; }
        db.collection('characters').doc(currentInvPlayerUid).update({ reputationByRegion: currentReputationData })
            .then(() => {
                const base = repBaseline || defaultReputationData();
                const pname = ((lastData.participants || {})[currentInvPlayerUid] || {}).name || 'игрок';
                const changes = REPUTATION_HOLDS.filter(h => repLevel(base[h] || 0) !== repLevel(currentReputationData[h] || 0))
                    .map(h => `${h}: ${currentReputationData[h]} — ${REP_LEVEL_TEXT[repLevel(currentReputationData[h] || 0)]}`);
                repBaseline = Object.assign({}, currentReputationData);
                if (changes.length) { alert('Репутация сохранена.\n\nПорог пересечён (' + pname + '):\n' + changes.join('\n')); }
                else alert('Репутация сохранена.');
            })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Штрафы и тюрьма ----------
    // Порог, с которого штраф означает тюрьму, а не просто оплату — как в ванильном Skyrim
    // (там 1000 золотых). Ниже порога игрок обычно просто платит; отказ платить (любую сумму)
    // тоже даёт мастеру право посадить.
    const JAIL_FINE_THRESHOLD = 1000;
    let currentCrimeState = { fineAmount: 0, fineHold: '', fineReason: '', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 };

    function renderCrimePanel() {
        const box = el('crime-panel-body');
        if (!box) return;
        if (!currentInvPlayerUid) { box.innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>'; return; }
        const c = currentCrimeState;
        const here = rumPartyHold();
        let html = '';
        if (c.inJail) {
            html += `<p style="color:#e67e22;">🔒 В тюрьме (${escapeHtml(c.jailHold)}), осталось ${c.jailDaysRemaining} дн.</p>
                <button class="btn-success" style="width:100%;" onclick="releaseFromJail()">Освободить</button>`;
        }
        // Розыск: штрафы копятся отдельно по каждому владению (crime-core.js)
        const bounties = window.StCrime ? window.StCrime.list(c) : [];
        if (bounties.length) {
            html += `<p style="margin:6px 0 2px;"><b>⚖️ Розыск по владениям</b> — всего ${c.fineAmount} септимов</p>`;
            html += bounties.map(b => {
                const isHere = here && window.StCrime.sameHold(b.hold, here);
                const hs = escapeHtml(b.hold).replace(/'/g, '&#39;');
                return `<div class="st-bounty${isHere ? ' st-bounty-here' : ''}">
                    <div><b>${escapeHtml(b.hold)}</b>: <strong>${b.amount}</strong> септимов${b.head ? ' · <span style="color:#e05a4f;">награда за голову — стража нападает</span>' : ''}${isHere ? ' · <span style="color:#e8a25a;">отряд здесь</span>' : ''}
                    ${b.reason ? `<div style="font-size:12px; opacity:.7;">${escapeHtml(b.reason)}</div>` : ''}
                    ${b.refused ? '<div style="font-size:12px; color:#e74c3c;">Отказался платить.</div>' : ''}</div>
                    <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;">
                        <button class="btn-danger" style="width:auto; margin:0;" onclick="clearFine('${hs}')">💰 Оплатить</button>
                        ${!b.refused ? `<button style="width:auto; margin:0;" onclick="markFineRefused('${hs}')">🙅 Отказ</button>` : ''}
                        <button style="width:auto; margin:0;" onclick="sendToJail('${hs}')" ${c.inJail ? 'disabled' : ''}>🔒 В тюрьму</button>
                        <button style="width:auto; margin:0;" onclick="forgiveBounty('${hs}')" title="Снять розыск без оплаты (ярл помиловал, квест, подкуп)">🕊 Снять</button>
                    </div>
                </div>`;
            }).join('');
            html += `<label style="margin-top:6px;">Срок тюрьмы (дней)</label><input type="number" id="jail-days-input" value="3" min="1" style="width:70px; display:inline;">`;
        } else if (!c.inJail) {
            html += '<p style="opacity:.6; font-size:13px;">Розыска нет.</p>';
        }
        const holdOpts = REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}"${here && window.StCrime && window.StCrime.sameHold(h, here) ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('');
        html += `<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-color);">
            <label>Новый штраф</label>
            <input type="number" id="fine-amount-input" placeholder="Сумма">
            <select id="fine-hold-select">${holdOpts}</select>
            <input type="text" id="fine-reason-input" placeholder="За что (необязательно)">
            <button class="btn-success" style="width:100%; margin-top:4px;" onclick="issueFine()">Выписать штраф</button>
            <p style="font-size:11px; opacity:.6; margin-top:4px;">Штраф копится в выбранном владении. От ${window.StCrime ? window.StCrime.HEAD_PRICE : 1000} септимов в одном владении — награда за голову: стража нападает, а не предлагает заплатить.</p>
        </div>`;
        box.innerHTML = html;
    }

    function saveCrimeState() {
        if (!currentInvPlayerUid) return Promise.resolve();
        const uid = currentInvPlayerUid, cs = currentCrimeState;
        return db.collection('characters').doc(uid).update({ crimeState: cs }).then(() => {
            // сводка розыска в сессию — для подсказки «стража узнаёт» (gmWantedWatch)
            if (currentCode && (lastData.participants || {})[uid]) {
                return db.collection('sessions').doc(currentCode).update({ ['participants.' + uid + '.wanted']: window.StCrime.list(cs).map(b => ({ hold: b.hold, amount: b.amount })) }).catch(() => { });
            }
        });
    }

    // «Стража узнаёт»: отряд в владении, где кого-то разыскивают, — плашка у мастера и одна запись в журнал.
    const _wantedSeen = new Set();
    function gmWantedWatch(data) {
        const box = el('gm-wanted-banner');
        if (!box || !window.StCrime) return;
        const here = (data.partyPos && data.partyPos.hold) || data.currentHold || '';
        const rows = [];
        Object.entries(data.participants || {}).forEach(([uid, p]) => {
            (p && Array.isArray(p.wanted) ? p.wanted : []).forEach(w => {
                if (here && window.StCrime.sameHold(w.hold, here) && w.amount > 0) rows.push({ uid, name: p.name || 'Игрок', amount: w.amount, head: w.amount >= window.StCrime.HEAD_PRICE });
            });
        });
        const firstLook = !gmWantedWatch.ready; gmWantedWatch.ready = true; // при открытии экрана старый розыск в журнал не пишем
        if (!rows.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.style.display = '';
        box.innerHTML = `🛡 <b>Отряд в ${escapeHtml(here)}</b>, здесь разыскивают: ` + rows.map(r =>
            `<b>${escapeHtml(r.name)}</b> (${r.amount}${r.head ? ', награда за голову — стража нападает' : ''})`).join(', ') +
            `. <span style="opacity:.75">Стража может узнать: штраф, тюрьма или бой. Штрафы — в «Инвентарь игрока» → «Розыск».</span>`;
        rows.forEach(r => {
            const key = here + '|' + r.uid + '|' + r.amount;
            if (_wantedSeen.has(key)) return;
            _wantedSeen.add(key);
            if (!firstLook) gmPostLogEntryText(`🛡 ${r.name} разыскивается в ${here}: ${r.amount} септимов${r.head ? ' — награда за голову' : ''}.`);
        });
    }

    window.issueFine = function () {
        if (!currentInvPlayerUid) return;
        const amount = parseInt(el('fine-amount-input').value) || 0;
        if (amount <= 0) { alert('Укажи сумму штрафа.'); return; }
        const hold = el('fine-hold-select').value;
        const newReason = el('fine-reason-input').value.trim();
        const before = window.StCrime.amountIn(currentCrimeState, hold);
        currentCrimeState = window.StCrime.addFine(currentCrimeState, hold, amount, newReason);
        const total = window.StCrime.amountIn(currentCrimeState, hold);
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText(`⚖️ Штраф ${amount} септимов (${hold})${newReason ? ': ' + newReason : ''}${before > 0 ? ` — розыск там ${total}` : ''}${before < window.StCrime.HEAD_PRICE && total >= window.StCrime.HEAD_PRICE ? '. Назначена награда за голову!' : ''}.`);
            try { window.rumAddDeed({ kind: 'crime', amount: amount, reason: newReason, hold: hold || undefined, who: [((lastData.participants || {})[currentInvPlayerUid] || {}).name].filter(Boolean) }); } catch (e) { }
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.forgiveBounty = function (hold) {
        if (!currentInvPlayerUid) return;
        if (!confirm(`Снять розыск в «${hold}» без оплаты?`)) return;
        currentCrimeState = window.StCrime.clearHold(currentCrimeState, hold);
        saveCrimeState().then(() => { renderCrimePanel(); gmPostLogEntryText(`🕊 Розыск в «${hold}» снят.`); }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.markFineRefused = function (hold) {
        if (!currentInvPlayerUid) return;
        hold = hold || (window.StCrime.list(currentCrimeState)[0] || {}).hold;
        currentCrimeState = window.StCrime.refuse(currentCrimeState, hold);
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText(`🙅 Игрок отказался платить штраф (${hold}).`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Оплата штрафа: сумма списывается из кошелька игрока (атомарный increment, как в наградах),
    // не хватает золота — штраф остаётся (тогда отказ/тюрьма).
    // Гильдия воров (Фракции.xlsx): член гильдии откупается у стражи за половину штрафа, после 5 заказов (особых заданий) — за четверть.
    function thievesGuildFineMult(data) {
        const g = ((data && data.guildsData) || {})['Гильдия воров'];
        const member = typeof g === 'number' ? g > 0 : !!(g && g.member);
        const orders = typeof g === 'number' ? g : (parseInt(g && g.orders) || 0);
        const bribe = !!((data && data.perkStates) || {})['skill9-perk2-step1']; // перк «Подкуп» (Красноречие): стража берёт половину, репутация не страдает
        if (!member) return bribe ? { mult: 0.5, note: '«Подкуп»: стража берёт половину, репутацию не снижать' } : { mult: 1, note: '' };
        if (bribe && orders < 5) return { mult: 0.5, note: 'Гильдия воров / «Подкуп»: половина штрафа, репутацию не снижать' };
        return orders >= 5 ? { mult: 0.25, note: 'Гильдия воров: откуп в четверть штрафа' } : { mult: 0.5, note: 'Гильдия воров: откуп в половину штрафа' };
    }
    window.clearFine = function (hold) {
        if (!currentInvPlayerUid) return;
        hold = hold || (window.StCrime.list(currentCrimeState)[0] || {}).hold;
        const uid = currentInvPlayerUid;
        const ref = db.collection('characters').doc(uid);
        let fine = 0, cleared = null;
        let paid = fine, note = '';
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const data = doc.data() || {};
            fine = window.StCrime.amountIn(data.crimeState, hold);
            cleared = window.StCrime.clearHold(data.crimeState, hold);
            const tg = thievesGuildFineMult(data);
            paid = Math.ceil(fine * tg.mult); note = tg.note;
            const have = parseInt(data.gold) || 0;
            if (have < paid) throw new Error(`У игрока только ${have} зол., к оплате ${paid}${note ? ' (' + note + ')' : ''}. Отметь отказ платить или отправь в тюрьму.`);
            tx.update(ref, { gold: have - paid, crimeState: cleared });
        })).then(() => {
            currentCrimeState = cleared;
            renderCrimePanel();
            gmPostLogEntryText(`💰 Штраф ${fine} септимов${hold ? ' (' + hold + ')' : ''} оплачен${paid !== fine ? `: ${paid} зол. — ${note}` : ''}.`);
        }).catch(e => alert(e.message));
    };

    // Тюрьма «отрабатывает» розыск одного владения: его штраф снимается, остальные остаются.
    window.sendToJail = function (hold) {
        if (!currentInvPlayerUid) return;
        hold = hold || (window.StCrime.list(currentCrimeState)[0] || {}).hold || '';
        const days = parseInt((el('jail-days-input') || {}).value) || 1;
        currentCrimeState = Object.assign(window.StCrime.clearHold(currentCrimeState, hold), { inJail: true, jailHold: hold, jailDaysRemaining: days });
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText(`🔒 Игрок отправлен в тюрьму на ${days} дн. (${currentCrimeState.jailHold}).`);
            try { window.rumAddDeed({ kind: 'jail', days: days, hold: currentCrimeState.jailHold || undefined, who: [((lastData.participants || {})[currentInvPlayerUid] || {}).name].filter(Boolean) }); } catch (e) { }
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.releaseFromJail = function () {
        if (!currentInvPlayerUid) return;
        currentCrimeState = Object.assign({}, currentCrimeState, { inJail: false, jailHold: '', jailDaysRemaining: 0 });
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText('🔓 Игрок освобождён из тюрьмы.');
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Срок в тюрьме убывает с каждым новым игровым днём сессии (gameDayCounter). jailDayDone в сессии —
    // чтобы два открытых окна мастера не списали один день дважды. Срок вышел — игрок свободен.
    let _gmJailBusy = false;
    function gmJailDayWatch(d) {
        if (!currentCode || !d || _gmJailBusy) return;
        const day = parseInt(d.gameDayCounter) || 0;
        const ref = db.collection('sessions').doc(currentCode);
        if (d.jailDayDone == null) { ref.update({ jailDayDone: day }).catch(() => { }); return; }
        if (day <= (parseInt(d.jailDayDone) || 0)) return;
        _gmJailBusy = true;
        let passed = 0;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const dd = doc.data() || {};
            const t0 = parseInt(dd.gameDayCounter) || 0, d0 = parseInt(dd.jailDayDone) || 0;
            passed = 0;
            if (t0 <= d0) return;
            passed = t0 - d0;
            tx.update(ref, { jailDayDone: t0 });
        })).then(() => {
            if (!passed) return;
            const parts = (lastData && lastData.participants) || {};
            return Promise.all(Object.keys(parts).map(uid => {
                const cref = db.collection('characters').doc(uid);
                let freed = false;
                return db.runTransaction(tx => tx.get(cref).then(doc => {
                    const cs = (doc.data() || {}).crimeState;
                    if (!cs || !cs.inJail) return;
                    const left = Math.max(0, (parseInt(cs.jailDaysRemaining) || 0) - passed);
                    freed = left <= 0;
                    tx.update(cref, { crimeState: Object.assign({}, cs, freed ? { inJail: false, jailHold: '', jailDaysRemaining: 0 } : { jailDaysRemaining: left }) });
                })).then(() => { if (freed) gmPostLogEntryText(`🔓 ${(parts[uid] || {}).name || 'Игрок'}: срок в тюрьме вышел — на свободе.`); });
            }));
        }).catch(e => console.error('Тюрьма — смена дня:', e)).then(() => { _gmJailBusy = false; });
    }

    function defaultSupernaturalState() {
        return {
            lycanthropy: false, vampirism: false,
            werewolf: { heartsEaten: 0, totem: HIRCINE_TOTEMS[0], hasTransformedToday: false, transformsToday: 0, isTransformed: false },
            vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {} },
            lich: null, faithShift: null, cult: null
        };
    }

    let currentGuildsData = defaultGuildsData();
