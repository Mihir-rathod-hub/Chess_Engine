import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute({ session, loadingSession }) {
  if (loadingSession) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        height: '100dvh',
        backgroundColor: '#09090B',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit', sans-serif"
      }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '1px', color: '#A1A1AA' }}>
          Restoring Session...
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
}
