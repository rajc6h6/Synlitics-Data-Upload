"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";

type Stage = "auth" | "upload" | "processing";

type ProcessingStatus = {
  status: "uploaded" | "normalizing" | "reconciling" | "reporting" | "complete";
};

export default function Home() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>("auth");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore session + processing state
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        await restoreProcessingState(data.user.id);
      }
    };
    init();
  }, []);

  const restoreProcessingState = async (uid: string) => {
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setStatus({ status: data.status });
      setStage("processing");
    }
  };

  const handleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setUserId(data.user?.id ?? null);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setUserId(data.user?.id ?? null);
      }
      setStage("upload");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (dropped: FileList | null) => {
    if (!dropped) return;
    const accepted = Array.from(dropped).filter((file) =>
      [".csv", ".xlsx"].some((ext) => file.name.toLowerCase().endsWith(ext))
    );
    setFiles(accepted);
  };

  const handleUpload = async () => {
    if (!userId || files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // Upload each file to private bucket
      for (const file of files) {
        const path = `${userId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from("user-exports")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
        if (error) throw error;
      }

      // Create processing job
      const { data, error } = await supabase
        .from("processing_jobs")
        .insert({
          user_id: userId,
          status: "uploaded",
        })
        .select("*")
        .single();
      if (error) throw error;
      setStatus({ status: data.status });

      // Move to processing view
      setStage("processing");

      // Fake status progression on client (actual background processing would update row)
      setTimeout(() => setStatus({ status: "normalizing" }), 1200);
      setTimeout(() => setStatus({ status: "reconciling" }), 3600);
      setTimeout(() => setStatus({ status: "reporting" }), 6000);
      setTimeout(() => setStatus({ status: "complete" }), 9000);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setStage("auth");
    setFiles([]);
    setStatus(null);
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
        <div className="flex w-full justify-between text-xs text-slate-500">
          <a
            href="https://synlitics.com"
            className="hover:text-slate-300 transition"
          >
            ← Back to synlitics.com
          </a>
          {userId && (
            <button
              onClick={handleLogout}
              className="rounded-full border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
            >
              Log Out
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {stage === "auth" && (
            <motion.section
              key="auth"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="glass-card w-full rounded-2xl px-8 py-10"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-500">
                Synletics App
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-slate-50">
                Welcome back, Owner.
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Ready for your morning report?
              </p>

              <div className="mt-6 space-y-4">
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm outline-none ring-0 focus:border-orange-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm outline-none ring-0 focus:border-orange-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {error && (
                  <p className="text-xs text-red-400">
                    {error}
                  </p>
                )}
                <button
                  onClick={handleAuth}
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Just a moment..."
                    : authMode === "login"
                    ? "Log In"
                    : "Create Account"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "signup" : "login")
                  }
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
                >
                  {authMode === "login"
                    ? "New here? Create a Synlitics account."
                    : "Already have an account? Log in."}
                </button>
              </div>
            </motion.section>
          )}

          {stage === "upload" && (
            <motion.section
              key="upload"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="glass-card w-full rounded-2xl px-8 py-10"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">
                Stage 1 · Secure Dropzone
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-50">
                Drop your exports. Synlitics does the rest.
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Drag your DoorDash, Uber Eats, and Grubhub exports here. We’ll
                take care of the rest.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(e.dataTransfer.files);
                }}
                className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-500/60 bg-slate-900/40 px-6 py-10 text-center transition hover:border-orange-500 hover:bg-slate-900/70"
              >
                <div className="mb-4 flex gap-4">
                  {["DoorDash", "Uber Eats", "Grubhub"].map((name) => (
                    <div
                      key={name}
                      className="flex h-10 items-center justify-center rounded-full bg-slate-900/80 px-4 text-xs font-semibold text-slate-300 border border-white/10"
                    >
                      {name}
                    </div>
                  ))}
                </div>
                <p className="text-sm font-medium text-slate-100">
                  Drag & drop .csv or .xlsx files
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Drag your platform exports here. We’ll take care of the rest.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-slate-800/80 px-4 py-1.5 text-xs font-medium text-slate-100 border border-white/10 hover:border-orange-500 hover:bg-slate-800">
                  <span>Browse files</span>
                  <input
                    type="file"
                    multiple
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(e) => handleDrop(e.target.files)}
                  />
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-300">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                    Files selected
                  </p>
                  <ul className="space-y-1">
                    {files.map((f) => (
                      <li key={f.name} className="truncate">
                        {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={loading || files.length === 0}
                className="mt-6 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Uploading..." : "Submit & Start Processing"}
              </button>

              {error && (
                <p className="mt-2 text-xs text-red-400">{error}</p>
              )}
            </motion.section>
          )}

          {stage === "processing" && (
            <motion.section
              key="processing"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="glass-card w-full rounded-2xl px-8 py-10"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-green-400">
                Stage 2 · Processing Terminal
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-50">
                Your exports are inside the Synlitics engine.
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                This is your black box of intelligence. We’re normalizing,
                reconciling, and preparing your Morning Tea report.
              </p>

              <div className="mt-6 space-y-3 text-sm">
                <StatusRow
                  label="Files Uploaded Securely"
                  state="done"
                />
                <StatusRow
                  label="AI Normalization Engine Active"
                  state={
                    status?.status === "uploaded"
                      ? "active"
                      : status?.status === "normalizing"
                      ? "active"
                      : "done"
                  }
                />
                <StatusRow
                  label="P&L Reconciliation"
                  state={
                    status?.status === "reconciling"
                      ? "active"
                      : ["reporting", "complete"].includes(
                          status?.status ?? ""
                        )
                      ? "done"
                      : "pending"
                  }
                />
                <StatusRow
                  label="Daily Report Generation"
                  state={
                    status?.status === "reporting" || status?.status === "complete"
                      ? "active"
                      : "pending"
                  }
                />
              </div>

              <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-5 text-center">
                <p className="text-sm font-medium text-slate-50">
                  We’ve got it from here.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Your Morning Tea report is being generated and will be ready
                  by <span className="font-semibold text-slate-100">5:30 AM</span>.
                  Go get some rest.
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function StatusRow({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) {
  const color =
    state === "done"
      ? "text-green-400"
      : state === "active"
      ? "text-emerald-300"
      : "text-slate-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-slate-900/80">
        {state === "done" ? (
          <span className="text-xs text-green-400">✓</span>
        ) : (
          <span
            className={`h-2 w-2 rounded-full ${
              state === "active" ? "bg-green-400 animate-ping" : "bg-slate-600"
            }`}
          />
        )}
      </div>
      <span className={`text-xs ${color}`}>{label}</span>
    </div>
  );
}
