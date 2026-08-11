// Computes the next version + notes via semantic-release's dry-run mode,
// which never tags or pushes anything — unlike a normal `npx semantic-release`
// run, which tags the current commit as part of its core flow regardless of
// which publish plugins are configured. That premature tag was landing
// directly on `main` before any PR review, so this script is how
// prepare-release-pr gets the version/notes without triggering it.
import semanticRelease from 'semantic-release'
import { writeFileSync, appendFileSync } from 'fs'

const result = await semanticRelease({ dryRun: true })

if (!result) {
  console.log('No release warranted.')
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, 'released=false\n')
  }
  process.exit(0)
}

const { version, notes } = result.nextRelease
writeFileSync('.next-notes.md', notes)
console.log(`Next release: ${version}`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `released=true\nversion=${version}\n`)
}
