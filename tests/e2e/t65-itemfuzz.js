const S = require('./setup');
(async () => {
  const { gm, players, H, wait } = await S.setupSession({});
  const [p1] = players;
  const r = await p1.evaluate(() => {
    const out = [];
    const keyIds = ['armor-total','main-panel-dmg','max-hp','max-mp','cur-hp','char-speed','carry-weight','total-weight'];
    const all = window.allItems;
    const snap0 = JSON.stringify(equippedSlots);
    for (const proto of all) {
      try {
        playerInventory.length = 0;
        Object.keys(equippedSlots).forEach(k => equippedSlots[k] = null);
        const extra = {};
        // как gmItemExtraFromSource / выдача мастером: сырой прототип
        Object.keys(proto).forEach(k => { if (!['name','weight','category','effect'].includes(k)) extra[k] = JSON.parse(JSON.stringify(proto[k])); });
        addToInventory(proto.name, proto.name, 1, proto.weight || 0, proto.category || '', proto.effect || '', extra);
        const it = playerInventory.find(i => i.name === proto.name);
        if (!it) { out.push(['NOADD', proto.name]); continue; }
        let eq = null;
        if (it.slot) { try { eq = applyItemToSlot(it); } catch (e) { out.push(['EQUIPTHROW', proto.name, e.message]); } }
        try { updateAll(); } catch (e) { out.push(['UPDTHROW', proto.name, e.message]); continue; }
        const bad = [];
        document.querySelectorAll('input,span,div.stat-val').forEach(el => {
          const v = el.tagName === 'INPUT' ? el.value : (el.children.length ? '' : el.textContent);
          if (/NaN|undefined/.test(v || '')) bad.push((el.id || el.className || el.tagName) + '=' + String(v).slice(0, 40));
        });
        if (bad.length) out.push(['BAD', proto.name, proto.category, bad.slice(0, 4).join(' ; ')]);
        try { const inp = collectPlayerAttackInput(); const s = JSON.stringify(inp); if (/NaN|null,"dmg"/.test(s) && /NaN/.test(s)) out.push(['ATKNAN', proto.name, s.slice(0, 200)]); } catch (e) { out.push(['ATKTHROW', proto.name, e.message]); }
      } catch (e) { out.push(['THROW', proto.name, e.message]); }
    }
    return out;
  });
  r.forEach(x => console.log(JSON.stringify(x)));
  console.log('issues', H.issues.length); H.issues.slice(0, 20).forEach(x => console.log('!!', x.text.slice(0, 200)));
  await H.close();
})();
