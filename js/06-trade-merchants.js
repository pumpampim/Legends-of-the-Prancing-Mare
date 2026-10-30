
    // ---------- Задача C: покупка у живых торговцев ----------

    // Репутация в данном владении влияет на цену ±5% (плюс = скидка, минус = наценка) — само
    // число НИГДЕ не показывается игроку (Задача D), только тихо участвует в формуле цены.
    // Репутация хранится по коротким именам владений (как у мастера), а владение сессии приходит
    // из погодной панели в виде «Солитьюд (Хаафингар)», «Маркарт (Предел)» — сводим к короткому имени.
    const REPUTATION_HOLD_KEYS = ['Вайтран', 'Рифт', 'Хаафингар', 'Хьялмарк', 'Истмарк', 'Фолкрит', 'Предел', 'Белый Берег', 'Винтерхолд', 'Схолстейм'];
    function repHoldKey(hold) {
        if (!hold) return null;
        if (playerReputationByRegion && Object.prototype.hasOwnProperty.call(playerReputationByRegion, hold)) return hold;
        const low = String(hold).toLowerCase();
        return REPUTATION_HOLD_KEYS.find(k => low.indexOf(k.toLowerCase()) !== -1) || hold;
    }
    window.repHoldKey = repHoldKey;
    function getReputationPriceMult(hold) {
        if (!hold || !playerReputationByRegion) return 1;
        const rep = playerReputationByRegion[repHoldKey(hold)] || 0;
        // Эпик 5.4: пороги последствий. Раньше любой плюс = ×0.95, любой минус = ×1.05; теперь сильная репутация заметнее.
        if (rep <= -3) return 1.25;   // подозревают: торговцы набавляют
        if (rep >= 5) return 0.9;     // уважают: скидка
        if (rep > 0) return 0.95;
        if (rep < 0) return 1.05;
        return 1;
    }

    // Ранг Гильдии воров механически даёт скидку у торговцев — с капюшоном соответствующего
    // ранга (Новичок 10% / Умелый вор 15% / Мастер вора 20%, из реальных данных Фракции.xlsx).
    // Первый пример "ранг влияет механически", остальные гильдии — по мере проработки.
    // Скидка 10/15/20% — свойство капюшонов Гильдии воров (Фракции.xlsx), работает, пока капюшон надет.
    const THIEF_HOOD_DISCOUNT = { 'Капюшон Гильдии Воров': 0.90, 'Капюшон Умелого вора': 0.85, 'Капюшон мастера вора': 0.80 };
    function getGuildDiscountMult() {
        const id = equippedSlots && equippedSlots.helmet;
        const it = id ? playerInventory.find(i => i.itemId === id && i.count > 0) : null;
        return (it && THIEF_HOOD_DISCOUNT[it.name]) || 1;
    }

    function renderBuyMerchantTypeSelect() {
        const sel = document.getElementById('buy-merchant-type');
        if (!sel) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const stocks = (session && session.merchantStocks) || {};
        const keys = Object.keys(stocks);
        const prev = sel.value;
        sel.innerHTML = keys.length
            ? keys.map(k => `<option value="${escHtml(k)}">${escHtml(stocks[k].label)} — ${escHtml(stocks[k].hold)}</option>`).join('')
            : '<option value="">— мастер ещё не завёз ассортимент —</option>';
        if (keys.includes(prev)) sel.value = prev;
    }

    // «Я в городе»: флаг в участнике сессии (его же ставит мастер). Без сессии торговцев всё равно нет.
    function isPlayerInTown() {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const uid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const me = session && session.participants && uid ? session.participants[uid] : null;
        const fromSession = !(me && me.inTown === false);
        if (typeof window.__inTownLocal === 'boolean') { // только что переключил сам — ждём подтверждения из сессии
            if (!me || fromSession === window.__inTownLocal) window.__inTownLocal = undefined; else return window.__inTownLocal;
        }
        return fromSession;
    }
    window.onInTownToggled = function (flag) {
        if (window.CloudSync && typeof window.CloudSync.setMyInTown === 'function') {
            window.CloudSync.setMyInTown(flag).catch(e => alert('Не удалось сохранить: ' + e.message));
        }
        window.__inTownLocal = !!flag;
        renderBuyList(); renderSellList();
        setTimeout(() => { window.__inTownLocal = undefined; }, 4000);
    };

    function renderBuyList() {
        renderBuyMerchantTypeSelect();
        const listEl = document.getElementById('buy-items-list');
        const infoEl = document.getElementById('buy-merchant-info');
        if (!listEl || !infoEl) return;
        const townChk = document.getElementById('in-town-check');
        if (townChk) townChk.checked = isPlayerInTown();
        if (!isPlayerInTown()) {
            listEl.innerHTML = '';
            infoEl.innerHTML = '<p style="color:#e67e22;">🏕 Ты вне города — торговцев здесь нет. Отметь «Я в городе», когда доберёшься до поселения (или попроси мастера).</p>';
            return;
        }
        const key = document.getElementById('buy-merchant-type').value;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const stock = key && session && session.merchantStocks ? session.merchantStocks[key] : null;
        if (!stock) { listEl.innerHTML = ''; infoEl.innerHTML = ''; return; }
        // disposition торговца (-2 Вражда .. +2 Союзник) — задаётся мастером отдельно от
        // ассортимента. При -2 торговля блокируется полностью (та же защита экономики, что и у
        // скупщиков краденого — не хочет вести дела, не вопрос цены).
        const disposition = stock.disposition || 0;
        if (disposition <= -2) {
            listEl.innerHTML = '';
            infoEl.innerHTML = `<p style="color:#e74c3c;">😠 Торговец развернулся к вам спиной и отказывается вести дела.</p>`;
            return;
        }
        const dispositionMult = { '-1': 1.25, '0': 1, '1': 0.9, '2': 0.8 }[String(disposition)] || 1;
        const repMult = getReputationPriceMult(stock.hold);
        const holidayDiscount = getActiveHolidayDiscount(key);
        const dispositionNote = disposition ? `<br><span style="opacity:.8;">${disposition > 0 ? '🙂' : '😒'} Отношение торговца: ${disposition > 0 ? `скидка ${Math.round((1 - dispositionMult) * 100)}%` : `наценка ${Math.round((dispositionMult - 1) * 100)}%`} (уже учтено в ценах)</span>` : '';
        infoEl.innerHTML = `💰 У торговца: <strong>${formatNumber(stock.gold)}</strong> золота · товаров: ${stock.items.length}` +
            (holidayDiscount ? `<br><span style="color:var(--accent-color);">🎉 Скидка праздника: −${holidayDiscount}% (уже учтена в ценах ниже)</span>` : '') +
            (/^blacksmith/.test(key) && companionsMember() ? `<br><span style="color:var(--accent-color);">🐺 Соратники: −10% у кузнецов (уже учтена в ценах ниже)</span>` : '') + dispositionNote;
        const catFilterEl = document.getElementById('buy-category-filter');
        const catFilter = catFilterEl ? catFilterEl.value : 'all';
        const withIdx = stock.items.map((it, idx) => ({ it, idx }));
        const filtered = catFilter === 'all' ? withIdx : withIdx.filter(({ it }) => classifyItemBroad(it) === catFilter);
        listEl.innerHTML = filtered.length ? filtered.map(({ it, idx }) => {
            const price = Math.max(1, Math.round(computeBuyPrice(it.price, it.category, key) * repMult * dispositionMult));
            const canAfford = price <= (parseInt(document.getElementById('char-gold').value) || 0); // у торговца золота хватает всегда: деньги идут ему
            const qty = it.qty || 1;
            // Цена и кнопка "Купить" рядом с названием (как в списке продажи), а не на дальнем краю строки.
            return `<div class="stat-block" style="align-items:flex-start; justify-content:flex-start; gap:12px;">
                <span style="flex:0 1 300px; min-width:0;"><strong>${escHtml(it.name)}</strong>${qty > 1 ? ` <span style="opacity:.6; font-size:12px;">(есть: ${qty})</span>` : ''}${it.effect ? `<br><span style="font-size:12px; color:#8a8171;">${escHtml(it.effect)}</span>` : ''}</span>
                <span style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <span style="color:var(--accent-color);">${formatNumber(price)} септ.</span>
                    <button class="btn-success" style="width:auto; padding:2px 8px;" ${canAfford ? '' : 'disabled'} onclick="buyFromMerchant('${jsq(key)}', ${idx})">Купить</button>
                </span>
            </div>`;
        }).join('') : (stock.items.length ? '<p style="opacity:.6; font-size:13px;">В этой категории у торговца пусто.</p>' : '<p style="opacity:.6; font-size:13px;">Пусто — весь товар распродан.</p>');
    }
    window.renderBuyList = renderBuyList;

    // Задача F: скидка праздника — либо по текущей дате на листе (естественно совпал день),
    // либо запущена мастером вручную (sessions/{code}.activeHoliday), независимо от даты.
    // Берём МАКСИМАЛЬНУЮ из двух, если вдруг совпали оба источника.
    // merchantKey — ключ торговца («alchemist2@Вайтран»): скидка с пометкой discountOnly («Алхимики дают скидку…») касается только его.
    function holidayDiscountApplies(h, merchantKey) { return !h.discountOnly || (merchantKey && String(merchantKey).indexOf(h.discountOnly) === 0); }
    function getActiveHolidayDiscount(merchantKey) {
        let discount = 0;
        const todayHolidays = (typeof findTodayHolidays === 'function') ? findTodayHolidays() : [];
        todayHolidays.forEach(h => { if (h.discount && h.discount > discount && holidayDiscountApplies(h, merchantKey)) discount = h.discount; });
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        if (session && session.activeHoliday && session.activeHoliday.discount && session.activeHoliday.discount > discount && holidayDiscountApplies(session.activeHoliday, merchantKey)) {
            discount = session.activeHoliday.discount;
        }
        return discount;
    }

    // Цена покупки: та же формула перка/Красноречия, что уже используется в системе (через
    // computeSellPrice не подходит — там модификатор для ПРОДАЖИ игроком; тут отдельно, покупка
    // обычно дороже базовой цены).
    // ---- Защита от арбитража «купил дёшево → продал дороже» ----
    // Скидки (гильдия воров, праздник, перки, репутация, расположение) делают покупку дешевле, чем продажа того же товара
    // (продажа = 100% базовой цены, покупка = 115% минус скидки). Без ограничения можно было гонять товар по кругу.
    // Теперь партия, КУПЛЕННАЯ у торговца, при продаже стоит не больше 90% от цены, по которой её купили.
    // Лут и найденное продаётся как раньше — ограничение только на купленные штуки (и только пока они лежат в инвентаре).
    let marketBought = {}; // { название: { qty, unit } }
    const MARKET_RESELL_CAP = 0.9;
    function noteMarketBuy(name, qty, unit) {
        if (!name || !(qty > 0) || !(unit > 0)) return;
        name = String(name).replace(/ \((Хорошее|Качественное|Отличное|Безупречное|Эпическое|Легендарное)\)$/, '');
        const r = marketBought[name] || { qty: 0, unit: 0 };
        const tot = r.qty * r.unit + qty * unit, q = r.qty + qty;
        marketBought[name] = { qty: q, unit: tot / q };
    }
    // Ключ — имя без суффикса заточки («Стальной меч (Хорошее)» → «Стальной меч»): заточка не снимает ограничение.
    const marketKey = n => String(n || '').replace(/ \((Хорошее|Качественное|Отличное|Безупречное|Эпическое|Легендарное)\)$/, '');
    function marketSellTotal(item, qty, unitPrice) {
        // Потолок от цены покупки, записанной на самой вещи (переживает передачу другому игроку и заточку)
        if (parseFloat(item.boughtUnit) > 0 && (parseInt(item.boughtQty) || 0) > 0) {
            const nI = Math.max(0, Math.min(qty, parseInt(item.boughtQty) || 0, item.count || 0));
            const cuI = Math.min(unitPrice, Math.floor(parseFloat(item.boughtUnit) * MARKET_RESELL_CAP));
            return { total: unitPrice * (qty - nI) + cuI * nI, capped: cuI < unitPrice ? nI : 0, n: nI };
        }
        const r = marketBought[marketKey(item.name)] || marketBought[item.name];
        if (!r || !(r.qty > 0)) return { total: unitPrice * qty, capped: 0 };
        const n = Math.max(0, Math.min(qty, r.qty, item.count || 0));
        const capUnit = Math.floor(r.unit * MARKET_RESELL_CAP);
        const cu = Math.min(unitPrice, capUnit);
        return { total: unitPrice * (qty - n) + cu * n, capped: cu < unitPrice ? n : 0, n };
    }
    function consumeMarketBought(item, qty) {
        if ((parseInt(item.boughtQty) || 0) > 0) { item.boughtQty = Math.max(0, item.boughtQty - qty); if (!item.boughtQty) { delete item.boughtQty; delete item.boughtUnit; } }
        const key = marketBought[marketKey(item.name)] ? marketKey(item.name) : item.name;
        const r = marketBought[key]; if (!r) return;
        r.qty -= Math.min(qty, r.qty);
        if (r.qty <= 0) delete marketBought[key];
    }

    // ---- Потолок цены продажи для СДЕЛАННЫХ игроком вещей ----
    // Цены в таблицах (кузня, алхимия, кулинария) в разы выше стоимости материалов: меч из материалов на 73 продавался
    // за 985, зелье из двух ингредиентов за 4 золотых — за 198, блюдо из продуктов на 4 — за 25. Так «наковал/сварил → продал»
    // стало лучшим заработком в игре. Теперь у сделанной вещи запоминается стоимость материалов (craftCost, за штуку),
    // а торговец платит не больше стоимости × множитель (CRAFT_SELL_CAPS). Покупные и найденные вещи не затронуты.
    // Значения подняты по просьбе автора после плейтеста (было smith 7 / alch 11 / cook 8 / ench 7): при прежних
    // потолках крафт почти не окупал время. Множитель — к стоимости материалов, ДО навыка речи, профиля торговца и
    // репутации, поэтому реальная выручка ниже. Табличная цена предмета остаётся верхней границей (Math.min ниже).
    const CRAFT_SELL_CAPS = { smith: 12, alch: 15, cook: 10, ench: 12 };
    function materialPrice(name) {
        const sm = (window.smithingMaterials || {})[name]; if (sm && sm.price) return sm.price;
        const ck = (window.cookingIngredients || {})[name]; if (ck && ck.price) return ck.price;
        const al = (window.alchemyIngredients || {})[name]; if (al && al.price) return al.price;
        const it = (window.allItems || []).find(i => i.name === name); return (it && it.price) || 0;
    }
    // Прибавка к цене при зачаровании/создании посоха: стоимость заполненного камня душ × 1.5 (камень — расход мастера, 50% — его наценка).
    function enchantPriceBonus(gemKey) { return Math.max(10, Math.round(materialPrice(gemKey) * 1.5)); }
    // Таблица «Зачарование»: цена = базовая стоимость предмета × 8 × сила зачарования.
    // Сила — доля от максимума: камень душ × (навык/100) × бонусы перков (для эффектов без числа — только камень).
    function enchantStrength(effect, soulGem, calc) {
        if (calc && !calc.boolean && effect && effect.maxValue) return calc.value / effect.maxValue;
        return (window.soulGemPower && window.soulGemPower[soulGem]) || 1;
    }
    function enchantedPrice(basePrice, effect, soulGem, calc) {
        return Math.max(1, Math.round((basePrice || 0) * 8 * enchantStrength(effect, soulGem, calc)));
    }
    function craftCostOf(ingredients, yieldCount) {
        const sum = (ingredients || []).reduce((a, i) => a + materialPrice(i.name) * (i.qty || 1), 0);
        return sum > 0 ? Math.round(sum / Math.max(1, yieldCount || 1) * 100) / 100 : 0;
    }

    // ---- Лимит «практики» навыков: проверки с самоназначаемой сложностью, взлом без реального замка и т.п. ----
    // Раньше можно было выставить сложность 1 в кубах (или взламывать самый лёгкий замок) и бесконечно качать навык.
    let restState = { key: '', n: 0, acts: {} };
    // Лимиты, которыми управляет МАСТЕР (панель «Лимиты игроков» в gm.html → sessions.playerLimits). Нет значения — берётся умолчание;
    // 0 — без ограничения. Умолчания: добыча (рыбалка/охота/сбор) без лимита, опыт за проверки 5/день на навык, смена дня — 20 в час.
    const PRACTICE_MIN_DC = 8;
    function gmLimit(key, def) {
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const v = sess && sess.playerLimits ? sess.playerLimits[key] : undefined;
        return (typeof v === 'number' && v >= 0) ? v : def;
    }
    function gameDayKey() { return gameYear + '-' + gameMonth + '-' + gameDayNum; }
    // Счётчики «за игровой день»: короткие отдыхи и добывающие занятия (рыбалка/охота/сбор трав). Сбрасываются при смене даты.
    function dayState() {
        const k = gameDayKey();
        if (!restState || restState.key !== k) restState = { key: k, n: 0, acts: {} };
        if (!restState.acts) restState.acts = {};
        return restState;
    }
    // Добыча (рыбалка / охота / сбор трав и грибов): за игровой день игрок бросает 1к12 до трёх раз (3к12 в сумме);
    // выпавшие числа складываются в общий запас попыток, которые он тратит на любое из трёх занятий как хочет.
    // Лимиты мастера по этим занятиям заменены этим броском (мастер может только поменять число бросков в день).
    const FORAGE_DIE = 12, FORAGE_ROLLS_DEFAULT = 3;
    function forageState() { const st = dayState(); if (!st.forage) st.forage = { rolls: 0, pool: 0 }; return st.forage; }
    function renderForageBars() {
        const f = forageState(), max = gmLimit('forageRolls', FORAGE_ROLLS_DEFAULT);
        const canRoll = max === 0 || f.rolls < max;
        const html = `🎲 Попыток добычи на сегодня: <strong>${f.pool}</strong> · бросков 1к${FORAGE_DIE}: ${f.rolls}${max > 0 ? '/' + max : ''} ` +
            `<button type="button" style="width:auto; padding:2px 10px; margin:0 0 0 6px;" ${canRoll ? '' : 'disabled'} onclick="rollForage()">Бросить 1к${FORAGE_DIE}</button>` +
            `<span style="opacity:.65; font-size:12px;"> (рыбалка, охота и сбор тратят по 1 попытке)</span>`;
        document.querySelectorAll('.forage-bar').forEach(el => { el.innerHTML = html; });
    }
    window.renderForageBars = renderForageBars;
    window.rollForage = function () {
        const f = forageState(), max = gmLimit('forageRolls', FORAGE_ROLLS_DEFAULT);
        if (max > 0 && f.rolls >= max) { alert('На сегодня все броски добычи сделаны (' + max + ').'); return; }
        const r = 1 + Math.floor(Math.random() * FORAGE_DIE);
        f.rolls++; f.pool += r;
        alert('🎲 Выпало ' + r + ' — +' + r + ' попыток добычи (рыбалка, охота, сбор). Сейчас доступно: ' + f.pool + '.');
        renderForageBars(); saveLocalStorage();
    };
    // true — попытка списана; false — запаса нет (сообщение в resultEl).
    function useDailyAction(kind, resultEl) {
        const f = forageState(), st = dayState();
        if (gmLimit('forageRolls', FORAGE_ROLLS_DEFAULT) > 0 || f.rolls > 0) {
            if (f.pool <= 0) {
                if (resultEl) resultEl.innerHTML = `<span style="color:#e67e22;">Нет попыток добычи. Брось 1к${FORAGE_DIE} (до ${gmLimit('forageRolls', FORAGE_ROLLS_DEFAULT) || '∞'} раз в день) — выпавшее число и есть число попыток.</span>`;
                return false;
            }
            f.pool--;
        }
        st.acts[kind] = (st.acts[kind] || 0) + 1;
        renderForageBars();
        return true;
    }
    function practiceXpAllowed(skillName) {
        const k = gameDayKey();
        if (!skillProgress._practice || skillProgress._practice.key !== k) skillProgress._practice = { key: k, c: {} };
        const c = skillProgress._practice.c;
        const capP = gmLimit('practice', 5);
        if (capP > 0 && (c[skillName] || 0) >= capP) return false;
        c[skillName] = (c[skillName] || 0) + 1;
        return true;
    }
    window.practiceXpAllowed = practiceXpAllowed;

    function computeBuyPrice(basePrice, category, merchantKey) {
        // торговец накидывает свою наценку сверху; у животных цена из правил (лошадь 1000, собака 500) — без наценки
        let price = basePrice * (category === 'Животные' ? 1 : 1.15);
        // Задача H: еда зимой дороже (меньше свежих продуктов, больше расходов на хранение).
        const foodCats = ['Готовые продукты', 'Сырые продукты', 'Напитки'];
        if (category && foodCats.includes(category) && getCurrentSeason().name === 'Зима') price *= 1.2;
        const holidayDiscount = getActiveHolidayDiscount(merchantKey);
        if (holidayDiscount) price *= (1 - holidayDiscount / 100);
        price *= getGuildDiscountMult();
        if (merchantKey && /^blacksmith/.test(String(merchantKey)) && companionsMember()) price *= 0.9; // Соратники: −10% у кузнецов, не зависит от Красноречия
        if (gb('prices')) price *= (1 - gb('prices') / 100);
        // «Голос императора»: имперцы торгуют на 5% выгоднее — и при продаже (getRacialPriceBonus), и при покупке
        if ((document.getElementById('char-race') || {}).value === 'imperial') price *= 0.95;
        // «Повышение искусства торговли» (чары/зелье): «цены продажи и покупки выгоднее» — при покупке скидка на те же N%
        const tradeBoost = getSkillBoostPercent('Торговля');
        if (tradeBoost > 0) price *= (1 - Math.min(50, tradeBoost) / 100);
        // Перк «Торговец»: цены выгоднее и при покупке (10% +5% за ступень, макс. 30%); «Очарование» — ещё 10%, если отмечено.
        const pbB = window.perkBonuses || {};
        if (pbB.merchantPriceBonus) price *= (1 - Math.min(0.3, pbB.merchantPriceBonus));
        if (pbB.hasCharmPerk && (document.getElementById('sell-charm-active') || {}).checked) price *= 0.9;
        return Math.round(price);
    }

    window.buyFromMerchant = function (key, idx, qtyArg) {
        if (!isPlayerInTown()) { alert('Ты вне города — закупаться у торговцев нельзя.'); return; }
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const stock = session && session.merchantStocks ? session.merchantStocks[key] : null;
        if (!stock || !stock.items[idx]) { alert('Товар уже не в наличии — обнови список.'); return; }
        const it = stock.items[idx];
        if ((stock.disposition || 0) <= -2) { alert('Торговец отказывается вести дела.'); return; }
        const dispositionMult = { '-1': 1.25, '0': 1, '1': 0.9, '2': 0.8 }[String(stock.disposition || 0)] || 1;
        const repMult = getReputationPriceMult(stock.hold);
        const price = Math.max(1, Math.round(computeBuyPrice(it.price, it.category, key) * repMult * dispositionMult)); // цена за 1 шт.
        const goldInput = document.getElementById('char-gold');
        const myGold = parseInt(goldInput.value) || 0;
        if (price > myGold) { alert('Не хватает золота.'); return; }
        if (!window.CloudSync || typeof window.CloudSync.buyFromMerchantStock !== 'function') { alert('Нет соединения с сессией.'); return; }
        if (it.pet) { buyPetFromMerchant(key, idx, it, price); return; }
        const stockQty = it.qty || 1;
        const maxQty = Math.max(1, Math.min(stockQty, Math.floor(myGold / price)));
        // Несколько штук в наличии — спрашиваем, сколько именно взять.
        if (qtyArg === undefined && maxQty > 1) {
            askQuantity({ title: 'Купить: ' + it.name, note: 'В наличии: ' + stockQty + ' · цена за шт.: ' + formatNumber(price) + ' септ. · у тебя ' + formatNumber(myGold) + ' зол.',
                max: maxQty, def: 1, unitPrice: price, okText: 'Купить',
                onOk: n => window.buyFromMerchant(key, idx, n) });
            return;
        }
        const qty = Math.max(1, Math.min(maxQty, parseInt(qtyArg) || 1));
        const total = price * qty;
        // Золото списываем сразу (по текущему значению), при ошибке возвращаем. Раньше списание шло после ответа сервера
        // и от устаревшего значения — двойной клик «Купить» давал две вещи за цену одной.
        const goldNow = parseInt(goldInput.value) || 0;
        if (total > goldNow) { alert('Не хватает золота.'); return; }
        goldInput.value = goldNow - total; saveLocalStorage(true);
        window.CloudSync.buyFromMerchantStock(key, idx, total, qty, { name: it.name, sig: it.sig || '', price: it.price }).catch(e => { goldInput.value = (parseInt(goldInput.value) || 0) + total; updateAll(); saveLocalStorage(true); throw e; }).then(() => {
            noteMarketBuy(it.name, qty, price);
            if (it.playerItem) { // вещь, которую игрок сам продал торговцу, — возвращается со всеми прежними свойствами (чары, улучшения)
                const pi = Object.assign({}, it.playerItem);
                const pid = pi.itemId || it.name;
                delete pi.itemId; delete pi.name; delete pi.count; delete pi.weight; delete pi.category; delete pi.effect;
                addToInventory(pid, it.name, qty, it.weight || 0, it.category || '', it.effect || '', pi);
            } else {
                const isStaffB = it.type === 'staff' || it.category === 'Посохи';
                addToInventory(it.name, it.name, qty, it.weight || 0, it.category || '', it.effect || '', Object.assign({ slot: isStaffB ? 'ranged' : it.slot, armorValue: it.armor, weaponDmg: it.dmg, price: it.price, capacity: it.capacity }, isStaffB ? { isStaff: true } : {}));
            }
            { // цена покупки едет с самой вещью: при передаче другому игроку или заточке потолок перепродажи сохраняется
                const bought = playerInventory.find(x => x.itemId === (it.playerItem ? (it.playerItem.itemId || it.name) : it.name));
                if (bought) {
                    const prevN = Math.max(0, (bought.count || 0) - qty), prevU = parseFloat(bought.boughtUnit) || 0;
                    bought.boughtUnit = prevU && prevN ? (prevU * prevN + price * qty) / (prevN + qty) : price;
                    bought.boughtQty = Math.min(bought.count || qty, (parseInt(bought.boughtQty) || 0) + qty);
                }
            }
            const speechSuccesses = trackSpeechTrade(total, true, false);
            renderInventoryList();
            updateAll();
            saveLocalStorage();
            alert(`Куплено: ${it.name}${qty > 1 ? ' ×' + qty : ''} за ${total} септимов.${speechSuccesses ? ' (+' + speechSuccesses + ' усп. Красноречия)' : ''}`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    // Животное у торговца (конюшни, продавец собак…): по одному, с кличкой; в рюкзак не кладётся, а идёт в «Животные».
    function buyPetFromMerchant(key, idx, it, price) {
        const name = prompt(`Купить «${it.name}» за ${formatNumber(price)} септимов? Как назовёшь?`, it.name);
        if (name === null) return;
        const goldInput = document.getElementById('char-gold');
        const goldNow = parseInt(goldInput.value) || 0;
        if (price > goldNow) { alert('Не хватает золота.'); return; }
        const petName = (name || '').trim() || it.name;
        goldInput.value = goldNow - price; saveLocalStorage(true);
        window.CloudSync.buyFromMerchantStock(key, idx, price, 1, { name: it.name, sig: it.sig || '', price: it.price }).catch(e => { goldInput.value = (parseInt(goldInput.value) || 0) + price; updateAll(); saveLocalStorage(true); throw e; }).then(() => {
            playerPets.push(makePetFromTemplate(it.pet, petName));
            const speechSuccesses = trackSpeechTrade(price, true, false);
            updateAll(); saveLocalStorage(true); window.renderPetsPanel();
            const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🐾 ${nm} покупает: ${it.name} «${petName}» за ${price} септимов.`, nm);
            alert(`Куплено: ${it.pet.icon || '🐾'} ${it.name} «${petName}» за ${price} септимов. Животное — во вкладке «Инвентарь» → «Животные».${speechSuccesses ? ' (+' + speechSuccesses + ' усп. Красноречия)' : ''}`);
        }).catch(e => alert('Ошибка: ' + e.message));
    }
    function renderSellList() {
        const listEl = document.getElementById('sell-items-list');
        if (!listEl) return;
        { const ib = document.getElementById('sell-invest-btn'); if (ib) { const tg = getSellTarget(); const uidI = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
            ib.hidden = !(tg.stock && isPerkChecked('Вкладчик') && !(Array.isArray(tg.stock.investors) && uidI && tg.stock.investors.indexOf(uidI) !== -1)); } }
        const progressEl = document.getElementById('speech-trade-progress');
        if (progressEl) {
            const speechVal = getEffectiveSkillValue('Красноречие');
            const speechIdx = skillNames.indexOf('Красноречие');
            progressEl.textContent = `🗣 Красноречие: ${speechVal} · Прогресс: ${skillProgress[speechIdx] || 0}/${getSuccessesNeededForSkill(speechVal)}`;
        }
        renderSellMerchantSelect();
        const target = getSellTarget();
        const merchantType = target.profile;
        const perks = window.perkBonuses || {};
        const charmCheckbox = document.getElementById('sell-charm-active');
        const charmLockedNote = document.getElementById('sell-charm-locked');
        if (!perks.hasCharmPerk) {
            charmCheckbox.checked = false;
            charmCheckbox.disabled = true;
            charmLockedNote.style.display = 'block';
        } else {
            charmCheckbox.disabled = false;
            charmLockedNote.style.display = 'none';
        }
        const charmActive = charmCheckbox.checked && !!perks.hasCharmPerk;

        // Задача C: краденое можно продать только скупщику, и только состоя в Гильдии воров
        // (хотя бы 1 выполненный заказ — считаем это активным членством).
        const inThievesGuild = normalizePlayerGuildEntry((playerGuildsData || {})['Гильдия воров']).member;
        const fenceLocked = merchantType === 'fence' && !inThievesGuild;
        const stockNoteEl = document.getElementById('sell-stock-note');
        if (stockNoteEl) {
            if (target.stock) {
                const dispo = target.stock.disposition || 0;
                stockNoteEl.innerHTML = dispo <= -2 ? '<span style="color:#e74c3c;">😠 Торговец отказывается вести дела.</span>'
                    : `💰 У торговца <strong>${formatNumber(target.stock.gold)}</strong> золота — столько он может заплатить.${dispo ? ` ${dispo > 0 ? '🙂 Он к тебе расположен — платит больше' : '😒 Он к тебе недружелюбен — платит меньше'} (уже учтено в ценах).` : ''} Проданное попадает в его ассортимент (его можно выкупить обратно в блоке «Купить у торговца» ниже, пока ассортимент не обновили).`;
            } else stockNoteEl.innerHTML = '';
        }
        if (target.stock && (target.stock.disposition || 0) <= -2) { listEl.innerHTML = ''; return; }

        const blockReason = getSellBlockReason();
        if (blockReason) { listEl.innerHTML = '<p style="color:#e67e22; font-size:14px;">' + blockReason + '</p>'; return; }
        const sellable = playerInventory.filter(i => i.price);
        const catFilterEl = document.getElementById('sell-category-filter');
        const catFilter = catFilterEl ? catFilterEl.value : 'all';
        const filtered = catFilter === 'all' ? sellable : sellable.filter(i => classifyItemBroad(i) === catFilter);
        if (!sellable.length) {
            listEl.innerHTML = '<p style="opacity:.6; font-size:14px;">Нет вещей с ценой для продажи.</p>';
            return;
        }
        if (fenceLocked) {
            listEl.innerHTML = '<p style="color:#e74c3c; font-size:14px;">Скупщик не станет иметь с тобой дел — ты не состоишь в Гильдии воров (нет выполненных заказов).</p>';
            return;
        }
        if (!filtered.length) {
            listEl.innerHTML = '<p style="opacity:.6; font-size:14px;">В этой категории продавать нечего.</p>';
            return;
        }
        // Репутация в холде влияет на цену (±5%), но молча — если мастер ещё не задал владение
        // в погодной панели (session.currentHold пусто), getReputationPriceMult(hold) просто
        // возвращает 1 без предупреждения. Игрок видел бы "обычную" цену, не зная, что его
        // репутация сейчас никак не учитывается.
        const sessionForRepNote = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const repNote = (sessionForRepNote && !sessionForRepNote.currentHold)
            ? '<p style="opacity:.6; font-size:12px; margin-bottom:6px;">⚠ Репутация не применена к ценам — мастер ещё не задал текущее владение в погодной панели.</p>' : '';
        listEl.innerHTML = repNote + filtered.map(item => {
            const cat = classifyItemForMerchant(item);
            const matches = isSellProfileMatch(item, merchantType);
            const unitPrice = computeSellPrice(item, merchantType, charmActive, target.stock ? target.hold : undefined, target.stock ? target.stock.disposition : 0);
            const noteHtml = (merchantType !== 'pawnbroker' && merchantType !== 'fence' && !matches)
                ? '<span style="color:#e67e22;"> (не профиль, −20%)</span>' : '';
            const poorNote = (target.stock && unitPrice > target.stock.gold) ? '<span style="color:#e74c3c;"> (у торговца не хватит золота)</span>' : '';
            // Краденое нельзя сбыть никому, кроме скупщика.
            const stolenBlocked = item.stolen && !stolenSellAllowed(target);
            const stolenTag = item.stolen ? '<span style="color:#c0392b;"> 🏷️ краденое</span>' : '';
            if (stolenBlocked) {
                return `
            <div class="party-row">
                <div class="row-name">
                    <span>${escHtml(item.name)}${stolenTag} <span style="opacity:.6; font-size:13px;">(есть: ${item.count})</span></span>
                </div>
                <div style="font-size:12px; color:#e74c3c; margin-top:2px;">Краденое — этот торговец его не купит, нужен скупщик.</div>
            </div>`;
            }
            // Одна компактная строка: название · цена · количество · кнопка. Раньше название и цена
            // разъезжались по краям (row-name = space-between), а количество и кнопка шли отдельной
            // строкой на всю ширину. Колонки фиксированной ширины — число и кнопка стоят ровным столбцом.
            return `
            <div class="party-row" style="display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:4px 8px;">
                <span style="flex:0 1 250px; min-width:0;">${escHtml(item.name)}${stolenTag} <span style="opacity:.6; font-size:13px;">(есть: ${item.count})</span></span>
                <span style="flex:0 1 210px; min-width:0; font-size:14px;">${formatNumber(unitPrice)} септ./шт.${noteHtml}${poorNote}</span>
                <span style="display:flex; gap:6px; align-items:center; margin-left:0;">
                    <input type="number" id="sell-qty-${escHtml(item.itemId)}" value="1" min="1" max="${item.count}" style="width:56px; min-width:0; padding:3px 4px;">
                    <button class="btn-success" style="width:auto; padding:3px 14px; margin:0;" onclick="sellItem('${jsq(item.itemId)}')">Продать</button>
                </span>
            </div>`;
        }).join('');
    }
    window.renderSellList = renderSellList;

    // Задача A: успехи Красноречия начисляются за каждую сделку, дробный остаток копится между сделками.
    // База = целая часть от (сумма / 150), но сумма 30-149 даёт ровно 1 успех, макс. 5 за сделку.
    // Покупка — успехи ×0.5. Непрофильный торговец — тоже ×0.5. Складываются (покупка непрофильного = ×0.25).
    // Возвращает ДРОБНОЕ число успехов: раньше сделка дешевле 30 септимов не давала ничего, а покупка со множителем ×0.5
    // округлялась вниз до нуля — новые игроки с маленькими суммами почти не качали Красноречие. Теперь доля копится
    // (см. trackSpeechTrade): сумма меньше 30 даёт сумма/150 успеха, 30–149 — целый успех, дальше — по 1 за каждые 150.
    function calcSpeechSuccesses(amount, isPurchase, isOffProfile) {
        if (!amount || amount <= 0) return 0;
        let base = amount < 30 ? amount / 150 : (amount < 150 ? 1 : Math.floor(amount / 150));
        base = Math.min(5, base);
        let mult = 1;
        if (isPurchase) mult *= 0.5;
        if (isOffProfile) mult *= 0.5;
        return base * mult;
    }

    // Торговля даёт на 20% меньше успехов Красноречия, чем раньше (дробный остаток копится и сохраняется).
    const SPEECH_TRADE_XP_FACTOR = 0.8;
    function trackSpeechTrade(amount, isPurchase, isOffProfile) {
        const rawSuccesses = calcSpeechSuccesses(amount, !!isPurchase, !!isOffProfile);
        if (!rawSuccesses) return 0;
        const carry = (skillProgress._speechCarry || 0) + rawSuccesses * SPEECH_TRADE_XP_FACTOR;
        const successes = Math.floor(carry + 1e-9);
        skillProgress._speechCarry = Math.round((carry - successes) * 100) / 100;
        for (let i = 0; i < successes; i++) {
            if (typeof logSkillSuccessByName === 'function') logSkillSuccessByName('Красноречие');
        }
        return successes;
    }

    window.sellItem = function (itemId) {
        { const br = getSellBlockReason(); if (br) { alert(br.replace(/^\S+\s/, '')); return; } }
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        const qtyInput = document.getElementById('sell-qty-' + itemId);
        let qty = parseInt(qtyInput.value) || 1;
        if (habitFlag('sellFullStack', itemId)) qty = item.count; // привычка: игрок уже согласился продавать этот предмет всем стеком
        qty = Math.min(qty, item.count);
        if (qty <= 0) return;
        { const sh = trackHabit('sellItemId', itemId); if (sh === 10) { if (confirm('Продаёшь «' + item.name + '» часто. Продавать сразу весь стек?')) { habitSetFlag('sellFullStack', itemId); qty = item.count; } else habitDecline('sellItemId', itemId); } }

        const target = getSellTarget();
        const merchantType = target.profile;
        if (target.stock && (target.stock.disposition || 0) <= -2) { alert('Торговец отказывается вести дела.'); return; }
        // Задача C: краденое — только скупщику, и только состоя в Гильдии воров.
        if (item.stolen && !stolenSellAllowed(target)) {
            alert('Это краденое — его купит только скупщик Гильдии воров' + (isPerkChecked('Скупщик') ? ' или торговец, в чью лавку ты вложился («Вкладчик»).' : '.'));
            return;
        }
        if (merchantType === 'fence' && !normalizePlayerGuildEntry((playerGuildsData || {})['Гильдия воров']).member) {
            alert('Скупщик не станет иметь с тобой дел — ты не состоишь в Гильдии воров.');
            return;
        }
        const charmActive = document.getElementById('sell-charm-active').checked && !!(window.perkBonuses || {}).hasCharmPerk;
        const unitPrice = computeSellPrice(item, merchantType, charmActive, target.stock ? target.hold : undefined, target.stock ? target.stock.disposition : 0);
        const mg = marketSellTotal(item, qty, unitPrice);
        const total = mg.total;
        const isOffProfile = (merchantType !== 'pawnbroker' && merchantType !== 'fence') && !isSellProfileMatch(item, merchantType);

        let removedEarly = false;
        const finishSale = () => {
            consumeMarketBought(item, qty);
            if (!removedEarly) removeFromInventoryByName(itemId, qty);
            const goldInput = document.getElementById('char-gold');
            goldInput.value = (parseInt(goldInput.value) || 0) + total;
            const speechSuccesses = trackSpeechTrade(total, false, isOffProfile);
            renderSellList();
            renderInventoryList();
            updateAll();
            saveLocalStorage();
            alert(`Продано: ${item.name} ×${qty} → ${target.label} заплатил ${total} септимов.${target.stock ? ' Вещь теперь в его ассортименте — можно выкупить.' : ''}${speechSuccesses ? ' (+' + speechSuccesses + ' усп. Красноречия)' : ''}`);
        };
        if (!target.stock) { finishSale(); return; }
        // Живой торговец: платит из своего золота, вещь уходит в общий ассортимент.
        if (total > (target.stock.gold || 0)) {
            const canQty = unitPrice > 0 ? Math.floor((target.stock.gold || 0) / unitPrice) : 0;
            alert(`У торговца только ${target.stock.gold} золота — за ${qty} шт. он заплатить не может.` + (canQty > 0 ? ` Он потянет не больше ${canQty} шт.` : ' Эту вещь он сейчас не купит.'));
            return;
        }
        if (!window.CloudSync || typeof window.CloudSync.sellToMerchantStock !== 'function') { alert('Нет соединения с сессией.'); return; }
        const pi = Object.assign({}, item); delete pi.count;
        Object.keys(pi).forEach(k => { if (pi[k] === undefined) delete pi[k]; });
        const entry = { name: item.name, category: item.category || '', price: item.price, weight: item.weight || 0, effect: item.effect || '', playerItem: pi, sig: JSON.stringify(pi) };
        if (typeof item.weaponDmg === 'number') entry.dmg = item.weaponDmg;
        if (typeof item.armorValue === 'number') entry.armor = item.armorValue;
        if (item.slot) entry.slot = item.slot;
        if (typeof item.capacity === 'number') entry.capacity = item.capacity;
        // Вещь убираем у себя сразу (двойной клик раньше продавал одну вещь дважды — двойная оплата), при ошибке возвращаем.
        const cur = playerInventory.find(i => i.itemId === itemId);
        if (!cur || cur.count < qty) { alert('Столько у тебя уже нет.'); return; }
        const backup = JSON.parse(JSON.stringify(cur));
        removeFromInventoryByName(itemId, qty); removedEarly = true; renderSellList(); renderInventoryList();
        window.CloudSync.sellToMerchantStock(target.key, entry, qty, total).then(finishSale, e => {
            const ex = Object.assign({}, backup); ['itemId', 'name', 'count', 'weight', 'category', 'effect'].forEach(k => delete ex[k]);
            addToInventory(backup.itemId, backup.name, qty, backup.weight, backup.category, backup.effect, ex); saveLocalStorage();
            alert('Не удалось продать: ' + e.message);
        });
    };

    function isFoodItem(item) {
    if (!item) return false;
    const cat = (item.category || '').toLowerCase();
    const type = (item.type || '').toLowerCase();
    const name = (item.name || '').toLowerCase();

    // 1. Точный тип из items-data.js
    if (type === 'food' || type === 'drink') return true;
    // Броня и оружие — не еда, даже если в названии «сыр…» (сыромятная броня).
    if (item.slot) return false;

    // 2. Категория (все варианты, что встречаются в файлах данных)
    const catKeywords = [
        'еда', 'продукт', 'блюдо', 'напит', 'готов', 'сырое',
        'провал готовки', 'мясо', 'овощ', 'фрукт'
    ];
    for (const k of catKeywords) if (cat.includes(k)) return true;

    // 3. Fallback — по названию (на случай если категория/тип потерялись при передаче предмета мастером)
    const nameKeywords = [
        'яблоко', 'хлеб', 'мясо', 'рыба', 'суп', 'похлёбка',
        'пирог', 'печенье', 'мёд', 'вино', 'морковь', 'картоф',
        'капуст', 'помидор', 'тыкв', 'молок', 'батат',
        'рулет', 'орех', 'слойка', 'грудка', 'окорок', 'ножка',
        'лососин', 'оленин', 'конин', 'собачатин', 'кабанин', 'устриц',
        'порей', 'ягод', 'банан', 'виноград'
    ];
    // "мед" (без ё) убран — совпадал по подстроке с "медведь" (шкура пещерного МЕДведя ловилась
    // как еда). "лук" убран целиком — слово-омоним, совпадает и с луком-овощем, и с ЛЮБЫМ луком-
    // оружием ("Длинный лук", "Орочий лук" и т.д.) по той же подстроке.
    for (const k of nameKeywords) if (name.includes(k)) return true;
    if (/сыр(?!омят)/.test(name)) return true; // сыр, но не сыромятная кожа

    return false;
}
    function renderInventoryList() {
        const el = document.getElementById('player-inventory-list');
        if (!el) return;
        try { renderDisenchantSelect(); } catch (e) { console.warn('renderDisenchantSelect:', e); /* блок вкладки «Зачарование» — не критично */ }
        // Список «зелья для подсумка» строится из инвентаря: раньше он не перерисовывался при продаже/покупке/использовании
        // и показывал уже проданные зелья, пока не открыть подсумок заново.
        try { renderPouchPanel(); } catch (e) { /* не критично */ }
        // 2026-10-30: формулу цены («Красноречие × (1 + перки + раса) → база × k») игроку больше не показываем — лишний текст.
        const infoEl = document.getElementById('price-multiplier-info');
        if (infoEl) { infoEl.textContent = ''; infoEl.style.display = 'none'; }
        if (!playerInventory.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">Инвентарь пуст.</p>';
            return;
        }
        const tradeTargetEl = document.getElementById('trade-target-select');
        const hasTradeTarget = tradeTargetEl && tradeTargetEl.value;
        // Список всегда по алфавиту + фильтры по категории и названию (сам массив playerInventory не трогаем).
        const invCat = (document.getElementById('inv-category-filter') || {}).value || 'all';
        const invQ = String((document.getElementById('inv-search') || {}).value || '').trim().toLowerCase().replace(/ё/g, 'е');
        const shownInv = playerInventory
            .filter(it => (invCat === 'all' || classifyItemBroad(it) === invCat) &&
                (!invQ || String(it.name || '').toLowerCase().replace(/ё/g, 'е').indexOf(invQ) !== -1))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' }));
        const invCountEl = document.getElementById('inv-filter-count');
        if (invCountEl) invCountEl.textContent = (invCat !== 'all' || invQ) ? `Показано ${shownInv.length} из ${playerInventory.length}` : '';
        if (!shownInv.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">По этому фильтру ничего не найдено.</p>';
            return;
        }
        el.innerHTML = shownInv.map(item => {
            const priceInfo = item.price
                ? `<span style="color:var(--accent-color); font-size:13px;"> · ${formatNumber(getDisplayPrice(item.price))} септ.</span>`
                : '';
            return `
            <div class="stat-block" style="align-items:flex-start;">
                <span>
                    <strong>${escHtml(item.name)}</strong> × ${item.count}
                    ${item.weight ? `<span style="opacity:.6; font-size:13px;"> (вес ${item.weight} / шт.)</span>` : ''}
                    ${priceInfo}
                    ${item.effect ? `<br><span style="font-size:13px; color:#8a8171;">${escHtml(item.effect)}</span>` : ''}
                </span>
                               <span style="display:flex; gap:4px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;">
                    ${(potionKindOf(item) || ['Блюдо', 'Провал готовки'].includes(item.category)) ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px;" onclick="useInventoryItem('${jsq(item.itemId)}')">${potionKindOf(item) === 'poison' ? 'Выпить' : 'Исп.'}</button>` : ''}
                    ${ARTIFACT_USE[item.name] ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px; background:#6b4f1d;" onclick="useArtifactItem('${jsq(item.itemId)}')"${item.artifactUsed ? ' disabled title="Уже использована"' : ''}>${ARTIFACT_USE[item.name]}</button>` : ''}
                    ${potionKindOf(item) === 'poison' && item.alchemyEffects ? `<button class="btn-danger" style="width:auto; padding:2px 6px; font-size:13px; background:#5b2c6f;" onclick="applyPoisonToWeapon('${jsq(item.itemId)}')" title="Нанести на экипированное оружие — сработает на одном ударе">☠ На оружие</button>` : ''}
                    ${isFoodItem(item) ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px; background:#5c4a2c;" onclick="eatAnyFood('${jsq(item.itemId)}')">🍽 Поесть</button>` : ''}
                    ${(item.category || '').indexOf('Свит') === 0 ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px;" onclick="useScrollItem('${jsq(item.itemId)}')">Читать</button>` : ''}
                    ${(item.category === 'Книги заклинаний' || /^Том заклинания:/.test(item.name || '')) ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px; background:#3b2f5c;" onclick="learnSpellFromTome('${jsq(item.itemId)}')" title="Выучить заклинание — том расходуется">📖 Изучить</button>` : ''}
                    ${item.category === 'Книга умения' ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px;" onclick="readSkillBook('${jsq(item.itemId)}')" title="+1 к навыку «${escHtml(item.skill || '')}», расходует книгу">📖 Читать</button>` : ''}
                    ${item.maxUses ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px;" onclick="useLimitedItem('${jsq(item.itemId)}')" title="${escHtml(item.effect || '')}">✨ Использовать (${item.usesLeft != null ? item.usesLeft : item.maxUses}/${item.maxUses})</button>` : ''}
                    ${item.enchantment ? `<button class="btn-danger" style="width:auto; padding:2px 6px; font-size:13px;" onclick="disenchantItem('${jsq(item.itemId)}')" title="Разрушает вещь и узнаёт зачарование «${escHtml(item.enchantment.name)}» навсегда">💥 Разрушить</button>` : ''}
                    ${((typeof item.weaponDmg === 'number' || typeof item.armorValue === 'number') && item.upgradeMaterial && !isAmmoItem(item)) ? `<button class="btn-success" style="width:auto; padding:2px 6px; font-size:13px; background:#3a4a1c;" onclick="openTemperFor('${jsq(item.itemId)}')" title="Заточка в кузнице: ранг ${(item.temperTier || 0)}/6. Нужен материал ${escHtml(item.upgradeMaterial)}">⚒️ Заточить</button>` : ''}
                    <button style="width:auto; padding:2px 8px; font-size:13px; background:#3a5a3a;" onclick="tradeItemToPlayer('${jsq(item.itemId)}')" title="Передать другому игроку: добавить в предложение обмена (панель «Обмен с игроком» выше на этой же вкладке). Из стопки можно выбрать количество">→</button>
                    ${(window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession()) ? `<button style="width:auto; padding:2px 8px; font-size:13px; background:#4a3a1c;" onclick="partyStashPut('${jsq(item.itemId)}')" title="Положить в общий сундук отряда (из стопки можно выбрать количество)">→ 🎒</button>` : ''}
                    <button style="width:auto; padding:2px 8px; font-size:13px;" onclick="dropInventoryItem('${jsq(item.itemId)}')" title="Выбросить (из стопки можно выбрать количество)">🗑</button>
                </span>
            </div>
        `;
        }).join('');
    }

    // «Утончённый вкус»: первое полезное свойство алхимического ингредиента.
    function kitchenAlchemyFirstUseful(name) {
        const ing = (window.alchemyIngredients || {})[name];
        if (!ing || !Array.isArray(ing.effects)) return '';
        return ing.effects.find(e => {
            const b = (window.alchemyBaseEffects || {})[e];
            return b ? b.polarity === 'positive' : /^(Повышение|Сопротивление|Восстановление|Регенерация|Укрепление|Невидимость|Хамелеон)/.test(e);
        }) || '';
    }
    function renderKitchenAlchemySelect() {
        const sel = document.getElementById('kitchen-alchemy-ing');
        if (!sel) return;
        const prev = sel.value;
        const ings = invStacksByBase(n => (window.alchemyIngredients || {}).hasOwnProperty(n) && !!kitchenAlchemyFirstUseful(n));
        sel.innerHTML = '<option value="">— без добавки —</option>' + ings.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (×${i.count}) — ${escHtml(kitchenAlchemyFirstUseful(i.itemId))}</option>`).join('');
        if (ings.some(i => i.itemId === prev)) sel.value = prev;
    }
    function renderKitchenPot() {
        try { renderKitchenAlchemySelect(); } catch (e) { }
        const el = document.getElementById('kitchen-pot-list');
        if (!el) return;
        const cookable = invStacksByBase(n => !!(window.cookingIngredients && window.cookingIngredients.hasOwnProperty(n)));
        // Выбор в котле не должен переживать стопку: съели/продали/сварили — лишнее убираем (раньше варилось из того, чего уже нет).
        Object.keys(potSelections).forEach(k => {
            const st = cookable.find(c => c.itemId === k);
            if (!st || st.count <= 0) delete potSelections[k];
            else if (potSelections[k] > st.count) potSelections[k] = st.count;
        });
        if (!cookable.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">В инвентаре пока нет продуктов для готовки.</p>';
            return;
        }
        const capU = (window.COOK_IMPROV && window.COOK_IMPROV.maxUnits) || 9;
        const used = Object.keys(potSelections).reduce((a, k) => a + (potSelections[k] || 0), 0);
        el.innerHTML = `<div style="opacity:.75; font-size:13px; margin-bottom:4px;">В котле: ${used} / ${capU}</div>` + cookable.map(item => {
            const sel = potSelections[item.itemId] || 0;
            return `
            <div class="stat-block">
                <span>${escHtml(item.name)} <span style="opacity:.6; font-size:13px;">(есть: ${item.count})</span></span>
                <input type="number" min="0" max="${item.count}" value="${sel}" style="width:65px;"
                    onchange="setPotQty('${jsq(item.itemId)}', this.value, ${item.count})">
            </div>`;
        }).join('');
    }

    function setPotQty(itemId, value, maxCount) {
        let qty = parseInt(value) || 0;
        if (qty < 0) qty = 0;
        if (qty > maxCount) qty = maxCount;
        // Потолок котла — не больше N единиц продуктов суммарно (COOK_IMPROV.maxUnits).
        const capU = (window.COOK_IMPROV && window.COOK_IMPROV.maxUnits) || 9;
        let others = 0; Object.keys(potSelections).forEach(k => { if (k !== itemId) others += potSelections[k] || 0; });
        if (qty > capU - others) qty = Math.max(0, capU - others);
        if (qty === 0) delete potSelections[itemId];
        else potSelections[itemId] = qty;
        renderKitchenPot();
    }

    // Масштабирует текст вида "+20 хп на 45 ходов" по бонусам силы/длительности от перков Кулинарии
    function scaleEffectText(text, powerBonus, durBonus) {
        let result = text;
        if (powerBonus > 0) {
            // Сила — первое число текста, если это не длительность («+20 хп на 45 ходов», «Запас магии увеличен на 25 на 75 ходов»).
            result = result.replace(/([+\-]?)(\d+)(?!\d|\s*ход)/, (m, sign, num) => sign + Math.round(parseInt(num) * (1 + powerBonus)));
        }
        if (durBonus > 0) {
            result = result.replace(/(\d+)(\s*ход)/, (m, num, suffix) => Math.round(parseInt(num) * (1 + durBonus)) + suffix);
        }
        return result;
    }

    function cookFood() {
        const potMap = {};
        Object.keys(potSelections).forEach(id => {
            if (potSelections[id] > 0) potMap[id] = potSelections[id];
        });
        renderKitchenPot(); // сверяем выбор с остатками в рюкзаке
        Object.keys(potMap).forEach(id => { if (!potSelections[id]) delete potMap[id]; else potMap[id] = potSelections[id]; });
        const potNames = Object.keys(potMap);
        const resultEl = document.getElementById('kitchen-result');
        if (potNames.length === 0) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Сначала выбери продукты и их количество слева.</span>';
            return;
        }
        // Минимум 2 РАЗНЫЕ позиции для готовки — по прямой просьбе, раньше можно было
        // "приготовить" из одного-единственного ингредиента.
        if (potNames.length < 2) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Нужно минимум 2 разных продукта — для настоящего блюда одного ингредиента мало.</span>';
            return;
        }

        const capU = (window.COOK_IMPROV && window.COOK_IMPROV.maxUnits) || 9;
        if (potNames.reduce((a, n) => a + potMap[n], 0) > capU) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">В котёл помещается не больше ${capU} единиц продуктов.</span>`;
            return;
        }
        const perks = window.perkBonuses || {};
        const canSubstitute = !!perks.cookingIngredientSubstitution;

        let matchedRecipe = null;
        let usedSubstitution = false;

        for (const recipe of (window.recipes || [])) {
            const reqNames = recipe.ingredients.map(i => i.name);
            const extra = potNames.filter(n => !reqNames.includes(n));
            const mismatches = recipe.ingredients.filter(req => potMap[req.name] !== req.qty);

            if (extra.length === 0 && mismatches.length === 0) {
                matchedRecipe = recipe;
                usedSubstitution = false;
                break;
            }
            // «Сочетание вкуса»: не хватает одного ингредиента рецепта — его место занимает другой продукт
            // в том же количестве (остальное строго по рецепту).
            if (canSubstitute && extra.length === 1 && mismatches.length === 1 && potMap[mismatches[0].name] === undefined && potMap[extra[0]] === mismatches[0].qty) {
                matchedRecipe = recipe;
                usedSubstitution = true;
                break;
            }
        }

        // Ингредиенты списываются в любом случае — их уже "смешали".
        // «Колпак повара»: 2 блюда по рецепту в день — без траты ингредиентов.
        const hatFree = !!matchedRecipe && wearsItemNamed('Колпак повара') && (powersUsedToday.cook_hat_free || 0) < 2;
        if (hatFree) powersUsedToday.cook_hat_free = (powersUsedToday.cook_hat_free || 0) + 1;
        else potNames.forEach(name => removeFromInventoryByName(name, potMap[name]));

        const powerBonus = perks.cookingDishPowerPercent || 0;
        const durBonus = perks.cookingDurationBonus || 0;
        let alchemyNote = '', bonusAlchemy = null;
        if (perks.cookingAddAlchemyIngredient) {
            const ingSel = document.getElementById('kitchen-alchemy-ing');
            const ing = ingSel ? ingSel.value : '';
            if (ing && countInInventory(ing) > 0) {
                removeFromInventoryByName(ing, 1);
                // «Утончённый вкус»: свойство ингредиента — настоящий эффект блюда (сила и длительность — базовые, как у слабого зелья).
                const propA = kitchenAlchemyFirstUseful(ing);
                const bA = (window.alchemyBaseEffects || {})[propA];
                if (bA) bonusAlchemy = [{ name: propA, magnitude: typeof bA.base === 'number' ? bA.base : null, duration: bA.dur || null, unit: bA.unit || '', kind: bA.kind }];
                alchemyNote = ` + ${ing} (${propA}${bonusAlchemy && bonusAlchemy[0].magnitude ? ' ' + bonusAlchemy[0].magnitude + (bonusAlchemy[0].unit ? ' ' + bonusAlchemy[0].unit : '') : ''}${bonusAlchemy && bonusAlchemy[0].duration ? ' на ' + bonusAlchemy[0].duration + ' кр.' : ''})`;
                ingSel.value = '';
            }
        }

        // Нет рецепта → блюдо считается по цене/типу ингредиентов (cooking-data.js: improvisedDish), перки усиливают его так же.
        let dish = matchedRecipe || window.failedDish, improvEffects = null, improvInfo = null;
        if (!matchedRecipe && typeof window.improvisedDish === 'function') {
            const im = window.improvisedDish(potMap);
            const hpV = Math.round(im.hp * (1 + powerBonus)), mpV = Math.round(im.mp * (1 + powerBonus));
            const dur = Math.max(1, Math.round(window.COOK_IMPROV.duration * (1 + durBonus)));
            improvEffects = [];
            const cookSkill = (typeof getEffectiveSkillValue === 'function') ? getEffectiveSkillValue('Кулинария') : 100;
            if (cookSkill < window.COOK_IMPROV.minSkill) { improvInfo = { tooLow: true }; dish = { name: 'Невнятное варево', weight: 0.5, price: 1, effect: '' }; improvEffects = null; } else {
            if (hpV > 0) improvEffects.push({ name: 'Запас здоровья', magnitude: hpV, duration: dur, unit: '', kind: 'max_hp' });
            if (mpV > 0) improvEffects.push({ name: 'Запас магии', magnitude: mpV, duration: dur, unit: '', kind: 'max_mp' });
            if (improvEffects.length) {
                const parts = [];
                if (hpV > 0) parts.push('+' + hpV + ' хп');
                if (mpV > 0) parts.push('+' + mpV + ' мп');
                let txt = parts.join(', ');
                if (txt) txt += ' на ' + dur + ' ходов';
                dish = { name: 'Импровизированное блюдо', weight: 0.5, price: im.price, effect: txt };
                improvInfo = im;
            } else { improvEffects = null; }
            }
        }
        // Блюда по рецепту сильнее на COOK_IMPROV.dishBoost (+20%, 2026-10-30), множится с перками Кулинарии; похлёбка (провал) и импровизация не усиливаются здесь.
        const recipeBoost = matchedRecipe ? ((window.COOK_IMPROV && window.COOK_IMPROV.dishBoost) || 0) : 0;
        const effPower = (1 + powerBonus) * (1 + recipeBoost) - 1;
        const finalEffect = (improvEffects ? dish.effect : scaleEffectText(dish.effect, effPower, durBonus)) + alchemyNote;
        // Цена блюда растёт вместе с его силой: перки Кулинарии усиливают эффект (×(1+сила)) и длительность (×(1+длит.)) — цена масштабируется так же.
        const strengthMult = (1 + powerBonus) * (1 + durBonus);
        const dishPrice = Math.max(dish.price || 0, Math.round((dish.price || 0) * strengthMult));
        // Блюда разной силы — отдельные стопки (раньше новое блюдо затирало эффект и цену ВСЕЙ стопки такого же названия).
        const effHash = s => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0; return Math.abs(h).toString(36); };
        const dishId = (finalEffect === dish.effect && !improvEffects) ? dish.name : dish.name + '#' + effHash(finalEffect + (improvEffects ? JSON.stringify(improvEffects) : ''));
        const dishExtra = improvEffects ? { price: dishPrice, alchemyEffects: improvEffects, craftCost: craftCostOf(potNames.map(n => ({ name: n, qty: potMap[n] })), 1), craftKind: 'cook' } : { price: dishPrice, craftCost: craftCostOf(potNames.map(n => ({ name: n, qty: potMap[n] })), 1), craftKind: 'cook' };
        if (bonusAlchemy) dishExtra.bonusAlchemy = bonusAlchemy;
        addToInventory(dishId, dish.name, 1, dish.weight || 1, (matchedRecipe || improvEffects) ? 'Блюдо' : 'Провал готовки', finalEffect, dishExtra);
        // Удачное блюдо — полный успех кулинарии; провал (похлёбка) тоже чему-то учит, но слабее: половина успеха (COOKING_FAIL_PROGRESS).
        if (typeof logSkillSuccessByName === 'function') logSkillSuccessByName('Кулинария', matchedRecipe ? 1 : COOKING_FAIL_PROGRESS);
        if (matchedRecipe) {
            // Запоминаем именно то сочетание, что сработало (с учётом замены ингредиента перком).
            knownCookRecipes[matchedRecipe.name] = { ingredients: potNames.map(n => ({ name: n, qty: potMap[n] })), effect: dish.effect };
            renderKnownRecipes();
        }

        let extraNote = hatFree ? `<div style="color:#2ecc71;">👨‍🍳 «Колпак повара»: ингредиенты не потрачены (бесплатных блюд сегодня осталось ${2 - powersUsedToday.cook_hat_free}).</div>` : '';
        // Полевой опыт: шанс получить ещё одно такое же блюдо
        if (matchedRecipe && perks.cookingExtraDishChance && Math.random() < perks.cookingExtraDishChance) {
            addToInventory(dishId, dish.name, 1, dish.weight || 1, 'Блюдо', finalEffect, dishExtra);
            extraNote += '<div style="color:#2ecc71;">🍀 «Полевой опыт» сработал — получилось на 1 блюдо больше!</div>';
        }

        if (matchedRecipe) {
            resultEl.innerHTML = `<div style="color:#2ecc71; font-weight:bold;">✅ Получилось: ${escHtml(matchedRecipe.name)}${usedSubstitution ? ' <span style="font-weight:normal;">(с заменой ингредиента — «Сочетание вкуса»)</span>' : ''}</div>` +
                `<div style="opacity:.85;">${escHtml(finalEffect)}</div>` + extraNote;
        } else {
            resultEl.innerHTML = `<div style="color:#e67e22; font-weight:bold;">Рецепт не совпал — вышло: ${escHtml(dish.name)}</div>${improvInfo && improvInfo.tooLow ? `<div style="font-size:13px;">Навык Кулинарии ниже ${window.COOK_IMPROV.minSkill} — блюдо без рецепта пока получается пустым (без эффекта).</div>` : ''}<div style="font-size:13px; opacity:.75;">Провал тоже чему-то учит: +½ успеха к Кулинарии (удачное блюдо даёт целый).</div>` +
                `<div style="opacity:.85;">${escHtml(finalEffect)}</div>`;
        }

        // Раньше котёл очищался целиком — чтобы приготовить ещё порцию, приходилось заново выбирать все продукты, даже если их хватало.
        // Теперь выбор остаётся, пока количества в инвентаре хватает на ту же порцию; продукты, которых не хватает, из выбора убираются.
        const keepSel = {};
        potNames.forEach(n => { if (countInInventory(n) >= potMap[n]) keepSel[n] = potMap[n]; });
        potSelections = keepSel;
        renderKitchenPot();
        saveLocalStorage();
    }

    // ========================================================================
    // КУЗНИЦА
    // ========================================================================

    function getAllSmithingRecipes() {
        return [...(window.armorRecipes || []), ...(window.jewelryRecipes || []), ...(window.weaponRecipes || []), ...(window.sheathRecipes || [])];
    }
    // Ножны и колчаны (alwaysKnown) открывать мастеру не нужно — простая работа по коже.
    function isSmithingRecipeKnown(r) { return !!r.alwaysKnown || knownSmithingRecipes.includes(r.name); }

    // Стопки «имя» и «имя#stolen» одной строкой (под чистым именем): для списков алхимии, котла и кулинарии —
    // тратится всё равно через removeFromInventoryByName (сначала чистое, потом краденое).
    function invStacksByBase(pred) {
        const out = [], byId = {};
        playerInventory.forEach(i => {
            const base = String(i.itemId || '').replace(/#stolen$/, '');
            if (!(i.count > 0) || !pred(base)) return;
            if (!byId[base]) { byId[base] = { itemId: base, name: i.name, count: 0, stolenCount: 0 }; out.push(byId[base]); }
            byId[base].count += i.count;
            if (base !== i.itemId) byId[base].stolenCount += i.count;
        });
        return out;
    }
    function countInInventory(name) {
        return playerInventory.filter(i => i.itemId === name || i.itemId === name + '#stolen').reduce((n, i) => n + (i.count || 0), 0);
    }

    // Тип рецепта для фильтра: ближний/дальний бой, боеприпасы, лёгкая/тяжёлая броня, щиты, украшения.
    function smithingTypeOf(r) {
        if (r.slot === 'jewelry') return 'jewelry';
        if (r.hasOwnProperty('damage')) {
            if (r.isAmmo) return 'ammo';
            return r.slot === 'ranged' ? 'ranged' : 'melee';
        }
        if (r.slot === 'Щиты') return 'shield';
        return r.armorType === 'Легкая броня' ? 'light' : 'heavy';
    }

    // Основной материал рецепта — первый ингредиент, не являющийся "расходной мелочью" (кожа,
    // ремешки, дерево). Для железного меча это «Железный слиток», для хитиновой брони — «Хитиновая
    // пластина». Нужен для быстрого фильтра по материалу.
    const SMITHING_HELPER_INGREDIENTS = ['Кожа', 'Полоски кожи', 'Полено'];
    function smithingMaterialOf(r) {
        const list = r.ingredients || [];
        const ing = list.find(g => SMITHING_HELPER_INGREDIENTS.indexOf(g.name) === -1) || list[0]; // кожаная броня — только кожа/ремешки: материал "Кожа"
        return ing ? ing.name : 'Материалы не указаны';
    }

    // Единое правило "можно сковать сейчас" — им пользуются и кнопка "Сковать", и фильтр.
    function canCraftSmithingRecipe(r) {
        const hasMatPerk = !r.perkHint || isPerkChecked(r.perkHint);
        // У части рецептов в данных пустой список ингредиентов (12 кастетов) — every() по пустому
        // списку даёт true, и вещь ковалась бы бесплатно. Такой рецепт считаем недоступным.
        if (!r.ingredients || !r.ingredients.length) return false;
        return hasMatPerk && r.ingredients.every(i => countInInventory(i.name) >= i.qty);
    }

    // Пересобирает выпадающий список, сохраняя выбранное значение, если оно ещё есть среди опций.
    // (Раньше список подкатегорий строился ОДИН раз и не обновлялся, когда мастер открывал новые рецепты.)
    function refillSelect(sel, firstLabel, values) {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="all">${firstLabel}</option>` + values.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
        sel.value = (prev !== 'all' && values.indexOf(prev) !== -1) ? prev : 'all';
    }

    function renderSmithingList() {
        const el = document.getElementById('smithing-list');
        if (!el) return;
        if (typeof renderSmeltingList === 'function') renderSmeltingList();
        const known = getAllSmithingRecipes().filter(isSmithingRecipeKnown);
        if (!known.length) {
            el.innerHTML = '<p style="opacity:.7; font-size:15px;">Мастер пока не открыл тебе ни одного рецепта.</p>';
            return;
        }
        refillSelect(document.getElementById('smithing-subcat-filter'), 'Все подкатегории', [...new Set(known.map(r => r.subcat).filter(Boolean))].sort());
        refillSelect(document.getElementById('smithing-material-filter'), 'Любой материал', [...new Set(known.map(smithingMaterialOf))].sort());

        const q = ((document.getElementById('smithing-search') || {}).value || '').trim().toLowerCase();
        const typeF = (document.getElementById('smithing-type-filter') || {}).value || 'all';
        const matF = (document.getElementById('smithing-material-filter') || {}).value || 'all';
        const subF = (document.getElementById('smithing-subcat-filter') || {}).value || 'all';
        const onlyCraftable = !!(document.getElementById('smithing-craftable-only') || {}).checked;

        const canMap = new Map(known.map(r => [r, canCraftSmithingRecipe(r)]));
        const filtered = known.filter(r => {
            if (typeF !== 'all' && smithingTypeOf(r) !== typeF) return false;
            if (matF !== 'all' && smithingMaterialOf(r) !== matF) return false;
            if (subF !== 'all' && r.subcat !== subF) return false;
            if (onlyCraftable && !canMap.get(r)) return false;
            if (q) {
                // поиск по названию, подкатегории и ЛЮБОМУ ингредиенту (т.е. и по материалу)
                const hay = (r.name + ' ' + (r.subcat || '') + ' ' + r.ingredients.map(g => g.name).join(' ')).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
        const countEl = document.getElementById('smithing-count');
        if (countEl) countEl.textContent = `Показано рецептов: ${filtered.length} из ${known.length}`;
        if (!filtered.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">Ничего не найдено — измени поиск или фильтры.</p>';
            el.dataset.knownList = JSON.stringify(known.map(r => r.name));
            return;
        }
        el.innerHTML = filtered.map((r) => {
            const idx = known.indexOf(r); // индекс относительно ПОЛНОГО known-списка — так craftSmithingItem(idx) находит рецепт верно и при активных фильтрах
            const hasMatPerk = !r.perkHint || isPerkChecked(r.perkHint);
            const canMake = canMap.get(r);
            const ingList = r.ingredients.map(i => {
                const have = countInInventory(i.name);
                const ok = have >= i.qty;
                return `<span style="color:${ok ? '#2ecc71' : '#e74c3c'};">${escHtml(i.name)} ${have}/${i.qty}</span>`;
            }).join(', ');
            let statLine;
            if (r.hasOwnProperty('damage')) {
                statLine = `Урон: ${r.damage} · Вес: ${r.weight} · Цена: ${formatNumber(r.price)}` + (r.yieldCount > 1 ? ` · Выход: ${r.yieldCount} шт.` : '');
            } else if (r.slot === 'jewelry') {
                statLine = r.yieldCount ? `Выход: ${r.yieldCount} шт.` : 'Ювелирное изделие';
            } else {
                statLine = `Сопротивление: ${r.resistance} · Вес: ${r.weight} · Цена: ${formatNumber(r.price)}`;
            }
            const perkNote = !hasMatPerk ? `<div style="font-size:13px; color:#e67e22;">🔒 Нужен перк «${escHtml(r.perkHint)}»</div>` : (!r.ingredients.length ? '<div style="font-size:13px; color:#e67e22;">⚠ Материалы этого рецепта не указаны в данных — ковка недоступна</div>' : '');
            return `<div class="party-row">
                <div class="row-name"><strong>${escHtml(r.name)}</strong><span style="font-size:13px; opacity:.7;">${r.subcat ? escHtml(r.subcat) + ' · ' : ''}${escHtml(statLine)}</span></div>
                <div style="font-size:14px; margin:4px 0;">${ingList}</div>
                ${perkNote}
                <button class="btn-success" style="width:100%;" ${canMake ? '' : 'disabled'} onclick="craftSmithingItem(${idx})">Сковать</button>
            </div>`;
        }).join('');
        el.dataset.knownList = JSON.stringify(known.map(r => r.name));
    }

    // ---- Плавильня и дубильная рама (smeltingRecipes в smithing-data.js) ----
    function renderSmeltingList() {
        const el = document.getElementById('smelting-list');
        if (!el) return;
        const rec = window.smeltingRecipes || [];
        const groups = [['smelter', '🔥 Плавильня'], ['tanning', '🦌 Дубильная рама']];
        el.innerHTML = groups.map(([place, title]) => {
            // показываем только те рецепты, для которых в инвентаре есть хотя бы один компонент; остальные — свёрнуты в счётчик
            const rows = rec.map((r, idx) => ({ r, idx })).filter(o => o.r.place === place);
            const avail = rows.filter(o => o.r.ingredients.some(g => countInInventory(g.name) > 0));
            const body = avail.length ? avail.map(({ r, idx }) => {
                const can = r.ingredients.every(g => countInInventory(g.name) >= g.qty);
                const ing = r.ingredients.map(g => {
                    const have = countInInventory(g.name);
                    return `<span style="color:${have >= g.qty ? '#2ecc71' : '#e74c3c'};">${escHtml(g.name)} ${have}/${g.qty}</span>`;
                }).join(' + ');
                return `<div class="party-row" style="padding:4px 0;"><div class="row-name"><span>${ing} → <strong>${escHtml(r.name)}</strong>${r.yieldCount > 1 ? ' ×' + r.yieldCount : ''}</span></div>
                    <button class="btn-success" style="width:100%; padding:4px;" ${can ? '' : 'disabled'} onclick="smeltItem(${idx})">${place === 'smelter' ? 'Переплавить' : 'Выделать'}</button></div>`;
            }).join('') : '<p style="font-size:13px; opacity:.6; margin:2px 0;">В инвентаре нет подходящего сырья.</p>';
            return `<h4 style="margin:8px 0 2px;">${title}</h4>${body}`;
        }).join('');
    }
    window.renderSmeltingList = renderSmeltingList;

    window.smeltItem = function(idx) {
        const r = (window.smeltingRecipes || [])[idx];
        if (!r) return;
        if (!r.ingredients.every(g => countInInventory(g.name) >= g.qty)) { alert('Не хватает сырья.'); return; }
        const proto = (window.allItems || []).find(p => p.name === r.name) || {};
        r.ingredients.forEach(g => removeFromInventoryByName(g.name, g.qty));
        addToInventory(r.name, r.name, r.yieldCount || 1, proto.weight || 1, proto.category || 'Кузнечные ингредиенты', proto.effect || '', proto.price !== undefined ? { price: proto.price } : undefined);
        renderSmeltingList();
        renderSmithingList();
        saveLocalStorage();
    };

    const SMITHING_SLOT_MAP = {
        'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves',
        'Сапоги и ботинки': 'boots', 'Щиты': 'shield'
    };

    window.craftSmithingItem = function(idx) {
        const known = getAllSmithingRecipes().filter(isSmithingRecipeKnown);
        const recipe = known[idx];
        if (!recipe) return;
        if (recipe.perkHint && !isPerkChecked(recipe.perkHint)) {
            alert(`Нужен перк «${recipe.perkHint}», чтобы ковать этот материал.`);
            return;
        }
        if (!recipe.ingredients || !recipe.ingredients.length) { alert('У этого рецепта не указаны материалы — ковка недоступна, пока данные не дозаполнены.'); return; }
        const canMake = recipe.ingredients.every(i => countInInventory(i.name) >= i.qty);
        if (!canMake) { alert('Не хватает материалов.'); return; }
        recipe.ingredients.forEach(i => removeFromInventoryByName(i.name, i.qty));
        const yieldCount = recipe.yieldCount || 1;

        // Зенитар — "эффективность кузни" %, увеличивает итоговое значение скованной вещи
        // (было только текстом в описании бога).
        const smithBonus = gb('smithing');
        let dmgVal = recipe.damage, resVal = recipe.resistance;
        if (smithBonus) {
            if (typeof dmgVal === 'number') dmgVal = Math.round(dmgVal * (1 + smithBonus / 100));
            if (typeof resVal === 'number') resVal = Math.round(resVal * (1 + smithBonus / 100));
        }

        let desc, extra;
        // Конкретный тип оружия по подкатегории рецепта (subcat уже был в данных, просто нигде
        // не читался при ковке) — та же схема weaponType, что у ручного создания предмета
        // мастером, чтобы "выковал кинжал" не превращалось в безликое "оружие ближнего боя".
        // Секиры (subcat "Секиры") в smithing-data.js — ДВУРУЧНОЕ (category:"Двуручное"), а
        // боевые топоры (subcat "Боевые топоры") — ОДНОРУЧНОЕ (category:"Одноручное"). Раньше
        // тут было перепутано местами — при ковке секиры игрок получал одноручное оружие с
        // неверным расчётом бонуса Силы и штрафа к броску.
        // Таблица «подкатегория рецепта → тип оружия» живёт в smithing-data.js (SMITH_SUBCAT_TO_WEAPON_TYPE),
        // чтобы test.html мог проверять её на тех же данных: перепутанные секиры/боевые топоры ловятся тестом.
        const SUBCAT_TO_WEAPON_TYPE = window.SMITH_SUBCAT_TO_WEAPON_TYPE || {};
        if (recipe.hasOwnProperty('damage')) {
            // Оружие или боеприпасы
            desc = recipe.isAmmo ? `Урон ${dmgVal} (боеприпас)` : `Урон ${dmgVal}${smithBonus ? ` (+${smithBonus}% от бога)` : ''}`;
            const wepType = SUBCAT_TO_WEAPON_TYPE[recipe.subcat] || 'onehand';
            // Слот раньше был жёстко "melee" даже для луков (subcat "Луки (обычные/особые)") —
            // экип-слот для лука должен быть "ranged", иначе он попадал бы не в тот выпадающий
            // список при экипировке.
            extra = recipe.isAmmo ? { category: 'Боеприпасы', price: recipe.price, weaponDmg: typeof dmgVal === 'number' ? dmgVal : undefined } : { slot: wepType.startsWith('ranged') ? 'ranged' : 'melee', weaponDmg: dmgVal, weaponType: wepType, price: recipe.price };
            // У оружейных рецептов поля upgradeMaterial в данных нет вообще (только у брони) — из-за
            // этого кнопки "Улучшить"/"Наточить" у выкованного оружия не появлялись. Берём материал
            // из самого рецепта: первый слиток (или Сталгрим) среди ингредиентов — как в ваниле точило
            // использует слиток материала оружия. Явное recipe.upgradeMaterial имеет приоритет.
            if (!recipe.isAmmo) {
                const ingotIng = (recipe.ingredients || []).find(g => /слиток/i.test(g.name) || g.name === 'Сталгрим');
                const mat = recipe.upgradeMaterial || (ingotIng && ingotIng.name);
                if (mat) { extra.upgradeMaterial = mat; extra.upgradeQty = recipe.upgradeQty || 1; }
            }
        } else if (recipe.sheathKind) {
            const dbS = (window.allItems || []).find(i => i.name === recipe.name) || {};
            desc = dbS.effect || 'Ножны';
            extra = { slot: 'sheath', sheathKind: recipe.sheathKind, price: recipe.price, category: 'Ножны и колчаны' };
            if (recipe.sheathArmor) extra.sheathArmor = recipe.sheathArmor;
        } else if (recipe.slot === 'jewelry') {
            // Цена, вес и категория — из базы предметов (в рецептах их нет): иначе кольцо стоило 0 и
            // при слиянии с купленным обнуляло цену всей стопки.
            const dbJ = (window.allItems || []).find(i => i.name === recipe.name) || {};
            desc = dbJ.effect || 'Ювелирное изделие';
            extra = { slot: dbJ.slot || (recipe.name.includes('кольцо') ? 'ring' : 'amulet'), price: dbJ.price || recipe.price || 0, category: dbJ.category || 'Ювелирные изделия' };
            if (dbJ.weight) extra.weight = dbJ.weight;
        } else {
            // armorType (Лёгкая/Тяжёлая) и upgradeMaterial — оба поля УЖЕ были в armorRecipes,
            // просто нигде не читались при ковке. armorType нужен игроку, чтобы знать, какой
            // переключатель "во что одет" (#eq-armor) себе выставить — сама система не может
            // сделать это автоматически (тот переключатель общий на весь комплект, не по вещи).
            const upgradeNote = recipe.upgradeMaterial ? ` · Улучшается «${recipe.upgradeMaterial}»` : '';
            desc = `Сопротивление ${resVal}${smithBonus ? ` (+${smithBonus}% от бога)` : ''} · ${recipe.armorType || '?'}${upgradeNote}`;
            extra = { slot: SMITHING_SLOT_MAP[recipe.slot] || null, armorValue: resVal, price: recipe.price, armorType: recipe.armorType, upgradeMaterial: recipe.upgradeMaterial };
            if (recipe.upgradeQty) extra.upgradeQty = recipe.upgradeQty;
        }
        { const cc = craftCostOf(recipe.ingredients, yieldCount); if (cc > 0) { extra.craftCost = cc; extra.craftKind = 'smith'; } }
        // Вещь с бонусом Зенитара (урон/броня выше) — своя стопка, иначе она перезаписывает урон/броню купленных того же названия.
        const smithItemId = (smithBonus && !recipe.isAmmo && (typeof dmgVal === 'number' || typeof resVal === 'number')) ? `${recipe.name}#zen${smithBonus}` : recipe.name;
        const smithWeight = extra.weight || recipe.weight || 0.25;
        delete extra.weight;
        addToInventory(smithItemId, recipe.name, yieldCount, smithWeight, extra.category || 'Скованное', desc, extra);
        if (typeof logSkillSuccessByName === 'function') logSkillSuccessByName('Кузнечное дело');
        renderSmithingList();
        saveLocalStorage();
    };
