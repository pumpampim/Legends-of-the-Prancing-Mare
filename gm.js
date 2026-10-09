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

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    function enemyWeaponDamage(enemy) {
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
                const closedMs = d.closedAt.toMillis ? d.closedAt.toMillis() : 0;
                if (closedMs && closedMs < weekAgo) {
                    doc.ref.delete().catch(e => console.error('Ошибка чистки старой сессии:', e));
                }
            });
        }).catch(e => console.error('Ошибка поиска старых сессий для чистки:', e));
    }

    function attemptCreate(tries) {
        if (tries > 5) { alert('Не удалось сгенерировать свободный код, попробуй ещё раз.'); return; }
        let code = '';
        for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        db.collection('sessions').doc(code).get().then(doc => {
            if (doc.exists) { attemptCreate(tries + 1); return; }
            db.collection('sessions').doc(code).set({
                gmUid: currentUser.uid,
                status: 'active',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                participants: {},
                enemies: [],
                initiative: [],
                combatLog: []
            }).then(() => {
                localStorage.setItem(GM_SESSION_KEY, code);
                enterSessionView(code);
            });
        });
    }

    window.closeSession = function () {
        if (!currentCode) return;
        if (!confirm('Закрыть сессию? Игроки больше не смогут в неё зайти (текущие данные сохранятся).')) return;
        db.collection('sessions').doc(currentCode).update({ status: 'closed', closedAt: firebase.firestore.FieldValue.serverTimestamp() }).finally(() => {
            if (_gmHeartbeatTimer) { clearInterval(_gmHeartbeatTimer); _gmHeartbeatTimer = null; }
            if (unsubSession) { unsubSession(); unsubSession = null; }
            localStorage.removeItem(GM_SESSION_KEY);
            currentCode = null;
            el('session-block').style.display = 'none';
            el('no-session-block').style.display = 'block';
        });
    };

    function enterSessionView(code) {
        currentCode = code;
    el('no-session-block').style.display = 'none';
    el('session-block').style.display = 'block';
    el('gm-session-code').textContent = code;
    loadGmItems();
    if (unsubSession) unsubSession();
    unsubSession = db.collection('sessions').doc(code).onSnapshot(doc => {
        if (!doc.exists) return;
        lastData = doc.data();
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
        if (atkSel && !atkSel.options.length) {
            atkSel.innerHTML = (lastData.enemies || []).map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('') || '<option value="">Нет врагов в бою</option>';
        }
        if (tgtSel && !tgtSel.options.length) {
            tgtSel.innerHTML = Object.keys(lastData.participants || {}).map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('') || '<option value="">Нет игроков</option>';
        }
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
            const stats = data.stats || [10, 10, 10, 10, 10, 10]; // str,dex,con,int,wis,cha
            const statMod = shieldType === 'heavy' ? calcAbilityMod(parseInt(stats[2]) || 10) : calcAbilityMod(parseInt(stats[1]) || 10);
            const blockSkill = parseInt((data.skills || [])[3]) || 10; // Блокирование — индекс 3 в skillNames
            const skillMod = Math.floor(blockSkill / 10);
            // "Щитоносец" — skillIdx 3 (Блокирование), perkIdx 0, 5 ступеней → 20/25/30/35/40% среза урона.
            const SHIELDBEARER_PCT = [0, 20, 25, 30, 35, 40];
            let shieldbearerSteps = 0;
            for (let s = 1; s <= 5; s++) { if ((data.perkStates || {})['skill3-perk0-step' + s]) shieldbearerSteps = s; }
            const blockReductionPct = SHIELDBEARER_PCT[shieldbearerSteps];

            // Атака врага: 1д20 + атакующий мод (СИЛ/ЛОВ, как у обычной атаки) + прогрессирующий
            // бонус от урона оружия — floor((урон-10)/10), по прямой формуле из документа.
            const atkMod = calcAbilityMod(enemy.isRanged ? (enemy.dex || 10) : (enemy.str || 10));
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

            pendingBlockResult = { enemy, targetUid, outcome, blockReductionPct, enemyTotal, playerTotal };
            const resBox = el('block-result');
            resBox.style.display = 'block';
            resBox.innerHTML = `<div style="font-size:13px;">Враг: 1d20(${enemyRoll})+${atkMod}+${progressiveBonus}(прогресс.) = <strong>${enemyTotal}</strong><br>` +
                `Игрок: 1d20(${playerRoll})+${statMod}(хар-ка)+${skillMod}(навык) = <strong>${playerTotal}</strong><br>` +
                `<strong style="font-size:15px;">${outcomeLabel}</strong> (разница ${diff})<br>` +
                (outcome === 'success' ? `Урон срезан на ${blockReductionPct}% (перк «Щитоносец»), враг получает −2 к следующему броску.` :
                 outcome === 'partial' ? `Урон снижается только на сопротивление щита/брони самого по себе — примени как обычный урон с резистом.` :
                 `Игрок получает ПОЛНЫЙ урон (только бронёй) + статус «Ошеломление» (−3 к следующему броску).`);
            el('block-apply-btn').style.display = 'block';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.applyActiveBlockResult = function () {
        if (!pendingBlockResult) return;
        const { enemy, targetUid, outcome, blockReductionPct } = pendingBlockResult;
        const baseDmg = enemyWeaponDamage(enemy).total;
        let finalDmgNote = '';
        const patch = {};
        if (outcome === 'success') {
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
        const writes = uids.map(uid => {
            const p = participants[uid];
            return db.collection('characters').doc(uid).update({
                'vitals.0': p.maxHp || 0, 'vitals.1': p.maxMp || 0,
                pendingStatusEffects: firebase.firestore.FieldValue.arrayUnion({
                    id: 'rest-' + Date.now() + Math.random().toString(36).slice(2, 6),
                    name: 'Лагерь', effectName: 'Полноценный отдых', description: '+1 к кубам на все проверки навыков (весь следующий игровой день).', turnsRemaining: 20
                })
            }).catch(e => console.error('Ошибка отдыха для', uid, e));
        });
        Promise.all(writes).then(() => {
            db.collection('sessions').doc(currentCode).update({
                'campState.active': false,
                combatLog: firebase.firestore.FieldValue.arrayUnion({
                    ts: Date.now(), author: 'Мастер',
                    text: `😴 Ночь прошла спокойно (бросок ${roll} > ${chance}%). ХП/МП группы восстановлены, статус «Полноценный отдых» применён.`
                })
            });
        });
    };

    function renderAll() {
        renderParty(lastData.participants || {});
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
        if (typeof renderGroupCheckResults === 'function') renderGroupCheckResults();
        if (typeof populateCoopSelects === 'function') populateCoopSelects();
        if (typeof renderMerchantStaleness === 'function') renderMerchantStaleness();
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
                    <span>${escapeHtml(p.name || '?')}</span>
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
                ${(p.summons || []).map(s => {
                    const sHpPct = Math.max(0, Math.min(100, (s.curHp || 0) / (s.maxHp || 1) * 100));
                    return `<div style="display:flex; align-items:center; gap:4px; margin-top:4px; padding-left:8px; border-left:2px solid var(--border-color);">
                        <span style="font-size:11px; opacity:.75; white-space:nowrap;">👻 ${escapeHtml(s.name)}</span>
                        <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${sHpPct}%;"></div></div>
                        <span style="font-size:11px; opacity:.6; white-space:nowrap;">${s.curHp || 0}/${s.maxHp || 0}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');
    }

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
            db.collection('characters').doc(uid).get().then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                const vitals = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
                vitals[vitalsIdx] = Number(value) || 0;
                return db.collection('characters').doc(uid).update({ vitals });
            }).catch(e => console.error('Ошибка синхронизации ХП/МП с персонажем:', e));
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

    function renderEnemies(enemies) {
        const target = el('gm-enemies-list');
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Противников нет.</p>'; return; }
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
            return '<div class="enemy-row">' +
                '<div class="row-name"><span class="name-with-avatar"><img class="enemy-avatar" src="' + enemyAvatarData(e) + '" alt=""><span>' + escapeHtml(e.name || '?') + '</span></span>' +
                '<button class="btn-danger" style="width:auto;padding:2px 8px;font-size:12px;" onclick="removeEnemy(\'' + e.id + '\')">Убрать</button></div>' +
                statsLine + statusLine + levelLine + dmgLine + resistLine + spellsHtml + lootLine + shoutsHtml +
                '<div class="grid-2" style="gap:6px; margin-top:4px;">' +
                '<div><label style="font-size:12px;">HP (' + (e.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curHp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:12px;">MP (' + (e.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curMp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curMp\',this.value)"></div>' +
                '</div>' +
                (e.isRaisable && (e.curHp || 0) <= 0
                    ? '<div style="margin-top:4px; padding:4px; background:var(--input-bg); border-radius:3px; font-size:12px;">' +
                      '💀 Труп' + (e.corpseRace ? ' (' + escapeHtml(e.corpseRace) + ', знак «' + escapeHtml(e.corpseSign || '') + '»)' : '') +
                      (e.ashes ? '<div style="opacity:.75;">🔥 Обращён в пепел (Трансмутация смерти) — обыскать и поднять нельзя.</div>' : e.corpseLoot ? '<button style="width:100%; margin-top:2px;" onclick="lootCorpse(\'' + e.id + '\')">Обыскать (выдать добычу игроку из селектора ниже)</button>' : '<div style="opacity:.6;">Уже обыскан.</div>') +
                      '<div style="opacity:.6; margin-top:2px;">🧟 Доступен для поднятия заклинанием игрока</div>' +
                      '</div>'
                    : '') +
                '</div>';
        }).join('');
    }

    window.useShout = function (enemyId, shoutIdx, cooldown) {
        const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? { ...e, ['shoutCd_' + shoutIdx]: cooldown } : e);
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(err => console.error(err));
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
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(err => console.error(err));
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
        const totalMana = e.spells && e.spells.length ? Math.max(...e.spells.map(s => s.cost)) * 3 : 0;
        el('enemy-mp-input').value = totalMana;
        let info = '';
        if (e.weaponDmg) { const wd = enemyWeaponDamage(e); info += `Урон: ${wd.total}${wd.stat ? ' (оружие ' + wd.base + ' + ' + wd.label + ' ' + wd.stat + ')' : ''}${e.weaponNote ? ' — ' + escapeHtml(e.weaponNote) : ''}<br>`; }
        if (e.weaponOptions && e.weaponOptions.length > 1) info += `🎲 Варианты оружия (при добавлении выберется случайно): ${e.weaponOptions.map(escapeHtml).join(', ')}<br>`;
        if (Object.keys(e.resist).length) info += `Резист: ${Object.entries(e.resist).map(([k, v]) => k + ' ' + v + '%').join(', ')}<br>`;
        if (e.spells.length) info += `Заклинания: ${e.spells.map(s => s.name + ' (' + s.dmg + '/' + s.cost + ')').join(', ')}<br>`;
        if (e.shouts.length) info += `Крики: ${e.shouts.map(s => s.name).join(', ')}<br>`;
        if (e.loot) info += `Лут: ${escapeHtml(e.loot)}`;
        infoEl.innerHTML = info;
    };

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
        if (manualDmg) extra.weaponDmg = manualDmg;
        if (manualResist) extra.resist = { physical: manualResist };
        if (manualLoot) extra.loot = manualLoot;
        if (currentEnemyDbPick && currentEnemyDbPick.name === name) {
            if (currentEnemyDbPick.weaponDmg) extra.weaponDmg = currentEnemyDbPick.weaponDmg;
            // Рандомайзер оружия — у драугров/подобных несколько вариантов оружия в источнике
            // (Враги.xlsx), раньше просто брался статичный weaponNote. Один случайный вариант при
            // каждом добавлении в бой — правдоподобнее, чем всегда одно и то же оружие у всех.
            if (currentEnemyDbPick.weaponOptions && currentEnemyDbPick.weaponOptions.length) {
                extra.weaponNote = currentEnemyDbPick.weaponOptions[Math.floor(Math.random() * currentEnemyDbPick.weaponOptions.length)];
            } else if (currentEnemyDbPick.weaponNote) {
                extra.weaponNote = currentEnemyDbPick.weaponNote;
            }
            if (Object.keys(currentEnemyDbPick.resist || {}).length) extra.resist = currentEnemyDbPick.resist;
            if ((currentEnemyDbPick.spells || []).length) extra.spells = currentEnemyDbPick.spells;
            if ((currentEnemyDbPick.shouts || []).length) extra.shouts = currentEnemyDbPick.shouts;
            if (currentEnemyDbPick.loot) extra.loot = currentEnemyDbPick.loot;
            if (currentEnemyDbPick.soul) extra.soul = currentEnemyDbPick.soul; // размер души для захвата душ
            if (currentEnemyDbPick.level) extra.level = currentEnemyDbPick.level; // уровень и тип — для заклинаний «до N уровня»
            if (currentEnemyDbPick.kind) extra.kind = currentEnemyDbPick.kind;
            // Только гуманоидов можно поднять заклинанием (Воины/Шаманы/Боевые маги — фалмеры
            // и подобные; звери/монстры/ловушки — нет).
            if (['Воины', 'Шаманы', 'Боевые маги'].includes(currentEnemyDbPick.category)) extra.isRaisable = true;
        }
        enemies.push(stripUndefinedDeep(Object.assign({ id: genId('e'), name, maxHp, curHp: maxHp, maxMp, curMp: maxMp }, extra)));
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            el('enemy-name-input').value = '';
            el('enemy-hp-input').value = 10;
            el('enemy-mp-input').value = 0;
            el('enemy-dmg-input').value = 0;
            el('enemy-resist-input').value = 0;
            el('enemy-loot-input').value = '';
            el('enemy-db-select').value = '';
            el('enemy-db-info').innerHTML = '';
            currentEnemyDbPick = null;
        }).catch(e => console.error(e));
    };

    // TEXT_ENEMY_FIELDS — поля, которые НЕ надо принудительно приводить к числу (раньше
    // Number(value)||0 стояло безусловно для любого поля — для текста типа "лут" это дало бы 0).
    const TEXT_ENEMY_FIELDS = ['loot', 'weaponNote', 'name', 'kind'];
    window.setEnemyField = function (id, field, value) {
        const finalVal = TEXT_ENEMY_FIELDS.includes(field) ? value : (Number(value) || 0);
        const enemies = (lastData.enemies || []).map(e => e.id === id ? { ...e, [field]: finalVal } : e);
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
    };

    // Снятие статус-эффекта (Страх/Успокоение/Ярость/Полиморф) — тикается вручную мастером,
    // не по автоматическому счётчику ходов.
    window.removeEnemyStatus = function (enemyId, statusId) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== enemyId || !Array.isArray(e.statusEffects)) return e;
            return { ...e, statusEffects: e.statusEffects.filter(s => s.id !== statusId) };
        });
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
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
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
    };

    window.removeEnemy = function (id) {
        const enemies = (lastData.enemies || []).filter(e => e.id !== id);
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
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
        db.collection('sessions').doc(currentCode).update({ sessionTurnCounter: 0 }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmAdvanceTurn = function () {
        const tickLog = [];
        const enemies = (lastData.enemies || []).map(e => {
            const copy = { ...e };
            // Яды и зелья на враге: затяжной урон/снятие маны и регенерация тикают КАЖДЫЙ ход (до уменьшения длительности).
            if (Array.isArray(copy.statusEffects) && copy.statusEffects.length && (copy.curHp || 0) > 0) {
                let dHp = 0, dMp = 0;
                let poisonRes = (copy.resist && copy.resist.poison) || 0;
                copy.statusEffects.forEach(s => { if (s.res && s.res.poison) poisonRes += s.res.poison; });
                copy.statusEffects.forEach(s => {
                    if (s.dotHp) dHp -= Math.max(0, Math.round(s.dotHp * (s.dotNoResist ? 1 : (1 - poisonRes / 100))));
                    if (s.dotMp) dMp -= s.dotMp;
                    if (s.regenHp) dHp += s.regenHp;
                    if (s.regenMp) dMp += s.regenMp;
                });
                if (dHp || dMp) {
                    const oldHp = copy.curHp || 0, oldMp = copy.curMp || 0;
                    copy.curHp = Math.max(0, Math.min(copy.maxHp || oldHp, oldHp + dHp));
                    copy.curMp = Math.max(0, Math.min(copy.maxMp || oldMp, oldMp + dMp));
                    if (oldHp > 0 && copy.curHp <= 0) copy.diedAtTurn = lastData.sessionTurnCounter || 0;
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
        const logEntries = [{
            ts: Date.now(), author: 'Мастер',
            text: '⏭️ Новый ход! Не забудьте прокрутить длительность своих активных эффектов на листе.'
        }].concat(tickLog.map((t, i) => ({ ts: Date.now() + i + 1, author: 'Мастер', text: t })));
        db.collection('sessions').doc(currentCode).update({
            enemies: stripUndefinedDeep(enemies),
            sessionTurnCounter: firebase.firestore.FieldValue.increment(1),
            combatLog: firebase.firestore.FieldValue.arrayUnion(...logEntries)
        }).catch(e => alert('Ошибка: ' + e.message));
    };

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
            const reply = uid ? ' <button style="width:auto; padding:0 6px; font-size:11px;" onclick="replyToWhisper(\'' + escapeHtml(uid) + '\')">↩ ответить</button>' : '';
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
    function getSmithingGiveableItems() {
        const out = [];
        (window.armorRecipes || []).forEach(r => {
            out.push({
                name: r.name, category: r.armorType || 'Броня',
                weight: r.weight, price: r.price, armor: r.resistance, dmg: null,
                effect: r.perkHint ? ('Обычно требует перк: ' + r.perkHint) : '',
                slot: GM_SMITHING_SLOT_MAP[r.slot] || null
            });
        });
        (window.jewelryRecipes || []).forEach(r => {
            out.push({
                name: r.name, category: 'Ювелирное изделие',
                weight: r.weight || 0.1, price: r.price || 0, armor: null, dmg: null, effect: '',
                slot: r.name.includes('кольцо') ? 'ring' : 'amulet'
            });
        });
        (window.weaponRecipes || []).forEach(r => {
            out.push({
                name: r.name, category: (r.category || 'Оружие') + (r.subcat ? ' — ' + r.subcat : ''),
                weight: r.weight, price: r.price, armor: null,
                dmg: r.damage, effect: r.perkHint ? ('Обычно требует перк: ' + r.perkHint) : '',
                slot: r.isAmmo ? null : r.slot
            });
        });
        (window.armorNonCraftable || []).forEach(a => {
            out.push({
                name: a.name, category: (a.armorType || 'Броня') + ' (лут)',
                weight: a.weight, price: a.price, armor: a.resistance, dmg: null,
                effect: 'Не куётся — только лут/покупка/квест', slot: a.slot
            });
        });
        (window.weaponsNonCraftable || []).forEach(w => {
            out.push({
                name: w.name, category: (w.category || 'Оружие') + (w.subcat ? ' — ' + w.subcat : '') + ' (лут)',
                weight: w.weight, price: w.price, armor: null,
                dmg: w.damage, effect: 'Не куётся — только лут/покупка/квест',
                slot: w.isAmmo ? null : w.slot
            });
        });
        (window.recipes || []).forEach(r => {
            out.push({
                name: r.name, category: 'Блюдо (кулинария)',
                weight: r.weight || 0.5, price: r.price || 0, armor: null, dmg: null,
                effect: r.effect || '', slot: null
            });
        });
        if (window.failedDish) {
            out.push({
                name: window.failedDish.name, category: 'Блюдо (кулинария)',
                weight: window.failedDish.weight || 1, price: window.failedDish.price || 0,
                armor: null, dmg: null, effect: window.failedDish.effect || '', slot: null
            });
        }
        (window.alchemyPremadePotions || []).forEach(p => {
            out.push({
                name: p.name, category: p.category, weight: p.weight, price: p.price,
                armor: null, dmg: null, effect: p.effect, slot: null, alchemyEffects: p.alchemyEffects
            });
        });
        // Крафтящиеся свитки — все заклинания, которые игрок может выучить и записать сам.
        const TIER_PRICE = { 1: 15, 2: 30, 3: 45, 4: 60 };
        if (window.spellsData) {
            Object.keys(window.spellsData).forEach(school => {
                [1, 2, 3, 4].forEach(tier => {
                    (window.spellsData[school][tier] || []).forEach(sp => {
                        out.push({
                            name: 'Свиток: ' + sp.name, category: 'Свитки (крафтящиеся)',
                            weight: 0.1, price: TIER_PRICE[tier], armor: null, dmg: null,
                            effect: sp.desc || '', slot: null
                        });
                    });
                });
            });
        }
        return out;
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
                    <td>${item.name}</td>
                    <td>${item.category || '-'}</td>
                    <td>${item.weight || 0}</td>
                    <td>${item.price || 0}</td>
                    <td>
                        <button class="btn btn-sm" onclick="window.gmGiveItemFromTable('${itemId}')">Передать</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        if (countSpan) countSpan.textContent = gmFilteredItems.length;
    };

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

        // Переносим слот/броню/урон/цену, чтобы игрок мог сразу надеть/взять в руки предмет
        // и видеть его цену.
        const extra = {};
        if (sourceItem.slot) extra.slot = sourceItem.slot;
        if (typeof sourceItem.armor === 'number') extra.armorValue = sourceItem.armor;
        if (typeof sourceItem.dmg === 'number') extra.weaponDmg = sourceItem.dmg;
        if (typeof sourceItem.price === 'number') extra.price = sourceItem.price;
        if (typeof sourceItem.capacity === 'number') extra.capacity = sourceItem.capacity;
        if (typeof sourceItem.maxUses === 'number') { extra.maxUses = sourceItem.maxUses; extra.usesLeft = sourceItem.maxUses; }
        if (sourceItem.type === 'staff') { extra.isStaff = true; extra.slot = 'ranged'; }
        if (isStolen) extra.stolen = true;
        // Зелья/яды: игрок получает реальные эффекты (применяются автоматически при использовании) и единую категорию.
        if (Array.isArray(sourceItem.alchemyEffects)) extra.alchemyEffects = sourceItem.alchemyEffects;
        if (/^Яд/i.test(sourceItem.category || '')) extra.category = 'Яд';
        else if (/^Зель/i.test(sourceItem.category || '')) extra.category = 'Зелье';

        // Мастер видит и может применить ЛЮБОЕ зачарование (не только то, что игрок уже узнал
        // разрушив вещь — у мастера, в отличие от игрока, ограничения "только узнанное" нет).
        // Только для вещей с экипировочным слотом — обычные расходники зачаровать нельзя.
        const enchantableSlots = ['melee', 'ranged', 'helmet', 'chest', 'robe', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'circlet'];
        if (sourceItem.slot && enchantableSlots.includes(sourceItem.slot) && !sourceItem.enchantment &&
            confirm(`Зачаровать «${sourceItem.name}» перед выдачей?`)) {
            const isWeapon = sourceItem.slot === 'melee' || sourceItem.slot === 'ranged';
            const armorSlotMap = { chest: 'armor', gloves: 'gauntlets', neck: 'amulet' };
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

        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.data();
            let inv = data.inventory || [];
            const existing = inv.find(item => item.itemId === itemId);
            if (existing) {
                existing.count += numCount;
                Object.assign(existing, extra);
            } else {
                inv.push(Object.assign({
                    itemId: itemId,
                    name: sourceItem.name,
                    count: numCount,
                    weight: sourceItem.weight || 0,
                    category: sourceItem.category || '',
                    effect: sourceItem.effect || ''
                }, extra));
            }
            return db.collection('characters').doc(targetUid).update({ inventory: inv });
        }).then(() => {
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
                <input type="checkbox" ${checked} onchange="toggleRecipeKnown('${escapeHtml(r.name)}', this.checked)">
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
    const WEREWOLF_BASE_INFO = 'Раз в сутки на 4 часа: +50 хп, +100 переносимого веса, когти 20 урона (+5 каждые 4 ур. персонажа), +20 скорости';
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
    const VAMPIRE_BASE_INFO = '+2 харизма, +1 ловкость, +1 сила · бесплатное заклинание высасывания здоровья (5 хп/ход) · бесплатное "Подъём сильного трупа" (160 хп, 30 урона)';
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
            perks: 'Оплата выступления: 30 септимов база + 10×к10 + (Красноречие×0.1), зависит от репутации. За 4 легендарные песни — "Бардовская баллада" (+1 к кубам всем живым союзникам, пока играешь). За 12 — "Сила слова" (+1 убеждение, +1 к попытке скидки). За 18 (+2 исторических артефакта) — "Воодушевление" (+3 к кубам цели 2 раза в день).',
            armorRewards: [],
            note: 'Прогресс этой гильдии считается ЛЕГЕНДАРНЫМИ ПЕСНЯМИ, не заказами — использует то же поле orders (не отдельный счётчик, но пороги рангов пересчитаны на реальные 4/12/18). Сдача в музей — кнопка на листе игрока (donateToBardMuseum, +1 orders +1 artifacts +800 золота атомарно через CloudSync.donateBardArtifact). "Сила слова" подключена механически (+1 красноречие при orders>=12).'
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
        if (!currentInvPlayerUid) { listEl.innerHTML = '<p style="opacity:.6; font-size:13px;">Игрок не выбран — выбери его в панели «Инвентарь и деньги» выше, этот же выбор используется здесь.</p>'; return; }
        const pname = (lastData.participants && lastData.participants[currentInvPlayerUid] && lastData.participants[currentInvPlayerUid].name) || currentInvPlayerUid;
        listEl.innerHTML = `<p style="font-size:13px; opacity:.8; margin-bottom:6px;">Игрок: <strong>${escapeHtml(pname)}</strong></p>` + REPUTATION_HOLDS.map(h => `
            <div class="party-row" style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                <span>${escapeHtml(h)}</span>
                <span style="display:flex; align-items:center; gap:4px;">
                    <button style="width:auto; padding:2px 8px;" onclick="adjustReputation('${escapeHtml(h)}', -1)">−1</button>
                    <input type="number" value="${currentReputationData[h] || 0}" style="width:60px; text-align:center;" onchange="setReputation('${escapeHtml(h)}', this.value)">
                    <button style="width:auto; padding:2px 8px;" onclick="adjustReputation('${escapeHtml(h)}', 1)">+1</button>
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resetReputation('${escapeHtml(h)}')">Сброс</button>
                </span>
            </div>`).join('');
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
            .then(() => alert('Репутация сохранена.'))
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
                <button class="btn-danger" style="width:100%;" onclick="clearFine()">Списать штраф (оплачен/прощён)</button>
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
        currentCrimeState = Object.assign({}, currentCrimeState, {
            fineAmount: amount, fineHold: el('fine-hold-select').value,
            fineReason: el('fine-reason-input').value.trim(), refused: false
        });
        saveCrimeState().then(() => {
            renderCrimePanel();
            gmPostLogEntryText(`⚖️ Штраф ${amount} септимов (${currentCrimeState.fineHold})${currentCrimeState.fineReason ? ': ' + currentCrimeState.fineReason : ''}.`);
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

    window.clearFine = function () {
        if (!currentInvPlayerUid) return;
        currentCrimeState = Object.assign({}, currentCrimeState, { fineAmount: 0, fineHold: '', fineReason: '', refused: false });
        saveCrimeState().then(renderCrimePanel).catch(e => alert('Ошибка: ' + e.message));
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

    function defaultSupernaturalState() {
        return {
            lycanthropy: false, vampirism: false,
            werewolf: { heartsEaten: 0, totem: HIRCINE_TOTEMS[0], hasTransformedToday: false, isTransformed: false },
            vampire: { hungerStage: 0, rank: 0, abilities: {} }
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
        'Красноводная скума', 'Лунный сахар'
    ]);

    function getMerchantItemPool(typeKey) {
        const def = LIVING_MERCHANT_TYPES[typeKey];
        if (!def) return [];
        let pool = (gmAllItems || []).filter(i => def.categories.includes(i.category) && typeof i.price === 'number' && i.price > 0 && !MERCHANT_EXCLUDED_ITEMS.has(i.name));
        if (typeKey === 'blacksmith2') {
            pool = pool.concat((window.weaponRecipes || []).filter(w => !/лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorRecipes || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: GM_SMITHING_SLOT_MAP[a.slot] || null })));
            pool = pool.concat((window.weaponsNonCraftable || []).filter(w => !/лук/i.test(w.name)).map(w => ({ name: w.name, category: 'Оружие', price: w.price, weight: w.weight, dmg: w.damage, slot: w.slot })));
            pool = pool.concat((window.armorNonCraftable || []).map(a => ({ name: a.name, category: 'Броня', price: a.price, weight: a.weight, armor: a.resistance, slot: normalizeArmorSlot(a.slot) })));
        }
        if (typeKey === 'fletcher') {
            pool.push({ name: 'Стрела', category: 'Боеприпасы', price: 1, weight: 0.1 });
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
        return pool;
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

    window.refreshMerchantStock = function () {
        const typeKey = el('merchant-type-select').value;
        const hold = el('merchant-hold-select').value;
        if (!hold) { alert('Выбери владение.'); return; }
        const def = LIVING_MERCHANT_TYPES[typeKey];
        let pool = getMerchantItemPool(typeKey);
        if (!pool.length) { alert('Нет предметов в базе для этого типа торговца.'); return; }

        // У кузнеца — вес местного материала (по владению) в 3 раза выше, остальное не пропадает,
        // просто попадается реже. Строим "взвешенный" пул простым дублированием записей.
        let weightedPool = pool;
        if (typeKey === 'blacksmith2' && HOLD_MATERIAL_AFFINITY[hold]) {
            const affinity = HOLD_MATERIAL_AFFINITY[hold];
            weightedPool = [];
            pool.forEach(i => {
                const weight = affinity.test(i.name) ? 3 : 1;
                for (let w = 0; w < weight; w++) weightedPool.push(i);
            });
        }

        const count = Math.min(pool.length, randInt(15, 26)); // было 10-20, теперь +5-6 позиций
        const shuffled = weightedPool.slice().sort(() => Math.random() - 0.5);
        const items = [];
        const usedNames = new Set();
        for (const i of shuffled) {
            if (items.length >= count) break;
            if (usedNames.has(i.name)) continue; // без повторов позиций — количество штук решается ниже
            usedNames.add(i.name);
            items.push(i);
        }
        // Задача: у торговца несколько штук одной вещи (3 пшеницы, 5 соли и т.п.) — расходники
        // (еда/ингредиенты/боеприпасы/самоцветы) получают случайное количество 2-6, штучные вещи
        // (оружие/броня/книги/украшения) остаются по 1.
        const STACKABLE_CATEGORIES = ['Готовые продукты', 'Сырые продукты', 'Напитки', 'Ингредиенты для алхимии', 'Боеприпасы', 'Драгоценные камни', 'Камни душ'];
        const finalItems = items.map(i => {
            const qty = STACKABLE_CATEGORIES.includes(i.category) ? randInt(2, 6) : 1;
            // Firestore ЦЕЛИКОМ отвергает .update(), если хоть ОДНО поле где-то внутри — undefined
            // (было тут: dmg/armor/slot/capacity у предмета без этих свойств, например у еды) —
            // отсюда "торговец не появляется" после нажатия "Обновить ассортимент": запись просто
            // молча проваливалась. Добавляем поле, только если оно реально есть.
            const out = { name: i.name, category: i.category, price: i.price, weight: i.weight || 0, effect: i.effect || '', qty };
            if (typeof i.dmg === 'number') out.dmg = i.dmg;
            if (typeof i.armor === 'number') out.armor = i.armor;
            if (i.slot) out.slot = i.slot;
            if (typeof i.capacity === 'number') out.capacity = i.capacity;
            return out;
        });
        // Гарантированные 2-5 слитков у кузнеца и барахольщика — по прямой просьбе "к уже их
        // ассортименту", то есть ГАРАНТИРОВАННО, не просто доступны для случайного отбора (пул
        // выше — рандомная выборка 15-26 из общего списка, слитки могли бы ни разу не попасть).
        if (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive') {
            // Золотой слиток по вики купить нельзя вообще, серебряный слиток почти не продаётся — их исключаем.
            // Зато серебряную РУДУ кузнецы и торговцы общими товарами продают (по вики) — добавляем в тот же пул.
            const NOT_FOR_SALE = ['Золотой слиток', 'Серебряный слиток'];
            const allIngots = (window.allItems || gmAllItems).filter(i => i.category === 'Кузнечные ингредиенты' && (/слиток/i.test(i.name) || i.name === 'Серебряная руда') && NOT_FOR_SALE.indexOf(i.name) === -1);
            const usedNames2 = new Set(finalItems.map(i => i.name));
            const freshIngots = allIngots.filter(i => !usedNames2.has(i.name)).sort(() => Math.random() - 0.5);
            const ingotCount = Math.min(freshIngots.length, randInt(2, 5));
            for (let k = 0; k < ingotCount; k++) {
                const ing = freshIngots[k];
                finalItems.push({ name: ing.name, category: ing.category, price: ing.price, weight: ing.weight || 0, effect: ing.effect || '', qty: randInt(2, 6) });
            }
        }
        // Ювелиры торгуют слитками (UESP: "traded by jewelry merchants as well as blacksmiths") —
        // гарантированно серебряный и золотой слиток у ювелира.
        if (typeKey === 'jeweler') {
            ['Серебряный слиток', 'Золотой слиток'].forEach(nm => {
                const it = (window.allItems || gmAllItems).find(i => i.name === nm);
                if (it && !finalItems.some(f => f.name === nm)) {
                    finalItems.push({ name: it.name, category: it.category, price: it.price, weight: it.weight || 0, effect: it.effect || '', qty: randInt(2, 5) });
                }
            });
        }
        // Солстейм: по вики (UESP) хитиновую пластину и шкуру нетча продают кузнецы и торговцы общими
        // товарами ТОЛЬКО на Солстейме — гарантированно добавляем их туда (как и слитки выше).
        if (hold === 'Схолстейм' && (typeKey === 'blacksmith2' || typeKey === 'pawnbrokerLive')) {
            [['Хитиновая пластина', 3, 8], ['Шкура нетча', 2, 5]].forEach(([nm, lo, hi]) => {
                const it = (window.allItems || gmAllItems).find(i => i.name === nm);
                if (it && !finalItems.some(f => f.name === nm)) {
                    finalItems.push({ name: it.name, category: it.category, price: it.price, weight: it.weight || 0, effect: it.effect || '', qty: randInt(lo, hi) });
                }
            });
        }
        const key = typeKey + '@' + hold;
        const stocks = Object.assign({}, lastData.merchantStocks || {});
        // disposition (-2..+2, отношение конкретного торговца к группе) — СОХРАНЯЕМ существующее
        // значение при обновлении ассортимента (это про товар, не про отношение), 0 только для
        // нового торговца. Меняется отдельно, кнопками ниже (setMerchantDisposition), без
        // необходимости перегенерировать весь ассортимент заново.
        const existingDisposition = (stocks[key] && stocks[key].disposition) || 0;
        stocks[key] = { gold: def.gold, items: stripUndefinedDeep(finalItems), updatedAt: Date.now(), generatedOnDay: lastData.gameDayCounter || 0, label: def.label, hold: hold, disposition: existingDisposition };
        db.collection('sessions').doc(currentCode).update({ merchantStocks: stocks }).then(() => {
            el('merchant-gen-result').innerHTML = `<span style="color:#2ecc71;">✅ ${def.label} в «${hold}»: ${finalItems.length} позиций, золото ${def.gold}.</span>`;
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
                <select style="width:auto; font-size:11px; padding:1px;" onchange="setMerchantDisposition('${escapeHtml(k)}', this.value)">
                    ${Object.keys(DISPOSITION_LABELS).map(v => `<option value="${v}" ${String(disp) === v ? 'selected' : ''}>${DISPOSITION_LABELS[v]}</option>`).join('')}
                </select>
                <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:11px; flex-shrink:0;" onclick="removeMerchant('${escapeHtml(k)}')">Убрать</button>
            </div>`;
        }).join('');
    }

    // disposition конкретного торговца (-2 Вражда .. +2 Союзник) — отношение влияет на цены у
    // игрока (computeBuyPrice/computeSellPrice, index.html) и может полностью заблокировать
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
        sel.innerHTML = Object.entries(LIVING_MERCHANT_TYPES).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)} (база ${v.gold} золота)</option>`).join('');
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
                        <input type="checkbox" ${gd.member ? 'checked' : ''} onchange="toggleGuildMembership('${escapeHtml(g)}', this.checked)">
                        <strong>${escapeHtml(g)}</strong>
                    </label>
                    ${gd.member ? `<span style="font-size:12px; opacity:.8;">${escapeHtml(rank.rankName)}${rank.next ? ' → ещё ' + (rank.next.at - gd.orders) + ' до «' + escapeHtml(rank.next.name) + '»' : ' (максимум)'}</span>` : ''}
                </div>
                ${gd.member ? `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                    <span>Заказов: <strong>${gd.orders}</strong></span>
                    <span style="display:flex; gap:4px;">
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${escapeHtml(g)}', 1)">+1</button>
                        <button style="width:auto; padding:2px 8px;" onclick="adjustGuildOrders('${escapeHtml(g)}', 5)">+5</button>
                        <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="resetGuildOrders('${escapeHtml(g)}')">Сброс</button>
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
        db.collection('characters').doc(uid).set({ gold: firebase.firestore.FieldValue.increment(-200) }, { merge: true }).then(() => {
            el('tourn-result').innerHTML = `<span style="color:#2ecc71;">Залог 200 золота списан.</span>`;
        }).catch(e => alert('Ошибка: ' + e.message));
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
        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            // Золотые награды просто прибавляем к золоту; предметные — кладём в инвентарь текстом,
            // как и остальные гильдийские награды (без обязательной регистрации в общем каталоге).
            const goldMatch = rewardText.match(/^(\d+)\s*золота/);
            const patch = {};
            if (goldMatch) {
                patch.gold = firebase.firestore.FieldValue.increment(parseInt(goldMatch[1]));
            } else {
                inv.push({ itemId: rewardText + '_tourn_' + Date.now(), name: rewardText, count: 1, weight: 1, category: 'Награда турнира', effect: `Приз группы «${bracket}» Бойцовского клуба` });
                patch.inventory = inv;
            }
            return db.collection('characters').doc(uid).update(patch);
        }).then(() => {
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
                <label>Стадия голода (0-3)</label>
                <select id="sn-hunger" onchange="setVampireHunger(this.value)">
                    ${[0, 1, 2, 3].map(n => `<option value="${n}" ${s.vampire.hungerStage === n ? 'selected' : ''}>${n}${n === 0 ? ' (сыт)' : ''}${n === 3 ? ' (истощён)' : ''}</option>`).join('')}
                </select>
                <button class="btn-success" style="width:100%; margin-top:4px;" onclick="feedVampire()">🩸 Покормить (стадия → 0)</button>
                <label style="margin-top:6px;">Ранг вампира: <input type="number" id="sn-vamp-rank" value="${s.vampire.rank}" min="0" style="width:70px; display:inline;" onchange="setVampireRank(this.value)"></label>
                <button style="width:100%; margin-top:4px;" onclick="setVampireRank(${s.vampire.rank + 1})">+1 ранг вампира</button>
                <label style="margin-top:8px;">Способности вампира-лорда (редкая ступень — не у всех вампиров)</label>
                ${VAMPIRE_ABILITIES.map(a => `<div class="checkbox-group" style="align-items:flex-start;">
                    <input type="checkbox" ${s.vampire.abilities[a.name] ? 'checked' : ''} onchange="toggleVampireAbility('${escapeHtml(a.name)}', this.checked)">
                    <label><strong>${escapeHtml(a.name)}</strong> — ${escapeHtml(a.desc)}${a.prereq ? `<br><span style="opacity:.6; font-size:11px;">Требует: ${escapeHtml(a.prereq)}</span>` : ''}</label>
                </div>`).join('')}
            </div>`;
    }

    window.toggleSupernaturalFlag = function (key, checked) {
        currentSupernaturalState[key] = checked;
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
        currentSupernaturalState.vampire.hungerStage = Math.max(0, Math.min(3, parseInt(val) || 0));
        saveSupernaturalState();
    };
    window.feedVampire = function () {
        currentSupernaturalState.vampire.hungerStage = 0;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.setVampireRank = function (val) {
        currentSupernaturalState.vampire.rank = Math.max(0, parseInt(val) || 0);
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.toggleVampireAbility = function (name, checked) {
        currentSupernaturalState.vampire.abilities[name] = checked;
        saveSupernaturalState();
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
                perkPointsAvailable: parseInt(data.perkPointsAvailable) || 0
            };
            el('inv-gold-block').style.display = 'block';
            el('inv-gold-current').textContent = currentPlayerInvData.gold;
            el('inv-level-block').style.display = 'block';
            el('inv-level-current').textContent = currentPlayerInvData.characterLevel;
            el('inv-perkpoints-current').textContent = currentPlayerInvData.perkPointsAvailable;
            const needed = currentPlayerInvData.characterLevel * 2 + 2;
            el('inv-level-progress').textContent = `Прогресс: ${currentPlayerInvData.levelUpProgress} / ${needed} очков навыков`;
            renderGmPlayerInventory();

            // Гильдии/Сверхъестественное пишутся сразу по клику — безопасно обновлять на лету.
            currentGuildsData = normalizeGuildsData(data.guildsData);
            const defaultSn = defaultSupernaturalState();
            currentSupernaturalState = data.supernaturalState ? {
                lycanthropy: !!data.supernaturalState.lycanthropy,
                vampirism: !!data.supernaturalState.vampirism,
                werewolf: Object.assign(defaultSn.werewolf, data.supernaturalState.werewolf || {}),
                vampire: Object.assign(defaultSn.vampire, data.supernaturalState.vampire || {}, { abilities: (data.supernaturalState.vampire || {}).abilities || {} })
            } : defaultSn;
            renderGuildsPanel();
            renderSupernaturalPanel();
            currentCrimeState = Object.assign({ fineAmount: 0, fineHold: '', fineReason: '', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 }, data.crimeState || {});
            renderCrimePanel();
            // Репутация копится ЛОКАЛЬНО до явного "Сохранить" (см. панель Задачи D) — если
            // перезатирать её на каждом чужом снапшоте, можно потерять несохранённые правки
            // мастера. Подтягиваем из облака только при первом выборе этого игрока.
            if (firstSnapshot) {
                currentReputationData = Object.assign(defaultReputationData(), data.reputationByRegion || {});
                renderReputationPanel();
                firstSnapshot = false;
            }
        }, err => {
            console.error('Ошибка подписки на инвентарь игрока:', err);
            el('inv-items-list').innerHTML = `<p style="color:#e74c3c; font-size:13px;">Не удалось загрузить инвентарь игрока: ${escapeHtml(err.message || String(err))}</p>`;
        });
    };

    window.grantLevelUp = function () {
        if (!currentInvPlayerUid) return;
        const statKey = el('inv-level-stat-choice').value;
        const statLabels = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        const statOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        const statPos = statOrder.indexOf(statKey);
        let newLevelForLog = null;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const newLevel = (parseInt(data.characterLevel) || 1) + 1;
            newLevelForLog = newLevel;
            const newPerkPoints = (parseInt(data.perkPointsAvailable) || 0) + 1;
            const stats = Array.isArray(data.stats) ? data.stats.slice() : [10, 10, 10, 10, 10, 10];
            stats[statPos] = (parseInt(stats[statPos]) || 10) + 1;
            return db.collection('characters').doc(currentInvPlayerUid).update({
                characterLevel: newLevel,
                perkPointsAvailable: newPerkPoints,
                levelUpProgress: 0,
                stats: stats
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

    window.decreasePlayerSkill = function () {
        if (!currentInvPlayerUid) return;
        const skillIdx = parseInt(el('inv-skill-decrease-select').value) || 0;
        const amount = parseInt(el('inv-skill-decrease-amount').value) || 1;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const skills = Array.isArray(data.skills) ? data.skills.slice() : [];
            const current = parseInt(skills[skillIdx]) || 10;
            skills[skillIdx] = Math.max(10, current - amount);
            return db.collection('characters').doc(currentInvPlayerUid).update({ skills: skills });
        }).then(() => {
            alert(`Навык «${SKILL_NAMES_BY_IDX[skillIdx]}» понижен на ${amount}.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

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
                        <button class="btn-danger" style="width:auto; padding:2px 8px; font-size:12px;" onclick="deletePlayerItem('${escapeHtml(item.itemId)}')">Удалить</button>
                    </span>
                </div>
                ${item.effect ? `<div style="font-size:12px; opacity:.75; margin-top:2px;">${escapeHtml(item.effect)}</div>` : ''}
            </div>
        `).join('');
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
        const newCount = item.count - qty;
        const newInv = newCount > 0
            ? currentPlayerInvData.inventory.map(i => i.itemId === itemId ? { ...i, count: newCount } : i)
            : currentPlayerInvData.inventory.filter(i => i.itemId !== itemId);
        db.collection('characters').doc(currentInvPlayerUid).update({ inventory: newInv }).then(() => {
            currentPlayerInvData.inventory = newInv;
            renderGmPlayerInventory();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.applyGoldDelta = function (sign) {
        if (!currentInvPlayerUid) return;
        const amount = parseInt(el('inv-gold-delta').value) || 0;
        if (amount <= 0) { alert('Укажи положительную сумму.'); return; }
        // Та же гонка, что и в grantPartyReward — currentPlayerInvData.gold мог отстать от
        // реального значения в Firestore (если игрок только что что-то залутал/продал, а его
        // автосохранение ещё не долетело). Атомарный increment не читает старое значение вообще.
        const delta = sign * amount;
        db.collection('characters').doc(currentInvPlayerUid).update({ gold: firebase.firestore.FieldValue.increment(delta) }).then(() => {
            el('inv-gold-delta').value = '';
            const pname = (lastData.participants[currentInvPlayerUid] || {}).name || currentInvPlayerUid;
            gmPostLogEntryText(`💰 Мастер ${sign > 0 ? 'выдал' : 'списал'} ${amount} золота игроку ${pname}.`);
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
            const enchantSlotMap = { chest: 'armor', gloves: 'gauntlets', neck: 'amulet' };
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
        'Насморк Пелиниала': { desc: '−2 к броскам Скрытности и Карманных краж.' }
    };

    const GM_STATUS_EFFECTS = {
        paralyze: { name: 'Паралич', desc: 'Не может действовать в свой ход.', turns: 1 },
        fear: { name: 'Страх', desc: 'Вынужден отступать/убегать 1 ход.', turns: 1 },
        frenzy: { name: 'Бешенство', desc: 'Атакует ближайшую цель без разбора 1 ход.', turns: 1 },
        slow: { name: 'Замедление', desc: '-10 фт. скорости.', turns: 3 },
        weakened: { name: 'Ослабление', desc: '-2 к броскам атаки/проверок.', turns: 2, rollPenalty: -2 }
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
        return raw + bonus;
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

    async function grantQuestToUid(uid, quest) {
        const ref = db.collection('characters').doc(uid);
        const doc = await ref.get();
        const data = doc.exists ? doc.data() : {};
        const quests = Array.isArray(data.playerQuests) ? data.playerQuests.slice() : [];
        quests.push(quest);
        await ref.set({ playerQuests: quests }, { merge: true });
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
        const itemExtra = {};
        if (sourceItem) {
            if (sourceItem.slot) itemExtra.slot = sourceItem.slot;
            if (typeof sourceItem.armor === 'number') itemExtra.armorValue = sourceItem.armor;
            if (typeof sourceItem.dmg === 'number') itemExtra.weaponDmg = sourceItem.dmg;
            if (typeof sourceItem.price === 'number') itemExtra.price = sourceItem.price;
            if (typeof sourceItem.capacity === 'number') itemExtra.capacity = sourceItem.capacity;
            if (typeof sourceItem.maxUses === 'number') { itemExtra.maxUses = sourceItem.maxUses; itemExtra.usesLeft = sourceItem.maxUses; }
        }

        // Золото — атомарный FieldValue.increment(), а не "прочитать старое значение + прибавить
        // + записать целиком". Раньше тут читалось doc.data().gold (могло быть УСТАРЕВШИМ, если
        // игрок только что залутал труп — его автосохранение задерживается на 800мс) и писалось
        // поверх — если автосохранение игрока срабатывало ПОСЛЕ, оно перезаписывало это своим
        // локальным (тоже отстающим от выдачи мастера) значением. Инкремент не читает вообще —
        // Firestore сам прибавляет к тому, что там СЕЙЧАС, никакой гонки для золота больше нет.
        Promise.all(uids.map(uid => {
            const update = {};
            if (gold) update.gold = firebase.firestore.FieldValue.increment(gold);
            if (!sourceItem) return db.collection('characters').doc(uid).update(update);
            // Предмет по-прежнему требует прочитать текущий инвентарь (нужно проверить, есть ли
            // уже такой стек) — тут гонка технически остаётся, но она намного уже без золота
            // в этой же операции, и out-of-band риск метаться отдельно от inventory игрока.
            return db.collection('characters').doc(uid).get().then(doc => {
                const data = doc.exists ? doc.data() : {};
                const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
                const existing = inv.find(i => i.itemId === itemId);
                if (existing) {
                    existing.count += itemQty;
                    Object.assign(existing, itemExtra);
                } else {
                    inv.push(Object.assign({ itemId, name: sourceItem.name, count: itemQty, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemExtra));
                }
                update.inventory = inv;
                return db.collection('characters').doc(uid).update(update);
            });
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
    window.onGmAttackAttackerPicked = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const actionSelect = el('gm-attack-action-select');
        if (!actionSelect) return;
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        if (!enemy) { actionSelect.innerHTML = '<option value="">—</option>'; return; }
        let opts = '';
        if (enemy.weaponDmg) opts += `<option value="weapon">Оружие (${enemyWeaponDamage(enemy).total} урона${enemy.weaponNote ? ' — ' + escapeHtml(enemy.weaponNote) : ''})</option>`;
        (enemy.spells || []).forEach((s, i) => {
            opts += `<option value="spell:${i}">${escapeHtml(s.name)} (${s.dmg} урона / ${s.cost} МП)</option>`;
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
        targetSelect.innerHTML = uids.length
            ? uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('')
            : '<option value="">Нет игроков в сессии</option>';
        if (uids.includes(prevTgt)) targetSelect.value = prevTgt;

        onGmAttackAttackerPicked();
    }

    window.rollGmAttack = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const targetUid = el('gm-attack-target-select').value;
        const actionVal = el('gm-attack-action-select').value;
        const resultBox = el('gm-attack-roll-result');
        const textEl = el('gm-attack-roll-text');
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        const targetName = (lastData.participants[targetUid] || {}).name || targetUid;
        if (!enemy || !targetUid || !actionVal) { alert('Выбери атакующего, цель и действие.'); return; }

        let dmg = 0, dmgType = 'physical', actionLabel = '', atkMod = 0, dmgBreakdown = '';
        let isSpellAttack = false, spellCost = 0, statusNote = '';
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
        } else if (actionVal.indexOf('spell:') === 0) {
            const s = enemy.spells[parseInt(actionVal.slice(6))];
            dmg = s ? s.dmg : 0;
            isSpellAttack = true; spellCost = s ? (parseInt(s.cost) || 0) : 0;
            dmgType = mapEnemyDmgType(s ? s.name : '');
            actionLabel = `заклинанием «${s ? s.name : '?'}»`;
            atkMod = calcAbilityMod(enemy.int || 10);
        } else if (actionVal.indexOf('shout:') === 0) {
            const s = enemy.shouts[parseInt(actionVal.slice(6))];
            dmg = 0;
            actionLabel = `криком «${s ? s.name : '?'}» (${s ? s.effect : ''})`;
        }

        // Встречный бросок 2д20 — как и у самой атаки игрока: атакующий (враг) кидает 1д20+мод,
        // защищающийся (игрок) — голый 1д20, ничья не считается ни попаданием ни промахом (перекид
        // обеих костей). Раньше тут был просто один голый d20 без всякого сравнения — по сути,
        // "бросок ради галочки", не влиявший ни на что.
        let enemyRoll, enemyTotal, playerRoll, rerolls = 0;
        do {
            enemyRoll = Math.floor(Math.random() * 20) + 1;
            enemyTotal = enemyRoll + atkMod;
            playerRoll = Math.floor(Math.random() * 20) + 1;
            if (enemyTotal !== playerRoll) break;
            rerolls++;
        } while (rerolls < 20);
        const hit = enemyTotal > playerRoll;

        const statusKey = el('gm-attack-status-select') ? el('gm-attack-status-select').value : '';

        pendingGmAttack = {
            targetUid, dmg: hit ? dmg : 0, dmgType, statusKey: hit ? statusKey : '', enemyName: enemy.name, targetName, hit,
            isRangedAtk: actionVal === 'weapon' && !!enemy.isRanged,
            isSpell: !!(hit && isSpellAttack), spellCost,
            // Теги болезни (carrierOfDisease/diseaseChance) — для автоматического броска на
            // заражение при попадании физической атакой, см. applyGmAttackDamage.
            carrierOfDisease: hit ? enemy.carrierOfDisease : null, diseaseChance: hit ? (enemy.diseaseChance || 0) : 0,
            logTextBase: `👹 ${enemy.name} атакует ${targetName} ${actionLabel}: враг ${enemyTotal} (к20 ${enemyRoll}${atkMod >= 0 ? '+' : ''}${atkMod}) vs игрок ${playerRoll}${rerolls ? ` (перекид ×${rerolls})` : ''} — ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'}`
        };
        textEl.innerHTML = `<strong>${escapeHtml(enemy.name)}</strong> атакует <strong>${escapeHtml(targetName)}</strong> ${actionLabel}<br>` +
            `Враг: 1d20 (${enemyRoll}) ${atkMod >= 0 ? '+' : ''}${atkMod} = <strong style="color:var(--accent-color, #c9a86c);">${enemyTotal}</strong> vs Игрок: 1d20 = <strong style="color:var(--accent-color, #c9a86c);">${playerRoll}</strong>${rerolls ? `<br><span style="opacity:.7;">Перекид из-за ничьей: ×${rerolls}</span>` : ''}<br>` +
            (!hit ? `<strong style="color:#7a7a7a;">❌ Промах — урона нет.</strong>` :
                dmg ? `<strong style="color:#2ecc71;">✅ Попадание!</strong> Базовый урон: <span style="color:#e74c3c; font-size:16px; font-weight:bold;">${dmg}</span> ед.${dmgBreakdown} (резист цели вычтется автоматически при применении)` :
                    '<strong style="color:#2ecc71;">✅ Попадание!</strong> <span style="opacity:.7;">Эффект без прямого урона — примени вручную по описанию.</span>');
        resultBox.style.display = 'block';
    };

    // Заклинания в enemies-data.js не хранят тип урона отдельно — определяем по названию.
    function mapEnemyDmgType(spellName) {
        const n = (spellName || '').toLowerCase();
        if (/огн|пламен/.test(n)) return 'fire';
        if (/лед|мороз|холод/.test(n)) return 'frost';
        if (/молни|гроз|электр/.test(n)) return 'shock';
        if (/яд|отрав/.test(n)) return 'poison';
        return 'magic';
    }

    window.applyGmAttackDamage = function () {
        if (!pendingGmAttack) return;
        const { targetUid, dmg, dmgType, statusKey, logTextBase } = pendingGmAttack;
        if (!dmg && !statusKey) {
            gmPostLogEntryText(logTextBase + '.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
            return;
        }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const resist = (data.resistances && data.resistances[dmgType]) || 0;
            let finalDmg = dmg ? Math.max(0, Math.round(dmg * (1 - resist / 100))) : 0;
            const defNotes = [];
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
            // «Повышение навыка» (зачарования/зелья): Блокирование — N% шанс поглотить физ. урон; Лёгкая броня — (N/2)% уклониться.
            if (finalDmg && dmgType === 'physical') {
                const boosts = data.skillBoosts || {};
                const blockPct = boosts['блокирование'] || 0;
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
            let sunNote = '';
            if (finalDmg && data.supernaturalState && data.supernaturalState.vampirism && lastData.timePeriod === 'День') {
                finalDmg *= 2;
                sunNote = ' (☀️ уязвимость вампира к солнцу — урон ×2)';
            }
            let logExtra = '', newHp, newMp;
            const chores = [];
            // Заклинание «Барьер» (Изменение): pct% ВСЕГО входящего урона уходит в ману (rate маны за 1 урона).
            // Мана кончилась — барьер падает: ошеломление (−2 к кубам на 2 хода) и снятие всех положительных эффектов.
            let barrierBroke = false;
            let barrierMpSpent = 0;
            if (finalDmg > 0) {
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
                chores.push(db.collection('characters').doc(targetUid).update({ vitals }));
                if (dmg) logExtra += `, урон ${finalDmg}${resist ? ` (резист ${resist}%, было бы ${dmg})` : ''}${sunNote}${berserkNote}`;
            }
            if (defNotes.length) logExtra += '. ' + defNotes.join('. ');
            // Автоматический бросок на заражение болезнью — раньше этого не было вообще, болезни
            // существовали только как текст в описании монстров. Срабатывает только при физическом
            // попадании (dmgType==='physical') от переносчика (carrierOfDisease задан).
            if (dmg && dmgType === 'physical' && pendingGmAttack.carrierOfDisease && pendingGmAttack.diseaseChance > 0) {
                const roll = Math.floor(Math.random() * 100) + 1;
                const resist = (data.resistances && data.resistances.disease) || 0;
                const effectiveChance = Math.max(0, pendingGmAttack.diseaseChance * (1 - resist / 100));
                if (roll <= effectiveChance) {
                    const diseaseName = pendingGmAttack.carrierOfDisease;
                    const diseaseInfo = DISEASE_DEFS[diseaseName] || { desc: 'Эффект — на усмотрение мастера.' };
                    const patch2 = {};
                    patch2['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                        id: 'dis-' + Date.now() + Math.random().toString(36).slice(2, 8),
                        name: pendingGmAttack.enemyName, effectName: 'Болезнь: ' + diseaseName, description: diseaseInfo.desc, turnsRemaining: Infinity
                    });
                    chores.push(db.collection('sessions').doc(currentCode).update(patch2));
                    logExtra += `. 🚨 Заражение! ${targetName} подхватил(а) болезнь «${diseaseName}» (бросок ${roll} ≤ ${effectiveChance.toFixed(0)}%)`;
                } else {
                    logExtra += `. Проверка на заражение не прошла (${roll} > ${effectiveChance.toFixed(0)}%)`;
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
                    rollPenalty: statusDef.rollPenalty || 0, fromGm: true
                });
                chores.push(db.collection('sessions').doc(currentCode).update(patch));
                logExtra += `, наложен статус «${statusDef.name}» (${statusDef.turns} х.)`;
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
        lastGeneratedLoot = { tier: tier.label, title: `${theme.label}, ${tier.label.toLowerCase()}`, gold, items };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    }

    // Общий вывод результата для обоих типов сундуков.
    function renderLootHtml(loot) {
        let html = `<strong>${escapeHtml(loot.title || loot.tier)} сундук:</strong><br>`;
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
        'Маски жрецов', 'Магические одеяния'
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

        lastGeneratedLoot = { tier: tier.label, title: tier.label, gold, items };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    };

    window.grantGeneratedLoot = function () {
        if (!lastGeneratedLoot) { alert('Сначала сгенерируй лут.'); return; }
        const targetUid = el('loot-gen-target-player').value;
        if (!targetUid) { alert('Выбери игрока.'); return; }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            lastGeneratedLoot.items.forEach(it => {
                const itemId = it.id || it.name;
                const existing = inv.find(x => x.itemId === itemId);
                const extra = {};
                if (it.slot) extra.slot = it.slot;
                if (typeof it.armor === 'number') extra.armorValue = it.armor;
                if (typeof it.dmg === 'number') extra.weaponDmg = it.dmg;
                if (typeof it.price === 'number') extra.price = it.price;
                const q = it.qty || 1; // валюта сундука (Дракры/Думаки) приходит стопкой, не по одной штуке
                if (existing) { existing.count += q; Object.assign(existing, extra); }
                else inv.push(Object.assign({ itemId, name: it.name, count: q, weight: it.weight || 0, category: it.category || '', effect: it.effect || '' }, extra));
            });
            const newGold = (parseInt(data.gold) || 0) + lastGeneratedLoot.gold;
            return db.collection('characters').doc(targetUid).update({ inventory: inv, gold: newGold });
        }).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            alert(`Лут (${lastGeneratedLoot.title || lastGeneratedLoot.tier} сундук) выдан игроку ${pname}.`);
            gmPostLogEntryText(`📦 ${pname} нашёл(а) ${(lastGeneratedLoot.title || lastGeneratedLoot.tier).toLowerCase()} сундук: ${lastGeneratedLoot.gold ? lastGeneratedLoot.gold + ' золота + ' : ''}${lastGeneratedLoot.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}.`);
            lastGeneratedLoot = null;
            el('loot-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function populateLootTargetSelect() {
        const select = el('loot-gen-target-player');
        if (!select) return;
        const uids = Object.keys(lastData.participants || {});
        const prev = select.value;
        select.innerHTML = uids.length
            ? uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('')
            : '<option value="">Нет игроков</option>';
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
        { minLevel: 1, weaponMat: /^(Меховые|Сыромятные|Железн)/i, armorMat: /^(Меховые|Сыромятные|Железн)/i, bows: ['Длинный лук', 'Охотничий лук'] },
        { minLevel: 8, weaponMat: /^Стальн/i, armorMat: /^Стальн/i, bows: ['Имперский лук', 'Древний нордский лук'] },
        { minLevel: 16, weaponMat: /^(Орочь|Орочий|Двемерск)/i, armorMat: /^(Орочь|Двемерск)/i, bows: ['Орочий лук', 'Лук Изгоев'] },
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
        const weapons = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).filter(w =>
            !/лук/i.test(w.name) && tiers.weaponMats.some(re => re.test(w.name)));
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
        const trinketPool = (gmAllItems || []).filter(i => i.category === 'Ювелирное изделие' || (i.slot === 'ring' || i.slot === 'amulet'));
        const trinket = hasTrinket && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;
        const foodPool = (gmAllItems || []).filter(i => i.category === 'Готовые продукты' || i.category === 'Сырые продукты');
        const foodItem = foodPool.length ? foodPool[Math.floor(Math.random() * foodPool.length)] : null;
        const hasLockpick = Math.random() < 0.5;

        // Лут: часть брони НЕ выпадает при обыске (потрёпана в бою) — у каждого предмета
        // (включая оружие) свой отдельный шанс попасть в добычу, не 100%.
        const lootItems = [];
        if (Math.random() < 0.8) {
            if (isRanged) lootItems.push({ name: bow.name, price: bow.price || 0, weight: bow.weight, dmg: weaponDmg, slot: 'ranged', category: 'Оружие (с трупа)' });
            else lootItems.push({ name: weapon.name, price: weapon.price || 0, weight: weapon.weight, dmg: weaponDmg, slot: weapon.slot, category: 'Оружие (с трупа)' });
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
        const schools = ['destr', 'restor', 'conjur']; // разрушение/восстановление/колдовство — боевые школы
        const pool = [];
        schools.forEach(school => {
            for (let r = 1; r <= maxRank; r++) {
                (window.spellsData[school] && window.spellsData[school][r] || []).forEach(s => pool.push(Object.assign({ school }, s)));
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
            const dmg = (typeof parseSpellDamageFromDesc === 'function') ? parseSpellDamageFromDesc(s.desc) : null;
            return { name: s.name, dmg: dmg ? Math.round(dmg * levelDmgMult) + intMod : 0, cost: s.cost || 20, school: s.school };
        });

        const robePool = getBanditMageRobePool(level);
        const robe = robePool.length ? robePool[Math.floor(Math.random() * robePool.length)] : null;

        const hp = con * 10 + Math.round(randInt(0, 15) * (1 + (level - 1) * 0.06));
        const mp = Math.round(randInt(80, 140) * (1 + (level - 1) * 0.08)); // маги — мана в разы больше воинов
        const gold = Math.round(randInt(15, 100) * (1 + (level - 1) * 0.1));

        const trinketPool = (gmAllItems || []).filter(i => i.category === 'Ювелирное изделие' && typeof i.price === 'number');
        const trinket = Math.random() < 0.4 && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;

        const lootItems = [];
        if (robe && Math.random() < 0.7) lootItems.push({ name: robe.name, price: robe.price || 0, weight: robe.weight || 2, slot: 'body', category: 'Магическое одеяние (с трупа)', effect: robe.effect || '' });
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

    window.addGeneratedBanditToCombat = function () {
        if (!lastGeneratedBandit) { alert('Сначала сгенерируй бандита.'); return; }
        const b = lastGeneratedBandit;
        const enemies = (lastData.enemies || []).slice();
        // Физический резист от брони: 10 очков брони = 1% (та же формула, что у игроков).
        const physResist = Math.min(85, Math.round((b.armor || 0) / 10));
        enemies.push({
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            str: b.str, dex: b.dex, con: b.con,
            weaponDmg: b.weaponDmg, weaponNote: b.weaponNote, isRanged: !!b.isRanged, resist: { physical: physResist }, spells: b.spells || [],
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        });
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            lastGeneratedBandit = null;
            el('bandit-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.addGeneratedMageBanditToCombat = function () {
        if (!lastGeneratedMageBandit) { alert('Сначала сгенерируй мага-бандита.'); return; }
        const b = lastGeneratedMageBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push({
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            con: b.con, int: b.int, wis: b.wis,
            weaponDmg: 0, weaponNote: b.weaponNote, resist: { physical: 0 }, spells: b.spells || [],
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        });
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            lastGeneratedMageBandit = null;
            el('bandit-mage-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.lootCorpse = function (enemyId) {
        const enemy = (lastData.enemies || []).find(e => e.id === enemyId);
        if (!enemy || !enemy.corpseLoot) { alert('У этого противника нет привязанного лута.'); return; }
        const targetUid = el('loot-gen-target-player').value;
        if (!targetUid) { alert('Выбери игрока (внизу, в генераторе лута) — ему уйдёт добыча.'); return; }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            (enemy.corpseLoot.items || []).forEach(it => {
                const itemId = it.name;
                const existing = inv.find(x => x.itemId === itemId);
                const extra = {};
                if (it.slot) extra.slot = it.slot;
                if (typeof it.armor === 'number') extra.armorValue = it.armor;
                if (typeof it.dmg === 'number') extra.weaponDmg = it.dmg;
                if (typeof it.price === 'number') extra.price = it.price;
                if (existing) { existing.count += 1; Object.assign(existing, extra); }
                else inv.push(Object.assign({ itemId, name: it.name, count: 1, weight: it.weight || 0, category: it.category || '', effect: '' }, extra));
            });
            const newGold = (parseInt(data.gold) || 0) + (enemy.corpseLoot.gold || 0);
            return db.collection('characters').doc(targetUid).update({ inventory: inv, gold: newGold });
        }).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? Object.assign({}, e, { corpseLoot: null, looted: true }) : e);
            return db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
                alert(`Добыча с трупа «${enemy.name}» выдана игроку ${pname}.`);
                gmPostLogEntryText(`💀 ${pname} обыскал(а) труп «${enemy.name}» и забрал(а) добычу.`);
            });
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

    window.rollWeatherForRegion = function () {
        const region = el('weather-region-select').value;
        const season = el('weather-season-select').value;
        const basePool = REGION_WEATHER_POOL[region] || ['clear'];
        const biasTypes = (SEASON_WEATHER_BIAS[season] || []).filter(w => basePool.includes(w));
        // Сезонно уместная погода весит втрое больше, но пул региона остаётся границей
        // возможного — в лесу зимой не будет "clear-only подземелья", а метели не будет в лесу.
        const pool = basePool.concat(biasTypes, biasTypes);
        pendingWeatherKey = pool[Math.floor(Math.random() * pool.length)];
        el('weather-gm-result').innerHTML = `Выпало: <strong>${WEATHER_LABELS[pendingWeatherKey]}</strong> — жми «Применить», чтобы сообщить игрокам.`;
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
        db.collection('sessions').doc(currentCode).update({ activeHoliday: { title: h.title, discount: h.discount || null } }).then(() => {
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
            const data1 = d1.exists ? d1.data() : {};
            const data2 = d2.exists ? d2.data() : {};
            const dmg1 = parseInt(data1.wepMDmg) || 0;
            const dmg2 = parseInt(data2.wepMDmg) || 0;
            const totalDmg = dmg1 + dmg2;
            const roll = Math.floor(Math.random() * 20) + 1;
            const name1 = (lastData.participants[p1] || {}).name || p1;
            const name2 = (lastData.participants[p2] || {}).name || p2;
            const target = (lastData.enemies || []).find(e => e.id === targetId);
            pendingCoopAttack = { targetId, dmg: totalDmg, name1, name2, targetName: target ? target.name : '?' };
            resultEl.innerHTML = `<strong>${escapeHtml(name1)} + ${escapeHtml(name2)}</strong> атакуют «${escapeHtml(target ? target.name : '?')}» одновременно.<br>` +
                `Бросок: 1d20 = <strong>${roll}</strong><br>Суммарный урон при попадании: <span style="color:#e74c3c; font-weight:bold;">${totalDmg}</span> (${dmg1}+${dmg2})<br>` +
                `<button class="btn-success" style="width:100%; margin-top:6px;" onclick="applyCoopAttackDamage()">✅ Применить урон</button>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    let pendingCoopAttack = null;

    window.applyCoopAttackDamage = function () {
        if (!pendingCoopAttack) return;
        const { targetId, dmg, name1, name2, targetName } = pendingCoopAttack;
        // Мастер сам пишет в сессию напрямую через свой db — моста к cloud.js не нужно
        // (gm.html вообще его не подключает).
        const enemies = (lastData.enemies || []).slice();
        const idx = enemies.findIndex(e => e.id === targetId);
        if (idx === -1) { alert('Цель уже не найдена.'); return; }
        const newHp = Math.max(0, (enemies[idx].curHp || 0) - dmg);
        enemies[idx] = Object.assign({}, enemies[idx], { curHp: newHp });
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            gmPostLogEntryText(`⚔️ ${name1} + ${name2} совместно бьют «${targetName}»: −${dmg} урона.`);
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
    };

    document.addEventListener('DOMContentLoaded', initGmSectionAccordions);
    if (document.readyState !== 'loading') initGmSectionAccordions();

})();
