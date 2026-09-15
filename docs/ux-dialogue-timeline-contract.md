# UX-контракт: таймлайн диалога

Locked. Tip **`dd49657`** (squash [#155](https://github.com/m0llusca/Stemma/pull/155) / [#154](https://github.com/m0llusca/Stemma/issues/154)). Evidence slots: tip **`429a2d0`** ([#156](https://github.com/m0llusca/Stemma/pull/156)). Evidence focus: tip **`c8cea9e`** ([#159](https://github.com/m0llusca/Stemma/pull/159)).

Спека Marques: [comment](https://github.com/m0llusca/Stemma/issues/154#issuecomment-5680463591) + уточнение SYSTEM / живой evidence. Макет Романа — в [#154](https://github.com/m0llusca/Stemma/issues/154).

Менять выравнивание, кто получает «В доказательство», или вид внутренней заметки — только явным продуктовым решением. Тихий дрейф запрещён.

Поверхность: `/reviews/[conversationId]`, `ConversationTimeline`.

## Чат (клиент / оператор / ИИ)

Плотность мессенджера: воздух между репликами, не карточки аудит-лога.

| Элемент | Контракт | Код на `dd49657` |
| --- | --- | --- |
| Выравнивание | Клиент **слева** (`data-lane=customer`, `align=start`). Оператор и ИИ **справа** (`data-lane=agent`, `align=end`) | `isAgentParty` = `HUMAN_AGENT` \| `AI_AGENT` |
| Шапка | Имя + бейдж роли **над** пузырём. У оператора шапка зеркально справа | `participantLabels`: Клиент / Оператор / ИИ |
| Пузырь | Клиент `muted`, оператор `tinted`, ИИ `outline` + третий тон (`--ai-*`) | `bubbleVariantFor` |
| Бейдж ИИ | Chip **«ИИ»** в шапке и внутри пузыря | `Chip tone="ai"` |
| Аватар | Инициалы **рядом с пузырём**, снаружи у края потока (слева у клиента, справа у оператора). Не под временем / не «подвал лога» | свой `ChatAvatar` в `conversation-message-row`, не `MessageAvatar` с `-translate-y` |
| Под пузырём | Время **`ДД.ММ, ЧЧ:ММ`** + outline **«В доказательство»**. У оператора мета справа | `formatTimestamp` + `TimelineMeta` |
| Шапка блока | **Таймлайн диалога** + `N сообщений` / `сообщения` / `сообщение` | `formatMessageCount` |

Сохранить: coaching pins, выбор evidence, Enter/клик на модулях оценки.

## Внутренние заметки (`isPrivate`) и коучинг

Одна хронология. Не отдельная вкладка.

| Правило | Контракт |
| --- | --- |
| Лейаут | На всю ширину, по центру (`data-lane=private`, `data-align=center`). Не L/R чат |
| Вид | Dashed amber, замок, Chip **«Внутренняя заметка»**. `data-variant=plain` — не пузырь клиента/оператора |
| Мета | Автор + время. **«В доказательство» нет** (`canAttachEvidence` = false) |
| Коучинг-пин | Та же лента, полоска с Chip **«Коучинг»**. Не маскировать под реплику диалога |
| Права | Если роль не должна видеть заметку или пин — пункта нет. Пустого «скрыто» / плейсхолдера-загадки нет. Пины: `canSeeCoachingPins ? pins : []` |

`isPrivate` важнее партии: приватный `HUMAN_AGENT` — полоска, не правый пузырь.

## SYSTEM

Маркер по центру (`data-lane=system`): имя + бейдж **«Система»**, `plain`, не пузырь.

**«В доказательство» нет** — как у внутренней заметки.

## Evidence gate (LIVE)

Кнопка на клиенте / операторе / ИИ (не private, не SYSTEM) должна **реально** привязать доказательство.

Живой гейт — блок **«Доказательства»** и чип **«N доказ.»**, не шапка критериев `{answered} / {scored}` (это заполненные оценки, часто `0/16`).

Клик пишет в React draft (`EvidenceDraftProvider.attachMessage` → `evidenceMessageId`). Не select-only.

| Должно измениться сразу | Не гейт |
| --- | --- |
| «Доказательства» `0 → N` | Прогресс критериев `N / 16` |
| Чип группы **«N доказ.»** | |
| Подсветка реплики в таймлайне (`data-live-evidence` / highlight) | |
| Controlled `criterion.*.evidenceMessageId` заполняется | |

«Сохранить черновик» забирает то же значение (`data-review-evidence-dirty`). Реплика подсвечивается до сейва.

### Полные слоты (`429a2d0` / [#156](https://github.com/m0llusca/Stemma/pull/156))

Когда **все** слоты `evidenceMessageId` уже заполнены:

| Фокус на поле доказательства | Контракт |
| --- | --- |
| Нет | «В доказательство» **не** перетирает ни один слот (включая первый). Info-toast / hint. Count, чип «N доказ.», dirty — без изменений |
| Есть | Пишет **только** в этот слот. Намеренная замена |

Hint: «У всех критериев уже есть доказательство. Выберите поле в оценке, чтобы заменить его.» Код: `resolveEvidenceAttachTarget` — фокус, иначе первый пустой, иначе `null`. Никогда первый заполненный.

Приёмка no-focus: слоты заполнять только кнопками «В доказательство». Не табать и не кликать select вручную.

Blur селекта доказательства **сбрасывает** `focusedCriterionId` (`c8cea9e` / [#159](https://github.com/m0llusca/Stemma/pull/159)) и DOM-fallback `activeSelectRef`. Полные слоты без фокуса → info-toast / no-op, тихой подмены нет. «Есть» в таблице — живой фокус; тот же клик «В доказательство», что снял select, ещё пишет в этот слот (`setTimeout(0)`).

## Хвосты #155 (тот же пакет)

- **Exact-filters:** Sheet не автооткрывается. После закрытия размонтируется — overlay не крадёт клики очереди.
- **QA dual-home:** `canLandOnDashboard` только Admin / Lead / Exec. Typed `/dashboard` у QA → inbox (`qaAssignee` + `due=overdue`). QA остаётся в `DASHBOARD_ROLES` ради «Проверки». Агент → `/self-review`.

## Не в пакете #155

Хвосты e2e из тела PR — не закрыты кодом #155. SoT: [e2e-verify-database.md](e2e-verify-database.md).

- Moscow 22nd / UTC 21st (~21:00–00:00Z) — рассинхрон seed (MSK) и заголовков отчётов (UTC)
- Независимая идентичность verify-DB allowlist (`TEST_DATABASE_URL` vs `DATABASE_URL`)

## Ownership

| Concern | Модуль |
| --- | --- |
| Лейаут / партии / заметки | `apps/web/src/components/review/conversation-timeline.tsx` |
| Кнопка evidence | `evidence-message-button.tsx` |
| Draft store | `evidence-draft.tsx` |
| Счётчик / чип / flash | `evidence-live-count.tsx`, `evidence-picker-listener.tsx` |
| Workbench wrap | `apps/web/src/app/reviews/[conversationId]/page.tsx` |
| QA `/dashboard` | `apps/web/src/lib/auth/role-home.ts` `canLandOnDashboard` |
| Exact-filters | `queue-advanced-filters.tsx` |
| Тесты | `conversation-timeline.test.tsx`, evidence draft / review-panel |

Related: [app-shell.md](app-shell.md), [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md), [hardening-screen-matrix.md](hardening-screen-matrix.md).
