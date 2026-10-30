/* ===== Игровой интерфейс, этап 1 (2026-10-30) =====
   Плашка героя сверху (портрет, уровень, ОЗ/мана, золото, броня, скорость, вес) и пять вкладок снизу:
   Герой · Бой · Сумка · Магия · Ещё. Разделы и их «пилюли» описаны в window.stNavGroups (index.html).
   Служебное (аккаунт, шрифт, звук, поиск, сброс, файлы, Drive, снапшоты) переезжает в «Ещё → Настройки».
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

    // ---------- плашка героя ----------
    var hud = document.createElement('div');
    hud.id = 'st-hud'; hud.className = 'st-hud';
    hud.innerHTML =
        '<button type="button" class="st-hud-av" id="st-hud-av" title="Герой"><span class="st-hud-av-img" id="st-hud-av-img"></span><b id="st-hud-lvl">1</b></button>' +
        '<div class="st-hud-main">' +
            '<div class="st-hud-name"><span id="st-hud-name">Герой</span><small id="st-hud-sub"></small></div>' +
            '<div class="st-hud-bar st-hud-hp" title="Здоровье"><i id="st-hud-hp-fill"></i><span id="st-hud-hp">0/0</span></div>' +
            '<div class="st-hud-bar st-hud-mp" title="Мана"><i id="st-hud-mp-fill"></i><span id="st-hud-mp">0/0</span></div>' +
            '<div class="st-hud-xp" title="Очки навыков до следующего уровня"><i id="st-hud-xp-fill"></i></div>' +
        '</div>' +
        '<div class="st-hud-chips">' +
            '<span class="st-hud-chip" title="Золото">' + icon('gold') + '<b id="st-hud-gold">0</b></span>' +
            '<span class="st-hud-chip" title="Класс брони">' + icon('armor') + '<b id="st-hud-armor">0</b></span>' +
            '<span class="st-hud-chip" title="Скорость, фт">' + icon('speed') + '<b id="st-hud-speed">0</b></span>' +
            '<span class="st-hud-chip" title="Вес: несу / предел">' + icon('weight') + '<b id="st-hud-weight">0/0</b></span>' +
        '</div>';
    var container = document.querySelector('.container');
    var topbar = el('st-topbar');
    container.insertBefore(hud, topbar || container.firstChild);
    el('st-hud-av').onclick = function () { goTab('tab1'); };

    var lastPortrait = null;
    function renderHud() {
        var hp = num('cur-hp'), hpMax = num('max-hp'), mp = num('cur-mp'), mpMax = num('max-mp');
        el('st-hud-hp').textContent = hp + '/' + hpMax;
        el('st-hud-mp').textContent = mp + '/' + mpMax;
        el('st-hud-hp-fill').style.width = (hpMax > 0 ? Math.max(0, Math.min(100, hp / hpMax * 100)) : 0) + '%';
        el('st-hud-mp-fill').style.width = (mpMax > 0 ? Math.max(0, Math.min(100, mp / mpMax * 100)) : 0) + '%';
        var nm = el('char-name'); el('st-hud-name').textContent = (nm && nm.value) || 'Герой';
        var race = el('char-race'), sub = [];
        if (race && race.selectedIndex >= 0 && race.value) sub.push(race.options[race.selectedIndex].text.replace(/\s*\(.*\)\s*$/, ''));
        var dd = el('date-display'); if (dd) sub.push(dd.textContent.replace(/^\s*📅\s*/, ''));
        el('st-hud-sub').textContent = sub.join(' · ');
        var lvl = 1; try { lvl = characterLevel || 1; } catch (e) { }
        el('st-hud-lvl').textContent = lvl;
        try {
            var need = getSkillUpsNeededForLevel(lvl);
            el('st-hud-xp-fill').style.width = (need > 0 ? Math.max(0, Math.min(100, levelUpProgress / need * 100)) : 0) + '%';
        } catch (e) { }
        el('st-hud-gold').textContent = Math.round(num('char-gold'));
        el('st-hud-armor').textContent = Math.round(num('armor-total'));
        el('st-hud-speed').textContent = Math.round(num('val-speed'));
        var w = num('weight-current'), wm = num('weight-max-display');
        el('st-hud-weight').textContent = (Math.round(w * 10) / 10) + '/' + Math.round(wm);
        el('st-hud-weight').parentNode.classList.toggle('st-hud-warn', wm > 0 && w > wm);
        var pt = ''; try { pt = window.getPortraitThumb ? window.getPortraitThumb() : ''; } catch (e) { }
        if (pt !== lastPortrait) {
            lastPortrait = pt;
            var img = el('st-hud-av-img');
            if (pt) { img.style.backgroundImage = 'url("' + pt + '")'; img.textContent = ''; }
            else { img.style.backgroundImage = ''; img.textContent = ((nm && nm.value) || 'Г').trim().charAt(0).toUpperCase(); }
        } else if (!pt) { el('st-hud-av-img').textContent = ((nm && nm.value) || 'Г').trim().charAt(0).toUpperCase(); }
    }
    window.stHudRender = renderHud;

    // ---------- нижние вкладки ----------
    var bar = document.createElement('nav');
    bar.id = 'st-tabbar'; bar.className = 'st-tabbar'; bar.setAttribute('aria-label', 'Разделы');
    bar.innerHTML = TABS.map(function (t) {
        return '<button type="button" class="st-tb" data-g="' + t.g + '">' + icon(t.g, 'st-tb-ico') + '<span>' + t.label + '</span><i class="st-tb-dot" hidden></i></button>';
    }).join('');
    document.body.appendChild(bar);
    // на компьютере та же полоса стоит под плашкой героя
    var deskSlot = document.createElement('div'); deskSlot.id = 'st-tabbar-desk-slot';
    container.insertBefore(deskSlot, topbar ? topbar : hud.nextSibling);
    var mqDesk = window.matchMedia('(min-width: 901px)');
    function placeBar() {
        if (mqDesk.matches) { if (bar.parentNode !== deskSlot) deskSlot.appendChild(bar); }
        else if (bar.parentNode !== document.body) document.body.appendChild(bar);
        document.body.classList.toggle('st-tabbar-desk', mqDesk.matches);
        setBarH();
    }
    function setBarH() {
        document.body.style.setProperty('--st-tabbar-h', (mqDesk.matches ? 0 : bar.offsetHeight) + 'px');
        document.body.style.setProperty('--st-hud-h', hud.offsetHeight + 'px');
    }
    if (mqDesk.addEventListener) mqDesk.addEventListener('change', placeBar); else if (mqDesk.addListener) mqDesk.addListener(placeBar);
    window.addEventListener('resize', setBarH);
    document.body.classList.add('st-game-ui');

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
    // переносим служебное целиком — элементы сохраняют id и onclick, поэтому остальной код их находит
    (function moveService() {
        var csb = el('cloud-status-bar'); if (csb) el('st-set-account').appendChild(csb);
        var dc = el('date-display') && el('date-display').closest('.day-controls');
        if (!dc) return;
        var save = el('st-set-save'), danger = el('st-set-danger');
        Array.prototype.slice.call(dc.children).forEach(function (c) {
            var oc = (c.getAttribute && c.getAttribute('onclick')) || '';
            if (/resetData\(/.test(oc)) danger.appendChild(c);
            else if (/exportCharacterToFile|driveSaveCharacter|driveListCharacters|stToggleSnapshots/.test(oc) || c.id === 'st-snapshot-list' || c.id === 'drive-files-list' || (c.tagName === 'LABEL' && c.querySelector('input[type=file]'))) save.appendChild(c);
        });
    })();
    function openSettings() { closeSheets(); settings.classList.add('open'); }
    window.stOpenSettings = openSettings;
    function closeSheets() { more.classList.remove('open'); settings.classList.remove('open'); }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (more.classList.contains('open') || settings.classList.contains('open'))) { e.preventDefault(); e.stopPropagation(); closeSheets(); } }, true);

    // ---------- запуск ----------
    placeBar();
    var activeTab = document.querySelector('.tab-content.active');
    window.stGameUiSync(activeTab && window.stNavGroups ? (function () { for (var g in window.stNavGroups) if (window.stNavGroups[g].tabs.indexOf(activeTab.id) >= 0) return g; return 'hero'; })() : 'hero');
    renderHud();
    setInterval(renderHud, 800);
    document.addEventListener('input', function () { setTimeout(renderHud, 0); });
    document.addEventListener('change', function () { setTimeout(renderHud, 0); });
    window.addEventListener('load', function () { renderHud(); setBarH(); });
})();
