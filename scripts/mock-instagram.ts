// 검증용 가짜 인스타그램 DM 화면. 실제 인스타그램과 같은 흐름(검색 → 선택 → 채팅 → 입력 → Enter)만 흉내 냄.
import { createServer, type Server } from "node:http";

export type MockIg = { server: Server; sent: { user: string; text: string }[]; requireLogin: boolean; url: string };

const PAGE = `<!doctype html><meta charset="utf-8"><title>Mock DM</title>
<style>body{font:15px sans-serif;margin:24px;max-width:560px}#thread div{background:#eef;margin:6px 0;padding:8px;border-radius:8px;white-space:pre-wrap}
[role=textbox]{border:1px solid #999;min-height:40px;padding:8px}</style>
<h1>새 메시지</h1>
<input name="queryBox" placeholder="검색...">
<div id="results"></div><div id="chat" hidden><div id="thread"></div><div role="textbox" contenteditable="true" aria-label="메시지"></div></div>
<script>
const q=document.querySelector('[name=queryBox]'),res=document.getElementById('results'),chat=document.getElementById('chat'),box=document.querySelector('[role=textbox]');
let user='';
q.addEventListener('input',()=>{res.innerHTML='';const v=q.value.trim();if(!v||v.startsWith('ghost'))return;
  const row=document.createElement('div');row.style.cssText='padding:10px;cursor:pointer';const s=document.createElement('span');s.textContent=v;row.append(s);
  row.onclick=()=>{user=v;res.innerHTML='';const b=document.createElement('button');b.textContent='채팅';b.onclick=()=>{b.remove();if(user.startsWith('locked')){document.body.append('메시지를 보낼 수 없습니다');return;}chat.hidden=false;};res.append(b);};
  res.append(row);});
box.addEventListener('keydown',async e=>{if(e.key!=='Enter')return;e.preventDefault();if(e.shiftKey){document.execCommand('insertText',false,'\\n');return;}
  const text=box.innerText;box.innerText='';await fetch('/sent',{method:'POST',body:JSON.stringify({user,text})});
  const d=document.createElement('div');d.textContent=text;document.getElementById('thread').append(d);});
</script>`;

export function startMockInstagram(port = 4100): Promise<MockIg> {
  const state: MockIg = { server: null as unknown as Server, sent: [], requireLogin: false, url: `http://127.0.0.1:${port}` };
  state.server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/sent") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        state.sent.push(JSON.parse(body));
        res.end("ok");
      });
      return;
    }
    if (req.url?.startsWith("/accounts/login")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><meta charset="utf-8"><form><input name="username"><input name="password" type="password"></form>`);
    }
    if (state.requireLogin) {
      res.statusCode = 302;
      res.setHeader("Location", "/accounts/login/");
      return res.end();
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(PAGE);
  });
  return new Promise((resolve) => state.server.listen(port, "127.0.0.1", () => resolve(state)));
}
