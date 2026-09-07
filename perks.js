// ============================================================================
// PERKS.JS — логика перков для системы «Скурим»
// Версия 1.0: одноручное и двуручное оружие
// ============================================================================

(function() {
    'use strict';

    // --- 1. Конфигурация эффектов перков ---
    const perkEffects = {
        // ==================== ОДНОРУЧНОЕ ОРУЖИЕ (skillIdx = 0) ====================
        // Сильная рука (5 ступеней): +20% урона за ступень
        "0-0": (step) => ({ oneHandedDamage: 0.20 * step }),
        // Боевая стойка: убирает штраф -1 к кубам на силовые атаки
        "0-1": () => ({ powerAttackHitBonus: 1 }),
        // Безоружный бой: можно атаковать кастетами (флаг)
        "0-2": () => ({ canUseGauntlets: true }),
        // Боевые искусства (3 ступени): +0/1/2 к кубам попадания, +5/10/15 урона через броню
        "0-3": (step) => ({
            hitBonus: step - 1, // 0,1,2
            armorPenetrationDamage: 5 * step // 5,10,15
        }),
        // Мечник (3 ступени): силовая атака мечами: враг не может ответить, +1/2/3 к кубам
        "0-4": (step) => ({ swordPowerAttackHitBonus: step }),
        // Контрудар: за каждые 2 попадания по вам +1 к кубам до смерти противника
        "0-5": () => ({ counterAttackBonus: true }),
        // Копейщик (3 ступени): +5/10/15 урона от кровопотери и +5/10/15 через сопротивления
        "0-6": (step) => ({
            spearBleedDamage: 5 * step,
            spearResistDamage: 5 * step
        }),
        // Рубака (3 ступени): +5/10/15 урона от кровопотери для топоров
        "0-7": (step) => ({ axeBleedDamage: 5 * step }),
        // Костолом (3 ступени): игнорирует 15/30/45% брони
        "0-8": (step) => ({ maceArmorPenetration: 0.15 * step }),
        // Двойной вихрь (2 ступени): +1/+2 к кубам для атак с двух рук
        "0-9": (step) => ({ dualWieldHitBonus: step }),
        // Двойная мясорубка: силовые атаки с двух рук +50% урона
        "0-10": () => ({ dualWieldPowerAttackDamage: 0.50 }),
        // Безжалостный удар: силовые атаки стоя +25% урона, 5% шанс отрубить голову
        "0-11": () => ({
            standingPowerAttackDamage: 0.25,
            decapitationChance: 0.05
        }),
        // Рывок: силовая атака в спринте двойной урон при дистанции >20 футов
        "0-12": () => ({ sprintPowerAttackDouble: true }),

        // ==================== ДВУРУЧНОЕ ОРУЖИЕ (skillIdx = 1) ====================
        // Варвар (5 ступеней): +20/40/60/80/100% урона за ступень
        "1-0": (step) => ({ twoHandedDamage: 0.20 * step }),
        // Стойка чемпиона: силовые атаки двуручным оружием успешнее (+1 к кубу)
        "1-1": () => ({ twoHandedPowerAttackHitBonus: 1 }),
        // Пикосажатель (3 ступени): +8/16/24 урона от кровопотери и +8/16/24 через броню
        "1-2": (step) => ({
            spearBleedDamage: 8 * step,
            spearResistDamage: 8 * step
        }),
        // Расчленитель (3 ступени): +10/20/30 урона от кровопотери для секир
        "1-3": (step) => ({ greatAxeBleedDamage: 10 * step }),
        // Глубокие раны (3 ступени): силовая атака мечами: враг не может ответить, +1/2/3 к кубам
        "1-4": (step) => ({ greatswordPowerAttackHitBonus: step }),
        // Отшельник (3 ступени): +15/30/45% силе зачарования посоха, игнорирование 5/10/20% брони
        "1-5": (step) => ({
            staffEnchantPower: 0.15 * step,
            staffArmorPenetration: 0.05 * step
        }),
        // Великий рывок: силовая атака в спринте двойной урон при дистанции >15 футов
        "1-6": () => ({ sprintPowerAttackDouble: true }),
        // Сокрушительный удар: силовые атаки стоя +25% урона, 10% шанс отрубить голову
        "1-7": () => ({
            standingPowerAttackDamage: 0.25,
            decapitationChance: 0.10
        }),
        // Веерная атака: силовые атаки при движении вбок на 5 футов наносят урон всем противникам спереди
        "1-8": () => ({ sweepingSideAttack: true }),
        // Крушитель черепов (3 ступени): игнорирует 25/50/75% брони для молотов
        "1-9": (step) => ({ hammerArmorPenetration: 0.25 * step })
    };

    // --- 2. Функция применения перков ---
    window.applyPerks = function() {
        // Сброс
        window.perkBonuses = {
            // Урон
            oneHandedDamage: 0,
            twoHandedDamage: 0,
            // Силовые атаки
            powerAttackHitBonus: 0,
            twoHandedPowerAttackHitBonus: 0,
            standingPowerAttackDamage: 0,
            decapitationChance: 0,
            sprintPowerAttackDouble: false,
            // Специфичные
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
            hitBonus: 0,
            armorPenetrationDamage: 0,
            canUseGauntlets: false,
            counterAttackBonus: false,
            sweepingSideAttack: false
        };

        const checkboxes = document.querySelectorAll('.perk-checkbox:checked');
        checkboxes.forEach(chk => {
            const skillIdx = parseInt(chk.dataset.skillidx);
            const perkIdx = parseInt(chk.dataset.perkidx);
            const step = parseInt(chk.dataset.step);
            const key = skillIdx + '-' + perkIdx;
            const effectFn = perkEffects[key];
            if (typeof effectFn === 'function') {
                const bonuses = effectFn(step);
                for (let [key, value] of Object.entries(bonuses)) {
                    if (typeof value === 'number') {
                        window.perkBonuses[key] = (window.perkBonuses[key] || 0) + value;
                    } else if (typeof value === 'boolean') {
                        window.perkBonuses[key] = window.perkBonuses[key] || value;
                    }
                }
            }
        });

        // Дополнительно: если есть модификатор от "Боевой стойки" для одноручного, применяем к powerAttackHitBonus
        // (уже учтено)
        console.log('Perk bonuses applied:', window.perkBonuses);
    };

    // --- 3. Геттер для удобства ---
    window.getPerkBonuses = function() {
        return window.perkBonuses || {};
    };

})();