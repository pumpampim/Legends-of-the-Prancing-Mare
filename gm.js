// ============================================================================
// GM.JS — логика экрана мастера (gm.html)
// ============================================================================

(function () {
    let auth = null;
    let db = null;
    let currentUser = null;
    let _gmHeartbeatTimer = null; // heartbeat "мастер онлайн" — см. enterSessionView
    let currentCode = null;
    let unsubSession = null;
    let unsubGmWatchedCharacter = null; // подписка на инвентарь выбранного игрока (своя, не через
                                          // cloud.js — gm.html его вообще не подключает)
    let lastData = { participants: {}, enemies: [], turnOrder: [], combatLog: [] };

    // Погода — здесь, В САМОМ НАЧАЛЕ файла, а не рядом с остальной логикой погоды: стартовая
    // инициализация (внизу файла) вызывает renderAllWeatherReference() сразу при загрузке
    // страницы, а gm.js выполняется построчно сверху вниз — если бы эти const стояли ниже места
    // вызова, при загрузке страница ловила бы "Cannot access before initialization" и вся
    // остальная инициализация после этой строки просто не происходила (инвентарь игрока,
    // порядок ходов, выбор атакующего — всё, что раньше "тихо не грузилось").
    const WEATHER_LABELS = {
        clear: '☀️ Ясно', cloudy: '☁️ Облачно', rain: '🌧️ Дождь', storm: '⛈️ Гроза',
        snow: '🌨️ Снегопад', blizzard: '🌬️ Метель', fog: '🌫️ Туман'
    };
    // Погода → штраф к дальнему бою врагов-лучников (те же числа, что у игроков: index.html WEATHER_MODS)
    const GM_WEATHER_RANGED = { rain: -2, storm: -4, blizzard: -4, fog: -4 };
    function gmWeatherRanged() { return GM_WEATHER_RANGED[(lastData && lastData.currentWeather) || 'clear'] || 0; }
    const WEATHER_EFFECTS = {
        clear: '', cloudy: '',
        rain: '−2 к дальнему бою (Стрельба), +2 к Скрытности — дождь маскирует шаги',
        storm: '−4 к дальнему бою, вспышки молний иногда выдают позицию (−2 к Скрытности при ударе)',
        snow: '−5 фт. скорости, +2 к Скрытности — снег глушит шаги',
        blizzard: '−10 фт. скорости, −4 к дальнему бою, видимость почти нулевая',
        fog: '+4 к Скрытности, −4 к дальнему бою — плохая видимость'
    };

    let gmAllItems = [];
    let gmAllItemsByKey = new Map(); // id/name → предмет, для O(1) поиска (см. loadGmItems)
    let gmFilteredItems = [];
    let currentRecipePlayerUid = null;
    let currentPlayerKnownRecipes = [];
    const GM_SESSION_KEY = 'ttrpg_gm_session_code';
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих O/0, I/1

    function el(id) { return document.getElementById(id); }

    function showOverlay(show) {
        el('auth-overlay').style.display = show ? 'flex' : 'none';
    }

    function showAuthError(msg) {
        const box = el('auth-error');
        box.textContent = msg;
        box.style.display = msg ? 'block' : 'none';
    }

    function updateStatusBar() {
        const info = el('cloud-user-info');
        const btn = el('btn-logout');
        if (currentUser) {
            info.textContent = '☁ Мастер: ' + currentUser.email;
            btn.style.display = 'inline-block';
        } else {
            info.textContent = 'Не авторизован';
            btn.style.display = 'none';
        }
    }

    function translateAuthError(e) {
        const map = {
            'auth/email-already-in-use': 'Этот email уже зарегистрирован — попробуй войти.',
            'auth/invalid-email': 'Некорректный email.',
            'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов).',
            'auth/wrong-password': 'Неверный пароль.',
            'auth/user-not-found': 'Аккаунт с таким email не найден.',
            'auth/invalid-credential': 'Неверный email или пароль.',
            'auth/too-many-requests': 'Слишком много попыток. Подожди немного.',
            'auth/popup-blocked': 'Браузер заблокировал всплывающее окно — разреши всплывающие окна для этого сайта.',
            'auth/account-exists-with-different-credential': 'Этот email уже привязан к аккаунту с другим способом входа.'
        };
        return map[e.code] || ('Ошибка: ' + e.message);
    }

    // 6.4: 1234 → «1 234» только для показа (в <input> остаются сырые числа)
    function formatNumber(n) {
        if (n === null || n === undefined || n === '' || isNaN(Number(n))) return n;
        const parts = String(Number(n)).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join('.');
    }
    window.formatNumber = formatNumber;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Строка для JS-аргумента inline-обработчика (см. jsq в index.html): экранирует \ и ', затем HTML.
    function jsq(str) { return escapeHtml(String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

    // Атомарная правка массива vitals у персонажа: свежий документ читается и пишется в ОДНОЙ транзакции,
    // поэтому параллельная запись игрока (зелье, еда, урон) не затирается. mutate(vitals, data) меняет массив на месте;
    // extra — дополнительные поля того же обновления. Раньше читали .get(), правили и писали весь массив отдельным update.
    function updateCharacterVitals(uid, mutate, extra) {
        const ref = db.collection('characters').doc(uid);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const v = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
            while (v.length < 4) v.push(0);
            mutate(v, data);
            tx.update(ref, Object.assign({ vitals: v }, extra || {}));
        }));
    }

    function genId(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // Та же формула модификатора характеристики, что у игрока (index.html) — gm.js отдельный
    // файл, общих переменных с ним нет, поэтому копия.
    // Урон врага оружием = база оружия + ЗНАЧЕНИЕ характеристики (Сила — ближний бой, Ловкость —
    // лук), как у игрока (updateCombat в index.html: baseDmg + str, а не модификатор). Раньше
    // характеристики у бандитов были, но влияли только на бросок попадания (atkMod), а сам урон
    // брался плоским weaponDmg — и генератор запекал в него лишь маленький модификатор (+1…+7).
    // Враги без характеристик (вся база enemies-data.js) считаются как прежде — stat=0.
    // TASK-001: расчёт перенесён в combat-bonuses.js (StBonuses.collectEnemyAttackBonuses) — тот же модуль, что считает
    // удар игрока. Возвращает прежние поля {base, stat, total, label} плюс разбивку {weaponEnchant, spiritFlat,
    // additivePct, mult, notes}. Запасной расчёт — на случай старого кэша страницы без нового файла.
    function enemyWeaponDamage(enemy) {
        if (window.StBonuses) return window.StBonuses.collectEnemyAttackBonuses(enemy);
        const base = enemy.weaponDmg || 0;
        if (!base) return { base: 0, stat: 0, total: 0, label: '' };
        const stat = enemy.isRanged ? (enemy.dex || 0) : (enemy.str || 0);
        return { base, stat, total: base + stat, label: enemy.isRanged ? 'ЛОВ' : 'СИЛ' };
    }

    function calcAbilityMod(val) {
        return Math.floor((val - 10) / 2);
    }

    // Firestore ЦЕЛИКОМ отвергает .set()/.update(), если хоть ОДНО поле где-то внутри (даже
    // вложенно, в массиве объектов) — undefined. Динамически собранные объекты (лут бандитов,
    // ассортимент торговцев) легко на это натыкаются — предмет без резиста/урона/слота даёт
    // undefined в этом поле. Рекурсивно чистит перед записью.
    function stripUndefinedDeep(value) {
        if (Array.isArray(value)) return value.map(stripUndefinedDeep);
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(k => {
                if (value[k] !== undefined) out[k] = stripUndefinedDeep(value[k]);
            });
            return out;
        }
        return value;
    }

    // ---------- Авторизация ----------

    window.cloudRegister = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        const email = el('auth-email').value.trim();
        const pass = el('auth-password').value;
        showAuthError('');
        auth.createUserWithEmailAndPassword(email, pass).catch(e => showAuthError(translateAuthError(e)));
    };

    window.cloudLogin = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        const email = el('auth-email').value.trim();
        const pass = el('auth-password').value;
        showAuthError('');
        auth.signInWithEmailAndPassword(email, pass).catch(e => showAuthError(translateAuthError(e)));
    };

    window.cloudLoginGoogle = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        showAuthError('');
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => {
            if (e.code === 'auth/popup-closed-by-user') return;
            showAuthError(translateAuthError(e));
        });
    };

    window.cloudLogout = function () {
        if (unsubSession) { unsubSession(); unsubSession = null; }
        if (auth) auth.signOut();
    };

    function initAuth() {
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(user => {
            currentUser = user;
            updateStatusBar();
            if (!user) {
                showOverlay(true);
                el('no-session-block').style.display = 'none';
                el('session-block').style.display = 'none';
                gmSetInSession(false);
                return;
            }
            showOverlay(false);
            const savedCode = localStorage.getItem(GM_SESSION_KEY);
            if (savedCode) {
                db.collection('sessions').doc(savedCode).get().then(doc => {
                    if (doc.exists && doc.data().gmUid === user.uid && doc.data().status === 'active') {
                        enterSessionView(savedCode);
                    } else {
                        localStorage.removeItem(GM_SESSION_KEY);
                        el('no-session-block').style.display = 'block';
                    }
                });
            } else {
                el('no-session-block').style.display = 'block';
            }
        });
    }

    // ---------- Создание / закрытие сессии ----------

    window.createSession = function () {
        cleanupOldClosedSessions(); // не ждём завершения — не блокирует создание новой сессии
        attemptCreate(0);
    };

    // Закрытые сессии раньше копились в Firestore навсегда (status:'closed', документ остаётся).
    // Настоящий TTL (авто-удаление через N дней) настраивается в консоли Firebase, программно
    // недоступен — вместо этого при каждом создании новой сессии попутно удаляем СВОИ ЖЕ старые
    // закрытые (7+ дней). Фильтруем по status+возрасту НА КЛИЕНТЕ, не в запросе — простой запрос
    // по одному полю (gmUid) не требует составного индекса в Firestore, а два where() рядом (status
    // + диапазон по дате) потребовали бы его настройки в консоли.
    function cleanupOldClosedSessions() {
        if (!currentUser) return;
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        db.collection('sessions').where('gmUid', '==', currentUser.uid).get().then(snap => {
            snap.forEach(doc => {
                const d = doc.data();
                if (d.status !== 'closed' || !d.closedAt) return;
                // сундук отряда ещё не перенесён в новую сессию — не удаляем, иначе вещи пропадут
                if (!d.stashInherited && ((Array.isArray(d.partyStash) && d.partyStash.length) || (parseInt(d.partyGold) || 0) > 0)) return;
                const closedMs = d.closedAt.toMillis ? d.closedAt.toMillis() : 0;
                if (closedMs && closedMs < weekAgo) {
                    doc.ref.delete().catch(e => console.error('Ошибка чистки старой сессии:', e));
                }
            });
        }).catch(e => console.error('Ошибка поиска старых сессий для чистки:', e));
    }

    // Собирает сундук отряда из закрытых сессий этого мастера, которые ещё не были перенесены (фильтр на клиенте — без составного индекса).
    function gmCollectInheritedStash() {
        const out = { stash: [], gold: 0, refs: [] };
        if (!currentUser) return Promise.resolve(out);
        return db.collection('sessions').where('gmUid', '==', currentUser.uid).get().then(snap => {
            snap.forEach(doc => {
                const d = doc.data();
                if (d.status !== 'closed' || d.stashInherited) return;
                const items = Array.isArray(d.partyStash) ? d.partyStash : [], gold = parseInt(d.partyGold) || 0;
                if (!items.length && gold <= 0) return;
                items.forEach(it => {
                    const ex = typeof window.findSameStack === 'function' ? window.findSameStack(out.stash, it) : out.stash.find(x => x.itemId === it.itemId);
                    if (ex) ex.count = (ex.count || 0) + (it.count || 0); else out.stash.push(Object.assign({}, it));
                });
                out.gold += gold; out.refs.push(doc.ref);
            });
            return out;
        }).catch(e => { console.error('Перенос сундука:', e); return out; });
    }

    function attemptCreate(tries) {
        if (tries > 5) { alert('Не удалось сгенерировать свободный код, попробуй ещё раз.'); return; }
        let code = '';
        for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        db.collection('sessions').doc(code).get().then(doc => {
            if (doc.exists) { attemptCreate(tries + 1); return; }
            // Сундук отряда переживает закрытие сессии: переносим вещи и золото из закрытых сессий этого мастера в новую.
            gmCollectInheritedStash().then(inh => {
                const base = {
                    gmUid: currentUser.uid,
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    participants: {},
                    enemies: [],
                    initiative: [],
                    combatLog: []
                };
                if (inh.stash.length) base.partyStash = inh.stash;
                if (inh.gold > 0) base.partyGold = inh.gold;
                return db.collection('sessions').doc(code).set(base).then(() => {
                    inh.refs.forEach(r => r.update({ stashInherited: true, stashInheritedTo: code }).catch(() => {}));
                    localStorage.setItem(GM_SESSION_KEY, code);
                    enterSessionView(code);
                    if (inh.stash.length || inh.gold > 0) setTimeout(() => alert('🎒 Сундук отряда перенесён из прошлой сессии: ' + inh.stash.length + ' предм. и ' + inh.gold + ' зол.'), 300);
                });
            });
        });
    }

    // Незавершённые обмены при закрытии сессии: предметы/золото отправителя лежат ЗАЛОГОМ в документе сессии и после закрытия пропали бы.
    // Возвращаем их владельцам напрямую в инвентарь (транзакцией); принятые, но ещё не применённые обмены дозавершаем.
    function gmSettleTradesBeforeClose() {
        const trades = (lastData && lastData.trades) || {};
        const ids = Object.keys(trades);
        const grant = (uid, items, gold) => {
            if (!uid || (!(items && items.length) && !gold)) return Promise.resolve();
            const ref = db.collection('characters').doc(uid);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
                (items || []).forEach(it => {
                    const qty = Math.max(1, parseInt(it.count) || 1);
                    const ex = inv.find(x => x.itemId === it.itemId);
                    if (ex) ex.count = (ex.count || 0) + qty; else inv.push(Object.assign({}, it, { count: qty }));
                });
                tx.update(ref, { inventory: stripUndefinedDeep(inv), gold: Math.max(0, (parseInt(data.gold) || 0) + (gold || 0)) });
            }));
        };
        const ops = [];
        ids.forEach(id => {
            const t = trades[id]; if (!t) return;
            const giveItems = (t.give && t.give.items) || [], giveGold = (t.give && t.give.gold) || 0, wantGold = (t.want && t.want.gold) || 0;
            if (t.status === 'pending' || ((t.status === 'declined' || t.status === 'cancelled') && !t.fromApplied)) {
                ops.push(grant(t.from, giveItems, giveGold));                       // отправитель получает залог обратно
            } else if (t.status === 'accepted') {
                if (!t.toApplied) ops.push(grant(t.to, giveItems, giveGold - wantGold));   // получатель: вещи и золото, минус плата
                if (!t.fromApplied) ops.push(grant(t.from, [], wantGold));                 // отправитель: плата
            }
        });
        return Promise.all(ops).then(() => ids.length ? db.collection('sessions').doc(currentCode).update({ trades: {} }) : null).then(() => ids.length);
    }

    window.closeSession = function () {
        if (!currentCode) return;
        const nTr = Object.keys((lastData && lastData.trades) || {}).length;
        if (!confirm('Закрыть сессию? Игроки больше не смогут в неё зайти (текущие данные сохранятся).' + (nTr ? '\n\nНезавершённых обменов: ' + nTr + ' — вещи и золото из них вернутся владельцам.' : ''))) return;
        gmSettleTradesBeforeClose().then(() => db.collection('sessions').doc(currentCode).update({ status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp(), currentDungeon: null /* ТЗ-2 2.5: данж закрывается вместе с сессией */ }).finally(() => {
            if (_gmHeartbeatTimer) { clearInterval(_gmHeartbeatTimer); _gmHeartbeatTimer = null; }
            if (unsubSession) { unsubSession(); unsubSession = null; }
            localStorage.removeItem(GM_SESSION_KEY);
            gmDropTimersFor(currentCode); // таймеры закрытой сессии больше не нужны
            currentCode = null;
            el('session-block').style.display = 'none';
            el('no-session-block').style.display = 'block';
            gmSetInSession(false);
        })).catch(e => alert('Не удалось закрыть сессию: ' + e.message + '. Если ошибка при возврате вещей из обменов — сессия осталась открытой, попробуй ещё раз.'));
    };

    function enterSessionView(code) {
        currentCode = code;
        rumFirst = true; _stocksSanitized = false;
    el('no-session-block').style.display = 'none';
    el('session-block').style.display = 'block';
    el('gm-session-code').textContent = code;
    loadGmItems();
    // Восстанавливаем последний таб пульта (Эпик 1 ТЗ-2; по умолчанию «Бой»).
    gmSetInSession(true);
    try { window.openGmTab(gmSavedTab(), { noScroll: true }); } catch (e) { console.error(e); }
    if (unsubSession) unsubSession();
    unsubSession = db.collection('sessions').doc(code).onSnapshot(doc => {
        if (!doc.exists) return;
        lastData = doc.data();
        try { rumOnSnapshot(lastData); } catch (e) { console.error(e); }
        try { gmMaintainSession(lastData); } catch (e) { console.error(e); }
        try { gmWeatherDayWatch(lastData); } catch (e) { console.error(e); }
        try { gmJailDayWatch(lastData); } catch (e) { console.error(e); }
        try { gmNotifyWatch(lastData); } catch (e) { console.error(e); }
        try { gmEnemyTickWatch(lastData); } catch (e) { console.error(e); }
        try { if (window.GmGrid) window.GmGrid.onSnapshot(lastData); } catch (e) { console.error(e); }
        try { renderMuseumRequests(); renderQuestClaims(); renderPlayerLimits(); } catch (e) { console.error(e); }
        try { renderTheftCases(); } catch (e) { console.error(e); }
        renderAll();
    });
    // Heartbeat "мастер онлайн" — раз в 20 сек, пока открыта эта вкладка с активной сессией.
    // Игрок видит по gmLastSeen в том же документе, давно ли мастер был на связи (техдолг,
    // пункт "индикатор мастер онлайн/отошёл").
    if (_gmHeartbeatTimer) clearInterval(_gmHeartbeatTimer);
    const sendHeartbeat = () => db.collection('sessions').doc(code).update({
        gmLastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    sendHeartbeat();
    _gmHeartbeatTimer = setInterval(sendHeartbeat, 20000);
}

    function renderCampStatusGm(campState) {
        const box = el('gm-camp-status');
        if (!box) return;
        if (!campState || !campState.active) { box.innerHTML = '<span style="opacity:.6;">Лагерь не разбит.</span>'; return; }
        box.innerHTML = `⛺ Разбит игроком «${escapeHtml(campState.deployedBy || '?')}»${campState.isMagicallySafe ? ' · 🔮 магически безопасен (засады не будет)' : ''}`;
    }

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

    // ---------- Отряд ----------

    // Задача "нет хелбаров, сгруппируй" — раньше каждый игрок занимал целый блок с двумя большими
    // цифровыми полями. Теперь компактная карточка с настоящими полосками (те же CSS-классы
    // .bar-track/.bar-fill-hp/.bar-fill-mp, что у игрока на его листе — style.css общий файл).
    function renderParty(participants) {
        const target = el('gm-party-list');
        const uids = Object.keys(participants);
        if (!uids.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Пока никто не присоединился.</p>'; return; }
        target.innerHTML = uids.map(uid => {
            const p = participants[uid] || {};
            const maxHp = p.maxHp || 1, maxMp = p.maxMp || 1;
            const hpPct = Math.max(0, Math.min(100, (p.curHp || 0) / maxHp * 100));
            const mpPct = Math.max(0, Math.min(100, (p.curMp || 0) / maxMp * 100));
            return `<div style="border:1px solid var(--border-color); border-radius:4px; padding:5px 8px; margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:bold;">
                    <span>${p.portraitThumb ? `<img src="${escapeHtml(p.portraitThumb)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;">` : ''}${p.fallen ? '⚰️ ' : ''}${escapeHtml(p.name || '?')} <span style="font-weight:normal; font-size:11px; opacity:.8;" title="Свободные жизни">❤ ${p.lives === undefined ? '?' : p.lives}</span></span>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:normal; margin:0;" title="Вне города игрок не может закупаться у торговцев">
                        <input type="checkbox" ${p.inTown === false ? '' : 'checked'} onchange="setParticipantTown('${uid}', this.checked)"> 🏙 В городе
                    </label>
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                    <span style="font-size:11px; color:#e74c3c; width:24px;">HP</span>
                    <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${hpPct}%;"></div></div>
                    <input type="number" value="${p.curHp || 0}" style="width:50px; padding:1px; font-size:12px;" onchange="setParticipantField('${uid}','curHp',this.value)">
                    <span style="font-size:11px; opacity:.6; width:34px;">/${maxHp}</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                    <span style="font-size:11px; color:#3498db; width:24px;">MP</span>
                    <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-mp" style="width:${mpPct}%;"></div></div>
                    <input type="number" value="${p.curMp || 0}" style="width:50px; padding:1px; font-size:12px;" onchange="setParticipantField('${uid}','curMp',this.value)">
                    <span style="font-size:11px; opacity:.6; width:34px;">/${maxMp}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:4px;">
                    ${p.fallen ? '<span style="font-size:11px; color:#e74c3c; font-weight:bold; width:100%;">⚰️ ПАЛ' + ((p.lives || 0) <= 0 ? ' — жизней нет, нужен квест божества' : '') + '</span>' : ''}
                    <button style="font-size:11px; padding:1px 5px;" title="Игрок теряет 1–4 случайные стопки ненадетых вещей" onclick="gmDeathCmd('${uid}','loseItems')">🎒 Потеря вещей</button>
                    <button style="font-size:11px; padding:1px 5px;" title="Воскресить (после квеста божества или по решению мастера)" onclick="gmDeathCmd('${uid}','revive')">✨ Воскресить</button>
                    <button style="font-size:11px; padding:1px 5px;" onclick="gmDeathCmd('${uid}','addLives',1)">+❤</button>
                    <button style="font-size:11px; padding:1px 5px;" onclick="gmDeathCmd('${uid}','addLives',-1)">−❤</button>
                </div>
                ${(p.summons || []).map(s => {
                    const sHpPct = Math.max(0, Math.min(100, (s.curHp || 0) / (s.maxHp || 1) * 100));
                    return `<div style="display:flex; align-items:center; gap:4px; margin-top:4px; padding-left:8px; border-left:2px solid var(--border-color);">
                        <span style="font-size:11px; opacity:.75; white-space:nowrap;">👻 ${escapeHtml(s.name)}</span>
                        <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${sHpPct}%;"></div></div>
                        <span style="font-size:11px; opacity:.6; white-space:nowrap;">${s.curHp || 0}/${s.maxHp || 0}</span>
                    </div>`;
                }).join('')}
                ${(p.pets || []).map(pt => {
                    const ptPct = Math.max(0, Math.min(100, (pt.hp || 0) / (pt.maxHp || 1) * 100));
                    return `<div style="display:flex; align-items:center; gap:4px; margin-top:4px; padding-left:8px; border-left:2px solid var(--border-color);">
                        <span style="font-size:11px; opacity:.75; white-space:nowrap;">${escapeHtml(pt.icon || '🐾')} ${escapeHtml(pt.name)}</span>
                        <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${ptPct}%;"></div></div>
                        <span style="font-size:11px; opacity:.6; white-space:nowrap;">${pt.hp || 0}/${pt.maxHp || 0}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');
    }

    // Команды смерти/воскрешения игроку: уходят через очередь pendingStatusEffects, игрок применяет их у себя.
    window.gmDeathCmd = function (uid, action, n) {
        const p = ((lastData && lastData.participants) || {})[uid] || {};
        const label = { loseItems: 'потеря части вещей', revive: 'воскрешение', addLives: 'жизни ' + (n > 0 ? '+' : '') + n, fall: 'пал' }[action] || action;
        if (action === 'loseItems' && !confirm('Игрок «' + (p.name || '?') + '» потеряет 1–4 случайные стопки ненадетых вещей. Продолжить?')) return;
        const cmd = { id: 'death-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'death', action: action, fromGm: true };
        if (n !== undefined) cmd.n = n;
        const patch = {};
        if (action === 'revive') {
            // Воскрешение мастер записывает сам — в лист персонажа (ХП, «пал») и в сессию. Раньше уходила только команда
            // игроку: если его лист закрыт или не успел её прочитать, персонаж так и оставался павшим у всех.
            const maxHp = parseInt(p.maxHp) || 0;
            const hpNow = parseInt(p.curHp) || 0;
            const hp = Math.max(hpNow, 1, Math.ceil((maxHp || 1) * 0.5)); // как у игрока: половина максимума (WAKE_HP_FRACTION)
            cmd.hp = hp;
            patch['participants.' + uid + '.curHp'] = hp;
            patch['participants.' + uid + '.fallen'] = false;
            updateCharacterVitals(uid, v => { const mx = parseInt(v[2]) || maxHp || 1; v[0] = Math.max(parseInt(v[0]) || 0, 1, Math.ceil(mx * 0.5)); },
                { 'deathState.fallen': false, 'deathState.minimized': false })
                .catch(e => console.error('Ошибка записи воскрешения в лист персонажа:', e));
        }
        patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd);
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '⚰️ ' + (p.name || '?') + ': ' + label + '.' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmPartyFell = function () {
        const parts = (lastData && lastData.participants) || {};
        const uids = Object.keys(parts);
        if (!uids.length) return;
        if (!confirm('Вся партия падает (0 ХП) и приходит в себя через несколько дней. Каждый игрок увидит экран «Персонаж пал». Продолжить?')) return;
        const patch = {};
        uids.forEach(uid => {
            patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'death-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'death', action: 'fall', fromGm: true });
        });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '☠ Вся партия пала. Очнуться можно через несколько дней — без части вещей.' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    window.setParticipantTown = function (uid, flag) {
        const patch = {};
        patch['participants.' + uid + '.inTown'] = !!flag;
        db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));
    };

    window.setParticipantField = function (uid, field, value) {
        const patch = {};
        patch['participants.' + uid + '.' + field] = Number(value) || 0;
        db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));

        // Раньше правка ХП/МП мастером через панель "Отряд" писала ТОЛЬКО сюда, в сессию — сам
        // документ персонажа (characters/{uid}.vitals) оставался нетронутым. Из-за этого лист
        // игрока ничего не знал об изменении, и при следующем же автосохранении (срабатывает
        // почти на любое его действие) молча перезаписывал сессию обратно СВОИМ старым значением
        // ХП — правка мастера "слетала" через пару ходов. Теперь пишем и туда: читаем текущий
        // vitals, меняем нужный индекс, сохраняем массив целиком (Firestore не даёт точечно
        // менять один элемент массива через dot-notation).
        if (field === 'curHp' || field === 'curMp') {
            const vitalsIdx = field === 'curHp' ? 0 : 1;
            const newVal = Number(value) || 0;
            updateCharacterVitals(uid, v => { v[vitalsIdx] = newVal; })
                .catch(e => console.error('Ошибка синхронизации ХП/МП с персонажем:', e));
        }
    };

    // Кэш по имени — enemyAvatarData чистая (одно и то же имя всегда даёт один и тот же SVG),
    // поэтому кэшировать безопасно: не может устареть, инвалидация не нужна вообще. Раньше
    // пересчитывалась на КАЖДОГО врага при КАЖДОМ рендере списка боя (а это на каждый snapshot
    // сессии, не только при реальных изменениях) — строка хэша+regex+сборка SVG+encodeURIComponent
    // на ~1000-символьную строку, не бесплатно при большом бое.
    const _avatarCache = new Map();
    function enemyAvatarData(enemy) {
        const name = String(enemy && enemy.name || '?');
        if (_avatarCache.has(name)) return _avatarCache.get(name);
        let hash = 0; for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        const kind = /волк|саблезуб|медвед|мамонт|краб|рыба|злокрыс|паук|корус/i.test(name) ? 'beast' :
                     /скелет|драугр|нежить|привед/i.test(name) ? 'undead' :
                     /тролль|великан/i.test(name) ? 'troll' :
                     /сприган/i.test(name) ? 'spriggan' :
                     /ворожея/i.test(name) ? 'witch' : 'humanoid';
        const hue = Math.abs(hash) % 360;
        const skin = kind === 'undead' ? '#b8b7a3' : kind === 'troll' ? '#6e7e57' : kind === 'spriggan' ? '#66815d' : `hsl(${hue},28%,58%)`;
        const dark = kind === 'undead' ? '#3d4039' : kind === 'troll' ? '#263322' : '#201c19';
        const hair = `hsl(${(hue+35)%360},22%,20%)`;
        let features='';
        if(kind==='beast') features='<path d="M27 42 L13 25 L30 30 M73 42 L87 25 L70 30" fill="'+dark+'" stroke="#17130f" stroke-width="3"/><path d="M39 58 Q50 65 61 58" fill="none" stroke="#2b211b" stroke-width="3"/><ellipse cx="50" cy="66" rx="11" ry="7" fill="#38271e"/>';
        else if(kind==='undead') features='<path d="M25 36 Q30 17 50 18 Q70 17 75 36 L69 30 Q50 24 31 30Z" fill="#5a5b53"/><path d="M39 57 L46 61 L50 57 L54 61 L61 57" fill="none" stroke="#4a4b45" stroke-width="2"/>';
        else if(kind==='troll') features='<path d="M27 36 Q18 22 34 25 L42 35 M73 36 Q82 22 66 25 L58 35" fill="'+skin+'" stroke="#263322" stroke-width="3"/><path d="M35 67 L42 60 L50 69 L58 60 L65 67" fill="#e1d7c5" stroke="#493f32" stroke-width="2"/>';
        else if(kind==='spriggan') features='<path d="M30 36 Q20 18 38 22 M70 36 Q80 18 62 22" fill="none" stroke="#314b2f" stroke-width="7"/><path d="M37 72 Q50 79 63 72" fill="none" stroke="#355333" stroke-width="5"/>';
        else if(kind==='witch') features='<path d="M27 31 Q50 4 73 31 L67 28 Q50 18 33 28Z" fill="#332c2a"/><path d="M42 58 Q50 63 58 58" fill="none" stroke="#4d2d27" stroke-width="3"/>';
        else features='<path d="M29 38 Q31 15 50 13 Q69 15 71 38 L65 28 Q50 22 35 28Z" fill="'+hair+'"/><path d="M42 63 Q50 68 58 63" fill="none" stroke="#3a2822" stroke-width="3"/>';
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="bg"><stop stop-color="#6f6045"/><stop offset="1" stop-color="#17130e"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="52" r="32" fill="${skin}" stroke="#c5a568" stroke-width="2"/>${features}<ellipse cx="39" cy="48" rx="4" ry="5" fill="#16130f"/><ellipse cx="61" cy="48" rx="4" ry="5" fill="#16130f"/><path d="M46 55 Q50 58 54 55" fill="none" stroke="#3a2922" stroke-width="2"/><path d="M23 92 Q50 72 77 92" fill="${dark}"/></svg>`;
        const result = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
        _avatarCache.set(name, result);
        return result;
    }

    // ---------- Противники ----------

    // Что враг держит в руках (для заклинаний): free — руки свободны, one — одно одноручное (или только щит),
    // two — двуручное/лук/арбалет, both — два оружия или оружие со щитом. Колдовать можно только с free/one.
    // Пока мастер не выбрал вручную — угадываем по оружию из базы.
    const GM_HANDS_LABEL = { free: '✋ руки свободны', one: '🗡 одно одноручное / щит', two: '🏹 двуручное / лук', both: '⚔ два оружия / оружие+щит' };
    function gmEnemyHands(e) {
        if (e && GM_HANDS_LABEL[e.hands]) return e.hands;
        if (!e || !e.weaponDmg) return 'free';
        const t = String(e.weaponNote || '') + ' ' + (e.name || '');
        if (e.isRanged || /двуруч|секир|молот|лук|арбалет|посох|пик[аи]|копь/i.test(t)) return 'two';
        if (/щит/i.test(t)) return 'both';
        return 'one';
    }
    window.gmEnemyHands = gmEnemyHands;
    window.gmSetEnemyHands = function (id, v) {
        const en = (lastData.enemies || []).find(x => x.id === id);
        window.setEnemyField(id, 'hands', v);
        if (en) gmPostLogEntryText(`✋ ${en.name}: в руках — ${(GM_HANDS_LABEL[v] || v).replace(/^\S+\s/, '')} (смена оружия — действие хода).`);
    };
    function renderEnemies(enemies) {
        const target = el('gm-enemies-list');
        gmCheckMarked(enemies);
        renderEnemyGrid(enemies);
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Противников нет.</p>'; gmBulkCount(); return; }
        target.innerHTML = enemies.map(e => {
            const resistEntries = e.resist ? Object.entries(e.resist).filter(([k, v]) => v) : [];
            const resistLine = resistEntries.length
                ? '<div style="font-size:12px; opacity:.75;">Резист: ' + resistEntries.map(([k, v]) => escapeHtml(k) + ' ' + v + '%').join(', ') + '</div>' : '';
            // Характеристики бандита (Задача "телосложение/сила/ловкость") — только у тех, у кого
            // есть (сгенерированы генератором бандитов), остальные враги из базы их не имеют.
            const statsLine = (e.str || e.dex)
                ? `<div style="font-size:11px; opacity:.65;">СИЛ ${e.str || '—'} · ЛОВ ${e.dex || '—'} · ТЕЛ ${e.con || '—'}</div>`
                : (e.int || e.wis) ? `<div style="font-size:11px; opacity:.65;">ИНТ ${e.int || '—'} · ДУХ ${e.wis || '—'} · ТЕЛ ${e.con || '—'}</div>` : '';
            // Статус-эффекты (Страх/Успокоение/Ярость/Полиморф и т.п.) — раньше эти заклинания были
            // чистым текстом, теперь реально накладываются сюда. Тикаются вручную (кнопка "Снять") —
            // не завязано на автоматический счётчик ходов, чтобы не требовать точной синхронизации
            // между листом игрока и сессией.
            const statusLine = (e.statusEffects && e.statusEffects.length)
                ? e.statusEffects.map((s, si) => `<div style="font-size:12px; color:#c9986c; margin-top:2px; display:flex; align-items:center; gap:4px;">🌀 <strong>${escapeHtml(s.name)}</strong>${s.turns ? ` (${s.turns} х.)` : ''} — ${escapeHtml(s.desc || '')} <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:11px;" onclick="removeEnemyStatus('${e.id}','${s.id}')">Снять</button></div>`).join('')
                : '';
            // Урон оружием — теперь редактируемое поле, не просто текст. Раньше поправить урон
            // можно было только удалив и заново добавив противника с нуля.
            const dmgLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">Урон оружием: ' +
                '<input type="number" value="' + (e.weaponDmg || 0) + '" style="width:56px; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'weaponDmg\',this.value)">' +
                (e.weaponNote ? ' (' + escapeHtml(e.weaponNote) + ')' : '') + '</div>';
            const spellsHtml = (e.spells && e.spells.length)
                ? e.spells.map((s, si) => '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">' +
                    escapeHtml(s.name) + ': <input type="number" value="' + (s.dmg || 0) + '" style="width:48px; display:inline; padding:1px;" onchange="setEnemySpellField(\'' + e.id + '\',' + si + ',\'dmg\',this.value)"> урона / ' +
                    '<input type="number" value="' + (s.cost || 0) + '" style="width:48px; display:inline; padding:1px;" onchange="setEnemySpellField(\'' + e.id + '\',' + si + ',\'cost\',this.value)"> МП</div>').join('')
                : '';
            const KIND_OPTS = [['', '— тип? —'], ['animal', 'зверь'], ['monster', 'монстр'], ['people', 'человек/меры'], ['undead', 'нежить'], ['daedra', 'даэдра'], ['automaton', 'механизм']];
            const levelLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">Уровень: ' +
                '<input type="number" min="0" value="' + (e.level || '') + '" placeholder="?" style="width:50px; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'level\',this.value)"> ' +
                '<select style="width:auto; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'kind\',this.value)">' +
                KIND_OPTS.map(o => '<option value="' + o[0] + '"' + ((e.kind || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>';
            // Заклинания «Приказ даэдра»/«Изгнание даэдра» действуют полностью только на ПРИЗВАННЫХ даэдра. По умолчанию даэдра считается
            // призванным; снять галочку — значит «дикий» (изгнание вместо этого наносит урон, приказ не работает).
            const summonedLine = e.kind === 'daedra'
                ? '<div style="font-size:12px; opacity:.9; margin-top:2px;"><label style="display:flex; align-items:center; gap:4px; cursor:pointer;">' +
                  '<input type="checkbox" style="width:auto; margin:0;"' + (e.summoned === false ? '' : ' checked') + ' onchange="setEnemySummoned(\'' + e.id + '\', this.checked)"> 🔮 Призван (иначе «Приказ» и «Изгнание даэдра» не подействуют полностью)</label></div>'
                : '';
            const lootLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">🎒 ' +
                '<input type="text" value="' + escapeHtml(e.loot || '') + '" placeholder="лут текстом" style="flex:1; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'loot\',this.value)"></div>';
            const shoutsHtml = (e.shouts && e.shouts.length)
                ? e.shouts.map((s, si) => {
                    const cdKey = 'shoutCd_' + si;
                    const cdLeft = (e[cdKey] || 0);
                    return '<div style="font-size:12px; margin-top:2px; padding:3px; background:var(--input-bg); border-radius:3px;">' +
                        '<strong>🗣️ ' + escapeHtml(s.name) + '</strong> (КД ' + s.cooldown + ' х.): ' + escapeHtml(s.effect) +
                        '<div style="display:flex; gap:4px; align-items:center; margin-top:2px;">' +
                        '<span>Осталось КД: ' + cdLeft + '</span>' +
                        '<button style="width:auto; padding:1px 6px; font-size:11px;" onclick="useShout(\'' + e.id + '\',' + si + ',' + s.cooldown + ')" ' + (cdLeft > 0 ? 'disabled' : '') + '>Крикнуть</button>' +
                        '<button style="width:auto; padding:1px 6px; font-size:11px;" onclick="tickShoutCd(\'' + e.id + '\',' + si + ')" ' + (cdLeft <= 0 ? 'disabled' : '') + '>−1 ход КД</button>' +
                        '</div></div>';
                }).join('') : '';
            const isMarked = lastData && lastData.markedTarget === e.id;
            return '<div class="enemy-row' + (isMarked ? ' st-marked' : '') + '" data-enemy-id="' + escapeHtml(e.id) + '">' +
                '<div class="row-name"><span class="name-with-avatar"><input type="checkbox" class="st-enemy-sel" title="Выделить для массовых действий"' + (gmEnemySel.has(e.id) ? ' checked' : '') + ' onchange="gmToggleEnemySel(\'' + e.id + '\', this.checked)"><img class="enemy-avatar" src="' + enemyAvatarData(e) + '" alt=""><span>' + escapeHtml(e.name || '?') + '</span></span>' +
                '<span style="display:flex; gap:4px;"><button style="width:auto;padding:2px 8px;font-size:12px;" onclick="gmToggleMark(\'' + e.id + '\')" title="Игроки увидят 🎯 и кнопку «Атаковать помеченного»">' + (isMarked ? '🎯 Снять метку' : '🎯 Пометить') + '</button>' +
                '<button class="btn-danger" style="width:auto;padding:2px 8px;font-size:12px;" onclick="removeEnemy(\'' + e.id + '\')">Убрать</button></span></div>' +
                statsLine + statusLine + levelLine + summonedLine + dmgLine + resistLine + spellsHtml + lootLine + shoutsHtml +
                ((e.spells && e.spells.length) || e.weaponDmg ? '<div style="font-size:12px; margin-top:2px;">В руках: <select style="width:auto; font-size:12px; padding:1px 4px;" title="Смена хвата — действие врага в этом ходу. С двуручным/луком и с двумя предметами колдовать нельзя." onchange="gmSetEnemyHands(\'' + e.id + '\', this.value)">' +
                    Object.keys(GM_HANDS_LABEL).map(k => '<option value="' + k + '"' + (gmEnemyHands(e) === k ? ' selected' : '') + '>' + GM_HANDS_LABEL[k] + '</option>').join('') + '</select></div>' : '') +
                '<div class="grid-2" style="gap:6px; margin-top:4px;">' +
                '<div><label style="font-size:12px;">HP (' + (e.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curHp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:12px;">MP (' + (e.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curMp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curMp\',this.value)"></div>' +
                '</div>' +
                (function () {
                    // Труп показываем у любого павшего врага, у которого есть что обыскать (готовая добыча или текст «лут» с вики),
                    // а не только у поднимаемых гуманоидов — раньше «Обыскать» работало лишь у сгенерированных бандитов.
                    const isDead = (e.curHp || 0) <= 0;
                    const hasLootText = !!(e.loot && String(e.loot).trim());
                    const canLoot = !e.ashes && !e.looted && !!(e.corpseLoot || hasLootText);
                    if (!isDead || !(e.isRaisable || canLoot || e.looted)) return '';
                    return '<div style="margin-top:4px; padding:4px; background:var(--input-bg); border-radius:3px; font-size:12px;">' +
                        '💀 Труп' + (e.corpseRace ? ' (' + escapeHtml(e.corpseRace) + ', знак «' + escapeHtml(e.corpseSign || '') + '»)' : '') +
                        (e.ashes ? '<div style="opacity:.75;">🔥 Обращён в пепел (Трансмутация смерти) — обыскать и поднять нельзя.</div>'
                            : canLoot ? gmCorpseLootControls(e)
                            : e.looted ? '<div style="opacity:.6;">Уже обыскан.</div>' : '<div style="opacity:.6;">Здесь нечего брать.</div>') +
                        (e.isRaisable ? (e.soulTaken ? '<div style="opacity:.75; margin-top:2px;">🕳 Душа захвачена — поднять заклинанием или способностью нельзя.</div>' : '<div style="opacity:.6; margin-top:2px;">🧟 Доступен для поднятия заклинанием игрока</div>') : '') +
                        '</div>';
                })() +
                '</div>';
        }).join('');
        gmBulkCount();
    }

    window.useShout = function (enemyId, shoutIdx, cooldown) {
        const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? { ...e, ['shoutCd_' + shoutIdx]: cooldown } : e);
        gmUpdateEnemies(enemies).catch(err => console.error(err));
        const enemy = enemies.find(e => e.id === enemyId);
        const shout = enemy && enemy.shouts && enemy.shouts[shoutIdx];
        if (shout) gmPostLogEntryText(`🗣️ ${enemy.name} кричит «${shout.name}»: ${shout.effect}`);
    };

    // Раньше ничего не декрементировало shoutCd_* вообще — крик срабатывал один раз за весь бой,
    // кнопка оставалась серой навсегда. Ручной тик за ход мастера (не привязан к действиям
    // игрока на другой вкладке — проще и надёжнее автотика между разными сессионными контекстами).
    window.tickShoutCd = function (enemyId, shoutIdx) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== enemyId) return e;
            const key = 'shoutCd_' + shoutIdx;
            return { ...e, [key]: Math.max(0, (e[key] || 0) - 1) };
        });
        gmUpdateEnemies(enemies).catch(err => console.error(err));
    };

    let currentEnemyDbPick = null;

    function populateEnemyDbSelect() {
        const select = el('enemy-db-select');
        if (!select || !window.enemiesData) return;
        select.innerHTML = '<option value="">— выбрать готового противника —</option>' +
            window.enemiesData.map((e, i) => `<option value="${i}">${escapeHtml(e.name)} (${e.category}, ${e.hp} HP)</option>`).join('');
    }

    window.onEnemyDbPicked = function () {
        const idx = el('enemy-db-select').value;
        const infoEl = el('enemy-db-info');
        if (idx === '') { currentEnemyDbPick = null; infoEl.innerHTML = ''; return; }
        const e = window.enemiesData[parseInt(idx)];
        currentEnemyDbPick = e;
        el('enemy-name-input').value = e.name;
        el('enemy-hp-input').value = e.hp;
        // Мана врага: из базы (поле mana), иначе — запас на три самых дорогих заклинания.
        const totalMana = parseInt(e.mana) > 0 ? parseInt(e.mana) : (e.spells && e.spells.length ? Math.max(...e.spells.map(s => s.cost || 0)) * 3 : 0);
        el('enemy-mp-input').value = totalMana;
        let info = '';
        if (e.weaponDmg) { const wd = enemyWeaponDamage(e); info += `Урон: ${wd.total}${wd.stat ? ' (оружие ' + wd.base + ' + ' + wd.label + ' ' + wd.stat + ')' : ''}${e.weaponNote ? ' — ' + escapeHtml(e.weaponNote) : ''}<br>`; }
        if (e.weaponOptions && e.weaponOptions.length > 1) info += `🎲 Варианты оружия (при добавлении выберется случайно): ${e.weaponOptions.map(escapeHtml).join(', ')}<br>`;
        if (Object.keys(e.resist).length) info += `Резист: ${Object.entries(e.resist).map(([k, v]) => k + ' ' + v + '%').join(', ')}<br>`;
        if (e.spells.length) info += `Заклинания: ${e.spells.map(s => s.name + ' (' + s.dmg + '/' + s.cost + ')').join(', ')}<br>`;
        if (e.shouts.length) info += `Крики: ${e.shouts.map(s => s.name).join(', ')}<br>`;
        if (window.EnemyGear && window.EnemyGear.familyOf(e.name)) info += `🎲 Оружие и броня определятся случайно при добавлении в бой (${/драугр/i.test(e.name) ? 'древненордские, возможно зачарованные' : 'изгойские'}), лут — как у бандитов.<br>`;
        if (e.loot) info += `Лут: ${escapeHtml(e.loot)}`;
        infoEl.innerHTML = info;
    };

    // ---------- Снаряжение и добыча врага по выбору мастера ----------
    let enemyGearDraft = []; // [{ name, qty, chance }]

    function gmItemDmg(i) { return typeof i.dmg === 'number' ? i.dmg : (typeof i.damage === 'number' ? i.damage : null); }
    function gmItemArmor(i) { return typeof i.armor === 'number' ? i.armor : (typeof i.resistance === 'number' ? i.resistance : null); }
    function enemyGearRole(i) {
        if (!i) return 'loot';
        const isAmmo = /стрел|болт/i.test(i.name || '');
        if (gmItemDmg(i) !== null && (i.slot === 'melee' || i.slot === 'ranged') && !isAmmo) return 'weapon';
        if (gmItemArmor(i) !== null && ['helmet', 'chest', 'gloves', 'boots', 'shield'].includes(i.slot)) return 'armor';
        return 'loot';
    }
    function gmFindItemByName(name) {
        return (gmAllItemsByKey && gmAllItemsByKey.get(name)) || (gmAllItems || []).find(i => i.name === name) || null;
    }
    window.populateEnemyGearDatalist = function () {
        const dl = el('enemy-gear-datalist');
        if (!dl) return;
        const names = Array.from(new Set((gmAllItems || []).map(i => i.name))).sort((a, b) => a.localeCompare(b, 'ru'));
        dl.innerHTML = names.map(n => '<option value="' + escapeHtml(n) + '"></option>').join('');
    };
    window.addEnemyGearItem = function () {
        const name = (el('enemy-gear-name').value || '').trim();
        if (!name) return;
        const item = gmFindItemByName(name);
        if (!item) { alert('Предмета «' + name + '» нет в базе — выбери из подсказок списка.'); return; }
        const qty = Math.max(1, parseInt(el('enemy-gear-qty').value) || 1);
        const chance = Math.min(100, Math.max(1, parseInt(el('enemy-gear-chance').value) || 100));
        enemyGearDraft.push({ name: item.name, qty, chance });
        el('enemy-gear-name').value = ''; el('enemy-gear-qty').value = 1; el('enemy-gear-chance').value = 100;
        renderEnemyGearDraft();
    };
    window.removeEnemyGearItem = function (idx) { enemyGearDraft.splice(idx, 1); renderEnemyGearDraft(); };
    function renderEnemyGearDraft() {
        const box = el('enemy-gear-list');
        if (!box) return;
        const ROLE = { weapon: '⚔️ оружие', armor: '🛡 броня', loot: '🎒 лут' };
        box.innerHTML = enemyGearDraft.length ? enemyGearDraft.map((d, idx) => {
            const it = gmFindItemByName(d.name) || {};
            const role = enemyGearRole(it);
            const stat = role === 'weapon' ? ' · урон ' + gmItemDmg(it) : role === 'armor' ? ' · броня ' + gmItemArmor(it) : '';
            const uniq = (typeof isUniqueLootItem === 'function' && isUniqueLootItem(it)) ? ' <span style="color:#e6b800;">★ уникальное</span>' : '';
            return '<div class="party-row" style="display:flex; align-items:center; gap:6px; padding:3px 6px; font-size:13px;">' +
                '<span style="flex:1;"><strong>' + escapeHtml(d.name) + '</strong>' + (d.qty > 1 ? ' ×' + d.qty : '') + uniq +
                '<br><span style="opacity:.7;">' + ROLE[role] + stat + ' · шанс ' + d.chance + '%' + (it.effect ? ' · ' + escapeHtml(String(it.effect).slice(0, 70)) : '') + '</span></span>' +
                '<button type="button" style="width:auto; margin:0; padding:2px 8px;" class="btn-danger" onclick="removeEnemyGearItem(' + idx + ')">×</button></div>';
        }).join('') : '<p style="opacity:.6; font-size:13px; margin:2px 0;">Список пуст.</p>';
    }
    // Превращает список мастера в характеристики врага и готовую добычу (шанс выпадения бросается сразу, как у генераторов).
    function buildEnemyGearExtra() {
        const gold = Math.max(0, parseInt((el('enemy-gear-gold') || {}).value) || 0);
        if (!enemyGearDraft.length && !gold) return null;
        const items = [];
        let weapon = null; const armorNames = []; const armorBySlot = {}; // на враге одна вещь на слот: 2 шлема не складываются
        enemyGearDraft.forEach(d => {
            const it = gmFindItemByName(d.name);
            if (!it) return;
            const role = enemyGearRole(it);
            if (role === 'weapon' && (!weapon || gmItemDmg(it) > gmItemDmg(weapon))) weapon = it;
            if (role === 'armor') { const sl = it.slot || it.name; armorBySlot[sl] = Math.max(armorBySlot[sl] || 0, gmItemArmor(it) || 0); armorNames.push(it.name); }
            if (Math.random() * 100 < d.chance) {
                const loot = window.EnemyLoot ? window.EnemyLoot.toLoot(it, d.qty) : { name: it.name, price: it.price || 0, weight: it.weight || 0, category: it.category || '', qty: d.qty };
                if (loot.enchantment && (loot.slot === 'melee' || loot.slot === 'ranged') && typeof loot.chargeDaysLeft !== 'number') loot.chargeDaysLeft = 3;
                items.push(loot);
            }
        });
        const armorSum = Object.keys(armorBySlot).reduce((a, k) => a + armorBySlot[k], 0);
        const noteParts = [];
        if (weapon) noteParts.push(weapon.name + (weapon.effect ? ' (' + String(weapon.effect).slice(0, 80) + ')' : ''));
        if (armorNames.length) noteParts.push('надето: ' + armorNames.join(', '));
        return {
            weaponDmg: weapon ? gmItemDmg(weapon) : 0, isRanged: !!(weapon && weapon.slot === 'ranged'), weaponNote: noteParts.join(' · '),
            physResist: armorSum ? Math.min(85, Math.round(armorSum / 10)) : 0,
            corpseLoot: { gold, items }
        };
    }

    // Болезнь врага: из самого врага, а если её там нет (враги, добавленные до исправления, из встреч/шаблонов, «Злокрыс 2») —
    // из базы по имени (точное совпадение после отбрасывания номера и пометок в скобках).
    function gmEnemyDisease(enemy) {
        if (!enemy) return { name: null, chance: 0 };
        if (enemy.carrierOfDisease) return { name: enemy.carrierOfDisease, chance: enemy.diseaseChance || 0 };
        if (enemy.summoned) return { name: null, chance: 0 };
        const base = String(enemy.name || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s*#?\d+\s*$/, '').trim().toLowerCase();
        const t = (window.enemiesData || []).find(x => String(x.name).toLowerCase() === base);
        return t && t.carrierOfDisease ? { name: t.carrierOfDisease, chance: t.diseaseChance || 0 } : { name: null, chance: 0 };
    }
    window.gmEnemyDisease = gmEnemyDisease;

    // Поля врага из записи базы enemies-data.js (урон, резисты, заклинания, лут, болезнь, генерация снаряжения драугров/изгоев).
    // Раньше жило только внутри addEnemy; вынесено, чтобы так же создавать врагов при развёртывании данжа (ТЗ-2, эпик 2.2).
    function gmEnemyExtraFromDb(pick) {
        const extra = {};
        if (!pick) return extra;
        if (pick.weaponDmg) extra.weaponDmg = pick.weaponDmg;
        // Рандомайзер оружия — у драугров/подобных несколько вариантов оружия в источнике
        // (Враги.xlsx), раньше просто брался статичный weaponNote. Один случайный вариант при
        // каждом добавлении в бой — правдоподобнее, чем всегда одно и то же оружие у всех.
        if (pick.weaponOptions && pick.weaponOptions.length) {
            extra.weaponNote = pick.weaponOptions[Math.floor(Math.random() * pick.weaponOptions.length)];
        } else if (pick.weaponNote) {
            extra.weaponNote = pick.weaponNote;
        }
        if (Object.keys(pick.resist || {}).length) extra.resist = pick.resist;
        if ((pick.spells || []).length) extra.spells = pick.spells;
        if ((pick.shouts || []).length) extra.shouts = pick.shouts;
        if (pick.loot) extra.loot = pick.loot;
        // Драугры и изгои — как бандиты: случайное оружие/броня (у драугров древненордские, возможно зачарованные)
        if (window.EnemyGear && window.EnemyGear.familyOf(pick.name)) {
            const gen = window.EnemyGear.generate(pick, enemyLootCtx(pick.level));
            if (gen) {
                extra.weaponDmg = gen.weaponDmg; extra.str = gen.str; extra.dex = gen.dex; extra.con = gen.con; extra.spells = gen.spells; extra.weaponNote = gen.weaponNote; extra.isRanged = gen.isRanged; extra.resist = gen.resist;
                extra.corpseLoot = { gold: gen.gold, items: gen.lootItems }; extra.lootKit = JSON.parse(JSON.stringify(extra.corpseLoot));
                extra.loot = genLootText(gen);
            }
        }
        // Переносчик болезни — раньше эти поля не копировались в бой, и бросок на заражение никогда не срабатывал.
        if (pick.carrierOfDisease) { extra.carrierOfDisease = pick.carrierOfDisease; extra.diseaseChance = pick.diseaseChance || 0; }
        if (pick.soul) extra.soul = pick.soul; // размер души для захвата душ
        if (pick.level) extra.level = pick.level; // уровень и тип — для заклинаний «до N уровня»
        if (pick.kind) extra.kind = pick.kind;
        // Только гуманоидов можно поднять заклинанием (Воины/Шаманы/Боевые маги — фалмеры
        // и подобные; звери/монстры/ловушки — нет).
        if (['Воины', 'Шаманы', 'Боевые маги'].includes(pick.category)) extra.isRaisable = true;
                return extra;
    }
    window.gmEnemyExtraFromDb = gmEnemyExtraFromDb;

    window.addEnemy = function () {
        const name = el('enemy-name-input').value.trim();
        if (!name) return;
        const maxHp = Number(el('enemy-hp-input').value) || 0;
        const maxMp = Number(el('enemy-mp-input').value) || 0;
        const enemies = (lastData.enemies || []).slice();
        // Ручной ввод урона/резиста/лута — раньше их вообще не было в форме создания, только
        // имя+ХП+МП, править приходилось уже ПОСЛЕ добавления через отдельные поля в списке боя.
        const manualDmg = Number(el('enemy-dmg-input').value) || 0;
        const manualResist = Number(el('enemy-resist-input').value) || 0;
        const manualLoot = el('enemy-loot-input').value.trim();
        const extra = {};
        // Сначала значения базы, поверх — то, что мастер ввёл руками (раньше база перетирала ручные урон, резист и лут).
        if (currentEnemyDbPick && currentEnemyDbPick.name === name) Object.assign(extra, gmEnemyExtraFromDb(currentEnemyDbPick));
        if (manualDmg) extra.weaponDmg = manualDmg;
        if (manualResist) extra.resist = Object.assign({}, extra.resist || {}, { physical: manualResist });
        if (manualLoot) extra.loot = manualLoot;
        // Снаряжение/добыча по выбору мастера главнее и значений из базы, и автоматического генератора.
        const gearExtra = buildEnemyGearExtra();
        if (gearExtra) {
            if (gearExtra.weaponDmg && !manualDmg) extra.weaponDmg = gearExtra.weaponDmg;
            if (gearExtra.weaponNote) { extra.weaponNote = gearExtra.weaponNote; extra.isRanged = gearExtra.isRanged; }
            if (gearExtra.physResist && !manualResist) extra.resist = Object.assign({}, extra.resist || {}, { physical: gearExtra.physResist });
            extra.corpseLoot = gearExtra.corpseLoot; extra.lootKit = JSON.parse(JSON.stringify(gearExtra.corpseLoot || null));
            extra.loot = genLootText(gearExtra.corpseLoot);
        }
        enemies.push(stripUndefinedDeep(Object.assign({ id: genId('e'), name, maxHp, curHp: maxHp, maxMp, curMp: maxMp }, extra)));
        gmUpdateEnemies(enemies).then(() => {
            el('enemy-name-input').value = '';
            el('enemy-hp-input').value = 10;
            el('enemy-mp-input').value = 0;
            el('enemy-dmg-input').value = 0;
            el('enemy-resist-input').value = 0;
            el('enemy-loot-input').value = '';
            enemyGearDraft = []; renderEnemyGearDraft(); if (el('enemy-gear-gold')) el('enemy-gear-gold').value = 0;
            el('enemy-db-select').value = '';
            el('enemy-db-info').innerHTML = '';
            currentEnemyDbPick = null;
        }).catch(e => console.error(e));
    };

    // TEXT_ENEMY_FIELDS — поля, которые НЕ надо принудительно приводить к числу (раньше
    // Number(value)||0 стояло безусловно для любого поля — для текста типа "лут" это дало бы 0).
    const TEXT_ENEMY_FIELDS = ['loot', 'weaponNote', 'name', 'kind', 'hands'];
    window.setEnemySummoned = function (id, checked) {
        const enemies = (lastData.enemies || []).map(e => e.id === id ? { ...e, summoned: !!checked } : e);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };
    window.setEnemyField = function (id, field, value) {
        const finalVal = TEXT_ENEMY_FIELDS.includes(field) ? value : (Number(value) || 0);
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== id) return e;
            const c = { ...e, [field]: finalVal };
            if (field === 'curHp' && finalVal > 0) delete c.killedBy; // мастер поднял врага — прошлый убийца уже не в счёт
            return c;
        });
        gmUpdateEnemies(enemies, { absolute: true }).catch(e => console.error(e));
    };

    // Снятие статус-эффекта (Страх/Успокоение/Ярость/Полиморф) — тикается вручную мастером,
    // не по автоматическому счётчику ходов.
    // ---------- Отмена последнего действия мастера (1 шаг, 30 секунд) ----------
    // Раньше любая ошибка мастера с врагами (лишний урон, не тот убран) исправлялась вручную. Теперь ВСЕ записи списка врагов идут через
    // gmUpdateEnemies(): перед записью сохраняем снимок прежнего состояния. Хранится только последнее действие и только 30 секунд.
    // Обыск трупа в откат не входит (вещи уже выданы игроку). Откат перезаписывает врагов целиком — изменения игроков за эти секунды тоже откатятся.
    const GM_UNDO_TTL = 30000;
    // Раньше здесь весь список врагов из снимка мастера писался поверх облака без транзакции, и удар игрока,
    // пришедший за эти доли секунды, пропадал. Теперь пишем транзакцией и переносим на свежие данные только то,
    // что мастер действительно поменял (сравнение со снимком): ХП и мана — как прибавка/убыль, остальное — как значение.
    // opts.absolute — ХП/ману ставить ровно как ввёл мастер (ручная правка поля).
    // Урон от мастера (массовый, совместная атака, ручная правка) теперь, как и удар игрока, снимает статусы
    // «спадают от урона» (Полиморф, Бегство…) и отмечает момент смерти (окно «поднять труп»).
    function gmMergeEnemyEdits(server, prev, desired, turnNow, opts) {
        const byId = a => { const m = {}; (a || []).forEach(e => { if (e && e.id != null) m[e.id] = e; }); return m; };
        const S = byId(server), P = byId(prev);
        const desiredIds = new Set((desired || []).filter(Boolean).map(e => e.id));
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const out = [];
        (desired || []).forEach(d => {
            if (!d) return;
            const p = P[d.id], s = S[d.id];
            if (!p) { if (!s) out.push(d); else out.push(Object.assign({}, s, d)); return; } // новый враг от мастера
            if (!s) return; // врага уже убрали из боя (за это время) — не возвращаем
            const c = Object.assign({}, s);
            const nums = [];
            new Set(Object.keys(p).concat(Object.keys(d))).forEach(k => {
                if (same(p[k], d[k])) return;
                if ((k === 'curHp' || k === 'curMp') && !(opts && opts.absolute) && typeof p[k] === 'number' && typeof d[k] === 'number' && typeof s[k] === 'number') { nums.push(k); return; }
                if (d[k] === undefined) delete c[k]; else c[k] = d[k];
            });
            nums.forEach(k => {
                const max = k === 'curHp' ? c.maxHp : c.maxMp;
                let v = Math.max(0, s[k] + d[k] - p[k]);
                if (typeof max === 'number' && d[k] <= max) v = Math.min(max, v);
                c[k] = v;
            });
            const sHp = parseInt(s.curHp) || 0, cHp = parseInt(c.curHp) || 0;
            if (cHp < sHp) {
                if (Array.isArray(c.statusEffects)) c.statusEffects = c.statusEffects.filter(st => !(st && (st.breakOnDamage || (window.StCombat && window.StCombat.statusRule && window.StCombat.statusRule(st.name).breakOnDamage))));
                if (sHp > 0 && cHp <= 0 && (c.diedAtTurn === undefined || c.diedAtTurn === s.diedAtTurn)) c.diedAtTurn = turnNow || 0;
            }
            out.push(c);
        });
        // враги, появившиеся в облаке уже после снимка мастера, остаются
        (server || []).forEach(s => { if (s && s.id != null && !P[s.id] && !desiredIds.has(s.id)) out.push(s); });
        return out;
    }
    function gmUpdateEnemies(enemies, opts, extraPatch) {
        const prev = (lastData && Array.isArray(lastData.enemies)) ? lastData.enemies : [];
        window._gmUndo = { ts: Date.now(), sessionCode: currentCode, enemies: JSON.parse(JSON.stringify(prev)) };
        gmUndoRefresh();
        const ref = db.collection('sessions').doc(currentCode);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.exists ? (doc.data() || {}) : {};
            const merged = gmMergeEnemyEdits(d.enemies || [], prev, enemies, parseInt(d.sessionTurnCounter) || 0, opts);
            tx.update(ref, Object.assign({ enemies: stripUndefinedDeep(merged) }, extraPatch || {}));
        }));
    }
    window.gmMergeEnemyEdits = gmMergeEnemyEdits;
    function gmUndoAvailable() { const u = window._gmUndo; return !!(u && u.sessionCode === currentCode && Date.now() - u.ts < GM_UNDO_TTL); }
    function gmUndoRefresh() {
        const b = el('gm-undo-btn'); if (!b) return;
        const ok = gmUndoAvailable();
        b.disabled = !ok;
        b.classList.toggle('st-undo-ready', ok);
        if (!ok && window._gmUndo && Date.now() - window._gmUndo.ts >= GM_UNDO_TTL) window._gmUndo = null;
    }
    setInterval(gmUndoRefresh, 1000);
    window.gmUndoLast = function () {
        if (!gmUndoAvailable()) { gmUndoRefresh(); return; }
        const u = window._gmUndo;
        db.collection('sessions').doc(currentCode).update({ enemies: stripUndefinedDeep(u.enemies) }).then(() => {
            window._gmUndo = null; gmUndoRefresh();
            gmPostLogEntryText('↶ Мастер отменил последнее действие.');
        }).catch(e => alert('Ошибка отката: ' + e.message));
    };

    // ---------- Метка цели (1.3) ----------
    // sessions/{code}.markedTarget = id врага | null. Игроки видят 🎯 в списке целей и кнопку «Атаковать помеченного» в боевом доке.
    window.gmToggleMark = function (id) {
        const e = (lastData.enemies || []).find(x => x.id === id); if (!e) return;
        const next = lastData.markedTarget === id ? null : id;
        db.collection('sessions').doc(currentCode).update({ markedTarget: next }).then(() => {
            if (next) gmPostLogEntryText('🎯 Мастер пометил цель: «' + e.name + '».');
        }).catch(err => alert('Ошибка: ' + err.message));
    };
    let _gmMarkClearing = false;
    // Метка автоматически снимается, когда помеченный враг убит или убран (проверка при каждом обновлении списка у мастера)
    function gmCheckMarked(enemies) {
        const id = lastData && lastData.markedTarget;
        if (!id || _gmMarkClearing) return;
        const e = (enemies || []).find(x => x.id === id);
        if (e && (e.curHp || 0) > 0) return;
        _gmMarkClearing = true;
        db.collection('sessions').doc(currentCode).update({ markedTarget: null }).catch(() => { }).finally(() => { _gmMarkClearing = false; });
    }

    // ---------- Массовые действия с врагами (1.6) ----------
    const gmEnemySel = new Set();
    window.gmToggleEnemySel = function (id, on) { if (on) gmEnemySel.add(id); else gmEnemySel.delete(id); gmBulkCount(); };
    window.gmEnemySelectAll = function (on) {
        gmEnemySel.clear();
        if (on) (lastData.enemies || []).forEach(e => gmEnemySel.add(e.id));
        renderEnemies(lastData.enemies || []);
    };
    function gmBulkCount() {
        const ids = new Set((lastData.enemies || []).map(e => e.id));
        Array.from(gmEnemySel).forEach(id => { if (!ids.has(id)) gmEnemySel.delete(id); });
        const c = el('gm-bulk-count'); if (c) c.textContent = gmEnemySel.size;
    }
    window.gmBulkToggleMenu = function () {
        const m = el('gm-bulk-menu'); if (!m) return;
        m.style.display = m.style.display === 'none' ? 'block' : 'none';
        const s = el('gm-bulk-status');
        if (s && !s.options.length) s.innerHTML = Object.keys(GM_STATUS_EFFECTS).map(k => `<option value="${k}">${escapeHtml(GM_STATUS_EFFECTS[k].name)}</option>`).join('');
    };
    // общий каркас: берёт выделенных, меняет копией, пишет ОДНИМ update и одной строкой в журнал
    function gmBulkApply(fn, logText) {
        gmBulkCount();
        if (!gmEnemySel.size) { alert('Сначала выдели врагов (галочка слева у карточки).'); return; }
        if (!currentCode) { alert('Нет активной сессии.'); return; }
        const turn = (lastData && lastData.sessionTurnCounter) || 0;
        const notes = [];
        const next = (lastData.enemies || []).map(e => gmEnemySel.has(e.id) ? fn(Object.assign({}, e), notes, turn) : e);
        if (!notes.length) { alert('Среди выделенных нет подходящих целей (мёртвые пропускаются).'); return; }
        gmUpdateEnemies(next).then(() => gmPostLogEntryText(logText(notes))).catch(err => alert('Ошибка: ' + err.message));
    }
    window.gmBulkDamage = function () {
        const n = Math.max(0, parseInt(el('gm-bulk-n').value) || 0), type = el('gm-bulk-type').value;
        if (!n) return;
        gmBulkApply((e, notes, turn) => {
            if ((e.curHp || 0) <= 0) return e;
            const pv = window.StCombat.previewDamage(e, n, type, 0);   // тот же расчёт, что у игрока («Применить»)
            const was = e.curHp || 0;
            e.curHp = Math.max(0, was - pv.finalDmg);
            if (was > 0 && e.curHp <= 0) e.diedAtTurn = turn;          // каждому погибшему — свой момент смерти (окно «поднять труп»)
            notes.push(`${e.name} −${pv.finalDmg}${e.curHp <= 0 ? ' ☠' : ''}`);
            return e;
        }, notes => `💥 Мастер наносит ${n} (${window.StCombat.TYPE_LABEL[type] || type}) выделенным: ${notes.join(', ')}.`);
    };
    window.gmBulkHeal = function () {
        const n = Math.max(0, parseInt(el('gm-bulk-n').value) || 0);
        if (!n) return;
        gmBulkApply((e, notes) => {
            if ((e.curHp || 0) <= 0) return e;
            const was = e.curHp || 0;
            e.curHp = Math.min(e.maxHp || was, was + n);
            notes.push(`${e.name} +${e.curHp - was}`);
            return e;
        }, notes => `💚 Мастер лечит выделенных на ${n}: ${notes.join(', ')}.`);
    };
    window.gmBulkStatus = function () {
        const key = el('gm-bulk-status').value, def = GM_STATUS_EFFECTS[key];
        if (!def) return;
        const turns = Math.max(1, parseInt(el('gm-bulk-turns').value) || def.turns || 1);
        gmBulkApply((e, notes) => {
            if ((e.curHp || 0) <= 0) return e;
            const st = { id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: def.name, desc: def.desc, turns };
            if (def.rollPenalty) st.rollPenalty = def.rollPenalty;
            if (def.dotHp) { st.dotHp = def.dotHp; if (def.dotNoResist) st.dotNoResist = true; }
            Object.assign(st, window.StCombat.statusRule(def.name), def.rollPenalty ? { rollPenalty: def.rollPenalty } : {});
            e.statusEffects = (Array.isArray(e.statusEffects) ? e.statusEffects : []).concat([st]);
            notes.push(e.name);
            return e;
        }, notes => `🌀 Мастер накладывает «${def.name}» (${turns} х.) на: ${notes.join(', ')}.`);
    };
    window.gmBulkRemove = function () {
        gmBulkCount();
        if (!gmEnemySel.size) { alert('Сначала выдели врагов.'); return; }
        if (!confirm('Убрать выделенных врагов (' + gmEnemySel.size + ')?')) return;
        const names = [], next = (lastData.enemies || []).filter(e => { if (gmEnemySel.has(e.id)) { names.push(e.name); return false; } return true; });
        gmEnemySel.clear();
        gmUpdateEnemies(next).then(() => gmPostLogEntryText('🗑 Мастер убирает: ' + names.join(', ') + '.')).catch(err => alert('Ошибка: ' + err.message));
    };

    // Резист игрока к входящему урону атаки мастера. Раньше брался только резист по типу урона: «Сопротивление магии»
    // (перк Изменения, расовое, зачарования) не действовало на огонь/холод/электричество врагов — хотя для врагов
    // общий магический резист к стихиям прибавляется (combat-calc.js). Теперь так же и для игроков, потолок 85%.
    // shieldBlock — галочка «Игрок закрывается щитом»: перки Блокирования «Отбивание стрел» (стрела в щит — 0 урона)
    // и «Защита от стихий» (+50% к огню/холоду/электричеству). Без щита или перков галочка ничего не даёт.
    const GM_ELEM_TYPES = ['fire', 'frost', 'shock'];
    function gmPlayerIncomingResist(data, dmgType, opts) {
        const res = (data && data.resistances) || {};
        const notes = [];
        let r = res[dmgType] || 0;
        if (r) notes.push('резист ' + r + '%');
        if (opts && opts.isRangedAtk && dmgType === 'physical' && res.arrow) { r += res.arrow; notes.push('резист стрелам/болтам +' + res.arrow + '%'); }
        const elem = GM_ELEM_TYPES.indexOf(dmgType) !== -1;
        if (elem && res.magic) { r += res.magic; notes.push('сопр. магии +' + res.magic + '%'); }
        let zero = false;
        if (opts && opts.shieldBlock) {
            const hasShield = !!(data && data.equippedSlots && data.equippedSlots.shield);
            const perk = pi => !!((data && data.perkStates) || {})['skill3-perk' + pi + '-step1'];
            if (!hasShield) notes.push('щита нет — блок щитом не засчитан');
            else {
                if (opts.isRangedAtk && dmgType === 'physical' && perk(1)) { zero = true; notes.push('🏹 «Отбивание стрел»: стрела в щит — урона нет'); }
                if (elem && perk(4)) { r += 50; notes.push('🛡 «Защита от стихий» +50%'); }
                if (!zero && !(elem && perk(4))) notes.push('щит: подходящего перка Блокирования для этой атаки нет');
            }
        }
        // Иммунитет (100%) — полный; уязвимости ниже нуля не обрезаются (урон растёт), потолок 85% — как на листе игрока.
        r = (res[dmgType] || 0) >= 100 ? 100 : Math.max(-100, Math.min(85, r));
        return { resist: r, zero, notes };
    }
    function gmShieldBlockChecked() { const c = el('gm-attack-shield-block'); return !!(c && c.checked); }

    // ---------- Предпросмотр урона по игроку (1.2) ----------
    // Только читает документ игрока и считает; ничего не пишет. Случайные защиты (блок, уклонение, барьер, знак Атронаха) не учитываются.
    window.previewGmAttack = function () {
        const out = el('gm-attack-preview'); if (!out) return;
        if (!pendingGmAttack) { out.textContent = ''; return; }
        const { targetUid, dmg, dmgType } = pendingGmAttack;
        if (!dmg) { out.textContent = 'Урона нет — только эффект/статус.'; return; }
        if (pendingGmAttack.targetKind && pendingGmAttack.targetKind !== 'player') {
            const cd = gmCompanionDamage(pendingGmAttack);
            out.textContent = `Ожидаемый урон по существу: ${cd.finalDmg} (базовый ${dmg}${cd.resist ? ', защита ' + cd.resist + '%' : ''})` +
                (cd.comp ? (cd.left <= 0 ? ` → «${cd.comp.name}» погибает` : ` → останется ${cd.left}/${cd.maxHp} HP`) : '') + '.';
            return;
        }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const ir = gmPlayerIncomingResist(data, dmgType, { shieldBlock: gmShieldBlockChecked(), isRangedAtk: pendingGmAttack.isRangedAtk });
            const pv = ir.zero ? { finalDmg: 0, notes: [] } : window.StCombat.previewDamage({ resist: { [dmgType]: ir.resist } }, dmg, dmgType, 0);
            pv.notes = ir.notes.concat(pv.notes.filter(n => !/^резист/.test(n)));
            const pt = ((lastData && lastData.participants) || {})[targetUid] || {};
            const hpNow = parseInt(pt.curHp), left = isNaN(hpNow) ? null : Math.max(0, hpNow - pv.finalDmg);
            out.textContent = `Ожидаемый урон по игроку: ~${pv.finalDmg} (базовый ${dmg}${pv.notes.length ? ', ' + pv.notes.join(', ') : ''})` +
                (left === null ? '' : left <= 0 ? ` → игрок падает (HP ${hpNow}/${pt.maxHp || '?'})` : ` → останется ~${left}/${pt.maxHp || '?'} HP`) +
                '. Защиты игрока (блок, уклонение, барьер, оберег) в предпросмотре не учтены.';
            out.classList.remove('st-preview-flash'); void out.offsetWidth; out.classList.add('st-preview-flash');
        }).catch(e => { out.textContent = 'Не удалось прочитать резисты: ' + e.message; });
    };

    window.removeEnemyStatus = function (enemyId, statusId) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== enemyId || !Array.isArray(e.statusEffects)) return e;
            return { ...e, statusEffects: e.statusEffects.filter(s => s.id !== statusId) };
        });
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    // Редактирование урона/стоимости конкретного заклинания врага — раньше заклинания были
    // просто текстом, поправить их можно было только удалив и заново добавив противника.
    window.setEnemySpellField = function (id, spellIdx, field, value) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== id || !Array.isArray(e.spells)) return e;
            const spells = e.spells.slice();
            spells[spellIdx] = Object.assign({}, spells[spellIdx], { [field]: Number(value) || 0 });
            return { ...e, spells };
        });
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    window.removeEnemy = function (id) {
        const enemies = (lastData.enemies || []).filter(e => e.id !== id);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    // ---------- Инициатива ----------

    // ---------- Порядок ходов (заменяет инициативу — своя система, без броска) ----------

    function renderTurnOrder(list) {
        const target = el('turn-order-list');
        if (!target) return;
        if (!list.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Порядок ходов не задан.</p>'; return; }
        target.innerHTML = list.map((item, i) => `
            <div class="initiative-row">
                <span>${i + 1}. ${escapeHtml(item.name || '?')}</span>
                <span style="display:flex; gap:4px;">
                    <button style="width:auto;padding:1px 8px;font-size:12px;" ${i === 0 ? 'disabled' : ''} onclick="moveTurnOrder('${item.id}', -1)">▲</button>
                    <button style="width:auto;padding:1px 8px;font-size:12px;" ${i === list.length - 1 ? 'disabled' : ''} onclick="moveTurnOrder('${item.id}', 1)">▼</button>
                    <button class="btn-danger" style="width:auto;padding:1px 8px;font-size:12px;" onclick="removeTurnOrder('${item.id}')">×</button>
                </span>
            </div>`).join('');
    }

    // Собирает список для выпадашки: игроки сессии, их призванные/поднятые существа
    // (лёгкий список имён, синхронизированный из characters/{uid}.activeSummons), и живые враги.
    function renderTurnOrderPickSelect() {
        const sel = el('turn-order-pick-select');
        if (!sel) return;
        const opts = [];
        Object.entries(lastData.participants || {}).forEach(([uid, p]) => {
            opts.push(`<option value="${escapeHtml(p.name || uid)}">🧑 ${escapeHtml(p.name || uid)}</option>`);
            (p.summonNames || []).forEach(sn => opts.push(`<option value="${escapeHtml(sn)}">👻 ${escapeHtml(sn)} (существо ${escapeHtml(p.name || uid)})</option>`));
        });
        (lastData.enemies || []).filter(e => (e.curHp || 0) > 0).forEach(e => {
            opts.push(`<option value="${escapeHtml(e.name)}">💀 ${escapeHtml(e.name)}</option>`);
        });
        sel.innerHTML = opts.length ? opts.join('') : '<option value="">— никого нет —</option>';
    }

    window.addTurnOrderFromPick = function () {
        const name = el('turn-order-pick-select').value;
        if (!name) return;
        addTurnOrderEntry(name);
    };

    window.addTurnOrderCustom = function () {
        const input = el('turn-order-name-input');
        const name = input.value.trim();
        if (!name) return;
        addTurnOrderEntry(name);
        input.value = '';
    };

    function addTurnOrderEntry(name) {
        const list = (lastData.turnOrder || []).slice();
        list.push({ id: genId('t'), name });
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    }

    window.moveTurnOrder = function (id, dir) {
        const list = (lastData.turnOrder || []).slice();
        const idx = list.findIndex(i => i.id === id);
        const swapIdx = idx + dir;
        if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
        [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    };

    window.removeTurnOrder = function (id) {
        const list = (lastData.turnOrder || []).filter(i => i.id !== id);
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    };

    window.clearTurnOrder = function () {
        db.collection('sessions').doc(currentCode).update({ turnOrder: [] }).catch(e => console.error(e));
    };

    // Раньше у мастера вообще не было кнопки "следующий ход" — только у игроков (их собственная
    // bumpSessionTurnCounter тикает ТОЛЬКО общий счётчик, личные эффекты на листе игрока
    // decrement'ятся у НЕГО локально). Эта кнопка — для серверной части, которую контролирует
    // мастер: статус-эффекты и кулдауны криков на врагах, и общий счётчик ходов сессии (тот же
    // sessionTurnCounter, что уже используют игроки — не отдельный, чтобы не рассинхронизировать
    // окно "поднять труп только 5 ходов после смерти").
    // Обнуление общего счётчика ходов сессии — чтобы не копился бесконечно за долгую игру.
    // Честно предупреждаю: окно "труп поднимаемый только первые 5 ходов после смерти" тоже
    // завязано на этот счётчик — обнуление может повлиять на расчёт для уже лежащих трупов.
    window.resetSessionTurnCounter = function () {
        if (!confirm('Обнулить общий счётчик ходов сессии до 0? Это также повлияет на расчёт "труп поднимаемый только первые 5 ходов после смерти" для уже умерших врагов.')) return;
        db.collection('sessions').doc(currentCode).update({ sessionTurnCounter: 0, sessionRoundCounter: 0 }).catch(e => alert('Ошибка: ' + e.message));
    };

    function gmRollDotDice(d) {
        const n = Math.max(1, parseInt(d[0]) || 1), sides = Math.max(1, parseInt(d[1]) || 10);
        let sum = 0; for (let i = 0; i < n; i++) sum += 1 + Math.floor(Math.random() * sides);
        return sum;
    }
    // Один «тик» хода для врагов: яды/регенерация, длительность статусов, кулдауны криков.
    function gmEnemyTickOnce(enemiesIn, turnNow, tickLog) {
        const out = (enemiesIn || []).map(e => {
            const copy = { ...e };
            // Яды и зелья на враге: затяжной урон/снятие маны и регенерация тикают КАЖДЫЙ ход (до уменьшения длительности).
            if (Array.isArray(copy.statusEffects) && copy.statusEffects.length && (copy.curHp || 0) > 0) {
                let dHp = 0, dMp = 0;
                let poisonRes = (copy.resist && copy.resist.poison) || 0;
                copy.statusEffects.forEach(s => { if (s.res && s.res.poison) poisonRes += s.res.poison; });
                copy.statusEffects.forEach(s => {
                    // dotDice [N, грани] — урон бросается заново каждый ход («Змей: ядовитое касание» — Nd10 в начале каждого хода)
                    const dot = Array.isArray(s.dotDice) ? gmRollDotDice(s.dotDice) : s.dotHp;
                    if (dot && s.dotType && window.StCombat) dHp -= window.StCombat.previewDamage(copy, dot, s.dotType, 0).finalDmg; // горение — огнём, с резистом и уязвимостью
                    else if (dot) dHp -= Math.max(0, Math.round(dot * (s.dotNoResist ? 1 : (1 - poisonRes / 100))));
                    if (s.dotMp) dMp -= s.dotMp;
                    if (s.regenHp) dHp += s.regenHp;
                    if (s.regenMp) dMp += s.regenMp;
                });
                if (dHp || dMp) {
                    const oldHp = copy.curHp || 0, oldMp = copy.curMp || 0;
                    copy.curHp = Math.max(0, Math.min(copy.maxHp || oldHp, oldHp + dHp));
                    copy.curMp = Math.max(0, Math.min(copy.maxMp || oldMp, oldMp + dMp));
                    if (oldHp > 0 && copy.curHp <= 0) copy.diedAtTurn = turnNow || 0;
                    if (copy.curHp < oldHp) copy.statusEffects = copy.statusEffects.filter(st => !(st && (st.breakOnDamage || (window.StCombat && window.StCombat.statusRule(st.name).breakOnDamage)))); // урон по ходу тоже снимает «спадающие от урона»
                    const parts = [];
                    if (copy.curHp !== oldHp) parts.push(`${copy.curHp - oldHp > 0 ? '+' : ''}${copy.curHp - oldHp} хп`);
                    if (copy.curMp !== oldMp) parts.push(`${copy.curMp - oldMp > 0 ? '+' : ''}${copy.curMp - oldMp} маны`);
                    if (parts.length) tickLog.push(`☠ «${copy.name}»: ${parts.join(', ')} от эффектов${copy.curHp <= 0 ? ' — погибает' : ''}.`);
                }
            }
            if (Array.isArray(copy.statusEffects) && copy.statusEffects.length) {
                copy.statusEffects = copy.statusEffects
                    .map(s => ({ ...s, turns: s.turns != null ? s.turns - 1 : s.turns }))
                    .filter(s => s.turns == null || s.turns > 0);
            }
            Object.keys(copy).forEach(k => {
                if (k.indexOf('shoutCd_') === 0 && copy[k] > 0) copy[k] = copy[k] - 1;
            });
            return copy;
        });
        return out;
    }

    // Следующий ход/круг — общий для мастера и игроков (тот же механизм, что у кнопок игроков).
    // Повтор в течение 3 секунд игнорируется: если игрок только что переключил ход, второй раз не листаем.
    window.gmAdvanceTurn = function (kind) {
        if (!currentCode) return;
        kind = kind === 'round' ? 'round' : 'turn';
        const ref = db.collection('sessions').doc(currentCode);
        const now = Date.now(); let res = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            if (!doc.exists) throw new Error('Сессия не найдена.');
            const d = doc.data() || {};
            const la = d.lastAdvance || {};
            if (la.at && now - la.at < 3000 && now >= la.at) { res = { skipped: true, by: la.by }; return; }
            const turn = (parseInt(d.sessionTurnCounter) || 0) + (kind === 'round' ? 0 : 1);
            const round = (parseInt(d.sessionRoundCounter) || 0) + (kind === 'round' ? 1 : 0);
            tx.update(ref, {
                sessionTurnCounter: turn, sessionRoundCounter: round,
                sessionTickCounter: (parseInt(d.sessionTickCounter) || 0) + 1,
                lastAdvance: { at: now, by: 'Мастер', kind },
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: now, author: 'Мастер', text: kind === 'round' ? '🔄 Новый круг (круг ' + round + '). Эффекты у всех прокручиваются сами.' : '⏭️ Новый ход (ход ' + turn + '). Эффекты у всех прокручиваются сами.' })
            });
        })).then(() => { if (res && res.skipped) alert((kind === 'round' ? 'Круг' : 'Ход') + ' только что переключил(а) ' + (res.by || 'кто-то') + ' — повторно не листаю.'); })
          .catch(e => alert('Ошибка: ' + e.message));
    };

    // Тик врагов догоняет общий счётчик (кто бы ни переключил ход — мастер или игрок). Транзакция: две вкладки мастера не протикают дважды.
    let _gmTickBusy = false;
    function gmEnemyTickWatch(data) {
        { const st = el('gm-turn-status'); if (st && data) { const la = data.lastAdvance || {}; st.textContent = 'Ход ' + (parseInt(data.sessionTurnCounter) || 0) + ' · Круг ' + (parseInt(data.sessionRoundCounter) || 0) + (la.by ? ' · последним переключил(а): ' + la.by : ''); } }
        if (!currentCode || _gmTickBusy || !data) return;
        const total = parseInt(data.sessionTickCounter) || 0, done = parseInt(data.enemyTickDone) || 0;
        if (total <= done) { if (total < done) db.collection('sessions').doc(currentCode).update({ enemyTickDone: total }).catch(() => { }); return; }
        _gmTickBusy = true;
        const ref = db.collection('sessions').doc(currentCode);
        let ticks = 0;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            ticks = 0;
            if (!doc.exists) return;
            const d = doc.data() || {};
            const t = parseInt(d.sessionTickCounter) || 0, dn = parseInt(d.enemyTickDone) || 0;
            if (t <= dn) return;
            ticks = Math.min(10, t - dn);
            const tickLog = [];
            let en = d.enemies || [];
            let gridNow = d.grid || null; const zoneHits = [];
            for (let i = 0; i < ticks; i++) {
                en = gmEnemyTickOnce(en, parseInt(d.sessionTurnCounter) || 0, tickLog);
                // длительные зоны на боевой сетке (плащи, ауры, стены, круги): бьют тех, кто внутри
                if (gridNow && window.GmGrid && window.GmGrid.zoneTick && Object.keys(gridNow.zones || {}).length) {
                    const zt = window.GmGrid.zoneTick(Object.assign({}, d, { grid: gridNow }), en);
                    en = zt.enemies; gridNow = zt.grid; tickLog.push(...zt.logs); zoneHits.push(...zt.hits);
                }
            }
            const patch = { enemies: stripUndefinedDeep(en), enemyTickDone: t };
            if (gridNow && gridNow !== d.grid) patch.grid = stripUndefinedDeep(gridNow);
            if (zoneHits.length && window.GmGrid) Object.assign(patch, window.GmGrid.hitsPatch(zoneHits));
            if (tickLog.length) patch.combatLog = firebase.firestore.FieldValue.arrayUnion(...tickLog.map((x, i) => ({ ts: Date.now() + i + 1, author: 'Мастер', text: x })));
            tx.update(ref, patch);
        })).then(() => {
            const fired = [];
            for (let i = 0; i < ticks; i++) fired.push(...gmTickTimers());
            if (fired.length) gmPostLogEntryText('⏰ Сработало событие: ' + fired.join('; '));
        }).catch(e => console.error('Тик врагов:', e)).finally(() => { _gmTickBusy = false; });
    }

    // ---------- Боевой журнал ----------

    // Шёпот от игроков — приватная панель, НЕ смешивается с общим боевым журналом.
    // Переписка: входящие (whispers, от игроков) и исходящие (gmWhispers, твои ответы) вперемешку по времени.
    function renderWhispers(whispers, gmWhispers) {
        const target = el('gm-whispers-list');
        if (!target) return;
        const items = (whispers || []).map(w => ({ ...w, dir: 'in' }))
            .concat((gmWhispers || []).map(w => ({ ...w, dir: 'out' })))
            .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        if (!items.length) {
            target.innerHTML = '<p style="opacity:.6; font-size:13px;">Пока ничего не нашёптано.</p>';
            return;
        }
        target.innerHTML = items.map(w => {
            const time = w.ts ? new Date(w.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            if (w.dir === 'out') {
                return '<div class="log-entry" style="opacity:.85;"><span class="log-time">' + time + '</span><span class="log-author">Ты → ' + escapeHtml(w.toName || '?') + ':</span> ' + escapeHtml(w.text || '') + '</div>';
            }
            // Ответить можно по fromUid; у старых шёпотов (до этой правки) uid нет — ищем игрока по имени.
            let uid = w.fromUid;
            if (!uid) {
                const parts = lastData.participants || {};
                uid = Object.keys(parts).find(u => (parts[u] || {}).name === w.author) || '';
            }
            const reply = uid ? ' <button style="width:auto; padding:0 6px; font-size:11px;" onclick="replyToWhisper(\'' + jsq(uid) + '\')">↩ ответить</button>' : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(w.author || '?') + ':</span> ' + escapeHtml(w.text || '') + reply + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    function populateGmWhisperTarget() {
        const sel = el('gm-whisper-target');
        if (!sel) return;
        const parts = lastData.participants || {};
        const uids = Object.keys(parts);
        const prev = sel.value;
        sel.innerHTML = uids.length
            ? uids.map(u => `<option value="${escapeHtml(u)}">${escapeHtml((parts[u] || {}).name || u)}</option>`).join('')
            : '<option value="">Нет игроков</option>';
        if (uids.includes(prev)) sel.value = prev;
    }

    window.replyToWhisper = function (uid) {
        const sel = el('gm-whisper-target');
        if (sel) sel.value = uid;
        const inp = el('gm-whisper-input');
        if (inp) inp.focus();
    };

    window.sendGmWhisper = function () {
        const uid = el('gm-whisper-target').value;
        const text = (el('gm-whisper-input').value || '').trim();
        if (!uid) { alert('Выбери игрока.'); return; }
        if (!text) return;
        const toName = ((lastData.participants || {})[uid] || {}).name || uid;
        db.collection('sessions').doc(currentCode).update({
            gmWhispers: firebase.firestore.FieldValue.arrayUnion({
                id: 'gw-' + Date.now() + Math.random().toString(36).slice(2, 8), // уникальный id — arrayUnion иначе схлопнул бы два одинаковых ответа подряд
                ts: Date.now(), toUid: uid, toName: toName, text: text
            })
        }).then(() => { el('gm-whisper-input').value = ''; }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Enter в поле ответа — отправить.
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && ev.target && ev.target.id === 'gm-whisper-input') window.sendGmWhisper();
    });

    window.clearWhispers = function () {
        if (!confirm('Очистить все шёпоты от игроков?')) return;
        db.collection('sessions').doc(currentCode).update({ whispers: [], gmWhispers: [] }).catch(e => console.error(e));
    };

    function renderLog(log) {
        const target = el('gm-combat-log');
        target.innerHTML = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(entry.author || '?') + ':</span> ' + escapeHtml(entry.text || '') + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    // Мост для модуля боевой сетки (gm-grid.js): доступ к базе, текущей сессии и готовым функциям мастера.
    window.GmBridge = {
        db: () => db, code: () => currentCode, data: () => lastData,
        log: t => gmPostLogEntryText(t),
        updateEnemies: list => gmUpdateEnemies(list),
        updateVitals: (uid, fn) => updateCharacterVitals(uid, fn),
        enemyDmg: e => { try { return enemyWeaponDamage(e).total; } catch (x) { return e && e.weaponDmg || 0; } },
        strip: o => stripUndefinedDeep(o)
    };
    function gmPostLogEntryText(text) {
        if (!text || !currentCode) return;
        db.collection('sessions').doc(currentCode).update({
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: text })
        }).catch(e => console.error(e));
    }

    window.gmPostLogEntry = function () {
        const input = el('gm-log-input');
        const text = (input.value || '').trim();
        if (!text) return;
        gmPostLogEntryText(text);
        input.value = '';
    };

    window.clearLog = function () {
        if (!confirm('Очистить весь боевой журнал?')) return;
        db.collection('sessions').doc(currentCode).update({ combatLog: [] }).catch(e => console.error(e));
    };

    // Экспорт журнала боя в текстовый файл — для протокола сессии (техдолг, пункт "экспорт
    // боевого журнала"). Берёт lastData.combatLog — тот же массив, что уже отрендерен на экране,
    // никакого отдельного запроса к Firestore не нужно.
    window.exportCombatLogToFile = function () {
        const log = (lastData && lastData.combatLog) || [];
        if (!log.length) { alert('Журнал пуст — нечего экспортировать.'); return; }
        const lines = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleString('ru-RU') : '';
            return `[${time}] ${entry.author || '?'}: ${entry.text || ''}`;
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boevoy_zhurnal_${currentCode || 'sessiya'}_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    el('gm-log-input') && el('gm-log-input').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') window.gmPostLogEntry();
    });

    // ---------- Инициализация ----------
    if (window.FIREBASE_CONFIGURED) {
        initAuth();
    } else {
        showOverlay(false);
        console.warn('Firebase не настроен — см. README-FIREBASE.md');
    }
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
        const weapons = window.weaponRecipes || [];
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
        let html = '';
        if (c.inJail) {
            html += `<p style="color:#e67e22;">🔒 В тюрьме (${escapeHtml(c.jailHold)}), осталось ${c.jailDaysRemaining} дн.</p>
                <button class="btn-success" style="width:100%;" onclick="releaseFromJail()">Освободить</button>`;
        } else if (c.fineAmount > 0) {
            html += `<p>💰 Штраф: <strong>${c.fineAmount}</strong> септимов (${escapeHtml(c.fineHold)}) — ${escapeHtml(c.fineReason || 'без причины')}${c.refused ? '<br><span style="color:#e74c3c;">Игрок отказался платить.</span>' : ''}</p>
                <button class="btn-danger" style="width:100%;" onclick="clearFine()">💰 Оплатить штраф из кошелька игрока</button>
                ${!c.refused ? `<button style="width:100%; margin-top:4px;" onclick="markFineRefused()">🙅 Отметить отказ платить</button>` : ''}
                <label style="margin-top:6px;">Отправить в тюрьму на (дней)</label>
                <input type="number" id="jail-days-input" value="3" min="1" style="width:70px; display:inline;">
                <button style="width:100%; margin-top:4px;" onclick="sendToJail()">🔒 Отправить в тюрьму</button>`;
        } else {
            html += '<p style="opacity:.6; font-size:13px;">Штрафов нет.</p>';
        }
        html += `<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-color);">
            <label>Новый штраф</label>
            <input type="number" id="fine-amount-input" placeholder="Сумма">
            <select id="fine-hold-select">${REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('')}</select>
            <input type="text" id="fine-reason-input" placeholder="За что (необязательно)">
            <button class="btn-success" style="width:100%; margin-top:4px;" onclick="issueFine()">Выписать штраф</button>
            ${JAIL_FINE_THRESHOLD ? `<p style="font-size:11px; opacity:.6; margin-top:4px;">От ${JAIL_FINE_THRESHOLD} септимов штраф обычно ведёт в тюрьму, если не оплачен сразу.</p>` : ''}
        </div>`;
        box.innerHTML = html;
    }

    function saveCrimeState() {
        if (!currentInvPlayerUid) return Promise.resolve();
        return db.collection('characters').doc(currentInvPlayerUid).update({ crimeState: currentCrimeState });
    }

    window.issueFine = function () {
        if (!currentInvPlayerUid) return;
        const amount = parseInt(el('fine-amount-input').value) || 0;
        if (amount <= 0) { alert('Укажи сумму штрафа.'); return; }
        // Неоплаченный штраф не затирается новым, а растёт на новую сумму.
        const prevFine = currentCrimeState.fineAmount || 0;
        const newReason = el('fine-reason-input').value.trim();
        currentCrimeState = Object.assign({}, currentCrimeState, {
            fineAmount: prevFine + amount, fineHold: prevFine > 0 && currentCrimeState.fineHold ? currentCrimeState.fineHold : el('fine-hold-select').value,
            fineReason: prevFine > 0 ? [currentCrimeState.fineReason, newReason].filter(Boolean).join('; ') : newReason, refused: false
        });
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText(`⚖️ Штраф ${amount} септимов (${currentCrimeState.fineHold})${newReason ? ': ' + newReason : ''}${prevFine > 0 ? ` — всего к оплате ${currentCrimeState.fineAmount}` : ''}.`);
            try { window.rumAddDeed({ kind: 'crime', amount: amount, reason: currentCrimeState.fineReason, hold: currentCrimeState.fineHold || undefined, who: [((lastData.participants || {})[currentInvPlayerUid] || {}).name].filter(Boolean) }); } catch (e) { }
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.markFineRefused = function () {
        if (!currentInvPlayerUid) return;
        currentCrimeState = Object.assign({}, currentCrimeState, { refused: true });
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText('🙅 Игрок отказался платить штраф.');
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
    window.clearFine = function () {
        if (!currentInvPlayerUid) return;
        const uid = currentInvPlayerUid, fine = currentCrimeState.fineAmount || 0, hold = currentCrimeState.fineHold;
        const ref = db.collection('characters').doc(uid);
        const cleared = Object.assign({}, currentCrimeState, { fineAmount: 0, fineHold: '', fineReason: '', refused: false });
        let paid = fine, note = '';
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const data = doc.data() || {};
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

    window.sendToJail = function () {
        if (!currentInvPlayerUid) return;
        const days = parseInt(el('jail-days-input').value) || 1;
        currentCrimeState = Object.assign({}, currentCrimeState, {
            inJail: true, jailHold: currentCrimeState.fineHold, jailDaysRemaining: days,
            fineAmount: 0, fineReason: '', refused: false // штраф "отработан" сроком
        });
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
            lich: null, faithShift: null
        };
    }

    let currentGuildsData = defaultGuildsData();

    // ---------- Задача C: живые торговцы ----------
    // Категории даны как в items-data.js/allItems; кузнец дополнительно берёт из weaponRecipes/
    // armorRecipes (базовые скованные вещи туда не всегда дублируются в allItems).
    const LIVING_MERCHANT_TYPES = {
        innkeeper: { label: 'Трактирщик', gold: 750, categories: ['Готовые продукты', 'Напитки'] },
        alchemist2: { label: 'Алхимик', gold: 1250, categories: ['Ингредиенты для алхимии'] },
        grocer: { label: 'Бакалейщик', gold: 1250, categories: ['Сырые продукты', 'Шкуры', 'Бытовые предметы'] },
        blacksmith2: { label: 'Кузнец', gold: 1500, categories: ['Легкая броня (лут)', 'Тяжелая броня (лут)', 'Одноручное (лут)', 'Двуручное (лут)'] },
        // "Торговец одеждой" (clothier) убран из списка по прямой просьбе — объединён с придворным
        // колдуном (магические одеяния теперь в его ассортименте). Тип вернётся отдельно, когда
        // появится база ПРОСТОЙ (не магической) одежды — пока такого файла нет.
        fletcher: { label: 'Торговец луками и стрелами', gold: 1500, categories: ['Луки (лут)'] },
        jeweler: { label: 'Ювелир', gold: 1500, categories: ['Ювелирное изделие (лут)', 'Ювелирные изделия', 'Драгоценные камни'] },
        foodVendor: { label: 'Торговец едой', gold: 750, categories: ['Сырые продукты'] },
        courtWizard: { label: 'Придворный колдун', gold: 1500, categories: ['Свитки (прописанные)', 'Посохи', 'Магические одеяния'] },
        khajiitCaravan: { label: 'Каджитский караван', gold: 1500, categories: ['Сырые продукты', 'Бытовые предметы', 'Ювелирные изделия', 'Шкуры'] },
        // Раньше "барахольщик" существовал ТОЛЬКО как получатель продажи (сторона продажи у
        // игрока) — тип живого торговца с собственным ассортиментом для покупки отсутствовал
        // вообще. Добавлен по прямой просьбе, общий профиль (всякая всячина), плюс слитки ниже.
        pawnbrokerLive: { label: 'Барахольщик', gold: 1000, categories: ['Бытовые предметы', 'Сырые продукты', 'Ювелирные изделия'] }
    };
    // Торговцы животными (pets-data.js: PET_MERCHANTS) — в общем списке типов; товар у них — животные, а не вещи.
    Object.keys(window.PET_MERCHANTS || {}).forEach(k => { const d = window.PET_MERCHANTS[k]; LIVING_MERCHANT_TYPES[k] = { label: d.label, gold: d.gold, categories: [], pets: true }; });
    window.LIVING_MERCHANT_TYPES = LIVING_MERCHANT_TYPES;

    // Предметы, которые торговец не продаёт, даже если формально попадают в его категорию
    // (например, человечье мясо — никто не торгует им легально).
    // Предметы, которые НЕ должны попадать в ассортимент живых торговцев, хотя формально имеют
    // цену и подходящую категорию: человечье мясо (неаппетитно для витрины алхимика), одеяния
    // Коллегии магов (выдаются только за полное изучение школы, не продаются торговцами), одежда
    // повара (рабочая форма, не то, что носят обычные покупатели).
    const MERCHANT_EXCLUDED_ITEMS = new Set([
        'Человечье мясо',
        'Перчатки магистра (Разрушение)', 'Перчатки магистра (Изменение)', 'Перчатки магистра (Иллюзия)', 'Перчатки магистра (Колдовство)', 'Перчатки магистра (Восстановление)', 'Роба разрушения', 'Великий созидатель', 'Создатель обмана',
        'Мастер даэдра', 'Великий свет', 'Выпускник Коллегии Магов Винтерхолда',
        'Одение повара', 'Колпак повара',
        // Скума и лунный сахар — эксклюзив каджитского каравана, у остальных торговцев их быть
        // не должно (по прямой просьбе).
        'Красноводная скума', 'Лунный сахар',
        // Вампирский напиток — в таверне его не наливают
        'Зелье крови',
        // Прах Берита у торговцев не продаётся (по просьбе)
        'Прах Берита'
    ]);
    // Одеяния и перчатки мастеров школ «выдаются в Коллегии при полном изучении школы» — купить их
    // нельзя ни у кого. Раньше в списке исключений были не все (не хватало Робы разрушения,
    // Великого созидателя, Создателя обмана и Перчаток магистра (Восстановление)), поэтому
    // исключаем и по самому описанию предмета: «Выдаётся/Выдаются/Выдаёт в Коллегии…».
    function isMerchantExcluded(i) {
        if (MERCHANT_EXCLUDED_ITEMS.has(i.name)) return true;
        return /выд[а-яё]*\s+в\s+коллеги/i.test(i.effect || '');
    }

    // Стрелы для продажи: обычные материальные стрелы из таблицы кузнеца (по цене за штуку).
    // Раньше торговец луками продавал безымянную «Стрелу» за 1 септим — заглушку.
    const MERCHANT_ARROW_NAMES = ['Железная стрела', 'Стальная стрела', 'Орочья стрела', 'Нордская стрела', 'Двемерская стрела', 'Эльфийская стрела', 'Стеклянная стрела', 'Эбонитовая стрела'];
    function merchantArrowPool() {
        return (window.weaponRecipes || []).filter(w => w.isAmmo && MERCHANT_ARROW_NAMES.includes(w.name))
            .map(w => ({ name: w.name, category: 'Боеприпасы', price: w.price, weight: w.weight, dmg: w.damage }));
    }

    function getMerchantItemPool(typeKey) {
        const def = LIVING_MERCHANT_TYPES[typeKey];
        if (!def) return [];
        let pool = (gmAllItems || []).filter(i => def.categories.includes(i.category) && typeof i.price === 'number' && i.price > 0 && !isMerchantExcluded(i));
        if (typeKey === 'blacksmith2') {
            pool = pool.concat((window.weaponRecipes || []).filter(w => !/лук/i.test(w.name) && !w.isAmmo).map(w => ({ name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorRecipes || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: GM_SMITHING_SLOT_MAP[a.slot] || null })));
            pool = pool.concat(merchantArrowPool());
            pool = pool.concat((window.weaponsNonCraftable || []).filter(w => !/лук/i.test(w.name)).map(w => ({ name: w.name, category: /стрел|болт/i.test(w.name) ? 'Боеприпасы' : 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorNonCraftable || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: normalizeArmorSlot(a.slot) })));
        }
        if (typeKey === 'fletcher') {
            pool = pool.concat(merchantArrowPool());
            // "Луки (лут)" в allItems — только зачарованные варианты; базовые луки лежат в
            // weaponRecipes/weaponsNonCraftable, раньше торговец луками их вообще не продавал.
            pool = pool.concat((window.weaponRecipes || []).filter(w => /лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.weaponsNonCraftable || []).filter(w => /лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
        }
        if (typeKey === 'khajiitCaravan') {
            // Скума и лунный сахар — эксклюзив каравана (исключены у всех остальных выше через
            // MERCHANT_EXCLUDED_ITEMS), добавляем их сюда напрямую в обход этого исключения.
            const skooma = (window.allItems || gmAllItems).find(i => i.name === 'Красноводная скума');
            const moonSugar = (window.allItems || gmAllItems).find(i => i.name === 'Лунный сахар');
            if (skooma) pool.push(skooma);
            if (moonSugar) pool.push(moonSugar);
        }
        if (typeKey === 'courtWizard') {
            // Тома заклинаний (новичок/ученик) — по прямой просьбе, ~в 1.5 раза больше в продаже,
            // чем посохов. Отбор идёт по УНИКАЛЬНЫМ именам (в refreshMerchantStock), поэтому
            // дублирование записей тут не работает — увеличивает лишь шанс попасть хоть раз, а не
            // количество копий в итоге. Вместо этого напрямую уменьшаем число РАЗНЫХ посохов в
            // пуле (было 42) — меньше вариантов физически означает меньше посохов в ассортименте,
            // пока рядом лежат 85 разных томов, которые никто не трогал.
            pool = pool.concat(window.spellTomesData || []);
            const staves = pool.filter(i => i.category === 'Посохи');
            const otherItems = pool.filter(i => i.category !== 'Посохи');
            const keepStaffCount = Math.max(3, Math.round(staves.length * 0.4)); // 42 → ~17 видов
            const shuffledStaves = staves.slice().sort(() => Math.random() - 0.5).slice(0, keepStaffCount);
            pool = otherItems.concat(shuffledStaves);
        }
        return pool.filter(i => !(MERCH_GEAR_CATS.test(i.category || '') && MERCH_NEVER_RE.test(i.name)));
    }

    // Генерирует новый ассортимент (10-20 предметов) + сбрасывает золото до базового. Ключ —
    // "тип@владение", т.к. кузнец в Вайтране и кузнец в Маркарте — разные лавки с разным товаром.
    // Привязка "что добывают в этом краю" к владению — используется у кузнеца, чтобы его
    // витрина отражала местные месторождения/традиции, а не была одинаковой по всему Скайриму.
    // Не эксклюзивно (не единственный материал), просто выпадает заметно чаще.
    const HOLD_MATERIAL_AFFINITY = {
        'Вайтран': /^(Железн|Стальн)/i,
        'Рифт': /^(Стальн|Орочь)/i,
        'Хаафингар': /^(Стальн|Эльфийск)/i,
        'Хьялмарк': /^(Железн|Стальн)/i,
        'Истмарк': /^(Стальн|Нордск)/i,
        'Фолкрит': /^(Железн|Стальн)/i,
        'Предел': /^(Двемерск|Эльфийск)/i,
        'Белый Берег': /^(Железн|Стальн)/i,
        'Винтерхолд': /^(Стальн|Стеклянн)/i
    };

    // ---------- Ассортимент «как в Скайриме» ----------
    // Раньше витрина была случайной выборкой из ОДНОГО общего списка: чего в базе больше (например, 16 видов
    // луков против 8 видов стрел), того больше и на прилавке. Теперь у каждого типа торговца есть РАЗДЕЛЫ с
    // долей товара (как у списков торговцев в игре: кузнец — оружие, броня, слитки, кожа; торговец луками —
    // луки, стрелы, болты…), внутри раздела дешёвое попадается чаще дорогого, а обязательные товары лежат всегда.
    // Фалмерское, изгойское и древненордское оружие/броня у торговцев не продаётся вообще (по просьбе)
    const MERCH_NEVER_RE = /фалмер|изгое|древн/i;
    const MERCH_GEAR_CATS = /^(Оружие|Броня|Луки|Боеприпасы|Легкая броня \(лут\)|Тяжелая броня \(лут\)|Одноручное \(лут\)|Двуручное \(лут\)|Луки \(лут\))$/;
    const MERCH_SPECIAL_RE = /небесн|риклинг|бич магов/i; // редкое: максимум пара позиций
    // снаряжение, которое продают только в «своих» владениях
    const MERCH_REGION_ONLY = [[/хитинов/i, ['Схолстейм']], [/братьев бури/i, ['Истмарк']]];
    // Региональные пристрастия: во сколько раз чаще (>1) или реже (<1) встречается материал в лавке владения.
    // Двемерское — у Маркарта, нордское резное — в Истмарке, имперское — в Солитьюде и т.д.
    const MERCH_AFFINITY = {
        'Вайтран': [[/^железн/i, 2], [/^стальн/i, 2], [/^имперск/i, 1.5], [/^(охотнич|длинн)/i, 1.5], [/^нордск/i, 1.3], [/^двемерск/i, 0.4], [/^эбонит/i, 0.5], [/^стеклянн/i, 0.6]],
        'Рифт': [[/^стальн/i, 2], [/^орочь/i, 2], [/^железн/i, 1.5], [/^эльфийск/i, 1.3], [/^(кожан|мехов)/i, 1.5], [/^нордск/i, 1.2], [/^двемерск/i, 0.6]],
        'Хаафингар': [[/^имперск/i, 3], [/^эльфийск/i, 2], [/^стальн/i, 1.5], [/^стеклянн/i, 1.5], [/^нордск/i, 0.7], [/^двемерск/i, 0.5], [/^мехов/i, 0.6]],
        'Хьялмарк': [[/^железн/i, 2], [/^кожан/i, 2], [/^(мехов|сыромятн)/i, 1.5], [/^орочь/i, 1.2], [/^двемерск/i, 0.5], [/^эльфийск/i, 0.6], [/^стеклянн/i, 0.5]],
        'Истмарк': [[/^нордск/i, 4], [/^мехов/i, 2], [/братьев бури/i, 4], [/^стальн/i, 1.5], [/^железн/i, 1.3], [/^имперск/i, 0.5], [/^двемерск/i, 0.3], [/^эльфийск/i, 0.4]],
        'Фолкрит': [[/^(кожан|сыромятн)/i, 2], [/^мехов/i, 1.5], [/^железн/i, 1.5], [/^охотнич/i, 2], [/^имперск/i, 1.2], [/^двемерск/i, 0.4], [/^эбонит/i, 0.4]],
        'Предел': [[/^двемерск/i, 5], [/^эльфийск/i, 2], [/^орочь/i, 2], [/серебр/i, 2], [/^нордск/i, 0.6], [/^имперск/i, 0.7], [/^мехов/i, 0.8]],
        'Белый Берег': [[/^нордск/i, 2], [/^стальн/i, 2], [/^железн/i, 2], [/^мехов/i, 2], [/^небесн/i, 1.5], [/^двемерск/i, 0.5], [/^эльфийск/i, 0.5]],
        'Винтерхолд': [[/^стеклянн/i, 2], [/^эльфийск/i, 1.5], [/^стальн/i, 1.5], [/^мехов/i, 2], [/^сталгрим/i, 2], [/^нордск/i, 1.3], [/^двемерск/i, 0.7]],
        'Схолстейм': [[/хитинов/i, 4], [/^сталгрим/i, 3], [/^эбонит/i, 2], [/^нордск/i, 1.5], [/^мехов/i, 2], [/^орочь/i, 0.7], [/^имперск/i, 0.4]]
    };
    // Региональные пристрастия алхимика и торговцев едой — по описанию флоры и фауны владений (справочник «Владения»).
    // Правило: [регулярка по названию, {владение: во сколько раз чаще/реже}, множитель для остальных владений (по умолчанию 1)].
    const _V = 'Вайтран', _R = 'Рифт', _H = 'Хаафингар', _K = 'Хьялмарк', _E = 'Истмарк', _F = 'Фолкрит', _P = 'Предел', _B = 'Белый Берег', _W = 'Винтерхолд', _S = 'Схолстейм';
    const MERCH_ING_AFFINITY = [
        [/^(Лаванда|Пушица)$/, { [_V]: 3, [_R]: 1.3, [_W]: 0.2, [_B]: 0.2, [_P]: 0.5 }],
        [/горноцвет/, { [_V]: 2, [_F]: 2, [_R]: 2, [_H]: 1.5, [_B]: 1.5, [_K]: 1.5, [_P]: 0.6, [_W]: 0.6 }],
        [/^Голубой горноцвет$/, { [_K]: 2.5, [_B]: 1.5 }],
        [/^Желтый горноцвет$/, { [_V]: 0.15 }],
        [/^Мора тапинелла$/, { [_V]: 1.5, [_R]: 2, [_F]: 2.5, [_H]: 1.5, [_K]: 1.5, [_E]: 2, [_P]: 0.8, [_W]: 0.3, [_B]: 0.3, [_S]: 0.5 }],
        [/^Ветка чертополоха$/, { [_V]: 1.5, [_R]: 2, [_F]: 3, [_H]: 1.5, [_E]: 2, [_K]: 0.7, [_P]: 0.7, [_W]: 0.3, [_B]: 0.3 }],
        [/^Паслён$/, { [_F]: 3, [_K]: 1.5, [_H]: 1.5, [_E]: 0.7 }, 0.5],
        [/^Снежные ягоды$/, { [_W]: 3, [_B]: 3, [_E]: 2, [_S]: 2, [_F]: 1.5, [_H]: 1.5, [_K]: 1.5 }],
        [/^Морской жёлудь$/, { [_H]: 3, [_B]: 2.5, [_E]: 1.5, [_S]: 1 }, 0.4],
        [/^Собачий корень$/, { [_H]: 2, [_K]: 2.5 }, 0.6],
        [/^(Ядовитый колокольчик|Болотный стручок|Гигантский лишайник)$/, { [_K]: 4 }, 0.25],
        [/^(Хвост злокрыса|Клешня грязевого краба)$/, { [_K]: 3, [_S]: 1.5 }, 0.7],
        [/^(Яйцо коруса|Усик коруса-охотника)$/, { [_K]: 3 }, 0.5],
        [/^(Язык дракона|Виноград джазби|Ползучая лоза)$/, { [_E]: 4 }, 0.3],
        [/^(Ягоды можжевельника|Бородатый мох)$/, { [_P]: 4 }, 0.4],
        [/^(Пепельная ползучая лоза|Императорский зонтичный мох|Стручок пепельной травы|Пепел порождения|Корень трамы|Желе пепельного прыгуна|Желе нетча|Перья фельсадской крачки|Кабаний клык|Древесина горелого сприггана)$/, { [_S]: 5 }, 0.15],
        [/^(Корень Нирна|Алый корень Нирна)$/, { [_K]: 2.5, [_E]: 1.2 }, 0.8],
        [/^(Морозная мириам|Морозная соль|Зубы ледяного привидения|Жир тролля|Глаз саблезуба|Клык саблезуба|Медвежьи когти)$/, { [_W]: 2.5, [_B]: 2.5, [_E]: 1.5, [_K]: 1.5, [_H]: 1.3, [_P]: 0.7 }, 0.8],
        [/^(Палец великана|Толчёный бивень мамонта)$/, { [_V]: 2, [_F]: 1.5, [_H]: 1.5, [_B]: 1.5, [_E]: 1.5, [_P]: 1.5, [_R]: 0.1, [_W]: 0.7 }],
        [/^Большие рога$/, { [_F]: 2.5, [_W]: 2, [_R]: 1.5, [_P]: 0.1 }],
        [/^Маленькие рога$/, { [_F]: 2, [_W]: 2, [_R]: 1.5, [_P]: 0.6 }],
        [/^(Крыло монарха|Крыло синей бабочки|Крыло лунного мотылька|Торакс светлячка)$/, { [_V]: 2, [_R]: 2.5, [_W]: 0.5, [_B]: 0.5 }],
        [/^(Синяя стрекоза|Оранжевая стрекоза)$/, { [_R]: 2.5, [_K]: 1.5, [_H]: 1.5, [_W]: 0.4, [_B]: 0.4 }],
        [/^(Абесинский окунь|Серебристый окунь|Бойцовая рыбка|Сиродильский лопатохвост|Хисткарп|Лососевая икра)$/, { [_F]: 2.5, [_V]: 1.5, [_R]: 2, [_K]: 1.5, [_W]: 0.5, [_B]: 0.5 }, 0.7],
        [/^(Пчела|Пчелиное гнездо|Медовые соты)$/, { [_R]: 2.5, [_V]: 2, [_F]: 1.5, [_W]: 0.4 }, 0.8],
        [/^(Пшеница|Чеснок|Куриное яйцо)$/, { [_V]: 2, [_E]: 1.5, [_R]: 1.5, [_H]: 1.5, [_W]: 0.5, [_B]: 0.7, [_P]: 0.7 }],
        [/^Сердце даэдра$/, {}, 4],   // редкость как у эбонитового и сталгримового снаряжения (около 3% витрин)
        [/^(Яйцо соснового дрозда|Яйцо ястреба|Перья ястреба|Клюв ястреба)$/, { [_V]: 1.5, [_F]: 1.5, [_P]: 1.3 }],
        [/^Паучье яйцо$/, { [_K]: 1.5, [_B]: 1.5, [_W]: 1.5 }]
    ];
    const MERCH_FOOD_AFFINITY = [
        [/^Оленина$/, { [_F]: 3, [_W]: 2, [_R]: 2, [_S]: 1.5, [_P]: 0.1 }],
        [/^Козий окорок$/, { [_W]: 2, [_P]: 2.5, [_V]: 1.5, [_E]: 1.5 }],
        [/кроличья ножка/, { [_W]: 2, [_R]: 1.5, [_S]: 1.5, [_V]: 1.3 }],
        [/^Мясо хоркера$/, { [_W]: 3, [_S]: 3, [_B]: 2, [_H]: 1.5 }, 0.5],
        [/^Хобот мамонта$/, { [_V]: 2, [_F]: 2, [_H]: 2, [_P]: 1.5, [_B]: 1.3, [_R]: 0.1 }],
        [/^Конина$/, { [_V]: 2, [_H]: 1.5, [_F]: 1.2 }],
        [/^Сырая говядина$/, { [_V]: 2, [_R]: 1.5, [_E]: 1.5, [_H]: 1.5, [_W]: 0.6 }],
        [/^Куриная грудка$/, { [_V]: 1.5, [_E]: 1.5, [_R]: 1.5 }],
        [/^Фазанья грудка$/, { [_R]: 2.5, [_V]: 1.2 }],
        [/^Мясо кабана$/, { [_S]: 3 }, 0.8],
        [/^Мясо устрицы$/, { [_H]: 3, [_B]: 2, [_W]: 1.5, [_S]: 1.5 }, 0.4],
        [/пепельн/, { [_S]: 6 }, 0.1],
        [/^Полярный/, { [_W]: 3, [_B]: 3, [_E]: 1.5, [_K]: 1.5 }, 0.5],
        [/^(Карп|Сом|Страж-рыба|Мелководный окунь|Лосось|Лососина|Стеклянный окунь|Стеклянный сомик|Люторыба|Лирохвостый окунь|Золотая рыбка)$/, { [_F]: 2.5, [_V]: 1.5, [_R]: 2, [_K]: 1.5, [_H]: 1.2, [_W]: 0.6, [_B]: 0.6, [_P]: 0.5 }, 0.7],
        [/^(Треска|Скорпена)$/, { [_H]: 2, [_B]: 2, [_W]: 2, [_S]: 1.5 }, 0.6],
        [/^(Капуста|Морковь|Тыква|Картофель|Лук-порей|Помидор|Капустный суп|Печёный картофель|Жареный лук-порей)$/, { [_V]: 2, [_E]: 2, [_R]: 2, [_H]: 2, [_F]: 1.3, [_B]: 0.7, [_W]: 0.5, [_P]: 0.5, [_S]: 0.7 }],
        [/яблок|Яблочный пирог/, { [_R]: 2, [_H]: 2, [_F]: 1.5, [_V]: 1.2, [_W]: 0.5, [_B]: 0.6 }],
        [/^Мёд Хоннинга$/, { [_V]: 4 }],
        [/^Черновересковый мёд/, { [_R]: 4 }],
        [/^Нордский мёд$/, { [_E]: 2, [_V]: 1.5, [_B]: 1.5, [_W]: 1.5 }],
        [/^Мед с можжевеловыми ягодами$/, { [_P]: 4 }],
        [/^Аргонианский эль$/, { [_K]: 3 }],
        [/^(Суджамма|Флин|Шейн|Мацт)$/, { [_E]: 3, [_S]: 2 }],
        [/^Зольный мед/, { [_S]: 4 }, 0.3],
        [/^Угольное вино$/, { [_S]: 2, [_E]: 1.5 }],
        [/^(Вино «Алто»|Коловианский бренди|Пряное вино)$/, { [_H]: 3, [_V]: 1.3 }],
        [/^Строс М'Кайский ром$/, { [_H]: 1.5, [_E]: 1.5 }]
    ];
    // Уникальная броня владений (поле location у предмета) → в лавке какого владения продаётся
    const MERCH_REGIONAL_ARMOR = { 'Фолкрит': 'Фолкрит', 'Хьялмарк': 'Хьялмарк', 'Белый Берег': 'Белый берег и Винтерхолд', 'Винтерхолд': 'Белый берег и Винтерхолд' };
    function merchantCatalogue() {
        const WR = window.weaponRecipes || [], WN = window.weaponsNonCraftable || [], AR = window.armorRecipes || [], AN = window.armorNonCraftable || [];
        const C = { w1: [], w2: [], gaunt: [], bow: [], xbow: [], arrow: [], bolt: [], fxAmmo: [], light: [], heavy: [], shield: [], specialMelee: [], specialRanged: [], specialArmor: [] };
        const seen = new Set();
        const ammoCat = n => /болт/i.test(n) ? 'bolt' : 'arrow';
        const put = (kind, e, dom) => {
            if (!(typeof e.price === 'number' && e.price > 0) || seen.has(e.name)) return;
            seen.add(e.name);
            if (MERCH_NEVER_RE.test(e.name)) return;
            if (MERCH_SPECIAL_RE.test(e.name)) { (C['special' + dom] || C.specialMelee).push(e); return; }
            if (C[kind]) C[kind].push(e);
        };
        const weapon = w => {
            const sub = w.subcat || '', cat = w.category || '';
            if (/Кастет/.test(sub) || cat === 'Кастеты') return put('gaunt', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
            if (cat === 'Луки') return put('bow', { name: w.name, category: 'Луки', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Ranged');
            if (cat === 'Арбалеты') return put('xbow', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Ranged');
            if (cat === 'Стрелы' || cat === 'Болты') {
                const e = { name: w.name, category: 'Боеприпасы', price: w.price, weight: w.weight, dmg: w.damage };
                if (w.price >= 50) return put('fxAmmo', e, 'Ranged');
                if (cat === 'Стрелы') return MERCHANT_ARROW_NAMES.includes(w.name) ? put('arrow', e, 'Ranged') : (MERCH_SPECIAL_RE.test(w.name) ? put('arrow', e, 'Ranged') : undefined);
                return /сталгрим|серебр/i.test(w.name) ? undefined : put('bolt', e, 'Ranged');
            }
            if (cat === 'Двуручное') return put('w2', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
            if (cat === 'Одноручное') return put('w1', { name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot }, 'Melee');
        };
        WR.forEach(weapon); WN.forEach(weapon);
        const armor = (a, slot) => {
            const kind = slot === 'shield' ? 'shield' : (/Тяжел/i.test(a.armorType) ? 'heavy' : 'light');
            put(kind, { name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot }, 'Armor');
        };
        AR.forEach(a => armor(a, GM_SMITHING_SLOT_MAP[a.slot] || null));
        AN.forEach(a => armor(a, normalizeArmorSlot(a.slot)));
        return C;
    }

    window.__buildMerchantItems = (t, h) => buildMerchantItems(t, h); // для тестов
    // Животные на прилавке: снимок шаблона (pet) едет с товаром, покупка у игрока создаёт животное, а не вещь в рюкзаке.
    function buildPetMerchantItems(typeKey, hold) {
        const def = (window.PET_MERCHANTS || {})[typeKey] || {}, q = def.qty || [1, 2];
        const custom = (lastData && Array.isArray(lastData.customPets) && lastData.customPets.length) ? lastData.customPets : _gmPets;
        return (window.petsForMerchant ? window.petsForMerchant(typeKey, hold, custom) : []).map(t => {
            const hp = Math.max(1, parseInt(t.hp) || 1);
            return { name: t.name, category: 'Животные', price: Math.max(0, parseInt(t.price) || 0), weight: 0, qty: randInt(q[0], q[1]),
                effect: `${t.icon || '🐾'} ХП ${hp}${t.rideable ? ` · верховое: +${(window.PET_RIDING || {}).speed || 15} скорости, +${(window.PET_RIDING || {}).carry || 100} к весу` : ''}`,
                pet: { id: t.id || '', icon: t.icon || '🐾', name: t.name, kind: t.kind || t.name, hp, loot: Array.isArray(t.loot) ? t.loot : [], rideable: !!t.rideable } };
        });
    }
    function buildMerchantItems(typeKey, hold) {
        if (LIVING_MERCHANT_TYPES[typeKey] && LIVING_MERCHANT_TYPES[typeKey].pets) return buildPetMerchantItems(typeKey, hold);
        const C = merchantCatalogue(), out = [], used = new Set();
        const ALL = ((window.allItems && window.allItems.length ? window.allItems : gmAllItems) || []).filter(i => !gmIsSustainScroll(i));
        const STACK = ['Готовые продукты', 'Сырые продукты', 'Напитки', 'Ингредиенты для алхимии', 'Боеприпасы', 'Драгоценные камни', 'Камни душ'];
        const affList = (typeKey === 'blacksmith2' || typeKey === 'fletcher') ? (MERCH_AFFINITY[hold] || []) : [];
        const floraRules = typeKey === 'alchemist2' ? MERCH_ING_AFFINITY : (['foodVendor', 'grocer', 'innkeeper'].indexOf(typeKey) !== -1 ? MERCH_FOOD_AFFINITY : []);
        const affMult = name => {
            let m = affList.reduce((m, [re, k]) => re.test(name) ? m * k : m, 1);
            floraRules.forEach(([re, map, d]) => { if (re.test(name)) m *= (map[hold] != null ? map[hold] : (d != null ? d : 1)); });
            return m;
        };
        const regionBlocked = name => MERCH_REGION_ONLY.some(([re, hs]) => re.test(name) && hs.indexOf(hold) === -1);
        const itemsOf = (cats, f) => ALL.filter(i => cats.includes(i.category) && typeof i.price === 'number' && i.price > 0 && !isMerchantExcluded(i) && (!f || f(i)));
        const push = (i, qty) => {
            const q = qty ? randInt(qty[0], qty[1]) : (i.category === 'Боеприпасы' ? randInt(10, 30) : (STACK.includes(i.category) ? randInt(2, 6) : 1));
            // Firestore отвергает undefined — добавляем поле, только если оно есть
            const o = { name: i.name, category: i.category, price: i.price, weight: i.weight || 0, effect: i.effect || '', qty: q };
            if (typeof i.dmg === 'number') o.dmg = i.dmg; else if (typeof i.damage === 'number') o.dmg = i.damage;
            if (typeof i.armor === 'number') o.armor = i.armor;
            if (i.slot) o.slot = i.slot;
            if (i.weaponType) o.weaponType = i.weaponType;
            if (typeof i.capacity === 'number') o.capacity = i.capacity;
            out.push(o); used.add(i.name);
        };
        // раздел: от lo до hi РАЗНЫХ позиций; дешёвое попадается чаще дорогого (вес ~ 1/(1+цена/медиана)^0.8)
        const take = (list, lo, hi, o) => {
            o = o || {};
            const c = (list || []).filter(i => i && typeof i.price === 'number' && i.price > 0 && !used.has(i.name) && !regionBlocked(i.name));
            const n = Math.min(c.length, randInt(lo, hi));
            if (n <= 0) return;
            const pr = c.map(i => i.price).sort((x, y) => x - y), ref = Math.max(5, pr[Math.floor(pr.length / 2)]);
            c.map(i => { const w = (1 / Math.pow(1 + i.price / ref, 0.8)) * affMult(i.name); return { i, k: Math.pow(Math.random(), 1 / w) }; })
                .sort((x, y) => y.k - x.k).slice(0, n).forEach(x => push(x.i, o.qty));
        };
        // обязательный товар (всегда на прилавке)
        const always = (name, lo, hi) => {
            const it = ALL.find(i => i.name === name) || [].concat(C.arrow, C.bolt, C.bow, C.w1, C.w2).find(i => i.name === name);
            if (it && !used.has(name)) push(it, [lo, hi]);
        };
        const POT = i => !/^(Пергамент|Чернила)$/.test(i.name);
        switch (typeKey) {
            case 'blacksmith2':
                take(C.w1, 3, 5); take(C.w2, 1, 3);
                take(C.heavy, 3, 5); take(C.light, 2, 4); take(C.shield, 1, 2);
                take(itemsOf(['Кузнечные ингредиенты'], i => /руда/i.test(i.name) && i.name !== 'Серебряная руда'), 1, 3, { qty: [2, 6] });
                always('Кожа', 3, 8); always('Полоски кожи', 4, 12);
                // ножны под ближнее оружие и держатель щита — всегда, утяжелённые — частью
                ['Ножны для кинжала', 'Ножны для меча', 'Ножны для боевого топора', 'Ножны для булавы', 'Ножны для двуручного меча', 'Ножны для секиры', 'Ножны для боевого молота', 'Ножны для копья', 'Ножны для пики', 'Ножны для посоха', 'Держатель для щита'].forEach(n => always(n, 1, 3));
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor && !/лука|арбалета/.test(i.name)), 2, 4);
                take(C.arrow, 1, 2); take(C.gaunt, 0, 1);
                take(C.specialMelee.concat(C.specialArmor), 0, 2);
                if (MERCH_REGIONAL_ARMOR[hold]) take(itemsOf(['Уникальная броня'], i => i.location === MERCH_REGIONAL_ARMOR[hold]), 1, 3);
                take(itemsOf(['Одноручное (лут)', 'Двуручное (лут)', 'Тяжелая броня (лут)', 'Легкая броня (лут)']), 0, 2);
                break;
            case 'fletcher':
                always('Железная стрела', 15, 30);
                ['Колчан для стрел', 'Колчан для болтов', 'Ножны для лука', 'Ножны для арбалета'].forEach(n => always(n, 1, 3));
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor && /лука|арбалета/.test(i.name)), 0, 2);
                take(C.bow, 5, 7); take(C.xbow, 0, 2);
                take(C.arrow, 5, 7); take(C.bolt, 2, 4);
                take(C.fxAmmo, 0, 2, { qty: [2, 6] });
                take(C.specialRanged, 0, 1);
                take(itemsOf(['Луки (лут)']), 0, 1);
                break;
            case 'alchemist2':
                always('Лечебная припарка', 3, 8);
                take(itemsOf(['Ингредиенты для алхимии']), 14, 20);
                break;
            case 'pawnbrokerLive':
                always('Пергамент', 3, 8); always('Чернила', 2, 6); always('Соль', 2, 6);
                take(itemsOf(['Бытовые предметы'], POT), 5, 8);
                take(itemsOf(['Ножны и колчаны'], i => !i.sheathArmor), 3, 5, { qty: [1, 2] });
                take(itemsOf(['Ножны и колчаны'], i => i.sheathArmor), 1, 2);
                take(itemsOf(['Походное снаряжение']), 2, 4);
                take(itemsOf(['Сырые продукты']), 2, 4);
                take(itemsOf(['Ювелирные изделия']), 1, 2);
                take(itemsOf(['Драгоценные камни']), 0, 2);
                take(itemsOf(['Шкуры']), 1, 2);
                break;
            case 'courtWizard':
                always('Пергамент', 3, 8); always('Чернила', 2, 6);
                take(itemsOf(['Свитки (прописанные)']), 4, 7);
                take(window.spellTomesData || [], 4, 7);
                take(itemsOf(['Посохи']), 2, 4);
                take(itemsOf(['Магические одеяния']), 2, 4);
                take(itemsOf(['Камни душ'], i => !/^Заполненный/.test(i.name)), 2, 4, { qty: [1, 4] });
                take(itemsOf(['Камни душ'], i => /^Заполненный/.test(i.name)), 0, 1, { qty: [1, 2] });
                break;
            case 'jeweler':
                take(itemsOf(['Ювелирные изделия', 'Ювелирное изделие (лут)']), 6, 10);
                take(itemsOf(['Драгоценные камни']), 3, 6);
                take(itemsOf(['Кузнечные ингредиенты'], i => /^(Золотая|Серебряная) руда$/.test(i.name)), 0, 2, { qty: [2, 5] });
                break;
            case 'innkeeper':
                take(itemsOf(['Готовые продукты']), 5, 9); take(itemsOf(['Напитки']), 4, 7); take(itemsOf(['Сырые продукты']), 2, 4);
                break;
            case 'grocer':
                always('Соль', 3, 8);
                take(itemsOf(['Сырые продукты']), 8, 12); take(itemsOf(['Готовые продукты']), 1, 3); take(itemsOf(['Напитки']), 1, 2);
                take(itemsOf(['Шкуры']), 1, 3); take(itemsOf(['Бытовые предметы'], POT), 2, 4);
                break;
            case 'foodVendor':
                always('Соль', 2, 6);
                take(itemsOf(['Сырые продукты']), 6, 9); take(itemsOf(['Готовые продукты']), 3, 6); take(itemsOf(['Напитки']), 1, 3);
                break;
            case 'khajiitCaravan':
                // скума и лунный сахар — эксклюзив каравана (у остальных исключены), здесь лежат всегда
                [['Красноводная скума', 2, 5], ['Лунный сахар', 2, 5]].forEach(([nm, lo, hi]) => { const it = ALL.find(i => i.name === nm); if (it) push(it, [lo, hi]); });
                take(itemsOf(['Сырые продукты']), 3, 5); take(itemsOf(['Бытовые предметы'], POT), 3, 5);
                take(itemsOf(['Ювелирные изделия']), 2, 4); take(itemsOf(['Шкуры']), 1, 3);
                take(itemsOf(['Ингредиенты для алхимии']), 4, 7);
                break;
            default:
                take(getMerchantItemPool(typeKey), 15, 26);
        }
        // Слитки: у кузнеца и барахольщика гарантированно 2-5 (по прямой просьбе), у ювелира — серебряный и золотой.
        // Золотой слиток по вики купить нельзя вообще, серебряный почти не продаётся — их у них нет; серебряную руду продают.
        if (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive') {
            const NOT_FOR_SALE = ['Золотой слиток', 'Серебряный слиток'];
            const ingots = ALL.filter(i => i.category === 'Кузнечные ингредиенты' && (/слиток/i.test(i.name) || i.name === 'Серебряная руда') && NOT_FOR_SALE.indexOf(i.name) === -1 && !used.has(i.name)).sort(() => Math.random() - 0.5);
            const cnt = Math.min(ingots.length, randInt(2, 5));
            for (let k = 0; k < cnt; k++) push(ingots[k], [2, 6]);
        }
        if (typeKey === 'jeweler') {
            ['Серебряный слиток', 'Золотой слиток'].forEach(nm => { const it = ALL.find(i => i.name === nm); if (it && !used.has(nm)) push(it, [2, 5]); });
        }
        // Солстейм: хитиновую пластину и шкуру нетча продают кузнецы и торговцы общими товарами только там
        if (hold === 'Схолстейм' && (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive')) {
            [['Хитиновая пластина', 3, 8], ['Шкура нетча', 2, 5]].forEach(([nm, lo, hi]) => { const it = ALL.find(i => i.name === nm); if (it && !used.has(nm)) push(it, [lo, hi]); });
        }
        return out;
    }


    window.refreshMerchantStock = function () {
        const typeKey = el('merchant-type-select').value;
        const hold = el('merchant-hold-select').value;
        if (!hold) { alert('Выбери владение.'); return; }
        const def = LIVING_MERCHANT_TYPES[typeKey];
        const finalItems = buildMerchantItems(typeKey, hold);
        if (!finalItems.length) {
            if (def.pets) {
                const places = window.petMerchantPlaces ? window.petMerchantPlaces(typeKey) : [];
                alert(places.length ? `«${def.label}» в «${hold}» нет. Есть в: ${places.join(', ')}.` : 'Своих животных с продавцом в этом владении нет — добавь их в «🐾 Животные и питомцы» и укажи, где продаются.');
            } else alert('Нет предметов в базе для этого типа торговца.');
            return;
        }
        const key = typeKey + '@' + hold;
        const ref = db.collection('sessions').doc(currentCode);
        let goldNow = def.gold;
        // Транзакцией по свежим данным: другие лавки и вклады игроков, сделанные только что, не затираются.
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const stocks = Object.assign({}, ((doc.exists && doc.data()) || {}).merchantStocks || {});
            const old = stocks[key] || {};
            // disposition (-2..+2, отношение конкретного торговца к группе) — СОХРАНЯЕМ существующее
            // значение при обновлении ассортимента (это про товар, не про отношение), 0 только для
            // нового торговца. Меняется отдельно, кнопками ниже (setMerchantDisposition), без
            // необходимости перегенерировать весь ассортимент заново.
            // Вклады по перку «Вкладчик» — «навсегда»: вложившие и их +500 к запасу золота переживают обновление
            // ассортимента (и «Скупщик» у этого торговца продолжает работать).
            const investors = Array.isArray(old.investors) ? old.investors.slice() : [];
            goldNow = def.gold + 500 * investors.length;
            stocks[key] = { gold: goldNow, items: stripUndefinedDeep(finalItems), updatedAt: Date.now(), generatedOnDay: lastData.gameDayCounter || 0, label: def.label, hold: hold, disposition: old.disposition || 0 };
            if (investors.length) stocks[key].investors = investors;
            if (def.pets) stocks[key].pets = true; // игрок не продаёт таким торговцам свои вещи
            tx.update(ref, { merchantStocks: stocks });
        })).then(() => {
            el('merchant-gen-result').innerHTML = `<span style="color:#2ecc71;">✅ ${def.label} в «${hold}»: ${finalItems.length} позиций, золото ${formatNumber(goldNow)}.</span>`;
            renderMerchantStaleness();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Задача C: "раз в неделю" не бывает автоматически без общего счётчика игровых дней (у
    // календаря на листе игрока нет привязки к сессии) — вместо тихого автосброса посреди игры
    // мастер явно видит, у кого ассортимент устарел (7+ игровых дней), и жмёт обновить сам.
    function renderMerchantStaleness() {
        const box = el('merchant-staleness-list');
        if (!box) return;
        const stocks = lastData.merchantStocks || {};
        const keys = Object.keys(stocks);
        const currentDay = lastData.gameDayCounter || 0;
        if (!keys.length) { box.innerHTML = '<p style="opacity:.6; font-size:13px;">Торговцев ещё нет.</p>'; return; }
        const DISPOSITION_LABELS = { '-2': 'Вражда (торговля закрыта)', '-1': 'Неприязнь (+25%)', '0': 'Нейтрально', '1': 'Друг (−10%)', '2': 'Союзник (−20%)' };
        box.innerHTML = keys.map(k => {
            const s = stocks[k];
            const daysAgo = currentDay - (s.generatedOnDay || 0);
            const stale = daysAgo >= 7;
            const disp = s.disposition || 0;
            return `<div style="font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; ${stale ? 'color:#e67e22;' : ''}">
                <span>${stale ? '⚠️ ' : ''}${escapeHtml(s.label)} — ${escapeHtml(s.hold)}: ${daysAgo} игр. дн. назад${stale ? ' (пора обновить)' : ''}</span>
                <select style="width:auto; font-size:11px; padding:1px;" onchange="setMerchantDisposition('${jsq(k)}', this.value)">
                    ${Object.keys(DISPOSITION_LABELS).map(v => `<option value="${v}" ${String(disp) === v ? 'selected' : ''}>${DISPOSITION_LABELS[v]}</option>`).join('')}
                </select>
                <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:11px; flex-shrink:0;" onclick="removeMerchant('${jsq(k)}')">Убрать</button>
            </div>`;
        }).join('');
    }

    // disposition конкретного торговца (-2 Вражда .. +2 Союзник) — отношение влияет на цены, по которым
    // торговец ПРОДАЁТ свои вещи игроку (buyFromMerchant, index.html; цену скупки не меняет) и может полностью заблокировать
    // торговлю при -2. Меняется отдельно от ассортимента, без нужды его перегенерировать.
    window.setMerchantDisposition = function (key, value) {
        db.collection('sessions').doc(currentCode).update({ ['merchantStocks.' + key + '.disposition']: parseInt(value) || 0 })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    // Убрать торговца совсем (не просто обновить ассортимент) — раньше такой возможности не
    // было вообще, только сброс товара у уже существующего.
    window.removeMerchant = function (key) {
        if (!confirm('Убрать этого торговца из сессии? Игроки перестанут видеть его в списке для покупки.')) return;
        db.collection('sessions').doc(currentCode).update({ ['merchantStocks.' + key]: firebase.firestore.FieldValue.delete() })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    function renderMerchantHoldSelect() {
        const sel = el('merchant-hold-select');
        if (!sel || sel.options.length) return; // уже заполнен один раз
        sel.innerHTML = '<option value="">— выбери владение —</option>' + REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
    }

    function renderMerchantTypeSelect() {
        const sel = el('merchant-type-select');
        if (!sel || sel.options.length) return;
        const opt = ([k, v]) => {
            const places = v.pets && window.petMerchantPlaces ? window.petMerchantPlaces(k) : [];
            return `<option value="${k}">${escapeHtml(v.label)} (${v.pets ? (places.length ? escapeHtml(places.join(', ')) : 'свои животные мастера') : 'база ' + formatNumber(v.gold) + ' золота'})</option>`;
        };
        const all = Object.entries(LIVING_MERCHANT_TYPES);
        sel.innerHTML = all.filter(([, v]) => !v.pets).map(opt).join('') + '<optgroup label="🐾 Животные">' + all.filter(([, v]) => v.pets).map(opt).join('') + '</optgroup>';
    }

    let currentSupernaturalState = defaultSupernaturalState();

    function renderGuildsPanel() {
        const listEl = el('guilds-list');
        if (!listEl) return;
        if (!currentInvPlayerUid) { listEl.innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>'; return; }
        listEl.innerHTML = GUILD_NAMES.map(g => {
            const gd = currentGuildsData[g] || { member: false, orders: 0 };
            const rank = getGuildRank(g, gd.orders);
            return `
            <div class="party-row" style="display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                    <label style="display:flex; align-items:center; gap:6px; margin:0;">
                        <input type="checkbox" ${gd.member ? 'checked' : ''} onchange="toggleGuildMembership('${jsq(g)}', this.checked)">
                        <strong>${escapeHtml(g)}</strong>
                    </label>
                    ${gd.member ? `<span style="font-size:12px; opacity:.8;">${escapeHtml(rank.rankName)}${rank.next ? ' → ещё ' + (rank.next.at - gd.orders) + ' до «' + escapeHtml(rank.next.name) + '»' : ' (максимум)'}</span>` : ''}
                </div>
                ${gd.member ? `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                    <span>Заказов: <strong>${gd.orders}</strong></span>
                    <span style="display:flex; gap:4px;">
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${jsq(g)}', 1)">+1</button>
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${jsq(g)}', 5)">+5</button>
                        <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resetGuildOrders('${jsq(g)}')">Сброс</button>
                    </span>
                </div>` : ''}
            </div>`;
        }).join('');
    }

    function renderGuildInfoSelect() {
        const sel = el('guild-info-select');
        if (!sel || sel.options.length) return;
        sel.innerHTML = GUILD_NAMES.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }

    // Задача "Бойцовский клуб — турниры": эта гильдия не подходит под общую систему {member,orders}
    // — награды привязаны к победе в конкретном турнире по УРОВНЮ ПЕРСОНАЖА, не к счётчику заказов
    // гильдии. Сами бои разыгрываются обычным боевым инструментом; тут только запись+награда.
    const TOURNAMENT_BRACKETS = {
        'Новички': { levelRange: '1-5', rewards: ['50 золота', 'Мешочек самоцветов (~100 золота)', 'Серебряное украшение'] },
        'Ученики': { levelRange: '5-10', rewards: ['150 золота', 'Мешочек самоцветов (~250 золота)', 'Золотое украшение', 'Зачарованное стальное оружие'] },
        'Адепты': { levelRange: '10-15', rewards: ['300 золота', 'Крупный самоцвет (~400 золота)', 'Зачарованное эльфийское/двемерское оружие', 'Зачарованная броня (соответствующего материала)'] },
        'Эксперты': { levelRange: '15-20', rewards: ['600 золота', 'Зачарованное стеклянное/эбонитовое оружие', 'Зачарованная броня высокого уровня', '🏆 «Выбитые зубы» (эбонитовые перчатки, уникальное зачарование) — только чемпиону группы'] }
    };

    window.renderTournBracketInfo = function () {
        const box = el('tourn-bracket-info');
        if (!box) return;
        const b = TOURNAMENT_BRACKETS[el('tourn-bracket-select').value];
        box.innerHTML = b ? `Уровень персонажа: ${b.levelRange}. Награды: ${b.rewards.join(', ')}` : '';
    };

    window.tournChargeEntryFee = function () {
        const uid = currentInvPlayerUid;
        if (!uid) { alert('Выбери игрока.'); return; }
        gmAddGold(uid, -200, { requireEnough: true }).then(r => {
            el('tourn-result').innerHTML = `<span style="color:#2ecc71;">Залог 200 золота списан (было ${r.before}, стало ${r.after}).</span>`;
        }).catch(e => { el('tourn-result').innerHTML = `<span style="color:#e74c3c;">Залог не списан: ${escapeHtml(e.message)}.</span>`; });
    };

    window.tournGrantReward = function () {
        const uid = currentInvPlayerUid;
        const bracket = el('tourn-bracket-select').value;
        if (!uid) { alert('Выбери игрока.'); return; }
        const rewards = TOURNAMENT_BRACKETS[bracket].rewards;
        const choice = prompt('Какую награду выдать?\n' + rewards.map((r, i) => `${i + 1}. ${r}`).join('\n'), '1');
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || !rewards[idx]) return;
        const rewardText = rewards[idx];
        // Золотые награды просто прибавляем к золоту; предметные — кладём в инвентарь текстом,
        // как и остальные гильдийские награды (без обязательной регистрации в общем каталоге).
        const goldMatch = rewardText.match(/^(\d+)\s*золота/);
        (goldMatch
            ? gmAddGold(uid, parseInt(goldMatch[1]))
            : gmTxInventory(uid, inv => { inv.push({ itemId: rewardText + '_tourn_' + Date.now(), name: rewardText, count: 1, weight: 1, category: 'Награда турнира', effect: `Приз группы «${bracket}» Бойцовского клуба` }); })
        ).then(() => {
            el('tourn-result').innerHTML = `<span style="color:#2ecc71;">Выдано: ${escapeHtml(rewardText)}.</span>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.renderGuildInfoPanel = function () {
        const box = el('guild-info-body');
        const sel = el('guild-info-select');
        if (!box || !sel) return;
        const g = sel.value;
        const info = GUILD_DATA[g];
        if (!info) { box.innerHTML = ''; return; }
        let html = '<h4 style="margin:6px 0 2px;">Квестодатели</h4>';
        html += info.givers.map(giver => `<div style="font-size:12px; margin-top:2px;">👤 <strong>${escapeHtml(giver.name)}</strong> — ${escapeHtml(giver.note)}</div>`).join('');
        html += '<h4 style="margin:8px 0 2px;">Плюшки гильдии</h4>';
        html += `<div style="font-size:12px;">${escapeHtml(info.perks)}</div>`;
        if (info.armorRewards.length) {
            html += '<h4 style="margin:8px 0 2px;">Награды бронёй по порогам</h4>';
            html += info.armorRewards.map(r => `<div style="font-size:12px; margin-top:2px;">🏅 <strong>${r.at} заказов:</strong> ${r.items.map(escapeHtml).join(', ')}${r.note ? ' — ' + escapeHtml(r.note) : ''}</div>`).join('');
        }
        if (info.note) html += `<div style="font-size:11px; opacity:.65; margin-top:8px;">ℹ️ ${escapeHtml(info.note)}</div>`;
        box.innerHTML = html;
    };

    function renderAllEnchantsReference() {
        const box = el('all-enchants-body');
        if (!box) return;
        if (!window.enchantWeaponEffects || !window.enchantArmorEffects) {
            box.innerHTML = '<p style="opacity:.6; font-size:13px;">enchant-data.js не подключён.</p>';
            return;
        }
        let html = '<h4 style="margin:4px 0 2px;">Оружие (все 6, срок 5 дней без подзарядки)</h4>';
        html += window.enchantWeaponEffects.map(e => `<div style="font-size:12px; margin-top:2px;">⚔️ <strong>${escapeHtml(e.name)}</strong> — до ${e.maxValue}${escapeHtml(e.unit)}. ${escapeHtml(e.description)}</div>`).join('');
        html += '<h4 style="margin:10px 0 2px;">Броня/украшения (все 28, постоянно)</h4>';
        html += window.enchantArmorEffects.map(e => `<div style="font-size:12px; margin-top:2px;">🛡️ <strong>${escapeHtml(e.name)}</strong> — до ${e.maxValue}${escapeHtml(e.unit)} · слоты: ${e.slots.join(', ')}. ${escapeHtml(e.description)}</div>`).join('');
        box.innerHTML = html;
    }

    window.toggleGuildMembership = function (guildName, isMember) {
        if (!currentInvPlayerUid) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { member: isMember });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    // Заявки на сдачу артефакта в музей Коллегии бардов: игрок сам награду начислить не может (раньше кнопка давала +800 золота бесконечно).
    function renderMuseumRequests() {
        const box = el('museum-requests'); if (!box) return;
        const list = Array.isArray(lastData.museumRequests) ? lastData.museumRequests : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:8px;"><strong>🎼 Заявки в музей коллегии бардов</strong>' + list.map(r =>
            `<div class="party-row" style="display:flex; gap:6px; align-items:center; justify-content:space-between;"><span>${escapeHtml(r.name || '?')}</span><span style="display:flex; gap:4px;">` +
            `<button style="width:auto; padding:2px 8px;" onclick="approveMuseumRequest('${jsq(r.id)}', true)">Принять (+800, +1 песня)</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="approveMuseumRequest('${jsq(r.id)}', false)">Отклонить</button></span></div>`).join('') + '</div>' : '';
    }
    window.approveMuseumRequest = function (reqId, ok) {
        const ref = db.collection('sessions').doc(currentCode);
        let req = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const list = Array.isArray((doc.data() || {}).museumRequests) ? doc.data().museumRequests.slice() : [];
            const i = list.findIndex(r => r.id === reqId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            req = list[i]; list.splice(i, 1);
            tx.update(ref, { museumRequests: list });
        })).then(() => {
            if (!ok) return;
            // update(), а не set(merge): set не разбирает точки в ключе — песня и артефакт не засчитывались.
            const refC = db.collection('characters').doc(req.uid), GN = 'Коллегия бардов';
            return db.runTransaction(tx => tx.get(refC).then(doc => {
                const gd = ((doc.exists ? doc.data() : {}).guildsData || {})[GN];
                const base = typeof gd === 'number' ? { member: gd > 0, orders: gd } : Object.assign({}, gd || {});
                base.orders = (parseInt(base.orders) || 0) + 1;
                base.artifacts = (parseInt(base.artifacts) || 0) + 1;
                const patch = {}; patch['guildsData.' + GN] = base;
                if (doc.exists) tx.update(refC, patch); else tx.set(refC, { guildsData: { [GN]: base } }, { merge: true });
            })).then(() => gmAddGold(req.uid, 800));
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Пойманные на карманной краже (index.html attemptTheft → CloudSync.reportTheftCaught): штраф предложен по правилу
    // «25 + ½ цены вещи, у стражи и знати ×2»; мастер выписывает его одной кнопкой (сумма и владение правятся) или отпускает.
    function renderTheftCases() {
        const box = el('theft-cases'); if (!box) return;
        const list = Array.isArray(lastData.theftCases) ? lastData.theftCases : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:10px; padding:6px; border:1px solid #e74c3c; border-radius:4px;"><strong>🚨 Пойманы на карманной краже</strong>' + list.map(c =>
            `<div class="party-row" style="display:block;"><div>${escapeHtml(c.name || '?')} — ${escapeHtml(c.victim || '?')}, ${escapeHtml(c.what || '')}</div>` +
            `<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-top:4px;"><input type="number" id="theft-fine-${escapeHtml(c.id)}" value="${parseInt(c.fine) || 0}" style="width:80px;">` +
            `<select id="theft-hold-${escapeHtml(c.id)}">${REPUTATION_HOLDS.map(h => `<option value="${escapeHtml(h)}"${h === c.hold ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('')}</select>` +
            `<button style="width:auto; padding:2px 8px;" onclick="resolveTheftCase('${jsq(c.id)}', true)">⚖️ Выписать штраф</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resolveTheftCase('${jsq(c.id)}', false)">Отпустить</button></div></div>`).join('') + '</div>' : '';
    }
    window.resolveTheftCase = function (caseId, fineIt) {
        const ref = db.collection('sessions').doc(currentCode);
        const amount = Math.max(0, parseInt((el('theft-fine-' + caseId) || {}).value) || 0);
        const holdSel = (el('theft-hold-' + caseId) || {}).value || '';
        let c = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const list = Array.isArray((doc.data() || {}).theftCases) ? doc.data().theftCases.slice() : [];
            const i = list.findIndex(r => r.id === caseId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            c = list[i]; list.splice(i, 1);
            tx.update(ref, { theftCases: list });
        })).then(() => {
            if (!fineIt) { gmPostLogEntryText(`🤝 ${c.name} пойман(а) на краже (${c.victim}), но отпущен(а) без штрафа.`); return; }
            if (amount <= 0) return;
            const cref = db.collection('characters').doc(c.uid);
            const reason = `карманная кража: ${c.victim}`;
            let next = null;
            return db.runTransaction(tx => tx.get(cref).then(doc => {
                const cs = Object.assign({ fineAmount: 0, fineHold: '', fineReason: '', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 }, (doc.data() || {}).crimeState || {});
                const prev = cs.fineAmount || 0;
                next = Object.assign({}, cs, { fineAmount: prev + amount, fineHold: prev > 0 && cs.fineHold ? cs.fineHold : holdSel,
                    fineReason: prev > 0 ? [cs.fineReason, reason].filter(Boolean).join('; ') : reason, refused: false });
                tx.update(cref, { crimeState: next });
            })).then(() => {
                if (currentInvPlayerUid === c.uid) { currentCrimeState = next; renderCrimePanel(); }
                gmPostLogEntryText(`⚖️ ${c.name}: штраф ${amount} септимов (${next.fineHold}) за карманную кражу${next.fineAmount > amount ? ` — всего к оплате ${next.fineAmount}` : ''}.`);
                try { window.rumAddDeed({ kind: 'crime', amount: amount, reason: reason, hold: next.fineHold || undefined, who: [c.name].filter(Boolean) }); } catch (e) { }
            });
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Лимиты, которые мастер задаёт игрокам (sessions.playerLimits). Пустое поле = поле не хранится = умолчание на стороне игрока.
    const LIMIT_KEYS = ['forageRolls', 'practice', 'nextDay', 'perform'];
    function renderPlayerLimits() {
        const lim = lastData.playerLimits || {};
        LIMIT_KEYS.forEach(k => {
            const inp = el('lim-' + k); if (!inp || document.activeElement === inp) return;
            inp.value = typeof lim[k] === 'number' ? lim[k] : '';
        });
        const bs = el('bard-song-gm');
        if (bs) bs.innerHTML = lastData.bardSong ? `🎵 Играет «Бардовская баллада»: <strong>${escapeHtml(lastData.bardSong.name || 'бард')}</strong> (союзникам +1 к кубам) <button style="width:auto; padding:2px 10px;" onclick="stopBardSongGm()">Остановить</button>` : '';
    }
    window.stopBardSongGm = function () {
        db.collection('sessions').doc(currentCode).update({ bardSong: firebase.firestore.FieldValue.delete() }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.savePlayerLimits = function () {
        const out = {};
        LIMIT_KEYS.forEach(k => { const v = el('lim-' + k).value; if (v !== '' && !isNaN(parseInt(v)) && parseInt(v) >= 0) out[k] = parseInt(v); });
        db.collection('sessions').doc(currentCode).update({ playerLimits: out })
            .then(() => { el('player-limits-result').innerHTML = '<span style="color:#2ecc71;">✅ Сохранено — игроки подхватят сразу.</span>'; })
            .catch(e => { el('player-limits-result').innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // Заявки игроков на выполнение квестов гильдий: начисление заказа и наград идёт только после решения мастера.
    function renderQuestClaims() {
        const box = el('quest-claims'); if (!box) return;
        const list = Array.isArray(lastData.questClaims) ? lastData.questClaims : [];
        box.innerHTML = list.length ? '<div style="margin-bottom:8px;"><strong>📜 Квесты гильдий — ждут подтверждения</strong>' + list.map(c =>
            `<div class="party-row" style="display:flex; gap:6px; align-items:center; justify-content:space-between;"><span>${escapeHtml(c.name || '?')}: «${escapeHtml(c.title || '?')}» <span style="opacity:.7;">(${escapeHtml(c.guild || '')})</span></span><span style="display:flex; gap:4px;">` +
            `<button style="width:auto; padding:2px 8px;" onclick="resolveQuestClaim('${jsq(c.id)}', true)">Подтвердить</button>` +
            `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resolveQuestClaim('${jsq(c.id)}', false)">Не выполнен</button></span></div>`).join('') + '</div>' : '';
    }
    window.resolveQuestClaim = function (claimId, ok) {
        const ref = db.collection('sessions').doc(currentCode);
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.data() || {};
            const claims = Array.isArray(d.questClaims) ? d.questClaims.slice() : [];
            const i = claims.findIndex(c => c.id === claimId);
            if (i < 0) throw new Error('Заявка уже обработана.');
            const c = claims[i]; claims.splice(i, 1);
            const decisions = Array.isArray(d.questDecisions) ? d.questDecisions.slice() : [];
            decisions.push({ uid: c.uid, questId: c.questId, ok: !!ok, ts: Date.now() });
            tx.update(ref, { questClaims: claims, questDecisions: decisions });
        })).catch(e => alert('Ошибка: ' + e.message));
    };

    window.adjustGuildOrders = function (guildName, delta) {
        if (!currentInvPlayerUid) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { orders: Math.max(0, gd.orders + delta) });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    window.resetGuildOrders = function (guildName) {
        if (!currentInvPlayerUid) return;
        if (!confirm(`Сбросить счётчик заказов «${guildName}» до 0?`)) return;
        const gd = currentGuildsData[guildName] || { member: false, orders: 0 };
        currentGuildsData[guildName] = Object.assign({}, gd, { orders: 0 });
        db.collection('characters').doc(currentInvPlayerUid).update({ guildsData: currentGuildsData })
            .then(renderGuildsPanel).catch(e => alert('Ошибка: ' + e.message));
    };

    function saveSupernaturalState() {
        if (!currentInvPlayerUid) return Promise.resolve();
        return db.collection('characters').doc(currentInvPlayerUid).update({ supernaturalState: currentSupernaturalState });
    }

    function renderSupernaturalPanel() {
        const wrap = el('supernatural-panel-body');
        if (!wrap) return;
        if (!currentInvPlayerUid) { wrap.innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>'; return; }
        const s = currentSupernaturalState;
        wrap.innerHTML = `
            <div class="checkbox-group"><input type="checkbox" id="sn-lycan" ${s.lycanthropy ? 'checked' : ''} onchange="toggleSupernaturalFlag('lycanthropy', this.checked)"><label for="sn-lycan">Ликантропия (оборотень)</label></div>
            <div id="sn-werewolf-block" style="display:${s.lycanthropy ? 'block' : 'none'}; padding:6px 0 6px 12px; border-left:2px solid var(--border-color); margin:4px 0;">
                <p style="font-size:12px; opacity:.75;">Базовая форма (всегда): ${escapeHtml(WEREWOLF_BASE_INFO)}</p>
                <label>Съедено сердец: <input type="number" id="sn-hearts" value="${s.werewolf.heartsEaten}" style="width:70px; display:inline;" onchange="setWerewolfHearts(this.value)"></label>
                <label style="margin-top:6px;">Активный тотем Хирсина</label>
                <select id="sn-totem" onchange="setWerewolfTotem(this.value)">
                    ${HIRCINE_TOTEMS.map(t => `<option value="${escapeHtml(t)}" ${s.werewolf.totem === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
                </select>
                <button class="btn-success" style="width:100%; margin-top:6px;" onclick="triggerTransform()">🐺 Обратить в зверя (лог в журнал)</button>
                <label style="margin-top:8px;">Способности (открываются автоматически по числу сердец)</label>
                ${WEREWOLF_ABILITIES.map(a => {
                    const unlocked = (s.werewolf.heartsEaten || 0) >= a.threshold;
                    return `<div style="font-size:12px; margin-top:3px; opacity:${unlocked ? 1 : 0.5};">${unlocked ? '🔓' : '🔒'} <strong>${escapeHtml(a.name)}</strong> (${a.threshold} сердец) — ${escapeHtml(a.desc)}</div>`;
                }).join('')}
            </div>

            <div class="checkbox-group" style="margin-top:8px;"><input type="checkbox" id="sn-vamp" ${s.vampirism ? 'checked' : ''} onchange="toggleSupernaturalFlag('vampirism', this.checked)"><label for="sn-vamp">Вампиризм</label></div>
            <div id="sn-vampire-block" style="display:${s.vampirism ? 'block' : 'none'}; padding:6px 0 6px 12px; border-left:2px solid var(--border-color); margin:4px 0;">
                <p style="font-size:12px; opacity:.75;">Базовое заражение (даётся автоматически): ${escapeHtml(VAMPIRE_BASE_INFO)}</p>
                <label>Стадия голода (0-4, = дней без крови)</label>
                <select id="sn-hunger" onchange="setVampireHunger(this.value)">
                    ${[0, 1, 2, 3, 4].map(n => `<option value="${n}" ${s.vampire.hungerStage === n ? 'selected' : ''}>${n}${n === 0 ? ' (сыт)' : ''}${n === 4 ? ' (стража нападает!)' : ''}</option>`).join('')}
                </select>
                <p style="font-size:12px; opacity:.85; margin:4px 0;">Голод: обычный вампир −2 ко всем хар-кам и холод +10% / огонь −10% за каждый день; вампир-лорд только −1 ко всем хар-кам за день. ${s.vampire.hungerStage >= 4 ? '<strong style="color:#e74c3c;">🚨 4-й день: стража нападает, жители бегут или нападают.</strong>' : ''}</p>
                <button class="btn-success" style="width:100%; margin-top:4px;" onclick="feedVampire()">🩸 Покормить (стадия → 0)</button>
                <p style="font-size:12px; opacity:.75; margin-top:6px;">Пока стоит галочка «Вампиризм»: +2 Хар, +1 Лов, +1 Сил, холод +50%, яды/болезни — иммунитет, огонь −50%, ×2 урон днём; бесплатные заклинания «Вампирское высасывание» и «Подъём сильного трупа». Рангов у обычных вампиров нет.</p>
                <div class="checkbox-group" style="margin-top:8px;"><input type="checkbox" id="sn-vamp-lord" ${s.vampire.isLord ? 'checked' : ''} onchange="toggleVampireLord(this.checked)"><label for="sn-vamp-lord"><strong>Вампир-лорд</strong> (открывает игроку ветку перков вампира-лорда и форму лорда)</label></div>
                ${s.vampire.isLord ? `<div style="font-size:12px; margin-top:4px;">Форма лорда: <strong>${s.vampire.lordForm ? 'включена' : 'выключена'}</strong> · Взято перков: ${Object.keys(s.vampire.lordPerks || {}).filter(k => s.vampire.lordPerks[k]).length}/11${Object.keys(s.vampire.lordPerks || {}).filter(k => s.vampire.lordPerks[k]).length ? '<br>' + Object.keys(s.vampire.lordPerks).filter(k => s.vampire.lordPerks[k]).map(escapeHtml).join(', ') : ''}</div>` : ''}
            </div>
            ${gmLichPanelHtml(s)}`;
    }

    // ---------- Ветка «Рыцарь смерти (лич)» ----------
    function gmLichPanelHtml(s) {
        const l = s.lich;
        const perks = window.LICH_PERKS || [];
        const have = l ? perks.filter(p => l.perks && l.perks[p.id]) : [];
        let h = `<div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-color);"><strong>☠ Ветка лича</strong>`;
        h += `<p style="font-size:12px; opacity:.75; margin:4px 0;">Перки выдаются после отыгранного ритуала: игрок отдаёт невинные души (чёрные камни), вы вычёркиваете их у себя и жмёте кнопку. Очко перков и уровень проверяются у игрока. Вампиризм и ликантропия несовместимы.</p>`;
        perks.forEach(p => {
            const owned = !!(l && l.perks && l.perks[p.id]);
            h += `<div style="font-size:12px; margin-top:5px; opacity:${owned ? 1 : 0.85};">${owned ? '✅' : '▫️'} <strong>${escapeHtml(p.name)}</strong> (${p.level} ур., душ: ${p.souls}) — ${escapeHtml(p.desc)}<br>` +
                (owned ? `<button class="btn-danger" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmLichRevokePerk('${p.id}')">Снять (и следующие)</button>`
                       : `<button class="btn-success" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmLichGrantPerk('${p.id}')">Выдать после ритуала</button>`) + `</div>`;
        });
        if (have.length === 4) {
            const st = l.stage || 0;
            h += `<div style="margin-top:8px;"><label>Становление</label><select onchange="gmLichSetStage(this.value)">` +
                [0, 1, 2].map(n => `<option value="${n}" ${st === n ? 'selected' : ''}>${['Рыцарь смерти', 'Низший лич', 'Высший лич'][n]}</option>`).join('') + `</select>` +
                (window.LICH_STAGES || []).map(x => `<p style="font-size:12px; opacity:.75; margin:3px 0;"><strong>${escapeHtml(x.name)}:</strong> ${escapeHtml(x.need)}</p>`).join('') + `</div>`;
        }
        if (l && (have.length || l.stage)) {
            h += `<div style="font-size:12px; margin-top:8px;">Воскрешение: <strong>${l.resReady ? 'готово' : 'использовано'}</strong> · Ослаблен: <strong>${l.weakened ? 'да' : 'нет'}</strong> · Филактерия: <strong>${escapeHtml(String(l.phylactery))}</strong> · Убийств: ${l.kills || 0}<br>` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({resReady:true})">Вернуть воскрешение</button> ` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({weakened:false})">Снять ослабление</button> ` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({phylactery:'intact'})">Починить филактерию</button> ` +
                `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmLichReset()">Сбросить ветку</button></div>`;
        }
        h += `<details style="margin-top:8px; font-size:12px;"><summary>🏹 Охота на лича (для мастера)</summary><p style="opacity:.85;">Лич уязвим только пока цела его филактерия-убежище: пока она цела, убитый лич восстанавливается через 7 дней. Чтобы убить его насовсем, герои находят и разбивают филактерию (место, стража и ловушки придумывает мастер), затем добивают лича. Кнопка «Починить филактерию» возвращает её в целое состояние, если решите, что игрок её восстановил.</p></details>`;
        return h + `</div>`;
    }
    window.gmLichGrantPerk = function (id) {
        if (!currentInvPlayerUid) { alert('Выбери игрока.'); return; }
        const def = (window.LICH_PERKS || []).find(p => p.id === id); if (!def) return;
        const s = currentSupernaturalState;
        if (s.vampirism || s.lycanthropy) { alert('Игрок — вампир или оборотень: ветка лича ему закрыта.'); return; }
        const lvl = (currentPlayerInvData && currentPlayerInvData.characterLevel) || 1;
        if (lvl < def.level) { alert(`Нужен ${def.level}-й уровень, сейчас ${lvl}.`); return; }
        if (def.prereq && !(s.lich && s.lich.perks && s.lich.perks[def.prereq])) { alert('Сначала нужен предыдущий перк ветки.'); return; }
        if (!confirm(`Ритуал для «${def.name}» отыгран? Игрок отдал невинных душ: ${def.souls} (чёрные камни). Выдать перк (спишется 1 очко перков)?`)) return;
        gmSendCmd({ type: 'lichPerk', perk: id }, `{p} получает перк ветки лича «${def.name}».`).then(ok => { if (ok) setTimeout(renderSupernaturalPanel, 600); });
    };
    window.gmLichRevokePerk = function (id) {
        if (!confirm('Снять этот перк и все следующие за ним? Очки перков вернутся игроку.')) return;
        gmSendCmd({ type: 'lichAdmin', op: 'revoke', perk: id });
    };
    window.gmLichSetStage = function (v) {
        const n = parseInt(v) || 0;
        if (n && !confirm('Ритуал становления отыгран и условия выполнены?')) { renderSupernaturalPanel(); return; }
        gmSendCmd({ type: 'lichAdmin', op: 'stage', stage: n }, n ? '{p} становится личом.' : null);
    };
    window.gmLichSet = function (patch) { gmSendCmd({ type: 'lichAdmin', op: 'set', patch }); };
    window.gmLichReset = function () {
        if (!confirm('Сбросить ветку лича целиком? Все её перки снимутся, очки вернутся.')) return;
        gmSendCmd({ type: 'lichAdmin', op: 'reset' });
    };

    window.toggleSupernaturalFlag = function (key, checked) {
        if (checked && (key === 'vampirism' || key === 'lycanthropy') && currentSupernaturalState.lich && currentSupernaturalState.lich.perks && currentSupernaturalState.lich.perks.pact) {
            alert('Игрок заключил тёмный пакт лича: вампиризм и ликантропия ему недоступны. Сначала снимите перки ветки лича.');
            renderSupernaturalPanel(); return;
        }
        const s = currentSupernaturalState;
        // Что-то одно: вампир, оборотень или лич. Смена пути сбрасывает прежний со всеми плюшками.
        if (checked && key === 'lycanthropy' && s.vampirism) {
            if (!confirm('Игрок сейчас вампир. Став оборотнем, он потеряет вампиризм и все его способности (в том числе ветку лорда). Продолжить?')) { renderSupernaturalPanel(); return; }
            s.vampirism = false; s.vampire = defaultSupernaturalState().vampire;
        } else if (checked && key === 'vampirism' && s.lycanthropy) {
            if (!confirm('Игрок сейчас оборотень. Став вампиром, он потеряет ликантропию и все её способности. Продолжить?')) { renderSupernaturalPanel(); return; }
            s.lycanthropy = false; s.werewolf = defaultSupernaturalState().werewolf;
        }
        s[key] = checked;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.setWerewolfHearts = function (val) {
        currentSupernaturalState.werewolf.heartsEaten = Math.max(0, parseInt(val) || 0);
        saveSupernaturalState();
    };
    window.setWerewolfTotem = function (val) {
        currentSupernaturalState.werewolf.totem = val;
        saveSupernaturalState();
    };
    window.triggerTransform = function () {
        gmPostLogEntryText(`🐺 ${(lastData.participants[currentInvPlayerUid] || {}).name || 'Игрок'} обращается в зверя!`);
    };
    window.setVampireHunger = function (val) {
        currentSupernaturalState.vampire.hungerStage = Math.max(0, Math.min(4, parseInt(val) || 0));
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.feedVampire = function () {
        currentSupernaturalState.vampire.hungerStage = 0;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.toggleVampireLord = function (checked) {
        currentSupernaturalState.vampire.isLord = !!checked;
        if (!checked) currentSupernaturalState.vampire.lordForm = false;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };

    window.loadPlayerInventoryForGm = function () {
        const uid = el('inv-player-select').value;
        if (unsubGmWatchedCharacter) { unsubGmWatchedCharacter(); unsubGmWatchedCharacter = null; }
        if (!uid) {
            currentInvPlayerUid = null;
            el('inv-gold-block').style.display = 'none';
            el('inv-level-block').style.display = 'none';
            el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>';
            currentGuildsData = defaultGuildsData();
            currentSupernaturalState = defaultSupernaturalState();
            currentReputationData = defaultReputationData();
            renderGuildsPanel();
            renderSupernaturalPanel();
            renderReputationPanel();
            if (typeof loadPlayerKnownRecipes === 'function') window.loadPlayerKnownRecipes();
            return;
        }
        currentInvPlayerUid = uid;
        if (typeof window.loadPlayerKnownRecipes === 'function') window.loadPlayerKnownRecipes();
        el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:13px;">Загрузка...</p>';
        let firstSnapshot = true;
        // Живой листенер вместо одноразового .get() — если игрок сам меняет инвентарь/экипировку
        // на своём листе, мастер видит это СРАЗУ, без повторного выбора из списка. Раньше здесь
        // было window.CloudSync.watchCharacter(...) — а gm.html вообще не подключает cloud.js
        // (тот файл только для index.html), поэтому window.CloudSync был undefined и любой выбор
        // игрока падал с ошибкой прямо тут, оставляя "Загрузка..." навсегда.
        unsubGmWatchedCharacter = db.collection('characters').doc(uid).onSnapshot(doc => {
            const data = doc.exists ? doc.data() : null;
            if (data === null) {
                // Раньше ошибка подписки уходила только в консоль браузера — на экране
                // "Загрузка..." оставалась НАВСЕГДА, без единого объяснения, что не так.
                el('inv-items-list').innerHTML = '<p style="color:#e74c3c; font-size:13px;">Не удалось загрузить инвентарь игрока (ошибка подписки — подробности в консоли браузера, F12). Попробуй выбрать игрока заново.</p>';
                return;
            }
            currentPlayerInvData = {
                inventory: Array.isArray(data.inventory) ? data.inventory : [],
                gold: parseInt(data.gold) || 0,
                characterLevel: parseInt(data.characterLevel) || 1,
                levelUpProgress: parseInt(data.levelUpProgress) || 0,
                perkPointsAvailable: parseInt(data.perkPointsAvailable) || 0,
                customSpells: Array.isArray(data.customSpells) ? data.customSpells : [],
                skills: Array.isArray(data.skills) ? data.skills : [],
                race: data.race || ''
            };
            renderGmPlayerPerks(data.takenPerks);
            renderGmPlayerPets(data.pets);
            renderGmPlayerEffects(data.activeTimedEffects);
            if (typeof window.gmRenderTeachSpells === 'function') window.gmRenderTeachSpells();
            { const ss = el('inv-skill-decrease-select'); if (ss) { const cur = ss.value; ss.innerHTML = SKILL_NAMES_BY_IDX.map((n, i) => `<option value="${i}">${escapeHtml(n)} — ${getEffectiveSkillFromData(currentPlayerInvData, i)}</option>`).join(''); /* как у игрока: с расовым бонусом */ if (cur !== '') ss.value = cur; } }
            el('inv-gold-block').style.display = 'block';
            el('inv-gold-current').textContent = formatNumber(currentPlayerInvData.gold);
            el('inv-level-block').style.display = 'block';
            el('inv-level-current').textContent = currentPlayerInvData.characterLevel;
            el('inv-perkpoints-current').textContent = currentPlayerInvData.perkPointsAvailable;
            const needed = gmSkillUpsNeededForLevel(currentPlayerInvData.characterLevel);
            el('inv-level-progress').textContent = currentPlayerInvData.characterLevel >= GM_MAX_CHARACTER_LEVEL ? `Максимальный уровень (${GM_MAX_CHARACTER_LEVEL})` : `Прогресс: ${currentPlayerInvData.levelUpProgress} / ${needed} очков навыков` + (data.levelScheme === 2 ? '' : ' (лист ещё на старой шкале — пересчитается, когда игрок его откроет)');
            renderGmPlayerInventory();

            // Гильдии/Сверхъестественное пишутся сразу по клику — безопасно обновлять на лету.
            currentGuildsData = normalizeGuildsData(data.guildsData);
            const defaultSn = defaultSupernaturalState();
            currentSupernaturalState = data.supernaturalState ? {
                lycanthropy: !!data.supernaturalState.lycanthropy,
                vampirism: !!data.supernaturalState.vampirism,
                werewolf: Object.assign(defaultSn.werewolf, data.supernaturalState.werewolf || {}),
                vampire: Object.assign(defaultSn.vampire, data.supernaturalState.vampire || {}, { lordPerks: (data.supernaturalState.vampire || {}).lordPerks || {} }),
                lich: window.lichNormalize ? window.lichNormalize(data.supernaturalState.lich) : (data.supernaturalState.lich || null),
                faithShift: data.supernaturalState.faithShift || null
            } : defaultSn;
            currentCrimeState = Object.assign({ fineAmount: 0, fineHold: '', fineReason: '', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 }, data.crimeState || {});
            // Снимок листа игрока приходит на каждое его сохранение — недописанная сумма штрафа и прочие поля не теряются.
            gmKeepForms(() => { renderGuildsPanel(); renderSupernaturalPanel(); renderCrimePanel(); });
            // Репутация копится ЛОКАЛЬНО до явного "Сохранить" (см. панель Задачи D) — если
            // перезатирать её на каждом чужом снапшоте, можно потерять несохранённые правки
            // мастера. Подтягиваем из облака только при первом выборе этого игрока.
            if (firstSnapshot) {
                currentReputationData = Object.assign(defaultReputationData(), data.reputationByRegion || {});
                repBaseline = Object.assign({}, currentReputationData);
                renderReputationPanel();
                firstSnapshot = false;
            }
        }, err => {
            console.error('Ошибка подписки на инвентарь игрока:', err);
            el('inv-items-list').innerHTML = `<p style="color:#e74c3c; font-size:13px;">Не удалось загрузить инвентарь игрока: ${escapeHtml(err.message || String(err))}</p>`;
        });
    };

    // Та же шкала, что на листе игрока (index.html getSkillUpsNeededForLevel): потолок 65.
    const GM_MAX_CHARACTER_LEVEL = 65;
    function gmSkillUpsNeededForLevel(level) { return Math.min(level * 2 + 2, 9 + Math.ceil(level / 2)); }

    window.grantLevelUp = function () {
        if (!currentInvPlayerUid) return;
        if (currentPlayerInvData && currentPlayerInvData.characterLevel >= GM_MAX_CHARACTER_LEVEL) { alert(`У персонажа уже максимальный уровень (${GM_MAX_CHARACTER_LEVEL}).`); return; }
        const statKey = el('inv-level-stat-choice').value;
        const statLabels = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        const statOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        const statPos = statOrder.indexOf(statKey);
        let newLevelForLog = null;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const curLevel = parseInt(data.characterLevel) || 1;
            if (curLevel >= GM_MAX_CHARACTER_LEVEL) throw new Error(`у персонажа уже максимальный уровень (${GM_MAX_CHARACTER_LEVEL})`);
            const newLevel = curLevel + 1;
            newLevelForLog = newLevel;
            // Прогресс обнуляется (так решено), но уже накопленные готовые уровни (например, после пересчёта на новую шкалу)
            // не сгорают: если прогресса хватало на этот уровень, списывается только его порог.
            const prog = parseInt(data.levelUpProgress) || 0, need = gmSkillUpsNeededForLevel(curLevel);
            const newProgress = (data.levelScheme === 2 && prog >= need) ? prog - need : 0;
            const newPerkPoints = (parseInt(data.perkPointsAvailable) || 0) + 1;
            // +1 к характеристике — командой листу (gmCmds), а не записью stats: открытый лист stats из облака на лету
            // не подхватывал и ближайшим автосохранением затирал прибавку.
            return db.collection('characters').doc(currentInvPlayerUid).update({
                characterLevel: newLevel,
                perkPointsAvailable: newPerkPoints,
                levelUpProgress: newProgress,
                gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-lv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'stat', key: statKey, delta: 1 })
            });
        }).then(() => {
            alert(`Уровень начислен! Новый уровень + 1 очко перка + 1 к характеристике «${statLabels[statKey]}».`);
            const pname = (lastData.participants[currentInvPlayerUid] || {}).name || currentInvPlayerUid;
            gmPostLogEntryText(`🎓 Мастер начислил уровень ${newLevelForLog} игроку ${pname} (+1 «${statLabels[statKey]}», +1 очко перка).`);
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.grantPerkPointOnly = function () {
        if (!currentInvPlayerUid) return;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const newPerkPoints = (parseInt(data.perkPointsAvailable) || 0) + 1;
            return db.collection('characters').doc(currentInvPlayerUid).update({ perkPointsAvailable: newPerkPoints });
        }).then(() => {
            alert('Начислено 1 очко перка.');
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Понижает уровень персонажа на 1 (минимум 1). Уже взятые перки и полученные ранее
    // характеристики НЕ отменяются автоматически — это на усмотрение мастера/игрока за столом.
    window.revokeLevelUp = function () {
        if (!currentInvPlayerUid) return;
        if (!confirm('Понизить уровень на 1? Уже взятые перки и характеристики останутся как есть.')) return;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const newLevel = Math.max(1, (parseInt(data.characterLevel) || 1) - 1);
            return db.collection('characters').doc(currentInvPlayerUid).update({ characterLevel: newLevel, levelUpProgress: 0 });
        }).then(() => {
            alert('Уровень понижен.');
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function populateSkillDecreaseSelect() {
        const select = el('inv-skill-decrease-select');
        if (!select) return;
        select.innerHTML = SKILL_NAMES_BY_IDX.map((name, i) => `<option value="${i}">${escapeHtml(name)}</option>`).join('');
    }

    // ---------- Правки листа игрока мастером ----------
    // Пишем не значения, а команды в characters/{uid}.gmCmds: лист игрока применяет их сам (один раз, по id) и
    // убирает. Прямая запись skills/stats/perkStates затиралась бы автосохранением открытого листа игрока.
    function gmSendCmd(cmd, logText) {
        if (!currentInvPlayerUid) { alert('Выбери игрока.'); return Promise.resolve(false); }
        const full = Object.assign({ id: 'gmc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now() }, cmd);
        return db.collection('characters').doc(currentInvPlayerUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion(full) })
            .then(() => {
                const pname = ((lastData && lastData.participants) || {})[currentInvPlayerUid] ? lastData.participants[currentInvPlayerUid].name : 'игрок';
                if (logText) gmPostLogEntryText('🎓 Мастер: ' + logText.replace('{p}', pname));
                const m = el('inv-gm-edit-msg'); if (m) m.innerHTML = '<span style="color:#2ecc71;">✔ Отправлено — применится у игрока (сразу, если лист открыт, иначе при входе).</span>';
                return true;
            }).catch(e => { alert('Ошибка: ' + e.message); return false; });
    }
    // «Покаяние»: игрок-даэдропоклонник получает право один раз снова выбрать бога-аэдра.
    window.gmPenance = function () { gmSendCmd({ type: 'penance' }, 'игрок {p} прошёл покаяние — может вернуться к аэдра.'); };
    // Прошёл игровой час — у всех игроков сессии тает облик зверя (4 ч, с «Вечным голодом» 8).
    window.gmHourPassed = function () {
        const parts = Object.keys((lastData && lastData.participants) || {});
        if (!parts.length) { alert('В сессии нет игроков.'); return; }
        Promise.all(parts.map(uid => db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-hr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'hourPassed', hours: 1 }) }).catch(() => { })))
            .then(() => gmPostLogEntryText('🕐 Мастер: прошёл игровой час.'));
    };
    window.gmChangePlayerSkill = function (sign) {
        const skillIdx = parseInt(el('inv-skill-decrease-select').value) || 0;
        const amount = Math.max(1, parseInt(el('inv-skill-decrease-amount').value) || 1);
        const name = SKILL_NAMES_BY_IDX[skillIdx];
        gmSendCmd({ type: 'skill', idx: skillIdx, delta: sign * amount }, `навык «${name}» ${sign > 0 ? '+' : '−'}${amount} игроку {p}.`);
    };
    // Старое имя кнопки «Понизить» (совместимость).
    window.decreasePlayerSkill = function () { window.gmChangePlayerSkill(-1); };
    window.gmChangePlayerStat = function (sign) {
        const key = el('inv-stat-change-select').value;
        const amount = Math.max(1, parseInt(el('inv-stat-change-amount').value) || 1);
        const names = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        gmSendCmd({ type: 'stat', key, delta: sign * amount }, `характеристика «${names[key]}» ${sign > 0 ? '+' : '−'}${amount} игроку {p}.`);
    };
    window.gmPerkDown = function (sIdx, pIdx, name) {
        const refund = !!(el('inv-perk-refund') && el('inv-perk-refund').checked);
        if (!confirm(`Снять одну ступень перка «${name}»${refund ? ' и вернуть очко перка' : ' (без возврата очка)'}?`)) return;
        gmSendCmd({ type: 'perkDown', s: sIdx, p: pIdx, refund }, `снята ступень перка «${name}» у игрока {p}${refund ? ' (очко возвращено)' : ''}.`);
    };
    window.gmRenderTeachSpells = function () {
        const sel = el('inv-teach-spell'); if (!sel) return;
        const school = el('inv-teach-school').value;
        const known = new Set(((currentPlayerInvData && currentPlayerInvData.customSpells) || []).map(s => s.name));
        const tiers = { 1: 'Новичок', 2: 'Ученик', 3: 'Адепт', 4: 'Эксперт' };
        const data = (window.spellsData && window.spellsData[school]) || {};
        sel.innerHTML = [1, 2, 3, 4].map(t => (data[t] || []).length ? `<optgroup label="${tiers[t]}">` + data[t].map(sp =>
            `<option value="${escapeHtml(sp.name)}" ${known.has(sp.name) ? 'disabled' : ''}>${escapeHtml(sp.name)}${known.has(sp.name) ? ' — уже знает' : ''}</option>`).join('') + '</optgroup>' : '').join('');
    };
    window.gmTeachSpell = function () {
        const school = el('inv-teach-school').value, name = el('inv-teach-spell').value;
        if (!name) { alert('Выбери заклинание.'); return; }
        gmSendCmd({ type: 'spell', school, name }, `игрок {p} обучен заклинанию «${name}».`);
    };
    function renderGmPlayerPerks(list) {
        const box = el('inv-perks-list'); if (!box) return;
        if (!Array.isArray(list)) { box.innerHTML = '<p style="opacity:.6;">Список перков появится, когда игрок откроет лист (он сохраняет сводку взятых перков).</p>'; return; }
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Перков нет.</p>'; return; }
        box.innerHTML = list.map(p => `<div style="display:flex; justify-content:space-between; gap:6px; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span><span style="opacity:.6;">${escapeHtml(p.tree)}:</span> ${escapeHtml(p.name)}${p.steps > 1 ? ` (${p.taken}/${p.steps})` : ''}</span>
            <button class="btn-danger" style="width:auto; padding:1px 8px; font-size:12px;" onclick="gmPerkDown(${parseInt(p.s)}, ${parseInt(p.p)}, '${jsq(p.name)}')">−1</button></div>`).join('');
    }

    function renderGmPlayerInventory() {
        const target = el('inv-items-list');
        const items = currentPlayerInvData.inventory;
        if (!items.length) {
            target.innerHTML = '<p style="opacity:.6; font-size:13px;">Инвентарь пуст.</p>';
            return;
        }
        target.innerHTML = items.map(item => `
            <div class="party-row">
                <div class="row-name">
                    <span><strong>${escapeHtml(item.name)}</strong> × ${item.count}${item.weight ? ` <span style="opacity:.6; font-size:12px;">(вес ${item.weight})</span>` : ''}${typeof item.price === 'number' ? ` <span style="opacity:.6; font-size:12px;">· ${item.price} септ./шт.</span>` : ''}</span>
                    <span style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="del-qty-${escapeHtml(item.itemId)}" value="1" min="1" max="${item.count}" style="width:52px;">
                        <button class="btn-danger" style="width:auto; padding:2px 8px; font-size:12px;" onclick="deletePlayerItem('${jsq(item.itemId)}')">Удалить</button>
                    </span>
                </div>
                ${item.effect ? `<div style="font-size:12px; opacity:.75; margin-top:2px;">${escapeHtml(item.effect)}</div>` : ''}
            </div>
        `).join('');
    }

    // Правка инвентаря игрока мастером — транзакцией по свежему листу из облака, а не по снимку мастера:
    // иначе вещь, проданная или потраченная игроком в эту секунду, «воскресала». fn(inv, data) меняет inv на месте;
    // вернуть строку — отказ с этим текстом (ничего не пишется).
    function gmTxInventory(uid, fn) {
        const ref = db.collection('characters').doc(uid);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const data = doc.exists ? (doc.data() || {}) : {};
            const inv = (Array.isArray(data.inventory) ? data.inventory : []).map(i => Object.assign({}, i));
            const err = fn(inv, data);
            if (typeof err === 'string') throw new Error(err);
            if (doc.exists) tx.update(ref, { inventory: stripUndefinedDeep(inv) }); else tx.set(ref, { inventory: stripUndefinedDeep(inv) }, { merge: true });
            return inv;
        }));
    }

    // Раньше удаляло весь стек разом, даже если у игрока было 10 стрел — теперь удаляет ровно
    // то количество, что указано в поле рядом с кнопкой (по умолчанию 1).
    window.deletePlayerItem = function (itemId) {
        if (!currentInvPlayerUid) return;
        const item = currentPlayerInvData.inventory.find(i => i.itemId === itemId);
        if (!item) return;
        const qtyInput = el('del-qty-' + itemId);
        const qty = Math.max(1, Math.min(item.count, parseInt(qtyInput ? qtyInput.value : 1) || 1));
        if (!confirm(`Удалить ${qty} шт. «${item.name}» у игрока?`)) return;
        gmTxInventory(currentInvPlayerUid, inv => {
            const ix = inv.findIndex(i => i.itemId === itemId);
            if (ix === -1) return `У игрока уже нет «${item.name}».`;
            const left = (parseInt(inv[ix].count) || 0) - qty;
            if (left > 0) inv[ix].count = left; else inv.splice(ix, 1);
        }).then(newInv => {
            currentPlayerInvData.inventory = newInv;
            renderGmPlayerInventory();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Прибавить/списать золото игроку относительно того, что у него СЕЙЧАС в облаке, не ниже 0.
    // Не FieldValue.increment: лист игрока долго сохранял золото строкой ("150"), а increment по
    // нечисловому полю Firestore не прибавляет, а ЗАМЕНЯЕТ значение — «+50» превращало 150 в 50.
    // Транзакция читает текущее значение (parseInt понимает и строку) и пишет число.
    // opts.requireEnough — списание только если золота хватает (иначе ошибка, ничего не меняется).
    function gmAddGold(uid, delta, opts) {
        const ref = db.collection('characters').doc(uid);
        let res = null;
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const before = parseInt((doc.data() || {}).gold) || 0;
            if (opts && opts.requireEnough && (parseInt(delta) || 0) < 0 && before < -(parseInt(delta) || 0)) throw new Error('у игрока только ' + before + ' золота, нужно ' + (-(parseInt(delta) || 0)));
            const after = Math.max(0, before + (parseInt(delta) || 0));
            res = { before, after };
            if (doc.exists) tx.update(ref, { gold: after }); else tx.set(ref, { gold: after }, { merge: true });
        })).then(() => res);
    }
    window.gmAddGold = gmAddGold;

    window.applyGoldDelta = function (sign) {
        if (!currentInvPlayerUid) return;
        const uid = currentInvPlayerUid;
        const amount = parseInt(el('inv-gold-delta').value) || 0;
        if (sign !== 0 && amount <= 0) { alert('Укажи положительную сумму.'); return; }
        if (sign === 0 && amount < 0) { alert('Золото не может быть меньше 0.'); return; }
        const pname = (lastData.participants[uid] || {}).name || uid;
        const ref = db.collection('characters').doc(uid);
        // sign 0 — «Установить»: записать ровно эту сумму
        const op = sign === 0
            ? ref.update({ gold: amount }).then(() => ({ after: amount }))
            : gmAddGold(uid, sign * amount);
        op.then(r => {
            el('inv-gold-delta').value = '';
            if (uid === currentInvPlayerUid) { currentPlayerInvData.gold = r.after; el('inv-gold-current').textContent = formatNumber(r.after); }
            const verb = sign > 0 ? `выдал ${amount}` : sign < 0 ? `списал ${r.before - r.after}` : `установил ${amount}`;
            gmPostLogEntryText(`💰 Мастер ${verb} золота игроку ${pname}` + (sign !== 0 ? ` (теперь ${r.after}).` : '.'));
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Создание своего предмета мастером ----------

    window.updateCustomItemFields = function () {
        const cat = el('ci-category').value;
        el('ci-weapon-fields').style.display = cat === 'weapon' ? 'block' : 'none';
        el('ci-armor-fields').style.display = cat === 'armor' ? 'block' : 'none';
        el('ci-jewelry-fields').style.display = cat === 'jewelry' ? 'block' : 'none';
        el('ci-potion-fields').style.display = cat === 'potion' ? 'block' : 'none';
        el('ci-upgrade-fields').style.display = (cat === 'weapon' || cat === 'armor') ? 'block' : 'none';

        // Зелье/яд — раньше был только общий текст, без структурированного эффекта/величины/
        // длительности. Список эффектов — та же база, что у реальной алхимии (alchemyBaseEffects),
        // отфильтрован по знаку (положительный для зелья, отрицательный для яда).
        if (cat === 'potion') {
            const kind = el('ci-potion-kind').value;
            const wantPolarity = kind === 'poison' ? 'negative' : 'positive';
            const effSelect = el('ci-potion-effect');
            const prevVal = effSelect.value;
            const names = Object.keys(window.alchemyBaseEffects || {}).filter(n => window.alchemyBaseEffects[n].polarity === wantPolarity);
            effSelect.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
            if (names.includes(prevVal)) effSelect.value = prevVal;
            const info = window.alchemyBaseEffects[effSelect.value];
            el('ci-potion-duration-wrap').style.display = (info && info.dur !== null && info.dur !== undefined) ? 'block' : 'none';
            const magEl = el('ci-potion-magnitude');
            if (magEl && magEl.parentElement) magEl.parentElement.style.display = (info && info.base !== null && info.base !== undefined) ? 'block' : 'none';
        }

        const enchanted = el('ci-enchanted').checked;
        el('ci-enchant-fields').style.display = enchanted ? 'block' : 'none';
        if (!enchanted) return;

        const effectSelect = el('ci-enchant-effect');
        let effects = [];
        if (cat === 'weapon' && window.enchantWeaponEffects) {
            effects = window.enchantWeaponEffects;
        } else if ((cat === 'armor' || cat === 'jewelry') && window.enchantArmorEffects) {
            const slot = cat === 'armor' ? el('ci-armor-slot').value : el('ci-jewelry-slot').value;
            const enchantSlotMap = { chest: 'armor', robe: 'armor', gloves: 'gauntlets', neck: 'amulet', circlet: 'helmet' };
            const wantedSlot = enchantSlotMap[slot] || slot;
            effects = window.enchantArmorEffects.filter(e => e.slots.includes(wantedSlot));
        }
        effectSelect.innerHTML = effects.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`).join('')
            || '<option value="">Нет подходящих эффектов для этого слота</option>';
    };

    window.createCustomItem = function () {
        if (!db) return;
        const name = el('ci-name').value.trim();
        if (!name) { alert('Укажи название предмета.'); return; }
        const cat = el('ci-category').value;
        const weight = parseFloat(el('ci-weight').value) || 0;
        const price = parseInt(el('ci-price').value) || 0;
        const desc = el('ci-desc').value.trim();

        const catLabels = { weapon: 'Оружие (своё)', armor: 'Броня (своя)', jewelry: 'Ювелирное изделие (своё)', book: 'Книга/Свиток', potion: 'Зелье/Яд', misc: 'Разное' };

        const item = { name, category: catLabels[cat] || 'Разное', weight, price, effect: desc, slot: null };

        // Универсальный счётчик использований — применяется НЕЗАВИСИМО от категории (не только
        // "разное", оружие/броня/зелье тоже могут иметь ограниченный запас зарядов, как волшебный
        // посох). Сама механика кнопки "Использовать" уже существует (useLimitedItem, index.html),
        // раньше просто не было способа задать maxUses при РУЧНОМ создании предмета мастером.
        const maxUses = parseInt(el('ci-max-uses').value) || 0;
        if (maxUses > 0) {
            item.maxUses = maxUses;
            item.usesLeft = maxUses;
            item.effect = item.effect ? item.effect + `; Использований: ${maxUses}` : `Использований: ${maxUses}`;
        }

        if (cat === 'weapon') {
            item.dmg = parseInt(el('ci-damage').value) || 0;
            // Значение выбора может быть "onehand:топор" (для распознавания топора/булавы по имени
            // в бою) — базовый slot всё равно 'melee'/'ranged'/'dagger'/'onehand'/'twohand_*',
            // сама подсказка попадает в effect текстом, т.к. переключатель типа на листе игрока —
            // отдельное поле на другой вкладке, сюда не дотянуться напрямую.
            const rawType = el('ci-weapon-type').value;
            const [wepType, wepSub] = rawType.split(':');
            item.slot = wepType === 'ranged' ? 'ranged' : (wepType === 'dagger' ? 'melee' : 'melee');
            item.weaponType = wepType;
            const typeLabel = el('ci-weapon-type').selectedOptions[0].textContent;
            item.effect = item.effect ? item.effect + `; Тип: ${typeLabel}` : `Тип: ${typeLabel}`;
        } else if (cat === 'armor') {
            item.slot = el('ci-armor-slot').value;
            item.armor = parseInt(el('ci-armor-value').value) || 0;
            // armorType (Лёгкая/Тяжёлая) — раньше вообще не спрашивалось при создании, хотя
            // данные реальных кузнечных рецептов этим полем уже пользуются.
            item.armorType = el('ci-armor-type').value;
            item.effect = item.effect ? item.effect + `; ${item.armorType}` : item.armorType;
        } else if (cat === 'jewelry') {
            item.slot = el('ci-jewelry-slot').value;
        } else if (cat === 'potion') {
            // Структурированный эффект зелья/яда — раньше был только свободный текст без
            // конкретной величины/длительности, теперь та же база эффектов, что у реальной алхимии.
            const kind = el('ci-potion-kind').value;
            const effName = el('ci-potion-effect').value;
            const info = window.alchemyBaseEffects ? window.alchemyBaseEffects[effName] : null;
            const hasMag = !info || (info.base !== null && info.base !== undefined);
            const magnitude = hasMag ? (parseFloat(el('ci-potion-magnitude').value) || 0) : null;
            const unit = info ? info.unit : '';
            const hasDur = info ? (info.dur !== null && info.dur !== undefined) : false;
            const duration = hasDur ? (parseInt(el('ci-potion-duration').value) || 1) : null;
            item.category = kind === 'poison' ? 'Яд' : 'Зелье';
            item.alchemyEffects = [{ name: effName, magnitude, duration, unit, kind: info ? info.kind : null }];
            const potDesc = window.describeAlchemyEffect ? window.describeAlchemyEffect({ name: effName, magnitude, duration, unit }) : effName;
            item.effect = item.effect ? item.effect + '; ' + potDesc : potDesc;
        }

        // Материал улучшения (наточить у точила/верстака) — общий и для оружия, и для брони.
        // Раньше в форме создания этого поля не было вообще; у реальных кузнечных рецептов
        // (armorRecipes) такое поле уже есть (upgradeMaterial), но тоже нигде не отображалось.
        if ((cat === 'weapon' || cat === 'armor') && el('ci-upgrade-material').value.trim()) {
            const mat = el('ci-upgrade-material').value.trim();
            const qty = parseInt(el('ci-upgrade-qty').value) || 1;
            item.upgradeMaterial = mat;
            item.upgradeQty = qty;
            const upgDesc = `Улучшается: ${mat} ×${qty}`;
            item.effect = item.effect ? item.effect + '; ' + upgDesc : upgDesc;
        }

        if (el('ci-enchanted').checked) {
            const effName = el('ci-enchant-effect').value;
            const effVal = parseFloat(el('ci-enchant-value').value) || 0;
            if (effName) {
                const enchDesc = `${effName}: ${effVal}`;
                item.enchantment = { name: effName, value: effVal, unit: '', description: enchDesc };
                item.effect = item.effect ? item.effect + '; ' + enchDesc : enchDesc;
            }
        }

        const docId = name.replace(/[\/\.\#\$\[\]]/g, '_') + '_custom_' + Date.now();
        db.collection('items').doc(docId).set(item).then(() => {
            el('ci-result').innerHTML = `<span style="color:#2ecc71;">✅ Предмет «${escapeHtml(name)}» создан и сохранён в базу.</span>`;
            el('ci-name').value = '';
            el('ci-desc').value = '';
            window.loadGmItems();
        }).catch(e => {
            el('ci-result').innerHTML = `<span style="color:#e74c3c;">Ошибка: ${escapeHtml(e.message)}</span>`;
        });
    };

    // ---------- Мини-расчёт перков для калькуляторов (без полного perks.js — тут нет DOM игрока) ----------

    // Статус-эффекты, которые НПС может наложить на игрока атакой — пишутся прямо в
    // activeTimedEffects игрока и тикают по тем же ходам, что и его собственные баффы.
    // Болезни Скайрима — переносятся дикими животными при укусе (см. DISEASE_DEFS ниже и теги
    // carrierOfDisease/diseaseChance в enemies-data.js). Лечится обычным зельем лечения болезней
    // или молитвой у алтаря — отдельной кнопки "вылечить" тут нет специально, это дело мастера
    // отыграть по ситуации (снять статус вручную кнопкой "Снять", как и остальные статусы).
    const DISEASE_DEFS = {
        'Атаксия': { desc: '−2 к броскам Одноручного оружия и Взлома.' },
        'Каменная подагра': { desc: '−2 к броскам Тяжёлой/Лёгкой брони.' },
        'Заумь': { desc: '−2 к броскам школ магии (Разрушение/Восстановление/Колдовство/Иллюзия/Изменение).' },
        'Кровавая лихорадка': { desc: '−10 к максимальному здоровью, пока не вылечена.' },
        'Насморк Пелиниала': { desc: '−2 к броскам Скрытности и Карманных краж.' },
        'Разжижение мозга': { desc: '−25 к максимальному здоровью, пока не вылечена.' },
        'Костоломная лихорадка': { desc: '−5 фт скорости, пока не вылечена.' },
        'Хрипунец': { desc: '−10% сопротивления стихиям, пока не вылечен.' }
    };

    const GM_STATUS_EFFECTS = {
        paralyze: { name: 'Паралич', desc: 'Не может действовать в свой ход.', turns: 1 },
        fear: { name: 'Страх', desc: 'Вынужден отступать/убегать 1 ход.', turns: 1 },
        frenzy: { name: 'Бешенство', desc: 'Атакует ближайшую цель без разбора 1 ход.', turns: 1 },
        slow: { name: 'Замедление', desc: '-10 фт. скорости.', turns: 3, speed: -10 },
        weakened: { name: 'Ослабление', desc: '-2 к броскам атаки/проверок.', turns: 2, rollPenalty: -2 },
        calm: { name: 'Успокоение', desc: 'Не атакует 1 ход.', turns: 1 },
        // Ниже — только для врагов (массовая кнопка «Статус»): работают сами — блок атаки, штраф к кубам, урон по ходам.
        stun: { name: 'Оглушение', desc: 'Оглушён — не действует.', turns: 1 },
        burning: { name: 'Горение', desc: 'Горит: 5 урона огнём в начале каждого хода (сопротивление огню учитывается).', turns: 3, dotHp: 5, dotType: 'fire' },
        bleeding: { name: 'Кровотечение', desc: 'Истекает кровью: 5 урона в начале каждого хода.', turns: 3, dotHp: 5, dotNoResist: true },
        blind: { name: 'Ошеломление', desc: '−3 к кубам.', turns: 1, rollPenalty: -3 }
    };

    const RACE_SKILL_BONUSES = {
        nord: { "Двуручное оружие": 10, "Красноречие": 5, "Легкая броня": 5, "Блокирование": 5, "Кузнечное дело": 5, "Одноручное оружие": 5 },
        altmer: { "Иллюзия": 10, "Колдовство": 5, "Разрушение": 5, "Изменение": 5, "Восстановление": 5, "Зачарование": 5 },
        breton: { "Колдовство": 10, "Иллюзия": 5, "Алхимия": 5, "Красноречие": 5, "Восстановление": 5, "Изменение": 5 },
        orc: { "Тяжелая броня": 10, "Зачарование": 5, "Двуручное оружие": 5, "Блокирование": 5, "Кузнечное дело": 5, "Одноручное оружие": 5 },
        khajiit: { "Скрытность": 10, "Взлом": 5, "Алхимия": 5, "Карманные кражи": 5, "Стрельба": 5, "Одноручное оружие": 5 },
        redguard: { "Одноручное оружие": 10, "Разрушение": 5, "Изменение": 5, "Блокирование": 5, "Кузнечное дело": 5, "Стрельба": 5 },
        argonian: { "Взлом": 10, "Восстановление": 5, "Изменение": 5, "Легкая броня": 5, "Скрытность": 5, "Карманные кражи": 5 },
        bosmer: { "Стрельба": 10, "Взлом": 5, "Алхимия": 5, "Легкая броня": 5, "Скрытность": 5, "Карманные кражи": 5 },
        dunmer: { "Разрушение": 15, "Иллюзия": 5, "Алхимия": 5, "Легкая броня": 5, "Скрытность": 5, "Изменение": 5 },
        imperial: { "Восстановление": 10, "Разрушение": 5, "Зачарование": 5, "Тяжелая броня": 5, "Блокирование": 5, "Одноручное оружие": 5 }
    };
    const SKILL_NAMES_BY_IDX = ["Одноручное оружие", "Двуручное оружие", "Стрельба", "Блокирование", "Тяжелая броня",
        "Легкая броня", "Скрытность", "Взлом", "Карманные кражи", "Красноречие", "Разрушение", "Восстановление",
        "Колдовство", "Иллюзия", "Изменение", "Алхимия", "Кузнечное дело", "Зачарование", "Кулинария"];

    function getEffectiveSkillFromData(data, skillIdx) {
        const raw = (Array.isArray(data.skills) ? parseInt(data.skills[skillIdx]) : null) || 10;
        const skillName = SKILL_NAMES_BY_IDX[skillIdx];
        const bonus = (RACE_SKILL_BONUSES[data.race] && RACE_SKILL_BONUSES[data.race][skillName]) || 0;
        return Math.min(100, raw + bonus); // как на листе игрока: потолок навыка 100 вместе с расовым бонусом
    }

    function getMaxStepFromStates(perkStates, skillIdx, perkIdx) {
        let max = 0;
        for (let s = 1; s <= 5; s++) {
            if (perkStates && perkStates[`skill${skillIdx}-perk${perkIdx}-step${s}`]) max = s;
        }
        return max;
    }

    function computeAlchemyPerksFor(data) {
        const ps = data.perkStates || {};
        const alchemistRank = getMaxStepFromStates(ps, 15, 0);
        return {
            alchemistRank: alchemistRank,
            hasHealer: getMaxStepFromStates(ps, 15, 1) > 0,
            hasProvisor: getMaxStepFromStates(ps, 15, 2) > 0,
            hasPoisoner: getMaxStepFromStates(ps, 15, 3) > 0
        };
    }

    function computeEnchantPerksFor(data) {
        const ps = data.perkStates || {};
        return {
            enchantGeneralBonus: 0.20 * getMaxStepFromStates(ps, 17, 0),
            enchantSoulEconomy: getMaxStepFromStates(ps, 17, 1) > 0 ? 2 : 0,
            enchantFireBonus: getMaxStepFromStates(ps, 17, 2) > 0 ? 0.25 : 0,
            enchantFrostBonus: getMaxStepFromStates(ps, 17, 4) > 0 ? 0.25 : 0,
            enchantSkillBonus: getMaxStepFromStates(ps, 17, 5) > 0 ? 0.25 : 0,
            enchantShockBonus: getMaxStepFromStates(ps, 17, 6) > 0 ? 0.25 : 0,
            enchantLifeBonus: getMaxStepFromStates(ps, 17, 7) > 0 ? 0.25 : 0
        };
    }

    function populateCalcPlayerSelects() {
        const uids = Object.keys(lastData.participants || {});
        const opts = '<option value="">— выбери игрока —</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        ['calc-alch-player', 'calc-ench-player'].forEach(id => {
            const select = el(id);
            if (!select) return;
            const prev = select.value;
            select.innerHTML = opts;
            if (uids.includes(prev)) select.value = prev;
        });
    }

    // ---------- Калькулятор алхимии ----------

    function renderCalcAlchIngredients() {
        const names = Object.keys(window.alchemyIngredients || {}).sort();
        const optsHtml = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        ['calc-alch-ing1', 'calc-alch-ing2', 'calc-alch-ing3'].forEach(id => {
            const select = el(id);
            if (select) select.innerHTML = (id === 'calc-alch-ing3' ? '<option value="">— не использовать —</option>' : '') + optsHtml;
        });
    }

    window.calcAlchemyCheck = function () {
        const uid = el('calc-alch-player').value;
        const resultEl = el('calc-alch-result');
        if (!uid) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери игрока.</span>'; return; }
        const ing1 = el('calc-alch-ing1').value, ing2 = el('calc-alch-ing2').value, ing3 = el('calc-alch-ing3').value;
        if (!ing1 || !ing2 || ing1 === ing2) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери минимум два разных ингредиента.</span>'; return; }

        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const skill = getEffectiveSkillFromData(data, 15);
            const perks = computeAlchemyPerksFor(data);
            el('calc-alch-skill-info').textContent = `Алхимия: ${skill} (с расой) · Алхимик: ранг ${perks.alchemistRank} · Провизор: ${perks.hasProvisor ? 'да' : 'нет'} · Целитель: ${perks.hasHealer ? 'да' : 'нет'} · Отравитель: ${perks.hasPoisoner ? 'да' : 'нет'}`;

            // Правило автора: у первых двух должно быть общее свойство; третий добавляет только совпавшие.
            const shared = window.getSharedAlchemyEffectsFor(ing1, ing2, (ing3 && ing3 !== ing1 && ing3 !== ing2) ? ing3 : null);
            if (!shared.length) {
                resultEl.innerHTML = '<span style="color:#e74c3c;">⚠ У первых двух ингредиентов нет общих свойств — варево не получится.</span>';
                return;
            }
            const gear = (data.skillBoosts && data.skillBoosts['алхимия']) || 0;
            const ctxBase = { skill, alchemistRank: perks.alchemistRank, hasProvisor: perks.hasProvisor, hasHealer: perks.hasHealer, hasPoisoner: perks.hasPoisoner, gear };
            const pols = shared.map(n => (window.alchemyBaseEffects[n] || {}).polarity);
            const mixed = pols.includes('positive') && pols.includes('negative');
            const modes = mixed ? ['potion', 'poison'] : [pols.every(p => p === 'positive') ? 'potion' : 'poison'];
            let html = '';
            modes.forEach(mode => {
                html += `<div style="margin-top:6px; opacity:.85;">${mode === 'poison' ? '☠ Если варить ЯД' : '🧪 Если варить ЗЕЛЬЕ'}:</div>`;
                shared.forEach(effName => {
                    const e = window.calcAlchemyEffect(effName, Object.assign({ mode }, ctxBase));
                    if (!e) return;
                    const godPP = ((data.godGM || {}).potionPower) || 0; // Намира: зелья сильнее — как при варке у игрока
                    if (godPP && e.magnitude !== null) e.magnitude = Math.round(e.magnitude * (1 + godPP / 100));
                    html += `<div>${e.polarity === 'negative' ? '☠' : '🧪'} <strong>${escapeHtml(effName)}</strong>: ${escapeHtml(window.describeAlchemyEffect(e).slice(effName.length + 2) || '—')}</div>`;
                });
            });
            resultEl.innerHTML = html;
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // ---------- Калькулятор зачарования ----------

    window.renderCalcEnchEffects = function () {
        const type = el('calc-ench-type').value;
        const select = el('calc-ench-effect');
        const effects = type === 'weapon' ? (window.enchantWeaponEffects || []) : (window.enchantArmorEffects || []);
        select.innerHTML = effects.map((e, i) => `<option value="${i}">${escapeHtml(e.name)}</option>`).join('');
    };

    window.calcEnchantCheck = function () {
        const uid = el('calc-ench-player').value;
        const resultEl = el('calc-ench-result');
        if (!uid) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери игрока.</span>'; return; }
        const type = el('calc-ench-type').value;
        const idx = parseInt(el('calc-ench-effect').value) || 0;
        const effects = type === 'weapon' ? (window.enchantWeaponEffects || []) : (window.enchantArmorEffects || []);
        const effect = effects[idx];
        const gem = el('calc-ench-gem').value;
        if (!effect) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери эффект.</span>'; return; }

        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const skill = getEffectiveSkillFromData(data, 17);
            const perks = computeEnchantPerksFor(data);
            el('calc-ench-skill-info').textContent = `Зачарование: ${skill} (с расой) · Общий бонус: +${Math.round(perks.enchantGeneralBonus * 100)}%`;
            const calc = window.calcEnchantPower(effect, gem, skill, perks);
            resultEl.innerHTML = calc.boolean
                ? `<div>${escapeHtml(effect.description)}</div>`
                : `<div><strong>${escapeHtml(effect.name)}</strong>: ${calc.value}${escapeHtml(effect.unit)}</div>`;
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    if (typeof renderCalcAlchIngredients === 'function') renderCalcAlchIngredients();
    if (typeof populateSkillDecreaseSelect === 'function') populateSkillDecreaseSelect();
    if (typeof renderMerchantHoldSelect === 'function') renderMerchantHoldSelect();
    if (typeof renderMerchantTypeSelect === 'function') renderMerchantTypeSelect();
    if (typeof renderHolidaySelect === 'function') renderHolidaySelect();
    if (typeof renderGroupCheckSkillSelect === 'function') renderGroupCheckSkillSelect();
    if (typeof renderGuildInfoSelect === 'function') { renderGuildInfoSelect(); renderGuildInfoPanel(); }
    if (typeof populateQgenHoldSelect === 'function') populateQgenHoldSelect();
    if (typeof renderTournBracketInfo === 'function') renderTournBracketInfo();
    if (typeof renderAllWeatherReference === 'function') renderAllWeatherReference();
    if (typeof renderAllEnchantsReference === 'function') renderAllEnchantsReference();
    if (typeof populateEnemyDbSelect === 'function') populateEnemyDbSelect();
    if (typeof initEnemyGearPanels === 'function') initEnemyGearPanels();
    if (typeof window.renderCalcEnchEffects === 'function') window.renderCalcEnchEffects();

    // ---------- Выдача квестов ----------

    function populateQuestTargetSelect() {
        const select = el('quest-target-player');
        if (!select) return;
        const uids = Object.keys(lastData.participants || {});
        const prev = select.value;
        select.innerHTML = '<option value="all">Всей группе</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        if (prev === 'all' || uids.includes(prev)) select.value = prev;
    }

    function genQuestId() { return 'q-' + Date.now() + Math.random().toString(36).slice(2, 6); }

    // Генератор квестов (документ 4) — НЕ отдельный механизм доставки, просто заполняет уже
    // существующую форму выдачи (quest-title-input и т.д.), дальше работает обычная
    // window.grantQuest() как при ручном вводе. holds.js подключён отдельно в gm.html (раньше
    // был только в holds.html).
    function populateQgenHoldSelect() {
        const sel = el('qgen-hold-select');
        if (!sel || sel.options.length || !window.holdsData) return;
        sel.innerHTML = Object.keys(window.holdsData).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
    }

    const QUEST_TEMPLATES = [
        { kind: 'bounty', giverRole: /ярл|управител/i, title: n => `Охота за головами: логово у «${n}»`,
          desc: (giver, loc) => `${giver} объявил(а) награду за зачистку опасного места — ${loc}.`,
          req: loc => `Зачистить ${loc} от обосновавшихся там врагов.` },
        { kind: 'fetch', giverRole: /маг|жрец|алхимик/i, title: n => `Поручение: находка из «${n}»`,
          desc: (giver, loc) => `${giver} просит принести редкий предмет или книгу из ${loc}.`,
          req: loc => `Добыть нужный предмет в ${loc} и вернуть заказчику.` },
        { kind: 'escort', giverRole: /купец|торговец|трактирщик/i, title: n => `Поручение от «${n}»`,
          desc: (giver, loc) => `${giver} просит помощи — дело связано с ${loc}.`,
          req: loc => `Разобраться с делом в ${loc} и вернуться с докладом.` }
    ];

    window.generateHoldQuest = function () {
        const holdName = el('qgen-hold-select').value;
        const difficulty = el('qgen-difficulty').value;
        const hold = window.holdsData && window.holdsData[holdName];
        if (!hold) { alert('Нет данных по этому владению.'); return; }
        // "npcs" вперемешку содержит и реальных именных NPC (role непустой), и заголовки
        // городов/разделов (role пустой) — отсеиваем вторые.
        const realNpcs = (hold.npcs || []).filter(n => n.role);
        const locations = (hold.locations || []).filter(l => l.name);
        if (!realNpcs.length || !locations.length) { alert('В базе этого владения не хватает NPC или локаций для генерации.'); return; }
        const template = QUEST_TEMPLATES[Math.floor(Math.random() * QUEST_TEMPLATES.length)];
        const matchingGivers = realNpcs.filter(n => template.giverRole.test(n.role));
        const giver = (matchingGivers.length ? matchingGivers : realNpcs)[Math.floor(Math.random() * (matchingGivers.length ? matchingGivers.length : realNpcs.length))];
        const loc = locations[Math.floor(Math.random() * locations.length)];
        const giverLabel = `${giver.name} (${giver.role})`;

        // Награда по сложности — база × уровень персонажа. Уровень тут неизвестен (квест ещё не
        // привязан к конкретному игроку), берём среднюю оценку мастера явно не нужна — просто
        // фиксированная база по сложности, мастер поправит число в поле вручную при желании.
        const goldByDiff = { low: 100, mid: 250, high: 500 };
        const gold = goldByDiff[difficulty] || 250;

        el('quest-title-input').value = template.title(holdName);
        el('quest-desc-input').value = template.desc(giverLabel, loc.name);
        el('quest-req-input').value = template.req(loc.name);
        el('quest-reward-input').value = `${gold} септимов` + (difficulty === 'high' ? ' + ценный предмет по усмотрению мастера' : '');
    };

    // Квест — командой в лист игрока (gmCmds), как и остальные правки мастера: прямую запись playerQuests
    // затирало следующее автосохранение игрока (лист хранит свой список квестов).
    async function grantQuestToUid(uid, quest) {
        await db.collection('characters').doc(uid).set({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'quest', quest }) }, { merge: true });
    }

    window.grantQuest = function () {
        const title = el('quest-title-input').value.trim();
        if (!title) { alert('Укажи название квеста.'); return; }
        const quest = {
            id: genQuestId(),
            title: title,
            desc: el('quest-desc-input').value.trim(),
            requirement: el('quest-req-input').value.trim(),
            reward: el('quest-reward-input').value.trim(),
            guild: el('quest-guild-select').value || null,
            status: 'active'
        };
        const target = el('quest-target-player').value;
        const resultEl = el('quest-grant-result');
        let uids;
        if (target === 'all') {
            uids = Object.keys(lastData.participants || {});
            if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        } else {
            if (!target) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери получателя.</span>'; return; }
            uids = [target];
        }
        Promise.all(uids.map(uid => grantQuestToUid(uid, quest))).then(() => {
            resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Квест «${escapeHtml(title)}» выдан (${uids.length} игрок(ов)).</span>`;
            gmPostLogEntryText(`📜 Мастер выдал квест «${title}» (${target === 'all' ? 'всей группе' : ((lastData.participants[target] || {}).name || target)}).`);
            try { window.rumAddDeed({ kind: 'quest', what: title, who: target === 'all' ? rumPartyNames() : [((lastData.participants || {})[target] || {}).name].filter(Boolean) }); } catch (e) { }
            el('quest-title-input').value = '';
            el('quest-desc-input').value = '';
            el('quest-req-input').value = '';
            el('quest-reward-input').value = '';
        }).catch(e => {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>';
        });
    };

    // ---------- Награда на всю группу ----------

    window.filterPartyRewardItems = function () {
        const query = (el('party-reward-item-search').value || '').toLowerCase();
        const select = el('party-reward-item-select');
        if (!select) return;
        if (!query) { select.innerHTML = '<option value="">— без предмета —</option>'; return; }
        const matches = (gmAllItems || []).filter(i => (i.name || '').toLowerCase().includes(query)).slice(0, 30);
        select.innerHTML = '<option value="">— без предмета —</option>' +
            matches.map((i, idx) => `<option value="${escapeHtml(i.id || i.name)}">${escapeHtml(i.name)} (${escapeHtml(i.category || '')})</option>`).join('');
    };

    window.grantPartyReward = function () {
        const gold = parseInt(el('party-reward-gold').value) || 0;
        const itemId = el('party-reward-item-select').value;
        const itemQty = parseInt(el('party-reward-item-qty').value) || 1;
        const resultEl = el('party-reward-result');
        const uids = Object.keys(lastData.participants || {});
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        if (!gold && !itemId) { resultEl.innerHTML = '<span style="color:#e74c3c;">Укажи золото или предмет.</span>'; return; }

        const sourceItem = itemId ? gmAllItemsByKey.get(itemId) : null; // O(1) вместо O(n) — см. loadGmItems
        const toStash = !!(el('party-reward-to-stash') && el('party-reward-to-stash').checked);
        const itemExtra = sourceItem ? gmItemExtraFromSource(sourceItem) : {};
        if (sourceItem && !gmAskChargeDays(itemExtra, sourceItem.name)) return;

        // Эпик 2.1: раньше награда уходила каждому игроку напрямую, теперь по умолчанию — в общий сундук отряда,
        // потому что группа сама решает, кому что нужно; галочка снята — старое поведение (всем поровну напрямую).
        if (toStash) {
            const ref = db.collection('sessions').doc(currentCode);
            const stashItem = sourceItem ? stripUndefinedDeep(Object.assign({ itemId: sourceItem.name, name: sourceItem.name, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemExtra)) : null;
            db.runTransaction(tx => tx.get(ref).then(doc => {
                const d = doc.data() || {};
                const upd = {};
                if (gold) upd.partyGold = (parseInt(d.partyGold) || 0) + gold;
                if (stashItem) {
                    const st = Array.isArray(d.partyStash) ? d.partyStash.slice() : [];
                    const ex = st.find(s => s.itemId === stashItem.itemId);
                    if (ex) ex.count = (ex.count || 0) + itemQty; else st.push(Object.assign({}, stashItem, { count: itemQty }));
                    upd.partyStash = st;
                }
                tx.update(ref, upd);
            })).then(() => {
                const parts = [];
                if (gold) parts.push(`${gold} золота`);
                if (sourceItem) parts.push(`${itemQty}× «${sourceItem.name}»`);
                resultEl.innerHTML = `<span style="color:#2ecc71;">✅ В сундук отряда: ${parts.join(' + ')}.</span>`;
                gmPostLogEntryText(`🎁 Мастер положил в сундук отряда: ${parts.join(' + ')}.`);
            }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
            return;
        }

        // Золото — атомарный FieldValue.increment(), а не "прочитать старое значение + прибавить
        // + записать целиком". Раньше тут читалось doc.data().gold (могло быть УСТАРЕВШИМ, если
        // игрок только что залутал труп — его автосохранение задерживается на 800мс) и писалось
        // поверх — если автосохранение игрока срабатывало ПОСЛЕ, оно перезаписывало это своим
        // локальным (тоже отстающим от выдачи мастера) значением. Инкремент не читает вообще —
        // Firestore сам прибавляет к тому, что там СЕЙЧАС, никакой гонки для золота больше нет.
        Promise.all(uids.map(uid => {
            const update = {};
            const addGold = () => gold ? gmAddGold(uid, gold) : null;
            if (!sourceItem) return addGold();
            // Предмет по-прежнему требует прочитать текущий инвентарь (нужно проверить, есть ли
            // уже такой стек) — тут гонка технически остаётся, но она намного уже без золота
            // в этой же операции, и out-of-band риск метаться отдельно от inventory игрока.
            return db.collection('characters').doc(uid).get().then(doc => {
                const data = doc.exists ? doc.data() : {};
                const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
                const invId = sourceItem.name; // см. gmGiveItemFromTable: itemId = название
                gmMergeInvItem(inv, { itemId: invId, name: sourceItem.name, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemQty, Object.assign({}, itemExtra));
                update.inventory = inv;
                return db.collection('characters').doc(uid).update(update);
            }).then(addGold);
        })).then(() => {
            const parts = [];
            if (gold) parts.push(`${gold} золота`);
            if (sourceItem) parts.push(`${itemQty}× «${sourceItem.name}»`);
            resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Выдано всем (${uids.length}): ${parts.join(' + ')}.</span>`;
            gmPostLogEntryText(`🎁 Мастер выдал всей группе: ${parts.join(' + ')}.`);
        }).catch(e => {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>';
        });
    };

    // ---------- Запросы на крафт (эпик 2.8) ----------
    // Заказ уходит игроку командой craftOrder через очередь pendingStatusEffects (как команды смерти) — GM не пишет в characters/{uid}.craftOrders напрямую,
    // чтобы не затереть/не быть затёртым автосохранением игрока.
    function renderCraftOrderSelects() {
        const holdSel = el('craft-order-hold');
        if (holdSel && window.holdsData && holdSel.options.length <= 1) holdSel.innerHTML = '<option value="">—</option>' + Object.keys(window.holdsData).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        const t = el('craft-order-target'); if (!t) return;
        const cur = t.value;
        const parts = lastData.participants || {};
        t.innerHTML = '<option value="all">Всем игрокам</option>' + Object.keys(parts).map(u => `<option value="${u}">${escapeHtml((parts[u] || {}).name || '?')}</option>`).join('');
        t.value = cur && (cur === 'all' || parts[cur]) ? cur : 'all';
    }
    window.filterCraftOrderItems = function () {
        const q = (el('craft-order-item-search').value || '').toLowerCase();
        const sel = el('craft-order-item-select');
        if (!q) { sel.innerHTML = '<option value="">— выбери предмет —</option>'; return; }
        const m = (gmAllItems || []).filter(i => (i.name || '').toLowerCase().includes(q)).slice(0, 30);
        sel.innerHTML = '<option value="">— выбери предмет —</option>' + m.map(i => `<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)} (${escapeHtml(i.category || '')})</option>`).join('');
    };
    window.sendCraftOrder = function () {
        const resultEl = el('craft-order-result');
        const npc = (el('craft-order-npc').value || '').trim();
        const itemName = el('craft-order-item-select').value;
        const qty = Math.max(1, parseInt(el('craft-order-qty').value) || 1);
        const reward = Math.max(0, parseInt(el('craft-order-reward').value) || 0);
        if (!npc || !itemName) { resultEl.innerHTML = '<span style="color:#e74c3c;">Укажи NPC и предмет.</span>'; return; }
        const target = el('craft-order-target').value;
        const uids = target === 'all' ? Object.keys(lastData.participants || {}) : [target];
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        const orderId = 'order_' + Date.now() + Math.random().toString(36).slice(2, 5);
        const cmd = { id: 'co-' + orderId, cmd: 'craftOrder', orderId, npc, hold: el('craft-order-hold').value || '', itemName, qty, reward, fromGm: true, shared: target === 'all' }; // «всем»: сдать может только первый
        const patch = {};
        uids.forEach(u => { patch['participants.' + u + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd); });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `📋 Заказ от ${npc}: ${qty}× ${itemName} → ${formatNumber(reward)} зол.${target === 'all' ? ' (всем — награду получит тот, кто сдаст первым)' : ''}` });
        db.collection('sessions').doc(currentCode).update(patch)
            .then(() => { resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Заказ отправлен (${uids.length}).</span>`; })
            .catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // ---------- Сундук отряда: отображение и «Раздать всем» (эпик 2.1) ----------
    function renderGmStash(data) {
        const g = el('gm-stash-gold'); if (!g) return;
        g.textContent = formatNumber(parseInt(data.partyGold) || 0);
        const items = [];
        (Array.isArray(data.partyStash) ? data.partyStash : []).forEach(s => {
            const same = typeof window.findSameStack === 'function' ? window.findSameStack(items, s) : null;
            if (same) same.count = (same.count || 0) + (s.count || 0); else items.push(Object.assign({}, s));
        });
        el('gm-stash-list').innerHTML = items.length
            ? items.map(i => `<div style="font-size:14px;">• ${escapeHtml(i.name)} × ${i.count}</div>`).join('')
            : '<span style="opacity:.6; font-size:13px;">Предметов нет.</span>';
    }
    window.gmStashDistribute = function () {
        const resultEl = el('gm-stash-result');
        const uids = Object.keys(lastData.participants || {});
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        const n = uids.length;
        const ref = db.collection('sessions').doc(currentCode);
        let plan = null;
        // Сначала транзакция ВЫЧИТАЕТ из сундука долю (чтобы игроки не успели забрать то же самое), потом раздаём по персонажам.
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.data() || {};
            const gold = parseInt(d.partyGold) || 0;
            const perGold = Math.floor(gold / n);
            const st = [];
            (Array.isArray(d.partyStash) ? d.partyStash : []).forEach(s => { // одинаковые зелья с разными itemId — одной стопкой
                const same = typeof window.findSameStack === 'function' ? window.findSameStack(st, s) : null;
                if (same) same.count = (same.count || 0) + (s.count || 0); else st.push(Object.assign({}, s));
            });
            const give = [];
            const rest = st.map(s => {
                const per = Math.floor((s.count || 0) / n);
                if (per > 0) give.push(Object.assign({}, s, { count: per }));
                return Object.assign({}, s, { count: (s.count || 0) - per * n });
            }).filter(s => s.count > 0);
            plan = { perGold, give };
            if (!perGold && !give.length) return;
            tx.update(ref, { partyGold: gold - perGold * n, partyStash: rest });
        })).then(() => {
            if (!plan || (!plan.perGold && !plan.give.length)) { resultEl.innerHTML = '<span style="color:#e6b800;">Делить нечего (на каждого меньше единицы).</span>'; return; }
            return Promise.all(uids.map(uid => {
                const cref = db.collection('characters').doc(uid);
                const upd = {};
                const addGold = () => plan.perGold ? gmAddGold(uid, plan.perGold) : null;
                if (!plan.give.length) return addGold();
                return cref.get().then(doc => {
                    const inv = Array.isArray((doc.data() || {}).inventory) ? doc.data().inventory.slice() : [];
                    // Заточенное/зачарованное — всегда своей строкой; остальное по правилам gmMergeInvItem
                    // (краденое «имя#stolen» не смешивается с чистым, обычное не ложится на заточенное).
                    plan.give.forEach(g => {
                        if (g.temperTier || g.enchantment) {
                            const it = Object.assign({}, g);
                            if (inv.some(i => i.itemId === it.itemId)) it.itemId = it.itemId + '#' + Date.now() + Math.floor(Math.random() * 1000);
                            inv.push(it);
                            return;
                        }
                        const extra = Object.assign({}, g); delete extra.itemId; delete extra.count;
                        gmMergeInvItem(inv, { itemId: g.itemId, name: g.name }, g.count, extra);
                    });
                    upd.inventory = stripUndefinedDeep(inv);
                    return cref.update(upd);
                }).then(addGold);
            })).then(() => {
                const parts = [];
                if (plan.perGold) parts.push(plan.perGold + ' зол.');
                plan.give.forEach(g => parts.push(g.count + '× ' + g.name));
                resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Роздано каждому (${n}): ${escapeHtml(parts.join(', '))}.</span>`;
                gmPostLogEntryText(`⚖ Мастер разделил сундук отряда поровну: каждому ${parts.join(', ')}.`);
            });
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // ---------- Разрешить атаку (НПС → игрок) ----------

    let pendingGmAttack = null; // { targetUid, dmg, logText }
    // Знак «Атронах»: успешное поглощение магии (спасбросок) полностью отменяет заклинание (решение мастера).
    const ATRONACH_ABSORB_NEGATES_SPELL = true;

    function parseSpellDamageForGm(desc) {
        if (!desc) return null;
        // [а-яёА-ЯЁ] вместо \w — та же кириллическая ловушка, что чинил в index.html.
        const m = desc.match(/нанос[а-яёА-ЯЁ]*\s+(\d+)\s*(?:ед\.?|единиц)?\s*(?:физ[а-яёА-ЯЁ]*\s+|огненн[а-яёА-ЯЁ]*\s+|ледян[а-яёА-ЯЁ]*\s+|электрич[а-яёА-ЯЁ]*\s+|яд[а-яёА-ЯЁ]*\s+)?урон/i) ||
                  desc.match(/(\d+)\s*(?:ед\.?|единиц)?\s*(?:физ[а-яёА-ЯЁ]*\s+)?урон/i);
        return m ? parseInt(m[1]) : null;
    }

    // Перенесено выше populateGmAttackSelects — раньше стояло НИЖЕ, но populateGmAttackSelects
    // (вызывается из renderAll на каждый снапшот сессии, в т.ч. самый первый при загрузке
    // страницы) звало onGmAttackAttackerPicked() ДО того, как этот window.-присвоение вообще
    // успевало выполниться построчно сверху вниз — ReferenceError "is not defined", и весь
    // остаток инициализации после этой строки просто не происходил.
    // Заклинания врага, которые НЕ атакуют игрока: лечение (dmg — сколько лечит), невидимость, обереги/броня, призыв.
    // Раньше они шли как атака: «Быстрое лечение» на 50 снимало игроку 50 ХП.
    const ENEMY_HEAL_DEFAULT = { 'Лечение': 20, 'Быстрое лечение': 50, 'Исцеление': 50 };
    function gmEnemySupportSpell(s) {
        const n = String((s && s.name) || '').toLowerCase();
        if (/лечени|исцелени|восстановлени/.test(n)) return 'heal';
        if (/невидим/.test(n)) return 'invis';
        // Страх/Ярость/Успокоение — не на себя: накладываются на цель как статус (раньше считались кастом на себя и до игрока не доходили).
        if (/оберег|броня|плоть|кож[аи]|призыв|вызов|оживлени|поднят|ускорени|плащ/.test(n) && !(s.dmg > 1)) return 'self'; // «Морозный плащ» без урона — бафф на себя
        return null;
    }
    // Статус, который управляющее заклинание врага вешает на игрока.
    function gmEnemyControlStatus(s) {
        const n = String((s && s.name) || '').toLowerCase();
        if (s && s.dmg > 1) return '';
        if (/страх|бегств|отпугиван/.test(n)) return 'fear';
        if (/ярост|бешенств/.test(n)) return 'frenzy';
        if (/успокоени|умиротворени/.test(n)) return 'calm';
        return '';
        return null;
    }
    // Мана врага: заклинание стоит cost МП. Если у врага ведётся мана (maxMp > 0), без маны — не кастует.
    function gmEnemyPayMana(enemy, cost) {
        if (!cost || !(enemy.maxMp > 0) || typeof enemy.curMp !== 'number') return { ok: true, tracked: false };
        if (enemy.curMp < cost) return { ok: false };
        const enemies = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curMp: e.curMp - cost }) : e);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
        return { ok: true, tracked: true, left: enemy.curMp - cost };
    }
    // Атакующее заклинание: при броске только проверяем, хватает ли маны; списываем при «Применить» (gmChargePendingMana) —
    // раньше каждый переброс той же атаки снова снимал МП.
    function gmEnemyManaCheck(enemy, cost) {
        if (!cost || !(enemy.maxMp > 0) || typeof enemy.curMp !== 'number') return { ok: true, tracked: false };
        if (enemy.curMp < cost) return { ok: false };
        return { ok: true, tracked: true, left: enemy.curMp - cost };
    }
    function gmChargePendingMana(pa) {
        if (!pa || !pa.manaDue) return;
        const en = (lastData.enemies || []).find(e => e.id === pa.enemyId);
        if (en) gmEnemyPayMana(en, Math.min(pa.manaDue, typeof en.curMp === 'number' ? en.curMp : pa.manaDue));
        pa.manaDue = 0;
    }
    window.onGmAttackAttackerPicked = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const actionSelect = el('gm-attack-action-select');
        if (!actionSelect) return;
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        if (!enemy) { actionSelect.innerHTML = '<option value="">—</option>'; return; }
        let opts = '';
        if (enemy.weaponDmg) opts += `<option value="weapon">Оружие (${enemyWeaponDamage(enemy).total} урона${enemy.weaponNote ? ' — ' + escapeHtml(enemy.weaponNote) : ''})</option>`;
        (enemy.spells || []).forEach((s, i) => {
            const sup = gmEnemySupportSpell(s);
            const ctl = sup ? '' : gmEnemyControlStatus(s);
            opts += `<option value="spell:${i}">${escapeHtml(s.name)} (${sup ? (sup === 'heal' ? 'на себя: лечит ' + (s.dmg || 0) : 'на себя') : ctl ? 'на цель: ' + GM_STATUS_EFFECTS[ctl].name : (s.dmg || 0) + ' урона'} / ${s.cost || 0} МП)</option>`;
        });
        (enemy.shouts || []).forEach((s, i) => {
            opts += `<option value="shout:${i}">🗣️ ${escapeHtml(s.name)} (эффект, без прямого урона)</option>`;
        });
        actionSelect.innerHTML = opts || '<option value="">У этого противника нет известных действий — впиши урон вручную в журнал</option>';
    };

    function populateGmAttackSelects() {
        const attackerSelect = el('gm-attack-attacker-select');
        const targetSelect = el('gm-attack-target-select');
        if (!attackerSelect || !targetSelect) return;
        const enemies = (lastData.enemies || []).filter(e => (e.curHp || 0) > 0);
        const prevAtk = attackerSelect.value;
        attackerSelect.innerHTML = enemies.length
            ? enemies.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (HP ${e.curHp}/${e.maxHp})</option>`).join('')
            : '<option value="">Нет живых противников</option>';
        if (enemies.some(e => e.id === prevAtk)) attackerSelect.value = prevAtk;

        const uids = Object.keys(lastData.participants || {});
        const prevTgt = targetSelect.value;
        // Цели: игроки, их призванные существа (summon:uid:id) и животные (pet:uid:id).
        const tgtOpts = [];
        uids.forEach(uid => {
            const p = lastData.participants[uid] || {};
            tgtOpts.push(`<option value="${uid}">${escapeHtml(p.name || uid)}</option>`);
            (p.summons || []).filter(sm => (sm.curHp || 0) > 0).forEach(sm => tgtOpts.push(`<option value="summon:${uid}:${escapeHtml(sm.id)}">　👻 ${escapeHtml(sm.name)} (${escapeHtml(p.name || uid)}, HP ${sm.curHp}/${sm.maxHp})</option>`));
            (p.pets || []).filter(pt => (pt.hp || 0) > 0).forEach(pt => tgtOpts.push(`<option value="pet:${uid}:${escapeHtml(pt.id)}">　${escapeHtml(pt.icon || '🐾')} ${escapeHtml(pt.name)} (${escapeHtml(p.name || uid)}, HP ${pt.hp}/${pt.maxHp})</option>`));
        });
        targetSelect.innerHTML = tgtOpts.length ? tgtOpts.join('') : '<option value="">Нет игроков в сессии</option>';
        if (Array.from(targetSelect.options).some(o => o.value === prevTgt)) targetSelect.value = prevTgt;

        onGmAttackAttackerPicked();
    }
    window.populateGmAttackSelects = populateGmAttackSelects; // для боевой сетки (кнопка «Цель для атаки противника»)

    // Цель атаки врага: игрок (uid) или его существо — 'summon:uid:id' (призванное) / 'pet:uid:id' (животное).
    function gmResolveAttackTarget(val) {
        const m = /^(summon|pet):([^:]+):(.+)$/.exec(String(val || ''));
        const parts = (lastData && lastData.participants) || {};
        if (!m) return { kind: 'player', uid: val, name: (parts[val] || {}).name || val };
        const owner = parts[m[2]] || {};
        const list = m[1] === 'summon' ? (owner.summons || []) : (owner.pets || []);
        const c = list.find(x => x.id === m[3]);
        return { kind: m[1], uid: m[2], id: m[3], ownerName: owner.name || m[2], comp: c || null, name: c ? c.name : '?' };
    }

    window.rollGmAttack = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const tgt = gmResolveAttackTarget(el('gm-attack-target-select').value);
        const targetUid = tgt.uid;
        const actionVal = el('gm-attack-action-select').value;
        const resultBox = el('gm-attack-roll-result');
        const textEl = el('gm-attack-roll-text');
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        const targetName = tgt.kind === 'player' ? tgt.name : tgt.name + ' (' + tgt.ownerName + ')';
        if (!enemy || !targetUid || !actionVal) { alert('Выбери атакующего, цель и действие.'); return; }
        if (tgt.kind !== 'player' && !tgt.comp) { alert('Этого существа уже нет — обнови список целей.'); populateGmAttackSelects(); return; }
        if (actionVal.indexOf('spell:') === 0) {
            const hands = gmEnemyHands(enemy);
            if (hands === 'two' || hands === 'both') { alert(`«${enemy.name}» не может колдовать: в руках ${GM_HANDS_LABEL[hands].replace(/^\S+\s/, '')}. Смени у врага «В руках» на «руки свободны» или «одно одноручное» — это его действие в этом ходу.`); return; }
        }
        if (actionVal === 'weapon' && gmEnemyHands(enemy) === 'free' && enemy.weaponDmg && !confirm(`У «${enemy.name}» руки свободны (оружие убрано). Всё равно атаковать оружием?`)) return;
        const enemyFlags = window.StCombat.statusFlags(enemy);
        { const blk = enemyFlags.noAttack;
          if (blk) { alert('«' + enemy.name + '» не может атаковать: ' + blk.name + (blk.turns ? ' (ещё ' + blk.turns + ' х.)' : '') + '. Сними статус, если нужно разрешить атаку.'); return; } }

        // Боевая сетка: досягаемость/видимость врага и штраф за дальность (если оба стоят на сетке)
        let gridChk = null;
        if (window.GridCore && lastData.grid) {
            const Gc = window.GridCore;
            const mode = actionVal === 'weapon' ? (enemy.isRanged ? 'ranged' : 'melee') : actionVal.indexOf('spell:') === 0 ? 'spell' : null;
            if (mode) {
                const reach = /копь|пик[аи]|посох|молот|алебард/i.test(String(enemy.weaponNote || '') + ' ' + enemy.name) ? 10 : 5;
                const tgtTok = tgt.kind === 'player' ? Gc.tokenOf(lastData.grid, 'p', targetUid) : Gc.tokenOf(lastData.grid, 's', tgt.id, targetUid); // существо на сетке — фигура 's'
                gridChk = Gc.attackCheck(lastData.grid, Gc.tokenOf(lastData.grid, 'e', enemy.id), tgtTok, mode, reach);
                if (gridChk.onGrid && !gridChk.ok && !confirm('«' + enemy.name + '» не достаёт «' + targetName + '»: ' + gridChk.reason + '.\n\nВсё равно атаковать?')) return;
            }
        }
        let dmg = 0, dmgType = 'physical', actionLabel = '', atkMod = 0, dmgBreakdown = '';
        let isSpellAttack = false, spellCost = 0, statusNote = '', physShot = false;
        if (actionVal === 'weapon') {
            const wd = enemyWeaponDamage(enemy);
            dmg = wd.total;
            // Статусы от зелий/ядов на самом враге: «Увеличение физ.урона» (+%) и «Повреждение наносимого физ.урона» (−N).
            let stPct = 0, stFlat = 0;
            (enemy.statusEffects || []).forEach(s => { stPct += s.dmgPct || 0; stFlat += s.dmgFlat || 0; });
            if (stPct) dmg = Math.round(dmg * (1 + stPct / 100));
            if (stFlat) dmg = Math.max(0, dmg + stFlat);
            if (stPct || stFlat) statusNote = ` (эффекты на враге: ${stPct ? '+' + stPct + '%' : ''}${stPct && stFlat ? ', ' : ''}${stFlat ? stFlat : ''})`;
            dmgBreakdown = (wd.stat ? ` (оружие ${wd.base} + ${wd.label} ${wd.stat})` : '') + statusNote;
            actionLabel = 'оружием';
            // Модификатор атаки — СИЛ для ближнего, ЛОВ для дальнего (если у противника вообще
            // есть характеристики — генератор бандитов их теперь даёт, база enemies-data.js нет,
            // тогда 0). Тот же принцип, что у самого игрока: атакующий с модификатором против
            // ГОЛОГО броска защищающегося.
            atkMod = enemy.isRanged ? calcAbilityMod(enemy.dex || 10) : calcAbilityMod(enemy.str || 10);
            if (enemy.isRanged && gmWeatherRanged()) { atkMod += gmWeatherRanged(); actionLabel += ` (погода ${gmWeatherRanged()})`; } // дождь/гроза/метель/туман мешают и вражеским стрелкам
        } else if (actionVal.indexOf('spell:') === 0) {
            const s = enemy.spells[parseInt(actionVal.slice(6))];
            const costS = s ? (parseInt(s.cost) || 0) : 0;
            const sup = gmEnemySupportSpell(s);
            const pay = sup ? gmEnemyPayMana(enemy, costS) : gmEnemyManaCheck(enemy, costS); // заклинание на себя срабатывает сразу
            if (!pay.ok) { alert(`У «${enemy.name}» не хватает маны на «${s.name}»: нужно ${costS}, есть ${enemy.curMp}.`); return; }
            if (sup) { // заклинание на себя — не атака по игроку
                const parts = [];
                if (sup === 'heal') {
                    // У шаманов в таблице лечение без числа (0) — берём базовое значение заклинания игрока (spell-data: Лечение 20, Быстрое лечение 50).
                    const healAmt = parseInt(s.dmg) || ENEMY_HEAL_DEFAULT[s.name] || 0;
                    const healed = Math.max(0, Math.min((enemy.maxHp || 0) - (enemy.curHp || 0), healAmt));
                    const after = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curHp: (e.curHp || 0) + healed, curMp: pay.tracked ? pay.left : e.curMp }) : e);
                    gmUpdateEnemies(after).catch(e => console.error(e));
                    parts.push(`восстанавливает ${healed} ХП`);
                } else if (sup === 'invis') {
                    const after = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curMp: pay.tracked ? pay.left : e.curMp, statusEffects: (e.statusEffects || []).filter(x => x.name !== 'Невидимость').concat([{ id: 'st' + Date.now(), name: 'Невидимость', desc: 'не виден, пока не атакует', turns: 3 }]) }) : e);
                    gmUpdateEnemies(after).catch(e => console.error(e));
                    parts.push('становится невидимым');
                } else parts.push('колдует на себя');
                gmPostLogEntryText(`✨ ${enemy.name}: «${s.name}» — ${parts.join(', ')}${pay.tracked ? ` (−${costS} МП, осталось ${pay.left})` : ''}.`);
                return;
            }
            dmg = s ? s.dmg : 0;
            dmgType = mapEnemyDmgType(s ? s.name : '');
            // «Дальний выстрел» сферы — физический выстрел (болт), не заклинание: без поглощения магии и оберегов, мод. Ловкости.
            physShot = /^дальний выстрел/i.test((s && s.name) || '');
            isSpellAttack = !physShot; spellCost = physShot ? 0 : costS;
            if (pay.tracked) statusNote = ` (−${costS} МП, осталось ${pay.left})`;
            actionLabel = physShot ? `выстрелом «${s.name}»${statusNote}` : `заклинанием «${s ? s.name : '?'}»${statusNote}`;
            atkMod = physShot ? calcAbilityMod(enemy.dex || 10) : calcAbilityMod(enemy.int || 10);
        } else if (actionVal.indexOf('shout:') === 0) {
            const s = enemy.shouts[parseInt(actionVal.slice(6))];
            dmg = 0;
            actionLabel = `криком «${s ? s.name : '?'}» (${s ? s.effect : ''})`;
        }

        // Встречный бросок 2д20 — как и у самой атаки игрока: атакующий (враг) кидает 1д20+мод,
        // защищающийся (игрок) — голый 1д20, ничья не считается ни попаданием ни промахом (перекид
        // обеих костей). Раньше тут был просто один голый d20 без всякого сравнения — по сути,
        // "бросок ради галочки", не влиявший ни на что.
        // «Бардовская баллада» (играет другой игрок): защищающемуся +1 к кубам.
        const defBonus = (tgt.kind === 'player' && lastData.bardSong && lastData.bardSong.uid && lastData.bardSong.uid !== targetUid) ? 1 : 0;
        if (gridChk && gridChk.onGrid && gridChk.penalty) { atkMod += gridChk.penalty; actionLabel += ` (дальность ${gridChk.feet} фт: ${gridChk.penalty})`; }
        else if (gridChk && gridChk.onGrid) actionLabel += ` (${gridChk.feet} фт)`;
        if (enemyFlags.rollPenalty) { atkMod += enemyFlags.rollPenalty; actionLabel += ` (статусы на враге: ${enemyFlags.rollPenalty} к кубам)`; }
        if (enemyFlags.frenzy) actionLabel += ` (🌀 «${enemyFlags.frenzy.name}»: бьёт любую цель, включая своих)`;
        let enemyRoll, enemyTotal, playerRoll, rerolls = 0;
        do {
            enemyRoll = Math.floor(Math.random() * 20) + 1;
            enemyTotal = enemyRoll + atkMod;
            playerRoll = Math.floor(Math.random() * 20) + 1;
            if (enemyTotal !== playerRoll + defBonus) break;
            rerolls++;
        } while (rerolls < 20);
        const hit = enemyTotal > playerRoll + defBonus;
        const playerRollShown = playerRoll + (defBonus ? ' +1 (🎵 баллада) = ' + (playerRoll + defBonus) : '');

        let statusKey = el('gm-attack-status-select') ? el('gm-attack-status-select').value : '';
        if (!statusKey && actionVal.indexOf('spell:') === 0) statusKey = gmEnemyControlStatus(enemy.spells[parseInt(actionVal.slice(6))]);

        pendingGmAttack = {
            targetUid, enemyId: enemy.id, dmg: hit ? dmg : 0, dmgType, statusKey: hit ? statusKey : '', enemyName: enemy.name, targetName, hit,
            targetKind: tgt.kind, compId: tgt.id || null, // существо игрока: урон идёт ему, а не хозяину
            isRangedAtk: (actionVal === 'weapon' && !!enemy.isRanged) || physShot,
            enemyUndeadDaedra: (enemy.kind === 'undead' || enemy.kind === 'daedra' || /скелет|драугр|нежить|привед|зомби|вампир|гончая смерти|жрец-дракон|дремора|атронах|даэдр/i.test(enemy.name || '')),
            isSpell: !!(hit && isSpellAttack), spellCost,
            manaDue: (isSpellAttack && spellCost && enemy.maxMp > 0 && typeof enemy.curMp === 'number') ? spellCost : 0, // мана — при «Применить», и при промахе тоже
            // Теги болезни (carrierOfDisease/diseaseChance) — для автоматического броска на
            // заражение при попадании физической атакой, см. applyGmAttackDamage.
            carrierOfDisease: hit ? gmEnemyDisease(enemy).name : null, diseaseChance: hit ? gmEnemyDisease(enemy).chance : 0,
            logTextBase: `👹 ${enemy.name} атакует ${targetName} ${actionLabel}: враг ${enemyTotal} (к20 ${enemyRoll}${atkMod >= 0 ? '+' : ''}${atkMod}) vs ${tgt.kind === 'player' ? 'игрок' : 'существо'} ${playerRollShown}${rerolls ? ` (перекид ×${rerolls})` : ''} — ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'}`
        };
        textEl.innerHTML = `<strong>${escapeHtml(enemy.name)}</strong> атакует <strong>${escapeHtml(targetName)}</strong> ${actionLabel}<br>` +
            `Враг: 1d20 (${enemyRoll}) ${atkMod >= 0 ? '+' : ''}${atkMod} = <strong style="color:var(--accent-color, #c9a86c);">${enemyTotal}</strong> vs ${tgt.kind === 'player' ? 'Игрок' : 'Существо'}: 1d20 = <strong style="color:var(--accent-color, #c9a86c);">${playerRollShown}</strong>${rerolls ? `<br><span style="opacity:.7;">Перекид из-за ничьей: ×${rerolls}</span>` : ''}<br>` +
            (!hit ? `<strong style="color:#7a7a7a;">❌ Промах — урона нет.</strong>` :
                dmg ? `<strong style="color:#2ecc71;">✅ Попадание!</strong> Базовый урон: <span style="color:#e74c3c; font-size:16px; font-weight:bold;">${dmg}</span> ед.${dmgBreakdown} (резист цели вычтется автоматически при применении)` :
                    `<strong style="color:#2ecc71;">✅ Попадание!</strong> <span style="opacity:.7;">${statusKey && GM_STATUS_EFFECTS[statusKey] ? 'Без урона — при применении на цель ляжет «' + GM_STATUS_EFFECTS[statusKey].name + '».' : 'Эффект без прямого урона — примени вручную по описанию.'}</span>`);
        resultBox.style.display = 'block';
        if (typeof window.previewGmAttack === 'function') window.previewGmAttack();
    };

    // Заклинания в enemies-data.js не хранят тип урона отдельно — определяем по названию.
    function mapEnemyDmgType(spellName) {
        const n = (spellName || '').toLowerCase();
        // Те же исключения, что на листе игрока (detectDmgTypeFromName): стихия не видна по слову в названии.
        if (/^(пламя|клыки дракона|испепеление|запретное солнце|болид|паровое дыхание|взрыв при гибели)/.test(n)) return 'fire'; // пар и взрыв двемерских машин — огонь
        if (/^дальний выстрел/.test(n)) return 'physical'; // двемерская сфера стреляет болтом
        if (/^(обморожение|надлом)/.test(n)) return 'frost';
        if (/^(искры|нестабильное напряжение|раскаты грома)/.test(n)) return 'shock';
        if (/огн|пламен/.test(n)) return 'fire';
        if (/лед|мороз|холод/.test(n)) return 'frost';
        if (/молни|гроз|электр/.test(n)) return 'shock';
        if (/яд|отрав/.test(n)) return 'poison';
        return 'magic';
    }

    // Вермина (2–3): если враг атакует последователя, с шансом 10/20% (д100) он в страхе на 3 хода.
    function gmVerminaFearCheck(targetUid, enemyId, enemyName) {
        if (!currentCode || !enemyId) return;
        db.collection('characters').doc(targetUid).get().then(doc => {
            const chance = ((doc.exists && doc.data().godGM) || {}).fearChance || 0;
            if (!chance) return;
            const r = 1 + Math.floor(Math.random() * 100);
            if (r <= 100 - chance) return;
            const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? { ...e, statusEffects: [...(e.statusEffects || []).filter(x => x.name !== 'Страх (Вермина)'), { id: 'vrm-' + Date.now(), name: 'Страх (Вермина)', desc: 'Бежит в ужасе — не атакует', turns: 3, noAttack: true }] } : e);
            return gmUpdateEnemies(enemies).then(() => gmPostLogEntryText(`😱 Вермина: «${enemyName}» напал(а) на её последователя и в ужасе бежит 3 хода (д100 = ${r}).`));
        }).catch(e => console.error(e));
    }

    // Урон по существу игрока. Призванное: защита — ауры призыва хозяина (participants.<uid>.summons[].res, броня 10 ед. = 1%).
    // Животное: своей защиты нет. Статусы, болезни и защиты хозяина (щит, барьер, боги) на существо не действуют.
    function gmCompanionDamage(pa) {
        const owner = ((lastData && lastData.participants) || {})[pa.targetUid] || {};
        const isSummon = pa.targetKind === 'summon';
        const comp = (isSummon ? (owner.summons || []) : (owner.pets || [])).find(x => x.id === pa.compId) || null;
        const resist = isSummon && comp ? Math.max(0, Math.min(85, parseInt((comp.res || {})[pa.dmgType]) || 0)) : 0;
        const finalDmg = Math.max(0, Math.round((pa.dmg || 0) * (1 - resist / 100)));
        const hpNow = comp ? (parseInt(isSummon ? comp.curHp : comp.hp) || 0) : 0;
        return { comp, isSummon, resist, finalDmg, hpNow, left: Math.max(0, hpNow - finalDmg), maxHp: comp ? comp.maxHp : 0, owner };
    }
    function gmApplyAttackToCompanion() {
        const pa = pendingGmAttack;
        const cd = gmCompanionDamage(pa);
        const done = logExtra => {
            gmPostLogEntryText(pa.logTextBase + logExtra + '.');
            alert('Применено.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
        };
        if (!cd.comp) { alert('Этого существа уже нет в сессии.'); return; }
        if (!pa.dmg) { done(pa.statusKey ? ` (статус «${(GM_STATUS_EFFECTS[pa.statusKey] || {}).name || pa.statusKey}» на существо не ложится — учти вручную)` : ''); return; }
        const patch = {};
        let logExtra = `, урон ${cd.finalDmg}${cd.resist ? ` (защита существа ${cd.resist}%, было бы ${pa.dmg})` : ''}`;
        if (cd.isSummon) {
            // Хозяин применяет удар у себя (то же, что удар руны по существу): ХП, смерть, возврат костей/оружия.
            patch['participants.' + pa.targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'sh-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'aoeHit', dmg: cd.finalDmg, dmgType: pa.dmgType, summonId: pa.compId, final: true, from: pa.enemyName });
            // сразу показать мастеру новое ХП (лист хозяина пришлёт точное значение при синхронизации)
            patch['participants.' + pa.targetUid + '.summons'] = (cd.owner.summons || []).map(x => x.id === pa.compId ? Object.assign({}, x, { curHp: cd.left }) : x).filter(x => x.id !== pa.compId || cd.left > 0);
            patch['participants.' + pa.targetUid + '.summonNames'] = patch['participants.' + pa.targetUid + '.summons'].map(x => x.name);
        } else {
            patch['participants.' + pa.targetUid + '.pets'] = (cd.owner.pets || []).map(x => x.id === pa.compId ? Object.assign({}, x, { hp: cd.left }) : x).filter(x => x.id !== pa.compId || cd.left > 0);
        }
        if (cd.left <= 0) logExtra += `, 💀 «${cd.comp.name}» ${cd.isSummon ? 'погибает и исчезает' : 'погибает'}`;
        else logExtra += ` (HP ${cd.left}/${cd.maxHp})`;
        if (pa.statusKey) logExtra += ` (статус «${(GM_STATUS_EFFECTS[pa.statusKey] || {}).name || pa.statusKey}» на существо не ложится — учти вручную)`;
        const chores = [db.collection('sessions').doc(currentCode).update(patch)];
        if (!cd.isSummon) chores.push(db.collection('characters').doc(pa.targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-pa' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId: pa.compId, delta: -cd.finalDmg }) }));
        Promise.all(chores).then(() => done(logExtra)).catch(e => alert('Ошибка: ' + e.message));
    }

    window.applyGmAttackDamage = function () {
        if (!pendingGmAttack) return;
        gmChargePendingMana(pendingGmAttack);
        // «Невидимость» врага: «не виден, пока не атакует» — атака её снимает
        { const atk = (lastData.enemies || []).find(e => e.id === pendingGmAttack.enemyId);
          if (atk && (atk.statusEffects || []).some(x => x && x.name === 'Невидимость'))
              gmUpdateEnemies((lastData.enemies || []).map(e => e.id === atk.id ? Object.assign({}, e, { statusEffects: (e.statusEffects || []).filter(x => !(x && x.name === 'Невидимость')) }) : e)).catch(e => console.error(e)); }
        if (pendingGmAttack.targetKind && pendingGmAttack.targetKind !== 'player') { gmApplyAttackToCompanion(); return; }
        const { targetUid, dmg, dmgType, statusKey, logTextBase, targetName } = pendingGmAttack; // раньше targetName здесь не доставался — ниже, в ветке заражения болезнью, был ReferenceError
        gmVerminaFearCheck(targetUid, pendingGmAttack.enemyId, pendingGmAttack.enemyName);
        if (!dmg && !statusKey) {
            gmPostLogEntryText(logTextBase + '.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
            return;
        }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const ir = gmPlayerIncomingResist(data, dmgType, { shieldBlock: gmShieldBlockChecked(), isRangedAtk: pendingGmAttack.isRangedAtk });
            const resist = ir.resist;
            let finalDmg = (dmg && !ir.zero) ? Math.max(0, Math.round(dmg * (1 - resist / 100))) : 0;
            const defNotes = ir.notes.filter(n => /Отбивание|Защита от стихий|сопр\. магии/.test(n));
            { // Бонусы богов игрока: Стендарр — резист урону от даэдра/нежити; Дибелла — шанс поглотить заклинание; Азура — игнор урона заклинаний
                const gg = data.godGM || {};
                if (finalDmg && gg.daedraUndeadResist && pendingGmAttack.enemyUndeadDaedra) {
                    const cutG = Math.round(finalDmg * gg.daedraUndeadResist / 100);
                    finalDmg = Math.max(0, finalDmg - cutG);
                    defNotes.push('🕊 Бог: резист урону от даэдра/нежити ' + gg.daedraUndeadResist + '% (−' + cutG + ')');
                }
                if (finalDmg && pendingGmAttack.isSpell && gg.spellAbsorb && Math.random() * 100 < gg.spellAbsorb) {
                    finalDmg = 0; defNotes.push('🌸 Дибелла: заклинание поглощено (' + gg.spellAbsorb + '%)');
                }
                if (finalDmg && pendingGmAttack.isSpell && gg.ignoreMagicDmg) {
                    const cutA = Math.min(finalDmg, gg.ignoreMagicDmg);
                    finalDmg -= cutA; defNotes.push('🌙 Азура: −' + cutA + ' урона заклинания');
                }
            }
            { // «Вихревой плащ»: часть урона стрел и болтов игнорируется
                const cloakEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.rangedResist && x.turnsRemaining !== 0);
                if (finalDmg && dmgType === 'physical' && pendingGmAttack.isRangedAtk && cloakEff) {
                    const cut = Math.round(finalDmg * cloakEff.rangedResist / 100);
                    finalDmg = Math.max(0, finalDmg - cut);
                    defNotes.push('🌪 «Вихревой плащ» игнорирует ' + cloakEff.rangedResist + '% урона стрелы/болта (−' + cut + ')');
                }
            }
            let spellNegated = false, absorbedMp = 0;
            // Знак «Атронах» (Sistema 2.2): когда игрок — цель заклинания, спасбросок д20 против сложности 15 − мод. Мудрости;
            // успех — игрок поглощает магию заклинания (очки магии = четверть стоимости заклинания).
            if (pendingGmAttack.isSpell && data.sign === 'atronach') {
                const wisE = (data.effectiveStats && data.effectiveStats.wis) || 10;
                const dc = 15 - calcAbilityMod(wisE);
                const saveRoll = 1 + Math.floor(Math.random() * 20);
                if (saveRoll >= dc) {
                    absorbedMp = Math.max(1, Math.floor((pendingGmAttack.spellCost || 0) / 4));
                    if (ATRONACH_ABSORB_NEGATES_SPELL) { spellNegated = true; finalDmg = 0; }
                    defNotes.push(`🌀 Атронах поглощает магию: спасбросок ${saveRoll} ≥ ${dc} → +${absorbedMp} маны${ATRONACH_ABSORB_NEGATES_SPELL ? ', заклинание не действует' : ''}`);
                } else {
                    defNotes.push(`🌀 Атронах: спасбросок ${saveRoll} < ${dc} — магия не поглощена`);
                }
            }
            // Вещи с «поглощением магии» (Роба архимага и т.п.): шанс N% поглотить заклинание — урона нет, мана = стоимость заклинания.
            const gsA = data.gearSpecial || {};
            if (pendingGmAttack.isSpell && !spellNegated && gsA.magicAbsorbPct > 0 && Math.random() * 100 < gsA.magicAbsorbPct) {
                spellNegated = true; finalDmg = 0;
                const gotMp = Math.max(1, parseInt(pendingGmAttack.spellCost) || 0);
                absorbedMp += gotMp;
                defNotes.push(`🌀 Поглощение магии (${gsA.magicAbsorbPct}%): заклинание поглощено, +${gotMp} маны`);
            }
            // «Повышение навыка» (зачарования/зелья): Блокирование — N% шанс поглотить физ. урон; Лёгкая броня — (N/2)% уклониться.
            if (finalDmg && dmgType === 'physical') {
                const boosts = data.skillBoosts || {};
                // Блок — только щитом; стрелу щитом отбивают только с перком «Отбивание стрел».
                const hasShieldB = !!(data.equippedSlots && data.equippedSlots.shield);
                const arrowOk = !pendingGmAttack.isRangedAtk || !!((data.perkStates || {})['skill3-perk1-step1']);
                const blockPct = (hasShieldB && arrowOk) ? (boosts['блокирование'] || 0) : 0;
                const dodgePct = (boosts['легкая броня'] || 0) / 2;
                if (blockPct > 0 && Math.random() * 100 < blockPct) { defNotes.push(`🛡️ Блок (${blockPct}%) — урон поглощён`); finalDmg = 0; }
                else if (dodgePct > 0 && Math.random() * 100 < dodgePct) { defNotes.push(`💨 Уклонение (${dodgePct}%) — атака мимо`); finalDmg = 0; }
            }
            // Знак «Лорд» — «Родство с троллями» (Sistema 2.2): весь получаемый урон огнём увеличивается на 2d6.
            // (Прежнее «Берсерк: урон ×½» убрано — в документе у Берсерка временные ХП и преимущество, а не защита.)
            let berserkNote = '';
            if (finalDmg && dmgType === 'fire' && data.sign === 'lord') {
                const t1 = 1 + Math.floor(Math.random() * 6), t2 = 1 + Math.floor(Math.random() * 6);
                finalDmg += t1 + t2;
                berserkNote = ` (🔥 Родство с троллями: +2d6 = ${t1 + t2})`;
            }
            // Задача L: вампир получает удвоенный урон, если сейчас "День" в сессии — раньше
            // это было только текстовым предупреждением в интерфейсе, урон не менялся.
            let mistNote = '';
            if (finalDmg && (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).some(x => x && (x.powerFlag === 'mist' || x.powerFlag === 'petrify') && x.turnsRemaining !== 0)) {
                finalDmg = 0; mistNote = ' (🌫 урон не проходит: туман или окаменение)';
            }
            let sunNote = '';
            if (finalDmg && data.supernaturalState && data.supernaturalState.vampirism && lastData.timePeriod === 'День') {
                finalDmg *= 2;
                sunNote = ' (☀️ уязвимость вампира к солнцу — урон ×2)';
            }
            const chores = [];
            // Оберег (Восстановление): поглощает урон ЗАКЛИНАНИЙ из своего запаса. С перком «Оберег-поглотитель»
            // половина поглощённого уходит игроку в ману. Запас уменьшается командой в лист игрока (gmCmds 'wardHit').
            let wardGainMp = 0;
            if (finalDmg > 0 && pendingGmAttack.isSpell) {
                const wEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.ward && (x.ward.left || 0) > 0 && x.turnsRemaining !== 0);
                if (wEff) {
                    const absorbed = Math.min(finalDmg, parseInt(wEff.ward.left) || 0);
                    finalDmg -= absorbed;
                    const absorbPerk = !!((data.perkStates || {})['skill11-perk7-step1']);
                    if (absorbPerk) { wardGainMp = Math.floor(absorbed / 2); absorbedMp = (absorbedMp || 0) + wardGainMp; } // мана — тем же путём, что «Атронах»
                    defNotes.push(`🔰 Оберег «${wEff.name}»: поглощено ${absorbed}${absorbPerk ? `, +${wardGainMp} маны («Оберег-поглотитель»)` : ''}`);
                    chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'wardHit', effId: wEff.id || null, name: wEff.name, absorbed }) }).catch(() => { }));
                }
            }
            // «Перчатки Хранителя»: в защитной стойке барьер поглощает урон из запаса (350 в день). Запас уменьшается командой в лист игрока.
            if (finalDmg > 0 && gsA.keeperBarrier > 0) {
                const absK = Math.min(finalDmg, parseInt(gsA.keeperBarrier) || 0);
                finalDmg -= absK;
                defNotes.push(`🛡 Барьер Перчаток Хранителя: поглощено ${absK} (осталось ${gsA.keeperBarrier - absK})`);
                chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'keeperBarrierHit', absorbed: absK }) }).catch(() => { }));
            }
            // «Контрудар» (Одноручное): попадания по игроку считаются по врагу — +1 к кубам за каждые 2 до его смерти (счёт в листе игрока).
            if ((data.perkStates || {})['skill0-perk5-step1'] && pendingGmAttack.enemyId) {
                chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'hitTaken', enemyId: pendingGmAttack.enemyId }) }).catch(() => { }));
            }
            // Верхом (лист игрока: riding + живая лошадь): 70% урона принимает лошадь, 30% — всадник.
            // ХП лошади меняется командой в лист игрока (gmCmds), как и другие правки мастера.
            let horseNote = '';
            if (finalDmg > 0 && data.riding && Array.isArray(data.pets)) {
                const horse = data.pets.find(pp => pp && pp.rideable && !pp.dead);
                if (horse) {
                    const share = (window.PET_RIDING && window.PET_RIDING.horseShare) || 0.7;
                    const toHorse = Math.min(Math.round(finalDmg * share), parseInt(horse.hp) || 0);
                    finalDmg -= toHorse;
                    horseNote = ` (🐎 лошадь «${horse.name}» приняла ${toHorse}${toHorse >= (parseInt(horse.hp) || 0) ? ' и пала' : ''})`;
                    chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId: horse.id, delta: -toHorse }) }).catch(() => { }));
                }
            }
            let logExtra = '', newHp, newMp;
            // Заклинание «Барьер» (Изменение): pct% ФИЗИЧЕСКОГО входящего урона уходит в ману (rate маны за 1 урона) — по таблице магии.
            // Мана кончилась — барьер падает: ошеломление (−2 к кубам на 2 хода) и снятие всех положительных эффектов.
            let barrierBroke = false;
            let barrierMpSpent = 0;
            if (finalDmg > 0 && dmgType === 'physical') {
                const bEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.barrier && x.turnsRemaining !== 0);
                if (bEff) {
                    const vit = Array.isArray(data.vitals) ? data.vitals : [0, 0, 0, 0];
                    const mpNow = parseInt(vit[1]) || 0;
                    const pct = bEff.barrier.pct || 20, rate = bEff.barrier.rate || 5;
                    const redirected = Math.round(finalDmg * pct / 100);
                    const needMp = Math.ceil(redirected * rate);
                    if (needMp <= mpNow) {
                        barrierMpSpent = needMp; finalDmg -= redirected;
                        if (mpNow - needMp <= 0) barrierBroke = true;
                        defNotes.push(`🛡 Барьер: ${redirected} урона ушло в ману (−${needMp} маны, курс 1:${rate})`);
                    } else {
                        const absorbable = Math.floor(mpNow / rate);
                        barrierMpSpent = mpNow; finalDmg -= Math.min(redirected, absorbable); barrierBroke = true;
                        defNotes.push(`🛡 Барьер: поглощено ${Math.min(redirected, absorbable)} урона, мана кончилась`);
                    }
                }
            }
            // «Нечестивый барьер» (Колдовство): большая часть ФИЗИЧЕСКОГО урона принимается на себя — вместо N урона
            // с игрока снимается 1 ХП за каждые `per` единиц (5 у барьеров 1-2, 10 у барьера 3). Мана на поддержание уходит в свой ход.
            if (finalDmg > 0 && dmgType === 'physical') {
                const uEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.unholy && x.turnsRemaining !== 0);
                if (uEff) {
                    const per = uEff.unholy.per || 5, hpc = uEff.unholy.hp || 1;
                    const taken = Math.ceil(finalDmg / per) * hpc;
                    if (taken < finalDmg) {
                        defNotes.push(`🦴 Нечестивый барьер: ${finalDmg} физ. урона → ${taken} ХП (${hpc} ХП за каждые ${per} урона)`);
                        finalDmg = taken;
                    }
                }
            }
            // «Бастион» и др.: часть урона ближней физической атаки возвращается атакующему врагу.
            if (finalDmg > 0 && dmgType === 'physical' && !pendingGmAttack.isRangedAtk && !pendingGmAttack.isSpell && gsA.reflectMeleePct > 0 && pendingGmAttack.enemyId) {
                const refl = Math.round(finalDmg * gsA.reflectMeleePct / 100);
                const enArr = (lastData && Array.isArray(lastData.enemies)) ? lastData.enemies : [];
                if (refl > 0 && enArr.some(e => e.id === pendingGmAttack.enemyId)) {
                    const enemiesR = enArr.map(e => e.id === pendingGmAttack.enemyId ? { ...e, curHp: Math.max(0, (parseInt(e.curHp) || 0) - refl), lastHitBy: targetUid, ...(((parseInt(e.curHp) || 0) - refl) <= 0 && (parseInt(e.curHp) || 0) > 0 ? { killedBy: targetUid, diedAtTurn: (lastData && lastData.sessionTurnCounter) || 0 } : {}) } : e);
                    chores.push(gmUpdateEnemies(enemiesR).catch(() => { }));
                    defNotes.push(`🪞 Отражение ${gsA.reflectMeleePct}%: ${pendingGmAttack.enemyName} получает ${refl} урона`);
                }
            }
            if (dmg || absorbedMp || barrierMpSpent) {
                const vitals = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
                newHp = Math.max(0, (parseInt(vitals[0]) || 0) - finalDmg);
                vitals[0] = newHp;
                if (absorbedMp) {
                    const maxMpV = parseInt(vitals[3]) || 0;
                    const curMpV = parseInt(vitals[1]) || 0;
                    vitals[1] = Math.max(curMpV, Math.min(maxMpV, curMpV + absorbedMp));
                    newMp = vitals[1];
                }
                if (barrierMpSpent) { vitals[1] = Math.max(0, (parseInt(vitals[1]) || 0) - barrierMpSpent); newMp = vitals[1]; }
                // newHp/newMp выше — для текста в журнале (по снимку); в базу пишем изменения по СВЕЖИМ данным в транзакции.
                const fdmg = finalDmg, amp = absorbedMp || 0, bmp = barrierMpSpent || 0;
                chores.push(updateCharacterVitals(targetUid, v => {
                    v[0] = Math.max(0, (parseInt(v[0]) || 0) - fdmg);
                    if (amp) { const mx = parseInt(v[3]) || 0, cu = parseInt(v[1]) || 0; v[1] = Math.max(cu, Math.min(mx, cu + amp)); }
                    if (bmp) v[1] = Math.max(0, (parseInt(v[1]) || 0) - bmp);
                }));
                // Игроку с концентрационным заклинанием (Иллюзия/Колдовство) нужна проверка при каждом попадании — шлём команду в его очередь
                // Сигнал «по тебе попали»: проверка концентрации + прокачка брони (как в Скайриме — за каждое попадание).
                // Раньше уходил в документ персонажа, который сайт игрока не читает, — не работало ни то, ни другое.
                if (fdmg > 0) { const pd = {}; pd['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'dmg-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'damaged', dmg: fdmg, dmgType: dmgType, ts: Date.now() }); chores.push(db.collection('sessions').doc(currentCode).update(pd).catch(() => { })); }
                if (dmg) logExtra += `, урон ${finalDmg}${resist ? ` (резист ${resist}%, было бы ${dmg})` : ''}${sunNote}${berserkNote}${mistNote}${horseNote}`;
            }
            if (defNotes.length) logExtra += '. ' + defNotes.join('. ');
            // Автоматический бросок на заражение болезнью — раньше этого не было вообще, болезни
            // существовали только как текст в описании монстров. Срабатывает только при физическом
            // попадании (dmgType==='physical') от переносчика (carrierOfDisease задан).
            if (finalDmg > 0 && dmgType === 'physical' && pendingGmAttack.carrierOfDisease && pendingGmAttack.diseaseChance > 0) { // уклонился, заблокировал, туман — урона нет, заражения тоже
                // Альтмер, босмер, редгард — преимущество против болезней: бросаем дважды, берём лучший (больший) результат.
                const diseaseAdv = ['altmer', 'bosmer', 'redguard'].indexOf(data.race) !== -1;
                const roll1 = Math.floor(Math.random() * 100) + 1, roll2 = diseaseAdv ? Math.floor(Math.random() * 100) + 1 : 0;
                const roll = Math.max(roll1, roll2);
                const resist = (data.race === 'argonian') ? 100 : ((data.resistances && data.resistances.disease) || 0); // аргонианин: иммунитет
                const effectiveChance = Math.max(0, pendingGmAttack.diseaseChance * (1 - resist / 100));
                if (roll <= effectiveChance) {
                    const diseaseName = pendingGmAttack.carrierOfDisease;
                    const diseaseInfo = DISEASE_DEFS[diseaseName] || { desc: 'Эффект — на усмотрение мастера.' };
                    const patch2 = {};
                    patch2['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                        id: 'dis-' + Date.now() + Math.random().toString(36).slice(2, 8),
                        name: pendingGmAttack.enemyName, effectName: 'Болезнь: ' + diseaseName, description: diseaseInfo.desc, turnsRemaining: 9999, permanent: true
                    });
                    chores.push(db.collection('sessions').doc(currentCode).update(patch2));
                    logExtra += `. 🚨 Заражение! ${targetName} подхватил(а) болезнь «${diseaseName}» (бросок ${roll} ≤ ${effectiveChance.toFixed(0)}%)`;
                } else {
                    logExtra += `. Проверка на заражение не прошла (${roll} > ${effectiveChance.toFixed(0)}%${diseaseAdv ? `, преимущество расы: ${roll1}/${roll2}` : ''}${data.race === 'argonian' ? ', аргонианин не болеет' : ''})`;
                }
            }
            if (barrierBroke) {
                const bp = {};
                bp['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                    id: 'brk-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    name: 'Барьер', effectName: 'Барьер разрушен — ошеломление', description: '−2 к кубам на 2 хода; все положительные эффекты сняты.',
                    turnsRemaining: 2, rollPenalty: -2, clearPositive: true, fromGm: true
                });
                chores.push(db.collection('sessions').doc(currentCode).update(bp));
                logExtra += `, 💥 Барьер разрушен: ошеломление (−2 к кубам, 2 хода), положительные эффекты сняты`;
            }
            const fearBlocked = statusKey === 'fear' && (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).some(x => x && x.fearImmune && x.turnsRemaining !== 0);
            if (fearBlocked) logExtra += ', 🦁 цель под «Мужеством/Ободрением» — страх не действует';
            if (statusKey && !spellNegated && !fearBlocked) {
                // Статус-эффект пишется В СЕССИЮ (не в документ персонажа) — у игрока нет
                // живого листенера на свой собственный документ, а на сессию есть, так что
                // так эффект долетит до него сразу, без перезагрузки страницы.
                const statusDef = GM_STATUS_EFFECTS[statusKey];
                const patch = {};
                patch['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                    id: 'st-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    name: pendingGmAttack.enemyName, effectName: statusDef.name, description: statusDef.desc, turnsRemaining: statusDef.turns,
                    rollPenalty: statusDef.rollPenalty || 0, speed: statusDef.speed || 0, fromGm: true,
                    // паралич и страх: игрок бросает спасбросок на своём листе (Телосложение / Мудрость, СЛ 13)
                    save: statusKey === 'paralyze' ? { stat: 'con', dc: 13 } : statusKey === 'fear' ? { stat: 'wis', dc: 13 } : null
                });
                chores.push(db.collection('sessions').doc(currentCode).update(patch));
                logExtra += `, статус «${statusDef.name}» (${statusDef.turns} х.)${statusKey === 'paralyze' || statusKey === 'fear' ? ' — игрок бросает спасбросок (СЛ 13)' : ''}`;
            }
            return Promise.all(chores).then(() => ({ newHp, newMp, logExtra }));
        }).then(({ newHp, newMp, logExtra }) => {
            const mirror = {};
            if (newHp !== undefined) mirror['participants.' + targetUid + '.curHp'] = newHp;
            if (newMp !== undefined) mirror['participants.' + targetUid + '.curMp'] = newMp;
            const chain = Object.keys(mirror).length
                ? db.collection('sessions').doc(currentCode).update(mirror)
                : Promise.resolve();
            return chain.then(() => logExtra);
        }).then(logExtra => {
            gmPostLogEntryText(logTextBase + logExtra + '.');
            alert('Применено.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Тематические сундуки — теперь тип сундука в ОДНОМ блоке с обычным генератором лута ----------
    // (раньше отдельная панель — окно мастера и так длинное). Уровень сундука влияет и здесь: число
    // предметов (как у обычного), КАЧЕСТВО (окно по цене внутри предметов фракции), размер валюты.
    const THEMED_CHEST_THEMES = {
        // Ключевое слово ищется по ИМЕНИ предмета (не категории) — в базе названия фракций написаны
        // непоследовательно ("Древний нордский"/"Древняя нордская"/"Древне нордские"), "древн" ловит все.
        ancientNord: { label: 'Древнонордский', keyword: 'древн', currency: { name: 'Дракр', price: 4, base: [3, 12] } },
        dwemer: { label: 'Двемерский', keyword: 'двемер', currency: { name: 'Думак', price: 5, base: [3, 12] } },
        falmer: { label: 'Фалмерский', keyword: 'фалмер', currency: { name: 'Думак', price: 5, base: [3, 12] } },
        forsworn: { label: 'Изгоев', keyword: 'изгое', currency: null } // валюты нет — вместо неё золото по уровню
    };
    // Какой кусок пула фракции (отсортированного по цене) доступен на данном уровне: бедный — дешёвые
    // вещи, легендарный — самые дорогие. Не привязано к абсолютным ценам — у разных фракций они разные.
    const THEMED_PRICE_WINDOW = { poor: [0, 0.4], common: [0.15, 0.7], rich: [0.4, 0.9], legendary: [0.6, 1] };
    const THEMED_CURRENCY_MULT = { poor: 0.5, common: 1, rich: 2, legendary: 3.5 };

    // Выбор count разных предметов из окна по цене (без повторов).
    function pickThemedGear(pool, tierKey, count) {
        const sorted = pool.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
        const win = THEMED_PRICE_WINDOW[tierKey] || [0, 1];
        let windowed = sorted.slice(Math.floor(sorted.length * win[0]), Math.ceil(sorted.length * win[1]));
        if (!windowed.length) windowed = sorted;
        const shuffled = windowed.slice().sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    function generateThemedLoot(typeKey, tierKey, tier, resultEl) {
        const theme = THEMED_CHEST_THEMES[typeKey];
        // Только экипировка (броня/оружие со слотом) и никакого уникального: "древн" иначе цепляло
        // «…древнего вампира» (Уникальная броня) и «Древнюю нордскую кирку», "двемер" — слитки и детали.
        const rawPool = (gmAllItems || []).filter(i =>
            i.name.toLowerCase().includes(theme.keyword) &&
            (typeof i.armor === 'number' || typeof i.dmg === 'number') && i.slot &&
            !isUniqueLootItem(i)
        );
        // В базе есть предметы под ОДНИМ именем в двух записях (кастеты: «Двемерские боевые перчатки»
        // и т.п. — и в кованых, и в лутовых). Без дедупликации сундук мог выдать «два разных» предмета
        // с одним названием. Оставляем одну запись на имя, лутовую версию предпочитаем кованой.
        const byName = new Map();
        rawPool.forEach(i => {
            const prev = byName.get(i.name);
            if (!prev || (/\(лут\)/.test(i.category || '') && !/\(лут\)/.test(prev.category || ''))) byName.set(i.name, i);
        });
        const pool = [...byName.values()];
        if (!pool.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В базе нет предметов этой фракции.</span>'; return; }
        const count = randInt(tier.itemCount[0], tier.itemCount[1]);
        const items = pickThemedGear(pool, tierKey, count);
        let gold = 0;
        if (theme.currency) {
            const amount = Math.max(1, Math.round(randInt(theme.currency.base[0], theme.currency.base[1]) * (THEMED_CURRENCY_MULT[tierKey] || 1)));
            items.push({ name: theme.currency.name, category: 'Кузнечные ингредиенты', price: theme.currency.price, weight: 0.1, qty: amount });
        } else {
            gold = randInt(tier.gold[0], tier.gold[1]);
        }
        lastGeneratedLoot = { tier: tier.label, title: `${theme.label}, ${tier.label.toLowerCase()}`, gold, items, trap: gmRollChestTrap() };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    }

    // Общий вывод результата для обоих типов сундуков.
    function renderLootHtml(loot) {
        let html = `<strong>${escapeHtml(loot.title || loot.tier)} сундук:</strong><br>`;
        if (loot.trap) { const tt = trapType(loot.trap.id) || {}; html += `<span style="color:#e67e22;">🪤 С ловушкой: ${tt.icon || ''} ${escapeHtml(tt.name || loot.trap.id)} — обезвредить: ${escapeHtml(loot.trap.tier)} (сл. ${loot.trap.dc}). Игроку при выдаче придёт бросок на обезвреживание.</span><br>`; }
        if (loot.gold) html += `💰 ${loot.gold} септимов<br>`;
        loot.items.forEach(it => {
            const stats = (it.armor ? ` · броня ${it.armor}` : '') + (it.dmg ? ` · урон ${it.dmg}` : '');
            html += `• ${escapeHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''} <span style="opacity:.65;">(${escapeHtml(it.category || '')}${stats}, ${it.price} септимов)</span><br>`;
        });
        return html;
    }

    // ---------- Генератор лута сундуков ----------

    const LOOT_TIERS = {
        poor: { label: 'Бедный', gold: [5, 40], priceMin: 1, priceMax: 30, itemCount: [1, 2] },
        common: { label: 'Обычный', gold: [30, 150], priceMin: 20, priceMax: 150, itemCount: [2, 3] },
        rich: { label: 'Богатый', gold: [150, 600], priceMin: 100, priceMax: 800, itemCount: [2, 4] },
        legendary: { label: 'Легендарный', gold: [500, 2000], priceMin: 500, priceMax: 6935, itemCount: [1, 3] }
    };
    const LOOT_EXCLUDE_CATEGORIES = [
        'Ингредиенты для алхимии', 'Кузнечные ингредиенты', 'Шкуры', 'Двемерские детали',
        // Уникальные предметы/артефакты не должны падать из случайного сундука.
        'Уникальная броня', 'Уникальные щиты', 'Даэдрические артефакты', 'Артефакты Азидала',
        'Маски жрецов', 'Магические одеяния',
        // Всё из таблицы «Уникальное оружие и броня»: Мораг Тонг и Азидал — только руками мастера (см. «Снаряжение и добыча» у врага)
        'Броня Мораг Тонг'
    ];

    // Уникальное/именное не должно падать из случайного сундука. Раньше проверялся только список
    // категорий выше — а "Уникальное оружие" (файл unique-weapons-data.js, добавленный позже) в него
    // не попало, и уникальные клинки/луки изредка выпадали из обычных сундуков 13+ уровня.
    // Теперь отсекаем и по флагу unique, и по любой категории, начинающейся с "Уникальн".
    function isUniqueLootItem(i) {
        return !!i.unique || /^Уникальн/.test(i.category || '') || LOOT_EXCLUDE_CATEGORIES.includes(i.category);
    }

    let lastGeneratedLoot = null;

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    window.generateChestLoot = function () {
        const tierKey = el('loot-tier-select').value;
        const tier = LOOT_TIERS[tierKey];
        const resultEl = el('loot-gen-result');
        // Тип сундука: обычный (случайный лут по цене) или тематический (броня/оружие фракции).
        const typeKey = el('loot-type-select') ? el('loot-type-select').value : 'common';
        if (typeKey !== 'common' && THEMED_CHEST_THEMES[typeKey]) { generateThemedLoot(typeKey, tierKey, tier, resultEl); return; }
        const pool = (gmAllItems || []).filter(i =>
            typeof i.price === 'number' && i.price >= tier.priceMin && i.price <= tier.priceMax &&
            !isUniqueLootItem(i)
        );
        if (!pool.length) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">В базе нет предметов в этом ценовом диапазоне.</span>';
            return;
        }
        const gold = randInt(tier.gold[0], tier.gold[1]);
        const count = randInt(tier.itemCount[0], tier.itemCount[1]);
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(pool[Math.floor(Math.random() * pool.length)]);
        }

        // Гарантированная "мелочёвка" сундука — не заменяет обычный лут, добавляется поверх.
        const foodPool = (gmAllItems || []).filter(i => i.category === 'Готовые продукты' || i.category === 'Сырые продукты');
        const soulGemPool = (gmAllItems || []).filter(i => i.category === 'Камни душ');
        const gemPool = (gmAllItems || []).filter(i => i.category === 'Драгоценные камни');
        if (foodPool.length && Math.random() < 0.6) items.push(foodPool[Math.floor(Math.random() * foodPool.length)]);
        if (Math.random() < 0.4) items.push({ name: 'Отмычка', category: 'Инструменты', price: 5, weight: 0.1 });
        if (soulGemPool.length && Math.random() < 0.3) items.push(soulGemPool[Math.floor(Math.random() * soulGemPool.length)]);
        if (gemPool.length && Math.random() < 0.25) items.push(gemPool[Math.floor(Math.random() * gemPool.length)]);

        lastGeneratedLoot = { tier: tier.label, title: tier.label, gold, items, trap: gmRollChestTrap() };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    };
    // Ловушка сундука по выбору мастера (дротики / булава / колья / случайная) и сложность обезвреживания.
    function gmRollChestTrap() {
        const v = (el('loot-trap-select') || {}).value || '';
        if (!v) return null;
        const pool = window.CHEST_TRAP_TYPES || ['darts', 'mace', 'spikes'];
        const id = v === 'random' ? pool[Math.floor(Math.random() * pool.length)] : v;
        const tierKey = (el('loot-trap-tier') || {}).value || 'adept';
        const tierT = (window.TRAP_DISARM_TIERS || {})[tierKey] || { label: 'Адепт', dc: 15 };
        return { id, tier: tierT.label, dc: tierT.dc };
    }

    window.grantGeneratedLoot = function () {
        if (!lastGeneratedLoot) { alert('Сначала сгенерируй лут.'); return; }
        const targetUid = el('loot-gen-target-player').value;
        if (!targetUid) { alert('Выбери игрока.'); return; }
        // Транзакция: инвентарь и золото пишутся вместе, автосохранение игрока в этот момент не затирает добычу.
        const charRefG = db.collection('characters').doc(targetUid);
        db.runTransaction(tx => tx.get(charRefG).then(doc => {
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            lastGeneratedLoot.items.forEach(it => {
                const itemId = it.name; // а не id документа базы — иначе стек не сливается с одноимённым предметом игрока
                // Как при «Передать»: эффекты зелий и ядов, чары, единая категория «Зелье»/«Яд» (а не «Яд (лут)»).
                const extra = gmItemExtraFromSource(it);
                const q = it.qty || 1; // валюта сундука (Дракры/Думаки) приходит стопкой, не по одной штуке
                gmMergeInvItem(inv, { itemId, name: it.name, weight: it.weight || 0, category: it.category || '', effect: it.effect || '' }, q, extra);
            });
            const newGold = (parseInt(data.gold) || 0) + (parseInt(lastGeneratedLoot.gold) || 0);
            const patchG = { inventory: stripUndefinedDeep(inv), gold: newGold };
            if (doc.exists) tx.update(charRefG, patchG); else tx.set(charRefG, patchG, { merge: true });
        })).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            if (lastGeneratedLoot.trap) { // сундук с ловушкой: игрок открывает его — бросок на обезвреживание, провал = ловушка
                const tt = trapType(lastGeneratedLoot.trap.id);
                if (tt) gmSendTrapCmd(targetUid, { type: 'trapDisarm', chest: true, trapName: tt.name + ' (сундук)', icon: tt.icon, dc: lastGeneratedLoot.trap.dc, onFail: gmTrapCmdFor(tt, {}) });
            }
            alert(`Лут (${lastGeneratedLoot.title || lastGeneratedLoot.tier} сундук) выдан игроку ${pname}.`);
            gmPostLogEntryText(`📦 ${pname} нашёл(а) ${(lastGeneratedLoot.title || lastGeneratedLoot.tier).toLowerCase()} сундук: ${lastGeneratedLoot.gold ? lastGeneratedLoot.gold + ' золота + ' : ''}${lastGeneratedLoot.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}.`);
            lastGeneratedLoot = null;
            el('loot-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function populateLootTargetSelect() {
        const select = el('loot-gen-target-player');
        if (!select) return;
        const uids = gmLivingPlayers(); // павшим добыча не уходит
        const prev = select.value;
        select.innerHTML = uids.length
            ? uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('')
            : '<option value="">' + (Object.keys(lastData.participants || {}).length ? 'Все игроки пали' : 'Нет игроков') + '</option>';
        if (uids.includes(prev)) select.value = prev;
    }

    // ---------- Генератор бандитов ----------

    const BANDIT_RACES = ['Норд', 'Имперец', 'Редгард', 'Бретонец', 'Данмер', 'Орк', 'Каджит'];
    const BANDIT_SIGNS = ['Воин', 'Вор', 'Маг', 'Госпожа', 'Конь', 'Атронах', 'Тень'];
    const BANDIT_GODS = [
        { name: 'Талос', blessing: '5% урона топорами и секирами, 10% сопротивление электричеству' },
        { name: 'Мара', blessing: '25% сопротивления ядам и болезням, +5% пробития брони ближним оружием' },
        { name: 'Боэтия', blessing: '10% урону стрелковым оружием, +5 футов передвижения' },
        { name: 'Малакат', blessing: '+25 хп, +10% урона оружием ближнего боя' },
        { name: 'Сангвин', blessing: 'Почти не пьянеет; после выпивки +10% физ.урона на 20 ходов' },
        { name: '— без веры —', blessing: '' }
    ];
    const BANDIT_ARMOR_SLOT_MAP = { 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' };

    // Прогрессия снаряжения по уровню — низкоуровневые бандиты в тряпье/железе, кап (50) — стекло/
    // эбонит ("полуэбонитовый сет" по просьбе, т.е. до эбонита включительно, не выше). Каждый порог
    // даёт доступ к материалам ЭТОГО и предыдущих порогов (не заменяет, а расширяет пул) — так
    // высокоуровневый бандит может выпасть в чём угодно от железа до своего максимума, а не
    // гарантированно в топе.
    const BANDIT_TIER_THRESHOLDS = [
        { minLevel: 1, weaponMat: /^(Меховые|Сыромятные|Железн)/i, armorMat: /^(Мехов|Сыромятн|Железн)/i, bows: ['Длинный лук', 'Охотничий лук'] },
        { minLevel: 8, weaponMat: /^Стальн/i, armorMat: /^Стальн/i, bows: ['Имперский лук', 'Древний нордский лук'] },
        { minLevel: 16, weaponMat: /^(Орочь|Орочий|Двемерск)/i, armorMat: /^(Орочь|Орочий|Двемерск)/i, bows: ['Орочий лук', 'Лук Изгоев'] },
        { minLevel: 26, weaponMat: /^(Эльфийск|Нордск)/i, armorMat: /^(Эльфийск|Нордск)/i, bows: ['Эльфийский лук', 'Фалмерский лук'] },
        { minLevel: 38, weaponMat: /^Стеклянн/i, armorMat: /^Стеклянн/i, bows: ['Стеклянный лук', 'Лук бич магов'] },
        { minLevel: 50, weaponMat: /^Эбонитов/i, armorMat: /^Эбонитов/i, bows: ['Эбонитовый лук', 'Фалмерский гибкий лук'] }
    ];

    function getBanditTierRegexes(level) {
        const unlocked = BANDIT_TIER_THRESHOLDS.filter(t => t.minLevel <= level);
        return {
            weaponMats: unlocked.map(t => t.weaponMat),
            armorMats: unlocked.map(t => t.armorMat),
            bows: unlocked.reduce((acc, t) => acc.concat(t.bows), [])
        };
    }

    // Английские ключи слота (armorNonCraftable) и русские подписи (armorRecipes, через
    // BANDIT_ARMOR_SLOT_MAP) — приводим обе базы к одному набору ключей: helmet/chest/gloves/
    // boots/shield.
    const ARMOR_SLOT_KEYS = new Set(['helmet', 'chest', 'gloves', 'boots', 'shield']);
    function normalizeArmorSlot(rawSlot) {
        if (ARMOR_SLOT_KEYS.has(rawSlot)) return rawSlot;
        return BANDIT_ARMOR_SLOT_MAP[rawSlot] || null;
    }

    function getBanditGearPool(level) {
        const tiers = getBanditTierRegexes(level);
        // Ближний бой: без луков, арбалетов и боеприпасов (стрелы/болты раньше попадали сюда как «оружие»).
        const weapons = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).filter(w =>
            !w.isAmmo && !/лук|арбалет|стрел|болт/i.test(w.name) && tiers.weaponMats.some(re => re.test(w.name)));
        const armors = (window.armorRecipes || []).concat(window.armorNonCraftable || []).filter(a =>
            tiers.armorMats.some(re => re.test(a.name)));
        const bowNames = tiers.bows;
        const bows = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).filter(w => bowNames.includes(w.name));
        return { weapons, armors, bows };
    }

    let lastGeneratedBandit = null;

    window.generateBandit = function () {
        const resultEl = el('bandit-gen-result');

        // Уровень бандита: средний уровень группы (задаётся вручную) ± разброс от -1 до +2, максимум 50.
        const avgLevel = parseInt(el('bandit-avg-level').value) || 5;
        const level = Math.max(1, Math.min(50, avgLevel + (Math.floor(Math.random() * 4) - 1)));

        const pool = getBanditGearPool(level);
        if (!pool.weapons.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных об оружии — проверь, что smithing-data.js подключён.</span>'; return; }

        const race = BANDIT_RACES[Math.floor(Math.random() * BANDIT_RACES.length)];
        const sign = BANDIT_SIGNS[Math.floor(Math.random() * BANDIT_SIGNS.length)];
        const god = BANDIT_GODS[Math.floor(Math.random() * BANDIT_GODS.length)];

        const isRanged = Math.random() < 0.25 && pool.bows.length;
        const bow = isRanged ? pool.bows[Math.floor(Math.random() * pool.bows.length)] : null;
        const weapon = pool.weapons[Math.floor(Math.random() * pool.weapons.length)];

        const slots = { helmet: null, chest: null, gloves: null, boots: null, shield: null };
        const bySlot = {};
        pool.armors.forEach(a => {
            const key = normalizeArmorSlot(a.slot);
            if (!key) return;
            (bySlot[key] = bySlot[key] || []).push(a);
        });
        let totalArmor = 0;
        Object.keys(slots).forEach(key => {
            if (key === 'shield' && (isRanged || Math.random() > 0.3)) return; // лучники без щита
            if (key !== 'shield' && Math.random() > 0.7) return;
            const options = bySlot[key];
            if (options && options.length) {
                const picked = options[Math.floor(Math.random() * options.length)];
                slots[key] = picked;
                totalArmor += picked.resistance || 0;
            }
        });

        // Настоящие характеристики бандита — раньше их не было вообще, только плоский weaponDmg
        // и ХП из случайного диапазона 40-90 без всякой связи с телом. Упор на Телосложение
        // (ХП)/Силу(ближний бой)/Ловкость(дальний бой) — они разбойники-воины, не барды. Растут
        // с уровнем, у мага-бандита (отдельный генератор ниже) приоритет другой — там Дух/Интеллект.
        const con = 14 + Math.floor(level * 0.3) + Math.floor(Math.random() * 3); // 14→~30 к 50 ур.
        const str = 12 + Math.floor(level * 0.24) + Math.floor(Math.random() * 3); // 12→~26
        const dex = 11 + Math.floor(level * 0.2) + Math.floor(Math.random() * 3); // 11→~21
        const conMod = calcAbilityMod(con), strMod = calcAbilityMod(str), dexMod = calcAbilityMod(dex);

        // Урон и ХП растут с уровнем (грубая, но предсказуемая шкала) — ТЕПЕРЬ и с модификатором
        // характеристики сверху, как у игрока (Сила — ближний бой, Ловкость — дальний).
        const levelDmgMult = 1 + (level - 1) * 0.06;
        const levelHpMult = 1 + (level - 1) * 0.08;
        // Только база оружия с масштабом по уровню. Характеристика (СИЛ/ЛОВ) добавляется к урону
        // при самой атаке — enemyWeaponDamage(); раньше сюда запекался лишь модификатор (+1…+7),
        // и он же не учитывался бы повторно.
        const weaponDmg = isRanged
            ? Math.round(bow.damage * levelDmgMult)
            : Math.round(weapon.damage * levelDmgMult);
        const hp = con * 10 + Math.round(randInt(0, 20) * levelHpMult);
        // Мана — теперь у ЛЮБОГО бандита (не только мага), для зелий/свитков за столом мастера.
        const mp = Math.round(randInt(20, 40) * (1 + (level - 1) * 0.05));

        const gold = Math.round(randInt(5, 80) * (1 + (level - 1) * 0.1));
        const hasTrinket = Math.random() < 0.3;
        // Раньше сюда попадало ВСЁ со слотом кольцо/амулет — в том числе «Артефакты Азидала» и «Даэдрические артефакты».
        const trinketPool = (gmAllItems || []).filter(i => (i.category === 'Ювелирное изделие' || (i.slot === 'ring' || i.slot === 'amulet')) && !isUniqueLootItem(i));
        const trinket = hasTrinket && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;
        const foodPool = (gmAllItems || []).filter(i => i.category === 'Готовые продукты' || i.category === 'Сырые продукты');
        const foodItem = foodPool.length ? foodPool[Math.floor(Math.random() * foodPool.length)] : null;
        const hasLockpick = Math.random() < 0.5;

        // Лут: часть брони НЕ выпадает при обыске (потрёпана в бою) — у каждого предмета
        // (включая оружие) свой отдельный шанс попасть в добычу, не 100%.
        const lootItems = [];
        if (Math.random() < 0.8) {
            if (isRanged) lootItems.push({ name: bow.name, price: bow.price || 0, weight: bow.weight, dmg: bow.damage, slot: 'ranged', category: 'Оружие (с трупа)' }); // базовый урон оружия (множитель уровня — только у самого бандита)
            else lootItems.push({ name: weapon.name, price: weapon.price || 0, weight: weapon.weight, dmg: weapon.damage, slot: weapon.slot, category: 'Оружие (с трупа)' });
        }
        if (isRanged && Math.random() < 0.9) lootItems.push({ name: 'Стрела', price: 1, weight: 0.1, category: 'Оружие (с трупа)' });
        Object.values(slots).forEach(a => {
            if (a && Math.random() < 0.6) lootItems.push({ name: a.name, price: a.price || 0, weight: a.weight, armor: a.resistance, slot: normalizeArmorSlot(a.slot), category: 'Броня (с трупа)' });
        });
        if (trinket) lootItems.push({ name: trinket.name, price: trinket.price || 0, weight: trinket.weight, slot: trinket.slot, category: 'Ювелирное изделие (с трупа)' });
        if (foodItem && Math.random() < 0.5) lootItems.push({ name: foodItem.name, price: foodItem.price || 0, weight: foodItem.weight || 0.5, category: foodItem.category, effect: foodItem.effect || '' });
        if (hasLockpick) lootItems.push({ name: 'Отмычка', price: 5, weight: 0.1, category: 'Инструменты' });

        lastGeneratedBandit = {
            name: 'Бандит', race, sign, god: god.name, level, hp, mp,
            str, dex, con,
            weaponDmg, weaponNote: isRanged ? bow.name : weapon.name, isRanged, isMage: false, spells: [],
            armor: totalArmor, gold, lootItems, isRaisable: true, soul: 'black'
        };

        let html = `<strong>Ур. ${level} · ${race}, знак «${sign}»${god.name !== '— без веры —' ? ', поклоняется ' + god.name : ''}</strong><br>`;
        if (god.blessing) html += `<span style="opacity:.75;">Благословение: ${escapeHtml(god.blessing)}</span><br>`;
        html += `СИЛ ${str}(${strMod >= 0 ? '+' : ''}${strMod}) · ЛОВ ${dex}(${dexMod >= 0 ? '+' : ''}${dexMod}) · ТЕЛ ${con}(${conMod >= 0 ? '+' : ''}${conMod})<br>`;
        html += `ХП: ${hp} · МП: ${mp} · ${isRanged ? 'Лук' : 'Оружие'}: ${isRanged ? bow.name + ' (' + weaponDmg + ' + ЛОВ ' + dex + ' = ' + (weaponDmg + dex) + ' урона за попадание)' : weapon.name + ' (' + weaponDmg + ' + СИЛ ' + str + ' = ' + (weaponDmg + str) + ' урона за попадание)'} · Броня: ${totalArmor}<br>`;
        html += `Лут (может выпасть не всё): 💰${gold}` + lootItems.map(l => ', ' + l.name).join('') + '';
        resultEl.innerHTML = html;
    };

    // ---------- Отдельный генератор магов-бандитов (кап уровня 60, одеяния + заклинания) ----------

    // Заклинания магов-бандитов — по рангу заклинания (базовый уровень требуемого умения),
    // не жёстко привязаны к конкретному уровню бандита: чем выше уровень мага, тем ВЫШЕ ранг
    // заклинаний ему доступен (использует реальные заклинания из spell-data.js, не выдуманные).
    function getBanditMageSpellPool(level) {
        if (!window.spellsData) return [];
        const maxRank = level >= 45 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;
        const schools = ['destr', 'restor', 'conj']; // разрушение/восстановление/колдовство — боевые школы (ключ колдовства в spell-data — 'conj')
        const pool = [];
        schools.forEach(school => {
            for (let r = 1; r <= maxRank; r++) {
                (window.spellsData[school] && window.spellsData[school][r] || []).forEach(s => { if (/барьер/i.test(s.name)) return; pool.push(Object.assign({ school }, s)); });
            }
        });
        return pool;
    }

    // Одеяния для магов-бандитов — по цене (грубая привязка к уровню: чем выше уровень, тем
    // дороже/лучше одеяние доступно), из реального items-data.js (категория "Магические одеяния").
    function getBanditMageRobePool(level) {
        const maxPrice = 50 + level * 15; // кап 60 lvl ≈ 950 септимов потолок цены одеяния
        return (gmAllItems || []).filter(i => i.category === 'Магические одеяния' && typeof i.price === 'number' && i.price <= maxPrice);
    }

    let lastGeneratedMageBandit = null;

    window.generateMageBandit = function () {
        const resultEl = el('bandit-mage-gen-result');
        const avgLevel = parseInt(el('bandit-mage-avg-level').value) || 10;
        const level = Math.max(1, Math.min(60, avgLevel + (Math.floor(Math.random() * 4) - 1)));

        const spellPool = getBanditMageSpellPool(level);
        if (!spellPool.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных о заклинаниях — проверь, что spell-data.js подключён.</span>'; return; }

        const race = BANDIT_RACES[Math.floor(Math.random() * BANDIT_RACES.length)];
        const sign = BANDIT_SIGNS[Math.floor(Math.random() * BANDIT_SIGNS.length)];
        const god = BANDIT_GODS[Math.floor(Math.random() * BANDIT_GODS.length)];

        // 2-4 заклинания, желательно из разных школ для разнообразия.
        const spellCount = Math.min(spellPool.length, 2 + Math.floor(Math.random() * 3));
        const pickedSpells = [];
        const shuffled = spellPool.slice().sort(() => Math.random() - 0.5);
        for (const s of shuffled) {
            if (pickedSpells.length >= spellCount) break;
            if (!pickedSpells.find(p => p.name === s.name)) pickedSpells.push(s);
        }
        // Характеристики мага-бандита — приоритет Интеллект(сила заклинаний)/Дух(мана), Телосложение
        // ниже, чем у воинов-бандитов (маги традиционно более хрупкие).
        const con = 10 + Math.floor(level * 0.2) + Math.floor(Math.random() * 3);
        const int_ = 13 + Math.floor(level * 0.26) + Math.floor(Math.random() * 3);
        const wis = 12 + Math.floor(level * 0.22) + Math.floor(Math.random() * 3);
        const intMod = calcAbilityMod(int_);

        const levelDmgMult = 1 + (level - 1) * 0.05;
        const spells = pickedSpells.map(s => {
            // Колдовство (призывы, ауры, проклятия) урона по цели не наносит — числа в описании про существо; мастер применяет по описанию.
            const dmg = (s.school !== 'conj' && typeof parseSpellDamageFromDesc === 'function') ? parseSpellDamageFromDesc(s.desc) : null;
            return { name: s.name, dmg: dmg ? Math.round(dmg * levelDmgMult) + intMod : 0, cost: parseInt(s.baseCost) || parseInt(s.cost) || 20, school: s.school }; // цена — baseCost из spell-data
        });

        const robePool = getBanditMageRobePool(level);
        const robe = robePool.length ? robePool[Math.floor(Math.random() * robePool.length)] : null;

        const hp = con * 10 + Math.round(randInt(0, 15) * (1 + (level - 1) * 0.06));
        const mp = Math.round(randInt(80, 140) * (1 + (level - 1) * 0.08)); // маги — мана в разы больше воинов
        const gold = Math.round(randInt(15, 100) * (1 + (level - 1) * 0.1));

        const trinketPool = (gmAllItems || []).filter(i => i.category === 'Ювелирное изделие' && typeof i.price === 'number' && !isUniqueLootItem(i));
        const trinket = Math.random() < 0.4 && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;

        const lootItems = [];
        // Слот — как у вещи в базе (одеяние — robe, капюшон — helmet, сапоги — boots…), иначе снятое не надеть.
        if (robe && Math.random() < 0.7) lootItems.push({ name: robe.name, price: robe.price || 0, weight: robe.weight || 2, slot: robe.slot || 'robe', armor: typeof robe.armor === 'number' ? robe.armor : 0, category: robe.category || 'Магические одеяния', effect: robe.effect || '' });
        if (trinket) lootItems.push({ name: trinket.name, price: trinket.price || 0, weight: trinket.weight, slot: trinket.slot, category: 'Ювелирное изделие (с трупа)' });
        if (Math.random() < 0.5) lootItems.push({ name: 'Отмычка', price: 5, weight: 0.1, category: 'Инструменты' });

        lastGeneratedMageBandit = {
            name: 'Бандит-маг', race, sign, god: god.name, level, hp, mp,
            con, int: int_, wis,
            weaponDmg: 0, weaponNote: robe ? robe.name : 'Без одеяния', isRanged: false, isMage: true, spells,
            armor: 0, gold, lootItems, isRaisable: true, soul: 'black'
        };

        let html = `<strong>Маг ур. ${level} · ${race}, знак «${sign}»${god.name !== '— без веры —' ? ', поклоняется ' + god.name : ''}</strong><br>`;
        if (god.blessing) html += `<span style="opacity:.75;">Благословение: ${escapeHtml(god.blessing)}</span><br>`;
        html += `ИНТ ${int_}(${intMod >= 0 ? '+' : ''}${intMod}) · ДУХ ${wis} · ТЕЛ ${con}<br>`;
        html += `ХП: ${hp} · МП: ${mp} · Одеяние: ${robe ? robe.name : '—'}<br>`;
        html += `Заклинания (вкл. ИНТ): ${spells.map(s => `${s.name} (${s.dmg || '—'} урона/${s.cost} маны)`).join(', ')}<br>`;
        html += `Лут (может выпасть не всё): 💰${gold}` + lootItems.map(l => ', ' + l.name).join('') + '';
        resultEl.innerHTML = html;
    };

    // Объект бандита для боя вынесен в функцию (эпик 3.8), чтобы тот же самый враг мог уйти в шаблон без повторной случайности.
    function banditEnemyObj(b) {
        // Физический резист от брони: 10 очков брони = 1% (та же формула, что у игроков).
        const physResist = Math.min(85, Math.round((b.armor || 0) / 10));
        return {
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            str: b.str, dex: b.dex, con: b.con,
            weaponDmg: b.weaponDmg, weaponNote: b.weaponNote, isRanged: !!b.isRanged, resist: { physical: physResist }, spells: b.spells || [],
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, lootKit: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        };
    }
    function mageBanditEnemyObj(b) {
        return {
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            con: b.con, int: b.int, wis: b.wis,
            weaponDmg: 0, weaponNote: b.weaponNote, resist: { physical: 0 }, spells: b.spells || [],
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, lootKit: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        };
    }
    window.addGeneratedBanditToCombat = function () {
        if (!lastGeneratedBandit) { alert('Сначала сгенерируй бандита.'); return; }
        const b = lastGeneratedBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push(banditEnemyObj(b));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedBandit = null;
            el('bandit-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.addGeneratedMageBanditToCombat = function () {
        if (!lastGeneratedMageBandit) { alert('Сначала сгенерируй мага-бандита.'); return; }
        const b = lastGeneratedMageBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push(mageBanditEnemyObj(b));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedMageBandit = null;
            el('bandit-mage-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Лут с трупов любых врагов и генераторы драугров/изгоев (логика — в enemy-loot.js) ----------

    function enemyLootCtx(level) {
        return { pool: gmAllItems || [], level: level || 1, gearPool: typeof getBanditGearPool === 'function' ? getBanditGearPool : null };
    }
    // Бросок добычи по текстовому полю «лут» врага (дроп с вики): шанс, количество, золото, общие слова вроде «драг. камень».
    function rollEnemyCorpseLoot(enemy) {
        if (!window.EnemyLoot) return { gold: 0, items: [] };
        return window.EnemyLoot.rollFromText(enemy.loot, enemyLootCtx(enemy.level));
    }
    function describeLootItems(items) {
        return (items || []).map(i => i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '')).join(', ');
    }
    function genLootText(gen) {
        return [gen.gold ? gen.gold + ' зол.' : '', describeLootItems(gen.lootItems || gen.items)].filter(Boolean).join(', ');
    }

    // Добыча с трупа: по умолчанию тому, кто добил врага (killedBy, а если добил мастер — последний ранивший, lastHitBy),
    // мастер может выбрать другого. Павшим игрокам добыча не уходит. Раньше бралась первая строка селектора
    // генератора лута — каждый раз первый игрок в сессии, даже павший.
    function gmLivingPlayers() {
        const parts = (lastData && lastData.participants) || {};
        return Object.keys(parts).filter(uid => { const p = parts[uid] || {}; return !p.fallen && (p.curHp === undefined || (parseInt(p.curHp) || 0) > 0); });
    }
    const gmCorpseLootTo = {}; // выбор мастера по трупу (переживает перерисовку списка)
    function gmCorpseKiller(enemy) { return (enemy && (enemy.killedBy || enemy.lastHitBy)) || ''; }
    function gmCorpseLootTarget(enemy) {
        const living = gmLivingPlayers();
        const picked = gmCorpseLootTo[enemy.id];
        if (picked && living.includes(picked)) return picked;
        const killer = gmCorpseKiller(enemy);
        if (killer && living.includes(killer)) return killer;
        return living[0] || '';
    }
    function gmCorpseLootControls(e) {
        const parts = (lastData && lastData.participants) || {};
        const living = gmLivingPlayers();
        if (!living.length) return '<div style="opacity:.75; margin-top:2px;">Все игроки пали — добычу отдать некому.</div>';
        const killer = gmCorpseKiller(e), cur = gmCorpseLootTarget(e);
        const killerName = killer && parts[killer] ? parts[killer].name || '?' : '';
        return '<div style="display:flex; gap:4px; margin-top:2px; align-items:center;">' +
            '<select style="flex:1; font-size:12px;" title="Кому уйдёт добыча (только живые игроки)" onchange="gmSetCorpseLootTo(\'' + e.id + '\', this.value)">' +
            living.map(uid => '<option value="' + escapeHtml(uid) + '"' + (uid === cur ? ' selected' : '') + '>' + escapeHtml((parts[uid] || {}).name || uid) + (uid === killer ? ' ⚔ добил' : '') + '</option>').join('') +
            '</select>' +
            '<button style="margin:0; font-size:12px;" onclick="lootCorpse(\'' + e.id + '\')">💰 Обыскать</button></div>' +
            (killerName && !living.includes(killer) ? '<div style="opacity:.7; font-size:11px;">Добил(а) ' + escapeHtml(killerName) + ', но персонаж пал — выбери живого.</div>' : '');
    }
    window.gmSetCorpseLootTo = function (enemyId, uid) { gmCorpseLootTo[enemyId] = uid; };

    window.lootCorpse = function (enemyId) {
        const enemy = (lastData.enemies || []).find(e => e.id === enemyId);
        if (!enemy) { alert('Противник не найден.'); return; }
        if (enemy.looted) { alert('Этот труп уже обыскан.'); return; }
        const targetUid = gmCorpseLootTarget(enemy);
        if (!targetUid) { alert('Все игроки пали — добычу с трупа отдать некому.'); return; }
        // Готовая добыча (бандиты, драугры, изгои) или бросок по тексту лута из базы врагов
        let loot = null, items = [], gold = 0;
        const charRefL = db.collection('characters').doc(targetUid);
        const sessRefL = db.collection('sessions').doc(currentCode);
        // Сначала «занимаем» труп транзакцией по свежим данным сессии: отметка «обыскан» ставится ДО выдачи.
        // Раньше она ставилась после выдачи по снимку мастера — двойной клик или обыск игроком в ту же секунду давали добычу дважды.
        const setEnemy = (en, id, patch) => (en || []).map(e => e && e.id === id ? Object.assign({}, e, patch) : e);
        db.runTransaction(tx => tx.get(sessRefL).then(sd => {
            const en = ((sd.exists && sd.data()) || {}).enemies || [];
            const cur = en.find(e => e && e.id === enemyId);
            if (!cur) throw new Error('Противник уже убран из боя.');
            if (cur.looted) throw new Error('Этот труп уже обыскан.');
            loot = cur.corpseLoot || rollEnemyCorpseLoot(cur);
            items = loot.items || []; gold = loot.gold || 0;
            tx.update(sessRefL, { enemies: stripUndefinedDeep(setEnemy(en, enemyId, { corpseLoot: null, looted: true })) });
        })).then(() => db.runTransaction(tx => tx.get(charRefL).then(doc => { // инвентарь и золото — одной транзакцией (гонка с автосохранением игрока)
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            items.forEach((it, idx) => {
                const qty = Math.max(1, parseInt(it.qty) || 1);
                // Эффекты зелий/ядов с трупа (enemy-loot.js кладёт alchemyEffects) и категория «Зелье»/«Яд» — как при «Передать».
                const extra = gmItemExtraFromSource(it);
                delete extra.enchantment; // зачарование с трупа — ниже, отдельной записью
                const effect = it.effect || '';
                if (it.enchantment) {
                    // Зачарованная вещь — отдельной записью (имя#время, как у вещей игрока), чтобы её можно было разрушить и узнать зачарование.
                    extra.enchantment = it.enchantment;
                    if (typeof it.chargeDaysLeft === 'number') extra.chargeDaysLeft = it.chargeDaysLeft;
                    inv.push(Object.assign({ itemId: it.name + '#' + Date.now() + idx, name: it.name, count: 1, weight: it.weight || 0, category: it.category || '', effect }, extra));
                    return;
                }
                gmMergeInvItem(inv, { itemId: it.name, name: it.name, weight: it.weight || 0, category: it.category || '', effect }, qty, extra);
            });
            const newGold = (parseInt(data.gold) || 0) + gold;
            const patchL = { inventory: stripUndefinedDeep(inv), gold: newGold };
            if (doc.exists) tx.update(charRefL, patchL); else tx.set(charRefL, patchL, { merge: true });
        })).catch(err => { // выдать не вышло — возвращаем труп необысканным с той же добычей
            return db.runTransaction(tx => tx.get(sessRefL).then(sd => {
                const en = ((sd.exists && sd.data()) || {}).enemies || [];
                tx.update(sessRefL, { enemies: stripUndefinedDeep(setEnemy(en, enemyId, { corpseLoot: loot, looted: false })) });
            })).catch(() => { }).then(() => { throw err; });
        })).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            const summary = [gold ? gold + ' септ.' : '', describeLootItems(items)].filter(Boolean).join(', ') || 'ничего ценного';
            alert(`Добыча с трупа «${enemy.name}» выдана игроку ${pname}: ${summary}.`);
            gmPostLogEntryText(`💀 ${pname} обыскал(а) труп «${enemy.name}» и забрал(а): ${summary}.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function initEnemyGearPanels() {
        const fill = (selId, family) => {
            const sel = el(selId);
            if (!sel || !window.enemiesData || !window.EnemyGear) return;
            const list = window.enemiesData.filter(e => window.EnemyGear.familyOf(e.name) === family);
            sel.innerHTML = '<option value="random">🎲 Случайный (по среднему уровню группы)</option>' +
                list.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)} (ур. ${e.level}, ${e.hp} ХП)</option>`).join('');
        };
        fill('draugr-gen-type', 'draugr');
        fill('forsworn-gen-type', 'forsworn');
        // Четыре генератора живут в одном окне «Генератор врагов»: виден один, выбор помним в браузере мастера.
        let kind = 'bandit';
        try { kind = localStorage.getItem('gm_enemy_gen_kind') || 'bandit'; } catch (e) { }
        gmShowEnemyGen(kind);
    }

    function gmShowEnemyGen(kind) {
        const panes = document.querySelectorAll('.enemy-gen-pane[data-enemy-gen]');
        if (!Array.from(panes).some(p => p.dataset.enemyGen === kind)) kind = 'bandit';
        panes.forEach(p => { p.style.display = p.dataset.enemyGen === kind ? '' : 'none'; });
        const sel = el('enemy-gen-kind');
        if (sel && sel.value !== kind) sel.value = kind;
        try { localStorage.setItem('gm_enemy_gen_kind', kind); } catch (e) { }
    }
    window.gmShowEnemyGen = gmShowEnemyGen;

    function pickEnemyGenType(family, selectId, levelInputId) {
        const all = (window.enemiesData || []).filter(e => window.EnemyGear && window.EnemyGear.familyOf(e.name) === family);
        const v = el(selectId).value;
        if (v !== 'random') return all.find(e => e.name === v) || null;
        const avg = parseInt(el(levelInputId).value) || 10;
        let near = all.filter(e => Math.abs((e.level || 1) - avg) <= 6);
        if (!near.length) near = all.slice().sort((a, b) => Math.abs((a.level || 1) - avg) - Math.abs((b.level || 1) - avg)).slice(0, 2);
        return near[Math.floor(Math.random() * near.length)];
    }

    function renderGeneratedEnemy(gen, resultEl) {
        const ench = gen.lootItems.filter(l => l.enchantment);
        let html = `<strong>${escapeHtml(gen.name)} · ур. ${gen.level}</strong><br>`;
        html += `СИЛ ${gen.str} · ЛОВ ${gen.dex} · ТЕЛ ${gen.con}<br>`;
        html += `ХП: ${gen.hp}${gen.mp ? ' · МП: ' + gen.mp : ''} · Урон: ${gen.weaponDmg}${gen.isRanged ? '+ЛОВ' : '+СИЛ'}${gen.isRanged ? ' (дальний бой)' : ''} · Броня: ${gen.armor} (физ. резист ${gen.resist.physical || 0}%)<br>`;
        html += `Снаряжение: ${escapeHtml(gen.weaponNote || '—')}${gen.gear.worn.length ? ' · надето: ' + gen.gear.worn.map(escapeHtml).join(', ') : ''}<br>`;
        if (gen.spells.length) html += `Заклинания: ${gen.spells.map(s => escapeHtml(s.name) + ' (' + (s.dmg || 0) + '/' + (s.cost || 0) + ')').join(', ')}<br>`;
        if (gen.shouts.length) html += `Крики: ${gen.shouts.map(s => escapeHtml(s.name)).join(', ')}<br>`;
        html += `Лут (может выпасть не всё): ${gen.gold ? '💰' + gen.gold + ', ' : ''}${escapeHtml(describeLootItems(gen.lootItems)) || '—'}`;
        if (ench.length) html += `<br>🔮 Зачарованное: ${ench.map(l => escapeHtml(l.name) + ' — ' + escapeHtml(l.enchantment.description || '')).join('; ')}`;
        resultEl.innerHTML = html;
    }

    function enemyFromGenerated(gen) {
        return stripUndefinedDeep({
            id: genId('e'), name: gen.name + ' (ур.' + gen.level + ')', maxHp: gen.hp, curHp: gen.hp, maxMp: gen.mp || 0, curMp: gen.mp || 0,
            str: gen.str, dex: gen.dex, con: gen.con,
            weaponDmg: gen.weaponDmg, weaponNote: gen.weaponNote, isRanged: gen.isRanged, resist: gen.resist,
            spells: gen.spells, shouts: gen.shouts, soul: gen.soul, level: gen.level, kind: gen.kind,
            loot: genLootText(gen), corpseLoot: { gold: gen.gold, items: gen.lootItems }, lootKit: { gold: gen.gold, items: gen.lootItems }
        });
    }

    let lastGeneratedDraugr = null, lastGeneratedForsworn = null;

    window.generateDraugr = function () {
        const resultEl = el('draugr-gen-result');
        if (!window.EnemyGear) { resultEl.innerHTML = '<span style="color:#e74c3c;">enemy-loot.js не подключён.</span>'; return; }
        const base = pickEnemyGenType('draugr', 'draugr-gen-type', 'draugr-avg-level');
        if (!base) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных о драуграх (enemies-data.js).</span>'; return; }
        const gen = window.EnemyGear.generate(base, enemyLootCtx(base.level));
        if (!gen) { resultEl.innerHTML = '<span style="color:#e74c3c;">Не удалось сгенерировать.</span>'; return; }
        lastGeneratedDraugr = gen;
        renderGeneratedEnemy(gen, resultEl);
    };
    window.addGeneratedDraugrToCombat = function () {
        if (!lastGeneratedDraugr) { alert('Сначала сгенерируй драугра.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enemies.push(enemyFromGenerated(lastGeneratedDraugr));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedDraugr = null;
            el('draugr-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.generateForsworn = function () {
        const resultEl = el('forsworn-gen-result');
        if (!window.EnemyGear) { resultEl.innerHTML = '<span style="color:#e74c3c;">enemy-loot.js не подключён.</span>'; return; }
        const base = pickEnemyGenType('forsworn', 'forsworn-gen-type', 'forsworn-avg-level');
        if (!base) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных об изгоях (enemies-data.js).</span>'; return; }
        const gen = window.EnemyGear.generate(base, enemyLootCtx(base.level));
        if (!gen) { resultEl.innerHTML = '<span style="color:#e74c3c;">Не удалось сгенерировать.</span>'; return; }
        lastGeneratedForsworn = gen;
        renderGeneratedEnemy(gen, resultEl);
    };
    window.addGeneratedForswornToCombat = function () {
        if (!lastGeneratedForsworn) { alert('Сначала сгенерируй изгоя.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enemies.push(enemyFromGenerated(lastGeneratedForsworn));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedForsworn = null;
            el('forsworn-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Время суток и погода ----------

    const REGION_WEATHER_POOL = {
        'Лес': ['clear', 'cloudy', 'rain', 'fog'],
        'Болото': ['cloudy', 'rain', 'fog', 'storm'],
        'Горы': ['snow', 'blizzard', 'clear', 'cloudy'],
        'Побережье': ['clear', 'cloudy', 'rain', 'storm', 'fog'],
        'Равнина': ['clear', 'cloudy', 'rain'],
        'Подземелье': ['clear']
    };
    // Задача "погода — чёткие плюсы/минусы": та же самая формулировка, что видит игрок в
    // виджете текущей погоды (index.html WEATHER_TYPES) — продублировано тут, т.к. gm.js
    // отдельный файл без общего доступа к переменным index.html. Полный список (все явления
    // разом, не только текущее) — только у мастера, справочником ниже.
    // (сами WEATHER_LABELS/WEATHER_EFFECTS объявлены в самом начале файла — вызов
    // renderAllWeatherReference() в стартовой инициализации происходит раньше, чем скрипт успел
    // бы дойти досюда, и const в temporal dead zone бросал ReferenceError, ломая ВЕСЬ остаток
    // инициализации гм-панели: инвентарь игрока, атаку, порядок ходов — всё, что шло после)

    // Задача E: случайные события — раньше у мастера не было даже кнопки.
    window.rollRandomEvent = function () {
        const box = el('random-event-result');
        if (!box || !window.randomEventsData || !window.randomEventsData.length) {
            if (box) box.innerHTML = '<span style="color:#e74c3c;">База событий не загрузилась.</span>';
            return;
        }
        const e = window.randomEventsData[Math.floor(Math.random() * window.randomEventsData.length)];
        box.innerHTML = `<div style="font-size:13px;"><strong>🎲 ${e.roll}: ${escapeHtml(e.name)}</strong></div>
            <div style="margin-top:3px;">${escapeHtml(e.desc)}</div>
            ${e.req ? `<div style="margin-top:3px; opacity:.7;">⚠️ Условие: ${escapeHtml(e.req)}</div>` : ''}`;
        gmPostLogEntryText(`🎲 Случайное событие: «${e.name}»`);
    };

    function renderAllWeatherReference() {
        const box = el('all-weather-body');
        if (!box) return;
        box.innerHTML = Object.keys(WEATHER_LABELS).map(k =>
            `<div style="font-size:12px; margin-top:3px;"><strong>${WEATHER_LABELS[k]}</strong>${WEATHER_EFFECTS[k] ? ' — ' + escapeHtml(WEATHER_EFFECTS[k]) : ' — без штрафов/бонусов'}</div>`
        ).join('');
    }

    let pendingWeatherKey = null;

    // Задача H: сезон смещает пул погоды региона — зимой чаще снег/метель, весной чаще дождь,
    // летом чаще ясно, осенью чаще туман (там, где эта погода вообще возможна в регионе).
    const SEASON_WEATHER_BIAS = {
        'Зима': ['snow', 'blizzard'],
        'Весна': ['rain', 'storm'],
        'Лето': ['clear', 'cloudy'],
        'Осень': ['fog', 'cloudy']
    };

    // Выбор погоды вынесен в функцию (эпик 4.2), чтобы автосмена и кнопка «по региону» бросали одинаково.
    function pickWeatherKey(region, season, rnd) {
        const basePool = REGION_WEATHER_POOL[region] || ['clear'];
        const biasTypes = (SEASON_WEATHER_BIAS[season] || []).filter(w => basePool.includes(w));
        // Сезонно уместная погода весит втрое больше, но пул региона остаётся границей
        // возможного — в лесу зимой не будет "clear-only подземелья", а метели не будет в лесу.
        const pool = basePool.concat(biasTypes, biasTypes);
        return pool[Math.floor((rnd || Math.random)() * pool.length)];
    }
    window.rollWeatherForRegion = function () {
        const region = el('weather-region-select').value;
        const season = el('weather-season-select').value;
        pendingWeatherKey = pickWeatherKey(region, season);
        el('weather-gm-result').innerHTML = `Выпало: <strong>${WEATHER_LABELS[pendingWeatherKey]}</strong> — жми «Применить», чтобы сообщить игрокам.`;
    };


    // ---------- Эпик 4.2: автосмена погоды при новом игровом дне ----------
    // «Новый день» = рост sessions.gameDayCounter (его двигает «Следующий день» у игрока либо кнопка мастера). Предложение, а не молчаливая замена:
    // [Применить] / [Другое] / [Оставить].
    let _wxDayLast = null;
    // Сезон погоды хранится в сессии (sessions.weatherSeason): раньше после перезагрузки там снова было «Лето»,
    // и автопогода нового дня бросалась по летнему пулу даже зимой.
    window.gmSaveWeatherSeason = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ weatherSeason: el('weather-season-select').value }).catch(e => console.error(e));
    };
    function gmRestoreWeatherSeason(d) {
        const sel = el('weather-season-select');
        if (sel && d && d.weatherSeason && sel.value !== d.weatherSeason && document.activeElement !== sel) sel.value = d.weatherSeason;
    }
    function gmWeatherDayWatch(d) {
        gmRestoreWeatherSeason(d);
        const day = d.gameDayCounter || 0;
        if (_wxDayLast === null) { _wxDayLast = day; return; }   // первый снимок только запоминаем
        if (day <= _wxDayLast) { _wxDayLast = day; return; }
        _wxDayLast = day;
        const cb = el('weather-auto-day');
        if (cb && cb.checked) setTimeout(window.gmProposeWeather, 100);
    }
    window.gmProposeWeather = function (rnd) {
        const region = (lastData && lastData.currentRegion) || el('weather-region-select').value;
        const season = el('weather-season-select').value;
        const hold = (lastData && lastData.currentHold) || '';
        for (let i = 0; i < 6; i++) {
            const key = pickWeatherKey(region, season, rnd);
            const place = (hold ? hold.replace(/\s*\(.*\)/, '') : region);
            if (confirm('В ' + (hold ? hold.replace(/\s*\(.*\)/, '') : 'регионе «' + region + '»') + ' сегодня: ' + WEATHER_LABELS[key] + '.\n\nОК — применить\nОтмена — другие варианты')) {
                pendingWeatherKey = key;
                db.collection('sessions').doc(currentCode).update({ currentWeather: key, currentRegion: region }).then(() => {
                    gmPostLogEntryText('🌦 Новый день: ' + WEATHER_LABELS[key] + ' (' + place + ').');
                    el('weather-gm-result').innerHTML = '<span style="color:#2ecc71;">✅ Погода дня: ' + WEATHER_LABELS[key] + '.</span>';
                }).catch(e => alert('Ошибка: ' + e.message));
                return key;
            }
            if (!confirm('Выбрать другую погоду?\n\nОК — перебросить\nОтмена — оставить как есть')) return null;
        }
        return null;
    };
    window.gmNewGameDay = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ gameDayCounter: firebase.firestore.FieldValue.increment(1), gameDayPlayerMax: firebase.firestore.FieldValue.increment(1) }) /* день у партии один: «Следующий день» игроков за этот же день счётчик уже не двигает */.catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Эпик 5.5/5.6: уведомления мастера и «Позвать» ----------
    function gmNotify(title, body) {
        try {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            if (!document.hidden && !window.__stNotifyAlways) return;
            new Notification(title, { body: body || '', icon: 'skyrim-bg.jpg' });
        } catch (e) { }
    }
    window.gmNotify = gmNotify;
    window.gmEnableNotifications = function () {
        if (typeof Notification === 'undefined') { alert('Этот браузер не поддерживает уведомления.'); return; }
        Notification.requestPermission().then(p => { const b = el('gm-btn-notify'); if (b) b.textContent = p === 'granted' ? '🔔 Уведомления включены' : '🔕 Уведомления запрещены'; });
    };
    let _ntf = null; // предыдущие счётчики: шёпот от игроков и число врагов
    function gmNotifyWatch(d) {
        const w = (d.whispers || []).length, e = (d.enemies || []).length;
        if (_ntf) {
            if (w > _ntf.w) { const last = d.whispers[w - 1] || {}; gmNotify('Шёпот от ' + (last.author || 'игрока'), last.text || ''); }
            if (e > _ntf.e) gmNotify('Новый противник', ((d.enemies[e - 1] || {}).name) || '');
        }
        _ntf = { w, e };
        const b = el('gm-btn-notify');
        if (b && typeof Notification !== 'undefined') b.textContent = Notification.permission === 'granted' ? '🔔 Уведомления включены' : Notification.permission === 'denied' ? '🔕 Уведомления запрещены' : '🔔 Разрешить уведомления';
    }
    window.gmCallPlayers = function () {
        const uids = Object.keys((lastData && lastData.participants) || {});
        if (!currentCode || !uids.length) { alert('В сессии нет игроков.'); return; }
        const cmd = { id: 'call-' + Date.now() + Math.random().toString(36).slice(2, 5), cmd: 'call', ts: Date.now(), fromGm: true };
        const patch = {};
        uids.forEach(u => { patch['participants.' + u + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd); });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '📣 Мастер зовёт всех в игру!' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Эпик 4.5: встреча в пути при движении партии ----------
    // d6, на 5–6 — случайное событие из таблицы; показывается окном с кнопкой «Сообщить партии» (в журнал уходит только по нажатию).
    window.gmRollTravelEncounter = function (rnd) {
        rnd = rnd || Math.random;
        const roll = Math.floor(rnd() * 6) + 1;
        if (roll < 5 || !window.randomEventsData || !window.randomEventsData.length) return null;
        const e = window.randomEventsData[Math.floor(rnd() * window.randomEventsData.length)];
        const old = document.getElementById('gm-encounter-modal'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'gm-encounter-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
        m.innerHTML = '<div style="background:var(--panel-bg,#1e1a13);border:2px solid var(--accent-color,#c8a566);border-radius:8px;padding:16px 18px;max-width:92vw;width:420px;">' +
            '<h3 style="margin:0 0 6px;">🎲 Встреча в пути (d6: ' + roll + ')</h3><div style="font-weight:bold;">' + escapeHtml(e.name) + '</div><div style="margin-top:4px;">' + escapeHtml(e.desc) + '</div>' +
            (e.req ? '<div style="margin-top:4px;opacity:.7;">⚠️ Условие: ' + escapeHtml(e.req) + '</div>' : '') +
            '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn-success" style="flex:1;" id="gm-enc-tell">Сообщить партии</button><button style="width:auto;" id="gm-enc-close">Закрыть</button></div></div>';
        document.body.appendChild(m);
        el('gm-enc-close').onclick = () => m.remove();
        el('gm-enc-tell').onclick = () => { gmPostLogEntryText('🎲 В пути: «' + e.name + '» — ' + e.desc); m.remove(); };
        return { roll, event: e };
    };

    // ---------- Карта и положение партии ----------
    let gmMapHold = '', gmMapSel = null, gmMapSig = null, gmRoute = null;
    function gmMapParty() { return window.HoldsMap ? window.HoldsMap.partyFromSession(lastData) : null; }
    function gmMapMarks() { return lastData && Array.isArray(lastData.mapMarks) ? lastData.mapMarks : []; }
    const gmClean = o => JSON.parse(JSON.stringify(o)); // убирает undefined — Firestore их не принимает
    // Туман войны: настройки в сессии (mapFog). По умолчанию выключен — игроки видят всё, как раньше.
    function gmFog() {
        const f = (lastData && lastData.mapFog) || {};
        return { on: !!f.on, auto: f.auto !== false, r: f.r || 35, holds: (f.holds || []).slice(), circles: (f.circles || []).slice() };
    }
    function gmFogWrite(f, msg) {
        if (!currentCode) { el('gm-map-result').textContent = 'Нет активной сессии.'; return; }
        db.collection('sessions').doc(currentCode).update({ mapFog: gmClean(f) }).then(() => {
            if (msg) el('gm-map-result').innerHTML = `<span style="color:#2ecc71;">${msg}</span>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    }
    const GM_FOG_MAX = 300;
    // добавляет круг, если он ещё не перекрыт почти таким же; true — добавлен
    function gmFogAdd(f, c) {
        if (f.circles.some(o => o.r >= c.r * 0.9 && Math.hypot(o.x - c.x, o.y - c.y) < c.r * 0.35)) return false;
        if (f.circles.length >= GM_FOG_MAX) return false;
        f.circles.push(gmClean({ x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r), hold: c.hold || undefined, u: c.u, v: c.v }));
        return true;
    }
    // выбранное поселение; если на картинке владения известно его точное место — запоминаем u,v
    function gmSettleSel(h, n, x, y, u, v) {
        const im = window.HoldsMap && window.HoldsMap.IMG[h];
        if (u == null && im && im.settle && im.settle[n]) { u = im.settle[n][0]; v = im.settle[n][1]; }
        return { hold: h, name: n, x, y, u, v };
    }
    function gmCfg() { return window.HoldsMap.travelCfg(lastData && lastData.mapCfg); }
    // Положения поселений, назначенные мастером (session.mapSettle[name] = {hold,x,y,u?,v?})
    function gmSettleOv() { return (lastData && lastData.mapSettle && typeof lastData.mapSettle === 'object') ? lastData.mapSettle : {}; }
    window.gmMapAssignSettle = function () {
        const res = el('gm-map-result');
        const v = (el('gm-map-settle-set') || {}).value;
        if (!v) { res.textContent = 'Выбери поселение в списке рядом с кнопкой «Назначить».'; return; }
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { res.textContent = 'Сначала выбери точку: приблизь владение и кликни там, где поселение стоит на картинке.'; return; }
        if (!currentCode) { res.textContent = 'Нет активной сессии.'; return; }
        const [hk, n] = v.split('|');
        if (gmMapSel.hold && gmMapSel.hold !== hk) { res.textContent = 'Выбранная точка в другом владении («' + gmMapSel.hold + '»), а «' + n + '» относится к «' + hk + '».'; return; }
        const next = Object.assign({}, gmSettleOv()); next[n] = Object.assign({ hold: hk }, gmPosOf(gmMapSel));
        db.collection('sessions').doc(currentCode).update({ mapSettle: gmClean(next) }).then(() => {
            res.innerHTML = `<span style="color:#2ecc71;">🏘 «${escapeHtml(n)}» теперь стоит на выбранной точке (карта, маршруты и у игроков).</span>`;
            gmMapSel = null; gmMapShowSel();
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapResetSettle = function (n) {
        if (!currentCode) return;
        const next = Object.assign({}, gmSettleOv()); delete next[n];
        db.collection('sessions').doc(currentCode).update({ mapSettle: gmClean(next) }).then(() => {
            el('gm-map-result').textContent = '«' + n + '» снова стоит по условной схеме.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmMapRenderSettleOv() {
        const b = el('gm-map-settle-ov'); if (!b) return;
        const ov = gmSettleOv(), names = Object.keys(ov);
        b.innerHTML = names.length ? '<div style="font-size:13px; margin-bottom:2px;"><b>🏘 Поселения с назначенным положением (' + names.length + '):</b></div>' + names.map(n => `<div style="display:flex; gap:6px; align-items:center; font-size:13px; margin-bottom:2px;">
            <span style="flex:1;">🏘 ${escapeHtml(n)} <span style="opacity:.6;">(${escapeHtml(ov[n].hold || '')})</span></span>
            <button style="font-size:11px; padding:1px 6px;" onclick="gmMapResetSettle('${jsq(n)}')" title="Вернуть условное положение">↺</button></div>`).join('') : '';
    }

    window.renderGmMap = function (force) {
        const box = el('gm-map');
        if (!box || !window.HoldsMap) return;
        const party = gmMapParty();
        const marks = gmMapMarks();
        const fogS = gmFog();
        const sig = JSON.stringify([gmMapHold, party, gmMapSel, marks, fogS, gmRoute && gmRoute.pts, lastData && lastData.travelRoute && lastData.travelRoute.ts, lastData && lastData.mapCfg, lastData && lastData.openPlaces, lastData && lastData.mapSettle]);
        if (!force && sig === gmMapSig) return;
        gmMapSig = sig;
        const sel = el('gm-map-hold');
        if (sel && sel.options.length < 2) {
            sel.innerHTML = '<option value="">— вся карта —</option>' + Object.keys(window.HoldsMap.HOLDS).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        }
        if (sel) sel.value = gmMapHold;
        const ss2 = el('gm-map-settle-set');
        if (ss2 && ss2.options.length < 2) {
            const S2 = window.HoldsMap.SETTLE;
            ss2.innerHTML = '<option value="">— поселение, которому назначить выбранную точку —</option>' + Object.keys(S2).map(h => `<optgroup label="${escapeHtml(h)}">` + Object.keys(S2[h]).map(n => `<option value="${escapeHtml(h + '|' + n)}">${escapeHtml(n)}</option>`).join('') + '</optgroup>').join('');
        }
        const ss = el('gm-map-settle');
        if (ss && ss.options.length < 2) {
            const S = window.HoldsMap.SETTLE;
            ss.innerHTML = '<option value="">— выбрать поселение из списка —</option>' + Object.keys(S).map(h => `<optgroup label="${escapeHtml(h)}">` + Object.keys(S[h]).map(n => `<option value="${escapeHtml(h + '|' + n)}">${escapeHtml(n)}</option>`).join('') + '</optgroup>').join('');
        }
        const pins = window.HoldsMap.loadPins();
        // метки, выставленные игрокам, показываем и мастеру (красным) — чтобы было видно, что именно открыто
        marks.forEach(m => {
            if (!m || typeof m.x !== 'number') return;
            const hk = m.hold || '';
            pins[hk] = pins[hk] || {};
            let key = m.name || 'Метка';
            if (pins[hk][key] && pins[hk][key].cat !== 'Метка для игроков') key += ' ★';
            pins[hk][key] = { x: m.x, y: m.y, u: m.u, v: m.v, cat: 'Метка для игроков' };
        });
        // места, открытые игрокам (в т.ч. лично) — зелёным: мастер видит, ГДЕ именно привязано каждое
        (Array.isArray(lastData && lastData.openPlaces) ? lastData.openPlaces : []).forEach(p => {
            if (!p || typeof p.x !== 'number') return;
            const hk = p.hold || '';
            pins[hk] = pins[hk] || {};
            let key = p.name || 'Место';
            if (pins[hk][key] && pins[hk][key].cat !== 'Открыто игрокам') key += ' ✔';
            pins[hk][key] = { x: p.x, y: p.y, u: p.u, v: p.v, cat: 'Открыто игрокам' + (Array.isArray(p.toUids) && p.toUids.length ? ' · лично: ' + gmUidsText(p.toUids) : '') };
        });
        const pubRoute = lastData && lastData.travelRoute && Array.isArray(lastData.travelRoute.pts) ? lastData.travelRoute : null;
        window.HoldsMap.render(box, {
            hold: gmMapHold || null, hl: (lastData && lastData.currentHold) || null, party, pins, sel: gmMapSel, settleOv: gmSettleOv(),
            fog: fogS.on ? window.HoldsMap.fogFromSession(lastData, true) : null,
            route: gmRoute ? { pts: gmRoute.pts } : (pubRoute ? { pts: pubRoute.pts } : null),
            onHold: h => { gmMapHold = h; gmMapSel = null; window.renderGmMap(true); },
            onSettlement: (h, n, x, y, u, v) => { gmMapSel = gmSettleSel(h, n, x, y, u, v); gmMapShowSel(); window.renderGmMap(true); },
            onPin: (h, n) => { const p = ((pins[h] || {})[n]); if (p) { gmMapSel = { hold: h, name: n, x: p.x, y: p.y, u: p.u, v: p.v }; gmMapShowSel(); window.renderGmMap(true); } },
            onMap: gmMapHold ? (x, y, h, u, v) => { gmMapSel = { hold: h || gmMapHold, name: (el('gm-map-label').value || '').trim(), x, y, u, v }; gmMapShowSel(); window.renderGmMap(true); } : null
        });
        gmMapShowSel();
        gmMapRenderMarks();
        gmMapRenderSettleOv();
        gmFogShowInfo();
        gmCfgFill();
    };
    function gmMapRenderMarks() {
        const b = el('gm-map-marks');
        if (!b) return;
        const marks = gmMapMarks();
        b.innerHTML = marks.length
            ? '<div style="font-size:13px; margin-bottom:2px;"><b>📌 Метки, видимые игрокам (' + marks.length + '):</b></div>' + marks.map(m => `<div style="display:flex; gap:6px; align-items:center; font-size:13px; margin-bottom:2px;">
                <span style="flex:1;">📌 ${escapeHtml(m.name || 'Метка')} <span style="opacity:.6;">${m.hold ? '(' + escapeHtml(m.hold) + ')' : ''}</span>${Array.isArray(m.toUids) && m.toUids.length ? ' <span style="color:#e6b800;">🔒 ' + escapeHtml(gmUidsText(m.toUids)) + '</span>' : ''}</span>
                <button style="font-size:11px; padding:1px 6px;" onclick="gmMapRemoveMark('${jsq(m.id)}')" title="Убрать метку у игроков">🗑</button></div>`).join('')
            : '<div style="font-size:12px; opacity:.6;">Игрокам пока не выставлено ни одной своей метки.</div>';
    }
    // координаты точки для записи в сессию: x,y — схема, u,v — доли картинки владения (если есть)
    function gmPosOf(sel) {
        const o = { x: Math.round(sel.x), y: Math.round(sel.y) };
        if (typeof sel.u === 'number' && typeof sel.v === 'number') { o.u = sel.u; o.v = sel.v; }
        return o;
    }
    window.gmMapAddMark = function () {
        const res = el('gm-map-result');
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { res.textContent = 'Сначала выбери точку на карте (в приближении владения) или метку места.'; return; }
        if (!currentCode) { res.textContent = 'Нет активной сессии.'; return; }
        const name = ((el('gm-map-label').value || '').trim() || gmMapSel.name || 'Метка').slice(0, 60);
        const mark = Object.assign({ id: 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name, hold: gmMapSel.hold || gmMapHold || '', ts: Date.now() }, gmPosOf(gmMapSel));
        const tUids = gmTargetUids();
        if (tUids) mark.toUids = tUids;   // метка только для этих игроков (без поля — для всех)
        const next = gmMapMarks().concat([mark]);
        db.collection('sessions').doc(currentCode).update({ mapMarks: next }).then(() => {
            res.innerHTML = `<span style="color:#2ecc71;">📌 Метка «${escapeHtml(name)}» теперь видна ${tUids ? 'только: ' + escapeHtml(gmUidsText(tUids)) : 'игрокам'}.</span>`;
            gmMapSel = null; el('gm-map-label').value = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapRemoveMark = function (id) {
        if (!currentCode) return;
        const next = gmMapMarks().filter(m => m.id !== id);
        db.collection('sessions').doc(currentCode).update({ mapMarks: next }).then(() => {
            el('gm-map-result').textContent = 'Метка убрана у игроков.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmMapShowSel() {
        const b = el('gm-map-selected');
        if (!b) return;
        const p = gmMapParty();
        let t = p ? `Сейчас у игроков: <strong>${escapeHtml(p.name || 'своя точка')}</strong>${p.hold ? ' (' + escapeHtml(p.hold) + ')' : ''}. ` : 'Метка партии не стоит. ';
        t += gmMapSel ? `Выбрано: <strong>${escapeHtml(gmMapSel.name || 'точка на карте')}</strong>${gmMapSel.hold ? ' (' + escapeHtml(gmMapSel.hold) + ')' : ''}.` : 'Выбери город или точку на карте.';
        b.innerHTML = t;
    }
    window.gmMapPickSettle = function (v) {
        if (!v) return;
        const [h, n] = v.split('|'), c = window.HoldsMap.SETTLE[h] && window.HoldsMap.SETTLE[h][n];
        if (!c) return;
        const ovS = window.HoldsMap.settleOvOf(gmSettleOv(), h, n);   // назначенное мастером положение важнее условного
        gmMapSel = ovS ? gmSettleSel(h, n, ovS.x, ovS.y, ovS.u, ovS.v) : gmSettleSel(h, n, c[0], c[1]);
        const s = el('gm-map-settle'); if (s) s.value = '';
        gmMapShowSel(); window.renderGmMap(true);
    };
    window.gmMapPickHold = function (h) { gmMapHold = h || ''; gmMapSel = null; window.renderGmMap(true); };
    window.gmMapSetParty = function () {
        if (!gmMapSel) { el('gm-map-result').textContent = 'Сначала выбери город или точку на карте.'; return; }
        if (!currentCode) { el('gm-map-result').textContent = 'Нет активной сессии.'; return; }
        const pos = Object.assign({ hold: gmMapSel.hold || '', name: gmMapSel.name || '' }, gmPosOf(gmMapSel));
        const upd = { partyPos: pos };
        if (pos.hold) upd.currentHold = pos.hold;
        // туман войны: партия открывает карту вокруг себя (след остаётся)
        const f = gmFog();
        if (f.on && f.auto && gmFogAdd(f, { x: pos.x, y: pos.y, r: f.r, hold: pos.hold, u: pos.u, v: pos.v })) upd.mapFog = gmClean(f);
        db.collection('sessions').doc(currentCode).update(upd).then(() => {
            el('gm-map-result').innerHTML = `<span style="color:#2ecc71;">✅ Партия: ${escapeHtml(pos.name || 'точка на карте')}${pos.hold ? ' (' + escapeHtml(pos.hold) + ')' : ''}.</span>`;
            gmPostLogEntryText(`🗺️ Партия прибывает: ${pos.name || 'новое место'}${pos.hold ? ' (' + pos.hold + ')' : ''}.`);
            gmMapSel = null;
            if ((el('travel-encounter-on') || {}).checked) window.gmRollTravelEncounter();
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapClearParty = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ partyPos: null }).then(() => {
            el('gm-map-result').textContent = 'Метка партии убрана.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Туман войны (панель мастера) ----------
    function gmFogShowInfo() {
        const b = el('gm-fog-info'), btn = el('gm-fog-toggle'), auto = el('gm-fog-auto');
        const f = gmFog();
        if (btn) btn.textContent = f.on ? '🌫 Туман войны: ВКЛ (нажми, чтобы выключить)' : '🌫 Туман войны: выкл (нажми, чтобы включить)';
        if (auto && document.activeElement !== auto) auto.checked = f.auto;
        if (b) b.innerHTML = f.on
            ? `Открыто: кругов — <b>${f.circles.length}</b>, владений целиком — <b>${f.holds.length}</b>${f.holds.length ? ' (' + f.holds.map(escapeHtml).join(', ') + ')' : ''}. Игроки видят карту только вокруг партии, открытых мест, меток и открытых областей; на твоей карте закрытое слегка затемнено.`
            : 'Выключен: игроки видят всю карту. Включи — и карта закроется туманом, а «Партия здесь» будет открывать окрестности.';
    }
    window.gmFogToggle = function () {
        const f = gmFog(); f.on = !f.on;
        if (f.on && !f.circles.length) { const p = gmMapParty(); if (p) gmFogAdd(f, { x: p.x, y: p.y, r: f.r, hold: p.hold, u: p.u, v: p.v }); }
        gmFogWrite(f, f.on ? '🌫 Туман войны включён.' : 'Туман войны выключен — игроки видят всю карту.');
    };
    window.gmFogSetAuto = function (v) { const f = gmFog(); f.auto = !!v; gmFogWrite(f); };
    window.gmFogRevealHere = function () {
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { el('gm-map-result').textContent = 'Сначала выбери точку на карте.'; return; }
        const f = gmFog(); f.on = true;
        const r = +(el('gm-fog-r') || {}).value || f.r;
        const added = gmFogAdd(f, { x: gmMapSel.x, y: gmMapSel.y, r, hold: gmMapSel.hold || gmMapHold, u: gmMapSel.u, v: gmMapSel.v });
        if (!added) { el('gm-map-result').textContent = f.circles.length >= GM_FOG_MAX ? 'Слишком много открытых кругов — открой владение целиком или сбрось туман.' : 'Эта область уже открыта.'; return; }
        gmFogWrite(f, '🔆 Область открыта.');
    };
    window.gmFogRevealHold = function (open) {
        const h = (gmMapSel && gmMapSel.hold) || gmMapHold;
        if (!h) { el('gm-map-result').textContent = 'Выбери владение (приблизь его или выбери точку в нём).'; return; }
        const f = gmFog(); f.on = true;
        f.holds = f.holds.filter(x => x !== h);
        if (open) f.holds.push(h);
        gmFogWrite(f, open ? `🔆 Владение «${escapeHtml(h)}» открыто целиком.` : `Владение «${escapeHtml(h)}» снова скрыто (открытые круги остаются).`);
    };
    window.gmFogReset = function () {
        if (!confirm('Закрыть всю карту туманом заново? Открытые области и владения будут забыты.')) return;
        const f = gmFog(); f.circles = []; f.holds = [];
        gmFogWrite(f, 'Туман сброшен: вся карта закрыта.');
    };

    // ---------- Маршруты и расстояния (панель мастера) ----------
    function gmCfgFill() {
        const c = gmCfg();
        [['gm-cfg-km', c.kmPerUnit], ['gm-cfg-foot', c.foot], ['gm-cfg-horse', c.horse], ['gm-cfg-cart', c.cart], ['gm-cfg-ship', c.ship]].forEach(([id, v]) => {
            const i = el(id); if (i && document.activeElement !== i) i.value = v;
        });
    }
    window.gmCfgSave = function () {
        if (!currentCode) return;
        const g = id => parseFloat((el(id) || {}).value);
        const cfg = { kmPerUnit: g('gm-cfg-km'), foot: g('gm-cfg-foot'), horse: g('gm-cfg-horse'), cart: g('gm-cfg-cart'), ship: g('gm-cfg-ship') };
        Object.keys(cfg).forEach(k => { if (!(cfg[k] > 0)) delete cfg[k]; });
        db.collection('sessions').doc(currentCode).update({ mapCfg: cfg }).then(() => {
            el('gm-map-result').innerHTML = '<span style="color:#2ecc71;">Масштаб и скорости сохранены.</span>';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmRouteText(r) {
        const legs = r.legs.filter(l => l.km > 0.5).map(l => `${escapeHtml(l.from || 'точка')} → ${escapeHtml(l.to || 'точка')} <span style="opacity:.7;">(${l.type === 'road' ? 'дорога' : l.type === 'sea' ? 'море' : 'бездорожье'}, ${Math.round(l.km)} км)</span>`);
        return `<div>${escapeHtml(window.HoldsMap.describeRoute(r))}</div>${legs.length ? '<div style="font-size:12px; opacity:.85; margin-top:3px;">' + legs.join('<br>') + '</div>' : ''}`;
    }
    window.gmRoutePlan = function () {
        const out = el('gm-route-info'), party = gmMapParty();
        if (!party) { out.textContent = 'Сначала поставь метку партии («📍 Партия здесь»).'; return; }
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { out.textContent = 'Выбери на карте город или точку назначения.'; return; }
        const nm = n => (n && window.HoldsMap.NODES[n]) ? n : '';
        const r = window.HoldsMap.planRoute(Object.assign({ name: nm(party.name) }, party), Object.assign({ name: nm(gmMapSel.name) }, gmMapSel), lastData && lastData.mapCfg, gmSettleOv());
        gmRoute = { pts: r.pts, r, from: party.name || 'партия', to: gmMapSel.name || 'выбранная точка' };
        out.innerHTML = `<b>${escapeHtml(gmRoute.from)} → ${escapeHtml(gmRoute.to)}</b>` + gmRouteText(r);
        window.renderGmMap(true);
    };
    window.gmRoutePublish = function () {
        if (!gmRoute) { el('gm-route-info').textContent = 'Сначала проложи маршрут.'; return; }
        if (!currentCode) return;
        const r = gmRoute.r;
        const tr = gmClean({ ts: Date.now(), from: gmRoute.from, to: gmRoute.to, km: Math.round(r.km), direct: Math.round(r.direct), kmRoad: Math.round(r.kmRoad), kmOff: Math.round(r.kmOff), kmSea: Math.round(r.kmSea),
            days: { foot: +r.days.foot.toFixed(2), horse: +r.days.horse.toFixed(2), cart: +r.days.cart.toFixed(2) },
            pts: r.pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), name: p.name || undefined, hold: p.hold || undefined, u: p.u, v: p.v })) });
        db.collection('sessions').doc(currentCode).update({ travelRoute: tr }).then(() => {
            el('gm-route-info').innerHTML += '<div style="color:#2ecc71; margin-top:4px;">📣 Маршрут показан игрокам.</div>';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmRouteClear = function () {
        gmRoute = null; el('gm-route-info').textContent = 'Маршрут убран.';
        if (currentCode && lastData && lastData.travelRoute) db.collection('sessions').doc(currentCode).update({ travelRoute: null }).catch(e => alert('Ошибка: ' + e.message));
        window.renderGmMap(true);
    };
    // открывает туман кругами вдоль проложенного маршрута
    window.gmRouteReveal = function () {
        if (!gmRoute) { el('gm-route-info').textContent = 'Сначала проложи маршрут.'; return; }
        const f = gmFog(); f.on = true;
        const step = Math.max(10, f.r * 1.1); let added = 0;
        for (let i = 0; i + 1 < gmRoute.pts.length; i++) {
            const a = gmRoute.pts[i], b = gmRoute.pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(d / step));
            for (let k = 0; k <= n; k++) {
                const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
                const hk = window.HoldsMap.holdAt(x, y) || undefined;
                if (gmFogAdd(f, { x, y, r: f.r, hold: hk })) added++;
            }
        }
        gmFogWrite(f, `🔆 Открыто вдоль маршрута: ${added} областей.`);
    };

    window.setSessionTimeWeather = function () {
        const region = el('weather-region-select').value;
        const season = el('weather-season-select').value;
        const hold = el('weather-hold-select').value;
        const period = el('weather-time-select').value;
        const weatherKey = pendingWeatherKey || 'clear';
        db.collection('sessions').doc(currentCode).update({
            currentRegion: region, currentHold: hold, timePeriod: period, currentWeather: weatherKey
        }).then(() => {
            el('weather-gm-result').innerHTML = `<span style="color:#2ecc71;">✅ Применено: ${period}, ${region}${hold ? ' (' + hold + ')' : ''}, ${WEATHER_LABELS[weatherKey]}.</span>`;
            gmPostLogEntryText(`🌤️ ${period}, ${region}${hold ? ' (' + hold + ')' : ''}: ${WEATHER_LABELS[weatherKey]}.`);
            pendingWeatherKey = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Задача F: праздник вручную ----------
    function renderHolidaySelect() {
        const sel = el('holiday-manual-select');
        if (!sel || sel.options.length || !window.holidaysData) return;
        sel.innerHTML = window.holidaysData.map((h, i) => `<option value="${i}">${escapeHtml(h.title)}${h.discount ? ' (скидка до ' + h.discount + '%)' : ''}</option>`).join('');
    }

    window.launchHolidayManually = function () {
        const idx = parseInt(el('holiday-manual-select').value);
        const h = window.holidaysData[idx];
        if (!h) return;
        db.collection('sessions').doc(currentCode).update({ activeHoliday: { title: h.title, discount: h.discount || null, discountOnly: h.discountOnly || null } }).then(() => {
            el('holiday-gm-result').innerHTML = `<span style="color:#2ecc71;">✅ Запущено: «${escapeHtml(h.title)}»${h.discount ? ' (скидка до ' + h.discount + '%)' : ''}.</span>`;
            gmPostLogEntryText(`🎉 Мастер запускает праздник: «${h.title}»!`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.clearActiveHoliday = function () {
        db.collection('sessions').doc(currentCode).update({ activeHoliday: null }).then(() => {
            el('holiday-gm-result').innerHTML = 'Праздник остановлен.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Задача I: групповые проверки ----------

    function renderGroupCheckSkillSelect() {
        const sel = el('group-check-skill-select');
        if (!sel || sel.options.length) return;
        sel.innerHTML = SKILL_NAMES_BY_IDX.map((name, i) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }

    window.requestGroupCheck = function () {
        const skill = el('group-check-skill-select').value;
        const dc = parseInt(el('group-check-dc').value) || null;
        db.collection('sessions').doc(currentCode).update({
            groupCheck: { skill, dc, requestedAt: Date.now(), results: {} }
        }).then(() => {
            gmPostLogEntryText(`📣 Мастер просит групповой бросок: «${skill}»${dc ? ' (порог ' + dc + ')' : ''}!`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function renderGroupCheckResults() {
        const el2 = el('group-check-results');
        if (!el2) return;
        const gc = lastData.groupCheck;
        if (!gc) { el2.innerHTML = '<p style="opacity:.6; font-size:13px;">Запросов не было.</p>'; return; }
        const results = gc.results || {};
        const uids = Object.keys(lastData.participants || {});
        el2.innerHTML = `<strong>«${escapeHtml(gc.skill)}»${gc.dc ? ' (порог ' + gc.dc + ')' : ''}:</strong><br>` +
            uids.map(uid => {
                const pname = (lastData.participants[uid] || {}).name || uid;
                const r = results[uid];
                if (!r) return `<div>⏳ ${escapeHtml(pname)}: ждём бросок...</div>`;
                const passed = gc.dc ? (r.total >= gc.dc ? '✅' : '❌') : '🎲';
                return `<div>${passed} ${escapeHtml(pname)}: ${r.total} (к20 ${r.roll}${r.mod >= 0 ? '+' : ''}${r.mod})</div>`;
            }).join('');
    }

    // ---------- Задача I.2: кооперативная атака ----------

    function populateCoopSelects() {
        const uids = Object.keys(lastData.participants || {});
        ['coop-player1-select', 'coop-player2-select'].forEach(id => {
            const sel = el(id);
            if (!sel) return;
            const prev = sel.value;
            sel.innerHTML = '<option value="">— выбери —</option>' + uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
            if (uids.includes(prev)) sel.value = prev;
        });
        const targetSel = el('coop-target-select');
        if (targetSel) {
            const alive = (lastData.enemies || []).filter(e => (e.curHp || 0) > 0);
            const prev = targetSel.value;
            targetSel.innerHTML = alive.length
                ? alive.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (HP ${e.curHp}/${e.maxHp})</option>`).join('')
                : '<option value="">Нет живых целей</option>';
            if (alive.some(e => e.id === prev)) targetSel.value = prev;
        }
    }

    window.rollCoopAttack = function () {
        const p1 = el('coop-player1-select').value;
        const p2 = el('coop-player2-select').value;
        const targetId = el('coop-target-select').value;
        const resultEl = el('coop-attack-result');
        if (!p1 || !p2 || p1 === p2) { alert('Выбери двух РАЗНЫХ игроков.'); return; }
        if (!targetId) { alert('Выбери цель.'); return; }
        Promise.all([
            db.collection('characters').doc(p1).get(),
            db.collection('characters').doc(p2).get()
        ]).then(([d1, d2]) => {
            const target = (lastData.enemies || []).find(e => e.id === targetId);
            if (!target) { alert('Цель уже не найдена.'); return; }
            // Каждый бьёт тем, что у него в руках: лук/арбалет — урон дальнего оружия и ЛОВ, иначе ближнее и СИЛ.
            const side = (data, uid) => {
                const ranged = data.activeWep === 'ranged' && (parseInt(data.wepRDmg) || 0) > 0;
                const es = data.effectiveStats && !Array.isArray(data.effectiveStats) ? data.effectiveStats : {};
                const stat = parseInt(ranged ? es.dex : es.str) || 10;
                // Итоговый урон с листа игрока (Сила/Ловкость, перки, чары); база оружия — только для старых листов без этого поля.
                const full = data.coopDmg && typeof data.coopDmg === 'object' ? parseInt(ranged ? data.coopDmg.ranged : data.coopDmg.melee) : NaN;
                return { uid, name: (lastData.participants[uid] || {}).name || uid, ranged, dmg: !isNaN(full) && full > 0 ? full : (parseInt(ranged ? data.wepRDmg : data.wepMDmg) || 0), mod: calcAbilityMod(stat) };
            };
            const a = side(d1.exists ? d1.data() : {}, p1), b = side(d2.exists ? d2.data() : {}, p2);
            // Встречный бросок, как у обычной атаки: к20 + лучший модификатор из двух против голого к20 цели; ничья — перекид.
            const mod = Math.max(a.mod, b.mod);
            let roll, total, enemyRoll, rerolls = 0;
            do { roll = Math.floor(Math.random() * 20) + 1; total = roll + mod; enemyRoll = Math.floor(Math.random() * 20) + 1; if (total !== enemyRoll) break; rerolls++; } while (rerolls < 20);
            const hit = total > enemyRoll;
            // Резисты цели — по каждому удару отдельно (физический урон), как при обычной атаке игрока.
            const pv = x => window.StCombat && window.StCombat.previewDamage ? window.StCombat.previewDamage(target, x.dmg, 'physical', 0) : { finalDmg: x.dmg, resist: 0 };
            const fa = pv(a), fb = pv(b);
            const totalDmg = hit ? fa.finalDmg + fb.finalDmg : 0;
            const killer = (fa.finalDmg >= fb.finalDmg ? a : b).uid;
            pendingCoopAttack = { targetId, dmg: totalDmg, hit, name1: a.name, name2: b.name, targetName: target.name, killer };
            const part = (x, f) => `${escapeHtml(x.name)}: ${x.ranged ? 'дальнее' : 'ближнее'} ${x.dmg}${f.resist ? ` → ${f.finalDmg} (резист ${f.resist}%)` : ''}`;
            resultEl.innerHTML = `<strong>${escapeHtml(a.name)} + ${escapeHtml(b.name)}</strong> атакуют «${escapeHtml(target.name)}» одновременно.<br>` +
                `Бросок: 1d20 (${roll}) ${mod >= 0 ? '+' : ''}${mod} = <strong>${total}</strong> vs цель 1d20 = <strong>${enemyRoll}</strong>${rerolls ? ` (перекид ×${rerolls})` : ''} — ${hit ? '<strong style="color:#2ecc71;">ПОПАДАНИЕ</strong>' : '<strong style="color:#7a7a7a;">ПРОМАХ</strong>'}<br>` +
                (hit ? `Урон: <span style="color:#e74c3c; font-weight:bold;">${totalDmg}</span> (${part(a, fa)}; ${part(b, fb)})<br>` : '') +
                `<button class="btn-success" style="width:100%; margin-top:6px;" onclick="applyCoopAttackDamage()">✅ ${hit ? 'Применить урон' : 'Записать промах'}</button>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    let pendingCoopAttack = null;

    window.applyCoopAttackDamage = function () {
        if (!pendingCoopAttack) return;
        const { targetId, dmg, hit, name1, name2, targetName, killer } = pendingCoopAttack;
        if (!hit) {
            gmPostLogEntryText(`⚔️ ${name1} + ${name2} совместно атакуют «${targetName}» — промах.`);
            el('coop-attack-result').innerHTML = ''; pendingCoopAttack = null; return;
        }
        // Мастер сам пишет в сессию напрямую через свой db — моста к cloud.js не нужно
        // (gm.html вообще его не подключает).
        const enemies = (lastData.enemies || []).slice();
        const idx = enemies.findIndex(e => e.id === targetId);
        if (idx === -1) { alert('Цель уже не найдена.'); return; }
        const newHp = Math.max(0, (enemies[idx].curHp || 0) - dmg);
        // Кто ранил/добил — для добычи с трупа (gmCorpseKiller): игрок с бóльшим уроном в этом ударе.
        const upd = { curHp: newHp, lastHitBy: killer };
        if (newHp <= 0 && (enemies[idx].curHp || 0) > 0) { upd.killedBy = killer; upd.diedAtTurn = (lastData && lastData.sessionTurnCounter) || 0; }
        enemies[idx] = Object.assign({}, enemies[idx], upd);
        gmUpdateEnemies(enemies).then(() => {
            gmPostLogEntryText(`⚔️ ${name1} + ${name2} совместно бьют «${targetName}»: −${dmg} урона${newHp <= 0 ? ' — повержен(а)' : ''}.`);
            el('coop-attack-result').innerHTML = '';
            pendingCoopAttack = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Шторки для всех панелей мастера (gm.html стал очень длинным) ----------
    // Тот же механизм, что и у игрока (initSectionAccordions в index.html), но без привязки к
    // вкладкам — тут одна длинная страница, просто берём все .panel целиком.
    // По жалобе "сайт визуально перегружен" — панелей у мастера накопилось уже больше 20, и все
    // раньше открывались развёрнутыми по умолчанию при каждой загрузке страницы. Теперь свёрнуты
    // все, КРОМЕ самых нужных в бою постоянно (Отряд/Противники) — остальные открываются по клику.
    const GM_PANELS_OPEN_BY_DEFAULT = ['Отряд', 'Противники'];
    function initGmSectionAccordions() {
        let counter = 0;
        document.querySelectorAll('.panel').forEach(panel => {
            if (panel.dataset.secId) return; // уже обработана — не оборачиваем повторно
            const h2 = panel.querySelector(':scope > h2');
            if (!h2) return;
            const panelId = 'gm-sec-' + (counter++);
            panel.dataset.secId = panelId;

            const body = document.createElement('div');
            body.className = 'section-body';
            body.id = panelId + '-body';

            const kids = Array.from(panel.children);
            let afterH2 = false;
            kids.forEach(ch => {
                if (ch === h2) { afterH2 = true; return; }
                if (afterH2) body.appendChild(ch);
            });
            panel.appendChild(body);

            const titleText = h2.textContent.trim();
            const keepOpen = GM_PANELS_OPEN_BY_DEFAULT.some(t => titleText.includes(t));
            if (!keepOpen) body.style.display = 'none';

            h2.classList.add('section-header');
            h2.innerHTML = `<span class="section-title">${h2.innerHTML}</span><span class="section-chevron">${keepOpen ? '▾' : '▸'}</span>`;
            h2.addEventListener('click', () => toggleGmSectionById(panelId));
        });
    }

    window.toggleGmSectionById = function (panelId) {
        const panel = document.querySelector(`[data-sec-id="${panelId}"]`);
        if (!panel) return;
        const body = document.getElementById(panelId + '-body');
        const chev = panel.querySelector('.section-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (chev) chev.textContent = isOpen ? '▸' : '▾';
        // Открыли панель «Шёпот» — входящие считаются прочитанными, бейдж инбокса надо пересчитать сразу.
        try { gmRenderInbox(); } catch (e) { }
    };


    // ========================================================================
    // ЭПИК 3: пульт (3.1), сетка врагов (3.2), заготовки (3.6), таймеры (3.7), шаблоны NPC (3.8), сюжет (3.9)
    // Всё хранится в localStorage мастера (кроме самой сессии) — это его личные заготовки.
    // ========================================================================
    function lsGet(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
    function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { alert('Не удалось сохранить в браузере: ' + e.message); } }

    // ---- Эпик 1 (ТЗ-2): табы мастера ----
    // Раньше (эпик 3.1 / TASK-003) кнопки пульта лишь сворачивали панели чужих групп по совпадению заголовка,
    // и после перехода к нужной панели мастер листал обратно к пульту. Теперь группа панели задана в разметке
    // (data-gm-tab), панели других групп скрыты целиком, а пульт липкий. Шторки внутри панелей работают как раньше.
    const GM_TABS = { combat: 'Бой', scene: 'Сцена', rewards: 'Награды', world: 'Мир', refs: 'Справочники' };
    const GM_TAB_ORDER = ['combat', 'scene', 'rewards', 'world', 'refs'];
    // Старые группы пульта → новые табы: чтобы после обновления открылась привычная группа, а не всегда «Бой».
    const GM_TAB_FROM_OLD_GROUP = { combat: 'combat', scene: 'scene', rewards: 'rewards', prep: 'world', randoms: 'world', other: 'world' };
    let _gmTabsWarned = false;
    function gmSavedTab() {
        let t = null;
        try { t = localStorage.getItem('gmActiveTab'); } catch (e) { }
        if (GM_TABS[t]) return t;
        return GM_TAB_FROM_OLD_GROUP[lsGet('skyrim_gm_dash_group', '')] || 'combat';
    }
    // Новая панель без data-gm-tab видна во ВСЕХ табах — предупреждаем один раз, чтобы автор её разметил.
    function gmWarnUntabbedPanels() {
        if (_gmTabsWarned) return; _gmTabsWarned = true;
        const loose = Array.from(document.querySelectorAll('#session-block > .panel:not([data-gm-tab])'))
            .filter(p => p.querySelector(':scope > h2')) // шапка с кодом сессии без заголовка видна всегда — так задумано
            .map(p => p.querySelector(':scope > h2').textContent.replace(/[▸▾]/g, '').trim());
        if (loose.length) console.warn('[gm-tabs] Панели без data-gm-tab (видны во всех табах):', loose);
    }
    // opts.noScroll — при восстановлении таба после загрузки/входа в сессию не дёргать страницу.
    window.openGmTab = function (tabName, opts) {
        if (!GM_TABS[tabName]) tabName = 'combat';
        document.querySelectorAll('.panel[data-gm-tab]').forEach(p => { p.style.display = p.dataset.gmTab === tabName ? '' : 'none'; });
        // Обёртки-сетки (.grid-2), в которых не осталось видимых панелей, тоже прячем — иначе пустой отступ между панелями.
        document.querySelectorAll('#session-block .grid-2').forEach(w => {
            const tabbed = w.querySelectorAll(':scope > .panel[data-gm-tab]');
            if (!tabbed.length) return;
            const any = Array.from(w.children).some(c => !c.matches('.panel[data-gm-tab]') || c.dataset.gmTab === tabName);
            w.style.display = any ? '' : 'none';
        });
        document.querySelectorAll('#gm-dashboard .dash-btn[data-gm-tab]').forEach(b => {
            const on = b.dataset.gmTab === tabName;
            b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        try { localStorage.setItem('gmActiveTab', tabName); } catch (e) { }
        gmWarnUntabbedPanels();
        if (!(opts && opts.noScroll)) {
            // Не в самый верх страницы (там заголовок и чеклист), а к началу содержимого сессии — сразу под пультом.
            const sb = el('session-block'), dash = el('gm-dashboard');
            if (sb && sb.offsetParent !== null) {
                const top = sb.getBoundingClientRect().top + window.scrollY - ((dash && dash.offsetHeight) || 0) - 6;
                if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }
        }
        try { gmRenderInbox(); } catch (e) { }
    };
    // Совместимость со старым именем (эпик 3.1 / TASK-003): старые группы переводятся в новые табы.
    function gmShowGroup(group) { window.openGmTab(GM_TABS[group] ? group : GM_TAB_FROM_OLD_GROUP[group], { noScroll: true }); }
    window.gmShowGroup = gmShowGroup;
    // Пульт с табами нужен только в сессии: на экране входа/создания табам нечего показывать.
    function gmSetInSession(on) { document.body.classList.toggle('gm-in-session', !!on); }
    // Alt+1…Alt+5. Ctrl+цифра браузер забирает себе (переключение вкладок браузера), поэтому Alt.
    // По e.code, а не e.key: на Mac Alt+1 печатает «¡», и key был бы не цифрой.
    document.addEventListener('keydown', ev => {
        if (!ev.altKey || ev.ctrlKey || ev.metaKey || !currentCode) return;
        const m = /^Digit([1-5])$/.exec(ev.code || ''); if (!m) return;
        const t = ev.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // не мешать вводу
        ev.preventDefault();
        window.openGmTab(GM_TAB_ORDER[+m[1] - 1]);
    });
    const GM_CHECKLIST_LABELS = 5;
    function gmChecklistInit() {
        const box = el('gm-first-checklist'); if (!box) return;
        const done = localStorage.getItem('gmFirstSessionDone');
        const state = lsGet('gmFirstChecklist', []);
        box.style.display = done ? 'none' : 'block';
        box.querySelectorAll('input[data-ck]').forEach(cb => {
            cb.checked = !!state[+cb.dataset.ck];
            cb.onchange = () => {
                const st = []; box.querySelectorAll('input[data-ck]').forEach(c => { st[+c.dataset.ck] = c.checked; });
                lsSet('gmFirstChecklist', st);
                if (st.filter(Boolean).length >= GM_CHECKLIST_LABELS) { try { localStorage.setItem('gmFirstSessionDone', '1'); } catch (e) { } box.style.display = 'none'; }
            };
        });
    }
    function gmDashboardInit() {
        document.querySelectorAll('#gm-dashboard .dash-btn[data-gm-tab]').forEach(b => { b.onclick = () => window.openGmTab(b.dataset.gmTab); });
        const r = el('gm-checklist-reset');
        if (r) r.onclick = () => { try { localStorage.removeItem('gmFirstSessionDone'); localStorage.removeItem('gmFirstChecklist'); } catch (e) { } gmChecklistInit(); };
        gmChecklistInit();
        // Таб применяем сразу (панели лежат в скрытом session-block, на экране входа это ничего не ломает) —
        // тогда при входе в сессию не мелькают на миг все 47 панелей. enterSessionView применит его ещё раз.
        window.openGmTab(gmSavedTab(), { noScroll: true });
    }
    document.addEventListener('DOMContentLoaded', () => setTimeout(gmDashboardInit, 0));
    if (document.readyState !== 'loading') setTimeout(gmDashboardInit, 0);

    // ---- TASK-005: инбокс мастера ----
    // Всё, что ждёт решения мастера, раньше было разбросано по разным панелям (заявки — в «Гильдиях», руны — в сетке,
    // шёпот — в «Сцене»), и заявку можно было не заметить полсессии. Инбокс только СОБИРАЕТ счётчики и ведёт к панели;
    // сами решения принимаются там же, где и раньше.
    const GM_INBOX_CRAFT_STALE_MS = 3 * 24 * 3600 * 1000; // «старый» заказ NPC — 3 реальных дня (в заказе нет игровой даты)
    const GM_INBOX_CRAFT_REFRESH_MS = 5 * 60 * 1000;     // заказы лежат в листах игроков, читаем их не чаще раза в 5 минут
    let _gmCraftStale = { key: '', fetchedAt: 0, count: 0 };
    let _gmInboxList = [];
    const gmArr = v => Array.isArray(v) ? v : [];
    function gmWhisperSeenKey() { return 'skyrim_gm_whisper_seen_' + currentCode; }
    // Храним ts последнего ПРОЧИТАННОГО шёпота (а не время открытия панели): ts ставит браузер игрока,
    // и при расхождении часов сравнение с Date.now() мастера давало бы ложные «новые».
    function gmWhisperSeenTs() { try { return parseInt(localStorage.getItem(gmWhisperSeenKey())) || 0; } catch (e) { return 0; } }
    function gmMarkWhispersSeenIfVisible() {
        const list = el('gm-whispers-list');
        // offsetParent === null — панель (или одна из внешних) свёрнута; в фоновой вкладке тоже никто не читает.
        if (!list || list.offsetParent === null || document.hidden) return;
        // До initGmSectionAccordions (снимок сессии может прийти раньше DOMContentLoaded) все панели ещё развёрнуты —
        // «видимость» тогда ничего не значит, и весь шёпот ложно считался бы прочитанным.
        if (!list.closest('.panel[data-sec-id]')) return;
        const maxTs = gmArr(lastData && lastData.whispers).reduce((m, w) => Math.max(m, w.ts || 0), 0);
        if (maxTs > gmWhisperSeenTs()) { try { localStorage.setItem(gmWhisperSeenKey(), String(maxTs)); } catch (e) { } }
    }
    // Заказы NPC живут в characters/{uid}.craftOrders (мастер их только рассылает), поэтому в документе сессии их не видно.
    // Возраст берём из id: 'order_' + Date.now() + случайный хвост — первые 13 цифр и есть время отправки.
    function gmRefreshCraftStale() {
        if (!currentCode || !lastData) return;
        const uids = Object.keys(lastData.participants || {}).sort();
        const key = currentCode + '|' + uids.join(',');
        const now = Date.now();
        if (key === _gmCraftStale.key && now - _gmCraftStale.fetchedAt < GM_INBOX_CRAFT_REFRESH_MS) return;
        _gmCraftStale.key = key; _gmCraftStale.fetchedAt = now;
        Promise.all(uids.map(u => db.collection('characters').doc(u).get()
            .then(doc => doc.exists ? gmArr(doc.data().craftOrders) : []).catch(() => [])))
            .then(lists => {
                if (_gmCraftStale.key !== key) return; // за время чтения сменилась сессия/состав — результат уже не про то
                let n = 0;
                lists.forEach(l => l.forEach(o => {
                    if (!o || o.status !== 'active') return;
                    const m = /^order_(\d{13})/.exec(String(o.id || ''));
                    if (m && now - parseInt(m[1]) > GM_INBOX_CRAFT_STALE_MS) n++;
                }));
                if (n !== _gmCraftStale.count) { _gmCraftStale.count = n; gmRenderInbox(); }
            });
    }
    function gmInboxItems() {
        const d = lastData || {};
        const items = [];
        // Цель — id элемента внутри нужной панели, а не таб: таб берётся из data-gm-tab той панели, где элемент лежит,
        // так что пункт не «потеряется», если панель перенесут в другой таб.
        const add = (count, label, targetId) => { if (count > 0) items.push({ count, label, action: () => gmJumpToPanel(targetId) }); };
        add(gmArr(d.questClaims).length, '📜 Заявки на квесты', 'quest-claims');
        add(gmArr(d.museumRequests).length, '🎼 Заявки в музей', 'museum-requests');
        const seen = gmWhisperSeenTs();
        add(gmArr(d.whispers).filter(w => (w.ts || 0) > seen).length, '🤫 Шёпот от игроков', 'gm-whispers-list');
        add(gmArr(d.pendingRunes).length, '✴ Руны к установке', 'gg-panel');
        add(gmArr(d.pendingZones).filter(z => z && z.place === 'gm').length, '🔥 Стены/камни к установке', 'gg-panel');
        add(_gmCraftStale.count, '📋 Старые заказы NPC (3+ дня)', 'craft-order-npc');
        return items;
    }
    window.gmInboxItems = gmInboxItems;
    function gmJumpToPanel(targetId) {
        const target = el(targetId); if (!target) return;
        const panel = target.closest('.panel[data-sec-id]'); if (!panel) return;
        const tabPanel = target.closest('.panel[data-gm-tab]');
        if (tabPanel) window.openGmTab(tabPanel.dataset.gmTab, { noScroll: true });
        // Панель может быть вложена в другую (как «Шёпот») — раскрываем всю цепочку, иначе подсветится невидимое.
        for (let p = panel; p; p = p.parentElement && p.parentElement.closest('.panel[data-sec-id]')) {
            const body = el(p.dataset.secId + '-body');
            if (body && body.style.display === 'none') window.toggleGmSectionById(p.dataset.secId);
        }
        gmInboxToggle(false);
        const dash = el('gm-dashboard');
        const top = panel.getBoundingClientRect().top + window.scrollY - ((dash && dash.offsetHeight) || 0) - 10; // пульт липкий — не прятать заголовок под ним
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        panel.classList.remove('st-flash'); void panel.offsetWidth; // перезапуск подсветки при повторном клике
        panel.classList.add('st-flash');
        setTimeout(() => panel.classList.remove('st-flash'), 1800);
        gmRenderInbox();
    }
    function gmInboxToggle(open) {
        const menu = el('gm-inbox-menu'); if (!menu) return;
        menu.hidden = open === undefined ? !menu.hidden : !open;
        if (!menu.hidden) {
            gmRenderInboxMenu();
            // Пульт теперь с overflow-x (на телефоне листается вбок) и обрезал бы список — ставим его fixed под кнопкой.
            const r = el('gm-inbox-btn').getBoundingClientRect();
            menu.style.top = Math.round(r.bottom + 4) + 'px';
            menu.style.left = Math.round(Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4))) + 'px';
        }
    }
    window.gmInboxToggle = gmInboxToggle;
    window.gmInboxPick = function (i) { const it = _gmInboxList[i]; if (it) it.action(); };
    function gmRenderInboxMenu() {
        const menu = el('gm-inbox-menu'); if (!menu) return;
        menu.innerHTML = _gmInboxList.map((it, i) =>
            `<button type="button" class="st-inbox-item" onclick="gmInboxPick(${i})"><span>${escapeHtml(it.label)}</span><b>${it.count}</b></button>`).join('');
    }
    function gmRenderInbox() {
        const btn = el('gm-inbox-btn'), menu = el('gm-inbox-menu');
        if (!btn || !menu) return;
        if (!currentCode || !lastData) { btn.style.display = 'none'; menu.hidden = true; return; }
        gmMarkWhispersSeenIfVisible();
        gmRefreshCraftStale();
        _gmInboxList = gmInboxItems();
        const n = _gmInboxList.reduce((s, it) => s + it.count, 0);
        btn.style.display = n > 0 ? '' : 'none';
        el('gm-inbox-count').textContent = n;
        if (!n) menu.hidden = true;
        else if (!menu.hidden) gmRenderInboxMenu();
    }
    window.gmRenderInbox = gmRenderInbox;
    // Клик мимо — закрыть список (как обычный выпадающий список).
    document.addEventListener('click', ev => {
        const menu = el('gm-inbox-menu');
        if (menu && !menu.hidden && !ev.target.closest('.st-inbox-wrap')) menu.hidden = true;
    });
    // Список стоит position:fixed под кнопкой — при прокрутке он «отъехал» бы от неё, проще закрыть.
    window.addEventListener('scroll', () => { const menu = el('gm-inbox-menu'); if (menu && !menu.hidden) menu.hidden = true; }, { passive: true });
    // Вернулись во вкладку с открытым «Шёпотом» — отметить прочитанным, пока мастер смотрит на него.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { gmRenderInbox(); } catch (e) { } } });

    // ---- 3.2 мини-сетка врагов ----
    function renderEnemyGrid(enemies) {
        const g = el('gm-enemy-grid'); if (!g) return;
        g.innerHTML = (enemies || []).map(e => {
            const dead = (e.curHp || 0) <= 0;
            const pct = Math.max(0, Math.min(100, (e.curHp || 0) / (e.maxHp || 1) * 100));
            const st = (e.statusEffects || []).length;
            const marked = lastData && lastData.markedTarget === e.id;
            return `<div class="enemy-tile${dead ? ' st-dead' : ''}${marked ? ' st-marked' : ''}" data-id="${escapeHtml(e.id)}" onclick="gmScrollToEnemy('${jsq(e.id)}')" title="${escapeHtml(e.name || '')} — ${e.curHp || 0}/${e.maxHp || 0}">
                <img src="${enemyAvatarData(e)}" alt=""><div class="st-tile-name">${escapeHtml(String(e.name || '?').slice(0, 15))}</div>
                <div class="st-tile-bar"><div style="width:${pct}%"></div></div>
                <div class="st-tile-st">${dead ? '☠' : ''}${marked ? '🎯' : ''}${st ? '🌀' + st : ''}</div></div>`;
        }).join('');
    }
    window.gmScrollToEnemy = function (id) {
        const row = document.querySelector('.enemy-row[data-enemy-id="' + String(id).replace(/"/g, '') + '"]'); if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.outline = '2px solid var(--accent-color, #c8a566)'; setTimeout(() => { row.style.outline = ''; }, 1400);
    };

    // ---- 3.6 заготовки энкаунтеров ----
    const ENC_KEY = 'skyrim_gm_encounters';
    function renderEncounterSelect() {
        const sel = el('gm-encounter-select'); if (!sel) return;
        const encs = lsGet(ENC_KEY, {}); const cur = sel.value;
        sel.innerHTML = '<option value="">— заготовки (' + Object.keys(encs).length + ') —</option>' + Object.keys(encs).map(id => `<option value="${escapeHtml(id)}">${escapeHtml(encs[id].name)} (${encs[id].enemies.length})</option>`).join('');
        if (encs[cur]) sel.value = cur;
    }
    // Заготовки (встречи, шаблоны NPC) хранят «снаряжение» врага (lootKit), а не уже брошенную добычу:
    // при каждой загрузке добыча бросается заново — золото ±50%, каждая вещь с шансом 75%. Раньше каждый
    // загруженный бандит нёс один и тот же лут, а встреча, сохранённая после обыска, — пустой труп.
    function gmTemplateClean(e) {
        const kit = e.lootKit || e.corpseLoot || null;
        delete e.corpseLoot;
        if (kit) e.lootKit = JSON.parse(JSON.stringify(kit)); else delete e.lootKit;
        return e;
    }
    function gmTemplateRollLoot(e) {
        if (!e.lootKit) return e;
        const k = e.lootKit;
        e.corpseLoot = stripUndefinedDeep({ gold: Math.round((parseInt(k.gold) || 0) * (0.5 + Math.random())), items: (k.items || []).filter(() => Math.random() < 0.75).map(i => Object.assign({}, i)) });
        return e;
    }
    window.gmSaveEncounter = function () {
        const enemies = lastData.enemies || [];
        if (!enemies.length) { alert('Врагов нет — нечего сохранять.'); return; }
        const name = (prompt('Название заготовки:', enemies.length + ' врагов') || '').trim(); if (!name) return;
        // Сохраняем «свежими»: полное здоровье, без статусов/меток трупа — заготовка описывает встречу, а не её ход.
        const copy = JSON.parse(JSON.stringify(enemies)).map(e => { e.curHp = e.maxHp; e.curMp = e.maxMp; delete e.statusEffects; delete e.looted; delete e.ashes; delete e.diedAtTurn; delete e.soulTaken; delete e.soulTrap; delete e.killedBy; delete e.lastHitBy; return gmTemplateClean(e); });
        const encs = lsGet(ENC_KEY, {}); encs['enc_' + Date.now()] = { name, enemies: copy };
        lsSet(ENC_KEY, encs); renderEncounterSelect();
    };
    window.gmLoadEncounter = function () {
        const id = el('gm-encounter-select').value; const enc = lsGet(ENC_KEY, {})[id];
        if (!enc) { alert('Выбери заготовку.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enc.enemies.forEach(e => enemies.push(gmTemplateRollLoot(gmTemplateClean(Object.assign({}, JSON.parse(JSON.stringify(e)), { id: genId('e') })))));
        gmUpdateEnemies(enemies).then(() => gmPostLogEntryText('⚔ Мастер выставляет встречу «' + enc.name + '».')).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmDeleteEncounter = function () {
        const id = el('gm-encounter-select').value; const encs = lsGet(ENC_KEY, {});
        if (!encs[id] || !confirm('Удалить заготовку «' + encs[id].name + '»?')) return;
        delete encs[id]; lsSet(ENC_KEY, encs); renderEncounterSelect();
    };

    // ---- 3.7 отложенные события ----
    const TIMER_KEY = 'skyrim_gm_timers';
    function renderGmTimers() {
        const box = el('gm-timers-list'); if (!box) return;
        const mine = lsGet(TIMER_KEY, []).filter(t => t.sessionCode === currentCode);
        box.innerHTML = mine.length ? mine.map(t => `<div class="stat-block" style="align-items:center;"><span>⏳ через <strong>${t.turnsLeft}</strong> х.: ${escapeHtml(t.label)}</span><button type="button" style="width:auto; padding:1px 7px; font-size:12px;" onclick="gmRemoveTimer('${jsq(t.id)}')">✕</button></div>`).join('') : '<span style="opacity:.6; font-size:13px;">Таймеров нет.</span>';
    }
    window.gmAddTimer = function () {
        const label = (el('gm-timer-label').value || '').trim(); const n = Math.max(1, parseInt(el('gm-timer-turns').value) || 1);
        if (!label || !currentCode) return;
        const all = lsGet(TIMER_KEY, []); all.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 4), label, turnsLeft: n, sessionCode: currentCode });
        lsSet(TIMER_KEY, all); el('gm-timer-label').value = ''; renderGmTimers();
    };
    window.gmRemoveTimer = function (id) { lsSet(TIMER_KEY, lsGet(TIMER_KEY, []).filter(t => t.id !== id)); renderGmTimers(); };
    // Вызывается из gmAdvanceTurn: уменьшает таймеры текущей сессии, возвращает подписи сработавших.
    function gmTickTimers() {
        const all = lsGet(TIMER_KEY, []); const fired = [];
        const rest = all.filter(t => {
            if (t.sessionCode !== currentCode) return true;
            t.turnsLeft--;
            if (t.turnsLeft <= 0) { fired.push(t.label); return false; }
            return true;
        });
        lsSet(TIMER_KEY, rest); renderGmTimers();
        if (fired.length) setTimeout(() => alert('⏰ Сработало отложенное событие:\n' + fired.join('\n')), 50);
        return fired;
    }
    function gmDropTimersFor(code) { lsSet(TIMER_KEY, lsGet(TIMER_KEY, []).filter(t => t.sessionCode !== code)); }

    // ---- 3.8 шаблоны NPC ----
    const TPL_KEY = 'skyrim_gm_npc_templates';
    function renderNpcTemplateSelect() {
        const sel = el('gm-npc-template-select'); if (!sel) return;
        const t = lsGet(TPL_KEY, []);
        sel.innerHTML = '<option value="">— шаблоны (' + t.length + '/20) —</option>' + t.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)} [${escapeHtml(x.kind)}]</option>`).join('');
    }
    window.gmSaveNpcTemplate = function (kind) {
        const src = { bandit: () => lastGeneratedBandit && banditEnemyObj(lastGeneratedBandit), mage: () => lastGeneratedMageBandit && mageBanditEnemyObj(lastGeneratedMageBandit), draugr: () => lastGeneratedDraugr && enemyFromGenerated(lastGeneratedDraugr), forsworn: () => lastGeneratedForsworn && enemyFromGenerated(lastGeneratedForsworn) }[kind];
        const data = src && src();
        if (!data) { alert('Сначала сгенерируй NPC (после «Добавить в бой» генератор очищается).'); return; }
        const list = lsGet(TPL_KEY, []);
        if (list.length >= 20) { alert('Шаблонов уже 20 — удали один.'); return; }
        const name = (prompt('Название шаблона:', data.name) || '').trim(); if (!name) return;
        delete data.id;
        list.push({ id: 'tpl' + Date.now(), name, kind, data: gmTemplateClean(JSON.parse(JSON.stringify(data))) });
        lsSet(TPL_KEY, list); renderNpcTemplateSelect();
        alert('Шаблон «' + name + '» сохранён.');
    };
    window.gmLoadNpcTemplate = function () {
        const id = el('gm-npc-template-select').value; const t = lsGet(TPL_KEY, []).find(x => x.id === id);
        if (!t) { alert('Выбери шаблон.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enemies.push(gmTemplateRollLoot(gmTemplateClean(Object.assign(JSON.parse(JSON.stringify(t.data)), { id: genId('e') }))));
        gmUpdateEnemies(enemies).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmDeleteNpcTemplate = function () {
        const id = el('gm-npc-template-select').value; const list = lsGet(TPL_KEY, []); const t = list.find(x => x.id === id);
        if (!t || !confirm('Удалить шаблон «' + t.name + '»?')) return;
        lsSet(TPL_KEY, list.filter(x => x.id !== id)); renderNpcTemplateSelect();
    };

    // ---- 3.9 дерево сюжета ----
    const PLOT_KEY = 'skyrim_gm_plot';
    function plotGet() { const p = lsGet(PLOT_KEY, null); return p && Array.isArray(p.nodes) ? p : { nodes: [] }; }
    const PLOT_COLORS = { active: '#2ecc71', done: '#8a8171', failed: '#e74c3c' };
    function renderPlot() {
        const svg = el('gm-plot-svg'); if (!svg) return;
        const nodes = plotGet().nodes;
        // Раскладка вручную: колонка = глубина от узлов без входящих связей, строки — по порядку внутри колонки.
        const incoming = {}; nodes.forEach(n => (n.links || []).forEach(l => { incoming[l] = true; }));
        const depth = {}; const byId = {}; nodes.forEach(n => { byId[n.id] = n; });
        let frontier = nodes.filter(n => !incoming[n.id]).map(n => n.id); frontier.forEach(id => { depth[id] = 0; });
        for (let guard = 0; guard < 50 && frontier.length; guard++) {
            const next = [];
            frontier.forEach(id => (byId[id].links || []).forEach(l => { if (byId[l] && (depth[l] === undefined || depth[l] < depth[id] + 1) && depth[id] + 1 < 20) { depth[l] = depth[id] + 1; next.push(l); } }));
            frontier = next;
        }
        nodes.forEach(n => { if (depth[n.id] === undefined) depth[n.id] = 0; }); // циклы/сироты
        const cols = {}; nodes.forEach(n => { (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n); });
        const maxCol = Math.max(0, ...Object.keys(cols).map(Number));
        const pos = {};
        Object.keys(cols).forEach(c => cols[c].forEach((n, i) => { pos[n.id] = { x: 60 + (maxCol ? c / maxCol : 0.5) * 480, y: 30 + (i + 0.5) * (200 / cols[c].length) }; }));
        let out = '<defs><marker id="st-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c8a566"/></marker></defs>';
        nodes.forEach(n => (n.links || []).forEach(l => { if (pos[l]) out += `<line x1="${pos[n.id].x}" y1="${pos[n.id].y}" x2="${pos[l].x}" y2="${pos[l].y}" stroke="#c8a566" stroke-width="1.5" marker-end="url(#st-arrow)" data-link="${escapeHtml(n.id)}-${escapeHtml(l)}"/>`; }));
        nodes.forEach(n => { const p = pos[n.id]; out += `<g data-node="${escapeHtml(n.id)}"><circle cx="${p.x}" cy="${p.y}" r="16" fill="${PLOT_COLORS[n.status] || '#c8a566'}" stroke="#17130e" stroke-width="2"/><text x="${p.x}" y="${p.y + 30}">${escapeHtml(String(n.title).slice(0, 22))}</text></g>`; });
        svg.innerHTML = out;
        const list = el('gm-plot-list');
        list.innerHTML = nodes.map(n => {
            const others = nodes.filter(o => o.id !== n.id && (n.links || []).indexOf(o.id) === -1);
            return `<div class="stat-block" style="align-items:center; flex-wrap:wrap; gap:4px;"><span style="color:${PLOT_COLORS[n.status]}">●</span> <strong>${escapeHtml(n.title)}</strong>
              <select style="width:auto; margin:0; padding:1px;" onchange="gmPlotSetStatus('${jsq(n.id)}', this.value)">${['active', 'done', 'failed'].map(s => `<option value="${s}"${n.status === s ? ' selected' : ''}>${{ active: 'идёт', done: 'закрыт', failed: 'провален' }[s]}</option>`).join('')}</select>
              <span style="font-size:12px; opacity:.8;">→ ${(n.links || []).map(l => escapeHtml((byId[l] || {}).title || '?') + ' <a href="#" onclick="gmPlotUnlink(\'' + jsq(n.id) + '\',\'' + jsq(l) + '\');return false;">✕</a>').join(', ') || '—'}</span>
              <select style="width:auto; margin:0; padding:1px;" onchange="gmPlotLink('${jsq(n.id)}', this.value); this.value='';"><option value="">+ связь →</option>${others.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.title)}</option>`).join('')}</select>
              <button type="button" class="btn-danger" style="width:auto; padding:1px 7px; font-size:12px;" onclick="gmPlotDelete('${jsq(n.id)}')">🗑</button></div>`;
        }).join('') || '<span style="opacity:.6; font-size:13px;">Узлов пока нет.</span>';
    }
    window.gmPlotAdd = function () {
        const title = (el('gm-plot-title').value || '').trim(); if (!title) return;
        const p = plotGet(); p.nodes.push({ id: 'n' + Date.now() + Math.random().toString(36).slice(2, 4), title, status: el('gm-plot-status').value, links: [] });
        lsSet(PLOT_KEY, p); el('gm-plot-title').value = ''; renderPlot();
    };
    window.gmPlotSetStatus = function (id, s) { const p = plotGet(); const n = p.nodes.find(x => x.id === id); if (n) { n.status = s; lsSet(PLOT_KEY, p); renderPlot(); } };
    window.gmPlotLink = function (id, to) { if (!to) return; const p = plotGet(); const n = p.nodes.find(x => x.id === id); if (n) { n.links = n.links || []; if (n.links.indexOf(to) === -1) n.links.push(to); lsSet(PLOT_KEY, p); renderPlot(); } };
    window.gmPlotUnlink = function (id, to) { const p = plotGet(); const n = p.nodes.find(x => x.id === id); if (n) { n.links = (n.links || []).filter(l => l !== to); lsSet(PLOT_KEY, p); renderPlot(); } };
    window.gmPlotDelete = function (id) { const p = plotGet(); p.nodes = p.nodes.filter(n => n.id !== id); p.nodes.forEach(n => { n.links = (n.links || []).filter(l => l !== id); }); lsSet(PLOT_KEY, p); renderPlot(); };
    // ---- 3.10 экспорт сессии: окно с печатным HTML + window.print() (без библиотек) ----
    window.gmExportSessionPdf = function () {
        const d = lastData || {};
        const log = d.combatLog || [];
        const parts = d.participants || {};
        const dead = (d.enemies || []).filter(e => (e.curHp || 0) <= 0);
        const killsInLog = log.filter(l => /☠|погиб|убит/i.test(l.text || '')).length;
        const rolls = log.filter(l => /🎲|бросок|кубик|d20|проверк/i.test(l.text || ''));
        const loot = log.filter(l => /🎁|лут|добыч|обыск|нашёл|нашел|выдал/i.test(l.text || ''));
        const rumors = ((d.journal || {}).rumors || []);
        const li = arr => arr.length ? '<ul>' + arr.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '<p><em>нет</em></p>';
        const t = l => escapeHtml((l.author ? l.author + ': ' : '') + (l.text || ''));
        const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Сессия ' + escapeHtml(currentCode || '') + '</title><style>' +
            'body{font-family:Georgia,serif;color:#000;background:#fff;margin:24px;line-height:1.4}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;border-bottom:1px solid #999;margin:16px 0 4px}ul{margin:4px 0 4px 18px;padding:0}li{font-size:13px}' +
            '@media print{body{margin:0}button{display:none}}</style></head><body>' +
            '<h1>Отчёт о сессии «Скурим» — код ' + escapeHtml(currentCode || '') + '</h1><div>' + new Date().toLocaleString('ru-RU') + '</div>' +
            '<h2>Участники</h2>' + li(Object.keys(parts).map(u => escapeHtml((parts[u].name || '?') + ' — HP ' + (parts[u].curHp || 0) + '/' + (parts[u].maxHp || 0) + (parts[u].fallen ? ' (пал)' : '')))) +
            '<h2>Враги</h2><p>Павших сейчас в списке: ' + dead.length + '; записей о гибели в журнале: ' + killsInLog + '.</p>' + li(dead.map(e => escapeHtml(e.name || '?'))) +
            '<h2>Ключевые броски</h2>' + li(rolls.slice(-25).map(t)) +
            '<h2>Лут и награды</h2>' + li(loot.slice(-25).map(t)) +
            '<h2>Слухи</h2>' + li(rumors.map(r => escapeHtml(r.text || ''))) +
            '<button onclick="window.print()">Печать / Сохранить как PDF</button></body></html>';
        const w = window.open('', '_blank');
        if (!w) { alert('Браузер заблокировал новое окно — разреши всплывающие окна для этой страницы.'); return; }
        w.document.open(); w.document.write(html); w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 400);
    };

    // ---- 3.3 OOC ----
    function renderGmOoc(log) {
        const t = el('gm-ooc-log'); if (!t) return;
        t.innerHTML = (log || []).map(m => '<div class="log-entry"><span class="log-time">' + (m.ts ? new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '') + '</span><span class="log-author">' + escapeHtml(m.author || '?') + ':</span> ' + escapeHtml(m.text || '') + '</div>').join('');
        t.scrollTop = t.scrollHeight;
    }
    window.gmSendOoc = function () {
        const i = el('gm-ooc-input'); const text = (i.value || '').trim(); if (!text || !currentCode) return;
        db.collection('sessions').doc(currentCode).update({ oocChat: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: text.slice(0, 500) }) }).then(() => { i.value = ''; }).catch(e => alert('Ошибка: ' + e.message));
    };
    // ---- 3.4 опросы ----
    window.gmCreatePoll = function () {
        const q = (el('gm-poll-question').value || '').trim();
        const opts = (el('gm-poll-options').value || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!q || opts.length < 2 || opts.length > 5) { alert('Нужен вопрос и от 2 до 5 вариантов (каждый в новой строке).'); return; }
        const id = 'p' + Date.now();
        db.collection('sessions').doc(currentCode).update({ ['polls.' + id]: { question: q, options: opts, votes: {}, ts: Date.now(), closed: false } })
            .then(() => { el('gm-poll-question').value = ''; el('gm-poll-options').value = ''; }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmClosePoll = function (id) {
        const poll = (lastData.polls || {})[id]; if (!poll) return;
        const counts = (poll.options || []).map((o, i) => o + ': ' + Object.values(poll.votes || {}).filter(v => v === i).length);
        db.collection('sessions').doc(currentCode).update({ ['polls.' + id + '.closed']: true, combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '📊 Опрос закрыт: «' + poll.question + '» — ' + counts.join(', ') }) }).catch(e => alert('Ошибка: ' + e.message));
    };
    function renderGmPolls(polls) {
        const box = el('gm-polls-list'); if (!box) return;
        const total = Object.keys(lastData.participants || {}).length;
        const ids = Object.keys(polls || {}).sort((a, b) => (polls[b].ts || 0) - (polls[a].ts || 0)).slice(0, 5);
        box.innerHTML = ids.map(id => {
            const p = polls[id]; const votes = Object.values(p.votes || {});
            return `<div style="border:1px solid var(--border-color); border-radius:6px; padding:6px 8px; margin-bottom:6px;${p.closed ? ' opacity:.7;' : ''}">
              <strong>${escapeHtml(p.question)}</strong> <span style="font-size:12px; opacity:.7;">(${votes.length}/${total} проголосовали${p.closed ? ', закрыт' : ''})</span>
              ${(p.options || []).map((o, i) => { const n = votes.filter(v => v === i).length; return `<div style="font-size:14px;">${escapeHtml(o)}: <strong>${n}</strong> <span style="display:inline-block;height:6px;width:${votes.length ? Math.round(n / votes.length * 100) : 0}px;background:var(--accent-color,#c8a566);"></span></div>`; }).join('')}
              ${p.closed ? '' : `<button type="button" class="btn-danger" style="width:auto; padding:2px 10px; font-size:12px; margin-top:4px;" onclick="gmClosePoll('${jsq(id)}')">Закрыть опрос</button>`}</div>`;
        }).join('') || '<span style="opacity:.6; font-size:13px;">Опросов нет.</span>';
    }
    window.renderEpic3Session = function (d) { renderGmOoc(d.oocChat); renderGmPolls(d.polls); };
    function gmEpic3Init() { renderEncounterSelect(); renderNpcTemplateSelect(); renderPlot(); renderGmTimers(); }
    document.addEventListener('DOMContentLoaded', gmEpic3Init);
    if (document.readyState !== 'loading') gmEpic3Init();

    // ========================================================================
    // ТЗ-2, ЭПИК 2: ПРЕСЕТЫ ДАНЖЕЙ
    // Пресеты мастера — Firestore gmPresets/{uid} { dungeons:[…], hiddenAuto:[id…] }: переживают смену устройства
    // (в localStorage им нельзя, см. ТЗ). Черновики — window.dungeonPresetsAuto (dungeon-presets-data.js, собирается
    // tools/build-dungeon-presets.js); в облако черновики не копируются (их ~800 КБ при лимите документа 1 МБ),
    // туда попадает только то, что мастер сохранил. Сохранённый пресет с тем же id заменяет черновик.
    // В сессии — sessions/{code}.currentDungeon: КОПИЯ лута с полными данными предметов (игроку не нужна база
    // мастера, чтобы положить вещь в инвентарь), lootTaken — id уже обысканных контейнеров.
    // ========================================================================
    let _gmDungeons = [];          // сохранённые мастером
    let _gmDungeonHiddenAuto = []; // черновики, которые мастер удалил
    let _gmDungeonsLoaded = false;
    let _dgnEditing = null;        // пресет в редакторе (рабочая копия)
    const dgnArr = v => Array.isArray(v) ? v : [];
    function gmPresetsRef() { return currentUser && db ? db.collection('gmPresets').doc(currentUser.uid) : null; }
    function gmLoadDungeons() {
        const ref = gmPresetsRef(); if (!ref) return Promise.resolve();
        return ref.get().then(doc => {
            const d = doc.exists ? (doc.data() || {}) : {};
            _gmDungeons = dgnArr(d.dungeons); _gmDungeonHiddenAuto = dgnArr(d.hiddenAuto); _gmDungeonsLoaded = true;
            _gmPets = dgnArr(d.pets); gmPetsPublish(); gmRenderPetSelect();
            renderDungeonPresetSelect(); renderDungeonPanel();
        }).catch(e => {
            console.error('Пресеты данжей не загрузились:', e);
            const box = el('dungeon-current-status');
            if (box) box.innerHTML = '<span style="color:#e74c3c;">Не удалось загрузить сохранённые пресеты: ' + escapeHtml(e.message) +
                (/permission/i.test(e.message) ? ' — в правилах Firestore нет блока gmPresets (см. firestore.rules).' : '') + '</span>';
        });
    }
    // Перезаписываем документ целиком (ТЗ: «проще, чем diff»): пресетов у мастера десятки, не тысячи.
    function gmSaveDungeons() {
        const ref = gmPresetsRef(); if (!ref) return Promise.reject(new Error('Не авторизован.'));
        return ref.set(stripUndefinedDeep({ dungeons: _gmDungeons, hiddenAuto: _gmDungeonHiddenAuto, updatedAt: Date.now() }), { merge: true }); // merge: в том же документе лежат питомцы мастера
    }
    function gmAllDungeons() {
        const savedIds = new Set(_gmDungeons.map(d => d.id));
        const hidden = new Set(_gmDungeonHiddenAuto);
        const drafts = dgnArr(window.dungeonPresetsAuto).filter(d => !savedIds.has(d.id) && !hidden.has(d.id));
        return _gmDungeons.concat(drafts);
    }
    function gmFindDungeon(id) { return gmAllDungeons().find(d => d.id === id) || null; }
    const dgnClone = o => JSON.parse(JSON.stringify(o));

    window.renderDungeonPresetSelect = function () {
        const sel = el('dungeon-preset-select'), hf = el('dungeon-hold-filter'); if (!sel || !hf) return;
        const all = gmAllDungeons();
        const holds = [...new Set(all.map(d => d.hold).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
        if (hf.options.length !== holds.length + 1) {
            const cur = hf.value;
            hf.innerHTML = '<option value="">Все владения</option>' + holds.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
            hf.value = holds.includes(cur) ? cur : '';
        }
        const hold = hf.value;
        const prev = sel.value;
        const mine = _gmDungeons.filter(d => !hold || d.hold === hold);
        const drafts = all.filter(d => d.autoGenerated && (!hold || d.hold === hold));
        const opt = d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || '(без названия)')}${d.autoGenerated ? ' (черновик)' : ''}${d.level ? ' · ур. ' + d.level : ''}</option>`;
        let html = '<option value="">— выбери пресет —</option>';
        if (mine.length) html += '<optgroup label="Мои пресеты">' + mine.map(opt).join('') + '</optgroup>';
        // черновики по владениям — 300+ строк в одном списке не найти
        const byHold = {}; drafts.forEach(d => { (byHold[d.hold || '—'] = byHold[d.hold || '—'] || []).push(d); });
        Object.keys(byHold).sort((a, b) => a.localeCompare(b, 'ru')).forEach(h => {
            html += `<optgroup label="Черновики: ${escapeHtml(h)}">` + byHold[h].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(opt).join('') + '</optgroup>';
        });
        sel.innerHTML = html;
        if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
    };

    window.onDungeonPresetPicked = function () {
        const id = el('dungeon-preset-select').value;
        const p = id ? gmFindDungeon(id) : null;
        _dgnEditing = p ? dgnClone(p) : null;
        renderDungeonEditor();
        renderDungeonPanel();
    };

    // Предпросмотр выбранного пресета: что развернётся в сессии.
    function renderDungeonPreview() {
        const box = el('dungeon-preview'); if (!box) return;
        const p = _dgnEditing;
        if (!p) { box.innerHTML = ''; return; }
        const en = dgnArr(p.enemies).map(e => escapeHtml(e.name) + (e.count > 1 ? ' ×' + e.count : '') + (e.base ? ` <span style="opacity:.6;" title="${escapeHtml(e.note || '')}">(статы: ${escapeHtml(e.base)})</span>` : '')).join(', ');
        const lt = dgnArr(p.loot).map(c => `<div>• <strong>${escapeHtml(c.label || 'Контейнер')}</strong>: ${c.gold ? c.gold + ' зол.' + (dgnArr(c.items).length ? ', ' : '') : ''}${dgnArr(c.items).map(i => escapeHtml(i.name) + ((i.qty || 1) > 1 ? ' ×' + i.qty : '')).join(', ') || (c.gold ? '' : '<span style="opacity:.6;">пусто</span>')}</div>`).join('');
        box.innerHTML = `<div style="border-left:3px solid var(--accent-color, #c8a566); padding-left:8px;">
            <div><strong>${escapeHtml(p.name || '(без названия)')}</strong>${p.hold ? ' · ' + escapeHtml(p.hold) : ''}${p.level ? ' · мин. ур. ' + p.level : ''}${p.autoGenerated ? ' <span style="color:#e67e22;">— черновик, проверь перед игрой</span>' : ''}</div>
            <div style="margin-top:4px;">⚔ ${en || '<span style="opacity:.6;">врагов нет</span>'}</div>
            <div style="margin-top:4px;">${lt || '<span style="opacity:.6;">контейнеров нет</span>'}</div></div>`;
    }

    function renderDungeonEditor() {
        const det = el('dungeon-editor'); if (!det) return;
        const p = _dgnEditing;
        renderDungeonPreview();
        if (!p) { det.style.display = 'none'; return; }
        det.style.display = 'block';
        el('dgn-name').value = p.name || '';
        const hs = el('dgn-hold');
        const holds = Object.keys(window.holdsData || {});
        hs.innerHTML = '<option value="">—</option>' + holds.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        hs.value = holds.includes(p.hold) ? p.hold : '';
        el('dgn-notes').value = p.notes || '';
        const dl = el('dgn-enemy-datalist');
        if (dl && !dl.options.length) dl.innerHTML = (window.enemiesData || []).map(e => `<option value="${escapeHtml(e.name)}"></option>`).join('');
        el('dgn-enemies-list').innerHTML = dgnArr(p.enemies).map((e, i) => `<div class="dgn-enemy-row" data-idx="${i}" style="display:flex; gap:4px; margin-top:4px;">
            <input type="text" class="dgn-en-name" list="dgn-enemy-datalist" value="${escapeHtml(e.name || '')}" placeholder="Имя врага" style="flex:2;">
            <input type="number" class="dgn-en-count" value="${parseInt(e.count) || 1}" min="1" max="30" style="width:64px;">
            <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="removeDungeonRow('enemies', ${i})">✕</button></div>`).join('');
        el('dgn-loot-list').innerHTML = dgnArr(p.loot).map((c, i) => `<div class="dgn-loot-row" data-idx="${i}" style="border:1px solid var(--border-color); border-radius:4px; padding:6px; margin-top:6px;">
            <div style="display:flex; gap:4px;"><input type="text" class="dgn-c-label" value="${escapeHtml(c.label || '')}" placeholder="Сундук у входа" style="flex:2;">
            <input type="number" class="dgn-c-gold" value="${parseInt(c.gold) || 0}" min="0" style="width:80px;" title="Золото">
            <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="removeDungeonRow('loot', ${i})">✕</button></div>
            <textarea class="dgn-c-items" rows="${Math.min(8, Math.max(2, dgnArr(c.items).length))}" style="margin-top:4px;" placeholder="Железный меч × 1">${escapeHtml(dgnArr(c.items).map(it => it.name + ((it.qty || 1) > 1 ? ' × ' + it.qty : '')).join('\n'))}</textarea></div>`).join('');
        el('dgn-editor-msg').innerHTML = '';
    }

    // Читает редактор обратно в объект. Предметы-«снимки» (зачарованные «Меч [Огонь]», которых нет в базе под этим
    // именем) сохраняются как были — по имени строки находим прежний снимок в этом же контейнере.
    function collectDungeonEditor() {
        const p = _dgnEditing; if (!p) return null;
        p.name = (el('dgn-name').value || '').trim();
        p.hold = el('dgn-hold').value || '';
        p.notes = el('dgn-notes').value || '';
        const oldEnemies = dgnArr(p.enemies);
        p.enemies = Array.from(document.querySelectorAll('#dgn-enemies-list .dgn-enemy-row')).map(r => {
            const name = (r.querySelector('.dgn-en-name').value || '').trim();
            if (!name) return null;
            const prev = oldEnemies[+r.dataset.idx] || {};
            const e = { name, count: Math.max(1, Math.min(30, parseInt(r.querySelector('.dgn-en-count').value) || 1)) };
            // шаблон статов (base) остаётся, только если имя не меняли — иначе берётся враг базы с новым именем
            if (prev.base && prev.name === name) { e.base = prev.base; if (prev.note) e.note = prev.note; }
            return e;
        }).filter(Boolean);
        const oldLoot = dgnArr(p.loot);
        const unknown = [];
        p.loot = Array.from(document.querySelectorAll('#dgn-loot-list .dgn-loot-row')).map((r, k) => {
            const prev = oldLoot[+r.dataset.idx] || {};
            const prevItems = dgnArr(prev.items);
            const items = (r.querySelector('.dgn-c-items').value || '').split('\n').map(line => {
                const m = /^\s*(.+?)(?:\s*[×xх*]\s*(\d+))?\s*$/i.exec(line); if (!m || !m[1].trim()) return null;
                const name = m[1].trim(), qty = Math.max(1, parseInt(m[2]) || 1);
                const snapPrev = prevItems.find(i => i.name === name && i.price !== undefined);
                const it = snapPrev ? Object.assign({}, snapPrev) : { name };
                if (qty > 1) it.qty = qty; else delete it.qty;
                if (!snapPrev && name !== 'Отмычка' && !gmFindItemByName(name)) unknown.push(name);
                return it;
            }).filter(Boolean);
            return { id: prev.id || ('c' + Date.now().toString(36) + k), label: (r.querySelector('.dgn-c-label').value || '').trim() || 'Контейнер', gold: Math.max(0, parseInt(r.querySelector('.dgn-c-gold').value) || 0), items };
        });
        // id контейнеров внутри пресета должны быть уникальны — по ним игрок обыскивает
        const seen = new Set(); p.loot.forEach((c, i) => { while (seen.has(c.id)) c.id = c.id + '_' + i; seen.add(c.id); });
        return { preset: p, unknown };
    }

    window.removeDungeonRow = function (kind, idx) {
        // Убираем саму строку из редактора и только потом читаем его: пустые строки при чтении выкидываются,
        // и удаление по старому номеру строки раньше убирало не того врага.
        const row = document.querySelector(`#${kind === 'enemies' ? 'dgn-enemies-list .dgn-enemy-row' : 'dgn-loot-list .dgn-loot-row'}[data-idx="${idx}"]`);
        if (row) row.remove();
        const r = collectDungeonEditor(); if (!r) return;
        if (!row) r.preset[kind].splice(idx, 1);
        renderDungeonEditor(); el('dungeon-editor').open = true;
    };
    window.addDungeonEnemy = function () {
        const r = collectDungeonEditor(); if (!r) return;
        r.preset.enemies.push({ name: '', count: 1 });
        renderDungeonEditor(); el('dungeon-editor').open = true;
    };
    window.addDungeonContainer = function () {
        const r = collectDungeonEditor(); if (!r) return;
        r.preset.loot.push({ id: 'c' + Date.now().toString(36), label: '', gold: 0, items: [] });
        renderDungeonEditor(); el('dungeon-editor').open = true;
    };
    window.createNewDungeonPreset = function () {
        el('dungeon-preset-select').value = '';
        _dgnEditing = { id: null, name: '', hold: (lastData && ((lastData.partyPos && lastData.partyPos.hold) || lastData.currentHold)) || '', notes: '', enemies: [], loot: [] };
        renderDungeonEditor(); el('dungeon-editor').open = true; el('dgn-name').focus();
    };
    window.saveDungeonPreset = function () {
        const r = collectDungeonEditor(); if (!r) return;
        const p = r.preset;
        if (!p.name) { el('dgn-editor-msg').innerHTML = '<span style="color:#e74c3c;">Укажи название.</span>'; return; }
        if (!p.id) p.id = 'dgn-' + Date.now();
        // Сохранённый черновик становится обычным пресетом мастера (тот же id — черновик в списке больше не показывается).
        delete p.autoGenerated;
        p.updatedAt = Date.now(); if (!p.createdAt) p.createdAt = p.updatedAt;
        const i = _gmDungeons.findIndex(d => d.id === p.id);
        if (i === -1) _gmDungeons.push(dgnClone(p)); else _gmDungeons[i] = dgnClone(p);
        gmSaveDungeons().then(() => {
            renderDungeonPresetSelect(); el('dungeon-preset-select').value = p.id;
            renderDungeonPreview();
            el('dgn-editor-msg').innerHTML = '<span style="color:#2ecc71;">💾 Сохранено.</span>' +
                (r.unknown.length ? `<br><span style="color:#e67e22;">Нет в базе предметов (выдадутся как есть, без цены и свойств): ${r.unknown.map(escapeHtml).join(', ')}</span>` : '');
        }).catch(e => { el('dgn-editor-msg').innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };
    window.deleteDungeonPreset = function () {
        const p = _dgnEditing; if (!p || !p.id) { _dgnEditing = null; renderDungeonEditor(); return; }
        if (!confirm('Удалить пресет «' + (p.name || '?') + '»?')) return;
        _gmDungeons = _gmDungeons.filter(d => d.id !== p.id);
        // удалённый черновик (или сохранённая версия черновика) не должен снова всплыть из dungeon-presets-data.js
        if (String(p.id).indexOf('auto-') === 0 && !_gmDungeonHiddenAuto.includes(p.id)) _gmDungeonHiddenAuto.push(p.id);
        gmSaveDungeons().then(() => { _dgnEditing = null; renderDungeonPresetSelect(); el('dungeon-preset-select').value = ''; renderDungeonEditor(); renderDungeonPanel(); })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    // Предмет пресета → полный снимок для сессии (как лут сундука/трупа: имя, цена, вес, категория, слот, броня/урон, эффекты).
    function dgnResolveItem(it) {
        if (it.price !== undefined) return Object.assign({}, it, { qty: it.qty || 1 }); // уже снимок (зачарованная вещь)
        if (it.name === 'Отмычка') return { name: 'Отмычка', category: 'Инструменты', price: 5, weight: 0.1, qty: it.qty || 1 };
        const db0 = gmFindItemByName(it.name);
        if (!db0) return { name: it.name, category: 'Добыча', price: 0, weight: 0.5, qty: it.qty || 1 };
        const loot = window.EnemyLoot ? window.EnemyLoot.toLoot(db0, it.qty || 1) : { name: db0.name, price: db0.price || 0, weight: db0.weight || 0, category: db0.category || '' };
        loot.qty = it.qty || 1;
        return loot;
    }
    // Враг пресета → объект врага сессии (тот же набор полей, что addEnemy при выборе из базы).
    function dgnBuildEnemies(list) {
        const out = [];
        dgnArr(list).forEach(e => {
            const tpl = (window.enemiesData || []).find(x => x.name === (e.base || e.name)) || null;
            const n = Math.max(1, Math.min(30, parseInt(e.count) || 1));
            for (let k = 0; k < n; k++) {
                const maxHp = tpl ? (parseInt(tpl.hp) || 10) : 50;
                const maxMp = tpl && parseInt(tpl.mana) > 0 ? parseInt(tpl.mana) : (tpl && tpl.spells && tpl.spells.length ? Math.max(...tpl.spells.map(s => s.cost || 0)) * 3 : 0);
                const extra = tpl ? gmEnemyExtraFromDb(tpl) : {};
                if (e.note) extra.weaponNote = [extra.weaponNote, e.note].filter(Boolean).join(' · ');
                if (!tpl) extra.weaponNote = [extra.weaponNote, 'нет в базе — статы задай вручную'].filter(Boolean).join(' · ');
                out.push(stripUndefinedDeep(Object.assign({ id: genId('e'), name: n > 1 ? e.name + ' ' + (k + 1) : e.name, maxHp, curHp: maxHp, maxMp, curMp: maxMp }, extra)));
            }
        });
        return out;
    }

    window.deployDungeonToSession = function () {
        if (!currentCode || !lastData) { alert('Сначала войди в сессию.'); return; }
        const r = collectDungeonEditor();
        if (!r || !r.preset) { alert('Выбери пресет или создай новый.'); return; }
        const p = r.preset;
        if (!p.name) { alert('У пресета нет названия.'); return; }
        const cur = lastData.currentDungeon;
        if (cur && !confirm('Заменить текущий данж «' + (cur.name || '?') + '»?\nВраги прошлого данжа останутся в бою — убери их сам, если нужно.')) return;
        const newEnemies = dgnBuildEnemies(p.enemies);
        const items = dgnArr(p.loot).map(c => ({ id: c.id, label: c.label || 'Контейнер', gold: parseInt(c.gold) || 0, items: dgnArr(c.items).map(dgnResolveItem) }));
        const dungeon = { presetId: p.id || null, name: p.name, hold: p.hold || '', openedAt: Date.now(), lootTaken: [], items };
        const prev = dgnArr(lastData.enemies);
        // Одной транзакцией: враги, данж и строка в журнале появляются у игроков одновременно («↶ Отменить» вернёт врагов как до развёртывания).
        gmUpdateEnemies(prev.concat(newEnemies), null, {
            currentDungeon: stripUndefinedDeep(dungeon),
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `🏰 Мастер разворачивает данж: «${p.name}». Врагов: ${newEnemies.length}. Контейнеров: ${items.length}.` })
        }).then(() => { el('dgn-editor-msg').innerHTML = '<span style="color:#2ecc71;">🚀 Развёрнуто в сессии.</span>'; })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    window.closeDungeonSession = function () {
        if (!currentCode || !lastData || !lastData.currentDungeon) { alert('В сессии нет открытого данжа.'); return; }
        const d = lastData.currentDungeon;
        if (!confirm('Закрыть данж «' + (d.name || '?') + '»? У игроков пропадёт панель «Вы в: …» и необысканные контейнеры.')) return;
        db.collection('sessions').doc(currentCode).update({
            currentDungeon: null,
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `🏰 Мастер завершает данж: «${d.name || '?'}».` })
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Мастер отдаёт контейнер конкретному игроку. Пишем НЕ в лист игрока (его автосохранение затёрло бы вещи), а
    // командой в очередь pendingStatusEffects — игрок кладёт добычу себе сам, как заказы NPC. Транзакция: контейнер
    // помечается обысканным в той же записи, поэтому параллельный обыск игроком не даст лут дважды.
    window.gmGiveDungeonContainer = function (containerId) {
        const sel = el('dgn-give-' + containerId);
        const uid = sel ? sel.value : '';
        if (!currentCode || !uid) { alert('Выбери игрока.'); return; }
        const ref = db.collection('sessions').doc(currentCode);
        let label = '', pname = '';
        db.runTransaction(tx => tx.get(ref).then(doc => {
            if (!doc.exists) throw new Error('Сессия не найдена.');
            const d = doc.data() || {};
            const dg = d.currentDungeon;
            if (!dg) throw new Error('Нет активного данжа.');
            const taken = dgnArr(dg.lootTaken);
            if (taken.includes(containerId)) throw new Error('Этот контейнер уже обыскан.');
            const c = dgnArr(dg.items).find(x => x.id === containerId);
            if (!c) throw new Error('Контейнер не найден.');
            if (!(d.participants || {})[uid]) throw new Error('Игрок не в сессии.');
            label = c.label || 'контейнер'; pname = (d.participants[uid] || {}).name || 'Игрок';
            const cmd = { id: 'dl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cmd: 'dungeonLoot', fromGm: true, ts: Date.now(),
                dungeon: dg.name || '', containerId, label, gold: parseInt(c.gold) || 0, items: dgnArr(c.items) };
            const patch = { 'currentDungeon.lootTaken': taken.concat([containerId]) };
            patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(stripUndefinedDeep(cmd));
            patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `🔍 Мастер отдаёт «${label}» игроку ${pname}: ${[c.gold ? c.gold + ' зол.' : ''].concat(dgnArr(c.items).map(i => i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : ''))).filter(Boolean).join(', ') || 'пусто'}.` });
            tx.update(ref, patch);
        })).catch(e => alert(e.message));
    };

    // Статус данжа в сессии + список необысканных контейнеров с выдачей игроку. Зовётся из renderAll.
    function renderDungeonPanel() {
        const box = el('dungeon-current-status'); if (!box) return;
        if (currentUser && !_gmDungeonsLoaded && !gmRenderDungeonLoadStarted) { gmRenderDungeonLoadStarted = true; gmLoadDungeons(); }
        if (el('dungeon-preset-select') && !el('dungeon-preset-select').options.length) renderDungeonPresetSelect();
        const d = lastData && lastData.currentDungeon;
        if (!d) { box.innerHTML = '<span style="opacity:.7;">В сессии данж не развёрнут.</span>'; return; }
        const taken = dgnArr(d.lootTaken), all = dgnArr(d.items);
        const left = all.filter(c => !taken.includes(c.id));
        const parts = lastData.participants || {};
        // панель перерисовывается на каждый снимок сессии — не сбрасываем игрока, которого мастер уже выбрал
        const chosen = {}; box.querySelectorAll('select[id^="dgn-give-"]').forEach(s => { chosen[s.id] = s.value; });
        const opts = Object.keys(parts).map(u => `<option value="${u}">${escapeHtml((parts[u] || {}).name || '?')}</option>`).join('');
        box.innerHTML = `<div style="background:rgba(0,0,0,.2); border:1px solid var(--accent-color, #c8a566); border-radius:4px; padding:6px 8px;">
            🏰 В сессии открыт: <strong>${escapeHtml(d.name || '?')}</strong>. Обыскано: ${taken.length}/${all.length} контейнеров.
            ${left.map(c => `<div style="display:flex; gap:4px; align-items:center; margin-top:4px; flex-wrap:wrap;">
                <span style="flex:1 1 180px;">🔍 ${escapeHtml(c.label || 'Контейнер')} <span style="opacity:.6;">(${[c.gold ? c.gold + ' зол.' : ''].concat(dgnArr(c.items).map(i => i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : ''))).filter(Boolean).map(escapeHtml).join(', ') || 'пусто'})</span></span>
                ${opts ? `<select id="dgn-give-${escapeHtml(c.id)}" style="width:auto;">${opts}</select><button style="width:auto; padding:2px 8px;" onclick="gmGiveDungeonContainer('${jsq(c.id)}')">Выдать</button>` : ''}
            </div>`).join('') || '<div style="opacity:.7; margin-top:4px;">Всё обыскано.</div>'}</div>`;
        Object.keys(chosen).forEach(id => { const s = el(id); if (s && parts[chosen[id]]) s.value = chosen[id]; });
    }
    let gmRenderDungeonLoadStarted = false;

    // ---------- Животные и питомцы мастера ----------
    // Свои шаблоны — в gmPresets/{uid}.pets (переживают сессии); в текущую сессию копируются в sessions/{code}.customPets,
    // откуда их видят продавцы у игроков. Выдача — командой в лист игрока (gmCmds, тип 'pet'), как другие правки.
    let _gmPets = [];
    function gmPetAllTemplates() { return (window.PET_TEMPLATES || []).map(t => Object.assign({ builtIn: true }, t, { hp: t.hp })).concat(_gmPets); }
    function gmPetsPublish() {
        if (!currentCode) return;
        const cur = JSON.stringify((lastData && lastData.customPets) || []);
        if (cur === JSON.stringify(_gmPets)) return;
        db.collection('sessions').doc(currentCode).update({ customPets: stripUndefinedDeep(_gmPets) }).catch(e => console.error('customPets:', e));
    }
    function gmRenderPetSelect() {
        const sel = el('gm-pet-select'); if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">— новое животное —</option>' + gmPetAllTemplates().map(t => `<option value="${escapeHtml(t.id)}">${t.icon || '🐾'} ${escapeHtml(t.name)}${t.builtIn ? ' (стандартное)' : ''} — ${parseInt(t.price) || 0} зол.</option>`).join('');
        if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
        const ps = el('gm-pet-give-player');
        if (ps) { const p0 = ps.value; const parts = (lastData && lastData.participants) || {}; ps.innerHTML = Object.keys(parts).map(u => `<option value="${u}">${escapeHtml(parts[u].name || u)}</option>`).join('') || '<option value="">Нет игроков</option>'; if (parts[p0]) ps.value = p0; }
    }
    window.gmRenderPetSelect = gmRenderPetSelect;
    window.gmPetPicked = function () {
        const t = gmPetAllTemplates().find(x => x.id === el('gm-pet-select').value);
        el('gm-pet-name').value = t ? t.name : ''; el('gm-pet-icon').value = t ? (t.icon || '') : '';
        el('gm-pet-hp').value = t ? (parseInt(t.hp) || 1) : 50; el('gm-pet-price').value = t ? (parseInt(t.price) || 0) : 300;
        el('gm-pet-sellers').value = t ? (t.sellers || []).map(s => s.place || s.city || s.hold).filter(Boolean).join(', ') : '';
        el('gm-pet-loot').value = t ? (t.loot || []).map(l => l.name + ((l.qty || 1) > 1 ? ' × ' + l.qty : '')).join('\n') : '';
        el('gm-pet-rideable').checked = !!(t && t.rideable);
        el('gm-pet-msg').innerHTML = t && t.builtIn ? '<span style="opacity:.75;">Стандартное животное: правки сохранятся как твоё новое (стандартное не меняется).</span>' : '';
    };
    window.gmPetNew = function () { el('gm-pet-select').value = ''; window.gmPetPicked(); el('gm-pet-name').focus(); };
    function gmPetFromForm(id) {
        const name = (el('gm-pet-name').value || '').trim();
        if (!name) { alert('Укажи название.'); return null; }
        const loot = (el('gm-pet-loot').value || '').split('\n').map(line => {
            const m = /^\s*(.+?)(?:\s*[×xх*]\s*(\d+))?\s*$/i.exec(line); if (!m || !m[1].trim()) return null;
            return { name: m[1].trim(), qty: Math.max(1, parseInt(m[2]) || 1) };
        }).filter(Boolean);
        const sellers = (el('gm-pet-sellers').value || '').split(',').map(x => x.trim()).filter(Boolean).map(place => ({ place, who: 'Продавец: ' + name }));
        return { id, icon: (el('gm-pet-icon').value || '🐾').trim(), name, kind: name, hp: Math.max(1, parseInt(el('gm-pet-hp').value) || 1),
            price: Math.max(0, parseInt(el('gm-pet-price').value) || 0), sellers, loot, rideable: el('gm-pet-rideable').checked, custom: true };
    }
    window.gmPetSave = function () {
        const cur = _gmPets.find(x => x.id === el('gm-pet-select').value);
        const t = gmPetFromForm(cur ? cur.id : 'cpet-' + Date.now().toString(36)); if (!t) return;
        const i = _gmPets.findIndex(x => x.id === t.id);
        if (i === -1) _gmPets.push(t); else _gmPets[i] = t;
        const ref = gmPresetsRef(); if (!ref) { alert('Не авторизован.'); return; }
        ref.set({ pets: stripUndefinedDeep(_gmPets), updatedAt: Date.now() }, { merge: true }).then(() => {
            gmPetsPublish(); gmRenderPetSelect(); el('gm-pet-select').value = t.id;
            el('gm-pet-msg').innerHTML = '<span style="color:#2ecc71;">💾 Сохранено' + (currentCode ? ' и доступно игрокам в этой сессии' : '') + '.</span>';
        }).catch(e => alert('Ошибка: ' + e.message + (/permission/i.test(e.message) ? ' (нужен блок gmPresets в firestore.rules)' : '')));
    };
    window.gmPetDelete = function () {
        const id = el('gm-pet-select').value; const t = _gmPets.find(x => x.id === id);
        if (!t) { alert('Удалить можно только своё животное (стандартные не удаляются).'); return; }
        if (!confirm('Удалить «' + t.name + '»? У игроков, которые его уже купили, оно останется.')) return;
        _gmPets = _gmPets.filter(x => x.id !== id);
        const ref = gmPresetsRef(); if (!ref) return;
        ref.set({ pets: stripUndefinedDeep(_gmPets), updatedAt: Date.now() }, { merge: true }).then(() => { gmPetsPublish(); gmRenderPetSelect(); window.gmPetNew(); });
    };
    window.gmPetGive = function () {
        const uid = el('gm-pet-give-player').value;
        const sel = el('gm-pet-select').value;
        const t = sel ? gmPetAllTemplates().find(x => x.id === sel) : gmPetFromForm('cpet-' + Date.now().toString(36));
        if (!uid || !t) { alert('Выбери игрока и животное.'); return; }
        const pet = stripUndefinedDeep({ id: t.id, icon: t.icon, name: t.name, kind: t.kind || t.name, hp: parseInt(t.hp) || 1, loot: t.loot || [], rideable: !!t.rideable });
        db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'pet', pet }) })
            .then(() => {
                const pname = (((lastData || {}).participants || {})[uid] || {}).name || 'игрок';
                gmPostLogEntryText(`🐾 Мастер дарит ${pname}: ${t.icon || ''} ${t.name}.`);
                el('gm-pet-msg').innerHTML = '<span style="color:#2ecc71;">🎁 Выдано — появится у игрока во вкладке «Инвентарь» → «Животные».</span>';
            }).catch(e => alert('Ошибка: ' + e.message));
    };
    // Животные выбранного в панели инвентаря игрока: ХП ± (команда petHp), чтобы ранить/лечить/убить.
    // Эффекты на игроке: вредное (болезнь, яд, статус) игрок сам не снимает — это делает мастер.
    function renderGmPlayerEffects(effects) {
        const box = el('inv-effects-list'); if (!box) return;
        const list = (Array.isArray(effects) ? effects : []).filter(e => e && (e.turnsRemaining === null || e.turnsRemaining === undefined || e.turnsRemaining !== 0));
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Нет активных эффектов.</p>'; return; }
        box.innerHTML = list.map(e => `<div style="display:flex; justify-content:space-between; gap:6px; align-items:center; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span>${escapeHtml(e.effectName || e.name || '?')}${e.name && e.effectName && e.name !== e.effectName ? ' <span style="opacity:.6;">(' + escapeHtml(e.name) + ')</span>' : ''}</span>
            <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmRemovePlayerEffect('${jsq(e.id || '')}', '${jsq(e.effectName || e.name || '')}')">Снять</button></div>`).join('');
    }
    window.gmRemovePlayerEffect = function (effId, name) {
        gmSendCmd({ type: 'removeEffect', effId: effId || null, name: name || '' }, 'снимает с {p} эффект «' + name + '».');
    };
    function renderGmPlayerPets(pets) {
        const box = el('inv-pets-list'); if (!box) return;
        const list = Array.isArray(pets) ? pets : [];
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Нет животных.</p>'; return; }
        box.innerHTML = list.map(p => `<div style="display:flex; justify-content:space-between; gap:6px; align-items:center; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span>${p.icon || '🐾'} ${escapeHtml(p.name)} — ${p.dead ? '☠ погиб' + (p.looted ? ', обыскан' : '') : `ХП ${p.hp}/${p.maxHp}`}</span>
            ${p.dead ? '' : `<span style="display:flex; gap:4px;"><input type="number" id="pet-dmg-${escapeHtml(p.id)}" value="10" min="1" style="width:60px;">
            <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmPetHp('${jsq(p.id)}', -1)">−ХП</button>
            <button class="btn-success" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmPetHp('${jsq(p.id)}', 1)">+ХП</button></span>`}</div>`).join('');
    }
    window.gmPetHp = function (petId, sign) {
        if (!currentInvPlayerUid) return;
        const n = Math.max(1, parseInt((el('pet-dmg-' + petId) || {}).value) || 1);
        db.collection('characters').doc(currentInvPlayerUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId, delta: sign * n }) })
            .catch(e => alert('Ошибка: ' + e.message));
    };
    window.renderDungeonPanel = renderDungeonPanel;


    // ========================================================================
    // ЛОВУШКИ (traps-data.js). Поставленные ловушки — sessions/{code}.placedTraps:
    // { id, type, label, state: ready|active|cooldown|disarmed|off, left, victims: [uid], ignited, axes }.
    // Срабатывание = команда 'trap' в лист каждого задетого игрока (gmCmds): лист сам бросает спасброски от своей
    // настоящей Ловкости, режет урон своими сопротивлениями и пишет итог в журнал. Ловушки «каждый ход»
    // бьют автоматически, когда общий счётчик ходов (sessionTickCounter) уходит вперёд.
    // ========================================================================
    const trapType = id => (window.TRAP_TYPES || []).find(t => t.id === id) || null;
    const trapsArr = () => Array.isArray(lastData && lastData.placedTraps) ? lastData.placedTraps : [];
    function gmTrapCmdFor(t, opts) {
        opts = opts || {};
        const cmd = { type: 'trap', trapName: t.name, icon: t.icon, hits: [], note: t.note || '' };
        if (t.id === 'axes') { cmd.save = { stat: 'dex', dc: (t.save || {}).dc || 10, count: Math.max(1, parseInt(opts.axes) || t.defaultAxes || 3), failHit: { dmg: t.axeDmg || 30, type: 'physical' } }; }
        else if (t.id === 'tar') cmd.hits = opts.ignite ? (t.igniteHits || []) : [];
        else if (t.id === 'lamp' && opts.radius) cmd.hits = t.radiusHits || [];
        else if (opts.perTurn && t.perTurn) cmd.hits = t.perTurn.hits;
        else if (opts.perTurn && t.perTurnIgnited) cmd.hits = t.perTurnIgnited.hits;
        else cmd.hits = t.hits || [];
        if (t.knockback) cmd.knockback = t.knockback;
        if (t.alarm) cmd.alarm = true;
        if (t.id === 'tar' && !opts.ignite) cmd.note = 'Смола: ноги вязнут (урона нет, пока не подожгли).';
        return cmd;
    }
    function gmSendTrapCmd(uid, cmd) {
        const full = Object.assign({ id: 'gmc-t' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now() }, cmd);
        return db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion(stripUndefinedDeep(full)) }).catch(e => console.error('trap cmd:', e));
    }
    function gmSaveTraps(list) {
        if (!currentCode) return Promise.resolve();
        return db.collection('sessions').doc(currentCode).update({ placedTraps: stripUndefinedDeep(list) }).catch(e => alert('Ошибка: ' + e.message));
    }
    window.gmTrapTypeInfo = function () {
        const t = trapType((el('gm-trap-type') || {}).value); const box = el('gm-trap-type-info'); if (!box) return;
        box.textContent = t ? (t.note || '') + (t.knockback ? ` Отбрасывает на ${t.knockback} фт.` : '') : '';
    };
    window.gmPlaceTrap = function () {
        if (!currentCode) { alert('Сначала войди в сессию.'); return; }
        const t = trapType(el('gm-trap-type').value); if (!t) return;
        const label = (el('gm-trap-label').value || '').trim();
        const list = trapsArr().concat([{ id: 'trap-' + Date.now().toString(36), type: t.id, label, state: 'ready', left: 0, victims: [], ignited: false, axes: t.defaultAxes || null }]);
        el('gm-trap-label').value = '';
        gmSaveTraps(list).then(() => gmPostLogEntryText(`🪤 Мастер ставит ловушку: ${t.icon} ${t.name}${label ? ' (' + label + ')' : ''}.`));
    };
    window.gmRemoveTrap = function (id) { gmSaveTraps(trapsArr().filter(x => x.id !== id)); };
    window.gmTrapSetField = function (id, field, value) {
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { [field]: value }) : x));
    };
    function gmTrapVictims(id, kind) {
        return Array.from(document.querySelectorAll(`input[data-trap="${id}"][data-kind="${kind || 'main'}"]:checked`)).map(c => c.value);
    }
    // Состояние ловушки после срабатывания (кнопка «Сработала» или проваленное обезвреживание).
    function gmTrapStateAfterTrigger(t, tr) {
        if (t.perTurn) return { state: 'active', left: t.perTurn.activeTurns || 0 }; // 0 = бьёт, пока не заберут камень
        if (t.id === 'tar' && tr.ignited) return { state: 'active', left: 0 };
        return { state: t.id === 'tar' ? 'ready' : 'off', left: 0 }; // разовые ловушки после срабатывания — разряжены
    }
    window.gmTriggerTrap = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        const t = trapType(tr.type); if (!t) return;
        if (tr.state === 'disarmed' || tr.state === 'off') { alert('Эта ловушка уже обезврежена/выключена.'); return; }
        if (tr.state === 'cooldown') { alert(`Ловушка перезаряжается: ещё ${tr.left} ход(ов).`); return; }
        const victims = gmTrapVictims(id), around = t.id === 'lamp' ? gmTrapVictims(id, 'radius') : [];
        if (!victims.length && !around.length) { alert('Отметь, на ком сработала ловушка.'); return; }
        const parts = (lastData && lastData.participants) || {};
        const names = u => (parts[u] || {}).name || 'игрок';
        victims.forEach(u => gmSendTrapCmd(u, gmTrapCmdFor(t, { axes: tr.axes, ignite: tr.ignited })));
        around.forEach(u => gmSendTrapCmd(u, gmTrapCmdFor(t, { radius: true })));
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, tr, gmTrapStateAfterTrigger(t, tr), { victims: victims.slice() }) : x));
        gmPostLogEntryText(`🪤 Срабатывает ${t.icon} ${t.name}${tr.label ? ' (' + tr.label + ')' : ''}: ${victims.map(names).join(', ')}${around.length ? (victims.length ? '; рядом — ' : 'рядом — ') + around.map(names).join(', ') : ''}.${t.alarm ? ' 🔔 Враги знают, где вы!' : ''}`);
    };
    window.gmIgniteTar = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { ignited: true }) : x)).then(() => gmPostLogEntryText('🔥 Смола подожжена!'));
    };
    window.gmTrapClearZone = function (id) { gmTrapSetField(id, 'victims', []); };
    window.gmTrapRearm = function (id) { gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { state: 'ready', left: 0, victims: [] }) : x)); };
    // Игрок пытается обезвредить: бросок на его листе (d20 + мод. Ловкости против сложности), провал — срабатывает на нём.
    window.gmTrapDisarmBy = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        if (tr.state === 'disarmed' || tr.state === 'off') { alert('Эта ловушка уже обезврежена или разряжена — обезвреживать нечего.'); return; }
        const t = trapType(tr.type); const uid = (el('gm-trap-disarm-' + id) || {}).value; if (!uid) { alert('Выбери игрока.'); return; }
        const dc = t.disarmDc || parseInt((el('gm-trap-dc-' + id) || {}).value) || 15;
        gmSendTrapCmd(uid, { type: 'trapDisarm', trapId: id, trapName: t.name, icon: t.icon, dc, onFail: gmTrapCmdFor(t, { axes: tr.axes, ignite: tr.ignited }), failState: gmTrapStateAfterTrigger(t, tr) });
        gmPostLogEntryText(`🪤 ${(((lastData || {}).participants || {})[uid] || {}).name || 'Игрок'} пытается обезвредить «${t.name}» (сл. ${dc}).`);
    };
    window.gmTrapTakeStone = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        const t = trapType(tr.type); const uid = (el('gm-trap-disarm-' + id) || {}).value; if (!uid) { alert('Выбери игрока, который забирает камень.'); return; }
        const proto = gmFindItemByName(t.stone) || { name: t.stone, category: 'Камни душ', weight: 0.5, price: 100 };
        gmTxInventory(uid, inv => {
            const ex = inv.find(x => x.itemId === proto.name);
            if (ex) ex.count = (ex.count || 0) + 1; else inv.push({ itemId: proto.name, name: proto.name, count: 1, weight: proto.weight || 0.5, category: proto.category || 'Камни душ', effect: proto.effect || '', price: proto.price || 0 });
        }).then(() => {
            gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { state: 'off', victims: [] }) : x));
            gmPostLogEntryText(`💎 ${(((lastData || {}).participants || {})[uid] || {}).name || 'Игрок'} забирает камень с пьедестала — кристалл душ гаснет.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function renderGmTraps() {
        const sel = el('gm-trap-type'), box = el('gm-traps-list'); if (!sel || !box) return;
        if (!sel.options.length) { sel.innerHTML = (window.TRAP_TYPES || []).map(t => `<option value="${t.id}">${t.icon} ${escapeHtml(t.name)}</option>`).join(''); window.gmTrapTypeInfo(); }
        const parts = (lastData && lastData.participants) || {};
        const uids = Object.keys(parts);
        const keepChecks = {}; box.querySelectorAll('input[data-trap]:checked').forEach(c => { keepChecks[c.dataset.trap + '|' + c.dataset.kind + '|' + c.value] = true; });
        const STATE = { ready: '🟢 готова', active: '🔴 бьёт', cooldown: '⏳ перезарядка', disarmed: '✔ обезврежена', off: '⚪ разряжена' };
        const list = trapsArr();
        box.innerHTML = list.length ? list.map(tr => {
            const t = trapType(tr.type) || { icon: '🪤', name: tr.type };
            const st = STATE[tr.state] || tr.state;
            const left = tr.state === 'active' && tr.left ? ` (${tr.left} ход.)` : tr.state === 'cooldown' ? ` (${tr.left} ход.)` : '';
            const checks = (kind, label) => `<div style="font-size:12px;">${label} ${uids.map(u => `<label style="display:inline; margin-right:8px; font-weight:normal;"><input type="checkbox" style="width:auto;" data-trap="${tr.id}" data-kind="${kind}" value="${u}" ${keepChecks[tr.id + '|' + kind + '|' + u] || (kind === 'main' && (tr.victims || []).indexOf(u) !== -1) ? 'checked' : ''}> ${escapeHtml(parts[u].name || u)}</label>`).join('') || '<span style="opacity:.6;">нет игроков</span>'}</div>`;
            return `<div class="party-row" style="padding:6px 8px;">
                <div class="row-name"><span>${t.icon} <strong>${escapeHtml(t.name)}</strong>${tr.label ? ' <span style="opacity:.7;">— ' + escapeHtml(tr.label) + '</span>' : ''}</span><span>${st}${left}</span></div>
                ${checks('main', t.id === 'lamp' ? 'В центре:' : (t.perTurn || t.id === 'tar' ? 'В зоне:' : 'Задеты:'))}
                ${t.id === 'lamp' ? checks('radius', 'В радиусе:') : ''}
                <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px; align-items:center;">
                    ${t.id === 'axes' ? `<label style="font-size:12px; margin:0;">Секир: <input type="number" min="1" max="10" value="${tr.axes || 3}" style="width:56px;" onchange="gmTrapSetField('${tr.id}','axes',parseInt(this.value)||1)"></label>` : ''}
                    ${t.id === 'tar' && !tr.ignited ? `<button style="width:auto; padding:2px 8px;" onclick="gmIgniteTar('${tr.id}')">🔥 Поджечь</button>` : ''}
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmTriggerTrap('${tr.id}')">💥 Сработала</button>
                    ${(t.perTurn || t.id === 'tar') ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapClearZone('${tr.id}')" title="Все вышли из зоны">🚶 Никого в зоне</button>` : ''}
                    ${tr.state === 'off' || tr.state === 'disarmed' ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapRearm('${tr.id}')">↺ Взвести</button>` : ''}
                    <select id="gm-trap-disarm-${tr.id}" style="width:auto; font-size:12px;">${uids.map(u => `<option value="${u}">${escapeHtml(parts[u].name || u)}</option>`).join('')}</select>
                    ${t.stone ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapTakeStone('${tr.id}')">💎 Забрать камень</button>` : ''}
                    ${t.disarmDc ? '' : `<select id="gm-trap-dc-${tr.id}" style="width:auto; font-size:12px;">${Object.keys(window.TRAP_DISARM_TIERS || {}).map(k => `<option value="${window.TRAP_DISARM_TIERS[k].dc}" ${k === 'adept' ? 'selected' : ''}>${window.TRAP_DISARM_TIERS[k].label} (сл. ${window.TRAP_DISARM_TIERS[k].dc})</option>`).join('')}</select>`}
                    <button style="width:auto; padding:2px 8px;" onclick="gmTrapDisarmBy('${tr.id}')">🛠 Обезвредить${t.disarmDc ? ' (Лов сл. ' + t.disarmDc + ')' : ''}</button>
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmRemoveTrap('${tr.id}')">✕</button>
                </div></div>`;
        }).join('') : '<p style="opacity:.6; font-size:13px;">Ловушек в сцене нет.</p>';
    }
    // Ход ловушек: бьющие каждый ход ловушки бьют стоящих в зоне; огненный столб после 4 ходов — 10 ходов перезарядки.
    let _gmTrapTickBusy = false;
    function gmTrapsTickWatch(d) {
        if (!currentCode || !d || _gmTrapTickBusy) return;
        const tick = parseInt(d.sessionTickCounter) || 0, done = parseInt(d.trapsTick) || 0;
        if (tick <= done) return;
        const list = Array.isArray(d.placedTraps) ? d.placedTraps : [];
        if (!list.some(x => x.state === 'active' || x.state === 'cooldown')) {
            if (tick > done) db.collection('sessions').doc(currentCode).update({ trapsTick: tick }).catch(() => { });
            return;
        }
        _gmTrapTickBusy = true;
        const ref = db.collection('sessions').doc(currentCode);
        const sends = [];
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const dd = doc.data() || {};
            const t0 = parseInt(dd.sessionTickCounter) || 0, d0 = parseInt(dd.trapsTick) || 0;
            if (t0 <= d0) return;
            sends.length = 0;
            const next = (Array.isArray(dd.placedTraps) ? dd.placedTraps : []).map(tr => {
                const t = trapType(tr.type); if (!t) return tr;
                const x = Object.assign({}, tr);
                for (let k = d0; k < t0; k++) {
                    if (x.state === 'active') {
                        (x.victims || []).forEach(u => sends.push([u, gmTrapCmdFor(t, { perTurn: true, ignite: x.ignited })]));
                        if (t.perTurn && t.perTurn.activeTurns) { x.left = (x.left || 0) - 1; if (x.left <= 0) { x.state = 'cooldown'; x.left = t.perTurn.cooldownTurns || 0; x.victims = []; } }
                    } else if (x.state === 'cooldown') {
                        x.left = (x.left || 0) - 1; if (x.left <= 0) { x.state = 'ready'; x.left = 0; }
                    }
                }
                return x;
            });
            tx.update(ref, { placedTraps: stripUndefinedDeep(next), trapsTick: t0 });
        })).then(() => { sends.forEach(([u, c]) => gmSendTrapCmd(u, c)); if (sends.length) gmPostLogEntryText(`🪤 Ход ловушек: ${sends.length} удар(ов) по стоящим в зоне.`); })
          .catch(e => console.error('traps tick:', e)).finally(() => { _gmTrapTickBusy = false; });
    }

    document.addEventListener('DOMContentLoaded', initGmSectionAccordions);
    if (document.readyState !== 'loading') initGmSectionAccordions();

})();
