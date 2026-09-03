// ---------------------------------------------------------------------------
// sources/academy-message.js
// 입력 소스: "학원 메시지"
//
// 학원에서 오는 알림장은 형태가 제각각이지만 공통 구조가 있다.
//
//   머리말      ☑09/02 김은지T 대수 과고반   /  시리우스 중등과학
//   과제 시작   △ 과제  /  #숙제범위  /  과제 안내  /  Homework
//   항목들      ①②  1️⃣2️⃣  1. 2.  1) 2)  - •   또는 READING/GRAMMAR 같은 섹션
//   맺음말      다음시간 정석 지참해주세요 / 감사합니다
//
// 이 파서는 위 구조를 읽어서
//   - 제목(수업/학원 이름)
//   - 과목 (내용 속 단어로 추측)
//   - 세부 항목 배열 (딸 화면에서 하나씩 체크할 수 있게)
//   - 나머지 안내는 메모
// 로 나눈다. 추측이 틀릴 수 있으므로 엄마 화면에서 고칠 수 있게 되어 있다.
// ---------------------------------------------------------------------------

export const id = "academy";
export const label = "학원 메시지";
export const actionLabel = "숙제로 만들기";
export const hint =
  "학원에서 온 카톡을 그대로 붙여넣으세요. 과목을 알아서 고르고, 번호가 붙은 숙제는 하나씩 체크할 수 있게 나눕니다.";

/** 과목 목록. "기타"는 못 알아냈을 때 쓴다. */
export const SUBJECTS = ["수학", "영어", "과학", "국어", "사회", "기타"];

/**
 * 과목을 추측할 때 쓰는 단어들. [단어, 가중치]
 * 가중치 3 = 거의 확실 (과목명, 그 과목에서만 쓰는 교재)
 * 가중치 1 = 참고만 (다른 과목에도 나올 수 있는 말)
 */
const SUBJECT_KEYWORDS = {
  수학: [
    ["수학", 3], ["대수", 3], ["기하", 3], ["미적분", 3], ["정석", 3], ["쎈", 3],
    ["개념원리", 3], ["고쟁이", 3], ["블랙라벨", 3], ["일품", 2], ["rpm", 2],
    ["함수", 2], ["지수", 2], ["로그", 2], ["방정식", 2], ["부등식", 2],
    ["삼각", 2], ["도형", 2], ["확률", 2], ["통계", 2], ["유제", 2], ["연산", 2],
  ],
  영어: [
    ["영어", 3], ["english", 3], ["grammar", 3], ["listening", 3], ["reading", 3],
    ["vocabulary", 3], ["보카", 3], ["천일문", 3], ["toefl", 3], ["토플", 3],
    ["hackers", 3], ["해커스", 3], ["speaking", 2], ["writing", 2], ["vocab", 2],
    ["어휘", 2], ["novel", 2], ["dictation", 2], ["본문", 2], ["대화문", 2],
    ["단어", 1], ["문법", 1], ["독해", 1], ["chapter", 1],
  ],
  과학: [
    ["과학", 3], ["물리", 3], ["화학", 3], ["생물", 3], ["지구과학", 3], ["시리우스", 3],
    ["식물", 2], ["세포", 2], ["원소", 2], ["파동", 2], ["에너지", 2], ["물질", 2],
    ["실험", 2], ["관찰", 1],
  ],
  국어: [
    ["국어", 3], ["문학", 3], ["비문학", 3], ["올리드", 3], ["고전", 2], ["현대시", 2],
    ["소설", 2], ["독서", 2], ["화법", 2], ["작문", 2], ["수업노트", 1], ["지문", 1],
  ],
  사회: [
    ["사회", 3], ["역사", 3], ["한국사", 3], ["지리", 3], ["윤리", 2], ["정치", 2], ["경제", 2],
  ],
};

/** 여기부터 숙제 목록이 시작된다는 표시 */
const START_MARKERS = [
  /△\s*과제/,
  /#\s*숙제\s*범위/,
  /#\s*과제/,
  /과제\s*안내/,
  /^\s*과제\s*$/,
  /^\s*숙제\s*$/,
  /숙제\s*\(?\s*homework/i,
  /^\s*homework\s*$/i,
];

/** 여기부터는 숙제가 아니라 맺음말이라는 표시 */
const END_MARKERS = [
  /^##/,
  /감사합니다/,
  /수고하셨/,
  /수고하세요/,
  /다음\s*시간/,     // "다음시간 정석 지참해주시기 바랍니다"
  /다음\s*주/,
  /지참해\s*주/,
  /^△/,             // 과제 목록 뒤에 다시 나오는 △ 는 안내문
];

/** 항목 번호 표기들. 앞의 번호를 떼어내고 내용만 남긴다. */
const ITEM_PATTERNS = [
  /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/,          // ①②③
  /^[0-90-9]️?⃣\s*/,               // 1️⃣2️⃣ (키캡 이모지)
  /^\d{1,2}\s*[.)]\s*/,                                 // 1. 2)  (붙어 있어도 인식)
  /^[-•*·▶▪◆■]\s+/,                                    // - • *
];

/** 표로 온 숙제의 과목/영역 칸 (둘째 영어학원 형태) */
const SECTION_PATTERN =
  /^(READING|LISTENING|GRAMMAR|SPEAKING|WRITING|NOVEL|IB|VOCAB(?:ULARY)?|단어\s*\(?Vocabulary\)?|단어|어휘|본문|문법|독해)\b\s*[:|]?\s*/i;

/** 번호 없는 줄을 앞 항목에 이어 붙일 때 허용하는 최대 길이 */
const MAX_APPEND_LENGTH = 140;

/** 표 머리글이라 제목으로 쓰면 안 되는 말들 */
const TABLE_HEADER_WORDS = /제출\s*날짜|due\s*date|^구분|숙제\s*\(homework\)/i;

/** 머리말 앞뒤에서 떼어낼 장식 */
const DECOR = "\\s☑☒✅✔️■□▶△▲◆●※★☀✏️📄📢🔔📌📖";
const TITLE_TRIM_START = new RegExp("^[" + DECOR + "]+", "u");
const TITLE_TRIM_END = new RegExp("[" + DECOR + "]+$", "u");

// ===========================================================================
// 순수 함수
// ===========================================================================

/**
 * 글 안의 단어를 보고 과목을 추측한다.
 * @param {string} text
 * @returns {{subject: string, score: number, confident: boolean}}
 */
export function detectSubject(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { subject: "기타", score: 0, confident: false };
  }
  const lower = text.toLowerCase();

  let best = "기타";
  let bestScore = 0;
  let second = 0;

  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    let score = 0;
    for (const [word, weight] of keywords) {
      // 같은 단어가 여러 번 나오면 그만큼 더 센다 (최대 3번까지만)
      let from = 0;
      let hits = 0;
      while (hits < 3) {
        const at = lower.indexOf(word, from);
        if (at === -1) break;
        hits += 1;
        from = at + word.length;
      }
      score += hits * weight;
    }
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = subject;
    } else if (score > second) {
      second = score;
    }
  }

  // 1등과 2등이 비슷하면 확신할 수 없다고 표시한다
  const confident = bestScore >= 3 && bestScore > second;
  return { subject: bestScore > 0 ? best : "기타", score: bestScore, confident };
}

function matchItemPrefix(line) {
  for (const pattern of ITEM_PATTERNS) {
    const m = line.match(pattern);
    if (m) return line.slice(m[0].length).trim();
  }
  return null;
}

function matchSection(line) {
  const m = line.match(SECTION_PATTERN);
  if (!m) return null;
  const rest = line.slice(m[0].length).trim();
  return { name: m[1].trim(), rest };
}

/**
 * 학원 메시지 한 통을 숙제 하나로 읽는다.
 * @param {string} text
 * @returns {Array<{title:string, subject:string, items:string[], memo:string, subjectConfident:boolean}>}
 *          내용이 없으면 빈 배열
 */
export function parseAcademyMessage(text) {
  if (typeof text !== "string") return [];

  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter((l, i) => l !== "" || rawLines[i - 1] !== "");
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return [];

  // --- 제목: 첫 줄에서 앞뒤 장식을 걷어낸다 ---
  // 단, 첫 줄이 이미 숙제 항목이면(번호로 시작하면) 제목으로 쓰지 않는다.
  const firstIsItem =
    matchItemPrefix(lines[0]) !== null || matchSection(lines[0]) !== null;
  let title = firstIsItem
    ? ""
    : lines[0].replace(TITLE_TRIM_START, "").replace(TITLE_TRIM_END, "").trim();
  // 캡쳐를 읽으면 "구분 | 제출 날짜" 같은 표 머리글이 첫 줄로 잡힌다. 제목으로 쓰지 않는다.
  if (title && TABLE_HEADER_WORDS.test(title)) title = "";

  // --- 과제 시작 지점 찾기 ---
  let startAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (START_MARKERS.some((m) => m.test(lines[i]))) {
      startAt = i + 1; // 마커 줄 자체는 제외
      break;
    }
  }
  // 시작 표시가 없으면, 제목으로 쓴 첫 줄 다음부터 훑는다
  const from = startAt === -1 ? (firstIsItem ? 0 : 1) : startAt;

  const items = [];
  const memoLines = [];
  let ended = false;
  let section = "";     // READING / NOVEL 같은 영역 이름

  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") continue;

    if (END_MARKERS.some((m) => m.test(line))) {
      ended = true;
    }
    if (ended) {
      memoLines.push(line);
      continue;
    }

    const itemBody = matchItemPrefix(line);
    if (itemBody !== null) {
      // 영역 안의 항목이면 어느 영역인지 앞에 붙여준다
      if (itemBody) items.push(section ? section + " · " + itemBody : itemBody);
      continue;
    }

    const found = matchSection(line);
    if (found) {
      section = found.name;
      if (found.rest) {
        // 캡쳐를 읽으면 표의 한 칸이 "READING  3. 핸드북..." 처럼
        // 영역 이름과 항목이 같은 줄로 붙어 나온다. 그 경우 항목으로 살린다.
        const restBody = matchItemPrefix(found.rest);
        if (restBody !== null) {
          if (restBody) items.push(found.name + " · " + restBody);
        } else {
          // 뒤에 번호 항목이 이어지면 이 줄은 교재 안내일 뿐이므로 메모로.
          const nextIsItem =
            i + 1 < lines.length && matchItemPrefix(lines[i + 1]) !== null;
          if (nextIsItem) memoLines.push(found.name + " " + found.rest);
          else items.push(found.name + " " + found.rest);
        }
      }
      continue;
    }

    // 번호가 없는 줄: 바로 앞 항목의 설명으로 보고 이어 붙인다.
    // 다만 캡쳐를 읽은 글은 표의 다음 칸이 번호 없이 이어지는 경우가 많아,
    // 무작정 붙이면 여러 숙제가 한 덩어리가 된다. 앞 항목이 이미 길면
    // 새 항목으로 떼어 놓고 사람이 확인하게 한다.
    const last = items.length - 1;
    if (last >= 0 && items[last].length + line.length <= MAX_APPEND_LENGTH) {
      items[last] += " " + line;
    } else if (last >= 0) {
      items.push(section ? section + " · " + line : line);
    } else {
      memoLines.push(line);
    }
  }

  // 시작 표시가 없는데 항목도 하나도 못 찾았다면, 메시지 전체를 항목 하나로 둔다
  if (items.length === 0) {
    const body = lines.slice(1).filter((l) => l !== "");
    if (body.length > 0) items.push(body.join(" "));
  }

  const { subject, confident } = detectSubject(text);

  return [
    {
      title,
      subject,
      subjectConfident: confident,
      items: items.map((t) => t.trim()).filter(Boolean),
      memo: memoLines.join("\n").trim(),
    },
  ];
}

/** 입력 소스 공통 인터페이스 */
const source = { id, label, actionLabel, hint, parse: parseAcademyMessage };
export default source;
