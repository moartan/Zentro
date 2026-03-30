import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../AppProvider';
import AuthLoadingSkeleton from './AuthLoadingSkeleton';

export default function ProtectedRoute() {
  const { user, isAuthLoading } = useApp();
  const location = useLocation();

  if (isAuthLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
