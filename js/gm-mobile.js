// ============================================================================
// GM-MOBILE.JS — экран мастера на телефоне (≤900px).
// Пульт Бой / Сцена / Награды / Мир / Справочники уезжает вниз, как вкладки у игрока;
// сверху — короткая строка с кодом сессии; под ней ряд-«оглавление» панелей текущей вкладки
// (нажал — страница прокрутилась к панели и раскрыла её). На ПК ничего не меняется.
// ============================================================================
(function () {
    var mq = window.matchMedia('(max-width: 900px)');
    function el(id) { return document.getElementById(id); }
    function apply() { document.body.classList.toggle('st-gm-mobile', mq.matches); buildToc(); }

    function panelTitle(p) {
        var h = p.querySelector(':scope > h2 .section-title') || p.querySelector('h2, summary');
        if (!h) return '';
        var t = (h.textContent || '').replace(/[▾▸▴▿►▼–—-]/g, ' ').replace(/\s+/g, ' ').trim();
        // эмодзи остаются в скрытом тексте иконок — убираем их из подписи
        t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
        return t.length > 22 ? t.slice(0, 21) + '…' : t;
    }
    function buildToc() {
        var toc = el('st-gm-toc');
        if (!toc) return;
        if (!mq.matches || !document.body.classList.contains('gm-in-session')) { toc.innerHTML = ''; return; }
        var panels = Array.prototype.filter.call(document.querySelectorAll('#session-block .panel[data-gm-tab]'), function (p) { return p.style.display !== 'none' && p.offsetParent !== null; });
        toc.innerHTML = '';
        panels.forEach(function (p, i) {
            var t = panelTitle(p); if (!t) return;
            if (!p.id) p.id = 'st-gm-panel-' + i + '-' + (p.dataset.gmTab || '');
            var b = document.createElement('button'); b.type = 'button'; b.className = 'st-gm-toc-chip'; b.textContent = t;
            b.onclick = function () {
                // свёрнутая панель — раскрыть (клик по её заголовку, как делает сам мастер)
                var body = p.querySelector(':scope > .section-body');
                if (body && body.style.display === 'none' && p.dataset.secId && window.toggleGmSectionById) window.toggleGmSectionById(p.dataset.secId);
                var bar = el('st-gm-topbar'), off = (bar ? bar.offsetHeight : 0) + (toc.offsetHeight || 0) + 8;
                window.scrollTo({ top: p.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
            };
            toc.appendChild(b);
        });
    }
    window.stGmBuildToc = buildToc;

    function init() {
        // верхняя строка: код сессии и быстрые кнопки (копии существующих, вызывают те же функции)
        var sb = el('session-block');
        if (sb && !el('st-gm-topbar')) {
            var bar = document.createElement('div'); bar.id = 'st-gm-topbar'; bar.className = 'st-gm-topbar';
            bar.innerHTML = '<span class="st-gm-code-l">Код</span> <span id="st-gm-code" class="session-code-badge">-</span>' +
                '<button type="button" class="btn-success" onclick="gmCallPlayers()">📣 Позвать</button>';
            var toc = document.createElement('div'); toc.id = 'st-gm-toc'; toc.className = 'st-gm-toc';
            sb.parentNode.insertBefore(bar, sb); sb.parentNode.insertBefore(toc, sb);
            var src = el('gm-session-code');
            var sync = function () { var c = el('st-gm-code'); if (c && src) c.textContent = src.textContent; };
            if (src) { sync(); new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true }); }
        }
        // при смене вкладки пульта — новое оглавление
        if (typeof window.openGmTab === 'function' && !window.openGmTab.__stMobile) {
            var orig = window.openGmTab;
            window.openGmTab = function () { var r = orig.apply(this, arguments); try { buildToc(); } catch (e) { } return r; };
            window.openGmTab.__stMobile = true;
        }
        new MutationObserver(function () { buildToc(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
        // чеклист на телефоне свёрнут
        var ck = el('gm-first-checklist'); if (ck && mq.matches) ck.open = false;
        apply();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
