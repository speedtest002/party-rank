import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Breadcrumbs = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  // Không hiển thị ở trang chủ
  if (pathnames.length === 0) return null;

  const breadcrumbStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    fontSize: '13px',
    color: 'var(--muted)',
    backgroundColor: 'transparent',
    margin: '0 auto',
    width: '95%',
    maxWidth: '1600px',
  };

  // Add a simple media query style (or just use className if preferred)
  if (window.innerWidth >= 1200) {
    breadcrumbStyle.width = '60%';
  }

  const linkStyle: React.CSSProperties = {
    color: 'var(--muted)',
    textDecoration: 'none',
    transition: 'color 0.2s',
  };

  const activeStyle: React.CSSProperties = {
    color: 'var(--text)',
    fontWeight: 600,
  };

  // Map các segment sang tên hiển thị đẹp hơn
  const getDisplayName = (segment: string) => {
    if (segment === 'party-rank') return 'Party rank';
    if (segment === 'master') return 'Master Dashboard';
    if (segment === 'vote') return 'Vote';
    if (segment === 'results') return 'Results';
    // Nếu là slug (thường có chữ hoa hoặc gạch ngang), giữ nguyên hoặc format
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  return (
    <nav aria-label="breadcrumb" style={breadcrumbStyle}>
      <Link to="/" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}>
        Home
      </Link>
      
      {pathnames.map((value, index) => {
        const last = index === pathnames.length - 1;
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;

        return (
          <React.Fragment key={to}>
            <span style={{ opacity: 0.5 }}>/</span>
            {last ? (
              <span style={activeStyle}>{getDisplayName(value)}</span>
            ) : (
              <Link 
                to={to} 
                style={linkStyle}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
              >
                {getDisplayName(value)}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
