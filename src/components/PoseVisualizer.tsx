import React from 'react';
import type { ExerciseType } from '../types';

interface PoseVisualizerProps {
  exercise: ExerciseType;
  state: 'up' | 'down';
  color: string;
}

export const PoseVisualizer: React.FC<PoseVisualizerProps> = ({ exercise, state, color }) => {
  const isDown = state === 'down';

  const containerStyle: React.CSSProperties = {
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  };

  const headStyle: React.CSSProperties = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    top: '0',
  };

  const bodyStyle: React.CSSProperties = {
    width: '3px',
    height: isDown && exercise === 'squats' ? '40px' : '50px',
    borderRadius: '2px',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    top: isDown && exercise === 'squats' ? '50px' : (isDown && exercise === 'pushups' ? '30px' : '28px'),
    transition: 'all 0.3s ease',
  };

  const armLeftStyle: React.CSSProperties = {
    width: '30px',
    height: '3px',
    borderRadius: '2px',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    left: '20px',
    top: '45px',
    transform: `rotate(${isDown ? '20deg' : '60deg'})`,
    transition: 'all 0.3s ease',
    transformOrigin: 'right center',
  };

  const armRightStyle: React.CSSProperties = {
    width: '30px',
    height: '3px',
    borderRadius: '2px',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    right: '20px',
    top: '45px',
    transform: `rotate(${isDown ? '-20deg' : '-60deg'})`,
    transition: 'all 0.3s ease',
    transformOrigin: 'left center',
  };

  const legLeftStyle: React.CSSProperties = {
    width: '3px',
    height: '35px',
    borderRadius: '2px',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    left: '42px',
    bottom: '5px',
    transform: `rotate(${isDown && exercise === 'squats' ? '60deg' : '10deg'})`,
    transition: 'all 0.3s ease',
    transformOrigin: 'top center',
  };

  const legRightStyle: React.CSSProperties = {
    width: '3px',
    height: '35px',
    borderRadius: '2px',
    border: `2.5px solid ${color}`,
    position: 'absolute',
    right: '42px',
    bottom: '5px',
    transform: `rotate(${isDown && exercise === 'squats' ? '-60deg' : '-10deg'})`,
    transition: 'all 0.3s ease',
    transformOrigin: 'top center',
  };

  if (exercise === 'pushups') {
    return (
      <div style={containerStyle}>
        <div style={headStyle} />
        <div style={bodyStyle} />
        <div style={armLeftStyle} />
        <div style={armRightStyle} />
      </div>
    );
  }

  if (exercise === 'squats') {
    return (
      <div style={containerStyle}>
        <div style={headStyle} />
        <div style={bodyStyle} />
        <div style={legLeftStyle} />
        <div style={legRightStyle} />
      </div>
    );
  }

  // Plank or default
  return (
    <div style={containerStyle}>
      <div style={headStyle} />
      <div style={{
        width: '80px',
        height: '3px',
        borderRadius: '2px',
        border: `2.5px solid ${color}`,
        position: 'absolute',
        top: '55px',
      }} />
      <div style={{
        width: '3px',
        height: '25px',
        borderRadius: '2px',
        border: `2.5px solid ${color}`,
        position: 'absolute',
        left: '25px',
        top: '55px',
      }} />
      <div style={{
        width: '3px',
        height: '25px',
        borderRadius: '2px',
        border: `2.5px solid ${color}`,
        position: 'absolute',
        right: '25px',
        top: '55px',
      }} />
    </div>
  );
};
