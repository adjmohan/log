import React, { useEffect, useMemo, useState } from "react";
import { Activity, Dumbbell, Flame, Footprints, Trophy, Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getDashboardSummary, type DashboardSummary } from "../api/fitness";
import { useWorkout } from "../contexts/WorkoutContext";
import { aggregateFitnessRange, FITNESS_STORAGE_UPDATED_EVENT } from "../services/fitnessStorage";

type RangeTab = "today" | "week" | "month";

const tabLabel: Record<RangeTab, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

const mergeWithLocalFitness = (remote: DashboardSummary): DashboardSummary => {
  const localToday = aggregateFitnessRange("today");
  const localWeek = aggregateFitnessRange("week");
  const localMonth = aggregateFitnessRange("month");

  const localTodaySteps = localToday.walkingSteps + localToday.runningSteps;
  const localTodayCalories = localToday.walkingCalories + localToday.runningCalories;
  const localWeekSteps = localWeek.walkingSteps + localWeek.runningSteps;
  const localWeekCalories = localWeek.walkingCalories + localWeek.runningCalories;
  const localMonthSteps = localMonth.walkingSteps + localMonth.runningSteps;
  const localMonthCalories = localMonth.walkingCalories + localMonth.runningCalories;

  const localActivity =
    localToday.runningSteps > localToday.walkingSteps
      ? "Running"
      : localTodaySteps > 0
        ? "Walking"
        : "Idle";

  return {
    today: {
      steps: Math.max(remote.today.steps || 0, localTodaySteps),
      calories: Math.max(remote.today.calories || 0, localTodayCalories),
      activity: remote.today.activity || localActivity,
    },
    week: {
      steps: Math.max(remote.week.steps || 0, localWeekSteps),
      calories: Math.max(remote.week.calories || 0, localWeekCalories),
    },
    month: {
      steps: Math.max(remote.month.steps || 0, localMonthSteps),
      calories: Math.max(remote.month.calories || 0, localMonthCalories),
    },
  };
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { totalCaloriesToday, totalRepsToday } = useWorkout();
  const [userName, setUserName] = useState("Athlete");
  const [range, setRange] = useState<RangeTab>("today");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>({
    today: { steps: 0, calories: 0, activity: "Idle" },
    week: { steps: 0, calories: 0 },
    month: { steps: 0, calories: 0 },
  });

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!user) return;
      try {
        const rawProfile = localStorage.getItem("profile");
        const profile = rawProfile ? JSON.parse(rawProfile) : null;
        if (mounted && profile?.name) {
          setUserName(profile.name);
        } else if (mounted && user.displayName) {
          setUserName(user.displayName);
        }
      } catch (err) {
        console.error("Profile load error:", err);
      }
    };

    const refreshSummary = async () => {
      if (!mounted || !user) return;
      try {
        const data = await getDashboardSummary(user.uid);
        if (mounted) {
          setSummary(mergeWithLocalFitness(data));
        }
      } catch (error) {
        console.error("Dashboard API load error:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    refreshSummary().catch(() => {
      // Keep current summary values on refresh error.
    });

    const refreshTimer = window.setInterval(() => {
      refreshSummary().catch(() => {
        // Keep current summary values on refresh error.
      });
    }, 5000);

    const onLocalFitnessUpdate = () => {
      if (!mounted) {
        return;
      }

      setSummary((prev) => mergeWithLocalFitness(prev));
      setLoading(false);
    };

    window.addEventListener(FITNESS_STORAGE_UPDATED_EVENT, onLocalFitnessUpdate as EventListener);
    window.addEventListener("storage", onLocalFitnessUpdate);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener(FITNESS_STORAGE_UPDATED_EVENT, onLocalFitnessUpdate as EventListener);
      window.removeEventListener("storage", onLocalFitnessUpdate);
    };
  }, [user]);

  const activeData = useMemo(() => summary[range], [summary, range]);

  const totalCalories = useMemo(() => {
    return (activeData.calories || 0) + (range === 'today' ? totalCaloriesToday : 0);
  }, [activeData, totalCaloriesToday, range]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#02070D] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#4EF2B6]"></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 120px" }}>
      <header style={{ marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 14, color: "#94A3B8", fontWeight: 600 }}>Fitness Dashboard</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 30, color: "#F8FAFC", fontWeight: 800 }}>{userName}</h1>
      </header>

      <div
        style={{
          borderRadius: 18,
          padding: 18,
          background: "linear-gradient(130deg, #07352C 0%, #04121D 100%)",
          border: "1px solid rgba(78,242,182,0.3)",
          marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, color: "#A7F3D0", fontSize: 13, fontWeight: 700 }}>{tabLabel[range]} Total Calories</p>
        <p style={{ margin: "6px 0 0", fontSize: 44, lineHeight: 1, color: "#4EF2B6", fontWeight: 900 }}>
          {totalCalories.toFixed(1)}
        </p>
        <p style={{ margin: "4px 0 0", color: "#CFFAFE", fontSize: 13 }}>Walking + Running + Workout</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {(["today", "week", "month"] as RangeTab[]).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            style={{
              height: 42,
              borderRadius: 12,
              border: key === range ? "1px solid rgba(78,242,182,0.65)" : "1px solid rgba(255,255,255,0.12)",
              color: key === range ? "#4EF2B6" : "#CBD5E1",
              background: key === range ? "rgba(78,242,182,0.14)" : "rgba(255,255,255,0.04)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {tabLabel[key]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            borderRadius: 16,
            padding: 14,
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ margin: 0, color: "#F8FAFC", fontWeight: 700 }}>Walking</p>
            <Footprints size={18} color="#7DD3FC" />
          </div>
            <p style={{ margin: 0, color: "#E2E8F0", fontSize: 15 }}>Steps: {activeData.steps || 0}</p>
          <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 13 }}>
              Calories: {(activeData.calories || 0).toFixed(1)} kcal
          </p>
        </div>

        <div
          style={{
            borderRadius: 16,
            padding: 14,
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ margin: 0, color: "#F8FAFC", fontWeight: 700 }}>Running</p>
            <Activity size={18} color="#F59E0B" />
          </div>
          <p style={{ margin: 0, color: "#E2E8F0", fontSize: 15 }}>Activity: {summary.today.activity || "Idle"}</p>
          <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 13 }}>
            Source: Backend totals
          </p>
        </div>

        <div
          style={{
            borderRadius: 16,
            padding: 14,
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ margin: 0, color: "#F8FAFC", fontWeight: 700 }}>AI Workout</p>
            <Dumbbell size={18} color="#4EF2B6" />
          </div>
          <p style={{ margin: 0, color: "#E2E8F0", fontSize: 15 }}>Reps Today: {totalRepsToday}</p>
          <p style={{ margin: "4px 0 0", color: "#94A3B8", fontSize: 13 }}>
            Calories: {totalCaloriesToday.toFixed(1)} kcal
          </p>
          <div style={{ marginTop: 10, display: "flex", gap: 10, color: "#A5B4FC", fontSize: 13 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Trophy size={14} /> AI Verified
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Flame size={14} /> High Intensity
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '16px', background: 'rgba(78, 242, 182, 0.05)', borderRadius: '12px', border: '1px dashed rgba(78, 242, 182, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Settings size={16} color="#4EF2B6" />
              <p style={{ margin: 0, color: '#4EF2B6', fontSize: '14px', fontWeight: '600' }}>Permission Manager</p>
          </div>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '12px', lineHeight: '1.4' }}>
              To ensure steps and tracking work correctly, please verify that <strong>Motion & Fitness</strong> and <strong>Camera</strong> permissions are set to <strong>"Allow"</strong> in your device settings.
          </p>
      </div>
    </div>
  );
};

export default Dashboard;
