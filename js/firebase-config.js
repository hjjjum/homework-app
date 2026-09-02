// ---------------------------------------------------------------------------
// firebase-config.js
// Firebase 초기화 (모듈 방식, CDN에서 직접 import — 빌드 도구 없음)
// ---------------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 의 설정값.
const firebaseConfig = {
  apiKey: "AIzaSyBmaG6yvLh3WK9OvIzk7hYKKXBWsw5UoMo",
  authDomain: "homework-assistant-fcc6c.firebaseapp.com",
  projectId: "homework-assistant-fcc6c",
  storageBucket: "homework-assistant-fcc6c.firebasestorage.app",
  messagingSenderId: "518842777400",
  appId: "1:518842777400:web:c692e9c794903c6a9e4bcd",
  measurementId: "G-N4K7QXL0TT",
};

export const app = initializeApp(firebaseConfig);

// 오프라인 지속성(persistence) 활성화.
// initializeFirestore + persistentLocalCache 방식은 현재 권장되는 API로,
// 예전의 enableIndexedDbPersistence() 를 대체합니다.
// persistentMultipleTabManager: 여러 탭을 동시에 열어도 캐시를 공유합니다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);

// 익명 로그인.
// 지금 단계의 보안 규칙은 로그인 없이도 동작하도록 열어두었지만,
// 나중에 규칙을 조일 때를 대비해 익명 인증을 미리 붙여둡니다.
// 실패해도(예: 콘솔에서 익명 로그인 미사용) 앱은 그대로 동작합니다.
export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
  });
  signInAnonymously(auth).catch((err) => {
    console.warn(
      "[firebase-config] 익명 로그인 실패 (앱은 계속 동작합니다):",
      err.code || err.message
    );
    resolve(null);
  });
});
