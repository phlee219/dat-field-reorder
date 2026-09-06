# DAT Field Reorder — FE/DC4 (v2.17.0)

Browser-only tool for eDiscovery professionals to **reorder/remove fields** and build **client header maps** for FE/DC4 load-file `.dat` documents, then **re-read the saved file** and validate it against the original.

Everything runs **locally** — no upload, no server, no network. Works best in **Chrome / Edge** (streaming file save).

---

## Deployment & verification summary (v2.17.0)

**Verified status** (executed with Node v24.20.0):
- `tests/run_core_tests.mjs` → **98 PASS / 0 FAIL** (parsers, encoders, streaming chunk boundaries, tiered auto-match, record-separator EOL, header alignment, short/long rows, synthetic fixtures, property tests).
- `tests/run_dom_flow.mjs` → **15 PASS / 0 FAIL** (whole page initialises, R1 pure-core self-test passes, real `loadFile → saveFileCore → validator` returns PASS, short-row override save succeeds).
- `node --check` over the entire inline `<script>` → no syntax errors.

**Changelog lineage:**
- v2.10 — base: streaming FE/DC4 reorder/client-map + re-read validator + SHA-256 audit + fail-closed preflight.
- v2.11 — decoder fail-closed, structural format detection, row-count assertion, overwrite backup, identity QC.
- v2.12 — record-separator EOL accounting (dominant style), leading-blank tolerance, startup pure-core self-test.
- v2.13 — 3-tier field auto-matching (T1 Exact / T2 Similar / T3 Lenient alias+fuzzy).
- v2.14 — validator short-row padding (rows with fewer fields compared as trailing empties).
- v2.15 — header-alignment centralisation (`dataRowStreamer`) so leading blanks never leak the header as a data row.
- v2.16 — on-demand core diagnostics + instant saved-file header self-check.
- v2.17 — validator structural FAIL driven by LONG rows only (short rows = padded), completing the harmonisation.

**Operational acceptance:** see the Pre-flight acceptance checklist below. The only remaining manual step is a real-browser smoke test (File System Access streaming save + 🧪 1-Click validation), since those browser APIs cannot be exercised headlessly here.

## What changed in v2.17.0 — short-row harmonization completed

v2.14 relaxed the per-row comparison for short rows but the validator's final
structural FAIL still used `mismatched` (short + long rows together), so a purely
short-row (trailing-empty) file still failed. v2.17.0 drives the structural FAIL
**only from LONG rows (extra cells = real schema corruption)** — matching the padded
per-row comparison — and the report now labels short rows as
"padded as trailing empties". A file saved with the column-count override therefore
validates cleanly when its only difference is omitted trailing empty fields.

## What changed in v2.16.0 — verification & trust

- **On-demand core diagnostics.** A footer button (**🩺 Run core self-check**) re-runs the pure-core
  integrity self-test at any time and reports the result (with version). Any failure keeps saving and
  validation disabled (fail-closed) — so an operator can re-verify the build immediately after hosting or updating.
- **Instant saved-file structure check.** Immediately after every save the tool reads back just the
  first record (header) of the file it wrote and verifies (a) the header text equals what was intended,
  (b) the column count equals the header width. A mismatch marks the output unusable at once, before the
  full 1-Click re-read validator is even offered.

## Pre-flight acceptance checklist (recommended before any real delivery)

1. **Run the core test harness (Node ≥ 18):** `node tests/run_core_tests.mjs` → expect `PASS … FAIL 0`
   (verified: **98 pass / 0 fail on Node v24.20.0**).
2. **Run the DOM-stub end-to-end harness:** `node tests/run_dom_flow.mjs` → expect `PASS … FAIL 0`
   (verified: **15 pass / 0 fail** — the whole page loads under a DOM stub, the R1 self-test
   passes, a real `loadFile → saveFileCore` save completes cleanly, and the validator reports PASS end-to-end).
3. **Open the app** and confirm the console shows `DAT Field Reorder pure-core self-test OK (v2.17.0)`.
4. **Footer → 🩺 Run core self-check** → expect a green "Core self-test OK" toast.
5. **Do one 1-Click round-trip:** load a small FE/DC4 file, reorder/remove a column, save, then press
   **🧪 Validate saved output** → expect PASS and matching per-cell values / identity sequence.

## What changed in v2.15.0 — header-alignment fix

Header identification is now **centralized** (`dataRowStreamer()` / `isBlankPhysicalRecord()`): leading blank
lines are skipped, then the first non-blank record is the header. This exact rule is applied everywhere —
index build, save preflight, reorder save, client save, and validator pairing. Previously only the loader
skipped leading blanks, so a file starting with a blank line could have its real header written/sent as a
first data row during save or mis-paired during validation. That is now impossible: a leading-blank FE file
loads, saves and validates identically to a file without leading blanks.

## What changed in v2.14.0 — short-row harmonization & robustness

- **Validator short rows no longer false-FAIL.** A source/output row with *fewer* fields than its header means the trailing columns are empty (positional FE/Concordance/CSV). The writer already pads those with `''`, so the validator compares them the same way. (Row-level comparison was relaxed here; the structural/indexed FAIL that still blocked short-row files was fully aligned in v2.17.0.) Rows with **extra** cells (a genuine schema corruption / column shift) still fail.
- **Large-file index builds stay responsive** with periodic yields (multi-million-row loads no longer freeze the tab).
- **Startup self-test widened** to cover UTF-16 byte round-trip and the tiered auto-match engine (monotonic / alias / ambiguity-never-guessed).

## What changed in v2.13.0 — 3-tier field auto-matching

Both **✨ Auto-Match** (client mode) and **✨ Auto-Match Headers** (validator) now use a shared,
selectable-strictness engine. Pick the tier next to the button — **higher tiers map more rows** (monotonic):
- **T1 · Exact** — the header equals a source field name exactly.
- **T2 · Similar (recommended, default)** — equal after normalization (case, spaces, `_ - . /`).
- **T3 · Lenient** — eDiscovery alias/synonym match (`Bates Begin`↔`BEGDOC`, `Control No.`↔`Control Number`, …) or a guarded fuzzy match on the remaining names.

Integrity rules: ambiguity is **never guessed** (ties map nothing); tier-3 links are tagged **T3** and
highlighted as low-confidence for review; within one run a tier-3 source column is used only once so
unrelated headers can't silently claim the same column. Auto-mapped rows show their tier tag (T1/T2/T3).
The default **T2** reproduces the previous normalized-matching behaviour.

## What changed in v2.12.0 (R hardening wave)

- **Startup pure-core self-test (fail-closed).** On load, the tool runs the core splitters/composers/detectors/encoders against a compact fixture set. If any regress, **saving and validation are disabled** and the page warns — a broken core can never emit a silent bad delivery in production (no tooling required; runs in the browser).
- **Record-separator EOL accounting.** EOL style/count is now measured at record boundaries only; newlines embedded inside text-field values no longer distort it. A genuinely mixed source now keeps its **dominant** separator style (LF stays LF) instead of silently forcing CRLF.
- **Leading-blank-line tolerance.** A stray empty line before the header no longer makes a genuine FE/DC4 file get rejected as a wrong format.
- **Test harness expanded** to the full `File → sniff → index` path and the A-1 decoder-availability branch.

### What changed in v2.11.0 (previous hardening wave)

- **Decoder-support guard (fail-closed).** A UTF-16 (BOM or byte-signature) file is *never* silently re-read as CP1252/UTF-8 when the browser lacks the matching decoder — it is blocked with an explicit message instead of producing mojibake.
- **Structural FE/DC4 format detection.** Format is decided on structure, not delimiter counts, so a genuine FE file — including single-column headers whose value contains a comma/pipe/tab — can no longer be misparsed as CSV/pipe/TSV.
- **Post-save row-count assertion.** The number of data rows actually written must equal the source data-record count; a mismatch marks the output unusable (byte-size checks alone cannot see a dropped row).
- **Overwrite backup.** Replacing an existing non-empty destination now streams a timestamped `.bak` copy to Downloads *before* truncating, so an interrupted save is recoverable.
- **Advisory identity uniqueness QC (validator).** The validation report now surfaces duplicate and blank identity values, plus a conservative numeric sequence-gap scan (only after a uniform `+1` run is established, so Bates conventions cause no false alarms). These are report-only and never affect PASS/FAIL.
- **Node pure-core test harness** under `tests/` (see below).

---

## Supported input

| Aspect | Support |
|---|---|
| Layout | **FE/DC4** — fields `þ…þ`, separated by `0x14 (DC4)` (primary) · **legacy no-DC4** layout `þaþþbþ` accepted automatically (per record) |
| Encoding | UTF-8 (±BOM) · UTF-16 LE/BE (±BOM). CP1252 and other formats are **blocked by design** |
| EOL | CRLF / LF / CR — record separators and a trailing EOL are preserved |
| Values | Empty fields, embedded newlines (multiline), `þ` escaped as `þþ`, any Unicode |

Other dialects (Concordance `^|^`, CSV, TSV, Pipe) and CP1252 are intentionally not accepted.

---

## Modes

1. **Reorder / Remove** — pick a source, reorder or drop columns, live-preview the first rows, save.
2. **Client Header Map** — paste delivery headers (vertical list or 2-column map), link each to a source field (1:1 or 1:N), save; unmapped headers are written empty only with an explicit override.
3. **Validator** — after a save, press **🧪 Validate saved output** (or drop any two files) to re-read the **actual file** and compare.

---

## Data-integrity guarantees

**Before any byte is written**
- Structural risks block the save: raw `0x14` inside a value, **unpaired UTF-16 surrogates**, truncated UTF-16 tail, unclosed text qualifier, blank headers, rows whose column count differs from the header (override = explicit consent).
- Overwriting an existing file requires consent; saving over the loaded source is blocked.

**While writing**
- Streaming (constant memory). If a write is interrupted, the UI warns that the destination may be partially replaced, and closing the tab during a save is guarded.

**After saving**
- Post-save self-check: the on-disk size must equal the bytes written — a mismatch marks the file unusable and disables 1-Click validation.
- Optional SHA-256 audit report (source bytes + every written byte) is saved/downloadable with a timestamped name.

**1-Click re-read validator (the real check)**
- Re-reads the actual saved file and compares against the original:
  - record/schema reconciliation + **per-cell** parsed comparison (only EOL normalization is auto-accepted),
  - **identity row-linkage** — the chosen identity values must appear in exactly the same order/values (catches dropped, duplicated, reordered rows),
  - **encoding / BOM / EOL style-and-count** equality (single-style sources),
  - **disk == saved-bytes** SHA-256 chain when validating the file just saved,
  - re-read SHA-256 of both files is printed in the report.
- The 1-Click context is invalidated whenever a **new source is loaded or the file is re-parsed**, so an output can never be "validated" against the wrong original.

---

## Explicit limits / operator responsibilities

- Validation pairs rows **by position**; it is not a general row-permutation comparator.
- Identity **uniqueness / gap QC**: v2.11.0 adds an *advisory* duplicate/blank/sequence-gap scan to the validation report. Because duplicates, blanks and non-contiguous numbering can be legitimate in some datasets, these results are **report-only and never affect PASS/FAIL** — the operator must still confirm against the delivery spec. Numeric sequence-gap detection only fires after a uniform `+1` run is firmly established so Bates conventions produce no false alarms.
- Legacy no-DC4 layout has **no escape for a literal `þ` inside a value** (parsed as a field boundary).
- Manual validation of two files that intentionally differ in encoding/BOM/EOL **fails by design** (byte-level metadata is strict).
- This is integrity tooling, not a forensic chain-of-custody/provenance system; companion-file completeness is out of scope.

---

## Files

```
field_mapper.html   ← the entire app (single file, no dependencies)
README.md           ← this guide
.nojekyll           ← static-hosting marker
tests/              ← Node test harnesses + synthetic fixtures (dev only)
```

Host it anywhere static (file://, GitHub Pages, intranet). No backend required.

---

## Running the pure-core tests (dev)

The app itself needs nothing beyond a browser. To run the TDD harness that verifies the
splitters/composers/encoders/detectors against intentionally malformed fixtures, you need
Node.js >= 18 (no npm dependencies):

```
node tests/run_core_tests.mjs
node tests/run_dom_flow.mjs
```

The harness extracts the DOM-free "pure core" between the `__EDML_CORE_BEGIN__` /
`__EDML_CORE_END__` markers in `field_mapper.html` and checks that every well-formed
fixture round-trips losslessly (embedded newlines, escaped thorn, zero-padded Bates
progression, UTF-16 LE), that every malformed fixture (unbalanced qualifier, raw DC4
in a value) is caught, that the full `File → sniff → index` path works, and that a
genuinely "mixed-EOL" source is only mixed at record separators. It also exercises the
fail-closed decoder guard (A-1) by temporarily disabling a decoder, plus the DOM-free
helpers used elsewhere (`identityShape`, `valExpectedTransformation`, `normKey`,
`uniqueNormalizedIndex`, `unsafeClientHeader`) and a **randomized `feCompose ↔ feSplit`
round-trip property test** (modern DC4 layout, embedded newlines / escaped thorn /
Unicode, with raw DC4 always blocked). `run_dom_flow.mjs` additionally loads the **whole app
page** under a minimal DOM stub and drives a real `loadFile → saveFileCore` save AND the `valLoadSide → valAutoMap → valRunValidate` validator (PASS) to confirm the
browser-facing flow initialises (R1 self-test passes), parses a FE/DC4 file, and saves cleanly.

**Runtime self-test (no Node needed).** Every time the page loads, the app also runs the
same style of pure-core checks in the browser and logs `startup pure-core self-test OK` to
the console. If it ever fails, saving and validation are disabled (fail-closed) so a
regression can never produce a silently corrupted delivery.
