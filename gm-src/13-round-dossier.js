
    // ============================================================================
    // 13: Сводка круга, досье героя, часы событий, шпаргалка (идеи для мастера 2026-11-12)
    // ============================================================================

    // ---------- 1. Сводка круга: все участники боя в одном списке ----------
    const GM_STATUS_ICON = { 'Паралич': '⚡', 'Страх': '😱', 'Бегство': '🏃', 'Оглушение': '💫', 'Заморожен': '🧊', 'Ярость': '😡', 'Бешенство': '😡' };
    function gmChip(txt, color) { return '<span style="display:inline-block; font-size:11px; padding:0 6px; margin:1px 2px 1px 0; border-radius:8px; border:1px solid ' + (color || '#8a7a55') + '; color:' + (color || 'inherit') + ';">' + escapeHtml(txt) + '</span>'; }
    function gmRoundRows() {
        const d = lastData || {};
        const rows = [];
        const grid = d.grid || null;
        const GC = window.GridCore;
        Object.entries(d.participants || {}).forEach(([uid, p]) => {
            if (!p) return;
            rows.push({ kind: 'p', ref: uid, name: p.name || 'Игрок', icon: '🧑', hp: p.fallen ? 0 : (p.curHp || 0), maxHp: p.maxHp || 0, mp: p.curMp || 0, maxMp: p.maxMp || 0, dead: !!p.fallen, chips: [] , tok: GC && grid ? GC.tokenOf(grid, 'p', uid) : null });
            (p.summons || []).forEach(s => rows.push({ kind: 's', ref: s.id, owner: uid, name: s.name, icon: '👻', hp: s.curHp || 0, maxHp: s.maxHp || 0, mp: 0, maxMp: 0, dead: (s.curHp || 0) <= 0, chips: [], tok: GC && grid ? GC.tokenOf(grid, 's', s.id, uid) : null }));
            (p.pets || []).forEach(pt => rows.push({ kind: 's', ref: pt.id, owner: uid, name: pt.name, icon: pt.icon || '🐾', hp: pt.hp || 0, maxHp: pt.maxHp || 0, mp: 0, maxMp: 0, dead: (pt.hp || 0) <= 0, chips: [], tok: GC && grid ? GC.tokenOf(grid, 's', pt.id, uid) : null }));
        });
        (d.enemies || []).forEach(e => {
            const chips = (e.statusEffects || []).map(s => ({ t: (GM_STATUS_ICON[s.name] || '🌀') + ' ' + s.name + (s.turns ? ' ' + s.turns : ''), c: '#c9986c' }));
            if (e.soulTrap) chips.push({ t: '🔮 душа в ловушке', c: '#9b6fd0' });
            rows.push({ kind: 'e', ref: e.id, name: e.name, icon: '💀', hp: e.curHp || 0, maxHp: e.maxHp || 0, mp: e.curMp || 0, maxMp: e.maxMp || 0, dead: (e.curHp || 0) <= 0, chips, tok: GC && grid ? GC.tokenOf(grid, 'e', e.id) : null });
        });
        // порядок ходов мастера главнее: сначала те, кого он расставил (по имени), потом остальные
        const order = (d.turnOrder || []).map(t => String(t.name || '').toLowerCase());
        rows.forEach((r, i) => { const k = order.indexOf(String(r.name).toLowerCase()); r._ord = k === -1 ? 1000 + i : k; });
        rows.sort((a, b) => a._ord - b._ord);
        // расстояние до ближайшего врага для своих и до ближайшего своего для врагов
        rows.forEach(r => {
            if (!r.tok || !GC) return;
            let best = null;
            rows.forEach(o => { if (o === r || !o.tok || o.dead) return; if ((o.kind === 'e') === (r.kind === 'e')) return; const ft = GC.feet(r.tok, o.tok); if (best === null || ft < best) best = ft; });
            if (best !== null) r.near = best;
        });
        return rows;
    }
    function gmRenderRoundSummary() {
        const box = el('gm-round-summary'); if (!box) return;
        const d = lastData || {};
        const rows = gmRoundRows();
        if (!rows.length) { box.innerHTML = '<p style="opacity:.7; font-size:14px;">В сессии пока нет участников.</p>'; return; }
        const turn = parseInt(d.sessionTurnCounter) || 0, round = parseInt(d.sessionRoundCounter) || 0;
        const alive = rows.filter(r => !r.dead);
        const foes = alive.filter(r => r.kind === 'e').length, friends = alive.length - foes;
        let diff = '';
        if (window.EnemyRanks && gmPartyForDifficulty) {
            const dd = window.EnemyRanks.difficulty(gmPartyForDifficulty(), d.enemies || []);
            if (dd) diff = gmDifficultyLine(dd, '⚖️ ') + (dd.advice ? '<div style="font-size:12px; color:' + dd.level.color + ';">' + escapeHtml(dd.advice) + '</div>' : '');
        }
        const dueHtml = gmClocksDue().map(c => '<div style="background:#4a1e1a; border:1px solid #e05a4f; border-radius:4px; padding:3px 8px; margin-bottom:4px; font-size:13px;">⏰ <b>' + escapeHtml(c.title) + '</b>' + (c.effect ? ' — ' + escapeHtml(c.effect) : '') + '</div>').join('');
        box.innerHTML = dueHtml +
            '<div style="font-size:13px; opacity:.85; margin-bottom:4px;">Круг <b>' + round + '</b> · ход <b>' + turn + '</b> · живых: наших ' + friends + ', врагов ' + foes + '</div>' +
            (diff ? '<div style="margin-bottom:6px;">' + diff + '</div>' : '') +
            rows.map(r => {
                const pct = Math.max(0, Math.min(100, r.maxHp ? r.hp / r.maxHp * 100 : 0));
                const col = r.kind === 'e' ? '#c0392b' : '#27ae60';
                const low = !r.dead && pct <= 25;
                return '<div style="display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid rgba(160,140,100,.25);' + (r.dead ? 'opacity:.45;' : '') + '">' +
                    '<span style="width:20px; text-align:center;">' + escapeHtml(String(r.icon)) + '</span>' +
                    '<span style="flex:0 0 28%; min-width:90px; font-size:13px; font-weight:bold;' + (r.dead ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(r.name) + '</span>' +
                    '<span style="flex:1;"><span class="bar-track" style="display:block; margin:0;"><span style="display:block; height:100%; width:' + pct + '%; background:' + col + ';"></span></span>' +
                    '<span style="font-size:11px; opacity:.8;">' + r.hp + '/' + r.maxHp + (r.maxMp ? ' · MP ' + r.mp + '/' + r.maxMp : '') + (low ? ' · <b style="color:#e05a4f;">на исходе</b>' : '') + (r.dead ? ' · ' + (r.kind === 'p' ? 'пал' : 'мёртв') : '') + '</span>' +
                    (r.chips.length ? '<span style="display:block;">' + r.chips.map(c => gmChip(c.t, c.c)).join('') + '</span>' : '') + '</span>' +
                    '<span style="flex:0 0 52px; text-align:right; font-size:11px; opacity:.8;">' + (r.near != null ? r.near + ' фт' : '') + '</span></div>';
            }).join('') +
            '<div style="font-size:11px; opacity:.6; margin-top:4px;">Расстояние — до ближайшего противника (для врагов — до ближайшего из наших), только если оба стоят на сетке.</div>';
    }
    window.gmRenderRoundSummary = gmRenderRoundSummary;

    // ---------- 2. Часы событий (хранятся в браузере мастера вместе с узлами сюжета) ----------
    function gmClocksGet() { const p = lsGet(PLOT_KEY, null); return (p && Array.isArray(p.clocks)) ? p.clocks : []; }
    function gmClocksSave(list) { const p = lsGet(PLOT_KEY, null) || { nodes: [] }; if (!Array.isArray(p.nodes)) p.nodes = []; p.clocks = list; lsSet(PLOT_KEY, p); }
    function gmDayNow() { return parseInt((lastData || {}).gameDayCounter) || 0; }
    function gmClocksDue() { const day = gmDayNow(); return gmClocksGet().filter(c => !c.done && day >= c.dueDay); }
    function gmRenderClocks() {
        const box = el('gm-clocks-list'); if (!box) return;
        const day = gmDayNow();
        const list = gmClocksGet().slice().sort((a, b) => (a.done - b.done) || (a.dueDay - b.dueDay));
        box.innerHTML = list.length ? list.map(c => {
            const left = c.dueDay - day;
            const state = c.done ? '<span style="opacity:.6;">сработало</span>' : (left <= 0 ? '<b style="color:#e05a4f;">пора! (просрочено на ' + (-left) + ' дн.)</b>' : 'через <b>' + left + '</b> дн.');
            return '<div style="display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid rgba(160,140,100,.25);' + (c.done ? 'opacity:.55;' : '') + '">' +
                '<div style="flex:1; font-size:13px;"><b>' + escapeHtml(c.title) + '</b>' + (c.effect ? '<div style="font-size:12px; opacity:.8;">Что случится: ' + escapeHtml(c.effect) + '</div>' : '') + '<div style="font-size:12px;">' + state + ' <span style="opacity:.55;">(день ' + c.dueDay + ')</span></div></div>' +
                (c.done ? '' : '<button type="button" style="width:auto; margin:0; padding:2px 8px; font-size:12px;" onclick="gmClockDone(\'' + jsq(c.id) + '\')">✔ Сработало</button>') +
                '<button type="button" class="btn-danger" style="width:auto; margin:0; padding:2px 7px; font-size:12px;" onclick="gmClockDelete(\'' + jsq(c.id) + '\')">🗑</button></div>';
        }).join('') : '<p style="opacity:.7; font-size:13px;">Часов нет. Добавь: «если герои не успеют — случится…».</p>';
        const dayEl = el('gm-clocks-day'); if (dayEl) dayEl.textContent = day;
    }
    window.gmClockAdd = function () {
        const t = el('gm-clock-title').value.trim(); if (!t) return;
        const days = Math.max(0, parseInt(el('gm-clock-days').value) || 0);
        const list = gmClocksGet();
        list.push({ id: 'clk' + Date.now().toString(36) + Math.floor(Math.random() * 99), title: t, effect: el('gm-clock-effect').value.trim(), dueDay: gmDayNow() + days, done: false });
        gmClocksSave(list); el('gm-clock-title').value = ''; el('gm-clock-effect').value = '';
        gmRenderClocks(); gmRenderRoundSummary();
    };
    window.gmClockDone = function (id) { const l = gmClocksGet(); const c = l.find(x => x.id === id); if (c) { c.done = true; gmClocksSave(l); gmRenderClocks(); gmRenderRoundSummary(); } };
    window.gmClockDelete = function (id) { gmClocksSave(gmClocksGet().filter(x => x.id !== id)); gmRenderClocks(); gmRenderRoundSummary(); };

    // ---------- 3. Досье героя ----------
    const GM_RACES = { nord: 'Норд', altmer: 'Альтмер', breton: 'Бретон', orc: 'Орк', khajiit: 'Каджит', redguard: 'Редгард', argonian: 'Аргонианин', bosmer: 'Босмер', dunmer: 'Данмер', imperial: 'Имперец' };
    const GM_SIGNS = { warrior: 'Воин', mage: 'Маг', thief: 'Вор', atronach: 'Атронах', apprentice: 'Ученик', steed: 'Конь', lady: 'Леди', lord: 'Лорд', zmey: 'Змей', ritual: 'Ритуал', lover: 'Любовник', shadow: 'Тень', tower: 'Башня' };
    const GM_GODS = { none: 'без веры', zenithar: 'Зенитар', stendarr: 'Стендарр', julianos: 'Джулианос', mara: 'Мара', dibella: 'Дибелла', kynareth: 'Кинарет', arkay: 'Аркей', talos: 'Талос', akatosh: 'Акатош', boethiah: 'Боэтия', mephala: 'Мефала', peryite: 'Периайт', hermaeus: 'Хермеус Мора', nocturnal: 'Ноктюрнал', malacath: 'Малакат', azura: 'Азура', meridia: 'Меридия', mehrunes: 'Мерунес Дагон', sanguine: 'Сангвин', namira: 'Намира', vaermina: 'Вермина', sheogorath: 'Шеогорат', clavicus: 'Клавикус Вайл', molag: 'Молаг Бал', hircine: 'Хирсин', ideal: 'Идеальные Повелители' };
    function gmDossierFill() {
        const sel = el('gm-dossier-select'); if (!sel) return;
        const cur = sel.value;
        const opts = Object.entries((lastData || {}).participants || {}).map(([uid, p]) => '<option value="' + escapeHtml(uid) + '">' + escapeHtml((p && p.name) || uid) + '</option>').join('');
        const html = '<option value="">— выбери героя —</option>' + opts;
        if (sel._html !== html) { sel._html = html; sel.innerHTML = html; if (cur) sel.value = cur; }
    }
    window.gmDossierLoad = function () {
        const uid = (el('gm-dossier-select') || {}).value, box = el('gm-dossier-body');
        if (!box) return;
        if (!uid) { box.innerHTML = ''; return; }
        box.innerHTML = '<p style="opacity:.6; font-size:13px;">Загрузка…</p>';
        db.collection('characters').doc(uid).get().then(doc => {
            if (!doc.exists) { box.innerHTML = '<p style="color:#e74c3c;">Лист не найден.</p>'; return; }
            box.innerHTML = gmDossierHtml(doc.data() || {}, ((lastData || {}).participants || {})[uid] || {});
        }).catch(e => { box.innerHTML = '<p style="color:#e74c3c;">Не удалось загрузить: ' + escapeHtml(e.message || e) + '</p>'; });
    };
    function gmDossierHtml(c, p) {
        const row = (k, v) => v === '' || v == null ? '' : '<div style="display:flex; gap:8px; font-size:13px; padding:1px 0;"><span style="flex:0 0 118px; opacity:.65;">' + k + '</span><span style="flex:1;">' + v + '</span></div>';
        const st = c.effectiveStats || {};
        const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k, i) => ['Сил', 'Лов', 'Тел', 'Инт', 'Муд', 'Хар'][i] + ' ' + (st[k] != null ? st[k] : '?')).join(' · ');
        const sk = (Array.isArray(c.effectiveSkills) ? c.effectiveSkills : []).map((v, i) => ({ n: SKILL_NAMES_BY_IDX[i] || ('навык ' + i), v: Number(v) || 0 })).sort((a, b) => b.v - a.v).slice(0, 6).map(x => escapeHtml(x.n) + ' ' + x.v).join(', ');
        const vit = Array.isArray(c.vitals) ? 'ХП ' + c.vitals[0] + '/' + c.vitals[2] + ' · МП ' + c.vitals[1] + '/' + c.vitals[3] : '';
        const res = c.resistances ? Object.entries(c.resistances).filter(([k, v]) => v && typeof v === 'number').map(([k, v]) => ({ physical: 'физ.', fire: 'огонь', frost: 'холод', shock: 'эл.', poison: 'яд', disease: 'болезни', magic: 'магия', shout: 'крики', arrow: 'стрелы' }[k] || k) + ' ' + v + '%').join(', ') : '';
        const perks = c.takenPerks ? (Array.isArray(c.takenPerks) ? c.takenPerks.length + ' шт.' : Object.keys(c.takenPerks).length + ' навыков') : '';
        const ss = c.supernaturalState || {};
        const branches = [];
        if (ss.vampirism || (ss.vampire && ss.vampire.isVampire)) branches.push('🧛 вампир' + (ss.vampire && ss.vampire.hungerStage != null ? ' (голод ' + ss.vampire.hungerStage + '/4)' : ''));
        if (ss.lycanthropy) branches.push('🐺 оборотень' + (ss.werewolf && ss.werewolf.heartsEaten ? ' (сердец ' + ss.werewolf.heartsEaten + ')' : ''));
        if (ss.lich && (ss.lich.stage || ss.lich.perks)) branches.push('💀 лич');
        if (c.paladin && (c.paladin.vow || (c.paladin.perks && Object.values(c.paladin.perks).some(Boolean)))) branches.push('☀️ паладин' + (c.paladin.fallen ? ' (пал)' : ''));
        if (ss.faithShift) branches.push('вера сменена');
        const crime = c.crimeState && c.crimeState.bounties ? Object.entries(c.crimeState.bounties).map(([h, v]) => escapeHtml(h) + ' ' + ((v && v.amount) || 0)).join(', ') : '';
        const quests = (Array.isArray(c.playerQuests) ? c.playerQuests : []).filter(q => q && q.status === 'active').map(q => escapeHtml(q.title)).join('; ');
        const eff = (Array.isArray(c.activeTimedEffects) ? c.activeTimedEffects : []).slice(0, 8).map(e => escapeHtml(e.effectName || e.name || '?')).join(', ');
        const gear = [c.wepMName && ('ближний: ' + c.wepMName + (c.wepMDmg ? ' ' + c.wepMDmg : '')), c.wepRName && ('дальний: ' + c.wepRName + (c.wepRDmg ? ' ' + c.wepRDmg : '')), c.sChest, c.sShield && ('щит: ' + c.sShield)].filter(Boolean).map(escapeHtml).join(' · ');
        const diary = (Array.isArray(c.diary) ? c.diary : []).slice(-3).map(d => escapeHtml(String(d.text || d.title || '').slice(0, 120))).filter(Boolean).join('<br>');
        return '<div style="border:1px solid var(--border-color); border-radius:6px; padding:8px 10px;">' +
            '<div style="font-size:16px; font-weight:bold; margin-bottom:4px;">' + escapeHtml(c.name || p.name || 'Без имени') + ' <span style="opacity:.7; font-weight:normal; font-size:13px;">· ур. ' + (c.characterLevel || p.level || 1) + '</span></div>' +
            row('Происхождение', escapeHtml((GM_RACES[c.race] || c.race || '?') + ', знак: ' + (GM_SIGNS[c.sign] || (c.sign === 'none' ? 'не выбран' : c.sign || '?')))) +
            row('Вера', escapeHtml((GM_GODS[c.faithGod] || c.faithGod || 'без веры') + (c.faithGod && c.faithGod !== 'none' ? ', ранг ' + (c.faithRank || 1) : ''))) +
            row('Ветви', branches.join(' · ') || '') +
            row('Жизнь', escapeHtml(vit) + (c.deathState && c.deathState.fallen ? ' · <b style="color:#e05a4f;">ПАЛ</b>' : '') + ' · жизней: ' + (c.lives != null ? escapeHtml(String(c.lives)) : '?') + (c.deathState && c.deathState.deaths ? ' · смертей ' + c.deathState.deaths : '')) +
            row('Характеристики', stats) + row('Лучшие навыки', sk) + row('Перки', perks) + row('Защита', escapeHtml(res)) +
            row('Снаряжение', gear) + row('Золото', formatNumber(parseInt(c.gold) || 0) + ' · голодает дней: ' + (parseInt(c.daysWithoutFood) || 0)) +
            row('Розыск', crime ? '<span style="color:#e8a25a;">' + crime + '</span>' : '') +
            row('Активные задания', quests) + row('Эффекты', eff) + row('Дневник', diary) + row('Предыстория', escapeHtml(String(c.backstory || '').slice(0, 300))) +
            '</div>';
    }

    // ---------- обновление при каждом снимке сессии ----------
    function gmRoundDossierRefresh() {
        try { gmRenderRoundSummary(); } catch (e) { console.error(e); }
        try { gmRenderClocks(); } catch (e) { console.error(e); }
        try { gmDossierFill(); } catch (e) { console.error(e); }
    }
    window.gmRoundDossierRefresh = gmRoundDossierRefresh;
