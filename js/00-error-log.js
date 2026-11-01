// ============================================================================
// 00-ERROR-LOG.JS — сбор ошибок у игроков и мастера.
// Ловит падения JS (window.onerror, необработанные промисы) и сообщения
// console.error, которые начинаются с «Ошибка…» (неудачные сохранения, подписки),
// и пишет их в Firestore: коллекция errors. Мастер видит их в gm.html,
// панель «Ошибки у игроков». Подключается первым в <head>, ничего не требует.
// Ограничения: не больше 15 записей за загрузку страницы, одинаковые не повторяются.
// ============================================================================
(function () {
    if (window.__stErrorLog) return;
    var PAGE = (location.pathname.split('/').pop() || 'index.html');
    var MAX = 15, sent = 0, seen = {}, queue = [], timer = null, tries = 0;
    var log = window.__stErrorLog = { list: [] }; // последние ошибки этой страницы (для отладки в консоли)

    function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

    function report(kind, msg, extra) {
        try {
            msg = clip(msg, 300);
            var key = kind + '|' + msg + '|' + (extra && extra.line || '');
            if (seen[key] || sent + queue.length >= MAX) return;
            seen[key] = 1;
            var rec = {
                kind: kind, msg: msg, page: PAGE,
                src: clip(extra && extra.src || '', 120).replace(/^https?:\/\/[^/]+\//, ''),
                line: (extra && extra.line) || 0,
                stack: clip(extra && extra.stack || '', 800),
                ua: clip(navigator.userAgent || '', 160),
                w: window.innerWidth || 0,
                at: Date.now()
            };
            log.list.push(rec);
            queue.push(rec);
            schedule(1500);
        } catch (e) { /* сам сборщик ошибок никогда не роняет страницу */ }
    }
    window.stReportError = function (msg, err) {
        report('manual', msg + (err && err.message ? ': ' + err.message : ''), { stack: err && err.stack });
    };

    function schedule(ms) { if (!timer) timer = setTimeout(flush, ms); }

    function flush() {
        timer = null;
        if (!queue.length) return;
        var user = null, db = null;
        try {
            if (window.FIREBASE_CONFIGURED && window.firebase && firebase.auth) {
                user = firebase.auth().currentUser;
                db = firebase.firestore();
            }
        } catch (e) { }
        if (!user || !db) { if (++tries < 40) schedule(5000); return; } // ждём вход (до ~3 минут)
        var batch = queue.splice(0, queue.length);
        batch.forEach(function (rec) {
            sent++;
            rec.uid = user.uid;
            rec.who = clip(user.email || user.displayName || '', 80);
            rec.ts = firebase.firestore.FieldValue.serverTimestamp();
            try {
                var hero = document.getElementById('char-name');
                if (hero && hero.value) rec.hero = clip(hero.value, 40);
                var code = window.stGetSessionCode && window.stGetSessionCode();
                if (code) rec.session = String(code).slice(0, 12);
            } catch (e) { }
            db.collection('errors').add(rec).catch(function () { /* нет сети или нет прав — молча */ });
        });
    }

    window.addEventListener('error', function (ev) {
        if (!ev) return;
        if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) return; // не загрузилась картинка — не наш случай
        report('error', ev.message || 'Ошибка скрипта', { src: ev.filename, line: ev.lineno, stack: ev.error && ev.error.stack });
    });
    window.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        var m = r && (r.message || r.code) || String(r);
        if (/offline|unavailable|network|Failed to fetch|Load failed/i.test(m)) return; // обрывы сети — не баги
        report('promise', m, { stack: r && r.stack });
    });
    // console.error('Ошибка сохранения в облако:', e) и похожие — это неудачные сохранения/подписки.
    var origErr = console.error;
    console.error = function () {
        try {
            var a0 = arguments[0];
            if (typeof a0 === 'string' && /^Ошибка/.test(a0)) {
                var e = arguments[1];
                var em = e && (e.message || e.code) || (e != null ? String(e) : '');
                if (!/offline|unavailable|network|Failed to fetch/i.test(em)) report('console', a0 + ' ' + em, { stack: e && e.stack });
            }
        } catch (x) { }
        return origErr.apply(console, arguments);
    };
})();
