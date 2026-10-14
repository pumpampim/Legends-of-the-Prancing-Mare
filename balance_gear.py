"""
Расширение разрыва характеристик обычной (НЕ уникальной) брони и оружия.
Для каждой группы (слот брони / тип оружия) самое слабое значение остаётся, а отрыв
от него остальных растёт в GAP раз:  новое = мин + (старое - мин) * GAP.
Применяется к урону, броне и весу. Боеприпасы (стрелы/болты) и уникальное не трогаем.
Запуск:  python3 balance_gear.py <папка сайта> [GAP]
"""
import re, sys, math, csv, os
SITE = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/site2'
GAP = float(sys.argv[2]) if len(sys.argv) > 2 else 1.3
SLOT_RU = {'Шлема': 'helmet', 'Доспехи': 'chest', 'Наручи и перчатки': 'gloves', 'Сапоги и ботинки': 'boots', 'Щиты': 'shield'}
def rnd(x): return int(math.floor(x + 0.5))

def read(f): return open(os.path.join(SITE, f), encoding='utf-8').read().split('\n')
sm = read('smithing-data.js')

# ---- какие секции затрагиваем ----
sections = {}  # имя секции -> (старт, конец) в строках
cur = None
for i, l in enumerate(sm):
    m = re.match(r'^const (\w+) = [\[{]', l)
    if m:
        if cur: sections[cur][1] = i
        cur = m.group(1); sections[cur] = [i, len(sm)]
if cur: sections[cur][1] = len(sm)
TARGET = ['armorRecipes', 'weaponRecipes', 'armorNonCraftable', 'weaponsNonCraftable']

entry_re = re.compile(r'^\s*(?:\{\s*)?name:\s*"([^"]+)"')
def weapon_group(cat, sub):
    sub = sub or ''
    if sub.startswith('Лук'): return 'bow'
    if sub.startswith('Кастет'): return 'knuckles'
    return (cat or '') + '/' + sub

# ---- проход 1: собрать записи ----
entries = []  # dict(section, name, line_idx(es), kind, group, val, weight, ...)
for sec in TARGET:
    a, b = sections[sec]
    kind = 'armor' if sec.startswith('armor') else 'weapon'
    cur = None
    for i in range(a, b):
        l = sm[i]
        m = entry_re.match(l)
        if m and ('category:' in l or 'armorType:' in l):
            cur = {'section': sec, 'kind': kind, 'name': m.group(1), 'lines': []}
            entries.append(cur)
        if cur is None: continue
        cur['lines'].append(i)
        t = '\n'.join(sm[j] for j in cur['lines'])
        if 'category:' in l or 'armorType:' in l:
            cat = re.search(r'category:\s*"([^"]*)"', l); sub = re.search(r'subcat:\s*"([^"]*)"', l); sl = re.search(r'slot:\s*["\']([^"\']*)["\']', l); at = re.search(r'armorType:\s*"([^"]*)"', l)
            cur['cat'] = cat.group(1) if cat else None; cur['sub'] = sub.group(1) if sub else None
            cur['slot'] = sl.group(1) if sl else None; cur['atype'] = at.group(1) if at else None
        if 'slot' not in cur or cur['slot'] is None:
            sl = re.search(r'slot:\s*["\']([^"\']*)["\']', l)
            if sl: cur['slot'] = sl.group(1)
        sub2 = re.search(r'subcat:\s*"([^"]*)"', l)
        if sub2 and not cur.get('sub'): cur['sub'] = sub2.group(1)
        am = re.search(r'isAmmo:\s*(true|false)', l)
        if am: cur['ammo'] = (am.group(1) == 'true')

def val_re(kind): return re.compile(r'\b(resistance|damage):\s*(-?\d+(?:\.\d+)?)') 
for e in entries:
    for i in e['lines']:
        m = re.search(r'\b(resistance|damage):\s*(-?\d+(?:\.\d+)?)', sm[i])
        if m and 'val' not in e: e['val'] = float(m.group(2)); e['val_line'] = i; e['val_key'] = m.group(1)
        w = re.search(r'\bweight:\s*(-?\d+(?:\.\d+)?)', sm[i])
        if w and 'w' not in e: e['w'] = float(w.group(1)); e['w_line'] = i; e['w_txt'] = w.group(1)
    if e['kind'] == 'armor':
        e['group'] = 'armor/' + (SLOT_RU.get(e['slot']) or e['slot'])
    else:
        e['group'] = 'weapon/' + weapon_group(e.get('cat'), e.get('sub'))
    e['skip'] = bool(e.get('ammo')) or ('val' not in e)

groups = {}
for e in entries:
    if e['skip']: continue
    groups.setdefault(e['group'], []).append(e)
mins = {g: {'val': min(x['val'] for x in l), 'w': min(x['w'] for x in l)} for g, l in groups.items()}
def f(v, lo): return rnd(lo + (v - lo) * GAP)
def fw(v, lo, txt):
    nv = rnd(lo + (v - lo) * GAP)
    return (f'{nv}.0' if '.' in txt else str(nv)), nv

report = []
for e in entries:
    if e['skip']: continue
    lo = mins[e['group']]
    nv = f(e['val'], lo['val'])
    nw_txt, nw = fw(e['w'], lo['w'], e['w_txt'])
    e['new_val'] = nv; e['new_w'] = nw
    report.append((e['group'], e['name'], e['val_key'], e['val'], nv, e['w'], nw))
    # правка текста
    ln = sm[e['val_line']]
    sm[e['val_line']] = re.sub(r'\b(resistance|damage):\s*-?\d+(?:\.\d+)?', lambda m: f"{m.group(1)}: {nv}", ln, count=1)
    ln = sm[e['w_line']]
    sm[e['w_line']] = re.sub(r'\bweight:\s*-?\d+(?:\.\d+)?', f'weight: {nw_txt}', ln, count=1)
open(os.path.join(SITE, 'smithing-data.js'), 'w', encoding='utf-8').write('\n'.join(sm))

# ---- items-data.js: зачарованные «лутовые» копии обычных вещей: пересчёт по группе базовой вещи ----
base = {e['name']: e for e in entries if not e['skip']}
it = read('items-data.js')
loot_re = re.compile(r'name:\s*"([^"\[]+?)\s*\[[^"]*\]"')
changed_loot = 0
for i, l in enumerate(it):
    if not re.search(r'category:\s*"[^"]*\(лут\)"', l): continue
    m = loot_re.search(l)
    if not m: continue
    b = base.get(m.group(1).strip())
    if not b: continue
    lo = mins[b['group']]
    key = 'dmg' if b['kind'] == 'weapon' else 'armor'
    mm = re.search(rf'\b{key}:\s*(-?\d+(?:\.\d+)?)', l)
    wm = re.search(r'\bweight:\s*(-?\d+(?:\.\d+)?)', l)
    if not mm or not wm: continue
    nv = f(float(mm.group(1)), lo['val']); _, nw = fw(float(wm.group(1)), lo['w'], wm.group(1))
    l2 = re.sub(rf'\b{key}:\s*-?\d+(?:\.\d+)?', f'{key}: {nv}', l, count=1)
    l2 = re.sub(r'\bweight:\s*-?\d+(?:\.\d+)?', f'weight: {nw}', l2, count=1)
    if l2 != l: it[i] = l2; changed_loot += 1
open(os.path.join(SITE, 'items-data.js'), 'w', encoding='utf-8').write('\n'.join(it))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'balance_report.csv')
with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
    w = csv.writer(fh, delimiter=';')
    w.writerow(['Группа', 'Предмет', 'Параметр', 'Было', 'Стало', 'Вес было', 'Вес стало'])
    for r in sorted(report): w.writerow(r)
print('изменено записей:', len(report), '· лутовых копий:', changed_loot, '· групп:', len(groups))
for g, m in sorted(mins.items()): print(f'  {g:38s} мин {m["val"]:>4} вес {m["w"]}  ({len(groups[g])} шт)')
