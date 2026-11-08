
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
            try { const u = document.getElementById('gm-my-uid'); if (u) u.textContent = user.uid; } catch (e) { }
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
        gmDropKickedParticipants(lastData);
        try { rumOnSnapshot(lastData); } catch (e) { console.error(e); }
        try { gmMaintainSession(lastData); } catch (e) { console.error(e); }
        try { gmWeatherDayWatch(lastData); } catch (e) { console.error(e); }
        try { gmJailDayWatch(lastData); } catch (e) { console.error(e); }
        try { gmWantedWatch(lastData); } catch (e) { console.error(e); }
        try { gmNotifyWatch(lastData); } catch (e) { console.error(e); }
        try { gmEnemyTickWatch(lastData); } catch (e) { console.error(e); }
        try { if (window.GmGrid) window.GmGrid.onSnapshot(lastData); } catch (e) { console.error(e); }
        try { renderMuseumRequests(); renderQuestClaims(); renderPlayerLimits(); } catch (e) { console.error(e); }
        try { renderTheftCases(); } catch (e) { console.error(e); }
        try { renderEstates(); } catch (e) { console.error(e); }
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
