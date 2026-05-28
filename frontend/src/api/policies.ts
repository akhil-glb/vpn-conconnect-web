import apiClient from './client';
import type { Policy } from '../types';

export async function getPolicies(): Promise<Policy[]> {
  const response = await apiClient.get<{ policies: Policy[] }>('/policies');
  return response.data.policies;
}

export async function getPolicy(id: string): Promise<Policy> {
  const response = await apiClient.get<{ policy: Policy }>(`/policies/${id}`);
  return response.data.policy;
}

type PolicyCreateData = Omit<Policy, 'id' | 'orgId' | 'version' | 'updatedAt' | 'adminPinHash'> & {
  adminPin?: string | null;
};
type PolicyUpdateData = Partial<Omit<Policy, 'id' | 'orgId' | 'version' | 'updatedAt' | 'adminPinHash'>> & {
  adminPin?: string | null;
};

export async function createPolicy(data: PolicyCreateData): Promise<Policy> {
  const response = await apiClient.post<{ policy: Policy }>('/policies', data);
  return response.data.policy;
}

export async function updatePolicy(id: string, data: PolicyUpdateData): Promise<Policy> {
  const response = await apiClient.put<{ policy: Policy }>(`/policies/${id}`, data);
  return response.data.policy;
}

export async function deletePolicy(id: string): Promise<void> {
  await apiClient.delete(`/policies/${id}`);
}
