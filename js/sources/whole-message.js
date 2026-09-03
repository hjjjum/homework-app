// ---------------------------------------------------------------------------
// sources/whole-message.js
// 입력 소스: "메시지 통째로"
//
// 학원 알림장처럼 여러 줄로 되어 있지만 실제로는 숙제 하나인 경우가 있다.
//
//   ☑09/02 김은지T 대수 과고반
//   △ 과제
//   ①내신 워크북 5-6단원 기본문제 및 유제 완성
//   ②쎈 프린트 완성
//
// 이걸 줄 단위로 쪼개면 "△ 과제" 같은 조각까지 할 일이 되어버린다.
// 그래서 이 소스는 줄바꿈을 그대로 둔 채 **하나의 할 일**로 만든다.
// ---------------------------------------------------------------------------

export const id = "whole";
export const label = "메시지 통째로";
export const actionLabel = "그대로 담기";
export const hint = "줄바꿈이 있어도 하나의 할 일로 담습니다. 학원 알림장을 그대로 붙여넣으세요.";

/**
 * 붙여넣은 글 전체를 할 일 하나로 만든다.
 * 줄 구조는 살리되, 각 줄 끝의 공백과 앞뒤 빈 줄은 정리하고
 * 빈 줄이 연달아 나오면 하나로 줄인다.
 * @param {string} text
 * @returns {string[]} 항목이 있으면 길이 1, 내용이 없으면 빈 배열
 */
export function parseWholeMessage(text) {
  if (typeof text !== "string") return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim());

  // 앞뒤 빈 줄 제거
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  // 연속된 빈 줄은 하나로
  const compact = lines.filter(
    (line, i) => line !== "" || lines[i - 1] !== ""
  );

  const joined = compact.join("\n");
  return joined ? [joined] : [];
}

/** 입력 소스 공통 인터페이스: { id, label, parse } */
const source = { id, label, actionLabel, hint, parse: parseWholeMessage };
export default source;
