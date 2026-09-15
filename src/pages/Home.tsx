import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '40px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    color: 'var(--text)',
    minHeight: '200px',
    boxShadow: 'var(--shadow-sm)',
    textDecoration: 'none'
  };

  const cardDisabledStyle: React.CSSProperties = {
    ...cardStyle,
    backgroundColor: '#f3f4f6',
    boxShadow: 'none',
    cursor: 'not-allowed',
    opacity: 0.7,
  };

  return (
    <main style={{ 
      flex: 1, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '60px 24px' 
    }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: 24, 
        width: '100%'
      }}>
        
        <Link to="/party-rank" style={{ textDecoration: 'none' }}>
          <div 
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <h2 style={{ 
              fontSize: 32, 
              fontWeight: 700, 
              margin: 0, 
              letterSpacing: '-0.04em',
              color: 'var(--text)'
            }}>
              Party Rank
            </h2>
          </div>
        </Link>
        
        <div style={cardDisabledStyle}>
          <h2 style={{ 
            fontSize: 32, 
            fontWeight: 700, 
            margin: 0, 
            letterSpacing: '-0.04em',
            color: 'var(--muted)'
          }}>
            Anisongdb
          </h2>
        </div>

      </div>
    </main>
  );
}
