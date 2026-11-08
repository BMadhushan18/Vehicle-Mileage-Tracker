import { Icon, type IconName } from './Icon';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  match: string[];
}

const MAIN: Item[] = [
  { to: '/', label: 'Home', icon: 'home', match: ['/'] },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', match: ['/calendar'] },
  { to: '/add', label: 'Add fuel', icon: 'plus', match: ['/add', '/edit'] },
  { to: '/reports', label: 'Reports', icon: 'chart', match: ['/reports'] },
  { to: '/vehicles', label: 'Vehicles', icon: 'bike', match: ['/vehicles'] },
];
const EXTRA: Item[] = [
  { to: '/history', label: 'Fuel history', icon: 'history', match: ['/history'] },
  { to: '/settings', label: 'Settings', icon: 'settings', match: ['/settings'] },
];

export function BottomNav({ path }: { path: string }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {MAIN.map((it) => {
        const active = it.match.includes(path);
        const isAdd = it.to === '/add';
        return (
          <a
            key={it.to}
            href={`#${it.to}`}
            className={`bn-item${isAdd ? ' bn-add' : ''}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bn-icon">
              <Icon name={it.icon} size={isAdd ? 28 : 22} />
            </span>
            <span className={isAdd ? 'sr-only' : 'bn-label'}>{it.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function SideNav({ path }: { path: string }) {
  return (
    <nav className="side-nav" aria-label="Main">
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        RideLog
      </div>
      <a href="#/add" className="btn btn-primary btn-block side-add">
        <Icon name="plus" /> Add fuel
      </a>
      {[...MAIN.filter((i) => i.to !== '/add'), ...EXTRA].map((it) => {
        const active = it.match.includes(path);
        return (
          <a
            key={it.to}
            href={`#${it.to}`}
            className={`sn-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={it.icon} />
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}

/** Mobile top bar: title + quick links to the screens not in the bottom bar. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="top-bar">
      <h1 className="top-title">{title}</h1>
      <div className="top-actions">
        <a href="#/history" className="icon-btn" aria-label="Fuel history">
          <Icon name="history" />
        </a>
        <a href="#/settings" className="icon-btn" aria-label="Settings">
          <Icon name="settings" />
        </a>
      </div>
    </header>
  );
}
