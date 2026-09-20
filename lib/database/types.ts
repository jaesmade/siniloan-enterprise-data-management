export type AccountStatus = "pending" | "active" | "rejected" | "suspended";
export type AppRole = "dpo" | "data_steward" | "staff";
export type AccessMode = "read_only" | "read_write";
export type DatasetSlug = "jobseeker_registry" | "research_requests" | "biometric_events";

export interface CurrentPrincipal {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: AppRole;
  status: AccountStatus;
  departmentId: string | null;
}

export interface DatasetGrant {
  datasetId: string;
  datasetSlug: DatasetSlug;
  accessMode: AccessMode;
  departmentScopeId: string | null;
}
