<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37777
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is SQLite via Prisma at `apps/web/prisma/dev.db`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
