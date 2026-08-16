# One More Road

One More Road is a transparent, interactive explanation of Braess's paradox. The
visitor predicts an outcome, moves 4,000 drivers onto a shortcut, watches eighty
driver groups change route and searches for the town's best balance. The visitor can
drag the slider or play, pause and replay the same calculation. At the endpoint, a
deliberate comparison action reveals the same 4,000 drivers with the shortcut closed
and open; closing the shortcut reverses the result. Every travel time comes from the three visible rules,
and the complete arithmetic stays visible while the slider moves.

The presented network uses three explicit classroom rules:

1. A fixed road always takes 45 minutes.
2. A narrow road takes one minute per 100 cars using it.
3. The short middle connector adds zero minutes in this simplified model.

Drivers who avoid the shortcut split evenly between two identical old routes. Every
shortcut driver uses both narrow roads. With no shortcut users, each old route takes
`20 + 45 = 65` minutes. When all 4,000 drivers choose the individually quicker
shortcut, both narrow roads take 40 minutes and the shortcut takes `40 + 0 + 40 = 80`.
An individual driver would still prefer that 80-minute shortcut to leaving alone on an
85-minute old route, so nobody changes course by themselves. Removing the shortcut
changes the choices for everyone, restores the even split and returns every trip to 65
minutes. The paradox is the gap between the individually best choice and the best result
for the whole network.

This is an exact illustrative model, not a claim about a real city and not a hidden
traffic simulation. The prior microscopic simulator remains in the repository as part
of the documented development process, but it is not imported by the public page.

## Run locally

Node 24 and pnpm 11.9.0 are pinned in `mise.toml`.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm exec playwright install chromium
mise exec -- pnpm dev
```

Run the complete type, build, lint, model and browser checks:

```sh
mise exec -- pnpm check
```

Validate `PROCESS.md`, its commit citations and the assignment reflection:

```sh
mise exec -- pnpm check:evidence
```

## Architecture

| Area | Responsibility |
| --- | --- |
| `index.html` | Semantic experiment, prediction, live arithmetic, reversal and reveal |
| `styles.css` | Responsive layout, congestion cues, moving driver groups and reduced motion |
| `main.ts` | Coordinates drag/play interactions and updates every visible result |
| `src/braess.ts` | Pure calculation plus derived best and break-even landmarks |
| `spec/braess.test.ts` | Exact arithmetic, bounds and individual-choice invariant |
| `spec/page.test.ts` | Scope, copy, accessibility, delivery and assignment contracts |
| `spec/browser.test.ts` | Desktop, phone, keyboard, reduced-motion and network checks |
| `src/sim/`, `src/experiment/` | Earlier scientific investigation retained as process evidence |
| `PROCESS.md`, `notes/log.md`, `reflections/` | Cited development history and reflection |

## Deployment

Expected GitHub Pages URL after a successful public deployment:
[comp4020-agentic-coding-studio.github.io/comp4020-ass1-SharmaKunal14/](https://comp4020-agentic-coding-studio.github.io/comp4020-ass1-SharmaKunal14/)

This address is inferred from the repository remote; it is not a claim that the
deployment is currently live. The Pages workflow publishes `dist/` from `main` only
after the repository is public and the check job succeeds.
