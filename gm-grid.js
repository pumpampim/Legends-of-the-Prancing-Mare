// Боевая сетка мастера: расстановка игроков, их существ и врагов, окружение, руны, длительные зоны, скорость.
// Данные — session.grid (см. grid-core.js). Пишет только мастер; игроки читают (дальность атак) и шлют
// заявки (pendingRunes / pendingZones), которые мастер ставит на поле.
(function () {
    const G = () => window.GridCore;
    const B = () => window.GmBridge;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const LS = 'skyrim_gm_grid_view';
    let view = { cs: 26, labels: true }; try { Object.assign(view, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { }
    let grid = null;           // локальная копия session.grid
    let data = null;           // последний снимок сессии
    let tool = 'select';       // select | wall | rock | tree | water | bush | erase | ruler | rune
    let selKey = null;         // выбранная фигура
    let placing = null;        // { type:'token', key } | { type:'pending', id } | { type:'custom' } | { type:'zone', id, start? }
    let painting = false, paintDirty = false, dragFrom = null, rulerFrom = null, hover = null;
    const DEFAULT_ENEMY_SPEED = 30;

    // Руны: тип по названию заклинания
    const RUNES = {
        'Огненная руна': { icon: '🔥', dmgType: 'fire', label: 'огнём' },
        'Морозная руна': { icon: '❄', dmgType: 'frost', label: 'холодом' },
        'Грозовая руна': { icon: '⚡', dmgType: 'shock', label: 'электричеством' },
        'Ядовитая руна': { icon: '☠', dmgType: 'poison', label: 'ядом' },
        'Руна солнца': { icon: '☀', dmgType: 'magic', label: 'светом (только нежить)', undeadOnly: true },
        'Руна гейзера': { icon: '💦', dmgType: '', label: 'подбрасывает', knock: true }
    };
    window.GRID_RUNES = RUNES;
    const ZONE_COLORS = { fire: 'rgba(231,76,60,.28)', frost: 'rgba(52,152,219,.28)', shock: 'rgba(155,89,182,.3)', magic: 'rgba(241,196,15,.22)', poison: 'rgba(46,204,113,.25)', '': 'rgba(200,200,200,.18)' };

    function norm(g) {
        const o = g && typeof g === 'object' ? JSON.parse(JSON.stringify(g)) : {};
        o.w = Math.max(5, Math.min(100, parseInt(o.w) || 50)); o.h = Math.max(5, Math.min(100, parseInt(o.h) || 50));
        o.cells = o.cells || {}; o.tokens = o.tokens || {}; o.runes = o.runes || {}; o.zones = o.zones || {};
        return o;
    }
    const isUndead = e => (e && (e.kind === 'undead' || /скелет|драугр|нежить|привед|зомби|вампир/i.test(e.name || '')));
    // Все фигуры, которые можно поставить: враги, игроки, существа игроков.
    function entitiesOf(d) {
        const out = {}; d = d || {};
        (d.enemies || []).forEach(e => {
            const k = G().tokenKey('e', e.id);
            out[k] = { key: k, kind: 'e', ref: e.id, name: e.name, hp: e.curHp || 0, maxHp: e.maxHp || 0, mp: e.curMp || 0, maxMp: e.maxMp || 0, dmg: B().enemyDmg(e), dead: (e.curHp || 0) <= 0, speed: parseInt(e.speed) || DEFAULT_ENEMY_SPEED, src: e };
        });
        const parts = d.participants || {};
        Object.keys(parts).forEach(uid => {
            const p = parts[uid] || {};
            const k = G().tokenKey('p', uid);
            out[k] = { key: k, kind: 'p', ref: uid, name: p.name || 'Игрок', hp: p.curHp || 0, maxHp: p.maxHp || 0, mp: p.curMp || 0, maxMp: p.maxMp || 0, dmg: p.dmg || 0, dead: !!p.fallen, speed: parseInt(p.speed) || 30 };
            (p.summons || []).forEach(s => {
                const ks = G().tokenKey('s', s.id, uid);
                out[ks] = { key: ks, kind: 's', ref: s.id, owner: uid, name: s.name, ownerName: p.name, hp: s.curHp || 0, maxHp: s.maxHp || 0, mp: s.curMp || 0, maxMp: s.maxMp || 0, dmg: s.dmg || 0, dead: (s.curHp || 0) <= 0, speed: parseInt(s.speed) || 30, rangeFt: parseInt(s.rangeFt) || 15 };
            });
            // животные игрока — фигуры того же вида 's' (удар руны/площади по ним хозяин применяет к животному)
            (p.pets || []).forEach(pt => {
                const kp = G().tokenKey('s', pt.id, uid);
                out[kp] = { key: kp, kind: 's', pet: true, ref: pt.id, owner: uid, name: (pt.icon || '🐾') + ' ' + pt.name, ownerName: p.name, hp: pt.hp || 0, maxHp: pt.maxHp || 0, mp: 0, maxMp: 0, dmg: 0, dead: (pt.hp || 0) <= 0, speed: 30 };
            });
        });
        return out;
    }
    const entities = () => entitiesOf(data);
    // занятость с учётом крупных фигур
    function occupiedBy(x, y, exceptKey, gr, ents) {
        gr = gr || grid; ents = ents || entities();
        return Object.keys(gr.tokens).find(k => {
            if (k === exceptKey || !ents[k] || ents[k].dead) return false;
            const t = gr.tokens[k], n = G().size(t);
            return x >= t.x && x < t.x + n && y >= t.y && y < t.y + n;
        }) || null;
    }
    const tokenAt = (x, y, exceptKey) => occupiedBy(x, y, exceptKey);
    function anyTokenAt(x, y) { // включая мёртвых (выбрать труп)
        return Object.keys(grid.tokens).find(k => { const t = grid.tokens[k], n = G().size(t); return x >= t.x && x < t.x + n && y >= t.y && y < t.y + n; }) || null;
    }
    function save(extra) {
        const b = B(); if (!b || !b.code()) return Promise.resolve();
        const ents = entities();
        Object.keys(grid.tokens).forEach(k => { if (!ents[k]) delete grid.tokens[k]; });
        const patch = Object.assign({ grid: b.strip(grid) }, extra || {});
        return b.db().collection('sessions').doc(b.code()).update(patch).catch(e => alert('Сетка не сохранилась: ' + e.message));
    }
    const curTick = () => parseInt((data || {}).sessionTickCounter) || 0;
    function moveLeft(key) {
        const t = grid.tokens[key], en = entities()[key]; if (!t || !en) return 0;
        const used = (t.mv && t.mv.tick === curTick()) ? (t.mv.ft || 0) : 0;
        let spd = parseInt(t.speed) || en.speed;
        // Статусы врага: паралич/оглушение/заморозка — стоит на месте; замедление — минус футы из описания статуса.
        if (en.kind === 'e' && en.src && window.StCombat) {
            const fl = window.StCombat.statusFlags(en.src);
            if (fl.immobile) return 0;
            if (fl.slowFt) spd = Math.max(0, spd - fl.slowFt);
        }
        return Math.max(0, spd - used);
    }

    // ---------- зоны (плащи, ауры, круги, стены, камень) ----------
    // Клетки, на которые действует зона в данный момент.
    function zoneCovers(z, t, gr) {
        if (!t) return false;
        if (z.kind === 'wall') return G().footprint(t).some(c => (z.cells || []).some(w => w[0] === c.x && w[1] === c.y));
        const rc = Math.floor((z.radiusFt || 5) / 5);
        const center = z.follow ? gr.tokens[z.follow] : { x: z.x, y: z.y };
        if (!center || typeof center.x !== 'number') return false;
        return G().cells(center, t) <= rc;
    }
    function zoneDrawCells(z) {
        if (z.kind === 'wall') return (z.cells || []).map(c => ({ x: c[0], y: c[1] }));
        const center = z.follow ? grid.tokens[z.follow] : { x: z.x, y: z.y };
        if (!center || typeof center.x !== 'number') return [];
        const rc = Math.floor((z.radiusFt || 5) / 5), n = G().size(center), out = [];
        for (let x = center.x - rc; x < center.x + n + rc; x++) for (let y = center.y - rc; y < center.y + n + rc; y++) {
            if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
            if (z.follow && x >= center.x && x < center.x + n && y >= center.y && y < center.y + n) continue;
            out.push({ x, y });
        }
        return out;
    }
    // Тик зон (вызывается из gm.js в транзакции «следующего хода»): возвращает новых врагов, сетку, журнал и удары по игрокам.
    // Кто ранил/добил врага руной или зоной — добыча с трупа по умолчанию уходит убийце (как при обычной атаке игрока).
    function markHitBy(e, uid, hurt, died) {
        if (!uid) return; // руну/зону поставил мастер
        if (hurt || died) e.lastHitBy = uid;
        if (died) e.killedBy = uid;
    }
    function zoneTick(d, enemiesIn) {
        const gr = norm(d.grid); const ents = entitiesOf(Object.assign({}, d, { enemies: enemiesIn }));
        const enemies = enemiesIn.map(e => Object.assign({}, e));
        const logs = [], hits = [];
        Object.keys(gr.zones).forEach(zid => {
            const z = gr.zones[zid]; const names = [];
            Object.keys(gr.tokens).forEach(k => {
                const en = ents[k]; if (!en || en.dead || !zoneCovers(z, gr.tokens[k], gr)) return;
                if (z.follow === k) return; // заклинатель не бьёт сам себя своей аурой
                if (en.kind !== 'e') {
                    if (z.who !== 'all' || !z.dmg) return;
                    hits.push({ uid: en.kind === 'p' ? en.ref : en.owner, summonId: en.kind === 's' ? en.ref : '', dmg: z.dmg, dmgType: z.dmgType || '', from: z.spell });
                    names.push(en.name + ' −' + z.dmg); return;
                }
                const e = enemies.find(x => x.id === en.ref); if (!e || (e.curHp || 0) <= 0) return;
                if (z.who === 'undead' && !isUndead(e)) return;
                if (z.effect === 'flee') {
                    if (z.maxLevel && e.level && e.level > z.maxLevel) return;
                    if ((e.statusEffects || []).some(s => s.name === 'Бегство')) return;
                    e.statusEffects = (e.statusEffects || []).concat([{ id: 'zf' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Бегство', desc: 'Бежит из «' + z.spell + '»', turns: z.fleeTurns || 2, noAttack: true }]);
                    names.push(e.name + ' бежит'); return;
                }
                if (z.slow) {
                    e.statusEffects = (e.statusEffects || []).filter(s => s.name !== 'Замедление (' + z.spell + ')').concat([{ id: 'zs' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Замедление (' + z.spell + ')', desc: '−' + z.slow + ' фт скорости', turns: 1 }]);
                }
                if (z.dmg) {
                    const pv = window.StCombat ? window.StCombat.previewDamage(e, z.dmg, z.noResist ? '' : (z.dmgType || ''), 0) : { finalDmg: z.dmg };
                    if (z.dmg2) { // вторая стихия плаща лича (огонь + холод): считается отдельно — у каждой свои сопротивления и уязвимости
                        const pv2 = window.StCombat ? window.StCombat.previewDamage(e, z.dmg2, z.dmgType2 || '', 0) : { finalDmg: z.dmg2 };
                        pv.finalDmg += pv2.finalDmg;
                    }
                    const was = e.curHp || 0; e.curHp = Math.max(0, was - pv.finalDmg);
                    if (pv.finalDmg > 0 && Array.isArray(e.statusEffects)) e.statusEffects = e.statusEffects.filter(st => !(st && st.breakOnDamage)); // Полиморф и т.п. спадают от урона
                    if (z.mpDmg) e.curMp = Math.max(0, (e.curMp || 0) - z.mpDmg);
                    if (was > 0 && e.curHp <= 0) e.diedAtTurn = d.sessionTurnCounter || 0;
                    markHitBy(e, z.uid, pv.finalDmg > 0, was > 0 && e.curHp <= 0);
                    names.push(e.name + ' −' + pv.finalDmg + (e.curHp <= 0 ? ' ☠' : ''));
                } else if (z.slow) names.push(e.name + ' замедлен');
                if (z.resistDown) {
                    const st = (e.statusEffects || []).find(s => s.name === 'Гул камня');
                    const add = { fire: -z.resistDown, frost: -z.resistDown, shock: -z.resistDown, physical: -z.resistDown, poison: -z.resistDown, magic: -z.resistDown };
                    if (st) { Object.keys(add).forEach(k2 => { st.res = st.res || {}; st.res[k2] = (st.res[k2] || 0) + add[k2]; }); st.turns = 2; }
                    else e.statusEffects = (e.statusEffects || []).concat([{ id: 'zr' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Гул камня', desc: 'Сопротивления снижены', turns: 2, res: add }]);
                }
            });
            if (names.length) logs.push(`${z.icon || '✴'} «${z.spell}» (${z.ownerName || 'мастер'}): ${names.join(', ')}.`);
            if (z.unit === 'round' && typeof z.rounds === 'number') {
                // Плащи: длительность в кругах. Счёт ведём по общему счётчику кругов сессии: сколько кругов сменилось с прошлого тика — столько и списываем.
                const curR = parseInt(d.sessionRoundCounter) || 0;
                if (typeof z.lastRound !== 'number') z.lastRound = curR;
                if (curR > z.lastRound) { z.rounds -= curR - z.lastRound; z.lastRound = curR; }
                if (z.rounds <= 0) { delete gr.zones[zid]; logs.push(`${z.icon || '✴'} «${z.spell}» рассеивается.`); }
            } else if (typeof z.turns === 'number') { z.turns -= 1; if (z.turns <= 0) { delete gr.zones[zid]; logs.push(`${z.icon || '✴'} «${z.spell}» рассеивается.`); } }
        });
        return { enemies, grid: gr, logs, hits };
    }

    // ---------- рисование ----------
    const COLORS = { e: '#b03a2e', p: '#2e86c1', s: '#8e44ad' };
    function render() {
        const cv = $('gg-canvas'); if (!cv || !grid) return;
        const cs = view.cs, W = grid.w * cs, H = grid.h * cs;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const c = cv.getContext('2d');
        c.fillStyle = '#1b1712'; c.fillRect(0, 0, W, H);
        Object.keys(grid.cells).forEach(k => {
            const t = G().TERRAIN[grid.cells[k]]; if (!t) return;
            const [x, y] = k.split('_').map(Number);
            c.fillStyle = t.color; c.fillRect(x * cs, y * cs, cs, cs);
            if (cs >= 18) { c.font = Math.floor(cs * 0.6) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t.icon, x * cs + cs / 2, y * cs + cs / 2 + 1); }
        });
        // зоны
        Object.keys(grid.zones).forEach(zid => {
            const z = grid.zones[zid];
            c.fillStyle = ZONE_COLORS[z.dmgType || ''] || ZONE_COLORS[''];
            zoneDrawCells(z).forEach(p => c.fillRect(p.x * cs, p.y * cs, cs, cs));
            const first = zoneDrawCells(z)[0];
            if (first && z.kind !== 'aura') { c.font = Math.floor(cs * 0.6) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(z.icon || '✴', (z.kind === 'wall' ? first.x : z.x) * cs + cs / 2, (z.kind === 'wall' ? first.y : z.y) * cs + cs / 2 + 1); }
        });
        // подсветка, куда дойдёт выбранная фигура в этом ходу
        if (selKey && grid.tokens[selKey] && !placing && tool === 'select') {
            const t = grid.tokens[selKey], ents = entities();
            const left = moveLeft(selKey);
            const reach = G().reachable(grid, t, (x, y) => !!occupiedBy(x, y, selKey, grid, ents), left);
            c.fillStyle = 'rgba(46,204,113,.13)';
            reach.forEach(k => { const [x, y] = k.split('_').map(Number); c.fillRect(x * cs, y * cs, cs, cs); });
        }
        for (let i = 0; i <= grid.w; i++) { c.strokeStyle = i % 5 ? 'rgba(255,255,255,.07)' : 'rgba(200,165,102,.28)'; c.beginPath(); c.moveTo(i * cs + .5, 0); c.lineTo(i * cs + .5, H); c.stroke(); }
        for (let j = 0; j <= grid.h; j++) { c.strokeStyle = j % 5 ? 'rgba(255,255,255,.07)' : 'rgba(200,165,102,.28)'; c.beginPath(); c.moveTo(0, j * cs + .5); c.lineTo(W, j * cs + .5); c.stroke(); }
        Object.keys(grid.runes).forEach(id => {
            const r = grid.runes[id]; const R = RUNES[r.spell] || {};
            c.strokeStyle = '#f1c40f'; c.setLineDash([3, 3]); c.strokeRect((r.x - 1) * cs + 1, (r.y - 1) * cs + 1, cs * 3 - 2, cs * 3 - 2); c.setLineDash([]);
            c.font = Math.floor(cs * 0.7) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(R.icon || '✴', r.x * cs + cs / 2, r.y * cs + cs / 2 + 1);
        });
        const ents = entities();
        const from = rulerFrom || (selKey && grid.tokens[selKey]);
        if (from && hover) {
            c.strokeStyle = G().losFigures(grid, from, hover) ? 'rgba(241,196,15,.9)' : 'rgba(231,76,60,.9)';
            const fn = G().size(from);
            c.lineWidth = 2; c.beginPath(); c.moveTo(from.x * cs + fn * cs / 2, from.y * cs + fn * cs / 2); c.lineTo(hover.x * cs + cs / 2, hover.y * cs + cs / 2); c.stroke(); c.lineWidth = 1;
        }
        if (placing && placing.type === 'zone' && placing.start && hover) {
            line(placing.start, hover, placing.maxLen).forEach(p => { c.fillStyle = 'rgba(231,76,60,.35)'; c.fillRect(p.x * cs, p.y * cs, cs, cs); });
        }
        Object.keys(grid.tokens).forEach(k => {
            const t = grid.tokens[k], en = ents[k]; if (!en) return;
            const n = G().size(t);
            const cx = t.x * cs + n * cs / 2, cy = t.y * cs + n * cs / 2, r = n * cs * 0.44;
            c.globalAlpha = en.dead ? 0.35 : 1;
            c.fillStyle = COLORS[en.kind] || '#777'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
            c.strokeStyle = k === selKey ? '#f1c40f' : 'rgba(0,0,0,.6)'; c.lineWidth = k === selKey ? 3 : 1.5; c.stroke(); c.lineWidth = 1;
            c.fillStyle = '#fff'; c.font = 'bold ' + Math.max(9, Math.floor(cs * 0.42 * (n > 1 ? 1.6 : 1))) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(en.dead ? '☠' : String(en.name || '?').trim().charAt(0).toUpperCase(), cx, cy + 1);
            c.globalAlpha = 1;
        });
        if (view.labels) Object.keys(grid.tokens).forEach(k => {
            const t = grid.tokens[k], en = ents[k]; if (!en || en.dead) return;
            const n = G().size(t);
            const txt = `❤${en.hp}/${en.maxHp}` + (en.maxMp ? ` 🔷${en.mp}/${en.maxMp}` : '') + (en.dmg ? ` ⚔${en.dmg}` : '');
            c.font = '10px sans-serif'; const w = c.measureText(txt).width + 6;
            const bx = t.x * cs + n * cs / 2 - w / 2, by = t.y * cs - 15;
            c.fillStyle = 'rgba(0,0,0,.72)'; c.fillRect(bx, by, w, 13);
            const hpPct = en.maxHp ? Math.max(0, Math.min(1, en.hp / en.maxHp)) : 0;
            c.fillStyle = hpPct > .5 ? '#2ecc71' : hpPct > .25 ? '#f39c12' : '#e74c3c'; c.fillRect(bx, by + 12, w * hpPct, 2);
            c.fillStyle = '#f0e6d2'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(txt, bx + 3, by + 1);
        });
        if (hover && placing) { c.strokeStyle = '#2ecc71'; c.lineWidth = 2; c.strokeRect(hover.x * cs + 1, hover.y * cs + 1, cs - 2, cs - 2); c.lineWidth = 1; }
    }
    // прямая из клеток (для стен), не длиннее maxLen
    function line(a, b, maxLen) {
        const out = []; let x0 = a.x, y0 = a.y; const dx = Math.abs(b.x - x0), dy = Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1; let err = dx - dy;
        for (let i = 0; i < 200; i++) {
            out.push({ x: x0, y: y0 });
            if ((x0 === b.x && y0 === b.y) || out.length >= (maxLen || 6)) break;
            const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
        }
        return out;
    }

    // ---------- боковая панель ----------
    function renderSide() {
        const box = $('gg-side'); if (!box || !grid) return;
        const ents = entities();
        const off = Object.values(ents).filter(en => !en.dead && !grid.tokens[en.key]);
        const grp = (title, list) => list.length ? `<div class="gg-sub">${title}</div>` + list.map(en => `<button type="button" class="gg-pick${placing && placing.key === en.key ? ' on' : ''}" onclick="GmGrid.pickToPlace('${en.key}')">${en.kind === 'e' ? '👹' : en.kind === 'p' ? '🧑' : '🐾'} ${esc(en.name)}${en.ownerName ? ' <span style="opacity:.6">(' + esc(en.ownerName) + ')</span>' : ''}</button>`).join('') : '';
        let html = '<div class="gg-sub">Не на поле — нажми и затем клетку</div>';
        html += grp('Игроки', off.filter(e => e.kind === 'p')) + grp('Существа игроков', off.filter(e => e.kind === 's')) + grp('Враги', off.filter(e => e.kind === 'e'));
        if (!off.length) html += '<p class="gg-note">Все на поле.</p>';
        if (off.length) html += '<button type="button" onclick="GmGrid.autoPlace()" style="width:100%; margin-top:4px;">⚡ Расставить всех автоматически</button>';
        const pend = (data && Array.isArray(data.pendingRunes)) ? data.pendingRunes : [];
        html += '<div class="gg-sub" style="margin-top:8px;">✴ Руны к установке</div>';
        html += pend.length ? pend.map(r => `<button type="button" class="gg-pick${placing && placing.id === r.id ? ' on' : ''}" onclick="GmGrid.pickRune('${esc(r.id)}')">${(RUNES[r.spell] || {}).icon || '✴'} ${esc(r.spell)} — ${esc(r.ownerName || '')}${r.dmg ? ' · ' + r.dmg : ''} <span style="opacity:.6">(до ${r.maxFt || 25} фт)</span></button>`).join('') : '<p class="gg-note">Нет. Когда игрок кастует руну, она появится здесь.</p>';
        const pz = ((data && data.pendingZones) || []).filter(z => z.place === 'gm');
        if (pz.length) html += '<div class="gg-sub" style="margin-top:8px;">🔥 Стены/камни к установке</div>' + pz.map(z => `<button type="button" class="gg-pick${placing && placing.id === z.id ? ' on' : ''}" onclick="GmGrid.pickZone('${esc(z.id)}')">${z.icon || '✴'} ${esc(z.spell)} — ${esc(z.ownerName || '')} <span style="opacity:.6">(${z.kind === 'wall' ? 'клик: начало и конец, до ' + (z.maxLen || 6) * 5 + ' фт' : 'клик: центр'})</span></button>`).join('');
        const waiting = ((data && data.pendingZones) || []).filter(z => z.place !== 'gm');
        if (waiting.length) html += '<p class="gg-note">⏳ Ждут, пока заклинатель встанет на поле: ' + waiting.map(z => esc(z.spell) + ' (' + esc(z.ownerName || '') + ')').join(', ') + '</p>';
        if (selKey && ents[selKey]) {
            const en = ents[selKey], t = grid.tokens[selKey];
            html += `<div class="gg-card"><strong>${esc(en.name)}</strong>${t ? ` · клетка ${t.x + 1}:${t.y + 1}` : ''}<br>❤ ${en.hp}/${en.maxHp}${en.maxMp ? ' · 🔷 ' + en.mp + '/' + en.maxMp : ''}${en.dmg ? ' · ⚔ ' + en.dmg : ''}`;
            if (t) {
                const spd = parseInt(t.speed) || en.speed;
                const flS = (en.kind === 'e' && en.src && window.StCombat) ? window.StCombat.statusFlags(en.src) : null;
                html += `<br>🏃 Скорость ${spd} фт${flS && flS.immobile ? ' (обездвижен статусом)' : flS && flS.slowFt ? ` (замедление −${flS.slowFt})` : ''} · в этом ходу осталось <strong>${moveLeft(selKey)}</strong> фт`;
                html += `<br><span class="gg-note">Скорость: </span><input type="number" min="0" max="200" value="${spd}" style="width:60px; margin:2px 0;" onchange="GmGrid.setSpeed('${selKey}', this.value)">`;
                if (en.kind === 'e') html += `<br><span class="gg-note">Размер: </span>${[1, 2, 3, 4].map(n => `<button type="button" style="width:auto; margin:1px; padding:1px 7px;${G().size(t) === n ? ' outline:2px solid #f1c40f;' : ''}" onclick="GmGrid.setSize('${selKey}', ${n})">${n}×${n}</button>`).join('')}`;
            }
            if (en.kind !== 'e' && !en.dead) html += `<br><button type="button" style="width:100%; margin-top:4px;" onclick="GmGrid.targetForEnemy('${selKey}')">🎯 Цель для атаки противника</button>`;
            html += `<br><span class="gg-note">Клик по клетке — переместить (зелёным — куда дойдёт в этом ходу). Наведи — расстояние.</span><br><button type="button" class="btn-danger" style="width:100%; margin-top:4px;" onclick="GmGrid.removeToken('${selKey}')">Убрать с поля</button></div>`;
        }
        const runes = Object.keys(grid.runes);
        if (runes.length) html += '<div class="gg-sub" style="margin-top:8px;">Руны на поле</div>' + runes.map(id => { const r = grid.runes[id]; return `<div class="gg-note">${(RUNES[r.spell] || {}).icon || '✴'} ${esc(r.spell)} (${esc(r.ownerName || 'мастер')}) · ${r.x + 1}:${r.y + 1} <a href="#" onclick="GmGrid.removeRune('${esc(id)}'); return false;">убрать</a></div>`; }).join('');
        const zones = Object.keys(grid.zones);
        if (zones.length) html += '<div class="gg-sub" style="margin-top:8px;">Зоны на поле</div>' + zones.map(id => { const z = grid.zones[id]; return `<div class="gg-note">${z.icon || '✴'} ${esc(z.spell)} (${esc(z.ownerName || 'мастер')})${z.dmg ? ' · ' + z.dmg + '/ход' : ''}${typeof z.turns === 'number' ? ' · ещё ' + z.turns + ' х.' : ' · пока держит'} <a href="#" onclick="GmGrid.removeZone('${esc(id)}'); return false;">убрать</a></div>`; }).join('');
        box.innerHTML = html;
        const tb = $('gg-tools'); if (tb) tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
        const st = $('gg-status'); if (st) st.textContent = `Сетка ${grid.w}×${grid.h} клеток (${grid.w * 5}×${grid.h * 5} фт) · клетка = 5 фт` + (placing ? (placing.type === 'zone' && placing.start ? ' · выбери конец стены' : ' · выбери клетку для установки') : '');
    }
    function refresh() { render(); renderSide(); }

    // ---------- действия ----------
    function canStand(x, y, key, size) {
        const n = size || 1;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (!G().passable(grid, x + i, y + j) || tokenAt(x + i, y + j, key)) return false; }
        return true;
    }
    function setToken(key, x, y) {
        const en = entities()[key]; if (!en) return false;
        const prev = grid.tokens[key];
        const size = prev ? G().size(prev) : (en.kind === 'e' ? G().defaultSize(en.name) : 1);
        if (!canStand(x, y, key, size)) { alert('Сюда нельзя: клетка занята или непроходима' + (size > 1 ? ' (фигура ' + size + '×' + size + ')' : '') + '.'); return false; }
        if (prev) {
            // ограничение скоростью: путь в обход стен и чужих фигур
            const ents = entities();
            const need = G().pathFeet(grid, prev, { x, y }, (xx, yy) => !!occupiedBy(xx, yy, key, grid, ents), null);
            const left = moveLeft(key);
            if (need === null && !confirm('Пути нет (стены/фигуры). Всё равно переставить?')) return false;
            if (need !== null && need > left && !confirm(`«${en.name}» не успевает: нужно ${need} фт, а в этом ходу осталось ${left} фт (скорость ${parseInt(prev.speed) || en.speed}). Всё равно переместить?`)) return false;
            const used = (prev.mv && prev.mv.tick === curTick()) ? (prev.mv.ft || 0) : 0;
            grid.tokens[key] = Object.assign({}, prev, { x, y, mv: { tick: curTick(), ft: used + (need || 0) } });
        } else {
            // существо при призыве — не дальше 15 фт от хозяина (перки «Призыватель» / «Усиление связи» — дальше, лист игрока присылает rangeFt)
            if (en.kind === 's') {
                const owner = G().tokenOf(grid, 'p', en.owner), maxFt = en.pet ? 15 : (en.rangeFt || 15);
                if (owner && G().feet(owner, { x, y }) > maxFt && !confirm(`Существо призывается не дальше ${maxFt} фт от хозяина, а тут ${G().feet(owner, { x, y })} фт. Всё равно поставить?`)) return false;
            }
            grid.tokens[key] = { kind: en.kind, ref: en.ref, owner: en.owner || '', x, y, size };
        }
        return true;
    }
    function moveOrPlace(key, x, y) {
        if (!setToken(key, x, y)) return;
        const fired = entities()[key].kind === 'e' ? runesTriggeredBy(key) : [];
        if (fired.length) explodeRunes(fired); else save();
        refresh();
    }
    function cellFromEvent(ev) {
        const cv = $('gg-canvas'); const r = cv.getBoundingClientRect();
        const x = Math.floor((ev.clientX - r.left) / view.cs), y = Math.floor((ev.clientY - r.top) / view.cs);
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return null;
        return { x, y };
    }
    function paintCell(p) {
        const k = G().key(p.x, p.y);
        if (tool === 'erase') { if (grid.cells[k]) { delete grid.cells[k]; paintDirty = true; } }
        else if (grid.cells[k] !== tool) {
            if (tokenAt(p.x, p.y) && !G().TERRAIN[tool].pass) return;
            grid.cells[k] = tool; paintDirty = true;
        }
        render();
    }
    function onDown(ev) {
        if (!grid) return; const p = cellFromEvent(ev); if (!p) return;
        ev.preventDefault();
        if (G().TERRAIN[tool] || tool === 'erase') { painting = true; paintCell(p); return; }
        if (tool === 'ruler') { rulerFrom = rulerFrom ? null : p; render(); return; }
        if (placing) {
            if (placing.type === 'token') { moveOrPlace(placing.key, p.x, p.y); placing = null; }
            else if (placing.type === 'pending') placePendingRune(placing.id, p);
            else if (placing.type === 'zone') placePendingZone(placing.id, p);
            else placeCustomRune(p);
            refresh(); return;
        }
        if (tool === 'rune') { placeCustomRune(p); return; }
        const k = tokenAt(p.x, p.y) || anyTokenAt(p.x, p.y);
        if (k) { selKey = k; dragFrom = { key: k, x: p.x, y: p.y, ox: p.x - grid.tokens[k].x, oy: p.y - grid.tokens[k].y }; refresh(); return; }
        if (selKey && grid.tokens[selKey]) { moveOrPlace(selKey, p.x, p.y); return; }
        selKey = null; refresh();
    }
    function onMove(ev) {
        if (!grid) return; const p = cellFromEvent(ev);
        hover = p;
        if (painting && p) paintCell(p); else render();
        const tip = $('gg-tip');
        if (tip) {
            const from = rulerFrom || (selKey && grid.tokens[selKey]);
            const kk = p && anyTokenAt(p.x, p.y); const en = kk ? entities()[kk] : null;
            let t = '';
            if (en) t += `<strong>${esc(en.name)}</strong>${en.ownerName ? ' (' + esc(en.ownerName) + ')' : ''}<br>❤ ${en.hp}/${en.maxHp}${en.maxMp ? ' · 🔷 ' + en.mp + '/' + en.maxMp : ''}${en.dmg ? ' · ⚔ ' + en.dmg : ''}${en.dead ? ' · ☠' : ''}`;
            if (p && G().cellType(grid, p.x, p.y)) t += (t ? '<br>' : '') + G().TERRAIN[G().cellType(grid, p.x, p.y)].name;
            if (p) Object.keys(grid.zones).forEach(zid => { const z = grid.zones[zid]; if (zoneDrawCells(z).some(c => c.x === p.x && c.y === p.y)) t += (t ? '<br>' : '') + (z.icon || '✴') + ' ' + esc(z.spell); });
            if (from && p && (from.x !== p.x || from.y !== p.y)) t += (t ? '<br>' : '') + `📏 ${G().feet(from, p)} фт${G().losFigures(grid, from, p) ? '' : ' · ⛔ нет видимости'}`;
            tip.innerHTML = t; tip.style.display = t ? 'block' : 'none';
            if (t) { const wrap = $('gg-wrap').getBoundingClientRect(); tip.style.left = (ev.clientX - wrap.left + 14) + 'px'; tip.style.top = (ev.clientY - wrap.top + 14) + 'px'; }
        }
    }
    function onUp(ev) {
        if (painting) { painting = false; if (paintDirty) { paintDirty = false; save(); } return; }
        if (dragFrom) {
            const p = cellFromEvent(ev);
            const df = dragFrom; dragFrom = null;
            if (p && (p.x !== df.x || p.y !== df.y)) moveOrPlace(df.key, p.x - df.ox, p.y - df.oy);
        }
    }

    // ---------- руны ----------
    function runesTriggeredBy(key) {
        const t = grid.tokens[key]; if (!t) return [];
        return Object.keys(grid.runes).filter(id => G().cells(grid.runes[id], t) <= 1);
    }
    // Урон рун считается по свежему списку врагов в транзакции: раньше список целиком перезаписывался
    // из локальной копии и мог стереть удар игрока, нанесённый в ту же секунду.
    function breakOnDamageStatuses(e) {
        if (Array.isArray(e.statusEffects) && e.statusEffects.some(st => st && st.breakOnDamage)) e.statusEffects = e.statusEffects.filter(st => !(st && st.breakOnDamage)); // Полиморф и т.п. спадают от урона
    }
    function explodeRunes(ids) {
        const b = B(), ents = entities();
        const runes = ids.map(id => ({ id, r: grid.runes[id] })).filter(x => x.r);
        runes.forEach(x => { delete grid.runes[x.id]; });
        const targets = runes.map(x => ({ r: x.r, toks: G().tokensInRadius(grid, x.r, 5) }));
        Object.keys(grid.tokens).forEach(k => { if (!ents[k]) delete grid.tokens[k]; }); // как в save()
        const ref = b.db().collection('sessions').doc(b.code());
        let logs = [];
        b.db().runTransaction(tx => tx.get(ref).then(doc => {
            const dd = doc.data() || {};
            const enemies = (Array.isArray(dd.enemies) ? dd.enemies : []).map(e => Object.assign({}, e));
            logs = []; const playerHits = [];
            targets.forEach(({ r, toks }) => {
                const R = RUNES[r.spell] || {};
                const hit = [];
                toks.forEach(t => {
                    const en = ents[t.key]; if (!en || en.dead) return;
                    if (en.kind === 'e') {
                        const e = enemies.find(x => x.id === en.ref); if (!e || (e.curHp || 0) <= 0) return;
                        if (R.undeadOnly && !isUndead(e)) return;
                        if (R.knock) { e.statusEffects = (e.statusEffects || []).concat([{ id: 'knock' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Подброшен', desc: 'Подброшен гейзером — пропускает ход', turns: 1, noAttack: true }]); hit.push(e.name + ' подброшен'); return; }
                        const pv = window.StCombat ? window.StCombat.previewDamage(e, r.dmg || 0, R.dmgType || '', 0) : { finalDmg: r.dmg || 0 };
                        const was = e.curHp || 0; e.curHp = Math.max(0, was - pv.finalDmg);
                        if (pv.finalDmg > 0) breakOnDamageStatuses(e);
                        if (was > 0 && e.curHp <= 0) e.diedAtTurn = dd.sessionTurnCounter || 0;
                        markHitBy(e, r.uid, pv.finalDmg > 0, was > 0 && e.curHp <= 0);
                        hit.push(e.name + ' −' + pv.finalDmg + (e.curHp <= 0 ? ' ☠' : ''));
                    } else if (!R.undeadOnly) {
                        playerHits.push({ uid: en.kind === 'p' ? en.ref : en.owner, summonId: en.kind === 's' ? en.ref : '', dmg: R.knock ? 0 : (r.dmg || 0), dmgType: R.dmgType || '', knock: !!R.knock, from: r.spell });
                        hit.push(en.name + (R.knock ? ' подброшен' : ' −' + (r.dmg || 0) + ' (до резистов)'));
                    }
                });
                logs.push(`💥 ${r.spell} (${r.ownerName || 'мастер'}) срабатывает: ${hit.length ? hit.join(', ') : 'никого не задело'}.`);
            });
            const patch = Object.assign({ grid: b.strip(grid), enemies: b.strip(enemies) }, hitsPatch(playerHits));
            if (logs.length) patch.combatLog = firebase.firestore.FieldValue.arrayUnion(...logs.map((t, i) => ({ ts: Date.now() + i, author: 'Мастер', text: t })));
            tx.update(ref, patch);
        })).then(() => {
            if (logs.length) setTimeout(() => alert(logs.join('\n')), 30);
        }).catch(e => alert('Руны не сработали: ' + e.message));
    }
    // удары по игрокам/их существам — в очереди игроков (одним arrayUnion на игрока)
    function hitsPatch(hits) {
        const byUid = {}, patch = {};
        hits.forEach(h => { (byUid[h.uid] = byUid[h.uid] || []).push({ id: 'aoe' + Date.now() + Math.random().toString(36).slice(2, 6), cmd: 'aoeHit', dmg: h.dmg, dmgType: h.dmgType, summonId: h.summonId || '', knock: !!h.knock, from: h.from }); });
        Object.keys(byUid).forEach(uid => { patch['participants.' + uid + '.pendingStatusEffects'] = firebase.firestore.FieldValue.arrayUnion(...byUid[uid]); });
        return patch;
    }
    function placePendingRune(id, p) {
        const pend = (data.pendingRunes || []); const r = pend.find(x => x.id === id); if (!r) { placing = null; return; }
        if (!G().passable(grid, p.x, p.y)) { alert('Руну нельзя поставить в стену/воду.'); return; }
        const caster = G().tokenOf(grid, 'p', r.uid);
        if (caster && G().feet(caster, p) > (r.maxFt || 25) && !confirm(`Это ${G().feet(caster, p)} фт от заклинателя, а руну можно нанести не дальше ${r.maxFt || 25} фт. Всё равно поставить?`)) return;
        grid.runes[id] = { spell: r.spell, dmg: r.dmg || 0, ownerName: r.ownerName || '', uid: r.uid || '', x: p.x, y: p.y };
        placing = null;
        const fired = Object.keys(grid.tokens).some(k => { const en = entities()[k]; return en && en.kind === 'e' && !en.dead && G().cells(grid.tokens[k], p) <= 1; }) ? [id] : [];
        const extra = { pendingRunes: pend.filter(x => x.id !== id) };
        if (fired.length) { save(extra).then(() => { data.pendingRunes = extra.pendingRunes; explodeRunes(fired); }); }
        else save(extra);
        refresh();
    }
    function placeCustomRune(p) {
        if (!G().passable(grid, p.x, p.y)) { alert('Руну нельзя поставить в стену/воду.'); return; }
        const spell = ($('gg-rune-type') || {}).value || 'Огненная руна';
        const dmg = Math.max(0, parseInt(($('gg-rune-dmg') || {}).value) || 0);
        const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        grid.runes[id] = { spell, dmg, ownerName: 'мастер', uid: '', x: p.x, y: p.y };
        placing = null; save(); refresh();
    }
    // ---------- зоны: установка ----------
    function zoneFromPending(z) {
        const o = Object.assign({}, z); delete o.place; delete o.id;
        return o;
    }
    function placePendingZone(id, p) {
        const pend = (data.pendingZones || []); const z = pend.find(x => x.id === id); if (!z) { placing = null; return; }
        const caster = G().tokenOf(grid, 'p', z.uid);
        if (z.kind === 'wall') {
            if (!placing.start) { placing.start = p; placing.maxLen = z.maxLen || 6; render(); renderSide(); return; }
            const cellsL = line(placing.start, p, z.maxLen || 6).filter(c => G().passable(grid, c.x, c.y));
            if (!cellsL.length) { alert('Стену некуда поставить.'); placing = null; return; }
            if (caster && cellsL.every(c => G().feet(caster, c) > 60) && !confirm('Стена дальше 60 фт от заклинателя. Всё равно поставить?')) return;
            grid.zones[id] = Object.assign(zoneFromPending(z), { cells: cellsL.map(c => [c.x, c.y]) });
        } else {
            if (caster && G().feet(caster, p) > 60 && !confirm('Это дальше 60 фт от заклинателя. Всё равно поставить?')) return;
            grid.zones[id] = Object.assign(zoneFromPending(z), { x: p.x, y: p.y });
        }
        placing = null;
        save({ pendingZones: pend.filter(x => x.id !== id), combatLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now(), author: 'Мастер', text: `${z.icon || '✴'} «${z.spell}» (${z.ownerName || ''}) установлена на поле.` }) });
        refresh();
    }
    // Ауры/круги вокруг заклинателя ставятся сами, как только он есть на поле; зоны снятых эффектов убираются.
    function autoZones() {
        if (!data || !B() || !B().code()) return;
        let changed = false; const pend = data.pendingZones || []; const rest = [];
        pend.forEach(z => {
            if (z.place === 'gm') { rest.push(z); return; }
            const key = G().tokenKey('p', z.uid); const tok = grid.tokens[key];
            if (!tok) { rest.push(z); return; }
            grid.zones[z.id] = Object.assign(zoneFromPending(z), z.place === 'follow' ? { follow: key } : { x: tok.x, y: tok.y, kind: 'area' });
            changed = true;
        });
        const parts = data.participants || {};
        Object.keys(grid.zones).forEach(zid => {
            const z = grid.zones[zid]; if (!z.uid || !z.effId) return;
            const p = parts[z.uid];
            if (!p) return; // игрок вышел — зону не трогаем (вернётся)
            if (Array.isArray(p.zoneEffs) && p.zoneEffs.indexOf(z.effId) === -1) { delete grid.zones[zid]; changed = true; }
        });
        if (changed) save({ pendingZones: rest });
    }

    // ---------- публичное ----------
    window.GmGrid = {
        onSnapshot(d) {
            data = d || {};
            if (!painting && !dragFrom) grid = norm(data.grid);
            const ws = $('gg-w'), hs = $('gg-h');
            if (ws && document.activeElement !== ws) ws.value = grid.w;
            if (hs && document.activeElement !== hs) hs.value = grid.h;
            if (selKey && !grid.tokens[selKey] && !(entities()[selKey])) selKey = null;
            try { autoZones(); } catch (e) { console.error(e); }
            refresh();
        },
        zoneTick,
        hitsPatch,
        setTool(t) { tool = t; placing = null; rulerFrom = null; if (t === 'rune') placing = { type: 'custom' }; refresh(); },
        pickToPlace(key) { placing = (placing && placing.key === key) ? null : { type: 'token', key }; tool = 'select'; refresh(); },
        pickRune(id) { placing = (placing && placing.id === id) ? null : { type: 'pending', id }; tool = 'select'; refresh(); },
        pickZone(id) { placing = (placing && placing.id === id) ? null : { type: 'zone', id }; tool = 'select'; refresh(); },
        // Выставить фигуру целью в панели «Атака противника» (игрок — uid, существо — summon:uid:id, животное — pet:uid:id).
        targetForEnemy(key) {
            const en = entities()[key]; const sel = $('gm-attack-target-select'); if (!en || !sel) return;
            if (typeof window.populateGmAttackSelects === 'function') window.populateGmAttackSelects();
            const v = en.kind === 'p' ? en.ref : (en.pet ? 'pet:' : 'summon:') + en.owner + ':' + en.ref;
            if (!Array.from(sel.options).some(o => o.value === v)) { alert('«' + en.name + '» нет среди целей атаки (нет ХП?).'); return; }
            sel.value = v;
            try { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
        },
        removeToken(key) { delete grid.tokens[key]; if (selKey === key) selKey = null; save(); refresh(); },
        removeRune(id) { delete grid.runes[id]; save(); refresh(); },
        removeZone(id) { delete grid.zones[id]; save(); refresh(); },
        setSize(key, n) {
            const t = grid.tokens[key]; if (!t) return;
            const old = t.size; t.size = n;
            if (!canStand(t.x, t.y, key, n)) { t.size = old; alert('Фигура ' + n + '×' + n + ' здесь не помещается — сдвинь её.'); return; }
            save(); refresh();
        },
        setSpeed(key, v) { const t = grid.tokens[key]; if (!t) return; t.speed = Math.max(0, Math.min(200, parseInt(v) || 0)); save(); refresh(); },
        resize() {
            const w = Math.max(5, Math.min(100, parseInt($('gg-w').value) || 50)), h = Math.max(5, Math.min(100, parseInt($('gg-h').value) || 50));
            const lost = Object.keys(grid.tokens).filter(k => grid.tokens[k].x + G().size(grid.tokens[k]) > w || grid.tokens[k].y + G().size(grid.tokens[k]) > h);
            if (lost.length && !confirm(`${lost.length} фигур(ы) окажутся за краем и уйдут с поля. Продолжить?`)) return;
            lost.forEach(k => delete grid.tokens[k]);
            Object.keys(grid.cells).forEach(k => { const [x, y] = k.split('_').map(Number); if (x >= w || y >= h) delete grid.cells[k]; });
            Object.keys(grid.runes).forEach(k => { const r = grid.runes[k]; if (r.x >= w || r.y >= h) delete grid.runes[k]; });
            grid.w = w; grid.h = h; save(); refresh();
        },
        zoom(d) { view.cs = Math.max(12, Math.min(48, view.cs + d)); try { localStorage.setItem(LS, JSON.stringify(view)); } catch (e) { } render(); },
        toggleLabels() { view.labels = !view.labels; try { localStorage.setItem(LS, JSON.stringify(view)); } catch (e) { } render(); },
        clearTerrain() { if (!confirm('Убрать всё окружение (стены, деревья, воду…)?')) return; grid.cells = {}; save(); refresh(); },
        clearAll() { if (!confirm('Очистить поле целиком: фигуры, окружение, руны и зоны?')) return; grid.cells = {}; grid.tokens = {}; grid.runes = {}; grid.zones = {}; selKey = null; save(); refresh(); },
        fullscreen() { const p = $('gg-panel'); if (p) p.classList.toggle('gg-full'); render(); },
        autoPlace() {
            const ents = entities();
            const free = (xs, kinds) => {
                Object.values(ents).filter(en => !en.dead && kinds.includes(en.kind) && !grid.tokens[en.key]).forEach(en => {
                    const size = en.kind === 'e' ? G().defaultSize(en.name) : 1;
                    for (const x0 of xs) for (let dy = 0; dy < grid.h; dy++) {
                        const x = Math.min(Math.max(0, x0), grid.w - size);
                        const y = Math.floor(grid.h / 2) + (dy % 2 ? -Math.ceil(dy / 2) : Math.ceil(dy / 2));
                        if (y >= 0 && y + size <= grid.h && canStand(x, y, en.key, size)) { grid.tokens[en.key] = { kind: en.kind, ref: en.ref, owner: en.owner || '', x, y, size }; return; }
                    }
                });
            };
            const L = [2, 3, 4, 5, 1, 6], R = [grid.w - 3, grid.w - 5, grid.w - 7, grid.w - 9, grid.w - 2, grid.w - 11];
            free(L, ['p', 's']); free(R, ['e']);
            save(); refresh();
        },
        // для тестов/скриптов
        _state: () => ({ grid, tool, selKey, placing }),
        _place: (key, x, y) => moveOrPlace(key, x, y),
        _paint: (x, y, t) => { const old = tool; tool = t; paintCell({ x, y }); tool = old; return save(); },
        _placeRune: (id, x, y) => placePendingRune(id, { x, y }),
        _placeZone: (id, x, y, x2, y2) => { placing = { type: 'zone', id }; placePendingZone(id, { x, y }); if (x2 !== undefined && placing) placePendingZone(id, { x: x2, y: y2 }); },
        _customRune: (x, y) => placeCustomRune({ x, y }),
        _moveLeft: key => moveLeft(key)
    };

    function init() {
        const cv = $('gg-canvas'); if (!cv) return;
        cv.addEventListener('pointerdown', onDown);
        cv.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        cv.addEventListener('pointerleave', () => { hover = null; const tip = $('gg-tip'); if (tip) tip.style.display = 'none'; render(); });
        const rt = $('gg-rune-type');
        if (rt && !rt.options.length) rt.innerHTML = Object.keys(RUNES).map(n => `<option>${esc(n)}</option>`).join('');
        grid = norm(null); refresh();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
