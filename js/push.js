// ---------------------------------------------------------------------------
// push.js
// 저녁 알림(웹 푸시) 켜고 끄기.
//
// 서버가 없으므로 보내는 쪽은 GitHub Actions가 맡는다(매일 저녁, tools/send-evening-reminder.mjs).
// 이 파일은 **받을 준비**만 한다: 알림 권한을 받고, 이 기기의 구독 정보를 Firestore에 넣는다.
// 실제로 알림을 그리는 곳은 service-worker.js의 push 핸들러다.
//
// 알림은 기기마다 따로 켠다 (구독이 기기에 매인 것이라 그렇다).
// 껐다 켜도 같은 문서에 덮어쓰도록 endpoint로 문서 id를 만든다.
// ---------------------------------------------------------------------------
import { savePushSubscription, deletePushSubscription } from "./db.js";

/**
 * 보내는 쪽(GitHub Actions)과 짝이 되는 공개 키.
 * 비밀 키는 저장소에 두지 않는다 — GitHub Secrets의 VAPID_PRIVATE_KEY.
 * 키를 새로 만들면 기존 구독은 전부 무효가 되므로 바꾸지 말 것.
 */
export const VAPID_PUBLIC_KEY =
  "BP-Y3WeAIgLH2ytkRlU6h3H9jCKSRYtWjnfP-fpD-m3h7PcP3Z2jwTscs_BtBZhLhFTUUhxP5J_DabxlQDbBEt4";

/** base64url → Uint8Array (구독할 때 쓰는 형식) */
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** 구독 주소로 문서 id를 만든다 (같은 기기는 늘 같은 칸에 들어가도록) */
export function subscriptionId(endpoint) {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    hash = (hash * 31 + endpoint.charCodeAt(i)) | 0;
  }
  return "s" + Math.abs(hash).toString(36) + endpoint.length.toString(36);
}

/** 이 브라우저가 알림을 받을 수 있는지 */
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 지금 상태: "unsupported" | "off" | "on" | "blocked" */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? "on" : "off";
}

/**
 * 알림 켜기. 권한을 묻고 구독해서 Firestore에 넣는다.
 * @returns {Promise<"on"|"blocked"|"unsupported">}
 */
export async function enablePush(studentId) {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "blocked";

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,   // 크롬은 "조용한 푸시"를 허용하지 않는다
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON();
  await savePushSubscription(studentId, subscriptionId(sub.endpoint), {
    endpoint: sub.endpoint,
    p256dh: json.keys && json.keys.p256dh,
    auth: json.keys && json.keys.auth,
    label: (navigator.userAgentData && navigator.userAgentData.platform) || "폰",
  });
  return "on";
}

/** 알림 끄기. 구독을 끊고 Firestore에서도 지운다. */
export async function disablePush(studentId) {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const id = subscriptionId(sub.endpoint);
    await sub.unsubscribe();
    await deletePushSubscription(studentId, id).catch(() => { /* 이미 없으면 그만 */ });
  }
  return "off";
}
