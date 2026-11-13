# macOS 빌드와 릴리스

Topicwake는 **Apple Silicon(arm64)** 전용 macOS 앱을 GitHub Actions로 빌드한다. Intel·Universal 빌드는
제공하지 않는다. 구현은 [macos-release.yml](../.github/workflows/macos-release.yml)이 기준이며, 아래 설명은
워크플로 소스 대조 결과다. 실제 GitHub Actions 성공이나 다운로드한 앱 실행을 보증하지 않는다.

## 실행 방법

| 실행 | 결과 |
| --- | --- |
| Actions에서 `macOS build and release`를 수동 실행 | 테스트·앱 빌드 후 Actions 아티팩트만 보관. Release는 만들지 않음 |
| `vX.Y.Z` 태그를 원격에 push | 같은 검증·빌드가 성공하면 해당 태그로 GitHub Release 발행 |

태그는 `v0.1.0` 같은 정식 버전 형식이어야 한다. 태그를 올리기 전에 루트와 `src-tauri`의 Cargo package·
lockfile, `src-tauri/tauri.conf.json` 버전을 함께 맞춘다. 워크플로는 불일치를 거부하며 prerelease 태그는
지원하지 않는다. `scripts/check-release-version.py`가 실제 버전 규칙을 소유한다.

릴리스하려면 먼저 변경을 검토·병합하고 수동 실행으로 빌드를 확인한다. 이후 발행할 커밋에 버전 태그를
만들어 push한다. **태그 push는 공개 릴리스 발행 요청**이므로 테스트용 태그를 올리지 않는다. 같은 태그로
이미 존재하는 Release를 자동 덮어쓰는 절차는 없다.

## 빌드와 산출물

- `macos-15`에서 프로젝트 Rust toolchain과 Node 22.22.0, 잠긴 npm·Cargo 의존성을 사용한다.
- 프런트엔드·Rust 테스트와 버전 검사를 통과한 뒤 `aarch64-apple-darwin` release 앱과 DMG를 만든다.
- 앱 실행 파일의 arm64 아키텍처, Info.plist, ad-hoc 서명 정합성, DMG를 검사한다.
- 산출물 이름은 `<저장소>-<버전>-aarch64-apple-darwin.app.zip`, `.dmg`, `.sha256`이다.
- 수동 실행의 Actions 아티팩트는 7일간 보관한다. 태그 실행은 빌드 성공 후 같은 파일을 Release에 첨부한다.
- Release에는 GitHub가 생성한 변경 노트와 미공증 앱 경고를 함께 넣는다. 자동 노트는 변경 내용의 품질이나
  호환성을 검토하지 않으므로 발행 후 내용을 확인한다. [GitHub 자동 릴리스 노트 안내](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)

## 권한과 발행 보호

빌드 작업은 `contents: read`, 태그의 Release 작업만 `contents: write`를 사용한다. 별도 PAT나 Apple 인증
정보 없이 저장소의 `GITHUB_TOKEN`으로 발행한다. 외부 Actions는 전체 commit SHA로 고정한다.

현재 워크플로에는 GitHub Environment 승인 단계가 없다. 필요하면 저장소 Settings → Environments에서
승인 규칙을 구성한 뒤 `release` job에 해당 environment를 연결해야 한다. 이름만 추가해도 승인이 생기는
것은 아니다. 보호 규칙의 사용 가능 여부는 저장소 공개 여부와 GitHub 요금제에 따라 다르다.
[GitHub 배포 환경 안내](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

## 서명·설치·데이터 보존

현재 앱은 **ad-hoc 서명만** 사용한다. Developer ID 서명·Apple 공증은 구성하지 않았으므로 인터넷에서
받은 앱은 Gatekeeper가 차단할 수 있다. 체크섬이나 `codesign` 정합성 통과는 Apple 공증을 뜻하지 않는다.
조직의 보안 정책을 따르며, 경고 우회를 일반 설치 절차로 안내하지 않는다.
[Tauri macOS 서명·공증 안내](https://v2.tauri.app/distribute/sign/macos/)

표시명과 새 번들은 `Topicwake.app`이지만 bundle identifier는 `com.konglabs.zenoh-observatory`, DB는
`~/Library/Application Support/com.konglabs.zenoh-observatory/zenoh-admin.sqlite3`를 유지한다. 이름 변경을
이유로 DB를 이동·초기화하지 않는다. 사용자 DB·세션·Zenoh 설정은 Release에 포함하지 않는다.

처음 다운로드한 앱은 프로젝트 DB 위치를 자동으로 찾지 않는다. 계정을 옮기는 로컬 소스 실행 절차는
[README의 기존 계정 가져오기](../README.md#기존-계정-가져오기)를 따른다. 앱 업데이트 전에는 DB 백업과
이전 버전 호환성을 확인하고, 이전 앱으로 되돌릴 때도 DB 삭제를 복구 방법으로 사용하지 않는다.
