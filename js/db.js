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
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// --- 상수 ------------------------------------------------------------------
export const STUDENT_IDS = ["daughter1", "daughter2"];
export const CATEGORIES = ["숙제", "개인스케줄", "공부"];
export const ADDED_BY = ["mom", "self"];
/** 할일이 어떤 입력 방식으로 들어왔는지. 새 입력 소스는 js/sources/ 에 추가된다. */
export const DEFAULT_SOURCE = "manual";

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
 * 입력값을 Firestore에 저장할 형태로 정규화한다.
 * - 필수 필드 검증
 * - 선택 필드(date, memo)는 값이 없으면 빈 문자열로 채움
 */
function normalizeTodo(todoData) {
  const { title, category, completed, date, memo, addedBy, source } = todoData || {};

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
    // 어떤 입력 방식으로 만들어졌는지. 지금은 항상 "manual".
    source: typeof source === "string" && source.trim() ? source.trim() : DEFAULT_SOURCE,
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
  const allowed = ["title", "category", "completed", "date", "memo", "addedBy", "source"];
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

  await updateDoc(doc(db, "students", studentId, "todos", todoId), patch);
}

/** 할일 하나 삭제. */
export async function deleteTodo(studentId, todoId) {
  assertStudentId(studentId);
  await deleteDoc(doc(db, "students", studentId, "todos", todoId));
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
  return docsToDelete.length;
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
