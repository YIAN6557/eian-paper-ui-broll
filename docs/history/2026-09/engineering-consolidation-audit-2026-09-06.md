# Engineering Consolidation Audit — 2026-09-06

## Classification

| Class | Retained location | Content |
|---|---|---|
| A. CANONICAL | this directory | current T01 + T02 source, shared systems, runtime assets, package files, specs, and small validation fixture |
| B. FORMAL SPEC | `specs/` | locked T02 specification, engineering instructions, shared contracts, and production records |
| C. VALIDATION EVIDENCE | project-root `validation-evidence/` | curated formal manifests, hashes, final MP4s, lock records, and validation logs |
| D. HISTORICAL ARCHIVE | project-root `archive/` | prior Stage 4 baseline and original T02 Production Validated milestone ZIP |
| E. DELETE | old working copies and candidates | duplicate source copies, node_modules, cache, temp/output/preview artifacts, old Candidate ZIPs, preflight patch, and superseded Stage 4 candidate |

## Canonical-source selection

The selected source is the accepted T02 Production Validation implementation. It is newer than the 9:16 Preview Candidate: it adds T02 production routing, three-ratio timing integration, punctuation coverage, full validation workflow, and the final validation corrections while retaining T01 and all shared systems.

## Baseline policy

The new current baseline is a clean snapshot of this Canonical Source. It excludes node_modules, package-manager caches, rendered media, preview files, temporary jobs, logs, historical archives, and validation evidence. Historical formal milestone packages remain in project-root `archive/`.
