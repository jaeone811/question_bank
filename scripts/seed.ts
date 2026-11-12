// 고2 예시 패키지 3개를 Supabase products 테이블에 추가
// 원본 파일을 올리기 전까지는 사이트에 표시되지 않음
import { getSupabase } from "../src/lib/supabase";

async function main() {
  const sb = getSupabase();
  const now = Date.now();
  const rows = [
    {
      id: "h2-eng",
      subject: "영어",
      title: "영어Ⅰ 모의고사 변형",
      grade: "고2",
      description: "최근 모의고사 지문을 내신형으로 변형한 문제입니다.",
      price: 10900,
      sort_order: 10,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: "h2-kor",
      subject: "국어",
      title: "문학 (천재 김동환)",
      grade: "고2",
      description: "현대시·고전시가·소설 작품별 핵심 개념과 변형 문제입니다.",
      price: 10900,
      sort_order: 20,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: "h2-math",
      subject: "수학",
      title: "수학Ⅰ 지수·로그함수",
      grade: "고2",
      description: "단원별 기본·심화 문항과 학교 기출 유형 변형을 담았습니다.",
      price: 9900,
      sort_order: 30,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ];

  const { error } = await sb.from("products").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`시드 실패: ${error.message}`);
  const { count } = await sb.from("products").select("id", { count: "exact", head: true });
  console.log("패키지", count ?? 0, "개 준비 완료");
}

void main();
