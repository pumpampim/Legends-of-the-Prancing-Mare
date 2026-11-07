
    // Бросок на ночную засаду + разрешение отдыха — ядро механики похода/лагеря. Магически
    // безопасный лагерь (isMagicallySafe) пропускает бросок полностью. При засаде лагерь
    // прерывается (campState.active=false) и мастер добавляет врагов обычным инструментом ниже —
    // этот бросок НЕ генерирует бой сам, только решает, нужен ли он.
    // ---------- Активный блок (скрытые кубы) ----------
    // ОТДЕЛЬНЫЙ инструмент от обычной атаки (rollGmAttack/applyGmAttackDamage) — та функция НЕ
    // трогается этим кодом вообще. Нужен полный документ игрока (stats/skills/perkStates) — этих
    // полей нет в lastData.participants (там только имя+ХП+МП, синхронизируемые отдельно), поэтому
    // читаем characters/{uid} напрямую в момент броска, не заранее.
    let pendingBlockResult = null;

    function populateBlockSelects() {
        const atkSel = el('block-attacker-select');
        const tgtSel = el('block-target-select');
        // Пересобираем на каждом снимке (враги и игроки приходят и уходят), сохраняя выбранное значение.
        // Раньше списки заполнялись один раз — новые враги в них не появлялись до перезагрузки.
        const fill = (sel, html) => { if (!sel) return; const prev = sel.value; if (sel.innerHTML !== html) { sel.innerHTML = html; if (Array.from(sel.options).some(o => o.value === prev)) sel.value = prev; } };
        fill(atkSel, (lastData.enemies || []).filter(e => (e.curHp || 0) > 0).map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('') || '<option value="">Нет врагов в бою</option>');
        fill(tgtSel, Object.keys(lastData.participants || {}).map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('') || '<option value="">Нет игроков</option>');
    }

    window.rollActiveBlock = function () {
        const enemyId = el('block-attacker-select').value;
        const targetUid = el('block-target-select').value;
        const shieldType = el('block-shield-type').value;
        const enemy = (lastData.enemies || []).find(e => e.id === enemyId);
        if (!enemy || !targetUid) { alert('Выбери атакующего и защищающегося.'); return; }

        db.collection('characters').doc(targetUid).get().then(doc => {
            if (!doc.exists) { alert('Не нашёл документ игрока.'); return; }
            const data = doc.data();
            // effectiveStats в листе — объект {str,dex,con,int,wis,cha} (итоговые, с расой/знаком); старые сейвы — массив. Приводим к массиву.
            const es = data.effectiveStats;
            const stats = (es && !Array.isArray(es) && typeof es === 'object') ? ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => es[k])
                : (es || data.stats || [10, 10, 10, 10, 10, 10]); // str,dex,con,int,wis,cha
            const statMod = shieldType === 'heavy' ? calcAbilityMod(parseInt(stats[2]) || 10) : calcAbilityMod(parseInt(stats[1]) || 10);
            const blockSkill = parseInt((data.effectiveSkills || data.skills || [])[3]) || 10; // Блокирование — индекс 3 в skillNames (с расовым бонусом)
            const skillMod = Math.floor(blockSkill / 10);
            // "Щитоносец" — skillIdx 3 (Блокирование), perkIdx 0, 5 ступеней → 20/25/30/35/40% среза урона.
            const SHIELDBEARER_PCT = [0, 20, 25, 30, 35, 40];
            let shieldbearerSteps = 0;
            for (let s = 1; s <= 5; s++) { if ((data.perkStates || {})['skill3-perk0-step' + s]) shieldbearerSteps = s; }
            const blockReductionPct = SHIELDBEARER_PCT[shieldbearerSteps];

            // Атака врага: 1д20 + атакующий мод (СИЛ/ЛОВ, как у обычной атаки) + прогрессирующий
            // бонус от урона оружия — floor((урон-10)/10), по прямой формуле из документа.
            const atkMod = calcAbilityMod(enemy.isRanged ? (enemy.dex || 10) : (enemy.str || 10)) + (enemy.isRanged ? gmWeatherRanged() : 0); // погода мешает стрелкам
            const progressiveBonus = Math.max(0, Math.floor(((enemy.weaponDmg || 0) - 10) / 10));
            const enemyRoll = Math.floor(Math.random() * 20) + 1;
            const enemyTotal = enemyRoll + atkMod + progressiveBonus;

            const playerRoll = Math.floor(Math.random() * 20) + 1;
            const playerTotal = playerRoll + statMod + skillMod;

            const diff = enemyTotal - playerTotal;
            let outcome, outcomeLabel;
            if (diff <= 0) { outcome = 'success'; outcomeLabel = '✅ Блок успешен'; }
            else if (diff <= 4) { outcome = 'partial'; outcomeLabel = '🟡 Частичный блок'; }
            else { outcome = 'broken'; outcomeLabel = '❌ Блок пробит'; }

            const hasBlkPerk = (pi) => !!(data.perkStates || {})['skill3-perk' + pi + '-step1'];
            const arrowNoDmg = hasBlkPerk(1) && !!enemy.isRanged && outcome !== 'broken';
            const blkNotes = [];
            if (arrowNoDmg) blkNotes.push('🏹 «Отбивание стрел»: стрела попала в щит — урона нет.');
            if (hasBlkPerk(4) && outcome !== 'broken') blkNotes.push('🛡 «Защита от стихий»: пока блок держится — 50% сопротивление огню, холоду и электричеству (для стихийной атаки срежь урон вдвое).');
            if (hasBlkPerk(3) && outcome === 'success') blkNotes.push('⏱ «Быстрые рефлексы»: при блоке силовой атаки игрок получает дополнительное действие.');
            pendingBlockResult = { enemy, targetUid, outcome, blockReductionPct, enemyTotal, playerTotal, arrowNoDmg };
            const resBox = el('block-result');
            resBox.style.display = 'block';
            resBox.innerHTML = `<div style="font-size:13px;">Враг: 1d20(${enemyRoll})+${atkMod}+${progressiveBonus}(прогресс.) = <strong>${enemyTotal}</strong><br>` +
                `Игрок: 1d20(${playerRoll})+${statMod}(хар-ка)+${skillMod}(навык) = <strong>${playerTotal}</strong><br>` +
                `<strong style="font-size:15px;">${outcomeLabel}</strong> (разница ${diff})<br>` +
                (outcome === 'success' ? `Урон срезан на ${blockReductionPct}% (перк «Щитоносец»), враг получает −2 к следующему броску.` :
                 outcome === 'partial' ? `Урон снижается только на сопротивление щита/брони самого по себе — примени как обычный урон с резистом.` :
                 `Игрок получает ПОЛНЫЙ урон (только бронёй) + статус «Ошеломление» (−3 к следующему броску).`) +
                (blkNotes.length ? '<br><span style="color:#6cc;">' + blkNotes.join('<br>') + '</span>' : '');
            el('block-apply-btn').style.display = 'block';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.applyActiveBlockResult = function () {
        if (!pendingBlockResult) return;
        const { enemy, targetUid, outcome, blockReductionPct, arrowNoDmg } = pendingBlockResult;
        const baseDmg = enemyWeaponDamage(enemy).total;
        let finalDmgNote = '';
        const patch = {};
        if (arrowNoDmg) {
            finalDmgNote = 'Перк «Отбивание стрел»: стрела попала в щит — урон 0.';
            if (outcome === 'success') patch.enemies = (lastData.enemies || []).map(e => e.id === enemy.id ? { ...e, statusEffects: [...(e.statusEffects || []), { id: 'blk-' + Date.now(), name: 'Потеря равновесия', desc: '−2 к следующему броску (блок щитом)', turns: 1 }] } : e);
        } else if (outcome === 'success') {
            const dmg = Math.round(baseDmg * (1 - blockReductionPct / 100));
            finalDmgNote = `Урон после среза блоком: ${dmg} (из ${baseDmg}, срез ${blockReductionPct}%) — резист/броня цели по обычным правилам применяются сверху вручную.`;
            // Дебафф врагу — через statusEffects на самом враге (та же структура, что у управляющих заклинаний игрока).
            const enemies = (lastData.enemies || []).map(e => e.id === enemy.id ? { ...e, statusEffects: [...(e.statusEffects || []), { id: 'blk-' + Date.now(), name: 'Потеря равновесия', desc: '−2 к следующему броску (блок отбил атаку).', turns: 1 }] } : e);
            patch.enemies = enemies;
        } else if (outcome === 'partial') {
            finalDmgNote = `Урон снижается только сопротивлением самого щита/брони (не процентом блока) — реши сопротивление щита сам и примени урон как обычно.`;
        } else {
            finalDmgNote = `Игрок получает ПОЛНЫЙ урон ${baseDmg} (срез только бронёй по обычным правилам) + статус «Ошеломление».`;
            patch['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                id: 'stag-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: enemy.name, effectName: 'Ошеломление', description: '−3 к кубам на весь следующий ход.', turnsRemaining: 1, rollPenalty: -3, fromGm: true
            });
        }
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `🛡️ Активный блок: ${enemy.name} vs блокирующий — ${outcome === 'success' ? 'успех' : outcome === 'partial' ? 'частично' : 'пробит'}. ${finalDmgNote}` });
        db.collection('sessions').doc(currentCode).update(patch).then(() => {
            el('block-result').style.display = 'none';
            el('block-apply-btn').style.display = 'none';
            pendingBlockResult = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.resolveCampNight = function () {
        const campState = lastData.campState;
        if (!campState || !campState.active) { alert('Лагерь сейчас не разбит.'); return; }
        const terrainChances = { dungeon: 40, forest: 25, plains: 15 };
        const chance = campState.isMagicallySafe ? 0 : (terrainChances[el('camp-terrain-select').value] || 25);
        const roll = Math.floor(Math.random() * 100) + 1;
        const ambush = roll <= chance;
        if (ambush) {
            db.collection('sessions').doc(currentCode).update({
                'campState.active': false,
                combatLog: firebase.firestore.FieldValue.arrayUnion({
                    ts: Date.now(), author: 'Мастер',
                    text: `🚨 Ночная засада! (бросок ${roll} ≤ ${chance}%) Лагерь прерван — добавь врагов обычным способом.`
                })
            }).catch(e => alert('Ошибка: ' + e.message));
            return;
        }
        // Спокойная ночь — ХП/МП всех УЧАСТНИКОВ сессии до максимума + статус "Полноценный отдых".
        const participants = lastData.participants || {};
        const uids = Object.keys(participants);
        const restNotes = [];
        const writes = uids.map(uid => {
            const p = participants[uid];
            const extraRest = {};
            // Раньше тут было update({'vitals.0': …, 'vitals.1': …}) — но vitals это МАССИВ: путь через точку превращал его в словарь
            // {0:…, 1:…} и терялись макс. ХП/МП (индексы 2-3). Теперь правим массив целиком в транзакции.
            // Длительный отдых по тем же правилам, что «Следующий день» у игрока: мана полностью (знак Атронаха — половина
            // израсходованной), здоровье — до максимума только с «Лечебной припаркой» (тратится 1 шт.). Раньше лагерь лечил всё.
            return updateCharacterVitals(uid, (v, data) => {
                const nm = p.name || uid;
                const maxHp = parseInt(v[2]) || p.maxHp || 0, maxMp = parseInt(v[3]) || p.maxMp || 0;
                const curHp = parseInt(v[0]) || 0, curMp = parseInt(v[1]) || 0;
                const spent = Math.max(0, maxMp - curMp);
                const atronach = data.sign === 'atronach';
                v[1] = Math.max(curMp, Math.min(maxMp, curMp + (atronach ? Math.ceil(spent / 2) : spent)));
                let hpNote = 'ХП без изменений (нет лечебной припарки)';
                if (curHp >= maxHp) hpNote = 'ХП и так полные';
                else {
                    const inv = Array.isArray(data.inventory) ? data.inventory.map(i => Object.assign({}, i)) : [];
                    const pi = inv.findIndex(i => /^Лечебная припарка/.test(i.itemId || '') || /^Лечебная припарка/.test(i.name || ''));
                    if (pi !== -1 && (inv[pi].count || 0) > 0) {
                        inv[pi].count -= 1; if (inv[pi].count <= 0) inv.splice(pi, 1);
                        extraRest.inventory = inv;
                        v[0] = maxHp; hpNote = `припарка: ХП ${curHp} → ${maxHp}`;
                    }
                }
                restNotes.push(`${nm}: мана ${curMp} → ${v[1]}${atronach ? ' (Атронах — половина)' : ''}, ${hpNote}`);
            }, extraRest).catch(e => console.error('Ошибка отдыха для', uid, e));
        });
        // «Полноценный отдых» — через очередь сессии participants.{uid}.pendingStatusEffects (её читает игрок);
        // раньше статус писался в characters/{uid}.pendingStatusEffects, которую никто не читает.
        const restPatch = {};
        uids.forEach(uid => {
            restPatch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                id: 'rest-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: 'Лагерь', effectName: 'Полноценный отдых', description: '+1 к кубам на все проверки навыков (весь следующий игровой день).', turnsRemaining: 20, rollPenalty: 1
            });
        });
        Promise.all(writes).then(() => {
            db.collection('sessions').doc(currentCode).update(Object.assign(restPatch, {
                'campState.active': false,
                combatLog: firebase.firestore.FieldValue.arrayUnion({
                    ts: Date.now(), author: 'Мастер',
                    text: `😴 Ночь прошла спокойно (бросок ${roll} > ${chance}%). ${restNotes.join('; ')}. Статус «Полноценный отдых» применён.`
                })
            }));
        });
    };

    // Раньше gm.js вызывал parseSpellDamageFromDesc под проверкой typeof, но сама функция живёт только в index.html (у игрока),
    // на странице мастера её нет — урон заклинаний мага-бандита всегда выходил 0. Теперь копия разбора описания здесь же
    // (без кэша: вызывается один раз на заклинание при генерации врага).
    function parseSpellDamageFromDesc(desc, enhanced) { return desc ? _parseSpellDamageFromDescImpl(desc, enhanced) : null; }
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

    // ---------- Журнал сессии (вкладка «Дневник» у игроков) ----------
    function renderJournalGm() {
        const j = lastData.journal || {};
        const sumEl = el('gm-journal-summary');
        // не перетираем текст, который мастер сейчас печатает
        if (sumEl && document.activeElement !== sumEl && (j.summary && j.summary.text) !== undefined && sumEl.dataset.pub !== String((j.summary && j.summary.ts) || 0)) {
            sumEl.value = (j.summary && j.summary.text) || '';
            sumEl.dataset.pub = String((j.summary && j.summary.ts) || 0);
        }
        const rumEl = el('gm-journal-rumors');
        if (rumEl) {
            const rumors = j.rumors || [];
            rumEl.innerHTML = rumors.length ? rumors.map(r => `<div style="display:flex; gap:6px; align-items:center; border-left:3px solid var(--accent-color); padding:2px 8px; margin-bottom:3px;">
                <span style="flex:1; font-size:14px;">${r.hold ? '<span style="opacity:.65; font-size:11px;">[' + escapeHtml(r.hold) + ']</span> ' : ''}${escapeHtml(r.text || '')}
                  ${r.truth ? '<span style="font-size:11px; opacity:.75;" title="Видишь только ты">' + ({ true: '✔ верный', twist: '≈ искажённый', false: '✘ ложный' }[r.truth] || '') + (r.verdict ? ' · раскрыто' : '') + '</span>' : ''}</span>
                ${r.truth && !r.verdict ? `<button style="padding:1px 6px; width:auto;" title="Показать игрокам, правда это или нет" onclick="gmRevealRumor('${r.id}')">🔎</button>` : ''}
                <button style="padding:1px 6px;" onclick="gmDeleteRumor('${r.id}')">🗑</button></div>`).join('') : '<span style="opacity:.6; font-size:13px;">Слухов нет.</span>';
        }
        const entEl = el('gm-journal-entries');
        if (entEl) {
            const entries = j.entries || [];
            entEl.innerHTML = entries.length ? entries.map(e => `<div style="display:flex; gap:6px; align-items:flex-start; margin-bottom:3px; font-size:13px;">
                <span style="flex:1;"><b>${escapeHtml(e.author || '?')}:</b> ${escapeHtml(e.text || '')}</span>
                <button style="padding:1px 6px;" onclick="gmDeleteJournalEntry('${e.id}')">🗑</button></div>`).join('') : '<span style="opacity:.6; font-size:13px;">Записей пока нет.</span>';
        }
    }

    window.gmPublishSummary = function () {
        const text = (el('gm-journal-summary').value || '').trim();
        const ts = Date.now();
        db.collection('sessions').doc(currentCode).update({
            'journal.summary': { text: text, ts: ts },
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: ts, author: 'Мастер', text: '📖 Опубликована сводка прошлой сессии (вкладка «Дневник»).' })
        }).then(() => { el('gm-journal-summary').dataset.pub = String(ts); el('gm-journal-summary-state').textContent = 'опубликовано'; setTimeout(() => { const s = el('gm-journal-summary-state'); if (s) s.textContent = ''; }, 3000); })
          .catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmAddRumor = function () {
        const inp = el('gm-journal-rumor');
        const text = (inp.value || '').trim();
        if (!text) return;
        db.collection('sessions').doc(currentCode).update({
            'journal.rumors': firebase.firestore.FieldValue.arrayUnion({ id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), text: text })
        }).then(() => { inp.value = ''; }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Обслуживание сессии: документ Firestore ограничен 1 МБ ----------
    // Боевой журнал, шёпоты, слухи и записи партии только растут (arrayUnion). На долгой кампании
    // документ упёрся бы в лимит, и ЛЮБАЯ запись (ХП, ходы, инвентарь) перестала бы проходить.
    // Раз в минуту мастер обрезает самые старые записи и предупреждает, если документ всё ещё тяжёлый.
    let _maintLast = 0, _stocksSanitized = false;
    const SESSION_TRIM = { oocChat: [260, 200], combatLog: [400, 250], whispers: [300, 200], gmWhispers: [300, 200], rumors: [80, 60], entries: [300, 200] };
    function gmMaintainSession(d) {
        if (!currentCode || Date.now() - _maintLast < 60000) return;
        _maintLast = Date.now();
        const upd = {}, j = d.journal || {};
        const cut = (arr, key, field) => { const [hi, lo] = SESSION_TRIM[key]; if (Array.isArray(arr) && arr.length > hi) upd[field] = arr.slice(-lo); };
        cut(d.combatLog, 'combatLog', 'combatLog'); cut(d.oocChat, 'oocChat', 'oocChat'); cut(d.whispers, 'whispers', 'whispers'); cut(d.gmWhispers, 'gmWhispers', 'gmWhispers');
        cut(j.rumors, 'rumors', 'journal.rumors'); cut(j.entries, 'entries', 'journal.entries');
        // Один раз за вход в сессию: убираем из уже созданных ассортиментов то, что торговцы продавать
        // не должны (одеяния Коллегии, зелье крови), и заменяем безымянную «Стрелу» на железную.
        if (!_stocksSanitized && d.merchantStocks && typeof isMerchantExcluded === 'function') {
            _stocksSanitized = true;
            const out = {}; let changed = false;
            Object.keys(d.merchantStocks).forEach(k => {
                const s = d.merchantStocks[k];
                if (!s || !Array.isArray(s.items)) { out[k] = s; return; }
                let ch = false;
                const items = s.items.filter(it => { const bad = !it.playerItem && isMerchantExcluded(it); if (bad) ch = true; return !bad; }).map(it => {
                    if (it.name === 'Стрела' && !it.playerItem) { ch = true; return Object.assign({}, it, { name: 'Железная стрела', price: 1, dmg: 8, weight: 0.04, qty: Math.max(it.qty || 1, 10) }); }
                    return it;
                });
                if (ch) { changed = true; out[k] = Object.assign({}, s, { items: items }); } else out[k] = s;
            });
            if (changed) upd.merchantStocks = out;
        }
        if (Object.keys(upd).length) db.collection('sessions').doc(currentCode).update(stripUndefinedDeep(upd)).catch(e => console.error('Чистка сессии:', e));
        let size = 0; try { size = JSON.stringify(d).length; } catch (e) { }
        let w = el('gm-size-warn');
        if (size > 700000) {
            if (!w) { w = document.createElement('div'); w.id = 'gm-size-warn'; w.className = 'panel'; w.style.cssText = 'border-color:#e74c3c; color:#e74c3c; font-size:14px;'; const sb = el('session-block'); if (sb) sb.insertBefore(w, sb.firstChild); }
            w.textContent = '⚠ Документ сессии очень большой (~' + Math.round(size / 1024) + ' КБ из 1024). Нажми «Очистить журнал» в боевом журнале и убери ненужные слухи/записи, иначе скоро перестанут сохраняться изменения.';
        } else if (w) w.remove();
    }

    // ---------- Молва: деяния партии → слухи ----------
    const RUM_MAX_DEEDS = 60;
    let rumDraft = null;          // { deedId, text, hold, truth }
    let rumFirst = true;          // первый снимок сессии — только запоминаем, что уже было
    let rumSeenDead = new Set(), rumSeenFallen = new Set(), rumDayDone = 0;

    function rumSettings() { return Object.assign({ auto: true, tone: 'normal' }, lastData.rumorSettings || {}); }
    function rumDay() { return lastData.gameDayCounter || 0; }
    function rumPartyHold() { return (lastData.partyPos && lastData.partyPos.hold) || lastData.currentHold || ''; }
    function rumPartyNames() { return Object.values(lastData.participants || {}).map(p => p && p.name).filter(Boolean); }
    function rumAllHolds() {
        const s = el('weather-hold-select');
        return s ? Array.from(s.options).map(o => o.value).filter(Boolean) : [];
    }
    function rumEnemyCat(name) {
        const base = window.RumorEngine.clean(name).toLowerCase();
        const e = (window.enemiesData || []).find(x => base.indexOf(String(x.name).toLowerCase()) === 0);
        return e ? e.category : '';
    }
    function rumDeedText(d) {
        const hold = d.hold ? ' · ' + d.hold : '';
        const who = (d.who && d.who.length) ? ' (' + d.who.join(', ') + ')' : '';
        switch (d.kind) {
            case 'kill': return 'Победа: ' + window.RumorEngine.clean(d.enemy || 'враги').toLowerCase() + (d.count > 1 ? ' ×' + d.count : '') + hold;
            case 'fall': return 'Пал: ' + (d.who || []).join(', ') + hold;
            case 'crime': return 'Штраф' + (d.amount ? ' ' + d.amount : '') + (d.reason ? ': ' + d.reason : '') + hold + who;
            case 'jail': return 'Тюрьма' + (d.days ? ' на ' + d.days + ' дн.' : '') + hold + who;
            case 'quest': return 'Взяли задание «' + (d.what || '') + '»' + hold;
            default: return (d.what || '—') + (d.place ? ' · ' + d.place : '') + hold;
        }
    }
    function rumSaveDeeds(list, extra) {
        list = list.slice(-RUM_MAX_DEEDS);
        lastData.deeds = list;
        if (!currentCode) return Promise.resolve();
        return db.collection('sessions').doc(currentCode).update(Object.assign({ deeds: stripUndefinedDeep(list) }, extra || {}));
    }
    // Записать деяние. Однотипные победы за один день в одном месте склеиваются в одно.
    window.rumAddDeed = function (d) {
        if (!window.RumorEngine || !currentCode) return Promise.resolve();
        const deed = Object.assign({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), day: rumDay(), hold: rumPartyHold(), spread: [] }, d);
        if (!deed.hold) deed.hold = rumPartyHold();
        const list = (lastData.deeds || []).slice();
        if (deed.kind === 'kill') {
            const k = window.RumorEngine.mergeKey(deed);
            const ex = list.find(x => x.kind === 'kill' && window.RumorEngine.mergeKey(x) === k && !(x.spread || []).length);
            if (ex) { ex.count = (ex.count || 1) + (deed.count || 1); return rumSaveDeeds(list).catch(e => console.error(e)); }
        }
        list.push(deed);
        return rumSaveDeeds(list).catch(e => console.error(e));
    };

    // Вызывается на каждый снимок сессии: что нового случилось?
    function rumOnSnapshot(d) {
        if (!window.RumorEngine) return;
        const enemies = d.enemies || [], parts = d.participants || {};
        if (rumFirst) {
            rumFirst = false;
            rumSeenDead = new Set(enemies.filter(e => (e.curHp || 0) <= 0).map(e => e.id)); // (включая шаблоны с 0 ХП)
            rumSeenFallen = new Set(Object.keys(parts).filter(u => parts[u] && parts[u].fallen));
            rumDayDone = (d.rumorSettings && d.rumorSettings.lastDay != null) ? d.rumorSettings.lastDay : (d.gameDayCounter || 0);
            return;
        }
        // победы
        const fresh = enemies.filter(e => (e.curHp || 0) <= 0 && (e.maxHp || 0) > 0 && !rumSeenDead.has(e.id));
        fresh.forEach(e => rumSeenDead.add(e.id));
        if (fresh.length) {
            const groups = {};
            fresh.forEach(e => { const n = window.RumorEngine.clean(e.name); (groups[n] = groups[n] || []).push(e); });
            Object.keys(groups).forEach(n => window.rumAddDeed({ kind: 'kill', enemy: n, ecat: rumEnemyCat(n), count: groups[n].length, who: rumPartyNames() }));
        }
        // павшие игроки
        Object.keys(parts).forEach(u => {
            const p = parts[u] || {};
            if (p.fallen && !rumSeenFallen.has(u)) { rumSeenFallen.add(u); window.rumAddDeed({ kind: 'fall', who: [p.name || '?'] }); }
            if (!p.fallen) rumSeenFallen.delete(u);
        });
        // новый день → слухи расходятся сами
        const day = d.gameDayCounter || 0;
        if (day > rumDayDone) { rumDayDone = day; rumAutoSpread(day); }
    }

    function rumBuildRumor(deed, mode, holdOverride) {
        const RE = window.RumorEngine, set = rumSettings();
        const c = RE.compose(deed, mode, { tone: set.tone });
        const hold = holdOverride || RE.chooseHold(deed, { allHolds: rumAllHolds(), partyHold: rumPartyHold() });
        return { text: c.text, truth: c.truth, kind: c.kind, hold: hold };
    }

    function rumAutoSpread(day) {
        const set = rumSettings();
        const extra = { 'rumorSettings.lastDay': day };
        if (!set.auto) { db.collection('sessions').doc(currentCode).update(extra).catch(() => { }); return; }
        const RE = window.RumorEngine;
        const deeds = (lastData.deeds || []).map(x => Object.assign({}, x, { spread: (x.spread || []).slice() }));
        const el_ = RE.eligibleDeeds(deeds, day);
        if (!el_.length) { db.collection('sessions').doc(currentCode).update(extra).catch(() => { }); return; }
        const n = el_.length >= 4 ? 2 : 1;
        const newRumors = [];
        el_.slice(0, n).forEach(deed => {
            const r = rumBuildRumor(deed, 'auto');
            const rum = { id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), text: r.text, hold: r.hold, truth: r.truth, kind: r.kind, deedId: deed.id, day: day, auto: true };
            deed.spread.push({ hold: r.hold, truth: r.truth, rumorId: rum.id, day: day });
            newRumors.push(rum);
        });
        lastData.deeds = deeds;
        db.collection('sessions').doc(currentCode).update(Object.assign({
            deeds: stripUndefinedDeep(deeds),
            'journal.rumors': firebase.firestore.FieldValue.arrayUnion(...newRumors)
        }, extra)).then(() => {
            const r = el('rum-result'); if (r) r.textContent = '🗣 Новый день: пущено слухов — ' + newRumors.length + '.';
        }).catch(e => console.error(e));
    }

    window.rumSetSetting = function (key, val) {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ ['rumorSettings.' + key]: val }).catch(e => alert('Ошибка: ' + e.message));
    };

    function rumFillSelects() {
        const holds = rumAllHolds();
        const hs = el('rum-hold');
        if (hs && !hs.options.length) hs.innerHTML = '<option value="">Куда дойдёт — по случаю</option>' + holds.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        const nh = el('rum-new-hold');
        if (nh && !nh.options.length) nh.innerHTML = '<option value="">Где — где сейчас партия</option>' + holds.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        const nk = el('rum-new-kind');
        if (nk && !nk.options.length && window.RumorEngine) nk.innerHTML = Object.keys(window.RumorEngine.KIND_INFO).filter(k => ['feat', 'deed', 'trade', 'magic', 'crime', 'kill', 'misc'].indexOf(k) >= 0)
            .map(k => `<option value="${k}">${window.RumorEngine.KIND_INFO[k].icon} ${window.RumorEngine.KIND_INFO[k].label}</option>`).join('');
    }

    function rumRender() {
        if (!window.RumorEngine || !el('rum-deeds')) return;
        rumFillSelects();
        const set = rumSettings();
        const ca = el('rum-auto'); if (ca && document.activeElement !== ca) ca.checked = !!set.auto;
        const ct = el('rum-tone'); if (ct && document.activeElement !== ct) ct.value = set.tone;
        const deeds = (lastData.deeds || []).slice().reverse();
        const KI = window.RumorEngine.KIND_INFO;
        el('rum-deeds').innerHTML = deeds.length ? deeds.map(d => `<div class="party-row" style="display:flex; gap:6px; align-items:center; justify-content:space-between;">
            <span style="flex:1; font-size:13px;">${(KI[d.kind] || KI.misc).icon} ${escapeHtml(rumDeedText(d))}
              <span style="opacity:.6; font-size:11px;"> · день ${d.day || 0} · слухов: ${(d.spread || []).length}</span></span>
            <span style="display:flex; gap:4px; flex:0 0 auto;">
              <button style="width:auto; padding:2px 8px;" onclick="rumStartDraft('${d.id}')">🗣 Слух</button>
              <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="rumDeleteDeed('${d.id}')">🗑</button></span></div>`).join('')
            : '<p style="opacity:.6; font-size:13px;">Деяний пока нет — они появятся, когда партия победит врагов, кто-то падёт, выдадут штраф или квест.</p>';
    }

    function rumShowDraft() {
        const box = el('rum-draft');
        if (!rumDraft) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        const TL = { true: '✔ верный', twist: '≈ искажённый', false: '✘ ложный' };
        el('rum-draft-info').textContent = 'Вид: ' + (TL[rumDraft.truth] || '?') + ' · дойдёт до: ' + (rumDraft.hold || '—') + ' (текст можно править)';
        el('rum-draft-text').value = rumDraft.text;
    }
    window.rumStartDraft = function (deedId) {
        const deed = (lastData.deeds || []).find(d => d.id === deedId);
        if (!deed) return;
        const r = rumBuildRumor(deed, el('rum-mode').value, el('rum-hold').value);
        rumDraft = { deedId: deedId, text: r.text, hold: r.hold, truth: r.truth, kind: r.kind };
        rumShowDraft();
        el('rum-draft').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    window.rumReroll = function () { if (rumDraft) window.rumStartDraft(rumDraft.deedId); };
    window.rumCancelDraft = function () { rumDraft = null; rumShowDraft(); };
    window.rumPublishDraft = function () {
        if (!rumDraft || !currentCode) return;
        const text = (el('rum-draft-text').value || '').trim();
        if (!text) return;
        const deeds = (lastData.deeds || []).map(x => Object.assign({}, x, { spread: (x.spread || []).slice() }));
        const deed = deeds.find(d => d.id === rumDraft.deedId);
        const rum = { id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), text: text, hold: rumDraft.hold || '', truth: rumDraft.truth, kind: rumDraft.kind, deedId: rumDraft.deedId, day: rumDay() };
        if (deed) deed.spread.push({ hold: rum.hold, truth: rum.truth, rumorId: rum.id, day: rumDay() });
        lastData.deeds = deeds;
        db.collection('sessions').doc(currentCode).update({
            deeds: stripUndefinedDeep(deeds),
            'journal.rumors': firebase.firestore.FieldValue.arrayUnion(stripUndefinedDeep(rum))
        }).then(() => {
            el('rum-result').textContent = '📢 Слух пущен' + (rum.hold ? ' (' + rum.hold + ')' : '') + '.';
            rumDraft = null; rumShowDraft();
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.rumDeleteDeed = function (id) {
        rumSaveDeeds((lastData.deeds || []).filter(d => d.id !== id)).catch(e => alert('Ошибка: ' + e.message));
    };
    window.rumAddManual = function () {
        const what = (el('rum-new-what').value || '').trim();
        const kind = el('rum-new-kind').value || 'misc';
        if (!what) { el('rum-result').textContent = 'Напиши, что сделали.'; return; }
        const d = { kind: kind, what: what, who: rumPartyNames(), place: (el('rum-new-place').value || '').trim() };
        if (kind === 'kill') { d.enemy = what; d.count = 1; }
        const h = el('rum-new-hold').value; if (h) d.hold = h;
        window.rumAddDeed(d).then(() => { el('rum-new-what').value = ''; el('rum-new-place').value = ''; el('rum-result').textContent = '✅ Деяние записано.'; });
    };
    window.gmRevealRumor = function (id) {
        const rest = ((lastData.journal || {}).rumors || []).map(r => r.id === id ? Object.assign({}, r, { verdict: r.truth || 'true' }) : r);
        db.collection('sessions').doc(currentCode).update({ 'journal.rumors': stripUndefinedDeep(rest) }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmDeleteRumor = function (id) {
        const rest = ((lastData.journal || {}).rumors || []).filter(r => r.id !== id);
        db.collection('sessions').doc(currentCode).update({ 'journal.rumors': rest }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmDeleteJournalEntry = function (id) {
        const rest = ((lastData.journal || {}).entries || []).filter(e => e.id !== id);
        db.collection('sessions').doc(currentCode).update({ 'journal.entries': rest }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Подготовка сессии: всё по выбранному владению на одном экране ----------
    let prepHold = null;       // выбранное владение (если мастер выбрал руками)
    let prepRenderedKey = '';  // что сейчас нарисовано — чтобы не схлопывать шторки на каждом снимке сессии

    function prepMatchEnemies(text) {
        if (!text || !window.enemiesData) return [];
        const toks = String(text).toLowerCase().split(/[^а-яёa-z]+/).filter(Boolean);
        const res = [];
        window.enemiesData.forEach((e, i) => {
            const words = e.name.toLowerCase().split(/[^а-яё]+/).filter(Boolean);
            if (words.length && words.every(w => { const st = w.length <= 4 ? w : w.slice(0, -2); return toks.some(t => t.startsWith(st)); })) res.push(i);
        });
        return res;
    }

    // «Название» — описание; «Название2» — описание2  →  [{title, desc}]
    function prepParseQuests(text) {
        if (!text) return [];
        return String(text).split(/;\s*(?=«)/).map(s => s.trim()).filter(Boolean).map(s => {
            const m = s.match(/^«([^»]+)»\s*[—-]?\s*(.*)$/s);
            return m ? { title: m[1].trim(), desc: m[2].trim() } : { title: s.slice(0, 60), desc: s };
        });
    }

    // Текст для игроков по умолчанию — первые предложения описания (до ~300 знаков), без перечня врагов и лута
    function prepPlayerText(desc) {
        const t = String(desc || '').trim();
        if (!t) return '';
        const sentences = t.replace(/([.!?])\s+/g, '$1\u0001').split('\u0001'); // без lookbehind: Safari до 16.4 не разбирал весь gm.js
        let out = '';
        for (const s of sentences) { if ((out + ' ' + s).trim().length > 300 && out) break; out = (out + ' ' + s).trim(); }
        return out.length > 360 ? out.slice(0, 357) + '…' : out;
    }
    const prepPlaceId = (hold, name) => hold + '|' + name;
    function prepOpenPlaces() { return Array.isArray(lastData.openPlaces) ? lastData.openPlaces : []; }

    // Обновляет подписи/кнопки «открыто/скрыто» у мест без перерисовки всей панели (чтобы шторки не схлопывались)
    function prepRefreshOpenState() {
        const open = prepOpenPlaces();
        document.querySelectorAll('#prep-body .prep-place').forEach(div => {
            const p = open.find(x => x.id === prepPlaceId(div.dataset.hold, div.dataset.name));
            const st = div.querySelector('.prep-open-state');
            const hide = div.querySelector('.prep-hide');
            const openBtn = div.querySelector('[data-act="openplace"]');
            if (p) {
                st.innerHTML = '<span style="color:#2ecc71;">🔓 открыто' + (Array.isArray(p.toUids) && p.toUids.length ? ' (🔒 только: ' + escapeHtml(gmUidsText(p.toUids)) + ')' : '') + (typeof p.x === 'number' ? ' · с точкой на карте' : ' · без точки на карте') + '</span>';
                hide.style.display = ''; openBtn.textContent = '💾 Обновить текст/точку';
            } else {
                st.textContent = ''; hide.style.display = 'none'; openBtn.textContent = '🔓 Открыть игрокам';
            }
        });
        const listEl = el('prep-open-list');
        if (listEl) {
            listEl.innerHTML = open.length ? '<div style="font-size:13px; margin-bottom:2px;"><b>🔓 Открыто игрокам (' + open.length + '):</b></div>' + open.map(p => `<div style="display:flex; gap:6px; align-items:center; font-size:13px; margin-bottom:2px;">
                <span style="flex:1;">${typeof p.x === 'number' ? '📍' : '·'} ${escapeHtml(p.name)} <span style="opacity:.6;">(${escapeHtml(p.hold || '')})</span>${Array.isArray(p.toUids) && p.toUids.length ? ' <span style="color:#e6b800;" title="Видит только этот игрок">🔒 ' + escapeHtml(gmUidsText(p.toUids)) + '</span>' : ''}</span>
                <button style="font-size:11px; padding:1px 6px;" data-act="placepoint" data-id="${escapeHtml(p.id)}" title="Привязать к точке, выбранной на карте мастера, или к метке из справочника">📍 точка</button>
                <button style="font-size:11px; padding:1px 6px;" data-act="hideplace" data-id="${escapeHtml(p.id)}">🔒</button></div>`).join('') : '<div style="font-size:12px; opacity:.6;">Игрокам пока не открыто ни одного места.</div>';
        }
    }

    // ---------- Кому открывать точки и места: всем или одному игроку ----------
    let gmOpenTarget = '';   // uid игрока; '' — всем
    window.gmSetOpenTarget = function (v) {
        gmOpenTarget = v || '';
        ['gm-map-target', 'prep-target'].forEach(id => { const s = el(id); if (s && s.value !== gmOpenTarget) s.value = gmOpenTarget; });
    };
    function gmTargetUids() { return gmOpenTarget ? [gmOpenTarget] : null; }
    function gmUidsText(uids) {
        const pp = (lastData && lastData.participants) || {};
        return (uids || []).map(u => (pp[u] || {}).name || 'игрок').join(', ');
    }
    function populateMapTargetSelects() {
        const pp = (lastData && lastData.participants) || {};
        const uids = Object.keys(pp);
        if (gmOpenTarget && !uids.includes(gmOpenTarget)) gmOpenTarget = '';
        const opts = uids.map(u => `<option value="${escapeHtml(u)}">Только: ${escapeHtml(pp[u].name || 'игрок')}</option>`).join('');
        const sig = uids.map(u => u + ':' + (pp[u].name || '')).join('|');
        [['gm-map-target', 'Кому: всем игрокам'], ['prep-target', 'Открывать: всем игрокам']].forEach(([id, all]) => {
            const s = el(id); if (!s) return;
            if (s.getAttribute('data-sig') !== sig) { s.innerHTML = `<option value="">${all}</option>` + opts; s.setAttribute('data-sig', sig); }
            if (s.value !== gmOpenTarget) s.value = gmOpenTarget;
        });
    }

    // Координаты места для привязки. ЯВНО выбранная на карте точка важнее метки из справочника (раньше было наоборот — старая метка
    // из справочника молча перебивала точку, которую мастер только что выбрал). Если выбрано ПОСЕЛЕНИЕ — привязка требует подтверждения
    // (иначе место «приклеивалось» к городу, выбранному ещё раньше для партии/маршрута: у игрока «пинговался» Солитьюд вместо статуи).
    function prepPlaceCoords(hold, name) {
        const selOk = gmMapSel && typeof gmMapSel.x === 'number' && (!gmMapSel.hold || gmMapSel.hold === hold);
        if (selOk) {
            const isSettle = !!(gmMapSel.name && window.HoldsMap && window.HoldsMap.NODES[gmMapSel.name]);
            const where = isSettle ? 'город «' + gmMapSel.name + '»' : (gmMapSel.name ? 'точка «' + gmMapSel.name + '»' : 'точка, выбранная на карте мастера');
            return Object.assign({ x: gmMapSel.x, y: gmMapSel.y, src: where + ' (' + Math.round(gmMapSel.x) + ', ' + Math.round(gmMapSel.y) + ')', fromSel: true, isSettle, selName: gmMapSel.name || '' },
                typeof gmMapSel.u === 'number' && typeof gmMapSel.v === 'number' ? { u: gmMapSel.u, v: gmMapSel.v } : {});
        }
        try {
            const pins = window.HoldsMap && window.HoldsMap.loadPins ? window.HoldsMap.loadPins() : {};
            const p = pins[hold] && pins[hold][name];
            if (p && typeof p.x === 'number') return Object.assign({ x: p.x, y: p.y, src: 'метка из справочника владений' }, typeof p.u === 'number' && typeof p.v === 'number' ? { u: p.u, v: p.v } : {});
        } catch (e) { }
        return null;
    }
    function prepConfirmCoords(c, placeName) {
        if (c && c.isSettle) {
            return confirm('Сейчас на карте выбран город «' + c.selName + '». Привязать «' + placeName + '» к координатам этого города?\n\nЕсли нужна другая точка — нажми «Отмена», кликни нужное место на карте владения и повтори.');
        }
        return true;
    }
    // после привязки: сбрасываем выбранную точку (чтобы она не «прилипла» к следующему месту) и показываем место на карте мастера
    function prepAfterBind(c, hold) {
        if (c && c.fromSel) gmMapSel = null;
        if (hold && window.HoldsMap && window.HoldsMap.HOLDS[hold]) gmMapHold = hold;
        if (typeof window.renderGmMap === 'function') window.renderGmMap(true);
    }

    function prepWritePlaces(arr, logText) {
        const upd = { openPlaces: arr };
        if (logText) upd.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: logText });
        return db.collection('sessions').doc(currentCode).update(upd);
    }

    function prepHoldKey() {
        const k = prepHold || (lastData && lastData.currentHold) || (lastData && lastData.partyPos && lastData.partyPos.hold) || '';
        if (!k || !window.holdsData || window.holdsData[k]) return k;
        // название из погоды/карты могло отличаться от ключа справочника — ищем по вхождению
        return Object.keys(window.holdsData).find(h => h.includes(k) || k.includes(h)) || k;
    }

    function renderPrepNow() {
        const box = el('prep-now');
        if (!box) return;
        const d = lastData || {};
        const parts = [];
        if (d.timePeriod) parts.push('🕒 ' + escapeHtml(d.timePeriod));
        if (d.currentRegion) parts.push('📍 ' + escapeHtml(d.currentRegion));
        if (d.currentWeather && WEATHER_LABELS[d.currentWeather]) parts.push(WEATHER_LABELS[d.currentWeather] + (WEATHER_EFFECTS[d.currentWeather] ? ' — ' + escapeHtml(WEATHER_EFFECTS[d.currentWeather]) : ''));
        const pp = d.partyPos;
        parts.push('🧭 Партия: ' + (pp && (pp.name || pp.hold) ? escapeHtml(pp.name || pp.hold) + (pp.hold && pp.name ? ' (' + escapeHtml(pp.hold) + ')' : '') : '<span style="opacity:.6;">метка не поставлена</span>'));
        const people = Object.values(d.participants || {});
        const party = people.length ? people.map(p => `${p.fallen ? '⚰️ ' : ''}${escapeHtml(p.name || '?')} ${p.curHp || 0}/${p.maxHp || 0} ХП`).join(' · ') : '<span style="opacity:.6;">игроков нет</span>';
        box.innerHTML = '<div style="font-size:13px; line-height:1.6;">' + parts.join('<br>') + '<br>👥 ' + party + '</div>';
    }

    window.renderPrep = function (force) {
        renderPrepNow();
        setTimeout(prepRefreshOpenState, 0);
        const sel = el('prep-hold');
        if (!sel || !window.holdsData) return;
        if (!sel.options.length) {
            sel.innerHTML = '<option value="">— выбери владение —</option>' + Object.keys(window.holdsData).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        }
        const key = prepHoldKey();
        if (document.activeElement !== sel) sel.value = window.holdsData[key] ? key : '';
        const filt = (el('prep-search') || {}).value || '';
        const rk = key + '|' + (el('prep-all-people') && el('prep-all-people').checked) + '|' + filt;
        if (!force && rk === prepRenderedKey) return;
        prepRenderedKey = rk;
        const out = el('prep-body');
        const hold = window.holdsData[key];
        if (!hold) { out.innerHTML = '<p style="opacity:.7; font-size:14px;">Выбери владение (или поставь метку партии на карте — оно подставится само).</p>'; return; }
        const q = filt.trim().toLowerCase();
        const allPeople = !!(el('prep-all-people') && el('prep-all-people').checked);
        const info = hold.info && typeof hold.info === 'object' ? (hold.info['Описание'] || hold.info['Общее'] || hold.info['География'] || Object.values(hold.info)[0] || '') : (hold.info || '');
        let h = info ? `<div style="font-size:13px; opacity:.85; margin-bottom:6px;">${escapeHtml(String(info).slice(0, 500))}${String(info).length > 500 ? '…' : ''}</div>` : '';

        // Жители
        let nPeople = 0, nQuests = 0;
        let hp = '';
        (hold.settlements || []).forEach(s => {
            let sh = '';
            (s.places || []).forEach(pl => {
                (pl.people || []).forEach(pp => {
                    const quests = prepParseQuests(pp.quests);
                    if (!allPeople && !quests.length) return;
                    if (q && !((pp.name || '') + ' ' + (pp.role || '') + ' ' + (pp.quests || '') + ' ' + (pl.name || '')).toLowerCase().includes(q)) return;
                    nPeople++; nQuests += quests.length;
                    sh += `<details style="margin:2px 0 2px 8px;"><summary style="cursor:pointer; font-size:13px;"><b>${escapeHtml(pp.name)}</b> <span style="opacity:.7;">— ${escapeHtml(pp.role || '')}, ${escapeHtml(pl.name || '')}</span>${quests.length ? ' <span style="color:var(--accent-color);">· квестов: ' + quests.length + '</span>' : ''}</summary>
                        <div style="font-size:12px; opacity:.85; margin:3px 0 4px 10px;">${escapeHtml(pp.bio || '')}</div>
                        ${quests.map(qq => `<div style="margin:2px 0 4px 10px; padding-left:6px; border-left:2px solid var(--accent-color); font-size:12px;">
                            <b>«${escapeHtml(qq.title)}»</b> ${escapeHtml(qq.desc)}<br>
                            <button style="font-size:11px; padding:1px 6px;" data-act="rumor" data-person="${escapeHtml(pp.name)}" data-title="${escapeHtml(qq.title)}">🗣 в слухи</button>
                            <button style="font-size:11px; padding:1px 6px;" data-act="quest" data-person="${escapeHtml(pp.name)}" data-role="${escapeHtml(pp.role || '')}" data-title="${escapeHtml(qq.title)}" data-desc="${escapeHtml(qq.desc)}">📜 в форму квеста</button>
                        </div>`).join('')}
                    </details>`;
                });
            });
            if (sh) hp += `<details open style="margin:4px 0;"><summary style="cursor:pointer; font-weight:bold;">${escapeHtml(s.name)}</summary>${sh}</details>`;
        });
        h += `<h3 style="margin:8px 0 2px;">🏘 Жители и зацепки <span style="font-weight:normal; font-size:12px; opacity:.7;">(${nPeople} чел., ${nQuests} квестов)</span></h3>` + (hp || '<p style="opacity:.6; font-size:13px;">Никого не найдено.</p>');

        // Места
        let lp = '', enemySet = new Set();
        (hold.categories || []).forEach(c => {
            let ch = '';
            (c.locations || []).forEach(l => {
                if (q && !((l.name || '') + ' ' + (l.desc || '') + ' ' + (l.enemies || '') + ' ' + (l.loot || '')).toLowerCase().includes(q)) return;
                const en = prepMatchEnemies(l.enemies).slice(0, 8);
                en.forEach(i => enemySet.add(i));
                ch += `<details style="margin:2px 0 2px 8px;"><summary style="cursor:pointer; font-size:13px;"><b>${escapeHtml(l.name)}</b></summary>
                    <div style="font-size:12px; margin:3px 0 4px 10px; line-height:1.5;">
                        ${l.desc ? escapeHtml(l.desc) + '<br>' : ''}
                        ${l.enemies ? '<b>Враги:</b> ' + escapeHtml(l.enemies) + '<br>' : ''}
                        ${l.loot ? '<b>Лут:</b> ' + escapeHtml(l.loot) + '<br>' : ''}
                        ${l.reward && l.reward !== l.loot ? '<b>Награда:</b> ' + escapeHtml(l.reward) + '<br>' : ''}
                        ${l.features ? '<b>Особенности:</b> ' + escapeHtml(l.features) + '<br>' : ''}
                        ${en.length ? '<span style="opacity:.7;">В бой:</span> ' + en.map(i => `<button style="font-size:11px; padding:1px 6px;" data-act="enemy" data-idx="${i}">+ ${escapeHtml(window.enemiesData[i].name)}</button>`).join(' ') + '<br>' : ''}
                        <button style="font-size:11px; padding:1px 6px; margin-top:3px;" data-act="placerumor" data-place="${escapeHtml(l.name)}">🗣 слух об этом месте</button>
                        <div class="prep-place" data-hold="${escapeHtml(key)}" data-name="${escapeHtml(l.name)}" data-cat="${escapeHtml(c.name || '')}" style="margin-top:6px; padding:5px 6px; border:1px dashed var(--border-color); border-radius:4px;">
                            <div style="font-size:11px; opacity:.7;">Текст для игроков (правь, чтобы не выдать лишнего):</div>
                            <textarea class="prep-place-text" rows="3" style="width:100%; font-size:12px;">${escapeHtml(prepPlayerText(l.desc))}</textarea>
                            <button style="font-size:11px; padding:1px 6px;" data-act="openplace">🔓 Открыть игрокам</button>
                            <button class="prep-hide" style="font-size:11px; padding:1px 6px; display:none;" data-act="hideplace">🔒 Скрыть</button>
                            <span class="prep-open-state" style="font-size:11px; margin-left:4px;"></span>
                        </div>
                    </div></details>`;
            });
            if (ch) lp += `<details style="margin:4px 0;"><summary style="cursor:pointer; font-weight:bold;">${escapeHtml(c.name)}</summary>${ch}</details>`;
        });
        h += `<h3 style="margin:10px 0 2px;">🏰 Места и подземелья</h3>` + (lp || '<p style="opacity:.6; font-size:13px;">Ничего не найдено.</p>');

        // Враги владения
        const eList = [...enemySet].sort((a, b) => a - b);
        h += `<h3 style="margin:10px 0 2px;">👹 Кто здесь водится <span style="font-weight:normal; font-size:12px; opacity:.7;">(подбор по описаниям мест; нажми, чтобы добавить в бой)</span></h3>` +
            (eList.length ? eList.map(i => `<button style="font-size:12px; padding:2px 8px; margin:2px;" data-act="enemy" data-idx="${i}">+ ${escapeHtml(window.enemiesData[i].name)}</button>`).join('') : '<p style="opacity:.6; font-size:13px;">Не удалось подобрать.</p>');
        out.innerHTML = h;
    };

    window.prepPickHold = function (v) { prepHold = v || null; window.renderPrep(true); };

    window.prepRollEvent = function () {
        const box = el('prep-event');
        if (!window.randomEventsData || !window.randomEventsData.length) { box.textContent = 'Нет данных о событиях.'; return; }
        const e = window.randomEventsData[Math.floor(Math.random() * window.randomEventsData.length)];
        box.dataset.text = e.name;
        box.innerHTML = `<b>${escapeHtml(e.name)}</b> <span style="opacity:.6;">(д100: ${e.roll})</span><br>${escapeHtml(e.desc)}${e.req ? '<br><span style="opacity:.65; font-size:12px;">Условие: ' + escapeHtml(e.req) + '</span>' : ''}
            <br><button style="font-size:12px; margin-top:4px;" onclick="prepAnnounceEvent()">📣 Сообщить в журнал боя</button>`;
    };
    window.prepAnnounceEvent = function () {
        const t = (el('prep-event').dataset.text || '').trim();
        if (t) gmPostLogEntryText('🎲 Случайная встреча в пути: ' + t + '.');
    };

    function prepAddRumor(text) {
        if (!currentCode) { alert('Нет активной сессии.'); return; }
        db.collection('sessions').doc(currentCode).update({
            'journal.rumors': firebase.firestore.FieldValue.arrayUnion({ id: 'r' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), text: text })
        }).then(() => { el('prep-result').textContent = 'Слух добавлен: ' + text; }).catch(e => alert('Ошибка: ' + e.message));
    }

    function prepOnClick(ev) {
        const b = ev.target.closest('button[data-act]');
        if (!b) return;
        ev.preventDefault();
        const act = b.dataset.act;
        if (act === 'rumor') {
            prepAddRumor('Говорят, ' + b.dataset.person + ' ищет помощников — дело зовётся «' + b.dataset.title + '».');
        } else if (act === 'placerumor') {
            prepAddRumor('Ходят слухи о месте «' + b.dataset.place + '» — путники советуют быть осторожнее.');
        } else if (act === 'quest') {
            el('quest-title-input').value = b.dataset.title;
            el('quest-desc-input').value = b.dataset.person + (b.dataset.role ? ' (' + b.dataset.role + ')' : '') + ': ' + b.dataset.desc;
            el('quest-req-input').value = '';
            el('quest-reward-input').value = '';
            el('prep-result').textContent = 'Квест «' + b.dataset.title + '» подставлен в форму выдачи квестов — проверь награду и выдай.';
            const f = el('quest-title-input'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (act === 'openplace' || act === 'hideplace' || act === 'placepoint') {
            if (!currentCode) { alert('Нет активной сессии.'); return; }
            const res = el('prep-result');
            const open = prepOpenPlaces().slice();
            if (act === 'hideplace') {
                const div = b.closest('.prep-place');
                const id = b.dataset.id || prepPlaceId(div.dataset.hold, div.dataset.name);
                const p = open.find(x => x.id === id);
                prepWritePlaces(open.filter(x => x.id !== id)).then(() => { res.textContent = 'Место скрыто' + (p ? ': ' + p.name : '') + '.'; }).catch(e => alert('Ошибка: ' + e.message));
            } else if (act === 'placepoint') {
                const p = open.find(x => x.id === b.dataset.id); if (!p) return;
                const c = prepPlaceCoords(p.hold, p.name);
                if (!c) { alert('Нет точки: выбери её на карте мастера (в приближении владения) или поставь метку места в справочнике владений.'); return; }
                if (!prepConfirmCoords(c, p.name)) return;
                const next = open.map(x => x.id === p.id ? Object.assign({}, x, { x: c.x, y: c.y }, c.u !== undefined ? { u: c.u, v: c.v } : {}) : x);
                prepWritePlaces(next).then(() => { res.textContent = '«' + p.name + '» привязано к карте: ' + c.src + '. Оно показано на карте мастера зелёным.'; prepAfterBind(c, p.hold); }).catch(e => alert('Ошибка: ' + e.message));
            } else {
                const div = b.closest('.prep-place');
                const hold = div.dataset.hold, name = div.dataset.name, cat = div.dataset.cat;
                const id = prepPlaceId(hold, name);
                const text = (div.querySelector('.prep-place-text').value || '').trim();
                const c = prepPlaceCoords(hold, name);
                if (c && !prepConfirmCoords(c, name)) return;
                const entry = { id, hold, name, cat, desc: text, ts: Date.now() };
                const tUids = gmTargetUids();
                if (tUids) entry.toUids = tUids;   // открыто лично этим игрокам (без поля — всем)
                if (c) { entry.x = c.x; entry.y = c.y; if (c.u !== undefined) { entry.u = c.u; entry.v = c.v; } }
                const was = open.find(x => x.id === id);
                if (was && !c && typeof was.x === 'number') { entry.x = was.x; entry.y = was.y; if (was.u !== undefined) { entry.u = was.u; entry.v = was.v; } }
                const next = open.filter(x => x.id !== id).concat([entry]);
                const logTxt = was ? null : (tUids ? '🔓 Игроку (' + gmUidsText(tUids) + ') открыто место: «' + name + '».' : '🔓 Открыто новое место: «' + name + '» (' + hold + ').');
                prepWritePlaces(next, logTxt).then(() => {
                    prepAfterBind(c, hold);
                    res.textContent = (was ? 'Обновлено: ' : 'Открыто игрокам: ') + name + (entry.x !== undefined ? ' — с точкой на карте (' + (c ? c.src : 'прежняя точка') + ').' : ' — без точки на карте: игроки увидят его только в списке «Известные места». Выбери точку на карте мастера и нажми «📍 точка» в списке открытых.');
                }).catch(e => alert('Ошибка: ' + e.message));
            }
        } else if (act === 'enemy') {
            if (!currentCode) { alert('Нет активной сессии.'); return; }
            const idx = b.dataset.idx;
            el('enemy-db-select').value = idx;
            window.onEnemyDbPicked();
            window.addEnemy();
            el('prep-result').textContent = 'В бой добавлен: ' + window.enemiesData[parseInt(idx)].name;
        }
    }
    document.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('#prep-body')) prepOnClick(ev); });

    // Панели перерисовываются на каждый снимок сессии (heartbeat, сохранения игроков). Недописанное в полях,
    // которые пересоздаются innerHTML (лут/ХП врага, «Новый штраф»), и выбор в пересобранных списках
    // («Порядок ходов → выбрать») раньше сбрасывались. Запоминаем и возвращаем.
    function gmFormKey(f) {
        if (f.id) return '#' + f.id;
        const h = f.getAttribute('onchange') || f.getAttribute('oninput') || f.getAttribute('onblur') || '';
        return h ? 'h:' + h + '|' + (f.getAttribute('name') || '') : '';
    }
    function gmFindByKey(key) {
        if (key.charAt(0) === '#') return document.getElementById(key.slice(1));
        const list = document.querySelectorAll('input, textarea, select');
        for (let i = 0; i < list.length; i++) if (gmFormKey(list[i]) === key) return list[i];
        return null;
    }
    function gmKeepForms(fn) {
        const saved = [];
        const act = document.activeElement;
        document.querySelectorAll('input, textarea, select').forEach(f => {
            if (/^(checkbox|radio|file|button|submit|hidden)$/.test(f.type)) return;
            const key = gmFormKey(f); if (!key) return;
            const dirty = f.tagName === 'SELECT' ? true : (f === act || f.value !== f.defaultValue);
            if (!dirty) return;
            saved.push({ f, key, value: f.value, focus: f === act, sel: f === act && typeof f.selectionStart === 'number' ? [f.selectionStart, f.selectionEnd] : null });
        });
        try { fn(); } finally {
            saved.forEach(x => {
                const replaced = !document.body.contains(x.f);
                if (x.f.tagName === 'SELECT' && !replaced) {
                    if (x.f.value !== x.value && Array.from(x.f.options).some(o => o.value === x.value)) x.f.value = x.value;
                    return;
                }
                if (!replaced) return;
                const nf = gmFindByKey(x.key); if (!nf || nf.tagName !== x.f.tagName) return;
                if (nf.tagName === 'SELECT' && !Array.from(nf.options).some(o => o.value === x.value)) return;
                nf.value = x.value;
                if (x.focus) { try { nf.focus(); if (x.sel) nf.setSelectionRange(x.sel[0], x.sel[1]); } catch (e) { } }
            });
        }
    }
    function renderAll() { gmKeepForms(renderAllInner); }
    function renderAllInner() {
        renderPrep();
        rumRender();
        renderJournalGm();
        renderParty(lastData.participants || {});
        renderKickedList(lastData.kicked);
        renderGmStash(lastData);
        if (window.renderEpic3Session) window.renderEpic3Session(lastData);
        renderGmTimers();
        renderCraftOrderSelects();
        renderEnemies(lastData.enemies || []);
        renderTurnOrder(lastData.turnOrder || []);
        renderTurnOrderPickSelect();
        renderLog(lastData.combatLog || []);
        renderWhispers(lastData.whispers || [], lastData.gmWhispers || []);
        populateGmWhisperTarget();
        renderCampStatusGm(lastData.campState);
        populateBlockSelects();
        populateRecipePlayerSelect();
        populateInvPlayerSelect();
        populateCalcPlayerSelects();
        populateQuestTargetSelect();
        populateGmAttackSelects();
        populateLootTargetSelect();
        populateMapTargetSelects();
        if (typeof renderGroupCheckResults === 'function') renderGroupCheckResults();
        if (typeof populateCoopSelects === 'function') populateCoopSelects();
        if (typeof renderMerchantStaleness === 'function') renderMerchantStaleness();
        if (typeof window.renderGmMap === 'function') window.renderGmMap();
        try { gmRenderInbox(); } catch (e) { console.error(e); }
        try { renderDungeonPanel(); } catch (e) { console.error(e); }
        try { renderGmTraps(); gmTrapsTickWatch(lastData); } catch (e) { console.error(e); }
        try { if (el('gm-pet-select') && !el('gm-pet-select').options.length) gmRenderPetSelect(); else { const ps = el('gm-pet-give-player'); if (ps && ps.options.length !== Object.keys(lastData.participants || {}).length) gmRenderPetSelect(); } } catch (e) { }
    }
