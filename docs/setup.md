# Setup — Adopting This in Your Own Repo

This template assumes a Node.js project with a `package.json` at the repo
root, `main` as the default branch, and (recommended, not required by the
workflow itself) branch protection on `main` requiring PRs + passing CI.

## 1. Copy the files

```
.github/workflows/release-train-pipeline.yml
.releaserc.json
compute-release.mjs
clean-changelogs.js
changelog.md          (start it as just `# Changelog\n` if you don't have one)
```

## 2. Install the dependencies

```bash
npm install --save-dev semantic-release \
  @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator
```

## 3. Required repo settings

Two repo-level settings must be enabled, or the pipeline fails partway
through:

```bash
gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

Without `can_approve_pull_request_reviews=true`, `gh pr create` in
`prepare-release-pr` fails outright — not a soft "CI won't auto-trigger"
limitation, an actual failure.

## 4. Adopt (or adapt) the commit convention

The pipeline reads [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
to decide what to release. See [`commit-convention.md`](commit-convention.md)
for the exact bump-type matrix this config produces, including the `!`
breaking-change shorthand.

If your team doesn't follow Conventional Commits today, decide that
up front — this pipeline reads commit messages as its only signal, and
non-compliant messages don't error, they just silently produce no release
(see [`bugs-found.md`](bugs-found.md#commit-convention-robustness-documented-not-yet-mitigated)).
`commitlint` as a required CI check is the recommended mitigation; it's not
included in this template yet.

## Known limitations

- **Release PRs don't auto-trigger your other CI.** This pipeline opens the
  release PR using the default `GITHUB_TOKEN`, and GitHub Actions does not
  trigger other workflows (build/test CI, etc.) for PRs opened with that
  token. A reviewer needs to manually nudge CI — an empty commit, or
  close/reopen the PR — before merging if your branch protection requires
  passing checks. A real Personal Access Token for the release bot would
  remove this, at the cost of a dedicated bot account to manage.
- **Only `publish-release` is concurrency-guarded.** `prepare-release-pr`
  isn't yet — two releasable pushes landing within seconds of each other
  could theoretically race on the version-bump commit. Not exercised or
  fixed in this template (see the roadmap in the main
  [README](../README.md#roadmap)).
- **Third-party Actions are pinned to version tags** (`actions/checkout@v4`),
  not commit SHAs. Standard convenience/security tradeoff — SHA-pinning is
  the safer default for a workflow holding `contents: write` /
  `pull-requests: write` permissions, and isn't done here yet.
- **Assumes a Node.js project.** `compute-release.mjs` runs on Node and
  `package.json`'s `version` field is the source of truth. Adapting this to
  another ecosystem means replacing the version-read/write step and keeping
  the rest of the two-job shape.
