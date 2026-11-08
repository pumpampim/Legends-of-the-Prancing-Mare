
    // ========================================================================
    // ПОМЕСТЬЯ (estate.js): участки отряда в sessions/{code}.estates. Мастер создаёт, рисует местность, убирает жителей.
    // Жители заходят и ходят сами (вкладка «Поместье» у игрока).
    // ========================================================================
    let _gmEstateSel = '', _gmEstatePaint = null, _gmEstateBound = false;
    const gmEstates = () => { const m = (lastData && lastData.estates) || {}; return Object.keys(m).map(k => m[k]).filter(Boolean).sort((a, b) => (a.created || 0) - (b.created || 0)); };
    const gmEstateCur = () => { const l = gmEstates(); return l.find(e => e.id === _gmEstateSel) || null; };
    function gmEstateWrite(patch) {
        if (!currentCode) return Promise.reject(new Error('Нет сессии.'));
        return db.collection('sessions').doc(currentCode).update(patch).catch(e => alert('Ошибка: ' + e.message));
    }
    function gmEstateNames() { const out = {}, p = (lastData && lastData.participants) || {}; Object.keys(p).forEach(u => { out[u] = p[u].name || p[u].charName || ''; }); return out; }
    function renderEstates() {
        const box = el('gm-estate-list'); if (!box || !window.Estate) return;
        const list = gmEstates();
        if (list.length && !list.some(e => e.id === _gmEstateSel)) _gmEstateSel = list[0].id;
        box.innerHTML = list.length ? list.map(e => `<button style="width:auto; margin:2px;${e.id === _gmEstateSel ? ' outline:2px solid var(--accent-color);' : ''}" onclick="gmEstatePick('${escapeHtml(e.id)}')">🏡 ${escapeHtml(e.name)} <span style="opacity:.6;">(${Object.keys(e.tokens || {}).length} жит.)</span></button>`).join('') : '<span style="opacity:.6;">Участков пока нет.</span>';
        const ed = el('gm-estate-edit'), est = gmEstateCur();
        if (ed) ed.style.display = est ? 'block' : 'none';
        const br = el('gm-estate-brush');
        if (br && !br.options.length) { const T = window.Estate.terrain(); br.innerHTML = window.Estate.PAINT.map(k => `<option value="${k}">${escapeHtml((T[k] || {}).name || k)}</option>`).join(''); }
        if (est) {
            const cv = el('gm-estate-canvas');
            if (cv && !_gmEstateBound) {
                _gmEstateBound = true;
                const cellOf = ev => { const e2 = gmEstateCur(); return e2 ? window.Estate.cellFromEvent(cv, e2, ev) : null; };
                const paint = ev => { if (!_gmEstatePaint) return; const c = cellOf(ev); if (c) { _gmEstatePaint[c.x + '_' + c.y] = el('gm-estate-brush').value; const e2 = gmEstateCur(); if (e2) { e2.cells = Object.assign({}, e2.cells, _gmEstatePaint); window.Estate.draw(cv, e2, { cs: 14, names: gmEstateNames() }); } } };
                const end = () => {
                    if (!_gmEstatePaint) return; const cells = _gmEstatePaint; _gmEstatePaint = null;
                    const patch = {}; Object.keys(cells).forEach(k => { patch['estates.' + _gmEstateSel + '.cells.' + k] = cells[k] === 'grass' ? firebase.firestore.FieldValue.delete() : cells[k]; });
                    if (Object.keys(patch).length) gmEstateWrite(patch);
                };
                cv.addEventListener('mousedown', ev => { _gmEstatePaint = {}; paint(ev); });
                cv.addEventListener('mousemove', paint);
                window.addEventListener('mouseup', end);
                cv.addEventListener('touchstart', ev => { ev.preventDefault(); _gmEstatePaint = {}; paint(ev); }, { passive: false });
                cv.addEventListener('touchmove', ev => { ev.preventDefault(); paint(ev); }, { passive: false });
                cv.addEventListener('touchend', end);
            }
            if (!_gmEstatePaint) window.Estate.draw(cv, est, { cs: 14, names: gmEstateNames() });
        }
    }
    window.renderEstates = renderEstates;
    window.gmEstateCreate = function () {
        if (!currentCode) { alert('Сначала открой сессию.'); return; }
        const name = (el('gm-estate-name').value || '').trim() || 'Поместье';
        const e = window.Estate.make(name, null, 50, 50);
        _gmEstateSel = e.id; el('gm-estate-name').value = '';
        gmEstateWrite({ ['estates.' + e.id]: e });
    };
    window.gmEstatePick = function (id) { _gmEstateSel = id; renderEstates(); };
    window.gmEstateDelete = function () {
        const e = gmEstateCur(); if (!e || !confirm('Удалить участок «' + e.name + '» со всей постройкой?')) return;
        gmEstateWrite({ ['estates.' + e.id]: firebase.firestore.FieldValue.delete() });
    };
    window.gmEstateClearTokens = function () { const e = gmEstateCur(); if (e) gmEstateWrite({ ['estates.' + e.id + '.tokens']: {} }); };
    window.gmEstateFillAll = function () {
        const e = gmEstateCur(); if (!e || !confirm('Залить весь участок выбранной кистью?')) return;
        const t = el('gm-estate-brush').value, cells = {};
        if (t !== 'grass') for (let x = 0; x < e.w; x++) for (let y = 0; y < e.h; y++) cells[x + '_' + y] = t;
        gmEstateWrite({ ['estates.' + e.id + '.cells']: cells });
    };
