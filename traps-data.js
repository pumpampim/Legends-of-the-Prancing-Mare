// ============================================================================
// TRAPS-DATA.JS — ловушки для мастера (экран мастера: «🪤 Ловушки», вкладка «Бой») и ловушки сундуков.
// Урон разрешается на листе игрока (команда мастера в characters/{uid}.gmCmds): там известны его настоящие
// характеристики (с расой/знаком) для спасбросков и его сопротивления.
//
// hits — что прилетает при срабатывании: { dmg, dice: [n, sides], type: physical|fire|frost|shock|poison|magic, mp }
// save — спасбросок { stat, dc, perHit: true } (perHit: бросок на каждый «удар», например на каждую секиру).
// perTurn — ловушка продолжает бить каждый ход: { hits, activeTurns, cooldownTurns } (огненный столб: 4 хода, потом 10 ходов перезарядки).
// knockback — отбрасывает на N футов. disarmDc — сложность обезвреживания проверкой Ловкости.
// stone — ловушка гаснет, если забрать камень (предмет отдаётся игроку).
// ============================================================================
window.TRAP_TYPES = [
    { id: 'darts', icon: '🎯', name: 'Ловушка с дротиками', hits: [{ dmg: 30, type: 'poison' }], note: 'Отравленные дротики из стен.' },
    { id: 'fireColumn', icon: '🔥', name: 'Огненная ловушка (столб огня)', hits: [{ dice: [2, 6], type: 'fire' }],
      perTurn: { hits: [{ dice: [2, 6], type: 'fire' }], activeTurns: 4, cooldownTurns: 10 }, note: 'Бьёт 4 хода, потом 10 ходов перезаряжается и снова работает.' },
    { id: 'tar', icon: '🛢️', name: 'Смоляной пол', hits: [], igniteHits: [{ dmg: 30, type: 'fire' }],
      perTurnIgnited: { hits: [{ dice: [1, 6], type: 'fire' }] }, note: 'Сам по себе не ранит. Если поджечь — 30 урона огнём сразу и 1d6 каждый ход, пока стоишь на смоле.' },
    { id: 'spikes', icon: '🗡️', name: 'Ловушка с кольями', hits: [{ dmg: 30, type: 'physical' }] },
    { id: 'lamp', icon: '🏮', name: 'Огненная лампа', hits: [{ dmg: 20, type: 'fire' }, { dice: [1, 6], type: 'fire' }], radiusHits: [{ dmg: 10, type: 'fire' }, { dice: [1, 6], type: 'fire' }],
      note: 'Сбитая лампа падает и взрывается: в центре 20 + 1d6 огнём, рядом (в радиусе) 10 + 1d6.' },
    { id: 'axes', icon: '🪓', name: 'Ловушка с секирами (маятники)', axeDmg: 30, save: { stat: 'dex', dc: 10, perHit: true }, defaultAxes: 3,
      note: 'Проходя через маятники — спасбросок Ловкости сл. 10 на КАЖДУЮ секиру; провал — 30 урона.' },
    { id: 'soulCrystal', icon: '💎', name: 'Ловушка «кристалл душ»', hits: [{ dmg: 10, type: 'shock', mp: 5 }],
      perTurn: { hits: [{ dmg: 10, type: 'shock', mp: 5 }], activeTurns: 0, cooldownTurns: 0 }, stone: 'Заполненный обычный камень душ',
      note: 'Кристалл на пьедестале бьёт молнией каждый ход (10 по ХП, 5 по мане). Перестаёт, если забрать камень.' },
    { id: 'door', icon: '🚪', name: 'Ловушка-дверь', hits: [{ dmg: 50, type: 'physical' }], knockback: 15 },
    { id: 'rocks', icon: '🪨', name: 'Падающие камни', hits: [{ dmg: 20, type: 'physical' }], note: 'Камни перегораживают часть прохода.' },
    { id: 'warning', icon: '🔔', name: 'Ловушка с предупреждением', hits: [], disarmDc: 10, alarm: true,
      note: 'Урона нет, но враги знают, где вы. Обезвредить — проверка Ловкости сл. 10.' },
    { id: 'mace', icon: '🔨', name: 'Падающая булава', hits: [{ dmg: 15, type: 'physical' }] },
    { id: 'log', icon: '🪵', name: 'Ловушка-бревно', hits: [{ dmg: 20, type: 'physical' }], knockback: 5 }
];
// Ловушки сундуков и сложность их обезвреживания (как уровни замков).
window.CHEST_TRAP_TYPES = ['darts', 'mace', 'spikes'];
window.TRAP_DISARM_TIERS = { apprentice: { label: 'Ученик', dc: 12 }, adept: { label: 'Адепт', dc: 15 }, expert: { label: 'Эксперт', dc: 18 } };
