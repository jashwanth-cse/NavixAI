"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const featureCards = [
  {
    title: "Live risk-aware routing",
    description:
      "Plan routes with Google Maps, monitor active threat zones, and shift drivers to safer paths before they enter a risk radius.",
  },
  {
    title: "Shared fleet intelligence",
    description:
      "Vehicles publish incident signals and route advisories so other drivers on the same corridor receive the reroute reason instantly.",
  },
  {
    title: "Driver-ready navigation",
    description:
      "Voice guidance, AI decision logs, and compact vehicle telemetry keep the operator informed without overwhelming the screen.",
  },
];

const architectureSteps = [
  {
    eyebrow: "Sense",
    title: "Route session",
    description:
      "Each navigation run gets its own session, current vehicle coordinate, and local restore state so refresh resumes from the live point.",
  },
  {
    eyebrow: "Verify",
    title: "Threat intelligence",
    description:
      "Threat zones stay shared in Firestore, while route-specific incidents are summarized into driver advisories and matched only to relevant vehicles.",
  },
  {
    eyebrow: "Respond",
    title: "Optimistic reroute",
    description:
      "NavixAI evaluates alternate corridors, avoids the active 2 km zone, and commits the shortest practical traffic-aware reroute.",
  },
];

const networkSignals = [
  { label: "Planner", value: "Google Maps route compute + Places" },
  { label: "Realtime", value: "Threat zone and incident listeners" },
  { label: "Guidance", value: "Gemini summary + Translate + TTS" },
];

function Navbar() {
  const navItems = [
    { label: "Features", href: "#features" },
    { label: "Architecture", href: "#architecture" },
    { label: "Network", href: "#network" },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#081018]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#home" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/30 bg-sky-400/10 text-sky-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="m15.5 8.5-4 7-3-3" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            Navix<span className="text-sky-300">AI</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/safe-route-planner"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
        >
          Open Planner
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const [tutorialVisible, setTutorialVisible] = useState(true);

  return (
    <section
      id="home"
      className="relative overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 sm:pb-24 lg:px-8 lg:pt-36"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,#071019_0%,#081018_48%,#0b1320_100%)]" />
      <div className="absolute inset-x-0 top-24 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div data-reveal className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-medium text-sky-200">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            Safe route planner is live
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Navigation that explains every reroute before the driver asks why.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              NavixAI turns shared fleet incidents, live threat zones, and route intelligence into a calm, driver-ready safe route planner.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/safe-route-planner"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-400 px-6 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Launch Safe Route Planner
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
                <path d="m13 5 7 7-7 7" />
              </svg>
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/12 bg-white/4 px-6 text-sm font-medium text-white transition hover:bg-white/8"
            >
              See how it works
            </a>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Realtime</p>
              <p className="mt-2 text-lg font-semibold text-white">Threat-aware updates</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Shared</p>
              <p className="mt-2 text-lg font-semibold text-white">Fleet incident messaging</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Guided</p>
              <p className="mt-2 text-lg font-semibold text-white">Voice reroute briefings</p>
            </div>
          </div>
        </div>

        <div data-reveal className="relative">
          <div className="rounded-[28px] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,28,0.96),rgba(8,16,24,0.92))] p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-200/80">Primary Experience</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Safe Route Planner</h2>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Live
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium text-white">Plan route</p>
                  <p className="mt-1 text-sm text-slate-300">Source, destination, live route geometry, truck simulation.</p>
                </div>
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
                  <p className="text-sm font-medium text-rose-100">Threat advisory</p>
                  <p className="mt-1 text-sm text-rose-100/80">
                    Shared high-risk activity ahead. A safer corridor is prepared automatically.
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4">
                  <p className="text-sm font-medium text-sky-100">AI decision center</p>
                  <p className="mt-1 text-sm text-sky-100/80">
                    Driver-facing explanation, reroute rationale, and voice guidance in the selected language.
                  </p>
                </div>
              </div>

              {tutorialVisible && (
                <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-200/10 p-4 tutorial-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Quick Start</p>
                      <p className="mt-2 text-sm leading-6 text-amber-50">
                        Start with the safe route planner. It is the main product experience and the fastest way to see live rerouting.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTutorialVisible(false)}
                      className="text-xs font-medium text-amber-100/80 transition hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <Link
                    href="/safe-route-planner"
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    Open guided planner
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">Features</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            One planner surface, all the critical decisions.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            The landing page stays concise. The product lives in the safe route planner, and every feature here supports that one focused workflow.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {featureCards.map((card) => (
            <article
              key={card.title}
              data-reveal
              className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-sky-300/20 hover:bg-white/7"
            >
              <h3 className="text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{card.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="architecture" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-[#0c1623] p-6 sm:p-8 lg:p-10">
        <div data-reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">Architecture</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Minimal stack, clear signal path.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            The system is organized around route sessions, shared threat intelligence, and fast reroute execution so the UI stays understandable under pressure.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {architectureSteps.map((step) => (
            <article key={step.title} data-reveal className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/75">{step.eyebrow}</p>
              <h3 className="mt-3 text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Network() {
  return (
    <section id="network" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:pb-28">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div data-reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">Network</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Connected services with one driver-facing outcome.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Google Maps powers route computation, Firestore distributes shared risk state, and AI guidance explains the reroute in plain language for the driver.
          </p>
          <Link
            href="/safe-route-planner"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-300/10 px-5 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/15"
          >
            Continue to planner
          </Link>
        </div>

        <div data-reveal className="rounded-[32px] border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="grid gap-3">
            {networkSignals.map((signal) => (
              <div
                key={signal.label}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0d1723] px-4 py-4"
              >
                <span className="text-sm font-medium text-slate-200">{signal.label}</span>
                <span className="text-right text-sm text-slate-400">{signal.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Recommended path</p>
            <p className="mt-2 text-sm leading-6 text-emerald-50">
              Visitors should enter through the landing page, see the guided planner prompt, and move directly into the safe route workflow.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#060d15] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">NavixAI</span>
          <span>{new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#features" className="transition hover:text-white">
            Features
          </a>
          <a href="#architecture" className="transition hover:text-white">
            Architecture
          </a>
          <a href="#network" className="transition hover:text-white">
            Network
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (!elements.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#081018] selection:bg-sky-400/25 selection:text-white">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Architecture />
        <Network />
      </main>
      <Footer />
    </div>
  );
}
