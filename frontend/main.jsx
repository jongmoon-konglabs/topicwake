import { InternationalizationProvider } from "@astryxdesign/core/i18n";
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
    let message = `Request failed (${response.status})`;
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
        {setup ? "Create an account" : "Sign in"}
      </Heading>
      <TextInput
        label="Username"
        value={username}
        onChange={setUsername}
        isRequired
        autoComplete="username"
        description={
          setup ? "1–64 English letters, numbers, underscores or hyphens" : undefined
        }
      />
      <TextInput
        label="Password"
        type="password"
        isRequired
        value={password}
        onChange={setPassword}
        autoComplete={setup ? "new-password" : "current-password"}
        onEnter={login}
        description={setup ? "At least 4 characters." : undefined}
      />
      <Button
        label={setup ? "Create account" : "Sign in"}
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
        Network
      </Text>
      <Grid columns={compact ? 1 : { minWidth: 220, max: 3 }} gap={4}>
        <VStack gap={1}>
          <Text type="supporting">Collector IP</Text>
          <Text type="label" style={{ overflowWrap: "anywhere" }}>
            {primary?.ip || status?.interface_error || "Unavailable"}
          </Text>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">Wi-Fi</Text>
          <Text type="label" style={{ overflowWrap: "anywhere" }}>
            {status?.ssid || "Unavailable"}
          </Text>
        </VStack>
        <VStack gap={2}>
          <Text type="supporting">Internet</Text>
          <Text type="supporting">{internet}</Text>
          <Button
            label="Check connection"
            size="sm"
            onClick={checkInternet}
            isDisabled={busy}
          />
        </VStack>
      </Grid>
      <Divider />
      <Collapsible
        trigger={`IP addresses (${addresses.length})`}
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
      <Collapsible trigger="About reception" defaultIsOpen={false}>
        <VStack gap={2}>
          <Text type="supporting">
            Red means no data for 5 seconds. Topics are hidden after 5 minutes.
            Slow or event-driven topics may still be connected.
          </Text>
          <Text type="supporting">
            Only topics received by this collector appear here. Firewall and
            connection settings can limit visibility, even on the same network.
          </Text>
          {showLocalNetworkHint && (
            <Text type="supporting">
              If no topics appear, check Local Network access in macOS settings
              and reopen the app.
            </Text>
          )}
          <Text type="supporting">
            The connection test only checks example.com:443.
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
          <Heading level={2}>Latest data</Heading>
          <Text type="supporting">Selected topic</Text>
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
                label="Data reception status"
              />
              <Text type="supporting">{receipt.label}</Text>
            </HStack>
            {presentation.deleted ? (
              <Text>A delete notification was received.</Text>
            ) : (
              <CodeBlock
                code={formatPayload(topic.payload)}
                language="plaintext"
                title="Received data"
                width="100%"
                isWrapped
                maxHeight="50vh"
                size="sm"
                hasLineNumbers
                onCopyError={() => setError("Clipboard access was blocked.")}
              />
            )}
            <MetadataList columns="multi" label={{ position: "top" }}>
              <MetadataListItem label="Receive rate">
                {stale
                  ? "Unknown"
                  : rates[topic.key] == null
                    ? "Measuring…"
                    : `${rates[topic.key].toFixed(1)} msg/s`}
              </MetadataListItem>
              <MetadataListItem label="Last received">
                {Math.max(0, Math.floor((now - topic.last_seen) / 1000))}s ago
              </MetadataListItem>
              <MetadataListItem label="Received since start">
                {topic.message_count}
              </MetadataListItem>
              <MetadataListItem label="Format">
                {topic.encoding}
              </MetadataListItem>
              <MetadataListItem label="Size">
                {topic.last_payload_bytes ?? topic.bytes} B
              </MetadataListItem>
              <MetadataListItem label="Source IP">
                {topic.source_ip || "Unavailable"}
              </MetadataListItem>
              <MetadataListItem label="Source ID">
                {topic.source_id || "Unavailable"}
              </MetadataListItem>
            </MetadataList>
            <Divider />
            {topic.preview_truncated && (
              <Text type="supporting">Preview truncated at the size limit.</Text>
            )}
            <Collapsible trigger="Details" defaultIsOpen={false}>
              <Text as="p" type="supporting">
                Received {new Date(topic.last_seen).toLocaleString("en-US")}.
                Rates are estimated from message counts over elapsed time. No
                recent data does not prove a disconnection. Publisher IPs are
                shown only when available in the sample.
              </Text>
            </Collapsible>
          </>
        ) : (
          <VStack gap={4} paddingBlock={10}>
            <Text type="display-3" color="secondary">
              Waiting for data
            </Text>
            <Text type="supporting">
              Select a topic to see its latest data.
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
    [internet, setInternet] = useState("Not checked");
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
            "Could not refresh data. Retrying…",
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
          ? "Check your username and password."
          : e.status === 409
            ? "An account already exists. Sign in instead."
            : e.status === 400
              ? "Check your username and password."
              : "Could not connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetSessionView() {
    setDetailOpen(false);
    setQuery("");
    setShowOld(false);
    setInternet("Not checked");
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
          ? `Connection test passed · ${new Date().toLocaleTimeString("en-US")}`
          : `Connection test failed · ${new Date().toLocaleTimeString("en-US")}`,
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
                      Could not connect. Please try again.
                    </Text>
                    <Button
                      label="Try again"
                      variant="primary"
                      onClick={() =>
                        setStartupAttempt((attempt) => attempt + 1)
                      }
                    />
                  </>
                ) : (
                  <Text role="status">Starting…</Text>
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
      <Button size="sm" variant="ghost" label="Sign out" onClick={logout} />
    </HStack>
  );
  const inspector = (
    <VStack gap={1}>
      {topic && !visible.some((item) => item.key === topic.key) && (
        <HStack padding={3}>
          <Text type="supporting">Topic hidden from the list</Text>
          <Button
            size="sm"
            variant="ghost"
            label="Show older topics"
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
      aria-label="Topic list"
      gap={0}
      height="100%"
      minHeight={0}
    >
      <VStack gap={2} padding={3}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={2}>Topics</Heading>
          <Text type="supporting">
            {visible.length} / {topics.length}
          </Text>
        </HStack>
        <TextInput
          label="Search topics"
          isLabelHidden
          type="search"
          value={query}
          onChange={setQuery}
          placeholder="Search topic names"
        />
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Selector
            label="Sort topics"
            isLabelHidden
            size="sm"
            variant="ghost"
            value={sort}
            onChange={setSort}
            options={[
              { value: "key", label: "Name" },
              { value: "last_seen", label: "Last received" },
              { value: "message_count", label: "Messages received" },
            ]}
          />
          <Button
            size="sm"
            label={order === "asc" ? "↑" : "↓"}
            aria-label={
              order === "asc" ? "Sort descending" : "Sort ascending"
            }
            variant="ghost"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
          />
          <ToggleButton
            size="sm"
            label="Older topics"
            isPressed={showOld}
            onPressedChange={setShowOld}
          >
            Older topics
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
                          ? "Receiving"
                          : receipt.variant === "error"
                            ? "No recent data"
                            : "Unknown"}
                      </Text>
                      <Text type="supporting">
                        {refreshFailed ||
                        paused ||
                        resuming ||
                        rates[row.key] == null
                          ? "—"
                          : rates[row.key].toFixed(1)}{" "}
                        /s
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
                ? "No matching topics."
                : topics.length && !showOld
                  ? "No topics received in the last 5 minutes."
                  : "No topics received yet."}
            </Text>
            {query && (
              <Button
                label="Clear search"
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
          {truncated
            ? "Display limit reached · some topics omitted"
            : "Last refresh"}
        </Text>
        <Text type="supporting">
          {updated ? new Date(updated).toLocaleTimeString("en-US") : "Waiting…"}
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
                aria-label="Account"
                paddingInline={wide ? 6 : 3}
                paddingBlock={1}
                hAlign="end"
              >
                {accountControls}
              </HStack>
            ) : (
              <TopNav
                label="Application"
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
                  label="Collector status"
                />
                <Text type="supporting">
                  {pollError ? "Refresh failed" : collector.label}
                </Text>
              </HStack>
              <Text type="supporting">{topics.length} topics</Text>
              <Text type="supporting">
                {!refreshFailed &&
                !paused &&
                !resuming &&
                Object.values(rates).some((v) => v !== null)
                  ? Object.values(rates)
                      .reduce((sum, v) => sum + (v || 0), 0)
                      .toFixed(1)
                  : "—"}
                {" "}
                msg/s · estimated
              </Text>
              <Text type="supporting">
                {paused
                  ? "Display paused · collection continues"
                  : "Refreshes every second"}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                label={paused ? "Resume" : "Pause display"}
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
                <Collapsible trigger="Network information" defaultIsOpen={false}>
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
                    label="Dismiss"
                    size="sm"
                    variant="ghost"
                    onClick={() => setError("")}
                  />
                )}
                {collector.detail && (
                  <Collapsible trigger="Error details">
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
                  aria-label="Network information"
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
                  aria-label="Selected topic data"
                  minHeight={0}
                  height="100%"
                  isScrollable
                >
                  {!wide && (
                    <HStack padding={2}>
                      <Button
                        size="sm"
                        variant="ghost"
                        label="← Topic list"
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
  <InternationalizationProvider locale="en-US">
    <Theme theme={themes[defaultThemeSlug]} mode="light">
      <App />
    </Theme>
  </InternationalizationProvider>,
);
