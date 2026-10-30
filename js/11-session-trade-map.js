
    // ========================================================================
    // КАРМАННЫЕ КРАЖИ (согласовано с пользователем 2026-10-24)
    // ========================================================================
    // Сложность — по ступени того, что крадём (как замки «Взлома»); навык ниже порога ступени даёт штраф.
    // Пороги совпадают с порогами перков ветки. Провал на 1–4 — жертва настороже до конца игрового дня;
    // провал на 5+ или натуральная 1 — пойман: штраф 25 + ½ цены (стража/знать ×2) уходит мастеру заявкой.
    const THEFT_TIERS = {
        trinket:  { name: 'Мелочь', dc: 9, threshold: 0, penalty: -2, minPrice: 0, maxPrice: 10 },
        purse:    { name: 'Кошелёк', dc: 12, threshold: 20, penalty: -3 },
        valuable: { name: 'Ценная вещь', dc: 15, threshold: 40, penalty: -4, minPrice: 11, maxPrice: 100 },
        precious: { name: 'Дорогая вещь', dc: 17, threshold: 60, penalty: -5, minPrice: 101, maxPrice: Infinity },
        key:      { name: 'Ключ', dc: 15, threshold: 40, penalty: -4 },
        weapon:   { name: 'Надетое оружие', dc: 19, threshold: 70, penalty: 0, perk: 'pickpocketWeapon' },
        plant:    { name: 'Подкинуть вещь', dc: 12, threshold: 0, penalty: -2 },
        poison:   { name: 'Подкинуть яд', dc: 12, threshold: 0, penalty: -2, perk: 'poisonPlant' }
    };
    const THEFT_WEAPON_STEALTH_DC = 15; // «Дезориентация»: сначала отдельная проверка Скрытности (только вне боя)
    const THEFT_FINE_BASE = 25;
    // Карманы по типу жертвы: кошелёк (NкM+K), категории вещей из базы предметов, модификатор внимательности.
    const THEFT_VICTIMS = {
        beggar:   { name: 'Нищий', purse: [1, 6, -1], mod: 0, maxPrice: 10, cats: ['food', 'ingredients'] },
        peasant:  { name: 'Крестьянин, работник', purse: [1, 10, 0], mod: 0, maxPrice: 100, cats: ['food', 'ingredients', 'household'] },
        citizen:  { name: 'Горожанин', purse: [2, 10, 0], mod: 0, maxPrice: 300, cats: ['food', 'household', 'potions', 'jewelry'] },
        merchant: { name: 'Торговец, трактирщик', purse: [3, 10, 10], mod: -1, cats: ['food', 'household', 'potions', 'gems', 'jewelry'] },
        mage:     { name: 'Маг', purse: [2, 10, 0], mod: -1, cats: ['scrolls', 'potions', 'soulgems', 'ingredients'] },
        guard:    { name: 'Стражник', purse: [2, 10, 0], mod: -2, cats: ['food', 'lockpick'], fineMult: 2 },
        noble:    { name: 'Знать, управитель, ярл', purse: [5, 10, 20], mod: -2, cats: ['jewelry', 'gems', 'household', 'potions'], fineMult: 2 }
    };
    const THEFT_POOL_RE = {
        food: /^(Готовые продукты|Сырые продукты|Напитки)$/, ingredients: /^Ингредиенты для алхимии$/, household: /^Бытовые предметы$/,
        potions: /^(Зелья|Яды)$/, jewelry: /^Ювелирные изделия$/, gems: /^Драгоценные камни$/, soulgems: /^Камни душ$/,
        scrolls: /^Свитки \(прописанные\)$/
    };
    function theftPocketPool(victimKey, tier) {
        const v = THEFT_VICTIMS[victimKey]; if (!v || !tier || tier.maxPrice === undefined) return [];
        const items = window.allItems || [];
        const out = [];
        v.cats.forEach(c => {
            if (c === 'lockpick') { const lp = items.find(i => i.name === 'Отмычка'); if (lp) out.push(lp); return; }
            const re = THEFT_POOL_RE[c]; if (!re) return;
            items.forEach(i => { if (re.test(i.category || '') && !i.unique && (i.weight || 0) <= 1) out.push(i); });
        });
        const cap = v.maxPrice !== undefined ? v.maxPrice : Infinity; // у нищего не бывает самоцветов
        return out.filter(i => (i.price || 0) >= tier.minPrice && (i.price || 0) <= Math.min(tier.maxPrice, cap));
    }
    function theftSessionEnemies() {
        const s = window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() ? window.CloudSync.getSessionData() : null;
        return s ? (s.enemies || []).filter(e => (e.curHp || 0) > 0) : [];
    }
    // Вещи врага, которые можно вытащить из карманов: из заранее брошенной добычи (corpseLoot), без надетого (у надетого есть slot).
    function theftEnemyPocket(en, tier) {
        const items = ((en && en.corpseLoot && en.corpseLoot.items) || []).filter(it => !it.slot);
        return items.filter(it => (it.price || 0) >= tier.minPrice && (it.price || 0) <= tier.maxPrice);
    }
    function theftState() { const st = dayState(); if (!st.theft) st.theft = { alert: {}, wins: {} }; return st.theft; }
    function theftVictimKey() {
        const v = (document.getElementById('theft-victim') || {}).value || '';
        if (v.indexOf('enemy:') === 0) return v;
        const nm = ((document.getElementById('theft-victim-name') || {}).value || '').trim().toLowerCase();
        return nm ? v + ':' + nm : '';
    }
    function theftVictimLabel() {
        const v = (document.getElementById('theft-victim') || {}).value || '';
        if (v.indexOf('enemy:') === 0) { const en = theftSessionEnemies().find(e => 'enemy:' + e.id === v); return en ? en.name : 'противник'; }
        const nm = ((document.getElementById('theft-victim-name') || {}).value || '').trim();
        return (nm ? nm + ', ' : '') + ((THEFT_VICTIMS[v] || {}).name || '').toLowerCase();
    }
    function theftPurseAvg(p) { return p[0] * (p[1] + 1) / 2 + p[2]; }
    function theftStealthMod() {
        const dexInput = document.getElementById('stat-dex');
        let m = calcAbilityMod(dexInput ? (parseInt(dexInput.value) || 10) : 10) + getActiveRollPenalty() + getActiveSkillRollBonus('Скрытность');
        const pb = window.perkBonuses || {};
        if (pb.sneakDetectBonus) m += pb.sneakDetectBonus;
        return m;
    }
    // Итоговая сложность и модификаторы броска — для подсказки и для самого броска.
    function theftCalc() {
        const what = (document.getElementById('theft-what') || {}).value || 'purse';
        const vSel = (document.getElementById('theft-victim') || {}).value || '';
        const isEnemy = vSel.indexOf('enemy:') === 0;
        const victim = isEnemy ? null : THEFT_VICTIMS[vSel];
        let tierKey = what;
        if (what === 'named') tierKey = (document.getElementById('theft-named-tier') || {}).value || 'valuable';
        const tier = THEFT_TIERS[tierKey];
        const pb = window.perkBonuses || {};
        const skill = getSkillRawValue('Карманные кражи');
        const dexInput = document.getElementById('stat-dex');
        const dexMod = calcAbilityMod(dexInput ? (parseInt(dexInput.value) || 10) : 10);
        const parts = [`Ловкость ${dexMod >= 0 ? '+' : ''}${dexMod}`];
        let mod = dexMod;
        const add = (v, label) => { if (v) { mod += v; parts.push(`${v > 0 ? '+' : ''}${v} ${label}`); } };
        add(skill < tier.threshold ? tier.penalty : 0, `навык ниже ${tier.threshold}`);
        add(pb.pickpocketBonus || 0, '«Ловкие пальчики»/«Щипач»');
        const asleep = !!(document.getElementById('theft-asleep') || {}).checked;
        if (asleep) add(pb.sleepTheftBonus || 0, '«Ночной вор»');
        if (what !== 'weapon' && (document.getElementById('theft-seen') || {}).checked) add(-5, 'не скрыт');
        if (victim) add(victim.mod, 'внимательная жертва');
        add(getActiveRollPenalty(), 'ошеломление/ослабление');
        add(hungerRollPenalty(), 'голод');
        add(getActiveSkillRollBonus('Карманные кражи'), 'снаряжение/зелья/болезни');
        const vk = theftVictimKey();
        const wins = vk ? (theftState().wins[vk] || 0) : 0;
        add(-2 * wins, `повтор у той же жертвы (${wins})`);
        return { what, tierKey, tier, victim, isEnemy, vSel, mod, parts, asleep, boostPct: getSkillBoostPercent('Карманные кражи'), vk };
    }
    window.renderTheftVictims = function () {
        const sel = document.getElementById('theft-victim'); if (!sel) return;
        const cur = sel.value;
        const ens = theftSessionEnemies();
        sel.innerHTML = Object.keys(THEFT_VICTIMS).map(k => `<option value="${k}">${escHtml(THEFT_VICTIMS[k].name)}</option>`).join('') +
            (ens.length ? '<optgroup label="Противники в сцене">' + ens.map(e => `<option value="enemy:${escHtml(e.id)}">${escHtml(e.name || 'противник')}</option>`).join('') + '</optgroup>' : '');
        if (cur && Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
        updateTheftInfo();
    };
    window.updateTheftInfo = function () {
        const info = document.getElementById('theft-info'); if (!info) return;
        const c = theftCalc();
        const nameWrap = document.getElementById('theft-name-wrap');
        if (nameWrap) nameWrap.style.display = c.isEnemy ? 'none' : '';
        const town = document.getElementById('theft-town');
        const extra = document.getElementById('theft-extra-wrap');
        if (extra && (extra.dataset.mode !== c.what || c.what === 'plant' || c.what === 'poison')) { // список вещей пересобираем каждый раз — инвентарь мог измениться
            const keepSel = (document.getElementById('theft-plant-item') || {}).value;
            extra.dataset.mode = c.what;
            if (c.what === 'named') extra.innerHTML = '<label>Что за вещь и её ступень</label><input type="text" id="theft-named-name" placeholder="название"><select id="theft-named-tier" onchange="updateTheftInfo()"><option value="trinket">Мелочь (до 10)</option><option value="valuable" selected>Ценная (до 100)</option><option value="precious">Дорогая (больше 100)</option></select>';
            else if (c.what === 'weapon') extra.innerHTML = '<label>Какое оружие (скажет мастер)</label><input type="text" id="theft-weapon-name" placeholder="например, Стальной меч">';
            else if (c.what === 'plant' || c.what === 'poison') {
                const list = playerInventory.filter(i => i.count > 0 && (c.what === 'poison' ? potionKindOf(i) === 'poison' : true));
                extra.innerHTML = `<label>${c.what === 'poison' ? 'Какой яд' : 'Какую вещь'}</label><select id="theft-plant-item">${list.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)} (×${i.count})</option>`).join('') || '<option value="">— нечего —</option>'}</select>`;
                const ps = document.getElementById('theft-plant-item'); if (ps && keepSel && Array.from(ps.options).some(o => o.value === keepSel)) ps.value = keepSel;
            } else extra.innerHTML = '';
        }
        const lines = [`<strong>${escHtml(c.tier.name)}</strong>: сложность ${c.tier.dc}, порог навыка ${c.tier.threshold}. Модификатор ${c.mod >= 0 ? '+' : ''}${c.mod} (${escHtml(c.parts.join(', '))})${c.boostPct ? `, усиление ${c.boostPct}% → +${boostDiceFlat(c.boostPct)}` : ''}.`];
        if (c.tier.perk && !(window.perkBonuses || {})[c.tier.perk]) lines.push(`<span style="color:#e74c3c;">Нужен перк «${c.what === 'weapon' ? 'Дезориентация' : 'Носитель яда'}».</span>`);
        if (c.what === 'weapon') lines.push(c.isEnemy || inCombatNow() ? '<span style="color:#e74c3c;">Надетое оружие в бою не украсть.</span>' : `Сначала проверка Скрытности (сложность ${THEFT_WEAPON_STEALTH_DC}), потом сама кража.`);
        if (c.what === 'key' && (window.perkBonuses || {}).keyThiefAuto) lines.push('🔑 «Ключник»: ключ достаётся всегда, кроме натуральной 1.');
        if (c.vk && theftState().alert[c.vk]) lines.push('<span style="color:#e67e22;">Эта жертва настороже до конца дня — красть у неё нельзя.</span>');
        if (c.victim && c.what === 'purse') lines.push(`В кошельке обычно ${c.victim.purse[0]}к${c.victim.purse[1]}${c.victim.purse[2] ? (c.victim.purse[2] > 0 ? '+' : '') + c.victim.purse[2] : ''} септимов.`);
        if (c.tier.maxPrice !== undefined) {
            const en0 = c.isEnemy ? theftSessionEnemies().find(e => 'enemy:' + e.id === c.vSel) : null;
            const n = (c.isEnemy && en0 && !en0.corpseLoot) ? 1 : c.isEnemy ? theftEnemyPocket(theftSessionEnemies().find(e => 'enemy:' + e.id === c.vSel), c.tier).length : theftPocketPool(c.vSel, c.tier).length;
            if (c.what !== 'named' && !n) lines.push('<span style="color:#e67e22;">У такой жертвы в карманах нет вещей этой ступени.</span>');
        }
        if (c.isEnemy && town) town.checked = false;
        info.innerHTML = lines.join('<br>');
        const al = document.getElementById('theft-alert-list');
        if (al) { const keys = Object.keys(theftState().alert); al.textContent = keys.length ? 'Настороже сегодня: ' + keys.map(k => k.replace(/^enemy:/, '').replace(/^[a-z]+:/, '')).join(', ') : ''; }
    };
    function theftRollD20() { return Math.floor(Math.random() * 20) + 1; }

    window.attemptTheft = function () {
        const resultEl = document.getElementById('theft-result');
        const c = theftCalc();
        const pb = window.perkBonuses || {};
        const say = (html) => { resultEl.innerHTML = html; };
        if (!c.vk) { say('<span style="color:#e67e22;">Впиши имя жертвы — так сайт помнит, кто настороже.</span>'); return; }
        const st = theftState();
        if (st.alert[c.vk]) { say('<span style="color:#e67e22;">Эта жертва настороже до конца дня.</span>'); return; }
        if (c.tier.perk && !pb[c.tier.perk]) { say(`<span style="color:#e74c3c;">Нужен перк «${c.what === 'weapon' ? 'Дезориентация' : 'Носитель яда'}».</span>`); return; }
        if (c.what === 'weapon' && (c.isEnemy || inCombatNow())) { say('<span style="color:#e74c3c;">Надетое оружие в бою не украсть.</span>'); return; }
        const enemy = c.isEnemy ? theftSessionEnemies().find(e => 'enemy:' + e.id === c.vSel) : null;
        if (c.isEnemy && !enemy) { say('Противник не найден.'); return; }
        let pickName = '', plantItem = null;
        if (c.what === 'named') { pickName = ((document.getElementById('theft-named-name') || {}).value || '').trim(); if (!pickName) { say('Впиши, какую вещь назвал мастер.'); return; } }
        if (c.what === 'weapon') { pickName = ((document.getElementById('theft-weapon-name') || {}).value || '').trim(); if (!pickName) { say('Впиши, какое оружие у жертвы (скажет мастер).'); return; } }
        if (c.what === 'plant' || c.what === 'poison') {
            const id = (document.getElementById('theft-plant-item') || {}).value;
            plantItem = playerInventory.find(i => i.itemId === id && i.count > 0);
            if (!plantItem) { say(c.what === 'poison' ? 'В инвентаре нет яда.' : 'Выбери, что подкинуть.'); return; }
        }
        let pocket = null;
        if (c.tier.maxPrice !== undefined && c.what !== 'named') {
            pocket = c.isEnemy ? (enemy.corpseLoot ? theftEnemyPocket(enemy, c.tier) : null) : theftPocketPool(c.vSel, c.tier);
            if (pocket && !pocket.length) { say('<span style="color:#e67e22;">У этой жертвы нет вещей такой ступени — попробуй другое.</span>'); return; }
        }
        if (c.what === 'purse' && c.isEnemy && enemy.corpseLoot && !(enemy.corpseLoot.gold > 0)) { say('<span style="color:#e67e22;">Кошелёк у этого противника пуст.</span>'); return; }
        if (inCombatNow()) { if (!combatActionAllowed('attack')) return; markCombatAction('attack'); }

        const sb = getSessionRollBonus(true);
        const mod = c.mod + sb.value;
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const victimLabel = theftVictimLabel();
        const town = !c.isEnemy && !!(document.getElementById('theft-town') || {}).checked;
        let html = '';
        // «Дезориентация»: сначала отдельная проверка Скрытности.
        if (c.what === 'weapon') {
            const sr = theftRollD20(), sBoost = getSkillBoostPercent('Скрытность'), sMod = theftStealthMod();
            const sTot = sr + sMod + boostDiceFlat(sBoost);
            html += `Скрытность: к20 ${sr} ${sMod >= 0 ? '+' : ''}${sMod}${boostDiceFlat(sBoost) ? ` +${boostDiceFlat(sBoost)} (${sBoost}%)` : ''} = <strong>${sTot}</strong> (нужно ${THEFT_WEAPON_STEALTH_DC})<br>`;
            diceHistory.unshift({ roll: sr, dieSize: 20, statLabel: 'Ловкость', statMod: sMod, skillLabel: 'Скрытность (подобраться к оружию)', total: sTot, dc: THEFT_WEAPON_STEALTH_DC, verdict: sTot >= THEFT_WEAPON_STEALTH_DC });
            if (sr === 1 || sTot < THEFT_WEAPON_STEALTH_DC) {
                st.alert[c.vk] = true;
                say(html + '<span style="color:#e67e22;">❌ Подобраться незаметно не вышло — жертва насторожилась, до конца дня у неё не украсть.</span>');
                diceHistory = diceHistory.slice(0, 20); renderDiceHistory(); updateTheftInfo(); saveLocalStorage();
                return;
            }
        }
        const roll = theftRollD20();
        const boost = boostDiceFlat(c.boostPct);
        const total = roll + mod + boost;
        const keyAuto = c.what === 'key' && pb.keyThiefAuto && roll !== 1;
        const success = roll !== 1 && (roll === 20 || total >= c.tier.dc || keyAuto);
        html += `к20: ${roll}${boost ? ` +${boost} (усиление ${c.boostPct}%)` : ''} ${mod >= 0 ? '+' : ''}${mod} = <strong>${total}</strong> (нужно ${c.tier.dc})${sb.notes.length ? ' · ' + escHtml(sb.notes.join(', ')) : ''}<br>`;
        diceHistory.unshift({ roll, dieSize: 20, statLabel: 'Ловкость', statMod: mod, skillLabel: `Карманные кражи (${c.tier.name})`, total, dc: c.tier.dc, verdict: success });
        diceHistory = diceHistory.slice(0, 20); renderDiceHistory();

        if (success) {
            st.wins[c.vk] = (st.wins[c.vk] || 0) + 1;
            const xp = () => { if (practiceXpAllowed('Карманные кражи')) logSkillSuccessByName('Карманные кражи'); else html += '<br><span style="opacity:.7;font-size:12px;">(опыт навыка за сегодня уже получен)</span>'; };
            const finish = (msg) => { say(html + `<span style="color:#2ecc71;">✅ ${msg}</span>`); xp(); renderInventoryList(); updateAll(); updateTheftInfo(); saveLocalStorage(true); };
            const giveStolen = (it, qty) => {
                addToInventory(it.name + '#stolen', it.name, qty || 1, it.weight || 0, it.category || '', it.effect || '', { price: it.price || 0, alchemyEffects: it.alchemyEffects, stolen: true }); // краденое — метка для торговцев
            };
            const goldEl = document.getElementById('char-gold');
            if (c.what === 'plant' || c.what === 'poison') {
                removeFromInventoryByName(plantItem.itemId, 1); // уходит именно подкинутая стопка (краденая — краденая)
                if (c.what === 'poison' && plantItem.alchemyEffects && plantItem.alchemyEffects.length && enemy && window.CloudSync.applyAlchemyToEnemy) {
                    const effs = plantItem.alchemyEffects.map(e => ({ name: e.name, magnitude: (typeof e.magnitude === 'number' ? (pb.alchemyConcentratedPoison ? Math.round(e.magnitude * 1.2 * 100) / 100 : e.magnitude) : null), duration: e.duration || null, unit: e.unit || '' }));
                    window.CloudSync.applyAlchemyToEnemy(enemy.id, effs, plantItem.name, myName)
                        .then(pr => { say(resultEl.innerHTML + `<br>☠ ${escHtml(pr.notes.join('; ') || '—')}`); })
                        .catch(e => alert('Яд не удалось нанести: ' + e.message));
                    finish(`Яд «${escHtml(plantItem.name)}» незаметно подброшен — он уже действует на «${escHtml(enemy.name)}».`);
                } else {
                    if (window.CloudSync && window.CloudSync.sendWhisperToGm) window.CloudSync.sendWhisperToGm(`🤏 ${myName} незаметно подкинул(а) «${plantItem.name}» жертве: ${victimLabel}.${c.what === 'poison' ? ' Яд действует на жертву: ' + (plantItem.effect || 'эффект яда') + '.' : ''}`, myName);
                    finish(`«${escHtml(plantItem.name)}» незаметно подброшено (${escHtml(victimLabel)}). Мастеру ушло сообщение.`);
                }
                return;
            }
            if (c.what === 'key') { giveStolen({ name: 'Ключ: ' + (((document.getElementById('theft-victim-name') || {}).value || '').trim() || victimLabel), weight: 0, category: 'Ключи', price: 0 }); finish('Ключ у тебя.'); return; }
            if (c.what === 'named' || c.what === 'weapon') {
                const db0 = (window.allItems || []).find(i => i.name.toLowerCase() === pickName.toLowerCase());
                giveStolen(db0 || { name: pickName, weight: c.what === 'weapon' ? 5 : 0.5, category: c.what === 'weapon' ? 'Оружие (краденое)' : 'Краденое' });
                if (!db0 && window.CloudSync && window.CloudSync.sendWhisperToGm) window.CloudSync.sendWhisperToGm(`🤏 ${myName} украл(а) «${pickName}» (${victimLabel}) — вещи нет в базе, поправь характеристики, если нужно.`, myName);
                finish(`«${escHtml(pickName)}» у тебя (краденое).`);
                return;
            }
            if (c.isEnemy) {
                const want = c.what === 'purse' ? null : pocket ? pocket[Math.floor(Math.random() * pocket.length)].name : { min: c.tier.minPrice, max: c.tier.maxPrice };
                window.CloudSync.pickpocketEnemy(enemy.id, want).then(got => {
                    if (got.gold) { goldEl.value = (parseInt(goldEl.value) || 0) + got.gold; finish(`Вытащил(а) ${got.gold} септимов.`); }
                    else if (got.item) { giveStolen(got.item, 1); finish(`Вытащил(а) «${escHtml(got.item.name)}».`); }
                    else { // нечего брать — это не удача: ни победы в счёт, ни опыта навыка
                        st.wins[c.vk] = Math.max(0, (st.wins[c.vk] || 1) - 1);
                        say(html + '<span style="color:#e67e22;">Карманы оказались пусты — взять нечего.</span>'); updateTheftInfo(); saveLocalStorage(true);
                    }
                }).catch(e => { st.wins[c.vk] = Math.max(0, (st.wins[c.vk] || 1) - 1); say(html + `<span style="color:#e67e22;">${escHtml(e.message)}</span>`); updateTheftInfo(); });
                return;
            }
            if (c.what === 'purse') {
                const p = c.victim.purse; let g = p[2]; for (let i = 0; i < p[0]; i++) g += 1 + Math.floor(Math.random() * p[1]);
                g = Math.max(0, g);
                goldEl.value = (parseInt(goldEl.value) || 0) + g;
                finish(g ? `Вытащил(а) ${g} септимов.` : 'Кошелёк оказался пуст.');
                return;
            }
            const it = pocket[Math.floor(Math.random() * pocket.length)];
            giveStolen(it, 1);
            finish(`Вытащил(а) «${escHtml(it.name)}» (${it.price || 0} септ.).`);
            return;
        }

        // Провал.
        const caught = roll === 1 || total <= c.tier.dc - 5;
        const sleeperKeeps = c.asleep && pb.sleepTheftBonus; // «Ночной вор»: спящая жертва не настораживается от мелкого провала
        if (!caught) {
            if (!sleeperKeeps) st.alert[c.vk] = true;
            say(html + `<span style="color:#e67e22;">❌ Не вышло, но тебя не заметили.${sleeperKeeps ? ' Жертва спит дальше («Ночной вор»).' : ' Жертва настороже до конца дня.'}</span>`);
            updateTheftInfo(); saveLocalStorage();
            return;
        }
        st.alert[c.vk] = true;
        if (!town) {
            say(html + `<span style="color:#e74c3c;">🚨 Пойман(а) с поличным! Вне поселения стражи нет — ${escHtml(victimLabel)} нападает, бой начинается с её хода.</span>`);
            if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🚨 ${myName} пойман(а) при карманной краже (${victimLabel}) — жертва нападает первой.`, myName);
            updateTheftInfo(); saveLocalStorage();
            return;
        }
        let price = 0;
        if (c.what === 'purse') price = c.victim ? theftPurseAvg(c.victim.purse) : 0;
        else if (c.tier.maxPrice !== undefined && pocket && pocket.length) price = pocket.reduce((s, i) => s + (i.price || 0), 0) / pocket.length;
        else if (c.what === 'named' || c.what === 'weapon') { const db0 = (window.allItems || []).find(i => i.name.toLowerCase() === pickName.toLowerCase()); price = db0 ? (db0.price || 0) : ({ trinket: 10, valuable: 50, precious: 150, weapon: 100 }[c.tierKey] || 0); }
        const fine = Math.round((THEFT_FINE_BASE + price / 2) * ((c.victim && c.victim.fineMult) || 1));
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const hold = (sess && (sess.currentHold || (sess.partyPos && sess.partyPos.hold))) || '';
        const whatLabel = c.what === 'named' || c.what === 'weapon' ? `${c.tier.name}: ${pickName}` : c.tier.name;
        say(html + `<span style="color:#e74c3c;">🚨 Пойман(а) с поличным! Предложенный штраф — ${fine} септимов${hold ? ' (' + escHtml(hold) + ')' : ''}. Решает мастер.</span>`);
        if (window.CloudSync && window.CloudSync.reportTheftCaught && window.CloudSync.isInSession && window.CloudSync.isInSession()) {
            window.CloudSync.reportTheftCaught({ victim: victimLabel, what: whatLabel, fine: fine, hold: hold }).catch(e => console.error(e));
            window.CloudSync.postCombatLog(`🚨 ${myName} пойман(а) при карманной краже (${victimLabel}, ${whatLabel}).`, myName);
        } else say(resultEl.innerHTML + '<br><span style="opacity:.75;">Ты не в сессии — скажи мастеру сам.</span>');
        updateTheftInfo(); saveLocalStorage();
    };
    try { window.renderTheftVictims(); } catch (e) { }

    // ========================================================================
    // ПРОКАЧКА ПЕРСОНАЖА
    // ========================================================================

    // Формулы — моя оценка, подогнанная под пример игрока (4→5 уровень за 10 очков навыков)
    // и под пример из правил (навык 75→76 нужно ~15 успехов).
    function getSuccessesNeededForSkill(skillValue) {
        const base = Math.max(1, Math.ceil(skillValue / 5));
        // (Знак «Любовник» раньше давал здесь +15% к скорости прокачки — в Sistema 2.2 такого нет: у него «Поцелуй любовника».)
        return base;
    }
    // Шкала уровней 2 (2026-10-30): потолок 65 вместо ~40. Очков навыков на уровень L→L+1 = min(2L+2, 9+⌈L/2⌉):
    // до 5-го уровня как раньше (4, 6, 8, 10, 12), дальше +1 за каждые два уровня (64→65 — 41). Навыков 19, сырой максимум 100,
    // всего повышений 19·90 − 45 = 1665; сумма порогов до 65-го — 1618, так что 65 достижим, выше уровень не растёт.
    // var, а не const: миграция сейва может вызваться раньше этой строки.
    var MAX_CHARACTER_LEVEL = 65;
    var LEVEL_SCHEME = 2; // 1 — старая шкала 2L+2 (потолок ~40)
    function getSkillUpsNeededForLevel(level) {
        return Math.min(level * 2 + 2, 9 + Math.ceil(level / 2));
    }
    function skillUpsToReachLevel(level, scheme) {
        let sum = 0;
        for (let l = 1; l < level; l++) sum += scheme === 1 ? l * 2 + 2 : getSkillUpsNeededForLevel(l);
        return sum;
    }
    window.getSkillUpsNeededForLevel = getSkillUpsNeededForLevel;
    // Пересчёт листа со старой шкалы: всё накопленное (пороги пройденных уровней + текущий прогресс) раскладывается по новой.
    // Уровень вырос — сам уровень не трогаем, а оставляем прогресс: кнопка «Применить уровень» горит столько раз, сколько уровней
    // прибавилось, и каждый раз игрок выбирает характеристику и получает очко перка. Уровень упал (только выше 65, выданный мастером) —
    // уровень снижается, лишние очки перков снимаются сначала из свободных, потом снимаются взятые ступени перков с самым высоким порогом.
    // Повторно не срабатывает: в сейве остаётся levelScheme = 2.
    function migrateLevelScheme(data) {
        if (!data || data.levelScheme === LEVEL_SCHEME) return data;
        data.levelScheme = LEVEL_SCHEME;
        if (typeof data.characterLevel === 'undefined') return data;
        const oldLevel = Math.max(1, parseInt(data.characterLevel) || 1);
        const total = skillUpsToReachLevel(oldLevel, 1) + Math.max(0, parseInt(data.levelUpProgress) || 0);
        let newLevel = 1;
        while (newLevel < MAX_CHARACTER_LEVEL && skillUpsToReachLevel(newLevel + 1) <= total) newLevel++;
        if (newLevel >= oldLevel) {
            data.levelUpProgress = total - skillUpsToReachLevel(oldLevel);
            if (newLevel > oldLevel) data.levelSchemeNote = { from: oldLevel, to: newLevel };
            return data;
        }
        const lost = oldLevel - newLevel;
        data.characterLevel = newLevel;
        data.levelUpProgress = newLevel >= MAX_CHARACTER_LEVEL ? 0 : total - skillUpsToReachLevel(newLevel);
        let pts = parseInt(data.perkPointsAvailable) || 0;
        let toRemove = lost - Math.max(0, Math.min(pts, lost));
        pts -= lost - toRemove;
        const removed = [];
        if (toRemove > 0 && data.perkStates && typeof data.perkStates === 'object') {
            const taken = [];
            Object.keys(data.perkStates).forEach(k => {
                const m = data.perkStates[k] && k.match(/^skill(\d+)-perk(\d+)-step(\d+)$/);
                if (!m) return;
                const perk = (fullPerksManifest[skillNames[+m[1]]] || [])[+m[2]];
                if (!perk) return;
                taken.push({ k, name: perk.name, step: +m[3], thr: ((perk.req && perk.req.thresholds) || [])[+m[3] - 1] || 0 });
            });
            taken.sort((a, b) => (b.thr - a.thr) || (b.step - a.step));
            taken.slice(0, toRemove).forEach(t => { data.perkStates[t.k] = false; removed.push(t.name + (t.step > 1 ? ' (ступень ' + t.step + ')' : '')); });
        }
        data.perkPointsAvailable = pts; // снимать больше нечего — в минус не уходим
        data.levelSchemeNote = { from: oldLevel, to: newLevel, removed };
        return data;
    }

    function renderLevelPanel() {
        const summaryEl = document.getElementById('level-summary');
        const readyBlock = document.getElementById('levelup-ready-block');
        if (!summaryEl) return;
        const needed = getSkillUpsNeededForLevel(characterLevel);
        const atMax = characterLevel >= MAX_CHARACTER_LEVEL;
        const ready = !atMax && levelUpProgress >= needed;
        if (typeof renderLordPerks === 'function') renderLordPerks();
        let readyN = 0;
        if (ready) { let p = levelUpProgress, l = characterLevel; while (l < MAX_CHARACTER_LEVEL && p >= getSkillUpsNeededForLevel(l)) { p -= getSkillUpsNeededForLevel(l); l++; readyN++; } }
        summaryEl.innerHTML = `Уровень: <strong>${characterLevel}</strong> из ${MAX_CHARACTER_LEVEL} · Очков перка свободно: <strong>${perkPointsAvailable}</strong><br>` +
            (atMax ? 'Достигнут максимальный уровень.' : `Прогресс к след. уровню: ${levelUpProgress} / ${needed} очков навыков` + (readyN > 1 ? ` · готово уровней: <strong>${readyN}</strong>` : ''));
        if (readyBlock) readyBlock.style.display = ready ? 'block' : 'none';
        renderSkillProgressList();
    }

    function renderSkillProgressList() {
        const el = document.getElementById('skill-progress-list');
        if (!el) return;
        el.innerHTML = '<div class="st-skill-progress-grid">' + skillNames.map((name, idx) => {
            // Читаем то же самое отображаемое значение поля навыка (skill-N.value), что видно
            // на вкладке «Ветки перков» — гарантирует, что два места всегда показывают одно число.
            const skillInput = document.getElementById('skill-' + idx);
            const effVal = skillInput ? (parseInt(skillInput.value) || getEffectiveSkillValue(name)) : getEffectiveSkillValue(name);
            const needed = getSuccessesNeededForSkill(effVal);
            const progress = skillProgress[idx] || 0;
            // Ручной кнопки «+1» нет: успехи навыка засчитывают сами действия (атака, каст, крафт) и мастер.
            return `<div class="party-row" style="display:flex; align-items:center; justify-content:flex-start; gap:8px; padding:3px 6px;">
                <span style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(name)}">${escHtml(name)} (${effVal}) — ${progress}/${needed}</span>
            </div>`;
        }).join('') + '</div>';
    }

    // Обёртка для автоматической фиксации успеха по имени навыка (крафт/каст) —
    // не боевые навыки качаются «за каждое успешное действие», это и есть та фиксация.
    const COOKING_FAIL_PROGRESS = 0.5; // доля успеха за провальную готовку (похлёбку); было 0,25, с 2026-10-30 — половина
    const MISS_SKILL_PROGRESS = 0.25; // доля успеха навыка за промах атакой/заклинанием
    function logSkillSuccessByName(skillName, amount) {
        const idx = skillNames.indexOf(skillName);
        if (idx === -1) return;
        window.logSkillSuccess(idx, amount);
    }

    window.logSkillSuccess = function (skillIdx, amount) {
        amount = (typeof amount === 'number' && amount > 0) ? amount : 1;
        const skillInput = document.getElementById('skill-' + skillIdx);
        if (!skillInput) return;
        const skillName = skillNames[skillIdx];
        const effVal = getEffectiveSkillValue(skillName);
        const needed = getSuccessesNeededForSkill(effVal);
        skillProgress[skillIdx] = Math.round(((skillProgress[skillIdx] || 0) + amount) * 100) / 100;

        if (skillProgress[skillIdx] >= needed) {
            skillProgress[skillIdx] = Math.round((skillProgress[skillIdx] - needed) * 100) / 100; // остаток дробного прогресса не теряется
            let raw = parseInt(skillInput.getAttribute('data-raw-val')) || 10;
            if (raw < 100) { // растёт сырой навык до 100; итог с бонусами вещей и бога обрезается потолком отдельно
                raw = Math.min(100, raw + 1);
                skillInput.setAttribute('data-raw-val', raw);
                levelUpProgress += 1;
                alert(`Навык «${skillName}» вырос до ${getEffectiveSkillValue(skillName)}!`);
            }
        }

        // Проверяем, не готов ли левел-ап
        const neededForLevel = getSkillUpsNeededForLevel(characterLevel);
        if (levelUpProgress >= neededForLevel) {
            // не применяем автоматически — просто показываем блок выбора
        }

        updateAll();
        renderLevelPanel();
        saveLocalStorage();
    };

    window.applyLevelUp = function () {
        const needed = getSkillUpsNeededForLevel(characterLevel);
        if (levelUpProgress < needed || characterLevel >= MAX_CHARACTER_LEVEL) return;
        const statKey = document.getElementById('levelup-stat-choice').value;
        const statInput = document.getElementById('stat-' + statKey);
        if (statInput) {
            const rawStat = parseInt(statInput.getAttribute('data-raw-stat')) || 10;
            statInput.value = rawStat + 1;
            statInput.setAttribute('data-raw-stat', rawStat + 1);
        }
        levelUpProgress -= needed; // остаток переносится на следующий уровень
        characterLevel += 1;
        perkPointsAvailable += 1;

        alert(`Новый уровень: ${characterLevel}! +1 к характеристике «${STAT_LABELS[statKey]}», +1 очко перка.`);
        updateAll();
        renderLevelPanel();
        saveLocalStorage();
    };

    // ========================================================================
    // ЗАТОЧКА / УЛУЧШЕНИЕ (ванильная формула: чем выше навык и есть профильный
    // перк материала — тем сильнее улучшение; материал — тот же, что и на ковку)
    // ========================================================================

    function findSmithingRecipeByName(name) {
        const pools = [window.armorRecipes, window.jewelryRecipes, window.weaponRecipes];
        for (const pool of pools) {
            if (!pool) continue;
            const found = pool.find(r => r.name === name);
            if (found) return found;
        }
        return null;
    }

    function getPrimaryTemperMaterial(recipe) {
        if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return null;
        const priority = recipe.ingredients.find(i => /слиток|кожа|сталгрим/i.test(i.name));
        return priority || recipe.ingredients[0];
    }

    // Ранги качества как в Skyrim (Fine…Legendary). need — требуемый навык без профильного перка материала,
    // needPerk — с перком (значения Skyrim: Хорошее 14/14, Качественное 31/22, Безупречное 100/57; остальные
    // ступени интерполированы). Бонус — ПРОПОРЦИЯ от базы: +10% за ранг (в CK это 1.1…1.6 «здоровья предмета»),
    // не меньше +1 за ранг; цена растёт тем же коэффициентом.
    const TEMPER_TIERS = [
        { name: 'Хорошее', need: 14, needPerk: 14 },
        { name: 'Качественное', need: 31, needPerk: 22 },
        { name: 'Отличное', need: 48, needPerk: 36 },
        { name: 'Безупречное', need: 100, needPerk: 57 },
        { name: 'Эпическое', need: 125, needPerk: 78 },
        { name: 'Легендарное', need: 150, needPerk: 100 }
    ];
    const TEMPER_PCT_PER_TIER = 0.1;
    const TEMPER_TIER_RE = / \((Хорошее|Качественное|Отличное|Безупречное|Эпическое|Легендарное)\)$/;

    function temperBaseName(item) { return String((item && item.name) || '').replace(TEMPER_TIER_RE, ''); }
    function temperFindRecipe(item) {
        const base = temperBaseName(item);
        return findSmithingRecipeByName(base) || (window.weaponsNonCraftable || []).find(r => r.name === base) || null;
    }
    function temperMaterialFor(item) {
        normalizeUpgradeMaterial(item);
        if (item.upgradeMaterial) return { name: item.upgradeMaterial, qty: Math.max(1, item.upgradeQty || 1) };
        const m = getPrimaryTemperMaterial(temperFindRecipe(item));
        return m ? { name: m.name, qty: 1 } : null;
    }
    function temperValue(base, tier) {
        return tier ? base + Math.max(tier, Math.round(base * TEMPER_PCT_PER_TIER * tier)) : base;
    }
    function applyTemperTier(item, tier) {
        item.temperTier = tier;
        if (typeof item.baseWeaponDmg === 'number') item.weaponDmg = temperValue(item.baseWeaponDmg, tier);
        if (typeof item.baseArmorValue === 'number') item.armorValue = temperValue(item.baseArmorValue, tier);
        if (typeof item.basePrice === 'number' && item.basePrice > 0) item.price = temperValue(item.basePrice, tier);
        item.name = temperBaseName(item) + (tier ? ' (' + TEMPER_TIERS[tier - 1].name + ')' : '');
    }
    // Самовосстановление: вещи, улучшенные старыми механиками (upgradeCount / qualityRank), приводим к рангу.
    function ensureTemperState(item) {
        if (item.temperTier !== undefined) return item;
        const legacy = Math.min(TEMPER_TIERS.length, Math.max(item.upgradeCount || 0, item.qualityRank || 0));
        if (typeof item.weaponDmg === 'number' && typeof item.baseWeaponDmg !== 'number') item.baseWeaponDmg = item.weaponDmg - (item.qualityBonusApplied || 0);
        if (typeof item.armorValue === 'number' && typeof item.baseArmorValue !== 'number') item.baseArmorValue = item.armorValue;
        if (typeof item.basePrice !== 'number') item.basePrice = item.price || 0;
        delete item.upgradeCount; delete item.qualityRank; delete item.qualityBonus; delete item.qualityBonusApplied;
        item.temperTier = 0;
        if (legacy > 0) applyTemperTier(item, legacy);
        return item;
    }
    function getTemperSkill() {
        const boost = getSkillBoostPercent('Кузнечное дело') || 0;
        return Math.round(getEffectiveSkillValue('Кузнечное дело') * (1 + boost / 100));
    }
    function temperRequirement(item, tier) {
        const recipe = temperFindRecipe(item);
        const hasPerk = !!(recipe && recipe.perkHint && typeof isPerkChecked === 'function' && isPerkChecked(recipe.perkHint));
        const t = TEMPER_TIERS[tier - 1];
        // Таланты: перк материала даёт «создавать И улучшать» — без него вещь этого материала не улучшить.
        // «Кузнец-волшебник» — улучшать магическое (зачарованное/с эффектом) оружие и броню.
        const magical = isMagicalGear(item);
        return { need: hasPerk ? t.needPerk : t.need, hasPerk, perkName: recipe && recipe.perkHint,
            blockedPerk: !!(recipe && recipe.perkHint && !hasPerk), blockedMagic: magical && !(typeof isPerkChecked === 'function' && isPerkChecked('Кузнец-волшебник')) };
    }
    function isMagicalGear(item) {
        return !!(item && (item.enchantment || item.isStaff || item.isMagicStaff || (item.effect && String(item.effect).trim() && !/^Урон \d+ \+/.test(String(item.effect)) && !(item.craftKind === 'smith' && !item.enchantment) && !/^(Урон|Сопротивление) \d+(?![\d%])(?!.*(?:заклинан|чар|магическ))/i.test(String(item.effect)))));
    }
    function refreshEquippedAfterTemper(itemId, item) {
        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        if (equippedSlots.meleeWeapon === itemId) { setV('wep-melee-dmg', item.weaponDmg); setV('wep-melee-name', item.name); }
        if (equippedSlots.meleeWeaponOffhand === itemId) { setV('wep-melee-offhand-dmg', item.weaponDmg); setV('wep-melee-offhand-name', item.name); }
        if (equippedSlots.rangedWeapon === itemId) { setV('wep-ranged-dmg', item.weaponDmg); setV('wep-ranged-name', item.name); }
        Object.keys(SLOT_FIELD_MAP).forEach(slotKey => {
            if (equippedSlots[slotKey] === itemId) { setV(SLOT_FIELD_MAP[slotKey][0], item.name); setV(SLOT_FIELD_MAP[slotKey][1], item.armorValue); }
        });
        // Кольцо/ожерелье/обруч: у них одно текстовое поле «имя — эффект» (не броня), его тоже обновляем —
        // иначе после улучшения в слоте оставалось старое имя без ранга.
        const jewel = { ring: 'slot-ring-name', neck: 'slot-neck-name', circlet: 'slot-circlet-name' };
        Object.keys(jewel).forEach(k => {
            if (equippedSlots[k] === itemId) { const d = getEffectDescriptionForItem(item); setV(jewel[k], item.name + (d ? ' — ' + d : '')); }
        });
        if (typeof renderEquippedSummary === 'function') { try { renderEquippedSummary(); } catch (e) { /* не критично */ } }
    }

    function getTemperableItems() {
        // Боеприпасы (стрелы, болты) не улучшаются и не затачиваются — в список не попадают.
        return playerInventory.filter(i => (typeof i.armorValue === 'number' || typeof i.weaponDmg === 'number') && !isAmmoItem(i) && (i.upgradeMaterial || temperFindRecipe(i)));
    }

    function renderTemperSelect() {
        const select = document.getElementById('temper-item-select');
        if (!select) return;
        const prev = select.value;
        const items = getTemperableItems().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru', { sensitivity: 'base' }));
        select.innerHTML = items.length
            ? items.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)}${i.count > 1 ? ' ×' + i.count : ''}</option>`).join('')
            : '<option value="">Нет подходящих предметов (нужна вещь с материалом для улучшения)</option>';
        if (items.some(i => i.itemId === prev)) select.value = prev;
        updateTemperInfo();
    }

    window.updateTemperInfo = function () {
        const itemId = document.getElementById('temper-item-select').value;
        const infoEl = document.getElementById('temper-info');
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) { infoEl.innerHTML = ''; return; }
        ensureTemperState(item);
        const material = temperMaterialFor(item);
        const isWeapon = typeof item.weaponDmg === 'number';
        const tier = item.temperTier || 0;
        const skill = getTemperSkill();
        const lines = [];
        lines.push(`Ранг: <strong>${tier ? escHtml(TEMPER_TIERS[tier - 1].name) : 'обычное'}</strong> (${tier}/${TEMPER_TIERS.length}) · ${isWeapon ? 'урон' : 'броня'}: ${isWeapon ? item.weaponDmg : item.armorValue}${item.price ? ' · цена: ' + item.price + ' септ.' : ''}`);
        if (tier >= TEMPER_TIERS.length) {
            lines.push('<span style="color:#2ecc71;">Достигнут максимальный ранг — точить дальше некуда.</span>');
        } else {
            const next = tier + 1;
            const req = temperRequirement(item, next);
            const have = material ? countInInventory(material.name) : 0;
            const baseV = isWeapon ? item.baseWeaponDmg : item.baseArmorValue;
            const newV = temperValue(baseV, next);
            const newP = (typeof item.basePrice === 'number' && item.basePrice > 0) ? temperValue(item.basePrice, next) : null;
            lines.push(`Следующий ранг: <strong>${escHtml(TEMPER_TIERS[next - 1].name)}</strong> — ${isWeapon ? 'урон' : 'броня'} ${isWeapon ? item.weaponDmg : item.armorValue} → <strong>${newV}</strong>${newP !== null ? `, цена ${item.price} → <strong>${newP}</strong>` : ''}`);
            if (req.blockedPerk) lines.push(`<span style="color:#e74c3c;">Нужен перк «${escHtml(req.perkName)}» — без него эту вещь не улучшить.</span>`);
            if (req.blockedMagic) lines.push('<span style="color:#e74c3c;">Магическую вещь улучшать можно только с перком «Кузнец-волшебник».</span>');
            lines.push(`Навык Кузнечного дела: ${skill} (нужно ${req.need}${req.perkName ? `; перк «${escHtml(req.perkName)}»: ${req.hasPerk ? 'есть' : 'нет'}` : ''}) ${skill >= req.need ? '✅' : '❌'}`);
            lines.push(material ? `Материал: <strong>${escHtml(material.name)}</strong> ×${material.qty} (есть: ${have}) ${have >= material.qty ? '✅' : '❌'}` : 'Не удалось определить материал для этой вещи.');
        }
        infoEl.innerHTML = lines.join('<br>');
    };

    window.temperItem = function () {
        const itemId = document.getElementById('temper-item-select').value;
        const resultEl = document.getElementById('temper-result');
        const fail = t => { resultEl.innerHTML = '<span style="color:#e74c3c;">' + escHtml(t) + '</span>'; };
        let item = playerInventory.find(i => i.itemId === itemId);
        if (!item) { fail('Выбери предмет.'); return; }
        if (isAmmoItem(item)) { fail('Стрелы и болты улучшить или заточить нельзя.'); return; }
        ensureTemperState(item);
        const tier = item.temperTier || 0;
        if (tier >= TEMPER_TIERS.length) { fail('Эта вещь уже легендарного качества — точить дальше некуда.'); return; }
        const next = tier + 1;
        const material = temperMaterialFor(item);
        if (!material) { fail('Не удалось определить материал.'); return; }
        const req = temperRequirement(item, next);
        const skill = getTemperSkill();
        if (req.blockedPerk) { fail(`Нужен перк «${req.perkName}»: он позволяет создавать и улучшать вещи этого материала.`); return; }
        if (req.blockedMagic) { fail('Магическое оружие и броню улучшают только с перком «Кузнец-волшебник».'); return; }
        if (skill < req.need) {
            fail(`Навыка Кузнечного дела не хватает для ранга «${TEMPER_TIERS[next - 1].name}»: нужно ${req.need}${req.hasPerk ? ' (с перком материала)' : ''}, у тебя ${skill}.`);
            return;
        }
        if (countInInventory(material.name) < material.qty) {
            fail(`Нужен материал «${material.name}» ×${material.qty} — в инвентаре только ${countInInventory(material.name)}.`);
            return;
        }
        removeFromInventoryByName(material.name, material.qty);
        // Как в Skyrim, затачивается ОДНА вещь: из стопки отделяем одну штуку, остальные остаются как были.
        let target = playerInventory.find(i => i.itemId === itemId);
        if (!target) { fail('Предмет пропал из инвентаря.'); return; }
        // Заточенная вещь всегда получает свой id. Раньше последняя вещь стопки оставалась с id «Стальной меч»,
        // и любой новый «Стальной меч» от мастера или торговца ложился в неё и становился заточенным бесплатно.
        const newTemperId = temperBaseName(target) + '#' + Date.now() + Math.floor(Math.random() * 1000);
        const equippedKey = Object.keys(equippedSlots).find(k => equippedSlots[k] === itemId);
        if (target.count > 1) {
            const clone = JSON.parse(JSON.stringify(target));
            clone.count = 1;
            clone.itemId = newTemperId;
            target.count -= 1;
            playerInventory.push(clone);
            target = clone;
        } else {
            target.itemId = newTemperId;
        }
        const isWeapon = typeof target.weaponDmg === 'number';
        const oldVal = isWeapon ? target.weaponDmg : target.armorValue;
        const oldPrice = target.price || 0;
        applyTemperTier(target, next);
        // Надетая вещь — та, что в руках: заточка уходит именно на неё (раньше из стопки точилась отделённая копия, а надетая оставалась прежней).
        if (equippedKey) equippedSlots[equippedKey] = target.itemId;
        refreshEquippedAfterTemper(target.itemId, target);
        const newVal = isWeapon ? target.weaponDmg : target.armorValue;
        resultEl.innerHTML = `<span style="color:#2ecc71;">✅ «${escHtml(target.name)}»: ${isWeapon ? 'урон' : 'броня'} ${oldVal} → ${newVal}${oldPrice ? `, цена ${oldPrice} → ${target.price}` : ''}.</span>`;
        renderTemperSelect();
        const sel = document.getElementById('temper-item-select');
        if (sel && playerInventory.some(i => i.itemId === target.itemId)) { sel.value = target.itemId; updateTemperInfo(); }
        renderInventoryList();
        updateAll();
        saveLocalStorage(true);
    };

    // Кнопка «⚒️ Заточить» в инвентаре: открывает кузницу и выбирает эту вещь.
    window.openTemperFor = function (itemId) {
        const btn = document.querySelector('.tab-link[onclick*="tab7"]');
        if (btn) openTab({ currentTarget: btn }, 'tab7');
        const body = document.getElementById('prof-body-smithing');
        if (body && !body.classList.contains('open')) window.toggleProfession('smithing');
        renderTemperSelect();
        const sel = document.getElementById('temper-item-select');
        if (sel && itemId) { sel.value = itemId; updateTemperInfo(); }
        const box = document.getElementById('temper-box');
        if (box && box.scrollIntoView) { try { box.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { box.scrollIntoView(); } }
    };

    // ========================================================================
    // МАГИЧЕСКИЕ ПОСОХИ-ЗАКЛИНАТЕЛИ (хранят заклинание, не зачарование оружия)
    // ========================================================================

    const MAGIC_STAFF_MAX_USES = { 1: 10, 2: 7, 3: 5, 4: 3 };

    function renderMagicStaffSpellSelect() {
        const select = document.getElementById('magic-staff-spell-select');
        if (!select) return;
        select.innerHTML = customSpells.length
            ? customSpells.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.name)} (${escHtml(s.school)})</option>`).join('')
            : '<option value="">Сначала выучи заклинание на вкладке «Книга заклинаний»</option>';
        if (typeof renderMagicStaffRecipeInfo === 'function') renderMagicStaffRecipeInfo();
    }

    // Рецепт по рангу выбранного заклинания (window.magicStaffRecipes в smithing-data.js).
    function getMagicStaffRecipe(spell) {
        const tier = getSpellTier(spell.school, spell.name) || 1;
        return { tier, ingredients: (window.magicStaffRecipes || {})[tier] || [] };
    }

    // Показывает, что нужно для посоха выбранного заклинания и сколько из этого уже есть.
    window.renderMagicStaffRecipeInfo = function () {
        const box = document.getElementById('magic-staff-recipe-info');
        const select = document.getElementById('magic-staff-spell-select');
        if (!box || !select) return;
        const spell = customSpells.find(s => s.id === select.value);
        if (!spell) { box.innerHTML = ''; return; }
        const { tier, ingredients } = getMagicStaffRecipe(spell);
        const tierName = ['', 'Новичок', 'Ученик', 'Адепт', 'Эксперт'][tier];
        box.innerHTML = `<div style="opacity:.85;">Ранг заклинания: <strong>${tierName}</strong>. Нужно:</div>` + ingredients.map(g => {
            const have = countInInventory(g.name);
            return `<div style="color:${have >= g.qty ? '#2ecc71' : '#e74c3c'};">${have >= g.qty ? '✓' : '✗'} ${escHtml(g.name)} ×${g.qty} (есть ${have})</div>`;
        }).join('');
    };

    window.createMagicStaff = function () {
        const select = document.getElementById('magic-staff-spell-select');
        const spell = customSpells.find(s => s.id === select.value);
        const resultEl = document.getElementById('magic-staff-create-result');
        if (!spell) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери заклинание.</span>'; return; }
        const { tier, ingredients } = getMagicStaffRecipe(spell);
        const missing = ingredients.filter(g => countInInventory(g.name) < g.qty);
        if (missing.length) {
            resultEl.innerHTML = `<span style="color:#e74c3c;">Не хватает: ${missing.map(g => `${escHtml(g.name)} ×${g.qty - countInInventory(g.name)}`).join(', ')}.</span>`;
            renderMagicStaffRecipeInfo();
            return;
        }
        ingredients.forEach(g => removeFromInventoryByName(g.name, g.qty));
        const maxUses = MAGIC_STAFF_MAX_USES[tier] || 5;
        const name = `Посох-заклинатель: ${spell.name}`;
        addToInventory(name + '#' + Date.now(), name, 1, 8, 'Посох', spell.desc, {
            isMagicStaff: true, spellName: spell.name, usesLeft: maxUses, maxUses: maxUses, slot: 'ranged', price: 60 + tier * 40,
            craftCost: craftCostOf(ingredients, 1), craftKind: 'ench'
        });
        resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Создан «${escHtml(name)}» (${maxUses} применений). Потрачено: ${ingredients.map(g => `${escHtml(g.name)} ×${g.qty}`).join(', ')}.</span>`;
        renderMagicStaffList();
        renderMagicStaffRecipeInfo();
        renderInventoryList();
        saveLocalStorage();
    };

    function renderMagicStaffList() {
        const el = document.getElementById('magic-staff-list');
        if (!el) return;
        const staves = playerInventory.filter(i => i.isMagicStaff);
        if (!staves.length) { el.innerHTML = '<p style="opacity:.6; font-size:14px;">Посохов-заклинателей пока нет.</p>'; return; }
        el.innerHTML = staves.map(s => `
            <div class="party-row">
                <div class="row-name"><strong>${escHtml(s.name)}</strong><span style="font-size:13px;">Заряды: ${s.usesLeft} / ${s.maxUses}</span></div>
                <div style="font-size:14px; opacity:.85; margin:2px 0;">${escHtml(s.effect || '')}</div>
                <div style="display:flex; gap:6px;">
                    <button class="btn-success" style="flex:1;" onclick="useMagicStaff('${jsq(s.itemId)}')" ${s.usesLeft <= 0 ? 'disabled' : ''}>Использовать</button>
                    <button style="flex:1;" onclick="rechargeMagicStaff('${jsq(s.itemId)}')" ${s.usesLeft >= s.maxUses ? 'disabled' : ''}>Зарядить</button>
                </div>
            </div>
        `).join('');
    }

    window.useMagicStaff = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.usesLeft <= 0) return;
        // Боевой посох бьёт через «Разрешить атаку» (там выбор цели), остальные — эффект заклинания без маны.
        if (parseSpellDamageFromDesc(item.effect || '')) {
            alert(`«${item.name}» наносит урон — используй его через «Разрешить атаку» на вкладке «Сессия» (там выбираешь цель).`);
            return;
        }
        { const hb = castBlockReason(); if (hb) { alert(hb.replace('колдовать', 'пользоваться посохом')); return; } }
        if (!combatActionAllowed('item')) return; // посох работает сам — Немота не мешает
        const spN = item.spellName || String(item.name || '').replace(/^Посох-заклинатель:\s*/, '');
        const result = resolveSpellEffect(spN, item.effect || '', findSpellSchoolByName(spN) || null, 'self', true);
        item.usesLeft -= 1;
        markCombatAction('attack'); // применение посоха — действие хода
        renderMagicStaffList(); renderInventoryList(); updateAll();
        saveLocalStorage();
        alert(`Использован «${item.name}»: ${result && result.message ? result.message : item.effect}\nОсталось зарядов: ${item.usesLeft}/${item.maxUses}`);
    };

    window.rechargeMagicStaff = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        const method = document.getElementById('magic-staff-recharge-method').value;
        let gemName;
        // Полная зарядка по таблице: 4 крохотных, или 3 маленьких, или 2 обычных, или 1 большой (великий тоже подходит).
        if (method === 'one') {
            const options = ['Заполненный большой камень душ', 'Заполненный великий камень душ'];
            gemName = options.find(n => countInInventory(n) >= 1);
            if (!gemName) { alert('Нет ни одного заполненного Большого/Великого камня душ.'); return; }
            removeFromInventoryByName(gemName, 1);
        } else if (method === 'two-common') {
            gemName = 'Заполненный обычный камень душ';
            if (countInInventory(gemName) < 2) { alert('Нужно 2 заполненных Обычных камня душ.'); return; }
            removeFromInventoryByName(gemName, 2);
        } else if (method === 'three-small') {
            gemName = 'Заполненный маленький камень душ';
            if (countInInventory(gemName) < 3) { alert('Нужно 3 заполненных Маленьких камня душ.'); return; }
            removeFromInventoryByName(gemName, 3);
        } else {
            gemName = 'Заполненный крохотный камень душ';
            if (countInInventory(gemName) < 4) { alert('Нужно 4 заполненных Крохотных камня душ.'); return; }
            removeFromInventoryByName(gemName, 4);
        }
        item.usesLeft = item.maxUses;
        renderMagicStaffList();
        renderInventoryList();
        saveLocalStorage();
    };

    // ========================================================================
    // РАЗРЕШИТЬ АТАКУ (игрок атакует цель из активной сессии мастера)
    // ========================================================================

    let pendingPlayerAttack = null; // { targetId, dmg, dmgType, logText }
    var counterHits = {}; // «Контрудар»: id врага → сколько раз он попал по игроку (до его смерти)

    // Определяет тип урона по названию заклинания/эффекта — для вычета резиста цели.
    // Урон по мане из описания: «здоровью и магии» — столько же, «вдвое меньший урон магии» — половина,
    // «40 урона здоровью и 50 магии» / «60 урона хп и 30 мп» / «дополнительно 25 урона по МП» — указанное число.
    function parseSpellMpDamage(text, dmg) {
        const t = String(text || '');
        let m = t.match(/урон[а-яё]*\s+(?:здоровью|хп)\s+и\s+(\d+)\s*(?:маги|мп)/i) || t.match(/(\d+)\s*урон[а-яё]*\s+по\s+мп/i);
        if (m) return parseInt(m[1]);
        if (/вдвое\s+меньш[а-яё]*\s+урон[а-яё]*\s+маги|в\s*2\s+меньш[а-яё]*\s+урон[а-яё]*\s+маги/i.test(t)) return Math.round(dmg / 2);
        if (/здоровью\s+и\s+магии|по\s+хп\s+и\s+мп/i.test(t)) return dmg;
        return 0;
    }
    function isUndeadTargetForSpell(target) {
        return getEnemyMeta(target).kind === 'undead';
    }
    function detectDmgTypeFromName(name) {
        const n = (name || '').toLowerCase();
        // Заклинания, у которых стихия не видна по слову в названии.
        if (/^(пламя|клыки дракона|испепеление)/.test(n)) return 'fire';
        if (/^обморожение/.test(n)) return 'frost';
        if (/^искры/.test(n)) return 'shock';
        if (/^(надлом)/.test(n)) return 'frost';                       // лёд
        if (/^(нестабильное напряжение|раскаты грома)/.test(n)) return 'shock';
        if (/^(запретное солнце|болид)/.test(n)) return 'fire';
        if (/^огонь солнца/.test(n)) return 'magic';                  // солнечный свет против нежити — не огонь
        if (/^(импульс|телекинетический столп)/.test(n)) return 'physical'; // поток воздуха / столп — «физ урон», режется бронёй
        if (/огн|пламен/.test(n)) return 'fire';
        if (/лед|мороз|холод/.test(n)) return 'frost';
        if (/молни|гроз|электр/.test(n)) return 'shock';
        if (/^увядание/.test(n)) return 'magic';                      // «увЯДание» — не яд
        if (/(^|[^а-яё])яд|отрав/.test(n)) return 'poison';
        if (/физическ/.test(n)) return 'physical';
        return 'magic';
    }

    // Достаёт число урона из описания заклинания (в тексте почти всегда явно
    // указано "наносит N урона" — берём первое такое совпадение).
    // enhanced:true — 190 из 191 заклинания имеют отдельный блок "Усиленный эффект" с ДРУГИМ
    // (обычно большим) числом урона, раньше урон всегда брался только из БАЗОВОГО описания —
    // инструмент атаки не мог достать усиленное число вообще, даже если игрок кастовал усиленно
    // (х2 маны) на заклинания-баффы (resolveSpellEffect), но не на прямой урон в бою.
    // Кэш по "desc|enhanced" — чистая функция (один и тот же текст описания всегда даёт одно
    // и то же число), безопасна без инвалидации. Раньше вызывалась дважды на каждое заклинание
    // в renderAttackActionSelect на КАЖДЫЙ updateAll() — не бесплатно при большой книге заклинаний.
    const _spellDmgCache = new Map();
    function parseSpellDamageFromDesc(desc, enhanced) {
        if (!desc) return null;
        const cacheKey = desc + '|' + (enhanced ? '1' : '0');
        if (_spellDmgCache.has(cacheKey)) return _spellDmgCache.get(cacheKey);
        const result = _parseSpellDamageFromDescImpl(desc, enhanced);
        _spellDmgCache.set(cacheKey, result);
        return result;
    }
    function _parseSpellDamageFromDescImpl(desc, enhanced) {
        let text = desc;
        const splitIdx = desc.search(/усилен[а-яёА-ЯЁ]*\s+эффект/i);
        if (enhanced && splitIdx !== -1) {
            const after = desc.slice(splitIdx).replace(/усилен[а-яёА-ЯЁ]*\s+эффект/i, '');
            if (after.trim()) text = after; // если после "Усиленный эффект" пусто — падаем на базовый текст
        } else if (!enhanced && splitIdx !== -1) {
            text = desc.slice(0, splitIdx);
        }
        // [а-яёА-ЯЁ] вместо \w — \w не матчит кириллицу. "нанос[а-яёА-ЯЁ]*" покрывает наносит/наносящий/
        // нанося и т.п. одним паттерном. (ед.?|единиц) — раньше "N единиц урона" не понималось,
        // только сокращённое "ед.". Опциональное слово перед "урон" — "физ/огненн/ледян/..." —
        // раньше "наносит 40 физ урона" не матчилось, т.к. между числом и "урон" было слово.
        const m = text.match(/нанос[а-яёА-ЯЁ]*\s+(\d+)\s*(?:ед\.?|единиц[аы]?)?\s*(?:физ[а-яёА-ЯЁ]*\s+|огненн[а-яёА-ЯЁ]*\s+|ледян[а-яёА-ЯЁ]*\s+|электрич[а-яёА-ЯЁ]*\s+|яд[а-яёА-ЯЁ]*\s+)?урон/i) ||
                  text.match(/(\d+)\s*(?:ед\.?|единиц[аы]?)?\s*(?:физ[а-яёА-ЯЁ]*\s+)?урон/i);
        if (m) return parseInt(m[1]);
        // Урон кубиками («наносит 4д6», «9д6») — для списка берём среднее; при броске кидаются настоящие кубы (getSpellDice).
        const dm = text.match(/нанос[а-яёА-ЯЁ]*\s+(\d+)\s*[дd]\s*(\d+)/i);
        if (dm) return Math.round(parseInt(dm[1]) * (parseInt(dm[2]) + 1) / 2);
        // Ничего не нашли в усиленном тексте (напр. "Усиленный эффект" пустой) — пробуем базовый.
        // Через _parseSpellDamageFromDescImpl напрямую (не через кэш-обёртку), чтобы не плодить
        // двойную запись в кэш за один исходный вызов — внешняя parseSpellDamageFromDesc всё равно
        // закэширует именно ЭТОТ (enhanced) результат по своему исходному ключу.
        return enhanced ? _parseSpellDamageFromDescImpl(desc, false) : null;
    }

    // ========================================================================
    // ПЕРЕДАЧА ПРЕДМЕТОВ/ДЕНЕГ ДРУГОМУ ИГРОКУ
    // ========================================================================

    function renderTradeSelects() {
        const targetSelect = document.getElementById('trade-target-select');
        if (!targetSelect) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const myUidT = tradeMyUid();
        const participants = (session && session.participants) || {};
        // Получатель — другой игрок (по uid), а не «другое имя»: тёзки персонажей раньше не видели друг друга.
        const others = Object.entries(participants).filter(([uid, p]) => p.name && uid !== myUidT);
        const dupName = n => others.filter(([, q]) => q.name === n).length > 1 || n === document.getElementById('char-name').value;
        const prev = targetSelect.value;
        targetSelect.innerHTML = others.length
            ? others.map(([uid, p]) => `<option value="${uid}">${escHtml(p.name)}${dupName(p.name) ? ' (' + escHtml(uid.slice(0, 4)) + ')' : ''}</option>`).join('')
            : '<option value="">Нет других игроков в сессии</option>';
        if (others.some(([uid]) => uid === prev)) targetSelect.value = prev;
        // Кнопки "→" у предметов в инвентаре появляются/пропадают в зависимости от того,
        // выбран ли получатель — перерисовываем список.
        if (typeof renderInventoryList === 'function') renderInventoryList();
        if (typeof renderTradeDraft === 'function') renderTradeDraft();
        if (typeof renderTradePanel === 'function') renderTradePanel();
    }
    window.renderTradeSelects = renderTradeSelects;

    // ===== ОБМЕН МЕЖДУ ИГРОКАМИ (с подтверждением получателя) =====
    // Предложение лежит в session.trades[id]: { id, from, fromName, to, toName, give:{items:[...], gold}, want:{gold, note},
    // status: pending|accepted|declined|cancelled, ts, fromApplied, toApplied }. Предметы/золото отправителя уходят в «залог»
    // (в само предложение) сразу при отправке; получатель принимает — и получает их, отказывает/отменяют — залог возвращается.
    // Каждый клиент применяет свою часть ровно один раз (ключи в tradesDone, сохраняются вместе с персонажем).
    let tradeDraft = { items: [], gold: 0 };
    let tradesDone = {};
    let tradesReady = false;
    setTimeout(() => { tradesReady = true; }, 4000); // страховка, если персонаж не пришёл из облака (новый лист)
    let _lastTrades = {};
    const TRADE_STATUS_RU = { pending: 'ждёт ответа', accepted: 'принято', declined: 'отклонено', cancelled: 'отменено' };

    function tradeMyUid() { return window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null; }
    function tradeName() { return (document.getElementById('char-name') || {}).value || 'Игрок'; }
    function tradeGoldNow() { return parseInt(document.getElementById('char-gold').value) || 0; }
    function tradeSetGold(v) { document.getElementById('char-gold').value = Math.max(0, Math.round(v)); }
    function tradeLog(text) { if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(text, tradeName()); }
    function tradeItemsText(items) { return (items || []).map(i => '«' + i.name + '»' + (i.count > 1 ? ' ×' + i.count : '')).join(', '); }
    function tradeOfferText(o) {
        const parts = [];
        if (o && o.items && o.items.length) parts.push(tradeItemsText(o.items));
        if (o && o.gold) parts.push(o.gold + ' зол.');
        return parts.join(' + ');
    }
    function tradeClone(x) { return JSON.parse(JSON.stringify(x)); }

    function tradeAddItemToMe(it) {
        const c = Object.assign({}, it);
        const itemId = c.itemId, name = c.name, count = c.count || 1, weight = c.weight, category = c.category, effect = c.effect;
        ['itemId', 'name', 'count', 'weight', 'category', 'effect'].forEach(k => delete c[k]);
        addToInventory(itemId, name, count, weight, category, effect, c);
    }

    // ---- черновик предложения ----
    window.tradeItemToPlayer = function (itemId, qtyArg) { // кнопка «→» у предмета: добавить в предложение (из стопки — с выбором количества)
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        const worn = Object.keys(equippedSlots).some(k => equippedSlots[k] === itemId);
        if (worn) { alert('«' + item.name + '» надет(а) — сначала сними, потом предлагай.'); return; }
        const d = tradeDraft.items.find(i => i.itemId === itemId);
        const already = d ? d.qty : 0;
        const free = item.count - already;
        if (free <= 0) { alert('У тебя больше нет «' + item.name + '».'); return; }
        if (qtyArg === undefined && free > 1) {
            askQuantity({ title: 'Передать: ' + item.name, note: 'У тебя: ' + item.count + (already ? ' · уже в предложении: ' + already : ''),
                max: free, def: 1, okText: 'В предложение',
                onOk: n => window.tradeItemToPlayer(itemId, n) });
            return;
        }
        const add = Math.max(1, Math.min(free, parseInt(qtyArg) || 1));
        if (d) d.qty += add; else tradeDraft.items.push({ itemId, qty: add });
        renderTradeDraft();
        const box = document.getElementById('trade-draft'); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
    };
    window.tradeDraftRemove = function (itemId) {
        const d = tradeDraft.items.find(i => i.itemId === itemId); if (!d) return;
        d.qty--; if (d.qty <= 0) tradeDraft.items = tradeDraft.items.filter(i => i.itemId !== itemId);
        renderTradeDraft();
    };
    function renderTradeDraft() {
        const box = document.getElementById('trade-draft'); if (!box) return;
        // выкидываем то, чего уже нет в инвентаре
        tradeDraft.items = tradeDraft.items.filter(d => { const it = playerInventory.find(i => i.itemId === d.itemId); if (!it) return false; d.qty = Math.min(d.qty, it.count); return d.qty > 0; });
        box.innerHTML = tradeDraft.items.length ? tradeDraft.items.map(d => {
            const it = playerInventory.find(i => i.itemId === d.itemId);
            return `<div style="display:flex; gap:6px; align-items:center; font-size:14px; margin-bottom:2px;"><span style="flex:1;">«${escHtml(it.name)}» × ${d.qty}</span><button type="button" style="width:auto; padding:1px 8px;" onclick="tradeDraftRemove('${jsq(d.itemId)}')">−</button></div>`;
        }).join('') : '<span style="opacity:.6; font-size:13px;">Предметов нет — нажми «→» у вещи в инвентаре ниже.</span>';
    }

    // ---- отправка ----
    window.sendTradeOffer = function () {
        const resultEl = document.getElementById('trade-result');
        const say = (t, ok) => { resultEl.innerHTML = '<span style="color:' + (ok ? '#2ecc71' : '#e74c3c') + ';">' + escHtml(t) + '</span>'; };
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const myUid = tradeMyUid();
        const to = document.getElementById('trade-target-select').value;
        if (!session || !myUid) { say('Обмен работает только внутри активной сессии.'); return; }
        if (!to) { say('Выбери, с кем меняешься.'); return; }
        const giveGold = Math.max(0, parseInt(document.getElementById('trade-gold-amount').value) || 0);
        const wantGold = Math.max(0, parseInt(document.getElementById('trade-want-gold').value) || 0);
        const note = (document.getElementById('trade-want-note').value || '').trim().slice(0, 200);
        if (!tradeDraft.items.length && !giveGold) { say('Добавь в предложение предмет или золото.'); return; }
        if (giveGold > tradeGoldNow()) { say('У тебя нет столько золота.'); return; }
        const items = [];
        for (const d of tradeDraft.items) {
            const it = playerInventory.find(i => i.itemId === d.itemId);
            if (!it || it.count < d.qty) { say('Предмета «' + (it ? it.name : d.itemId) + '» не хватает.'); return; }
            items.push(Object.assign(tradeClone(it), { count: d.qty }));
        }
        const id = 't' + Date.now() + Math.random().toString(36).slice(2, 6);
        const toName = ((session.participants || {})[to] || {}).name || '?';
        const trade = { id, from: myUid, fromName: tradeName(), to, toName, give: { items, gold: giveGold }, want: { gold: wantGold, note }, status: 'pending', ts: Date.now() };
        // залог: убираем предметы/золото у себя сразу
        tradeDraft.items.forEach(d => removeFromInventoryByName(d.itemId, d.qty));
        if (giveGold) tradeSetGold(tradeGoldNow() - giveGold);
        tradesDone[id + ':escrow'] = 1;
        refreshInventoryViews();
        saveLocalStorage(true);
        window.CloudSync.createTrade(id, trade).then(() => {
            say('📨 Предложение отправлено игроку ' + toName + ': отдаёшь ' + (tradeOfferText(trade.give) || '—') + (wantGold || note ? ', просишь ' + [wantGold ? wantGold + ' зол.' : '', note].filter(Boolean).join(' · ') : '') + '. Пока он не ответит, вещи лежат в предложении; отменить можно в любой момент.', true);
            tradeLog('🤝 ' + tradeName() + ' предлагает ' + toName + ' обмен: отдаёт ' + tradeOfferText(trade.give) + (wantGold ? ', хочет ' + wantGold + ' зол.' : '') + (note ? ' («' + note + '»)' : '') + '.');
            tradeDraft = { items: [], gold: 0 };
            document.getElementById('trade-gold-amount').value = 0; document.getElementById('trade-want-gold').value = 0; document.getElementById('trade-want-note').value = '';
            renderTradeDraft();
        }).catch(e => { // не вышло — возвращаем залог
            trade.give.items.forEach(tradeAddItemToMe);
            if (giveGold) tradeSetGold(tradeGoldNow() + giveGold);
            delete tradesDone[id + ':escrow'];
            saveLocalStorage(true);
            say('Не удалось отправить: ' + e.message);
        });
    };

    // ---- ответы ----
    window.acceptTrade = function (id) {
        const t = _lastTrades[id]; if (!t || t.to !== tradeMyUid() || t.status !== 'pending') return;
        // Золото под другие уже принятые, но ещё не применённые обмены считается занятым — иначе можно принять два
        // обмена на одни и те же деньги (второй списывал бы меньше, а отправитель получал полную сумму).
        let reserved = 0;
        Object.keys(_lastTrades || {}).forEach(k => { const o = _lastTrades[k]; if (o && o.id !== id && o.to === tradeMyUid() && o.status === 'accepted' && !o.toApplied && !tradesDone[k + ':to']) reserved += (o.want && o.want.gold) || 0; });
        if ((t.want.gold || 0) > tradeGoldNow() - reserved) { alert('У тебя не хватает золота: просят ' + t.want.gold + (reserved ? ' (ещё ' + reserved + ' занято под другие принятые обмены)' : '') + '.'); return; }
        window.CloudSync.respondTrade(id, ['pending'], 'accepted').then(() => {
            tradeLog('🤝 ' + tradeName() + ' принял(а) обмен от ' + t.fromName + '.');
        }).catch(e => alert(e.message));
    };
    window.declineTrade = function (id) {
        const t = _lastTrades[id]; if (!t || t.to !== tradeMyUid()) return;
        window.CloudSync.respondTrade(id, ['pending'], 'declined').then(() => tradeLog('🤝 ' + tradeName() + ' отклонил(а) обмен от ' + t.fromName + '.')).catch(e => alert(e.message));
    };
    window.cancelTrade = function (id) {
        const t = _lastTrades[id]; if (!t || t.from !== tradeMyUid()) return;
        window.CloudSync.respondTrade(id, ['pending'], 'cancelled').then(() => tradeLog('🤝 ' + tradeName() + ' отменил(а) своё предложение обмена.')).catch(e => alert(e.message));
    };

    // ---- применение (каждая сторона один раз) ----
    window.processTrades = function (trades, force) {
        trades = trades || {};
        _lastTrades = trades;
        const myUid = tradeMyUid();
        if (!myUid) return;
        const ready = force || tradesReady || (window.CloudSync && window.CloudSync.isDataReady && window.CloudSync.isDataReady());
        if (ready) {
            let changed = false;
            const msgs = [];
            Object.keys(trades).forEach(id => {
                const t = trades[id]; if (!t) return;
                const kFrom = id + ':from', kTo = id + ':to';
                if (t.from === myUid && !tradesDone[kFrom] && !t.fromApplied) {
                    if (t.status === 'accepted') {
                        tradesDone[kFrom] = 1; changed = true;
                        if (t.want.gold) tradeSetGold(tradeGoldNow() + t.want.gold);
                        msgs.push('✅ ' + t.toName + ' принял(а) твой обмен' + (t.want.gold ? ': получено ' + t.want.gold + ' зол.' : '') + '.');
                        window.CloudSync.flagTrade(id, 'fromApplied').catch(() => { });
                    } else if (t.status === 'declined' || t.status === 'cancelled') {
                        tradesDone[kFrom] = 1; changed = true;
                        (t.give.items || []).forEach(tradeAddItemToMe);
                        if (t.give.gold) tradeSetGold(tradeGoldNow() + t.give.gold);
                        msgs.push((t.status === 'declined' ? '❌ ' + t.toName + ' отклонил(а) обмен' : '↩️ Обмен отменён') + ' — вещи и золото вернулись к тебе.');
                        window.CloudSync.flagTrade(id, 'fromApplied').catch(() => { });
                    }
                }
                if (t.to === myUid && t.status === 'accepted' && !tradesDone[kTo] && !t.toApplied) {
                    tradesDone[kTo] = 1; changed = true;
                    (t.give.items || []).forEach(tradeAddItemToMe);
                    tradeSetGold(tradeGoldNow() + (t.give.gold || 0) - Math.min(tradeGoldNow() + (t.give.gold || 0), t.want.gold || 0));
                    msgs.push('🎁 Обмен с ' + t.fromName + ' завершён: получено ' + (tradeOfferText(t.give) || '—') + (t.want.gold ? ', отдано ' + t.want.gold + ' зол.' : '') + '.');
                    window.CloudSync.flagTrade(id, 'toApplied').catch(() => { });
                }
            });
            if (changed) { refreshInventoryViews(); updateAll(); saveLocalStorage(true); }
            if (msgs.length) setTimeout(() => alert(msgs.join('\n')), 50);
            // уборка: когда обе стороны применили итог — запись удаляем
            Object.keys(trades).forEach(id => {
                const t = trades[id]; if (!t || t.status === 'pending') return;
                if (t.from !== myUid && t.to !== myUid) return;
                const needTo = t.status === 'accepted';
                const fromOk = t.fromApplied || (t.from === myUid && tradesDone[id + ':from']);
                const toOk = !needTo || t.toApplied || (t.to === myUid && tradesDone[id + ':to']);
                if (fromOk && toOk) window.CloudSync.deleteTrade(id).catch(() => { });
            });
        }
        renderTradePanel();
    };

    function renderTradePanel() {
        const myUid = tradeMyUid();
        const inc = document.getElementById('trade-incoming'), out = document.getElementById('trade-outgoing');
        const btn = document.getElementById('tab5-btn'), toast = document.getElementById('trade-toast');
        const list = Object.values(_lastTrades || {}).filter(t => t && (t.from === myUid || t.to === myUid)).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const incoming = list.filter(t => t.to === myUid && t.status === 'pending');
        const outgoing = list.filter(t => t.from === myUid);
        if (inc) inc.innerHTML = incoming.length ? incoming.map(t => `<div style="border:1px solid var(--accent-color); border-radius:4px; padding:6px 8px; margin-bottom:6px;">
            <b>${escHtml(t.fromName)}</b> предлагает обмен:<br>
            <span style="font-size:14px;">Отдаёт: <b>${escHtml(tradeOfferText(t.give) || '—')}</b></span><br>
            <span style="font-size:14px;">Хочет взамен: <b>${escHtml([t.want.gold ? formatNumber(t.want.gold) + ' зол.' : '', t.want.note || ''].filter(Boolean).join(' · ') || 'ничего')}</b></span>
            ${(t.want.gold || 0) > tradeGoldNow() ? '<div style="color:#e74c3c; font-size:12px;">У тебя не хватает золота.</div>' : ''}
            <div style="display:flex; gap:6px; margin-top:4px;"><button class="btn-success" onclick="acceptTrade('${jsq(t.id)}')" ${(t.want.gold || 0) > tradeGoldNow() ? 'disabled' : ''}>✅ Принять</button><button class="btn-danger" onclick="declineTrade('${jsq(t.id)}')">❌ Отклонить</button></div></div>`).join('')
            : '<span style="opacity:.6; font-size:13px;">Входящих предложений нет.</span>';
        if (out) out.innerHTML = outgoing.length ? outgoing.map(t => `<div style="font-size:13px; margin-bottom:4px;">→ <b>${escHtml(t.toName)}</b>: отдаю ${escHtml(tradeOfferText(t.give) || '—')}${t.want.gold || t.want.note ? '; прошу ' + escHtml([t.want.gold ? t.want.gold + ' зол.' : '', t.want.note || ''].filter(Boolean).join(' · ')) : ''} — <i>${TRADE_STATUS_RU[t.status] || t.status}</i>
            ${t.status === 'pending' ? ` <button type="button" style="width:auto; padding:1px 8px; font-size:12px;" onclick="cancelTrade('${jsq(t.id)}')">Отменить</button>` : ''}</div>`).join('')
            : '<span style="opacity:.6; font-size:13px;">Исходящих нет.</span>';
        const hasIn = incoming.length > 0;
        if (btn) btn.textContent = hasIn && !btn.classList.contains('active') ? 'Инвентарь и квесты ●' : 'Инвентарь и квесты';
        if (toast) {
            toast.style.display = hasIn ? 'block' : 'none';
            toast.textContent = hasIn ? '🤝 ' + incoming[0].fromName + ' предлагает обмен — открыть' : '';
        }
    }
    window.openTradePanel = function () { const b = document.getElementById('tab5-btn'); if (b) b.click(); setTimeout(() => { const p = document.getElementById('trade-incoming'); if (p && p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); };

    window.renderAttackTargetSelect = function () {
        const select = document.getElementById('attack-target-select');
        if (!select) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const enemies = (session && session.enemies) || [];
        const alive = enemies.filter(e => (e.curHp || 0) > 0);
        const prev = select.value;
        // 🎯 — цель, помеченная мастером (session.markedTarget); у каждой цели — её резисты (раньше игрок узнавал их только после удара)
        const marked = session && session.markedTarget && alive.some(e => e.id === session.markedTarget) ? session.markedTarget : null;
        select.innerHTML = alive.length
            ? alive.map(e => `<option value="${escHtml(e.id)}">${marked === e.id ? '🎯 ' : ''}${escHtml(e.name)} (HP ${e.curHp}/${e.maxHp})${window.StCombat && window.StCombat.resistSummary(e) ? ' ' + escHtml(window.StCombat.resistSummary(e)) : ''}</option>`).join('')
            : '<option value="">Нет активных целей (зайди в сессию мастера на вкладке «Сессия»)</option>';
        if (alive.some(e => e.id === prev)) select.value = prev;
        else if (marked) select.value = marked;
        try { gridAnnotateTargets(); } catch (e) { }
        if (typeof updateCombatDock === 'function') updateCombatDock();
    };


    // ========================================================================
    // СУНДУК ОТРЯДА (эпик 2.1): общий склад группы в документе сессии. Любой игрок может класть и брать; в журнале видно, кто что взял.
    // ========================================================================
    function stashMyName() { return (document.getElementById('char-name') || {}).value || 'Игрок'; }
    let _stashMinInit = false;
    function stashApplyMin(min) {
        const box = document.getElementById('party-stash-box'); if (!box) return;
        box.classList.toggle('st-stash-min', min);
        const b = document.getElementById('stash-min-toggle'); if (b) b.textContent = min ? '⬇ Развернуть' : '⬆ Свернуть';
    }
    window.stashToggleMin = function () {
        const box = document.getElementById('party-stash-box'); if (!box) return;
        const min = !box.classList.contains('st-stash-min');
        stashApplyMin(min);
        try { localStorage.setItem('skyrim_stash_min', min ? '1' : ''); } catch (e) { }
    };
    window.renderPartyStash = function (session) {
        const box = document.getElementById('party-stash-box'); if (!box) return;
        const s = session || (window.CloudSync && window.CloudSync.getSessionData());
        const inS = !!(window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && s);
        box.style.display = inS ? 'block' : 'none';
        if (!inS) return;
        if (!_stashMinInit) { _stashMinInit = true; let m = false; try { m = localStorage.getItem('skyrim_stash_min') === '1'; } catch (e) { } stashApplyMin(m); }
        const gold = parseInt(s.partyGold) || 0;
        const g = document.getElementById('party-stash-gold'); if (g) g.textContent = formatNumber(gold);
        const list = document.getElementById('party-stash-list');
        const allStash = Array.isArray(s.partyStash) ? window.CloudSync._mergeStash(s.partyStash) : [];
        const mini = document.getElementById('party-stash-mini');
        if (mini) mini.textContent = `💰 ${formatNumber(gold)} · 📦 ${allStash.reduce((n, it) => n + (parseInt(it.count) || 1), 0)}`;
        const stCat = (document.getElementById('stash-category-filter') || {}).value || 'all';
        const stQ = String((document.getElementById('stash-search') || {}).value || '').trim().toLowerCase().replace(/ё/g, 'е');
        const items = allStash.filter(it => (stCat === 'all' || classifyItemBroad(it) === stCat) &&
            (!stQ || String(it.name || '').toLowerCase().replace(/ё/g, 'е').indexOf(stQ) !== -1))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
        const stCnt = document.getElementById('stash-filter-count');
        if (stCnt) stCnt.textContent = (stCat !== 'all' || stQ) ? `Показано ${items.length} из ${allStash.length}` : '';
        if (list && allStash.length && !items.length) { list.innerHTML = '<p style="opacity:.6; font-size:13px; margin:2px 0;">По этому фильтру ничего не найдено.</p>'; return; }
        if (list) list.innerHTML = items.length ? items.map(i => `<div class="stat-block" style="align-items:center;">
            <span><strong>${escHtml(i.name)}</strong> × ${i.count}${i.effect ? `<br><span style="font-size:12px; color:#8a8171;">${escHtml(String(i.effect).slice(0, 90))}</span>` : ''}</span>
            <button style="width:auto; padding:2px 8px; font-size:13px;" onclick="partyStashTake('${jsq(i.itemId)}')">→ Себе</button></div>`).join('')
            : '<p style="opacity:.6; font-size:13px; margin:2px 0;">Сундук пуст.</p>';
    };
    window.partyStashPut = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item) return;
        const worn = Object.keys(equippedSlots).some(k => equippedSlots[k] === itemId);
        if (worn) { alert('«' + item.name + '» надет(а) — сначала сними.'); return; }
        const doPut = n => {
            // Сначала списываем у себя (синхронно), потом пишем в сундук; при ошибке возвращаем.
            // Раньше списание шло ПОСЛЕ ответа сервера — двойной клик клал в сундук две штуки из одной.
            const cur = playerInventory.find(i => i.itemId === itemId);
            n = Math.max(1, Math.floor(n) || 1);
            if (!cur || cur.count < n) { alchToast('Столько у тебя уже нет.'); return; }
            const snapshot = JSON.parse(JSON.stringify(cur));
            adjustInventoryQty(itemId, -n); saveLocalStorage();
            window.CloudSync.stashItem(snapshot, n, stashMyName()).then(() => {
                alchToast('🎒 В сундук: ' + escHtml(snapshot.name) + (n > 1 ? ' ×' + n : ''));
            }).catch(e => {
                const extra = Object.assign({}, snapshot); ['itemId', 'name', 'count', 'weight', 'category', 'effect'].forEach(k => delete extra[k]);
                addToInventory(snapshot.itemId, snapshot.name, n, snapshot.weight, snapshot.category, snapshot.effect, extra); saveLocalStorage();
                alert('Не удалось положить: ' + e.message);
            });
        };
        if (item.count > 1) askQuantity({ title: 'В сундук: ' + item.name, note: 'У тебя: ' + item.count, max: item.count, def: item.count, okText: 'Положить', onOk: doPut });
        else doPut(1);
    };
    window.partyStashTake = function (itemId) {
        const s = window.CloudSync.getSessionData();
        const it = window.CloudSync._mergeStash((s && s.partyStash) || []).find(i => i.itemId === itemId);
        if (!it) { alchToast('Этого уже нет в сундуке.'); return; }
        const doTake = n => {
            window.CloudSync.takeFromStash(itemId, n, stashMyName()).then(taken => {
                const extra = Object.assign({}, taken); ['itemId', 'name', 'count', 'weight', 'category', 'effect'].forEach(k => delete extra[k]);
                addToInventory(taken.itemId, taken.name, n, taken.weight, taken.category, taken.effect, extra);
                saveLocalStorage();
                alchToast('🎒 Взято: ' + escHtml(taken.name) + (n > 1 ? ' ×' + n : ''));
            }).catch(e => alert(e.message));
        };
        if (it.count > 1) askQuantity({ title: 'Взять из сундука: ' + it.name, note: 'В сундуке: ' + it.count, max: it.count, def: 1, okText: 'Взять', onOk: doTake });
        else doTake(1);
    };
    // sign = +1 положить / −1 взять сумму из поля
    window.partyStashGold = function (sign) {
        const n = Math.max(1, parseInt((document.getElementById('party-stash-gold-input') || {}).value) || 0);
        const goldEl = document.getElementById('char-gold');
        const mine = parseInt(goldEl.value) || 0;
        if (sign > 0 && n > mine) { alert('У тебя только ' + mine + ' золота.'); return; }
        // Кладём: списываем сразу (двойной клик раньше удваивал золото в сундуке), при ошибке возвращаем.
        if (sign > 0) { goldEl.value = mine - n; updateAll(); saveLocalStorage(true); }
        window.CloudSync.changeStashGold(sign * n, stashMyName()).then(() => {
            if (sign < 0) { goldEl.value = (parseInt(goldEl.value) || 0) + n; updateAll(); saveLocalStorage(true); }
        }).catch(e => {
            if (sign > 0) { goldEl.value = (parseInt(goldEl.value) || 0) + n; updateAll(); saveLocalStorage(true); }
            alert(e.message);
        });
    };

    // ========================================================================
    // БОЕВОЙ ДОК (эпик 1.1): HP/MP, быстрые действия, эффекты. Показывается, пока игрок в сессии.
    // Всё остальное (бросок, расчёт, применение) — прежние функции: док только подводит к ним, ничего не дублирует.
    // ========================================================================
    function dockInSession() { return !!(window.CloudSync && typeof window.CloudSync.isInSession === 'function' && window.CloudSync.isInSession() && window.CloudSync.getSessionData()); }
    function dockMarkedAlive() {
        const s = window.CloudSync && window.CloudSync.getSessionData && window.CloudSync.getSessionData();
        if (!s || !s.markedTarget) return null;
        return (s.enemies || []).find(e => e.id === s.markedTarget && (e.curHp || 0) > 0) || null;
    }
    window.updateCombatDock = function () {
        const dock = document.getElementById('combat-dock');
        if (!dock) return;
        const on = dockInSession();
        dock.style.display = on ? 'flex' : 'none';
        document.body.classList.toggle('st-dock-on', on);
        if (!on) { document.body.style.removeProperty('--st-dock-h'); return; }
        const val = id => parseInt((document.getElementById(id) || {}).value) || 0;
        const hp = val('cur-hp'), maxHp = val('max-hp'), mp = val('cur-mp'), maxMp = val('max-mp');
        const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
        const nm = (document.getElementById('char-name') || {}).value || '?';
        const por = document.getElementById('dock-portrait'); if (por) por.textContent = playerPortraitThumb ? '' : nm.charAt(0).toUpperCase();
        const vit = document.getElementById('dock-vitals');
        if (vit) vit.innerHTML = `<div><strong>${escHtml(nm)}</strong> <span class="st-dock-turn">· Ход ${gameTurn} · Круг ${gameRound}</span></div>` +
            `<div>❤ ${hp}/${maxHp}</div><div class="bar-track"><div class="bar-fill-hp" style="width:${pct(hp, maxHp)}%"></div></div>` +
            `<div>🔷 ${mp}/${maxMp}</div><div class="bar-track"><div class="bar-fill-mp" style="width:${pct(mp, maxMp)}%"></div></div>`;
        const mini = document.getElementById('dock-mini-vitals');
        if (mini) mini.innerHTML = `❤ ${hp}/${maxHp} · 🔷 ${mp}/${maxMp} <span class="st-dock-turn">· Ход ${gameTurn} · Круг ${gameRound}</span>`;
        const eff = document.getElementById('dock-effects');
        if (eff) {
            const list = (activeTimedEffects || []).filter(e => e.turnsRemaining > 0 || e.turnsRemaining === Infinity);
            const label = e => (e.turnsRemaining === Infinity ? '∞' : e.turnsRemaining + 'х');
            eff.innerHTML = list.length
                ? list.slice(0, 6).map(e => `<span class="st-dock-eff${e.concentration ? ' st-conc' : ''}" title="${escHtml(e.description || '')}">${e.concentration ? '🧠 ' : ''}${escHtml(e.effectName || e.name)} · ${label(e)}</span>`).join('') + (list.length > 6 ? `<span class="st-dock-eff">+${list.length - 6}</span>` : '')
                : '<span style="opacity:.55; font-size:12px;">Нет активных эффектов</span>';
        }
        const mk = document.getElementById('dock-marked-btn'), mt = dockMarkedAlive();
        if (mk) { mk.style.display = mt ? '' : 'none'; if (mt) mk.textContent = '🎯 Атаковать: ' + String(mt.name).slice(0, 18); }
        try { dockRenderInfo(); } catch (e) { console.error('dock info', e); }
        const fav = document.getElementById('dock-fav-spells');
        const enhOkFav = sp => { try { return !cardEnhancedReason(sp.id); } catch (e) { return false; } };
        if (fav) fav.innerHTML = (customSpells || []).filter(s => s.favorite && s.name).slice(0, 3).map(s => `<button type="button" class="btn-success" onclick="castCustomSpell('${jsq(s.id)}', false)" title="Избранное: ${escHtml(s.name)}">★ ${escHtml(s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name)}</button>` + (enhOkFav(s) ? `<button type="button" class="btn-success" style="background:#7a4e2c;" onclick="castCustomSpell('${jsq(s.id)}', true)" title="Усиленный каст «${escHtml(s.name)}»">⚡</button>` : '')).join('');
        // чтобы док не перекрывал нижние элементы страницы — отступ равен его реальной высоте
        document.body.style.setProperty('--st-dock-h', dock.offsetHeight + 'px');
        // Высота дока меняется и без вызова этой функции (поворот экрана, перенос строк, сводка дорисовалась) —
        // следим за ней, иначе отступ оставался от прошлого, меньшего размера, и низ вкладки уходил под док.
        if (!dock._stResizeObs && typeof ResizeObserver === 'function') {
            dock._stResizeObs = new ResizeObserver(() => { if (document.body.classList.contains('st-dock-on')) document.body.style.setProperty('--st-dock-h', dock.offsetHeight + 'px'); });
            dock._stResizeObs.observe(dock);
        }
    };
    // ---- Сводка в доке: чтобы в бою не прыгать по вкладкам ----
    const DOCK_RES_ICONS = [['physical', '🛡', 'Физ.'], ['fire', '🔥', 'Огонь'], ['frost', '❄', 'Холод'], ['shock', '⚡', 'Электр.'], ['poison', '☠', 'Яд'], ['disease', '🦠', 'Болезни'], ['magic', '✨', 'Магия'], ['shout', '🗣', 'Крики']];
    // переключатели = зеркала чекбоксов боевой вкладки (меняем исходный чекбокс и шлём change — вся логика остаётся прежней)
    const DOCK_TOGGLES = [
        { id: 'chk-power-attack', label: '💪 Силовая', title: 'Силовая атака: урон ББ ×1.5, −1 к броску d20' },
        { id: 'chk-sneak-attack', label: '🌑 Скрытная', title: 'Скрытная атака из тени: крит ×2 (кинжалы ×3)' },
        { id: 'chk-defensive-stance', label: '🛡 Стойка', title: 'Защитная стойка: щит даёт бонусы перков блокирования' },
        { id: 'chk-dual-wield', label: '⚔ Два оружия', title: 'Бой двумя одноручными (нужны перки)', when: () => (parseInt((document.getElementById('wep-melee-offhand-dmg') || {}).value) || 0) > 0 || document.getElementById('chk-dual-wield').checked },
        { id: 'chk-sprint-attack', label: '🏃 Рывок', title: 'Рывок-атака (перки «Рывок»/«Великий рывок»)', when: () => { const pb = window.perkBonuses || {}; return !!(pb.oneHandSprintDouble || pb.twoHandSprintDouble || document.getElementById('chk-sprint-attack').checked); } },
        { id: 'chk-bow-drawn', label: '🏹 Тетива', title: 'Тетива натянута: +1 к попаданию из лука, скорость −15 (с «Егерем» — без штрафа)', when: () => ((document.getElementById('wep-ranged-type') || {}).value === 'bow' && (parseInt((document.getElementById('wep-ranged-dmg') || {}).value) || 0) > 0) || document.getElementById('chk-bow-drawn').checked },
        { id: 'chk-enhanced-cast', label: '✨ Усил. каст', title: 'Усиленный каст выбранного в бою заклинания' }
    ];
    window.dockFlip = function (id) {
        const c = document.getElementById(id); if (!c || c.disabled) return;
        c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof updateCombatDock === 'function') updateCombatDock();
    };
    window.dockToggleInfo = function () {
        const dock = document.getElementById('combat-dock'); if (!dock) return;
        const off = !dock.classList.contains('st-dock-info-off');
        dock.classList.toggle('st-dock-info-off', off);
        try { localStorage.setItem('skyrim_dock_info_off', off ? '1' : ''); } catch (e) { }
        const b = document.getElementById('dock-info-toggle'); if (b) b.textContent = off ? '▸ Сводка' : '▾';
        document.body.style.setProperty('--st-dock-h', dock.offsetHeight + 'px');
    };
    // Свернуть весь док в одну строку (на телефоне он занимает треть экрана, а нужен не всегда)
    window.dockToggleMin = function () {
        const dock = document.getElementById('combat-dock'); if (!dock) return;
        const min = !dock.classList.contains('st-dock-min');
        dock.classList.toggle('st-dock-min', min);
        try { localStorage.setItem('skyrim_dock_min', min ? '1' : ''); } catch (e) { }
        document.body.style.setProperty('--st-dock-h', dock.offsetHeight + 'px');
    };
    let _dockInfoInit = false;
    function dockRenderInfo() {
        const dock = document.getElementById('combat-dock'); if (!dock) return;
        if (!_dockInfoInit) {
            _dockInfoInit = true;
            let off = false; try { off = localStorage.getItem('skyrim_dock_info_off') === '1'; } catch (e) { }
            if (off) { dock.classList.add('st-dock-info-off'); const b = document.getElementById('dock-info-toggle'); if (b) b.textContent = '▸ Сводка'; }
            let min = false; try { min = localStorage.getItem('skyrim_dock_min') === '1'; } catch (e) { }
            if (min) dock.classList.add('st-dock-min');
            const g = document.getElementById('char-gold'); if (g) g.addEventListener('input', () => updateCombatDock());
        }
        const v = id => (document.getElementById(id) || {}).value;
        const txt = id => ((document.getElementById(id) || {}).textContent || '').trim();
        const chip = (icon, val, title, cls) => `<span class="st-dock-chip${cls ? ' ' + cls : ''}" title="${escHtml(title)}">${icon} ${escHtml(String(val))}</span>`;
        const parts = [];
        parts.push(chip('💰', formatNumber(parseInt(v('char-gold')) || 0), 'Золото'));
        parts.push(chip('🛡', txt('armor-total') || '0', 'Класс брони (с баффами)'));
        parts.push(chip('🏃', (parseInt(v('val-speed')) || 0) + ' фт', 'Скорость за ход'));
        const wc = parseFloat(txt('weight-current')) || 0, wm = parseFloat(txt('weight-max-display')) || 0;
        parts.push(chip('⚖', (Math.round(wc * 10) / 10) + '/' + wm, wc > wm ? 'Перегруз! Скорость и действия ограничены' : 'Вес / грузоподъёмность', wc > wm ? 'st-dock-bad' : ''));
        const mel = String(v('wep-melee-name') || '').trim(), rng = String(v('wep-ranged-name') || '').trim();
        const dmg = parseInt(v('main-panel-dmg')) || 0;
        if (mel) parts.push(chip('🗡', (mel.length > 18 ? mel.slice(0, 17) + '…' : mel) + ' · ' + dmg, 'Ближнее оружие · итоговый урон ' + dmg));
        if (rng) parts.push(chip('🏹', (rng.length > 18 ? rng.slice(0, 17) + '…' : rng) + ' · ' + (parseInt(v('wep-ranged-dmg')) || 0), 'Дальнее оружие · базовый урон'));
        if (typeof weaponPoison !== 'undefined' && weaponPoison) parts.push(chip('☠', 'яд на оружии', 'На оружии: ' + weaponPoison.name, 'st-dock-good'));
        let res = null; try { res = computeTotalResistances(); } catch (e) { }
        if (res) {
            const r = DOCK_RES_ICONS.filter(([k]) => res[k]).map(([k, ic, nm]) => `<span class="${res[k] < 0 ? 'st-dock-bad' : ''}" title="${nm}: ${res[k]}%">${ic}${res[k]}%</span>`);
            if (r.length) parts.push(`<span class="st-dock-chip st-dock-res" title="Сопротивления (отрицательные — уязвимость)">${r.join(' ')}</span>`);
        }
        { // погода — что сейчас мешает/помогает
            const sw = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
            const wk = sw && sw.currentWeather;
            if (wk && wk !== 'clear' && typeof WEATHER_TYPES !== 'undefined' && WEATHER_TYPES[wk]) parts.unshift(chip('', WEATHER_TYPES[wk].name, WEATHER_TYPES[wk].effect || 'Без штрафов'));
        }
        const st = document.getElementById('dock-stats'); if (st) st.innerHTML = parts.join('');
        const tg = document.getElementById('dock-toggles');
        if (tg) tg.innerHTML = DOCK_TOGGLES.map(t => {
            const c = document.getElementById(t.id); if (!c) return '';
            if (t.when && !t.when()) return '';
            if (t.id === 'chk-enhanced-cast' && c.disabled) return `<span class="st-dock-tg st-dock-tg-off" title="${escHtml(c.title || 'Сейчас недоступен')}">${t.label}</span>`;
            return `<button type="button" class="st-dock-tg${c.checked ? ' on' : ''}" aria-pressed="${c.checked}" title="${escHtml(t.title)}" onclick="dockFlip('${t.id}')">${t.label}</button>`;
        }).join('');
    }
    function dockGoCombatTab() {
        const btn = document.querySelector('.tab-link[onclick*="\'tab6\'"]');
        if (btn && typeof openTab === 'function') openTab({ currentTarget: btn }, 'tab6');
    }
    function dockFlash(el) {
        if (!el) return;
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
        if (el.focus) el.focus({ preventScroll: true });
        el.classList.add('st-flash');
        setTimeout(() => el.classList.remove('st-flash'), 1500);
    }
    window.dockAttack = function () { dockGoCombatTab(); dockFlash(document.getElementById('attack-target-select')); };
    window.dockAttackMarked = function () {
        const mt = dockMarkedAlive();
        if (!mt) { alchToast('Помеченной цели нет (или она уже убита).'); return; }
        dockGoCombatTab();
        const sel = document.getElementById('attack-target-select');
        if (sel) { sel.value = mt.id; dockFlash(sel); }
    };
    // единое модальное окно дока (список предметов / заклинаний)
    function dockOpenModal(id, title, bodyHtml) {
        dockCloseModal();
        const ov = document.createElement('div');
        ov.id = id; ov.className = 'st-dock-modal';
        ov.innerHTML = `<div class="st-dock-modal-box"><h3>${escHtml(title)}</h3>${bodyHtml}<button type="button" style="width:100%; margin-top:10px;" onclick="dockCloseModal()">Закрыть</button></div>`;
        ov.addEventListener('click', e => { if (e.target === ov) dockCloseModal(); });
        document.body.appendChild(ov);
    }
    window.dockCloseModal = function () { document.querySelectorAll('.st-dock-modal').forEach(m => m.remove()); };
    window.dockUseItem = function () {
        const potions = playerInventory.filter(i => potionKindOf(i) === 'potion' && i.count > 0).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
        dockOpenModal('dock-item-modal', '🧪 Зелье', potions.length
            ? potions.map(i => `<button type="button" class="st-dock-pick" onclick="dockPickItem('${jsq(i.itemId)}')">${escHtml(i.name)} ×${i.count}<br><span style="font-size:12px; opacity:.7;">${escHtml(String(i.effect || '').slice(0, 80))}</span></button>`).join('')
            : '<p style="opacity:.7;">Зелий в инвентаре нет.</p>');
    };
    window.dockPickItem = function (itemId) { dockCloseModal(); useInventoryItem(itemId); };
    window.dockCastSpell = function () {
        const all = (customSpells || []).filter(s => s.name);
        // «боевые» — те, у кого считается урон или есть управляющий эффект; избранные показываем всегда и первыми
        const isCombat = s => { let d = null; try { d = parseSpellDamageFromDesc(s.desc, false); } catch (e) { } return !!d || !!(typeof PLAYER_CONTROL_SPELLS !== 'undefined' && PLAYER_CONTROL_SPELLS[s.name]); };
        const costOf = s => { const c = document.getElementById('card-' + s.id), f = c && c.querySelector('.spell-final-cost'); return (f && f.value) || s.baseCost || 0; };
        const enhOk = s => { try { return !cardEnhancedReason(s.id); } catch (e) { return false; } };
        const btn = (s, big) => {
            const base = `<button type="button" class="st-dock-pick${big ? ' btn-success' : ''}" style="flex:1; margin:0;" onclick="dockPickSpell('${jsq(s.id)}', false)">${s.favorite ? '★ ' : ''}${escHtml(s.name)} <span style="opacity:.7; font-size:12px;">— ${escHtml(costOf(s))} МП</span></button>`;
            if (!enhOk(s)) return `<div style="display:flex; gap:6px; margin-bottom:6px;">${base}</div>`;
            let fct = 2; try { const inf = spellCardInfo(s.id); fct = getEnhancedCostFactor(inf && inf.school, s.name); } catch (e) { } const c2 = Math.round((parseFloat(costOf(s)) || 0) * fct);
            return `<div style="display:flex; gap:6px; margin-bottom:6px;">${base}<button type="button" class="st-dock-pick" style="flex:0 0 auto; margin:0; background:#7a4e2c; color:#fff;" onclick="dockPickSpell('${jsq(s.id)}', true)" title="Усиленный каст: больше маны, «Усиленный эффект» из описания">⚡ Усилен. <span style="font-size:12px; opacity:.85;">${c2} МП</span></button></div>`;
        };
        const fav = all.filter(s => s.favorite), combat = all.filter(s => !s.favorite && isCombat(s)), rest = all.filter(s => !s.favorite && !isCombat(s));
        let html = '';
        if (fav.length) html += '<div class="st-dock-sub">★ Избранные</div>' + fav.map(s => btn(s, true)).join('');
        if (combat.length) html += '<div class="st-dock-sub">Боевые</div>' + combat.map(s => btn(s)).join('');
        if (rest.length) html += `<details><summary class="st-dock-sub" style="cursor:pointer;">Остальные (${rest.length})</summary>${rest.map(s => btn(s)).join('')}</details>`;
        dockOpenModal('dock-spell-modal', '✨ Заклинание', html || '<p style="opacity:.7;">Заклинаний нет — выучи их на вкладке «Магия».</p>');
    };
    window.dockPickSpell = function (id, enhanced) { dockCloseModal(); castCustomSpell(id, !!enhanced); };
    function dockLog(text) {
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(text.replace('{n}', nm), nm);
    }
    // Защита — просто явный сигнал в журнал (без броска): мастер решает, как это учесть
    window.dockDefend = function () { dockLog('🛡 {n} защищается.'); alchToast('🛡 Записано в журнал: ты защищаешься.'); };
    // Пропуск хода — явный сигнал мастеру. По ТЗ тикает и общий счётчик ходов (throttle в CloudSync — раз в 2 сек).
    // ВНИМАНИЕ: раньше этот счётчик двигал каждый игрок на любое «Следующий ход» и окно «поднять труп 5 ходов» сжималось — теперь его двигает мастер;
    // пропуск хода — редкое явное действие, поэтому здесь счётчик тикает по ТЗ (если снова начнёт «разгоняться» — убрать вызов ниже).
    window.dockSkipTurn = function () {
        // только сигнал в журнал: общий ход теперь переключают кнопки «След. ход/круг» (иначе пропуск листал бы ход всем)
        dockLog('⏸ {n} пропускает ход (паралич/отдых/по решению мастера).');
        alchToast('⏸ Ход пропущен — мастер увидит это в журнале.');
    };

    // Карта владений для игрока: схема + метка «партия здесь» (session.partyPos, ставит мастер).
    let playerMapHold = '';
    window.playerMapZoom = function (h) { playerMapHold = h || ''; _playerSel = null; window.renderPlayerMap(true); };
    let _playerMapSig = null;
    let _playerPlaceSel = null; // id выбранного места: открытое мастером, 'mark:<id>' (метка мастера) или 'note:<id>' (моя точка)
    let _playerMapNote = null;  // {title, sub, target:{x,y,name}} — клик по городу: расстояние от партии
    let _playerSel = null;      // точка, выбранная игроком на карте для новой личной заметки {x,y,u,v,hold}
    function playerUid() { return (window.CloudSync && window.CloudSync.getCurrentUid) ? window.CloudSync.getCurrentUid() : null; }
    // Места и метки, видимые именно этому игроку (мастер может открыть место или поставить метку лично одному игроку)
    function playerVisible(list) { const uid = playerUid(); return (Array.isArray(list) ? list : []).filter(x => !window.HoldsMap || window.HoldsMap.visibleTo(x, uid)); }
    // Любое «место» по id → единый вид {name, hold, cat, desc, x?, y?, u?, v?, toUids?, _noteId?}
    function playerFindPlace(session, id) {
        if (!id) return null;
        const p = playerVisible(session && session.openPlaces).find(x => x.id === id);
        if (p) return p;
        if (String(id).indexOf('mark:') === 0) {
            const mm = playerVisible(session && session.mapMarks).find(x => 'mark:' + x.id === id);
            if (mm) return { name: mm.name || 'Метка', hold: mm.hold || '', cat: 'Метка мастера', desc: 'Мастер отметил это место на карте.', x: mm.x, y: mm.y, u: mm.u, v: mm.v, toUids: mm.toUids };
        }
        if (String(id).indexOf('note:') === 0) {
            const nn = playerMapNotes.find(x => 'note:' + x.id === id);
            if (nn) return { name: nn.name, hold: nn.hold || '', cat: 'Моя точка', desc: nn.desc || '', x: nn.x, y: nn.y, u: nn.u, v: nn.v, _noteId: nn.id };
        }
        return null;
    }
    // Клик по месту в списке: приближаем его владение и «пингуем» ИМЕННО это место (бирюзовое кольцо с подписью).
    // Раньше карта ничего не выделяла, а заметнее всего пульсировала метка партии — казалось, что «пингуется город, где ты находишься».
    window.playerShowPlace = function (id) {
        _playerPlaceSel = id; _playerMapNote = null; _playerSel = null; _playerMapSig = null;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const p = playerFindPlace(session, id);
        if (p && typeof p.x === 'number' && p.hold && HOLDS_HAS(p.hold)) playerMapHold = p.hold;
        window.renderPlayerMap(true);
        const box = document.getElementById('player-map');
        if (box && box.scrollIntoView) { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { } }
    };
    // маршрут и расстояние от партии до точки (по дорогам между поселениями); '' — если партия не отмечена
    function playerDistText(session, target) {
        const party = window.HoldsMap && window.HoldsMap.partyFromSession(session);
        if (!party || !target || typeof target.x !== 'number') return '';
        const N = window.HoldsMap.NODES, nm = n => (n && N[n]) ? n : '';
        const r = window.HoldsMap.planRoute(Object.assign({}, party, { name: nm(party.name) }), Object.assign({}, target, { name: nm(target.name) }), session && session.mapCfg, session && session.mapSettle);
        return window.HoldsMap.describeRoute(r);
    }
    window.playerOpenPlaceHold = function (h) { _playerMapSig = null; window.playerMapZoom(h); };
    function renderOpenPlaces(session) {
        const listEl = document.getElementById('player-map-places'), infoEl = document.getElementById('player-map-place-info');
        const places = playerVisible(session && session.openPlaces);
        // метка «есть новое» на вкладке
        const sigNew = places.map(p => p.id).join(',');
        let seen = ''; try { seen = localStorage.getItem('placesSeen') || ''; } catch (e) { }
        window._placesSig = sigNew;
        const btn = document.getElementById('tab13-btn');
        if (btn) btn.textContent = (sigNew && sigNew !== seen && !btn.classList.contains('active')) ? '🗺️ Карта ●' : '🗺️ Карта';
        if (btn && btn.classList.contains('active')) window.markPlacesSeen();
        if (infoEl) {
            const p = playerFindPlace(session, _playerPlaceSel);
            const pm = (p && typeof p.x === 'number') ? playerDistText(session, { x: p.x, y: p.y, u: p.u, v: p.v, hold: p.hold, name: p.name }) : '';
            if (!p && _playerMapNote) {
                const dt = playerDistText(session, _playerMapNote.target);
                infoEl.innerHTML = `<div style="border:1px solid var(--accent-color); border-radius:4px; padding:8px 10px; margin-top:8px;">
                    <strong>${escHtml(_playerMapNote.title)}</strong> <span style="opacity:.7; font-size:13px;">· ${escHtml(_playerMapNote.sub || '')}</span>
                    <div style="font-size:14px; line-height:1.5; margin-top:4px;">${dt ? '📏 От партии: ' + escHtml(dt) : '<span style="opacity:.7;">Мастер ещё не отметил положение партии — расстояние посчитать не от чего.</span>'}</div></div>`;
            } else infoEl.innerHTML = p ? `<div style="border:1px solid var(--accent-color); border-radius:4px; padding:8px 10px; margin-top:8px;">
                <strong>${escHtml(p.name)}</strong> <span style="opacity:.7; font-size:13px;">· ${escHtml(p.hold || '')}${p.cat ? ' · ' + escHtml(p.cat) : ''}</span>
                <div style="font-size:14px; line-height:1.5; margin-top:4px; white-space:pre-wrap;">${escHtml(p.desc || 'Мастер не оставил описания.')}</div>
                ${typeof p.x !== 'number' ? '<div style="font-size:13px; margin-top:6px; opacity:.8;">📍 У этого места пока нет точки на карте — мастер её не привязал.</div>' : ''}
                ${pm ? `<div style="font-size:13px; margin-top:6px; opacity:.9;">📏 От партии: ${escHtml(pm)}</div>` : ''}
                ${p._noteId ? `<button style="width:auto; margin-top:6px; padding:3px 10px;" onclick="playerEditNote('${jsq(p._noteId)}')">✏ Переименовать</button> <button class="btn-danger" style="width:auto; margin-top:6px; padding:3px 10px;" onclick="playerDeleteNote('${jsq(p._noteId)}')">🗑 Удалить мою точку</button>` : ''}</div>` : '';
        }
        if (!listEl) return;
        if (!places.length) { listEl.innerHTML = '<p style="opacity:.65; font-size:13px;">Открытых мест пока нет — мастер добавит их по ходу игры.</p>'; return; }
        const byHold = {};
        places.forEach(p => { (byHold[p.hold || 'Без владения'] = byHold[p.hold || 'Без владения'] || []).push(p); });
        listEl.innerHTML = Object.keys(byHold).map(h => `<details open style="margin:4px 0;"><summary style="cursor:pointer; font-weight:bold;">${escHtml(h)} <span style="opacity:.6; font-weight:normal;">(${byHold[h].length})</span></summary>` +
            byHold[h].map(p => `<div style="margin:2px 0 2px 10px; font-size:14px;">
                <a href="#" style="color:var(--accent-color);" onclick="playerShowPlace('${jsq(p.id)}'); return false;">${p.x !== undefined ? '📍' : '·'} ${escHtml(p.name)}</a>
                ${Array.isArray(p.toUids) && p.toUids.length ? '<span title="Мастер открыл это место лично тебе">🔒</span>' : ''}
                ${p.cat ? '<span style="opacity:.6; font-size:12px;"> — ' + escHtml(p.cat) + '</span>' : ''}
                ${HOLDS_HAS(h) ? ` <a href="#" style="font-size:12px; opacity:.8;" onclick="playerOpenPlaceHold('${jsq(h)}'); return false;">на карте</a>` : ''}</div>`).join('') + '</details>').join('');
    }
    function HOLDS_HAS(h) { return !!(window.HoldsMap && window.HoldsMap.HOLDS && window.HoldsMap.HOLDS[h]); }
    window.markPlacesSeen = function () {
        try { localStorage.setItem('placesSeen', window._placesSig || ''); } catch (e) { }
        const btn = document.getElementById('tab13-btn'); if (btn) btn.textContent = '🗺️ Карта';
    };

    // ---------- Мои точки (личные заметки на карте) ----------
    window.playerAddNote = function () {
        if (!_playerSel) { alert('Сначала кликни по карте (приблизь владение).'); return; }
        const name = (document.getElementById('player-note-name').value || '').trim().slice(0, 60);
        if (!name) { alert('Назови точку.'); return; }
        const desc = (document.getElementById('player-note-desc').value || '').trim().slice(0, 500);
        const n = { id: 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1000), hold: _playerSel.hold || playerMapHold || '', name, desc, x: Math.round(_playerSel.x), y: Math.round(_playerSel.y), ts: Date.now() };
        if (typeof _playerSel.u === 'number' && typeof _playerSel.v === 'number') { n.u = _playerSel.u; n.v = _playerSel.v; }
        playerMapNotes.push(n);
        _playerSel = null; _playerPlaceSel = 'note:' + n.id;
        document.getElementById('player-note-name').value = ''; document.getElementById('player-note-desc').value = '';
        saveLocalStorage(true);
        window.renderPlayerMap(true);
    };
    // Эпик 4.1. Личные точки уже хранились как mapNotes (только у игрока, в сейве персонажа, другим не уходят) — отдельное поле personalPins
    // не заводил, чтобы не плодить второй список для одного и того же. Добавлено: переименование/правка описания и быстрая метка по prompt.
    window.playerEditNote = function (id) {
        const n = playerMapNotes.find(x => x.id === id); if (!n) return;
        const name = prompt('Название точки:', n.name); if (name === null) return;
        const desc = prompt('Описание:', n.desc || ''); if (desc === null) return;
        n.name = (name.trim() || n.name).slice(0, 60); n.desc = desc.trim().slice(0, 500);
        saveLocalStorage(true); window.renderPlayerMap(true);
    };
    window.playerQuickPin = function () {
        if (!_playerSel) { alert('Сначала кликни по карте (приблизь владение).'); return; }
        const name = prompt('Подпись метки:'); if (!name || !name.trim()) return;
        document.getElementById('player-note-name').value = name; document.getElementById('player-note-desc').value = '';
        window.playerAddNote();
    };
    window.playerCancelNote = function () { _playerSel = null; window.renderPlayerMap(true); };
    window.playerDeleteNote = function (id) {
        if (!confirm('Удалить эту точку?')) return;
        playerMapNotes = playerMapNotes.filter(n => n.id !== id);
        if (_playerPlaceSel === 'note:' + id) _playerPlaceSel = null;
        saveLocalStorage(true);
        window.renderPlayerMap(true);
    };
    // ---------- Эпик 4.3. «Что здесь водится»: фауна, растения и рыба выбранного владения ----------
    // Регион владения для расчётов (в сессии регион задаёт мастер, но на карте можно смотреть любое владение, поэтому берём типичный).
    const HOLD_TYPICAL_REGION = { 'Вайтран': 'Равнина', 'Винтерхолд': 'Горы', 'Рифт': 'Лес', 'Фолкрит': 'Лес', 'Солитьюд (Хаафингар)': 'Побережье', 'Хьялмарк (Морфал)': 'Болото', 'Истмарк (Виндхельм)': 'Болото', 'Белый берег (Данстар)': 'Побережье', 'Маркарт (Предел)': 'Горы', 'Схолстейм': 'Лес' };
    function holdFaunaList(hold) {
        const hd = window.huntData; if (!hd) return [];
        const key = Object.keys(hd.holdFauna).find(h => h === hold || h.indexOf(hold) !== -1 || hold.indexOf(h) !== -1);
        const base = key ? hd.holdFauna[key] : hd.defaultFauna;
        const mod = hd.regionMod[HOLD_TYPICAL_REGION[key || hold]] || {};
        return Object.keys(base).map(n => ({ name: n, w: base[n] * (mod[n] || 1) })).sort((a, b) => b.w - a.w);
    }
    function holdWaters(hold) {
        // Как в самой рыбалке (resolveFishingWater): Винтерхолд и Белый берег — ледяные воды везде; Хьялмарк и Истмарк —
        // ледяные только на побережье, в болоте — озёрная рыба.
        if (hold === 'Винтерхолд' || hold === 'Белый берег (Данстар)') return ['freezing'];
        const r = HOLD_TYPICAL_REGION[hold];
        if (r === 'Горы') return ['freezing'];
        const coldCoast = FISHING_COLD_HOLDS.indexOf(hold) !== -1;
        if (r === 'Болото') return coldCoast ? ['lake', 'freezing'] : ['lake'];
        return coldCoast ? ['lake', 'stream', 'freezing'] : ['lake', 'stream'];
    }
    window.renderHoldWildlife = function () {
        const box = document.getElementById('player-map-wildlife'); if (!box) return;
        if (!playerMapHold) { box.innerHTML = ''; return; }
        const hold = playerMapHold;
        const fauna = holdFaunaList(hold);
        const plants = (typeof INGREDIENT_HOLD_TAGS !== 'undefined' && INGREDIENT_HOLD_TAGS[hold]) || [];
        box.innerHTML = `<div style="border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; margin-top:8px; font-size:14px;">
            <strong>🌲 Здесь водятся (${escHtml(hold)}):</strong> ${fauna.length ? fauna.map(f => escHtml(f.name)).join(', ') : 'дичи нет'}
            ${plants.length ? `<div style="margin-top:4px;"><strong>🌿 Растут:</strong> ${plants.map(escHtml).join(', ')}</div>` : ''}
            <button type="button" style="width:auto; margin-top:6px; padding:3px 10px;" onclick="toggleHoldFish()">🎣 Что ловится</button>
            <div id="player-map-fish" style="display:none; margin-top:6px;"></div></div>`;
        if (window._holdFishOpen) window.toggleHoldFish(true);
    };
    window.toggleHoldFish = function (keepOpen) {
        const box = document.getElementById('player-map-fish'); if (!box) return;
        const open = keepOpen === true ? true : box.style.display === 'none';
        window._holdFishOpen = open;
        box.style.display = open ? 'block' : 'none';
        if (!open) return;
        const waters = holdWaters(playerMapHold), W = window.FISH_WATER_LABELS || {};
        const RN = { common: 'часто', uncommon: 'нередко', rare: 'редко' };
        const rows = (window.fishData || []).map(f => {
            const hs = f.habitats.filter(h => waters.indexOf(h[0]) !== -1); if (!hs.length) return null;
            const best = ['common', 'uncommon', 'rare'].find(r => hs.some(h => h[2] === r));
            return { n: f.name, r: best };
        }).filter(Boolean);
        box.innerHTML = '<div style="opacity:.75; font-size:13px;">Воды: ' + waters.map(w => escHtml(W[w] || w)).join(', ') + '</div>' + (rows.length ? rows.map(r => `<span style="display:inline-block; margin:2px 8px 2px 0;">${escHtml(r.n)} <span style="opacity:.6; font-size:12px;">(${RN[r.r]})</span></span>`).join('') : 'Рыбы нет.');
    };

    function renderPlayerNotes() {
        const form = document.getElementById('player-note-form'), list = document.getElementById('player-notes-list'), selEl = document.getElementById('player-note-sel');
        if (form) form.style.display = _playerSel ? 'block' : 'none';
        if (selEl && _playerSel) selEl.innerHTML = '🟢 Выбрана точка' + (_playerSel.hold ? ' в владении <strong>' + escHtml(_playerSel.hold) + '</strong>' : '') + '. Назови её и опиши.';
        if (!list) return;
        list.innerHTML = playerMapNotes.length ? playerMapNotes.map(n => `<div style="margin:3px 0; font-size:14px;">
            <a href="#" style="color:var(--accent-color);" onclick="playerShowPlace('note:${jsq(n.id)}'); return false;">📍 ${escHtml(n.name)}</a>
            <span style="opacity:.6; font-size:12px;"> — ${escHtml(n.hold || 'карта')}</span>
            ${n.desc ? `<div style="font-size:13px; opacity:.85; margin-left:18px; white-space:pre-wrap;">${escHtml(n.desc.length > 140 ? n.desc.slice(0, 140) + '…' : n.desc)}</div>` : ''}</div>`).join('')
            : '<p style="opacity:.65; font-size:13px;">Своих точек пока нет.</p>';
    }

    window.renderPlayerMap = function (force) {
        const box = document.getElementById('player-map');
        if (!box || !window.HoldsMap) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const party = window.HoldsMap.partyFromSession(session);
        const hl = (session && session.currentHold) || (party && party.hold) || null;
        const places = playerVisible(session && session.openPlaces);
        const marks = playerVisible(session && session.mapMarks);
        const fog = window.HoldsMap.fogFromSession(session, false, playerUid());
        const troute = session && session.travelRoute && Array.isArray(session.travelRoute.pts) && session.travelRoute.pts.length > 1 ? session.travelRoute : null;
        const fp = playerFindPlace(session, _playerPlaceSel);
        const focus = fp && typeof fp.x === 'number' ? { x: fp.x, y: fp.y, u: fp.u, v: fp.v, hold: fp.hold || undefined, name: fp.name } : null;
        const sig = JSON.stringify([playerMapHold, party, hl, places, marks, _playerPlaceSel, _playerMapNote, session && session.mapFog, troute && troute.ts, session && session.mapCfg, session && session.mapSettle, _playerSel, playerMapNotes, playerUid()]);
        if (!force && sig === _playerMapSig) return;
        _playerMapSig = sig;
        const pins = {};
        places.forEach(p => { if (typeof p.x === 'number' && typeof p.y === 'number' && p.hold) { (pins[p.hold] = pins[p.hold] || {})[p.name] = { x: p.x, y: p.y, u: p.u, v: p.v, cat: p.cat || '', show: true }; } });
        // метки, которые мастер поставил игрокам на карте (в т.ч. без привязки к открытому месту)
        const markKeys = {};
        marks.forEach(m => {
            if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') return;
            const hk = m.hold || '';
            pins[hk] = pins[hk] || {};
            let key = m.name || 'Метка';
            if (pins[hk][key]) key += ' ★';
            pins[hk][key] = { x: m.x, y: m.y, u: m.u, v: m.v, cat: 'Метка для игроков', show: true };
            markKeys[hk + '|' + key] = m.id;
        });
        // мои личные точки
        const noteKeys = {};
        playerMapNotes.forEach(n => {
            if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
            const hk = n.hold || '';
            pins[hk] = pins[hk] || {};
            let key = n.name;
            if (pins[hk][key]) key += ' (моя)';
            pins[hk][key] = { x: n.x, y: n.y, u: n.u, v: n.v, cat: 'Моя точка', show: true };
            noteKeys[hk + '|' + key] = n.id;
        });
        window.HoldsMap.render(box, {
            hold: playerMapHold || null, hl, party, pins, pinsAll: true, fog, settleOv: session && session.mapSettle, sel: _playerSel, focus,
            route: troute ? { pts: troute.pts } : null,
            onHold: h => window.playerMapZoom(h),
            // в приближении клик по пустому месту выбирает точку для личной заметки
            onMap: playerMapHold ? (x, y, h, u, v) => { _playerSel = { x, y, u, v, hold: h || playerMapHold }; _playerPlaceSel = null; _playerMapNote = null; _playerMapSig = null; window.renderPlayerMap(true); } : null,
            onSettlement: (h, n, x, y, u, v) => { _playerPlaceSel = null; _playerSel = null; _playerMapNote = { title: n, sub: h, target: { x, y, u, v, hold: h, name: n } }; _playerMapSig = null; window.renderPlayerMap(true); },
            onPin: (h, n) => {
                const nid = noteKeys[h + '|' + n];
                if (nid) { window.playerShowPlace('note:' + nid); return; }
                const mid = markKeys[h + '|' + n];
                if (mid) { window.playerShowPlace('mark:' + mid); return; }
                const p = places.find(x => x.hold === h && x.name === n); if (p) window.playerShowPlace(p.id);
            }
        });
        renderOpenPlaces(session);
        renderPlayerNotes();
        if (typeof window.renderHoldWildlife === 'function') window.renderHoldWildlife();
        const st = document.getElementById('player-map-status');
        if (st) st.innerHTML = party ? `⚑ Партия сейчас: <strong>${escHtml(party.name || 'на карте')}</strong>${party.hold ? ' · ' + escHtml(party.hold) : ''}` : (hl ? `⚑ Партия во владении: <strong>${escHtml(hl)}</strong>` : 'Мастер ещё не отметил положение партии.');
        if (st && troute) {
            const d = troute.days || {}, F = window.HoldsMap.fmtDays;
            st.innerHTML += `<div style="margin-top:4px;">🧭 Маршрут от мастера: <strong>${escHtml(troute.from || '')} → ${escHtml(troute.to || '')}</strong> — ≈ ${troute.km} км (по прямой ${troute.direct} км). Пешком ${F(d.foot || 0)}, верхом ${F(d.horse || 0)}, на повозке ${F(d.cart || 0)}.</div>`;
        }
        if (st && fog) st.innerHTML += '<div style="margin-top:4px; opacity:.8; font-size:13px;">🌫 Часть карты скрыта туманом — она откроется по мере путешествия.</div>';
        const back = document.getElementById('player-map-back');
        if (back) back.style.display = playerMapHold ? '' : 'none';
    };

    // Читает регион/погоду/время суток, заданные мастером в сессии, и показывает их игроку.
    window.updateWeatherDisplay = function () {
        if (typeof window.renderPlayerMap === 'function') window.renderPlayerMap();
        const el = document.getElementById('weather-display');
        if (!el) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        if (!session || !session.currentRegion) {
            el.textContent = '🕐 Время суток и погода ещё не заданы мастером.';
            return;
        }
        const period = session.timePeriod || 'День';
        const weatherKey = session.currentWeather || 'clear';
        const weather = WEATHER_TYPES[weatherKey] || WEATHER_TYPES.clear;
        let html = `🕐 <strong>${escHtml(period)}</strong> · 📍 ${escHtml(session.currentRegion)}${session.currentHold ? ' (' + escHtml(session.currentHold) + ')' : ''} · ${weather.name}`;
        if (weather.effect) html += `<div style="font-size:13px; opacity:.75; margin-top:2px;">${escHtml(weather.effect)}</div>`;
        el.innerHTML = html;
    };

    // Список трупов, доступных для подъёма прямо сейчас: гуманоиды (isRaisable, только сгенерированные
    // мастером бандиты), мёртвые, не поднятые ранее, убитые не больше 5 ходов назад.
    window.renderCorpseRaiseSelect = function () {
        const select = document.getElementById('corpse-raise-target-select');
        if (!select) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const currentTurn = (session && session.sessionTurnCounter) || 0;
        const eligible = session ? (session.enemies || []).filter(e =>
            e.isRaisable && !e.soulTaken && (e.curHp || 0) <= 0 && !e.raised &&
            (e.diedAtTurn === undefined || currentTurn - e.diedAtTurn <= 5)
        ) : [];
        const prev = select.value;
        select.innerHTML = '<option value="">— автоматически (первый доступный) —</option>' +
            eligible.map(e => `<option value="${escHtml(e.id)}">${escHtml(e.name)} (умер ${e.diedAtTurn !== undefined ? (currentTurn - e.diedAtTurn) + ' х. назад' : 'недавно'})</option>`).join('');
        if (eligible.some(e => e.id === prev)) select.value = prev;
    };

    // ---------- Задача I: групповые проверки, кооперативная атака, помощь союзнику ----------

    window.renderGroupCheckPlayerPanel = function () {
        const panel = document.getElementById('group-check-player-panel');
        const infoEl = document.getElementById('group-check-player-info');
        const btn = document.getElementById('group-check-roll-btn');
        if (!panel || !infoEl || !btn) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const gc = session && session.groupCheck;
        if (!gc) { panel.style.display = 'none'; return; }
        panel.style.display = 'block';
        const myUid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const myResult = myUid && gc.results ? gc.results[myUid] : null;
        if (myResult) {
            infoEl.textContent = `«${gc.skill}»${gc.dc ? ' (порог ' + gc.dc + ')' : ''} — твой бросок: ${myResult.total} (уже отправлен).`;
            btn.disabled = true;
            btn.textContent = 'Уже брошено';
        } else {
            infoEl.textContent = `Мастер просит бросок: «${gc.skill}»${gc.dc ? ' (порог ' + gc.dc + ')' : ''}.`;
            btn.disabled = false;
            btn.textContent = 'Бросить';
        }
    };

    window.rollGroupCheckResponse = function () {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const gc = session && session.groupCheck;
        if (!gc) return;
        const skillIdx = skillNames.indexOf(gc.skill);
        const statKey = skillIdx !== -1 ? SKILL_TO_STAT[gc.skill] : null;
        let mod = 0;
        if (statKey) {
            const statInput = document.getElementById('stat-' + statKey);
            const rawStat = statInput ? (parseInt(statInput.value) || 10) : 10;
            mod = calcAbilityMod(rawStat);
        }
        // Задача I.3: если есть неиспользованная помощь союзника — прибавляем и снимаем её.
        const myUid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const helpBuff = myUid && session.buffs ? session.buffs[myUid] : null;
        if (helpBuff && helpBuff.value) { mod += helpBuff.value; window.CloudSync.clearHelpBuff(myUid); }
        { const sb = getSessionRollBonus(true); if (sb.value) mod += sb.value; }
        // Те же модификаторы, что у обычной проверки кубов: ошеломление, голод, снаряжение/болезни/погода к навыку, перки.
        mod += getActiveRollPenalty() + hungerRollPenalty() + getActiveSkillRollBonus(gc.skill);
        { const pbG = window.perkBonuses || {}, kG = canonSkillKey(gc.skill);
          if (kG === 'скрытность' && pbG.sneakDetectBonus) mod += pbG.sneakDetectBonus;
          if (kG === 'карманные кражи' && pbG.pickpocketBonus) mod += pbG.pickpocketBonus;
          if (kG === 'скрытность' && session.currentWeather === 'storm' && Math.random() < 0.25) mod -= 2; } // вспышка молнии
        const roll = Math.floor(Math.random() * 20) + 1;
        const gBoostPct = ['скрытность', 'взлом', 'карманные кражи'].includes(canonSkillKey(gc.skill)) ? getSkillBoostPercent(gc.skill) : 0;
        mod += boostDiceFlat(gBoostPct);
        const total = roll + mod;
        if (!myUid || !window.CloudSync || typeof window.CloudSync.submitGroupCheckResult !== 'function') { alert('Нет соединения с сессией.'); return; }
        window.CloudSync.submitGroupCheckResult(myUid, roll, mod, total).then(() => {
            const myName = document.getElementById('char-name').value;
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🎲 ${myName} бросает «${gc.skill}»: ${total} (к20 ${roll}${mod >= 0 ? '+' : ''}${mod}${helpBuff ? ', учтена помощь союзника' : ''}).`, myName);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.renderHelpAllySelect = function () {
        const sel = document.getElementById('help-ally-select');
        if (!sel) return;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const myUid = window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null;
        const participants = (session && session.participants) || {};
        const others = Object.entries(participants).filter(([uid]) => uid !== myUid);
        const prev = sel.value;
        sel.innerHTML = others.length
            ? others.map(([uid, p]) => `<option value="${uid}">${escHtml(p.name || uid)}</option>`).join('')
            : '<option value="">Нет других игроков в сессии</option>';
        if (others.some(([uid]) => uid === prev)) sel.value = prev;
    };

    window.helpAlly = function () {
        const targetUid = document.getElementById('help-ally-select').value;
        if (!targetUid) { alert('Выбери союзника.'); return; }
        if (!window.CloudSync || typeof window.CloudSync.helpAlly !== 'function') { alert('Нет соединения с сессией.'); return; }
        const myName = document.getElementById('char-name').value;
        window.CloudSync.helpAlly(targetUid, myName).then(() => {
            if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🤝 ${myName} помогает союзнику (+1 к следующему броску).`, myName);
            alert('Помощь отправлена — союзник получит +1 к следующему броску.');
        }).catch(e => alert('Ошибка: ' + e.message));
    };
