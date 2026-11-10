
    // ---------- Ветка культиста (cultist-data.js): перки выдаёт мастер ----------
    function gmCultPanelHtml(s) {
        const c = s.cult, gods = window.CULT_GODS || {}, d = c && c.god ? gods[c.god] : null;
        let h = `<div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-color);"><strong>🕯 Путь культиста${d ? ' — ' + escapeHtml(d.name) : ''}</strong>`;
        h += `<p style="font-size:12px; opacity:.75; margin:4px 0;">Принц определяется верой игрока (он должен верить в Принца Даэдра, не быть лича/паладином). Перки: 5, 15, 25 и 40 ур., заданий жителей 0/15/25/40, 1 очко перков за каждый. Игрок раз в 2 недели несёт подношение; деяния подтверждаете вы.</p>`;
        const names = d ? d.perks.map(p => p.name) : ['Перк 1 (5 ур.)', 'Перк 2 (15 ур.)', 'Перк 3 (25 ур.)', 'Перк 4 (40 ур.)'];
        const lvls = [5, 15, 25, 40];
        names.forEach((nm, i) => {
            const owned = !!(c && c.perks && c.perks[i]);
            h += `<div style="font-size:12px; margin-top:5px;">${owned ? '✅' : '▫️'} <strong>${escapeHtml(nm)}</strong> (${lvls[i]} ур.)${d ? ' — ' + escapeHtml(d.perks[i].desc) : ''}<br>` +
                (owned ? `<button class="btn-danger" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmCultAdmin('revoke', ${i})">Снять (и следующие)</button>`
                       : `<button class="btn-success" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmCultGrant(${i})">Выдать (спишется очко)</button>`) + `</div>`;
        });
        if (c && c.god) {
            h += `<div style="font-size:12px; margin-top:8px;">Состояние: <strong>${c.fallen ? 'пал (' + escapeHtml(c.fallReason || '') + ')' : c.banned ? 'нарушен запрет' : 'в силе'}</strong> · Метка: <strong>${c.veil ? 'скрыта (Покров)' : 'видна'}</strong>${d ? '<br>Запрет: ' + escapeHtml(d.ban) : ''}</div>`;
            h += `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('offer')">✔ Принять подношение (деяние)</button>` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('ban')">⛔ Нарушил запрет</button>` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('unban')">Простить нарушение</button>` +
                (c.fallen && !c.penanceUsed ? `<button style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('penance')">Искупление принято (−1000)</button>` : '') + // только павшему и один раз
                `<button style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('veil', ${c.veil ? 0 : 1})">${c.veil ? 'Снять Покров' : 'Выдать Покров (скрыть Метку)'}</button>` +
                `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmCultAdmin('reset')">Сбросить ветку</button></div>`;
        }
        return h + `</div>`;
    }
    window.gmCultPanelHtml = gmCultPanelHtml;
    window.gmCultGrant = function (i) {
        if (!currentInvPlayerUid) { alert('Выбери игрока.'); return; }
        const lvls = [5, 15, 25, 40], lvl = (currentPlayerInvData && currentPlayerInvData.characterLevel) || 1;
        if (lvl < lvls[i]) { alert(`Нужен ${lvls[i]}-й уровень, сейчас ${lvl}.`); return; }
        if (!confirm('Выдать перк культиста? У игрока спишется 1 очко перков (проверит ли он сам, что вера и задания подходят).')) return;
        gmSendCmd({ type: 'cultPerk', perk: i }, '{p}: перк культиста отправлен (если игрок не подходит, ответ придёт в журнал).').then(ok => { if (ok) setTimeout(renderSupernaturalPanel, 600); });
    };
    window.gmCultAdmin = function (op, arg) {
        if (op === 'reset' && !confirm('Сбросить ветку культиста целиком? Все перки снимутся, очки вернутся.')) return;
        if (op === 'revoke' && !confirm('Снять этот перк и все следующие? Очки вернутся игроку.')) return;
        if (op === 'offer' && !confirm('Деяние подношения выполнено? (У Клавикуса с игрока спишется золото.)')) return;
        if (op === 'penance' && !confirm('Искупление принято? С игрока спишется 1000 септимов.')) return;
        const cmd = { type: 'cultAdmin', op };
        if (op === 'revoke') cmd.perk = arg; if (op === 'veil') cmd.on = !!arg;
        gmSendCmd(cmd, { offer: '{p}: подношение принято мастером.', ban: '{p} нарушил запрет Принца.', unban: '{p}: нарушение прощено.', penance: '{p} искупил вину перед Принцем.' }[op] || null).then(ok => { if (ok) setTimeout(renderSupernaturalPanel, 600); });
    };

    // ---------- Ветка «Рыцарь смерти (лич)» ----------
    function gmLichPanelHtml(s) {
        const l = s.lich;
        const perks = window.LICH_PERKS || [];
        const have = l ? perks.filter(p => l.perks && l.perks[p.id]) : [];
        let h = `<div style="margin-top:12px; padding-top:8px; border-top:1px solid var(--border-color);"><strong>☠ Ветка лича</strong>`;
        h += `<p style="font-size:12px; opacity:.75; margin:4px 0;">Перки выдаются после отыгранного ритуала: игрок отдаёт невинные души (чёрные камни), вы вычёркиваете их у себя и жмёте кнопку. Очко перков и уровень проверяются у игрока. Вампиризм и ликантропия несовместимы.</p>`;
        perks.forEach(p => {
            const owned = !!(l && l.perks && l.perks[p.id]);
            h += `<div style="font-size:12px; margin-top:5px; opacity:${owned ? 1 : 0.85};">${owned ? '✅' : '▫️'} <strong>${escapeHtml(p.name)}</strong> (${p.level} ур., душ: ${p.souls}) — ${escapeHtml(p.desc)}<br>` +
                (owned ? `<button class="btn-danger" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmLichRevokePerk('${p.id}')">Снять (и следующие)</button>`
                       : `<button class="btn-success" style="width:auto; padding:2px 8px; margin-top:2px;" onclick="gmLichGrantPerk('${p.id}')">Выдать после ритуала</button>`) + `</div>`;
        });
        if (have.length === 4) {
            const st = l.stage || 0;
            h += `<div style="margin-top:8px;"><label>Становление</label><select onchange="gmLichSetStage(this.value)">` +
                [0, 1, 2].map(n => `<option value="${n}" ${st === n ? 'selected' : ''}>${['Рыцарь смерти', 'Низший лич', 'Высший лич'][n]}</option>`).join('') + `</select>` +
                (window.LICH_STAGES || []).map(x => `<p style="font-size:12px; opacity:.75; margin:3px 0;"><strong>${escapeHtml(x.name)}:</strong> ${escapeHtml(x.need)}</p>`).join('') + `</div>`;
        }
        if (l && (have.length || l.stage)) {
            h += `<div style="font-size:12px; margin-top:8px;">Воскрешение: <strong>${l.resReady ? 'готово' : 'использовано'}</strong> · Ослаблен: <strong>${l.weakened ? 'да' : 'нет'}</strong> · Филактерия: <strong>${escapeHtml(String(l.phylactery))}</strong> · Убийств: ${l.kills || 0}<br>` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({resReady:true})">Вернуть воскрешение</button> ` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({weakened:false})">Снять ослабление</button> ` +
                `<button style="width:auto; padding:2px 8px;" onclick="gmLichSet({phylactery:'intact'})">Починить филактерию</button> ` +
                `<button class="btn-danger" style="width:auto; padding:2px 8px;" onclick="gmLichReset()">Сбросить ветку</button></div>`;
        }
        h += `<details style="margin-top:8px; font-size:12px;"><summary>🏹 Охота на лича (для мастера)</summary><p style="opacity:.85;">Лич уязвим только пока цела его филактерия-убежище: пока она цела, убитый лич восстанавливается через 7 дней. Чтобы убить его насовсем, герои находят и разбивают филактерию (место, стража и ловушки придумывает мастер), затем добивают лича. Кнопка «Починить филактерию» возвращает её в целое состояние, если решите, что игрок её восстановил.</p></details>`;
        return h + `</div>`;
    }
    window.gmLichGrantPerk = function (id) {
        if (!currentInvPlayerUid) { alert('Выбери игрока.'); return; }
        const def = (window.LICH_PERKS || []).find(p => p.id === id); if (!def) return;
        const s = currentSupernaturalState;
        if (s.vampirism || s.lycanthropy) { alert('Игрок — вампир или оборотень: ветка лича ему закрыта.'); return; }
        const lvl = (currentPlayerInvData && currentPlayerInvData.characterLevel) || 1;
        if (lvl < def.level) { alert(`Нужен ${def.level}-й уровень, сейчас ${lvl}.`); return; }
        if (def.prereq && !(s.lich && s.lich.perks && s.lich.perks[def.prereq])) { alert('Сначала нужен предыдущий перк ветки.'); return; }
        if (!confirm(`Ритуал для «${def.name}» отыгран? Игрок отдал невинных душ: ${def.souls} (чёрные камни). Выдать перк (спишется 1 очко перков)?`)) return;
        gmSendCmd({ type: 'lichPerk', perk: id }, `{p} получает перк ветки лича «${def.name}».`).then(ok => { if (ok) setTimeout(renderSupernaturalPanel, 600); });
    };
    window.gmLichRevokePerk = function (id) {
        if (!confirm('Снять этот перк и все следующие за ним? Очки перков вернутся игроку.')) return;
        gmSendCmd({ type: 'lichAdmin', op: 'revoke', perk: id });
    };
    window.gmLichSetStage = function (v) {
        const n = parseInt(v) || 0;
        if (n && !confirm('Ритуал становления отыгран и условия выполнены?')) { renderSupernaturalPanel(); return; }
        gmSendCmd({ type: 'lichAdmin', op: 'stage', stage: n }, n ? '{p} становится личом.' : null);
    };
    window.gmLichSet = function (patch) { gmSendCmd({ type: 'lichAdmin', op: 'set', patch }); };
    window.gmLichReset = function () {
        if (!confirm('Сбросить ветку лича целиком? Все её перки снимутся, очки вернутся.')) return;
        gmSendCmd({ type: 'lichAdmin', op: 'reset' });
    };

    window.toggleSupernaturalFlag = function (key, checked) {
        if (checked && (key === 'vampirism' || key === 'lycanthropy') && currentSupernaturalState.lich && currentSupernaturalState.lich.perks && currentSupernaturalState.lich.perks.pact) {
            alert('Игрок заключил тёмный пакт лича: вампиризм и ликантропия ему недоступны. Сначала снимите перки ветки лича.');
            renderSupernaturalPanel(); return;
        }
        const s = currentSupernaturalState;
        // Что-то одно: вампир, оборотень или лич. Смена пути сбрасывает прежний со всеми плюшками.
        if (checked && key === 'lycanthropy' && s.vampirism) {
            if (!confirm('Игрок сейчас вампир. Став оборотнем, он потеряет вампиризм и все его способности (в том числе ветку лорда). Продолжить?')) { renderSupernaturalPanel(); return; }
            s.vampirism = false; s.vampire = defaultSupernaturalState().vampire;
        } else if (checked && key === 'vampirism' && s.lycanthropy) {
            if (!confirm('Игрок сейчас оборотень. Став вампиром, он потеряет ликантропию и все её способности. Продолжить?')) { renderSupernaturalPanel(); return; }
            s.lycanthropy = false; s.werewolf = defaultSupernaturalState().werewolf;
        }
        s[key] = checked;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.setWerewolfHearts = function (val) {
        currentSupernaturalState.werewolf.heartsEaten = Math.max(0, parseInt(val) || 0);
        saveSupernaturalState();
    };
    window.setWerewolfTotem = function (val) {
        currentSupernaturalState.werewolf.totem = val;
        saveSupernaturalState();
    };
    window.triggerTransform = function () {
        gmPostLogEntryText(`🐺 ${(lastData.participants[currentInvPlayerUid] || {}).name || 'Игрок'} обращается в зверя!`);
    };
    window.setVampireHunger = function (val) {
        currentSupernaturalState.vampire.hungerStage = Math.max(0, Math.min(4, parseInt(val) || 0));
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.feedVampire = function () {
        currentSupernaturalState.vampire.hungerStage = 0;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };
    window.toggleVampireLord = function (checked) {
        currentSupernaturalState.vampire.isLord = !!checked;
        if (!checked) currentSupernaturalState.vampire.lordForm = false;
        saveSupernaturalState().then(renderSupernaturalPanel);
    };

    window.loadPlayerInventoryForGm = function () {
        const uid = el('inv-player-select').value;
        if (unsubGmWatchedCharacter) { unsubGmWatchedCharacter(); unsubGmWatchedCharacter = null; }
        if (!uid) {
            currentInvPlayerUid = null;
            el('inv-gold-block').style.display = 'none';
            el('inv-level-block').style.display = 'none';
            el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:13px;">Выбери игрока выше.</p>';
            currentGuildsData = defaultGuildsData();
            currentSupernaturalState = defaultSupernaturalState();
            currentReputationData = defaultReputationData();
            renderGuildsPanel();
            renderSupernaturalPanel();
            renderReputationPanel();
            if (typeof loadPlayerKnownRecipes === 'function') window.loadPlayerKnownRecipes();
            return;
        }
        currentInvPlayerUid = uid;
        if (typeof window.loadPlayerKnownRecipes === 'function') window.loadPlayerKnownRecipes();
        el('inv-items-list').innerHTML = '<p style="opacity:.6; font-size:13px;">Загрузка...</p>';
        let firstSnapshot = true;
        // Живой листенер вместо одноразового .get() — если игрок сам меняет инвентарь/экипировку
        // на своём листе, мастер видит это СРАЗУ, без повторного выбора из списка. Раньше здесь
        // было window.CloudSync.watchCharacter(...) — а gm.html вообще не подключает cloud.js
        // (тот файл только для index.html), поэтому window.CloudSync был undefined и любой выбор
        // игрока падал с ошибкой прямо тут, оставляя "Загрузка..." навсегда.
        unsubGmWatchedCharacter = db.collection('characters').doc(uid).onSnapshot(doc => {
            const data = doc.exists ? doc.data() : null;
            if (data === null) {
                // Раньше ошибка подписки уходила только в консоль браузера — на экране
                // "Загрузка..." оставалась НАВСЕГДА, без единого объяснения, что не так.
                el('inv-items-list').innerHTML = '<p style="color:#e74c3c; font-size:13px;">Не удалось загрузить инвентарь игрока (ошибка подписки — подробности в консоли браузера, F12). Попробуй выбрать игрока заново.</p>';
                return;
            }
            currentPlayerInvData = {
                inventory: Array.isArray(data.inventory) ? data.inventory : [],
                gold: parseInt(data.gold) || 0,
                characterLevel: parseInt(data.characterLevel) || 1,
                levelUpProgress: parseInt(data.levelUpProgress) || 0,
                perkPointsAvailable: parseInt(data.perkPointsAvailable) || 0,
                customSpells: Array.isArray(data.customSpells) ? data.customSpells : [],
                skills: Array.isArray(data.skills) ? data.skills : [],
                race: data.race || '',
                paladin: (data.paladin && typeof data.paladin === 'object') ? data.paladin : null
            };
            renderGmPlayerPerks(data.takenPerks);
            renderGmPlayerPets(data.pets);
            renderGmPlayerEffects(data.activeTimedEffects);
            if (typeof window.gmRenderTeachSpells === 'function') window.gmRenderTeachSpells();
            { const ss = el('inv-skill-decrease-select'); if (ss) { const cur = ss.value; ss.innerHTML = SKILL_NAMES_BY_IDX.map((n, i) => `<option value="${i}">${escapeHtml(n)} — ${getEffectiveSkillFromData(currentPlayerInvData, i)}</option>`).join(''); /* как у игрока: с расовым бонусом */ if (cur !== '') ss.value = cur; } }
            el('inv-gold-block').style.display = 'block';
            { const dd = el('inv-date-day'), dm = el('inv-date-month'), dy = el('inv-date-year'); if (dd && !dd._dirtyHook) { dd._dirtyHook = 1; [dd, dm, dy, el('inv-date-food')].forEach(x => x && ['input', 'change'].forEach(ev => x.addEventListener(ev, () => { window._gmDateDirty = currentInvPlayerUid || true; }))); } if (dd && window._gmDateDirty !== (currentInvPlayerUid || true) && document.activeElement !== dd && document.activeElement !== dm && document.activeElement !== dy) { dd.value = parseInt(data.gameDayNum) || 10; dm.value = isNaN(parseInt(data.gameMonth)) ? 6 : parseInt(data.gameMonth); dy.value = parseInt(data.gameYear) || 201; } }
            el('inv-gold-current').textContent = formatNumber(currentPlayerInvData.gold);
            el('inv-level-block').style.display = 'block';
            el('inv-level-current').textContent = currentPlayerInvData.characterLevel;
            el('inv-perkpoints-current').textContent = currentPlayerInvData.perkPointsAvailable;
            const needed = gmSkillUpsNeededForLevel(currentPlayerInvData.characterLevel);
            el('inv-level-progress').textContent = currentPlayerInvData.characterLevel >= GM_MAX_CHARACTER_LEVEL ? `Максимальный уровень (${GM_MAX_CHARACTER_LEVEL})` : `Прогресс: ${currentPlayerInvData.levelUpProgress} / ${needed} очков навыков` + (data.levelScheme === 2 ? '' : ' (лист ещё на старой шкале — пересчитается, когда игрок его откроет)');
            renderGmPlayerInventory();

            // Гильдии/Сверхъестественное пишутся сразу по клику — безопасно обновлять на лету.
            currentGuildsData = normalizeGuildsData(data.guildsData);
            const defaultSn = defaultSupernaturalState();
            currentSupernaturalState = data.supernaturalState ? {
                lycanthropy: !!data.supernaturalState.lycanthropy,
                vampirism: !!data.supernaturalState.vampirism,
                werewolf: Object.assign(defaultSn.werewolf, data.supernaturalState.werewolf || {}),
                vampire: Object.assign(defaultSn.vampire, data.supernaturalState.vampire || {}, { lordPerks: (data.supernaturalState.vampire || {}).lordPerks || {} }),
                lich: window.lichNormalize ? window.lichNormalize(data.supernaturalState.lich) : (data.supernaturalState.lich || null),
                faithShift: data.supernaturalState.faithShift || null,
                cult: data.supernaturalState.cult || null
            } : defaultSn;
            currentCrimeState = window.StCrime.normalize(data.crimeState);
            // Снимок листа игрока приходит на каждое его сохранение — недописанная сумма штрафа и прочие поля не теряются.
            gmKeepForms(() => { renderGuildsPanel(); renderSupernaturalPanel(); renderCrimePanel(); });
            // Репутация копится ЛОКАЛЬНО до явного "Сохранить" (см. панель Задачи D) — если
            // перезатирать её на каждом чужом снапшоте, можно потерять несохранённые правки
            // мастера. Подтягиваем из облака только при первом выборе этого игрока.
            if (firstSnapshot) {
                currentReputationData = Object.assign(defaultReputationData(), data.reputationByRegion || {});
                repBaseline = Object.assign({}, currentReputationData);
                renderReputationPanel();
                firstSnapshot = false;
            }
        }, err => {
            console.error('Ошибка подписки на инвентарь игрока:', err);
            el('inv-items-list').innerHTML = `<p style="color:#e74c3c; font-size:13px;">Не удалось загрузить инвентарь игрока: ${escapeHtml(err.message || String(err))}</p>`;
        });
    };

    // Та же шкала, что на листе игрока (index.html getSkillUpsNeededForLevel): потолок 65.
    const GM_MAX_CHARACTER_LEVEL = 65;
    function gmSkillUpsNeededForLevel(level) { return Math.min(level * 2 + 2, 9 + Math.ceil(level / 2)); }

    window.grantLevelUp = function () {
        if (!currentInvPlayerUid) return;
        if (currentPlayerInvData && currentPlayerInvData.characterLevel >= GM_MAX_CHARACTER_LEVEL) { alert(`У персонажа уже максимальный уровень (${GM_MAX_CHARACTER_LEVEL}).`); return; }
        const statKey = el('inv-level-stat-choice').value;
        const statLabels = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        const statOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
        const statPos = statOrder.indexOf(statKey);
        let newLevelForLog = null;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const curLevel = parseInt(data.characterLevel) || 1;
            if (curLevel >= GM_MAX_CHARACTER_LEVEL) throw new Error(`у персонажа уже максимальный уровень (${GM_MAX_CHARACTER_LEVEL})`);
            const newLevel = curLevel + 1;
            newLevelForLog = newLevel;
            // Прогресс обнуляется (так решено), но уже накопленные готовые уровни (например, после пересчёта на новую шкалу)
            // не сгорают: если прогресса хватало на этот уровень, списывается только его порог.
            const prog = parseInt(data.levelUpProgress) || 0, need = gmSkillUpsNeededForLevel(curLevel);
            const newProgress = (data.levelScheme === 2 && prog >= need) ? prog - need : 0;
            const newPerkPoints = (parseInt(data.perkPointsAvailable) || 0) + 1;
            // +1 к характеристике — командой листу (gmCmds), а не записью stats: открытый лист stats из облака на лету
            // не подхватывал и ближайшим автосохранением затирал прибавку.
            return db.collection('characters').doc(currentInvPlayerUid).update({
                characterLevel: newLevel,
                perkPointsAvailable: newPerkPoints,
                levelUpProgress: newProgress,
                gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-lv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'stat', key: statKey, delta: 1 })
            });
        }).then(() => {
            alert(`Уровень начислен! Новый уровень + 1 очко перка + 1 к характеристике «${statLabels[statKey]}».`);
            const pname = (lastData.participants[currentInvPlayerUid] || {}).name || currentInvPlayerUid;
            gmPostLogEntryText(`🎓 Мастер начислил уровень ${newLevelForLog} игроку ${pname} (+1 «${statLabels[statKey]}», +1 очко перка).`);
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.grantPerkPointOnly = function () {
        if (!currentInvPlayerUid) return;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const newPerkPoints = (parseInt(data.perkPointsAvailable) || 0) + 1;
            return db.collection('characters').doc(currentInvPlayerUid).update({ perkPointsAvailable: newPerkPoints });
        }).then(() => {
            alert('Начислено 1 очко перка.');
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Понижает уровень персонажа на 1 (минимум 1). Уже взятые перки и полученные ранее
    // характеристики НЕ отменяются автоматически — это на усмотрение мастера/игрока за столом.
    window.revokeLevelUp = function () {
        if (!currentInvPlayerUid) return;
        if (!confirm('Понизить уровень на 1? Уже взятые перки и характеристики останутся как есть.')) return;
        db.collection('characters').doc(currentInvPlayerUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const newLevel = Math.max(1, (parseInt(data.characterLevel) || 1) - 1);
            return db.collection('characters').doc(currentInvPlayerUid).update({ characterLevel: newLevel, levelUpProgress: 0 });
        }).then(() => {
            alert('Уровень понижен.');
            window.loadPlayerInventoryForGm();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function populateSkillDecreaseSelect() {
        const select = el('inv-skill-decrease-select');
        if (!select) return;
        select.innerHTML = SKILL_NAMES_BY_IDX.map((name, i) => `<option value="${i}">${escapeHtml(name)}</option>`).join('');
    }

    // ---------- Правки листа игрока мастером ----------
    // Пишем не значения, а команды в characters/{uid}.gmCmds: лист игрока применяет их сам (один раз, по id) и
    // убирает. Прямая запись skills/stats/perkStates затиралась бы автосохранением открытого листа игрока.
    function gmSendCmd(cmd, logText) {
        if (!currentInvPlayerUid) { alert('Выбери игрока.'); return Promise.resolve(false); }
        const full = Object.assign({ id: 'gmc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now() }, cmd);
        return db.collection('characters').doc(currentInvPlayerUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion(full) })
            .then(() => {
                const pname = ((lastData && lastData.participants) || {})[currentInvPlayerUid] ? lastData.participants[currentInvPlayerUid].name : 'игрок';
                if (logText) gmPostLogEntryText('🎓 Мастер: ' + logText.replace('{p}', pname));
                const m = el('inv-gm-edit-msg'); if (m) m.innerHTML = '<span style="color:#2ecc71;">✔ Отправлено — применится у игрока (сразу, если лист открыт, иначе при входе).</span>';
                return true;
            }).catch(e => { alert('Ошибка: ' + e.message); return false; });
    }
    // Дата игрока вручную: только меняет число/месяц/год, без последствий смены дня (голод, отдых, крафт). Опционально сбрасывает голод.
    window.gmSetPlayerDate = function () {
        const d = parseInt(el('inv-date-day').value), m = parseInt(el('inv-date-month').value), y = parseInt(el('inv-date-year').value);
        if (!(d >= 1 && d <= 30) || !(y >= 1)) { alert('День 1–30, год — положительное число.'); return; }
        const food = !!el('inv-date-food').checked;
        const mn = el('inv-date-month').options[m].text;
        window._gmDateDirty = null; gmSendCmd({ type: 'setDate', day: d, month: m, year: y, resetFood: food }, `игроку {p} выставлена дата: ${d} ${mn} 4Э ${y}${food ? ', голод сброшен' : ' (без смены дня и голода)'}.`);
    };
    // «Покаяние»: игрок-даэдропоклонник получает право один раз снова выбрать бога-аэдра.
    window.gmPenance = function () { gmSendCmd({ type: 'penance' }, 'игрок {p} прошёл покаяние — может вернуться к аэдра.'); };
    // Прошёл игровой час — у всех игроков сессии тает облик зверя (4 ч, с «Вечным голодом» 8).
    window.gmHourPassed = function () {
        const parts = Object.keys((lastData && lastData.participants) || {});
        if (!parts.length) { alert('В сессии нет игроков.'); return; }
        Promise.all(parts.map(uid => db.collection('characters').doc(uid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-hr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'hourPassed', hours: 1 }) }).catch(() => { })))
            .then(() => gmPostLogEntryText('🕐 Мастер: прошёл игровой час.'));
    };
    window.gmChangePlayerSkill = function (sign) {
        const skillIdx = parseInt(el('inv-skill-decrease-select').value) || 0;
        const amount = Math.max(1, parseInt(el('inv-skill-decrease-amount').value) || 1);
        const name = SKILL_NAMES_BY_IDX[skillIdx];
        gmSendCmd({ type: 'skill', idx: skillIdx, delta: sign * amount }, `навык «${name}» ${sign > 0 ? '+' : '−'}${amount} игроку {p}.`);
    };
    // Старое имя кнопки «Понизить» (совместимость).
    window.decreasePlayerSkill = function () { window.gmChangePlayerSkill(-1); };
    window.gmChangePlayerStat = function (sign) {
        const key = el('inv-stat-change-select').value;
        const amount = Math.max(1, parseInt(el('inv-stat-change-amount').value) || 1);
        const names = { str: 'Сила', dex: 'Ловкость', con: 'Телосложение', int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма' };
        gmSendCmd({ type: 'stat', key, delta: sign * amount }, `характеристика «${names[key]}» ${sign > 0 ? '+' : '−'}${amount} игроку {p}.`);
    };
    window.gmPerkDown = function (sIdx, pIdx, name) {
        const refund = !!(el('inv-perk-refund') && el('inv-perk-refund').checked);
        if (!confirm(`Снять одну ступень перка «${name}»${refund ? ' и вернуть очко перка' : ' (без возврата очка)'}?`)) return;
        gmSendCmd({ type: 'perkDown', s: sIdx, p: pIdx, refund }, `снята ступень перка «${name}» у игрока {p}${refund ? ' (очко возвращено)' : ''}.`);
    };
    window.gmRenderTeachSpells = function () {
        const sel = el('inv-teach-spell'); if (!sel) return;
        const school = el('inv-teach-school').value;
        const known = new Set(((currentPlayerInvData && currentPlayerInvData.customSpells) || []).map(s => s.name));
        const tiers = { 1: 'Новичок', 2: 'Ученик', 3: 'Адепт', 4: 'Эксперт' };
        const data = (window.spellsData && window.spellsData[school]) || {};
        sel.innerHTML = [1, 2, 3, 4].map(t => (data[t] || []).length ? `<optgroup label="${tiers[t]}">` + data[t].map(sp =>
            `<option value="${escapeHtml(sp.name)}" ${known.has(sp.name) ? 'disabled' : ''}>${escapeHtml(sp.name)}${known.has(sp.name) ? ' — уже знает' : ''}</option>`).join('') + '</optgroup>' : '').join('');
    };
    window.gmTeachSpell = function () {
        const school = el('inv-teach-school').value, name = el('inv-teach-spell').value;
        if (!name) { alert('Выбери заклинание.'); return; }
        gmSendCmd({ type: 'spell', school, name }, `игрок {p} обучен заклинанию «${name}».`);
    };
    function renderGmPlayerPerks(list) {
        const box = el('inv-perks-list'); if (!box) return;
        if (!Array.isArray(list)) { box.innerHTML = '<p style="opacity:.6;">Список перков появится, когда игрок откроет лист (он сохраняет сводку взятых перков).</p>'; return; }
        if (!list.length) { box.innerHTML = '<p style="opacity:.6;">Перков нет.</p>'; return; }
        box.innerHTML = list.map(p => `<div style="display:flex; justify-content:space-between; gap:6px; padding:2px 0; border-bottom:1px solid var(--border-color);">
            <span><span style="opacity:.6;">${escapeHtml(p.tree)}:</span> ${escapeHtml(p.name)}${p.steps > 1 ? ` (${p.taken}/${p.steps})` : ''}</span>
            <button class="btn-danger" style="width:auto; padding:1px 8px; font-size:12px;" onclick="gmPerkDown(${parseInt(p.s)}, ${parseInt(p.p)}, '${jsq(p.name)}')">−1</button></div>`).join('');
    }

    function renderGmPlayerInventory() {
        const target = el('inv-items-list');
        const items = currentPlayerInvData.inventory;
        if (!items.length) {
            target.innerHTML = '<p style="opacity:.6; font-size:13px;">Инвентарь пуст.</p>';
            return;
        }
        target.innerHTML = items.map(item => `
            <div class="party-row">
                <div class="row-name">
                    <span><strong>${escapeHtml(item.name)}</strong> × ${item.count}${item.weight ? ` <span style="opacity:.6; font-size:12px;">(вес ${item.weight})</span>` : ''}${typeof item.price === 'number' ? ` <span style="opacity:.6; font-size:12px;">· ${item.price} септ./шт.</span>` : ''}</span>
                    <span style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="del-qty-${escapeHtml(item.itemId)}" value="1" min="1" max="${item.count}" style="width:52px;">
                        <button class="btn-danger" style="width:auto; padding:2px 8px; font-size:12px;" onclick="deletePlayerItem('${jsq(item.itemId)}')">Удалить</button>
                    </span>
                </div>
                ${item.effect ? `<div style="font-size:12px; opacity:.75; margin-top:2px;">${escapeHtml(StBonuses.shownEffect(item))}</div>` : ''}
            </div>
        `).join('');
    }

    // Правка инвентаря игрока мастером — транзакцией по свежему листу из облака, а не по снимку мастера:
    // иначе вещь, проданная или потраченная игроком в эту секунду, «воскресала». fn(inv, data) меняет inv на месте;
    // вернуть строку — отказ с этим текстом (ничего не пишется).
    function gmTxInventory(uid, fn) {
        const ref = db.collection('characters').doc(uid);
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const data = doc.exists ? (doc.data() || {}) : {};
            const inv = (Array.isArray(data.inventory) ? data.inventory : []).map(i => Object.assign({}, i));
            const err = fn(inv, data);
            if (typeof err === 'string') throw new Error(err);
            if (doc.exists) tx.update(ref, { inventory: stripUndefinedDeep(inv) }); else tx.set(ref, { inventory: stripUndefinedDeep(inv) }, { merge: true });
            return inv;
        }));
    }

    // Раньше удаляло весь стек разом, даже если у игрока было 10 стрел — теперь удаляет ровно
    // то количество, что указано в поле рядом с кнопкой (по умолчанию 1).
    window.deletePlayerItem = function (itemId) {
        if (!currentInvPlayerUid) return;
        const item = currentPlayerInvData.inventory.find(i => i.itemId === itemId);
        if (!item) return;
        const qtyInput = el('del-qty-' + itemId);
        const qty = Math.max(1, Math.min(item.count, parseInt(qtyInput ? qtyInput.value : 1) || 1));
        if (!confirm(`Удалить ${qty} шт. «${item.name}» у игрока?`)) return;
        gmTxInventory(currentInvPlayerUid, inv => {
            const ix = inv.findIndex(i => i.itemId === itemId);
            if (ix === -1) return `У игрока уже нет «${item.name}».`;
            const left = (parseInt(inv[ix].count) || 0) - qty;
            if (left > 0) inv[ix].count = left; else inv.splice(ix, 1);
        }).then(newInv => {
            currentPlayerInvData.inventory = newInv;
            renderGmPlayerInventory();
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // Прибавить/списать золото игроку относительно того, что у него СЕЙЧАС в облаке, не ниже 0.
    // Не FieldValue.increment: лист игрока долго сохранял золото строкой ("150"), а increment по
    // нечисловому полю Firestore не прибавляет, а ЗАМЕНЯЕТ значение — «+50» превращало 150 в 50.
    // Транзакция читает текущее значение (parseInt понимает и строку) и пишет число.
    // opts.requireEnough — списание только если золота хватает (иначе ошибка, ничего не меняется).
    function gmAddGold(uid, delta, opts) {
        const ref = db.collection('characters').doc(uid);
        let res = null;
        return db.runTransaction(tx => tx.get(ref).then(doc => {
            const before = parseInt((doc.data() || {}).gold) || 0;
            if (opts && opts.requireEnough && (parseInt(delta) || 0) < 0 && before < -(parseInt(delta) || 0)) throw new Error('у игрока только ' + before + ' золота, нужно ' + (-(parseInt(delta) || 0)));
            const after = Math.max(0, before + (parseInt(delta) || 0));
            res = { before, after };
            if (doc.exists) tx.update(ref, { gold: after }); else tx.set(ref, { gold: after }, { merge: true });
        })).then(() => res);
    }
    window.gmAddGold = gmAddGold;

    window.applyGoldDelta = function (sign) {
        if (!currentInvPlayerUid) return;
        const uid = currentInvPlayerUid;
        const amount = parseInt(el('inv-gold-delta').value) || 0;
        if (sign !== 0 && amount <= 0) { alert('Укажи положительную сумму.'); return; }
        if (sign === 0 && amount < 0) { alert('Золото не может быть меньше 0.'); return; }
        const pname = (lastData.participants[uid] || {}).name || uid;
        const ref = db.collection('characters').doc(uid);
        // sign 0 — «Установить»: записать ровно эту сумму
        const op = sign === 0
            ? ref.update({ gold: amount }).then(() => ({ after: amount }))
            : gmAddGold(uid, sign * amount);
        op.then(r => {
            el('inv-gold-delta').value = '';
            if (uid === currentInvPlayerUid) { currentPlayerInvData.gold = r.after; el('inv-gold-current').textContent = formatNumber(r.after); }
            const verb = sign > 0 ? `выдал ${amount}` : sign < 0 ? `списал ${r.before - r.after}` : `установил ${amount}`;
            gmPostLogEntryText(`💰 Мастер ${verb} золота игроку ${pname}` + (sign !== 0 ? ` (теперь ${r.after}).` : '.'));
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Создание своего предмета мастером ----------

    window.updateCustomItemFields = function () {
        const cat = el('ci-category').value;
        el('ci-weapon-fields').style.display = cat === 'weapon' ? 'block' : 'none';
        el('ci-armor-fields').style.display = cat === 'armor' ? 'block' : 'none';
        el('ci-jewelry-fields').style.display = cat === 'jewelry' ? 'block' : 'none';
        el('ci-potion-fields').style.display = cat === 'potion' ? 'block' : 'none';
        el('ci-upgrade-fields').style.display = (cat === 'weapon' || cat === 'armor') ? 'block' : 'none';

        // Зелье/яд — раньше был только общий текст, без структурированного эффекта/величины/
        // длительности. Список эффектов — та же база, что у реальной алхимии (alchemyBaseEffects),
        // отфильтрован по знаку (положительный для зелья, отрицательный для яда).
        if (cat === 'potion') {
            const kind = el('ci-potion-kind').value;
            const wantPolarity = kind === 'poison' ? 'negative' : 'positive';
            const effSelect = el('ci-potion-effect');
            const prevVal = effSelect.value;
            const names = Object.keys(window.alchemyBaseEffects || {}).filter(n => window.alchemyBaseEffects[n].polarity === wantPolarity);
            effSelect.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
            if (names.includes(prevVal)) effSelect.value = prevVal;
            const info = window.alchemyBaseEffects[effSelect.value];
            el('ci-potion-duration-wrap').style.display = (info && info.dur !== null && info.dur !== undefined) ? 'block' : 'none';
            const magEl = el('ci-potion-magnitude');
            if (magEl && magEl.parentElement) magEl.parentElement.style.display = (info && info.base !== null && info.base !== undefined) ? 'block' : 'none';
        }

        const enchanted = el('ci-enchanted').checked;
        el('ci-enchant-fields').style.display = enchanted ? 'block' : 'none';
        if (!enchanted) return;

        const effectSelect = el('ci-enchant-effect');
        let effects = [];
        if (cat === 'weapon' && window.enchantWeaponEffects) {
            effects = window.enchantWeaponEffects;
        } else if ((cat === 'armor' || cat === 'jewelry') && window.enchantArmorEffects) {
            const slot = cat === 'armor' ? el('ci-armor-slot').value : el('ci-jewelry-slot').value;
            const enchantSlotMap = { chest: 'armor', robe: 'armor', gloves: 'gauntlets', neck: 'amulet', circlet: 'helmet' };
            const wantedSlot = enchantSlotMap[slot] || slot;
            effects = window.enchantArmorEffects.filter(e => e.slots.includes(wantedSlot));
        }
        effectSelect.innerHTML = effects.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`).join('')
            || '<option value="">Нет подходящих эффектов для этого слота</option>';
    };

    window.createCustomItem = function () {
        if (!db) return;
        const name = el('ci-name').value.trim();
        if (!name) { alert('Укажи название предмета.'); return; }
        const cat = el('ci-category').value;
        const weight = parseFloat(el('ci-weight').value) || 0;
        const price = parseInt(el('ci-price').value) || 0;
        const desc = el('ci-desc').value.trim();

        const catLabels = { weapon: 'Оружие (своё)', armor: 'Броня (своя)', jewelry: 'Ювелирное изделие (своё)', book: 'Книга/Свиток', potion: 'Зелье/Яд', misc: 'Разное' };

        const item = { name, category: catLabels[cat] || 'Разное', weight, price, effect: desc, slot: null };

        // Универсальный счётчик использований — применяется НЕЗАВИСИМО от категории (не только
        // "разное", оружие/броня/зелье тоже могут иметь ограниченный запас зарядов, как волшебный
        // посох). Сама механика кнопки "Использовать" уже существует (useLimitedItem, index.html),
        // раньше просто не было способа задать maxUses при РУЧНОМ создании предмета мастером.
        const maxUses = parseInt(el('ci-max-uses').value) || 0;
        if (maxUses > 0) {
            item.maxUses = maxUses;
            item.usesLeft = maxUses;
            item.effect = item.effect ? item.effect + `; Использований: ${maxUses}` : `Использований: ${maxUses}`;
        }

        if (cat === 'weapon') {
            item.dmg = parseInt(el('ci-damage').value) || 0;
            // Значение выбора может быть "onehand:топор" (для распознавания топора/булавы по имени
            // в бою) — базовый slot всё равно 'melee'/'ranged'/'dagger'/'onehand'/'twohand_*',
            // сама подсказка попадает в effect текстом, т.к. переключатель типа на листе игрока —
            // отдельное поле на другой вкладке, сюда не дотянуться напрямую.
            const rawType = el('ci-weapon-type').value;
            const [wepType, wepSub] = rawType.split(':');
            item.slot = wepType === 'ranged' ? 'ranged' : (wepType === 'dagger' ? 'melee' : 'melee');
            item.weaponType = wepType;
            const typeLabel = el('ci-weapon-type').selectedOptions[0].textContent;
            item.effect = item.effect ? item.effect + `; Тип: ${typeLabel}` : `Тип: ${typeLabel}`;
        } else if (cat === 'armor') {
            item.slot = el('ci-armor-slot').value;
            item.armor = parseInt(el('ci-armor-value').value) || 0;
            // armorType (Лёгкая/Тяжёлая) — раньше вообще не спрашивалось при создании, хотя
            // данные реальных кузнечных рецептов этим полем уже пользуются.
            item.armorType = el('ci-armor-type').value;
            item.effect = item.effect ? item.effect + `; ${item.armorType}` : item.armorType;
        } else if (cat === 'jewelry') {
            item.slot = el('ci-jewelry-slot').value;
        } else if (cat === 'potion') {
            // Структурированный эффект зелья/яда — раньше был только свободный текст без
            // конкретной величины/длительности, теперь та же база эффектов, что у реальной алхимии.
            const kind = el('ci-potion-kind').value;
            const effName = el('ci-potion-effect').value;
            const info = window.alchemyBaseEffects ? window.alchemyBaseEffects[effName] : null;
            const hasMag = !info || (info.base !== null && info.base !== undefined);
            const magnitude = hasMag ? (parseFloat(el('ci-potion-magnitude').value) || 0) : null;
            const unit = info ? info.unit : '';
            const hasDur = info ? (info.dur !== null && info.dur !== undefined) : false;
            const duration = hasDur ? (parseInt(el('ci-potion-duration').value) || 1) : null;
            item.category = kind === 'poison' ? 'Яд' : 'Зелье';
            item.alchemyEffects = [{ name: effName, magnitude, duration, unit, kind: info ? info.kind : null }];
            const potDesc = window.describeAlchemyEffect ? window.describeAlchemyEffect({ name: effName, magnitude, duration, unit }) : effName;
            item.effect = item.effect ? item.effect + '; ' + potDesc : potDesc;
        }

        // Материал улучшения (наточить у точила/верстака) — общий и для оружия, и для брони.
        // Раньше в форме создания этого поля не было вообще; у реальных кузнечных рецептов
        // (armorRecipes) такое поле уже есть (upgradeMaterial), но тоже нигде не отображалось.
        if ((cat === 'weapon' || cat === 'armor') && el('ci-upgrade-material').value.trim()) {
            const mat = el('ci-upgrade-material').value.trim();
            const qty = parseInt(el('ci-upgrade-qty').value) || 1;
            item.upgradeMaterial = mat;
            item.upgradeQty = qty;
            const upgDesc = `Улучшается: ${mat} ×${qty}`;
            item.effect = item.effect ? item.effect + '; ' + upgDesc : upgDesc;
        }

        if (el('ci-enchanted').checked) {
            const effName = el('ci-enchant-effect').value;
            const effVal = parseFloat(el('ci-enchant-value').value) || 0;
            if (effName) {
                const enchDesc = `${effName}: ${effVal}`;
                item.enchantment = { name: effName, value: effVal, unit: '', description: enchDesc };
                item.effect = item.effect ? item.effect + '; ' + enchDesc : enchDesc;
            }
        }

        const docId = name.replace(/[\/\.\#\$\[\]]/g, '_') + '_custom_' + Date.now();
        db.collection('items').doc(docId).set(item).then(() => {
            el('ci-result').innerHTML = `<span style="color:#2ecc71;">✅ Предмет «${escapeHtml(name)}» создан и сохранён в базу.</span>`;
            el('ci-name').value = '';
            el('ci-desc').value = '';
            window.loadGmItems();
        }).catch(e => {
            el('ci-result').innerHTML = `<span style="color:#e74c3c;">Ошибка: ${escapeHtml(e.message)}</span>`;
        });
    };

    // ---------- Мини-расчёт перков для калькуляторов (без полного perks.js — тут нет DOM игрока) ----------

    // Статус-эффекты, которые НПС может наложить на игрока атакой — пишутся прямо в
    // activeTimedEffects игрока и тикают по тем же ходам, что и его собственные баффы.
    // Болезни Скайрима — переносятся дикими животными при укусе (см. DISEASE_DEFS ниже и теги
    // carrierOfDisease/diseaseChance в enemies-data.js). Лечится обычным зельем лечения болезней
    // или молитвой у алтаря — отдельной кнопки "вылечить" тут нет специально, это дело мастера
    // отыграть по ситуации (снять статус вручную кнопкой "Снять", как и остальные статусы).
    const DISEASE_DEFS = {
        'Атаксия': { desc: '−2 к броскам Одноручного оружия и Взлома.' },
        'Каменная подагра': { desc: '−2 к броскам Тяжёлой/Лёгкой брони.' },
        'Заумь': { desc: '−2 к броскам школ магии (Разрушение/Восстановление/Колдовство/Иллюзия/Изменение).' },
        'Кровавая лихорадка': { desc: '−10 к максимальному здоровью, пока не вылечена.' },
        'Насморк Пелиниала': { desc: '−2 к броскам Скрытности и Карманных краж.' },
        'Разжижение мозга': { desc: '−25 к максимальному здоровью, пока не вылечена.' },
        'Костоломная лихорадка': { desc: '−5 фт скорости, пока не вылечена.' },
        'Хрипунец': { desc: '−10% сопротивления стихиям, пока не вылечен.' }
    };

    const GM_STATUS_EFFECTS = {
        paralyze: { name: 'Паралич', desc: 'Не может действовать в свой ход.', turns: 1 },
        fear: { name: 'Страх', desc: 'Вынужден отступать/убегать 1 ход.', turns: 1 },
        frenzy: { name: 'Бешенство', desc: 'Атакует ближайшую цель без разбора 1 ход.', turns: 1 },
        slow: { name: 'Замедление', desc: '-10 фт. скорости.', turns: 3, speed: -10 },
        weakened: { name: 'Ослабление', desc: '-2 к броскам атаки/проверок.', turns: 2, rollPenalty: -2 },
        calm: { name: 'Успокоение', desc: 'Не атакует 1 ход.', turns: 1 },
        // Ниже — только для врагов (массовая кнопка «Статус»): работают сами — блок атаки, штраф к кубам, урон по ходам.
        stun: { name: 'Оглушение', desc: 'Оглушён — не действует.', turns: 1 },
        burning: { name: 'Горение', desc: 'Горит: 5 урона огнём в начале каждого хода (сопротивление огню учитывается).', turns: 3, dotHp: 5, dotType: 'fire' },
        bleeding: { name: 'Кровотечение', desc: 'Истекает кровью: 5 урона в начале каждого хода.', turns: 3, dotHp: 5, dotNoResist: true },
        blind: { name: 'Ошеломление', desc: '−3 к кубам.', turns: 1, rollPenalty: -3 }
    };

    const RACE_SKILL_BONUSES = {
        nord: { "Двуручное оружие": 10, "Красноречие": 5, "Легкая броня": 5, "Блокирование": 5, "Кузнечное дело": 5, "Одноручное оружие": 5 },
        altmer: { "Иллюзия": 10, "Колдовство": 5, "Разрушение": 5, "Изменение": 5, "Восстановление": 5, "Зачарование": 5 },
        breton: { "Колдовство": 10, "Иллюзия": 5, "Алхимия": 5, "Красноречие": 5, "Восстановление": 5, "Изменение": 5 },
        orc: { "Тяжелая броня": 10, "Зачарование": 5, "Двуручное оружие": 5, "Блокирование": 5, "Кузнечное дело": 5, "Одноручное оружие": 5 },
        khajiit: { "Скрытность": 10, "Взлом": 5, "Алхимия": 5, "Карманные кражи": 5, "Стрельба": 5, "Одноручное оружие": 5 },
        redguard: { "Одноручное оружие": 10, "Разрушение": 5, "Изменение": 5, "Блокирование": 5, "Кузнечное дело": 5, "Стрельба": 5 },
        argonian: { "Взлом": 10, "Восстановление": 5, "Изменение": 5, "Легкая броня": 5, "Скрытность": 5, "Карманные кражи": 5 },
        bosmer: { "Стрельба": 10, "Взлом": 5, "Алхимия": 5, "Легкая броня": 5, "Скрытность": 5, "Карманные кражи": 5 },
        dunmer: { "Разрушение": 15, "Иллюзия": 5, "Алхимия": 5, "Легкая броня": 5, "Скрытность": 5, "Изменение": 5 },
        imperial: { "Восстановление": 10, "Разрушение": 5, "Зачарование": 5, "Тяжелая броня": 5, "Блокирование": 5, "Одноручное оружие": 5 }
    };
    const SKILL_NAMES_BY_IDX = ["Одноручное оружие", "Двуручное оружие", "Стрельба", "Блокирование", "Тяжелая броня",
        "Легкая броня", "Скрытность", "Взлом", "Карманные кражи", "Красноречие", "Разрушение", "Восстановление",
        "Колдовство", "Иллюзия", "Изменение", "Алхимия", "Кузнечное дело", "Зачарование", "Кулинария"];

    function getEffectiveSkillFromData(data, skillIdx) {
        const raw = (Array.isArray(data.skills) ? parseInt(data.skills[skillIdx]) : null) || 10;
        const skillName = SKILL_NAMES_BY_IDX[skillIdx];
        const bonus = (RACE_SKILL_BONUSES[data.race] && RACE_SKILL_BONUSES[data.race][skillName]) || 0;
        return Math.min(100, raw + bonus); // как на листе игрока: потолок навыка 100 вместе с расовым бонусом
    }

    function getMaxStepFromStates(perkStates, skillIdx, perkIdx) {
        let max = 0;
        for (let s = 1; s <= 5; s++) {
            if (perkStates && perkStates[`skill${skillIdx}-perk${perkIdx}-step${s}`]) max = s;
        }
        return max;
    }

    function computeAlchemyPerksFor(data) {
        const ps = data.perkStates || {};
        const alchemistRank = getMaxStepFromStates(ps, 15, 0);
        return {
            alchemistRank: alchemistRank,
            hasHealer: getMaxStepFromStates(ps, 15, 1) > 0,
            hasProvisor: getMaxStepFromStates(ps, 15, 2) > 0,
            hasPoisoner: getMaxStepFromStates(ps, 15, 3) > 0
        };
    }

    function computeEnchantPerksFor(data) {
        const ps = data.perkStates || {};
        return {
            enchantGeneralBonus: 0.20 * getMaxStepFromStates(ps, 17, 0),
            enchantSoulEconomy: getMaxStepFromStates(ps, 17, 1) > 0 ? 2 : 0,
            enchantFireBonus: getMaxStepFromStates(ps, 17, 2) > 0 ? 0.25 : 0,
            enchantFrostBonus: getMaxStepFromStates(ps, 17, 4) > 0 ? 0.25 : 0,
            enchantSkillBonus: getMaxStepFromStates(ps, 17, 5) > 0 ? 0.25 : 0,
            enchantShockBonus: getMaxStepFromStates(ps, 17, 6) > 0 ? 0.25 : 0,
            enchantLifeBonus: getMaxStepFromStates(ps, 17, 7) > 0 ? 0.25 : 0
        };
    }

    function populateCalcPlayerSelects() {
        const uids = Object.keys(lastData.participants || {});
        const opts = '<option value="">— выбери игрока —</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        ['calc-alch-player', 'calc-ench-player'].forEach(id => {
            const select = el(id);
            if (!select) return;
            const prev = select.value;
            select.innerHTML = opts;
            if (uids.includes(prev)) select.value = prev;
        });
    }

    // ---------- Калькулятор алхимии ----------

    function renderCalcAlchIngredients() {
        const names = Object.keys(window.alchemyIngredients || {}).sort();
        const optsHtml = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        ['calc-alch-ing1', 'calc-alch-ing2', 'calc-alch-ing3'].forEach(id => {
            const select = el(id);
            if (select) select.innerHTML = (id === 'calc-alch-ing3' ? '<option value="">— не использовать —</option>' : '') + optsHtml;
        });
    }

    window.calcAlchemyCheck = function () {
        const uid = el('calc-alch-player').value;
        const resultEl = el('calc-alch-result');
        if (!uid) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери игрока.</span>'; return; }
        const ing1 = el('calc-alch-ing1').value, ing2 = el('calc-alch-ing2').value, ing3 = el('calc-alch-ing3').value;
        if (!ing1 || !ing2 || ing1 === ing2) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери минимум два разных ингредиента.</span>'; return; }

        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const skill = getEffectiveSkillFromData(data, 15);
            const perks = computeAlchemyPerksFor(data);
            el('calc-alch-skill-info').textContent = `Алхимия: ${skill} (с расой) · Алхимик: ранг ${perks.alchemistRank} · Провизор: ${perks.hasProvisor ? 'да' : 'нет'} · Целитель: ${perks.hasHealer ? 'да' : 'нет'} · Отравитель: ${perks.hasPoisoner ? 'да' : 'нет'}`;

            // Правило автора: у первых двух должно быть общее свойство; третий добавляет только совпавшие.
            const shared = window.getSharedAlchemyEffectsFor(ing1, ing2, (ing3 && ing3 !== ing1 && ing3 !== ing2) ? ing3 : null);
            if (!shared.length) {
                resultEl.innerHTML = '<span style="color:#e74c3c;">⚠ У первых двух ингредиентов нет общих свойств — варево не получится.</span>';
                return;
            }
            const gear = (data.skillBoosts && data.skillBoosts['алхимия']) || 0;
            const ctxBase = { skill, alchemistRank: perks.alchemistRank, hasProvisor: perks.hasProvisor, hasHealer: perks.hasHealer, hasPoisoner: perks.hasPoisoner, gear };
            const pols = shared.map(n => (window.alchemyBaseEffects[n] || {}).polarity);
            const mixed = pols.includes('positive') && pols.includes('negative');
            const modes = mixed ? ['potion', 'poison'] : [pols.every(p => p === 'positive') ? 'potion' : 'poison'];
            let html = '';
            modes.forEach(mode => {
                html += `<div style="margin-top:6px; opacity:.85;">${mode === 'poison' ? '☠ Если варить ЯД' : '🧪 Если варить ЗЕЛЬЕ'}:</div>`;
                shared.forEach(effName => {
                    const e = window.calcAlchemyEffect(effName, Object.assign({ mode }, ctxBase));
                    if (!e) return;
                    const godPP = ((data.godGM || {}).potionPower) || 0; // Намира: зелья сильнее — как при варке у игрока
                    if (godPP && e.magnitude !== null) e.magnitude = Math.round(e.magnitude * (1 + godPP / 100));
                    html += `<div>${e.polarity === 'negative' ? '☠' : '🧪'} <strong>${escapeHtml(effName)}</strong>: ${escapeHtml(window.describeAlchemyEffect(e).slice(effName.length + 2) || '—')}</div>`;
                });
            });
            resultEl.innerHTML = html;
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // ---------- Калькулятор зачарования ----------

    window.renderCalcEnchEffects = function () {
        const type = el('calc-ench-type').value;
        const select = el('calc-ench-effect');
        const effects = type === 'weapon' ? (window.enchantWeaponEffects || []) : (window.enchantArmorEffects || []);
        select.innerHTML = effects.map((e, i) => `<option value="${i}">${escapeHtml(e.name)}</option>`).join('');
    };

    window.calcEnchantCheck = function () {
        const uid = el('calc-ench-player').value;
        const resultEl = el('calc-ench-result');
        if (!uid) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери игрока.</span>'; return; }
        const type = el('calc-ench-type').value;
        const idx = parseInt(el('calc-ench-effect').value) || 0;
        const effects = type === 'weapon' ? (window.enchantWeaponEffects || []) : (window.enchantArmorEffects || []);
        const effect = effects[idx];
        const gem = el('calc-ench-gem').value;
        if (!effect) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери эффект.</span>'; return; }

        db.collection('characters').doc(uid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const skill = getEffectiveSkillFromData(data, 17);
            const perks = computeEnchantPerksFor(data);
            el('calc-ench-skill-info').textContent = `Зачарование: ${skill} (с расой) · Общий бонус: +${Math.round(perks.enchantGeneralBonus * 100)}%`;
            const calc = window.calcEnchantPower(effect, gem, skill, perks);
            resultEl.innerHTML = calc.boolean
                ? `<div>${escapeHtml(effect.description)}</div>`
                : `<div><strong>${escapeHtml(effect.name)}</strong>: ${calc.value}${escapeHtml(effect.unit)}</div>`;
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    if (typeof renderCalcAlchIngredients === 'function') renderCalcAlchIngredients();
    if (typeof populateSkillDecreaseSelect === 'function') populateSkillDecreaseSelect();
    if (typeof renderMerchantHoldSelect === 'function') renderMerchantHoldSelect();
    if (typeof renderMerchantTypeSelect === 'function') renderMerchantTypeSelect();
    if (typeof renderHolidaySelect === 'function') renderHolidaySelect();
    if (typeof renderGroupCheckSkillSelect === 'function') renderGroupCheckSkillSelect();
    if (typeof renderGuildInfoSelect === 'function') { renderGuildInfoSelect(); renderGuildInfoPanel(); }
    if (typeof populateQgenHoldSelect === 'function') populateQgenHoldSelect();
    if (typeof renderTournBracketInfo === 'function') renderTournBracketInfo();
    if (typeof renderAllWeatherReference === 'function') renderAllWeatherReference();
    if (typeof renderAllEnchantsReference === 'function') renderAllEnchantsReference();
    if (typeof populateEnemyDbSelect === 'function') populateEnemyDbSelect();
    if (typeof initEnemyGearPanels === 'function') initEnemyGearPanels();
    if (typeof window.renderCalcEnchEffects === 'function') window.renderCalcEnchEffects();

    // ---------- Выдача квестов ----------

    function populateQuestTargetSelect() {
        const select = el('quest-target-player');
        if (!select) return;
        const uids = Object.keys(lastData.participants || {});
        const prev = select.value;
        select.innerHTML = '<option value="all">Всей группе</option>' +
            uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('');
        if (prev === 'all' || uids.includes(prev)) select.value = prev;
    }

    function genQuestId() { return 'q-' + Date.now() + Math.random().toString(36).slice(2, 6); }

    // Генератор квестов (документ 4) — НЕ отдельный механизм доставки, просто заполняет уже
    // существующую форму выдачи (quest-title-input и т.д.), дальше работает обычная
    // window.grantQuest() как при ручном вводе. holds.js подключён отдельно в gm.html (раньше
    // был только в holds.html).
    function populateQgenHoldSelect() {
        const sel = el('qgen-hold-select');
        if (!sel || sel.options.length || !window.holdsData) return;
        sel.innerHTML = Object.keys(window.holdsData).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
    }

    const QUEST_TEMPLATES = [
        { kind: 'bounty', giverRole: /ярл|управител/i, title: n => `Охота за головами: логово у «${n}»`,
          desc: (giver, loc) => `${giver} объявил(а) награду за зачистку опасного места — ${loc}.`,
          req: loc => `Зачистить ${loc} от обосновавшихся там врагов.` },
        { kind: 'fetch', giverRole: /маг|жрец|алхимик/i, title: n => `Поручение: находка из «${n}»`,
          desc: (giver, loc) => `${giver} просит принести редкий предмет или книгу из ${loc}.`,
          req: loc => `Добыть нужный предмет в ${loc} и вернуть заказчику.` },
        { kind: 'escort', giverRole: /купец|торговец|трактирщик/i, title: n => `Поручение от «${n}»`,
          desc: (giver, loc) => `${giver} просит помощи — дело связано с ${loc}.`,
          req: loc => `Разобраться с делом в ${loc} и вернуться с докладом.` }
    ];

    window.generateHoldQuest = function () {
        const holdName = el('qgen-hold-select').value;
        const difficulty = el('qgen-difficulty').value;
        const hold = window.holdsData && window.holdsData[holdName];
        if (!hold) { alert('Нет данных по этому владению.'); return; }
        // "npcs" вперемешку содержит и реальных именных NPC (role непустой), и заголовки
        // городов/разделов (role пустой) — отсеиваем вторые.
        const realNpcs = (hold.npcs || []).filter(n => n.role);
        const locations = (hold.locations || []).filter(l => l.name);
        if (!realNpcs.length || !locations.length) { alert('В базе этого владения не хватает NPC или локаций для генерации.'); return; }
        const template = QUEST_TEMPLATES[Math.floor(Math.random() * QUEST_TEMPLATES.length)];
        const matchingGivers = realNpcs.filter(n => template.giverRole.test(n.role));
        const giver = (matchingGivers.length ? matchingGivers : realNpcs)[Math.floor(Math.random() * (matchingGivers.length ? matchingGivers.length : realNpcs.length))];
        const loc = locations[Math.floor(Math.random() * locations.length)];
        const giverLabel = `${giver.name} (${giver.role})`;

        // Награда по сложности — база × уровень персонажа. Уровень тут неизвестен (квест ещё не
        // привязан к конкретному игроку), берём среднюю оценку мастера явно не нужна — просто
        // фиксированная база по сложности, мастер поправит число в поле вручную при желании.
        const goldByDiff = { low: 100, mid: 250, high: 500 };
        const gold = goldByDiff[difficulty] || 250;

        el('quest-title-input').value = template.title(holdName);
        el('quest-desc-input').value = template.desc(giverLabel, loc.name);
        el('quest-req-input').value = template.req(loc.name);
        el('quest-reward-input').value = `${gold} септимов` + (difficulty === 'high' ? ' + ценный предмет по усмотрению мастера' : '');
    };

    // Квест — командой в лист игрока (gmCmds), как и остальные правки мастера: прямую запись playerQuests
    // затирало следующее автосохранение игрока (лист хранит свой список квестов).
    async function grantQuestToUid(uid, quest) {
        await db.collection('characters').doc(uid).set({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'quest', quest }) }, { merge: true });
    }

    window.grantQuest = function () {
        const title = el('quest-title-input').value.trim();
        if (!title) { alert('Укажи название квеста.'); return; }
        const quest = {
            id: genQuestId(),
            title: title,
            desc: el('quest-desc-input').value.trim(),
            requirement: el('quest-req-input').value.trim(),
            reward: el('quest-reward-input').value.trim(),
            guild: el('quest-guild-select').value || null,
            kind: (el('quest-kind-select') || {}).value || null,
            status: 'active'
        };
        const target = el('quest-target-player').value;
        const resultEl = el('quest-grant-result');
        let uids;
        if (target === 'all') {
            uids = Object.keys(lastData.participants || {});
            if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        } else {
            if (!target) { resultEl.innerHTML = '<span style="color:#e74c3c;">Выбери получателя.</span>'; return; }
            uids = [target];
        }
        Promise.all(uids.map(uid => grantQuestToUid(uid, quest))).then(() => {
            resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Квест «${escapeHtml(title)}» выдан (${uids.length} игрок(ов)).</span>`;
            gmPostLogEntryText(`📜 Мастер выдал квест «${title}» (${target === 'all' ? 'всей группе' : ((lastData.participants[target] || {}).name || target)}).`);
            try { window.rumAddDeed({ kind: 'quest', what: title, who: target === 'all' ? rumPartyNames() : [((lastData.participants || {})[target] || {}).name].filter(Boolean) }); } catch (e) { }
            el('quest-title-input').value = '';
            el('quest-desc-input').value = '';
            el('quest-req-input').value = '';
            el('quest-reward-input').value = '';
        }).catch(e => {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>';
        });
    };

    // ---------- Награда на всю группу ----------

    window.filterPartyRewardItems = function () {
        const query = (el('party-reward-item-search').value || '').toLowerCase();
        const select = el('party-reward-item-select');
        if (!select) return;
        if (!query) { select.innerHTML = '<option value="">— без предмета —</option>'; return; }
        const matches = (gmAllItems || []).filter(i => (i.name || '').toLowerCase().includes(query)).slice(0, 30);
        select.innerHTML = '<option value="">— без предмета —</option>' +
            matches.map((i, idx) => `<option value="${escapeHtml(i.id || i.name)}">${escapeHtml(i.name)} (${escapeHtml(i.category || '')})</option>`).join('');
    };

    window.grantPartyReward = function () {
        const gold = parseInt(el('party-reward-gold').value) || 0;
        const itemId = el('party-reward-item-select').value;
        const itemQty = parseInt(el('party-reward-item-qty').value) || 1;
        const resultEl = el('party-reward-result');
        const uids = Object.keys(lastData.participants || {});
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        if (!gold && !itemId) { resultEl.innerHTML = '<span style="color:#e74c3c;">Укажи золото или предмет.</span>'; return; }

        const sourceItem = itemId ? gmAllItemsByKey.get(itemId) : null; // O(1) вместо O(n) — см. loadGmItems
        const toStash = !!(el('party-reward-to-stash') && el('party-reward-to-stash').checked);
        const itemExtra = sourceItem ? gmItemExtraFromSource(sourceItem) : {};
        if (sourceItem && !gmAskChargeDays(itemExtra, sourceItem.name)) return;

        // Эпик 2.1: раньше награда уходила каждому игроку напрямую, теперь по умолчанию — в общий сундук отряда,
        // потому что группа сама решает, кому что нужно; галочка снята — старое поведение (всем поровну напрямую).
        if (toStash) {
            const ref = db.collection('sessions').doc(currentCode);
            const stashItem = sourceItem ? stripUndefinedDeep(Object.assign({ itemId: sourceItem.name, name: sourceItem.name, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemExtra)) : null;
            db.runTransaction(tx => tx.get(ref).then(doc => {
                const d = doc.data() || {};
                const upd = {};
                if (gold) upd.partyGold = (parseInt(d.partyGold) || 0) + gold;
                if (stashItem) {
                    const st = Array.isArray(d.partyStash) ? d.partyStash.slice() : [];
                    const ex = st.find(s => s.itemId === stashItem.itemId);
                    if (ex) ex.count = (ex.count || 0) + itemQty; else st.push(Object.assign({}, stashItem, { count: itemQty }));
                    upd.partyStash = st;
                }
                tx.update(ref, upd);
            })).then(() => {
                const parts = [];
                if (gold) parts.push(`${gold} золота`);
                if (sourceItem) parts.push(`${itemQty}× «${sourceItem.name}»`);
                resultEl.innerHTML = `<span style="color:#2ecc71;">✅ В сундук отряда: ${parts.join(' + ')}.</span>`;
                gmPostLogEntryText(`🎁 Мастер положил в сундук отряда: ${parts.join(' + ')}.`);
            }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
            return;
        }

        // Золото — атомарный FieldValue.increment(), а не "прочитать старое значение + прибавить
        // + записать целиком". Раньше тут читалось doc.data().gold (могло быть УСТАРЕВШИМ, если
        // игрок только что залутал труп — его автосохранение задерживается на 800мс) и писалось
        // поверх — если автосохранение игрока срабатывало ПОСЛЕ, оно перезаписывало это своим
        // локальным (тоже отстающим от выдачи мастера) значением. Инкремент не читает вообще —
        // Firestore сам прибавляет к тому, что там СЕЙЧАС, никакой гонки для золота больше нет.
        Promise.all(uids.map(uid => {
            const update = {};
            const addGold = () => gold ? gmAddGold(uid, gold) : null;
            if (!sourceItem) return addGold();
            // Предмет по-прежнему требует прочитать текущий инвентарь (нужно проверить, есть ли
            // уже такой стек) — тут гонка технически остаётся, но она намного уже без золота
            // в этой же операции, и out-of-band риск метаться отдельно от inventory игрока.
            return db.collection('characters').doc(uid).get().then(doc => {
                const data = doc.exists ? doc.data() : {};
                const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
                const invId = sourceItem.name; // см. gmGiveItemFromTable: itemId = название
                gmMergeInvItem(inv, { itemId: invId, name: sourceItem.name, weight: sourceItem.weight || 0, category: sourceItem.category || '', effect: sourceItem.effect || '' }, itemQty, Object.assign({}, itemExtra));
                update.inventory = inv;
                return db.collection('characters').doc(uid).update(update);
            }).then(addGold);
        })).then(() => {
            const parts = [];
            if (gold) parts.push(`${gold} золота`);
            if (sourceItem) parts.push(`${itemQty}× «${sourceItem.name}»`);
            resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Выдано всем (${uids.length}): ${parts.join(' + ')}.</span>`;
            gmPostLogEntryText(`🎁 Мастер выдал всей группе: ${parts.join(' + ')}.`);
        }).catch(e => {
            resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>';
        });
    };

    // ---------- Запросы на крафт (эпик 2.8) ----------
    // Заказ уходит игроку командой craftOrder через очередь pendingStatusEffects (как команды смерти) — GM не пишет в characters/{uid}.craftOrders напрямую,
    // чтобы не затереть/не быть затёртым автосохранением игрока.
    function renderCraftOrderSelects() {
        const holdSel = el('craft-order-hold');
        if (holdSel && window.holdsData && holdSel.options.length <= 1) holdSel.innerHTML = '<option value="">—</option>' + Object.keys(window.holdsData).map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        const t = el('craft-order-target'); if (!t) return;
        const cur = t.value;
        const parts = lastData.participants || {};
        t.innerHTML = '<option value="all">Всем игрокам</option>' + Object.keys(parts).map(u => `<option value="${u}">${escapeHtml((parts[u] || {}).name || '?')}</option>`).join('');
        t.value = cur && (cur === 'all' || parts[cur]) ? cur : 'all';
    }
    window.filterCraftOrderItems = function () {
        const q = (el('craft-order-item-search').value || '').toLowerCase();
        const sel = el('craft-order-item-select');
        if (!q) { sel.innerHTML = '<option value="">— выбери предмет —</option>'; return; }
        const m = (gmAllItems || []).filter(i => (i.name || '').toLowerCase().includes(q)).slice(0, 30);
        sel.innerHTML = '<option value="">— выбери предмет —</option>' + m.map(i => `<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)} (${escapeHtml(i.category || '')})</option>`).join('');
    };
    window.sendCraftOrder = function () {
        const resultEl = el('craft-order-result');
        const npc = (el('craft-order-npc').value || '').trim();
        const itemName = el('craft-order-item-select').value;
        const qty = Math.max(1, parseInt(el('craft-order-qty').value) || 1);
        const reward = Math.max(0, parseInt(el('craft-order-reward').value) || 0);
        if (!npc || !itemName) { resultEl.innerHTML = '<span style="color:#e74c3c;">Укажи NPC и предмет.</span>'; return; }
        const target = el('craft-order-target').value;
        const uids = target === 'all' ? Object.keys(lastData.participants || {}) : [target];
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        const orderId = 'order_' + Date.now() + Math.random().toString(36).slice(2, 5);
        const cmd = { id: 'co-' + orderId, cmd: 'craftOrder', orderId, npc, hold: el('craft-order-hold').value || '', itemName, qty, reward, fromGm: true, shared: target === 'all' }; // «всем»: сдать может только первый
        const patch = {};
        uids.forEach(u => { patch['participants.' + u + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(cmd); });
        patch.combatLog = firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `📋 Заказ от ${npc}: ${qty}× ${itemName} → ${formatNumber(reward)} зол.${target === 'all' ? ' (всем — награду получит тот, кто сдаст первым)' : ''}` });
        db.collection('sessions').doc(currentCode).update(patch)
            .then(() => { resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Заказ отправлен (${uids.length}).</span>`; })
            .catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };

    // ---------- Сундук отряда: отображение и «Раздать всем» (эпик 2.1) ----------
    function renderGmStash(data) {
        const g = el('gm-stash-gold'); if (!g) return;
        g.textContent = formatNumber(parseInt(data.partyGold) || 0);
        const items = [];
        (Array.isArray(data.partyStash) ? data.partyStash : []).forEach(s => {
            const same = typeof window.findSameStack === 'function' ? window.findSameStack(items, s) : null;
            if (same) same.count = (same.count || 0) + (s.count || 0); else items.push(Object.assign({}, s));
        });
        el('gm-stash-list').innerHTML = items.length
            ? items.map(i => `<div style="font-size:14px;">• ${escapeHtml(i.name)} × ${i.count}</div>`).join('')
            : '<span style="opacity:.6; font-size:13px;">Предметов нет.</span>';
    }
    window.gmStashDistribute = function () {
        const resultEl = el('gm-stash-result');
        const uids = Object.keys(lastData.participants || {});
        if (!uids.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В сессии нет игроков.</span>'; return; }
        const n = uids.length;
        const ref = db.collection('sessions').doc(currentCode);
        let plan = null;
        // Сначала транзакция ВЫЧИТАЕТ из сундука долю (чтобы игроки не успели забрать то же самое), потом раздаём по персонажам.
        db.runTransaction(tx => tx.get(ref).then(doc => {
            const d = doc.data() || {};
            const gold = parseInt(d.partyGold) || 0;
            const perGold = Math.floor(gold / n);
            const st = [];
            (Array.isArray(d.partyStash) ? d.partyStash : []).forEach(s => { // одинаковые зелья с разными itemId — одной стопкой
                const same = typeof window.findSameStack === 'function' ? window.findSameStack(st, s) : null;
                if (same) same.count = (same.count || 0) + (s.count || 0); else st.push(Object.assign({}, s));
            });
            const give = [];
            const rest = st.map(s => {
                const per = Math.floor((s.count || 0) / n);
                if (per > 0) give.push(Object.assign({}, s, { count: per }));
                return Object.assign({}, s, { count: (s.count || 0) - per * n });
            }).filter(s => s.count > 0);
            plan = { perGold, give };
            if (!perGold && !give.length) return;
            tx.update(ref, { partyGold: gold - perGold * n, partyStash: rest });
        })).then(() => {
            if (!plan || (!plan.perGold && !plan.give.length)) { resultEl.innerHTML = '<span style="color:#e6b800;">Делить нечего (на каждого меньше единицы).</span>'; return; }
            return Promise.all(uids.map(uid => {
                const cref = db.collection('characters').doc(uid);
                const upd = {};
                const addGold = () => plan.perGold ? gmAddGold(uid, plan.perGold) : null;
                if (!plan.give.length) return addGold();
                return cref.get().then(doc => {
                    const inv = Array.isArray((doc.data() || {}).inventory) ? doc.data().inventory.slice() : [];
                    // Заточенное/зачарованное — всегда своей строкой; остальное по правилам gmMergeInvItem
                    // (краденое «имя#stolen» не смешивается с чистым, обычное не ложится на заточенное).
                    plan.give.forEach(g => {
                        if (g.temperTier || g.enchantment) {
                            const it = Object.assign({}, g);
                            if (inv.some(i => i.itemId === it.itemId)) it.itemId = it.itemId + '#' + Date.now() + Math.floor(Math.random() * 1000);
                            inv.push(it);
                            return;
                        }
                        const extra = Object.assign({}, g); delete extra.itemId; delete extra.count;
                        gmMergeInvItem(inv, { itemId: g.itemId, name: g.name }, g.count, extra);
                    });
                    upd.inventory = stripUndefinedDeep(inv);
                    return cref.update(upd);
                }).then(addGold);
            })).then(() => {
                const parts = [];
                if (plan.perGold) parts.push(plan.perGold + ' зол.');
                plan.give.forEach(g => parts.push(g.count + '× ' + g.name));
                resultEl.innerHTML = `<span style="color:#2ecc71;">✅ Роздано каждому (${n}): ${escapeHtml(parts.join(', '))}.</span>`;
                gmPostLogEntryText(`⚖ Мастер разделил сундук отряда поровну: каждому ${parts.join(', ')}.`);
            });
        }).catch(e => { resultEl.innerHTML = '<span style="color:#e74c3c;">Ошибка: ' + escapeHtml(e.message) + '</span>'; });
    };
