import { Link, Outlet, useLocation } from 'react-router-dom';

import styles from '../styles/AuthLayout.module.css';

const titles: Record<string, string> = {
  '/login': 'Welcome back',
  '/signup': 'Create your account',
};

export const AuthLayout = () => {
  const location = useLocation();
  const title = titles[location.pathname] ?? 'Authenticate';

  return (
    <div className={styles.wrapper}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <h1>{title}</h1>
          <p>Start building your SaaS with production-ready foundations.</p>
        </header>
        <Outlet />
        <footer className={styles.footer}>
          {location.pathname === '/login' ? (
            <span>
              Need an account? <Link to="/signup">Sign up</Link>
            </span>
          ) : (
            <span>
              Already have an account? <Link to="/login">Log in</Link>
            </span>
          )}
        </footer>
      </div>
    </div>
  );
};
