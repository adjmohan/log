import React, { useState, useEffect } from "react";
import {
  Activity,
  Archive,
  Calendar,
  Flame,
} from "lucide-react";
import { auth } from "../firebase/config";
import { getWorkoutSessions } from "../api/db";
import { EXERCISE_INFO } from "../utils/calories";
import type { WorkoutSession } from "../types/user";
import type { ExerciseType } from "../types";

type FilterType = "all" | ExerciseType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pushups", label: "Push-ups" },
  { key: "squats", label: "Squats" },
  { key: "plank", label: "Plank" },
];

const History: React.FC = () => {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const fetchSessions = async () => {
      if (auth.currentUser) {
        try {
          const data = await getWorkoutSessions(auth.currentUser.uid);
          setSessions(data);
        } catch (error) {
          console.error("Error fetching sessions:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const filtered =
    filter === "all"
      ? sessions
      : sessions.filter((s) => s.exercise === filter);

  const totalCalories = sessions.reduce((sum, s) => sum + (s.calories || 0), 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps || 0), 0);

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>History</h1>
          <p style={styles.subtitle}>Track your progress over time</p>
        </header>

        {/* Summary Row */}
        <div style={styles.summaryRow}>
          <SummaryCard
            value={Math.round(totalCalories).toString()}
            label="Total kcal"
            valueColor="var(--primary)"
          />
          <SummaryCard
            value={totalReps.toString()}
            label="Total Reps"
            valueColor="#FF8C00"
          />
          <SummaryCard
            value={sessions.length.toString()}
            label="Sessions"
            valueColor="#8B5CF6"
          />
        </div>

        {/* Filter Pills */}
        <div style={styles.filterRow} className="no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                ...styles.filterPill,
                backgroundColor:
                  filter === f.key ? "var(--primary)" : "var(--muted)",
                color:
                  filter === f.key
                    ? "var(--primary-foreground)"
                    : "var(--muted-foreground)",
                border:
                  filter === f.key
                    ? "1px solid var(--primary)"
                    : "1px solid var(--border)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Session List */}
        {filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <Archive size={32} color="var(--muted-foreground)" />
            </div>
            <h3 style={styles.emptyTitle}>No sessions yet</h3>
            <p style={styles.emptyText}>Complete a workout to see it here</p>
          </div>
        ) : (
          <div style={styles.list}>
            {filtered.map((session, idx) => (
              <SessionCard key={session.id ?? idx} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function SummaryCard({
  value,
  label,
  valueColor,
}: {
  value: string;
  label: string;
  valueColor: string;
}) {
  return (
    <div style={styles.summaryCard}>
      <span style={{ ...styles.summaryValue, color: valueColor }}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
    </div>
  );
}

function SessionCard({ session }: { session: WorkoutSession }) {
  const info = EXERCISE_INFO[session.exercise as ExerciseType];

  const resolveDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (ts?.toDate) return ts.toDate();
    return new Date(ts);
  };

  const date = resolveDate(session.timestamp);
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const mins = Math.floor((session.duration || 0) / 60);
  const secs = (session.duration || 0) % 60;
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div style={styles.sessionCard} className="session-card">
      {/* Icon */}
      <div style={styles.sessionIcon}>
        <Activity size={22} color="var(--primary)" />
      </div>

      {/* Info */}
      <div style={styles.sessionInfo}>
        <span style={styles.sessionName}>
          {info?.name ?? session.exercise}
        </span>
        <div style={styles.sessionMeta}>
          <span style={styles.metaItem}>
            <Calendar size={11} style={{ marginRight: 3 }} />
            {dateStr} · {timeStr}
          </span>
          <span style={{ ...styles.metaItem, color: "#FF8C00" }}>
            <Flame size={11} color="#FF8C00" style={{ marginRight: 3 }} />
            {Math.round(session.calories)} kcal
          </span>
          {session.exercise !== "plank" && (
            <span style={styles.metaItem}>{durationStr}</span>
          )}
        </div>
      </div>

      {/* Right value */}
      <div style={styles.sessionRight}>
        <span style={styles.sessionReps}>
          {session.exercise === "plank" ? durationStr : session.reps}
        </span>
        <span style={styles.sessionRepsLabel}>
          {session.exercise === "plank" ? "hold" : "reps"}
        </span>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  loadingScreen: {
    minHeight: "100vh",
    background: "var(--background)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    minHeight: "100vh",
    background: "var(--background)",
    color: "var(--foreground)",
    paddingBottom: "100px",
  },
  inner: {
    maxWidth: "500px",
    margin: "0 auto",
    padding: "24px 16px 0",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    marginBottom: "4px",
  },
  title: {
    margin: "0 0 4px",
    fontSize: "28px",
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: 0,
    color: "var(--muted-foreground)",
    fontSize: "14px",
  },

  /* Summary */
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "10px",
  },
  summaryCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "14px 8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  },
  summaryValue: {
    fontSize: "22px",
    fontWeight: 700,
  },
  summaryLabel: {
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--muted-foreground)",
    textAlign: "center" as const,
  },

  /* Filters */
  filterRow: {
    display: "flex",
    gap: "8px",
    overflowX: "auto" as const,
    paddingBottom: "4px",
  },
  filterPill: {
    padding: "8px 18px",
    borderRadius: "20px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "background 0.2s, color 0.2s, border-color 0.2s",
    flexShrink: 0,
  },

  /* Empty */
  emptyState: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    textAlign: "center" as const,
  },
  emptyIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "var(--muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 600,
  },
  emptyText: {
    margin: 0,
    fontSize: "14px",
    color: "var(--muted-foreground)",
  },

  /* Session list */
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sessionCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    transition: "transform 0.15s, border-color 0.2s",
    cursor: "default",
  },
  sessionIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "rgba(55,233,192,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sessionInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  sessionName: {
    fontSize: "15px",
    fontWeight: 600,
    textTransform: "capitalize" as const,
  },
  sessionMeta: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap" as const,
  },
  metaItem: {
    display: "flex",
    alignItems: "center",
    fontSize: "12px",
    color: "var(--muted-foreground)",
  },
  sessionRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2px",
    flexShrink: 0,
  },
  sessionReps: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--primary)",
  },
  sessionRepsLabel: {
    fontSize: "10px",
    fontWeight: 500,
    color: "var(--muted-foreground)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
};

export default History;
