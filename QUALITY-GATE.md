# Quality Gate & Security

This document describes the security and compliance quality gates that protect the repository from accidental commits of secrets, PII, and sensitive data.

## Overview

**resumessi** has a multi-layered quality gate system:

1. **Pre-commit hook** (local) — Runs on `git commit` before changes are committed
2. **GitHub Actions workflow** — Runs on every PR and push to main/develop
3. **Automated code review** — Suggests improvements based on commit patterns

## What Gets Blocked (Fatal Errors)

The quality gate will **REJECT commits** if it detects:

### Forbidden Files (Never Commit)

- `.env` — Environment variables with secrets
- `.env.local`, `.env.*.local` — Local overrides
- `storage.state` — Playwright session state
- Resume data with PII:
  - `src/resume/output/resume-data.json` — Generated resume with personal info
  - `src/resume/output/resume-data-AI-polished.json` — Polished resume with PII
  - `src/resume/output/photo*` — Profile photos
  - `src/resume/prompt.txt` — Raw input with contact info
- SQLite databases:
  - `jobdata.db`, `jobdata.db-wal`, `jobdata.db-shm`

### Hardcoded Secrets

- API keys: `API_KEY="sk_..."`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, etc.
- Tokens: `token="..."`, `bearer "..."`, GitHub tokens (`gh_`), GitLab tokens (`glpat-`)
- AWS credentials: `AKIA...` (AWS access key IDs)
- Stripe keys: `sk_live_...`, `pk_live_...`, `rk_live_...`
- Database URLs: `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`
- Authorization headers: `Authorization: Bearer ...`

### Personal Data in Code

Hardcoded personal resume data in `.ts`, `.js`, `.tsx`, `.jsx`, or `.json` files:

- Full names in JSON: `"name": "John Doe"`
- Email addresses: `"email": "user@domain.com"`
- Phone numbers: `"phone": "123-456-7890"`
- Locations: `"location": "City, ST 12345"`
- LinkedIn URLs: `"linkedin": "https://linkedin.com/in/..."`
- GitHub profiles: `"github": "https://github.com/..."`

**Note:** These patterns are allowed in test files, fixtures, and mock data. The gate skips files with `test`, `spec`, `example`, `fixture`, `mock`, `stub`, or `placeholder` in the path.

## What Gets Warned About (Non-Fatal)

The quality gate will **WARN but allow** commits if it detects:

### PII Patterns

- Phone numbers (US format): `123-456-7890`, `(123) 456-7890`
- Social Security numbers: `123-45-6789`
- Credit card numbers: `4111 1111 1111 1111`
- Physical addresses: `City, ST 12345`

### Exposed Environment Variables

- Hardcoded env var assignments: `API_KEY="actualvalue"`
- Secrets in configuration: `DATABASE_URL="postgres://..."`

### Security Anti-Patterns

- `eval(...)` — Dynamic code execution
- `exec(...)` — Process execution
- `dangerouslySetInnerHTML` — React XSS risk
- `innerHTML =` — DOM XSS risk

### File Size Issues

- Files larger than 50 MB are flagged (though usually rejected by Git itself)

## How to Use

### Local Development (Pre-commit Hook)

The quality gate **automatically runs** before each commit:

```bash
git add src/app.ts
git commit -m "Add new feature"
# Quality gate runs here automatically
# If it passes: commit succeeds
# If it fails: commit is rejected, fix and retry
```

If you need to **temporarily bypass** the hook (not recommended):

```bash
git commit --no-verify -m "Emergency fix"
```

**Warning:** The GitHub Actions workflow will still catch issues on PR, so secrets/PII will be detected there.

### GitHub Actions (CI/CD)

The quality gate runs automatically on:

- Every push to `main` or `develop`
- Every pull request to `main` or `develop`

If quality gate fails on a PR:

- The workflow adds a comment explaining the issue
- All PR checks must pass before merging
- Common fixes:
  1. Remove forbidden files
  2. Move secrets to `.env` (which is gitignored)
  3. Remove hardcoded PII data
  4. Re-push with corrected commits

## Common Issues & Fixes

### "Attempting to commit forbidden file: resume-data.json"

**Problem:** You accidentally staged the resume file.

**Fix:**

```bash
git reset HEAD src/resume/output/resume-data.json
rm src/resume/output/resume-data.json
git commit -m "sec-fix: Remove generated resume data"
```

**Why:** Resume data is generated from `src/resume/prompt.txt` and should never be committed (it contains PII).

### "Potential secret found in config.ts"

**Problem:** You hardcoded an API key or token.

**Fix:**

```bash
# Move the secret to .env
echo 'OPENAI_API_KEY=sk_...' >> .env

# Update your code to read from env:
# WRONG: const apiKey = 'sk_...';
# RIGHT: const apiKey = process.env.OPENAI_API_KEY;

git add config.ts .env
git commit -m "Move API key to .env"
```

### "Personal resume data found in app.ts"

**Problem:** You hardcoded name/email/phone in application code.

**Fix:**

```bash
# Remove hardcoded data and replace with env var or config:
# WRONG: const name = "Juani Cañete";
# RIGHT: const name = process.env.USER_NAME || "Anonymous";

git add app.ts
git commit -m "Move personal data to env config"
```

### "Large file staged: database.db (125 MB)"

**Problem:** You accidentally committed a database or build artifact.

**Fix:**

```bash
git reset HEAD large-file.db
echo 'large-file.db' >> .gitignore
git add .gitignore
git commit -m "Add large-file.db to gitignore"
```

## Testing the Quality Gate

To test the quality gate locally without committing:

```bash
npm run quality-gate
```

## Configuration

Quality gate checks are configured in:

- `scripts/quality-gate.ts` — Unified cross-platform TypeScript implementation
- `.husky/pre-commit` — Runs quality gate before each commit
- `.github/workflows/ci-pipeline.yml` — GitHub Actions workflow

To modify what gets checked:

1. Edit `scripts/quality-gate.ts`
2. Update the forbidden patterns, secret patterns, or PII patterns
3. Test locally: `npm run quality-gate`
4. Commit your changes (they'll also go through the quality gate!)

## Troubleshooting

**"Quality gate check not running on pre-commit"**

Verify Husky is installed:

```bash
npm run prepare
```

**"Scripts permission denied"**

Make scripts executable:

```bash
chmod +x scripts/quality-gate.sh
chmod +x .husky/pre-commit
```

**"Quality gate passes locally but fails on GitHub Actions"**

This usually means:

1. You're using a different shell (bash vs PowerShell) — GitHub Actions uses bash
2. Your `.env` is different locally vs CI
3. File line endings changed (CRLF vs LF)

Push the same code to a branch and check the Actions log for details.

## What's **Not** Checked

The quality gate does **NOT** check for:

- Code logic or correctness (that's what tests and code review do)
- Performance issues
- Architecture problems
- Comment quality
- Commit message format

These are handled by other tools:

- Tests: `npm run test:coverage`
- Linting: `npm run lint`
- Type checking: `npm run typecheck`
- Code review: GitHub PR reviews

## Output Symbols

- `[v]` — Passed check
- `[x]` — Fatal error (blocks commit)
- `[!]` — Warning (allowed but noted)
- `[*]` — Check in progress

## Questions?

If you believe the quality gate is incorrectly flagging something:

1. Add a comment explaining why it's a false positive
2. Update the patterns in the quality gate scripts with better detection
3. Push a fix commit — it will also go through quality gate validation

Remember: **Security is a shared responsibility.** When in doubt, err on the side of caution.

The quality gate will **REJECT commits** if it detects:

### Forbidden Files (Never Commit)

- `.env` — Environment variables with secrets
- `.env.local`, `.env.*.local` — Local overrides
- `storage.state` — Playwright session state
- Resume data with PII:
  - `src/resume/output/resume-data.json` — Generated resume with personal info
  - `src/resume/output/resume-data-AI-polished.json` — Polished resume with PII
  - `src/resume/output/photo*` — Profile photos
  - `src/resume/prompt.txt` — Raw input with contact info
- SQLite databases:
  - `jobdata.db`, `jobdata.db-wal`, `jobdata.db-shm`

### Hardcoded Secrets

- API keys: `API_KEY="sk_..."`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`, etc.
- Tokens: `token="...", `bearer "..."`, GitHub tokens (`gh_`), GitLab tokens (`glpat-`)
- AWS credentials: `AKIA...` (AWS access key IDs)
- Stripe keys: `sk_live_...`, `pk_live_...`, `rk_live_...`
- Database URLs: `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`
- Authorization headers: `Authorization: Bearer ...`

### Personal Data in Code

Hardcoded personal resume data in `.ts`, `.js`, `.tsx`, `.jsx`, or `.json` files:

- Full names in JSON: `"name": "John Doe"`
- Email addresses: `"email": "user@domain.com"`
- Phone numbers: `"phone": "123-456-7890"`
- Locations: `"location": "City, ST 12345"`
- LinkedIn URLs: `"linkedin": "https://linkedin.com/in/..."`
- GitHub profiles: `"github": "https://github.com/..."`

**Note:** These patterns are allowed in test files, fixtures, and mock data. The gate skips files with `test`, `spec`, `example`, `fixture`, `mock`, `stub`, or `placeholder` in the path.

## What Gets Warned About (Non-Fatal)

The quality gate will **WARN but allow** commits if it detects:

### PII Patterns

- Phone numbers (US format): `123-456-7890`, `(123) 456-7890`
- Social Security numbers: `123-45-6789`
- Credit card numbers: `4111 1111 1111 1111`
- ZIP+4 codes: `12345-6789`
- Physical addresses: `City, ST 12345`

### Exposed Environment Variables

- Hardcoded env var assignments: `API_KEY="actualvalue"`
- Secrets in configuration: `DATABASE_URL="postgres://..."`

### Security Anti-Patterns

- `eval(...)` — Dynamic code execution
- `exec(...)` — Process execution
- `require(process.env.VAR)` — Dynamic requires with env vars
- `dangerouslySetInnerHTML` — React XSS risk
- `innerHTML =` — DOM XSS risk
- Weak randomness in crypto

### File Size Issues

- Files larger than 50 MB are flagged (though usually rejected by Git itself)

## How to Use

### Local Development (Pre-commit Hook)

The quality gate **automatically runs** before each commit:

```bash
git add src/app.ts
git commit -m "Add new feature"
# 🔐 Quality gate runs here automatically
# If it passes: commit succeeds
# If it fails: commit is rejected, fix and retry
```

If you need to **temporarily bypass** the hook (not recommended):

```bash
git commit --no-verify -m "Emergency fix"
```

**⚠️ However**, the GitHub Actions workflow will still catch issues on PR, so secrets/PII will be detected there.

### GitHub Actions (CI/CD)

The quality gate runs automatically on:

- Every push to `main` or `develop`
- Every pull request to `main` or `develop`

If quality gate fails on a PR:

- The workflow adds a comment explaining the issue
- All PR checks must pass before merging
- Common fixes:
  1. Remove forbidden files
  2. Move secrets to `.env` (which is gitignored)
  3. Remove hardcoded PII data
  4. Re-push with corrected commits

## Common Issues & Fixes

### "Attempting to commit forbidden file: resume-data.json"

**Problem:** You accidentally staged the resume file.

**Fix:**

```bash
git reset HEAD src/resume/output/resume-data.json
rm src/resume/output/resume-data.json
git commit -m "Remove generated resume data"
```

**Why:** Resume data is generated from `src/resume/prompt.txt` and should never be committed (it contains PII).

### "Potential secret found in config.ts"

**Problem:** You hardcoded an API key or token.

**Fix:**

```bash
# Move the secret to .env
echo 'OPENAI_API_KEY=sk_...' >> .env

# Update your code to read from env:
# ❌ const apiKey = 'sk_...';
# ✅ const apiKey = process.env.OPENAI_API_KEY;

git add config.ts .env
git commit -m "Move API key to .env"
```

### "Personal resume data found in app.ts"

**Problem:** You hardcoded name/email/phone in application code.

**Fix:**

```bash
# Remove hardcoded data and replace with env var or config:
# ❌ const name = "Juani Cañete";
# ✅ const name = process.env.USER_NAME || "Anonymous";

git add app.ts
git commit -m "Move personal data to env config"
```

### "Large file staged: database.db (125 MB)"

**Problem:** You accidentally committed a database or build artifact.

**Fix:**

```bash
git reset HEAD large-file.db
echo 'large-file.db' >> .gitignore
git add .gitignore
git commit -m "Add large-file.db to gitignore"
```

## Testing the Quality Gate

To test the quality gate locally without committing:

**Bash:**

```bash
npm run quality-gate
```

## Configuration

Quality gate checks are configured in:

- `scripts/quality-gate.ts` — Unified cross-platform TypeScript implementation
- `.husky/pre-commit` — Runs quality gate before each commit
- `.github/workflows/ci-pipeline.yml` — GitHub Actions workflow

To modify what gets checked:

1. Edit `scripts/quality-gate.ts`
2. Update the forbidden patterns, secret patterns, or PII patterns
3. Test locally: `npm run quality-gate`
4. Commit your changes (they'll also go through the quality gate!)

## Troubleshooting

**"Quality gate check not running on pre-commit"**

Verify Husky is installed:

```bash
npm run prepare
```

**"Scripts permission denied"**

Make scripts executable:

```bash
chmod +x scripts/quality-gate.sh
chmod +x .husky/pre-commit
```

**"Quality gate passes locally but fails on GitHub Actions"**

This usually means:

1. You're using a different shell (bash vs PowerShell) — GitHub Actions uses bash
2. Your `.env` is different locally vs CI
3. File line endings changed (CRLF vs LF)

Push the same code to a branch and check the Actions log for details.

## What's **Not** Checked

The quality gate does **NOT** check for:

- Code logic or correctness (that's what tests and code review do)
- Performance issues
- Architecture problems
- Comment quality
- Commit message format

These are handled by other tools:

- Tests: `npm run test:coverage`
- Linting: `npm run lint`
- Type checking: `npm run typecheck`
- Code review: GitHub PR reviews

## Questions?

If you believe the quality gate is incorrectly flagging something:

1. Add a comment explaining why it's a false positive
2. Update the patterns in the quality gate scripts with better detection
3. Push a fix commit — it will also go through quality gate validation

Remember: **Security is a shared responsibility.** When in doubt, err on the side of caution.
