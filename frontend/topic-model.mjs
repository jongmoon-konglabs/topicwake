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
  if (!status) return { label: "Starting collector", error: false };
  const normal = [
    "observing",
    "running",
    "connected",
    "Observing reachable live publications; source IP unavailable",
  ];
  if (normal.includes(status.status)) {
    return {
      label: status.zenoh_connected ? "Collector running" : "Starting collector",
      error: false,
    };
  }
  if (!status.status)
    return {
      label: status.zenoh_connected ? "Collector running" : "Starting collector",
      error: false,
    };
  return {
    label: "Could not collect data. Check connection settings.",
    error: true,
    detail: status.status,
  };
}

export function validateCredentials(username, password, setup) {
  if (!username || !password) return "Enter your username and password.";
  if (!setup) return "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(username))
    return "Use 1–64 English letters, numbers, underscores or hyphens for your username.";
  const length = new TextEncoder().encode(password).length;
  if (Array.from(password).length < 4)
    return "Use at least 4 characters for your password.";
  if (length > 256) return "Password is too long. Use a shorter password.";
  return "";
}

export function receiveStatus(lastSeen, now, refreshFailed) {
  if (refreshFailed || !Number.isFinite(lastSeen) || lastSeen <= 0)
    return { label: "Reception unknown", variant: "neutral", live: false };
  const stale = now - lastSeen >= 5000;
  return {
    label: stale ? "No data for 5s or more" : "Recently received",
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
    ? { deleted: true, label: "Delete notification" }
    : { deleted: false, label: "Received data" };
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
