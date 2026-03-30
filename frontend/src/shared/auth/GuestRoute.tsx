import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../AppProvider';
import AuthLoadingSkeleton from './AuthLoadingSkeleton';

export default function GuestRoute() {
  const { user, isAuthLoading } = useApp();

  if (isAuthLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (user) {
    const hasWorkspace = user.isPlatformSuperAdmin || Boolean(user.businessId) || (user.memberships?.length ?? 0) > 0;
    return <Navigate to={hasWorkspace ? '/cpanel' : '/workspace/create'} replace />;
  }

  return <Outlet />;
}
