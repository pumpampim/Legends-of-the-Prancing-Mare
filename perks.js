// ============================================================================
// PERKS.JS — логика перков для системы «Скурим»
// Версия 1.0 (Одноручное и Двуручное оружие)
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
        "1-9": (step) => ({ hammerArmorPenetration: 0.25 * step })
    };

    window.applyPerks = function() {
        console.log('Checked perks:');
document.querySelectorAll('.perk-checkbox:checked').forEach(chk => {
    console.log(`skillIdx=${chk.dataset.skillidx}, perkIdx=${chk.dataset.perkidx}, step=${chk.dataset.step}`);
});
console.log('maxSteps:', maxSteps);
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
            armorPenetrationDamage: 0
        };

        const checkboxes = document.querySelectorAll('.perk-checkbox:checked');
        checkboxes.forEach(chk => {
            const skillIdx = parseInt(chk.dataset.skillidx);
            const perkIdx = parseInt(chk.dataset.perkidx);
            const step = parseInt(chk.dataset.step);
            const key = skillIdx + '-' + perkIdx;
            const effectFn = perkEffects[key];
            if (typeof effectFn === 'function') {
                const result = effectFn(step);
                for (let [key, value] of Object.entries(result)) {
                    if (typeof value === 'number') {
                        bonuses[key] = (bonuses[key] || 0) + value;
                    } else if (typeof value === 'boolean') {
                        bonuses[key] = bonuses[key] || value;
                    }
                }
            }
        });

        window.perkBonuses = bonuses;
        console.log('Perk bonuses updated:', bonuses);
    };

    window.getPerkBonuses = function() {
        return window.perkBonuses || {};
    };

})();
