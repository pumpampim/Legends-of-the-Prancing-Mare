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
    let unsubSession = null;
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
            info.textContent = '☁ Вошёл как ' + currentUser.email;
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

    function loadCharacterFromCloud(uid) {
        db.collection('characters').doc(uid).get().then(doc => {
            if (doc.exists && window.applyCharacterData) {
                window.applyCharacterData(doc.data());
                if (window.updateAll) window.updateAll();
            }
            cloudDataReady = true;
        }).catch(e => {
            console.error('Ошибка загрузки персонажа из облака:', e);
            // Даже при ошибке загрузки разрешаем сохранение — иначе персонаж
            // навсегда останется нередактируемым при сбое сети.
            cloudDataReady = true;
        });
    }

    // ---------- Сохранение персонажа (вызывается из saveLocalStorage) ----------

    let lastSessionData = null;

    window.CloudSync = {
        saveCharacter: function (data) {
            if (!currentUser || !db || !cloudDataReady) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
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
                    db.collection('sessions').doc(currentSessionCode).update(patch)
                        .catch(e => console.error('Ошибка синхронизации с сессией:', e));
                }
            }, 800);
        },

        // Текущие данные активной сессии (враги/группа/инициатива/журнал), как последний раз
        // пришли из Firestore. null, если игрок не в сессии.
        getSessionData: function () {
            return lastSessionData;
        },

        // Списывает урон с конкретного противника в сессии и пишет запись в общий боевой журнал.
        // Возвращает Promise. isPlayerAction=true подписывает запись именем игрока, а не "Мастер".
        applyDamageToEnemy: function (enemyId, dmgAmount, authorName, logText) {
            if (!currentSessionCode || !db) return Promise.reject(new Error('Не в сессии.'));
            const ref = db.collection('sessions').doc(currentSessionCode);
            return ref.get().then(doc => {
                if (!doc.exists) throw new Error('Сессия не найдена.');
                const data = doc.data();
                const enemies = Array.isArray(data.enemies) ? data.enemies.slice() : [];
                const idx = enemies.findIndex(e => e.id === enemyId);
                if (idx === -1) throw new Error('Противник не найден (возможно, уже убран).');
                const newHp = Math.max(0, (enemies[idx].curHp || 0) - dmgAmount);
                enemies[idx] = Object.assign({}, enemies[idx], { curHp: newHp });
                const update = { enemies: enemies };
                if (logText) {
                    update.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: logText });
                }
                return ref.update(update).then(() => ({ newHp, enemyName: enemies[idx].name }));
            });
        },

        // Пишет произвольную запись в общий боевой журнал сессии от имени игрока.
        postCombatLog: function (text, authorName) {
            if (!currentSessionCode || !db || !text) return Promise.resolve();
            return db.collection('sessions').doc(currentSessionCode).update({
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: authorName || 'Игрок', text: text })
            });
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

    function renderSession(data) {
        lastSessionData = data;
        renderParty(data.participants || {});
        renderEnemies(data.enemies || []);
        renderInitiative(data.initiative || []);
        renderLog(data.combatLog || []);
        if (typeof window.renderAttackTargetSelect === 'function') window.renderAttackTargetSelect();
    }

    function enemyAvatarData(enemy) {
        const name = String(enemy && enemy.name || '?');
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
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
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

    function renderParty(participants) {
        const target = el('party-list');
        const uids = Object.keys(participants);
        if (uids.length === 0) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Пока никого нет.</p>'; return; }
        target.innerHTML = uids.map(uid => {
            const p = participants[uid] || {};
            return barRow(p.name || '?', p.curHp || 0, p.maxHp || 0, p.curMp || 0, p.maxMp || 0);
        }).join('');
    }

    function renderEnemies(enemies) {
        const target = el('enemies-list');
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Противников нет.</p>'; return; }
        target.innerHTML = enemies.map(e => barRow(e.name || '?', e.curHp || 0, e.maxHp || 0, e.curMp || 0, e.maxMp || 0)).join('');
    }

    function renderInitiative(list) {
        const target = el('initiative-list');
        if (!list.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Инициатива не задана.</p>'; return; }
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

    // ---------- Инициализация ----------
    if (window.FIREBASE_CONFIGURED) {
        initAuth();
    } else {
        showOverlay(false);
        console.warn('Firebase не настроен — работаем в офлайн-режиме. См. README-FIREBASE.md');
    }
})();
