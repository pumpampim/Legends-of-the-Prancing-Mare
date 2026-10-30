
    // ========================================================================
    // ПЕРЕДАЧА ЗОЛОТА/ПРЕДМЕТА СОЮЗНИКУ — уже реализовано выше (tradeGoldToPlayer/
    // tradeItemToPlayer/renderTradeSelects), тут ничего дублировать не нужно.
    // ========================================================================

    // Задача L: урон когтей в форме зверя — база 20 (+5 каждые 4 уровня персонажа), умножается
    // рангом "Звериная сила" по числу съеденных сердец (25/50/75/100%).
    // ====================== Сверхъестественное: оборотень / вампир / вампир-лорд ======================
    function snVampire() { const s = playerSupernaturalState; return !!(s && s.vampirism); }
    // Голод по крови: обычный вампир — −2 ко всем хар-кам и ±10% резистов (холод+, огонь−) за каждый день без крови;
    // вампир-лорд — только −1 ко всем хар-кам за день. На 4-й день (стадия 4) стража нападает, жители бегут/атакуют.
    function vampHunger() { const s = playerSupernaturalState; return (s && s.vampirism && s.vampire) ? Math.min(4, Math.max(0, s.vampire.hungerStage || 0)) : 0; }
    function vampHungerStatPenalty() { const s = playerSupernaturalState; const h = vampHunger(); return h * ((s && s.vampire && s.vampire.isLord) ? 1 : 2); }
    var VAMPIRE_STAT_BONUS = { str: 1, dex: 1, con: 0, cha: 2, int: 0, wis: 0 }; // Фракции.xlsx: вампиризм +2 Хар, +1 Лов, +1 Сил
    function vampHungerResistDelta() { const s = playerSupernaturalState; return (s && s.vampire && s.vampire.isLord) ? 0 : vampHunger() * 10; }
    function snLordForm() { const s = playerSupernaturalState; return !!(s && s.vampirism && s.vampire && s.vampire.isLord && s.vampire.lordForm); }
    function snLordPerk(n) { const s = playerSupernaturalState; return !!(s && s.vampirism && s.vampire && s.vampire.isLord && s.vampire.lordPerks && s.vampire.lordPerks[n]); }
    const TRANSFORMS_PER_DAY = 1; // Фракции.xlsx: превращение раз в сутки
    function snTransformsLeft() {
        const w = playerSupernaturalState && playerSupernaturalState.werewolf;
        return w ? Math.max(0, TRANSFORMS_PER_DAY - (parseInt(w.transformsToday) || 0)) : 0;
    }
    // Призванные существа, привязанные к форме (питомцы тотема Братства — к форме вервольфа, гаргулья — к форме лорда).
    function snClearBoundSummons(kind) {
        const had = activeSummons.filter(s => s.boundToForm && (!kind || s.boundToForm === kind));
        if (!had.length) return 0;
        activeSummons = activeSummons.filter(s => !(s.boundToForm && (!kind || s.boundToForm === kind)));
        renderActiveSummonsList();
        return had.length;
    }
    // ====================== Рыцарь смерти / лич (lich-data.js; набросок игрока, правки Никиты 2026-10-30) ======================
    // Состояние лежит в supernaturalState.lich (перки и стадию выдаёт мастер; остальное меняет сам игрок). Всё, что только считается
    // (сопротивления, мана, вес, скорость, регенерация), берётся из него на лету — отдельных «эффектов лича» в листе нет.
    function snLich() { const s = playerSupernaturalState; return (s && s.lich) || null; }
    function lichPerk(id) { const l = snLich(); return !!(l && l.perks && l.perks[id]); }
    function lichStage() { const l = snLich(); return l ? (l.stage | 0) : 0; }
    function lichWeakenedPenalty() { const l = snLich(); return (l && l.weakened) ? 2 : 0; } // «ослабленный лич»: −2 ко всем характеристикам
    function lichManaBonus() { const st = lichStage(); return st >= 2 ? 125 : st === 1 ? 75 : 0; } // +25 сверх согласованных 50/100 (2026-10-30: лич лишён бонусов богов)
    function lichEffectActive(e) { return !!e && (e.turnsRemaining > 0 || e.turnsRemaining === Infinity); }
    function lichMaskKind() { const e = (activeTimedEffects || []).find(x => x && x.lichMask && lichEffectActive(x)); return e ? e.lichMask : ''; }
    function lichAuraId() { const e = (activeTimedEffects || []).find(x => x && x.lichAura); return e ? e.lichAura : ''; }
    function lichAlive() { return !(lichStage() >= 1 && lichMaskKind() === 'borrowed'); } // «Заёмная жизнь»: пока действует, нет регенерации и иммунитета
    function lichSave() { saveSupernaturalStatePlayer(); saveLocalStorage(); renderSupernaturalStatusPlayer(); updateAll(); }
    function lichLog(text) { if (window.CloudSync && window.CloudSync.postCombatLog) { const nm = (document.getElementById('char-name') || {}).value || 'Игрок'; window.CloudSync.postCombatLog(text, nm); } }
    function lichSpendMana(n) {
        const mp = document.getElementById('cur-mp'); const cur = parseInt(mp.value) || 0;
        if (cur < n) { alert(`Не хватает маны: нужно ${n}, есть ${cur}.`); return false; }
        mp.value = cur - n; updateVitalBars(); return true;
    }
    // Положенные заклинания → в книгу школ; вера → «Идеальные Повелители» (пакт отключает богов, храмы и амулеты)
    function lichApplyFaith() {
        const sel = document.getElementById('faith-god'); if (!sel) return;
        const l = snLich();
        if (lichPerk('pact')) {
            if (sel.value !== 'ideal') { if (l) l.prevFaith = sel.value; sel.value = 'ideal'; }
            sel.disabled = true;
        } else if (sel.value === 'ideal') { sel.value = (l && l.prevFaith) || 'none'; sel.disabled = false; }
        else sel.disabled = false;
    }
    function lichSync() {
        const l = snLich(); if (!l) return;
        const names = window.lichInjectSpells ? window.lichInjectSpells(l) : [];
        names.forEach(n => { const d = window.LICH_SPELLS[n]; try { learnSpellIntoBook(d.school, n); } catch (e) { console.error(e); } });
        lichApplyFaith();
    }
    var _lichSig = '';
    // Вампир-лорд верит в Молаг Бала, оборотень в Хирсина: вера меняется сама, ранг +1 (до 3); при снятии флага возвращается прежняя.
    function snFaithSync() {
        const sn = playerSupernaturalState, sel = document.getElementById('faith-god'), rk = document.getElementById('faith-rank');
        if (!sn || !sel || !rk || lichPerk('pact')) return;
        const want = (sn.vampire && sn.vampire.isLord) ? 'molag' : sn.lycanthropy ? 'hircine' : '';
        const sh = sn.faithShift && sn.faithShift.god ? sn.faithShift : null;
        let changed = false;
        if (want && (!sh || sh.god !== want)) {
            const prev = sh ? { prevGod: sh.prevGod, prevRank: sh.prevRank } : { prevGod: sel.value, prevRank: parseInt(rk.value) || 1 };
            sn.faithShift = { god: want, prevGod: prev.prevGod, prevRank: prev.prevRank };
            sel.value = want; rk.value = Math.min(3, prev.prevRank + 1); sel.disabled = true; changed = true;
        } else if (want) {
            if (sel.value !== want) { sel.value = want; changed = true; }
            sel.disabled = true;
        } else if (sh) {
            sel.value = sh.prevGod || 'none'; rk.value = sh.prevRank || 1; sel.disabled = false;
            sn.faithShift = null; changed = true;
        } else if (sel.disabled && sel.value !== 'ideal') sel.disabled = false;
        if (changed) { saveSupernaturalStatePlayer(); saveLocalStorage(); updateAll(); }
    }
    // «Аура смерти» высшего лича: пассивная, радиус 20 фт, все кроме лича и его нежити +5% уязвимости к магии и стихиям; на время маски гаснет.
    function lichDeathAuraSync() {
        const want = lichStage() >= 2 && !lichMaskKind();
        const has = (activeTimedEffects || []).find(e => e && e.lichDeath);
        if (want && !has) {
            const eff = { id: 'eff-lichdeath-' + Date.now().toString(36), name: 'Аура смерти', effectName: 'Аура смерти', lichDeath: true, turnsRemaining: Infinity, hp: 0, mp: 0, value: 0,
                description: '☠ Все существа в радиусе 20 фт, кроме тебя, твоей нежити и теней, получают +5% уязвимости к магии и стихиям. Гаснет, пока действует маска.' };
            if (typeof gridZoneAvailable === 'function' && gridZoneAvailable()) {
                const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
                eff.gridZoneId = eff.id;
                window.CloudSync.addPendingZone({ id: eff.id, effId: eff.id, uid: myUidG(), ownerName: myName, spell: 'Аура смерти', kind: 'aura', place: 'follow', radiusFt: 20, dmg: 0, dmgType: '', who: 'enemies', icon: '☠', turns: null, vuln: 5 }, myName).catch(e => console.error('Аура смерти:', e));
            }
            activeTimedEffects.push(eff); return true;
        }
        if (!want && has) { activeTimedEffects = activeTimedEffects.filter(e => !(e && e.lichDeath)); return true; }
        return false;
    }
    function lichAfterStateChange() {
        try { snFaithSync(); } catch (e) { console.error('Вера:', e); }
        const l = snLich();
        const sig = l ? JSON.stringify([l.perks, l.stage]) : '';
        if (sig === _lichSig) return;
        _lichSig = sig;
        lichSync();
        if (!lichPerk('pact')) activeTimedEffects = (activeTimedEffects || []).filter(e => !(e && (e.lichAura || e.lichBlade || e.lichMask || e.lichDeath)));
    }

    // ----- ауры (одна за раз) -----
    const LICH_AURAS = {
        ice: { perk: 'pact', name: 'Ледяная аура', icon: '❄️' },
        frost: { perk: 'bearer', name: 'Инеевая кожа', icon: '🧊' },
        rage: { perk: 'herald', name: 'Багровая ярость', icon: '🩸' }
    };
    window.lichToggleAura = function (id) {
        const A = LICH_AURAS[id]; if (!A || !lichPerk(A.perk)) return;
        const cur = lichAuraId();
        activeTimedEffects = (activeTimedEffects || []).filter(e => !(e && e.lichAura)); // зона ледяной ауры гаснет вместе с эффектом
        if (cur !== id) {
            const eff = { id: 'eff-lichaura-' + Date.now().toString(36), name: A.name, effectName: A.name, lichAura: id, turnsRemaining: Infinity, hp: 0, mp: 0, value: 0 };
            if (id === 'ice') {
                const rad = lichPerk('visage') ? 15 : 10;
                eff.description = `❄️ Враги в радиусе ${rad} фт: −10 фт скорости.`;
                if (typeof gridZoneAvailable === 'function' && gridZoneAvailable()) {
                    const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
                    eff.gridZoneId = eff.id;
                    window.CloudSync.addPendingZone({ id: eff.id, effId: eff.id, uid: myUidG(), ownerName: myName, spell: 'Ледяная аура', kind: 'aura', place: 'follow', radiusFt: rad, dmg: 0, dmgType: '', who: 'enemies', icon: '❄️', turns: null, slow: 10 }, myName).catch(e => alert('Зона не передана мастеру: ' + e.message));
                }
            } else if (id === 'frost') {
                eff.description = '🧊 Получаемый физический урон −15%.';
                eff.percentEffects = [{ type: 'resistPhysical', value: 15 }];
            } else {
                eff.description = '🩸 +10% к физическому урону, +5% пробития брони.';
                eff.percentEffects = [{ type: 'weaponDamagePercent', value: 10 }];
            }
            activeTimedEffects.push(eff);
        }
        renderActiveEffects(); updateAll(); saveLocalStorage(); renderSupernaturalStatusPlayer();
    };

    // ----- Окаменение (Носитель тьмы): круг неуязвимости; после становления личом — 2 раза в день, скорость вдвое, лечение больше -----
    window.lichPetrify = function () {
        if (!lichPerk('bearer')) return;
        const maxUses = lichStage() >= 1 ? 2 : 1, used = parseInt(powersUsedToday.lich_petrify) || 0;
        if (used >= maxUses) { alert(`«Окаменение» уже использовано сегодня (${used}/${maxUses}).`); return; }
        if (!combatActionAllowed('item')) return;
        markCombatAction('attack'); // тратит действие хода: в этот ход нельзя больше ничего
        powersUsedToday.lich_petrify = used + 1;
        const heal = lichStage() >= 1 ? 10 : 5;
        pushOrRefreshTimedEffect({ id: 'eff-petrify-' + Date.now().toString(36), name: 'Окаменение', effectName: 'Окаменение', turnsRemaining: 1, perRound: true, hp: 0, mp: 0, value: 0,
            regenHp: heal, regenMp: heal, powerFlag: 'petrify',
            description: `🧊 Покрыт льдом на 1 круг: неуязвим к любому урону и магическим эффектам врагов, скорость ${lichStage() >= 1 ? 'вдвое меньше' : '0'}, атаковать нельзя. В ход каждого существа +${heal} ХП и маны.` });
        renderActiveEffects(); updateAll(); saveLocalStorage(); renderSupernaturalStatusPlayer();
        lichLog(`🧊 ${(document.getElementById('char-name') || {}).value || 'Игрок'} покрывается льдом («Окаменение»): неуязвим на круг.`);
    };
    // ----- Клинок морозного огня (Вестник смерти): 80 маны, 3 круга +10 огня и +10 холода к каждому удару -----
    window.lichBlade = function () {
        if (!lichPerk('herald')) return;
        if (!combatActionAllowed('item')) return;
        if (!lichSpendMana(80)) return;
        markCombatAction('attack');
        pushOrRefreshTimedEffect({ id: 'eff-lichblade-' + Date.now().toString(36), name: 'Клинок морозного огня', effectName: 'Клинок морозного огня', lichBlade: true, turnsRemaining: 3, perRound: true, hp: 0, mp: 0, value: 0,
            description: '🔥❄️ Удары оружием наносят ещё 10 урона огнём и 10 урона холодом (перки огня и льда усиливают, как у заклинаний). 3 круга.' });
        renderActiveEffects(); updateAll(); saveLocalStorage(); renderSupernaturalStatusPlayer();
    };
    function lichBladeExtras(list) {
        const e = (activeTimedEffects || []).find(x => x && x.lichBlade && lichEffectActive(x)); if (!e) return '';
        const pb = window.perkBonuses || {};
        const f = Math.round(10 * (1 + (pb.fireSpellBonus || 0) / 100)), c = Math.round(10 * (1 + (pb.frostSpellBonus || 0) / 100));
        list.push({ type: 'fire', dmg: f, label: '🔥 Клинок морозного огня (огонь)' }, { type: 'frost', dmg: c, label: '❄️ Клинок морозного огня (холод)' });
        return ` (🔥❄️ Клинок: +${f} огнём и +${c} холодом)`;
    }
    // ----- переключатели -----
    function lichGrantPerk(id) {
        const def = (window.LICH_PERKS || []).find(p => p.id === id); if (!def) return '';
        if (!playerSupernaturalState) playerSupernaturalState = { lycanthropy: false, vampirism: false, werewolf: { heartsEaten: 0, totem: '— нет —', hasTransformedToday: false, transformsToday: 0, isTransformed: false }, vampire: { hungerStage: 0, isLord: false, lordForm: false, lordPerks: {}, reflexLeft: 0, abilities: {}, lordKills: 0 } };
        const s = playerSupernaturalState;
        if (s.vampirism || s.lycanthropy) { alert('Перк ветки не взят: вампиризм и ликантропия несовместимы с пактом.'); return ''; }
        const l = s.lich || (s.lich = window.lichDefault());
        if (l.perks[id]) return '';
        if ((characterLevel || 1) < def.level) { alert(`Перк «${def.name}» не взят: нужен ${def.level}-й уровень.`); return ''; }
        if (def.prereq && !l.perks[def.prereq]) { alert(`Перк «${def.name}» не взят: сначала нужен предыдущий перк ветки.`); return ''; }
        if (perkPointsAvailable <= 0) { alert(`Перк «${def.name}» не взят: нет свободного очка перков.`); return ''; }
        perkPointsAvailable -= 1;
        l.perks[id] = true;
        lichAfterStateChange();
        saveSupernaturalStatePlayer(); renderSupernaturalStatusPlayer();
        return `перк ветки «${def.name}»`;
    }
    // Правки мастера: снять перк, задать стадию, поправить флаги, сбросить ветку целиком.
    function lichAdminOp(c) {
        if (!playerSupernaturalState) return '';
        const s = playerSupernaturalState;
        const l = s.lich || (s.lich = window.lichDefault());
        const order = (window.LICH_PERKS || []).map(p => p.id);
        let msg = '';
        if (c.op === 'revoke') {
            const i = order.indexOf(c.perk); if (i < 0 || !l.perks[c.perk]) return '';
            order.slice(i).forEach(id => { if (l.perks[id]) { l.perks[id] = false; perkPointsAvailable += 1; } }); // false, а не delete: сохранение идёт merge-ом, и удалённый ключ вернулся бы из облака
            if (!l.perks.visage) l.stage = 0;
            msg = 'перки ветки лича сняты';
        } else if (c.op === 'stage') {
            const st = Math.max(0, Math.min(2, parseInt(c.stage) || 0));
            if (st >= 1 && !l.perks.visage) return '';
            l.stage = st; l.resReady = true; l.weakened = false; l.phylactery = 'intact'; l.daysSinceRes = 0;
            msg = st ? `становление: ${st === 1 ? 'низший' : 'высший'} лич` : 'лич снова рыцарь смерти';
        } else if (c.op === 'set' && c.patch && typeof c.patch === 'object') {
            ['resReady', 'weakened', 'phylactery', 'sacrificeCd', 'daysSinceRes', 'soulsOffered'].forEach(k => { if (k in c.patch) l[k] = c.patch[k]; });
            msg = 'состояние лича изменено мастером';
        } else if (c.op === 'reset') {
            const wasPerks = Object.keys(l.perks);
            wasPerks.forEach(id => { if (l.perks[id]) perkPointsAvailable += 1; });
            s.lich = window.lichDefault();
            wasPerks.forEach(id => { s.lich.perks[id] = false; }); // см. выше: merge не умеет удалять ключи
            msg = 'ветка лича сброшена';
        } else return '';
        _lichSig = ''; lichAfterStateChange();
        saveSupernaturalStatePlayer(); renderSupernaturalStatusPlayer();
        return msg;
    }
    window.lichToggleShadows = function () { const l = snLich(); if (!l) return; l.shadows = !l.shadows; lichSave(); };
    window.lichToggleVision = function () { const l = snLich(); if (!l) return; l.vision = !l.vision; lichSave(); };
    // ----- Удар теней и Жатва душ: добивающий удар -----
    function lichShadowCap() { return Math.min(10, Math.floor(getEffectiveSkillValue('Колдовство') / 25)); } // 1 тень за каждые 25 Колдовства (договорённость 2026-10-30)
    function lichOnKill(enemy, viaWeapon, slot) {
        const l = snLich(); if (!l || !enemy) return '';
        let msg = '';
        if (lichPerk('herald')) { // за каждые 10 убийств заряд зачарования оружия +1 день
            l.kills = (parseInt(l.kills) || 0) + 1;
            if (l.kills % 10 === 0) {
                const wId = equippedSlots.meleeWeapon, w = wId ? playerInventory.find(i => i.itemId === wId) : null;
                if (w && w.enchantment && Object.prototype.hasOwnProperty.call(w, 'chargeDaysLeft') && !w.isStaff) { w.chargeDaysLeft = (w.chargeDaysLeft || 0) + 1; msg += ` ⚡ ${l.kills} убийств: зачарование «${w.name}» перезаряжено на 1 день.`; }
                else msg += ` ⚡ ${l.kills} убийств: зачарование оружия перезаряжается на 1 день (мастер отмечает).`;
            }
            saveSupernaturalStatePlayer();
        }
        if (viaWeapon && lichPerk('visage') && l.shadows !== false) {
            const meta = getEnemyMeta(enemy), nm = String(enemy.name || '');
            const banned = meta.kind === 'automaton' || /атронах|дракон/i.test(nm) || enemy.boss || enemy.isBoss || /босс/i.test(String(enemy.category || ''));
            if (!banned) {
                const cap = lichShadowCap(), have = (activeSummons || []).filter(x => x && x.category === 'shadow').length;
                if (cap <= 0) msg += ' 👤 Тень не поднялась: нужно Колдовство 25+.';
                else if (have >= cap) msg += ` 👤 Теней уже ${have}/${cap}.`;
                else {
                    const hp = Math.max(1, Math.round((parseInt(enemy.maxHp) || parseInt(enemy.hp) || 20) / 2)), dm = Math.max(1, Math.round((parseInt(enemy.weaponDmg) || parseInt(enemy.dmg) || 10) / 2));
                    const r = performSummon({ category: 'shadow', name: 'Тень: ' + nm.replace(/\s*\(ур\..*$/, ''), hpBase: hp, dmgBase: dm, durBase: 10, speed: parseInt(enemy.speed) || 30, permanent: false }, false, { noCap: true });
                    msg += r.ok ? ` 👤 Восстаёт тень (${hp} ХП, урон ${dm}, 10 ходов), ${have + 1}/${cap}.` : '';
                }
            }
        }
        return msg;
    }
    // ----- Тёмное жертвоприношение, воскрешение -----
    function lichBlackGemName() { return (typeof soulFilledGemName === 'function') ? soulFilledGemName('black') : 'Заполненный чёрный камень душ'; }
    window.lichSacrifice = function () {
        const l = snLich(); if (!l || lichStage() < 1) return;
        if ((parseInt(l.sacrificeCd) || 0) > 0) { alert(`Камень душ ускоряет восстановление не чаще раза в 3 дня — подожди ещё ${l.sacrificeCd} дн.`); return; }
        if (l.resReady && !l.weakened) { alert('«Воскрешение» заряжено и ты не ослаблен — жертвовать нечего.'); return; }
        if (l.phylactery === 'destroyed') { alert('Филактерия разрушена — сначала её восстанавливают (5 заполненных чёрных камней, ритуал мастера).'); return; }
        const gem = lichBlackGemName();
        if (countInInventory(gem) <= 0) { alert(`Нужен «${gem}» в инвентаре.`); return; }
        if (!confirm('Принести чёрную душу в жертву у филактерии? Камень расходуется, «Воскрешение» заряжается сразу, ослабление снимается.')) return;
        removeFromInventoryByName(gem, 1);
        l.resReady = true; l.weakened = false; l.sacrificeCd = 3; l.daysSinceRes = 0;
        renderInventoryList(); lichSave();
        lichLog(`🕯 ${(document.getElementById('char-name') || {}).value || 'Игрок'} совершает «Тёмное жертвоприношение»: «Воскрешение» заряжено.`);
    };
    // Вызывается из checkDeath: ХП упали до нуля. true — лич воскрес и жизнь не потрачена.
    function lichTryResurrect() {
        const l = snLich();
        if (!l || lichStage() < 1 || !l.resReady || l.phylactery === 'destroyed') return false;
        const maxHp = parseInt(document.getElementById('max-hp').value) || 1;
        document.getElementById('cur-hp').value = Math.max(1, Math.ceil(maxHp / 2));
        l.resReady = false; l.weakened = true; l.daysSinceRes = 0;
        activeTimedEffects = (activeTimedEffects || []).filter(e => !(e && e.lichMask === 'illusion'));
        lichSave(); updateVitalBars();
        const nm = (document.getElementById('char-name') || {}).value || 'Лич';
        lichLog(`💀 ${nm} падает, но душа возвращается из филактерии: воскрес с половиной здоровья, «ослабленный лич» (−2 ко всем характеристикам до длительного отдыха).`);
        alert('💀 Филактерия возвращает тебя: ХП — половина максимума, статус «ослабленный лич» (−2 ко всем характеристикам до длительного отдыха). Жизнь не потрачена.');
        return true;
    }
    // Длительный отдых («Следующий день»)
    function lichDayTick() {
        const l = snLich(); if (!l) return false;
        let changed = false;
        if (l.weakened) { l.weakened = false; changed = true; }
        if (!l.resReady && l.phylactery !== 'destroyed') { l.daysSinceRes = (parseInt(l.daysSinceRes) || 0) + 1; if (l.daysSinceRes >= 7) { l.resReady = true; l.daysSinceRes = 0; } changed = true; }
        if ((parseInt(l.sacrificeCd) || 0) > 0) { l.sacrificeCd -= 1; changed = true; }
        const mk = (activeTimedEffects || []).find(e => e && e.lichMask === 'borrowed');
        if (mk) { mk.hoursLeft = (parseInt(mk.hoursLeft) || 0) - 24; if (mk.hoursLeft <= 0) activeTimedEffects = activeTimedEffects.filter(e => e !== mk); changed = true; }
        return changed;
    }
    // ----- Маска жизни -----
    const LICH_GEM_HOURS = { petty: 4, lesser: 8, common: 12, greater: 24, grand: 48, black: 48 };
    window.lichMask = function (kind) {
        const l = snLich(); if (!l) return;
        if (lichMaskKind()) { // повторное нажатие — снять
            activeTimedEffects = activeTimedEffects.filter(e => !(e && e.lichMask)); renderActiveEffects(); updateAll(); saveLocalStorage(); renderSupernaturalStatusPlayer(); return;
        }
        if (kind === 'illusion') {
            if (!lichPerk('visage')) return;
            if (!combatActionAllowed('cast')) return;
            if (!lichSpendMana(60)) return;
            markCombatAction('cast');
            pushOrRefreshTimedEffect({ id: 'eff-lichmask-' + Date.now().toString(36), name: 'Иллюзорная маска', effectName: 'Иллюзорная маска', lichMask: 'illusion', turnsRemaining: Infinity, hp: 0, mp: 0, value: 0,
                description: '🎭 Одна сцена (около часа): проверки на распознание нежити — против навыка Иллюзии вместо Красноречия; репутация без штрафа. Спадает, если получишь урон или колдуешь заклинание другой школы. Холод и неприятный взгляд остаются: штрафы к убеждению и красноречию не снимаются.' });
        } else {
            if (lichStage() < 1) return;
            if (!combatActionAllowed('cast')) return;
            const names = Object.keys(LICH_GEM_HOURS), have = names.filter(k => countInInventory(soulFilledGemName(k)) > 0);
            if (!have.length) { alert('Нужен заполненный камень душ в инвентаре.'); return; }
            const ans = prompt('Какой заполненный камень истратить?\n' + have.map((k, i) => `${i + 1} — ${soulFilledGemName(k)} (${LICH_GEM_HOURS[k]} ч)`).join('\n'), '1');
            const n = parseInt(ans); if (isNaN(n) || n < 1 || n > have.length) return;
            const k = have[n - 1];
            markCombatAction('cast');
            removeFromInventoryByName(soulFilledGemName(k), 1); renderInventoryList();
            pushOrRefreshTimedEffect({ id: 'eff-lichmask-' + Date.now().toString(36), name: 'Заёмная жизнь', effectName: 'Заёмная жизнь', lichMask: 'borrowed', hoursLeft: LICH_GEM_HOURS[k], turnsRemaining: Infinity, hp: 0, mp: 0, value: 0,
                description: `🫀 На ${LICH_GEM_HOURS[k]} ч ты «живой» для заклинания «Обнаружение жизни»: пульс и тепло. Проверки на распознание — против Колдовства с бонусом +5. Пока действует, нет регенерации и иммунитета к ядам и болезням. Урон маску не снимает.` });
        }
        renderActiveEffects(); updateAll(); saveLocalStorage(); renderSupernaturalStatusPlayer();
    };
    var _lichLastHp = null;
    function lichWatchHp(hp) { // Иллюзорная маска спадает от урона
        if (_lichLastHp !== null && hp < _lichLastHp && lichMaskKind() === 'illusion') {
            activeTimedEffects = activeTimedEffects.filter(e => !(e && e.lichMask === 'illusion')); renderActiveEffects(); renderSupernaturalStatusPlayer(); alertSafe('🎭 Иллюзорная маска спала: ты получил урон.');
        }
        _lichLastHp = hp;
    }

    // Лич не ест и не лечится зельями здоровья. true — использование заблокировано.
    function lichBlocksUse(item, isFood) {
        if (lichStage() < 1) return false;
        if (isFood) { alert('Лич не нуждается в еде: баффы еды на нём не работают.'); return true; }
        const txt = String((item && item.name) || '') + ' ' + String((item && item.effect) || '') + ' ' + JSON.stringify((item && item.alchemyEffects) || '');
        if (/(восстановлени[ея]|лечени[ея]|исцелени[ея])[^.\n]{0,24}здоровья|зелье\s+(лечения|здоровья)/i.test(txt) && !/урон здоровью/i.test(txt.replace(/Восстановление здоровья/g, 'Восст'))) {
            alert('Лич — нежить: зелья здоровья и лечение Восстановлением на него не действуют.'); return true;
        }
        return false;
    }
    // ----- панель на листе -----
    function lichStatusHtml() {
        try { if (lichDeathAuraSync()) { renderActiveEffects(); saveLocalStorage(); } } catch (e) { console.error(e); }
        const l = snLich(); if (!l || !(lichPerk('pact') || l.stage)) return '';
        const st = l.stage | 0, nPerks = window.LICH_PERKS.filter(p => l.perks[p.id]).length;
        const title = st >= 2 ? 'Высший лич' : st === 1 ? 'Низший лич' : 'Рыцарь смерти';
        const aura = lichAuraId();
        const used = parseInt(powersUsedToday.lich_petrify) || 0, maxUses = st >= 1 ? 2 : 1;
        const btn = (cls, fn, txt, extra) => `<button class="${cls}" style="width:auto; padding:3px 8px; font-size:12px; margin:2px 3px 0 0;" onclick="${fn}" ${extra || ''}>${txt}</button>`;
        let h = `<div class="party-row"><div class="row-name"><strong>💀 ${title}</strong><span>Перков ветки: ${nPerks}/4${l.weakened ? ' · ⚠ ослабленный (−2 ко всем хар-кам)' : ''}</span></div>`;
        h += `<div style="font-size:12px; opacity:.85;">Вера — Идеальные Повелители: боги, храмы, алтари и амулеты богов недоступны. Нельзя стать вампиром или оборотнем.</div>`;
        h += '<div style="margin-top:4px; font-size:12px;"><strong>Ауры</strong> (одна за раз):</div>';
        Object.keys(LICH_AURAS).forEach(id => { const A = LICH_AURAS[id]; if (lichPerk(A.perk)) h += btn(aura === id ? 'btn-danger' : 'btn-success', `lichToggleAura('${id}')`, `${A.icon} ${A.name}${aura === id ? ' — вкл' : ''}`); });
        h += '<div style="margin-top:6px; font-size:12px;"><strong>Способности</strong>:</div>';
        if (lichPerk('bearer')) h += btn('btn-success', 'lichPetrify()', `🧊 Окаменение (${used}/${maxUses} сегодня)`);
        if (lichPerk('herald')) h += btn('btn-success', 'lichBlade()', '🔥❄️ Клинок морозного огня (80 маны)');
        if (lichPerk('visage')) h += btn(l.shadows !== false ? 'btn-success' : '', 'lichToggleShadows()', `👤 Удар теней: ${l.shadows !== false ? 'вкл' : 'выкл'} (до ${lichShadowCap()})`);
        if (st >= 2) h += `<div style="font-size:12px; margin-top:3px;">☠ Аура смерти (20 фт, +5% уязвимости к магии и стихиям): <strong>${lichMaskKind() ? 'погашена маской' : 'действует'}</strong></div>`;
        if (st >= 1) h += btn(l.vision ? 'btn-success' : '', 'lichToggleVision()', `👁 Зрение невидимого: ${l.vision ? 'вкл' : 'выкл'}`);
        if (lichPerk('visage') || st >= 1) {
            const mk = lichMaskKind();
            h += '<div style="margin-top:6px; font-size:12px;"><strong>Маска жизни</strong>' + (mk ? ' — действует: ' + (mk === 'illusion' ? 'Иллюзорная маска' : 'Заёмная жизнь') : '') + ':</div>';
            if (mk) h += btn('btn-danger', "lichMask('')", 'Снять маску');
            else {
                if (lichPerk('visage')) h += btn('btn-success', "lichMask('illusion')", '🎭 Иллюзорная маска (60 маны)');
                if (st >= 1) h += btn('btn-success', "lichMask('borrowed')", '🫀 Заёмная жизнь (камень душ)');
            }
        }
        if (st >= 1) {
            h += `<div style="margin-top:6px; font-size:12px;"><strong>Филактерия</strong>: ${l.phylactery === 'destroyed' ? '<span style="color:#e74c3c;">разрушена</span>' : 'цела'} · «Воскрешение»: ${l.resReady ? '<span style="color:#2ecc71;">заряжено</span>' : `восстановится через ${Math.max(0, 7 - (parseInt(l.daysSinceRes) || 0))} дн.`}</div>`;
            h += btn('', 'lichSacrifice()', '🕯 Тёмное жертвоприношение (чёрный камень душ)', (l.resReady && !l.weakened) ? 'disabled' : '');
        }
        const checks = [];
        if (lichPerk('visage')) checks.push('+5 угрозы и запугивание, −10 убеждение, −5 красноречие (Красноречие уже уменьшено на листе)');
        if (st >= 1) checks.push('ещё +5 угрозы и запугивание, −5 убеждение; репутация не бывает положительной');
        if (checks.length) h += `<div style="margin-top:6px; font-size:12px; opacity:.85;">Проверки: ${checks.join('; ')}.</div>`;
        if (lichPerk('visage') && st === 0) h += '<div style="margin-top:4px; font-size:12px; color:#e6b800;">📜 Открыт квест на становление низшим личом (его ведёт мастер): 10 заполненных чёрных камней душ невинных, филактерия превосходства.</div>';
        if (st >= 1) h += '<div style="margin-top:4px; font-size:12px; opacity:.8;">Нежить: уязвим к электричеству +25%, серебру +50%, атакующим заклинаниям Восстановления +50%; не лечится Восстановлением и зельями здоровья, еда не действует. «Некролечение на себя» (Колдовство) — лечит. Раскрытие и «Охота на лича» ведёт мастер.</div>';
        return h + '</div>';
    }

    const LORD_PERKS = [
        { name: 'Сила Могилы', prereq: [], desc: '+50 здоровья и магии в форме вампира-лорда.' },
        { name: 'Хватка вампира', prereq: [['Сила Могилы']], desc: 'Магия крови (1 очко): придушить живое существо с < 10% здоровья.' },
        { name: 'Вызов гаргульи', prereq: [['Сила Могилы'], ['Хватка вампира']], desc: 'Магия крови (1 очко): призвать гаргулью-союзника (до выхода из формы).' },
        { name: 'Трупное проклятье', prereq: [['Сила Могилы'], ['Вызов гаргульи']], desc: 'Магия крови (1 очко): паралич цели на 4 хода (Сл. 17 + Мудрость).' },
        { name: 'Обнаружение существ', prereq: [['Сила Могилы']], desc: 'Сила ночи (1 очко): увидеть всех существ, включая автоматонов.' },
        { name: 'Туманная форма', prereq: [['Сила Могилы'], ['Обнаружение существ']], desc: 'Сила ночи (1 очко): 3 хода неуязвимости, но нельзя атаковать.' },
        { name: 'Сверхъестественные рефлексы', prereq: [['Сила Могилы'], ['Туманная форма']], desc: 'Сила ночи (1 очко): следующие 4 атаки получают +4 к кубам.' },
        { name: 'Лечение кровью', prereq: [['Сила Могилы']], desc: 'Убийство укусом или силовой атакой восстанавливает 50% макс. ХП.' },
        { name: 'Неземные желания', prereq: [['Сила Могилы']], desc: '+4 дополнительных заряда способностей Сил ночи и Магии крови в день.' },
        { name: 'Ядовитые когти', prereq: [['Сила Могилы']], desc: 'Рукопашные атаки (кулаки, укус) наносят +20 урона ядом.' },
        { name: 'Плащ ночи', prereq: [['Сила Могилы'], ['Неземные желания', 'Ядовитые когти']], desc: 'Стая летучих мышей наносит 10 урона всем живым врагам в начале каждого вашего хода (в форме лорда).' }
    ];
    const LORD_LIMITS = { vamp_grip: 2, vamp_gargoyle: 2, vamp_corpse_curse: 2, vamp_detect: 3, vamp_mist: 3, vamp_reflexes: 3 };
    const LORD_BONUS_CHARGES = 4;
    // Магия крови и Силы ночи (Фракции.xlsx): общий запас 10 очков, каждое умение — 1 очко. Восстанавливается раз в день,
    // когда утолён голод (кровь) — 10; не утолён — на следующий день 5, дальше 2 (четверть).
    const LORD_POOL_MAX = 10;
    function lordPool() { const v = (playerSupernaturalState && playerSupernaturalState.vampire) || {}; return typeof v.lordPool === 'number' ? v.lordPool : LORD_POOL_MAX; }
    function lordLeft(id) {
        const bonus = snLordPerk('Неземные желания') ? Math.max(0, LORD_BONUS_CHARGES - (parseInt(powersUsedToday.lord_bonus) || 0)) : 0;
        return { own: Math.max(0, lordPool()), bonus: bonus };
    }
    function lordSpend(id) {
        const l = lordLeft(id);
        if (l.own > 0) { playerSupernaturalState.vampire.lordPool = l.own - 1; saveSupernaturalStatePlayer(); return true; }
        if (l.bonus > 0) { powersUsedToday.lord_bonus = (parseInt(powersUsedToday.lord_bonus) || 0) + 1; return true; }
        return false;
    }
    function snWerewolfForm() {
        const s = playerSupernaturalState;
        return !!(s && s.lycanthropy && s.werewolf && s.werewolf.isTransformed);
    }
    function snWerewolfArmor(lvl) { return snWerewolfForm() ? 50 * Math.floor((parseInt(lvl) || 1) / 5) : 0; }
    function snAliveEnemies() {
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        return ((sess && sess.enemies) || []).filter(e => (e.curHp || 0) > 0);
    }
    function snRaisableCorpses() {
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        const currentTurn = (sess && sess.sessionTurnCounter) || 0;
        return ((sess && sess.enemies) || []).filter(e => e.isRaisable && !e.soulTaken && (e.curHp || 0) <= 0 && !e.raised && (e.diedAtTurn === undefined || currentTurn - e.diedAtTurn <= 5));
    }
    function snLordCorpses() { // «Воскрешение мёртвых» лорда: любой неподнятый труп
        const sess = window.CloudSync && window.CloudSync.getSessionData ? window.CloudSync.getSessionData() : null;
        return ((sess && sess.enemies) || []).filter(e => e.isRaisable && !e.soulTaken && (e.curHp || 0) <= 0 && !e.raised);
    }
    function snTargetValue(p) { const el = document.getElementById('pow-tgt-' + p.id); return el ? el.value : ''; }
    function snLog(text) {
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        if (window.CloudSync && window.CloudSync.postCombatLog) window.CloudSync.postCombatLog(text, myName);
    }
    function snLevelOf(e) { const m = getEnemyMeta(e); return m.level || parseInt(e.level) || 1; }

    // Особые умения оборотня/вампира/лорда с выбором цели и эффектом за пределами листа. Возвращает true, если способность сработала.
    function runSpecialPower(p) {
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        const lvl = playerLevelNow();
        const hearts = (playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.heartsEaten) || 0;
        const CS = window.CloudSync;
        const needSession = () => { if (!CS || !CS.getSessionData || !CS.getSessionData()) { alert('Нужна активная сессия с мастером.'); return false; } return true; };
        const pickEnemy = () => {
            if (!needSession()) return null;
            const id = snTargetValue(p);
            const e = snAliveEnemies().find(x => x.id === id);
            if (!e) { alert('Выбери живую цель в списке рядом с кнопкой.'); return null; }
            return e;
        };
        switch (p.special) {
            case 'wolf_pack': {
                const tpl0 = summonTemplates.find(t => t.spellName === 'Вызов питомца');
                if (!tpl0) return false;
                let nm = 'Призрачный питомец', hp = tpl0.hpBase, dm = tpl0.dmgBase;
                if (hearts >= 25) { nm = 'Вервольф (питомец)'; hp = 300; dm = 35; }
                else if (hearts >= 15) { nm = 'Снежный волк (питомец)'; hp = 160; dm = 30; }
                const tpl = Object.assign({}, tpl0, { name: nm, hpBase: hp, hpEnh: hp, dmgBase: dm, dmgEnh: dm, permanent: true, durBase: 0, durEnh: 0, enhCount: 2 });
                const before = activeSummons.length;
                const res = performSummon(tpl, true, { noCap: true });
                if (!res.ok) { alert(res.message); return false; }
                activeSummons.slice(before).forEach(s => { s.boundToForm = 'werewolf'; s.returnItem = null; });
                renderActiveSummonsList();
                snLog(`🐺 ${myName} воет, созывая стаю: ${res.message} Исчезнут, когда ${myName} выйдет из формы зверя.`);
                return true;
            }
            case 'wolf_fear': {
                // Фракции.xlsx: все существа вокруг до 12 уровня (с «Тотемом ужаса» — до 18) разбегаются; выше — спасбросок Сл. 5.
                if (!needSession()) return false;
                const lim = hearts >= 15 ? 18 : 12;
                const foes = snAliveEnemies();
                if (!foes.length) { alert('Рядом нет живых врагов.'); return false; }
                const parts = [];
                foes.forEach(e => {
                    if (getEnemyMeta(e).kind === 'automaton') { parts.push(`«${e.name}» — механизм, не боится`); return; }
                    const el = snLevelOf(e);
                    let affected = true, note = `ур. ${el} ≤ ${lim}`;
                    if (el > lim) {
                        const r = 1 + Math.floor(Math.random() * 20);
                        affected = r < 5;
                        note = `ур. ${el} > ${lim}, спасбросок д20 = ${r} против Сл. 5 — ${affected ? 'провал' : 'устоял(а)'}`;
                    }
                    if (affected) CS.applyStatusToEnemy(e.id, 'Жуткий вой', 'Не может атаковать (страх, 2 хода)', 2, myName, { noAttack: true, unique: true }).catch(err => console.error(err));
                    parts.push(`«${e.name}» ${affected ? 'в страхе 2 хода' : 'не поддался'} (${note})`);
                });
                snLog(`🐺 ${myName} издаёт Жуткий вой: ${parts.join('; ')}.`);
                alertSafe('🐺 Жуткий вой:\n' + parts.join('\n'));
                return true;
            }
            case 'vamp_drain': {
                const e = pickEnemy(); if (!e) return false;
                const k = getEnemyMeta(e).kind;
                if (['undead', 'automaton'].indexOf(k) !== -1) { alert('Высасывание не действует на нежить и механизмы.'); return false; }
                CS.applyDamageToEnemy(e.id, 5, myName, `🧛 ${myName} высасывает здоровье у «${e.name}»: урон 5`, 'magic', 0).then(r => {
                    const hpEl = document.getElementById('cur-hp'), maxHp = parseInt(document.getElementById('max-hp').value) || 0;
                    const heal = Math.min(r.finalDmg, Math.max(0, maxHp - (parseInt(hpEl.value) || 0)));
                    hpEl.value = (parseInt(hpEl.value) || 0) + heal; updateVitalBars(); saveLocalStorage();
                    alertSafe(`Высасывание: «${r.enemyName}» −${r.finalDmg} ХП, ты +${heal} ХП.`);
                }).catch(err => alert('Ошибка: ' + err.message));
                return true;
            }
            case 'vamp_lord_bats': {
                const last = powersUsedToday.lord_bats_turn;
                if (inCombatNow() && typeof last === 'number' && (gameTurn || 0) - last < 2) { alert(`«Летучие мыши» перезаряжаются: ещё ${2 - ((gameTurn || 0) - last)} ход(а).`); return false; }
                powersUsedToday.lord_bats_turn = gameTurn || 0;
                snLog(`🦇 ${myName} рассыпается стаей летучих мышей и перелетает на 15 футов.`);
                alertSafe('Летучие мыши: перемести свой жетон на 15 футов (перезарядка 2 хода).');
                return true;
            }
            case 'vamp_lord_drain': {
                if (inCombatNow() && powersUsedToday.lord_drain_turn === (gameTurn || 0)) { alert('Поглощение жизни — раз в ход.'); return false; }
                const e = pickEnemy(); if (!e) return false;
                const k = getEnemyMeta(e).kind;
                if (['undead', 'automaton'].indexOf(k) !== -1) { alert('Поглощение не действует на нежить и механизмы.'); return false; }
                powersUsedToday.lord_drain_turn = gameTurn || 0;
                CS.applyDamageToEnemy(e.id, 20, myName, `🧛 ${myName} поглощает жизнь «${e.name}»: урон 20`, 'magic', 0).then(r => {
                    const hpEl = document.getElementById('cur-hp'), maxHp = parseInt(document.getElementById('max-hp').value) || 0;
                    const heal = Math.min(r.finalDmg, Math.max(0, maxHp - (parseInt(hpEl.value) || 0)));
                    hpEl.value = (parseInt(hpEl.value) || 0) + heal; updateVitalBars(); saveLocalStorage();
                    alertSafe(`Поглощение жизни: «${r.enemyName}» −${r.finalDmg} ХП, ты +${heal} ХП.`);
                }).catch(err => alert('Ошибка: ' + err.message));
                return true;
            }
            case 'vamp_lord_raise': {
                if (!needSession()) return false;
                const corpses = snLordCorpses();
                const id = snTargetValue(p);
                const corpse = corpses.find(c => c.id === id) || corpses[0];
                if (!corpse) { alert('Нет трупа, который можно поднять.'); return false; }
                const hpR = parseInt(corpse.maxHp) || 100;
                const tpl = { category: 'corpse', name: (corpse.name || 'Мертвец') + ' (поднят лордом)', hpBase: hpR, hpEnh: hpR, dmgBase: 30, dmgEnh: 30, dmgType: 'физический', durBase: 15, durEnh: 15 };
                const res = performSummon(tpl, false, { noCap: true });
                if (!res.ok) { alert(res.message); return false; }
                try { CS.markCorpseRaised(corpse.id); } catch (e) { }
                snLog(`🦇 ${myName} воскрешает «${corpse.name}»: 30 урона, 15 ходов.`);
                return true;
            }
            case 'vamp_raise': {
                if (!needSession()) return false;
                const corpses = snRaisableCorpses();
                const id = snTargetValue(p);
                const corpse = corpses.find(c => c.id === id) || corpses[0];
                if (!corpse) { alert('Нет подходящего трупа (можно поднять в первые 5 ходов после смерти).'); return false; }
                const tpl = { category: 'corpse', name: (corpse.name || 'Мертвец') + ' (поднят)', hpBase: 160, hpEnh: 160, dmgBase: 30, dmgEnh: 30, dmgType: 'физический', durBase: 30, durEnh: 30 };
                const res = performSummon(tpl, false, { noCap: true });
                if (!res.ok) { alert(res.message); return false; }
                try { CS.markCorpseRaised(corpse.id); } catch (e) { }
                snLog(`🧛 ${myName} поднимает «${corpse.name}»: 160 ХП, 30 урона, 30 ходов.`);
                return true;
            }
            case 'vamp_grip': {
                const e = pickEnemy(); if (!e) return false;
                const k = getEnemyMeta(e).kind;
                if (['undead', 'automaton', 'daedra'].indexOf(k) !== -1) { alert('Хватка действует только на живых существ.'); return false; }
                if (!((e.curHp || 0) * 10 < (e.maxHp || e.curHp))) { alert('Хватка действует на цель с менее чем 10% здоровья.'); return false; }
                CS.applyDamageToEnemy(e.id, e.curHp, myName, `🩸 ${myName}: Хватка вампира душит «${e.name}» насмерть`, undefined, 0).catch(err => alert('Ошибка: ' + err.message));
                if (snLordPerk('Лечение кровью')) setTimeout(() => snLordKillHeal('Хватка'), 0);
                return true;
            }
            case 'vamp_gargoyle': {
                const tpl = { category: 'pet', name: 'Гаргулья', hpBase: 200, dmgBase: 40, dmgType: 'физический', durBase: 0, permanent: true, estimated: true };
                const before = activeSummons.length;
                const res = performSummon(tpl, false, { noCap: true });
                if (!res.ok) { alert(res.message); return false; }
                activeSummons.slice(before).forEach(s => { s.boundToForm = 'lord'; s.returnItem = null; });
                renderActiveSummonsList();
                snLog(`🦇 ${myName} призывает гаргулью (исчезнет с выходом из формы лорда).`);
                return true;
            }
            case 'vamp_corpse_curse': {
                const e = pickEnemy(); if (!e) return false;
                const dc = 17 + playerStatMod('wis');
                const emod = calcAbilityMod(parseInt(e.wis) || 10), r = 1 + Math.floor(Math.random() * 20), tot = r + emod;
                const fail = tot < dc;
                const note = `спасбросок «${e.name}»: д20 ${r}${emod >= 0 ? '+' : ''}${emod} = ${tot} против Сл. ${dc} — ${fail ? 'ПРОВАЛ' : 'устоял(а)'}`;
                if (fail) CS.applyStatusToEnemy(e.id, 'Паралич (Трупное проклятье)', 'Парализован — не может атаковать (4 хода)', 4, myName, { noAttack: true, helpless: true, unique: true }).catch(err => alert('Ошибка: ' + err.message));
                snLog(`💀 ${myName} накладывает Трупное проклятье: ${note}.`);
                alertSafe('Трупное проклятье: ' + note);
                return true;
            }
            case 'aggression': {
                const e = pickEnemy(); if (!e) return false;
                snLog(`🛡 ${myName} бонусным действием рвётся к «${e.name}» (Агрессия): движение с обычной скоростью, должно закончиться ближе к цели, чем началось.`);
                alertSafe(`Агрессия: двигайся к «${e.name}» — по обычной скорости (${(document.getElementById('val-speed') || {}).value || '—'} фт.).`);
                return true;
            }
            case 'ritual_word': {
                const e = pickEnemy(); if (!e) return false;
                if (getEnemyMeta(e).kind !== 'undead') { alert('Благословенное Слово действует только на нежить.'); return false; }
                const dc = 8 + Math.max(playerStatMod('wis'), playerStatMod('cha'));
                const emod = calcAbilityMod(parseInt(e.wis) || 10), r = 1 + Math.floor(Math.random() * 20), tot = r + emod, fail = tot < dc;
                const note = `спасбросок Мудрости «${e.name}»: д20 ${r}${emod >= 0 ? '+' : ''}${emod} = ${tot} против Сл. ${dc} — ${fail ? 'ПРОВАЛ, обращена в бегство на 2 хода' : 'устояла'}`;
                if (fail) CS.applyStatusToEnemy(e.id, 'Бегство (Благословенное Слово)', 'Обращена в бегство — не может атаковать (2 хода или пока не получит урон)', 2, myName, { noAttack: true, breakOnDamage: true, unique: true }).catch(err => alert('Ошибка: ' + err.message));
                snLog(`✝ ${myName} произносит Благословенное Слово: ${note}.`);
                alertSafe('Благословенное Слово: ' + note);
                return true;
            }
            case 'lover_kiss': {
                const e = pickEnemy(); if (!e) return false;
                const k = getEnemyMeta(e).kind;
                if (['animal', 'monster', 'undead', 'daedra', 'automaton'].indexOf(k) !== -1) { alert('Поцелуй действует только на гуманоидов.'); return false; }
                const dc = 8 + Math.max(playerStatMod('con'), playerStatMod('wis'));
                const emod = calcAbilityMod(parseInt(e.wis) || 10), r = 1 + Math.floor(Math.random() * 20), tot = r + emod, fail = tot < dc;
                const note = `спасбросок Мудрости «${e.name}»: д20 ${r}${emod >= 0 ? '+' : ''}${emod} = ${tot} против Сл. ${dc} — ${fail ? 'ПРОВАЛ, паралич на 2 хода' : 'устоял(а)'}`;
                if (fail) CS.applyStatusToEnemy(e.id, 'Паралич (Поцелуй любовника)', 'Парализован (2 хода), снимается уроном', 2, myName, { noAttack: true, helpless: true, breakOnDamage: true, unique: true }).catch(err => alert('Ошибка: ' + err.message));
                snLog(`💋 ${myName} целует «${e.name}»: ${note}.`);
                alertSafe('Поцелуй любовника: ' + note);
                return true;
            }
            case 'tower_key': {
                const tier = (document.getElementById('lock-tier') || {}).selectedOptions;
                const tname = tier && tier[0] ? tier[0].textContent.split(' (')[0] : 'выбранный';
                const lr = document.getElementById('lock-result');
                if (lr) lr.innerHTML = `<span style="color:#2ecc71;">🗼 «Башенный ключ»: замок (${escHtml(tname)}) открыт без броска и без отмычки.</span>`;
                snLog(`🗼 ${myName} разыгрывает «Открывание» (Башенный ключ): замок «${tname}» открыт без затрат магии.`);
                alertSafe(`🗼 Замок (${tname}) открыт без броска.`);
                return true;
            }
            case 'zmey_cure': {
                const before = activeTimedEffects.length;
                const isDis = x => x.effectName && x.effectName.indexOf('Болезнь:') === 0;
                const dis = activeTimedEffects.find(isDis);
                const notes = [];
                if (dis) { activeTimedEffects = activeTimedEffects.filter(x => x !== dis); notes.push('излечена болезнь «' + dis.effectName.replace('Болезнь: ', '') + '»'); }
                const mag = activeTimedEffects.find(x => isNegativeTimedEffect(x) && !isDis(x) && !x.isPoisonEffect && !x.dotHp);
                if (mag) { activeTimedEffects = activeTimedEffects.filter(x => x !== mag); notes.push('снят магический эффект «' + (mag.effectName || mag.name) + '»'); }
                if (!notes.length) notes.push('лечить нечего');
                snLog(`🐍 ${myName} очищается (Змей): ${notes.join('; ')}.`);
                alertSafe('🐍 Очищение: ' + notes.join('; '));
                return true;
            }
            case 'zmey_poison': {
                const e = pickEnemy(); if (!e) return false;
                const n = levelBracket(p.effect.poison.diceByLevel, lvl), inst = rollNd(n, 6);
                CS.applyDamageToEnemy(e.id, inst.sum, myName, `🐍 ${myName} касается «${e.name}» ядом: ${n}d6 [${inst.rolls.join('+')}] = ${inst.sum} (игнорирует сопротивление)`, 'poison', 100)
                    .then(() => CS.applyStatusToEnemy(e.id, 'Яд Змея', `${n}d10 урона ядом в начале каждого хода (бросок каждый ход)`, 15, myName, { dotHp: n, dotDice: [n, 10], dotNoResist: true, unique: true }))
                    .catch(err => alert('Ошибка: ' + err.message));
                snLog(`🐍 ${myName}: ядовитое касание «${e.name}» — мгновенно ${inst.sum}, затем ${n}d10 в начале каждого хода, 15 ходов.`);
                return true;
            }
            case 'wolf_hunt': {
                if (!needSession()) return false;
                const list = snAliveEnemies().map(e => e.name + ' (ур. ' + snLevelOf(e) + (e.statusEffects && e.statusEffects.length ? ', под эффектом' : '') + ')');
                snLog(`🐺 ${myName} чует кровь (Запах крови): живых существ рядом — ${list.length}.`);
                alertSafe('🐺 Запах крови (3 хода):\n' + (list.length ? list.join('\n') : 'Никого живого рядом.') + (hearts >= 20 ? '\n\nС тотемом хищника: на весь данж / 200 фт.; видно, спокойны ли они.' : ''));
                return true;
            }
            case 'vamp_detect': {
                if (!needSession()) return false;
                const c = {}; snAliveEnemies().forEach(e => { c[e.name] = (c[e.name] || 0) + 1; });
                const list = Object.keys(c).map(n => c[n] > 1 ? n + ' ×' + c[n] : n);
                snLog(`🦇 ${myName} использует Обнаружение существ.`);
                alert('🦇 Обнаружение существ (включая механизмы):\n' + (list.length ? list.join('\n') : 'Никого не обнаружено.') + '\n\nДальность и расположение уточняет мастер.');
                return true;
            }
            case 'vamp_reflexes': {
                playerSupernaturalState.vampire.reflexLeft = 4;
                saveSupernaturalStatePlayer();
                snLog(`🦇 ${myName}: Сверхъестественные рефлексы — следующие 4 атаки с +4 к кубам.`);
                return true;
            }
        }
        return false;
    }
    function snLordKillHeal(src) {
        const hpEl = document.getElementById('cur-hp'), maxHp = parseInt(document.getElementById('max-hp').value) || 0;
        const heal = Math.floor(maxHp / 2), cur = parseInt(hpEl.value) || 0;
        hpEl.value = Math.max(cur, Math.min(maxHp, cur + heal)); updateVitalBars(); saveLocalStorage();
        snLog(`🩸 ${(document.getElementById('char-name') || {}).value || 'Игрок'}: «Лечение кровью» (${src}) — +${Math.max(0, Math.min(maxHp, cur + heal) - cur)} ХП.`);
    }
    // «Плащ ночи»: в начале каждого хода игрока стая летучих мышей бьёт всех живых врагов на 10.
    function snNightCloakTick() {
        if (!(snLordForm() && snLordPerk('Плащ ночи'))) return;
        const myName = (document.getElementById('char-name') || {}).value || 'Игрок';
        snAliveEnemies().forEach(e => {
            window.CloudSync.applyDamageToEnemy(e.id, 10, myName, `🦇 «Плащ ночи» (${myName}) терзает «${e.name}»: урон 10`, 'physical', 0).catch(() => { });
        });
    }
    function lordBiteDamage() { return 10 + 5 * Math.floor((parseInt((document.getElementById('char-level') || {}).value) || 1) / 5); } // рукопашный бой лорда: 10 (+5 за каждые 5 уровней)
    // Очки перков лорда — за убийства людей в форме лорда: 5, 6, 9, 10, 12, 14, 16, 18, 20, 22, 24 (всего 156 на 11 очков).
    const LORD_KILL_STEPS = [5, 6, 9, 10, 12, 14, 16, 18, 20, 22, 24];
    function lordPointsEarned(kills) { let need = 0, n = 0; for (const st of LORD_KILL_STEPS) { need += st; if (kills >= need) n++; else break; } return n; }
    function lordNextPointAt(kills) { let need = 0; for (const st of LORD_KILL_STEPS) { need += st; if (kills < need) return need; } return null; }
    function lordPointsFree() {
        const v = (playerSupernaturalState && playerSupernaturalState.vampire) || {};
        const taken = Object.keys(v.lordPerks || {}).filter(k => v.lordPerks[k]).length;
        return Math.max(0, lordPointsEarned(parseInt(v.lordKills) || 0) + (parseInt(v.lordPerksLegacy) || 0) - taken);
    }
    function lordCountKill(enemy) {
        if (!snLordForm() || !enemy || getEnemyMeta(enemy).kind !== 'people') return '';
        const v = playerSupernaturalState.vampire;
        const before = lordPointsEarned(parseInt(v.lordKills) || 0);
        v.lordKills = (parseInt(v.lordKills) || 0) + 1;
        saveSupernaturalStatePlayer(); renderLordPerks();
        return lordPointsEarned(v.lordKills) > before ? ' 🦇 Новое очко перков вампира-лорда!' : '';
    }

    // Панель перков ветки вампира-лорда (вкладка «Ветки перков»)
    function renderLordPerks() {
        const box = document.getElementById('lord-perks-panel');
        if (!box) return;
        const s = playerSupernaturalState;
        if (!(s && s.vampirism && s.vampire && s.vampire.isLord)) { box.style.display = 'none'; box.innerHTML = ''; return; }
        box.style.display = '';
        const got = s.vampire.lordPerks || {};
        const killsL = parseInt(s.vampire.lordKills) || 0, nextL = lordNextPointAt(killsL);
        box.innerHTML = `<h2>🧛 Ветка вампира-лорда</h2><p style="font-size:13px; opacity:.85;">Очки лорда: свободно <strong>${lordPointsFree()}</strong>. Даются за убийства людей в форме лорда: убито ${killsL}${nextL ? `, следующее очко на ${nextL}` : ' (все 11 очков получены)'}. Каждый перк стоит 1 очко. Способности работают только в форме лорда (кнопка на главной вкладке).</p>` +
            LORD_PERKS.map(p => {
                const taken = !!got[p.name];
                const reqTxt = p.prereq.length ? 'Требует: ' + p.prereq.map(g => g.join(' или ')).join('; ') : 'Без требований';
                return `<div class="party-row" style="display:flex; gap:8px; align-items:flex-start;"><input type="checkbox" class="lord-perk-chk" data-perk="${escHtml(p.name)}" ${taken ? 'checked' : ''} onchange="toggleLordPerk('${jsq(p.name)}', this)" style="margin-top:4px;"><div><strong>${escHtml(p.name)}</strong><div style="font-size:13px;">${escHtml(p.desc)}</div><div style="font-size:11px; opacity:.6;">${escHtml(reqTxt)}</div></div></div>`;
            }).join('');
    }
    window.toggleLordPerk = function (name, chk) {
        const s = playerSupernaturalState; if (!s || !s.vampire || !s.vampire.isLord) { chk.checked = false; return; }
        const perk = LORD_PERKS.find(p => p.name === name); if (!perk) return;
        s.vampire.lordPerks = s.vampire.lordPerks || {};
        const got = s.vampire.lordPerks;
        if (!chk.checked) {
            // Как и в обычных ветках: взятый перк вампира-лорда не снимается и очко не возвращается.
            chk.checked = true;
            alert('Перк уже взят — отказаться от него нельзя.');
            return;
        } else {
            for (const g of perk.prereq) {
                if (!g.some(n => got[n])) { chk.checked = false; alert(`Сначала нужен перк: ${g.join(' или ')}.`); return; }
            }
            if (lordPointsFree() <= 0) { chk.checked = false; alert('Нет свободных очков лорда. Они даются за убийства людей в форме вампира-лорда.'); return; }
            got[name] = true;
        }
        saveSupernaturalStatePlayer();
        renderLordPerks(); renderLevelPanel(); renderPowersPanel(); updateAll(); saveLocalStorage();
    };
    window.playerToggleLordForm = function () {
        const s = playerSupernaturalState; if (!s || !s.vampire || !s.vampire.isLord) return;
        s.vampire.lordForm = !s.vampire.lordForm;
        if (!s.vampire.lordForm) { snClearBoundSummons('lord'); activeTimedEffects = activeTimedEffects.filter(e => e.powerFlag !== 'mist'); s.vampire.reflexLeft = 0; if (typeof renderActiveEffects === 'function') renderActiveEffects(); }
        saveSupernaturalStatePlayer();
        renderSupernaturalStatusPlayer(); renderPowersPanel(); updateAll();
        if (typeof renderAttackActionSelect === 'function') renderAttackActionSelect();
        saveLocalStorage();
        snLog(s.vampire.lordForm ? `🦇 ${(document.getElementById('char-name') || {}).value || 'Игрок'} принимает форму вампира-лорда!` : `🧛 ${(document.getElementById('char-name') || {}).value || 'Игрок'} возвращает обычный облик.`);
    };

    function getWerewolfClawDamage() {
        const level = parseInt(document.getElementById('char-level').value) || 1;
        let dmg = 20 + 5 * Math.floor((level - 1) / 4);
        const hearts = (playerSupernaturalState && playerSupernaturalState.werewolf && playerSupernaturalState.werewolf.heartsEaten) || 0;
        let mult = 1;
        if (hearts >= 21) mult = 2;
        else if (hearts >= 11) mult = 1.75;
        else if (hearts >= 7) mult = 1.5;
        else if (hearts >= 5) mult = 1.25;
        return Math.round(dmg * mult);
    }

    // Управляющие заклинания (Страх/Успокоение/Ярость/Полиморф и семья "отпугивание нежити") —
    // раньше были чистым текстом без всякого механического следа: применяются к ВРАГУ (не к
    // игроку, поэтому не подходят под GM_STATUS_EFFECTS), урона не наносят. Цифры (длительность,
    // ограничение по уровню цели — мастер сам решает, подходит ли цель) — из реальных описаний
    // заклинаний. Уровень цели не проверяется автоматически (у врагов в базе нет поля "уровень"
    // как числа у большинства) — мастер применяет по своему усмотрению.
    const PLAYER_CONTROL_SPELLS = {
        'Отпугивание младшей нежити': { status: 'Бегство', turns: 7, desc: 'Обращена в бегство (нежить до 6 ур.)' },
        'Отталкивание младшей нежити': { status: 'Бегство', turns: 7, desc: 'Обращена в бегство (нежить до 8 ур.)' },
        'Отпугивание нежити': { status: 'Бегство', turns: 7, desc: 'Обращена в бегство (нежить до 10 ур.)' },
        'Отталкивание нежити': { status: 'Бегство', turns: 5, desc: 'Обращена в бегство (нежить до 13 ур.)' },
        'Отпугивание старшей нежити': { status: 'Бегство', turns: 5, desc: 'Обращена в бегство (нежить до 16 ур.)' },
        'Страх': { status: 'Страх', turns: 7, desc: 'Бежит с поля боя (существа/люди до 9 ур.)' },
        'Бегство': { status: 'Бегство', turns: 5, desc: 'Бежит с поля боя (существа/люди до 18 ур.)' },
        'Успокоение': { status: 'Успокоение', turns: 7, desc: 'Не атакует (существа/люди до 9 ур.)' },
        'Умиротворение': { status: 'Успокоение', turns: 11, desc: 'Не атакует (существа/люди до 17 ур.)' },
        'Ярость': { status: 'Ярость', turns: 7, desc: 'Атакует любую ближайшую цель, включая союзников (до 6 ур.)' },
        'Бешенство': { status: 'Ярость', turns: 9, desc: 'Атакует любую ближайшую цель, включая союзников (до 12 ур.)' },
        'Руна бешенства': { status: 'Ярость', turns: 8, desc: 'При срабатывании руны атакует любую цель (до 17 ур.)' },
        'Полиморф': { status: 'Полиморф', turns: 2, desc: 'Превращена в овцу — любой урон по ней снимает эффект (до 15 ур.)' },
        // Проклятие слабости (Колдовство): −20% наносимого физ.урона врага (учитывает мастер при атаках врага). Усиление «Колдовства» увеличивает %.
        'Проклятие слабости': { status: 'Проклятие слабости', turns: 10, desc: 'Наносимый физ.урон врага −20%', extra: { dmgPct: -20 } },
        // Хрупкость: броня −150 = −15% физ. сопротивления цели (по правилу «10 брони = 1%»), 6 ходов; усиленно −250 (−25%), 9 ходов.
        'Хрупкость': { status: 'Хрупкость', turns: 6, desc: 'Броня −150 (физ. сопротивление −15%)', extra: { res: { physical: -15 } },
            enh: { turns: 9, desc: 'Броня −250 (физ. сопротивление −25%)', extra: { res: { physical: -25 } } } },
        // Поглощение магии: отнимает ману у врага и отдаёт заклинателю (10, усиленно 25).
        'Поглощение магии': { status: 'Поглощение магии', turns: null, absorbMp: 10, desc: 'Поглощает 10 маны врага', enh: { absorbMp: 25, desc: 'Поглощает 25 маны врага' } }
    };

    // Превращение (как Полиморф, но слабее) и заклинания против даэдра. Уровни берутся из описаний заклинаний.
    Object.assign(PLAYER_CONTROL_SPELLS, {
        'Превращение': { status: 'Полиморф', turns: 2, desc: 'Превращена в овцу — любой урон по ней снимает эффект (до 10 ур.)' },
        'Изгнание даэдра': { status: 'Изгнан', turns: null, desc: 'Изгнан в Обливион (даэдра до 10 ур.)', banish: true },
        'Высылка даэдра': { status: 'Изгнан', turns: null, desc: 'Изгнан в Обливион (даэдра до 15 ур.)', banish: true },
        'Приказ даэдра': { status: 'Под контролем', turns: null, desc: 'Сражается на стороне игрока (призванный даэдра до 15 ур.)', command: true },
        // Без броска сопротивления: «работает всегда» (по решению автора). Длительность — из описания.
        'Паралич': { status: 'Паралич', turns: 4, desc: 'Парализован — не действует (без сопротивления)', autoHit: true, parseTurns: true },
        'Гравитационный куб': { status: 'Гравитационная клетка', turns: 9, desc: 'Заточён в гравитационной клетке — не может двигаться (без сопротивления)', autoHit: true, parseTurns: true }
    });

    // Живое описание заклинания из базы (сохранённые карточки могут хранить устаревший текст).
    function liveSpellDesc(spell) {
        return (spell && !spell.isCustom && findSpellDescByName(spell.name)) || (spell && spell.desc) || '';
    }
    // Часть описания: базовая (до «Усиленный эффект») или усиленная; пустое усиление → базовый текст.
    function splitEnhancedDesc(desc, enhanced) {
        const full = String(desc || '');
        const idx = full.search(/усилен[а-яёА-ЯЁ]*\s+эффект/i);
        if (idx === -1) return full;
        const base = full.slice(0, idx);
        if (!enhanced) return base;
        const after = full.slice(idx).replace(/усилен[а-яёА-ЯЁ]*\s+эффект/i, '').replace(/Стоимость тома[^\n]*/i, '').replace(/^[\s\-–—]+/, '');
        return after.trim() ? after : base;
    }
    function hasEnhancedDesc(desc) {
        const full = String(desc || '');
        const idx = full.search(/усилен[а-яёА-ЯЁ]*\s+эффект/i);
        if (idx === -1) return false;
        return !!full.slice(idx).replace(/усилен[а-яёА-ЯЁ]*\s+эффект/i, '').replace(/Стоимость тома[^\n]*/i, '').replace(/[\s\-–—]/g, '');
    }
    function parseControlTextParams(desc, enhanced) {
        const text = splitEnhancedDesc(desc, enhanced);
        const lm = text.match(/до\s+(\d+)\s*уров/i) || text.match(/не\s+выше\s+(\d+)/i);
        const tm = text.match(/(?:в\s+течени[ие]|на)\s+(\d+)\s*ход/i);
        return { maxLevel: lm ? parseInt(lm[1], 10) : null, turns: tm ? parseInt(tm[1], 10) : null };
    }
    // Уровень и тип цели: поля врага → строка «(ур.N» в имени бандитов → база врагов → догадка по имени.
    function getEnemyMeta(target) {
        const nm = String((target && target.name) || '');
        let level = (target && typeof target.level === 'number' && target.level > 0) ? target.level : null;
        let kind = (target && target.kind) || null;
        if (level === null) { const m = nm.match(/\(ур\.\s*(\d+)/); if (m) level = parseInt(m[1], 10); }
        const baseName = nm.replace(/\s*\(ур\..*$/, '');
        const db = (window.enemiesData || []).find(e => e.name === nm || e.name === baseName);
        if (db) { if (level === null && db.level) level = db.level; if (!kind && db.kind) kind = db.kind; }
        if (!kind) {
            const l = nm.toLowerCase();
            if (/скелет|драугр|нежить|привед|зомби|гончая смерти|вампир/.test(l)) kind = 'undead';
            else if (/дремора|атронах|даэдр/.test(l)) kind = 'daedra';
            else if (/двемер/.test(l)) kind = 'automaton';
            else if (/бандит|разбойник|громил|грабител|головорез|мародер|изгой/.test(l)) kind = 'people';
        }
        return { level, kind, summoned: !(target && target.summoned === false) };
    }
    const KIND_LABEL = { animal: 'зверь', monster: 'монстр', people: 'человек/мер', undead: 'нежить', daedra: 'даэдра', automaton: 'механизм' };
    // Проверка цели для заклинания «до N уровня». kindFail — не тот тип цели; levelFail — уровень выше предела.
    function checkControlTarget(spell, target, enhanced) {
        const name = spell.name;
        const full = liveSpellDesc(spell);
        const p = parseControlTextParams(full, enhanced);
        const out = { kindFail: false, levelFail: false, reason: '', notes: [], maxLevel: p.maxLevel, turns: p.turns, meta: null };
        if (out.turns && lichPerk('bearer') && /Проклят|Хрупкость/.test(name)) out.turns = Math.ceil(out.turns * 1.25); // «Носитель тьмы»: проклятия Колдовства на 25% дольше
        let affects = 'living';
        if (/нежит/i.test(name)) affects = 'undead';
        else if (/даэдр/i.test(name)) affects = 'daedra';
        else if (['Проклятие слабости', 'Хрупкость', 'Поглощение магии', 'Паралич', 'Гравитационный куб'].indexOf(name) !== -1) affects = 'any';
        else if (name === 'Руна бешенства' && enhanced) affects = 'any'; // усиленная действует на всех
        if (spell.school === 'illus' && affects === 'living' && (window.perkBonuses || {}).illusionMindMaster) affects = 'any'; // «Мастер разума»
        const meta = getEnemyMeta(target);
        out.meta = meta;
        if (affects !== 'any') {
            if (meta.kind) {
                const bad = affects === 'undead' ? meta.kind !== 'undead'
                    : affects === 'daedra' ? meta.kind !== 'daedra'
                    : ['undead', 'daedra', 'automaton'].indexOf(meta.kind) !== -1;
                if (bad) {
                    out.kindFail = true;
                    out.reason = affects === 'undead' ? `действует только на нежить, а «${target.name}» — ${KIND_LABEL[meta.kind]}`
                        : affects === 'daedra' ? `действует только на даэдра, а «${target.name}» — ${KIND_LABEL[meta.kind]}`
                        : `не действует на нежить, даэдра и механизмы («${target.name}» — ${KIND_LABEL[meta.kind]})`;
                }
            } else out.notes.push('тип цели не указан — мастер решает, подходит ли цель');
        }
        if (p.maxLevel !== null) {
            let eff = p.maxLevel;
            const bonuses = [];
            if (spell.school === 'illus') {
                const sb = getSchoolBoost(spell.school);
                if (sb.pct) { const b = Math.round(eff * sb.mult); if (b !== eff) eff = b; }
                const pbI = window.perkBonuses || {};
                if (enhanced && pbI.dualIllus) { eff *= 2; bonuses.push('«Двойная иллюзия» ×2 уровень'); }
                if (meta.kind === 'people' && pbI.peopleLevelBonus) { eff += pbI.peopleLevelBonus; bonuses.push('«Обман людских глаз» +' + pbI.peopleLevelBonus); }
                if (/^(Страх|Бегство)$/.test(name) && pbI.fearLevelBonus) { eff += pbI.fearLevelBonus; bonuses.push('«Наука страха» +' + pbI.fearLevelBonus); }
                if (/^(Ярость|Бешенство|Руна бешенства)$/.test(name) && pbI.furyLevelBonus) { eff += pbI.furyLevelBonus; bonuses.push('«Неистовство» +' + pbI.furyLevelBonus); }
                if (meta.kind === 'animal' && isPerkChecked('Обман животных')) { eff += 4; bonuses.push('«Обман животных» +4'); }
                if (/^(Успокоение|Умиротворение)$/.test(name) && isPerkChecked('Гипнотический взгляд')) { eff += 4; bonuses.push('«Гипнотический взгляд» +4'); }
            }
            out.maxLevel = eff;
            out.bonusNote = bonuses.join(', ');
            if (meta.level === null) out.notes.push('уровень цели не указан — мастер решает, подходит ли цель');
            else if (meta.level > eff) {
                out.levelFail = true;
                if (!out.reason) out.reason = `уровень цели (${meta.level}) выше предела заклинания (до ${eff})`;
            }
        }
        return out;
    }
