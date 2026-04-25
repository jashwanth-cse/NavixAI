"use client";

import { useState } from "react";
import { writeTestDocument } from "@/services/firestore";

type TestStatus = "idle" | "loading" | "success" | "error";

export default function HomePage() {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [docId, setDocId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleFirestoreTest() {
    setStatus("loading");
    setDocId("");
    setErrorMsg("");
    try {
      const id = await writeTestDocument();
      setDocId(id);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <main className="relative min-h-screen bg-amoled overflow-hidden">
      {/* ── Background glow effects ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
      >
        {/* Top centre radial glow */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-40 w-[700px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
        {/* Bottom right secondary glow */}
        <div className="absolute right-0 bottom-0 w-[400px] h-[400px] rounded-full bg-warning/5 blur-[100px]" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.6) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* ── Navbar ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* Logo icon */}
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-lg bg-accent/20 animate-pulse-glow" />
            <svg
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="relative w-9 h-9"
            >
              <rect width="36" height="36" rx="8" fill="rgba(0,212,255,0.1)" />
              <path
                d="M18 6L30 12V24L18 30L6 24V12L18 6Z"
                stroke="#00D4FF"
                strokeWidth="1.5"
                fill="none"
              />
              <circle cx="18" cy="18" r="4" fill="#00D4FF" opacity="0.9" />
              <path
                d="M18 10V14M18 22V26M10 18H14M22 18H26"
                stroke="#00D4FF"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-text-primary">
            Navig<span className="text-accent">AI</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-text-secondary">
          <a href="#features" className="hover:text-accent transition-colors duration-200">Features</a>
          <a href="#how-it-works" className="hover:text-accent transition-colors duration-200">How It Works</a>
          <a href="#network" className="hover:text-accent transition-colors duration-200">Network</a>
        </div>

        <div className="flex items-center gap-3">
          <button className="hidden md:block text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-200">
            Sign In
          </button>
          <button className="px-4 py-2 rounded-lg bg-accent text-amoled text-sm font-semibold hover:bg-accent-hover transition-all duration-200 glow-accent">
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20 md:pt-32 md:pb-28">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-medium text-accent mb-8 animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          Live Intelligence Network Active
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-text-primary max-w-5xl leading-none mb-6 animate-slide-up">
          Real-Time{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-300 glow-text">
            Collaborative
          </span>{" "}
          Threat&nbsp;Intelligence
          <br />
          <span className="text-text-secondary text-3xl md:text-5xl font-bold">
            for Logistics
          </span>
        </h1>

        {/* Sub-heading */}
        <p className="max-w-2xl text-base md:text-lg text-text-secondary leading-relaxed mb-10 animate-fade-in">
          Vehicles dynamically share risk signals across a shared intelligence
          network — enabling real-time detection of suspicious events and{" "}
          <span className="text-text-primary font-medium">
            automatic rerouting
          </span>{" "}
          before threats materialise.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <button
            id="cta-launch"
            className="px-8 py-3.5 rounded-xl bg-accent text-amoled font-bold text-sm hover:bg-accent-hover hover:scale-105 transition-all duration-200 glow-accent shadow-lg"
          >
            Launch Dashboard →
          </button>
          <button
            id="cta-demo"
            className="px-8 py-3.5 rounded-xl glass text-text-primary font-semibold text-sm hover:bg-white/5 transition-all duration-200"
          >
            Watch Demo
          </button>
        </div>

        {/* ── Stats strip ── */}
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 animate-fade-in">
          {[
            { value: "< 200ms", label: "Signal latency" },
            { value: "99.9%", label: "Network uptime" },
            { value: "10k+", label: "Active vehicles" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-extrabold text-accent">{stat.value}</p>
              <p className="text-xs text-text-secondary mt-1 uppercase tracking-widest">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section id="features" className="relative z-10 px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-text-primary mb-3">
            The Intelligence Stack
          </h2>
          <p className="text-center text-text-secondary text-sm mb-12 max-w-xl mx-auto">
            Every layer engineered for sub-second collective decision-making.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: "🛰️",
                title: "Signal Sharing",
                desc: "Vehicles broadcast verified risk signals — speed anomalies, geofence breaches, and cargo tampering — across the mesh network in real time.",
                color: "from-accent/20 to-transparent",
              },
              {
                icon: "⚡",
                title: "Instant Detection",
                desc: "AI fusion engine cross-correlates signals from multiple fleet nodes to identify emerging threats with <200ms latency.",
                color: "from-warning/20 to-transparent",
              },
              {
                icon: "🗺️",
                title: "Auto Rerouting",
                desc: "Affected vehicles receive optimised alternate routes automatically, minimising exposure without any driver intervention.",
                color: "from-success/20 to-transparent",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group relative glass rounded-2xl p-6 hover:bg-white/5 transition-all duration-300 hover:-translate-y-1"
              >
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${card.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />
                <span className="text-4xl mb-4 block">{card.icon}</span>
                <h3 className="text-base font-bold text-text-primary mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Firestore Test Section ── */}
      <section
        id="firestore-test"
        className="relative z-10 px-6 md:px-12 py-20"
      >
        <div className="max-w-xl mx-auto">
          <div className="glass rounded-2xl p-8 gradient-border">
            <div className="flex items-center gap-3 mb-4">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-accent"
              >
                <path
                  d="M4 7C4 5.89543 4.89543 5 6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M9 3V7M15 3V7M4 11H20"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <h2 className="text-base font-bold text-text-primary">
                Firebase / Firestore Connection
              </h2>
            </div>
            <p className="text-sm text-text-secondary mb-6 leading-relaxed">
              Verify your Firestore integration is wired correctly. Clicking the
              button below writes a test document to the{" "}
              <code className="font-mono text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                /test
              </code>{" "}
              collection and returns its Document ID.
            </p>

            {/* Status feedback */}
            {status === "success" && (
              <div className="mb-5 flex items-start gap-3 rounded-xl bg-success/10 border border-success/20 px-4 py-3">
                <span className="text-success text-lg mt-0.5">✅</span>
                <div>
                  <p className="text-sm font-semibold text-success">
                    Firestore write successful!
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Document ID:{" "}
                    <span className="font-mono text-accent">{docId}</span>
                  </p>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="mb-5 flex items-start gap-3 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
                <span className="text-danger text-lg mt-0.5">❌</span>
                <div>
                  <p className="text-sm font-semibold text-danger">
                    Write failed
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5 font-mono break-all">
                    {errorMsg}
                  </p>
                </div>
              </div>
            )}

            {/* Test button */}
            <button
              id="btn-test-firestore"
              onClick={handleFirestoreTest}
              disabled={status === "loading"}
              className={`
                w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl
                font-semibold text-sm transition-all duration-200
                ${
                  status === "loading"
                    ? "bg-surface-2 text-text-secondary cursor-not-allowed"
                    : "bg-accent text-amoled hover:bg-accent-hover hover:scale-[1.02] glow-accent active:scale-[0.98]"
                }
              `}
            >
              {status === "loading" ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Writing to Firestore…
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  Test Firestore
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-muted">
              Make sure{" "}
              <code className="font-mono text-accent/70">.env.local</code> is
              filled with your Firebase credentials before testing.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/5 px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} NavixAI. All rights reserved.
        </p>
        <p className="text-xs text-muted">
          Real-Time Collaborative Threat Intelligence for Logistics
        </p>
      </footer>
    </main>
  );
}
