import React, { useState, useEffect } from "react";
import {
  User,
  Edit2,
  LogOut,
  Check,
  Camera
} from "lucide-react";
import { auth } from "../firebase/config";
import { getUserProfile, updateUserProfile, getWorkoutSessions } from "../api/db";
import type { UserProfile, WorkoutSession } from "../types/user";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { clearUserSession } from "../services/sessionStorage";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Edit states
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");
  const [goal, setGoal] = useState("");

  const GOALS = ["Build Muscle", "Lose Weight", "Stay Fit", "Endurance", "Flexibility"];

  useEffect(() => {
    const fetchData = async () => {
      if (auth.currentUser) {
        try {
          const profile = await getUserProfile(auth.currentUser.uid);
          const workoutData = await getWorkoutSessions(auth.currentUser.uid);
          if (profile) {
            setUserProfile(profile);
            setName(profile.name);
            setWeight(String(profile.weight));
            setHeight(String(profile.height));
            setAge(String(profile.age));
            setGoal(profile.goal || "");
          }
          setSessions(workoutData);
        } catch (error) {
          console.error("Error fetching profile data:", error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchData();
  }, []);

  const totalCalories = sessions.reduce((sum, s) => sum + s.calories, 0);
  const totalReps = sessions.reduce((sum, s) => sum + (s.reps || 0), 0);
  const uniqueDays = new Set(
    sessions.map((s) => {
        const date = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
        return date.toDateString();
    })
  ).size;

  const saveProfile = async () => {
    if (!auth.currentUser || !userProfile) return;
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseInt(age);
    try {
      await updateUserProfile(auth.currentUser.uid, {
        name: name.trim(),
        weight: w,
        height: h,
        age: a,
        goal,
      });
      setUserProfile({ ...userProfile, name: name.trim(), weight: w, height: h, age: a, goal });
      setEditing(false);
    } catch (error) {
      alert("Failed to update profile.");
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to sign out?")) {
      try {
        await signOut(auth);
        await clearUserSession();
        navigate("/login");
      } catch (error) {
        console.error("Error signing out:", error);
      }
    }
  };

  const bmi = parseFloat(weight) / ((parseFloat(height) / 100) ** 2);
  const bmiLabel = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";

  if (loading) return null;

  return (
    <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto', paddingBottom: '120px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'white' }}>Profile</h1>
        <button
          onClick={editing ? saveProfile : () => setEditing(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#94A3B8',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {editing ? <Check size={18} /> : <Edit2 size={18} />}
          {editing ? "Save" : "Edit"}
        </button>
      </header>

      {/* Profile Card */}
      <div className="glass-container" style={{
        padding: '32px 24px',
        marginBottom: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(18, 24, 33, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        textAlign: 'center'
      }}>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            backgroundColor: 'rgba(55, 233, 192, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(55, 233, 192, 0.2)'
          }}>
            <User size={48} color="#37E9C0" />
          </div>
          <div style={{
            position: 'absolute',
            bottom: '0',
            right: '0',
            width: '28px',
            height: '28px',
            backgroundColor: 'rgba(55, 233, 192, 0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(55, 233, 192, 0.3)'
          }}>
            <Camera size={14} color="#37E9C0" />
          </div>
        </div>

        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #37E9C0',
              color: 'white',
              fontSize: '28px',
              fontWeight: 700,
              textAlign: 'center',
              width: '100%',
              marginBottom: '8px',
              outline: 'none'
            }}
          />
        ) : (
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: 'white', margin: '0 0 4px' }}>{userProfile?.name}</h2>
        )}
        <p style={{ color: '#37E9C0', fontSize: '15px', fontWeight: 600, margin: 0 }}>{goal || 'Build Muscle'}</p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <SummaryStat label="kcal burned" value={Math.round(totalCalories)} color="#37E9C0" />
        <SummaryStat label="total reps" value={totalReps} color="#FFB800" />
        <SummaryStat label="active days" value={uniqueDays} color="#8B5CF6" />
      </div>

      {/* Body Metrics */}
      <div className="glass-container" style={{
        padding: '24px',
        marginBottom: '24px',
        background: 'rgba(18, 24, 33, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'white', margin: '0 0 20px' }}>Body Metrics</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MetricItem
            label="Weight"
            value={editing ? undefined : `${userProfile?.weight} kg`}
            editing={editing}
            editValue={weight}
            onEdit={setWeight}
            suffix="kg"
          />
          <MetricItem
            label="Height"
            value={editing ? undefined : `${userProfile?.height} cm`}
            editing={editing}
            editValue={height}
            onEdit={setHeight}
            suffix="cm"
          />
          <MetricItem
            label="Age"
            value={editing ? undefined : `${userProfile?.age} years`}
            editing={editing}
            editValue={age}
            onEdit={setAge}
            suffix="years"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ color: '#94A3B8', fontSize: '15px', fontWeight: 500 }}>BMI</span>
            <span style={{ color: 'white', fontSize: '15px', fontWeight: 700 }}>
              {bmi.toFixed(1)} <span style={{ color: '#37E9C0', marginLeft: '4px' }}>({bmiLabel})</span>
            </span>
          </div>
        </div>
      </div>

      {editing && (
        <div className="glass-container" style={{
          padding: '24px',
          marginBottom: '24px',
          background: 'rgba(18, 24, 33, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'white', margin: '0 0 20px' }}>Fitness Goal</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  backgroundColor: goal === g ? '#37E9C0' : 'rgba(255, 255, 255, 0.05)',
                  color: goal === g ? '#050B15' : '#94A3B8',
                  border: '1px solid',
                  borderColor: goal === g ? '#37E9C0' : 'rgba(255, 255, 255, 0.1)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '20px',
          backgroundColor: 'rgba(255, 75, 99, 0.1)',
          border: '1px solid rgba(255, 75, 99, 0.2)',
          color: '#FF4B63',
          fontSize: '16px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: 'pointer',
          marginTop: '12px'
        }}
      >
        <LogOut size={20} />
        Sign Out
      </button>
    </div>
  );
};

const SummaryStat = ({ label, value, color }: any) => (
  <div className="glass-container" style={{ padding: '16px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
    <div style={{ fontSize: '24px', fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600, textTransform: 'none' }}>{label}</div>
  </div>
);

const MetricItem = ({ label, value, editing, editValue, onEdit, suffix }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ color: '#94A3B8', fontSize: '15px', fontWeight: 500 }}>{label}</span>
    {editing ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          value={editValue}
          onChange={(e) => onEdit(e.target.value)}
          style={{ background: 'none', border: 'none', borderBottom: '1px solid #37E9C0', color: 'white', width: '60px', textAlign: 'right', outline: 'none' }}
        />
        <span style={{ color: '#64748B', fontSize: '12px' }}>{suffix}</span>
      </div>
    ) : (
      <span style={{ color: 'white', fontSize: '15px', fontWeight: 700 }}>{value}</span>
    )}
  </div>
);

export default Profile;
