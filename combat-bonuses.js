// ============================================================================
// COMBAT-BONUSES.JS — расчёт урона оружием в одном месте (TASK-001, вариант А)
//
// Зачем: формула удара игрока жила внутри updateCombat (index.html) вперемешку с чтением DOM, а дух на оружии —
// отдельно, в rollPlayerAttack. Теперь вся арифметика здесь, а index.html только СОБИРАЕТ входные данные
// (поля листа, перки, эффекты, бога) и рисует результат. Модуль без DOM и без Firebase: его можно гонять
// на фиксированных данных (window.__stSelfTestAttack) и одинаково звать с листа игрока и с экрана мастера.
//
// ВАЖНО: математика перенесена ОДИН В ОДИН, включая порядок шагов и места округления. Проценты здесь
// перемножаются по очереди (каждый — Math.round(урон × (1 + %/100))), а не складываются, и общего потолка
// множителя нет — это правила автора. Менять порядок шагов = менять баланс, только по явному решению.
// ============================================================================
(function () {
    'use strict';

    const TWO_HANDED = ['twohand_sword', 'twohand_axe', 'twohand_hammer'];
    const abilityMod = v => Math.floor((v - 10) / 2);

    // Какой навык усиливает атаку данным оружием (та же логика, что weaponBoostSkill в index.html).
    function weaponBoostSkill(mode, wepType, isTwoHanded) {
        if (mode !== 'melee') return 'стрельба';
        if (wepType === 'unarmed') return null;
        return isTwoHanded ? 'двуручное оружие' : 'одноручное оружие';
    }

    // Урон оружием игрока. input — уже прочитанные значения листа (см. collectPlayerAttackInput в index.html):
    //   mode 'melee'|'ranged', starve, str, dex, wis, perks,
    //   isPowerAttack, isDualWield, isSprintAttack,
    //   melee: { dmg, type, name, offhandDmg }, ranged: { dmg, ammoDmg, type, name }  (dmg — parseInt, может быть NaN),
    //   enchantDmgMelee, enchantDmgRanged, offhandEnchantDmg,
    //   weaponDmgPct, skillBoostPct: { 'стрельба', 'одноручное оружие', 'двуручное оружие' },
    //   unarmedBonus, steelFistsArmor (класс брони тяжёлых перчаток, 0 если не тяжёлая броня/нет перчаток),
    //   weaponDmgFlat, god (activeGodBonuses), elementalEnchant: { melee, ranged }, sheogorathMult.
    // steps — журнал шагов {source, op:'add'|'mul', value}; по нему applyBonuses воспроизводит итог.
    function computePlayerWeaponAttack(input) {
        const I = input || {};
        const mode = I.mode;
        const starve = I.starve || 0;
        const str = I.str, dex = I.dex;
        const perks = I.perks || {};
        const gb = k => (I.god && I.god[k]) || 0;
        const steps = [];
        let totalDmg = 2;
        const add = (source, v) => { if (v) steps.push({ source, op: 'add', value: v }); totalDmg += v; };
        const mul = (source, f) => { steps.push({ source, op: 'mul', value: f }); totalDmg = Math.round(totalDmg * f); };

        let baseDmg = 2, hitModifier = 0;
        let wepType = 'unarmed';
        const infoNotes = [];
        let enchantDmgMain = 0, offhandDmg = 0, offhandEnchantDmg = 0, statModForFormula = 0, statLabelForFormula = 'Сила';

        const strMod = Math.floor((str - 10) / 2);
        const dexMod = Math.floor((dex - 10) / 2);
        const isPowerAttack = !!I.isPowerAttack, isDualWield = !!I.isDualWield, isSprintAttack = !!I.isSprintAttack;
        const melee = I.melee || {}, ranged = I.ranged || {};

        if (mode === 'melee') {
            baseDmg = melee.dmg || 2;
            wepType = melee.type;
            const wepName = String(melee.name || '').toLowerCase();
            // Призванное оружие (имя начинается с «Призван…») бьёт от Мудрости, а не от Силы.
            const isSummonedWeapon = wepName.indexOf('призван') === 0;
            const wisMod = abilityMod(I.wis);
            hitModifier = isSummonedWeapon ? wisMod : strMod;

            if (wepType === 'twohand_sword') hitModifier -= 2;
            if (wepType === 'twohand_axe') hitModifier -= 3;
            if (wepType === 'twohand_hammer') hitModifier -= 4;

            const isTwoHanded = TWO_HANDED.indexOf(wepType) !== -1;

            // Бонусы от перков к базовому урону (дробные — округление только на множителях ниже, как и раньше)
            let perkBonus = 0;
            perkBonus += baseDmg * (isTwoHanded ? (perks.twoHandedDamage || 0) : (perks.oneHandedDamage || 0)); // Сильная рука / Варвар
            if (wepType === 'onehand' || wepType === 'twohand_sword') {
                if (wepName.includes('коп') || wepName.includes('пик')) perkBonus += (perks.spearBleedDamage || 0) + (perks.spearResistDamage || 0);
            }
            if (wepType === 'onehand' && wepName.includes('топ')) perkBonus += (perks.axeBleedDamage || 0);
            if (wepType === 'twohand_axe') perkBonus += (perks.greatAxeBleedDamage || 0);
            if (perks.armorPenetrationDamage) perkBonus += perks.armorPenetrationDamage; // Боевые искусства

            if (wepType === 'onehand' && wepName.includes('булав') && perks.maceArmorPenetration) {
                infoNotes.push(`🔨 Костолом: игнорирует ${Math.round(perks.maceArmorPenetration * 100)}% брони цели`);
            }
            if (wepType === 'twohand_hammer' && perks.hammerArmorPenetration) {
                infoNotes.push(`🔨 Крушитель черепов: игнорирует ${Math.round(perks.hammerArmorPenetration * 100)}% брони цели`);
            }

            enchantDmgMain = I.enchantDmgMelee || 0;
            statModForFormula = str; statLabelForFormula = 'Сила';
            totalDmg = baseDmg + perkBonus + str;
            steps.push({ source: 'оружие', op: 'set', value: baseDmg }, { source: 'перки', op: 'add', value: perkBonus }, { source: 'Сила', op: 'add', value: str });
            add('зачарование оружия', enchantDmgMain);

            // Двойное оружие (одноручное/кинжал, не для двуручного)
            if (isDualWield && !isTwoHanded && wepType !== 'unarmed') {
                if (perks.dualWieldHitBonus) hitModifier += perks.dualWieldHitBonus;
                offhandDmg = melee.offhandDmg || 0;
                offhandEnchantDmg = I.offhandEnchantDmg || 0;
                if (offhandDmg > 0 || offhandEnchantDmg > 0) add('второе оружие', offhandDmg + offhandEnchantDmg);
            }

            // Силовая атака / Рывок-атака
            if (isPowerAttack && wepType !== 'unarmed') {
                if (perks.powerAttackHitBonus) hitModifier += perks.powerAttackHitBonus;
                if (perks.twoHandedPowerAttackHitBonus && isTwoHanded) hitModifier += perks.twoHandedPowerAttackHitBonus;

                const sprintPerkUnlocked = perks.sprintPowerAttackDouble;
                if (isSprintAttack && sprintPerkUnlocked) {
                    mul('рывок-атака', 2);
                    infoNotes.push('🏃 Рывок-атака: фиксированный х2 урона (дистанция подтверждена мастером)');
                } else {
                    if (isSprintAttack && !sprintPerkUnlocked) {
                        infoNotes.push('⚠ Галочка «Рывок-атака» стоит, но перк «Рывок»/«Великий рывок» не открыт — считается как обычная силовая атака.');
                    }
                    let powerMult = 1.5;
                    if (perks.standingPowerAttackDamage) powerMult += perks.standingPowerAttackDamage;
                    if (isDualWield && !isTwoHanded && perks.dualWieldPowerAttackDamage) powerMult += perks.dualWieldPowerAttackDamage;
                    mul('силовая атака', powerMult);
                    if (perks.decapitationChance) infoNotes.push(`💀 Шанс обезглавливания: ${Math.round(perks.decapitationChance * 100)}%`);
                }
            } else if (isSprintAttack) {
                infoNotes.push('⚠️ Рывок-атака засчитывается только вместе с «Силовой атакой»');
            }

            if (perks.hitBonus) hitModifier += perks.hitBonus;
            if (wepType === 'onehand' && isPowerAttack && wepName.includes('меч')) hitModifier += (perks.swordPowerAttackHitBonus || 0);
            if (wepType === 'twohand_sword' && isPowerAttack) hitModifier += (perks.greatswordPowerAttackHitBonus || 0);

            if (perks.counterAttackBonus) infoNotes.push('🛡️ Контрудар активен: за каждые 2 полученных попадания +1 к кубам до смерти противника');
            if (wepType === 'unarmed' && perks.canUseGauntlets) infoNotes.push('👊 Безоружный бой: можно атаковать кастетами');
            if (isTwoHanded && perks.sweepingSideAttack && isPowerAttack) infoNotes.push('🌀 Веерная атака: силовая атака при шаге вбок задевает всех противников впереди');
        } else {
            // Дальний бой
            baseDmg = ranged.dmg || 0;
            const ammoDmg = ranged.ammoDmg || 0;
            wepType = ranged.type;
            const rangedWepName = String(ranged.name || '').toLowerCase();
            const isSummonedRanged = rangedWepName.indexOf('призван') === 0; // призванный лук бьёт от Мудрости
            const wis = I.wis;
            const rangedWisMod = abilityMod(wis);
            hitModifier = isSummonedRanged ? rangedWisMod : dexMod;
            enchantDmgMain = I.enchantDmgRanged || 0;
            statModForFormula = isSummonedRanged ? wis : dex; statLabelForFormula = isSummonedRanged ? 'Мудрость' : 'Ловкость';
            totalDmg = baseDmg + (isSummonedRanged ? wis : dex) + ammoDmg;
            steps.push({ source: 'оружие', op: 'set', value: baseDmg }, { source: statLabelForFormula, op: 'add', value: statModForFormula }, { source: 'стрела', op: 'add', value: ammoDmg });
            add('зачарование оружия', enchantDmgMain);

            if (perks.rangedDamagePercent) add('Избыточное натяжение', Math.round(baseDmg * perks.rangedDamagePercent));
            if (perks.criticalShotStrFraction) {
                const strBonus = Math.round(strMod * perks.criticalShotStrFraction);
                if (strBonus) {
                    add('Критический выстрел', strBonus);
                    infoNotes.push(`🎯 Критический выстрел: +${strBonus} от Силы`);
                }
            }
            if (perks.rangedHitBonus) hitModifier += perks.rangedHitBonus;
        }

        hitModifier -= starve * 2;

        // Баффы «урон оружия +N%» (заклинания/зелья)
        const weaponDmgPct = I.weaponDmgPct || 0;
        if (weaponDmgPct) mul('бафф урона оружия', 1 + weaponDmgPct / 100);
        // «Повышение навыка» (зачарование/зелье): Одноручное/Двуручное/Стрельба
        const boostSkillKey = weaponBoostSkill(mode, wepType, TWO_HANDED.indexOf(wepType) !== -1);
        const weaponBoostPct = boostSkillKey ? ((I.skillBoostPct || {})[boostSkillKey] || 0) : 0;
        if (weaponBoostPct) mul('повышение навыка', 1 + weaponBoostPct / 100);
        if (mode === 'melee' && wepType === 'unarmed') { const unB = I.unarmedBonus || 0; if (unB) add('Трансмутация мускулы', unB); }
        let steelFistsNote = 0;
        if (mode === 'melee' && wepType === 'unarmed' && perks.steelFists && I.steelFistsArmor) { // «Стальные кулаки»
            add('Стальные кулаки', I.steelFistsArmor); steelFistsNote = I.steelFistsArmor;
        }
        const weaponDmgFlat = I.weaponDmgFlat || 0;
        if (weaponDmgFlat) { steps.push({ source: 'ослабление', op: 'add', value: weaponDmgFlat }, { source: 'не ниже 0', op: 'max0' }); totalDmg = Math.max(0, totalDmg + weaponDmgFlat); }

        // Бонусы бога
        const godDmgNotes = [];
        if (steelFistsNote) godDmgNotes.push('«Стальные кулаки» +' + steelFistsNote);
        if (gb('weaponDmg')) { mul('бог: оружие', 1 + gb('weaponDmg') / 100); godDmgNotes.push(`оружие +${gb('weaponDmg')}%`); }
        if (mode === 'melee' && gb('meleeDmg')) { mul('бог: ближний бой', 1 + gb('meleeDmg') / 100); godDmgNotes.push(`ближний бой +${gb('meleeDmg')}%`); }
        if (mode !== 'melee' && gb('rangedDmg')) { mul('бог: дальний бой', 1 + gb('rangedDmg') / 100); godDmgNotes.push(`дальний бой +${gb('rangedDmg')}%`); }
        if (gb('pureDmg')) { mul('бог: чистый урон', 1 + gb('pureDmg') / 100); godDmgNotes.push(`чистый урон (Намира) +${gb('pureDmg')}%`); }
        if (mode === 'melee' && gb('axeDmg') && (wepType === 'twohand_axe' || String(melee.name || '').toLowerCase().match(/топор|секир/))) {
            mul('бог: топор', 1 + gb('axeDmg') / 100); godDmgNotes.push(`топор/секира (Талос) +${gb('axeDmg')}%`);
        }
        if (enchantDmgMain && gb('elementalWeaponDmg')) { // Азура: стихийное оружие бьёт сильнее
            if ((I.elementalEnchant || {})[mode === 'melee' ? 'melee' : 'ranged']) {
                const bEl = Math.round(enchantDmgMain * gb('elementalWeaponDmg') / 100);
                add('бог: стихийное оружие', bEl); godDmgNotes.push(`стихийное оружие (Азура) +${bEl}`);
            }
        }
        if (enchantDmgMain && gb('enchantDmg')) {
            const bonus = Math.round(enchantDmgMain * gb('enchantDmg') / 100);
            add('бог: зачарование', bonus); godDmgNotes.push(`зачарование (Акатош) +${bonus}`);
        }
        if (isPowerAttack && gb('powerAttackDmg') && mode === 'melee') {
            mul('бог: силовая атака', 1 + gb('powerAttackDmg') / 100); godDmgNotes.push(`силовая атака +${gb('powerAttackDmg')}%`);
        }
        // Шеогорат — случайный множитель на ход. Условие «!== 1» сохранено как было (undefined тоже проходит).
        if (I.sheogorathMult !== 1) {
            mul('Шеогорат', I.sheogorathMult);
            godDmgNotes.push(`Шеогорат: урон ×${I.sheogorathMult} на этот ход`);
        }
        if (isPowerAttack && gb('powerAttackHeal') && mode === 'melee') {
            godDmgNotes.push(`⚕️ силовая атака лечит ${gb('powerAttackHeal')}% от урона (применится автоматически при "Применить" в бою)`);
        }
        if (isPowerAttack && gb('instantKillChance') && mode === 'melee') {
            godDmgNotes.push(`💀 Шанс мгновенного убийства (Мерунес Дагон): ${gb('instantKillChance')}% — бросается автоматически при «Применить»`);
        }
        if (gb('fearChance')) godDmgNotes.push(`😱 Доп. шанс обратить цель в бегство: +${gb('fearChance')}% — бросается автоматически при «Применить»`);

        // Множитель скрытности считается, но НЕ применяется здесь: его включает галочка/заклинание при броске.
        let sneakMult = 2;
        if (wepType === 'dagger') sneakMult = perks.assassinBladeUnlocked ? 6 : 3;
        else if (mode === 'melee' && wepType === 'onehand' && perks.backstabUnlocked) sneakMult = 3;
        else if (mode !== 'melee' && wepType === 'bow' && perks.sneakBowTriple) sneakMult = 3; // «Верный прицел»
        sneakMult += gb('sneakMult'); // Боэтия/Ноктюрнал

        return {
            totalDmg, hitModifier, sneakMult, mode, wepType, baseDmg,
            enchantDmgMain, offhandDmg, offhandEnchantDmg, statModForFormula, statLabelForFormula,
            weaponDmgPct, weaponBoostPct, boostSkillKey, weaponDmgFlat,
            infoNotes, godDmgNotes, steps
        };
    }

    // Воспроизводит итог по журналу шагов — для previewDamage(…, bonusesCtx) и проверок.
    // base подменяет первый шаг 'set' (если есть), остальные применяются как записаны.
    function applyBonuses(base, steps) {
        let x = Number(base) || 0, first = true;
        (steps || []).forEach(s => {
            if (s.op === 'set') { x = first ? x : s.value; first = false; return; }
            if (s.op === 'add') x += s.value;
            else if (s.op === 'mul') x = Math.round(x * s.value);
            else if (s.op === 'max0') x = Math.max(0, x);
        });
        return x;
    }

    // Урон духа на оружии (огонь/мороз/шок): база духа × (1 + Разрушение%) × (1 + стихийное оружие бога%).
    function weaponSpiritDamage(spiritDmg, destructionBoostPct, elementalGodPct) {
        return Math.round(spiritDmg * (1 + (destructionBoostPct || 0) / 100) * (1 + (elementalGodPct || 0) / 100));
    }

    // Удар врага оружием: база оружия + ЗНАЧЕНИЕ характеристики (Сила — ближний, Ловкость — лук), как у игрока.
    // Перков, богов и зелий у врагов нет — поля additivePct/mult оставлены для единого формата разбивки.
    function collectEnemyAttackBonuses(enemy) {
        const e = enemy || {};
        const base = e.weaponDmg || 0;
        if (!base) return { base: 0, stat: 0, total: 0, label: '', weaponEnchant: 0, spiritFlat: 0, additivePct: 0, mult: 1, notes: [] };
        const stat = e.isRanged ? (e.dex || 0) : (e.str || 0);
        const label = e.isRanged ? 'ЛОВ' : 'СИЛ';
        return { base, stat, total: base + stat, label, weaponEnchant: 0, spiritFlat: 0, additivePct: 0, mult: 1,
            notes: [{ source: 'оружие', value: base }, { source: label, value: stat }] };
    }

    // Совместимое имя из ТЗ: «собрать бонусы атаки игрока» — это и есть полный расчёт.
    const collectPlayerAttackBonuses = computePlayerWeaponAttack;

    // Пять фиксированных сценариев для ручной проверки: window.__stSelfTestAttack() в консоли листа или экрана мастера.
    // Данные одинаковые на обеих страницах, поэтому и числа должны совпасть.
    const SELF_TEST_BASE = {
        mode: 'melee', starve: 0, str: 14, dex: 12, wis: 10, perks: { oneHandedDamage: 0.2 },
        isPowerAttack: false, isDualWield: false, isSprintAttack: false,
        melee: { dmg: 8, type: 'onehand', name: 'Стальной меч', offhandDmg: 0 },
        ranged: { dmg: 0, ammoDmg: 0, type: 'bow', name: '' },
        enchantDmgMelee: 0, enchantDmgRanged: 0, offhandEnchantDmg: 0, weaponDmgPct: 0, skillBoostPct: {},
        unarmedBonus: 0, steelFistsArmor: 0, weaponDmgFlat: 0, god: {}, elementalEnchant: {}, sheogorathMult: 1
    };
    const SELF_TEST_SCENARIOS = [
        ['базовый удар', {}],
        ['силовая атака', { isPowerAttack: true }],
        ['скрытная (кинжал, ×3)', { melee: { dmg: 4, type: 'dagger', name: 'Стальной кинжал', offhandDmg: 0 } }],
        ['дух огня (+5 зачар., Разрушение 20%)', { enchantDmgMelee: 5, spirit: { dmg: 10, destructionPct: 20 } }],
        ['бог Малакат (ближний +25%, оружие +10%)', { god: { meleeDmg: 25, weaponDmg: 10 } }]
    ];
    function selfTest(overrides) {
        const rows = SELF_TEST_SCENARIOS.map(([name, patch]) => {
            const inp = Object.assign({}, SELF_TEST_BASE, overrides || {}, patch);
            const r = computePlayerWeaponAttack(inp);
            const spirit = patch.spirit ? weaponSpiritDamage(patch.spirit.dmg, patch.spirit.destructionPct, (inp.god || {}).elementalWeaponDmg) : 0;
            return { сценарий: name, урон: r.totalDmg, попадание: r.hitModifier, скрытность: '×' + r.sneakMult, сТенью: r.totalDmg * r.sneakMult, дух: spirit, повтор: applyBonuses(r.baseDmg, r.steps) };
        });
        if (typeof console !== 'undefined' && console.table) console.table(rows);
        return rows;
    }

    const api = { computePlayerWeaponAttack, collectPlayerAttackBonuses, collectEnemyAttackBonuses, applyBonuses, weaponSpiritDamage, weaponBoostSkill, selfTest };
    if (typeof window !== 'undefined') {
        window.StBonuses = api;
        window.__stSelfTestAttack = selfTest;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
