import React from 'react';
import Header from './Header';
import Breadcrumbs from './Breadcrumbs';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      backgroundColor: 'var(--bg)',
      color: 'var(--text)'
    }}>
      <Header />
      <Breadcrumbs />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
