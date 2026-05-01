import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { EXERCISE_INFO } from "@/utils/calories";
import type { WorkoutSession } from "@/context/WorkoutContext";

interface Props {
  session: WorkoutSession;
}

export function WorkoutSessionCard({ session }: Props) {
  const colors = useColors();
  const info = EXERCISE_INFO[session.exercise];

  const date = new Date(session.date);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

  const mins = Math.floor(session.duration / 60);
  const secs = session.duration % 60;
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + "22" }]}>
        <Feather name={info.icon as keyof typeof Feather.glyphMap} size={20} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]}>{info.name}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {session.exercise === "plank"
            ? `${durationStr} hold`
            : `${session.reps} reps · ${durationStr}`}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.calories, { color: colors.primary }]}>
          {session.calories}
        </Text>
        <Text style={[styles.calLabel, { color: colors.mutedForeground }]}>kcal</Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {dateStr} {timeStr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  calories: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  calLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  time: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
