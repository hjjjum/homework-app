// ---------------------------------------------------------------------------
// ocr-table.js
// 캡쳐한 숙제표를 "칸" 단위로 되살리고 해석하는 순수 함수들.
// DOM·Tesseract에 의존하지 않으므로 Node에서 그대로 테스트할 수 있다.
// (이미지는 {width, height, data} 모양의 ImageData 흉내만 있으면 된다)
//
// 흐름 (ocr.js가 이 순서로 부른다):
//   1. detectGrid       — 픽셀에서 표의 가로/세로 선을 찾아 칸 격자를 만든다
//   2. (ocr.js)         — 칸마다 따로 글자를 읽는다
//   3. lineIsColored    — 줄의 글자색이 검정인지 색글씨인지 본다
//   4. interpretTable   — 칸 격자를 숙제 묶음(제목/세부 항목/참고/제출일)으로 바꾼다
//
// 실제로 받는 표는 두 가지 모양이다.
//   가로형 (둘째 영어학원)  [영역 | 숙제 | 제출 날짜] 가 한 줄에 하나씩
//       READING | [교재명] 1. ... 2. ... (색글씨 안내) | 9/15
//   세로형 (첫째 영어학원)  맨 왼쪽 열이 [구분/진도/과제], 수업이 가로로 놓인다
//       구분 | 단어       | 1교시 선생님 | 2교시 ...
//       진도 | Day 25~26  | ...
//       과제 | 문장듣기시험 | 1) ...
//   세로형은 "과제" 행만 숙제이고, 열 머리글이 숙제 제목이 된다.
// ---------------------------------------------------------------------------

import { detectSubject } from "./sources/academy-message.js";

// ===========================================================================
// 1. 칸 격자 찾기
// ===========================================================================

/** 이보다 어두우면 선이나 글자로 본다. 표 테두리가 연한 회색인 경우가 많아 넉넉히 둔다. */
const DARK = 200;

/** ImageData → 밝기 배열 */
export function toGray(image) {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
  return gray;
}

/**
 * 한 방향으로 길게 이어진 선을 찾는다.
 * @param {number[]} fraction 줄(또는 열)마다 어두운 픽셀의 비율
 * @param {number} threshold 이 비율을 넘으면 선 후보
 * @param {number} maxThick 이보다 두꺼우면 선이 아니라 어두운 배경(캡쳐 가장자리 등)
 * @returns {Array<{start:number, end:number}>}
 */
export function findRuns(fraction, threshold, maxThick) {
  const n = fraction.length;
  const runs = [];
  let start = -1;
  let lastHit = -10;
  for (let i = 0; i <= n; i++) {
    const hit = i < n && fraction[i] > threshold;
    if (hit) {
      // 2줄 이하로 끊긴 건 한 선으로 본다 (이중선, 안티앨리어싱)
      if (start === -1 || i - lastHit > 3) {
        if (start !== -1) runs.push({ start, end: lastHit });
        start = i;
      }
      lastHit = i;
    }
  }
  if (start !== -1) runs.push({ start, end: lastHit });

  const LIGHT = 0.35;
  return runs.filter((r) => {
    // 이미지의 상당 부분을 덮는 어두운 면은 표가 아니라 배경이다 (카톡 대화방 등)
    if (r.end - r.start + 1 > maxThick) return false;
    // 선이라면 적어도 한쪽 옆은 밝아야 한다. 양쪽 다 어두우면 어두운 면의 일부다.
    const before = r.start - 5 < 0 ? 0 : fraction[r.start - 5];
    const after = r.end + 5 >= n ? 0 : fraction[r.end + 5];
    return before < LIGHT || after < LIGHT;
  });
}

/** 선과 선 사이 구간을 칸으로 만든다. 너무 얇은 건 버린다. */
function bandsBetween(runs, size, minSize) {
  const edges = [{ start: -1, end: -1 }, ...runs, { start: size, end: size }];
  const bands = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i].end + 1;
    const b = edges[i + 1].start - 1;
    if (b - a + 1 >= minSize) bands.push({ start: a, end: b });
  }
  return bands;
}

/**
 * 이미지에서 표의 칸 격자를 찾는다.
 * 세로선은 표 전체 높이를 가로질러야 열 경계로 인정한다. 머리글 한 줄에만 있는
 * 칸막이("1교시 | 박은아R 선생님")는 한 열 안의 장식이지 열 경계가 아니다.
 * @param {{width:number, height:number, data:Uint8ClampedArray}} image 원본 밝기 그대로인 이미지
 * @returns {{rows: Array<{y0:number,y1:number}>, cols: Array<{x0:number,x1:number}>} | null}
 */
export function detectGrid(image) {
  const { width: w, height: h } = image;
  const gray = toGray(image);

  const rowFrac = new Array(h);
  for (let y = 0; y < h; y++) {
    let dark = 0;
    let seen = 0;
    for (let x = 0; x < w; x += 2) {
      seen++;
      if (gray[y * w + x] < DARK) dark++;
    }
    rowFrac[y] = dark / seen;
  }
  // 캡쳐 가장자리의 검은 띠도 칸의 경계로 쓴다 (표 테두리가 그 띠에 붙어 있으면
  // 테두리 자체는 따로 잡히지 않는다). 다만 이미지의 30%를 넘게 덮으면 배경이다.
  const hRuns = findRuns(rowFrac, 0.5, h * 0.3);

  // 세로선은 표가 있는 높이 안에서만 잰다
  const top = hRuns.length >= 2 ? hRuns[0].end + 1 : 0;
  const bottom = hRuns.length >= 2 ? hRuns[hRuns.length - 1].start - 1 : h - 1;
  const colFrac = new Array(w);
  for (let x = 0; x < w; x++) {
    let dark = 0;
    let seen = 0;
    for (let y = top; y <= bottom; y += 2) {
      seen++;
      if (gray[y * w + x] < DARK) dark++;
    }
    colFrac[x] = seen ? dark / seen : 0;
  }
  const vRuns = findRuns(colFrac, 0.6, w * 0.3);

  const minSize = Math.max(16, Math.min(w, h) * 0.02);
  const inkOf = (x0, x1, y0, y1) => {
    let dark = 0;
    let seen = 0;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        seen++;
        if (gray[y * w + x] < DARK) dark++;
      }
    }
    return seen ? dark / seen : 0;
  };

  // 캡쳐 가장자리의 검은 띠처럼 온통 어두운 구간은 칸이 아니다
  const rows = bandsBetween(hRuns, h, minSize)
    .filter((b) => inkOf(0, w - 1, b.start, b.end) < 0.5)
    .map((b) => ({ y0: b.start, y1: b.end }));
  const cols = bandsBetween(vRuns, w, minSize)
    .filter((b) => inkOf(b.start, b.end, top, bottom) < 0.5)
    .map((b) => ({ x0: b.start, x1: b.end }));

  if (rows.length < 2 || cols.length < 2) return null;
  return { rows, cols };
}

/**
 * 칸 안에 글자가 있는지 (빈 칸은 읽지 않고 건너뛴다)
 */
export function cellHasInk(image, rect) {
  const { width: w, data } = image;
  let dark = 0;
  for (let y = rect.y0; y <= rect.y1; y += 2) {
    for (let x = rect.x0; x <= rect.x1; x += 2) {
      const i = (y * w + x) * 4;
      if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 150) {
        if (++dark > 20) return true;
      }
    }
  }
  return false;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** 칸(또는 영역)의 바탕색 = 채널별 중앙값. 칸은 대부분 바탕이기 때문이다. */
function backgroundOf(data) {
  const n = data.length / 4;
  const median = (offset) => {
    const hist = new Uint32Array(256);
    for (let i = offset; i < data.length; i += 4) hist[data[i]]++;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n / 2) return v;
    }
    return 255;
  };
  return [median(0), median(1), median(2)];
}

/**
 * 바탕색과 "다른 색"인 정도를 재는 함수를 만든다.
 * 검은 글씨의 가장자리는 검정과 바탕색이 섞인 색 = 바탕색을 어둡게 한 색이라
 * (0,0,0)–바탕색 을 잇는 선 위에 놓인다. 그 선에서 멀리 떨어진 색만 "색글씨"다.
 *   흰 바탕의 분홍 글씨 (254,175,175) → 65      노란 칸의 검은 글씨 (98,81,1) → 12
 * 채도(max-min)로 재면 노란 칸의 검은 글씨가 색글씨로 잘못 잡힌다.
 */
function chromaAgainst(bg) {
  let [ur, ug, ub] = bg;
  let len = Math.sqrt(ur * ur + ug * ug + ub * ub);
  if (len < 30) { ur = ug = ub = 1; len = Math.sqrt(3); } // 어두운 바탕이면 회색 축 기준
  ur /= len; ug /= len; ub /= len;
  return (r, g, b) => {
    const t = r * ur + g * ug + b * ub;
    const dr = r - t * ur, dg = g - t * ug, db = b - t * ub;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
}

/**
 * 칸 하나를 "하얀 바탕 + 까만 글자"로 바꾼다 (제자리 수정). 두 가지를 합친다.
 *   - 밝기: 칸 바탕 밝기를 하양으로 늘린다 → 노란 칸·회색 머리글 칸이 하얘진다
 *   - 색:   바탕보다 어두운 색글씨는 진하게 칠한다 → 연분홍·주황 안내문도 읽힌다
 *           (밝기만 보면 연분홍 글씨(밝기 200)는 흰 바탕에 묻혀 통째로 안 읽힌다)
 * 한 장 전체를 같은 규칙으로 바꾸면 칸마다 다른 바탕색을 못 따라가므로 칸마다 따로 한다.
 */
export function stretchContrast(image) {
  const { data } = image;
  const n = data.length / 4;
  const bg = backgroundOf(data);
  const paper = lum(bg[0], bg[1], bg[2]);
  const chroma = chromaAgainst(bg);

  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) hist[lum(data[i], data[i + 1], data[i + 2]) | 0]++;
  let ink = 0;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * 0.005) { ink = v; break; }
  }
  const span = Math.max(1, paper - ink);

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = lum(r, g, b);
    const dark = 1 - clamp01((l - ink) / span);
    // 색글씨는 색이 다른 만큼 진하게. 단 바탕보다 어두운 만큼만 문을 열어 준다
    // (노란 형광 칠처럼 밝은 색 면이 까맣게 되지 않게). 문턱을 계단 대신 비탈로 둬야
    // 글자 가장자리가 톱니처럼 깨지지 않는다.
    const color = clamp01((chroma(r, g, b) - 10) / 50) * clamp01((paper - l - 15) / 30);
    const v = 255 * (1 - Math.max(dark, color));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  eraseRules(image);
  return image;
}

/**
 * 칸 안에 남은 칸막이 선을 지운다 (제자리 수정, stretchContrast 뒤에 쓴다).
 * 머리글 칸 "1교시 | 박은아R 선생님" 의 칸막이처럼 표 전체를 가로지르지 않는 선은
 * 칸 격자에서 걸러지지 않아 칸 안에 남는데, Tesseract가 그 선에 걸려 줄 전체를 망친다.
 */
function eraseRules(image) {
  const { width: w, height: h, data } = image;
  const isInk = (x, y) => data[(y * w + x) * 4] < 128;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (isInk(x, y)) n++;
    if (n > h * 0.85) for (let y = 0; y < h; y++) data.fill(255, (y * w + x) * 4, (y * w + x) * 4 + 3);
  }
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (isInk(x, y)) n++;
    if (n > w * 0.85) data.fill(255, y * w * 4, (y + 1) * w * 4);
  }
}

/**
 * 칸 안 글자 줄의 높이(px)를 잰다. 대비를 바꾼 뒤(stretchContrast)의 이미지를 넣는다.
 * Tesseract는 글자 높이가 일정 범위일 때 가장 잘 읽으므로, 이 값으로 칸마다 배율을 정한다.
 * @returns {number} 글자가 없으면 0
 */
export function textLineHeight(image) {
  const { width: w, height: h, data } = image;
  const runs = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    let ink = false;
    if (y < h) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4] < 128) { ink = true; break; }
      }
    }
    if (ink && start === -1) start = y;
    if (!ink && start !== -1) {
      if (y - start >= 4) runs.push(y - start);
      start = -1;
    }
  }
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

/**
 * 한 줄의 글자가 색글씨인지 본다 (갈색 교재명, 분홍 안내문, 빨간 강조 등).
 * 줄 영역에서 가장 어두운 픽셀들(= 글자의 속)만 골라, 바탕색의 명암선에서
 * 얼마나 벗어났는지(chromaAgainst) 잰다.
 */
export function lineIsColored(image, box) {
  const { width: w, height: h, data } = image;
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(w - 1, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0));
  const y1 = Math.min(h - 1, Math.ceil(box.y1));
  if (x1 <= x0 || y1 <= y0) return false;
  const region = new Uint8ClampedArray((x1 - x0 + 1) * (y1 - y0 + 1) * 4);
  let k = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      region[k++] = data[i]; region[k++] = data[i + 1]; region[k++] = data[i + 2]; region[k++] = 255;
    }
  }
  const chroma = chromaAgainst(backgroundOf(region));
  const px = [];
  for (let i = 0; i < region.length; i += 4) {
    px.push([lum(region[i], region[i + 1], region[i + 2]), chroma(region[i], region[i + 1], region[i + 2])]);
  }
  px.sort((a, b) => a[0] - b[0]);
  const core = px.slice(0, Math.max(1, Math.round(px.length * 0.04)));
  const values = core.map((p) => p[1]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] > 30;
}

// ===========================================================================
// 2. 칸 격자 해석
// ===========================================================================

/** 번호로 시작하는 항목: 1. 2) ① */
const NUMBERED = /^\s*(?:\d{1,2}\s*[.)]|[①-⑳])\s*/;
/** 참고 문장 표시: ** ※ • (번호 항목 사이에 섞여 있으면 숙제가 아니라 안내다) */
const NOTE_MARK = /^\s*(?:\*+|※|•|·|●|◦|▶|☞|►)\s*/;
/** 날짜처럼 보이는 글자 (9/15, 9월 15일) */
const DATE_LIKE = /(\d{1,2})\s*[/월.]\s*(\d{1,2})/;
/** 표 머리글 행 */
const HEADER_WORDS = /제출|due\s*date|구분|homework|수업\s*숙제/i;
/** 세로형 표에서 숙제가 적힌 행의 이름 */
const TASK_ROW = /^(과제|숙제|homework)$/i;

/**
 * 숙제표에서 OCR이 되풀이해서 틀리는 글자를 바로잡는다. [찾을 것, 바꿀 것]
 * 실제 표로 여러 번 돌려 보고 매번 같은 식으로 틀린 것만 넣는다 (한 번 틀린 건 넣지 않는다).
 */
const OCR_FIXES = [
  [/들린(?=\s*(?:문제|부분|것|답))/g, "틀린"],        // 틀린 문제 → 들린 문제
  [/(\d\s*[~\-]\s*\d+)\s*%/g, "$1쪽"],              // 124~139쪽 → 124~139%
];

/** OCR 줄 한 개를 다듬는다: 테두리가 딸려 온 "|", 앞쪽 이모지 찌꺼기 등 */
export function cleanLine(text) {
  let out = String(text || "")
    .replace(/[|｜]/g, " ")
    .replace(/^[^가-힣A-Za-z0-9[(*※•·●◦▶☞►①-⑳]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, to] of OCR_FIXES) out = out.replace(pattern, to);
  return out;
}

/**
 * 칸의 줄을 읽는 순서(위→아래, 같은 높이면 왼→오른)로 정렬한다.
 * 머리글 칸 안의 칸막이("1교시 | 박은아R 선생님") 때문에 한 줄이 조각나서
 * 오른쪽 조각이 먼저 오는 일이 있다.
 */
function readingOrder(lines) {
  return (lines || []).slice().sort((a, b) => {
    const sameRow = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) < (a.y1 - a.y0) * 0.5;
    return sameRow ? a.x0 - b.x0 : a.y0 - b.y0;
  });
}

function cellText(cell) {
  return cell ? readingOrder(cell.lines).map((l) => cleanLine(l.text)).filter(Boolean).join(" ") : "";
}

/** 칸 이름 다듬기: "단어 (Vocabulary)" → "단어", "담당 김은지 선생님" → "김은지 선생님" */
export function cleanName(text) {
  let name = cleanLine(text)
    .replace(/(^|\s)[ㅣ_~\-=]+(?=\s|$)/g, " ") // 칸막이가 글자로 딸려 온 것
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^담당\s*/, "");
  const noParen = name.replace(/\s*\([^)]*\)?\s*$/, "").trim();
  if (noParen && /[가-힣]/.test(noParen)) name = noParen;
  return name;
}

/**
 * 세로형 표의 열 머리글을 숙제 제목으로: "1교시 | 박은아R 선생님" → "1교시",
 * "담당 | 김은지 선생님" → "김은지 선생님 수업".
 * 선생님 이름은 작은 머리글 칸에서 자주 깨져 읽히므로("박 20IR") 교시가 있으면 교시만 쓴다.
 */
export function lessonName(text) {
  const name = cleanName(text);
  const period = name.match(/\d\s*교시/);
  if (period) return period[0].replace(/\s+/g, "");
  if (/선생님$/.test(name)) return name + " 수업";
  return name;
}

/**
 * 칸 하나(여러 줄)를 세부 항목 / 참고 / 교재명으로 나눈다.
 *
 * - 대괄호 [ ] 로 감싼 줄 = 교재명
 * - ** ※ • 로 시작하는 줄 = 참고
 * - 검은 글씨가 있는 칸의 색글씨 = 참고 (학원이 안내문을 색으로 구분해 적는다)
 *   단 칸 전체가 색글씨면(빨간 "문장듣기시험") 그게 숙제다
 * - 번호가 있으면 번호마다 새 항목, 번호 없는 줄은 앞 항목이 칸 너비에 걸려 접힌 것
 * - 번호가 없으면 앞 줄이 칸 오른쪽 끝까지 찼을 때만 이어진 줄로 본다
 *   ("Day 2 ... pg. 33" 처럼 짧게 끝난 줄 다음은 새 항목)
 *
 * @param {{x0:number, x1:number, lines: Array<{text:string, x0:number, x1:number, y0:number, y1:number, colored?:boolean}>}} cell
 * @returns {{items: string[], memo: string[], book: string}}
 */
export function parseCell(cell) {
  const lines = readingOrder(cell.lines)
    .map((l) => ({ ...l, text: cleanLine(l.text) }))
    .filter((l) => /[가-힣A-Za-z0-9]/.test(l.text));

  const width = Math.max(1, cell.x1 - cell.x0);
  const nearRight = (l) => l.x1 >= cell.x1 - width * 0.12;

  const roleOf = (l, i) => {
    // 교재명: [HACKERS APEX ...]. 여는 [ 가 ( 로 읽히는 일이 잦아서 한쪽만 [ ] 여도 받는다.
    // 괄호로 싸인 색글씨 첫 줄도 교재명이다.
    const wrapped = /^[[(].*[\])]$/.test(l.text);
    if (wrapped && (/^\[|\]$/.test(l.text) || (l.colored && i === 0))) return "book";
    if (NOTE_MARK.test(l.text)) return "memo";
    return l.colored ? "colored" : "item";
  };
  const roles = lines.map(roleOf);
  const hasBlack = roles.includes("item");
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] === "colored") roles[i] = hasBlack ? "memo" : "item";
  }
  const hasNumbers = lines.some((l, i) => roles[i] === "item" && NUMBERED.test(l.text));

  const items = [];
  const memo = [];
  let book = "";
  let prev = null; // { role, line }

  lines.forEach((line, i) => {
    let role = roles[i];
    const text = line.text;
    const height = prev ? Math.max(1, prev.line.y1 - prev.line.y0) : 0;
    const gapBig = prev ? line.y0 - prev.line.y1 > height * 0.9 : false;
    const looksWrapped =
      prev && !gapBig &&
      (nearRight(prev.line) || /^[a-z(]/.test(text) || /[,+&]$/.test(prev.line.text));

    if (role === "book") {
      book = text.replace(/^[[(]\s*/, "").replace(/\s*[\])]\s*$/, "");
      prev = { role, line };
      return;
    }

    if (role === "item") {
      const numbered = NUMBERED.test(text);
      let cont = false;
      if (prev && prev.role === "item" && items.length) {
        // 번호 목록이라도 번호 없는 줄이 전부 이어진 줄은 아니다.
        // 앞 줄이 칸 끝까지 찼거나 "(…)"·소문자로 시작하거나 앞 줄이 ", +"로 끝날 때만 잇는다.
        // ("** 개인적으로…" 의 ** 가 OCR에서 날아가도 안내문으로 남게 하려는 것)
        cont = !numbered && looksWrapped;
      }
      // 번호 목록이 끝나고 한 줄 띄워 나온 번호 없는 문장은 안내다
      if (hasNumbers && !numbered && !cont && items.length) role = "memo";
      if (role === "item") {
        if (cont) items[items.length - 1] += " " + text;
        else items.push(text.replace(NUMBERED, ""));
        prev = { role, line };
        return;
      }
    }

    // 참고 문장
    const marked = NOTE_MARK.test(text);
    if (prev && prev.role === "memo" && memo.length && !marked && looksWrapped) {
      memo[memo.length - 1] += " " + text;
    } else {
      memo.push(text.replace(NOTE_MARK, ""));
    }
    prev = { role: "memo", line };
  });

  return {
    items: items.map((t) => t.trim()).filter(Boolean),
    memo: memo.map((t) => t.trim()).filter(Boolean),
    book,
  };
}

/** 날짜 칸 글자에서 "9/15" 부분만 */
function pickDate(text) {
  const m = String(text || "").match(DATE_LIKE);
  return m ? m[1] + "/" + m[2] : "";
}

/** 가장 많이 나온 값 (같으면 먼저 나온 것) */
function mostCommon(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  let best = "";
  let bestN = 0;
  for (const [v, n] of count) if (n > bestN) { best = v; bestN = n; }
  return best;
}

function makeSection(name, parsedCells, date) {
  const items = [];
  const memo = [];
  const books = [];
  for (const p of parsedCells) {
    items.push(...p.items);
    memo.push(...p.memo);
    if (p.book) books.push(p.book);
  }
  const memoLines = books.map((b) => "교재: " + b).concat(memo);
  return { name, date: date || "", dateGuessed: false, items, memo: memoLines.join("\n") };
}

/**
 * 칸 격자를 숙제 묶음으로 바꾼다.
 * @param {Array<Array<{x0:number,x1:number,y0:number,y1:number,lines:Array}>>} grid 행×열 칸
 * @returns {Array<{name:string, date:string, dateGuessed:boolean, items:string[], memo:string, subject:string}>}
 */
export function interpretTable(table) {
  if (!Array.isArray(table)) return [];
  // 글자가 하나도 없는 행·열은 표 바깥 여백이거나 테두리 사이 틈이다. 버린다.
  // (안 버리면 왼쪽 테두리 바깥 틈이 "첫 열"로 잡혀 영역 이름이 본문에 섞인다)
  const hasText = (cell) => !!cellText(cell);
  const keepCols = [];
  const width = Math.max(0, ...table.map((r) => r.length));
  for (let c = 0; c < width; c++) if (table.some((row) => hasText(row[c]))) keepCols.push(c);
  const grid = table
    .filter((row) => row.some(hasText))
    .map((row) => keepCols.map((c) => row[c] || { x0: 0, x1: 0, y0: 0, y1: 0, lines: [] }));
  if (grid.length < 2) return [];
  const colCount = keepCols.length;
  if (colCount < 2) return [];

  const labelOf = (r) => cleanName(cellText(grid[r][0]));
  let sections = [];

  // --- 세로형: 맨 왼쪽 열에 "과제" 행이 있다 ---
  const taskRow = grid.findIndex((row, r) => r > 0 && TASK_ROW.test(labelOf(r).replace(/\s/g, "")));
  if (taskRow > 0) {
    for (let c = 1; c < colCount; c++) {
      const cell = grid[taskRow][c];
      if (!cell) continue;
      const parsed = parseCell(cell);
      if (!parsed.items.length && !parsed.memo.length) continue;
      sections.push(makeSection(lessonName(cellText(grid[0][c])), [parsed], ""));
    }
  } else {
    // --- 가로형: 한 행이 숙제 하나, 마지막 열이 제출 날짜일 수 있다 ---
    const last = colCount - 1;
    const hasDateCol =
      colCount >= 3 && grid.some((row, r) => r > 0 && DATE_LIKE.test(cellText(row[last])));
    const bodyLast = hasDateCol ? last - 1 : last;
    const start = HEADER_WORDS.test(grid[0].map(cellText).join(" ")) ? 1 : 0;

    for (let r = start; r < grid.length; r++) {
      const row = grid[r];
      const parsed = [];
      for (let c = 1; c <= bodyLast; c++) if (row[c]) parsed.push(parseCell(row[c]));
      const date = hasDateCol ? pickDate(cellText(row[last])) : "";
      const section = makeSection(labelOf(r), parsed, date);
      if (!section.items.length && !section.memo) continue;
      // 이름 칸이 비어 있으면 위 칸과 합쳐진(병합된) 칸이다 → 앞 숙제에 이어 붙인다
      const before = sections[sections.length - 1];
      if (!section.name && before) {
        before.items.push(...section.items);
        before.memo = [before.memo, section.memo].filter(Boolean).join("\n");
        if (!before.date) before.date = section.date;
        continue;
      }
      sections.push(section);
    }

    // 제출일 칸이 가려졌거나(카톡 버튼 등) 비어 있으면, 이 표에서 가장 많이 나온 날짜를 쓴다.
    // 학원 숙제표는 대개 다음 수업일 하나로 맞춰져 있기 때문이다. 화면에서 확인하게 표시한다.
    if (hasDateCol) {
      const common = mostCommon(sections.map((s) => s.date).filter(Boolean));
      for (const s of sections) {
        if (!s.date && common) {
          s.date = common;
          s.dateGuessed = true;
        }
      }
    }
  }

  // 과목: 칸마다 추측하되, 단서가 없는 칸은 표 전체의 과목을 따른다 (한 학원 표이므로)
  const whole = detectSubject(grid.map((row) => row.map(cellText).join(" ")).join(" "));
  sections = sections.map((s) => {
    const own = detectSubject([s.name, ...s.items, s.memo].join(" "));
    const subject = own.score > 0 ? own.subject : whole.score > 0 ? whole.subject : "기타";
    return { ...s, subject };
  });
  return sections;
}
