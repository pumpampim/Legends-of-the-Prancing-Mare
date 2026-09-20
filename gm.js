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
        populateInvPlayerSelect();
        populateCalcPlayerSelects();
        populateQuestTargetSelect();
        populateGmAttackSelects();
        populateLootTargetSelect();
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

    // ---------- Противники ----------

    function renderEnemies(enemies) {
        const target = el('gm-enemies-list');
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:13px;">Противников нет.</p>'; return; }
        target.innerHTML = enemies.map(e => {
            const resistEntries = e.resist ? Object.entries(e.resist).filter(([k, v]) => v) : [];
            const resistLine = resistEntries.length
                ? '<div style="font-size:11px; opacity:.75;">Резист: ' + resistEntries.map(([k, v]) => escapeHtml(k) + ' ' + v + '%').join(', ') + '</div>' : '';
            const dmgLine = e.weaponDmg ? '<div style="font-size:11px; opacity:.75;">Урон оружием: ' + e.weaponDmg + (e.weaponNote ? ' (' + escapeHtml(e.weaponNote) + ')' : '') + '</div>' : '';
            const spellsLine = (e.spells && e.spells.length)
                ? '<div style="font-size:11px; opacity:.75;">Заклинания: ' + e.spells.map(s => escapeHtml(s.name) + ' (' + s.dmg + ' урона / ' + s.cost + ' МП)').join(', ') + '</div>' : '';
            const shoutsHtml = (e.shouts && e.shouts.length)
                ? e.shouts.map((s, si) => {
                    const cdKey = 'shoutCd_' + si;
                    const cdLeft = (e[cdKey] || 0);
                    return '<div style="font-size:11px; margin-top:2px; padding:3px; background:var(--input-bg); border-radius:3px;">' +
                        '<strong>🗣️ ' + escapeHtml(s.name) + '</strong> (КД ' + s.cooldown + ' х.): ' + escapeHtml(s.effect) +
                        '<div style="display:flex; gap:4px; align-items:center; margin-top:2px;">' +
                        '<span>Осталось КД: ' + cdLeft + '</span>' +
                        '<button style="width:auto; padding:1px 6px; font-size:10px;" onclick="useShout(\'' + e.id + '\',' + si + ',' + s.cooldown + ')" ' + (cdLeft > 0 ? 'disabled' : '') + '>Крикнуть</button>' +
                        '</div></div>';
                }).join('') : '';
            return '<div class="enemy-row">' +
                '<div class="row-name"><span class="name-with-avatar"><img class="enemy-avatar" src="' + enemyAvatarData(e) + '" alt=""><span>' + escapeHtml(e.name || '?') + '</span></span>' +
                '<button class="btn-danger" style="width:auto;padding:2px 8px;font-size:11px;" onclick="removeEnemy(\'' + e.id + '\')">Убрать</button></div>' +
                dmgLine + resistLine + spellsLine + shoutsHtml +
                '<div class="grid-2" style="gap:6px; margin-top:4px;">' +
                '<div><label style="font-size:11px;">HP (' + (e.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curHp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:11px;">MP (' + (e.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curMp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curMp\',this.value)"></div>' +
                '</div>' +
                (e.isRaisable && (e.curHp || 0) <= 0
                    ? '<div style="margin-top:4px; padding:4px; background:var(--input-bg); border-radius:3px; font-size:11px;">' +
                      '💀 Труп' + (e.corpseRace ? ' (' + escapeHtml(e.corpseRace) + ', знак «' + escapeHtml(e.corpseSign || '') + '»)' : '') +
                      (e.corpseLoot ? '<button style="width:100%; margin-top:2px;" onclick="lootCorpse(\'' + e.id + '\')">Обыскать (выдать добычу игроку из селектора ниже)</button>' : '<div style="opacity:.6;">Уже обыскан.</div>') +
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
        if (e.weaponDmg) info += `Урон: ${e.weaponDmg}${e.weaponNote ? ' (' + escapeHtml(e.weaponNote) + ')' : ''}<br>`;
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
        const extra = {};
        if (currentEnemyDbPick && currentEnemyDbPick.name === name) {
            if (currentEnemyDbPick.weaponDmg) extra.weaponDmg = currentEnemyDbPick.weaponDmg;
            if (currentEnemyDbPick.weaponNote) extra.weaponNote = currentEnemyDbPick.weaponNote;
            if (Object.keys(currentEnemyDbPick.resist || {}).length) extra.resist = currentEnemyDbPick.resist;
            if ((currentEnemyDbPick.spells || []).length) extra.spells = currentEnemyDbPick.spells;
            if ((currentEnemyDbPick.shouts || []).length) extra.shouts = currentEnemyDbPick.shouts;
        }
        enemies.push(Object.assign({ id: genId('e'), name, maxHp, curHp: maxHp, maxMp, curMp: maxMp }, extra));
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            el('enemy-name-input').value = '';
            el('enemy-db-select').value = '';
            el('enemy-db-info').innerHTML = '';
            currentEnemyDbPick = null;
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
                armor: null, dmg: null, effect: p.effect, slot: null
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

        // Переносим слот/броню/урон/цену, чтобы игрок мог сразу надеть/взять в руки предмет
        // и видеть его цену.
        const extra = {};
        if (sourceItem.slot) extra.slot = sourceItem.slot;
        if (typeof sourceItem.armor === 'number') extra.armorValue = sourceItem.armor;
        if (typeof sourceItem.dmg === 'number') extra.weaponDmg = sourceItem.dmg;
        if (typeof sourceItem.price === 'number') extra.price = sourceItem.price;
        if (typeof sourceItem.capacity === 'number') extra.capacity = sourceItem.capacity;
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
            const sub = r.hasOwnProperty('damage')
                ? `${r.category || ''} · ${r.subcat || ''}`
                : (r.slot === 'jewelry' ? 'Ювелирное' : `${r.armorType || ''} · ${r.slot || ''}`);
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
            el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:12px;">Выбери игрока выше.</p>';
        }
    }

    window.loadPlayerInventoryForGm = function () {
        const uid = el('inv-player-select').value;
        if (!uid) {
            currentInvPlayerUid = null;
            el('inv-gold-block').style.display = 'none';
            el('inv-level-block').style.display = 'none';
            el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:12px;">Выбери игрока выше.</p>';
            return;
        }
        currentInvPlayerUid = uid;
        el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:12px;">Загрузка...</p>';
        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
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
        }).catch(e => {
            el('inv-items-list').innerHTML = '<p style="color:#e74c3c; font-size:12px;">Ошибка загрузки: ' + escapeHtml(e.message) + '</p>';
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
            target.innerHTML = '<p style="opacity:.6; font-size:12px;">Инвентарь пуст.</p>';
            return;
        }
        target.innerHTML = items.map(item => `
            <div class="party-row">
                <div class="row-name">
                    <span><strong>${escapeHtml(item.name)}</strong> × ${item.count}${item.weight ? ` <span style="opacity:.6; font-size:11px;">(вес ${item.weight})</span>` : ''}</span>
                    <button class="btn-danger" style="width:auto; padding:2px 8px; font-size:11px;" onclick="deletePlayerItem('${escapeHtml(item.itemId)}')">Удалить</button>
                </div>
                ${item.effect ? `<div style="font-size:11px; opacity:.75; margin-top:2px;">${escapeHtml(item.effect)}</div>` : ''}
            </div>
        `).join('');
    }

    window.deletePlayerItem = function (itemId) {
        if (!currentInvPlayerUid) return;
        if (!confirm('Удалить этот предмет у игрока?')) return;
        const newInv = currentPlayerInvData.inventory.filter(i => i.itemId !== itemId);
        db.collection('characters').doc(currentInvPlayerUid).update({ inventory: newInv }).then(() => {
            currentPlayerInvData.inventory = newInv;
            renderGmPlayerInventory();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.applyGoldDelta = function (sign) {
        if (!currentInvPlayerUid) return;
        const amount = parseInt(el('inv-gold-delta').value) || 0;
        if (amount <= 0) { alert('Укажи положительную сумму.'); return; }
        const newGold = Math.max(0, currentPlayerInvData.gold + sign * amount);
        db.collection('characters').doc(currentInvPlayerUid).update({ gold: newGold }).then(() => {
            currentPlayerInvData.gold = newGold;
            el('inv-gold-current').textContent = newGold;
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

        if (cat === 'weapon') {
            item.dmg = parseInt(el('ci-damage').value) || 0;
            item.slot = el('ci-weapon-type').value; // 'melee' | 'ranged'
        } else if (cat === 'armor') {
            item.slot = el('ci-armor-slot').value;
            item.armor = parseInt(el('ci-armor-value').value) || 0;
        } else if (cat === 'jewelry') {
            item.slot = el('ci-jewelry-slot').value;
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
    const GM_STATUS_EFFECTS = {
        paralyze: { name: 'Паралич', desc: 'Не может действовать в свой ход.', turns: 1 },
        fear: { name: 'Страх', desc: 'Вынужден отступать/убегать 1 ход.', turns: 1 },
        frenzy: { name: 'Бешенство', desc: 'Атакует ближайшую цель без разбора 1 ход.', turns: 1 },
        slow: { name: 'Замедление', desc: '-10 фт. скорости.', turns: 3 },
        weakened: { name: 'Ослабление', desc: '-2 к броскам атаки/проверок.', turns: 2 }
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

            const p1 = window.alchemyIngredients[ing1].effects, p2 = window.alchemyIngredients[ing2].effects;
            const sharedSet = new Set(p1.filter(e => p2.includes(e)));
            if (ing3 && ing3 !== ing1 && ing3 !== ing2 && window.alchemyIngredients[ing3]) {
                const p3 = window.alchemyIngredients[ing3].effects;
                const firstTwo = new Set([...p1, ...p2]);
                p3.forEach(e => { if (firstTwo.has(e)) sharedSet.add(e); });
            }
            const shared = Array.from(sharedSet);
            if (!shared.length) {
                resultEl.innerHTML = '<span style="color:#e74c3c;">⚠ Нет общих свойств — варево не получится.</span>';
                return;
            }
            let html = '';
            shared.forEach(effName => {
                const info = window.alchemyBaseEffects[effName];
                if (!info) return;
                const magnitude = window.calcAlchemyValue(info.base, skill, perks.alchemistRank, perks.hasProvisor, perks.hasHealer, perks.hasPoisoner, 0, info.polarity, effName);
                const duration = info.hasDuration ? window.calcAlchemyValue(1, skill, perks.alchemistRank, perks.hasProvisor, perks.hasHealer, perks.hasPoisoner, 0, info.polarity, effName) : null;
                html += `<div>🧪 <strong>${escapeHtml(effName)}</strong>: ${magnitude === null ? '' : magnitude}${escapeHtml(info.unit || '')}${duration ? ' на ' + duration + ' ход(ов)' : ''}</div>`;
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

        const sourceItem = itemId ? (gmAllItems || []).find(i => (i.id || i.name) === itemId) : null;
        const itemExtra = {};
        if (sourceItem) {
            if (sourceItem.slot) itemExtra.slot = sourceItem.slot;
            if (typeof sourceItem.armor === 'number') itemExtra.armorValue = sourceItem.armor;
            if (typeof sourceItem.dmg === 'number') itemExtra.weaponDmg = sourceItem.dmg;
            if (typeof sourceItem.price === 'number') itemExtra.price = sourceItem.price;
            if (typeof sourceItem.capacity === 'number') itemExtra.capacity = sourceItem.capacity;
        }

        Promise.all(uids.map(uid =>
            db.collection('characters').doc(uid).get().then(doc => {
                const data = doc.exists ? doc.data() : {};
                const update = {};
                if (gold) update.gold = (parseInt(data.gold) || 0) + gold;
                if (sourceItem) {
                    const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
                    const existing = inv.find(i => i.itemId === itemId);
                    if (existing) {
                        existing.count += itemQty;
                        Object.assign(existing, itemExtra);
                    } else {
                        inv.push(Object.assign({ itemId, name: sourceItem.name, count: itemQty, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemExtra));
                    }
                    update.inventory = inv;
                }
                return db.collection('characters').doc(uid).update(update);
            })
        )).then(() => {
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

    function parseSpellDamageForGm(desc) {
        if (!desc) return null;
        const m = desc.match(/наносящ\w*\s+(\d+)\s*(?:ед\.?\s*)?урон/i) ||
                  desc.match(/наносит\s+(\d+)\s*(?:ед\.?\s*)?урон/i) ||
                  desc.match(/(\d+)\s*(?:ед\.?\s*)?урон/i);
        return m ? parseInt(m[1]) : null;
    }

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

    window.onGmAttackAttackerPicked = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const actionSelect = el('gm-attack-action-select');
        if (!actionSelect) return;
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        if (!enemy) { actionSelect.innerHTML = '<option value="">—</option>'; return; }
        let opts = '';
        if (enemy.weaponDmg) opts += `<option value="weapon">Оружие (${enemy.weaponDmg} урона${enemy.weaponNote ? ' — ' + escapeHtml(enemy.weaponNote) : ''})</option>`;
        (enemy.spells || []).forEach((s, i) => {
            opts += `<option value="spell:${i}">${escapeHtml(s.name)} (${s.dmg} урона / ${s.cost} МП)</option>`;
        });
        (enemy.shouts || []).forEach((s, i) => {
            opts += `<option value="shout:${i}">🗣️ ${escapeHtml(s.name)} (эффект, без прямого урона)</option>`;
        });
        actionSelect.innerHTML = opts || '<option value="">У этого противника нет известных действий — впиши урон вручную в журнал</option>';
    };

    window.rollGmAttack = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const targetUid = el('gm-attack-target-select').value;
        const actionVal = el('gm-attack-action-select').value;
        const resultBox = el('gm-attack-roll-result');
        const textEl = el('gm-attack-roll-text');
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        const targetName = (lastData.participants[targetUid] || {}).name || targetUid;
        if (!enemy || !targetUid || !actionVal) { alert('Выбери атакующего, цель и действие.'); return; }

        let dmg = 0, dmgType = 'physical', actionLabel = '';
        if (actionVal === 'weapon') {
            dmg = enemy.weaponDmg || 0;
            actionLabel = 'оружием';
        } else if (actionVal.indexOf('spell:') === 0) {
            const s = enemy.spells[parseInt(actionVal.slice(6))];
            dmg = s ? s.dmg : 0;
            dmgType = mapEnemyDmgType(s ? s.name : '');
            actionLabel = `заклинанием «${s ? s.name : '?'}»`;
        } else if (actionVal.indexOf('shout:') === 0) {
            const s = enemy.shouts[parseInt(actionVal.slice(6))];
            dmg = 0;
            actionLabel = `криком «${s ? s.name : '?'}» (${s ? s.effect : ''})`;
        }
        const roll = Math.floor(Math.random() * 20) + 1;
        const statusKey = el('gm-attack-status-select') ? el('gm-attack-status-select').value : '';

        pendingGmAttack = {
            targetUid, dmg, dmgType, statusKey, enemyName: enemy.name, targetName,
            logTextBase: `👹 ${enemy.name} атакует ${targetName} ${actionLabel}: к20=${roll}`
        };
        textEl.innerHTML = `<strong>${escapeHtml(enemy.name)}</strong> атакует <strong>${escapeHtml(targetName)}</strong> ${actionLabel}<br>` +
            `Бросок: 1d20 = <strong style="color:var(--accent-color, #c9a86c);">${roll}</strong><br>` +
            (dmg ? `Базовый урон: <span style="color:#e74c3c; font-size:15px; font-weight:bold;">${dmg}</span> ед. (резист цели вычтется автоматически при применении)` : '<span style="opacity:.7;">Эффект без прямого урона — примени вручную по описанию.</span>');
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
            const finalDmg = dmg ? Math.max(0, Math.round(dmg * (1 - resist / 100))) : 0;
            let logExtra = '', newHp;
            const chores = [];
            if (dmg) {
                const vitals = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
                newHp = Math.max(0, (parseInt(vitals[0]) || 0) - finalDmg);
                vitals[0] = newHp;
                chores.push(db.collection('characters').doc(targetUid).update({ vitals }));
                logExtra += `, урон ${finalDmg}${resist ? ` (резист ${resist}%, было бы ${dmg})` : ''}`;
            }
            if (statusKey) {
                // Статус-эффект пишется В СЕССИЮ (не в документ персонажа) — у игрока нет
                // живого листенера на свой собственный документ, а на сессию есть, так что
                // так эффект долетит до него сразу, без перезагрузки страницы.
                const statusDef = GM_STATUS_EFFECTS[statusKey];
                const patch = {};
                patch['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                    name: pendingGmAttack.enemyName, effectName: statusDef.name, description: statusDef.desc, turnsRemaining: statusDef.turns
                });
                chores.push(db.collection('sessions').doc(currentCode).update(patch));
                logExtra += `, наложен статус «${statusDef.name}» (${statusDef.turns} х.)`;
            }
            return Promise.all(chores).then(() => ({ newHp, logExtra }));
        }).then(({ newHp, logExtra }) => {
            const chain = newHp !== undefined
                ? db.collection('sessions').doc(currentCode).update({ ['participants.' + targetUid + '.curHp']: newHp })
                : Promise.resolve();
            return chain.then(() => logExtra);
        }).then(logExtra => {
            gmPostLogEntryText(logTextBase + logExtra + '.');
            alert('Применено.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Генератор лута сундуков ----------

    const LOOT_TIERS = {
        poor: { label: 'Бедный', gold: [5, 40], priceMin: 1, priceMax: 30, itemCount: [1, 2] },
        common: { label: 'Обычный', gold: [30, 150], priceMin: 20, priceMax: 150, itemCount: [2, 3] },
        rich: { label: 'Богатый', gold: [150, 600], priceMin: 100, priceMax: 800, itemCount: [2, 4] },
        legendary: { label: 'Легендарный', gold: [500, 2000], priceMin: 500, priceMax: 6935, itemCount: [1, 3] }
    };
    const LOOT_EXCLUDE_CATEGORIES = ['Ингредиенты для алхимии', 'Кузнечные ингредиенты', 'Шкуры', 'Двемерские детали'];

    let lastGeneratedLoot = null;

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    window.generateChestLoot = function () {
        const tierKey = el('loot-tier-select').value;
        const tier = LOOT_TIERS[tierKey];
        const resultEl = el('loot-gen-result');
        const pool = (gmAllItems || []).filter(i =>
            typeof i.price === 'number' && i.price >= tier.priceMin && i.price <= tier.priceMax &&
            !LOOT_EXCLUDE_CATEGORIES.includes(i.category)
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
        lastGeneratedLoot = { tier: tier.label, gold, items };

        let html = `<strong>${tier.label} сундук:</strong><br>💰 ${gold} септимов<br>`;
        items.forEach(it => { html += `• ${escapeHtml(it.name)} (${escapeHtml(it.category || '')}, ${it.price} септимов)<br>`; });
        resultEl.innerHTML = html;
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
                if (existing) { existing.count += 1; Object.assign(existing, extra); }
                else inv.push(Object.assign({ itemId, name: it.name, count: 1, weight: it.weight || 0, category: it.category || '', effect: it.effect || '' }, extra));
            });
            const newGold = (parseInt(data.gold) || 0) + lastGeneratedLoot.gold;
            return db.collection('characters').doc(targetUid).update({ inventory: inv, gold: newGold });
        }).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            alert(`Лут (${lastGeneratedLoot.tier} сундук) выдан игроку ${pname}.`);
            gmPostLogEntryText(`📦 ${pname} нашёл(а) ${lastGeneratedLoot.tier.toLowerCase()} сундук: ${lastGeneratedLoot.gold} золота + ${lastGeneratedLoot.items.map(i => i.name).join(', ')}.`);
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
    const BANDIT_WEAPON_MATERIAL = /^(Железн|Кожан|Стальн)/i;
    const BANDIT_ARMOR_SLOT_MAP = { 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' };

    function getBanditGearPool() {
        const weapons = (window.weaponRecipes || []).filter(w => BANDIT_WEAPON_MATERIAL.test(w.name));
        const armors = (window.armorRecipes || []).filter(a => BANDIT_WEAPON_MATERIAL.test(a.name));
        return { weapons, armors };
    }

    let lastGeneratedBandit = null;

    window.generateBandit = function () {
        const resultEl = el('bandit-gen-result');
        const pool = getBanditGearPool();
        if (!pool.weapons.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных об оружии — проверь, что smithing-data.js подключён.</span>'; return; }

        const race = BANDIT_RACES[Math.floor(Math.random() * BANDIT_RACES.length)];
        const sign = BANDIT_SIGNS[Math.floor(Math.random() * BANDIT_SIGNS.length)];
        const god = BANDIT_GODS[Math.floor(Math.random() * BANDIT_GODS.length)];
        const weapon = pool.weapons[Math.floor(Math.random() * pool.weapons.length)];

        const slots = { helmet: null, chest: null, gloves: null, boots: null, shield: null };
        const bySlot = {};
        pool.armors.forEach(a => {
            const key = BANDIT_ARMOR_SLOT_MAP[a.slot];
            if (!key) return;
            (bySlot[key] = bySlot[key] || []).push(a);
        });
        let totalArmor = 0;
        Object.keys(slots).forEach(key => {
            if (key === 'shield' && Math.random() > 0.3) return;
            if (key !== 'shield' && Math.random() > 0.7) return;
            const options = bySlot[key];
            if (options && options.length) {
                const picked = options[Math.floor(Math.random() * options.length)];
                slots[key] = picked;
                totalArmor += picked.resistance || 0;
            }
        });

        const gold = randInt(5, 80);
        const hasTrinket = Math.random() < 0.3;
        const trinketPool = (gmAllItems || []).filter(i => i.category === 'Ювелирное изделие' || (i.slot === 'ring' || i.slot === 'amulet'));
        const trinket = hasTrinket && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;

        const hp = randInt(40, 90);

        const lootItems = [{ name: weapon.name, price: weapon.price || 0, weight: weapon.weight, dmg: weapon.damage, slot: weapon.slot, category: 'Оружие (с трупа)' }];
        Object.values(slots).forEach(a => { if (a) lootItems.push({ name: a.name, price: a.price || 0, weight: a.weight, armor: a.resistance, slot: BANDIT_ARMOR_SLOT_MAP[a.slot], category: 'Броня (с трупа)' }); });
        if (trinket) lootItems.push({ name: trinket.name, price: trinket.price || 0, weight: trinket.weight, slot: trinket.slot, category: 'Ювелирное изделие (с трупа)' });

        lastGeneratedBandit = {
            name: 'Бандит', race, sign, god: god.name, hp, weaponDmg: weapon.damage, weaponNote: weapon.name,
            armor: totalArmor, gold, lootItems, isRaisable: true
        };

        let html = `<strong>${race}, знак «${sign}»${god.name !== '— без веры —' ? ', поклоняется ' + god.name : ''}</strong><br>`;
        if (god.blessing) html += `<span style="opacity:.75;">Благословение: ${escapeHtml(god.blessing)}</span><br>`;
        html += `ХП: ${hp} · Оружие: ${escapeHtml(weapon.name)} (${weapon.damage} урона) · Броня: ${totalArmor}<br>`;
        html += `Лут: 💰${gold}` + lootItems.map(l => ', ' + l.name).join('') + '';
        resultEl.innerHTML = html;
    };

    window.addGeneratedBanditToCombat = function () {
        if (!lastGeneratedBandit) { alert('Сначала сгенерируй бандита.'); return; }
        const b = lastGeneratedBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push({
            id: genId('e'), name: b.name + ' (' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: 0, curMp: 0,
            weaponDmg: b.weaponDmg, weaponNote: b.weaponNote, resist: {},
            isRaisable: true, corpseLoot: { gold: b.gold, items: b.lootItems }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        });
        db.collection('sessions').doc(currentCode).update({ enemies }).then(() => {
            lastGeneratedBandit = null;
            el('bandit-gen-result').innerHTML = '';
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
    const WEATHER_LABELS = {
        clear: '☀️ Ясно', cloudy: '☁️ Облачно', rain: '🌧️ Дождь', storm: '⛈️ Гроза',
        snow: '🌨️ Снегопад', blizzard: '🌬️ Метель', fog: '🌫️ Туман'
    };

    let pendingWeatherKey = null;

    window.rollWeatherForRegion = function () {
        const region = el('weather-region-select').value;
        const pool = REGION_WEATHER_POOL[region] || ['clear'];
        pendingWeatherKey = pool[Math.floor(Math.random() * pool.length)];
        el('weather-gm-result').innerHTML = `Выпало: <strong>${WEATHER_LABELS[pendingWeatherKey]}</strong> — жми «Применить», чтобы сообщить игрокам.`;
    };

    window.setSessionTimeWeather = function () {
        const region = el('weather-region-select').value;
        const period = el('weather-time-select').value;
        const weatherKey = pendingWeatherKey || 'clear';
        db.collection('sessions').doc(currentCode).update({
            currentRegion: region, timePeriod: period, currentWeather: weatherKey
        }).then(() => {
            el('weather-gm-result').innerHTML = `<span style="color:#2ecc71;">✅ Применено: ${period}, ${region}, ${WEATHER_LABELS[weatherKey]}.</span>`;
            gmPostLogEntryText(`🌤️ ${period}, ${region}: ${WEATHER_LABELS[weatherKey]}.`);
            pendingWeatherKey = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

})();
