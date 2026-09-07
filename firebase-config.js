// Firebase 프로젝트 설정값 (공개되어도 안전한 값입니다 - 실제 보안은 Firestore 규칙으로 처리)
const firebaseConfig = {
  apiKey: "AIzaSyBfYM7Bqxst5migE6E5ut6Q3hAi9Bd8IqU",
  authDomain: "chaewoo-home.firebaseapp.com",
  databaseURL: "https://chaewoo-home-default-rtdb.firebaseio.com",
  projectId: "chaewoo-home",
  storageBucket: "chaewoo-home.firebasestorage.app",
  messagingSenderId: "1020155047666",
  appId: "1:1020155047666:web:d11c065170c90d07abaa6b",
};

firebase.initializeApp(firebaseConfig);
const guestbookDb = firebase.firestore();
