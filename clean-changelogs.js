/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

const CHANGELOG_PATH = path.join(__dirname, 'changelog.md')
const ARCHIVE_PATH = path.join(__dirname, 'changelog_archive.md')
const NOTES_PATH = path.join(__dirname, '.release-notes.b64')
const MAX_SECTIONS = 20
// semantic-release heads major/minor releases with a single '#' and patch
// releases with '##' — match either, but not '### Bug Fixes' subheadings,
// and not the bare '# Changelog' document title (also single-hash) —
// require an actual version number, which only real release headings have.
const SECTION_HEADING = /^#{1,2} .*\d+\.\d+\.\d+/

function readNotes() {
  return Buffer.from(fs.readFileSync(NOTES_PATH, 'utf8'), 'base64').toString('utf8')
}

function splitSections(content) {
  const lines = content.split('\n')
  const preamble = []
  const sections = []
  let current = null

  for (const line of lines) {
    if (SECTION_HEADING.test(line)) {
      if (current) sections.push(current)
      current = [line]
    } else if (current) {
      current.push(line)
    } else {
      preamble.push(line)
    }
  }
  if (current) sections.push(current)

  return { preamble, sections }
}

function joinChangelog(preamble, sections) {
  const body = sections.map((section) => section.join('\n').trimEnd()).join('\n\n')
  return `${preamble.join('\n').trimEnd()}\n\n${body}\n`
}

function main() {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: node clean-changelogs.js <version>')
    process.exit(1)
  }

  const notes = readNotes()
  fs.unlinkSync(NOTES_PATH)

  const existing = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, 'utf8')
    : '# Changelog\n'
  const { preamble, sections } = splitSections(existing)

  sections.unshift(notes.trim().split('\n'))

  const overflow = sections.length > MAX_SECTIONS ? sections.splice(MAX_SECTIONS) : []

  fs.writeFileSync(
    CHANGELOG_PATH,
    joinChangelog(preamble.length ? preamble : ['# Changelog'], sections)
  )
  console.log(
    `clean-changelogs: wrote v${version} to changelog.md (${sections.length} section(s) kept)`
  )

  if (overflow.length) {
    const existingArchive = fs.existsSync(ARCHIVE_PATH)
      ? fs.readFileSync(ARCHIVE_PATH, 'utf8')
      : '# Changelog Archive\n'
    const { preamble: archivePreamble, sections: archiveSections } = splitSections(existingArchive)

    fs.writeFileSync(
      ARCHIVE_PATH,
      joinChangelog(archivePreamble.length ? archivePreamble : ['# Changelog Archive'], [
        ...overflow,
        ...archiveSections,
      ])
    )
    console.log(`clean-changelogs: moved ${overflow.length} section(s) into changelog_archive.md`)
  }
}

main()
