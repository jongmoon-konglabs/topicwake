import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("interface copy and document language are English", () => {
  for (const name of ["main.jsx", "topic-model.mjs", "index.html"]) {
    assert.doesNotMatch(source(name), /[\uac00-\ud7a3]/, name);
  }
  assert.match(source("index.html"), /<html lang="en">/);
});

test("Astryx uses built-in English and timestamps preserve the local timezone", () => {
  const main = source("main.jsx");
  assert.match(main, /<InternationalizationProvider locale="en-US">/);
  assert.doesNotMatch(main, /ko-KR|koKR|timeZone:/);
  assert.match(main, /toLocaleString\("en-US"\)/);
  assert.match(main, /toLocaleTimeString\("en-US"\)/);
});
