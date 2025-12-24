"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabaseClient";
import type { UploadSource, DailyUpload, Profile, UploadSlot } from "@/lib/types";

type Stage = "auth" | "onboarding" | "upload" | "processing";

const UPLOAD_SLOTS: UploadSlot[] = [
  { source: 'UberEats', label: 'Uber Eats', key: 'ubereats_ready', color: 'from-green-500 to-green-600' },
  { source: 'DoorDash', label: 'DoorDash', key: 'doordash_ready', color: 'from-red-500 to-red-600' },
  { source: 'Grubhub', label: 'Grubhub', key: 'grubhub_ready', color: 'from-orange-400 to-orange-500' },
  { source: 'Offline', label: 'Offline Sales', key: 'offline_ready', color: 'from-slate-600 to-slate-700' },
];

export default function Home() {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>("auth");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true); // NEW: Track initialization
  const [error, setError] = useState<string | null>(null);
  
  // Onboarding
  const [restaurantName, setRestaurantName] = useState("");
  
  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState<Record<UploadSource, File | null>>({
    UberEats: null,
    DoorDash: null,
    Grubhub: null,
    Offline: null,
  });
  const [dailyUpload, setDailyUpload] = useState<DailyUpload | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Restore session ONLY on mount
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          setUserId(session.user.id);
          await loadProfile(session.user.id);
        } else {
          // No session - stay on auth page
          setStage("auth");
        }
      } catch (err) {
        console.error("Session restore error:", err);
        setStage("auth");
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, []); // Empty dependency array - runs ONLY once

  const loadProfile = async (uid: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      if (profileError) {
        console.error("Profile error:", profileError);
        setStage("onboarding");
        return;
      }

      if (!profileData) {
        setStage("onboarding");
        return;
      }

      setProfile(profileData);
      setRestaurantName(profileData.restaurant_name);
      await loadTodayUpload(uid, profileData.restaurant_name);
    } catch (err) {
      console.error("Load profile error:", err);
      setStage("onboarding");
    }
  };

  const loadTodayUpload = async (uid: string, restName: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from("daily_uploads")
        .select("*")
        .eq("user_id", uid)
        .eq("restaurant_name", restName)
        .eq("upload_date", today)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error("Daily upload error:", error);
      }

      if (data) {
        setDailyUpload(data);
        if (data.processing_status === 'processing' || data.processing_status === 'completed') {
          setStage("processing");
        } else {
          setStage("upload");
        }
      } else {
        setStage("upload");
      }
    } catch (err) {
      console.error("Load today upload error:", err);
      setStage("upload");
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
        
        if (data.user) {
          setUserId(data.user.id);
          await loadProfile(data.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        if (data.user) {
          setUserId(data.user.id);
          setStage("onboarding");
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOnboarding = async () => {
    if (!userId || !restaurantName.trim()) {
      setError("Please enter a restaurant name");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          restaurant_name: restaurantName.trim(),
          updated_at: new Date().toISOString(),
        });
      
      if (error) throw error;
      
      setProfile({ 
        id: userId, 
        restaurant_name: restaurantName.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      await loadTodayUpload(userId, restaurantName.trim());
    } catch (e: any) {
      setError(e.message ?? "Failed to save restaurant name");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (source: UploadSource, file: File | null) => {
    setUploadedFiles(prev => ({ ...prev, [source]: file }));
  };

  const handleUploadSource = async (source: UploadSource) => {
    const file = uploadedFiles[source];
    if (!file || !userId || !profile) {
      setError("Missing file or profile information");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const path = `${profile.restaurant_name}/${today}/${source}.csv`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("raw-uploads")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get the corresponding boolean key
      const slot = UPLOAD_SLOTS.find(s => s.source === source);
      if (!slot) return;

      // Upsert daily_uploads record
      const { data: uploadData, error: upsertError } = await supabase
        .from("daily_uploads")
        .upsert({
          user_id: userId,
          restaurant_name: profile.restaurant_name,
          upload_date: today,
          [slot.key]: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'restaurant_name,upload_date',
        })
        .select()
        .single();

      if (upsertError) throw upsertError;
      
      setDailyUpload(uploadData);
      
      // Clear uploaded file
      setUploadedFiles(prev => ({ ...prev, [source]: null }));
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStartProcessing = async () => {
    if (!dailyUpload || !userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase
        .from("daily_uploads")
        .update({ processing_status: 'processing' })
        .eq('id', dailyUpload.id);
      
      if (error) throw error;
      
      setDailyUpload(prev => prev ? { ...prev, processing_status: 'processing' } : null);
      setStage("processing");
      
      // Simulate processing stages
      setTimeout(async () => {
        await supabase
          .from("daily_uploads")
          .update({ processing_status: 'completed' })
          .eq('id', dailyUpload.id);
        setDailyUpload(prev => prev ? { ...prev, processing_status: 'completed' } : null);
      }, 8000);
    } catch (e: any) {
      setError(e.message ?? "Failed to start processing");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setStage("auth");
    setUploadedFiles({ UberEats: null, DoorDash: null, Grubhub: null, Offline: null });
    setDailyUpload(null);
    setProfile(null);
    setEmail("");
    setPassword("");
    setRestaurantName("");
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  const readySourcesCount = dailyUpload 
    ? [dailyUpload.ubereats_ready, dailyUpload.doordash_ready, dailyUpload.grubhub_ready, dailyUpload.offline_ready].filter(Boolean).length
    : 0;

  // Show loading state while initializing
  if (initializing) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-slate-400 text-sm">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
        <div className="flex w-full justify-between text-xs text-slate-500">
          <a
            href="https://synlitics.com"
            className="hover:text-slate-300 transition"
          >
            ← Back to synlitics.com
          </a>
          {userId && (
            <div className="flex items-center gap-4">
              {profile && (
                <span className="text-slate-400">
                  {profile.restaurant_name}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="rounded-full border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
              >
                Log Out
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* AUTH STAGE */}
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
                  onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm outline-none ring-0 focus:border-orange-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleAuth}
                  disabled={loading || !email || !password}
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
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
                >
                  {authMode === "login"
                    ? "New here? Create a Synlitics account."
                    : "Already have an account? Log in."}
                </button>
              </div>
            </motion.section>
          )}

          {/* ONBOARDING STAGE */}
          {stage === "onboarding" && (
            <motion.section
              key="onboarding"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.25 }}
              className="glass-card w-full rounded-2xl px-8 py-10"
            >
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">
                Setup · Restaurant Profile
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-50">
                What's your restaurant name?
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                This will be used to organize your data exports.
              </p>

              <div className="mt-6 space-y-4">
                <input
                  type="text"
                  placeholder="e.g., Joe's Pizza Downtown"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm outline-none ring-0 focus:border-orange-500"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOnboarding()}
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleOnboarding}
                  disabled={loading || !restaurantName.trim()}
                  className="mt-2 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Saving..." : "Continue to Upload"}
                </button>
              </div>
            </motion.section>
          )}

          {/* UPLOAD STAGE */}
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
                Upload today's data sources
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Upload any combination of sources. None are mandatory.
              </p>

              <div className="mt-6 space-y-3">
                {UPLOAD_SLOTS.map((slot) => (
                  <UploadSlotComponent
                    key={slot.source}
                    slot={slot}
                    file={uploadedFiles[slot.source]}
                    isReady={dailyUpload?.[slot.key] ?? false}
                    onFileSelect={(file) => handleFileSelect(slot.source, file)}
                    onUpload={() => handleUploadSource(slot.source)}
                    loading={loading}
                  />
                ))}
              </div>

              {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

              {readySourcesCount > 0 && (
                <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="text-xs text-slate-400">
                    {readySourcesCount} of 4 sources uploaded today
                  </p>
                  <button
                    onClick={handleStartProcessing}
                    disabled={loading}
                    className="mt-3 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-orange-500 to-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Starting..." : "Start Processing All Sources"}
                  </button>
                </div>
              )}
            </motion.section>
          )}

          {/* PROCESSING STAGE */}
          {stage === "processing" && dailyUpload && (
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
                Your data is inside the Synlitics engine.
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Processing {readySourcesCount} source{readySourcesCount !== 1 ? 's' : ''} for {profile?.restaurant_name}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                {UPLOAD_SLOTS.map((slot) => (
                  <div
                    key={slot.source}
                    className={`rounded-lg border px-3 py-2 ${
                      dailyUpload[slot.key]
                        ? 'border-green-500/30 bg-green-500/10 text-green-400'
                        : 'border-white/10 bg-slate-900/40 text-slate-600'
                    }`}
                  >
                    <span className="mr-2">
                      {dailyUpload[slot.key] ? '✓' : '○'}
                    </span>
                    {slot.label}
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3 text-sm">
                <StatusRow label="Files Uploaded Securely" state="done" />
                <StatusRow
                  label="AI Normalization Engine Active"
                  state={dailyUpload.processing_status === 'processing' ? 'active' : dailyUpload.processing_status === 'completed' ? 'done' : 'pending'}
                />
                <StatusRow
                  label="P&L Reconciliation"
                  state={dailyUpload.processing_status === 'completed' ? 'done' : 'pending'}
                />
                <StatusRow
                  label="Daily Report Generation"
                  state={dailyUpload.processing_status === 'completed' ? 'active' : 'pending'}
                />
              </div>

              <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-5 text-center">
                <p className="text-sm font-medium text-slate-50">
                  We've got it from here.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Your Morning Tea report is being generated and will be ready by{" "}
                  <span className="font-semibold text-slate-100">5:30 AM</span>. Go get some rest.
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function UploadSlotComponent({
  slot,
  file,
  isReady,
  onFileSelect,
  onUpload,
  loading,
}: {
  slot: UploadSlot;
  file: File | null;
  isReady: boolean;
  onFileSelect: (file: File | null) => void;
  onUpload: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isReady ? 'bg-green-400' : 'bg-slate-600'}`} />
          <span className="text-sm font-medium text-slate-100">{slot.label}</span>
        </div>
        {isReady && (
          <span className="text-xs text-green-400">✓ Uploaded</span>
        )}
      </div>
      
      {!isReady && (
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <div className="rounded-lg border border-dashed border-slate-500/60 bg-slate-900/60 px-3 py-2 text-center text-xs text-slate-400 hover:border-orange-500 hover:bg-slate-900/80 transition">
              {file ? file.name : 'Choose file'}
            </div>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
            />
          </label>
          
          {file && (
            <button
              onClick={onUpload}
              disabled={loading}
              className={`rounded-lg bg-gradient-to-r ${slot.color} px-4 py-2 text-xs font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Upload
            </button>
          )}
        </div>
      )}
    </div>
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
