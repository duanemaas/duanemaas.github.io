# AGENTS.md

This is an ADT project. Its subject is a FileMaker file: schema, scripts and
layouts. There is no JavaScript toolchain here — no `package.json`, no
dependencies to install, no build step — until someone runs `adt app add`.

## What is in this directory

- `adt.json` — the project manifest. `files` maps a name to the address of a
  FileMaker file; `apps` maps a web viewer app to the file it deploys into. It
  holds no passwords and no API keys, so it is committed, and a clone of this
  repo is reproducible from it.
- `.gitignore`, `AGENTS.md`, `CLAUDE.md` — this scaffolding.

## Doing the work: `filemaker`

`filemaker` is the FileMaker schema CLI, and it is the only route this project uses to
reach a FileMaker file. It reads and writes a `.fmp12` through the real
FileMaker engine, so the semantics are FileMaker's own rather than an
approximation. NDJSON in, NDJSON out: one operation per line, one result per
line.

**Read the `fm-cli` skill before running `filemaker`.** It ships with ADT's agent
plugin, so it is available in any session that has the plugin enabled — nothing
in this project carries a copy. It is not optional background: several of `filemaker`'s
failure modes are silent or misleading — a write can report `"status":"ok"`, pass
a read in the same run, and be absent when the file is reopened — and the skill
is where the rules that catch those live. In a host with no skills, `filemaker --help`
and `filemaker help [<catalog> [<verb>]]` cover the invocation and every op shape.

The address to pass `filemaker --file=` is the `target` recorded in `adt.json` under
`files`. Do not invent a path or a host — read the manifest.

```sh
filemaker --file="fmnet://localhost/Inventory" ops.ndjson
```

That two-slash `fmnet://` is a `--file=` target and nothing else. Adding a file to
`adt.json` gives *this project* another file to work on; it creates no reference
between the FileMaker files themselves.

**An external data source is a different thing with a different syntax, and the
right path is almost always relative: `file:Other.fmp12`.** FileMaker resolves
that from the current file's location, so one reference works whether the two
files are hosted together, sitting in a folder locally, or moved from dev to
production. Hardcoding a server — `fmnet:/host/Name`, one slash, not two — pins
the reference to that host, and is for the two cases where the files genuinely
are not together: the target is hosted on a different server than the referring
file, or the referring file is local and the target is hosted. Never copy an
`adt.json` `target` into a `paths` list.

Two things to carry even before reading the skill:

- **Never trust a same-run read.** Verify with a `read:` op from a fresh
  invocation. Check for the closing `{"type":"summary",…}` line on stderr and
  confirm `rolledBack` is false.
- **Empty output is a hard error, never "no results."** Every completed run ends
  with a summary line. Zero bytes means something environmental killed the
  process.

`filemaker` requires macOS on Apple silicon and a FileMaker Pro installation, because
it links FileMaker's own frameworks.

Credentials are not stored in this project. If a file needs an account, pass
`--keychain --prompt` and let the user supply the password:

```sh
filemaker --file="<target>" --username=<YOUR_ACCOUNT> --keychain --prompt ops.ndjson
```

The two flags do different jobs. `--keychain` reads the password out of the macOS
keychain and draws nothing on its own. `--prompt` is what makes **`filemaker` ask the
user in a native window** when the file rejects what it found — including when
nothing is stored yet — with an optional "save to keychain" box. Nothing has to be
stored up front, and the password never passes through the conversation, the
command line, or `adt.json`.

**You do not need to know the account name either.** That window always has two
fields, account and password, with the account prefilled from `--username` when
you passed one — so an unknown account can be typed and a wrong one corrected. The
account actually used comes back on the
`{"type":"credential","action":"prompted",...}` line on stderr, which is where you
read it from for later runs; do not assume it echoes what you sent.

Pass `--no-prompt` instead when nobody is there to answer. It is the default, so
it changes nothing about what happens — it states in the command that this run
cannot block.

Two failures to handle rather than work around:

- **`credential_prompt_declined`** — the user dismissed that window. Terminal:
  do not re-run the command, or the window comes straight back.
- **`authentication_failed` (212) after the prompt** — the password was refused
  three times, or no window could be shown (CI, ssh). Do not guess passwords. If
  the suggestions say `--keychain` alone never asks, you left `--prompt` off;
  that one is worth another try with the flag.

Storing ahead of time is optional, and only useful right after a password
changes. It needs a real terminal, so hand the command to the user:

```sh
filemaker --file="<target>" --username=<YOUR_ACCOUNT> --store-credentials
```

The account *name* is not a secret, so `adt.json` may record it as
`files.<Name>.username` — `adt connect "<target>" --username <account>` writes it
and then opens the file to confirm the password, asking the user for it if the
keychain holds none that works. That makes `adt connect` the place to settle
credentials, including after a password change: re-run the same line. A password
never goes in `adt.json`; the keychain is the only password store. Note the
keychain item is keyed on `<username>@<target>`, so re-pointing a file at a new
target means the password is asked for again.

`adt` commands that open the file take `--keychain` too, and it reads the account
name out of `adt.json` when you do not pass `--username`:

```sh
adt layout add --table People --layout API_People --fields "PrimaryKey" --keychain
```

Prefer that over `--password`, which every process on the machine can read out of
`ps` for the life of the run. No `adt` command except `connect` will ask for a
password — the rest run `filemaker` with `--no-prompt` and fail with
`authentication_failed`, naming the `adt connect` line to run — so an `adt` run
cannot stall waiting on a window nobody is watching.

## `adt` commands

`adt` ships with ADT's agent plugin, so the session that has the command has the
skills that document it — read those rather than guessing at a flag: the
**`adt-project-setup`** skill for `adt connect`, the **`adt-webviewer-app`** skill
for `adt app add` and everything downstream of it. `adt --help` is the live list.

`adt` does not wrap `filemaker`'s **op vocabulary**. There is no `adt schema
create-table`, and adding one would duplicate a surface `filemaker help` already renders
from the same declarations its parser validates against, so the two would drift.
For creating, renaming or deleting tables, fields, table occurrences,
relationships, value lists, custom functions or scripts, call `filemaker` directly.

Layouts are the deliberate exception, because `adt layout add` does more than
emit an op: it also writes the typegen config and regenerates the client, and
those three steps have to stay consistent. So check for an `adt` command before
assuming a task is `filemaker`'s.

## Schema Conventions

New tables should follow whatever primary-key, timestamp and audit-field
pattern already exists elsewhere in this file — read an existing table with
`filemaker` before inventing a new one. If this is the first table in the file, agree
the pattern with the user before building it; a common choice is a text
PrimaryKey field with auto-enter `Get(UUID)`, prohibit modification, unique and
not empty, plus CreationTimestamp / ModificationTimestamp / CreatedBy /
ModifiedBy fields set via auto-enter. Don't invent foreign keys or value lists
for tables that don't exist yet — build the plain field and flag the
relationship as a follow-up.

## Conventions

- Once there is more than an op or two, write them to a file and pass the path
  rather than piping `echo`.
- Ops files are scratch: one attempt at one change, not a migration series, and
  not committed. Nothing replays them.
- To change something already in the file, send `update:` with only the keys that
  change — or `update:script` `edits` for a step. Never re-send a whole script
  `body` or a whole layout to fix one thing.
- Dry-run before applying. Confirm `"errors":0`.
- Point ops at a test file, not production, when a target is shared.
