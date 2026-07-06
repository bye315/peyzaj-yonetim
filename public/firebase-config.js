// Firebase Yapılandırma Bilgileri
// Kendi Firebase projenizi oluşturduktan sonra burayı güncelleyin.
const firebaseConfig = {
  apiKey: "AIzaSyAnCxWtyArfnlJhvMlQR_Pc8BzIuGxUzow",
  authDomain: "peyzaj-359cc.firebaseapp.com",
  projectId: "peyzaj-359cc",
  storageBucket: "peyzaj-359cc.firebasestorage.app",
  messagingSenderId: "1029243925876",
  appId: "1:1029243925876:web:57c2101ddb4df8a758e821",
  measurementId: "G-07P38RET0Z"
};

// Firebase başlatılıyor
firebase.initializeApp(firebaseConfig);

// Kolay erişim için global değişkenler tanımlanıyor
const db = typeof firebase.firestore === 'function' ? firebase.firestore() : null;
const auth = typeof firebase.auth === 'function' ? firebase.auth() : null;
