
    // ========================================================================
    // АКТИВНЫЕ ЭФФЕКТЫ ПО ХОДАМ (зелья/еда со сроком действия)
    // ========================================================================

    // Заклинания "на поддержании" (Трансмутация мускулов и т.п.) тратят N маны КАЖДЫЙ ход, пока
    // либо игрок сам не снимет бафф, либо не кончится мана — у них нет фиксированной длительности
    // в ходах, поэтому turnsRemaining для них не 75/дефолт, а "бесконечность" (см. ниже).
    function parseManaPerTurn(text) {
        const t = text || '';
        // «Стоимость поддержания 10 маны за ход», «Стоимость поддержи 10 ход», «поддержка 10 мп ход»,
        // «Тратит 50 мп ход», «тратя 90 мп за ход / 60 МП в ход»
        const m = t.match(/поддерж[а-яёА-ЯЁ]*\s+(\d+)[\d\/]*\s*(?:маны|мана|мп)?\s*(?:за\s+|в\s+)?ход/i)
            || t.match(/трат[а-яёА-ЯЁ]*\s+(\d+)[\d\/]*\s*(?:маны|мана|мп)\s*(?:за\s+|в\s+)?ход/i);
        return m ? parseInt(m[1]) : 0;
    }

    // Стоимость поддержания баффа в ход. 1) число прямо в описании («поддержание 10 маны за ход», «тратит 50 мп ход»);
    // 2) если у заклинания стоимость записана «N маны/ход» (ауры, Дар силы, ауры призыва) — то же, что стоит каст
    // (без ×2 усиленного); 3) иначе 0 (разовое заклинание). Для 2) нужно, чтобы был реальный баф (hasBuff).
    function getSpellUpkeep(spellName, desc, isFree, enhanced, hasBuff) {
        const explicit = parseManaPerTurn(desc);
        if (explicit) return explicit;
        if (!hasBuff) return 0;
        const full = findSpellDescByName(spellName);
        if (!full || !isPerTurnSpell(full)) return 0;
        let cost = (!isFree && lastSpellCastCost > 0) ? Math.round(lastSpellCastCost / (enhanced ? (lastSpellEnhFactor || 2) : 1)) : 0;
        if (!cost) cost = getSpellBaseCostByName(spellName);
        return cost;
    }
    function getSpellBaseCostByName(name) {
        const data = window.spellsData || {};
        for (const sc of Object.keys(data)) for (const t of Object.keys(data[sc] || {})) {
            const f = (data[sc][t] || []).find(s => s.name === name);
            if (f) return f.baseCost || 0;
        }
        return 0;
    }

    function parseDurationTurns(text) {
        // Если есть стоимость поддержания в ход — длительность не по ходам, а по мане (см. выше).
        if (parseManaPerTurn(text)) return Infinity;
        const m = (text || '').match(/(\d+)\s*ход/i);
        return m ? parseInt(m[1]) : 75; // по умолчанию как у большинства блюд
    }

    // ========================================================================
    // ЭФФЕКТЫ ЗЕЛИЙ И ЯДОВ — применение на себя (таблица автора алхимии).
    // Эффект описан в alchemy-data.js: kind (что делает), base/dur (сила/длительность), polarity.
    // Зелье выпитое действует на пьющего ВСЕМИ свойствами (и хорошими, и плохими); яд выпить нельзя «по правилам»,
    // но игрок может — тогда он действует на него; по назначению яд мажется на оружие (applyPoisonToWeapon).
    // ========================================================================
    // Периайт: болезнь вместо штрафа даёт бафф (базовое значение ×ступень веры: +1/+2/+3, по diseaseBuff 25/50/75%).
    const DISEASE_BUFFS = {
        'Атаксия': 'к броскам Одноручного оружия и Взлома',
        'Каменная подагра': 'к броскам Тяжёлой/Лёгкой брони',
        'Заумь': 'к броскам школ магии (Разрушение/Восстановление/Колдовство/Иллюзия/Изменение)',
        'Кровавая лихорадка': 'к максимальному здоровью (×10)',
        'Насморк Пелиниала': 'к броскам Скрытности и Карманных краж'
    };
    function peryiteMagnitude() {
        if (((document.getElementById('faith-god') || {}).value) !== 'peryite') return 0;
        return Math.round(gb('diseaseBuff') / 25); // 25→1, 50→2, 75→3
    }
    function diseaseEffectDesc(e) {
        const k = peryiteMagnitude();
        const m = (e.effectName || '').match(/^Болезнь:\s*(.+)$/);
        if (!k || !m) return e.description;
        const d = m[1].trim();
        const pb = PERIYTE_BUFFS[d];
        if (pb) {
            const parts = [];
            if (pb.mp) parts.push(`+${pb.mp[k - 1]} магии`);
            if (pb.hp) parts.push(`+${pb.hp[k - 1]} здоровья`);
            if (pb.speed) parts.push(`+${pb.speed[k - 1]} фт скорости`);
            if (pb.elemRes) parts.push(`+${pb.elemRes[k - 1]}% сопротивления стихиям`);
            if (pb.roll && pb.roll[k - 1]) parts.push(`+${pb.roll[k - 1]} к кубам Карманных краж и Взлома`);
            if (pb.weaponPct && pb.weaponPct[k - 1]) parts.push(`+${pb.weaponPct[k - 1]}% урона оружием, +${pb.armor[k - 1]} брони`);
            return parts.length ? `🦠 Периайт: вместо штрафа ${parts.join(', ')}.` : '🦠 Периайт: болезнь не вредит (бафф — со 2-го ранга).';
        }
        const tail = DISEASE_BUFFS[d];
        if (!tail) return `Периайт обращает болезнь в силу (+${k}, на усмотрение мастера).`;
        return `🦠 Периайт: вместо штрафа +${d === 'Кровавая лихорадка' ? k * 10 : k} ${tail}.`;
    }
    const DISEASE_DESCS = {
        'Атаксия': '−2 к броскам Одноручного оружия и Взлома (применяется автоматически).',
        'Каменная подагра': '−2 к броскам Тяжёлой/Лёгкой брони.',
        'Заумь': '−2 к броскам школ магии (Разрушение/Восстановление/Колдовство/Иллюзия/Изменение).',
        'Кровавая лихорадка': '−10 к максимальному здоровью, пока не вылечена.',
        'Насморк Пелиниала': '−2 к броскам Скрытности и Карманных краж.',
        'Разжижение мозга': '−25 к максимальному здоровью, пока не вылечена.',
        'Костоломная лихорадка': '−5 фт скорости, пока не вылечена.',
        'Хрипунец': '−10% сопротивления стихиям (огонь, холод, электричество), пока не вылечен.'
    };

    // 'potion' | 'poison' | null — по категории предмета (в базе встречаются «Зелье», «Зелья», «Яд», «Яды», «Зелье (лут)»...).
    function potionKindOf(item) {
        const c = (item && item.category) || '';
        if (/^Яд/i.test(c)) return 'poison';
        if (/^Зель/i.test(c)) return 'potion';
        return null;
    }

    // Всплывающая подсказка (без alert, чтобы не блокировать игру).
    function alchToast(html) {
        try {
            let box = document.getElementById('alch-toast');
            if (!box) {
                box = document.createElement('div');
                box.id = 'alch-toast';
                box.style.cssText = 'position:fixed; left:50%; bottom:18px; transform:translateX(-50%); max-width:92vw; z-index:9999; background:#1d1a14; color:#e8dcc0; border:1px solid var(--accent-color, #c8a566); border-radius:6px; padding:8px 12px; font-size:14px; box-shadow:0 2px 10px rgba(0,0,0,.6); display:none;';
                box.onclick = function () { box.style.display = 'none'; };
                document.body.appendChild(box);
            }
            box.innerHTML = html;
            box.style.display = 'block';
            clearTimeout(box._t);
            box._t = setTimeout(() => { box.style.display = 'none'; }, 9000);
        } catch (e) { /* подсказка — удобство, не критично */ }
    }

    function describeEffectForUi(e) {
        const info = (window.alchemyBaseEffects || {})[e.name] || {};
        return (typeof window.describeAlchemyEffect === 'function')
            ? window.describeAlchemyEffect({ name: e.name, magnitude: (typeof e.magnitude === 'number' ? e.magnitude : null), duration: e.duration || null, unit: e.unit !== undefined ? e.unit : (info.unit || '') })
            : e.name;
    }

    // effects: [{ name, magnitude, duration, unit }]. opts.fromFood — эффект от еды (снимается «Повышением голода»).
    // Возвращает массив строк-итогов (что реально произошло).
    function applyAlchemyEffectsToSelf(effects, sourceName, opts) {
        opts = opts || {};
        const notes = [];
        const hpEl = document.getElementById('cur-hp'), mpEl = document.getElementById('cur-mp');
        const maxHp = () => parseInt(document.getElementById('max-hp').value) || 0;
        const maxMp = () => parseInt(document.getElementById('max-mp').value) || 0;
        const base = (window.alchemyBaseEffects || {});
        (effects || []).forEach(e => {
            if (!e || !e.name) return;
            const info = base[e.name] || null;
            const kind = e.kind || (info && info.kind) || null;
            const mag = (typeof e.magnitude === 'number') ? e.magnitude : null;
            const dur = e.duration || (info && info.dur) || 1;
            const label = describeEffectForUi(e);
            const timed = (extra) => {
                const entry = Object.assign({
                    id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
                    name: sourceName, effectName: e.name, description: label, turnsRemaining: dur,
                    polarity: info ? info.polarity : null, fromAlchemy: true
                }, extra || {});
                if (opts.fromFood) entry.fromFood = true;
                pushOrRefreshTimedEffect(entry);
            };
            switch (kind) {
                case 'heal_hp': {
                    const cur = parseInt(hpEl.value) || 0;
                    const nv = Math.max(cur, Math.min(maxHp(), cur + (mag || 0)));
                    hpEl.value = nv; notes.push(`+${nv - cur} хп`); break;
                }
                case 'heal_mp': {
                    const cur = parseInt(mpEl.value) || 0;
                    const nv = Math.max(cur, Math.min(maxMp(), cur + (mag || 0)));
                    mpEl.value = nv; notes.push(`+${nv - cur} маны`); break;
                }
                case 'dmg_hp': {
                    const cur = parseInt(hpEl.value) || 0;
                    // Выпитый яд режется сопротивлением ядам (иммунитет вампира — полностью); сырая еда — не яд.
                    const pr = opts.fromFood ? 0 : selfPoisonResist();
                    const dmgP = Math.max(0, Math.round((mag || 0) * (1 - pr / 100)));
                    hpEl.value = Math.max(opts.fromFood ? Math.min(1, cur) : 0, cur - dmgP); notes.push(opts.fromFood ? `−${dmgP} хп (сырое)` : `−${dmgP} хп (яд${pr ? ', сопротивление ' + pr + '%' : ''})`); break;
                }
                case 'dmg_mp': {
                    const cur = parseInt(mpEl.value) || 0;
                    mpEl.value = Math.max(0, cur - (mag || 0)); notes.push(`−${mag || 0} маны`); break;
                }
                case 'max_hp': timed({ hp: mag || 0 }); notes.push(label); break;
                case 'max_mp': timed({ mp: mag || 0 }); notes.push(label); break;
                case 'weight': timed({ weight: mag || 0 }); notes.push(label); break;
                case 'speed': timed({ speed: mag || 0 }); notes.push(label); break;
                case 'slow': timed({ speed: -(mag || 0) }); notes.push(label); break;
                case 'dmg_pct': timed({ percentEffects: [{ type: 'weaponDamagePercent', value: mag || 0 }] }); notes.push(label); break;
                case 'dmg_dealt_down': timed({ dmgFlat: -(mag || 0) }); notes.push(label); break;
                case 'res_phys': timed({ res: { physical: mag || 0 } }); notes.push(label); break;
                case 'res_magic': timed({ res: { magic: mag || 0 } }); notes.push(label); break;
                case 'res_fire': timed({ res: { fire: mag || 0 } }); notes.push(label); break;
                case 'res_frost': timed({ res: { frost: mag || 0 } }); notes.push(label); break;
                case 'res_shock': timed({ res: { shock: mag || 0 } }); notes.push(label); break;
                case 'res_poison': timed({ res: { poison: mag || 0 } }); notes.push(label); break;
                case 'res_shout': timed({ res: { shout: mag || 0 } }); notes.push(label); break;
                case 'vuln_fire': timed({ res: { fire: -(mag || 0) } }); notes.push(label); break;
                case 'vuln_frost': timed({ res: { frost: -(mag || 0) } }); notes.push(label); break;
                case 'vuln_shock': timed({ res: { shock: -(mag || 0) } }); notes.push(label); break;
                case 'vuln_poison': timed({ res: { poison: -(mag || 0) } }); notes.push(label); break;
                case 'vuln_magic': timed({ res: { magic: -(mag || 0) } }); notes.push(label); break;
                case 'dmg_taken_up': timed({ res: { physical: -(mag || 0) } }); notes.push(label); break;
                case 'regen_hp': timed({ regenHp: mag || 0 }); notes.push(label); break;
                case 'regen_mp': timed({ regenMp: mag || 0 }); notes.push(label); break;
                case 'dot_hp': timed({ dotHp: mag || 0, isPoisonEffect: true }); notes.push(label); break;
                case 'dot_mp': timed({ dotMp: mag || 0, isPoisonEffect: true }); notes.push(label); break;
                case 'skill': timed({ value: mag || 0 }); notes.push(label); break;
                case 'invis': case 'water': case 'paralysis': case 'disarm': case 'fear': case 'frenzy': case 'mute':
                    timed({ statusFlag: kind }); notes.push(label); break;
                case 'hunger': {
                    const before = activeTimedEffects.length;
                    activeTimedEffects = activeTimedEffects.filter(x => !x.fromFood);
                    daysWithoutFood += 1;
                    if (typeof updateDateDisplay === 'function') updateDateDisplay();
                    notes.push(`голод +1 (снято баффов от еды: ${before - activeTimedEffects.length})`); break;
                }
                case 'cure_disease': {
                    const before = activeTimedEffects.length;
                    activeTimedEffects = activeTimedEffects.filter(x => !(x.effectName && x.effectName.indexOf('Болезнь:') === 0));
                    notes.push(before !== activeTimedEffects.length ? 'болезни излечены' : 'болезней не было'); break;
                }
                case 'cure_poison': {
                    const before = activeTimedEffects.length;
                    activeTimedEffects = activeTimedEffects.filter(x => !x.isPoisonEffect);
                    notes.push(before !== activeTimedEffects.length ? 'яды выведены' : 'ядов не было'); break;
                }
                case 'random_disease': {
                    // Аргониане и вампиры болезням не подвержены (иммунитет 100%).
                    if ((document.getElementById('char-race') || {}).value === 'argonian' || snVampire()) { notes.push('болезнь не пристала — иммунитет'); break; }
                    const list = window.alchemyDiseases || Object.keys(DISEASE_DESCS);
                    const d = list[Math.floor(Math.random() * list.length)];
                    pushOrRefreshTimedEffect({
                        id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
                        name: sourceName, effectName: 'Болезнь: ' + d, description: DISEASE_DESCS[d] || 'Эффект — на усмотрение мастера.',
                        turnsRemaining: Infinity, fromAlchemy: true
                    });
                    notes.push('заражение: ' + d); break;
                }
                default:
                    // Неизвестный/устаревший эффект старого зелья — запоминаем как текстовый (на усмотрение мастера).
                    timed({ value: mag || 0 }); notes.push(label);
            }
        });
        clampTempHp();
        if (typeof updateVitalBars === 'function') updateVitalBars();
        return notes;
    }
    window.applyAlchemyEffectsToSelf = applyAlchemyEffectsToSelf;
    window.alchToast = alchToast;

    function activateTimedEffectFromItem(item, opts) {
        if (item.alchemyEffects && item.alchemyEffects.length) {
            const notes = applyAlchemyEffectsToSelf(item.alchemyEffects, item.name, opts);
            if (notes.length) alchToast(`🧪 <strong>${escHtml(item.name)}</strong>: ${notes.map(escHtml).join('; ')}`);
        } else {
            const duration = parseDurationTurns(item.effect);
            const plain = parsePlainEffectBonus(item.effect);
            const percentEffects = (typeof parsePercentEffects === 'function') ? parsePercentEffects(item.effect) : [];
            pushOrRefreshTimedEffect({
                id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: item.name, effectName: item.name,
                description: item.effect || '',
                turnsRemaining: duration,
                hp: (plain && plain.key === 'hp') ? plain.value : 0,
                mp: (plain && plain.key === 'mp') ? plain.value : 0,
                speed: (plain && plain.key === 'speed') ? plain.value : 0,
                armor: (plain && plain.key === 'armor') ? plain.value : 0,
                value: plain ? plain.value : 0,
                percentEffects: percentEffects,
                fromFood: !!(opts && opts.fromFood)
            });
        }
        // Блюдо с алхимической добавкой («Утончённый вкус») — её эффект поверх эффекта блюда.
        if (item.bonusAlchemy && item.bonusAlchemy.length) {
            const notesB = applyAlchemyEffectsToSelf(item.bonusAlchemy, item.name, opts);
            if (notesB.length) alchToast(`🧪 <strong>${escHtml(item.name)}</strong>: ${notesB.map(escHtml).join('; ')}`);
        }
        renderActiveEffects();
    }

    // ---------- Яд на оружии (держится на ОДИН удар) ----------
    let weaponPoison = null; // { name, effects: [{name, magnitude, duration, unit}] }
    function renderWeaponPoisonStatus() {
        ['weapon-poison-status', 'weapon-poison-status-attack'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = weaponPoison
                ? `<span style="color:#9b59b6;">☠ На оружии: <strong>${escHtml(weaponPoison.name)}</strong> — сработает на ближайшем попадании (один удар).</span> <a href="#" onclick="clearWeaponPoison(); return false;" style="font-size:12px; opacity:.7;">смыть</a>`
                : '';
        });
    }
    window.clearWeaponPoison = function () { weaponPoison = null; renderWeaponPoisonStatus(); saveLocalStorage(); };
    window.applyPoisonToWeapon = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0) return;
        if (!item.alchemyEffects || !item.alchemyEffects.length) { alert('У этого яда нет описанных эффектов — мастер применит его вручную.'); return; }
        if (!equippedSlots.meleeWeapon && !equippedSlots.rangedWeapon) { alert('Сначала экипируй оружие (ближнее или дальнее), на которое наносится яд.'); return; }
        if (weaponPoison && !confirm(`На оружии уже есть «${weaponPoison.name}». Смыть и нанести новый яд?`)) return;
        removeFromInventoryByName(itemId, 1);
        weaponPoison = { name: item.name, effects: item.alchemyEffects.map(e => ({ name: e.name, magnitude: (typeof e.magnitude === 'number' ? e.magnitude : null), duration: e.duration || null, unit: e.unit || '' })) };
        renderWeaponPoisonStatus();
        renderInventoryList();
        updateAll();
        saveLocalStorage();
        alchToast(`☠ Яд «${escHtml(item.name)}» нанесён на оружие — сработает на одном ударе.`);
    };

    window.useInventoryItem = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!item || item.count <= 0) return;
        if (snWerewolfForm()) { alert('В облике зверя нельзя пить зелья и есть обычную еду — оборотень лечится только пожиранием трупов.'); return; }
        if (lichBlocksUse(item, isFoodItem(item) && potionKindOf(item) !== 'potion')) return;
        if (potionKindOf(item) === 'poison' && !confirm('Это ЯД. Его наносят на оружие (кнопка «☠ На оружие»). Выпить всё равно — он подействует на тебя?')) return;
        // В бою из рюкзака — основное действие хода; из подсумка — бонусное (drinkFromPouch).
        if (!combatActionAllowed('item')) return; // зелье — не заклинание: Немота не мешает
        markCombatAction('attack');
        removeFromInventoryByName(itemId, 1);
        activateTimedEffectFromItem(item);
        renderInventoryList();
        updateAll();
        saveLocalStorage();
    };

    // Даэдрические артефакты, которые можно использовать (вещь остаётся у игрока).
    const ARTIFACT_USE = { 'Кубок Бесконечного Хмеля': '🍺 Глоток', 'Чаша Благословения': '🏆 Испить' };
    window.useArtifactItem = function (itemId) {
        const item = playerInventory.find(i => i.itemId === itemId && i.count > 0);
        if (!item || !ARTIFACT_USE[item.name]) return;
        if (item.name === 'Кубок Бесконечного Хмеля') {
            // «Глоток – снимает замедление, +4 Силы на 3 хода, −2 куба на стрельбу/магию»
            if (!combatActionAllowed('item')) return;
            markCombatAction('attack');
            const slowed = activeTimedEffects.filter(e => /замедл/i.test(String(e.effectName || e.name || '')) || (e.speed < 0 && !/^Болезнь:/.test(e.effectName || '')));
            activeTimedEffects = activeTimedEffects.filter(e => slowed.indexOf(e) === -1 && e.effectName !== 'Кубок Бесконечного Хмеля');
            activeTimedEffects.push({ id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6), name: item.name, effectName: 'Кубок Бесконечного Хмеля',
                description: '+4 Силы, −2 к кубам на стрельбу и магию', turnsRemaining: 3, statBonus: { str: 4 }, atkModePenalty: { modes: ['ranged', 'spell'], value: -2 } });
            renderActiveEffects(); updateAll(); saveLocalStorage();
            alertSafe(`🍺 Глоток из Кубка: +4 Силы и −2 к стрельбе/магии на 3 хода${slowed.length ? `, снято замедление (${slowed.map(e => e.effectName || e.name).join(', ')})` : ''}.`);
            return;
        }
        if (item.name === 'Чаша Благословения') {
            // «Навсегда увеличивает самую большую характеристику на 5, уменьшает самую маленькую на 5» — один раз.
            if (item.artifactUsed) { alert('Чаша уже испита — её благословение получают один раз.'); return; }
            const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'], NAMES = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
            const raw = k => parseInt(document.getElementById('stat-' + k).getAttribute('data-raw-stat')) || 10;
            const eff = k => parseInt(document.getElementById('stat-' + k).value) || raw(k);
            const hi = keys.reduce((a, k) => eff(k) > eff(a) ? k : a, keys[0]);
            const lo = keys.reduce((a, k) => eff(k) < eff(a) ? k : a, keys[0]);
            if (hi === lo) { alert('Все характеристики равны — чаше нечего менять.'); return; }
            if (!confirm(`Испить из Чаши Благословения? Навсегда: ${NAMES[hi]} +5, ${NAMES[lo]} −5. Только один раз.`)) return;
            document.getElementById('stat-' + hi).setAttribute('data-raw-stat', raw(hi) + 5);
            document.getElementById('stat-' + lo).setAttribute('data-raw-stat', Math.max(1, raw(lo) - 5));
            item.artifactUsed = true;
            renderInventoryList(); updateAll(); saveLocalStorage();
            alertSafe(`🏆 Чаша Благословения: ${NAMES[hi]} +5, ${NAMES[lo]} −5 (навсегда).`);
        }
    };

    function renderActiveEffects() {
        dropOrphanedSpirits();
        const el = document.getElementById('active-timed-effects-list');
        if (!el) return;
        if (!activeTimedEffects.length) {
            el.innerHTML = '<p style="opacity:.6; font-size:14px;">Нет активных эффектов.</p>';
            return;
        }
        el.innerHTML = activeTimedEffects.map(e => {
            // Эффекты "на поддержании" (тратят ману каждый ход) имеют turnsRemaining: Infinity —
            // раньше это просто подставлялось в шаблон строки и показывало "Infinity х.".
            // "Пока есть мана" было верно только для спеллов "на поддержании" — для болезней
            // (тоже Infinity, но не тратят ману, просто бессрочны до лечения) текст был неверным.
            const turnsLabel = e.turnsRemaining === Infinity
                ? (e.untilDayEnd ? '∞ (до конца дня)' : (e.effectName && e.effectName.indexOf('Болезнь:') === 0 ? '∞ (до излечения)' : '∞ (пока есть мана)'))
                : e.turnsRemaining + (e.fromAlchemy ? ' кр.' : ' х.');
            return `
            <div class="party-row">
                <div class="row-name"><span><strong>${escHtml(e.name)}</strong>: ${escHtml(diseaseEffectDesc(e))}</span><span>${turnsLabel}</span></div>
                ${e.wall ? `<button style="width:auto; padding:2px 8px; font-size:12px; margin-top:2px;" onclick="openWallStrike('${jsq(e.id)}')">${e.wall.icon} Ударить стеной</button> ` : ''}${e.detect ? `<button style="width:auto; padding:2px 8px; font-size:12px; margin-top:2px;" onclick="showDetection('${jsq(e.detect)}')">👁 Показать</button> ` : ''}${isNegativeTimedEffect(e) ? '<span style="font-size:12px; opacity:.7;">снимается лечением или мастером</span>' : `<button class="btn-danger" style="width:auto; padding:2px 8px; font-size:12px; margin-top:2px;" onclick="removeActiveEffect('${jsq(e.id)}')">Снять</button>`}
            </div>`;
        }).join('');
    }

    // Игрок сам снимает с себя эффект (бафф или дебафф) — без необходимости ждать, пока
    // истечёт время, или просить мастера.
    // Поддерживаемый на союзнике баф: сообщаем союзнику, что заклинатель перестал его держать.
    function releaseSustainedAlly(e) {
        if (!e || !e.sustainAlly || !window.CloudSync || typeof window.CloudSync.pushEffectToPlayer !== 'function') return;
        const myName = (document.getElementById('char-name') || {}).value || 'Союзник';
        window.CloudSync.pushEffectToPlayer(e.sustainAlly.uid, {
            id: 'rel-' + Date.now() + Math.random().toString(36).slice(2, 8), name: myName,
            effectName: e.sustainAlly.effectName, remove: true, sustainKey: e.sustainAlly.key
        }).catch(err => console.error('Не удалось снять поддерживаемый эффект у союзника:', err));
    }

    window.removeActiveEffect = function (id) {
        // Вредное (болезнь, яд, статус от мастера, штраф) снимается только лечением или мастером — не бесплатной кнопкой.
        if (activeTimedEffects.some(e => e.id === id && isNegativeTimedEffect(e))) { alert('Этот эффект сам не снимешь: нужно лечение (зелье, заклинание, алтарь) или решение мастера.'); return; }
        activeTimedEffects.filter(e => e.id === id).forEach(releaseSustainedAlly);
        activeTimedEffects = activeTimedEffects.filter(e => e.id !== id);
        clampTempHp();
        renderActiveEffects();
        updateAll();
        saveLocalStorage();
    };

    // Мастер наложил статус-эффект атакой НПС (паралич/страх/замедление и т.п.) — добавляем
    // в свой собственный список активных эффектов, тикает по тем же ходам, что и баффы.
    // ======== Боевая сетка (игрок): дальность, досягаемость, площадные удары. Сетку ведёт мастер (session.grid) ========
    function myUidG() { return window.CloudSync && window.CloudSync.getCurrentUid ? window.CloudSync.getCurrentUid() : null; }
    function sessGrid() { const s = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null; return s && s.grid && window.GridCore ? s.grid : null; }
    // Досягаемость ближнего боя: 5 фт; копья, пики, боевые посохи и двуручные молоты — 10 фт.
    function playerMeleeReachFt() {
        const type = (document.getElementById('wep-melee-type') || {}).value;
        const name = String((document.getElementById('wep-melee-name') || {}).value || '');
        if (type === 'twohand_hammer' || type === 'twohand_pike' || type === 'twohand_staff' || /копь|пик[аи]|посох/i.test(name)) return 10;
        return 5;
    }
    function summonIsRanged(sm) { return !!sm && (/лучник|снайпер|маг|атронах/i.test(sm.name || '') || (sm.dmgType && sm.dmgType !== 'physical' && !/физ/i.test(sm.dmgType))); }
    // Откуда и как бьёт выбранное действие: { from, mode, reach, who }
    function attackGeometry(actionVal) {
        const grid = sessGrid(); if (!grid) return null;
        const G = window.GridCore, me = myUidG();
        if (actionVal && actionVal.indexOf('summon:') === 0) {
            const sm = activeSummons.find(x => x.id === actionVal.slice(7));
            if (sm && sm.category === 'weapon') return { from: G.tokenOf(grid, 'p', me), mode: sm.equipSlot === 'ranged' ? 'ranged' : 'melee', reach: 5 };
            return { from: G.tokenOf(grid, 's', actionVal.slice(7), me), mode: summonIsRanged(sm) ? 'ranged' : 'melee', reach: 5, who: sm ? sm.name : 'существо' };
        }
        const mode = (actionVal === 'ranged') ? 'ranged' : (actionVal && /^(spell|scroll|control|mstaff):/.test(actionVal)) ? 'spell' : 'melee';
        const reach = mode !== 'melee' ? 0 : (['bite', 'claw', 'bash', 'bash_basic'].indexOf(actionVal) !== -1 ? 5 : playerMeleeReachFt());
        let opts = null;
        if (mode === 'ranged') { // лук — стрелы, арбалет — болты; призванный лук и посох в слоте — общее правило
            const rt = (document.getElementById('wep-ranged-type') || {}).value || '';
            const rIt = equippedSlots.rangedWeapon ? playerInventory.find(i => i.itemId === equippedSlots.rangedWeapon) : null;
            const rName = String((document.getElementById('wep-ranged-name') || {}).value || '').toLowerCase();
            if ((rIt && (rIt.isStaff || /^Посох/.test(String(rIt.category || '')))) || rName.indexOf('призван') === 0) opts = null;
            else if (rt === 'crossbow') opts = { ammo: 'bolt' };
            else if (rt === 'bow') opts = { ammo: 'arrow', maxFt: isPerkChecked('Орлиный взор') ? 90 : 80 };
        }
        if (mode === 'spell') { const xr = getGearSpecialBonuses().castRangeFt; if (xr) opts = { extraFt: xr }; }
        return { from: G.tokenOf(grid, 'p', me), mode, reach, opts };
    }
    function gridCheckFor(actionVal, enemyId) {
        const grid = sessGrid(); if (!grid) return null;
        const geo = attackGeometry(actionVal); if (!geo) return null;
        const to = window.GridCore.tokenOf(grid, 'e', enemyId);
        return window.GridCore.attackCheck(grid, geo.from, to, geo.mode, geo.reach, geo.opts);
    }
    window.gridCheckFor = gridCheckFor;
    // Площадное заклинание: тот же урон всем фигурам в радиусе (враги, другие игроки, существа — и сам заклинатель, если взрыв рядом).
    function gridApplyAoe(pa, myName) {
        const grid = sessGrid(); const G = window.GridCore; if (!grid || !pa.area) return;
        const me = myUidG(), myTok = G.tokenOf(grid, 'p', me), tgtTok = G.tokenOf(grid, 'e', pa.targetId);
        const center = pa.area.center === 'self' ? myTok : tgtTok; if (!center) return;
        const sess = window.CloudSync.getSessionData() || {};
        const hits = [];
        G.tokensInRadius(grid, center, pa.area.radiusFt).forEach(t => {
            if (t.kind === 'e') {
                if (t.ref === pa.targetId) return;
                const en = (sess.enemies || []).find(x => x.id === t.ref); if (!en || (en.curHp || 0) <= 0) return;
                hits.push(en.name);
                window.CloudSync.applyDamageToEnemy(t.ref, pa.dmg, myName, `💥 «${pa.area.spell}» (${myName}) задевает «${en.name}»: урон ${pa.dmg}`, pa.dmgType, 0).catch(() => { });
            } else if (t.kind === 'p') {
                if (t.ref === me) { if (pa.area.center === 'self') return; gridAoeHit({ dmg: pa.dmg, dmgType: pa.dmgType, from: pa.area.spell }); hits.push('ты сам(а)'); return; }
                const pn = ((sess.participants || {})[t.ref] || {}).name || 'союзник'; hits.push(pn);
                window.CloudSync.pushEffectToPlayer(t.ref, { id: 'aoe' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'aoeHit', dmg: pa.dmg, dmgType: pa.dmgType, from: pa.area.spell }).catch(() => { });
            } else if (t.kind === 's') {
                if (t.owner === me) { gridAoeHit({ dmg: pa.dmg, dmgType: pa.dmgType, from: pa.area.spell, summonId: t.ref }); hits.push('твоё существо'); return; }
                hits.push('существо союзника');
                window.CloudSync.pushEffectToPlayer(t.owner, { id: 'aoe' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'aoeHit', dmg: pa.dmg, dmgType: pa.dmgType, from: pa.area.spell, summonId: t.ref }).catch(() => { });
            }
        });
        if (hits.length) {
            window.CloudSync.postCombatLog(`💥 «${pa.area.spell}» (радиус ${pa.area.radiusFt} фт) задевает ещё: ${hits.join(', ')}.`, myName);
            alchToast('💥 Площадь «' + escHtml(pa.area.spell) + '»: задеты ' + escHtml(hits.join(', ')));
        }
    }
    window.gridApplyAoe = gridApplyAoe;
    // Подписи в списке целей: расстояние и можно ли достать выбранным действием.
    function gridAnnotateTargets() {
        const sel = document.getElementById('attack-target-select'); const info = document.getElementById('attack-grid-info');
        const act = (document.getElementById('attack-action-select') || {}).value || 'melee';
        const grid = sessGrid();
        if (!sel) return;
        [...sel.options].forEach(o => {
            if (!o.value) return;
            if (!o.dataset.base) o.dataset.base = o.textContent;
            const chk = grid ? gridCheckFor(act, o.value) : null;
            o.textContent = o.dataset.base + (chk && chk.onGrid ? ' · 📏 ' + chk.label : '');
        });
        if (info) {
            const chk = grid && sel.value ? gridCheckFor(act, sel.value) : null;
            const geo = grid ? attackGeometry(act) : null;
            info.textContent = !grid ? '' : !geo || !geo.from ? '🗺 Мастер ещё не поставил тебя на боевую сетку — дальность не учитывается.' :
                chk && chk.onGrid ? (chk.ok ? '📏 ' + chk.feet + ' фт до цели' + (chk.penalty ? ' — далеко: ' + chk.penalty + ' к попаданию' : ' — достаёшь') : '⛔ ' + chk.reason) : '🗺 Цель не на сетке — дальность не учитывается.';
            info.style.color = chk && chk.onGrid && !chk.ok ? '#e74c3c' : '';
        }
    }
    window.gridAnnotateTargets = gridAnnotateTargets;
    // Длительные зоны на сетке. place: follow — аура вокруг заклинателя (ходит с ним), self — круг на месте каста, gm — ставит мастер.
    const GRID_ZONE_SPELLS = {
        // perRound — плащи считают длительность в КРУГАХ (спадают, когда сменилось нужное число кругов), а бьют в ход каждого существа
        'Огненный плащ': { kind: 'aura', place: 'follow', dmgType: 'fire', who: 'enemies', icon: '🔥', radius: 5, perRound: true },
        'Морозный плащ': { kind: 'aura', place: 'follow', dmgType: 'frost', who: 'enemies', icon: '❄️', radius: 5, perRound: true },
        'Плащ молний': { kind: 'aura', place: 'follow', dmgType: 'shock', who: 'enemies', icon: '⚡', radius: 5, mpHalf: true, perRound: true },
        'Плащ морозного огня': { kind: 'aura', place: 'follow', dmgType: 'fire', dmgType2: 'frost', who: 'enemies', icon: '🔥❄️', radius: 5, perRound: true },
        'Аура Стендарра': { kind: 'aura', place: 'follow', dmgType: 'magic', who: 'undead', icon: '☀', radius: 5, noResist: true },
        'Вихревой плащ': { kind: 'aura', place: 'follow', dmgType: '', who: 'enemies', icon: '🌪', radius: 5, slowOnly: true, perRound: true },
        'Дурман': { kind: 'aura', place: 'follow', dmgType: 'magic', who: 'enemies', icon: '🌫', radius: 10, upkeep: true },
        'Круг огня': { kind: 'area', place: 'self', dmgType: 'magic', who: 'undead', icon: '🔆', radius: 10, noResist: true },
        'Круг защиты': { kind: 'area', place: 'self', dmgType: '', who: 'undead', icon: '⭕', radius: 10, flee: true },
        'Гудящий камень': { kind: 'area', place: 'gm', dmgType: 'shock', who: 'enemies', icon: '🗿', radius: 10, resistDown: 5 },
        'Стена пламени': { kind: 'wall', place: 'gm', dmgType: 'fire', who: 'all', icon: '🔥', upkeep: true },
        'Стена мороза': { kind: 'wall', place: 'gm', dmgType: 'frost', who: 'all', icon: '❄️', upkeep: true },
        'Грозовая стена': { kind: 'wall', place: 'gm', dmgType: 'shock', who: 'all', icon: '⚡', upkeep: true }
    };
    function gridZoneAvailable() {
        const g = sessGrid(); return !!(g && window.CloudSync && window.CloudSync.addPendingZone && window.GridCore.tokenOf(g, 'p', myUidG()));
    }
    function castGridZone(name, desc, enhanced, isFree, mult) {
        const Z = GRID_ZONE_SPELLS[name]; const full = findSpellDescByName(name) || desc || '';
        const parts = splitSpellDescByEnhancement(full);
        const txt = (enhanced && /\d/.test(parts.enhanced) ? parts.enhanced : parts.base) || desc || '';
        let dmg = parseInt((txt.match(/(\d+)\s*(?:единиц[аы]?\s*)?урон/i) || [])[1]) || 0;
        if (name === 'Дурман') dmg = parseInt((txt.match(/на\s+(\d+)/i) || [])[1]) || 0;
        dmg = Math.round(dmg * (mult || 1));
        let dmg2 = 0;
        if (Z.dmgType2) { // две стихии (плащ лича): вторая половина урона, у каждой своя стихия и свой перк стихии
            dmg2 = Math.round((parseInt((txt.match(/и\s+(\d+)\s*(?:единиц[аы]?\s*)?урона\s+холод/i) || [])[1]) || 0) * (mult || 1));
            const pbZ = window.perkBonuses || {};
            dmg = Math.round(dmg * (1 + (pbZ.fireSpellBonus || 0) / 100)); dmg2 = Math.round(dmg2 * (1 + (pbZ.frostSpellBonus || 0) / 100));
        }
        const radius = parseInt((txt.match(/радиусе?\s*(\d+)/i) || [])[1]) || Z.radius || 5;
        let turns = Z.upkeep ? null : (parseInt((txt.match(/(\d+)\s*ход/i) || [])[1]) || 8);
        const slow = name === 'Вихревой плащ' ? (parseInt((txt.match(/на\s+(\d+)\s+а\s+так/i) || [])[1]) || 15) : (name === 'Дурман' ? (parseInt((txt.match(/медлен\S*\s+на\s+(\d+)/i) || [])[1]) || 0) : 0);
        const flee = Z.flee ? { maxLevel: parseInt((txt.match(/до\s+(\d+)\s+уровн/i) || [])[1]) || 16, fleeTurns: (() => { const all = txt.match(/на\s+(\d+)\s*ход/gi) || []; return all.length ? parseInt(all[all.length - 1].replace(/\D+/g, '')) : 2; })() } : null;
        const upkeep = Z.upkeep ? getSpellUpkeep(name, full, isFree, enhanced, true) : 0;
        const effId = 'zone-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const arrowPct = name === 'Вихревой плащ' ? (parseInt((txt.match(/(\d+)\s*%/) || [])[1]) || 20) : 0;
        const what = Z.flee ? `нежить до ${flee.maxLevel} ур. бежит ${flee.fleeTurns} х.` : Z.slowOnly ? `враги −${slow} фт скорости` : `${dmg}${dmg2 ? ' огнём + ' + dmg2 + ' холодом' : ''} урона${Z.perRound ? ' в ход каждого существа' : ' за ход'}${Z.who === 'undead' ? ' нежити' : Z.who === 'all' ? ' всем внутри' : ' врагам'}${slow ? ', −' + slow + ' фт скорости' : ''}${Z.mpHalf ? ' и ' + Math.round(dmg / 2) + ' по мане' : ''}${Z.resistDown ? ', −' + Z.resistDown + '% сопротивлений каждый ход' : ''}`;
        const where = Z.place === 'follow' ? `вокруг тебя (${radius} фт, ходит с тобой)` : Z.place === 'self' ? `на месте каста (радиус ${radius} фт)` : (Z.kind === 'wall' ? 'там, где мастер проведёт стену (до 30 фт)' : `там, где мастер поставит камень (радиус ${radius} фт)`);
        pushOrRefreshTimedEffect({ id: effId, name, effectName: name, description: `${Z.icon} Зона на боевой сетке: ${what}; ${where}.${upkeep ? ' Поддержание ' + upkeep + ' маны/ход.' : ''}`,
            turnsRemaining: turns === null ? Infinity : turns, manaPerTurn: upkeep, gridZoneId: effId, rangedResist: arrowPct || undefined, perRound: Z.perRound || undefined });
        renderActiveEffects();
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const zone = { id: effId, effId, uid: myUidG(), ownerName: myName, spell: name, kind: Z.kind, place: Z.place, radiusFt: radius, dmg: Z.slowOnly || Z.flee ? 0 : dmg, dmgType: Z.dmgType, who: Z.who, icon: Z.icon, turns: (turns === null || Z.perRound) ? null : turns + 1 };
        if (Z.perRound && turns !== null) { zone.unit = 'round'; zone.rounds = turns; }
        if (dmg2) { zone.dmg2 = dmg2; zone.dmgType2 = Z.dmgType2; }
        if (Z.mpHalf) zone.mpDmg = Math.round(dmg / 2);
        if (slow) zone.slow = slow;
        if (Z.noResist) zone.noResist = true;
        if (Z.resistDown) zone.resistDown = Z.resistDown;
        if (flee) { zone.effect = 'flee'; zone.maxLevel = flee.maxLevel; zone.fleeTurns = flee.fleeTurns; }
        if (Z.kind === 'wall') zone.maxLen = 6;
        window.CloudSync.addPendingZone(zone, myName).catch(e => alert('Зона не передана мастеру: ' + e.message));
        return `${Z.icon} ${what}; ${where}.${turns ? ' ' + turns + ' х.' : ''}${upkeep ? ' Поддержание ' + upkeep + ' маны/ход, пока не снимешь.' : ''}${arrowPct ? ' Игнорируешь ' + arrowPct + '% урона от стрел.' : ''} Бьёт автоматически каждый ход.`;
    }
    // Руны: каст отправляет руну мастеру («Руны к установке» на боевой сетке), он ставит её на клетку.
    const GRID_RUNE_SPELLS = { 'Огненная руна': 1, 'Морозная руна': 1, 'Грозовая руна': 1, 'Ядовитая руна': 1, 'Руна солнца': 1, 'Руна гейзера': 1 };
    function castGridRune(name, desc, enhanced) {
        const d = String(desc || '');
        const m = d.match(/нанося\s+(\d+)/i) || d.match(/наносит\s+(\d+)/i) || d.match(/на\s+(\d+)\s+урона/i) || d.match(/(\d+)\s+(?:единиц|ед\.)\s+\S*\s*урона/i);
        const dmg = m ? parseInt(m[1]) : 0;
        const fm = d.match(/нанесения\s+руны\s+до\s+(\d+)/i);
        let maxFt = fm ? parseInt(fm[1]) : 25;
        if ((window.perkBonuses || {}).runeMaster) maxFt *= 2; // «Мастер рун»
        maxFt += getGearSpecialBonuses().castRangeFt || 0; // Азидалов шлем: «дальность колдовства и рун +N футов»
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const inS = window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && window.CloudSync.addPendingRune;
        if (!inS) { alert('✴ «' + name + '» наложена' + (dmg ? ' (урон ' + dmg + ')' : '') + '. Вне сессии мастер отмечает её вручную.'); return; }
        window.CloudSync.addPendingRune({ id: 'pr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), uid: myUidG(), ownerName: myName, spell: name, dmg, maxFt, enhanced: !!enhanced }, myName)
            .then(() => alert('✴ «' + name + '»' + (enhanced ? ' (усиленная)' : '') + (dmg ? ', урон ' + dmg : '') + ': руна готова. Мастер поставит её на боевую сетку — не дальше ' + maxFt + ' фт от тебя. Сработает, когда враг подойдёт вплотную, и ударит всех в 5 фт.'))
            .catch(e => alert('Руна не передана мастеру: ' + e.message));
    }
    // Защиты, которые мастер учитывает в атаке врага, — и для урона руны, площадного заклинания и ловушки:
    // оберег (только против заклинаний), барьер Перчаток Хранителя, лошадь под всадником (70% урона ей).
    function playerSoakIncoming(dmg, isSpell) {
        const notes = [];
        if (dmg > 0 && isSpell) {
            const w = (activeTimedEffects || []).find(x => x && x.ward && (x.ward.left || 0) > 0 && x.turnsRemaining !== 0);
            if (w) {
                const ab = Math.min(dmg, parseInt(w.ward.left) || 0);
                dmg -= ab; w.ward.left = Math.max(0, (w.ward.left || 0) - ab);
                let gain = 0;
                if ((document.getElementById('perk-11-7-1') || {}).checked) { // «Оберег-поглотитель»: половина поглощённого — в ману
                    gain = Math.floor(ab / 2);
                    const mpEl = document.getElementById('cur-mp'), mx = parseInt((document.getElementById('max-mp') || {}).value) || Infinity;
                    if (mpEl && gain) mpEl.value = Math.min(mx, (parseInt(mpEl.value) || 0) + gain);
                }
                notes.push(`🔰 оберег «${w.name}» поглотил ${ab}${gain ? `, +${gain} маны` : ''}${w.ward.left > 0 ? '' : ' и рассеялся'}`);
                if (w.ward.left <= 0) activeTimedEffects = activeTimedEffects.filter(x => x !== w);
                renderActiveEffects();
            }
        }
        if (dmg > 0 && keeperBarrierActive()) {
            const ab = Math.min(dmg, keeperBarrierLeft);
            dmg -= ab; keeperBarrierLeft -= ab;
            notes.push(`🛡 барьер Перчаток Хранителя поглотил ${ab}`);
        }
        const horse = dmg > 0 ? ridingHorse() : null;
        if (horse) {
            const share = (window.PET_RIDING && window.PET_RIDING.horseShare) || 0.7;
            const toHorse = Math.min(Math.round(dmg * share), parseInt(horse.hp) || 0);
            dmg -= toHorse;
            const m = applyPetHpDelta(horse.id, -toHorse);
            notes.push(`🐎 лошадь «${horse.name}» приняла ${toHorse}${m ? ' — ' + m : ''}`);
            if (window.renderPetsPanel) window.renderPetsPanel();
        }
        return { dmg, notes };
    }

    // Удар руны или чужого площадного заклинания: по мне (с моими сопротивлениями) или по моему существу.
    function gridAoeHit(e) {
        const who = e.from ? '«' + e.from + '»' : 'Взрыв';
        if (e.summonId) {
            const sm = activeSummons.find(x => x.id === e.summonId);
            if (!sm) { // на сетке животные игрока стоят рядом с призванными — удар по ним идёт тем же путём
                const pet = playerPets.find(x => x.id === e.summonId && !x.dead);
                if (pet && !e.knock && e.dmg) { const m = applyPetHpDelta(pet.id, -(parseInt(e.dmg) || 0)); alertSafe('💥 ' + who + ': ' + m + '.'); updateAll(); saveLocalStorage(true); if (window.renderPetsPanel) window.renderPetsPanel(); }
                return;
            }
            if (e.knock) { alchToast('💦 ' + who + ' подбрасывает «' + escHtml(sm.name) + '».'); return; }
            // e.final — урон уже посчитан мастером с защитой существа (атака врага); иначе (руна, площадь) — резист тут
            const resS = e.final ? 0 : ((summonDefense().res || {})[e.dmgType || 'physical'] || 0);
            const dmgS = Math.max(0, Math.round((parseInt(e.dmg) || 0) * (1 - resS / 100)));
            sm.curHp = Math.max(0, (sm.curHp || 0) - dmgS);
            alchToast('💥 ' + who + ': «' + escHtml(sm.name) + '» −' + dmgS + (resS ? ' (защита ' + resS + '%)' : ''));
            if (sm.curHp <= 0) { alertSafe('💀 «' + sm.name + '» погибает (' + who + ').'); window.dismissSummon(sm.id); }
            else { renderActiveSummonsList(); saveLocalStorage(true); }
            return;
        }
        if (e.knock) {
            pushOrRefreshTimedEffect({ id: 'eff-knock', name: e.from || 'Руна', effectName: 'Подброшен', description: 'Подброшен потоком воды: −2 к кубам', turnsRemaining: 1, rollPenalty: -2 });
            alertSafe('💦 ' + who + ' подбрасывает тебя: −2 к кубам на ход.');
            return;
        }
        // Сопротивление — так же, как у атак врагов и ловушек: + сопр. магии к стихиям, потолок 85%, уязвимости не обрезаются.
        let res = 0; try { res = window.StCombat.playerIncomingResist(computeTotalResistances(), e.dmgType || 'physical'); } catch (x) { }
        let dmg = Math.max(0, Math.round((e.dmg || 0) * (1 - res / 100)));
        const lordAdd = dmg > 0 ? lordFireExtra(e.dmgType) : null; // знак «Лорд»: урон огнём +2d6
        if (lordAdd) dmg += lordAdd.sum;
        const soak = playerSoakIncoming(dmg, true); // руны и площадные заклинания — магия: оберег тоже держит
        dmg = soak.dmg;
        const hpEl = document.getElementById('cur-hp');
        hpEl.value = Math.max(0, (parseInt(hpEl.value) || 0) - dmg);
        alertSafe('💥 ' + who + ' задевает тебя: −' + dmg + ' ХП' + (res ? ' (' + (res > 0 ? 'сопротивление ' : 'уязвимость ') + Math.abs(res) + '%, было бы ' + e.dmg + ')' : '') + (lordAdd ? ' (знак Лорда: огонь +' + lordAdd.txt + ')' : '') + (soak.notes.length ? ' (' + soak.notes.join('; ') + ')' : '') + '.');
        if (dmg > 0) { armorHitProgress(e.dmgType || 'physical'); if (typeof window.concentrationCheck === 'function') try { window.concentrationCheck(dmg); } catch (x) { } }
        updateAll(); saveLocalStorage(true);
        try { if (typeof checkDeath === 'function') checkDeath(); } catch (x) { }
    }

    // ---- Прокачка брони как в Скайриме: навык растёт от физических попаданий по персонажу ----
    // Опыт за удар фиксированный (не зависит от урона и числа надетых частей). Смешанный комплект — качаются оба навыка.
    const ARMOR_HIT_PROGRESS = 0.5; // доля «успеха» навыка за одно попадание (оружейный удар игрока = 1 успех)
    const ARMOR_SLOTS_FOR_SKILL = ['helmet', 'chest', 'gloves', 'boots', 'shield'];
    function armorPieceClass(item) {
        if (!item) return null;
        // Одежда (капюшоны, сапоги и перчатки мага, колпак повара): класс брони не задаёт и навык брони не качает.
        // Смотрим и в базу — у вещей, купленных до правки, в инвентаре поля armorType нет.
        const base = (window.allItems || []).find(x => x.name === item.name) || {};
        if (/^(cloth|одежда)$/i.test(String(item.armorType || base.armorType || ''))) return 'cloth';
        const t = String(item.armorType || '') + ' ' + String(item.category || '');
        if (/heavy|тяж[её]л/i.test(t)) return 'heavy';
        if (/light|л[её]гк/i.test(t)) return 'light';
        const r = (window.armorRecipes || []).find(x => x.name === item.name);
        if (r && r.armorType) return /тяж/i.test(r.armorType) ? 'heavy' : 'light';
        // Уникальная броня/маски/броня гильдий: класса в базе нет — по материалу (как в Скайриме).
        const proto = item.material ? item : ((window.allItems || []).find(x => x.name === item.name) || {});
        const m = String(proto.material || '') + ' ' + String(item.name || '');
        if (/сталгрим|эбонит|даэдр|двемер|орочь|нордск|сталь|желез|драконья кость|костяная/i.test(m) && !/чешу|кож|стекл|эльф|хитин/i.test(m)) return 'heavy';
        if (/кож|чешу|стекл|эльф|хитин|мех|сыромят/i.test(m)) return 'light';
        return null;
    }
    // «Комплект доспехов» (штраф к магии и скорости) теперь выставляется по надетой броне, а не руками:
    // раньше можно было надеть полную тяжёлую броню, оставить «Одежда» и колдовать без штрафа.
    // Есть хоть одна тяжёлая вещь — «Тяжелая»; иначе есть лёгкая — «Легкая»; брони нет — «Одежда».
    // Вещь неизвестного класса — список остаётся доступным (выбрать «Легкая»/«Тяжелая» вручную, но не «Одежда»).
    function syncArmorClassSelect() {
        const sel = document.getElementById('eq-armor'); if (!sel) return;
        const inv = new Map(playerInventory.map(i => [i.itemId, i]));
        let anyPiece = false, unknown = false; const set = new Set();
        ['helmet', 'chest', 'gloves', 'boots'].forEach(sl => {
            const it = equippedSlots[sl] ? inv.get(equippedSlots[sl]) : null;
            if (!it) return;
            const c = armorPieceClass(it);
            if (c === 'cloth') return;
            anyPiece = true;
            if (c) set.add(c); else unknown = true;
        });
        let auto = null;
        if (set.has('heavy')) auto = 'heavy';
        else if (!anyPiece) auto = 'cloth';
        else if (set.has('light') && !unknown) auto = 'light';
        if (auto) { sel.value = auto; sel.disabled = true; sel.title = 'Выставляется по надетой броне'; }
        else { sel.disabled = false; sel.title = 'Класс части брони неизвестен — выбери сам'; if (sel.value === 'cloth') sel.value = 'light'; }
    }
    function wornArmorClasses() {
        const set = new Set(); let anyPiece = false;
        const inv = new Map(playerInventory.map(i => [i.itemId, i]));
        ARMOR_SLOTS_FOR_SKILL.forEach(sl => {
            const it = equippedSlots[sl] ? inv.get(equippedSlots[sl]) : null;
            if (!it) return;
            if (!(parseInt(it.armorValue) > 0 || sl !== 'shield')) return;
            const c = armorPieceClass(it);
            if (c === 'cloth') return;
            anyPiece = true;
            if (c) set.add(c);
        });
        if (anyPiece && !set.size) { const g = (document.getElementById('eq-armor') || {}).value; if (g === 'heavy' || g === 'light') set.add(g); }
        return [...set];
    }
    function armorHitProgress(dmgType) {
        if (dmgType && dmgType !== 'physical') return; // магия броню не качает
        const cls = wornArmorClasses(); if (!cls.length) return;
        cls.forEach(c => logSkillSuccessByName(c === 'heavy' ? 'Тяжелая броня' : 'Легкая броня', ARMOR_HIT_PROGRESS));
    }
    window.armorHitProgress = armorHitProgress; window.wornArmorClasses = wornArmorClasses;

    var aoeHitsSeen = [];
    window.applyIncomingStatusEffects = function (effects) {
        let names = [], removedNames = [], ignoredNames = [];
        effects.forEach(e => {
            if (e.cmd === 'call') { // эпик 5.6: мастер зовёт в игру. Старше 10 минут — игрок был офлайн, сигнал уже не актуален.
                if (!e.ts || Date.now() - e.ts < 600000) {
                    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (er) { }
                    if (typeof window.stNotify === 'function') window.stNotify('Мастер зовёт в игру', 'Мастер начал сессию!');
                    setTimeout(() => alert('📣 Мастер начал сессию!'), 50);
                }
                return;
            }
            if (e.cmd === 'craftOrder') { handleCraftOrderCmd(e); return; }
            if (e.cmd === 'dungeonLoot') { handleDungeonLootCmd(e); return; } // ТЗ-2 2.4: мастер отдал контейнер данжа
            if (e.cmd === 'death') { handleGmDeathCmd(e); return; } // команды мастера: потеря вещей / воскрешение / жизни
            // мастер нанёс урон — проверка концентрации. Команда старше 2 минут (игрок был офлайн) уже не актуальна — не бросаем «задним числом».
            if (e.cmd === 'aoeHit') { // руна/площадное заклинание или атака врага задели меня или моё существо
                // очередь читается на каждом снимке сессии, пока не очищена, — один удар применяем один раз
                if (e.id) { if (aoeHitsSeen.indexOf(e.id) !== -1) return; aoeHitsSeen.push(e.id); if (aoeHitsSeen.length > 200) aoeHitsSeen.shift(); }
                gridAoeHit(e); return;
            }
            if (e.cmd === 'damaged') {
                if (!e.ts || Date.now() - e.ts < 120000) window.concentrationCheck(e.dmg);
                armorHitProgress(e.dmgType); // опыт брони засчитываем и задним числом — попадание было
                return;
            }
            if (e.undeadOnly && !(playerSupernaturalState && playerSupernaturalState.vampirism)) { // «не действует на живых существ»
                ignoredNames.push(e.effectName);
                return;
            }
            if (e.remove) { // союзник-заклинатель перестал поддерживать свой баф
                const before = activeTimedEffects.length;
                activeTimedEffects = activeTimedEffects.filter(x => !(e.sustainKey && x.sustainKey === e.sustainKey));
                if (activeTimedEffects.length !== before) removedNames.push(e.effectName);
                return;
            }
            if (e.instant) {
                // Мгновенное лечение от союзника — сразу правим текущее хп/мп, не кладём как баф.
                if (e.hp) {
                    const cur = parseInt(document.getElementById('cur-hp').value) || 0;
                    const max = parseInt(document.getElementById('max-hp').value) || 0;
                    document.getElementById('cur-hp').value = Math.max(cur, Math.min(max, cur + e.hp));
                }
                if (e.mp) {
                    const cur = parseInt(document.getElementById('cur-mp').value) || 0;
                    const max = parseInt(document.getElementById('max-mp').value) || 0;
                    document.getElementById('cur-mp').value = Math.max(cur, Math.min(max, cur + e.mp));
                }
                names.push(e.effectName + ' (мгновенно)');
                return;
            }
            // Спасбросок цели (паралич — Телосложение, страх — Мудрость): бросается на листе игрока с его настоящей характеристикой.
            if (e.save && e.save.dc) {
                const SAVE_STAT = { con: ['stat-con', 'Телосложения'], wis: ['stat-wis', 'Мудрости'], dex: ['stat-dex', 'Ловкости'], str: ['stat-str', 'Силы'] };
                const ss = SAVE_STAT[e.save.stat] || SAVE_STAT.con;
                const modS = calcAbilityMod(parseInt((document.getElementById(ss[0]) || {}).value) || 10);
                const rS = 1 + Math.floor(Math.random() * 20), okS = rS + modS >= e.save.dc;
                const txtS = `спасбросок ${ss[1]} ${rS}${modS >= 0 ? '+' : ''}${modS}=${rS + modS} против СЛ ${e.save.dc}`;
                const whoS = (document.getElementById('char-name') || {}).value || 'Игрок';
                if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🛡 ${whoS}: «${e.effectName}» — ${txtS} — ${okS ? 'устоял(а)' : 'не устоял(а)'}.`, whoS);
                if (okS) { names.push(`${e.effectName} — ${txtS}, устоял(а)`); return; }
            }
            if (e.clearPositive) {
                const n = clearPositiveTimedEffects();
                // Барьер падает вместе с остальными положительными эффектами.
                names.push(`снято положительных эффектов: ${n}`);
            }
            const incoming = {
                id: 'eff-' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: e.name || 'Противник', effectName: e.effectName, description: e.description || '',
                // болезнь длится до лечения; Infinity при пересылке через базу может превратиться в null — поэтому по имени/флагу
                turnsRemaining: (e.permanent || /^Болезнь:/.test(e.effectName || '') || e.turnsRemaining === Infinity) ? Infinity : (e.turnsRemaining || 1), hp: e.hp || 0, mp: e.mp || 0, armor: e.armor || 0, speed: e.speed || 0, value: e.value || 0,
                percentEffects: e.percentEffects || []
            };
            if (e.rollPenalty) incoming.rollPenalty = e.rollPenalty;
            if (e.weight) incoming.weight = e.weight;
            if (e.unarmedDmg) incoming.unarmedDmg = e.unarmedDmg;
            if (e.fearImmune) incoming.fearImmune = true;
            if (e.tempHp) incoming.tempHp = e.tempHp;
            const hadTempSame = !!e.tempHp && activeTimedEffects.some(x => x.effectName === e.effectName && x.tempHp && (x.turnsRemaining > 0 || x.turnsRemaining === Infinity));
            if (e.fromGm) incoming.fromGm = true;
            if (e.barrier) incoming.barrier = e.barrier;
            if (e.ward && e.ward.absorb) incoming.ward = { absorb: e.ward.absorb, left: e.ward.left || e.ward.absorb }; // оберег от союзника тоже поглощает магию
            if (e.sustainKey) incoming.sustainKey = e.sustainKey;
            pushOrRefreshTimedEffect(incoming);
            if (e.tempHp && !hadTempSame) { const hpElI = document.getElementById('cur-hp'); hpElI.value = (parseInt(hpElI.value) || 0) + e.tempHp; } // временные ХП от Мужества/Ободрения
            names.push(e.effectName);
        });
        renderActiveEffects();
        updateAll();
        saveLocalStorage();
        // Одно окно на снимок вместо двух-трёх подряд: собираем все сообщения и показываем вместе.
        const _msgs = [];
        if (ignoredNames.length) _msgs.push(`«${ignoredNames.join(', ')}» от союзника на тебя не действует: аура работает только на нежить.`);
        if (removedNames.length) _msgs.push(`Заклинатель перестал поддерживать: ${removedNames.join(', ')} — эффект спал.`);
        if (names.length) _msgs.push(`⚠ На тебя наложено: ${names.join(', ')}!`);
        if (_msgs.length) alert(_msgs.join('\n\n'));
    };

    function getActiveEffectBonuses() {
        let hp = 0, mp = 0, armor = 0, speed = 0, weight = 0;
        activeTimedEffects.forEach(e => { hp += e.hp || 0; mp += e.mp || 0; armor += e.armor || 0; speed += e.speed || 0; weight += e.weight || 0; });
        return { hp, mp, armor, speed, weight };
    }

    function tickActiveEffects() {
        dropOrphanedSpirits();   // до списания маны: развеянный дух больше не тянет ману
        // Заклинания "на поддержании" тратят ману каждый ход (не только тикают время) — если маны
        // не хватает, бафф спадает сам, как и было бы в бою при истощении.
        const mpEl = document.getElementById('cur-mp');
        let curMp = mpEl ? (parseInt(mpEl.value) || 0) : 0;
        let manaRanOut = [];
        activeTimedEffects.forEach(e => {
            if (e.manaPerTurn) {
                if (curMp >= e.manaPerTurn) {
                    curMp -= e.manaPerTurn;
                } else {
                    curMp = 0;
                    manaRanOut.push(e.name);
                    e.turnsRemaining = 0; // спадёт ниже вместе с обычным тиканьем
                    releaseSustainedAlly(e);
                }
            }
        });
        const hasMaintained = activeTimedEffects.some(e => e.manaPerTurn);
        if (mpEl && hasMaintained) mpEl.value = curMp;
        if (manaRanOut.length) alert(`Мана кончилась — спадает: ${manaRanOut.join(', ')}.`);

        // Регенерация / затяжной урон от зелий и ядов — каждый ход, пока эффект активен (до уменьшения длительности).
        let dHp = 0, dMp = 0;
        activeTimedEffects.forEach(e => {
            if (!(e.turnsRemaining > 0 || e.turnsRemaining === Infinity)) return;
            dHp += (e.regenHp || 0) - (e.dotHp ? (e.isPoisonEffect ? Math.round(e.dotHp * (1 - selfPoisonResist() / 100)) : e.dotHp) : 0); // яд по ходам — с сопротивлением ядам
            dMp += (e.regenMp || 0) - (e.dotMp || 0);
        });
        if (lichStage() >= 1 && lichAlive() && !inCombatNow()) dHp += 5; // лич: регенерация 5 ХП вне боя (в бою её нет)
        if (dHp || dMp) {
            const hpEl = document.getElementById('cur-hp'), mpEl2 = document.getElementById('cur-mp');
            const maxHp = parseInt(document.getElementById('max-hp').value) || 0;
            const maxMp = parseInt(document.getElementById('max-mp').value) || 0;
            const curHp = parseInt(hpEl.value) || 0, curMp2 = parseInt(mpEl2.value) || 0;
            const newHp = dHp > 0 ? Math.max(curHp, Math.min(maxHp, curHp + dHp)) : Math.max(0, curHp + dHp);
            const newMp = dMp > 0 ? Math.max(curMp2, Math.min(maxMp, curMp2 + dMp)) : Math.max(0, curMp2 + dMp);
            hpEl.value = newHp; mpEl2.value = newMp;
            const parts = [];
            if (newHp !== curHp) parts.push(`${newHp - curHp > 0 ? '+' : ''}${newHp - curHp} хп`);
            if (newMp !== curMp2) parts.push(`${newMp - curMp2 > 0 ? '+' : ''}${newMp - curMp2} маны`);
            if (parts.length) alchToast('⏳ Эффекты зелий за круг: ' + parts.join(', '));
            if (typeof updateVitalBars === 'function') updateVitalBars();
        }

        activeTimedEffects.forEach(e => { if (e.turnsRemaining !== Infinity && (!e.perRound || _tickIsRound)) e.turnsRemaining -= 1; }); // perRound — длительность в кругах: списывается только на смене круга
        activeTimedEffects = activeTimedEffects.filter(e => e.turnsRemaining > 0 || e.turnsRemaining === Infinity);
        clampTempHp(); // эффект с временными ХП мог закончиться — лишнее сгорает
        renderActiveEffects();
        renderPowersPanel();
        if (typeof tickActiveSummons === 'function') tickActiveSummons();
        try { snNightCloakTick(); } catch (e) { console.error(e); }
        updateAll();
        // Общий счётчик ходов сессии (окно «труп можно поднять первые 5 ходов») двигает ТОЛЬКО мастер (кнопка «Следующий ход» у него).
        // Раньше его увеличивал каждый игрок на свою кнопку: при 4 игроках и мастере это +5 за круг, и окно в 5 ходов сжималось до ~1 круга.
    }

    function updateTurnRoundDisplay() {
        const text = `Ход: ${gameTurn} | Круг: ${gameRound}`;
        const el = document.getElementById('turn-round-display');
        if (el) el.textContent = text;
        const elMain = document.getElementById('turn-round-display-main');
        if (elMain) elMain.textContent = text;
    }

    // Шеогорат: раз в ход — случайный множитель урона, случайный сдвиг защиты, случайный бафф.
    // Не активируется сам по себе — только когда Шеогорат выбран покровителем.
    let sheogorathRoll = { dmgMult: 1, defSwing: 0 };
    // Шеогорат по рангам (магия.xlsx, «Аэдра и Даэдра»): урон атак 1d100 / 2d100 / 3d100 %, снижение получаемого урона
    // 3d10 / 5d10 / 1d100 %, в бою раз в ход (ранг 1) или раз в 2 хода (ранги 2–3) — случайно одно из четырёх.
    const SHEOGORATH_RANKS = {
        1: { dmgDice: 1, defDice: [3, 10], every: 1, hp: 40, mp: 40, armor: 30, loss: 40 },
        2: { dmgDice: 2, defDice: [5, 10], every: 2, hp: 40, mp: 70, armor: 50, loss: 50 },
        3: { dmgDice: 3, defDice: [1, 100], every: 2, hp: 70, mp: 100, armor: 100, loss: 20 }
    };
    let sheogorathTurnCount = 0;

    function rollSheogorathChaos() {
        const god = document.getElementById('faith-god').value;
        if (god !== 'sheogorath') { sheogorathRoll = { dmgMult: 1, defSwing: 0 }; return; }
        const rank = Math.min(3, Math.max(1, parseInt((document.getElementById('faith-rank') || {}).value) || 1));
        const R = SHEOGORATH_RANKS[rank];
        const dmgPct = rollNd(R.dmgDice, 100).sum;
        const defSwing = rollNd(R.defDice[0], R.defDice[1]).sum;
        const dmgMult = Math.round(dmgPct) / 100;
        sheogorathRoll = { dmgMult, defSwing };
        let buffTxt = '';
        sheogorathTurnCount++;
        if ((typeof inCombatNow !== 'function' || inCombatNow()) && sheogorathTurnCount % R.every === 0) {
            const pick = Math.floor(Math.random() * 4);
            if (pick === 3) { // потеря ХП и маны
                const hpEl = document.getElementById('cur-hp'), mpEl = document.getElementById('cur-mp');
                hpEl.value = Math.max(0, (parseInt(hpEl.value) || 0) - R.loss);
                mpEl.value = Math.max(0, (parseInt(mpEl.value) || 0) - R.loss);
                buffTxt = `−${R.loss} ХП и −${R.loss} маны`;
                activeTimedEffects = activeTimedEffects.filter(x => x.id !== 'eff-sheogorath');
                updateVitalBars();
            } else {
                const b = pick === 0 ? { name: 'Хаос: прилив сил', hp: R.hp } : pick === 1 ? { name: 'Хаос: прилив магии', mp: R.mp } : { name: 'Хаос: каменная кожа', armor: R.armor };
                buffTxt = b.name + (b.hp ? ` (+${b.hp} ХП)` : b.mp ? ` (+${b.mp} маны)` : ` (+${b.armor} брони)`);
                pushOrRefreshTimedEffect({
                    id: 'eff-sheogorath', name: b.name, effectName: b.name,
                    description: `${buffTxt} (Шеогорат, до следующего броска)`,
                    // +1: nextTurn/nextRound сразу после броска вызывают tickActiveEffects
                    turnsRemaining: R.every + 1,
                    hp: b.hp || 0, mp: b.mp || 0, armor: b.armor || 0, speed: 0, percentEffects: []
                });
            }
            renderActiveEffects();
        }
        alert(`🎭 Шеогорат бросает кости: урон атак ${dmgPct}%, получаемый урон −${defSwing}%${buffTxt ? `, ${buffTxt}` : ''}.`);
    }

    // Обнуление личного счётчика хода/круга — чтобы не копился бесконечно за долгую игру.
    // НЕ трогает общий sessionTurnCounter в сессии (тот отдельно — окно "поднять труп 5 ходов" и
    // т.п. завязаны на него, обнулять его отсюда было бы неправильно без согласия мастера).
    window.resetTurnsRounds = function () {
        if (!confirm('Обнулить твой счётчик хода/круга до 0?')) return;
        gameTurn = 0;
        gameRound = 0;
        updateTurnRoundDisplay();
        saveLocalStorage();
    };

    // ---- Ход/круг. Вне сессии — личный счётчик, как раньше. В сессии — общий: кто бы ни нажал (игрок или мастер),
    // ход переключается у всех, и у каждого игрока его эффекты прокручиваются сами (syncSessionTurns ниже).
    var _tickIsRound = true; // идёт тик «круга» (а не «хода»): эффекты perRound списывают круг только тогда
    function localTurnTick(isRound) { _tickIsRound = isRound !== false; rollSheogorathChaos(); tickActiveEffects(); _tickIsRound = true; }
    function inSyncedSession() { return !!(window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && window.CloudSync.advanceSessionTurn); }
    function advanceShared(kind) {
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        window.CloudSync.advanceSessionTurn(kind, nm).then(r => {
            if (r && r.skipped) alchToast((kind === 'round' ? 'Круг' : 'Ход') + ' только что переключил(а) ' + (r.by || 'кто-то') + ' — повторно не листаю.');
        }).catch(e => alert('Не удалось переключить: ' + e.message));
    }
    window.nextTurn = function () {
        if (inSyncedSession()) { advanceShared('turn'); return; }
        gameTurn++;
        localTurnTick(false);
        updateTurnRoundDisplay();
        saveLocalStorage();
    };

    window.nextRound = function () {
        if (inSyncedSession()) { advanceShared('round'); return; }
        gameRound++;
        localTurnTick(true);
        updateTurnRoundDisplay();
        saveLocalStorage();
    };
    // Вызывается из CloudSync на каждом снимке сессии (после загрузки персонажа).
    window.syncSessionTurns = function (data, code) {
        if (!data || !code) return;
        const tick = parseInt(data.sessionTickCounter) || 0;
        const turn = parseInt(data.sessionTurnCounter) || 0, round = parseInt(data.sessionRoundCounter) || 0;
        let changed = false;
        if (sessionTurnSync.code !== code || tick < sessionTurnSync.tick) {
            // новая сессия (или мастер начал заново) — подхватываем счётчик без прокрутки эффектов задним числом
            sessionTurnSync = { code, tick }; changed = true;
        } else if (tick > sessionTurnSync.tick) {
            const n = Math.min(10, tick - sessionTurnSync.tick); // долго не было на связи — не крутим больше 10 ходов разом
            sessionTurnSync.tick = tick;
            const rd = Math.max(0, round - gameRound); // сколько из этих тиков — смена круга (счётчик кругов ещё не обновлён)
            for (let i = 0; i < n; i++) localTurnTick(i >= n - rd);
            changed = true;
        }
        if (gameTurn !== turn || gameRound !== round) { gameTurn = turn; gameRound = round; changed = true; }
        if (changed) { updateTurnRoundDisplay(); if (typeof updateCombatDock === 'function') updateCombatDock(); saveLocalStorage(); }
    };

    const ENCHANT_AUTO_APPLY_ARMOR = {
        'Повышение здоровья': 'hp', 'Повышение магии': 'mp', 'Повышение переносимого веса': 'weight',
        // «Повышение навыка: Тяжёлая/Лёгкая броня» больше НЕ плоская броня: тяжёлая — N% к броне тяжёлых доспехов,
        // лёгкая — (N/2)% уклонения и +N/2 к скорости (считается в updateAll и на стороне мастера, см. getSkillBoostPercent).
        'Сопротивление огню': 'resistFire', 'Сопротивление холоду': 'resistFrost', 'Сопротивление электричеству': 'resistShock',
        'Сопротивление ядам': 'resistPoison', 'Сопротивление яду': 'resistPoison', 'Сопротивление болезням': 'resistDisease', 'Сопротивление магии': 'resistMagic',
        'Сопротивление крикам': 'resistShout'
    };
    const ENCHANT_AUTO_APPLY_WEAPON = { 'Урон огнем': true, 'Урон холодом': true, 'Урон электричеством': true };

    // Разбирает простой текстовый эффект вида "+50 маны" / "+30 хп" / "+20 веса" (уникальные
    // предметы, зелья) ИЛИ "Запас магии увеличен на 25" / "здоровье повышено на 30" (заклинания
    // и часть уникальных предметов пишут именно так, без знака "+").
    function parsePlainEffectBonus(text) {
        if (!text) return null;
        let m = text.match(/\+\s*(\d+)\s*(хп|здоровь[а-яё]*|мана[а-яё]*|маны|магии|маги[а-яё]*|вес[а-яё]*|скорост[а-яё]*|брон[а-яё]*|класс[а-яё]*\s+брони)/i);
        if (m) {
            const value = parseInt(m[1]);
            const word = m[2].toLowerCase();
            if (word.startsWith('хп') || word.startsWith('здоровь')) return { key: 'hp', value };
            if (word.startsWith('ман') || word.startsWith('маги')) return { key: 'mp', value };
            if (word.startsWith('вес')) return { key: 'weight', value };
            if (word.startsWith('скорост')) return { key: 'speed', value };
            if (word.startsWith('брон') || word.startsWith('класс')) return { key: 'armor', value };
            return null;
        }
        // «Увеличивает броню на 50», «оберег, увеличивающий класс брони на 40»
        m = text.match(/(?:увеличива[а-яё]*|повыша[а-яё]*)\s+(?:класс[а-яё]*\s+)?брон[а-яё]*(?:\s+мага)?\s+на\s+(\d+)/i);
        if (m) return { key: 'armor', value: parseInt(m[1]) };
        m = text.match(/(хп|здоровь[а-яё]*|мана[а-яё]*|магии|маги[а-яё]*|вес[а-яё]*|брон[а-яё]*)[а-яё\s]{0,15}?(?:увеличен[а-яё]*|повышен[а-яё]*|возраста[а-яё]*)\s+на\s+(\d+)/i);
        if (m) {
            const value = parseInt(m[2]);
            const word = m[1].toLowerCase();
            if (word.startsWith('хп') || word.startsWith('здоровь')) return { key: 'hp', value };
            if (word.startsWith('ман') || word.startsWith('маги')) return { key: 'mp', value };
            if (word.startsWith('вес')) return { key: 'weight', value };
            if (word.startsWith('брон')) return { key: 'armor', value };
        }
        return null;
    }

    // Разовое (не длящееся) лечение — "восстанавливает N единиц здоровья/маны" без слова
    // "увеличен"/"+" рядом означает мгновенный хил, а не постоянный бафф к максимуму.
    // Именно так написано большинство заклинаний лечения/восстановления маны в базе.
    function parseInstantHealBonus(text) {
        if (!text) return null;
        let m = text.match(/восстанавливает\s+(\d+)\s*(?:ед\.?|единиц[а-яё]*)?\s*здоровь[а-яё]*/i);
        if (m) return { key: 'hp', value: parseInt(m[1]) };
        m = text.match(/восстанавливает\s+(\d+)\s*(?:ед\.?|единиц[а-яё]*)?\s*(?:маг[а-яё]*|мп)/i);
        if (m) return { key: 'mp', value: parseInt(m[1]) };
        return null;
    }

    // Разбирает процентные/скоростные баффы заклинаний ("Аура" и им подобные): сила заклинаний,
    // стоимость каста, сопротивления стихиям/ядам-болезням-крикам, скорость. Возвращает МАССИВ
    // (одно заклинание может нести сразу несколько эффектов, как "Аура - Скорость").
    function parsePercentEffects(text) {
        if (!text) return [];
        const found = [];
        let m = text.match(/(?:базовую\s+)?сил[ау]\s+заклинани[йя][^.]*?на\s+(\d+)\s*%/i);
        if (m) found.push({ type: 'spellPower', value: parseInt(m[1]) });
        m = text.match(/сто[ий]мость\s+заклинани[йя][^.]*?на\s+(\d+)\s*%/i);
        if (m) found.push({ type: 'spellCostReduction', value: parseInt(m[1]) });
        m = text.match(/сопротивлени[ея]\s+урон[а-яё]*\s+и\s+стихи[ям]+\s+на\s+(\d+)\s*%/i);
        if (m) { found.push({ type: 'resistPhysical', value: parseInt(m[1]) }); found.push({ type: 'resistElemental', value: parseInt(m[1]) }); }
        else {
            m = text.match(/сопротивлени[ея]\s+стихи[ям][^.]*?на\s+(\d+)\s*%/i);
            if (m) found.push({ type: 'resistElemental', value: parseInt(m[1]) });
        }
        m = text.match(/сопротивлени[ея]\s+яд[а-яёА-ЯЁ]*[,\s]+болезн[а-яёА-ЯЁ]*[,\s]+крик[а-яёА-ЯЁ]*[^.]*?на\s+(\d+)\s*%/i);
        if (m) found.push({ type: 'resistPoisonDiseaseShout', value: parseInt(m[1]) });
        m = text.match(/скорост[ьи][^.]*?на\s+(\d+)\s*фут/i);
        if (m) found.push({ type: 'speed', value: parseInt(m[1]) });
        // "Повышает базовый урон оружия на N%" / "Увеличивает физ урон на N%" — раньше нигде не
        // разбиралось и не применялось.
        m = text.match(/(?:повышает|повышаете|увеличивает)\s+(?:базовый\s+)?урон[а-яёА-ЯЁ]*\s+оружия[^.]*?на\s+(\d+)\s*%/i) ||
            text.match(/(?:повышает|повышаете|увеличивает)\s+(?:базовый\s+)?физ[а-яёА-ЯЁ]*\s+урон[а-яёА-ЯЁ]*[^.]*?на\s+(\d+)\s*%/i);
        if (m) found.push({ type: 'weaponDamagePercent', value: parseInt(m[1]) });
        // "Аура - Сила": "повышает пробивание брони на N" (плоское число, не %).
        m = text.match(/пробивани[ея]\s+брон[а-яёА-ЯЁ]*\s+на\s+(\d+)/i);
        if (m) found.push({ type: 'armorPenetrationFlat', value: parseInt(m[1]) });
        return found;
    }

    // Суммирует процентные/скоростные бонусы от всех активных эффектов игрока.
    function getActivePercentBonuses() {
        const totals = { spellPower: 0, spellCostReduction: 0, resistPhysical: 0, resistElemental: 0, resistPoisonDiseaseShout: 0, speed: 0, weaponDamagePercent: 0, armorPenetrationFlat: 0 };
        (activeTimedEffects || []).forEach(e => {
            (e.percentEffects || []).forEach(p => { if (totals[p.type] !== undefined) totals[p.type] += p.value; });
        });
        if (lichStage() >= 2) { totals.spellPower += 10; totals.spellCostReduction += 10; } // высший лич: заклинания всех школ сильнее и дешевле на 10%
        return totals;
    }

    // Скидка на УСИЛЕННЫЙ каст от надетой экипировки (перчатки магистра): «Усиленные заклинания школы Х на N% дешевле»
    // / «Усиленные заклинания на N% дешевле». Скидка считается от удвоенной цены усиленного каста (×2 → ×2×(1−N%)).
    function getGearEnhancedCostCut(school) {
        let cut = 0;
        const invById = new Map(playerInventory.map(i => [i.itemId, i]));
        ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'neck', 'circlet'].forEach(slotKey => {
            const item = equippedSlots[slotKey] ? invById.get(equippedSlots[slotKey]) : null;
            if (!item) return;
            // зачарованная вещь: встроенное свойство (скидка перчаток магистра) живёт в baseEffect, а effect — описание чар
            const effTxt = (item.enchantment ? gearBaseEffect(item) + '. ' : '') + (item.effect || '');
            if (!effTxt.trim()) return;
            String(effTxt).split(/\.\s*/).forEach(sent => {
                sent = sent.trim();
                let m = sent.match(/^усилен[а-яё]*\s+заклинани[а-яё]*\s+школы\s+([а-яё]+)\s+на\s+(\d+)\s*%\s+дешевле/i);
                if (m) {
                    const w = m[1].toLowerCase();
                    const code = /^разруш/.test(w) ? 'destr' : /^изменен/.test(w) ? 'alter' : /^иллюз/.test(w) ? 'illus' : /^колдов/.test(w) ? 'conj' : /^во[а-яё]*лени/.test(w) ? 'restor' : null;
                    if (code && code === school) cut += parseInt(m[2]);
                    return;
                }
                m = sent.match(/^усилен[а-яё]*\s+заклинани[а-яё]*\s+на\s+(\d+)\s*%\s+дешевле/i);
                if (m) cut += parseInt(m[1]);
            });
        });
        return Math.min(cut, 90);
    }
    // Множитель цены усиленного каста (2 без скидок). school — код школы ('destr'…) или null.
    let lastSpellEnhFactor = 1;
    function getEnhancedCostFactor(school, spellName) {
        const sc = school || (spellName ? findSpellSchoolByName(spellName) : null);
        return 2 * (1 - getGearEnhancedCostCut(sc) / 100);
    }

    // Скидка на каст от надетой экипировки по школам: { destr, alter, illus, conj, restor, all } в процентах.
    function getGearSpellCostCut() {
        const cut = { destr: 0, alter: 0, illus: 0, conj: 0, restor: 0, all: 0 };
        const invById = new Map(playerInventory.map(i => [i.itemId, i]));
        ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'neck', 'circlet'].forEach(slotKey => {
            const item = equippedSlots[slotKey] ? invById.get(equippedSlots[slotKey]) : null;
            if (!item) return;
            gearTexts(item).forEach(effText => {
            // «-15% стоимости Иллюзии» (комплекты Линви и т.п.), «−20% стоимости заклинаний Восстановления»
            (String(effText).match(/[\-−]\s*\d+\s*%\s*стоимости\s+(?:заклинаний\s+)?[а-яё]+/gi) || []).forEach(t => {
                const mm = t.match(/(\d+)\s*%\s*стоимости\s+(?:заклинаний\s+)?([а-яё]+)/i); if (!mm) return;
                const w = mm[2].toLowerCase(), v = parseInt(mm[1]);
                const code = /^разруш/.test(w) ? 'destr' : /^изменен/.test(w) ? 'alter' : /^иллюз/.test(w) ? 'illus' : /^колдов/.test(w) ? 'conj' : /^вос+тано?в/.test(w) ? 'restor' : null;
                if (code) cut[code] += v;
            });
            String(effText).split(/\.\s*/).forEach(sent => {
                sent = sent.trim();
                if (!sent || /^усилен/i.test(sent)) return;
                let m = sent.match(/заклинани[а-яё]*\s+всех\s+школ\s+на\s+(\d+)\s*%\s+дешевле/i);
                if (m) { cut.all += parseInt(m[1]); return; }
                m = sent.match(/стоимость\s+заклинаний\s*\+\s*(\d+)\s*%/i); // Азидалов шлем: «стоимость заклинаний +25%» — дороже
                if (m) { cut.all -= parseInt(m[1]); return; }
                // «Заклинания школы Восстановления на 15% дешевле», «Заклинания востановления дешевле на 20%», «Шлем: Иллюзия на 15% дешевле»
                m = sent.match(/заклинани[а-яё]*\s+(?:школы\s+)?([а-яё]+)\s+(?:на\s+(\d+)\s*%\s+дешевле|дешевле\s+на\s+(\d+)\s*%)/i);
                if (!m) return;
                const w = m[1].toLowerCase(), v = parseInt(m[2] || m[3]);
                const code = /^разруш/.test(w) ? 'destr' : /^изменен/.test(w) ? 'alter' : /^иллюз/.test(w) ? 'illus' : /^колдов/.test(w) ? 'conj' : /^во[а-яё]*лени/.test(w) ? 'restor' : null;
                if (code) cut[code] += v;
            });
            });
        });
        return cut;
    }

    // ===== Текстовые эффекты экипировки → числа =====
    // Уникальная броня/артефакты описаны текстом через запятую: «+25 МП, +10% сопр. магии, +15% урона». Раньше учитывался
    // только ОДИН простой бонус (хп/мп/броня), остальное было подписью. Здесь разбираем каждую часть; условные части
    // («при сете», «в бою с животными», «раз в день», «за каждую»…) остаются текстом.
    // Встроенное свойство вещи (то, что было до зачарования): зачарование пишет в effect своё описание,
    // а свойство из базы хранится в baseEffect (старые вещи — берём из базы по имени без «[Чары]»).
    function gearBaseEffect(item) {
        if (!item) return '';
        if (!item.enchantment) return item.effect || '';
        if (typeof item.baseEffect === 'string') return item.baseEffect;
        const baseName = String(item.name || '').replace(/\s*\[[^\]]+\]$/, '');
        const proto = (window.allItems || []).find(i => i.name === baseName && (!item.category || !i.category || i.category === item.category));
        return proto && proto.effect ? String(proto.effect) : '';
    }
    // Комплекты уникальной брони («При ношении полного комплекта: …», «Без полного комплекта …»): полный комплект —
    // шлем, кираса, перчатки и сапоги из одного места (поле location в базе), у всех четырёх в свойстве есть «полного комплекта».
    function gearItemLocation(it) {
        if (!it) return '';
        if (it.location) return it.location;
        const proto = (window.allItems || []).find(i => i.name === it.name);
        return (proto && proto.location) || '';
    }
    function gearFullSetOn(item) {
        const loc = gearItemLocation(item);
        if (!loc) return false;
        return ['helmet', 'chest', 'gloves', 'boots'].every(k => {
            const it = equippedSlots[k] ? playerInventory.find(i => i.itemId === equippedSlots[k]) : null;
            return !!it && gearItemLocation(it) === loc && /полного комплекта/i.test(gearBaseEffect(it));
        });
    }
    function gearSetText(text, item) {
        const t = String(text || '');
        if (!/полного комплекта/i.test(t)) return t;
        const full = gearFullSetOn(item);
        const re = /(при ношении полного комплекта|без полного комплекта)\s*(?:дает|даёт)?\s*:?\s*/ig;
        let out = '', last = 0, mode = 'base', m;
        const push = seg => { if (mode === 'base' || (mode === 'set') === full) out += (out ? '. ' : '') + seg.trim().replace(/^[.,;\s]+|[.,;\s]+$/g, ''); };
        while ((m = re.exec(t))) { push(t.slice(last, m.index)); mode = /^при/i.test(m[1]) ? 'set' : 'noset'; last = re.lastIndex; }
        push(t.slice(last));
        return out.replace(/^\.\s*/, '');
    }
    // Тексты свойств надетой вещи для разбора: описание зачарования (если не skipEnchant) и встроенное свойство с учётом комплекта.
    function gearTexts(item, skipEnchant) {
        if (!item) return [];
        const out = [];
        if (item.enchantment && !skipEnchant && item.effect) out.push(String(item.effect));
        const base = gearSetText(gearBaseEffect(item), item);
        if (base && !(item.enchantment && base === item.effect)) out.push(base);
        return out;
    }
    const GEAR_RES_WORDS = [[/огн/, 'fire'], [/холод|мороз/, 'frost'], [/электр/, 'shock'], [/яд/, 'poison'], [/болезн/, 'disease'], [/магии|магич/, 'magic'], [/стрел/, 'arrow'], [/крик/, 'shout']];
    function parseGearEffects(text) {
        const o = { speed: 0, hp: 0, mp: 0, weight: 0, armor: 0, fire: 0, frost: 0, shock: 0, poison: 0, disease: 0, magic: 0, shout: 0, arrow: 0, dmg: 0, melee: 0, ranged: 0, atk: 0, skill: {},
            onehand: 0, bow: 0, elemDmg: { fire: 0, frost: 0, shock: 0 }, pen: 0, penRanged: 0, skillPts: {}, stat: {}, costUp: 0, any: false };
        if (!text) return o;
        String(text).split(/\s*[,;]\s*|\.\s+(?=[А-ЯЁ«])/).forEach(raw => {
            const c = raw.trim().toLowerCase().replace(/ё/g, 'е');
            if (!c || /(^|[^а-я])при([^а-я]|$)|в бою с|если|без полного|раз в|за кажд|шанс|на \d+ ход|уровн/.test(c)) return;
            let m;
            const num = x => parseFloat(x);
            // Повышения максимумов
            if ((m = c.match(/^\+?\s*(\d+(?:\.\d+)?)\s*(?:хп|здоровья)(?![а-яa-z])/)) || (m = c.match(/^повышение здоровья:\s*(\d+(?:\.\d+)?)/))) { o.hp += Math.round(num(m[1])); o.any = true; return; }
            if ((m = c.match(/^\+?\s*(\d+(?:\.\d+)?)\s*(?:мп|mp|маны|магии)(?![а-яa-z])/)) || (m = c.match(/^повышение магии:\s*(\d+(?:\.\d+)?)/))) { o.mp += Math.round(num(m[1])); o.any = true; return; }
            if ((m = c.match(/^\+\s*(\d+)\s*(?:к\s+)?скорости/))) { o.speed += parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^\+\s*(\d+)\s*(?:к\s+)?переносимого веса/))) { o.weight += parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^\+\s*(\d+)\s*(?:к\s+)?брони$/))) { o.armor += parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^\+\s*(\d+)\s*%\s*(?:сопр\.?|сопротивлени[а-я]*|защиты от)\s+стихи[а-я]*$/))) { const v = parseInt(m[1]); o.fire += v; o.frost += v; o.shock += v; o.any = true; return; }
            if ((m = c.match(/^повышение переносимого веса:\s*(\d+(?:\.\d+)?)/)) || (m = c.match(/^переносимый вес увеличивается на\s*(\d+)/))) { o.weight += Math.round(num(m[1])); o.any = true; return; }
            // «Повышает сопротивление холоду на 50%», «Увеличивает сопротивление ядам на 100%»
            if ((m = c.match(/^(?:повышает|увеличивает)\s+сопротивлени[а-я]*\s+(.+?)\s+на\s+(\d+(?:\.\d+)?)\s*%/))) {
                const hitR = GEAR_RES_WORDS.find(w => w[0].test(m[1]));
                if (hitR) { o[hitR[1]] += num(m[2]); o.any = true; return; }
            }
            // «Урон огнём +25%» — к заклинаниям этой стихии
            if ((m = c.match(/^урон\s+(огнем|холодом|морозом|электричеством)\s*\+\s*(\d+)\s*%/))) {
                o.elemDmg[/огн/.test(m[1]) ? 'fire' : /электр/.test(m[1]) ? 'shock' : 'frost'] += parseInt(m[2]); o.any = true; return;
            }
            // «Одноручное оружие наносит на 20% больше урона», «Луки наносят на 35% больше урона»
            if ((m = c.match(/^одноручное оружие наносит на\s*(\d+)\s*%\s*больше урона/))) { o.onehand += parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^луки наносят на\s*(\d+)\s*%\s*больше урона/))) { o.bow += parseInt(m[1]); o.any = true; return; }
            // Пробитие: «+8% пробивания» — процент резиста цели; «50 пробития» — очки брони (10 очков = 1%, как у брони игрока)
            if ((m = c.match(/^\+?\s*(\d+)\s*%\s*пробива[а-я]*$/))) { o.pen += parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^\+?\s*(\d+)\s*пробити[а-я]*(\s+стрелками)?$/))) { const v = Math.round(parseInt(m[1]) / 10); if (m[2]) o.penRanged += v; else o.pen += v; o.any = true; return; }
            // «+5 навыка Разрушения», «+3 Интеллекта»
            if ((m = c.match(/^\+\s*(\d+)\s*навыка\s+([а-я ]+)$/))) { const skN = m[2].trim(); o.skillPts[skN] = (o.skillPts[skN] || 0) + parseInt(m[1]); o.any = true; return; }
            if ((m = c.match(/^\+\s*(\d+)\s*(силы|ловкости|телосложения|интеллекта|мудрости|харизмы)$/))) {
                const stK = { 'силы': 'str', 'ловкости': 'dex', 'телосложения': 'con', 'интеллекта': 'int', 'мудрости': 'wis', 'харизмы': 'cha' }[m[2]];
                o.stat[stK] = (o.stat[stK] || 0) + parseInt(m[1]); o.any = true; return;
            }
            // «Стоимость заклинаний +25%» — штраф к цене каста всех школ
            if ((m = c.match(/^стоимость заклинаний\s*\+\s*(\d+)\s*%/))) { o.costUp += parseInt(m[1]); o.any = true; return; }
            // Сопротивления: «+25% сопр. огню», «сопротивление магии: 12.5%», «25% резист магии», «+15% защиты от стрел»
            if ((m = c.match(/^([+\-]?\d+(?:\.\d+)?)\s*%\s*(?:сопр\.?|сопротивлени[а-я]*|резист[а-я]*|защиты от)\s+(.+)$/)) || (m = c.match(/^(?:сопротивлени[а-я]*|резист[а-я]*)\s+(.+?)[:\s]\s*\+?\s*(\d+(?:\.\d+)?)\s*%$/))) {
                const val = m.length === 3 && /^[+\-]?\d/.test(m[1]) ? num(m[1]) : num(m[2]);
                const what = (/^[+\-]?\d/.test(m[1]) ? m[2] : m[1]);
                const hit = GEAR_RES_WORDS.find(w => w[0].test(what));
                if (hit) { o[hit[1]] += val; o.any = true; return; }
            }
            // Урон: «+15% урона оружием», «+15% урона одноручным и двуручным», «+10% урона стрелками», «+10% физ. урона»
            if ((m = c.match(/^\+\s*(\d+(?:\.\d+)?)\s*%\s*(?:физ\.?\s*)?урона(?:\s+(.+))?$/))) {
                const v = num(m[1]), w = m[2] || '';
                if (/огн|холод|электр|яд/.test(w)) return;
                if (/стрелк|лучник|дальн/.test(w)) o.ranged += v; else if (/одноруч|двуруч|ближн/.test(w)) o.melee += v; else o.dmg += v;
                o.any = true; return;
            }
            // Бонус к кубам атаки
            if ((m = c.match(/^\+\s*(\d+)\s*к кубам атаки/))) { o.atk += parseInt(m[1]); o.any = true; return; }
            // Бонус к броскам навыка: «+1 к скрытности», «+2 к кубам на скрытность», «+3 куба на скрытность»
            if ((m = c.match(/^\+\s*(\d+)\s*(?:к кубам на|куб[а-яё]* на|к)\s+([а-я ]+)$/))) {
                const sk = m[2].trim();
                if (/скрытност|взлом|карманн|красноречи|алхими|кузнечн|зачарован|разрушен|восстановлен|колдовств|иллюзи|изменен|кулинар|блокиров|стрельб/.test(sk)) {
                    // «к кубам карманной краже», «к скрытности», «на карманные кражи» → имя навыка, как его ищет canonSkillKey
                    const key = sk.replace(/^(?:кубам\s+)?(?:на\s+)?/, '');
                    const STEMS = [[/^скрытн/, 'скрытность'], [/^взлом/, 'взлом'], [/^карманн/, 'карманные кражи'], [/^красноречи/, 'красноречие'], [/^алхими/, 'алхимия'],
                        [/^кузнечн/, 'кузнечное дело'], [/^зачарован/, 'зачарование'], [/^разрушен/, 'разрушение'], [/^восстановлен/, 'восстановление'], [/^колдовств/, 'колдовство'],
                        [/^иллюзи/, 'иллюзия'], [/^изменен/, 'изменение'], [/^кулинар/, 'кулинария'], [/^блокиров/, 'блокирование'], [/^стрельб/, 'стрельба']];
                    const st = STEMS.find(x => x[0].test(key));
                    const k = st ? st[1] : key;
                    o.skill[k] = (o.skill[k] || 0) + parseInt(m[1]); o.any = true; return;
                }
            }
        });
        return o;
    }
    // Суммарные боевые бонусы надетой экипировки из текста (урон, атака, броски навыков).
    function getGearTextBonuses() {
        const t = { dmg: 0, melee: 0, ranged: 0, atk: 0, skill: {}, onehand: 0, bow: 0, elemDmg: { fire: 0, frost: 0, shock: 0 }, pen: 0, penRanged: 0, skillPts: {}, stat: {} };
        const invById = new Map(playerInventory.map(i => [i.itemId, i]));
        ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'neck', 'circlet'].forEach(slotKey => {
            const item = equippedSlots[slotKey] ? invById.get(equippedSlots[slotKey]) : null;
            if (!item) return;
            gearTexts(item).forEach(txt => {
                const g = parseGearEffects(txt);
                t.dmg += g.dmg; t.melee += g.melee; t.ranged += g.ranged; t.atk += g.atk;
                t.onehand += g.onehand; t.bow += g.bow; t.pen += g.pen; t.penRanged += g.penRanged;
                ['fire', 'frost', 'shock'].forEach(k => { t.elemDmg[k] += g.elemDmg[k]; });
                Object.keys(g.skill).forEach(k => { t.skill[k] = (t.skill[k] || 0) + g.skill[k]; });
                Object.keys(g.skillPts).forEach(k => { t.skillPts[k] = (t.skillPts[k] || 0) + g.skillPts[k]; });
                Object.keys(g.stat).forEach(k => { t.stat[k] = (t.stat[k] || 0) + g.stat[k]; });
            });
        });
        return t;
    }
    // Особые свойства вещей, которые не укладываются в parseGearEffects (по тексту свойства надетых вещей).
    function getGearSpecialBonuses() {
        const o = { weaponBasePct: 0, reflectMeleePct: 0, spellPowerPct: 0, blockEffPct: 0, wardWeakerPct: 0, magicAbsorbPct: 0,
            atronachExtra: 0, atronachTurns: 0, castRangeFt: 0, burnDice: 0, mpDmgPct: 0, slowExtraFt: 0, wolfHours: 0 };
        const invById = new Map(playerInventory.map(i => [i.itemId, i]));
        const num = (t, re) => { const m = t.match(re); return m ? parseInt(m[1]) : 0; };
        ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'neck', 'circlet'].forEach(slotKey => {
            const item = equippedSlots[slotKey] ? invById.get(equippedSlots[slotKey]) : null;
            if (!item) return;
            gearTexts(item).forEach(raw => {
                const t = String(raw || '');
                o.weaponBasePct += num(t, /\+\s*(\d+)\s*%\s*базового урона оружия/i);
                o.reflectMeleePct += num(t, /(\d+)\s*%\s*отражения урона в ближнем бою/i);
                o.spellPowerPct += num(t, /все заклинания на\s*(\d+)\s*%\s*сильнее/i);
                o.blockEffPct += num(t, /\+\s*(\d+)\s*%\s*эффективности блока/i);
                o.wardWeakerPct += num(t, /обереги на\s*(\d+)\s*%\s*слабее/i);
                o.magicAbsorbPct += num(t, /(\d+)\s*%\s*поглощени[а-яё]*\s+магии/i) || num(t, /поглощают\s*(\d+)\s*%\s*магии/i);
                o.atronachExtra += num(t, /призвать\s*\+\s*(\d+)\s*атронах/i);
                o.atronachTurns += num(t, /атронахи[^.]*?на\s*(\d+)\s*ход[а-яё]*\s+дольше/i);
                o.castRangeFt += num(t, /дальность колдовства[^.,]*?\+\s*(\d+)\s*фут/i);
                o.burnDice += num(t, /добавляет\s*(\d+)\s*[дd]6\s+к горению/i);
                o.mpDmgPct += num(t, /\+\s*(\d+)\s*%\s*урона по мане/i);
                o.slowExtraFt += num(t, /-\s*(\d+)\s*к скорости при замедлени/i);
                o.wolfHours += num(t, /вервольфам[^.]*?\+\s*(\d+)\s*час/i);
            });
        });
        o.magicAbsorbPct = Math.min(100, o.magicAbsorbPct);
        return o;
    }
    window.getGearSpecialBonuses = getGearSpecialBonuses;
    function mergeGearIntoGod(godB) {
        const t = getGearTextBonuses();
        const r = Object.assign({}, godB);
        if (t.dmg) r.weaponDmg = (r.weaponDmg || 0) + t.dmg;
        if (t.melee) r.meleeDmg = (r.meleeDmg || 0) + t.melee;
        if (t.ranged) r.rangedDmg = (r.rangedDmg || 0) + t.ranged;
        // «Одноручное оружие +N%» — только пока в правой одноручное; «Луки +N%» — только лук (не арбалет).
        if (t.onehand && !/^twohand/.test(String((document.getElementById('wep-melee-type') || {}).value || ''))) r.meleeDmg = (r.meleeDmg || 0) + t.onehand;
        if (t.bow && (document.getElementById('wep-ranged-type') || {}).value === 'bow') r.rangedDmg = (r.rangedDmg || 0) + t.bow;
        return r;
    }

    function getEquipmentEnchantBonuses() {
        const bonuses = { hp: 0, mp: 0, weight: 0, armor: 0, resistFire: 0, resistFrost: 0, resistShock: 0, resistPoison: 0, resistDisease: 0, resistMagic: 0, resistShout: 0, resistPhys: 0, resistArrow: 0, speed: 0 };
        // Раньше 9 отдельных playerInventory.find() — O(9×N). Локальная Map строится один раз
        // за вызов из ТЕКУЩЕГО playerInventory, так что не может устареть/рассинхронизироваться
        // между вызовами (в отличие от долгоживущего кэша — тот был бы рискованно трогать в
        // формулах боевого баланса, легко пропустить место инвалидации и получить тихо неверные
        // цифры в бою).
        const invById = new Map(playerInventory.map(i => [i.itemId, i]));
        ['helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'neck', 'circlet'].forEach(slotKey => {
            const itemId = equippedSlots[slotKey];
            if (!itemId) return;
            const item = invById.get(itemId);
            if (!item) return;
            let enchDone = false;
            if (item.enchantment) {
                const key = ENCHANT_AUTO_APPLY_ARMOR[item.enchantment.name];
                if (key && typeof item.enchantment.value === 'number') {
                    bonuses[key] += item.enchantment.value;
                    enchDone = true;
                }
            }
            // Текстовые свойства: описание зачарования (если оно не разобрано выше) и встроенное свойство вещи —
            // зачарование его больше не стирает.
            gearTexts(item, enchDone).forEach(txt => {
                const g = parseGearEffects(txt);
                bonuses.speed += g.speed; bonuses.hp += g.hp; bonuses.mp += g.mp; bonuses.weight += g.weight; bonuses.armor += g.armor;
                bonuses.resistFire += g.fire; bonuses.resistFrost += g.frost; bonuses.resistShock += g.shock; bonuses.resistPoison += g.poison;
                bonuses.resistDisease += g.disease; bonuses.resistMagic += g.magic; bonuses.resistShout += g.shout; bonuses.resistArrow += g.arrow; // «защита от стрел» — только против стрел и болтов
                if (!g.any) { const plain = parsePlainEffectBonus(txt); if (plain && bonuses[plain.key] !== undefined) bonuses[plain.key] += plain.value; }
            });
        });
        return bonuses;
    }

    // Итоговое сопротивление игрока по типам урона (%, из брони + активных зелий/эффектов + перка
    // «Сопротивление магии»). Используется мастером при разрешении входящей атаки — без этого
    // резисты были просто текстом в описании, ничего реально не снижали.
    function computeTotalResistances() {
        const gear = getEquipmentEnchantBonuses();
        const perks = window.perkBonuses || {};
        const percentBonuses = getActivePercentBonuses();
        // Физический резист от брони: каждые 10 очков суммарной брони = 1% (как договорились) —
        // раньше тут стоял захардкоженный 0, броня вообще не снижала физический урон.
        const totalArmor = parseInt((document.getElementById('armor-total') || {}).innerText) || 0;
        const res = {
            physical: Math.round(totalArmor / 10),
            fire: gear.resistFire, frost: gear.resistFrost, shock: gear.resistShock,
            poison: gear.resistPoison + (perks.alchemyPoisonResist50 ? 50 : 0), disease: gear.resistDisease, shout: gear.resistShout, // «Змеиная кровь»: +50% к ядам
            magic: gear.resistMagic + (perks.resistMagicPercent || 0) + ((document.getElementById('char-race') || {}).value === 'breton' ? 10 : 0) // Бретон: 10% сопротивления магии
        };
        { // Расовые сопротивления по правилам: норд — холод 10%, данмер — огонь 10%, босмер — яд 10%.
            const raceR = (document.getElementById('char-race') || {}).value;
            if (raceR === 'nord') res.frost += 10;
            if (raceR === 'dunmer') res.fire += 10;
            if (raceR === 'bosmer') res.poison += 10;
        }
        // "Аура" и подобные заклинания дают сопротивление стихиям (огонь/холод/электричество)
        // ИЛИ сразу трём "прочим" типам (яд/болезни/крики) одним числом.
        res.physical += (percentBonuses.resistPhysical || 0) + gear.resistPhys;
        { const pe = periyteBuffs().elemRes + diseasePenalties().elemRes; // «Хрипунец»: −10% (у Периайта — бафф)
          res.fire += percentBonuses.resistElemental + pe;
          res.frost += percentBonuses.resistElemental + pe;
          res.shock += percentBonuses.resistElemental + pe; }
        res.poison += percentBonuses.resistPoisonDiseaseShout;
        res.disease += percentBonuses.resistPoisonDiseaseShout;
        res.shout += percentBonuses.resistPoisonDiseaseShout;
        // Уязвимости (отрицательные значения от зелий/ингредиентов) прибавляются уже ПОСЛЕ потолка/пола —
        // иначе при нулевом резисте уязвимость «съедалась» бы клампом.
        const vulnAfter = {};
        (activeTimedEffects || []).forEach(e => {
            if (e.res && typeof e.res === 'object') {
                Object.keys(e.res).forEach(k => {
                    const v = e.res[k];
                    if (typeof v !== 'number' || res[k] === undefined) return;
                    if (v >= 0) res[k] += v; else vulnAfter[k] = (vulnAfter[k] || 0) + v;
                });
                return;
            }
            const m = matchResistEffectName(e.effectName);
            if (m && typeof e.value === 'number') res[m] += e.value;
        });
        // Резисты от бога — раньше эти ~10 ключей были в данных, но нигде не прибавлялись.
        // arrowResist/physResist (нет отдельного "резист стрелам" — считаем как физический,
        // стрелы физический урон); daedraUndeadResist пропущен — нет данных о типе противника
        // в бою, применять условно вручную по описанию (см. панель бога).
        res.physical += gb('physResist');
        // Резист стрелам и болтам (Дибелла/Стендарр/Кинарет) — отдельно, мастер учитывает его только против стрел и болтов.
        // У Дибеллы он действует только под заклинанием «плоти».
        res.arrow = (((document.getElementById('faith-god') || {}).value === 'dibella' && !fleshSpellActive()) ? 0 : gb('arrowResist')) + (gear.resistArrow || 0);
        res.fire += gb('fireResist') + gb('elementalResist');
        res.frost += gb('coldResist') + gb('elementalResist');
        res.shock += gb('shockResist') + gb('elementalResist');
        res.poison += gb('poisonDiseaseResist') + gb('poisonResist');
        res.disease += gb('poisonDiseaseResist');
        res.shout += gb('shoutResist');
        res.magic += gb('magicResist');
        if (lichPerk('pact')) res.magic += 10;                                   // Тёмный пакт: сопротивление магии +10%
        if (lichPerk('visage')) res.frost += 10;                                 // Лик смерти: холод +10%
        if (lichStage() >= 1) { res.frost += 50; vulnAfter.shock = (vulnAfter.shock || 0) - 25; } // лич: холод +50%, электричество −25%
        if (snVampire()) { res.frost += 50 + vampHungerResistDelta(); vulnAfter.fire = (vulnAfter.fire || 0) - 50 - vampHungerResistDelta(); } // вампир: холод +50%, огонь −50% (как в Skyrim)
        Object.keys(res).forEach(k => { res[k] = Math.min(85, Math.max(0, res[k])); }); // потолок 85%, как в ваниле
        if (snVampire()) { res.poison = 100; res.disease = 100; } // вампир: полный иммунитет к ядам и болезням
        if (lichStage() >= 1 && lichAlive()) { res.poison = 100; res.disease = 100; } // лич: иммунитет к ядам и болезням (кроме «Заёмной жизни»)
        if ((document.getElementById('char-race') || {}).value === 'argonian') res.disease = 100; // аргонианин: иммунитет к болезням
        Object.keys(vulnAfter).forEach(k => { res[k] += vulnAfter[k]; });
        // Знак «Ученик» — уязвимость к магии 10% (было только текстом в описании). В отличие от
        // обычного резиста это НЕ клампится до 0 — именно доп. урон сверху, а не "просто нет резиста".
        const sign = document.getElementById('char-sign').value;
        if (sign === 'apprentice') res[apprenticeVuln || 'fire'] -= 10; // уязвим к ОДНОМУ случайному типу магии (огонь/холод/электричество)
        // Знак «Лорд»: в Sistema 2.2 нет резистов к холоду/огню — «Кровь Севера» (лечение) и «Родство с троллями»
        // (весь урон огнём +2d6) — первое в способностях, второе учитывает мастер при уроне огнём.
        // Шеогорат — качели физ. защиты за ход, тоже без клампа до 0 (может УМЕНЬШИТЬ реальный
        // резист ниже нуля в "плохой" ход, не просто занулить).
        if (typeof sheogorathRoll !== 'undefined' && sheogorathRoll.defSwing) ['physical', 'fire', 'frost', 'shock', 'poison', 'magic'].forEach(k => { if (res[k] !== undefined) res[k] += sheogorathRoll.defSwing; }); // Шеогорат: снижение всего получаемого урона
        return res;
    }

    function matchResistEffectName(name) {
        if (!name) return null;
        const map = {
            'сопротивление огню': 'fire', 'сопротивление холоду': 'frost', 'сопротивление электричеству': 'shock',
            'сопротивление ядам': 'poison', 'сопротивление болезням': 'disease', 'сопротивление магии': 'magic',
            'сопротивление крикам': 'shout'
        };
        return map[name.toLowerCase().trim()] || null;
    }

    // Зачарованное оружие с зарядом 0 — чары на месте, но «спят» до подзарядки камнем душ.
    function weaponEnchantLive(item) {
        return !!(item && item.enchantment && (item.isStaff || item.chargeDaysLeft !== 0));
    }
    function getActiveWeaponEnchantDmg(isMelee) {
        const itemId = isMelee ? equippedSlots.meleeWeapon : equippedSlots.rangedWeapon;
        if (!itemId) return 0;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!weaponEnchantLive(item)) return 0;
        return (ENCHANT_AUTO_APPLY_WEAPON[item.enchantment.name] && typeof item.enchantment.value === 'number') ? item.enchantment.value : 0;
    }

    function gainOwnMp(n) {
        const mpE = document.getElementById('cur-mp'), mx = parseInt((document.getElementById('max-mp') || {}).value) || 0, c = parseInt(mpE.value) || 0;
        mpE.value = Math.max(c, Math.min(mx, c + (parseInt(n) || 0))); updateVitalBars(); saveLocalStorage();
    }
    // Числовые свойства уникального оружия из текста (Соловьиный клинок/лук, Топор Жатвы, Рубиновый Тронный Кинжал и т.п.).
    // Только у вещей без зачарования: у зачарованных урон уже считается по enchantment.
    function uniqueWeaponHitProps(item) {
        const o = { hpSteal: 0, mpSteal: 0, elem: [], sneakX: 0, killMp: 0 };
        if (!item || item.enchantment) return o;
        const t = String(item.effect || '').toLowerCase();
        if (!t || /площад/.test(t)) return o;
        const n = re => { const m = t.match(re); return m ? parseInt(m[1]) : 0; };
        o.hpSteal = n(/(?:поглощает|похищает|крад[её]т)\s+(?:до\s+)?(\d+)\s*(?:ед[а-я.]*\s*|единиц\s*)?(?:здоровья|хп)/);
        o.mpSteal = n(/(?:похищает|крад[её]т)\s+(?:до\s+)?(?:\d+\s*хп\s+и\s+)?(\d+)\s*(?:ед[а-я.]*\s*)?(?:магии|мп)/);
        const fr = n(/(\d+)\s*ед[а-я.]*\s*урона\s+холодом/), sh = n(/(\d+)\s*ед[а-я.]*\s*(?:урона\s+)?электричеством/), fi = n(/(\d+)\s*ед[а-я.]*\s*урона\s+огн[её]м/);
        if (fi) o.elem.push({ type: 'fire', dmg: fi, label: '🔥 огонь' });
        if (fr) o.elem.push({ type: 'frost', dmg: fr, label: '❄ холод' });
        if (sh) o.elem.push({ type: 'shock', dmg: sh, label: '⚡ электричество' });
        const x = t.match(/урон\s*×\s*(\d+(?:[.,]\d+)?)/); if (x && /неожида|союзник/.test(t)) o.sneakX = parseFloat(x[1].replace(',', '.'));
        o.killMp = n(/убийство\s*\+\s*(\d+)\s*маны/);
        return o;
    }

    function getOffhandWeaponEnchantDmg() {
        const itemId = equippedSlots.meleeWeaponOffhand;
        if (!itemId) return 0;
        const item = playerInventory.find(i => i.itemId === itemId);
        if (!weaponEnchantLive(item)) return 0;
        return (ENCHANT_AUTO_APPLY_WEAPON[item.enchantment.name] && typeof item.enchantment.value === 'number') ? item.enchantment.value : 0;
    }

    function getEquippedWeaponEnchantDesc(isMelee) {
        const itemId = isMelee ? equippedSlots.meleeWeapon : equippedSlots.rangedWeapon;
        const item = itemId ? playerInventory.find(i => i.itemId === itemId) : null;
        if (item && item.enchantment && !weaponEnchantLive(item)) return ''; // заряд 0 — чары спят
        return getEffectDescriptionForItem(item);
    }
