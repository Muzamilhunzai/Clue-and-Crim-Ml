import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { RequireAuth, RequirePermission } from '@/routes/Guards';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import GraphPage from '@/pages/GraphPage';
import CasesList from '@/pages/CasesList';
import CaseDetail from '@/pages/CaseDetail';
import EntityList from '@/pages/EntityList';
import EntityDetail from '@/pages/EntityDetail';
import { InvestigatorDetail, InvestigatorsList } from '@/pages/Investigators';
import Activity from '@/pages/Activity';
import Settings from '@/pages/Settings';
import Lab from '@/pages/Lab';
import { ENTITY_CONFIG, type PlainType } from '@/lib/entityConfig';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="cases" element={<CasesList />} />
          <Route path="cases/:id" element={<CaseDetail />} />
          <Route path="graph" element={<GraphPage />} />
          {(Object.keys(ENTITY_CONFIG) as PlainType[]).map((t) => (
            <Route key={t} path={ENTITY_CONFIG[t].apiPath}>
              <Route index element={<EntityList type={t} />} />
              <Route path=":id" element={<EntityDetail type={t} />} />
            </Route>
          ))}
          <Route path="investigators" element={<InvestigatorsList />} />
          <Route path="investigators/:id" element={<InvestigatorDetail />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
          <Route element={<RequirePermission permission="lab:use" />}><Route path="lab" element={<Lab />} /></Route>
          <Route path="*" element={<div className="mx-auto max-w-md px-6 py-24 text-center"><h1 className="text-[22px] font-semibold">Page not found</h1><p className="mt-2 text-muted">That address does not exist in TraceNet.</p></div>} />
        </Route>
      </Route>
    </Routes>
  );
}
