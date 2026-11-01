// ============================================================================
// CRIME-CORE.JS — розыск по владениям (общий для листа игрока и экрана мастера).
//
// Раньше у героя был один штраф (fineAmount) в одном владении (fineHold): новый штраф в другом
// владении просто прибавлялся к старому. Теперь штрафы копятся отдельно по каждому владению —
// это и есть «розыск» (crimeState.bounties = { 'Вайтран': { amount, reason, refused } }).
// Стража владения требует свою сумму, оплата и тюрьма закрывают только его.
// Поля fineAmount / fineHold / fineReason / refused остаются как сводка (сумма и список владений),
// чтобы старые листы и старый код продолжали работать.
//
// Награда за голову: от HEAD_PRICE септимов в одном владении стража не предлагает заплатить,
// а нападает (подсказка мастеру).
// ============================================================================
(function () {
    const HEAD_PRICE = 1000;
    const EMPTY = { fineAmount: 0, fineHold: '', fineReason: '', refused: false, inJail: false, jailHold: '', jailDaysRemaining: 0 };

    // Названия владений у репутации («Хаафингар») и у погоды/карты («Солитьюд (Хаафингар)») разные — сравниваем мягко.
    function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
    function sameHold(a, b) {
        a = norm(a); b = norm(b);
        if (!a || !b) return false;
        if (a === b) return true;
        const parts = x => x.split(/[()\s,]+/).filter(w => w.length > 3);
        const pa = parts(a), pb = parts(b);
        return pa.some(w => pb.includes(w));
    }

    function normalize(cs) {
        const c = Object.assign({}, EMPTY, cs || {});
        const b = {};
        Object.entries((cs && cs.bounties) || {}).forEach(([h, v]) => {
            const amount = Math.max(0, parseInt(v && v.amount) || 0);
            if (amount > 0) b[h] = { amount, reason: String((v && v.reason) || ''), refused: !!(v && v.refused) };
        });
        // старый лист: один штраф без раскладки по владениям
        if (!cs || !cs.bounties) {
            const amt = parseInt(c.fineAmount) || 0;
            if (amt > 0) b[c.fineHold || 'Неизвестно'] = { amount: amt, reason: c.fineReason || '', refused: !!c.refused };
        }
        c.bounties = b;
        return summarize(c);
    }

    // Сводные поля для старого кода (виджет игрока, тюрьма)
    function summarize(c) {
        const list = Object.entries(c.bounties || {});
        c.fineAmount = list.reduce((s, [, v]) => s + v.amount, 0);
        c.fineHold = list.map(([h]) => h).join(', ');
        c.fineReason = list.map(([, v]) => v.reason).filter(Boolean).join('; ');
        c.refused = list.some(([, v]) => v.refused);
        return c;
    }

    function holdKey(c, hold) { return Object.keys(c.bounties || {}).find(h => sameHold(h, hold)) || hold; }

    function addFine(cs, hold, amount, reason) {
        const c = normalize(cs);
        amount = Math.max(0, parseInt(amount) || 0);
        if (!amount) return c;
        const k = holdKey(c, hold || 'Неизвестно');
        const prev = c.bounties[k] || { amount: 0, reason: '', refused: false };
        c.bounties[k] = { amount: prev.amount + amount, reason: [prev.reason, reason].filter(Boolean).join('; '), refused: false };
        return summarize(c);
    }
    function clearHold(cs, hold) {
        const c = normalize(cs);
        delete c.bounties[holdKey(c, hold)];
        return summarize(c);
    }
    function refuse(cs, hold) {
        const c = normalize(cs);
        const k = holdKey(c, hold);
        if (c.bounties[k]) c.bounties[k] = Object.assign({}, c.bounties[k], { refused: true });
        return summarize(c);
    }
    function amountIn(cs, hold) {
        const c = normalize(cs);
        const k = Object.keys(c.bounties).find(h => sameHold(h, hold));
        return k ? c.bounties[k].amount : 0;
    }
    function list(cs) {
        const c = normalize(cs);
        return Object.entries(c.bounties).map(([hold, v]) => Object.assign({ hold, head: v.amount >= HEAD_PRICE }, v)).sort((a, b) => b.amount - a.amount);
    }

    window.StCrime = { HEAD_PRICE, EMPTY, sameHold, normalize, addFine, clearHold, refuse, amountIn, list };
})();
