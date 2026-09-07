# eDiscovery Project Rules

Work as a Senior eDiscovery Back-End Delivery Engineer. Data integrity and loss prevention are the highest priorities.

## Project Contract

- This is a local, single-HTML browser application.
- Keep evidence processing local. Do not add cloud processing, external analysis, server transmission, or cloud logging.
- Before integrity-related work, inspect the root HTML, `README.md`, `DATA_INTEGRITY_REVIEW.md`, and relevant files under `tests/`.
- If an execution filename changes, update implementation, documentation, and test paths together.
- Treat original evidence files as immutable.

## Supported DAT Profile

The current strict profile supports:

- FE/DC4 DAT
- field separator: U+0014 DC4
- text qualifier: `þ` U+00FE
- UTF-8
- UTF-16 LE
- UTF-16 BE

The current application intentionally blocks:

- raw CR/LF inside DAT fields
- CP1252
- legacy no-DC4 FE variants
- mixed record EOL styles
- malformed or unbalanced qualifiers
- field-count mismatches
- ambiguous encoding or structure

Do not broaden supported formats or encodings unless explicitly requested.

Do not confuse `¶` U+00B6 with DC4 U+0014. Do not call `þ` "ASCII 254".

## Data Preservation

- Header and every data record must have exactly the same field count.
- Never pad missing fields or discard extra fields.
- Preserve empty fields, trailing empty fields, whitespace, tabs, leading zeroes, case, and Unicode composition.
- Do not implicitly trim, normalize, cleanse, case-convert, or numerically convert field values.
- Validate the full source, including unselected columns, before committing a transformation.
- Validate all mapping indexes as integers and in range. Invalid mappings must fail, not become blank output fields.

## Streaming and Encoding

- Design for files of 50 GB or more.
- Do not load entire DAT files with `readAsText()`, full `arrayBuffer()`, or equivalent whole-file approaches.
- Use bounded chunked processing with state preserved across chunk boundaries.
- Do not silently replace invalid decoding with U+FFFD, `?`, skipped bytes, or another encoding.
- If encoding is ambiguous, require an explicit choice or block processing.

## Validation and Save Safety

- Never report PASS while required checks are incomplete.
- Distinguish at least: unverified, running, pass, fail, cancelled, and error.
- Invalidate prior PASS results when input, output, mapping, identity, encoding, or relevant validation settings change.
- Prevent stale asynchronous operations from overwriting current validation state.
- Verify record count, structure, mapping, row order, and exact approved field values where applicable.
- Equal size or row count alone does not prove integrity.
- Use SHA-256 for integrity-sensitive input/output verification where supported.
- Do not describe an in-memory Blob re-read as verification of the actual saved disk file.
- Browser File System Access does not provide Python/Node `fsync()` or `os.replace()` semantics; do not claim guarantees the browser cannot provide.

## Working Method

For planning-only requests:

- read and analyze only
- do not modify files or run tests
- identify affected files, integrity risks, architecture, tests, and completion criteria

For implementation requests:

- reproduce the defect or add a failing test first when practical
- implement the change
- run the relevant existing Node tests
- independently verify important integrity invariants where practical
- update documentation when the supported contract changes

After integrity-related changes, run from the project root:

```powershell
node tests/run_core_tests.mjs
node tests/run_dom_flow.mjs
```

Do not weaken existing expectations or remove integrity checks merely to obtain passing tests.

Use synthetic fixtures for malformed data. Never corrupt actual evidence files for testing.

Apply OPT, image-reference, or Bates-specific rules only when those features are explicitly being added, modified, or validated.

At completion, report concisely:

- what changed
- why
- tests executed and results
- independent validation performed
- material remaining limitations or unverified scope