/* Cloudflare Worker — 정적 에셋 + UMEI(DX 예지보전·전기안전지수) 프록시.
   브라우저는 같은 출처의 /umei-api/... 만 부르고, 여기서 API 키(시크릿 UMEI_API_KEY)를 붙여 넘긴다.
   키는 번들·브라우저에 절대 나가지 않는다. 읽기 조회(GET)와 /api/v1/external/dx/ 경로만 허용. */

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  UMEI_API_KEY?: string;
}

const UMEI = 'https://umei.uyegdx.com';
const json = (status: number, message: string) =>
  new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/umei-api/')) return env.ASSETS.fetch(req);

    const path = url.pathname.slice('/umei-api'.length);
    if (req.method !== 'GET' || !path.startsWith('/api/v1/external/dx/')) return json(404, '허용되지 않은 경로입니다');
    if (!env.UMEI_API_KEY) return json(503, 'API key가 설정되지 않았습니다');

    const res = await fetch(UMEI + path + url.search, { headers: { 'X-API-Key': env.UMEI_API_KEY } });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  },
};
