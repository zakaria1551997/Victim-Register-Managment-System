import {
  UserRoleCode,
  PermissionCode,
  WorkflowStatus,
  CompletionStatus,
} from './utils/registerRules';

export interface AttachmentItem {
  id: string;
  recordId: string;
  category: 'APPLICATION' | 'OTHER_INFO' | 'ENTRY_BOOK' | 'TEST_REPORT';
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  uploadedByNameBn: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deleteReason?: string;
  createdAt: string;
}

export interface ReviewHistoryItem {
  id: number;
  record_id: string;
  action_type: string;
  from_status: WorkflowStatus;
  to_status: WorkflowStatus;
  actor_id: string;
  actor_name_bn: string;
  actor_role_bn: string;
  comment_bn: string;
  created_at: string;
}

export interface RecordRevisionItem {
  id: number;
  record_id: string;
  revision_no: number;
  changed_by: string;
  changed_by_name_bn: string;
  change_reason_bn: string;
  previous_snapshot_json: string;
  new_snapshot_json: string;
  changed_fields_json: string;
  was_approved_before_edit: boolean;
  created_at: string;
}

export interface InjuryRecord {
  id: string;
  registrationNo: string;
  registrationDate: string;
  injuredName: string;
  injuredAge: string;
  fatherOrGuardianName: string;
  injuredAddress: string;
  doctorName: string;
  doctorDesignation: string;
  doctorEntryNotFound: boolean;
  additionalRegNo: string;
  additionalRegDate: string;
  signatureNo: string;
  signatureDate: string;
  policeStationName: string;
  policeCaseNo: string;
  policeCaseDate: string;
  courtCaseNo: string;
  courtCaseDate: string;
  mcDispatchDate: string;
  requiredTestReports: string;
  recommenderInfo: string;
  applicationAttachmentNote: string;
  otherAttachmentNote: string;
  entryBookAttachmentNote: string;
  confidentialityLevel: string;
  remarks: string;
  completionStatus: CompletionStatus;
  workflowStatus: WorkflowStatus;
  revisionCount: number;
  createdBy: string;
  createdByNameBn: string;
  verifiedBy?: string | null;
  verifiedByNameBn?: string | null;
  verifiedAt?: string | null;
  approvedBy?: string | null;
  approvedByNameBn?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentItem[];
  allAttachmentsWithHistory?: any[];
  reviewHistory?: ReviewHistoryItem[];
  revisions?: RecordRevisionItem[];
}

export interface UserSession {
  id: string;
  username: string;
  fullNameBn: string;
  designationBn: string;
  departmentBn: string;
  phone: string;
  roleCode: UserRoleCode;
  roleNameBn: string;
  permissions: PermissionCode[];
}

export interface DashboardSummary {
  totalRecords: number;
  todayNewRecords: number;
  pendingVerification: number;
  pendingApproval: number;
  approvedRecords: number;
  incompleteRecords: number;
  completeRecords: number;
  returnedRecords: number;
  draftRecords: number;
  recentActivities: Array<{
    id: number;
    actorNameBn: string;
    actorRoleBn: string;
    actionCode: string;
    targetRecordId?: string;
    targetRegistrationNo?: string;
    descriptionBn: string;
    createdAt: string;
  }>;
}
