"use client";

import Link from "next/link";
import { useState } from "react";
import { writeTestDocument } from "@/services/firestore";

type TestStatus = "idle" | "loading" | "success" | "error";

/* ─────────────────────────── Navbar ─────────────────────────── */
function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.04] bg-[#0A0A0A]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          </span>
          <span className="text-[17px] font-bold tracking-tight text-white">
            Navix<span className="text-cyan-400">AI</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {["Features", "Architecture", "Network"].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-[13px] font-medium text-neutral-400 hover:text-white transition-colors duration-200"
            >
              {link}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <button className="hidden sm:block text-[13px] font-medium text-neutral-400 hover:text-white transition-colors duration-200">
            Sign In
          </button>
          <Link
            href="/safe-route-planner"
            className="h-9 px-4 rounded bg-cyan-500 text-black text-[13px] font-semibold hover:bg-cyan-400 transition-colors duration-200 shadow-[0_0_20px_rgba(6,182,212,0.2)] flex items-center justify-center"
          >
            Safe Route Planner
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */
function Hero() {
  return (
    <section className="relative pt-48 md:pt-[220px] pb-20 md:pb-32 flex flex-col items-center text-center px-6 lg:px-8 overflow-hidden">
      {/* Background glow and grid */}
      <div aria-hidden className="absolute inset-0 pointer-events-none flex justify-center">
        <div className="absolute top-0 w-full max-w-2xl h-[400px] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
        {/* Status indicator */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.03] text-[13px] font-medium text-cyan-400 mb-8 shadow-[0_0_15px_rgba(6,182,212,0.05)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          Global Intel Network Online
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-semibold tracking-[-0.03em] text-white leading-[1.05] mb-6">
          Real-Time Collaborative <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500">
            Threat Intelligence
          </span>
        </h1>

        {/* Description */}
        <p className="max-w-2xl text-[16px] md:text-[18px] text-neutral-400 leading-relaxed font-light mb-10">
          A distributed mesh network for modern logistics. Vehicles dynamically share verified risk signals, enabling sub-second threat detection and <span className="text-neutral-200 font-normal">autonomous rerouting</span> globally.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link
            href="/safe-route-planner"
            className="w-full sm:w-auto h-11 px-8 rounded bg-cyan-500 text-black text-[14px] font-semibold hover:bg-cyan-400 transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
          >
            Launch Safe Route Planner
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
          <button className="w-full sm:w-auto h-11 px-8 rounded border border-white/[0.08] bg-white/[0.02] text-white text-[14px] font-medium hover:bg-white/[0.06] transition-all duration-200 flex items-center justify-center">
            View Analytics
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── System Metrics ─────────────────────────── */
function Metrics() {
  return (
    <section className="px-6 lg:px-8 pb-20 md:pb-32">
      <div className="mx-auto max-w-5xl rounded-2xl border border-white/[0.04] bg-[#111] p-8 md:p-12 relative overflow-hidden">
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 text-center divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
          <div className="pt-4 md:pt-0">
            <div className="text-[12px] font-semibold text-neutral-500 uppercase tracking-widest mb-2">Network Latency</div>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-4xl md:text-5xl font-light text-white tracking-tight">18</span>
              <span className="text-xl font-light text-cyan-500">ms</span>
            </div>
            <div className="text-[13px] text-neutral-400 mt-2">p99 global consensus</div>
          </div>
          <div className="pt-8 md:pt-0">
            <div className="text-[12px] font-semibold text-neutral-500 uppercase tracking-widest mb-2">Threat Mitigation</div>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-4xl md:text-5xl font-light text-white tracking-tight">99.9</span>
              <span className="text-xl font-light text-cyan-500">%</span>
            </div>
            <div className="text-[13px] text-neutral-400 mt-2">automated resolution</div>
          </div>
          <div className="pt-8 md:pt-0">
            <div className="text-[12px] font-semibold text-neutral-500 uppercase tracking-widest mb-2">Active Fleet Nodes</div>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-4xl md:text-5xl font-light text-white tracking-tight">12.4</span>
              <span className="text-xl font-light text-cyan-500">k</span>
            </div>
            <div className="text-[13px] text-neutral-400 mt-2">real-time sync count</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Features Architecture ─────────────────────────── */
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    title: "Edge Signal Processing",
    desc: "Vehicles cryptographically sign and broadcast telemetry — speed anomalies, spatial breaches, and sensor deviations — directly via mesh protocols.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
        <polyline points="7.5 19.79 7.5 14.6 3 12"/>
        <polyline points="21 12 16.5 14.6 16.5 19.79"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    title: "Fusion Intelligence",
    desc: "A distributed engine cross-verifies overlapping signals from proximal logistics nodes, isolating false positives and confirming genuine security risks.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 16 16 12 12 8"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
    title: "Dynamic Vectoring",
    desc: "Upon threat confirmation, algorithmic dispatch vectors incoming assets away from the risk zone instantly without any human-in-the-loop requirement.",
  },
];

function Features() {
  return (
    <section id="features" className="px-6 lg:px-8 pb-24 md:pb-40">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl mb-16">
          <h2 className="text-3xl font-semibold text-white tracking-tight mb-4">Core Architecture</h2>
          <p className="text-[17px] text-neutral-400 leading-relaxed font-light">
            Engineered exclusively for sub-second consensus. Every layer of the stack prioritises speed, security, and absolute reliability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex flex-col group p-8 rounded-xl border border-white/[0.04] bg-[#0F0F0F] hover:bg-[#141414] hover:border-white/[0.08] transition-all duration-300"
            >
              <div className="mb-6 w-11 h-11 rounded-lg border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center text-cyan-400">
                {f.icon}
              </div>
              <h3 className="text-[16px] font-medium text-white mb-3 tracking-tight">{f.title}</h3>
              <p className="text-[14px] text-neutral-400 leading-relaxed font-light flex-grow">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Firestore Diagnostic Panel ─────────────────────────── */
function FirestoreTest() {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [docId, setDocId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleTest() {
    setStatus("loading");
    setDocId("");
    setErrorMsg("");

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out after 10s. Verify networking and SDK status.")), 10000)
    );

    try {
      const id = await Promise.race([writeTestDocument(), timeout]);
      setDocId(id);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <section className="px-6 lg:px-8 pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left info side */}
          <div>
            <h2 className="text-2xl font-semibold text-white tracking-tight mb-4">System Diagnostics</h2>
            <p className="text-[15px] text-neutral-400 leading-relaxed font-light mb-6">
              Run an automated transaction through the <code className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded font-mono text-[13px]">navix-ai</code> data pipeline. 
              This verifies end-to-end connectivity, TLS negotiation, and Firestore write permissions from edge nodes.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-[13px] text-neutral-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                Encrypted payload transit
              </div>
              <div className="flex items-center gap-3 text-[13px] text-neutral-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                Direct commit to /test
              </div>
            </div>
          </div>

          {/* Right interactive panel */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0E0E0E] p-6 lg:p-8 relative overflow-hidden">
            {/* Minimal top bar mimicking terminal */}
            <div className="absolute top-0 inset-x-0 h-10 border-b border-white/[0.04] bg-[#111] flex items-center px-4 gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-600"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-600"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-neutral-600"></div>
              <div className="ml-2 text-[11px] font-mono text-neutral-500">sys_diag/db_test</div>
            </div>

            <div className="pt-10">
              <button
                onClick={handleTest}
                disabled={status === "loading"}
                className={`w-full h-11 rounded text-[14px] font-medium flex items-center justify-center gap-2.5 transition-all duration-200 mb-6 ${
                  status === "loading"
                    ? "bg-white/[0.04] text-neutral-400 cursor-not-allowed border border-white/[0.06]"
                    : "bg-white text-black hover:bg-neutral-200"
                }`}
              >
                {status === "loading" ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Awaiting Callback...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Run Protocol
                  </>
                )}
              </button>

              {/* Status Display window */}
              <div className="min-h-[90px] rounded border border-white/[0.04] bg-[#0A0A0A] p-4 font-mono text-[12px]">
                {status === "idle" && (
                  <p className="text-neutral-500">System idle. Ready for diagnostic.</p>
                )}
                
                {status === "loading" && (
                  <p className="text-cyan-400 opacity-80 animate-pulse">Establishing connection to navix-ai cluster...</p>
                )}

                {status === "success" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <span className="text-emerald-500">[200 OK]</span>
                      <span className="text-neutral-300">Transaction isolated and committed.</span>
                    </div>
                    <div className="text-neutral-500 ml-[68px]">
                      hash: <span className="text-emerald-400 break-all">{docId}</span>
                    </div>
                  </div>
                )}

                {status === "error" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <span className="text-red-500">[ERROR]</span>
                      <span className="text-neutral-300">Transaction failure detected.</span>
                    </div>
                    <div className="text-red-400/80 ml-[63px] break-words">
                      {errorMsg}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-white/[0.04] bg-[#050505] py-8 px-6 lg:px-8">
      <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          <span className="text-[13px] font-semibold text-white">NavixAI</span>
          <span className="text-[12px] text-neutral-600 ml-1">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6 text-[12px] text-neutral-600 font-medium">
          <a href="#" className="hover:text-neutral-300 transition-colors">Privacy</a>
          <a href="#" className="hover:text-neutral-300 transition-colors">Terms</a>
          <a href="#" className="hover:text-neutral-300 transition-colors">Status</a>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Layout Composer ─────────────────────────── */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      <Navbar />
      <main>
        <Hero />
        <Metrics />
        <Features />
        <FirestoreTest />
      </main>
      <Footer />
    </div>
  );
}
