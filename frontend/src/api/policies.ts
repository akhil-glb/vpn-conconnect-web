import apiClient from './client';
import type { Policy } from '../types';

export async function getPolicies(): Promise<Policy[]> {
  const response = await apiClient.get<Policy[]>('/policies');
  return response.data;
}

export async function getPolicy(id: string): Promise<Policy> {
  const response = await apiClient.get<Policy>(`/policies/${id}`);
  return response.data;
}

export async function createPolicy(data: Omit<Policy, 'id' | 'orgId' | 'version' | 'updatedAt'>): Promise<Policy> {
  const response = await apiClient.post<Policy>('/policies', data);
  return response.data;
}

export async function updatePolicy(
  id: string,
  data: Partial<Omit<Policy, 'id' | 'orgId' | 'version' | 'updatedAt'>>
): Promise<Policy> {
  const response = await apiClient.put<Policy>(`/policies/${id}`, data);
  return response.data;
}

export async function deletePolicy(id: string): Promise<void> {
  await apiClient.delete(`/policies/${id}`);
}
