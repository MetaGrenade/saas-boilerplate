import { useMutation } from '@tanstack/react-query';
import type { AuthResponse } from '@saas-boilerplate/shared';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../lib/api';
import { authStorage, isAuthenticated } from '../lib/auth';
import styles from '../styles/AuthLayout.module.css';

interface SignupFormState {
  email: string;
  password: string;
  tenantName: string;
  name: string;
}

export const SignupPage = () => {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const [form, setForm] = useState<SignupFormState>({
    email: '',
    password: '',
    tenantName: '',
    name: '',
  });

  useEffect(() => {
    if (authenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authenticated, navigate]);

  const mutation = useMutation({
    mutationFn: async (values: SignupFormState) => {
      const { data } = await apiClient.post<AuthResponse>('/auth/register', values);
      return data;
    },
    onSuccess: (data) => {
      authStorage.persist(data);
      navigate('/dashboard');
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(form);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        Full name
        <input
          type="text"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Ada Lovelace"
        />
      </label>
      <label>
        Company or workspace name
        <input
          type="text"
          value={form.tenantName}
          onChange={(event) => setForm((prev) => ({ ...prev, tenantName: event.target.value }))}
          required
          placeholder="Acme Inc."
        />
      </label>
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
        {mutation.isPending ? 'Creating account…' : 'Create account'}
      </button>
      {mutation.isError && (
        <p className={styles.error}>We couldn&apos;t create your account. Try again.</p>
      )}
    </form>
  );
};
