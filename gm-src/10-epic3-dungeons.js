

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
