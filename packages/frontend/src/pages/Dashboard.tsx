import { useEffect, useState } from 'react';

function Dashboard() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    setAccessToken(localStorage.getItem('accessToken'));
  }, []);

  return (
    <section className="dashboard">
      <h1>Dashboard</h1>
      <p>
        You are ready to start building your SaaS. Hook up this dashboard to your backend APIs and
        start shipping features.
      </p>
      {accessToken ? (
        <p className="success">You are logged in. Your access token is stored locally.</p>
      ) : (
        <p className="warning">Sign in to access tenant data and protected resources.</p>
      )}
    </section>
  );
}

export default Dashboard;
