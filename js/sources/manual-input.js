// ---------------------------------------------------------------------------
// sources/manual-input.js
// 입력 소스: "직접 입력"
//
// 입력 소스란 "할일 제목 목록을 어디서 얻어오는가"를 담당하는 모듈이다.
// 지금은 사람이 붙여넣은 텍스트를 줄 단위로 나누는 것 하나뿐이지만,
// 나중에 메시지를 자동으로 가져오는 방식(예: sources/auto-xxx.js)이 생기면
// 같은 모양(id / label / parse)만 맞춰 파일을 하나 추가하고
// sources/index.js에 한 줄 등록하면 끝나도록 만들어 두었다.
// ---------------------------------------------------------------------------

export const id = "manual";
export const label = "직접 입력";

/**
 * 여러 줄 텍스트를 할일 제목 배열로 나눈다.
 * 줄바꿈 기준으로 나누고, 앞뒤 공백을 제거하고, 빈 줄은 버린다.
 * @param {string} text
 * @returns {string[]}
 */
export function parseManualInput(text) {
  if (typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 입력 소스 공통 인터페이스: { id, label, parse } */
const source = { id, label, parse: parseManualInput };
export default source;
