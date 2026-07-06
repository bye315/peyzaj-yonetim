// Firebase Yapılandırma Bilgileri
// Kendi Firebase projenizi oluşturduktan sonra burayı güncelleyin.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase başlatılıyor
firebase.initializeApp(firebaseConfig);

// Kolay erişim için global değişkenler tanımlanıyor
const db = firebase.firestore();
const auth = firebase.auth();
