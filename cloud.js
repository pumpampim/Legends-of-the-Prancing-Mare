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
    let pendingSave = null; // отложенная запись, ещё не ушедшая в облако (для flushSave)
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
        // Эпик 3.11: доступ к файлам, созданным самим сайтом (scope drive.file — не видит остальной Drive). Токен держим ТОЛЬКО в памяти страницы.
        if (typeof provider.addScope === 'function') provider.addScope('https://www.googleapis.com/auth/drive.file');
        applyAuthPersistence().then(() => auth.signInWithPopup(provider)).then(res => {
            window.__driveToken = (res && res.credential && res.credential.accessToken) || null;
        }).catch(e => {
            if (e.code === 'auth/popup-closed-by-user') return;
            showAuthError(translateAuthError(e));
        });
    };

    window.cloudContinueOffline = function () {
        showOverlay(false);
    };

    window.cloudLogout = function () {
        // Сначала дописываем правки, которые ещё ждут таймера: после signOut currentUser = null и saveCharacter молча ничего не сохранит.
        try { if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage(true); } catch (e) { console.warn('Сохранение перед выходом:', e); }
        if (window.CloudSync && typeof window.CloudSync.flushSave === 'function') window.CloudSync.flushSave();
        const finish = () => {
            if (currentSessionCode) window.leaveSession();
            if (auth) auth.signOut();
        };
        // Ждём, пока Firestore подтвердит отправленные записи (но не дольше 3 с, чтобы выход не зависал без сети).
        if (db && typeof db.waitForPendingWrites === 'function') {
            let done = false;
            const once = () => { if (!done) { done = true; finish(); } };
            db.waitForPendingWrites().then(once, once);
            setTimeout(once, 3000);
        } else finish();
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
            if (lastSessionData) processMyPendingEffects(lastSessionData); // эффекты, пришедшие до загрузки персонажа
            if (lastSessionData && typeof window.syncSessionTurns === 'function') window.syncSessionTurns(lastSessionData, currentSessionCode);
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

    // Эпик 5.3. Пересёк ли счёт порог ранга? Только напоминание мастеру в журнал — никаких автоначислений.
    function announceGuildRank(guildName, before, after) {
        try {
            if (typeof GUILD_RANK_TIERS === 'undefined' || !currentSessionCode) return;
            const tiers = GUILD_RANK_TIERS[guildName]; if (!tiers) return;
            const crossed = tiers.filter(t => t.at > 0 && t.at > before && t.at <= after).pop();
            if (!crossed) return;
            const nm = (el('char-name') || {}).value || 'Игрок';
            window.CloudSync.postCombatLog('🏅 ' + nm + ' достиг ранга «' + crossed.name + '» в гильдии «' + guildName + '» — мастеру нужно выдать награду/броню', nm);
        } catch (e) { console.error(e); }
    }

    function stripUndefinedForCloud(v) {
        if (v === undefined) return undefined;
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(x => { const c = stripUndefinedForCloud(x); return c === undefined ? null : c; });
        if (typeof v.toDate === 'function' || v instanceof Date) return v; // Timestamp/Date не трогаем
        const out = {};
        Object.keys(v).forEach(k => { const c = stripUndefinedForCloud(v[k]); if (c !== undefined) out[k] = c; });
        return out;
    }

    // Статусы «спадают от урона» (Полиморф, Поцелуй любовника, Благословенное Слово…): флаг на статусе или правило по имени.
    function stBreaksOnDamage(st) {
        if (!st) return false;
        if (st.breakOnDamage) return true;
        return !!(window.StCombat && window.StCombat.statusRule && window.StCombat.statusRule(st.name).breakOnDamage);
    }
    window.stBreaksOnDamage = stBreaksOnDamage;

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
                    patch['participants.' + currentUser.uid + '.portraitThumb'] = (typeof data.portraitThumb === 'string' ? data.portraitThumb : '');
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
                        id: s.id, name: s.name, curHp: s.curHp || 0, maxHp: s.maxHp || 1, dmgType: s.dmgType || '',
                        curMp: s.curMp || 0, maxMp: s.maxMp || 0, dmg: s.dmg || 0, speed: s.speed || 30 // для подписей и лимита хода на боевой сетке мастера
                    }));
                    // Урон игрока (итоговый урон оружия) — подпись над фигурой на боевой сетке мастера
                    { const dEl = el('main-panel-dmg'); patch['participants.' + currentUser.uid + '.dmg'] = dEl ? (parseInt(dEl.value) || 0) : 0; }
                    { const sEl = el('val-speed'); patch['participants.' + currentUser.uid + '.speed'] = sEl ? (parseInt(sEl.value) || 0) : 30; } // скорость — лимит перемещения на сетке
                    // какие длительные зоны игрока ещё держатся (мастер убирает с сетки зоны, чьих эффектов больше нет)
                    patch['participants.' + currentUser.uid + '.zoneEffs'] = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : [])
                        .filter(e => e && e.gridZoneId && (e.turnsRemaining === null || e.turnsRemaining > 0 || e.turnsRemaining === Infinity)).map(e => e.gridZoneId);
                    db.collection('sessions').doc(currentSessionCode).update(patch)
                        .catch(e => console.error('Ошибка синхронизации с сессией:', e));
                }
            };
            clearTimeout(saveTimer);
            if (immediate) { pendingSave = null; doSave(); }
            else { pendingSave = doSave; saveTimer = setTimeout(() => { pendingSave = null; doSave(); }, 800); }
        },

        // Немедленно отправить отложенную запись (закрытие вкладки, выход из аккаунта).
        flushSave: function () {
            if (!pendingSave) return;
            clearTimeout(saveTimer);
            const f = pendingSave; pendingSave = null;
            f();
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
        // Игрок сейчас в сессии (код есть). lastSessionData после выхода НЕ обнуляется, поэтому «в сессии?» надёжнее проверять по коду.
        isInSession: function () { return !!currentSessionCode; },

        // Списывает урон с конкретного противника в сессии и пишет запись в общий боевой журнал.
        // Возвращает Promise. isPlayerAction=true подписывает запись именем игрока, а не "Мастер".
        // dmgType (необязательно): 'physical'/'fire'/'frost'/'shock'/'poison'/'magic' — если у врага
        // есть resist[dmgType], урон уменьшается (или увеличивается, если там отрицательное число —
        // это уязвимость, как у тролля к огню).
        applyDamageToEnemy: function (enemyId, dmgAmount, authorName, logText, dmgType, penetrationPct) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const wasAlive = (enemies[idx].curHp || 0) > 0;
                // Раньше формула была записана здесь; теперь — единый StCombat.previewDamage (combat-calc.js), тот же расчёт использует «🎯 Предпросмотр».
                let resist, finalDmg;
                if (window.StCombat) {
                    const pv = window.StCombat.previewDamage(enemies[idx], dmgAmount, dmgType, penetrationPct);
                    resist = pv.resist; finalDmg = pv.finalDmg;
                } else { // запасной расчёт без combat-calc.js (раньше let/const внутри затеняли внешние resist/finalDmg — урон выходил undefined)
                    resist = dmgType && enemies[idx].resist ? (enemies[idx].resist[dmgType] || 0) : 0;
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
                    finalDmg = Math.max(0, Math.round(dmgAmount * (1 - resist / 100)));
                }
                const newHp = Math.max(0, (enemies[idx].curHp || 0) - finalDmg);
                const patch = { curHp: newHp };
                // Штампуем момент смерти (номер общего счётчика ходов сессии) — труп поднимаемый
                // заклинанием только первые 5 ходов после этого.
                if (wasAlive && newHp <= 0) patch.diedAtTurn = data.sessionTurnCounter || 0;
                if (finalDmg > 0 && Array.isArray(enemies[idx].statusEffects) && enemies[idx].statusEffects.some(stBreaksOnDamage)) {
                    patch.statusEffects = enemies[idx].statusEffects.filter(st => !stBreaksOnDamage(st)); // Полиморф и т.п. спадают от урона
                }
                enemies[idx] = Object.assign({}, enemies[idx], patch);
                const update = { enemies: enemies };
                const finalLogText = (logText && resist) ? logText.replace(/урон (\d+)/, `урон ${finalDmg} (резист ${resist}%, было бы $1)`) : logText;
                if (finalLogText) {
                    update.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: finalLogText });
                }
                tx.update(ref, update); __txRes = ({ newHp, enemyName: enemies[idx].name, finalDmg, resist, killed: wasAlive && newHp <= 0, enemy: enemies[idx] });
            })).then(() => __txRes);
        },

        // Статус-эффекты на врагах (Страх/Успокоение/Ярость/Полиморф и т.п.) — раньше у объекта
        // врага вообще не было такого поля, эти заклинания были чистым текстом без последствий.
        // Тикаются вручную мастером (кнопка "Убрать" на статусе в списке боя) — не завязано на
        // автоматический тик ходов, чтобы не требовать точной синхронизации между игроком и мастером.
        applyStatusToEnemy: function (enemyId, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                let statuses = Array.isArray(enemies[idx].statusEffects) ? enemies[idx].statusEffects.slice() : [];
                if (extra && (typeof extra.dmgPct === 'number' || extra.unique)) statuses = statuses.filter(x => x.name !== statusName); // не складывается само с собой
                statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, (window.StCombat && window.StCombat.statusRule) ? window.StCombat.statusRule(statusName) : {}, extra || {}));
                enemies[idx] = Object.assign({}, enemies[idx], { statusEffects: statuses });
                const logText = `✨ ${authorName || 'Игрок'} накладывает на «${enemies[idx].name}»: ${statusName}${turns ? ` (${turns} х.)` : ''} — ${statusDesc}`;
                tx.update(ref, {
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText })
                }); __txRes = ({ enemyName: enemies[idx].name });
            })).then(() => __txRes);
        },

        // Снимает со статусов врага одноразовый флаг (напр. 'advantage' после атаки с преимуществом): статус целиком убирается, если у него нет других эффектов.
        clearEnemyStatusFlag: function (enemyId, flag) {
            if (!currentSessionCode || !db) return Promise.resolve();
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return;
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return;
                const before = Array.isArray(enemies[idx].statusEffects) ? enemies[idx].statusEffects : [];
                const after = before.filter(st => !(st && ((window.StCombat ? Object.assign(window.StCombat.statusRule(st.name), st) : st)[flag])));
                if (after.length === before.length) return;
                enemies[idx] = Object.assign({}, enemies[idx], { statusEffects: after });
                tx.update(ref, { enemies: enemies }); __txRes = (undefined);
            })).then(() => __txRes);
        },

        // Изгнание в Обливион («Изгнание/Высылка даэдра»): враг исчезает из боя целиком, без трупа и души.
        banishEnemy: function (enemyId, authorName, logText) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const name = enemies[idx].name;
                enemies.splice(idx, 1);
                tx.update(ref, {
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText || `🌀 ${authorName || 'Игрок'} изгоняет «${name}» в Обливион.` })
                }); __txRes = ({ enemyName: name });
            })).then(() => __txRes);
        },

        // Статус на всех живых врагов, подходящих под предикат (Круг защиты: нежить до N уровня). predicate(enemy) → bool.
        applyStatusToEnemiesWhere: function (predicate, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const names = [];
                const enemies = (Array.isArray(data.enemies) ? data.enemies : []).map(e => {
                    if ((e.curHp || 0) <= 0 || !predicate(e)) return e;
                    names.push(e.name);
                    const statuses = (Array.isArray(e.statusEffects) ? e.statusEffects : []).filter(x => x.name !== statusName);
                    statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, (window.StCombat && window.StCombat.statusRule) ? window.StCombat.statusRule(statusName) : {}, extra || {}));
                    return Object.assign({}, e, { statusEffects: statuses });
                });
                if (!names.length) { __txRes = { count: 0, names: [] }; return; }
                tx.update(ref, {
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: `✨ ${authorName || 'Игрок'}: «${statusName}» накладывается на: ${names.join(', ')}${turns ? ` (${turns} х.)` : ''} — ${statusDesc}` })
                }); __txRes = ({ count: names.length, names });
            })).then(() => __txRes);
        },

        // Статус сразу на нескольких врагов: nameRegexSource — регулярное выражение по имени (напр. нежить); только живые.
        applyStatusToEnemies: function (nameRegexSource, statusName, statusDesc, turns, authorName, extra) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const re = new RegExp(nameRegexSource, 'i');
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const names = [];
                const enemies = (Array.isArray(data.enemies) ? data.enemies : []).map(e => {
                    if (!re.test(e.name || '') || (e.curHp || 0) <= 0) return e;
                    names.push(e.name);
                    const statuses = (Array.isArray(e.statusEffects) ? e.statusEffects : []).filter(x => x.name !== statusName);
                    statuses.push(Object.assign({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: statusName, desc: statusDesc, turns: turns || null }, (window.StCombat && window.StCombat.statusRule) ? window.StCombat.statusRule(statusName) : {}, extra || {}));
                    return Object.assign({}, e, { statusEffects: statuses });
                });
                if (!names.length) { __txRes = { count: 0, names: [] }; return; }
                tx.update(ref, {
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: `✨ ${authorName || 'Игрок'}: «${statusName}» накладывается на: ${names.join(', ')} (${statusDesc}${turns ? ', ' + turns + ' х.' : ''})` })
                }); __txRes = ({ count: names.length, names });
            })).then(() => __txRes);
        },

        // Прямое изменение ХП/маны врага (лечение/урон от зелий и ядов, ручные правки). dHp/dMp — со знаком.
        modifyEnemyVitals: function (enemyId, dHp, dMp, authorName, logText) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
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
                if (newHp < (en.curHp || 0) && Array.isArray(en.statusEffects) && en.statusEffects.some(stBreaksOnDamage)) patch.statusEffects = en.statusEffects.filter(st => !stBreaksOnDamage(st));
                enemies[idx] = Object.assign({}, en, patch);
                const update = { enemies: enemies };
                if (logText) update.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText });
                tx.update(ref, update); __txRes = ({ enemyName: en.name, newHp, newMp, appliedHp: newHp - (en.curHp || 0), appliedMp: newMp - (en.curMp || 0) });
            })).then(() => __txRes);
        },

        // Яд (или любое варево) на враге: мгновенные эффекты применяются сразу, длящиеся — статус-эффектами на враге
        // (регенерация/затяжной урон тикают у мастера по кнопке «следующий ход», резисты/уязвимости учитываются при уроне).
        // effects: [{ name, magnitude, duration, unit, kind? }]. Возвращает { enemyName, notes }.
        applyAlchemyToEnemy: function (enemyId, effects, sourceName, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let __txRes; // транзакция: два игрока бьют одного врага одновременно — ни один удар не теряется
            return db.runTransaction(tx => tx.get(ref).then(doc => {
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
                const pendingHpDmg = [];
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
                        case 'dmg_hp': pendingHpDmg.push(mag || 0); break; // после статусов: уязвимость/сопротивление ядам из этого же яда тоже считаются
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
                if (pendingHpDmg.length) {
                    const stRes = statuses.reduce((t, st) => t + ((st && st.res && st.res.poison) || 0), 0);
                    const totRes = Math.min(100, poisonResist + stRes);
                    let dealt = 0;
                    pendingHpDmg.forEach(m => {
                        const d = Math.max(0, Math.round(m * (1 - totRes / 100)));
                        en.curHp = Math.max(0, (en.curHp || 0) - d); dealt += d;
                        notes.push(`−${d} хп${totRes ? ` (сопротивление яду ${totRes}%)` : ''}`);
                    });
                    if (dealt > 0) for (let k = statuses.length - 1; k >= 0; k--) if (stBreaksOnDamage(statuses[k])) statuses.splice(k, 1);
                }
                if (wasAlive && (en.curHp || 0) <= 0) en.diedAtTurn = data.sessionTurnCounter || 0;
                en.statusEffects = statuses;
                enemies[idx] = en;
                const logText = `☠ ${authorName || 'Игрок'} отравляет «${en.name}» («${sourceName || 'яд'}»): ${notes.join('; ') || '—'}`;
                tx.update(ref, {
                    enemies: enemies,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText })
                }); __txRes = ({ enemyName: en.name, notes });
            })).then(() => __txRes);
        },

        // Увеличивает общий счётчик ходов сессии на 1 — вызывается при "Следующий ход"/"Следующий
        // круг" у любого игрока. Нужен для окна "поднять труп можно только 5 ходов после смерти".
        // Троттлинг раз в 2 секунды — без него случайный спам по кнопке (100 кликов подряд = 100
        // отдельных FieldValue.increment() записей) мог бы выбить дневной лимит бесплатного
        // тарифа Firestore (20k записей/день) за один долгий бой группы из 5 человек.
        // Общий ход/круг сессии (синхронно у мастера и всех игроков). kind: 'turn' | 'round'.
        // sessionTickCounter — сколько раз всего «тикало» (ход или круг): по нему игроки прокручивают свои эффекты,
        // а мастер — статусы врагов. Повторное переключение в течение 3 секунд игнорируется (несколько человек нажали разом).
        advanceSessionTurn: function (kind, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const now = Date.now();
            let result = null;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const d = doc.data() || {};
                if (d.status !== 'active') throw new Error('Сессия закрыта.');
                const la = d.lastAdvance || {};
                if (la.at && now - la.at < 3000 && now >= la.at) { result = { skipped: true, by: la.by }; return; }
                const turn = (parseInt(d.sessionTurnCounter) || 0) + (kind === 'round' ? 0 : 1);
                const round = (parseInt(d.sessionRoundCounter) || 0) + (kind === 'round' ? 1 : 0);
                const who = authorName || 'Игрок';
                tx.update(ref, {
                    sessionTurnCounter: turn, sessionRoundCounter: round,
                    sessionTickCounter: (parseInt(d.sessionTickCounter) || 0) + 1,
                    lastAdvance: { at: now, by: who, kind: kind === 'round' ? 'round' : 'turn' },
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: now, author: who, text: (kind === 'round' ? '🔄 ' + who + ': следующий круг (круг ' + round + ')' : '⏭️ ' + who + ': следующий ход (ход ' + turn + ')') + '.' })
                });
                result = { skipped: false, turn, round };
            })).then(() => result);
        },
        // Длительная зона (плащ/аура/круг/стена/камень) от игрока — в очередь мастера
        addPendingZone: function (zone, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            return db.collection('sessions').doc(currentSessionCode).update({
                pendingZones: firebase.firestore.FieldValue.arrayUnion(zone),
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: (zone.icon || '✴') + ' ' + (authorName || 'Игрок') + ': «' + zone.spell + '»' + (zone.place === 'gm' ? ' — мастер ставит её на сетку.' : ' действует вокруг заклинателя.') })
            });
        },
        // Руна от игрока — в очередь мастера (он ставит её на боевую сетку)
        addPendingRune: function (rune, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            return db.collection('sessions').doc(currentSessionCode).update({
                pendingRunes: firebase.firestore.FieldValue.arrayUnion(rune),
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: '✴ ' + (authorName || 'Игрок') + ' накладывает «' + rune.spell + '» — мастер ставит её на сетку.' })
            });
        },
        // Заклинание «Управление погодой»: игрок меняет общую погоду сессии (видят все, запись в журнал).
        setSessionWeather: function (key, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const allowed = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'blizzard', 'fog'];
            if (allowed.indexOf(key) === -1) return Promise.reject(new Error('Неизвестная погода.'));
            const who = authorName || 'Игрок';
            return db.collection('sessions').doc(currentSessionCode).update({
                currentWeather: key,
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: who, text: '🌦 ' + who + ' меняет погоду заклинанием «Управление погодой».' })
            });
        },
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
        // «Следующий день» жмёт каждый игрок, а день у партии один: считаем, сколько дней прошёл каждый
        // (gameDayByUid), и двигаем общий счётчик, только когда кто-то ушёл дальше всех (gameDayPlayerMax).
        // Отметка игрока ставится при входе в сессию (текущий максимум). Кнопка мастера по-прежнему прибавляет день напрямую.
        bumpGameDayCounter: function () {
            if (!currentSessionCode || !db || !currentUser) return Promise.resolve();
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return;
                const d = doc.data() || {};
                const byUid = Object.assign({}, d.gameDayByUid || {});
                const max = parseInt(d.gameDayPlayerMax) || 0;
                // нет отметки (вошёл до этой версии) — считаем, что он на том же дне, что и лидер, и делает тот же переход
                const mine = (byUid[uid] != null ? parseInt(byUid[uid]) || 0 : Math.max(0, max - 1)) + 1;
                byUid[uid] = mine;
                const upd = { gameDayByUid: byUid };
                if (mine > max) { upd.gameDayPlayerMax = mine; upd.gameDayCounter = (parseInt(d.gameDayCounter) || 0) + 1; }
                tx.update(ref, upd);
            })).catch(e => console.error('Ошибка счётчика игровых дней:', e));
        },

        // Обыскивает труп самим игроком (раньше это умел делать только мастер) — забирает
        // добычу себе и помечает труп обысканным в сессии, чтобы никто не забрал её дважды.
        // Каннибализм (Намира): помечает труп съеденным (транзакция — один труп едят один раз).
        eatCorpseForSelf: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const enemies = Array.isArray(doc.data().enemies) ? doc.data().enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден.');
                if (enemies[idx].eaten) throw new Error('Труп уже съеден.');
                enemies[idx] = Object.assign({}, enemies[idx], { eaten: true });
                tx.update(ref, { enemies: enemies });
            }));
        },

        // Ловушку обезвредил сам игрок (бросок на его листе) — отмечаем в сессии, чтобы мастер видел.
        // Обезвредить не вышло — ловушка сработала на игроке: состояние как после «Сработала» у мастера (failState считает мастер).
        setTrapTriggered: function (trapId, failState) {
            if (!currentSessionCode || !db || !currentUser || !failState) return Promise.resolve();
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                const list = ((doc.data() || {}).placedTraps || []).map(t => t && t.id === trapId && t.state === 'ready'
                    ? Object.assign({}, t, { state: failState.state || 'off', left: failState.left || 0, victims: failState.state === 'active' ? [uid] : [] }) : t);
                tx.update(ref, { placedTraps: list });
            }));
        },
        setTrapDisarmed: function (trapId) {
            if (!currentSessionCode || !db) return Promise.resolve();
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                const list = ((doc.data() || {}).placedTraps || []).map(t => t && t.id === trapId ? Object.assign({}, t, { state: 'disarmed', victims: [] }) : t);
                tx.update(ref, { placedTraps: list });
            }));
        },
        // Убирает применённые листом команды мастера (characters/{uid}.gmCmds). Повтор не страшен — id применённых хранятся в сейве.
        ackGmCmds: function (cmds) {
            if (!currentUser || !db || !Array.isArray(cmds) || !cmds.length) return Promise.resolve();
            return db.collection('characters').doc(currentUser.uid).update({ gmCmds: firebase.firestore.FieldValue.arrayRemove.apply(null, cmds) });
        },

        // ТЗ-2, эпик 2.4: обыск контейнера данжа. Транзакция только по сессии: контейнер атомарно помечается
        // обысканным, двое одновременно — повезёт одному («Этот контейнер уже обыскан»). Вещи и золото игрок
        // кладёт себе САМ (как с трупами, lootCorpseForSelf) — запись в characters/{uid} из транзакции стёрло бы
        // ближайшее автосохранение листа, которое держит инвентарь у себя в памяти.
        takeFromDungeon: function (containerId) {
            if (!currentSessionCode || !db || !currentUser) return Promise.reject(new Error('Нет соединения с сессией.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let got = null;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const dungeon = (doc.data() || {}).currentDungeon;
                if (!dungeon) throw new Error('Нет активного данжа.');
                const taken = Array.isArray(dungeon.lootTaken) ? dungeon.lootTaken : [];
                if (taken.indexOf(containerId) !== -1) throw new Error('Этот контейнер уже обыскан.');
                const container = (dungeon.items || []).find(c => c.id === containerId);
                if (!container) throw new Error('Контейнер не найден.');
                tx.update(ref, { 'currentDungeon.lootTaken': taken.concat([containerId]) });
                got = { container: container, gold: parseInt(container.gold) || 0, items: container.items || [], dungeon: dungeon.name || '' };
            })).then(() => got);
        },

        lootCorpseForSelf: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let got = null;
            // ТРАНЗАКЦИЯ: раньше get()+update() — двое игроков, нажавших «Обыскать» одновременно,
            // оба видели добычу и оба её забирали (дубль золота и вещей).
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден.');
                const corpseLoot = enemies[idx].corpseLoot;
                if (!corpseLoot) throw new Error('Труп уже обыскан или добычи нет.');
                enemies[idx] = Object.assign({}, enemies[idx], { corpseLoot: null, looted: true });
                tx.update(ref, { enemies: enemies });
                got = corpseLoot;
            })).then(() => got);
        },

        // Карманная кража у противника в сцене: золото или одна вещь из его заранее брошенной добычи (corpseLoot),
        // чтобы украденное потом не выпало ещё раз с трупа. Транзакция — как у обыска трупа.
        // want: null — кошелёк; строка — конкретная вещь; { min, max } — случайная вещь этой цены (добыча ещё не брошена).
        pickpocketEnemy: function (enemyId, want) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            let got = { gold: 0, item: null };
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const enemies = Array.isArray(doc.data().enemies) ? doc.data().enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден.');
                let loot = enemies[idx].corpseLoot;
                // У врагов из базы добыча бросается только при обыске трупа — бросаем её сейчас по тексту лута,
                // чтобы украденное не выпало потом ещё раз.
                if (!loot && !enemies[idx].looted && enemies[idx].loot && window.EnemyLoot) loot = window.EnemyLoot.rollFromText(enemies[idx].loot, { pool: window.allItems || [], level: enemies[idx].level || 1 });
                if (!loot) throw new Error('Карманы оказались пусты.');
                const nl = JSON.parse(JSON.stringify({ gold: loot.gold || 0, items: loot.items || [] })); // без undefined — Firestore их не принимает
                if (!want) { got.gold = nl.gold; nl.gold = 0; }
                else {
                    const fit = it => it && !it.slot && (typeof want === 'string' ? it.name === want : ((it.price || 0) >= want.min && (it.price || 0) <= want.max));
                    const cand = nl.items.map((it, k) => fit(it) ? k : -1).filter(k => k >= 0);
                    const i = cand.length ? cand[Math.floor(Math.random() * cand.length)] : -1;
                    if (i === -1 && typeof want === 'string') throw new Error('Этой вещи в карманах уже нет.');
                    if (i === -1) { enemies[idx] = Object.assign({}, enemies[idx], { corpseLoot: nl }); tx.update(ref, { enemies: enemies }); return; }
                    const it = Object.assign({}, nl.items[i]);
                    const q = parseInt(it.qty) || 1;
                    if (q > 1) nl.items[i] = Object.assign({}, it, { qty: q - 1 }); else nl.items.splice(i, 1);
                    delete it.qty;
                    got.item = it;
                }
                enemies[idx] = Object.assign({}, enemies[idx], { corpseLoot: nl });
                tx.update(ref, { enemies: enemies });
            })).then(() => got);
        },

        // Пойман на карманной краже: заявка мастеру (gm.js renderTheftCases) с предложенным штрафом.
        reportTheftCaught: function (c) {
            if (!currentUser || !db || !currentSessionCode) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const list = Array.isArray((doc.data() || {}).theftCases) ? doc.data().theftCases.slice() : [];
                const p = ((doc.data() || {}).participants || {})[uid] || {};
                list.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 5), uid: uid, name: p.name || 'Игрок', ts: Date.now(),
                    victim: String(c.victim || ''), what: String(c.what || ''), fine: Math.max(0, parseInt(c.fine) || 0), hold: String(c.hold || '') });
                tx.update(ref, { theftCases: list });
            }));
        },

        // Задача K: +1 к прогрессу гильдии на СВОЁМ ЖЕ документе персонажа при выполнении квеста
        // этой гильдии. Атомарный инкремент (не read-then-write) — на своём документе игрок
        // может писать и без сессии.
        // Задача C: покупка у живого торговца — убирает купленный товар из ассортимента (он
        // штучный, не бесконечный) и добавляет цену к золоту торговца в сессии.
        // expect = { name, sig, price } выбранного товара: если другой игрок успел купить вещь выше по списку,
        // номера сдвинулись — тогда ищем товар по имени, а не списываем соседний.
        buyFromMerchantStock: function (key, itemIdx, price, qty, expect) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            // ТРАНЗАКЦИЯ: иначе два одновременных покупателя (или двойной клик) получали одну и ту же вещь дважды.
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const stocks = Object.assign({}, data.merchantStocks || {});
                const stock = stocks[key];
                if (!stock || !Array.isArray(stock.items)) throw new Error('Товар уже не в наличии.');
                const same = i => i && i.name === expect.name && (i.sig || '') === (expect.sig || '') && i.price === expect.price;
                if (expect && !same(stock.items[itemIdx])) itemIdx = stock.items.findIndex(same);
                if (!stock.items[itemIdx]) throw new Error('Товар уже не в наличии — обнови список.');
                const items = stock.items.slice();
                const want = Math.max(1, parseInt(qty) || 1);
                const have = items[itemIdx].qty || 1;
                if (have < want) throw new Error('У торговца осталось только ' + have + ' шт.');
                if (have > want) items[itemIdx] = Object.assign({}, items[itemIdx], { qty: have - want });
                else items.splice(itemIdx, 1);
                stocks[key] = Object.assign({}, stock, { items: items, gold: (stock.gold || 0) + (price || 0) });
                tx.update(ref, { merchantStocks: stocks });
            }));
        },

        // Продажа ЖИВОМУ торговцу: вещь попадает в его общий ассортимент (её можно сразу выкупить),
        // золото торговца уменьшается на сумму сделки; не хватает золота — сделка отклоняется.
        sellToMerchantStock: function (key, entry, qty, total) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
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
                tx.update(ref, { merchantStocks: stripUndefinedForCloud(stocks) });
            }));
        },

        // Перк «Вкладчик»: игрок вкладывает золото в лавку — запас золота торговца растёт навсегда,
        // а сам игрок записывается в investors (для «Скупщика»: такой торговец берёт у него краденое).
        investInMerchantStock: function (key, amount, uid, name) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const stocks = Object.assign({}, data.merchantStocks || {});
                const stock = stocks[key];
                if (!stock) throw new Error('Торговец уже уехал — обнови список.');
                const investors = Array.isArray(stock.investors) ? stock.investors.slice() : [];
                if (investors.indexOf(uid) !== -1) throw new Error('Ты уже вложился в эту лавку.');
                investors.push(uid);
                stocks[key] = Object.assign({}, stock, { gold: (stock.gold || 0) + amount, investors: investors });
                tx.update(ref, {
                    merchantStocks: stripUndefinedForCloud(stocks),
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: name || 'Игрок', text: `💰 ${name || 'Игрок'} вкладывает ${amount} золота в лавку «${stock.label || 'Торговец'}» (перк «Вкладчик»)` })
                });
            }));
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

        // Коллегия бардов. «Бардовская баллада»: пока бард играет, в sessions/{code}.bardSong лежит его uid —
        // остальные игроки получают +1 к кубам (атака, проверки; защиту считает мастер), сам бард атаковать не может.
        setBardSong: function (on, name) {
            if (!currentSessionCode || !db || !currentUser) return Promise.reject(new Error('Не в сессии.'));
            const patch = {};
            patch['bardSong'] = on ? { uid: currentUser.uid, name: String(name || 'Бард').slice(0, 40), since: Date.now() } : firebase.firestore.FieldValue.delete();
            return db.collection('sessions').doc(currentSessionCode).update(patch);
        },
        // «Воодушевление»: один заряд +4 на ближайший бросок цели. Нельзя поверх уже висящего заряда.
        giveInspire: function (targetUid, fromName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(function (tx) {
                return tx.get(ref).then(function (doc) {
                    const d = doc.data() || {};
                    if (!d.participants || !d.participants[targetUid]) throw new Error('Цели нет в сессии.');
                    if (d.inspire && d.inspire[targetUid]) throw new Error('Эта цель уже воодушевлена.');
                    const patch = {};
                    patch['inspire.' + targetUid] = { value: 3, fromName: String(fromName || 'Бард').slice(0, 40), grantedAt: Date.now() };
                    tx.update(ref, patch);
                });
            });
        },
        clearInspire: function (uid) {
            if (!currentSessionCode || !db) return Promise.resolve();
            const patch = {};
            patch['inspire.' + uid] = firebase.firestore.FieldValue.delete();
            return db.collection('sessions').doc(currentSessionCode).update(patch).catch(() => {});
        },

        incrementGuildProgress: function (guildName) {
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            const ref = db.collection('characters').doc(currentUser.uid);
            const patch = {};
            patch['guildsData.' + guildName + '.orders'] = firebase.firestore.FieldValue.increment(1);
            // Эпик 5.3: узнаём счёт ДО прибавления, чтобы понять, не пересечён ли порог ранга (само прибавление по-прежнему атомарное).
            return ref.get().then(doc => {
                const gd = ((doc.exists ? doc.data() : {}).guildsData || {})[guildName];
                const before = typeof gd === 'number' ? gd : (gd && parseInt(gd.orders)) || 0;
                return ref.set(patch, { merge: true }).then(() => announceGuildRank(guildName, before, before + 1));
            });
        },

        // Сдача артефакта в музей коллегии бардов — +1 легендарная песня (orders), +1 к
        // отдельному счётчику артефактов, +800 золота. Всё через FieldValue.increment (та же
        // защита от гонки с debounced-автосохранением, что и у обычного золота/заказов — не
        // читает "старое" значение вообще, что бы игрок ни делал параллельно на своём листе).
        donateBardArtifact: function () {
            // Больше не начисляет награду само: раньше кнопку можно было жать бесконечно (+800 золота и +1 песня каждый раз).
            // Теперь это ЗАЯВКА мастеру; награду начисляет мастер, приняв заявку (gm.js: approveMuseumRequest).
            if (!currentUser || !db) return Promise.reject(new Error('Не авторизован.'));
            if (!currentSessionCode) return Promise.reject(new Error('Сдать предмет можно только в активной сессии — мастер должен увидеть заявку.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const list = Array.isArray((doc.data() || {}).museumRequests) ? doc.data().museumRequests.slice() : [];
                if (list.some(r => r.uid === uid)) throw new Error('Твоя заявка уже ждёт мастера.');
                const p = ((doc.data() || {}).participants || {})[uid] || {};
                list.push({ id: 'm' + Date.now() + Math.random().toString(36).slice(2, 5), uid: uid, name: p.name || 'Игрок', ts: Date.now() });
                tx.update(ref, { museumRequests: list });
            }));
        },

        // Квесты гильдий: игрок подаёт ЗАЯВКУ, +1 заказ и награды начисляются только после решения мастера (gm.js: resolveQuestClaim).
        requestQuestClaim: function (q) {
            if (!currentUser || !db || !currentSessionCode) return Promise.reject(new Error('Квест гильдии подтверждает мастер — нужна активная сессия.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const d = doc.data() || {};
                const list = Array.isArray(d.questClaims) ? d.questClaims.slice() : [];
                if (list.some(c => c.uid === uid && c.questId === q.questId)) return;
                const p = (d.participants || {})[uid] || {};
                list.push({ id: 'qc' + Date.now() + Math.random().toString(36).slice(2, 5), uid: uid, name: p.name || 'Игрок', questId: q.questId, title: q.title || '', guild: q.guild || '', ts: Date.now() });
                tx.update(ref, { questClaims: list });
            }));
        },
        // Игрок применил решение мастера — убираем его из очереди решений.
        ackQuestDecision: function (questId) {
            if (!currentUser || !db || !currentSessionCode) return Promise.resolve();
            const ref = db.collection('sessions').doc(currentSessionCode);
            const uid = currentUser.uid;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return;
                const list = Array.isArray((doc.data() || {}).questDecisions) ? doc.data().questDecisions.filter(x => !(x.uid === uid && x.questId === questId)) : [];
                tx.update(ref, { questDecisions: list });
            })).catch(() => { });
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

        // ---------- Сундук отряда (sessions/{code}.partyStash / partyGold) ----------
        // Всё меняется ТРАНЗАКЦИЕЙ над документом сессии: если двое берут одно и то же одновременно, успевает один (второй получит «уже забрали»).
        // Предмет/золото убираются у отправителя ТОЛЬКО после успеха (вызывающий код), а у получателя добавляются по результату транзакции.
        // Одинаковые сваренные зелья лежат одной стопкой, даже если у них разные itemId (см. alchemyStackKey в alchemy-data.js).
        // Разрозненные стопки, положенные до исправления, сливаются при следующем изменении сундука.
        _mergeStash: function (stash) {
            const keyOf = typeof window.alchemyStackKey === 'function' ? window.alchemyStackKey : () => null;
            const seen = {}, out = [];
            stash.forEach(s => {
                const k = keyOf(s);
                if (k && seen[k]) { seen[k].count = (seen[k].count || 0) + (s.count || 0); return; }
                const c = Object.assign({}, s); out.push(c); if (k) seen[k] = c;
            });
            return out;
        },
        stashItem: function (item, qty, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            qty = Math.max(1, parseInt(qty) || 1);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                if ((doc.data() || {}).status !== 'active') throw new Error('Сессия закрыта мастером — сундук недоступен.');
                const stash = window.CloudSync._mergeStash(Array.isArray((doc.data() || {}).partyStash) ? doc.data().partyStash : []);
                const ex = typeof window.findSameStack === 'function' ? window.findSameStack(stash, item) : stash.find(s => s.itemId === item.itemId);
                if (ex) ex.count = (ex.count || 0) + qty;
                else stash.push(Object.assign({}, stripUndefinedForCloud(item), { count: qty }));
                tx.update(ref, {
                    partyStash: stash,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: '🎒 ' + (authorName || 'Игрок') + ' кладёт в сундук отряда: ' + item.name + (qty > 1 ? ' ×' + qty : '') + '.' })
                });
            }));
        },
        takeFromStash: function (itemId, qty, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            qty = Math.max(1, parseInt(qty) || 1);
            let taken = null;
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                if ((doc.data() || {}).status !== 'active') throw new Error('Сессия закрыта мастером — сундук недоступен.');
                const raw = Array.isArray((doc.data() || {}).partyStash) ? doc.data().partyStash : [];
                const want = raw.find(s => s.itemId === itemId);
                const key = want && typeof window.alchemyStackKey === 'function' ? window.alchemyStackKey(want) : null;
                const stash = window.CloudSync._mergeStash(raw);
                const idx = stash.findIndex(s => s.itemId === itemId || (key && window.alchemyStackKey(s) === key));
                if (idx === -1 || (stash[idx].count || 0) < qty) throw new Error('Этого уже нет в сундуке (кто-то успел раньше).');
                taken = Object.assign({}, stash[idx], { count: qty });
                if (stash[idx].count - qty <= 0) stash.splice(idx, 1); else stash[idx] = Object.assign({}, stash[idx], { count: stash[idx].count - qty });
                tx.update(ref, {
                    partyStash: stash,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: '🎒 ' + (authorName || 'Игрок') + ' берёт из сундука: ' + taken.name + (qty > 1 ? ' ×' + qty : '') + '.' })
                });
            })).then(() => taken);
        },
        // delta > 0 — положить золото, delta < 0 — взять (нельзя взять больше, чем есть)
        changeStashGold: function (delta, authorName) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            delta = parseInt(delta) || 0;
            if (!delta) return Promise.resolve(0);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                if ((doc.data() || {}).status !== 'active') throw new Error('Сессия закрыта мастером — сундук недоступен.');
                const cur = parseInt((doc.data() || {}).partyGold) || 0;
                if (cur + delta < 0) throw new Error('В сундуке только ' + cur + ' золота.');
                tx.update(ref, {
                    partyGold: cur + delta,
                    combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: '💰 ' + (authorName || 'Игрок') + (delta > 0 ? ' кладёт в сундук ' : ' берёт из сундука ') + Math.abs(delta) + ' зол.' })
                });
            })).then(() => delta);
        },

        // ---------- OOC-чат (эпик 3.3): отдельное поле oocChat, с боевым журналом не смешивается ----------
        postOOC: function (text, author) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            text = String(text || '').trim().slice(0, 500);
            if (!text) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                oocChat: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: author || 'Игрок', text: text })
            });
        },
        // ---------- Опросы (эпик 3.4): polls.{id}.votes.{uid} = индекс варианта ----------
        votePoll: function (pollId, optionIndex) {
            if (!currentSessionCode || !db || !currentUser) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                const poll = ((doc.data() || {}).polls || {})[pollId];
                if (!poll) throw new Error('Опрос не найден.');
                if (poll.closed) throw new Error('Опрос уже закрыт.');
                if (!(optionIndex >= 0 && optionIndex < (poll.options || []).length)) throw new Error('Нет такого варианта.');
                tx.update(ref, { ['polls.' + pollId + '.votes.' + currentUser.uid]: optionIndex });
            }));
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

        // Шёпот другому игроку: sessions/{code}.playerWhispers {id, ts, fromUid, fromName, toUid, toName, text}.
        // Отправитель и адресат видят запись у себя; панель мастера её не показывает. Это интерфейсное разделение —
        // документ сессии технически читаем всеми участниками (как и шёпот мастеру).
        sendWhisperToPlayer: function (toUid, toName, text, fromName) {
            if (!currentSessionCode || !db || !text || !toUid || !currentUser) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                playerWhispers: firebase.firestore.FieldValue.arrayUnion({
                    id: 'pw-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    ts: Date.now(), fromUid: currentUser.uid, fromName: fromName || 'Игрок',
                    toUid: toUid, toName: toName || 'Игрок', text: String(text).slice(0, 500)
                })
            });
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
            let __txRes; // транзакция — параллельные правки списка врагов не теряются
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return;
                enemies[idx] = Object.assign({}, enemies[idx], { raised: true });
                tx.update(ref, { enemies: enemies }); __txRes = (undefined);
            })).then(() => __txRes);
        },

        // «Трансмутация смерти»: труп превращается в пепел — обыскать и поднять нельзя. Резолвится true, если превратили мы.
        turnCorpseToAsh: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.resolve(true);
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return true;
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return true;
                if (enemies[idx].ashes) return false;
                enemies[idx] = Object.assign({}, enemies[idx], { ashes: true, corpseLoot: null, looted: true, isRaisable: false });
                tx.update(ref, { enemies: enemies });
                return true;
            })).then(r => r !== false); // false — кто-то успел раньше (душа/пепел уже есть)
        },

        // Помечает труп как «душа уже захвачена» (захват души — один раз на существо). Резолвится
        // true, если метку поставили мы, и false, если душу уже забрал кто-то другой.
        markSoulTaken: function (enemyId) {
            if (!currentSessionCode || !db) return Promise.resolve(true);
            const ref = db.collection('sessions').doc(currentSessionCode);
            return db.runTransaction(tx => tx.get(ref).then(doc => {
                if (!doc.exists) return true;
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) return true;
                if (enemies[idx].soulTaken) return false;
                enemies[idx] = Object.assign({}, enemies[idx], { soulTaken: true });
                tx.update(ref, { enemies: enemies });
                return true;
            })).then(r => r !== false); // false — кто-то успел раньше (душа/пепел уже есть)
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

            // Пишем поля по отдельности: раньше запись игрока заменялась целиком, и при каждом входе/перезагрузке
            // стиралась очередь от мастера (pendingStatusEffects: болезни, статусы, заказы, команды) и прочие поля.
            const patch = {};
            const pref = 'participants.' + currentUser.uid + '.';
            Object.assign(patch, { [pref + 'name']: name, [pref + 'curHp']: curHp, [pref + 'curMp']: curMp, [pref + 'maxHp']: maxHp, [pref + 'maxMp']: maxMp, [pref + 'updatedAt']: firebase.firestore.FieldValue.serverTimestamp() });
            // Новый в сессии игрок стоит на текущем дне партии — от этой точки считаются его «Следующий день» (bumpGameDayCounter).
            if (!(doc.data().gameDayByUid || {}).hasOwnProperty(currentUser.uid)) patch['gameDayByUid.' + currentUser.uid] = parseInt(doc.data().gameDayPlayerMax) || 0;

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
        lastSessionData = null;   // раньше после выхода «старая» сессия оставалась в getSessionData()
        localStorage.removeItem(SESSION_KEY);
        if (typeof window.updateCombatDock === 'function') window.updateCombatDock();
        if (typeof window.renderPartyStash === 'function') window.renderPartyStash();
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
            if (!doc.exists || (doc.data() || {}).status === 'closed') {
                // Сессию закрыл/удалил мастер. Раньше при status:'closed' игрок оставался «в сессии» и мог брать из сундука,
                // который мастер уже перенёс в новую сессию (дубль вещей и золота).
                const wasClosed = doc.exists;
                window.leaveSession();
                if (wasClosed) { const n = el('session-join-error'); if (n) { n.textContent = 'Мастер закрыл сессию.'; n.style.display = 'block'; } }
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
        if (window._gmWhisperUnreadPrev !== undefined && unread.length > window._gmWhisperUnreadPrev) window.stNotify('Шёпот от мастера', unread[unread.length - 1].text || '');
        window._gmWhisperUnreadPrev = unread.length;

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

    // ---------- Шёпот между игроками ----------
    let _lastPlayerWhisperToastTs = 0;
    function playerWhisperSeenKey() { return 'skyrim_pl_whisper_seen_' + (currentSessionCode || ''); }
    function myPlayerWhispers(all) {
        return (all || []).filter(w => currentUser && (w.toUid === currentUser.uid || w.fromUid === currentUser.uid)).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    }
    window.markPlayerWhispersSeen = function () {
        const incoming = myPlayerWhispers(lastSessionData && lastSessionData.playerWhispers).filter(w => w.toUid === currentUser.uid);
        try { localStorage.setItem(playerWhisperSeenKey(), String(incoming.reduce((m, w) => Math.max(m, w.ts || 0), 0))); } catch (e) {}
        const toast = document.getElementById('pl-whisper-toast'); if (toast) toast.style.display = 'none';
        renderPlayerWhispers((lastSessionData && lastSessionData.playerWhispers) || [], (lastSessionData && lastSessionData.participants) || {});
    };
    function renderPlayerWhispers(all, participants) {
        if (!currentUser) return;
        // список адресатов — остальные участники сессии (выбор сохраняется между обновлениями)
        const sel = el('pwhisper-target');
        if (sel) {
            const others = Object.keys(participants || {}).filter(uid => uid !== currentUser.uid);
            const sig = others.map(u => u + ':' + ((participants[u] || {}).name || '')).join('|');
            if (sel.getAttribute('data-sig') !== sig) {
                const prev = sel.value;
                sel.innerHTML = '<option value="">Кому…</option>' + others.map(u => `<option value="${escapeHtml(u)}">${escapeHtml((participants[u] || {}).name || 'Игрок')}</option>`).join('');
                if (others.includes(prev)) sel.value = prev;
                sel.setAttribute('data-sig', sig);
            }
        }
        const mine = myPlayerWhispers(all);
        let seen = 0;
        try { seen = parseInt(localStorage.getItem(playerWhisperSeenKey())) || 0; } catch (e) {}
        const unread = mine.filter(w => w.toUid === currentUser.uid && (w.ts || 0) > seen);
        const box = el('player-whispers-inbox');
        if (box) {
            box.innerHTML = !mine.length ? '' :
                '<div style="font-size:13px; opacity:.8; margin-bottom:2px;">🤫 Шёпот между игроками' +
                (unread.length ? ` — <strong style="color:var(--accent-color);">новых: ${unread.length}</strong> <button style="width:auto; padding:1px 8px; font-size:12px;" onclick="markPlayerWhispersSeen()">Прочитано</button>` : '') + '</div>' +
                mine.slice(-10).map(w => {
                    const incoming = w.toUid === currentUser.uid;
                    const isNew = incoming && (w.ts || 0) > seen;
                    const time = w.ts ? new Date(w.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                    const who = incoming ? escapeHtml(w.fromName || 'Игрок') + ' → вам' : 'вы → ' + escapeHtml(w.toName || 'Игрок');
                    return `<div class="log-entry" style="${isNew ? 'border-left:3px solid var(--accent-color); padding-left:6px;' : ''}"><span class="log-time">${time}</span><span class="log-author">${who}:</span> ${escapeHtml(w.text || '')}</div>`;
                }).join('');
        }
        const newest = unread.length ? unread[unread.length - 1] : null;
        if (newest && (newest.ts || 0) > _lastPlayerWhisperToastTs) {
            _lastPlayerWhisperToastTs = newest.ts || 0;
            let toast = document.getElementById('pl-whisper-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'pl-whisper-toast';
                toast.style.cssText = 'position:fixed; top:70px; right:12px; max-width:320px; z-index:9500; background:#241c10; border:1px solid #765d35; border-radius:6px; padding:10px 12px; color:#f0e6d2; font-size:14px; box-shadow:0 4px 16px rgba(0,0,0,.5); cursor:pointer;';
                toast.onclick = window.markPlayerWhispersSeen;
                document.body.appendChild(toast);
            }
            toast.innerHTML = '🤫 <strong>' + escapeHtml(newest.fromName || 'Игрок') + ' шепчет вам</strong>' + (unread.length > 1 ? ` (новых: ${unread.length})` : '') + '<br>' + escapeHtml(newest.text || '');
            toast.style.display = 'block';
        }
    }

    // 6.2: «мастер что-то сделал». Раньше новая запись журнала проходила незаметно, если смотришь в другую вкладку.
    // Сравниваем длину combatLog с прошлой отрисовкой ТОЙ ЖЕ сессии: выросла — короткий звук + вибро. Первая
    // отрисовка после входа и перерисовка без изменений молчат. Свои же записи не пикают (иначе бы пикало на каждое действие).
    const ST_BEEP = 'data:audio/wav;base64,UklGRtQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YbAEAACAudjOoGQ0J0N6tNXPpWo5KEB1rtLQqW89KT1vqc/RrXVCKztqo8zRsXpGLTlmnsjRtH9LLzhhmcTQt4VQMTZdk8DPuopVNDZZjrzOvI5aNzVWibjNvpNfOjVThLTLwJdkPTZQgK/JwZtpQTZNe6vHwp9tRTdLdqbEwqJySDhJcqLBw6V3TDpHbp2+wqh7UDtGapm7wquAVT1FZ5S4wa2EWUBEZJC0wK+IXUJEYYyxv7GLYUVEXoetvrKPZUhEW4OpvLOSaUtEWYCmurSVbU5FV3yiuLSYcVFGVnietrSbdVRHVHWas7SdeVdJU3KXsbSffFtKUm+TrrOhf15MUmyPq7Ojg2JOUmqMqLKkhmVQUmiJpbCliWhTUmaFoq+mi2xVUmSCn62mjm9YU2N/nKunkHJaVGJ9mamnknVdVWF6lqemlHhgVmB4k6WmlXpiWF92kKOlln1lWV90jqGll4BoW19yi56kmIJqXV9wiJyjmYRtX2BvhpqhmYZvYWBuhJegmodyY2FtgZWemol0ZWJsgJOdmYp2Z2NsfpCbmYt5aWRrfI6ZmIx7a2Vre4yXmI18bWdreYqVl45+b2hseIiUlo5/cWpsd4aSlY6Bc2ttd4WQlI6CdW1udoOOko6Dd29udoKMkY2EeHBvdoGLj42EenJwdoCJjoyFe3Rydn+HjIuFfHVzdn6Gi4uFfXd0d32FiYmFfnh2eH2EiIiFf3p3eH2ChoeEf3t4eX2ChYaEgHx6en2BhIWDgH17e32Ag4OCgH59fX6AgYKBgH9+fn+AgIGAgH9/f3+/2atcKTuDyNSdTidGks/NjUMpU6HUxH46LWKu1bhvMzRxudSsYS48gMLQnlQtR47JypBJLlOczsKBQDFhqNC3czk3brPPrGY0P3y8zJ9ZMkiKw8eSTjJUl8i/hEY1YKPKtnc/Om2uyqtqOkF6t8igXjhKh73Dk1Q4VJPCvIZLOl+exbR6RT5rqMWqbkBEd7HDoGM9TIO4v5RZPVWPvLmJUT5fmr+yfUpCaqPAqXJFR3arvp9nQ06BsruVXkJXi7e2ilZDYJa6r4BQRmqfuqh1S0t0prqfa0hRfqy3lWNHWIixsotbSGGStK2CVUpqmrWmeFFOc6G1nm9OVHynspVnTVqGrK+MYE1ijq+qg1pPapawo3tWUnKdsJxzU1d7oq6Va1Jdg6arjWVSY4uppoVfVGuSqqF9W1dymKqbdllbep2plG9XYIGhpo1pV2WIpKOGZFhsjqWef2BbcpSlmXheXnmZpJNyXWN/nKKMbVxohp+fhmldbYugm4BlX3OQoJZ6Y2J5lJ+RdWJmfpedjHFiaoSZm4ZtYm+Im5eBamR0jZuTfGhneZCaj3hnan2TmYt0Z22ClJaGcWhxhpWTgm9pdYmWkH5ta3mMlY16bG59jpSJd2xwgZCShXVtdISQj4JzbneHkI1/cnB6iZCKfHFyfYqPh3pxdICLjYR4cnaCjIuCd3N5hIuJgHZ0e4WLh352dn2GioV8dnh/h4iDe3d6gYeHgXp4e4KGhYB6eX2DhoR/e3p+g4WCfnt8f4ODgX58fYCCgoB+fX6AgYGAfn5/gIGAf39/f4A=';
    let stLogSession = null, stLogLen = null;
    function stSoundOn() { try { return localStorage.getItem('skyrim_session_sound') === '1'; } catch (e) { return false; } }
    window.stToggleSound = function () {
        try { localStorage.setItem('skyrim_session_sound', stSoundOn() ? '0' : '1'); } catch (e) { }
        stUpdateSoundBtn();
        if (stSoundOn()) stPlayBeep(); // клик — это жест пользователя: заодно «разблокируем» автовоспроизведение звука
    };
    function stUpdateSoundBtn() { const b = el('btn-sound'); if (b) b.textContent = stSoundOn() ? '🔔 Звук при изменении в сессии: вкл' : '🔕 Звук при изменении в сессии'; }
    function stPlayBeep() {
        try { const a = new Audio(ST_BEEP); const p = a.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
        try { if (navigator.vibrate) navigator.vibrate([80]); } catch (e) { }
    }
    window.stPlayBeep = stPlayBeep;
    function stCheckLogGrowth(log) {
        if (stLogSession !== currentSessionCode) { stLogSession = currentSessionCode; stLogLen = null; }
        const len = log.length;
        const prev = stLogLen;
        stLogLen = len;
        if (prev === null || len <= prev || !stSoundOn()) return;
        const me = ((el('char-name') || {}).value || '').trim();
        const fresh = log.slice(prev);
        if (me && fresh.every(e => (e.author || '') === me)) return;
        stPlayBeep();
    }
    document.addEventListener('DOMContentLoaded', stUpdateSoundBtn);
    setTimeout(stUpdateSoundBtn, 0);

    function renderSession(data) {
        lastSessionData = data;
        stCheckLogGrowth(data.combatLog || []);
        if (typeof window.updateCombatDock === 'function') window.updateCombatDock();
        renderPlayerWhispers(data.playerWhispers || [], data.participants || {});
        if (typeof window.renderPartyStash === 'function') window.renderPartyStash(data);
        renderOoc(data.oocChat || []);
        updateNotifyButton();
        if (typeof window.onPartyPosChanged === 'function') window.onPartyPosChanged(data.partyPos, currentSessionCode);
        renderPollModal(data.polls || {});
        renderGmOnlineIndicator(data.gmLastSeen);
        renderCampStatus(data.campState);
        renderGmWhispersInbox(data.gmWhispers || []);
        renderParty(data.participants || {});
        renderJournal(data.journal || {}, { hold: (data.partyPos && data.partyPos.hold) || data.currentHold || '' });
        if (typeof window.processTrades === 'function') window.processTrades(data.trades || {});
        if (typeof window.processQuestDecisions === 'function') { try { window.processQuestDecisions(data.questDecisions || []); } catch (e) { console.error(e); } }
        renderPlayerDungeon(data.currentDungeon || null);
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
        { // Коллегия бардов: панель «Особые способности» зависит от того, кто играет / кто воодушевлён / кто в сессии
            const sig = JSON.stringify([data.bardSong && data.bardSong.uid, Object.keys(data.inspire || {}), Object.keys(data.participants || {}), (data.enemies || []).map(e => e.id + ':' + ((e.curHp || 0) > 0 ? 1 : 0) + (e.raised ? 'r' : '')), data.sessionTurnCounter || 0]);
            if (sig !== window._bardSig) { window._bardSig = sig; if (typeof window.renderPowersPanel === 'function') window.renderPowersPanel(); }
        }
        if (typeof window.renderTradeSelects === 'function') window.renderTradeSelects();

        // Мастер мог наложить статус-эффект (паралич/страх и т.п.) атакой — он приходит через
        // сессию (у игрока нет живого листенера на свой собственный документ персонажа).
        // Применяем один раз и сразу же чистим очередь в сессии, чтобы не наложить повторно.
        processMyPendingEffects(data);
        if (cloudDataReady && typeof window.syncSessionTurns === 'function') window.syncSessionTurns(data, currentSessionCode);
    }
    // ТЗ-2, эпик 2.4: «Вы в: [Данж]» и кнопки обыска оставшихся контейнеров.
    let _lastDungeonOpenedAt = null;
    function renderPlayerDungeon(dungeon) {
        const status = el('player-dungeon-status');
        if (!status) return;
        if (!dungeon) { status.style.display = 'none'; _lastDungeonOpenedAt = null; return; }
        status.style.display = 'block';
        el('player-dungeon-name').textContent = dungeon.name || '—';
        // Новый данж — один раз сказать игроку (и в фоне, если вкладка свёрнута). При первом снимке после входа не шумим.
        if (_lastDungeonOpenedAt !== null && dungeon.openedAt !== _lastDungeonOpenedAt) {
            if (typeof window.alchToast === 'function') window.alchToast('🏰 Вы в: ' + escHtmlC(dungeon.name || 'данж'));
            if (typeof window.stNotify === 'function') window.stNotify('🏰 Мастер открыл данж', dungeon.name || '');
        }
        _lastDungeonOpenedAt = dungeon.openedAt || 0;
        const lootBox = el('player-dungeon-loot');
        const taken = dungeon.lootTaken || [];
        const remaining = (dungeon.items || []).filter(c => taken.indexOf(c.id) === -1);
        if (!remaining.length) { lootBox.innerHTML = '<div style="font-size:13px; opacity:.75;">Всё здесь обыскано.</div>'; return; }
        lootBox.innerHTML = remaining.map(c =>
            '<button type="button" class="st-dungeon-search" onclick="playerSearchContainer(\'' + jsqC(c.id) + '\')">🔍 ' + escHtmlC(c.label || 'Контейнер') + '</button>').join('');
    }
    function escHtmlC(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function jsqC(s) { return escHtmlC(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

    // Очередь эффектов от мастера/союзников. Пока персонаж не загружен из облака, НЕ применяем и НЕ чистим —
    // иначе загрузка персонажа затирала эффект (болезнь, полученная, пока игрок был офлайн, терялась).
    function processMyPendingEffects(data) {
        if (!data || !currentUser || !data.participants || !data.participants[currentUser.uid]) return;
        if (!cloudDataReady) return; // применим сразу после загрузки персонажа (loadCharacterFromCloud)
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
        const e = (Array.isArray(j.entries) ? j.entries : []).length;
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
    window.refreshJournalView = function () { if (window._lastJournal) renderJournal(window._lastJournal, window._lastJournalCtx); };
    window.rumorToDiary = function (id) {
        const r = (window._journalRumors || []).find(x => x.id === id);
        if (!r || !window.addRumorDiaryEntry) return;
        window.addRumorDiaryEntry(r);
        if (window._lastJournal) renderJournal(window._lastJournal, window._lastJournalCtx); // кнопка → «✔ в дневнике»
    };
    function rumorHtml(r, marks) {
        const VERD = { true: ['✔ подтвердилось', '#2ecc71'], twist: ['≈ правда, но приукрашена', '#e0a030'], false: ['✘ оказалось ложью', '#e74c3c'] };
        const v = r.verdict && VERD[r.verdict];
        const mk = marks[r.id];
        const inDiary = !!(window.isRumorInDiary && window.isRumorInDiary(r));
        return '<div style="border-left:3px solid var(--accent-color); padding:3px 8px; margin-bottom:5px;">' +
            (r.hold ? '<span style="opacity:.65; font-size:11px;">' + escapeHtml(r.hold) + (r.day ? ' · день ' + r.day : '') + '</span><br>' : '') +
            escapeHtml(r.text || '') +
            (v ? ' <span style="font-size:12px; color:' + v[1] + ';">' + v[0] + '</span>' : '') +
            '<div style="margin-top:3px; display:flex; gap:6px; flex-wrap:wrap;">' +
            '<button type="button" style="width:auto; padding:1px 8px; font-size:12px; min-height:0;" onclick="cycleRumorMark(\'' + r.id + '\')">' + (mk === 't' ? '✔ верю' : mk === 'f' ? '✘ не верю' : '❔ сомневаюсь') + '</button>' +
            '<button type="button" style="width:auto; padding:1px 8px; font-size:12px; min-height:0;" onclick="rumorToDiary(\'' + r.id + '\')"' + (inDiary ? ' disabled title="Уже записан в «Мои записи»">✔ в дневнике' : '>📌 в дневник') + '</button></div></div>';
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
        const onlyDecisions = window._journalFilter === 'decision';
        const entries = (Array.isArray(j.entries) ? j.entries : []).filter(e => !onlyDecisions || e.type === 'decision');
        entEl.innerHTML = entries.length ? entries.map(e => {
            const t = e.ts ? new Date(e.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + t + '</span><span class="log-author">' + (e.type === 'decision' ? '⚖ ' : '') + escapeHtml(e.author || '?') + ':</span> ' + escapeHtml(e.text || '') + '</div>';
        }).join('') : '<span style="opacity:.6;">' + (onlyDecisions ? 'Решений пока нет.' : 'Записей пока нет.') + '</span>';
        ['journal-filter-all', 'journal-filter-decision'].forEach(id => { const b = el(id); if (b) b.classList.toggle('active', (id === 'journal-filter-decision') === onlyDecisions); });
        // Метка «есть новое» на вкладке
        window._journalSig = journalSignature(j);
        let seen = ''; try { seen = localStorage.getItem('journalSeen:' + currentSessionCode) || ''; } catch (e) { }
        const btn = el('tab14-btn');
        const empty = window._journalSig === '0||0';
        if (btn && btn.classList.contains('active')) { window.markJournalSeen(); return; }
        if (btn) btn.textContent = (!empty && seen !== window._journalSig) ? '📖 Дневник ●' : '📖 Дневник';
    }
    window.setJournalFilter = function (f) { window._journalFilter = f; if (window._lastJournal) renderJournal(window._lastJournal, window._lastJournalCtx); };
    window.markJournalSeen = function () {
        try { localStorage.setItem('journalSeen:' + currentSessionCode, window._journalSig || ''); } catch (e) { }
        const btn = el('tab14-btn'); if (btn) btn.textContent = '📖 Дневник';
    };
    // ----- Уведомления (эпик 5.5). Показываются, когда вкладка скрыта (иначе игрок и так видит). -----
    window.stNotify = function (title, body) {
        try {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            if (!document.hidden && !window.__stNotifyAlways) return;
            new Notification(title, { body: body || '', icon: 'skyrim-bg.jpg' });
        } catch (e) { }
    };
    window.stEnableNotifications = function () {
        if (typeof Notification === 'undefined') { alert('Этот браузер не поддерживает уведомления.'); return; }
        Notification.requestPermission().then(p => {
            const b = el('btn-notify'); if (b) b.textContent = p === 'granted' ? '🔔 Уведомления включены' : '🔕 Уведомления запрещены';
        });
    };
    function updateNotifyButton() {
        const b = el('btn-notify'); if (!b || typeof Notification === 'undefined') return;
        b.textContent = Notification.permission === 'granted' ? '🔔 Уведомления включены' : Notification.permission === 'denied' ? '🔕 Уведомления запрещены' : '🔔 Разрешить уведомления';
    }

    // ----- OOC-чат (3.3) -----
    function renderOoc(log) {
        const t = el('ooc-log'); if (!t) return;
        t.innerHTML = log.map(m => {
            const time = m.ts ? new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(m.author || '?') + ':</span> ' + escapeHtml(m.text || '') + '</div>';
        }).join('');
        t.scrollTop = t.scrollHeight;
    }
    window.sendOoc = function () {
        const input = el('ooc-input'); const text = (input.value || '').trim(); if (!text) return;
        window.CloudSync.postOOC(text, (el('char-name') || {}).value || 'Игрок').then(() => { input.value = ''; }).catch(e => alert('Не удалось отправить: ' + e.message));
    };

    // ----- Опросы (3.4): модалка появляется при новом открытом опросе, за который игрок ещё не голосовал -----
    const pollDismissed = {};
    function renderPollModal(polls) {
        const modal = el('poll-modal'); if (!modal) return;
        const uid = currentUser && currentUser.uid;
        const ids = Object.keys(polls || {}).filter(id => !polls[id].closed && !((polls[id].votes || {})[uid] >= 0) && !pollDismissed[id]).sort((a, b) => (polls[a].ts || 0) - (polls[b].ts || 0));
        if (!ids.length) { modal.style.display = 'none'; return; }
        const id = ids[0], p = polls[id];
        if (modal.dataset.pollId !== id || modal.style.display === 'none') window.stNotify('Опрос партии', p.question || '');
        modal.dataset.pollId = id;
        el('poll-question').textContent = p.question || '';
        el('poll-options').innerHTML = (p.options || []).map((o, i) => '<label style="display:flex;gap:8px;align-items:center;margin:6px 0;font-size:16px;"><input type="radio" name="poll-opt" value="' + i + '" style="width:auto;margin:0;"> ' + escapeHtml(o) + '</label>').join('');
        modal.style.display = 'flex';
    }
    window.submitPollVote = function () {
        const modal = el('poll-modal'); const sel = document.querySelector('input[name="poll-opt"]:checked');
        if (!sel) { alert('Выбери вариант.'); return; }
        window.CloudSync.votePoll(modal.dataset.pollId, parseInt(sel.value)).then(() => { modal.style.display = 'none'; }).catch(e => alert(e.message));
    };
    window.dismissPoll = function () { const modal = el('poll-modal'); pollDismissed[modal.dataset.pollId] = true; modal.style.display = 'none'; };

    window.postJournalEntry = function (type) {
        type = (type === 'decision') ? 'decision' : 'note'; // эпик 3.5; 'rumor-log' зарезервирован под записи слухов
        const input = el('journal-new');
        const text = (input.value || '').trim();
        if (!text) return;
        if (!currentSessionCode || !currentUser) { alert('Запись партии доступна только внутри сессии.'); return; }
        const author = (el('char-name') || {}).value || currentUser.email || 'Игрок';
        db.collection('sessions').doc(currentSessionCode).update({
            'journal.entries': firebase.firestore.FieldValue.arrayUnion({ id: 'j' + Date.now() + Math.random().toString(36).slice(2, 5), ts: Date.now(), author: author, text: text, type: type })
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
            // Последователям Намиры: съесть труп человека/мера (кнопка рядом с «Обыскать»)
            if ((e.curHp || 0) <= 0 && !e.eaten && typeof window.playerCanEatCorpse === 'function' && window.playerCanEatCorpse(e)) {
                extra += '<button style="width:100%; margin-top:2px; font-size:12px;" onclick="window.playerEatCorpse(\'' + e.id + '\')">🍖 Съесть труп</button>';
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

    window.sendWhisperToPlayer = function () {
        const input = el('pwhisper-input'), sel = el('pwhisper-target');
        const text = (input.value || '').trim();
        if (!currentSessionCode || !currentUser) { alert('Сначала войди в сессию.'); return; }
        if (!sel.value) { alert('Выбери, кому шепнуть.'); return; }
        if (!text) return;
        const toName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : 'Игрок';
        const fromName = (el('char-name') || {}).value || currentUser.email;
        window.CloudSync.sendWhisperToPlayer(sel.value, toName, text, fromName)
            .then(() => { input.value = ''; })
            .catch(e => console.error('Ошибка шёпота игроку:', e));
    };
    el('pwhisper-input') && el('pwhisper-input').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') window.sendWhisperToPlayer(); });

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
