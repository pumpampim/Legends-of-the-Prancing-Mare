const firebaseConfig = {
  apiKey: "AIzaSyAxisxsU0n9LoleQFX1nJ4GCQnZwVkv2EM",
  authDomain: "legends-of-the-prancing-mare.firebaseapp.com",
  projectId: "legends-of-the-prancing-mare",
  storageBucket: "legends-of-the-prancing-mare.firebasestorage.app",
  messagingSenderId: "479204281567",
  appId: "1:479204281567:web:03db757500f708844d2d6a",
  measurementId: "G-6S40NQNNXS"
};

window.FIREBASE_CONFIGURED = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("ВСТАВЬ");

if (window.FIREBASE_CONFIGURED) {
  try {
    firebase.initializeApp(firebaseConfig);
    // iPhone/iPad (там любой браузер — Safari внутри) и Safari на Mac: потоковое соединение Firestore
    // часто рвётся или повисает за VPN и мобильными операторами — лист грузится с десятой попытки.
    // Обычные HTTP-запросы (long polling) проходят надёжно; это надо задать до первого обращения к базе.
    var ua = navigator.userAgent || '';
    var isAppleWebKit = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
      (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(ua));
    if (isAppleWebKit && firebase.firestore) {
      try { firebase.firestore().settings({ experimentalForceLongPolling: true }); } catch (e) { console.warn('Firestore long polling:', e); }
    }
  } catch (e) {
    console.error("Ошибка инициализации Firebase:", e);
    window.FIREBASE_CONFIGURED = false;
  }
}
