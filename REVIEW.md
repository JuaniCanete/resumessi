# Code Review Guidelines

This document defines the standard for code reviews in the **resumessi** project.

## When to Trigger Code Review

- **Mandatory for feature branches** — part of the standard workflow (step 7 in AGENTS_LOCAL.md).
- When explicitly requested by the user.
- For risky changes or complex refactors.

## Code Review Checklist

### 1. Functionality

- Does the code do what it claims?
- Are edge cases handled?
- Are there any obvious bugs or logic errors?

### 2. AI Sloop Review

- No silly comments.
- No hallucinations.
- No AI sloop (circular reasoning or unproven assumptions).
- No indentation violations (respect project formatting: tab size 4, match existing style).

### 3. Coverage

- Are tests outdated?
- Is there missing coverage for new code?
- Are existing tests breaking?

### 4. Security

- Check for critical issues.
- Check for outdated packages.
- Check for OWASP Top 10 issues.

### 5. Maintainability

- Is the code readable?
- Are variable/function names clear?
- Are there redundant comments or unnecessary complexity?

## Output Format

Create a code review file following this template:

```
# Code Review: <feature-name>

**Date:** YYYY-MM-DD
**Reviewed by:** <Agent Name>
**Author:** Juani / <Agent>

## Summary

Brief overall assessment.

## Checklist Results

- [ ] Functionality
- [ ] AI Sloop Review
- [ ] Coverage
- [ ] Security
- [ ] Maintainability

## Findings

For each finding, provide:
1. **Severity:** (Critical / Warning / Suggestion)
2. **Location:** (File name and line number)
3. **Issue:** (What is wrong and the concrete failure mode)
4. **Fix:** (A clear, drop-in code snippet or action to resolve it)

## Veredict

- [ ] Approved
- [ ] Approved with comments
- [ ] Needs changes

```

- File should be added to this folder `code-review`
- File name should be `<feature-name>.md`

## Sign-off

The reviewer should sign their contribution at the end of the file, such as: Reviewed by, Reported by, Fixed by, etc.

---

*Updated: 2025-07-28*