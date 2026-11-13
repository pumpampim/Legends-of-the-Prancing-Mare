
    // ---------- Отряд ----------

    // Задача "нет хелбаров, сгруппируй" — раньше каждый игрок занимал целый блок с двумя большими
    // цифровыми полями. Теперь компактная карточка с настоящими полосками (те же CSS-классы
    // .bar-track/.bar-fill-hp/.bar-fill-mp, что у игрока на его листе — style.css общий файл).
    function renderParty(participants) {
        const target = el('gm-party-list');
        const uids = Object.keys(participants);
        if (!uids.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Пока никто не присоединился.</p>'; return; }
        target.innerHTML = uids.map(uid => {
            const p = participants[uid] || {};
            const maxHp = p.maxHp || 1, maxMp = p.maxMp || 1;
            const hpPct = Math.max(0, Math.min(100, (p.curHp || 0) / maxHp * 100));
            const mpPct = Math.max(0, Math.min(100, (p.curMp || 0) / maxMp * 100));
            return `<div style="border:1px solid var(--border-color); border-radius:4px; padding:5px 8px; margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:bold;">
                    <span>${p.portraitThumb ? `<img src="${escapeHtml(p.portraitThumb)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;">` : ''}${p.fallen ? '⚰️ ' : ''}${escapeHtml(p.name || '?')} <span style="font-weight:normal; font-size:11px; opacity:.8;" title="Свободные жизни">❤ ${p.lives === undefined ? '?' : p.lives}</span></span>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:normal; margin:0;" title="Вне города игрок не может закупаться у торговцев">
                        <input type="checkbox" ${p.inTown === false ? '' : 'checked'} onchange="setParticipantTown('${uid}', this.checked)"> 🏙 В городе
                    </label>
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                    <span style="font-size:11px; color:#e74c3c; width:24px;">HP</span>
                    <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${hpPct}%;"></div></div>
                    <input type="number" value="${p.curHp || 0}" style="width:50px; padding:1px; font-size:12px;" onchange="setParticipantField('${uid}','curHp',this.value)">
                    <span style="font-size:11px; opacity:.6; width:34px;">/${maxHp}</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                    <span style="font-size:11px; color:#3498db; width:24px;">MP</span>
                    <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-mp" style="width:${mpPct}%;"></div></div>
                    <input type="number" value="${p.curMp || 0}" style="width:50px; padding:1px; font-size:12px;" onchange="setParticipantField('${uid}','curMp',this.value)">
                    <span style="font-size:11px; opacity:.6; width:34px;">/${maxMp}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:4px;">
                    ${p.fallen ? '<span style="font-size:11px; color:#e74c3c; font-weight:bold; width:100%;">⚰️ ПАЛ' + ((p.lives || 0) <= 0 ? ' — жизней нет, нужен квест божества' : '') + '</span>' : ''}
                    <button style="font-size:11px; padding:1px 5px;" title="Игрок теряет 1–4 случайные стопки ненадетых вещей" onclick="gmDeathCmd('${uid}','loseItems')">🎒 Потеря вещей</button>
                    <button style="font-size:11px; padding:1px 5px;" title="Воскресить (после квеста божества или по решению мастера)" onclick="gmDeathCmd('${uid}','revive')">✨ Воскресить</button>
                    <button style="font-size:11px; padding:1px 5px;" onclick="gmDeathCmd('${uid}','addLives',1)">+❤</button>
                    <button style="font-size:11px; padding:1px 5px;" onclick="gmDeathCmd('${uid}','addLives',-1)">−❤</button>
                    <button style="font-size:11px; padding:1px 5px;" title="Бумажный лист героя A4 с текущими цифрами — выдать игроку без компьютера" onclick="gmPrintSheet('${uid}')">🖨 Лист</button>
                    <button class="btn-danger" style="font-size:11px; padding:1px 5px; margin-left:auto;" title="Выгнать игрока из этой сессии (персонаж не удаляется)" onclick="gmKickPlayer('${uid}')">🚪 Выгнать</button>
                </div>
                ${(p.summons || []).map(s => {
                    const sHpPct = Math.max(0, Math.min(100, (s.curHp || 0) / (s.maxHp || 1) * 100));
                    return `<div style="display:flex; align-items:center; gap:4px; margin-top:4px; padding-left:8px; border-left:2px solid var(--border-color);">
                        <span style="font-size:11px; opacity:.75; white-space:nowrap;">👻 ${escapeHtml(s.name)}</span>
                        <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${sHpPct}%;"></div></div>
                        <span style="font-size:11px; opacity:.6; white-space:nowrap;">${s.curHp || 0}/${s.maxHp || 0}</span>
                    </div>`;
                }).join('')}
                ${(p.pets || []).map(pt => {
                    const ptPct = Math.max(0, Math.min(100, (pt.hp || 0) / (pt.maxHp || 1) * 100));
                    return `<div style="display:flex; align-items:center; gap:4px; margin-top:4px; padding-left:8px; border-left:2px solid var(--border-color);">
                        <span style="font-size:11px; opacity:.75; white-space:nowrap;">${escapeHtml(pt.icon || '🐾')} ${escapeHtml(pt.name)}</span>
                        <div class="bar-track" style="flex:1; margin-bottom:0;"><div class="bar-fill-hp" style="width:${ptPct}%;"></div></div>
                        <span style="font-size:11px; opacity:.6; white-space:nowrap;">${pt.hp || 0}/${pt.maxHp || 0}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');
    }

    // Кик из сессии. Игрок уходит из participants и попадает в kicked: его лист видит это и выходит из сессии,
    // а правила Firestore больше не дают ему писать в документ сессии (и вернуться по коду), пока мастер не вернёт.
    // Персонаж (characters/{uid}) не трогаем — кик действует только на эту сессию.
    function gmDropKickedParticipants(d) {
        const kicked = (d && d.kicked) || {}, parts = (d && d.participants) || {};
        // Запоздавшая запись старой вкладки или очередь команд мастера могла заново создать запись игрока — не показываем её.
        Object.keys(kicked).forEach(uid => { delete parts[uid]; });
    }

    // Печать заполненного листа героя (sheet-print.js). Вкладку открываем сразу по клику, иначе браузер заблокирует всплывающее окно после чтения из облака.
    window.gmPrintSheet = function (uid) {
        if (!window.StSheetPrint) { alert('Модуль печати листа не загрузился — обновите страницу.'); return; }
        const w = window.StSheetPrint.openPending();
        if (!w) return;
        db.collection('characters').doc(uid).get().then(doc => {
            if (!doc.exists) { try { w.close(); } catch (e) { } alert('Лист этого игрока не найден в облаке.'); return; }
            window.StSheetPrint.open(doc.data(), w);
        }).catch(e => { try { w.close(); } catch (er) { } alert('Не удалось прочитать лист: ' + e.message); });
    };

    window.gmKickPlayer = function (uid) {
        const p = ((lastData && lastData.participants) || {})[uid];
        if (!p || !currentCode) return;
        const name = p.name || 'Без имени';
        if (!confirm('Выгнать «' + name + '» из сессии ' + currentCode + '?\n\nИгрок сразу выйдет из сессии и не сможет зайти по коду, пока ты его не вернёшь. Персонаж и его вещи останутся у игрока.')) return;
        const names = [name].concat(p.summonNames || []);
        const patch = {};
        patch['participants.' + uid] = firebase.firestore.FieldValue.delete();
        patch['kicked.' + uid] = { name: name, ts: Date.now() };
        // Из очереди ходов убираем самого игрока и его существ (в ней записи по именам).
        const order = lastData.turnOrder || [];
        const left = order.filter(i => !names.includes(i.name));
        if (left.length !== order.length) patch.turnOrder = left;
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '🚪 ' + name + ' покидает сессию по решению мастера.' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Не удалось выгнать игрока: ' + e.message));
    };

    window.gmUnkickPlayer = function (uid) {
        const k = ((lastData && lastData.kicked) || {})[uid];
        if (!k || !currentCode) return;
        if (!confirm('Разрешить «' + (k.name || 'игроку') + '» снова войти в сессию по коду?')) return;
        db.collection('sessions').doc(currentCode).update({ ['kicked.' + uid]: firebase.firestore.FieldValue.delete() })
            .catch(e => alert('Ошибка: ' + e.message));
    };

    function renderKickedList(kicked) {
        const box = el('gm-kicked-list');
        if (!box) return;
        const uids = Object.keys(kicked || {});
        box.innerHTML = !uids.length ? '' : '<div style="font-size:12px; opacity:.85; margin-top:6px;">🚪 Выгнаны из сессии: ' +
            uids.map(uid => `<span style="white-space:nowrap; margin-right:8px;">${escapeHtml(kicked[uid].name || '?')} <button style="width:auto; font-size:11px; padding:0 6px;" title="Снова пустить по коду" onclick="gmUnkickPlayer('${uid}')">вернуть</button></span>`).join('') + '</div>';
    }

    // Команды смерти/воскрешения игроку: уходят через очередь pendingStatusEffects, игрок применяет их у себя.
    window.gmDeathCmd = function (uid, action, n) {
        const p = ((lastData && lastData.participants) || {})[uid] || {};
        const label = { loseItems: 'потеря части вещей', revive: 'воскрешение', addLives: 'жизни ' + (n > 0 ? '+' : '') + n, fall: 'пал' }[action] || action;
        if (action === 'loseItems' && !confirm('Игрок «' + (p.name || '?') + '» потеряет 1–4 случайные стопки ненадетых вещей. Продолжить?')) return;
        const cmd = { id: 'death-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'death', action: action, fromGm: true };
        if (n !== undefined) cmd.n = n;
        const patch = {};
        if (action === 'revive') {
            // Воскрешение мастер записывает сам — в лист персонажа (ХП, «пал») и в сессию. Раньше уходила только команда
            // игроку: если его лист закрыт или не успел её прочитать, персонаж так и оставался павшим у всех.
            const maxHp = parseInt(p.maxHp) || 0;
            const hpNow = parseInt(p.curHp) || 0;
            const hp = Math.max(hpNow, 1, Math.ceil((maxHp || 1) * 0.5)); // как у игрока: половина максимума (WAKE_HP_FRACTION)
            cmd.hp = hp;
            patch['participants.' + uid + '.curHp'] = hp;
            patch['participants.' + uid + '.fallen'] = false;
            updateCharacterVitals(uid, v => { const mx = parseInt(v[2]) || maxHp || 1; v[0] = Math.max(parseInt(v[0]) || 0, 1, Math.ceil(mx * 0.5)); },
                { 'deathState.fallen': false, 'deathState.minimized': false })
                .catch(e => console.error('Ошибка записи воскрешения в лист персонажа:', e));
        }
        patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd);
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '⚰️ ' + (p.name || '?') + ': ' + label + '.' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    window.gmPartyFell = function () {
        const parts = (lastData && lastData.participants) || {};
        const uids = Object.keys(parts);
        if (!uids.length) return;
        if (!confirm('Вся партия падает (0 ХП) и приходит в себя через несколько дней. Каждый игрок увидит экран «Персонаж пал». Продолжить?')) return;
        const patch = {};
        uids.forEach(uid => {
            patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'death-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'death', action: 'fall', fromGm: true });
        });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: '☠ Вся партия пала. Очнуться можно через несколько дней — без части вещей.' });
        db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    };

    window.setParticipantTown = function (uid, flag) {
        const patch = {};
        patch['participants.' + uid + '.inTown'] = !!flag;
        db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));
    };

    window.setParticipantField = function (uid, field, value) {
        const patch = {};
        patch['participants.' + uid + '.' + field] = Number(value) || 0;
        db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));

        // Раньше правка ХП/МП мастером через панель "Отряд" писала ТОЛЬКО сюда, в сессию — сам
        // документ персонажа (characters/{uid}.vitals) оставался нетронутым. Из-за этого лист
        // игрока ничего не знал об изменении, и при следующем же автосохранении (срабатывает
        // почти на любое его действие) молча перезаписывал сессию обратно СВОИМ старым значением
        // ХП — правка мастера "слетала" через пару ходов. Теперь пишем и туда: читаем текущий
        // vitals, меняем нужный индекс, сохраняем массив целиком (Firestore не даёт точечно
        // менять один элемент массива через dot-notation).
        if (field === 'curHp' || field === 'curMp') {
            const vitalsIdx = field === 'curHp' ? 0 : 1;
            const newVal = Number(value) || 0;
            updateCharacterVitals(uid, v => { v[vitalsIdx] = newVal; })
                .catch(e => console.error('Ошибка синхронизации ХП/МП с персонажем:', e));
        }
    };

    // Кэш по имени — enemyAvatarData чистая (одно и то же имя всегда даёт один и тот же SVG),
    // поэтому кэшировать безопасно: не может устареть, инвалидация не нужна вообще. Раньше
    // пересчитывалась на КАЖДОГО врага при КАЖДОМ рендере списка боя (а это на каждый snapshot
    // сессии, не только при реальных изменениях) — строка хэша+regex+сборка SVG+encodeURIComponent
    // на ~1000-символьную строку, не бесплатно при большом бое.
    const _avatarCache = new Map();
    function enemyAvatarData(enemy) {
        const name = String(enemy && enemy.name || '?');
        if (_avatarCache.has(name)) return _avatarCache.get(name);
        // Рисованный аватар (art-data.js, img/enemies/*.webp); нет такого врага в списке — SVG-лицо, как раньше.
        const art = window.enemyArtUrl ? window.enemyArtUrl(name) : '';
        if (art) { _avatarCache.set(name, art); return art; }
        let hash = 0; for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        const kind = /волк|саблезуб|медвед|мамонт|краб|рыба|злокрыс|паук|корус/i.test(name) ? 'beast' :
                     /скелет|драугр|нежить|привед/i.test(name) ? 'undead' :
                     /тролль|великан/i.test(name) ? 'troll' :
                     /сприган/i.test(name) ? 'spriggan' :
                     /ворожея/i.test(name) ? 'witch' : 'humanoid';
        const hue = Math.abs(hash) % 360;
        const skin = kind === 'undead' ? '#b8b7a3' : kind === 'troll' ? '#6e7e57' : kind === 'spriggan' ? '#66815d' : `hsl(${hue},28%,58%)`;
        const dark = kind === 'undead' ? '#3d4039' : kind === 'troll' ? '#263322' : '#201c19';
        const hair = `hsl(${(hue+35)%360},22%,20%)`;
        let features='';
        if(kind==='beast') features='<path d="M27 42 L13 25 L30 30 M73 42 L87 25 L70 30" fill="'+dark+'" stroke="#17130f" stroke-width="3"/><path d="M39 58 Q50 65 61 58" fill="none" stroke="#2b211b" stroke-width="3"/><ellipse cx="50" cy="66" rx="11" ry="7" fill="#38271e"/>';
        else if(kind==='undead') features='<path d="M25 36 Q30 17 50 18 Q70 17 75 36 L69 30 Q50 24 31 30Z" fill="#5a5b53"/><path d="M39 57 L46 61 L50 57 L54 61 L61 57" fill="none" stroke="#4a4b45" stroke-width="2"/>';
        else if(kind==='troll') features='<path d="M27 36 Q18 22 34 25 L42 35 M73 36 Q82 22 66 25 L58 35" fill="'+skin+'" stroke="#263322" stroke-width="3"/><path d="M35 67 L42 60 L50 69 L58 60 L65 67" fill="#e1d7c5" stroke="#493f32" stroke-width="2"/>';
        else if(kind==='spriggan') features='<path d="M30 36 Q20 18 38 22 M70 36 Q80 18 62 22" fill="none" stroke="#314b2f" stroke-width="7"/><path d="M37 72 Q50 79 63 72" fill="none" stroke="#355333" stroke-width="5"/>';
        else if(kind==='witch') features='<path d="M27 31 Q50 4 73 31 L67 28 Q50 18 33 28Z" fill="#332c2a"/><path d="M42 58 Q50 63 58 58" fill="none" stroke="#4d2d27" stroke-width="3"/>';
        else features='<path d="M29 38 Q31 15 50 13 Q69 15 71 38 L65 28 Q50 22 35 28Z" fill="'+hair+'"/><path d="M42 63 Q50 68 58 63" fill="none" stroke="#3a2822" stroke-width="3"/>';
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="bg"><stop stop-color="#6f6045"/><stop offset="1" stop-color="#17130e"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="52" r="32" fill="${skin}" stroke="#c5a568" stroke-width="2"/>${features}<ellipse cx="39" cy="48" rx="4" ry="5" fill="#16130f"/><ellipse cx="61" cy="48" rx="4" ry="5" fill="#16130f"/><path d="M46 55 Q50 58 54 55" fill="none" stroke="#3a2922" stroke-width="2"/><path d="M23 92 Q50 72 77 92" fill="${dark}"/></svg>`;
        const result = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
        _avatarCache.set(name, result);
        return result;
    }

    // ---------- Противники ----------

    // Что враг держит в руках (для заклинаний): free — руки свободны, one — одно одноручное (или только щит),
    // two — двуручное/лук/арбалет, both — два оружия или оружие со щитом. Колдовать можно только с free/one.
    // Пока мастер не выбрал вручную — угадываем по оружию из базы.
    const GM_HANDS_LABEL = { free: '✋ руки свободны', one: '🗡 одно одноручное / щит', two: '🏹 двуручное / лук', both: '⚔ два оружия / оружие+щит' };
    function gmEnemyHands(e) {
        if (e && GM_HANDS_LABEL[e.hands]) return e.hands;
        if (!e || !e.weaponDmg) return 'free';
        const t = String(e.weaponNote || '') + ' ' + (e.name || '');
        if (e.isRanged || /двуруч|секир|молот|лук|арбалет|посох|пик[аи]|копь/i.test(t)) return 'two';
        if (/щит/i.test(t)) return 'both';
        return 'one';
    }
    window.gmEnemyHands = gmEnemyHands;
    window.gmSetEnemyHands = function (id, v) {
        const en = (lastData.enemies || []).find(x => x.id === id);
        window.setEnemyField(id, 'hands', v);
        if (en) gmPostLogEntryText(`✋ ${en.name}: в руках — ${(GM_HANDS_LABEL[v] || v).replace(/^\S+\s/, '')} (смена оружия — действие хода).`);
    };
    function renderEnemies(enemies) {
        const target = el('gm-enemies-list');
        gmCheckMarked(enemies);
        renderEnemyGrid(enemies);
        try { gmRenderDifficulty(); } catch (e) { console.error(e); }
        if (!enemies.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Противников нет.</p>'; gmBulkCount(); return; }
        target.innerHTML = enemies.map(e => {
            const resistEntries = e.resist ? Object.entries(e.resist).filter(([k, v]) => v) : [];
            const resistLine = resistEntries.length
                ? '<div style="font-size:12px; opacity:.75;">Резист: ' + resistEntries.map(([k, v]) => escapeHtml(k) + ' ' + v + '%').join(', ') + '</div>' : '';
            // Характеристики бандита (Задача "телосложение/сила/ловкость") — только у тех, у кого
            // есть (сгенерированы генератором бандитов), остальные враги из базы их не имеют.
            const statsLine = (e.str || e.dex)
                ? `<div style="font-size:11px; opacity:.65;">СИЛ ${e.str || '—'} · ЛОВ ${e.dex || '—'} · ТЕЛ ${e.con || '—'}</div>`
                : (e.int || e.wis) ? `<div style="font-size:11px; opacity:.65;">ИНТ ${e.int || '—'} · ДУХ ${e.wis || '—'} · ТЕЛ ${e.con || '—'}</div>` : '';
            // Статус-эффекты (Страх/Успокоение/Ярость/Полиморф и т.п.) — раньше эти заклинания были
            // чистым текстом, теперь реально накладываются сюда. Тикаются вручную (кнопка "Снять") —
            // не завязано на автоматический счётчик ходов, чтобы не требовать точной синхронизации
            // между листом игрока и сессией.
            const statusLine = (e.statusEffects && e.statusEffects.length)
                ? e.statusEffects.map((s, si) => `<div style="font-size:12px; color:#c9986c; margin-top:2px; display:flex; align-items:center; gap:4px;">🌀 <strong>${escapeHtml(s.name)}</strong>${s.turns ? ` (${s.turns} х.)` : ''} — ${escapeHtml(s.desc || '')} <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:11px;" onclick="removeEnemyStatus('${e.id}','${s.id}')">Снять</button></div>`).join('')
                : '';
            // Урон оружием — теперь редактируемое поле, не просто текст. Раньше поправить урон
            // можно было только удалив и заново добавив противника с нуля.
            const dmgLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">Урон оружием: ' +
                '<input type="number" value="' + (e.weaponDmg || 0) + '" style="width:56px; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'weaponDmg\',this.value)">' +
                (e.weaponNote ? ' (' + escapeHtml(e.weaponNote) + ')' : '') + '</div>' +
                (e.ammo ? '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px;">🏹 ' + escapeHtml(e.ammo.name) + ': ' +
                    '<input type="number" min="0" value="' + (e.ammo.qty || 0) + '" style="width:48px; display:inline; padding:1px;" onchange="setEnemyAmmo(\'' + e.id + '\',this.value)">' +
                    ((e.ammo.qty || 0) <= 0 ? ' <span style="color:#e67e22;">кончились — бьёт вблизи</span>' : '') + '</div>' : '');
            const spellsHtml = (e.spells && e.spells.length)
                ? e.spells.map((s, si) => '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">' +
                    escapeHtml(s.name) + ': <input type="number" value="' + (s.dmg || 0) + '" style="width:48px; display:inline; padding:1px;" onchange="setEnemySpellField(\'' + e.id + '\',' + si + ',\'dmg\',this.value)"> урона / ' +
                    '<input type="number" value="' + (s.cost || 0) + '" style="width:48px; display:inline; padding:1px;" onchange="setEnemySpellField(\'' + e.id + '\',' + si + ',\'cost\',this.value)"> МП</div>').join('')
                : '';
            const KIND_OPTS = [['', '— тип? —'], ['animal', 'зверь'], ['monster', 'монстр'], ['people', 'человек/меры'], ['undead', 'нежить'], ['daedra', 'даэдра'], ['automaton', 'механизм']];
            const levelLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">Уровень: ' +
                '<input type="number" min="0" value="' + (e.level || '') + '" placeholder="?" style="width:50px; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'level\',this.value)"> ' +
                '<select style="width:auto; display:inline; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'kind\',this.value)">' +
                KIND_OPTS.map(o => '<option value="' + o[0] + '"' + ((e.kind || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>';
            // Заклинания «Приказ даэдра»/«Изгнание даэдра» действуют полностью только на ПРИЗВАННЫХ даэдра. По умолчанию даэдра «дикий» (изгнание наносит урон,
            // приказ не работает); галочку ставит мастер, если даэдра призвал вражеский маг.
            const summonedLine = e.kind === 'daedra'
                ? '<div style="font-size:12px; opacity:.9; margin-top:2px;"><label style="display:flex; align-items:center; gap:4px; cursor:pointer;">' +
                  '<input type="checkbox" style="width:auto; margin:0;"' + (e.summoned === true ? ' checked' : '') + ' onchange="setEnemySummoned(\'' + e.id + '\', this.checked)"> 🔮 Призван (иначе «Приказ» и «Изгнание даэдра» не подействуют полностью)</label></div>'
                : '';
            const lootLine = '<div style="font-size:12px; opacity:.85; display:flex; align-items:center; gap:4px; margin-top:2px;">🎒 ' +
                '<input type="text" value="' + escapeHtml(e.loot || '') + '" placeholder="лут текстом" style="flex:1; padding:1px;" onchange="setEnemyField(\'' + e.id + '\',\'loot\',this.value)"></div>';
            const shoutsHtml = (e.shouts && e.shouts.length)
                ? e.shouts.map((s, si) => {
                    const cdKey = 'shoutCd_' + si;
                    const cdLeft = (e[cdKey] || 0);
                    return '<div style="font-size:12px; margin-top:2px; padding:3px; background:var(--input-bg); border-radius:3px;">' +
                        '<strong>🗣️ ' + escapeHtml(s.name) + '</strong> (КД ' + s.cooldown + ' х.): ' + escapeHtml(s.effect) +
                        '<div style="display:flex; gap:4px; align-items:center; margin-top:2px;">' +
                        '<span>Осталось КД: ' + cdLeft + '</span>' +
                        '<button style="width:auto; padding:1px 6px; font-size:11px;" onclick="useShout(\'' + e.id + '\',' + si + ',' + s.cooldown + ')" ' + (cdLeft > 0 ? 'disabled' : '') + '>Крикнуть</button>' +
                        '<button style="width:auto; padding:1px 6px; font-size:11px;" onclick="tickShoutCd(\'' + e.id + '\',' + si + ')" ' + (cdLeft <= 0 ? 'disabled' : '') + '>−1 ход КД</button>' +
                        '</div></div>';
                }).join('') : '';
            const isMarked = lastData && lastData.markedTarget === e.id;
            return '<div class="enemy-row' + (isMarked ? ' st-marked' : '') + '" data-enemy-id="' + escapeHtml(e.id) + '">' +
                '<div class="row-name"><span class="name-with-avatar"><input type="checkbox" class="st-enemy-sel" title="Выделить для массовых действий"' + (gmEnemySel.has(e.id) ? ' checked' : '') + ' onchange="gmToggleEnemySel(\'' + e.id + '\', this.checked)"><img class="enemy-avatar" src="' + enemyAvatarData(e) + '" alt=""><span>' + escapeHtml(e.name || '?') + '</span></span>' +
                '<span style="display:flex; gap:4px;"><button style="width:auto;padding:2px 8px;font-size:12px;" onclick="gmToggleMark(\'' + e.id + '\')" title="Игроки увидят 🎯 и кнопку «Атаковать помеченного»">' + (isMarked ? '🎯 Снять метку' : '🎯 Пометить') + '</button>' +
                '<button class="btn-danger" style="width:auto;padding:2px 8px;font-size:12px;" onclick="removeEnemy(\'' + e.id + '\')">Убрать</button></span></div>' +
                statsLine + statusLine + levelLine + summonedLine + dmgLine + resistLine + spellsHtml + lootLine + shoutsHtml +
                ((e.spells && e.spells.length) || e.weaponDmg ? '<div style="font-size:12px; margin-top:2px;">В руках: <select style="width:auto; font-size:12px; padding:1px 4px;" title="Смена хвата — действие врага в этом ходу. С двуручным/луком и с двумя предметами колдовать нельзя." onchange="gmSetEnemyHands(\'' + e.id + '\', this.value)">' +
                    Object.keys(GM_HANDS_LABEL).map(k => '<option value="' + k + '"' + (gmEnemyHands(e) === k ? ' selected' : '') + '>' + GM_HANDS_LABEL[k] + '</option>').join('') + '</select></div>' : '') +
                '<div class="grid-2" style="gap:6px; margin-top:4px;">' +
                '<div><label style="font-size:12px;">HP (' + (e.maxHp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curHp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curHp\',this.value)"></div>' +
                '<div><label style="font-size:12px;">MP (' + (e.maxMp || 0) + ' макс.)</label>' +
                '<input type="number" value="' + (e.curMp || 0) + '" onchange="setEnemyField(\'' + e.id + '\',\'curMp\',this.value)"></div>' +
                '</div>' +
                (function () {
                    // Труп показываем у любого павшего врага, у которого есть что обыскать (готовая добыча или текст «лут» с вики),
                    // а не только у поднимаемых гуманоидов — раньше «Обыскать» работало лишь у сгенерированных бандитов.
                    const isDead = (e.curHp || 0) <= 0;
                    const hasLootText = !!(e.loot && String(e.loot).trim());
                    const canLoot = !e.ashes && !e.looted && !!(e.corpseLoot || hasLootText);
                    if (!isDead || !(e.isRaisable || canLoot || e.looted)) return '';
                    return '<div style="margin-top:4px; padding:4px; background:var(--input-bg); border-radius:3px; font-size:12px;">' +
                        '💀 Труп' + (e.corpseRace ? ' (' + escapeHtml(e.corpseRace) + ', знак «' + escapeHtml(e.corpseSign || '') + '»)' : '') +
                        (e.ashes ? '<div style="opacity:.75;">🔥 Обращён в пепел (Трансмутация смерти) — обыскать и поднять нельзя.</div>'
                            : canLoot ? gmCorpseLootControls(e)
                            : e.looted ? '<div style="opacity:.6;">Уже обыскан.</div>' : '<div style="opacity:.6;">Здесь нечего брать.</div>') +
                        (e.isRaisable ? (e.soulTaken ? '<div style="opacity:.75; margin-top:2px;">🕳 Душа захвачена — поднять заклинанием или способностью нельзя.</div>' : '<div style="opacity:.6; margin-top:2px;">🧟 Доступен для поднятия заклинанием игрока</div>') : '') +
                        '</div>';
                })() +
                '</div>';
        }).join('');
        gmBulkCount();
    }

    window.useShout = function (enemyId, shoutIdx, cooldown) {
        const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? { ...e, ['shoutCd_' + shoutIdx]: cooldown } : e);
        gmUpdateEnemies(enemies).catch(err => console.error(err));
        const enemy = enemies.find(e => e.id === enemyId);
        const shout = enemy && enemy.shouts && enemy.shouts[shoutIdx];
        if (shout) gmPostLogEntryText(`🗣️ ${enemy.name} кричит «${shout.name}»: ${shout.effect}`);
    };

    // Раньше ничего не декрементировало shoutCd_* вообще — крик срабатывал один раз за весь бой,
    // кнопка оставалась серой навсегда. Ручной тик за ход мастера (не привязан к действиям
    // игрока на другой вкладке — проще и надёжнее автотика между разными сессионными контекстами).
    window.tickShoutCd = function (enemyId, shoutIdx) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== enemyId) return e;
            const key = 'shoutCd_' + shoutIdx;
            return { ...e, [key]: Math.max(0, (e[key] || 0) - 1) };
        });
        gmUpdateEnemies(enemies).catch(err => console.error(err));
    };

    let currentEnemyDbPick = null;

    // Тип врага для двухступенчатого выбора: сначала тип (фалмеры, нежить…), потом конкретный.
    const ENEMY_TYPES = [
        ['animals', '🐺 Животные', (e) => e.category === 'Животные'],
        ['falmer', '🦇 Фалмеры', (e) => /фалмер/i.test(e.name)],
        ['undead', '💀 Нежить', (e) => /скелет|драугр|нежить|жрец-дракон/i.test(e.name)],
        ['vamp', '🧛 Вампиры и оборотни', (e) => /вампир|вервольф|оборотень|медведь оборотни|гончая смерти/i.test(e.name)],
        ['bandit', '🗡 Бандиты', (e) => /бандит|разбойник|громила|грабитель|головорез|мародер|мародёр|главарь/i.test(e.name)],
        ['forsworn', '🪶 Изгои', (e) => /изгой/i.test(e.name)],
        ['dwemer', '⚙️ Двемерские механизмы', (e) => /двемер/i.test(e.name)],
        ['daedra', '🔥 Даэдра и атронахи', (e) => /дремор|атронах/i.test(e.name)],
        ['giants', '🪨 Великаны и тролли', (e) => /великан|тролл|мамонт|горгулья/i.test(e.name)],
        ['bugs', '🕷 Пауки и насекомые', (e) => /паук|корус|нетч|стрекоз|мотыл/i.test(e.name)],
        ['other', '👹 Прочие монстры', () => true]
    ];
    function enemyTypeKey(e) { for (let i = 0; i < ENEMY_TYPES.length; i++) if (ENEMY_TYPES[i][2](e)) return ENEMY_TYPES[i][0]; return 'other'; }
    function populateEnemyDbSelect() {
        const select = el('enemy-db-select');
        if (!select || !window.enemiesData) return;
        // Старый gm.html из кэша браузера (до выбора по типам) не имеет списка типов, а новый gm.js без него
        // показывал пустой список «— сначала выбери тип —». Создаём список типов сами перед списком врагов.
        let ts = el('enemy-type-select');
        if (!ts && select.parentNode) {
            ts = document.createElement('select'); ts.id = 'enemy-type-select';
            ts.innerHTML = '<option value="">— тип противника —</option>';
            ts.addEventListener('change', () => window.onEnemyTypePicked());
            select.parentNode.insertBefore(ts, select);
        }
        if (ts && ts.options.length < 2) {
            const cnt = {}; window.enemiesData.forEach(e => { const k = enemyTypeKey(e); cnt[k] = (cnt[k] || 0) + 1; });
            ts.innerHTML = '<option value="">— тип противника —</option>' + ENEMY_TYPES.filter(t => cnt[t[0]]).map(t => `<option value="${t[0]}">${t[1]} (${cnt[t[0]]})</option>`).join('');
        }
        const type = ts ? ts.value : '';
        const opt = (e, i) => `<option value="${i}">${escapeHtml(e.name)} (${e.hp} HP)</option>`;
        // Тип не выбран (или выпадашки типов нет — старая страница из кэша) — весь список по группам, а не пустой выбор.
        select.innerHTML = type
            ? '<option value="">— выбери противника —</option>' + window.enemiesData.map((e, i) => enemyTypeKey(e) === type ? opt(e, i) : '').join('')
            : '<option value="">— выбери противника (или сначала тип) —</option>' + ENEMY_TYPES.map(t => {
                const items = window.enemiesData.map((e, i) => enemyTypeKey(e) === t[0] ? opt(e, i) : '').join('');
                return items ? `<optgroup label="${escapeHtml(t[1])}">${items}</optgroup>` : '';
            }).join('');
    }
    window.populateEnemyDbSelect = populateEnemyDbSelect;
    // Выбрать противника из базы по номеру (для тестов и быстрых вызовов): подставляет его тип и сам выбор.
    window.gmSelectEnemyDb = function (idx) {
        const e = window.enemiesData[idx], ts = el('enemy-type-select'); if (!e) return;
        if (ts) { if (ts.options.length < 2) populateEnemyDbSelect(); ts.value = enemyTypeKey(e); }
        populateEnemyDbSelect(); el('enemy-db-select').value = String(idx); window.onEnemyDbPicked();
    };
    window.onEnemyTypePicked = function () { populateEnemyDbSelect(); currentEnemyDbPick = null; const inf = el('enemy-db-info'); if (inf) inf.innerHTML = ''; };

    window.onEnemyDbPicked = function () {
        const idx = el('enemy-db-select').value;
        const infoEl = el('enemy-db-info');
        if (idx === '') { currentEnemyDbPick = null; infoEl.innerHTML = ''; return; }
        const e = window.enemiesData[parseInt(idx)];
        currentEnemyDbPick = e;
        el('enemy-name-input').value = e.name;
        el('enemy-hp-input').value = e.hp;
        // Мана врага: из базы (поле mana), иначе — запас на три самых дорогих заклинания.
        const totalMana = parseInt(e.mana) > 0 ? parseInt(e.mana) : (e.spells && e.spells.length ? Math.max(...e.spells.map(s => s.cost || 0)) * 3 : 0);
        el('enemy-mp-input').value = totalMana;
        let info = '';
        if (e.weaponDmg) { const wd = enemyWeaponDamage(e); info += `Урон: ${wd.total}${wd.stat ? ' (оружие ' + wd.base + ' + ' + wd.label + ' ' + wd.stat + ')' : ''}${e.weaponNote ? ' — ' + escapeHtml(e.weaponNote) : ''}<br>`; }
        if (e.weaponOptions && e.weaponOptions.length > 1) info += `🎲 Варианты оружия (при добавлении выберется случайно): ${e.weaponOptions.map(escapeHtml).join(', ')}<br>`;
        if (Object.keys(e.resist).length) info += `Резист: ${Object.entries(e.resist).map(([k, v]) => k + ' ' + v + '%').join(', ')}<br>`;
        if (e.spells.length) info += `Заклинания: ${e.spells.map(s => s.name + ' (' + s.dmg + '/' + s.cost + ')').join(', ')}<br>`;
        if (e.shouts.length) info += `Крики: ${e.shouts.map(s => s.name).join(', ')}<br>`;
        if (window.EnemyGear && window.EnemyGear.familyOf(e.name)) info += `🎲 Оружие и броня определятся случайно при добавлении в бой (${/драугр/i.test(e.name) ? 'древненордские, возможно зачарованные' : 'изгойские'}), лут — как у бандитов.<br>`;
        if (e.loot) info += `Лут: ${escapeHtml(e.loot)}`;
        infoEl.innerHTML = info;
    };

    // ---------- Снаряжение и добыча врага по выбору мастера ----------
    let enemyGearDraft = []; // [{ name, qty, chance }]

    function gmItemDmg(i) { if (window.GearLegacy) window.GearLegacy.fixItem(i); return typeof i.dmg === 'number' ? i.dmg : (typeof i.damage === 'number' ? i.damage : null); }
    function gmItemArmor(i) { if (window.GearLegacy) window.GearLegacy.fixItem(i); return typeof i.armor === 'number' ? i.armor : (typeof i.resistance === 'number' ? i.resistance : null); }
    function enemyGearRole(i) {
        if (!i) return 'loot';
        const isAmmo = /стрел|болт/i.test(i.name || '');
        if (gmItemDmg(i) !== null && (i.slot === 'melee' || i.slot === 'ranged') && !isAmmo) return 'weapon';
        if (gmItemArmor(i) !== null && ['helmet', 'chest', 'gloves', 'boots', 'shield'].includes(i.slot)) return 'armor';
        return 'loot';
    }
    function gmFindItemByName(name) {
        return (gmAllItemsByKey && gmAllItemsByKey.get(name)) || (gmAllItems || []).find(i => i.name === name) || null;
    }
    window.populateEnemyGearDatalist = function () {
        const dl = el('enemy-gear-datalist');
        if (!dl) return;
        const names = Array.from(new Set((gmAllItems || []).map(i => i.name))).sort((a, b) => a.localeCompare(b, 'ru'));
        dl.innerHTML = names.map(n => '<option value="' + escapeHtml(n) + '"></option>').join('');
    };
    window.addEnemyGearItem = function () {
        const name = (el('enemy-gear-name').value || '').trim();
        if (!name) return;
        const item = gmFindItemByName(name);
        if (!item) { alert('Предмета «' + name + '» нет в базе — выбери из подсказок списка.'); return; }
        const qty = Math.max(1, parseInt(el('enemy-gear-qty').value) || 1);
        const chance = Math.min(100, Math.max(1, parseInt(el('enemy-gear-chance').value) || 100));
        enemyGearDraft.push({ name: item.name, qty, chance });
        el('enemy-gear-name').value = ''; el('enemy-gear-qty').value = 1; el('enemy-gear-chance').value = 100;
        renderEnemyGearDraft();
    };
    window.removeEnemyGearItem = function (idx) { enemyGearDraft.splice(idx, 1); renderEnemyGearDraft(); };
    function renderEnemyGearDraft() {
        const box = el('enemy-gear-list');
        if (!box) return;
        const ROLE = { weapon: '⚔️ оружие', armor: '🛡 броня', loot: '🎒 лут' };
        box.innerHTML = enemyGearDraft.length ? enemyGearDraft.map((d, idx) => {
            const it = gmFindItemByName(d.name) || {};
            const role = enemyGearRole(it);
            const stat = role === 'weapon' ? ' · урон ' + StBonuses.shownWeaponDmg(gmItemDmg(it), it) : role === 'armor' ? ' · броня ' + StBonuses.shownArmor(gmItemArmor(it), it) : '';
            const uniq = (typeof isUniqueLootItem === 'function' && isUniqueLootItem(it)) ? ' <span style="color:#e6b800;">★ уникальное</span>' : '';
            return '<div class="party-row" style="display:flex; align-items:center; gap:6px; padding:3px 6px; font-size:13px;">' +
                '<span style="flex:1;"><strong>' + escapeHtml(d.name) + '</strong>' + (d.qty > 1 ? ' ×' + d.qty : '') + uniq +
                '<br><span style="opacity:.7;">' + ROLE[role] + stat + ' · шанс ' + d.chance + '%' + (it.effect ? ' · ' + escapeHtml(StBonuses.shownEffect(it).slice(0, 70)) : '') + '</span></span>' +
                '<button type="button" style="width:auto; margin:0; padding:2px 8px;" class="btn-danger" onclick="removeEnemyGearItem(' + idx + ')">×</button></div>';
        }).join('') : '<p style="opacity:.6; font-size:13px; margin:2px 0;">Список пуст.</p>';
    }
    // Превращает список мастера в характеристики врага и готовую добычу (шанс выпадения бросается сразу, как у генераторов).
    function buildEnemyGearExtra() {
        const gold = Math.max(0, parseInt((el('enemy-gear-gold') || {}).value) || 0);
        if (!enemyGearDraft.length && !gold) return null;
        const items = [];
        let weapon = null; const armorNames = []; const armorBySlot = {}; // на враге одна вещь на слот: 2 шлема не складываются
        enemyGearDraft.forEach(d => {
            const it = gmFindItemByName(d.name);
            if (!it) return;
            const role = enemyGearRole(it);
            if (role === 'weapon' && (!weapon || gmItemDmg(it) > gmItemDmg(weapon))) weapon = it;
            if (role === 'armor') { const sl = it.slot || it.name; armorBySlot[sl] = Math.max(armorBySlot[sl] || 0, gmItemArmor(it) || 0); armorNames.push(it.name); }
            if (Math.random() * 100 < d.chance) {
                const loot = window.EnemyLoot ? window.EnemyLoot.toLoot(it, d.qty) : { name: it.name, price: it.price || 0, weight: it.weight || 0, category: it.category || '', qty: d.qty };
                if (loot.enchantment && (loot.slot === 'melee' || loot.slot === 'ranged') && typeof loot.chargeDaysLeft !== 'number') loot.chargeDaysLeft = 3;
                items.push(loot);
            }
        });
        const armorSum = Object.keys(armorBySlot).reduce((a, k) => a + armorBySlot[k], 0);
        // Лук/арбалет: стрелы/болты из списка снаряжения (подходящие по виду) становятся колчаном — тратятся в бою,
        // остаток попадает в добычу. Нет подходящих — колчан из 12 стрел/болтов под материал оружия.
        let ammo = null;
        if (weapon && weapon.slot === 'ranged' && window.EnemyLoot && window.EnemyLoot.quiverFor) {
            const wantBolt = /арбалет/i.test(weapon.name);
            const own = enemyGearDraft.find(d => (wantBolt ? /болт/i : /стрел/i).test(d.name));
            ammo = own ? { name: own.name, qty: Math.max(1, parseInt(own.qty) || 1), max: Math.max(1, parseInt(own.qty) || 1), bolt: wantBolt } : window.EnemyLoot.quiverFor(weapon.name, 12);
            if (ammo) { const nm = ammo.name; for (let i = items.length - 1; i >= 0; i--) if (items[i].name === nm) items.splice(i, 1); }
        }
        const noteParts = [];
        if (weapon) noteParts.push(weapon.name + (weapon.effect ? ' (' + String(weapon.effect).slice(0, 80) + ')' : ''));
        if (armorNames.length) noteParts.push('надето: ' + armorNames.join(', '));
        return {
            weaponDmg: weapon ? gmItemDmg(weapon) : 0, isRanged: !!(weapon && weapon.slot === 'ranged'), weaponNote: noteParts.join(' · '), ammo,
            physResist: armorSum ? Math.min(85, Math.round(armorSum / 10)) : 0,
            corpseLoot: { gold, items }
        };
    }

    // Болезнь врага: из самого врага, а если её там нет (враги, добавленные до исправления, из встреч/шаблонов, «Злокрыс 2») —
    // из базы по имени (точное совпадение после отбрасывания номера и пометок в скобках).
    function gmEnemyDisease(enemy) {
        if (!enemy) return { name: null, chance: 0 };
        if (enemy.carrierOfDisease) return { name: enemy.carrierOfDisease, chance: enemy.diseaseChance || 0 };
        if (enemy.summoned) return { name: null, chance: 0 };
        const base = String(enemy.name || '').replace(/\s*\(.*\)\s*$/, '').replace(/\s*#?\d+\s*$/, '').trim().toLowerCase();
        const t = (window.enemiesData || []).find(x => String(x.name).toLowerCase() === base);
        return t && t.carrierOfDisease ? { name: t.carrierOfDisease, chance: t.diseaseChance || 0 } : { name: null, chance: 0 };
    }
    window.gmEnemyDisease = gmEnemyDisease;

    // Поля врага из записи базы enemies-data.js (урон, резисты, заклинания, лут, болезнь, генерация снаряжения драугров/изгоев).
    // Раньше жило только внутри addEnemy; вынесено, чтобы так же создавать врагов при развёртывании данжа (ТЗ-2, эпик 2.2).
    function gmEnemyExtraFromDb(pick) {
        const extra = {};
        if (!pick) return extra;
        if (pick.weaponDmg) extra.weaponDmg = pick.weaponDmg;
        // Рандомайзер оружия — у драугров/подобных несколько вариантов оружия в источнике
        // (Враги.xlsx), раньше просто брался статичный weaponNote. Один случайный вариант при
        // каждом добавлении в бой — правдоподобнее, чем всегда одно и то же оружие у всех.
        if (pick.weaponOptions && pick.weaponOptions.length) {
            extra.weaponNote = pick.weaponOptions[Math.floor(Math.random() * pick.weaponOptions.length)];
        } else if (pick.weaponNote) {
            extra.weaponNote = pick.weaponNote;
        }
        if (Object.keys(pick.resist || {}).length) extra.resist = pick.resist;
        if ((pick.spells || []).length) extra.spells = pick.spells;
        if ((pick.shouts || []).length) extra.shouts = pick.shouts;
        if (pick.loot) extra.loot = pick.loot;
        // Характеристики из базы (2026-11-13): атака d20 + мод. СИЛ/ЛОВ/ИНТ, урон оружием + значение СИЛ/ЛОВ. Генератор ниже перекрывает СИЛ/ЛОВ/ТЕЛ.
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => { if (typeof pick[k] === 'number') extra[k] = pick[k]; });
        if (pick.isRanged) extra.isRanged = true;
        // Колчан базовых стрелков (фалмеры-лучники, балиста): выстрел тратит стрелу/болт, остаток — в добычу.
        if (pick.isRanged && window.EnemyLoot && window.EnemyLoot.quiverFor) extra.ammo = window.EnemyLoot.quiverFor(/балист/i.test(pick.name) ? 'Двемерская балиста' : /фалмер/i.test(pick.name) ? 'Фалмерский лук' : 'Охотничий лук', /балист/i.test(pick.name) ? 10 : 12);
        // Драугры и изгои — как бандиты: случайное оружие/броня (у драугров древненордские, возможно зачарованные)
        if (window.EnemyGear && window.EnemyGear.familyOf(pick.name)) {
            const gen = window.EnemyGear.generate(pick, enemyLootCtx(pick.level));
            if (gen) {
                extra.weaponDmg = gen.weaponDmg; extra.str = gen.str; extra.dex = gen.dex; extra.con = gen.con; extra.spells = gen.spells; extra.weaponNote = gen.weaponNote; extra.isRanged = gen.isRanged; extra.resist = gen.resist;
                if (gen.ammo) extra.ammo = gen.ammo; else delete extra.ammo;
                extra.corpseLoot = { gold: gen.gold, items: gen.lootItems }; extra.lootKit = JSON.parse(JSON.stringify(extra.corpseLoot));
                extra.loot = genLootText(gen);
            }
        }
        // Переносчик болезни — раньше эти поля не копировались в бой, и бросок на заражение никогда не срабатывал.
        if (pick.carrierOfDisease) { extra.carrierOfDisease = pick.carrierOfDisease; extra.diseaseChance = pick.diseaseChance || 0; }
        if (pick.soul) extra.soul = pick.soul; // размер души для захвата душ
        if (pick.level) extra.level = pick.level; // уровень и тип — для заклинаний «до N уровня»
        if (pick.kind) extra.kind = pick.kind;
        // Только гуманоидов можно поднять заклинанием (Воины/Шаманы/Боевые маги — фалмеры
        // и подобные; звери/монстры/ловушки — нет).
        if (['Воины', 'Шаманы', 'Боевые маги'].includes(pick.category)) extra.isRaisable = true;
                return extra;
    }
    window.gmEnemyExtraFromDb = gmEnemyExtraFromDb;

    // ---------- Ранги врагов и сложность боя (enemy-ranks.js) ----------
    // Отряд для оценки: живые игроки и их призванные существа (ОЗ и урон за круг).
    function gmPartyForDifficulty() {
        const out = [];
        Object.values(lastData.participants || {}).forEach(p => {
            if (!p) return;
            out.push({ curHp: p.fallen ? 0 : p.curHp, maxHp: p.maxHp, dmg: p.dmg, level: p.level, physRes: p.physRes });
            (p.summons || []).forEach(s => out.push({ curHp: s.curHp, maxHp: s.maxHp, dmg: s.dmg }));
        });
        return out;
    }
    function gmPartyAvgLevel() {
        const l = Object.values(lastData.participants || {}).map(p => Number(p && p.level) || 0).filter(Boolean);
        return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0;
    }
    function gmDifficultyLine(d, prefix) {
        if (!d) return '';
        const lose = d.roundsToLose === Infinity ? '—' : '~' + d.roundsToLose;
        return `${prefix}<b style="color:${d.level.color}">${d.level.name}</b> <span style="opacity:.75">· отряд снимет врагов за ~${d.roundsToWin} кр., враги отряд — за ${lose} кр.</span>`;
    }
    function gmRenderDifficulty() {
        const box = el('gm-difficulty');
        if (!box || !window.EnemyRanks) return;
        const d = window.EnemyRanks.difficulty(gmPartyForDifficulty(), lastData.enemies || []);
        box.innerHTML = d ? gmDifficultyLine(d, '⚖️ Сложность боя: ') +
            '<div style="font-size:11px; opacity:.7;">Учтены физическое сопротивление врагов (' + d.enRes + '%)' + (d.pcResKnown ? ' и героев (' + d.pcRes + '%)' : ', броня героев пока неизвестна') + '. Заклинания игроков и промахи не считаются.</div>' +
            (d.advice ? '<div style="font-size:12px; color:' + d.level.color + ';">' + d.advice + '</div>' : '') : '';
        gmRankPreview();
    }
    window.gmRankPreview = function () {
        const sel = el('enemy-rank-select'), hint = el('enemy-rank-hint');
        if (!sel || !window.EnemyRanks) return;
        if (!sel.options.length) {
            sel.innerHTML = window.EnemyRanks.RANKS.map(r => `<option value="${r.id}">${r.name}${r.id === 'normal' ? '' : ` (ОЗ ×${r.hp}, урон ×${r.dmg})`}</option>`).join('');
            const lv = gmPartyAvgLevel(); if (lv) sel.value = window.EnemyRanks.recommend(lv).id;
        }
        if (!hint) return;
        const lv = gmPartyAvgLevel(), rec = lv ? window.EnemyRanks.recommend(lv) : null;
        let txt = lv ? `Отряду ур. ~${lv} подходит «${rec.name}».` : '';
        const name = (el('enemy-name-input') || {}).value;
        const hp = Number((el('enemy-hp-input') || {}).value) || 0;
        if (name && hp) {
            const pick = (currentEnemyDbPick && currentEnemyDbPick.name === name) ? currentEnemyDbPick : null;
            const manualDmg = Number((el('enemy-dmg-input') || {}).value) || 0;
            const probe = window.EnemyRanks.apply({ name, maxHp: hp, curHp: hp, weaponDmg: manualDmg || (pick && pick.weaponDmg) || 0, spells: (pick && pick.spells) || [] }, sel.value);
            const d = window.EnemyRanks.difficulty(gmPartyForDifficulty(), (lastData.enemies || []).concat([probe]));
            if (d) txt += ' С ним: ' + `<b style="color:${d.level.color}">${d.level.name}</b>.`;
        }
        hint.innerHTML = txt;
    };
    // при выборе врага из базы и правке ХП/урона — пересчитать подсказку
    setTimeout(() => {
        ['enemy-hp-input', 'enemy-dmg-input', 'enemy-name-input'].forEach(id => { const i = el(id); if (i) i.addEventListener('input', () => window.gmRankPreview()); });
        const db = el('enemy-db-select'); if (db) db.addEventListener('change', () => window.gmRankPreview());
        window.gmRankPreview();
    }, 0);

    window.addEnemy = function () {
        const name = el('enemy-name-input').value.trim();
        if (!name) return;
        const maxHp = Number(el('enemy-hp-input').value) || 0;
        const maxMp = Number(el('enemy-mp-input').value) || 0;
        const enemies = (lastData.enemies || []).slice();
        // Ручной ввод урона/резиста/лута — раньше их вообще не было в форме создания, только
        // имя+ХП+МП, править приходилось уже ПОСЛЕ добавления через отдельные поля в списке боя.
        const manualDmg = Number(el('enemy-dmg-input').value) || 0;
        const manualResist = Number(el('enemy-resist-input').value) || 0;
        const manualLoot = el('enemy-loot-input').value.trim();
        const extra = {};
        // Сначала значения базы, поверх — то, что мастер ввёл руками (раньше база перетирала ручные урон, резист и лут).
        if (currentEnemyDbPick && currentEnemyDbPick.name === name) Object.assign(extra, gmEnemyExtraFromDb(currentEnemyDbPick));
        if (manualDmg) extra.weaponDmg = manualDmg;
        if (manualResist) extra.resist = Object.assign({}, extra.resist || {}, { physical: manualResist });
        if (manualLoot) extra.loot = manualLoot;
        // Снаряжение/добыча по выбору мастера главнее и значений из базы, и автоматического генератора.
        const gearExtra = buildEnemyGearExtra();
        if (gearExtra) {
            if (gearExtra.weaponDmg && !manualDmg) extra.weaponDmg = gearExtra.weaponDmg;
            if (gearExtra.weaponNote) { extra.weaponNote = gearExtra.weaponNote; extra.isRanged = gearExtra.isRanged; if (gearExtra.ammo) extra.ammo = gearExtra.ammo; else delete extra.ammo; }
            if (gearExtra.physResist && !manualResist) extra.resist = Object.assign({}, extra.resist || {}, { physical: gearExtra.physResist });
            extra.corpseLoot = gearExtra.corpseLoot; extra.lootKit = JSON.parse(JSON.stringify(gearExtra.corpseLoot || null));
            extra.loot = genLootText(gearExtra.corpseLoot);
        }
        let newEnemy = Object.assign({ id: genId('e'), name, maxHp, curHp: maxHp, maxMp, curMp: maxMp }, extra);
        // Ранг (enemy-ranks.js): ветеран/элита/легенда — больше ОЗ, урона, маны и физ. резиста.
        const rankSel = el('enemy-rank-select');
        if (rankSel && window.EnemyRanks && rankSel.value && rankSel.value !== 'normal') newEnemy = window.EnemyRanks.apply(newEnemy, rankSel.value);
        enemies.push(stripUndefinedDeep(newEnemy));
        gmUpdateEnemies(enemies).then(() => {
            el('enemy-name-input').value = '';
            el('enemy-hp-input').value = 10;
            el('enemy-mp-input').value = 0;
            el('enemy-dmg-input').value = 0;
            el('enemy-resist-input').value = 0;
            el('enemy-loot-input').value = '';
            enemyGearDraft = []; renderEnemyGearDraft(); if (el('enemy-gear-gold')) el('enemy-gear-gold').value = 0;
            el('enemy-db-select').value = '';
            el('enemy-db-info').innerHTML = '';
            currentEnemyDbPick = null;
        }).catch(e => console.error(e));
    };

    // TEXT_ENEMY_FIELDS — поля, которые НЕ надо принудительно приводить к числу (раньше
    // Number(value)||0 стояло безусловно для любого поля — для текста типа "лут" это дало бы 0).
    const TEXT_ENEMY_FIELDS = ['loot', 'weaponNote', 'name', 'kind', 'hands'];
    window.setEnemySummoned = function (id, checked) {
        const enemies = (lastData.enemies || []).map(e => e.id === id ? { ...e, summoned: !!checked } : e);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };
    window.setEnemyField = function (id, field, value) {
        const finalVal = TEXT_ENEMY_FIELDS.includes(field) ? value : (Number(value) || 0);
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== id) return e;
            const c = { ...e, [field]: finalVal };
            if (field === 'curHp' && finalVal > 0) delete c.killedBy; // мастер поднял врага — прошлый убийца уже не в счёт
            return c;
        });
        gmUpdateEnemies(enemies, { absolute: true }).catch(e => console.error(e));
    };
    // Стрелы/болты в колчане врага — правка мастером (подобрал стрелы, отдал запас и т.п.).
    window.setEnemyAmmo = function (id, value) {
        const n = Math.max(0, parseInt(value) || 0);
        const enemies = (lastData.enemies || []).map(e => e.id === id && e.ammo ? { ...e, ammo: Object.assign({}, e.ammo, { qty: n }) } : e);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    // Снятие статус-эффекта (Страх/Успокоение/Ярость/Полиморф) — тикается вручную мастером,
    // не по автоматическому счётчику ходов.
    // ---------- Отмена последнего действия мастера (1 шаг, 30 секунд) ----------
    // Раньше любая ошибка мастера с врагами (лишний урон, не тот убран) исправлялась вручную. Теперь ВСЕ записи списка врагов идут через
    // gmUpdateEnemies(): перед записью сохраняем снимок прежнего состояния. Хранится только последнее действие и только 30 секунд.
    // Обыск трупа в откат не входит (вещи уже выданы игроку). Откат перезаписывает врагов целиком — изменения игроков за эти секунды тоже откатятся.
    const GM_UNDO_TTL = 30000;
    // Раньше здесь весь список врагов из снимка мастера писался поверх облака без транзакции, и удар игрока,
    // пришедший за эти доли секунды, пропадал. Теперь пишем транзакцией и переносим на свежие данные только то,
    // что мастер действительно поменял (сравнение со снимком): ХП и мана — как прибавка/убыль, остальное — как значение.
    // opts.absolute — ХП/ману ставить ровно как ввёл мастер (ручная правка поля).
    // Урон от мастера (массовый, совместная атака, ручная правка) теперь, как и удар игрока, снимает статусы
    // «спадают от урона» (Полиморф, Бегство…) и отмечает момент смерти (окно «поднять труп»).
    function gmMergeEnemyEdits(server, prev, desired, turnNow, opts) {
        const byId = a => { const m = {}; (a || []).forEach(e => { if (e && e.id != null) m[e.id] = e; }); return m; };
        const S = byId(server), P = byId(prev);
        const desiredIds = new Set((desired || []).filter(Boolean).map(e => e.id));
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const out = [];
        (desired || []).forEach(d => {
            if (!d) return;
            const p = P[d.id], s = S[d.id];
            if (!p) { if (!s) out.push(d); else out.push(Object.assign({}, s, d)); return; } // новый враг от мастера
            if (!s) return; // врага уже убрали из боя (за это время) — не возвращаем
            const c = Object.assign({}, s);
            const nums = [];
            new Set(Object.keys(p).concat(Object.keys(d))).forEach(k => {
                if (same(p[k], d[k])) return;
                if ((k === 'curHp' || k === 'curMp') && !(opts && opts.absolute) && typeof p[k] === 'number' && typeof d[k] === 'number' && typeof s[k] === 'number') { nums.push(k); return; }
                if (d[k] === undefined) delete c[k]; else c[k] = d[k];
            });
            nums.forEach(k => {
                const max = k === 'curHp' ? c.maxHp : c.maxMp;
                let v = Math.max(0, s[k] + d[k] - p[k]);
                if (typeof max === 'number' && d[k] <= max) v = Math.min(max, v);
                c[k] = v;
            });
            const sHp = parseInt(s.curHp) || 0, cHp = parseInt(c.curHp) || 0;
            if (cHp < sHp) {
                if (Array.isArray(c.statusEffects)) c.statusEffects = c.statusEffects.filter(st => !(st && (st.breakOnDamage || (window.StCombat && window.StCombat.statusRule && window.StCombat.statusRule(st.name).breakOnDamage))));
                if (sHp > 0 && cHp <= 0 && (c.diedAtTurn === undefined || c.diedAtTurn === s.diedAtTurn)) c.diedAtTurn = turnNow || 0;
            }
            out.push(c);
        });
        // враги, появившиеся в облаке уже после снимка мастера, остаются
        (server || []).forEach(s => { if (s && s.id != null && !P[s.id] && !desiredIds.has(s.id)) out.push(s); });
        return out;
    }
    function gmUpdateEnemies(enemies, opts, extraPatch) {
        const prev = (lastData && Array.isArray(lastData.enemies)) ? lastData.enemies : [];
        window._gmUndo = { ts: Date.now(), sessionCode: currentCode, enemies: JSON.parse(JSON.stringify(prev)) };
        gmUndoRefresh();
        const ref = db.collection('sessions').doc(currentCode);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.exists ? (doc.data() || {}) : {};
            const merged = gmMergeEnemyEdits(d.enemies || [], prev, enemies, parseInt(d.sessionTurnCounter) || 0, opts);
            tx.update(ref, Object.assign({ enemies: stripUndefinedDeep(merged) }, extraPatch || {}));
        }));
    }
    window.gmMergeEnemyEdits = gmMergeEnemyEdits;
    function gmUndoAvailable() { const u = window._gmUndo; return !!(u && u.sessionCode === currentCode && Date.now() - u.ts < GM_UNDO_TTL); }
    function gmUndoRefresh() {
        const b = el('gm-undo-btn'); if (!b) return;
        const ok = gmUndoAvailable();
        b.disabled = !ok;
        b.classList.toggle('st-undo-ready', ok);
        if (!ok && window._gmUndo && Date.now() - window._gmUndo.ts >= GM_UNDO_TTL) window._gmUndo = null;
    }
    setInterval(gmUndoRefresh, 1000);
    window.gmUndoLast = function () {
        if (!gmUndoAvailable()) { gmUndoRefresh(); return; }
        const u = window._gmUndo;
        db.collection('sessions').doc(currentCode).update({ enemies: stripUndefinedDeep(u.enemies) }).then(() => {
            window._gmUndo = null; gmUndoRefresh();
            gmPostLogEntryText('↶ Мастер отменил последнее действие.');
        }).catch(e => alert('Ошибка отката: ' + e.message));
    };

    // ---------- Метка цели (1.3) ----------
    // sessions/{code}.markedTarget = id врага | null. Игроки видят 🎯 в списке целей и кнопку «Атаковать помеченного» в боевом доке.
    window.gmToggleMark = function (id) {
        const e = (lastData.enemies || []).find(x => x.id === id); if (!e) return;
        const next = lastData.markedTarget === id ? null : id;
        db.collection('sessions').doc(currentCode).update({ markedTarget: next }).then(() => {
            if (next) gmPostLogEntryText('🎯 Мастер пометил цель: «' + e.name + '».');
        }).catch(err => alert('Ошибка: ' + err.message));
    };
    let _gmMarkClearing = false;
    // Метка автоматически снимается, когда помеченный враг убит или убран (проверка при каждом обновлении списка у мастера)
    function gmCheckMarked(enemies) {
        const id = lastData && lastData.markedTarget;
        if (!id || _gmMarkClearing) return;
        const e = (enemies || []).find(x => x.id === id);
        if (e && (e.curHp || 0) > 0) return;
        _gmMarkClearing = true;
        db.collection('sessions').doc(currentCode).update({ markedTarget: null }).catch(() => { }).finally(() => { _gmMarkClearing = false; });
    }

    // ---------- Массовые действия с врагами (1.6) ----------
    const gmEnemySel = new Set();
    window.gmToggleEnemySel = function (id, on) { if (on) gmEnemySel.add(id); else gmEnemySel.delete(id); gmBulkCount(); };
    window.gmEnemySelectAll = function (on) {
        gmEnemySel.clear();
        if (on) (lastData.enemies || []).forEach(e => gmEnemySel.add(e.id));
        renderEnemies(lastData.enemies || []);
    };
    function gmBulkCount() {
        const ids = new Set((lastData.enemies || []).map(e => e.id));
        Array.from(gmEnemySel).forEach(id => { if (!ids.has(id)) gmEnemySel.delete(id); });
        const c = el('gm-bulk-count'); if (c) c.textContent = gmEnemySel.size;
    }
    window.gmBulkToggleMenu = function () {
        const m = el('gm-bulk-menu'); if (!m) return;
        m.style.display = m.style.display === 'none' ? 'block' : 'none';
        const s = el('gm-bulk-status');
        if (s && !s.options.length) s.innerHTML = Object.keys(GM_STATUS_EFFECTS).map(k => `<option value="${k}">${escapeHtml(GM_STATUS_EFFECTS[k].name)}</option>`).join('');
    };
    // общий каркас: берёт выделенных, меняет копией, пишет ОДНИМ update и одной строкой в журнал
    function gmBulkApply(fn, logText) {
        gmBulkCount();
        if (!gmEnemySel.size) { alert('Сначала выдели врагов (галочка слева у карточки).'); return; }
        if (!currentCode) { alert('Нет активной сессии.'); return; }
        const turn = (lastData && lastData.sessionTurnCounter) || 0;
        const notes = [];
        const next = (lastData.enemies || []).map(e => gmEnemySel.has(e.id) ? fn(Object.assign({}, e), notes, turn) : e);
        if (!notes.length) { alert('Среди выделенных нет подходящих целей (мёртвые пропускаются).'); return; }
        gmUpdateEnemies(next).then(() => gmPostLogEntryText(logText(notes))).catch(err => alert('Ошибка: ' + err.message));
    }
    window.gmBulkDamage = function () {
        const n = Math.max(0, parseInt(el('gm-bulk-n').value) || 0), type = el('gm-bulk-type').value;
        if (!n) return;
        gmBulkApply((e, notes, turn) => {
            if ((e.curHp || 0) <= 0) return e;
            const pv = window.StCombat.previewDamage(e, n, type, 0);   // тот же расчёт, что у игрока («Применить»)
            const was = e.curHp || 0;
            e.curHp = Math.max(0, was - pv.finalDmg);
            if (was > 0 && e.curHp <= 0) e.diedAtTurn = turn;          // каждому погибшему — свой момент смерти (окно «поднять труп»)
            notes.push(`${e.name} −${pv.finalDmg}${e.curHp <= 0 ? ' ☠' : ''}`);
            return e;
        }, notes => `💥 Мастер наносит ${n} (${window.StCombat.TYPE_LABEL[type] || type}) выделенным: ${notes.join(', ')}.`);
    };
    window.gmBulkHeal = function () {
        const n = Math.max(0, parseInt(el('gm-bulk-n').value) || 0);
        if (!n) return;
        gmBulkApply((e, notes) => {
            if ((e.curHp || 0) <= 0) return e;
            const was = e.curHp || 0;
            e.curHp = Math.min(e.maxHp || was, was + n);
            notes.push(`${e.name} +${e.curHp - was}`);
            return e;
        }, notes => `💚 Мастер лечит выделенных на ${n}: ${notes.join(', ')}.`);
    };
    window.gmBulkStatus = function () {
        const key = el('gm-bulk-status').value, def = GM_STATUS_EFFECTS[key];
        if (!def) return;
        const turns = Math.max(1, parseInt(el('gm-bulk-turns').value) || def.turns || 1);
        gmBulkApply((e, notes) => {
            if ((e.curHp || 0) <= 0) return e;
            const st = { id: 'st' + Date.now() + Math.random().toString(36).slice(2, 8), name: def.name, desc: def.desc, turns };
            if (def.rollPenalty) st.rollPenalty = def.rollPenalty;
            if (def.dotHp) { st.dotHp = def.dotHp; if (def.dotNoResist) st.dotNoResist = true; }
            Object.assign(st, window.StCombat.statusRule(def.name), def.rollPenalty ? { rollPenalty: def.rollPenalty } : {});
            e.statusEffects = (Array.isArray(e.statusEffects) ? e.statusEffects : []).concat([st]);
            notes.push(e.name);
            return e;
        }, notes => `🌀 Мастер накладывает «${def.name}» (${turns} х.) на: ${notes.join(', ')}.`);
    };
    window.gmBulkRemove = function () {
        gmBulkCount();
        if (!gmEnemySel.size) { alert('Сначала выдели врагов.'); return; }
        if (!confirm('Убрать выделенных врагов (' + gmEnemySel.size + ')?')) return;
        const names = [], next = (lastData.enemies || []).filter(e => { if (gmEnemySel.has(e.id)) { names.push(e.name); return false; } return true; });
        gmEnemySel.clear();
        gmUpdateEnemies(next).then(() => gmPostLogEntryText('🗑 Мастер убирает: ' + names.join(', ') + '.')).catch(err => alert('Ошибка: ' + err.message));
    };

    // Резист игрока к входящему урону атаки мастера. Раньше брался только резист по типу урона: «Сопротивление магии»
    // (перк Изменения, расовое, зачарования) не действовало на огонь/холод/электричество врагов — хотя для врагов
    // общий магический резист к стихиям прибавляется (combat-calc.js). Теперь так же и для игроков, потолок 85%.
    // shieldBlock — галочка «Игрок закрывается щитом»: перки Блокирования «Отбивание стрел» (стрела в щит — 0 урона)
    // и «Защита от стихий» (+50% к огню/холоду/электричеству). Без щита или перков галочка ничего не даёт.
    const GM_ELEM_TYPES = ['fire', 'frost', 'shock'];
    function gmPlayerIncomingResist(data, dmgType, opts) {
        const res = (data && data.resistances) || {};
        const notes = [];
        let r = res[dmgType] || 0;
        if (r) notes.push('резист ' + r + '%');
        if (opts && opts.isRangedAtk && dmgType === 'physical' && res.arrow) { r += res.arrow; notes.push('резист стрелам/болтам +' + res.arrow + '%'); }
        const elem = GM_ELEM_TYPES.indexOf(dmgType) !== -1;
        if (elem && res.magic) { r += res.magic; notes.push('сопр. магии +' + res.magic + '%'); }
        let zero = false;
        if (opts && opts.shieldBlock) {
            const hasShield = !!(data && data.equippedSlots && data.equippedSlots.shield);
            const perk = pi => !!((data && data.perkStates) || {})['skill3-perk' + pi + '-step1'];
            if (!hasShield) notes.push('щита нет — блок щитом не засчитан');
            else {
                if (opts.isRangedAtk && dmgType === 'physical' && perk(1)) { zero = true; notes.push('🏹 «Отбивание стрел»: стрела в щит — урона нет'); }
                if (elem && perk(4)) { r += 50; notes.push('🛡 «Защита от стихий» +50%'); }
                if (!zero && !(elem && perk(4))) notes.push('щит: подходящего перка Блокирования для этой атаки нет');
            }
        }
        // Иммунитет (100%) — полный; уязвимости ниже нуля не обрезаются (урон растёт), потолок 85% — как на листе игрока.
        r = (res[dmgType] || 0) >= 100 ? 100 : Math.max(-100, Math.min(85, r));
        return { resist: r, zero, notes };
    }
    function gmShieldBlockChecked() { const c = el('gm-attack-shield-block'); return !!(c && c.checked); }

    // ---------- Предпросмотр урона по игроку (1.2) ----------
    // Только читает документ игрока и считает; ничего не пишет. Случайные защиты (блок, уклонение, барьер, знак Атронаха) не учитываются.
    window.previewGmAttack = function () {
        const out = el('gm-attack-preview'); if (!out) return;
        if (!pendingGmAttack) { out.textContent = ''; return; }
        const { targetUid, dmg, dmgType } = pendingGmAttack;
        if (!dmg) { out.textContent = 'Урона нет — только эффект/статус.'; return; }
        if (pendingGmAttack.targetKind && pendingGmAttack.targetKind !== 'player') {
            const cd = gmCompanionDamage(pendingGmAttack);
            out.textContent = `Ожидаемый урон по существу: ${cd.finalDmg} (базовый ${dmg}${cd.resist ? ', защита ' + cd.resist + '%' : ''})` +
                (cd.comp ? (cd.left <= 0 ? ` → «${cd.comp.name}» погибает` : ` → останется ${cd.left}/${cd.maxHp} HP`) : '') + '.';
            return;
        }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const ir = gmPlayerIncomingResist(data, dmgType, { shieldBlock: gmShieldBlockChecked() && !pendingGmAttack.blockRolled, isRangedAtk: pendingGmAttack.isRangedAtk });
            const pv = ir.zero ? { finalDmg: 0, notes: [] } : window.StCombat.previewDamage({ resist: { [dmgType]: ir.resist } }, dmg, dmgType, 0);
            pv.notes = ir.notes.concat(pv.notes.filter(n => !/^резист/.test(n)));
            const pt = ((lastData && lastData.participants) || {})[targetUid] || {};
            const hpNow = parseInt(pt.curHp), left = isNaN(hpNow) ? null : Math.max(0, hpNow - pv.finalDmg);
            out.textContent = `Ожидаемый урон по игроку: ~${pv.finalDmg} (базовый ${dmg}${pv.notes.length ? ', ' + pv.notes.join(', ') : ''})` +
                (left === null ? '' : left <= 0 ? ` → игрок падает (HP ${hpNow}/${pt.maxHp || '?'})` : ` → останется ~${left}/${pt.maxHp || '?'} HP`) +
                '. Защиты игрока (блок, уклонение, барьер, оберег) в предпросмотре не учтены.';
            out.classList.remove('st-preview-flash'); void out.offsetWidth; out.classList.add('st-preview-flash');
        }).catch(e => { out.textContent = 'Не удалось прочитать резисты: ' + e.message; });
    };

    window.removeEnemyStatus = function (enemyId, statusId) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== enemyId || !Array.isArray(e.statusEffects)) return e;
            return { ...e, statusEffects: e.statusEffects.filter(s => s.id !== statusId) };
        });
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    // Редактирование урона/стоимости конкретного заклинания врага — раньше заклинания были
    // просто текстом, поправить их можно было только удалив и заново добавив противника.
    window.setEnemySpellField = function (id, spellIdx, field, value) {
        const enemies = (lastData.enemies || []).map(e => {
            if (e.id !== id || !Array.isArray(e.spells)) return e;
            const spells = e.spells.slice();
            spells[spellIdx] = Object.assign({}, spells[spellIdx], { [field]: Number(value) || 0 });
            return { ...e, spells };
        });
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    window.removeEnemy = function (id) {
        const enemies = (lastData.enemies || []).filter(e => e.id !== id);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
    };

    // ---------- Инициатива ----------

    // ---------- Порядок ходов (заменяет инициативу — своя система, без броска) ----------

    function renderTurnOrder(list) {
        const target = el('turn-order-list');
        if (!target) return;
        if (!list.length) { target.innerHTML = '<p style="opacity:.7;font-size:14px;">Порядок ходов не задан.</p>'; return; }
        target.innerHTML = list.map((item, i) => `
            <div class="initiative-row">
                <span>${i + 1}. ${escapeHtml(item.name || '?')}</span>
                <span style="display:flex; gap:4px;">
                    <button style="width:auto;padding:1px 8px;font-size:12px;" ${i === 0 ? 'disabled' : ''} onclick="moveTurnOrder('${item.id}', -1)">▲</button>
                    <button style="width:auto;padding:1px 8px;font-size:12px;" ${i === list.length - 1 ? 'disabled' : ''} onclick="moveTurnOrder('${item.id}', 1)">▼</button>
                    <button class="btn-danger" style="width:auto;padding:1px 8px;font-size:12px;" onclick="removeTurnOrder('${item.id}')">×</button>
                </span>
            </div>`).join('');
    }

    // Собирает список для выпадашки: игроки сессии, их призванные/поднятые существа
    // (лёгкий список имён, синхронизированный из characters/{uid}.activeSummons), и живые враги.
    function renderTurnOrderPickSelect() {
        const sel = el('turn-order-pick-select');
        if (!sel) return;
        const opts = [];
        Object.entries(lastData.participants || {}).forEach(([uid, p]) => {
            opts.push(`<option value="${escapeHtml(p.name || uid)}">🧑 ${escapeHtml(p.name || uid)}</option>`);
            (p.summonNames || []).forEach(sn => opts.push(`<option value="${escapeHtml(sn)}">👻 ${escapeHtml(sn)} (существо ${escapeHtml(p.name || uid)})</option>`));
        });
        (lastData.enemies || []).filter(e => (e.curHp || 0) > 0).forEach(e => {
            opts.push(`<option value="${escapeHtml(e.name)}">💀 ${escapeHtml(e.name)}</option>`);
        });
        sel.innerHTML = opts.length ? opts.join('') : '<option value="">— никого нет —</option>';
    }

    window.addTurnOrderFromPick = function () {
        const name = el('turn-order-pick-select').value;
        if (!name) return;
        addTurnOrderEntry(name);
    };

    window.addTurnOrderCustom = function () {
        const input = el('turn-order-name-input');
        const name = input.value.trim();
        if (!name) return;
        addTurnOrderEntry(name);
        input.value = '';
    };

    function addTurnOrderEntry(name) {
        const list = (lastData.turnOrder || []).slice();
        list.push({ id: genId('t'), name });
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    }

    window.moveTurnOrder = function (id, dir) {
        const list = (lastData.turnOrder || []).slice();
        const idx = list.findIndex(i => i.id === id);
        const swapIdx = idx + dir;
        if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
        [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    };

    window.removeTurnOrder = function (id) {
        const list = (lastData.turnOrder || []).filter(i => i.id !== id);
        db.collection('sessions').doc(currentCode).update({ turnOrder: list }).catch(e => console.error(e));
    };

    window.clearTurnOrder = function () {
        db.collection('sessions').doc(currentCode).update({ turnOrder: [] }).catch(e => console.error(e));
    };

    // Раньше у мастера вообще не было кнопки "следующий ход" — только у игроков (их собственная
    // bumpSessionTurnCounter тикает ТОЛЬКО общий счётчик, личные эффекты на листе игрока
    // decrement'ятся у НЕГО локально). Эта кнопка — для серверной части, которую контролирует
    // мастер: статус-эффекты и кулдауны криков на врагах, и общий счётчик ходов сессии (тот же
    // sessionTurnCounter, что уже используют игроки — не отдельный, чтобы не рассинхронизировать
    // окно "поднять труп только 5 ходов после смерти").
    // Обнуление общего счётчика ходов сессии — чтобы не копился бесконечно за долгую игру.
    // Честно предупреждаю: окно "труп поднимаемый только первые 5 ходов после смерти" тоже
    // завязано на этот счётчик — обнуление может повлиять на расчёт для уже лежащих трупов.
    window.resetSessionTurnCounter = function () {
        if (!confirm('Обнулить общий счётчик ходов сессии до 0? Это также повлияет на расчёт "труп поднимаемый только первые 5 ходов после смерти" для уже умерших врагов.')) return;
        db.collection('sessions').doc(currentCode).update({ sessionTurnCounter: 0, sessionRoundCounter: 0 }).catch(e => alert('Ошибка: ' + e.message));
    };

    function gmRollDotDice(d) {
        const n = Math.max(1, parseInt(d[0]) || 1), sides = Math.max(1, parseInt(d[1]) || 10);
        let sum = 0; for (let i = 0; i < n; i++) sum += 1 + Math.floor(Math.random() * sides);
        return sum;
    }
    // Один «тик» хода для врагов: яды/регенерация, длительность статусов, кулдауны криков.
    function gmEnemyTickOnce(enemiesIn, turnNow, tickLog) {
        const out = (enemiesIn || []).map(e => {
            const copy = { ...e };
            // Яды и зелья на враге: затяжной урон/снятие маны и регенерация тикают КАЖДЫЙ ход (до уменьшения длительности).
            if (Array.isArray(copy.statusEffects) && copy.statusEffects.length && (copy.curHp || 0) > 0) {
                let dHp = 0, dMp = 0;
                let poisonRes = (copy.resist && copy.resist.poison) || 0;
                copy.statusEffects.forEach(s => { if (s.res && s.res.poison) poisonRes += s.res.poison; });
                copy.statusEffects.forEach(s => {
                    // dotDice [N, грани] — урон бросается заново каждый ход («Змей: ядовитое касание» — Nd10 в начале каждого хода)
                    const dot = Array.isArray(s.dotDice) ? gmRollDotDice(s.dotDice) : s.dotHp;
                    if (dot && s.dotType && window.StCombat) dHp -= window.StCombat.previewDamage(copy, dot, s.dotType, 0).finalDmg; // горение — огнём, с резистом и уязвимостью
                    else if (dot) dHp -= Math.max(0, Math.round(dot * (s.dotNoResist ? 1 : (1 - poisonRes / 100))));
                    if (s.dotMp) dMp -= s.dotMp;
                    if (s.regenHp) dHp += s.regenHp;
                    if (s.regenMp) dMp += s.regenMp;
                });
                if (dHp || dMp) {
                    const oldHp = copy.curHp || 0, oldMp = copy.curMp || 0;
                    copy.curHp = Math.max(0, Math.min(copy.maxHp || oldHp, oldHp + dHp));
                    copy.curMp = Math.max(0, Math.min(copy.maxMp || oldMp, oldMp + dMp));
                    if (oldHp > 0 && copy.curHp <= 0) copy.diedAtTurn = turnNow || 0;
                    if (copy.curHp < oldHp) copy.statusEffects = copy.statusEffects.filter(st => !(st && (st.breakOnDamage || (window.StCombat && window.StCombat.statusRule(st.name).breakOnDamage)))); // урон по ходу тоже снимает «спадающие от урона»
                    const parts = [];
                    if (copy.curHp !== oldHp) parts.push(`${copy.curHp - oldHp > 0 ? '+' : ''}${copy.curHp - oldHp} хп`);
                    if (copy.curMp !== oldMp) parts.push(`${copy.curMp - oldMp > 0 ? '+' : ''}${copy.curMp - oldMp} маны`);
                    if (parts.length) tickLog.push(`☠ «${copy.name}»: ${parts.join(', ')} от эффектов${copy.curHp <= 0 ? ' — погибает' : ''}.`);
                }
            }
            if (Array.isArray(copy.statusEffects) && copy.statusEffects.length) {
                copy.statusEffects = copy.statusEffects
                    .map(s => ({ ...s, turns: s.turns != null ? s.turns - 1 : s.turns }))
                    .filter(s => s.turns == null || s.turns > 0);
            }
            Object.keys(copy).forEach(k => {
                if (k.indexOf('shoutCd_') === 0 && copy[k] > 0) copy[k] = copy[k] - 1;
            });
            return copy;
        });
        return out;
    }

    // Следующий ход/круг — общий для мастера и игроков (тот же механизм, что у кнопок игроков).
    // Повтор в течение 3 секунд игнорируется: если игрок только что переключил ход, второй раз не листаем.
    window.gmAdvanceTurn = function (kind) {
        if (!currentCode) return;
        kind = kind === 'round' ? 'round' : 'turn';
        const ref = db.collection('sessions').doc(currentCode);
        const now = Date.now(); let res = null;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            if (!doc.exists) throw new Error('Сессия не найдена.');
            const d = doc.data() || {};
            const la = d.lastAdvance || {};
            if (la.at && now - la.at < 3000 && now >= la.at) { res = { skipped: true, by: la.by }; return; }
            const turn = (parseInt(d.sessionTurnCounter) || 0) + (kind === 'round' ? 0 : 1);
            const round = (parseInt(d.sessionRoundCounter) || 0) + (kind === 'round' ? 1 : 0);
            tx.update(ref, {
                sessionTurnCounter: turn, sessionRoundCounter: round,
                sessionTickCounter: (parseInt(d.sessionTickCounter) || 0) + 1,
                lastAdvance: { at: now, by: 'Мастер', kind },
                combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: now, author: 'Мастер', text: kind === 'round' ? '🔄 Новый круг (круг ' + round + '). Эффекты у всех прокручиваются сами.' : '⏭️ Новый ход (ход ' + turn + '). Эффекты у всех прокручиваются сами.' })
            });
        })).then(() => { if (res && res.skipped) alert((kind === 'round' ? 'Круг' : 'Ход') + ' только что переключил(а) ' + (res.by || 'кто-то') + ' — повторно не листаю.'); })
          .catch(e => alert('Ошибка: ' + e.message));
    };

    // Тик врагов догоняет общий счётчик (кто бы ни переключил ход — мастер или игрок). Транзакция: две вкладки мастера не протикают дважды.
    let _gmTickBusy = false;
    function gmEnemyTickWatch(data) {
        { const st = el('gm-turn-status'); if (st && data) { const la = data.lastAdvance || {}; st.textContent = 'Ход ' + (parseInt(data.sessionTurnCounter) || 0) + ' · Круг ' + (parseInt(data.sessionRoundCounter) || 0) + (la.by ? ' · последним переключил(а): ' + la.by : ''); } }
        if (!currentCode || _gmTickBusy || !data) return;
        const total = parseInt(data.sessionTickCounter) || 0, done = parseInt(data.enemyTickDone) || 0;
        if (total <= done) { if (total < done) db.collection('sessions').doc(currentCode).update({ enemyTickDone: total }).catch(() => { }); return; }
        _gmTickBusy = true;
        const ref = db.collection('sessions').doc(currentCode);
        let ticks = 0;
        db.runTransaction(tx => tx.get(ref).then(doc => {
            ticks = 0;
            if (!doc.exists) return;
            const d = doc.data() || {};
            const t = parseInt(d.sessionTickCounter) || 0, dn = parseInt(d.enemyTickDone) || 0;
            if (t <= dn) return;
            ticks = Math.min(10, t - dn);
            const tickLog = [];
            let en = d.enemies || [];
            let gridNow = d.grid || null; const zoneHits = [];
            for (let i = 0; i < ticks; i++) {
                en = gmEnemyTickOnce(en, parseInt(d.sessionTurnCounter) || 0, tickLog);
                // длительные зоны на боевой сетке (плащи, ауры, стены, круги): бьют тех, кто внутри
                if (gridNow && window.GmGrid && window.GmGrid.zoneTick && Object.keys(gridNow.zones || {}).length) {
                    const zt = window.GmGrid.zoneTick(Object.assign({}, d, { grid: gridNow }), en);
                    en = zt.enemies; gridNow = zt.grid; tickLog.push(...zt.logs); zoneHits.push(...zt.hits);
                }
            }
            const patch = { enemies: stripUndefinedDeep(en), enemyTickDone: t };
            if (gridNow && gridNow !== d.grid) patch.grid = stripUndefinedDeep(gridNow);
            if (zoneHits.length && window.GmGrid) Object.assign(patch, window.GmGrid.hitsPatch(zoneHits));
            if (tickLog.length) patch.combatLog = firebase.firestore.FieldValue.arrayUnion(...tickLog.map((x, i) => ({ ts: Date.now() + i + 1, author: 'Мастер', text: x })));
            tx.update(ref, patch);
        })).then(() => {
            const fired = [];
            for (let i = 0; i < ticks; i++) fired.push(...gmTickTimers());
            if (fired.length) gmPostLogEntryText('⏰ Сработало событие: ' + fired.join('; '));
        }).catch(e => console.error('Тик врагов:', e)).finally(() => { _gmTickBusy = false; });
    }

    // ---------- Боевой журнал ----------

    // Шёпот от игроков — приватная панель, НЕ смешивается с общим боевым журналом.
    // Переписка: входящие (whispers, от игроков) и исходящие (gmWhispers, твои ответы) вперемешку по времени.
    function renderWhispers(whispers, gmWhispers) {
        const target = el('gm-whispers-list');
        if (!target) return;
        const items = (whispers || []).map(w => ({ ...w, dir: 'in' }))
            .concat((gmWhispers || []).map(w => ({ ...w, dir: 'out' })))
            .sort((a, b) => (a.ts || 0) - (b.ts || 0));
        if (!items.length) {
            target.innerHTML = '<p style="opacity:.6; font-size:13px;">Пока ничего не нашёптано.</p>';
            return;
        }
        target.innerHTML = items.map(w => {
            const time = w.ts ? new Date(w.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            if (w.dir === 'out') {
                return '<div class="log-entry" style="opacity:.85;"><span class="log-time">' + time + '</span><span class="log-author">Ты → ' + escapeHtml(w.toName || '?') + ':</span> ' + escapeHtml(w.text || '') + '</div>';
            }
            // Ответить можно по fromUid; у старых шёпотов (до этой правки) uid нет — ищем игрока по имени.
            let uid = w.fromUid;
            if (!uid) {
                const parts = lastData.participants || {};
                uid = Object.keys(parts).find(u => (parts[u] || {}).name === w.author) || '';
            }
            const reply = uid ? ' <button style="width:auto; padding:0 6px; font-size:11px;" onclick="replyToWhisper(\'' + jsq(uid) + '\')">↩ ответить</button>' : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(w.author || '?') + ':</span> ' + escapeHtml(w.text || '') + reply + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    function populateGmWhisperTarget() {
        const sel = el('gm-whisper-target');
        if (!sel) return;
        const parts = lastData.participants || {};
        const uids = Object.keys(parts);
        const prev = sel.value;
        sel.innerHTML = uids.length
            ? uids.map(u => `<option value="${escapeHtml(u)}">${escapeHtml((parts[u] || {}).name || u)}</option>`).join('')
            : '<option value="">Нет игроков</option>';
        if (uids.includes(prev)) sel.value = prev;
    }

    window.replyToWhisper = function (uid) {
        const sel = el('gm-whisper-target');
        if (sel) sel.value = uid;
        const inp = el('gm-whisper-input');
        if (inp) inp.focus();
    };

    window.sendGmWhisper = function () {
        const uid = el('gm-whisper-target').value;
        const text = (el('gm-whisper-input').value || '').trim();
        if (!uid) { alert('Выбери игрока.'); return; }
        if (!text) return;
        const toName = ((lastData.participants || {})[uid] || {}).name || uid;
        db.collection('sessions').doc(currentCode).update({
            gmWhispers: firebase.firestore.FieldValue.arrayUnion({
                id: 'gw-' + Date.now() + Math.random().toString(36).slice(2, 8), // уникальный id — arrayUnion иначе схлопнул бы два одинаковых ответа подряд
                ts: Date.now(), toUid: uid, toName: toName, text: text
            })
        }).then(() => { el('gm-whisper-input').value = ''; }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Enter в поле ответа — отправить.
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && ev.target && ev.target.id === 'gm-whisper-input') window.sendGmWhisper();
    });

    window.clearWhispers = function () {
        if (!confirm('Очистить все шёпоты от игроков?')) return;
        db.collection('sessions').doc(currentCode).update({ whispers: [], gmWhispers: [] }).catch(e => console.error(e));
    };

    function renderLog(log) {
        const target = el('gm-combat-log');
        target.innerHTML = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
            return '<div class="log-entry"><span class="log-time">' + time + '</span><span class="log-author">' + escapeHtml(entry.author || '?') + ':</span> ' + escapeHtml(entry.text || '') + '</div>';
        }).join('');
        target.scrollTop = target.scrollHeight;
    }

    // Мост для модуля боевой сетки (gm-grid.js): доступ к базе, текущей сессии и готовым функциям мастера.
    window.GmBridge = {
        db: () => db, code: () => currentCode, data: () => lastData,
        log: t => gmPostLogEntryText(t),
        updateEnemies: list => gmUpdateEnemies(list),
        updateVitals: (uid, fn) => updateCharacterVitals(uid, fn),
        enemyDmg: e => { try { return enemyWeaponDamage(e).total; } catch (x) { return e && e.weaponDmg || 0; } },
        strip: o => stripUndefinedDeep(o)
    };
    function gmPostLogEntryText(text) {
        if (!text || !currentCode) return;
        db.collection('sessions').doc(currentCode).update({
            combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: text })
        }).catch(e => console.error(e));
    }

    window.gmPostLogEntry = function () {
        const input = el('gm-log-input');
        const text = (input.value || '').trim();
        if (!text) return;
        gmPostLogEntryText(text);
        input.value = '';
    };

    window.clearLog = function () {
        if (!confirm('Очистить весь боевой журнал?')) return;
        db.collection('sessions').doc(currentCode).update({ combatLog: [] }).catch(e => console.error(e));
    };

    // Экспорт журнала боя в текстовый файл — для протокола сессии (техдолг, пункт "экспорт
    // боевого журнала"). Берёт lastData.combatLog — тот же массив, что уже отрендерен на экране,
    // никакого отдельного запроса к Firestore не нужно.
    window.exportCombatLogToFile = function () {
        const log = (lastData && lastData.combatLog) || [];
        if (!log.length) { alert('Журнал пуст — нечего экспортировать.'); return; }
        const lines = log.map(entry => {
            const time = entry.ts ? new Date(entry.ts).toLocaleString('ru-RU') : '';
            return `[${time}] ${entry.author || '?'}: ${entry.text || ''}`;
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boevoy_zhurnal_${currentCode || 'sessiya'}_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    el('gm-log-input') && el('gm-log-input').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') window.gmPostLogEntry();
    });

    // ---------- Инициализация ----------
    if (window.FIREBASE_CONFIGURED) {
        initAuth();
    } else {
        showOverlay(false);
        console.warn('Firebase не настроен — см. README-FIREBASE.md');
    }
