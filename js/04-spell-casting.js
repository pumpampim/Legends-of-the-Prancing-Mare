
    // Заполняет список целей заклинания при открытии: себя, союзники из активной сессии,
    // собственные активные призванные существа. Пока это просто выбор + запись в журнал —
    // автоматическое применение конкретного эффекта на цель не наложенное (см. чат).

    // ========================================================================
    // ЗАХВАТ ДУШ (заклинание, зачарование оружия «Захват души», перк «Похититель душ»)
    // Цель — живое существо (метка: если оно умрёт в течение 5 ходов, кто бы его ни убил, душа уйдёт
    // в камень заклинателя — как у «Посоха захвата душ» по таблице магии) или труп не старше 5 ходов. Душа заполняет
    // камень душ. Сначала камень ТОГО ЖЕ размера, затем больший: мелкий камень не вмещает
    // сильную душу (в крохотный/обычный не попадёт великая, в великий — попадёт любая, кроме чёрной).
    // Чёрная душа (люди, вампиры, дремора) — только в чёрный камень; чёрный камень обычные души не берёт.
    // ========================================================================
    const SOUL_ORDER = ['petty', 'lesser', 'common', 'greater', 'grand', 'black'];
    const SOUL_LABEL = { petty: 'крохотная', lesser: 'малая', common: 'обычная', greater: 'большая', grand: 'великая', black: 'чёрная' };
    const SOUL_LABEL_GEN = { petty: 'крохотной', lesser: 'малой', common: 'обычной', greater: 'большой', grand: 'великой', black: 'чёрной' };
    const SOUL_GEM_WORD = { petty: 'крохотный', lesser: 'маленький', common: 'обычный', greater: 'большой', grand: 'великий', black: 'чёрный' };
    const SOUL_WINDOW_TURNS = 5;
    // true — для зачарования/посоха/подзарядки нужен ЗАПОЛНЕННЫЙ камень душ (иначе захват душ бесполезен).
    const SOUL_GEMS_MUST_BE_FILLED = true;
    let soulTakenLocal = {};   // id существа → true: защита от двойного захвата до обновления снимка сессии
    let soulSizeAnswered = {}; // id существа → размер, который игрок уже указал вручную

    function soulEmptyGemName(k) { const w = SOUL_GEM_WORD[k]; return w.charAt(0).toUpperCase() + w.slice(1) + ' камень душ'; }
    function soulFilledGemName(k) { return 'Заполненный ' + SOUL_GEM_WORD[k] + ' камень душ'; }
    // Камень для зачарования/посоха/подзарядки по выбранному размеру («Обычный» → заполненный или пустой, см. флаг).
    function enchantGemKey(sizeLabel) {
        return SOUL_GEMS_MUST_BE_FILLED ? 'Заполненный ' + String(sizeLabel).toLowerCase() + ' камень душ' : sizeLabel + ' камень душ';
    }
    // Какой пустой камень получит душу: точный размер, затем бóльшие. null — подходящего нет.
    function findGemForSoul(soul) {
        if (soul === 'black') return countInInventory(soulEmptyGemName('black')) > 0 ? 'black' : null;
        const idx = SOUL_ORDER.indexOf(soul);
        if (idx === -1) return null;
        for (let i = idx; i < SOUL_ORDER.length - 1; i++) { // 'black' (последний) не берём
            if (countInInventory(soulEmptyGemName(SOUL_ORDER[i])) > 0) return SOUL_ORDER[i];
        }
        return null;
    }
    function soulCorpseEligible(e, currentTurn) {
        return !!e && (e.curHp || 0) <= 0 && !e.soulTaken && !soulTakenLocal[e.id] && e.soul !== 'none' &&
            (e.diedAtTurn === undefined || currentTurn - e.diedAtTurn <= SOUL_WINDOW_TURNS);
    }
    function getSoulCorpses() {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const currentTurn = (session && session.sessionTurnCounter) || 0;
        return session ? (session.enemies || []).filter(e => soulCorpseEligible(e, currentTurn)) : [];
    }
    // Живые существа, на которых можно наложить метку захвата.
    function soulLivingEligible(e) { return !!e && (e.curHp || 0) > 0 && !e.soulTaken && e.soul !== 'none'; }
    function getSoulLivingTargets() {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        return session ? (session.enemies || []).filter(soulLivingEligible) : [];
    }
    function myCurrentUid() { return window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null; }
    // Размер души существа; для существ без данных спрашивает игрока (0 — нет души). null — отмена/нет души.
    function resolveSoulSize(enemy) {
        if (enemy.soul === 'none') return 'none';
        if (SOUL_ORDER.indexOf(enemy.soul) !== -1) return enemy.soul;
        if (soulSizeAnswered[enemy.id]) return soulSizeAnswered[enemy.id];
        const ans = prompt(`Размер души у «${enemy.name}» неизвестен. Укажи (сверься с мастером):\n1 — крохотная\n2 — малая\n3 — обычная\n4 — большая\n5 — великая\n6 — чёрная\n0 — души нет`, '2');
        const n = parseInt(ans);
        if (isNaN(n) || n < 0 || n > 6) return null;
        const size = n === 0 ? 'none' : SOUL_ORDER[n - 1];
        soulSizeAnswered[enemy.id] = size;
        return size;
    }
    // Проверка ДО траты маны. {ok, msg}
    function precheckSoulTrap(enemy) {
        if (!enemy) return { ok: false, msg: 'Захват душ: выбери цель — врага (метка: если умрёт за ' + SOUL_WINDOW_TURNS + ' ходов, душа уйдёт в камень) или труп не старше ' + SOUL_WINDOW_TURNS + ' ходов («Цель: душа …»).' };
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const currentTurn = (session && session.sessionTurnCounter) || 0;
        const living = soulLivingEligible(enemy);
        if (!living && !soulCorpseEligible(enemy, currentTurn)) return { ok: false, msg: `Душа «${enemy.name}» недоступна: существо умерло больше ${SOUL_WINDOW_TURNS} ходов назад, не имеет души или она уже захвачена.` };
        const size = resolveSoulSize(enemy);
        if (size === null) return { ok: false, msg: 'Размер души не указан — захват отменён.' };
        if (size === 'none') return { ok: false, msg: `У «${enemy.name}» нет души — захватывать нечего.` };
        if (!findGemForSoul(size)) {
            return { ok: false, msg: size === 'black'
                ? `Чёрная душа «${enemy.name}» помещается только в пустой Чёрный камень душ — его нет в инвентаре.`
                : `Нет подходящего пустого камня душ для ${SOUL_LABEL_GEN[size]} души «${enemy.name}» (нужен ${SOUL_GEM_WORD[size]} или больший, кроме чёрного).` };
        }
        return { ok: true, size, living };
    }
    // Метка на живом существе: душа заполнит камень, если оно умрёт в течение SOUL_WINDOW_TURNS ходов.
    // Сам камень заполняет processSoulTraps, когда в снимке сессии существо оказывается мёртвым.
    function markLivingSoulTrap(enemy, size) {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        const until = ((session && session.sessionTurnCounter) || 0) + SOUL_WINDOW_TURNS;
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const trap = { uid: myCurrentUid(), name: myName, size, until };
        delete soulTrapSeen[enemy.id];
        if (window.CloudSync && typeof window.CloudSync.markSoulTrapTarget === 'function') {
            window.CloudSync.markSoulTrapTarget(enemy.id, trap).then(ok => {
                if (ok === false) alert(`Метка захвата душ на «${enemy.name}» не легла: существо уже мертво или его душу забрали. Если оно умерло недавно — прочитай заклинание на его душу.`);
                else if (window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🔮 ${myName} накладывает захват душ на «${enemy.name}» (до ${until}-го хода).`, myName);
            }).catch(e => console.error(e));
        }
        return `🔮 На «${enemy.name}» наложен захват душ: если существо умрёт в течение ${SOUL_WINDOW_TURNS} ходов (кто бы его ни убил), его душа (${SOUL_LABEL[size]}) заполнит твой камень душ.`;
    }
    // Захват по цели из списка: живое — метка, труп — сразу в камень.
    function castSoulTrapOn(enemy, chk) {
        return chk.living ? { ok: true, message: markLivingSoulTrap(enemy, chk.size) } : trapSoul(enemy, 'spell', { size: chk.size });
    }
    // Снимок сессии: мои помеченные существа умерли в срок — заполняем камни.
    let soulTrapSeen = {}; // id существа → уже обработано (не повторять сообщения)
    window.processSoulTraps = function (data) {
        const uid = myCurrentUid();
        if (!uid || !data) return;
        (data.enemies || []).forEach(e => {
            const t = e.soulTrap;
            if (!t || t.uid !== uid || (e.curHp || 0) > 0 || soulTrapSeen[e.id]) return;
            soulTrapSeen[e.id] = true;
            if (e.soulTaken || soulTakenLocal[e.id]) return;
            if (e.diedAtTurn !== undefined && e.diedAtTurn > t.until) return; // умерло после окончания метки
            const r = trapSoul(e, 'spell', { size: t.size });
            if (typeof window.alchToast === 'function') window.alchToast(escHtml(r.message)); else alertSafe(r.message);
        });
        // Открытые списки целей «Захвата душ» — обновить (onfocus не срабатывает, если список уже в фокусе).
        document.querySelectorAll('.spell-target-select').forEach(sel => {
            if (sel === document.activeElement) return;
            const card = sel.closest ? sel.closest('[id^="card-"]') : null;
            const nm = card ? ((card.querySelector('.spell-name-custom') || {}).value || (card.querySelector('.spell-name-select') || {}).value) : '';
            if (nm === 'Захват душ') window.populateSpellTargetSelect(sel);
        });
    };
    // Сам захват. via: 'spell' | 'weapon'. Инвентарь меняется сразу; метка «душа забрана» — в облаке.
    function trapSoul(enemy, via, opts) {
        opts = opts || {};
        const size = opts.size || resolveSoulSize(enemy);
        if (!size || size === 'none') return { ok: false, message: size === 'none' ? `У «${enemy.name}» нет души.` : 'Размер души не указан.' };
        const gemKey = findGemForSoul(size);
        if (!gemKey) return { ok: false, message: `Душа «${enemy.name}» (${SOUL_LABEL[size]}) ускользает — нет подходящего пустого камня душ.` };
        const emptyName = soulEmptyGemName(gemKey), filledName = soulFilledGemName(gemKey);
        const proto = (window.allItems || []).find(i => i.name === filledName) || {};
        removeFromInventoryByName(emptyName, 1);
        addToInventory(filledName, filledName, 1, proto.weight || 0, 'Камни душ', proto.effect || 'Готов к зачарованию', { price: proto.price });
        soulTakenLocal[enemy.id] = true;
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const note = gemKey === size ? '' : ` (в более крупный камень — подходящих пустых не было)`;
        const msg = `🔮 Душа «${enemy.name}» (${SOUL_LABEL[size]}) заключена в «${filledName}»${note}.`;
        if (window.CloudSync) {
            window.CloudSync.markSoulTaken(enemy.id).then(ok => {
                if (ok === false) { // кто-то успел раньше — откатываем
                    removeFromInventoryByName(filledName, 1);
                    const eProto = (window.allItems || []).find(i => i.name === emptyName) || {};
                    addToInventory(emptyName, emptyName, 1, eProto.weight || 0, 'Камни душ', eProto.effect || '', { price: eProto.price });
                    renderInventoryList(); saveLocalStorage();
                    alert(`Душу «${enemy.name}» уже забрали раньше — камень «${emptyName}» остался пустым.`);
                } else if (window.CloudSync.postCombatLog) {
                    window.CloudSync.postCombatLog(`🔮 ${myName} ${via === 'weapon' ? 'оружием' : 'заклинанием'} захватывает душу «${enemy.name}» (${SOUL_LABEL[size]}) в ${filledName.toLowerCase()}.`, myName);
                }
            }).catch(() => {});
        }
        renderInventoryList();
        saveLocalStorage();
        return { ok: true, message: msg, size, gem: gemKey };
    }
    // Оружие в слоте «ловит души»: зачарование «Захват души» или призванное оружие с перком «Похититель душ».
    function weaponHasSoulTrap(slot) {
        const itemId = slot === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon;
        const item = itemId ? playerInventory.find(i => i.itemId === itemId) : null;
        if (item && ((weaponEnchantLive(item) && item.enchantment.name === 'Захват души') || /\[Захват души\]/i.test(item.name || ''))) return true;
        const wn = ((document.getElementById('wep-' + (slot === 'ranged' ? 'ranged' : 'melee') + '-name') || {}).value || '').toLowerCase();
        return wn.indexOf('призван') === 0 && isPerkChecked('Похититель душ');
    }
    // Выбор трупа для свитка (там нет списка целей).
    function pickSoulCorpseByPrompt() {
        const list = getSoulCorpses().concat(getSoulLivingTargets());
        if (!list.length) return null;
        if (list.length === 1) return list[0];
        const ans = prompt('Чью душу захватить?\n' + list.map((e, i) => `${i + 1} — ${e.name}${(e.curHp || 0) > 0 ? ' (живой — метка на ' + SOUL_WINDOW_TURNS + ' х.)' : ' (труп)'}`).join('\n'), '1');
        const n = parseInt(ans);
        return (n >= 1 && n <= list.length) ? list[n - 1] : null;
    }

    window.populateSpellTargetSelect = function (selectEl) {
        const prevVal = selectEl.value;
        let opts = '<option value="self">Цель: на себя</option>';
        const mwn = (document.getElementById('wep-melee-name') || {}).value, rwn = (document.getElementById('wep-ranged-name') || {}).value;
        opts += `<option value="weapon:melee">Цель: моё оружие — ближнее${mwn ? ' (' + escHtml(mwn) + ')' : ''}</option>`;
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        if (session && session.participants) {
            const myName = document.getElementById('char-name').value;
            Object.entries(session.participants).forEach(([uid, p]) => {
                if (p.name && p.name !== myName) opts += `<option value="ally:${escHtml(uid)}">Цель: ${escHtml(p.name)} (союзник)</option>`;
            });
        }
        (activeSummons || []).forEach(s => {
            opts += `<option value="summon:${escHtml(s.id)}">Цель: ${escHtml(s.name)} (моё существо)</option>`;
        });
        const cardEl = selectEl.closest ? selectEl.closest('[id^="card-"]') : null;
        const spNameEl = cardEl ? (cardEl.querySelector('.spell-name-custom') || {}).value || (cardEl.querySelector('.spell-name-select') || {}).value : '';
        if (spNameEl === 'Захват душ') {
            const session2 = window.CloudSync ? window.CloudSync.getSessionData() : null;
            const turn2 = (session2 && session2.sessionTurnCounter) || 0;
            getSoulCorpses().forEach(e => {
                opts += `<option value="corpse:${escHtml(e.id)}">Цель: душа «${escHtml(e.name)}» (умер ${e.diedAtTurn !== undefined ? (turn2 - e.diedAtTurn) + ' х. назад' : 'недавно'})</option>`;
            });
            const myUidS = myCurrentUid();
            getSoulLivingTargets().forEach(e => {
                const t = e.soulTrap, on = t && t.uid === myUidS && turn2 <= t.until;
                opts += `<option value="corpse:${escHtml(e.id)}">Цель: «${escHtml(e.name)}» (HP ${e.curHp}/${e.maxHp}) — душа в камень, если умрёт за ${SOUL_WINDOW_TURNS} х.${on ? ' · метка уже стоит' : ''}</option>`;
            });
        }
        if (spNameEl === 'Трансмутация смерти') {
            const sessA = window.CloudSync ? window.CloudSync.getSessionData() : null;
            (sessA ? (sessA.enemies || []) : []).filter(e => (e.curHp || 0) <= 0 && !e.ashes && (!getEnemyMeta(e).kind || getEnemyMeta(e).kind === 'people')).forEach(e => {
                opts += `<option value="corpse:${escHtml(e.id)}">Цель: труп «${escHtml(e.name)}»</option>`;
            });
        }
        selectEl.innerHTML = opts;
        if (prevVal && Array.prototype.some.call(selectEl.options, o => o.value === prevVal)) selectEl.value = prevVal;
    };

    // Общая логика "что происходит при успешном чтении заклинания" — используется и при
    // обычном касте (тратит ману), и при использовании свитка (бесплатно, isFree=true).
    // Возвращает {message, logText} для показа игроку/записи в журнал.
    // Простые бытовые заклинания с длительностью: только таймер в списке эффектов (на себя или на союзника).
    const UTILITY_TIMED = { 'Свет свечи': '🕯', 'Магический свет': '💡', 'Водное дыхание': '🫧', 'Плавники': '🐟', 'Легкое перышко': '🪶' };
    // «Трансмутация смерти»: цель — труп человека (любой расы; нежить, даэдра, звери и механизмы не подходят), ещё не обращённый в пепел.
    function precheckAshes(corpse) {
        if (!corpse) return { ok: false, msg: 'Трансмутация смерти: выбери цель — труп человека («Цель: труп …» в списке целей).' };
        if ((corpse.curHp || 0) > 0) return { ok: false, msg: '«' + corpse.name + '» ещё жив(а).' };
        if (corpse.ashes) return { ok: false, msg: 'Труп «' + corpse.name + '» уже обращён в пепел.' };
        const kindA = getEnemyMeta(corpse).kind;
        if (kindA === null) { if (!confirm('Тип существа «' + corpse.name + '» не указан. Это труп человека (любой расы)?')) return { ok: false, msg: 'Отменено.' }; }
        else if (kindA !== 'people') return { ok: false, msg: 'Трансмутация смерти действует только на трупы людей (любой расы); «' + corpse.name + '» — ' + (KIND_LABEL[kindA] || kindA) + '.' };
        return { ok: true };
    }
    function resolveSpellEffect(spellName, desc, school, targetVal, isFree, enhanced) {
        const session = window.CloudSync ? window.CloudSync.getSessionData() : null;
        let targetLabel = 'на себя';
        let allyUid = null, allyName = null;
        if (targetVal.indexOf('ally:') === 0) {
            allyUid = targetVal.slice(5);
            allyName = (session && session.participants && session.participants[allyUid] && session.participants[allyUid].name) || 'союзника';
            targetLabel = 'на ' + allyName + ' (союзник)';
        } else if (targetVal.indexOf('summon:') === 0) {
            const s = activeSummons.find(x => x.id === targetVal.slice(7));
            targetLabel = 'на ' + (s ? s.name : 'своё существо') + ' (существо)';
        }

        if (targetVal.indexOf('weapon:') === 0) targetLabel = 'на ' + (((document.getElementById('wep-' + (targetVal.slice(7) === 'ranged' ? 'ranged' : 'melee') + '-name') || {}).value) || 'своё оружие');
        let extraMsg = '';
        if (!school) school = findSpellSchoolByName(spellName);
        const sb = getSchoolBoost(school);
        const spCls = classifySpellForBoost(spellName, school);
        const isStrengthCls = (SPELL_BOOST_STRENGTH[school] || []).indexOf(spCls) !== -1;
        let boostNote = '';
        let perkDurNote = '';
        // Один раз считает число/длительность с учётом усиления школы (self и ally используют одно и то же).
        const applyBoostToTimed = (desc0, st) => {
            // st: { duration, plain, percentEffects } → меняет на месте
            if (spCls === 'ward' && /следующ[а-яё]*\s+ход/i.test(desc0) && !/(\d+)\s*ход/i.test(desc0)) st.duration = 1;
            // Перки «Двойное колдовство/иллюзия/изменение» (каст с двух рук = усиленный каст) и «Постоянство»: длительность ×2.
            if (isFinite(st.duration) && st.duration > 0) {
                const pbT = window.perkBonuses || {};
                let mT = 1; const whyT = [];
                if (enhanced && ((school === 'conj' && pbT.dualConj) || (school === 'illus' && pbT.dualIllus) || (school === 'alter' && pbT.dualAlter))) {
                    // Усиленный каст и есть каст с двух рук: если в «Усиленном эффекте» уже своя (бо́льшая) длительность,
                    // она и есть результат перка — второй раз ×2 не умножаем (раньше выходило durEnh × 2).
                    const dB = parseDurationTurns(splitEnhancedDesc(desc, false)), dE = parseDurationTurns(splitEnhancedDesc(desc, true));
                    if (!(isFinite(dB) && isFinite(dE) && dE > dB)) { mT *= 2; whyT.push('двойной каст ×2'); }
                }
                if (school === 'alter' && pbT.alterDurationDouble) { mT *= 2; whyT.push('«Постоянство» ×2'); }
                if (mT > 1) { st.duration = Math.round(st.duration * mT); perkDurNote = ` ✨ Перки (${whyT.join(', ')}): длится ${st.duration} ход.`; }
            }
            if (!sb.pct) return;
            if (isStrengthCls) {
                const sc = scaleSpellEffectNumbers(st.plain, st.percentEffects, sb.mult);
                st.plain = sc.plain; st.percentEffects = sc.percentEffects;
                boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: эффект сильнее на ${sb.pct}%.`;
            } else if (SPELL_BOOST_DURATION_SCHOOLS.indexOf(school) !== -1 && isFinite(st.duration) && /(\d+)\s*ход/i.test(desc0)) {
                const nd = Math.round(st.duration * sb.mult);
                if (nd !== st.duration) { st.duration = nd; boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: длится на ${sb.pct}% дольше (${nd} ход.).`; }
            }
        };
        const template = findSummonTemplateBySpellName(spellName);
        const myNameG = document.getElementById('char-name').value || 'Союзник';
        const pushToAlly = (uid, fields, dText, turns) => {
            if (!(window.CloudSync && typeof window.CloudSync.pushEffectToPlayer === 'function')) return false;
            window.CloudSync.pushEffectToPlayer(uid, Object.assign({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 8), name: myNameG, effectName: spellName, description: dText, turnsRemaining: turns }, fields))
                .catch(e => console.error('Ошибка отправки эффекта союзнику:', e));
            return true;
        };
        const giveBuff = (fields, dText, turns) => {
            if (targetVal === 'self') {
                pushOrRefreshTimedEffect(Object.assign({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: dText, turnsRemaining: turns }, fields));
                renderActiveEffects(); return 'self';
            }
            if (allyUid && pushToAlly(allyUid, fields, dText, turns)) return 'ally';
            return null;
        };
        // «Передышка»: лечебное заклинание Восстановления даёт ещё +10% физ. урона на 5 ходов (тому, кого лечат).
        const grantBreather = (uidAlly) => {
            if (school !== 'restor' || !(window.perkBonuses || {}).restorePhysBuff) return '';
            const pe = [{ type: 'weaponDamagePercent', value: 10 }];
            if (!uidAlly) {
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: 'Передышка', effectName: 'Передышка', description: '+10% физического урона после лечения (5 ходов)', turnsRemaining: 5, hp: 0, mp: 0, value: 0, percentEffects: pe });
                renderActiveEffects();
            } else if (window.CloudSync && typeof window.CloudSync.pushEffectToPlayer === 'function') {
                window.CloudSync.pushEffectToPlayer(uidAlly, { id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 8), name: document.getElementById('char-name').value || 'Союзник', effectName: 'Передышка', description: '+10% физического урона после лечения (5 ходов)', turnsRemaining: 5, percentEffects: pe }).catch(e => console.error(e));
            }
            return ' 💨 «Передышка»: +10% физ. урона на 5 ходов.';
        };
        if (GRID_ZONE_SPELLS[spellName] && gridZoneAvailable()) {
            // Боевая сетка: длительная зона (плащ/аура/круг/стена/камень) бьёт сама каждый ход тех, кто в ней.
            extraMsg = ' ' + castGridZone(spellName, desc, !!enhanced, isFree, (sb.pct && isStrengthCls) ? sb.mult : 1);
        } else if (spellName === 'Захват душ') {
            const corpseS = targetVal.indexOf('corpse:') === 0 && session ? (session.enemies || []).find(e => e.id === targetVal.slice(7)) : null;
            targetLabel = corpseS ? ((corpseS.curHp || 0) > 0 ? 'на «' + corpseS.name + '»' : 'на душу «' + corpseS.name + '»') : 'на душу';
            const chkS = precheckSoulTrap(corpseS);
            if (!chkS.ok) extraMsg = ' ⚠ ' + chkS.msg;
            else {
                const rS = castSoulTrapOn(corpseS, chkS);
                extraMsg = ' ' + rS.message;
            }
        } else if (spellName === 'Невидимость') {
            const fullI = findSpellDescByName(spellName) || desc;
            const stI = { duration: parseControlTextParams(fullI, enhanced).turns || 12, plain: null, percentEffects: [] };
            applyBoostToTimed(splitEnhancedDesc(fullI, enhanced), stI);
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Невидимость накладывается только на себя.';
            } else {
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName,
                    description: 'Ты невидим. Первая атака — гарантированное попадание; атака или действие с предметами снимают невидимость.',
                    turnsRemaining: stI.duration, invisible: true });
                renderActiveEffects();
                extraMsg = ` 🫥 Невидим на ${stI.duration} х. Первый удар попадёт наверняка. Невидимость спадает при атаке; если взаимодействуешь с предметами — нажми «Снять» у эффекта.`;
            }
        } else if (spellName === 'Мужество' || spellName === 'Ободрение') {
            const fullM = findSpellDescByName(spellName) || desc;
            const txtM = splitEnhancedDesc(fullM, enhanced);
            const stM = { duration: parseInt((txtM.match(/течение\s+(\d+)\s*ход/i) || [])[1]) || 8, plain: null, percentEffects: [] };
            const tempM = parseInt((txtM.match(/(\d+)\s*очк/i) || [])[1]) || (spellName === 'Мужество' ? 25 : 35);
            applyBoostToTimed(txtM, stM);
            const dM = 'Не бежит от страха ' + stM.duration + ' х.; +' + tempM + ' временных ХП (сгорают, когда эффект закончится).';
            const applySelfM = () => {
                const had = activeTimedEffects.some(x => x.effectName === spellName && x.tempHp && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
                activeTimedEffects = activeTimedEffects.filter(x => !(x.fromGm && /^(Страх|Бегство)/.test(x.effectName || '')));
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: dM, turnsRemaining: stM.duration, tempHp: tempM, fearImmune: true });
                if (!had) { const hpElM = document.getElementById('cur-hp'); hpElM.value = (parseInt(hpElM.value) || 0) + tempM; }
                renderActiveEffects();
            };
            if (spellName === 'Мужество') {
                if (targetVal === 'self') { applySelfM(); extraMsg = ' 🦁 ' + dM; }
                else if (allyUid && pushToAlly(allyUid, { tempHp: tempM, fearImmune: true }, dM, stM.duration)) extraMsg = ' 🦁 «' + allyName + '»: ' + dM;
                else extraMsg = ' ⚠ Мужество накладывается на игрока.';
            } else {
                applySelfM();
                let nAllies = 0;
                if (session && session.participants && window.CloudSync && typeof window.CloudSync.getCurrentUid === 'function') {
                    const myUidM = window.CloudSync.getCurrentUid();
                    Object.keys(session.participants).forEach(uid => { if (uid !== myUidM && pushToAlly(uid, { tempHp: tempM, fearImmune: true }, dM, stM.duration)) nAllies++; });
                }
                extraMsg = ' 🦁 ' + dM + ' Ободрены: ты и союзники (' + nAllies + ').';
            }
            if (!boostNote && sb.pct) boostNote = '';
        } else if (spellName === 'Гнозис') {
            const hpG = parseInt(document.getElementById('cur-hp').value) || 0, maxHpG = parseInt(document.getElementById('max-hp').value) || 0;
            const mpG = parseInt(document.getElementById('cur-mp').value) || 0, maxMpG = parseInt(document.getElementById('max-mp').value) || 0;
            if (targetVal !== 'self' || !maxHpG || !maxMpG) {
                extraMsg = ' ⚠ Гнозис — только на себя и нужны максимумы ХП и МП.';
            } else {
                const hpPct = Math.max(0, Math.min(1, hpG / maxHpG)), mpPct = Math.max(0, Math.min(1, mpG / maxMpG));
                const newHpG = Math.round(maxHpG * mpPct), newMpG = Math.round(maxMpG * hpPct);
                document.getElementById('cur-hp').value = newHpG; document.getElementById('cur-mp').value = newMpG;
                extraMsg = ' ⚖ Гнозис: ХП ' + hpG + ' → ' + newHpG + ' (' + Math.round(mpPct * 100) + '%), МП ' + mpG + ' → ' + newMpG + ' (' + Math.round(hpPct * 100) + '%).';
            }
        } else if (spellName === 'Очистка камней') {
            let nG = 0; const partsG = [];
            SOUL_ORDER.forEach(k => {
                const c = countInInventory(soulFilledGemName(k));
                if (c > 0) {
                    const en = soulEmptyGemName(k), protoG = (window.allItems || []).find(i => i.name === en) || {};
                    removeFromInventoryByName(soulFilledGemName(k), c);
                    addToInventory(en, en, c, protoG.weight || 0, 'Камни душ', protoG.effect || '', { price: protoG.price });
                    nG += c; partsG.push(c + '× ' + en.toLowerCase());
                }
            });
            extraMsg = nG ? ' 🔓 Души освобождены из камней (' + nG + '): ' + partsG.join(', ') + ' — камни снова пустые.' : ' ⚠ Заполненных камней душ нет.';
        } else if (spellName === 'Трансмутация') {
            const hasFe = countInInventory('Железная руда') > 0, hasAg = countInInventory('Серебряная руда') > 0;
            let from = null;
            if (hasFe && hasAg) from = (prompt('Что превратить?\n1 — железную руду в серебряную\n2 — серебряную руду в золотую', '1') || '1').trim() === '2' ? 'Серебряная руда' : 'Железная руда';
            else from = hasFe ? 'Железная руда' : (hasAg ? 'Серебряная руда' : null);
            if (!from || targetVal !== 'self') {
                extraMsg = ' ⚠ Нужна железная или серебряная руда в инвентаре.';
            } else {
                const to = from === 'Железная руда' ? 'Серебряная руда' : 'Золотая руда';
                const protoTr = (window.allItems || []).find(i => i.name === to) || {};
                removeFromInventoryByName(from, 1);
                addToInventory(to, to, 1, protoTr.weight || 1, protoTr.category || 'Кузнечные ингредиенты', protoTr.effect || '', { price: protoTr.price });
                extraMsg = ' ⚗ ' + from + ' превращена в ' + to.toLowerCase() + '.';
            }
        } else if (spellName === 'Трансмутация мускулы на себя' || spellName === 'Трансмутация мускулы на цель') {
            const fullT = findSpellDescByName(spellName) || desc;
            const txtT = splitEnhancedDesc(fullT, enhanced);
            const stT = { duration: parseInt((txtT.match(/на\s+(\d+)\s*ход/i) || [])[1]) || 20, plain: null, percentEffects: [] };
            const unT = parseInt((txtT.match(/рукопашный урон на\s+(\d+)/i) || [])[1]) || 10;
            const hpT = parseInt((txtT.match(/ХП на\s+(\d+)/i) || [])[1]) || 30;
            const wT = parseInt((txtT.match(/вес на\s+(\d+)/i) || [])[1]) || 30;
            applyBoostToTimed(txtT, stT);
            const dT = '+' + unT + ' к рукопашному урону (кулаки), +' + hpT + ' к максимуму ХП, +' + wT + ' к переносимому весу на ' + stT.duration + ' х.';
            const whoT = giveBuff({ hp: hpT, weight: wT, unarmedDmg: unT }, dT, stT.duration);
            extraMsg = whoT === 'self' ? ' 💪 ' + dT : whoT === 'ally' ? ' 💪 «' + allyName + '»: ' + dT : ' ⚠ Выбери цель: на себя или на союзника.';
        } else if (spellName === 'Трансформация Арктуса') {
            const fullA = findSpellDescByName(spellName) || desc;
            const txtA = splitEnhancedDesc(fullA, enhanced);
            // По таблице магии — 4 ступени: 25/50/75/100 ХП, +10/20/30/40% физ. урона, поддержание 14/26/32/40 маны/ход.
            const ARCTUS_STEPS = [[25, 10, 14], [50, 20, 26], [75, 30, 32], [100, 40, 40]];
            let stepA = 1;
            if (targetVal === 'self') {
                const ansA = window.prompt('Трансформация Арктуса — ступень (1–4):\n1: +25 ХП, +10% урона, 14 маны/ход\n2: +50 ХП, +20%, 26 маны/ход\n3: +75 ХП, +30%, 32 маны/ход\n4: +100 ХП, +40%, 40 маны/ход', enhanced ? '3' : '1');
                stepA = Math.min(4, Math.max(1, parseInt(ansA) || 1));
            }
            const hpA = ARCTUS_STEPS[stepA - 1][0];
            let dmgA = ARCTUS_STEPS[stepA - 1][1];
            const spdA = parseInt((txtA.match(/скорость[^.]*?на\s+(\d+)/i) || [])[1]) || 5;
            const upA = ARCTUS_STEPS[stepA - 1][2];
            const stA = { duration: Infinity, plain: null, percentEffects: [{ type: 'weaponDamagePercent', value: dmgA }] };
            applyBoostToTimed(txtA, stA);
            dmgA = stA.percentEffects[0].value;
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Трансформация Арктуса накладывается только на себя.';
            } else {
                const hadObjA = activeTimedEffects.find(x => x.effectName === spellName && x.tempHp && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
                const hadTempA = hadObjA ? (hadObjA.tempHp || 0) : 0; // запоминаем до обновления (эффект могут править на месте)
                const dA = `+${hpA} временных ХП (сгорают, когда эффект закончится), физ. урон +${dmgA}%, скорость +${spdA} фт. Поддержание ${upA} маны/ход.`;
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: dA,
                    turnsRemaining: Infinity, manaPerTurn: upA, tempHp: hpA, speed: spdA, percentEffects: stA.percentEffects });
                const addHpA = Math.max(0, hpA - hadTempA);
                if (addHpA) { const hpElA = document.getElementById('cur-hp'); hpElA.value = (parseInt(hpElA.value) || 0) + addHpA; }
                renderActiveEffects();
                extraMsg = ' 🐻 ' + dA + ' Держится, пока хватает маны (списывается каждый ход) или пока не снимешь.';
            }
        } else if (spellName === 'Вихревой плащ') {
            const fullV = findSpellDescByName(spellName) || desc;
            const txtV = splitEnhancedDesc(fullV, enhanced);
            const stV = { duration: parseInt((txtV.match(/(\d+)\s*ход/i) || [])[1]) || 10, plain: null, percentEffects: [] };
            const radV = parseInt((txtV.match(/радиусе\s+(\d+)/i) || [])[1]) || 5;
            const slowV = parseInt((txtV.match(/на\s+(\d+)\s+а\s+так/i) || [])[1]) || 15;
            const arrowV = parseInt((txtV.match(/(\d+)\s*%/) || [])[1]) || 20;
            applyBoostToTimed(txtV, stV);
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Вихревой плащ накладывается только на себя.';
            } else {
                const dV = 'Враги в радиусе ' + radV + ' фт: −' + slowV + ' фт скорости. Игнорируешь ' + arrowV + '% урона от стрел и болтов. ' + stV.duration + ' х.';
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: dV, turnsRemaining: stV.duration, rangedResist: arrowV });
                renderActiveEffects();
                extraMsg = ' 🌪 ' + dV + ' Сейчас отметь врагов в радиусе — они замедлятся.';
                setTimeout(() => pickEnemyTargets('🌪 «Вихревой плащ»: кто в радиусе ' + radV + ' фт? (−' + slowV + ' фт скорости, ' + stV.duration + ' х.)', ids => {
                    const myNameV = document.getElementById('char-name').value || 'Игрок';
                    Promise.all(ids.map(id => window.CloudSync.applyStatusToEnemy(id, 'Замедление (Вихревой плащ)', '−' + slowV + ' фт скорости', stV.duration, myNameV, { unique: true })))
                        .then(rs => alert('🌪 Замедлены: ' + rs.map(r => r.enemyName).join(', ') + '.')).catch(err => alert('Ошибка: ' + err.message));
                }), 60);
            }
        } else if (spellName === 'Пожирающая сила') {
            const listP = targetVal.indexOf('summon:') === 0 ? activeSummons.filter(s => s.id === targetVal.slice(7)) : activeSummons.filter(s => s.category !== 'weapon');
            if (!listP.length) {
                extraMsg = ' ⚠ Нет подходящих существ.';
            } else {
                listP.forEach(s => { s.devour = true; });
                renderActiveSummonsList();
                extraMsg = ' 💀 Пожирающая сила: ' + listP.map(s => s.name).join(', ') + ' — в этот ход бьют на +150% урона и погибают, закончив ход (после атаки или в конце хода).';
            }
        } else if (spellName === 'Жизнеотвод') {
            const fullL = findSpellDescByName(spellName) || desc;
            const txtL = splitEnhancedDesc(fullL, enhanced);
            const stL = { duration: parseInt((txtL.match(/течении\s+(\d+)\s*ход/i) || [])[1]) || 10, plain: null, percentEffects: [] };
            const amtL = parseInt((txtL.match(/(\d+)\s*хп/i) || [])[1]) || 25;
            applyBoostToTimed(txtL, stL);
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Жизнеотвод накладывается на себя (проклинает твоих существ).';
            } else {
                const dL = 'Атаки твоих призванных существ: +' + amtL + ' урона и ты получаешь ' + amtL + ' ХП. ' + stL.duration + ' х.';
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: dL, turnsRemaining: stL.duration, lifeDivert: amtL });
                renderActiveEffects();
                extraMsg = ' 🩸 ' + dL;
            }
        } else if (spellName === 'Трансмутация смерти') {
            const corpseA = targetVal.indexOf('corpse:') === 0 && session ? (session.enemies || []).find(e => e.id === targetVal.slice(7)) : null;
            const chkA = precheckAshes(corpseA);
            if (!chkA.ok) {
                extraMsg = ' ⚠ ' + chkA.msg;
            } else {
                const protoB = (window.allItems || []).find(i => i.name === 'Кучка костей') || { weight: 2, price: 5, category: 'Бытовые предметы' };
                addToInventory('Кучка костей', 'Кучка костей', 1, protoB.weight, protoB.category || 'Бытовые предметы', protoB.effect || '', { price: protoB.price });
                targetLabel = 'на труп «' + corpseA.name + '»';
                if (window.CloudSync && typeof window.CloudSync.turnCorpseToAsh === 'function') window.CloudSync.turnCorpseToAsh(corpseA.id).catch(e => console.error(e));
                extraMsg = ' 🔥 Труп «' + corpseA.name + '» обращён в пепел (обыскать и поднять нельзя). Ты получил «Кучку костей».';
            }
        } else if (UTILITY_TIMED[spellName]) {
            const fullX = findSpellDescByName(spellName) || desc;
            const txtX = splitEnhancedDesc(fullX, enhanced);
            const stX = { duration: parseInt((txtX.match(/(\d+)\s*ход/i) || [])[1]) || 10, plain: null, percentEffects: [] };
            applyBoostToTimed(txtX, stX);
            const dX = String(txtX).split('\n')[0].trim();
            const whoX = giveBuff({}, dX, stX.duration);
            extraMsg = whoX === 'self' ? ' ' + UTILITY_TIMED[spellName] + ' ' + dX + ' (таймер ' + stX.duration + ' х.)' : whoX === 'ally' ? ' ' + UTILITY_TIMED[spellName] + ' «' + allyName + '»: ' + dX : ' ⚠ Выбери цель: на себя или на союзника.';
        } else if (spellName === 'Шаг сквозь тень' || spellName === 'Ночной клинок') {
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ «' + spellName + '» накладывается только на себя.';
            } else {
                let bonusD = 0, bonusNote = '';
                if (spellName === 'Ночной клинок') {
                    const mpElB = document.getElementById('cur-mp');
                    const mpB = parseInt(mpElB.value) || 0;
                    if (mpB >= 50) { mpElB.value = mpB - 50; bonusD = 50; bonusNote = ' 50 маны преобразованы в +50 урона.'; }
                    else bonusNote = ' ⚠ Не хватило 50 маны на доп. урон — удар без бонуса.';
                }
                const sdDesc = 'Ты за спиной врага: следующая атака оружием — гарантированное попадание и скрытная атака' + (bonusD ? ' (+' + bonusD + ' урона)' : '') + '.';
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: 'Удар из тени',
                    description: sdDesc, turnsRemaining: 3, shadowStrike: { bonusDmg: bonusD, spell: spellName } });
                renderActiveEffects();
                extraMsg = ' 🌑 ' + sdDesc + ' Спадает после первой атаки или через 3 хода.' + bonusNote;
            }
        } else if (spellName === 'Приглушение шагов') {
            const fullQ = findSpellDescByName(spellName) || desc;
            const stQ = { duration: parseControlTextParams(fullQ, enhanced).turns || (enhanced ? 12 : 10), plain: null, percentEffects: [] };
            applyBoostToTimed(splitEnhancedDesc(fullQ, enhanced), stQ);
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Приглушение шагов накладывается только на себя.';
            } else {
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName,
                    description: 'Шаги беззвучны: +1 к кубам на Скрытность.', turnsRemaining: stQ.duration, skillRollBonus: { skill: 'скрытность', value: 1 } });
                renderActiveEffects();
                extraMsg = ' 🤫 Шаги беззвучны ' + stQ.duration + ' х.: +1 к кубам на Скрытность.';
            }
        } else if (spellName === 'Священное оружие') {
            // Баф на своё оружие: +N урона нежити на M ходов (раньше заклинание стояло в списке атак и било 30 по любой цели).
            const fullH = findSpellDescByName(spellName) || desc;
            const hDmg = parseInt((fullH.match(/(\d+)\s*урона\s+нежит/i) || [])[1]) || 30;
            const hTurns = parseInt((fullH.match(/Действует\s+(\d+)\s+ход/i) || [])[1]) || 20;
            pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: 'Священное оружие',
                description: `Оружие наносит +${hDmg} урона нежити (${hTurns} ходов)`, turnsRemaining: hTurns, holyWeapon: hDmg, percentEffects: [] });
            renderActiveEffects();
            extraMsg = ` ☀ Оружие освящено: +${hDmg} урона нежити на ${hTurns} ходов.`;
        } else if (/^Нечестивый барьер \d$/.test(spellName)) {
            const fullU = findSpellDescByName(spellName) || desc;
            const baseU = splitEnhancedDesc(fullU, false), chosenU = splitEnhancedDesc(fullU, enhanced);
            const mU = baseU.match(/за\s+(\d+)\s+урона\s+снимается\s+(\d+)\s+хп/i);
            const perU = mU ? parseInt(mU[1]) : 5, hpU = mU ? parseInt(mU[2]) : 1;
            let resU = parseInt((chosenU.match(/сопротивление\s+стихиям\s+на\s+(\d+)\s*%/i) || [])[1]) || 0;
            const upkeepU = parseManaPerTurn(baseU) || getSpellUpkeep(spellName, fullU, isFree, enhanced, true);
            if (sb.pct && isStrengthCls) { resU = Math.round(resU * sb.mult); boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: сопротивление стихиям ${resU}%.`; }
            if (targetVal !== 'self') {
                extraMsg = ' ⚠ Нечестивый барьер накладывается только на себя.';
            } else {
                const uDesc = `Физический урон принимается на себя: ${hpU} ХП за каждые ${perU} урона; сопротивление стихиям +${resU}%. Поддержание ${upkeepU} маны/ход.`;
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: 'Нечестивый барьер', description: uDesc,
                    turnsRemaining: Infinity, manaPerTurn: upkeepU, unholy: { per: perU, hp: hpU }, percentEffects: resU ? [{ type: 'resistElemental', value: resU }] : [] });
                renderActiveEffects();
                extraMsg = ` 🦴 ${uDesc} Держится, пока хватает маны (списывается каждый ход) или пока не снимешь.`;
            }
        } else if (WALL_SPELLS[spellName]) {
            const wInfo = WALL_SPELLS[spellName];
            const fullW = findSpellDescByName(spellName) || desc;
            const baseW = parseSpellDamageFromDesc(fullW, enhanced) || 0;
            const upkeepW = getSpellUpkeep(spellName, fullW, isFree, enhanced, true);
            const effIdW = 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6);
            pushOrRefreshTimedEffect({ id: effIdW, name: spellName, effectName: spellName,
                description: `${wInfo.word}: ${baseW} урона за ход тем, кто в ней (+бонусы). Поддержание ${upkeepW} маны/ход. Кнопка «Ударить стеной» — отметить, кого задело.`,
                turnsRemaining: Infinity, manaPerTurn: upkeepW, wall: { base: baseW, icon: wInfo.icon } });
            renderActiveEffects();
            extraMsg = ` ${wInfo.icon} ${wInfo.word[0].toUpperCase() + wInfo.word.slice(1)} стоит: ${baseW} урона за ход, поддержание ${upkeepW} маны/ход (пока хватает маны или пока не снимешь). Сейчас отметь, кого она задела.`;
            setTimeout(() => window.openWallStrike(effIdW), 60);
        } else if (/^Обнаружение (жизни|смерти)$/.test(spellName) || spellName === 'Тревога') {
            const kindD = spellName === 'Тревога' ? 'alarm' : (/жизни/.test(spellName) ? 'life' : 'death');
            const fullD = findSpellDescByName(spellName) || desc;
            const upkeepD = kindD === 'alarm' ? 0 : getSpellUpkeep(spellName, fullD, isFree, enhanced, true);
            const turnsD = kindD === 'alarm' ? (enhanced ? Infinity : (parseControlTextParams(fullD, false).turns || 10)) : Infinity;
            pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName,
                description: kindD === 'alarm' ? 'Предупреждает о ближайших противниках (до 70 фт).' : 'Показывает существ в пределах 100 фт в помещении / 200 фт вне его. Кнопка «Показать» обновляет список.',
                turnsRemaining: turnsD, manaPerTurn: upkeepD, detect: kindD, untilDayEnd: kindD === 'alarm' && enhanced });
            renderActiveEffects();
            extraMsg = upkeepD ? ` Поддержание ${upkeepD} маны/ход.` : '';
            setTimeout(() => window.showDetection(kindD), 60);
        } else if (spellName === 'Круг защиты') {
            const fullC = findSpellDescByName(spellName) || desc;
            const txtC = splitEnhancedDesc(fullC, enhanced);
            const maxC = parseControlTextParams(fullC, enhanced).maxLevel || 16;
            const zoneC = parseInt((txtC.match(/мага\s+(?:на\s+)?(\d+)\s*ход/i) || [])[1]) || 8;
            const fleeAll = txtC.match(/на\s+(\d+)\s*ход/gi) || [];
            const fleeC = fleeAll.length ? parseInt(fleeAll[fleeAll.length - 1].replace(/\D+/g, '')) : 2;
            pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName,
                description: `Зона вокруг мага: нежить до ${maxC} ур., попавшая в круг, бежит ${fleeC} х. (новых вошедших мастер отмечает вручную).`, turnsRemaining: zoneC });
            renderActiveEffects();
            if (window.CloudSync && typeof window.CloudSync.applyStatusToEnemiesWhere === 'function') {
                const myNameC = document.getElementById('char-name').value || 'Игрок';
                window.CloudSync.applyStatusToEnemiesWhere(e => { const m = getEnemyMeta(e); return m.kind === 'undead' && (m.level === null || m.level <= maxC); },
                    'Бегство', `Обращена в бегство кругом защиты (нежить до ${maxC} ур.)`, fleeC, myNameC, { unique: true })
                    .then(r => alchToast(r.count ? `⭕ Круг защиты: в бегство обращены (${fleeC} х.): ${escHtml(r.names.join(', '))}.` : '⭕ Круг защиты: подходящей нежити в бою нет.'))
                    .catch(err => alert('Круг защиты: ' + err.message));
                extraMsg = ` Зона держится ${zoneC} х.; нежить в бою до ${maxC} ур. обращена в бегство на ${fleeC} х.`;
            } else {
                extraMsg = ' ⚠ Нет сессии — круг лишь отмечен (нежить до ' + maxC + ' ур. бежит ' + fleeC + ' х.).';
            }
        } else if (targetVal.indexOf('weapon:') === 0) {
            const slotW = 'melee'; // духи стихий — только на оружие ближнего боя
            const spInfo = WEAPON_SPIRITS[spellName];
            const wName = (document.getElementById('wep-' + slotW + '-name') || {}).value || (slotW === 'ranged' ? 'дальнее оружие' : 'ближнее оружие');
            if (!spInfo) {
                extraMsg = ' ⚠ На оружие накладываются только «Дух огня», «Дух мороза» и «Дух молнии» — остальным заклинаниям выбери другую цель.';
            } else {
                const full = findSpellDescByName(spellName) || desc;
                const nums = parseSpiritNumbers(full);
                const ix = enhanced ? 1 : 0;
                const dmgS = nums.dmg ? nums.dmg[ix] : 0;
                const drainS = nums.drain ? nums.drain[ix] : 0;
                let upkeep = (!isFree && lastSpellCastCost > 0) ? lastSpellCastCost : 0;
                if (!upkeep && nums.cost) upkeep = nums.cost[ix];
                activeTimedEffects = activeTimedEffects.filter(x => !x.weaponSpirit); // на оружии держится один дух
                const dualOn = !!document.getElementById('chk-dual-wield').checked;
                const offNm = (document.getElementById('wep-melee-offhand-name') || {}).value || '';
                const offKey = dualOn ? (offNm || '(второе оружие)') : '';
                const dText = `«${wName}»${offKey ? ' и «' + offKey + '»' : ''} наносят по +${dmgS} урона ${spInfo.word}${drainS ? ` и ${drainS} по мане цели` : ''}${spInfo.type === 'frost' ? ', замедляет на 5 фт' : ''}${spInfo.type === 'fire' ? ', поджигает' : ''}; ${upkeep} маны за ход`;
                pushOrRefreshTimedEffect({
                    id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName,
                    description: dText, turnsRemaining: Infinity, manaPerTurn: upkeep,
                    weaponSpirit: { type: spInfo.type, dmg: dmgS, mpDrain: drainS, slow: spInfo.type === 'frost' ? 5 : 0, ignite: spInfo.type === 'fire', slot: slotW, weaponName: wName, offName: offKey, icon: spInfo.icon }
                });
                renderActiveEffects();
                extraMsg = ` ${spInfo.icon} ${dText}. Держится, пока хватает маны (списывается каждый ход) или пока ты не развеешь эффект.`;
            }
        } else if (spellName === 'Барьер' && school === 'alter') {
            // Баф: 20% входящего ФИЗИЧЕСКОГО урона уходит в ману, 1 урона = 5 маны (усиление «Изменения» удешевляет курс на N%).
            const rate = Math.max(0.5, Math.round(5 * (1 - (sb.pct || 0) / 100) * 100) / 100);
            const barrier = { pct: 20, rate: rate };
            const bDesc = `20% входящего физического урона уходит в ману: 1 урона = ${rate} маны. Мана кончилась — ошеломление (−2 к кубам, 2 хода) и сброс положительных эффектов.`;
            if (targetVal === 'self') {
                pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: 'Барьер', description: bDesc, turnsRemaining: Infinity, barrier: barrier });
                renderActiveEffects();
                extraMsg = ` Барьер поднят: ${bDesc}`;
            } else if (allyUid && window.CloudSync && typeof window.CloudSync.pushEffectToPlayer === 'function') {
                window.CloudSync.pushEffectToPlayer(allyUid, { id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 8), name: document.getElementById('char-name').value || 'Союзник', effectName: 'Барьер', description: bDesc, turnsRemaining: 99999, barrier: barrier }).catch(e => console.error('Ошибка отправки эффекта союзнику:', e));
                extraMsg = ` Барьер отправлен «${allyName}».`;
            }
            if (sb.pct) boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: курс 1 урона = ${rate} маны.`;
        } else if (/^Аура Стендарра/.test(spellName)) {
            // Нежить рядом получает святой урон каждый ход (тикает у мастера по «следующему ходу»). Усиление Восстановления: +N% к урону.
            const dot0 = parseInt(((desc || '').match(/(\d+)\s*урона/) || [])[1]) || 0;
            const turnsS = parseInt(((desc || '').match(/(\d+)\s*ход/) || [])[1]) || 7;
            const dotS = Math.round(dot0 * (school === 'restor' && sb.pct ? sb.mult : 1));
            if (school === 'restor' && sb.pct) boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: ${dotS} урона/ход.`;
            if (window.CloudSync && typeof window.CloudSync.applyStatusToEnemies === 'function' && dotS) {
                const myNameS = document.getElementById('char-name').value || 'Игрок';
                // Нежить — по getEnemyMeta (база врагов): вампиры и гончие смерти тоже. Регулярка из точных имён.
                const sdA = window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
                const undeadNames = [...new Set(((sdA && sdA.enemies) || []).filter(e => getEnemyMeta(e).kind === 'undead').map(e => String(e.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))];
                const reA = undeadNames.length ? '^(' + undeadNames.join('|') + ')$' : 'скелет|драугр|нежить|привед|зомби|вампир|гончая смерти';
                window.CloudSync.applyStatusToEnemies(reA, 'Аура Стендарра', `${dotS} святого урона за ход (нежить рядом)`, turnsS, myNameS, { dotHp: dotS, dotNoResist: true })
                    .then(r => alchToast(r.count ? `☀ Аура Стендарра: ${r.count} нежити получают ${dotS} урона за ход (${turnsS} х.): ${escHtml(r.names.join(', '))}. Кого именно задело — решает мастер.` : '☀ Аура Стендарра: нежити в бою нет.'))
                    .catch(e => alert('Аура не наложена: ' + e.message));
                extraMsg = ` Аура накладывается на всю нежить в бою (${dotS} урона/ход, ${turnsS} х.); мастер снимает статус у тех, кто вне радиуса.`;
            } else {
                extraMsg = ' ⚠ Нет сессии — аура только для мастера (нежить рядом получает урон каждый ход).';
            }
        } else if (school === 'conj' && /^Аура (боец|защита)$/i.test(String(spellName).trim()) && (targetVal === 'self' || targetVal.indexOf('summon:') === 0)) {
            // «Не действует на живых существ»: усиливает призванных/поднятых существ, а самого игрока — только если он нежить (вампир).
            const isFighterA = /боец/i.test(spellName);
            const mA = (desc || '').match(/(\d+)\s*%/);
            const pctA = Math.round((mA ? parseInt(mA[1]) : 10) * (sb.pct ? sb.mult : 1));
            const undeadSelfA = !!(playerSupernaturalState && playerSupernaturalState.vampirism);
            const upkeepA = getSpellUpkeep(spellName, desc, isFree, enhanced, true);
            const selfEffectsA = undeadSelfA ? (isFighterA ? [{ type: 'weaponDamagePercent', value: pctA }] : [{ type: 'resistPhysical', value: pctA }, { type: 'resistElemental', value: pctA }]) : [];
            pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: desc || '',
                turnsRemaining: upkeepA ? Infinity : parseDurationTurns(desc), summonAura: isFighterA ? { dmgPct: pctA } : { resPct: pctA }, percentEffects: selfEffectsA, manaPerTurn: upkeepA });
            renderActiveEffects(); renderActiveSummonsList();
            extraMsg = ` Призванные и поднятые существа: ${isFighterA ? '+' + pctA + '% к урону' : 'сопротивление урону и стихиям +' + pctA + '%'}.` +
                (undeadSelfA ? ' Ты нежить (вампир) — аура действует и на тебя.' : ' На тебя, как на живого, не действует.') +
                (upkeepA ? ` ⚠️ Поддержание: ${upkeepA} маны/ход, пока не снимешь или не кончится мана.` : '');
        } else if (school === 'conj' && /Некроаура|Аура защиты призыва/.test(spellName)) {
            // Усиливают призванных существ: урон — в атаке существа, броня/сопротивления — показываются на карточке существ.
            const num = (re) => { const m = (desc || '').match(re); return m ? parseInt(m[1]) : 0; };
            const k = sb.pct ? sb.mult : 1;
            const aura = {
                dmg: Math.round(num(/урон\s+на\s+(\d+)/i) * k),
                armor: Math.round(num(/брон[а-яё]*\s+на\s+(\d+)/i) * k),
                resMagic: Math.round(num(/с[а-яё]*тивлени[ея]\s+магии\s+(\d+)\s*%/i) * k),
                resElem: Math.round(num(/с[а-яё]*тивлени[ея]\s+к?\s*стихиям\s+на\s+(\d+)\s*%/i) * k)
            };
            const auraUpkeep = getSpellUpkeep(spellName, desc, isFree, enhanced, true);
            pushOrRefreshTimedEffect({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName, effectName: spellName, description: desc || '', turnsRemaining: auraUpkeep ? Infinity : parseDurationTurns(desc), summonAura: aura, manaPerTurn: auraUpkeep });
            renderActiveEffects(); renderActiveSummonsList();
            extraMsg = ` Призванные существа: ${[aura.dmg ? '+' + aura.dmg + ' к урону' : '', aura.armor ? '+' + aura.armor + ' брони' : '', aura.resMagic ? 'сопр. магии ' + aura.resMagic + '%' : '', aura.resElem ? 'сопр. стихиям ' + aura.resElem + '%' : ''].filter(Boolean).join(', ')}.` + (auraUpkeep ? ` ⚠️ Поддержание: ${auraUpkeep} маны/ход, пока не снимешь или не кончится мана.` : '');
            if (sb.pct) boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: аура сильнее на ${sb.pct}%.`;
        } else if (template && template.category === 'corpse') {
            // Если в активной сессии мастера есть конкретный поднимаемый труп (например,
            // сгенерированный бандит) — поднимаем именно его, с его настоящими ХП/уроном,
            // а не общий шаблон по рангу заклинания. Игрок может явно выбрать труп в панели
            // призыва (corpse-raise-target-select); если не выбрал — берём первый подходящий.
            const currentTurn = (session && session.sessionTurnCounter) || 0;
            // Предел уровня из таблицы: «уровнем 7 / 13 / 17 и ниже» (в названии шаблона «(ур.N)»).
            // «Оживление зомби» предела не имеет, но всегда поднимает «слабого мертвеца» по таблице, а не труп с его силой.
            const lvlM = String(template.name || '').match(/\(ур\.\s*(\d+)\)/);
            const maxRaiseLevel = lvlM ? parseInt(lvlM[1], 10) : null;
            const allCorpses = session ? (session.enemies || []).filter(e =>
                e.isRaisable && !e.soulTaken && (e.curHp || 0) <= 0 && !e.raised &&
                (e.diedAtTurn === undefined || currentTurn - e.diedAtTurn <= 5)
            ) : [];
            const eligible = allCorpses.filter(e => { const lv = getEnemyMeta(e).level; return maxRaiseLevel === null || lv === null || lv <= maxRaiseLevel; });
            const pickerEl = document.getElementById('corpse-raise-target-select');
            const pickedId = pickerEl ? pickerEl.value : '';
            const corpse = (pickedId && eligible.find(e => e.id === pickedId)) || eligible[0];
            const pickedTooStrong = pickedId && !eligible.find(e => e.id === pickedId) && allCorpses.find(e => e.id === pickedId);
            if (pickedTooStrong) {
                extraMsg = ` ⚠ «${pickedTooStrong.name}» выше ${maxRaiseLevel} уровня — «${spellName}» его не поднимет.`;
            } else if (corpse && maxRaiseLevel !== null) {
                // Усиленный каст даёт ту же прибавку, что и в таблице (отношение усиленных ХП/урона к обычным).
                const hpK = enhanced && template.hpBase ? (template.hpEnh || template.hpBase) / template.hpBase : 1;
                const dmgK = enhanced && template.dmgBase ? (template.dmgEnh || template.dmgBase) / template.dmgBase : 1;
                const cHp = Math.round((corpse.maxHp || template.hpBase) * hpK);
                const cDmg = Math.round((corpse.weaponDmg || template.dmgBase) * dmgK);
                const specificTemplate = Object.assign({}, template, {
                    name: (corpse.name || template.name) + ' (поднят)',
                    hpBase: cHp, hpEnh: cHp, dmgBase: cDmg, dmgEnh: cDmg,
                    dmgType: 'физический'
                });
                const res = performSummon(specificTemplate, enhanced);
                extraMsg = res.ok ? ` ${res.message} (использованы настоящие ХП/урон трупа «${corpse.name}»)` : ` ⚠ ${res.message}`;
                if (res.ok && window.CloudSync) {
                    window.CloudSync.markCorpseRaised(corpse.id);
                }
            } else if (corpse) {
                const res = performSummon(Object.assign({}, template, { name: template.name + ` (${corpse.name})` }), enhanced);
                extraMsg = res.ok ? ` ${res.message}` : ` ⚠ ${res.message}`;
                if (res.ok && window.CloudSync) window.CloudSync.markCorpseRaised(corpse.id);
            } else {
                const res = performSummon(template, enhanced);
                extraMsg = res.ok ? ` ${res.message}` : ` ⚠ ${res.message}`;
            }
        } else if (template && template.category === 'armor') {
            const res = castFleshSpell(template, enhanced);
            extraMsg = res.ok ? ` ${res.message}` : ` ⚠ ${res.message}`;
        } else if (template) {
            const res = performSummon(template, enhanced);
            extraMsg = res.ok ? ` ${res.message}` : ` ⚠ ${res.message}`;
        } else if (targetVal === 'self') {
            // Сначала пробуем разовое лечение ("восстанавливает N здоровья/маны") — применяется
            // сразу к текущему хп/мп, не как длящийся бафф. Если не подошло — обычный
            // длящийся баф/усиление (активный эффект, как у зелий) — хп/мп ИЛИ процентный
            // (сила/стоимость заклинаний, сопротивления, скорость).
            const heal = parseInstantHealBonus(desc);
            if (heal && heal.key === 'hp' && school === 'restor' && (window.perkBonuses || {}).regenPerk) heal.value = Math.round(heal.value * 1.5); // перк «Регенерация»: лечение +50%
            if (heal && sb.pct && school === 'restor' && heal.key === 'hp') {
                heal.value = Math.round(heal.value * sb.mult);
                boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: лечение сильнее на ${sb.pct}%.`;
            }
            if (heal) {
                const fieldId = heal.key === 'hp' ? 'cur-hp' : 'cur-mp';
                const maxFieldId = heal.key === 'hp' ? 'max-hp' : 'max-mp';
                const cur = parseInt(document.getElementById(fieldId).value) || 0;
                const max = parseInt(document.getElementById(maxFieldId).value) || 0;
                if (heal.key === 'hp' && school === 'restor' && lichStage() >= 1) { heal.value = 0; extraMsg = ' ☠ Лич не лечится Восстановлением — исцеление не подействовало (для этого есть «Некролечение на себя»).'; }
                const newVal = Math.max(cur, Math.min(max, cur + heal.value));
                document.getElementById(fieldId).value = newVal;
                extraMsg = (extraMsg || '') + ` Восстановлено ${heal.value} ${heal.key === 'hp' ? 'ХП' : 'МП'} (сейчас ${newVal}/${max}).` + (heal.key === 'hp' ? grantBreather(null) : '');
            } else {
                const stSelf = { duration: parseDurationTurns(desc), plain: parsePlainEffectBonus(desc), percentEffects: parsePercentEffects(desc) };
                const manaPerTurn = getSpellUpkeep(spellName, desc, isFree, enhanced, !!(stSelf.plain || stSelf.percentEffects.length) || /^(Аура|Некроаура|Дар силы)/.test(spellName));
                if (manaPerTurn) stSelf.duration = Infinity; // держится, пока хватает маны
                if (stSelf.plain || stSelf.percentEffects.length || manaPerTurn) applyBoostToTimed(desc, stSelf);
                const duration = stSelf.duration, plain = stSelf.plain, percentEffects = stSelf.percentEffects;
                // Оберег: «поглощающий до N единиц урона от заклинаний» / «нейтрализующий N единиц магического урона».
                // Запас поглощения едет с эффектом — мастер срезает им урон заклинаний по игроку (gm.js, атака мастера).
                let wardAbsorb = 0;
                if (spCls === 'ward') {
                    const txtW = splitEnhancedDesc(desc, enhanced) || desc;
                    const mW = /(?:поглоща|нейтрализу)[а-яё]*\s+(?:до\s+)?(\d+)\s*(?:ед|единиц)/i.exec(txtW) || /(?:поглоща|нейтрализу)[а-яё]*\s+(?:до\s+)?(\d+)/i.exec(desc || '');
                    if (mW) wardAbsorb = parseInt(mW[1]) || 0;
                    if (wardAbsorb && sb.pct) wardAbsorb = Math.round(wardAbsorb * sb.mult);
                    { const wk = getGearSpecialBonuses().wardWeakerPct; if (wardAbsorb && wk) wardAbsorb = Math.max(0, Math.round(wardAbsorb * (1 - wk / 100))); } // Азидаловы перчатки: обереги слабее
                }
                if (plain || percentEffects.length || manaPerTurn || wardAbsorb) {
                    pushOrRefreshTimedEffect({
                        id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
                        name: spellName, effectName: spellName, description: desc || '',
                        turnsRemaining: duration,
                        hp: plain && plain.key === 'hp' ? plain.value : 0,
                        mp: plain && plain.key === 'mp' ? plain.value : 0,
                        armor: plain && plain.key === 'armor' ? plain.value : 0,
                        speed: plain && plain.key === 'speed' ? plain.value : 0,
                        value: plain ? plain.value : 0,
                        percentEffects: percentEffects,
                        manaPerTurn: manaPerTurn,
                        ward: wardAbsorb ? { absorb: wardAbsorb, left: wardAbsorb } : undefined
                    });
                    renderActiveEffects();
                    extraMsg = ' Эффект применён на себя и тикает по ходам.' + (percentEffects.length ? ' (' + percentEffects.map(p => p.type + ' +' + p.value).join(', ') + ')' : '') + (manaPerTurn ? ` ⚠️ Поддержание: ${manaPerTurn} маны/ход, пока не снимешь сам или не кончится мана.` : '');
                }
            }
        } else if (targetVal.indexOf('summon:') === 0) {
            // Лечение/бафф собственного существа — если получилось распарсить "+N хп", лечим напрямую.
            const s = activeSummons.find(x => x.id === targetVal.slice(7));
            // «Лечение»: «восстанавливает N здоровья» — мгновенное лечение (parseInstantHealBonus), бафф «+N к ХП» — parsePlainEffectBonus.
            const plain = parseInstantHealBonus(desc) || parsePlainEffectBonus(desc);
            if (s && plain && plain.key === 'hp' && s.maxHp) {
                if (school === 'restor' && (window.perkBonuses || {}).regenPerk) plain.value = Math.round(plain.value * 1.5);
                if (sb.pct && school === 'restor') { plain.value = Math.round(plain.value * sb.mult); boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: лечение сильнее на ${sb.pct}%.`; }
                s.curHp = Math.min(s.maxHp, s.curHp + plain.value);
                renderActiveSummonsList();
                extraMsg = ` «${s.name}» восстановлено ${plain.value} ХП (сейчас ${s.curHp}/${s.maxHp}).`;
            }
        } else if (allyUid) {
            // Баф/лечение на ЧУЖОГО игрока — как и статус-эффекты от мастера, идёт через сессию
            // (у игрока нет живого листенера на чужой документ персонажа, только на сессию;
            // цель подхватит эффект сама через уже существующий механизм applyIncomingStatusEffects).
            const heal = parseInstantHealBonus(desc);
            if (heal && heal.key === 'hp' && school === 'restor' && (window.perkBonuses || {}).regenPerk) heal.value = Math.round(heal.value * 1.5); // перк «Регенерация»: лечение +50%
            if (heal && sb.pct && school === 'restor' && heal.key === 'hp') {
                heal.value = Math.round(heal.value * sb.mult);
                boostNote = ` ✨ «${sb.skill}» +${sb.pct}%: лечение сильнее на ${sb.pct}%.`;
            }
            const stAlly = { duration: parseDurationTurns(desc), plain: heal ? null : parsePlainEffectBonus(desc), percentEffects: heal ? [] : parsePercentEffects(desc) };
            // Поддерживаемый баф на союзнике (ауры): ману каждый ход платит ЗАКЛИНАТЕЛЬ; кончилась мана / снял эффект — баф у союзника спадает.
            const allyUpkeep = heal ? 0 : getSpellUpkeep(spellName, desc, isFree, enhanced, !!(stAlly.plain || stAlly.percentEffects.length));
            if (!heal && (stAlly.plain || stAlly.percentEffects.length)) applyBoostToTimed(desc, stAlly);
            const duration = allyUpkeep ? 9999 : stAlly.duration, plain = stAlly.plain, percentEffects = stAlly.percentEffects;
            const sustainKey = allyUpkeep ? ('sus-' + Date.now() + Math.random().toString(36).slice(2, 6)) : null;
            if (window.CloudSync && typeof window.CloudSync.pushEffectToPlayer === 'function') {
                const myName = document.getElementById('char-name').value || 'Союзник';
                // id обязателен — Firestore arrayUnion сравнивает элементы по глубокому равенству
                // и молча НЕ добавляет объект, если в массиве уже есть идентичный по значениям
                // (например, два одинаковых лечения подряд от одного кастера на одну цель).
                const payload = {
                    id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    name: myName, effectName: spellName, description: desc || '', turnsRemaining: duration
                };
                if (heal) {
                    payload.instant = true;
                    payload[heal.key] = heal.value;
                } else {
                    if (plain) {
                        if (plain.key === 'hp') payload.hp = plain.value;
                        else if (plain.key === 'mp') payload.mp = plain.value;
                        else if (plain.key === 'armor') payload.armor = plain.value;
                        else if (plain.key === 'speed') payload.speed = plain.value;
                        payload.value = plain.value;
                    }
                    if (percentEffects.length) payload.percentEffects = percentEffects;
                    if (spCls === 'ward') { // запас поглощения магии — как при касте на себя
                        const txtW = splitEnhancedDesc(desc, enhanced) || desc;
                        const mW = /(?:поглоща|нейтрализу)[а-яё]*\s+(?:до\s+)?(\d+)\s*(?:ед|единиц)/i.exec(txtW) || /(?:поглоща|нейтрализу)[а-яё]*\s+(?:до\s+)?(\d+)/i.exec(desc || '');
                        let wA = mW ? (parseInt(mW[1]) || 0) : 0;
                        if (wA && sb.pct) wA = Math.round(wA * sb.mult);
                        { const wk = getGearSpecialBonuses().wardWeakerPct; if (wA && wk) wA = Math.max(0, Math.round(wA * (1 - wk / 100))); }
                        if (wA) payload.ward = { absorb: wA, left: wA };
                    }
                    if (sustainKey) payload.sustainKey = sustainKey;
                    if (/^Аура (боец|защита)$/i.test(String(spellName).trim())) payload.undeadOnly = true; // «не действует на живых»
                }
                if (sustainKey) {
                    activeTimedEffects = activeTimedEffects.filter(x => !(x.sustainAlly && x.sustainAlly.uid === allyUid && x.sustainAlly.effectName === spellName)); // повторный каст — старое поддержание заменяется
                    pushOrRefreshTimedEffect({
                        id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: spellName + ' → ' + allyName, effectName: spellName + ' → ' + allyName,
                        description: `Ты поддерживаешь «${spellName}» на ${allyName}: ${allyUpkeep} маны/ход. Мана кончилась или снял — эффект у союзника спадает.`,
                        turnsRemaining: Infinity, manaPerTurn: allyUpkeep, sustainAlly: { uid: allyUid, effectName: spellName, key: sustainKey, allyName: allyName }
                    });
                    renderActiveEffects();
                }
                window.CloudSync.pushEffectToPlayer(allyUid, payload).catch(e => console.error('Ошибка отправки эффекта союзнику:', e));
                if (heal) {
                    extraMsg = ` Лечение отправлено «${allyName}» — восстановит ${heal.value} ${heal.key === 'hp' ? 'ХП' : 'МП'} сразу же.` + (heal.key === 'hp' ? grantBreather(allyUid) : '');
                } else if (plain || percentEffects.length) {
                    extraMsg = ` Эффект отправлен «${allyName}» и реально применится у него.` + (allyUpkeep ? ` ⚠️ Поддержание: ${allyUpkeep} маны/ход с тебя, пока не снимешь или не кончится мана.` : '');
                } else {
                    extraMsg = ' Заклинание отправлено, но точный числовой эффект не распознан по описанию — сообщи союзнику словами, что применить.';
                }
            }
        }

        if (sb.pct && !boostNote && isStrengthCls) {
            boostNote = ` ⚠ «${sb.skill}» +${sb.pct}%: числа этого заклинания ×${sb.mult.toFixed(2)} — автоматом не считаются, примени при розыгрыше.`;
        }
        extraMsg += boostNote + perkDurNote;
        return {
            message: `Заклинание «${spellName}» прочитано ${targetLabel}!${isFree ? ' (бесплатно, со свитка)' : ' Мана успешно списана.'}${extraMsg}`,
            logText: `✨ кастует «${spellName}» ${targetLabel}.${extraMsg}`,
            targetVal
        };
    }

    // Делит текст описания заклинания на базовую и усиленную часть по маркеру "Усиленный эффект".
    // Если маркера нет (заклинание без усиленной версии), enhanced просто дублирует base.
    function splitSpellDescByEnhancement(text) {
        if (!text) return { base: '', enhanced: '' };
        const idx = text.indexOf('Усиленный эффект');
        if (idx === -1) return { base: text, enhanced: text };
        return { base: text.slice(0, idx), enhanced: text.slice(idx + 'Усиленный эффект'.length) };
    }

    // "Равновесие" — раньше было чистым текстом ("Преобразование 25 ед. здоровья в магию"), без
    // всякой механики. Соотношение по прямой просьбе НЕ 1:1 — 100 ХП даёт 75 маны (0.75 за
    // единицу), не обычная формула стоимости каста. Заклинание реально "может убить заклинателя",
    // как и написано в описании — не блокирую уход в 0 или ниже, только явно предупреждаю.
    window.castEquilibrium = function () {
        const curHpEl = document.getElementById('cur-hp');
        const curHp = parseInt(curHpEl.value) || 0;
        const input = prompt(`Сколько ХП конвертировать в ману (соотношение 100:75, т.е. ×0.75)? Сейчас ХП: ${curHp}.`, '25');
        const hpToSpend = parseInt(input);
        if (!hpToSpend || hpToSpend <= 0) return;
        if (!combatActionAllowed('cast')) return; // каст «Равновесия» — действие хода, как в боевой панели
        if (hpToSpend >= curHp) {
            if (!confirm(`⚠ Это оставит 0 или меньше ХП — заклинание прямо предупреждает, что может убить заклинателя. Точно продолжить?`)) return;
        }
        const curMpEl = document.getElementById('cur-mp');
        const curMp = parseInt(curMpEl.value) || 0, maxMp = parseInt((document.getElementById('max-mp') || {}).value) || 0;
        const mpGain = Math.max(0, Math.min(Math.round(hpToSpend * 0.75), maxMp - curMp)); // мана не выше максимума
        curHpEl.value = curHp - hpToSpend;
        curMpEl.value = curMp + mpGain;
        markCombatAction('attack');
        updateVitalBars();
        saveLocalStorage();
        alert(`Равновесие: −${hpToSpend} ХП → +${mpGain} маны${mpGain < Math.round(hpToSpend * 0.75) ? ' (мана уже на максимуме — остальное пропало)' : ''}.`);
    };

    // ---------- Концентрация (школы Иллюзия и Колдовство) ----------
    // Заклинание этих школ, наложенное на себя и создавшее эффект, помечается concentration: true. Одновременно держится ОДИН такой эффект
    // (второй каст спрашивает, снять ли прежний); при получении урона нужна проверка: д20 + мод (Мудрость для Иллюзии, Телосложение для Колдовства)
    // против 10 + уровень заклинания — провал снимает эффект.
    const CONC_SCHOOLS = ['illus', 'conj'];
    function activeConcentrationEffects() { return (activeTimedEffects || []).filter(e => e.concentration && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity)); }
    function spellCardInfo(id) {
        const card = document.getElementById('card-' + id); if (!card) return null;
        const school = ((card.closest('[id^="spells-"]') || {}).id || '').replace('spells-', '').replace('-list', '');
        const name = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
        const target = (card.querySelector('.spell-target-select') || {}).value || 'self';
        return { school, name, target };
    }
    // ===== Усиленный каст: только с перком «Двойное <школа>» и только у заклинаний, у которых усиленная версия есть =====
    const DUAL_PERK_BY_SCHOOL = { destr: 'dualDestr', restor: 'dualRestor', conj: 'dualConj', illus: 'dualIllus', alter: 'dualAlter' };
    const DUAL_PERK_NAME = { destr: 'Двойное разрушение', restor: 'Двойное восстановление', conj: 'Двойное колдовство', illus: 'Двойная иллюзия', alter: 'Двойное изменение' };
    // '' — можно; иначе причина запрета.
    function enhancedBlockReason(school, desc, name) {
        { const hr = enhancedHandsReason(); if (hr) return hr; } // усиленный каст — только с пустыми руками
        const liveDesc = desc || (name && typeof findSpellDescByName === 'function' ? findSpellDescByName(name) : '') || '';
        if (!hasEnhancedDesc(liveDesc)) return 'У этого заклинания нет усиленной версии.';
        const flag = DUAL_PERK_BY_SCHOOL[school];
        if (flag && !(window.perkBonuses || {})[flag]) return `Усиленный каст доступен с перком «${DUAL_PERK_NAME[school]}».`;
        return '';
    }
    function cardEnhancedReason(id) {
        const info = spellCardInfo(id); if (!info) return 'Заклинание не найдено.';
        const card = document.getElementById('card-' + id), d = card && card.querySelector('.spell-desc');
        return enhancedBlockReason(info.school, d ? d.value : '', info.name);
    }
    function refreshEnhancedButtons() {
        document.querySelectorAll('.spell-card').forEach(card => {
            const btn = card.querySelector('button[onclick*="castCustomSpell"][onclick$="true)"]');
            if (!btn) return;
            const id = card.id.replace('card-', '');
            let reason = ''; try { reason = cardEnhancedReason(id); } catch (e) { }
            btn.style.display = reason ? 'none' : '';
        });
        const chk = document.getElementById('chk-enhanced-cast');
        if (chk) {
            const val = (document.getElementById('attack-action-select') || {}).value || '';
            let reason = '';
            if (val.indexOf('spell:') === 0 || val.indexOf('control:') === 0) { const sp = (customSpells || []).find(s => s.id === val.slice(val.indexOf(':') + 1)); if (sp) reason = enhancedBlockReason(sp.school, liveSpellDesc(sp), sp.name); } else reason = 'не заклинание';
            chk.disabled = !!reason; if (reason) chk.checked = false;
            chk.parentElement.style.opacity = reason ? '.45' : '1';
            chk.parentElement.title = reason && reason !== 'не заклинание' ? reason : '';
        }
        const sc = document.getElementById('summon-enhanced-check');
        if (sc) {
            const t = summonTemplates[parseInt((document.getElementById('summon-template-select') || {}).value)];
            let reason = 'нет';
            if (t) {
                const school = t.spellName ? findSpellSchoolByName(t.spellName) : 'conj';
                const hasEnh = (t.durEnh && t.durEnh !== t.durBase) || t.enhCount || (t.hpEnh && t.hpEnh !== t.hpBase) || (t.dmgEnh && t.dmgEnh !== t.dmgBase);
                reason = !hasEnh ? 'нет усиленной версии' : ((DUAL_PERK_BY_SCHOOL[school] && !(window.perkBonuses || {})[DUAL_PERK_BY_SCHOOL[school]]) ? 'перк «' + DUAL_PERK_NAME[school] + '»' : '');
            }
            sc.disabled = !!reason; if (reason) sc.checked = false;
            sc.parentElement.style.opacity = reason ? '.45' : '1';
            sc.parentElement.title = reason ? 'Усиленный вариант недоступен: ' + reason : '';
        }
    }
    window.refreshEnhancedButtons = refreshEnhancedButtons;
    function castCustomSpell(id, enhanced) {
        { const hb = castBlockReason(); if (hb) { alert(hb); return; } }
        if (!combatActionAllowed('cast')) return;
        if (enhanced) { const why = cardEnhancedReason(id); if (why) { alert(why); return; } }
        const info = spellCardInfo(id);
        const conc = !!(info && CONC_SCHOOLS.indexOf(info.school) !== -1 && info.target === 'self');
        const prev = conc ? activeConcentrationEffects() : [];
        if (prev.length && !confirm('Ты уже держишь концентрацию на «' + (prev[0].concSpell || prev[0].effectName || prev[0].name) + '». Снять предыдущий концентрационный эффект и колдовать новое?')) return;
        const before = new Map((activeTimedEffects || []).map(e => [e.id, e.turnsRemaining]));
        castCustomSpellCore(id, enhanced);
        if (info && info.name) { const cs = (customSpells || []).find(x => x.id === id); if (trackHabit('castSpell', info.name) === 5 && cs && !cs.favorite) { if (confirm('Часто колдуешь «' + info.name + '». Добавить в избранные?')) toggleSpellFavorite(id); else habitDecline('castSpell', info.name); } }
        if (!conc) return;
        const tier = getSpellTier(info.school, info.name) || 1;
        const fresh = (activeTimedEffects || []).filter(e => { const b = before.get(e.id); return b === undefined || e.turnsRemaining !== b; });
        if (!fresh.length) return;   // каст не удался или эффекта у себя не создал — прежняя концентрация остаётся
        fresh.forEach(e => { e.concentration = true; e.concSchool = info.school; e.concSpell = info.name; e.concTier = tier; });
        if (prev.length) activeTimedEffects = activeTimedEffects.filter(e => prev.indexOf(e) === -1 || fresh.indexOf(e) !== -1);
        renderActiveEffects(); saveLocalStorage();
        if (typeof updateCombatDock === 'function') updateCombatDock();
    }
    window.concentrationCheck = function (dmg) {
        const eff = activeConcentrationEffects()[0];
        if (!eff || !(dmg > 0)) return;
        const statKey = eff.concSchool === 'illus' ? 'wis' : 'con';
        const statInput = document.getElementById('stat-' + statKey);
        const raw = statInput ? (parseInt(statInput.value) || 10) : 10;
        const mod = calcAbilityMod(raw), dc = 10 + (eff.concTier || 1);
        // Знак «Маг»: преимущество на спасброски концентрации — два d20, берётся лучший.
        const adv = (document.getElementById('char-sign') || {}).value === 'mage';
        const r1 = Math.floor(Math.random() * 20) + 1, r2 = adv ? Math.floor(Math.random() * 20) + 1 : 0;
        const roll = Math.max(r1, r2), total = roll + mod, ok = total >= dc;
        const who = (document.getElementById('char-name') || {}).value || 'Игрок';
        const txt = `🧠 ${who}: концентрация на «${eff.concSpell || eff.effectName}» — д20 ${adv ? `${r1}/${r2} (преимущество «Мага») → ${roll}` : roll}${mod >= 0 ? '+' : ''}${mod} = ${total} против ${dc}: ${ok ? 'удержал(а)' : 'сорвалось, эффект снят'}.`;
        alchToast(txt);
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(txt, who);
        if (!ok) { activeTimedEffects = activeTimedEffects.filter(e => e !== eff); renderActiveEffects(); updateAll(); saveLocalStorage(); }
        if (typeof updateCombatDock === 'function') updateCombatDock();
    };

    function castCustomSpellCore(id, enhanced) {
        const card = document.getElementById(`card-${id}`);
        if (!card) return;
        const costElC = card.querySelector('.spell-final-cost');
        // Бесплатный каст («Маг», «Призыв духа») — только обычный: усиленный считается от полной цены (0 × 2 = 0 было лазейкой).
        const baseFinalCost = (enhanced && costElC.dataset.freeReason) ? (parseInt(costElC.dataset.paidCost) || 0) : (parseInt(costElC.value) || 0);
        const enhFactor = enhanced ? getEnhancedCostFactor(((card.closest('[id^="spells-"]') || {}).id || '').replace('spells-', '').replace('-list', ''), (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value) : 1;
        lastSpellEnhFactor = enhFactor;
        let finalCost = enhanced ? Math.round(baseFinalCost * enhFactor) : baseFinalCost;
        { // «Дух огня/мороза/молнии»: цель — своё оружие; цена усиленного каста берётся из описания («30/50 маны ход»), а не ×2
            const nmS = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            if (WEAPON_SPIRITS[nmS]) {
                const tv = (card.querySelector('.spell-target-select') || {}).value || 'self';
                if (tv !== 'weapon:melee') { alert('«' + nmS + '» накладывается только на оружие ближнего боя: выбери «Цель: моё оружие — ближнее». Мана не потрачена.'); return; }
                if (!((document.getElementById('wep-melee-name') || {}).value || '').trim() && !(parseInt((document.getElementById('wep-melee-dmg') || {}).value) > 0)) { alert('Сначала надень оружие ближнего боя — духу не на что лечь. Мана не потрачена.'); return; }
                const nS = parseSpiritNumbers(findSpellDescByName(nmS) || card.querySelector('.spell-desc').value);
                if (enhanced && nS.cost && nS.cost[0]) finalCost = Math.round(baseFinalCost * nS.cost[1] / nS.cost[0] * (1 - getGearEnhancedCostCut('destr') / 100)); // перчатки магистра Разрушения тоже удешевляют усиленного духа
            }
        }
        { // Невидимость и Нечестивый барьер — только на себя: проверяем до траты маны
            const nmO = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            if (nmO === 'Невидимость' || nmO === 'Трансформация Арктуса' || nmO === 'Шаг сквозь тень' || nmO === 'Ночной клинок' || nmO === 'Приглушение шагов' || nmO === 'Равновесие' || /^Нечестивый барьер \d$/.test(nmO)) {
                const tvO = (card.querySelector('.spell-target-select') || {}).value || 'self';
                if (tvO !== 'self') { alert('«' + nmO + '» накладывается только на себя — выбери «Цель: на себя». Мана не потрачена.'); return; }
            }
        }
        { // «Равновесие»: 25 ХП → 25×0.75 = 19 маны. Само заклинание маны не тратит (иначе оно бессмысленно) — просто конвертация.
            const nmE = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            if (nmE === 'Равновесие') {
                const hpElE = document.getElementById('cur-hp'), mpElE = document.getElementById('cur-mp');
                const hpE = parseInt(hpElE.value) || 0, spendE = 25;
                if (hpE <= spendE && !confirm('⚠ Это оставит 0 или меньше ХП — заклинание может убить заклинателя. Точно продолжить?')) return;
                const maxMpE = parseInt(document.getElementById('max-mp').value) || 0;
                const mpBefore = parseInt(mpElE.value) || 0;
                const gainE = Math.round(spendE * 0.75);
                const mpAfter = maxMpE ? Math.max(mpBefore, Math.min(maxMpE, mpBefore + gainE)) : mpBefore + gainE;
                hpElE.value = hpE - spendE;
                mpElE.value = mpAfter;
                markCombatAction('attack'); // каст — действие хода, как и кнопка «Конвертировать ХП→МП»
                alert('Равновесие: −' + spendE + ' ХП → +' + (mpAfter - mpBefore) + ' маны' + (mpAfter - mpBefore < gainE ? ' (упёрлось в максимум маны)' : '') + '. Мана на каст не тратится.');
                updateAll();
                saveLocalStorage();
                return;
            }
        }
        { // Новые заклинания: проверки ДО траты маны
            const nmN = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            const tvN = (card.querySelector('.spell-target-select') || {}).value || 'self';
            const tmplN = findSummonTemplateBySpellName(nmN);
            if (tmplN && tmplN.requiresItem && countInInventory(tmplN.requiresItem) <= 0) {
                alert('Для «' + nmN + '» нужна «' + tmplN.requiresItem + '» в инвентаре (она вернётся, когда существо развеется). Мана не потрачена.'); return;
            }
            { // Боевая сетка: каст на союзника/своё существо — не дальше 60 фт и при прямой видимости (мана не тратится)
                const gA = sessGrid();
                if (gA && (tvN.indexOf('ally:') === 0 || tvN.indexOf('summon:') === 0)) {
                    const Gc = window.GridCore, meT = Gc.tokenOf(gA, 'p', myUidG());
                    const toT = tvN.indexOf('ally:') === 0 ? Gc.tokenOf(gA, 'p', tvN.slice(5)) : Gc.tokenOf(gA, 's', tvN.slice(7), myUidG());
                    if (meT && toT) {
                        const fA = Gc.feet(meT, toT);
                        if (!Gc.losFigures(gA, meT, toT)) { alert('«' + nmN + '»: цель за препятствием — нет прямой видимости. Мана не потрачена.'); return; }
                        if (fA > 60) { alert('«' + nmN + '»: цель слишком далеко — ' + fA + ' фт (заклинание достаёт до 60 фт). Мана не потрачена.'); return; }
                    }
                }
            }
            if (['Гнозис', 'Очистка камней', 'Трансмутация', 'Вихревой плащ', 'Жизнеотвод', 'Ободрение'].indexOf(nmN) !== -1 && tvN !== 'self') {
                alert('«' + nmN + '» не требует цели — выбери «Цель: на себя». Мана не потрачена.'); return;
            }
            if (['Мужество', 'Трансмутация мускулы на себя', 'Трансмутация мускулы на цель'].indexOf(nmN) !== -1 && tvN.indexOf('summon:') === 0) {
                alert('«' + nmN + '» действует на игроков, не на существ. Мана не потрачена.'); return;
            }
            if (nmN === 'Гнозис') {
                const hpG = parseInt(document.getElementById('cur-hp').value) || 0, maxHpG = parseInt(document.getElementById('max-hp').value) || 0;
                const maxMpG = parseInt(document.getElementById('max-mp').value) || 0, mpG = Math.max(0, (parseInt(document.getElementById('cur-mp').value) || 0) - finalCost);
                if (!maxHpG || !maxMpG) { alert('Гнозис: у тебя нет максимума ХП или МП. Мана не потрачена.'); return; }
                if (Math.round(maxHpG * Math.min(1, mpG / maxMpG)) <= 0 && !confirm('⚠ После каста у тебя останется 0 маны — ХП тоже станет 0%. Точно продолжить?')) return;
            }
            if (nmN === 'Управление погодой') {
                if (!(window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && window.CloudSync.setSessionWeather)) { alert('«Управление погодой» работает в сессии — погода общая для всей группы. Мана не потрачена.'); return; }
                if (!window._weatherSpellPick) {
                    const opts = Object.keys(WEATHER_TYPES).map(k => `<button type="button" class="st-dock-pick" onclick="window._weatherSpellPick='${k}'; dockCloseModal(); castCustomSpellCore('${jsq(id)}', ${enhanced ? 'true' : 'false'});">${escHtml(WEATHER_TYPES[k].name)}<br><span style="font-size:12px; opacity:.7;">${escHtml(WEATHER_TYPES[k].effect || 'без штрафов и бонусов')}</span></button>`).join('');
                    dockOpenModal('weather-spell-modal', '🌦 Какую погоду вызвать?', opts);
                    return; // мана тратится после выбора
                }
            }
            if (nmN === 'Очистка камней' && !SOUL_ORDER.some(k => countInInventory(soulFilledGemName(k)) > 0)) {
                alert('В инвентаре нет заполненных камней душ — освобождать нечего. Мана не потрачена.'); return;
            }
            if (nmN === 'Трансмутация' && countInInventory('Железная руда') <= 0 && countInInventory('Серебряная руда') <= 0) {
                alert('Нужна железная или серебряная руда в инвентаре. Мана не потрачена.'); return;
            }
            if (nmN === 'Пожирающая сила') {
                const okS = tvN.indexOf('summon:') === 0 ? activeSummons.some(s => s.id === tvN.slice(7)) : activeSummons.some(s => s.category !== 'weapon');
                if (!okS) { alert('У тебя нет призванных или поднятых существ. Мана не потрачена.'); return; }
            }
            if (nmN === 'Трансмутация смерти') {
                const sessT = window.CloudSync ? window.CloudSync.getSessionData() : null;
                const cT = tvN.indexOf('corpse:') === 0 && sessT ? (sessT.enemies || []).find(e => e.id === tvN.slice(7)) : null;
                const chT = precheckAshes(cT);
                if (!chT.ok) { alert(chT.msg + ' Мана не потрачена.'); return; }
            }
        }
        { // «Захват душ»: нужна цель-труп и подходящий пустой камень — проверяем до траты маны
            const nmZ = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            if (nmZ === 'Захват душ') {
                const tvZ = (card.querySelector('.spell-target-select') || {}).value || 'self';
                const sessZ = window.CloudSync ? window.CloudSync.getSessionData() : null;
                const corpseZ = tvZ.indexOf('corpse:') === 0 && sessZ ? (sessZ.enemies || []).find(e => e.id === tvZ.slice(7)) : null;
                const chZ = precheckSoulTrap(corpseZ);
                if (!chZ.ok) { alert(chZ.msg); return; }
            }
            // Поднятие мёртвых: в сессии нужен свежий труп (не старше 5 ходов) — иначе мертвец появлялся из ниоткуда.
            const tplR = (typeof findSummonTemplateBySpellName === 'function') ? findSummonTemplateBySpellName(nmZ) : null;
            const sessR = (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession()) ? window.CloudSync.getSessionData() : null;
            if (tplR && tplR.category === 'corpse' && sessR) {
                const turnR = sessR.sessionTurnCounter || 0;
                const anyCorpse = (sessR.enemies || []).some(e => e.isRaisable && !e.soulTaken && (e.curHp || 0) <= 0 && !e.raised && (e.diedAtTurn === undefined || turnR - e.diedAtTurn <= 5));
                if (!anyCorpse) { alert(`Рядом нет трупа, который можно поднять (труп должен быть не старше 5 ходов). «${nmZ}» не сработает — мана не потрачена.`); return; }
            }
        }
        lastSpellCastCost = finalCost;
        let curMp = parseInt(document.getElementById('cur-mp').value) || 0;
        if (curMp >= finalCost) {
            if (!enhanced) consumeMageSignFreeCast(card.querySelector('.spell-final-cost')); // усиленный каст бесплатный лимит не тратит
            document.getElementById('cur-mp').value = curMp - finalCost;
            markCombatAction('attack'); // каст в бою — действие хода (после него оружие в этом ходу не сменить)
            const targetSelect = card.querySelector('.spell-target-select');
            const targetVal = targetSelect ? targetSelect.value : 'self';
            const spellName = (card.querySelector('.spell-name-custom').value) || card.querySelector('.spell-name-select').value;
            const fullDesc = card.querySelector('.spell-desc').value;
            const parts = splitSpellDescByEnhancement(fullDesc);
            const desc = enhanced ? parts.enhanced : parts.base;
            const container = card.closest('[id^="spells-"]');
            const school = container ? container.id.replace('spells-', '').replace('-list', '') : null;

            if (GRID_RUNE_SPELLS[spellName]) { castGridRune(spellName, desc, !!enhanced); if (school && SCHOOL_CODE_TO_SKILL[school]) logSkillSuccessByName(SCHOOL_CODE_TO_SKILL[school]); updateAll(); saveLocalStorage(); return; }
            if (spellName === 'Управление погодой' && window._weatherSpellPick) {
                const wk = window._weatherSpellPick; window._weatherSpellPick = null;
                const myNameW = document.getElementById('char-name').value || 'Игрок';
                window.CloudSync.setSessionWeather(wk, myNameW).catch(e => alert('Погода не изменилась: ' + e.message));
                alert('🌦 «Управление погодой»: теперь ' + WEATHER_TYPES[wk].name + (WEATHER_TYPES[wk].effect ? ' — ' + WEATHER_TYPES[wk].effect : '') + '. Видно всей группе и мастеру.');
                if (school && SCHOOL_CODE_TO_SKILL[school]) logSkillSuccessByName(SCHOOL_CODE_TO_SKILL[school]);
                updateAll(); saveLocalStorage();
                return;
            }
            const result = resolveSpellEffect(spellName, desc, school, targetVal, false, !!enhanced);
            alert((enhanced ? '⚡ Усиленный каст! ' : '') + result.message);
            if (targetVal !== 'self' && window.CloudSync) {
                const myName = document.getElementById('char-name').value;
                window.CloudSync.postCombatLog(myName + ' ' + result.logText, myName);
            }
            if (school && SCHOOL_CODE_TO_SKILL[school] && typeof logSkillSuccessByName === 'function') {
                logSkillSuccessByName(SCHOOL_CODE_TO_SKILL[school]);
            }
            updateAll();
            saveLocalStorage();
        } else {
            alert("Недостаточно маны (MP) для этого каста!");
        }
    }

    // Свиток — одноразовое бесплатное чтение заклинания (не тратит ману, тратит сам свиток).
    // Книги умений — как в ваниле: чтение даёт +1 к базовому значению навыка, расходует
    // предмет. Систему "уже читал именно эту книгу раньше" не отслеживаем (мастер сам решает,
    // выдавать ли вторую копию той же книги) — упрощение, чтобы не городить отдельный трекер.
    // Общая механика "предмет с ограниченным числом применений" (Чернила/мешочек Вазьмицы и
    // подобное) — раньше такого класса предметов не было вообще, у GM-выданных экземпляров
    // usesLeft выставляется при выдаче (см. gm.js). Когда заряды кончаются — предмет пропадает.
    window.useLimitedItem = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || !item.maxUses) return;
        let usesLeft = typeof item.usesLeft === 'number' ? item.usesLeft : item.maxUses;
        if (usesLeft <= 0) { alert(`«${item.name}» больше не действует — заряды закончились.`); return; }
        usesLeft -= 1;
        if (usesLeft <= 0) {
            const restStack = (item.count || 1) > 1;
            if (restStack) item.usesLeft = item.maxUses; // в стопке остались целые экземпляры
            removeFromInventoryByName(itemId, 1);
            alert(`Использовано: «${item.name}». Заряды закончились, предмет израсходован.\n${item.effect || ''}`);
            // Сообщение мастеру в общий журнал — последний заряд это заметное событие (предмет
            // пропадает из инвентаря насовсем), раньше это происходило молча.
            if (window.CloudSync && window.CloudSync.postCombatLog) {
                const myName = document.getElementById('char-name').value || 'Игрок';
                window.CloudSync.postCombatLog(`🎒 ${myName} истратил(а) последний заряд предмета «${item.name}» — вещь рассыпалась в прах.`, myName);
            }
        } else {
            item.usesLeft = usesLeft;
            alert(`Использовано: «${item.name}». Осталось зарядов: ${usesLeft}/${item.maxUses}.\n${item.effect || ''}`);
        }
        renderInventoryList();
        saveLocalStorage();
    };

    window.readSkillBook = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0 || !item.skill) return;
        const skillIdx = skillNames.indexOf(item.skill);
        if (skillIdx === -1) { alert('Не нашёл навык «' + item.skill + '» в списке.'); return; }
        const input = document.getElementById('skill-' + skillIdx);
        if (!input) return;
        let raw = parseInt(input.getAttribute('data-raw-val')) || 10;
        // Каждая книга учит один раз (как в Скайриме): прочитанные запоминаются, повторная покупка того же названия ничего не даёт.
        const bookDb = window.skillBookByAnyName ? window.skillBookByAnyName(item.name) : null;
        const bookKey = (bookDb && (bookDb.nameEn || bookDb.name)) || String(item.name || '').trim(); // английское и русское имя — одна книга
        if (readSkillBooks.indexOf(bookKey) !== -1) { alert(`«${item.name}» ты уже читал(а) — второй раз навык не вырастет. Книгу можно продать.`); return; }
        if (raw >= 100) { alert(`«${item.skill}» уже на максимуме (100) — книга не поможет, но её всё равно можно оставить или продать.`); return; }
        raw = Math.min(100, raw + 1);
        input.setAttribute('data-raw-val', raw);
        levelUpProgress += 1; // +1 к навыку из книги идёт и в прогресс уровня — как у учителей и успехов
        readSkillBooks.push(bookKey);
        removeFromInventoryByName(itemId, 1);
        renderInventoryList();
        updateAll();
        if (typeof renderLevelPanel === 'function') renderLevelPanel();
        saveLocalStorage();
        alert(`Прочитано: «${item.name}». Навык «${item.skill}» вырос на 1 (теперь ${getEffectiveSkillValue(item.skill)}).`);
    };

    window.useScrollItem = function (itemId, viaPouch) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0) return;
        { const hb = castBlockReason(); if (hb) { alert(hb.replace('колдовать', 'читать свиток')); return; } } // свиток держат в руке, как заклинание
        // В бою свиток из рюкзака — основное действие (как заклинание); из подсумка — бонусное (useScrollFromPouch).
        if (!viaPouch && !combatActionAllowed('cast')) return;
        const spellName = item.scrollSpellName || item.name.replace(/^Свиток:\s*/, '');
        // Боевые свитки (наносят урон) нужно использовать через "Разрешить атаку" на вкладке
        // «Сессия» — там есть выбор цели. Через "Читать" (self-target) они раньше просто ничего
        // не делали, из-за чего казалось, что свитки в принципе не работают.
        if (parseSpellDamageFromDesc(item.effect || '')) {
            alert(`«${item.name}» — боевой свиток. Используй его через «Разрешить атаку» на вкладке «Сессия» (там выбираешь цель), а не через «Читать».`);
            return;
        }
        let scrollTarget = 'self';
        if (spellName === 'Захват душ') {
            const cz = pickSoulCorpseByPrompt();
            const chZ = precheckSoulTrap(cz);
            if (!chZ.ok) { alert(cz ? chZ.msg : 'Нет подходящих целей: ни живых врагов, ни трупов не старше ' + SOUL_WINDOW_TURNS + ' ходов с неприсвоенной душой. Свиток не потрачен.'); return; }
            scrollTarget = 'corpse:' + cz.id;
        }
        { // Свиток призыва скелета требует «Кучку костей», как и заклинание; без неё свиток не тратится.
            const tS = findSummonTemplateBySpellName(spellName);
            if (tS && tS.requiresItem && countInInventory(tS.requiresItem) <= 0) { alert('Для «' + spellName + '» нужна «' + tS.requiresItem + '» в инвентаре. Свиток не потрачен.'); return; }
        }
        const result = resolveSpellEffect(spellName, item.effect || '', item.scrollSchool || null, scrollTarget, true);
        removeFromInventoryByName(itemId, 1);
        if (!viaPouch) markCombatAction('attack');
        alert(result.message);
        if (item.scrollSchool && SCHOOL_CODE_TO_SKILL[item.scrollSchool] && typeof logSkillSuccessByName === 'function') {
            logSkillSuccessByName(SCHOOL_CODE_TO_SKILL[item.scrollSchool]);
        }
        renderInventoryList();
        updateAll();
        saveLocalStorage();
    };

    // Лаборатория свитков
    function isPerTurnSpell(desc) {
        // Заклинания «на поддержании» (мана каждый ход) свитком не записываются — общая проверка из spell-data.js.
        if (window.isSustainSpell) return window.isSustainSpell(desc);
        return /стоимость[^\n]{0,40}ход(?!ов)/i.test(desc || '');
    }

    function getSpellTierByName(school, name) {
        const data = (window.spellsData && window.spellsData[school]) || {};
        for (const tier of [1, 2, 3, 4]) {
            if ((data[tier] || []).some(s => s.name === name)) return tier;
        }
        return null;
    }

    function renderScrollSpellSelect() {
        const select = document.getElementById('scroll-spell-select');
        if (!select) return;
        const eligible = customSpells.filter(s => s.name && !isPerTurnSpell(s.desc));
        if (!eligible.length) {
            select.innerHTML = '<option value="">Нет доступных заклинаний — выучи хотя бы одно на вкладках выше</option>';
            document.getElementById('scroll-spell-info').innerHTML = '';
            return;
        }
        const prevValue = select.value;
        select.innerHTML = eligible.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`).join('');
        if (eligible.some(s => s.id === prevValue)) select.value = prevValue;
        updateScrollInfo();
    }

    function updateScrollInfo() {
        const select = document.getElementById('scroll-spell-select');
        const infoEl = document.getElementById('scroll-spell-info');
        if (!select || !infoEl) return;
        const spell = customSpells.find(s => s.id === select.value);
        if (!spell) { infoEl.innerHTML = ''; return; }
        const knownTier = spell.isCustom ? null : getSpellTierByName(spell.school, spell.name);
        const tierNames = ['', 'Новичок', 'Ученик', 'Адепт', 'Эксперт'];
        let html = `<div><strong>${escHtml(spell.name)}</strong></div>` +
            `<div style="opacity:.8; margin:4px 0;">${escHtml(spell.desc)}</div>` +
            `<div>База: ${spell.baseCost} MP</div>`;
        if (knownTier) {
            html += `<div>Круг: ${tierNames[knownTier]} (Мудрость на свиток: ${knownTier * 2})</div>`;
        } else {
            html += `<label style="font-size:13px; margin-top:4px;">Своё заклинание — укажи круг вручную</label>
                <select id="scroll-manual-tier" onchange="updateScrollManualTierLabel()">
                    <option value="1">Новичок (Мудрость: 2)</option>
                    <option value="2">Ученик (Мудрость: 4)</option>
                    <option value="3">Адепт (Мудрость: 6)</option>
                    <option value="4">Эксперт (Мудрость: 8)</option>
                </select>`;
        }
        infoEl.dataset.knownTier = knownTier || '';
    }

    window.updateScrollManualTierLabel = function () {}; // хук на будущее, значение уже читается напрямую при крафте

    function getCurrentScrollTier() {
        const infoEl = document.getElementById('scroll-spell-info');
        const known = infoEl ? parseInt(infoEl.dataset.knownTier) : 0;
        if (known) return known;
        const manualSelect = document.getElementById('scroll-manual-tier');
        return manualSelect ? (parseInt(manualSelect.value) || 1) : 1;
    }

    // Доля баночки чернил на свиток по рангу (магия.xlsx: баночки хватает на 4/3/2/1 свитка): 1/4, 1/3, 1/2, вся.
    const SCROLL_INK_FRACTION = { 1: 1 / 4, 2: 1 / 3, 3: 1 / 2, 4: 1 };
    const SCROLL_INK_LABEL = { 1: '¼', 2: '⅓', 3: '½', 4: '1' };
    // Мудрость на свиток — уровень заклинания ×2 (Sistema 2.2).
    const scrollWisdomCost = (tier) => tier * 2;

    window.craftScrollInSheet = function () {
        const select = document.getElementById('scroll-spell-select');
        const spell = customSpells.find(s => s.id === select.value);
        if (!spell) { alert('Сначала выучи и выбери заклинание.'); return; }
        if (isPerTurnSpell(spell.desc)) { alert('«' + spell.name + '» держится на мане каждый ход — такое заклинание на свиток не записать.'); return; }
        // Свитки пишут только на длительном отдыхе, за столом.
        if (inCombatNow()) { alert('Идёт бой — свиток можно начертить только на длительном отдыхе.'); return; }
        if (!confirm('Я на длительном отдыхе за столом')) return;
        const tier = getCurrentScrollTier();
        const tierNames = ['', 'Новичок', 'Ученик', 'Адепт', 'Эксперт'];
        let wis = parseInt(document.getElementById('stat-wis').value) || 10;
        let available = wis - scrollWisdomSpent;
        const wisCost = scrollWisdomCost(tier);
        if (available < wisCost) {
            alert(`Недостаточно свободной Мудрости: нужно ${wisCost}, свободно ${available}.`);
            return;
        }
        const parchmentHave = countInInventory('Пергамент');
        const inkHave = countInInventory('Чернила');
        const inkNeeded = SCROLL_INK_FRACTION[tier] || 0.25;
        if (parchmentHave < 1) {
            alert('Нужен пергамент (1 шт.) — его нет в инвентаре.');
            return;
        }
        if (inkHave + 1e-6 < inkNeeded) {
            alert(`Нужно ${SCROLL_INK_LABEL[tier]} баночки чернил — сейчас в инвентаре ${Math.round(inkHave * 100) / 100}.`);
            return;
        }
        removeFromInventoryByName('Пергамент', 1);
        removeFromInventoryByName('Чернила', Math.min(inkNeeded, inkHave));
        // доли (⅓) копятся с погрешностью — округляем остаток, пустую баночку убираем
        playerInventory.forEach(i => { if (i.itemId === 'Чернила' || i.itemId === 'Чернила#stolen') i.count = Math.round(i.count * 1000) / 1000; });
        playerInventory = playerInventory.filter(i => !((i.itemId === 'Чернила' || i.itemId === 'Чернила#stolen') && i.count < 0.01));

        scrollWisdomSpent += wisCost;
        document.getElementById('val-scrolls').innerText = wis - scrollWisdomSpent;
        addToInventory('Свиток: ' + spell.name, 'Свиток: ' + spell.name, 1, 0.1, 'Свиток', spell.desc, { scrollTier: tierNames[tier], price: tier * 15, scrollSchool: spell.school, scrollSpellName: spell.name });
        alert(`Успех! Потрачено ${wisCost} ед. Мудрости, 1 пергамент и ${SCROLL_INK_LABEL[tier]} баночки чернил на свиток «${spell.name}». Осталось ${wis - scrollWisdomSpent} ед. Мудрости. Свиток добавлен в инвентарь.`);
        saveLocalStorage();
    };
