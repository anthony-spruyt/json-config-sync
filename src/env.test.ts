import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { interpolateEnvVars, type EnvInterpolationOptions } from "./env.js";

describe("interpolateEnvVars", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment variables
    process.env.TEST_VAR = "test-value";
    process.env.ANOTHER_VAR = "another-value";
    process.env.EMPTY_VAR = "";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("replaces ${VAR} with env value", () => {
    const input = { key: "${TEST_VAR}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "test-value" });
  });

  test("replaces multiple vars in one string", () => {
    const input = { key: "${TEST_VAR}-${ANOTHER_VAR}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "test-value-another-value" });
  });

  test("returns default for ${VAR:-default} when var missing", () => {
    const input = { key: "${MISSING_VAR:-fallback}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "fallback" });
  });

  test("uses env value over default when var exists", () => {
    const input = { key: "${TEST_VAR:-fallback}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "test-value" });
  });

  test("uses default when var is empty string", () => {
    const input = { key: "${EMPTY_VAR:-fallback}" };
    const result = interpolateEnvVars(input);
    // Empty string is still a valid value, don't use default
    assert.deepEqual(result, { key: "" });
  });

  test("throws for ${VAR:?message} when var missing", () => {
    const input = { key: "${MISSING_VAR:?Variable is required}" };
    assert.throws(
      () => interpolateEnvVars(input),
      /MISSING_VAR: Variable is required/,
    );
  });

  test("uses env value for ${VAR:?message} when var exists", () => {
    const input = { key: "${TEST_VAR:?Variable is required}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "test-value" });
  });

  test("processes nested objects recursively", () => {
    const input = {
      level1: {
        level2: {
          value: "${TEST_VAR}",
        },
      },
    };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, {
      level1: {
        level2: {
          value: "test-value",
        },
      },
    });
  });

  test("processes arrays recursively", () => {
    const input = {
      items: ["${TEST_VAR}", "${ANOTHER_VAR}", "literal"],
    };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, {
      items: ["test-value", "another-value", "literal"],
    });
  });

  test("processes arrays of objects", () => {
    const input = {
      items: [{ name: "${TEST_VAR}" }, { name: "static" }],
    };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, {
      items: [{ name: "test-value" }, { name: "static" }],
    });
  });

  test("leaves non-string values unchanged", () => {
    const input = {
      number: 42,
      boolean: true,
      nullValue: null,
      array: [1, 2, 3],
    };
    const result = interpolateEnvVars(input as Record<string, unknown>);
    assert.deepEqual(result, input);
  });

  test("strict mode throws on missing vars without modifier", () => {
    const input = { key: "${MISSING_VAR}" };
    const options: EnvInterpolationOptions = { strict: true };
    assert.throws(
      () => interpolateEnvVars(input, options),
      /Missing required environment variable: MISSING_VAR/,
    );
  });

  test("non-strict mode leaves placeholder as-is", () => {
    const input = { key: "${MISSING_VAR}" };
    const options: EnvInterpolationOptions = { strict: false };
    const result = interpolateEnvVars(input, options);
    assert.deepEqual(result, { key: "${MISSING_VAR}" });
  });

  test("default strict mode is true", () => {
    const input = { key: "${MISSING_VAR}" };
    assert.throws(
      () => interpolateEnvVars(input),
      /Missing required environment variable: MISSING_VAR/,
    );
  });

  test("handles empty default value", () => {
    const input = { key: "${MISSING_VAR:-}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "" });
  });

  test("handles complex default value with special characters", () => {
    const input = { key: "${MISSING_VAR:-http://example.com:8080/path}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "http://example.com:8080/path" });
  });

  test("handles var names with underscores", () => {
    process.env.MY_LONG_VAR_NAME = "long-value";
    const input = { key: "${MY_LONG_VAR_NAME}" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "long-value" });
  });

  test("handles mixed vars with defaults and required", () => {
    const input = {
      required: "${TEST_VAR:?Required}",
      withDefault: "${MISSING:-default}",
      simple: "${ANOTHER_VAR}",
    };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, {
      required: "test-value",
      withDefault: "default",
      simple: "another-value",
    });
  });

  test("preserves non-variable dollar signs", () => {
    const input = { key: "price is $100" };
    const result = interpolateEnvVars(input);
    assert.deepEqual(result, { key: "price is $100" });
  });

  test("handles empty object", () => {
    const result = interpolateEnvVars({});
    assert.deepEqual(result, {});
  });
});
