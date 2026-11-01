# Тесты

Сайт статический, npm нужен только для тестов.

```
npm install                       # один раз: ставит Playwright
npx playwright install chromium   # один раз: браузер для стенда
npm test                          # юнит-тесты + все сценарии стенда (~8 минут)
npm run test:unit                 # только tests.js (253 проверки, секунды)
npm run test:e2e -- t93           # один сценарий стенда по части имени
npm run test:slow                 # плюс долгий t52-fuzz (клики по всем кнопкам)
```

- `tests/unit.js` открывает `test.html` в браузере и падает, если хоть одна проверка из `tests.js` не прошла.
- `tests/e2e/` — стенд: настоящие страницы игрока и мастера в Chromium, Firebase подменён фейком в памяти (`fake-firebase.js` + `lib.js`). `setup.js` создаёт сессию с мастером и игроками.
- Сценарий не прошёл, если упал с ошибкой, вывел строку `FAIL …`, или на странице было исключение JS. Логи — `tests/e2e/out/`.
- На GitHub всё это запускается само при каждом push в main и в каждом PR (`.github/workflows/tests.yml`).
