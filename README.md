# Topicwake

Rust 기반의 읽기 전용 Zenoh 관찰 도구. BattleBang 저장소와 독립적으로 실행합니다.
Mac 앱 또는 브라우저에서 실제 수신한 토픽과 최신 데이터를 확인합니다.
Mac 배포 대상은 **Apple Silicon(arm64)**입니다. Intel Mac 빌드는 제공하지 않습니다.

[GitHub 저장소](https://github.com/jongmoon-konglabs/topicwake) · [Actions](https://github.com/jongmoon-konglabs/topicwake/actions/workflows/macos-release.yml) · [Releases](https://github.com/jongmoon-konglabs/topicwake/releases)

## Mac 앱

소스 빌드에는 프로젝트의 Rust toolchain, Node.js/npm, Xcode Command Line Tools가 필요합니다.
프로젝트 루트에서 실행합니다.

```sh
npm --prefix frontend ci
scripts/desktop.sh build
scripts/desktop.sh run
```

기본 release 빌드 결과는 `src-tauri/target/release/bundle/macos/Topicwake.app`입니다.
`scripts/desktop.sh run`은 release 앱을 우선하고 없으면 `src-tauri/target/debug/bundle/macos/`의 앱을 사용합니다.
새 이름의 번들이 없으면 기존 `Zenoh Observatory.app` 빌드로 실행할 수 있습니다.
macOS LaunchServices로 앱을 열고 가져오기·데이터 폴더·Zenoh 설정 환경변수만 명시적으로 전달합니다.
빌드된 앱은 별도 브라우저나 터미널 서버 없이 실행하며, 빨간 닫기 버튼이나 앱 종료로 수집기도 종료합니다.
다시 실행하면 기존 창을 앞으로 가져옵니다. 창 기본 크기는 1280×800이고 작은 창에서는 목록에서 데이터를
열어 보는 화면으로 바뀝니다.

### 기존 계정 가져오기

`scripts/desktop.sh run`은 프로젝트 루트에 기존 `zenoh-admin.sqlite3`가 있으면 첫 실행의 가져오기
원본으로 지정합니다. SQLite online backup으로 WAL까지 일관되게 읽고, 원본 DB는 변경하지 않습니다.
계정과 비밀번호 해시는 보존하고 복사본의 세션은 비워 앱에서 다시 로그인합니다.

앱 DB는 기본적으로 `~/Library/Application Support/com.konglabs.zenoh-observatory/zenoh-admin.sqlite3`에
저장합니다. 이미 계정이 있는 앱 DB를 덮어쓰지 않습니다. 기존 앱 DB가 있는데 계정이 비어 있으면 가져오기를
중단하므로 DB를 임의 삭제하지 말고 오류를 확인하세요. Finder에서 처음 실행하면 프로젝트 DB 위치를
자동 탐색하지 않으며, 가져올 원본을 지정하지 않은 새 설치는 계정 만들기로 시작합니다.

앱 표시명과 새 번들 이름은 **Topicwake**지만, 기존 계정을 유지하려고 bundle identifier와 SQLite 파일명은
변경하지 않습니다. 소스 디렉터리·내부 Rust crate명도 `zenoh-admin`을 유지합니다.

앱의 고급 실행 설정은 `ZENOH_ADMIN_DATA_DIR`(절대 경로의 개인 전용 폴더),
`ZENOH_ADMIN_IMPORT_DB`(첫 실행에 가져올 원본), `ZENOH_ADMIN_CONFIG`(Zenoh JSON5)입니다.
앱은 임의의 루프백 포트를 직접 열며 웹 서버용 `ZENOH_ADMIN_PORT`·`ZENOH_ADMIN_DB`는 사용하지 않습니다.

### 네트워크 권한과 배포

macOS가 로컬 네트워크 접근을 요청하면 허용해야 대상 내부망을 관찰할 수 있습니다. 권한을 허용한 뒤에도
수신되지 않으면 앱을 종료·재실행하고 시스템 설정의 개인정보 보호 및 보안 → 로컬 네트워크를 확인하세요.
토픽이 0개라는 사실만으로 권한 거절을 판정하지 않습니다. Terminal 실행과 Finder 실행의 권한 조건이
다를 수 있습니다. [Apple 로컬 네트워크 안내](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)

로컬 `.app` 빌드는 외부 배포용 서명·공증 완료를 뜻하지 않습니다. 다른 Mac에 배포할 때는
[Tauri macOS 서명·공증 안내](https://v2.tauri.app/distribute/sign/macos/)에 따른 별도 검증이 필요합니다.

## GitHub Actions와 릴리스

공개 저장소의 Actions에서 macOS 앱을 수동 빌드할 수 있습니다. 수동 실행은 아티팩트만 만들고,
`vX.Y.Z` 태그를 push하면 버전 검사·테스트·Apple Silicon 빌드가 성공한 뒤 자동 릴리스 노트와 함께
`.app.zip`·`.dmg`·SHA-256 파일을 GitHub Release에 발행합니다. Intel Mac 빌드는 없습니다.

현재 배포 앱은 ad-hoc 서명만 사용하며 Apple 공증은 제공하지 않습니다. 태그 push의 발행 효과와
설치 한계는 [macOS 빌드와 릴리스](docs/releasing.md)를 먼저 확인하세요. 워크플로 소스가 있다는 사실과
실제 GitHub Actions 실행 성공은 별도 검증입니다.

## 브라우저 실행

기존 로컬 웹 실행도 유지합니다.

```sh
npm --prefix frontend ci
npm --prefix frontend run build
cargo run --locked
```

브라우저에서 <http://localhost:8080>을 엽니다. 계정이 없는 앱·웹 설치만 운영 계정을 생성합니다.
비밀번호는 최소 4자(Unicode scalar value 기준), 최대 256 UTF-8 바이트입니다.
기존 계정의 비밀번호는 변경·초기화하지 않습니다. 짧은 비밀번호는 추측하기 쉬우므로 로컬 전용으로 사용하세요.
웹 서버 SQLite DB는 현재 디렉터리의 `zenoh-admin.sqlite3`에 저장됩니다. `ZENOH_ADMIN_DB`로 경로,
`ZENOH_ADMIN_PORT`로 HTTP 포트, `ZENOH_ADMIN_CONFIG`로 Zenoh 설정 파일을 지정할 수 있습니다.
서버는 기본적으로 `127.0.0.1`에만 바인딩합니다. 다른 기기에서 직접 접속하는 배포 기능은 제공하지 않습니다.

## 관찰 범위와 안전

- `**` 구독으로 **실제로 수신한** 키만 표시합니다. 발행하지 않은 키, 과거 메시지, 별도 adminspace,
  연결되지 않은 네트워크 및 접근 권한으로 차단된 메시지는 목록에 없을 수 있습니다.
- 같은 SSID나 IP 대역이어도 멀티캐스트, 라우팅, 방화벽, 격리, Zenoh 설정에 따라 발견이 다릅니다.
- 원 발행자의 IP는 일반적인 Zenoh 샘플에서 보장되지 않으므로 미확인으로 표시합니다. 라우터 주소를
  원 발행자 주소로 추정하지 않습니다.
- 토픽과 페이로드 미리보기에는 메모리 상한이 있습니다. 검색은 토픽 이름만 대상으로 합니다.
- 마지막 수신 후 5초 이상이면 빨강, 5분 이상이면 기본 목록에서 숨깁니다. 장애 판정이나 삭제가 아니며,
  `오래된 토픽` 토글로 복원할 수 있습니다. 저주기 토픽도 이 기준에 걸릴 수 있습니다.
- `화면 일시정지`는 데이터와 5분 숨김 판정을 정지 시점에 고정합니다. 수집·조회는 계속되며 `계속` 후
  다음 정상 응답을 표시합니다. 조회 실패 때도 직전 목록 가시성을 유지하며 숨긴 토픽을 되살리지 않습니다.
- `수집 후 받은 수`는 서버 프로세스의 누적값입니다. 삭제 샘플은 `삭제 알림`으로 구분합니다.
- Zenoh 구독은 네트워크와 수집 호스트에 부하를 줄 수 있습니다. 이 도구는 토픽 쓰기나 로봇 명령 기능이 없습니다.
- 넓은 화면은 네트워크 정보·토픽 목록·데이터를 나란히 표시합니다. 가운데 최대90rem 프레임으로
  폭을 제한하며, 좁은 화면에서는 네트워크 정보를 접고 목록에서 데이터를 열어 봅니다.
- 네트워크 정보에는 `서버 IP`·Wi-Fi·인터넷 검사를 표시하고 `모든 IP 주소`에서 전체 주소를 확인합니다.
  대표 IP는 기본 라우트나 Zenoh 실제 경로를 판별한 값이 아닙니다. 피어 수·ID 목록은 UI에 표시하지 않습니다.
- `수신한 토픽`은 서버가 보관한 서로 다른 키 수입니다. API의 연결된 Zenoh 피어 ID 수는 다른 단위이며
  물리 장치 수·토픽별 발행자 수가 아닙니다. ID와 토픽·IP의 대응 관계는 현재 제공하지 않습니다.
- Astryx 기반 Observatory 테마를 사용합니다. 선택한 행은 연한 파랑과 시작선으로 구분하며,
  데이터는 줄 번호·복사를 제공하는 코드 영역에서 확인합니다.
- 인터넷 검사 결과는 특정 대상 도달성일 뿐 인터넷 전체 상태가 아니며, 수동 요청 시에만 실행합니다.
- 로컬 전용 개발 도구이며 TLS, 다중 사용자, 권한 관리, 외부 배포 보안은 제공하지 않습니다.

## 문서

[제품 요구사항](docs/prd.md) · [아키텍처](docs/architecture.md) · [UX 설계](docs/design-system.md) · [검증 기준](docs/acceptance.md) · [릴리스](docs/releasing.md)
