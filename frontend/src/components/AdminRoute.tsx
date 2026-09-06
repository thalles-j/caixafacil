import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from './LoadingScreen';

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isInitializing } = useAuth();
  if (isInitializing) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}
