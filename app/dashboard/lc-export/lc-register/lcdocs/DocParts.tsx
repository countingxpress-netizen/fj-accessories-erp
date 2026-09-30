// LC ডকুমেন্টের কমন অংশ — "Documents - $ ....xlsx"-এর শীটগুলোর লেআউট অনুযায়ী
import { money } from "@/lib/format";
import { Editable } from "./Editable";

export type Company = { name: string; address: string | null; phone: string | null; email: string | null; logo_url: string | null };

export type DocRow = {
  id: string; sl: number; description: string; measurement: string;
  qty: number; price: number; basis: string; amount: number; net?: number; gross?: number;
};

export function Letterhead({ company, title, docKey, refText, refDate }: {
  company: Company | null; title: string; docKey: string; refText?: string; refDate?: string;
}) {
  const contact = [company?.phone ? `Contact No: - ${company.phone}` : "", company?.email ? `Email: - ${company.email}` : ""].filter(Boolean).join("      ");
  return (
    <div className="mb-3 text-center">
      <div className="flex items-center justify-center gap-3">
        {company?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt="Logo" className="h-14 w-14 object-contain" />
        )}
        <h1 className="text-3xl font-bold tracking-wide">{(company?.name ?? "F & J ACCESSORIES").toUpperCase()}</h1>
      </div>
      <p className="text-sm">{company?.address}</p>
      {contact && <p className="text-sm">{contact}</p>}
      <div className="mt-2 border-t-2 border-gray-800" />
      <p className="mt-2 text-lg font-bold underline">
        <Editable k={`${docKey}.title`} def={title} />
      </p>
      {refText !== undefined && (
        // Export LC সিরিয়াল থেকে রেফারেন্স — টাইটেলের নিচে বাঁয়ে (Mushok-6.3 বাদে সব ডকুমেন্টে)
        // তারিখ একই লাইনে ডানে
        <div className="mt-1 flex justify-between text-sm font-semibold">
          <Editable k={`${docKey}.ref`} def={refText} />
          {refDate !== undefined && <Editable k={`${docKey}.refDate`} def={refDate ? `Date: ${refDate}` : "Date:"} />}
        </div>
      )}
    </div>
  );
}

export function ApplicantBlock({ docKey, label = "APPLICANT:", name, address }: { docKey: string; label?: string; name: string; address: string }) {
  return (
    <div className="text-sm">
      <p className="font-semibold underline">{label}</p>
      <Editable k={`${docKey}.applicant`} block className="font-bold" def={name} />
      <Editable k={`${docKey}.applicantAddr`} block def={address} />
    </div>
  );
}

// একই Description পরপর কয়েক লাইনে — Excel-এর মতো merge (rowSpan)
function descSpans(rows: DocRow[]): number[] {
  const spans = new Array(rows.length).fill(0);
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && rows[j].description === rows[i].description) j++;
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

const td = "border border-gray-800 px-1.5 py-0.5";

export function ItemsTable({
  rows, variant, totals, discountPct, priceDecimals = 4,
}: {
  rows: DocRow[];
  variant: "challan" | "invoice" | "packing";
  totals: { subtotal: number; discount: number; total: number; totalPcs: number; totalDzn: number; net?: number; gross?: number };
  discountPct?: number;
  priceDecimals?: number;
}) {
  const spans = descSpans(rows);
  const extraCols = variant === "challan" ? 0 : 2;
  return (
    <table className="mb-2 w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-gray-50">
          <th className={td}>Sl No</th>
          <th className={td}>Description</th>
          <th className={td}>Measurement</th>
          <th className={td}>Qty (Pcs)</th>
          <th className={td}>Qty (DZN)</th>
          {variant === "invoice" && (<><th className={td}>Price</th><th className={td}>Total Amt</th></>)}
          {variant === "packing" && (<><th className={td}>NET WEIGHT</th><th className={td}>GROSS WEIGHT</th></>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className={`${td} text-center`}>{String(i + 1).padStart(2, "0")}</td>
            {spans[i] > 0 && (
              <td rowSpan={spans[i]} className={`${td} whitespace-pre-line text-center align-middle`}>{r.description}</td>
            )}
            <td className={`${td} text-center`}>{r.measurement}</td>
            <td className={`${td} text-center`}>{r.qty.toLocaleString("en-IN")}</td>
            <td className={`${td} text-center`}>{money(r.qty / 12)}</td>
            {variant === "invoice" && (
              <>
                <td className={`${td} text-center`}>{r.price.toFixed(priceDecimals)}{r.basis === "dzn" ? "/Dzn" : ""}</td>
                <td className={`${td} text-right`}>$ {money(r.amount)}</td>
              </>
            )}
            {variant === "packing" && (
              <>
                <td className={`${td} text-center`}>{money(r.net ?? 0)} Kgs</td>
                <td className={`${td} text-center`}>{money(r.gross ?? 0)} Kgs</td>
              </>
            )}
          </tr>
        ))}
        <tr className="font-bold">
          <td className={`${td} text-center`} colSpan={3}>Total =</td>
          <td className={`${td} text-center`}>{totals.totalPcs.toLocaleString("en-IN")}</td>
          <td className={`${td} text-center`}>{money(totals.totalDzn)}</td>
          {variant === "invoice" && (<><td className={td}></td><td className={`${td} text-right`}>$ {money(totals.subtotal)}</td></>)}
          {variant === "packing" && (<><td className={`${td} text-center`}>{money(totals.net ?? 0)} Kgs</td><td className={`${td} text-center`}>{money(totals.gross ?? 0)} Kgs</td></>)}
        </tr>
        {variant === "invoice" && totals.discount !== 0 && (
          <tr className="font-bold">
            <td className={`${td} text-right`} colSpan={5 + extraCols - 1}>(-) Discount{discountPct ? ` ${discountPct}%` : ""} =</td>
            <td className={`${td} text-right`}>$ {money(totals.discount)}</td>
          </tr>
        )}
        {variant === "invoice" && (
          <tr className="font-bold">
            <td className={`${td} text-right`} colSpan={5 + extraCols - 1}>Total =</td>
            <td className={`${td} text-right`}>$ {money(totals.total)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ইস্যুয়িং (LC Opening) ব্যাংক + LC/SC, HS Code, IRC, VAT, BIN লাইন — প্রায় সব ডকুমেন্টের নিচে
export function LcFooter({ docKey, bankName, bankAddr, lines }: { docKey: string; bankName: string; bankAddr: string; lines: string[] }) {
  return (
    <div className="mt-2 text-[11px]">
      {bankName && <Editable k={`${docKey}.bankName`} block className="font-bold" def={bankName} />}
      {bankAddr && <Editable k={`${docKey}.bankAddr`} block def={bankAddr} />}
      <Editable k={`${docKey}.lcLines`} block className="mt-1 font-semibold" def={lines.filter(Boolean).join("\n")} />
    </div>
  );
}

export function Signature({ company, left }: { company: Company | null; left?: string }) {
  return (
    <div className={`mt-14 flex text-sm ${left ? "justify-between" : "justify-end"}`}>
      {left && (
        <div className="w-48 text-center">
          <div className="border-t border-gray-600 pt-1">{left}</div>
        </div>
      )}
      {/* সিগনেচার অটো বসে না — প্রিন্টের পরে হাতে সিল ও সাইন দেওয়া হয়, তাই শুধু ফাঁকা জায়গা */}
      <div className="w-48 text-center">
        <div className="h-14" />
        <div className="border-t border-gray-600 pt-1">For {company?.name ?? "F & J Accessories"}</div>
      </div>
    </div>
  );
}
