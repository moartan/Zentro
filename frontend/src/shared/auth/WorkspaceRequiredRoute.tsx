import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../AppProvider';
import AuthLoadingSkeleton from './AuthLoadingSkeleton';

export default function WorkspaceRequiredRoute() {
  const { user, isAuthLoading } = useApp();
  const location = useLocation();

  if (isAuthLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.isPlatformSuperAdmin) {
    return <Outlet />;
  }

  const hasWorkspace = Boolean(user.businessId) || (user.memberships?.length ?? 0) > 0;
  if (!hasWorkspace) {
    // Only owners can create a workspace from this guard.
    // Members/employees should not be redirected into workspace creation flow.
    if (user.role === 'employee') {
      return <Outlet />;
    }
    return <Navigate to="/workspace/create" replace />;
  }

  return <Outlet />;
}
