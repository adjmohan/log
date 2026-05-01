import React from "react";
import * as Icons from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  color?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, unit, icon, color }) => {
  // Map icon string to Lucide component if necessary, or assume it's a key
  const IconComponent = (Icons as any)[icon.charAt(0).toUpperCase() + icon.slice(1)] || Icons.Activity;
  const accentColor = color || "var(--primary)";

  return (
    <div className="glass-container" style={{
      padding: '16px 8px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      flex: 1
    }}>
      <div style={{
        backgroundColor: `${accentColor}1a`,
        padding: '6px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <IconComponent size={16} color={accentColor} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'white' }}>
        {value}
        {unit && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted-foreground)' }}>{unit}</span>}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>{label}</div>
    </div>
  );
};
