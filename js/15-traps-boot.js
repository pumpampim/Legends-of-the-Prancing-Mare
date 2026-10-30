    // ---------- Ловушки (traps-data.js): урон и спасброски — на листе игрока ----------
    // Настоящая Ловкость (с расой/знаком), свои сопротивления и свои ХП/мана — поэтому ловушку разрешает лист, а не мастер.
    function rollDieN(n, sides) { let sum = 0; const rolls = []; for (let i = 0; i < n; i++) { const r = 1 + Math.floor(Math.random() * sides); rolls.push(r); sum += r; } return { sum, rolls }; }
    // Знак «Лорд» — «Родство с троллями»: весь получаемый урон огнём +2d6 (атаки врагов, ловушки, руны, зоны).
    function lordFireExtra(dmgType) {
        if (dmgType !== 'fire' || (document.getElementById('char-sign') || {}).value !== 'lord') return null;
        const r = rollDieN(2, 6);
        return { sum: r.sum, txt: '2d6=' + r.rolls.join('+') };
    }
    function trapHitsDamage(hits) {
        const res = computeTotalResistances();
        let hp = 0, mp = 0; const parts = [];
        (hits || []).forEach(h => {
            let base = parseInt(h.dmg) || 0, diceTxt = '';
            if (Array.isArray(h.dice)) { const r = rollDieN(h.dice[0], h.dice[1]); base += r.sum; diceTxt = `${h.dice[0]}d${h.dice[1]}=${r.rolls.join('+')}`; }
            // Общая формула: стихии + сопр. магии, потолок 85%, иммунитет полный, уязвимости увеличивают урон.
            const rp = window.StCombat.playerIncomingResist(res, h.type);
            let fin = Math.max(0, Math.round(base * (1 - rp / 100)));
            const lord = fin > 0 ? lordFireExtra(h.type) : null;
            if (lord) fin += lord.sum;
            hp += fin; if (h.mp) mp += parseInt(h.mp) || 0;
            const TYPE = { physical: 'физ.', fire: 'огнём', frost: 'холодом', shock: 'электричеством', poison: 'ядом', magic: 'магией' };
            parts.push(`${fin} ${TYPE[h.type] || ''}${diceTxt ? ' (' + diceTxt + ')' : ''}${rp > 0 ? ` −${rp}%` : rp < 0 ? ` +${-rp}% (уязвимость)` : ''}${lord ? ` +${lord.txt} (знак Лорда)` : ''}${h.mp ? `, −${h.mp} маны` : ''}`);
        });
        return { hp, mp, parts };
    }
    function dexModNow() { return calcAbilityMod(parseInt((document.getElementById('stat-dex') || {}).value) || 10); }
    function applyTrapToSelf(c) {
        let hits = (c.hits || []).slice();
        const saveTxt = [];
        if (c.save && c.save.count) { // секиры: спасбросок Ловкости на каждую
            const mod = dexModNow();
            for (let i = 0; i < c.save.count; i++) {
                const r = 1 + Math.floor(Math.random() * 20), ok = r + mod >= c.save.dc;
                saveTxt.push(`${r}${mod >= 0 ? '+' : ''}${mod}=${r + mod}${ok ? '✔' : '✘'}`);
                if (!ok) hits.push(c.save.failHit);
            }
        }
        const d = trapHitsDamage(hits);
        if (d.hp > 0) { const soak = playerSoakIncoming(d.hp, false); d.hp = soak.dmg; d.parts.push(...soak.notes); }
        if (d.hp || d.mp) {
            const hpEl = document.getElementById('cur-hp'), mpEl = document.getElementById('cur-mp');
            hpEl.value = Math.max(0, (parseInt(hpEl.value) || 0) - d.hp);
            if (d.mp) mpEl.value = Math.max(0, (parseInt(mpEl.value) || 0) - d.mp);
            if (d.hp && typeof window.concentrationCheck === 'function') try { window.concentrationCheck(d.hp); } catch (e) { }
        }
        const who = (document.getElementById('char-name') || {}).value || 'Игрок';
        const txt = `🪤 ${who}: ${c.icon || ''} ${c.trapName}` + (saveTxt.length ? ` — спасброски Ловкости сл. ${c.save.dc}: ${saveTxt.join(', ')}` : '') +
            (d.hp || d.mp ? ` — урон ${d.hp}${d.mp ? `, мана −${d.mp}` : ''} (${d.parts.join('; ')})` : (saveTxt.length ? ' — прошёл(ла) без ран' : '')) +
            (c.knockback ? ` · отброшен(а) на ${c.knockback} фт` : '') + (c.alarm ? ' · 🔔 враги знают, где вы' : '') + (c.note && !d.hp && !saveTxt.length ? ` · ${c.note}` : '') + '.';
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(txt, who);
        try { if (typeof checkDeath === 'function') checkDeath(); } catch (e) { }
        return txt.replace(/^🪤 [^:]+: /, '');
    }
    function tryDisarmTrap(c) {
        const mod = dexModNow(), r = 1 + Math.floor(Math.random() * 20), total = r + mod, ok = total >= c.dc;
        const who = (document.getElementById('char-name') || {}).value || 'Игрок';
        const txt = `🛠 ${who} обезвреживает ${c.icon || ''} «${c.trapName}»: d20 ${r}${mod >= 0 ? '+' : ''}${mod} = ${total} против ${c.dc} — ${ok ? 'обезврежено' : 'не вышло'}.`;
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(txt, who);
        if (ok && c.trapId && window.CloudSync && window.CloudSync.setTrapDisarmed) window.CloudSync.setTrapDisarmed(c.trapId).catch(() => { });
        if (!ok && c.trapId && c.failState && window.CloudSync && window.CloudSync.setTrapTriggered) window.CloudSync.setTrapTriggered(c.trapId, c.failState).catch(() => { });
        const short = txt.slice(('🛠 ' + who + ' ').length); // без имени: оно уже в заголовке окна (имя может быть из нескольких слов)
        if (!ok && c.onFail) return short + ' ' + applyTrapToSelf(c.onFail);
        return short;
    }

    function ackGmCmds(cmds) {
        if (window.CloudSync && typeof window.CloudSync.ackGmCmds === 'function') window.CloudSync.ackGmCmds(cmds).catch(() => { });
    }

    // Применяет объект сохранения к DOM (используется и локальным, и облачным сохранением)
    // Текущая версия формата сейва. Раньше поле data.version писалось при сохранении, но нигде
    // не проверялось при загрузке — если формат когда-нибудь поменяется несовместимо (например,
    // activeSummons станет объектом вместо массива), у старых игроков всё молча поедет без
    // предупреждения. Реестр миграций пока пуст (менять пока нечего), но инфраструктура готова:
    // чтобы добавить миграцию с 3.6 на 3.7, пишем SAVE_MIGRATIONS['3.6'] = function(data) {
    // ...меняет data и возвращает его...; return data; } и поднимаем CURRENT_SAVE_VERSION.
    // 7.2: раньше версия была 3.6 и реестр пуст; теперь 3.7. Миграция 3.6→3.7 пока ничего не меняет в данных
    // (формат тот же), только переставляет метку версии — это заготовка, куда в будущем кладут реальные преобразования.
    const CURRENT_SAVE_VERSION = '3.7';
    window.SKYRIM_SAVE_VERSION = CURRENT_SAVE_VERSION;
    const SAVE_MIGRATIONS = {
        '3.6': function (data) { data.version = '3.7'; return data; }
    };
    // Переименованные предметы (исправление ё/е и опечаток в названиях ингредиентов). У игроков в
    // сохранённом инвентаре/известных свойствах могли остаться старые написания — приводим к новым,
    // при совпадении стопок складываем количество. Не зависит от версии сейва — идемпотентно.
    const ITEM_RENAMES = {
        'Паслен': 'Паслён', 'Морской желудь': 'Морской жёлудь', 'Толченый бивень мамонта': 'Толчёный бивень мамонта',
        'Хвост злокрыся': 'Хвост злокрыса', 'Череп троля': 'Череп тролля'
    };
    function applyItemRenames(data) {
        if (!data) return data;
        if (Array.isArray(data.inventory)) {
            const merged = [];
            data.inventory.forEach(it => {
                const newName = ITEM_RENAMES[it.itemId] || ITEM_RENAMES[it.name];
                if (newName) { it.name = newName; if (ITEM_RENAMES[it.itemId]) it.itemId = newName; }
                const twin = merged.find(m => m.itemId === it.itemId);
                if (twin && typeof twin.count === 'number' && typeof it.count === 'number') twin.count += it.count;
                else merged.push(it);
            });
            data.inventory = merged;
        }
        if (data.knownIngredientProps && typeof data.knownIngredientProps === 'object') {
            Object.keys(ITEM_RENAMES).forEach(old => {
                if (data.knownIngredientProps[old] && !data.knownIngredientProps[ITEM_RENAMES[old]]) data.knownIngredientProps[ITEM_RENAMES[old]] = data.knownIngredientProps[old];
                delete data.knownIngredientProps[old];
            });
        }
        return data;
    }

    // 7.5: нормализация «совсем старых» сейвов (без version).
    //  • skills объектом ({"0":12,...} или {"Алхимия":12,...}) вместо массива → массив по порядку skillNames, дыры = 10;
    //  • есть inv (старый инвентарь ресурсов-счётчиков), но нет inventory-массива → ставим пустой inventory, а саму
    //    перекладку inv → inventory делает уже существующая миграция в applyCharacterData (window._legacyInvToMigrate).
    function normalizeLegacySave(data) {
        if (data.skills && typeof data.skills === 'object' && !Array.isArray(data.skills)) {
            const arr = new Array(skillNames.length).fill(10);
            Object.keys(data.skills).forEach(k => {
                const idx = /^\d+$/.test(k) ? parseInt(k, 10) : skillNames.indexOf(k);
                const v = parseInt(data.skills[k], 10);
                if (idx >= 0 && idx < arr.length && !isNaN(v)) arr[idx] = v;
            });
            data.skills = arr;
            console.log('Старый сейв: навыки из объекта переведены в массив');
        }
        if (data.inv && typeof data.inv === 'object' && !Array.isArray(data.inventory)) {
            data.inventory = [];
            console.log('Старый сейв: есть inv, нет inventory — старый инвентарь будет перенесён существующей миграцией');
        }
        return data;
    }

    // Защита от порченых сейвов: в массивах-списках оставляем только объекты (null/числа/строки внутри роняли применение
    // сейва целиком), а в словарях рецептов — только записи-объекты. Для здоровых сейвов ничего не меняется.
    function sanitizeSaveShape(data) {
        ['diary', 'inventory', 'playerQuests', 'activeSummons', 'activeTimedEffects', 'craftQueue', 'craftOrders'].forEach(k => {
            if (Array.isArray(data[k]) && data[k].some(x => !x || typeof x !== 'object')) data[k] = data[k].filter(x => x && typeof x === 'object');
        });
        ['knownCookRecipes', 'knownBrewRecipes'].forEach(k => {
            if (data[k] && typeof data[k] === 'object') {
                if (Array.isArray(data[k])) { data[k] = {}; return; }
                Object.keys(data[k]).forEach(r => { if (!data[k][r] || typeof data[k][r] !== 'object') delete data[k][r]; });
            }
        });
        return data;
    }

    function migrateSaveData(data) {
        if (!data) return data;
        data = sanitizeSaveShape(data);
        data = applyItemRenames(data);
        data = migrateLevelScheme(data);
        try { if (data.supernaturalState && data.supernaturalState.lich && window.lichInjectSpells) window.lichInjectSpells(window.lichNormalize(data.supernaturalState.lich)); } catch (e) { }
        // Таблица алхимии сменилась (другие свойства ингредиентов) — один раз сбрасываем изученные свойства и рецепты:
        // старые знания относились к другой таблице. Предметы, зелья и яды в инвентаре остаются.
        const alchVer = window.ALCHEMY_RULES_VERSION || 1;
        if ((data.alchemyRulesVersion || 1) !== alchVer) {
            data.knownIngredientProps = {};
            data.knownBrewRecipes = {};
            data.alchemyRulesVersion = alchVer;
            data.alchemyRulesResetNote = true;
        }
        // 7.5: «совсем старый» формат — поля version нет. Раньше такие сейвы просто считались 3.6 и грузились как есть;
        // теперь сначала приводим то, что раньше хранилось иначе, к современному виду (идемпотентно: у свежих сейвов ничего не меняется).
        if (!data.version) data = normalizeLegacySave(data);
        const fromVersion = data.version || '3.6'; // сейвы совсем без поля version — считаем самыми старыми из известных
        let version = fromVersion;
        let guard = 0;
        while (version !== CURRENT_SAVE_VERSION && SAVE_MIGRATIONS[version] && guard < 20) {
            data = SAVE_MIGRATIONS[version](data);
            version = data.version;
            guard++;
        }
        if (version !== fromVersion) console.log('Сейв обновлён с', fromVersion, 'до', version);
        if (version !== CURRENT_SAVE_VERSION) {
            console.warn(`Сейв версии "${version}" не совпадает с текущей "${CURRENT_SAVE_VERSION}", и миграция для неё не зарегистрирована — загружаем как есть.`);
        }
        return data;
    }

    // 7.1: раньше любая ошибка применения сейва уходила молча в console.warn — игрок видел пустой/полусобранный лист,
    // а следующее автосохранение затирало исходные данные. Теперь: (1) сырой сейв копируется в
    // localStorage['skyrim_bad_save_backup'] ДО любых записей, (2) показывается окно с предложением скачать его файлом.
    // «Скачать» отдаёт именно ПОРЧЕНЫЙ исходник (а не текущее состояние формы — exportCharacterToFile выгрузил бы уже
    // полупримененный лист и потерял бы то, ради чего окно показано).
    let _badSaveShown = false;
    function reportBadSave(err, rawData) {
        console.warn('Сейв не применён:', err);
        let raw = '';
        try { raw = typeof rawData === 'string' ? rawData : JSON.stringify(rawData); } catch (e) { raw = String(rawData); }
        try { localStorage.setItem('skyrim_bad_save_backup', raw); } catch (e) { }
        window.__stBadSaveRaw = raw;
        if (_badSaveShown) return;
        _badSaveShown = true;
        const m = document.createElement('div'); m.id = 'st-badsave-modal'; m.className = 'st-modal open';
        m.innerHTML = '<div class="st-modal-box"><h3 style="margin:0 0 8px;">Сейв не удалось прочитать</h3><div style="font-size:14px;">Ваш сейв несовместим с версией. Хотите сохранить его в файл перед потерей?</div><div style="font-size:12px;opacity:.65;margin-top:6px;">' + escHtml(String(err && err.message || err)) + '</div><div style="display:flex;gap:8px;margin-top:12px;"><button class="btn-success" style="flex:1;" onclick="downloadBadSave()">Скачать</button><button style="flex:1;" onclick="document.getElementById(\'st-badsave-modal\').remove();">Закрыть</button></div></div>';
        document.body.appendChild(m);
    }
    window.downloadBadSave = function () {
        const blob = new Blob([window.__stBadSaveRaw || localStorage.getItem('skyrim_bad_save_backup') || ''], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'skyrim_ttrpg_broken_save_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };
    window.reportBadSave = reportBadSave;

    function applyCharacterData(data) {
        if (!data) return false;
        let rawCopy = null;
        try { rawCopy = JSON.stringify(data); } catch (e) { }
        if (typeof data !== 'object' || Array.isArray(data)) { reportBadSave(new Error('сейв не является объектом'), rawCopy); return false; }
        try { data = migrateSaveData(data); applyGmControlledFields(data); } catch (e) { reportBadSave(e, rawCopy); return false; }
        try {
            document.getElementById('char-name').value = data.name || '';
            document.getElementById('char-race').value = data.race || 'nord';
            { const ov = document.getElementById('char-orc-variant'); if (ov) ov.value = data.orcVariant === 'wild' ? 'wild' : 'city'; }
            document.getElementById('char-sign').value = data.sign || 'none';
            { const ss = document.getElementById('char-sign-stat'); syncSignStatSelect(); if (ss && data.signStat && Array.from(ss.options).some(o => o.value === data.signStat)) ss.value = data.signStat; if (ss) ss.setAttribute('data-saved', ss.value); }
            restoreOriginLock(data);
            // Ручные режимы (макс. ХП/маны, урон, вес, скорость) теперь только автоматические — старые сейвы с галочками сбрасываем.
            ['manual-hp-lock', 'manual-mp-lock', 'manual-dmg-lock', 'manual-weight-lock', 'manual-speed-lock'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = false; });
            gmCmdsApplied = Array.isArray(data.gmCmdsApplied) ? data.gmCmdsApplied.slice(-200) : [];
            playerPets = Array.isArray(data.pets) ? data.pets : [];
            playerRiding = !!data.riding;
            shortRestsUsed = parseInt(data.shortRestsUsed) || 0;
            readSkillBooks = Array.isArray(data.readSkillBooks) ? data.readSkillBooks : [];
            combatMarks = (data.combatMarks && typeof data.combatMarks === 'object') ? data.combatMarks : { attack: null, swap: null };
            sheathSlots = normalizeSheathSlots(data.sheathSlots);
            setTimeout(() => { try { renderPetsPanel(); renderWeaponSwapBox(); } catch (e) { } }, 0);
            // char-level больше не восстанавливается отдельно — его выставит updateAll() из characterLevel
            document.getElementById('char-lives').value = (data.lives === undefined || data.lives === null || data.lives === '') ? 50 : data.lives;
            playerDiary = Array.isArray(data.diary) ? data.diary : []; renderDiary();
            tradesDone = (data.tradesDone && typeof data.tradesDone === 'object') ? data.tradesDone : {}; tradesReady = true;
            marketBought = (data.marketBought && typeof data.marketBought === 'object' && !Array.isArray(data.marketBought)) ? data.marketBought : {};
            restState = (data.restState && typeof data.restState === 'object' && !Array.isArray(data.restState)) ? data.restState : { key: '', n: 0, acts: {} };
            if (typeof renderForageBars === 'function') renderForageBars();
            { const ds = data.deathState || {}; deathState = { fallen: !!ds.fallen, rolled: !!ds.rolled, deaths: ds.deaths || 0, minimized: !!ds.minimized }; renderDeathUi(); }
            // Книга заклинаний теперь едет вместе с персонажем (облако/файл) — раньше жила только в localStorage и пропадала при его очистке.
            if (Array.isArray(data.mapNotes)) { playerMapNotes = data.mapNotes.filter(n => n && n.id && typeof n.x === 'number'); try { renderPlayerNotes(); if (typeof window.renderPlayerMap === 'function') window.renderPlayerMap(true); } catch (e) { /* карта ещё не готова — отрисуется позже */ } }
            if (Array.isArray(data.customSpells)) { restoreCustomSpells(data.customSpells); try { localStorage.setItem('skyrim_custom_spells_v3_5', JSON.stringify(customSpells)); } catch (e) {} }
            // 0 золота — это 0, а не «новый персонаж»: 150 только если поля нет совсем.
            document.getElementById('char-gold').value = (data.gold === undefined || data.gold === null || data.gold === '') ? 150 : (parseInt(data.gold) || 0);
            document.getElementById('food-starve').value = data.starve || 0;
            document.getElementById('faith-god').value = data.faithGod || 'none';
            lastFaithGod = data.faithGod || 'none';
            penanceAllowed = !!data.penanceAllowed;
            document.getElementById('faith-rank').value = data.faithRank || 1;
            document.getElementById('char-backstory').value = data.backstory || '';
            document.getElementById('char-notes').value = data.notes || '';
            document.getElementById('faith-notes').value = data.faithNotes || '';
            document.getElementById('armor-buff').value = data.armorBuff || 0;
            document.getElementById('val-speed').value = data.speed || 35;
            scrollWisdomSpent = data.scrollWisdomSpent || 0;

            // manualWeightLock и locks из старых сейвов не восстанавливаем: ручные режимы сброшены выше (галочки disabled,
            // иначе максимумы застывали навсегда).
            if (data.maxWeightInput !== undefined) {
                document.getElementById('max-weight-input').value = data.maxWeightInput || 50;
            }
            if (data.extraWeight !== undefined) {
                document.getElementById('extra-weight').value = data.extraWeight || 0;
            }

            if (data.stats && data.stats.length === 6) {
                document.getElementById('stat-str').setAttribute('data-raw-stat', data.stats[0]);
                document.getElementById('stat-dex').setAttribute('data-raw-stat', data.stats[1]);
                document.getElementById('stat-con').setAttribute('data-raw-stat', data.stats[2]);
                document.getElementById('stat-int').setAttribute('data-raw-stat', data.stats[3]);
                document.getElementById('stat-wis').setAttribute('data-raw-stat', data.stats[4]);
                document.getElementById('stat-cha').setAttribute('data-raw-stat', data.stats[5]);
            }
            if (data.vitals && data.vitals.length === 4) {
                document.getElementById('cur-hp').value = data.vitals[0];
                document.getElementById('cur-mp').value = data.vitals[1];
                document.getElementById('max-hp').value = data.vitals[2];
                document.getElementById('max-mp').value = data.vitals[3];
            }
            restoreCreationState(data); // после восстановления характеристик: чистый лист старого образца переводится на базу 8
            // Миграция старого инвентаря ресурсов (фиксированные счётчики) в новый общий
            // инвентарь выполняется ниже, после восстановления playerInventory из data.inventory.
            window._legacyInvToMigrate = data.inv || null;
            // Раньше здесь был querySelectorAll('[id^="skill-"]') — он случайно захватывал ещё
            // #skill-progress-list (панель на вкладке «Проверка», тоже начинается с "skill-"),
            // из-за чего sInputs.length (20) никогда не совпадал с data.skills.length (19) и
            // проверка ниже всегда проваливалась — навыки молча не восстанавливались при загрузке.
            // Теперь берём ровно по индексу, как и при сохранении (skill-0 .. skill-N).
            if (Array.isArray(data.skills)) {
                data.skills.forEach((val, i) => {
                    const input = document.getElementById('skill-' + i);
                    if (input) input.setAttribute('data-raw-val', val || 10);
                });
            }
            let karmRefund = 0;
            if (data.perkStates && !(data.perkSchema >= 2)) {
                // 2026-10-24: из ветки «Карманные кражи» убран «Карманник» (его нет в таблице талантов) — «Дезориентация» сдвинулась
                // с 7-го места на 6-е; взятый «Карманник» возвращает очко перков.
                const ps = Object.assign({}, data.perkStates);
                if (ps['skill8-perk6-step1']) karmRefund = 1;
                ps['skill8-perk6-step1'] = !!ps['skill8-perk7-step1'];
                delete ps['skill8-perk7-step1'];
                data.perkStates = ps;
            }
            if (data.perkStates) {
                _allPerkCheckboxes.forEach(chk => {
                    let key = `skill${chk.dataset.skillidx}-perk${chk.dataset.perkidx}-step${chk.dataset.step}`;
                    if (data.perkStates.hasOwnProperty(key)) {
                        chk.checked = data.perkStates[key];
                    }
                });
            }
            document.getElementById('wep-melee-name').value = data.wepMName || '';
            document.getElementById('wep-melee-dmg').value = data.wepMDmg || 2;
            document.getElementById('wep-melee-type').value = data.wepMType || 'unarmed';
            document.getElementById('wep-melee-offhand-name').value = data.wepMOffhandName || '';
            document.getElementById('wep-melee-offhand-dmg').value = data.wepMOffhandDmg || 0;
            document.getElementById('chk-dual-wield').checked = !!data.chkDualWield;
            document.getElementById('chk-sprint-attack').checked = !!data.chkSprintAttack;
            document.getElementById('chk-frost-region').checked = !!data.chkFrostRegion;
            document.getElementById('chk-sneak-attack').checked = !!data.chkSneakAttack;
            document.getElementById('chk-bow-drawn').checked = !!data.chkBowDrawn;
            counterHits = (data.counterHits && typeof data.counterHits === 'object') ? data.counterHits : {};
            document.getElementById('chk-defensive-stance').checked = !!data.chkDefensiveStance;
            keeperBarrierLeft = typeof data.keeperBarrierLeft === 'number' ? data.keeperBarrierLeft : KEEPER_BARRIER_MAX;
            document.getElementById('wep-ranged-name').value = data.wepRName || '';
            document.getElementById('wep-ranged-dmg').value = data.wepRDmg || 10;
            document.getElementById('wep-ranged-type').value = data.wepRType || 'bow';
            document.getElementById('ammo-name').value = data.amName || '';
            document.getElementById('ammo-dmg').value = data.amDmg || 0;
            document.getElementById('active-combat-weapon').value = data.activeWep || 'melee';
            document.getElementById('eq-armor').value = data.armorClass || 'cloth';
            document.getElementById('slot-helm-name').value = data.sHelm || '';
            document.getElementById('slot-helm-armor').value = data.sHelmA || 0;
            document.getElementById('slot-chest-name').value = data.sChest || '';
            document.getElementById('slot-chest-armor').value = data.sChestA || 0;
            document.getElementById('slot-robe-name').value = data.sRobe || '';
            document.getElementById('slot-robe-armor').value = data.sRobeA || 0;
            document.getElementById('slot-gloves-name').value = data.sGloves || '';
            document.getElementById('slot-gloves-armor').value = data.sGlovesA || 0;
            document.getElementById('slot-boots-name').value = data.sBoots || '';
            document.getElementById('slot-boots-armor').value = data.sBootsA || 0;
            document.getElementById('slot-shield-name').value = data.sShield || '';
            document.getElementById('slot-shield-armor').value = data.sShieldA || 0;
            document.getElementById('slot-ring-name').value = data.sRing || '';
            document.getElementById('slot-neck-name').value = data.sNeck || '';
            document.getElementById('slot-circlet-name').value = data.sCirclet || '';

            pouchContents = Array.isArray(data.pouchContents) ? data.pouchContents : [];
            activeTimedEffects = Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : [];
            // JSON превращает Infinity в null: «бессрочные» эффекты (болезни, поддерживаемые заклинания, «хриплый голос
            // до конца дня») после перезагрузки теряли срок и пропадали на первом же ходу. Возвращаем бесконечность.
            activeTimedEffects.forEach(e => { if (e && (e.turnsRemaining === null || e.turnsRemaining === undefined)) e.turnsRemaining = Infinity; });
            gameTurn = parseInt(data.gameTurn) || 0;
            gameRound = parseInt(data.gameRound) || 0;
            sessionTurnSync = (data.turnSync && typeof data.turnSync === 'object' && typeof data.turnSync.code === 'string') ? { code: data.turnSync.code, tick: parseInt(data.turnSync.tick) || 0 } : { code: '', tick: 0 };
            gameYear = parseInt(data.gameYear) || 201;
            gameMonth = parseInt(data.gameMonth);
            if (isNaN(gameMonth)) gameMonth = 6;
            gameDayNum = parseInt(data.gameDayNum) || 10;
            daysWithoutFood = parseInt(data.daysWithoutFood) || 0;
            updateDateDisplay();
            renderActiveEffects();
            updateTurnRoundDisplay();

            characterLevel = parseInt(data.characterLevel) || 1;
            levelUpProgress = parseInt(data.levelUpProgress) || 0;
            perkPointsAvailable = (parseInt(data.perkPointsAvailable) || 0) + karmRefund;
            if (karmRefund) setTimeout(() => alert('Перк «Карманник» убран из игры (его нет в таблице талантов) — очко перков возвращено.'), 300);
            if (data.levelSchemeNote) {
                const n = data.levelSchemeNote; delete data.levelSchemeNote;
                const msg = n.to > n.from
                    ? `Шкала уровней изменилась: максимум теперь ${MAX_CHARACTER_LEVEL}. По накопленным очкам навыков вам положен ${n.to}-й уровень вместо ${n.from}-го — на вкладке «Проверка» нажмите «Применить уровень» ${n.to - n.from} раз(а): каждый раз +1 к характеристике на выбор и +1 очко перка.`
                    : `Шкала уровней изменилась: максимум теперь ${MAX_CHARACTER_LEVEL}. Уровень пересчитан: ${n.from} → ${n.to}, лишние очки перков сняты` + (n.removed && n.removed.length ? `, сняты перки: ${n.removed.join(', ')}` : '') + '. Характеристики, полученные за снятые уровни, остались — их поправит мастер.';
                setTimeout(() => { alert(msg); saveLocalStorage(); }, 400);
            }
            skillProgress = (data.skillProgress && typeof data.skillProgress === 'object') ? data.skillProgress : {};
            playerQuests = Array.isArray(data.playerQuests) ? data.playerQuests : [];
            activeSummons = Array.isArray(data.activeSummons) ? data.activeSummons : [];
            renderActiveSummonsList();
            renderQuestList();

            playerInventory = Array.isArray(data.inventory) ? data.inventory : [];
            playerInventory.forEach(enrichItemFromDb);
            healInventoryIds(playerInventory);

            // Миграция старого инвентаря ресурсов (фиксированные счётчики) в новый общий —
            // чтобы у тех, кто сохранялся раньше, ресурсы не потерялись.
            if (window._legacyInvToMigrate) {
                const legacyMap = {
                    'hide-bear': { name: 'Шкура медведя', weight: 3, price: 50, category: 'Шкуры' },
                    'hide-sable': { name: 'Шкура саблезуба', weight: 2, price: 25, category: 'Шкуры' },
                    'hide-wolf': { name: 'Волчья шкура', weight: 1, price: 10, category: 'Шкуры' },
                    'leather': { name: 'Кожа', weight: 2, price: 10, category: 'Кузнечные ингредиенты' },
                    'leather-strips': { name: 'Полоски кожи', weight: 0.1, price: 3, category: 'Кузнечные ингредиенты' },
                    'ing-iron': { name: 'Железный слиток', weight: 1, price: 7, category: 'Кузнечные ингредиенты' },
                    'ing-steel': { name: 'Стальной слиток', weight: 1, price: 29, category: 'Кузнечные ингредиенты' },
                    'ing-corundum': { name: 'Корундовый слиток', weight: 1, price: 40, category: 'Кузнечные ингредиенты' },
                    'ing-orichalcum': { name: 'Орихалковый слиток', weight: 1, price: 45, category: 'Кузнечные ингредиенты' },
                    'ing-ebony': { name: 'Эбонитовый слиток', weight: 1, price: 150, category: 'Кузнечные ингредиенты' },
                    'gem-petty': { name: 'Крохотный камень душ', weight: 1, price: 10, category: 'Камни душ' },
                    'gem-grand': { name: 'Великий камень душ', weight: 1, price: 200, category: 'Камни душ' },
                    'dw-beam': { name: 'Двемерская балка', weight: 20, price: 15, category: 'Двемерские детали' },
                    'dw-gear': { name: 'Двемерская шестерня', weight: 10, price: 5, category: 'Двемерские детали' },
                    'dw-core': { name: 'Сердечник центуриона', weight: 4, price: 131, category: 'Двемерские детали' },
                    'tent': { name: 'Палатка (15x15 футов)', weight: 10, price: 300, category: 'Походное снаряжение' },
                    'bag': { name: 'Спальный мешок', weight: 3, price: 75, category: 'Походное снаряжение' }
                };
                Object.keys(legacyMap).forEach(key => {
                    const qty = parseInt(window._legacyInvToMigrate[key]) || 0;
                    if (qty > 0) {
                        const info = legacyMap[key];
                        const already = playerInventory.find(i => i.itemId === info.name);
                        if (already) already.count = (already.count || 0) + qty;   // раньше старое количество терялось, если вещь уже была в новом инвентаре
                        else playerInventory.push({ itemId: info.name, name: info.name, count: qty, weight: info.weight, category: info.category, effect: '' });
                    }
                });
                window._legacyInvToMigrate = null;
            }
            // Полный список слотов — раньше тут не было backpack и ammo: сейв, созданный до их
            // появления, терял эти ключи при загрузке, и следующее сохранение их уже не писало.
            equippedSlots = Object.assign({}, FULL_EQUIPPED_SLOTS, (data.equippedSlots && typeof data.equippedSlots === 'object') ? data.equippedSlots : {});
            Object.keys(equippedSlots).forEach(k => { if (equippedSlots[k] && healedIdMap[equippedSlots[k]]) equippedSlots[k] = healedIdMap[equippedSlots[k]]; });
            craftQueue = Array.isArray(data.craftQueue) ? data.craftQueue : [];
            craftOrders = Array.isArray(data.craftOrders) ? data.craftOrders : [];
            playerPortrait = typeof data.portrait === 'string' ? data.portrait : '';
            playerPortraitThumb = typeof data.portraitThumb === 'string' ? data.portraitThumb : '';
            setTimeout(() => { renderCraftQueue(); renderCraftOrders(); renderPortrait(); }, 0);
            equipmentSets = Array.isArray(data.equipmentSets) ? data.equipmentSets.filter(s => s && s.slots).slice(0, 5) : [];
            setTimeout(() => { unequipVanishedItems(); }, 0); // после того, как поля слотов заполнены из сейва
            renderInventoryList();
            renderKitchenPot();
            renderEquipPanel();
            renderStaffList();
            renderWeaponChargeSelect();
            renderTemperSelect();
            renderMagicStaffSpellSelect();
            renderMagicStaffList();
            renderEnchantItemSelect();
            if (equippedSlots.pouch) {
                const pouchItem = playerInventory.find(i => i.itemId === equippedSlots.pouch);
                document.getElementById('slot-pouch-name').value = pouchItem ? pouchItem.name : '';
            }
            if (equippedSlots.backpack) {
                const backpackItem = playerInventory.find(i => i.itemId === equippedSlots.backpack);
                document.getElementById('slot-backpack-name').value = backpackItem ? (backpackItem.name + (typeof backpackItem.carryBonus === 'number' ? ` (+${backpackItem.carryBonus} к грузоподъёмности)` : '')) : '';
            }
            renderPouchPanel();

            knownIngredientProps = (data.knownIngredientProps && typeof data.knownIngredientProps === 'object') ? data.knownIngredientProps : {};
            mageSignFreeUsed = !!data.mageSignFreeUsed;
            godDay = (data.godDay && typeof data.godDay === 'object') ? { light: parseInt(data.godDay.light) || 0, heavy: parseInt(data.godDay.heavy) || 0 } : { light: 0, heavy: 0 };
            weaponPoison = (data.weaponPoison && Array.isArray(data.weaponPoison.effects)) ? data.weaponPoison : null;
            renderWeaponPoisonStatus();
            apprenticeVuln = (data.apprenticeVuln && APPRENTICE_VULN_TYPES[data.apprenticeVuln]) ? data.apprenticeVuln : null;
            if (data.sign === 'apprentice' && !apprenticeVuln) rollApprenticeVuln();
            powersUsedToday = (data.powersUsedToday && typeof data.powersUsedToday === 'object') ? data.powersUsedToday : {};
            companionRewards = (data.companionRewards && typeof data.companionRewards === 'object') ? data.companionRewards : {};
            soulEaterKills = parseInt(data.soulEaterKills) || 0;
            trainState = (data.trainState && typeof data.trainState === 'object') ? Object.assign({ thief: {}, comp: -1, mageLib: -1, mageLesson: -1, mageLessons: {}, mageStudy: null, mageStudyLast: -99 }, data.trainState) : { thief: {}, comp: -1, mageLib: -1, mageLesson: -1, mageLessons: {}, mageStudy: null, mageStudyLast: -99 };
            if (!trainState.thief || typeof trainState.thief !== 'object') trainState.thief = {};
            bardSongs = (Array.isArray(data.bardSongs) ? data.bardSongs : []).filter(x => x && typeof x.title === 'string').slice(0, 50)
                .map(x => ({ id: String(x.id || ('song-' + Math.random().toString(36).slice(2, 8))), title: x.title.slice(0, 60), text: String(x.text || '').slice(0, 2000) }));
            if (typeof renderBardSection === 'function') renderBardSection();
            knownCookRecipes = (data.knownCookRecipes && typeof data.knownCookRecipes === 'object') ? data.knownCookRecipes : {};
            knownBrewRecipes = (data.knownBrewRecipes && typeof data.knownBrewRecipes === 'object') ? data.knownBrewRecipes : {};
            if (typeof renderKnownRecipes === 'function') renderKnownRecipes();
            const rulesNoteEl = document.getElementById('alch-rules-note');
            if (rulesNoteEl) rulesNoteEl.style.display = data.alchemyRulesResetNote ? 'block' : 'none'; try { renderStaffEffectSelect(); } catch (e) { }
            knownEnchantments = Array.isArray(data.knownEnchantments) ? data.knownEnchantments : [];
            renderAlchEatSelect();
            renderAlchIngredientSelects();
            renderKnownIngredients();
            renderSellList();

            // Рецепты кузницы открывает только мастер (gm.html) — здесь только читаем, не сохраняем обратно
            knownSmithingRecipes = Array.isArray(data.knownSmithingRecipes) ? data.knownSmithingRecipes : [];
            renderSmithingList();

            // Лич: положенные заклинания ветки — в книгу (после того, как карточки заклинаний восстановлены), вера — Идеальные Повелители.
            try { _lichSig = ''; lichAfterStateChange(); } catch (e) { console.error('Лич:', e); }
            // Пересчитываем все производные значения (HP/MP/броня/вес/панель прокачки и т.д.)
            // заново с уже восстановленными данными — раньше это могло остаться на дефолтных
            // значениях, если персонаж подгружался асинхронно из облака.
            updateAll();
            renderLevelPanel(); // уровень/очки перков восстановлены выше — панель «Прокачка» иначе показывала значения до загрузки
            return true;
        } catch(e) {
            console.warn('Ошибка применения данных персонажа:', e);
            reportBadSave(e, rawCopy);
            return false;
        }
    }
    window.applyCharacterData = applyCharacterData;

    // Загрузка сохранения
    function loadLocalStorage() {
        let saved = localStorage.getItem('skyrim_ttrpg_save_v3_6');
        let savedSpells = localStorage.getItem('skyrim_custom_spells_v3_5');

        if (savedSpells) {
            try {
                restoreCustomSpells(JSON.parse(savedSpells));
            } catch(e) { console.warn('Книга заклинаний не прочитана:', e); }
        }

        if (!saved) {
            // Онбординг для первого запуска — localStorage пуст, но у залогиненного игрока
            // данные МОГЛИ БЫ прийти из облака чуть позже (асинхронно). Поэтому не показываем
            // сразу — ждём короткую паузу и проверяем, заполнилось ли имя персонажа тем временем
            // (облачной загрузкой); если нет — это действительно новый игрок.
            if (!localStorage.getItem('skyrim_onboarding_dismissed')) {
                setTimeout(() => {
                    const nameEl = document.getElementById('char-name');
                    // У поля есть значение по умолчанию («Довакин»): имя «не заполнено», пока оно осталось дефолтным
                    // (облачная загрузка успела бы подставить другое имя за эту паузу).
                    if (nameEl && (!nameEl.value || nameEl.value === nameEl.defaultValue)) {
                        const banner = document.getElementById('onboarding-banner');
                        if (banner) banner.style.display = 'block';
                    }
                }, 1200);
            }
            return;
        }
        try {
            let data = JSON.parse(saved);
            applyCharacterData(data);
        } catch(e) {
            console.warn('Ошибка загрузки сохранения:', e);
            reportBadSave(e, saved); // 7.1: битый JSON — тоже не молча
        }
    }

    window.dismissOnboarding = function () {
        localStorage.setItem('skyrim_onboarding_dismissed', '1');
        const banner = document.getElementById('onboarding-banner');
        if (banner) banner.style.display = 'none';
    };

    // Экспорт/импорт персонажа в файл — на случай отвала Firebase или потери доступа к аккаунту.
    // Переиспользует существующую saveLocalStorage(true) вместо дублирования построения объекта
    // data заново (там ~100 полей) — сохраняем немедленно, потом читаем тот же JSON обратно из
    // localStorage и отдаём файлом. Ноль риска сломать рабочее сохранение.
    // 7.4: единый формат файла { character, spells, version }. Раньше файл был «плоским» сейвом с customSpells внутри,
    // а Drive и файл собирали его каждый по-своему. Теперь одна сборка на всех (файл, Drive, снапшоты 7.3).
    // Читается и новый формат, и старый плоский (importCharacterFromText).
    window.exportFullCharacter = function () {
        saveLocalStorage(true);
        const json = localStorage.getItem('skyrim_ttrpg_save_v3_6');
        if (!json) return null;
        const character = JSON.parse(json);
        let spells = [];
        try { const raw = localStorage.getItem('skyrim_custom_spells_v3_5'); if (raw) spells = JSON.parse(raw); } catch (e) { console.warn('Экспорт заклинаний:', e); }
        if (!Array.isArray(spells) || !spells.length) spells = Array.isArray(customSpells) ? customSpells : [];
        return { character: character, spells: spells, version: window.SKYRIM_SAVE_VERSION || '3.7' };
    };
    window.exportCharacterToFile = function () {
        const full = window.exportFullCharacter();
        if (!full) { alert('Нечего экспортировать — сначала заполни лист персонажа.'); return; }
        const name = (document.getElementById('char-name').value || 'character').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, '_');
        const blob = new Blob([JSON.stringify(full)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skyrim_ttrpg_${name}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    window.importCharacterFromFile = function (input) {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!confirm('Загрузить персонажа из файла? Это заменит текущие данные на листе.')) { input.value = ''; return; }
        const reader = new FileReader();
        reader.onload = function (e) { importCharacterFromText(e.target.result, 'файла'); input.value = ''; };
        reader.readAsText(file);
    };
    // Общая часть импорта (файл и Google Drive): раньше была внутри FileReader.onload, вынесена, чтобы Drive не дублировал её.
    function importCharacterFromText(text, source) {
        let data;
        try { data = JSON.parse(text); } catch (err) { reportBadSave(err, text); alert('Не удалось прочитать данные: ' + err.message); return; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { reportBadSave(new Error('в файле не персонаж'), text); return; }
        // 7.4: два формата. Новый: { character, spells, version }. Старый: плоский сейв (с customSpells внутри или без них).
        let spells = null;
        if (data.character && typeof data.character === 'object' && !Array.isArray(data.character)) {
            spells = Array.isArray(data.spells) ? data.spells : (Array.isArray(data.character.customSpells) ? data.character.customSpells : null);
            data = data.character;
        } else if (Array.isArray(data.customSpells)) {
            spells = data.customSpells;
        }
        delete data.customSpells;
        // 7.1: прежнее состояние лежит в резервной копии на случай, если импорт окажется порченым
        try { const prev = localStorage.getItem('skyrim_ttrpg_save_v3_6'); if (prev) localStorage.setItem('skyrim_prev_save_backup', prev); } catch (e) { }
        let spellsRestored = false;
        // раньше заклинания писались только в localStorage, а в памяти оставались старые — updateAll() успевал перезаписать ими файл до перезагрузки
        if (spells) { try { restoreCustomSpells(spells); } catch (e) { console.warn('restoreCustomSpells:', e); } localStorage.setItem('skyrim_custom_spells_v3_5', JSON.stringify(spells)); spellsRestored = true; }
        localStorage.setItem('skyrim_ttrpg_save_v3_6', JSON.stringify(data));
        const okApply = (typeof applyCharacterData === 'function') ? applyCharacterData(data) : true;
        if (okApply === false) return; // окно «сейв не прочитан» уже показано
        if (typeof updateAll === 'function') updateAll();
        saveLocalStorage(true);
        alert('Персонаж загружен из ' + source + '.');
        if (spellsRestored) location.reload(); // кастомные заклинания читаются при старте страницы
    }
    window.importCharacterFromText = importCharacterFromText;

    // ========================================================================
    // GOOGLE DRIVE (эпик 3.11): копия персонажа в Drive через REST, без внешних скриптов.
    // Нужен вход через Google (токен drive.file живёт только в памяти страницы). Любая ошибка — сообщение, локальный экспорт в файл остаётся основным.
    // ========================================================================
    function driveToken() {
        if (window.__driveToken) return window.__driveToken;
        alert('Для Google Drive войди через Google (кнопка «Войти через Google» при входе в аккаунт) — токен доступа хранится только пока открыта страница. Если не получается, используй «Скачать в файл».');
        return null;
    }
    function driveFail(resp) {
        if (resp.status === 401 || resp.status === 403) { window.__driveToken = null; alert('Доступ к Drive истёк или не выдан — войди через Google заново.'); }
        else alert('Drive вернул ошибку ' + resp.status + '.');
    }
    window.driveSaveCharacter = function () {
        const tok = driveToken(); if (!tok) return;
        const full = window.exportFullCharacter();
        if (!full) { alert('Нечего сохранять.'); return; }
        const out = JSON.stringify(full); // 7.4: тот же формат, что и файл
        const name = (document.getElementById('char-name').value || 'character').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, '_');
        const meta = { name: 'skyrim_ttrpg_' + name + '_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json', mimeType: 'application/json' };
        const boundary = 'stbound' + Date.now();
        const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + out + '\r\n--' + boundary + '--';
        fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + boundary }, body })
            .then(r => { if (!r.ok) { driveFail(r); return; } alertDriveDone('Сохранено в Drive: ' + meta.name); })
            .catch(e => alert('Не удалось связаться с Drive: ' + e.message));
    };
    function alertDriveDone(msg) { if (typeof alchToast === 'function') alchToast('📁 ' + msg); else alert(msg); }
    window.driveListCharacters = function () {
        const tok = driveToken(); if (!tok) return;
        const q = encodeURIComponent("name contains 'skyrim_ttrpg_' and trashed=false");
        fetch('https://www.googleapis.com/drive/v3/files?pageSize=20&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)&q=' + q, { headers: { Authorization: 'Bearer ' + tok } })
            .then(r => { if (!r.ok) { driveFail(r); return null; } return r.json(); })
            .then(j => {
                if (!j) return;
                const box = document.getElementById('drive-files-list'); if (!box) return;
                box.innerHTML = (j.files || []).length ? j.files.map(f => `<div class="stat-block" style="align-items:center;"><span style="font-size:13px;">${escHtml(f.name)} <span style="opacity:.6;">${escHtml((f.modifiedTime || '').slice(0, 16).replace('T', ' '))}</span></span><button type="button" style="width:auto; padding:2px 8px; font-size:13px;" onclick="driveRestoreCharacter('${jsq(f.id)}')">Загрузить</button></div>`).join('') : '<span style="opacity:.6; font-size:13px;">В Drive нет сохранений skyrim_ttrpg_*.</span>';
            }).catch(e => alert('Не удалось связаться с Drive: ' + e.message));
    };
    window.driveRestoreCharacter = function (id) {
        const tok = driveToken(); if (!tok) return;
        if (!confirm('Загрузить персонажа из Drive? Это заменит текущие данные на листе.')) return;
        fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', { headers: { Authorization: 'Bearer ' + tok } })
            .then(r => { if (!r.ok) { driveFail(r); return null; } return r.text(); })
            .then(t => { if (t) importCharacterFromText(t, 'Google Drive'); })
            .catch(e => alert('Не удалось связаться с Drive: ' + e.message));
    };

    // ========================================================================
    // 7.3: автоснапшот раз в час. Раньше единственная копия — текущий сейв; испорченная правка или случайный сброс
    // убивали всё. Теперь раз в час (и один раз при старте, если последнему больше часа) кладём полный экспорт в
    // localStorage['skyrim_ttrpg_snapshot_<ts>'], держим последние 5. Если localStorage переполнен — выбрасываем самый
    // старый и пробуем ещё раз.
    const SNAP_PREFIX = 'skyrim_ttrpg_snapshot_', SNAP_KEEP = 5, SNAP_EVERY = 3600000;
    function snapKeys() {
        const ks = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(SNAP_PREFIX) === 0) ks.push(k); }
        return ks.sort((a, b) => parseInt(b.slice(SNAP_PREFIX.length), 10) - parseInt(a.slice(SNAP_PREFIX.length), 10)); // новые первыми
    }
    window.stTakeSnapshot = function (force) {
        try {
            const keys = snapKeys();
            const lastTs = keys.length ? parseInt(keys[0].slice(SNAP_PREFIX.length), 10) : 0;
            if (!force && Date.now() - lastTs < SNAP_EVERY - 60000) return false;
            const full = window.exportFullCharacter(); if (!full) return false;
            const json = JSON.stringify(full);
            if (keys.length && localStorage.getItem(keys[0]) === json) return false; // ничего не изменилось
            const key = SNAP_PREFIX + Date.now();
            try { localStorage.setItem(key, json); }
            catch (e) { const old = snapKeys(); if (old.length) localStorage.removeItem(old[old.length - 1]); localStorage.setItem(key, json); }
            snapKeys().slice(SNAP_KEEP).forEach(k => localStorage.removeItem(k));
            return true;
        } catch (e) { console.warn('Снапшот не сделан:', e); return false; }
    };
    setInterval(() => window.stTakeSnapshot(false), SNAP_EVERY);
    setTimeout(() => window.stTakeSnapshot(false), 5000);
    window.stToggleSnapshots = function () {
        const box = document.getElementById('st-snapshot-list'); if (!box) return;
        if (box.style.display !== 'none') { box.style.display = 'none'; return; }
        const keys = snapKeys();
        box.innerHTML = keys.length ? keys.map(k => {
            const ts = parseInt(k.slice(SNAP_PREFIX.length), 10);
            let nm = ''; try { const o = JSON.parse(localStorage.getItem(k)); nm = (o.character && o.character.name) || ''; } catch (e) { }
            return `<div class="stat-block st-snap-row" style="align-items:center;"><span style="font-size:13px;">${new Date(ts).toLocaleString('ru-RU')} ${nm ? '· ' + escHtml(nm) : ''}</span><button type="button" style="width:auto; padding:2px 8px; font-size:13px;" onclick="stRestoreSnapshot('${k}')">Загрузить</button></div>`;
        }).join('') : '<span style="opacity:.6; font-size:13px;">Снапшотов пока нет — первый появится в течение часа.</span>';
        box.style.display = 'block';
    };
    window.stRestoreSnapshot = function (key) {
        if (!confirm('Загрузить персонажа из снапшота? Это заменит текущие данные на листе.')) return;
        const text = localStorage.getItem(key); if (!text) return;
        window.stTakeSnapshot(true); // перед заменой кладём в снапшоты и текущее состояние — чтобы откат был откатываем
        importCharacterFromText(text, 'снапшота');
    };

    // Полный сброс
    function resetData() {
        if (confirm("Вы уверены, что хотите полностью стереть все сохраненные данные? Это удалит инвентарь, перки, блокнот и кастомные заклинания!")) {
            localStorage.removeItem('skyrim_ttrpg_save_v3_6');
            localStorage.removeItem('skyrim_custom_spells_v3_5');
            localStorage.removeItem('skyrim_onboarding_dismissed');
            // Раньше тут чистился только localStorage — облачный документ оставался цел, и после
            // reload() Firebase-авторизация (переживает перезагрузку) сразу подтягивала старые
            // данные обратно поверх пустого localStorage. Теперь чистим и облако тоже (если есть
            // подключение), ЖДЁМ завершения записи, и только потом перезагружаем страницу.
            if (window.CloudSync && typeof window.CloudSync.resetCloudCharacter === 'function') {
                window.CloudSync.resetCloudCharacter().then(() => location.reload()).catch(() => location.reload());
            } else {
                location.reload();
            }
        }
    }

    // Первичный запуск
    initSkills();
    // Если страница открылась СРАЗУ на вкладке "Профессии" (например, из сохранённого
    // состояния вкладок — сейчас такого нет, но на всякий случай) — инициализируем её тоже,
    // иначе рендеры ниже (убраны отсюда — теперь в initTab7IfNeeded(), вызывается из openTab)
    // не выполнились бы, пока пользователь явно не кликнет по вкладке снова.
    if (document.getElementById('tab7') && document.getElementById('tab7').classList.contains('active')) {
        initTab7IfNeeded();
    }
    updateDateDisplay();
    loadLocalStorage();
    updateAll();
    renderInventoryList();
    // Кухня/кузница/посохи/зачарование/алхимия — убраны отсюда, теперь лениво через
    // initTab7IfNeeded() при первом открытии вкладки "Профессии" (задача 14).
    renderQuestList();
    renderSummonTemplateSelect();
    renderActiveSummonsList();
    initProfessionAccordion();
    renderEquipPanel();
    renderScrollSpellSelect();
    renderSellList();
    renderPouchPanel();
    renderActiveEffects();
    updateTurnRoundDisplay();
    renderDiceSkillSelect();
    updateLockInfo();
    renderLevelPanel();
    renderAttackActionSelect();
    if (typeof window.renderAttackTargetSelect === 'function') window.renderAttackTargetSelect();
    renderTradeSelects();
    renderBuyList();
    if (typeof renderGroupCheckPlayerPanel === 'function') renderGroupCheckPlayerPanel();
    if (typeof renderHelpAllySelect === 'function') renderHelpAllySelect();

    // Тюрьма: игроку доступны только короткий и длительный отдых («Следующий день»). Остальные действия
    // (торговля, крафт, бой и колдовство, кражи, сбор, обучение, еда — кормят в тюрьме) блокируются здесь, одним списком.
    // Колдовство из любых мест закрывает ещё и castBlockReason.
    (function () {
        const JAIL_BLOCKED = ['acceptTrade', 'sendTradeOffer', 'tradeItemToPlayer', 'rollPlayerAttack', 'previewPlayerAttack', 'dockAttack', 'dockAttackMarked',
            'dockCastSpell', 'dockUseItem', 'attemptLockpick', 'attemptTheft', 'bardPerform', 'bardInspire', 'toggleBardBallad', 'brewPotion', 'queueBrew',
            'buyFromMerchant', 'buyPet', 'sellItem', 'investInMerchant', 'cookFood', 'castEquilibrium', 'castKnockSpell', 'chargeWeapon', 'craftScrollInSheet',
            'craftSmithingItem', 'createMagicStaff', 'createStaff', 'deliverCraftOrder', 'deployCampSite', 'disenchantItem', 'disenchantSelected', 'drinkFromPouch',
            'eatAnyFood', 'eatIngredient', 'enchantItem', 'gatherIngredients', 'goFishing', 'goHunting', 'helpAlly', 'improveItem', 'learnSpellFromTome',
            'mageExtraLesson', 'mageHelpLibrarian', 'mageStartStudy', 'collectThiefApprentice', 'trainCompanions', 'trainThief', 'partyStashGold', 'partyStashPut',
            'partyStashTake', 'playerEatCorpse', 'playerLootCorpse', 'playerSearchContainer', 'playerTransformWerewolf', 'playerToggleLordForm', 'playerVampireDrink',
            'readSkillBook', 'rechargeMagicStaff', 'rechargeStaff', 'rollDiceCheck', 'rollForage', 'sharpenWeapon', 'smeltItem', 'summonCreature', 'temperItem',
            'useArtifactItem', 'useInventoryItem', 'useLimitedItem', 'useMagicStaff', 'usePower', 'useScrollFromPouch', 'useScrollItem', 'takeChestGold', 'lootPet',
            'applyPoisonToWeapon', 'applyPoisonFromPouch', 'donateToBardMuseum'];
        JAIL_BLOCKED.forEach(name => {
            const fn = window[name];
            if (typeof fn !== 'function') return;
            window[name] = function () {
                if (inJailNow()) { alert(JAIL_BLOCK_TEXT); return; }
                return fn.apply(this, arguments);
            };
        });
    })();
