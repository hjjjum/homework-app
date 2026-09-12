// ---------------------------------------------------------------------------
// tools/send-evening-reminder.mjs — 저녁 알림 보내기
//
//   VAPID_PRIVATE_KEY=... node tools/send-evening-reminder.mjs [--dry]
//
// 앱에는 서버가 없다. 그래서 매일 저녁 GitHub Actions가 이 파일을 한 번 돌린다
// (.github/workflows/evening-reminder.yml, 한국시간 20시).
//
// 하는 일:
//   1. Firestore REST로 두 아이의 할일과 학원 요일을 읽는다 (규칙이 읽기를 열어 두어 키가 필요 없다)
//   2. 앱과 **같은 규칙**으로 "오늘 몫"을 센다 — js/todo-logic.js를 그대로 불러 쓴다
//   3. 남은 게 있는 아이의 기기에만 웹 푸시를 보낸다
//   4. 죽은 구독(404/410)은 지운다
//
// 남은 게 없으면 보내지 않는다. 매일 울리는 알림은 금세 무시하게 되기 때문이다.
// ---------------------------------------------------------------------------

import { registerHooks } from "node:module";

const PROJECT = "homework-assistant-fcc6c";
const API_KEY = "AIzaSyBmaG6yvLh3WK9OvIzk7hYKKXBWsw5UoMo";   // 공개 키 (앱에 박혀 있는 것과 같다)
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const STUDENTS = ["daughter1", "daughter2"];
const SCREEN = { daughter1: "daughter1.html", daughter2: "daughter2.html" };
// 이름을 한 번도 바꾸지 않았으면 meta/profile 문서가 없다 (db.js의 DEFAULT_PROFILE과 같은 값)
const DEFAULT_NAME = { daughter1: "채원이", daughter2: "채이" };
const SITE = "https://hjjjum.github.io/homework-app/";
const DRY = process.argv.includes("--dry");

// todo-logic.js는 db.js의 상수만 쓰는데 db.js는 Firebase를 CDN에서 불러와 Node에서 못 연다.
// (tools/test-academy.mjs와 같은 방법) — 앱과 같은 계산을 쓰기 위한 것이다.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./db.js") {
      const stub =
        'export const CATEGORIES=["숙제","개인스케줄","공부"];' +
        'export const SUBJECTS=["수학","영어","과학","국어","사회","기타"];' +
        'export async function savePushSubscription(){}' +
        'export async function deletePushSubscription(){}';
      return { url: "data:text/javascript," + encodeURIComponent(stub), shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { selectToday, countTodo } = await import("../js/todo-logic.js");
const { VAPID_PUBLIC_KEY } = await import("../js/push.js");
// web-push는 실제로 보낼 때만 있으면 된다 (--dry 는 설치 없이 돌아간다).
// 앱 자체는 npm 의존성이 없고, 이 패키지는 보내는 쪽(GitHub Actions)에서만 깔린다.
const webpush = process.argv.includes("--dry") ? null : (await import("web-push")).default;

/** Firestore REST 값 → 보통 자바스크립트 값 */
function plain(value) {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(plain);
  if ("mapValue" in value) return fields(value.mapValue.fields);
  return null;
}
const fields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, plain(v)]));

async function get(path) {
  const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function listDocs(path) {
  const json = await get(`${path}?pageSize=300`);
  return (json && json.documents ? json.documents : []).map((d) => ({
    id: d.name.split("/").pop(),
    ...fields(d.fields),
    // todo-logic은 Firestore Timestamp처럼 toDate()가 있는 값을 기대한다
    createdAt: d.createTime ? { toDate: () => new Date(d.createTime) } : null,
  }));
}

/** 그 아이에게 보낼 문구. 남은 게 없으면 null */
function buildMessage(name, todos, schedule) {
  const today = selectToday(todos, new Date(), schedule).filter((t) => !t.completed);
  if (today.length === 0) return null;

  const 남은항목 = today.reduce((sum, t) => {
    const c = countTodo(t);
    return sum + (c.총 - c.완료);
  }, 0);
  const 첫숙제 = String(today[0].title || "").split("\n")[0];
  return {
    title: `${name}, 오늘 숙제 ${남은항목}개 남았어요`,
    body:
      today.length === 1
        ? `"${첫숙제}" 하나만 끝내면 오늘 목표 완성이에요.`
        : `"${첫숙제}" 외 ${today.length - 1}개. 지금 하나만 해볼까요?`,
  };
}

async function main() {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!DRY) {
    if (!privateKey) throw new Error("VAPID_PRIVATE_KEY 환경변수가 없습니다.");
    webpush.setVapidDetails("mailto:hjjjum@gmail.com", VAPID_PUBLIC_KEY, privateKey);
  }

  for (const studentId of STUDENTS) {
    const [todos, scheduleDoc, profile, subs] = await Promise.all([
      listDocs(`/students/${studentId}/todos`),
      get(`/students/${studentId}/meta/schedule`),
      get(`/students/${studentId}/meta/profile`),
      listDocs(`/students/${studentId}/push`),
    ]);
    const schedule = scheduleDoc ? fields(scheduleDoc.fields).items || [] : [];
    const name = (profile && fields(profile.fields).name) || DEFAULT_NAME[studentId];

    const message = buildMessage(name, todos, schedule);
    if (!message) {
      console.log(`${studentId}: 오늘 몫이 없거나 다 끝냈습니다 — 보내지 않음`);
      continue;
    }
    const payload = JSON.stringify({
      ...message,
      url: SITE + SCREEN[studentId],
      icon: `./icons/${studentId}-192.png`,
      tag: "evening",
    });
    console.log(`${studentId}: ${message.title} (기기 ${subs.length}대)`);
    if (DRY) continue;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        console.log(`  → 보냄 (${sub.id})`);
      } catch (err) {
        console.warn(`  → 실패 (${sub.id}): ${err.statusCode || ""} ${err.message}`);
        // 404/410 = 그 기기가 앱을 지웠거나 구독이 만료됐다. 남겨두면 매일 실패한다.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await fetch(`${BASE}/students/${studentId}/push/${sub.id}?key=${API_KEY}`, {
            method: "DELETE",
          });
          console.log(`  → 죽은 구독 삭제 (${sub.id})`);
        }
      }
    }
  }
}

await main();
