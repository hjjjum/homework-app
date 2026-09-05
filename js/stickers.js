/* ---------------------------------------------------------------------------
 * stickers.js — 스티커 52종 (전부 CSS 도형 조합, 이미지 파일 없음)
 * 한 스티커는 "부품(part) 배열"이다. 부품 좌표는 % 라서 어떤 크기로도 그려진다.
 *   import { STICKERS, GROUPS, createSticker } from "./stickers.js";
 *   box.appendChild(createSticker("cheese", 46));   // 46px 치즈태비
 * --------------------------------------------------------------------------- */

const S = "polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)";
const LEAF = "50% 20% 50% 20%";
const TRI = "polygon(50% 0,100% 100%,0 100%)";
const INK = "#3A332E";
const EAR_L = "16% 50% 50% 50%";   // 45도 돌리면 위로 살짝 둥근 삼각
const EAR_R = "50% 16% 50% 50%";

/** left, top, width, height, background, border-radius, clip-path, rotate(deg) — 모두 % */
const P = (l, t, w, h, bg, r, c, rot) => ({ l, t, w, h, bg, r: r || "0", c: c || "none", rot: rot || 0 });

/** 큰 눈 두 개 + 반짝임 */
const EYES = (lx, rx, y, w, h, c) => [
  P(lx, y, w, h, c || "#2F2A33", "50%"), P(rx, y, w, h, c || "#2F2A33", "50%"),
  P(lx + w * 0.24, y + h * 0.16, w * 0.36, h * 0.3, "#FFFFFF", "50%"),
  P(rx + w * 0.24, y + h * 0.16, w * 0.36, h * 0.3, "#FFFFFF", "50%")
];
const BLUSH = (lx, rx, y, w, h, c) => [
  P(lx, y, w, h, c || "#FFB3C7", "50%"), P(rx, y, w, h, c || "#FFB3C7", "50%")
];

/** 담벼락 위로 빼꼼 내민 고양이. 동글한 귀 + 외곽선 한 겹 + 점 눈 + 앞발. */
const CATF = (o) => {
  const ink = o.ink || INK;
  const inner = o.inner || "#F6C3C0";
  const earL = o.ear || o.fur, earR = o.ear2 || o.ear || o.fur;
  const ears = o.flatEars
    ? [P(12, 23, 24, 17, earL, "50% 50% 44% 44%"), P(64, 23, 24, 17, earR, "50% 50% 44% 44%")]
    : [P(11, 10, 27, 27, earL, EAR_L, null, 45), P(62, 10, 27, 27, earR, EAR_R, null, -45),
       P(19, 18, 12, 12, inner, EAR_L, null, 45), P(70, 18, 12, 12, inner, EAR_R, null, -45)];
  const fluff = o.fluff ? [P(-1, 42, 20, 24, o.fur, "50%"), P(81, 42, 20, 24, o.fur, "50%")] : [];
  const eye = o.eye || ink;
  return [].concat(ears, fluff,
    [P(8, 19, 84, 76, ink, "50%"), P(11, 22, 78, 70, o.fur, "50%")],
    o.marks || [],
    o.blush ? BLUSH(18, 65, 62, 17, 9, o.blush) : [],
    [P(28, 47, 13, 16, eye, "50%"), P(59, 47, 13, 16, eye, "50%"),
     P(31, 50, 5, 5, "#FFFFFF", "50%"), P(62, 50, 5, 5, "#FFFFFF", "50%"),
     P(45, 68, 10, 7, o.nose || "#E58A93", "40% 40% 60% 60%")],
    [P(15, 86, 20, 16, o.paw || o.fur, "999px 999px 8px 8px"),
     P(65, 86, 20, 16, o.paw || o.fur, "999px 999px 8px 8px")]);
};

export const GROUPS = ["고양이", "과일", "채소 · 간식", "디저트", "꽃 · 식물", "하늘 · 마음", "사물"];

export const STICKERS = [
  /* ---------- 고양이 10종 (묘종별) ---------- */
  { id: "cheese", name: "치즈태비", group: "고양이", parts: CATF({
    fur: "#F5AF5C", ear: "#EC9C42", blush: "#F08A72",
    marks: [P(29, 22, 7, 13, "#D97E28", "999px"), P(46, 20, 7, 15, "#D97E28", "999px"), P(63, 22, 7, 13, "#D97E28", "999px")] }) },
  { id: "calico", name: "삼색이", group: "고양이", parts: CATF({
    fur: "#FFF7EE", ear: "#F2A54E", ear2: "#5B534E", paw: "#FFF7EE",
    marks: [P(11, 22, 30, 26, "#F2A54E", "50%"), P(60, 24, 28, 24, "#6B625C", "50%")] }) },
  { id: "tuxedo", name: "턱시도", group: "고양이", parts: CATF({
    fur: "#4A423C", inner: "#C99B95", eye: "#FFE08A", paw: "#FFF7EE",
    marks: [P(24, 56, 52, 40, "#FFF7EE", "50%")] }) },
  { id: "russian", name: "러시안블루", group: "고양이", parts: CATF({
    fur: "#9FB4C2", ear: "#8AA0B0", inner: "#DDBFC2", eye: "#4E9E42", nose: "#C79BA2",
    marks: [P(22, 26, 17, 9, "#B8C9D4", "999px", null, -14)] }) },
  { id: "siamese", name: "샴", group: "고양이", parts: CATF({
    fur: "#F5E7D2", ear: "#6B5445", inner: "#C7A08C", eye: "#5B8DEF", nose: "#8A7060", paw: "#F5E7D2",
    marks: [P(24, 56, 52, 40, "#8A7060", "50%")] }) },
  { id: "persian", name: "페르시안", group: "고양이", parts: CATF({
    fur: "#F7EBD6", fluff: true, eye: "#D9822B", nose: "#DE9AA2", blush: "#F2BDB2", ear: "#EBD9BC" }) },
  { id: "scottish", name: "스코티시폴드", group: "고양이", parts: CATF({
    fur: "#C2BCB4", flatEars: true, ear: "#ADA79F", eye: "#D99A2B", nose: "#DFA3A8",
    marks: [P(29, 24, 7, 11, "#A39C94", "999px"), P(64, 24, 7, 11, "#A39C94", "999px")] }) },
  { id: "ragdoll", name: "랙돌", group: "고양이", parts: CATF({
    fur: "#FFF7EE", ear: "#C7A794", fluff: true, eye: "#5B8DEF", nose: "#E3A8B4", blush: "#F7C3C6",
    marks: [P(26, 56, 48, 38, "#F0DFCC", "50%")] }) },
  { id: "bengal", name: "벵갈", group: "고양이", parts: CATF({
    fur: "#EDBB68", ear: "#CE9243", nose: "#D9848C",
    marks: [P(17, 26, 12, 10, "#8A5A2E", "50%"), P(71, 28, 12, 10, "#8A5A2E", "50%"),
      P(34, 20, 11, 9, "#8A5A2E", "50%"), P(55, 20, 11, 9, "#8A5A2E", "50%")] }) },
  { id: "munchkin", name: "먼치킨", group: "고양이", parts: CATF({
    fur: "#EDE2CE", ear: "#DBCBB2", nose: "#E3A0AC", blush: "#F2B4BC",
    marks: [P(23, 26, 9, 9, "#D6C8AE", "50%"), P(68, 26, 9, 9, "#D6C8AE", "50%")] }) },

  /* ---------- 과일 7종 ---------- */
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
  { id: "banana", name: "바나나", group: "과일", parts: [
    P(14, 12, 70, 70, "radial-gradient(circle at 24% 24%,transparent 0 55%,#FFC93C 55.5% 100%)", "50%", null, 24),
    P(20, 66, 15, 13, "#8A5A3B", "3px", null, 24), P(70, 16, 13, 12, "#8A5A3B", "3px", null, 24)] },

  /* ---------- 채소 · 간식 8종 (모두 얼굴 있음) ---------- */
  { id: "potato", name: "감자", group: "채소 · 간식", parts: [].concat([
    P(8, 26, 84, 52, "#D9A96B", "50%", null, -10),
    P(22, 34, 8, 8, "#B5854A", "50%"), P(70, 44, 7, 7, "#B5854A", "50%")],
    EYES(30, 58, 42, 13, 15), BLUSH(20, 66, 60, 14, 8, "#E8A88C"),
    [P(45, 60, 10, 6, "#B5854A", "0 0 999px 999px")]) },
  { id: "tomato", name: "토마토", group: "채소 · 간식", parts: [].concat([
    P(14, 26, 72, 66, "#FF4B3E", "50%"),
    P(32, 12, 36, 20, "#3FA86B", LEAF), P(47, 6, 6, 14, "#3FA86B", "3px")],
    EYES(29, 57, 44, 14, 16), BLUSH(19, 67, 64, 15, 8, "#FF8F80"),
    [P(45, 64, 10, 6, "#B03328", "0 0 999px 999px")]) },
  { id: "carrot", name: "당근", group: "채소 · 간식", parts: [].concat([
    P(24, 28, 52, 66, "#FF8A3C", "0", TRI),
    P(36, 62, 28, 5, "#E8712A", "3px"), P(42, 76, 16, 5, "#E8712A", "3px"),
    P(24, 2, 18, 28, "#3FA86B", LEAF, null, -22),
    P(42, 0, 18, 28, "#5FBF84", LEAF),
    P(58, 2, 18, 28, "#3FA86B", LEAF, null, 22)],
    EYES(32, 54, 40, 12, 14), BLUSH(24, 62, 55, 12, 7, "#FFB08A")) },
  { id: "corn", name: "옥수수", group: "채소 · 간식", parts: [].concat([
    P(8, 38, 26, 50, "#5FBF84", "50% 10% 50% 10%", null, -12),
    P(66, 38, 26, 50, "#5FBF84", "10% 50% 10% 50%", null, 12),
    P(28, 12, 44, 78, "#FFC93C", "50% 50% 40% 40%/36% 36% 50% 50%"),
    P(34, 22, 4, 12, "#F0AE2E", "3px"), P(62, 22, 4, 12, "#F0AE2E", "3px")],
    EYES(32, 56, 42, 13, 15), BLUSH(24, 64, 62, 13, 7, "#F5A66A"),
    [P(45, 62, 10, 6, "#D9891E", "0 0 999px 999px")]) },
  { id: "eggfry", name: "달걀후라이", group: "채소 · 간식", parts: [].concat([
    P(4, 18, 92, 66, "#FFF1D8", "48% 56% 44% 52%/52% 44% 56% 48%"),
    P(30, 32, 40, 40, "#FFC93C", "50%")],
    EYES(37, 53, 42, 11, 13), BLUSH(31, 61, 58, 9, 6, "#F5A66A")) },
  { id: "broccoli", name: "브로콜리", group: "채소 · 간식", parts: [].concat([
    P(40, 56, 20, 40, "#BFD8A0", "6px 6px 10px 10px"),
    P(10, 18, 34, 32, "#3E8E52", "50%"), P(34, 8, 32, 32, "#4A9E5C", "50%"), P(56, 18, 34, 32, "#3E8E52", "50%"),
    P(20, 34, 30, 28, "#4A9E5C", "50%"), P(50, 34, 30, 28, "#57A868", "50%")],
    EYES(31, 55, 38, 13, 15), BLUSH(22, 64, 56, 13, 7, "#8FBF84")) },
  { id: "eggplant", name: "가지", group: "채소 · 간식", parts: [].concat([
    P(22, 26, 56, 66, "#7B5AA8", "50% 50% 46% 46%/38% 38% 62% 62%"),
    P(30, 36, 13, 8, "#9B7CC4", "999px", null, -20),
    P(28, 10, 44, 22, "#4E8E56", LEAF), P(46, 4, 8, 14, "#3E7A46", "3px")],
    EYES(30, 56, 48, 14, 16, "#FFF6EA"),
    [P(34, 52, 7, 8, "#3A2E3F", "50%"), P(60, 52, 7, 8, "#3A2E3F", "50%")],
    BLUSH(21, 67, 68, 13, 7, "#B884C4")) },
  { id: "pea", name: "완두콩", group: "채소 · 간식", parts: [].concat([
    P(4, 32, 92, 44, "#4FAF72", "999px", null, -6),
    P(14, 38, 24, 24, "#7FD09A", "50%"), P(38, 34, 24, 24, "#8FD9A6", "50%"), P(62, 38, 24, 24, "#7FD09A", "50%")],
    EYES(43, 53, 42, 8, 10), BLUSH(38, 58, 52, 7, 5, "#9FE0B0")) },

  /* ---------- 디저트 8종 ---------- */
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
  { id: "macaron", name: "마카롱", group: "디저트", parts: [
    P(12, 20, 76, 32, "#FFA3C6", "999px 999px 8px 8px"),
    P(14, 47, 72, 13, "#FFE08A", "3px"),
    P(12, 56, 76, 30, "#FF7FAE", "8px 8px 999px 999px")] },
  { id: "pudding", name: "푸딩", group: "디저트", parts: [
    P(26, 14, 48, 16, "#C98A3C", "999px 999px 4px 4px"),
    P(16, 26, 68, 54, "#FFD98A", "6px 6px 42% 42%"),
    P(30, 34, 18, 8, "#FFEFC4", "999px", null, -14),
    P(8, 78, 84, 11, "#FFF1D8", "999px")] },

  /* ---------- 꽃 · 식물 5종 ---------- */
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

  /* ---------- 하늘 · 마음 7종 ---------- */
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
    P(48, 72, 4, 26, "#B79A90", "2px"), P(34, 20, 12, 8, "#FF8E7A", "999px", null, -25)] },

  /* ---------- 사물 7종 ---------- */
  { id: "pencil", name: "연필", group: "사물", parts: [
    P(33, 4, 34, 14, "#FF7FAE", "6px 6px 2px 2px"), P(31, 17, 38, 10, "#8FD9EE", "2px"),
    P(31, 26, 38, 54, "#FFC93C", "2px"), P(44, 26, 6, 54, "#F0AE2E", "0"),
    P(31, 79, 38, 15, "#E8B98A", "0", TRI),
    P(44, 88, 12, 8, "#4A3A2C", "0", TRI)] },
  { id: "eraser", name: "지우개", group: "사물", parts: [
    P(12, 30, 76, 42, "#FF9FBE", "7px"), P(12, 44, 76, 15, "#FFF6EA", "0"),
    P(12, 59, 76, 13, "#F586A9", "0 0 7px 7px"),
    P(20, 34, 20, 6, "#FFC2D4", "999px")] },
  { id: "book", name: "공책", group: "사물", parts: [
    P(18, 12, 64, 74, "#5B8DEF", "4px 9px 9px 4px"),
    P(28, 17, 52, 64, "#FFF6EA", "2px 7px 7px 2px"),
    P(36, 30, 34, 5, "#C9D8F5", "3px"), P(36, 44, 34, 5, "#C9D8F5", "3px"), P(36, 58, 24, 5, "#C9D8F5", "3px"),
    P(19, 22, 11, 8, "#FFC93C", "3px"), P(19, 44, 11, 8, "#FFC93C", "3px"), P(19, 66, 11, 8, "#FFC93C", "3px")] },
  { id: "clock", name: "시계", group: "사물", parts: [
    P(44, 2, 12, 11, "#6EC7E4", "4px"),
    P(9, 12, 82, 82, "#8FD9EE", "50%"), P(18, 20, 64, 66, "#FFF6EA", "50%"),
    P(47, 32, 6, 24, "#2F2A33", "3px"), P(50, 50, 22, 6, "#2F2A33", "3px")] },
  { id: "umbrella", name: "우산", group: "사물", parts: [
    P(6, 20, 88, 42, "#FF5B3E", "999px 999px 0 0"),
    P(36, 20, 28, 42, "#FF8073", "999px 999px 0 0"),
    P(47, 58, 6, 30, "#8A5A3B", "3px"),
    P(33, 80, 20, 11, "#8A5A3B", "0 0 999px 999px"),
    P(45, 12, 10, 10, "#FFC93C", "50%")] },
  { id: "mug", name: "머그컵", group: "사물", parts: [
    P(18, 30, 48, 58, "#8FD9EE", "7px 7px 42% 42%"),
    P(60, 40, 30, 30, "radial-gradient(circle at 50% 50%,transparent 0 38%,#6EC7E4 38.5% 100%)", "50%"),
    P(22, 34, 40, 11, "#6B4A2F", "3px"),
    P(28, 8, 6, 18, "#DCE7EC", "3px", null, -16), P(44, 4, 6, 20, "#DCE7EC", "3px", null, 12)] },
  { id: "sock", name: "양말", group: "사물", parts: [
    P(32, 8, 34, 12, "#FFC93C", "4px"),
    P(34, 19, 30, 46, "#FF7FAE", "4px 4px 0 0"),
    P(12, 58, 52, 30, "#FF7FAE", "999px 6px 12px 999px"),
    P(12, 66, 52, 8, "#FFA3C6", "0")] }
];

/** 초등(둘째) 기본 8종 */
export const PICK_CUTE = ["cheese", "berry", "star", "tomato", "rainbow", "heart", "icecream", "clover"];
/** 중학생(첫째) 기본 8종 — 차분한 것들 */
export const PICK_CALM = ["russian", "scottish", "moon", "cloud", "clover", "book", "mug", "lemon"];

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
