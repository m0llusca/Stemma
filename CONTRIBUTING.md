# Contributing

Thanks for interest in Stemma.

## Development setup

Follow the [Quick start](README.md#quick-start) in the README.

Before opening a PR:

```bash
cd apps/web
npm run typecheck
npm test
```

For UI or DB-touching changes, also run the relevant Playwright / integration suites when practical.

## Guidelines

- Prefer small, focused PRs with a clear problem statement.
- Match existing TypeScript / React / Prisma patterns in `apps/web`.
- Product UI uses **shadcn/ui** primitives (`@/components/ui/*`); do not reintroduce legacy BEM dialogs.
- Do not add speculative abstractions or compatibility shims — replace obsolete paths instead.
- Do not commit secrets, local dumps (`graphify-out/`, `coiaf-rebuild/`), or binary research artifacts.
- Live-smoke and certification evidence changes must stay fail-closed (explicit env gates).

## Commit messages

Use short imperative subjects that explain **why**, for example:

- `Add YDB IAM/SA auth and fix OTRS live route overrides.`
- `Harden enterprise readiness: probes, honest cert gates, quota messaging.`

## License

By contributing, you agree that your contributions are licensed under the MIT License.
