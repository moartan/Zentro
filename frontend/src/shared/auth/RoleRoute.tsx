import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../AppProvider';
import AuthLoadingSkeleton from './AuthLoadingSkeleton';

type Role = 'super_admin' | 'business_owner' | 'employee';

type RoleRouteProps = {
  allowedRoles: Role[];
};

export default function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { user, isAuthLoading } = useApp();
  const location = useLocation();

  if (isAuthLoading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/cpanel" replace />;
  }

  return <Outlet />;
}
