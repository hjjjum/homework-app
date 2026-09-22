/* ---------------------------------------------------------------------------
 * stickers.js — 스티커 50종 (SVG 조각, 이미지 파일 없음)
 *   import { STICKERS, GROUPS, createSticker } from "./stickers.js";
 *   box.appendChild(createSticker("cheese", 46));   // 46px 치즈태비
 *
 * 그림 톤: 동글동글한 낙서풍 — 따뜻한 갈색 테두리 + 파스텔 면 + 점 눈·볼터치.
 * 동물은 큰 머리에 작은 몸이 앉아 있는 모양(`ANIMAL`)으로 통일하고, 해·달·별·구름처럼
 * 원래 캐릭터로 그리는 것에만 얼굴을 붙인다. 먹을 것·물건은 **그 물건처럼 보이는 것**이 먼저다.
 *
 * 한 스티커의 `svg`는 viewBox 0 0 100 100 안의 SVG 조각이다.
 * SVG 안에서 id가 필요한 것(gradient, clipPath, mask)은 쓰지 않는다 —
 * 같은 스티커가 한 화면에 여러 번 그려지면 id가 겹친다.
 *
 * **id는 바꾸지 않는다.** 받은 스티커(기기)와 프로필 아이콘(Firestore)이 id로 가리킨다.
 * 스티커를 빼면 `RETIRED`에 비슷한 스티커를 적어 둔다 — 예전에 받은 것이 그걸로 보인다.
 * 미리 보기: tools/sticker-sheet.html
 * --------------------------------------------------------------------------- */

/* ---------- 팔레트 ---------- */
const INK = "#4A3A35";
const WHITE = "#FFFFFF", CREAM = "#FFF8EE", GRAY = "#E2DEE3", GRAY2 = "#BDB6BD";
const PINK = "#FAC6D3", PINK2 = "#F4A0B6", HEART = "#F27C9C";
const RED = "#F0707C", RED2 = "#F7939D";
const LAV = "#D2CCF1", LAV2 = "#B0A7E4";
const MINT = "#C6EAD1", MINT2 = "#97D1A9";
const LEAF = "#A3D4A5", LEAF2 = "#7FBC8A";
const SKY = "#C4DFF5", SKY2 = "#9AC5EC";
const BUTTER = "#FBE08C", BUTTER2 = "#F2C75C";
const PEACH = "#FCD3B8", ORANGE = "#F8B074";
const BROWN = "#D9AE88", BROWN2 = "#AE8262";

/* ---------- SVG 그리기 도구 (좌표는 0~100) ---------- */
const n = (v) => Math.round(v * 10) / 10;
/** 테두리 있는 면 */
const o = (fill, w = 2.4) =>
  `fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/** 테두리 없는 면 */
const f = (fill, op) => `fill="${fill}"` + (op ? ` opacity="${op}"` : "");
/** 선 */
const ln = (c = INK, w = 2.4) =>
  `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const rot = (deg, x, y) => (deg ? ` transform="rotate(${deg} ${x} ${y})"` : "");
const C = (cx, cy, r, a) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a}/>`;
const E = (cx, cy, rx, ry, a, deg) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${a}${rot(deg, cx, cy)}/>`;
const R = (x, y, w, h, rx, a, deg) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${a}${rot(deg, x + w / 2, y + h / 2)}/>`;
const D = (d, a) => `<path d="${d}" ${a}/>`;
const G = (t, ...kids) => `<g transform="${t}">${kids.join("")}</g>`;
/** 반짝이는 하이라이트 */
const SHINE = (cx, cy, rx, ry, deg) => E(cx, cy, rx, ry, f(WHITE, 0.8), deg);
/** 테두리 있는 굵은 선 (줄기·손잡이·빨대·꼬리) */
const TUBE = (d, color, w = 3) => D(d, ln(INK, w + 3)) + D(d, ln(color, w));
/** 원 여러 개를 하나로 합친 덩어리 — 바깥 테두리만 남는다 (구름·나뭇잎·생크림) */
const BLOB = (circles, fill) =>
  circles.map(([x, y, r]) => C(x, y, r, `fill="${INK}" stroke="${INK}" stroke-width="4.8"`)).join("") +
  circles.map(([x, y, r]) => C(x, y, r, f(fill))).join("");
/** 원을 path 로 (evenodd 구멍용) */
const CIRC = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
/** 가장자리가 물결치는 원 */
const WAVY = (cx, cy, r, amp, k) => {
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const rr = r + amp * Math.sin(k * a);
    pts.push(n(cx + rr * Math.cos(a)) + " " + n(cy + rr * Math.sin(a)));
  }
  return "M" + pts.join("L") + "Z";
};
/** 꼭짓점 다섯 개 별 */
const STAR = (cx, cy, R1, r1) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r1 : R1;
    pts.push(n(cx + rr * Math.cos(a)) + " " + n(cy + rr * Math.sin(a)));
  }
  return "M" + pts.join("L") + "Z";
};
/** 반짝 (네 갈래) */
const SPARK = (cx, cy, s) =>
  `M${cx} ${cy - s}Q${n(cx + s * 0.15)} ${n(cy - s * 0.15)} ${cx + s} ${cy}Q${n(cx + s * 0.15)} ${n(cy + s * 0.15)} ${cx} ${cy + s}` +
  `Q${n(cx - s * 0.15)} ${n(cy + s * 0.15)} ${cx - s} ${cy}Q${n(cx - s * 0.15)} ${n(cy - s * 0.15)} ${cx} ${cy - s}Z`;
/** 큰 원(1)에서 작은 원(2)을 파낸 초승달 */
const CRESCENT = (x1, y1, r1, x2, y2, r2) => {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - a * a);
  const bx = x1 + (a * dx) / d, by = y1 + (a * dy) / d;
  const p1 = [n(bx - (h * dy) / d), n(by + (h * dx) / d)], p2 = [n(bx + (h * dy) / d), n(by - (h * dx) / d)];
  return `M${p1[0]} ${p1[1]}A${r1} ${r1} 0 1 1 ${p2[0]} ${p2[1]}A${r2} ${r2} 0 1 0 ${p1[0]} ${p1[1]}Z`;
};
/** 옥수수 알갱이 — 속대(타원) 모양 안에 엇갈려 채운다 */
const KERNELS = (cx, cy, rx, ry) => {
  let out = "";
  let row = 0;
  for (let y = cy - ry + 7; y <= cy + ry - 5; y += 6, row++) {
    const hw = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 3.2;
    for (let x = cx - 12.4 + (row % 2) * 3.1; x <= cx + 12.4; x += 6.2) {
      if (Math.abs(x - cx) > hw) continue;
      out += R(n(x - 2.7), n(y - 2.6), 5.4, 5.2, 2, `fill="#FDEDB0" stroke="#DDB24A" stroke-width=".9"`);
    }
  }
  return out;
};
/** 작은 하트 */
const HEARTP = (x, y, s = 1) =>
  `M${x} ${n(y + 5 * s)}C${n(x - 5 * s)} ${n(y + 2 * s)} ${n(x - 6.5 * s)} ${n(y - s)} ${n(x - 5.5 * s)} ${n(y - 3.5 * s)}` +
  `C${n(x - 4.5 * s)} ${n(y - 6 * s)} ${n(x - 1.5 * s)} ${n(y - 6.5 * s)} ${x} ${n(y - 3.5 * s)}` +
  `C${n(x + 1.5 * s)} ${n(y - 6.5 * s)} ${n(x + 4.5 * s)} ${n(y - 6 * s)} ${n(x + 5.5 * s)} ${n(y - 3.5 * s)}` +
  `C${n(x + 6.5 * s)} ${n(y - s)} ${n(x + 5 * s)} ${n(y + 2 * s)} ${x} ${n(y + 5 * s)}Z`;
const H = (x, y, s = 1) => D(HEARTP(x, y, s), o(HEART, 1.7));
/** 테두리 있는 반짝이 */
const SP = (x, y, s = 5, c = BUTTER) => D(SPARK(x, y, s), o(c, 1.5));

/* ---------- 얼굴 ---------- */
const EYE = (x, y, r = 3) => C(x, y, r, f(INK)) + C(n(x - r * 0.3), n(y - r * 0.4), n(r * 0.38), f(WHITE));
/** 색 있는 눈 (어두운 털 위, 고양이 눈 색) */
const EYEC = (x, y, c) => C(x, y, 3.8, o(c, 1.3)) + C(x, y + 0.3, 2, f(INK)) + C(x - 1, y - 1.2, 0.9, f(WHITE));
const CHEEK = (x, y, c = PINK2) => E(x, y, 4.4, 2.7, f(c, 0.75));
/** 점 눈 + 작은 웃는 입 + 볼터치 */
const FACE = (cx, cy, gap = 10, r = 3) =>
  EYE(cx - gap, cy, r) + EYE(cx + gap, cy, r) +
  D(`M${cx - 3} ${cy + 4}Q${cx} ${cy + 7} ${cx + 3} ${cy + 4}`, ln(INK, 1.8)) +
  CHEEK(cx - gap - 5, cy + 5) + CHEEK(cx + gap + 5, cy + 5);
/** 고양이 입 (코 + w) + 수염 */
const CATMOUTH = (nose = PINK2) =>
  D("M47.5 51L52.5 51L50 53.5Z", o(nose, 1.1)) +
  D("M50 53.5Q48 57 45 55.5M50 53.5Q52 57 55 55.5", ln(INK, 1.6)) +
  D("M28 50L18 48.5M28 54L18.5 55.5M72 50L82 48.5M72 54L81.5 55.5", ln(INK, 1.2));

/* ---------- 앉아 있는 동물 ---------- */
const HEAD = [50, 44, 29, 25];
/**
 * 큰 머리 + 작은 몸 + 앞발 + 뒷발.
 * back: 몸 뒤(꼬리), ears: 머리 뒤(귀), marks: 머리 무늬(머리 안쪽), face: 얼굴, front: 맨 앞(안고 있는 것)
 */
const ANIMAL = (a) => [
  a.back || "",
  a.ears || "",
  E(40, 90.5, 7.5, 4.5, o(a.feet || a.fur)), E(60, 90.5, 7.5, 4.5, o(a.feet || a.fur)),
  E(50, 76, 21, 17, o(a.body || a.fur)),
  a.belly ? E(50, 80, 11, 8.5, f(a.belly)) : "",
  E(41.5, 74, 5, 4, o(a.paws || a.fur, 2)), E(58.5, 74, 5, 4, o(a.paws || a.fur, 2)),
  E(...HEAD, f(a.fur)),
  a.marks || "",
  E(...HEAD, ln()),
  a.face,
  a.front || ""
].join("");
/** 고양이 귀 — 왼쪽/오른쪽 색을 따로 줄 수 있다(삼색이) */
const CAT_EARS = (l, r = l, inner = PINK) =>
  D("M24 34L25 11L43 23Z", o(l)) + D("M76 34L75 11L57 23Z", o(r)) +
  D("M28 28L28.5 17L37 23Z", f(inner)) + D("M72 28L71.5 17L63 23Z", f(inner));
const CAT_TAIL = (fur) => TUBE("M68 86Q88 88 87 72Q86 64 80 62", fur, 5.4);
const CAT = (fur, c = {}) => ANIMAL({
  fur, body: c.body, belly: c.belly, paws: c.paws, feet: c.paws,
  back: CAT_TAIL(c.tail || fur),
  ears: CAT_EARS(c.earL || fur, c.earR || c.earL || fur, c.inner),
  marks: c.marks,
  face: (c.eye ? EYEC(40, 45, c.eye) + EYEC(60, 45, c.eye) : EYE(40, 45) + EYE(60, 45)) +
    CATMOUTH(c.nose) + CHEEK(33, 53) + CHEEK(67, 53)
});
const BEAR_EARS = (fur, inner) => C(27, 24, 9, o(fur)) + C(73, 24, 9, o(fur)) + C(27, 24, 4.5, f(inner)) + C(73, 24, 4.5, f(inner));

export const GROUPS = ["고양이", "동물", "과일 · 채소", "간식", "하늘 · 마음", "학용품 · 물건", "꽃 · 나무"];

export const STICKERS = [
  /* ---------- 고양이 4종 ---------- */
  { id: "cheese", name: "치즈태비", group: "고양이", svg: CAT("#F9CD93", {
    belly: CREAM,
    marks: D("M44 21.5L45 29M50 19.5L50 29M56 21.5L55 29M22 42L28 43M22 47L27.5 47M78 42L72 43M78 47L72.5 47",
      ln("#E6A060", 2.6)) }) },
  { id: "calico", name: "삼색이", group: "고양이", svg: CAT("#FFFAF3", {
    earL: "#F7BE82", earR: "#8E8487", tail: "#F7BE82",
    marks: E(34, 33, 10, 8, f("#F7BE82")) + E(66, 32, 9, 7, f("#8E8487")) }) },
  { id: "tuxedo", name: "턱시도", group: "고양이", svg: CAT("#5E5559", {
    eye: BUTTER, inner: "#C99BA6", belly: CREAM, paws: CREAM,
    marks: E(50, 55, 13, 9.5, f(CREAM)) }) },
  { id: "russian", name: "러시안블루", group: "고양이", svg: CAT("#BCCAD9", {
    eye: "#A6DB9E", inner: "#E6C6CE", nose: "#D99AAA", belly: "#DCE5EE" }) },

  /* ---------- 동물 8종 ---------- */
  { id: "bear", name: "곰", group: "동물", svg: ANIMAL({
    fur: "#EBCBA8", belly: CREAM,
    ears: BEAR_EARS("#EBCBA8", PINK),
    marks: E(50, 54, 9, 7, f(CREAM)),
    face: EYE(38, 45) + EYE(62, 45) + E(50, 51, 3.4, 2.4, f(INK)) +
      D("M50 53.4L50 55.5M46.5 56Q50 58.5 53.5 56", ln(INK, 1.6)) + CHEEK(31, 53) + CHEEK(69, 53),
    front: H(50, 76, 1.2) }) },
  { id: "bunny", name: "토끼", group: "동물", svg: ANIMAL({
    fur: WHITE, belly: PINK,
    ears: E(38, 18, 7, 15, o(WHITE), -8) + E(62, 18, 7, 15, o(WHITE), 8) +
      E(38, 18.5, 3.2, 10, f(PINK), -8) + E(62, 18.5, 3.2, 10, f(PINK), 8),
    face: EYE(39, 45) + EYE(61, 45) + D("M47.5 50L52.5 50L50 52.5Z", o(PINK2, 1.1)) +
      D("M50 52.5Q48 56 45 54.5M50 52.5Q52 56 55 54.5", ln(INK, 1.6)) + CHEEK(32, 53) + CHEEK(68, 53) }) },
  { id: "puppy", name: "강아지", group: "동물", svg: ANIMAL({
    fur: WHITE, feet: WHITE,
    back: TUBE("M68 82Q80 80 82 70", BROWN, 4.4),
    marks: E(63, 42, 8.5, 8, f("#EFCFAE")),
    face: EYE(39, 45) + EYE(61, 45) + E(50, 51, 3.8, 2.7, f(INK)) +
      D("M50 53.7Q47.5 57 45 55.5M50 53.7Q52.5 57 55 55.5", ln(INK, 1.6)) + CHEEK(32, 53) + CHEEK(68, 53),
    front: E(24, 44, 7.5, 13, o(BROWN), 18) + E(76, 44, 7.5, 13, o(BROWN), -18) }) },
  { id: "panda", name: "판다", group: "동물", svg: ANIMAL({
    fur: WHITE, paws: "#554B4F", feet: "#554B4F",
    ears: C(27, 24, 9, o("#554B4F")) + C(73, 24, 9, o("#554B4F")),
    marks: E(38, 45, 6.5, 8, f("#554B4F"), -30) + E(62, 45, 6.5, 8, f("#554B4F"), 30),
    face: C(38.5, 44.5, 2.6, f(WHITE)) + C(61.5, 44.5, 2.6, f(WHITE)) + C(38.8, 45, 1.4, f(INK)) + C(61.2, 45, 1.4, f(INK)) +
      E(50, 51, 3.4, 2.4, f(INK)) + D("M46.5 55Q50 57.5 53.5 55", ln(INK, 1.6)) + CHEEK(28, 54) + CHEEK(72, 54),
    front: E(64, 72, 3, 5, o(LEAF, 1.4), 30) + E(60, 70, 3, 5, o(LEAF, 1.4), -10) }) },
  { id: "chick", name: "병아리", group: "동물", svg: [
    E(40, 90, 7, 4, o(ORANGE)), E(60, 90, 7, 4, o(ORANGE)),
    D("M47 22Q43 10 50 10Q48 17 55 12Q55 19 52 22Z", o(BUTTER)),
    E(50, 57, 31, 32, o(BUTTER)),
    D("M20 60Q12 66 18 74Q24 72 24 64Z", o(BUTTER2, 2)), D("M80 60Q88 66 82 74Q76 72 76 64Z", o(BUTTER2, 2)),
    EYE(40, 50), EYE(60, 50),
    D("M45.5 55L54.5 55L50 61Z", o(ORANGE, 1.8)),
    CHEEK(31, 59, "#F9B38E"), CHEEK(69, 59, "#F9B38E")].join("") },
  { id: "penguin", name: "펭귄", group: "동물", svg: [
    E(40, 91, 8, 4, o(ORANGE)), E(60, 91, 8, 4, o(ORANGE)),
    E(21, 62, 6, 15, o("#8FA8D4"), 18), E(79, 62, 6, 15, o("#8FA8D4"), -18),
    D("M50 10C29 10 21 30 21 52C21 76 32 90 50 90C68 90 79 76 79 52C79 30 71 10 50 10Z", o("#8FA8D4")),
    D("M50 30C44 23 30 25 30 39C30 50 35 57 35 68C37 81 43 86 50 86C57 86 63 81 65 68C65 57 70 50 70 39C70 25 56 23 50 30Z",
      o(WHITE, 1.6)),
    EYE(41, 42), EYE(59, 42),
    D("M45.5 47.5L54.5 47.5L50 53Z", o(ORANGE, 1.6)),
    CHEEK(35, 51), CHEEK(65, 51)].join("") },
  { id: "hamster", name: "햄스터", group: "동물", svg: [
    C(27, 24, 8, o("#F4C597")), C(73, 24, 8, o("#F4C597")), C(27, 24, 4, f(PINK)), C(73, 24, 4, f(PINK)),
    E(40, 90, 7, 4, o(PINK)), E(60, 90, 7, 4, o(PINK)),
    D("M50 16C28 16 15 34 15 56C15 78 30 90 50 90C70 90 85 78 85 56C85 34 72 16 50 16Z", f("#F4C597")),
    D("M50 42C38 42 30 52 30 64C30 78 40 88 50 88C60 88 70 78 70 64C70 52 62 42 50 42Z", f(CREAM)),
    E(34, 50, 8, 6, f(CREAM)), E(66, 50, 8, 6, f(CREAM)),
    D("M50 16C28 16 15 34 15 56C15 78 30 90 50 90C70 90 85 78 85 56C85 34 72 16 50 16Z", ln()),
    EYE(39, 42), EYE(61, 42),
    D("M47.5 47L52.5 47L50 49.5Z", o(PINK2, 1.1)), D("M50 49.5Q48 53 45 51.5M50 49.5Q52 53 55 51.5", ln(INK, 1.6)),
    CHEEK(30, 52), CHEEK(70, 52),
    E(50, 66, 6, 4.5, o(BROWN, 1.6)), D("M47 66L53 66", ln(BROWN2, 1.2)),
    E(43, 66, 4, 3.4, o(PINK, 1.6)), E(57, 66, 4, 3.4, o(PINK, 1.6))].join("") },
  { id: "dino", name: "공룡", group: "동물", svg: ANIMAL({
    fur: "#AEDBA6", belly: "#E8F4C9",
    back: D("M66 82Q90 86 92 68Q84 76 68 72Z", o("#AEDBA6")) + D("M70 72L74 64L78 72M80 72L85 64L87 70", o(LEAF2, 1.8)),
    ears: D("M34 24L37 12L45 21Z", o(LEAF2, 2)) + D("M45 20L50 8L55 20Z", o(LEAF2, 2)) + D("M55 21L63 12L66 24Z", o(LEAF2, 2)),
    face: FACE(50, 45, 10) + C(44, 30, 1.2, f(LEAF2)) + C(56, 30, 1.2, f(LEAF2)) }) },

  /* ---------- 과일 · 채소 6종 ---------- */
  { id: "berry", name: "딸기", group: "과일 · 채소", svg: [
    TUBE("M50 30Q50 18 55 11", LEAF2, 2.6),
    D("M50 90C30 84 15 64 17 46C19 32 34 27 50 33C66 27 81 32 83 46C85 64 70 84 50 90Z", o(RED)),
    ...[[33, 47], [50, 45], [67, 47], [41, 59], [59, 59], [30, 60], [70, 61], [50, 71], [40, 74], [60, 74], [50, 82]]
      .map(([x, y]) => E(x, y, 1.6, 2.5, f(BUTTER))),
    SHINE(28, 45, 3, 6, 20),
    D("M27 37Q36 24 45 32L50 22L55 32Q64 24 73 37Q62 36 57 41Q50 35 43 41Q38 36 27 37Z", o(LEAF))].join("") },
  { id: "cherry", name: "체리", group: "과일 · 채소", svg: [
    TUBE("M33 57Q38 32 58 14", LEAF2, 2.4),
    TUBE("M67 55Q64 32 58 14", LEAF2, 2.4),
    D("M58 14Q70 3 85 9Q75 22 58 14Z", o(LEAF)), D("M61 14Q71 11 80 10", ln(LEAF2, 1.4)),
    C(33, 70, 17, o(RED)), C(67, 68, 16, o(RED)),
    SHINE(27, 64, 3.4, 5.5, 30), SHINE(61, 62, 3, 5, 30)].join("") },
  { id: "apple", name: "사과", group: "과일 · 채소", svg: [
    TUBE("M50 30Q49 20 54 11", BROWN2, 2.6),
    D("M50 30C40 21 16 23 16 50C16 73 33 91 50 85C67 91 84 73 84 50C84 23 60 21 50 30Z", o(RED)),
    SHINE(30, 44, 4, 8, 20),
    D("M54 20Q64 7 79 13Q69 26 54 20Z", o(LEAF)), D("M57 19Q67 15 75 14", ln(LEAF2, 1.4))].join("") },
  { id: "watermelon", name: "수박", group: "과일 · 채소", svg: G("rotate(-10 50 55)",
    D("M8 42A42 42 0 0 0 92 42Z", o(LEAF2)),
    D("M13.5 42A36.5 36.5 0 0 0 86.5 42Z", f("#EAF6DC")),
    D("M18 42A32 32 0 0 0 82 42Z", f(RED2)),
    D("M8 42L92 42", ln()),
    ...[[34, 52, 20], [50, 56, 0], [66, 52, -20], [42, 65, 12], [58, 65, -12], [50, 47, 0]]
      .map(([x, y, a]) => E(x, y, 1.8, 3, f(INK), a))) },
  { id: "avocado", name: "아보카도", group: "과일 · 채소", svg: [
    D("M50 8C34 8 29 28 26 44C21 70 32 92 50 92C68 92 79 70 74 44C71 28 66 8 50 8Z", o(LEAF2)),
    G("translate(50 56) scale(.84) translate(-50 -56)",
      D("M50 8C34 8 29 28 26 44C21 70 32 92 50 92C68 92 79 70 74 44C71 28 66 8 50 8Z", f("#E3F2B8"))),
    C(50, 68, 13, o(BROWN2)), SHINE(45, 63, 3, 2, -30),
    FACE(50, 40, 8, 2.6)].join("") },
  { id: "corn", name: "옥수수", group: "과일 · 채소", svg: [
    D("M50 9Q46 2 41 4M50 9Q54 1 59 3M50 9Q50 3 50 0", ln(BROWN, 1.8)),
    E(50, 45, 18, 37, o(BUTTER)),
    KERNELS(50, 45, 18, 37),
    D("M48 95C27 91 17 64 24 36C30 55 38 69 51 79Z", o(LEAF)),
    D("M52 95C73 91 83 64 76 36C70 55 62 69 49 79Z", o(MINT2)),
    D("M43 88C34 80 29 66 27 50M57 88C66 80 71 66 73 50", ln(LEAF2, 1.4))].join("") },

  /* ---------- 간식 7종 ---------- */
  { id: "icecream", name: "아이스크림", group: "간식", svg: [
    D("M30 54L70 54L50 95Z", o("#F1CF9F")),
    D("M42 54L36 66.3M54 54L42 78.6M66 54L48 90.9M58 54L64 66.3M46 54L58 78.6M34 54L52 90.9", ln("#D6A872", 1.5)),
    D("M26 56C22 36 36 28 50 28C64 28 78 36 74 56Q70 62 66 56Q62 63 58 56Q54 63 50 56Q46 63 42 56Q38 63 34 56Q30 62 26 56Z",
      o(PINK)),
    D("M32 36C30 18 42 12 50 12C58 12 70 18 68 36Q64 41 60 36Q55 42 50 36Q45 42 40 36Q36 41 32 36Z", o(MINT)),
    ...[[36, 46, 30, WHITE], [48, 50, -20, BUTTER2], [62, 45, 60, SKY2], [44, 40, 80, WHITE]]
      .map(([x, y, a, c]) => R(x, y, 2.4, 6, 1.2, f(c), a)),
    SHINE(40, 20, 4, 2.4, -30),
    TUBE("M55 6Q58 1 64 0", LEAF2, 1.8),
    C(54, 11, 5.5, o(RED))].join("") },
  { id: "juice", name: "버블티", group: "간식", svg: [
    TUBE("M60 2L54 30", PINK2, 5),
    D("M28 32L72 32L66 92L34 92Z", o("#F3E1CE")),
    D("M34 36L38 86", ln(WHITE, 3) + ` opacity=".7"`),
    ...[[40, 86], [48, 87], [56, 86], [62, 84], [37, 80], [45, 80], [53, 81], [60, 78], [42, 74], [50, 74], [57, 72]]
      .map(([x, y]) => C(x, y, 3.4, f("#6B5048"))),
    D("M26 32Q50 14 74 32Z", o(WHITE)),
    R(23, 29, 54, 6, 3, o(WHITE)),
    H(50, 56, 1.1)].join("") },
  { id: "cake", name: "조각 케이크", group: "간식", svg: [
    D("M74 46L88 36L88 76L74 86Z", o("#F6DDB0")),
    D("M18 46L40 32L88 36L74 46Z", o(WHITE)),
    D("M18 46L74 46L74 86L18 86Z", f("#FCE8C2")),
    R(18, 60, 56, 7, 0, f(PINK)),
    D("M18 60L74 60M18 67L74 67", ln(INK, 1.6)),
    D("M74 58L88 50M74 64L88 56", ln(PINK2, 1.6)),
    D("M18 46L74 46L74 86L18 86Z", ln()),
    D("M18 46Q22 52 26 46Q30 52 34 46Q38 52 42 46Q46 52 50 46Q54 52 58 46Q62 52 66 46Q70 52 74 46", o(WHITE, 1.8)),
    TUBE("M58 24Q60 18 65 17", LEAF2, 1.8),
    D("M58 38C50 36 49 28 52 24C54 21 57 22 58 24C59 22 62 21 64 24C67 28 66 36 58 38Z", o(RED)),
    E(56, 29, 0.8, 1.2, f(BUTTER)), E(60, 32, 0.8, 1.2, f(BUTTER))].join("") },
  { id: "donut", name: "도넛", group: "간식", svg: [
    D(CIRC(50, 50, 38) + CIRC(50, 50, 12), o("#EDC396") + ` fill-rule="evenodd"`),
    D(WAVY(50, 50, 30.5, 2.4, 9) + CIRC(50, 50, 15), o(PINK) + ` fill-rule="evenodd"`),
    ...[[0.2, WHITE], [0.9, SKY2], [1.6, BUTTER2], [2.3, WHITE], [3.1, SKY2], [3.8, BUTTER2],
      [4.5, WHITE], [5.2, SKY2], [5.8, BUTTER2]].map(([a, c], i) =>
      R(n(50 + 23 * Math.cos(a) - 1.3), n(50 + 23 * Math.sin(a) - 3.5), 2.6, 7, 1.3, f(c), (i * 47) % 180)),
    SHINE(34, 30, 6, 2.6, -30)].join("") },
  { id: "pancake", name: "팬케이크", group: "간식", svg: [
    E(50, 86, 42, 8, o(SKY)),
    ...[74, 62, 50].map((y) => R(14, y, 72, 13, 6.5, o("#EFC085")) + D(`M20 ${y + 3.5}L80 ${y + 3.5}`, ln("#F8DDB0", 2))),
    D("M16 55Q14 47 50 46Q86 47 84 55Q82 60 79 56Q77 64 73 57Q68 60 64 56Q60 66 56 57Q50 60 44 56Q40 63 36 57Q30 60 27 56Q24 62 21 57Q18 60 16 55Z",
      o("#C98B57", 2)),
    R(42, 38, 16, 11, 3, o(BUTTER, 2)),
    TUBE("M66 34Q68 28 73 27", LEAF2, 1.6),
    D("M66 48C59 46 58 40 61 36C63 33 65 34 66 36C67 34 69 33 71 36C74 40 73 46 66 48Z", o(RED, 2))].join("") },
  { id: "cupcake", name: "머핀", group: "간식", svg: [
    D("M24 58L76 58L69 92L31 92Z", o(SKY)),
    D("M34 60L37 90M44 60L45 90M56 60L55 90M66 60L63 90", ln(SKY2, 1.8)),
    BLOB([[28, 55, 10], [42, 53, 11], [58, 53, 11], [72, 55, 10], [36, 43, 10], [50, 39, 12], [64, 43, 10], [50, 29, 8]], PINK),
    D("M30 55Q50 62 70 55M40 43Q50 47 60 43", ln(PINK2, 1.8)),
    ...[[32, 48, 30, WHITE], [46, 44, -30, BUTTER2], [62, 50, 50, SKY2], [56, 34, 10, WHITE]]
      .map(([x, y, a, c]) => R(x, y, 2.2, 5.5, 1.1, f(c), a)),
    TUBE("M51 13Q53 8 58 7", LEAF2, 1.8),
    C(50, 17, 6, o(RED)), SHINE(48, 15, 1.6, 1.1)].join("") },
  { id: "eggfry", name: "달걀후라이", group: "간식", svg: [
    D("M20 30C30 12 60 12 72 22C88 26 94 48 84 62C80 80 56 90 38 82C18 80 6 62 12 48C12 40 16 34 20 30Z", o(WHITE)),
    C(48, 50, 17, o("#FAD26A")),
    FACE(48, 49, 6.5, 2.4)].join("") },

  /* ---------- 하늘 · 마음 10종 ---------- */
  { id: "sun", name: "해님", group: "하늘 · 마음", svg: [
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return D(`M${n(50 + 31 * Math.cos(a))} ${n(50 + 31 * Math.sin(a))}L${n(50 + 40 * Math.cos(a))} ${n(50 + 40 * Math.sin(a))}`,
        ln(ORANGE, 3.4));
    }),
    C(50, 50, 25, o(BUTTER)),
    FACE(50, 49, 9, 3)].join("") },
  { id: "moon", name: "달", group: "하늘 · 마음", svg: [
    D(CRESCENT(46, 52, 36, 66, 40, 30), o(BUTTER)),
    D("M24 58Q27 61 30 58", ln(INK, 1.8)), D("M33 69Q36 71 39 68", ln(INK, 1.6)), CHEEK(24, 66),
    SP(82, 76, 7), SP(86, 20, 4.6)].join("") },
  { id: "star", name: "반짝별", group: "하늘 · 마음", svg: [
    D(STAR(50, 55, 42, 20), o(BUTTER, 2.6)),
    FACE(50, 58, 8, 2.8),
    SP(88, 14, 5)].join("") },
  { id: "cloud", name: "구름", group: "하늘 · 마음", svg: [
    BLOB([[30, 56, 16], [50, 44, 20], [70, 54, 16], [40, 64, 14], [60, 64, 14], [82, 62, 10], [18, 64, 10]], WHITE),
    D("M26 72Q50 77 76 72", ln("#E3EFF8", 3)),
    FACE(50, 58, 9, 3)].join("") },
  { id: "rainbow", name: "무지개", group: "하늘 · 마음", svg: [
    ...[[38, RED2], [31, ORANGE], [24, BUTTER], [17, LEAF], [10, SKY2]]
      .map(([r, c]) => D(`M${50 - r} 72A${r} ${r} 0 0 1 ${50 + r} 72`, `fill="none" stroke="${c}" stroke-width="7.4"`)),
    D("M8.3 72A41.7 41.7 0 0 1 91.7 72M43.7 72A6.3 6.3 0 0 1 56.3 72", ln(INK, 2.2)),
    BLOB([[12, 76, 8], [22, 71, 9.5], [31, 77, 7], [20, 80, 7]], WHITE),
    BLOB([[88, 76, 8], [78, 71, 9.5], [69, 77, 7], [80, 80, 7]], WHITE)].join("") },
  { id: "planet", name: "행성", group: "하늘 · 마음", svg: [
    G("rotate(-18 50 50)",
      D("M13 50A37 10 0 0 1 87 50", ln(INK, 7)), D("M13 50A37 10 0 0 1 87 50", ln(BUTTER, 3.4))),
    C(50, 50, 23, o(LAV)),
    D("M30 40Q50 45 71 39M28 55Q50 61 72 54", ln(LAV2, 2.2)),
    C(40, 62, 2.4, f(LAV2)), C(60, 34, 1.8, f(LAV2)),
    G("rotate(-18 50 50)",
      D("M13 50A37 10 0 0 0 87 50", ln(INK, 7)), D("M13 50A37 10 0 0 0 87 50", ln(BUTTER, 3.4))),
    SP(86, 16, 4.6), SP(14, 84, 3.6, WHITE)].join("") },
  { id: "rocket", name: "로켓", group: "하늘 · 마음", svg: G("rotate(35 50 50)",
    D("M42 70Q43 84 50 96Q57 84 58 70Z", o(ORANGE)), D("M46 70Q47 80 50 88Q53 80 54 70Z", f(BUTTER)),
    D("M38 50L25 70L39 70Z", o(PINK2)), D("M62 50L75 70L61 70Z", o(PINK2)),
    D("M50 6C65 18 67 44 62 72L38 72C33 44 35 18 50 6Z", o(WHITE)),
    D("M50 6C57 12 61 20 63 28L37 28C39 20 43 12 50 6Z", o(PINK2)),
    C(50, 44, 8, o(SKY)), SHINE(47.5, 41.5, 2.2, 1.6, -30),
    R(46, 72, 8, 4, 1, o(GRAY2, 1.6))) },
  { id: "balloon", name: "열기구", group: "하늘 · 마음", svg: [
    D("M43 72L42 82M57 72L58 82", ln(INK, 1.6)),
    D("M50 8C28 8 16 24 18 42C20 58 36 66 42 72L58 72C64 66 80 58 82 42C84 24 72 8 50 8Z", o(PINK)),
    D("M50 8C40 20 38 50 44 72L56 72C62 50 60 20 50 8Z", f(CREAM)),
    D("M50 8C40 20 38 50 44 72M50 8C60 20 62 50 56 72M19 38Q50 48 81 38", ln(INK, 1.6)),
    D("M50 8C28 8 16 24 18 42C20 58 36 66 42 72L58 72C64 66 80 58 82 42C84 24 72 8 50 8Z", ln()),
    H(50, 30, 0.9),
    R(40, 81, 20, 13, 3, o(BROWN)), D("M40 87L60 87M47 81L47 94M53 81L53 94", ln(BROWN2, 1.3))].join("") },
  { id: "umbrella", name: "우산", group: "하늘 · 마음", svg: [
    TUBE("M50 52L50 84Q50 92 42 92Q36 92 36 86", BROWN2, 3),
    D("M50 14L50 6", ln(INK, 3)), C(50, 6, 2.6, o(PINK2, 1.6)),
    D("M8 52Q10 16 50 14Q90 16 92 52Q85 46 78 52Q71 45 64 52Q57 45 50 52Q43 45 36 52Q29 45 22 52Q15 46 8 52Z", f(PINK2)),
    D("M50 14Q30 24 22 52Q29 45 36 52Q40 28 50 14Z", f(PINK)),
    D("M50 14Q60 28 64 52Q71 45 78 52Q70 24 50 14Z", f(PINK)),
    D("M50 14Q30 24 22 52M50 14Q40 28 36 52M50 14L50 52M50 14Q60 28 64 52M50 14Q70 24 78 52", ln(INK, 1.6)),
    D("M8 52Q10 16 50 14Q90 16 92 52Q85 46 78 52Q71 45 64 52Q57 45 50 52Q43 45 36 52Q29 45 22 52Q15 46 8 52Z", ln())].join("") },
  { id: "heart", name: "하트", group: "하늘 · 마음", svg: [
    D("M50 86C20 66 10 48 14 34C18 20 38 16 50 32C62 16 82 20 86 34C90 48 80 66 50 86Z", o(PINK2)),
    SHINE(28, 36, 4, 7, -30), SHINE(34, 48, 1.8, 1.8),
    SP(86, 16, 5, WHITE)].join("") },

  /* ---------- 학용품 · 물건 8종 ---------- */
  { id: "book", name: "책", group: "학용품 · 물건", svg: [
    D("M7 30L7 84Q30 80 50 86Q70 80 93 84L93 30Z", o(PINK2)),
    D("M50 30Q33 20 12 24L12 78Q32 74 50 82Z", o(WHITE)),
    D("M50 30Q67 20 88 24L88 78Q68 74 50 82Z", o(WHITE)),
    D("M19 36Q30 33 42 37M19 45Q30 42 42 46M19 54Q30 51 42 55M19 63Q30 60 42 64", ln(GRAY2, 1.5)),
    D("M58 60Q68 57 80 59M58 68Q68 65 80 67", ln(GRAY2, 1.5)),
    H(69, 42, 1.2)].join("") },
  { id: "backpack", name: "가방", group: "학용품 · 물건", svg: [
    TUBE("M40 20Q40 8 50 8Q60 8 60 20", PINK2, 2.6),
    D("M22 36Q22 18 50 18Q78 18 78 36L78 84Q78 91 71 91L29 91Q22 91 22 84Z", o(PINK)),
    D("M22 40Q50 50 78 40", ln()),
    R(31, 56, 38, 26, 7, o("#FDDDE5")),
    D("M31 64L69 64", ln(INK, 1.8)),
    R(46, 36, 8, 8, 2, o(BUTTER, 1.6)),
    H(50, 73, 0.9)].join("") },
  { id: "pencil", name: "연필", group: "학용품 · 물건", svg: G("rotate(-40 50 50)",
    R(6, 42, 13, 16, 4, o(PINK)),
    R(16, 41, 10, 18, 1, o(GRAY)),
    D("M19.5 42L19.5 58M22.5 42L22.5 58", ln(GRAY2, 1.3)),
    R(25, 41, 46, 18, 0, o(BUTTER)),
    D("M26 47L70 47M26 53L70 53", ln(BUTTER2, 1.6)),
    D("M71 41L90 50L71 59Z", o("#F8E2C2")),
    D("M84 47.2L90 50L84 52.8Z", f(INK)),
    D("M71 41Q74 44 71 47Q74 50 71 53Q74 56 71 59", ln(INK, 1.6))) },
  { id: "eraser", name: "지우개", group: "학용품 · 물건", svg: [
    G("rotate(-14 50 50)",
      R(12, 34, 76, 32, 6, o("#FDEBF0")),
      R(38, 31, 50, 38, 3, o(SKY2)),
      R(38, 44, 50, 12, 0, f(WHITE)),
      D("M38 44L88 44M38 56L88 56", ln(INK, 1.6)),
      D("M46 50L56 50M60 50L66 50M70 50L80 50", ln(SKY2, 2.2))),
    E(14, 80, 3, 1.8, f(PINK)), E(24, 84, 2.2, 1.4, f(PINK)), E(8, 88, 1.8, 1.2, f(PINK))].join("") },
  { id: "scissors", name: "가위", group: "학용품 · 물건", svg: [
    D("M55 66L63 62L30 10Z", o(GRAY)),
    TUBE("M35 69L40 64", PINK2, 5), TUBE("M65 69L60 64", PINK2, 5),
    C(30, 78, 11, ln(INK, 10.4)), C(30, 78, 11, ln(PINK2, 5)),
    C(70, 78, 11, ln(INK, 10.4)), C(70, 78, 11, ln(PINK2, 5)),
    D("M37 62L45 66L70 10Z", o("#F3F5F8")),
    C(50, 47.2, 3.4, o(GRAY2, 1.8))].join("") },
  { id: "mug", name: "머그컵", group: "학용품 · 물건", svg: [
    D("M38 24Q34 18 38 12Q42 6 38 2M52 24Q48 18 52 12Q56 6 52 2", ln(GRAY2, 2.6)),
    TUBE("M68 44Q84 44 84 58Q84 72 66 72", WHITE, 5),
    D("M22 34L70 34L68 80Q66 90 56 90L36 90Q26 90 24 80Z", o(WHITE)),
    E(46, 34, 24, 6, o(WHITE)),
    E(46, 35, 19.5, 3.8, f(BROWN2)),
    H(46, 62, 1.4)].join("") },
  { id: "lightbulb", name: "전구", group: "학용품 · 물건", svg: [
    D("M50 2L50 8M20 14L25 19M80 14L75 19M8 40L15 40M92 40L85 40", ln(BUTTER2, 3)),
    D("M50 12C33 12 23 25 25 40C27 52 36 58 38 68L62 68C64 58 73 52 75 40C77 25 67 12 50 12Z", o("#FDEBA4")),
    D("M43 66L43 50Q46 44 50 50Q54 44 57 50L57 66", ln("#E2A548", 2)),
    SHINE(36, 30, 3, 7, 30),
    R(38, 68, 24, 7, 2.5, o(GRAY, 2)), R(39, 75, 22, 6, 2.5, o(GRAY, 2)),
    D("M44 81L56 81Q55 89 50 89Q45 89 44 81Z", o(GRAY2, 2))].join("") },
  { id: "envelope", name: "편지", group: "학용품 · 물건", svg: [
    R(12, 26, 76, 52, 5, o(WHITE)),
    D("M13 76L41 52M87 76L59 52", ln(GRAY2, 1.8)),
    D("M13 29L50 58L87 29", ln()),
    H(50, 58, 1.5)].join("") },

  /* ---------- 꽃 · 나무 7종 ---------- */
  { id: "cactus", name: "선인장", group: "꽃 · 나무", svg: [
    D("M40 50L30 50Q24 50 24 44L24 32Q24 26 29 26Q34 26 34 32L34 42L40 42Z", o(MINT2)),
    D("M60 44L70 44Q76 44 76 38L76 28Q76 22 71 22Q66 22 66 28L66 36L60 36Z", o(MINT2)),
    D("M40 68L40 26Q40 14 50 14Q60 14 60 26L60 68Z", o(MINT2)),
    D("M50 20L50 66M45 24L45 66M55 24L55 66", ln(LEAF2, 1.4)),
    ...[0, 72, 144, 216, 288].map((a) =>
      C(n(50 + 4 * Math.cos((a * Math.PI) / 180)), n(12 + 4 * Math.sin((a * Math.PI) / 180)), 3.6, o(PINK2, 1.4))),
    C(50, 12, 2.4, f(BUTTER)),
    D("M28 70L72 70L66 94L34 94Z", o("#EFA887")),
    R(24, 63, 52, 9, 2.5, o(PEACH))].join("") },
  { id: "sunflower", name: "해바라기", group: "꽃 · 나무", svg: [
    TUBE("M50 50L50 74", LEAF2, 3),
    D("M50 66Q36 56 28 62Q38 72 50 68Z", o(LEAF, 2)), D("M50 64Q64 54 72 60Q62 70 50 66Z", o(LEAF, 2)),
    ...Array.from({ length: 14 }, (_, i) => E(50, 19, 5.5, 11, o(BUTTER, 2)).replace("/>",
      ` transform="rotate(${n(i * 360 / 14)} 50 36)"/>`)),
    C(50, 36, 12, o("#A87555")),
    ...[[46, 32], [54, 32], [50, 37], [45, 40], [55, 40], [50, 43], [42, 36], [58, 36]].map(([x, y]) => C(x, y, 1.2, f("#7B5540"))),
    D("M30 76L70 76L65 94L35 94Z", o("#EFA887")),
    R(26, 70, 48, 8, 2.5, o(PEACH))].join("") },
  { id: "tulip", name: "튤립", group: "꽃 · 나무", svg: [
    TUBE("M50 56L50 94", LEAF2, 2.6),
    D("M50 92Q24 84 26 56Q42 66 50 84Z", o(LEAF)),
    D("M50 92Q76 84 74 60Q58 68 50 84Z", o(LEAF2)),
    D("M28 20L39 30L50 14L61 30L72 20Q78 50 50 58Q22 50 28 20Z", o(PINK)),
    D("M39 30Q40 44 46 54M61 30Q60 44 54 54", ln(PINK2, 2)),
    SHINE(33, 34, 2.4, 6, 10)].join("") },
  { id: "clover", name: "네잎클로버", group: "꽃 · 나무", svg: [
    TUBE("M50 50Q56 72 70 92", LEAF2, 3),
    ...[0, 90, 180, 270].map((a, i) => G(`rotate(${a} 50 50)`,
      D("M50 50C44 44 30 38 30 26C30 16 44 14 50 24C56 14 70 16 70 26C70 38 56 44 50 50Z", o(i % 2 ? LEAF2 : LEAF)),
      D("M50 47L50 28", ln("#D6EFD6", 1.6)))),
    C(50, 50, 3, f(LEAF2))].join("") },
  { id: "mushroom", name: "버섯", group: "꽃 · 나무", svg: [
    D("M38 52Q36 76 33 88Q50 94 67 88Q64 76 62 52Z", o(CREAM)),
    D("M12 52Q12 14 50 12Q88 14 88 52Q50 60 12 52Z", o(RED)),
    ...[[30, 32, 6.5], [52, 23, 5], [70, 36, 6.5], [45, 43, 4], [22, 47, 3], [80, 48, 2.6]].map(([x, y, r]) => C(x, y, r, f(WHITE))),
    D("M24 94Q27 86 30 94M72 94Q75 84 78 94", o(LEAF, 1.6))].join("") },
  { id: "tree", name: "나무", group: "꽃 · 나무", svg: [
    D("M43 94L46 60L54 60L57 94Z", o(BROWN)),
    D("M50 74L42 64M50 70L58 62", ln(INK, 2)),
    BLOB([[30, 44, 15], [50, 30, 19], [70, 44, 15], [40, 56, 13], [60, 56, 13], [50, 46, 15]], LEAF),
    ...[[34, 40], [50, 24], [64, 36], [44, 52], [60, 52], [28, 50]].map(([x, y]) => D(`M${x} ${y}q2 -2.4 4 0`, ln(LEAF2, 1.6))),
    D("M30 94Q50 90 70 94", ln(LEAF2, 2.4))].join("") },
  { id: "house", name: "작은 집", group: "꽃 · 나무", svg: [
    R(62, 18, 9, 18, 1.5, o(BROWN)),
    R(20, 44, 60, 46, 3, o(CREAM)),
    D("M12 48L50 14L88 48Q90 51 86 52L14 52Q10 51 12 48Z", o("#F4A68C")),
    D("M26 44L34 37M40 44L48 37M54 44L62 37M68 44L74 38", ln("#E08A74", 1.6)),
    D("M42 90L42 72Q42 64 50 64Q58 64 58 72L58 90Z", o(BROWN)), C(54.5, 78, 1.4, f(INK)),
    R(26, 60, 11, 11, 2, o(SKY, 2)), D("M31.5 60L31.5 71M26 65.5L37 65.5", ln(INK, 1.4)),
    R(63, 60, 11, 11, 2, o(SKY, 2)), D("M68.5 60L68.5 71M63 65.5L74 65.5", ln(INK, 1.4)),
    C(24, 88, 4.5, o(LEAF, 1.6)), C(76, 88, 4.5, o(LEAF, 1.6)), C(23, 86, 1.6, f(PINK2)), C(77, 86, 1.6, f(PINK2))].join("") }
];

/** 없어진 스티커 → 대신 보여 줄 스티커. 예전에 받은 스티커·고른 목록이 이걸로 이어진다. */
const RETIRED = {
  siamese: "calico", persian: "calico", ragdoll: "calico", scottish: "russian", bengal: "cheese", munchkin: "cheese",
  lemon: "sun", peach: "apple", banana: "corn", tomato: "apple", carrot: "corn",
  potato: "avocado", eggplant: "avocado", pea: "avocado", broccoli: "tree",
  bread: "pancake", onigiri: "eggfry", pizza: "cake", milk: "juice",
  candy: "donut", cookie: "donut", macaron: "cake", pudding: "cake",
  daisy: "sunflower", ribbon: "heart", ruler: "pencil", gluestick: "pencil",
  clock: "lightbulb", sock: "backpack", spool: "scissors", yarn: "scissors", button: "heart", pincushion: "berry"
};

/** 초등(둘째) 기본 8종 */
export const PICK_CUTE = ["cheese", "berry", "star", "sun", "rainbow", "heart", "icecream", "clover"];
/** 중학생(첫째) 기본 8종 — 차분한 것들 */
export const PICK_CALM = ["russian", "moon", "cloud", "clover", "book", "mug", "tree", "planet"];

/** 없어진 id 는 대신할 스티커 id 로 바꾼다 */
export function canonicalSticker(id) {
  return RETIRED[id] || id;
}

export function getSticker(id) {
  const key = canonicalSticker(id);
  return STICKERS.find((s) => s.id === key) || STICKERS[0];
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
  box.innerHTML = '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">' + sticker.svg + "</svg>";
  return box;
}
