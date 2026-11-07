# Session 2026-11-07 — Publish local DocForm work to GitHub

- User outcome: publish the authorized local-only branches and leave all relevant PRs open; do not merge into main.
- Account route: GitHub Primary, authorized in the conversation. Main base at the start of this publication: `deffe60c91a00041765530e3192259735c36defe`.
- Publication commits preserve the reviewed branch trees; tree objects were compared with local target trees before the branch refs were advanced. PR refs were checked with a non-force, expected-head update for the existing G03 branch.
- Published branches and current PR state:

| Lane | Branch head | Tree | PR | State |
|---|---|---|---|---|
| DF-A01 | `6ff2bc02b88995cf00084a0037cbc9c86a98bfff` | `508888b47a909aaf5f47038527ad207dba364f5a` | [#44](https://github.com/tranhaihp26-bit/DocForm/pull/44) | OPEN, DRAFT |
| DF-B03 | `d5426d2077cb76f3adb6b56bea6ccf9f0fe393c8` | `cad6aae51b4de72dd0cb17aac03fb59b6f96eaf5` | [#37](https://github.com/tranhaihp26-bit/DocForm/pull/37) | OPEN, DRAFT |
| DF-B04 | `0500c4a9d39bc3612ee85163b23c3443e9bb9c9a` | `b15fbadd4780815b6b88b8e6039c0ebae6a226dd` | [#45](https://github.com/tranhaihp26-bit/DocForm/pull/45) | OPEN, DRAFT |
| PA-01–PA-03 | `4d31de98624dd14844f1832f14288deaeea71269` | `b7467d6e6b29be7401c5915ea1c58e081034d3d0` | [#46](https://github.com/tranhaihp26-bit/DocForm/pull/46) | OPEN, DRAFT |
| PA-05 | `340e758499c83ff200f07560d563b1039d1a38cb` | `135dc18d8e74a8b879b5d067e7c8605e0ecd84cb` | [#47](https://github.com/tranhaihp26-bit/DocForm/pull/47) | OPEN, DRAFT |

- DF-B03: the focused local audit test previously passed 2/2 and `npm run lint` passed. GitHub Actions for the current head completed successfully: [42367294809](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42367294809), [42367294801](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42367294801), [42367294808](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42367294808). The configured V2.2 suites passed 31/31; they do not include the focused audit test.
- DF-B04 local evidence already recorded before publication: settings 10/10, dual-regime header 5/5, export-candidate 6/6, lint and diff check PASS. No new test was run for the publication step.
- DF-A01, PA-01–PA-03 and PA-05 are documentation work. PA-05 local evidence includes storage 6/6 and synthetic preview/print 1/1; `import-session-browser.test.ts` failed twice at the modal assertion while `loadDraft` was pending, and `office-worker-redesign.test.ts` failed the recorded geometry assertion `9980 !== 10170`. These failures are disclosed in PR #47.
- No workflow run was returned for the current heads of PRs #44, #45, #46 or #47 at check time. Issues #12, #8, #16, #4, #5, #6 and #34 remain open. No Office rendering, Word/WPS review, or UAT was done in this publication step.
- No new push was needed for G07/PR #42, G09/PR #38, or G14/PR #43 because their local trees already matched their existing remote PR trees. PRs #39, #40 and #41 were already merged before this publication request.
- Status: publication is persisted in GitHub draft branches/PRs, not integrated into main. Review, any required CI, and Word/WPS/UAT gates remain outstanding.
