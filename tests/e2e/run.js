// Прогон всех сценариев стенда: node tests/e2e/run.js [фильтр] [--slow]
// Каждый t*.js запускается отдельным процессом на своём порту (по 4 параллельно).
// Сценарий не прошёл, если: код выхода не 0, таймаут, или в выводе есть строка, начинающаяся с FAIL.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const SLOW = new Set(['t52-fuzz.js']); // долгие: только с --slow
const args = process.argv.slice(2);
const slow = args.includes('--slow');
const filter = args.find(a => !a.startsWith('--'));
const files = fs.readdirSync(__dirname).filter(f => /^t\d.*\.js$/.test(f))
  .filter(f => !filter || f.includes(filter)).filter(f => slow || !SLOW.has(f)).sort();
const PAR = +(process.env.PAR || 4), TIMEOUT = +(process.env.TIMEOUT || 240) * 1000;
const outDir = path.join(__dirname, 'out'); fs.mkdirSync(outDir, { recursive: true }); // сюда же пишут скриншоты сценариев
let next = 0, port = 9100; const results = [];
function runOne(f) {
  return new Promise(res => {
    const p = spawn(process.execPath, [path.join(__dirname, f)], { env: { ...process.env, PORT: String(port++) } });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    const t = setTimeout(() => { p.kill('SIGKILL'); out += '\nFAIL timeout'; }, TIMEOUT);
    p.on('close', code => {
      clearTimeout(t); fs.writeFileSync(path.join(outDir, f + '.log'), out);
      const failLine = out.split('\n').find(l => /^FAIL/.test(l));
      const ok = code === 0 && !failLine;
      console.log((ok ? 'ok   ' : 'FAIL ') + f + (ok ? '' : '  — ' + (failLine || 'exit ' + code)));
      results.push({ f, ok }); res();
    });
  });
}
(async () => {
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < files.length) await runOne(files[next++]); }));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} сценариев прошли. Логи: tests/e2e/out/`);
  process.exit(bad.length ? 1 : 0);
})();
