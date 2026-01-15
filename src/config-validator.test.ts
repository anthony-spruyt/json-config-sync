import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { validateRawConfig } from "./config-validator.js";
import type { RawConfig } from "./config.js";

describe("validateRawConfig", () => {
  // Helper to create a minimal valid config
  const createValidConfig = (overrides?: Partial<RawConfig>): RawConfig => ({
    fileName: "config.json",
    content: { key: "value" },
    repos: [{ git: "git@github.com:org/repo.git" }],
    ...overrides,
  });

  describe("fileName validation", () => {
    test("throws when fileName is missing", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).fileName;

      assert.throws(
        () => validateRawConfig(config),
        /Config missing required field: fileName/,
      );
    });

    test("throws when fileName is empty string", () => {
      const config = createValidConfig({ fileName: "" });

      assert.throws(
        () => validateRawConfig(config),
        /Config missing required field: fileName/,
      );
    });

    test("throws when fileName contains path traversal (..)", () => {
      const config = createValidConfig({ fileName: "../config.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: must be a relative path/,
      );
    });

    test("throws when fileName contains path traversal in middle", () => {
      const config = createValidConfig({ fileName: "path/../config.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: must be a relative path/,
      );
    });

    test("throws when fileName is absolute path (Unix)", () => {
      const config = createValidConfig({ fileName: "/etc/config.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: must be a relative path/,
      );
    });

    test("throws when fileName contains newline", () => {
      const config = createValidConfig({ fileName: "config\n.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: cannot contain newlines or null bytes/,
      );
    });

    test("throws when fileName contains carriage return", () => {
      const config = createValidConfig({ fileName: "config\r.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: cannot contain newlines or null bytes/,
      );
    });

    test("throws when fileName contains null byte", () => {
      const config = createValidConfig({ fileName: "config\0.json" });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid fileName: cannot contain newlines or null bytes/,
      );
    });

    test("allows valid fileName with subdirectory", () => {
      const config = createValidConfig({ fileName: "subdir/config.json" });
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("allows valid fileName with dots", () => {
      const config = createValidConfig({ fileName: "my.config.json" });
      assert.doesNotThrow(() => validateRawConfig(config));
    });
  });

  describe("repos validation", () => {
    test("throws when repos is missing", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).repos;

      assert.throws(
        () => validateRawConfig(config),
        /Config missing required field: repos/,
      );
    });

    test("throws when repos is not an array", () => {
      const config = createValidConfig();
      (config as Record<string, unknown>).repos = "not-an-array";

      assert.throws(
        () => validateRawConfig(config),
        /Config missing required field: repos \(must be an array\)/,
      );
    });

    test("throws when repos is null", () => {
      const config = createValidConfig();
      (config as Record<string, unknown>).repos = null;

      assert.throws(
        () => validateRawConfig(config),
        /Config missing required field: repos/,
      );
    });

    test("throws when repo is missing git field", () => {
      const config = createValidConfig({
        repos: [{ content: { key: "value" } } as never],
      });

      assert.throws(
        () => validateRawConfig(config),
        /Repo at index 0 missing required field: git/,
      );
    });

    test("throws when repo has empty git array", () => {
      const config = createValidConfig({
        repos: [{ git: [], content: { key: "value" } }],
      });

      assert.throws(
        () => validateRawConfig(config),
        /Repo at index 0 has empty git array/,
      );
    });

    test("allows repo with git as string", () => {
      const config = createValidConfig({
        repos: [{ git: "git@github.com:org/repo.git" }],
      });
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("allows repo with git as array of strings", () => {
      const config = createValidConfig({
        repos: [
          {
            git: [
              "git@github.com:org/repo1.git",
              "git@github.com:org/repo2.git",
            ],
          },
        ],
      });
      assert.doesNotThrow(() => validateRawConfig(config));
    });
  });

  describe("mergeStrategy validation", () => {
    test("allows undefined mergeStrategy", () => {
      const config = createValidConfig();
      delete config.mergeStrategy;
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("allows replace mergeStrategy", () => {
      const config = createValidConfig({ mergeStrategy: "replace" });
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("allows append mergeStrategy", () => {
      const config = createValidConfig({ mergeStrategy: "append" });
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("allows prepend mergeStrategy", () => {
      const config = createValidConfig({ mergeStrategy: "prepend" });
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("throws for invalid mergeStrategy", () => {
      const config = createValidConfig({
        mergeStrategy: "invalid" as never,
      });

      assert.throws(
        () => validateRawConfig(config),
        /Invalid mergeStrategy: invalid. Must be one of: replace, append, prepend/,
      );
    });
  });

  describe("content validation", () => {
    test("allows undefined root content with repo content", () => {
      const config: RawConfig = {
        fileName: "config.json",
        repos: [
          { git: "git@github.com:org/repo.git", content: { key: "val" } },
        ],
      };
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("throws when root content is not an object", () => {
      const config = createValidConfig();
      (config as Record<string, unknown>).content = "string";

      assert.throws(
        () => validateRawConfig(config),
        /Root content must be an object/,
      );
    });

    test("throws when root content is null", () => {
      const config = createValidConfig();
      (config as Record<string, unknown>).content = null;

      assert.throws(
        () => validateRawConfig(config),
        /Root content must be an object/,
      );
    });

    test("throws when root content is an array", () => {
      const config = createValidConfig();
      (config as Record<string, unknown>).content = ["array"];

      assert.throws(
        () => validateRawConfig(config),
        /Root content must be an object/,
      );
    });

    test("throws when repo missing content and no root content", () => {
      const config: RawConfig = {
        fileName: "config.json",
        repos: [{ git: "git@github.com:org/repo.git" }],
      };

      assert.throws(
        () => validateRawConfig(config),
        /Repo at index 0 missing required field: content/,
      );
    });

    test("allows repo without content when root content exists", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };
      assert.doesNotThrow(() => validateRawConfig(config));
    });
  });

  describe("override validation", () => {
    test("throws when override is true but no content", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/repo.git", override: true }],
      };

      assert.throws(
        () => validateRawConfig(config),
        /has override: true but no content defined/,
      );
    });

    test("allows override with content", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          {
            git: "git@github.com:org/repo.git",
            override: true,
            content: { override: "content" },
          },
        ],
      };
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("error message includes git URL for override error", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/my-repo.git", override: true }],
      };

      assert.throws(
        () => validateRawConfig(config),
        /git@github.com:org\/my-repo\.git has override: true/,
      );
    });

    test("error message uses first git URL when git is array", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          {
            git: [
              "git@github.com:org/repo1.git",
              "git@github.com:org/repo2.git",
            ],
            override: true,
          },
        ],
      };

      assert.throws(
        () => validateRawConfig(config),
        /git@github.com:org\/repo1\.git has override: true/,
      );
    });
  });

  describe("multiple repos validation", () => {
    test("validates all repos in array", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          { git: "git@github.com:org/repo1.git" },
          { git: "" }, // Invalid - empty git
        ],
      };

      assert.throws(
        () => validateRawConfig(config),
        /Repo at index 1 missing required field: git/,
      );
    });

    test("reports correct index for error in third repo", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [
          { git: "git@github.com:org/repo1.git" },
          { git: "git@github.com:org/repo2.git" },
          {} as never, // Missing git
        ],
      };

      assert.throws(
        () => validateRawConfig(config),
        /Repo at index 2 missing required field: git/,
      );
    });
  });

  describe("valid configurations", () => {
    test("accepts minimal valid config", () => {
      const config: RawConfig = {
        fileName: "config.json",
        content: { key: "value" },
        repos: [{ git: "git@github.com:org/repo.git" }],
      };
      assert.doesNotThrow(() => validateRawConfig(config));
    });

    test("accepts full valid config", () => {
      const config: RawConfig = {
        fileName: "subdir/my.config.yaml",
        content: { base: "config" },
        mergeStrategy: "append",
        repos: [
          { git: "git@github.com:org/repo1.git", content: { extra: "data" } },
          {
            git: [
              "git@github.com:org/repo2.git",
              "git@github.com:org/repo3.git",
            ],
            override: true,
            content: { override: "content" },
          },
        ],
      };
      assert.doesNotThrow(() => validateRawConfig(config));
    });
  });
});
