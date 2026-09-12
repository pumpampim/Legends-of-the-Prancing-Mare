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
        populateRecipePlayerSelect();
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
                console.warn('Коллекция items пуста, используем локальную базу из items-data.js (если подключена).');
                // Пробуем получить allItems из глобального объекта (задаётся в items-data.js)
                if (typeof window.allItems !== 'undefined') {
                    gmAllItems = window.allItems.map(item => ({ ...item, id: item.name }));
                } else {
                    document.getElementById('gm-items-table-body').innerHTML = '<tr><td colspan="5">Нет данных. Убедись, что items-data.js подключён и нажми «Импорт».</td></tr>';
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
                        <button class="btn btn-sm" onclick="window.gmGiveItemFromTable('${itemId}')">Передать</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        if (countSpan) countSpan.textContent = gmFilteredItems.length;
    };

    window.gmGiveItemFromTable = function(itemId) {
        const sourceItem = (gmAllItems || []).find(i => (i.id || i.name) === itemId);
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

        // Переносим слот/броню/урон, чтобы игрок мог сразу надеть/взять в руки предмет.
        const extra = {};
        if (sourceItem.slot) extra.slot = sourceItem.slot;
        if (typeof sourceItem.armor === 'number') extra.armorValue = sourceItem.armor;
        if (typeof sourceItem.dmg === 'number') extra.weaponDmg = sourceItem.dmg;
        if (sourceItem.type === 'staff') { extra.isStaff = true; extra.slot = 'ranged'; }

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
        return [...armor, ...jewelry];
    }

    function populateRecipePlayerSelect() {
        const select = el('recipe-player-select');
        if (!select) return;
        const uids = Object.keys(lastData.participants || {});
        const prevValue = select.value;
        select.innerHTML = '<option value="">— выбери игрока —</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        if (uids.includes(prevValue)) {
            select.value = prevValue;
        } else {
            currentRecipePlayerUid = null;
            currentPlayerKnownRecipes = [];
            el('recipe-checklist').innerHTML = '<p style="opacity:.6; font-size:12px;">Выбери игрока выше.</p>';
        }
    }

    window.loadPlayerKnownRecipes = function () {
        const select = el('recipe-player-select');
        const uid = select.value;
        if (!uid) {
            currentRecipePlayerUid = null;
            currentPlayerKnownRecipes = [];
            el('recipe-checklist').innerHTML = '<p style="opacity:.6; font-size:12px;">Выбери игрока выше.</p>';
            return;
        }
        currentRecipePlayerUid = uid;
        el('recipe-checklist').innerHTML = '<p style="opacity:.6; font-size:12px;">Загрузка...</p>';
        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            currentPlayerKnownRecipes = Array.isArray(data.knownSmithingRecipes) ? data.knownSmithingRecipes : [];
            renderRecipeChecklist();
        }).catch(e => {
            el('recipe-checklist').innerHTML = '<p style="color:#e74c3c; font-size:12px;">Ошибка загрузки: ' + escapeHtml(e.message) + '</p>';
        });
    };

    window.renderRecipeChecklist = function () {
        const container = el('recipe-checklist');
        if (!currentRecipePlayerUid) return;
        const search = (el('recipe-search').value || '').toLowerCase();
        const all = getAllSmithingRecipeNames().filter(r => r.name.toLowerCase().includes(search));
        if (!all.length) {
            container.innerHTML = '<p style="opacity:.6; font-size:12px;">Ничего не найдено.</p>';
            return;
        }
        container.innerHTML = all.map(r => {
            const checked = currentPlayerKnownRecipes.includes(r.name) ? 'checked' : '';
            const sub = r.slot === 'jewelry' ? 'Ювелирное' : `${r.armorType || ''} · ${r.slot || ''}`;
            return `<label style="display:flex; align-items:center; gap:8px; padding:4px 2px; border-bottom:1px solid var(--border-color); font-size:13px;">
                <input type="checkbox" ${checked} onchange="toggleRecipeKnown('${escapeHtml(r.name)}', this.checked)">
                <span style="flex:1;">${escapeHtml(r.name)} <span style="opacity:.6; font-size:11px;">(${escapeHtml(sub)})</span></span>
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

})();
