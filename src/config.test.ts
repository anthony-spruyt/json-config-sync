import { test, describe, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, convertJsonToString } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, '..', 'fixtures');
const expectedDir = join(fixturesDir, 'expected');

// Create a temporary directory for test fixtures
const testDir = join(tmpdir(), 'json-config-sync-test-' + Date.now());

function createTestConfig(content: string): string {
  const filePath = join(testDir, `config-${Date.now()}.yaml`);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Config', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    // Set up test environment variables
    process.env.TEST_ENV_VAR = 'test-value';
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('validation', () => {
    test('throws when fileName missing', () => {
      const path = createTestConfig(`
repos:
  - git: git@github.com:org/repo.git
    json:
      key: value
`);
      assert.throws(() => loadConfig(path), /Config missing required field: fileName/);
    });

    test('throws when repos missing', () => {
      const path = createTestConfig(`
fileName: config.json
`);
      assert.throws(() => loadConfig(path), /Config missing required field: repos/);
    });

    test('throws when repos not an array', () => {
      const path = createTestConfig(`
fileName: config.json
repos: not-an-array
`);
      assert.throws(() => loadConfig(path), /repos \(must be an array\)/);
    });

    test('throws when repo.git missing', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - json:
      key: value
`);
      assert.throws(() => loadConfig(path), /Repo at index 0 missing required field: git/);
    });

    test('allows missing repo.json when root json exists', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  rootKey: rootValue
repos:
  - git: git@github.com:org/repo.git
`);
      const config = loadConfig(path);
      assert.equal(config.repos.length, 1);
      assert.deepEqual(config.repos[0].json, { rootKey: 'rootValue' });
    });

    test('throws when repo.json missing and no root json', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/repo.git
`);
      assert.throws(() => loadConfig(path), /Repo at index 0 missing required field: json/);
    });

    test('validates git field in array syntax', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git:
      - git@github.com:org/repo1.git
      - git@github.com:org/repo2.git
    json:
      key: value
`);
      const config = loadConfig(path);
      assert.equal(config.repos.length, 2);
    });
  });

  describe('git array expansion', () => {
    test('single git string unchanged', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/repo.git
    json:
      key: value
`);
      const config = loadConfig(path);
      assert.equal(config.repos.length, 1);
      assert.equal(config.repos[0].git, 'git@github.com:org/repo.git');
    });

    test('git array expands to multiple entries', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git:
      - git@github.com:org/repo1.git
      - git@github.com:org/repo2.git
      - git@github.com:org/repo3.git
    json:
      key: value
`);
      const config = loadConfig(path);
      assert.equal(config.repos.length, 3);
      assert.equal(config.repos[0].git, 'git@github.com:org/repo1.git');
      assert.equal(config.repos[1].git, 'git@github.com:org/repo2.git');
      assert.equal(config.repos[2].git, 'git@github.com:org/repo3.git');
    });

    test('preserves json across expanded entries', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git:
      - git@github.com:org/repo1.git
      - git@github.com:org/repo2.git
    json:
      shared: value
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { shared: 'value' });
      assert.deepEqual(config.repos[1].json, { shared: 'value' });
    });

    test('mixed single and array git entries', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/single.git
    json:
      type: single
  - git:
      - git@github.com:org/array1.git
      - git@github.com:org/array2.git
    json:
      type: array
`);
      const config = loadConfig(path);
      assert.equal(config.repos.length, 3);
      assert.equal(config.repos[0].git, 'git@github.com:org/single.git');
      assert.deepEqual(config.repos[0].json, { type: 'single' });
      assert.equal(config.repos[1].git, 'git@github.com:org/array1.git');
      assert.deepEqual(config.repos[1].json, { type: 'array' });
      assert.equal(config.repos[2].git, 'git@github.com:org/array2.git');
      assert.deepEqual(config.repos[2].json, { type: 'array' });
    });
  });

  describe('json inheritance', () => {
    test('uses root json when repo.json missing', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  base: value
  nested:
    key: nested-value
repos:
  - git: git@github.com:org/repo.git
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, {
        base: 'value',
        nested: { key: 'nested-value' },
      });
    });

    test('merges repo.json onto root json', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  base: value
  override: original
repos:
  - git: git@github.com:org/repo.git
    json:
      override: updated
      added: new
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, {
        base: 'value',
        override: 'updated',
        added: 'new',
      });
    });

    test('deep merges nested objects', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  nested:
    a: 1
    b: 2
repos:
  - git: git@github.com:org/repo.git
    json:
      nested:
        b: 3
        c: 4
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, {
        nested: { a: 1, b: 3, c: 4 },
      });
    });

    test('override: true uses only repo json', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  base: value
  nested:
    key: nested-value
repos:
  - git: git@github.com:org/repo.git
    override: true
    json:
      only: repo-value
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { only: 'repo-value' });
    });

    test('override requires json field', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  base: value
repos:
  - git: git@github.com:org/repo.git
    override: true
`);
      assert.throws(
        () => loadConfig(path),
        /override: true but no json defined/
      );
    });

    test('arrays are replaced by default', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  items:
    - base1
    - base2
repos:
  - git: git@github.com:org/repo.git
    json:
      items:
        - override1
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { items: ['override1'] });
    });

    test('$arrayMerge: append concatenates arrays', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  items:
    - base1
    - base2
repos:
  - git: git@github.com:org/repo.git
    json:
      items:
        $arrayMerge: append
        values:
          - added1
          - added2
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, {
        items: ['base1', 'base2', 'added1', 'added2'],
      });
    });

    test('$arrayMerge directive is stripped from output', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  items:
    - base
repos:
  - git: git@github.com:org/repo.git
    json:
      items:
        $arrayMerge: append
        values:
          - added
`);
      const config = loadConfig(path);
      const jsonStr = JSON.stringify(config.repos[0].json);
      assert.equal(jsonStr.includes('$arrayMerge'), false);
    });

    test('global mergeStrategy affects all arrays', () => {
      const path = createTestConfig(`
fileName: config.json
mergeStrategy: append
json:
  items1:
    - a
  items2:
    - x
repos:
  - git: git@github.com:org/repo.git
    json:
      items1:
        - b
      items2:
        - y
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, {
        items1: ['a', 'b'],
        items2: ['x', 'y'],
      });
    });
  });

  describe('environment variable interpolation', () => {
    test('interpolates env vars in json values', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/repo.git
    json:
      value: \${TEST_ENV_VAR}
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { value: 'test-value' });
    });

    test('interpolates env vars in root json', () => {
      const path = createTestConfig(`
fileName: config.json
json:
  rootValue: \${TEST_ENV_VAR}
repos:
  - git: git@github.com:org/repo.git
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { rootValue: 'test-value' });
    });

    test('throws on missing env var by default', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/repo.git
    json:
      value: \${MISSING_VAR}
`);
      assert.throws(() => loadConfig(path), /Missing required environment variable: MISSING_VAR/);
    });

    test('uses default value when env var missing', () => {
      const path = createTestConfig(`
fileName: config.json
repos:
  - git: git@github.com:org/repo.git
    json:
      value: \${MISSING_VAR:-default-value}
`);
      const config = loadConfig(path);
      assert.deepEqual(config.repos[0].json, { value: 'default-value' });
    });
  });

  describe('integration', () => {
    test('full config with all features', () => {
      const path = createTestConfig(`
fileName: my.config.json
mergeStrategy: replace
json:
  version: "1.0"
  common: shared
  features:
    - core
repos:
  - git:
      - git@github.com:org/repo1.git
      - git@github.com:org/repo2.git
    json:
      team: platform
  - git: git@github.com:org/repo3.git
  - git: git@github.com:org/repo4.git
    override: true
    json:
      legacy: true
`);
      const config = loadConfig(path);

      assert.equal(config.fileName, 'my.config.json');
      assert.equal(config.repos.length, 4);

      // Expanded array repos with merge
      assert.equal(config.repos[0].git, 'git@github.com:org/repo1.git');
      assert.deepEqual(config.repos[0].json, {
        version: '1.0',
        common: 'shared',
        features: ['core'],
        team: 'platform',
      });

      assert.equal(config.repos[1].git, 'git@github.com:org/repo2.git');
      assert.deepEqual(config.repos[1].json, config.repos[0].json);

      // Repo with no json - uses root json
      assert.equal(config.repos[2].git, 'git@github.com:org/repo3.git');
      assert.deepEqual(config.repos[2].json, {
        version: '1.0',
        common: 'shared',
        features: ['core'],
      });

      // Repo with override
      assert.equal(config.repos[3].git, 'git@github.com:org/repo4.git');
      assert.deepEqual(config.repos[3].json, { legacy: true });
    });
  });
});

describe('convertJsonToString', () => {
  test('produces valid JSON', () => {
    const input = { key: 'value', nested: { foo: 'bar' } };
    const result = convertJsonToString(input);
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed, input);
  });

  test('uses 2-space indentation', () => {
    const input = { key: 'value' };
    const result = convertJsonToString(input);
    assert.equal(result, '{\n  "key": "value"\n}');
  });
});

// Helper to load expected JSON from fixture
function loadExpected(name: string): Record<string, unknown> {
  const path = join(expectedDir, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('Fixture-based tests', () => {
  describe('full-features.yaml', () => {
    const configPath = join(fixturesDir, 'full-features.yaml');

    test('expands git array to correct number of repos', () => {
      const config = loadConfig(configPath);
      // 2 from array + 1 inherit + 1 override + 1 append + 1 prepend = 6
      assert.equal(config.repos.length, 6);
    });

    test('repo-array-1: git array with overlay merge', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-array-1');
      assert.equal(config.repos[0].git, 'git@github.com:org/repo-array-1.git');
      assert.deepEqual(config.repos[0].json, expected);
    });

    test('repo-array-2: git array produces identical json', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-array-1'); // Same as repo-array-1
      assert.equal(config.repos[1].git, 'git@github.com:org/repo-array-2.git');
      assert.deepEqual(config.repos[1].json, expected);
    });

    test('repo-inherit: uses root json unchanged', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-inherit');
      assert.equal(config.repos[2].git, 'git@github.com:org/repo-inherit.git');
      assert.deepEqual(config.repos[2].json, expected);
    });

    test('repo-override: ignores root json entirely', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-override');
      assert.equal(config.repos[3].git, 'git@github.com:org/repo-override.git');
      assert.deepEqual(config.repos[3].json, expected);
    });

    test('repo-append: $arrayMerge append works', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-append');
      assert.equal(config.repos[4].git, 'git@github.com:org/repo-append.git');
      assert.deepEqual(config.repos[4].json, expected);
    });

    test('repo-prepend: $arrayMerge prepend works', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-prepend');
      assert.equal(config.repos[5].git, 'git@github.com:org/repo-prepend.git');
      assert.deepEqual(config.repos[5].json, expected);
    });
  });

  describe('global-merge-strategy.yaml', () => {
    const configPath = join(fixturesDir, 'global-merge-strategy.yaml');

    test('global mergeStrategy: append affects all arrays', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-global-append');
      assert.equal(config.repos[0].git, 'git@github.com:org/repo-global-append.git');
      assert.deepEqual(config.repos[0].json, expected);
    });
  });

  describe('env-vars.yaml', () => {
    const configPath = join(fixturesDir, 'env-vars.yaml');

    beforeEach(() => {
      process.env.API_URL = 'https://api.example.com';
      process.env.SERVICE_NAME = 'my-service';
    });

    afterEach(() => {
      delete process.env.API_URL;
      delete process.env.SERVICE_NAME;
    });

    test('interpolates env vars with defaults and required', () => {
      const config = loadConfig(configPath);
      const expected = loadExpected('repo-env');
      assert.equal(config.repos[0].git, 'git@github.com:org/repo-env.git');
      assert.deepEqual(config.repos[0].json, expected);
    });

    test('throws when required env var missing', () => {
      delete process.env.API_URL;
      assert.throws(
        () => loadConfig(configPath),
        /Missing required environment variable: API_URL/
      );
    });
  });

  describe('test-repos-input.yaml (original fixture)', () => {
    const configPath = join(fixturesDir, 'test-repos-input.yaml');

    test('expands to 3 repos', () => {
      const config = loadConfig(configPath);
      assert.equal(config.repos.length, 3);
    });

    test('first repo has merged json with array replaced', () => {
      const config = loadConfig(configPath);
      const expectedPath = join(fixturesDir, 'test-repo-output.json');
      const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));
      assert.deepEqual(config.repos[0].json, expected);
    });

    test('second repo has same json as first', () => {
      const config = loadConfig(configPath);
      assert.deepEqual(config.repos[0].json, config.repos[1].json);
    });

    test('third repo has different overlay', () => {
      const config = loadConfig(configPath);
      assert.deepEqual(config.repos[2].json.prop4, {
        prop5: [{ prop6: 'data' }],
      });
    });
  });
});
