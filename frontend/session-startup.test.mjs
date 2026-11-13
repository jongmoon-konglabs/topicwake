import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthentication } from "./session-startup.mjs";

test("new accounts skip session lookup", async () => {
  const calls = [];
  const result = await loadAuthentication(async (path) => {
    calls.push(path);
    return { setup_required: true };
  });
  assert.deepEqual(result, { setup: true, user: null });
  assert.deepEqual(calls, ["/auth/status"]);
});

test("existing sessions restore the signed-in user", async () => {
  assert.deepEqual(
    await loadAuthentication(async (path) =>
      path === "/auth/status"
        ? { setup_required: false }
        : { username: "operator" },
    ),
    { setup: false, user: "operator" },
  );
});

test("only an expired or missing session shows login", async () => {
  assert.deepEqual(
    await loadAuthentication(async (path) => {
      if (path === "/auth/status") return { setup_required: false };
      throw Object.assign(new Error("sign in"), { status: 401 });
    }),
    { setup: false, user: null },
  );
});

test("startup failures never become login or account setup", async () => {
  const failures = [new Error("offline"), { status: 403 }, { status: 500 }];
  for (const failure of failures) {
    await assert.rejects(
      loadAuthentication(async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    await assert.rejects(
      loadAuthentication(async (path) => {
        if (path === "/auth/status") return { setup_required: false };
        throw failure;
      }),
      (error) => error === failure,
    );
  }
});

test("retry can recover after a failed startup", async () => {
  let available = false;
  const request = async () => {
    if (!available) throw new Error("offline");
    return { setup_required: true };
  };
  await assert.rejects(loadAuthentication(request));
  available = true;
  assert.deepEqual(await loadAuthentication(request), {
    setup: true,
    user: null,
  });
});
