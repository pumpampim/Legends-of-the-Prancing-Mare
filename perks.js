// ============================================================================
// PERKS.JS — логика перков для системы «Скурим»
// Версия 1.2 (исправлена ошибка с maxSteps)
// ============================================================================

(function() {
    'use strict';

    const perkEffects = {
        // ==================== ОДНОРУЧНОЕ ОРУЖИЕ (skillIdx = 0) ====================
        "0-0": (step) => ({ oneHandedDamage: 0.20 * step }),
        "0-1": () => ({ powerAttackHitBonus: 1 }),
        "0-2": () => ({ canUseGauntlets: true }),
        "0-3": (step) => ({ hitBonus: step - 1, armorPenetrationDamage: 5 * step }),
        "0-4": (step) => ({ swordPowerAttackHitBonus: step }),
        "0-5": () => ({ counterAttackBonus: true }),
        "0-6": (step) => ({ spearBleedDamage: 5 * step, spearResistDamage: 5 * step }),
        "0-7": (step) => ({ axeBleedDamage: 5 * step }),
        "0-8": (step) => ({ maceArmorPenetration: 0.15 * step }),
        "0-9": (step) => ({ dualWieldHitBonus: step }),
        "0-10": () => ({ dualWieldPowerAttackDamage: 0.50 }),
        "0-11": () => ({ standingPowerAttackDamage: 0.25, decapitationChance: 0.05 }),
        "0-12": () => ({ sprintPowerAttackDouble: true }),

        // ==================== ДВУРУЧНОЕ ОРУЖИЕ (skillIdx = 1) ====================
        "1-0": (step) => ({ twoHandedDamage: 0.20 * step }),
        "1-1": () => ({ twoHandedPowerAttackHitBonus: 1 }),
        "1-2": (step) => ({ spearBleedDamage: 8 * step, spearResistDamage: 8 * step }),
        "1-3": (step) => ({ greatAxeBleedDamage: 10 * step }),
        "1-4": (step) => ({ greatswordPowerAttackHitBonus: step }),
        "1-5": (step) => ({ staffEnchantPower: 0.15 * step, staffArmorPenetration: 0.05 * step }),
        "1-6": () => ({ sprintPowerAttackDouble: true }),
        "1-7": () => ({ standingPowerAttackDamage: 0.25, decapitationChance: 0.10 }),
        "1-8": () => ({ sweepingSideAttack: true }),
        "1-9": (step) => ({ hammerArmorPenetration: 0.25 * step }),

        // ==================== КУЛИНАРИЯ (skillIdx = 18) ====================
        "18-0": (step) => ({ cookingDishPowerPercent: 0.10 * step }),
        "18-1": () => ({ cookingIngredientSubstitution: true }),
        "18-2": () => ({ cookingDurationBonus: 0.50 }),
        "18-3": () => ({ cookingExtraDishChance: 0.50 }),
        "18-4": () => ({ cookingAddAlchemyIngredient: true }),
        "18-5": () => ({ cookingDurationBonus: 1.00, cookingDishPowerPercent: 0.25 }),

        // ==================== АЛХИМИЯ (skillIdx = 15) ====================
        "15-0": (step) => ({ alchemistRank: step }),
        "15-1": () => ({ alchemyHealer: true }),
        "15-2": () => ({ alchemyProvisor: true }),
        "15-3": () => ({ alchemyPoisoner: true }),
        "15-4": (step) => ({ alchemyExperimentatorRank: step }),
        "15-5": () => ({ alchemyConcentratedPoison: true }),
        "15-6": () => ({ alchemyHerbalistDouble: true }),
        "15-7": () => ({ alchemyPoisonResist50: true }),

        // ==================== КРАСНОРЕЧИЕ (skillIdx = 9) ====================
        "9-0": (step) => ({ merchantPriceBonus: 0.05 * (step + 1) }),
        "9-1": () => ({ hasCharmPerk: true }),

        // ==================== СТРЕЛЬБА (skillIdx = 2) ====================
        "2-0": (step) => ({ rangedDamagePercent: 0.20 * step }),
        "2-2": (step) => ({ criticalShotStrFraction: [0.25, 0.5, 1.0][step - 1] || 0 }),
        "2-3": (step) => ({ rangedHitBonus: step }),

        // ==================== ШКОЛЫ МАГИИ: скидка 50% на стоимость по рангу заклинания ====================
        // Разрушение (skillIdx=10)
        "10-0": () => ({ discountDestr1: true }),
        "10-2": () => ({ discountDestr2: true }),
        "10-8": () => ({ discountDestr3: true }),
        "10-12": () => ({ discountDestr4: true }),
        // Восстановление (skillIdx=11)
        "11-0": () => ({ discountRestor1: true }),
        "11-4": (step) => ({ restorationManaBonus: [0.25, 0.50][step - 1] || 0 }),
        "11-3": () => ({ discountRestor2: true }),
        "11-6": () => ({ discountRestor3: true }),
        "11-9": () => ({ discountRestor4: true }),
        // Колдовство (skillIdx=12)
        "12-0": () => ({ discountConj1: true }),
        "12-4": () => ({ discountConj2: true }),
        "12-9": () => ({ discountConj3: true }),
        "12-11": () => ({ discountConj4: true }),
        // Иллюзия (skillIdx=13)
        "13-0": () => ({ discountIllus1: true }),
        "13-3": () => ({ discountIllus2: true }),
        "13-6": () => ({ discountIllus3: true }),
        "13-10": () => ({ discountIllus4: true }),
        // Изменение (skillIdx=14)
        "14-0": () => ({ discountAlter1: true }),
        "14-2": () => ({ discountAlter2: true }),
        "14-5": () => ({ discountAlter3: true }),
        "14-7": () => ({ discountAlter4: true }),

        // ==================== БЛОКИРОВАНИЕ (skillIdx = 3) ====================
        "3-0": (step) => ({ shieldArmorBonus: 0.15 + 0.05 * step }),

        // ==================== ТЯЖЁЛАЯ БРОНЯ (skillIdx = 4) ====================
        "4-0": (step) => ({ heavyArmorBonus: 0.20 * step }),
        "4-2": () => ({ heavyFullSetBonus1: 0.25 }),
        "4-6": () => ({ heavyFullSetBonus2: 0.25 }),

        // ==================== ЛЁГКАЯ БРОНЯ (skillIdx = 5) ====================
        "5-0": (step) => ({ lightArmorBonus: 0.20 * step }),
        "5-1": () => ({ lightFullSetBonus1: 0.25 }),
        "5-3": () => ({ lightFullSetSpeedBonus: 5 }),
        "5-4": () => ({ lightFullSetBonus2: 0.25 }),
        "5-5": () => ({ lightArmorMageRobe: true }),

        // ==================== СКРЫТНОСТЬ (skillIdx = 6) ====================
        "6-0": (step) => ({ sneakDetectBonus: step }),
        "6-2": () => ({ backstabUnlocked: true }),
        "6-4": () => ({ assassinBladeUnlocked: true }),

        // ==================== КАРМАННЫЕ КРАЖИ (skillIdx = 8) ====================
        "8-4": () => ({ extraCarryWeight: 50 }),

        // ==================== ЗАЧАРОВАНИЕ (skillIdx = 17) ====================
        "17-0": (step) => ({ enchantGeneralBonus: 0.20 * step }),
        "17-1": () => ({ enchantSoulEconomy: 2 }),
        "17-2": () => ({ enchantFireBonus: 0.25 }),
        "17-4": () => ({ enchantFrostBonus: 0.25 }),
        "17-5": () => ({ enchantSkillBonus: 0.25 }),
        "17-6": () => ({ enchantShockBonus: 0.25 }),
        "17-7": () => ({ enchantLifeBonus: 0.25 }),

        // ==================== ВЗЛОМ (skillIdx = 7) ====================
        "7-0": () => ({ lockpickNoviceUnlocked: true }),
        "7-1": () => ({ lockpickApprenticeUnlocked: true }),
        "7-2": () => ({ lockpickSilent: true }),
        "7-3": () => ({ lockpickWaxKey: true }),
        "7-4": () => ({ lockpickAdeptUnlocked: true }),
        "7-5": () => ({ lockpickGoldBonus: true }),
        "7-6": () => ({ lockpickTreasureBonus: true }),
        "7-7": () => ({ lockpickExpertUnlocked: true })
    };

    window.applyPerks = function() {
        // 1. Собираем максимальную ступень для каждого перка
        const maxSteps = {};
        document.querySelectorAll('.perk-checkbox:checked').forEach(chk => {
            const skillIdx = chk.dataset.skillidx;
            const perkIdx = chk.dataset.perkidx;
            const step = parseInt(chk.dataset.step);
            const key = skillIdx + '-' + perkIdx;
            if (!maxSteps[key] || step > maxSteps[key]) {
                maxSteps[key] = step;
            }
        });

        // 2. Применяем эффекты только для максимальных ступеней
        const bonuses = {
            oneHandedDamage: 0,
            twoHandedDamage: 0,
            powerAttackHitBonus: 0,
            twoHandedPowerAttackHitBonus: 0,
            standingPowerAttackDamage: 0,
            decapitationChance: 0,
            sprintPowerAttackDouble: false,
            swordPowerAttackHitBonus: 0,
            greatswordPowerAttackHitBonus: 0,
            spearBleedDamage: 0,
            spearResistDamage: 0,
            axeBleedDamage: 0,
            greatAxeBleedDamage: 0,
            maceArmorPenetration: 0,
            hammerArmorPenetration: 0,
            dualWieldHitBonus: 0,
            dualWieldPowerAttackDamage: 0,
            staffEnchantPower: 0,
            staffArmorPenetration: 0,
            canUseGauntlets: false,
            counterAttackBonus: false,
            sweepingSideAttack: false,
            hitBonus: 0,
            armorPenetrationDamage: 0,
            cookingDishPowerPercent: 0,
            cookingIngredientSubstitution: false,
            cookingDurationBonus: 0,
            cookingExtraDishChance: 0,
            cookingAddAlchemyIngredient: false,
            alchemistRank: 0,
            alchemyHealer: false,
            alchemyProvisor: false,
            alchemyPoisoner: false,
            alchemyExperimentatorRank: 0,
            alchemyConcentratedPoison: false,
            alchemyHerbalistDouble: false,
            alchemyPoisonResist50: false,
            merchantPriceBonus: 0,
            hasCharmPerk: false,
            rangedDamagePercent: 0,
            criticalShotStrFraction: 0,
            rangedHitBonus: 0,
            discountDestr1: false, discountDestr2: false, discountDestr3: false, discountDestr4: false,
            discountRestor1: false, discountRestor2: false, discountRestor3: false, discountRestor4: false,
            discountConj1: false, discountConj2: false, discountConj3: false, discountConj4: false,
            discountIllus1: false, discountIllus2: false, discountIllus3: false, discountIllus4: false,
            discountAlter1: false, discountAlter2: false, discountAlter3: false, discountAlter4: false,
            shieldArmorBonus: 0,
            heavyArmorBonus: 0, heavyFullSetBonus1: 0, heavyFullSetBonus2: 0,
            lightArmorBonus: 0, lightFullSetBonus1: 0, lightFullSetBonus2: 0, lightFullSetSpeedBonus: 0, lightArmorMageRobe: false,
            sneakDetectBonus: 0, backstabUnlocked: false, assassinBladeUnlocked: false,
            extraCarryWeight: 0,
            enchantGeneralBonus: 0, enchantSoulEconomy: 0, enchantFireBonus: 0,
            enchantFrostBonus: 0, enchantSkillBonus: 0, enchantShockBonus: 0, enchantLifeBonus: 0,
            restorationManaBonus: 0,
            lockpickNoviceUnlocked: false, lockpickApprenticeUnlocked: false, lockpickAdeptUnlocked: false, lockpickExpertUnlocked: false,
            lockpickSilent: false, lockpickWaxKey: false, lockpickGoldBonus: false, lockpickTreasureBonus: false
        };

        // Логируем, что мы нашли в чекбоксах (для отладки)
        console.log('maxSteps:', maxSteps);

        for (let [key, step] of Object.entries(maxSteps)) {
            const effectFn = perkEffects[key];
            if (typeof effectFn === 'function') {
                const result = effectFn(step);
                for (let [k, v] of Object.entries(result)) {
                    if (typeof v === 'number') {
                        bonuses[k] = (bonuses[k] || 0) + v;
                    } else if (typeof v === 'boolean') {
                        bonuses[k] = bonuses[k] || v;
                    }
                }
            }
        }

        window.perkBonuses = bonuses;
        console.log('Perk bonuses (max steps only):', bonuses);
    };

    window.getPerkBonuses = function() {
        return window.perkBonuses || {};
    };

})();
