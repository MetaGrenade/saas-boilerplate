import { useMutation } from '@tanstack/react-query';
import type { AuthResponse } from '@saas-boilerplate/shared';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../lib/api';
import { authStorage, isAuthenticated } from '../lib/auth';
import styles from '../styles/AuthLayout.module.css';

interface LoginFormState {
  email: string;
  password: string;
}

export const LoginPage = () => {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const [form, setForm] = useState<LoginFormState>({ email: '', password: '' });

  useEffect(() => {
    if (authenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authenticated, navigate]);

  const mutation = useMutation({
    mutationFn: async (values: LoginFormState) => {
      const { data } = await apiClient.post<AuthResponse>('/auth/login', values);
      return data;
    },
    onSuccess: (data) => {
      authStorage.persist(data);
      navigate('/dashboard');
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(form);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
          minLength={8}
        />
      </label>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Signing in…' : 'Sign in'}
      </button>
      {mutation.isError && (
        <p className={styles.error}>Unable to sign in. Check your credentials and try again.</p>
      )}
    </form>
  );
};
