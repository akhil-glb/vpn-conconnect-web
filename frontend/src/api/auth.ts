import apiClient from './client';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    orgId: string | null;
  };
}

interface RefreshResponse {
  token: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function refresh(): Promise<RefreshResponse> {
  const response = await apiClient.post<RefreshResponse>('/auth/refresh');
  return response.data;
}
