// ---------------------------------------------------------------------------
// service-worker.js
// 정적 파일(html/css/js/아이콘)만 캐싱한다.
//
// Firestore 데이터는 여기서 건드리지 않는다. Firestore SDK가 이미 IndexedDB에
// 오프라인 지속성을 갖고 있어서(js/firebase-config.js의 persistentLocalCache),
// 온라인이 되면 알아서 다시 동기화한다. 서비스워커가 그 요청에 끼어들면
// 오히려 동기화가 깨지므로 googleapis 쪽 요청은 손대지 않고 그냥 통과시킨다.
//
// 파일을 고친 뒤 배포할 때는 아래 CACHE_VERSION을 올려야 사용자에게 새 버전이 간다.
// ---------------------------------------------------------------------------

const CACHE_VERSION = "v26";
const CACHE_NAME = "homework-app-" + CACHE_VERSION;

/** 설치할 때 미리 받아둘 파일들. 상대 경로라 GitHub Pages 하위 경로에서도 동작한다. */
const PRECACHE = [
  "./",
  "./index.html",
  "./daughter1.html",
  "./daughter2.html",
  "./mom.html",
  "./css/style.css",
  "./css/theme-sticker.css",
  "./js/app.js",
  "./js/mom.js",
  "./js/db.js",
  "./js/firebase-config.js",
  "./js/todo-logic.js",
  "./js/ocr.js",
  "./js/stickers.js",
  "./js/rewards.js",
  "./js/due-picker.js",
  "./js/todo-editor.js",
  "./js/sources/index.js",
  "./js/sources/manual-input.js",
  "./js/sources/whole-message.js",
  "./js/sources/academy-message.js",
  "./manifest-daughter1.json",
  "./manifest-daughter2.json",
  "./manifest-mom.json",
  "./icons/daughter1-180.png",
  "./icons/daughter1-192.png",
  "./icons/daughter1-512.png",
  "./icons/daughter2-180.png",
  "./icons/daughter2-192.png",
  "./icons/daughter2-512.png",
  "./icons/mom-180.png",
  "./icons/mom-192.png",
  "./icons/mom-512.png",
];

/** Firebase SDK가 올라오는 CDN. 버전이 URL에 박혀 있어 내용이 바뀌지 않는다. */
const CDN_PREFIX = "https://www.gstatic.com/firebasejs/";

/**
 * 리다이렉트를 거친 응답은 화면 이동(navigate) 요청에 그대로 쓸 수 없다.
 * 브라우저가 "redirected response"를 거부해서 오프라인일 때 흰 화면이 된다.
 * (로컬 개발 서버가 /a.html → /a 로 보내는 경우 등)
 * 그래서 본문만 꺼내 리다이렉트 흔적이 없는 새 응답으로 만들어 캐시한다.
 */
async function withoutRedirect(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 하나가 실패해도 설치 자체는 성공하도록 개별로 받는다.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (response.ok) await cache.put(url, await withoutRedirect(response));
          } catch (err) {
            console.warn("[sw] 미리 받기 실패:", url, err.message);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("homework-app-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** 캐시에 있으면 바로 주고, 뒤에서 조용히 새 버전을 받아둔다. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetching = fetch(request)
    .then(async (response) => {
      if (!response || !response.ok) return response;
      const safe = await withoutRedirect(response);
      cache.put(request, safe.clone());
      return safe;
    })
    .catch(() => null);

  return cached || (await fetching) || Response.error();
}

/**
 * 오프라인일 때 보여줄 화면을 캐시에서 찾는다. 순서대로 시도한다:
 *   1. 요청한 주소 그대로 (쿼리스트링은 무시)
 *   2. 확장자 없는 주소로 들어온 경우 (.html을 붙여서)
 *   3. 그래도 없으면 시작 화면 — 흰 화면보다는 낫다
 */
async function matchNavigation(cache, request) {
  const path = new URL(request.url).pathname;
  const candidates = [request, path, path + ".html", "./index.html"];
  for (const candidate of candidates) {
    const hit = await cache.match(candidate, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

/** 새 내용을 우선하되, 끊겨 있으면 캐시된 화면을 보여준다(흰 화면 방지). */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (!response || !response.ok) return response;
    const safe = await withoutRedirect(response);
    cache.put(request, safe.clone());
    return safe;
  } catch (err) {
    const cached = await matchNavigation(cache, request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Firestore/인증 등 구글 API 요청에는 절대 끼어들지 않는다.
  if (url.origin !== self.location.origin && !request.url.startsWith(CDN_PREFIX)) {
    return;
  }

  // 화면 이동(주소창 입력, 홈 화면 아이콘 실행)
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // 버전이 박힌 CDN 파일은 캐시 우선
  if (request.url.startsWith(CDN_PREFIX)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (!response || !response.ok) return response;
        const safe = await withoutRedirect(response);
        cache.put(request, safe.clone());
        return safe;
      })
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// 페이지에서 새 버전 즉시 적용을 요청할 때
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
