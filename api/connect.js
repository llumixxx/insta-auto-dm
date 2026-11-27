// 모델에게 보내는 링크 1개: /api/connect?code=CONNECT_CODE → 버튼 2개 안내 페이지, &go=1 → 메타 로그인
import { authUrl } from '../lib/ig.js';
import { redis } from '../lib/store.js';
import { page } from '../lib/http.js';
import { CONNECT_CODE, APP_SECRET } from '../lib/config.js';

const IG_INVITES = 'https://www.instagram.com/accounts/manage_access/';

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const code = q.get('code');
  if (!APP_SECRET() || code !== CONNECT_CODE())
    return page('잘못된 링크예요', '관리자에게 연결 링크를 다시 받아주세요.', false);
  if (q.get('to') === 'ig') return new Response(null, { status: 302, headers: { Location: IG_INVITES, 'Cache-Control': 'no-store' } });
  if (!q.get('go')) return guide(code);
  const state = crypto.randomUUID();
  await redis.set(`state:${state}`, 1, { ex: 600 });
  return Response.redirect(authUrl(state), 302);
}

function guide(code) {
  const go = `/api/connect?code=${encodeURIComponent(code)}&go=1`;
  return new Response(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>자동 DM 연결</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,system-ui,'Apple SD Gothic Neo',sans-serif;background:#0e0f12;color:#f2f2f4;padding:28px 20px 40px}
.w{max-width:440px;margin:0 auto}h1{font-size:26px;margin:4px 0 6px}.lead{color:#a0a3ab;margin:0 0 26px;line-height:1.6}
.s{background:#1a1b20;border:2px solid #2a2c33;border-radius:20px;padding:20px;margin-bottom:16px;transition:.2s}
.s.on{border-color:#e1306c;box-shadow:0 0 0 4px rgba(225,48,108,.15)}.s.done{opacity:.55}
.h{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800}
.n{width:36px;height:36px;border-radius:50%;background:#e1306c;display:grid;place-items:center;font-size:18px;flex:none}
.done .n{background:#22a55a}
.t{color:#b7bac2;font-size:15px;line-height:1.65;margin:12px 0 16px}.t b{color:#fff}
a.b{display:block;text-align:center;text-decoration:none;color:#fff;background:#e1306c;border-radius:14px;padding:17px;font-size:18px;font-weight:800}
.done a.b{background:#3a3c44}.s:not(.on):not(.done) a.b{background:#3a3c44}
.f{color:#7d808a;font-size:13px;line-height:1.7;margin-top:26px}
</style></head><body><div class="w">
<h1>인스타 자동 DM 연결</h1>
<p class="lead">버튼 2개만 순서대로 누르면 끝나요. (약 1분)</p>

<div class="s on" id="s1"><div class="h"><span class="n" id="n1">1</span>초대 수락하기</div>
<p class="t">버튼을 누르면 인스타가 열려요.<br>위쪽 <b>'테스터 초대'</b> 탭 → <b>'수락'</b>을 누르고,<br><b>뒤로가기</b>로 이 화면에 돌아와요.</p>
<a class="b" id="b1" href="/api/connect?code=${encodeURIComponent(code)}&to=ig">① 초대 수락하러 가기</a>
<p class="t" style="margin:14px 0 0;font-size:13px">그래도 인스타 앱이 열리면 → 아래 주소를 복사해서 사파리/크롬 주소창에 붙여넣어 주세요.<br><span id="u" style="color:#fff;word-break:break-all">${IG_INVITES}</span> <button id="cp" style="margin-left:6px;background:#2a2c33;color:#fff;border:0;border-radius:8px;padding:6px 10px">복사</button></p></div>

<div class="s" id="s2"><div class="h"><span class="n">2</span>내 계정 연결하기</div>
<p class="t"><b>'Instagram으로 계속하기'</b>를 누르고,<br>나오는 화면마다 <b>파란 버튼</b>(계속·로그인·Continue·Save)만 누르면 돼요.<br>'연결 완료!'가 나오면 끝이에요.</p>
<a class="b" href="${go}">② 연결하기</a></div>

<p class="f">· 개인 계정이면 중간에 '크리에이터'로 바꾸는 화면이 나와요. 크리에이터 → 다음 → 건강/뷰티 → 완료 → 계속하기 순서로 눌러주세요.<br>
· 비밀번호는 인스타그램 공식 화면에만 입력되며 저희에게 전달되지 않습니다. DM 내용은 읽지 않습니다.</p>
</div><script>
function mark(){try{if(localStorage.getItem('j1')){s1.classList.remove('on');s1.classList.add('done');n1.textContent='✓';s2.classList.add('on')}}catch(e){}}
b1.addEventListener('click',function(e){try{localStorage.setItem('j1','1')}catch(x){}e.preventDefault();var h=b1.href;setTimeout(function(){location.href=h},0)});
cp.addEventListener('click',function(){try{localStorage.setItem('j1','1')}catch(x){}var t=u.textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){cp.textContent='복사됨'},function(){var r=document.createRange();r.selectNodeContents(u);var s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');cp.textContent='복사됨'})});
mark();addEventListener('pageshow',mark);
</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
