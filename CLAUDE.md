# F \& J Accessories ERP — Project Context

## Business

Manufacturing ERP for F \& J Accessories (LLDPE/LDPE/PP/Recycled Chips poly bag manufacturer, Gazipur, Bangladesh). Covers Accounting, Inventory, Purchase, Sales/Production, Payroll, LC \& Export, Reports.

## Stack

* Next.js 16 (App Router) + Supabase (Postgres + Auth) + Vercel + GitHub
* Repo: `fj-accessories-erp` under GitHub `countingxpress-netizen`
* Uses `proxy.ts` NOT `middleware.ts` (Next.js 16 requirement — renamed from middleware)
* No test framework set up yet — verify by running `npm run build` after every change
* pip/npm install notes: none special, standard npm

## Critical workflow rules

1. **ALWAYS run `npm run build` after any code change** before considering it done — dev mode doesn't catch TypeScript errors that break production builds.
2. Prefer complete file rewrites over partial diffs for complex multi-part changes — partial edits have caused repeated syntax corruption issues in this project's history (likely from manual copy-paste via Notepad on Windows).
3. User works on Windows via PowerShell + Notepad (no direct filesystem access from Claude previously — but now Claude Code has direct access, so just edit files directly).
4. Communication with the user is primarily in Bengali; use English for technical terms as needed.
5. After every meaningful change: `git add .`, `git commit -m "..."`, `git push` — Vercel auto-deploys from `main`.

## Core business formulas (DO NOT CHANGE without explicit confirmation)

### Tube/Cutting calculation (from measurement type)

* `simple`: tube = W, cutting = L
* `adhesive`: tube = L + (Flap/2), cutting = W
* `gusset`: tube = W + Gusset + Gusset, cutting = L

### Production Required Lbs (Booking form)

```
baseLbs = (Qty × TubeInInch × CuttingInInch × ProductionThickness\_mm) / 75000
finalLbs = ceil(baseLbs × 1.01)   // 1% buffer, ALWAYS round UP (Math.ceil), no fractions allowed
```

* If unit is `cm`, convert tube/cutting to inches by dividing by 2.54 first.
* If unit is `inch`, use directly (no conversion).

### Material split

* `pe\_standard`: LLDPE:LDPE = 5:1 → LLDPE = finalLbs×5/6, LDPE = finalLbs/6
* `pe\_rld`: LLDPE:RLD:LDPE = 2.5:2.5:2.5 (i.e. equal thirds)
* `pp`: 100% PP
* `custom`: user-defined % split across any raw materials, must sum to 100%

### Sales Invoice Unit Price

```
UnitPrice = (Price/Lbs × Tube(inch) × Cutting(inch) × OrderThickness\_mm) / 75000
          + PrintCharge (colors × rate\_per\_color)
          + AdhesiveCharge (widthInInch × rate\_per\_inch, only if measurement\_type = adhesive)
```

Uses `Order Thickness` (not Production Thickness or PI Thickness — there are THREE separate thickness fields on bookings: `thickness\_mm` (Order), `production\_thickness\_mm`, `pi\_thickness\_mm`).

* Unit price rounds to 2 decimals.
* Amount = `Math.floor(qty × roundedUnitPrice)` — always floor, no rounding up, no decimals in Amount.

### PI (Proforma Invoice) pricing

Uses `pi\_thickness\_mm` (separate from order/production thickness). Buyer-level pricing rules stored on `buyers` table: `pricing\_rule` (manual/percentage/rate\_per\_lbs), `percentage\_value`, `rate\_per\_lbs\_value`.

### 1 Bag = 25 Kg = 55 Lbs (conversion constant, LBS\_PER\_BAG = 55)

## Database structure notes

* `bookings` table: one row per style/measurement combo. Multiple bookings can share `booking\_group\_id` (created together via "Add Product" multi-item flow) and share the same `booking\_no`.
* `production\_orders`: one per booking. Has `blowing\_completed\_at`, `printing\_completed\_at`, `cutting\_completed\_at` timestamps and `blowing\_produced\_lbs`, `printing\_produced\_pcs`, `cutting\_produced\_pcs` quantity tracking columns.
* Booking status logic lives in `lib/bookingStatus.ts` (`getBookingStatusLabel`) — derives status from production timestamps + delivery challan data, NOT a stored status enum value for these states (the `bookings.status` column only holds `open/in\_production/partially\_delivered/completed/cancelled` — do not write stage names like "blowing" into it, this breaks Delivery Challan/Sales Invoice booking filters which query on those enum values).
* `buyers` and `garments` are separate master tables scoped under `customers` (one customer can have many buyers and many garments units).
* Document numbering: MAX-based via `lib/docNumber.ts` `generateNextDocNo()` — never count-based (breaks after deletions).

## Skills/tools available

Check for docx/pptx/xlsx/pdf skills if asked to produce those file types — not generally needed for this codebase work.

## What NOT to do

* Don't add automated tests unless asked (none exist currently, keep consistent).
* Don't introduce new state management libraries — this project uses plain React useState/useMemo throughout, keep consistent.
* Don't switch away from Tailwind utility classes to CSS modules or styled-components.
* Don't rename established formula variable names without checking all call sites (formulas are duplicated across booking form, sales invoice form, PI form, and print pages — search before renaming).

