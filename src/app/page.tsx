"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function LandingPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-mesh text-slate-100 font-sans">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 font-bold text-sm tracking-wider">
              W
            </span>
            <span className="font-bold text-lg tracking-tight text-slate-100">WanderLust</span>
          </Link>
          <nav className="flex items-center gap-4">
            {session ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition-all"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-lg text-slate-300 hover:text-slate-100 font-medium text-sm transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition-all shadow-md hover:shadow-teal-500/10"
                >
                  Sign Up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col justify-center items-center max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none animate-pulse-slow"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none animate-pulse-slow"></div>

        <span className="px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold tracking-wider uppercase mb-6 inline-block">
          Smart Bill Splitting
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-slate-200 to-teal-400 max-w-3xl mb-6">
          Split Expenses, Keep the Peace
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
          WanderLust is the ultimate splitwise-inspired dashboard to track shared bills, group budgets, and simplify balances using advanced graph simplification algorithms.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          {session ? (
            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-medium shadow-xl hover:shadow-teal-500/10 active:scale-[0.98] transition-all cursor-pointer"
            >
              Enter Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white font-medium shadow-xl hover:shadow-teal-500/10 active:scale-[0.98] transition-all cursor-pointer"
              >
                Get Started Now
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 font-medium transition-colors cursor-pointer"
              >
                Log In to Account
              </Link>
            </>
          )}
        </div>

        {/* Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left pt-12 border-t border-slate-900/60">
          <div className="glass-card p-8 rounded-2xl relative overflow-hidden border border-slate-800/40">
            <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 font-bold mb-4">
              ±
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">Multiple Splits</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Support for equal divisions, unequal splits, percentages, and share ratios. Precise rounding handles extra cents automatically.
            </p>
          </div>

          <div className="glass-card p-8 rounded-2xl relative overflow-hidden border border-slate-800/40">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 font-bold mb-4">
              ⇄
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">Debt Simplification</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              An advanced min-heap math engine reduces transitive debts inside groups, minimizing the number of overall bank transfers required.
            </p>
          </div>

          <div className="glass-card p-8 rounded-2xl relative overflow-hidden border border-slate-800/40">
            <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 font-bold mb-4">
              💬
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">Real-Time Chat</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Talk over splits immediately in the built-in, expense-specific discussion channels powered by active WebSockets.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/60 py-8 bg-slate-950/60">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-500">
          <p>© 2026 WanderLust Expense Sharing. Portfolio-Ready Engineering.</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-400 transition-colors">Clean Code</span>
            <span className="hover:text-slate-400 transition-colors">SOLID Patterns</span>
            <span className="hover:text-slate-400 transition-colors">Interactive UI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
