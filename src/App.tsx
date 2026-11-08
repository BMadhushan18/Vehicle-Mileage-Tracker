import { Suspense, lazy } from 'react';
import { BottomNav, SideNav, TopBar } from './components/Nav';
import { SkeletonCards } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { FuelForm } from './pages/FuelForm';
import { AppProvider } from './store';
import { useRoute } from './router';

// Bigger screens are split into their own chunks.
const Reports = lazy(() => import('./pages/Reports'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const Vehicles = lazy(() => import('./pages/Vehicles'));
const History = lazy(() => import('./pages/History'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const TITLES: Record<string, string> = {
  '/': 'RideLog',
  '/add': 'Add fuel',
  '/edit': 'Edit fill-up',
  '/calendar': 'Ride calendar',
  '/reports': 'Reports',
  '/vehicles': 'Vehicles',
  '/history': 'Fuel history',
  '/settings': 'Settings',
};

function Screen({ path, query }: { path: string; query: URLSearchParams }) {
  switch (path) {
    case '/add':
      return <FuelForm key="add" />;
    case '/edit':
      return <FuelForm key={query.get('id') ?? 'edit'} editId={query.get('id')} />;
    case '/calendar':
      return <CalendarPage />;
    case '/reports':
      return <Reports />;
    case '/vehicles':
      return <Vehicles openNew={query.get('new') === '1'} />;
    case '/history':
      return <History />;
    case '/settings':
      return <SettingsPage />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const { path, query } = useRoute();
  const title = TITLES[path] ?? 'RideLog';
  return (
    <AppProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="layout">
        <SideNav path={path} />
        <div className="content">
          <TopBar title={title} />
          <main id="main" className="main" tabIndex={-1}>
            <Suspense fallback={<SkeletonCards />}>
              <Screen path={path} query={query} />
            </Suspense>
          </main>
        </div>
      </div>
      <BottomNav path={path} />
    </AppProvider>
  );
}
