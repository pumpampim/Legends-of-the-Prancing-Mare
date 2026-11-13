
    // ---------- Разрешить атаку (НПС → игрок) ----------

    let pendingGmAttack = null; // { targetUid, dmg, logText }
    // Знак «Атронах»: успешное поглощение магии (спасбросок) полностью отменяет заклинание (решение мастера).
    const ATRONACH_ABSORB_NEGATES_SPELL = true;

    function parseSpellDamageForGm(desc) {
        if (!desc) return null;
        // [а-яёА-ЯЁ] вместо \w — та же кириллическая ловушка, что чинил в index.html.
        const m = desc.match(/нанос[а-яёА-ЯЁ]*\s+(\d+)\s*(?:ед\.?|единиц)?\s*(?:физ[а-яёА-ЯЁ]*\s+|огненн[а-яёА-ЯЁ]*\s+|ледян[а-яёА-ЯЁ]*\s+|электрич[а-яёА-ЯЁ]*\s+|яд[а-яёА-ЯЁ]*\s+)?урон/i) ||
                  desc.match(/(\d+)\s*(?:ед\.?|единиц)?\s*(?:физ[а-яёА-ЯЁ]*\s+)?урон/i);
        return m ? parseInt(m[1]) : null;
    }

    // Перенесено выше populateGmAttackSelects — раньше стояло НИЖЕ, но populateGmAttackSelects
    // (вызывается из renderAll на каждый снапшот сессии, в т.ч. самый первый при загрузке
    // страницы) звало onGmAttackAttackerPicked() ДО того, как этот window.-присвоение вообще
    // успевало выполниться построчно сверху вниз — ReferenceError "is not defined", и весь
    // остаток инициализации после этой строки просто не происходил.
    // Заклинания врага, которые НЕ атакуют игрока: лечение (dmg — сколько лечит), невидимость, обереги/броня, призыв.
    // Раньше они шли как атака: «Быстрое лечение» на 50 снимало игроку 50 ХП.
    const ENEMY_HEAL_DEFAULT = { 'Лечение': 20, 'Быстрое лечение': 50, 'Исцеление': 50 };
    function gmEnemySupportSpell(s) {
        const n = String((s && s.name) || '').toLowerCase();
        if (/лечени|исцелени|восстановлени/.test(n)) return 'heal';
        if (/невидим/.test(n)) return 'invis';
        // Страх/Ярость/Успокоение — не на себя: накладываются на цель как статус (раньше считались кастом на себя и до игрока не доходили).
        if (/оберег|броня|плоть|кож[аи]|призыв|вызов|оживлени|поднят|ускорени|плащ/.test(n) && !(s.dmg > 1)) return 'self'; // «Морозный плащ» без урона — бафф на себя
        return null;
    }
    // Статус, который управляющее заклинание врага вешает на игрока.
    function gmEnemyControlStatus(s) {
        const n = String((s && s.name) || '').toLowerCase();
        if (s && s.dmg > 1) return '';
        if (/страх|бегств|отпугиван/.test(n)) return 'fear';
        if (/ярост|бешенств/.test(n)) return 'frenzy';
        if (/успокоени|умиротворени/.test(n)) return 'calm';
        return '';
        return null;
    }
    // Мана врага: заклинание стоит cost МП. Если у врага ведётся мана (maxMp > 0), без маны — не кастует.
    function gmEnemyPayMana(enemy, cost) {
        if (!cost || !(enemy.maxMp > 0) || typeof enemy.curMp !== 'number') return { ok: true, tracked: false };
        if (enemy.curMp < cost) return { ok: false };
        const enemies = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curMp: e.curMp - cost }) : e);
        gmUpdateEnemies(enemies).catch(e => console.error(e));
        return { ok: true, tracked: true, left: enemy.curMp - cost };
    }
    // Атакующее заклинание: при броске только проверяем, хватает ли маны; списываем при «Применить» (gmChargePendingMana) —
    // раньше каждый переброс той же атаки снова снимал МП.
    function gmEnemyManaCheck(enemy, cost) {
        if (!cost || !(enemy.maxMp > 0) || typeof enemy.curMp !== 'number') return { ok: true, tracked: false };
        if (enemy.curMp < cost) return { ok: false };
        return { ok: true, tracked: true, left: enemy.curMp - cost };
    }
    function gmChargePendingMana(pa) {
        if (!pa || !pa.manaDue) return;
        const en = (lastData.enemies || []).find(e => e.id === pa.enemyId);
        if (en) gmEnemyPayMana(en, Math.min(pa.manaDue, typeof en.curMp === 'number' ? en.curMp : pa.manaDue));
        pa.manaDue = 0;
    }
    window.onGmAttackAttackerPicked = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const actionSelect = el('gm-attack-action-select');
        if (!actionSelect) return;
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        if (!enemy) { actionSelect.innerHTML = '<option value="">—</option>'; return; }
        let opts = '';
        if (enemy.weaponDmg) opts += `<option value="weapon">Оружие (${enemyWeaponDamage(enemy).total} урона${enemy.weaponNote ? ' — ' + escapeHtml(enemy.weaponNote) : ''})</option>`;
        (enemy.spells || []).forEach((s, i) => {
            const sup = gmEnemySupportSpell(s);
            const ctl = sup ? '' : gmEnemyControlStatus(s);
            opts += `<option value="spell:${i}">${escapeHtml(s.name)} (${sup ? (sup === 'heal' ? 'на себя: лечит ' + (s.dmg || 0) : 'на себя') : ctl ? 'на цель: ' + GM_STATUS_EFFECTS[ctl].name : (s.dmg || 0) + ' урона'} / ${s.cost || 0} МП)</option>`;
        });
        (enemy.shouts || []).forEach((s, i) => {
            opts += `<option value="shout:${i}">🗣️ ${escapeHtml(s.name)} (эффект, без прямого урона)</option>`;
        });
        actionSelect.innerHTML = opts || '<option value="">У этого противника нет известных действий — впиши урон вручную в журнал</option>';
    };

    function populateGmAttackSelects() {
        const attackerSelect = el('gm-attack-attacker-select');
        const targetSelect = el('gm-attack-target-select');
        if (!attackerSelect || !targetSelect) return;
        const enemies = (lastData.enemies || []).filter(e => (e.curHp || 0) > 0);
        const prevAtk = attackerSelect.value;
        attackerSelect.innerHTML = enemies.length
            ? enemies.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (HP ${e.curHp}/${e.maxHp})</option>`).join('')
            : '<option value="">Нет живых противников</option>';
        if (enemies.some(e => e.id === prevAtk)) attackerSelect.value = prevAtk;

        const uids = Object.keys(lastData.participants || {});
        const prevTgt = targetSelect.value;
        // Цели: игроки, их призванные существа (summon:uid:id) и животные (pet:uid:id).
        const tgtOpts = [];
        uids.forEach(uid => {
            const p = lastData.participants[uid] || {};
            tgtOpts.push(`<option value="${uid}">${escapeHtml(p.name || uid)}</option>`);
            (p.summons || []).filter(sm => (sm.curHp || 0) > 0).forEach(sm => tgtOpts.push(`<option value="summon:${uid}:${escapeHtml(sm.id)}">　👻 ${escapeHtml(sm.name)} (${escapeHtml(p.name || uid)}, HP ${sm.curHp}/${sm.maxHp})</option>`));
            (p.pets || []).filter(pt => (pt.hp || 0) > 0).forEach(pt => tgtOpts.push(`<option value="pet:${uid}:${escapeHtml(pt.id)}">　${escapeHtml(pt.icon || '🐾')} ${escapeHtml(pt.name)} (${escapeHtml(p.name || uid)}, HP ${pt.hp}/${pt.maxHp})</option>`));
        });
        targetSelect.innerHTML = tgtOpts.length ? tgtOpts.join('') : '<option value="">Нет игроков в сессии</option>';
        if (Array.from(targetSelect.options).some(o => o.value === prevTgt)) targetSelect.value = prevTgt;

        onGmAttackAttackerPicked();
    }
    window.populateGmAttackSelects = populateGmAttackSelects; // для боевой сетки (кнопка «Цель для атаки противника»)

    // Цель атаки врага: игрок (uid) или его существо — 'summon:uid:id' (призванное) / 'pet:uid:id' (животное).
    function gmResolveAttackTarget(val) {
        const m = /^(summon|pet):([^:]+):(.+)$/.exec(String(val || ''));
        const parts = (lastData && lastData.participants) || {};
        if (!m) return { kind: 'player', uid: val, name: (parts[val] || {}).name || val };
        const owner = parts[m[2]] || {};
        const list = m[1] === 'summon' ? (owner.summons || []) : (owner.pets || []);
        const c = list.find(x => x.id === m[3]);
        return { kind: m[1], uid: m[2], id: m[3], ownerName: owner.name || m[2], comp: c || null, name: c ? c.name : '?' };
    }

    // Остаток колчана стрелка — в добычу с трупа (enemy-loot.js → withQuiver).
    function gmWithQuiverLoot(loot, enemy) {
        return window.EnemyLoot && EnemyLoot.withQuiver ? EnemyLoot.withQuiver(loot, enemy, gmAllItems || []) : loot;
    }
    window.gmWithQuiverLoot = gmWithQuiverLoot;

    window.rollGmAttack = function () {
        const attackerId = el('gm-attack-attacker-select').value;
        const tgt = gmResolveAttackTarget(el('gm-attack-target-select').value);
        const targetUid = tgt.uid;
        const actionVal = el('gm-attack-action-select').value;
        const resultBox = el('gm-attack-roll-result');
        const textEl = el('gm-attack-roll-text');
        const enemy = (lastData.enemies || []).find(e => e.id === attackerId);
        const targetName = tgt.kind === 'player' ? tgt.name : tgt.name + ' (' + tgt.ownerName + ')';
        if (!enemy || !targetUid || !actionVal) { alert('Выбери атакующего, цель и действие.'); return; }
        if (tgt.kind !== 'player' && !tgt.comp) { alert('Этого существа уже нет — обнови список целей.'); populateGmAttackSelects(); return; }
        if (actionVal.indexOf('spell:') === 0) {
            const hands = gmEnemyHands(enemy);
            if (hands === 'two' || hands === 'both') { alert(`«${enemy.name}» не может колдовать: в руках ${GM_HANDS_LABEL[hands].replace(/^\S+\s/, '')}. Смени у врага «В руках» на «руки свободны» или «одно одноручное» — это его действие в этом ходу.`); return; }
        }
        if (actionVal === 'weapon' && gmEnemyHands(enemy) === 'free' && enemy.weaponDmg && !confirm(`У «${enemy.name}» руки свободны (оружие убрано). Всё равно атаковать оружием?`)) return;
        const enemyFlags = window.StCombat.statusFlags(enemy);
        // Колчан: стрелок с пустым колчаном бьёт луком/арбалетом вблизи (половина урона оружия + СИЛ).
        const noAmmo = actionVal === 'weapon' && !!enemy.isRanged && !!enemy.ammo && (enemy.ammo.qty || 0) <= 0;
        const shooter = noAmmo ? Object.assign({}, enemy, { isRanged: false, weaponDmg: Math.round((enemy.weaponDmg || 0) / 2) }) : enemy;
        { const blk = enemyFlags.noAttack;
          if (blk) { alert('«' + enemy.name + '» не может атаковать: ' + blk.name + (blk.turns ? ' (ещё ' + blk.turns + ' х.)' : '') + '. Сними статус, если нужно разрешить атаку.'); return; } }

        // Боевая сетка: досягаемость/видимость врага и штраф за дальность (если оба стоят на сетке)
        let gridChk = null;
        if (window.GridCore && lastData.grid) {
            const Gc = window.GridCore;
            const mode = actionVal === 'weapon' ? (shooter.isRanged ? 'ranged' : 'melee') : actionVal.indexOf('spell:') === 0 ? 'spell' : null;
            if (mode) {
                const reach = /копь|пик[аи]|посох|молот|алебард/i.test(String(enemy.weaponNote || '') + ' ' + enemy.name) ? 10 : 5;
                const tgtTok = tgt.kind === 'player' ? Gc.tokenOf(lastData.grid, 'p', targetUid) : Gc.tokenOf(lastData.grid, 's', tgt.id, targetUid); // существо на сетке — фигура 's'
                gridChk = Gc.attackCheck(lastData.grid, Gc.tokenOf(lastData.grid, 'e', enemy.id), tgtTok, mode, reach);
                if (gridChk.onGrid && !gridChk.ok && !confirm('«' + enemy.name + '» не достаёт «' + targetName + '»: ' + gridChk.reason + '.\n\nВсё равно атаковать?')) return;
            }
        }
        let dmg = 0, dmgType = 'physical', actionLabel = '', atkMod = 0, dmgBreakdown = '';
        let isSpellAttack = false, spellCost = 0, statusNote = '', physShot = false;
        if (actionVal === 'weapon') {
            const wd = enemyWeaponDamage(shooter);
            dmg = wd.total;
            // Статусы от зелий/ядов на самом враге: «Увеличение физ.урона» (+%) и «Повреждение наносимого физ.урона» (−N).
            let stPct = 0, stFlat = 0;
            (enemy.statusEffects || []).forEach(s => { stPct += s.dmgPct || 0; stFlat += s.dmgFlat || 0; });
            if (stPct) dmg = Math.round(dmg * (1 + stPct / 100));
            if (stFlat) dmg = Math.max(0, dmg + stFlat);
            if (stPct || stFlat) statusNote = ` (эффекты на враге: ${stPct ? '+' + stPct + '%' : ''}${stPct && stFlat ? ', ' : ''}${stFlat ? stFlat : ''})`;
            dmgBreakdown = (wd.stat ? ` (оружие ${wd.base} + ${wd.label} ${wd.stat})` : '') + statusNote;
            actionLabel = noAmmo ? `оружием вблизи (${enemy.ammo.bolt ? 'болты' : 'стрелы'} кончились)` : 'оружием';
            if (enemy.isRanged && enemy.ammo && !noAmmo) { // выстрел тратит одну стрелу/болт — и при промахе тоже
                const left = Math.max(0, (enemy.ammo.qty || 0) - 1);
                actionLabel += ` (${enemy.ammo.name}: осталось ${left})`;
                gmUpdateEnemies((lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { ammo: Object.assign({}, e.ammo, { qty: left }) }) : e)).catch(e => console.error(e));
            }
            // Модификатор атаки — СИЛ для ближнего, ЛОВ для дальнего (если у противника вообще
            // есть характеристики — генератор бандитов их теперь даёт, база enemies-data.js нет,
            // тогда 0). Тот же принцип, что у самого игрока: атакующий с модификатором против
            // ГОЛОГО броска защищающегося.
            atkMod = shooter.isRanged ? calcAbilityMod(enemy.dex || 10) : calcAbilityMod(enemy.str || 10);
            if (shooter.isRanged && gmWeatherRanged()) { atkMod += gmWeatherRanged(); actionLabel += ` (погода ${gmWeatherRanged()})`; } // дождь/гроза/метель/туман мешают и вражеским стрелкам
        } else if (actionVal.indexOf('spell:') === 0) {
            const s = enemy.spells[parseInt(actionVal.slice(6))];
            const costS = s ? (parseInt(s.cost) || 0) : 0;
            const sup = gmEnemySupportSpell(s);
            const pay = sup ? gmEnemyPayMana(enemy, costS) : gmEnemyManaCheck(enemy, costS); // заклинание на себя срабатывает сразу
            if (!pay.ok) { alert(`У «${enemy.name}» не хватает маны на «${s.name}»: нужно ${costS}, есть ${enemy.curMp}.`); return; }
            if (sup) { // заклинание на себя — не атака по игроку
                const parts = [];
                if (sup === 'heal') {
                    // У шаманов в таблице лечение без числа (0) — берём базовое значение заклинания игрока (spell-data: Лечение 20, Быстрое лечение 50).
                    const healAmt = parseInt(s.dmg) || ENEMY_HEAL_DEFAULT[s.name] || 0;
                    const healed = Math.max(0, Math.min((enemy.maxHp || 0) - (enemy.curHp || 0), healAmt));
                    const after = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curHp: (e.curHp || 0) + healed, curMp: pay.tracked ? pay.left : e.curMp }) : e);
                    gmUpdateEnemies(after).catch(e => console.error(e));
                    parts.push(`восстанавливает ${healed} ХП`);
                } else if (sup === 'invis') {
                    const after = (lastData.enemies || []).map(e => e.id === enemy.id ? Object.assign({}, e, { curMp: pay.tracked ? pay.left : e.curMp, statusEffects: (e.statusEffects || []).filter(x => x.name !== 'Невидимость').concat([{ id: 'st' + Date.now(), name: 'Невидимость', desc: 'не виден, пока не атакует', turns: 3 }]) }) : e);
                    gmUpdateEnemies(after).catch(e => console.error(e));
                    parts.push('становится невидимым');
                } else parts.push('колдует на себя');
                gmPostLogEntryText(`✨ ${enemy.name}: «${s.name}» — ${parts.join(', ')}${pay.tracked ? ` (−${costS} МП, осталось ${pay.left})` : ''}.`);
                return;
            }
            dmg = s ? s.dmg : 0;
            dmgType = mapEnemyDmgType(s ? s.name : '');
            // «Дальний выстрел» сферы — физический выстрел (болт), не заклинание: без поглощения магии и оберегов, мод. Ловкости.
            physShot = /^дальний выстрел/i.test((s && s.name) || '');
            isSpellAttack = !physShot; spellCost = physShot ? 0 : costS;
            if (pay.tracked) statusNote = ` (−${costS} МП, осталось ${pay.left})`;
            actionLabel = physShot ? `выстрелом «${s.name}»${statusNote}` : `заклинанием «${s ? s.name : '?'}»${statusNote}`;
            atkMod = physShot ? calcAbilityMod(enemy.dex || 10) : calcAbilityMod(enemy.int || 10);
        } else if (actionVal.indexOf('shout:') === 0) {
            const s = enemy.shouts[parseInt(actionVal.slice(6))];
            dmg = 0;
            actionLabel = `криком «${s ? s.name : '?'}» (${s ? s.effect : ''})`;
        }

        // Встречный бросок 2д20 — как и у самой атаки игрока: атакующий (враг) кидает 1д20+мод,
        // защищающийся (игрок) — голый 1д20, ничья не считается ни попаданием ни промахом (перекид
        // обеих костей). Раньше тут был просто один голый d20 без всякого сравнения — по сути,
        // "бросок ради галочки", не влиявший ни на что.
        // «Бардовская баллада» (играет другой игрок): защищающемуся +1 к кубам.
        const defBonus = (tgt.kind === 'player' && lastData.bardSong && lastData.bardSong.uid && lastData.bardSong.uid !== targetUid) ? 1 : 0;
        if (gridChk && gridChk.onGrid && gridChk.penalty) { atkMod += gridChk.penalty; actionLabel += ` (дальность ${gridChk.feet} фт: ${gridChk.penalty})`; }
        else if (gridChk && gridChk.onGrid) actionLabel += ` (${gridChk.feet} фт)`;
        if (enemyFlags.rollPenalty) { atkMod += enemyFlags.rollPenalty; actionLabel += ` (статусы на враге: ${enemyFlags.rollPenalty} к кубам)`; }
        if (enemyFlags.frenzy) actionLabel += ` (🌀 «${enemyFlags.frenzy.name}»: бьёт любую цель, включая своих)`;
        let enemyRoll, enemyTotal, playerRoll, rerolls = 0;
        do {
            enemyRoll = Math.floor(Math.random() * 20) + 1;
            enemyTotal = enemyRoll + atkMod;
            playerRoll = Math.floor(Math.random() * 20) + 1;
            if (enemyTotal !== playerRoll + defBonus) break;
            rerolls++;
        } while (rerolls < 20);
        const hit = enemyTotal > playerRoll + defBonus;
        const playerRollShown = playerRoll + (defBonus ? ' +1 (🎵 баллада) = ' + (playerRoll + defBonus) : '');

        let statusKey = el('gm-attack-status-select') ? el('gm-attack-status-select').value : '';
        if (!statusKey && actionVal.indexOf('spell:') === 0) statusKey = gmEnemyControlStatus(enemy.spells[parseInt(actionVal.slice(6))]);

        pendingGmAttack = {
            targetUid, enemyId: enemy.id, dmg: hit ? dmg : 0, dmgType, statusKey: hit ? statusKey : '', enemyName: enemy.name, targetName, hit,
            targetKind: tgt.kind, compId: tgt.id || null, // существо игрока: урон идёт ему, а не хозяину
            isRangedAtk: (actionVal === 'weapon' && !!shooter.isRanged) || physShot,
            enemyUndeadDaedra: (enemy.kind === 'undead' || enemy.kind === 'daedra' || /скелет|драугр|нежить|привед|зомби|вампир|гончая смерти|жрец-дракон|дремора|атронах|даэдр/i.test(enemy.name || '')),
            isSpell: !!(hit && isSpellAttack), spellCost,
            manaDue: (isSpellAttack && spellCost && enemy.maxMp > 0 && typeof enemy.curMp === 'number') ? spellCost : 0, // мана — при «Применить», и при промахе тоже
            // Теги болезни (carrierOfDisease/diseaseChance) — для автоматического броска на
            // заражение при попадании физической атакой, см. applyGmAttackDamage.
            carrierOfDisease: hit ? gmEnemyDisease(enemy).name : null, diseaseChance: hit ? gmEnemyDisease(enemy).chance : 0,
            logTextBase: `👹 ${enemy.name} атакует ${targetName} ${actionLabel}: враг ${enemyTotal} (к20 ${enemyRoll}${atkMod >= 0 ? '+' : ''}${atkMod}) vs ${tgt.kind === 'player' ? 'игрок' : 'существо'} ${playerRollShown}${rerolls ? ` (перекид ×${rerolls})` : ''} — ${hit ? 'ПОПАДАНИЕ' : 'ПРОМАХ'}`
        };
        textEl.innerHTML = `<strong>${escapeHtml(enemy.name)}</strong> атакует <strong>${escapeHtml(targetName)}</strong> ${actionLabel}<br>` +
            `Враг: 1d20 (${enemyRoll}) ${atkMod >= 0 ? '+' : ''}${atkMod} = <strong style="color:var(--accent-color, #c9a86c);">${enemyTotal}</strong> vs ${tgt.kind === 'player' ? 'Игрок' : 'Существо'}: 1d20 = <strong style="color:var(--accent-color, #c9a86c);">${playerRollShown}</strong>${rerolls ? `<br><span style="opacity:.7;">Перекид из-за ничьей: ×${rerolls}</span>` : ''}<br>` +
            (!hit ? `<strong style="color:#7a7a7a;">❌ Промах — урона нет.</strong>` :
                dmg ? `<strong style="color:#2ecc71;">✅ Попадание!</strong> Базовый урон: <span style="color:#e74c3c; font-size:16px; font-weight:bold;">${dmg}</span> ед.${dmgBreakdown} (резист цели вычтется автоматически при применении)` :
                    `<strong style="color:#2ecc71;">✅ Попадание!</strong> <span style="opacity:.7;">${statusKey && GM_STATUS_EFFECTS[statusKey] ? 'Без урона — при применении на цель ляжет «' + GM_STATUS_EFFECTS[statusKey].name + '».' : 'Эффект без прямого урона — примени вручную по описанию.'}</span>`);
        resultBox.style.display = 'block';
        if (typeof window.previewGmAttack === 'function') window.previewGmAttack();
        // Активный блок прямо в атаке: игрок закрывается щитом — второй встречный бросок режет урон (вместо отдельного инструмента).
        if (hit && dmg > 0 && tgt.kind === 'player' && (actionVal === 'weapon' || physShot) && gmShieldBlockChecked()) gmMergedActiveBlock(pendingGmAttack, enemy, enemyTotal, textEl);
    };

    // Блок щитом внутри атаки НПС: враг (его итог атаки + прогрессия оружия) против 1d20 + мод. хар-ки щита + навык «Блокирование».
    function gmMergedActiveBlock(pa, enemy, enemyTotal, textEl) {
        const shieldType = (el('gm-attack-shield-type') || {}).value || 'heavy';
        db.collection('characters').doc(pa.targetUid).get().then(doc => {
            if (pendingGmAttack !== pa) return; // пока читали лист, мастер уже бросил другую атаку
            const data = doc.exists ? doc.data() : {};
            if (!(data.equippedSlots && data.equippedSlots.shield)) { textEl.innerHTML += '<br><span style="opacity:.8;">🛡 Щита в руке нет — активный блок не бросается.</span>'; return; }
            const es = data.effectiveStats;
            const stats = (es && !Array.isArray(es) && typeof es === 'object') ? ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(k => es[k]) : (es || data.stats || [10, 10, 10, 10, 10, 10]);
            const statMod = calcAbilityMod(parseInt(stats[shieldType === 'heavy' ? 2 : 1]) || 10);
            const skillMod = Math.floor((parseInt((data.effectiveSkills || data.skills || [])[3]) || 10) / 10); // Блокирование
            const SB = [0, 20, 25, 30, 35, 40]; let steps = 0;
            for (let k = 1; k <= 5; k++) if ((data.perkStates || {})['skill3-perk0-step' + k]) steps = k;
            const pct = SB[steps];
            const prog = Math.max(0, Math.floor(((enemy.weaponDmg || 0) - 10) / 10));
            const eTot = enemyTotal + prog, pRoll = Math.floor(Math.random() * 20) + 1, pTot = pRoll + statMod + skillMod, diff = eTot - pTot;
            const outcome = diff <= 0 ? 'success' : diff <= 4 ? 'partial' : 'broken';
            const perk = i => !!(data.perkStates || {})['skill3-perk' + i + '-step1'];
            const arrowNoDmg = perk(1) && !!pa.isRangedAtk && outcome !== 'broken';
            const label = { success: '✅ Блок успешен', partial: '🟡 Частичный блок', broken: '❌ Блок пробит' }[outcome];
            let note;
            pa.blockRolled = true;
            if (arrowNoDmg) { pa.dmg = 0; note = '«Отбивание стрел»: стрела попала в щит — урона нет.'; if (outcome === 'success') pa.blockEffects = { debuff: true }; }
            else if (outcome === 'success') { const base = pa.dmg; pa.dmg = Math.round(base * (1 - pct / 100)); note = `урон ${base} → ${pa.dmg} (срез ${pct}%, «Щитоносец»), враг теряет равновесие (−2 к следующему броску).`; pa.blockEffects = { debuff: true }; }
            else if (outcome === 'partial') note = 'урон режется только бронёй и сопротивлением, без процента блока.';
            else { note = 'полный урон бронёй + «Ошеломление» (−3 к следующему броску).'; pa.blockEffects = { stagger: true }; }
            if (perk(3) && outcome === 'success') note += ' «Быстрые рефлексы»: у игрока дополнительное действие.';
            pa.logTextBase += ` 🛡 Активный блок (${shieldType === 'heavy' ? 'тяжёлый щит' : 'лёгкий щит'}): враг ${eTot} vs игрок ${pTot} — ${label.replace(/^\S+\s/, '')}`;
            textEl.innerHTML += `<br><span style="color:#6cc;">🛡 <strong>Активный блок</strong>: враг ${eTot} (атака ${enemyTotal}${prog ? ' +' + prog + ' прогр.' : ''}) vs игрок 1d20 (${pRoll}) +${statMod} +${skillMod} = ${pTot} → <strong>${label}</strong>, ${note}</span>`;
            if (typeof window.previewGmAttack === 'function') window.previewGmAttack();
        }).catch(e => alert('Блок не бросился: ' + e.message));
    }
    // Последствия блока при «Применить»: дебафф врагу или «Ошеломление» игроку.
    function gmApplyBlockEffects(pa) {
        const be = pa && pa.blockEffects; if (!be) return;
        if (be.debuff) {
            gmUpdateEnemies((lastData.enemies || []).map(e => e.id === pa.enemyId ? Object.assign({}, e, { statusEffects: [...(e.statusEffects || []), { id: 'blk-' + Date.now(), name: 'Потеря равновесия', desc: '−2 к следующему броску', turns: 1, rollPenalty: -2 }] }) : e)).catch(e => console.error(e));
        }
        if (be.stagger) {
            const patch = {};
            patch['participants.' + pa.targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'stag-' + Date.now() + Math.random().toString(36).slice(2, 6), name: pa.enemyName, effectName: 'Ошеломление', description: '−3 к кубам на весь следующий ход.', turnsRemaining: 1, rollPenalty: -3, fromGm: true });
            db.collection('sessions').doc(currentCode).update(patch).catch(e => console.error(e));
        }
    }

    // Заклинания в enemies-data.js не хранят тип урона отдельно — определяем по названию.
    function mapEnemyDmgType(spellName) {
        const n = (spellName || '').toLowerCase();
        // Те же исключения, что на листе игрока (detectDmgTypeFromName): стихия не видна по слову в названии.
        if (/^(пламя|клыки дракона|испепеление|запретное солнце|болид|паровое дыхание|взрыв при гибели)/.test(n)) return 'fire'; // пар и взрыв двемерских машин — огонь
        if (/^дальний выстрел/.test(n)) return 'physical'; // двемерская сфера стреляет болтом
        if (/^(обморожение|надлом)/.test(n)) return 'frost';
        if (/^(искры|нестабильное напряжение|раскаты грома)/.test(n)) return 'shock';
        if (/огн|пламен/.test(n)) return 'fire';
        if (/лед|мороз|холод/.test(n)) return 'frost';
        if (/молни|гроз|электр/.test(n)) return 'shock';
        if (/яд|отрав/.test(n)) return 'poison';
        return 'magic';
    }

    // Вермина (2–3): если враг атакует последователя, с шансом 10/20% (д100) он в страхе на 3 хода.
    function gmVerminaFearCheck(targetUid, enemyId, enemyName) {
        if (!currentCode || !enemyId) return;
        db.collection('characters').doc(targetUid).get().then(doc => {
            const chance = ((doc.exists && doc.data().godGM) || {}).fearChance || 0;
            if (!chance) return;
            const r = 1 + Math.floor(Math.random() * 100);
            if (r <= 100 - chance) return;
            const enemies = (lastData.enemies || []).map(e => e.id === enemyId ? { ...e, statusEffects: [...(e.statusEffects || []).filter(x => x.name !== 'Страх (Вермина)'), { id: 'vrm-' + Date.now(), name: 'Страх (Вермина)', desc: 'Бежит в ужасе — не атакует', turns: 3, noAttack: true }] } : e);
            return gmUpdateEnemies(enemies).then(() => gmPostLogEntryText(`😱 Вермина: «${enemyName}» напал(а) на её последователя и в ужасе бежит 3 хода (д100 = ${r}).`));
        }).catch(e => console.error(e));
    }

    // Урон по существу игрока. Призванное: защита — ауры призыва хозяина (participants.<uid>.summons[].res, броня 10 ед. = 1%).
    // Животное: своей защиты нет. Статусы, болезни и защиты хозяина (щит, барьер, боги) на существо не действуют.
    function gmCompanionDamage(pa) {
        const owner = ((lastData && lastData.participants) || {})[pa.targetUid] || {};
        const isSummon = pa.targetKind === 'summon';
        const comp = (isSummon ? (owner.summons || []) : (owner.pets || [])).find(x => x.id === pa.compId) || null;
        const resist = isSummon && comp ? Math.max(0, Math.min(85, parseInt((comp.res || {})[pa.dmgType]) || 0)) : 0;
        const finalDmg = Math.max(0, Math.round((pa.dmg || 0) * (1 - resist / 100)));
        const hpNow = comp ? (parseInt(isSummon ? comp.curHp : comp.hp) || 0) : 0;
        return { comp, isSummon, resist, finalDmg, hpNow, left: Math.max(0, hpNow - finalDmg), maxHp: comp ? comp.maxHp : 0, owner };
    }
    function gmApplyAttackToCompanion() {
        const pa = pendingGmAttack;
        const cd = gmCompanionDamage(pa);
        const done = logExtra => {
            gmPostLogEntryText(pa.logTextBase + logExtra + '.');
            alert('Применено.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
        };
        if (!cd.comp) { alert('Этого существа уже нет в сессии.'); return; }
        if (!pa.dmg) { done(pa.statusKey ? ` (статус «${(GM_STATUS_EFFECTS[pa.statusKey] || {}).name || pa.statusKey}» на существо не ложится — учти вручную)` : ''); return; }
        const patch = {};
        let logExtra = `, урон ${cd.finalDmg}${cd.resist ? ` (защита существа ${cd.resist}%, было бы ${pa.dmg})` : ''}`;
        if (cd.isSummon) {
            // Хозяин применяет удар у себя (то же, что удар руны по существу): ХП, смерть, возврат костей/оружия.
            patch['participants.' + pa.targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'sh-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'aoeHit', dmg: cd.finalDmg, dmgType: pa.dmgType, summonId: pa.compId, final: true, from: pa.enemyName });
            // сразу показать мастеру новое ХП (лист хозяина пришлёт точное значение при синхронизации)
            patch['participants.' + pa.targetUid + '.summons'] = (cd.owner.summons || []).map(x => x.id === pa.compId ? Object.assign({}, x, { curHp: cd.left }) : x).filter(x => x.id !== pa.compId || cd.left > 0);
            patch['participants.' + pa.targetUid + '.summonNames'] = patch['participants.' + pa.targetUid + '.summons'].map(x => x.name);
        } else {
            patch['participants.' + pa.targetUid + '.pets'] = (cd.owner.pets || []).map(x => x.id === pa.compId ? Object.assign({}, x, { hp: cd.left }) : x).filter(x => x.id !== pa.compId || cd.left > 0);
        }
        if (cd.left <= 0) logExtra += `, 💀 «${cd.comp.name}» ${cd.isSummon ? 'погибает и исчезает' : 'погибает'}`;
        else logExtra += ` (HP ${cd.left}/${cd.maxHp})`;
        if (pa.statusKey) logExtra += ` (статус «${(GM_STATUS_EFFECTS[pa.statusKey] || {}).name || pa.statusKey}» на существо не ложится — учти вручную)`;
        const chores = [db.collection('sessions').doc(currentCode).update(patch)];
        if (!cd.isSummon) chores.push(db.collection('characters').doc(pa.targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-pa' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId: pa.compId, delta: -cd.finalDmg }) }));
        Promise.all(chores).then(() => done(logExtra)).catch(e => alert('Ошибка: ' + e.message));
    }

    window.applyGmAttackDamage = function () {
        if (!pendingGmAttack) return;
        gmChargePendingMana(pendingGmAttack);
        // «Невидимость» врага: «не виден, пока не атакует» — атака её снимает
        { const atk = (lastData.enemies || []).find(e => e.id === pendingGmAttack.enemyId);
          if (atk && (atk.statusEffects || []).some(x => x && x.name === 'Невидимость'))
              gmUpdateEnemies((lastData.enemies || []).map(e => e.id === atk.id ? Object.assign({}, e, { statusEffects: (e.statusEffects || []).filter(x => !(x && x.name === 'Невидимость')) }) : e)).catch(e => console.error(e)); }
        if (pendingGmAttack.targetKind && pendingGmAttack.targetKind !== 'player') { gmApplyAttackToCompanion(); return; }
        const { targetUid, dmg, dmgType, statusKey, logTextBase, targetName } = pendingGmAttack; // раньше targetName здесь не доставался — ниже, в ветке заражения болезнью, был ReferenceError
        gmVerminaFearCheck(targetUid, pendingGmAttack.enemyId, pendingGmAttack.enemyName);
        gmApplyBlockEffects(pendingGmAttack);
        if (!dmg && !statusKey) {
            gmPostLogEntryText(logTextBase + '.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
            return;
        }
        db.collection('characters').doc(targetUid).get().then(doc => {
            const data = doc.exists ? doc.data() : {};
            const ir = gmPlayerIncomingResist(data, dmgType, { shieldBlock: gmShieldBlockChecked() && !pendingGmAttack.blockRolled, isRangedAtk: pendingGmAttack.isRangedAtk });
            const resist = ir.resist;
            let finalDmg = (dmg && !ir.zero) ? Math.max(0, Math.round(dmg * (1 - resist / 100))) : 0;
            const defNotes = ir.notes.filter(n => /Отбивание|Защита от стихий|сопр\. магии/.test(n));
            { // Бонусы богов игрока: Стендарр — резист урону от даэдра/нежити; Дибелла — шанс поглотить заклинание; Азура — игнор урона заклинаний
                const gg = data.godGM || {};
                if (finalDmg && gg.daedraUndeadResist && pendingGmAttack.enemyUndeadDaedra) {
                    const cutG = Math.round(finalDmg * gg.daedraUndeadResist / 100);
                    finalDmg = Math.max(0, finalDmg - cutG);
                    defNotes.push('🕊 Бог: резист урону от даэдра/нежити ' + gg.daedraUndeadResist + '% (−' + cutG + ')');
                }
                if (finalDmg && pendingGmAttack.isSpell && gg.spellAbsorb && Math.random() * 100 < gg.spellAbsorb) {
                    finalDmg = 0; defNotes.push('🌸 Дибелла: заклинание поглощено (' + gg.spellAbsorb + '%)');
                }
                if (finalDmg && pendingGmAttack.isSpell && gg.ignoreMagicDmg) {
                    const cutA = Math.min(finalDmg, gg.ignoreMagicDmg);
                    finalDmg -= cutA; defNotes.push('🌙 Азура: −' + cutA + ' урона заклинания');
                }
            }
            { // «Вихревой плащ»: часть урона стрел и болтов игнорируется
                const cloakEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.rangedResist && x.turnsRemaining !== 0);
                if (finalDmg && dmgType === 'physical' && pendingGmAttack.isRangedAtk && cloakEff) {
                    const cut = Math.round(finalDmg * cloakEff.rangedResist / 100);
                    finalDmg = Math.max(0, finalDmg - cut);
                    defNotes.push('🌪 «Вихревой плащ» игнорирует ' + cloakEff.rangedResist + '% урона стрелы/болта (−' + cut + ')');
                }
            }
            let spellNegated = false, absorbedMp = 0;
            // Знак «Атронах» (Sistema 2.2): когда игрок — цель заклинания, спасбросок д20 против сложности 15 − мод. Мудрости;
            // успех — игрок поглощает магию заклинания (очки магии = четверть стоимости заклинания).
            if (pendingGmAttack.isSpell && data.sign === 'atronach') {
                const wisE = (data.effectiveStats && data.effectiveStats.wis) || 10;
                const dc = 15 - calcAbilityMod(wisE);
                const saveRoll = 1 + Math.floor(Math.random() * 20);
                if (saveRoll >= dc) {
                    absorbedMp = Math.max(1, Math.floor((pendingGmAttack.spellCost || 0) / 4));
                    if (ATRONACH_ABSORB_NEGATES_SPELL) { spellNegated = true; finalDmg = 0; }
                    defNotes.push(`🌀 Атронах поглощает магию: спасбросок ${saveRoll} ≥ ${dc} → +${absorbedMp} маны${ATRONACH_ABSORB_NEGATES_SPELL ? ', заклинание не действует' : ''}`);
                } else {
                    defNotes.push(`🌀 Атронах: спасбросок ${saveRoll} < ${dc} — магия не поглощена`);
                }
            }
            // Вещи с «поглощением магии» (Роба архимага и т.п.): шанс N% поглотить заклинание — урона нет, мана = стоимость заклинания.
            const gsA = data.gearSpecial || {};
            if (pendingGmAttack.isSpell && !spellNegated && gsA.magicAbsorbPct > 0 && Math.random() * 100 < gsA.magicAbsorbPct) {
                spellNegated = true; finalDmg = 0;
                const gotMp = Math.max(1, parseInt(pendingGmAttack.spellCost) || 0);
                absorbedMp += gotMp;
                defNotes.push(`🌀 Поглощение магии (${gsA.magicAbsorbPct}%): заклинание поглощено, +${gotMp} маны`);
            }
            // «Повышение навыка» (зачарования/зелья): Блокирование — N% шанс поглотить физ. урон; Лёгкая броня — (N/2)% уклониться.
            if (finalDmg && dmgType === 'physical') {
                const boosts = data.skillBoosts || {};
                // Блок — только щитом; стрелу щитом отбивают только с перком «Отбивание стрел».
                const hasShieldB = !!(data.equippedSlots && data.equippedSlots.shield);
                const arrowOk = !pendingGmAttack.isRangedAtk || !!((data.perkStates || {})['skill3-perk1-step1']);
                const blockPct = (hasShieldB && arrowOk) ? (boosts['блокирование'] || 0) : 0;
                const dodgePct = (boosts['легкая броня'] || 0) / 2 + (Number(data.lightArmorDodge) || 0); // чары на лёгкую броню + уклонение самой лёгкой брони
                if (blockPct > 0 && Math.random() * 100 < blockPct) { defNotes.push(`🛡️ Блок (${blockPct}%) — урон поглощён`); finalDmg = 0; }
                else if (dodgePct > 0 && Math.random() * 100 < dodgePct) { defNotes.push(`💨 Уклонение (${dodgePct}%) — атака мимо`); finalDmg = 0; }
            }
            // Знак «Лорд» — «Родство с троллями» (Sistema 2.2): весь получаемый урон огнём увеличивается на 2d6.
            // (Прежнее «Берсерк: урон ×½» убрано — в документе у Берсерка временные ХП и преимущество, а не защита.)
            let berserkNote = '';
            if (finalDmg && dmgType === 'fire' && data.sign === 'lord') {
                const t1 = 1 + Math.floor(Math.random() * 6), t2 = 1 + Math.floor(Math.random() * 6);
                finalDmg += t1 + t2;
                berserkNote = ` (🔥 Родство с троллями: +2d6 = ${t1 + t2})`;
            }
            // Задача L: вампир получает удвоенный урон, если сейчас "День" в сессии — раньше
            // это было только текстовым предупреждением в интерфейсе, урон не менялся.
            let mistNote = '';
            if (finalDmg && (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).some(x => x && (x.powerFlag === 'mist' || x.powerFlag === 'petrify') && x.turnsRemaining !== 0)) {
                finalDmg = 0; mistNote = ' (🌫 урон не проходит: туман или окаменение)';
            }
            let sunNote = '';
            if (finalDmg && data.supernaturalState && data.supernaturalState.vampirism && lastData.timePeriod === 'День') {
                finalDmg *= 2;
                sunNote = ' (☀️ уязвимость вампира к солнцу — урон ×2)';
            }
            const chores = [];
            // Оберег (Восстановление): поглощает урон ЗАКЛИНАНИЙ из своего запаса. С перком «Оберег-поглотитель»
            // половина поглощённого уходит игроку в ману. Запас уменьшается командой в лист игрока (gmCmds 'wardHit').
            let wardGainMp = 0;
            if (finalDmg > 0 && pendingGmAttack.isSpell) {
                const wEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.ward && (x.ward.left || 0) > 0 && x.turnsRemaining !== 0);
                if (wEff) {
                    const absorbed = Math.min(finalDmg, parseInt(wEff.ward.left) || 0);
                    finalDmg -= absorbed;
                    const absorbPerk = !!((data.perkStates || {})['skill11-perk7-step1']);
                    if (absorbPerk) { wardGainMp = Math.floor(absorbed / 2); absorbedMp = (absorbedMp || 0) + wardGainMp; } // мана — тем же путём, что «Атронах»
                    defNotes.push(`🔰 Оберег «${wEff.name}»: поглощено ${absorbed}${absorbPerk ? `, +${wardGainMp} маны («Оберег-поглотитель»)` : ''}`);
                    chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'wardHit', effId: wEff.id || null, name: wEff.name, absorbed }) }).catch(() => { }));
                }
            }
            // «Перчатки Хранителя»: в защитной стойке барьер поглощает урон из запаса (350 в день). Запас уменьшается командой в лист игрока.
            if (finalDmg > 0 && gsA.keeperBarrier > 0) {
                const absK = Math.min(finalDmg, parseInt(gsA.keeperBarrier) || 0);
                finalDmg -= absK;
                defNotes.push(`🛡 Барьер Перчаток Хранителя: поглощено ${absK} (осталось ${gsA.keeperBarrier - absK})`);
                chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'keeperBarrierHit', absorbed: absK }) }).catch(() => { }));
            }
            // «Контрудар» (Одноручное): попадания по игроку считаются по врагу — +1 к кубам за каждые 2 до его смерти (счёт в листе игрока).
            if ((data.perkStates || {})['skill0-perk5-step1'] && pendingGmAttack.enemyId) {
                chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'hitTaken', enemyId: pendingGmAttack.enemyId }) }).catch(() => { }));
            }
            // Верхом (лист игрока: riding + живая лошадь): 70% урона принимает лошадь, 30% — всадник.
            // ХП лошади меняется командой в лист игрока (gmCmds), как и другие правки мастера.
            let horseNote = '';
            if (finalDmg > 0 && data.riding && Array.isArray(data.pets)) {
                const horse = data.pets.find(pp => pp && pp.rideable && !pp.dead);
                if (horse) {
                    const share = (window.PET_RIDING && window.PET_RIDING.horseShare) || 0.7;
                    const toHorse = Math.min(Math.round(finalDmg * share), parseInt(horse.hp) || 0);
                    finalDmg -= toHorse;
                    horseNote = ` (🐎 лошадь «${horse.name}» приняла ${toHorse}${toHorse >= (parseInt(horse.hp) || 0) ? ' и пала' : ''})`;
                    chores.push(db.collection('characters').doc(targetUid).update({ gmCmds: firebase.firestore.FieldValue.arrayUnion({ id: 'gmc-h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), type: 'petHp', petId: horse.id, delta: -toHorse }) }).catch(() => { }));
                }
            }
            let logExtra = '', newHp, newMp;
            // Заклинание «Барьер» (Изменение): pct% ФИЗИЧЕСКОГО входящего урона уходит в ману (rate маны за 1 урона) — по таблице магии.
            // Мана кончилась — барьер падает: ошеломление (−2 к кубам на 2 хода) и снятие всех положительных эффектов.
            let barrierBroke = false;
            let barrierMpSpent = 0;
            if (finalDmg > 0 && dmgType === 'physical') {
                const bEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.barrier && x.turnsRemaining !== 0);
                if (bEff) {
                    const vit = Array.isArray(data.vitals) ? data.vitals : [0, 0, 0, 0];
                    const mpNow = parseInt(vit[1]) || 0;
                    const pct = bEff.barrier.pct || 20, rate = bEff.barrier.rate || 5;
                    const redirected = Math.round(finalDmg * pct / 100);
                    const needMp = Math.ceil(redirected * rate);
                    if (needMp <= mpNow) {
                        barrierMpSpent = needMp; finalDmg -= redirected;
                        if (mpNow - needMp <= 0) barrierBroke = true;
                        defNotes.push(`🛡 Барьер: ${redirected} урона ушло в ману (−${needMp} маны, курс 1:${rate})`);
                    } else {
                        const absorbable = Math.floor(mpNow / rate);
                        barrierMpSpent = mpNow; finalDmg -= Math.min(redirected, absorbable); barrierBroke = true;
                        defNotes.push(`🛡 Барьер: поглощено ${Math.min(redirected, absorbable)} урона, мана кончилась`);
                    }
                }
            }
            // «Нечестивый барьер» (Колдовство): большая часть ФИЗИЧЕСКОГО урона принимается на себя — вместо N урона
            // с игрока снимается 1 ХП за каждые `per` единиц (5 у барьеров 1-2, 10 у барьера 3). Мана на поддержание уходит в свой ход.
            if (finalDmg > 0 && dmgType === 'physical') {
                const uEff = (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).find(x => x && x.unholy && x.turnsRemaining !== 0);
                if (uEff) {
                    const per = uEff.unholy.per || 5, hpc = uEff.unholy.hp || 1;
                    const taken = Math.ceil(finalDmg / per) * hpc;
                    if (taken < finalDmg) {
                        defNotes.push(`🦴 Нечестивый барьер: ${finalDmg} физ. урона → ${taken} ХП (${hpc} ХП за каждые ${per} урона)`);
                        finalDmg = taken;
                    }
                }
            }
            // «Бастион» и др.: часть урона ближней физической атаки возвращается атакующему врагу.
            if (finalDmg > 0 && dmgType === 'physical' && !pendingGmAttack.isRangedAtk && !pendingGmAttack.isSpell && gsA.reflectMeleePct > 0 && pendingGmAttack.enemyId) {
                const refl = Math.round(finalDmg * gsA.reflectMeleePct / 100);
                const enArr = (lastData && Array.isArray(lastData.enemies)) ? lastData.enemies : [];
                if (refl > 0 && enArr.some(e => e.id === pendingGmAttack.enemyId)) {
                    const enemiesR = enArr.map(e => e.id === pendingGmAttack.enemyId ? { ...e, curHp: Math.max(0, (parseInt(e.curHp) || 0) - refl), lastHitBy: targetUid, ...(((parseInt(e.curHp) || 0) - refl) <= 0 && (parseInt(e.curHp) || 0) > 0 ? { killedBy: targetUid, diedAtTurn: (lastData && lastData.sessionTurnCounter) || 0 } : {}) } : e);
                    chores.push(gmUpdateEnemies(enemiesR).catch(() => { }));
                    defNotes.push(`🪞 Отражение ${gsA.reflectMeleePct}%: ${pendingGmAttack.enemyName} получает ${refl} урона`);
                }
            }
            if (dmg || absorbedMp || barrierMpSpent) {
                const vitals = Array.isArray(data.vitals) ? data.vitals.slice() : [0, 0, 0, 0];
                newHp = Math.max(0, (parseInt(vitals[0]) || 0) - finalDmg);
                vitals[0] = newHp;
                if (absorbedMp) {
                    const maxMpV = parseInt(vitals[3]) || 0;
                    const curMpV = parseInt(vitals[1]) || 0;
                    vitals[1] = Math.max(curMpV, Math.min(maxMpV, curMpV + absorbedMp));
                    newMp = vitals[1];
                }
                if (barrierMpSpent) { vitals[1] = Math.max(0, (parseInt(vitals[1]) || 0) - barrierMpSpent); newMp = vitals[1]; }
                // newHp/newMp выше — для текста в журнале (по снимку); в базу пишем изменения по СВЕЖИМ данным в транзакции.
                const fdmg = finalDmg, amp = absorbedMp || 0, bmp = barrierMpSpent || 0;
                chores.push(updateCharacterVitals(targetUid, v => {
                    v[0] = Math.max(0, (parseInt(v[0]) || 0) - fdmg);
                    if (amp) { const mx = parseInt(v[3]) || 0, cu = parseInt(v[1]) || 0; v[1] = Math.max(cu, Math.min(mx, cu + amp)); }
                    if (bmp) v[1] = Math.max(0, (parseInt(v[1]) || 0) - bmp);
                }));
                // Игроку с концентрационным заклинанием (Иллюзия/Колдовство) нужна проверка при каждом попадании — шлём команду в его очередь
                // Сигнал «по тебе попали»: проверка концентрации + прокачка брони (как в Скайриме — за каждое попадание).
                // Раньше уходил в документ персонажа, который сайт игрока не читает, — не работало ни то, ни другое.
                if (fdmg > 0) { const pd = {}; pd['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({ id: 'dmg-' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'damaged', dmg: fdmg, dmgType: dmgType, ts: Date.now() }); chores.push(db.collection('sessions').doc(currentCode).update(pd).catch(() => { })); }
                if (dmg) logExtra += `, урон ${finalDmg}${resist ? ` (резист ${resist}%, было бы ${dmg})` : ''}${sunNote}${berserkNote}${mistNote}${horseNote}`;
            }
            if (defNotes.length) logExtra += '. ' + defNotes.join('. ');
            // Автоматический бросок на заражение болезнью — раньше этого не было вообще, болезни
            // существовали только как текст в описании монстров. Срабатывает только при физическом
            // попадании (dmgType==='physical') от переносчика (carrierOfDisease задан).
            if (finalDmg > 0 && dmgType === 'physical' && pendingGmAttack.carrierOfDisease && pendingGmAttack.diseaseChance > 0) { // уклонился, заблокировал, туман — урона нет, заражения тоже
                // Альтмер, босмер, редгард — преимущество против болезней: бросаем дважды, берём лучший (больший) результат.
                const diseaseAdv = ['altmer', 'bosmer', 'redguard'].indexOf(data.race) !== -1;
                const roll1 = Math.floor(Math.random() * 100) + 1, roll2 = diseaseAdv ? Math.floor(Math.random() * 100) + 1 : 0;
                const roll = Math.max(roll1, roll2);
                const resist = (data.race === 'argonian') ? 100 : ((data.resistances && data.resistances.disease) || 0); // аргонианин: иммунитет
                const effectiveChance = Math.max(0, pendingGmAttack.diseaseChance * (1 - resist / 100));
                if (roll <= effectiveChance) {
                    const diseaseName = pendingGmAttack.carrierOfDisease;
                    const diseaseInfo = DISEASE_DEFS[diseaseName] || { desc: 'Эффект — на усмотрение мастера.' };
                    const patch2 = {};
                    patch2['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                        id: 'dis-' + Date.now() + Math.random().toString(36).slice(2, 8),
                        name: pendingGmAttack.enemyName, effectName: 'Болезнь: ' + diseaseName, description: diseaseInfo.desc, turnsRemaining: 9999, permanent: true
                    });
                    chores.push(db.collection('sessions').doc(currentCode).update(patch2));
                    logExtra += `. 🚨 Заражение! ${targetName} подхватил(а) болезнь «${diseaseName}» (бросок ${roll} ≤ ${effectiveChance.toFixed(0)}%)`;
                } else {
                    logExtra += `. Проверка на заражение не прошла (${roll} > ${effectiveChance.toFixed(0)}%${diseaseAdv ? `, преимущество расы: ${roll1}/${roll2}` : ''}${data.race === 'argonian' ? ', аргонианин не болеет' : ''})`;
                }
            }
            if (barrierBroke) {
                const bp = {};
                bp['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                    id: 'brk-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    name: 'Барьер', effectName: 'Барьер разрушен — ошеломление', description: '−2 к кубам на 2 хода; все положительные эффекты сняты.',
                    turnsRemaining: 2, rollPenalty: -2, clearPositive: true, fromGm: true
                });
                chores.push(db.collection('sessions').doc(currentCode).update(bp));
                logExtra += `, 💥 Барьер разрушен: ошеломление (−2 к кубам, 2 хода), положительные эффекты сняты`;
            }
            const fearBlocked = statusKey === 'fear' && (Array.isArray(data.activeTimedEffects) ? data.activeTimedEffects : []).some(x => x && x.fearImmune && x.turnsRemaining !== 0);
            if (fearBlocked) logExtra += ', 🦁 цель под «Мужеством/Ободрением» — страх не действует';
            if (statusKey && !spellNegated && !fearBlocked) {
                // Статус-эффект пишется В СЕССИЮ (не в документ персонажа) — у игрока нет
                // живого листенера на свой собственный документ, а на сессию есть, так что
                // так эффект долетит до него сразу, без перезагрузки страницы.
                const statusDef = GM_STATUS_EFFECTS[statusKey];
                const patch = {};
                patch['participants.' + targetUid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion({
                    id: 'st-' + Date.now() + Math.random().toString(36).slice(2, 8),
                    name: pendingGmAttack.enemyName, effectName: statusDef.name, description: statusDef.desc, turnsRemaining: statusDef.turns,
                    rollPenalty: statusDef.rollPenalty || 0, speed: statusDef.speed || 0, fromGm: true,
                    // паралич и страх: игрок бросает спасбросок на своём листе (Телосложение / Мудрость, СЛ 13)
                    save: statusKey === 'paralyze' ? { stat: 'con', dc: 13 } : statusKey === 'fear' ? { stat: 'wis', dc: 13 } : null
                });
                chores.push(db.collection('sessions').doc(currentCode).update(patch));
                logExtra += `, статус «${statusDef.name}» (${statusDef.turns} х.)${statusKey === 'paralyze' || statusKey === 'fear' ? ' — игрок бросает спасбросок (СЛ 13)' : ''}`;
            }
            return Promise.all(chores).then(() => ({ newHp, newMp, logExtra }));
        }).then(({ newHp, newMp, logExtra }) => {
            const mirror = {};
            if (newHp !== undefined) mirror['participants.' + targetUid + '.curHp'] = newHp;
            if (newMp !== undefined) mirror['participants.' + targetUid + '.curMp'] = newMp;
            const chain = Object.keys(mirror).length
                ? db.collection('sessions').doc(currentCode).update(mirror)
                : Promise.resolve();
            return chain.then(() => logExtra);
        }).then(logExtra => {
            gmPostLogEntryText(logTextBase + logExtra + '.');
            alert('Применено.');
            pendingGmAttack = null;
            el('gm-attack-roll-result').style.display = 'none';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Тематические сундуки — теперь тип сундука в ОДНОМ блоке с обычным генератором лута ----------
    // (раньше отдельная панель — окно мастера и так длинное). Уровень сундука влияет и здесь: число
    // предметов (как у обычного), КАЧЕСТВО (окно по цене внутри предметов фракции), размер валюты.
    const THEMED_CHEST_THEMES = {
        // Ключевое слово ищется по ИМЕНИ предмета (не категории) — в базе названия фракций написаны
        // непоследовательно ("Древний нордский"/"Древняя нордская"/"Древне нордские"), "древн" ловит все.
        ancientNord: { label: 'Древнонордский', keyword: 'древн', currency: { name: 'Дракр', price: 4, base: [3, 12] } },
        dwemer: { label: 'Двемерский', keyword: 'двемер', currency: { name: 'Думак', price: 5, base: [3, 12] } },
        falmer: { label: 'Фалмерский', keyword: 'фалмер', currency: { name: 'Думак', price: 5, base: [3, 12] } },
        forsworn: { label: 'Изгоев', keyword: 'изгое', currency: null } // валюты нет — вместо неё золото по уровню
    };
    // Какой кусок пула фракции (отсортированного по цене) доступен на данном уровне: бедный — дешёвые
    // вещи, легендарный — самые дорогие. Не привязано к абсолютным ценам — у разных фракций они разные.
    const THEMED_PRICE_WINDOW = { poor: [0, 0.4], common: [0.15, 0.7], rich: [0.4, 0.9], legendary: [0.6, 1] };
    const THEMED_CURRENCY_MULT = { poor: 0.5, common: 1, rich: 2, legendary: 3.5 };

    // Выбор count разных предметов из окна по цене (без повторов).
    function pickThemedGear(pool, tierKey, count) {
        const sorted = pool.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
        const win = THEMED_PRICE_WINDOW[tierKey] || [0, 1];
        let windowed = sorted.slice(Math.floor(sorted.length * win[0]), Math.ceil(sorted.length * win[1]));
        if (!windowed.length) windowed = sorted;
        const shuffled = windowed.slice().sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    function generateThemedLoot(typeKey, tierKey, tier, resultEl) {
        const theme = THEMED_CHEST_THEMES[typeKey];
        // Только экипировка (броня/оружие со слотом) и никакого уникального: "древн" иначе цепляло
        // «…древнего вампира» (Уникальная броня) и «Древнюю нордскую кирку», "двемер" — слитки и детали.
        const rawPool = (gmAllItems || []).filter(i =>
            i.name.toLowerCase().includes(theme.keyword) &&
            (typeof i.armor === 'number' || typeof i.dmg === 'number') && i.slot &&
            !isUniqueLootItem(i)
        );
        // В базе есть предметы под ОДНИМ именем в двух записях (кастеты: «Двемерские боевые перчатки»
        // и т.п. — и в кованых, и в лутовых). Без дедупликации сундук мог выдать «два разных» предмета
        // с одним названием. Оставляем одну запись на имя, лутовую версию предпочитаем кованой.
        const byName = new Map();
        rawPool.forEach(i => {
            const prev = byName.get(i.name);
            if (!prev || (/\(лут\)/.test(i.category || '') && !/\(лут\)/.test(prev.category || ''))) byName.set(i.name, i);
        });
        const pool = [...byName.values()];
        if (!pool.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">В базе нет предметов этой фракции.</span>'; return; }
        const count = randInt(tier.itemCount[0], tier.itemCount[1]);
        const items = pickThemedGear(pool, tierKey, count);
        let gold = 0;
        if (theme.currency) {
            const amount = Math.max(1, Math.round(randInt(theme.currency.base[0], theme.currency.base[1]) * (THEMED_CURRENCY_MULT[tierKey] || 1)));
            items.push({ name: theme.currency.name, category: 'Кузнечные ингредиенты', price: theme.currency.price, weight: 0.1, qty: amount });
        } else {
            gold = randInt(tier.gold[0], tier.gold[1]);
        }
        lastGeneratedLoot = { tier: tier.label, title: `${theme.label}, ${tier.label.toLowerCase()}`, gold, items, trap: gmRollChestTrap() };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    }

    // Общий вывод результата для обоих типов сундуков.
    function renderLootHtml(loot) {
        let html = `<strong>${escapeHtml(loot.title || loot.tier)} сундук:</strong><br>`;
        if (loot.trap) { const tt = trapType(loot.trap.id) || {}; html += `<span style="color:#e67e22;">🪤 С ловушкой: ${tt.icon || ''} ${escapeHtml(tt.name || loot.trap.id)} — обезвредить: ${escapeHtml(loot.trap.tier)} (сл. ${loot.trap.dc}). Игроку при выдаче придёт бросок на обезвреживание.</span><br>`; }
        if (loot.gold) html += `💰 ${loot.gold} септимов<br>`;
        loot.items.forEach(it => {
            const stats = (it.armor ? ` · броня ${StBonuses.shownArmor(it.armor, it)}` : '') + (it.dmg ? ` · урон ${StBonuses.shownWeaponDmg(it.dmg, it)}` : '');
            html += `• ${escapeHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''} <span style="opacity:.65;">(${escapeHtml(it.category || '')}${stats}, ${it.price} септимов)</span><br>`;
        });
        return html;
    }

    // ---------- Генератор лута сундуков ----------

    const LOOT_TIERS = {
        poor: { label: 'Бедный', gold: [5, 40], priceMin: 1, priceMax: 30, itemCount: [1, 2] },
        common: { label: 'Обычный', gold: [30, 150], priceMin: 20, priceMax: 150, itemCount: [2, 3] },
        rich: { label: 'Богатый', gold: [150, 600], priceMin: 100, priceMax: 800, itemCount: [2, 4] },
        legendary: { label: 'Легендарный', gold: [500, 2000], priceMin: 500, priceMax: 6935, itemCount: [1, 3] }
    };
    const LOOT_EXCLUDE_CATEGORIES = [
        'Ингредиенты для алхимии', 'Кузнечные ингредиенты', 'Шкуры', 'Двемерские детали',
        // Уникальные предметы/артефакты не должны падать из случайного сундука.
        'Уникальная броня', 'Уникальные щиты', 'Даэдрические артефакты', 'Артефакты Азидала',
        'Маски жрецов', 'Магические одеяния',
        // Всё из таблицы «Уникальное оружие и броня»: Мораг Тонг и Азидал — только руками мастера (см. «Снаряжение и добыча» у врага)
        'Броня Мораг Тонг'
    ];

    // Уникальное/именное не должно падать из случайного сундука. Раньше проверялся только список
    // категорий выше — а "Уникальное оружие" (файл unique-weapons-data.js, добавленный позже) в него
    // не попало, и уникальные клинки/луки изредка выпадали из обычных сундуков 13+ уровня.
    // Теперь отсекаем и по флагу unique, и по любой категории, начинающейся с "Уникальн".
    function isUniqueLootItem(i) {
        return !!i.unique || /^Уникальн/.test(i.category || '') || LOOT_EXCLUDE_CATEGORIES.includes(i.category);
    }

    let lastGeneratedLoot = null;

    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    window.generateChestLoot = function () {
        const tierKey = el('loot-tier-select').value;
        const tier = LOOT_TIERS[tierKey];
        const resultEl = el('loot-gen-result');
        // Тип сундука: обычный (случайный лут по цене) или тематический (броня/оружие фракции).
        const typeKey = el('loot-type-select') ? el('loot-type-select').value : 'common';
        if (typeKey !== 'common' && THEMED_CHEST_THEMES[typeKey]) { generateThemedLoot(typeKey, tierKey, tier, resultEl); return; }
        const pool = (gmAllItems || []).filter(i =>
            typeof i.price === 'number' && i.price >= tier.priceMin && i.price <= tier.priceMax &&
            !isUniqueLootItem(i)
        );
        if (!pool.length) {
            resultEl.innerHTML = '<span style="color:#e74c3c;">В базе нет предметов в этом ценовом диапазоне.</span>';
            return;
        }
        const gold = randInt(tier.gold[0], tier.gold[1]);
        const count = randInt(tier.itemCount[0], tier.itemCount[1]);
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(pool[Math.floor(Math.random() * pool.length)]);
        }

        // Гарантированная "мелочёвка" сундука — не заменяет обычный лут, добавляется поверх.
        const foodPool = (gmAllItems || []).filter(i => i.category === 'Готовые продукты' || i.category === 'Сырые продукты');
        const soulGemPool = (gmAllItems || []).filter(i => i.category === 'Камни душ');
        const gemPool = (gmAllItems || []).filter(i => i.category === 'Драгоценные камни');
        if (foodPool.length && Math.random() < 0.6) items.push(foodPool[Math.floor(Math.random() * foodPool.length)]);
        if (Math.random() < 0.4) items.push({ name: 'Отмычка', category: 'Инструменты', price: 5, weight: 0.1 });
        if (soulGemPool.length && Math.random() < 0.3) items.push(soulGemPool[Math.floor(Math.random() * soulGemPool.length)]);
        if (gemPool.length && Math.random() < 0.25) items.push(gemPool[Math.floor(Math.random() * gemPool.length)]);

        lastGeneratedLoot = { tier: tier.label, title: tier.label, gold, items, trap: gmRollChestTrap() };
        resultEl.innerHTML = renderLootHtml(lastGeneratedLoot);
    };
    // Ловушка сундука по выбору мастера (дротики / булава / колья / случайная) и сложность обезвреживания.
    function gmRollChestTrap() {
        const v = (el('loot-trap-select') || {}).value || '';
        if (!v) return null;
        const pool = window.CHEST_TRAP_TYPES || ['darts', 'mace', 'spikes'];
        const id = v === 'random' ? pool[Math.floor(Math.random() * pool.length)] : v;
        const tierKey = (el('loot-trap-tier') || {}).value || 'adept';
        const tierT = (window.TRAP_DISARM_TIERS || {})[tierKey] || { label: 'Адепт', dc: 15 };
        return { id, tier: tierT.label, dc: tierT.dc };
    }

    window.grantGeneratedLoot = function () {
        if (!lastGeneratedLoot) { alert('Сначала сгенерируй лут.'); return; }
        const targetUid = el('loot-gen-target-player').value;
        if (!targetUid) { alert('Выбери игрока.'); return; }
        // Транзакция: инвентарь и золото пишутся вместе, автосохранение игрока в этот момент не затирает добычу.
        const charRefG = db.collection('characters').doc(targetUid);
        db.runTransaction(tx => tx.get(charRefG).then(doc => {
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            lastGeneratedLoot.items.forEach(it => {
                const itemId = it.name; // а не id документа базы — иначе стек не сливается с одноимённым предметом игрока
                // Как при «Передать»: эффекты зелий и ядов, чары, единая категория «Зелье»/«Яд» (а не «Яд (лут)»).
                const extra = gmItemExtraFromSource(it);
                const q = it.qty || 1; // валюта сундука (Дракры/Думаки) приходит стопкой, не по одной штуке
                gmMergeInvItem(inv, { itemId, name: it.name, weight: it.weight || 0, category: it.category || '', effect: it.effect || '' }, q, extra);
            });
            const newGold = (parseInt(data.gold) || 0) + (parseInt(lastGeneratedLoot.gold) || 0);
            const patchG = { inventory: stripUndefinedDeep(inv), gold: newGold };
            if (doc.exists) tx.update(charRefG, patchG); else tx.set(charRefG, patchG, { merge: true });
        })).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            if (lastGeneratedLoot.trap) { // сундук с ловушкой: игрок открывает его — бросок на обезвреживание, провал = ловушка
                const tt = trapType(lastGeneratedLoot.trap.id);
                if (tt) gmSendTrapCmd(targetUid, { type: 'trapDisarm', chest: true, trapName: tt.name + ' (сундук)', icon: tt.icon, dc: lastGeneratedLoot.trap.dc, onFail: gmTrapCmdFor(tt, {}) });
            }
            alert(`Лут (${lastGeneratedLoot.title || lastGeneratedLoot.tier} сундук) выдан игроку ${pname}.`);
            gmPostLogEntryText(`📦 ${pname} нашёл(а) ${(lastGeneratedLoot.title || lastGeneratedLoot.tier).toLowerCase()} сундук: ${lastGeneratedLoot.gold ? lastGeneratedLoot.gold + ' золота + ' : ''}${lastGeneratedLoot.items.map(i => i.name + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')}.`);
            lastGeneratedLoot = null;
            el('loot-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function populateLootTargetSelect() {
        const select = el('loot-gen-target-player');
        if (!select) return;
        const uids = gmLivingPlayers(); // павшим добыча не уходит
        const prev = select.value;
        select.innerHTML = uids.length
            ? uids.map(uid => `<option value="${uid}">${escapeHtml((lastData.participants[uid] || {}).name || uid)}</option>`).join('')
            : '<option value="">' + (Object.keys(lastData.participants || {}).length ? 'Все игроки пали' : 'Нет игроков') + '</option>';
        if (uids.includes(prev)) select.value = prev;
    }

    // ---------- Генератор бандитов ----------

    const BANDIT_RACES = ['Норд', 'Имперец', 'Редгард', 'Бретонец', 'Данмер', 'Орк', 'Каджит'];
    const BANDIT_SIGNS = ['Воин', 'Вор', 'Маг', 'Госпожа', 'Конь', 'Атронах', 'Тень'];
    const BANDIT_GODS = [
        { name: 'Талос', blessing: '5% урона топорами и секирами, 10% сопротивление электричеству' },
        { name: 'Мара', blessing: '25% сопротивления ядам и болезням, +5% пробития брони ближним оружием' },
        { name: 'Боэтия', blessing: '10% урону стрелковым оружием, +5 футов передвижения' },
        { name: 'Малакат', blessing: '+25 хп, +10% урона оружием ближнего боя' },
        { name: 'Сангвин', blessing: 'Почти не пьянеет; после выпивки +10% физ.урона на 20 ходов' },
        { name: '— без веры —', blessing: '' }
    ];
    const BANDIT_ARMOR_SLOT_MAP = { 'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield' };

    // Прогрессия снаряжения по уровню — низкоуровневые бандиты в тряпье/железе, кап (50) — стекло/
    // эбонит ("полуэбонитовый сет" по просьбе, т.е. до эбонита включительно, не выше). Каждый порог
    // даёт доступ к материалам ЭТОГО и предыдущих порогов (не заменяет, а расширяет пул) — так
    // высокоуровневый бандит может выпасть в чём угодно от железа до своего максимума, а не
    // гарантированно в топе.
    const BANDIT_TIER_THRESHOLDS = [
        { minLevel: 1, weaponMat: /^(Меховые|Сыромятные|Железн)/i, armorMat: /^(Мехов|Сыромятн|Железн)/i, bows: ['Длинный лук', 'Охотничий лук'] },
        { minLevel: 8, weaponMat: /^Стальн/i, armorMat: /^Стальн/i, bows: ['Имперский лук', 'Древний нордский лук'] },
        { minLevel: 16, weaponMat: /^(Орочь|Орочий|Двемерск)/i, armorMat: /^(Орочь|Орочий|Двемерск)/i, bows: ['Орочий лук', 'Лук Изгоев'] },
        { minLevel: 26, weaponMat: /^(Эльфийск|Нордск)/i, armorMat: /^(Эльфийск|Нордск)/i, bows: ['Эльфийский лук', 'Фалмерский лук', 'Стальной арбалет'] },
        { minLevel: 38, weaponMat: /^Стеклянн/i, armorMat: /^Стеклянн/i, bows: ['Стеклянный лук', 'Лук бич магов', 'Двемерский арбалет', 'Орочий арбалет'] },
        { minLevel: 50, weaponMat: /^Эбонитов/i, armorMat: /^Эбонитов/i, bows: ['Эбонитовый лук', 'Фалмерский гибкий лук', 'Эльфийский арбалет', 'Стеклянный арбалет'] }
    ];

    function getBanditTierRegexes(level) {
        const unlocked = BANDIT_TIER_THRESHOLDS.filter(t => t.minLevel <= level);
        return {
            weaponMats: unlocked.map(t => t.weaponMat),
            armorMats: unlocked.map(t => t.armorMat),
            bows: unlocked.reduce((acc, t) => acc.concat(t.bows), [])
        };
    }

    // Английские ключи слота (armorNonCraftable) и русские подписи (armorRecipes, через
    // BANDIT_ARMOR_SLOT_MAP) — приводим обе базы к одному набору ключей: helmet/chest/gloves/
    // boots/shield.
    const ARMOR_SLOT_KEYS = new Set(['helmet', 'chest', 'gloves', 'boots', 'shield']);
    function normalizeArmorSlot(rawSlot) {
        if (ARMOR_SLOT_KEYS.has(rawSlot)) return rawSlot;
        return BANDIT_ARMOR_SLOT_MAP[rawSlot] || null;
    }

    function getBanditGearPool(level) {
        const tiers = getBanditTierRegexes(level);
        // Ближний бой: без луков, арбалетов и боеприпасов (стрелы/болты раньше попадали сюда как «оружие»).
        const weapons = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).filter(w =>
            !w.isAmmo && !/лук|арбалет|стрел|болт/i.test(w.name) && tiers.weaponMats.some(re => re.test(w.name)));
        const armors = (window.armorRecipes || []).concat(window.armorNonCraftable || []).filter(a =>
            tiers.armorMats.some(re => re.test(a.name)));
        const bowNames = tiers.bows;
        const bows = (window.weaponRecipes || []).concat(window.weaponsNonCraftable || []).filter(w => bowNames.includes(w.name));
        return { weapons, armors, bows };
    }

    let lastGeneratedBandit = null;

    window.generateBandit = function () {
        const resultEl = el('bandit-gen-result');

        // Уровень бандита: средний уровень группы (задаётся вручную) ± разброс от -1 до +2, максимум 50.
        const avgLevel = parseInt(el('bandit-avg-level').value) || 5;
        const level = Math.max(1, Math.min(50, avgLevel + (Math.floor(Math.random() * 4) - 1)));

        const pool = getBanditGearPool(level);
        if (!pool.weapons.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных об оружии — проверь, что smithing-data.js подключён.</span>'; return; }

        const race = BANDIT_RACES[Math.floor(Math.random() * BANDIT_RACES.length)];
        const sign = BANDIT_SIGNS[Math.floor(Math.random() * BANDIT_SIGNS.length)];
        const god = BANDIT_GODS[Math.floor(Math.random() * BANDIT_GODS.length)];

        const isRanged = Math.random() < 0.25 && pool.bows.length;
        const bow = isRanged ? pool.bows[Math.floor(Math.random() * pool.bows.length)] : null;
        const weapon = pool.weapons[Math.floor(Math.random() * pool.weapons.length)];

        const slots = { helmet: null, chest: null, gloves: null, boots: null, shield: null };
        const bySlot = {};
        pool.armors.forEach(a => {
            const key = normalizeArmorSlot(a.slot);
            if (!key) return;
            (bySlot[key] = bySlot[key] || []).push(a);
        });
        let totalArmor = 0;
        Object.keys(slots).forEach(key => {
            if (key === 'shield' && (isRanged || Math.random() > 0.3)) return; // лучники без щита
            if (key !== 'shield' && Math.random() > 0.7) return;
            const options = bySlot[key];
            if (options && options.length) {
                const picked = options[Math.floor(Math.random() * options.length)];
                slots[key] = picked;
                totalArmor += Math.round(StBonuses.enemyArmorValue(picked.resistance || 0, Object.assign({ slot: key }, picked)));
            }
        });

        // Настоящие характеристики бандита — раньше их не было вообще, только плоский weaponDmg
        // и ХП из случайного диапазона 40-90 без всякой связи с телом. Упор на Телосложение
        // (ХП)/Силу(ближний бой)/Ловкость(дальний бой) — они разбойники-воины, не барды. Растут
        // с уровнем, у мага-бандита (отдельный генератор ниже) приоритет другой — там Дух/Интеллект.
        const con = 14 + Math.floor(level * 0.3) + Math.floor(Math.random() * 3); // 14→~30 к 50 ур.
        const str = 12 + Math.floor(level * 0.24) + Math.floor(Math.random() * 3); // 12→~26
        const dex = 11 + Math.floor(level * 0.2) + Math.floor(Math.random() * 3); // 11→~21
        const conMod = calcAbilityMod(con), strMod = calcAbilityMod(str), dexMod = calcAbilityMod(dex);

        // Урон и ХП растут с уровнем (грубая, но предсказуемая шкала) — ТЕПЕРЬ и с модификатором
        // характеристики сверху, как у игрока (Сила — ближний бой, Ловкость — дальний).
        const levelDmgMult = 1 + (level - 1) * 0.06;
        const levelHpMult = 1 + (level - 1) * 0.08;
        // Только база оружия с масштабом по уровню. Характеристика (СИЛ/ЛОВ) добавляется к урону
        // при самой атаке — enemyWeaponDamage(); раньше сюда запекался лишь модификатор (+1…+7),
        // и он же не учитывался бы повторно.
        const weaponDmg = isRanged
            ? Math.round(StBonuses.enemyWeaponDmg(bow.damage) * levelDmgMult) // таблицы оружия пересчитаны для игроков — враги бьют как раньше
            : Math.round(StBonuses.enemyWeaponDmg(weapon.damage) * levelDmgMult);
        const hp = con * 10 + Math.round(randInt(0, 20) * levelHpMult);
        // Мана — теперь у ЛЮБОГО бандита (не только мага), для зелий/свитков за столом мастера.
        const mp = Math.round(randInt(20, 40) * (1 + (level - 1) * 0.05));

        const gold = Math.round(randInt(5, 80) * (1 + (level - 1) * 0.1));
        const hasTrinket = Math.random() < 0.3;
        // Раньше сюда попадало ВСЁ со слотом кольцо/амулет — в том числе «Артефакты Азидала» и «Даэдрические артефакты».
        const trinketPool = (gmAllItems || []).filter(i => (i.category === 'Ювелирное изделие' || (i.slot === 'ring' || i.slot === 'amulet')) && !isUniqueLootItem(i));
        const trinket = hasTrinket && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;
        const foodPool = (gmAllItems || []).filter(i => i.category === 'Готовые продукты' || i.category === 'Сырые продукты');
        const foodItem = foodPool.length ? foodPool[Math.floor(Math.random() * foodPool.length)] : null;
        const hasLockpick = Math.random() < 0.5;

        // Лут: часть брони НЕ выпадает при обыске (потрёпана в бою) — у каждого предмета
        // (включая оружие) свой отдельный шанс попасть в добычу, не 100%.
        const lootItems = [];
        if (Math.random() < 0.8) {
            if (isRanged) lootItems.push({ name: bow.name, price: bow.price || 0, weight: bow.weight, dmg: bow.damage, slot: 'ranged', category: 'Оружие (с трупа)' }); // базовый урон оружия (множитель уровня — только у самого бандита)
            else lootItems.push({ name: weapon.name, price: weapon.price || 0, weight: weapon.weight, dmg: weapon.damage, slot: weapon.slot, category: 'Оружие (с трупа)' });
        }
        // Стрелы/болты — в колчане (ammo): тратятся в бою, остаток попадает в добычу при обыске трупа.
        const ammo = isRanged && window.EnemyLoot ? EnemyLoot.quiverFor(bow.name, randInt(8, 16)) : null;
        { const th = window.EnemyLoot && EnemyLoot.rollThrownLoot && EnemyLoot.rollThrownLoot(level, {}); if (th) lootItems.push(th); }
        Object.values(slots).forEach(a => {
            if (a && Math.random() < 0.6) lootItems.push({ name: a.name, price: a.price || 0, weight: a.weight, armor: a.resistance, slot: normalizeArmorSlot(a.slot), category: 'Броня (с трупа)' });
        });
        if (trinket) lootItems.push({ name: trinket.name, price: trinket.price || 0, weight: trinket.weight, slot: trinket.slot, category: 'Ювелирное изделие (с трупа)' });
        if (foodItem && Math.random() < 0.5) lootItems.push({ name: foodItem.name, price: foodItem.price || 0, weight: foodItem.weight || 0.5, category: foodItem.category, effect: foodItem.effect || '' });
        if (hasLockpick) lootItems.push({ name: 'Отмычка', price: 5, weight: 0.1, category: 'Инструменты' });

        lastGeneratedBandit = {
            name: 'Бандит', race, sign, god: god.name, level, hp, mp,
            str, dex, con,
            weaponDmg, weaponNote: isRanged ? bow.name : weapon.name, isRanged, isMage: false, spells: [],
            ammo,
            armor: totalArmor, gold, lootItems, isRaisable: true, soul: 'black'
        };

        let html = `<strong>Ур. ${level} · ${race}, знак «${sign}»${god.name !== '— без веры —' ? ', поклоняется ' + god.name : ''}</strong><br>`;
        if (god.blessing) html += `<span style="opacity:.75;">Благословение: ${escapeHtml(god.blessing)}</span><br>`;
        html += `СИЛ ${str}(${strMod >= 0 ? '+' : ''}${strMod}) · ЛОВ ${dex}(${dexMod >= 0 ? '+' : ''}${dexMod}) · ТЕЛ ${con}(${conMod >= 0 ? '+' : ''}${conMod})<br>`;
        html += `ХП: ${hp} · МП: ${mp} · ${isRanged ? (/арбалет/i.test(bow.name) ? 'Арбалет' : 'Лук') : 'Оружие'}: ${isRanged ? bow.name + ' (' + weaponDmg + ' + ЛОВ ' + dex + ' = ' + (weaponDmg + dex) + ' урона за попадание)' : weapon.name + ' (' + weaponDmg + ' + СИЛ ' + str + ' = ' + (weaponDmg + str) + ' урона за попадание)'} · Броня: ${totalArmor}<br>`;
        if (ammo) html += `Колчан: ${ammo.name} ×${ammo.qty} (выстрел тратит 1, остаток — в добычу)<br>`;
        html += `Лут (может выпасть не всё): 💰${gold}` + lootItems.map(l => ', ' + l.name).join('') + '';
        resultEl.innerHTML = html;
    };

    // ---------- Отдельный генератор магов-бандитов (кап уровня 60, одеяния + заклинания) ----------

    // Заклинания магов-бандитов — по рангу заклинания (базовый уровень требуемого умения),
    // не жёстко привязаны к конкретному уровню бандита: чем выше уровень мага, тем ВЫШЕ ранг
    // заклинаний ему доступен (использует реальные заклинания из spell-data.js, не выдуманные).
    function getBanditMageSpellPool(level) {
        if (!window.spellsData) return [];
        const maxRank = level >= 45 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;
        const schools = ['destr', 'restor', 'conj']; // разрушение/восстановление/колдовство — боевые школы (ключ колдовства в spell-data — 'conj')
        const pool = [];
        schools.forEach(school => {
            for (let r = 1; r <= maxRank; r++) {
                (window.spellsData[school] && window.spellsData[school][r] || []).forEach(s => { if (/барьер/i.test(s.name)) return; pool.push(Object.assign({ school }, s)); });
            }
        });
        return pool;
    }

    // Одеяния для магов-бандитов — по цене (грубая привязка к уровню: чем выше уровень, тем
    // дороже/лучше одеяние доступно), из реального items-data.js (категория "Магические одеяния").
    function getBanditMageRobePool(level) {
        const maxPrice = 50 + level * 15; // кап 60 lvl ≈ 950 септимов потолок цены одеяния
        return (gmAllItems || []).filter(i => i.category === 'Магические одеяния' && typeof i.price === 'number' && i.price <= maxPrice);
    }

    let lastGeneratedMageBandit = null;

    window.generateMageBandit = function () {
        const resultEl = el('bandit-mage-gen-result');
        const avgLevel = parseInt(el('bandit-mage-avg-level').value) || 10;
        const level = Math.max(1, Math.min(60, avgLevel + (Math.floor(Math.random() * 4) - 1)));

        const spellPool = getBanditMageSpellPool(level);
        if (!spellPool.length) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных о заклинаниях — проверь, что spell-data.js подключён.</span>'; return; }

        const race = BANDIT_RACES[Math.floor(Math.random() * BANDIT_RACES.length)];
        const sign = BANDIT_SIGNS[Math.floor(Math.random() * BANDIT_SIGNS.length)];
        const god = BANDIT_GODS[Math.floor(Math.random() * BANDIT_GODS.length)];

        // 2-4 заклинания, желательно из разных школ для разнообразия.
        const spellCount = Math.min(spellPool.length, 2 + Math.floor(Math.random() * 3));
        const pickedSpells = [];
        const shuffled = spellPool.slice().sort(() => Math.random() - 0.5);
        for (const s of shuffled) {
            if (pickedSpells.length >= spellCount) break;
            if (!pickedSpells.find(p => p.name === s.name)) pickedSpells.push(s);
        }
        // Характеристики мага-бандита — приоритет Интеллект(сила заклинаний)/Дух(мана), Телосложение
        // ниже, чем у воинов-бандитов (маги традиционно более хрупкие).
        const con = 10 + Math.floor(level * 0.2) + Math.floor(Math.random() * 3);
        const int_ = 13 + Math.floor(level * 0.26) + Math.floor(Math.random() * 3);
        const wis = 12 + Math.floor(level * 0.22) + Math.floor(Math.random() * 3);
        const intMod = calcAbilityMod(int_);

        const levelDmgMult = 1 + (level - 1) * 0.05;
        const spells = pickedSpells.map(s => {
            // Колдовство (призывы, ауры, проклятия) урона по цели не наносит — числа в описании про существо; мастер применяет по описанию.
            const dmg = (s.school !== 'conj' && typeof parseSpellDamageFromDesc === 'function') ? parseSpellDamageFromDesc(s.desc) : null;
            return { name: s.name, dmg: dmg ? Math.round(dmg * levelDmgMult) + intMod : 0, cost: parseInt(s.baseCost) || parseInt(s.cost) || 20, school: s.school }; // цена — baseCost из spell-data
        });

        const robePool = getBanditMageRobePool(level);
        const robe = robePool.length ? robePool[Math.floor(Math.random() * robePool.length)] : null;

        const hp = con * 10 + Math.round(randInt(0, 15) * (1 + (level - 1) * 0.06));
        const mp = Math.round(randInt(80, 140) * (1 + (level - 1) * 0.08)); // маги — мана в разы больше воинов
        const gold = Math.round(randInt(15, 100) * (1 + (level - 1) * 0.1));

        const trinketPool = (gmAllItems || []).filter(i => i.category === 'Ювелирное изделие' && typeof i.price === 'number' && !isUniqueLootItem(i));
        const trinket = Math.random() < 0.4 && trinketPool.length ? trinketPool[Math.floor(Math.random() * trinketPool.length)] : null;

        const lootItems = [];
        // Слот — как у вещи в базе (одеяние — robe, капюшон — helmet, сапоги — boots…), иначе снятое не надеть.
        if (robe && Math.random() < 0.7) lootItems.push({ name: robe.name, price: robe.price || 0, weight: robe.weight || 2, slot: robe.slot || 'robe', armor: typeof robe.armor === 'number' ? robe.armor : 0, category: robe.category || 'Магические одеяния', effect: robe.effect || '' });
        if (trinket) lootItems.push({ name: trinket.name, price: trinket.price || 0, weight: trinket.weight, slot: trinket.slot, category: 'Ювелирное изделие (с трупа)' });
        if (Math.random() < 0.5) lootItems.push({ name: 'Отмычка', price: 5, weight: 0.1, category: 'Инструменты' });

        lastGeneratedMageBandit = {
            name: 'Бандит-маг', race, sign, god: god.name, level, hp, mp,
            con, int: int_, wis,
            weaponDmg: 0, weaponNote: robe ? robe.name : 'Без одеяния', isRanged: false, isMage: true, spells,
            armor: 0, gold, lootItems, isRaisable: true, soul: 'black'
        };

        let html = `<strong>Маг ур. ${level} · ${race}, знак «${sign}»${god.name !== '— без веры —' ? ', поклоняется ' + god.name : ''}</strong><br>`;
        if (god.blessing) html += `<span style="opacity:.75;">Благословение: ${escapeHtml(god.blessing)}</span><br>`;
        html += `ИНТ ${int_}(${intMod >= 0 ? '+' : ''}${intMod}) · ДУХ ${wis} · ТЕЛ ${con}<br>`;
        html += `ХП: ${hp} · МП: ${mp} · Одеяние: ${robe ? robe.name : '—'}<br>`;
        html += `Заклинания (вкл. ИНТ): ${spells.map(s => `${s.name} (${s.dmg || '—'} урона/${s.cost} маны)`).join(', ')}<br>`;
        html += `Лут (может выпасть не всё): 💰${gold}` + lootItems.map(l => ', ' + l.name).join('') + '';
        resultEl.innerHTML = html;
    };

    // Объект бандита для боя вынесен в функцию (эпик 3.8), чтобы тот же самый враг мог уйти в шаблон без повторной случайности.
    function banditEnemyObj(b) {
        // Физический резист от брони: 10 очков брони = 1% (та же формула, что у игроков).
        const physResist = Math.min(85, Math.round((b.armor || 0) / 10));
        return {
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            str: b.str, dex: b.dex, con: b.con,
            weaponDmg: b.weaponDmg, weaponNote: b.weaponNote, isRanged: !!b.isRanged, resist: { physical: physResist }, spells: b.spells || [], ammo: b.ammo ? Object.assign({}, b.ammo) : null,
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, lootKit: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        };
    }
    function mageBanditEnemyObj(b) {
        return {
            id: genId('e'), name: b.name + ' (ур.' + b.level + ', ' + b.race + ')', maxHp: b.hp, curHp: b.hp, maxMp: b.mp || 0, curMp: b.mp || 0,
            con: b.con, int: b.int, wis: b.wis,
            weaponDmg: 0, weaponNote: b.weaponNote, resist: { physical: 0 }, spells: b.spells || [],
            isRaisable: true, soul: 'black', level: b.level, kind: 'people', corpseLoot: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, lootKit: { gold: b.gold, items: stripUndefinedDeep(b.lootItems) }, corpseRace: b.race, corpseSign: b.sign, corpseGod: b.god
        };
    }
    window.addGeneratedBanditToCombat = function () {
        if (!lastGeneratedBandit) { alert('Сначала сгенерируй бандита.'); return; }
        const b = lastGeneratedBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push(banditEnemyObj(b));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedBandit = null;
            el('bandit-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.addGeneratedMageBanditToCombat = function () {
        if (!lastGeneratedMageBandit) { alert('Сначала сгенерируй мага-бандита.'); return; }
        const b = lastGeneratedMageBandit;
        const enemies = (lastData.enemies || []).slice();
        enemies.push(mageBanditEnemyObj(b));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedMageBandit = null;
            el('bandit-mage-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    // ---------- Лут с трупов любых врагов и генераторы драугров/изгоев (логика — в enemy-loot.js) ----------

    function enemyLootCtx(level) {
        return { pool: gmAllItems || [], level: level || 1, gearPool: typeof getBanditGearPool === 'function' ? getBanditGearPool : null };
    }
    // Бросок добычи по текстовому полю «лут» врага (дроп с вики): шанс, количество, золото, общие слова вроде «драг. камень».
    function rollEnemyCorpseLoot(enemy) {
        if (!window.EnemyLoot) return { gold: 0, items: [] };
        return window.EnemyLoot.rollFromText(enemy.loot, enemyLootCtx(enemy.level));
    }
    function describeLootItems(items) {
        return (items || []).map(i => i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '')).join(', ');
    }
    function genLootText(gen) {
        return [gen.gold ? gen.gold + ' зол.' : '', describeLootItems(gen.lootItems || gen.items)].filter(Boolean).join(', ');
    }

    // Добыча с трупа: по умолчанию тому, кто добил врага (killedBy, а если добил мастер — последний ранивший, lastHitBy),
    // мастер может выбрать другого. Павшим игрокам добыча не уходит. Раньше бралась первая строка селектора
    // генератора лута — каждый раз первый игрок в сессии, даже павший.
    function gmLivingPlayers() {
        const parts = (lastData && lastData.participants) || {};
        return Object.keys(parts).filter(uid => { const p = parts[uid] || {}; return !p.fallen && (p.curHp === undefined || (parseInt(p.curHp) || 0) > 0); });
    }
    const gmCorpseLootTo = {}; // выбор мастера по трупу (переживает перерисовку списка)
    function gmCorpseKiller(enemy) { return (enemy && (enemy.killedBy || enemy.lastHitBy)) || ''; }
    function gmCorpseLootTarget(enemy) {
        const living = gmLivingPlayers();
        const picked = gmCorpseLootTo[enemy.id];
        if (picked && living.includes(picked)) return picked;
        const killer = gmCorpseKiller(enemy);
        if (killer && living.includes(killer)) return killer;
        return living[0] || '';
    }
    function gmCorpseLootControls(e) {
        const parts = (lastData && lastData.participants) || {};
        const living = gmLivingPlayers();
        if (!living.length) return '<div style="opacity:.75; margin-top:2px;">Все игроки пали — добычу отдать некому.</div>';
        const killer = gmCorpseKiller(e), cur = gmCorpseLootTarget(e);
        const killerName = killer && parts[killer] ? parts[killer].name || '?' : '';
        return '<div style="display:flex; gap:4px; margin-top:2px; align-items:center;">' +
            '<select style="flex:1; font-size:12px;" title="Кому уйдёт добыча (только живые игроки)" onchange="gmSetCorpseLootTo(\'' + e.id + '\', this.value)">' +
            living.map(uid => '<option value="' + escapeHtml(uid) + '"' + (uid === cur ? ' selected' : '') + '>' + escapeHtml((parts[uid] || {}).name || uid) + (uid === killer ? ' ⚔ добил' : '') + '</option>').join('') +
            '</select>' +
            '<button style="margin:0; font-size:12px;" onclick="lootCorpse(\'' + e.id + '\')">💰 Обыскать</button></div>' +
            (killerName && !living.includes(killer) ? '<div style="opacity:.7; font-size:11px;">Добил(а) ' + escapeHtml(killerName) + ', но персонаж пал — выбери живого.</div>' : '');
    }
    window.gmSetCorpseLootTo = function (enemyId, uid) { gmCorpseLootTo[enemyId] = uid; };

    window.lootCorpse = function (enemyId) {
        const enemy = (lastData.enemies || []).find(e => e.id === enemyId);
        if (!enemy) { alert('Противник не найден.'); return; }
        if (enemy.looted) { alert('Этот труп уже обыскан.'); return; }
        const targetUid = gmCorpseLootTarget(enemy);
        if (!targetUid) { alert('Все игроки пали — добычу с трупа отдать некому.'); return; }
        // Готовая добыча (бандиты, драугры, изгои) или бросок по тексту лута из базы врагов
        let loot = null, items = [], gold = 0;
        const charRefL = db.collection('characters').doc(targetUid);
        const sessRefL = db.collection('sessions').doc(currentCode);
        // Сначала «занимаем» труп транзакцией по свежим данным сессии: отметка «обыскан» ставится ДО выдачи.
        // Раньше она ставилась после выдачи по снимку мастера — двойной клик или обыск игроком в ту же секунду давали добычу дважды.
        const setEnemy = (en, id, patch) => (en || []).map(e => e && e.id === id ? Object.assign({}, e, patch) : e);
        db.runTransaction(tx => tx.get(sessRefL).then(sd => {
            const en = ((sd.exists && sd.data()) || {}).enemies || [];
            const cur = en.find(e => e && e.id === enemyId);
            if (!cur) throw new Error('Противник уже убран из боя.');
            if (cur.looted) throw new Error('Этот труп уже обыскан.');
            loot = gmWithQuiverLoot(cur.corpseLoot || rollEnemyCorpseLoot(cur), cur);
            items = loot.items || []; gold = loot.gold || 0;
            tx.update(sessRefL, { enemies: stripUndefinedDeep(setEnemy(en, enemyId, { corpseLoot: null, looted: true })) });
        })).then(() => db.runTransaction(tx => tx.get(charRefL).then(doc => { // инвентарь и золото — одной транзакцией (гонка с автосохранением игрока)
            const data = doc.exists ? doc.data() : {};
            const inv = Array.isArray(data.inventory) ? data.inventory.slice() : [];
            items.forEach((it, idx) => {
                const qty = Math.max(1, parseInt(it.qty) || 1);
                // Эффекты зелий/ядов с трупа (enemy-loot.js кладёт alchemyEffects) и категория «Зелье»/«Яд» — как при «Передать».
                const extra = gmItemExtraFromSource(it);
                delete extra.enchantment; // зачарование с трупа — ниже, отдельной записью
                const effect = it.effect || '';
                if (it.enchantment) {
                    // Зачарованная вещь — отдельной записью (имя#время, как у вещей игрока), чтобы её можно было разрушить и узнать зачарование.
                    extra.enchantment = it.enchantment;
                    if (typeof it.chargeDaysLeft === 'number') extra.chargeDaysLeft = it.chargeDaysLeft;
                    inv.push(Object.assign({ itemId: it.name + '#' + Date.now() + idx, name: it.name, count: 1, weight: it.weight || 0, category: it.category || '', effect }, extra));
                    return;
                }
                gmMergeInvItem(inv, { itemId: it.name, name: it.name, weight: it.weight || 0, category: it.category || '', effect }, qty, extra);
            });
            const newGold = (parseInt(data.gold) || 0) + gold;
            const patchL = { inventory: stripUndefinedDeep(inv), gold: newGold };
            if (doc.exists) tx.update(charRefL, patchL); else tx.set(charRefL, patchL, { merge: true });
        })).catch(err => { // выдать не вышло — возвращаем труп необысканным с той же добычей
            return db.runTransaction(tx => tx.get(sessRefL).then(sd => {
                const en = ((sd.exists && sd.data()) || {}).enemies || [];
                tx.update(sessRefL, { enemies: stripUndefinedDeep(setEnemy(en, enemyId, { corpseLoot: loot, looted: false })) });
            })).catch(() => { }).then(() => { throw err; });
        })).then(() => {
            const pname = (lastData.participants[targetUid] || {}).name || targetUid;
            const summary = [gold ? gold + ' септ.' : '', describeLootItems(items)].filter(Boolean).join(', ') || 'ничего ценного';
            alert(`Добыча с трупа «${enemy.name}» выдана игроку ${pname}: ${summary}.`);
            gmPostLogEntryText(`💀 ${pname} обыскал(а) труп «${enemy.name}» и забрал(а): ${summary}.`);
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    function initEnemyGearPanels() {
        const fill = (selId, family) => {
            const sel = el(selId);
            if (!sel || !window.enemiesData || !window.EnemyGear) return;
            const list = window.enemiesData.filter(e => window.EnemyGear.familyOf(e.name) === family);
            sel.innerHTML = '<option value="random">🎲 Случайный (по среднему уровню группы)</option>' +
                list.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)} (ур. ${e.level}, ${e.hp} ХП)</option>`).join('');
        };
        fill('draugr-gen-type', 'draugr');
        fill('forsworn-gen-type', 'forsworn');
        // Четыре генератора живут в одном окне «Генератор врагов»: виден один, выбор помним в браузере мастера.
        let kind = 'bandit';
        try { kind = localStorage.getItem('gm_enemy_gen_kind') || 'bandit'; } catch (e) { }
        gmShowEnemyGen(kind);
    }

    function gmShowEnemyGen(kind) {
        const panes = document.querySelectorAll('.enemy-gen-pane[data-enemy-gen]');
        if (!Array.from(panes).some(p => p.dataset.enemyGen === kind)) kind = 'bandit';
        panes.forEach(p => { p.style.display = p.dataset.enemyGen === kind ? '' : 'none'; });
        const sel = el('enemy-gen-kind');
        if (sel && sel.value !== kind) sel.value = kind;
        try { localStorage.setItem('gm_enemy_gen_kind', kind); } catch (e) { }
    }
    window.gmShowEnemyGen = gmShowEnemyGen;

    function pickEnemyGenType(family, selectId, levelInputId) {
        const all = (window.enemiesData || []).filter(e => window.EnemyGear && window.EnemyGear.familyOf(e.name) === family);
        const v = el(selectId).value;
        if (v !== 'random') return all.find(e => e.name === v) || null;
        const avg = parseInt(el(levelInputId).value) || 10;
        let near = all.filter(e => Math.abs((e.level || 1) - avg) <= 6);
        if (!near.length) near = all.slice().sort((a, b) => Math.abs((a.level || 1) - avg) - Math.abs((b.level || 1) - avg)).slice(0, 2);
        return near[Math.floor(Math.random() * near.length)];
    }

    function renderGeneratedEnemy(gen, resultEl) {
        const ench = gen.lootItems.filter(l => l.enchantment);
        let html = `<strong>${escapeHtml(gen.name)} · ур. ${gen.level}</strong><br>`;
        html += `СИЛ ${gen.str} · ЛОВ ${gen.dex} · ТЕЛ ${gen.con}<br>`;
        html += `ХП: ${gen.hp}${gen.mp ? ' · МП: ' + gen.mp : ''} · Урон: ${gen.weaponDmg}${gen.isRanged ? '+ЛОВ' : '+СИЛ'}${gen.isRanged ? ' (дальний бой)' : ''} · Броня: ${gen.armor} (физ. резист ${gen.resist.physical || 0}%)<br>`;
        html += `Снаряжение: ${escapeHtml(gen.weaponNote || '—')}${gen.gear.worn.length ? ' · надето: ' + gen.gear.worn.map(escapeHtml).join(', ') : ''}<br>`;
        if (gen.spells.length) html += `Заклинания: ${gen.spells.map(s => escapeHtml(s.name) + ' (' + (s.dmg || 0) + '/' + (s.cost || 0) + ')').join(', ')}<br>`;
        if (gen.shouts.length) html += `Крики: ${gen.shouts.map(s => escapeHtml(s.name)).join(', ')}<br>`;
        html += `Лут (может выпасть не всё): ${gen.gold ? '💰' + gen.gold + ', ' : ''}${escapeHtml(describeLootItems(gen.lootItems)) || '—'}`;
        if (ench.length) html += `<br>🔮 Зачарованное: ${ench.map(l => escapeHtml(l.name) + ' — ' + escapeHtml(l.enchantment.description || '')).join('; ')}`;
        resultEl.innerHTML = html;
    }

    function enemyFromGenerated(gen) {
        return stripUndefinedDeep({
            id: genId('e'), name: gen.name + ' (ур.' + gen.level + ')', maxHp: gen.hp, curHp: gen.hp, maxMp: gen.mp || 0, curMp: gen.mp || 0,
            str: gen.str, dex: gen.dex, con: gen.con,
            weaponDmg: gen.weaponDmg, weaponNote: gen.weaponNote, isRanged: gen.isRanged, resist: gen.resist, ammo: gen.ammo || null,
            spells: gen.spells, shouts: gen.shouts, soul: gen.soul, level: gen.level, kind: gen.kind,
            loot: genLootText(gen), corpseLoot: { gold: gen.gold, items: gen.lootItems }, lootKit: { gold: gen.gold, items: gen.lootItems }
        });
    }

    let lastGeneratedDraugr = null, lastGeneratedForsworn = null;

    window.generateDraugr = function () {
        const resultEl = el('draugr-gen-result');
        if (!window.EnemyGear) { resultEl.innerHTML = '<span style="color:#e74c3c;">enemy-loot.js не подключён.</span>'; return; }
        const base = pickEnemyGenType('draugr', 'draugr-gen-type', 'draugr-avg-level');
        if (!base) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных о драуграх (enemies-data.js).</span>'; return; }
        const gen = window.EnemyGear.generate(base, enemyLootCtx(base.level));
        if (!gen) { resultEl.innerHTML = '<span style="color:#e74c3c;">Не удалось сгенерировать.</span>'; return; }
        lastGeneratedDraugr = gen;
        renderGeneratedEnemy(gen, resultEl);
    };
    window.addGeneratedDraugrToCombat = function () {
        if (!lastGeneratedDraugr) { alert('Сначала сгенерируй драугра.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enemies.push(enemyFromGenerated(lastGeneratedDraugr));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedDraugr = null;
            el('draugr-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };

    window.generateForsworn = function () {
        const resultEl = el('forsworn-gen-result');
        if (!window.EnemyGear) { resultEl.innerHTML = '<span style="color:#e74c3c;">enemy-loot.js не подключён.</span>'; return; }
        const base = pickEnemyGenType('forsworn', 'forsworn-gen-type', 'forsworn-avg-level');
        if (!base) { resultEl.innerHTML = '<span style="color:#e74c3c;">Нет данных об изгоях (enemies-data.js).</span>'; return; }
        const gen = window.EnemyGear.generate(base, enemyLootCtx(base.level));
        if (!gen) { resultEl.innerHTML = '<span style="color:#e74c3c;">Не удалось сгенерировать.</span>'; return; }
        lastGeneratedForsworn = gen;
        renderGeneratedEnemy(gen, resultEl);
    };
    window.addGeneratedForswornToCombat = function () {
        if (!lastGeneratedForsworn) { alert('Сначала сгенерируй изгоя.'); return; }
        const enemies = (lastData.enemies || []).slice();
        enemies.push(enemyFromGenerated(lastGeneratedForsworn));
        gmUpdateEnemies(enemies).then(() => {
            lastGeneratedForsworn = null;
            el('forsworn-gen-result').innerHTML = '';
        }).catch(e => alert('Ошибка: ' + e.message));
    };
