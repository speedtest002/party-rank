import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';

const Header = () => {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const handleLogin = () => {
    clerk.openSignIn({ strategy: 'oauth_discord' });
  };

  return (
    <header className="top-header">
      <div className="top-header-inner" style={{ 
        height: 60, 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 24px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%'
      }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em' }}>PartyRank</span>
        </Link>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isLoaded ? (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading...</span>
          ) : isSignedIn ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {user?.imageUrl && (
                  <img 
                    src={user.imageUrl} 
                    alt="avatar" 
                    style={{ width: 32, height: 32, borderRadius: '50%' }} 
                  />
                )}
                <span style={{ fontSize: 14, fontWeight: 500 }}>{user?.fullName || 'User'}</span>
              </div>
              <button 
                onClick={() => signOut()} 
                className="btn" 
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)' }}
              >
                Logout
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogin} 
              className="btn btn-discord" 
              style={{ padding: '10px 20px', fontSize: 13 }}
            >
              <svg 
                width="18" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                style={{ marginRight: '4px' }}
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.125-.094.249-.192.37-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.419-2.157 2.419z"/>
              </svg>
              Login with Discord
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
