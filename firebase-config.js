// ============================================================================
// КОНФИГУРАЦИЯ FIREBASE
// ============================================================================
// Вставь сюда конфиг своего проекта из Firebase Console:
// console.firebase.google.com -> твой проект -> ⚙ Настройки проекта ->
// вкладка "Общие" -> раздел "Ваши приложения" -> веб-приложение -> "Конфигурация SDK"
//
// Подробная пошаговая инструкция: см. README-FIREBASE.md рядом с этим файлом.
// ============================================================================

const firebaseConfig = {
    apiKey: "ВСТАВЬ_СЮДА_apiKey",
    authDomain: "ВСТАВЬ_СЮДА.firebaseapp.com",
    projectId: "ВСТАВЬ_СЮДА_projectId",
    storageBucket: "ВСТАВЬ_СЮДА.appspot.com",
    messagingSenderId: "ВСТАВЬ_СЮДА",
    appId: "ВСТАВЬ_СЮДА"
};

// Флаг: заполнен ли конфиг реальными значениями (используется cloud.js,
// чтобы не пытаться подключаться к Firebase, пока ты не вставил свои ключи,
// и вместо ошибки просто работать в офлайн-режиме).
window.FIREBASE_CONFIGURED = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("ВСТАВЬ");

if (window.FIREBASE_CONFIGURED) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.error("Ошибка инициализации Firebase:", e);
        window.FIREBASE_CONFIGURED = false;
    }
}
