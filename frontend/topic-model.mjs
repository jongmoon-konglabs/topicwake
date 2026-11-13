export function filterTopics(topics, search, sort, order) {
  const query = search.trim().toLocaleLowerCase();
  return topics
    .filter((topic) => !query || topic.key.toLocaleLowerCase().includes(query))
    .sort((left, right) => {
      const comparison =
        sort === "key"
          ? left.key.localeCompare(right.key)
          : Number(left[sort] ?? 0) - Number(right[sort] ?? 0);
      return (
        (comparison || left.key.localeCompare(right.key)) *
        (order === "asc" ? 1 : -1)
      );
    });
}
export function formatPayload(payload) {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}
export function estimateRates(previous, current, elapsedMs) {
  const old = new Map(
    previous.map((topic) => [topic.key, topic.message_count]),
  );
  return Object.fromEntries(
    current.map((topic) => [
      topic.key,
      elapsedMs > 0 &&
      old.has(topic.key) &&
      topic.message_count >= old.get(topic.key)
        ? ((topic.message_count - old.get(topic.key)) * 1000) / elapsedMs
        : null,
    ]),
  );
}

export function collectorStatus(status) {
  if (!status) return { label: "수집기 준비 중", error: false };
  const normal = [
    "observing",
    "running",
    "connected",
    "Observing reachable live publications; source IP unavailable",
  ];
  if (normal.includes(status.status)) {
    return {
      label: status.zenoh_connected ? "수집기 실행 중" : "수집기 준비 중",
      error: false,
    };
  }
  if (!status.status)
    return {
      label: status.zenoh_connected ? "수집기 실행 중" : "수집기 준비 중",
      error: false,
    };
  return {
    label: "데이터를 수집할 수 없습니다. 연결 설정을 확인하세요.",
    error: true,
    detail: status.status,
  };
}

export function validateCredentials(username, password, setup) {
  if (!username || !password) return "사용자 이름과 비밀번호를 입력하세요.";
  if (!setup) return "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username))
    return "이름은 영문, 숫자, 밑줄(_), 하이픈(-)으로 1~64자 입력하세요.";
  const length = new TextEncoder().encode(password).length;
  if (Array.from(password).length < 4) return "비밀번호는 4자 이상 입력하세요.";
  if (length > 256) return "비밀번호가 너무 깁니다. 더 짧게 입력하세요.";
  return "";
}

export function receiveStatus(lastSeen, now, refreshFailed) {
  if (refreshFailed || !Number.isFinite(lastSeen) || lastSeen <= 0)
    return { label: "수신 상태 확인 중", variant: "neutral", live: false };
  const stale = now - lastSeen >= 5000;
  return {
    label: stale ? "5초 이상 새 데이터 없음" : "최근 데이터 수신",
    variant: stale ? "error" : "success",
    live: !stale,
  };
}
export function recentTopics(topics, now, showOld) {
  return showOld
    ? topics
    : topics.filter(
        (topic) =>
          !Number.isFinite(topic.last_seen) || now - topic.last_seen < 300000,
      );
}

export function inspectedTopic(topics, visible, selected, query) {
  const current = topics.find(
    (topic) =>
      topic.key === selected &&
      topic.key.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return current || visible[0];
}
export function payloadPresentation(topic) {
  return topic.kind === "delete"
    ? { deleted: true, label: "삭제 알림" }
    : { deleted: false, label: "받은 데이터" };
}

export function displaySnapshotAfterPoll(current, incoming, paused) {
  return paused ? current : incoming;
}

export function primaryNetworkAddress(addresses) {
  return (
    addresses.find(({ ip }) => !ip.startsWith("127.") && ip !== "::1") ||
    addresses[0]
  );
}

export function snapshotTopics(topics, now, showOld, frozenAt) {
  return recentTopics(topics, frozenAt ?? now, showOld);
}
