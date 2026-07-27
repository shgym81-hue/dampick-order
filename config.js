/*
  Supabase Dashboard에서 다음 값을 확인해 입력하세요.

  1. Project Settings → API → Project URL
  2. Project Settings → API → Publishable key 또는 anon key

  주의:
  - service_role key 또는 secret key는 절대로 넣지 마세요.
  - 이 파일은 GitHub 공개 저장소에 올라가므로 공개용 키만 사용해야 합니다.
*/

const SUPABASE_URL =
  "https://vkdqpyvurozfvdetbino.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable_K6Nnwo2TiceSP9FpM3l7oA_eT3C3qJT";

if (
  SUPABASE_URL.includes("여기에_") ||
  SUPABASE_PUBLIC_KEY.includes("여기에_")
) {
  console.warn("config.js에 Supabase 연결 정보를 입력해야 합니다.");
}

window.dampickSupabase =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY
  );
