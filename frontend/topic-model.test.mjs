import test from "node:test";
import assert from "node:assert/strict";
import { filterTopics, formatPayload } from "./topic-model.mjs";
const topics = [
  {
    key: "z/robot",
    payload: '{"hp":10}',
    source_ip: null,
    message_count: 2,
    last_seen: 100,
  },
  {
    key: "a/robot",
    payload: "online",
    source_ip: "10.0.0.2",
    message_count: 5,
    last_seen: 50,
  },
];
test("searches only topic names without mutating source", () => {
  assert.equal(filterTopics(topics, "HP", "key", "asc").length, 0);
  assert.equal(filterTopics(topics, "10.0", "key", "asc").length, 0);
  assert.equal(filterTopics(topics, "online", "key", "asc").length, 0);
  assert.deepEqual(
    filterTopics(topics, " ROBOT ", "key", "asc").map((t) => t.key),
    ["a/robot", "z/robot"],
  );
  assert.equal(topics[0].key, "z/robot");
});
test("numeric sort and reverse order", () => {
  assert.equal(
    filterTopics(topics, "", "message_count", "desc")[0].message_count,
    5,
  );
  assert.equal(filterTopics(topics, "", "last_seen", "asc")[0].last_seen, 50);
});
test("formats JSON and preserves binary preview or plain text", () => {
  assert.equal(formatPayload('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(formatPayload("<script>"), "<script>");
});
import { estimateRates } from "./topic-model.mjs";
test("rate estimates use real elapsed time, unknown first sample and counter reset", () => {
  assert.equal(
    estimateRates(
      [{ key: "a", message_count: 10 }],
      [{ key: "a", message_count: 14 }],
      2000,
    ).a,
    2,
  );
  assert.equal(
    estimateRates([], [{ key: "a", message_count: 14 }], 2000).a,
    null,
  );
  assert.equal(
    estimateRates(
      [{ key: "a", message_count: 14 }],
      [{ key: "a", message_count: 1 }],
      2000,
    ).a,
    null,
  );
  assert.equal(
    estimateRates(
      [{ key: "a", message_count: 14 }],
      [{ key: "a", message_count: 14 }],
      2000,
    ).a,
    0,
  );
});

import { collectorStatus } from "./topic-model.mjs";
test("collector labels distinguish known healthy messages, startup and errors", () => {
  assert.deepEqual(collectorStatus(null), {
    label: "Starting collector",
    error: false,
  });
  assert.deepEqual(
    collectorStatus({
      status: "Observing reachable live publications; source IP unavailable",
      zenoh_connected: true,
    }),
    { label: "Collector running", error: false },
  );
  assert.deepEqual(
    collectorStatus({ status: "Invalid Zenoh config", zenoh_connected: false }),
    {
      label: "Could not collect data. Check connection settings.",
      error: true,
      detail: "Invalid Zenoh config",
    },
  );
});

import { validateCredentials } from "./topic-model.mjs";
test("setup copy validation matches ASCII usernames and four-character and UTF-8 byte limits", () => {
  assert.equal(validateCredentials("admin_01-test", "abcdefgh1234", true), "");
  assert.equal(validateCredentials("admin", "가나다라", true), "");
  assert.match(validateCredentials("관리자", "abcdefgh1234", true), /username/);
  assert.match(
    validateCredentials("a".repeat(65), "abcdefgh1234", true),
    /1–64/,
  );
  assert.match(validateCredentials("admin", "abc", true), /at least 4 characters/);
  assert.match(validateCredentials("admin", "가".repeat(86), true), /too long/);
  assert.equal(validateCredentials("admin", "old", false), "");
  assert.match(validateCredentials("", "", false), /Enter/);
});

test("password minimum counts Unicode characters, not UTF-8 bytes or UTF-16 units", () => {
  assert.match(validateCredentials("admin", "가나다", true), /at least 4 characters/);
  assert.equal(validateCredentials("admin", "가나다라", true), "");
  assert.match(validateCredentials("admin", "😀😀😀", true), /at least 4 characters/);
  assert.equal(validateCredentials("admin", "😀😀😀😀", true), "");
  assert.equal(validateCredentials("admin", "abcd", true), "");
});

import { receiveStatus, recentTopics } from "./topic-model.mjs";
test("freshness uses receive age with exact5s boundary and unknown failures", () => {
  assert.equal(receiveStatus(1000, 5999, false).variant, "success");
  assert.equal(receiveStatus(1000, 6000, false).variant, "error");
  assert.equal(receiveStatus(1000, 6000, true).variant, "neutral");
  assert.equal(receiveStatus(0, 6000, false).variant, "neutral");
  assert.equal(receiveStatus(6000, 6000, false).variant, "success");
});
test("old topics hidden at5min without deleting and toggle restores", () => {
  const items = [
    { key: "a", last_seen: 1000 },
    { key: "b", last_seen: 2000 },
  ];
  assert.deepEqual(recentTopics(items, 300999, false), items);
  assert.deepEqual(
    recentTopics(items, 301000, false).map((t) => t.key),
    ["b"],
  );
  assert.deepEqual(recentTopics(items, 301000, true), items);
  assert.equal(items.length, 2);
});

import { inspectedTopic, payloadPresentation } from "./topic-model.mjs";
test("inspector preserves selected topic when aged out but not search excluded", () => {
  const items = [{ key: "robot/a" }, { key: "robot/b" }];
  assert.equal(inspectedTopic(items, [items[1]], "robot/a", "").key, "robot/a");
  assert.equal(
    inspectedTopic(items, [items[1]], "robot/a", "/b").key,
    "robot/b",
  );
});
test("delete sample is distinct from an empty put and old server default", () => {
  assert.deepEqual(payloadPresentation({ kind: "delete" }), {
    deleted: true,
    label: "Delete notification",
  });
  assert.equal(
    payloadPresentation({ kind: "put", payload: "" }).deleted,
    false,
  );
  assert.equal(payloadPresentation({ payload: "" }).deleted, false);
});

import { displaySnapshotAfterPoll } from "./topic-model.mjs";
test("display pause freezes snapshot while resume takes latest incoming", () => {
  const previous = { payload: "old" },
    incoming = { payload: "new" };
  assert.equal(displaySnapshotAfterPoll(previous, incoming, true), previous);
  assert.equal(displaySnapshotAfterPoll(previous, incoming, false), incoming);
  assert.equal(incoming.payload, "new");
});

import { primaryNetworkAddress } from "./topic-model.mjs";
test("network summary prefers LAN address and preserves complete input", () => {
  const addresses = [
    { name: "lo0", ip: "127.0.0.1" },
    { name: "lo0", ip: "::1" },
    { name: "en0", ip: "192.168.1.2" },
  ];
  assert.equal(primaryNetworkAddress(addresses), addresses[2]);
  assert.equal(primaryNetworkAddress([addresses[0]]), addresses[0]);
  assert.equal(primaryNetworkAddress([]), undefined);
  assert.equal(addresses.length, 3);
});

import { snapshotTopics } from "./topic-model.mjs";
test("pause, resume-pending and HTTP failure preserve hidden topics until explicit toggle", () => {
  const items = [
    { key: "old", last_seen: 1000 },
    { key: "current", last_seen: 300000 },
  ];
  const before = snapshotTopics(items, 301000, false, null);
  assert.deepEqual(
    before.map((t) => t.key),
    ["current"],
  );
  for (const phase of ["paused", "resume-pending", "HTTP failed"]) {
    assert.deepEqual(
      snapshotTopics(items, 900000, false, 301000),
      before,
      phase,
    );
  }
  assert.equal(inspectedTopic(items, before, "current", "").key, "current");
  const latest = [
    { key: "old", last_seen: 1000 },
    { key: "current", last_seen: 900000 },
  ];
  assert.deepEqual(
    snapshotTopics(latest, 900000, false, null).map((t) => t.key),
    ["current"],
  );
  assert.deepEqual(snapshotTopics(items, 900000, true, 301000), items);
});

test("failure freezes actual visible boundary rather than older successful poll time", () => {
  const items = [
    { key: "old", last_seen: 1000 },
    { key: "current", last_seen: 2000 },
  ];
  assert.equal(snapshotTopics(items, 300999, false, null).length, 2);
  const visibleBeforeFailure = snapshotTopics(items, 301000, false, null);
  assert.deepEqual(
    visibleBeforeFailure.map((t) => t.key),
    ["current"],
  );
  assert.deepEqual(
    snapshotTopics(items, 900000, false, 301000),
    visibleBeforeFailure,
  );
});

test("pause during failed refresh preserves the already frozen visible clock", () => {
  const items = [{ key: "near-boundary", last_seen: 2000 }];
  const frozenVisibleClock = 301000;
  const failureView = snapshotTopics(items, 900000, false, frozenVisibleClock);
  assert.equal(failureView.length, 1);
  const pauseView = snapshotTopics(items, 900000, false, frozenVisibleClock);
  assert.deepEqual(pauseView, failureView);
});
