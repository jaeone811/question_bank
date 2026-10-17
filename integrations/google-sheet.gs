/**
 * 구글 시트 연동 (선택)
 * 1. 구글 시트 만들고 확장 프로그램 > Apps Script 에 이 코드 붙여넣기
 * 2. 배포 > 새 배포 > 유형: 웹 앱, 실행: 나, 액세스: 모든 사용자
 * 3. 나온 /exec URL 을 `supabase secrets set GOOGLE_SHEET_WEBHOOK=<URL>` 로 등록
 *
 * 같은 주문번호 행이 있으면 상태만 갱신, 없으면 새 행 추가
 */
function doPost(e) {
  const o = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['주문번호', '입금자명', '받는 방법', '연락처', '상품', '결제 방식', '금액', '상태', '신청일시']);
  }
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().flat();
  const idx = ids.indexOf(o.order_no);
  if (idx > 0) {
    sheet.getRange(idx + 1, 8).setValue(o.status);
  } else {
    const contact = o.delivery_method === 'INSTAGRAM' ? '@' + o.instagram_id : o.email;
    sheet.appendRow([o.order_no, o.buyer_name, o.delivery_method, contact, o.product_id, o.payment_method, o.amount, o.status, o.created_at]);
  }
  return ContentService.createTextOutput('ok');
}
