// ---------------------------------------------------------------------------
// photo.js
// 캡쳐로 만든 숙제의 "원본 사진".
//   - compressPhoto  : 캡쳐 이미지를 Firestore 문서 한 개에 들어갈 JPEG data URL로 줄인다
//   - createPhotoBlock: "원본 사진 펼치기" 단추 + 펼치면 사진 (딸 화면·엄마 현황 공용)
//
// 사진은 할일 목록 구독에 끼지 않고, 펼칠 때만 한 번 읽어 이 페이지가 기억해 둔다.
// OCR이 잘못 읽었을 때 원본을 바로 대조해 볼 수 있게 하려는 것이다.
// ---------------------------------------------------------------------------
import { getImage, MAX_IMAGE_CHARS } from "./db.js";

/** 긴 변 최대 길이(px). 숙제표 글씨가 읽힐 만큼은 남긴다. */
const MAX_SIDE = 1800;

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 열 수 없습니다")); };
    img.src = url;
  });
}

/**
 * 캡쳐 이미지를 JPEG data URL로 줄인다. 문서 한도에 들 때까지 화질·크기를 낮춘다.
 * @param {Blob} blob
 * @returns {Promise<string>} data URL
 */
export async function compressPhoto(blob) {
  const img = await loadImage(blob);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  for (let tries = 0; tries < 8; tries++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // 투명한 PNG가 JPEG에서 까맣게 되지 않게
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const quality = tries < 3 ? 0.82 - tries * 0.1 : 0.6;
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
    if (tries >= 2) scale *= 0.8;
  }
  throw new Error("사진을 충분히 줄이지 못했습니다.");
}

// --- 펼치기 -----------------------------------------------------------------

/** 펼쳐 둔 사진 id (다시 그려도 펼친 채로 남게) */
const openIds = new Set();
/** 읽어 온 사진: imageId → data URL | null(없음) | Promise(읽는 중) */
const cache = new Map();

/** 방금 올린 사진은 다시 받지 않도록 미리 넣어 둔다 */
export function rememberPhoto(imageId, dataUrl) {
  if (imageId && dataUrl) cache.set(imageId, dataUrl);
}

/**
 * "원본 사진 펼치기" 단추와 (펼쳤으면) 사진.
 * @param {string} studentId
 * @param {string} imageId
 * @param {() => void} rerender 사진을 다 읽었거나 펼침이 바뀌었을 때 화면을 다시 그리는 함수
 */
export function createPhotoBlock(studentId, imageId, rerender) {
  const box = document.createElement("div");
  box.className = "photo-block";
  const open = openIds.has(imageId);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "photo-toggle";
  toggle.textContent = open ? "원본 사진 접기" : "원본 사진 펼치기";
  toggle.setAttribute("aria-expanded", String(open));
  toggle.addEventListener("click", (e) => {
    e.stopPropagation(); // 목록의 "누르면 수정/펼치기"와 겹치지 않게
    if (openIds.has(imageId)) openIds.delete(imageId);
    else openIds.add(imageId);
    rerender();
  });
  box.appendChild(toggle);
  if (!open) return box;

  const cached = cache.get(imageId);
  if (typeof cached === "string") {
    // 표 글씨가 작아서, 사진을 누르면 두 배로 키워 옆으로 밀어 보게 한다
    const frame = document.createElement("div");
    frame.className = "photo-frame";
    const img = document.createElement("img");
    img.className = "photo-img";
    img.src = cached;
    img.alt = "숙제 원본 사진";
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      frame.classList.toggle("is-zoomed");
    });
    frame.appendChild(img);
    box.appendChild(frame);
    return box;
  }

  const note = document.createElement("p");
  note.className = "photo-note";
  box.appendChild(note);
  if (cached === null) {
    note.textContent = "사진을 찾을 수 없어요.";
    return box;
  }
  note.textContent = "사진 불러오는 중…";
  if (!cached) {
    const loading = getImage(studentId, imageId)
      .then((data) => cache.set(imageId, data || null))
      .catch((err) => {
        console.warn("[photo] 사진 읽기 실패", err);
        cache.delete(imageId);
        note.textContent = "사진을 불러오지 못했어요. (" + (err.code || err.message) + ")";
        throw err;
      });
    cache.set(imageId, loading);
    loading.then(rerender, () => {});
  }
  return box;
}
