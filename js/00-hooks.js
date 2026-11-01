// ============================================================================
// 00-HOOKS.JS — явные «крючки» на глобальные функции листа.
// Раньше поздние файлы (15-traps-boot, 16-game-ui) молча подменяли window.X своей обёрткой,
// и было не видно, кто и что перехватил. Теперь это делается одной функцией:
//
//   stHook('updateCombatDock', 'экран Бой', { after: function (result, args) { ... } });
//   stHook('dockAttack', 'тюрьма', { before: function (args) { if (...) return stHook.STOP; } });
//   stHook('dockAttack', 'телефон', { around: function (orig, args) { return orig.apply(this, args); } });
//
// before → вернуть stHook.STOP, чтобы не вызывать функцию; after получает результат; around — полный контроль.
// Ошибка внутри before/after не ломает исходную функцию (пишется в консоль/сборщик ошибок).
// Все крючки видны в консоли: stHook.list()  → { dockAttack: ['тюрьма', 'телефон'], ... }
// ============================================================================
(function () {
    var registry = {};
    var STOP = {};
    function stHook(name, label, opts) {
        var orig = window[name];
        if (typeof orig !== 'function') { console.warn('stHook: нет функции ' + name + ' (' + label + ')'); return false; }
        opts = opts || {};
        var wrapped = function () {
            var args = arguments, self = this;
            if (opts.before) {
                var stop;
                try { stop = opts.before.call(self, args); } catch (e) { console.error('Ошибка в крючке ' + name + '/' + label + ':', e); }
                if (stop === STOP) return undefined;
            }
            var r = opts.around ? opts.around.call(self, orig, args) : orig.apply(self, args);
            if (opts.after) { try { opts.after.call(self, r, args); } catch (e) { console.error('Ошибка в крючке ' + name + '/' + label + ':', e); } }
            return r;
        };
        wrapped.__stOrig = orig;
        window[name] = wrapped;
        (registry[name] = registry[name] || []).push(label);
        return true;
    }
    stHook.STOP = STOP;
    stHook.list = function () { return JSON.parse(JSON.stringify(registry)); };
    window.stHook = stHook;
})();
