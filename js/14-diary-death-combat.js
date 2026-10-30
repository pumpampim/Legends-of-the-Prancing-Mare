
    // ===== ДНЕВНИК ИГРОКА (личные записи) =====
    // Общий журнал сессии (сводка, слухи, записи партии) рисуется из cloud.js; здесь — личные заметки,
    // они сохраняются вместе с персонажем (поле diary) и уходят в облако/файл экспорта.
    let playerDiary = []; // [{ id, ts, title, text, pinned }]
    function _diaryEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    window.addDiaryEntry = function () {
        const t = document.getElementById('diary-new-title'), x = document.getElementById('diary-new-text');
        const title = (t.value || '').trim(), text = (x.value || '').trim();
        if (!title && !text) return;
        playerDiary.unshift({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), title: title, text: text, pinned: false });
        t.value = ''; x.value = '';
        renderDiary(); saveLocalStorage();
    };
    // Эпик 4.4. Мастер сдвинул партию → у каждого игрока в личном дневнике появляется запись «📍 Прибыли в …».
    // Сравниваем с последней известной позицией (localStorage, по коду сессии); первый снимок после входа только запоминаем — старые прибытия не дублируем.
    window.onPartyPosChanged = function (pos, code) {
        if (!pos || !code) return;
        const sig = [pos.name || '', pos.hold || '', Math.round(pos.x || 0), Math.round(pos.y || 0)].join('|');
        const key = 'lastKnownPartyPos:' + code;
        let prev = null; try { prev = localStorage.getItem(key); } catch (e) { }
        try { localStorage.setItem(key, sig); } catch (e) { }
        if (prev === null || prev === sig) return;
        const date = gameDayNum + ' ' + MONTH_NAMES[gameMonth] + ', 4Э ' + gameYear;
        const place = (pos.name || 'новое место') + (pos.hold ? ', ' + pos.hold : '');
        playerDiary.unshift({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), title: '📍 Прибыли в ' + (pos.name || pos.hold || 'новое место'), text: '[' + date + '] Прибыли в ' + place + '.', pinned: false, auto: 'travel' });
        renderDiary(); saveLocalStorage();
    };
    // Слух уже записан? Старые записи без rumorId узнаём по тексту.
    window.isRumorInDiary = function (r) {
        if (!r) return false;
        return playerDiary.some(d => (r.id && d.rumorId === r.id) || (d.title || '').indexOf('🗣 Слух') === 0 && d.text === (r.text || ''));
    };
    window.addRumorDiaryEntry = function (r) {
        // Раньше запись молча добавлялась в «Мои записи» внизу вкладки, а подсказка мигала на скрытой кнопке вкладки —
        // казалось, что кнопка не работает, и повторные нажатия плодили дубли.
        if (window.isRumorInDiary(r)) { alchToast('📌 Этот слух уже в «Моих записях».'); return false; }
        playerDiary.unshift({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), title: '🗣 Слух' + (r.hold ? ' · ' + r.hold : ''), text: r.text || '', pinned: false, rumorId: r.id || '' });
        renderDiary(); saveLocalStorage();
        alchToast('📌 Слух записан в «Мои записи» (внизу вкладки «Дневник»).');
        return true;
    };
    window.deleteDiaryEntry = function (id) {
        const e = playerDiary.find(d => d.id === id);
        if (!e || !confirm('Удалить запись' + (e.title ? ' «' + e.title + '»' : '') + '?')) return;
        playerDiary = playerDiary.filter(d => d.id !== id);
        renderDiary(); saveLocalStorage();
        if (e.rumorId && typeof window.refreshJournalView === 'function') window.refreshJournalView();
    };
    window.toggleDiaryPin = function (id) {
        const e = playerDiary.find(d => d.id === id); if (!e) return;
        e.pinned = !e.pinned; renderDiary(); saveLocalStorage();
    };
    window.editDiaryEntry = function (id, field, value) {
        const e = playerDiary.find(d => d.id === id); if (!e) return;
        e[field] = value; saveLocalStorage();
    };
    window.renderDiary = function () {
        const box = document.getElementById('diary-list'); if (!box) return;
        const q = ((document.getElementById('diary-search') || {}).value || '').trim().toLowerCase();
        const list = playerDiary.filter(d => !q || (d.title + ' ' + d.text).toLowerCase().includes(q))
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
        if (!list.length) { box.innerHTML = '<p style="opacity:.7;font-size:14px;">' + (q ? 'Ничего не найдено.' : 'Записей пока нет. Пиши сюда имена, обещания, подсказки и всё, что не хочется забыть.') + '</p>'; return; }
        box.innerHTML = list.map(d => '<div style="border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; margin-bottom:6px;' + (d.pinned ? 'border-color:var(--accent-color);' : '') + '">' +
            '<div style="display:flex; gap:6px; align-items:center;">' +
            '<input type="text" value="' + _diaryEsc(d.title) + '" placeholder="Заголовок" style="flex:1; font-weight:bold;" onchange="editDiaryEntry(\'' + d.id + '\',\'title\',this.value)">' +
            '<button type="button" title="Закрепить" onclick="toggleDiaryPin(\'' + d.id + '\')">' + (d.pinned ? '★' : '☆') + '</button>' +
            '<button type="button" title="Удалить" onclick="deleteDiaryEntry(\'' + d.id + '\')">🗑</button></div>' +
            '<textarea rows="3" style="width:100%; margin-top:4px;" onchange="editDiaryEntry(\'' + d.id + '\',\'text\',this.value)">' + _diaryEsc(d.text) + '</textarea>' +
            '<div style="font-size:11px; opacity:.6;">' + new Date(d.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div></div>').join('');
    };

    // ===== СМЕРТЬ И «СВОБОДНЫЕ ЖИЗНИ» (Sistema 2.2, «Концепция смерти») =====
    // В начале игры бросается d100 — это запас свободных жизней. Падение до 0 ХП тратит одну:
    // персонаж приходит в себя через несколько дней (если донесли до города — без потерь, если
    // очнулся сам или пала вся партия — без части вещей). Когда жизни кончились, воскреснуть
    // можно только выполнив квест своего божества (подтверждает мастер).
    let deathState = { fallen: false, rolled: false, deaths: 0, minimized: false };
    const WAKE_HP_FRACTION = 0.5; // после пробуждения — половина максимума (полное ХП даёт только припарка при длительном отдыхе)

    function _dEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function _dName() { return (document.getElementById('char-name') || {}).value || 'Игрок'; }
    function _dLog(text) { if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(text, _dName()); }
    function _dLives() { return parseInt((document.getElementById('char-lives') || {}).value) || 0; }
    function _dSetLives(n) { const e = document.getElementById('char-lives'); if (e) e.value = Math.max(0, n); }
    function _dGodName() {
        const sel = document.getElementById('faith-god');
        if (!sel || !sel.value || sel.value === 'none') return '';
        return (sel.selectedOptions[0] || {}).textContent || '';
    }

    window.rollFreeLives = function () {
        if (deathState.rolled && !confirm('Свободные жизни уже бросались. Перебросить d100?')) return;
        const v = Math.floor(Math.random() * 100) + 1;
        _dSetLives(v);
        deathState.rolled = true;
        _dLog('🎲 ' + _dName() + ' бросает d100 на свободные жизни: ' + v + '.');
        alert('Бросок d100: ' + v + ' свободных жизней.');
        renderDeathUi();
        saveLocalStorage(true);
    };

    function refreshInventoryViews() {
        renderInventoryList();
        if (typeof renderKitchenPot === 'function') renderKitchenPot();
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

    // Теряется часть НЕнадетых вещей: n случайных стопок (стопка из нескольких штук — половина).
    function loseRandomItems(n) {
        const worn = new Set(Object.keys(equippedSlots).map(k => equippedSlots[k]).filter(Boolean));
        const pool = playerInventory.filter(i => i && i.count > 0 && !worn.has(i.itemId));
        const lost = [];
        for (let k = 0; k < n && pool.length; k++) {
            const idx = Math.floor(Math.random() * pool.length);
            const it = pool.splice(idx, 1)[0];
            const qty = it.count > 1 ? Math.ceil(it.count / 2) : 1;
            lost.push(it.name + (qty > 1 ? ' ×' + qty : ''));
            removeFromInventoryByName(it.itemId, qty);
        }
        refreshInventoryViews();
        return lost;
    }

    window.wakeUp = function (mode) {
        const lives = _dLives();
        if (lives <= 0) { renderDeathUi(); return; }
        _dSetLives(lives - 1);
        deathState.deaths = (deathState.deaths || 0) + 1;
        deathState.fallen = false; deathState.minimized = false;
        const maxHp = parseInt(document.getElementById('max-hp').value) || 1;
        document.getElementById('cur-hp').value = Math.max(1, Math.ceil(maxHp * WAKE_HP_FRACTION));
        let lost = [], days;
        if (mode === 'alone') {
            days = 2 + (Math.floor(Math.random() * 4) + 1); // 3–6 дней
            lost = loseRandomItems(Math.floor(Math.random() * 4) + 1);
        } else {
            days = 2; // донесли до города — «пара деньков»
        }
        const msg = mode === 'alone'
            ? 'очнулся(ась) через ' + days + ' дн. без части вещей' + (lost.length ? ' (потеряно: ' + lost.join(', ') + ')' : ' (терять оказалось нечего)')
            : 'друзья донесли до города, поднялся(ась) через ' + days + ' дн. без потерь';
        _dLog('⚰️ ' + _dName() + ' пал(а) и ' + msg + '. Свободных жизней осталось: ' + (lives - 1) + '. Мастер: сдвиньте календарь на ' + days + ' дн.');
        updateVitalBars(); updateAll();
        renderDeathUi();
        saveLocalStorage(true);
        alert('Ты ' + msg + '. Свободных жизней осталось: ' + (lives - 1) + '.\nХП: половина максимума. Мастеру нужно сдвинуть календарь на ' + days + ' дн.');
    };

    window.reviveByQuest = function (fromGm) {
        if (!fromGm && !confirm('Квест божества выполнен и мастер подтвердил воскрешение?')) return;
        const wasFallen = !!deathState.fallen;
        deathState.fallen = false; deathState.minimized = false;
        if (wasFallen || !fromGm) deathState.deaths = (deathState.deaths || 0) + 1;
        const maxHp = parseInt(document.getElementById('max-hp').value) || 1;
        const hpEl = document.getElementById('cur-hp');
        // мастер мог уже записать ХП в лист (и живой листенер их подставил) — не опускаем, если их больше
        hpEl.value = Math.max(parseInt(hpEl.value) || 0, 1, Math.ceil(maxHp * WAKE_HP_FRACTION));
        if (fromGm) _dLog('✨ ' + _dName() + ' воскрешён(а) мастером (ХП ' + hpEl.value + '/' + maxHp + ').');
        else _dLog('✨ ' + _dName() + ' воскрешён(а) божеством' + (_dGodName() ? ' (' + _dGodName() + ')' : '') + ' после выполненного квеста.');
        updateVitalBars(); updateAll();
        renderDeathUi();
        saveLocalStorage(true);
    };

    window.askGodQuest = function () {
        const god = _dGodName();
        const text = '🙏 ' + _dName() + ' пал(а), свободные жизни закончились. Нужен квест ' + (god ? 'божества «' + god + '»' : 'ближайшего по делам божества') + ' для воскрешения.';
        if (typeof window.CloudSync !== 'undefined' && window.CloudSync.sendWhisperToGm) window.CloudSync.sendWhisperToGm(text, _dName());
        _dLog(text);
        alert('Мастеру отправлено. Он выдаст квест божества.');
    };

    window.minimizeDeath = function (flag) { deathState.minimized = !!flag; renderDeathUi(); };

    function renderDeathUi() {
        const lives = _dLives();
        const st = document.getElementById('lives-status');
        if (st) {
            st.innerHTML = (deathState.rolled ? '' : '<span style="color:#e6b800;">d100 ещё не бросали. </span>') +
                (deathState.deaths ? 'Падений: ' + deathState.deaths + '. ' : '') +
                (deathState.fallen ? '<b style="color:#e74c3c;">⚰️ Персонаж пал</b>' : '');
        }
        const ov = document.getElementById('death-overlay'), mini = document.getElementById('death-mini');
        const body = document.getElementById('death-body');
        const show = !!deathState.fallen;
        if (mini) mini.style.display = show && deathState.minimized ? 'block' : 'none';
        if (ov) ov.style.display = show && !deathState.minimized ? 'block' : 'none';
        if (!show || !body) return;
        let h = '<p style="font-size:15px;">Здоровье упало до нуля. Свободных жизней: <b>' + lives + '</b>.</p>';
        if (lives > 0) {
            h += '<p style="font-size:13px;opacity:.85;">Тратится одна жизнь, ХП вернутся до половины максимума.</p>' +
                '<button class="btn-success" style="width:100%;margin-bottom:6px;" onclick="wakeUp(\'carried\')">🤝 Друзья донесли до города — без потери вещей, ~2 дня</button>' +
                '<button class="btn-danger" style="width:100%;margin-bottom:6px;" onclick="wakeUp(\'alone\')">💤 Очнулся один / пала вся партия — потеря части вещей, 3–6 дней</button>';
        } else {
            const god = _dGodName();
            h += '<p style="font-size:14px;">Свободные жизни закончились. Чтобы воскреснуть, нужно выполнить <b>квест божества</b>' +
                (god ? ' «' + _dEsc(god) + '»' : ' (вера не выбрана — поможет ближайшее по делам божество)') + '.</p>' +
                '<button style="width:100%;margin-bottom:6px;" onclick="askGodQuest()">🙏 Попросить мастера о квесте божества</button>' +
                '<button class="btn-success" style="width:100%;margin-bottom:6px;" onclick="reviveByQuest(false)">✨ Квест выполнен — воскреснуть</button>';
        }
        h += '<button style="width:100%;opacity:.8;" onclick="minimizeDeath(true)">Свернуть (пока друзья лечат / несут)</button>';
        body.innerHTML = h;
    }

    function checkDeath() {
        const el = document.getElementById('cur-hp');
        if (!el || el.value === '') return;
        const hp = parseInt(el.value);
        if (isNaN(hp)) return;
        try { lichWatchHp(hp); } catch (e) { }
        if (hp <= 0 && !deathState.fallen && lichTryResurrect()) return; // лич с целой филактерией воскресает, жизнь не тратится
        if (hp <= 0 && !deathState.fallen) {
            deathState.fallen = true; deathState.minimized = false;
            _dLog('⚰️ ' + _dName() + ' падает без сил (0 ХП). Свободных жизней: ' + _dLives() + '.');
            renderDeathUi();
            saveLocalStorage(true);
        } else if (hp > 0 && deathState.fallen) { // подняли зельем/лечением/правкой мастера
            deathState.fallen = false; deathState.minimized = false;
            _dLog('💚 ' + _dName() + ' приходит в себя (ХП ' + hp + ').');
            renderDeathUi();
            saveLocalStorage(true);
        }
    }
    setInterval(checkDeath, 1500);

    // Команды мастера из панели «Отряд» (приходят через очередь pendingStatusEffects)
    // Очередь команд читается на каждом снимке сессии, пока игрок её не очистил, — одну команду применяем один раз
    // (раньше «Воскресить», «+❤» и «Потеря вещей» могли сработать два-три раза подряд).
    var gmDeathCmdsSeen = [];
    function handleGmDeathCmd(e) {
        if (e.id) { if (gmDeathCmdsSeen.indexOf(e.id) !== -1) return; gmDeathCmdsSeen.push(e.id); if (gmDeathCmdsSeen.length > 100) gmDeathCmdsSeen.shift(); }
        if (e.action === 'loseItems') {
            const lost = loseRandomItems(Math.max(1, parseInt(e.n) || (Math.floor(Math.random() * 4) + 1)));
            _dLog('🎒 ' + _dName() + ' теряет вещи: ' + (lost.length ? lost.join(', ') : 'терять нечего') + '.');
            alert('Мастер: ты теряешь часть вещей — ' + (lost.length ? lost.join(', ') : 'терять нечего') + '.');
        } else if (e.action === 'revive') {
            reviveByQuest(true);
            alert('✨ Мастер воскресил тебя. ХП: ' + document.getElementById('cur-hp').value + '.');
        } else if (e.action === 'addLives') {
            _dSetLives(_dLives() + (parseInt(e.n) || 0));
            alert('Мастер изменил число свободных жизней: теперь ' + _dLives() + '.');
        } else if (e.action === 'fall') {
            document.getElementById('cur-hp').value = 0;
            updateVitalBars(); checkDeath();
        }
        renderDeathUi();
    }

    // ===== ОТДЕЛЬНАЯ ФУНКЦИЯ updateCombat (исправленная) =====
  // TASK-001: вся арифметика удара — в combat-bonuses.js (StBonuses.computePlayerWeaponAttack), здесь только сбор
  // данных листа. Чтения DOM и геттеры эффектов вынесены сюда, чтобы модуль можно было проверять без страницы
  // (window.__stSelfTestAttack) и звать с экрана мастера на тех же данных.
  function collectPlayerAttackInput(finalStr, finalDex) {
    const val = id => document.getElementById(id).value;
    const mode = val('active-combat-weapon');
    const meleeType = val('wep-melee-type');
    // «Стальные кулаки»: класс брони надетых перчаток, только в тяжёлой броне (иначе 0 — бонуса нет).
    let steelFistsArmor = 0;
    if (equippedSlots.gloves) {
        const glvF = playerInventory.find(i => i.itemId === equippedSlots.gloves);
        const glvArm = glvF ? (parseInt(glvF.armorValue || glvF.armor) || 0) : 0;
        // Смотрим на сами перчатки, а не на общий тип комплекта (лёгкие перчатки в «тяжёлом» комплекте бонуса не дают).
        if (glvArm && armorPieceClass(glvF) === 'heavy') steelFistsArmor = glvArm;
    }
    // Азура: стихийным считается оружие с зачарованием огня/холода/электричества в названии.
    const isElemental = id => { const it = id ? playerInventory.find(i => i.itemId === id) : null; return !!(weaponEnchantLive(it) && /огн|пламя|холод|мороз|электр|молни/i.test(it.enchantment.name || '')); };
    return {
        mode,
        starve: hungerPenaltyDays(),
        str: finalStr || parseInt(val('stat-str')) || 10,
        dex: finalDex || parseInt(val('stat-dex')) || 10,
        wis: parseInt(val('stat-wis')) || 10,
        perks: window.perkBonuses || {},
        isPowerAttack: document.getElementById('chk-power-attack').checked,
        // «Двойной вихрь/мясорубка» — только если во второй руке правда есть оружие (раньше хватало галочки)
        isDualWield: document.getElementById('chk-dual-wield').checked && (!!equippedSlots.meleeWeaponOffhand || ((parseInt(val('wep-melee-offhand-dmg')) || 0) > 0 && !!val('wep-melee-offhand-name').trim())),
        isSprintAttack: document.getElementById('chk-sprint-attack').checked,
        melee: { dmg: parseInt(val('wep-melee-dmg')), type: meleeType, name: val('wep-melee-name'), offhandDmg: parseInt(val('wep-melee-offhand-dmg')) || 0,
            isKastet: (() => { const m = equippedSlots.meleeWeapon ? playerInventory.find(i => i.itemId === equippedSlots.meleeWeapon) : null; return !!(m && typeof isKastetItem === 'function' && isKastetItem(m)); })() },
        // Урон стрелы — только от заряженного боеприпаса (раньше ручное поле считалось всегда, а при «Применить» сверху
        // прибавлялся ещё урон надетой стрелы — урон стрелы шёл дважды, и предпросмотр расходился с итогом).
        ranged: { dmg: parseInt(val('wep-ranged-dmg')), ammoDmg: (() => { const am = equippedSlots.ammo ? playerInventory.find(i => i.itemId === equippedSlots.ammo && i.count > 0) : null; const d = ammoDamageOf(am); const f = document.getElementById('ammo-dmg'); if (f) f.value = d; return d; })(), type: val('wep-ranged-type'), name: val('wep-ranged-name') || '',
            isStaff: (() => { const r = equippedSlots.rangedWeapon ? playerInventory.find(i => i.itemId === equippedSlots.rangedWeapon) : null; return !!(r && (r.isStaff || /^Посох/.test(String(r.category || '')) || /посох/i.test(String(r.name || '')))); })() },
        enchantDmgMelee: getActiveWeaponEnchantDmg(true),
        enchantDmgRanged: getActiveWeaponEnchantDmg(false),
        offhandEnchantDmg: getOffhandWeaponEnchantDmg(),
        weaponDmgPct: ((typeof getActivePercentBonuses === 'function') ? getActivePercentBonuses().weaponDamagePercent : 0) + periyteBuffs().weaponPct, // + Периайт: «Каменная подагра»
        skillBoostPct: { 'стрельба': getSkillBoostPercent('стрельба'), 'одноручное оружие': getSkillBoostPercent('одноручное оружие'), 'двуручное оружие': getSkillBoostPercent('двуручное оружие') },
        unarmedBonus: getActiveUnarmedBonus(),
        unarmedEnchant: gearUnarmedEnchant(),
        gearBaseWeaponPct: getGearSpecialBonuses().weaponBasePct,
        steelFistsArmor,
        weaponDmgFlat: getActiveDmgFlat(),
        god: window.activeGodBonuses || {},
        elementalEnchant: { melee: isElemental(equippedSlots.meleeWeapon), ranged: isElemental(equippedSlots.rangedWeapon) },
        sheogorathMult: (typeof sheogorathRoll !== 'undefined') ? sheogorathRoll.dmgMult : 1
    };
  }
  window.collectPlayerAttackInput = collectPlayerAttackInput;

  function updateCombat(finalStr, finalDex) {
    if (document.getElementById('manual-dmg-lock').checked) {
        return;
    }
    const calcR = window.StBonuses.computePlayerWeaponAttack(collectPlayerAttackInput(finalStr, finalDex));
    const { totalDmg, hitModifier, sneakMult, mode, wepType, baseDmg, enchantDmgMain, offhandDmg, offhandEnchantDmg,
        statModForFormula, statLabelForFormula, weaponDmgPct, weaponBoostPct, boostSkillKey, weaponDmgFlat, infoNotes, godDmgNotes } = calcR;

    // Формула по составным частям (до множителей силовой атаки/рывка/скрытности)
    let formulaParts = [`${statLabelForFormula} ${statModForFormula >= 0 ? '+' : ''}${statModForFormula}`, `оружие ${baseDmg}`];
    if (enchantDmgMain) formulaParts.push(`зачарование +${enchantDmgMain}`);
    if (offhandDmg || offhandEnchantDmg) formulaParts.push(`второе оружие +${offhandDmg}${offhandEnchantDmg ? ' (+' + offhandEnchantDmg + ' зачар.)' : ''}`);
    const formulaSum = statModForFormula + baseDmg + enchantDmgMain + offhandDmg + offhandEnchantDmg;

    let finalHtml = `
        <strong>Модификатор броска d20:</strong> 1d20 + (${hitModifier >= 0 ? '+' : ''}${hitModifier}) против кубов Мастера<br>
        <div style="font-size:13px; opacity:.75; margin:2px 0;">Формула: ${formulaParts.join(' + ')} = ${formulaSum}${mode === 'melee' && wepType !== 'unarmed' ? ' (до силовой атаки/бонусов перков)' : ''}</div>
        <strong>Итоговый физический урон цели:</strong> <span style="color:#e74c3c; font-size:17px; font-weight:bold;">${totalDmg}</span> ед.<br>
    `;
    const weaponEnchantDesc = getEquippedWeaponEnchantDesc(mode === 'melee');
    if (weaponEnchantDesc) {
        finalHtml += `<div style="font-size:13px; color:#8a8171;">🔮 ${escHtml(weaponEnchantDesc)}</div>`;
    }
    if (weaponDmgPct) {
        finalHtml += `<div style="font-size:13px; color:#8a8171;">✨ Активный бафф урона: +${weaponDmgPct}% (уже учтено выше)</div>`;
    }
    if (weaponBoostPct) {
        finalHtml += `<div style="font-size:13px; color:#8a8171;">🔺 Повышение навыка «${escHtml(boostSkillKey)}»: урон оружия +${weaponBoostPct}% (уже учтено выше)</div>`;
    }
    if (weaponDmgFlat) {
        finalHtml += weaponDmgFlat > 0
            ? `<div style="font-size:13px; color:#8a8171;">🔺 Усиление от эффектов: +${weaponDmgFlat} к урону оружия (уже учтено выше)</div>`
            : `<div style="font-size:13px; color:#c0392b;">🔻 Ослабление от эффектов: ${weaponDmgFlat} к урону оружия (уже учтено выше)</div>`;
    }
    if (godDmgNotes.length) {
        finalHtml += `<div style="font-size:13px; color:#8a8171;">🙏 Бог: ${godDmgNotes.join(', ')} (уже учтено выше)</div>`;
    }
    if (document.getElementById('chk-sneak-attack').checked) {
        finalHtml += `<strong style="color:#e67e22;">Урон из скрытности (х${sneakMult}): ${totalDmg * sneakMult} ед. урона!</strong>`;
    }
    if (infoNotes.length) {
        finalHtml += `<div style="margin-top:6px; font-size:13px; color:#c9b896; line-height:1.5;">${infoNotes.join('<br>')}</div>`;
    }

    document.getElementById('combat-results').innerHTML = finalHtml;
    document.getElementById('main-panel-dmg').value = totalDmg;

    // Экспонируем последний расчёт наружу — читает инструмент «Разрешить атаку».
    window.lastWeaponCombatCalc = { totalDmg, hitModifier, dieSize: 20, mode, wepType, sneakMult, trueDmg: calcR.trueDmg || 0, armorIgnore: calcR.armorIgnore || 0 };
}
    
    // Сохранение всех параметров листа в LocalStorage
    // Раньше saveLocalStorage делала ВСЁ синхронно на каждый вызов: чтение ~50 DOM-полей,
    // JSON.stringify (легко 20-50 КБ), запись в localStorage — даже если immediate=false, только
    // облачная часть внутри CloudSync.saveCharacter была дебаунсена (800мс), а сама эта тяжёлая
    // сборка данных — нет. Теперь saveLocalStorage — тонкая обёртка: при immediate=true делает
    // всё сразу (как и раньше — например exportCharacterToFile() читает localStorage сразу после
    // вызова, ему нужен синхронный путь), иначе откладывает на 300мс и схлопывает повторные
    // вызовы подряд в один. Плюс пропускает запись целиком, если с прошлого раза ничего не
    // изменилось (хэш по итоговому JSON).
    let _localSaveTimer = null;
    let _lastLocalSaveHash = '';
    // 6.6: раньше упавшая/сброшенная вкладка теряла всё, что ждало 300-мс таймера. Теперь «грязный» флаг
    // (window._dirty + копия в localStorage['skyrim_dirty'], чтобы пережить перезагрузку) ставится при отложенном
    // сохранении и сбрасывается реальной записью. Каждые 30 с, пока флаг стоит, снимок состояния уходит
    // в localStorage['skyrim_recovery']; при следующей загрузке, если флаг остался, предлагаем его восстановить.
    window._dirty = false;
    function stSetDirty(v) { window._dirty = v; try { if (v) localStorage.setItem('skyrim_dirty', '1'); else localStorage.removeItem('skyrim_dirty'); } catch (e) { } }
    function saveLocalStorage(immediate) {
        if (immediate) {
            clearTimeout(_localSaveTimer);
            _buildAndSaveData(true);
            return;
        }
        stSetDirty(true);
        clearTimeout(_localSaveTimer);
        _localSaveTimer = setTimeout(() => _buildAndSaveData(false), 300);
    }

    function _buildAndSaveData(immediate, recoveryOnly, localOnly) {
        // 6.6: пока висит вопрос «Восстановить?», обычное сохранение молчит — иначе pagehide перед перезагрузкой затёрло бы копию текущим (старым) состоянием формы
        if (window.__stRecoveryPending && !recoveryOnly) return;
        let perkStates = {};
        _allPerkCheckboxes.forEach(chk => {
            let key = `skill${chk.dataset.skillidx}-perk${chk.dataset.perkidx}-step${chk.dataset.step}`;
            perkStates[key] = chk.checked;
        });

        let data = {
            version: window.SKYRIM_SAVE_VERSION || '3.7', // 7.2: раньше жёстко '3.6'; значение приходит из CURRENT_SAVE_VERSION (определён ниже в этом же скрипте)
            name: document.getElementById('char-name').value,
            race: document.getElementById('char-race').value,
            orcVariant: (document.getElementById('char-orc-variant') || {}).value || 'city',
            creationState: creationState,
            sign: document.getElementById('char-sign').value,
            signStat: (document.getElementById('char-sign-stat') || {}).value || '',
            originLock: originLock, // когда выбраны раса/знак и закреплены ли (см. ORIGIN_GRACE_MS)
            // Итоговые характеристики (с расой, знаком, вампиризмом) для бросков мастера — поле effectiveStats ниже (объект {str,…});
            // в stats лежит база до бонусов.
            effectiveSkills: skillNames.map(n => getEffectiveSkillValue(n)), // навыки с расовым бонусом (потолок 100) — для мастера
            pets: playerPets, riding: !!playerRiding, // животные игрока и «Верхом»
            shortRestsUsed: shortRestsUsed || 0,
            readSkillBooks: readSkillBooks, // прочитанные книги навыков (каждая учит один раз)
            combatMarks: combatMarks,
            sheathSlots: sheathSlots, // ножны: что висит в слотах пояса/спины и какое оружие в них
            gmCmdsApplied: gmCmdsApplied.slice(-200), // id уже применённых правок мастера (gmCmds) — защита от повтора
            takenPerks: buildTakenPerksSummary(), // для экрана мастера: имена взятых перков (у мастера нет дерева перков)
            lvl: characterLevel, // дублируем в старое поле для обратной совместимости, не читаем при восстановлении
            lives: document.getElementById('char-lives').value,
            diary: playerDiary,
            tradesDone: tradesDone,
            marketBought: marketBought,
            restState: restState,
            deathState: { fallen: !!deathState.fallen, rolled: !!deathState.rolled, deaths: deathState.deaths || 0, minimized: !!deathState.minimized },
            gold: Math.max(0, parseInt(document.getElementById('char-gold').value) || 0), // числом: increment у мастера по строке не прибавляет, а заменяет
            starve: document.getElementById('food-starve').value,
            faithGod: document.getElementById('faith-god').value,
            penanceAllowed: penanceAllowed,
            faithRank: document.getElementById('faith-rank').value,
            backstory: document.getElementById('char-backstory').value,
            notes: document.getElementById('char-notes').value,
            faithNotes: document.getElementById('faith-notes').value,
            armorBuff: document.getElementById('armor-buff').value,
            speed: document.getElementById('val-speed').value,
            scrollWisdomSpent: scrollWisdomSpent,
            manualWeightLock: document.getElementById('manual-weight-lock').checked,
            maxWeightInput: document.getElementById('max-weight-input').value,
            extraWeight: document.getElementById('extra-weight').value,
            stats: [
                document.getElementById('stat-str').getAttribute('data-raw-stat') || 10,
                document.getElementById('stat-dex').getAttribute('data-raw-stat') || 10,
                document.getElementById('stat-con').getAttribute('data-raw-stat') || 10,
                document.getElementById('stat-int').getAttribute('data-raw-stat') || 10,
                document.getElementById('stat-wis').getAttribute('data-raw-stat') || 10,
                document.getElementById('stat-cha').getAttribute('data-raw-stat') || 10
            ],
            vitals: [
                document.getElementById('cur-hp').value,
                document.getElementById('cur-mp').value,
                document.getElementById('max-hp').value,
                document.getElementById('max-mp').value
            ],
            locks: [
                document.getElementById('manual-hp-lock').checked,
                document.getElementById('manual-mp-lock').checked,
                document.getElementById('manual-dmg-lock').checked,
                document.getElementById('manual-speed-lock').checked
            ],
            skills: skillNames.map((name, idx) => {
                const input = document.getElementById(`skill-${idx}`);
                return input ? input.getAttribute('data-raw-val') || 10 : 10;
            }),
            perkStates: perkStates, perkSchema: 2,
            wepMName: document.getElementById('wep-melee-name').value,
            wepMDmg: document.getElementById('wep-melee-dmg').value,
            wepMType: document.getElementById('wep-melee-type').value,
            wepRName: document.getElementById('wep-ranged-name').value,
            wepMOffhandName: document.getElementById('wep-melee-offhand-name').value,
            wepMOffhandDmg: document.getElementById('wep-melee-offhand-dmg').value,
            chkDualWield: document.getElementById('chk-dual-wield').checked,
            chkSprintAttack: document.getElementById('chk-sprint-attack').checked,
            chkFrostRegion: document.getElementById('chk-frost-region').checked,
            chkSneakAttack: document.getElementById('chk-sneak-attack').checked,
            chkBowDrawn: document.getElementById('chk-bow-drawn').checked,
            counterHits: counterHits,
            chkDefensiveStance: document.getElementById('chk-defensive-stance').checked,
            keeperBarrierLeft: keeperBarrierLeft,
            wepRDmg: document.getElementById('wep-ranged-dmg').value,
            // Итоговый урон ближним и дальним оружием (Сила/Ловкость, перки, чары) — для совместной атаки у мастера.
            coopDmg: (() => { try { const inp = collectPlayerAttackInput(); const o = {}; ['melee', 'ranged'].forEach(m => { o[m] = window.StBonuses.computePlayerWeaponAttack(Object.assign({}, inp, { mode: m, isPowerAttack: false, isSprintAttack: false })).totalDmg || 0; }); return o; } catch (e) { return null; } })(),
            wepRType: document.getElementById('wep-ranged-type').value,
            amName: document.getElementById('ammo-name').value,
            amDmg: document.getElementById('ammo-dmg').value,
            activeWep: document.getElementById('active-combat-weapon').value,
            armorClass: document.getElementById('eq-armor').value,
            sHelm: document.getElementById('slot-helm-name').value,
            sHelmA: document.getElementById('slot-helm-armor').value,
            sChest: document.getElementById('slot-chest-name').value,
            sChestA: document.getElementById('slot-chest-armor').value,
            sRobe: document.getElementById('slot-robe-name').value,
            sRobeA: document.getElementById('slot-robe-armor').value,
            sGloves: document.getElementById('slot-gloves-name').value,
            sGlovesA: document.getElementById('slot-gloves-armor').value,
            sBoots: document.getElementById('slot-boots-name').value,
            sBootsA: document.getElementById('slot-boots-armor').value,
            sShield: document.getElementById('slot-shield-name').value,
            sShieldA: document.getElementById('slot-shield-armor').value,
            sRing: document.getElementById('slot-ring-name').value,
            sNeck: document.getElementById('slot-neck-name').value,
            sCirclet: document.getElementById('slot-circlet-name').value,
            inventory: playerInventory,
            equippedSlots: equippedSlots,
            equipmentSets: equipmentSets,
            craftQueue: craftQueue,
            craftOrders: craftOrders,
            portrait: playerPortrait,
            portraitThumb: playerPortraitThumb,
            knownIngredientProps: knownIngredientProps,
            mageSignFreeUsed: mageSignFreeUsed,
            godDay: godDay,
            apprenticeVuln: apprenticeVuln,
            weaponPoison: weaponPoison,
            alchemyRulesVersion: window.ALCHEMY_RULES_VERSION || 1,
            skillBoosts: getAllSkillBoosts(),
            gearSpecial: (function () { try { const g = getGearSpecialBonuses(); return { reflectMeleePct: g.reflectMeleePct, magicAbsorbPct: g.magicAbsorbPct, keeperBarrier: keeperBarrierActive() ? keeperBarrierLeft : 0 }; } catch (e) { return {}; } })(), // мастеру: отражение (Бастион), поглощение магии, барьер Хранителя
            effectiveStats: {
                str: parseInt((document.getElementById('stat-str') || {}).value) || 10, dex: parseInt((document.getElementById('stat-dex') || {}).value) || 10,
                con: parseInt((document.getElementById('stat-con') || {}).value) || 10, int: parseInt((document.getElementById('stat-int') || {}).value) || 10,
                wis: parseInt((document.getElementById('stat-wis') || {}).value) || 10, cha: parseInt((document.getElementById('stat-cha') || {}).value) || 10
            },
            powersUsedToday: powersUsedToday,
            companionRewards: companionRewards,
            soulEaterKills: soulEaterKills,
            trainState: trainState,
            bardSongs: bardSongs,
            knownCookRecipes: knownCookRecipes,
            knownBrewRecipes: knownBrewRecipes,
            knownEnchantments: knownEnchantments,
            pouchContents: pouchContents,
            activeTimedEffects: activeTimedEffects,
            gameTurn: gameTurn,
            gameRound: gameRound,
            turnSync: sessionTurnSync,
            gameYear: gameYear,
            gameMonth: gameMonth,
            gameDayNum: gameDayNum,
            daysWithoutFood: daysWithoutFood,
            characterLevel: characterLevel,
            levelUpProgress: levelUpProgress,
            perkPointsAvailable: perkPointsAvailable,
            levelScheme: LEVEL_SCHEME,
            skillProgress: skillProgress,
            playerQuests: playerQuests,
            activeSummons: activeSummons,
            customSpells: customSpells,
            mapNotes: playerMapNotes,
            resistances: computeTotalResistances(),
            // бонусы богов, которые мастер применяет при атаках врагов по игроку
            godGM: { daedraUndeadResist: gb('daedraUndeadResist'), spellAbsorb: gb('spellAbsorb'), ignoreMagicDmg: gb('ignoreMagicDmg'), fearChance: gb('fearChance'), potionPower: gb('potionPower') }
        };
        const json = JSON.stringify(data);
        if (recoveryOnly) { try { localStorage.setItem('skyrim_recovery', json); localStorage.setItem('skyrim_recovery_ts', String(Date.now())); } catch (e) { } return; }
        if (json === _lastLocalSaveHash) { stSetDirty(false); return; } // ничего не изменилось с прошлого сохранения
        _lastLocalSaveHash = json;
        localStorage.setItem('skyrim_ttrpg_save_v3_6', json);
        try { localStorage.setItem('skyrim_save_ts', String(Date.now())); } catch (e) { }
        stSetDirty(false);
        if (window.CloudSync && !localOnly) window.CloudSync.saveCharacter(data, immediate);
    }

    setInterval(function () {
        if (window._dirty && !window.__stRecoveryPending) { try { _buildAndSaveData(false, true); } catch (e) { } }
    }, 30000);
    window.stSnapshotRecovery = function () { _buildAndSaveData(false, true); };
    // Для защиты от устаревшей вкладки (cloud.js, checkStaleSheet):
    // stForceSave — записать лист в облако заново, даже если он не менялся (облако затёрла старая вкладка — восстанавливаем);
    // stMarkSynced — лист только что взят из облака: запомнить его как сохранённый, в облако не отправлять (иначе вкладки пересохраняли бы друг друга).
    window.stForceSave = function () { clearTimeout(_localSaveTimer); _lastLocalSaveHash = ''; _buildAndSaveData(true); };
    window.stMarkSynced = function () { clearTimeout(_localSaveTimer); _lastLocalSaveHash = ''; _buildAndSaveData(true, false, true); };

    // Сохранить всё, что ещё ждёт таймера (локально — 300 мс, облако — 800 мс), когда вкладка закрывается или уходит в фон.
    // Раньше правка за долю секунды до закрытия терялась. pagehide/visibilitychange — для мобильных браузеров, где beforeunload не срабатывает.
    function flushPendingSaves() {
        try {
            clearTimeout(_localSaveTimer);
            _buildAndSaveData(true);
            if (window.CloudSync && typeof window.CloudSync.flushSave === 'function') window.CloudSync.flushSave();
        } catch (e) { console.warn('flushPendingSaves:', e); }
    }
    window.addEventListener('beforeunload', flushPendingSaves);
    window.addEventListener('pagehide', flushPendingSaves);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushPendingSaves(); });

    // Поля, которые правит МАСТЕР (гильдии/сверхъестественное/репутация) — вынесены отдельно,
    // т.к. применяются и при первой загрузке персонажа (через applyCharacterData), и живым
    // листенером на каждое внешнее изменение (cloud.js), без риска задеть то, что редактирует
    // сам игрок (хп/инвентарь/статы и т.д. этой функцией не трогаются).
    // Дешёвый отпечаток инвентаря вместо JSON.stringify(data.inventory) !== JSON.stringify
    // (playerInventory) — тот вариант это O(2N) сериализация в строку на КАЖДЫЙ snapshot
    // (а снапшоты приходят и от heartbeat раз в 30-60 сек без реальных изменений, не только от
    // правок мастера). Длина массива + лёгкий хэш по count/itemId достаточно для обнаружения
    // реального изменения, не претендуя на криптографическую надёжность.
    function inventoryFingerprint(inv) {
        if (!Array.isArray(inv)) return 0;
        let h = inv.length;
        for (const i of inv) h = (h * 31 + (i.count || 0) + (i.itemId || '').length) | 0;
        return h;
    }

    // Поля, которые может менять и мастер, и сам лист (ХП/мана, золото, уровень, очки перков, навыки, инвентарь),
    // применяем из облака ТОЛЬКО если в облаке они изменились с прошлого снимка. Иначе любой посторонний снимок
    // (мастер прислал команду, ударила ловушка, сменился ход) откатывал несохранённые локальные правки к старому
    // облачному значению: купил вещь — золото вернулось, выпил зелье — ХП вернулось.
    var _gmLastCloud = null;
    function cloudFieldChanged(key, val) {
        const sig = JSON.stringify(val);
        if (!_gmLastCloud) _gmLastCloud = {};
        const was = Object.prototype.hasOwnProperty.call(_gmLastCloud, key) ? _gmLastCloud[key] : undefined;
        _gmLastCloud[key] = sig;
        return was === undefined || was !== sig;
    }
    function applyGmControlledFields(data) {
        if (!data) return;
        let changed = false; // true, если за этот вызов реально что-то поменялось — updateAll()
                              // в конце запускаем только тогда, не безусловно на каждый snapshot.
        // Задача K: прогресс гильдий приходит вместе со всем остальным документом —
        // отдельный запрос (getOwnCharacterField) не нужен, экономим чтение Firestore.
        // Три панели ниже перерисовываем ТОЛЬКО если их данные реально изменились (раньше — на каждый снимок документа, т.е. при каждом изменении ХП в бою).
        const _gmSig = JSON.stringify([data.guildsData, data.supernaturalState, data.crimeState, data.reputationByRegion]);
        const _gmSame = _gmSig === window._gmFieldsSig; window._gmFieldsSig = _gmSig;
        // Гильдии/репутация/сверхъестественное/штрафы — только если в облаке они изменились (см. cloudFieldChanged ниже):
        // иначе посторонний снимок документа откатывал несохранённые локальные изменения (например, превращение).
        if (!_gmSame) {
        playerGuildsData = data.guildsData || {};
        // Задача C: репутация нужна для расчёта цены у торговцев (±5%), но НЕ отображается
        // игроку нигде — только используется молча в формуле цены (Задача D: "игрок не видит").
        playerReputationByRegion = data.reputationByRegion || {};
        if (!_gmSame && typeof renderGuildPanelPlayer === 'function') renderGuildPanelPlayer();
        if (!_gmSame) { if (typeof renderBardSection === 'function') renderBardSection(); if (typeof renderPowersPanel === 'function') renderPowersPanel(); }
        // Задача L: то же самое для сверхъестественного состояния — читаем сразу из документа.
        const prevIsTransformed = playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.isTransformed;
        const prevLordFormSn = snLordForm(), prevVampSn = snVampire();
        playerSupernaturalState = data.supernaturalState ? {
            lycanthropy: !!data.supernaturalState.lycanthropy,
            vampirism: !!data.supernaturalState.vampirism,
            werewolf: Object.assign({ heartsEaten: 0, totem: '— нет —', hasTransformedToday: false, transformsToday: 0, isTransformed: false }, data.supernaturalState.werewolf || {}),
            vampire: (function (v) { if (v.lordPerksLegacy === undefined) v.lordPerksLegacy = Object.keys(v.lordPerks || {}).filter(k => v.lordPerks[k]).length; return v; })(Object.assign({ hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 }, data.supernaturalState.vampire || {})),
            lich: (window.lichNormalize || (x => null))(data.supernaturalState.lich),
            faithShift: data.supernaturalState.faithShift || null
        } : null;
        try { lichAfterStateChange(); } catch (e) { console.error('Лич:', e); }
        if (!_gmSame && typeof renderSupernaturalStatusPlayer === 'function') renderSupernaturalStatusPlayer();
        // Оборотень-трансформация меняет боевой расчёт (когти вместо оружия) — если изменилась,
        // нужен полный пересчёт, не только собственный рендер статуса.
        const newIsTransformed = playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.isTransformed;
        if (!!prevIsTransformed !== !!newIsTransformed) { changed = true; if (!newIsTransformed) snClearBoundSummons('werewolf'); }
        if (prevLordFormSn && !snLordForm()) snClearBoundSummons('lord');
        if (!!prevLordFormSn !== snLordForm() || prevVampSn !== snVampire()) { changed = true; if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect(); }

        // Штрафы/тюрьма — игрок ДОЛЖЕН это видеть (в отличие от репутации), это не тайное число.
        playerCrimeState = data.crimeState || null;
        if (!_gmSame && typeof renderCrimeStatusPlayer === 'function') renderCrimeStatusPlayer();
        }

        // Раньше только гильдии/репутация/сверхъестественное обновлялись без перезагрузки — урон
        // от мастера, выданные предметы, золото, уровень и снижение навыка требовали F5. Теперь
        // те же самые поля, что реально правит мастер (и только они — не весь документ, чтобы не
        // затирать то, что игрок мог сам сейчас редактировать в других полях листа).
        if (Array.isArray(data.vitals) && data.vitals.length === 4) {
            // Только ТЕКУЩИЕ хп/мп — max-hp/max-mp считаются локально из статов и могут
            // отличаться от сохранённого снимка, перетирать их живым листенером не стоит.
            const curHpEl = document.getElementById('cur-hp');
            const curMpEl = document.getElementById('cur-mp');
            const vNew = cloudFieldChanged('vitals', [data.vitals[0], data.vitals[1]]);
            if (vNew && curHpEl && curHpEl.value != data.vitals[0]) { curHpEl.value = data.vitals[0]; changed = true; }
            if (vNew && curMpEl && curMpEl.value != data.vitals[1]) { curMpEl.value = data.vitals[1]; changed = true; }
        }
        if (typeof data.gold !== 'undefined' && cloudFieldChanged('gold', data.gold)) {
            const goldEl = document.getElementById('char-gold');
            if (goldEl && goldEl.value != data.gold) { goldEl.value = data.gold; changed = true; }
        }
        // Прогресс к уровню мастер обнуляет вместе с выдачей/снятием уровня — раньше лист игрока это поле не подхватывал
        // и следующим автосохранением возвращал старое значение.
        // Документ в облаке ещё на старой шкале уровней (лист пересчитан, но не сохранён) — его уровень/прогресс/очки не берём, иначе пересчёт откатится.
        const _lvOld = data.levelScheme !== LEVEL_SCHEME;
        if (!_lvOld && typeof data.levelUpProgress !== 'undefined' && cloudFieldChanged('levelUpProgress', data.levelUpProgress) && (parseInt(data.levelUpProgress) || 0) !== levelUpProgress) {
            levelUpProgress = parseInt(data.levelUpProgress) || 0;
            if (typeof renderLevelPanel === 'function') renderLevelPanel();
            changed = true;
        }
        if (!_lvOld && typeof data.characterLevel !== 'undefined' && cloudFieldChanged('level', data.characterLevel) && data.characterLevel !== characterLevel) {
            characterLevel = parseInt(data.characterLevel) || 1;
            if (typeof renderLevelPanel === 'function') renderLevelPanel();
            changed = true;
        }
        if (!_lvOld && typeof data.perkPointsAvailable !== 'undefined' && cloudFieldChanged('perkPts', data.perkPointsAvailable)) perkPointsAvailable = parseInt(data.perkPointsAvailable) || 0;
        if (Array.isArray(data.skills) && cloudFieldChanged('skills', data.skills)) {
            data.skills.forEach((val, i) => {
                const input = document.getElementById('skill-' + i);
                if (input && input.getAttribute('data-raw-val') != val) { input.setAttribute('data-raw-val', val || 10); changed = true; }
            });
        }
        if (Array.isArray(data.inventory) && cloudFieldChanged('inv', inventoryFingerprint(data.inventory)) && inventoryFingerprint(data.inventory) !== inventoryFingerprint(playerInventory)) {
            playerInventory = data.inventory;
            playerInventory.forEach(enrichItemFromDb);
            const _healed = healInventoryIds(playerInventory);
            const _gone = unequipVanishedItems(); // мастер мог забрать/удалить надетую вещь
            if (_healed || _gone.length) setTimeout(() => { try { saveLocalStorage(); } catch (e) { /* не критично */ } }, 0);
            if (typeof renderInventoryList === 'function') renderInventoryList();
            // Раньше не обновлялось здесь — предмет, выданный мастером ПОСЛЕ загрузки страницы,
            // появлялся в инвентаре, но не появлялся в выборе "что зачаровать" вообще (сам пункт
            // списка отсутствовал), пока игрок не перезагружал страницу.
            if (typeof renderEnchantItemSelect === 'function') renderEnchantItemSelect();
            changed = true;
        }
        // updateAll() теперь только если реально что-то поменялось за этот вызов — раньше
        // запускался безусловно на КАЖДЫЙ snapshot, включая heartbeat раз в 30-60 сек без
        // реальных изменений (полный пересчёт 19 навыков/перков/экипировки/резистов/каст-костов
        // впустую). Через scheduleUpdateAll() (задача 4) — коалесцирует с другими отложенными
        // пересчётами, если они случились в том же кадре.
        if (changed && typeof scheduleUpdateAll === 'function') scheduleUpdateAll();
        // Правки мастера командами (навык ±, характеристика ±, снятие ступени перка, обучение заклинанию).
        // Через setTimeout: при загрузке листа эта функция зовётся ДО того, как поля листа выставлены из сейва, —
        // команды должны лечь поверх загруженных значений, а не быть затёрты ими.
        // Рецепты кузни открывает мастер (лист игрока это поле не пишет) — подхватываем сразу, без перезагрузки.
        if (Array.isArray(data.knownSmithingRecipes) && cloudFieldChanged('smithRec', JSON.stringify(data.knownSmithingRecipes)) && JSON.stringify(data.knownSmithingRecipes) !== JSON.stringify(knownSmithingRecipes)) {
            knownSmithingRecipes = data.knownSmithingRecipes.slice();
            if (typeof renderSmithingList === 'function') try { renderSmithingList(); } catch (e) { }
        }
        if (Array.isArray(data.gmCmds) && data.gmCmds.length) { const cmds = data.gmCmds.slice(); setTimeout(() => applyGmCmds(cmds), 0); }
    }
    window.applyGmControlledFields = applyGmControlledFields;

    // ---------- Руки: что держит игрок (каст) и смена оружия в бою ----------
    // Правила: обе руки пусты — любой каст; одна рука занята (одно одноручное ИЛИ только щит) — обычный каст,
    // без усиленного; заняты обе (двуручное, лук/арбалет в руках, два одноручных, одноручное + щит) — колдовать нельзя.
    function playerHandsState() {
        const val = id => ((document.getElementById(id) || {}).value || '');
        const active = val('active-combat-weapon');
        const findInv = id => id ? playerInventory.find(i => i.itemId === id) : null;
        if (active === 'ranged' && (equippedSlots.rangedWeapon || (val('wep-ranged-name').trim() && (parseInt(val('wep-ranged-dmg')) || 0) > 0))) {
            return { free: 0, label: 'лук/арбалет (обе руки)' };
        }
        const type = val('wep-melee-type');
        const mainItem = findInv(equippedSlots.meleeWeapon);
        const mainName = val('wep-melee-name').trim();
        const hasMain = !!mainItem || (type && type !== 'unarmed' && mainName && mainName !== 'Бой голыми руками');
        const twoH = hasMain && (/^twohand/.test(type) || !!(mainItem && (String(mainItem.category || '').indexOf('Двуруч') !== -1 || /^twohand/.test(String(mainItem.weaponType || '')))));
        if (twoH) return { free: 0, label: 'двуручное оружие (обе руки)' };
        const hasOff = !!equippedSlots.meleeWeaponOffhand || !!val('wep-melee-offhand-name').trim();
        const hasShield = !!equippedSlots.shield;
        const used = (hasMain ? 1 : 0) + ((hasOff || hasShield) ? 1 : 0);
        const parts = [];
        if (hasMain) parts.push('оружие в правой');
        if (hasOff) parts.push('второе оружие в левой'); else if (hasShield) parts.push('щит в левой');
        return { free: 2 - used, label: parts.length ? parts.join(', ') : 'руки свободны' };
    }
    // Немота запрещает колдовать и вне боя (в бою её ловит ещё combatActionAllowed).
    function castMuteCheck() {
        const m = (activeTimedEffects || []).find(e => e && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity) && (e.statusFlag === 'mute' || e.effectName === 'Немота'));
        if (m) { alert(`Сейчас на тебе «${m.effectName || m.name}» — колдовать нельзя.`); return false; }
        return true;
    }
    function castBlockReason() {
        if (inJailNow()) return JAIL_BLOCK_TEXT;
        if (snWerewolfForm()) return 'В облике зверя колдовать нельзя (оборотень лечится только пожиранием трупов).';
        const h = playerHandsState();
        return h.free >= 1 ? '' : `Колдовать нельзя: ${h.label}. Для заклинания нужна хотя бы одна свободная рука — убери оружие («✋ В руках» над кнопкой «Бросить»).`;
    }
    function enhancedHandsReason() {
        const h = playerHandsState();
        return h.free >= 2 ? '' : `Усиленный каст — только с пустыми руками (сейчас: ${h.label}).`;
    }
    window.playerHandsState = playerHandsState;

    // Действие хода в бою: сменить оружие ИЛИ атаковать/колдовать. Бой — это сессия с живыми врагами;
    // вне боя оружие меняется свободно. Отметки по ключу хода (круг:ход), переживают перезагрузку страницы.
    var combatMarks = { attack: null, swap: null };
    function inCombatNow() {
        const s = window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() ? window.CloudSync.getSessionData() : null;
        return !!(s && (s.enemies || []).some(e => (e.curHp || 0) > 0));
    }
    function turnKeyNow() { return (gameRound || 0) + ':' + (gameTurn || 0); }
    // Статусы, которые не дают действовать: паралич — ничего; страх/успокоение — ни атаковать, ни колдовать; немота — не колдовать.
    function blockingStatusFor(kind) {
        const live = (activeTimedEffects || []).filter(e => e && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity));
        const has = (flags, names) => live.find(e => flags.indexOf(e.statusFlag) !== -1 || names.indexOf(e.effectName) !== -1);
        let e = has(['paralysis'], ['Паралич']);
        if (e) return e;
        if (kind === 'attack' || kind === 'cast') { e = has(['fear'], ['Страх', 'Успокоение']); if (e) return e; }
        if (kind === 'cast') { e = has(['mute'], ['Немота']); if (e) return e; }
        return null;
    }
    function combatActionAllowed(kind) {
        if (!inCombatNow()) return true;
        { const b = blockingStatusFor(kind); if (b) { alert(`Сейчас на тебе «${b.effectName || b.name}» — ${kind === 'cast' ? 'колдовать' : kind === 'swap' ? 'менять оружие' : kind === 'item' ? 'действовать' : 'атаковать'} в этом ходу нельзя.`); return false; } }
        const k = turnKeyNow();
        // 'item' — еда, зелье, посох, кубок: основное действие хода, но не атака и не заклинание (Страх и Немота не мешают)
        if (kind === 'item') {
            if (combatMarks.swap === k) { alert('В этом ходу ты уже сменил оружие — следующее действие со следующего хода.'); return false; }
            if (combatMarks.attack === k) { alert('В этом ходу ты уже атаковал или колдовал — следующее действие в следующем ходу.'); return false; }
            return true;
        }
        if ((kind === 'attack' || kind === 'cast') && combatMarks.swap === k) { alert('В этом ходу ты уже сменил оружие — атаковать или колдовать можно со следующего хода.'); return false; }
        // Одно основное действие за ход: атака, удар щитом или заклинание. Раньше можно было бить сколько угодно раз до «Следующего хода».
        if ((kind === 'attack' || kind === 'cast') && combatMarks.attack === k) { alert('В этом ходу ты уже атаковал или колдовал — следующее действие в следующем ходу.'); return false; }
        if (kind === 'swap' && combatMarks.attack === k) { alert('В этом ходу ты уже атаковал или колдовал — сменить оружие можно в следующем ходу.'); return false; }
        if (kind === 'swap' && combatMarks.swap === k) { alert('Оружие в этом ходу уже меняли — следующая смена в следующем ходу.'); return false; }
        return true;
    }
    function markCombatAction(kind) { if (inCombatNow()) { combatMarks[kind] = turnKeyNow(); } }

    var WEAPON_HAND_SLOTS = ['melee', 'melee_offhand', 'ranged', 'shield']; // var: applyItemToSlot может вызваться раньше этой строки
    var _handsBatch = false; // смена оружия из блока «В руках» — одно действие на несколько слотов
    function unequipHand(key) {
        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        if (key === 'meleeWeapon') { equippedSlots.meleeWeapon = null; setV('wep-melee-name', 'Бой голыми руками'); setV('wep-melee-dmg', 2); setV('wep-melee-type', 'unarmed'); }
        else if (key === 'meleeWeaponOffhand') { equippedSlots.meleeWeaponOffhand = null; setV('wep-melee-offhand-name', ''); setV('wep-melee-offhand-dmg', 0); const d = document.getElementById('chk-dual-wield'); if (d) d.checked = false; }
        else if (key === 'shield') { equippedSlots.shield = null; setV('slot-shield-name', ''); setV('slot-shield-armor', 0); }
        else if (key === 'rangedWeapon') { setV('active-combat-weapon', 'melee'); } // лук остаётся за спиной — просто не в руках
    }
    function weaponItemsForHand(left) {
        return playerInventory.filter(i => i.count > 0 && (left
            ? (i.slot === 'shield' || (i.slot === 'melee' && String(i.category || '').indexOf('Двуруч') === -1 && !/^twohand/.test(String(i.weaponType || ''))))
            : (i.slot === 'melee' || i.slot === 'ranged')));
    }
    window.renderWeaponSwapBox = function () {
        const lab = document.getElementById('hands-state-label'); if (!lab) return;
        const h = playerHandsState();
        lab.textContent = h.label + (h.free >= 2 ? ' — можно колдовать, в т.ч. усиленно' : h.free === 1 ? ' — обычный каст можно, усиленный нет' : ' — колдовать нельзя');
        const box = document.getElementById('weapon-swap-box'); if (!box || !box.open) return;
        const opt = (i, cur) => `<option value="${escHtml(i.itemId)}" ${cur === i.itemId ? 'selected' : ''}>${escHtml(i.name)}${typeof i.weaponDmg === 'number' ? ' (урон ' + i.weaponDmg + ')' : typeof i.armorValue === 'number' ? ' (броня ' + i.armorValue + ')' : ''}${escHtml(weaponWhereLabel(i))}</option>`;
        const curMain = (document.getElementById('active-combat-weapon') || {}).value === 'ranged' ? equippedSlots.rangedWeapon : equippedSlots.meleeWeapon;
        document.getElementById('swap-main-select').innerHTML = '<option value="">— пусто (без оружия) —</option>' + weaponItemsForHand(false).map(i => opt(i, curMain)).join('');
        const curLeft = equippedSlots.meleeWeaponOffhand || equippedSlots.shield;
        document.getElementById('swap-left-select').innerHTML = '<option value="">— пусто —</option>' + weaponItemsForHand(true).map(i => opt(i, curLeft)).join('');
        document.getElementById('swap-note').textContent = inCombatNow()
            ? '⚔ Идёт бой: из ножен и в ножны — бонусное действие (атаковать можно); через рюкзак — основное действие (в этом ходу уже не атаковать и не колдовать).'
            : 'Вне боя оружие меняется свободно.';
    };
    // Смена того, что в руках. Оружие, которое уходит из рук, ложится в свободные подходящие ножны (иначе — в рюкзак),
    // а то, что берём, достаём из ножен (иначе — из рюкзака). Всё через ножны — бонусное действие (атаковать и колдовать
    // в этом ходу можно), хоть что-то через рюкзак — основное действие (в этом ходу уже не атаковать). Вне боя — свободно.
    function currentHandItems() {
        const inv = id => id ? playerInventory.find(i => i.itemId === id && i.count > 0) : null;
        const ranged = (document.getElementById('active-combat-weapon') || {}).value === 'ranged';
        return { main: ranged ? inv(equippedSlots.rangedWeapon) : inv(equippedSlots.meleeWeapon), left: inv(equippedSlots.meleeWeaponOffhand) || inv(equippedSlots.shield) };
    }
    function planHandsChange(mainIt, leftIt) {
        const cur = currentHandItems();
        const curList = [cur.main, cur.left].filter(Boolean), want = [mainIt, leftIt].filter(Boolean);
        // сопоставляем по itemId с учётом одинаковых предметов (два одинаковых меча)
        const stay = [], arriving = [], leaving = [];
        const pool = curList.slice();
        want.forEach(w => { const i = pool.findIndex(c => c.itemId === w.itemId); if (i !== -1) { stay.push(pool.splice(i, 1)[0]); } else arriving.push(w); });
        leaving.push(...pool);
        const moves = [], usedSheaths = [];
        let viaBackpack = false;
        arriving.forEach(it => {
            const k = Object.keys(sheathSlots).find(x => sheathSlots[x].holds === it.itemId && sheathItemAt(x) && usedSheaths.indexOf(x) === -1);
            if (k) { usedSheaths.push(k); moves.push({ type: 'draw', item: it, slot: k }); }
            else { viaBackpack = true; moves.push({ type: 'draw', item: it, slot: null }); }
        });
        const reserved = [];
        leaving.forEach(it => {
            // ножны, из которых в эту же смену достаём оружие, освобождаются и годятся под убираемое
            const kind = weaponSheathKind(it);
            const k = Object.keys(sheathSlots).find(x => { const inf = sheathInfo(sheathItemAt(x)); return inf && inf.kind === kind && reserved.indexOf(x) === -1 && (!sheathSlots[x].holds || usedSheaths.indexOf(x) !== -1); });
            if (k) { reserved.push(k); moves.push({ type: 'stow', item: it, slot: k }); }
            else { viaBackpack = true; moves.push({ type: 'stow', item: it, slot: null }); }
        });
        return { moves, cost: !moves.length ? 'none' : viaBackpack ? 'main' : 'bonus' };
    }
    function describeMoves(plan) {
        return plan.moves.map(m => (m.type === 'draw' ? 'достаёт' : 'убирает') + ' «' + m.item.name + '» ' + (m.slot ? (m.type === 'draw' ? 'из ножен (' : 'в ножны (') + SHEATH_SLOT_NAMES[m.slot] + ')' : (m.type === 'draw' ? 'из рюкзака' : 'в рюкзак'))).join(', ');
    }
    function doHandsChange(mainIt, leftIt) {
        const plan = planHandsChange(mainIt, leftIt);
        if (plan.cost === 'none') { alert('В руках уже это.'); return false; }
        if (plan.cost === 'main' && !combatActionAllowed('swap')) return false;
        if (plan.cost === 'bonus' && !bonusActionAllowed('сменить оружие через ножны')) return false;
        _handsBatch = true;
        try {
            plan.moves.forEach(m => { if (m.type === 'draw' && m.slot) sheathSlots[m.slot].holds = null; });
            plan.moves.forEach(m => { if (m.type === 'stow' && m.slot) sheathSlots[m.slot].holds = m.item.itemId; });
            unequipHand('meleeWeaponOffhand'); unequipHand('shield');
            if (!mainIt) unequipHand('meleeWeapon');
            if (mainIt && mainIt.slot === 'ranged') { unequipHand('meleeWeapon'); applyItemToSlot(mainIt, 'ranged'); document.getElementById('active-combat-weapon').value = 'ranged'; }
            else {
                document.getElementById('active-combat-weapon').value = 'melee';
                if (mainIt) applyItemToSlot(mainIt, 'melee');
            }
            if (leftIt) applyItemToSlot(leftIt, leftIt.slot === 'shield' ? 'shield' : 'melee_offhand');
        } finally { _handsBatch = false; }
        if (plan.cost === 'main') markCombatAction('swap'); else markBonusAction();
        renderEquippedSummary(); renderAllSlotPickers(); updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        try { refreshEnhancedButtons(); } catch (e) { }
        window.renderWeaponSwapBox(); window.renderSheathSlots();
        saveLocalStorage();
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (inCombatNow() && window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`✋ ${nm} ${describeMoves(plan)} — ${plan.cost === 'main' ? 'основное действие' : 'бонусное действие'}. В руках: ${playerHandsState().label}.`, nm);
        return true;
    }
    window.swapWeaponsInCombat = function () {
        const mainId = document.getElementById('swap-main-select').value, leftId = document.getElementById('swap-left-select').value;
        const mainIt = mainId ? playerInventory.find(i => i.itemId === mainId) : null, leftIt = leftId ? playerInventory.find(i => i.itemId === leftId) : null;
        const mainTwo = mainIt && (mainIt.slot === 'ranged' || String(mainIt.category || '').indexOf('Двуруч') !== -1 || /^twohand/.test(String(mainIt.weaponType || '')));
        if (mainTwo && leftIt) { alert('«' + mainIt.name + '» держат обеими руками — левую руку оставь пустой.'); return; }
        if (mainIt && leftIt && mainIt.itemId === leftIt.itemId && mainIt.count < 2) { alert('Это один предмет — в обе руки не взять.'); return; }
        doHandsChange(mainIt, leftIt);
    };
    window.sheatheWeaponsInCombat = function () { doHandsChange(null, null); };
    // Переключатель «Используемое в бою оружие» в бою — это тоже смена оружия в руках.
    window.onActiveWeaponChanged = function (sel) {
        const want = sel.value, prev = want === 'ranged' ? 'melee' : 'ranged';
        if (!inCombatNow()) { updateAll(); saveLocalStorage(); if (window.renderWeaponSwapBox) window.renderWeaponSwapBox(); return; }
        sel.value = prev; // откатываем: смену проведёт doHandsChange со стоимостью действия
        const inv = id => id ? playerInventory.find(i => i.itemId === id && i.count > 0) : null;
        const target = want === 'ranged' ? inv(equippedSlots.rangedWeapon) : inv(equippedSlots.meleeWeapon);
        if (want === 'ranged' && !target) { alert('Лук/арбалет не надет.'); return; }
        doHandsChange(target, null);
    };
    function weaponWhereLabel(it) {
        const k = sheathSlotOfWeapon(it.itemId);
        const cur = currentHandItems();
        if ((cur.main && cur.main.itemId === it.itemId) || (cur.left && cur.left.itemId === it.itemId)) return ' — в руках';
        return k ? ' — в ножнах (' + SHEATH_SLOT_NAMES[k] + ', бонусное действие)' : ' — в рюкзаке';
    }

    // ---------- Ножны и колчаны ----------
    // Слоты: belt1, belt2 (пояс), back1, back2 (спина). В слоте — ножны (предмет инвентаря) и, если это ножны оружия,
    // одно оружие (itemId) внутри. Колчаны оружие не держат: колчан нужного типа просто разрешает стрелять
    // без действия «достать стрелу/болт из рюкзака».
    var SHEATH_KINDS = {
        dagger: { label: 'кинжал', back: false }, sword: { label: 'меч', back: false }, axe: { label: 'боевой топор', back: false }, mace: { label: 'булава', back: false },
        greatsword: { label: 'двуручный меч', back: true }, battleaxe: { label: 'секира', back: true }, warhammer: { label: 'боевой молот', back: true },
        bow: { label: 'лук', back: true }, crossbow: { label: 'арбалет', back: true }, shield: { label: 'щит', back: true },
        // по правилам стола: ножны копья и посоха — как двуручные (только спина), ножны пики — как одноручные (пояс или спина)
        spear: { label: 'копьё', back: true }, staff: { label: 'посох', back: true }, pike: { label: 'пика', back: false },
        quiverArrows: { label: 'стрелы', back: false, quiver: 'arrow' }, quiverBolts: { label: 'болты', back: false, quiver: 'bolt' }
    };
    var SHEATH_SLOT_NAMES = { belt1: 'Пояс 1', belt2: 'Пояс 2', back1: 'Спина 1', back2: 'Спина 2' };
    var sheathSlots = normalizeSheathSlots(null); // var: сохранение может вызваться раньше этой строки
    function normalizeSheathSlots(raw) {
        const o = {};
        Object.keys(SHEATH_SLOT_NAMES || { belt1: 1, belt2: 1, back1: 1, back2: 1 }).forEach(k => {
            const v = raw && raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
            o[k] = { id: v.id || null, holds: v.holds || null };
        });
        return o;
    }
    function sheathInfo(item) {
        if (!item) return null;
        let kind = item.sheathKind, armor = item.sheathArmor;
        if (!kind && window.allItems) { const p = window.allItems.find(x => x.name === item.name && x.sheathKind); if (p) { kind = p.sheathKind; armor = p.sheathArmor; } }
        return kind && SHEATH_KINDS[kind] ? { kind, armor: parseInt(armor) || 0, meta: SHEATH_KINDS[kind] } : null;
    }
    // Кастеты (боевые перчатки/наручи): по категории «Кастеты», типу onehand:кастет или названию.
    function isKastetItem(item) {
        if (!item) return false;
        return /кастет/i.test(String(item.category || '')) || /кастет/.test(String(item.weaponType || '')) || /кастет|боев\S* (перчатк|наруч)/i.test(String(item.name || ''));
    }
    // В какие ножны лезет оружие (null — ни в какие: кастеты носят на руках, прочее без ножен — в рюкзаке).
    function weaponSheathKind(item) {
        if (!item) return null;
        if (item.slot === 'shield') return 'shield';
        const wt = String(item.weaponType || ''), n = String(item.name || '').toLowerCase(), cat = String(item.category || '');
        if (item.slot === 'ranged' || /^ranged/.test(wt)) return (/арбалет/.test(n) || wt === 'ranged:арбалет') ? 'crossbow' : 'bow';
        if (isKastetItem(item)) return null; // кастеты носят на руках, ножен под них нет
        if (/посох/.test(n) || wt === 'twohand:посох' || item.isStaff || /^Посох/.test(cat)) return 'staff';
        if (/пик[аи]/.test(n) || wt === 'twohand:пика') return 'pike';
        if (/коп[ьё]/.test(n) || wt === 'onehand:копьё') return 'spear';
        if (wt === 'dagger' || /кинжал/.test(n)) return 'dagger';
        if (wt === 'twohand_sword') return 'greatsword';
        if (wt === 'twohand_axe' || /секир/.test(n)) return 'battleaxe';
        if (wt === 'twohand_hammer' || /молот/.test(n)) return 'warhammer';
        if (/^twohand/.test(wt) || /пик[аи]|посох/.test(n)) return null;
        const twoCat = cat.indexOf('Двуруч') !== -1 || /двуручн/.test(n); // лут мастера кладёт двуручное с категорией «Оружие» — смотрим и название
        if (twoCat && /меч/.test(n)) return 'greatsword';
        if (twoCat) return null;
        if (wt === 'onehand:булава' || /булав/.test(n)) return 'mace';
        if (wt === 'onehand:топор' || /топор/.test(n)) return 'axe';
        if (/кастет/.test(n) || wt === 'onehand:кастет') return null;
        if (wt === 'onehand' || /меч|клинок|сабл|ятаган|катан/.test(n)) return 'sword';
        return null;
    }
    function sheathItemAt(slotKey) { const sl = sheathSlots[slotKey]; return sl && sl.id ? playerInventory.find(i => i.itemId === sl.id && i.count > 0) : null; }
    function sheathArmorBonus() {
        if (!sheathSlots) return 0;
        return Object.keys(sheathSlots).reduce((sum, k) => { const inf = sheathInfo(sheathItemAt(k)); return sum + (inf ? inf.armor : 0); }, 0);
    }
    function hasQuiverFor(ammo) { // ammo: 'arrow' | 'bolt'
        return Object.keys(sheathSlots || {}).some(k => { const inf = sheathInfo(sheathItemAt(k)); return inf && inf.meta.quiver === ammo; });
    }
    function sheathSlotOfWeapon(itemId) { return Object.keys(sheathSlots).find(k => sheathSlots[k].holds === itemId && sheathItemAt(k)) || null; }
    // Свободные ножны под это оружие (не занятые и не «зарезервированные» под другое в этой же смене).
    function freeSheathFor(item, reserved) {
        const kind = weaponSheathKind(item); if (!kind) return null;
        return Object.keys(sheathSlots).find(k => { const inf = sheathInfo(sheathItemAt(k)); return inf && inf.kind === kind && !sheathSlots[k].holds && (reserved || []).indexOf(k) === -1; }) || null;
    }
    // Сколько штук предмета уже «занято» (в руках + в ножнах) — нельзя повесить один меч в две ножны.
    function itemUsedCount(itemId) {
        let n = Object.keys(sheathSlots).filter(k => sheathSlots[k].holds === itemId).length;
        ['meleeWeapon', 'meleeWeaponOffhand', 'shield'].forEach(k => { if (equippedSlots[k] === itemId) n++; });
        if (equippedSlots.rangedWeapon === itemId && (document.getElementById('active-combat-weapon') || {}).value === 'ranged') n++;
        return n;
    }
    // Ножны пропали из инвентаря (продали/выбросили) — слот пустеет; оружие в них остаётся в рюкзаке.
    function cleanupSheathSlots() {
        Object.keys(sheathSlots).forEach(k => {
            const sl = sheathSlots[k];
            if (sl.id && !sheathItemAt(k)) { sl.id = null; sl.holds = null; }
            if (sl.holds && !playerInventory.some(i => i.itemId === sl.holds && i.count > 0)) sl.holds = null;
            const usedN = Object.keys(sheathSlots).filter(x => sheathSlots[x].id === sl.id).length;
            const item = sheathItemAt(k);
            if (item && usedN > item.count) { sl.id = null; sl.holds = null; }
        });
    }
    window.renderSheathSlots = function () {
        const box = document.getElementById('sheath-slots'); if (!box) return;
        cleanupSheathSlots();
        const sheaths = playerInventory.filter(i => i.count > 0 && sheathInfo(i));
        box.innerHTML = Object.keys(SHEATH_SLOT_NAMES).map(k => {
            const back = k.indexOf('back') === 0, sl = sheathSlots[k], it = sheathItemAt(k), inf = sheathInfo(it);
            const opts = '<option value="">— пусто —</option>' + sheaths.filter(i => back || !sheathInfo(i).meta.back).map(i => {
                const busy = Object.keys(sheathSlots).filter(x => x !== k && sheathSlots[x].id === i.itemId).length;
                return busy >= i.count ? '' : `<option value="${escHtml(i.itemId)}" ${sl.id === i.itemId ? 'selected' : ''}>${escHtml(i.name)}</option>`;
            }).join('');
            let inner = '';
            if (inf && !inf.meta.quiver) {
                const w = sl.holds ? playerInventory.find(i => i.itemId === sl.holds) : null;
                const fits = playerInventory.filter(i => i.count > 0 && weaponSheathKind(i) === inf.kind && (i.itemId === sl.holds || itemUsedCount(i.itemId) < i.count));
                inner = w ? `<span>⚔ ${escHtml(w.name)}</span> <button type="button" style="width:auto; padding:1px 8px; font-size:12px;" onclick="sheathTake('${k}')">В рюкзак</button>`
                    : (fits.length ? `<select id="sheath-put-${k}" style="width:auto; font-size:12px;">${fits.map(i => `<option value="${escHtml(i.itemId)}">${escHtml(i.name)}</option>`).join('')}</select> <button type="button" style="width:auto; padding:1px 8px; font-size:12px;" onclick="sheathPut('${k}')">Вложить</button>` : `<span style="opacity:.6;">пусто — подходящего оружия (${inf.meta.label}) нет</span>`);
            } else if (inf && inf.meta.quiver) inner = `<span style="opacity:.75;">🏹 ${inf.meta.quiver === 'arrow' ? 'стрелы — без лишнего действия' : 'болты — без лишнего действия'}</span>`;
            return `<div class="slot-row st-sheath-row"><span>${back ? '🎒' : '🪢'} ${SHEATH_SLOT_NAMES[k]}:</span>
                <select style="flex:0 1 220px;" onchange="sheathEquip('${k}', this.value)">${opts}</select>
                <span class="st-sheath-inner">${inner}${inf && inf.armor ? ` <span style="opacity:.7;">(+${inf.armor} броня)</span>` : ''}</span></div>`;
        }).join('') + (sheaths.length ? '' : '<p style="font-size:13px; opacity:.6;">Ножен нет. Продаются у кузнеца, барахольщика и торговца луками, делаются в кузнице (3 кожи + 4 полоски кожи).</p>');
    };
    window.sheathEquip = function (slotKey, itemId) {
        const sl = sheathSlots[slotKey]; if (!sl) return;
        if (!itemId) { sl.id = null; sl.holds = null; }
        else {
            const it = playerInventory.find(i => i.itemId === itemId); const inf = sheathInfo(it);
            if (!inf) return;
            if (inf.meta.back && slotKey.indexOf('back') !== 0) { alert('Эти ножны вешаются только на спину.'); window.renderSheathSlots(); return; }
            if (sl.id !== itemId) sl.holds = null; // другие ножны — оружие из прежних уходит в рюкзак
            sl.id = itemId;
        }
        updateAll(); saveLocalStorage(); window.renderSheathSlots(); if (window.renderWeaponSwapBox) window.renderWeaponSwapBox();
    };
    window.sheathPut = function (slotKey) {
        const sel = document.getElementById('sheath-put-' + slotKey); if (!sel || !sel.value) return;
        // Из рюкзака в ножны в бою — возня с оружием: основное действие (как смена оружия без ножен).
        if (inCombatNow() && !combatActionAllowed('swap')) return;
        sheathSlots[slotKey].holds = sel.value;
        if (inCombatNow()) markCombatAction('swap');
        saveLocalStorage(); window.renderSheathSlots(); if (window.renderWeaponSwapBox) window.renderWeaponSwapBox();
    };
    window.sheathTake = function (slotKey) {
        if (inCombatNow() && !combatActionAllowed('swap')) return;
        sheathSlots[slotKey].holds = null;
        if (inCombatNow()) markCombatAction('swap');
        saveLocalStorage(); window.renderSheathSlots(); if (window.renderWeaponSwapBox) window.renderWeaponSwapBox();
    };
    // Бонусное действие (ножны, подсумок): одно за ход в бою. Не мешает атаке/касту.
    function bonusActionAllowed(what) {
        if (!inCombatNow()) return true;
        if (combatMarks.bonus === turnKeyNow()) { alert(`Бонусное действие в этом ходу уже потрачено — ${what} можно в следующем ходу.`); return false; }
        return true;
    }
    function markBonusAction() { if (inCombatNow()) combatMarks.bonus = turnKeyNow(); }
    // Стрельба без колчана: стрелу/болт надо достать из рюкзака — это действие хода, выстрел в следующем ходу.
    function rangedAmmoReady() {
        if (!inCombatNow()) return true;
        const rw = equippedSlots.rangedWeapon ? playerInventory.find(i => i.itemId === equippedSlots.rangedWeapon) : null;
        const ammo = weaponSheathKind(rw || { slot: 'ranged', name: (document.getElementById('wep-ranged-name') || {}).value || '' }) === 'crossbow' ? 'bolt' : 'arrow';
        if (hasQuiverFor(ammo)) return true;
        const T = turnKeyNow();
        if (combatMarks.nock && combatMarks.nock !== T) { combatMarks.nock = null; return true; } // достал в прошлом ходу — стреляем
        if (combatMarks.nock === T) { alert(`${ammo === 'bolt' ? 'Болт' : 'Стрела'} уже в руке — выстрелить можно в следующем ходу.`); return false; }
        if (!combatActionAllowed('attack')) return false;
        if (combatMarks.attack === T) { alert('В этом ходу ты уже действовал — достать боеприпас можно в следующем ходу.'); return false; }
        if (!confirm(`Колчана для ${ammo === 'bolt' ? 'болтов' : 'стрел'} нет — ${ammo === 'bolt' ? 'болт' : 'стрелу'} надо достать из рюкзака. Это действие этого хода, выстрелить можно в следующем. Достать?`)) return false;
        combatMarks.nock = T; markCombatAction('attack'); saveLocalStorage();
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🏹 ${nm} достаёт ${ammo === 'bolt' ? 'болт' : 'стрелу'} из рюкзака (колчана нет) — выстрел в следующем ходу.`, nm);
        return false;
    }

    // ---------- Животные (pets-data.js) ----------
    var playerPets = [], playerRiding = false; // var: сохранение/пересчёт могут вызваться раньше этой строки
    function petTemplatesAll() {
        const s = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        return (window.PET_TEMPLATES || []).concat(Array.isArray(s && s.customPets) ? s.customPets : []);
    }
    function makePetFromTemplate(t, name) {
        const hp = Math.max(1, parseInt(t.hp) || 1);
        return { id: 'pet-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tplId: t.id || '', icon: t.icon || '🐾', kind: t.kind || t.name,
            name: name || t.name, hp, maxHp: hp, loot: Array.isArray(t.loot) ? t.loot : [], rideable: !!t.rideable, dead: false, looted: false };
    }
    function ridingHorse() {
        if (!playerRiding) return null;
        return playerPets.find(p => p.rideable && !p.dead) || null;
    }
    window.ridingHorse = ridingHorse;
    function applyPetHpDelta(petId, delta) {
        const p = playerPets.find(x => x.id === petId); if (!p || p.dead) return '';
        p.hp = Math.max(0, Math.min(p.maxHp, (parseInt(p.hp) || 0) + delta));
        if (p.hp <= 0) {
            p.dead = true;
            if (p.rideable && playerRiding && !ridingHorse()) playerRiding = false;
            return `${p.icon} «${p.name}» погиб(ла) — тело можно обыскать во вкладке «Инвентарь» → «Животные»`;
        }
        return `${p.icon} «${p.name}»: ${delta > 0 ? '+' : ''}${delta} ХП (${p.hp}/${p.maxHp})`;
    }
    window.renderPetsPanel = function () {
        const sum = document.getElementById('pets-summary');
        const alive = playerPets.filter(p => !p.dead);
        if (sum) sum.textContent = playerPets.length ? `— ${alive.length} живых${ridingHorse() ? ', верхом' : ''}` : '— нет';
        const panel = document.getElementById('pets-panel'); if (!panel || !panel.open) return;
        const list = document.getElementById('pets-list'), shop = document.getElementById('pets-shop');
        list.innerHTML = playerPets.length ? playerPets.map(p => {
            const pct = p.maxHp ? Math.round(100 * p.hp / p.maxHp) : 0;
            return `<div class="party-row" style="padding:6px 8px;">
                <div class="row-name"><span>${p.icon || '🐾'} <strong>${escHtml(p.name)}</strong> <span style="opacity:.6;">(${escHtml(p.kind || '')})</span></span>
                <span>${p.dead ? '☠ погиб' : `ХП ${p.hp}/${p.maxHp}`}</span></div>
                ${p.dead ? '' : `<div class="bar-track"><div class="bar-fill-hp" style="width:${pct}%"></div></div>`}
                <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap;">
                    ${p.rideable && !p.dead ? `<label style="font-size:13px; margin:0;"><input type="checkbox" style="width:auto;" ${ridingHorse() && ridingHorse().id === p.id ? 'checked' : ''} onchange="toggleRiding('${jsq(p.id)}', this)"> 🐎 Верхом (+${(window.PET_RIDING || {}).speed || 15} скорости, +${(window.PET_RIDING || {}).carry || 100} к весу; урон 70% лошади / 30% тебе)</label>` : ''}
                    ${p.dead && !p.looted ? `<button type="button" class="btn-success" style="width:auto; padding:2px 8px;" onclick="lootPet('${jsq(p.id)}')">🔍 Обыскать тело</button>` : ''}
                    <button type="button" class="btn-danger" style="width:auto; padding:2px 8px;" onclick="releasePet('${jsq(p.id)}')">${p.dead ? 'Убрать' : 'Отпустить'}</button>
                </div></div>`;
        }).join('') : '<p style="opacity:.6; font-size:14px;">Животных нет. Купить можно у продавцов ниже.</p>';
        const sess = window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() ? window.CloudSync.getSessionData() : null;
        if (sess) { // в сессии животных продают живые торговцы, которых завозит мастер (конюшни, продавец собак…)
            const stocks = sess.merchantStocks || {};
            const rows = [];
            Object.keys(stocks).filter(k => stocks[k] && stocks[k].pets).forEach(k => (stocks[k].items || []).forEach((it, idx) => {
                if (!it.pet) return;
                const disp = stocks[k].disposition || 0;
                const price = Math.max(1, Math.round(computeBuyPrice(it.price, it.category, k) * getReputationPriceMult(stocks[k].hold) * ({ '-1': 1.25, '0': 1, '1': 0.9, '2': 0.8 }[String(disp)] || 1)));
                rows.push(`<div class="party-row" style="padding:5px 8px; display:flex; justify-content:space-between; gap:8px; align-items:center;">
                <span>${it.pet.icon || '🐾'} <strong>${escHtml(it.name)}</strong> — ХП ${parseInt(it.pet.hp) || 0}${it.pet.rideable ? ', верховое' : ''}${(it.qty || 1) > 1 ? ` (есть: ${it.qty})` : ''} · <span style="opacity:.7;">${escHtml(stocks[k].label || 'Продавец')}, ${escHtml(stocks[k].hold || '')}</span></span>
                <button type="button" class="btn-success" style="width:auto; padding:2px 10px;" ${disp <= -2 ? 'disabled title="Торговец отказывается вести дела"' : ''} onclick="buyFromMerchant('${jsq(k)}', ${idx})">Купить за ${formatNumber(price)}</button></div>`);
            }));
            shop.innerHTML = '<div style="font-size:13px; opacity:.75; margin-bottom:4px;">Животных продают торговцы, которых завозит мастер (их же видно во вкладке торговли в списке торговцев). Покупать можно только в городе.</div>' +
                (rows.length ? rows.join('') : '<p style="opacity:.6;">Мастер ещё не завёз торговцев животными. Собаки — в Маркарте, злокрысы — в Морфале, морозные пауки — в Рифтене, лошади — на конюшнях Вайтрана, Солитьюда, Виндхельма, Маркарта и Рифтена.</p>');
            return;
        }
        // вне сессии — как раньше: справочник продавцов без проверки места
        const offers = [];
        petTemplatesAll().forEach(t => (t.sellers || []).forEach(sel => offers.push({ t, sel })));
        shop.innerHTML = '<div style="font-size:13px; opacity:.75; margin-bottom:4px;">Вне сессии место не проверяется.</div>' +
            offers.map(o => `<div class="party-row" style="padding:5px 8px; display:flex; justify-content:space-between; gap:8px; align-items:center;">
                <span>${o.t.icon || '🐾'} <strong>${escHtml(o.t.name)}</strong> — ХП ${parseInt(o.t.hp) || 0}${o.t.rideable ? ', верховое' : ''} · <span style="opacity:.7;">${escHtml(o.sel.who || 'Продавец')}, ${escHtml(o.sel.city || o.sel.place || o.sel.hold || '')}</span></span>
                <button type="button" class="btn-success" style="width:auto; padding:2px 10px;" onclick="buyPet('${jsq(o.t.id)}')">Купить за ${formatNumber(parseInt(o.t.price) || 0)}</button></div>`).join('');
    };
    window.buyPet = function (tplId) {
        const t = petTemplatesAll().find(x => x.id === tplId); if (!t) return;
        // в сессии — только у живых торговцев (renderPetsPanel → buyFromMerchant), здесь покупка без сессии
        if (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession()) { alert('В сессии животных покупают у торговцев, которых завозит мастер (конюшни, продавец собак…).'); return; }
        const price = parseInt(t.price) || 0;
        const goldEl = document.getElementById('char-gold');
        const gold = parseInt(goldEl.value) || 0;
        if (gold < price) { alert(`Не хватает золота: нужно ${price}, у тебя ${gold}.`); return; }
        const name = prompt(`Купить «${t.name}» за ${price} септимов? Как назовёшь?`, t.name);
        if (name === null) return;
        goldEl.value = gold - price;
        playerPets.push(makePetFromTemplate(t, (name || '').trim() || t.name));
        updateAll(); saveLocalStorage(true); window.renderPetsPanel();
        const nm = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (window.CloudSync && window.CloudSync.isInSession && window.CloudSync.isInSession() && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(`🐾 ${nm} покупает: ${t.name} «${(name || '').trim() || t.name}» за ${price} септимов.`, nm);
    };
    window.toggleRiding = function (petId, chk) {
        const p = playerPets.find(x => x.id === petId);
        playerRiding = !!(chk.checked && p && p.rideable && !p.dead);
        if (playerRiding) { // садимся на эту лошадь: остальные верховые — в поводу
            playerPets.sort((a, b) => (a.id === petId ? -1 : b.id === petId ? 1 : 0));
        }
        updateAll(); saveLocalStorage(true); window.renderPetsPanel();
    };
    function petLootItem(l) {
        const qty = Math.max(1, parseInt(l.qty) || 1);
        const db = (window.allItems || []).find(i => i.name === l.name) || (window.alchemyPremadePotions || []).find(i => i.name === l.name);
        if (db) addToInventory(db.name, db.name, qty, db.weight || 0, /^Зель/i.test(db.category || '') ? 'Зелье' : (db.category || ''), db.effect || '', { price: db.price, alchemyEffects: db.alchemyEffects, slot: db.slot, armorValue: db.armor, weaponDmg: db.dmg });
        else addToInventory(l.name, l.name, qty, 0.5, 'Добыча', '', { price: parseInt(l.price) || 0 });
        return '«' + l.name + '»' + (qty > 1 ? ' ×' + qty : '');
    }
    window.lootPet = function (petId) {
        const p = playerPets.find(x => x.id === petId); if (!p || !p.dead || p.looted) return;
        const got = (p.loot || []).map(petLootItem);
        p.looted = true;
        renderInventoryList(); updateAll(); saveLocalStorage(true); window.renderPetsPanel();
        alert(got.length ? 'Найдено: ' + got.join(', ') : 'Ничего полезного.');
    };
    window.releasePet = function (petId) {
        const p = playerPets.find(x => x.id === petId); if (!p) return;
        if (!confirm(p.dead ? `Убрать «${p.name}» из списка?${!p.looted ? ' Тело не обыскано — добыча пропадёт.' : ''}` : `Отпустить «${p.name}»? Деньги не вернутся.`)) return;
        playerPets = playerPets.filter(x => x.id !== petId);
        if (!ridingHorse()) playerRiding = false;
        updateAll(); saveLocalStorage(true); window.renderPetsPanel();
    };

    // ---------- Правки мастера (characters/{uid}.gmCmds) ----------
    // Мастер не пишет значения листа напрямую (их затёрло бы ближайшее автосохранение листа), а кладёт команды.
    // Лист применяет каждую ровно один раз (id запоминаются в сейве) и убирает её из документа.
    var gmCmdsApplied = []; // var, а не let: сохранение может вызваться раньше, чем исполнится эта строка
    function buildTakenPerksSummary() {
        const out = [];
        try {
            skillNames.forEach((tree, sIdx) => (fullPerksManifest[tree] || []).forEach((p, pIdx) => {
                let n = 0; for (let st = 1; st <= p.steps; st++) { const c = document.getElementById(`perk-${sIdx}-${pIdx}-${st}`); if (c && c.checked) n++; }
                if (n) out.push({ s: sIdx, p: pIdx, tree, name: p.name, taken: n, steps: p.steps });
            }));
        } catch (e) { }
        return out;
    }
    function applyGmCmds(cmds) {
        const fresh = cmds.filter(c => c && c.id && gmCmdsApplied.indexOf(c.id) === -1);
        if (!fresh.length) { ackGmCmds(cmds); return; }
        const msgs = [];
        const statIds = { str: 'stat-str', dex: 'stat-dex', con: 'stat-con', int: 'stat-int', wis: 'stat-wis', cha: 'stat-cha' };
        const statNames = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        fresh.forEach(c => {
            try {
                if (c.type === 'skill') {
                    const input = document.getElementById('skill-' + c.idx); const name = skillNames[c.idx];
                    if (!input || !name) return;
                    const race = document.getElementById('char-race').value;
                    const bonus = (raceSkillBonuses[race] && raceSkillBonuses[race][name]) || 0;
                    const raw0 = parseInt(input.getAttribute('data-raw-val')) || 10;
                    const raw = Math.max(10, Math.min(SKILL_MAX - bonus, raw0 + (parseInt(c.delta) || 0)));
                    input.setAttribute('data-raw-val', raw);
                    if (raw !== raw0) msgs.push(`«${name}» ${raw > raw0 ? '+' : ''}${raw - raw0} → ${Math.min(SKILL_MAX, raw + bonus)}`);
                } else if (c.type === 'stat' && statIds[c.key]) {
                    const st = document.getElementById(statIds[c.key]);
                    const raw0 = parseInt(st.getAttribute('data-raw-stat')) || 10;
                    const raw = Math.max(1, raw0 + (parseInt(c.delta) || 0));
                    st.setAttribute('data-raw-stat', raw);
                    if (raw !== raw0) msgs.push(`${statNames[c.key]} ${raw > raw0 ? '+' : ''}${raw - raw0}`);
                } else if (c.type === 'perkDown') {
                    const tree = skillNames[c.s]; const perk = (fullPerksManifest[tree] || [])[c.p];
                    if (!perk) return;
                    for (let st = perk.steps; st >= 1; st--) {
                        const box = document.getElementById(`perk-${c.s}-${c.p}-${st}`);
                        if (box && box.checked) { box.checked = false; if (c.refund) perkPointsAvailable += 1; msgs.push(`перк «${perk.name}» −1 ступень${c.refund ? ' (очко возвращено)' : ''}`); break; }
                    }
                } else if (c.type === 'spell') {
                    const r = learnSpellIntoBook(c.school, c.name);
                    if (r === true) msgs.push(`заклинание «${c.name}»`);
                } else if (c.type === 'pet' && c.pet) {
                    playerPets.push(makePetFromTemplate(c.pet, c.pet.name));
                    msgs.push(`животное «${c.pet.name}»`);
                } else if (c.type === 'trap') {
                    msgs.push(applyTrapToSelf(c));
                } else if (c.type === 'trapDisarm') {
                    msgs.push(tryDisarmTrap(c));
                } else if (c.type === 'keeperBarrierHit') { // мастер: барьер Перчаток Хранителя принял урон
                    keeperBarrierLeft = Math.max(0, keeperBarrierLeft - (parseInt(c.absorbed) || 0));
                    msgs.push(`барьер Перчаток Хранителя поглотил ${c.absorbed}${keeperBarrierLeft > 0 ? ` (осталось ${keeperBarrierLeft})` : ' и исчерпан до следующего дня'}`);
                } else if (c.type === 'wardHit') { // мастер: оберег принял урон заклинания
                    const w = activeTimedEffects.find(e => e.ward && e.id === c.effId) || activeTimedEffects.find(e => e.ward && e.name === c.name);
                    if (w) {
                        w.ward.left = Math.max(0, (w.ward.left || 0) - (parseInt(c.absorbed) || 0));
                        msgs.push(`оберег «${w.name}» поглотил ${c.absorbed}${w.ward.left > 0 ? ` (осталось ${w.ward.left})` : ' и рассеялся'}`);
                        if (w.ward.left <= 0) activeTimedEffects = activeTimedEffects.filter(e => e !== w);
                        renderActiveEffects();
                    }
                } else if (c.type === 'hourPassed') { // мастер: прошёл игровой час — облик зверя тает
                    const w = playerSupernaturalState && playerSupernaturalState.werewolf;
                    if (w && w.isTransformed) {
                        w.hoursLeft = Math.max(0, (typeof w.hoursLeft === 'number' ? w.hoursLeft : wolfFormHours()) - (parseInt(c.hours) || 1));
                        if (w.hoursLeft <= 0) { window.playerRevertWerewolf(); msgs.push('облик зверя закончился — ты снова человек'); }
                        else { saveSupernaturalStatePlayer(); renderSupernaturalStatusPlayer(); msgs.push(`облик зверя: осталось ${w.hoursLeft} ч`); }
                    }
                } else if (c.type === 'removeEffect') { // мастер снимает эффект (болезнь, яд, статус) — игроку самому это недоступно
                    const gone = activeTimedEffects.filter(e => e.id === c.effId || (!c.effId && (e.effectName || e.name) === c.name));
                    if (gone.length) {
                        gone.forEach(releaseSustainedAlly);
                        activeTimedEffects = activeTimedEffects.filter(e => gone.indexOf(e) === -1);
                        clampTempHp(); renderActiveEffects();
                        msgs.push('мастер снял эффект «' + (gone[0].effectName || gone[0].name) + '»');
                    }
                } else if (c.type === 'penance') { // мастер: покаяние пройдено — можно вернуться к аэдра
                    penanceAllowed = true;
                    msgs.push('покаяние пройдено — можно снова выбрать бога-аэдра');
                } else if (c.type === 'hitTaken' && c.enemyId) { // «Контрудар»: счёт попаданий по игроку от этого врага
                    counterHits[c.enemyId] = (counterHits[c.enemyId] || 0) + 1;
                } else if (c.type === 'petHp') {
                    const m = applyPetHpDelta(c.petId, parseInt(c.delta) || 0);
                    if (m) msgs.push(m);
                } else if (c.type === 'lichPerk' && c.perk) { // мастер выдал перк ветки «Рыцарь смерти» после ритуала
                    const lm = lichGrantPerk(c.perk); if (lm) msgs.push(lm);
                } else if (c.type === 'lichAdmin' && c.op) { // остальные действия мастера с веткой лича
                    const lm = lichAdminOp(c); if (lm) msgs.push(lm);
                } else if (c.type === 'quest' && c.quest && c.quest.id) { // мастер выдал квест — кладём в лист (раньше его стирало автосохранение)
                    if (!playerQuests.some(q => q.id === c.quest.id)) { playerQuests.push(c.quest); msgs.push(`квест «${c.quest.title}»`); }
                    if (typeof renderQuestList === 'function') renderQuestList();
                }
            } catch (e) { console.error('Правка мастера не применилась:', c, e); }
            gmCmdsApplied.push(c.id);
        });
        if (typeof renderLevelPanel === 'function') renderLevelPanel();
        updateAll();
        saveLocalStorage(true);
        ackGmCmds(cmds);
        if (msgs.length) {
            const t = '🎓 Мастер изменил твой лист: ' + msgs.join(', ');
            if (typeof window.alchToast === 'function') window.alchToast(escHtml(t)); else alert(t);
        }
    }
