import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeConfig } from "./config-normalizer.js";
import type { RawConfig } from "./config.js";

describe("normalizeConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment variables
    process.env.TEST_VAR = "test-value";
    process.env.ENV_VAR = "env-value";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe("git array expansion", () => {
    test("expands single git URL to one repo entry", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos.length, 1);
      assert.equal(result.repos[0].git, "git@github.com:org/repo.git");
    });

    test("expands git array to multiple repo entries", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          {
            git: [
              "git@github.com:org/repo1.git",
              "git@github.com:org/repo2.git",
              "git@github.com:org/repo3.git",
            ],
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos.length, 3);
      assert.equal(result.repos[0].git, "git@github.com:org/repo1.git");
      assert.equal(result.repos[1].git, "git@github.com:org/repo2.git");
      assert.equal(result.repos[2].git, "git@github.com:org/repo3.git");
    });

    test("each expanded repo gets same content", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          {
            git: [
              "git@github.com:org/repo1.git",
              "git@github.com:org/repo2.git",
            ],
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, { key: "value" });
      assert.deepEqual(result.repos[1].content, { key: "value" });
    });

    test("handles multiple repos with mixed single and array git", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          { git: "git@github.com:org/repo1.git" },
          {
            git: [
              "git@github.com:org/repo2.git",
              "git@github.com:org/repo3.git",
            ],
          },
          { git: "git@github.com:org/repo4.git" },
        ],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos.length, 4);
      assert.equal(result.repos[0].git, "git@github.com:org/repo1.git");
      assert.equal(result.repos[1].git, "git@github.com:org/repo2.git");
      assert.equal(result.repos[2].git, "git@github.com:org/repo3.git");
      assert.equal(result.repos[3].git, "git@github.com:org/repo4.git");
    });
  });

  describe("content merging", () => {
    test("uses root content when repo has no content", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { root: "content", nested: { a: 1 } },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, {
        root: "content",
        nested: { a: 1 },
      });
    });

    test("merges repo content with root content (replace strategy)", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { base: "value", overwrite: "original" },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { overwrite: "new", extra: "data" },
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, {
        base: "value",
        overwrite: "new",
        extra: "data",
      });
    });

    test("deep merges nested objects", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: {
          nested: { a: 1, b: 2 },
        },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { nested: { b: 3, c: 4 } },
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, {
        nested: { a: 1, b: 3, c: 4 },
      });
    });

    test("uses override mode when override is true", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { base: "value", should: "not appear" },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            override: true,
            content: { only: "this" },
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, { only: "this" });
    });

    test("respects mergeStrategy option", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        mergeStrategy: "append",
        content: { items: ["a", "b"] },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { items: ["c", "d"] },
          },
        ],
      };

      const result = normalizeConfig(raw);

      // With append strategy, arrays should be concatenated
      assert.deepEqual(result.repos[0].content, {
        items: ["a", "b", "c", "d"],
      });
    });

    test("strips merge directives from output", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { items: ["a"] },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: {
              items: { $arrayMerge: "append", values: ["b"] },
            },
          },
        ],
      };

      const result = normalizeConfig(raw);

      // $arrayMerge directive should be stripped
      assert.ok(
        !JSON.stringify(result.repos[0].content).includes("$arrayMerge"),
      );
    });
  });

  describe("environment variable interpolation", () => {
    test("interpolates env vars in content", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "${TEST_VAR}" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos[0].content.key, "test-value");
    });

    test("interpolates env vars in repo content", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: {},
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { value: "${ENV_VAR}" },
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos[0].content.value, "env-value");
    });

    test("interpolates env vars with defaults", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "${MISSING_VAR:-default-val}" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos[0].content.key, "default-val");
    });

    test("throws on missing required env var", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "${MISSING_REQUIRED_VAR}" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      assert.throws(() => normalizeConfig(raw), /MISSING_REQUIRED_VAR/);
    });
  });

  describe("output structure", () => {
    test("preserves fileName in output", () => {
      const raw: RawConfig = {
        fileName: "my-config.yaml",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.fileName, "my-config.yaml");
    });

    test("output repos are independent (no shared references)", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { shared: { data: "value" } },
        repos: [
          {
            git: [
              "git@github.com:org/repo1.git",
              "git@github.com:org/repo2.git",
            ],
          },
        ],
      };

      const result = normalizeConfig(raw);

      // Modify one repo's content
      (result.repos[0].content.shared as Record<string, unknown>).data =
        "modified";

      // Other repo should be unaffected
      assert.equal(
        (result.repos[1].content.shared as Record<string, unknown>).data,
        "value",
      );
    });

    test("returns empty repos array when input has empty repos", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [],
      };

      const result = normalizeConfig(raw);

      assert.equal(result.repos.length, 0);
    });
  });

  describe("default values", () => {
    test("uses empty object when content is undefined", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { explicit: "content" },
          },
        ],
      };

      const result = normalizeConfig(raw);

      assert.deepEqual(result.repos[0].content, { explicit: "content" });
    });

    test("uses replace as default merge strategy", () => {
      const raw: RawConfig = {
        fileName: "config.json",
        content: { items: ["a", "b"] },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            content: { items: ["c", "d"] },
          },
        ],
      };

      const result = normalizeConfig(raw);

      // Replace strategy means arrays are replaced, not merged
      assert.deepEqual(result.repos[0].content, { items: ["c", "d"] });
    });
  });
});
