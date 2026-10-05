# UI guidelines (web/pension-web)

Every screen must look and behave the same way. Copy the patterns below. Read `web/pension-web/README.md` for the technical rules (BFF, validators, i18n).

**Reference implementation:** the web app ships only the shell, Profile and an empty Dashboard. The first screens built ([phases/PHASE_0B_ADMIN_SCREENS.md](phases/PHASE_0B_ADMIN_SCREENS.md), Centers first) become the reference: once Centers is merged, do what that page does. Until then, [profile/page.tsx](../web/pension-web/src/app/dashboard/profile/page.tsx) shows the page header, cards and loading state.

## 1. Page types

| Type | Pattern | Example (Phase 0b) |
|---|---|---|
| **List** | `PageHeader` (title, description, primary action on the right), then a filter row (search input + `FilterCombobox`es), then `ServerDataTable` driven by `useServerTable(gw(svc, path), filters, { search, sortMap })`. Row actions in a `DropdownMenu` at the end of the row. | Centers, Users |
| **Detail** | `PageHeader` with a status `ToneBadge`; `Card`s per section; actions in a bar at the top right, each gated by its permission and by `allowed_actions` when the API returns them | Roles detail |
| **Form** | A Dialog for up to about 8 fields; a full page with sections for more. react-hook-form + `zodResolver` + shared validators. Save on submit; disable the button while saving. | Center form, User form |
| **Import** | `BulkUploadSheet` (template download, upload, grid, server row errors, Confirm and Cancel) | Center import |
| **Print** | Its own route under the item, no app chrome, `@media print` CSS, A4 | PPO print (Phase 4) |

## 2. States

| State | What to show |
|---|---|
| Loading a list | Skeleton rows (ServerDataTable does it) |
| Loading a detail | `Skeleton` blocks in the card layout, never a blank page |
| Empty list | A one-line message saying why it is empty and what to do ("No beneficiaries yet. Import a SOCH file.") |
| Error | `useApiErrorText(error)` maps the error `code` to a friendly message (add every new `E_*` code to both message files); show the `request_id` in small text for support |
| Service down | `ServiceDown` component |
| Forbidden | `NavAccessGuard` handles pages; hide buttons with `useSession().can(P.X)` |
| Saved | A toast after the action. For a toast after navigation, use `useMountToast`; a toast fired during the first render is dropped. |

## 3. Status colours (`ToneBadge`)

| Tone | Use for |
|---|---|
| `neutral` | DRAFT, inactive, placeholder |
| `info` | PENDING_SIGNOFF, SUBMITTED, UNDER_VERIFICATION, RECOMMENDED |
| `warning` | RETURNED, MISSED, LFU, payment review, locked account |
| `success` | APPROVED, PPO_GENERATED, PAID, ON_ART, active |
| `danger` | REJECTED, FAILED, DIED, import errors |
| `dark` | REVERSED, IGNORED |

Keep one mapping per enum in `src/lib/status-tones.ts` (create it in Phase 1) and use it everywhere.

## 4. Personal data on screen

- **Show what the API sends.** Lists get masked values; never "unmask" on the client.
- **Reveal buttons.** Behind `BENEFICIARY_PII_UNMASK` only. The revealed value stays for 30 seconds, then hides again. Never copy it to the clipboard automatically. Never keep it in react-query cache: use component state.
- **SOCH data:** a grey card with a lock icon and "From SOCH, cannot be edited". Never render it as disabled inputs; it is not a form.
- **Print and PDF:** account numbers masked unless the department's PPO format requires otherwise (Q-05).
- **URLs, titles, tooltips:** never show a name, UID, Aadhaar or PPO in a URL, a document title or a tooltip that other people could see over a shoulder.

## 5. Forms

- Labels: Title Case, acronyms kept (UID, ART, PPO, IFSC, OTP, User ID), `required` marker through `<FormLabel required>`.
- Order fields as the SRD lists them (FIELD_DICTIONARY.md §1), grouped into sections: Identity, Bank, Consent, Remarks.
- Errors appear under the field (`<FormMessage />`, translated by rule id). A server `E_VALIDATION` maps back to fields with `fieldErrors(err)`. `E_INCOMPLETE` lists the missing fields: focus the first one.
- Free text has a visible character counter when the limit is 300 or more (V-013, V-014, V-015).
- A reason dialog (Return, Reject, Correct) is always a separate dialog with a `Textarea` validated by `reason` (V-015).
- Destructive or irreversible actions use `useConfirm()` with a sentence that names what happens ("Reject this application? It cannot be reopened.").

## 6. Text

- Every string comes from `src/messages/en.json` AND `hi.json`.
- Key naming: `<page>.<area>.<item>`, e.g. `applications.form.bankName`, `applications.actions.submit`, `errors.E_STALE`.
- No em dashes and no "--" in any text (R-WEB-4). `scripts/check-rules.mjs` fails on them.
- Dates are shown as `DD MMM YYYY` (e.g. 05 Feb 2026) with `Intl.DateTimeFormat` in the active locale. Amounts use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

## 7. Accessibility

- Every input has a label.
- Every icon-only button has an `aria-label` (from messages).
- Dialogs trap focus (radix does it).
- Status is never shown by colour alone: the badge always has text.
- Keyboard: every action is reachable with Tab and Enter.
- Tables have a caption or an `aria-label`.

## 8. Shell, sidebar and icons

- **The shell is Chikitsa-Raj's.** `components/dashboard/dashboard-shell.tsx` (inset sidebar, sticky header, one scrolling pane), `app-sidebar.tsx` (brand plate, nav, account menu in the footer), `dashboard-header.tsx` (Home + current page on phones, the full trail on large screens). Do not restyle them per page; a page only renders its content.
- **Sidebar header:** the RSACS lockup on a white plate (`AidsLockup`), the ribbon alone when the rail is collapsed. Swap the artwork in `components/brand.tsx` only (Q-23).
- **Nav items** come from `config/nav.ts`: a leaf (`href`) or a collapsible group (`items`). Users can drag rows to reorder them; the order is kept in the `hp_nav_order` preference cookie, never in browser storage.
- **Account actions** (Profile, Switch Assignment, Sign Out) live in the sidebar footer menu. The header keeps Switch Assignment (sm and up), text size, language and theme.
- **Icons:** tabler, the `*Filled` variant wherever one exists (`IconLayoutDashboardFilled`, `IconUserFilled`, `IconHomeFilled`, `IconKeyFilled`, `IconLockFilled`, `IconExchangeFilled`, `IconSunFilled`, ...). For round marks use the circle variants: `IconCircleCheckFilled` for the selected item in every select, combobox and menu; `IconCircleArrowLeftFilled` for back links. Arrows and chevrons that show direction (dropdown chevrons, breadcrumb separators) stay outline, as do icons with no filled variant (`IconLogout`, `IconLanguage`, `IconTextSize`).
