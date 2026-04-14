/**
 * Backend REST API client.
 * All requests attach the JWT token from the auth store.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  // Only set Content-Type for JSON bodies (not FormData/multipart)
  if (init?.body && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface ChallengeResponse {
  nonce: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  role: 'patient' | 'doctor';
}

export interface CheckWalletResponse {
  claimed: boolean;
  role: string | null;
}

export function checkWallet(walletAddress: string): Promise<CheckWalletResponse> {
  return request(`/auth/check-wallet?wallet_address=${encodeURIComponent(walletAddress)}`);
}

export function getChallenge(walletAddress: string): Promise<ChallengeResponse> {
  return request(`/auth/challenge?wallet_address=${encodeURIComponent(walletAddress)}`);
}

export function login(walletAddress: string, signature: string, nonce: string): Promise<LoginResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ wallet_address: walletAddress, signature, nonce }),
  });
}

// ── Patients ─────────────────────────────────────────────────────────────────

export interface PatientResponse {
  id: string;
  name: string;
  email: string;
  wallet_address: string;
  public_key: string;
  created_at: string;
}

export function createPatient(data: {
  name: string;
  email: string;
  wallet_address: string;
  public_key: string;
}): Promise<PatientResponse> {
  return request('/patients', { method: 'POST', body: JSON.stringify(data) });
}

export function getPatient(patientId: string): Promise<PatientResponse> {
  return request(`/patients/${patientId}`);
}

export function getPatients(): Promise<PatientResponse[]> {
  return request('/patients');
}

export function getPatientByWallet(walletAddress: string): Promise<PatientResponse> {
  return request(`/patients/by-wallet/${encodeURIComponent(walletAddress)}`);
}

// ── Doctors ──────────────────────────────────────────────────────────────────

export interface DoctorResponse {
  id: string;
  name: string;
  email: string;
  wallet_address: string;
  public_key: string;
  specialty: string | null;
  created_at: string;
}

export function createDoctor(data: {
  name: string;
  email: string;
  wallet_address: string;
  public_key: string;
  specialty?: string;
}): Promise<DoctorResponse> {
  return request('/doctors', { method: 'POST', body: JSON.stringify(data) });
}

export function getDoctor(doctorId: string): Promise<DoctorResponse> {
  return request(`/doctors/${doctorId}`);
}

export function getDoctors(search?: string): Promise<DoctorResponse[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/doctors${q}`);
}

export function getDoctorByWallet(walletAddress: string): Promise<DoctorResponse> {
  return request(`/doctors/by-wallet/${encodeURIComponent(walletAddress)}`);
}

// ── Records ──────────────────────────────────────────────────────────────────

export interface RecordMetadata {
  filename: string;
  file_type: string;
  size_bytes: number;
  category: string;
  description: string | null;
}

export interface RecordResponse {
  id: string;
  patient_id: string;
  metadata: RecordMetadata;
  encrypted_master_key: string;
  created_at: string;
}

export function getRecords(
  patientId: string,
  sharedWithDoctorId?: string,
): Promise<RecordResponse[]> {
  const q =
    sharedWithDoctorId !== undefined
      ? `?shared_with=${encodeURIComponent(sharedWithDoctorId)}`
      : '';
  return request(`/patients/${patientId}/records${q}`);
}

export function getRecord(patientId: string, recordId: string): Promise<RecordResponse> {
  return request(`/patients/${patientId}/records/${recordId}`);
}

export async function getRecordFile(patientId: string, recordId: string): Promise<ArrayBuffer> {
  const headers: Record<string, string> = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${BASE_URL}/patients/${patientId}/records/${recordId}/file`, { headers });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.arrayBuffer();
}

export function uploadRecord(
  patientId: string,
  metadata: RecordMetadata,
  encryptedMasterKey: string,
  encryptedFile: Uint8Array,
): Promise<RecordResponse> {
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('encrypted_master_key', encryptedMasterKey);
  formData.append('file', new Blob([encryptedFile.buffer as ArrayBuffer]), metadata.filename);

  return request(`/patients/${patientId}/records`, {
    method: 'POST',
    body: formData,
  });
}

// ── Invites ──────────────────────────────────────────────────────────────────

export interface InviteResponse {
  id: string;
  from_id: string;
  to_id: string;
  from_role: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  // enriched fields from backend
  from_name?: string;
  to_name?: string;
}

export function getInvites(status?: string): Promise<InviteResponse[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/invites${q}`);
}

export function createInvite(toWalletAddress: string): Promise<InviteResponse> {
  return request('/invites', {
    method: 'POST',
    body: JSON.stringify({ to_wallet_address: toWalletAddress }),
  });
}

export function updateInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<InviteResponse> {
  return request(`/invites/${inviteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ── Permissions ──────────────────────────────────────────────────────────────

export interface PermissionResponse {
  doctor_id: string;
  doctor_name: string;
  granted_at: string;
}

export function getRecordPermissions(patientId: string, recordId: string): Promise<PermissionResponse[]> {
  return request(`/patients/${patientId}/records/${recordId}/permissions`);
}

export function createPermission(patientId: string, recordId: string, doctorId: string): Promise<PermissionResponse> {
  return request(`/patients/${patientId}/records/${recordId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ doctor_id: doctorId }),
  });
}
