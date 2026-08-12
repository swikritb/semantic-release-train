# Commit Convention

This pipeline reads [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
to decide whether a release is warranted at all, and if so, what kind.

```
feat: add CSV export for the reports page
fix: correct rounding error in the totals column
feat!: redesign public API response envelope

BREAKING CHANGE: `data` field renamed to `items`
```

## Bump-type matrix

Verified directly against the real, installed `@semantic-release/commit-analyzer`,
using this repo's exact `.releaserc.json`, both as a live end-to-end test
(real commits, real merged PRs, real published GitHub Releases) and via
direct library inspection:

| Commit | Bump | Notes |
|---|---|---|
| `feat: ...` | **minor** | |
| `fix: ...` | **patch** | |
| `perf: ...` | **patch** | |
| `refactor:` / `test:` / `chore:` / `docs:` / `ci:` | **none** | no release |
| `feat(scope): ...` | **minor** | scope has no effect on bump type |
| `fix(scope): ...` | **patch** | scope has no effect on bump type |
| `feat(scope,other): ...` | **minor** | multiple scopes, same as above |
| `... ` + `BREAKING CHANGE:` footer | **major** | works with the default preset out of the box |
| `feat!: ...` | **major** | shorthand — see below |
| `feat(scope)!: ...` | **major** | shorthand, scoped — see below |
| `fix!: ...` | **major** | shorthand |
| `fix(scope)!: ...` | **major** | shorthand, scoped |

## The `!` shorthand needs a parser override

The `BREAKING CHANGE:` footer form works with `@semantic-release/commit-analyzer`'s
default (`angular`) preset out of the box. The shorter `!` shorthand —
`feat!:` or `feat(scope)!:` — does **not**. `angular`'s header pattern has no
`!` handling at all, so a commit written that way fails to match the header
format entirely: type, scope, and subject all come back empty, and the
commit silently falls through as unparseable. No release, no error, no
warning — see [`bugs-found.md`](bugs-found.md#bug-3-feat-fix-shorthand-silently-produced-no-release-at-all)
for how this was found and fixed.

`.releaserc.json` in this repo carries a narrow `parserOpts` override — just
the header regex, applied to both `commit-analyzer` and
`release-notes-generator` — that accepts an optional `!` without touching
anything else:

```json
"parserOpts": {
  "headerPattern": "^(\\w*)(?:\\((.*)\\))?!?: (.*)$",
  "breakingHeaderPattern": "^(\\w*)(?:\\((.*)\\))?!: (.*)$"
}
```

If you strip this override back to the plain `angular` default, `feat!:`
and `feat(scope)!:` (with or without a scope) go back to producing **no
release at all** — confirmed directly, not assumed. Every other row in the
matrix above is unaffected by this override either way.

## Recommended (not included): enforce it in CI

Compliance with this convention is currently review-only — nothing rejects
a malformed commit type before it merges. A real-world audit of an existing
repo adopting this pipeline found commits like `hot-fix:`, `Fix:` (title
case), `hotfix:` (no hyphen), and `[FIX] ...` (bracket style, no colon) —
every one of them silently produces **zero release**, with no error
anywhere. The only symptom is the version number not moving, which nobody
watches for on every merge.

Adding [`commitlint`](https://commitlint.js.org/) as a required CI check on
PRs into `main`, enforcing exactly the lowercase types this pipeline reads
(`feat|fix|perf|refactor|test|chore|docs|ci`), would reject a malformed
commit type at review time instead of letting it merge and silently fail to
release. This isn't wired up in this template yet — see the roadmap in the
main [README](../README.md#roadmap).
