// ---------------------------------------------------------------------------
// db.js
// Firestore 공용 함수 모음
// 컬렉션 경로: students/{studentId}/todos/{todoId}
// ---------------------------------------------------------------------------
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// --- 상수 ------------------------------------------------------------------
export const STUDENT_IDS = ["daughter1", "daughter2"];
export const CATEGORIES = ["숙제", "개인스케줄", "공부"];
export const ADDED_BY = ["mom", "self"];
/** 할일이 어떤 입력 방식으로 들어왔는지. 새 입력 소스는 js/sources/ 에 추가된다. */
export const DEFAULT_SOURCE = "manual";
/** 과목. 학원 메시지에서 자동으로 골라지고, 엄마 화면에서 고칠 수 있다. */
export const SUBJECTS = ["수학", "영어", "과학", "국어", "사회", "기타"];
export const DEFAULT_SUBJECT = "기타";
/** 한 숙제 안의 세부 항목 최대 개수 (보안 규칙과 맞춰둘 것) */
export const MAX_ITEMS = 50;

// --- 내부 헬퍼 --------------------------------------------------------------

/** students/{studentId}/todos 컬렉션 참조를 돌려준다. */
function todosCol(studentId) {
  assertStudentId(studentId);
  return collection(db, "students", studentId, "todos");
}

function assertStudentId(studentId) {
  if (!STUDENT_IDS.includes(studentId)) {
    throw new Error(
      `studentId는 ${STUDENT_IDS.join(" 또는 ")} 만 사용할 수 있습니다: ${studentId}`
    );
  }
}

/**
 * 세부 항목 배열을 [{text, done}] 모양으로 맞춘다.
 * 문자열 배열로 줘도 되고, 이미 {text, done} 형태여도 된다.
 */
export function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return { text: item.trim(), done: false };
      if (item && typeof item.text === "string") {
        return { text: item.text.trim(), done: item.done === true };
      }
      return null;
    })
    .filter((item) => item && item.text)
    .slice(0, MAX_ITEMS);
}

/**
 * 입력값을 Firestore에 저장할 형태로 정규화한다.
 * - 필수 필드 검증
 * - 선택 필드(date, memo)는 값이 없으면 빈 문자열로 채움
 */
function normalizeTodo(todoData) {
  const { title, category, completed, date, memo, addedBy, source, subject, items, urgent, imageId } =
    todoData || {};

  if (typeof title !== "string" || title.trim() === "") {
    throw new Error("title은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      `category는 ${CATEGORIES.join(" / ")} 중 하나여야 합니다: ${category}`
    );
  }

  return {
    title: title.trim(),
    category,
    completed: completed === true,
    date: typeof date === "string" ? date : "",
    memo: typeof memo === "string" ? memo : "",
    addedBy: ADDED_BY.includes(addedBy) ? addedBy : "self",
    // 어떤 입력 방식으로 만들어졌는지 (manual / whole / academy)
    source: typeof source === "string" && source.trim() ? source.trim() : DEFAULT_SOURCE,
    subject: SUBJECTS.includes(subject) ? subject : DEFAULT_SUBJECT,
    // 세부 항목. 학원 숙제처럼 여러 개를 하나씩 체크해야 할 때 쓴다.
    items: normalizeItems(items),
    // 급한 일 표시. 목록에서 맨 위로 올라가고 눈에 띄는 표시가 붙는다.
    urgent: urgent === true,
    // 캡쳐로 만든 숙제의 원본 사진 (students/{id}/images/{imageId}). 없으면 필드 자체를 넣지 않는다 —
    // 보안 규칙을 새로 배포하기 전에도 사진 없는 숙제는 그대로 저장되게 하려는 것이다.
    ...(typeof imageId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(imageId) ? { imageId } : {}),
  };
}

// --- 공개 API ---------------------------------------------------------------

/**
 * 할일 추가.
 * @param {string} studentId "daughter1" | "daughter2"
 * @param {object} todoData  { title, category, completed?, date?, memo?, addedBy? }
 * @returns {Promise<string>} 생성된 문서 ID
 *
 * 오프라인 상태에서도 즉시 로컬 캐시에 반영되며, 반환된 Promise는
 * 서버 반영이 끝난 뒤 resolve 됩니다. (오프라인일 때는 대기 상태로 남습니다.)
 */
export async function addTodo(studentId, todoData) {
  const payload = {
    ...normalizeTodo(todoData),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(todosCol(studentId), payload);
  return ref.id;
}

/**
 * 할일 수정. changes에 담긴 필드만 부분 업데이트한다.
 * 예) updateTodo("daughter1", id, { completed: true })
 */
export async function updateTodo(studentId, todoId, changes) {
  assertStudentId(studentId);
  if (!changes || typeof changes !== "object") {
    throw new Error("changes는 객체여야 합니다.");
  }

  // 허용된 필드만 통과시킨다 (createdAt 등은 수정 불가).
  const allowed = [
    "title", "category", "completed", "date", "memo",
    "addedBy", "source", "subject", "items", "urgent",
  ];
  const patch = {};
  for (const key of allowed) {
    if (key in changes) patch[key] = changes[key];
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("수정할 필드가 없습니다.");
  }
  if ("category" in patch && !CATEGORIES.includes(patch.category)) {
    throw new Error(`category는 ${CATEGORIES.join(" / ")} 중 하나여야 합니다.`);
  }
  if ("completed" in patch) patch.completed = patch.completed === true;
  if ("subject" in patch && !SUBJECTS.includes(patch.subject)) {
    throw new Error("subject는 " + SUBJECTS.join(" / ") + " 중 하나여야 합니다.");
  }
  if ("items" in patch) patch.items = normalizeItems(patch.items);
  if ("urgent" in patch) patch.urgent = patch.urgent === true;

  // 엄마 화면에서 "마지막으로 움직인 시각"을 보여주기 위한 것.
  // 정렬은 계속 createdAt으로 하므로 목록 순서에는 영향이 없다.
  patch.updatedAt = serverTimestamp();

  await updateDoc(doc(db, "students", studentId, "todos", todoId), patch);
}

/**
 * 할일 하나 삭제.
 * @param {string} [imageId] 이 할일에 붙은 원본 사진. 다른 할일이 더는 쓰지 않으면 사진도 지운다.
 */
export async function deleteTodo(studentId, todoId, imageId) {
  assertStudentId(studentId);
  await deleteDoc(doc(db, "students", studentId, "todos", todoId));
  if (imageId) await releaseImage(studentId, imageId);
}

/**
 * 완료된 할일을 한 번에 삭제.
 * @returns {Promise<number>} 삭제한 개수
 */
export async function deleteCompletedTodos(studentId) {
  const q = query(todosCol(studentId), where("completed", "==", true));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  // writeBatch는 한 번에 최대 500개까지 처리할 수 있으므로 잘라서 커밋한다.
  const docsToDelete = snap.docs;
  const CHUNK = 400;
  for (let i = 0; i < docsToDelete.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of docsToDelete.slice(i, i + CHUNK)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  const imageIds = new Set(docsToDelete.map((d) => d.get("imageId")).filter(Boolean));
  for (const imageId of imageIds) await releaseImage(studentId, imageId);
  return docsToDelete.length;
}

// --- 원본 사진 ---------------------------------------------------------------
// 경로: students/{studentId}/images/{imageId}  ({ data: "data:image/jpeg;base64,...", createdAt })
// 캡쳐로 숙제를 만들면 그 사진을 함께 남겨, 화면에서 "원본 사진 펼치기"로 볼 수 있게 한다.
// Storage 대신 Firestore 문서에 넣는 이유: Storage는 요금제를 올려야 쓸 수 있고,
// 숙제표 캡쳐는 JPEG로 줄이면 수백 KB라 문서 한도(1MB) 안에 들어간다.
// 할일 목록 구독(listenTodos)에는 끼지 않는다 — 펼칠 때만 한 번 읽는다.
// 한 캡쳐에서 숙제 여러 개가 나오므로 여러 할일이 같은 사진을 가리킬 수 있다.

/** 사진 문서 하나의 data URL 최대 길이 (보안 규칙과 맞춰둘 것) */
export const MAX_IMAGE_CHARS = 900000;

/** 새 사진 id (서버에 묻지 않고 기기에서 만든다) */
export function newImageId() {
  return doc(collection(db, "students", STUDENT_IDS[0], "images")).id;
}

/** 원본 사진 저장 */
export async function saveImage(studentId, imageId, dataUrl) {
  assertStudentId(studentId);
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_IMAGE_CHARS) {
    throw new Error("사진이 너무 큽니다.");
  }
  await setDoc(doc(db, "students", studentId, "images", imageId), {
    data: dataUrl,
    createdAt: serverTimestamp(),
  });
}

/** 원본 사진 읽기. 없으면 null */
export async function getImage(studentId, imageId) {
  assertStudentId(studentId);
  const snap = await getDoc(doc(db, "students", studentId, "images", imageId));
  return snap.exists() ? snap.get("data") : null;
}

/** 이 사진을 가리키는 할일이 하나도 안 남았으면 사진을 지운다. 실패해도 할일 삭제는 이미 끝났다. */
async function releaseImage(studentId, imageId) {
  try {
    const q = query(todosCol(studentId), where("imageId", "==", imageId), limit(1));
    if ((await getDocs(q)).empty) {
      await deleteDoc(doc(db, "students", studentId, "images", imageId));
    }
  } catch (err) {
    console.warn("[db] 사진 정리 실패 (무시):", err.code || err.message);
  }
}

/**
 * 실시간 구독. 변경될 때마다 onChange(todos배열)를 호출한다.
 * todos 배열의 각 항목: { id, title, category, completed, date, memo, addedBy, createdAt }
 *
 * @param {string} studentId
 * @param {(todos: object[]) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} 구독 해제 함수
 */
export function listenTodos(studentId, onChange, onError) {
  const q = query(todosCol(studentId), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const todos = snapshot.docs.map((d) => ({
        id: d.id,
        // serverTimestamps: "estimate" — 오프라인에서 방금 추가한 항목의
        // createdAt이 null이 되지 않고 로컬 추정 시각으로 채워집니다.
        ...d.data({ serverTimestamps: "estimate" }),
      }));
      onChange(todos);
    },
    (err) => {
      console.error("[db] listenTodos 오류:", err);
      if (typeof onError === "function") onError(err);
    }
  );
}

// --- 학원 요일 ---------------------------------------------------------------
// 경로: students/{studentId}/meta/schedule  ({ items: [{subject, days, name}], at })
//
// "다음 수업까지"가 기본값인 학원 숙제를 **실제 날짜**로 바꾸는 데 쓴다.
// 기기가 아니라 Firestore에 두는 이유는 이름(profile)과 같다 — 엄마 화면에서 고치면
// 딸 화면도 같은 요일을 봐야 하기 때문이다.
// days: 0=일 … 6=토

/** 학원 요일 기본값 (엄마 화면에서 고칠 수 있다) */
export const DEFAULT_SCHEDULE = {
  daughter1: [
    { subject: "영어", name: "영어학원", days: [2, 4] },
    { subject: "수학", name: "수학학원", days: [1, 3, 5] },
    { subject: "과학", name: "과학학원", days: [6] },
    { subject: "국어", name: "국어학원", days: [0] },
  ],
  daughter2: [
    { subject: "영어", name: "영어학원", days: [2, 4] },
    { subject: "수학", name: "황소수학", days: [3, 5] },
  ],
};

/** 학원 한 줄을 저장할 모양으로 다듬는다 */
function normalizeAcademy(item) {
  const subject = SUBJECTS.includes(item && item.subject) ? item.subject : null;
  if (!subject) return null;
  const days = Array.isArray(item.days)
    ? [...new Set(item.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (days.length === 0) return null;
  const name = typeof item.name === "string" ? item.name.slice(0, 20) : "";
  return { subject, days, name };
}

/** 학원 요일 저장 (통째로 덮어쓴다) */
export async function setSchedule(studentId, items) {
  assertStudentId(studentId);
  const clean = (Array.isArray(items) ? items : [])
    .map(normalizeAcademy)
    .filter(Boolean)
    .slice(0, 20);
  await setDoc(doc(db, "students", studentId, "meta", "schedule"), {
    items: clean,
    at: serverTimestamp(),
  });
}

/**
 * 학원 요일 구독. 아직 저장한 적이 없으면 기본값을 돌려준다.
 * @returns {() => void} 구독 해제 함수
 */
export function listenSchedule(studentId, onChange) {
  assertStudentId(studentId);
  return onSnapshot(
    doc(db, "students", studentId, "meta", "schedule"),
    (snap) => {
      const items = snap.exists() ? snap.get("items") : null;
      const clean = (Array.isArray(items) ? items : []).map(normalizeAcademy).filter(Boolean);
      onChange(clean.length ? clean : DEFAULT_SCHEDULE[studentId] || []);
    },
    (err) => {
      console.warn("[db] 학원 요일 구독 실패:", err.code || err.message);
      onChange(DEFAULT_SCHEDULE[studentId] || []);
    }
  );
}

// --- 연속 달성 기록 -----------------------------------------------------------
// 경로: students/{studentId}/meta/streak  ({ streak, best, lastClearDate, at })
//
// 스티커 판·테마 같은 꾸미기는 그 기기에만 두지만(그 기기에서만 의미가 있다),
// **연속 기록은 아이의 기록이라 기기가 바뀌어도 남아야 한다.**
// 앱을 지웠다 깔거나 폰을 바꿔도 이어지도록 Firestore에 둔다.

/**
 * 연속 기록 저장.
 * @param {{streak, best, lastClearDate, resetAt?}} record
 *   resetAt을 새 값으로 주면 아이 기기가 자기 기록을 버리고 이 값을 따른다 (다시 시작).
 */
export async function setStreak(studentId, record) {
  assertStudentId(studentId);
  const streak = Math.max(0, Math.min(10000, Math.round(Number(record && record.streak) || 0)));
  const best = Math.max(0, Math.min(10000, Math.round(Number(record && record.best) || 0)));
  const lastClearDate =
    typeof (record && record.lastClearDate) === "string" ? record.lastClearDate.slice(0, 10) : "";
  await setDoc(doc(db, "students", studentId, "meta", "streak"), {
    streak,
    best,
    lastClearDate,
    ...(record && record.resetAt ? { resetAt: String(record.resetAt).slice(0, 40) } : {}),
    at: serverTimestamp(),
  });
}

/** 연속 기록을 0부터 다시 시작시킨다 (엄마 화면에서 누른다) */
export async function resetStreak(studentId) {
  await setStreak(studentId, {
    streak: 0,
    best: 0,
    lastClearDate: "",
    resetAt: new Date().toISOString(),
  });
}

/**
 * 연속 기록 구독. 저장된 적이 없으면 null을 준다 (그 기기에 있던 값을 그대로 쓰라는 뜻).
 * @returns {() => void} 구독 해제 함수
 */
export function listenStreak(studentId, onChange) {
  assertStudentId(studentId);
  return onSnapshot(
    doc(db, "students", studentId, "meta", "streak"),
    (snap) => {
      if (!snap.exists()) return onChange(null);
      onChange({
        streak: Number(snap.get("streak")) || 0,
        best: Number(snap.get("best")) || 0,
        lastClearDate: snap.get("lastClearDate") || null,
        resetAt: snap.get("resetAt") || "",
      });
    },
    (err) => {
      console.warn("[db] 연속 기록 구독 실패:", err.code || err.message);
      onChange(null);
    }
  );
}

// --- 저녁 알림 구독 -----------------------------------------------------------
// 경로: students/{studentId}/push/{subId}  ({ endpoint, p256dh, auth, label, at })
//
// 알림을 보내는 쪽은 서버가 아니라 GitHub Actions다(매일 저녁 한 번).
// 여기에는 "이 기기로 보내 주세요"라는 주소만 담는다. 주소만 알아도 남이 알림을 보낼 수는 없다 —
// 보내려면 VAPID 비밀 키로 서명해야 하고, 그 키는 저장소가 아니라 GitHub Secrets에 있다.

/** 이 기기의 알림 구독을 저장한다 (같은 기기면 덮어쓴다) */
export async function savePushSubscription(studentId, subId, sub) {
  assertStudentId(studentId);
  if (!sub || typeof sub.endpoint !== "string" || !sub.p256dh || !sub.auth) {
    throw new Error("알림 구독 정보가 올바르지 않습니다.");
  }
  await setDoc(doc(db, "students", studentId, "push", subId), {
    endpoint: sub.endpoint.slice(0, 500),
    p256dh: String(sub.p256dh).slice(0, 200),
    auth: String(sub.auth).slice(0, 100),
    label: typeof sub.label === "string" ? sub.label.slice(0, 40) : "",
    at: serverTimestamp(),
  });
}

/** 알림 구독 삭제 (알림 끄기) */
export async function deletePushSubscription(studentId, subId) {
  assertStudentId(studentId);
  await deleteDoc(doc(db, "students", studentId, "push", subId));
}

// --- 응원 한마디 -------------------------------------------------------------
// 경로: students/{studentId}/meta/cheer  ({ text, at })
// 할일이 아니라 오늘 하루만 띄우는 메시지라 todos와 분리해 둔다.
// 매번 덮어쓰기 때문에 이력은 남지 않는다 (남길 이유가 없다).

/** 응원 한마디 최대 길이 (보안 규칙과 맞춰둘 것) */
export const MAX_CHEER_LENGTH = 100;

/**
 * 응원 한마디를 보낸다(덮어쓴다).
 * @param {string} studentId
 * @param {string} text
 */
export async function setCheer(studentId, text) {
  assertStudentId(studentId);
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("응원 문구가 비어 있습니다");
  if (trimmed.length > MAX_CHEER_LENGTH) {
    throw new Error("응원 문구는 " + MAX_CHEER_LENGTH + "자까지입니다");
  }
  await setDoc(doc(db, "students", studentId, "meta", "cheer"), {
    text: trimmed,
    at: serverTimestamp(),
  });
}

/**
 * 응원 한마디를 구독한다. 없으면 null을 넘긴다.
 * @param {string} studentId
 * @param {(cheer: {text: string, at: Date|null}|null) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} 구독 해제 함수
 */
export function listenCheer(studentId, onChange, onError) {
  assertStudentId(studentId);
  return onSnapshot(
    doc(db, "students", studentId, "meta", "cheer"),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      // todos와 같은 이유로 estimate — 오프라인에서 방금 쓴 것도 시각이 채워진다
      const d = snap.data({ serverTimestamps: "estimate" });
      onChange({
        text: typeof d.text === "string" ? d.text : "",
        at: d.at && typeof d.at.toDate === "function" ? d.at.toDate() : null,
      });
    },
    (err) => {
      console.error("[db] listenCheer 오류:", err);
      if (typeof onError === "function") onError(err);
    }
  );
}

// --- 이름과 아이콘 -----------------------------------------------------------
// 경로: students/{studentId}/meta/profile  ({ name, icon, at })
// 화면 제목("채원이 할 일")과 엄마 현황의 카드 이름이 이것을 함께 쓴다.
// 기기마다 다르면 헷갈리므로 localStorage가 아니라 Firestore에 둔다.

export const MAX_NAME_LENGTH = 20;

/** 아직 정하지 않았을 때 쓰는 이름과 아이콘 (icon은 stickers.js의 id) */
export const DEFAULT_PROFILE = {
  daughter1: { name: "채원이", icon: "moon" },
  daughter2: { name: "채이", icon: "cheese" },
};

/** 저장된 값이 없거나 망가졌을 때도 항상 온전한 모양을 돌려준다. */
export function normalizeProfile(studentId, data) {
  const base = DEFAULT_PROFILE[studentId] || { name: studentId, icon: "moon" };
  const name = data && typeof data.name === "string" ? data.name.trim() : "";
  const icon = data && typeof data.icon === "string" ? data.icon.trim() : "";
  return {
    name: name ? name.slice(0, MAX_NAME_LENGTH) : base.name,
    icon: icon || base.icon,
  };
}

/** 이름·아이콘 저장 (덮어쓰기) */
export async function setProfile(studentId, profile) {
  assertStudentId(studentId);
  const { name, icon } = normalizeProfile(studentId, profile);
  await setDoc(doc(db, "students", studentId, "meta", "profile"), {
    name,
    icon,
    at: serverTimestamp(),
  });
}

/**
 * 이름·아이콘 구독. 값이 없어도 기본값으로 한 번은 불러준다.
 * @returns {() => void} 구독 해제 함수
 */
export function listenProfile(studentId, onChange, onError) {
  assertStudentId(studentId);
  return onSnapshot(
    doc(db, "students", studentId, "meta", "profile"),
    (snap) => onChange(normalizeProfile(studentId, snap.exists() ? snap.data() : null)),
    (err) => {
      console.error("[db] listenProfile 오류:", err);
      // 못 읽어도 화면이 비지 않게 기본값을 넘긴다
      onChange(normalizeProfile(studentId, null));
      if (typeof onError === "function") onError(err);
    }
  );
}
