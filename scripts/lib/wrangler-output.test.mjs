import assert from "node:assert/strict";
import { test } from "node:test";

import { redactOutput, versionIdOf } from "./wrangler-output.mjs";

const VERSION_ID = "0b6a7b1c-3f1e-4d2a-9c55-1f2e3d4c5b6a";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "AbCdEf123456_-AbCdEf123456_-AbCdEf123456";

test("the identifier of the published version is read from the tool's output", () => {
  const output = `Uploaded telemark (2.31 sec)\nDeployed telemark triggers (0.41 sec)\nCurrent Version ID: ${VERSION_ID}\n`;
  assert.equal(versionIdOf(output), VERSION_ID);
  assert.equal(versionIdOf(`Version ID:   ${VERSION_ID}`), VERSION_ID);
});

test("output without a version names none", () => {
  assert.equal(versionIdOf("Authentication error [code: 10000]"), null);
  assert.equal(versionIdOf(`Version ID: ${ACCOUNT_ID}`), null);
});

test("secret values are removed wherever they appear", () => {
  const output = `token ${TOKEN} was refused; retry with ${TOKEN}`;
  assert.equal(redactOutput(output, [TOKEN]), "token [redacted] was refused; retry with [redacted]");
});

test("anything shaped like an account identifier is removed, also when it was not given as a secret", () => {
  const output = `A request to /accounts/${ACCOUNT_ID}/workers/scripts/telemark failed.`;
  assert.equal(redactOutput(output, []), "A request to /accounts/[redacted id]/workers/scripts/telemark failed.");
});

test("e-mail addresses are removed", () => {
  assert.equal(
    redactOutput("You are logged in as owner.name+cf@example.com.", []),
    "You are logged in as [redacted e-mail].",
  );
});

test("a version identifier stays readable", () => {
  assert.equal(
    redactOutput(`Current Version ID: ${VERSION_ID}`, [TOKEN, ACCOUNT_ID]),
    `Current Version ID: ${VERSION_ID}`,
  );
});

test("an empty or missing secret removes nothing", () => {
  const output = "nothing secret here";
  assert.equal(redactOutput(output, ["", undefined, "abc"]), output);
});
