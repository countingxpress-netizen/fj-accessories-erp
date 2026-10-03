"use client";
import { useEffect, useState } from "react";
import NavIcon from "./NavIcon";
import {
  ERP_FOLDER_LABEL, folderDisplayName, getSavedFolder, isFolderSaveSupported, onFolderChange, pickErpFolder,
} from "@/lib/erpDownload";

// সাইডবারে ডাউনলোড ফোল্ডার (D:\000.ERP) সেট/বদলানোর বাটন। ফোল্ডার সেট না থাকলেও প্রথম
// ডাউনলোডের সময় পিকার নিজেই আসে — এই বাটন আগে থেকে সেট করা বা পরে বদলানোর জন্য।
// Firefox-এর মতো ব্রাউজারে (File System Access API নেই) কিছুই দেখায় না — সেখানে সাধারণ ডাউনলোড।
export default function DownloadFolderButton() {
  const [supported, setSupported] = useState(false);
  const [folderName, setFolderName] = useState("");

  useEffect(() => {
    if (!isFolderSaveSupported()) return;
    const refresh = () => getSavedFolder().then((h) => {
      setSupported(true);
      setFolderName(folderDisplayName(h));
    });
    refresh();
    return onFolderChange(refresh);
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => pickErpFolder()}
      title={`ERP-এর সব Excel/PDF ডাউনলোড ${ERP_FOLDER_LABEL} ফোল্ডারে অটো সেভ হবে।\nD: ড্রাইভের 000.ERP ফোল্ডারটা সিলেক্ট করুন — না থাকলে ডায়ালগের "New folder" দিয়ে 000.ERP নামে বানিয়ে নিন।\nঅন্য কোনো ফোল্ডার সিলেক্ট করলে তার ভেতরে 000.ERP অটো তৈরি হবে।`}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
    >
      <NavIcon name="folder" />
      <span className="min-w-0">
        <span className="block">Download ফোল্ডার</span>
        {folderName ? (
          <span className="block truncate text-[11px] text-green-400">✓ {folderName}</span>
        ) : (
          <span className="block text-[11px] text-amber-400">সেট করা নেই — ক্লিক করুন</span>
        )}
      </span>
    </button>
  );
}
