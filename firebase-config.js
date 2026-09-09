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
  apiKey: "AIzaSyAxisxsU0n9LoleQFX1nJ4GCQnZwVkv2EM",
  authDomain: "legends-of-the-prancing-mare.firebaseapp.com",
  databaseURL: "https://legends-of-the-prancing-mare-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "legends-of-the-prancing-mare",
  storageBucket: "legends-of-the-prancing-mare.firebasestorage.app",
  messagingSenderId: "479204281567",
  appId: "1:479204281567:web:03db757500f708844d2d6a",
  measurementId: "G-6S40NQNNXS",
};

window.FIREBASE_CONFIGURED = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("ВСТАВЬ");
if (window.FIREBASE_CONFIGURED) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.error("Ошибка инициализации Firebase:", e);
        window.FIREBASE_CONFIGURED = false;
    }
}
