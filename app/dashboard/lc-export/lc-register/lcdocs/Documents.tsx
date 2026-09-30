// LC ডকুমেন্ট টেমপলেট — "Documents - $ 31384.07.xlsx"-এর শীট অনুযায়ী:
// Bill-1/Bill-2, DELI, TC, COMM, PAK, BC, Mushok-6.3। সব ডেটা Master PI + ডকুমেন্ট সেট থেকে,
// ফ্রি-টেক্সট অংশ <Editable> দিয়ে প্রিন্ট পেজেই বদলানো যায়।
import { money } from "@/lib/format";
import { Editable, PrintTime } from "./Editable";
import { ApplicantBlock, ItemsTable, LcFooter, Letterhead, Signature, type Company, type DocRow } from "./DocParts";

export type DocCtx = {
  company: Company | null;
  piRefText: string;
  refText: string; // "Ref: FNJ/423/2026" — Export LC সিরিয়াল থেকে
  buyerName: string;
  buyerAddress: string;
  rows: DocRow[];
  totals: { subtotal: number; discount: number; total: number; totalPcs: number; totalDzn: number; net: number; gross: number };
  discountPct: number;
  priceDecimals: number;
  amountWords: string;
  tenor: string;
  negotiatingBank: string; // F&J-এর ব্যাংক (Master PI-র Advising Bank) — Bill-এ "PAY TO"
  openingBankName: string;
  openingBankAddr: string;
  dcLine: string;
  lcLines: string[];
  invoiceNo: string;
  invoiceDate: string;
  challanNo: string; // TR/DC NO — ডিফল্ট Ref নম্বর (FNJ/423/2026)
  deliveryDate: string;
  truckNo: string;
  // personName/Designation = ডকুমেন্ট সেট যিনি তৈরি করেছেন (app_users)
  mushok: { no: string; date: string; time: string; bin: string; applicantBin: string; personName: string; personDesignation: string };
};

function PiRef({ k, ctx }: { k: string; ctx: DocCtx }) {
  return <Editable k={`${k}.piRef`} block className="my-2 text-center text-[11px] font-bold" def={ctx.piRefText} />;
}

function BillOfExchange({ ctx, no }: { ctx: DocCtx; no: 1 | 2 }) {
  const k = `bill${no}`;
  const first = no === 1 ? "FIRST" : "SECOND";
  const other = no === 1 ? "SECOND" : "FIRST";
  const body =
    `${ctx.tenor} OF THIS ${first} BILL OF EXCHANGE (${other} IS THE SAME TENOR AND DATE BEING UN PAID) PAY TO ` +
    `${ctx.negotiatingBank} ORDER THE SUM OF ${ctx.amountWords} VALUE RECEIVED AND CHARGE THE SAME TO ACCOUNT OF ` +
    `${[ctx.buyerName, ...ctx.buyerAddress.split("\n")].map((s) => s.trim()).filter(Boolean).join(", ")}, ` +
    `DRAWN UNDER ${[ctx.openingBankName, ctx.openingBankAddr].filter(Boolean).join(", ")}`;
  return (
    <div className="text-sm">
      <Letterhead company={ctx.company} title="BILL OF EXCHANGE" docKey={k} refText={ctx.refText} refDate={ctx.invoiceDate} />
      <p className="text-center text-lg font-bold">{String(no).padStart(2, "0")}</p>
      <PiRef k={k} ctx={ctx} />
      <p className="my-4 font-bold">EXCHANGE FOR US ${money(ctx.totals.total)}</p>
      <Editable k={`${k}.body`} block className="text-justify leading-relaxed" def={body} />
      <Editable k={`${k}.dc`} block className="mt-4 font-bold" def={ctx.dcLine} />
      <Editable k={`${k}.lcLines`} block className="mt-2 font-semibold" def={ctx.lcLines.filter(Boolean).join("\n")} />
      <Signature company={ctx.company} />
    </div>
  );
}

function ChallanHeaderRight({ k, ctx }: { k: string; ctx: DocCtx }) {
  return (
    <div className="text-right text-sm font-semibold">
      <Editable k={`${k}.deliveryDate`} block def={`Delivery Date: ${ctx.deliveryDate}`} />
      <Editable k={`${k}.challanNo`} block def={`TR/DC NO: ${ctx.challanNo}`} />
      <Editable k={`${k}.dc`} block def={ctx.dcLine} />
    </div>
  );
}

function DeliveryChallan({ ctx }: { ctx: DocCtx }) {
  const k = "deli";
  return (
    <div>
      <Letterhead company={ctx.company} title="DELIVERY CHALLAN" docKey={k} />
      <div className="flex justify-between gap-4">
        <ApplicantBlock docKey={k} name={ctx.buyerName} address={ctx.buyerAddress} />
        <ChallanHeaderRight k={k} ctx={ctx} />
      </div>
      <PiRef k={k} ctx={ctx} />
      <ItemsTable rows={ctx.rows} variant="challan" totals={ctx.totals} />
      <Editable k={`${k}.freight`} block className="text-center text-sm font-bold" def="FREIGHT PREPAID" />
      <Editable k={`${k}.cert`} block className="mt-1 text-[11px]"
        def="This is certifying by applicant that applicant have received the goods in good condition and strictly as per specification of proforma invoice." />
      <LcFooter docKey={k} bankName={ctx.openingBankName} bankAddr={ctx.openingBankAddr} lines={ctx.lcLines} />
      <Signature company={ctx.company} left="Receiver's Signature" />
    </div>
  );
}

function TruckChallan({ ctx }: { ctx: DocCtx }) {
  const k = "tc";
  return (
    <div>
      <Letterhead company={ctx.company} title="TRUCK CHALLAN" docKey={k} />
      <div className="flex justify-between gap-4">
        <ApplicantBlock docKey={k} name={ctx.buyerName} address={ctx.buyerAddress} />
        <ChallanHeaderRight k={k} ctx={ctx} />
      </div>
      <PiRef k={k} ctx={ctx} />
      <ItemsTable rows={ctx.rows} variant="challan" totals={ctx.totals} />
      <Editable k={`${k}.endorse`} block className="text-[11px] font-semibold"
        def={`DRAWN OR ENDORSED TO THE ORDER OF '${[ctx.openingBankName, ctx.openingBankAddr].filter(Boolean).join(", ")}.`} />
      <Editable k={`${k}.truck`} block className="mt-2 text-sm font-bold" def={`Delivery By Truck and NO # ${ctx.truckNo}`} />
      <LcFooter docKey={k} bankName={ctx.openingBankName} bankAddr={ctx.openingBankAddr} lines={ctx.lcLines} />
      <Signature company={ctx.company} left="Receiver's Signature" />
    </div>
  );
}

function InvoiceHeaderRight({ k, ctx }: { k: string; ctx: DocCtx }) {
  return (
    <div className="text-right text-sm font-semibold">
      <Editable k={`${k}.dc`} block def={ctx.dcLine} />
    </div>
  );
}

function CommercialInvoice({ ctx }: { ctx: DocCtx }) {
  const k = "comm";
  return (
    <div>
      <Letterhead company={ctx.company} title="COMMERCIAL INVOICE" docKey={k} refText={ctx.refText} refDate={ctx.invoiceDate} />
      <div className="flex justify-between gap-4">
        <ApplicantBlock docKey={k} name={ctx.buyerName} address={ctx.buyerAddress} />
        <InvoiceHeaderRight k={k} ctx={ctx} />
      </div>
      <PiRef k={k} ctx={ctx} />
      <ItemsTable rows={ctx.rows} variant="invoice" totals={ctx.totals} discountPct={ctx.discountPct} priceDecimals={ctx.priceDecimals} />
      <p className="text-[11px] font-bold">SAY: {ctx.amountWords}</p>
      <Editable k={`${k}.cert`} block className="mt-1 text-[11px]"
        def="THIS IS CERTIFY THAT THE QUALITY, QUANTITY, OTHER PARTICULARS AND UNIT PRICE OF THE MERCHANDISE SUPPLIED ARE STRICTLY IN CONFORMITY WITH THE MENTIONED PROFORMA INVOICE. ALSO CERTIFYING MERCHANDISE TO BE OF BANGLADESH ORIGIN." />
      <LcFooter docKey={k} bankName={ctx.openingBankName} bankAddr={ctx.openingBankAddr} lines={ctx.lcLines} />
      <Signature company={ctx.company} />
    </div>
  );
}

function PackingList({ ctx }: { ctx: DocCtx }) {
  const k = "pak";
  return (
    <div>
      <Letterhead company={ctx.company} title="PACKING LIST" docKey={k} refText={ctx.refText} refDate={ctx.invoiceDate} />
      <div className="flex justify-between gap-4">
        <ApplicantBlock docKey={k} name={ctx.buyerName} address={ctx.buyerAddress} />
        <InvoiceHeaderRight k={k} ctx={ctx} />
      </div>
      <PiRef k={k} ctx={ctx} />
      <ItemsTable rows={ctx.rows} variant="packing" totals={ctx.totals} />
      <Editable k={`${k}.cert`} block className="mt-1 text-[11px]"
        def="This is certify that the quality, quantity, other particulars and unit price of the merchandise supplied are strictly in conformity with the mentioned Proforma Invoice." />
      <LcFooter docKey={k} bankName={ctx.openingBankName} bankAddr={ctx.openingBankAddr} lines={ctx.lcLines} />
      <Signature company={ctx.company} />
    </div>
  );
}

function BeneficiaryCertificate({ ctx }: { ctx: DocCtx }) {
  const k = "bc";
  return (
    <div className="text-sm">
      <Letterhead company={ctx.company} title="BENEFICIARY'S CERTIFICATE" docKey={k} refText={ctx.refText} refDate={ctx.invoiceDate} />
      <div className="mt-4 flex justify-between gap-4">
        <ApplicantBlock docKey={k} label="Applicant" name={ctx.buyerName} address={ctx.buyerAddress} />
        <div className="text-right font-semibold">
          <Editable k={`${k}.dc`} block def={ctx.dcLine} />
        </div>
      </div>
      <PiRef k={k} ctx={ctx} />
      <Editable k={`${k}.cert`} block className="my-6 text-justify leading-relaxed"
        def="We do hereby Certify to the effect that Goods supplied are strictly as per mentioned Proforma Invoice and conditions must be enclosed with original Documents. We also Certify that the Quality, Quantity, other particulars and unit price of the merchandise supplied are strictly in conformity with the mentioned Proforma Invoice." />
      <LcFooter docKey={k} bankName={ctx.openingBankName} bankAddr={ctx.openingBankAddr} lines={ctx.lcLines} />
      <Signature company={ctx.company} />
    </div>
  );
}

// মূসক-৬.৩ (কর চালানপত্র) — Excel-এ SutonnyMJ (বিজয়) ফন্টে; এখানে ইউনিকোড বাংলায়
function Mushok63({ ctx }: { ctx: DocCtx }) {
  const k = "mushok";
  const c = "border border-gray-800 px-1 py-0.5 text-center align-middle";
  const descDef = [`USD= ${money(ctx.totals.total)}`, ctx.dcLine, ctx.lcLines[0] ?? ""].filter(Boolean).join("\n");
  return (
    <div className="text-[12px]">
      <div className="text-center">
        <p>গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</p>
        <p>জাতীয় রাজস্ব বোর্ড</p>
        <p className="mt-2 text-base font-bold">কর চালানপত্র</p>
        <p>[ বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) ও দফা (চ) দ্রষ্টব্য ]</p>
        <p className="text-right font-bold">মূসক-৬.৩</p>
      </div>
      <div className="mt-3 ml-auto w-fit space-y-0.5">
        <p>নিবন্ধিত ব্যক্তির নাম : <strong>{ctx.company?.name ?? "F & J Accessories"}</strong></p>
        <p>নিবন্ধিত ব্যক্তির বিআইএন : <Editable k={`${k}.bin`} def={ctx.mushok.bin} /></p>
        <p>চালানপত্র ইস্যুর ঠিকানা : <Editable k={`${k}.addr`} def={ctx.company?.address ?? ""} /></p>
      </div>
      <div className="mt-3 flex justify-between gap-4">
        <div className="space-y-0.5">
          <p>ক্রেতার নাম : <Editable k={`${k}.buyer`} def={ctx.buyerName} /></p>
          <p>ক্রেতার বিআইএন : <Editable k={`${k}.buyerBin`} def={ctx.mushok.applicantBin} /></p>
          <p>সরবরাহের গন্তব্যস্থল : <Editable k={`${k}.dest`} def={ctx.buyerAddress.replace(/\n/g, ", ")} /></p>
          <p>যানবাহনের প্রকৃতি ও নম্বর : <Editable k={`${k}.vehicle`} def={ctx.truckNo ? `Truck, ${ctx.truckNo}` : ""} /></p>
        </div>
        <div className="space-y-0.5">
          <p>চালানপত্র নম্বর : <Editable k={`${k}.no`} def={ctx.mushok.no} /></p>
          <p>ইস্যুর তারিখ : <Editable k={`${k}.date`} def={ctx.mushok.date} /></p>
          <p>ইস্যুর সময় : {ctx.mushok.time ? <Editable k={`${k}.time`} def={ctx.mushok.time} /> : <PrintTime />}</p>
        </div>
      </div>
      <table className="mt-3 w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className={c}>ক্রমিক নং</th>
            <th className={c}>পণ্য বা সেবার বর্ণনা (প্রযোজ্য ক্ষেত্রে ব্র্যান্ড নামসহ)</th>
            <th className={c}>সরবরাহের একক</th>
            <th className={c}>পরিমাণ</th>
            <th className={c}>একক মূল্য (টাকায়)</th>
            <th className={c}>মোট মূল্য (টাকায়)</th>
            <th className={c}>সম্পূরক শুল্কের হার</th>
            <th className={c}>সম্পূরক শুল্কের পরিমাণ (টাকায়)</th>
            <th className={c}>মূল্য সংযোজন করের হার/ সুনির্দিষ্ট কর</th>
            <th className={c}>মূল্য সংযোজন কর/ সুনির্দিষ্ট কর এর পরিমাণ</th>
            <th className={c}>সকল প্রকার শুল্ক ও করসহ মূল্য</th>
          </tr>
          <tr>{Array.from({ length: 11 }, (_, i) => <th key={i} className={`${c} font-normal`}>({i + 1})</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            <td className={c}>01</td>
            <td className={`${c} text-left`}><Editable k={`${k}.desc`} block def={descDef} /></td>
            <td className={c}>Pcs</td>
            <td className={c}>{ctx.totals.totalPcs.toLocaleString("en-IN")}</td>
            {/* শূন্য হারের (zero-rated) সরবরাহ — দাম/শুল্ক/ভ্যাটের কলাম (৫–১১) জুড়ে এই লেখা */}
            <td className={c} colSpan={7}>
              <Editable k={`${k}.zeroRated`} className="text-xl font-bold" def="শূণ্য হারে পণ্য ডেলিভারী" />
            </td>
          </tr>
          <tr className="font-bold">
            <td className={c} colSpan={2}>মোট =</td>
            <td className={c}>Pcs</td>
            <td className={c}>{ctx.totals.totalPcs.toLocaleString("en-IN")}</td>
            <td className={c} colSpan={7}></td>
          </tr>
        </tbody>
      </table>
      <div className="mt-10 space-y-2">
        <p>প্রতিষ্ঠানের কর্তৃপক্ষের দায়িত্বপ্রাপ্ত ব্যক্তির নাম : <Editable k={`${k}.person`} def={ctx.mushok.personName} /></p>
        <div className="flex justify-between">
          <p>পদবী : <Editable k={`${k}.designation`} def={ctx.mushok.personDesignation} /></p>
          <p>সীল :</p>
        </div>
        <p>স্বাক্ষর :</p>
      </div>
      <p className="mt-8 text-[11px]">সকল প্রকার কর ব্যতীত মূল্য : <Editable k={`${k}.exTax`} def="" /></p>
    </div>
  );
}

export function renderDoc(key: string, ctx: DocCtx) {
  switch (key) {
    case "bill1": return <BillOfExchange ctx={ctx} no={1} />;
    case "bill2": return <BillOfExchange ctx={ctx} no={2} />;
    case "deli": return <DeliveryChallan ctx={ctx} />;
    case "tc": return <TruckChallan ctx={ctx} />;
    case "comm": return <CommercialInvoice ctx={ctx} />;
    case "pak": return <PackingList ctx={ctx} />;
    case "bc": return <BeneficiaryCertificate ctx={ctx} />;
    case "mushok": return <Mushok63 ctx={ctx} />;
    default: return null;
  }
}
