/**
 * Complaint management: the calls and the shapes of the server's answers (backend/app/routes/complaints.py,
 * docs/01-system/COMPLAINT_MANAGEMENT.md). Times are the server's local wall-clock text; screens convert them with fromServer.
 */
import { httpGet, httpPost } from '../../live/http';

export type StepKind = 'letter_1' | 'letter_2' | 'summons' | 'fine' | 'meeting';
export type StepAction = 'prepare' | 'issue' | 'deliver' | 'attendance' | 'reschedule' | 'impose' | 'pay' | 'arrange' | 'meeting';
export type EvidenceId = 'registry' | 'photos' | 'markings' | 'cctv' | 'firsthand' | 'interactions' | 'statement' | 'vet';

export interface ApiRespondent { respondent_id: number; user_id: number | null; name: string; address: string; has_account: boolean }
export interface ApiSuspect { name: string | null; address: string | null; details: string | null }
export interface ApiStepEvent { event_id: number; kind: string; occurred_at: string; details: Record<string, unknown>; recorded_by: string | null; recorded_at: string }
export interface ApiStep {
  step_id: number; kind: StepKind; label: string; state: string; due_at: string | null;
  details: Record<string, unknown>; referral_id: number | null; events: ApiStepEvent[];
}
export interface ApiOffense {
  offense_id: number; report_id: number; respondent_id: number; policy_id: string; policy_title: string; policy_reference: string | null;
  counted: boolean; number: number | null; incident_at: string; note: string | null; confirmed_at: string; confirmed_by: string | null;
  voided_at: string | null; voided_by: string | null; void_reason: string | null;
}
export interface ApiHistory {
  respondent: ApiRespondent | null; policy_id: string; policy_title: string | null; count_window_days: number | null;
  counted: (ApiOffense & { steps: { kind: StepKind; label: string; state: string }[] })[];
  pending: { report_id: number; incident_at: string; suggestion: number }[];
  not_counted: { report_id: number; why: string; kind: string; at: string | null }[];
}
export interface ApiRule {
  policy_id: string; title: string | null; reference: string | null; summary: string | null; confirmed: boolean;
  fine_amount: number | null; count_window_days: number | null;
}
export interface ApiComplaint {
  report_id: number; seen_at: string | null; incident_at: string;
  suspect: ApiSuspect | null;
  incident: { status: string; basis: string | null; at: string | null; by: string | null };
  rule: ApiRule | null; no_rule: boolean;
  respondent: (ApiRespondent & { evidence: EvidenceId[]; note: string | null; at: string | null; by: string | null }) | null;
  check: { note: string; at: string | null; by: string | null } | null;
  ruled_out: { key: string; label: string; reason: string | null; at: string | null; by: string | null }[];
  offense: ApiOffense | null;
  steps: ApiStep[];
  corrections: (ApiOffense & { respondent: ApiRespondent | null; steps: ApiStep[] })[];
  suggestion: number | null;
  stage_steps: { kind: StepKind; label: string }[];
  history: ApiHistory | null;
  maybe_same: { report_id: number; created_at: string; seen_at: string | null; incident_at: string; landmark: string | null; description: string | null; reporter: string | null } | null;
  same_as: { report_id: number; linked_at: string; note: string | null } | null;
  also_reported: { report_id: number; linked_at: string }[];
  separate_from: { report_id: number; at: string | null; by: string | null } | null;
  subdivision_name: string | null;
}
export interface ApiWorkspaceItem {
  report_id: number; incident: string; incident_at: string;
  rule: { policy_id: string; title: string | null } | null; no_rule: boolean;
  respondent: ApiRespondent | null; suspect: ApiSuspect | null; checking: boolean;
  offense: { counted: boolean; number: number | null; confirmed_at: string } | null;
  suggestion: number | null;
  steps: { step_id: number; kind: StepKind; state: string; due_at: string | null }[];
  maybe_same: number | null; same_as: number | null; closed: boolean;
}
export interface ApiPersonRow extends ApiRespondent {
  rules: { policy_id: string; title: string | null; counted: number; pending: number; corrected: number; not_counted: number }[];
}
export interface ApiWorkspace { items: ApiWorkspaceItem[]; people: ApiPersonRow[] }
export interface ApiPersonPage { respondent: ApiRespondent | null; first_confirmed_at: string | null; rules: ApiHistory[] }

export interface PersonLead { key: string; user_id: number | null; respondent_id: number | null; name: string; address: string; why: string[] }
export interface PetLead {
  key: string; pet_id: number; pet_name: string; pet_type: string; breed: string | null; colour: string | null; size: string | null; photo_url: string | null;
  owner_user_id: number; owner_name: string; owner_address: string; why: string[];
}
export interface EarlierLead extends PersonLead { report_ids: number[] }
export interface ApiLeads { suggestion: PersonLead[]; registry: PetLead[]; earlier: EarlierLead[]; ruled_out: ApiComplaint['ruled_out'] }

export interface RuledOutIn { key: string; label: string; reason?: string | null }
export interface ResponsibleIn {
  mode: 'user' | 'household' | 'new' | 'none'; user_id?: number; respondent_id?: number; name?: string; address?: string;
  evidence?: EvidenceId[]; note?: string; check_note?: string; ruled_out?: RuledOutIn[]; correction_reason?: string;
}

export const complaintsApi = {
  workspace: () => httpGet<ApiWorkspace>('/complaints'),
  detail: (id: number) => httpGet<ApiComplaint>(`/complaints/${id}`),
  leads: (id: number, skip?: number | null) => httpGet<ApiLeads>(`/complaints/${id}/leads`, skip ? { skip_respondent_id: skip } : undefined),
  person: (respondentId: number) => httpGet<ApiPersonPage>(`/complaints/people/${respondentId}`),
  verify: (id: number, body: { incident: 'verified' | 'unverified' | 'not_reviewed'; basis: string; policy_id?: string | null; no_rule?: boolean }) =>
    httpPost<ApiComplaint>(`/complaints/${id}/verify`, body),
  responsible: (id: number, body: ResponsibleIn) => httpPost<ApiComplaint>(`/complaints/${id}/responsible`, body),
  offense: (id: number, body: { decision: 'counted' | 'not_counted'; expected_number?: number; reason?: string }) =>
    httpPost<ApiComplaint>(`/complaints/${id}/offense`, body),
  sameOccurrence: (id: number, body: { other_report_id: number; decision: 'same' | 'separate'; note?: string }) =>
    httpPost<ApiComplaint>(`/complaints/${id}/same-occurrence`, body),
  step: (id: number, stepId: number, body: Record<string, unknown> & { action: StepAction }) =>
    httpPost<ApiComplaint>(`/complaints/${id}/steps/${stepId}`, body),
};
