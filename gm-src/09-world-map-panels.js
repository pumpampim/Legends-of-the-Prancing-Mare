
    // ---------- Время суток и погода ----------

    const REGION_WEATHER_POOL = {
        'Лес': ['clear', 'cloudy', 'rain', 'fog'],
        'Болото': ['cloudy', 'rain', 'fog', 'storm'],
        'Горы': ['snow', 'blizzard', 'clear', 'cloudy'],
        'Побережье': ['clear', 'cloudy', 'rain', 'storm', 'fog'],
        'Равнина': ['clear', 'cloudy', 'rain'],
        'Подземелье': ['clear']
    };
    // Задача "погода — чёткие плюсы/минусы": та же самая формулировка, что видит игрок в
    // виджете текущей погоды (index.html WEATHER_TYPES) — продублировано тут, т.к. gm.js
    // отдельный файл без общего доступа к переменным index.html. Полный список (все явления
    // разом, не только текущее) — только у мастера, справочником ниже.
    // (сами WEATHER_LABELS/WEATHER_EFFECTS объявлены в самом начале файла — вызов
    // renderAllWeatherReference() в стартовой инициализации происходит раньше, чем скрипт успел
    // бы дойти досюда, и const в temporal dead zone бросал ReferenceError, ломая ВЕСЬ остаток
    // инициализации гм-панели: инвентарь игрока, атаку, порядок ходов — всё, что шло после)

    // Задача E: случайные события — раньше у мастера не было даже кнопки.
    window.rollRandomEvent = function () {
        const box = el('random-event-result');
        if (!box || !window.randomEventsData || !window.randomEventsData.length) {
            if (box) box.innerHTML = '<span style="color:#e74c3c;">База событий не загрузилась.</span>';
            return;
        }
        const e = window.randomEventsData[Math.floor(Math.random() * window.randomEventsData.length)];
        box.innerHTML = `<div style="font-size:13px;"><strong>🎲 ${e.roll}: ${escapeHtml(e.name)}</strong></div>
            <div style="margin-top:3px;">${escapeHtml(e.desc)}</div>
            ${e.req ? `<div style="margin-top:3px; opacity:.7;">⚠️ Условие: ${escapeHtml(e.req)}</div>` : ''}`;
        gmPostLogEntryText(`🎲 Случайное событие: «${e.name}»`);
    };

    function renderAllWeatherReference() {
        const box = el('all-weather-body');
        if (!box) return;
        box.innerHTML = Object.keys(WEATHER_LABELS).map(k =>
            `<div style="font-size:12px; margin-top:3px;"><strong>${WEATHER_LABELS[k]}</strong>${WEATHER_EFFECTS[k] ? ' — ' + escapeHtml(WEATHER_EFFECTS[k]) : ' — без штрафов/бонусов'}</div>`
        ).join('');
    }

    let pendingWeatherKey = null;

    // Задача H: сезон смещает пул погоды региона — зимой чаще снег/метель, весной чаще дождь,
    // летом чаще ясно, осенью чаще туман (там, где эта погода вообще возможна в регионе).
    const SEASON_WEATHER_BIAS = {
        'Зима': ['snow', 'blizzard'],
        'Весна': ['rain', 'storm'],
        'Лето': ['clear', 'cloudy'],
        'Осень': ['fog', 'cloudy']
    };

    // Выбор погоды вынесен в функцию (эпик 4.2), чтобы автосмена и кнопка «по региону» бросали одинаково.
    function pickWeatherKey(region, season, rnd) {
        const basePool = REGION_WEATHER_POOL[region] || ['clear'];
        const biasTypes = (SEASON_WEATHER_BIAS[season] || []).filter(w => basePool.includes(w));
        // Сезонно уместная погода весит втрое больше, но пул региона остаётся границей
        // возможного — в лесу зимой не будет "clear-only подземелья", а метели не будет в лесу.
        const pool = basePool.concat(biasTypes, biasTypes);
        return pool[Math.floor((rnd || Math.random)() * pool.length)];
    }
    window.rollWeatherForRegion = function () {
        const region = el('weather-region-select').value;
        const season = el('weather-season-select').value;
        pendingWeatherKey = pickWeatherKey(region, season);
        el('weather-gm-result').innerHTML = `Выпало: <strong>${WEATHER_LABELS[pendingWeatherKey]}</strong> — жми «Применить», чтобы сообщить игрокам.`;
    };


    // ---------- Эпик 4.2: автосмена погоды при новом игровом дне ----------
    // «Новый день» = рост sessions.gameDayCounter (его двигает «Следующий день» у игрока либо кнопка мастера). Предложение, а не молчаливая замена:
    // [Применить] / [Другое] / [Оставить].
    let _wxDayLast = null;
    // Сезон погоды хранится в сессии (sessions.weatherSeason): раньше после перезагрузки там снова было «Лето»,
    // и автопогода нового дня бросалась по летнему пулу даже зимой.
    window.gmSaveWeatherSeason = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ weatherSeason: el('weather-season-select').value }).catch(e => console.error(e));
    };
    function gmRestoreWeatherSeason(d) {
        const sel = el('weather-season-select');
        if (sel && d && d.weatherSeason && sel.value !== d.weatherSeason && document.activeElement !== sel) sel.value = d.weatherSeason;
    }
    function gmWeatherDayWatch(d) {
        gmRestoreWeatherSeason(d);
        const day = d.gameDayCounter || 0;
        if (_wxDayLast === null) { _wxDayLast = day; return; }   // первый снимок только запоминаем
        if (day <= _wxDayLast) { _wxDayLast = day; return; }
        _wxDayLast = day;
        const cb = el('weather-auto-day');
        if (cb && cb.checked) setTimeout(window.gmProposeWeather, 100);
    }
    window.gmProposeWeather = function (rnd) {
        const region = (lastData && lastData.currentRegion) || el('weather-region-select').value;
        const season = el('weather-season-select').value;
        const hold = (lastData && lastData.currentHold) || '';
        for (let i = 0; i < 6; i++) {
            const key = pickWeatherKey(region, season, rnd);
            const place = (hold ? hold.replace(/\s*\(.*\)/, '') : region);
            if (confirm('В ' + (hold ? hold.replace(/\s*\(.*\)/, '') : 'регионе «' + region + '»') + ' сегодня: ' + WEATHER_LABELS[key] + '.\n\nОК — применить\nОтмена — другие варианты')) {
                pendingWeatherKey = key;
                db.collection('sessions').doc(currentCode).update({ currentWeather: key, currentRegion: region }).then(() => {
                    gmPostLogEntryText('🌦 Новый день: ' + WEATHER_LABELS[key] + ' (' + place + ').');
                    el('weather-gm-result').innerHTML = '<span style="color:#2ecc71;">✅ Погода дня: ' + WEATHER_LABELS[key] + '.</span>';
                }).catch(e => alert('Ошибка: ' + e.message));
                return key;
            }
            if (!confirm('Выбрать другую погоду?\n\nОК — перебросить\nОтмена — оставить как есть')) return null;
        }
        return null;
    };
    window.gmNewGameDay = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ gameDayCounter: firebase.firestore.FieldValue.increment(1), gameDayPlayerMax: firebase.firestore.FieldValue.increment(1) }) /* день у партии один: «Следующий день» игроков за этот же день счётчик уже не двигает */.catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Эпик 5.5/5.6: уведомления мастера и «Позвать» ----------
    function gmNotify(title, body) {
        try {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            if (!document.hidden && !window.__stNotifyAlways) return;
            new Notification(title, { body: body || '', icon: 'skyrim-bg.jpg' });
        } catch (e) { }
    }
    window.gmNotify = gmNotify;
    window.gmEnableNotifications = function () {
        if (typeof Notification === 'undefined') { alert('Этот браузер не поддерживает уведомления.'); return; }
        Notification.requestPermission().then(p => { const b = el('gm-btn-notify'); if (b) b.textContent = p === 'granted' ? '🔔 Уведомления включены' : '🔕 Уведомления запрещены'; });
    };
    let _ntf = null; // предыдущие счётчики: шёпот от игроков и число врагов
    function gmNotifyWatch(d) {
        const w = (d.whispers || []).length, e = (d.enemies || []).length;
        if (_ntf) {
            if (w > _ntf.w) { const last = d.whispers[w - 1] || {}; gmNotify('Шёпот от ' + (last.author || 'игрока'), last.text || ''); }
            if (e > _ntf.e) gmNotify('Новый противник', ((d.enemies[e - 1] || {}).name) || '');
        }
        _ntf = { w, e };
        const b = el('gm-btn-notify');
        if (b && typeof Notification !== 'undefined') b.textContent = Notification.permission === 'granted' ? '🔔 Уведомления включены' : Notification.permission === 'denied' ? '🔕 Уведомления запрещены' : '🔔 Разрешить уведомления';
    }
    window.gmCallPlayers = function () {
        const uids = Object.keys((lastData && lastData.participants) || {});
        if (!currentCode || !uids.length) { alert('В сессии нет игроков.'); return; }
        const cmd = { id: 'call-' + Date.now() + Math.random().toString(36).slice(2, 5), cmd: 'call', ts: Date.now(), fromGm: true };
        const patch = {};
        uids.forEach(u => { patch['participants.' + u + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd); });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '📣 Мастер зовёт всех в игру!' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Эпик 4.5: встреча в пути при движении партии ----------
    // d6, на 5–6 — случайное событие из таблицы; показывается окном с кнопкой «Сообщить партии» (в журнал уходит только по нажатию).
    window.gmRollTravelEncounter = function (rnd) {
        rnd = rnd || Math.random;
        const roll = Math.floor(rnd() * 6) + 1;
        if (roll < 5 || !window.randomEventsData || !window.randomEventsData.length) return null;
        const e = window.randomEventsData[Math.floor(rnd() * window.randomEventsData.length)];
        const old = document.getElementById('gm-encounter-modal'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'gm-encounter-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
        m.innerHTML = '<div style="background:var(--panel-bg,#1e1a13);border:2px solid var(--accent-color,#c8a566);border-radius:8px;padding:16px 18px;max-width:92vw;width:420px;">' +
            '<h3 style="margin:0 0 6px;">🎲 Встреча в пути (d6: ' + roll + ')</h3><div style="font-weight:bold;">' + escapeHtml(e.name) + '</div><div style="margin-top:4px;">' + escapeHtml(e.desc) + '</div>' +
            (e.req ? '<div style="margin-top:4px;opacity:.7;">⚠️ Условие: ' + escapeHtml(e.req) + '</div>' : '') +
            '<div style="display:flex;gap:8px;margin-top:12px;"><button class="btn-success" style="flex:1;" id="gm-enc-tell">Сообщить партии</button><button style="width:auto;" id="gm-enc-close">Закрыть</button></div></div>';
        document.body.appendChild(m);
        el('gm-enc-close').onclick = () => m.remove();
        el('gm-enc-tell').onclick = () => { gmPostLogEntryText('🎲 В пути: «' + e.name + '» — ' + e.desc); m.remove(); };
        return { roll, event: e };
    };

    // ---------- Карта и положение партии ----------
    let gmMapHold = '', gmMapSel = null, gmMapSig = null, gmRoute = null;
    function gmMapParty() { return window.HoldsMap ? window.HoldsMap.partyFromSession(lastData) : null; }
    function gmMapMarks() { return lastData && Array.isArray(lastData.mapMarks) ? lastData.mapMarks : []; }
    const gmClean = o => JSON.parse(JSON.stringify(o)); // убирает undefined — Firestore их не принимает
    // Туман войны: настройки в сессии (mapFog). По умолчанию выключен — игроки видят всё, как раньше.
    function gmFog() {
        const f = (lastData && lastData.mapFog) || {};
        return { on: !!f.on, auto: f.auto !== false, r: f.r || 35, holds: (f.holds || []).slice(), circles: (f.circles || []).slice() };
    }
    function gmFogWrite(f, msg) {
        if (!currentCode) { el('gm-map-result').textContent = 'Нет активной сессии.'; return; }
        db.collection('sessions').doc(currentCode).update({ mapFog: gmClean(f) }).then(() => {
            if (msg) el('gm-map-result').innerHTML = `<span style="color:#2ecc71;">${msg}</span>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    }
    const GM_FOG_MAX = 300;
    // добавляет круг, если он ещё не перекрыт почти таким же; true — добавлен
    function gmFogAdd(f, c) {
        if (f.circles.some(o => o.r >= c.r * 0.9 && Math.hypot(o.x - c.x, o.y - c.y) < c.r * 0.35)) return false;
        if (f.circles.length >= GM_FOG_MAX) return false;
        f.circles.push(gmClean({ x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r), hold: c.hold || undefined, u: c.u, v: c.v }));
        return true;
    }
    // выбранное поселение; если на картинке владения известно его точное место — запоминаем u,v
    function gmSettleSel(h, n, x, y, u, v) {
        const im = window.HoldsMap && window.HoldsMap.IMG[h];
        if (u == null && im && im.settle && im.settle[n]) { u = im.settle[n][0]; v = im.settle[n][1]; }
        return { hold: h, name: n, x, y, u, v };
    }
    function gmCfg() { return window.HoldsMap.travelCfg(lastData && lastData.mapCfg); }
    // Положения поселений, назначенные мастером (session.mapSettle[name] = {hold,x,y,u?,v?})
    function gmSettleOv() { return (lastData && lastData.mapSettle && typeof lastData.mapSettle === 'object') ? lastData.mapSettle : {}; }
    window.gmMapAssignSettle = function () {
        const res = el('gm-map-result');
        const v = (el('gm-map-settle-set') || {}).value;
        if (!v) { res.textContent = 'Выбери поселение в списке рядом с кнопкой «Назначить».'; return; }
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { res.textContent = 'Сначала выбери точку: приблизь владение и кликни там, где поселение стоит на картинке.'; return; }
        if (!currentCode) { res.textContent = 'Нет активной сессии.'; return; }
        const [hk, n] = v.split('|');
        if (gmMapSel.hold && gmMapSel.hold !== hk) { res.textContent = 'Выбранная точка в другом владении («' + gmMapSel.hold + '»), а «' + n + '» относится к «' + hk + '».'; return; }
        const next = Object.assign({}, gmSettleOv()); next[n] = Object.assign({ hold: hk }, gmPosOf(gmMapSel));
        db.collection('sessions').doc(currentCode).update({ mapSettle: gmClean(next) }).then(() => {
            res.innerHTML = `<span style="color:#2ecc71;">🏘 «${escapeHtml(n)}» теперь стоит на выбранной точке (карта, маршруты и у игроков).</span>`;
            gmMapSel = null; gmMapShowSel();
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapResetSettle = function (n) {
        if (!currentCode) return;
        const next = Object.assign({}, gmSettleOv()); delete next[n];
        db.collection('sessions').doc(currentCode).update({ mapSettle: gmClean(next) }).then(() => {
            el('gm-map-result').textContent = '«' + n + '» снова стоит по условной схеме.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmMapRenderSettleOv() {
        const b = el('gm-map-settle-ov'); if (!b) return;
        const ov = gmSettleOv(), names = Object.keys(ov);
        b.innerHTML = names.length ? '<div style="font-size:13px; margin-bottom:2px;"><b>🏘 Поселения с назначенным положением (' + names.length + '):</b></div>' + names.map(n => `<div style="display:flex; gap:6px; align-items:center; font-size:13px; margin-bottom:2px;">
            <span style="flex:1;">🏘 ${escapeHtml(n)} <span style="opacity:.6;">(${escapeHtml(ov[n].hold || '')})</span></span>
            <button style="font-size:11px; padding:1px 6px;" onclick="gmMapResetSettle('${jsq(n)}')" title="Вернуть условное положение">↺</button></div>`).join('') : '';
    }

    window.renderGmMap = function (force) {
        const box = el('gm-map');
        if (!box || !window.HoldsMap) return;
        const party = gmMapParty();
        const marks = gmMapMarks();
        const fogS = gmFog();
        const sig = JSON.stringify([gmMapHold, party, gmMapSel, marks, fogS, gmRoute && gmRoute.pts, lastData && lastData.travelRoute && lastData.travelRoute.ts, lastData && lastData.mapCfg, lastData && lastData.openPlaces, lastData && lastData.mapSettle]);
        if (!force && sig === gmMapSig) return;
        gmMapSig = sig;
        const sel = el('gm-map-hold');
        if (sel && sel.options.length < 2) {
            sel.innerHTML = '<option value="">— вся карта —</option>' + Object.keys(window.HoldsMap.HOLDS).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        }
        if (sel) sel.value = gmMapHold;
        const ss2 = el('gm-map-settle-set');
        if (ss2 && ss2.options.length < 2) {
            const S2 = window.HoldsMap.SETTLE;
            ss2.innerHTML = '<option value="">— поселение, которому назначить выбранную точку —</option>' + Object.keys(S2).map(h => `<optgroup label="${escapeHtml(h)}">` + Object.keys(S2[h]).map(n => `<option value="${escapeHtml(h + '|' + n)}">${escapeHtml(n)}</option>`).join('') + '</optgroup>').join('');
        }
        const ss = el('gm-map-settle');
        if (ss && ss.options.length < 2) {
            const S = window.HoldsMap.SETTLE;
            ss.innerHTML = '<option value="">— выбрать поселение из списка —</option>' + Object.keys(S).map(h => `<optgroup label="${escapeHtml(h)}">` + Object.keys(S[h]).map(n => `<option value="${escapeHtml(h + '|' + n)}">${escapeHtml(n)}</option>`).join('') + '</optgroup>').join('');
        }
        const pins = window.HoldsMap.loadPins();
        // метки, выставленные игрокам, показываем и мастеру (красным) — чтобы было видно, что именно открыто
        marks.forEach(m => {
            if (!m || typeof m.x !== 'number') return;
            const hk = m.hold || '';
            pins[hk] = pins[hk] || {};
            let key = m.name || 'Метка';
            if (pins[hk][key] && pins[hk][key].cat !== 'Метка для игроков') key += ' ★';
            pins[hk][key] = { x: m.x, y: m.y, u: m.u, v: m.v, cat: 'Метка для игроков' };
        });
        // места, открытые игрокам (в т.ч. лично) — зелёным: мастер видит, ГДЕ именно привязано каждое
        (Array.isArray(lastData && lastData.openPlaces) ? lastData.openPlaces : []).forEach(p => {
            if (!p || typeof p.x !== 'number') return;
            const hk = p.hold || '';
            pins[hk] = pins[hk] || {};
            let key = p.name || 'Место';
            if (pins[hk][key] && pins[hk][key].cat !== 'Открыто игрокам') key += ' ✔';
            pins[hk][key] = { x: p.x, y: p.y, u: p.u, v: p.v, cat: 'Открыто игрокам' + (Array.isArray(p.toUids) && p.toUids.length ? ' · лично: ' + gmUidsText(p.toUids) : '') };
        });
        const pubRoute = lastData && lastData.travelRoute && Array.isArray(lastData.travelRoute.pts) ? lastData.travelRoute : null;
        window.HoldsMap.render(box, {
            hold: gmMapHold || null, hl: (lastData && lastData.currentHold) || null, party, pins, sel: gmMapSel, settleOv: gmSettleOv(),
            fog: fogS.on ? window.HoldsMap.fogFromSession(lastData, true) : null,
            route: gmRoute ? { pts: gmRoute.pts } : (pubRoute ? { pts: pubRoute.pts } : null),
            onHold: h => { gmMapHold = h; gmMapSel = null; window.renderGmMap(true); },
            onSettlement: (h, n, x, y, u, v) => { gmMapSel = gmSettleSel(h, n, x, y, u, v); gmMapShowSel(); window.renderGmMap(true); },
            onPin: (h, n) => { const p = ((pins[h] || {})[n]); if (p) { gmMapSel = { hold: h, name: n, x: p.x, y: p.y, u: p.u, v: p.v }; gmMapShowSel(); window.renderGmMap(true); } },
            onMap: gmMapHold ? (x, y, h, u, v) => { gmMapSel = { hold: h || gmMapHold, name: (el('gm-map-label').value || '').trim(), x, y, u, v }; gmMapShowSel(); window.renderGmMap(true); } : null
        });
        gmMapShowSel();
        gmMapRenderMarks();
        gmMapRenderSettleOv();
        gmFogShowInfo();
        gmCfgFill();
    };
    function gmMapRenderMarks() {
        const b = el('gm-map-marks');
        if (!b) return;
        const marks = gmMapMarks();
        b.innerHTML = marks.length
            ? '<div style="font-size:13px; margin-bottom:2px;"><b>📌 Метки, видимые игрокам (' + marks.length + '):</b></div>' + marks.map(m => `<div style="display:flex; gap:6px; align-items:center; font-size:13px; margin-bottom:2px;">
                <span style="flex:1;">📌 ${escapeHtml(m.name || 'Метка')} <span style="opacity:.6;">${m.hold ? '(' + escapeHtml(m.hold) + ')' : ''}</span>${Array.isArray(m.toUids) && m.toUids.length ? ' <span style="color:#e6b800;">🔒 ' + escapeHtml(gmUidsText(m.toUids)) + '</span>' : ''}</span>
                <button style="font-size:11px; padding:1px 6px;" onclick="gmMapRemoveMark('${jsq(m.id)}')" title="Убрать метку у игроков">🗑</button></div>`).join('')
            : '<div style="font-size:12px; opacity:.6;">Игрокам пока не выставлено ни одной своей метки.</div>';
    }
    // координаты точки для записи в сессию: x,y — схема, u,v — доли картинки владения (если есть)
    function gmPosOf(sel) {
        const o = { x: Math.round(sel.x), y: Math.round(sel.y) };
        if (typeof sel.u === 'number' && typeof sel.v === 'number') { o.u = sel.u; o.v = sel.v; }
        return o;
    }
    window.gmMapAddMark = function () {
        const res = el('gm-map-result');
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { res.textContent = 'Сначала выбери точку на карте (в приближении владения) или метку места.'; return; }
        if (!currentCode) { res.textContent = 'Нет активной сессии.'; return; }
        const name = ((el('gm-map-label').value || '').trim() || gmMapSel.name || 'Метка').slice(0, 60);
        const mark = Object.assign({ id: 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name, hold: gmMapSel.hold || gmMapHold || '', ts: Date.now() }, gmPosOf(gmMapSel));
        const tUids = gmTargetUids();
        if (tUids) mark.toUids = tUids;   // метка только для этих игроков (без поля — для всех)
        const next = gmMapMarks().concat([mark]);
        db.collection('sessions').doc(currentCode).update({ mapMarks: next }).then(() => {
            res.innerHTML = `<span style="color:#2ecc71;">📌 Метка «${escapeHtml(name)}» теперь видна ${tUids ? 'только: ' + escapeHtml(gmUidsText(tUids)) : 'игрокам'}.</span>`;
            gmMapSel = null; el('gm-map-label').value = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapRemoveMark = function (id) {
        if (!currentCode) return;
        const next = gmMapMarks().filter(m => m.id !== id);
        db.collection('sessions').doc(currentCode).update({ mapMarks: next }).then(() => {
            el('gm-map-result').textContent = 'Метка убрана у игроков.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmMapShowSel() {
        const b = el('gm-map-selected');
        if (!b) return;
        const p = gmMapParty();
        let t = p ? `Сейчас у игроков: <strong>${escapeHtml(p.name || 'своя точка')}</strong>${p.hold ? ' (' + escapeHtml(p.hold) + ')' : ''}. ` : 'Метка партии не стоит. ';
        t += gmMapSel ? `Выбрано: <strong>${escapeHtml(gmMapSel.name || 'точка на карте')}</strong>${gmMapSel.hold ? ' (' + escapeHtml(gmMapSel.hold) + ')' : ''}.` : 'Выбери город или точку на карте.';
        b.innerHTML = t;
    }
    window.gmMapPickSettle = function (v) {
        if (!v) return;
        const [h, n] = v.split('|'), c = window.HoldsMap.SETTLE[h] && window.HoldsMap.SETTLE[h][n];
        if (!c) return;
        const ovS = window.HoldsMap.settleOvOf(gmSettleOv(), h, n);   // назначенное мастером положение важнее условного
        gmMapSel = ovS ? gmSettleSel(h, n, ovS.x, ovS.y, ovS.u, ovS.v) : gmSettleSel(h, n, c[0], c[1]);
        const s = el('gm-map-settle'); if (s) s.value = '';
        gmMapShowSel(); window.renderGmMap(true);
    };
    window.gmMapPickHold = function (h) { gmMapHold = h || ''; gmMapSel = null; window.renderGmMap(true); };
    window.gmMapSetParty = function () {
        if (!gmMapSel) { el('gm-map-result').textContent = 'Сначала выбери город или точку на карте.'; return; }
        if (!currentCode) { el('gm-map-result').textContent = 'Нет активной сессии.'; return; }
        const pos = Object.assign({ hold: gmMapSel.hold || '', name: gmMapSel.name || '' }, gmPosOf(gmMapSel));
        const upd = { partyPos: pos };
        if (pos.hold) upd.currentHold = pos.hold;
        // туман войны: партия открывает карту вокруг себя (след остаётся)
        const f = gmFog();
        if (f.on && f.auto && gmFogAdd(f, { x: pos.x, y: pos.y, r: f.r, hold: pos.hold, u: pos.u, v: pos.v })) upd.mapFog = gmClean(f);
        db.collection('sessions').doc(currentCode).update(upd).then(() => {
            el('gm-map-result').innerHTML = `<span style="color:#2ecc71;">✅ Партия: ${escapeHtml(pos.name || 'точка на карте')}${pos.hold ? ' (' + escapeHtml(pos.hold) + ')' : ''}.</span>`;
            gmPostLogEntryText(`🗺️ Партия прибывает: ${pos.name || 'новое место'}${pos.hold ? ' (' + pos.hold + ')' : ''}.`);
            gmMapSel = null;
            if ((el('travel-encounter-on') || {}).checked) window.gmRollTravelEncounter();
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmMapClearParty = function () {
        if (!currentCode) return;
        db.collection('sessions').doc(currentCode).update({ partyPos: null }).then(() => {
            el('gm-map-result').textContent = 'Метка партии убрана.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Туман войны (панель мастера) ----------
    function gmFogShowInfo() {
        const b = el('gm-fog-info'), btn = el('gm-fog-toggle'), auto = el('gm-fog-auto');
        const f = gmFog();
        if (btn) btn.textContent = f.on ? '🌫 Туман войны: ВКЛ (нажми, чтобы выключить)' : '🌫 Туман войны: выкл (нажми, чтобы включить)';
        if (auto && document.activeElement !== auto) auto.checked = f.auto;
        if (b) b.innerHTML = f.on
            ? `Открыто: кругов — <b>${f.circles.length}</b>, владений целиком — <b>${f.holds.length}</b>${f.holds.length ? ' (' + f.holds.map(escapeHtml).join(', ') + ')' : ''}. Игроки видят карту только вокруг партии, открытых мест, меток и открытых областей; на твоей карте закрытое слегка затемнено.`
            : 'Выключен: игроки видят всю карту. Включи — и карта закроется туманом, а «Партия здесь» будет открывать окрестности.';
    }
    window.gmFogToggle = function () {
        const f = gmFog(); f.on = !f.on;
        if (f.on && !f.circles.length) { const p = gmMapParty(); if (p) gmFogAdd(f, { x: p.x, y: p.y, r: f.r, hold: p.hold, u: p.u, v: p.v }); }
        gmFogWrite(f, f.on ? '🌫 Туман войны включён.' : 'Туман войны выключен — игроки видят всю карту.');
    };
    window.gmFogSetAuto = function (v) { const f = gmFog(); f.auto = !!v; gmFogWrite(f); };
    window.gmFogRevealHere = function () {
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { el('gm-map-result').textContent = 'Сначала выбери точку на карте.'; return; }
        const f = gmFog(); f.on = true;
        const r = +(el('gm-fog-r') || {}).value || f.r;
        const added = gmFogAdd(f, { x: gmMapSel.x, y: gmMapSel.y, r, hold: gmMapSel.hold || gmMapHold, u: gmMapSel.u, v: gmMapSel.v });
        if (!added) { el('gm-map-result').textContent = f.circles.length >= GM_FOG_MAX ? 'Слишком много открытых кругов — открой владение целиком или сбрось туман.' : 'Эта область уже открыта.'; return; }
        gmFogWrite(f, '🔆 Область открыта.');
    };
    window.gmFogRevealHold = function (open) {
        const h = (gmMapSel && gmMapSel.hold) || gmMapHold;
        if (!h) { el('gm-map-result').textContent = 'Выбери владение (приблизь его или выбери точку в нём).'; return; }
        const f = gmFog(); f.on = true;
        f.holds = f.holds.filter(x => x !== h);
        if (open) f.holds.push(h);
        gmFogWrite(f, open ? `🔆 Владение «${escapeHtml(h)}» открыто целиком.` : `Владение «${escapeHtml(h)}» снова скрыто (открытые круги остаются).`);
    };
    window.gmFogReset = function () {
        if (!confirm('Закрыть всю карту туманом заново? Открытые области и владения будут забыты.')) return;
        const f = gmFog(); f.circles = []; f.holds = [];
        gmFogWrite(f, 'Туман сброшен: вся карта закрыта.');
    };

    // ---------- Маршруты и расстояния (панель мастера) ----------
    function gmCfgFill() {
        const c = gmCfg();
        [['gm-cfg-km', c.kmPerUnit], ['gm-cfg-foot', c.foot], ['gm-cfg-horse', c.horse], ['gm-cfg-cart', c.cart], ['gm-cfg-ship', c.ship]].forEach(([id, v]) => {
            const i = el(id); if (i && document.activeElement !== i) i.value = v;
        });
    }
    window.gmCfgSave = function () {
        if (!currentCode) return;
        const g = id => parseFloat((el(id) || {}).value);
        const cfg = { kmPerUnit: g('gm-cfg-km'), foot: g('gm-cfg-foot'), horse: g('gm-cfg-horse'), cart: g('gm-cfg-cart'), ship: g('gm-cfg-ship') };
        Object.keys(cfg).forEach(k => { if (!(cfg[k] > 0)) delete cfg[k]; });
        db.collection('sessions').doc(currentCode).update({ mapCfg: cfg }).then(() => {
            el('gm-map-result').innerHTML = '<span style="color:#2ecc71;">Масштаб и скорости сохранены.</span>';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function gmRouteText(r) {
        const legs = r.legs.filter(l => l.km > 0.5).map(l => `${escapeHtml(l.from || 'точка')} → ${escapeHtml(l.to || 'точка')} <span style="opacity:.7;">(${l.type === 'road' ? 'дорога' : l.type === 'sea' ? 'море' : 'бездорожье'}, ${Math.round(l.km)} км)</span>`);
        return `<div>${escapeHtml(window.HoldsMap.describeRoute(r))}</div>${legs.length ? '<div style="font-size:12px; opacity:.85; margin-top:3px;">' + legs.join('<br>') + '</div>' : ''}`;
    }
    window.gmRoutePlan = function () {
        const out = el('gm-route-info'), party = gmMapParty();
        if (!party) { out.textContent = 'Сначала поставь метку партии («📍 Партия здесь»).'; return; }
        if (!gmMapSel || typeof gmMapSel.x !== 'number') { out.textContent = 'Выбери на карте город или точку назначения.'; return; }
        const nm = n => (n && window.HoldsMap.NODES[n]) ? n : '';
        const r = window.HoldsMap.planRoute(Object.assign({ name: nm(party.name) }, party), Object.assign({ name: nm(gmMapSel.name) }, gmMapSel), lastData && lastData.mapCfg, gmSettleOv());
        gmRoute = { pts: r.pts, r, from: party.name || 'партия', to: gmMapSel.name || 'выбранная точка' };
        out.innerHTML = `<b>${escapeHtml(gmRoute.from)} → ${escapeHtml(gmRoute.to)}</b>` + gmRouteText(r);
        window.renderGmMap(true);
    };
    window.gmRoutePublish = function () {
        if (!gmRoute) { el('gm-route-info').textContent = 'Сначала проложи маршрут.'; return; }
        if (!currentCode) return;
        const r = gmRoute.r;
        const tr = gmClean({ ts: Date.now(), from: gmRoute.from, to: gmRoute.to, km: Math.round(r.km), direct: Math.round(r.direct), kmRoad: Math.round(r.kmRoad), kmOff: Math.round(r.kmOff), kmSea: Math.round(r.kmSea),
            days: { foot: +r.days.foot.toFixed(2), horse: +r.days.horse.toFixed(2), cart: +r.days.cart.toFixed(2) },
            pts: r.pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), name: p.name || undefined, hold: p.hold || undefined, u: p.u, v: p.v })) });
        db.collection('sessions').doc(currentCode).update({ travelRoute: tr }).then(() => {
            el('gm-route-info').innerHTML += '<div style="color:#2ecc71; margin-top:4px;">📣 Маршрут показан игрокам.</div>';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    window.gmRouteClear = function () {
        gmRoute = null; el('gm-route-info').textContent = 'Маршрут убран.';
        if (currentCode && lastData && lastData.travelRoute) db.collection('sessions').doc(currentCode).update({ travelRoute: null }).catch(e => alert('Ошибка: ' + e.message));
        window.renderGmMap(true);
    };
    // открывает туман кругами вдоль проложенного маршрута
    window.gmRouteReveal = function () {
        if (!gmRoute) { el('gm-route-info').textContent = 'Сначала проложи маршрут.'; return; }
        const f = gmFog(); f.on = true;
        const step = Math.max(10, f.r * 1.1); let added = 0;
        for (let i = 0; i + 1 < gmRoute.pts.length; i++) {
            const a = gmRoute.pts[i], b = gmRoute.pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(d / step));
            for (let k = 0; k <= n; k++) {
                const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
                const hk = window.HoldsMap.holdAt(x, y) || undefined;
                if (gmFogAdd(f, { x, y, r: f.r, hold: hk })) added++;
            }
        }
        gmFogWrite(f, `🔆 Открыто вдоль маршрута: ${added} областей.`);
    };

    window.setSessionTimeWeather = function () {
        const region = el('weather-region-select').value;
        const season = el('weather-season-select').value;
        const hold = el('weather-hold-select').value;
        const period = el('weather-time-select').value;
        const weatherKey = pendingWeatherKey || 'clear';
        db.collection('sessions').doc(currentCode).update({
            currentRegion: region, currentHold: hold, timePeriod: period, currentWeather: weatherKey
        }).then(() => {
            el('weather-gm-result').innerHTML = `<span style="color:#2ecc71;">✅ Применено: ${period}, ${region}${hold ? ' (' + hold + ')' : ''}, ${WEATHER_LABELS[weatherKey]}.</span>`;
            gmPostLogEntryText(`🌤️ ${period}, ${region}${hold ? ' (' + hold + ')' : ''}: ${WEATHER_LABELS[weatherKey]}.`);
            pendingWeatherKey = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Задача F: праздник вручную ----------
    function renderHolidaySelect() {
        const sel = el('holiday-manual-select');
        if (!sel || sel.options.length || !window.holidaysData) return;
        sel.innerHTML = window.holidaysData.map((h, i) => `<option value="${i}">${escapeHtml(h.title)}${h.discount ? ' (скидка до ' + h.discount + '%)' : ''}</option>`).join('');
    }

    window.launchHolidayManually = function () {
        const idx = parseInt(el('holiday-manual-select').value);
        const h = window.holidaysData[idx];
        if (!h) return;
        db.collection('sessions').doc(currentCode).update({ activeHoliday: { title: h.title, discount: h.discount || null, discountOnly: h.discountOnly || null } }).then(() => {
            el('holiday-gm-result').innerHTML = `<span style="color:#2ecc71;">✅ Запущено: «${escapeHtml(h.title)}»${h.discount ? ' (скидка до ' + h.discount + '%)' : ''}.</span>`;
            gmPostLogEntryText(`🎉 Мастер запускает праздник: «${h.title}»!`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.clearActiveHoliday = function () {
        db.collection('sessions').doc(currentCode).update({ activeHoliday: null }).then(() => {
            el('holiday-gm-result').innerHTML = 'Праздник остановлен.';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Задача I: групповые проверки ----------

    function renderGroupCheckSkillSelect() {
        const sel = el('group-check-skill-select');
        if (!sel || sel.options.length) return;
        sel.innerHTML = SKILL_NAMES_BY_IDX.map((name, i) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }

    window.requestGroupCheck = function () {
        const skill = el('group-check-skill-select').value;
        const dc = parseInt(el('group-check-dc').value) || null;
        db.collection('sessions').doc(currentCode).update({
            groupCheck: { skill, dc, requestedAt: Date.now(), results: {} }
        }).then(() => {
            gmPostLogEntryText(`📣 Мастер просит групповой бросок: «${skill}»${dc ? ' (порог ' + dc + ')' : ''}!`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function renderGroupCheckResults() {
        const el2 = el('group-check-results');
        if (!el2) return;
        const gc = lastData.groupCheck;
        if (!gc) { el2.innerHTML = '<p style="opacity:.6; font-size:13px;">Запросов не было.</p>'; return; }
        const results = gc.results || {};
        const uids = Object.keys(lastData.participants || {});
        el2.innerHTML = `<strong>«${escapeHtml(gc.skill)}»${gc.dc ? ' (порог ' + gc.dc + ')' : ''}:</strong><br>` +
            uids.map(uid => {
                const pname = (lastData.participants[uid] || {}).name || uid;
                const r = results[uid];
                if (!r) return `<div>⏳ ${escapeHtml(pname)}: ждём бросок...</div>`;
                const passed = gc.dc ? (r.total >= gc.dc ? '✅' : '❌') : '🎲';
                return `<div>${passed} ${escapeHtml(pname)}: ${r.total} (к20 ${r.roll}${r.mod >= 0 ? '+' : ''}${r.mod})</div>`;
            }).join('');
    }

    // ---------- Задача I.2: кооперативная атака ----------

    function populateCoopSelects() {
        const uids = Object.keys(lastData.participants || {});
        ['coop-player1-select', 'coop-player2-select'].forEach(id => {
            const sel = el(id);
            if (!sel) return;
            const prev = sel.value;
            sel.innerHTML = '<option value="">— выбери —</option>' + uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
            if (uids.includes(prev)) sel.value = prev;
        });
        const targetSel = el('coop-target-select');
        if (targetSel) {
            const alive = (lastData.enemies || []).filter(e => (e.curHp || 0) > 0);
            const prev = targetSel.value;
            targetSel.innerHTML = alive.length
                ? alive.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (HP ${e.curHp}/${e.maxHp})</option>`).join('')
                : '<option value="">Нет живых целей</option>';
            if (alive.some(e => e.id === prev)) targetSel.value = prev;
        }
    }

    window.rollCoopAttack = function () {
        const p1 = el('coop-player1-select').value;
        const p2 = el('coop-player2-select').value;
        const targetId = el('coop-target-select').value;
        const resultEl = el('coop-attack-result');
        if (!p1 || !p2 || p1 === p2) { alert('Выбери двух РАЗНЫХ игроков.'); return; }
        if (!targetId) { alert('Выбери цель.'); return; }
        Promise.all([
            db.collection('characters').doc(p1).get(),
            db.collection('characters').doc(p2).get()
        ]).then(([d1, d2]) => {
            const target = (lastData.enemies || []).find(e => e.id === targetId);
            if (!target) { alert('Цель уже не найдена.'); return; }
            // Каждый бьёт тем, что у него в руках: лук/арбалет — урон дальнего оружия и ЛОВ, иначе ближнее и СИЛ.
            const side = (data, uid) => {
                const ranged = data.activeWep === 'ranged' && (parseInt(data.wepRDmg) || 0) > 0;
                const es = data.effectiveStats && !Array.isArray(data.effectiveStats) ? data.effectiveStats : {};
                const stat = parseInt(ranged ? es.dex : es.str) || 10;
                // Итоговый урон с листа игрока (Сила/Ловкость, перки, чары); база оружия — только для старых листов без этого поля.
                const full = data.coopDmg && typeof data.coopDmg === 'object' ? parseInt(ranged ? data.coopDmg.ranged : data.coopDmg.melee) : NaN;
                return { uid, name: (lastData.participants[uid] || {}).name || uid, ranged, dmg: !isNaN(full) && full > 0 ? full : (parseInt(ranged ? data.wepRDmg : data.wepMDmg) || 0), mod: calcAbilityMod(stat) };
            };
            const a = side(d1.exists ? d1.data() : {}, p1), b = side(d2.exists ? d2.data() : {}, p2);
            // Встречный бросок, как у обычной атаки: к20 + лучший модификатор из двух против голого к20 цели; ничья — перекид.
            const mod = Math.max(a.mod, b.mod);
            let roll, total, enemyRoll, rerolls = 0;
            do { roll = Math.floor(Math.random() * 20) + 1; total = roll + mod; enemyRoll = Math.floor(Math.random() * 20) + 1; if (total !== enemyRoll) break; rerolls++; } while (rerolls < 20);
            const hit = total > enemyRoll;
            // Резисты цели — по каждому удару отдельно (физический урон), как при обычной атаке игрока.
            const pv = x => window.StCombat && window.StCombat.previewDamage ? window.StCombat.previewDamage(target, x.dmg, 'physical', 0) : { finalDmg: x.dmg, resist: 0 };
            const fa = pv(a), fb = pv(b);
            const totalDmg = hit ? fa.finalDmg + fb.finalDmg : 0;
            const killer = (fa.finalDmg >= fb.finalDmg ? a : b).uid;
            pendingCoopAttack = { targetId, dmg: totalDmg, hit, name1: a.name, name2: b.name, targetName: target.name, killer };
            const part = (x, f) => `${escapeHtml(x.name)}: ${x.ranged ? 'дальнее' : 'ближнее'} ${x.dmg}${f.resist ? ` → ${f.finalDmg} (резист ${f.resist}%)` : ''}`;
            resultEl.innerHTML = `<strong>${escapeHtml(a.name)} + ${escapeHtml(b.name)}</strong> атакуют «${escapeHtml(target.name)}» одновременно.<br>` +
                `Бросок: 1d20 (${roll}) ${mod >= 0 ? '+' : ''}${mod} = <strong>${total}</strong> vs цель 1d20 = <strong>${enemyRoll}</strong>${rerolls ? ` (перекид ×${rerolls})` : ''} — ${hit ? '<strong style="color:#2ecc71;">ПОПАДАНИЕ</strong>' : '<strong style="color:#7a7a7a;">ПРОМАХ</strong>'}<br>` +
                (hit ? `Урон: <span style="color:#e74c3c; font-weight:bold;">${totalDmg}</span> (${part(a, fa)}; ${part(b, fb)})<br>` : '') +
                `<button class="btn-success" style="width:100%; margin-top:6px;" onclick="applyCoopAttackDamage()">✅ ${hit ? 'Применить урон' : 'Записать промах'}</button>`;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    let pendingCoopAttack = null;

    window.applyCoopAttackDamage = function () {
        if (!pendingCoopAttack) return;
        const { targetId, dmg, hit, name1, name2, targetName, killer } = pendingCoopAttack;
        if (!hit) {
            gmPostLogEntryText(`⚔️ ${name1} + ${name2} совместно атакуют «${targetName}» — промах.`);
            el('coop-attack-result').innerHTML = ''; pendingCoopAttack = null; return;
        }
        // Мастер сам пишет в сессию напрямую через свой db — моста к cloud.js не нужно
        // (gm.html вообще его не подключает).
        const enemies = (lastData.enemies || []).slice();
        const idx = enemies.findIndex(e => e.id === targetId);
        if (idx === -1) { alert('Цель уже не найдена.'); return; }
        const newHp = Math.max(0, (enemies[idx].curHp || 0) - dmg);
        // Кто ранил/добил — для добычи с трупа (gmCorpseKiller): игрок с бóльшим уроном в этом ударе.
        const upd = { curHp: newHp, lastHitBy: killer };
        if (newHp <= 0 && (enemies[idx].curHp || 0) > 0) { upd.killedBy = killer; upd.diedAtTurn = (lastData && lastData.sessionTurnCounter) || 0; }
        enemies[idx] = Object.assign({}, enemies[idx], upd);
        gmUpdateEnemies(enemies).then(() => {
            gmPostLogEntryText(`⚔️ ${name1} + ${name2} совместно бьют «${targetName}»: −${dmg} урона${newHp <= 0 ? ' — повержен(а)' : ''}.`);
            el('coop-attack-result').innerHTML = '';
            pendingCoopAttack = null;
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Шторки для всех панелей мастера (gm.html стал очень длинным) ----------
    // Тот же механизм, что и у игрока (initSectionAccordions в index.html), но без привязки к
    // вкладкам — тут одна длинная страница, просто берём все .panel целиком.
    // По жалобе "сайт визуально перегружен" — панелей у мастера накопилось уже больше 20, и все
    // раньше открывались развёрнутыми по умолчанию при каждой загрузке страницы. Теперь свёрнуты
    // все, КРОМЕ самых нужных в бою постоянно (Отряд/Противники) — остальные открываются по клику.
    const GM_PANELS_OPEN_BY_DEFAULT = ['Отряд', 'Противники'];
    function initGmSectionAccordions() {
        let counter = 0;
        document.querySelectorAll('.panel').forEach(panel => {
            if (panel.dataset.secId) return; // уже обработана — не оборачиваем повторно
            const h2 = panel.querySelector(':scope > h2');
            if (!h2) return;
            const panelId = 'gm-sec-' + (counter++);
            panel.dataset.secId = panelId;

            const body = document.createElement('div');
            body.className = 'section-body';
            body.id = panelId + '-body';

            const kids = Array.from(panel.children);
            let afterH2 = false;
            kids.forEach(ch => {
                if (ch === h2) { afterH2 = true; return; }
                if (afterH2) body.appendChild(ch);
            });
            panel.appendChild(body);

            const titleText = h2.textContent.trim();
            const keepOpen = GM_PANELS_OPEN_BY_DEFAULT.some(t => titleText.includes(t));
            if (!keepOpen) body.style.display = 'none';

            h2.classList.add('section-header');
            h2.innerHTML = `<span class="section-title">${h2.innerHTML}</span><span class="section-chevron">${keepOpen ? '▾' : '▸'}</span>`;
            h2.addEventListener('click', () => toggleGmSectionById(panelId));
        });
    }

    window.toggleGmSectionById = function (panelId) {
        const panel = document.querySelector(`[data-sec-id="${panelId}"]`);
        if (!panel) return;
        const body = document.getElementById(panelId + '-body');
        const chev = panel.querySelector('.section-chevron');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (chev) chev.textContent = isOpen ? '▸' : '▾';
        // Открыли панель «Шёпот» — входящие считаются прочитанными, бейдж инбокса надо пересчитать сразу.
        try { gmRenderInbox(); } catch (e) { }
    };
