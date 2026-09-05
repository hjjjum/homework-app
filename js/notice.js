// ---------------------------------------------------------------------------
// notice.js
// 화면 위에 잠깐 떴다 사라지는 알림 배너. 지금은 "엄마가 숙제를 보냈어요"에만 쓴다.
//
// alert()·confirm()은 쓰지 않는다는 규칙이 있어서(브라우저 모달이 자동화 세션을
// 멈춘다) 배너로 만들었다. 화면을 가리지 않도록 맨 위에 붙고, 누르면 바로 닫힌다.
//
// 기기 알림(Notification API)은 쓰지 않는다 — 권한을 물어야 하고 거절당하면
// 되돌리기가 번거로워서, 앱을 보고 있을 때만 알리는 것으로 시작한다.
// ---------------------------------------------------------------------------

/** 배너가 저절로 사라지기까지 (ms). 읽을 시간은 주되 길게 남지 않을 만큼. */
const LIFETIME = 7000;

let current = null;   // 한 번에 하나만 띄운다

/**
 * 배너를 띄운다. 이미 떠 있으면 그것을 치우고 새로 띄운다.
 * @param {string} text 배너에 쓸 글
 * @param {{onClick?: () => void, vibrate?: boolean}} [options]
 * @returns {HTMLElement|null} 만들어진 배너 (화면이 없으면 null)
 */
export function showNotice(text, options) {
  if (typeof document === "undefined" || !document.body) return null;
  const opts = options || {};

  dismissNotice();

  const box = document.createElement("div");
  box.className = "notice";
  box.setAttribute("role", "status");
  box.appendChild(Object.assign(document.createElement("span"), {
    className: "notice-text",
    textContent: text,
  }));

  const close = document.createElement("button");
  close.type = "button";
  close.className = "notice-close";
  close.textContent = "확인";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissNotice();
  });
  box.appendChild(close);

  if (typeof opts.onClick === "function") {
    box.classList.add("notice--tappable");
    box.addEventListener("click", () => {
      opts.onClick();
      dismissNotice();
    });
  }

  document.body.appendChild(box);
  current = { el: box, timer: setTimeout(dismissNotice, LIFETIME) };

  if (opts.vibrate !== false && navigator.vibrate) {
    // 짧게 두 번 — 완료했을 때의 진동(한 번)과 구별되게
    try { navigator.vibrate([20, 70, 20]); } catch (e) { /* 지원 안 하면 넘어간다 */ }
  }

  return box;
}

/** 떠 있는 배너를 치운다. 없으면 아무 일도 하지 않는다. */
export function dismissNotice() {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}
