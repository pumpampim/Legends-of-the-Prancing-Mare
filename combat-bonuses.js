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

    // Двуручное: мечи, секиры, молоты, а также пики и боевые посохи (раньше им некуда было деться, кроме «двуручного меча»).
    const TWO_HANDED = ['twohand_sword', 'twohand_axe', 'twohand_hammer', 'twohand_pike', 'twohand_staff'];
    const abilityMod = v => Math.floor((v - 10) / 2);

    // Урон оружия и стрел в данных уже пересчитан (+35%, решение Никиты 2026-11-02) — в формуле удара берётся как есть.
    // WEAPON_DATA_SCALE нужен только там, где из данных строят врагов: их урон остаётся прежним (см. gm.js).
    const WEAPON_DATA_SCALE = 1.35, HEAVY_DATA_SCALE = 1.5;
    const weaponBase = n => Number(n) || 0;
    const CROSSBOW_SHOT_BONUS = 0.85; // +85% к (урон арбалета + болт) за выстрел: арбалет заряжается ход
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

        let baseDmg = 2, hitModifier = 0, ammoBase = 0;
        let wepType = 'unarmed';
        const infoNotes = [];
        let enchantDmgMain = 0, offhandDmg = 0, offhandEnchantDmg = 0, statModForFormula = 0, statLabelForFormula = 'Сила';
        let trueDmg = 0;      // урон «сквозь сопротивление» (Копейщик/Пикосажатель/Боевые искусства): идёт отдельным ударом без резиста
        let decapChance = 0; // «Безжалостный/Сокрушительный удар»: шанс обезглавить силовой атакой
        let armorIgnore = 0;  // доля брони (физ. резиста) цели, которую удар игнорирует: 0.45 = 45%

        const strMod = Math.floor((str - 10) / 2);
        const dexMod = Math.floor((dex - 10) / 2);
        const isPowerAttack = !!I.isPowerAttack, isDualWield = !!I.isDualWield, isSprintAttack = !!I.isSprintAttack;
        const melee = I.melee || {}, ranged = I.ranged || {};

        if (mode === 'melee') {
            baseDmg = melee.dmg || 2;
            wepType = melee.type;
            if (wepType !== 'unarmed') baseDmg = weaponBase(baseDmg); // базовый урон оружия +35% (решение Никиты 2026-11-02)
            const wepName = String(melee.name || '').toLowerCase();
            // Призванное оружие (имя начинается с «Призван…») бьёт от Мудрости, а не от Силы.
            const isSummonedWeapon = wepName.indexOf('призван') === 0;
            const wisMod = abilityMod(I.wis);
            hitModifier = isSummonedWeapon ? wisMod : strMod;

            if (wepType === 'dagger') hitModifier += 1; // кинжал: +1 к атаке (как обещано в списке типов)
            if (wepType === 'twohand_sword') hitModifier -= 2;    // пика — без штрафа (по правилам)
            if (wepType === 'twohand_staff') hitModifier -= 3;
            if (wepType === 'twohand_axe') hitModifier -= 3;
            if (wepType === 'twohand_hammer') hitModifier -= 4;

            const isTwoHanded = TWO_HANDED.indexOf(wepType) !== -1;
            const isOneHandedWeapon = !isTwoHanded && wepType !== 'unarmed'; // перки ветки «Одноручное» — только одноручным оружием
            const isSpear = wepType === 'onehand' && /коп[ьё]/.test(wepName);
            const isPike = wepType === 'twohand_pike' || (isTwoHanded && /пик[аи]/.test(wepName));

            // Бонусы от перков к базовому урону (дробные — округление только на множителях ниже, как и раньше)
            let perkBonus = 0;
            // Кастет без перка «Безоружный бой» — просто кулак (урон 2)
            if (wepType === 'unarmed' && melee.isKastet && !perks.canUseGauntlets) { baseDmg = 2; infoNotes.push('👊 Без перка «Безоружный бой» кастетом бить нельзя — удар кулаком (2)'); }
            // Сильная рука — только одноручным оружием (кулаки и кастеты — безоружный бой), Варвар — двуручным
            perkBonus += baseDmg * (isTwoHanded ? (perks.twoHandedDamage || 0) : (isOneHandedWeapon ? (perks.oneHandedDamage || 0) : 0));
            // Кровопотеря — обычный урон; «через сопротивление» — отдельно (trueDmg), резист цели его не режет.
            if (isSpear) { perkBonus += (perks.spearBleedDamage || 0); trueDmg += (perks.spearResistDamage || 0); }          // Копейщик
            if (isPike) { perkBonus += (perks.pikeBleedDamage || 0); trueDmg += (perks.pikeResistDamage || 0); }             // Пикосажатель
            if (wepType === 'onehand' && wepName.includes('топ')) perkBonus += (perks.axeBleedDamage || 0);
            if (wepType === 'twohand_axe') perkBonus += (perks.greatAxeBleedDamage || 0);
            if (isOneHandedWeapon && perks.martialArtsTrueDmg) trueDmg += perks.martialArtsTrueDmg; // Боевые искусства

            // Игнор брони (доля резиста цели): Костолом — булавы, Крушитель черепов — молоты, Отшельник — посохи.
            if (wepType === 'onehand' && wepName.includes('булав') && perks.maceArmorPenetration) {
                armorIgnore = Math.max(armorIgnore, perks.maceArmorPenetration);
                infoNotes.push(`🔨 Костолом: игнорирует ${Math.round(perks.maceArmorPenetration * 100)}% брони цели`);
            }
            if (wepType === 'twohand_hammer' && perks.hammerArmorPenetration) {
                armorIgnore = Math.max(armorIgnore, perks.hammerArmorPenetration);
                infoNotes.push(`🔨 Крушитель черепов: игнорирует ${Math.round(perks.hammerArmorPenetration * 100)}% брони цели`);
            }
            if (wepType === 'twohand_staff' && perks.staffArmorPenetration) {
                armorIgnore = Math.max(armorIgnore, perks.staffArmorPenetration / 100);
                infoNotes.push(`🪄 Отшельник: посох игнорирует ${perks.staffArmorPenetration}% брони цели`);
            }

            enchantDmgMain = I.enchantDmgMelee || 0;
            // К урону прибавляется характеристика удара: Сила; у призванного оружия — Мудрость (как и попадание);
            // кулаки и кастеты — без Силы (по описанию типа «Кулаки (Урон 2, без Силы)»).
            const dmgStat = wepType === 'unarmed' ? 0 : (isSummonedWeapon ? I.wis : str);
            statModForFormula = dmgStat; statLabelForFormula = wepType === 'unarmed' ? 'без характеристики' : (isSummonedWeapon ? 'Мудрость' : 'Сила');
            totalDmg = baseDmg + perkBonus + dmgStat;
            steps.push({ source: 'оружие', op: 'set', value: baseDmg }, { source: 'перки', op: 'add', value: perkBonus }, { source: statLabelForFormula, op: 'add', value: dmgStat });
            add('зачарование оружия', enchantDmgMain);

            // Двойное оружие (одноручное/кинжал, не для двуручного)
            if (isDualWield && !isTwoHanded && wepType !== 'unarmed') {
                if (perks.dualWieldHitBonus) hitModifier += perks.dualWieldHitBonus;
                offhandDmg = weaponBase(melee.offhandDmg || 0);
                offhandEnchantDmg = I.offhandEnchantDmg || 0;
                if (offhandDmg > 0 || offhandEnchantDmg > 0) add('второе оружие', offhandDmg + offhandEnchantDmg);
                // Второе оружие получает свои перки по своему типу и названию — как правое, но без Силы (решение Никиты 2026-11-01).
                // Попадание — один бросок, поэтому бонусы к попаданию по-прежнему только от правого оружия.
                const offType = melee.offhandType || 'onehand', offName = String(melee.offhandName || '').toLowerCase();
                if (offhandDmg > 0 && offType !== 'unarmed' && TWO_HANDED.indexOf(offType) === -1) {
                    let offPerk = offhandDmg * (perks.oneHandedDamage || 0);                    // Сильная рука
                    if (offType === 'onehand' && /коп[ьё]/.test(offName)) { offPerk += (perks.spearBleedDamage || 0); trueDmg += (perks.spearResistDamage || 0); } // Копейщик
                    if (offType === 'onehand' && offName.includes('топ')) offPerk += (perks.axeBleedDamage || 0);           // кровотечение топора
                    if (perks.martialArtsTrueDmg) trueDmg += perks.martialArtsTrueDmg;            // Боевые искусства
                    if (offType === 'onehand' && offName.includes('булав') && perks.maceArmorPenetration && perks.maceArmorPenetration > armorIgnore) {
                        armorIgnore = perks.maceArmorPenetration;
                        infoNotes.push(`🔨 Костолом (второе оружие): игнорирует ${Math.round(perks.maceArmorPenetration * 100)}% брони цели`);
                    }
                    if (offPerk) add('второе оружие: перки', offPerk);
                }
            }
            if (trueDmg) infoNotes.push(`🩸 Сквозь сопротивление: +${trueDmg} урона (резист цели не режет)`);

            // Силовая атака / Рывок-атака. Перки каждой ветки — только своим оружием: «Боевая стойка», «Безжалостный удар»,
            // «Рывок» — одноручным; «Стойка чемпиона», «Сокрушительный удар», «Великий рывок» — двуручным.
            if (isPowerAttack && wepType !== 'unarmed') {
                hitModifier -= 1; // правила: силовая атака — −1 к кубам
                if (perks.powerAttackHitBonus && isOneHandedWeapon) hitModifier += perks.powerAttackHitBonus;
                if (perks.twoHandedPowerAttackHitBonus && isTwoHanded) hitModifier += perks.twoHandedPowerAttackHitBonus;

                const sprintPerkUnlocked = isTwoHanded ? perks.twoHandSprintDouble : perks.oneHandSprintDouble;
                if (isSprintAttack && sprintPerkUnlocked) {
                    mul('рывок-атака', 2);
                    infoNotes.push(`🏃 Рывок-атака: фиксированный х2 урона — между тобой и целью должно быть не меньше ${isTwoHanded ? 15 : 20} фт (подтверждает мастер)`);
                } else {
                    if (isSprintAttack && !sprintPerkUnlocked) {
                        infoNotes.push(`⚠ Галочка «Рывок-атака» стоит, но перк «${isTwoHanded ? 'Великий рывок' : 'Рывок'}» для этого оружия не открыт — считается как обычная силовая атака.`);
                    }
                    let powerMult = 1.5;
                    const standing = isTwoHanded ? (perks.twoHandStandingPower || 0) : (perks.oneHandStandingPower || 0);
                    if (standing) powerMult += standing;
                    if (isDualWield && !isTwoHanded && perks.dualWieldPowerAttackDamage) powerMult += perks.dualWieldPowerAttackDamage;
                    mul('силовая атака', powerMult);
                    const decap = isTwoHanded ? (perks.twoHandDecapChance || 0) : (perks.oneHandDecapChance || 0);
                    if (decap) { decapChance = decap; infoNotes.push(`💀 Шанс обезглавливания: ${Math.round(decap * 100)}% — бросается автоматически при «Применить»`); }
                }
            } else if (isSprintAttack) {
                infoNotes.push('⚠️ Рывок-атака засчитывается только вместе с «Силовой атакой»');
            }

            if (perks.martialArtsHitBonus && isOneHandedWeapon) hitModifier += perks.martialArtsHitBonus; // Боевые искусства — только одноручным
            if (wepType === 'onehand' && isPowerAttack && wepName.includes('меч')) hitModifier += (perks.swordPowerAttackHitBonus || 0);
            if (wepType === 'twohand_sword' && isPowerAttack) hitModifier += (perks.greatswordPowerAttackHitBonus || 0);

            if (perks.counterAttackBonus) infoNotes.push('🛡️ Контрудар активен: за каждые 2 полученных попадания +1 к кубам до смерти противника');
            if (wepType === 'unarmed' && perks.canUseGauntlets) infoNotes.push('👊 Безоружный бой: можно атаковать кастетами');
            if (isTwoHanded && perks.sweepingSideAttack && isPowerAttack) infoNotes.push('🌀 Веерная атака: силовая атака при шаге вбок задевает всех противников впереди');
        } else {
            // Дальний бой
            baseDmg = ranged.isStaff ? (ranged.dmg || 0) : weaponBase(ranged.dmg || 0); // лук/арбалет +35%, посох в слоте дальнего боя как был
            const ammoDmg = weaponBase(ranged.ammoDmg || 0); // боеприпас — тоже часть «оружия»
            ammoBase = ammoDmg;
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
            // Арбалет стреляет раз в два хода («1 ход на КД»), поэтому каждый болт бьёт сильнее: +80% от оружия и болта.
            // Без этого выстрел был вровень с луком и арбалет проигрывал вдвое (баланс оружия 2026-11-02).
            if (wepType === 'crossbow' && !isSummonedRanged && !ranged.isStaff) add('арбалет: тяжёлый болт', Math.round((baseDmg + ammoDmg) * CROSSBOW_SHOT_BONUS));

            if (perks.rangedDamagePercent && (wepType === 'bow' || wepType === 'crossbow') && !ranged.isStaff) add('Избыточное натяжение', Math.round(baseDmg * perks.rangedDamagePercent)); // только базовый урон лука
            if (perks.criticalShotStrFraction) {
                const strBonus = Math.round(str * perks.criticalShotStrFraction); // доля значения Силы (¼/½/полная), не модификатора
                if (strBonus) {
                    add('Критический выстрел', strBonus);
                    infoNotes.push(`🎯 Критический выстрел: +${strBonus} от Силы`);
                }
            }
            if (perks.rangedHitBonus) hitModifier += perks.rangedHitBonus;
            if (ranged.isStaff && perks.staffArmorPenetration) { // посох в слоте дальнего боя — «Отшельник» действует и тут
                armorIgnore = Math.max(armorIgnore, perks.staffArmorPenetration / 100);
                infoNotes.push(`🪄 Отшельник: посох игнорирует ${perks.staffArmorPenetration}% брони цели`);
            }
        }

        hitModifier -= starve * 2;

        // Снаряжение «+N% базового урона оружия» (Щит налетчика): от базы самого оружия, без кулаков.
        if (I.gearBaseWeaponPct && wepType !== 'unarmed' && baseDmg) add('снаряжение: % базового урона оружия', Math.round(baseDmg * I.gearBaseWeaponPct / 100));
        // Баффы «урон оружия +N%» (заклинания/зелья)
        const weaponDmgPct = I.weaponDmgPct || 0;
        if (weaponDmgPct) mul('бафф урона оружия', 1 + weaponDmgPct / 100);
        // «Повышение навыка» (зачарование/зелье): Одноручное/Двуручное/Стрельба
        const boostSkillKey = weaponBoostSkill(mode, wepType, TWO_HANDED.indexOf(wepType) !== -1);
        const weaponBoostPct = boostSkillKey ? ((I.skillBoostPct || {})[boostSkillKey] || 0) : 0;
        if (weaponBoostPct && wepType !== 'unarmed') add('повышение навыка (% базы оружия)', Math.round((baseDmg + ammoBase) * weaponBoostPct / 100)); // от базы оружия, не от всей суммы
        else if (weaponBoostPct) mul('повышение навыка', 1 + weaponBoostPct / 100);
        if (mode === 'melee' && wepType === 'unarmed') { const unB = I.unarmedBonus || 0; if (unB) add('Трансмутация мускулы', unB); }
        if (mode === 'melee' && wepType === 'unarmed' && I.unarmedEnchant) add('Усиление рукопашного боя', I.unarmedEnchant); // зачарование перчаток/колец
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
        if (gb('pureDmg')) godDmgNotes.push(`🩸 Намира: +${gb('pureDmg')} чистого урона (отдельным ударом)`);
        if (gb('poisonFlatDmg')) godDmgNotes.push(`☠ Намира: +${gb('poisonFlatDmg')} урона ядом (отдельным ударом)`);
        if (gb('fireWeaponDmg')) godDmgNotes.push(`🔥 Мерунес Дагон: +${gb('fireWeaponDmg')} урона огнём (отдельным ударом)`);
        if (mode === 'melee' && gb('axeDmg') && (wepType === 'twohand_axe' || String(melee.name || '').toLowerCase().match(/топор|секир/))) {
            mul('бог: топор', 1 + gb('axeDmg') / 100); godDmgNotes.push(`топор/секира (Талос) +${gb('axeDmg')}%`);
        }
        if (enchantDmgMain && gb('elementalWeaponDmg')) { // Азура: зачарованное стихийное оружие +10 урона (плоско)
            if ((I.elementalEnchant || {})[mode === 'melee' ? 'melee' : 'ranged']) {
                const bEl = gb('elementalWeaponDmg');
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
        if (isPowerAttack && gb('powerAttackHeal')) {
            godDmgNotes.push(`⚕️ Малакат: убийство силовой атакой вернёт ${gb('powerAttackHeal')}% ХП`);
        }
        if (gb('instantKillChance')) {
            godDmgNotes.push(`💀 Шанс мгновенного убийства (Мерунес Дагон): ${gb('instantKillChance')}% — бросается автоматически при «Применить»`);
        }

        // Множитель скрытности считается, но НЕ применяется здесь: его включает галочка/заклинание при броске.
        let sneakMult = 2;
        if (wepType === 'dagger') sneakMult = perks.assassinBladeUnlocked ? 6 : 3;
        else if (mode === 'melee' && wepType === 'onehand' && perks.backstabUnlocked) sneakMult = 3;
        else if (mode !== 'melee' && perks.sneakBowTriple) sneakMult = 4; // «Верный прицел»: скрытный выстрел ×4 (луки и арбалеты; без перка ×2)
        if (mode !== 'melee' && wepType === 'thrown' && ranged.throwKind === 'knife') sneakMult = Math.max(sneakMult, 3); // метательный нож — как кинжал
        sneakMult += gb('sneakMult'); // Боэтия/Ноктюрнал

        return {
            totalDmg, hitModifier, sneakMult, mode, wepType, baseDmg, trueDmg, armorIgnore, decapChance,
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
        unarmedBonus: 0, unarmedEnchant: 0, gearBaseWeaponPct: 0, steelFistsArmor: 0, weaponDmgFlat: 0, god: {}, elementalEnchant: {}, sheogorathMult: 1
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

    // ===== Цифры оружия и брони: данные уже содержат действительные значения (оружие +35%, тяжёлая броня +50%) =====
    const HEAVY_ARMOR_DENSITY = 0; // плотность тяжёлой брони теперь внутри данных вещей
    const LIGHT_DODGE_PER = 20;
    function shownWeaponDmg(n) { return Number(n); }
    function isHeavyArmorItem(item) {
        if (!item) return false;
        if (/щит/i.test(String(item.slot || '')) || item.slot === 'shield') return false;
        return /heavy|тяж[её]л/i.test(String(item.armorType || '') + ' ' + String(item.category || ''));
    }
    function isLightArmorItem(item) {
        if (!item || /щит/i.test(String(item.slot || '')) || item.slot === 'shield') return false;
        return /light|л[её]гк/i.test(String(item.armorType || '') + ' ' + String(item.category || ''));
    }
    function shownArmor(n) { return Number(n); }
    function armorNote(n, item) { // подпись для карточек лёгкой брони: уклонение
        n = Number(n); if (!isFinite(n)) return '';
        return isLightArmorItem(item) ? ` (уклонение +${Math.round(n / LIGHT_DODGE_PER * 10) / 10}%)` : '';
    }
    function shownEffect(item) { return String((item && item.effect) || ''); }
    // Враги, собранные из таблиц оружия и брони, бьют и держат броню как раньше: пересчёт данных на них не распространяется.
    function enemyWeaponDmg(n) { return Number(n) / WEAPON_DATA_SCALE; }
    function enemyArmorValue(n, item) { return isHeavyArmorItem(item) ? Number(n) / HEAVY_DATA_SCALE : Number(n); }
    const api = { enemyWeaponDmg, enemyArmorValue, shownEffect, shownWeaponDmg, shownArmor, armorNote, isHeavyArmorItem, HEAVY_ARMOR_DENSITY, computePlayerWeaponAttack, collectPlayerAttackBonuses, collectEnemyAttackBonuses, applyBonuses, weaponSpiritDamage, weaponBoostSkill, selfTest };
    if (typeof window !== 'undefined') {
        window.StBonuses = api;
        window.__stSelfTestAttack = selfTest;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
