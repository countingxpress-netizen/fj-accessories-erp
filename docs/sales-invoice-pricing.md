# Sales Invoice Pricing Rules

**F & J Accessories ERP — প্রতি পিস Unit Price ও invoice Amount কীভাবে হিসাব হয়**

- সর্বশেষ হালনাগাদ: ৬ সেপ্টেম্বর ২০২৬ — নিয়মে কয়েকটা পরিবর্তন এসেছে (নিচে "সাম্প্রতিক পরিবর্তন")
- এই ডকটা রেফারেন্স মাত্র — অ্যাপের কোডের সাথে সরাসরি যুক্ত নয়। কোড বদলালে এখানেও হাতে হালনাগাদ করতে হবে।

---

## সাম্প্রতিক পরিবর্তন (৬ সেপ্টেম্বর ২০২৬)

| # | পরিবর্তন |
|---|---|
| ১ | **Amount = `round(Qty × Unit Price)`** — আগে `floor` ছিল। `.50–.99` উপরে, `.00–.49` নিচে। পূর্ণসংখ্যা। |
| ২ | **"Other Charges" → "Adjustment"** — প্রতি পিসে ±, ঋণাত্মকও হতে পারে। Sales Invoice **ও PI (Booking mode)** — দুটোতেই। |
| ৩ | **Print rate `× 2` যখন Cutting > 29″** — এখন Sales Invoice ও Booking quote-এও (PI-তে আগে থেকেই ছিল)। |
| ৪ | **cm → inch: Cutting এখন material নির্বিশেষে** — Print থাকলে টেবিল, নাহলে ÷ 2.54। আগে PE-র Cutting সবসময় টেবিল ছিল। Sales Invoice দাম + Booking Required Lbs + PI — তিন জায়গাতেই। |

পুরনো সেভ করা invoice-এ এসব নিজে থেকে বদলায় না (unit_price সেভ করা থাকে)। শুধু Amount-এর generated column পুরনো সব row-এ `round`-এ নতুন করে হিসাব হয়েছে (বেশিরভাগ ০–১ টাকা)।

---

## এক নজরে সূত্র

```
Unit Price  =  ( Price/Lbs × TubeInch × CuttingInch × Order Thickness ) ÷ 75000
            +  Print Charge
            +  Adhesive Charge
            +  Adjustment                       // প্রতি পিসে ± (ঋণাত্মকও)
            →  round to 2 decimals

Amount        =  round( Qty × Unit Price )       // half-up: .50–.99 উপরে, .00–.49 নিচে; পূর্ণসংখ্যা
Invoice Total =  Σ (প্রতি লাইনের Amount)
```

পাইপলাইন: `Price/Lbs → Tube × Cutting → cm→inch → Base → + Surcharges → round 2 → × Qty → round → Amount`

| বিষয় | নিয়ম |
|---|---|
| Divisor | ÷ 75000 (fixed, কখনো বদলাবে না) |
| Unit Price | ২ দশমিকে round (একবার, শেষে) |
| Amount | `round` (half-up) — পূর্ণসংখ্যা |
| Quantity | সবসময় booking-এর পুরো বাকি quantity |

---

## ধাপ ০১ — Price/Lbs কোথা থেকে আসে

প্রতিটা **customer-এর নিজস্ব** Price/Lbs। booking-এর **Booking Date** ধরে সেই দিনে কার্যকর rate নেওয়া হয় — অর্থাৎ "এই তারিখ থেকে এই দাম" নিয়মে।

- Booking Date-এ কার্যকর rate = `rate_history` টেবিলে `effective_from ≤ Booking Date` এমন row-গুলোর মধ্যে সবচেয়ে নতুনটা।
- ওই তারিখে কোনো history row না থাকলে → customer master-এর `price_per_lbs` (আজকের দাম)।
- Booking Date সব history row-এর আগে পড়লে → সবচেয়ে **পুরনো জানা** rate (আজকের দাম নয় — নাহলে পুরনো booking ভুল হতো)।
- invoice ফর্মে **Price/Lbs ঘরে টাইপ করে হাতে override** করা যায়।

**এখনকার মান:** এটি এক্সেসোরিজ — 116 · নেটওয়ার্ক — 95 · হানিফ / হিটেজ জহির — 110। বাকি customer-দের master-এ Price/Lbs খালি, তাই তাদের booking-এ hand rate দিতে হয়।

---

## ধাপ ০২ — Tube ও Cutting (measurement type অনুযায়ী)

L = Length, W = Width, F = Flap, G = Gusset, P = Pillow।

| Type | Tube | Cutting | ব্যাগ |
|---|---|---|---|
| `simple` | W | L | সাধারণ |
| `adhesive` | L + F ÷ 2 | W | আঠা / self-seal |
| `flap_gusset` | L + F ÷ 2 + G | W | ফ্ল্যাপ + গাসেট |
| `pillow` | L + P | W | পিলো |
| `gusset` | W + G + G | L | গাসেট |

---

## ধাপ ০৩ — cm → inch রূপান্তর

মাপের unit **inch** হলে সরাসরি ব্যবহার হয় — কোনো রূপান্তর নয়। unit **cm** হলে material অনুযায়ী দু'রকম:

| | PE — LLDPE / LDPE / RLD / custom | PP |
|---|---|---|
| **Tube** | সবসময় ÷ 2.54 | সবসময় lookup টেবিল |
| **Cutting** | Print থাকলে টেবিল · Print না থাকলে ÷ 2.54 | Print থাকলে টেবিল · Print না থাকলে ÷ 2.54 |

**Cutting দুই material-এ এখন একই নিয়মে** (৬ সেপ্টেম্বর ২০২৬-এর পরিবর্তন)। Tube-এ কোনো বদল নেই।

lookup টেবিলটা 10–127 cm, 0.5 cm ধাপে একটা fixed তালিকা — মেশিন / ডাই সাইজের ভিত্তিতে ঠিক করা, সাধারণ ÷ 2.54 নয়। কয়েকটা নমুনা:

| cm | → inch (টেবিল) | ÷ 2.54 হলে হতো |
|---|---|---|
| 33 | 13 | 12.99 |
| 38 | 15 | 14.96 |
| 90 | 36 | 35.43 |
| 95 | 38 | 37.40 |
| 105 | 41 | 41.34 |

---

## ধাপ ০৪ — Base Unit Price

```
Base = ( Price/Lbs × TubeInch × CuttingInch × Order Thickness ) ÷ 75000
```

**Order Thickness = booking-এর `thickness_mm`** — Production Thickness (`production_thickness_mm`) বা PI Thickness (`pi_thickness_mm`) **নয়**। বুকিংয়ে তিনটা আলাদা thickness ঘর থাকে; Sales Invoice শুধু Order-টা ব্যবহার করে।

> এই একই Base অংশ Booking form, Sales Invoice, PI ও print page — সব জায়গায় ব্যবহার হয়। Divisor `75000` কখনো বদলানো যাবে না।

---

## ধাপ ০৫ — Surcharges (Base-এর সাথে যা যোগ হয়)

তিনটাই **per piece** — সরাসরি Unit Price-এর সাথে যোগ।

### Print Charge

```
print_colors × rate_per_color × (CuttingInch > 29″ ? 2 : 1)   // has_print = false হলে ০
```

`rate_per_color` booking-এ সেভ থাকে, default **0.20** (customer-এর `default_print_rate` থেকে বুকিংয়ে কপি হয়)।
**বড় ব্যাগে (Cutting > 29″) rate দ্বিগুণ** — Sales Invoice, Booking quote, PI — তিন জায়গাতেই একই।

### Adhesive Charge

```
CuttingInch × rate_per_inch          // শুধু adhesive ও flap_gusset টাইপে
```

এই দুই টাইপে Cutting = Width, তাই কার্যত `widthInInch × rate_per_inch`। `rate_per_inch` default **0.02** (হানিফ-এর 0.01)।

### Adjustment

```
Adjustment                           // প্রতি row-এ হাতে দেওয়া per-piece সংখ্যা, ঋণাত্মকও হতে পারে
```

উপরের দুটোর মতোই সরাসরি Unit Price-এ যোগ (বা বিয়োগ)। আলাদা কলামে সেভ হয় না — `sales_invoice_items.unit_price`-এর ভেতরেই ঢুকে যায়, তাই print / ledger-এ Unit Price-এ যোগফলসহ দেখায়। PI-তে (Booking mode) একই ভাবে `pi_items.price_unit`-এ ঢোকে।

---

## ধাপ ০৬ — Round ও Amount

```
Unit Price = round( Base + Print + Adhesive + Adjustment , 2 )
Amount     = round( Qty × Unit Price )
```

- Unit Price শুধু **একবার**, শেষে, ২ দশমিকে round হয়।
- Amount = **round** (half-up) — পূর্ণসংখ্যা। `.50–.99` উপরে, `.00–.49` নিচে।
- Invoice Total = সব লাইনের Amount-এর সাধারণ যোগফল।
- DB-তে `sales_invoice_items.amount` একটা generated column: `round(unit_price × quantity_pcs)`।

---

## ধাপ ০৭ — Quantity, auto-invoice ও Edit

Sales Invoice সবসময় booking-এর **পুরো বাকি quantity** নেয় — `বাকি = booking qty − আগে invoice হওয়া qty`। Partial ভাগ শুধু Delivery Challan-এ, Invoice-এ নয়।

> **Booking সেভ → auto Sales Invoice:** নতুন Booking সেভ করলে ওই booking group-এর জন্য **একটা Sales Invoice অটো তৈরি হয়** (প্রতিটা প্রোডাক্ট একটা লাইন, Unit Price = booking-এর quoted price)। Booking form-এ Cash/Credit টিক ও Booking Date ধরে invoice হয়। কোনো row-এ দাম না থাকলে booking সেভই আটকে যায়। Booking edit করলে (Print on/off, color) বা delete করলে auto-invoice + JV নিজে থেকে আপডেট/মুছে যায়। `sales_invoices.auto_generated` = true, `source_booking_group_id` দিয়ে লিংক।

> **Edit (manual invoice):** Edit ফর্মে Unit Price **আবার হিসাব হয় না** — যা সেভ ছিল তা-ই দেখায়, Qty ও Unit Price হাতে বদলানো যায়। সেভ করলে পুরনো Journal Voucher মুছে নতুন JV বসে (সবসময় `1100` Accounts Receivable, narration-এ "edited")।

---

## ধাপ ০৮ — Journal Voucher (হিসাবে পোস্ট)

| অবস্থা | Debit | Credit |
|---|---|---|
| Payment Received ✓ (Cash Sale) | `1000` · Cash in Hand | `4000` · Sales Revenue-Local |
| টিক নেই (বাকিতে বিক্রি) | `1100` · Accounts Receivable | `4000` · Sales Revenue-Local |

Debit ও Credit — দুটোই পুরো Invoice Total-এর সমান।

---

## এটি এক্সেসোরিজ / AT Accessories (customer code `AT`)

এটা একটা **আলাদা print variant মাত্র** ("Submit to Customer ভিউ")। আসল invoice, customer ledger, receivable — সব **উপরের standard formula-তেই** চলে। শুধু AT-কে **দেখানো** দামটা মার্কআপ + ফ্রেইট সহ বেশি।

```
freightPerPc      = round( ( Order Lbs ÷ Qty ) + 0.05 , 2 )
customerUnitPrice = round( আসল Unit Price × ( 1 + Markup% ÷ 100 ) , 2 ) + freightPerPc
customerAmount    = round( customerUnitPrice × Qty )
```

- **Markup%** = ওই booking-এর buyer-এর `markup_percentage` (default **2%**)।
- **0.05** = প্রতি পিস fixed freight (`AT_FREIGHT_PER_PIECE`)।
- **Commission** = (Submit-to-Customer Total − আসল Total) → Sales Invoice লিস্টে আলাদা কলামে দেখায়, PI-র সাথে মেলানোর জন্য।
- **Commission Lbs** = Order Lbs ÷ 116 → শুধু customer print-এ, কোনো হিসাবে যায় না।

### Commission (সব customer) — শুধু রিপোর্ট, কোনো JV নয়

- Customer Add/Edit ফর্মে **"কমিশন প্রযোজ্য"** টিক + **Commission %** (default 1)।
- **AT** → উপরের markup + freight নিয়ম (percentage উপেক্ষিত)।
- **অন্য commission-enabled customer** → `round(Invoice Total × Commission% / 100)`।
- প্রতি invoice-এ **`commission_adjustment` (±)** — `/dashboard/reports/commission` (খসড়া) পেজ থেকে হাতে দেওয়া যায়। **Final Commission = হিসাবি + adjustment**।
- লজিক: `lib/commission.ts` (`calcInvoiceCommission`); রিপোর্ট: `app/dashboard/reports/commission/`।

### বাকি সব customer

একই standard formula। পার্থক্য শুধু ইনপুটে — **Price/Lbs** আলাদা, আর booking-এ কপি হওয়া **rate_per_color / rate_per_inch** customer default থেকে আসে।

> **⚠️ মনে রাখুন:** `buyers` টেবিলের `pricing_rule` (manual / percentage / rate_per_lbs / rate_per_lbs_markup), `percentage_value`, `markup_percentage`, `usd_surcharge_per_pc` — এগুলো **শুধু Proforma Invoice (PI)-তে** কাজ করে। Sales Invoice এগুলো একদম দেখে না।

---

## উদাহরণ (নতুন নিয়মে)

আসল বুকিং ডেটা, কিন্তু হিসাব **নতুন নিয়মে** (print × 2, Amount round)। সিস্টেমে পুরনো নিয়মে সেভ করা মান বন্ধনীতে দেওয়া — নতুন invoice-এ নিচের মান আসবে।

### উদাহরণ ১ — BK-2026-0003 (Cutting > 29″, print দ্বিগুণ)

`simple · cm · L 90 · W 78 · Order Thickness 9.5 · PE · print 1 color @ 0.40 · Price/Lbs 116 · Qty 1,880`

| ধাপ | ফল |
|---|---|
| Tube = W = 78 → ÷ 2.54 | 30.71″ |
| Cutting = L = 90 → Print আছে → টেবিল | 36″ |
| Base = (116 × 30.71 × 36 × 9.5) ÷ 75000 | 16.2437 |
| Print charge = 1 × 0.40 **× 2** (Cutting 36 > 29) | **0.80** |
| Adhesive charge (simple → নেই) | 0 |
| **Unit Price** = 17.0437 → round 2 | **17.04** *(পুরনো: 16.64)* |
| **Amount** = round(1,880 × 17.04) | **32,035** *(পুরনো: 31,283)* |

### উদাহরণ ২ — BK-2026-0009 (adhesive, Cutting < 29″)

`adhesive · cm · L 58 · W 38 · Flap 6 · Order Thickness 7.5 · PE · print 1 color @ 0.20 · rate/inch 0.01 · Price/Lbs 116 · Qty 2,339`

| ধাপ | ফল |
|---|---|
| Tube = L + Flap ÷ 2 = 58 + 3 = 61 → ÷ 2.54 | 24.02″ |
| Cutting = W = 38 → Print আছে → টেবিল | 15″ |
| Base = (116 × 24.02 × 15 × 7.5) ÷ 75000 | 4.1787 |
| Print charge = 1 × 0.20 (Cutting 15 < 29, দ্বিগুণ নয়) | 0.20 |
| Adhesive charge = 15 × 0.01 | 0.15 |
| **Unit Price** = 4.5287 → round 2 | **4.53** (অপরিবর্তিত) |
| **Amount** = round(2,339 × 4.53) = round(10,595.67) | **10,596** *(পুরনো floor: 10,595)* |

### উদাহরণ ৩ — BK-2026-0003, AT "Submit to Customer" ভিউ

`আসল Unit Price 17.04 · আসল Amount 32,035 · Order Lbs 236 · Qty 1,880 · ধরা যাক Markup 2%`

| ধাপ | ফল |
|---|---|
| freightPerPc = round((236 ÷ 1,880) + 0.05 , 2) | 0.18 |
| customerUnitPrice = round(17.04 × 1.02 , 2) + 0.18 | 17.38 + 0.18 = 17.56 |
| **customerAmount** = round(17.56 × 1,880) | **33,013** |
| Commission (এই লাইনে) = 33,013 − 32,035 | 978 |

> Markup% এখানে 2 ধরে দেখানো — আসল মান buyer রেকর্ডের `markup_percentage` থেকে আসে। এটা শুধু customer-কে দেখানোর হিসাব; ledger-এ যায় আসল **32,035**।

---

## কোড উৎস — এই নিয়মগুলো যেখানে লেখা

| ফাইল | কী আছে |
|---|---|
| `app/dashboard/sales/invoices/new/SalesInvoiceForm.tsx` | মূল হিসাব (`getUnitPrice`, `getSurcharge`, `getLineAmount`) + Adjustment |
| `lib/calcTubeCutting.ts` | Tube/Cutting ও cm→inch (`calcTubeCutting`, `toInches`) — Cutting rule এখানেই |
| `lib/cmToInch.ts` | 10–127 cm lookup টেবিল |
| `lib/rateHistory.ts` | Booking-Date-ভিত্তিক Price/Lbs (`resolveRate`) |
| `lib/atCommission.ts` | AT Submit-to-Customer হিসাব (`calcAtCustomerLine`) |
| `app/dashboard/sales/bookings/new/BookingForm.tsx` | Booking quote — একই formula inline (print × 2, Amount round) |
| `app/dashboard/lc-export/proforma/new/ProformaForm.tsx` | PI — Adjustment (`effectivePriceUnit`), buyer pricing rules |
| `app/dashboard/sales/invoices/[id]/print-customer/page.tsx` | AT print ভিউ |
| `app/dashboard/sales/invoices/[id]/edit/EditInvoiceForm.tsx` | Edit — recalc নেই |
| `supabase/migrations/…_sales_invoice_amount_round.sql` | `amount` generated column: floor → round |
