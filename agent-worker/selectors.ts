// 인스타그램 웹 화면 선택자. 인스타가 화면을 바꾸면 여기만 고치면 됨.
export const IG = {
  loginUrl: /\/accounts\/(login|onetap|suspended)|\/challenge\/|\/two_factor/,
  loginForm: 'input[name="username"], input[name="password"]',
  dismissButtons: /^(Not Now|나중에 하기|Not now)$/,
  searchInput: 'input[name="queryBox"], input[placeholder*="Search"], input[placeholder*="검색"]',
  startChatButton: /^(Chat|채팅|Next|다음)$/,
  messageBox: 'div[role="textbox"][contenteditable="true"], textarea[placeholder*="Message"], textarea[placeholder*="메시지"]',
  sendFailed: /Couldn.t send|Failed to send|전송하지 못했습니다|보내지 못했습니다/,
  blocked: /can.t message this account|Not everyone can message|메시지를 보낼 수 없습니다/,
};
