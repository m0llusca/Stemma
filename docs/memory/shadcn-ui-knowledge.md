# Memory: shadcn/ui knowledge (agent reference)

Captured 2026-07-23 from official docs, CLI v4.14, registry, and skill pack at `~/.agents/skills/shadcn/`.

## Mental model

**shadcn/ui is not an npm component library.** It is a **code distribution platform**:

1. Components are **copied into your repo** as source you own
2. **CLI + registry schema** install and update them
3. **Semantic CSS tokens** (OKLCH) theme everything
4. Primitives come from a **base**: Base UI (default), Radix, or React Aria

Principles: **Open Code · Composition · Distribution · Beautiful Defaults · AI-Ready**

Docs: https://ui.shadcn.com/docs · llms.txt: https://ui.shadcn.com/llms.txt · GitHub: shadcn-ui/ui

## Stack

```
Your components/ui/* (owned source)
  ↑ CLI install
Registry JSON (files, deps, cssVars)
  ↑
Base: base-ui | radix | react-aria
  + Tailwind v3/v4 + semantic CSS variables
  + icon library (lucide | tabler | …)
  + cn() = clsx + tailwind-merge
  + cva (class-variance-authority) for variants
```

**`components.json`** is the project brain: `base`, `style`, aliases, Tailwind paths, `iconLibrary`, registries.

## Bases & styles

| Base | Slot API | Notes |
|------|----------|--------|
| **base** (default) | `render={<Comp />}` | Base UI — recommended for new projects |
| **radix** | `asChild` | Fully supported, not deprecated |
| **aria** | React Aria | First-class (2026) |

**Named styles:** nova, vega, maia, lyra, mira, luma, sera, rhea  
**Templates:** next, vite, start, react-router, astro, laravel  
**Presets:** named, codes (`a2r6bw`), or builder URLs from ui.shadcn.com/create  
Never decode preset codes manually — pass to CLI.

## CLI (always `npx shadcn@latest` / package runner)

```bash
init|create   # new or existing project
apply <preset>
add <items>   # --yes --overwrite --dry-run --diff --view --all
search|list   # registries; -q query; -t ui|block|…
view @shadcn/button
docs button dialog
info          # project context JSON-capable
build         # custom registry → public/r
mcp           # AI MCP server
preset decode|url|open|resolve
migrate|eject|registry
```

**Rules for agents:**
- Never invent flags; no `--package-manager`
- Never fetch GitHub raw for updates — use `add --diff` / `--dry-run`
- Never overwrite without user approval except when goal explicitly allows
- After third-party registry: fix aliases + icon library
- Ask which registry for blocks; don't assume `@shadcn`

## Theming

Colors use **OKLCH**. Tokens in `:root` / `.dark`:

`background/foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1…5`, full `sidebar-*`, `--radius` (derived sm→4xl).

Tailwind v4 maps via `@theme inline { --color-primary: var(--primary); … }`.  
Dark mode: class `.dark` (often `next-themes` + `attribute="class"`).  
Base colors: Neutral, Stone, Zinc, Mauve, Olive, Mist, Taupe.

**Customization order:** built-in variants → semantic tokens → CSS variables → edit component source (cva) → wrapper components.

## Critical composition rules

### Styling
- Semantic tokens only (`bg-primary`, `text-muted-foreground`) — not `bg-blue-500`
- `className` for **layout**, not recoloring components
- `gap-*` not `space-x/y-*`
- `size-*` when width = height
- `cn()` for conditionals
- No manual z-index on overlays
- Use `shimmer` / `scroll-fade` utilities, not custom keyframes

### Forms
```tsx
<FieldGroup>
  <Field data-invalid>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" aria-invalid />
    <FieldDescription>…</FieldDescription>
  </Field>
</FieldGroup>
```
- InputGroup → InputGroupInput/Textarea + InputGroupAddon
- 2–7 options → ToggleGroup
- Groups of checks/radios → FieldSet + FieldLegend
- Validation: `data-invalid` on Field + `aria-invalid` on control

### Structure
- Items always in Groups (SelectGroup, CommandGroup, DropdownMenuGroup, …)
- Dialog/Sheet/Drawer need Title (or `sr-only`)
- Full Card: Header/Title/Description/Content/Footer
- Loading button = Spinner + data-icon + disabled (no isLoading prop)
- TabsTrigger inside TabsList
- Avatar always has AvatarFallback
- Toast = **sonner** `toast()`
- Prefer Alert, Empty, Separator, Skeleton, Badge over custom markup

### Icons
```tsx
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>
```
No size classes on icons inside components; use project `iconLibrary`.

### Base vs Radix (must match project `base`)
| Concern | Radix | Base |
|---------|-------|------|
| Slot | `asChild` | `render={<Button />}` |
| Select | inline items | `items={[…]}` required |
| ToggleGroup | `type="single\|multiple"` | `multiple` boolean; values as arrays |
| Slider | always `number[]` | scalar OK for single thumb |
| Accordion | `type` + `collapsible` | `multiple`; defaultValue array |
| Non-button render | asChild on `<a>` | `nativeButton={false}` |

### Chat UI (new)
```
MessageScrollerProvider → MessageScroller → Viewport → Content → Item
Message → Bubble → BubbleContent
Attachment* for files; Marker for date/system
MessageScrollerButton = jump-to-latest; autoScroll built-in
```

## Component catalog (official UI ~61)

**Form:** field, form, button, button-group, input, input-group, input-otp, textarea, checkbox, radio-group, select, native-select, switch, slider, calendar, combobox, label  

**Layout/nav:** accordion, breadcrumb, navigation-menu, sidebar, tabs, separator, scroll-area, resizable, collapsible, direction  

**Overlays:** dialog, alert-dialog, sheet, drawer, popover, tooltip, hover-card, context-menu, dropdown-menu, menubar, command  

**Feedback:** alert, sonner, progress, spinner, skeleton, badge, empty  

**Display:** avatar, card, table, chart, carousel, aspect-ratio, item, kbd  

**Chat:** message-scroller, message, bubble, attachment, marker  

**Misc:** toggle, toggle-group, pagination  

Plus **blocks** (dashboard, sidebars, login/signup, chart demos), fonts, themes, examples.

## Selection cheatsheet

| Need | Use |
|------|-----|
| Action | Button |
| Form layout | Field* |
| Searchable select | Combobox |
| Confirm destroy | AlertDialog |
| Side panel | Sheet |
| Mobile sheet | Drawer |
| Toast | sonner |
| Command palette | Command in Dialog |
| Charts | Chart (Recharts) |
| Empty | Empty |
| Chat | MessageScroller + Message + Bubble + Attachment + Marker |

## Registries

Addresses: `button` (official), `@acme/item` (namespace), `owner/repo/item` (GitHub), URL, local JSON.  
Build: `npx shadcn@latest build`.  
Community index: `https://ui.shadcn.com/r/registries.json`  
MCP tools: list/search/view registries, examples, add command, audit checklist.

## Forms ecosystem

React Hook Form, TanStack Form, Formisch, Next.js Server Actions — compose on Field primitives.

## Platform pieces (2026)

- **shadcn/typeset** — markdown/HTML typography class for blog/docs/chat
- **@shadcn/helpers** — deterministic AI chat mocks (AI SDK / TanStack AI)
- **React Aria base** — third first-class primitive set
- **Migrate skill** — progressive Base UI migration

## Skill pack location

`~/.agents/skills/shadcn/` (symlink from `~/.claude/skills/shadcn`):

- `SKILL.md` — workflow, critical rules
- `cli.md`, `customization.md`, `registry.md`, `mcp.md`
- `rules/`: forms, composition, styling, icons, base-vs-radix, chat

## qc_app specifics (as of rewrite)

- Project: `apps/web`, base **base**, style **base-nova**, lucide
- Import UI: `@/components/ui/*`
- Utils: `@/lib/utils` → `cn()`
- Toast: `useToast()` from `@/components/ui/toast` → sonner
- Admin modals: `AdminDialog` → shadcn Dialog (not native dialog)
- Server forms: prefer NativeSelect when FormData `name` required
- Do not re-import legacy `src/app/styles/components/*` into layout

See also: `docs/memory/2026-07-23-shadcn-ui-full-rewrite.md`
