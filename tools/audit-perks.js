// ============================================================================
// tools/audit-perks.js — проверка деревьев перков и билдов. Запуск из корня: node tools/audit-perks.js
// Ловит то, что раньше молча ломало ветки: имя навыка в req.skill не совпадает с skillNames («Тяжёлая броня»,
// «взлом», «Востановление»), перк требует сам себя, требует несуществующий перк, недостижимые перки,
// и опечатки в именах перков в builds-data.js. Код выхода 1, если найдены ошибки (не «вопросы»).
// ============================================================================
const fs=require('fs'), path=require('path'); const ROOT=path.resolve(__dirname,'..');
const s=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
function grabObj(start){ let i=s.indexOf('{',start), d=0, j=i; for(;j<s.length;j++){ if(s[j]==='{')d++; else if(s[j]==='}'){d--; if(!d)break;} } return s.slice(i,j+1); }
function grabArr(start){ let i=s.indexOf('[',start), d=0, j=i; for(;j<s.length;j++){ if(s[j]==='[')d++; else if(s[j]===']'){d--; if(!d)break;} } return s.slice(i,j+1); }
const M=eval('('+grabObj(s.indexOf('const fullPerksManifest ='))+')');
const SK=eval(grabArr(s.indexOf('const skillNames = [')));
const out=[]; const names=new Map();
Object.entries(M).forEach(([tree,list])=>list.forEach(p=>{ (names.get(p.name)||names.set(p.name,[]).get(p.name)).push(tree); }));
if(Object.keys(M).some(t=>!SK.includes(t))) out.push('Деревья без навыка в skillNames: '+Object.keys(M).filter(t=>!SK.includes(t)).join(', '));
Object.entries(M).forEach(([tree,list])=>list.forEach(p=>{
  const r=p.req; if(!r) return;
  if(r.skill && !SK.includes(r.skill)) out.push(`[навык] ${tree} / «${p.name}»: req.skill «${r.skill}» нет в skillNames`);
  else if(r.skill && r.skill!==tree) out.push(`[чужой навык] ${tree} / «${p.name}»: req.skill «${r.skill}»`);
  if(r.thresholds && r.thresholds.length!==p.steps) out.push(`[ступени] ${tree} / «${p.name}»: steps ${p.steps}, порогов ${r.thresholds.length}`);
  (r.prereq||[]).forEach(g=>g.forEach(n=>{
    if(n===p.name) out.push(`[сам на себя] ${tree} / «${p.name}»`);
    else if(!names.has(n)) out.push(`[нет перка] ${tree} / «${p.name}»: prereq «${n}»`);
    else if(!names.get(n).includes(tree)) out.push(`[из другого дерева] ${tree} / «${p.name}»: prereq «${n}» (${names.get(n).join(', ')})`);
  }));
}));
[...names].filter(([n,t])=>t.length>1).forEach(([n,t])=>out.push(`[одно имя в разных деревьях] «${n}»: ${t.join(', ')}`));
// reachability: perk reachable if all prereq groups have reachable member
Object.entries(M).forEach(([tree,list])=>{ const ok=new Set(); let ch=true; while(ch){ch=false; list.forEach(p=>{ if(ok.has(p.name))return; const r=p.req; const g=(r&&r.prereq)||[]; if(g.every(gr=>gr.some(n=>ok.has(n)|| (!list.some(x=>x.name===n) && names.has(n))))){ok.add(p.name);ch=true;} });}
  list.forEach(p=>{ if(!ok.has(p.name)) out.push(`[недостижим] ${tree} / «${p.name}»`); }); });
// билды: каждый перк существует в указанном дереве, steps не больше ступеней перка
const W={}; new Function('window', fs.readFileSync(path.join(ROOT,'builds-data.js'),'utf8'))(W);
(W.buildsData||[]).forEach(b=>b.perks.forEach(e=>{
  const p=(M[e.tree]||[]).find(x=>x.name===e.perk);
  if(!M[e.tree]) out.push(`[билд] «${b.name}»: нет дерева «${e.tree}»`);
  else if(!p) out.push(`[билд] «${b.name}»: в дереве «${e.tree}» нет перка «${e.perk}»`);
  else if(e.steps && e.steps>p.steps) out.push(`[билд] «${b.name}»: «${e.perk}» steps ${e.steps} > ${p.steps}`);
}));
// «вопросы» — не ошибки: так могло быть задумано автором (перк в двух деревьях, требование из другого дерева)
const QUESTION=/^\[(одно имя в разных деревьях|чужой навык|из другого дерева)\]/;
const errs=out.filter(l=>!QUESTION.test(l)), qs=out.filter(l=>QUESTION.test(l));
console.log(errs.length?'ОШИБКИ:\n'+errs.join('\n'):'Ошибок нет.');
if(qs.length) console.log('Вопросы (возможно, задумано):\n'+qs.join('\n'));
console.log('деревьев',Object.keys(M).length,'перков',[...names].length,'билдов',(W.buildsData||[]).length);
process.exitCode=errs.length?1:0;
