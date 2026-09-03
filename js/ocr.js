// ---------------------------------------------------------------------------
// ocr.js
// 캡쳐 이미지에서 글자를 읽어낸다 (Tesseract.js, 한국어+영어).
//
// 왜 이 방식인가:
//   - 학원 표(엑셀 캡쳐 등)는 글자를 복사할 수 없어서 OCR이 꼭 필요하다.
//   - 실제 받은 캡쳐로 재보니 표는 신뢰도 87~90%로 잘 읽었고,
//     카톡 캡쳐는 번호(①②)가 깨졌다. 그래서 이미지를 2배로 키우고
//     회색조+대비를 준 뒤 넘긴다. 그것만으로도 눈에 띄게 좋아진다.
//   - 어차피 읽은 결과를 사람이 확인하고 고친 다음 보내므로, 몇 글자
//     틀려도 치명적이지 않다.
//
// 모델(약 15MB)은 처음 한 번만 내려받고 브라우저가 캐시한다.
// 인터넷이 없으면 OCR은 안 된다 (나머지 기능은 그대로 동작한다).
// ---------------------------------------------------------------------------

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

/** 인식에 쓸 언어. 한국어와 영어가 섞여 나오므로 둘 다 켠다. */
const LANGS = "kor+eng";

/** 작은 글씨를 키워야 인식률이 오른다. 너무 키우면 느려지므로 2배. */
const SCALE = 2;

/** 이 크기를 넘으면 확대하지 않는다 (메모리/속도 보호) */
const MAX_PIXELS = 4000 * 4000;

let tesseractLoading = null;

/** Tesseract를 처음 쓸 때만 CDN에서 불러온다. */
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;

  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.onload = () =>
      window.Tesseract
        ? resolve(window.Tesseract)
        : reject(new Error("Tesseract를 불러오지 못했습니다"));
    script.onerror = () =>
      reject(new Error("인식 모듈을 내려받지 못했습니다 (인터넷 연결 확인)"));
    document.head.appendChild(script);
  });
  return tesseractLoading;
}

/** 파일/Blob을 이미지 요소로 읽는다. */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof source !== "string") URL.revokeObjectURL(url);
      reject(new Error("이미지를 열 수 없습니다"));
    };
    img.src = url;
  });
}

/**
 * 인식이 잘 되도록 이미지를 손본다: 확대 + 회색조 + 대비.
 * @returns {HTMLCanvasElement}
 */
export function upscaleOnly(img, scale = SCALE) {
  let factor = scale;
  if (img.width * img.height * factor * factor > MAX_PIXELS) {
    factor = Math.max(1, Math.sqrt(MAX_PIXELS / (img.width * img.height)));
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * factor);
  canvas.height = Math.round(img.height * factor);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function preprocess(img, scale = SCALE) {
  let factor = scale;
  if (img.width * img.height * factor * factor > MAX_PIXELS) {
    factor = Math.max(1, Math.sqrt(MAX_PIXELS / (img.width * img.height)));
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * factor);
  canvas.height = Math.round(img.height * factor);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    // 밝은 건 더 밝게, 어두운 건 더 어둡게 (글자 경계를 또렷하게)
    const v = gray < 128 ? Math.max(0, gray - 40) : Math.min(255, gray + 40);
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * 이미지에서 글자를 읽는다.
 * @param {File|Blob|string} source 이미지 파일 또는 주소
 * @param {(step: string, percent: number|null) => void} [onProgress]
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function recognizeImage(source, onProgress) {
  const report = (step, percent = null) => {
    if (typeof onProgress === "function") onProgress(step, percent);
  };

  report("인식 모듈 준비 중");
  const Tesseract = await loadTesseract();

  report("이미지 다듬는 중");
  const img = await loadImage(source);
  const canvas = preprocess(img);
  // 표 테두리는 연한 회색인 경우가 많아 대비를 올리면 사라진다.
  // 선·칸 위치를 재는 용도로 원본 밝기 그대로인 것도 함께 만든다.
  const plain = upscaleOnly(img);

  report("글자 인식 준비 중");
  const worker = await Tesseract.createWorker(LANGS, 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        report("글자 읽는 중", Math.round((m.progress || 0) * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });

    // 표(칸이 나뉜 숙제표)면 칸 구조를 되살려 읽는다.
    // 실패하면 그냥 통째로 읽은 글을 쓴다.
    let sections = null;
    try {
      report("표 구조 살펴보는 중");
      sections = await reconstructTable(worker, canvas, plain, data, report);
    } catch (err) {
      console.warn("[ocr] 표 인식 실패, 일반 방식으로 진행:", err.message);
    }
    const text = sections ? sectionsToText(sections) : cleanOcrText(data.text);

    return { text, confidence: data.confidence, sections };
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR 결과에서 자주 나오는 찌꺼기를 정리한다.
 * 표를 읽으면 칸 사이가 공백 수십 칸으로 벌어지고, 카톡을 읽으면
 * 시각·읽음표시 같은 게 줄 끝에 붙는다. 순수 함수라 따로 테스트할 수 있다.
 * @param {string} text
 * @returns {string}
 */
export function cleanOcrText(text) {
  if (typeof text !== "string") return "";
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s{3,}/g, "  ")   // 표의 칸 사이 긴 공백을 줄인다
        .replace(/\s+$/g, "")
        .replace(/^\s+/g, "")
    )
    // 알아볼 수 없는 찌꺼기 줄은 버린다:
    //  - 한글/영문/숫자가 하나도 없는 줄
    //  - 아주 짧은데 따옴표 같은 기호가 섞인 줄 ("스'" 같은 인식 오류)
    //    단 "IB", "9/8" 처럼 짧아도 온전한 값은 남긴다.
    .filter((line) => {
      if (line === "") return true;
      if (!/[가-힣A-Za-z0-9]/.test(line)) return false;
      if (line.length <= 2 && /[^가-힣A-Za-z0-9]/.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 붙여넣기 이벤트에서 이미지 파일을 꺼낸다. 없으면 null. */
export function imageFromPaste(event) {
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

// ===========================================================================
// 표(엑셀 캡쳐 등) 인식
//
// 학원 숙제표는 [세부과목 | 숙제 | 제출날짜] 처럼 칸이 나뉘어 있는데,
// 이미지를 통째로 읽으면 칸 경계가 사라져서 여러 줄이 뒤엉킨다.
// 그래서 글자 좌표를 이용해 표를 되살린다:
//   1. 각 줄의 시작 x좌표를 모아 세로 칸(열)을 찾는다
//   2. y좌표가 겹치는 글자끼리 묶어 가로 줄(행)을 만든다
//   3. 첫 열은 Tesseract가 자주 통째로 건너뛰므로, 픽셀을 훑어 글자가 있는
//      위치만 찾아내 그 부분만 따로 읽는다 (이게 없으면 READING/NOVEL이 통째로 빠진다)
// ===========================================================================

/** y가 겹치는 글자끼리 한 줄로 묶는다. */
function groupIntoRows(words) {
  const sorted = words.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rows = [];
  for (const w of sorted) {
    const mid = (w.y0 + w.y1) / 2;
    const row = rows.find((r) => mid >= r.y0 - 4 && mid <= r.y1 + 4);
    if (row) {
      row.words.push(w);
      row.y0 = Math.min(row.y0, w.y0);
      row.y1 = Math.max(row.y1, w.y1);
    } else {
      rows.push({ y0: w.y0, y1: w.y1, words: [w] });
    }
  }
  for (const r of rows) r.words.sort((a, b) => a.x0 - b.x0);
  rows.sort((a, b) => a.y0 - b.y0);
  return rows;
}

/**
 * 줄의 시작 위치를 모아 열의 왼쪽 경계를 찾는다.
 * 표의 칸은 왼쪽 정렬이라 시작 x가 몇 군데로 뭉친다.
 */
function detectColumns(rows, pageWidth) {
  const starts = rows.map((r) => r.words[0].x0).sort((a, b) => a - b);
  const cols = [];
  for (const x of starts) {
    if (!cols.length || x - cols[cols.length - 1] > pageWidth * 0.08) cols.push(x);
  }
  // 오른쪽 끝에 따로 떨어진 칸(제출 날짜 등)도 열로 잡는다.
  // 그 칸에서 "가장 왼쪽" 글자가 칸의 시작이다 (가장 오른쪽을 쓰면 날짜가 본문에 섞인다).
  const rightWords = rows
    .flatMap((r) => r.words)
    .filter((w) => w.x0 > pageWidth * 0.8);
  if (rightWords.length) {
    const rightStart = Math.min(...rightWords.map((w) => w.x0));
    if (rightStart - cols[cols.length - 1] > pageWidth * 0.08) cols.push(rightStart);
  }
  return cols;
}

/** 글자들을 이어 붙인다. 사이가 좁으면 붙이고(한글 음절), 벌어지면 띄운다. */
/** 새 항목이 시작되는 줄인가 (번호·글머리표·별표로 시작) */
const ITEM_START = /^\s*(?:[0-9]{1,2}\s*[.)]|[①-⑳]|[-•*※]|\*)/;

/**
 * 칸 너비에 걸려 여러 줄로 접힌 항목을 한 줄로 되돌린다.
 * 표의 칸은 폭이 좁아 "1. p95~99 문제 풀어오기 (앞의 이론 보지 / 않고 푸세요)"
 * 처럼 끊기는데, 그대로 두면 할일이 엉뚱하게 두 개로 나뉜다.
 */
function mergeWrapped(lines) {
  const out = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    if (out.length === 0 || ITEM_START.test(text)) out.push(text);
    else out[out.length - 1] += " " + text;
  }
  return out;
}

function joinWords(words, lineHeight) {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && words[i].x0 - words[i - 1].x1 > lineHeight * 0.25) out += " ";
    out += words[i].t;
  }
  return out.trim();
}

/**
 * 첫 열에서 글자가 있는 세로 구간을 픽셀로 찾는다.
 * Tesseract가 표의 고립된 칸(READING, NOVEL 같은 것)을 자주 통째로 빠뜨리기 때문에,
 * 위치만 찾아 두었다가 그 부분만 잘라서 다시 읽는다.
 */
function findInkBands(canvas, x0, x1) {
  const w = Math.max(1, x1 - x0);
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const px = ctx.getImageData(x0, 0, w, h).data;

  const bands = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    let dark = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (gray < 140) dark++;
    }
    // 세로 테두리선은 어느 줄에서나 몇 픽셀씩 어둡게 잡히므로 문턱을 올린다.
    // (이게 낮으면 표 전체가 한 덩어리로 잡혀 칸 이름을 못 찾는다)
    // 가로 테두리선은 거의 전체가 어두우므로 위쪽 한계로 걸러낸다.
    const isText = dark > Math.max(4, w * 0.03) && dark < w * 0.8;
    if (isText) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      if (y - start > h * 0.008) bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start !== -1) bands.push([start, h - 1]);
  return bands;
}

/**
 * 표의 가로 구분선(행을 나누는 줄) 위치를 찾는다.
 * 가로로 길게 이어진 옅은 줄이 곧 칸의 경계다.
 * 라벨이 칸 가운데에 있어서 라벨 위치만으로는 경계를 알 수 없기 때문에 필요하다.
 *
 * **대비를 올리지 않은 원본 밝기 이미지를 넣어야 한다.** 표 테두리가 연한 회색인
 * 경우가 많은데, 전처리(대비 강화)를 거치면 그 선이 더 밝아져서 사라진다.
 * 글자보다는 연해도 되므로 문턱을 200까지 열어 둔다.
 */
function findHorizontalRules(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const px = ctx.getImageData(0, 0, w, h).data;
  const sampled = Math.ceil(w / 2);

  const rules = [];
  let run = -1;
  for (let y = 0; y < h; y++) {
    let dark = 0;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (gray < 200) dark++;
    }
    // 글자만 있는 줄은 가로로 절반을 넘기지 못한다. 60%면 선이다.
    const isRule = dark > sampled * 0.6;
    if (isRule) {
      if (run === -1) run = y;
    } else if (run !== -1) {
      rules.push(Math.round((run + y - 1) / 2));
      run = -1;
    }
  }
  if (run !== -1) rules.push(Math.round((run + h - 1) / 2));
  return rules;
}

/** 날짜처럼 보이는 짧은 글자인지 (9/8, 9월 8일) */
function looksLikeDate(text) {
  return /\d{1,2}\s*[/월.]\s*\d{1,2}/.test(text);
}

/**
 * 표를 되살려 사람이 읽을 수 있는 글로 바꾼다.
 * @returns {string|null} 표가 아니면 null
 */
export async function reconstructTable(worker, canvas, plain, data, onProgress) {
  const words = (data.words || [])
    .filter((w) => w.text && w.text.trim())
    .map((w) => ({
      x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1,
      t: w.text.trim(),
    }));
  if (words.length < 10) return null;

  const rows = groupIntoRows(words);
  const pageWidth = Math.max(...words.map((w) => w.x1));
  const cols = detectColumns(rows, pageWidth);

  // 열이 하나뿐이면 표가 아니다 (그냥 카톡 캡쳐 등)
  if (cols.length < 2 || rows.length < 4) return null;

  const columnOf = (w) => {
    let idx = 0;
    for (let i = 0; i < cols.length; i++) if (w.x0 >= cols[i] - 20) idx = i;
    return idx;
  };

  // 첫 열의 라벨은 따로 읽는다 (통째로 읽으면 자주 빠진다)
  const labelRight = cols.length > 1 ? cols[1] - 10 : 0;
  const bands = findInkBands(plain, Math.max(0, cols[0] - 20), labelRight);
  const labels = [];
  await worker.setParameters({ tessedit_pageseg_mode: "7" });
  for (let i = 0; i < bands.length && i < 12; i++) {
    if (onProgress) onProgress("칸 이름 읽는 중", Math.round(((i + 1) / bands.length) * 100));
    const [y0, y1] = bands[i];
    const pad = Math.round((y1 - y0) * 0.5) + 6;
    const crop = document.createElement("canvas");
    const cw = labelRight - Math.max(0, cols[0] - 20);
    const ch = Math.min(canvas.height, y1 + pad) - Math.max(0, y0 - pad);
    if (cw < 10 || ch < 10) continue;
    crop.width = cw * 2;
    crop.height = ch * 2;
    const cctx = crop.getContext("2d");
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(
      canvas, Math.max(0, cols[0] - 20), Math.max(0, y0 - pad), cw, ch,
      0, 0, crop.width, crop.height
    );
    const r = await worker.recognize(crop);
    // 표의 세로 테두리가 "ㅣ" "|" 같은 글자로 딸려 들어온다. 앞뒤에서 걷어낸다.
    const cleaned = (r.data.text || "")
      .replace(/[~_]+/g, " ")
      .replace(/^[\s|ㅣlI]+/, "")
      .replace(/[\s|ㅣ]+$/, "")
      .trim();
    labels.push({ y0, y1, text: cleaned });
  }
  await worker.setParameters({ tessedit_pageseg_mode: "3" });

  // 각 행을 열별로 나눈다.
  // 글자를 하나씩 이어 붙이면 한글이 "채 점 하기"처럼 벌어지므로,
  // 한 열 안에만 있는 줄은 Tesseract가 준 원문 줄을 그대로 쓴다.
  // 마지막 열이 "제출 날짜" 칸인지 먼저 판단한다.
  // 날짜가 하나도 없으면 그 열도 숙제 내용이므로 본문에 넣어야 한다.
  // (표에 따라 [구분|암기테스트|내용] 처럼 본문 칸이 둘일 수도 있다)
  const lastIdx = cols.length - 1;
  const hasDateColumn =
    cols.length > 2 &&
    rows.some((row) =>
      row.words.some((w) => columnOf(w) === lastIdx && looksLikeDate(w.t))
    );
  const bodyLastIdx = hasDateColumn ? lastIdx - 1 : lastIdx;

  const laid = rows.map((row) => {
    const height = row.y1 - row.y0;
    const cells = cols.map(() => []);
    for (const w of row.words) cells[columnOf(w)].push(w);

    const rowMid = (row.y0 + row.y1) / 2;
    // 본문 칸들(첫 열=칸 이름, 날짜 열 제외)을 칸별로 따로 담는다.
    // 한 줄로 합치면 "암기테스트" 칸과 "내용" 칸이 뒤섞이므로 칸별로 모아 둔다.
    const byColumn = [];
    for (let i = 1; i <= bodyLastIdx; i++) {
      const cell = cells[i] || [];
      if (!cell.length) {
        byColumn.push("");
        continue;
      }
      // Tesseract는 표에서 단어 순서를 뒤섞어 돌려주는 일이 잦다
      // ("1. 5과 대화문" -> "과 대 화 문 1. 5"). 그래서 한 칸 안에 온전히
      // 들어가는 줄이 있으면 그 원문을 쓰고, 없을 때만 단어를 이어 붙인다.
      const left = cols[i] - 20;
      const right = i < lastIdx ? cols[i + 1] - 20 : Infinity;
      const line = (data.lines || []).find(
        (l) =>
          Math.abs((l.bbox.y0 + l.bbox.y1) / 2 - rowMid) < height * 0.5 &&
          l.bbox.x0 >= left &&
          l.bbox.x1 <= right
      );
      const text = line && line.text ? line.text.trim() : joinWords(cell, height);
      byColumn.push(text.replace(/^[|ㅣ]\s*/, "").trim());
    }

    return {
      y0: row.y0,
      mid: rowMid,
      byColumn,
      date: hasDateColumn ? joinWords(cells[lastIdx] || [], height) : "",
    };
  });

  // 표의 가로 구분선으로 구역을 나눈다.
  // 라벨은 칸 한가운데 있어서 라벨 위치만으로 나누면 위아래가 섞인다.
  const rules = findHorizontalRules(plain);
  const bounds = [0, ...rules, canvas.height];
  const sections = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (bounds[i + 1] - bounds[i] < 20) continue; // 너무 얇은 구역은 선 자체
    // cols: 칸(열)별 줄 모음. 행 단위로 합치면 "암기테스트" 칸과 "내용" 칸이
    // 한 줄에 뒤엉키므로, 칸별로 모았다가 왼쪽 칸부터 차례로 펴서 내보낸다.
    sections.push({ top: bounds[i], bottom: bounds[i + 1], name: "", cols: [], date: "" });
  }
  if (sections.length < 2) return null;

  const findSection = (y) =>
    sections.find((s) => y >= s.top && y < s.bottom) || null;

  // 칸 이름을 제 구역에 넣는다
  for (const label of labels) {
    if (!label.text) continue;
    const s = findSection((label.y0 + label.y1) / 2);
    if (s && !s.name) s.name = label.text;
  }

  for (const row of laid) {
    const s = findSection(row.mid);
    if (!s) continue;
    row.byColumn.forEach((text, i) => {
      if (!text) return;
      if (!s.cols[i]) s.cols[i] = [];
      s.cols[i].push(text);
    });
    if (row.date && looksLikeDate(row.date) && !s.date) s.date = row.date;
  }

  // 칸별로 모아 둔 줄을 왼쪽 칸부터 이어 붙인다.
  // 한 항목이 칸 너비에 걸려 여러 줄로 접힌 경우가 많으므로,
  // 번호(1. / 2)) · 글머리표로 시작하지 않는 줄은 앞 줄에 이어 붙인다.
  for (const s of sections) {
    s.lines = s.cols
      .filter(Boolean)
      .reduce((all, one) => all.concat(mergeWrapped(one)), []);
  }

  // 첫 구역은 표의 머리글(구분/제출 날짜 등)이라 버린다
  const useful = sections.filter((s) => s.lines.length > 0);
  if (useful.length === 0) return null;
  const body = useful.length > 1 ? useful.slice(1) : useful;

  return body.map((s) => ({
    name: s.name || "",
    date: s.date || "",
    lines: s.lines.filter(Boolean),
  }));
}

/** 표에서 뽑은 구역들을 사람이 읽을 글로 (입력창에 보여줄 용도) */
export function sectionsToText(sections) {
  const out = [];
  for (const s of sections) {
    const head = [s.name, s.date ? "(제출 " + s.date + ")" : ""].filter(Boolean).join(" ");
    if (head) out.push(head);
    for (const line of s.lines) out.push(line);
    out.push("");
  }
  return out.join("\n").trim();
}

/**
 * "9/8", "9월 8일" 같은 제출일을 마감일(YYYY-MM-DD)로 바꾼다.
 * 올해 기준으로 보되, 이미 한참 지난 날짜면 내년 것으로 본다.
 * @returns {string} 못 알아보면 빈 문자열
 */
export function parseDueDate(text, today = new Date()) {
  if (typeof text !== "string") return "";
  const m = text.match(/(\d{1,2})\s*[/월.\-]\s*(\d{1,2})/);
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  let year = today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if ((base - candidate) / 86400000 > 180) year += 1;

  const pad = (n) => String(n).padStart(2, "0");
  return year + "-" + pad(month) + "-" + pad(day);
}
