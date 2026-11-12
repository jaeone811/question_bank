// 기존(legacy) 사이트의 고2 예시 패키지 3개를 그대로 가져옴.
// 풀버전 파일을 올리기 전까지는 사이트에 표시되지 않음.
import { getDb, schema } from "../src/db";

const now = Date.now();
const rows = [
  { id: "h2-eng", subject: "영어", title: "영어Ⅰ 모의고사 변형", description: "최근 모의고사 지문을 내신형으로 변형한 문제입니다.", price: 10900, sortOrder: 10 },
  { id: "h2-kor", subject: "국어", title: "문학 (천재 김동환)", description: "현대시·고전시가·소설 작품별 핵심 개념과 변형 문제입니다.", price: 10900, sortOrder: 20 },
  { id: "h2-math", subject: "수학", title: "수학Ⅰ 지수·로그함수", description: "단원별 기본·심화 문항과 학교 기출 유형 변형을 담았습니다.", price: 9900, sortOrder: 30 },
];
const db = getDb();
for (const r of rows) db.insert(schema.products).values({ ...r, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
console.log("패키지", db.select().from(schema.products).all().length, "개");
