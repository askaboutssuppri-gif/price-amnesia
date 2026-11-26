import React from 'react';

// Echo — the living memory orb. Pure code-driven fluid blob:
// morphing border-radius, drifting inner aurora, blinking eyes,
// and two orbit rings. No images, so it animates at any size.
export default function Orb({ size = 148, mood = 'calm' }: { size?: number; mood?: 'calm' | 'happy' | 'alert' }) {
  const eyeColor = mood === 'alert' ? '#ffd166' : '#eafffb';
  return (
    <div className="orb-wrap" style={{ width: size, height: size }} aria-hidden="true">
      <div className="orb-ring orb-ring-a" />
      <div className="orb-ring orb-ring-b" />
      <div className={`orb-body mood-${mood}`}>
        <div className="orb-aurora" />
        <div className="orb-eyes">
          <span className="orb-eye" style={{ background: eyeColor }} />
          <span className="orb-eye" style={{ background: eyeColor }} />
        </div>
        <div className={`orb-mouth mood-${mood}`} />
        <div className="orb-shine" />
      </div>
      <div className="orb-shadow" />
    </div>
  );
}
