# 프로젝트 컨텍스트

## 프로젝트 개요
배달 플랫폼(배민, 쿠팡이츠, 땡겨요, 요기요) + 가게(토스포스) 매출 데이터를 분석하는 **웹 대시보드**.
순수 HTML + JS 구조 (프레임워크 없음). Supabase(PostgreSQL) 백엔드.

## 파일 구조
```
ai_project/
├── index.html                ← HTML (UI 구조만, 343줄)
├── assets/
│   ├── css/
│   │   └── style.css         ← 전체 CSS (Apple Dark Design System)
│   └── js/
│       ├── app.js            ← 메인 앱 로직 (대시보드/진단/계산기/탭/초기화)
│       ├── parsers.js        ← DB/FILES 저장소 + 파서 함수 + 헬퍼 유틸
│       ├── drive.js          ← 파일 업로드 (loadXlsx2) + storeData + mergeSales/Purchase
│       ├── render.js         ← 기존 렌더 (clearAll, 일부 레거시 함수)
│       ├── settings.js       ← 설정 관리 (S 객체, applySettingsToUI, saveSettings)
│       ├── supabase.js       ← 인증 (SHA-256 로그인) + DB CRUD (save/load/delete)
│       └── menucost.js       ← 메뉴 원가 분석
├── scripts/
│   └── supabase_setup.sql    ← DB 스키마 + RPC 함수
├── CLAUDE.md                 ← 이 파일
├── .gitignore
└── .nojekyll
```

### JS 로드 순서 (index.html)
```
settings.js → parsers.js → drive.js → render.js → supabase.js → menucost.js → app.js
```
`app.js`가 마지막에 로드되어 `renderAll`, `updateFileList` 등을 오버라이드함.

## 지원 플랫폼
| 코드 | 플랫폼 | 색상 | 아이콘 | 파일명 패턴 |
|------|--------|------|--------|------------|
| `bm` | 배달의민족 | `#30d158` | 🛵 | `매출상세내역_...xlsx` / `매입상세내역_...xlsx` |
| `cp` | 쿠팡이츠 | `#ff453a` | 🧡 | `coupang_eats_YYYY-MM.xlsx` |
| `tg` | 땡겨요 | `#2D9E6B` | 🟢 | `땡겨요 정산내역(건별).xls` |
| `yg` | 요기요 | `#E5302A` | 🟠 | `요기요 YYYY년 MM월 매출.xlsx` |
| `ts` | 가게(토스포스) | `#6366f1` | 🏪 | `매출리포트-YYMMDD....xlsx` (결제 상세내역 시트, 배달 제외) |

## 데이터 흐름
```
파일 업로드 → handleFiles() [app.js]
  → loadXlsx2(files, pf) [drive.js]
    → parseBM_xlsx / parseCP_xlsx / parseTG_xlsx / parseYG_xlsx / parseTS_xlsx [parsers.js]
    → storeData(pf, data, filename) [drive.js]
      → mergeSales/mergePurchase → DB[pf][ym-key] 저장
      → saveToSupabase() [supabase.js]
    → renderAll() → renderFileList() + refreshAll() [app.js 오버라이드]
```

## 5개 탭 구성
1. **📁 데이터** — 파일 드래그&드롭 업로드, 파일 목록, 전체삭제
2. **📊 대시보드** — KPI 6개, 진단배너, 일별차트, 플랫폼카드, 캘린더, 월별요약
3. **🧾 메뉴·가격** — 쿠폰계산기, 적정가격 역산, 시뮬레이터
4. **🔴 돈새는곳** — 건강점수 링, 핵심진단, 비용분석, 광고ROI, 플랫폼공략
5. **⚙️ 설정** — 고정비, 원가율, 플랫폼별 수수료, BEP

## 인증 & Supabase
- 로그인: SHA-256 해시 → Supabase RPC `verify_access` (5회 실패 시 60초 잠금)
- 세션: `sessionStorage` (탭 닫으면 로그아웃)
- DB: `sales_data` 테이블 (platform, ym_key, data JSONB)
- RPC: `upsert_sales`, `delete_sales`, `clear_all_sales`, `verify_access`

## 주요 설정값 (S 객체)
- 고정비: 임대료 80만, 관리비 10만, 공과금 15만, 포장재 10만, 기타 5만, 생활비 200만
- 원가율(cogs): 35%
- 배민: 중개 6.8% + PG 1.3% + 부가세 0.68%, 건당 배달비 3,100원
- 쿠팡: 중개 7.8% + PG 2.8% + 부가세 2.5%, 건당 배달비 3,400원
- 땡겨요: 중개 9% + PG 3.3%, 건당 배달비 2,500원
- 요기요: 중개 12.5% + PG 3.3%, 건당 배달비 3,000원

## 디자인 시스템
- **Apple Dark Design System** (preview-dark.html 기준)
- 참조: `C:\Users\coehd\Downloads\awesome-design-md-main\design-md\apple\DESIGN.md`
- 폰트: Pretendard + Inter (SF Pro 폴백)
- 배경: `#000000` (메인) → `#1c1c1e` (secondary) → `#272729` (카드) → `#28282a` (elevated)
- 액센트: `#2997ff` (인터랙티브 전용)
- 그림자: `rgba(0,0,0,0.5) 0px 3px 30px` (카드 hover)
- 네비: `rgba(0,0,0,0.88)` + `backdrop-filter: blur(20px)`, 48px 높이
- 버튼: pill `980px` radius
- 카드: `12px` radius, border 없음

## GitHub
- 레포: https://github.com/CAIDUYUAN/ai_project
- 브랜치: main
- GitHub Pages: https://caiduyuan.github.io/ai_project/

## 협업 규칙
- 모든 답변은 **한국어**로
- 코드 수정 시 기존 구조(순수 JS, 프레임워크 없음) 유지
- 불필요한 추상화/리팩토링 금지, 요청한 것만 수정
- 모든 소스 파일은 이 프로젝트 폴더 안에 있어야 함
