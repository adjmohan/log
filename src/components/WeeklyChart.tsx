import React from "react";

interface WeeklyChartProps {
  data: number[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WeeklyChart: React.FC<WeeklyChartProps> = ({ data }) => {
  const max = Math.max(...data, 1);

  return (
    <div className="glass-container" style={{
      padding: '24px',
      marginBottom: '24px',
      border: '1px solid rgba(255, 255, 255, 0.05)'
    }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 24px', color: 'white' }}>Weekly Calories</h3>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: '100px',
        padding: '0 4px',
        marginBottom: '16px'
      }}>
        {data.map((val, i) => {
          const height = (val / max) * 100;
          const isToday = i === 6;
          return (
            <div key={i} style={{
              width: '10%',
              height: `${Math.max(height, 5)}%`,
              backgroundColor: isToday ? 'var(--primary)' : 'rgba(55, 233, 192, 0.2)',
              borderRadius: '4px',
              transition: 'height 0.3s ease',
              position: 'relative'
            }}>
              {val > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '9px',
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap'
                }}>
                  {Math.round(val)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '11px', fontWeight: 600 }}>
        {DAYS.map((d, i) => (
          <span key={i} style={{ color: i === 6 ? 'white' : '#64748B' }}>{d}</span>
        ))}
      </div>
    </div>
  );
};
