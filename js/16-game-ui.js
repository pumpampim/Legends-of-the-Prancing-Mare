/* ===== Игровой интерфейс для телефона, этапы 1–3 (2026-10-30) =====
   Только на ширине ≤900px: пять вкладок снизу — Герой · Бой · Сумка · Магия · Ещё. Разделы и их «пилюли»
   описаны в window.stNavGroups (index.html). Служебное (аккаунт, шрифт, звук, поиск, сброс, файлы, Drive,
   снапшоты) на телефоне переезжает в «Ещё → Настройки», на компьютере возвращается на старые места.
   Компьютерная версия остаётся прежней (компас, верхняя строка); менять её — только по согласию Никиты.
   Старые вкладки и все обработчики не тронуты: кнопки нижней панели просто нажимают скрытые .tab-link,
   а служебные элементы переносятся в окно настроек целиком, вместе со своими onclick. */
(function () {
    var NS = 'http://www.w3.org/2000/svg';
    // Иконки нарисованы вручную в духе северной гравюры: золотой контур, без заливки.
    var ICONS = {
        hero: '<path d="M5 13c0-4 3-7 7-7s7 3 7 7v3H5z"/><path d="M5 13c-2-1-3-4-2-7 1 2 2 3 4 4"/><path d="M19 13c2-1 3-4 2-7-1 2-2 3-4 4"/><path d="M12 6v10"/><path d="M8 16v3h8v-3"/>',
        fight: '<path d="M4 4l10 10"/><path d="M4 4h3l9 9"/><path d="M20 4L10 14"/><path d="M20 4h-3l-9 9"/><path d="M12 17l-3 3M6 14l-2 2 4 4 2-2"/><path d="M12 17l3 3M18 14l2 2-4 4-2-2"/>',
        bag: '<path d="M6 9h12l1 11H5z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M6 12h12"/><path d="M11 12v3h2v-3"/>',
        magic: '<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/><path d="M5 20h14"/><path d="M7 17l-2-1M17 17l2-1"/>',
        more: '<path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M7 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2z"/><path d="M7 20a2 2 0 0 1-2-2v-1h4v1a2 2 0 0 1-2 2z"/><path d="M10 9h6M10 12h6M10 15h4"/>',
        gold: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v4c0 1.7 3.1 3 7 3s7-1.3 7-3V8"/><path d="M5 12v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
        armor: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M12 7v10"/>',
        speed: '<path d="M7 20c2-1 3-3 3-6l3-2 2 3h3"/><path d="M10 14l-3-1-2 2"/><circle cx="14" cy="5" r="2"/><path d="M13 8l-3 2v4"/>',
        weight: '<path d="M6 9h12l2 11H4z"/><path d="M9 9a3 3 0 0 1 6 0"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
        craft: '<path d="M4 20l9-9"/><path d="M12 4l8 8-3 3-8-8z"/>',
        map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
        calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M4 9h16M8 3v4M16 3v4"/>',
        diary: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>'
    };
    function icon(name, cls) { return '<svg class="' + (cls || 'st-ico') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'; }
    window.stIcon = icon;

    var TABS = [
        { g: 'hero', label: 'Герой' },
        { g: 'fight', label: 'Бой' },
        { g: 'bag', label: 'Сумка' },
        { g: 'magic', label: 'Магия' },
        { g: 'more', label: 'Ещё' }
    ];
    var MORE = [
        { tab: 'tab7', label: 'Профессии', icon: 'craft' },
        { tab: 'tab13', label: 'Карта', icon: 'map' },
        { tab: 'tab11', label: 'Календарь', icon: 'calendar' },
        { tab: 'tab14', label: 'Дневник', icon: 'diary' },
        { settings: true, label: 'Настройки', icon: 'gear' }
    ];
    function tabBtn(tabId) { return document.querySelector('.nav-tabs .tab-link[onclick*="\'' + tabId + '\'"]'); }
    function goTab(tabId) { var b = tabBtn(tabId); if (b) b.click(); try { window.scrollTo({ top: 0 }); } catch (e) { window.scrollTo(0, 0); } }
    function el(id) { return document.getElementById(id); }
    function num(id) { var e = el(id); if (!e) return 0; var v = (e.value !== undefined && e.tagName === 'INPUT') ? e.value : e.textContent; return parseFloat(String(v).replace(',', '.')) || 0; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    var container = document.querySelector('.container');
    var mqMobile = window.matchMedia('(max-width: 900px)');

    // ---------- нижние вкладки ----------
    var bar = document.createElement('nav');
    bar.id = 'st-tabbar'; bar.className = 'st-tabbar'; bar.setAttribute('aria-label', 'Разделы');
    bar.innerHTML = TABS.map(function (t) {
        return '<button type="button" class="st-tb" data-g="' + t.g + '">' + icon(t.g, 'st-tb-ico') + '<span>' + t.label + '</span><i class="st-tb-dot" hidden></i></button>';
    }).join('');
    document.body.appendChild(bar);
    function setBarH() { document.body.style.setProperty('--st-tabbar-h', (mqMobile.matches ? bar.offsetHeight : 0) + 'px'); }
    window.addEventListener('resize', setBarH);

    bar.addEventListener('click', function (e) {
        var b = e.target.closest('.st-tb'); if (!b) return;
        var g = b.getAttribute('data-g');
        if (g === 'more') { openMore(); return; }
        closeSheets();
        goTab(window.stNavLast ? window.stNavLast(g) : (window.stNavGroups[g].tabs[0]));
    });

    var curGroup = 'hero';
    window.stGameUiSync = function (g, tabId) {
        curGroup = g || curGroup;
        bar.querySelectorAll('.st-tb').forEach(function (b) {
            var bg = b.getAttribute('data-g');
            b.classList.toggle('active', bg === curGroup);
            var dot = b.querySelector('.st-tb-dot');
            if (dot) dot.hidden = !(window.stNavHasDot && window.stNavGroups[bg] && window.stNavHasDot(bg));
        });
    };

    // ---------- меню «Ещё» и настройки (нижние листы) ----------
    function sheet(id, title, body) {
        var m = document.createElement('div');
        m.id = id; m.className = 'st-sheet-wrap';
        m.innerHTML = '<div class="st-sheet" role="dialog" aria-label="' + esc(title) + '"><div class="st-sheet-head"><h3>' + esc(title) + '</h3><button type="button" class="st-sheet-x" aria-label="Закрыть">✕</button></div><div class="st-sheet-body"></div></div>';
        m.querySelector('.st-sheet-body').innerHTML = body || '';
        m.addEventListener('mousedown', function (e) { if (e.target === m) closeSheets(); });
        m.querySelector('.st-sheet-x').onclick = closeSheets;
        document.body.appendChild(m);
        return m;
    }
    var more = sheet('st-more-sheet', 'Ещё', '<div class="st-more-grid">' + MORE.map(function (it, i) {
        return '<button type="button" class="st-more-tile" data-i="' + i + '">' + icon(it.icon, 'st-more-ico') + '<span>' + it.label + '</span><i class="st-tb-dot" hidden></i></button>';
    }).join('') + '</div>');
    more.querySelectorAll('.st-more-tile').forEach(function (b) {
        b.onclick = function () {
            var it = MORE[parseInt(b.getAttribute('data-i'), 10)];
            if (it.settings) { openSettings(); return; }
            closeSheets(); goTab(it.tab);
        };
    });
    function openMore() {
        closeSheets();
        more.querySelectorAll('.st-more-tile').forEach(function (b) {
            var it = MORE[parseInt(b.getAttribute('data-i'), 10)], tb = it.tab && tabBtn(it.tab);
            b.querySelector('.st-tb-dot').hidden = !(tb && /●/.test(tb.textContent));
            b.classList.toggle('active', !!(it.tab && el(it.tab) && el(it.tab).classList.contains('active')));
        });
        more.classList.add('open');
    }

    var settings = sheet('st-settings-sheet', 'Настройки', '<div class="st-set-sec" id="st-set-account"><h4>Аккаунт и вид</h4></div><div class="st-set-sec" id="st-set-save"><h4>Сохранения персонажа</h4></div><div class="st-set-sec st-set-danger" id="st-set-danger"><h4>Опасное</h4></div>');
    // переносим служебное целиком — элементы сохраняют id и onclick, поэтому остальной код их находит.
    // На место каждого ставим пустой маркер, чтобы на компьютере вернуть всё как было.
    var moved = [];
    (function collect() {
        var csb = el('cloud-status-bar'); if (csb) moved.push({ node: csb, to: 'st-set-account' });
        var dc = el('date-display') && el('date-display').closest('.day-controls');
        if (!dc) return;
        Array.prototype.slice.call(dc.children).forEach(function (c) {
            var oc = (c.getAttribute && c.getAttribute('onclick')) || '';
            if (/resetData\(/.test(oc)) moved.push({ node: c, to: 'st-set-danger' });
            else if (/exportCharacterToFile|driveSaveCharacter|driveListCharacters|stToggleSnapshots/.test(oc) || c.id === 'st-snapshot-list' || c.id === 'drive-files-list' || (c.tagName === 'LABEL' && c.querySelector('input[type=file]'))) moved.push({ node: c, to: 'st-set-save' });
        });
        moved.forEach(function (m) { m.mark = document.createComment('st-settings'); m.node.parentNode.insertBefore(m.mark, m.node); });
    })();
    function placeService(mobile) {
        moved.forEach(function (m) {
            if (mobile) { if (m.node.parentNode !== el(m.to)) el(m.to).appendChild(m.node); }
            else if (m.mark.parentNode && m.node.previousSibling !== m.mark) m.mark.parentNode.insertBefore(m.node, m.mark.nextSibling);
        });
    }
    function openSettings() { closeSheets(); settings.classList.add('open'); }
    window.stOpenSettings = openSettings;
    function closeSheets() { more.classList.remove('open'); settings.classList.remove('open'); var it = el('st-item-sheet'); if (it) { it.classList.remove('open'); it._id = null; } }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.st-sheet-wrap.open')) { e.preventDefault(); e.stopPropagation(); closeSheets(); } }, true);

    // ---------- экран «Бой» (этап 2, только телефон) ----------
    // В сессии вверху вкладки «Бой» — ход, цели карточками, режимы атаки, крупные кнопки действий, сам блок атаки
    // (переносится из «Сессии» целиком, с id и обработчиками), бросок по просьбе мастера и эффекты на тебе.
    // Нижняя боевая панель на телефоне сжимается до одной строки. Снаряжение вкладки прячется под кнопку.
    var tab3 = el('tab3');
    var fight = document.createElement('div');
    fight.id = 'st-fight'; fight.className = 'panel st-fight';
    fight.innerHTML =
        '<div class="st-fight-turn" id="st-fight-turn"></div>' +
        '<div class="st-fight-sec"><h4>Цели</h4><div id="st-fight-targets" class="st-fight-targets"></div></div>' +
        '<div class="st-fight-sec" id="st-fight-modes"></div>' +
        '<div class="st-fight-sec" id="st-fight-actions"></div>' +
        '<div class="st-fight-sec" id="st-fight-attack"><h4>Атака</h4></div>' +
        '<div id="st-fight-check"></div>' +
        '<div class="st-fight-sec"><h4>На мне</h4><div id="st-fight-effects"></div></div>' +
        '<button type="button" id="st-fight-gear-btn" class="st-fight-gear-btn">Снаряжение и расчёт атак ▾</button>';
    if (tab3) tab3.insertBefore(fight, tab3.firstChild);
    el('st-fight-gear-btn').onclick = function () {
        var on = !document.body.classList.contains('st-fight-gear');
        document.body.classList.toggle('st-fight-gear', on);
        this.textContent = on ? 'Скрыть снаряжение ▴' : 'Снаряжение и расчёт атак ▾';
    };
    var fightMoved = [];
    (function collectFight() {
        function add(node, to) { if (node) fightMoved.push({ node: node, to: to }); }
        add(el('dock-toggles'), 'st-fight-modes');
        add(document.querySelector('#combat-dock .st-dock-center'), 'st-fight-actions');
        var ts = el('attack-target-select'); add(ts && ts.parentNode, 'st-fight-attack');
        add(el('group-check-player-panel'), 'st-fight-check');
        add(el('dock-effects'), 'st-fight-effects');
        fightMoved.forEach(function (m) { m.mark = document.createComment('st-fight'); m.node.parentNode.insertBefore(m.mark, m.node); });
    })();
    function placeFight(mobile) {
        fightMoved.forEach(function (m) {
            if (mobile) { if (m.node.parentNode !== el(m.to)) el(m.to).appendChild(m.node); }
            else if (m.mark.parentNode && m.node.previousSibling !== m.mark) m.mark.parentNode.insertBefore(m.node, m.mark.nextSibling);
        });
    }
    function inSession() { try { return !!(window.CloudSync && window.CloudSync.isInSession() && window.CloudSync.getSessionData()); } catch (e) { return false; } }
    function renderFight() {
        var on = mqMobile.matches && inSession();
        document.body.classList.toggle('st-fight-on', on);
        if (!on) return;
        var t = 0, r = 0; try { t = gameTurn; r = gameRound; } catch (e) { }
        el('st-fight-turn').innerHTML = '<span>Ход <b>' + t + '</b></span><span>Круг <b>' + r + '</b></span>';
        var s = window.CloudSync.getSessionData() || {}, sel = el('attack-target-select');
        var alive = (s.enemies || []).filter(function (e) { return (e.curHp || 0) > 0; });
        var cur = sel ? sel.value : '';
        el('st-fight-targets').innerHTML = alive.length ? alive.map(function (e) {
            var pct = e.maxHp > 0 ? Math.max(0, Math.min(100, e.curHp / e.maxHp * 100)) : 0;
            var res = ''; try { res = window.StCombat ? window.StCombat.resistSummary(e) : ''; } catch (x) { }
            return '<button type="button" class="st-fight-target' + (e.id === cur ? ' on' : '') + '" data-id="' + esc(e.id) + '">' +
                '<span class="st-fight-tname">' + (s.markedTarget === e.id ? '🎯 ' : '') + esc(e.name) + '</span>' +
                '<span class="st-fight-thp">' + e.curHp + '/' + e.maxHp + '</span>' +
                '<span class="st-fight-tbar"><i style="width:' + pct + '%"></i></span>' +
                (res ? '<span class="st-fight-tres">' + esc(res) + '</span>' : '') + '</button>';
        }).join('') : '<div class="st-fight-empty">Противников нет. Когда мастер добавит врагов, они появятся здесь.</div>';
    }
    el('st-fight-targets').addEventListener('click', function (e) {
        var b = e.target.closest('.st-fight-target'); if (!b) return;
        var sel = el('attack-target-select'); if (!sel) return;
        sel.value = b.getAttribute('data-id'); sel.dispatchEvent(new Event('change', { bubbles: true }));
        renderFight();
    });
    window.stFightRender = renderFight;
    function goFight(focusAttack) {
        goTab('tab3');
        if (focusAttack) setTimeout(function () { var a = el('st-fight-attack'); if (a) try { a.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { } }, 60);
    }
    // на телефоне кнопки «Атака»/«Атаковать помеченного» ведут к блоку атаки на экране «Бой», а не на вкладку «Сессия»
    var origAttack = window.dockAttack, origMarked = window.dockAttackMarked;
    window.dockAttack = function () { if (!mqMobile.matches) return origAttack.apply(this, arguments); goFight(true); };
    window.dockAttackMarked = function () {
        if (!mqMobile.matches) return origMarked.apply(this, arguments);
        var s = window.CloudSync && window.CloudSync.getSessionData && window.CloudSync.getSessionData(), sel = el('attack-target-select');
        if (s && s.markedTarget && sel && Array.prototype.some.call(sel.options, function (o) { return o.value === s.markedTarget; })) { sel.value = s.markedTarget; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        renderFight(); goFight(true);
    };
    // строка свёрнутой панели: кнопка «К бою»
    var mini = document.querySelector('#combat-dock .st-dock-mini');
    if (mini) {
        var go = document.createElement('button'); go.type = 'button'; go.className = 'st-dock-info-toggle st-dock-tofight'; go.textContent = '⚔️ К бою';
        go.onclick = function () { goFight(false); };
        mini.appendChild(go);
    }
    var origDock = window.updateCombatDock;
    if (typeof origDock === 'function') window.updateCombatDock = function () { var r = origDock.apply(this, arguments); try { renderFight(); } catch (e) { } return r; };
    var origTargets = window.renderAttackTargetSelect;
    if (typeof origTargets === 'function') window.renderAttackTargetSelect = function () { var r = origTargets.apply(this, arguments); try { renderFight(); } catch (e) { } return r; };

    // ---------- «Сумка» иконками (этап 3, только телефон) ----------
    // Старый список #player-inventory-list рисуется как раньше (со всеми кнопками). На телефоне строки скрыты,
    // а поверх них — сетка плиток. Нажатие открывает карточку снизу с копиями кнопок этой строки
    // (у копий те же onclick-строки, поэтому действия идут через прежние функции).
    var invList = el('player-inventory-list');
    var catSel = el('inv-category-filter');
    var bagGrid = document.createElement('div'); bagGrid.id = 'st-bag-grid'; bagGrid.className = 'st-bag-grid';
    var bagChips = document.createElement('div'); bagChips.id = 'st-bag-chips'; bagChips.className = 'st-bag-chips';
    if (invList) { invList.parentNode.insertBefore(bagGrid, invList.nextSibling); }
    if (catSel) {
        var CHIP = { all: 'Всё', weapon: 'Оружие', armor: 'Броня', potion: 'Зелья', ingredient: 'Травы', food: 'Еда', magic: 'Магия', jewelry: 'Украшения', other: 'Разное' };
        bagChips.innerHTML = Array.prototype.map.call(catSel.options, function (o) { return '<button type="button" class="st-bag-chip" data-v="' + esc(o.value) + '">' + esc(CHIP[o.value] || o.text) + '</button>'; }).join('');
        var row = catSel.parentNode; row.parentNode.insertBefore(bagChips, row.nextSibling);
        bagChips.addEventListener('click', function (e) {
            var b = e.target.closest('.st-bag-chip'); if (!b) return;
            catSel.value = b.getAttribute('data-v'); catSel.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    var bagSheet = sheet('st-item-sheet', 'Предмет', '');
    function idFromRow(row) {
        var b = row.querySelector('button[onclick*="dropInventoryItem("]'); if (!b) return null;
        var m = /dropInventoryItem\('((?:[^'\\]|\\.)*)'\)/.exec(b.getAttribute('onclick') || ''); if (!m) return null;
        return m[1].replace(/\\(.)/g, '$1');
    }
    function itemById(id) { try { return (playerInventory || []).find(function (i) { return i.itemId === id; }) || null; } catch (e) { return null; } }
    function equippedIds() { var out = {}; try { Object.keys(equippedSlots || {}).forEach(function (k) { var v = equippedSlots[k]; if (typeof v === 'string' && v) out[v] = 1; }); } catch (e) { } return out; }
    function itemIcon(it) {
        var n = String(it.name || '').toLowerCase(), c = String(it.category || '').toLowerCase(), k = 'chest', broad = 'other';
        try { broad = classifyItemBroad(it); } catch (e) { }
        var has = function (re) { return re.test(n) || re.test(c); };
        if (broad === 'weapon') k = has(/лук|арбалет/) ? 'bow' : has(/стрел|болт|боеприпас/) ? 'arrow' : has(/кинжал|нож/) ? 'dagger' : has(/топор|секир|колун/) ? 'axe' : has(/молот|булав|палиц/) ? 'hammer' : 'sword';
        else if (broad === 'armor') k = has(/шлем|капюшон|колпак|маска|шапк/) || it.slot === 'helmet' ? 'helm' : has(/щит/) || it.slot === 'shield' ? 'shield' : has(/сапог|ботин/) || it.slot === 'boots' ? 'boot' : has(/перчат|наруч|рукавиц/) || it.slot === 'gloves' ? 'glove' : 'tunic';
        else if (broad === 'potion') k = has(/яд/) ? 'skull' : 'potion';
        else if (broad === 'ingredient') k = has(/гриб|шляпк|поганк/) ? 'shroom' : has(/рыб|лосос|форел/) ? 'fish' : 'herb';
        else if (broad === 'food') k = has(/мёд|мед |эль|вино|пиво|напит|чай/) ? 'mug' : has(/мяс|окорок|стейк|колбас|ребр/) ? 'meat' : has(/рыб|лосос/) ? 'fish' : has(/суп|рагу|похлёб|каша/) ? 'bowl' : 'bread';
        else if (broad === 'magic') k = has(/посох/) ? 'staff' : has(/камень душ|камни душ/) ? 'gem' : has(/свит/) ? 'scroll' : 'tome';
        else if (broad === 'jewelry') k = has(/кольц/) || it.slot === 'ring' ? 'ring' : has(/обруч|диадем|корон/) || it.slot === 'circlet' ? 'crown' : 'necklace';
        else k = has(/ключ/) ? 'key' : has(/отмыч/) ? 'key' : has(/кирк/) ? 'pick' : has(/золот|слит|руд|самоцвет|алмаз|рубин|сапфир|изумруд|аметист|гранат/) ? 'gem' : has(/книг|дневник|записк|письм/) ? 'book' : has(/шкур|кож/) ? 'tunic' : 'chest';
        return window.stDrawnIcon ? window.stDrawnIcon(k) : '';
    }
    function buildBag() {
        if (!invList || !mqMobile.matches) return;
        var rows = Array.prototype.filter.call(invList.children, function (r) { return r.classList && r.classList.contains('stat-block'); });
        var eq = equippedIds();
        bagGrid.innerHTML = rows.map(function (r, i) {
            var id = idFromRow(r), it = id ? itemById(id) : null; if (!it) return '';
            return '<button type="button" class="st-bag-cell' + (eq[id] ? ' eq' : '') + '" data-i="' + i + '" title="' + esc(it.name) + '">' + itemIcon(it) +
                (it.count > 1 ? '<b>' + it.count + '</b>' : '') + '<span>' + esc(it.name) + '</span></button>';
        }).join('');
        var cur = catSel ? catSel.value : 'all';
        bagChips.querySelectorAll('.st-bag-chip').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === cur); });
        if (bagSheet.classList.contains('open') && bagSheet._id) openItem(bagSheet._id, true);
    }
    function rowFor(id) {
        return Array.prototype.find.call(invList.children, function (r) { return r.classList && r.classList.contains('stat-block') && idFromRow(r) === id; }) || null;
    }
    function openItem(id, refresh) {
        var it = itemById(id), row = rowFor(id);
        if (!it || !row) { if (refresh) closeSheets(); return; }
        var price = ''; try { if (it.price) price = formatNumber(getDisplayPrice(it.price)) + ' септ.'; } catch (e) { }
        var meta = [it.category, it.weight ? it.weight + ' фнт' : '', price, it.count > 1 ? '×' + it.count : ''].filter(Boolean).join(' · ');
        var body = bagSheet.querySelector('.st-sheet-body');
        body.innerHTML = '<div class="st-item-head"><div class="st-item-ic">' + itemIcon(it) + '</div><div><div class="st-item-name">' + esc(it.name) + (equippedIds()[id] ? ' <small>надето</small>' : '') + '</div><div class="st-item-meta">' + esc(meta) + '</div></div></div>' +
            (it.effect ? '<div class="st-item-eff">' + esc(it.effect) + '</div>' : '') + '<div class="st-item-btns"></div>';
        var box = body.querySelector('.st-item-btns'), btns = row.querySelectorAll('button');
        Array.prototype.forEach.call(btns, function (b, i) {
            var c = b.cloneNode(true); c.removeAttribute('style'); c.classList.add('st-item-btn');
            if (i === 0 && btns.length > 3) c.classList.add('st-item-main');
            var oc = c.getAttribute('onclick') || '';
            // короткие подписи списка («→», «Исп.») в карточке пишем словами
            var LBL = [[/dropInventoryItem\(/, 'Выбросить'], [/tradeItemToPlayer\(/, 'Передать игроку'], [/partyStashPut\(/, 'В сундук отряда']];
            LBL.forEach(function (p) { if (p[0].test(oc)) c.textContent = p[1]; });
            if (/useInventoryItem\(/.test(oc) && /^Исп\.?$/.test(c.textContent.trim())) c.textContent = 'Использовать';
            c.addEventListener('click', function () { setTimeout(function () { if (!itemById(id)) closeSheets(); }, 150); });
            box.appendChild(c);
        });
        bagSheet.querySelector('.st-sheet-head h3').textContent = 'Предмет';
        if (!refresh) { closeSheets(); bagSheet.classList.add('open'); }
        bagSheet._id = id;
    }
    bagGrid.addEventListener('click', function (e) {
        var c = e.target.closest('.st-bag-cell'); if (!c) return;
        var rows = Array.prototype.filter.call(invList.children, function (r) { return r.classList && r.classList.contains('stat-block'); });
        var r = rows[parseInt(c.getAttribute('data-i'), 10)], id = r && idFromRow(r);
        if (id) openItem(id);
    });
    if (invList) new MutationObserver(function () { buildBag(); }).observe(invList, { childList: true });

    // ---------- запуск ----------
    function applyLayout() {
        var mobile = mqMobile.matches;
        document.body.classList.toggle('st-game-ui', mobile);
        if (!mobile) closeSheets();
        placeService(mobile);
        placeFight(mobile);
        renderFight();
        buildBag();
        if (typeof window.updateCombatDock === 'function') try { window.updateCombatDock(); } catch (e) { }
        setBarH();
        var activeTab = document.querySelector('.tab-content.active'), g = 'hero';
        if (activeTab && window.stNavGroups) for (var k in window.stNavGroups) if (window.stNavGroups[k].tabs.indexOf(activeTab.id) >= 0) g = k;
        window.stGameUiSync(g);
    }
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', applyLayout); else if (mqMobile.addListener) mqMobile.addListener(applyLayout);
    applyLayout();
    window.addEventListener('load', setBarH);
})();
