import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Permission, VerifyTokenResponse } from '@saas-boilerplate/shared';
import { Navigate, useNavigate } from 'react-router-dom';

import apiClient from '../lib/api';
import { authStorage, isAuthenticated } from '../lib/auth';
import '../styles/dashboard.css';

const formatPermission = (permission: Permission) =>
  permission
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export const DashboardPage = () => {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const [user, setUser] = useState(() => authStorage.getUser());
  const memberships = user?.memberships ?? [];

  const verifyQuery = useQuery({
    queryKey: ['verify'],
    queryFn: async () => {
      const token = authStorage.getAccessToken();
      if (!token) {
        throw new Error('Missing token');
      }
      const { data } = await apiClient.post<VerifyTokenResponse>('/auth/verify', { token });
      return data;
    },
    enabled: authenticated,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (verifyQuery.data?.user) {
      setUser(verifyQuery.data.user);
      authStorage.setUser(verifyQuery.data.user);
    }
  }, [verifyQuery.data]);

  const activeMembership = useMemo(() => {
    if (!user) {
      return undefined;
    }

    if (user.activeMembership) {
      return user.activeMembership;
    }

    if (user.activeMembershipId) {
      const match = memberships.find((membership) => membership.id === user.activeMembershipId);
      if (match) {
        return match;
      }
    }

    return memberships[0];
  }, [user, memberships]);

  const activeMembershipId = activeMembership?.id ?? user?.activeMembershipId;
  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  const tenantLabel =
    activeMembership?.tenantName ??
    (verifyQuery.isLoading ? 'Loading tenant…' : user ? 'No tenant assigned' : '—');
  const roleLabel =
    activeMembership?.roleName ??
    (verifyQuery.isLoading ? 'Loading role…' : user ? 'No role assigned' : '—');
  const handleSignOut = () => {
    authStorage.clear();
    setUser(null);
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
            <dt>Role</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{user?.id}</dd>
          </div>
        </dl>
      </section>
      <section className="dashboard__card">
        <h2>Tenant memberships</h2>
        {memberships.length === 0 ? (
          <p className="dashboard__empty">You haven&apos;t joined any tenants yet.</p>
        ) : (
          <div className="dashboard__table-wrapper">
            <table className="dashboard__table">
              <thead>
                <tr>
                  <th scope="col">Tenant</th>
                  <th scope="col">Role</th>
                  <th scope="col">Permissions</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const isActive = membership.id === activeMembershipId;

                  return (
                    <tr
                      key={membership.id}
                      className={isActive ? 'dashboard__table-row--active' : undefined}
                    >
                      <td>
                        <strong>{membership.tenantName}</strong>
                        <div className="dashboard__subtle">
                          {membership.tenantDomain ?? `/${membership.tenantSlug}`}
                        </div>
                      </td>
                      <td>{membership.roleName}</td>
                      <td>
                        {membership.permissions.length === 0 ? (
                          <span className="dashboard__subtle">No special permissions</span>
                        ) : (
                          <ul className="dashboard__permissions">
                            {membership.permissions.map((permission) => (
                              <li key={permission}>{formatPermission(permission)}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{new Date(membership.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
