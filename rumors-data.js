// ============================================================================
// RUMORS-DATA.JS — движок молвы: из деяний партии (убили, пали, нарушили закон, взяли
// квест…) делает слухи трёх видов: верный, искажённый и ложный. Чистые функции, без DOM
// и Firebase — используется на экране мастера (gm.js) и проверяется тестами.
// ============================================================================
(function (root) {
    'use strict';

    const KIND_INFO = {
        kill:  { icon: '⚔️', label: 'Победа в бою' },
        fall:  { icon: '⚰️', label: 'Игрок пал' },
        crime: { icon: '⚖️', label: 'Преступление / штраф' },
        jail:  { icon: '🔒', label: 'Тюрьма' },
        quest: { icon: '📜', label: 'Взяли задание' },
        feat:  { icon: '🌟', label: 'Подвиг' },
        deed:  { icon: '🤝', label: 'Добрый поступок' },
        trade: { icon: '💰', label: 'Торговля / сделка' },
        magic: { icon: '🔮', label: 'Магия' },
        misc:  { icon: '🗣', label: 'Другое' }
    };

    // Кто рассказывает (подмешивается в начало слуха)
    const VOICES = [
        'Говорят, ', 'В таверне шепчутся, что ', 'Торговцы болтают, что ', 'Стражник обмолвился, что ',
        'Бард в трактире напевает, будто ', 'Старуха у колодца уверяет, что ', 'Путники рассказывают, что ',
        'Ходят слухи, что ', 'Один пьяница клянётся, что ', 'Курьер передал, что '
    ];

    const ENEMY_CATEGORY_INSTR = {
        'Животные': 'дикими зверями', 'Монстры': 'тварями', 'Воины': 'вооружёнными головорезами',
        'Боевые маги': 'чародеями-отступниками', 'Шаманы': 'шаманами', 'Двемерские ловушки': 'двемерскими стражами'
    };
    const ENEMY_CATEGORY_NOUN = {
        'Животные': 'диких зверей', 'Монстры': 'тварей', 'Воины': 'вооружённых головорезов',
        'Боевые маги': 'чародеев-отступников', 'Шаманы': 'шаманов', 'Двемерские ловушки': 'двемерских стражей'
    };

    // Падежи названий владений: в ком/чём (loc) и от кого/чего (gen)
    const HOLD_CASES = [
        ['Вайтран', 'в Вайтране', 'Вайтрана'], ['Винтерхолд', 'в Винтерхолде', 'Винтерхолда'], ['Рифт', 'в Рифте', 'Рифта'],
        ['Фолкрит', 'в Фолкрите', 'Фолкрита'], ['Солитьюд', 'в Солитьюде', 'Солитьюда'], ['Хаафингар', 'в Хаафингаре', 'Хаафингара'],
        ['Хьялмарк', 'в Хьялмарке', 'Хьялмарка'], ['Морфал', 'в Морфале', 'Морфала'], ['Истмарк', 'в Истмарке', 'Истмарка'],
        ['Виндхельм', 'в Виндхельме', 'Виндхельма'], ['Белый берег', 'на Белом берегу', 'Белого берега'], ['Данстар', 'в Данстаре', 'Данстара'],
        ['Маркарт', 'в Маркарте', 'Маркарта'], ['Предел', 'в Пределе', 'Предела'], ['Схолстейм', 'в Схолстейме', 'Схолстейма']
    ];
    function holdCase(hold, which) {
        const h = String(hold || '').toLowerCase();
        if (!h) return '';
        const row = HOLD_CASES.find(r => h.indexOf(r[0].toLowerCase()) === 0) || HOLD_CASES.find(r => h.indexOf(r[0].toLowerCase()) >= 0);
        if (row) return which === 'gen' ? row[2] : row[1];
        return which === 'gen' ? '«' + hold + '»' : 'в «' + hold + '»';
    }

    function pick(arr, rng) { return arr[Math.floor((rng || Math.random)() * arr.length) % arr.length]; }
    function clean(s) { return String(s == null ? '' : s).replace(/\s*\(ур\.[^)]*\)/i, '').trim(); }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

    function nameList(arr) {
        arr = (arr || []).filter(Boolean);
        if (!arr.length) return '';
        if (arr.length === 1) return arr[0];
        return arr.slice(0, -1).join(', ') + ' и ' + arr[arr.length - 1];
    }

    // «Кто» в разных степенях точности
    function actorTrue(d) {
        const w = (d.who || []).filter(Boolean);
        if (!w.length) return 'отряд искателей приключений';
        if (w.length === 1) return 'искатель приключений по имени ' + w[0];
        if (w.length <= 3) return 'отряд (' + nameList(w) + ')';
        return 'отряд из ' + w.length + ' человек';
    }
    function actorVague(d, rng) {
        return pick(['какие-то приезжие', 'пришлые наёмники', 'чужаки с оружием', 'незнакомые искатели приключений', 'проходимцы со стороны'], rng);
    }
    function actorSingle(d, rng) {
        const w = (d.who || []).filter(Boolean);
        if (w.length) return pick(['пришлый по имени ' + pick(w, rng), 'некто по имени ' + pick(w, rng)], rng);
        return 'один из пришлых';
    }

    function placeOf(d, vague) {
        if (vague) return d.hold ? ('где-то неподалёку от ' + holdCase(d.hold, 'gen')) : 'где-то в глуши';
        const loc = holdCase(d.hold, 'loc');
        if (d.place && loc) return 'в месте «' + d.place + '», ' + loc;
        if (d.place) return 'в месте «' + d.place + '»';
        return loc || 'неподалёку';
    }

    function inflate(n, rng) {
        n = Math.max(1, n | 0);
        return Math.max(n + 2, Math.round(n * (2 + (rng || Math.random)() * 3)));
    }

    // Название жертвы для убийства (творительный падеж: «расправился с …»)
    function victims(d, count, withNames) {
        const base = clean(d.enemy || '');
        const noun = ENEMY_CATEGORY_INSTR[d.ecat] || 'тварями';
        if (!base) return noun;
        return withNames ? (noun + ' (' + base.toLowerCase() + (count > 1 ? ' ×' + count : '') + ')') : noun;
    }

    // ---- Шаблоны: каждый возвращает строку БЕЗ вводного слова рассказчика ----
    const TPL = {
        kill: {
            true: (d, r) => actorTrue(d) + ' расправился с ' + victims(d, d.count || 1, true) + ' ' + placeOf(d) + '.',
            twist: (d, r) => {
                const c = inflate(d.count || 1, r);
                return pick([
                    actorVague(d, r) + ' перебили ' + c + ' ' + (ENEMY_CATEGORY_NOUN[d.ecat] || 'тварей') + ' ' + placeOf(d, true) + '.',
                    actorSingle(d, r) + ' разогнал ' + (ENEMY_CATEGORY_NOUN[d.ecat] || 'тварей') + ' ' + placeOf(d, true) + ', а остальные только смотрели.',
                    (d.hold ? 'в окрестностях ' + holdCase(d.hold, 'gen') : 'в округе') + ' стало спокойнее — ' + actorVague(d, r) + ' положили там около ' + c + ' ' + (ENEMY_CATEGORY_NOUN[d.ecat] || 'тварей') + '.'
                ], r);
            },
            false: (d, r) => pick([
                actorVague(d, r) + ' сами и привели тех тварей, а теперь снимают с них награду.',
                'это стража зачистила дорогу, а пришлые лишь присвоили славу.',
                'пришлые не убили никого — просто заплатили, и твари ушли.',
                'тех тварей поднял из земли какой-то чародей, а пришлых наняли его «прикрыть».'
            ], r)
        },
        fall: {
            true: (d, r) => actorSingle(d, r) + ' упал замертво ' + placeOf(d) + ' и лишь через несколько дней пришёл в себя.',
            twist: (d, r) => pick([
                'один из пришлых умер, а потом встал живой ' + placeOf(d, true) + '. Видно, не обошлось без чёрной магии.',
                actorVague(d, r) + ' принесли с собой тело, которое к рассвету ожило.'
            ], r),
            false: (d, r) => pick([
                'пришлый, что лёг в землю, — вовсе не человек, а подменыш.',
                'на самом деле никто не падал: приезжие разыграли смерть, чтобы сбежать от долга.'
            ], r)
        },
        crime: {
            true: (d, r) => actorSingle(d, r) + ' попал под штраф ' + (holdCase(d.hold, 'loc') || 'в городе') + (d.reason ? ' — ' + lowerFirst(d.reason) : '') + (d.amount ? ' (' + d.amount + ' септимов).' : '.'),
            twist: (d, r) => pick([
                actorVague(d, r) + ' наделали шуму ' + (holdCase(d.hold, 'loc') || 'в городе') + ' — стража теперь присматривается' + (d.amount ? ', а штраф называют в ' + inflate(Math.max(1, Math.round(d.amount / 100)), r) * 100 + ' септимов.' : '.'),
                'за пришлыми числится дело ' + (holdCase(d.hold, 'loc') || 'в городе') + ', но подробностей никто не знает.'
            ], r),
            false: (d, r) => pick([
                'пришлые будто бы ограбили храм — стражи уже рыщут по дорогам.',
                'за головы этих чужаков назначена награда в тысячу септимов.',
                'это не пришлые виноваты, а местный купец, который решил сбыть вину на чужаков.'
            ], r)
        },
        jail: {
            true: (d, r) => actorSingle(d, r) + ' сидит под замком ' + (holdCase(d.hold, 'loc') || 'в городе') + (d.days ? ' на ' + d.days + ' дн.' : '.'),
            twist: (d, r) => 'пришлого посадили ' + (holdCase(d.hold, 'loc') || 'в городе') + ' — одни говорят, что на пару дней, другие — что на всю зиму.',
            false: (d, r) => pick(['тот пришлый давно сбежал из тюрьмы и скрывается в горах.', 'тюремщик, говорят, отпустил чужака за мешок золота.'], r)
        },
        quest: {
            true: (d, r) => actorTrue(d) + ' взялся за дело: «' + (d.what || 'таинственное поручение') + '».',
            twist: (d, r) => actorVague(d, r) + ' ищут тех, кто знает что-то про «' + (d.what || 'одно древнее дело') + '» — и платят щедро.',
            false: (d, r) => pick([
                'то поручение, что взяли пришлые, на деле ловушка — заказчик давно мёртв.',
                'за тем делом стоит Талмор, и пришлые об этом не знают.'
            ], r)
        },
        feat: {
            true: (d, r) => actorTrue(d) + ' ' + lowerFirst(d.what || 'совершили нечто достойное баллад') + ' ' + placeOf(d) + '.',
            twist: (d, r) => actorVague(d, r) + ' ' + lowerFirst(d.what || 'совершили невероятное') + ' ' + placeOf(d, true) + ' — и в каждом пересказе их становится всё больше.',
            false: (d, r) => pick(['всё это выдумали сами приезжие — ради бесплатной выпивки.', 'подвиг приписывают чужакам, а сделал его безымянный старый воин.'], r)
        },
        deed: {
            true: (d, r) => actorTrue(d) + ' ' + lowerFirst(d.what || 'помогли местным') + ' ' + placeOf(d) + '.',
            twist: (d, r) => actorVague(d, r) + ' ' + lowerFirst(d.what || 'помогли кому-то') + ' ' + placeOf(d, true) + ' — местные теперь поминают их добрым словом.',
            false: (d, r) => 'добрые дела пришлых — лишь прикрытие, они что-то высматривают в округе.'
        },
        trade: {
            true: (d, r) => actorTrue(d) + ' ' + lowerFirst(d.what || 'провернули выгодную сделку') + ' ' + placeOf(d) + '.',
            twist: (d, r) => actorVague(d, r) + ' ' + lowerFirst(d.what || 'провернули сделку') + ' ' + placeOf(d, true) + ' — сумму называют разную, но всегда огромную.',
            false: (d, r) => 'у пришлых полные карманы краденого — продают его под видом честного товара.'
        },
        magic: {
            true: (d, r) => actorTrue(d) + ' ' + lowerFirst(d.what || 'применили сильную магию') + ' ' + placeOf(d) + '.',
            twist: (d, r) => placeOf(d, true).replace('где-то ', 'где-то ') + ' видели вспышки и слышали гул — видно, ' + actorVague(d, r) + ' колдуют не на шутку.',
            false: (d, r) => 'пришлые — переодетые чародеи Коллегии, и им нельзя доверять.'
        },
        misc: {
            true: (d, r) => actorTrue(d) + ' ' + lowerFirst(d.what || 'устроили нечто заметное') + ' ' + placeOf(d) + '.',
            twist: (d, r) => actorVague(d, r) + ' ' + lowerFirst(d.what || 'устроили что-то') + ' ' + placeOf(d, true) + ' — подробностей почти не знают.',
            false: (d, r) => 'все эти рассказы про чужаков — чистая выдумка.'
        }
    };

    // Выбор вида слуха по весам (в процентах)
    const TONES = {
        truth:   { true: 75, twist: 20, false: 5,  label: 'Больше правды' },
        normal:  { true: 55, twist: 30, false: 15, label: 'Обычная молва' },
        liar:    { true: 30, twist: 40, false: 30, label: 'Много вранья' }
    };
    function rollTruth(tone, rng) {
        const w = TONES[tone] || TONES.normal;
        const x = (rng || Math.random)() * 100;
        return x < w.true ? 'true' : x < w.true + w.twist ? 'twist' : 'false';
    }

    // Главная функция: деяние → текст слуха
    //   mode: 'true' | 'twist' | 'false' | 'auto'
    function compose(deed, mode, opts) {
        opts = opts || {};
        const rng = opts.rng || Math.random;
        const kind = TPL[deed.kind] ? deed.kind : 'misc';
        let truth = mode;
        if (!truth || truth === 'auto') truth = rollTruth(opts.tone, rng);
        if (!TPL[kind][truth]) truth = 'true';
        const body = TPL[kind][truth](deed, rng);
        const voice = pick(VOICES, rng);
        // Все шаблоны начинаются либо с существительного-актёра, либо со строчной фразы:
        // приводим к виду «Говорят, что …» / «Бард напевает, будто …».
        const text = cap(voice + lowerFirst(body));
        return { text: text, truth: truth, kind: kind };
    }

    // Куда слух дойдёт: если деяние было НЕ там, где сейчас партия — слух «встретит» их тут;
    // если там же — слух уходит в другое владение и дождётся их там.
    function chooseHold(deed, ctx, rng) {
        rng = rng || Math.random;
        const all = (ctx.allHolds || []).filter(Boolean);
        const here = ctx.partyHold || '';
        const used = (deed.spread || []).map(s => s.hold);
        const sameHold = (a, b) => !!a && !!b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0);
        if (here && !sameHold(deed.hold, here) && used.indexOf(here) < 0) return here;
        const pool = all.filter(h => !sameHold(h, deed.hold) && used.indexOf(h) < 0);
        if (pool.length) return pick(pool, rng);
        return here || deed.hold || '';
    }

    // Какие деяния готовы к распространению: прошёл хотя бы 1 день, слух ещё не ушёл 3 раза
    function eligibleDeeds(deeds, day, maxSpread) {
        maxSpread = maxSpread || 3;
        return (deeds || []).filter(d => (d.spread || []).length < maxSpread && (day - (d.day || 0)) >= 1)
            .sort((a, b) => ((a.spread || []).length - (b.spread || []).length) || ((a.ts || 0) - (b.ts || 0)));
    }

    // Сжатие однотипных деяний в одно (например, три драки подряд в один день и в одном месте)
    function mergeKey(d) { return [d.kind, clean(d.enemy || d.what || ''), d.hold || '', d.day || 0].join('|'); }

    root.RumorEngine = {
        KIND_INFO: KIND_INFO, TONES: TONES, VOICES: VOICES,
        compose: compose, holdCase: holdCase, rollTruth: rollTruth, chooseHold: chooseHold,
        eligibleDeeds: eligibleDeeds, mergeKey: mergeKey, clean: clean, nameList: nameList
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.RumorEngine;
})(typeof window !== 'undefined' ? window : globalThis);
