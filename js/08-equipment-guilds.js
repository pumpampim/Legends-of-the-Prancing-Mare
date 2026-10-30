
    // ========================================================================
    // НАБОРЫ ЭКИПИРОВКИ (эпик 2.3): запоминаем, что надето, и надеваем одним нажатием.
    // Хранятся только itemId — если вещь продана/передана, при надевании набора она просто пропускается с сообщением.
    // Слоты, которых нет в наборе, не трогаются (набор «надевает», но не раздевает).
    // ========================================================================
    const SET_KEY_TO_SLOT = { helmet: 'helmet', chest: 'chest', robe: 'robe', gloves: 'gloves', boots: 'boots', shield: 'shield', ring: 'ring', neck: 'amulet', circlet: 'circlet', backpack: 'backpack', meleeWeapon: 'melee', meleeWeaponOffhand: 'melee_offhand', rangedWeapon: 'ranged' };
    function renderEquipmentSets() {
        const box = document.getElementById('equipment-sets-list'); if (!box) return;
        box.innerHTML = equipmentSets.length ? equipmentSets.map(s => `<div class="stat-block" style="align-items:center;">
            <span><strong>${escHtml(s.name)}</strong> <span style="font-size:12px; opacity:.7;">(${Object.keys(s.slots).length} предм.)</span></span>
            <span><button type="button" style="width:auto; padding:2px 8px; font-size:13px;" onclick="applyEquipmentSet('${jsq(s.id)}')">Надеть</button>
            <button type="button" style="width:auto; padding:2px 8px; font-size:13px;" onclick="deleteEquipmentSet('${jsq(s.id)}')" title="Удалить набор">🗑</button></span></div>`).join('')
            : '<p style="opacity:.6; font-size:13px; margin:2px 0;">Наборов нет. Надень вещи и нажми «Сохранить надетое».</p>';
    }
    window.saveEquipmentSet = function () {
        const nameEl = document.getElementById('equipment-set-name');
        const name = (nameEl.value || '').trim();
        if (!name) { alert('Назови набор.'); return; }
        const slots = {};
        Object.keys(SET_KEY_TO_SLOT).forEach(k => { if (equippedSlots[k]) slots[k] = equippedSlots[k]; });
        if (!Object.keys(slots).length) { alert('Ничего не надето — нечего сохранять.'); return; }
        const same = equipmentSets.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (same) { same.slots = slots; }
        else {
            if (equipmentSets.length >= 5) { alert('Можно хранить не больше 5 наборов — удали один.'); return; }
            equipmentSets.push({ id: 'set_' + Date.now(), name: name, slots: slots });
        }
        nameEl.value = '';
        renderEquipmentSets(); saveLocalStorage();
        alchToast('🎽 Набор «' + escHtml(name) + '» сохранён');
    };
    window.applyEquipmentSet = function (id) {
        const set = equipmentSets.find(s => s.id === id); if (!set) return;
        const missing = [];
        // сначала то, что не конфликтует; корпус/одеяние идут по очереди сами (applyItemToSlot снимает парное)
        Object.keys(set.slots).forEach(k => {
            const item = playerInventory.find(i => i.itemId === set.slots[k]);
            if (!item) { missing.push(k); return; }
            if (equippedSlots[k] === item.itemId) return;
            applyItemToSlot(item, SET_KEY_TO_SLOT[k]);
        });
        updateAll(); saveLocalStorage();
        alchToast('🎽 Набор «' + escHtml(set.name) + '» надет' + (missing.length ? ' (часть вещей не найдена: ' + missing.length + ')' : ''));
    };
    window.deleteEquipmentSet = function (id) {
        equipmentSets = equipmentSets.filter(s => s.id !== id);
        renderEquipmentSets(); saveLocalStorage();
    };

    // ========================================================================
    // 📤 МАСТЕРУ (2.4), ПОРТРЕТ (2.6), ПРИВЫЧКИ (2.5), ОЧЕРЕДЬ КРАФТА (2.7), ЗАКАЗЫ NPC (2.8)
    // ========================================================================
    function stNum(id) { return parseInt((document.getElementById(id) || {}).value) || 0; }
    window.sendSheetToGm = function () {
        if (!window.CloudSync || !window.CloudSync.isInSession || !window.CloudSync.isInSession()) { alert('Ты не в сессии мастера.'); return; }
        const name = (document.getElementById('char-name') || {}).value || 'Игрок';
        const vit = (typeof getVitalsForSave === 'function') ? getVitalsForSave() : null;
        const hpEl = document.getElementById('cur-hp'), mpEl = document.getElementById('cur-mp');
        const lvl = stNum('char-level');
        const active = (playerQuests || []).filter(q => q.status === 'active').length;
        const text = `📤 ${name}: HP ${hpEl ? hpEl.value : '?'}/${(document.getElementById('max-hp') || {}).value || '?'}, MP ${mpEl ? mpEl.value : '?'}/${(document.getElementById('max-mp') || {}).value || '?'}, золото ${stNum('char-gold')}, ур. ${lvl}, заклинаний: ${(customSpells || []).length}, квестов активных: ${active}`;
        window.CloudSync.postCombatLog(text, name);
        alchToast('📤 Отправлено мастеру');
    };

    // ---- портрет: canvas → центр-кроп → 200×200 JPEG ≤80KB и миниатюра 48×48 для списка отряда ----
    function drawSquare(img, size, q) {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        return c.toDataURL('image/jpeg', q);
    }
    window.loadPortrait = function (input) {
        const f = input.files && input.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            const img = new Image();
            img.onload = () => {
                let q = 0.7, big = drawSquare(img, 200, q);
                while (big.length > 80 * 1024 * 1.37 && q > 0.2) { q -= 0.1; big = drawSquare(img, 200, q); }
                playerPortrait = big; playerPortraitThumb = drawSquare(img, 48, 0.6);
                renderPortrait(); saveLocalStorage(true);
            };
            img.onerror = () => alert('Не удалось прочитать картинку.');
            img.src = r.result;
        };
        r.readAsDataURL(f);
        input.value = '';
    };
    window.getPortraitThumb = function () { return playerPortraitThumb || ''; }; // cloud.js: аватар в списке отряда сразу при входе в сессию
    window.clearPortrait = function () { playerPortrait = ''; playerPortraitThumb = ''; renderPortrait(); saveLocalStorage(true); };
    function renderPortrait() {
        const p = document.getElementById('st-portrait-preview'); if (p) p.style.backgroundImage = playerPortrait ? 'url(' + playerPortrait + ')' : '';
        const d = document.getElementById('dock-portrait'); if (d) { d.style.backgroundImage = playerPortraitThumb ? 'url(' + playerPortraitThumb + ')' : ''; d.style.backgroundSize = 'cover'; if (playerPortraitThumb) d.textContent = ''; else d.textContent = ((document.getElementById('char-name') || {}).value || '?').charAt(0).toUpperCase(); }
    }

    // ---- привычки ----
    // Счётчик {n, last, declined}. n обнуляется, если с последнего действия прошло >7 дней; declined остаётся, пока не сбросят вручную (resetHabits()).
    const HABIT_KEY = 'skyrim_habits';
    function habitsLoad() { try { return JSON.parse(localStorage.getItem(HABIT_KEY)) || {}; } catch (e) { return {}; } }
    function habitsSave(h) { try { localStorage.setItem(HABIT_KEY, JSON.stringify(h)); } catch (e) { } }
    window.resetHabits = function () { try { localStorage.removeItem(HABIT_KEY); } catch (e) { } };
    function trackHabit(kind, key) {
        if (window._suppressHabits) return 0;
        const h = habitsLoad(); h[kind] = h[kind] || {};
        let c = h[kind][key] || { n: 0, last: 0, declined: false };
        if (c.last && Date.now() - c.last > 7 * 86400000) c.n = 0;
        c.n++; c.last = Date.now();
        h[kind][key] = c; habitsSave(h);
        return c.declined ? 0 : c.n;
    }
    function habitDecline(kind, key) { const h = habitsLoad(); if (h[kind] && h[kind][key]) { h[kind][key].declined = true; habitsSave(h); } }
    function habitFlag(kind, key) { const h = habitsLoad(); return !!(h[kind] && h[kind][key] && h[kind][key].flag); }
    function habitSetFlag(kind, key) { const h = habitsLoad(); h[kind] = h[kind] || {}; h[kind][key] = Object.assign(h[kind][key] || { n: 0, last: Date.now() }, { flag: true }); habitsSave(h); }

    // ---- очередь крафта (алхимия) ----
    window.queueBrew = function () {
        const picked = [0, 1, 2].map(i => document.getElementById('alch-ing-' + i).value).filter(Boolean);
        if (picked.length < 2 || new Set(picked).size !== picked.length) { alert('Выбери 2–3 разных ингредиента.'); return; }
        craftQueue.push({ id: 'cq_' + Date.now() + Math.random().toString(36).slice(2, 5), type: 'alchemy', params: { ingredients: picked, mode: (document.getElementById('alch-brew-mode') || {}).value || '' }, status: 'queued' });
        renderCraftQueue(); saveLocalStorage();
        alchToast('⏳ В очереди на ночь: ' + escHtml(picked.join(' + ')));
    };
    window.removeFromCraftQueue = function (id) { craftQueue = craftQueue.filter(q => q.id !== id); renderCraftQueue(); saveLocalStorage(); };
    function renderCraftQueue() {
        const box = document.getElementById('craft-queue-list'); if (!box) return;
        box.innerHTML = craftQueue.length ? '<div style="font-size:13px; opacity:.8;">⏳ Сварится за ночь:</div>' + craftQueue.map(q => `<div class="stat-block" style="align-items:center;"><span style="font-size:13px;">${escHtml(q.params.ingredients.join(' + '))}</span><button type="button" style="width:auto; padding:1px 7px; font-size:12px;" onclick="removeFromCraftQueue('${jsq(q.id)}')">✕</button></div>`).join('') : '';
    }
    // Вызывается из nextDay. Использует настоящую brewPotion (подставляя выбор в селекты), поэтому все перки/расход/рецепты — те же, что при ручной варке.
    window.processCraftQueue = function () {
        const queued = craftQueue.filter(q => q.status === 'queued');
        if (!queued.length) return null;
        let ok = 0, fail = 0; const failNotes = [];
        window._suppressHabits = true;
        try {
            queued.forEach(q => {
                const ings = q.params.ingredients;
                const lack = ings.find(n => countInInventory(n) <= 0);
                if (lack) { q.status = 'fail'; fail++; failNotes.push('не хватило «' + lack + '»'); return; }
                renderAlchIngredientSelects();
                [0, 1, 2].forEach(i => { document.getElementById('alch-ing-' + i).value = ings[i] || ''; });
                if (q.params.mode) { const m = document.getElementById('alch-brew-mode'); if (m) m.value = q.params.mode; }
                brewPotion();
                const res = (document.getElementById('alch-brew-result') || {}).textContent || '';
                if (res.indexOf('Получилось') !== -1) { q.status = 'done'; ok++; } else { q.status = 'fail'; fail++; failNotes.push('варево не получилось'); }
            });
        } finally { window._suppressHabits = false; }
        craftQueue = [];
        renderCraftQueue();
        return 'За ночь: сварено ' + ok + (fail ? ', провалилось ' + fail + ' (' + failNotes.join('; ') + ')' : '') + '.';
    };

    // ---- заказы NPC (приходят от мастера командой craftOrder) ----
    // Вещи для заказа — по названию, в любой стопке: выкованная с бонусом Зенитара (#zen), заточенная, выкупленная у торговца.
    // Зачарованные («Имя [Чары]») сюда не попадают. Сначала идёт обычная стопка, краденая — последней.
    function craftOrderStacks(itemName) {
        const rank = i => i.itemId === itemName ? 0 : /#stolen$/.test(i.itemId) ? 2 : 1;
        return playerInventory.filter(i => i.name === itemName && (i.count || 0) > 0).sort((a, b) => rank(a) - rank(b));
    }
    function craftOrderHave(itemName) { return craftOrderStacks(itemName).reduce((n, i) => n + i.count, 0); }
    function renderCraftOrders() {
        const box = document.getElementById('craft-orders-list'); if (!box) return;
        const active = craftOrders.filter(o => o.status === 'active');
        box.innerHTML = active.length ? active.map(o => `<div class="stat-block" style="align-items:center;">
            <span><strong>${escHtml(o.npc)}</strong>${o.hold ? ' <span style="opacity:.7; font-size:12px;">(' + escHtml(o.hold) + ')</span>' : ''}: ${o.qty}× ${escHtml(o.itemName)} → ${formatNumber(o.reward)} зол.
            <span style="font-size:12px; opacity:.7;">(есть: ${craftOrderHave(o.itemName)})${o.shared ? ' · общий: награду получит первый сдавший' : ''}</span></span>
            <button type="button" style="width:auto; padding:2px 8px; font-size:13px;" onclick="deliverCraftOrder('${jsq(o.id)}')">Сдать</button></div>`).join('')
            : '<p style="opacity:.6; font-size:13px; margin:2px 0;">Заказов нет.</p>';
    }
    window.deliverCraftOrder = function (id) {
        const o = craftOrders.find(x => x.id === id && x.status === 'active'); if (!o) return;
        if (craftOrderHave(o.itemName) < o.qty) { alert('Не хватает: нужно ' + o.qty + '× ' + o.itemName + ', у тебя ' + craftOrderHave(o.itemName) + '.'); return; }
        if (o.shared && !o.claimed) { // заказ «всем»: сначала занимаем его в сессии — сдать может только первый
            if (!window.CloudSync || !window.CloudSync.claimCraftOrder) { alert('Общий заказ сдаётся только в сессии.'); return; }
            window.CloudSync.claimCraftOrder(o.id, stMyName()).then(() => { o.claimed = true; window.deliverCraftOrder(id); })
                .catch(e => { o.status = 'taken'; renderCraftOrders(); saveLocalStorage(true); alert(e.message || ('Ошибка: ' + e)); });
            return;
        }
        { let left = o.qty;
          craftOrderStacks(o.itemName).forEach(st => { if (left <= 0) return; const t = Math.min(left, st.count); st.count -= t; left -= t; });
          playerInventory = playerInventory.filter(i => !(i.name === o.itemName && i.count <= 0));
          unequipVanishedItems(); }
        const g = document.getElementById('char-gold'); g.value = (parseInt(g.value) || 0) + (parseInt(o.reward) || 0);
        o.status = 'done';
        renderCraftOrders(); renderInventoryList(); updateAll(); saveLocalStorage(true);
        if (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession()) window.CloudSync.postCombatLog('📋 ' + stMyName() + ' сдал заказ «' + o.npc + '»: ' + o.qty + '× ' + o.itemName + ' (+' + o.reward + ' зол.)', stMyName());
        alchToast('📋 Заказ сдан: +' + o.reward + ' зол.');
    };
    function stMyName() { return (document.getElementById('char-name') || {}).value || 'Игрок'; }
    // Общий заказ уже сдал другой игрок — у остальных он закрывается.
    window.processCraftOrderClaims = function (claims) {
        const me = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        let changed = false;
        craftOrders.forEach(o => {
            const c = claims && claims[o.id];
            if (o.shared && o.status === 'active' && c && c.uid !== me) { o.status = 'taken'; changed = true; alchToast('📋 Заказ «' + escHtml(o.npc) + '» уже сдал(а) ' + escHtml(c.name || 'другой игрок')); }
        });
        if (changed) { renderCraftOrders(); saveLocalStorage(true); }
    };
    function handleCraftOrderCmd(e) {
        if (craftOrders.some(o => o.id === e.orderId)) return;
        craftOrders.push({ id: e.orderId, npc: e.npc, hold: e.hold || '', itemName: e.itemName, qty: parseInt(e.qty) || 1, reward: parseInt(e.reward) || 0, status: 'active', shared: !!e.shared });
        renderCraftOrders(); saveLocalStorage(true);
        alchToast('📋 Новый заказ от ' + escHtml(e.npc));
    }

    // ========================================================================
    // ПОДСУМОК
    // ========================================================================

    function getPouchCapacity() {
        const itemId = equippedSlots.pouch;
        if (!itemId) return 0;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return 0;
        if (item.capacity) return item.capacity;
        // Самолечение: у игроков, которым подсумок выдали ДО фикса дубля в базе предметов
        // (старая запись без capacity), сохранённый предмет так и остаётся без capacity —
        // код-фикс не чинит задним числом уже сохранённые данные. Ищем правильное значение по
        // имени в актуальной базе, а не молча считаем вместимость нулевой.
        const canonical = (window.allItems || []).find(i => i.name === item.name && i.category === 'Подсумки');
        return canonical ? canonical.capacity : 0;
    }

    // ========================================================================
    // КВЕСТЫ (выдаются мастером, отмечаются игроком)
    // ========================================================================

    // Задача K: квестодатели по каждой гильдии — из Фракции.xlsx (кто выдаёт задания, за сколько,
    // какие условия). Оплата не всегда фиксированный "за квест" септим — где в источнике так
    // написано (напр. Тёмное братство/Стража Рассвета), так и указано.
    const GUILD_NAMES = ['Гильдия воров', 'Соратники', 'Коллегия магов', 'Тёмное братство', 'Стража Рассвета', 'Бойцовский клуб', 'Коллегия бардов'];

    let playerGuildsData = null;
    let playerReputationByRegion = null;
    let playerSupernaturalState = null;
    let playerCrimeState = null;
    function inJailNow() { return !!(playerCrimeState && playerCrimeState.inJail); }
    const JAIL_BLOCK_TEXT = '🔒 Ты в тюрьме: доступны только короткий и длительный отдых («Следующий день»).';

    // Задача L: показывает активное сверхъестественное состояние на листе игрока, с кнопками
    // "Превратиться"/"Покормиться" — те же данные, что мастер видит и правит у себя.
    function renderSupernaturalStatusPlayer() {
        const el = document.getElementById('supernatural-status-player');
        if (!el) return;
        const s = playerSupernaturalState;
        if (!s || (!s.lycanthropy && !s.vampirism && !lichStatusHtml())) {
            el.innerHTML = '<p style="opacity:.6; font-size:13px;">Нет сверхъестественного состояния.</p>';
            if (typeof renderLordPerks === 'function') renderLordPerks();
            return;
        }
        let html = '';
        if (s.lycanthropy) {
            const w = s.werewolf;
            html += `<div class="party-row">
                <div class="row-name"><strong>🐺 Ликантропия</strong><span>${w.heartsEaten || 0} сердец</span></div>
                <div style="font-size:12px; opacity:.85;">Тотем: ${escHtml(w.totem || '— нет —')} · ${w.isTransformed ? `Сейчас в форме зверя (осталось ${typeof w.hoursLeft === 'number' ? w.hoursLeft : wolfFormHours()} ч — час отмечает мастер)` : (snTransformsLeft() <= 0 ? 'Превращения на сегодня закончились' : 'Превращение доступно')} · осталось превращений: ${snTransformsLeft()}/${TRANSFORMS_PER_DAY}</div>
                ${!w.isTransformed && snTransformsLeft() > 0 ? `<button class="btn-success" style="width:100%; margin-top:4px;" onclick="playerTransformWerewolf()">Превратиться в зверя</button>` : ''}
                ${w.isTransformed ? `<button class="btn-danger" style="width:100%; margin-top:4px;" onclick="playerRevertWerewolf()">Вернуть человеческий облик</button>` : ''}
            </div>`;
        }
        if (s.vampirism) {
            const v = s.vampire;
            const period = (window.CloudSync && window.CloudSync.getSessionData() && window.CloudSync.getSessionData().timePeriod) || null;
            const sunWarning = period === 'День' ? '<br><span style="color:#e74c3c;">☀️ Сейчас день — уязвимость к солнцу: входящий урон ×2!</span>' : '';
            html += `<div class="party-row">
                <div class="row-name"><strong>🧛 Вампиризм</strong><span>🩸 Голод по крови: ${v.hungerStage || 0}/4</span></div>
                <div style="font-size:12px; opacity:.85;">+2 Хар, +1 Лов, +1 Сил · холод +50%, яды и болезни — иммунитет, огонь −50%${sunWarning}${vampHunger() ? `<br><span style="color:#e67e22;">🩸 Голод: −${vampHungerStatPenalty()} ко всем характеристикам${vampHungerResistDelta() ? `, холод +${vampHungerResistDelta()}% , огонь −${vampHungerResistDelta()}%` : ''}</span>` : ''}${vampHunger() >= 4 ? '<br><span style="color:#e74c3c;">🚨 4-й день без крови: стража нападает на сайт, местные жители бегут или нападают!</span>' : ''}</div>
                <div style="display:flex; gap:6px; margin-top:4px;">
                    <button class="btn-danger" style="flex:1;" onclick="playerVampireDrink('victim')">🩸 Выпить кровь</button>
                    <button style="flex:1;" onclick="playerVampireDrink('potion')" title="Зелье крови заменяет кровь жертвы">🍷 Зелье крови (${countInInventory('Зелье крови')})</button>
                </div>
                ${v.isLord ? `<div style="font-size:12px; margin-top:3px;">🦇 <strong>Вампир-лорд</strong> · ${v.lordForm ? 'сейчас в форме лорда' : 'обычный облик'}</div>
                <button class="${v.lordForm ? 'btn-danger' : 'btn-success'}" style="width:100%; margin-top:4px;" onclick="playerToggleLordForm()">${v.lordForm ? 'Вернуть обычный облик' : 'Принять форму вампира-лорда'}</button>` : ''}
            </div>`;
        }
        html += lichStatusHtml();
        el.innerHTML = html;
        if (typeof renderLordPerks === 'function') renderLordPerks();
    }

    // Голод по крови — отдельный от обычного голода (еды). Выпить кровь жертвы или «Зелье крови» → сытость (стадия 0).
    window.playerVampireDrink = function (src, itemIdArg) {
        if (!playerSupernaturalState || !playerSupernaturalState.vampirism) return;
        const v = playerSupernaturalState.vampire;
        if (src === 'potion') {
            const pot = itemIdArg ? playerInventory.find(i => i.itemId === itemIdArg) : playerInventory.find(i => i.name === 'Зелье крови' && i.count > 0);
            if (!pot || pot.count <= 0) { alert('В инвентаре нет «Зелья крови».'); return; }
            removeFromInventoryByName(pot.itemId, 1);
            renderInventoryList();
        } else if (!confirm('Выпить кровь жертвы? Голод по крови сбросится до 0. (Жертву и сцену определяет мастер.)')) return;
        const before = v.hungerStage || 0;
        v.hungerStage = 0;
        if (v.isLord && !v.lordPoolFedToday) { v.lordPool = LORD_POOL_MAX; v.lordPoolFedToday = true; } // голод утолён — запас лорда снова 10 (раз в день)
        saveSupernaturalStatePlayer();
        renderSupernaturalStatusPlayer();
        saveLocalStorage();
        if (window.CloudSync && window.CloudSync.postCombatLog) {
            const nm = (document.getElementById('char-name') || {}).value || 'Вампир';
            window.CloudSync.postCombatLog(`🩸 ${nm} ${src === 'potion' ? 'выпивает «Зелье крови»' : 'пьёт кровь жертвы'} — голод по крови ${before} → 0.`, nm);
        }
        alert(`🩸 Голод по крови: ${before} → 0.`);
    };

    window.playerTransformWerewolf = function () {
        if (!playerSupernaturalState) return;
        if (snTransformsLeft() <= 0) { alert('Сегодня ты уже превращался(лась) — превращение доступно раз в сутки.'); return; }
        playerSupernaturalState.werewolf.isTransformed = true;
        playerSupernaturalState.werewolf.hoursLeft = wolfFormHours(); // 4 игровых часа, с «Вечным голодом» (15 сердец) — 8
        playerSupernaturalState.werewolf.transformsToday = (parseInt(playerSupernaturalState.werewolf.transformsToday) || 0) + 1;
        playerSupernaturalState.werewolf.hasTransformedToday = snTransformsLeft() <= 0;
        saveSupernaturalStatePlayer();
        renderSupernaturalStatusPlayer();
        updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        if (window.CloudSync && window.CloudSync.postCombatLog) {
            const myName = document.getElementById('char-name').value;
            window.CloudSync.postCombatLog(`🐺 ${myName} обращается в зверя!`, myName);
        }
    };

    function wolfFormHours() { // 4 ч, с «Вечным голодом» (15 сердец) — 8; Шкура Спасителя: +6 ч
        return (((playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.heartsEaten) || 0) >= 15 ? 8 : 4) + (getGearSpecialBonuses().wolfHours || 0);
    }
    window.playerRevertWerewolf = function () {
        if (!playerSupernaturalState) return;
        playerSupernaturalState.werewolf.isTransformed = false;
        playerSupernaturalState.werewolf.hoursLeft = 0;
        snClearBoundSummons('werewolf');
        saveSupernaturalStatePlayer();
        renderSupernaturalStatusPlayer();
        updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
    };

    function saveSupernaturalStatePlayer() {
        if (!window.CloudSync || !playerSupernaturalState || typeof window.CloudSync.saveOwnSupernaturalState !== 'function') return;
        window.CloudSync.saveOwnSupernaturalState(playerSupernaturalState).catch(e => console.error('Ошибка сохранения сверхъестественного состояния:', e));
    }


    // То же самое, что и в gm.js (разные файлы, поэтому дублируется) — ранги гильдий.
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
    // Старый формат (голое число) → {member:true, orders:N}, чтобы не потерять прогресс.
    function normalizePlayerGuildEntry(v) {
        if (typeof v === 'number') return { member: v > 0, orders: v };
        if (v && typeof v === 'object') return { member: !!v.member, orders: parseInt(v.orders) || 0, artifacts: parseInt(v.artifacts) || 0 };
        return { member: false, orders: 0 };
    }

    // Эпик 5.2. Блок на главной: только гильдии с member:true; круг показывает путь до следующего ранга. Клик открывает вкладку с гильдиями.
    function renderMyGuildsHome() {
        const box = document.getElementById('my-guilds-block'), list = document.getElementById('my-guilds-list');
        if (!box || !list) return;
        const data = playerGuildsData || {};
        const joined = GUILD_NAMES.filter(g => normalizePlayerGuildEntry(data[g]).member);
        box.style.display = joined.length ? '' : 'none';
        list.innerHTML = joined.map(g => {
            const gd = normalizePlayerGuildEntry(data[g]);
            const tiers = GUILD_RANK_TIERS[g] || [{ at: 0, name: 'Новичок' }];
            const r = getGuildRank(g, gd.orders);
            const cur = tiers.filter(t => t.at <= gd.orders).pop() || tiers[0];
            const pct = r.next ? Math.round((gd.orders - cur.at) / (r.next.at - cur.at) * 100) : 100;
            const C = 2 * Math.PI * 18, dash = (C * pct / 100).toFixed(1);
            return `<div class="st-guild-chip" onclick="openGuildsTab()" style="cursor:pointer; display:flex; gap:8px; align-items:center; border:1px solid var(--border-color); border-radius:8px; padding:6px 10px;" title="Открыть вкладку с гильдиями">
                <svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="18" fill="none" stroke="#3b2f1d" stroke-width="5"/><circle class="st-guild-ring" cx="23" cy="23" r="18" fill="none" stroke="#c8a566" stroke-width="5" stroke-dasharray="${dash} ${C.toFixed(1)}" transform="rotate(-90 23 23)"/><text x="23" y="27" text-anchor="middle" font-size="11" fill="#e8dcc0">${pct}%</text></svg>
                <div><strong>${escHtml(g)}</strong><div style="font-size:13px; opacity:.85;">${escHtml(r.rankName)}${r.next ? ` · ${gd.orders}/${r.next.at}` : ' · макс. ранг'}</div></div></div>`;
        }).join('');
    }
    window.openGuildsTab = function () {
        const b = document.getElementById('tab5-btn'); if (b) b.click();
        setTimeout(() => { const p = document.getElementById('guild-panel-player'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
    };
    function renderGuildPanelPlayer() {
        const el = document.getElementById('guild-panel-player');
        try { renderTrainSection(); } catch (e) { console.error(e); }
        try { renderMyGuildsHome(); } catch (e) { console.error(e); }
        if (!el) return;
        const data = playerGuildsData || {};
        // Только гильдии, в которые мастер реально принял игрока — не все 7 сразу.
        const joined = GUILD_NAMES.filter(g => normalizePlayerGuildEntry(data[g]).member);
        if (!joined.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:13px;">Ты пока ни в одной гильдии не состоишь — членство назначает мастер.</p>';
            return;
        }
        el.innerHTML = joined.map(g => {
            const gd = normalizePlayerGuildEntry(data[g]);
            const rank = getGuildRank(g, gd.orders);
            // Коллегия бардов считает прогресс ЛЕГЕНДАРНЫМИ ПЕСНЯМИ (используем то же поле orders),
            // а не заказами — сдача историй. предмета в музей коллегии даёт +1 песню + 800 золота,
            // раньше эта механика была только текстом в справочнике мастера.
            const museumBtn = g === 'Коллегия бардов'
                ? `<button class="btn-success" style="width:100%; margin-top:4px; font-size:12px;" onclick="donateToBardMuseum()">🏛️ Сдать историческое оружие/броню в музей (+1 песня, +800 золота)</button>
                   <div style="font-size:11px; opacity:.6; margin-top:2px;">Артефактов сдано: ${gd.artifacts || 0}${(gd.artifacts || 0) >= 25 ? ' — макс! (тан Солитьюда, см. мастера)' : ''}</div>`
                : '';
            let compBtns = '';
            if (g === 'Гильдия воров' && gd.orders >= 5) {
                const wk = Math.floor(gameDayIndex() / 7), got = trainState.thiefApprWeek === wk;
                compBtns = `<button class="btn-success" style="width:100%; margin-top:4px; font-size:12px;" ${got ? 'disabled' : ''} onclick="collectThiefApprentice()">🧒 Доход «ученика»: 250 септимов${got ? ' (на этой неделе уже получен)' : ''}</button>`;
            }
            if (g === 'Соратники') {
                compBtns = `<div style="font-size:12px; opacity:.85; margin-top:2px;">🔨 Скидка 10% у кузнецов (независимо от Красноречия) · награды: при вступлении — небесное оружие, 5 поручений — волчья броня, 15 — зачарованное небесное оружие, 20 — зачарованная волчья броня</div>` +
                    companionsPendingRewards().map(k => `<button class="btn-success" style="width:100%; margin-top:4px; font-size:12px;" onclick="openCompanionsReward('${k}')">${({ joinWeapon: '🗡 Получить небесное оружие (вступление)', wolfArmor: '🛡 Получить волчью броню (5 поручений)', weapon: '🗡 Получить зачарованное небесное оружие (15 поручений)', armor: '🛡 Получить зачарованную волчью броню (20 поручений)' })[k]}</button>`).join('') +
                    `<div style="font-size:11px; opacity:.6;">Получено: ${companionRewards.weapon ? 'оружие ✓' : 'оружие —'} · ${companionRewards.armor ? 'броня ✓' : 'броня —'}</div>`;
            }
            return `
            <div class="party-row">
                <div class="row-name"><strong>${escHtml(g)}</strong><span>${escHtml(rank.rankName)}${rank.next ? ` (ещё ${rank.next.at - gd.orders} до «${escHtml(rank.next.name)}»)` : ' (макс. ранг)'}</span></div>
                <div style="font-size:12px; opacity:.7;">${g === 'Коллегия бардов' ? 'Легендарных песен' : 'Заказов выполнено'}: ${gd.orders}</div>
                ${museumBtn}${compBtns}
            </div>`;
        }).join('');
    }

    // Сдать предмет в музей коллегии бардов — +1 легендарная песня (тот же счётчик orders) +
    // 800 золота, +1 к отдельному счётчику артефактов (нужен для порога "18 песен + 2 артефакта"
    // и главного приза за 25 сданных предметов). guildsData НЕ входит в обычное сохранение
    // игрока (это поле обычно правит только мастер) — пишем напрямую через CloudSync, атомарно.
    window.donateToBardMuseum = function () {
        if (!window.CloudSync || !window.CloudSync.donateBardArtifact) return;
        if (!confirm('Подать заявку на сдачу исторического или мифического оружия/брони в музей коллегии? Предмет нужно отдать мастеру — награду (+1 песня, +800 золота) начислит он, приняв заявку.')) return;
        window.CloudSync.donateBardArtifact().then(() => {
            alert('Заявка отправлена мастеру. Награду начислит он после сдачи предмета.');
        }).catch(e => alert(e.message || ('Ошибка: ' + e)));
    };

    // ======================================================================
    // КОЛЛЕГИЯ БАРДОВ: выступление, записная книга, Баллада / Сила слова / Воодушевление
    // ======================================================================
    let bardSongs = [];          // [{id, title, text}]
    let bardEditId = null;
    const BARD_PERFORM_DEFAULT_LIMIT = 3; // выступлений в игровой день (мастер меняет в «Лимитах игроков»)
    function bardInfo() { return normalizePlayerGuildEntry((playerGuildsData || {})['Коллегия бардов']); }
    function bardIsMember() { return !!bardInfo().member; }
    function bardRankOrders() { return bardInfo().orders; }
    // Репутация — число из документа, игроку не показывается; здесь она используется только в формуле.
    function bardRepNow() {
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const hold = sess && sess.currentHold;
        return (hold && playerReputationByRegion) ? (Number(playerReputationByRegion[repHoldKey(hold)]) || 0) : 0;
    }
    // Выручка за выступление: 10 × 2к10 × (0.1 + 0.005 × репутация во владении) × Красноречие, вверх, минимум 30.
    function bardPerformGold(dice, speech, rep) {
        const factor = Math.max(0, 0.1 + 0.005 * rep);
        return Math.max(30, Math.ceil(10 * dice * factor * speech - 1e-9));
    }
    window.bardPerformGold = bardPerformGold;
    window.bardPerform = function () {
        const resEl = document.getElementById('bard-perform-result');
        if (!bardIsMember()) { if (resEl) resEl.textContent = 'Ты не состоишь в Коллегии бардов.'; return; }
        const lim = gmLimit('perform', BARD_PERFORM_DEFAULT_LIMIT), st = dayState();
        if (lim > 0 && (st.acts.perform || 0) >= lim) {
            resEl.innerHTML = `<span style="color:#e67e22;">На сегодня выступлений хватит (${lim} в день, лимит задаёт мастер).</span>`;
            return;
        }
        const r1 = 1 + Math.floor(Math.random() * 10), r2 = 1 + Math.floor(Math.random() * 10);
        const speech = getSkillRawValue('Красноречие') + gb('speech');
        const gold = bardPerformGold(r1 + r2, speech, bardRepNow());
        st.acts.perform = (st.acts.perform || 0) + 1;
        const goldInput = document.getElementById('char-gold');
        goldInput.value = (parseInt(goldInput.value) || 0) + gold;
        const myName = (document.getElementById('char-name') || {}).value || 'Бард';
        resEl.innerHTML = `🎤 Выступление: 2к10 = ${r1}+${r2}. Заработано <strong style="color:var(--accent-color);">${gold}</strong> септимов.` + (lim > 0 ? ` <span style="opacity:.7;">(сегодня ${st.acts.perform}/${lim})</span>` : '');
        try { if (window.CloudSync && window.CloudSync.postCombatLog && window.CloudSync.getSessionData && window.CloudSync.getSessionData()) window.CloudSync.postCombatLog(`🎤 ${myName} выступает перед публикой.`, myName); } catch (e) { }
        saveLocalStorage();
    };

    function renderBardSection() {
        const wrap = document.getElementById('prof-bard-wrap');
        if (!wrap) return;
        const info = bardInfo();
        wrap.style.display = info.member ? '' : 'none';
        if (!info.member) return;
        const st = document.getElementById('bard-status');
        const lim = gmLimit('perform', BARD_PERFORM_DEFAULT_LIMIT), used = dayState().acts.perform || 0;
        if (st) st.textContent = `Легендарных песен: ${info.orders}. Выступлений сегодня: ${used}${lim > 0 ? ' из ' + lim : ''}. «Бардовская баллада» и «Воодушевление» — во вкладке «Заклинания» → «Особые способности».`;
        const list = document.getElementById('bard-songs-list');
        if (list) {
            list.innerHTML = bardSongs.length ? bardSongs.map(sg => `<div class="party-row">
                <div class="row-name"><strong>${escHtml(sg.title)}</strong></div>
                <div style="font-size:13px; white-space:pre-wrap; opacity:.9;">${escHtml(sg.text || '')}</div>
                <div style="display:flex; gap:6px; margin-top:4px;"><button style="flex:1;" onclick="bardEditSong('${jsq(sg.id)}')">Править</button><button class="btn-danger" style="flex:1;" onclick="bardDeleteSong('${jsq(sg.id)}')">Удалить</button></div>
            </div>`).join('') : '<p style="opacity:.6; font-size:13px;">Пока пусто — запиши первую песню.</p>';
        }
    }
    window.renderBardSection = renderBardSection;
    window.bardSaveSong = function () {
        const title = (document.getElementById('bard-song-title').value || '').trim().slice(0, 60);
        const text = (document.getElementById('bard-song-text').value || '').slice(0, 2000);
        if (!title) { alert('Назови песню.'); return; }
        if (bardEditId) {
            const sg = bardSongs.find(x => x.id === bardEditId);
            if (sg) { sg.title = title; sg.text = text; }
        } else {
            if (bardSongs.length >= 50) { alert('В книге уже 50 песен — удали лишние.'); return; }
            bardSongs.push({ id: 'song-' + Date.now() + Math.random().toString(36).slice(2, 6), title, text });
        }
        bardEditId = null;
        document.getElementById('bard-song-title').value = ''; document.getElementById('bard-song-text').value = '';
        document.getElementById('bard-song-save-label').textContent = 'Сохранить песню';
        renderBardSection(); saveLocalStorage();
    };
    window.bardEditSong = function (id) {
        const sg = bardSongs.find(x => x.id === id); if (!sg) return;
        bardEditId = id;
        document.getElementById('bard-song-title').value = sg.title; document.getElementById('bard-song-text').value = sg.text || '';
        document.getElementById('bard-song-save-label').textContent = 'Сохранить изменения';
        document.getElementById('bard-song-title').focus();
    };
    window.bardDeleteSong = function (id) {
        const sg = bardSongs.find(x => x.id === id); if (!sg) return;
        if (!confirm('Удалить песню «' + sg.title + '»?')) return;
        bardSongs = bardSongs.filter(x => x.id !== id);
        if (bardEditId === id) bardEditId = null;
        renderBardSection(); saveLocalStorage();
    };

    // --- Бардовская баллада (4+ песни): пока бард играет, остальные игроки +1 к кубам, сам бард не атакует ---
    function bardSongNow() {
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        return sess && sess.bardSong ? sess.bardSong : null;
    }
    function iAmPlayingBallad() {
        const song = bardSongNow(), uid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        return !!(song && uid && song.uid === uid);
    }
    window.toggleBardBallad = function () {
        if (!bardIsMember() || bardRankOrders() < 4) { alert('«Бардовская баллада» открывается с 4 легендарных песен.'); return; }
        if (!window.CloudSync || !window.CloudSync.setBardSong) { alert('Нет соединения с сессией.'); return; }
        const on = !iAmPlayingBallad();
        const myName = (document.getElementById('char-name') || {}).value || 'Бард';
        window.CloudSync.setBardSong(on, myName).then(() => {
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(on ? `🎵 ${myName} начинает «Бардовскую балладу»: союзникам +1 к кубам, пока играет.` : `🎵 ${myName} заканчивает балладу.`, myName);
            renderPowersPanel();
        }).catch(e => alert(e.message || ('Ошибка: ' + e)));
    };
    function stopBalladIfMine() { if (iAmPlayingBallad() && window.CloudSync && window.CloudSync.setBardSong) window.CloudSync.setBardSong(false).catch(() => { }); }
    // Воодушевление (18+ песен и 2 сданных исторических артефакта, Фракции.xlsx): 2 раза в день, +3 к кубам всем союзникам
    // (заряд на ближайший бросок каждого союзника в сессии).
    const BARD_INSPIRE_PER_DAY = 2;
    function bardArtifactsDonated() { return Number(((playerGuildsData || {})['Коллегия бардов'] || {}).artifacts) || 0; }
    window.bardInspire = function () {
        if (!bardIsMember() || bardRankOrders() < 18) { alert('«Воодушевление» открывается с 18 легендарных песен.'); return; }
        if (bardArtifactsDonated() < 2) { alert('Для «Воодушевления» нужно ещё сдать в музей коллегии 2 исторических артефакта (сдано: ' + bardArtifactsDonated() + ').'); return; }
        if ((powersUsedToday.bard_inspire || 0) >= BARD_INSPIRE_PER_DAY) { alert('Воодушевление уже использовано ' + BARD_INSPIRE_PER_DAY + ' раза сегодня.'); return; }
        if (!window.CloudSync || !window.CloudSync.giveInspire) { alert('Нет соединения с сессией.'); return; }
        const sess = window.CloudSync.getSessionData();
        const myUid = window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const allies = Object.keys((sess && sess.participants) || {}).filter(uid => uid !== myUid);
        if (!allies.length) { alert('В сессии нет союзников.'); return; }
        const myName = (document.getElementById('char-name') || {}).value || 'Бард';
        Promise.all(allies.map(uid => window.CloudSync.giveInspire(uid, myName).then(() => uid).catch(() => null))).then(res => {
            const got = res.filter(Boolean);
            if (!got.length) { alert('Все союзники уже воодушевлены.'); return; }
            powersUsedToday.bard_inspire = (powersUsedToday.bard_inspire || 0) + 1;
            const names = got.map(uid => (sess.participants[uid] && sess.participants[uid].name) || 'союзник');
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`✨ ${myName} воодушевляет союзников: ${names.join(', ')} — +3 к ближайшему броску.`, myName);
            saveLocalStorage(); renderPowersPanel();
        });
    };
    function bardPowersHtml() {
        if (!bardIsMember()) return '';
        const orders = bardRankOrders();
        let html = '';
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        if (orders >= 4) {
            const playing = iAmPlayingBallad();
            html += `<div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:5px 8px;">
                <span style="flex:1 1 260px; min-width:0;"><strong>🎵 Бардовская баллада</strong> <span style="font-size:12px; opacity:.6;">🎶 Коллегия бардов</span><br><span style="font-size:13px; opacity:.85;">Пока играешь: все остальные игроки сессии получают +1 к кубам на все действия (атака, защита, проверки). Сам бард в это время никого атаковать не может.</span></span>
                <span style="font-size:13px; min-width:110px;">${playing ? '<span style="color:var(--accent-color);">играет…</span>' : (sess ? '<span style="color:#2ecc71;">доступна</span>' : '<span style="opacity:.7;">нужна сессия</span>')}</span>
                <button class="btn-success" style="width:auto; padding:3px 14px; margin:0;" ${sess ? '' : 'disabled'} onclick="toggleBardBallad()">${playing ? 'Закончить' : 'Играть'}</button></div>`;
        }
        if (orders >= 18) {
            const left = Math.max(0, BARD_INSPIRE_PER_DAY - (powersUsedToday.bard_inspire || 0));
            const arts = bardArtifactsDonated();
            html += `<div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:5px 8px;">
                <span style="flex:1 1 260px; min-width:0;"><strong>✨ Воодушевление</strong> <span style="font-size:12px; opacity:.6;">🎶 Коллегия бардов · ${BARD_INSPIRE_PER_DAY} раза в день</span><br><span style="font-size:13px; opacity:.85;">Все союзники в сессии получают +3 к ближайшему броску (атака или проверка).${arts < 2 ? ` Нужно сдать 2 исторических артефакта (сдано: ${arts}).` : ''}</span></span>
                <span style="font-size:13px; min-width:110px;">осталось: ${left}/${BARD_INSPIRE_PER_DAY}</span>
                <button class="btn-success" style="width:auto; padding:3px 14px; margin:0;" ${(left && sess && arts >= 2) ? '' : 'disabled'} onclick="bardInspire()">Применить</button></div>`;
        }
        return html;
    }
    // Бонус к кубам от сессии: Баллада (+1, если играет КТО-ТО ДРУГОЙ) и заряд Воодушевления (+4, расходуется
    // только когда consume=true — то есть при реальном броске игрока).
    function getSessionRollBonus(consume) {
        const out = { value: 0, notes: [] };
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const myUid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        if (!sess || !myUid) return out;
        if (sess.bardSong && sess.bardSong.uid && sess.bardSong.uid !== myUid) { out.value += 1; out.notes.push(`+1 «Бардовская баллада» (${sess.bardSong.name || 'бард'})`); }
        const insp = sess.inspire && sess.inspire[myUid];
        if (insp && insp.value) {
            out.value += insp.value; out.notes.push(`+${insp.value} «Воодушевление» от ${insp.fromName || 'барда'}`);
            if (consume && window.CloudSync.clearInspire) {
                window.CloudSync.clearInspire(myUid);
                try { sess.inspire = Object.assign({}, sess.inspire); delete sess.inspire[myUid]; } catch (e) { }
            }
        }
        return out;
    }
    window.getSessionRollBonus = getSessionRollBonus;

    // Эпик 5.1. Квесты как список дел: активные сверху, выполненные и отменённые — свёрнутыми группами внизу, фильтр по гильдии и счётчик.
    // Статусы: 'active' | 'done' | 'abandoned' (новый — старые сейвы не затронуты).
    function questCardHtml(q) {
        const st = q.status === 'done' ? '✅ Выполнен' : q.status === 'abandoned' ? '✕ Отменён' : q.status === 'review' ? '🕓 Ждёт подтверждения мастера' : '⏳ Активен';
        return `<div class="party-row" style="opacity:${(q.status === 'active' || q.status === 'review') ? 1 : 0.6};">
                <div class="row-name"><strong>${escHtml(q.title)}</strong><span>${st}</span></div>
                <div style="font-size:14px; margin:2px 0;">${escHtml(q.desc || '')}</div>
                ${q.requirement ? `<div style="font-size:13px; opacity:.8;">🎯 Нужно: ${escHtml(q.requirement)}</div>` : ''}
                ${q.reward ? `<div style="font-size:13px; opacity:.8;">🎁 Награда: ${escHtml(q.reward)}</div>` : ''}
                ${q.guild ? `<div style="font-size:13px; opacity:.8;">🏛️ Гильдия: ${escHtml(q.guild)}</div>` : ''}
                ${q.status === 'active' ? `<div style="display:flex; gap:6px; margin-top:4px;"><button style="flex:1;" onclick="markQuestDone('${jsq(q.id)}')">Отметить выполненным</button><button class="btn-danger" style="width:auto;" onclick="abandonQuest('${jsq(q.id)}')" title="Отменить квест">✕ Отменить</button></div>` : ''}
            </div>`;
    }
    window.abandonQuest = function (id) {
        const q = playerQuests.find(x => x.id === id); if (!q || q.status !== 'active') return;
        if (!confirm('Отменить квест «' + q.title + '»? Он уйдёт в отдельную группу «Отменённые».')) return;
        q.status = 'abandoned'; renderQuestList(); saveLocalStorage();
    };
    function renderQuestList() {
        const el = document.getElementById('quest-list');
        if (!el) return;
        const sum = document.getElementById('quest-summary'), fsel = document.getElementById('quest-guild-filter');
        if (!playerQuests.length) {
            if (sum) sum.textContent = ''; if (fsel) fsel.style.display = 'none';
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">Пока нет активных квестов.</p>';
            return;
        }
        // фильтр по гильдии (список строится из реально встречающихся)
        const guilds = Array.from(new Set(playerQuests.map(q => q.guild).filter(Boolean)));
        if (fsel) {
            const cur = fsel.value;
            fsel.innerHTML = '<option value="">Все квесты</option>' + guilds.map(g => `<option value="${escHtml(g)}">🏛️ ${escHtml(g)}</option>`).join('');
            fsel.value = guilds.indexOf(cur) !== -1 ? cur : '';
            fsel.style.display = guilds.length ? '' : 'none';
        }
        const f = fsel ? fsel.value : '';
        const list = playerQuests.filter(q => !f || q.guild === f);
        const act = list.filter(q => q.status !== 'done' && q.status !== 'abandoned');
        const done = list.filter(q => q.status === 'done'), ab = list.filter(q => q.status === 'abandoned');
        const total = list.length - ab.length;
        if (sum) sum.textContent = `Выполнено квестов: ${done.length} из ${total}`;
        el.innerHTML = (act.length ? act.map(questCardHtml).join('') : '<p style="opacity:.6; font-size:14px;">Активных квестов нет.</p>')
            + (done.length ? `<details style="margin-top:6px;"><summary style="cursor:pointer;">✅ Выполненные (${done.length})</summary>${done.map(questCardHtml).join('')}</details>` : '')
            + (ab.length ? `<details style="margin-top:6px;"><summary style="cursor:pointer;">✕ Отменённые (${ab.length})</summary>${ab.map(questCardHtml).join('')}</details>` : '');
    }

    // Задача "гильдии подробнее": пороги наград бронёй — только там, где в исходнике чётко
    // прописано "после N заказов" (Воры, Тёмное братство). У остальных гильдий награды либо не
    // по числу заказов (сердца оборотня/легендарные песни/турниры), либо не бронёй — для них
    // авто-выдачи пока нет, справочник по ним смотри у мастера.
    const GUILD_ARMOR_REWARDS = {
        'Гильдия воров': [
            { at: 5, items: ['Капюшон Умелого вора', 'Броня Умелого вора', 'Перчатки Умелого вора', 'Сапоги Умелого вора'] },
            { at: 10, items: ['Капюшон мастера вора', 'Броня мастера вора', 'перчатки мастера вора', 'Сапоги мастера вора'] },
            { at: 40, items: ['Капюшон соловья', 'Броня соловья', 'Перчатки соловья', 'Сапоги соловьи', 'Соловьиный клинок', 'Соловьиный лук'] }
        ],
        'Тёмное братство': [
            { at: 5, items: ['Древняя броня теней', 'Древние сапоги теней', 'Древние перчатки теней', 'Древний капюшон теней с маской'] },
            { at: 25, items: ['Кожа Ситиса', 'Когти Ситиса', 'Хвост Ситиса', 'Лицо Ситиса'] }
        ]
    };

    // Гильдия воров, после 5 заказов: «ученик» приносит 250 септимов в неделю.
    window.collectThiefApprentice = function () {
        const gd = normalizePlayerGuildEntry((playerGuildsData || {})['Гильдия воров']);
        if (!gd.member || gd.orders < 5) return;
        const wk = Math.floor(gameDayIndex() / 7);
        if (trainState.thiefApprWeek === wk) { alert('Доход ученика за эту неделю уже получен.'); return; }
        trainState.thiefApprWeek = wk;
        const g = document.getElementById('char-gold'); g.value = (parseInt(g.value) || 0) + 250;
        renderGuildPanelPlayer(); saveLocalStorage(true);
        alert('🧒 Ученик приносит 250 септимов.');
    };
    // Награда гильдии — с весом, слотом, бронёй/уроном и эффектом из базы (items-data.js, «Броня/Оружие гильдий»).
    function giveGuildRewardItem(name) {
        const p = (window.allItems || []).find(i => i.name === name) || {};
        const extra = { price: p.price };
        if (p.slot) extra.slot = p.slot;
        if (typeof p.armor === 'number') { extra.armorValue = p.armor; extra.armorType = p.armorType || 'Лёгкая'; }
        if (typeof p.damage === 'number') { extra.weaponDmg = p.damage; extra.weaponType = p.weaponType || (p.slot === 'ranged' ? 'ranged' : 'onehand'); }
        if (p.material) extra.material = p.material;
        addToInventory(name, name, 1, p.weight || 1, p.category || 'Броня (награда гильдии)', p.effect || '', extra);
    }

    // ====================== Соратники: скидка у кузнецов и награды за 15 / 20 поручений ======================
    // «Фракции.xlsx» → «Соратники»: −10% у кузнецов независимо от Красноречия; 15 поручений — небесное зачарованное
    // оружие (в 2 раза сильнее), 20 поручений — зачарованная волчья броня (в 1.5 раза сильнее; шлем и перчатки —
    // чары по выбору игрока, броня +40 ХП, сапоги +50 к грузоподъёмности).
    // «Поглотитель душ» (Зачарование): каждые 10 убийств существ (не людей) перезаряжают чары на 1 день.
    let soulEaterKills = 0;
    function soulEaterKill(enemy) {
        if (!(window.perkBonuses || {}).soulEater) return '';
        if (getEnemyMeta(enemy).kind === 'people') return '';
        soulEaterKills++;
        if (soulEaterKills >= 10) {
            soulEaterKills -= 10;
            let n = 0;
            playerInventory.forEach(function (i) { if (i.enchantment && Object.prototype.hasOwnProperty.call(i, 'chargeDaysLeft')) { i.chargeDaysLeft = (i.chargeDaysLeft || 0) + 1; n++; } });
            renderInventoryList(); saveLocalStorage();
            return ` 💎 «Поглотитель душ»: 10 убийств — заряд чар +1 день (${n} предм.).`;
        }
        saveLocalStorage();
        return ` 💎 «Поглотитель душ»: убийств ${soulEaterKills}/10.`;
    }
    let companionRewards = {}; // { weapon: true, armor: true } — уже полученные награды (сохраняется на листе)
    function companionsEntry() { return normalizePlayerGuildEntry((playerGuildsData || {})['Соратники']); }
    function companionsMember() { return companionsEntry().member; }
    const COMP_WEAPON_ENCHANTS = [
        { name: 'Урон огнем', label: '🔥 Огонь' }, { name: 'Урон электричеством', label: '⚡ Молния' },
        { name: 'Урон холодом', label: '❄️ Холод' }, { name: 'Урон по нежити', label: '💀 Урон по нежити' }
    ];
    const COMP_WEAPON_TYPE = { 'Кинжалы': 'dagger', 'Мечи': 'onehand', 'Секиры': 'twohand_axe', 'Боевые топоры': 'onehand:топор', 'Двуручные мечи': 'twohand_sword' };
    const COMP_WOLF_ARMOR = [
        { slot: 'chest', name: 'Волчья броня', armor: 33, weight: 10, price: 450, ench: 'Повышение здоровья', value: 40 },
        { slot: 'boots', name: 'Волчьи сапоги', armor: 13, weight: 2, price: 150, ench: 'Повышение переносимого веса', value: 50 },
        { slot: 'gloves', name: 'Волчьи перчатки', armor: 13, weight: 2, price: 150, choose: 'gauntlets' },
        { slot: 'helmet', name: 'Волчий шлем', armor: 19, weight: 2, price: 200, choose: 'helmet' }
    ];
    function companionsSkyWeapons() {
        return (window.weaponsNonCraftable || []).filter(w => /^Небесн/.test(w.name));
    }
    function companionsPendingRewards() {
        const o = companionsEntry();
        if (!o.member) return [];
        const out = [];
        if (!companionRewards.joinWeapon) out.push('joinWeapon'); // при вступлении — одно небесное оружие на выбор
        if (o.orders >= 5 && !companionRewards.wolfArmor) out.push('wolfArmor'); // 5 поручений — обычная волчья броня
        if (o.orders >= 15 && !companionRewards.weapon) out.push('weapon');
        if (o.orders >= 20 && !companionRewards.armor) out.push('armor');
        return out;
    }
    function compModal(html) {
        const old = document.getElementById('comp-reward-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'comp-reward-modal';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;';
        ov.innerHTML = '<div style="background:var(--panel-bg,#1d1a14);color:inherit;border:1px solid var(--accent-color,#c8a566);border-radius:8px;padding:14px 16px;max-width:420px;width:100%;">' + html + '</div>';
        document.body.appendChild(ov);
        return ov;
    }
    window.openCompanionsReward = function (kind) {
        if (companionsPendingRewards().indexOf(kind) === -1) { alert('Эта награда недоступна или уже получена.'); return; }
        if (kind === 'joinWeapon') {
            const list = companionsSkyWeapons();
            if (!list.length) { alert('Нет данных об оружии небесной кузницы.'); return; }
            const ov = compModal(`<div style="font-weight:bold;font-size:16px;margin-bottom:6px;">🗡 Подарок при вступлении</div>
                <div style="font-size:13px;opacity:.85;margin-bottom:8px;">Соратники дают новичку одно оружие небесной кузницы на выбор.</div>
                <label>Оружие</label><select id="comp-j-type">${list.map((w, i) => `<option value="${i}">${escHtml(w.name)} — урон ${w.damage}</option>`).join('')}</select>
                <div style="display:flex;gap:8px;margin-top:10px;"><button id="comp-ok" class="btn-success" style="flex:1;margin:0;">Получить</button><button id="comp-cancel" style="flex:1;margin:0;">Позже</button></div>`);
            ov.querySelector('#comp-cancel').onclick = () => ov.remove();
            ov.querySelector('#comp-ok').onclick = () => {
                const w = list[parseInt(ov.querySelector('#comp-j-type').value) || 0];
                if (w && !companionRewards.joinWeapon) {
                    addToInventory(w.name, w.name, 1, w.weight || 3, w.category, `Урон ${w.damage}`, { slot: 'melee', weaponDmg: w.damage, weaponType: COMP_WEAPON_TYPE[w.subcat] || 'onehand', price: w.price || 0 });
                    companionRewards.joinWeapon = true;
                    renderInventoryList(); renderGuildPanelPlayer(); saveLocalStorage(true);
                    alert(`🏅 Соратники выдают «${w.name}».`);
                }
                ov.remove();
            };
            return;
        }
        if (kind === 'wolfArmor') {
            if (companionRewards.wolfArmor) return;
            const got = [];
            COMP_WOLF_ARMOR.forEach(p => {
                const proto = (window.allItems || []).find(i => i.name === p.name) || {};
                addToInventory(p.name, p.name, 1, proto.weight || p.weight, proto.category || 'Броня Соратников', proto.effect || '', { slot: p.slot, armorValue: proto.armor || p.armor, armorType: 'heavy', price: proto.price || p.price });
                got.push(p.name);
            });
            companionRewards.wolfArmor = true;
            renderInventoryList(); renderGuildPanelPlayer(); saveLocalStorage(true);
            alert('🏅 Соратники выдают волчью броню за 5 поручений:\n' + got.join('\n'));
            return;
        }
        if (kind === 'weapon') {
            const list = companionsSkyWeapons();
            if (!list.length) { alert('Нет данных об оружии небесной кузницы.'); return; }
            const ov = compModal(`<div style="font-weight:bold;font-size:16px;margin-bottom:6px;">🗡 Небесная кузница</div>
                <div style="font-size:13px;opacity:.85;margin-bottom:8px;">Оружие небесной кузницы с чарами — в 2 раза сильнее обычного. Выбери вид оружия и зачарование.</div>
                <label>Оружие</label><select id="comp-w-type">${list.map((w, i) => `<option value="${i}">${escHtml(w.name)} — урон ${w.damage * 2} (обычное ${w.damage})</option>`).join('')}</select>
                <label>Зачарование</label><select id="comp-w-ench">${COMP_WEAPON_ENCHANTS.map((e, i) => `<option value="${i}">${escHtml(e.label)}</option>`).join('')}</select>
                <div style="display:flex;gap:8px;margin-top:10px;"><button id="comp-ok" class="btn-success" style="flex:1;margin:0;">Получить</button><button id="comp-cancel" style="flex:1;margin:0;">Позже</button></div>`);
            ov.querySelector('#comp-cancel').onclick = () => ov.remove();
            ov.querySelector('#comp-ok').onclick = () => {
                claimCompanionsWeapon(list[parseInt(ov.querySelector('#comp-w-type').value) || 0], COMP_WEAPON_ENCHANTS[parseInt(ov.querySelector('#comp-w-ench').value) || 0]);
                ov.remove();
            };
        } else {
            const choices = slotKey => (window.enchantArmorEffects || []).filter(e => e.slots.indexOf(slotKey) !== -1 && e.maxValue !== null && typeof e.maxValue === 'number');
            const opt = slotKey => choices(slotKey).map((e, i) => `<option value="${i}">${escHtml(e.name.replace(/\s+/g, ' '))} (${e.maxValue}${e.unit || ''})</option>`).join('');
            const ov = compModal(`<div style="font-weight:bold;font-size:16px;margin-bottom:6px;">🛡 Волчья броня Соратников</div>
                <div style="font-size:13px;opacity:.85;margin-bottom:8px;">Зачарованный комплект, в 1.5 раза крепче обычной волчьей брони: кираса +40 ХП, сапоги +50 к грузоподъёмности. Выбери чары для шлема и перчаток.</div>
                <label>Шлем</label><select id="comp-a-helmet">${opt('helmet')}</select>
                <label>Перчатки</label><select id="comp-a-gloves">${opt('gauntlets')}</select>
                <div style="display:flex;gap:8px;margin-top:10px;"><button id="comp-ok" class="btn-success" style="flex:1;margin:0;">Получить</button><button id="comp-cancel" style="flex:1;margin:0;">Позже</button></div>`);
            ov.querySelector('#comp-cancel').onclick = () => ov.remove();
            ov.querySelector('#comp-ok').onclick = () => {
                claimCompanionsArmor(choices('helmet')[parseInt(ov.querySelector('#comp-a-helmet').value) || 0], choices('gauntlets')[parseInt(ov.querySelector('#comp-a-gloves').value) || 0]);
                ov.remove();
            };
        }
    };
    function claimCompanionsWeapon(base, ench) {
        if (!base || !ench || companionRewards.weapon) return;
        const nm = `${base.name} Соратников [${ench.name}]`;
        const id = nm + '#' + Date.now();
        const dmg = base.damage * 2;
        const desc = `${ench.name}: 20 урона. Награда Соратников: оружие небесной кузницы, урон ×2.`;
        addToInventory(id, nm, 1, base.weight || 3, base.category, desc, {
            slot: 'melee', weaponDmg: dmg, weaponType: COMP_WEAPON_TYPE[base.subcat] || 'onehand', price: (base.price || 0) * 3,
            enchantment: { name: ench.name, value: 20, unit: 'урона', description: desc }
        });
        companionRewards.weapon = true;
        renderInventoryList(); renderGuildPanelPlayer(); saveLocalStorage(true);
        alert(`🏅 Соратники выдают «${nm}» (урон ${dmg}).`);
    }
    function claimCompanionsArmor(helmEff, gloveEff) {
        if (companionRewards.armor) return;
        const got = [];
        COMP_WOLF_ARMOR.forEach(p => {
            let eff = null, value = null, unit = '';
            if (p.ench) { eff = (window.enchantArmorEffects || []).find(e => e.name === p.ench); value = p.value; unit = eff ? eff.unit : ''; }
            else { eff = p.choose === 'helmet' ? helmEff : gloveEff; if (eff) { value = eff.maxValue; unit = eff.unit; } }
            const armorVal = Math.round(p.armor * 1.5);
            const nm = p.name + ' Соратников' + (eff ? ` [${eff.name.replace(/\s+/g, ' ')}]` : '');
            const desc = eff ? `${eff.name.replace(/\s+/g, ' ')}: ${value}${unit ? ' ' + unit : ''}. Награда Соратников: броня ×1.5.` : 'Награда Соратников: броня ×1.5.';
            addToInventory(nm + '#' + Date.now() + '-' + p.slot, nm, 1, p.weight, 'Броня Соратников', desc, Object.assign({
                slot: p.slot, armorValue: armorVal, armorType: 'heavy', price: p.price * 3
            }, eff ? { enchantment: { name: eff.name, value: value, unit: unit, description: desc } } : {}));
            got.push(nm);
        });
        companionRewards.armor = true;
        renderInventoryList(); renderGuildPanelPlayer(); saveLocalStorage(true);
        alert('🏅 Соратники выдают зачарованную волчью броню:\n' + got.join('\n'));
    }
    function companionsNotifyRewards() {
        const pend = companionsPendingRewards();
        if (pend.length) setTimeout(() => window.openCompanionsReward(pend[0]), 50);
    }

    // ====================== Тренировки гильдий (Фракции.xlsx) ======================
    // Гильдия воров: раз в неделю можно потренировать Скрытность / Карманные кражи / Взлом — каждый навык на +3.
    // Соратники: каждый день одна тренировка навыка воина: один — +1, с соратником — +2.
    let trainState = { thief: {}, comp: -1, mageLib: -1, mageLesson: -1, mageLessons: {}, mageStudy: null, mageStudyLast: -99 }; // thief: { навык: номер дня последней тренировки }, comp: день последней тренировки у Соратников
    const THIEF_TRAIN_SKILLS = ['Скрытность', 'Карманные кражи', 'Взлом'];
    const COMP_TRAIN_SKILLS = ['Одноручное оружие', 'Двуручное оружие', 'Стрельба', 'Блокирование', 'Тяжелая броня', 'Легкая броня'];
    function gameDayIndex() { return gameYear * 360 + gameMonth * 30 + gameDayNum; } // в календаре 12 месяцев по 30 дней
    // Коллегия магов Винтерхолда (Фракции.xlsx): помощь библиотекарю за целый день — +1 к случайной школе магии или Зачарованию;
    // доп. урок у преподавателя — 50 септимов, 1 урок в день, каждые 2 урока +1 к выбранному навыку.
    const MAGE_TRAIN_SKILLS = ['Разрушение', 'Восстановление', 'Колдовство', 'Иллюзия', 'Изменение', 'Зачарование'];
    function mageIsMember() { return normalizePlayerGuildEntry((playerGuildsData || {})['Коллегия магов']).member; }
    // Платное обучение у учителя школы: заклинание Адепта — 100 септимов, неделя лекций; Эксперта — 200, две недели.
    // Начать можно раз в неделю. По окончании заклинание само появляется в книге.
    const MAGE_SCHOOL_CODES = { 'Разрушение': 'destr', 'Восстановление': 'restor', 'Колдовство': 'conj', 'Иллюзия': 'illus', 'Изменение': 'alter' };
    function learnSpellIntoBook(school, name) {
        const cont = document.getElementById(`spells-${school}-list`);
        if (!cont) return false;
        if (Array.from(cont.querySelectorAll('.spell-name-select')).some(sel => sel.value === name)) return 'known';
        addCustomSpell(school);
        const cards = cont.querySelectorAll('.spell-card'), card = cards[cards.length - 1];
        const sel = card.querySelector('.spell-name-select');
        sel.value = name;
        window.onSpellPicked(card.id.replace('card-', ''), school);
        lockSpellCard(card);
        return true;
    }
    // Том заклинания из инвентаря → заклинание в книгу, том расходуется. Школу и имя берём из базы томов по названию:
    // у тома, выданного мастером или купленного, в инвентаре могут не сохраниться поля school/spellName.
    window.learnSpellFromTome = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0) return;
        const tome = (window.spellTomesData || (typeof spellTomesData !== 'undefined' ? spellTomesData : [])).find(t => t.name === item.name);
        const spell = (tome && tome.spellName) || item.spellName || String(item.name || '').replace(/^Том заклинания:\s*/, '');
        const school = (tome && MAGE_SCHOOL_CODES[tome.school]) || findSpellSchoolByName(spell);
        if (!school || !getSpellTier(school, spell)) { alert('Не нашёл заклинание «' + spell + '» в книге школ — покажи том мастеру.'); return; }
        if (customSpells.some(s => s.name === spell)) { alert('«' + spell + '» уже есть в твоей книге заклинаний. Том можно продать.'); return; }
        if (!confirm('Изучить «' + spell + '»? Том будет прочитан и исчезнет, а заклинание навсегда останется в книге.')) return;
        const r = learnSpellIntoBook(school, spell);
        if (r !== true) { alert(r === 'known' ? '«' + spell + '» уже есть в книге.' : 'Не получилось добавить заклинание.'); return; }
        removeFromInventoryByName(itemId, 1);
        renderInventoryList();
        updateAll();
        saveLocalStorage(true);
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog('📖 ' + nm + ' изучил(а) заклинание «' + spell + '» из тома.', nm);
        alert('📖 Выучено: «' + spell + '» (' + (SCHOOL_CODE_TO_SKILL[school] || school) + '). Заклинание добавлено в книгу.');
    };
    function mageStudyTick() {
        const st = trainState.mageStudy;
        if (!st || gameDayIndex() < st.startDay + st.days) return;
        trainState.mageStudy = null;
        const r = learnSpellIntoBook(st.school, st.name);
        setTimeout(() => alert(r === 'known' ? `Обучение закончено, но «${st.name}» уже есть в книге.` : `🎓 Обучение у учителя закончено: заклинание «${st.name}» добавлено в книгу.`), 50);
        saveLocalStorage(true);
    }
    window.mageStartStudy = function () {
        if (!mageIsMember() || trainState.mageStudy) return;
        const today = gameDayIndex();
        if (today - (trainState.mageStudyLast === undefined ? -99 : trainState.mageStudyLast) < 7) { alert('Учитель обучает раз в неделю — рано.'); return; }
        const val = (document.getElementById('train-mage-spell') || {}).value || '';
        const [school, tierS, ...rest] = val.split('|'), name = rest.join('|'), tier = parseInt(tierS);
        if (!school || !name || (tier !== 3 && tier !== 4)) return;
        const price = tier === 4 ? 200 : 100, days = tier === 4 ? 14 : 7;
        const goldEl = document.getElementById('char-gold'), gold = parseInt(goldEl.value) || 0;
        if (gold < price) { alert(`Обучение стоит ${price} септимов.`); return; }
        goldEl.value = gold - price;
        trainState.mageStudy = { school: school, name: name, startDay: today, days: days };
        trainState.mageStudyLast = today;
        renderTrainSection(); updateAll(); saveLocalStorage(true);
        alert(`Учитель начал обучать «${name}» (−${price}). Лекции: ${days === 14 ? '2 недели' : 'неделя'}.`);
    };
    window.mageHelpLibrarian = function () {
        if (!mageIsMember()) return;
        const today = gameDayIndex();
        if (trainState.mageLib === today) { alert('Сегодня ты уже помогал(а) библиотекарю.'); return; }
        trainState.mageLib = today;
        const sk = MAGE_TRAIN_SKILLS[Math.floor(Math.random() * MAGE_TRAIN_SKILLS.length)];
        const g = trainSkillUp(sk, 1);
        alert(`Целый день у библиотекаря Урага гро-Шуба: «${sk}» +${g}.`);
    };
    window.mageExtraLesson = function () {
        if (!mageIsMember()) return;
        const today = gameDayIndex();
        if (trainState.mageLesson === today) { alert('Доп. урок — не чаще одного в день.'); return; }
        const sk = (document.getElementById('train-mage-skill') || {}).value;
        if (MAGE_TRAIN_SKILLS.indexOf(sk) === -1) return;
        const goldEl = document.getElementById('char-gold'), gold = parseInt(goldEl.value) || 0;
        if (gold < 50) { alert('Урок стоит 50 септимов.'); return; }
        goldEl.value = gold - 50;
        trainState.mageLesson = today;
        if (!trainState.mageLessons) trainState.mageLessons = {};
        const n = (trainState.mageLessons[sk] || 0) + 1;
        if (n >= 2) {
            trainState.mageLessons[sk] = 0;
            const g = trainSkillUp(sk, 1);
            alert(`Доп. урок (−50 септимов): второй урок по «${sk}» — навык +${g}.`);
        } else {
            trainState.mageLessons[sk] = n;
            updateAll(); renderTrainSection(); saveLocalStorage(true);
            alert(`Доп. урок (−50 септимов): «${sk}» — 1 из 2, ещё один урок до +1.`);
        }
    };
    function thiefIsMember() { return normalizePlayerGuildEntry((playerGuildsData || {})['Гильдия воров']).member; }
    function trainSkillUp(skillName, pts) {
        const idx = skillNames.indexOf(skillName), inp = document.getElementById('skill-' + idx);
        if (!inp) return 0;
        const raw = parseInt(inp.getAttribute('data-raw-val')) || 10;
        // Потолок — 100 ВМЕСТЕ с расовым бонусом (как у роста от успехов и правок мастера). Раньше упиралось
        // в сырые 100: Данмер с Разрушением 85+15 платил учителю, навык не рос, а прогресс уровня рос.
        const race = (document.getElementById('char-race') || {}).value;
        const bonus = (raceSkillBonuses[race] && raceSkillBonuses[race][skillName]) || 0;
        const nv = Math.min(SKILL_MAX - bonus, 100, raw + pts), gained = Math.max(0, nv - raw);
        if (gained > 0) { inp.setAttribute('data-raw-val', nv); levelUpProgress += gained; }
        updateAll(); renderLevelPanel(); renderTrainSection(); saveLocalStorage(true);
        return gained;
    }
    function renderTrainSection() {
        const wrap = document.getElementById('prof-train-wrap'), body = document.getElementById('train-body');
        if (!wrap || !body) return;
        const th = thiefIsMember(), co = companionsMember(), mg = mageIsMember();
        wrap.style.display = (th || co || mg) ? '' : 'none';
        if (!th && !co && !mg) { body.innerHTML = ''; return; }
        const today = gameDayIndex();
        let html = '';
        if (th) {
            html += '<h3>🗝 Гильдия воров — раз в неделю, +3 к навыку</h3>' + THIEF_TRAIN_SKILLS.map(sk => {
                const last = trainState.thief && trainState.thief[sk], left = (last === undefined) ? 0 : Math.max(0, 7 - (today - last));
                return `<div class="party-row" style="display:flex; align-items:center; gap:8px;"><span style="flex:1;">${escHtml(sk)}</span><span style="font-size:12px; opacity:.75;">${left > 0 ? 'через ' + left + ' дн.' : 'доступна'}</span><button class="btn-success" style="width:auto; margin:0; padding:3px 12px;" ${left > 0 ? 'disabled' : ''} onclick="trainThief('${jsq(sk)}')">Тренировка +3</button></div>`;
            }).join('');
        }
        if (co) {
            const done = trainState.comp === today;
            html += '<h3 style="margin-top:12px;">🐺 Соратники — раз в день</h3>' +
                `<p style="font-size:12px; opacity:.75;">Одна тренировка в игровой день: в одиночку навык +1, с кем-то из Соратников +2.</p>
                <div style="display:flex; gap:6px; flex-wrap:wrap;"><select id="train-comp-skill" style="flex:1; min-width:140px;">${COMP_TRAIN_SKILLS.map(sk => `<option value="${escHtml(sk)}">${escHtml(sk)}</option>`).join('')}</select>
                <select id="train-comp-mode" style="width:auto;"><option value="1">Один (+1)</option><option value="2">С соратником (+2)</option></select></div>
                <button class="btn-success" style="width:100%; margin-top:4px;" ${done ? 'disabled' : ''} onclick="trainCompanions()">${done ? 'Сегодня уже тренировался(лась)' : 'Потренироваться'}</button>`;
        }
        if (mg) mageStudyTick();
        if (mg) {
            const doneL = trainState.mageLib === today, doneS = trainState.mageLesson === today, ml = trainState.mageLessons || {};
            const prevMs = document.getElementById('train-mage-skill'), pms = prevMs && prevMs.value;
            html += '<h3 style="margin-top:12px;">🔮 Коллегия магов Винтерхолда</h3>' +
                `<p style="font-size:12px; opacity:.75;">Помощь библиотекарю (целый день, раз в день): +1 к случайной школе магии или Зачарованию.</p>
                <button class="btn-success" style="width:100%;" ${doneL ? 'disabled' : ''} onclick="mageHelpLibrarian()">${doneL ? 'Сегодня уже помогал(а) библиотекарю' : '📚 Помочь библиотекарю'}</button>
                <p style="font-size:12px; opacity:.75; margin-top:8px;">Доп. урок у преподавателя: 50 септимов, 1 в день, каждые 2 урока по навыку = +1.</p>
                <div style="display:flex; gap:6px;"><select id="train-mage-skill" style="flex:1;">${MAGE_TRAIN_SKILLS.map(sk => `<option value="${escHtml(sk)}" ${pms === sk ? 'selected' : ''}>${escHtml(sk)} (${ml[sk] || 0}/2)</option>`).join('')}</select></div>
                <button class="btn-success" style="width:100%; margin-top:4px;" ${doneS ? 'disabled' : ''} onclick="mageExtraLesson()">${doneS ? 'Сегодня урок уже был' : '🎓 Взять доп. урок (−50)'}</button>`;
            const stdy = trainState.mageStudy, wait = Math.max(0, 7 - (today - (trainState.mageStudyLast === undefined ? -99 : trainState.mageStudyLast)));
            const known = {};
            ['destr', 'restor', 'conj', 'illus', 'alter'].forEach(sc => document.querySelectorAll(`#spells-${sc}-list .spell-name-select`).forEach(sl => { known[sc + '|' + sl.value] = 1; }));
            const opts = [];
            Object.keys(MAGE_SCHOOL_CODES).forEach(sk => { const sc = MAGE_SCHOOL_CODES[sk]; [3, 4].forEach(t => ((window.spellsData && spellsData[sc] && spellsData[sc][t]) || []).forEach(sp => { if (!known[sc + '|' + sp.name]) opts.push(`<option value="${escHtml(sc + '|' + t + '|' + sp.name)}">${escHtml(sk)} · ${t === 4 ? 'Эксперт' : 'Адепт'} · ${escHtml(sp.name)} (${t === 4 ? 200 : 100})</option>`); })); });
            html += '<p style="font-size:12px; opacity:.75; margin-top:8px;">Платное обучение заклинанию у учителя школы: Адепт — 100 септимов, неделя лекций; Эксперт — 200, две недели. Начать можно раз в неделю.</p>' +
                (stdy ? `<div class="party-row">🎓 Изучаешь «${escHtml(stdy.name)}» — осталось ${Math.max(0, stdy.startDay + stdy.days - today)} дн.</div>` :
                `<select id="train-mage-spell">${opts.join('') || '<option value="">Нет доступных заклинаний</option>'}</select>
                <button class="btn-success" style="width:100%; margin-top:4px;" ${wait > 0 || !opts.length ? 'disabled' : ''} onclick="mageStartStudy()">${wait > 0 ? 'Учитель свободен через ' + wait + ' дн.' : '📖 Записаться на обучение'}</button>`);
        }
        const prevC = document.getElementById('train-comp-skill'), prevM = document.getElementById('train-comp-mode');
        const pc = prevC && prevC.value, pm = prevM && prevM.value;
        body.innerHTML = html;
        const nc = document.getElementById('train-comp-skill'), nm = document.getElementById('train-comp-mode');
        if (nc && pc) nc.value = pc; if (nm && pm) nm.value = pm;
    }
    window.trainThief = function (skill) {
        if (!thiefIsMember() || THIEF_TRAIN_SKILLS.indexOf(skill) === -1) return;
        const last = trainState.thief[skill], today = gameDayIndex();
        if (last !== undefined && today - last < 7) { alert('Эта тренировка в гильдии проводится раз в неделю.'); return; }
        trainState.thief[skill] = today;
        const g = trainSkillUp(skill, 3);
        alert(`Тренировка в Гильдии воров: «${skill}» +${g}.`);
    };
    window.trainCompanions = function () {
        if (!companionsMember()) return;
        const today = gameDayIndex();
        if (trainState.comp === today) { alert('Сегодня ты уже тренировался(лась).'); return; }
        const skill = (document.getElementById('train-comp-skill') || {}).value, pts = parseInt((document.getElementById('train-comp-mode') || {}).value) === 2 ? 2 : 1;
        if (COMP_TRAIN_SKILLS.indexOf(skill) === -1) return;
        trainState.comp = today;
        const g = trainSkillUp(skill, pts);
        alert(`Тренировка Соратников: «${skill}» +${g}${pts === 2 ? ' (с соратником)' : ''}.`);
    };

    // Квест гильдии нельзя закрыть самому: игрок подаёт заявку, мастер подтверждает (иначе заказы и награды бронёй можно было получить, ничего не сделав).
    window.markQuestDone = function (id) {
        const q = playerQuests.find(x => x.id === id);
        if (!q || q.status !== 'active') return;
        if (q.guild) {
            if (!window.CloudSync || !window.CloudSync.requestQuestClaim) { alert('Квест гильдии подтверждает мастер — нужна активная сессия.'); return; }
            q.status = 'review'; renderQuestList(); saveLocalStorage();
            window.CloudSync.requestQuestClaim({ questId: q.id, title: q.title, guild: q.guild })
                .then(() => alert('Заявка отправлена мастеру. Заказ и награда будут начислены после его подтверждения.'))
                .catch(e => { q.status = 'active'; renderQuestList(); saveLocalStorage(); alert(e.message || ('Ошибка: ' + e)); });
            return;
        }
        completeQuest(id);
    };
    // Решения мастера по заявкам (приходят из сессии): подтверждён — начисляем как раньше; нет — квест снова активен.
    window.processQuestDecisions = function (list) {
        const me = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        if (!me || !Array.isArray(list)) return;
        list.filter(d => d && d.uid === me).forEach(d => {
            const q = playerQuests.find(x => x.id === d.questId);
            if (q && q.status === 'review') {
                if (d.ok) completeQuest(q.id);
                else { q.status = 'active'; renderQuestList(); saveLocalStorage(); setTimeout(() => alert('Мастер: квест «' + q.title + '» пока не выполнен.'), 30); }
            }
            if (window.CloudSync.ackQuestDecision) window.CloudSync.ackQuestDecision(d.questId);
        });
    };
    function completeQuest(id) {
        const q = playerQuests.find(x => x.id === id);
        if (!q || q.status === 'abandoned' || q.status === 'done') return; // раньше повторный вызов начислял прогресс гильдии и награду второй раз
        q.status = 'done';
        renderQuestList();
        saveLocalStorage();
        // Задача K: выполнение квеста гильдии автоматически даёт +1 к её прогрессу.
        if (q.guild && window.CloudSync && typeof window.CloudSync.incrementGuildProgress === 'function') {
            // Порог считаем по счётчику, который вернула транзакция в облаке, а не по локальному листу:
            // два квеста, подтверждённые разом, видели один и тот же локальный счётчик и давали награду за порог дважды.
            window.CloudSync.incrementGuildProgress(q.guild).then(res => {
                const after = (res && typeof res.after === 'number') ? res.after : normalizePlayerGuildEntry((playerGuildsData || {})[q.guild]).orders + 1;
                if (typeof renderGuildPanelPlayer === 'function') renderGuildPanelPlayer();
                // Авто-выдача брони, если этот заказ как раз довёл счётчик до порога награды.
                if (q.guild === 'Соратники') companionsNotifyRewards();
                // Гильдия воров: каждые 5 заказов — «особое задание», 500 септимов (Фракции.xlsx).
                if (q.guild === 'Гильдия воров' && after > 0 && after % 5 === 0) {
                    const g = document.getElementById('char-gold'); g.value = (parseInt(g.value) || 0) + 500;
                    saveLocalStorage();
                    setTimeout(() => alert(`🗝 Гильдия воров: ${after} заказов — особое задание, +500 септимов.`), 30);
                }
                const reward = (GUILD_ARMOR_REWARDS[q.guild] || []).find(r => r.at === after);
                if (reward) {
                    reward.items.forEach(name => giveGuildRewardItem(name));
                    renderInventoryList();
                    saveLocalStorage();
                    alert(`🏅 Гильдия «${q.guild}» выдаёт награду за ${after} заказ(ов): ${reward.items.join(', ')}!`);
                }
            }).catch(e => console.error('Ошибка прогресса гильдии:', e));
        }
    };

    // ========================================================================
    // ПРИЗВАННЫЕ/ПОДНЯТЫЕ СУЩЕСТВА
    // ========================================================================

    function renderSummonTemplateSelect() {
        const select = document.getElementById('summon-template-select');
        if (!select) return;
        const catLabels = { weapon: 'Оружие', corpse: 'Труп/зомби', wolf: 'Питомец', pet: 'Питомец', daedra: 'Даэдра', atronach: 'Атронах', skeleton: 'Скелет (постоянный)', armor: 'Броня-плоть' };
        select.innerHTML = summonTemplates.map((t, i) => `<option value="${i}">${escHtml(t.name)} (${catLabels[t.category]})</option>`).join('');
        updateSummonTemplateInfo();
    }

    window.updateSummonTemplateInfo = function () {
        try { refreshEnhancedButtons(); } catch (e) { }
        const idx = parseInt(document.getElementById('summon-template-select').value) || 0;
        const t = summonTemplates[idx];
        const infoEl = document.getElementById('summon-template-info');
        if (!t || !infoEl) return;
        let html = '';
        if (t.category === 'armor') {
            html += `Броня (НАДБАВКА поверх надетого, не замена): +${t.armorBase}${t.armorEnh && t.armorEnh !== t.armorBase ? ' (усилена: +' + t.armorEnh + ')' : ''}<br>`;
            html += `Длительность: ${t.durBase} ходов${t.durEnh ? ' (усилен: ' + t.durEnh + ')' : ''}`;
            html += `<br><span style="opacity:.8;">Перк «Магическая броня» удваивает/утраивает эту надбавку, если кираса пустая (совсем без брони).</span>`;
            infoEl.innerHTML = html;
            return;
        }
        if (t.hpBase) html += `ХП: ${t.hpBase}${t.hpEnh && t.hpEnh !== t.hpBase ? ' (усилен: ' + t.hpEnh + ')' : ''} · `;
        html += `Урон: ${t.dmgBase} (${t.dmgType})${t.dmgEnh ? ', усилен: ' + t.dmgEnh : ''}<br>`;
        if (t.permanent) {
            html += t.requiresItem ? `Длительность: <strong>навсегда</strong> — требует предмет «${t.requiresItem}» (расходуется, возвращается при роспуске)` : `Длительность: <strong>бессрочно</strong> (пока не убьют или не отзовёте)`;
        } else {
            html += `Длительность: ${t.durBase} ходов${t.durEnh ? ' (усилен: ' + t.durEnh + ')' : ''}${t.enhCount ? ` · усиленный вариант призывает ${t.enhCount}` : ''}`;
        }
        if (t.estimated) html += `<br><span style="color:#e67e22;">⚠ ХП и урон — оценка по общим значениям Skyrim (в таблицах не прописаны). Длительность (ходы) — реальное число из описания заклинания призыва.</span>`;
        if (t.note) html += `<br><span style="opacity:.8;">${escHtml(t.note)}</span>`;
        infoEl.innerHTML = html;
    };

    function isSpellKnownOrScrolled(spellName) {
        const known = customSpells.some(s => s.name === spellName);
        const hasScroll = countInInventory('Свиток: ' + spellName) > 0;
        return known || hasScroll;
    }

    // Призванное оружие занимает слот оружия (ближний/дальний в зависимости от типа),
    // призванная/наколдованная "плоть"-броня занимает кирасу — в обоих случаях старое
    // снаряжение запоминается и возвращается при роспуске/истечении времени. Одеяние не трогается.
    // «Плоть»-заклинания (Дубовая/Каменная/Железная/Эбонитовая) — это НАДБАВКА к броне поверх
    // того, что уже надето (как в ваниле), а не замена кирасы — реализованы отдельной веткой ниже,
    // через активные эффекты, а не через performSummon/экипировку.
    // Предел призванных существ (оружие и броня из плоти не в счёт; силы вампира-лорда и оборотня — тоже):
    // без перков одно существо. «Приближение смерти»/«Дыхание смерти» — +1/+2 скелета, Одеяние атрономага — +1 атронах.
    function summonCreatureCap(t, castCount) {
        let cap = 1;
        if (t.category === 'skeleton') cap += (window.perkBonuses || {}).extraSkeletons || 0;
        if (t.category === 'atronach') cap += getGearSpecialBonuses().atronachExtra || 0;
        return Math.max(cap, castCount || 1);
    }
    function isCountedSummon(s) { return s && s.category !== 'weapon' && s.category !== 'armor' && !s.boundToForm; }
    function performSummon(t, enhanced, opts) {
        if (t.requiresItem) {
            if (countInInventory(t.requiresItem) <= 0) return { ok: false, message: `Нужен предмет «${t.requiresItem}» в инвентаре.` };
            removeFromInventoryByName(t.requiresItem, 1);
        }
        const entry = {
            id: 'sum-' + Date.now() + Math.random().toString(36).slice(2, 6),
            category: t.category, name: t.name,
            curHp: t.hpBase ? (enhanced && t.hpEnh ? t.hpEnh : t.hpBase) : null,
            maxHp: t.hpBase ? (enhanced && t.hpEnh ? t.hpEnh : t.hpBase) : null,
            dmg: (t.dmgBase !== undefined) ? (enhanced && t.dmgEnh ? t.dmgEnh : t.dmgBase) : null,
            dmgType: t.dmgType || null,
            speed: t.speed || 30,
            // Призванное оружие (category:'weapon') держится в 1.5 раза дольше обычных призывов —
            // по прямой просьбе, раньше длительность была одинаковой для всех категорий призыва.
            turnsRemaining: t.permanent ? null : Math.round((enhanced && t.durEnh ? t.durEnh : t.durBase) * (t.category === 'weapon' ? 1.5 : 1)),
            permanent: !!t.permanent,
            returnItem: t.requiresItem ? t.requiresItem : null
        };
        // Усиление «Колдовства»: оружие +N% урона, скелеты +N% ХП, существа (атронахи, зомби, питомцы) держатся на N% дольше.
        let boostTxt = '';
        const sbC = getSchoolBoost('conj');
        if (sbC.pct) {
            if (t.category === 'weapon' && entry.dmg !== null) { entry.dmg = Math.round(entry.dmg * sbC.mult); boostTxt = ` ✨ Колдовство +${sbC.pct}%: урон ${entry.dmg}.`; }
            else if (t.category === 'skeleton' && entry.maxHp) { entry.maxHp = entry.curHp = Math.round(entry.maxHp * sbC.mult); boostTxt = ` ✨ Колдовство +${sbC.pct}%: ХП ${entry.maxHp}.`; }
            else if (!t.permanent && t.category !== 'armor' && entry.turnsRemaining) { entry.turnsRemaining = Math.round(entry.turnsRemaining * sbC.mult); boostTxt = ` ✨ Колдовство +${sbC.pct}%: держится ${entry.turnsRemaining} ход.`; }
        }
        // Перки Колдовства: «Мистический призыв», «Некромантия», «Тёмные души», «Атромантия», «Сила стихий», «Новые кости», «Двойное колдовство».
        let perkTxt = '';
        {
            const pbS = window.perkBonuses || {};
            if (t.category === 'weapon' && pbS.summonWeaponBonus && entry.dmg !== null) { entry.dmg = Math.round(entry.dmg * (1 + pbS.summonWeaponBonus)); perkTxt += ` ⚔ «Мистический призыв»: урон ${entry.dmg}.`; }
            if (t.category === 'corpse') {
                if (pbS.raisedExtraTurns && entry.turnsRemaining) { entry.turnsRemaining += pbS.raisedExtraTurns; perkTxt += ` ☠ «Некромантия»: +${pbS.raisedExtraTurns} хода (${entry.turnsRemaining}).`; }
                if (pbS.raisedExtraHp && entry.maxHp) { entry.maxHp += pbS.raisedExtraHp; entry.curHp += pbS.raisedExtraHp; perkTxt += ` ☠ «Тёмные души»: +${pbS.raisedExtraHp} ХП (${entry.maxHp}).`; }
            }
            if (t.category === 'atronach') {
                if (pbS.atronachDurationDouble && entry.turnsRemaining) { entry.turnsRemaining *= 2; perkTxt += ` 🔥 «Атромантия»: длится ${entry.turnsRemaining} ход.`; }
                const gAt = getGearSpecialBonuses().atronachTurns;
                if (gAt && entry.turnsRemaining) { entry.turnsRemaining += gAt; perkTxt += ` 🔥 Одеяние: +${gAt} ход. (${entry.turnsRemaining}).`; }
                if (pbS.atronachPower) {
                    if (entry.maxHp) { entry.maxHp = entry.curHp = Math.round(entry.maxHp * (1 + pbS.atronachPower)); }
                    if (entry.dmg !== null) entry.dmg = Math.round(entry.dmg * (1 + pbS.atronachPower));
                    perkTxt += ` 🔥 «Сила стихий»: +${Math.round(pbS.atronachPower * 100)}% (ХП ${entry.maxHp}, урон ${entry.dmg}).`;
                }
            }
            if (t.category === 'skeleton' && pbS.skeletonExtraHp && entry.maxHp) { entry.maxHp = entry.curHp = entry.maxHp + pbS.skeletonExtraHp; perkTxt += ` 💀 «Новые кости»: +${pbS.skeletonExtraHp} ХП (${entry.maxHp}).`; }
            // Длительность усиленного призыва (durEnh) уже учитывает каст с двух рук — ×2 только если своей нет.
            if (enhanced && pbS.dualConj && !t.permanent && entry.turnsRemaining && !(t.durEnh && t.durEnh > t.durBase)) { entry.turnsRemaining *= 2; perkTxt += ` ✨ «Двойное колдовство»: длится ${entry.turnsRemaining} ход.`; }
        }
        if (t.category === 'weapon') {
            const isBow = t.spellName === 'Призванный лук';
            entry.equipSlot = isBow ? 'ranged' : 'melee';
            const prefix = isBow ? 'wep-ranged' : 'wep-melee';
            const typeField = document.getElementById(prefix + '-type');
            const slotKeyS = isBow ? 'rangedWeapon' : 'meleeWeapon';
            // Повторный призыв, пока в руке уже призванное оружие: новое заменяет старое, а «настоящее» оружие для
            // возврата берём у старого призыва. Раньше запоминался сам призванный меч — и после истечения обоих он оставался навсегда.
            const prevS = activeSummons.find(x => x && x.equipSlot === entry.equipSlot);
            if (prevS) {
                ['savedWeaponName', 'savedWeaponDmg', 'savedWeaponType', 'savedSlotItemId', 'savedOffhandId', 'savedOffhandName', 'savedOffhandDmg'].forEach(f => { if (prevS[f] !== undefined) entry[f] = prevS[f]; });
                activeSummons = activeSummons.filter(x => x !== prevS);
            } else {
                entry.savedWeaponName = document.getElementById(prefix + '-name').value;
                entry.savedWeaponDmg = document.getElementById(prefix + '-dmg').value;
                entry.savedWeaponType = typeField ? typeField.value : null;
            }
            // Настоящее оружие уходит из руки на время призыва: иначе его зачарование прибавлялось к призванному,
            // а двуручник «держал» руки (щит с призванным мечом не надеть). После призыва — возвращается.
            if (!prevS) entry.savedSlotItemId = equippedSlots[slotKeyS] || null;
            equippedSlots[slotKeyS] = null;
            if (!isBow && equippedSlots.meleeWeaponOffhand) { entry.savedOffhandId = equippedSlots.meleeWeaponOffhand; entry.savedOffhandName = (document.getElementById('wep-melee-offhand-name') || {}).value || ''; entry.savedOffhandDmg = (document.getElementById('wep-melee-offhand-dmg') || {}).value || 0; equippedSlots.meleeWeaponOffhand = null; document.getElementById('wep-melee-offhand-name').value = ''; document.getElementById('wep-melee-offhand-dmg').value = 0; }
            document.getElementById(prefix + '-name').value = t.name;
            document.getElementById(prefix + '-dmg').value = entry.dmg;
            // Тип оружия влияет на формулу боя (крит кинжала, бонус Силы и т.д.) — раньше при
            // призыве не выставлялся, из-за чего использовался тип от прошлого оружия.
            if (typeField) {
                const typeMap = { 'Призванный кинжал': 'dagger', 'Призванный меч': 'onehand', 'Призванная секира': 'twohand_axe', 'Призванный лук': 'bow' };
                typeField.value = typeMap[t.spellName] || (isBow ? 'bow' : 'onehand');
            }
        }
        let summonCount = (enhanced && t.enhCount) ? t.enhCount : 1;
        if (t.category === 'skeleton' && (window.perkBonuses || {}).extraSkeletons) { // «Приближение смерти» +1, «Дыхание смерти» ещё +2
            summonCount += (window.perkBonuses || {}).extraSkeletons;
            perkTxt += ` 💀 Перки призыва скелетов: +${(window.perkBonuses || {}).extraSkeletons} доп. скелет(а).`;
        }
        // Лимит существ: лишние старые существа развеиваются (новый призыв заменяет старый), как в Скайриме.
        let capTxt = '';
        if (!(opts && opts.noCap) && isCountedSummon(entry)) {
            const cap = summonCreatureCap(t, summonCount);
            const counted = activeSummons.filter(isCountedSummon);
            const extra = counted.length + summonCount - cap;
            if (extra > 0) {
                const gone = counted.slice(0, extra);
                gone.forEach(g => window.dismissSummon(g.id));
                capTxt = ` Предел существ — ${cap}: развеяно ${gone.map(g => '«' + g.name + '»').join(', ')}.`;
            }
        }
        if (summonCount > 1) {
            entry.name = t.name + ' №1';
            activeSummons.push(entry);
            for (let k = 2; k <= summonCount; k++) {
                // Предмет-основа (кучка костей) потрачен один — и вернётся один, с первым скелетом.
                activeSummons.push(Object.assign({}, entry, { id: 'sum-' + Date.now() + Math.random().toString(36).slice(2, 6) + k, name: t.name + ' №' + k, returnItem: null }));
            }
        } else {
            activeSummons.push(entry);
        }
        renderActiveSummonsList();
        renderInventoryList();
        updateAll();
        saveLocalStorage();
        return { ok: true, message: (summonCount > 1 ? `Призвано: ${summonCount} × «${t.name}».${boostTxt}` : `Призвано: «${t.name}».${boostTxt}`) + perkTxt + capTxt };
    }

    // Заклинания «плоти» — временная НАДБАВКА к броне (складывается с тем, что надето), а не
    // замена. Перк «Магическая броня» (×2/×2.5/×3), если на игроке нет ни одной вещи брони.
    function fleshSpellActive() {
        return (activeTimedEffects || []).some(e => (e.flesh || /плоть$/i.test(String(e.effectName || ''))) && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity));
    }
    function castFleshSpell(t, enhanced) {
        let armorValue = enhanced && t.armorEnh ? t.armorEnh : t.armorBase;
        const perks = window.perkBonuses || {};
        // «Без брони» — ни одной вещи брони: шлем, кираса, перчатки, сапоги (одеяние и щит бронёй не считаются).
        // Раньше смотрелась только кираса — шлем, перчатки и сапоги любой брони перк не отключали.
        const noArmor = ['slot-helm-armor', 'slot-chest-armor', 'slot-gloves-armor', 'slot-boots-armor']
            .every(id => (parseInt((document.getElementById(id) || {}).value) || 0) <= 0);
        const mult = perks.magicArmorMult || 1;
        if (noArmor && mult > 1) {
            armorValue = Math.round(armorValue * mult);
        }
        const sbA = getSchoolBoost('alter');
        if (sbA.pct) armorValue = Math.round(armorValue * sbA.mult);
        if (gb('armorSpell')) armorValue += gb('armorSpell'); // Дибелла: +25/+25/+100 единиц брони к «плоти»
        pushOrRefreshTimedEffect({
            id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
            name: t.name, effectName: t.name,
            description: `+${armorValue} к броне (надбавка, складывается с надетым)${noArmor && mult > 1 ? ' — усилено «Магической бронёй»' : ''}${sbA.pct ? ` — «Изменение» +${sbA.pct}%` : ''}`,
            turnsRemaining: Math.round((enhanced && t.durEnh ? t.durEnh : t.durBase) * (enhanced && perks.dualAlter && !(t.durEnh && t.durEnh > t.durBase) ? 2 : 1) * (perks.alterDurationDouble ? 2 : 1)),
            hp: 0, mp: 0, value: 0, armor: armorValue, flesh: true
        });
        renderActiveEffects();
        updateAll();
        saveLocalStorage();
        return { ok: true, message: `Наложено: «${t.name}» (+${armorValue} брони, надбавка${sbA.pct ? `, «Изменение» +${sbA.pct}%` : ''}).` };
    }

    function restoreSummonGear(s) {
        if (s.equipSlot) {
            const prefix = s.equipSlot === 'ranged' ? 'wep-ranged' : 'wep-melee';
            document.getElementById(prefix + '-name').value = s.savedWeaponName || '';
            document.getElementById(prefix + '-dmg').value = s.savedWeaponDmg || 0;
            const typeField = document.getElementById(prefix + '-type');
            if (typeField && s.savedWeaponType) typeField.value = s.savedWeaponType;
            // вернуть настоящее оружие в слот, если оно ещё в инвентаре и слот не занят другим
            const slotKeyS = s.equipSlot === 'ranged' ? 'rangedWeapon' : 'meleeWeapon';
            if (s.savedSlotItemId && !equippedSlots[slotKeyS] && playerInventory.some(i => i.itemId === s.savedSlotItemId && i.count > 0)) equippedSlots[slotKeyS] = s.savedSlotItemId;
            if (s.savedOffhandId && !equippedSlots.meleeWeaponOffhand && !equippedSlots.shield && playerInventory.some(i => i.itemId === s.savedOffhandId && i.count > 0)) {
                equippedSlots.meleeWeaponOffhand = s.savedOffhandId;
                document.getElementById('wep-melee-offhand-name').value = s.savedOffhandName || '';
                document.getElementById('wep-melee-offhand-dmg').value = s.savedOffhandDmg || 0;
            }
        }
    }

    window.summonCreature = function () {
        const idx = parseInt(document.getElementById('summon-template-select').value) || 0;
        const t = summonTemplates[idx];
        const resultEl = document.getElementById('summon-create-result');
        if (!t) return;
        if (t.spellName && !isSpellKnownOrScrolled(t.spellName)) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">Нужно знать заклинание «${escHtml(t.spellName)}» (выучено или есть свиток).</span>`;
            return;
        }
        const enhanced = !!(document.getElementById('summon-enhanced-check') && document.getElementById('summon-enhanced-check').checked && !document.getElementById('summon-enhanced-check').disabled);
        // Призыв по заклинанию — обычным кастом (мана, действие хода, руки) или чтением свитка; бесплатного призыва из панели нет.
        if (t.spellName) {
            const ln = t.spellName.toLowerCase();
            const card = customSpells.find(sp => String(sp.name || '').toLowerCase() === ln);
            if (card) { castCustomSpell(card.id, enhanced); resultEl.innerHTML = ''; return; }
            const scroll = playerInventory.find(i => i.count > 0 && (i.itemId === 'Свиток: ' + t.spellName || i.itemId === 'Свиток: ' + t.spellName + '#stolen'));
            if (scroll) { window.useScrollItem(scroll.itemId); resultEl.innerHTML = ''; return; }
        }
        const res = t.category === 'armor' ? castFleshSpell(t, enhanced) : performSummon(t, enhanced);
        resultEl.innerHTML = res.ok ? `<span style="color:#2ecc71;">✅ ${escHtml(res.message)}</span>` : `<span style="color:#e74c3c;">${escHtml(res.message)}</span>`;
    };

    function renderActiveSummonsList() {
        const el = document.getElementById('active-summons-list');
        if (el) {
            if (!activeSummons.length) {
                el.innerHTML = '<p style="opacity:.6; font-size:14px;">Нет активных существ.</p>';
            } else {
                const au = getSummonAuras();
                const auraLine = (au.dmg || au.armor || au.resMagic || au.resElem || au.dmgPct || au.resPct)
                    ? `<p style="font-size:13px; color:#9b59b6; margin:2px 0 6px;">✨ Ауры призыва: ${[au.dmg ? '+' + au.dmg + ' урона' : '', au.dmgPct ? '+' + au.dmgPct + '% урона' : '', au.resPct ? 'сопр. урону и стихиям ' + au.resPct + '%' : '', au.armor ? '+' + au.armor + ' брони' : '', au.resMagic ? 'сопр. магии ' + au.resMagic + '%' : '', au.resElem ? 'сопр. стихиям ' + au.resElem + '%' : ''].filter(Boolean).join(' · ')} (урон учитывается в атаке существа; защиту учитывает мастер при уроне по существу)</p>` : '';
                el.innerHTML = auraLine + activeSummons.map(s => `
                    <div class="party-row">
                        <div class="row-name"><strong>${escHtml(s.name)}${s.devour ? ' 💀' : ''}</strong><span>${s.permanent ? 'навсегда' : s.turnsRemaining + ' х. осталось'}</span></div>
                        <div style="font-size:14px; margin:2px 0;">
                            ${s.maxHp ? `ХП: <input type="number" value="${s.curHp}" style="width:65px; display:inline;" onchange="setSummonHp('${s.id}', this.value)"> / ${s.maxHp} · ` : ''}
                            ${s.dmg !== null ? `Урон: ${s.dmg} (${escHtml(s.dmgType || '')}) · ` : ''}${s.equipSlot ? '⚔️ занимает слот оружия · ' : ''}${s.category === 'armor' ? '🛡️ занимает кирасу · ' : ''}Скорость: ${s.speed} фт.
                        </div>
                        <button style="width:100%; margin-top:2px;" onclick="dismissSummon('${s.id}')">Развеять/Отпустить</button>
                    </div>`).join('');
            }
        }
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
    }

    window.setSummonHp = function (id, value) {
        const s = activeSummons.find(x => x.id === id);
        if (!s) return;
        s.curHp = Math.max(0, parseInt(value) || 0);
        saveLocalStorage();
    };

    window.dismissSummon = function (id) {
        const idx = activeSummons.findIndex(x => x.id === id);
        if (idx === -1) return;
        const s = activeSummons[idx];
        { // Предмет-основа (кучка костей) возвращается. Старые сохранения без поля: постоянные скелеты возвращали кости и раньше.
            const retItem = s.returnItem !== undefined ? s.returnItem : (s.permanent ? 'Кучка костей' : null);
            if (retItem) {
                const protoR = (window.allItems || []).find(i => i.name === retItem) || {};
                addToInventory(retItem, retItem, 1, protoR.weight || 1, protoR.category || 'Бытовые предметы', protoR.effect || '', { price: protoR.price });
                renderInventoryList();
            }
        }
        restoreSummonGear(s);
        activeSummons.splice(idx, 1);
        renderActiveSummonsList();
        updateAll();
        saveLocalStorage();
    };

    // Тикает вместе с обычными активными эффектами по нажатию «Следующий ход»/«Следующий круг».
    function tickActiveSummons() {
        // «Пожирающая сила»: помеченные существа умирают, когда заканчивается их ход.
        activeSummons.filter(s => s.devour).map(s => s.id).forEach(id => { const sm = activeSummons.find(x => x.id === id); if (sm) { alertSafe('💀 «' + sm.name + '» погибает от «Пожирающей силы».'); window.dismissSummon(id); } });
        activeSummons.forEach(s => { if (!s.permanent) s.turnsRemaining -= 1; });
        const expired = activeSummons.filter(s => !s.permanent && s.turnsRemaining <= 0);
        expired.forEach(restoreSummonGear);
        activeSummons = activeSummons.filter(s => s.permanent || s.turnsRemaining > 0);
        renderActiveSummonsList();
        if (expired.length) updateAll();
    }

    function renderPouchPanel() {
        const capEl = document.getElementById('pouch-capacity-info');
        const loadSelect = document.getElementById('pouch-load-select');
        const listEl = document.getElementById('pouch-contents-list');
        if (!capEl || !loadSelect || !listEl) return;
        const capacity = getPouchCapacity();
        if (!equippedSlots.pouch) {
            capEl.textContent = 'Подсумок не надет.';
            loadSelect.innerHTML = '<option value="">—</option>';
            loadSelect.disabled = true;
            listEl.innerHTML = '';
            return;
        }
        loadSelect.disabled = false;
        capEl.textContent = `Занято: ${pouchContents.length} / ${capacity}`;
        // В подсумок кладутся зелья, яды и свитки — всё это достаётся бонусным действием.
        const potions = playerInventory.filter(i => i.count > 0 && (potionKindOf(i) || isScrollInvItem(i)));
        const prevPick = loadSelect.value;
        loadSelect.innerHTML = potions.length
            ? potions.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (есть: ${i.count})</option>`).join('')
            : '<option value="">Нет зелий, ядов и свитков в инвентаре</option>';
        if (potions.some(i => i.itemId === prevPick)) loadSelect.value = prevPick;
        listEl.innerHTML = pouchContents.length
            ? pouchContents.map((entry, idx) => `
                <div class="party-row">
                    <div class="row-name"><span>${escHtml(entry.name)}</span></div>
                    <div style="font-size:13px; opacity:.8; margin:2px 0;">${escHtml(entry.effect || '')}</div>
                    <div style="display:flex; gap:6px;">
                        ${entry.scroll ? `<button class="btn-success" style="flex:1; background:#3b2f5c;" onclick="useScrollFromPouch(${idx})">📜 ${entry.battle ? 'Достать для атаки' : 'Прочитать'}</button>` : ''}
                        ${pouchEntryIsPoison(entry) ? `<button class="btn-danger" style="flex:1; background:#5b2c6f;" onclick="applyPoisonFromPouch(${idx})">☠ На оружие</button>` : ''}
                        ${entry.scroll ? '' : `<button class="${pouchEntryIsPoison(entry) ? '' : 'btn-success'}" style="flex:1;" onclick="drinkFromPouch(${idx})">Выпить</button>`}
                        <button style="flex:1;" onclick="returnFromPouch(${idx})">Убрать обратно</button>
                    </div>
                </div>`).join('')
            : '<p style="opacity:.6; font-size:14px;">Подсумок пуст.</p>';
    }

    // Яд в подсумке раньше возвращался в инвентарь категорией «Зелье» (категория не хранилась) — теряя кнопку «На оружие».
    function pouchEntryCategory(entry) { return entry.category || (/^Яд/i.test(entry.name || '') ? 'Яд (лут)' : /^Свиток:/.test(entry.name || '') ? 'Свиток' : 'Зелье'); }
    function pouchEntryIsPoison(entry) { return /^Яд/i.test(pouchEntryCategory(entry)); }

    window.loadPouch = function () {
        const select = document.getElementById('pouch-load-select');
        const itemId = select.value;
        if (!itemId || !equippedSlots.pouch) return;
        const capacity = getPouchCapacity();
        if (pouchContents.length >= capacity) { alert('Подсумок полон.'); return; }
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0) return;
        removeFromInventoryByName(itemId, 1);
        if (isScrollInvItem(item)) { // свиток: храним всё, что нужно для чтения и возврата в инвентарь
            pouchContents.push({ itemId: item.itemId, name: item.name, category: item.category || 'Свиток', effect: item.effect || '', price: item.price, scroll: true,
                battle: !!parseSpellDamageFromDesc(item.effect || ''), scrollSchool: item.scrollSchool || null, scrollSpellName: item.scrollSpellName || null, scrollTier: item.scrollTier || null, weight: item.weight || 0.1, stolen: !!item.stolen });
            renderPouchPanel(); renderInventoryList(); saveLocalStorage();
            return;
        }
        pouchContents.push({ itemId: item.itemId, name: item.name, category: item.category || '', effect: item.effect || '', alchemyEffects: item.alchemyEffects || null, price: item.price, craftCost: item.craftCost, craftKind: item.craftKind, weight: item.weight, stolen: !!item.stolen });
        renderPouchPanel();
        renderInventoryList();
        saveLocalStorage();
    };

    // Нанести яд из подсумка на оружие (так же, как из инвентаря)
    // Цена и стоимость крафта едут с зельем в подсумок и обратно (раньше вернувшееся зелье теряло цену и продавалось за 0).
    function pouchExtra(entry) { const o = { alchemyEffects: entry.alchemyEffects }; if (entry.stolen) o.stolen = true; if (entry.price) o.price = entry.price; if (entry.craftCost) { o.craftCost = entry.craftCost; o.craftKind = entry.craftKind; } if (entry.scroll) { o.scrollSchool = entry.scrollSchool; o.scrollSpellName = entry.scrollSpellName; o.scrollTier = entry.scrollTier; } return o; }

    window.applyPoisonFromPouch = function (idx) {
        const entry = pouchContents[idx];
        if (!entry) return;
        if (!entry.alchemyEffects || !entry.alchemyEffects.length) { alert('У этого яда нет описанных эффектов — мастер применит его вручную.'); return; }
        if (!equippedSlots.meleeWeapon && !equippedSlots.rangedWeapon) { alert('Сначала экипируй оружие (ближнее или дальнее), на которое наносится яд.'); return; }
        if (weaponPoison && !confirm(`На оружии уже есть «${weaponPoison.name}». Смыть и нанести новый яд?`)) return;
        pouchContents.splice(idx, 1);
        weaponPoison = { name: entry.name, effects: entry.alchemyEffects.map(e => ({ name: e.name, magnitude: (typeof e.magnitude === 'number' ? e.magnitude : null), duration: e.duration || null, unit: e.unit || '' })) };
        renderWeaponPoisonStatus();
        renderPouchPanel();
        updateAll();
        saveLocalStorage();
        alchToast(`☠ Яд «${escHtml(entry.name)}» нанесён на оружие — сработает на одном ударе.`);
    };

    function isScrollInvItem(i) { return !!i && (/^свит/i.test(String(i.category || '')) || /^Свиток:/.test(String(i.name || ''))); }
    // Свиток из подсумка — бонусным действием. Обычный читается сразу; боевой (с уроном) кладётся в руку —
    // в список «Действие» атаки, а сам удар уже основным действием.
    window.useScrollFromPouch = function (idx) {
        const entry = pouchContents[idx];
        if (!entry || !entry.scroll) return;
        if (!bonusActionAllowed('достать свиток из подсумка')) return;
        const back = () => addToInventory(entry.itemId, entry.name, 1, entry.weight || 0.1, entry.category || 'Свиток', entry.effect || '',
            { price: entry.price, scrollSchool: entry.scrollSchool, scrollSpellName: entry.scrollSpellName, scrollTier: entry.scrollTier, stolen: entry.stolen ? true : undefined });
        if (entry.battle) {
            pouchContents.splice(idx, 1); back(); markBonusAction();
            renderPouchPanel(); renderInventoryList(); if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect(); saveLocalStorage();
            alert('📜 «' + entry.name + '» в руке — выбери его в «Действие» на вкладке «Сессия» и атакуй.');
            return;
        }
        const before = playerInventory.reduce((n, i) => n + (i.itemId === entry.itemId ? i.count : 0), 0);
        pouchContents.splice(idx, 1); back();
        window.useScrollItem(entry.itemId, true);
        const after = playerInventory.reduce((n, i) => n + (i.itemId === entry.itemId ? i.count : 0), 0);
        if (after <= before) markBonusAction(); // свиток прочитан — бонусное действие потрачено
        else { // не прочитался (нет руки, нет костей…) — возвращаем в подсумок
            removeFromInventoryByName(entry.itemId, 1); pouchContents.splice(idx, 0, entry);
        }
        renderPouchPanel(); renderInventoryList(); saveLocalStorage();
    };
    window.drinkFromPouch = function (idx) {
        const entry = pouchContents[idx];
        if (!entry) return;
        if (snWerewolfForm()) { alert('В облике зверя пить зелья нельзя — оборотень лечится только пожиранием трупов.'); return; }
        if (lichBlocksUse({ name: entry.name, effect: entry.effect, alchemyEffects: entry.effects }, false)) return;
        if (!bonusActionAllowed('пить из подсумка')) return; // подсумок — бонусное действие, одно за ход в бою
        // Сначала вопрос про яд, потом трата бонусного действия: «Отмена» не должна съедать действие.
        if (pouchEntryIsPoison(entry) && !confirm('Это ЯД. Его наносят на оружие (кнопка «☠ На оружие»). Выпить всё равно — он подействует на тебя?')) return;
        markBonusAction();
        activateTimedEffectFromItem(entry);
        pouchContents.splice(idx, 1);
        renderPouchPanel();
        updateAll();
        saveLocalStorage();
    };

    window.returnFromPouch = function (idx) {
        const entry = pouchContents[idx];
        if (!entry) return;
        // Стопку могли слить с одинаковыми зельями под другим id — возвращаем в неё, а не отдельной строкой.
        let backId = entry.itemId;
        if (!playerInventory.some(i => i.itemId === backId)) {
            const same = playerInventory.find(i => i.name === entry.name && !!i.stolen === !!entry.stolen && (i.effect || '') === (entry.effect || '') && JSON.stringify(i.alchemyEffects || null) === JSON.stringify(entry.alchemyEffects || null));
            if (same) backId = same.itemId;
        }
        addToInventory(backId, entry.name, 1, (typeof entry.weight === 'number' ? entry.weight : (entry.scroll ? 0.1 : 0.25)), pouchEntryCategory(entry), entry.effect, pouchExtra(entry));
        pouchContents.splice(idx, 1);
        renderPouchPanel();
        saveLocalStorage();
    };
