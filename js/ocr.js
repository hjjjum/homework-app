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

  report("글자 인식 준비 중");
  const worker = await Tesseract.createWorker(LANGS, 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        report("글자 읽는 중", Math.round((m.progress || 0) * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(canvas);
    return { text: cleanOcrText(data.text), confidence: data.confidence };
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
