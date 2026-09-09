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
  } catch (e) {
    console.error("Ошибка инициализации Firebase:", e);
    window.FIREBASE_CONFIGURED = false;
  }
}
