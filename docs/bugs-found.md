# Bugs Found — and What Made Them Findable

None of the four bugs below were visible from reading the workflow YAML.
All four only surfaced from actually running real commits through the
pipeline in a live repo and reading the Actions logs and GitHub Release
pages — release automation deserves the same "does it actually work"
testing as application code.

Live evidence for all of this — the real commits, PRs, Actions runs, and
published Releases — is public in
[`release-train-test`](https://github.com/swikritb/release-train-test), a
throwaway repo built specifically to run this pipeline for real without
touching a production `main`.

## Bug #1: dry-run isn't automatically side-effect-free

**Found while testing the first `feat:` commit.**

The `prepare-release-pr` job originally called `npx semantic-release`
directly to compute the next version, on the assumption that this was
side-effect-free as long as no publish plugins
(`@semantic-release/git`, `@semantic-release/github`) were configured. That
assumption was wrong:

```
✔ Completed step "prepare" of plugin "@semantic-release/exec"
✔ Created tag v1.1.0
```

**Tagging is a core semantic-release step, not something a publish plugin
controls.** It fires unconditionally after analysis, regardless of which
publish plugins exist, on whatever branch is checked out — which for this
job is `main` itself, *before* the `bump-release/vX.Y.Z` branch even exists.

Real-world impact, confirmed live: the tag landed directly on `main`'s
pre-bump commit, no PR, no review, `package.json` still read the old
version. When the (correctly proposed) release PR was later merged,
`publish-release` checked "does this tag already exist?" — yes, wrongly —
and exited immediately. **No GitHub Release was ever created,** on every
cycle, deterministically.

**Fix:** `compute-release.mjs` calls semantic-release's JS API with
`dryRun: true` instead — confirmed to never tag or push
(`⚠ Skip v1.1.0 tag creation in dry-run mode`). The workflow applies the
version bump and changelog itself, only inside the bot's own branch, after
the dry run reports a version.

## Bug #2: closed PRs were getting silently reused

**Found while verifying Bug #1's fix**, after manually closing a stale PR
during cleanup.

```bash
if gh pr view "$BRANCH" --json number >/dev/null 2>&1; then
  gh pr edit "$BRANCH" ...
else
  gh pr create ...
fi
```

`gh pr view <branch>` matches a PR by branch name **regardless of state**
— open, closed, or merged. If a `bump-release/vX.Y.Z` PR was ever closed
without merging (the exact "stale PR from a superseded cycle" scenario),
and that same version/branch name comes up again, this silently ran
`gh pr edit` against the *closed* PR instead of opening a fresh one. Net
effect: no open, reviewable PR exists at all, and nobody is notified.

**Fix:** query `gh pr list --head "$BRANCH" --state open` explicitly
instead of state-agnostic `gh pr view`. While already in that code path:
also close any *other* open `bump-release/*` PR before opening/updating the
current one — two releasable pushes close together previously left the
first, now-outdated PR orphaned with nobody cleaning it up.

## Bug #3: `feat!:`/`fix!:` shorthand silently produced no release at all

**Found while confirming a requirement**: `BREAKING CHANGE:` footer → major,
`feat:` → minor, `fix:` → patch. The footer form worked from day one. The
shorter Conventional Commits shorthand — `feat!:` / `fix!:` — did not.

```
Analyzing commit: feat!: redesign public API response envelope
The commit should not trigger a release
```

Not "major" — **nothing**. `angular`'s default header pattern
(`^(\w*)(?:\((.*)\))?: (.*)$`) has no `!` handling, so `feat!: ...` fails to
match the header format at all — type, scope, and subject all come back
empty, and the commit silently falls through as unparseable.

**First fix attempt (rejected):** switching both `commit-analyzer` and
`release-notes-generator` to the `conventionalcommits` preset, which
natively supports `!`. Version-bump computation worked (`feat!:` → major),
but the generated changelog notes came back completely empty — no
`### Features` section, no bullet, nothing but the version header line.
That broke something already verified working, so this approach was
scrapped.

**Actual fix:** keep `preset` unset on both plugins (defaults to `angular`,
so the already-verified changelog rendering stays untouched) and add a
`parserOpts` override — just the header regex — that accepts an optional
`!`. See [`docs/commit-convention.md`](commit-convention.md) for the exact
config and the full verification matrix, including the scoped
`feat(scope)!:` / `fix(scope)!:` variants.

## Bug #4: empty GitHub Release body for minor/major releases

**Found in production**, not in a test repo first: a real minor-bump
release's GitHub Release page had no body at all — a human had to go into
Edit → "Generate release notes" to backfill it.

**Root cause:** the release-notes extraction hard-coded a match on `## `
(exactly two hashes). But semantic-release's writer heads **major/minor**
releases with a single `#` and only **patch** releases with `##`. A minor
release's changelog heading was `# [x.y.0](...)` — never matched. The
extraction fell through and grabbed the wrong content, so the GitHub
Release published with an effectively empty body.

**First fix attempt (rejected: matched the wrong line):** broadened the
match to "1 or 2 leading hashes." This passes for patch releases but is
still wrong — `changelog.md`'s own document title line, `# Changelog`, is
*also* single-hash and matches. Verified this failure for real: merging a
minor-bump PR under this "fix" produced a GitHub Release body that was
literally just `# Changelog` — the title, not the actual notes. The same
flaw also corrupted the changelog-rotation script, which misclassified the
title line as its own "section" and duplicated it mid-file.

**Actual fix:** require an actual `x.y.z` version number in the matched
line:

```js
const HEADING = /^#{1,2} .*\d+\.\d+\.\d+/;
```

This matches real release headings regardless of hash count, while
excluding both `###`-level subheadings (wrong hash count already) and the
bare `# Changelog` title (no version number). Re-verified live: forced
another minor bump (the exact scenario that broke) and confirmed the
GitHub Release body rendered correctly, with `changelog.md` staying
properly structured — no duplication, no misplaced sections.

## Commit-convention robustness (documented, not yet mitigated)

Real commit messages don't always follow the convention exactly. A batch
test of realistic "someone typed it wrong" variants found that 7 of 8
non-compliant formats — `hot-fix:` (hyphenated), `Fix:` (title case),
`hotfix:` (no hyphen), `fixed:` (past tense), `feature:` (long-form),
`[FIX] ...` (bracket style), and `fix rounding issue...` (no colon at all)
— are **silently ignored**: zero version bump, zero changelog entry, no
error anywhere. The only symptom is the version number not moving, which
nobody watches for on every merge.

One surprising exception: all-caps `FIX: ...` *does* match — not through
the normal `fix:` rule, but by accident, through an unrelated legacy rule
(`{ type: "FIX", release: "patch" }`) bundled into
`@semantic-release/commit-analyzer`'s shipped defaults, left over from the
JSHint project's old commit convention. It happens to be an exact,
case-sensitive coincidental match, while `fix`, `Fix`, `hotfix`, `hot-fix`,
`fixed` all fall through unmatched.

**Recommendation, not yet implemented:** add `commitlint` as a required CI
check on PRs into `main`, enforcing exactly the lowercase types this
pipeline reads. See [`docs/commit-convention.md`](commit-convention.md#recommended-not-included-enforce-it-in-ci).
