import React from 'react';

export const MainCard: React.FC<React.PropsWithChildren> = ({children}) => {
  return (
    <div style={{
      width: '84%',
      maxWidth: 1180,
      height: '82%',
      borderRadius: 20,
      background: '#fcfcfa',
      border: '1px solid rgba(58,57,52,0.10)',
      boxShadow: '0 18px 42px rgba(48,46,39,0.13)',
      padding: '20px 20px 18px',
      overflow: 'hidden',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {children}
    </div>
  );
};
