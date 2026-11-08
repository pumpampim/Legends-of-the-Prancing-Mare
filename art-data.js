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
    var ENEMY_READY = {}; 'ancient-vampire ash-hopper ash-spawn bandit bandit-chief bandit-highwayman bandit-highwayman-mage bandit-mage bandit-marauder bandit-marauder-mage bandit-outlaw bandit-outlaw-mage bandit-plunderer bandit-plunderer-mage bandit-thug bandit-thug-mage bear blood-vampire boar burnt-spriggan cave-bear chaurus chicken cow death-hound doe dog dragon-priest draugr draugr-deathlord draugr-overlord draugr-scourge draugr-shambler draugr-wight dremora-lord dwarven-ballista dwarven-centurion dwarven-guardian dwarven-sentry dwarven-sphere dwarven-spider elk falmer-archer falmer-battlemage falmer-gloomlurker-archer falmer-gloomlurker-battlemage falmer-gloomlurker-shaman falmer-gloomlurker-warrior falmer-nightprowler-archer falmer-nightprowler-battlemage falmer-nightprowler-shaman falmer-nightprowler-warrior falmer-shaman falmer-skulker-archer falmer-skulker-battlemage falmer-skulker-shaman falmer-skulker-warrior falmer-warrior flame-atronach forsworn forsworn-briarheart forsworn-shaman fox frost-atronach frost-troll frostbite-spider gargoyle gargoyle-brute gargoyle-sentinel giant giant-frostbite-spider goat hagraven horker horse ice-wraith lurker lurker-guardian mammoth master-vampire mudcrab netch rabbit restless-draugr riekling sabre-cat skeever skeleton skeleton-mage slaughterfish snow-bear snow-fox snow-sabre-cat snow-wolf spriggan spriggan-matron stag storm-atronach troll undead vampire vampire-nightmaster vampire-nightstalker volkihar-master-vampire volkihar-vampire werebear werewolf wolf'.split(' ').forEach(function (k) { ENEMY_READY[k] = 1; });
    var ITEM_READY = {}; 'amulet arrow axe backpack battleaxe bolt bone book boots bow bread candle cheese chest circlet cloth clothes crossbow cuirass dagger drink dwemer fish gauntlets gem goblet gold greatsword helm herb hood ingot key leather light-armor lockpick lute mace meat misc mushroom note ore pelt pickaxe poison potion potion-health potion-magicka potion-stamina pouch produce quiver ring robe sack scroll sheath shield soulgem soup staff sword tome tool torch warhammer wine'.split(' ').forEach(function (k) { ITEM_READY[k] = 1; });
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
    var UI_READY = {}; 'alembic anvil axe banner basket blood bolt book boot bow bowl bread burst castle cauldron chest city coffin college compass crown dagger die drop eye fang fish flame gem gift globe glove hammer hand handshake heart helm herb hood horse hourglass house key lock lute map mask meat moon mountain mug necklace orb paw pick pinch potion pray purse quill ring rod satchel scales scroll shield shop shout shroom skull sleep snow sparkle spider staff star sun sword swords target tent tome tunic village wolf'.split(' ').forEach(function (k) { if (k) UI_READY[k] = 1; });
    window.UI_ART_READY = UI_READY;
    window.ITEM_ART_READY = ITEM_READY;
    window.itemArtKind = itemArtKind;
    window.itemArtUrl = function (it, broad) { var k = itemArtKind(it, broad); return ITEM_READY[k] ? 'img/items/' + k + '.webp' : ''; };
    // Иконки заклинаний: название → слаг файла img/spells/<слаг>.webp. SPELL_READY — какие файлы уже есть (дописывается при догенерации).
    var SPELL_ART = {"Лечение":"lechenie","Малый оберег":"malyy-obereg","Ядовитый поток":"yadovityy-potok","Очистка камней":"ochistka-kamney","Костяной дух":"kostyanoy-duh","Быстрое лечение":"bystroe-lechenie","Исцеляющие руки":"istselyayuschie-ruki","Устойчивый оберег":"ustoychivyy-obereg","Огонь солнца":"ogon-solntsa","Некромантское лечение":"nekromantskoe-lechenie","Отпугивание младшей нежити":"otpugivanie-mladshey-nezhiti","Ядовитая стрела":"yadovitaya-strela","Аура - Заклинатель":"aura-zaklinatel","Аура - Легкость":"aura-legkost","Аура - Защита от стихий":"aura-zaschita-ot-stihiy","Аура -Сила":"aura-sila","Аура - Скорость":"aura-skorost","Аура - Спасение":"aura-spasenie","Руна солнца":"runa-solntsa","Ядовитая руна":"yadovitaya-runa","Излечение от ран":"izlechenie-ot-ran","Большой оберег":"bolshoy-obereg","Лечение ближних":"lechenie-blizhnih","Лечение нежити":"lechenie-nezhiti","Отталкивание младшей нежити":"ottalkivanie-mladshey-nezhiti","Отпугивание нежити":"otpugivanie-nezhiti","Бич вампиров":"bich-vampirov","Аура Стендарра":"aura-stendarra","Священное оружие":"svyaschennoe-oruzhie","Объятия валькирии":"obyatiya-valkirii","Дар силы":"dar-sily","Круг защиты":"krug-zaschity","Высшее лечение":"vysshee-lechenie","Отталкивание нежити":"ottalkivanie-nezhiti","Отпугивание старшей нежити":"otpugivanie-starshey-nezhiti","Нова яда":"nova-yada","Гнозис":"gnozis","Круг огня":"krug-ognya","Призванный меч":"prizvannyy-mech","Призванный кинжал":"prizvannyy-kinzhal","Вызов питомца":"vyzov-pitomtsa","Оживление зомби":"ozhivlenie-zombi","Вызов роя":"vyzov-roya","Вызов скелета солдата":"vyzov-skeleta-soldata","Вызов Скелета мага":"vyzov-skeleta-maga","Пожирающая сила":"pozhirayuschaya-sila","Трансмутация смерти":"transmutatsiya-smerti","Призванная секира":"prizvannaya-sekira","Вызов огненного атронаха":"vyzov-ognennogo-atronaha","Оживление трупа":"ozhivlenie-trupa","Захват душ":"zahvat-dush","Огненный питомец":"ognennyy-pitomets","Аура боец":"aura-boets","Аура защита":"aura-zaschita","Аура маг":"aura-mag","Вызов скелета лучника":"vyzov-skeleta-luchnika","Вызов скелета танка":"vyzov-skeleta-tanka","Проклятие ужаса":"proklyatie-uzhasa","Нечестивый барьер 1":"nechestivyy-barer-1","Изгнание даэдра":"izgnanie-daedra","Призванный лук":"prizvannyy-luk","Вызов ледяного атронаха":"vyzov-ledyanogo-atronaha","Призрак":"prizrak","Некроаура урона":"nekroaura-urona","Призыв сильного скелета воина":"prizyv-silnogo-skeleta-voina","Призыв сильного скелета мага":"prizyv-silnogo-skeleta-maga","Призыв сильного скелета лучника":"prizyv-silnogo-skeleta-luchnika","Хрупкость":"hrupkost","Аура защиты призыва":"aura-zaschity-prizyva","Нечестивый барьер 2":"nechestivyy-barer-2","Приказ даэдра":"prikaz-daedra","Вызов лорда дремора":"vyzov-lorda-dremora","Вызов грозового атронаха":"vyzov-grozovogo-atronaha","Ужасный зомби":"uzhasnyy-zombi","Высылка даэдра":"vysylka-daedra","Жизнеотвод":"zhizneotvod","Некроаура защиты":"nekroaura-zaschity","Призыв Скелета героя":"prizyv-skeleta-geroya","Призыв Скелета эксперта":"prizyv-skeleta-eksperta","Призыв Скелета снайпера":"prizyv-skeleta-snaypera","Проклятие слабости":"proklyatie-slabosti","Нечестивый барьер 3":"nechestivyy-barer-3","Пламя":"plamya","Обморожение":"obmorozhenie","Искры":"iskry","Огненная стрела":"ognennaya-strela","Ледяной шип":"ledyanoy-ship","Молния":"molniya","Огненная руна":"ognennaya-runa","Морозная руна":"moroznaya-runa","Грозовая руна":"grozovaya-runa","Клыки дракона":"klyki-drakona","Раскаты грома":"raskaty-groma","Дух огня":"duh-ognya","Дух мороза":"duh-moroza","Дух молнии":"duh-molnii","Надлом":"nadlom","Нестабильное напряжение":"nestabilnoe-napryazhenie","Болид":"bolid","Огненный шар":"ognennyy-shar","Ледяная буря":"ledyanaya-burya","Цепная молния":"tsepnaya-molniya","Огненный плащ":"ognennyy-plasch","Морозный плащ":"moroznyy-plasch","Плащ молний":"plasch-molniy","Испепеление":"ispepelenie","Ледяное копьё":"ledyanoe-kope","Грозовой разряд":"grozovoy-razryad","Стена пламени":"stena-plameni","Стена мороза":"stena-moroza","Грозовая стена":"grozovaya-stena","Морозная нова":"moroznaya-nova","Запретное солнце":"zapretnoe-solntse","Грозовая нова":"grozovaya-nova","Луч огня":"luch-ognya","Луч мороза":"luch-moroza","Луч электричества":"luch-elektrichestva","Молниеносный прыжок":"molnienosnyy-pryzhok","Мужество":"muzhestvo","Ясновидение":"yasnovidenie","Ярость":"yarost","Антимагия":"antimagiya","Темное зрение":"temnoe-zrenie","Успокоение":"uspokoenie","Страх":"strah","Приглушение шагов":"priglushenie-shagov","Тьма":"tma","Магический резонанс":"magicheskiy-rezonans","Бешенство":"beshenstvo","Ободрение":"obodrenie","Руна бешенства":"runa-beshenstva","Плащ гашения":"plasch-gasheniya","Воображаемая боль":"voobrazhaemaya-bol","Шаг сквозь тень":"shag-skvoz-ten","Приманка истощения":"primanka-istoscheniya","Невидимость":"nevidimost","Умиротворение":"umirotvorenie","Бегство":"begstvo","Ночной клинок":"nochnoy-klinok","Эмпатическая агония":"empaticheskaya-agoniya","Бледная тень":"blednaya-ten","Дурман":"durman","Потусторонний камень":"potustoronniy-kamen","Горестная панихида":"gorestnaya-panihida","Свет свечи":"svet-svechi","Равновесие":"ravnovesie","Дубовая плоть":"dubovaya-plot","Тревога":"trevoga","Парение":"parenie","Стук 1":"stuk-1","Водное дыхание":"vodnoe-dyhanie","Плавники":"plavniki","Управление погодой":"upravlenie-pogodoy","Создание предмета":"sozdanie-predmeta","Магический свет":"magicheskiy-svet","Каменная плоть":"kamennaya-plot","Стук 2":"stuk-2","Импульс":"impuls","Магическая броня":"magicheskaya-bronya","Магическая броня на цель":"magicheskaya-bronya-na-tsel","Трансмутация мускулов":"transmutatsiya-muskulov","Трансформация Арктуса":"transformatsiya-arktusa","Барьер":"barer","Обнаружение жизни":"obnaruzhenie-zhizni","Железная плоть":"zheleznaya-plot","Телекинез":"telekinez","Трансмутация":"transmutatsiya","Легкое перышко":"legkoe-peryshko","Превращение":"prevraschenie","Вихревой плащ":"vihrevoy-plasch","Трансмутация мускулы на себя":"transmutatsiya-muskuly-na-sebya","Трансмутация мускулы на цель":"transmutatsiya-muskuly-na-tsel","Поглощение магии":"pogloschenie-magii","Руна гейзера":"runa-geyzera","Телекинетический столп":"telekineticheskiy-stolp","Стук 3":"stuk-3","Обнаружение смерти":"obnaruzhenie-smerti","Эбонитовая плоть":"ebonitovaya-plot","Паралич":"paralich","Увядание":"uvyadanie","Телекенитичекая нова":"telekenitichekaya-nova","Стук 4":"stuk-4","Танец клинков":"tanets-klinkov","Гравитационный куб":"gravitatsionnyy-kub","Чародейское плетение":"charodeyskoe-pletenie","Гудящий камень":"gudyaschiy-kamen","Знание - сила":"znanie-sila","Полиморф":"polimorf","Природный Барьер":"prirodnyy-barer","Слом защиты":"slom-zaschity","Хватка теней":"hvatka-teney"};
    var SPELL_READY = {}; 'antimagiya aura-boets aura-legkost aura-mag aura-sila aura-skorost aura-spasenie aura-stendarra aura-zaklinatel aura-zaschita aura-zaschita-ot-stihiy aura-zaschity-prizyva barer begstvo beshenstvo bich-vampirov blednaya-ten bolid bolshoy-obereg bystroe-lechenie charodeyskoe-pletenie dar-sily dubovaya-plot duh-molnii duh-moroza duh-ognya durman ebonitovaya-plot empaticheskaya-agoniya gnozis gorestnaya-panihida gravitatsionnyy-kub grozovaya-nova grozovaya-runa grozovaya-stena grozovoy-razryad gudyaschiy-kamen hrupkost hvatka-teney impuls iskry ispepelenie istselyayuschie-ruki izgnanie-daedra izlechenie-ot-ran kamennaya-plot klyki-drakona kostyanoy-duh krug-ognya krug-zaschity lechenie lechenie-blizhnih lechenie-nezhiti ledyanaya-burya ledyanoe-kope ledyanoy-ship legkoe-peryshko luch-elektrichestva luch-moroza luch-ognya magicheskaya-bronya magicheskaya-bronya-na-tsel magicheskiy-rezonans magicheskiy-svet malyy-obereg molnienosnyy-pryzhok molniya moroznaya-nova moroznaya-runa moroznyy-plasch muzhestvo nadlom nechestivyy-barer-1 nechestivyy-barer-2 nechestivyy-barer-3 nekroaura-urona nekroaura-zaschity nekromantskoe-lechenie nestabilnoe-napryazhenie nevidimost nochnoy-klinok nova-yada obmorozhenie obnaruzhenie-smerti obnaruzhenie-zhizni obodrenie obyatiya-valkirii ochistka-kamney ognennaya-runa ognennaya-strela ognennyy-pitomets ognennyy-plasch ognennyy-shar ogon-solntsa otpugivanie-mladshey-nezhiti otpugivanie-nezhiti otpugivanie-starshey-nezhiti ottalkivanie-mladshey-nezhiti ottalkivanie-nezhiti ozhivlenie-trupa ozhivlenie-zombi paralich parenie plamya plasch-gasheniya plasch-molniy plavniki pogloschenie-magii polimorf potustoronniy-kamen pozhirayuschaya-sila prevraschenie priglushenie-shagov prikaz-daedra primanka-istoscheniya prirodnyy-barer prizrak prizvannaya-sekira prizvannyy-kinzhal prizvannyy-luk prizvannyy-mech prizyv-silnogo-skeleta-luchnika prizyv-silnogo-skeleta-maga prizyv-silnogo-skeleta-voina prizyv-skeleta-eksperta prizyv-skeleta-geroya prizyv-skeleta-snaypera proklyatie-slabosti proklyatie-uzhasa raskaty-groma ravnovesie runa-beshenstva runa-geyzera runa-solntsa shag-skvoz-ten slom-zaschity sozdanie-predmeta stena-moroza stena-plameni strah stuk-1 stuk-2 stuk-3 stuk-4 svet-svechi svyaschennoe-oruzhie tanets-klinkov telekenitichekaya-nova telekineticheskiy-stolp telekinez temnoe-zrenie tma transformatsiya-arktusa transmutatsiya transmutatsiya-muskulov transmutatsiya-muskuly-na-sebya transmutatsiya-muskuly-na-tsel transmutatsiya-smerti trevoga tsepnaya-molniya umirotvorenie upravlenie-pogodoy uspokoenie ustoychivyy-obereg uvyadanie uzhasnyy-zombi vihrevoy-plasch vodnoe-dyhanie voobrazhaemaya-bol vysshee-lechenie vysylka-daedra vyzov-grozovogo-atronaha vyzov-ledyanogo-atronaha vyzov-lorda-dremora vyzov-ognennogo-atronaha vyzov-pitomtsa vyzov-roya vyzov-skeleta-luchnika vyzov-skeleta-maga vyzov-skeleta-soldata vyzov-skeleta-tanka yadovitaya-runa yadovitaya-strela yadovityy-potok yarost yasnovidenie zahvat-dush zapretnoe-solntse zheleznaya-plot zhizneotvod znanie-sila'.split(' ').forEach(function (k) { if (k) SPELL_READY[k] = 1; });
    window.SPELL_ART_READY = SPELL_READY;
    window.spellArtUrl = function (name) { var s = SPELL_ART[name]; return s && SPELL_READY[s] ? 'img/spells/' + s + '.webp' : ''; };
})();
