// ---------------------------------------------------------------------------
// sources/index.js
// 사용할 수 있는 입력 소스 목록.
//
// 새 입력 방식을 추가하는 방법:
//   1. sources/auto-xxx.js 를 만들고 { id, label, parse } 를 default export 한다.
//      (parse는 원본 입력을 받아 할일 제목 문자열 배열을 돌려주면 된다)
//   2. 아래에 import 한 줄, INPUT_SOURCES 배열에 한 항목을 추가한다.
// 그러면 mom.html의 "입력 방법" 토글에 자동으로 나타난다. 다른 코드는 손댈 필요 없다.
// ---------------------------------------------------------------------------
import academy from "./academy-message.js";
import manual from "./manual-input.js";
import whole from "./whole-message.js";

// 순서가 화면의 "입력 방법" 버튼 순서다. 학원 메시지가 가장 자주 쓰이므로 맨 앞.
export const INPUT_SOURCES = [academy, manual, whole];

/** id로 입력 소스를 찾는다. 없으면 첫 번째(직접 입력)로 되돌린다. */
export function getSource(id) {
  return INPUT_SOURCES.find((s) => s.id === id) || INPUT_SOURCES[0];
}
