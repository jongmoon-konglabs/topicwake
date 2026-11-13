# 아키텍처와 엔지니어링 기준

상태: 구현 소스 대조. 실제 파일·API가 권위이며, 빌드·앱 실행·실제 LAN 관찰 증거를 구분한다.

## 1. 경계

```text
브라우저 또는 Mac 앱 WebView ── 동일 출처 HTTP / 인증 세션 ── Rust 서버
                                           ├─ 인증·세션 ── SQLite
                                           ├─ 네트워크 상태 ── OS 인터페이스
                                           └─ Zenoh 관찰 ── LAN의 Zenoh 세션
                                                    ↓
                                              제한된 메모리 스냅샷
```

서버가 관찰 주체다. 브라우저는 IP·SSID·샘플을 직접 조사하지 않고 서버가 제공한 사실을 표시한다.
SQLite는 계정·세션용이며 토픽 이벤트 저장소가 아니다. Zenoh 네트워크 권한과 웹 로그인 권한은 별개다.

Mac 앱은 `src-tauri`의 Tauri 호스트가 같은 프로세스 안에서 `src/lib.rs`의 서버를 시작한다.
먼저 `127.0.0.1:0` listener를 바인딩하고 그 listener를 서버에 넘긴 뒤, 실제 할당된 주소만 WebView로
연다. 기존 8080 서버에 붙거나 포트를 해제한 뒤 재바인딩하지 않는다. 정적 UI는 앱 리소스의 `frontend/`에서
제공하므로 실행 작업 디렉터리에 의존하지 않는다. 웹 CLI는 `src/main.rs`가 같은 서버 라이브러리를 호출한다.

## 2. SRP: 변경 이유별 책임

| 책임 | 소유하는 것 | 소유하지 않는 것 |
| --- | --- | --- |
| 부트스트랩/설정 | 바인드 주소, DB 경로, Zenoh 설정, 서버·작업 수명 | 비밀번호 정책·검색 정렬 |
| 데스크톱 호스트 | 앱 데이터 경로·첫 DB 이관·네이티브 창·단일 인스턴스·종료 | 인증 우회·토픽 도메인 로직 |
| 인증 | 비밀번호 검증, 세션 발급·만료·폐기, 인증 경계 | Zenoh 접속·페이로드 파싱 |
| 네트워크 관찰 | 서버 IP·인터페이스·SSID·인터넷 탐지 결과 | 브라우저 네트워크 추정 |
| Zenoh 관찰 | 세션·구독 수명, 샘플 수신, 현재 연결된 Zenoh ID | 사용자 인증·HTML |
| 토픽 스냅샷 | 키별 최근 샘플, 바이트 제한, 건수·수신 시각 | 소켓·SQLite·UI 이벤트 |
| HTTP 어댑터 | 입력 검증, 인증 적용, 상태코드·JSON 매핑 | 중복 도메인 정책 |
| UI API 계층 | HTTP 호출·오류 변환 | 샘플 가공과 표 렌더링 혼합 |
| UI 선택 로직 | 순수한 검색·정렬·표시 변환 | fetch·전역 타이머 |
| UI 화면 | 로그인, 상태, 목록, 선택 상세와 사용자 입력 | 비밀번호 영구 저장 |

하나의 파일이 여러 책임을 가지면 변경 이유·테스트 격리를 기준으로 분리한다. 줄 수만 보고 쪼개지 않는다.
작은 함수에 인터페이스·서비스·레포지토리 계층을 의무적으로 추가하지 않는다.

## 3. 필요한 패턴만 사용

- **Adapter:** Zenoh·OS·SQLite의 I/O를 HTTP와 UI로부터 분리한다.
- **Snapshot projection:** 고속 샘플을 전체 이벤트 로그가 아니라 키별 최근 관찰 상태로 투영한다.
- **Dependency injection:** 테스트할 때 관찰 입력·저장 경로·시간을 대체할 수 있는 최소 경계를 둔다.
  실제 교체 수요가 없는 인터페이스와 generic repository는 만들지 않는다.
- **단일 수집 소유자:** 브라우저를 열 때마다 Zenoh 세션을 생성하지 않는다. 서버가 하나의 관찰 수명을 소유한다.

CQRS 인프라, event sourcing, plugin registry, microservice 분리는 범위에서 제외한다.

## 4. 데이터 의미와 불변식

- `topic`은 구체적으로 관찰한 Zenoh key expression이다. 발행 가능한 모든 이름의 디렉터리가 아니다.
- `received_at`은 서버 수신 시간이다. 발행자의 시계와 비교한 지연 수치로 재해석하지 않는다.
- `source_id`는 있을 때만 의미가 있다. 없음을 잘못된 값이나 세션 ID로 대체하지 않는다.
- `locator`는 광고·접속 경로다. 원 발행자 IP로 자동 승격하지 않는다.
- `payload_size`는 원본 크기이고 `preview` 길이와 다를 수 있다.
- `truncated`는 저장·표시 한도에 따른 절단이다. 절단된 JSON을 유효 JSON으로 가정하지 않는다.
- 오래 관찰되지 않았다는 사실과 Zenoh 세션 연결 실패는 다른 상태다.

정확한 wire field는 구현의 DTO를 따르며 클라이언트와 서버에서 동일하게 유지한다.

### 토픽 수와 연결 수는 다른 단위다

- **수신한 토픽 수:** `Observer.topics`의 서로 다른 key expression 수다. 한 키에서 여러 번 받아도
  한 토픽이며, 새 샘플은 누적 건수와 최근 데이터를 갱신한다. 상단 수량은 검색·5분 숨김 전의 보관된 키 수다.
- **연결된 Zenoh 피어 ID 수:** `/api/status`의 `peers` 배열 길이다. `SessionInfo.peers_zid()`로
  현재 연결된 피어의 Zenoh ID를 조회한다. `routers`는 별도로 `routers_zid()`에서 조회한다.
- **물리 장치 수·토픽별 발행자 수:** 현재 API는 이 값을 제공하지 않는다. 피어 ID 하나가 여러 토픽을
  보내거나 구독만 할 수 있고, 한 장치에 여러 Zenoh 세션이 있을 수 있다. 토픽 수와 같아야 할 이유가 없다.

예를 들어 `go2_04`, `go2_05`, `go2_06`, `go2_08`을 포함한 키가 각각 4개라면 관찰 키는 16개다.
이는 키 이름을 묶은 결과이지 장치 4대를 검증한 결과가 아니다. 같은 시점에 연결된 피어 ID가 34개여도
모순이 아니며, 현재 데이터만으로 각 ID가 어떤 장치·프로세스·토픽에 대응하는지 판별할 수 없다.
이 숫자들은 예시 설명이며 고정된 네트워크 현황이 아니다.

`source_id`·`source_ip`는 현재 수집기에서 항상 `None`으로 시작하며 채우지 않는다. 운영 UI에는 피어
수·ID 목록을 표시하지 않는다. API의 연결 ID 역시 발행자 매핑이 아니다. peer/router ID에서 IP를 추측하지 않으며 연결 locator도 현재
응답에 없다. 사용 API의 의미는 [Zenoh SessionInfo 문서](https://docs.rs/zenoh/latest/zenoh/session/struct.SessionInfo.html)를 따른다.

## 5. 네이밍

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| Rust module/function | `snake_case`, 책임을 드러내는 이름 | `observe_sample`, `network_status` |
| Rust type/enum | `PascalCase` | `TopicSnapshot`, `AuthSession` |
| Rust constant | `UPPER_SNAKE_CASE` | `MAX_PREVIEW_BYTES` |
| TypeScript 값/함수 | `camelCase` | `selectedTopic`, `filterTopics` |
| TypeScript component/type | `PascalCase` | `TopicInspector`, `NetworkStatus` |
| boolean | 판정문 | `isConnected`, `isTruncated` |
| 시간·바이트 | 단위 명시 | `receivedAtMs`, `previewBytes` |
| 문서 | lowercase kebab-case | `acceptance.md` |

`manager`, `utils`, `data`처럼 책임이 드러나지 않는 이름은 구체적인 도메인 용어로 바꾼다. wire key의
형식을 로컬 코드 취향 때문에 묵시적으로 변경하지 않는다.

## 6. 인증·보안 계약

### 위협 모델

보호 대상은 내부망 토픽의 내용과 관찰 서버의 인증정보다. 공격자는 같은 LAN 사용자, 악성 웹 페이지,
임의 문자열·바이너리를 발행하는 Zenoh peer일 수 있다. LAN을 신뢰 가능한 사용자 경계로 보지 않는다.

### 요구 통제

1. 비밀번호는 salt가 있는 적절한 password hash로 저장한다. 원문·공유 기본 비밀번호·로그 출력을 금지한다.
2. 세션 토큰은 예측 불가능하게 생성하고, 서버 측 유효성·만료·로그아웃을 검사한다.
3. 쿠키는 HttpOnly·SameSite를 사용한다. HTTPS 운영에서는 Secure를 적용한다.
4. 로그인 시도 제한, 일반화된 인증 실패 메시지, 요청 크기 제한을 둔다.
5. 네트워크·토픽 API는 인증을 요구한다. `/health` 등 최소 생존 상태가 공개라면 데이터는 넣지 않는다.
6. 상태 변경 요청은 동일 출처 검증/CSRF 방어를 적용한다. 모든 API에 무차별 CORS 허용을 두지 않는다.
7. 페이로드를 텍스트로 출력한다. `innerHTML`, eval, 자동 URL 실행을 사용하지 않는다.
8. DB·설정·자격정보는 정적 파일 경로에 두지 않는다. 실행 디렉터리의 비밀 파일을 커밋하지 않는다.
9. 바인딩은 루프백 우선이다. 외부 공개는 TLS와 방화벽 정책을 별도 운영 책임으로 둔다.
10. 서버 임의 URL 프록시·접속 endpoint 편집 UI는 제공하지 않는다.

특정 통제가 구현되지 않았다면 그 상태를 보안 잔여 위험으로 기록한다. 문서에 요구사항을 적은 사실은
구현·테스트 통과의 증거가 아니다.

## 7. 성능·수명

수집 루프와 느린 브라우저 응답을 분리한다. 스냅샷은 읽는 동안 필요한 최소 시간만 잠그고, 비밀번호 해시나
OS 명령 같은 blocking 작업은 async executor를 오래 점유하지 않게 처리한다. 키 수·preview 크기에 상한을
두며 고유 키 flood 시 동작을 정의한다. 종료 시 구독·세션·서버 작업을 정리한다. 무한 재시도와 조용한 성공
fallback은 금지한다.

## 8. 배포·복구

앱과 웹 서버는 각각 자기 프로세스와 DB를 소유한다. 앱은 네이티브 단일 인스턴스 플러그인으로 중복 실행 시
기존 창을 앞으로 가져온다. 빨간 닫기 버튼과 앱 종료는 HTTP 서버와 Zenoh 관찰 작업을 종료하며, 트레이에
숨겨 계속 수집하지 않는다. 데이터베이스를 여러 서버가 공유하는 배포는 지원하지 않는다.
종료·이전 버전 복귀가 네트워크 장비에 명령을 보내지 않아야 한다. DB 초기화는
계정·세션을 삭제하므로 일반 재시작 절차로 사용하지 않는다. 비밀번호 변경·계정 복구 절차는 실제 제공하는
CLI/환경설정을 확인한 운영 문서만 따른다.

### Mac 앱 저장과 첫 이관

- 기본 DB는 Tauri `app_data_dir()` 아래 `zenoh-admin.sqlite3`다. macOS identifier는
  `com.konglabs.zenoh-observatory`이며 기본 위치는 `~/Library/Application Support/com.konglabs.zenoh-observatory/`다.
- Topicwake는 표시명과 새 앱 번들 이름이다. 기존 계정을 보존하려고 identifier·SQLite 파일명·내부 crate명은
  변경하지 않는다. 앱 이름을 바꾸는 작업을 DB 초기화나 데이터 경로 변경으로 해석하지 않는다.
- `ZENOH_ADMIN_DATA_DIR`은 절대 경로의 개인 전용 폴더로 한정한다. 신규 폴더·DB에는 Unix 0700·0600을
  사용하고 다른 사용자의 접근 권한이 있는 기존 폴더는 거부한다.
- 대상 DB가 없고 `ZENOH_ADMIN_IMPORT_DB`를 지정하면 원본을 read-only로 열고 SQLite online backup으로
  임시 DB를 만든다. `users`를 확인하고 복사본의 `sessions`를 비운 뒤 대상 파일을 새로 연결한다.
  원본의 WAL·계정·세션을 변경하거나 대상 DB를 덮어쓰지 않는다. 이관 실패를 빈 계정 생성으로 숨기지 않는다.
- 계정이 있는 대상 DB가 우선이다. 명시적 이관을 요청했지만 기존 대상의 계정이 비어 있으면 오류로 중단한다.
- `scripts/desktop.sh run`만 프로젝트 DB를 이관 원본으로 지정한다. 앱 번들에 개발자 절대 경로·DB를 넣지
  않으며 Finder의 새 설치는 원본 위치를 자동 탐색하지 않는다. 가져온 비밀번호로 다시 로그인해야 한다.
- 실행 스크립트는 release 번들을 우선하고 없으면 debug 번들을 macOS `open --env`로 실행한다.
  가져오기·앱 데이터 폴더·Zenoh 설정만 전달하며, 상대 이관·설정 경로는 프로젝트 루트 기준 절대 경로로 바꾼다.

### Mac 앱 보안·권한 경계

HTTP는 실제 listener 포트의 `localhost`·`127.0.0.1` Host만 허용하고, Origin 헤더가 있으면 해당 Host의
HTTP origin과 일치해야 한다.
앱 WebView는 자신이 소유한 origin 밖의 navigation과 새 창을 차단한다. capabilities는 비어 있으며
웹 콘텐츠에 native IPC 권한을 부여하지 않는다. HTTP의 CSP·인증은 앱에서도 유지한다.
`?desktop=1`은 중복 제품 헤더를 줄이는 표시용 값일 뿐 인증이나 권한 판단에 사용하지 않는다.

`Info.plist`는 로컬 네트워크 사용 목적을 제공한다. macOS의 허용 여부는 세션 열림·토픽 0개만으로
추정하지 않는다. 권한 변경 후 재실행이 필요할 수 있으며, Finder 실행은 별도 검증 대상이다.
앱 패키지 생성은 Developer ID 서명·공증 완료나 모든 Mac에서의 실행 보장이 아니다.

## 9. HTTP API 소스 대조

2026-11-13 소스 `src/lib.rs`, `auth.rs`, `observer.rs`, `network.rs`를 읽어 확인한 계약이다.
다음 표는 실행 검증 결과가 아니다. 외부 공개 API 안정성을 약속하는 버전 정책도 아니다.

| Method / 경로 | 인증 | 의미 |
| --- | --- | --- |
| GET `/api/auth/status` | 불필요 | `setup_required` 제공 |
| POST `/api/auth/setup` | 최초 1회 | `username`, `password`로 관리자 생성, 기존 계정 있으면 409 |
| POST `/api/auth/login` | 자격정보 | 세션 쿠키와 username 반환, 실패 401·제한 429 |
| POST `/api/auth/logout` | 현재 세션 | DB 세션 폐기·쿠키 제거 |
| GET `/api/auth/me` | 필요 | 현재 username, 인증 실패 401 |
| GET `/api/status` | 필요 | Zenoh 세션·연결 ID·서버 인터페이스·SSID·오류 상태 |
| GET `/api/topics` | 필요 | 최근 관찰 토픽과 키·preview 제한 정보 |
| POST `/api/network/check` | 필요 | 사용자가 요청한 외부 DNS/TCP 도달성 검사 |

계정 생성 정책은 username 1–64바이트의 영숫자·`_`·`-`, password 최소 4 Unicode scalar values,
최대 256 UTF-8 바이트다. 최소 길이는 Rust `chars().count()`, 최대 크기는 `len()` 기준이다.
Unicode scalar 수는 바이트 수·사용자가 보는 글자 묶음(grapheme cluster) 수와 다를 수 있다. 이 변경은
최초 계정 생성 정책만 완화하며 기존 계정·비밀번호 해시·세션을 변경하거나 초기화하지 않는다. 로그인은 기존
비밀번호를 계속 검증한다. 최소 4자는 약한 비밀번호를 허용하므로 외부 공개를 위한 보안 정책이 아니다.
세션은 8시간이며 쿠키명은 `zenoh_session`이다.
로그인/초기화는 전역 2초 시도 간격과 한 개의 password hash 작업 슬롯으로 제한한다.

`/api/topics`의 `search`는 서버 구현 기준 key·payload 부분문자열이다. UI는 검색 인자 없이 전체 응답을
받고 토픽 이름만 클라이언트에서 필터링한다. UI 검색은 payload·source를 포함하지 않으며, 서버 API의
별도 검색 인자와 범위를 혼동하지 않는다.
서버 정렬은 `key`, `last_seen`, `message_count`와 `order=desc`를 처리한다. 기타 필드는 기본 key 정렬이다.

응답의 주요 토픽 필드는 다음과 같다.

| 필드 | 의미 |
| --- | --- |
| `key` | 실제 수신한 key expression |
| `message_count` | 서버 프로세스에서 관찰한 누적 샘플 수 |
| `kind` | 최신 샘플 종류 `put` 또는 `delete`; UI는 delete를 삭제 알림으로 표시 |
| `bytes` | 해당 키의 누적 수신 바이트 |
| `last_seen` | 서버 수신 epoch milliseconds |
| `payload` | 최근 텍스트 또는 binary hex 미리보기 |
| `encoding` | Zenoh encoding 문자열 |
| `source_id`, `source_ip` | 미확인 시 null; 현재 수집기는 값을 추론하지 않음 |
| `preview_truncated` | 원본이 preview 한도를 초과했는가 |
| `last_payload_bytes` | 최근 원본 payload 바이트 수 |

상위 응답은 `topics`, `truncated`, `max_topics`, `preview_bytes`를 제공한다. `truncated`는 새 키 제한
초과와 관련된 전역 상태이며, 각 payload의 절단 여부는 `preview_truncated`로 구분한다.

## 10. 소스에서 확인한 운영 제한

- 웹 CLI 포트 기본값은 8080이고 `ZENOH_ADMIN_PORT`로 바꾼다. 앱은 임의 포트를 사용한다. 둘 다 바인딩은 127.0.0.1이다.
- 웹 CLI의 `ZENOH_ADMIN_DB` 기본값은 실행 작업 디렉터리의 `zenoh-admin.sqlite3`다. 앱의 저장·이관 경로는 위 계약을 따른다.
- `ZENOH_ADMIN_CONFIG`는 선택적 Zenoh JSON5 파일 경로다. 비밀값을 UI에 노출하지 않는다.
- 초기 계정은 브라우저의 최초 설정에서 생성한다. 공개 원격 회원가입 기능이 아니다.
- SSID는 macOS의 `networksetup` 결과를 best-effort로 읽는다. 현재 `en0` 기준이므로 Wi-Fi 인터페이스가
  다른 장치, OS 권한·출력 차이가 있는 환경에서는 null일 수 있다. Ethernet·인터넷 상태를 대체하지 않는다.
- 인터넷 검사는 요청 시 `example.com:443`에 대해 최대 3초의 DNS/TCP 접속을 수행한다. 외부 접속이므로
  사용자 의식적 동작으로만 호출한다. 결과는 해당 목적지 도달성이지 일반 인터넷 품질이 아니다.
- 세션을 열고 `**`를 구독한다. 구독이 닫히면 오류를 기록하며 앱 수준의 자동 재시작 루프는 없다.
- 계정/토픽 상태를 읽는 API도 개인정보를 포함할 수 있으므로 로그인 뒤에 둔다.

## 11. 현재 polling 비용과 확장 경계

현재 UI는 목록 요약만 받는 것이 아니라 **모든 관찰 토픽의 최근 payload preview까지** `/api/topics`에서
조회한다. 요청 완료 후 약 1초 간격으로 다시 조회하며, 2,000개 × 8 KiB의 preview 상한을 채우면 원본
preview만 약 15.6 MiB다. 바이너리를 hex 문자열로 바꾸면 약 2배까지 커질 수 있고 JSON escaping·key·
메타데이터·HTTP 전송 비용은 별도로 더해진다. 상한은 무한 증가를 막지만 대용량 환경의 원활한 동작을
보장하지 않는다. 브라우저 parsing·메모리·검색·테이블 렌더링도 부하를 받는다.

이는 측정된 실제 처리량·벤치마크가 아니라 소스 상한으로 계산한 용량 위험이다. 고속·대용량 토픽을 포함한
실제 네트워크에서 성능을 별도 확인해야 한다. 대상 네트워크가 크면 Zenoh 설정으로 관찰 범위를 제한하거나
후속 최적화를 설계한다. 임의로 로봇의 발행률을 줄이는 방식으로 해결하지 않는다.

다음은 **미구현 후속 설계**다.

- 요약 목록 API와 선택 토픽 상세 API를 분리하여 미선택 payload를 반복 전송하지 않는다.
- 요약 응답에서도 토픽 이름만 검색하는 UI 계약을 유지한다.
- 기존 건수·바이트·원천 미확인·절단 flag를 보존하고, 요약/상세 간 시점 차이를 명시한다.

이 요약/상세 API 분리를 현재 지원하는 것처럼 설명하지 않는다. UI 검색은 사용자 요청에 따라 토픽 이름만
대상으로 하며, 기존 서버 API 검색 동작의 변경을 뜻하지 않는다.

## 12. UI 표시와 수집의 분리

`화면 일시정지`는 토픽·추정 수신량의 표시 스냅샷을 고정하며 HTTP polling과 서버 Zenoh 소비는 계속한다.
재개 시 다음 정상 응답을 반영한다. 정지·조회 실패에서는 라이브 속도·색상으로 오인시키지 않도록 미확인
상태를 쓴다. 정지 시에는 정지 시각, 조회 실패 시에는 실패 직전 렌더링에 사용한 시각으로 5분 가시성
판정을 고정한다. 이미 숨겨진 토픽을 오류 때문에 다시 표시하지 않으며, 재개 후 다음 정상 응답까지
고정을 유지한다. 로그아웃·401에서는 정지·검색·선택·표시 캐시를 초기화한다.
5분으로 목록에서 숨겨진 명시적 선택은 이름
검색과 일치하면 상세에 유지하고 숨김 안내를 붙인다.

polling 오류와 사용자 동작 오류는 별도 상태다. 정상 polling으로 복사·인터넷 검사 오류를 지우지 않는다.
인터넷 결과에는 검사 시각과 `example.com:443` 한정임을 표시한다. 이 UI 동작은 실제 네트워크·브라우저
검증 완료의 근거가 아니며, 결과는 별도 기록한다.

네트워크 UI의 대표 IP는 `primaryNetworkAddress`가 첫 non-loopback 주소를 고르는 표시용 휴리스틱이다.
없으면 첫 주소를 사용하며 전체 주소는 disclosure에 보존한다. 기본 라우트·SSID·Zenoh 연결 locator를
판별한 결과로 해석하지 않는다.

UI는 가운데 최대90rem 프레임 안에 작업영역을 둔다. 1100px 이상은 네트워크 정보 레일·토픽 목록·상세,
900–1099px는 목록·상세, 900px 미만은 목록에서 상세로 전환한다. 정보 레일은 네트워크 맥락을 표시하며
탐색 메뉴나 토픽별 발행자 목록이 아니다. 정확한 열·간격 계약은 [디자인 시스템](design-system.md)이 소유한다.
