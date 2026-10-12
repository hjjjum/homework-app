/* ---------------------------------------------------------------------------
 * dedupe.js — 같은 숙제를 두 번 보내지 않도록 돕는 순수 함수들
 *
 * 엄마가 같은 학원 캡쳐나 같은 카톡 메시지를 두 번 넣는 일이 실제로 생긴다.
 * 그걸 두 가지로 알아챈다:
 *   1) **원본 지문** — 한 번에 만들어진 카드들의 내용으로 지문을 만든다(`batchFingerprint`).
 *      같은 사진·같은 글에서는 같은 카드가 나오므로 지문이 같다. 보낸 지문은 엄마 기기에
 *      적어 두고(`rememberSent`), 다음에 같은 지문이 들어오면 "이미 보냄"으로 본다.
 *   2) **제목 대조** — 기기를 바꾸거나 학원이 같은 내용을 다시 보내면 지문이 달라진다.
 *      그래서 이미 들어가 있는 숙제와 제목이 같은지도 본다(`duplicateStudents`).
 *      완료한 숙제도 비교에 넣는다 — 이미 하고 있는 숙제가 또 들어오는 게 제일 헷갈린다.
 *
 * DOM·Firestore에 기대지 않으므로 Node에서 그대로 테스트된다:
 *   node tools/test-dedupe.mjs
 * --------------------------------------------------------------------------- */

/** 보낸 지문을 기억해 두는 기간(일). 지나면 버린다 — 한 달 뒤 같은 범위가 또 나오는 건 새 숙제다. */
export const SENT_KEEP_DAYS = 60;
/** 제목 대조로 중복을 볼 기간(일) */
export const TITLE_MATCH_DAYS = 14;

/**
 * 비교용으로 다듬은 제목. 띄어쓰기·기호·번호 매김을 버리고 글자와 숫자만 남긴다.
 * ("① Reading p.12~15" 와 "reading p 12 15" 를 같게 본다)
 */
export function normalizeTitle(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, "");
}

/** 짧은 지문 문자열 (FNV-1a). 외부 라이브러리 없이 쓰려고 직접 적었다. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36) + "-" + text.length.toString(36);
}

/** 카드 하나의 내용(제목 + 세부 항목)을 비교용 한 줄로 만든다 */
function draftLine(draft) {
  const items = (draft && Array.isArray(draft.items) ? draft.items : [])
    .map((it) => normalizeTitle(typeof it === "string" ? it : it && it.text))
    .filter(Boolean);
  return normalizeTitle(draft && draft.title) + (items.length ? "#" + items.join(",") : "");
}

/**
 * 한 번에 만들어진 카드들의 지문. 같은 사진·같은 글이면 같은 값이 나온다.
 * 카드 순서가 바뀌어도 같은 지문이 되도록 정렬해서 붙인다.
 * @param {Array<{title?: string, items?: Array}>} drafts
 * @returns {string} 내용이 없으면 빈 문자열
 */
export function batchFingerprint(drafts) {
  const lines = (drafts || []).map(draftLine).filter((line) => line && line !== "#");
  if (!lines.length) return "";
  return hash(lines.slice().sort().join("|"));
}

/** Firestore Timestamp · Date · 숫자 · 문자열을 밀리초로 */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const num = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * 이 지문으로 보낸 적이 있는지.
 * @param {Object} log 기기에 적어 둔 기록 { [지문]: {at, titles} }
 * @returns {{at: number, titles: string[]}|null}
 */
export function findSentRecord(log, fingerprint) {
  if (!fingerprint || !log) return null;
  const found = log[fingerprint];
  return found && typeof found.at === "number" ? found : null;
}

/**
 * 보낸 지문을 적어 넣은 새 기록을 돌려준다 (오래된 것은 버린다).
 * @param {Object} log 지금까지의 기록
 * @param {string} fingerprint
 * @param {{at: number, titles?: string[]}} entry
 */
export function rememberSent(log, fingerprint, entry) {
  const now = (entry && entry.at) || Date.now();
  const kept = {};
  for (const [sig, rec] of Object.entries(log || {})) {
    if (rec && typeof rec.at === "number" && now - rec.at <= SENT_KEEP_DAYS * 86400000) kept[sig] = rec;
  }
  if (fingerprint) {
    kept[fingerprint] = { at: now, titles: (entry && entry.titles ? entry.titles : []).slice(0, 12) };
  }
  return kept;
}

/**
 * 이 카드와 제목이 같은 숙제를 이미 가지고 있는 아이들.
 * @param {{title?: string}} draft
 * @param {Object} todosByStudent { daughter1: [{title, createdAt}], ... }
 * @param {number} now 밀리초
 * @param {number} [days] 며칠 안에 들어온 숙제까지 볼지
 * @returns {string[]} 중복인 아이 id들
 */
export function duplicateStudents(draft, todosByStudent, now, days = TITLE_MATCH_DAYS) {
  const title = normalizeTitle(draft && draft.title);
  if (!title) return [];
  const limit = days * 86400000;
  const hit = [];
  for (const [studentId, todos] of Object.entries(todosByStudent || {})) {
    const found = (todos || []).some((todo) => {
      if (normalizeTitle(todo && todo.title) !== title) return false;
      const at = toMillis(todo.createdAt);
      // 시각을 모르는(아직 서버 시간이 안 온) 숙제는 방금 들어온 것으로 본다
      return !at || now - at <= limit;
    });
    if (found) hit.push(studentId);
  }
  return hit;
}

/** "9월 28일" 처럼 사람이 읽는 날짜 */
export function sentDateLabel(millis) {
  const d = new Date(millis);
  return d.getMonth() + 1 + "월 " + d.getDate() + "일";
}
