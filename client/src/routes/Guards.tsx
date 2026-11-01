import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/primitives';
import type { Permission } from '@/types';

export function Splash() {
  return <div className="flex min-h-screen items-center justify-center bg-cream"><Spinner className="h-6 w-6" /></div>;
}

/** Everything inside requires a signed-in user. (The server enforces this too; this only avoids flashing empty pages.) */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-[22px] font-semibold">Chief investigators only</h1>
        <p className="mt-2 text-muted">Your role does not include access to this page. The server enforces this rule as well.</p>
      </div>
    );
  }
  return <Outlet />;
}
