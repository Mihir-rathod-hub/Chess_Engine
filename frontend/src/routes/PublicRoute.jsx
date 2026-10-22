import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export default function PublicRoute({ session, loadingSession }) {
  if (loadingSession) {
    return null;
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
