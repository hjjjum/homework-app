/* ---------------------------------------------------------------------------
 * stickers.js — 스티커 24종 (전부 CSS 도형 조합, 이미지 파일 없음)
 * 한 스티커는 "부품(part) 배열"이다. 부품 좌표는 % 라서 어떤 크기로도 그려진다.
 * 사용법:
 *   import { STICKERS, GROUPS, createSticker } from "./stickers.js";
 *   box.appendChild(createSticker("berry", 44));   // 44px 딸기
 * --------------------------------------------------------------------------- */

const S = "polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)";
const LEAF = "50% 20% 50% 20%";
/** left, top, width, height, background, border-radius, clip-path, rotate(deg) */
const P = (l, t, w, h, bg, r, c, rot) => ({ l, t, w, h, bg, r: r || "0", c: c || "none", rot: rot || 0 });

export const GROUPS = ["과일", "디저트", "꽃 · 식물", "하늘 · 마음"];

export const STICKERS = [
  { id: "berry", name: "딸기", group: "과일", parts: [
    P(24, 26, 52, 60, "#FF4B6E", "50% 50% 46% 46%/38% 38% 62% 62%"),
    P(36, 40, 6, 12, "#FFE9C9", "3px"), P(56, 48, 6, 12, "#FFE9C9", "3px"), P(44, 62, 6, 12, "#FFE9C9", "3px"),
    P(30, 10, 40, 22, "#3FA86B", LEAF)] },
  { id: "cherry", name: "체리", group: "과일", parts: [
    P(6, 52, 42, 42, "#FF3B3B", "50%"), P(52, 58, 36, 36, "#FF6B6B", "50%"),
    P(38, 14, 5, 44, "#3FA86B", "3px", null, -18), P(56, 18, 5, 40, "#3FA86B", "3px", null, 16),
    P(54, 4, 30, 16, "#3FA86B", LEAF)] },
  { id: "lemon", name: "레몬", group: "과일", parts: [
    P(14, 28, 70, 50, "#FFC93C", "50%"), P(28, 38, 22, 10, "#FFE08A", "999px", null, -18),
    P(56, 12, 30, 16, "#3FA86B", LEAF)] },
  { id: "watermelon", name: "수박", group: "과일", parts: [
    P(8, 28, 84, 62, "#3FA86B", "0 0 50% 50%"), P(14, 34, 72, 52, "#FFF6EA", "0 0 50% 50%"),
    P(19, 39, 62, 44, "#FF5B7A", "0 0 50% 50%"),
    P(38, 54, 7, 11, "#4A2E2A", "3px"), P(56, 60, 7, 11, "#4A2E2A", "3px")] },
  { id: "apple", name: "사과", group: "과일", parts: [
    P(16, 26, 68, 62, "#FF3B3B", "48% 48% 50% 50%/42% 42% 58% 58%"),
    P(47, 12, 6, 20, "#8A5A3B", "3px"), P(52, 8, 28, 15, "#3FA86B", LEAF),
    P(28, 40, 13, 8, "#FF8080", "999px", null, -20)] },
  { id: "peach", name: "복숭아", group: "과일", parts: [
    P(14, 28, 72, 60, "#FFA694", "50%"), P(48, 28, 38, 60, "#FF8C77", "50%"),
    P(50, 10, 30, 16, "#3FA86B", LEAF)] },

  { id: "donut", name: "도넛", group: "디저트", parts: [
    P(10, 12, 80, 80, "radial-gradient(circle at 50% 50%,transparent 0 21%,#F0AE72 21.5% 100%)", "50%"),
    P(14, 12, 72, 46, "radial-gradient(circle at 50% 78%,transparent 0 27%,#FF7FAE 27.5% 100%)", "50% 50% 30% 30%"),
    P(28, 22, 9, 5, "#FFF6EA", "999px", null, 20), P(58, 30, 9, 5, "#8FD9EE", "999px", null, -15)] },
  { id: "icecream", name: "아이스크림", group: "디저트", parts: [
    P(30, 52, 40, 46, "#F0B96A", "0", "polygon(0 0,100% 0,50% 100%)"),
    P(20, 22, 56, 40, "#FF7FAE", "50%"), P(30, 8, 40, 32, "#8FD9EE", "50%"),
    P(44, 2, 14, 14, "#FF3B3B", "50%")] },
  { id: "cupcake", name: "컵케이크", group: "디저트", parts: [
    P(24, 52, 52, 42, "#FFB1C8", "6px 6px 42% 42%"), P(18, 22, 64, 38, "#8FD9EE", "50% 50% 30% 30%"),
    P(43, 8, 15, 15, "#FF3B3B", "50%"), P(34, 62, 6, 22, "#FF7FAE", "3px"), P(58, 62, 6, 22, "#FF7FAE", "3px")] },
  { id: "juice", name: "주스", group: "디저트", parts: [
    P(24, 24, 52, 62, "#8FD9EE", "8px"), P(34, 38, 34, 9, "#FFF6EA", "3px"), P(34, 54, 22, 9, "#FFF6EA", "3px"),
    P(62, 4, 7, 34, "#FFC93C", "3px", null, 20)] },
  { id: "candy", name: "사탕", group: "디저트", parts: [
    P(26, 30, 48, 44, "#FF7FAE", "50%"), P(36, 40, 20, 20, "#FFF6EA", "50%"),
    P(4, 34, 26, 34, "#FFC93C", "50% 10% 50% 10%"), P(70, 34, 26, 34, "#FFC93C", "10% 50% 10% 50%")] },
  { id: "cookie", name: "쿠키", group: "디저트", parts: [
    P(12, 14, 76, 76, "#E5A96A", "50%"),
    P(30, 30, 13, 13, "#6B4A2F", "50%"), P(56, 26, 11, 11, "#6B4A2F", "50%"),
    P(46, 54, 12, 12, "#6B4A2F", "50%"), P(24, 58, 9, 9, "#6B4A2F", "50%")] },

  { id: "tulip", name: "튤립", group: "꽃 · 식물", parts: [
    P(46, 34, 7, 58, "#3FA86B", "3px"), P(8, 54, 36, 18, "#5FBF84", LEAF),
    P(22, 8, 50, 44, "#FF7FAE", "30% 30% 50% 50%"), P(42, 8, 18, 22, "#FFA3C6", "8px 8px 0 0")] },
  { id: "daisy", name: "데이지", group: "꽃 · 식물", parts: [
    P(37, 2, 26, 26, "#FFC2D4", "50%"), P(6, 26, 26, 26, "#FFC2D4", "50%"), P(68, 26, 26, 26, "#FFC2D4", "50%"),
    P(18, 58, 26, 26, "#FFC2D4", "50%"), P(56, 58, 26, 26, "#FFC2D4", "50%"),
    P(37, 34, 26, 26, "#FFC93C", "50%")] },
  { id: "clover", name: "네잎클로버", group: "꽃 · 식물", parts: [
    P(24, 16, 26, 26, "#5FBF84", "50% 50% 0 50%"), P(50, 16, 26, 26, "#5FBF84", "50% 50% 50% 0"),
    P(24, 42, 26, 26, "#3FA86B", "50% 0 50% 50%"), P(50, 42, 26, 26, "#3FA86B", "0 50% 50% 50%"),
    P(47, 62, 6, 32, "#3FA86B", "3px", null, 8)] },
  { id: "cactus", name: "선인장", group: "꽃 · 식물", parts: [
    P(40, 16, 22, 66, "#3FA86B", "12px"), P(16, 34, 22, 30, "#5FBF84", "12px 0 0 12px"),
    P(62, 44, 22, 26, "#5FBF84", "0 12px 12px 0"),
    P(30, 78, 42, 18, "#E5A96A", "4px 4px 10px 10px"), P(44, 6, 14, 14, "#FF7FAE", "50%")] },
  { id: "mushroom", name: "버섯", group: "꽃 · 식물", parts: [
    P(38, 52, 24, 44, "#F0DCC0", "0 0 32% 32%"), P(8, 18, 84, 40, "#FF5B3E", "50% 50% 12% 12%"),
    P(22, 28, 17, 17, "#FFF6EA", "50%"), P(50, 24, 13, 13, "#FFF6EA", "50%"), P(68, 36, 11, 11, "#FFF6EA", "50%")] },

  { id: "star", name: "반짝별", group: "하늘 · 마음", parts: [
    P(6, 6, 88, 88, "#FFC93C", "0", S), P(32, 32, 36, 36, "#FFE08A", "0", S)] },
  { id: "rainbow", name: "무지개", group: "하늘 · 마음", parts: [
    P(8, 26, 84, 15, "#FF5B3E", "999px"), P(16, 45, 68, 15, "#FFC93C", "999px"),
    P(24, 64, 52, 15, "#8FD9EE", "999px")] },
  { id: "cloud", name: "구름", group: "하늘 · 마음", parts: [
    P(8, 46, 84, 30, "#9FDCF2", "999px"), P(24, 26, 36, 36, "#9FDCF2", "50%"), P(52, 34, 28, 28, "#9FDCF2", "50%"),
    P(30, 82, 8, 12, "#6EC7E4", "3px"), P(58, 82, 8, 12, "#6EC7E4", "3px")] },
  { id: "moon", name: "달", group: "하늘 · 마음", parts: [
    P(18, 12, 66, 66, "radial-gradient(circle at 82% 34%,transparent 0 52%,#FFC93C 52.5% 100%)", "50%"),
    P(2, 62, 22, 22, "#FFC93C", "0", S)] },
  { id: "heart", name: "하트", group: "하늘 · 마음", parts: [
    P(10, 20, 44, 44, "#FF7FAE", "50%"), P(46, 20, 44, 44, "#FF7FAE", "50%"),
    P(22, 34, 56, 56, "#FF7FAE", "6px", null, 45)] },
  { id: "ribbon", name: "리본", group: "하늘 · 마음", parts: [
    P(4, 26, 40, 38, "#FF7FAE", "50% 10% 50% 10%"), P(56, 26, 40, 38, "#FF7FAE", "10% 50% 10% 50%"),
    P(40, 34, 20, 20, "#FFC93C", "50%"),
    P(34, 56, 11, 32, "#FFA3C6", "4px", null, 12), P(55, 56, 11, 32, "#FFA3C6", "4px", null, -12)] },
  { id: "balloon", name: "풍선", group: "하늘 · 마음", parts: [
    P(22, 6, 56, 62, "#FF5B3E", "50%/45% 45% 55% 55%"), P(45, 64, 10, 10, "#FF5B3E", "3px"),
    P(48, 72, 4, 26, "#B79A90", "2px"), P(34, 20, 12, 8, "#FF8E7A", "999px", null, -25)] }
];

/** 추천 8종 (초등 저·중학년) */
export const PICK_CUTE = ["berry", "star", "cherry", "tulip", "rainbow", "heart", "icecream", "clover"];
/** 차분한 8종 (중학생) */
export const PICK_CALM = ["star", "moon", "cloud", "clover", "cactus", "lemon", "cookie", "ribbon"];

export function getSticker(id) {
  return STICKERS.find((s) => s.id === id) || STICKERS[0];
}

/**
 * 스티커 하나를 DOM으로 만든다.
 * @param {string} id 스티커 id
 * @param {number} size px
 * @param {number} [rotate] 기울기(deg)
 */
export function createSticker(id, size, rotate) {
  const sticker = getSticker(id);
  const box = document.createElement("span");
  box.className = "sticker";
  box.dataset.sticker = sticker.id;
  box.style.width = size + "px";
  box.style.height = size + "px";
  if (rotate) box.style.transform = "rotate(" + rotate + "deg)";
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", sticker.name + " 스티커");
  for (const p of sticker.parts) {
    const part = document.createElement("span");
    part.className = "sticker-part";
    part.style.left = p.l + "%";
    part.style.top = p.t + "%";
    part.style.width = p.w + "%";
    part.style.height = p.h + "%";
    part.style.background = p.bg;
    part.style.borderRadius = p.r;
    if (p.c !== "none") part.style.clipPath = p.c;
    if (p.rot) part.style.transform = "rotate(" + p.rot + "deg)";
    box.appendChild(part);
  }
  return box;
}
