// Боевая сетка: общее ядро для мастера (gm-grid.js) и игроков (index.html).
// Данные лежат в документе сессии: session.grid = { w, h, cells: {"x_y": тип}, tokens: {ключ: {kind, ref, owner, x, y}}, runes: {id: {...}} }.
// Клетка = 5 футов, диагональ = 5 футов (расстояние Чебышёва).
(function () {
    const FT = 5;
    // Окружение: pass — можно ли стоять/пройти; sight — видно ли сквозь (для атак и заклинаний).
    const TERRAIN = {
        wall: { name: 'Стена', icon: '🧱', color: '#5b5048', pass: false, sight: false },
        rock: { name: 'Камень', icon: '🪨', color: '#6e6a62', pass: false, sight: false },
        tree: { name: 'Дерево', icon: '🌲', color: '#2f5a32', pass: false, sight: false },
        water: { name: 'Вода', icon: '💧', color: '#2c5f86', pass: false, sight: true },
        bush: { name: 'Кусты', icon: '🌿', color: '#4d7a3a', pass: true, sight: true }
    };
    const RANGED_BASE_CELLS = 12; // 60 футов без штрафа для луков и заклинаний
    const key = (x, y) => x + '_' + y;
    function cellType(grid, x, y) { return (grid && grid.cells && grid.cells[key(x, y)]) || ''; }
    function passable(grid, x, y) {
        if (!grid || x < 0 || y < 0 || x >= (grid.w || 50) || y >= (grid.h || 50)) return false;
        const t = TERRAIN[cellType(grid, x, y)]; return !t || t.pass;
    }
    function seeThrough(grid, x, y) { const t = TERRAIN[cellType(grid, x, y)]; return !t || t.sight; }
    // Фигура может занимать квадрат size×size (крупные враги 2–4 клетки); x,y — левый верхний угол.
    const sz = t => Math.max(1, Math.min(4, parseInt(t && t.size) || 1));
    function footprint(t) { const out = [], n = sz(t); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ x: t.x + i, y: t.y + j }); return out; }
    // Расстояние в клетках между ближайшими краями фигур (для одиночных клеток — обычное Чебышёва).
    function cells(a, b) {
        const as = sz(a), bs = sz(b);
        const dx = Math.max(0, a.x - (b.x + bs - 1), b.x - (a.x + as - 1));
        const dy = Math.max(0, a.y - (b.y + bs - 1), b.y - (a.y + as - 1));
        return Math.max(dx, dy);
    }
    function feet(a, b) { return cells(a, b) * FT; }
    function lineOfSight(grid, a, b) {
        let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (!(x0 === x1 && y0 === y1)) {
            const e2 = 2 * err, px = x0, py = y0;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
            // Диагональный шаг между двумя стенами (угол): обе соседние клетки непрозрачны — линия не проходит.
            // Раньше Брезенхэм «просачивался» сквозь угол, и через щель в стенах стреляли и колдовали.
            if (px !== x0 && py !== y0 && !seeThrough(grid, x0, py) && !seeThrough(grid, px, y0)) return false;
            if (x0 === x1 && y0 === y1) break;
            if (!seeThrough(grid, x0, y0)) return false;
        }
        return true;
    }
    function losFigures(grid, a, b) {
        if (sz(a) === 1 && sz(b) === 1) return lineOfSight(grid, a, b);
        const fa = footprint(a), fb = footprint(b);
        for (const p of fa) for (const q of fb) if (lineOfSight(grid, p, q)) return true;
        return false;
    }
    // Кратчайший путь (футы) с учётом стен и чужих фигур; диагональ = 5 фт. blocked(x,y) — занято другими.
    function pathFeet(grid, from, to, blocked, limitFt) {
        const n = sz(from), W = grid.w || 50, H = grid.h || 50, maxSteps = Math.floor((limitFt == null ? 10000 : limitFt) / FT) + 1;
        const ok = (x, y) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (!passable(grid, x + i, y + j) || (blocked && blocked(x + i, y + j))) return false; } return true; };
        if (!ok(to.x, to.y)) return null;
        const seen = new Map(); const q = [[from.x, from.y, 0]]; seen.set(from.x + '_' + from.y, 0);
        while (q.length) {
            const [x, y, d] = q.shift();
            if (x === to.x && y === to.y) return d * FT;
            if (d >= maxSteps) continue;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy, k = nx + '_' + ny;
                if (nx < 0 || ny < 0 || nx + n > W || ny + n > H || seen.has(k) || !ok(nx, ny)) continue;
                if (dx && dy && !ok(nx, y) && !ok(x, ny)) continue; // наискосок между двумя препятствиями не протиснуться
                seen.set(k, d + 1); q.push([nx, ny, d + 1]);
            }
        }
        return null;
    }
    // Все клетки, куда фигура дойдёт за limitFt (для подсветки у мастера).
    function reachable(grid, from, blocked, limitFt) {
        const n = sz(from), W = grid.w || 50, H = grid.h || 50, maxSteps = Math.floor(limitFt / FT);
        const ok = (x, y) => { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (!passable(grid, x + i, y + j) || (blocked && blocked(x + i, y + j))) return false; } return true; };
        const seen = new Set([from.x + '_' + from.y]); const q = [[from.x, from.y, 0]];
        while (q.length) {
            const [x, y, d] = q.shift();
            if (d >= maxSteps) continue;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                const nx = x + dx, ny = y + dy, k = nx + '_' + ny;
                if ((!dx && !dy) || nx < 0 || ny < 0 || nx + n > W || ny + n > H || seen.has(k) || !ok(nx, ny)) continue;
                if (dx && dy && !ok(nx, y) && !ok(x, ny)) continue; // угол между двумя стенами — не пройти
                seen.add(k); q.push([nx, ny, d + 1]);
            }
        }
        return seen;
    }
    // Крупные существа по имени: сторона квадрата в клетках.
    function defaultSize(name) {
        const n = String(name || '').toLowerCase();
        if (/жрец-дракон|жрец дракон/.test(n)) return 1; // жрец-дракон — человеческого роста, не дракон
        if (/дракон|мамонт/.test(n)) return 4;
        if (/великан|центурион|гигант/.test(n)) return 3;
        if (/тролль|медвед|саблезуб|корус|грозов\S* атронах|ледян\S* атронах|сприг+ан.*матрон|хоркер|морозн\S* паук|ворожея-ворон/.test(n)) return 2;
        return 1;
    }
    function safe(s) { return String(s || '').replace(/[^A-Za-z0-9-]/g, '_'); }
    function tokenKey(kind, ref, owner) { return kind === 's' ? 's_' + safe(owner) + '_' + safe(ref) : kind + '_' + safe(ref); }
    function tokenOf(grid, kind, ref, owner) {
        if (!grid || !grid.tokens) return null;
        const t = grid.tokens[tokenKey(kind, ref, owner)];
        return t && typeof t.x === 'number' ? t : null;
    }
    // Проверка атаки. mode: 'melee' | 'ranged' | 'spell'. reachFt — досягаемость ближнего боя (5 или 10).
    // Если кого-то нет на сетке — ограничений нет (сетку используют не всегда).
    // opts.ammo: 'arrow' | 'bolt' (Sistema: стрелы — −1 за клетку дальше 30 фт, дальше 80 фт (90 с «Орлиным взором») не долетают;
    // болты — −1 за клетку дальше 80 фт). Без ammo — общее правило (заклинания, существа, враги у мастера).
    function attackCheck(grid, from, to, mode, reachFt, opts) {
        if (!from || !to) return { onGrid: false, ok: true, penalty: 0, feet: null, label: '' };
        const c = cells(from, to), f = c * FT;
        if (!losFigures(grid, from, to)) return { onGrid: true, ok: false, penalty: 0, feet: f, reason: 'цель за препятствием — нет прямой видимости', label: f + ' фт · за препятствием' };
        if (mode === 'melee') {
            const r = reachFt || 5;
            if (f > r) return { onGrid: true, ok: false, penalty: 0, feet: f, reason: 'слишком далеко для ближнего боя (' + f + ' фт, оружие достаёт на ' + r + ' фт)', label: f + ' фт · не достать' };
            return { onGrid: true, ok: true, penalty: 0, feet: f, label: f + ' фт · ✓' };
        }
        const ammo = opts && opts.ammo;
        if (mode === 'ranged' && ammo === 'arrow') {
            const maxFt = (opts && opts.maxFt) || 80;
            if (f > maxFt) return { onGrid: true, ok: false, penalty: 0, feet: f, reason: 'стрела не долетит дальше ' + maxFt + ' фт (' + f + ' фт)', label: f + ' фт · не долетит' };
            const pA = f > 30 ? -(c - 30 / FT) : 0;
            return { onGrid: true, ok: true, penalty: pA, feet: f, label: f + ' фт' + (pA ? ' · ' + pA + ' к попаданию' : ' · ✓') };
        }
        if (mode === 'ranged' && ammo === 'bolt') {
            const pB = f > 80 ? -(c - 80 / FT) : 0;
            return { onGrid: true, ok: true, penalty: pB, feet: f, label: f + ' фт' + (pB ? ' · ' + pB + ' к попаданию' : ' · ✓') };
        }
        // opts.extraFt — прибавка к дальности без штрафа (вещи «дальность колдовства +N футов»).
        const over = c - RANGED_BASE_CELLS - Math.floor(((opts && opts.extraFt) || 0) / FT);
        const penalty = over > 0 ? -Math.ceil(over / 2) : 0; // за каждые 2 клетки дальше 60 футов −1
        return { onGrid: true, ok: true, penalty, feet: f, label: f + ' фт' + (penalty ? ' · ' + penalty + ' к попаданию' : ' · ✓') };
    }
    function tokensInRadius(grid, center, radiusFt) {
        const out = [];
        if (!grid || !grid.tokens || !center) return out;
        const rc = Math.floor((radiusFt || 0) / FT);
        Object.keys(grid.tokens).forEach(k => {
            const t = grid.tokens[k];
            if (t && typeof t.x === 'number' && cells(center, t) <= rc && losFigures(grid, center, t)) out.push(Object.assign({ key: k }, t));
        });
        return out;
    }
    // Радиус площадного заклинания из описания и где центр: 'self' (вокруг заклинателя) или 'target'.
    function spellArea(desc, name) {
        const d = String(desc || '');
        const m = d.match(/радиус\S*\s*(\d+)/i);
        if (!m) return null;
        const self = !/эпицентр/i.test(d) && (/нова/i.test(String(name || '')) || /вокруг\s+(?:заклинателя|мага|себя)|от\s+заклинателя|там\s+где\s+стоит/i.test(d));
        return { radiusFt: parseInt(m[1]) || 5, center: self ? 'self' : 'target' };
    }
    window.GridCore = { FT, TERRAIN, RANGED_BASE_CELLS, key, cellType, passable, seeThrough, cells, feet, lineOfSight, losFigures, footprint, size: sz, pathFeet, reachable, defaultSize, tokenKey, tokenOf, attackCheck, tokensInRadius, spellArea, safe };
})();
