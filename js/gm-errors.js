// ============================================================================
// GM-ERRORS.JS — панель мастера «Ошибки у игроков».
// Показывает последние записи коллекции errors (их пишет js/00-error-log.js
// у игроков и мастера): что сломалось, у кого, на какой странице, когда.
// Кнопка «Очистить» удаляет просмотренные. Счётчик загружается при входе.
// ============================================================================
(function () {
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function db() { try { return (window.FIREBASE_CONFIGURED && window.firebase && firebase.auth().currentUser) ? firebase.firestore() : null; } catch (e) { return null; } }
    let cache = [];
    function when(r) {
        const ms = r.ts && r.ts.toMillis ? r.ts.toMillis() : (r.at || 0);
        if (!ms) return '';
        const d = new Date(ms);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    function render() {
        const box = document.getElementById('gm-errors-list'), cnt = document.getElementById('gm-errors-count');
        if (cnt) { cnt.textContent = cache.length ? '(' + cache.length + ')' : ''; }
        const panel = document.getElementById('gm-errors-panel');
        if (panel) panel.classList.toggle('st-has-errors', cache.length > 0);
        if (!box) return;
        if (!cache.length) { box.innerHTML = '<p class="st-muted">Ошибок нет. Если у игрока что-то сломается, запись появится здесь сама.</p>'; return; }
        box.innerHTML = cache.map(r => `<div class="gm-err-row">
            <div class="gm-err-head"><b>${esc(r.hero || r.who || 'кто-то')}</b> · ${esc(r.page === 'gm.html' ? 'мастер' : 'лист игрока')} · ${esc(when(r))}${r.w ? ' · ' + (r.w <= 900 ? 'телефон' : 'ПК') : ''}</div>
            <div class="gm-err-msg">${esc(r.msg)}</div>
            ${r.src ? `<div class="gm-err-src">${esc(r.src)}${r.line ? ':' + r.line : ''}</div>` : ''}
            ${r.stack ? `<details><summary>подробности</summary><pre>${esc(r.stack)}\n\n${esc(r.ua || '')}</pre></details>` : ''}
        </div>`).join('');
    }
    window.gmLoadErrors = function () {
        const d = db(); if (!d) return Promise.resolve();
        return d.collection('errors').orderBy('ts', 'desc').limit(60).get().then(snap => {
            cache = []; snap.forEach(doc => cache.push(Object.assign({ _id: doc.id }, doc.data())));
            cache.sort((a, b) => ((b.ts && b.ts.toMillis ? b.ts.toMillis() : b.at || 0) - (a.ts && a.ts.toMillis ? a.ts.toMillis() : a.at || 0)));
            render();
        }).catch(e => { const box = document.getElementById('gm-errors-list'); if (box) box.textContent = 'Не удалось загрузить: ' + (e && e.message || e); });
    };
    window.gmClearErrors = function () {
        const d = db(); if (!d || !cache.length) return;
        if (!confirm('Удалить все ' + cache.length + ' записей об ошибках?')) return;
        Promise.all(cache.map(r => d.collection('errors').doc(r._id).delete().catch(() => { }))).then(() => { cache = []; render(); });
    };
    // загрузить счётчик, как только мастер вошёл
    let tries = 0;
    (function wait() { if (db()) { gmLoadErrors(); return; } if (++tries < 60) setTimeout(wait, 2000); })();
    document.addEventListener('DOMContentLoaded', () => {
        const p = document.getElementById('gm-errors-panel');
        if (p) p.addEventListener('toggle', () => { if (p.open) gmLoadErrors(); });
    });
})();
