// buildPdfFilename কে Server Component-এ (print page-গুলোতে) সরাসরি কল করা হয়, তাই এই
// ফাইলে "use client" রাখা যাবে না — সেটা থাকলে Next.js পুরো মডিউলটাকে ক্লায়েন্ট-অনলি বানিয়ে
// দেয় এবং সার্ভার সাইড থেকে ফাংশন কল করলে রেন্ডার এরর দেয়। saveElementAsPdf-এ window/document
// ব্যবহার আছে কিন্তু সেটা শুধু ফাংশন বডির ভেতরে, তাই সেটা এমনিতেই শুধু ক্লায়েন্ট কম্পোনেন্ট থেকে
// (PrintButton/ChallanPrintButton — যাদের নিজস্ব "use client" আছে) কল হলে সমস্যা হয় না।

// Document No + Buyer + Merchant দিয়ে PDF ফাইলনেম বানানো
export function buildPdfFilename(parts: (string | null | undefined)[]): string {
  const clean = parts
    .map((p) => (p ?? "").toString().trim())
    .filter((p) => p.length > 0)
    .join(" - ");
  return clean.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

// নির্দিষ্ট এলিমেন্ট (id দিয়ে) ক্যানভাসে রেন্ডার করে সরাসরি PDF হিসেবে সেভ করে —
// ব্রাউজারের প্রিন্ট ডায়ালগ ছাড়াই। Chrome/Edge-এ showSaveFilePicker দিয়ে আসল
// "কোথায় সেভ করবেন" ফোল্ডার-পিকার আসে; না থাকলে সাধারণ ডাউনলোড হয়ে যায়।
export async function saveElementAsPdf(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) {
    window.alert("PDF তৈরি করা যায়নি — কন্টেন্ট খুঁজে পাওয়া যায়নি।");
    return;
  }

  // সাধারণ html2canvas Tailwind v4-এর oklch()/lab() কালার ফাংশন পার্স করতে পারে না — তাই
  // এই fork (html2canvas-pro) ব্যবহার করা হচ্ছে, যেটা একই API-তে modern CSS color function সাপোর্ট করে।
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      onclone: (clonedDoc: Document) => {
        // Print-only বাটন/টুলবার (print:hidden, no-print) PDF-এ দেখানো হবে না
        clonedDoc.querySelectorAll('[class*="print:hidden"], .no-print').forEach((node) => {
          (node as HTMLElement).style.display = "none";
        });
      },
    });
  } catch (err) {
    console.error("PDF render failed:", err);
    window.alert("PDF তৈরি করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    return;
  }

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const blob = pdf.output("blob") as Blob;
  const safeName = `${filename || "document"}.pdf`;

  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: safeName,
        types: [{ description: "PDF ফাইল", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // ব্যবহারকারী ফোল্ডার বাছাই ক্যান্সেল করেছে
      // অন্য কোনো এরর হলে নিচের সাধারণ ডাউনলোডে fallback
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
