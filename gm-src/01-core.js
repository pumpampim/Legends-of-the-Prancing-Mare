    let auth = null;
    let db = null;
    let currentUser = null;
    let _gmHeartbeatTimer = null; // heartbeat "мастер онлайн" — см. enterSessionView
    let currentCode = null;
    window.stGetSessionCode = () => currentCode; // для сборщика ошибок (js/00-error-log.js)
    let unsubSession = null;
    let unsubGmWatchedCharacter = null; // подписка на инвентарь выбранного игрока (своя, не через
                                          // cloud.js — gm.html его вообще не подключает)
    let lastData = { participants: {}, enemies: [], turnOrder: [], combatLog: [] };

    // Погода — здесь, В САМОМ НАЧАЛЕ файла, а не рядом с остальной логикой погоды: стартовая
    // инициализация (внизу файла) вызывает renderAllWeatherReference() сразу при загрузке
    // страницы, а gm.js выполняется построчно сверху вниз — если бы эти const стояли ниже места
    // вызова, при загрузке страница ловила бы "Cannot access before initialization" и вся
    // остальная инициализация после этой строки просто не происходила (инвентарь игрока,
    // порядок ходов, выбор атакующего — всё, что раньше "тихо не грузилось").
    const WEATHER_LABELS = {
        clear: '☀️ Ясно', cloudy: '☁️ Облачно', rain: '🌧️ Дождь', storm: '⛈️ Гроза',
        snow: '🌨️ Снегопад', blizzard: '🌬️ Метель', fog: '🌫️ Туман'
    };
    // Погода → штраф к дальнему бою врагов-лучников (те же числа, что у игроков: index.html WEATHER_MODS)
    const GM_WEATHER_RANGED = { rain: -2, storm: -4, blizzard: -4, fog: -4 };
    function gmWeatherRanged() { return GM_WEATHER_RANGED[(lastData && lastData.currentWeather) || 'clear'] || 0; }
    const WEATHER_EFFECTS = {
        clear: '', cloudy: '',
        rain: '−2 к дальнему бою (Стрельба), +2 к Скрытности — дождь маскирует шаги',
        storm: '−4 к дальнему бою, вспышки молний иногда выдают позицию (−2 к Скрытности при ударе)',
        snow: '−5 фт. скорости, +2 к Скрытности — снег глушит шаги',
        blizzard: '−10 фт. скорости, −4 к дальнему бою, видимость почти нулевая',
        fog: '+4 к Скрытности, −4 к дальнему бою — плохая видимость'
    };

    let gmAllItems = [];
    let gmAllItemsByKey = new Map(); // id/name → предмет, для O(1) поиска (см. loadGmItems)
    let gmFilteredItems = [];
    let currentRecipePlayerUid = null;
    let currentPlayerKnownRecipes = [];
    const GM_SESSION_KEY = 'ttrpg_gm_session_code';
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих O/0, I/1

    function el(id) { return document.getElementById(id); }

    function showOverlay(show) {
        el('auth-overlay').style.display = show ? 'flex' : 'none';
    }

    function showAuthError(msg) {
        const box = el('auth-error');
        box.textContent = msg;
        box.style.display = msg ? 'block' : 'none';
    }

    function updateStatusBar() {
        const info = el('cloud-user-info');
        const btn = el('btn-logout');
        if (currentUser) {
            info.textContent = '☁ Мастер: ' + currentUser.email;
            btn.style.display = 'inline-block';
        } else {
            info.textContent = 'Не авторизован';
            btn.style.display = 'none';
        }
    }

    function translateAuthError(e) {
        const map = {
            'auth/email-already-in-use': 'Этот email уже зарегистрирован — попробуй войти.',
            'auth/invalid-email': 'Некорректный email.',
            'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов).',
            'auth/wrong-password': 'Неверный пароль.',
            'auth/user-not-found': 'Аккаунт с таким email не найден.',
            'auth/invalid-credential': 'Неверный email или пароль.',
            'auth/too-many-requests': 'Слишком много попыток. Подожди немного.',
            'auth/popup-blocked': 'Браузер заблокировал всплывающее окно — разреши всплывающие окна для этого сайта.',
            'auth/account-exists-with-different-credential': 'Этот email уже привязан к аккаунту с другим способом входа.'
        };
        return map[e.code] || ('Ошибка: ' + e.message);
    }

    // 6.4: 1234 → «1 234» только для показа (в <input> остаются сырые числа)
    function formatNumber(n) {
        if (n === null || n === undefined || n === '' || isNaN(Number(n))) return n;
        const parts = String(Number(n)).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join('.');
    }
    window.formatNumber = formatNumber;

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Строка для JS-аргумента inline-обработчика (см. jsq в index.html): экранирует \ и ', затем HTML.
    function jsq(str) { return escapeHtml(String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

    // Атомарная правка массива vitals у персонажа: свежий документ читается и пишется в ОДНОЙ транзакции,
    // поэтому параллельная запись игрока (зелье, еда, урон) не затирается. mutate(vitals, data) меняет массив на месте;
    // extra — дополнительные поля того же обновления. Раньше читали .get(), правили и писали весь массив отдельным update.
    function updateCharacterVitals(uid, mutate, extra) {
        const ref = db.collection('characters').doc(uid);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            const v = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
            while (v.length < 4) v.push(0);
            mutate(v, data);
            tx.update(ref, Object.assign({ vitals: v }, extra || {}));
        }));
    }

    function genId(prefix) {
        return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // Та же формула модификатора характеристики, что у игрока (index.html) — gm.js отдельный
    // файл, общих переменных с ним нет, поэтому копия.
    // Урон врага оружием = база оружия + ЗНАЧЕНИЕ характеристики (Сила — ближний бой, Ловкость —
    // лук), как у игрока (updateCombat в index.html: baseDmg + str, а не модификатор). Раньше
    // характеристики у бандитов были, но влияли только на бросок попадания (atkMod), а сам урон
    // брался плоским weaponDmg — и генератор запекал в него лишь маленький модификатор (+1…+7).
    // Враги без характеристик (вся база enemies-data.js) считаются как прежде — stat=0.
    // TASK-001: расчёт перенесён в combat-bonuses.js (StBonuses.collectEnemyAttackBonuses) — тот же модуль, что считает
    // удар игрока. Возвращает прежние поля {base, stat, total, label} плюс разбивку {weaponEnchant, spiritFlat,
    // additivePct, mult, notes}. Запасной расчёт — на случай старого кэша страницы без нового файла.
    function enemyWeaponDamage(enemy) {
        if (window.StBonuses) return window.StBonuses.collectEnemyAttackBonuses(enemy);
        const base = enemy.weaponDmg || 0;
        if (!base) return { base: 0, stat: 0, total: 0, label: '' };
        const stat = enemy.isRanged ? (enemy.dex || 0) : (enemy.str || 0);
        return { base, stat, total: base + stat, label: enemy.isRanged ? 'ЛОВ' : 'СИЛ' };
    }

    function calcAbilityMod(val) {
        return Math.floor((val - 10) / 2);
    }

    // Firestore ЦЕЛИКОМ отвергает .set()/.update(), если хоть ОДНО поле где-то внутри (даже
    // вложенно, в массиве объектов) — undefined. Динамически собранные объекты (лут бандитов,
    // ассортимент торговцев) легко на это натыкаются — предмет без резиста/урона/слота даёт
    // undefined в этом поле. Рекурсивно чистит перед записью.
    function stripUndefinedDeep(value) {
        if (Array.isArray(value)) return value.map(stripUndefinedDeep);
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(k => {
                if (value[k] !== undefined) out[k] = stripUndefinedDeep(value[k]);
            });
            return out;
        }
        return value;
    }
