# e2e specs

Browser flow scenarios live here as `NN-name.flow.json`. Feature or lesson specs (`L01-<slug>.md` ... `L08-<slug>.md`) also go here. Index them here.

## Template

    # <Title>
    ## What to build
    ## Acceptance criteria
    - [ ] ...
    ## Touches
    Folders whose CLAUDE.md must be updated.

## Index

- [01-app-boot](01-app-boot.flow.json): app boots and lands on a repo's PR list (whole-stack smoke)
- [02-repo-pulls-detail](02-repo-pulls-detail.flow.json): open a PR from the list and load its review detail
- [03-agents](03-agents.flow.json): agents list renders the seeded reviewer agents
- [04-pr-findings](04-pr-findings.flow.json): PR detail shows the seeded review run, verdict, and findings
- [05-pr-diff](05-pr-diff.flow.json): PR detail Files changed tab renders the seeded diff
- [06-onboarding](06-onboarding.flow.json): onboarding add-repository screen renders
- [07-settings](07-settings.flow.json): settings renders the API Keys and Feature Models sections
