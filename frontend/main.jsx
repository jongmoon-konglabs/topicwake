import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav } from "@astryxdesign/core/TopNav";
import { Grid } from "@astryxdesign/core/Grid";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Divider } from "@astryxdesign/core/Divider";
import { StatusDot } from "@astryxdesign/core/StatusDot";
// Table-page frame adapted from Meta Astryx, copyright Meta Platforms, Inc. and affiliates.
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { Theme } from "@astryxdesign/core/theme";
import { Layout } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { List, ListItem } from "@astryxdesign/core/List";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { themes, defaultThemeSlug } from "./astryx-themes";
import { loadAuthentication } from "./session-startup.mjs";
import {
  filterTopics,
  snapshotTopics,
  primaryNetworkAddress,
  displaySnapshotAfterPoll,
  inspectedTopic,
  payloadPresentation,
  receiveStatus,
  formatPayload,
  estimateRates,
  collectorStatus,
  validateCredentials,
} from "./topic-model.mjs";
async function api(path, body) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined
      ? { method: "POST", body: JSON.stringify(body) }
      : {}),
  });
  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;
    try {
      message = (await response.json()).error || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
function AuthPanel({
  setup,
  username,
  setUsername,
  password,
  setPassword,
  login,
  busy,
  error,
}) {
  return (
    <VStack gap={6} paddingBlockEnd={4}>
      <Heading level={1}>Topicwake</Heading>
      <Heading level={2}>
        {setup ? "관리자 계정 만들기" : "관리자 로그인"}
      </Heading>
      <TextInput
        label="사용자 이름"
        value={username}
        onChange={setUsername}
        isRequired
        autoComplete="username"
        description={
          setup ? "영문, 숫자, 밑줄(_), 하이픈(-)으로 1~64자" : undefined
        }
      />
      <TextInput
        label="비밀번호"
        type="password"
        isRequired
        value={password}
        onChange={setPassword}
        autoComplete={setup ? "new-password" : "current-password"}
        onEnter={login}
        description={setup ? "4자 이상 입력하세요." : undefined}
      />
      <Button
        label={setup ? "계정 만들기" : "로그인"}
        variant="primary"
        onClick={login}
        isDisabled={busy}
      />
      {error && (
        <Text color="primary" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}
function NetworkRail({
  status,
  internet,
  checkInternet,
  busy,
  compact = false,
  showLocalNetworkHint = false,
}) {
  const addresses = status?.interfaces || [];
  const primary = primaryNetworkAddress(addresses);
  return (
    <VStack gap={4} padding={3}>
      <Text type="label" weight="bold">
        네트워크
      </Text>
      <Grid columns={compact ? 1 : { minWidth: 220, max: 3 }} gap={4}>
        <VStack gap={1}>
          <Text type="supporting">서버 IP</Text>
          <Text type="label" style={{ overflowWrap: "anywhere" }}>
            {primary?.ip || status?.interface_error || "확인 안 됨"}
          </Text>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">Wi-Fi</Text>
          <Text type="label" style={{ overflowWrap: "anywhere" }}>
            {status?.ssid || "확인 안 됨"}
          </Text>
        </VStack>
        <VStack gap={2}>
          <Text type="supporting">인터넷</Text>
          <Text type="supporting">{internet}</Text>
          <Button
            label="연결 확인"
            size="sm"
            onClick={checkInternet}
            isDisabled={busy}
          />
        </VStack>
      </Grid>
      <Divider />
      <Collapsible
        trigger={`모든 IP 주소 (${addresses.length})`}
        defaultIsOpen={false}
      >
        <VStack gap={2}>
          {addresses.map((item) => (
            <Text
              key={`${item.name}-${item.ip}`}
              type="supporting"
              style={{ overflowWrap: "anywhere" }}
            >
              {item.name} · {item.ip}
            </Text>
          ))}
        </VStack>
      </Collapsible>
      <Collapsible trigger="수신 상태 안내" defaultIsOpen={false}>
        <VStack gap={2}>
          <Text type="supporting">
            5초 동안 새 데이터가 없으면 빨강으로 표시하고, 5분이 지나면 목록에서
            숨깁니다. 느리게 보내는 토픽은 연결 중에도 빨강일 수 있습니다.
          </Text>
          <Text type="supporting">
            데이터를 한 번 이상 받은 토픽만 표시합니다. 같은 네트워크라도
            방화벽이나 연결 설정에 따라 보이지 않을 수 있습니다.
          </Text>
          {showLocalNetworkHint && (
            <Text type="supporting">
              토픽이 보이지 않으면 macOS 설정의 로컬 네트워크 접근을 확인하고
              앱을 다시 열어 보세요.
            </Text>
          )}
          <Text type="supporting">
            인터넷 확인은 example.com:443 연결만 검사합니다.
          </Text>
        </VStack>
      </Collapsible>
    </VStack>
  );
}
function TopicInspector({ topic, rates, setError, now, stale }) {
  const receipt = receiveStatus(topic?.last_seen, now, stale);
  const presentation = payloadPresentation(topic || {});
  return (
    <Card padding={0}>
      <VStack gap={3} padding={3}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>최신 데이터</Heading>
          <Text type="supporting">선택한 토픽</Text>
        </HStack>
        <Divider />
        {topic ? (
          <>
            <Text type="code" style={{ overflowWrap: "anywhere" }}>
              {topic.key}
            </Text>
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={receipt.variant}
                label="새 데이터 수신 여부"
              />
              <Text type="supporting">{receipt.label}</Text>
            </HStack>
            {presentation.deleted ? (
              <Text>삭제 알림을 받았습니다.</Text>
            ) : (
              <CodeBlock
                code={formatPayload(topic.payload)}
                language="plaintext"
                title="받은 데이터"
                width="100%"
                isWrapped
                maxHeight="50vh"
                size="sm"
                hasLineNumbers
                onCopyError={() => setError("클립보드 접근이 차단되었습니다.")}
              />
            )}
            <MetadataList columns="multi" label={{ position: "top" }}>
              <MetadataListItem label="초당 수신">
                {stale
                  ? "확인 중"
                  : rates[topic.key] == null
                    ? "측정 중"
                    : `${rates[topic.key].toFixed(1)}건`}
              </MetadataListItem>
              <MetadataListItem label="최근 수신">
                {Math.max(0, Math.floor((now - topic.last_seen) / 1000))}초 전
              </MetadataListItem>
              <MetadataListItem label="수집 후 받은 수">
                {topic.message_count}건
              </MetadataListItem>
              <MetadataListItem label="데이터 형식">
                {topic.encoding}
              </MetadataListItem>
              <MetadataListItem label="데이터 크기">
                {topic.last_payload_bytes ?? topic.bytes} B
              </MetadataListItem>
              <MetadataListItem label="출처 IP">
                {topic.source_ip || "확인 안 됨"}
              </MetadataListItem>
              <MetadataListItem label="출처 ID">
                {topic.source_id || "확인 안 됨"}
              </MetadataListItem>
            </MetadataList>
            <Divider />
            {topic.preview_truncated && (
              <Text type="supporting">크기 제한으로 잘린 미리보기입니다.</Text>
            )}
            <Collapsible trigger="도움말" defaultIsOpen={false}>
              <Text as="p" type="supporting">
                {new Date(topic.last_seen).toLocaleString("ko-KR")} 수신. Hz는
                관찰 구간의 받은 횟수 증가량을 실제 경과 시간으로 나눈
                추정값입니다. 신규 수신 없음은 연결 끊김을 의미하지 않습니다. 원
                발행자 IP는 Zenoh 샘플에 없으면 추정하지 않습니다.
              </Text>
            </Collapsible>
          </>
        ) : (
          <VStack gap={4} paddingBlock={10}>
            <Text type="display-3" color="secondary">
              메시지 대기 중
            </Text>
            <Text type="supporting">
              왼쪽에서 토픽을 선택하면 최신 메시지가 표시됩니다.
            </Text>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
function App() {
  // Presentation only: the native title bar already names the app.
  const desktop =
    new URLSearchParams(window.location.search).get("desktop") === "1";
  const [paused, setPaused] = useState(false);
  const [lastDisplayAt, setLastDisplayAt] = useState(Date.now());
  const [pausedAt, setPausedAt] = useState(null),
    [resuming, setResuming] = useState(false);
  const pausedRef = useRef(false),
    displaySnapshot = useRef(null);

  const listFocus = useRef(null),
    detailFocus = useRef(null);

  const [refreshFailed, setRefreshFailed] = useState(false);
  const [pollError, setPollError] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [now, setNow] = useState(Date.now());
  const visibleClock = useRef(now),
    failureActive = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [wide, setWide] = useState(
    () => window.matchMedia("(min-width: 900px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [hasRail, setHasRail] = useState(
    () => window.matchMedia("(min-width: 1100px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setHasRail(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const observation = useRef({ topics: [], time: 0 });
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    if (!wide) (detailOpen ? detailFocus : listFocus).current?.focus();
  }, [detailOpen, wide]);
  const [rates, setRates] = useState({});
  const [user, setUser] = useState(null),
    [setup, setSetup] = useState(false),
    [ready, setReady] = useState(false),
    [startupError, setStartupError] = useState(false),
    [startupAttempt, setStartupAttempt] = useState(0),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [topics, setTopics] = useState([]),
    [status, setStatus] = useState(null),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("key"),
    [order, setOrder] = useState("asc"),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [truncated, setTruncated] = useState(false),
    [updated, setUpdated] = useState(null),
    [internet, setInternet] = useState("확인하지 않음");
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setStartupError(false);
    (async () => {
      try {
        const session = await loadAuthentication(api);
        if (cancelled) return;
        setSetup(session.setup);
        setUser(session.user);
        setReady(true);
      } catch {
        if (!cancelled) setStartupError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startupAttempt]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const [s, t] = await Promise.all([api("/status"), api("/topics")]);
        if (cancelled) return;
        const snapshot = displaySnapshotAfterPoll(
          displaySnapshot.current,
          { s, t },
          pausedRef.current,
        );
        setRefreshFailed(false);
        failureActive.current = false;
        setPollError("");
        if (snapshot === displaySnapshot.current) return;
        displaySnapshot.current = snapshot;
        const now = Date.now();
        const current = t.topics || [];
        setRates(
          estimateRates(
            observation.current.topics,
            current,
            now - observation.current.time,
          ),
        );
        observation.current = { topics: current, time: now };
        setStatus(s);
        setTopics(current);
        setResuming(false);
        setRefreshFailed(false);
        setTruncated(t.truncated);
        setUpdated(Date.now());
        setLastDisplayAt(Date.now());
        setPollError("");
      } catch (e) {
        if (cancelled) return;
        if (!failureActive.current) {
          setLastDisplayAt(visibleClock.current);
          failureActive.current = true;
        }
        setRefreshFailed(true);
        if (!pausedRef.current) setResuming(false);
        if (e.status === 401) {
          setUser(null);
          resetSessionView();
        } else
          setPollError(
            "새 데이터를 가져오지 못했습니다. 잠시 후 다시 확인하세요.",
          );
      } finally {
        if (!cancelled) timer = setTimeout(tick, 1000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);
  async function login() {
    const validation = validateCredentials(username.trim(), password, setup);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(setup ? "/auth/setup" : "/auth/login", {
        username: username.trim(),
        password,
      });
      setUser(username.trim());
      setPassword("");
      setSetup(false);
    } catch (e) {
      setError(
        e.status === 401
          ? "사용자 이름과 비밀번호를 확인하세요."
          : e.status === 409
            ? "이미 관리자 계정이 있습니다. 로그인하세요."
            : e.status === 400
              ? "입력한 이름과 비밀번호를 확인하세요."
              : "연결하지 못했습니다. 잠시 후 다시 시도하세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetSessionView() {
    setDetailOpen(false);
    setQuery("");
    setShowOld(false);
    setInternet("확인하지 않음");
    setTopics([]);
    setSelected(null);
    setStatus(null);
    observation.current = { topics: [], time: 0 };
    setRates({});
    pausedRef.current = false;
    displaySnapshot.current = null;
    failureActive.current = false;
    setPaused(false);
    setPausedAt(null);
    setResuming(false);
    setRefreshFailed(false);
    setPollError("");
    setError("");
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setUser(null);
      resetSessionView();
    } catch (e) {
      setError(e.message);
    }
  }
  async function checkInternet() {
    setBusy(true);
    try {
      const result = await api("/network/check", {});
      setInternet(
        result.internet === "reachable"
          ? `테스트 연결 성공 · ${new Date().toLocaleTimeString("ko-KR")}`
          : `테스트 연결 실패 · ${new Date().toLocaleTimeString("ko-KR")}`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const filterTime =
    (paused || resuming ? pausedAt : refreshFailed ? lastDisplayAt : now) ??
    now;
  visibleClock.current = filterTime;
  const visible = filterTopics(
      snapshotTopics(topics, now, showOld, filterTime),
      query,
      sort,
      order,
    ),
    topic = inspectedTopic(topics, visible, selected, query);
  if (!ready || !user)
    return (
      <AppShell variant="wash" height="auto" contentPadding={8}>
        <Layout contentWidth="32rem" height="auto">
          <Card padding={8}>
            {!ready ? (
              <VStack gap={4}>
                <Heading level={1}>Topicwake</Heading>
                {startupError ? (
                  <>
                    <Text role="alert">
                      연결하지 못했습니다. 잠시 후 다시 시도하세요.
                    </Text>
                    <Button
                      label="다시 시도"
                      variant="primary"
                      onClick={() =>
                        setStartupAttempt((attempt) => attempt + 1)
                      }
                    />
                  </>
                ) : (
                  <Text role="status">시작하는 중…</Text>
                )}
              </VStack>
            ) : (
              <AuthPanel
                {...{
                  setup,
                  username,
                  setUsername,
                  password,
                  setPassword,
                  login,
                  busy,
                  error,
                }}
              />
            )}
          </Card>
        </Layout>
      </AppShell>
    );
  const collector = collectorStatus(status);
  const showLocalNetworkHint =
    desktop && (collector.error || topics.length === 0);
  const accountControls = (
    <HStack gap={2} vAlign="center">
      <Text type="supporting">{user}</Text>
      <Button size="sm" variant="ghost" label="로그아웃" onClick={logout} />
    </HStack>
  );
  const inspector = (
    <VStack gap={1}>
      {topic && !visible.some((item) => item.key === topic.key) && (
        <HStack padding={3}>
          <Text type="supporting">목록에서 숨겨진 토픽</Text>
          <Button
            size="sm"
            variant="ghost"
            label="오래된 토픽 보기"
            onClick={() => setShowOld(true)}
          />
        </HStack>
      )}
      <TopicInspector
        {...{ topic, rates, setError, now }}
        stale={refreshFailed || paused || resuming}
      />
    </VStack>
  );
  const list = (
    <VStack
      ref={listFocus}
      tabIndex={-1}
      aria-label="토픽 목록"
      gap={0}
      height="100%"
      minHeight={0}
    >
      <VStack gap={2} padding={3}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>토픽</Heading>
          <Text type="supporting">
            {visible.length} / {topics.length}개
          </Text>
        </HStack>
        <TextInput
          label="토픽 검색"
          isLabelHidden
          type="search"
          value={query}
          onChange={setQuery}
          placeholder="토픽 이름 검색"
        />
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Selector
            label="토픽 정렬"
            isLabelHidden
            size="sm"
            variant="ghost"
            value={sort}
            onChange={setSort}
            options={[
              { value: "key", label: "이름순" },
              { value: "last_seen", label: "최근 수신순" },
              { value: "message_count", label: "누적 수신순" },
            ]}
          />
          <Button
            size="sm"
            label={order === "asc" ? "↑" : "↓"}
            aria-label={
              order === "asc" ? "내림차순으로 변경" : "오름차순으로 변경"
            }
            variant="ghost"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
          />
          <ToggleButton
            size="sm"
            label="오래된 토픽"
            isPressed={showOld}
            onPressedChange={setShowOld}
          >
            오래된 토픽
          </ToggleButton>
        </HStack>
      </VStack>
      <Divider />
      <StackItem size="fill" isScrollable>
        {visible.length ? (
          <List density="compact" hasDividers edge="bleed">
            {visible.map((row) => {
              const receipt = receiveStatus(
                row.last_seen,
                now,
                refreshFailed || paused || resuming,
              );
              return (
                <ListItem
                  key={row.key}
                  itemKey={row.key}
                  title={`${row.key} · ${receipt.label}`}
                  label={
                    <Text type="code" style={{ overflowWrap: "anywhere" }}>
                      {row.key}
                    </Text>
                  }
                  isSelected={row.key === topic?.key}
                  startContent={
                    <StatusDot
                      variant={receipt.variant}
                      label={receipt.label}
                      tooltip={receipt.label}
                    />
                  }
                  description={
                    <HStack gap={2} vAlign="center">
                      <Text type="supporting">
                        {receipt.live
                          ? "수신"
                          : receipt.variant === "error"
                            ? "수신 없음"
                            : "확인 중"}
                      </Text>
                      <Text type="supporting">
                        {refreshFailed ||
                        paused ||
                        resuming ||
                        rates[row.key] == null
                          ? "—"
                          : rates[row.key].toFixed(1)}{" "}
                        /초
                      </Text>
                    </HStack>
                  }
                  onClick={() => {
                    setSelected(row.key);
                    setDetailOpen(true);
                  }}
                />
              );
            })}
          </List>
        ) : (
          <VStack padding={4} gap={2}>
            <Text>
              {query
                ? "검색 결과가 없습니다."
                : topics.length && !showOld
                  ? "최근 5분간 받은 토픽이 없습니다."
                  : "아직 받은 토픽이 없습니다."}
            </Text>
            {query && (
              <Button
                label="검색 지우기"
                size="sm"
                variant="ghost"
                onClick={() => setQuery("")}
              />
            )}
          </VStack>
        )}
      </StackItem>
      <Divider />
      <HStack padding={2} hAlign="between">
        <Text type="supporting">
          {truncated ? "표시 한도 초과 · 일부 토픽 제외" : "화면 갱신"}
        </Text>
        <Text type="supporting">
          {updated ? new Date(updated).toLocaleTimeString("ko-KR") : "대기 중"}
        </Text>
      </HStack>
    </VStack>
  );
  return (
    <VStack hAlign="center" height="100dvh" minHeight={0}>
      <VStack width="100%" maxWidth="90rem" height="100%" minHeight={0}>
        <AppShell
          variant="wash"
          height="fill"
          contentPadding={0}
          topNav={
            desktop ? (
              <HStack
                as="header"
                aria-label="계정"
                paddingInline={wide ? 6 : 3}
                paddingBlock={1}
                hAlign="end"
              >
                {accountControls}
              </HStack>
            ) : (
              <TopNav
                label="앱"
                heading={
                  <Text type="label" weight="bold">
                    Topicwake
                  </Text>
                }
                endContent={accountControls}
              />
            )
          }
        >
          <VStack
            gap={3}
            paddingInline={wide ? 6 : 3}
            paddingBlock={3}
            height="100%"
            minHeight={0}
          >
            <HStack
              paddingInline={0}
              paddingBlock={1}
              gap={4}
              vAlign="center"
              wrap="wrap"
            >
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={
                    pollError || collector.error
                      ? "warning"
                      : status?.zenoh_connected
                        ? "success"
                        : "neutral"
                  }
                  label="수집 상태"
                />
                <Text type="supporting">
                  {pollError ? "화면 갱신 실패" : collector.label}
                </Text>
              </HStack>
              <Text type="supporting">수신한 토픽 {topics.length}개</Text>
              <Text type="supporting">
                초당{" "}
                {!refreshFailed &&
                !paused &&
                !resuming &&
                Object.values(rates).some((v) => v !== null)
                  ? Object.values(rates)
                      .reduce((sum, v) => sum + (v || 0), 0)
                      .toFixed(1)
                  : "—"}
                건 · 추정
              </Text>
              <Text type="supporting">
                {paused ? "화면 정지 · 수집은 계속" : "1초마다 갱신"}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                label={paused ? "계속" : "화면 일시정지"}
                onClick={() => {
                  const next = !pausedRef.current;
                  pausedRef.current = next;
                  if (next) {
                    setPausedAt(visibleClock.current);
                    setLastDisplayAt(visibleClock.current);
                  }
                  setPaused(next);
                  setResuming(!next);
                }}
              />
            </HStack>
            {!hasRail && (
              <VStack paddingInline={3} paddingBlock={1}>
                <Collapsible trigger="네트워크 정보" defaultIsOpen={false}>
                  <VStack isScrollable style={{ maxHeight: "30vh" }}>
                    <NetworkRail
                      {...{
                        status,
                        internet,
                        checkInternet,
                        busy,
                        showLocalNetworkHint,
                      }}
                    />
                  </VStack>
                </Collapsible>
              </VStack>
            )}
            {(error || pollError || collector.error) && (
              <VStack padding={2} gap={1}>
                <Text role="alert">
                  {error || pollError || collector.label}
                </Text>
                {error && (
                  <Button
                    label="닫기"
                    size="sm"
                    variant="ghost"
                    onClick={() => setError("")}
                  />
                )}
                {collector.detail && (
                  <Collapsible trigger="문제 상세">
                    <Text type="supporting">{collector.detail}</Text>
                  </Collapsible>
                )}
              </VStack>
            )}
            <Divider />
            <VStack
              style={{
                display: "grid",
                gridTemplateColumns: hasRail
                  ? "11rem clamp(20rem, 28vw, 25rem) minmax(0, 1fr)"
                  : wide
                    ? "minmax(20rem, 2fr) minmax(0, 3fr)"
                    : "minmax(0, 1fr)",
                gap: "var(--spacing-4)",
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {hasRail && (
                <VStack
                  as="aside"
                  aria-label="네트워크 정보"
                  minHeight={0}
                  isScrollable
                >
                  <NetworkRail
                    {...{
                      status,
                      internet,
                      checkInternet,
                      busy,
                      showLocalNetworkHint,
                    }}
                    compact
                  />
                </VStack>
              )}
              {(wide || !detailOpen) && (
                <VStack
                  minHeight={0}
                  height="100%"
                  style={{
                    overflow: "hidden",
                    background: "var(--color-background-surface)",
                    border: "var(--border-width) solid var(--color-border)",
                    borderRadius: "var(--radius-container)",
                  }}
                >
                  {list}
                </VStack>
              )}
              {(wide || detailOpen) && (
                <VStack
                  ref={detailFocus}
                  tabIndex={-1}
                  aria-label="선택한 토픽 데이터"
                  minHeight={0}
                  height="100%"
                  isScrollable
                >
                  {!wide && (
                    <HStack padding={2}>
                      <Button
                        size="sm"
                        variant="ghost"
                        label="← 토픽 목록"
                        onClick={() => setDetailOpen(false)}
                      />
                    </HStack>
                  )}
                  {inspector}
                </VStack>
              )}
            </VStack>
          </VStack>
        </AppShell>
      </VStack>
    </VStack>
  );
}
createRoot(document.getElementById("root")).render(
  <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }}>
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <App />
    </Theme>
  </InternationalizationProvider>,
);
