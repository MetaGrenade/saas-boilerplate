import { useQuery } from '@tanstack/react-query';
import type { VerifyTokenResponse } from '@saas-boilerplate/shared';
import { Navigate, useNavigate } from 'react-router-dom';

import apiClient from '../lib/api';
import { authStorage, isAuthenticated } from '../lib/auth';
import '../styles/dashboard.css';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const user = authStorage.getUser();

  const verifyQuery = useQuery({
    queryKey: ['verify', user?.id],
    queryFn: async () => {
      const token = authStorage.getAccessToken();
      if (!token) {
        throw new Error('Missing token');
      }
      const { data } = await apiClient.post<VerifyTokenResponse>('/auth/verify', { token });
      return data;
    },
    enabled: isAuthenticated()
  });

  const tenantLabel = user?.tenantId ?? 'Unknown tenant';

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const handleSignOut = () => {
    authStorage.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>Welcome{user?.name ? `, ${user.name}` : ''}!</h1>
          <p>You&apos;re ready to start building your SaaS product.</p>
        </div>
        <button className="dashboard__signout" onClick={handleSignOut}>
          Sign out
        </button>
      </header>
      <section className="dashboard__card">
        <h2>Account overview</h2>
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Tenant</dt>
            <dd>{tenantLabel}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{user?.id}</dd>
          </div>
        </dl>
      </section>
      <section className="dashboard__card">
        <h2>Token status</h2>
        {verifyQuery.isLoading && <p>Validating your session…</p>}
        {verifyQuery.isSuccess && (
          <div className="dashboard__token">
            <code>{JSON.stringify(verifyQuery.data.payload, null, 2)}</code>
          </div>
        )}
        {verifyQuery.isError && (
          <p className="dashboard__error">
            We could not validate your token. Try signing in again.
          </p>
        )}
      </section>
    </div>
  );
};
