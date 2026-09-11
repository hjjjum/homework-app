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

import {
  detectGrid, cellHasInk, stretchContrast, textLineHeight, lineIsColored, interpretTable,
} from "./ocr-table.js";

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
  // 표 테두리는 연한 회색인 경우가 많아 대비를 올리면 사라진다.
  // 선·칸 위치와 글자색을 재는 용도로 원본 색 그대로 확대한 것을 쓴다.
  const plain = upscaleOnly(img);
  const pixels = plain
    .getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, plain.width, plain.height);

  report("표 구조 살펴보는 중");
  const grid = detectGrid(pixels);

  report("글자 인식 준비 중");
  let quiet = false; // 칸마다 읽을 때는 칸 개수로 진행률을 따로 알린다
  const worker = await Tesseract.createWorker(LANGS, 1, {
    logger: (m) => {
      if (!quiet && m.status === "recognizing text") {
        report("글자 읽는 중", Math.round((m.progress || 0) * 100));
      }
    },
  });

  try {
    // 표(칸이 나뉜 숙제표)면 칸마다 따로 읽어 구조 그대로 돌려준다.
    // 표가 아니거나 해석에 실패하면 통째로 읽는다.
    if (grid) {
      try {
        quiet = true;
        const table = await readTable(worker, plain, pixels, grid, report);
        if (table.sections.length > 0) {
          return {
            text: sectionsToText(table.sections),
            confidence: table.confidence,
            sections: table.sections,
            cells: table.grid,
          };
        }
      } catch (err) {
        console.warn("[ocr] 표 인식 실패, 일반 방식으로 진행:", err.message);
      } finally {
        quiet = false;
        await worker.setParameters({ tessedit_pageseg_mode: "3" });
      }
    }

    const { data } = await worker.recognize(preprocess(img));
    return { text: cleanOcrText(data.text), confidence: data.confidence, sections: null };
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
// 학원 숙제표는 [영역 | 숙제 | 제출날짜] 처럼 칸이 나뉘어 있는데,
// 이미지를 통째로 읽으면 칸 경계가 사라져서 여러 숙제가 한 덩어리가 된다.
// 예전에는 글자 좌표로 열을 짐작했지만, 가운데 정렬된 표나 수업이 가로로
// 놓인 표(첫째 학원)에서 칸이 뒤섞였다. 지금은:
//   1. 픽셀에서 표의 가로·세로 선을 찾아 칸 격자를 만든다   (ocr-table.js detectGrid)
//   2. 칸마다 잘라서 대비를 따로 올린 뒤 따로 읽는다         (readTable)
//   3. 줄마다 글자색을 재어 둔다 — 검정=숙제, 색글씨=교재명/안내 (lineIsColored)
//   4. 칸 격자를 숙제 묶음으로 해석한다                     (ocr-table.js interpretTable)
// ===========================================================================

/** 칸 테두리선이 글자로 딸려 들어오지 않게 안쪽으로 들이는 폭 (px) */
const CELL_INSET = 4;
/** 잘라낸 칸 둘레에 두는 흰 여백. Tesseract는 글자가 가장자리에 붙으면 잘 못 읽는다. */
const CELL_PAD = 16;
/** 칸을 읽을 때 맞추는 글자 줄 높이 (px). 실제 숙제표 3장으로 40·50·60을 비교해 50이 가장 덜 틀렸다. */
const TARGET_LINE_HEIGHT = 50;

/** 날짜처럼 보이는 글자 (9/15, 9월 15일) */
const DATE_TEXT = /\d{1,2}\s*[/월.]\s*\d{1,2}/;

async function readTable(worker, plain, pixels, grid, report) {
  const ctx = plain.getContext("2d", { willReadFrequently: true });
  let confSum = 0;
  let confWeight = 0;

  /**
   * 칸 하나를 읽는다: 잘라서 → 대비 손질 → 글자 높이를 target 에 맞춰 확대/축소 → 인식.
   * 줄 좌표는 원래 이미지 기준으로 되돌려 준다 (글자색을 잴 때 쓴다).
   */
  async function readCell(rect, target) {
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    const region = stretchContrast(ctx.getImageData(rect.x0, rect.y0, w, h));
    // 너무 크게 키운 글자도 오히려 잘 틀린다. 칸마다 글자 높이를 재서 맞춘다.
    const lineHeight = textLineHeight(region);
    const k = lineHeight ? Math.min(2.5, Math.max(0.5, target / lineHeight)) : 1;
    const flat = document.createElement("canvas");
    flat.width = w;
    flat.height = h;
    flat.getContext("2d").putImageData(region, 0, 0);
    const crop = document.createElement("canvas");
    crop.width = Math.round(w * k) + CELL_PAD * 2;
    crop.height = Math.round(h * k) + CELL_PAD * 2;
    const cctx = crop.getContext("2d");
    cctx.fillStyle = "#fff";
    cctx.fillRect(0, 0, crop.width, crop.height);
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(flat, CELL_PAD, CELL_PAD, Math.round(w * k), Math.round(h * k));

    const { data } = await worker.recognize(crop, {}, { text: true, blocks: true });
    const back = (v, origin) => (v - CELL_PAD) / k + origin;
    const lines = [];
    for (const l of data.lines || []) {
      const text = (l.text || "").trim();
      if (!text) continue;
      const box = {
        x0: back(l.bbox.x0, rect.x0), x1: back(l.bbox.x1, rect.x0),
        y0: back(l.bbox.y0, rect.y0), y1: back(l.bbox.y1, rect.y0),
      };
      lines.push({ text, ...box, colored: lineIsColored(pixels, box), confidence: l.confidence || 0 });
    }
    return lines;
  }

  // --- 1차: 모든 칸을 여러 줄 글 상자로 읽는다 ---
  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  const total = grid.rows.length * grid.cols.length;
  let done = 0;
  const table = [];
  for (const row of grid.rows) {
    const cells = [];
    for (const col of grid.cols) {
      done++;
      report("칸 읽는 중", Math.round((done / total) * 100));
      const rect = {
        x0: col.x0 + CELL_INSET, x1: col.x1 - CELL_INSET,
        y0: row.y0 + CELL_INSET, y1: row.y1 - CELL_INSET,
      };
      const cell = { ...rect, lines: [], inked: false };
      cells.push(cell);
      if (rect.x1 - rect.x0 < 8 || rect.y1 - rect.y0 < 8 || !cellHasInk(pixels, rect)) continue;
      cell.inked = true;
      cell.lines = await readCell(rect, TARGET_LINE_HEIGHT);
      for (const l of cell.lines) {
        confSum += l.confidence * l.text.length;
        confWeight += l.text.length;
      }
    }
    table.push(cells);
  }

  // --- 2차: 제출 날짜 열에서 날짜를 못 읽은 칸만 다시 읽는다 ---
  // "9/17" 처럼 짧은 한 줄은 여러 줄 모드에서 자주 놓치거나 "as" 로 읽힌다.
  // 한 줄 모드 + 숫자만 허용으로 배율을 바꿔 가며 다시 읽는다.
  const lastCol = grid.cols.length - 1;
  const dateCol = [lastCol, lastCol - 1].find(
    (c) => c > 0 && table.some((cells, r) => r > 0 && cells[c].lines.some((l) => DATE_TEXT.test(l.text)))
  );
  const missing = dateCol === undefined ? [] : table
    .map((cells) => cells[dateCol])
    .filter((cell, r) => r > 0 && cell.inked && !cell.lines.some((l) => DATE_TEXT.test(l.text)));
  if (missing.length) {
    report("제출 날짜 다시 읽는 중");
    await worker.setParameters({
      tessedit_pageseg_mode: "7",
      tessedit_char_whitelist: "0123456789/.월일 ",
    });
    try {
      for (const cell of missing) {
        for (const target of [TARGET_LINE_HEIGHT, 36, 64]) {
          const lines = await readCell(cell, target);
          const hit = lines.find((l) => DATE_TEXT.test(l.text));
          if (hit) {
            cell.lines = [hit];
            break;
          }
        }
      }
    } finally {
      await worker.setParameters({ tessedit_char_whitelist: "" });
    }
  }

  return {
    sections: interpretTable(table),
    confidence: confWeight ? confSum / confWeight : 0,
    grid: table, // 디버깅용: 칸마다 읽은 줄
  };
}

/** 표에서 뽑은 숙제 묶음을 사람이 읽을 글로 (입력창에 보여줄 용도) */
export function sectionsToText(sections) {
  const out = [];
  for (const s of sections) {
    const head = [s.name, s.date ? "(제출 " + s.date + ")" : ""].filter(Boolean).join(" ");
    if (head) out.push(head);
    s.items.forEach((item, i) => out.push(i + 1 + ". " + item));
    if (s.memo) out.push(...s.memo.split("\n").map((m) => "※ " + m));
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
