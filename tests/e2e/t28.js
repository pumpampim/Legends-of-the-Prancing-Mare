const { setupSession, sheet, wait } = require('./setup');
(async () => {
  const { gm, players, code, H } = await setupSession();
  const pl = players[0];
  const items = [['Броня Гильдии Воров','chest'],['Броня соловья','chest'],['Чернильное Око Провидца','circlet'],['Шлем Брурида','helmet'],['Маска Азидала','helmet'],['Перчатки Гильдии Воров','gloves'],['Перчатки соловья','gloves'],['Наручи Пенитус Окулатус','gloves'],['Одеяние упокоения','chest'],['Азидалов шлем проницательности','helmet']];
  const out = [];
  for (const [n, slot] of items) {
    const r = await pl.evaluate(([n, slot]) => {
      const snap = () => ({ maxW: document.getElementById('weight-max-display').innerText, res: document.getElementById('resistances-display').innerText, int: document.getElementById('stat-int').value, mp: document.getElementById('max-mp').value,
        destr: (typeof getEffectiveSkillValue === 'function') ? getEffectiveSkillValue('Разрушение') : null, gear: JSON.stringify(parseGearEffects ? (function(){try{return getGearBonusesSummary ? getGearBonusesSummary() : null}catch(e){return null}})() : null) });
      // unequip all
      ['chest','helmet','gloves','circlet'].forEach(s => { try { if (equippedSlots[s]) unequipSlot(s); } catch (e) {} });
      updateAll();
      const before = snap();
      const db = window.allItems.find(i => i.name === n);
      addToInventory(db.name, db.name, 1, db.weight || 0, db.category, db.effect, { slot: db.slot, armorValue: db.armor, price: db.price });
      const it = playerInventory.find(i => i.name === n);
      const res = applyItemToSlot(it, slot);
      updateAll();
      const after = snap();
      const pg = (typeof parseGearEffects === 'function') ? parseGearEffects(db.effect) : 'nofn';
      return { n, res, before, after, pg };
    }, [n, slot]);
    out.push(r);
  }
  for (const r of out) console.log(r.n, '| equip:', r.res, '\n  before', JSON.stringify(r.before), '\n  after ', JSON.stringify(r.after), '\n  parse', JSON.stringify(r.pg));
  console.log('ISSUES', JSON.stringify(H.issues.slice(0, 5)));
  await H.close();
})();
