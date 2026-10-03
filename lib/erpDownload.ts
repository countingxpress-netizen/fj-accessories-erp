// ERP থেকে যত ফাইল ডাউনলোড হয় (Excel / Save as PDF) — সব D:\000.ERP ফোল্ডারে অটো সেভ।
//
// ব্রাউজারের নিরাপত্তার কারণে কোনো ওয়েবসাইট নিজে থেকে ডিস্কের নির্দিষ্ট পাথে (D:\000.ERP) লিখতে
// পারে না। তাই Chrome/Edge-এর File System Access API: ইউজার একবার ফোল্ডারটা সিলেক্ট করে দেয়,
// তার handle IndexedDB-তে থাকে, এরপর প্রতিটা ডাউনলোড কোনো ডায়ালগ ছাড়াই সরাসরি সেখানে লেখা হয়।
// সিলেক্ট করা ফোল্ডারের নাম "000.ERP" না হলে (যেমন D:\ বাছলে) তার ভেতরে 000.ERP অটো তৈরি হয় —
// প্রতিবার সেভের সময় আবার চেক হয়, তাই পরে কেউ ফোল্ডার মুছে ফেললেও নতুন করে তৈরি হয়ে যায়।
// Firefox-এ (API নেই), ইউজার ফোল্ডার/পারমিশন না দিলে বা লেখায় এরর হলে — সাধারণ ব্রাউজার ডাউনলোড।
//
// "use client" নেই — saveAsPdf.ts-এর মতোই window/indexedDB শুধু ফাংশন বডির ভেতরে, তাই সার্ভার
// কম্পোনেন্ট থেকে import হলেও সমস্যা নেই; কল হয় শুধু ক্লায়েন্টের ক্লিক হ্যান্ডলার থেকে।

export const ERP_FOLDER_NAME = "000.ERP";
export const ERP_FOLDER_LABEL = "D:\\000.ERP";

const DB_NAME = "fj-erp";
const STORE = "handles";
const HANDLE_KEY = "downloadDir";
// ইউজার এই সেশনে ফোল্ডার পিকার ক্যান্সেল করলে প্রতিটা ডাউনলোডে আবার পিকার না খোলার জন্য
const SKIP_KEY = "fj-erp-folder-skip";
const CHANGE_EVENT = "fj-erp-folder-change";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRun<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idbOpen();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function isFolderSaveSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && typeof indexedDB !== "undefined";
}

/** সেভ করা (ইউজারের সিলেক্ট করা) ফোল্ডার handle — না থাকলে null */
export async function getSavedFolder(): Promise<any | null> {
  if (!isFolderSaveSupported()) return null;
  try {
    return (await idbRun<any>("readonly", (s) => s.get(HANDLE_KEY))) ?? null;
  } catch {
    return null;
  }
}

async function clearSavedFolder() {
  try {
    await idbRun("readwrite", (s) => s.delete(HANDLE_KEY));
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** সাইডবারের ফোল্ডার বাটন এই ইভেন্ট শুনে নিজের লেবেল আপডেট করে */
export function onFolderChange(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** দেখানোর জন্য: সিলেক্ট করা ফোল্ডারের নাম 000.ERP হলে শুধু সেটা, নাহলে "<নাম>\000.ERP" */
export function folderDisplayName(picked: any | null): string {
  if (!picked) return "";
  if (picked.name === ERP_FOLDER_NAME) return ERP_FOLDER_NAME;
  // ড্রাইভ রুট বাছলে নাম "D:\" আসে — শেষের "\" বাদ দিয়ে "D:\000.ERP"
  const base = String(picked.name ?? "").replace(/[\\/]+$/, "");
  return base ? `${base}\\${ERP_FOLDER_NAME}` : ERP_FOLDER_NAME;
}

async function hasWritePermission(handle: any, request: boolean): Promise<boolean> {
  const opts = { mode: "readwrite" };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if (!request) return false;
    return (await handle.requestPermission(opts)) === "granted";
  } catch {
    return false;
  }
}

/**
 * ফোল্ডার সিলেক্ট (প্রথমবার বা বদলাতে)। অবশ্যই ইউজারের ক্লিকের ভেতর থেকে কল করতে হবে —
 * ব্রাউজার ক্লিক ছাড়া পিকার খুলতে দেয় না। ক্যান্সেল করলে null।
 */
export async function pickErpFolder(): Promise<any | null> {
  if (!isFolderSaveSupported()) return null;
  let picked: any;
  try {
    picked = await (window as any).showDirectoryPicker({ id: "fj-erp-download", mode: "readwrite", startIn: "downloads" });
  } catch {
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* ignore */ }
    return null;
  }
  try { sessionStorage.removeItem(SKIP_KEY); } catch { /* ignore */ }
  try {
    await idbRun("readwrite", (s) => s.put(picked, HANDLE_KEY));
  } catch { /* handle সেভ না হলেও এই ডাউনলোডটা তো হবে */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return picked;
}

/**
 * ডাউনলোড বাটনের ক্লিক হ্যান্ডলারের শুরুতেই (PDF রেন্ডারের মতো ভারী কাজের আগে) কল করুন —
 * ফোল্ডার পিকার/পারমিশন প্রম্পট ব্রাউজার শুধু ক্লিকের কয়েক সেকেন্ডের মধ্যেই দেখাতে দেয়।
 * রিটার্ন: লেখার পারমিশনসহ ফোল্ডার handle, অথবা null (= সাধারণ ব্রাউজার ডাউনলোড হবে)।
 */
export async function prepareErpFolder(): Promise<any | null> {
  if (!isFolderSaveSupported()) return null;
  const saved = await getSavedFolder();
  if (saved) return (await hasWritePermission(saved, true)) ? saved : null;
  let skipped = false;
  try { skipped = sessionStorage.getItem(SKIP_KEY) === "1"; } catch { /* ignore */ }
  if (skipped) return null;
  return pickErpFolder();
}

// Windows-এ ফাইলনেমে এগুলো চলে না (Challan No-তে "/" থাকে) — ব্রাউজার ডাউনলোড নিজে বদলায়,
// কিন্তু getFileHandle এরর দেয়, তাই আগেই বদলে দেওয়া
function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "download";
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message: string, warn = false) {
  const el = document.createElement("div");
  el.className = "no-print print:hidden";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: "9999", maxWidth: "420px",
    padding: "10px 14px", borderRadius: "8px", fontSize: "13px", lineHeight: "1.4",
    color: "#fff", background: warn ? "#b45309" : "#15803d", boxShadow: "0 4px 12px rgba(0,0,0,.2)",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), warn ? 6000 : 3500);
}

/**
 * ফাইলটা D:\000.ERP-এ সেভ করে। একই নামের ফাইল থাকলে সেটা নতুন ভার্সন দিয়ে replace হয়।
 * `preparedFolder` — ক্লিকের শুরুতে prepareErpFolder() থেকে পাওয়া handle (না দিলে এখানেই চাওয়া হয়)।
 */
export async function saveErpFile(blob: Blob, filename: string, preparedFolder?: any | null) {
  const name = safeFilename(filename);
  const picked = preparedFolder === undefined ? await prepareErpFolder() : preparedFolder;
  if (picked) {
    try {
      const dir = picked.name === ERP_FOLDER_NAME
        ? picked
        : await picked.getDirectoryHandle(ERP_FOLDER_NAME, { create: true });
      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast(`✅ সেভ হয়েছে: ${folderDisplayName(picked)}\\${name}`);
      return;
    } catch (err: any) {
      console.error("ERP folder save failed:", err);
      // সিলেক্ট করা ফোল্ডারটাই মুছে ফেলা হলে পরের বার আবার ফোল্ডার চাওয়া হবে
      if (err?.name === "NotFoundError") await clearSavedFolder();
      showToast(
        `⚠ ${ERP_FOLDER_NAME} ফোল্ডারে সেভ করা যায়নি (ফাইলটা Excel/PDF-এ খোলা থাকলে বন্ধ করে আবার চেষ্টা করুন) — সাধারণ ডাউনলোড করা হলো।`,
        true,
      );
    }
  }
  browserDownload(blob, name);
}
