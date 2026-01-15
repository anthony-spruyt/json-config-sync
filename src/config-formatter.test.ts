import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import {
  detectOutputFormat,
  convertContentToString,
  type OutputFormat,
} from "./config-formatter.js";

describe("detectOutputFormat", () => {
  test("returns json for .json extension", () => {
    const result = detectOutputFormat("config.json");
    assert.equal(result, "json");
  });

  test("returns yaml for .yaml extension", () => {
    const result = detectOutputFormat("config.yaml");
    assert.equal(result, "yaml");
  });

  test("returns yaml for .yml extension", () => {
    const result = detectOutputFormat("config.yml");
    assert.equal(result, "yml" === "yml" ? "yaml" : "json");
  });

  test("handles uppercase extensions", () => {
    assert.equal(detectOutputFormat("config.JSON"), "json");
    assert.equal(detectOutputFormat("config.YAML"), "yaml");
    assert.equal(detectOutputFormat("config.YML"), "yaml");
  });

  test("handles mixed case extensions", () => {
    assert.equal(detectOutputFormat("config.Json"), "json");
    assert.equal(detectOutputFormat("config.Yaml"), "yaml");
  });

  test("handles multiple dots in filename", () => {
    assert.equal(detectOutputFormat("my.config.json"), "json");
    assert.equal(detectOutputFormat("my.config.yaml"), "yaml");
    assert.equal(detectOutputFormat("my.config.file.yml"), "yaml");
  });

  test("returns json for unknown extensions", () => {
    assert.equal(detectOutputFormat("config.txt"), "json");
    assert.equal(detectOutputFormat("config.xml"), "json");
  });

  test("returns json for no extension", () => {
    assert.equal(detectOutputFormat("config"), "json");
  });

  test("handles path with directories", () => {
    assert.equal(detectOutputFormat("path/to/config.json"), "json");
    assert.equal(detectOutputFormat("path/to/config.yaml"), "yaml");
  });
});

describe("convertContentToString", () => {
  test("converts to JSON with 2-space indent for .json files", () => {
    const content = { key: "value", nested: { a: 1 } };
    const result = convertContentToString(content, "config.json");

    // Should be valid JSON
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed, content);

    // Should have 2-space indentation
    assert.ok(result.includes('  "key"'));
  });

  test("converts to YAML with 2-space indent for .yaml files", () => {
    const content = { key: "value", nested: { a: 1 } };
    const result = convertContentToString(content, "config.yaml");

    // Should contain YAML format (no quotes around simple strings, colons)
    assert.ok(result.includes("key: value"));
    assert.ok(result.includes("nested:"));
    assert.ok(result.includes("  a: 1"));
  });

  test("converts to YAML for .yml files", () => {
    const content = { key: "value" };
    const result = convertContentToString(content, "config.yml");
    assert.ok(result.includes("key: value"));
  });

  test("handles arrays in JSON format", () => {
    const content = { items: ["a", "b", "c"] };
    const result = convertContentToString(content, "config.json");
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed.items, ["a", "b", "c"]);
  });

  test("handles arrays in YAML format", () => {
    const content = { items: ["a", "b", "c"] };
    const result = convertContentToString(content, "config.yaml");
    assert.ok(result.includes("- a"));
    assert.ok(result.includes("- b"));
    assert.ok(result.includes("- c"));
  });

  test("handles empty object", () => {
    const content = {};
    const jsonResult = convertContentToString(content, "config.json");
    const yamlResult = convertContentToString(content, "config.yaml");

    assert.equal(JSON.parse(jsonResult).toString(), {}.toString());
    assert.ok(yamlResult === "{}\n" || yamlResult.trim() === "{}");
  });

  test("handles nested objects", () => {
    const content = {
      level1: {
        level2: {
          level3: "deep",
        },
      },
    };

    const jsonResult = convertContentToString(content, "config.json");
    const parsed = JSON.parse(jsonResult);
    assert.equal(parsed.level1.level2.level3, "deep");

    const yamlResult = convertContentToString(content, "config.yaml");
    assert.ok(yamlResult.includes("level1:"));
    assert.ok(yamlResult.includes("level2:"));
    assert.ok(yamlResult.includes("level3: deep"));
  });

  test("handles special characters in JSON", () => {
    const content = { message: 'Hello "World"' };
    const result = convertContentToString(content, "config.json");
    const parsed = JSON.parse(result);
    assert.equal(parsed.message, 'Hello "World"');
  });

  test("handles boolean and number values", () => {
    const content = { enabled: true, count: 42, ratio: 3.14 };

    const jsonResult = convertContentToString(content, "config.json");
    const parsed = JSON.parse(jsonResult);
    assert.equal(parsed.enabled, true);
    assert.equal(parsed.count, 42);
    assert.equal(parsed.ratio, 3.14);

    const yamlResult = convertContentToString(content, "config.yaml");
    assert.ok(yamlResult.includes("enabled: true"));
    assert.ok(yamlResult.includes("count: 42"));
  });

  test("handles null values", () => {
    const content = { empty: null };

    const jsonResult = convertContentToString(content, "config.json");
    const parsed = JSON.parse(jsonResult);
    assert.equal(parsed.empty, null);

    const yamlResult = convertContentToString(content, "config.yaml");
    assert.ok(
      yamlResult.includes("empty: null") || yamlResult.includes("empty:"),
    );
  });
});
