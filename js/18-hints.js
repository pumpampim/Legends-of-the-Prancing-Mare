/* ===== Подсказки правил свёрнуты в одну строку с ⓘ (2026-11-01, телефон и компьютер) =====
   Пояснительные абзацы на вкладках (мелкий или приглушённый текст длиннее ~60 знаков) показываются одной строкой
   с ⓘ и раскрываются по нажатию. Текст не удаляется и не меняется — только CSS-класс, поэтому код, который пишет
   в эти абзацы, работает как раньше. Абзацы с id (их наполняет код) и всё внутри форм ввода не трогаем. */
(function () {
    function isHint(p) {
        if (p.id || p.closest('#st-fight, #st-hero, #st-wiz, .st-sheet-wrap, .st-modal, .st-dock-modal')) return false;
        if (p.querySelector('input, select, textarea, button')) return false;
        var st = p.getAttribute('style') || '';
        var small = /font-size:\s*1[0-3]px/.test(st) || /opacity:\s*\.[0-8]/.test(st) || /color:\s*#a{3}\b/.test(st);
        return small && (p.textContent || '').trim().length > 60;
    }
    function mark(root) {
        (root || document).querySelectorAll('.tab-content p:not(.st-hint)').forEach(function (p) {
            if (!isHint(p)) return;
            p.classList.add('st-hint');
            p.setAttribute('role', 'button'); p.setAttribute('tabindex', '0');
            p.title = 'Нажми, чтобы развернуть';
        });
    }
    function toggle(p) { p.classList.toggle('st-hint-open'); }
    document.addEventListener('click', function (e) {
        var p = e.target.closest && e.target.closest('p.st-hint'); if (!p || e.target.closest('a')) return;
        toggle(p);
    });
    document.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('st-hint')) { e.preventDefault(); toggle(e.target); }
    });
    window.stMarkHints = mark;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mark(); }); else mark();
})();
