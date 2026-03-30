import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const CpanelRoutes = lazy(() => import('./Cpanel/routes/CpanelRoutes'));
const PpanelRoutes = lazy(() => import('./Ppanel/routes/PpanelRoutes'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <Routes>
        <Route path="/cpanel/*" element={<CpanelRoutes />} />
        <Route path="/*" element={<PpanelRoutes />} />
      </Routes>
    </Suspense>
  );
}

export default App;
