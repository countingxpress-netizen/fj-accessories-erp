"use client";
// LC ডকুমেন্ট প্রিন্ট পেজে ফ্রি-টেক্সট অংশ সরাসরি ক্লিক করে এডিট — বদলানো টেক্সট
// lc_document_sets.overrides-এ { "<doc>.<field>": text } হিসেবে সেভ হয়। ডিফল্টে ফেরালে
// (বা পুরো মুছে দিলে) override মুছে যায়, আবার অটো টেক্সট আসে।
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Ctx = { overrides: Record<string, string>; save: (k: string, v: string | null) => void; editable: boolean };
const OverridesContext = createContext<Ctx>({ overrides: {}, save: () => {}, editable: false });

export function OverridesProvider({ setId, initial, children }: { setId: string | null; initial: Record<string, string>; children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, string>>(initial ?? {});
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const latest = useRef(overrides);

  async function save(k: string, v: string | null) {
    if (!setId) return;
    const next = { ...latest.current };
    if (v == null) delete next[k]; else next[k] = v;
    latest.current = next;
    setOverrides(next);
    setStatus("saving");
    const { error } = await createClient().from("lc_document_sets").update({ overrides: next }).eq("id", setId);
    setStatus(error ? "error" : "saved");
  }

  return (
    <OverridesContext.Provider value={{ overrides, save, editable: !!setId }}>
      {setId && status && (
        <div className="print:hidden fixed bottom-4 right-4 z-40 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow">
          {status === "saving" ? "সেভ হচ্ছে..." : status === "saved" ? "✓ সেভ হয়েছে" : "⚠ সেভ ব্যর্থ"}
        </div>
      )}
      {children}
    </OverridesContext.Provider>
  );
}

// প্রিন্টের মুহূর্তের সময় (Mushok-6.3 "ইস্যুর সময়") — পেজ খুললে বর্তমান সময়, আর Print
// চাপলে (beforeprint) আবার আপডেট হয়; তাই কাগজে ঠিক প্রিন্টের সময়টাই ছাপা হয়
export function PrintTime({ className = "" }: { className?: string }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const now = () => setTime(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    now();
    window.addEventListener("beforeprint", now);
    const t = window.setInterval(now, 30_000);
    return () => { window.removeEventListener("beforeprint", now); window.clearInterval(t); };
  }, []);
  return <span className={className}>{time}</span>;
}

export function Editable({ k, def, className = "", block = false }: { k: string; def: string; className?: string; block?: boolean }) {
  const { overrides, save, editable } = useContext(OverridesContext);
  const overridden = Object.prototype.hasOwnProperty.call(overrides, k);
  const value = overridden ? overrides[k] : def;
  const Tag = block ? "div" : "span";

  if (!editable) return <Tag className={`whitespace-pre-line ${className}`}>{value}</Tag>;

  return (
    <Tag className={`group relative ${block ? "block" : "inline"}`}>
      <Tag
        // key বদলালে DOM আবার বসে — reset/সেভের পর contentEditable-এর টেক্সট React state-এর সাথে মেলে
        key={`${k}:${value}`}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          // শেষের স্পেস/নিউলাইন বাদ দিয়ে তুলনা — নইলে শুধু ক্লিক করে বেরোলেও (যেমন "TR/DC NO: " → "TR/DC NO:")
          // অকারণে override সেভ হয়ে যায় আর পরে অটো টেক্সট বদলালেও আটকে থাকে
          const norm = (t: string) => t.replace(/ /g, " ").replace(/\s+$/, "");
          const text = norm((e.currentTarget as HTMLElement).innerText);
          if (text === norm(value)) return;
          save(k, text.trim() === "" || text === norm(def) ? null : text);
        }}
        className={`whitespace-pre-line rounded-sm outline-none hover:bg-yellow-50 focus:bg-yellow-50 focus:ring-1 focus:ring-yellow-400 print:bg-transparent print:ring-0 ${overridden ? "bg-yellow-50/60" : ""} ${!value ? "inline-block min-h-[1em] min-w-[3rem] border-b border-dashed border-gray-300 print:border-0" : ""} ${className}`}
      >
        {value}
      </Tag>
      {overridden && (
        <button
          type="button"
          title="অটো টেক্সটে ফেরান"
          onClick={() => save(k, null)}
          className="print:hidden absolute -right-5 top-0 hidden rounded bg-gray-200 px-1 text-[10px] text-gray-700 group-hover:inline"
        >
          ↺
        </button>
      )}
    </Tag>
  );
}
