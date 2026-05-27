import apiClient from './client';
import type { Group } from '../types';

export async function getGroups(): Promise<Group[]> {
  const response = await apiClient.get<Group[]>('/groups');
  return response.data;
}

export async function createGroup(data: { name: string; policyId: string }): Promise<Group> {
  const response = await apiClient.post<Group>('/groups', data);
  return response.data;
}

export async function updateGroup(
  id: string,
  data: { name?: string; policyId?: string }
): Promise<Group> {
  const response = await apiClient.put<Group>(`/groups/${id}`, data);
  return response.data;
}

export async function deleteGroup(id: string): Promise<void> {
  await apiClient.delete(`/groups/${id}`);
}

export async function assignDevices(groupId: string, deviceIds: string[]): Promise<void> {
  await apiClient.post(`/groups/${groupId}/devices/batch`, { deviceIds });
}

export async function removeDevice(groupId: string, deviceId: string): Promise<void> {
  await apiClient.delete(`/groups/${groupId}/devices/${deviceId}`);
}
