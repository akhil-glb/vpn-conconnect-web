import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
const baseURL = `${base}/api/v1`;

const apiClient = axios.create({ baseURL });

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Extract org slug from hostname — first segment before the first dot
  const hostname = window.location.hostname;
  const orgSlug = hostname.split('.')[0] ?? '';
  if (orgSlug) {
    config.headers['X-Org-Slug'] = orgSlug;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
