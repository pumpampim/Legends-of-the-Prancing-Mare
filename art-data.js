// ============================================================================
// ART-DATA.JS — рисованные картинки (сгенерированы ИИ, 2026-11-07).
// img/enemies/<slug>.webp — аватары врагов (по базовому имени из enemies-data.js);
// img/items/<kind>.webp  — иконки предметов по виду (меч, зелье здоровья, гриб...).
// Нет картинки — код страниц рисует старую SVG-иконку, как раньше.
// ============================================================================
(function () {
    var ENEMY_ART = {
        'Волк': 'wolf', 'Снежный волк': 'snow-wolf', 'Злокрыс': 'skeever', 'Рыба-убийца': 'slaughterfish',
        'Медведь': 'bear', 'Пещерный медведь': 'cave-bear', 'Снежный медведь': 'snow-bear', 'Грязевой краб': 'mudcrab',
        'Саблезуб': 'sabre-cat', 'Снежный саблезуб': 'snow-sabre-cat', 'Мамонт': 'mammoth',
        'Морозный паук': 'frostbite-spider', 'Гигантский морозный паук': 'giant-frostbite-spider',
        'Великан': 'giant', 'Ворожея': 'hagraven', 'Тролль': 'troll', 'Ледяной тролль': 'frost-troll',
        'Ледяное приведение': 'ice-wraith', 'Сприган': 'spriggan', 'Сприган-матрона': 'spriggan-matron', 'Корус': 'chaurus',
        'Нежить': 'undead', 'Скелет': 'skeleton', 'Скелет-маг': 'skeleton-mage',
        'Драугр': 'draugr', 'Беспокойный драугр': 'restless-draugr', 'Драугр-призрак': 'draugr-wight',
        'Драугр-палач': 'draugr-scourge', 'Драугр-главный палач': 'draugr-deathlord', 'Драугр-повелитель': 'draugr-overlord',
        'Неуклюжий драугр': 'draugr-shambler', 'Луркер': 'lurker', 'Луркер часовой': 'lurker-guardian',
        'Медведь оборотни': 'werebear', 'Нетч': 'netch', 'Горелый сприган': 'burnt-spriggan', 'Пепельный прыгун': 'ash-hopper',
        'Порождение пепла': 'ash-spawn', 'Щетиноспин': 'boar', 'Риклинг': 'riekling',
        'Фалмер (воин)': 'falmer-warrior', 'Фалмер-мастер укрытий (воин)': 'falmer-skulker-warrior',
        'Фалмер-сумрачный страж (воин)': 'falmer-gloomlurker-warrior', 'Фалмер-ночной охотник (воин)': 'falmer-nightprowler-warrior',
        'Фалмер (шаман)': 'falmer-shaman', 'Фалмер-мастер укрытий (шаман)': 'falmer-skulker-shaman',
        'Фалмер-сумрачный страж (шаман)': 'falmer-gloomlurker-shaman', 'Фалмер-ночной охотник (шаман)': 'falmer-nightprowler-shaman',
        'Фалмер (боевой маг)': 'falmer-battlemage', 'Фалмер-мастер укрытий (боевой маг)': 'falmer-skulker-battlemage',
        'Фалмер-сумрачный страж (боевой маг)': 'falmer-gloomlurker-battlemage', 'Фалмер-ночной охотник (боевой маг)': 'falmer-nightprowler-battlemage',
        'Фалмер (лучник)': 'falmer-archer', 'Фалмер-мастер укрытий (лучник)': 'falmer-skulker-archer',
        'Фалмер-сумрачный страж (лучник)': 'falmer-gloomlurker-archer', 'Фалмер-ночной охотник (лучник)': 'falmer-nightprowler-archer',
        'Фалмер': 'falmer-warrior',
        'Двемерская балиста': 'dwarven-ballista', 'Двемерский часовой': 'dwarven-sentry', 'Двемерский страж': 'dwarven-guardian',
        'Двемерская сфера': 'dwarven-sphere', 'Двемерский паук': 'dwarven-spider', 'Двемерский центурион': 'dwarven-centurion',
        'Лорд дремора': 'dremora-lord', 'Дремора': 'dremora-lord', 'Огненный атронах': 'flame-atronach', 'Ледяной атронах': 'frost-atronach',
        'Грозовой атронах': 'storm-atronach',
        'Бандит': 'bandit', 'Бандит-маг': 'bandit-mage', 'Разбойник': 'bandit-outlaw', 'Разбойник-маг': 'bandit-outlaw-mage',
        'Громила': 'bandit-thug', 'Громила-маг': 'bandit-thug-mage', 'Грабитель': 'bandit-highwayman', 'Грабитель-маг': 'bandit-highwayman-mage',
        'Головорез': 'bandit-plunderer', 'Головорез-маг': 'bandit-plunderer-mage', 'Мародер': 'bandit-marauder', 'Мародёр': 'bandit-marauder',
        'Мародер-маг': 'bandit-marauder-mage', 'Мародёр-маг': 'bandit-marauder-mage', 'Главарь бандитов': 'bandit-chief',
        'Изгой': 'forsworn', 'Изгой-шаман': 'forsworn-shaman', 'Изгой вересковое сердце': 'forsworn-briarheart',
        'Вервольф': 'werewolf', 'Оборотень': 'werewolf',
        'Вампир': 'vampire', 'Кровавый вампир': 'blood-vampire', 'Вампир ночной охотник': 'vampire-nightstalker',
        'Древний вампир': 'ancient-vampire', 'Волкихарский вампир': 'volkihar-vampire', 'Мастер вампир': 'master-vampire',
        'Волкихарский мастер вампир': 'volkihar-master-vampire', 'Вампир хозяин ночи': 'vampire-nightmaster',
        'Гончая смерти': 'death-hound', 'Горгулья': 'gargoyle', 'Горгулья-страж': 'gargoyle-sentinel', 'Горгулья-бестия': 'gargoyle-brute',
        'Олень (самка)': 'doe', 'Олень (самец)': 'stag', 'Олень': 'stag', 'Лось': 'elk', 'Лиса': 'fox', 'Снежная лиса': 'snow-fox',
        'Кролик': 'rabbit', 'Коза': 'goat', 'Корова': 'cow', 'Курица': 'chicken', 'Хоркер': 'horker', 'Собака': 'dog',
        'Лошадь': 'horse', 'Жрец-дракон': 'dragon-priest'
    };
    // Какие картинки уже лежат в img/ (остальные враги и виды пока рисуются старым SVG). Дополнять при новой генерации.
    var ENEMY_READY = {}; 'ash-hopper ash-spawn bandit bear boar burnt-spriggan cave-bear chaurus draugr-deathlord draugr-overlord draugr-scourge draugr-shambler draugr-wight draugr dremora-lord dwarven-centurion dwarven-sphere dwarven-spider falmer-archer falmer-battlemage falmer-gloomlurker-archer falmer-gloomlurker-battlemage falmer-gloomlurker-shaman falmer-gloomlurker-warrior falmer-nightprowler-archer falmer-nightprowler-battlemage falmer-nightprowler-shaman falmer-nightprowler-warrior falmer-shaman falmer-skulker-archer falmer-skulker-battlemage falmer-skulker-shaman falmer-skulker-warrior falmer-warrior flame-atronach frost-troll frostbite-spider giant-frostbite-spider giant hagraven ice-wraith lurker-guardian lurker mammoth mudcrab netch restless-draugr riekling sabre-cat skeever skeleton-mage skeleton slaughterfish snow-bear snow-sabre-cat snow-wolf spriggan-matron spriggan troll undead werebear wolf'.split(' ').forEach(function (k) { ENEMY_READY[k] = 1; });
    var ITEM_READY = {}; 'amulet arrow axe battleaxe bolt bone book boots bow bread cheese chest circlet clothes crossbow cuirass dagger drink fish gauntlets gem gold greatsword helm herb hood ingot key leather light-armor lockpick mace meat mushroom note ore pelt pickaxe poison potion-health potion-magicka potion-stamina potion pouch quiver ring robe scroll sheath shield soulgem soup staff sword tome torch warhammer wine'.split(' ').forEach(function (k) { ITEM_READY[k] = 1; });
    var KEYS = Object.keys(ENEMY_ART).map(function (k) { return [k.toLowerCase().replace(/ё/g, 'е'), ENEMY_ART[k]]; })
        .sort(function (a, b) { return b[0].length - a[0].length; });
    // Имя врага в бою бывает «Волк 2», «Бандит-маг (лидер)» — берём самое длинное базовое имя, с которого оно начинается.
    function enemyArtSlug(name) {
        var n = String(name || '').toLowerCase().replace(/ё/g, 'е').trim();
        if (!n) return '';
        for (var i = 0; i < KEYS.length; i++) if (n.indexOf(KEYS[i][0]) === 0) return KEYS[i][1];
        return '';
    }
    window.ENEMY_ART = ENEMY_ART;
    window.enemyArtSlug = enemyArtSlug;
    window.enemyArtUrl = function (name) { var s = enemyArtSlug(name); return s && ENEMY_READY[s] ? 'img/enemies/' + s + '.webp' : ''; };
    window.ENEMY_ART_READY = ENEMY_READY;

    var ITEM_KINDS = ['sword', 'greatsword', 'dagger', 'axe', 'battleaxe', 'mace', 'warhammer', 'bow', 'crossbow', 'arrow', 'bolt', 'staff',
        'helm', 'hood', 'cuirass', 'light-armor', 'robe', 'clothes', 'gauntlets', 'boots', 'shield', 'ring', 'amulet', 'circlet',
        'potion-health', 'potion-magicka', 'potion-stamina', 'potion', 'poison', 'herb', 'mushroom', 'fish', 'meat', 'bread', 'cheese',
        'drink', 'wine', 'soup', 'soulgem', 'scroll', 'tome', 'book', 'note', 'key', 'lockpick', 'pickaxe', 'ore', 'ingot', 'gem', 'pelt',
        'leather', 'gold', 'torch', 'quiver', 'sheath', 'pouch', 'bone', 'chest', 'sack', 'tool', 'cloth', 'lute', 'candle', 'misc',
        'backpack', 'dwemer', 'goblet', 'produce'];
    var GEM = /самоцвет|алмаз|бриллиант|рубин|сапфир|изумруд|аметист|гранат|жемчуг|лунн\S* камен|топаз/;
    function itemArtKind(it, broad) {
        if (!it) return 'misc';
        var n = String(it.name || '').toLowerCase().replace(/ё/g, 'е'), c = String(it.category || '').toLowerCase().replace(/ё/g, 'е');
        var s = it.slot || '', at = String(it.armorType || '').toLowerCase().replace(/ё/g, 'е'), t = n + ' | ' + c;
        var nm = function (re) { return re.test(n); }, has = function (re) { return re.test(t); };
        if (!broad) { try { broad = window.classifyItemBroad ? window.classifyItemBroad(it) : ''; } catch (e) { broad = ''; } }
        if (nm(/посох/)) return 'staff';
        if (nm(/колчан/)) return 'quiver';
        if (nm(/ножн|держатель для/) || s === 'sheath') return 'sheath';
        if (s === 'backpack' || nm(/рюкзак|палатк|спальн\S* мешок/)) return 'backpack';
        if (s === 'pouch' || nm(/подсумок|кошел|мешоч/)) return 'pouch';
        if (broad === 'weapon' || s === 'melee' || s === 'ranged') {
            if (nm(/арбалет/)) return 'crossbow';
            if (nm(/болт/)) return 'bolt';
            if (nm(/стрел/)) return 'arrow';
            if (/(^|[^а-я])лук(?!-)/.test(n)) return 'bow';
            if (nm(/кинжал|нож(?!н)/)) return 'dagger';
            if (nm(/секир|боев\S* топор|двуруч\S* топор/)) return 'battleaxe';
            if (nm(/топор|колун/)) return 'axe';
            if (nm(/молот/)) return 'warhammer';
            if (nm(/булав|палиц|шестопер/)) return 'mace';
            if (nm(/двуруч|клеймор/)) return 'greatsword';
            if (s === 'ranged') return 'bow';
            return 'sword';
        }
        if (broad === 'armor') {
            var hoodRe = /капюшон|колпак|шапк|шляп/;
            if (s === 'shield') return 'shield';
            if (s === 'helmet') return nm(hoodRe) ? 'hood' : 'helm';
            if (s === 'boots') return 'boots';
            if (s === 'gloves') return 'gauntlets';
            if (s === 'robe') return nm(hoodRe) ? 'hood' : 'robe';
            if (nm(/сапог|ботин|обув|башмак/)) return 'boots';
            if (nm(/перчат|наруч|рукавиц|когти/)) return 'gauntlets';
            if (nm(hoodRe)) return 'hood';
            if (nm(/шлем|маска/)) return 'helm';
            if (/(^|[^а-я])щит(?!к)/.test(n)) return 'shield';
            if (nm(/мантия|роба|одеян|балахон/)) return 'robe';
            if (at === 'одежда' || nm(/одежд|платье|рубах|туник|штан|костюм/)) return 'clothes';
            if (at === 'легкая') return 'light-armor';
            if (at === 'тяжелая') return 'cuirass';
            if (nm(/кож|шкур|мех|чешуйчат|стеклянн|эльфийск|соловь|теней|вор/)) return 'light-armor';
            return 'cuirass';
        }
        if (broad !== 'food' && nm(/^(зелье|эликсир|снадобье|яд )/)) broad = 'potion';
        if (broad === 'potion') {
            if (has(/яд(?!р)/)) return 'poison';
            if (nm(/здоров|лечен|исцел/)) return 'potion-health';
            if (nm(/маги|ман[аы]/)) return 'potion-magicka';
            if (nm(/запас сил|выносл|сил[аы]/)) return 'potion-stamina';
            return 'potion';
        }
        if (broad === 'jewelry') {
            if (s === 'ring' || nm(/кольц/)) return 'ring';
            if (s === 'circlet' || nm(/обруч|диадем|корон/)) return 'circlet';
            return 'amulet';
        }
        if (broad === 'magic') {
            if (nm(/камень душ|камни душ|камня душ/)) return 'soulgem';
            if (nm(/свит/)) return 'scroll';
            if (nm(/(^|[^а-я])том(?![а-я])|заклинан/) || has(/том(а|ов)? заклин/)) return 'tome';
            return 'book';
        }
        var FISH = /рыб|лосос|форел|сельд|окун|осетр|карп|щук/;
        if (broad === 'food') {
            if (nm(/вино/)) return 'wine';
            if (nm(/сыр(?!ая|ой|ое|ые|ую|ом)/)) return 'cheese';
            if (nm(/(^|[^а-я])мед(?![а-я])|меда?$|медовух|эль|пиво|напит|чай|молок|(^|[^а-я])сок(?![а-я])|настой|бренди|сидр|ром(?![а-я])|мацт|суджамм|флин|шейн|красновод/)) return 'drink';
            if (nm(/суп|рагу|похлеб|каша|бульон/)) return 'soup';
            if (nm(FISH) || nm(/икр/)) return 'fish';
            if (nm(/мяс|окорок|стейк|колбас|ребр|филе|вырезк|ножк|грудк|бекон|говядин|оленин|конин|собачатин|хобот|телятин|свинин|баранин/)) return 'meat';
            if (nm(/картоф|лук|капуст|морков|помидор|томат|яблок|груш|ягод|тыкв|чеснок|огур|свекл|овощ|фрукт|репа|кукуруз/)) return 'produce';
            return 'bread';
        }
        if (GEM.test(n)) return 'gem';
        if (nm(/слит/)) return 'ingot';
        if (nm(/руд[аы]?(?![а-я])/)) return 'ore';
        if (broad === 'ingredient') {
            if (nm(/гриб|шляпк|поганк|грибниц|трутовик/)) return 'mushroom';
            if (nm(FISH) || nm(/икр/)) return 'fish';
            if (nm(/шкур|мех(?![а-я])/)) return 'pelt';
            if (nm(/кост(?!р)|клык|коготь|когти|зуб|рог(а|и)?(?![а-я])|череп|чешуя|бивень/)) return 'bone';
            if (nm(/кож/)) return 'leather';
            if (c.indexOf('кузнеч') >= 0) return 'ore';
            return 'herb';
        }
        if (c.indexOf('двемер') >= 0 || nm(/двемер/)) return 'dwemer';
        if (nm(/отмыч/)) return 'lockpick';
        if (nm(/ключ/)) return 'key';
        if (nm(/кирк|лопат/)) return 'pickaxe';
        if (nm(/золот\S* монет|септим|монет/)) return 'gold';
        if (nm(/записк|письм|приказ|карт[аы]|список|запись|счет|договор|листовк|пергамент/)) return 'note';
        if (nm(/книг|дневник|журнал/)) return 'book';
        if (nm(/кубок|кружк|кувшин|чашк|чаша|тарелк|миск|ковш|кастрюл|казан|котел|бадья/)) return 'goblet';
        if (nm(/шкур/)) return 'pelt';
        if (nm(/кож(?!ан)/)) return 'leather';
        if (nm(/мешок/)) return 'sack';
        if (nm(/факел/)) return 'torch';
        if (nm(/свеч|фонар/)) return 'candle';
        if (nm(/лютн|флейт|барабан/)) return 'lute';
        if (nm(/платье|рубах|штан|туник/)) return 'clothes';
        if (nm(/ткан|(^|[^а-я])л[её]н(?![а-я])|полотн|нитк|холст/)) return 'cloth';
        if (nm(/молот|щипц|клещ|инструмент|пила|точил|утюг/)) return 'tool';
        if (nm(/кост(?!р)|клык|коготь|череп|бивень|рога/)) return 'bone';
        if (nm(/сундук|ларец|шкатулк/)) return 'chest';
        if (nm(/вино/)) return 'wine';
        return 'misc';
    }
    window.ITEM_ART_KINDS = ITEM_KINDS;
    window.ITEM_ART_READY = ITEM_READY;
    window.itemArtKind = itemArtKind;
    window.itemArtUrl = function (it, broad) { var k = itemArtKind(it, broad); return ITEM_READY[k] ? 'img/items/' + k + '.webp' : ''; };
})();
