# 담픽 주문 관리

고객 주문 조회·문고리 배송 신청과 관리자 고객·상품·주문·결제 관리를 제공하는 정적 웹사이트입니다.
HTML/CSS/일반 JavaScript를 사용하며, 인증·데이터는 Supabase, 카드결제는 토스페이먼츠에 연결합니다.
별도의 npm 설치나 빌드 과정은 없습니다.

## 파일 구성

```text
index.html                 고객 주문 조회·문고리 배송 신청
admin.html                 고객·상품·주문·매출 관리
payments.html              결제·배송·픽업 관리
payment-success.html       카드결제 승인 결과
payment-fail.html          카드결제 실패 안내
reset-password.html        관리자 비밀번호 재설정
assets/
  css/                     화면별 스타일
  js/                      화면별 동작 및 연결 설정
  images/                  로고·아이콘·공유 이미지
database/                  DB 의존성 안내 및 구버전 SQL
docs/legacy/               과거 수동 설치 안내(현재 절차 아님)
tests/                     연결 경로·문법·결제 입력 검증
manifest.json              홈 화면 설치 정보
service-worker.js          캐시 처리(기존 설치 사용자 호환을 위해 루트 유지)
```

기존 페이지 URL과 결제 성공·실패 URL은 유지했습니다. 각 HTML과 같은 이름의 CSS·JS를 수정하면 됩니다.
화면 간 링크와 스크립트 로딩 순서를 유지했으며, 인라인 이벤트가 사용하는 함수는 기존 전역 함수로 유지합니다.

## 로컬 확인

Python이 설치된 환경에서 프로젝트 폴더에서 실행합니다.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8000`에 접속합니다. 파일 더블클릭 대신 HTTP 서버를 사용하세요.
**현재 config.js는 기존 Supabase 프로젝트를 가리킵니다. 로컬 화면에서도 쓰기 작업은 실제 DB에 반영될 수 있습니다.**
독립적인 테스트는 별도의 Supabase 프로젝트와 테스트 결제 설정이 필요합니다.

Node.js가 있으면 자동 검증을 실행할 수 있습니다.

```sh
node --test
```

## 설정과 운영 주의사항

배송 날짜별 선택·결제와 서버 적용 절차는 [배송 묶음별 결제 안내](docs/delivery-checkout.md)를 참고하세요.
운영 데이터 없이 화면을 검증하려면 `node tests/preview-server.cjs`로 로컬 테스트 서버를 실행합니다.
이 서버는 가상 상품과 가상 카드 요청만 사용하며 실제 카드 승인 기능은 없습니다.

- `assets/js/config.js`: Supabase URL과 공개용 publishable/anon 키만 사용합니다. secret/service_role 키는 넣지 마세요.
- `assets/js/payment-config.js`: 토스 클라이언트 키를 설정합니다. 기본값은 빈 문자열이며 카드 신청을 차단합니다. 형식 검사 통과가 유효한 키 또는 정상 결제를 보장하지는 않습니다.
- 배송비는 현재 고객 화면 기준으로 **40,000원 초과 무료, 40,000원 이하 500원**입니다. 금액의 최종 검증은 서버에서 해야 합니다.
- 운영 DB의 최신 함수·테이블 및 결제 승인 함수 소스가 이 저장소에 모두 포함되어 있지 않습니다. [DB 확인 목록](database/README.md)을 먼저 확인하세요.
- `docs/legacy/` 안내와 `database/legacy/` SQL은 과거 버전입니다. 운영 DB에 그대로 실행하면 최신 함수를 덮어쓸 수 있습니다.
- 저장소는 공개되어 있습니다. 실고객 자료, 비밀번호, 토스 시크릿 키, DB 백업 데이터를 커밋하지 마세요.

## Git 작업

GitHub에서 변경한 내용을 받으려면 `git pull --ff-only`를 사용합니다.
PC 변경을 올릴 때는 변경 내용을 검토한 뒤 `git add`, `git commit`, `git push` 순서로 진행합니다.
자동 실시간 동기화가 아니며 push에는 GitHub 인증이 필요할 수 있습니다.
이번 정리는 로컬 파일만 수정하며, 배포나 운영 DB 변경은 포함하지 않습니다.
