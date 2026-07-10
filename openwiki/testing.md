# Testing Guide & CI/CD Configuration

## Overview

TC-Bot uses Vitest for testing with comprehensive CI/CD pipelines via GitHub Actions. This document covers the test structure, coverage requirements, and the automated deployment process.

## Test Framework

### Configuration Files

#### Vitest Configuration (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      include: ['src/helper/**', 'src/commands/**'],
    },
  },
});
```

#### TypeScript Test Config (`tsconfig.test.json`)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "data"]
}
```

## Test Structure

### Directory Layout

```
/tests/
├── formatters.test.ts    # String formatting utilities
├── gearcheck.test.ts     # Gear check command tests
├── healtroop.test.ts     # Healing troop calculations (largest test file)
├── hrDuration.test.ts    # Human-readable duration formatting
├── its.test.ts          # Item Trading System tests
├── logError.test.ts     # Error logging utility tests
├── mopup.test.ts        # Mopup timing system tests
├── sheetsCache.test.ts  # Google Sheets caching tests
└── helpers.ts          # Test helper utilities
```

### Test Helper (`helpers.ts`)

```typescript
export function createMockRow(data: Record<string, string>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value])) as TroopRow;
}
```

## Running Tests

### Command Reference

```bash
# Run all tests once
pnpm run test

# Watch mode (development)
pnpm run test:watch

# Coverage report
pnpm run test:coverage

# Run specific test file
pnpm test -- tests/mopup.test.ts

# Run tests with UI (if configured)
pnpm test --ui
```

### Quality Validation

The comprehensive validation script (`run-quality-checks.mjs`) runs:

1. Formatting check (`pnpm run check-format`)
2. Linting (`pnpm run lint`)
3. Type checking (`pnpm run typecheck`)
4. Tests (`pnpm run test`)

```bash
# Run complete validation
pnpm run validate
```

## Test Examples

### Unit Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateMopupTiming } from '../src/helper/mopup.js';

describe('mopup module', () => {
  describe('calculateMopupTiming', () => {
    it('should return correct status during active window', () => {
      // Mock Date for predictable testing
      const mockDate = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(mockDate);

      const result = calculateMopupTiming();
      expect(result.status).toBe('ACTIVE');
      expect(result.timeRemaining).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should return correct status during inactive window', () => {
      const mockDate = new Date('2024-01-01T04:00:00Z');
      vi.setSystemTime(mockDate);

      const result = calculateMopupTiming();
      expect(result.status).toBe('INACTIVE');
    });
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getSheetRowsCached } from '../src/helper/sheetsCache.js';

describe('sheetsCache', () => {
  it('should cache sheet data and return from cache on subsequent calls', async () => {
    const mockRows = [{ id: '1', name: 'Test' }];
    const mockSheets = {
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                ['id', 'name'],
                ['1', 'Test'],
              ],
            },
          }),
        },
      },
    };

    // First call fetches from API
    const result1 = await getSheetRowsCached('test-id', 0, { sheetsClient: mockSheets });
    expect(result1).toEqual(mockRows);
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(1);

    // Second call uses cache
    const result2 = await getSheetRowsCached('test-id', 0, { sheetsClient: mockSheets });
    expect(result2).toEqual(mockRows);
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(1); // Still 1
  });
});
```

## CI/CD Pipeline

### Main CI Workflow (`/.github/workflows/ci.yml`)

#### Trigger Conditions

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'tests/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - '.github/workflows/ci.yml'
      - '.env.production'
      - 'client_secret.json'
      - 'ecosystem.config.cjs'
```

#### Pipeline Stages

1. **Deployment Check**: Determines if deployment is needed
2. **Version Bumping**: Runs semantic-release for version management
3. **Validation**: Quality checks (formatting, linting, typecheck, tests)
4. **Build & Deploy**: Builds, deploys commands, and deploys to server

#### Smart Deployment Detection

The pipeline checks if production dependencies changed:

```yaml
- name: Check if deployment is needed
  id: deployment-check
  run: |
    if git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep -E '^(package\.json|pnpm-lock\.yaml)$'; then
      echo "deployment_needed=true" >> $GITHUB_OUTPUT
    else
      echo "deployment_needed=false" >> $GITHUB_OUTPUT
    fi
```

### PR Validation Workflow (`/.github/workflows/pr.yml`)

#### Trigger Conditions

```yaml
on:
  pull_request:
    branches: [main]
```

#### Single Job: Validate

- Runs formatting, linting, typecheck, build, and tests
- No deployment steps
- Provides feedback on PR quality

## Semantic Release Configuration

### Release Rules (`.releaserc.json`)

```json
{
  "branches": ["main"],
  "plugins": [
    [
      "@semantic-release/commit-analyzer",
      {
        "preset": "angular",
        "releaseRules": [{ "type": "chore", "scope": "ci", "release": "patch" }]
      }
    ],
    "@semantic-release/release-notes-generator",
    ["@semantic-release/npm", { "npmPublish": false }],
    [
      "@semantic-release/exec",
      {
        "prepareCmd": "node scripts/append-changelog.mjs ${nextRelease.version} \"${nextRelease.notes}\""
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["package.json", "pnpm-lock.yaml", "CHANGELOG.md"]
      }
    ]
  ]
}
```

### Version Bumping Rules

- **feat**: Minor version bump
- **fix**: Patch version bump
- **chore** (ci scope): Patch version bump
- **BREAKING CHANGE**: Major version bump

## Coverage Requirements

### Minimum Thresholds

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 60%
- **Statements**: 70%

### Coverage Reports

- **Text**: Console output during test runs
- **JSON**: `./coverage/coverage-final.json`
- **HTML**: `./coverage/index.html` (detailed browser report)

### Coverage Enforcement

- CI pipeline fails if thresholds not met
- PR validation includes coverage checking
- Local development can use `--coverage` flag

## Test Environment

### Environment Variables for Testing

```bash
# Test-specific environment (when needed)
NODE_ENV=test
GOOGLE_SHEET_CACHE=0  # Disable caching for predictable tests
```

### Mocking Strategy

1. **Date/Time**: Use `vi.setSystemTime()` for time-dependent tests
2. **External APIs**: Mock Google Sheets client
3. **Database**: Test with in-memory SQLite when needed
4. **Discord.js**: Mock interactions and responses

## Dependabot Configuration

### Update Schedule (`/.github/dependabot.yml`)

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
      day: 'monday'
      time: '09:00'
    open-pull-requests-limit: 10
    groups:
      production-dependencies:
        dependency-type: 'production'
      development-dependencies:
        dependency-type: 'development'
    ignore:
      - dependency-name: 'discord.js'
        update-types: ['version-update:semver-major']
      - dependency-name: 'google-auth-library'
        update-types: ['version-update:semver-major']
      - dependency-name: '@googleapis/sheets'
        update-types: ['version-update:semver-major']
      - dependency-name: 'better-sqlite3'
        update-types: ['version-update:semver-major']
      - dependency-name: 'typescript'
        update-types: ['version-update:semver-major']
```

### Update Groups

- **Production dependencies**: Updated together
- **Development dependencies**: Updated together
- **Major version updates**: Ignored for critical packages

## Production Deployment

### PM2 Configuration (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: 'TC-Bot',
      script: './dist/tc-bot.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
```

### Deployment Process

1. **SSH-based deployment** to production server
2. **Environment variables** securely injected via GitHub Secrets
3. **Process management** via PM2
4. **Log rotation** configured for production logs

## Monitoring & Observability

### Test Metrics

- **Duration**: Test execution time
- **Coverage**: Code coverage percentages
- **Pass/fail rates**: Test success metrics

### Production Metrics

- **Command usage**: Tracked via SQLite database
- **Error rates**: Monitored via centralized logging
- **Performance**: Latency monitoring in `clientReady` event

## Troubleshooting Tests

### Common Issues

#### Test Failures After Dependency Updates

1. Check if mocks need updating for new API versions
2. Verify TypeScript compatibility
3. Review breaking changes in dependency release notes

#### Coverage Threshold Failures

1. Run coverage report locally: `pnpm run test:coverage`
2. Identify uncovered code paths
3. Add tests for missing coverage
4. Consider if threshold adjustments are needed

#### Flaky Tests

1. Check for time-dependent tests without proper mocking
2. Verify async/await patterns are correct
3. Review race conditions in concurrent tests
4. Consider increasing timeouts for slow operations

#### Environment Issues

1. Ensure test environment variables are set
2. Check for missing mocks of external dependencies
3. Verify test database setup/teardown
4. Review file system permissions for test artifacts

### Debugging Tips

```bash
# Run specific test with verbose output
pnpm test -- tests/mopup.test.ts -v

# Debug with Node inspector
NODE_OPTIONS='--inspect' pnpm test

# Run tests without coverage for speed
pnpm test --no-coverage

# Update snapshots (if used)
pnpm test -- -u
```

## Best Practices

### Writing Maintainable Tests

1. **Descriptive names**: Use `describe` and `it` blocks clearly
2. **Single responsibility**: Each test should test one thing
3. **Proper setup/teardown**: Use `beforeEach` and `afterEach`
4. **Mock external dependencies**: Isolate unit tests
5. **Test edge cases**: Include boundary conditions

### Test Organization

1. **Group by module**: Mirror source code structure
2. **Separate unit and integration tests**: Use different describe blocks
3. **Helper functions**: Extract common test logic
4. **Test data**: Use consistent mock data patterns

### CI/CD Optimization

1. **Cache dependencies**: Speed up pipeline execution
2. **Parallel jobs**: Run validation steps in parallel when possible
3. **Early failure**: Fail fast on critical issues
4. **Informative reports**: Clear error messages and logs
