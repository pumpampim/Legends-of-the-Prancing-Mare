// ============================================================================
// 19-cultist.js — ветка культиста (cultist-data.js; итоговый документ Никиты 2026-11-06).
// Состояние лежит в playerSupernaturalState.cult (его видит мастер и оно уходит в облако):
//   { god, perks:{0..3:true}, veil, lastOffer, banned, fallen, fallReason, penanceUsed, abandoned, swapDay, weekUsed:{idx:день}, halfBuy, lastChaos }
// Перки выдаёт мастер (gmCmds: cultPerk / cultAdmin). Бонусы считаются на лету, пока культист «в силе» (cuRunning).
// ============================================================================
(function () {
    'use strict';
    var GODS = function () { return window.CULT_GODS || {}; };
    var el = function (id) { return document.getElementById(id); };
    function S() { var s = (typeof playerSupernaturalState !== 'undefined') ? playerSupernaturalState : null; return (s && s.cult && typeof s.cult === 'object') ? s.cult : null; }
    function ensure() {
        if (!playerSupernaturalState) playerSupernaturalState = { lycanthropy: false, vampirism: false, werewolf: { heartsEaten: 0, totem: '— нет —', hasTransformedToday: false, transformsToday: 0, isTransformed: false }, vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 } };
        if (!playerSupernaturalState.cult) playerSupernaturalState.cult = { god: null, perks: {}, veil: false, lastOffer: null, banned: false, fallen: false, fallReason: '', penanceUsed: false, abandoned: false, swapDay: null, weekUsed: {}, halfBuy: false };
        return playerSupernaturalState.cult;
    }
    function absDay() { return (parseInt(gameYear) || 0) * 360 + (parseInt(gameMonth) || 0) * 30 + (parseInt(gameDayNum) || 0); }
    function faith() { return (el('faith-god') || {}).value || 'none'; }
    function lvl() { return playerLevelNow(); }
    function name() { return (el('char-name') || {}).value || 'Игрок'; }
    function def() { var c = S(); return (c && c.god && GODS()[c.god]) || null; }
    function has(i) { var c = S(); return !!(c && c.perks && c.perks[i]); }
    function started() { var c = S(); return !!(c && c.god && c.perks && c.perks[0] && !c.abandoned); }
    function fallen() { var c = S(); return !!(c && c.fallen && !c.abandoned); }
    function daysSince() { var c = S(); return (c && c.lastOffer != null) ? absDay() - c.lastOffer : 0; }
    function overdue() { return started() && daysSince() > window.CULT_OFFER_DAYS; }
    function conflict() { return (typeof lichPerk === 'function' && (lichPerk('pact') || lichStage() >= 1)) || (typeof playerPaladin !== 'undefined' && playerPaladin && typeof plHas === 'function' && plHas('p1') && !playerPaladin.abandoned); }
    // Дары действуют: перки взяты, не пал, не просрочено подношение, нет нарушения запрета, вера совпадает, нет пути лича/паладина
    function running() { var c = S(); return !!(started() && !c.fallen && !c.banned && !overdue() && faith() === c.god && !conflict()); }
    function active(i) { return running() && has(i); }
    function log(t) { if (typeof lichLog === 'function') lichLog(t); }
    function save() { try { saveSupernaturalStatePlayer(); } catch (e) { } try { renderSupernaturalStatusPlayer(); } catch (e) { } try { if (typeof renderPowersPanel === 'function') renderPowersPanel(); } catch (e) { } try { updateAll(); } catch (e) { } try { saveLocalStorage(); } catch (e) { } }
    // Облако хранит лист слиянием (merge): ключи из карт не удаляются, поэтому «снятое» пишем явными false/null
    function clearAll(c) { c.perks = c.perks || {}; [0, 1, 2, 3].forEach(function (i) { c.perks[i] = false; }); c.weekUsed = c.weekUsed || {}; [0, 1, 2, 3].forEach(function (i) { c.weekUsed[i] = null; }); }
    function perkDef(i) { var d = def(); return d ? d.perks[i] : null; }
    function cuEffects() { return (activeTimedEffects || []).filter(function (e) { return e && e.cuEff && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity); }); }
    function dropCuEffects() { activeTimedEffects = (activeTimedEffects || []).filter(function (e) { return !(e && e.cuEff); }); }

    // ---------- Числовые бонусы ----------
    function bonus() {
        var b = { w: 0, sp: 0, hpPct: 0, mpPct: 0, mres: 0, heal: 0, skill: {}, sneakW: 0, poisonRes: 0, immuneDisease: false, vamp: 0, vsUndead: 0, vsWounded: 0, buy: 0, sell: 0, restBonus: 0, huntLoot: 0 };
        if (running()) {
            var d = def();
            [0, 1, 2, 3].forEach(function (i) {
                var p = d.perks[i]; if (!has(i) || !p || !p.b) return;
                Object.keys(p.b).forEach(function (k) {
                    if (k === 'skill') Object.keys(p.b.skill).forEach(function (s) { b.skill[s] = (b.skill[s] || 0) + p.b.skill[s]; });
                    else if (k === 'immuneDisease') b.immuneDisease = true;
                    else if (typeof b[k] === 'number') b[k] += p.b[k];
                });
            });
        }
        cuEffects().forEach(function (e) { b.mres += e.cuMres || 0; if (e.cuSkill) Object.keys(e.cuSkill).forEach(function (s) { b.skill[s] = (b.skill[s] || 0) + e.cuSkill[s]; }); });
        return b;
    }
    window.cuBonus = bonus;
    window.cuSkillPts = function (skill) { try { return bonus().skill[skill] || 0; } catch (e) { return 0; } };
    window.cuImmuneNow = function () { return bonus().immuneDisease || cuEffects().some(function (e) { return e.cuImmune; }); };
    window.cuFallen = fallen;
    window.cuPoisonImmuneNow = function () { return cuEffects().some(function (e) { return e.cuImmune; }); };
    window.cuRunning = running;
    // Метка Принца видна: торговцы продают ему на 10% дороже и покупают у него на 10% дешевле. Договор «Хороший торг»/«Сделка» дают скидку; не складываются — берётся лучшее.
    function marked() { var c = S(); return !!(started() && !c.veil); }
    window.cuBuyMult = function () {
        var m = 1, b = bonus();
        if (b.buy) m = Math.min(m, 1 + b.buy / 100);
        cuEffects().forEach(function (e) { if (e.cuBuyMult) m = Math.min(m, e.cuBuyMult); });
        if (marked()) m *= 1.10;
        return m;
    };
    window.cuSellBonus = function () { var m = 1 + (bonus().sell || 0) / 100; return marked() ? m * 0.9 : m; };
    window.cuHalfBuyApplies = function (unitBase) { var c = S(); return !!(running() && c.halfBuy && (parseFloat(unitBase) || 0) <= lvl() * 50); };
    window.cuConsumeHalfBuy = function (unitBase) { var c = S(); if (c && c.halfBuy && window.cuHalfBuyApplies(unitBase)) { c.halfBuy = false; log('🤝 ' + name() + ' использует «Владыку сделок»: покупка за половину цены.'); save(); } };
    window.cuRestoreHalfBuy = function () { var c = S(); if (c) { c.halfBuy = true; log('🤝 ' + name() + ': покупка сорвалась — «Владыка сделок» не потрачен.'); save(); } };
    // После длительного отдыха: «Вещие сны» дают +10% HP и маны
    window.cuRestBonus = function () {
        var rb = bonus().restBonus; if (!rb) return '';
        var hpE = el('cur-hp'), mpE = el('cur-mp'), mh = parseInt(el('max-hp').value) || 0, mm = parseInt(el('max-mp').value) || 0;
        hpE.value = Math.min(mh, (parseInt(hpE.value) || 0) + Math.round(mh * rb / 100)); mpE.value = Math.min(mm, (parseInt(mpE.value) || 0) + Math.round(mm * rb / 100));
        try { updateVitalBars(); } catch (e) { }
        return '🌙 «Вещие сны»: +' + rb + '% здоровья и маны';
    };
    window.cuHuntExtra = function () { var p = bonus().huntLoot; return (p && Math.random() * 100 < p) ? 1 : 0; };
    window.cuRestDone = function () { /* зарезервировано */ };
    // «+2 ко всем кубам d20» — через общий источник бонусов к броскам (атака, навыки, взлом, кражи)
    window.cuRollBonus = function () { var v = 0; cuEffects().forEach(function (e) { v += e.cuD20 || 0; }); return v; };
    window.cuMaxHpMult = function () { return bonus().hpPct; };
    window.cuMaxMpMult = function () { return bonus().mpPct; };

    // ---------- Дополнительный урон в атаке (вызывается из rollPlayerAttack) ----------
    window.cuAttackExtras = function (ctx) {
        var out = { extra: [], vamp: 0, note: '' }; if (!running()) return out;
        var b = bonus(), dmg = ctx.dmg || 0, notes = [];
        var weapon = /^(melee|ranged|quickshot)$/.test(ctx.actionVal || '');
        function add(d, type, label) { d = Math.max(0, Math.round(d)); if (d > 0) { out.extra.push({ dmg: d, type: type || 'physical', label: label, pen: 0 }); notes.push(label + ' +' + d); } }
        if (weapon) {
            if ((ctx.sneak || ctx.invisUsed) && b.sneakW) add(dmg * b.sneakW / 100, 'physical', '🗡 скрытая атака +' + b.sneakW + '%');
            if (ctx.invisUsed === 'x2') add(dmg, 'physical', '🫥 удар из тени ×2');
            var hitE = cuEffects().find(function (e) { return e.cuHitPct; });
            if (hitE) { add(dmg * hitE.cuHitPct / 100, 'physical', '🗡 ' + hitE.effectName); activeTimedEffects = activeTimedEffects.filter(function (x) { return x !== hitE; }); }
            cuEffects().forEach(function (e) { if (e.cuHitExtra) add(e.cuHitExtra.dmg, e.cuHitExtra.type, e.cuHitExtra.label); });
        }
        var tg = ctx.target || {};
        if (b.vsUndead && typeof getEnemyMeta === 'function' && getEnemyMeta(tg).kind === 'undead') add(dmg * b.vsUndead / 100, 'magic', '☀ против нежити +' + b.vsUndead + '%');
        if (b.vsWounded && (tg.maxHp || 0) > 0 && (tg.curHp || 0) / tg.maxHp < 0.5) add(dmg * b.vsWounded / 100, 'physical', '🐺 раненая добыча +' + b.vsWounded + '%');
        out.vamp = b.vamp || 0;
        out.note = notes.length ? ' (' + notes.join(', ') + ')' : '';
        return out;
    };
    // Убийство цели: «Танец клинков» даёт ещё одно основное действие, «Клятва мести» лечит
    window.cuOnKill = function () {
        if (!running()) return;
        var eK = cuEffects().find(function (e) { return e.cuKillAction; });
        if (eK) { activeTimedEffects = activeTimedEffects.filter(function (x) { return x !== eK; }); try { combatMarks.attack = null; } catch (e) { } alertSafe('🗡 «Танец клинков»: ещё одно основное действие в этом ходу!'); log('🗡 ' + name() + ': «Танец клинков» после убийства — ещё одно действие.'); }
        var eH = cuEffects().find(function (e) { return e.cuKillHeal; });
        if (eH) { activeTimedEffects = activeTimedEffects.filter(function (x) { return x !== eH; }); var mh = parseInt(el('max-hp').value) || 0, h = el('cur-hp'); h.value = Math.min(mh, (parseInt(h.value) || 0) + Math.round(mh * eH.cuKillHeal / 100)); try { updateVitalBars(); } catch (e) { } alertSafe('🔨 «Клятва мести»: убийство лечит ' + eH.cuKillHeal + '% HP.'); log('🔨 ' + name() + ': «Клятва мести» лечит ' + eH.cuKillHeal + '% HP.'); }
        if (eK || eH) { try { renderActiveEffects(); updateAll(); saveLocalStorage(); } catch (e) { } }
    };
    function alertSafe(t) { if (typeof window.alchToast === 'function') window.alchToast(t); else alert(t); }
    // Следующее заклинание (Откровение / Бездна) тратится при каждом платном касте
    window.cuConsumeNextSpell = function () {
        var e = cuEffects().find(function (x) { return x.cuNextSpell && !x.cuSpent; });
        // Снимаем после расчёта урона этого же каста (он идёт сразу следом): иначе «Бездна» теряла +50% силы
        if (e) { e.cuSpent = true; setTimeout(function () { if (!e.cuSpent) return; activeTimedEffects = activeTimedEffects.filter(function (x) { return x !== e; }); try { renderActiveEffects(); } catch (er) { } scheduleSoon(); }, 0); }
    };
    function scheduleSoon() { try { if (typeof scheduleUpdateAll === 'function') scheduleUpdateAll(); else updateAll(); } catch (e) { } }
    window.cuNextSpellFree = function () { return cuEffects().some(function (e) { return e.cuNextSpell && !e.cuSpent && e.cuNextSpell.cost >= 100; }); };

    // ---------- Подношения ----------
    function equippedIds() { var s = {}; Object.keys(equippedSlots || {}).forEach(function (k) { var v = equippedSlots[k]; if (v && typeof v === 'string') s[v] = 1; }); return s; }
    function isGear(it) { return !!(it.weaponDmg || it.armorValue || /Оруж|Брон|Доспех|Шлем|Щит|Меч|Топор|Булав|Кинжал|Лук|Арбалет/i.test(String(it.category || ''))); }
    function priceOf(it) { var p = parseFloat(it.price); if (p) return p; var a = (window.allItems || []).find(function (x) { return x.name === it.name; }); return (a && parseFloat(a.price)) || 0; }
    function matching(n) {
        var eq = equippedIds(), re = n.re ? new RegExp(n.re) : null;
        return (playerInventory || []).filter(function (it) {
            if (!it || !(it.count > 0) || eq[it.itemId]) return false;
            if (n.cat === 'gear') return isGear(it);
            if (n.names) return n.names.indexOf(it.name) !== -1;
            return re ? re.test(String(it.name || '')) : false;
        });
    }
    function haveFor(opt, mult) {
        mult = mult || 1;
        if (opt.k === 'stolen') {
            var need = opt.mult * lvl() * mult, sum = 0;
            (playerInventory || []).forEach(function (it) { if (it && it.count > 0 && (it.stolen || /#stolen$/.test(it.itemId || ''))) sum += priceOf(it) * it.count; });
            return { ok: sum >= need, have: Math.round(sum), need: need };
        }
        if (opt.k === 'items') {
            var ok = true, rows = [];
            opt.need.forEach(function (n) { var c = matching(n).reduce(function (t, it) { return t + it.count; }, 0); rows.push(c + '/' + (n.qty * mult)); if (c < n.qty * mult) ok = false; });
            return { ok: ok, rows: rows.join(', ') };
        }
        return { ok: false };
    }
    // Списание подношения. Краденое — с самого дешёвого, пока не наберётся сумма. Предметы — тоже с дешёвых;
    // если нужна одна вещь, а подходящих несколько разных (оружие у Малаката, камень душ, самоцвет), игрок выбирает сам.
    // Возвращает false, если игрок отменил выбор (тогда ничего не списано).
    function take(opt, mult) {
        mult = mult || 1;
        if (opt.k === 'stolen') {
            var need = opt.mult * lvl() * mult;
            var st = (playerInventory || []).filter(function (it) { return it && it.count > 0 && (it.stolen || /#stolen$/.test(it.itemId || '')); }).sort(function (a, b) { return priceOf(a) - priceOf(b); });
            st.forEach(function (it) { var id = it.itemId, n = it.count; while (need > 0 && n > 0) { need -= priceOf(it); removeFromInventoryByName(id, 1); n--; } });
        } else {
            var picks = [];
            for (var k = 0; k < opt.need.length; k++) {
                var n = opt.need[k], qty = n.qty * mult;
                var cand = matching(n).sort(function (a, b) { return priceOf(a) - priceOf(b); });
                if (qty === 1 && cand.length > 1) {
                    var ans = prompt('Что отдать Принцу? Введи номер:\n' + cand.map(function (it, i) { return (i + 1) + '. ' + it.name + (it.count > 1 ? ' (×' + it.count + ')' : '') + ' — ' + Math.round(priceOf(it)) + ' зол.'; }).join('\n'), '1');
                    if (ans === null) return false;
                    var ch = cand[(parseInt(ans) || 1) - 1]; if (!ch) return false;
                    cand = [ch];
                }
                picks.push({ cand: cand, qty: qty });
            }
            picks.forEach(function (p) { var left = p.qty; p.cand.forEach(function (it) { if (left <= 0) return; var t = Math.min(left, it.count); left -= t; removeFromInventoryByName(it.itemId, t); }); });
        }
        try { renderInventoryList(); } catch (e) { }
        return true;
    }
    function goldEl() { return el('char-gold'); }
    function markOffered(how) {
        var c = S(); c.lastOffer = absDay(); c.banned = false;
        log('🕯 ' + name() + ' приносит подношение ' + (def() ? def().name : 'Принцу') + ' (' + how + ').');
        save();
    }
    window.cuOffer = function (optIdx) {
        var c = S(); if (!started() || c.fallen) { alert('Подношение сейчас не нужно: нет пути или культист пал (нужно искупление).'); return; }
        var d = def();
        if (optIdx === -1) {
            var g = parseInt(goldEl().value) || 0, price = lvl() * 20;
            if (g < price) { alert('Нужно ' + price + ' септимов (есть ' + g + ').'); return; }
            if (!confirm('Принести подношение золотом: ' + price + ' септимов?')) return;
            goldEl().value = g - price; markOffered('золотом ' + price); return;
        }
        var opt = d.offer.opts[optIdx]; if (!opt) return;
        if (opt.k === 'deed') { alert('Это деяние: выполни его и скажи мастеру. Он подтвердит подношение кнопкой.'); return; }
        var h = haveFor(opt);
        if (!h.ok) { alert('Не хватает: ' + (opt.k === 'stolen' ? 'краденого на ' + h.need + ' золота (есть ' + h.have + ')' : h.rows) + '.'); return; }
        if (!confirm('Принести подношение: ' + opt.text + '? Предметы будут списаны.')) return;
        if (take(opt) === false) return; markOffered(opt.text);
    };
    window.cuPenance = function (optIdx) {
        var c = S(); if (!c || !c.fallen || c.abandoned) return;
        if (c.penanceUsed) { alert('Искупление уже было. Теперь можно только отказаться от пути.'); return; }
        var d = def(), g = parseInt(goldEl().value) || 0, mult = window.CULT_PENANCE_MULT, gold = window.CULT_PENANCE_GOLD;
        if (optIdx === -1) {
            var total = gold + lvl() * 20 * mult;
            if (g < total) { alert('Нужно ' + total + ' септимов (' + gold + ' храму и ' + (lvl() * 20 * mult) + ' в подношение; есть ' + g + ').'); return; }
            if (!confirm('Искупление: ' + total + ' септимов. Один раз. Продолжить?')) return;
            goldEl().value = g - total;
        } else {
            var opt = d.offer.opts[optIdx]; if (!opt || opt.k === 'deed') { alert('Деяния подтверждает мастер.'); return; }
            if (g < gold) { alert('Нужно ' + gold + ' септимов храму (есть ' + g + ').'); return; }
            var h = haveFor(opt, mult); if (!h.ok) { alert('Не хватает: ' + (opt.k === 'stolen' ? 'краденого на ' + h.need + ' (есть ' + h.have + ')' : h.rows) + ' (подношение ×' + mult + ').'); return; }
            if (!confirm('Искупление: ' + gold + ' септимов и подношение ×' + mult + ' (' + opt.text + '). Один раз. Продолжить?')) return;
            if (take(opt, mult) === false) return; goldEl().value = g - gold;
        }
        c.fallen = false; c.fallReason = ''; c.penanceUsed = true; c.lastOffer = absDay(); c.banned = false;
        log('🕯 ' + name() + ' искупает вину перед ' + d.name + '.'); save();
    };
    window.cuAbandon = function () {
        var c = S(); if (!c || c.abandoned) return;
        var n = Object.keys(c.perks || {}).filter(function (k) { return c.perks[k]; }).length, back = Math.max(0, n - 1);
        var left = (c.swapDay == null) ? 0 : window.CULT_OFFER_DAYS - (absDay() - c.swapDay);
        if (n && left > 0) { alert('Отказаться от пути или сменить Принца можно раз в ' + window.CULT_OFFER_DAYS + ' дн.: ещё ' + left + ' дн.'); return; }
        if (!confirm('Отказаться от пути культиста? Перки сгорят, вернётся ' + back + ' очк. перков (на одно меньше, как при смене Принца). Метка исчезнет. Снова встать на путь можно только по решению мастера.')) return;
        perkPointsAvailable += back; clearAll(c); c.abandoned = false; c.god = null; c.fallen = false; c.banned = false;  c.halfBuy = false; c.lastOffer = null; c.swapDay = absDay();
        dropCuEffects(); log('🕯 ' + name() + ' отказывается от пути культиста.'); save();
    };
    function fall(reason) {
        var c = S(); if (!c || c.fallen) return;
        c.fallen = true; c.fallReason = reason; dropCuEffects();
        log('🕯 ' + name() + ' пал(а) перед ' + (def() ? def().name : 'Принцем') + ': ' + reason + '.'); save();
        setTimeout(function () { alert('🕯 Культист пал: ' + reason + '.\nДары отключены. Искупление — на этой панели (один раз), потом остаётся только отказаться от пути.'); }, 50);
    }
    // Смена веры культиста: раз в 2 недели, перки сгорают, очков возвращается на одно меньше
    window.cuGodSwapOk = function (prev, next) {
        var c = S(); if (!c || !c.perks || !c.perks[0] || c.abandoned || prev === next) return true;
        var left = (c.swapDay == null) ? 0 : window.CULT_OFFER_DAYS - (absDay() - c.swapDay);
        if (left > 0) { alert('Культист может сменить Принца или веру раз в ' + window.CULT_OFFER_DAYS + ' дн.: ещё ' + left + ' дн.'); return false; }
        var n = Object.keys(c.perks).filter(function (k) { return c.perks[k]; }).length, back = Math.max(0, n - 1);
        if (!confirm('Сменить веру? Все перки культиста сгорят, вернётся ' + back + ' очк. перков (на одно меньше). Мастер выдаст перки нового Принца заново.')) return false;
        perkPointsAvailable += back; clearAll(c); c.god = null; c.fallen = false; c.banned = false;  c.halfBuy = false; c.lastOffer = null; c.swapDay = absDay();
        dropCuEffects(); log('🕯 ' + name() + ' меняет Принца: перки сгорели.'); save();
        return true;
    };

    // ---------- Перки: выдаёт мастер ----------
    // Отказ в перке от мастера: игрок видит окно, мастер — запись в журнале сессии (раньше мастер видел «получает перк» и при отказе)
    function refuse(t) { alert(t); log('🕯 ' + name() + ': ' + t); return ''; }
    window.cuGrantPerk = function (idx) {
        idx = parseInt(idx); if (!(idx >= 0 && idx <= 3)) return '';
        var c = ensure(), g = faith(), d = GODS()[g];
        if (c.abandoned) c.abandoned = false;
        // Пал, став оборотнем/вампиром-лордом: сразу может начать путь Хирсина/Молаг Бала (решение Никиты 2026-11-06).
        // Старые перки сгорают, очков возвращается на одно меньше — как при смене Принца; ожидания 14 дней нет.
        if (c.fallen && c.shiftFall && c.shiftFall === g && c.god !== g) {
            var nOld = Object.keys(c.perks || {}).filter(function (k) { return c.perks[k]; }).length;
            perkPointsAvailable += Math.max(0, nOld - 1); clearAll(c);
            log('🕯 ' + name() + ' оставляет путь ' + (def() ? def().name : 'Принца') + ' и начинает путь ' + (d ? d.name : g) + '.');
            c.god = null; c.fallen = false; c.fallReason = ''; c.banned = false; c.halfBuy = false; c.lastOffer = null; c.penanceUsed = false; c.shiftFall = null; c.swapDay = absDay();
            dropCuEffects();
        }
        if (!c.god) { if (!d) { return refuse('Перк культиста не выдан: игрок не верит ни в одного Принца Даэдра.'); } }
        else if (g !== c.god) { return refuse('Перк культиста не выдан: вера игрока (' + g + ') не совпадает с Принцем пути.'); }
        if (conflict()) { return refuse('Перк культиста не выдан: путь культиста несовместим с путём паладина и лича.'); }
        if (c.fallen) { return refuse('Перк не выдан: культист пал, сначала искупление.'); }
        var god = c.god || g, pd = GODS()[god].perks[idx];
        if (c.perks[idx]) return '';
        if (idx > 0 && !c.perks[idx - 1]) { return refuse('Перк «' + pd.name + '» не выдан: сначала нужен предыдущий перк ветки.'); }
        if (lvl() < pd.level) { return refuse('Перк «' + pd.name + '» не выдан: нужен ' + pd.level + '-й уровень.'); }
        var qd = (playerQuests || []).filter(function (q) { return q && q.kind === 'resident' && q.status === 'done'; }).length;
        if (pd.quests && qd < pd.quests) { return refuse('Перк «' + pd.name + '» не выдан: нужно выполнить ' + pd.quests + ' заданий жителей (выполнено ' + qd + ').'); }
        if (perkPointsAvailable <= 0) { return refuse('Перк «' + pd.name + '» не выдан: нет свободного очка перков.'); }
        perkPointsAvailable -= 1; c.god = god; c.perks[idx] = true;
        if (idx === 0) { c.lastOffer = absDay(); c.banned = false; c.halfBuy = false; }
        log('🕯 ' + name() + ' получает перк культиста ' + GODS()[god].name + ' «' + pd.name + '».');
        save();
        return 'перк культиста «' + pd.name + '»';
    };
    window.cuAdminOp = function (c0) {
        var c = S(); if (!c0 || !c0.op) return '';
        if (c0.op === 'reset' || c0.op === 'revoke') {
            if (!c) return '';
            var from = c0.op === 'reset' ? 0 : parseInt(c0.perk) || 0, n = 0;
            [0, 1, 2, 3].forEach(function (i) { if (i >= from && c.perks && c.perks[i]) { c.perks[i] = false; n++; } });
            perkPointsAvailable += n;
            if (from === 0) { c.god = null; c.fallen = false; c.banned = false; c.lastOffer = null;  c.halfBuy = false; c.veil = false; }
            dropCuEffects(); save(); return 'сброшены перки культиста (' + n + ')';
        }
        if (!c) return '';
        if (c0.op === 'offer') {
            var d = def(), opt = d && d.offer.opts.filter(function (o) { return o.k === 'deed'; })[0];
            if (opt && opt.gold) { var gg = parseInt(goldEl().value) || 0, pr = lvl() * opt.gold; if (gg < pr) return refuse('подношение не принято: нужно ' + pr + ' септимов (есть ' + gg + ')'); goldEl().value = gg - pr; }
            markOffered('деяние, подтверждено мастером'); return 'подношение принято';
        }
        if (c0.op === 'penance' && !c.fallen) return refuse('искупление не нужно: культист не пал');
        if (c0.op === 'penance' && c.penanceUsed) return refuse('искупление уже было один раз');
        if (c0.op === 'penance') { c.fallen = false; c.fallReason = ''; c.penanceUsed = true; c.lastOffer = absDay(); c.banned = false; var g2 = parseInt(goldEl().value) || 0; goldEl().value = Math.max(0, g2 - window.CULT_PENANCE_GOLD); save(); return 'искупление принято'; }
        if (c0.op === 'ban') { c.banned = true; save(); return 'запрет Принца нарушен: дары отключены до подношения'; }
        if (c0.op === 'unban') { c.banned = false; save(); return 'нарушение прощено'; }
        if (c0.op === 'veil') { c.veil = !!c0.on; save(); return c.veil ? 'Метка скрыта («Покров»)' : 'Покров снят'; }
        return '';
    };

    // ---------- Использование способностей ----------
    function weekLeft(i) { var c = S(); var u = c && c.weekUsed ? c.weekUsed[i] : null; return u == null ? 0 : Math.max(0, 7 - (absDay() - u)); }
    function usedNow(i, p) { return p.type === 'day' ? !!powersUsedToday['cu' + i] : p.type === 'week' ? weekLeft(i) > 0 : false; }
    function maxHpN() { return parseInt(el('max-hp').value) || 0; }
    function curHpN() { return parseInt(el('cur-hp').value) || 0; }
    function selfEffect(o, extra) {
        var L = lvl(), mh = maxHpN();
        var e = { id: 'eff-cu-' + o.name + '-' + Date.now().toString(36), name: o.name, effectName: o.name, cuEff: true, turnsRemaining: o.turns, perRound: true, hp: o.tmpL ? L : 0, mp: 0, value: 0, armor: o.armor || 0,
            percentEffects: Object.keys(o.pct || {}).map(function (k) { return { type: k, value: o.pct[k] }; }), description: extra || '' };
        if (o.mres) e.cuMres = o.mres;
        if (o.d20) e.cuD20 = o.d20;
        if (o.invis) { e.invisible = true; e.cuInvis2 = true; }
        if (o.hitPct) e.cuHitPct = o.hitPct;
        if (o.hitExtra) e.cuHitExtra = { dmg: Math.round(L * o.hitExtra.mult), type: o.hitExtra.type, label: o.hitExtra.label + ' +' + Math.round(L * o.hitExtra.mult) };
        if (o.nextSpell) { e.cuNextSpell = o.nextSpell; e.cuSpent = false; e.percentEffects = [{ type: 'spellCostReduction', value: o.nextSpell.cost }, { type: 'spellPower', value: o.nextSpell.power }].filter(function (x) { return x.value; }); }
        if (o.killAction) e.cuKillAction = true;
        if (o.killHeal) e.cuKillHeal = o.killHeal;
        if (o.immune) e.cuImmune = true;
        if (o.untilCombatEnd) e.cuCombatEnd = true; // «Козни»: до конца боя
        if (o.regenPct) e.regenHp = Math.max(1, Math.round(mh * o.regenPct / 100));
        return e;
    }
    function condOk(o) {
        var mh = maxHpN(), ch = curHpN();
        if (o.cond === 'hp50' && !(ch < mh * 0.5)) { alert('Только при HP ниже 50% (сейчас ' + ch + '/' + mh + ').'); return false; }
        if (o.cond === 'hp25' && !(ch < mh * 0.25)) { alert('Только при HP ниже 25% (сейчас ' + ch + '/' + mh + ').'); return false; }
        return true;
    }
    function target() {
        var id = (el('attack-target-select') || {}).value;
        var sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        if (!id || !sess) { alert('Выбери цель в панели атаки (нужна сессия с мастером).'); return null; }
        var e = (sess.enemies || []).find(function (x) { return x.id === id; });
        if (!e || (e.curHp || 0) <= 0) { alert('Цель не найдена или уже мертва.'); return null; }
        return e;
    }
    function enemiesAround(centerKind, r, first, max, below) {
        var sess = window.CloudSync.getSessionData() || {}, g = (typeof sessGrid === 'function') ? sessGrid() : null, G = window.GridCore, res = [];
        function okLvl(e) { if (!below) return true; var L = (typeof getEnemyMeta === 'function' ? getEnemyMeta(e).level : e.level); return !L || L < lvl(); }
        if (!g || !G) return first && okLvl(first) ? [first] : [];
        var me = (typeof myUidG === 'function') ? myUidG() : null, myTok = G.tokenOf(g, 'p', me), tgTok = first ? G.tokenOf(g, 'e', first.id) : null;
        var c = centerKind === 'self' ? myTok : tgTok;
        if (!c) return first && okLvl(first) ? [first] : [];
        G.tokensInRadius(g, c, r).forEach(function (t) { if (t.kind !== 'e') return; var en = (sess.enemies || []).find(function (x) { return x.id === t.ref; }); if (en && (en.curHp || 0) > 0 && okLvl(en)) res.push({ e: en, d: G.cells(c, t) }); });
        res.sort(function (a, b) { return a.d - b.d; });
        var list = res.map(function (x) { return x.e; });
        if (first && centerKind === 'target' && !list.some(function (x) { return x.id === first.id; })) list.unshift(first);
        return max ? list.slice(0, max) : list;
    }
    function enemySave(e, label) {
        var dc = 10 + Math.floor(lvl() / 4), lv = (typeof getEnemyMeta === 'function' ? getEnemyMeta(e).level : e.level), bon = lv ? Math.floor(lv / 4) : 2, r = 1 + Math.floor(Math.random() * 20);
        return { saved: r + bon >= dc, text: 'спасбросок цели ' + r + '+' + bon + '=' + (r + bon) + ' против СЛ ' + dc };
    }
    function applyStatus(e, st) {
        if (st.save) { var sv = enemySave(e); if (sv.saved) { window.CloudSync.postCombatLog('🛡 «' + e.name + '» устоял(а) против «' + st.name + '» (' + sv.text + ').', name()); return Promise.resolve(false); } }
        return window.CloudSync.applyStatusToEnemy(e.id, st.name, st.desc, st.turns, name(), Object.assign({ unique: true }, st.extra || {})).then(function () { return true; });
    }
    function dotOn(e, dot) {
        var v = Math.round(dot.mult * lvl());
        return window.CloudSync.applyAlchemyToEnemy(e.id, [{ name: dot.name, kind: 'dot_hp', magnitude: v, duration: dot.rounds, unit: 'ходов' }], dot.name, name());
    }
    function dmgOn(e, mult, type, label) {
        var v = Math.round(mult * lvl());
        return window.CloudSync.applyDamageToEnemy(e.id, v, name(), '✨ ' + label + ' (' + name() + ') наносит «' + e.name + '» ' + v + ' урона', type, 0);
    }
    function pickAlly(wantFallen, rangeFt) {
        var sess = window.CloudSync.getSessionData() || {}, me = window.CloudSync.getCurrentUid(), ps = sess.participants || {};
        var list = Object.keys(ps).filter(function (u) { return u !== me && (!!ps[u].fallen) === !!wantFallen; }).map(function (u) { return { uid: u, name: ps[u].name || 'союзник' }; });
        if (!list.length) { alert(wantFallen ? 'Нет павших союзников.' : 'Нет союзников в сессии.'); return null; }
        if (list.length === 1) return list[0];
        var n = parseInt(prompt('Кого? Введи номер:\n' + list.map(function (x, i) { return (i + 1) + '. ' + x.name; }).join('\n')));
        return list[n - 1] || null;
    }
    // «Безумие» (d6) и «Безумный король» (d10)
    function chaos(scale10) {
        var c = S(), L = lvl(), mh = maxHpN(), sc = scale10 ? 1.5 : 1;
        var faces = scale10 ? 10 : 6, roll = 1 + Math.floor(Math.random() * faces);
        if (has(2) && running() && !powersUsedToday.cu2 && confirm('Выпало ' + roll + '. Перебросить («Безумный разум», раз в день)?')) { powersUsedToday.cu2 = true; roll = 1 + Math.floor(Math.random() * faces); }
        var txt = '';
        function heal(p) { var h = el('cur-hp'); var add = Math.round(mh * p / 100); h.value = Math.min(mh, curHpN() + add); try { updateVitalBars(); } catch (e) { } return '+' + add + ' HP'; }
        function buff(nm, turns, pct) { pushOrRefreshTimedEffect(selfEffect({ name: nm, turns: turns, pct: { weaponDamagePercent: pct } }, 'Шеогорат')); }
        function invis(t) { pushOrRefreshTimedEffect(selfEffect({ name: 'Безумная невидимость', turns: t, invis: true }, 'Шеогорат')); }
        function fear(r, t) { var tg = (el('attack-target-select') || {}).value; var first = tg ? ((window.CloudSync.getSessionData() || {}).enemies || []).find(function (x) { return x.id === tg; }) : null; enemiesAround('self', r, first || null, 0).forEach(function (e) { applyStatus(e, { name: 'Страх', turns: t, desc: 'Безумие Шеогората: охвачен ужасом' }); }); }
        var r = roll;
        if (r <= 6) {
            if (r === 1) { buff('Безумный азарт', 2, Math.round(25 * sc)); txt = 'урон оружием +' + Math.round(25 * sc) + '% на 2 круга'; }
            else if (r === 2) txt = 'лечение ' + heal(15 * sc);
            else if (r === 3) { var m = el('cur-mp'), mm = parseInt(el('max-mp').value) || 0, ad = Math.round(mm * 0.15 * sc); m.value = Math.min(mm, (parseInt(m.value) || 0) + ad); txt = 'мана +' + ad; }
            else if (r === 4) { invis(1); txt = 'невидимость на 1 круг'; }
            else if (r === 5) { fear(10 * (scale10 ? 1.5 : 1), 1); txt = 'страх на врагов поблизости на 1 круг'; }
            else { var lose = Math.round(mh * 0.10 * sc), h = el('cur-hp'); h.value = Math.max(1, curHpN() - lose); try { updateVitalBars(); } catch (e) { } txt = 'Принц смеётся: −' + lose + ' HP'; }
        } else if (r === 7) txt = 'лечение ' + heal(30);
        else if (r === 8) { invis(2); txt = 'невидимость на 2 круга'; }
        else if (r === 9) { buff('Безумная ярость', 2, 40); txt = 'урон оружием +40% на 2 круга'; }
        else { fear(15, 2); txt = 'страх на врагов в 15 фт на 2 круга'; }
        c.lastChaos = { roll: roll, txt: txt };
        log('🎭 ' + name() + ' — ' + (scale10 ? 'Безумный король' : 'Безумие') + ' (' + (scale10 ? 'd10' : 'd6') + ' = ' + roll + '): ' + txt + '.');
        alert('🎭 d' + faces + ' = ' + roll + ': ' + txt + '.');
        return true;
    }
    var SP = {
        chaos6: function () { return chaos(false); },
        chaos10: function () { return chaos(true); },
        deal20: function () {
            pushOrRefreshTimedEffect(Object.assign(selfEffect({ name: 'Сделка Клавикуса', turns: 999 }, 'Покупки −20% и +5 к Красноречию до конца дня'), { cuBuyMult: 0.8, cuSkill: { 'Красноречие': 5 }, untilDayEnd: true }));
            return true;
        },
        halfBuy: function () { S().halfBuy = true; alert('🤝 Следующая покупка у торговца (товар не дороже ' + lvl() * 50 + ' за штуку) — за половину цены.'); return true; },
        pact: function () {
            var cost = lvl() * 5, g = parseInt(goldEl().value) || 0;
            if (g < cost) { alert('Договор стоит ' + cost + ' септимов (есть ' + g + ').'); return false; }
            var al = pickAlly(false); if (!al) return false;
            if (!confirm('Заключить договор с ' + al.name + ' за ' + cost + ' септимов? +10% урона и +5% физ. сопротивления на 3 круга.')) return false;
            goldEl().value = g - cost;
            window.CloudSync.pushEffectToPlayer(al.uid, { id: 'cu' + Date.now(), name: name(), effectName: 'Договор Клавикуса', description: 'Договор: +10% урона оружием, +5% физ. сопротивления', turnsRemaining: 3, perRound: true, percentEffects: [{ type: 'weaponDamagePercent', value: 10 }, { type: 'resistPhysical', value: 5 }] }).catch(function () { });
            log('🤝 ' + name() + ' заключает договор с ' + al.name + '.');
            return true;
        },
        revive: function () {
            var c = S(), sess = window.CloudSync.getSessionData() || {}, ps = sess.participants || {};
            var now = Date.now(), tick = parseInt(sess.sessionTickCounter) || 0, seen = c.fallenSeen || {};
            var list = Object.keys(ps).filter(function (u) { return u !== window.CloudSync.getCurrentUid() && ps[u].fallen; }).filter(function (u) {
                var s = seen[u]; if (!s) return true; // не видели момент смерти: доверяем (мастер следит)
                return (tick - s.tick <= 12) || (!inCombatNow() && now - s.ts <= 120000);
            }).map(function (u) { return { uid: u, name: ps[u].name || 'союзник' }; });
            if (!list.length) { alert('Нет павшего союзника, которого ещё можно вернуть (12 ходов боя; после боя — 2 минуты).'); return false; }
            var al = list[0];
            if (list.length > 1) { var n = parseInt(prompt('Кого воскресить?\n' + list.map(function (x, i) { return (i + 1) + '. ' + x.name; }).join('\n'))); al = list[n - 1]; if (!al) return false; }
            window.CloudSync.pushEffectToPlayer(al.uid, { id: 'cuR' + Date.now(), cmd: 'death', action: 'allyRevive', hpPct: 50 }).catch(function () { });
            log('🌅 ' + name() + ' возвращает к жизни ' + al.name + ' («Королева зари»).');
            return true;
        }
    };
    window.cuUse = function (i) {
        var p = perkDef(i), c = S(); if (!p || !p.a) return;
        if (!active(i)) { alert('Дар сейчас не действует (нет перка, просрочено подношение, нарушен запрет, пал или вера не совпадает).'); return; }
        if (usedNow(i, p)) { alert(p.type === 'day' ? 'Уже использовано сегодня.' : 'Раз в неделю: ещё ' + weekLeft(i) + ' дн.'); return; }
        var kind = p.act === 'bonus' ? 'Бонусным действием' : 'Основным действием';
        if (p.act && !powerActionAllowed({ name: p.name, desc: kind, effect: {} })) return;
        var a = p.a, ok = true, L = lvl();
        if (a.sp) ok = SP[a.sp]();
        else {
            if (a.self && !condOk(a.self)) return;
            var tg = null, list = null, gridOn = (typeof sessGrid === 'function') ? sessGrid() : null;
            var needTarget = !!a.t || !!(a.ar && (a.ar.c === 'target' || !gridOn));
            if (needTarget) { tg = target(); if (!tg) return; }
            else { var sid = (el('attack-target-select') || {}).value; tg = sid ? (((window.CloudSync.getSessionData() || {}).enemies || []).find(function (x) { return x.id === sid && (x.curHp || 0) > 0; }) || null) : null; }
            if (a.t) {
                var T = a.t;
                if (T.drain) { dmgOn(tg, T.drain, 'magic', p.name).then(function (r) { var fin = (r && r.finalDmg) || 0; var h = el('cur-hp'); h.value = Math.min(maxHpN(), curHpN() + fin); try { updateVitalBars(); saveLocalStorage(); } catch (e) { } alertSafe('🩸 «' + p.name + '»: вытянуто ' + fin + ' HP.'); }).catch(function (e) { alert(e.message); }); }
                if (T.dot) dotOn(tg, T.dot).catch(function (e) { alert(e.message); });
                if (T.slow) window.CloudSync.applyStatusToEnemy(tg.id, 'Замедление (' + p.name + ')', '−' + T.slow + ' фт скорости', 3, name(), { unique: true }).catch(function () { });
                if (T.status) { if (T.status.belowLevel) { var lv = (typeof getEnemyMeta === 'function' ? getEnemyMeta(tg).level : tg.level); if (lv && lv >= L) { alert('Цель не ниже тебя по уровню — «' + p.name + '» не действует.'); return; } } applyStatus(tg, T.status).then(function (done) { alertSafe(done ? '✨ «' + p.name + '» действует на «' + tg.name + '».' : '🛡 «' + tg.name + '» устоял(а).'); }); }
            }
            if (a.ar) {
                var A = a.ar; list = enemiesAround(A.c, A.r, tg, A.max, A.status && A.status.belowLevel);
                if (A.undead) list = list.filter(function (e) { return typeof getEnemyMeta === 'function' && getEnemyMeta(e).kind === 'undead'; });
                if (!list.length) { alert('В зоне нет подходящих врагов (сетка боя и выбранная цель помогают определить зону).'); if (!a.heal && !a.self && !a.ally) return; }
                list.forEach(function (e) {
                    if (A.dmg) dmgOn(e, A.dmg.mult, A.dmg.type, p.name).catch(function () { });
                    if (A.dot) dotOn(e, A.dot).catch(function () { });
                    if (A.status) applyStatus(e, A.status);
                });
                if (list.length) alertSafe('✨ «' + p.name + '» задевает: ' + list.map(function (e) { return e.name; }).join(', ') + '.');
            }
            if (a.zone) {
                var Z = a.zone;
                if (typeof gridZoneAvailable === 'function' && gridZoneAvailable()) {
                    var zid = 'zone-cu-' + Date.now().toString(36);
                    window.CloudSync.addPendingZone({ id: zid, effId: zid, uid: (typeof myUidG === 'function' ? myUidG() : ''), ownerName: name(), spell: Z.name, kind: 'area', place: 'self', radiusFt: Z.r, dmg: Math.round(Z.mult * L), dmgType: Z.type, who: Z.undead ? 'undead' : 'all', icon: '☀', turns: null, unit: 'round', rounds: Z.rounds }, name()).catch(function (e) { alert('Зона не передана мастеру: ' + e.message); });
                } else alert('Боевой сетки нет: зону «' + Z.name + '» поставит мастер вручную (' + Z.r + ' фт, ' + Z.mult + '×L за круг по нежити, ' + Z.rounds + ' круга).');
            }
            if (a.heal) { var hh = el('cur-hp'), add = Math.round(maxHpN() * (a.heal.hp || 0) / 100); hh.value = Math.min(maxHpN(), curHpN() + add); try { updateVitalBars(); } catch (e) { } }
            if (a.cleanse) {
                var before = activeTimedEffects.length;
                activeTimedEffects = activeTimedEffects.filter(function (e) { return !(e && (e.dotHp || e.isPoisonEffect || /^Болезнь:/.test(e.effectName || '') || /Проклят/i.test(e.effectName || ''))); });
                alertSafe('✨ «' + p.name + '»: снято эффектов — ' + (before - activeTimedEffects.length) + '.');
            }
            if (a.ally) {
                var sess2 = window.CloudSync.getSessionData() || {}, ps2 = sess2.participants || {}, me2 = window.CloudSync.getCurrentUid();
                var hh2 = el('cur-hp'); hh2.value = Math.min(maxHpN(), curHpN() + Math.round(maxHpN() * a.ally.hp / 100));
                var g2 = (typeof sessGrid === 'function') ? sessGrid() : null, G2 = window.GridCore, names = [];
                Object.keys(ps2).forEach(function (u) {
                    if (u === me2) return; var pp = ps2[u]; if (pp.fallen) return;
                    if (g2 && G2) { var mt = G2.tokenOf(g2, 'p', me2), ot = G2.tokenOf(g2, 'p', u); if (mt && ot && G2.cells(mt, ot) > Math.floor(a.ally.r / 5)) return; }
                    window.CloudSync.pushEffectToPlayer(u, { id: 'cuH' + Date.now() + u.slice(0, 3), name: name(), effectName: p.name, instant: true, hp: Math.round((pp.maxHp || 0) * a.ally.hp / 100) }).catch(function () { }); names.push(pp.name || 'союзник');
                });
                try { updateVitalBars(); } catch (e) { }
                alertSafe('🍷 «' + p.name + '»: лечатся ты' + (names.length ? ' и ' + names.join(', ') : '') + '.');
            }
            if (a.self) { pushOrRefreshTimedEffect(selfEffect(a.self, '🕯 ' + p.desc)); }
        }
        if (ok === false) return;
        if (p.act) { if (p.act === 'bonus') markBonusAction(); else markCombatAction('attack'); }
        if (p.type === 'day') powersUsedToday['cu' + i] = true;
        if (p.type === 'week') { c.weekUsed = c.weekUsed || {}; c.weekUsed[i] = absDay(); }
        log('🕯 ' + name() + ' использует «' + p.name + '» (' + def().name + ').');
        try { renderActiveEffects(); } catch (e) { }
        save();
    };

    // ---------- Синхронизация, проверки ----------
    var _sig = null;
    window.cuSync = function () {
        try {
            var sig = JSON.stringify([faith(), lvl(), perkPointsAvailable, S(), conflict(), powersUsedToday.cu0, powersUsedToday.cu1, powersUsedToday.cu2, powersUsedToday.cu3, absDay()]);
            if (sig !== _sig) { _sig = sig; if (typeof renderSupernaturalStatusPlayer === 'function') renderSupernaturalStatusPlayer(); }
        } catch (e) { console.error('Культист (панель):', e); }
        // «до конца боя»: в сессии больше нет живых врагов — эффект спадает
        try { if (cuEffects().some(function (e) { return e.cuCombatEnd; }) && typeof inCombatNow === 'function' && !inCombatNow()) { activeTimedEffects = activeTimedEffects.filter(function (e) { return !(e && e.cuCombatEnd); }); try { renderActiveEffects(); } catch (er) { } } } catch (e) { }
        var c = S(); if (!c) return;
        // Мастер перевёл дату назад: отсчёты (подношение, неделя, смена Принца) начинаются с новой даты
        var now = absDay();
        if (c.lastOffer != null && c.lastOffer > now) c.lastOffer = now;
        if (c.swapDay != null && c.swapDay > now) c.swapDay = now;
        if (c.weekUsed) [0, 1, 2, 3].forEach(function (i) { if (c.weekUsed[i] != null && c.weekUsed[i] > now) c.weekUsed[i] = now; });
        if (!started() || c.fallen) return;
        // Стал оборотнем или вампиром-лордом: вера сама сменилась на Хирсина / Молаг Бала — культист другого Принца падает (решение Никиты 2026-11-06)
        var sh = playerSupernaturalState && playerSupernaturalState.faithShift;
        if (sh && sh.god && sh.god !== c.god) { c.shiftFall = sh.god; fall('стал(а) ' + (sh.god === 'hircine' ? 'оборотнем — вера перешла к Хирсину' : 'вампиром-лордом — вера перешла к Молаг Балу')); return; }
        if (daysSince() > 2 * window.CULT_OFFER_DAYS) fall('пропущено два срока подношения подряд');
    };
    // Следим за павшими союзниками (окно «Королевы зари»)
    window.cuOnSession = function () {
        var c = S(); if (!c || !has(3)) return;
        var sess = window.CloudSync.getSessionData() || {}, ps = sess.participants || {}, seen = c.fallenSeen || (c.fallenSeen = {}), tick = parseInt(sess.sessionTickCounter) || 0;
        Object.keys(ps).forEach(function (u) { if (ps[u].fallen) { if (!seen[u]) seen[u] = { tick: tick, ts: Date.now() }; } else if (seen[u]) seen[u] = null; }); // null, а не delete: облако сливает лист по полям и удалённый ключ вернулся бы
    };

    // ---------- Панель игрока ----------
    function relevant() { var c = S(); return !!(started() || (c && c.fallen) || GODS()[faith()]); }
    window.cuStatusHtml = function () {
        if (!relevant()) return '';
        var c = S(), g = faith(), d = def() || GODS()[g], on = started();
        if (!d) return '';
        var h = '<div style="border:1px solid #8e44ad; border-radius:6px; padding:8px; margin-top:8px; background:rgba(142,68,173,.08);">';
        var state = !on ? 'путь не начат' : fallen() ? '☠ пал' : (c.banned ? '⛔ нарушен запрет' : overdue() ? '⏸ подношение просрочено' : faith() !== c.god ? '⏸ вера не совпадает' : conflict() ? '⏸ несовместимый путь' : '✔ в силе');
        h += '<div class="row-name"><strong>' + d.icon + ' Путь культиста — ' + escHtml(d.name) + '</strong><span>' + state + '</span></div>';
        h += '<div style="font-size:12px; opacity:.85; margin:4px 0;">' + escHtml(window.CULT_COMMON) + '</div>';
        h += '<div style="font-size:12px;"><strong>Запрет:</strong> ' + escHtml(d.ban) + '</div>';
        if (!on) h += '<div style="font-size:12px; margin-top:4px; opacity:.85;">Перки культиста выдаёт мастер за очки перков (5, 15, 25 и 40 ур., квесты жителей 0/15/25/40).</div>';
        if (on) {
            var left = window.CULT_OFFER_DAYS - daysSince();
            h += '<div style="font-size:12px; margin-top:4px;">Метка: ' + (marked() ? '<span style="color:#c0392b;">видна (покупки +10%, продажа −10%)</span>' : 'скрыта «Покровом»') + ' · Подношение: ' + (left >= 0 ? 'через ' + left + ' дн.' : 'просрочено на ' + (-left) + ' дн.') + '</div>';
            if (c.fallen) h += '<div style="font-size:12px; color:#e74c3c;">☠ ' + escHtml(c.fallReason || '') + '</div>';
        }
        // перки
        h += '<div style="margin-top:6px;">';
        d.perks.forEach(function (p, i) {
            var hv = has(i), usedT = hv && usedNow(i, p);
            var tag = p.type === 'passive' ? 'пассив' : p.type === 'day' ? 'раз в день' : 'раз в неделю';
            if (!p.a && p.type !== 'passive') tag += ', срабатывает само';
            h += '<div style="padding:4px 0; border-top:1px dashed var(--border-color); opacity:' + (hv ? 1 : .65) + ';"><strong>' + (hv ? '✔ ' : '🔒 ') + escHtml(p.name) + '</strong> <span style="font-size:11px; opacity:.8;">(ур. ' + p.level + (p.quests ? ', заданий ' + p.quests : '') + ', ' + tag + (p.act ? ', ' + (p.act === 'bonus' ? 'бонусное' : 'основное') : '') + ')</span><div style="font-size:12px;">' + escHtml(p.desc) + '</div>';
            if (hv && p.a && p.type !== 'passive' && !(p.a.sp === undefined && !p.a.self && !p.a.t && !p.a.ar && !p.a.zone && !p.a.heal && !p.a.cleanse && !p.a.ally)) {
                var dis = !active(i) || usedT;
                h += '<button class="btn-success" style="width:100%; margin-top:3px;" ' + (dis ? 'disabled' : '') + ' onclick="cuUse(' + i + ')">' + escHtml(p.name) + (usedT ? (p.type === 'day' ? ' — использовано' : ' — ещё ' + weekLeft(i) + ' дн.') : '') + '</button>';
            }
            h += '</div>';
        });
        h += '</div>';
        // подношение
        if (on && !c.fallen) {
            h += '<div style="margin-top:6px;"><strong>Подношение</strong> (раз в ' + window.CULT_OFFER_DAYS + ' дн.):</div>';
            d.offer.opts.forEach(function (o, i) {
                var hv = o.k === 'deed' ? null : haveFor(o);
                h += '<div style="font-size:12px; margin:3px 0;">' + (o.k === 'deed' ? '📜 ' + escHtml(o.text) : '<button style="width:auto; padding:2px 10px;" ' + (hv.ok ? '' : 'disabled') + ' onclick="cuOffer(' + i + ')">Принести</button> ' + escHtml(o.text) + (o.k === 'stolen' ? ' (есть ' + hv.have + ')' : ' (' + hv.rows + ')')) + '</div>';
            });
            h += '<div style="font-size:12px; margin:3px 0;"><button style="width:auto; padding:2px 10px;" onclick="cuOffer(-1)">Золотом ' + (lvl() * 20) + '</button> запасной вариант</div>';
        }
        if (c && c.fallen) {
            if (c.penanceUsed) h += '<div style="font-size:12px;">Искупление уже было — остаётся отказаться от пути.</div>';
            else {
                h += '<div style="font-size:12px; margin-top:4px;">Искупление (один раз): ' + window.CULT_PENANCE_GOLD + ' септимов храму и подношение ×' + window.CULT_PENANCE_MULT + '.</div>';
                d.offer.opts.forEach(function (o, i) { if (o.k !== 'deed') h += '<button style="width:100%; margin-top:3px; font-size:12px;" onclick="cuPenance(' + i + ')">Искупить: ' + escHtml(o.text) + ' ×' + window.CULT_PENANCE_MULT + '</button>'; });
                h += '<button style="width:100%; margin-top:3px; font-size:12px;" onclick="cuPenance(-1)">Искупить золотом (' + (window.CULT_PENANCE_GOLD + lvl() * 20 * window.CULT_PENANCE_MULT) + ')</button>';
            }
        }
        if (on) h += '<button style="width:100%; margin-top:6px; font-size:12px; opacity:.7;" onclick="cuAbandon()">Отказаться от пути (очки вернутся)</button>';
        return h + '</div>';
    };
})();
