// ============================================================================
// CLOUD.JS — облачная синхронизация листа персонажа + участие в сессии мастера.
// Подключается ПОСЛЕ основного inline-скрипта index.html, поэтому может
// свободно использовать window.applyCharacterData, window.saveLocalStorage,
// window.updateAll и весь DOM страницы.
// Если firebase-config.js не настроен (window.FIREBASE_CONFIGURED === false),
// весь блок ниже просто не активируется — сайт работает как раньше, локально.
// ============================================================================

(function () {
    let auth = null;
    let db = null;
    let currentUser = null;
    let currentSessionCode = null;
    let lastTurnBumpAt = 0; // троттлинг bumpSessionTurnCounter — см. ниже
    let unsubSession = null;
    let unsubWatchedCharacter = null;
    let saveTimer = null;
    let cloudDataReady = false; // true только после того, как персонаж загружен из облака хотя бы раз —
                                 // защищает от перезаписи реальных данных дефолтными при входе с нового устройства.
    const SESSION_KEY = 'ttrpg_session_code';

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
            // cloudDataReady становится true только ПОСЛЕ первой загрузки персонажа из облака —
            // до этого saveCharacter молча ничего не сохраняет (её собственная защита: if
            // (!currentUser || !db || !cloudDataReady) return;). Раньше статус-бар сразу писал
            // "Вошёл как..." в момент входа, не дожидаясь этого — игрок мог начать править лист
            // в окне, когда правки никуда не улетали бы.
            info.textContent = cloudDataReady ? ('☁ Вошёл как ' + currentUser.email) : '⏳ Синхронизация...';
            btn.style.display = 'inline-block';
        } else {
            info.textContent = '⚠ Офлайн-режим (данные только в этом браузере)';
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

    // ---------- Авторизация ----------

    // "Запомнить меня" — раньше нигде не задавалось явно, персистентность входа зависела от
    // дефолтного поведения Firebase (обычно и так LOCAL, но чекбокс даёт явный контроль и чинит
    // редкие случаи, когда дефолт не срабатывает — некоторые мобильные браузеры/приватные вкладки).
    function applyAuthPersistence() {
        const remember = el('auth-remember-me') ? el('auth-remember-me').checked : true;
        const mode = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
        return auth.setPersistence(mode);
    }

    window.cloudRegister = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        const email = el('auth-email').value.trim();
        const pass = el('auth-password').value;
        showAuthError('');
        applyAuthPersistence().then(() => auth.createUserWithEmailAndPassword(email, pass)).catch(e => showAuthError(translateAuthError(e)));
    };

    window.cloudLogin = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        const email = el('auth-email').value.trim();
        const pass = el('auth-password').value;
        showAuthError('');
        applyAuthPersistence().then(() => auth.signInWithEmailAndPassword(email, pass)).catch(e => showAuthError(translateAuthError(e)));
    };

    window.cloudLoginGoogle = function () {
        if (!window.FIREBASE_CONFIGURED) { showAuthError('Firebase ещё не настроен — см. README-FIREBASE.md'); return; }
        showAuthError('');
        const provider = new firebase.auth.GoogleAuthProvider();
        applyAuthPersistence().then(() => auth.signInWithPopup(provider)).catch(e => {
            if (e.code === 'auth/popup-closed-by-user') return;
            showAuthError(translateAuthError(e));
        });
    };

    window.cloudContinueOffline = function () {
        showOverlay(false);
    };

    window.cloudLogout = function () {
        if (currentSessionCode) window.leaveSession();
        if (auth) auth.signOut();
    };

    function initAuth() {
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(user => {
            currentUser = user;
            cloudDataReady = false;
            updateStatusBar();
            if (user) {
                showOverlay(false);
                loadCharacterFromCloud(user.uid);
                const savedCode = localStorage.getItem(SESSION_KEY);
                if (savedCode) joinSessionInternal(savedCode, true);
            } else {
                if (unsubSession) { unsubSession(); unsubSession = null; }
                currentSessionCode = null;
            }
        });
    }

    let unsubSelfGmFields = null;

    // Живой листенер ТОЛЬКО на поля, которые правит мастер (гильдии/сверхъестественное/
    // репутация) — не на весь документ, чтобы не перезаписывать активные локальные правки
    // игрока (хп/инвентарь/статы и т.д.) чужим снапшотом. Игрок должен увидеть, что мастер
    // включил ему ликантропию или поднял прогресс гильдии, СРАЗУ, без перезагрузки страницы.
    // Вынесено отдельно от loadCharacterFromCloud — та делает ещё и ПОЛНЫЙ restore (applyCharacterData)
    // при первой загрузке, а для переподписки после сворачивания вкладки (задача 15, см. ниже)
    // нужна ТОЛЬКО сама подписка, без повторного restore — иначе затёрло бы несохранённые
    // локальные правки игрока тем, что было в облаке на момент сворачивания вкладки.
    function subscribeToOwnGmFields(uid) {
        if (unsubSelfGmFields) { unsubSelfGmFields(); unsubSelfGmFields = null; }
        unsubSelfGmFields = db.collection('characters').doc(uid).onSnapshot(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            if (window.applyGmControlledFields) window.applyGmControlledFields(data);
        }, e => console.error('Ошибка подписки на поля мастера:', e));
    }

    function loadCharacterFromCloud(uid) {
        db.collection('characters').doc(uid).get().then(doc => {
            if (doc.exists && window.applyCharacterData) {
                window.applyCharacterData(doc.data());
                if (window.updateAll) window.updateAll();
            }
            cloudDataReady = true;
            updateStatusBar();
        }).catch(e => {
            console.error('Ошибка загрузки персонажа из облака:', e);
            // Даже при ошибке загрузки разрешаем сохранение — иначе персонаж
            // навсегда останется нередактируемым при сбое сети.
            cloudDataReady = true;
            updateStatusBar();
        });
        subscribeToOwnGmFields(uid);
    }

    // ---------- Сохранение персонажа (вызывается из saveLocalStorage) ----------

    let lastSessionData = null;

    function stripUndefinedForCloud(v) {
        if (v === undefined) return undefined;
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(x => { const c = stripUndefinedForCloud(x); return c === undefined ? null : c; });
        if (typeof v.toDate === 'function' || v instanceof Date) return v; // Timestamp/Date не трогаем
        const out = {};
        Object.keys(v).forEach(k => { const c = stripUndefinedForCloud(v[k]); if (c !== undefined) out[k] = c; });
        return out;
    }

    window.CloudSync = {
        // immediate:true — обходит обычную задержку 800мс и пишет сразу. Нужно для действий,
        // после которых мастер может СРАЗУ ЖЕ что-то записать поверх (обыск трупа игроком,
        // например) — раньше стандартная задержка давала окно гонки: мастер успевал прочитать
        // ещё-старые данные из Firestore и своей записью (или наоборот, задержанной записью
        // игрока чуть позже) стирал только что залутанное золото/предметы.
        saveCharacter: function (data, immediate) {
            if (!currentUser || !db || !cloudDataReady) return;
            const doSave = () => {
                // Страховка: Firestore целиком отвергает запись, если где-то внутри есть undefined
                // («Unsupported field value: undefined»). Убираем такие поля (в массивах — null).
                data = stripUndefinedForCloud(data);
                db.collection('characters').doc(currentUser.uid).set(data, { merge: true })
                    .catch(e => console.error('Ошибка сохранения в облако:', e));

                if (currentSessionCode) {
                    const vitals = data.vitals || [0, 0, 0, 0];
                    const patch = {};
                    patch['participants.' + currentUser.uid + '.name'] = data.name || 'Без имени';
                    patch['participants.' + currentUser.uid + '.curHp'] = Number(vitals[0]) || 0;
                    patch['participants.' + currentUser.uid + '.curMp'] = Number(vitals[1]) || 0;
                    patch['participants.' + currentUser.uid + '.maxHp'] = Number(vitals[2]) || 0;
                    patch['participants.' + currentUser.uid + '.maxMp'] = Number(vitals[3]) || 0;
                    // Свободные жизни и состояние «пал» — для панели «Отряд» у мастера
                    patch['participants.' + currentUser.uid + '.lives'] = Number(data.lives) || 0;
                    patch['participants.' + currentUser.uid + '.fallen'] = !!(data.deathState && data.deathState.fallen);
                    // Задача "порядок ходов": лёгкий список имён призванных/поднятых существ игрока,
                    // чтобы мастер видел их и мог включить в порядок ходов, не зная деталей.
                    const summons = Array.isArray(data.activeSummons) ? data.activeSummons.filter(s => s.category !== 'weapon') : [];
                    patch['participants.' + currentUser.uid + '.summonNames'] = summons.map(s => s.name).filter(Boolean);
                    // Задача "существа должны попадать в отряд" — раньше синхронизировались только
                    // имена (для порядка ходов), без ХП, поэтому мастер не видел их в панели "Отряд"
                    // с полосками жизни как у самих игроков. Оружие (category:'weapon') не входит —
                    // это экипируемый предмет, не боевой юнит сам по себе.
                    patch['participants.' + currentUser.uid + '.summons'] = summons.map(s => ({
                        id: s.id, name: s.name, curHp: s.curHp || 0, maxHp: s.maxHp || 1, dmgType: s.dmgType || ''
                    }));
                    db.collection('sessions').doc(currentSessionCode).update(patch)
                        .catch(e => console.error('Ошибка синхронизации с сессией:', e));
                }
            };
            clearTimeout(saveTimer);
            if (immediate) doSave();
            else saveTimer = setTimeout(doSave, 800);
        },

        // "Сброс персонажа" раньше чистил только localStorage — Firebase-авторизация переживает
        // перезагрузку страницы, и старые данные из облака сразу подтягивались обратно поверх
        // очищенного localStorage, отсюда "персонажа по сути нельзя удалить". set() БЕЗ merge —
        // полная перезапись документа, а не долив полей поверх старых.
        resetCloudCharacter: function () {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            clearTimeout(saveTimer); // отменяем любое отложенное автосохранение старых данных
            return db.collection('characters').doc(currentUser.uid).set({ resetAt: Date.now() });
        },

        // Текущие данные активной сессии (враги/группа/инициатива/журнал), как последний раз
        // пришли из Firestore. null, если игрок не в сессии.
        getSessionData: function () {
            return lastSessionData;
        },

        // Списывает урон с конкретного противника в сессии и пишет запись в общий боевой журнал.
        // Возвращает Promise. isPlayerAction=true подписывает запись именем игрока, а не "Мастер".
        // dmgType (необязательно): 'physical'/'fire'/'frost'/'shock'/'poison'/'magic' — если у врага
        // есть resist[dmgType], урон уменьшается (или увеличивается, если там отрицательное число —
        // это уязвимость, как у тролля к огню).
        applyDamageToEnemy: function (enemyId, dmgAmount, authorName, logText, dmgType, penetrationPct) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const wasAlive = (enemies[idx].curHp || 0) > 0;
                let resist = dmgType && enemies[idx].resist ? (enemies[idx].resist[dmgType] || 0) : 0;
                // Пробитие брони/магической защиты (Боевые искусства/богиня Малакат/Азура) —
                // снижает эффективный резист цели именно для этого удара, не трогает сам объект врага.
                // Уязвимость (отрицательный резист) пробитием не «лечится».
                if (penetrationPct && resist > 0) resist = Math.max(0, resist - penetrationPct);
                // Статус-эффекты на враге с резистами/уязвимостями (яды и зелья: «Уязвимость к огню», «Увеличение получаемого физ.урона»...).
                // Для огня/холода/электричества/магии дополнительно действует общий «магический» резист.
                if (dmgType && Array.isArray(enemies[idx].statusEffects)) {
                    const magicTypes = ['fire', 'frost', 'shock', 'magic'];
                    enemies[idx].statusEffects.forEach(st => {
                        if (!st || !st.res) return;
                        resist += (st.res[dmgType] || 0);
                        if (magicTypes.indexOf(dmgType) !== -1 && dmgType !== 'magic') resist += (st.res.magic || 0);
                    });
                }
                const finalDmg = Math.max(0, Math.round(dmgAmount * (1 - resist / 100)));
                const newHp = Math.max(0, (enemies[idx].curHp || 0) - finalDmg);
                const patch = { curHp: newHp };
                // Штампуем момент смерти (номер общего счётчика ходов сессии) — труп поднимаемый
                // заклинанием только первые 5 ходов после этого.
                if (wasAlive && newHp <= 0) patch.diedAtTurn = data.sessionTurnCounter || 0;
                enemies[idx] = Object.assign({}, enemies[idx], patch);
                const update = { enemies: enemies };
                const finalLogText = (logText && resist) ? logText.replace(/урон (\d+)/, `урон ${finalDmg} (резист ${resist}%, было бы $1)`) : logText;
                if (finalLogText) {
                    update.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: finalLogText });
                }
                return ref.update(update).then(() => ({ newHp, enemyName: enemies[idx].name, finalDmg, resist, killed: wasAlive && newHp <= 0, enemy: enemies[idx] }));
            });
        },

        // Статус-эффекты на врагах (Страх/Успокоение/Ярость/Полиморф и т.п.) — раньше у объекта
        // врага вообще не было такого поля, эти заклинания были чистым текстом без последствий.
        // Тикаются вручную мастером (кнопка "Убрать" на статусе в списке боя) — не завязано на
        // автоматический тик ходов, чтобы не требовать точной синхронизации между игроком и мастером.
        applyStatusToEnemy: function (enemyId, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                let statuses = Array.isArray(enemies[idx].statusEffects) ? enemies[idx].statusEffects.slice() : [];
                if (extra && (typeof extra.dmgPct === 'number' || extra.unique)) statuses = statuses.filter(x => x.name !== statusName); // не складывается само с собой
                statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, extra || {}));
                enemies[idx] = Object.assign({}, enemies[idx], { statusEffects: statuses });
                const logText = `✨ ${authorName || 'Игрок'} накладывает на «${enemies[idx].name}»: ${statusName}${turns ? ` (${turns} х.)` : ''} — ${statusDesc}`;
                return ref.update({
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText })
                }).then(() => ({ enemyName: enemies[idx].name }));
            });
        },

        // Изгнание в Обливион («Изгнание/Высылка даэдра»): враг исчезает из боя целиком, без трупа и души.
        banishEnemy: function (enemyId, authorName, logText) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const name = enemies[idx].name;
                enemies.splice(idx, 1);
                return ref.update({
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText || `🌀 ${authorName || 'Игрок'} изгоняет «${name}» в Обливион.` })
                }).then(() => ({ enemyName: name }));
            });
        },

        // Статус на всех живых врагов, подходящих под предикат (Круг защиты: нежить до N уровня). predicate(enemy) → bool.
        applyStatusToEnemiesWhere: function (predicate, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const names = [];
                const enemies = (Array.isArray(data.enemies) ? data.enemies : []).map(e => {
                    if ((e.curHp || 0) <= 0 || !predicate(e)) return e;
                    names.push(e.name);
                    const statuses = (Array.isArray(e.statusEffects) ? e.statusEffects : []).filter(x => x.name !== statusName);
                    statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, extra || {}));
                    return Object.assign({}, e, { statusEffects: statuses });
                });
                if (!names.length) return { count: 0, names: [] };
                return ref.update({
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: `✨ ${authorName || 'Игрок'}: «${statusName}» накладывается на: ${names.join(', ')}${turns ? ` (${turns} х.)` : ''} — ${statusDesc}` })
                }).then(() => ({ count: names.length, names }));
            });
        },

        // Статус сразу на нескольких врагов: nameRegexSource — регулярное выражение по имени (напр. нежить); только живые.
        applyStatusToEnemies: function (nameRegexSource, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const re = new RegExp(nameRegexSource, 'i');
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const names = [];
                const enemies = (Array.isArray(data.enemies) ? data.enemies : []).map(e => {
                    if (!re.test(e.name || '') || (e.curHp || 0) <= 0) return e;
                    names.push(e.name);
                    const statuses = (Array.isArray(e.statusEffects) ? e.statusEffects : []).filter(x => x.name !== statusName);
                    statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, extra || {}));
                    return Object.assign({}, e, { statusEffects: statuses });
                });
                if (!names.length) return { count: 0, names: [] };
                return ref.update({
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: `✨ ${authorName || 'Игрок'}: «${statusName}» накладывается на: ${names.join(', ')} (${statusDesc}${turns ? ', ' + turns + ' х.' : ''})` })
                }).then(() => ({ count: names.length, names }));
            });
        },

        // Прямое изменение ХП/маны врага (лечение/урон от зелий и ядов, ручные правки). dHp/dMp — со знаком.
        modifyEnemyVitals: function (enemyId, dHp, dMp, authorName, logText) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const en = enemies[idx];
                const wasAlive = (en.curHp || 0) > 0;
                const newHp = Math.max(0, Math.min(en.maxHp || en.curHp || 0, (en.curHp || 0) + (dHp || 0)));
                const newMp = Math.max(0, Math.min(en.maxMp || en.curMp || 0, (en.curMp || 0) + (dMp || 0)));
                const patch = { curHp: newHp, curMp: newMp };
                if (wasAlive && newHp <= 0) patch.diedAtTurn = data.sessionTurnCounter || 0;
                enemies[idx] = Object.assign({}, en, patch);
                const update = { enemies: enemies };
                if (logText) update.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText });
                return ref.update(update).then(() => ({ enemyName: en.name, newHp, newMp, appliedHp: newHp - (en.curHp || 0), appliedMp: newMp - (en.curMp || 0) }));
            });
        },

        // Яд (или любое варево) на враге: мгновенные эффекты применяются сразу, длящиеся — статус-эффектами на враге
        // (регенерация/затяжной урон тикают у мастера по кнопке «следующий ход», резисты/уязвимости учитываются при уроне).
        // effects: [{ name, magnitude, duration, unit, kind? }]. Возвращает { enemyName, notes }.
        applyAlchemyToEnemy: function (enemyId, effects, sourceName, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const en = Object.assign({}, enemies[idx]);
                const wasAlive = (en.curHp || 0) > 0;
                const baseFx = window.alchemyBaseEffects || {};
                const poisonResist = (en.resist && en.resist.poison) || 0;
                const statuses = Array.isArray(en.statusEffects) ? en.statusEffects.slice() : [];
                const notes = [];
                (effects || []).forEach(e => {
                    if (!e || !e.name) return;
                    const info = baseFx[e.name] || {};
                    const kind = e.kind || info.kind || null;
                    const mag = (typeof e.magnitude === 'number') ? e.magnitude : null;
                    const dur = e.duration || info.dur || 1;
                    const text = (typeof window.describeAlchemyEffect === 'function')
                        ? window.describeAlchemyEffect({ name: e.name, magnitude: mag, duration: dur, unit: e.unit !== undefined ? e.unit : (info.unit || '') }) : e.name;
                    const add = function (extra) {
                        // Тот же эффект повторно — обновляем, а не складываем (как на игроке).
                        const i = statuses.findIndex(s => s.alchemyName === e.name);
                        const st = Object.assign({ id: 'al' + Date.now() + Math.random().toString(36).slice(2, 7), name: e.name, desc: text, turns: dur, alchemyName: e.name, source: sourceName || null }, extra || {});
                        if (i !== -1) statuses[i] = Object.assign({}, st, { id: statuses[i].id }); else statuses.push(st);
                        notes.push(text);
                    };
                    switch (kind) {
                        case 'dmg_hp': {
                            const d = Math.max(0, Math.round((mag || 0) * (1 - poisonResist / 100)));
                            en.curHp = Math.max(0, (en.curHp || 0) - d); notes.push(`−${d} хп${poisonResist ? ` (сопротивление яду ${poisonResist}%)` : ''}`); break;
                        }
                        case 'dmg_mp': en.curMp = Math.max(0, (en.curMp || 0) - (mag || 0)); notes.push(`−${mag || 0} маны`); break;
                        case 'heal_hp': en.curHp = Math.min(en.maxHp || en.curHp || 0, (en.curHp || 0) + (mag || 0)); notes.push(`+${mag || 0} хп`); break;
                        case 'heal_mp': en.curMp = Math.min(en.maxMp || en.curMp || 0, (en.curMp || 0) + (mag || 0)); notes.push(`+${mag || 0} маны`); break;
                        case 'dot_hp': add({ dotHp: mag || 0 }); break;
                        case 'dot_mp': add({ dotMp: mag || 0 }); break;
                        case 'regen_hp': add({ regenHp: mag || 0 }); break;
                        case 'regen_mp': add({ regenMp: mag || 0 }); break;
                        case 'dmg_dealt_down': add({ dmgFlat: -(mag || 0) }); break;
                        case 'dmg_pct': add({ dmgPct: mag || 0 }); break;
                        case 'dmg_taken_up': add({ res: { physical: -(mag || 0) } }); break;
                        case 'res_phys': add({ res: { physical: mag || 0 } }); break;
                        case 'res_magic': add({ res: { magic: mag || 0 } }); break;
                        case 'res_fire': add({ res: { fire: mag || 0 } }); break;
                        case 'res_frost': add({ res: { frost: mag || 0 } }); break;
                        case 'res_shock': add({ res: { shock: mag || 0 } }); break;
                        case 'res_poison': add({ res: { poison: mag || 0 } }); break;
                        case 'vuln_fire': add({ res: { fire: -(mag || 0) } }); break;
                        case 'vuln_frost': add({ res: { frost: -(mag || 0) } }); break;
                        case 'vuln_shock': add({ res: { shock: -(mag || 0) } }); break;
                        case 'vuln_poison': add({ res: { poison: -(mag || 0) } }); break;
                        case 'vuln_magic': add({ res: { magic: -(mag || 0) } }); break;
                        case 'slow': add({ speedMod: -(mag || 0) }); break;
                        case 'speed': add({ speedMod: mag || 0 }); break;
                        case 'cure_poison': {
                            const before = statuses.length;
                            for (let k = statuses.length - 1; k >= 0; k--) if (statuses[k].dotHp || statuses[k].dotMp) statuses.splice(k, 1);
                            notes.push(before !== statuses.length ? 'яды выведены' : 'ядов не было'); break;
                        }
                        default:
                            // Паралич, страх, бешенство, немота, обезоруживание, голод, болезнь, невидимость, усиления навыков и т.п. —
                            // статус-метка на враге; суть описана в тексте, остальное разыгрывает мастер.
                            add({});
                    }
                });
                if (wasAlive && (en.curHp || 0) <= 0) en.diedAtTurn = data.sessionTurnCounter || 0;
                en.statusEffects = statuses;
                enemies[idx] = en;
                const logText = `☠ ${authorName || 'Игрок'} отравляет «${en.name}» («${sourceName || 'яд'}»): ${notes.join('; ') || '—'}`;
                return ref.update({
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText })
                }).then(() => ({ enemyName: en.name, notes }));
            });
        },

        // Увеличивает общий счётчик ходов сессии на 1 — вызывается при "Следующий ход"/"Следующий
        // круг" у любого игрока. Нужен для окна "поднять труп можно только 5 ходов после смерти".
        // Троттлинг раз в 2 секунды — без него случайный спам по кнопке (100 кликов подряд = 100
        // отдельных FieldValue.increment() записей) мог бы выбить дневной лимит бесплатного
        // тарифа Firestore (20k записей/день) за один долгий бой группы из 5 человек.
        bumpSessionTurnCounter: function () {
            if (!currentSessionCode || !db) return Promise.resolve();
            const now = Date.now();
            if (now - lastTurnBumpAt < 2000) return Promise.resolve();
            lastTurnBumpAt = now;
            return db.collection('sessions').doc(currentSessionCode).update({
                sessionTurnCounter: firebase.firestore.FieldValue.increment(1)
            }).catch(e => console.error('Ошибка счётчика ходов сессии:', e));
        },

        // Задача C: игровой день, синхронизированный в сессию (календарь живёт только у игрока,
        // но мастеру нужно знать, сколько игровых дней прошло с последнего обновления
        // ассортимента торговца — "раз в неделю" не бывает без общего счётчика дней).
        bumpGameDayCounter: function () {
            if (!currentSessionCode || !db) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                gameDayCounter: firebase.firestore.FieldValue.increment(1)
            }).catch(e => console.error('Ошибка счётчика игровых дней:', e));
        },

        // Обыскивает труп самим игроком (раньше это умел делать только мастер) — забирает
        // добычу себе и помечает труп обысканным в сессии, чтобы никто не забрал её дважды.
        lootCorpseForSelf: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден.');
                const corpseLoot = enemies[idx].corpseLoot;
                if (!corpseLoot) throw new Error('Труп уже обыскан или добычи нет.');
                enemies[idx] = Object.assign({}, enemies[idx], { corpseLoot: null, looted: true });
                return ref.update({ enemies: enemies }).then(() => corpseLoot);
            });
        },

        // Задача K: +1 к прогрессу гильдии на СВОЁМ ЖЕ документе персонажа при выполнении квеста
        // этой гильдии. Атомарный инкремент (не read-then-write) — на своём документе игрок
        // может писать и без сессии.
        // Задача C: покупка у живого торговца — убирает купленный товар из ассортимента (он
        // штучный, не бесконечный) и добавляет цену к золоту торговца в сессии.
        buyFromMerchantStock: function (key, itemIdx, price) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const stocks = Object.assign({}, data.merchantStocks || {});
                const stock = stocks[key];
                if (!stock || !stock.items[itemIdx]) throw new Error('Товар уже не в наличии.');
                const items = stock.items.slice();
                // Покупка забирает ОДНУ штуку — раньше из стопки «есть: 5» исчезала вся позиция целиком.
                if ((items[itemIdx].qty || 1) > 1) items[itemIdx] = Object.assign({}, items[itemIdx], { qty: items[itemIdx].qty - 1 });
                else items.splice(itemIdx, 1);
                stocks[key] = Object.assign({}, stock, { items: items, gold: (stock.gold || 0) + (price || 0) });
                return ref.update({ merchantStocks: stocks });
            });
        },

        // Продажа ЖИВОМУ торговцу: вещь попадает в его общий ассортимент (её можно сразу выкупить),
        // золото торговца уменьшается на сумму сделки; не хватает золота — сделка отклоняется.
        sellToMerchantStock: function (key, entry, qty, total) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const stocks = Object.assign({}, data.merchantStocks || {});
                const stock = stocks[key];
                if (!stock) throw new Error('Торговец уже уехал — обнови список.');
                if ((stock.gold || 0) < total) throw new Error('У торговца только ' + (stock.gold || 0) + ' золота — он не может столько заплатить.');
                const items = (stock.items || []).slice();
                const sig = entry.sig || '';
                const idx = items.findIndex(i => i.name === entry.name && (i.sig || '') === sig && i.price === entry.price);
                if (idx >= 0) items[idx] = Object.assign({}, items[idx], { qty: (items[idx].qty || 1) + qty });
                else items.push(Object.assign({}, entry, { qty: qty }));
                stocks[key] = Object.assign({}, stock, { items: items, gold: (stock.gold || 0) - total });
                return ref.update({ merchantStocks: stripUndefinedForCloud(stocks) });
            });
        },

        // Задача I.1: игрок пишет свой результат группового броска — прямо в сессию, чтобы
        // мастер видел в реальном времени. Атомарный set через dot-notation поля.
        // Задача I: текущий uid игрока — нужен, чтобы понять "это мой результат/бафф" в
        // групповых проверках и помощи союзнику.
        getCurrentUid: function () {
            return currentUser ? currentUser.uid : null;
        },

        // Живой листенер на документ персонажа — используется мастером в панелях "Инвентарь",
        // "Гильдии", "Сверхъестественное" и т.п., чтобы изменения игрока (свои же правки на его
        // листе) отражались у мастера СРАЗУ, без повторного выбора игрока из списка или
        // перезагрузки страницы мастера. Раньше эти панели читали документ один раз через .get().
        // Подписка всего одна одновременно — переключение на другого игрока автоматически снимает
        // предыдущую подписку.
        watchCharacter: function (uid, callback) {
            if (unsubWatchedCharacter) { unsubWatchedCharacter(); unsubWatchedCharacter = null; }
            if (!uid || !db) return;
            unsubWatchedCharacter = db.collection('characters').doc(uid).onSnapshot(doc => {
                callback(doc.exists ? doc.data() : {});
            }, e => {
                console.error('Ошибка подписки на персонажа:', e);
                callback(null); // сигнал колбэку показать ошибку на экране, а не молчать
            });
        },

        unwatchCharacter: function () {
            if (unsubWatchedCharacter) { unsubWatchedCharacter(); unsubWatchedCharacter = null; }
        },

        submitGroupCheckResult: function (uid, roll, mod, total) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const patch = {};
            patch['groupCheck.results.' + uid] = { roll, mod, total };
            return db.collection('sessions').doc(currentSessionCode).update(patch);
        },

        // Задача I.3: "Помочь союзнику" — пишет +1 бафф на следующий бросок цели в общий пул
        // sessions/{code}.buffs. Цель сама снимает и обнуляет бафф при следующем своём броске.
        helpAlly: function (targetUid, fromName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const patch = {};
            patch['buffs.' + targetUid] = { value: 1, fromName: fromName, grantedAt: Date.now() };
            return db.collection('sessions').doc(currentSessionCode).update(patch);
        },

        // Снимает (обнуляет) бафф помощи после того, как игрок его использовал в своём броске.
        clearHelpBuff: function (uid) {
            if (!currentSessionCode || !db) return Promise.resolve();
            const patch = {};
            patch['buffs.' + uid] = firebase.firestore.FieldValue.delete();
            return db.collection('sessions').doc(currentSessionCode).update(patch).catch(() => {});
        },

        incrementGuildProgress: function (guildName) {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            const patch = {};
            patch['guildsData.' + guildName + '.orders'] = firebase.firestore.FieldValue.increment(1);
            return db.collection('characters').doc(currentUser.uid).set(patch, { merge: true });
        },

        // Сдача артефакта в музей коллегии бардов — +1 легендарная песня (orders), +1 к
        // отдельному счётчику артефактов, +800 золота. Всё через FieldValue.increment (та же
        // защита от гонки с debounced-автосохранением, что и у обычного золота/заказов — не
        // читает "старое" значение вообще, что бы игрок ни делал параллельно на своём листе).
        donateBardArtifact: function () {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            const patch = {};
            patch['guildsData.Коллегия бардов.orders'] = firebase.firestore.FieldValue.increment(1);
            patch['guildsData.Коллегия бардов.artifacts'] = firebase.firestore.FieldValue.increment(1);
            patch['gold'] = firebase.firestore.FieldValue.increment(800);
            return db.collection('characters').doc(currentUser.uid).set(patch, { merge: true });
        },

        // Задача K: читает одно поле СВОЕГО ЖЕ документа персонажа (например guildsData) —
        // нужно игроку, чтобы видеть свой прогресс гильдий, который правит мастер.
        getOwnCharacterField: function (fieldName) {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            return db.collection('characters').doc(currentUser.uid).get().then(doc => {
                const data = doc.exists ? doc.data() : {};
                return data[fieldName];
            });
        },

        // Задача L: игрок сам пишет своё же supernaturalState (превращение, подкормка,
        // дневной тик) — тот же документ, что правит и мастер, merge не затирает остальное.
        saveOwnSupernaturalState: function (state) {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            return db.collection('characters').doc(currentUser.uid).set({ supernaturalState: state }, { merge: true });
        },

        // Пишет произвольную запись в общий боевой журнал сессии от имени игрока.
        postCombatLog: function (text, authorName) {
            if (!currentSessionCode || !db || !text) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: text })
            });
        },

        // Шёпот мастеру — отдельное поле whispers в сессии, НЕ смешивается с общим боевым
        // журналом (combatLog, который рендерится у ВСЕХ игроков). Важная оговорка: это
        // интерфейсное разделение, не криптографическая приватность — весь документ сессии
        // технически читаем любым участником (как и остальные данные сессии, см. firestore.rules
        // "allow read: if request.auth != null" для закрытой группы друзей), просто обычный
        // интерфейс игрока эти записи не показывает вообще, только интерфейс мастера.
        // Состояние похода/лагеря — общее на сессию (не per-player), т.к. отряд разбивает один
        // лагерь на всех, не каждый себе отдельно.
        setCampState: function (state) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            return db.collection('sessions').doc(currentSessionCode).update({ campState: state });
        },

        sendWhisperToGm: function (text, authorName) {
            if (!currentSessionCode || !db || !text) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                whispers: firebase.firestore.FieldValue.arrayUnion({
                    id: 'wh-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    ts: Date.now(), author: authorName || 'Игрок', text: text,
                    fromUid: currentUser ? currentUser.uid : null // для ответа мастера; null, а не undefined — Firestore отвергает undefined
                })
            });
        },

        // Помечает труп в сессии как уже поднятый заклинанием — чтобы его нельзя было
        // поднять второй раз, и чтобы у мастера это тоже было видно.
        markCorpseRaised: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return;
                enemies[idx] = Object.assign({}, enemies[idx], { raised: true });
                return ref.update({ enemies: enemies });
            });
        },

        // «Трансмутация смерти»: труп превращается в пепел — обыскать и поднять нельзя. Резолвится true, если превратили мы.
        turnCorpseToAsh: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.resolve(true);
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) return true;
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return true;
                if (enemies[idx].ashes) return false;
                enemies[idx] = Object.assign({}, enemies[idx], { ashes: true, corpseLoot: null, looted: true, isRaisable: false });
                return ref.update({ enemies: enemies }).then(() => true);
            });
        },

        // Помечает труп как «душа уже захвачена» (захват души — один раз на существо). Резолвится
        // true, если метку поставили мы, и false, если душу уже забрал кто-то другой.
        markSoulTaken: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.resolve(true);
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) return true;
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return true;
                if (enemies[idx].soulTaken) return false;
                enemies[idx] = Object.assign({}, enemies[idx], { soulTaken: true });
                return ref.update({ enemies: enemies }).then(() => true);
            });
        },

        // Флаг «игрок в городе»: хранится в участнике сессии, чтобы его могли менять и сам игрок, и мастер.
        setMyInTown: function (flag) {
            if (!currentSessionCode || !db || !currentUser) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({ ['participants.' + currentUser.uid + '.inTown']: !!flag });
        },

        // Отправляет баф/лечение/статус-эффект другому игроку той же сессии (например, союзнику
        // при касте баф-заклинания). Идёт через ту же очередь pendingStatusEffects, что и
        // статус-эффекты от НПС-атак мастера — цель подхватывает её сама через уже существующий
        // листенер сессии (applyIncomingStatusEffects в index.html), без перезагрузки страницы.
        pushEffectToPlayer: function (targetUid, effectPayload) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const patch = {};
            patch['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(effectPayload);
            return db.collection('sessions').doc(currentSessionCode).update(patch);
        },

        // ===== Обмен между игроками (через сессию, с подтверждением получателя) =====
        // Раньше передача писала прямо в документ персонажа получателя, но его лист не слушает собственный
        // документ и при ближайшем автосохранении перезаписывал инвентарь — переданное исчезало. Теперь предложение
        // хранится в sessions/{код}.trades.{id}; предметы отправителя лежат в нём (залог), пока получатель не ответит.
        isDataReady: function () { return !!cloudDataReady; },
        createTrade: function (id, trade) {
            if (!db || !currentSessionCode) return Promise.reject(new Error('Нет активной сессии.'));
            return db.collection('sessions').doc(currentSessionCode).update({ ['trades.' + id]: stripUndefinedForCloud(trade) });
        },
        // Меняет статус, только если он сейчас один из fromStatuses (транзакция — чтобы «принято» и «отменено» не столкнулись).
        respondTrade: function (id, fromStatuses, newStatus) {
            if (!db || !currentSessionCode) return Promise.reject(new Error('Нет активной сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                const t = ((doc.data() || {}).trades || {})[id];
                if (!t) throw new Error('Это предложение уже недоступно.');
                if (fromStatuses.indexOf(t.status) < 0) throw new Error('Предложение уже закрыто (' + t.status + ').');
                tx.update(ref, { ['trades.' + id + '.status']: newStatus });
                return t;
            }));
        },
        flagTrade: function (id, field) {
            if (!db || !currentSessionCode) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({ ['trades.' + id + '.' + field]: true });
        },
        deleteTrade: function (id) {
            if (!db || !currentSessionCode) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({ ['trades.' + id]: firebase.firestore.FieldValue.delete() });
        }
    };

    // ---------- Сессии ----------

    window.joinSession = function () {
        const code = (el('session-code-input').value || '').trim().toUpperCase();
        const errEl = el('session-join-error');
        errEl.style.display = 'none';
        if (!code) return;
        if (!currentUser) {
            errEl.textContent = 'Нужно войти в аккаунт, чтобы присоединиться к сессии.';
            errEl.style.display = 'block';
            return;
        }
        joinSessionInternal(code, false);
    };

    function joinSessionInternal(code, silent) {
        db.collection('sessions').doc(code).get().then(doc => {
            if (!doc.exists || doc.data().status !== 'active') {
                if (!silent) {
                    const errEl = el('session-join-error');
                    errEl.textContent = 'Сессия с таким кодом не найдена или закрыта.';
                    errEl.style.display = 'block';
                }
                localStorage.removeItem(SESSION_KEY);
                return;
            }
            currentSessionCode = code;
            localStorage.setItem(SESSION_KEY, code);

            // Берём текущие показатели прямо из листа персонажа, чтобы не мигать нулями
            const curHp = Number((el('cur-hp') || {}).value) || 0;
            const curMp = Number((el('cur-mp') || {}).value) || 0;
            const maxHp = Number((el('max-hp') || {}).value) || 0;
            const maxMp = Number((el('max-mp') || {}).value) || 0;
            const name = (el('char-name') || {}).value || 'Без имени';

            // Предупреждение (не блокировка) о совпадении имени с ДРУГИМ игроком — иначе в
            // боевом журнале не разобрать, кто есть кто ("два Довакина"). Не блокируем вход, т.к.
            // это может быть просто переподключение того же игрока после сбоя — сверяем по uid,
            // не по факту самого имени у себя же.
            const existingParticipants = doc.data().participants || {};
            const nameTaken = Object.keys(existingParticipants).some(uid =>
                uid !== currentUser.uid && (existingParticipants[uid].name || '') === name);
            if (nameTaken && !silent) {
                const errEl = el('session-join-error');
                errEl.textContent = `⚠ Внимание: в сессии уже есть другой игрок с именем «${name}» — в журнале будет трудно их различить. Рекомендуем изменить имя на вкладке "Главная".`;
                errEl.style.color = '#e67e22';
                errEl.style.display = 'block';
            }

            const patch = {};
            patch['participants.' + currentUser.uid] = {
                name, curHp, curMp, maxHp, maxMp,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            db.collection('sessions').doc(code).update(patch).then(() => {
                el('session-join-block').style.display = 'none';
                el('session-active-block').style.display = 'block';
                el('session-code-display').textContent = code;
                subscribeToSession(code);
            });
        }).catch(e => console.error('Ошибка входа в сессию:', e));
    }

    window.leaveSession = function () {
        if (!currentSessionCode || !currentUser) return;
        db.collection('sessions').doc(currentSessionCode).update({
            ['participants.' + currentUser.uid]: firebase.firestore.FieldValue.delete()
        }).catch(() => {});
        if (unsubSession) { unsubSession(); unsubSession = null; }
        currentSessionCode = null;
        localStorage.removeItem(SESSION_KEY);
        el('session-active-block').style.display = 'none';
        el('session-join-block').style.display = 'block';
        el('session-code-input').value = '';
    };

    // Когда вкладка браузера свёрнута/неактивна, живые слушатели Firestore продолжают получать
    // snapshot-ы, обновлять DOM и жрать батарею — хотя игрок в этот момент физически не смотрит
    // на страницу. Отписываемся на visibilitychange, переподписываемся обратно при возврате.
    // CloudSync.saveCharacter() от этого НЕ зависит (пишет напрямую через db.collection(...).set(),
    // не через listener) — автосохранение продолжает работать даже со свёрнутой вкладкой.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (unsubSession) { unsubSession(); unsubSession = null; }
            if (unsubSelfGmFields) { unsubSelfGmFields(); unsubSelfGmFields = null; }
        } else {
            if (currentUser && !unsubSelfGmFields) subscribeToOwnGmFields(currentUser.uid);
            if (currentSessionCode && !unsubSession) subscribeToSession(currentSessionCode);
        }
    });

    function subscribeToSession(code) {
        if (unsubSession) unsubSession();
        unsubSession = db.collection('sessions').doc(code).onSnapshot(doc => {
            if (!doc.exists) {
                // Сессию закрыл/удалил мастер
                window.leaveSession();
                return;
            }
            renderSession(doc.data());
        });
    }

    // Индикатор "мастер онлайн/отошёл" — по heartbeat, который gm.js пишет раз в 20 сек, пока
    // открыта вкладка с активной сессией (см. enterSessionView/sendHeartbeat в gm.js).
    function renderGmOnlineIndicator(gmLastSeen) {
        const el2 = el('gm-online-indicator');
        if (!el2) return;
        if (!gmLastSeen || !gmLastSeen.toMillis) { el2.textContent = ''; return; }
        const secAgo = (Date.now() - gmLastSeen.toMillis()) / 1000;
        el2.textContent = secAgo < 60 ? '🟢 мастер онлайн' : '⚪ мастер отошёл';
    }

    // Отображение статуса похода/лагеря — переключает видимость "разбить"/"уже разбит" блоков.
    function renderCampStatus(campState) {
        const statusEl = el('camp-status-display');
        const deployEl = el('camp-deploy-controls');
        const activeEl = el('camp-active-controls');
        if (!statusEl || !deployEl || !activeEl) return;
        const active = campState && campState.active;
        deployEl.style.display = active ? 'none' : 'block';
        activeEl.style.display = active ? 'block' : 'none';
        if (!active) { statusEl.textContent = ''; return; }
        statusEl.innerHTML = `Лагерь разбит (${campState.deployedBy || '?'})${campState.isMagicallySafe ? ' · 🔮 магически безопасен' : (campState.hasTent ? ' · палатка и костёр' : '')}`;
    }

    // ---------- Шёпот от мастера (ответ на шёпот игрока) ----------
    // Мастер пишет в sessions/{code}.gmWhispers записи {id, ts, toUid, toName, text}. Игрок видит
    // только адресованные ему (toUid === его uid). Как и шёпот игрока мастеру, это интерфейсное
    // разделение, а не криптографическая приватность — документ сессии читаем любым участником.
    let _lastGmWhisperToastTs = 0;
    function gmWhisperSeenKey() { return 'skyrim_gm_whisper_seen_' + (currentSessionCode || ''); }

    window.markGmWhispersSeen = function () {
        const mine = ((lastSessionData && lastSessionData.gmWhispers) || []).filter(w => currentUser && w.toUid === currentUser.uid);
        const maxTs = mine.reduce((m, w) => Math.max(m, w.ts || 0), 0);
        try { localStorage.setItem(gmWhisperSeenKey(), String(maxTs)); } catch (e) {}
        const toast = document.getElementById('gm-whisper-toast');
        if (toast) toast.style.display = 'none';
        renderGmWhispersInbox((lastSessionData && lastSessionData.gmWhispers) || []);
    };

    function renderGmWhispersInbox(all) {
        if (!currentUser) return;
        const mine = all.filter(w => w.toUid === currentUser.uid).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        let seen = 0;
        try { seen = parseInt(localStorage.getItem(gmWhisperSeenKey())) || 0; } catch (e) {}
        const unread = mine.filter(w => (w.ts || 0) > seen);

        const box = el('gm-whispers-inbox');
        if (box) {
            if (!mine.length) { box.innerHTML = ''; }
            else {
                box.innerHTML = '<div style="font-size:13px; opacity:.8; margin-bottom:2px;">🤫 Шёпот от мастера' +
                    (unread.length ? ` — <strong style="color:var(--accent-color);">новых: ${unread.length}</strong> <button style="width:auto; padding:1px 8px; font-size:12px;" onclick="markGmWhispersSeen()">Прочитано</button>` : '') + '</div>' +
                    mine.slice(-8).map(w => {
                        const isNew = (w.ts || 0) > seen;
                        const time = w.ts ? new Date(w.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                        return `<div class="log-entry" style="${isNew ? 'border-left:3px solid var(--accent-color); padding-left:6px;' : ''}"><span class="log-time">${time}</span><span class="log-author">Мастер:</span> ${escapeHtml(w.text || '')}</div>`;
                    }).join('');
            }
        }

        // Неблокирующее уведомление — игрок может сидеть на другой вкладке и не видеть панель сессии.
        const newest = unread.length ? unread[unread.length - 1] : null;
        if (newest && (newest.ts || 0) > _lastGmWhisperToastTs) {
            _lastGmWhisperToastTs = newest.ts || 0;
            let toast = document.getElementById('gm-whisper-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'gm-whisper-toast';
                toast.style.cssText = 'position:fixed; top:12px; right:12px; max-width:320px; z-index:9500; background:#241c10; border:1px solid #765d35; border-radius:6px; padding:10px 12px; color:#f0e6d2; font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,.5); cursor:pointer;';
                toast.onclick = window.markGmWhispersSeen;
                document.body.appendChild(toast);
            }
            toast.innerHTML = '🤫 <strong>Шёпот от мастера</strong>' + (unread.length > 1 ? ` (новых: ${unread.length})` : '') + '<br>' + escapeHtml(newest.text || '') + '<div style="opacity:.6; font-size:11px; margin-top:4px;">нажми, чтобы отметить прочитанным</div>';
            toast.style.display = 'block';
        }
    }

    function renderSession(data) {
        lastSessionData = data;
        renderGmOnlineIndicator(data.gmLastSeen);
        renderCampStatus(data.campState);
        renderGmWhispersInbox(data.gmWhispers || []);
        renderParty(data.participants || {});
        renderJournal(data.journal || {}, { hold: (data.partyPos && data.partyPos.hold) || data.currentHold || '' });
        if (typeof window.processTrades === 'function') window.processTrades(data.trades || {});
        renderEnemies(data.enemies || []);
        renderInitiative(data.initiative || []);
        renderLog(data.combatLog || []);
        if (typeof window.renderAttackTargetSelect === 'function') window.renderAttackTargetSelect();
        if (typeof window.updateWeatherDisplay === 'function') window.updateWeatherDisplay();
        if (typeof window.renderCorpseRaiseSelect === 'function') window.renderCorpseRaiseSelect();
        if (typeof window.renderBuyList === 'function') window.renderBuyList();
        if (typeof window.renderSellList === 'function') window.renderSellList();
        if (typeof window.renderGroupCheckPlayerPanel === 'function') window.renderGroupCheckPlayerPanel();
        if (typeof window.renderHelpAllySelect === 'function') window.renderHelpAllySelect();
        if (typeof window.renderTradeSelects === 'function') window.renderTradeSelects();

        // Мастер мог наложить статус-эффект (паралич/страх и т.п.) атакой — он приходит через
        // сессию (у игрока нет живого листенера на свой собственный документ персонажа).
        // Применяем один раз и сразу же чистим очередь в сессии, чтобы не наложить повторно.
        if (currentUser && data.participants && data.participants[currentUser.uid]) {
            const pending = data.participants[currentUser.uid].pendingStatusEffects;
            if (Array.isArray(pending) && pending.length && typeof window.applyIncomingStatusEffects === 'function') {
                window.applyIncomingStatusEffects(pending);
                if (currentSessionCode) {
                    db.collection('sessions').doc(currentSessionCode).update({
                        ['participants.' + currentUser.uid + '.pendingStatusEffects']: []
                    }).catch(e => console.error('Ошибка очистки статус-эффектов:', e));
                }
            }
        }
    }

    // Кэш по имени — та же защита, что в gm.js (см. подробный комментарий там). Функция чистая,
    // кэш безопасен без инвалидации.
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

    function barRow(name, curHp, maxHp, curMp, maxMp, avatar) {
        const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
        const mpPct = maxMp > 0 ? Math.max(0, Math.min(100, (curMp / maxMp) * 100)) : 0;
        return '<div class="party-row' + (avatar ? ' enemy-portrait-row' : '') + '">' +
            '<div class="row-name"><span class="name-with-avatar">' + (avatar ? '<img class="enemy-avatar" src="' + avatar + '" alt="">' : '') + '<span>' + escapeHtml(name) + '</span></span><span>HP ' + curHp + '/' + maxHp + '  MP ' + curMp + '/' + maxMp + '</span></div>' +
            '<div class="bar-track"><div class="bar-fill-hp" style="width:' + hpPct + '%"></div></div>' +
            '<div class="bar-track"><div class="bar-fill-mp" style="width:' + mpPct + '%"></div></div>' +
            '</div>';
    }

    // ===== Журнал сессии: сводка и слухи публикует мастер, «записи партии» пишут все =====
    function journalSignature(j) {
        const s = (j.summary && j.summary.ts) || 0;
        const r = (j.rumors || []).map(x => x.id + (x.verdict || '')).join(',');
        const e = (j.entries || []).length;
        return s + '|' + r + '|' + e;
    }
    function rumorHere(r, hold) {
        if (!r.hold || !hold) return false;
        const a = String(r.hold).toLowerCase(), b = String(hold).toLowerCase();
        return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
    }
    function rumorMarks() {
        try { return JSON.parse(localStorage.getItem('rumorMarks:' + currentSessionCode) || '{}') || {}; } catch (e) { return {}; }
    }
    window.cycleRumorMark = function (id) {
        const m = rumorMarks(); const cur = m[id] || '';
        const next = cur === '' ? 't' : cur === 't' ? 'f' : '';
        if (next) m[id] = next; else delete m[id];
        try { localStorage.setItem('rumorMarks:' + currentSessionCode, JSON.stringify(m)); } catch (e) { }
        if (window._lastJournal) renderJournal(window._lastJournal, window._lastJournalCtx);
    };
    window.rumorToDiary = function (id) {
        const r = (window._journalRumors || []).find(x => x.id === id);
        if (!r || !window.addRumorDiaryEntry) return;
        window.addRumorDiaryEntry(r);
    };
    function rumorHtml(r, marks) {
        const VERD = { true: ['✔ подтвердилось', '#2ecc71'], twist: ['≈ правда, но приукрашена', '#e0a030'], false: ['✘ оказалось ложью', '#e74c3c'] };
        const v = r.verdict && VERD[r.verdict];
        const mk = marks[r.id];
        return '<div style="border-left:3px solid var(--accent-color); padding:3px 8px; margin-bottom:5px;">' +
            (r.hold ? '<span style="opacity:.65; font-size:11px;">' + escapeHtml(r.hold) + (r.day ? ' · день ' + r.day : '') + '</span><br>' : '') +
            escapeHtml(r.text || '') +
            (v ? ' <span style="font-size:12px; color:' + v[1] + ';">' + v[0] + '</span>' : '') +
            '<div style="margin-top:3px; display:flex; gap:6px; flex-wrap:wrap;">' +
            '<button type="button" style="width:auto; padding:1px 8px; font-size:12px; min-height:0;" onclick="cycleRumorMark(\'' + r.id + '\')">' + (mk === 't' ? '✔ верю' : mk === 'f' ? '✘ не верю' : '❔ сомневаюсь') + '</button>' +
            '<button type="button" style="width:auto; padding:1px 8px; font-size:12px; min-height:0;" onclick="rumorToDiary(\'' + r.id + '\')">📌 в дневник</button></div></div>';
    }
    function renderJournal(j, ctx) {
        window._lastJournal = j; window._lastJournalCtx = ctx || {};
        const sumEl = el('journal-summary'), rumEl = el('journal-rumors'), entEl = el('journal-entries');
        if (!sumEl || !rumEl || !entEl) return;
        const sum = j.summary && j.summary.text;
        sumEl.innerHTML = sum ? escapeHtml(sum) : '<span style="opacity:.6;">Мастер пока ничего не опубликовал.</span>';
        const rumors = (j.rumors || []).slice().reverse();
        window._journalRumors = rumors;
        const here = (ctx && ctx.hold) || '';
        const marks = rumorMarks();
        const near = rumors.filter(r => rumorHere(r, here)), far = rumors.filter(r => !rumorHere(r, here));
        rumEl.innerHTML = rumors.length
            ? (near.length ? '<div style="font-weight:bold; margin:2px 0 4px;">🗣 Сейчас здесь говорят (' + escapeHtml(here) + ')</div>' + near.map(r => rumorHtml(r, marks)).join('') : '')
              + (far.length ? (near.length ? '<div style="font-weight:bold; margin:8px 0 4px; opacity:.85;">Слышали раньше и в других местах</div>' : '') + far.map(r => rumorHtml(r, marks)).join('') : '')
            : '<span style="opacity:.6;">Слухов пока нет.</span>';
        const entries = (j.entries || []);
        entEl.innerHTML = entries.length ? entries.map(e => {
            const t = e.ts ? new Date(e.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + t + '</span><span class="log-author">' + escapeHtml(e.author || '?') + ':</span> ' + escapeHtml(e.text || '') + '</div>';
        }).join('') : '<span style="opacity:.6;">Записей пока нет.</span>';
        // Метка «есть новое» на вкладке
        window._journalSig = journalSignature(j);
        let seen = ''; try { seen = localStorage.getItem('journalSeen:' + currentSessionCode) || ''; } catch (e) { }
        const btn = el('tab14-btn');
        const empty = window._journalSig === '0||0';
        if (btn && btn.classList.contains('active')) { window.markJournalSeen(); return; }
        if (btn) btn.textContent = (!empty && seen !== window._journalSig) ? '📖 Дневник ●' : '📖 Дневник';
    }
    window.markJournalSeen = function () {
        try { localStorage.setItem('journalSeen:' + currentSessionCode, window._journalSig || ''); } catch (e) { }
        const btn = el('tab14-btn'); if (btn) btn.textContent = '📖 Дневник';
    };
    window.postJournalEntry = function () {
        const input = el('journal-new');
        const text = (input.value || '').trim();
        if (!text) return;
        if (!currentSessionCode || !currentUser) { alert('Запись партии доступна только внутри сессии.'); return; }
        const author = (el('char-name') || {}).value || currentUser.email || 'Игрок';
        db.collection('sessions').doc(currentSessionCode).update({
            'journal.entries': firebase.firestore.FieldValue.arrayUnion({ id: 'j' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), author: author, text: text })
        }).then(() => { input.value = ''; }).catch(e => alert('Не удалось записать: ' + e.message));
    };

    function renderParty(participants) {
        const target = el('party-list');
        const uids = Object.keys(participants);
        if (uids.length === 0) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Пока никого нет.</p>'; return; }
        target.innerHTML = uids.map(uid => {
            const p = participants[uid] || {};
            return barRow(p.name || '?', p.curHp || 0, p.maxHp || 0, p.curMp || 0, p.maxMp || 0);
        }).join('');
    }

    function renderEnemies(enemies) {
        const target = el('enemies-list');
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Противников нет.</p>'; return; }
        target.innerHTML = enemies.map(e => {
            let extra = '';
            if (e.isRaisable && (e.curHp || 0) <= 0) {
                extra = e.corpseLoot
                    ? '<button style="width:100%; margin-top:2px; font-size:12px;" onclick="window.playerLootCorpse(\'' + e.id + '\')">💰 Обыскать труп</button>'
                    : '<div style="font-size:12px; opacity:.6; margin-top:2px;">Труп уже обыскан.</div>';
            }
            return barRow(e.name || '?', e.curHp || 0, e.maxHp || 0, e.curMp || 0, e.maxMp || 0, enemyAvatarData(e)) + extra;
        }).join('');
    }

    function renderInitiative(list) {
        const target = el('initiative-list');
        if (!list.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Инициатива не задана.</p>'; return; }
        const sorted = list.slice().sort((a, b) => (b.roll || 0) - (a.roll || 0));
        target.innerHTML = sorted.map((item, i) =>
            '<div class="initiative-row"><span>' + (i + 1) + '. ' + escapeHtml(item.name || '?') + '</span><span>' + (item.roll ?? '') + '</span></div>'
        ).join('');
    }

    function renderLog(log) {
        const target = el('combat-log');
        target.innerHTML = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(entry.author || '?') + ':</span> ' + escapeHtml(entry.text || '') + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    window.postLogEntry = function () {
        const input = el('log-input');
        const text = (input.value || '').trim();
        if (!text || !currentSessionCode || !currentUser) return;
        const authorName = (el('char-name') || {}).value || currentUser.email;
        db.collection('sessions').doc(currentSessionCode).update({
            combatLog: firebase.firestore.FieldValue.arrayUnion({
                ts: Date.now(),
                author: authorName,
                text: text
            })
        }).then(() => { input.value = ''; }).catch(e => console.error('Ошибка отправки в журнал:', e));
    };

    el('log-input') && el('log-input').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') window.postLogEntry();
    });

    window.sendWhisperToGm = function () {
        const input = el('whisper-input');
        const text = (input.value || '').trim();
        if (!text || !currentSessionCode || !currentUser) return;
        const authorName = (el('char-name') || {}).value || currentUser.email;
        window.CloudSync.sendWhisperToGm(text, authorName)
            .then(() => { input.value = ''; })
            .catch(e => console.error('Ошибка отправки шёпота:', e));
    };

    el('whisper-input') && el('whisper-input').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') window.sendWhisperToGm();
    });

    // ---------- Инициализация ----------
    if (window.FIREBASE_CONFIGURED) {
        initAuth();
    } else {
        showOverlay(false);
        console.warn('Firebase не настроен — работаем в офлайн-режиме. См. README-FIREBASE.md');
    }
})();
