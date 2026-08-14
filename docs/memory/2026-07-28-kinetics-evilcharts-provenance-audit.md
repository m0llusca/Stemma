# Kinetics и EvilCharts: provenance-аудит

Дата получения: 2026-07-28

Назначение: воспроизводимый реестр материалов, прочитанных перед
`2026-07-28-kinetics-evilcharts-ui-hardening-design.md`.

## Kinetics

Источники:

- https://kinetics.colorion.co/
- https://github.com/ckissi/kinetics

Сайт перечисляет 135 motion patterns. Репозиторий не имеет package/release
surface и не содержит `LICENSE`; GitHub license API возвращал `null` на дату
аудита. Поэтому исходный код Kinetics не копируется. Ниже фиксируется
классификация идей; `accept` означает независимую реализацию аналога внутри
существующего shadcn-компонента.

### Accept: 21

Interaction:

- Push Button
- Copy Button
- Choice Chips
- Password Meter
- Squish Button
- Toggle Pills
- Swatch Picker

Feedback/state:

- Underline Draw
- Elastic Progress
- Switch Spring
- Checkbox Draw
- Status Pill
- Success Check
- Step Progress
- Undo Snackbar
- Submit States
- Skeleton to Content
- State Diff
- Optimistic Rollback
- Activity Ledger

Surface:

- Hover Lift

### Conditional: 35

Допускаются только при конкретной продуктовой потребности, keyboard/touch parity,
reduced-motion поведении и focused tests.

Interaction:

- Card Resize
- Number Counter
- Toast Overshoot
- Tab Pill Glide
- Accordion Spring
- Star Rating
- Floating Label
- Quantity Stepper
- PIN Input
- Reorderable List
- Expanding Search
- Tag Input
- Snap Rail
- Command Palette Bloom

Feedback/state:

- Stagger Entrance
- Icon Morph Swap
- Delayed Tooltip
- Odometer Count-up
- Pulse Badge — вариант 1
- Pulse Badge — вариант 2
- Segment Loader
- Orbit Spinner
- Progress Ring
- Notification Slide-in
- Countdown Ring
- Toast Stack
- Indeterminate Bar
- Signal Bars
- Badge Counter
- Presence Stack
- Confidence Settle
- Reconciliation Merge

Surface:

- Error Shake
- Clip Wipe
- Before / After

### Banned: 79

Interaction:

- Magnetic Button
- Drag to Dismiss
- Ripple Feedback
- Hold to Confirm
- Rubber-band Slider
- Like Burst
- Cursor Trail
- Pointer Tooltip
- Swipe to Reveal
- Rotary Knob
- Value Scrubber
- Speed-Dial FAB
- Slide to Unlock
- Keycap Press
- Orbital Action Menu
- Contextual Dock
- Inertial Dial
- Elastic Lasso
- Hover Intent Gate
- Gesture Chord
- Liquid Glass Press
- Bento Expand
- Kinetic XY Pad
- Momentum Picker

Feedback/state:

- Scramble Reveal
- Momentum Marquee
- Typewriter
- Shimmer Skeleton
- Typing Indicator
- Heartbeat Monitor
- Battery Charge
- Bookmark Toggle
- Packet Trace
- Phase Lock
- Checksum Bloom
- Echo Receipt
- Signal Braille
- Token Stream

Surface:

- Confetti Burst
- Parallax Tilt
- Wave Loader
- Skeleton Sweep
- Page Peel
- Cursor Spotlight
- Flip Card
- Glitch Text
- Border Beam
- Aurora Drift
- Shine Sweep
- Breathing Orb
- Float Bob
- Liquid Blob
- Gradient Shimmer Text
- Neon Glow Pulse
- Equalizer Bars
- Radar Pulse
- Newton’s Cradle
- Bouncing Ball
- Marquee Reveal
- Gradient Border Morph
- Text Split Reveal
- Sheen Sweep
- 3D Cube Rotate
- Jelly Wobble
- Folding Doors
- Depth Stack
- Text Wave
- Caustic Glass
- Chromatic Split
- Warp Grid
- Moiré Lens
- Polarized Foil
- Metaball Bridge
- Variable Weight
- Specular Orbit
- Noise Dissolve
- Dither Bloom
- Ferrofluid Crown
- Lenticular Shift

## EvilCharts

Источники:

- https://evilcharts.com/docs
- https://evilcharts.com/llms.txt
- https://evilcharts.com/llms-full.txt
- https://evilcharts.com/skill.md
- https://evilcharts.com/mcp
- https://github.com/legions-developer/evilcharts
- https://github.com/legions-developer/evilcharts/blob/main/LICENSE

Аудированный upstream commit:
`1d1c03151ebaccf1e547d1f06da65f8f38c46b82`.

### Прочитанные страницы документации: 39

Core:

- https://evilcharts.com/docs
- https://evilcharts.com/docs/chart-config
- https://evilcharts.com/docs/recharts/installation
- https://evilcharts.com/docs/recharts/components
- https://evilcharts.com/docs/echarts/installation
- https://evilcharts.com/docs/echarts/components

Recharts:

- https://evilcharts.com/docs/recharts/area-chart/static
- https://evilcharts.com/docs/recharts/bar-chart/static
- https://evilcharts.com/docs/recharts/bar-chart/blocks
- https://evilcharts.com/docs/recharts/composed-chart/static
- https://evilcharts.com/docs/recharts/line-chart/static
- https://evilcharts.com/docs/recharts/pie-chart/static
- https://evilcharts.com/docs/recharts/radar-chart/static
- https://evilcharts.com/docs/recharts/radial-chart/static
- https://evilcharts.com/docs/recharts/sankey-chart/static
- https://evilcharts.com/docs/recharts/ui/background
- https://evilcharts.com/docs/recharts/ui/brush
- https://evilcharts.com/docs/recharts/ui/dots
- https://evilcharts.com/docs/recharts/ui/legend
- https://evilcharts.com/docs/recharts/ui/tooltip

ECharts:

- https://evilcharts.com/docs/echarts/area-chart/static
- https://evilcharts.com/docs/echarts/area-chart/blocks
- https://evilcharts.com/docs/echarts/bar-chart/static
- https://evilcharts.com/docs/echarts/bar-chart/blocks
- https://evilcharts.com/docs/echarts/composed-chart/static
- https://evilcharts.com/docs/echarts/line-chart/static
- https://evilcharts.com/docs/echarts/line-chart/blocks
- https://evilcharts.com/docs/echarts/pie-chart/static
- https://evilcharts.com/docs/echarts/pie-chart/blocks
- https://evilcharts.com/docs/echarts/radar-chart/static
- https://evilcharts.com/docs/echarts/radial-chart/static
- https://evilcharts.com/docs/echarts/radial-chart/blocks
- https://evilcharts.com/docs/echarts/sankey-chart/static
- https://evilcharts.com/docs/echarts/sankey-chart/blocks
- https://evilcharts.com/docs/echarts/ui/brush
- https://evilcharts.com/docs/echarts/ui/dots
- https://evilcharts.com/docs/echarts/ui/legend
- https://evilcharts.com/docs/echarts/ui/tooltip

### Registry SHA-256 на 2026-07-28

Registry JSON является mutable. Хеши служат только provenance текущего аудита,
а не разрешением на установку:

| Registry item | SHA-256 |
| --- | --- |
| recharts-area-chart | `d98ff63ea49e63f6d496896bfb670cd0d24f141bb934d67bbb0beb9b6ce61e3f` |
| recharts-bar-chart | `1cab6e3c55d9c84e2112138695c1cd7532b37dfadf970e6186633362481b370d` |
| recharts-composed-chart | `527dc0c861aca1965eb7d747e68e62b32f8f9d61f65454b9daa5277cf5d65ebe` |
| recharts-line-chart | `ad4a8203f6f05e476ccc221c10a2d75887fcf7dd68f9b84f4d9134ec760d3309` |
| recharts-pie-chart | `a4dd6033ceab938a872e2c9851d0b2a68a5f7c1e85bed535c709575a79cb663f` |
| recharts-radar-chart | `19bf979f27ee90c04e15fe41ae0ee2537fc73a61b613030c2ab42908b6dbe4a9` |
| recharts-radial-chart | `4300746b0154b5ed2a98c74e851292836c2b8039715359d67845a823e15567d4` |
| recharts-sankey-chart | `1546b6d6d271691d0d19f363063164f09a0ba461d6d2bd0d02c6cfab9d1f5873` |
| echarts-area-chart | `440839b48e8bd7a68738796cf8e15dab4e7dc98f56be4c0919fe26bbb99baa42` |
| echarts-bar-chart | `b1f92b196b23e7deabb944f8d57ed754f6d0b940b843ce7e8b2fd563be48b140` |
| echarts-composed-chart | `ae14d753166a18fb3ccd910b0b8c3923b6eb600f138ba4c9a698551cbe021f51` |
| echarts-line-chart | `1530576dea90515e6550ed0ad14909d7e34bb2810acffbe37418bf3f243da3db` |
| echarts-pie-chart | `3b976faa14452edb8334e6bfe7819bb10fbe916c8da0763966b38a98327fa381` |
| echarts-radar-chart | `b4d5aa4f24c4651d37d0723dca53123fb8394c841f10d01bbc358f32f395ad3f` |
| echarts-radial-chart | `cb93665b96d163db8a256475d3df2ea891268945e7684aeb36d7524e908b5130` |
| echarts-sankey-chart | `78bf92d0f7213fd477b2215252e673c09c0f9bb0f62d34eb68aab85559b5a79c` |

### Решение по внедрению

- Default: app-owned shadcn `ChartContainer` + direct Recharts.
- Accepted ideas: compound composition, scoped semantic chart variables,
  target/reference lines, consistent tooltip/legend, Graph/Table parity.
- Rejected by default: copying registry components, `motion`, ECharts, Brush,
  random loading data, upstream legend controls.
- If source is ever copied, the exact registry/source hashes, upstream commit,
  local deviations and MIT notice become обязательной частью
  `THIRD_PARTY_NOTICES.md` и code review.
