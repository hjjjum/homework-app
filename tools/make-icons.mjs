// ---------------------------------------------------------------------------
// make-icons.mjs — 홈 화면 아이콘(PNG)을 만든다.
//
//   node tools/make-icons.mjs
//
// 앱 자체는 빌드 도구를 쓰지 않지만, 아이콘은 손으로 그린 그림이 아니라
// 색 토큰에서 나오는 것이라 이렇게 다시 만들 수 있게 해 둔다.
// (css/theme-sticker.css 의 색을 바꾸면 여기 COLORS 도 같이 고치고 다시 돌린다)
//
// 외부 라이브러리를 쓰지 않는다. Node에 들어 있는 zlib만으로 PNG를 쓰고,
// 도형은 4배로 그린 뒤 줄여서 가장자리를 부드럽게 만든다.
// ---------------------------------------------------------------------------

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// --- 색 (css/theme-sticker.css 와 같은 값) ----------------------------------
const C = {
  paper: "#FFFCF5",
  ink: "#2F2A33",
  inkSoft: "#B7AEB8",
  coral: "#FF5B3E",
  pink: "#FF7FAE",
  yellow: "#FFC93C",
  sky: "#8FD9EE",
  green: "#3FA86B",
  lilac: "#B9A7F0",
  white: "#FFFFFF",
};

// --- 아주 작은 래스터라이저 --------------------------------------------------
// 좌표는 전부 0~1 (아이콘 한 변을 1로 본다). 어떤 크기로도 같은 그림이 나온다.

/** "#RRGGBB" 또는 "#RRGGBBAA" → [r, g, b, a] (a는 0~1) */
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  h.length > 7 ? parseInt(h.slice(7, 9), 16) / 255 : 1,
];

/**
 * 부드러운 원형 그라데이션. 색 대신 이 함수를 주면 자리마다 색이 달라진다.
 * (원 하나를 얹으면 그 테두리가 선처럼 보여서 대신 쓴다)
 */
const radial = (cx, cy, r, from, to) => {
  const a = hex(from);
  const b = hex(to);
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / r;
    const t = d <= 0 ? 0 : d >= 1 ? 1 : d * d * (3 - 2 * d); // 부드럽게
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      1,
    ];
  };
};

/** 둥근 사각형 */
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

/** 타원 (원은 rx == ry) */
const ellipse = (cx, cy, rx, ry) => (x, y) => {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
};

/** 기울어진 타원 (잎사귀에 쓴다) */
const leaf = (cx, cy, rx, ry, deg) => {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * cos + dy * sin) / rx;
    const v = (-dx * sin + dy * cos) / ry;
    return u * u + v * v <= 1;
  };
};

/** 양끝이 둥근 선 (체크 표시, 줄, 줄기에 쓴다) */
const capsule = (x0, y0, x1, y1, w) => (x, y) => {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((x - x0) * vx + (y - y0) * vy) / len2;
  t = Math.min(1, Math.max(0, t));
  const dx = x - (x0 + t * vx);
  const dy = y - (y0 + t * vy);
  return dx * dx + dy * dy <= (w / 2) * (w / 2);
};

/** 별 (뾰족한 꼭짓점 n개) */
const star = (cx, cy, rOut, rIn, n = 5, rot = -Math.PI / 2) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return polygon(pts);
};

/** 볼록/오목 상관없는 다각형 (홀짝 규칙) */
const polygon = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** 하트 — 원 두 개 + 아래로 모이는 삼각형 */
const heart = (cx, cy, w) => {
  const r = w * 0.27;
  const a = ellipse(cx - r * 0.92, cy - r * 0.5, r, r);
  const b = ellipse(cx + r * 0.92, cy - r * 0.5, r, r);
  const c = polygon([
    [cx - w * 0.5, cy - r * 0.42],
    [cx + w * 0.5, cy - r * 0.42],
    [cx, cy + w * 0.56],
  ]);
  return (x, y) => a(x, y) || b(x, y) || c(x, y);
};

/**
 * 도형 목록을 그려 PNG 바이트를 만든다.
 * 뒤에 오는 도형이 앞의 것을 덮는다 (그림 순서 그대로).
 */
function render(size, shapes, ss = 4) {
  const n = size * ss;
  const px = Buffer.alloc(n * n * 3);
  const prepared = shapes.map((s) => ({
    hit: s.hit,
    // color는 "#rrggbb(aa)" 또는 자리마다 색을 정하는 함수(radial)
    paint: typeof s.color === "function" ? s.color : (() => { const c = hex(s.color); return () => c; })(),
  }));

  for (let py = 0; py < n; py++) {
    const y = (py + 0.5) / n;
    for (let pxi = 0; pxi < n; pxi++) {
      const x = (pxi + 0.5) / n;
      const o = (py * n + pxi) * 3;
      for (const s of prepared) {
        if (!s.hit(x, y)) continue;
        const rgb = s.paint(x, y);
        const a = rgb[3];
        if (a >= 1) {
          px[o] = rgb[0];
          px[o + 1] = rgb[1];
          px[o + 2] = rgb[2];
        } else {
          // 반투명 도형(그림자·광택)은 아래 색과 섞는다
          px[o] = px[o] + (rgb[0] - px[o]) * a;
          px[o + 1] = px[o + 1] + (rgb[1] - px[o + 1]) * a;
          px[o + 2] = px[o + 2] + (rgb[2] - px[o + 2]) * a;
        }
      }
    }
  }

  // 4배로 그린 것을 줄인다 (가장자리 계단이 사라진다)
  const out = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    out[y * (size * 3 + 1)] = 0; // 필터 없음
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const o = ((y * ss + dy) * n + (x * ss + dx)) * 3;
          r += px[o];
          g += px[o + 1];
          b += px[o + 2];
        }
      }
      const k = ss * ss;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      out[o] = Math.round(r / k);
      out[o + 1] = Math.round(g / k);
      out[o + 2] = Math.round(b / k);
    }
  }
  return encodePng(size, size, out);
}

// --- PNG 쓰기 ---------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rawScanlines) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 채널당 8비트
  ihdr[9] = 2; // 트루컬러 (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rawScanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- 아이콘 도안 -------------------------------------------------------------
//
// 안드로이드는 아이콘 가장자리를 잘라내므로(maskable), 중요한 그림은
// 한가운데 원(반지름 0.4) 안에만 둔다. 배경은 끝까지 채운다.

/** 공책 카드 + 체크된 줄 세 개 — 세 아이콘이 함께 쓰는 바탕 그림 */
function noteCard() {
  const line = (y, x1) => ({ hit: capsule(0.38, y, x1, y, 0.038), color: C.inkSoft });
  return [
    // 카드가 살짝 떠 보이도록 아래에 그림자 한 겹
    { hit: roundRect(0.245, 0.30, 0.775, 0.775, 0.075), color: "#00000018" },
    { hit: roundRect(0.235, 0.285, 0.765, 0.76, 0.075), color: C.white },
    // 첫 줄은 완료 표시(초록 체크), 나머지는 아직 남은 줄
    { hit: capsule(0.30, 0.425, 0.335, 0.462, 0.05), color: C.green },
    { hit: capsule(0.335, 0.462, 0.405, 0.375, 0.05), color: C.green },
    line(0.425, 0.70),
    { hit: ellipse(0.315, 0.545, 0.032, 0.032), color: C.inkSoft },
    line(0.545, 0.68),
    { hit: ellipse(0.315, 0.66, 0.032, 0.032), color: C.inkSoft },
    line(0.66, 0.62),
  ];
}

/** 배경: 왼쪽 위가 밝고 오른쪽 아래로 갈수록 짙어지는 한 겹 */
function background(light, deep) {
  return [{ hit: () => true, color: radial(0.26, 0.18, 1.05, light, deep) }];
}

const ICONS = {
  // 첫째 — 차분한 하늘색 + 노란 별
  daughter1: [
    ...background("#B3E7F5", "#6BC8E4"),
    ...noteCard(),
    { hit: star(0.705, 0.315, 0.135, 0.058), color: "#EAA31C" },
    { hit: star(0.705, 0.305, 0.135, 0.058), color: C.yellow },
  ],
  // 둘째 — 분홍 + 체리
  daughter2: [
    ...background("#FFA9CB", "#F76D9F"),
    ...noteCard(),
    { hit: capsule(0.715, 0.185, 0.655, 0.315, 0.021), color: C.green },
    { hit: capsule(0.715, 0.185, 0.775, 0.305, 0.021), color: C.green },
    { hit: leaf(0.783, 0.163, 0.072, 0.032, -22), color: "#57BE7F" },
    { hit: ellipse(0.648, 0.355, 0.074, 0.074), color: "#D62B27" },
    { hit: ellipse(0.782, 0.345, 0.065, 0.065), color: "#F24236" },
  ],
  // 엄마 — 연보라 + 하트 (보내는 마음)
  mom: [
    ...background("#CFC2F8", "#A38FE9"),
    ...noteCard(),
    { hit: heart(0.708, 0.305, 0.285), color: "#DC4630" },
    { hit: heart(0.708, 0.295, 0.285), color: C.coral },
  ],
};

// --- 실행 -------------------------------------------------------------------

const SIZES = [180, 192, 512];

mkdirSync(new URL("../icons/", import.meta.url), { recursive: true });

for (const [name, shapes] of Object.entries(ICONS)) {
  for (const size of SIZES) {
    const file = new URL(`../icons/${name}-${size}.png`, import.meta.url);
    writeFileSync(file, render(size, shapes));
    console.log("만듦:", `icons/${name}-${size}.png`);
  }
}
