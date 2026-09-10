"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("লগইন ব্যর্থ হয়েছে। ইমেইল/পাসওয়ার্ড চেক করুন।");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="nm-wrap">
      <style>{`
        .nm-wrap {
          --nm-bg: #e4e7ee;
          --nm-dark: #b9bdca;
          --nm-light: #ffffff;
          --nm-text: #33384f;
          --nm-muted: #8b90a3;
          --nm-accent: #2a3f8f;
          min-height: 100svh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(120% 120% at 50% 0%, #eef0f5 0%, var(--nm-bg) 55%, #d7dae3 100%);
          font-family: Arial, Helvetica, sans-serif;
        }
        .nm-card {
          position: relative;
          width: min(90vmin, 92vw, 480px);
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          background: var(--nm-bg);
          box-shadow: 18px 18px 40px var(--nm-dark), -18px -18px 40px var(--nm-light);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* F&J লোগো — পুরো বৃত্ত জুড়ে হালকা ওয়াটারমার্ক */
        .nm-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 14%;
          border-radius: inherit;
          opacity: 0.12;
          filter: saturate(1.15);
          pointer-events: none;
          user-select: none;
        }
        .nm-content {
          position: relative;
          z-index: 1;
          width: 100%;
          padding: 0 46px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .nm-title { font-size: 34px; font-weight: 800; color: var(--nm-text); letter-spacing: 0.5px; line-height: 1.1; }
        .nm-sub { font-size: 12.5px; color: var(--nm-muted); margin-top: 4px; margin-bottom: 18px; }
        .nm-field {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px;
          margin-bottom: 12px;
          border-radius: 14px;
          background: var(--nm-bg);
          box-shadow: inset 5px 5px 10px var(--nm-dark), inset -5px -5px 10px var(--nm-light);
        }
        .nm-field svg { flex: none; color: var(--nm-muted); }
        .nm-field input {
          flex: 1; border: 0; outline: 0; background: transparent;
          font-size: 14px; color: var(--nm-text);
        }
        .nm-field input::placeholder { color: var(--nm-muted); }
        .nm-row {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 2px 0 16px;
          font-size: 12px;
          color: var(--nm-muted);
        }
        .nm-remember { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .nm-toggle {
          width: 34px; height: 18px; border-radius: 999px;
          background: var(--nm-bg);
          box-shadow: inset 3px 3px 6px var(--nm-dark), inset -3px -3px 6px var(--nm-light);
          position: relative; transition: 0.2s;
        }
        .nm-toggle::after {
          content: ""; position: absolute; top: 2px; left: 2px;
          width: 14px; height: 14px; border-radius: 50%;
          background: var(--nm-bg);
          box-shadow: 2px 2px 4px var(--nm-dark), -2px -2px 4px var(--nm-light);
          transition: 0.2s;
        }
        .nm-toggle.on { background: #dfe3ec; }
        .nm-toggle.on::after { transform: translateX(16px); background: var(--nm-accent); }
        .nm-link { color: var(--nm-muted); background: none; border: 0; cursor: pointer; font-size: 12px; }
        .nm-link:hover { color: var(--nm-accent); }
        .nm-btn {
          width: 100%;
          padding: 13px;
          border: 0;
          border-radius: 14px;
          background: var(--nm-bg);
          color: var(--nm-text);
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: 2px;
          cursor: pointer;
          box-shadow: 6px 6px 14px var(--nm-dark), -6px -6px 14px var(--nm-light);
          transition: 0.15s;
        }
        .nm-btn:hover { color: var(--nm-accent); }
        .nm-btn:active { box-shadow: inset 5px 5px 10px var(--nm-dark), inset -5px -5px 10px var(--nm-light); }
        .nm-btn:disabled { opacity: 0.5; cursor: default; }
        .nm-foot { font-size: 12px; color: var(--nm-muted); margin-top: 14px; }
        .nm-foot b { color: var(--nm-accent); cursor: pointer; }
        .nm-msg { font-size: 12px; margin-top: 10px; text-align: center; }
        .nm-msg.err { color: #c0392b; }
        .nm-msg.info { color: var(--nm-accent); }
        @media (max-width: 430px) {
          .nm-card { aspect-ratio: auto; border-radius: 32px; width: 100%; padding: 38px 4px; }
          .nm-content { padding: 0 26px; }
        }
      `}</style>

      <form onSubmit={handleLogin} className="nm-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/logo.png" alt="F & J Accessories" className="nm-bg" />

        <div className="nm-content">
          <div className="nm-title">Login</div>
          <div className="nm-sub">Sign in to your account</div>

          <label className="nm-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <input
              type="email" placeholder="Email" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </label>

          <label className="nm-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input
              type="password" placeholder="Password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </label>

          <div className="nm-row">
            <span className="nm-remember" onClick={() => setRemember((v) => !v)}>
              <span className={`nm-toggle ${remember ? "on" : ""}`} />
              Remember me
            </span>
            <button type="button" className="nm-link" onClick={() => setNote("পাসওয়ার্ড রিসেটের জন্য অ্যাডমিনের সাথে যোগাযোগ করুন।")}>
              Forgot password?
            </button>
          </div>

          <button type="submit" className="nm-btn" disabled={loading}>
            {loading ? "SIGNING IN..." : "SIGN IN"}
          </button>

          <div className="nm-foot">
            Don&apos;t have an account?{" "}
            <b onClick={() => setNote("নতুন অ্যাকাউন্ট অ্যাডমিন তৈরি করে দেবেন।")}>Sign up</b>
          </div>

          {error && <p className="nm-msg err">{error}</p>}
          {note && !error && <p className="nm-msg info">{note}</p>}
        </div>
      </form>
    </div>
  );
}
