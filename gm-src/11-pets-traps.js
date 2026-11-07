
    // ---------- Животные и питомцы мастера ----------
    // Свои шаблоны — в gmPresets/{uid}.pets (переживают сессии); в текущую сессию копируются в sessions/{code}.customPets,
    // откуда их видят продавцы у игроков. Выдача — командой в лист игрока (gmCmds, тип 'pet'), как другие правки.
    let _gmPets = [];
    function gmPetAllTemplates() { return (window.PET_TEMPLATES || []).map(t => Object.assign({ builtIn: true }, t, { hp: t.hp })).concat(_gmPets); }
    function gmPetsPublish() {
        if (!currentCode) return;
        const cur = JSON.stringify((lastData && lastData.customPets) || []);
        if (cur === JSON.stringify(_gmPets)) return;
        db.collection('sessions').doc(currentCode).update({ customPets: stripUndefinedDeep(_gmPets) }).catch(e => console.error('customPets:', e));
    }
    function gmRenderPetSelect() {
        const sel = el('gm-pet-select'); if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">— новое животное —</option>' + gmPetAllTemplates().map(t => `<option value="${escapeHtml(t.id)}">${t.icon || '🐾'} ${escapeHtml(t.name)}${t.builtIn ? ' (стандартное)' : ''} — ${parseInt(t.price) || 0} зол.</option>`).join('');
        if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
        const ps = el('gm-pet-give-player');
        if (ps) { const p0 = ps.value; const parts = (lastData && lastData.participants) || {}; ps.innerHTML = Object.keys(parts).map(u => `<option value="${u}">${escapeHtml(parts[u].name || u)}</option>`).join('') || '<option value="">Нет игроков</option>'; if (parts[p0]) ps.value = p0; }
    }
    window.gmRenderPetSelect = gmRenderPetSelect;
    window.gmPetPicked = function () {
        const t = gmPetAllTemplates().find(x => x.id === el('gm-pet-select').value);
        el('gm-pet-name').value = t ? t.name : ''; el('gm-pet-icon').value = t ? (t.icon || '') : '';
        el('gm-pet-hp').value = t ? (parseInt(t.hp) || 1) : 50; el('gm-pet-price').value = t ? (parseInt(t.price) || 0) : 300;
        el('gm-pet-sellers').value = t ? (t.sellers || []).map(s => s.place || s.city || s.hold).filter(Boolean).join(', ') : '';
        el('gm-pet-loot').value = t ? (t.loot || []).map(l => l.name + ((l.qty || 1) > 1 ? ' × ' + l.qty : '')).join('\n') : '';
        el('gm-pet-rideable').checked = !!(t && t.rideable);
        el('gm-pet-msg').innerHTML = t && t.builtIn ? '<span style="opacity:.75;">Стандартное животное: правки сохранятся как твоё новое (стандартное не меняется).</span>' : '';
    };
    window.gmPetNew = function () { el('gm-pet-select').value = ''; window.gmPetPicked(); el('gm-pet-name').focus(); };
    function gmPetFromForm(id) {
        const name = (el('gm-pet-name').value || '').trim();
        if (!name) { alert('Укажи название.'); return null; }
        const loot = (el('gm-pet-loot').value || '').split('\n').map(line => {
            const m = /^\s*(.+?)(?:\s*[×xх*]\s*(\d+))?\s*$/i.exec(line); if (!m || !m[1].trim()) return null;
            return { name: m[1].trim(), qty: Math.max(1, parseInt(m[2]) || 1) };
        }).filter(Boolean);
        const sellers = (el('gm-pet-sellers').value || '').split(',').map(x => x.trim()).filter(Boolean).map(place => ({ place, who: 'Продавец: ' + name }));
        return { id, icon: (el('gm-pet-icon').value || '🐾').trim(), name, kind: name, hp: Math.max(1, parseInt(el('gm-pet-hp').value) || 1),
            price: Math.max(0, parseInt(el('gm-pet-price').value) || 0), sellers, loot, rideable: el('gm-pet-rideable').checked, custom: true };
    }
    window.gmPetSave = function () {
        const cur = _gmPets.find(x => x.id === el('gm-pet-select').value);
        const t = gmPetFromForm(cur ? cur.id : 'cpet-' + Date.now().toString(36)); if (!t) return;
        const i = _gmPets.findIndex(x => x.id === t.id);
        if (i === -1) _gmPets.push(t); else _gmPets[i] = t;
        const ref = gmPresetsRef(); if (!ref) { alert('Не авторизован.'); return; }
        ref.set({ pets: stripUndefinedDeep(_gmPets), updatedAt: Date.now() }, { merge: true }).then(() => {
            gmPetsPublish(); gmRenderPetSelect(); el('gm-pet-select').value = t.id;
            el('gm-pet-msg').innerHTML = '<span style="color:#2ecc71;">💾 Сохранено' + (currentCode ? ' и доступно игрокам в этой сессии' : '') + '.</span>';
        }).catch(e => alert('Ошибка: ' + e.message + (/permission/i.test(e.message) ? ' (нужен блок gmPresets в firestore.rules)' : '')));
    };
    window.gmPetDelete = function () {
        const id = el('gm-pet-select').value; const t = _gmPets.find(x => x.id === id);
        if (!t) { alert('Удалить можно только своё животное (стандартные не удаляются).'); return; }
        if (!confirm('Удалить «' + t.name + '»? У игроков, которые его уже купили, оно останется.')) return;
        _gmPets = _gmPets.filter(x => x.id !== id);
        const ref = gmPresetsRef(); if (!ref) return;
        ref.set({ pets: stripUndefinedDeep(_gmPets), updatedAt: Date.now() }, { merge: true }).then(() => { gmPetsPublish(); gmRenderPetSelect(); window.gmPetNew(); });
    };
    window.gmPetGive = function () {
        const uid = el('gm-pet-give-player').value;
        const sel = el('gm-pet-select').value;
        const t = sel ? gmPetAllTemplates().find(x => x.id === sel) : gmPetFromForm('cpet-' + Date.now().toString(36));
        if (!uid || !t) { alert('Выбери игрока и животное.'); return; }
        const pet = stripUndefinedDeep({ id: t.id, icon: t.icon, name: t.name, kind: t.kind || t.name, hp: parseInt(t.hp) || 1, loot: t.loot || [], rideable: !!t.rideable });
        db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'pet', pet }) })
            .then(() => {
                const pname = (((lastData || {}).participants || {})[uid] || {}).name || 'игрок';
                gmPostLogEntryText(`🐾 Мастер дарит ${pname}: ${t.icon || ''} ${t.name}.`);
                el('gm-pet-msg').innerHTML = '<span style="color:#2ecc71;">🎁 Выдано — появится у игрока во вкладке «Инвентарь» → «Животные».</span>';
            }).catch(e => alert('Ошибка: ' + e.message));
    };
    // Животные выбранного в панели инвентаря игрока: ХП ± (команда petHp), чтобы ранить/лечить/убить.
    // Эффекты на игроке: вредное (болезнь, яд, статус) игрок сам не снимает — это делает мастер.
    function renderGmPlayerEffects(effects) {
        const box = el('inv-effects-list'); if (!box) return;
        const list = (Array.isArray(effects) ? effects : []).filter(e => e && (e.turnsRemaining === null || e.turnsRemaining === undefined || e.turnsRemaining !== 0));
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Нет активных эффектов.</p>'; return; }
        box.innerHTML = list.map(e => `<div style="display:flex; justify-content:space-between; gap:6px; align-items:center; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span>${escapeHtml(e.effectName || e.name || '?')}${e.name && e.effectName && e.name !== e.effectName ? ' <span style="opacity:.6;">(' + escapeHtml(e.name) + ')</span>' : ''}</span>
            <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmRemovePlayerEffect('${jsq(e.id || '')}', '${jsq(e.effectName || e.name || '')}')">Снять</button></div>`).join('');
    }
    window.gmRemovePlayerEffect = function (effId, name) {
        gmSendCmd({ type: 'removeEffect', effId: effId || null, name: name || '' }, 'снимает с {p} эффект «' + name + '».');
    };
    function renderGmPlayerPets(pets) {
        const box = el('inv-pets-list'); if (!box) return;
        const list = Array.isArray(pets) ? pets : [];
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Нет животных.</p>'; return; }
        box.innerHTML = list.map(p => `<div style="display:flex; justify-content:space-between; gap:6px; align-items:center; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span>${p.icon || '🐾'} ${escapeHtml(p.name)} — ${p.dead ? '☠ погиб' + (p.looted ? ', обыскан' : '') : `ХП ${p.hp}/${p.maxHp}`}</span>
            ${p.dead ? '' : `<span style="display:flex; gap:4px;"><input type="number" id="pet-dmg-${escapeHtml(p.id)}" value="10" min="1" style="width:60px;">
            <button class="btn-danger" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmPetHp('${jsq(p.id)}', -1)">−ХП</button>
            <button class="btn-success" style="width:auto; padding:1px 6px; font-size:12px;" onclick="gmPetHp('${jsq(p.id)}', 1)">+ХП</button></span>`}</div>`).join('');
    }
    window.gmPetHp = function (petId, sign) {
        if (!currentInvPlayerUid) return;
        const n = Math.max(1, parseInt((el('pet-dmg-' + petId) || {}).value) || 1);
        db.collection('characters').doc(currentInvPlayerUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId, delta: sign * n }) })
            .catch(e => alert('Ошибка: ' + e.message));
    };
    window.renderDungeonPanel = renderDungeonPanel;


    // ========================================================================
    // ЛОВУШКИ (traps-data.js). Поставленные ловушки — sessions/{code}.placedTraps:
    // { id, type, label, state: ready|active|cooldown|disarmed|off, left, victims: [uid], ignited, axes }.
    // Срабатывание = команда 'trap' в лист каждого задетого игрока (gmCmds): лист сам бросает спасброски от своей
    // настоящей Ловкости, режет урон своими сопротивлениями и пишет итог в журнал. Ловушки «каждый ход»
    // бьют автоматически, когда общий счётчик ходов (sessionTickCounter) уходит вперёд.
    // ========================================================================
    const trapType = id => (window.TRAP_TYPES || []).find(t => t.id === id) || null;
    const trapsArr = () => Array.isArray(lastData && lastData.placedTraps) ? lastData.placedTraps : [];
    function gmTrapCmdFor(t, opts) {
        opts = opts || {};
        const cmd = { type: 'trap', trapName: t.name, icon: t.icon, hits: [], note: t.note || '' };
        if (t.id === 'axes') { cmd.save = { stat: 'dex', dc: (t.save || {}).dc || 10, count: Math.max(1, parseInt(opts.axes) || t.defaultAxes || 3), failHit: { dmg: t.axeDmg || 30, type: 'physical' } }; }
        else if (t.id === 'tar') cmd.hits = opts.ignite ? (t.igniteHits || []) : [];
        else if (t.id === 'lamp' && opts.radius) cmd.hits = t.radiusHits || [];
        else if (opts.perTurn && t.perTurn) cmd.hits = t.perTurn.hits;
        else if (opts.perTurn && t.perTurnIgnited) cmd.hits = t.perTurnIgnited.hits;
        else cmd.hits = t.hits || [];
        if (t.knockback) cmd.knockback = t.knockback;
        if (t.alarm) cmd.alarm = true;
        if (t.id === 'tar' && !opts.ignite) cmd.note = 'Смола: ноги вязнут (урона нет, пока не подожгли).';
        return cmd;
    }
    function gmSendTrapCmd(uid, cmd) {
        const full = Object.assign({ id: 'gmc-t' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now() }, cmd);
        return db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion(stripUndefinedDeep(full)) }).catch(e => console.error('trap cmd:', e));
    }
    function gmSaveTraps(list) {
        if (!currentCode) return Promise.resolve();
        return db.collection('sessions').doc(currentCode).update({ placedTraps: stripUndefinedDeep(list) }).catch(e => alert('Ошибка: ' + e.message));
    }
    window.gmTrapTypeInfo = function () {
        const t = trapType((el('gm-trap-type') || {}).value); const box = el('gm-trap-type-info'); if (!box) return;
        box.textContent = t ? (t.note || '') + (t.knockback ? ` Отбрасывает на ${t.knockback} фт.` : '') : '';
    };
    window.gmPlaceTrap = function () {
        if (!currentCode) { alert('Сначала войди в сессию.'); return; }
        const t = trapType(el('gm-trap-type').value); if (!t) return;
        const label = (el('gm-trap-label').value || '').trim();
        const list = trapsArr().concat([{ id: 'trap-' + Date.now().toString(36), type: t.id, label, state: 'ready', left: 0, victims: [], ignited: false, axes: t.defaultAxes || null }]);
        el('gm-trap-label').value = '';
        gmSaveTraps(list).then(() => gmPostLogEntryText(`🪤 Мастер ставит ловушку: ${t.icon} ${t.name}${label ? ' (' + label + ')' : ''}.`));
    };
    window.gmRemoveTrap = function (id) { gmSaveTraps(trapsArr().filter(x => x.id !== id)); };
    window.gmTrapSetField = function (id, field, value) {
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { [field]: value }) : x));
    };
    function gmTrapVictims(id, kind) {
        return Array.from(document.querySelectorAll(`input[data-trap="${id}"][data-kind="${kind || 'main'}"]:checked`)).map(c => c.value);
    }
    // Состояние ловушки после срабатывания (кнопка «Сработала» или проваленное обезвреживание).
    function gmTrapStateAfterTrigger(t, tr) {
        if (t.perTurn) return { state: 'active', left: t.perTurn.activeTurns || 0 }; // 0 = бьёт, пока не заберут камень
        if (t.id === 'tar' && tr.ignited) return { state: 'active', left: 0 };
        return { state: t.id === 'tar' ? 'ready' : 'off', left: 0 }; // разовые ловушки после срабатывания — разряжены
    }
    window.gmTriggerTrap = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        const t = trapType(tr.type); if (!t) return;
        if (tr.state === 'disarmed' || tr.state === 'off') { alert('Эта ловушка уже обезврежена/выключена.'); return; }
        if (tr.state === 'cooldown') { alert(`Ловушка перезаряжается: ещё ${tr.left} ход(ов).`); return; }
        const victims = gmTrapVictims(id), around = t.id === 'lamp' ? gmTrapVictims(id, 'radius') : [];
        if (!victims.length && !around.length) { alert('Отметь, на ком сработала ловушка.'); return; }
        const parts = (lastData && lastData.participants) || {};
        const names = u => (parts[u] || {}).name || 'игрок';
        victims.forEach(u => gmSendTrapCmd(u, gmTrapCmdFor(t, { axes: tr.axes, ignite: tr.ignited })));
        around.forEach(u => gmSendTrapCmd(u, gmTrapCmdFor(t, { radius: true })));
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, tr, gmTrapStateAfterTrigger(t, tr), { victims: victims.slice() }) : x));
        gmPostLogEntryText(`🪤 Срабатывает ${t.icon} ${t.name}${tr.label ? ' (' + tr.label + ')' : ''}: ${victims.map(names).join(', ')}${around.length ? (victims.length ? '; рядом — ' : 'рядом — ') + around.map(names).join(', ') : ''}.${t.alarm ? ' 🔔 Враги знают, где вы!' : ''}`);
    };
    window.gmIgniteTar = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { ignited: true }) : x)).then(() => gmPostLogEntryText('🔥 Смола подожжена!'));
    };
    window.gmTrapClearZone = function (id) { gmTrapSetField(id, 'victims', []); };
    window.gmTrapRearm = function (id) { gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { state: 'ready', left: 0, victims: [] }) : x)); };
    // Игрок пытается обезвредить: бросок на его листе (d20 + мод. Ловкости против сложности), провал — срабатывает на нём.
    window.gmTrapDisarmBy = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        if (tr.state === 'disarmed' || tr.state === 'off') { alert('Эта ловушка уже обезврежена или разряжена — обезвреживать нечего.'); return; }
        const t = trapType(tr.type); const uid = (el('gm-trap-disarm-' + id) || {}).value; if (!uid) { alert('Выбери игрока.'); return; }
        const dc = t.disarmDc || parseInt((el('gm-trap-dc-' + id) || {}).value) || 15;
        gmSendTrapCmd(uid, { type: 'trapDisarm', trapId: id, trapName: t.name, icon: t.icon, dc, onFail: gmTrapCmdFor(t, { axes: tr.axes, ignite: tr.ignited }), failState: gmTrapStateAfterTrigger(t, tr) });
        gmPostLogEntryText(`🪤 ${(((lastData || {}).participants || {})[uid] || {}).name || 'Игрок'} пытается обезвредить «${t.name}» (сл. ${dc}).`);
    };
    window.gmTrapTakeStone = function (id) {
        const tr = trapsArr().find(x => x.id === id); if (!tr) return;
        const t = trapType(tr.type); const uid = (el('gm-trap-disarm-' + id) || {}).value; if (!uid) { alert('Выбери игрока, который забирает камень.'); return; }
        const proto = gmFindItemByName(t.stone) || { name: t.stone, category: 'Камни душ', weight: 0.5, price: 100 };
        gmTxInventory(uid, inv => {
            const ex = inv.find(x => x.itemId === proto.name);
            if (ex) ex.count = (ex.count || 0) + 1; else inv.push({ itemId: proto.name, name: proto.name, count: 1, weight: proto.weight || 0.5, category: proto.category || 'Камни душ', effect: proto.effect || '', price: proto.price || 0 });
        }).then(() => {
            gmSaveTraps(trapsArr().map(x => x.id === id ? Object.assign({}, x, { state: 'off', victims: [] }) : x));
            gmPostLogEntryText(`💎 ${(((lastData || {}).participants || {})[uid] || {}).name || 'Игрок'} забирает камень с пьедестала — кристалл душ гаснет.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };
    function renderGmTraps() {
        const sel = el('gm-trap-type'), box = el('gm-traps-list'); if (!sel || !box) return;
        if (!sel.options.length) { sel.innerHTML = (window.TRAP_TYPES || []).map(t => `<option value="${t.id}">${t.icon} ${escapeHtml(t.name)}</option>`).join(''); window.gmTrapTypeInfo(); }
        const parts = (lastData && lastData.participants) || {};
        const uids = Object.keys(parts);
        const keepChecks = {}; box.querySelectorAll('input[data-trap]:checked').forEach(c => { keepChecks[c.dataset.trap + '|' + c.dataset.kind + '|' + c.value] = true; });
        const STATE = { ready: '🟢 готова', active: '🔴 бьёт', cooldown: '⏳ перезарядка', disarmed: '✔ обезврежена', off: '⚪ разряжена' };
        const list = trapsArr();
        box.innerHTML = list.length ? list.map(tr => {
            const t = trapType(tr.type) || { icon: '🪤', name: tr.type };
            const st = STATE[tr.state] || tr.state;
            const left = tr.state === 'active' && tr.left ? ` (${tr.left} ход.)` : tr.state === 'cooldown' ? ` (${tr.left} ход.)` : '';
            const checks = (kind, label) => `<div style="font-size:12px;">${label} ${uids.map(u => `<label style="display:inline; margin-right:8px; font-weight:normal;"><input type="checkbox" style="width:auto;" data-trap="${tr.id}" data-kind="${kind}" value="${u}" ${keepChecks[tr.id + '|' + kind + '|' + u] || (kind === 'main' && (tr.victims || []).indexOf(u) !== -1) ? 'checked' : ''}> ${escapeHtml(parts[u].name || u)}</label>`).join('') || '<span style="opacity:.6;">нет игроков</span>'}</div>`;
            return `<div class="party-row" style="padding:6px 8px;">
                <div class="row-name"><span>${t.icon} <strong>${escapeHtml(t.name)}</strong>${tr.label ? ' <span style="opacity:.7;">— ' + escapeHtml(tr.label) + '</span>' : ''}</span><span>${st}${left}</span></div>
                ${checks('main', t.id === 'lamp' ? 'В центре:' : (t.perTurn || t.id === 'tar' ? 'В зоне:' : 'Задеты:'))}
                ${t.id === 'lamp' ? checks('radius', 'В радиусе:') : ''}
                <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px; align-items:center;">
                    ${t.id === 'axes' ? `<label style="font-size:12px; margin:0;">Секир: <input type="number" min="1" max="10" value="${tr.axes || 3}" style="width:56px;" onchange="gmTrapSetField('${tr.id}','axes',parseInt(this.value)||1)"></label>` : ''}
                    ${t.id === 'tar' && !tr.ignited ? `<button style="width:auto; padding:2px 8px;" onclick="gmIgniteTar('${tr.id}')">🔥 Поджечь</button>` : ''}
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmTriggerTrap('${tr.id}')">💥 Сработала</button>
                    ${(t.perTurn || t.id === 'tar') ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapClearZone('${tr.id}')" title="Все вышли из зоны">🚶 Никого в зоне</button>` : ''}
                    ${tr.state === 'off' || tr.state === 'disarmed' ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapRearm('${tr.id}')">↺ Взвести</button>` : ''}
                    <select id="gm-trap-disarm-${tr.id}" style="width:auto; font-size:12px;">${uids.map(u => `<option value="${u}">${escapeHtml(parts[u].name || u)}</option>`).join('')}</select>
                    ${t.stone ? `<button style="width:auto; padding:2px 8px;" onclick="gmTrapTakeStone('${tr.id}')">💎 Забрать камень</button>` : ''}
                    ${t.disarmDc ? '' : `<select id="gm-trap-dc-${tr.id}" style="width:auto; font-size:12px;">${Object.keys(window.TRAP_DISARM_TIERS || {}).map(k => `<option value="${window.TRAP_DISARM_TIERS[k].dc}" ${k === 'adept' ? 'selected' : ''}>${window.TRAP_DISARM_TIERS[k].label} (сл. ${window.TRAP_DISARM_TIERS[k].dc})</option>`).join('')}</select>`}
                    <button style="width:auto; padding:2px 8px;" onclick="gmTrapDisarmBy('${tr.id}')">🛠 Обезвредить${t.disarmDc ? ' (Лов сл. ' + t.disarmDc + ')' : ''}</button>
                    <button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmRemoveTrap('${tr.id}')">✕</button>
                </div></div>`;
        }).join('') : '<p style="opacity:.6; font-size:13px;">Ловушек в сцене нет.</p>';
    }
    // Ход ловушек: бьющие каждый ход ловушки бьют стоящих в зоне; огненный столб после 4 ходов — 10 ходов перезарядки.
    let _gmTrapTickBusy = false;
    function gmTrapsTickWatch(d) {
        if (!currentCode || !d || _gmTrapTickBusy) return;
        const tick = parseInt(d.sessionTickCounter) || 0, done = parseInt(d.trapsTick) || 0;
        if (tick <= done) return;
        const list = Array.isArray(d.placedTraps) ? d.placedTraps : [];
        if (!list.some(x => x.state === 'active' || x.state === 'cooldown')) {
            if (tick > done) db.collection('sessions').doc(currentCode).update({ trapsTick: tick }).catch(() => { });
            return;
        }
        _gmTrapTickBusy = true;
        const ref = db.collection('sessions').doc(currentCode);
        const sends = [];
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const dd = doc.data() || {};
            const t0 = parseInt(dd.sessionTickCounter) || 0, d0 = parseInt(dd.trapsTick) || 0;
            if (t0 <= d0) return;
            sends.length = 0;
            const next = (Array.isArray(dd.placedTraps) ? dd.placedTraps : []).map(tr => {
                const t = trapType(tr.type); if (!t) return tr;
                const x = Object.assign({}, tr);
                for (let k = d0; k < t0; k++) {
                    if (x.state === 'active') {
                        (x.victims || []).forEach(u => sends.push([u, gmTrapCmdFor(t, { perTurn: true, ignite: x.ignited })]));
                        if (t.perTurn && t.perTurn.activeTurns) { x.left = (x.left || 0) - 1; if (x.left <= 0) { x.state = 'cooldown'; x.left = t.perTurn.cooldownTurns || 0; x.victims = []; } }
                    } else if (x.state === 'cooldown') {
                        x.left = (x.left || 0) - 1; if (x.left <= 0) { x.state = 'ready'; x.left = 0; }
                    }
                }
                return x;
            });
            tx.update(ref, { placedTraps: stripUndefinedDeep(next), trapsTick: t0 });
        })).then(() => { sends.forEach(([u, c]) => gmSendTrapCmd(u, c)); if (sends.length) gmPostLogEntryText(`🪤 Ход ловушек: ${sends.length} удар(ов) по стоящим в зоне.`); })
          .catch(e => console.error('traps tick:', e)).finally(() => { _gmTrapTickBusy = false; });
    }

    document.addEventListener('DOMContentLoaded', initGmSectionAccordions);
    if (document.readyState !== 'loading') initGmSectionAccordions();

