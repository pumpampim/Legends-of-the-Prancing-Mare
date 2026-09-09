// ============================================================================
// GM.JS — логика экрана мастера (gm.html)
// ============================================================================

(function () {
    let auth = null;
    let db = null;
    let currentUser = null;
    let currentCode = null;
    let unsubSession = null;
    let lastData = { participants: {}, enemies: [], initiative: [], combatLog: [] };
    let gmAllItems = [];
    let gmFilteredItems = [];
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
        attemptCreate(0);
    };

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
        db.collection('sessions').doc(currentCode).update({ status: 'closed' }).finally(() => {
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
}

    function renderAll() {
        renderParty(lastData.participants || {});
        renderEnemies(lastData.enemies || []);
        renderInitiative(lastData.initiative || []);
        renderLog(lastData.combatLog || []);
    }

    // ---------- Отряд ----------

    function renderParty(participants) {
        const target = el('gm-party-list');
        const uids = Object.keys(participants);
        if (!uids.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Пока никто не присоединился.</p>'; return; }
        target.innerHTML = uids.map(uid => {
            const p = participants[uid] || {};
            return '<div class="party-row">' +
                '<div class="row-name"><span>' + escapeHtml(p.name || '?') + '</span></div>' +
                '<div class="grid-2" style="gap:6px;">' +
                '<div><label style="font-size:11px;">HP (' + (p.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (p.curHp || 0) + '" onchange="setParticipantField(\'' + uid + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:11px;">MP (' + (p.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (p.curMp || 0) + '" onchange="setParticipantField(\'' + uid + '\',\'curMp\',this.value)"></div>' +
                '</div></div>';
        }).join('');
    }

    window.setParticipantField = function (uid, field, value) {
        const patch = {};
        patch['participants.' + uid + '.' + field] = Number(value) || 0;
        db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));
    };

    // ---------- Противники ----------

    function renderEnemies(enemies) {
        const target = el('gm-enemies-list');
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Противников нет.</p>'; return; }
        target.innerHTML = enemies.map(e => {
            return '<div class="enemy-row">' +
                '<div class="row-name"><span>' + escapeHtml(e.name || '?') + '</span>' +
                '<button class="btn-danger" style="width:auto;padding:2px 8px;font-size:11px;" onclick="removeEnemy(\'' + e.id + '\')">Убрать</button></div>' +
                '<div class="grid-2" style="gap:6px;">' +
                '<div><label style="font-size:11px;">HP (' + (e.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curHp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:11px;">MP (' + (e.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curMp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curMp\',this.value)"></div>' +
                '</div></div>';
        }).join('');
    }

    window.addEnemy = function () {
        const name = el('enemy-name-input').value.trim();
        if (!name) return;
        const maxHp = Number(el('enemy-hp-input').value) || 0;
        const maxMp = Number(el('enemy-mp-input').value) || 0;
        const enemies = (lastData.enemies || []).slice();
        enemies.push({ id: genId('e'), name, maxHp, curHp: maxHp, maxMp, curMp: maxMp });
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            el('enemy-name-input').value = '';
        }).catch(e => console.error(e));
    };

    window.setEnemyField = function (id, field, value) {
        const enemies = (lastData.enemies || []).map(e => e.id === id ? { ...e, [field]: Number(value) || 0 } : e);
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
    };

    window.removeEnemy = function (id) {
        const enemies = (lastData.enemies || []).filter(e => e.id !== id);
        db.collection('sessions').doc(currentCode).update({ enemies }).catch(e => console.error(e));
    };

    // ---------- Инициатива ----------

    function renderInitiative(list) {
        const target = el('gm-initiative-list');
        if (!list.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Инициатива не задана.</p>'; return; }
        const sorted = list.slice().sort((a, b) => (b.roll || 0) - (a.roll || 0));
        target.innerHTML = sorted.map((item, i) =>
            '<div class="initiative-row"><span>' + (i + 1) + '. ' + escapeHtml(item.name || '?') + ' — ' + (item.roll ?? '') + '</span>' +
            '<button class="btn-danger" style="width:auto;padding:1px 8px;font-size:11px;" onclick="removeInitiative(\'' + item.id + '\')">×</button></div>'
        ).join('');
    }

    window.addInitiative = function () {
        const name = el('init-name-input').value.trim();
        if (!name) return;
        const roll = Number(el('init-roll-input').value) || 0;
        const initiative = (lastData.initiative || []).slice();
        initiative.push({ id: genId('i'), name, roll });
        db.collection('sessions').doc(currentCode).update({ initiative }).then(() => {
            el('init-name-input').value = '';
            el('init-roll-input').value = '';
        }).catch(e => console.error(e));
    };

    window.removeInitiative = function (id) {
        const initiative = (lastData.initiative || []).filter(i => i.id !== id);
        db.collection('sessions').doc(currentCode).update({ initiative }).catch(e => console.error(e));
    };

    window.clearInitiative = function () {
        db.collection('sessions').doc(currentCode).update({ initiative: [] }).catch(e => console.error(e));
    };

    // ---------- Боевой журнал ----------

    function renderLog(log) {
        const target = el('gm-combat-log');
        target.innerHTML = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(entry.author || '?') + ':</span> ' + escapeHtml(entry.text || '') + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    window.gmPostLogEntry = function () {
        const input = el('gm-log-input');
        const text = (input.value || '').trim();
        if (!text || !currentCode) return;
        db.collection('sessions').doc(currentCode).update({
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: text })
        }).then(() => { input.value = ''; }).catch(e => console.error(e));
    };

    window.clearLog = function () {
        if (!confirm('Очистить весь боевой журнал?')) return;
        db.collection('sessions').doc(currentCode).update({ combatLog: [] }).catch(e => console.error(e));
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
    window.loadGmItems = function() {
        if (!db) return;
        db.collection('items').get().then(snapshot => {
            gmAllItems = [];
            snapshot.forEach(doc => {
                gmAllItems.push({ id: doc.id, ...doc.data() });
            });
            // Если коллекция пуста, пробуем загрузить из локальной базы (если есть)
            if (gmAllItems.length === 0) {
                console.warn('Коллекция items пуста, используем локальную базу из index.html (если доступна).');
                // Пробуем получить allItems из глобального объекта (если он определён в index.html)
                if (typeof window.allItems !== 'undefined') {
                    gmAllItems = window.allItems.map(item => ({ ...item, id: item.name }));
                } else {
                    document.getElementById('gm-items-table-body').innerHTML = '<tr><td colspan="5">Нет данных. Загрузите предметы через index.html.</td></tr>';
                    return;
                }
            }
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
                        <button class="btn btn-sm" onclick="window.gmGiveItemFromTable('${itemId}', '${item.name}', ${item.weight || 0})">Передать</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        if (countSpan) countSpan.textContent = gmFilteredItems.length;
    };

    window.gmGiveItemFromTable = function(itemId, itemName, itemWeight) {
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

        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.data();
            let inv = data.inventory || [];
            const existing = inv.find(item => item.itemId === itemId);
            if (existing) {
                existing.count += numCount;
            } else {
                inv.push({
                    itemId: itemId,
                    name: itemName,
                    count: numCount,
                    weight: itemWeight
                });
            }
            return db.collection('characters').doc(targetUid).update({ inventory: inv });
        }).then(() => {
            alert(`Предмет "${itemName}" передан игроку ${playerList[idx].name}!`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };
        // ---------- Импорт всех предметов в Firestore ----------
    window.importAllItems = function() {
        if (!db) {
            alert('Firebase не подключён.');
            return;
        }
        // Пытаемся получить allItems из глобального объекта (из index.html)
        let items = window.allItems;
        if (!items || items.length === 0) {
            // Если нет, пробуем через localStorage или другие источники — но лучше просто попросить вставить массив
            alert('Нет данных для импорта. Убедись, что в index.html определён window.allItems.');
            return;
        }
        if (!confirm(`Импортировать ${items.length} предметов в Firestore?`)) return;

        const batch = db.batch();
        let count = 0;
        items.forEach(item => {
            const docRef = db.collection('items').doc(); // автогенерация ID
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
            count++;
            // Firestore batch лимит 500 записей, поэтому коммитим по 500
            if (count % 500 === 0) {
                batch.commit().then(() => {
                    console.log(`Импортировано ${count} из ${items.length}`);
                }).catch(e => console.error('Ошибка импорта:', e));
                // Создаём новый batch для остальных
                // Но проще использовать один batch на все 500, здесь у нас около 400 предметов, так что один batch подойдёт
            }
        });

        // Коммитим оставшиеся
        batch.commit().then(() => {
            alert(`✅ Импортировано ${count} предметов!`);
            window.loadGmItems(); // обновляем таблицу
        }).catch(e => {
            console.error('Ошибка импорта:', e);
            alert('Ошибка импорта: ' + e.message);
        });
    };
        window.importAllItems = function() {
        // Просто вызываем loadGmItems, который сам проверит и импортирует
        window.loadGmItems();
    };
})();
